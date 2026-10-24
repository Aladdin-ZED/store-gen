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
 * Signatures frozen at C0a; T1 implements the bodies (§K.1). Until then every call throws "not implemented: T1".
 */
import type { PlatformUsageMetric, UsageMetric } from "./entitlement-keys";
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

function notImplemented(fn: string, ...args: unknown[]): never {
  void args;
  throw new Error(`not implemented: T1 (${fn})`);
}

/**
 * Atomic (§D.7) against the entitlement limit of the metric, or `opts.limit` for the metrics whose limit the owning
 * part computes (the Director share, the daily AI cap). `allowOver` drops the limit predicate (reconciling a real
 * cost above its reservation, AI R4; reviewed at merge). Throws QuotaError.
 */
export async function chargeUsage(scope: StoreScope, metric: UsageMetric, delta: number, opts?: { allowOver?: boolean; limit?: number | null }): Promise<ChargeResult> {
  return notImplemented("chargeUsage", scope, metric, delta, opts);
}

/** value = GREATEST(0, value - delta). */
export async function refundUsage(scope: StoreScope, metric: UsageMetric, delta: number): Promise<void> {
  return notImplemented("refundUsage", scope, metric, delta);
}

/** `platform_usage`, the same statements (pending_stores per platform day, pending_media_bytes "total", …; D69). */
export async function chargePlatformUsage(metric: PlatformUsageMetric, period: string, delta: number, opts?: { allowOver?: boolean; limit?: number | null }): Promise<ChargeResult> {
  return notImplemented("chargePlatformUsage", metric, period, delta, opts);
}

/** rev 3: a failed signup gives its pending_stores slot back; the transition out of `pending` refunds the store's share of pending_media_bytes. */
export async function refundPlatformUsage(metric: PlatformUsageMetric, period: string, delta: number): Promise<void> {
  return notImplemented("refundPlatformUsage", metric, period, delta);
}
