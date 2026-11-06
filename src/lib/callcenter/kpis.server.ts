import "server-only";
/**
 * Agent figures from the timeline (P4 CALL CENTER; operations.md OPE-§14.3, §14.4, OD17, OD46, OD53, OD54; core §I.5).
 *
 *   computeAgentDays   the per-(agent, store-local day) counts of OPE-§14.3, from one grouped read of `order_events`
 *                      (`oe_type_idx`), one grouped read of `orders` per confirmer column (`orders_confirmer_idx` range
 *                      on final_at / shipped_at), the first-touch rows and the claim → outcome pairs. Attribution: the
 *                      actor of the move; a sheet confirmation counts for the member its label is mapped to
 *                      (`confirmed_by`, OD54), an unmapped label for nobody here; late finals land on the confirming
 *                      agent's row of the day they happen; lease expiries on the previous holder (OD46).
 *   rollupAgentStats   `ops.rollup` (nightly): the last 14 complete store-local days rewritten in one transaction, so
 *                      the table always equals a recompute from the events (deleting a day and re-running restores it)
 *   agentsToday        the board's agents table: today so far, live, 60 s (`scopedCache("ops-kpis")`)
 *   agentPeriodKpis    the agents screen's 7- and 28-day KPIs with their n, live, 60 s
 *
 * Test and honeypot orders never count. The clock is `opsNow()`.
 */
import { and, count, countDistinct, eq, gte, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { agentStatsDaily, orderEvents, orders } from "@/lib/db/schema";
import { scopedCache } from "@/lib/tenancy/cache";
import { inStore, storeValues, whereStore } from "@/lib/tenancy/sql";
import type { StoreScope, WriteScope } from "@/lib/tenancy/types";
import { dayBounds, dayCase, notHoneypot, spanOf, storeTz, trailingDays, type DayBound } from "./insights-sql";
import { abandonedRate, attemptsPerConfirmation, confirmationRate, deliveryRate, firstTouchP50, handlingTimeP50, inboundShare, skipRate, type Kpi } from "./kpis";
import { opsNow } from "./presence";
import { addDaysYmd, storeYmd, windowMinutesBetween, type EffectiveWindow } from "./window";
import { callingWindowFor } from "./window.server";

/** the decided confirmation states (OPE-§14.3 "Decided") */
export const DECIDED_STATES = ["confirmed", "cancelled", "unreachable", "fake", "duplicate"] as const;
const FINAL_SHIP = ["delivered", "refused", "returned", "lost"] as const;
/** a claim older than this before its outcome is not a handling time (a tab left open overnight) */
const HANDLING_MAX_MS = 2 * 3_600_000;
export const ROLLUP_DAYS = 14;

export interface AgentDayStats {
  userId: string;
  day: string;
  worked: number;
  decided: number;
  confirmed: number;
  cancelled: number;
  fake: number;
  duplicates: number;
  unreachable: number;
  callbacks: number;
  attempts: number;
  reveals: number;
  abandoned: number;
  claimed: number;
  skipped: number;
  /** decisions on an inbound call (OD53) */
  inbound: number;
  shipped: number;
  delivered: number;
  refused: number;
  returned: number;
  lost: number;
  /** window minutes of each first touch the agent made that day */
  firstTouchMin: number[];
  /** ms of each claim → outcome */
  handlingMs: number[];
}

const blank = (userId: string, day: string): AgentDayStats => ({
  userId,
  day,
  worked: 0,
  decided: 0,
  confirmed: 0,
  cancelled: 0,
  fake: 0,
  duplicates: 0,
  unreachable: 0,
  callbacks: 0,
  attempts: 0,
  reveals: 0,
  abandoned: 0,
  claimed: 0,
  skipped: 0,
  inbound: 0,
  shipped: 0,
  delivered: 0,
  refused: 0,
  returned: 0,
  lost: 0,
  firstTouchMin: [],
  handlingMs: [],
});

/** the order is real: not a test, not a honeypot (core D54, OPE-§10.2) */
const realOrder = and(eq(orders.isTest, false), notHoneypot)!;

/** The figures of every agent for each of `days` (see the header). */
export async function computeAgentDays(scope: StoreScope, days: readonly DayBound[], w: EffectiveWindow): Promise<AgentDayStats[]> {
  if (!days.length) return [];
  const { from, to } = spanOf(days);
  const out = new Map<string, AgentDayStats>();
  const row = (uid: string | null, day: string | null): AgentDayStats | null => {
    if (!uid || !day) return null;
    const k = `${uid}|${day}`;
    let r = out.get(k);
    if (!r) out.set(k, (r = blank(uid, day)));
    return r;
  };
  const joinOrder = and(inStore(orders, scope), eq(orders.id, orderEvents.orderId));
  // OD54: a sheet confirmation counts for the member its label is mapped to (confirmed_by), nobody else's move does
  const actor = sql<string | null>`COALESCE(${orderEvents.actorId}, IF(${orderEvents.actorKind} = 'sheet' AND ${orderEvents.toState} = 'confirmed', ${orders.confirmedBy}, NULL))`;
  const evDay = dayCase(orderEvents.at, days);
  const inbound = sql<number>`SUM(JSON_VALUE(${orderEvents.meta}, '$.inbound') = 'true')`;

  const [events, worked, firsts, handling, shipped, finals] = await Promise.all([
    db
      .select({ uid: actor.as("uid"), day: evDay.as("d"), type: orderEvents.type, to: orderEvents.toState, reason: orderEvents.reasonCode, n: count().as("n"), inbound: inbound.as("ib") })
      .from(orderEvents)
      .innerJoin(orders, joinOrder)
      .where(
        whereStore(
          orderEvents,
          scope,
          inArray(orderEvents.type, ["state_changed", "call_attempt", "phone_revealed", "released", "claimed"]),
          inArray(orderEvents.actorKind, ["user", "sheet"]),
          gte(orderEvents.at, from),
          lt(orderEvents.at, to),
          realOrder,
        ),
      )
      .groupBy(sql.raw("uid"), sql.raw("d"), orderEvents.type, orderEvents.toState, orderEvents.reasonCode),
    db
      .select({ uid: sql<string>`${orderEvents.actorId}`.as("uid"), day: evDay.as("d"), n: countDistinct(orderEvents.orderId).as("n") })
      .from(orderEvents)
      .innerJoin(orders, joinOrder)
      .where(whereStore(orderEvents, scope, inArray(orderEvents.type, ["call_attempt", "state_changed"]), eq(orderEvents.actorKind, "user"), isNotNull(orderEvents.actorId), gte(orderEvents.at, from), lt(orderEvents.at, to), realOrder))
      .groupBy(sql.raw("uid"), sql.raw("d")),
    // the first touches of the period and the agent of each first attempt
    db
      .select({
        createdAt: orders.createdAt,
        touchedAt: orders.firstTouchAt,
        uid: sql<string | null>`(SELECT e.actor_id FROM order_events e WHERE e.store_id = ${orders.storeId} AND e.order_id = ${orders.id} AND e.type = 'call_attempt' ORDER BY e.at, e.id LIMIT 1)`,
      })
      .from(orders)
      .where(whereStore(orders, scope, gte(orders.firstTouchAt, from), lt(orders.firstTouchAt, to), gte(orders.createdAt, new Date(from.getTime() - 30 * 86_400_000)), realOrder)),
    // each outcome and the claim it closed (the same agent's latest claim of that order before it)
    db
      .select({
        uid: orderEvents.actorId,
        at: orderEvents.at,
        claimedAt: sql<Date | string | null>`(SELECT MAX(c.at) FROM order_events c WHERE c.store_id = ${orderEvents.storeId} AND c.order_id = ${orderEvents.orderId} AND c.type = 'claimed' AND c.actor_id = ${orderEvents.actorId} AND c.at <= ${orderEvents.at})`,
      })
      .from(orderEvents)
      .innerJoin(orders, joinOrder)
      .where(whereStore(orderEvents, scope, eq(orderEvents.type, "call_attempt"), eq(orderEvents.actorKind, "user"), isNotNull(orderEvents.actorId), gte(orderEvents.at, from), lt(orderEvents.at, to), realOrder)),
    db
      .select({ uid: sql<string>`${orders.confirmedBy}`.as("uid"), day: dayCase(orders.shippedAt, days).as("d"), n: count().as("n") })
      .from(orders)
      .where(whereStore(orders, scope, isNotNull(orders.confirmedBy), gte(orders.shippedAt, from), lt(orders.shippedAt, to), realOrder))
      .groupBy(sql.raw("uid"), sql.raw("d")),
    db
      .select({ uid: sql<string>`${orders.confirmedBy}`.as("uid"), day: dayCase(orders.finalAt, days).as("d"), ship: orders.shipState, n: count().as("n") })
      .from(orders)
      .where(whereStore(orders, scope, isNotNull(orders.confirmedBy), gte(orders.finalAt, from), lt(orders.finalAt, to), inArray(orders.shipState, [...FINAL_SHIP]), realOrder))
      .groupBy(sql.raw("uid"), sql.raw("d"), orders.shipState),
  ]);

  for (const e of events) {
    const r = row(e.uid, e.day);
    if (!r) continue;
    const n = Number(e.n ?? 0);
    switch (e.type) {
      case "call_attempt":
        r.attempts += n;
        break;
      case "phone_revealed":
        r.reveals += n;
        break;
      case "claimed":
        r.claimed += n;
        break;
      case "released":
        if (e.reason === "lease_expired") r.abandoned += n;
        else if (e.reason === "skip") r.skipped += n;
        break;
      case "state_changed": {
        const to = e.to ?? "";
        if (to === "callback") r.callbacks += n;
        if (!(DECIDED_STATES as readonly string[]).includes(to)) break;
        r.decided += n;
        r.inbound += Number(e.inbound ?? 0);
        if (to === "confirmed") r.confirmed += n;
        else if (to === "cancelled") r.cancelled += n;
        else if (to === "unreachable") r.unreachable += n;
        else if (to === "fake") r.fake += n;
        else if (to === "duplicate") r.duplicates += n;
        break;
      }
    }
  }
  for (const x of worked) {
    const r = row(x.uid, x.day);
    if (r) r.worked = Number(x.n ?? 0);
  }
  const tz = w.tz;
  for (const f of firsts) {
    if (!f.touchedAt) continue;
    const r = row(f.uid, storeYmd(f.touchedAt, tz));
    if (r) r.firstTouchMin.push(windowMinutesBetween(f.createdAt, f.touchedAt, w));
  }
  for (const h of handling) {
    if (!h.claimedAt) continue;
    const claimed = h.claimedAt instanceof Date ? h.claimedAt : new Date(`${String(h.claimedAt).replace(" ", "T")}Z`);
    const ms = h.at.getTime() - claimed.getTime();
    if (!(ms >= 0 && ms <= HANDLING_MAX_MS)) continue;
    const r = row(h.uid, storeYmd(h.at, tz));
    if (r) r.handlingMs.push(ms);
  }
  for (const s of shipped) {
    const r = row(s.uid, s.day);
    if (r) r.shipped += Number(s.n ?? 0);
  }
  for (const f of finals) {
    const r = row(f.uid, f.day);
    if (!r) continue;
    const n = Number(f.n ?? 0);
    if (f.ship === "delivered") r.delivered += n;
    else if (f.ship === "refused") r.refused += n;
    else if (f.ship === "returned") r.returned += n;
    else if (f.ship === "lost") r.lost += n;
  }
  return [...out.values()].sort((a, b) => a.day.localeCompare(b.day) || a.userId.localeCompare(b.userId));
}

/** The `agent_stats_daily` row of one computed day (R2 columns stay 0 until their writers exist). */
function tableRow(s: AgentDayStats) {
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  return {
    userId: s.userId,
    day: s.day,
    worked: s.worked,
    confirmed: s.confirmed,
    cancelled: s.cancelled,
    fake: s.fake,
    duplicates: s.duplicates,
    attempts: s.attempts,
    reveals: s.reveals,
    firstTouchMsSum: sum(s.firstTouchMin) * 60_000,
    firstTouchN: s.firstTouchMin.length,
    handlingMsSum: sum(s.handlingMs),
    shipped: s.shipped,
    delivered: s.delivered,
    refused: s.refused,
    returned: s.returned,
    decided: s.decided,
    unreachable: s.unreachable,
    callbacks: s.callbacks,
    lost: s.lost,
    abandoned: s.abandoned,
  };
}

/**
 * `ops.rollup` (OPE-§14.4): the last `days` complete store-local days (yesterday back) recomputed and written in one
 * transaction (the rows of those days replaced), so the table equals a recompute from the events. Answers the rows
 * written.
 */
export async function rollupAgentStats(scope: WriteScope, days = ROLLUP_DAYS): Promise<{ rows: number; from: string; to: string }> {
  const n = Math.max(1, Math.min(90, Math.floor(days)));
  const w = await callingWindowFor(scope);
  const today = storeYmd(opsNow(), w.tz);
  const fromYmd = addDaysYmd(today, -n);
  const toYmd = addDaysYmd(today, -1);
  const bounds = dayBounds(w.tz, fromYmd, toYmd);
  const stats = await computeAgentDays(scope, bounds, w);
  const rows = stats.map(tableRow).filter((r) => Object.entries(r).some(([k, v]) => k !== "userId" && k !== "day" && v !== 0));
  await db.transaction(async (tx) => {
    await tx.delete(agentStatsDaily).where(whereStore(agentStatsDaily, scope, gte(agentStatsDaily.day, fromYmd), sql`${agentStatsDaily.day} <= ${toYmd}`));
    for (let i = 0; i < rows.length; i += 200) {
      await tx.insert(agentStatsDaily).values(rows.slice(i, i + 200).map((r) => storeValues(scope, r)));
    }
  });
  agentsCache.delete(scope.storeId);
  return { rows: rows.length, from: fromYmd, to: toYmd };
}

/* ------------------------------------------------------------------ */
/* live figures                                                        */
/* ------------------------------------------------------------------ */

const agentsCache = scopedCache<AgentDayStats[]>({ name: "ops-kpis-agents", maxEntries: 4_000, ttlMs: 60_000 });

/** Every agent's figures of today so far (store-local day), 60 s. */
export async function agentsToday(scope: StoreScope): Promise<AgentDayStats[]> {
  const now = opsNow();
  const tz = await storeTz(scope);
  const today = storeYmd(now, tz);
  return agentsCache.getOrLoad(scope.storeId, `today:${today}`, async () => computeAgentDays(scope, trailingDays(tz, now, 1), await callingWindowFor(scope)));
}

/** One agent's KPIs over a period, each with its n (OD17: 20 per agent). */
export interface AgentPeriodKpis {
  userId: string;
  days: number;
  decided: number;
  confirmed: number;
  attempts: number;
  abandoned: number;
  confirmationRate: Kpi;
  deliveryRate: Kpi;
  firstTouchP50Min: Kpi;
  attemptsPerConfirmation: Kpi;
  handlingP50Sec: Kpi;
  abandonedRate: Kpi;
  skipRate: Kpi;
  inboundShare: Kpi;
}

const periodCache = scopedCache<AgentPeriodKpis[]>({ name: "ops-kpis-period", maxEntries: 4_000, ttlMs: 60_000 });

/** Sums days of one agent into its period KPIs. */
export function periodKpisOf(userId: string, days: number, list: readonly AgentDayStats[]): AgentPeriodKpis {
  const s = list.reduce((a, d) => {
    for (const k of Object.keys(a) as (keyof typeof a)[]) a[k] += d[k] as number;
    return a;
  }, { decided: 0, confirmed: 0, cancelled: 0, unreachable: 0, attempts: 0, abandoned: 0, skipped: 0, claimed: 0, inbound: 0, delivered: 0, refused: 0, returned: 0, lost: 0 });
  return {
    userId,
    days,
    decided: s.decided,
    confirmed: s.confirmed,
    attempts: s.attempts,
    abandoned: s.abandoned,
    confirmationRate: confirmationRate(s, "agent"),
    deliveryRate: deliveryRate(s, "agent"),
    firstTouchP50Min: firstTouchP50(list.flatMap((d) => d.firstTouchMin), "agent"),
    attemptsPerConfirmation: attemptsPerConfirmation(s, "agent"),
    handlingP50Sec: handlingTimeP50(list.flatMap((d) => d.handlingMs), "agent"),
    abandonedRate: abandonedRate(s, "agent"),
    skipRate: skipRate(s, "agent"),
    inboundShare: inboundShare({ inbound: s.inbound, decisions: s.decided }, "agent"),
  };
}

/** Every agent's KPIs over the last 7 or 28 store-local days (today included), live, 60 s. */
export async function agentPeriodKpis(scope: StoreScope, days: 7 | 28): Promise<AgentPeriodKpis[]> {
  const now = opsNow();
  const tz = await storeTz(scope);
  return periodCache.getOrLoad(scope.storeId, `${days}:${storeYmd(now, tz)}`, async () => {
    const list = await computeAgentDays(scope, trailingDays(tz, now, days), await callingWindowFor(scope));
    const byUser = new Map<string, AgentDayStats[]>();
    for (const d of list) byUser.set(d.userId, [...(byUser.get(d.userId) ?? []), d]);
    return [...byUser.entries()].map(([uid, l]) => periodKpisOf(uid, days, l));
  });
}

/** The stored daily rows of one agent (the agent page's trend), oldest first. */
export async function agentTrend(scope: StoreScope, userId: string, days: 28): Promise<(typeof agentStatsDaily.$inferSelect)[]> {
  const tz = await storeTz(scope);
  const from = addDaysYmd(storeYmd(opsNow(), tz), -days);
  return db
    .select()
    .from(agentStatsDaily)
    .where(whereStore(agentStatsDaily, scope, eq(agentStatsDaily.userId, userId), gte(agentStatsDaily.day, from)))
    .orderBy(agentStatsDaily.day);
}

/** Forget the live figures of a store (tests; a label mapping). */
export function forgetAgentKpis(scope: StoreScope): void {
  agentsCache.delete(scope.storeId);
  periodCache.delete(scope.storeId);
}
