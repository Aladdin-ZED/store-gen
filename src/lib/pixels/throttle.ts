/**
 * The per-worker throttle of pixel health writes after Purchase sends (docs/OFFERS.md §A.5), keyed by store
 * (docs/STORE-SAAS.md §E.6, SET-11: `${storeId}:${platform}:${id}`). One store's write never suppresses
 * another store's, even for the same pixel id. Framework-free (the conversions check runs it offline).
 *
 *   const due = dueHealthUpdates(storeId, updates, now);   // the updates worth writing
 *   for (const u of due) noteHealthWrite(storeId, u, now);  // once written
 */
import { scopedCache } from "@/lib/tenancy/cache";
import type { PixelPlatform } from "./ids";
import { HEALTH_THROTTLE_MS, healthWriteDue, pixelKey } from "./library";

interface LastWrite {
  state: string;
  code?: string;
  at: number;
}

/** An entry older than the throttle window is as good as none, so the cache may forget it. */
const writes = () => scopedCache<LastWrite>({ name: "pixel-health", maxEntries: 4_000, ttlMs: HEALTH_THROTTLE_MS + 60_000 });

type Update = { platform: PixelPlatform; id: string; state: string; code?: string };

/** The updates whose state or code changed, or whose last write for this store is ≥ 10 min old. */
export function dueHealthUpdates<U extends Update>(storeId: string, updates: readonly U[], now: number): U[] {
  const cache = writes();
  return updates.filter((u) => healthWriteDue(cache.get(storeId, pixelKey(u.platform, u.id)), u, now));
}

/** Remember a write of this store's pixel (this worker). */
export function noteHealthWrite(storeId: string, u: Update, now: number): void {
  writes().set(storeId, pixelKey(u.platform, u.id), { state: u.state, code: u.code, at: now });
}

/** Forget the store's removed pixels ("platform:id" keys). */
export function forgetHealthWrites(storeId: string, keys: readonly string[]): void {
  const cache = writes();
  for (const k of keys) cache.delete(storeId, k);
}
