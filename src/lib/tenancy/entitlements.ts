import "server-only";
/**
 * Entitlements (docs/STORE-SAAS.md §A.4, §A.5.2, §H.8): what a store may do and how much. The key registry is
 * isomorphic in ./entitlement-keys.ts; values resolve here, per key:
 *
 *   override (not expired) > boost (not expired) > plans.limits / plans.features > ENTITLEMENTS[key].default
 *   → a feature of a later release is false → applyStateCap(status, key, value) → the kill switches force their
 *   features to false
 *
 * Orders are never refused for a quota: `take_orders` is false only through a lifecycle state (no kill switch touches
 * it). The usage counters live in ./usage.ts and are re-exported here, so callers import one module.
 *
 *   await assertFeature(ctx.scope, "publish");                    // EntitlementError → the limit sheet (`feature_off`)
 *   const cap = await entitlement(ctx.scope, "media_bytes");      // number | null (null = unlimited)
 *
 * The per-store set (everything up to the state cap) is one cached load of 30 s (`scopedCache("entitlements")`,
 * dropped by invalidateEntitlements and invalidateStore); the kill switches are applied on every read from their own
 * 30 s cache (`scopedCache("flags")`, platform key "p"), so tripping one takes effect without touching store caches.
 * The resolution itself is pure (`resolveEntitlements`, `applyStateCap`, `applyKillSwitches`) and tested offline
 * (test:tenancy-unit).
 */
import { and, eq, isNotNull } from "drizzle-orm";
import { releaseOn } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { flags, plans, signupReviews, storeEntitlements, stores } from "@/lib/db/schema";
import { KILL_SWITCHES, isKillKey, killTripped, type KillKey } from "@/lib/flags/registry";
import { getPlatformSetting } from "@/lib/settings";
import { scopedCache } from "./cache";
import {
  ENTITLEMENTS,
  ENTITLEMENT_KEYS,
  MiB,
  USAGE_METRICS,
  isEntitlementKey,
  type EntitlementKey,
  type EntitlementValue,
  type FeatureKey,
  type ResolvedEntitlements,
  type UsageMetric,
} from "./entitlement-keys";
import { whereStore } from "./sql";
import type { StoreScope, StoreStatus } from "./types";
import { QuotaError, usageValue } from "./usage";

export { QuotaError, chargePlatformUsage, chargeUsage, platformPeriodOf, platformUsageValue, refundPlatformUsage, refundUsage, usageValue, type ChargeResult, type PlatformUsageKey } from "./usage";
export type { PlatformUsageMetric } from "./entitlement-keys";

/** A feature refused for the plan, the store state, the release or a kill switch (UI: the limit sheet, `feature_off`). */
export class EntitlementError extends Error {
  constructor(
    readonly key: FeatureKey,
    readonly reason: "plan" | "state" | "release" | "kill",
    message = `feature off: ${key} (${reason})`,
  ) {
    super(message);
    this.name = "EntitlementError";
  }
}

export type OffReason = EntitlementError["reason"];

/* ------------------------------------------------------------------ */
/* State caps (§A.5.2)                                                 */
/* ------------------------------------------------------------------ */

/** The platform tunables the pending caps read (`platform.signup.*`, PLA-§2.4), passed in so the cap stays pure. */
export interface PendingCaps {
  mediaMiB: number; // signup.pendingMediaMiB (100)
  mediaMiBBeforeSubmit: number; // signup.pendingMediaMiBBeforeSubmit (20)
  membersMax: number; // signup.pendingMembersMax (2)
}

/** The PLA-§2.4 defaults, used when the caller passes no caps. */
export const DEFAULT_PENDING_CAPS: PendingCaps = { mediaMiB: 100, mediaMiBBeforeSubmit: 20, membersMax: 2 };

/** AI R5: a pending store's month is at most this many credits (the onboarding "wow"), whatever its plan says. */
export const PENDING_AI_CREDITS_MONTH = 100;

/** live only while `active` */
const LIVE_ONLY: ReadonlySet<EntitlementKey> = new Set(["publish", "take_orders"]);
/** integrations: off while pending, kept for existing orders while restricted, off from suspended on */
const INTEGRATIONS: ReadonlySet<EntitlementKey> = new Set(["sheets", "pixels_capi", "telegram", "webhooks", "php_export", "custom_domain", "api_keys"]);
/** building tools: on while pending, active and restricted */
const BUILDING: ReadonlySet<EntitlementKey> = new Set(["cloud_ai", "invites"]);

const minCap = (value: number | null, cap: number): number => (value === null ? cap : Math.min(value, cap));

/**
 * The §A.5.2 state caps over a resolved value. `submitted`: the store's signup review has `submitted_at` (the
 * two-tier pending media cap, D69). Pure.
 *
 * Features: publish / take_orders only while `active`; the integrations also while `restricted`; Cloud AI and
 * invites from `pending` to `restricted`; every one of those is false from `suspended` on. Limits: while `pending`,
 * `ai_credits_month` ≤ 100, `media_bytes` ≤ 20 MiB until "Submit for review" then ≤ 100 MiB, `members_max` ≤ 2,
 * `exports_month` = 0; `ai_credits_month` = 0 while `suspended` or `closed`. Keys and states the table does not cap
 * ("plan" and "—" cells: the store has no surface left to use them) keep their value, so no job ever reads a 0 it
 * would act on (versions_kept_per_page stays the plan's).
 */
export function applyStateCap<K extends EntitlementKey>(
  status: StoreStatus,
  key: K,
  value: EntitlementValue<K>,
  opts?: { submitted?: boolean; caps?: PendingCaps },
): EntitlementValue<K> {
  const caps = opts?.caps ?? DEFAULT_PENDING_CAPS;
  const out = (v: number | null | boolean) => v as EntitlementValue<K>;
  if (ENTITLEMENTS[key].kind === "feature") {
    if (LIVE_ONLY.has(key)) return out(status === "active" ? value : false);
    if (INTEGRATIONS.has(key)) return out(status === "active" || status === "restricted" ? value : false);
    if (BUILDING.has(key)) return out(status === "pending" || status === "active" || status === "restricted" ? value : false);
    return value;
  }
  const limit = value as number | null;
  switch (key) {
    case "ai_credits_month":
      if (status === "pending") return out(minCap(limit, PENDING_AI_CREDITS_MONTH));
      return out(status === "suspended" || status === "closed" ? 0 : limit);
    case "media_bytes":
      return out(status === "pending" ? minCap(limit, (opts?.submitted ? caps.mediaMiB : caps.mediaMiBBeforeSubmit) * MiB) : limit);
    case "members_max":
      return out(status === "pending" ? minCap(limit, caps.membersMax) : limit);
    case "exports_month":
      return out(status === "pending" ? 0 : limit);
    default:
      return value;
  }
}

/* ------------------------------------------------------------------ */
/* The AI limits computed from the month (§A.4; AI R3, R28, R30; D69) */
/* ------------------------------------------------------------------ */

/** The floor of the daily AI counter: 50 credits, 10 (`pendingDailyFloor`) while pending (rev 3, D69 / AI R30). */
export const AI_DAILY_FLOOR = 50;

/**
 * The `ai_credits_day` limit the ai part passes to chargeUsage (`opts.limit`): `min(max(floor, ceil(month ×
 * storeDailyCapPct / 100)), dailyUsdPerStore × 100)`, the floor 50, or `pendingDailyFloor` (10) while `pending`.
 * A month of 0 (suspended, closed) allows nothing; an unlimited month is limited by the USD ceiling only.
 */
export function aiDailyCreditLimit(
  status: StoreStatus,
  monthCredits: number | null,
  caps: { storeDailyCapPct: number; pendingDailyFloor: number; dailyUsdPerStore?: number | null },
): number | null {
  const usd = caps.dailyUsdPerStore == null ? null : Math.floor(caps.dailyUsdPerStore * 100);
  if (monthCredits === 0) return 0;
  if (monthCredits === null) return usd;
  const floor = status === "pending" ? caps.pendingDailyFloor : AI_DAILY_FLOOR;
  const daily = Math.max(floor, Math.ceil((monthCredits * caps.storeDailyCapPct) / 100));
  return usd === null ? daily : Math.min(daily, usd);
}

/** The `ai_credits_director` limit (AI R28): `ai_credits_month × directorSharePct / 100`, rounded down. */
export function directorCreditLimit(monthCredits: number | null, directorSharePct: number): number | null {
  return monthCredits === null ? null : Math.floor((monthCredits * directorSharePct) / 100);
}

/** The pending stores' slice of the monthly AI cap in micro-dollars (`ai_cost_micros_pending`, D69 / SEC-1). */
export function pendingAiSliceMicros(monthlyUsd: number, pendingSharePct: number): number {
  return Math.floor((monthlyUsd * 1_000_000 * pendingSharePct) / 100);
}

/* ------------------------------------------------------------------ */
/* Resolution (pure)                                                   */
/* ------------------------------------------------------------------ */

/** One `store_entitlements` row. */
export interface EntitlementRow {
  key: string;
  source: "override" | "boost";
  value: unknown;
  expiresAt: Date | null;
}

/** A `plans` row's overrides (keys are EntitlementKeys; unknown keys and ill-typed values are ignored). */
export interface PlanValues {
  limits: Record<string, unknown> | null;
  features: Record<string, unknown> | null;
}

export interface EntitlementInputs {
  status: StoreStatus;
  /** null: the store's plan row is missing (registry defaults) */
  plan: PlanValues | null;
  rows: readonly EntitlementRow[];
  submitted: boolean;
  caps: PendingCaps;
  now: Date;
}

/** Every key resolved, with why each false feature is false (the EntitlementError reason). */
export interface ResolvedSet {
  values: ResolvedEntitlements;
  off: Partial<Record<FeatureKey, OffReason>>;
}

/** A value of the right type for `key`: a limit is a non-negative integer or null, a feature a boolean. */
export function validEntitlementValue<K extends EntitlementKey>(key: K, value: unknown): value is EntitlementValue<K> {
  if (ENTITLEMENTS[key].kind === "feature") return typeof value === "boolean";
  return value === null || (typeof value === "number" && Number.isSafeInteger(value) && value >= 0);
}

const live = (row: EntitlementRow, now: Date) => row.expiresAt === null || row.expiresAt.getTime() > now.getTime();

/**
 * override > boost > plan > default, then the release, then the state cap (kill switches are applied on read, see
 * applyKillSwitches). Expired rows, rows of unknown keys and ill-typed values are skipped. Pure.
 */
export function resolveEntitlements(input: EntitlementInputs): ResolvedSet {
  const pick = (source: EntitlementRow["source"], key: EntitlementKey) =>
    input.rows.find((r) => r.source === source && r.key === key && live(r, input.now) && validEntitlementValue(key, r.value));
  const values = {} as Record<EntitlementKey, number | null | boolean>;
  const off: ResolvedSet["off"] = {};
  for (const key of ENTITLEMENT_KEYS) {
    const def = ENTITLEMENTS[key];
    const planBag = def.kind === "feature" ? input.plan?.features : input.plan?.limits;
    const planValue = planBag && Object.prototype.hasOwnProperty.call(planBag, key) && validEntitlementValue(key, planBag[key]) ? planBag[key] : undefined;
    const chosen = pick("override", key) ?? pick("boost", key);
    let value = (chosen ? chosen.value : planValue !== undefined ? planValue : def.default) as number | null | boolean;
    if (def.kind === "feature") {
      if ("release" in def && def.release && !releaseOn(def.release)) {
        value = false;
        off[key as FeatureKey] = "release";
      } else if (value === false) off[key as FeatureKey] = "plan";
    }
    const capped = applyStateCap(input.status, key, value as EntitlementValue<typeof key>, { submitted: input.submitted, caps: input.caps }) as number | null | boolean;
    if (def.kind === "feature" && value === true && capped === false) off[key as FeatureKey] = "state";
    values[key] = capped;
  }
  return { values: values as ResolvedEntitlements, off };
}

/**
 * The features each kill switch forces to false (§A.4, §H.8). `uploads_enabled` and `signups_enabled` have no
 * entitlement key (the media route and the signup forms read activeKillSwitches()); `platform_read_only` also makes
 * the seam refuse every write. `take_orders` is never here: orders keep flowing.
 */
export const KILL_FEATURES: Record<KillKey, readonly FeatureKey[]> = {
  signups_enabled: [],
  publishing_enabled: ["publish"],
  ai_generation_enabled: ["cloud_ai"],
  sheets_sync_enabled: ["sheets"],
  capi_enabled: ["pixels_capi"],
  uploads_enabled: [],
  platform_read_only: ["publish"],
};

/** A copy of `set` with the tripped switches' features false (reason "kill" unless already off). Pure. */
export function applyKillSwitches(set: ResolvedSet, kills: readonly KillKey[]): ResolvedSet {
  const values = { ...set.values } as Record<EntitlementKey, number | null | boolean>;
  const off = { ...set.off };
  for (const kill of kills) {
    for (const key of KILL_FEATURES[kill] ?? []) {
      if (values[key] === true) {
        values[key] = false;
        off[key] = "kill";
      }
    }
  }
  return { values: values as ResolvedEntitlements, off };
}

/* ------------------------------------------------------------------ */
/* Loading and caching                                                 */
/* ------------------------------------------------------------------ */

const TTL_MS = 30_000;
const setCache = scopedCache<ResolvedSet>({ name: "entitlements", maxEntries: 4_000, ttlMs: TTL_MS });
const flagCache = scopedCache<KillKey[]>({ name: "flags", maxEntries: 500, ttlMs: TTL_MS });
const PLATFORM = "p";

async function loadSet(scope: StoreScope): Promise<ResolvedSet> {
  const storeId = scope.storeId;
  const [storeRows, rows, submittedRows, platform] = await Promise.all([
    // tenancy: platform the store row itself and its plan (stores / plans are keyed by id, not by store_id)
    db
      .select({ status: stores.status, limits: plans.limits, features: plans.features, planId: plans.id })
      .from(stores)
      .leftJoin(plans, eq(plans.id, stores.planId))
      .where(eq(stores.id, storeId))
      .limit(1),
    db
      .select({ key: storeEntitlements.key, source: storeEntitlements.source, value: storeEntitlements.value, expiresAt: storeEntitlements.expiresAt })
      .from(storeEntitlements)
      .where(whereStore(storeEntitlements, scope)),
    db
      .select({ id: signupReviews.id })
      .from(signupReviews)
      .where(whereStore(signupReviews, scope, and(eq(signupReviews.kind, "signup"), isNotNull(signupReviews.submittedAt))))
      .limit(1),
    getPlatformSetting("platform"),
  ]);
  const store = storeRows[0];
  const { signup } = platform;
  return resolveEntitlements({
    // a scope whose store row is gone (a hard delete in a test) resolves like a purged store: everything off
    status: store?.status ?? "purged",
    plan: store?.planId ? { limits: store.limits ?? null, features: store.features ?? null } : null,
    rows: rows.map((r) => ({ key: r.key, source: r.source, value: r.value, expiresAt: r.expiresAt ?? null })),
    submitted: submittedRows.length > 0,
    caps: { mediaMiB: signup.pendingMediaMiB, mediaMiBBeforeSubmit: signup.pendingMediaMiBBeforeSubmit, membersMax: signup.pendingMembersMax },
    now: new Date(),
  });
}

async function resolvedSet(scope: StoreScope): Promise<ResolvedSet> {
  const [set, kills] = await Promise.all([setCache.getOrLoad(scope.storeId, "all", () => loadSet(scope)), activeKillSwitches()]);
  return applyKillSwitches(set, kills);
}

/** One key, resolved (cached with the store's whole set). */
export async function entitlement<K extends EntitlementKey>(scope: StoreScope, key: K): Promise<EntitlementValue<K>> {
  if (!isEntitlementKey(key)) throw new Error(`entitlements: unknown key "${String(key)}"`);
  return (await resolvedSet(scope)).values[key] as EntitlementValue<K>;
}

/** Every key, one query, cached 30 s (`scopedCache("entitlements")`). */
export async function entitlements(scope: StoreScope): Promise<ResolvedEntitlements> {
  return (await resolvedSet(scope)).values;
}

/** Throws EntitlementError when the feature resolves to false. */
export async function assertFeature(scope: StoreScope, key: FeatureKey): Promise<void> {
  if (!isEntitlementKey(key) || ENTITLEMENTS[key].kind !== "feature") throw new Error(`entitlements: "${String(key)}" is not a feature`);
  const set = await resolvedSet(scope);
  if (set.values[key] !== true) throw new EntitlementError(key, set.off[key] ?? "plan");
}

/** Throws QuotaError when `delta` more would pass the limit; charges nothing (chargeUsage does, atomically). */
export async function assertWithin(scope: StoreScope, metric: UsageMetric, delta: number): Promise<void> {
  const def = USAGE_METRICS[metric.metric];
  if (!def) throw new Error(`entitlements: unknown usage metric "${String(metric.metric)}"`);
  // soft metrics are never refused; the owner-computed limits (Director share, daily AI) are checked by chargeUsage
  if (("soft" in def && def.soft) || def.limit === null) return;
  const limit = (await entitlement(scope, def.limit)) as number | null;
  if (limit === null) return;
  const used = await usageValue(scope, metric);
  if (used + delta > limit) throw new QuotaError(metric, limit, used);
}

/** Drops the store's resolved set (plan change, override, boost, transition). */
export function invalidateEntitlements(storeId: string): void {
  setCache.delete(storeId);
}

/** The tripped kill switches (§H.8), cached 30 s (`scopedCache("flags")`). A missing or ill-typed row is not tripped. */
export async function activeKillSwitches(): Promise<KillKey[]> {
  return [
    ...(await flagCache.getOrLoad(PLATFORM, "kill", async () => {
      // tenancy: platform the kill switches are platform rows (§H.8)
      const rows = await db.select({ key: flags.key, value: flags.defaultValue }).from(flags).where(eq(flags.kind, "kill"));
      const tripped: KillKey[] = [];
      for (const key of KILL_SWITCHES) {
        const row = rows.find((r) => r.key === key);
        if (!row) continue;
        if (typeof row.value !== "boolean") {
          console.error(`[entitlements] kill switch "${key}" holds a non-boolean value; treated as not tripped`);
          continue;
        }
        if (killTripped(key, row.value)) tripped.push(key);
      }
      return tripped.filter(isKillKey);
    })),
  ];
}

/** Drops the cached flag and kill-switch values (PLA Q.16b: every console flag or kill write). */
export function invalidateFlags(): void {
  flagCache.clear();
}
