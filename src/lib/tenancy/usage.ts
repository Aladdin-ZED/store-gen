import "server-only";
/**
 * Atomic usage counters (docs/STORE-SAAS.md §A.4, §D.7): `store_usage` rows per store and `platform_usage` rows for
 * the platform counters, charged with one conditional UPDATE (`affectedRows = 1` → charged, 0 → QuotaError, nothing
 * written). Charge before the side effect, refund on failure in a `finally`.
 *
 *   const key = usageMetric("media_bytes", new Date(), store.timezone);
 *   await chargeUsage(scope, key, bytes);
 *   try { await writeFiles(); } catch (err) { await refundUsage(scope, key, bytes); throw err; }
 *
 * The statements (one pooled connection, no transaction: the UPDATE's row lock serializes concurrent charges):
 *
 *   INSERT IGNORE INTO store_usage (store_id, metric, period, value, updated_at) VALUES (?, ?, ?, 0, UTC_TIMESTAMP(3))
 *   UPDATE store_usage SET value = LAST_INSERT_ID(value + ?), updated_at = UTC_TIMESTAMP(3)
 *    WHERE store_id = ? AND metric = ? AND period = ? AND value + ? <= ?      -- the predicate only with a limit
 *
 * `LAST_INSERT_ID(expr)` hands the new value back in the UPDATE's own result, so the answer is the counter this charge
 * produced, not a later read. The limit of a store metric is its entitlement (§A.4, after the state cap and the kill
 * switches) unless the caller passes `opts.limit` (the Director share and the daily AI cap, whose limits the ai part
 * computes; such a metric without `opts.limit` is a programming error and throws). Soft metrics (`orders`) are never
 * refused. Platform counters (`platform_usage`, D69) take their limit from `opts.limit` only; without one they meter.
 */
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { pool } from "@/lib/db/client";
import { PLATFORM_USAGE_METRICS, USAGE_METRICS, type PlatformUsageMetric, type UsageMetric } from "./entitlement-keys";
import type { StoreScope } from "./types";

/** The counter after a successful charge (`limit` null = unlimited). */
export interface ChargeResult {
  value: number;
  limit: number | null;
}

/** A platform counter row key (`platform_usage`): month "YYYY-MM", day "YYYY-MM-DD", hour, or "total". */
export interface PlatformUsageKey {
  metric: PlatformUsageMetric;
  period: string;
}

/** A charge refused at its limit (nothing written). The dashboard opens the limit sheet, never a raw error. */
export class QuotaError extends Error {
  constructor(
    readonly metric: UsageMetric | PlatformUsageKey,
    readonly limit: number,
    readonly used: number,
    message = `quota reached: ${metric.metric}`,
  ) {
    super(message);
    this.name = "QuotaError";
  }
}

/* ------------------------------------------------------------------ */
/* Periods                                                             */
/* ------------------------------------------------------------------ */

type PeriodKind = "total" | "month" | "day" | "hour";

const PERIOD_RE: Record<PeriodKind, RegExp> = {
  total: /^total$/,
  month: /^\d{4}-(?:0[1-9]|1[0-2])$/,
  day: /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/,
  hour: /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3])$/,
};

/**
 * The periods each platform counter is kept in (§D.7): the AI cost and its pending slice per month, mail per hour,
 * sandboxes per platform day, the pending disk budget as one gauge. Batch items and push have no fixed grain yet.
 */
export const PLATFORM_USAGE_PERIODS: Record<PlatformUsageMetric, readonly PeriodKind[]> = {
  ai_cost_micros: ["month"],
  ai_cost_micros_pending: ["month"],
  ai_batch_items: ["total", "month", "day", "hour"],
  mail_sent: ["hour"],
  push_sent: ["total", "month", "day", "hour"],
  pending_stores: ["day"],
  pending_media_bytes: ["total"],
};

/**
 * A platform period of `at` in UTC (the platform has no time zone of its own): "YYYY-MM", "YYYY-MM-DD" or the hour
 * "YYYY-MM-DDTHH". The D69 sandbox counter is `platformPeriodOf("day", now)`.
 */
export function platformPeriodOf(kind: "month" | "day" | "hour", at: Date): string {
  const iso = at.toISOString(); // YYYY-MM-DDTHH:mm:ss.sssZ
  return kind === "month" ? iso.slice(0, 7) : kind === "day" ? iso.slice(0, 10) : iso.slice(0, 13);
}

/** Throws on a metric or period that does not belong to the registry (a typo would silently start a new counter). */
export function checkStoreMetric(metric: UsageMetric): void {
  const def = (USAGE_METRICS as Record<string, { period: PeriodKind } | undefined>)[metric?.metric];
  if (!def) throw new Error(`usage: unknown metric "${String(metric?.metric)}"`);
  if (typeof metric.period !== "string" || !PERIOD_RE[def.period].test(metric.period)) throw new Error(`usage: bad period "${String(metric.period)}" for ${metric.metric}`);
}

export function checkPlatformMetric(metric: PlatformUsageMetric, period: string): void {
  if (!(PLATFORM_USAGE_METRICS as readonly string[]).includes(metric)) throw new Error(`usage: unknown platform metric "${String(metric)}"`);
  if (typeof period !== "string" || !PLATFORM_USAGE_PERIODS[metric].some((k) => PERIOD_RE[k].test(period))) throw new Error(`usage: bad period "${String(period)}" for ${metric}`);
}

function checkDelta(delta: number): void {
  if (!Number.isSafeInteger(delta) || delta < 0) throw new Error(`usage: delta must be a non-negative integer (got ${String(delta)})`);
}

function checkLimit(limit: number | null): void {
  if (limit !== null && (!Number.isSafeInteger(limit) || limit < 0)) throw new Error(`usage: bad limit ${String(limit)}`);
}

/* ------------------------------------------------------------------ */
/* The statements                                                      */
/* ------------------------------------------------------------------ */

/** One counter row: the table and its key columns (store_id + metric + period, or metric + period). */
interface Row {
  table: "store_usage" | "platform_usage";
  storeId: string | null;
  metric: string;
  period: string;
}

const keyWhere = (r: Row) => (r.storeId === null ? "metric = ? AND period = ?" : "store_id = ? AND metric = ? AND period = ?");
const keyParams = (r: Row) => (r.storeId === null ? [r.metric, r.period] : [r.storeId, r.metric, r.period]);

/** A missing `platform_usage` table (cut in 0005, needed by R1.0: CCR r1.0-t1-1) fails with a readable message. */
function rethrow(err: unknown, r: Row): never {
  if (r.table === "platform_usage" && (err as { errno?: number } | null)?.errno === 1146) {
    throw new Error("usage: the platform_usage table does not exist yet (docs/saas/ccr/r1.0-t1-1.md)");
  }
  throw err;
}

async function readValue(r: Row): Promise<number> {
  try {
    const [rows] = await pool().query<RowDataPacket[]>(`SELECT value FROM ${r.table} WHERE ${keyWhere(r)}`, keyParams(r));
    return rows.length ? Number(rows[0]!.value) : 0;
  } catch (err) {
    rethrow(err, r);
  }
}

/** The §D.7 pair on one connection; `limit` null = no predicate (unlimited, soft or allowOver). */
async function charge(r: Row, key: UsageMetric | PlatformUsageKey, delta: number, limit: number | null, reportLimit: number | null): Promise<ChargeResult> {
  if (delta === 0) return { value: await readValue(r), limit: reportLimit };
  const conn = await pool().getConnection();
  let res: ResultSetHeader;
  try {
    // tenancy: platform_usage is a P table (§D.3); store_usage rows are keyed by the scope's store id
    const cols = r.storeId === null ? "metric, period" : "store_id, metric, period";
    await conn.query(`INSERT IGNORE INTO ${r.table} (${cols}, value, updated_at) VALUES (${keyParams(r).map(() => "?").join(", ")}, 0, UTC_TIMESTAMP(3))`, keyParams(r));
    const guard = limit === null ? "" : " AND value + ? <= ?";
    const params = [delta, ...keyParams(r), ...(limit === null ? [] : [delta, limit])];
    [res] = await conn.query<ResultSetHeader>(`UPDATE ${r.table} SET value = LAST_INSERT_ID(value + ?), updated_at = UTC_TIMESTAMP(3) WHERE ${keyWhere(r)}${guard}`, params);
  } catch (err) {
    rethrow(err, r);
  } finally {
    conn.release();
  }
  if (res.affectedRows !== 1) throw new QuotaError(key, limit ?? 0, await readValue(r));
  return { value: Number(res.insertId), limit: reportLimit };
}

async function refund(r: Row, delta: number): Promise<void> {
  if (delta === 0) return;
  try {
    await pool().query(`UPDATE ${r.table} SET value = GREATEST(0, value - ?), updated_at = UTC_TIMESTAMP(3) WHERE ${keyWhere(r)}`, [delta, ...keyParams(r)]);
  } catch (err) {
    rethrow(err, r);
  }
}

function storeIdOf(scope: StoreScope): string {
  const id = (scope as { storeId?: unknown } | null | undefined)?.storeId;
  if (typeof id !== "string" || id.length === 0) throw new Error("tenancy: a StoreScope without a store id reached a query");
  return id;
}

/* ------------------------------------------------------------------ */
/* Store counters                                                      */
/* ------------------------------------------------------------------ */

/**
 * Atomic (§D.7) against the entitlement limit of the metric, or `opts.limit` for the metrics whose limit the owning
 * part computes (the Director share, the daily AI cap). `allowOver` drops the limit predicate (reconciling a real
 * cost above its reservation, AI R4; reviewed at merge). Throws QuotaError.
 */
export async function chargeUsage(scope: StoreScope, metric: UsageMetric, delta: number, opts?: { allowOver?: boolean; limit?: number | null }): Promise<ChargeResult> {
  checkStoreMetric(metric);
  checkDelta(delta);
  const def = USAGE_METRICS[metric.metric];
  let limit: number | null;
  if (opts?.limit !== undefined) limit = opts.limit;
  else if (def.limit !== null) {
    // ./entitlements re-exports this module; the import is deferred so neither module needs the other at load
    const { entitlement } = await import("./entitlements");
    limit = await entitlement(scope, def.limit);
  } else throw new Error(`usage: ${metric.metric} has no entitlement limit; pass opts.limit`);
  checkLimit(limit);
  const soft = "soft" in def && def.soft === true;
  const row: Row = { table: "store_usage", storeId: storeIdOf(scope), metric: metric.metric, period: metric.period };
  return charge(row, metric, delta, soft || opts?.allowOver ? null : limit, limit);
}

/** value = GREATEST(0, value - delta). */
export async function refundUsage(scope: StoreScope, metric: UsageMetric, delta: number): Promise<void> {
  checkStoreMetric(metric);
  checkDelta(delta);
  await refund({ table: "store_usage", storeId: storeIdOf(scope), metric: metric.metric, period: metric.period }, delta);
}

/** The current value of one store counter (0 when no row exists yet): meters and assertWithin. */
export async function usageValue(scope: StoreScope, metric: UsageMetric): Promise<number> {
  checkStoreMetric(metric);
  return readValue({ table: "store_usage", storeId: storeIdOf(scope), metric: metric.metric, period: metric.period });
}

/* ------------------------------------------------------------------ */
/* Platform counters                                                   */
/* ------------------------------------------------------------------ */

/** `platform_usage`, the same statements (pending_stores per platform day, pending_media_bytes "total", …; D69). */
export async function chargePlatformUsage(metric: PlatformUsageMetric, period: string, delta: number, opts?: { allowOver?: boolean; limit?: number | null }): Promise<ChargeResult> {
  checkPlatformMetric(metric, period);
  checkDelta(delta);
  const limit = opts?.limit ?? null;
  checkLimit(limit);
  return charge({ table: "platform_usage", storeId: null, metric, period }, { metric, period }, delta, opts?.allowOver ? null : limit, limit);
}

/** rev 3: a failed signup gives its pending_stores slot back; the transition out of `pending` refunds the store's share of pending_media_bytes. */
export async function refundPlatformUsage(metric: PlatformUsageMetric, period: string, delta: number): Promise<void> {
  checkPlatformMetric(metric, period);
  checkDelta(delta);
  await refund({ table: "platform_usage", storeId: null, metric, period }, delta);
}

/** The current value of one platform counter (0 when no row exists yet): console meters. */
export async function platformUsageValue(metric: PlatformUsageMetric, period: string): Promise<number> {
  checkPlatformMetric(metric, period);
  return readValue({ table: "platform_usage", storeId: null, metric, period });
}
