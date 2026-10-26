import "server-only";
/**
 * Pixel health (store setting pixel_health, docs/OFFERS.md §A.2 #4, §A.5): the last server outcome per
 * pixel of the store — "ok", "refused" (+ token · permission · pixel · rate · network · other) or
 * "unverified" (a token was saved or migrated and nothing confirmed it yet). No personal data, no token.
 *
 * Per store (docs/STORE-SAAS.md §D.10, PIX-06, SET-11): the row is the store's `store_settings` row and
 * the throttle is keyed `${storeId}:${platform}:${id}` (./throttle.ts), so two stores firing the same
 * pixel id never share an entry or suppress each other's write. Writes after each Purchase send are
 * throttled per worker: a pixel's entry is written when its state or code changes, or 10 minutes after
 * the last write for that pixel of that store. They go straight to the store's settings row (no
 * "settings.updated" audit line per order); admin writes (token changes, Send test event) use the same
 * path, unthrottled.
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { storeSettings } from "@/lib/db/schema";
import type { HealthCode } from "@/lib/orders/conversions-core";
import { getStoreSetting, invalidateStoreSettings } from "@/lib/settings";
import { PixelHealthSettings, type PixelHealth, type PixelHealthEntry } from "@/lib/settings/schemas";
import { inStore, storeValues } from "@/lib/tenancy/sql";
import type { StoreScope, WriteScope } from "@/lib/tenancy/types";
import type { PixelPlatform } from "./ids";
import { pixelKey } from "./library";
import { dueHealthUpdates, forgetHealthWrites, noteHealthWrite } from "./throttle";

export interface HealthUpdate {
  platform: PixelPlatform;
  id: string;
  state: PixelHealthEntry["state"];
  code?: HealthCode;
  testMode: boolean;
}

/** Health of every pixel of the store (fresh read). */
export async function getPixelHealth(scope: StoreScope): Promise<PixelHealth> {
  return getStoreSetting(scope, "pixel_health", { fresh: true });
}

async function writeHealth(scope: WriteScope, next: PixelHealth): Promise<void> {
  const value = PixelHealthSettings.parse(next);
  const updatedAt = new Date();
  await db
    .insert(storeSettings)
    .values(storeValues(scope, { key: "pixel_health", value, encrypted: false, purposeV: 2, updatedAt }))
    .onDuplicateKeyUpdate({ set: { value, encrypted: false, purposeV: 2, updatedAt } });
  invalidateStoreSettings(scope.storeId, "pixel_health");
}

/**
 * Record outcomes for the store's pixels. `throttle` (Purchase sends): skip pixels whose state/code did
 * not change and whose last write for this store in this worker is < 10 min old. Never throws.
 */
export async function recordPixelHealth(scope: WriteScope, updates: readonly HealthUpdate[], opts: { throttle?: boolean; now?: number } = {}): Promise<void> {
  try {
    const now = opts.now ?? Date.now();
    const due = opts.throttle ? dueHealthUpdates(scope.storeId, updates, now) : updates;
    if (!due.length) return;
    const current = await getPixelHealth(scope);
    const next: PixelHealth = { ...current };
    const at = new Date(now).toISOString();
    for (const u of due) {
      next[pixelKey(u.platform, u.id)] = { at, state: u.state, ...(u.code && u.state === "refused" ? { code: u.code } : {}), testMode: u.testMode };
      noteHealthWrite(scope.storeId, u, now);
    }
    await writeHealth(scope, next);
  } catch (err) {
    console.error("[pixels] health write failed:", err instanceof Error ? err.message : "unknown error");
  }
}

/** Drop the health of the store's removed pixels. */
export async function forgetPixelHealth(scope: WriteScope, keys: readonly string[]): Promise<void> {
  if (!keys.length) return;
  const current = await getPixelHealth(scope);
  let changed = false;
  for (const k of keys) {
    if (k in current) {
      delete current[k];
      changed = true;
    }
  }
  forgetHealthWrites(scope.storeId, keys);
  if (changed) await writeHealth(scope, current);
}

/** True when the store's pixel_health row exists (tests / migration). */
export async function hasHealthRow(scope: StoreScope): Promise<boolean> {
  const rows = await db
    .select({ key: storeSettings.key })
    .from(storeSettings)
    .where(and(inStore(storeSettings, scope), eq(storeSettings.key, "pixel_health")))
    .limit(1);
  return rows.length > 0;
}
