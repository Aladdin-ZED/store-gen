import "server-only";
/**
 * Deterministic aggregates for insights and learners (P4 CALL CENTER; operations.md OPE-§27.6, OD39, OD43, OD44, OD50;
 * docs/STORE-SAAS.md §K.2 P0, rev 2.1): the Today brief (P2), Store Health (P1's `zones.feeMismatchTop5` over the
 * top-5 cities) and the Campaign Kit by-angle table (P3) read them, the R3 digest and best-time learner too.
 * Store-local days, cells under 5 orders suppressed, test and honeypot orders excluded, no customer field in any cell;
 * city keys are `CityKey` slugs and an order without one counts under "*".
 *
 *   opsAggregates       the orders PLACED on the store-local days from..to (the placed-day cohort), decomposed per
 *                       dimension with their current outcome: at most two grouped scans of `orders_store_created_idx`
 *                       per period (the key dims together, the time slots apart; ≤ 6 dims per call), cells under 5
 *                       orders suppressed and counted, rates as `Kpi` (30 per cell,
 *                       20 per agent), `compareWith: "previous"` = the same number of days just before. Keys: page id,
 *                       city slug ("*" for none), source, agent = `confirmed_by` (a member id; "*" = nobody confirmed
 *                       it yet), offer = the bundle id, campaign / angle = `utm_campaign` / `utm_content` ("*" = none),
 *                       hour / weekday = the store-local hour (0-23) / ISO weekday (1-7) of creation, folded from
 *                       15-minute UTC slots like `attemptStats`; carrier is R2 and answers no cell. Cached 5 min per
 *                       (store, query).
 *   cancelReasonMix     (OPE-§14.3) the moves into `cancelled` of the trailing store-local days per coded reason
 *   returnReasonMix     (OD50) refused + returned + lost of the window per `return_reason` (null = no reason given),
 *                       for the store or one city / carrier label / agent (`confirmed_by`)
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
 * The clock is `opsNow()`, so the DB-backed suite drives the windows with a fake clock.
 */
import { createHash } from "node:crypto";
import { and, eq, gte, inArray, lt, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { orderEvents, orders } from "@/lib/db/schema";
import type { Kpi } from "@/lib/orders/profile";
import { CANCEL_REASONS, RETURN_REASONS, type CancelReason, type ReturnReason } from "@/lib/orders/state";
import { scopedCache } from "@/lib/tenancy/cache";
import { inStore, whereStore } from "@/lib/tenancy/sql";
import type { StoreScope } from "@/lib/tenancy/types";
import { dayBounds, notHoneypot, spanOf, storeTz, trailingDays } from "./insights-sql";
import { KPI_MIN, rateKpi, type KpiWho } from "./kpis";
import { opsNow } from "./presence";
import { addDaysYmd, isoWeekday, storeHour } from "./window";

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

/* ------------------------------------------------------------------ */
/* shared                                                              */
/* ------------------------------------------------------------------ */

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const WINDOW_DAYS = 90;
/** OD39, OD44: a rate is shown only from this many orders or attempts */
export const MIN_N = 30;
/** OD43: a cell with fewer orders is never shown (and never handed to a model) */
export const AGG_MIN_CELL = 5;
export const AGG_MAX_DIMS = 6;
/** the outcomes that reached nobody (OD44) */
const NO_CONTACT = ["no_answer", "busy", "switched_off"] as const;
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;


/** not a test order, not a honeypot (core D54, OPE-§10.2) */
const realOrder = and(eq(orders.isTest, false), notHoneypot)!;
const num = (v: unknown): number => Number(v ?? 0) || 0;

/* ------------------------------------------------------------------ */
/* opsAggregates (OPE-§27.6, OD43)                                     */
/* ------------------------------------------------------------------ */

/** The counts of one group of placed orders (the raw row of a dim's grouped read). */
export interface AggCounts {
  key: string;
  placed: number;
  confirmed: number;
  cancelled: number;
  unreachable: number;
  fake: number;
  delivered: number;
  refused: number;
  returned: number;
  lost: number;
}

const minFor = (who: KpiWho): number => (who === "agent" ? KPI_MIN.agent : KPI_MIN.store);

/** One cell from its counts (pure): the confirmation rate over decisions, the delivery rate over finals. */
export function aggCellOf(c: AggCounts, who: KpiWho = "store"): AggCell {
  return {
    key: c.key,
    placed: c.placed,
    confirmed: c.confirmed,
    delivered: c.delivered,
    refused: c.refused,
    cancelled: c.cancelled,
    unreachable: c.unreachable,
    fake: c.fake,
    n: c.placed,
    confirmationRate: rateKpi(c.confirmed, c.confirmed + c.cancelled + c.unreachable, minFor(who)),
    deliveryRate: rateKpi(c.delivered, c.delivered + c.refused + c.returned + c.lost, minFor(who)),
  };
}

/** Cells under AGG_MIN_CELL orders dropped and counted; the rest largest first (pure). */
export function suppressCells(rows: readonly AggCounts[], who: KpiWho = "store"): { cells: AggCell[]; suppressed: number } {
  let suppressed = 0;
  const cells: AggCell[] = [];
  for (const r of rows) {
    if (r.placed < AGG_MIN_CELL) suppressed++;
    else cells.push(aggCellOf(r, who));
  }
  cells.sort((a, b) => b.placed - a.placed || a.key.localeCompare(b.key));
  return { cells, suppressed };
}

/** The SQL key of a key dim (hour and weekday are folded from 15-minute UTC slots, see readDims). */
function dimKey(dim: Exclude<AggDim, "carrier" | "hour" | "weekday">): SQL<string> {
  switch (dim) {
    case "page":
      return sql<string>`${orders.pageId}`;
    case "city":
      return sql<string>`COALESCE(NULLIF(${orders.cityKey}, ''), '*')`;
    case "source":
      return sql<string>`${orders.source}`;
    case "agent":
      return sql<string>`COALESCE(${orders.confirmedBy}, '*')`;
    case "offer":
      return sql<string>`COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(${orders.items}, '$.bundleId')), ''), '*')`;
    case "campaign":
      return sql<string>`COALESCE(NULLIF(LEFT(JSON_UNQUOTE(JSON_EXTRACT(${orders.utm}, '$.utm_campaign')), 80), ''), '*')`;
    case "angle":
      return sql<string>`COALESCE(NULLIF(LEFT(JSON_UNQUOTE(JSON_EXTRACT(${orders.utm}, '$.utm_content')), 80), ''), '*')`;
  }
}

type KeyDim = Exclude<AggDim, "carrier" | "hour" | "weekday">;
type TimeDim = "hour" | "weekday";
const isTimeDim = (d: AggDim): d is TimeDim => d === "hour" || d === "weekday";
const blankCounts = (key: string): AggCounts => ({ key, placed: 0, confirmed: 0, cancelled: 0, unreachable: 0, fake: 0, delivered: 0, refused: 0, returned: 0, lost: 0 });

/** Adds `n` orders in states (cs, ss) to a cell's counts. */
function addTo(c: AggCounts, cs: string, ss: string, n: number): void {
  c.placed += n;
  if (cs === "confirmed") c.confirmed += n;
  else if (cs === "cancelled") c.cancelled += n;
  else if (cs === "unreachable") c.unreachable += n;
  else if (cs === "fake") c.fake += n;
  if (ss === "delivered") c.delivered += n;
  else if (ss === "refused") c.refused += n;
  else if (ss === "returned") c.returned += n;
  else if (ss === "lost") c.lost += n;
}

/**
 * The counts of every requested dim over the real orders placed in [from, to), in at most two grouped scans of
 * `orders_store_created_idx` (the 6-dim call on 50,000 orders reads each row once or twice, never six times):
 *   keys   GROUP BY the requested key dims together with the two state axes (a few hundred to a few thousand
 *          groups), folded per dim here
 *   time   GROUP BY the 15-minute UTC slot and the two state axes, folded into the store's wall-clock hour and ISO
 *          weekday (exact through DST and Ramadan shifts: every real UTC offset is a multiple of 15 minutes)
 */
async function readDims(scope: StoreScope, dims: readonly AggDim[], from: Date, to: Date, tz: string): Promise<Map<AggDim, AggCounts[]>> {
  const keyDims = dims.filter((d): d is KeyDim => d !== "carrier" && !isTimeDim(d));
  const timeDims = dims.filter(isTimeDim);
  const range = whereStore(orders, scope, gte(orders.createdAt, from), lt(orders.createdAt, to), realOrder);
  const out = new Map<AggDim, Map<string, AggCounts>>(dims.map((d) => [d, new Map()]));
  const bump = (dim: AggDim, key: string, cs: string, ss: string, n: number) => {
    const m = out.get(dim)!;
    let c = m.get(key);
    if (!c) m.set(key, (c = blankCounts(key)));
    addTo(c, cs, ss, n);
  };
  await Promise.all([
    keyDims.length
      ? (async () => {
          const fields: Record<string, SQL.Aliased<string>> = {};
          for (const d of keyDims) fields[`k_${d}`] = dimKey(d).as(`k_${d}`);
          const rows = (await db
            .select({ ...fields, cs: orders.confirmState, ss: orders.shipState, n: sql<number>`COUNT(*)` })
            .from(orders)
            .where(range)
            .groupBy(...keyDims.map((d) => sql.raw(`k_${d}`)), orders.confirmState, orders.shipState)) as unknown as Record<string, string | number | null>[];
          for (const r of rows) for (const d of keyDims) bump(d, String(r[`k_${d}`] ?? "*"), String(r.cs), String(r.ss), num(r.n));
        })()
      : Promise.resolve(),
    timeDims.length
      ? (async () => {
          const slot = sql<string>`TIMESTAMPDIFF(MINUTE, '1970-01-01 00:00:00', ${orders.createdAt}) DIV 15`;
          const rows = await db
            .select({ slot: slot.as("sl"), cs: orders.confirmState, ss: orders.shipState, n: sql<number>`COUNT(*)` })
            .from(orders)
            .where(range)
            .groupBy(sql.raw("sl"), orders.confirmState, orders.shipState);
          const wall = new Map<number, { hour: string; weekday: string }>();
          for (const r of rows) {
            const sl = Number(r.slot);
            let w = wall.get(sl);
            if (!w) {
              const at = new Date(sl * 15 * 60_000);
              wall.set(sl, (w = { hour: String(storeHour(at, tz)), weekday: String(isoWeekday(at, tz)) }));
            }
            for (const d of timeDims) bump(d, w[d], String(r.cs), String(r.ss), num(r.n));
          }
        })()
      : Promise.resolve(),
  ]);
  return new Map([...out.entries()].map(([d, m]) => [d, [...m.values()]]));
}

type AggAnswer = { cells: Record<AggDim, AggCell[]>; suppressed: number; computedAt: string };
const aggCache = scopedCache<AggAnswer>({ name: "ops-agg", maxEntries: 2_000, ttlMs: 5 * 60_000 });

/** The requested dims in two grouped scans (see readDims); cached 5 min per (store, query hash); ≤ 400 ms on 50,000 orders. */
export async function opsAggregates(
  scope: StoreScope,
  q: { from: ISODate; to: ISODate; dims: AggDim[]; compareWith?: "previous" },
): Promise<{ cells: Record<AggDim, AggCell[]>; suppressed: number /* cells under 5 orders */; computedAt: string }> {
  const dims = [...new Set(q.dims)].filter((d): d is AggDim => AGG_DIMS.includes(d));
  if (dims.length > AGG_MAX_DIMS) throw new RangeError(`opsAggregates: at most ${AGG_MAX_DIMS} dims per call`);
  if (!YMD_RE.test(q.from) || !YMD_RE.test(q.to) || q.from > q.to) throw new RangeError("opsAggregates: from..to must be store-local days, from <= to");
  const hash = createHash("sha256")
    .update(JSON.stringify([q.from, q.to, [...dims].sort(), q.compareWith ?? null]))
    .digest("base64url")
    .slice(0, 16);
  return aggCache.getOrLoad(scope.storeId, hash, async () => {
    const tz = await storeTz(scope);
    const days = dayBounds(tz, q.from, q.to);
    const cells = Object.fromEntries(AGG_DIMS.map((d) => [d, [] as AggCell[]])) as Record<AggDim, AggCell[]>;
    let suppressed = 0;
    if (!days.length) return { cells, suppressed, computedAt: opsNow().toISOString() };
    const { from, to } = spanOf(days);
    const prev = q.compareWith === "previous" ? dayBounds(tz, addDaysYmd(q.from, -days.length), addDaysYmd(q.from, -1)) : [];
    const prevSpan = prev.length ? spanOf(prev) : null;
    const [current, before] = await Promise.all([readDims(scope, dims, from, to, tz), prevSpan ? readDims(scope, dims, prevSpan.from, prevSpan.to, tz) : Promise.resolve(null)]);
    for (const dim of dims) {
      if (dim === "carrier") continue; // R2 (S4): the carrier of a shipment
      const who: KpiWho = dim === "agent" ? "agent" : "store";
      const kept = suppressCells(current.get(dim) ?? [], who);
      suppressed += kept.suppressed;
      if (before) {
        const byKey = new Map((before.get(dim) ?? []).map((b) => [b.key, b]));
        for (const c of kept.cells) {
          const b = byKey.get(c.key);
          // a previous cell under 5 orders is suppressed too: it travels as 0 placed and an insufficient rate
          const shown = b && b.placed >= AGG_MIN_CELL ? aggCellOf(b, who) : null;
          c.delta = { prevPlaced: shown ? shown.placed : 0, prevDeliveryRate: shown ? shown.deliveryRate : rateKpi(0, 0, minFor(who)) };
        }
      }
      cells[dim] = kept.cells;
    }
    return { cells, suppressed, computedAt: opsNow().toISOString() };
  });
}

/* ------------------------------------------------------------------ */
/* reason mixes (OPE-§14.3, OD50)                                      */
/* ------------------------------------------------------------------ */

/** One reason's line of a mix: its count and its share of the total, withheld below the minimum. */
export interface ReasonShare<R> {
  reason: R;
  count: number;
  share: Kpi;
}

/** A mix from its counts (pure): one line per reason, largest first; n = the total (20 per agent, 30 per store). */
export function reasonShares<R extends string | null>(lines: readonly { reason: R; count: number }[], who: KpiWho): ReasonShare<R>[] {
  const merged = new Map<R, number>();
  for (const l of lines) if (l.count > 0) merged.set(l.reason, (merged.get(l.reason) ?? 0) + Math.floor(l.count));
  const total = [...merged.values()].reduce((s, c) => s + c, 0);
  return [...merged.entries()]
    .map(([reason, count]) => ({ reason, count, share: rateKpi(count, total, minFor(who)) }))
    .sort((a, b) => b.count - a.count || String(a.reason ?? "~").localeCompare(String(b.reason ?? "~")));
}

const mixCache = scopedCache<ReasonShare<string | null>[]>({ name: "ops-mix", maxEntries: 4_000, ttlMs: 5 * 60_000 });
const asCancel = (r: string | null): CancelReason => ((CANCEL_REASONS as readonly string[]).includes(r ?? "") ? (r as CancelReason) : "other");
const asReturn = (r: string | null): ReturnReason | null => (r === null || r === "" ? null : (RETURN_REASONS as readonly string[]).includes(r) ? (r as ReturnReason) : "other");

/** The moves into `cancelled` of the trailing `days` store-local days (today included) per coded reason; `by` = one actor. */
export async function cancelReasonMix(scope: StoreScope, days: 28, by?: { agent: string }): Promise<{ reason: CancelReason; count: number; share: Kpi }[]> {
  const d = Math.max(1, Math.min(90, Math.floor(days)));
  const lines = await mixCache.getOrLoad(scope.storeId, `cancel:${d}:${by?.agent ?? "*"}`, async () => {
    const { from, to } = spanOf(trailingDays(await storeTz(scope), opsNow(), d));
    const rows = await db
      .select({ reason: orderEvents.reasonCode, count: sql<number>`COUNT(DISTINCT ${orderEvents.orderId})` })
      .from(orderEvents)
      .innerJoin(orders, and(inStore(orders, scope), eq(orders.id, orderEvents.orderId)))
      .where(
        whereStore(
          orderEvents,
          scope,
          eq(orderEvents.type, "state_changed"),
          eq(orderEvents.toState, "cancelled"),
          gte(orderEvents.at, from),
          lt(orderEvents.at, to),
          by ? eq(orderEvents.actorId, by.agent) : undefined,
          realOrder,
        ),
      )
      .groupBy(orderEvents.reasonCode);
    return reasonShares<string | null>(
      rows.map((r) => ({ reason: asCancel(r.reason), count: num(r.count) })),
      by ? "agent" : "store",
    );
  });
  return lines as { reason: CancelReason; count: number; share: Kpi }[];
}

/**
 * Refused + returned + lost orders whose final move happened in the trailing `days` store-local days, per
 * `return_reason` (null = no reason given; an unknown code reads "other"); `by` narrows to one city slug ("*" = none),
 * carrier label or agent (`confirmed_by`).
 */
export async function returnReasonMix(
  scope: StoreScope,
  days: 28,
  by?: { dim: "city" | "carrier" | "agent"; key: string },
): Promise<{ reason: ReturnReason | null /* null = no reason given */; count: number; share: Kpi }[]> {
  const d = Math.max(1, Math.min(90, Math.floor(days)));
  const key = by ? String(by.key).slice(0, 60) : "";
  const lines = await mixCache.getOrLoad(scope.storeId, `return:${d}:${by?.dim ?? ""}:${key}`, async () => {
    const { from, to } = spanOf(trailingDays(await storeTz(scope), opsNow(), d));
    const narrow =
      by?.dim === "city"
        ? key === "*"
          ? sql`(${orders.cityKey} IS NULL OR ${orders.cityKey} = '')`
          : eq(orders.cityKey, key)
        : by?.dim === "carrier"
          ? eq(orders.carrierLabel, key)
          : by?.dim === "agent"
            ? eq(orders.confirmedBy, key)
            : undefined;
    const rows = await db
      .select({ reason: orders.returnReason, count: sql<number>`COUNT(*)` })
      .from(orders)
      .where(whereStore(orders, scope, inArray(orders.shipState, ["refused", "returned", "lost"]), gte(orders.finalAt, from), lt(orders.finalAt, to), narrow, realOrder))
      .groupBy(orders.returnReason);
    return reasonShares<string | null>(
      rows.map((r) => ({ reason: asReturn(r.reason), count: num(r.count) })),
      by?.dim === "agent" ? "agent" : "store",
    );
  });
  return lines as { reason: ReturnReason | null; count: number; share: Kpi }[];
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
  aggCache.delete(scope.storeId);
  mixCache.delete(scope.storeId);
}
