import "server-only";
/**
 * Public resolvers (docs/STORE-SAAS.md §E.2, §E.3 rule 6, §E.5): the only code that finds a store's row by a random
 * global key (page key, export key, tracking link, kit share token, test token) or by its handle, for the public
 * route handlers (order, lead, event, upsell, track, store pages). Each answers a `PublicTarget` whose scope every
 * later query uses; each key lookup is annotated `// tenancy: public-key <key>`.
 *
 * Signatures fixed by C0a; T3 implements the bodies in R1.0 (the 15 s caches of §E.5, the handle-history lookup,
 * the servable-state rules of §A.5.3), the maintainer owns the file from P0 (§K.1, ENGC-27). C0a's working parts:
 * `publicScope`, and `resolveStoreByHandle` / `getStoreById` as uncached reads (the seam needs them); the others
 * throw "not implemented: T3", except `resolveTestToken`, whose safe default is "not a test" (an unverifiable
 * token never marks an order).
 */
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { stores } from "@/lib/db/schema";
import type { PageTarget } from "@/lib/orders/resolve";
import { isHandle } from "./handles";
import { mintScope } from "./seam";
import type { PublicTarget, StoreRow, StoreScope } from "./types";

const STORE_ID_RE = /^[0-9A-Z]{26}$/;

function notImplemented(fn: string, ...args: unknown[]): never {
  void args;
  throw new Error(`not implemented: T3 (${fn})`);
}

/** The `stores` row as the seam and the public routes see it; null for a purged tombstone (no handle). */
function toStoreRow(r: typeof stores.$inferSelect): StoreRow | null {
  if (!r.handle) return null;
  return {
    id: r.id,
    handle: r.handle,
    name: r.name,
    mode: r.mode,
    status: r.status,
    planId: r.planId,
    market: r.market,
    currency: r.currency,
    timezone: r.timezone,
    defaultLocale: r.defaultLocale,
    homePageId: r.homePageId,
    brandSeed: r.brandSeed,
    catalogVersion: r.catalogVersion,
    addressVersion: r.addressVersion,
    requireMember2fa: r.requireMember2fa,
    primaryDomain: null, // verified custom domains arrive with store_domains (R3)
  };
}

/** By handle, any status but purged. T3: cached 15 s (misses 10 s, ≤ 4,096 negative entries), history lookup on a miss. */
export async function resolveStoreByHandle(handle: string): Promise<StoreRow | null> {
  if (!isHandle(handle)) return null;
  const [row] = await db.select().from(stores).where(eq(stores.handle, handle)).limit(1);
  return row ? toStoreRow(row) : null;
}

/** By id, any status but purged (jobs, lifecycle, the console). T3: the same `stores` cache as the handle. */
export async function getStoreById(storeId: string): Promise<StoreRow | null> {
  if (!STORE_ID_RE.test(storeId)) return null;
  const [row] = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  return row ? toStoreRow(row) : null;
}

/** The scope of a resolved public target (kind "public": a WriteScope, so the public order path can insert). */
export function publicScope(store: StoreRow): StoreScope & { readonly kind: "public" } {
  return mintScope("public", store.id);
}

/** via pages.public_key / exports.public_key; servable stores only; cached like today's __codOrderCache with storeId + status (ORD-01). */
export async function resolvePublicTarget(pageKey: string): Promise<(PublicTarget & PageTarget) | null> {
  return notImplemented("resolvePublicTarget", pageKey);
}

/** LAN Q11: `/track`, the signed-link check inside. */
export async function resolveOrderForTracking(orderId: string, sig: string | null): Promise<(PublicTarget & { orderId: string }) | null> {
  return notImplemented("resolveOrderForTracking", orderId, sig);
}

/** LAN Q11: `/kit/<token>` by sha256(token) = campaigns.share_token_hash. */
export async function resolveKitShare(token: string): Promise<(PublicTarget & { campaignId: string }) | null> {
  return notImplemented("resolveKitShare", token);
}

/** D54: hmac(exp, "test-order:<storeId>") within 2 h; pure, no DB. C0a: every token is "not a test" until T3. */
export function resolveTestToken(store: StoreRow, token: string | null): { test: boolean } {
  void store;
  void token;
  return { test: false };
}
