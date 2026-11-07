import "server-only";
/**
 * The store's sitemap entries beyond its landing pages (storefront.md STO-§20.5; S1 STOREFRONT owns this file in R2).
 * The R2 contract step (C2-E) froze the signature for the maintainer's seam in `src/lib/render/store-routes.server.ts`:
 * the sitemap branch appends these entries (R2 only) after the published landing pages. S1's body: the home, active
 * products (lastmod = updated_at), active non-empty collections, published custom pages without noindex, indexable
 * attached landings, policy pages whose facts exist, at the canonical origin (absolute URLs), cached per
 * `catalog_version`. Contract body until S1 merges: no entry.
 */
import type { StoreRow, StoreScope } from "@/lib/tenancy/types";

/** One `<url>` of the store's sitemap: an absolute URL (an entry without one is left out by `sitemapXml`). */
export interface SitemapEntry {
  loc: string;
  lastmod?: Date;
}

/** The catalog's sitemap entries (S1; contract body: none). */
export async function catalogSitemapEntries(scope: StoreScope, store: StoreRow): Promise<SitemapEntry[]> {
  void scope;
  void store;
  return [];
}
