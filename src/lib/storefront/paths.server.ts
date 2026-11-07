import "server-only";
/**
 * The store's public page paths (S1 STOREFRONT owns this file in R2). The contract step (C2-C) froze
 * `storePathsFor(scope)` for S6 PLATFORM UX's edge purge: when a purge by tag is not possible, S6 purges the store's
 * paths by file list (home, `/p/<slug>` of active products, `/c/<slug>` of live collections, custom pages, policies,
 * search, cart, checkout), capped; `truncated` says the list was cut at the cap (S6 then purges the whole host).
 * Stub until S1 merges: the typed empty value (no store page exists before S1). No R1 path calls it.
 */
import type { StoreScope } from "@/lib/tenancy/types";

/** Every public store page path of the store (paths only, no host), at most the S1 cap. S1 (stub: empty). */
export async function storePathsFor(scope: StoreScope): Promise<{ paths: string[]; truncated: boolean }> {
  void scope;
  return { paths: [], truncated: false };
}
