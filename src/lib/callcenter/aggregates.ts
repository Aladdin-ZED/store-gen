import "server-only";
/**
 * Deterministic aggregates for insights and learners (P4 CALL CENTER; operations.md OPE-§27.6, OD39, OD43, OD44;
 * docs/STORE-SAAS.md §K.2 P0, rev 2.1): the Today brief (P2) and the Campaign Kit by-angle table (P3) read them, the
 * R3 digest and best-time learner too. Store-local days, cells under 5 orders suppressed, test and honeypot orders
 * excluded, no customer field in any cell; city keys are `CityKey` slugs and an order without one counts under "*".
 *
 *   attemptStats        (OD44) call attempts of the trailing 90 days per store-local (ISO weekday, hour), raw counts:
 *                       contacted = an outcome other than no_answer, busy, switched_off. Both lanes count (a rescue
 *                       call is a call). One grouped read on `oe_type_idx` in 15-minute UTC slots, mapped to the
 *                       store's wall clock here (every real UTC offset is a multiple of 15 minutes, so the mapping is
 *                       exact through DST and Ramadan shifts). Cached 1 h per store (`ops-attempts`): every UI applies
 *                       the n ≥ 30 rule before it shows a rate, and the card reads it on every Next.
 *   riskBandOutcomes    (OD39) per risk band (check 50-69, high ≥ 70), the decided orders created in the trailing 90
 *                       days and how many ended fake, cancelled or unreachable; null below 30 decided. "Decided" =
 *                       confirmed, cancelled, fake, unreachable: a duplicate is a copy of another order whose own
 *                       outcome already counts, so it is left out of both sides. One grouped read on
 *                       `orders_store_created_idx`; cached 1 h per store (`ops-risk-cal`).
 *
 * `opsAggregates` is still P0's stub (empty cells, `suppressed: 0`): P4 step 7 fills it, with `cancelReasonMix` and
 * `returnReasonMix`. The clock is `opsNow()`, so the DB-backed suite drives the windows with a fake clock.
 */
import { and, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { orderEvents, orders } from "@/lib/db/schema";
import type { Kpi } from "@/lib/orders/profile";
import { scopedCache } from "@/lib/tenancy/cache";
import { getStoreById } from "@/lib/tenancy/public";
import { inStore, whereStore } from "@/lib/tenancy/sql";
import type { StoreScope } from "@/lib/tenancy/types";
import { opsNow } from "./presence";
import { isoWeekday, storeHour } from "./window";

/** YYYY-MM-DD, store-local */
export type ISODate = string;
export type AggDim = "page" | "city" | "source" | "agent" | "offer" | "campaign" /* utm_campaign */ | "angle" /* utm_content */ | "carrier" /* R2 */ | "hour" | "weekday";
export const AGG_DIMS: readonly AggDim[] = ["page", "city", "source", "agent", "offer", "campaign", "angle", "carrier", "hour", "weekday"];

export interface AggCell {
  key: string;
  placed: number;
  confirmed: number;
  delivered: number;
  refused: number;
  cancelled: number;
  unreachable: number;
  fake: number;
  n: number;
  confirmationRate: Kpi;
  deliveryRate: Kpi;
  delta?: { prevPlaced: number; prevDeliveryRate: Kpi };
}

/** One grouped query per dimension; cached 5 min per (store, query hash); ≤ 400 ms on 50,000 orders. */
export async function opsAggregates(
  scope: StoreScope,
  q: { from: ISODate; to: ISODate; dims: AggDim[]; compareWith?: "previous" },
): Promise<{ cells: Record<AggDim, AggCell[]>; suppressed: number /* cells under 5 orders */; computedAt: string }> {
  void scope;
  void q;
  const cells = Object.fromEntries(AGG_DIMS.map((d) => [d, [] as AggCell[]])) as Record<AggDim, AggCell[]>;
  return { cells, suppressed: 0, computedAt: new Date().toISOString() };
}

/* ------------------------------------------------------------------ */
/* shared                                                              */
/* ------------------------------------------------------------------ */

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const WINDOW_DAYS = 90;
/** OD39, OD44: a rate is shown only from this many orders or attempts */
export const MIN_N = 30;
/** the outcomes that reached nobody (OD44) */
const NO_CONTACT = ["no_answer", "busy", "switched_off"] as const;

/** honeypot rows never count (OPE-§10.2); the creation hook marks them in `flags` */
const notHoneypot = or(isNull(orders.flags), sql`${orders.flags} NOT LIKE '%"honeypot"%'`);

async function storeTz(scope: StoreScope): Promise<string> {
  return (await getStoreById(scope.storeId))?.timezone || "Africa/Casablanca";
}

/* ------------------------------------------------------------------ */
/* attemptStats (OD44)                                                 */
/* ------------------------------------------------------------------ */

export interface AttemptCell {
  weekday: number;
  hour: number;
  attempts: number;
  contacted: number;
}

const attemptsCache = scopedCache<AttemptCell[]>({ name: "ops-attempts", maxEntries: 4_000, ttlMs: HOUR_MS });
/** the slot width in minutes (written into the SQL text: the SELECT and the GROUP BY must be the same expression) */
const SLOT_MIN = 15;

/** OD44: raw counts per (weekday, hour), contacted = outcome ∉ {no_answer, busy, switched_off}; every UI applies n ≥ 30. */
export async function attemptStats(scope: StoreScope, q?: { days?: 90 }): Promise<{ weekday: number; hour: number; attempts: number; contacted: number }[]> {
  const days = q?.days ?? WINDOW_DAYS;
  return attemptsCache.getOrLoad(scope.storeId, String(days), () => loadAttempts(scope, days));
}

/**
 * The cached table, or null while it is cold: the cold read starts the load (shared with concurrent callers) and does
 * not wait for it. The queue card reads this, so no Next ever pays for the 90-day grouped read.
 */
export function attemptStatsIfReady(scope: StoreScope): AttemptCell[] | null {
  const key = String(WINDOW_DAYS);
  const hit = attemptsCache.get(scope.storeId, key);
  if (hit) return hit;
  void attemptsCache.getOrLoad(scope.storeId, key, () => loadAttempts(scope, WINDOW_DAYS)).catch(() => undefined);
  return null;
}

async function loadAttempts(scope: StoreScope, days: number): Promise<AttemptCell[]> {
  const now = opsNow();
  const since = new Date(now.getTime() - days * DAY_MS);
  // minutes since the epoch on the stored UTC value (TIMESTAMPDIFF ignores the session time zone)
  const slot = sql<number>`TIMESTAMPDIFF(MINUTE, '1970-01-01 00:00:00', ${orderEvents.at}) DIV ${sql.raw(String(SLOT_MIN))}`;
  const rows = await db
    .select({
      slot,
      attempts: sql<number>`COUNT(*)`,
      contacted: sql<number>`SUM(${orderEvents.reasonCode} NOT IN (${sql.join(
        NO_CONTACT.map((c) => sql`${c}`),
        sql`, `,
      )}))`,
    })
    .from(orderEvents)
    .innerJoin(orders, and(inStore(orders, scope), eq(orders.id, orderEvents.orderId)))
    .where(whereStore(orderEvents, scope, eq(orderEvents.type, "call_attempt"), gte(orderEvents.at, since), eq(orders.isTest, false), notHoneypot))
    .groupBy(slot);
  const tz = await storeTz(scope);
  const cells = new Map<string, AttemptCell>();
  for (const r of rows) {
    const at = new Date(Number(r.slot) * SLOT_MIN * 60_000);
    const weekday = isoWeekday(at, tz);
    const hour = storeHour(at, tz);
    const key = `${weekday}:${hour}`;
    const c = cells.get(key) ?? { weekday, hour, attempts: 0, contacted: 0 };
    c.attempts += Number(r.attempts ?? 0);
    c.contacted += Number(r.contacted ?? 0);
    cells.set(key, c);
  }
  return [...cells.values()].sort((a, b) => a.weekday - b.weekday || a.hour - b.hour);
}

/**
 * The best hour of one store-local weekday to reach this store's customers (the card's `bestHoursHint`, OD44): the
 * cell with the highest contact share among those with ≥ 30 attempts; ties go to the earlier hour. Null when no cell
 * of that weekday has 30 attempts. Pure.
 */
export function bestHourOf(cells: readonly AttemptCell[], weekday: number): AttemptCell | null {
  let best: AttemptCell | null = null;
  for (const c of cells) {
    if (c.weekday !== weekday || c.attempts < MIN_N) continue;
    // compare contacted / attempts without division: a.c * b.n vs b.c * a.n
    if (!best || c.contacted * best.attempts > best.contacted * c.attempts || (c.contacted * best.attempts === best.contacted * c.attempts && c.hour < best.hour)) best = c;
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* riskBandOutcomes (OD39)                                             */
/* ------------------------------------------------------------------ */

export interface RiskBandOutcome {
  band: "check" | "high";
  decided: number;
  /** fake + cancelled + unreachable */
  bad: number;
  badShareBp: number;
}

const riskCache = scopedCache<Record<"check" | "high", RiskBandOutcome | null>>({ name: "ops-risk-cal", maxEntries: 4_000, ttlMs: HOUR_MS });
const DECIDED = ["confirmed", "cancelled", "fake", "unreachable"] as const;
const BAD = ["cancelled", "fake", "unreachable"] as const;

/** Trailing 90 days, decided orders only, test and honeypot excluded, null below decided = 30; cached 1 h. */
export async function riskBandOutcomes(scope: StoreScope): Promise<Record<"check" | "high", RiskBandOutcome | null>> {
  return riskCache.getOrLoad(scope.storeId, "bands", () => loadBands(scope));
}

async function loadBands(scope: StoreScope): Promise<Record<"check" | "high", RiskBandOutcome | null>> {
  const since = new Date(opsNow().getTime() - WINDOW_DAYS * DAY_MS);
  const band = sql<string>`IF(${orders.riskScore} >= 70, 'high', 'check')`;
  const rows = await db
    .select({
      band,
      decided: sql<number>`COUNT(*)`,
      bad: sql<number>`SUM(${orders.confirmState} IN (${sql.join(
        BAD.map((s) => sql`${s}`),
        sql`, `,
      )}))`,
    })
    .from(orders)
    .where(whereStore(orders, scope, gte(orders.createdAt, since), gte(orders.riskScore, 50), inArray(orders.confirmState, [...DECIDED]), eq(orders.isTest, false), notHoneypot))
    .groupBy(band);
  const out: Record<"check" | "high", RiskBandOutcome | null> = { check: null, high: null };
  for (const r of rows) {
    const b = r.band === "high" ? "high" : "check";
    const decided = Number(r.decided ?? 0);
    const bad = Number(r.bad ?? 0);
    out[b] = decided >= MIN_N ? { band: b, decided, bad, badShareBp: Math.round((bad * 10_000) / decided) } : null;
  }
  return out;
}

/** The cached aggregates of one store, dropped (tests; a store's purge goes through `invalidateStore`). */
export function forgetOpsAggregates(scope: StoreScope): void {
  attemptsCache.delete(scope.storeId);
  riskCache.delete(scope.storeId);
}
