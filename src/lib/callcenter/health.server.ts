import "server-only";
/**
 * The facts behind the ops Store Health rules (P4 CALL CENTER; operations.md OPE-§27.2, OD17, OD46, OD48, OD49, OD54;
 * core §I.7). One read pass per store, counts and `Kpi`s only (never a customer field), test and honeypot orders
 * excluded from every rate, cached 60 s per store. The rules themselves (src/lib/health/rules/ops.ts) are pure
 * functions of these facts, so `test:ops` runs them on in-memory fixtures.
 *
 * P1's `collectHealthInputs` fills `HealthInputs.orders` with `orderKpis` and four counts; the rules here need more
 * (live agents, callbacks, holds, the delivery lane, sheet labels). CCR r1-p4-7 adds `ops?: OpsHealthFacts | null` to
 * `HealthInputs`, filled by this function; until it lands a rule reads the facts itself (cached, so the ten rules of
 * one store share one pass).
 */
import { and, count, eq, gte, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { orderEvents, orders } from "@/lib/db/schema";
import { orderKpis, queueCounts, type Kpi } from "@/lib/orders/profile";
import { getStoreSetting } from "@/lib/settings";
import { scopedCache } from "@/lib/tenancy/cache";
import { inStore, whereStore } from "@/lib/tenancy/sql";
import type { StoreScope } from "@/lib/tenancy/types";
import { notHoneypot } from "./insights-sql";
import { sheetAgents } from "./labels";
import { opsNow } from "./presence";
import { windowMinutesBetween } from "./window";
import { callingWindowFor } from "./window.server";

export interface OpsHealthFacts {
  /** `ops.firstTouchTargetMin` */
  firstTouchTargetMin: number;
  /** first-touch p50 over 28 days, window minutes, with its n */
  firstTouchP50Min28d: Kpi;
  /** new orders without an attempt older than 2 h of window time (now) */
  untouched2h: number;
  liveAgents: number;
  /** orders due in the confirm lane now with no active lease */
  callableNow: number;
  /** window minutes since the oldest of them became due */
  oldestCallableWindowMin: number | null;
  unreachableRate7d: Kpi;
  unreachableRate28d: Kpi;
  claims7d: number;
  abandoned7d: number;
  /** callbacks overdue by more than 60 minutes */
  callbacksOverdue60: number;
  /** confirmed, to_pack / packed, no active hold, confirmed more than 48 h of window time ago */
  toPackAging48h: number;
  /** a hold whose date passed more than 48 h ago, still to_pack / packed */
  holdPassed48h: number;
  /** in the delivery lane (attempt_failed) for more than 4 window hours without a call since */
  rescueWaiting4h: number;
  /** unmapped sheet labels with at least 20 confirmations in 28 days (OD54) */
  unmappedLabels20: number;
}

const MINUTE = 60_000;
const factsCache = scopedCache<OpsHealthFacts>({ name: "ops-health-facts", maxEntries: 4_000, ttlMs: 60_000 });
const realOrder = and(eq(orders.isTest, false), notHoneypot)!;
const asDate = (v: Date | string | null | undefined): Date | null => (v instanceof Date ? v : v ? new Date(`${String(v).replace(" ", "T")}Z`) : null);

/** The facts of one store (see the header); 60 s per store. */
export async function opsHealthFacts(scope: StoreScope): Promise<OpsHealthFacts> {
  return factsCache.getOrLoad(scope.storeId, "facts", () => loadFacts(scope));
}

async function loadFacts(scope: StoreScope): Promise<OpsHealthFacts> {
  const now = opsNow();
  const [w, ops, counts, k7, k28, labels] = await Promise.all([callingWindowFor(scope), getStoreSetting(scope, "ops"), queueCounts(scope), orderKpis(scope, "7d"), orderKpis(scope, "28d"), sheetAgents(scope)]);
  const free = or(isNull(orders.leaseUntil), sql`${orders.leaseUntil} < ${now}`);
  const due = or(isNull(orders.dueAt), lte(orders.dueAt, now));
  const since7 = new Date(now.getTime() - 7 * 86_400_000);
  const [untouched, [callable], claims, [overdue], aging, [held], rescue] = await Promise.all([
    db
      .select({ createdAt: orders.createdAt })
      .from(orders)
      .where(whereStore(orders, scope, eq(orders.confirmState, "new"), isNull(orders.firstTouchAt), lte(orders.createdAt, new Date(now.getTime() - 120 * MINUTE)), realOrder))
      .limit(2_000),
    db
      .select({ n: count(), oldest: sql<Date | string | null>`MIN(COALESCE(${orders.dueAt}, ${orders.createdAt}))` })
      .from(orders)
      .where(whereStore(orders, scope, inArray(orders.confirmState, ["new", "attempting", "callback"]), due, free)),
    db
      .select({ kind: orderEvents.type, reason: orderEvents.reasonCode, n: count() })
      .from(orderEvents)
      .innerJoin(orders, and(inStore(orders, scope), eq(orders.id, orderEvents.orderId)))
      .where(whereStore(orderEvents, scope, inArray(orderEvents.type, ["claimed", "released"]), gte(orderEvents.at, since7), realOrder))
      .groupBy(orderEvents.type, orderEvents.reasonCode),
    db
      .select({ n: count() })
      .from(orders)
      .where(whereStore(orders, scope, eq(orders.confirmState, "callback"), lte(orders.dueAt, new Date(now.getTime() - 60 * MINUTE)))),
    db
      .select({ confirmedAt: orders.confirmedAt })
      .from(orders)
      .where(
        whereStore(
          orders,
          scope,
          eq(orders.confirmState, "confirmed"),
          inArray(orders.shipState, ["to_pack", "packed"]),
          or(isNull(orders.shipAfter), lte(orders.shipAfter, now)),
          isNotNull(orders.confirmedAt),
          lte(orders.confirmedAt, new Date(now.getTime() - 48 * 60 * MINUTE)),
        ),
      )
      .limit(2_000),
    db
      .select({ n: count() })
      .from(orders)
      .where(whereStore(orders, scope, inArray(orders.shipState, ["to_pack", "packed"]), isNotNull(orders.shipAfter), lte(orders.shipAfter, new Date(now.getTime() - 48 * 60 * MINUTE)))),
    db
      .select({
        failedAt: sql<Date | string | null>`(SELECT MAX(e.at) FROM order_events e WHERE e.store_id = ${orders.storeId} AND e.order_id = ${orders.id} AND e.type = 'state_changed' AND e.to_state = 'attempt_failed')`,
        calledAt: sql<Date | string | null>`(SELECT MAX(c.at) FROM order_events c WHERE c.store_id = ${orders.storeId} AND c.order_id = ${orders.id} AND c.type = 'call_attempt')`,
      })
      .from(orders)
      .where(whereStore(orders, scope, eq(orders.confirmState, "confirmed"), eq(orders.shipState, "attempt_failed")))
      .limit(500),
  ]);
  let claimed = 0;
  let abandoned = 0;
  for (const c of claims) {
    if (c.kind === "claimed") claimed += Number(c.n);
    else if (c.reason === "lease_expired") abandoned += Number(c.n);
  }
  const oldest = asDate(callable?.oldest);
  return {
    firstTouchTargetMin: ops.firstTouchTargetMin,
    firstTouchP50Min28d: k28.firstTouchP50Min,
    untouched2h: untouched.filter((u) => windowMinutesBetween(u.createdAt, now, w) > 120).length,
    liveAgents: counts.liveAgents,
    callableNow: Number(callable?.n ?? 0),
    oldestCallableWindowMin: oldest ? windowMinutesBetween(oldest, now, w) : null,
    unreachableRate7d: k7.unreachableRate,
    unreachableRate28d: k28.unreachableRate,
    claims7d: claimed,
    abandoned7d: abandoned,
    callbacksOverdue60: Number(overdue?.n ?? 0),
    toPackAging48h: aging.filter((a) => a.confirmedAt && windowMinutesBetween(a.confirmedAt, now, w) > 48 * 60).length,
    holdPassed48h: Number(held?.n ?? 0),
    rescueWaiting4h: rescue.filter((r) => {
      const failed = asDate(r.failedAt);
      const called = asDate(r.calledAt);
      return !!failed && (!called || called.getTime() < failed.getTime()) && windowMinutesBetween(failed, now, w) > 240;
    }).length,
    unmappedLabels20: labels.filter((l) => l.confirmed >= 20).length,
  };
}

/** Forget the cached facts of a store (tests). */
export function forgetOpsHealthFacts(scope: StoreScope): void {
  factsCache.delete(scope.storeId);
}
