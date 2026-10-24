import "server-only";
/**
 * Entitlements (docs/STORE-SAAS.md §A.4, §A.5.2, §H.8): what a store may do and how much. The key registry is
 * isomorphic in ./entitlement-keys.ts; values resolve here, per key:
 *
 *   override (not expired) > boost (not expired) > plans.limits / plans.features > ENTITLEMENTS[key].default
 *   → applyStateCap(status, key, value) → the platform kill switches force their features to false
 *
 * Orders are never refused for a quota: `take_orders` is false only through a lifecycle state. The usage counters
 * live in ./usage.ts and are re-exported here, so callers import one module.
 *
 * Signatures frozen at C0a; T1 implements the bodies (§K.1). Until then the reads and asserts throw
 * "not implemented: T1"; the two cache invalidators are no-ops (nothing is cached yet), their documented safe default.
 */
import type { KillKey } from "@/lib/flags/registry";
import type { EntitlementKey, EntitlementValue, FeatureKey, ResolvedEntitlements, UsageMetric } from "./entitlement-keys";
import type { StoreScope, StoreStatus } from "./types";

export { QuotaError, chargePlatformUsage, chargeUsage, refundPlatformUsage, refundUsage, type ChargeResult, type PlatformUsageKey } from "./usage";
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

function notImplemented(fn: string, ...args: unknown[]): never {
  void args;
  throw new Error(`not implemented: T1 (${fn})`);
}

/** One key, resolved (cached with the store's whole set). */
export async function entitlement<K extends EntitlementKey>(scope: StoreScope, key: K): Promise<EntitlementValue<K>> {
  return notImplemented("entitlement", scope, key);
}

/** Every key, one query, cached 30 s (`scopedCache("entitlements")`). */
export async function entitlements(scope: StoreScope): Promise<ResolvedEntitlements> {
  return notImplemented("entitlements", scope);
}

/** Throws EntitlementError when the feature resolves to false. */
export async function assertFeature(scope: StoreScope, key: FeatureKey): Promise<void> {
  return notImplemented("assertFeature", scope, key);
}

/** Throws QuotaError when `delta` more would pass the limit; charges nothing (chargeUsage does, atomically). */
export async function assertWithin(scope: StoreScope, metric: UsageMetric, delta: number): Promise<void> {
  return notImplemented("assertWithin", scope, metric, delta);
}

/** Drops the store's resolved set (plan change, override, boost, transition). No-op until T1 caches. */
export function invalidateEntitlements(storeId: string): void {
  void storeId;
}

/** The platform tunables the pending caps read (`platform.signup.*`, PLA-§2.4), passed in so the cap stays pure. */
export interface PendingCaps {
  mediaMiB: number; // signup.pendingMediaMiB (100)
  mediaMiBBeforeSubmit: number; // signup.pendingMediaMiBBeforeSubmit (20)
  membersMax: number; // signup.pendingMembersMax (2)
}

/**
 * The §A.5.2 state caps over a resolved value. `submitted`: the store's signup review has `submitted_at` (the
 * two-tier pending media cap, D69). Pure.
 */
export function applyStateCap<K extends EntitlementKey>(
  status: StoreStatus,
  key: K,
  value: EntitlementValue<K>,
  opts?: { submitted?: boolean; caps?: PendingCaps },
): EntitlementValue<K> {
  return notImplemented("applyStateCap", status, key, value, opts);
}

/** The tripped kill switches (§H.8), cached 30 s (`scopedCache("flags")`). */
export async function activeKillSwitches(): Promise<KillKey[]> {
  return notImplemented("activeKillSwitches");
}

/** Drops the cached flag and kill-switch values (PLA Q.16b: every console flag or kill write). No-op until T1 caches. */
export function invalidateFlags(): void {
  // nothing cached before T1
}
