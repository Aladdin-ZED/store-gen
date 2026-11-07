import "server-only";
/**
 * `stores.catalog_version` bumps (docs/STORE-SAAS.md §K.4 R2 contract step C2-B2, STO-R19 accepted, STO-§7.5, STO-D47).
 * Store pages (R2) are cached and tagged on `catalog_version` (the render cache key, `#sg-config`, ETags; STO-§7.4), so
 * every write that changes what a store page shows bumps it, and the next request renders afresh:
 *
 *   bumpCatalogVersion(scope, reason)           one bump of the scope's store (+ its cached views dropped)
 *   bumpCatalogVersionForAsset(scope, assetId)  the `cutout` render handler's bump: once for the store when an ACTIVE
 *                                               product of it references the asset (`asset_refs`, kind `product`)
 *
 * Callers (the core's, written at the contract step): delivery-zone writes (`saveZones`), the `store`, `policies`,
 * `brand`, `checkout` and `storefront` store settings (src/lib/settings `afterStoreWrite`), every `ops` write that
 * changes `callingWindow` (closed dates inside it) or `windowOverrides` (P4's `writeOps`, behind
 * `saveOpsSettingsAction` / `saveCallingWindowAction` / `saveWindowOverridesAction`), P8's cutout enqueue
 * (src/lib/media/process.ts). The tracks call it from their own writes (S1: products, inventory, collections, templates;
 * S2: theme activation, "Use this logo", undo). Landing pages never read the counter except through the R1 render
 * cache key (`kind:path:catalogVersion:addressVersion`), so a bump costs a landing page one fresh render, never a byte.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { assetRefs, products, stores } from "@/lib/db/schema";
import { invalidateStore } from "./cache";
import { whereStore } from "./sql";
import type { WriteScope } from "./types";

/** Why a store's catalogue view moved (STO-§7.5 rows); documentation and tests only. */
export type CatalogBumpReason = "zones" | "settings" | "ops" | "theme" | "brand" | "cutout" | "catalog" | "inventory" | "template" | "review";

/** One bump of the scope's store; its cached store row and render entries are dropped so the next request sees it. */
export async function bumpCatalogVersion(scope: WriteScope, reason: CatalogBumpReason): Promise<void> {
  void reason;
  // `stores` is the tenancy root: the scope's own row only
  await db
    .update(stores)
    .set({ catalogVersion: sql`${stores.catalogVersion} + 1` })
    .where(eq(stores.id, scope.storeId));
  invalidateStore(scope.storeId);
}

/**
 * STO-D47 (rev 4): a BiRefNet mask arrived for `assetId`; when an active product of the store references the asset, the
 * store's catalogue view changed (the PDP hero swaps its framed photo for the cutout with no republish): one bump.
 * True when it bumped.
 */
export async function bumpCatalogVersionForAsset(scope: WriteScope, assetId: string): Promise<boolean> {
  const [hit] = await db
    .select({ id: products.id })
    .from(assetRefs)
    .innerJoin(products, and(eq(products.storeId, assetRefs.storeId), eq(products.id, assetRefs.ownerId)))
    .where(whereStore(assetRefs, scope, eq(assetRefs.assetId, assetId), eq(assetRefs.ownerKind, "product"), eq(products.status, "active")))
    .limit(1);
  if (!hit) return false;
  await bumpCatalogVersion(scope, "cutout");
  return true;
}
