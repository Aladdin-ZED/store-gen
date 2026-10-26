import "server-only";
/**
 * Media byte quotas (docs/STORE-SAAS.md §A.4, §G.4 step 4, D23, D69; TENANCY-MAP MED-03, MED-13).
 *
 * The charge is what the files take in storage (master + every variant + AVIF, the asset's `stored_bytes`), against
 * the store's `media_bytes` gauge through T1's atomic usage API: one conditional UPDATE, so 20 parallel uploads at
 * the limit let exactly the allowed ones through. A **pending** store first charges the one disk budget every
 * sandbox shares (`pending_media_bytes`, `platform.signup.pendingMediaTotalMiB`), then its own two-tier cap (the
 * state cap T1's entitlement applies). A refused charge writes nothing and throws QuotaError; every charge returns
 * its refund, which the caller runs in a `finally` when a later step fails.
 */
import { logError } from "@/lib/orders/log";
import { getPlatformSetting } from "@/lib/settings";
import { usageMetric } from "@/lib/tenancy/entitlement-keys";
import { QuotaError, chargePlatformUsage, chargeUsage, refundPlatformUsage, refundUsage } from "@/lib/tenancy/usage";
import type { StoreRow, WriteScope } from "@/lib/tenancy/types";

export { QuotaError };

const MiB = 1024 * 1024;

/** What the charge needs of the store's row besides the scope: its state (pending) and time zone. */
export type MediaStore = Pick<StoreRow, "status" | "timezone">;

/** Charge `bytes` (> 0) of media to the scope's store; the returned refund is idempotent. Throws QuotaError. */
export async function chargeMediaBytes(scope: WriteScope, store: MediaStore, bytes: number): Promise<() => Promise<void>> {
  if (!(bytes > 0)) return async () => undefined;
  const metric = usageMetric("media_bytes", new Date(), store.timezone);
  const pending = store.status === "pending";
  if (pending) {
    const { signup } = await getPlatformSetting("platform");
    await chargePlatformUsage("pending_media_bytes", "total", bytes, { limit: signup.pendingMediaTotalMiB * MiB });
  }
  try {
    await chargeUsage(scope, metric, bytes);
  } catch (err) {
    if (pending) await refundPlatformUsage("pending_media_bytes", "total", bytes).catch((e: unknown) => logError("media:quota:refund", e));
    throw err;
  }
  let refunded = false;
  return async () => {
    if (refunded) return;
    refunded = true;
    await refundMediaBytes(scope, store, bytes);
  };
}

/**
 * Give `bytes` back (a failed upload, a deleted asset). Never throws: a refund that fails leaves the gauge high
 * until the nightly `usage.reconcile` recomputes it from `SUM(assets.stored_bytes)` (§D.7), and is logged.
 */
export async function refundMediaBytes(scope: WriteScope, store: MediaStore, bytes: number): Promise<void> {
  if (!(bytes > 0)) return;
  await refundUsage(scope, usageMetric("media_bytes", new Date(), store.timezone), bytes).catch((e: unknown) => logError("media:quota:refund", e));
  if (store.status === "pending") {
    await refundPlatformUsage("pending_media_bytes", "total", bytes).catch((e: unknown) => logError("media:quota:refund", e));
  }
}

/** The quota a refused charge hit: the store's own storage, or the sandbox budget pending stores share (D69). */
export function quotaKind(err: QuotaError): "store" | "pending" {
  return err.metric.metric === "pending_media_bytes" ? "pending" : "store";
}
