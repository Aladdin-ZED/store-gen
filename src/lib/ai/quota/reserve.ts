import "server-only";
/**
 * Reserve → call → reconcile (P7 AI; ai.md AI-§C.2, AI-§C.3; docs/STORE-SAAS.md §A.4, §D.7 `chargeUsage` with
 * `allowOver`, `chargePlatformUsage`, D69, D70, D71). Integer credits and micros only.
 *
 *   - `reserve(scope, est, runId, opts)` walks `planReservation()` (./cost.ts) in the AI-§C.2 order: store
 *     `ai_credits` (month, store time) → `ai_credits_day` (limit `dailyCreditLimit`, floor 10 while `pending`) → the
 *     Director share `ai_credits_director` (Director-pass tasks) → the pass counter (`ai_director_passes` /
 *     `ai_deep_passes`, charged 1 by the first stage of a pass only) → platform `ai_cost_micros` (the cap) → platform
 *     `ai_cost_micros_pending` (a pending store). Each step is the core's one conditional UPDATE; a refusal at step k
 *     refunds steps < k and throws `AiQuotaError` with the step's code (`quota_store`, `quota_day`, `quota_director`,
 *     `quota_platform`, `quota_platform_pending`).
 *   - `reconcile(r, actual)`: on exactly the counters charged, refunds the difference or charges the excess with
 *     `allowOver` (the bill stays honest and the next call is refused); the pass counter is never reconciled.
 *   - `release(r)`: the full refund of a call that never reached the provider (the pass included: no pass happened).
 *
 * A reservation remembers each row it charged (metric and period), so reconcile and release hit the same rows even
 * when the call ends after midnight. Staff never spend a store's credits: the scope is a `WriteScope` (D71), and a
 * scope of another kind that slips through a cast is refused with `state` before any counter moves (D70).
 */
import type { PlatformAiSetting } from "@/lib/settings/keys/platform_ai";
import { getPlatformSetting } from "@/lib/settings";
import { usageMetric, type PlatformUsageMetric, type UsageMetricName } from "@/lib/tenancy/entitlement-keys";
import { QuotaError, chargePlatformUsage, chargeUsage, entitlement, platformPeriodOf, refundPlatformUsage, refundUsage } from "@/lib/tenancy/entitlements";
import { getStoreById } from "@/lib/tenancy/public";
import type { StoreStatus, WriteScope } from "@/lib/tenancy/types";
import type { AiTaskId } from "../tasks";
import { dailyCreditLimit, directorShareLimit, pendingShareMicros, planReservation, platformCapMicros, reconcileDelta, reservationKeys, type CounterCharge, type ReservationKey } from "./cost";

export type QuotaRefusal = CounterCharge["refusal"];

/** A refused reservation: `code` is the AiFailCode the caller answers with; nothing stays charged. */
export class AiQuotaError extends Error {
  constructor(
    readonly code: QuotaRefusal | "state",
    readonly key: ReservationKey | null,
  ) {
    super(`ai quota: ${code}`);
    this.name = "AiQuotaError";
  }
}

/** One counter row a reservation charged. */
export interface ChargedRow {
  key: ReservationKey;
  scope: "store" | "platform";
  metric: UsageMetricName | PlatformUsageMetric;
  period: string;
  unit: CounterCharge["unit"];
  amount: number;
  /** null = no limit (unlimited month, no cap) */
  limit: number | null;
  reconciled: boolean;
}

export interface Reservation {
  credits: number;
  micros: number;
  runId: string;
  /** AI-§C.2: which counters were charged (rev 3: `director` and `pending` joined the chain) */
  keys: Record<ReservationKey, boolean>;
  /** the store the credits belong to; "platform" = a platform-paid call (eval) */
  scope: WriteScope | "platform";
  rows: ChargedRow[];
  /** reconcile and release run once; a second call is a no-op */
  state: "open" | "reconciled" | "released";
}

export interface ReserveOpts {
  task: AiTaskId;
  /** a later stage of a pass whose first stage already charged the pass counter */
  passCharged?: boolean;
  /** the clock of the periods (tests); default now */
  now?: Date;
}

/** What the limits read: the store's status and zone, its month (state cap applied) and the platform caps. */
interface QuotaCtx {
  status: StoreStatus;
  timezone: string;
  monthly: number | null;
  caps: PlatformAiSetting["caps"];
}

async function quotaCtx(scope: WriteScope): Promise<QuotaCtx> {
  const [store, monthly, ai] = await Promise.all([getStoreById(scope.storeId), entitlement(scope, "ai_credits_month"), getPlatformSetting("platform_ai")]);
  if (!store) throw new AiQuotaError("state", null);
  return { status: store.status, timezone: store.timezone, monthly, caps: ai.caps };
}

function checkEstimate(est: { micros: number; credits: number }): void {
  for (const v of [est.micros, est.credits]) {
    if (!Number.isSafeInteger(v) || v < 0) throw new RangeError("ai quota: an estimate is two non-negative integers");
  }
}

/** The row of each planned counter: its period (store time for store counters, UTC month for the platform's) and limit. */
function rowsFor(plan: readonly CounterCharge[], est: { micros: number; credits: number }, q: QuotaCtx | null, monthlyUsd: number | null, pendingSharePct: number, now: Date): ChargedRow[] {
  const platformMonth = platformPeriodOf("month", now);
  return plan.map((c): ChargedRow => {
    const amount = c.unit === "credits" ? est.credits : c.unit === "micros" ? est.micros : 1;
    if (c.scope === "platform") {
      const limit = c.key === "pending" ? pendingShareMicros(monthlyUsd, pendingSharePct) : platformCapMicros(monthlyUsd);
      return { key: c.key, scope: "platform", metric: c.metric, period: platformMonth, unit: c.unit, amount, limit, reconciled: c.reconciled };
    }
    if (!q) throw new Error("ai quota: a store counter without its store");
    const metric = c.metric as UsageMetricName;
    const period = usageMetric(metric, now, q.timezone).period;
    let limit: number | null;
    switch (c.key) {
      case "store":
        limit = q.monthly;
        break;
      case "day":
        limit = dailyCreditLimit({ monthly: q.monthly, storeDailyCapPct: q.caps.storeDailyCapPct, dailyUsdPerStore: q.caps.dailyUsdPerStore, pending: q.status === "pending", pendingDailyFloor: q.caps.pendingDailyFloor });
        break;
      case "director":
        limit = directorShareLimit(q.monthly, q.caps.directorSharePct);
        break;
      case "pass":
        limit = metric === "ai_deep_passes" ? q.caps.deepPassesPerStorePerDay : q.caps.directorPassesPerStorePerDay;
        break;
      default:
        throw new Error(`ai quota: ${c.key} is not a store counter`);
    }
    return { key: c.key, scope: "store", metric, period, unit: c.unit, amount, limit, reconciled: c.reconciled };
  });
}

async function chargeRow(scope: WriteScope | "platform", row: ChargedRow, amount: number, allowOver: boolean): Promise<void> {
  if (row.scope === "platform") {
    await chargePlatformUsage(row.metric as PlatformUsageMetric, row.period, amount, { limit: row.limit, allowOver });
    return;
  }
  if (scope === "platform") throw new Error("ai quota: a store counter on a platform-paid reservation");
  await chargeUsage(scope, { metric: row.metric as UsageMetricName, period: row.period }, amount, { limit: row.limit, allowOver });
}

async function refundRow(scope: WriteScope | "platform", row: ChargedRow, amount: number): Promise<void> {
  if (row.scope === "platform") {
    await refundPlatformUsage(row.metric as PlatformUsageMetric, row.period, amount);
    return;
  }
  if (scope === "platform") throw new Error("ai quota: a store counter on a platform-paid reservation");
  await refundUsage(scope, { metric: row.metric as UsageMetricName, period: row.period }, amount);
}

/** Refunds in reverse order; a refund that fails is logged without values and the others still run. */
async function refundAll(scope: WriteScope | "platform", rows: readonly ChargedRow[]): Promise<void> {
  for (const row of [...rows].reverse()) {
    try {
      await refundRow(scope, row, row.amount);
    } catch (err) {
      console.error(`[ai] refund of ${row.metric} failed: ${err instanceof Error ? err.name : "error"}`);
    }
  }
}

/**
 * Charges the counters of one call in the AI-§C.2 order. `scope = "platform"` is a platform-paid call (eval): only
 * the platform month. Throws `AiQuotaError` (nothing left charged) or a database error (likewise).
 */
export async function reserve(scope: WriteScope | "platform", est: { micros: number; credits: number }, runId: string, opts: ReserveOpts): Promise<Reservation> {
  checkEstimate(est);
  const now = opts.now ?? new Date();
  if (scope !== "platform" && scope.kind !== "member" && scope.kind !== "system" && scope.kind !== "public") throw new AiQuotaError("state", null);
  const [q, ai] = await Promise.all([scope === "platform" ? Promise.resolve(null) : quotaCtx(scope), getPlatformSetting("platform_ai")]);
  const plan = planReservation({ task: opts.task, payer: scope === "platform" ? "platform" : undefined, pending: q?.status === "pending", passCharged: opts.passCharged === true });
  const rows = rowsFor(plan, est, q, ai.caps.monthlyUsd, ai.caps.pendingSharePct, now);
  const done: ChargedRow[] = [];
  for (const row of rows) {
    try {
      await chargeRow(scope, row, row.amount, false);
      done.push(row);
    } catch (err) {
      await refundAll(scope, done);
      if (err instanceof QuotaError) throw new AiQuotaError(plan[rows.indexOf(row)]!.refusal, row.key);
      throw err;
    }
  }
  return { credits: est.credits, micros: est.micros, runId, keys: reservationKeys(plan), scope, rows: done, state: "open" };
}

/**
 * After the call: `delta = actual − reserved` on every reconciled counter the reservation charged; a refund below 0
 * never happens (the core clamps at 0), an excess is charged with `allowOver`. The pass counter is left as is.
 */
export async function reconcile(r: Reservation, actual: { micros: number; credits: number }): Promise<void> {
  if (r.state !== "open") return;
  checkEstimate(actual);
  r.state = "reconciled";
  const d = reconcileDelta(r, actual);
  for (const row of r.rows) {
    if (!row.reconciled) continue;
    const delta = row.unit === "micros" ? d.micros : d.credits;
    if (delta.refund > 0) await refundRow(r.scope, row, delta.refund);
    if (delta.charge > 0) await chargeRow(r.scope, row, delta.charge, true);
  }
}

/** The full refund of a call that failed before any provider billing (gate, PII, busy, connection refused). */
export async function release(r: Reservation): Promise<void> {
  if (r.state !== "open") return;
  r.state = "released";
  await refundAll(r.scope, r.rows);
}
