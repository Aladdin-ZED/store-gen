import "server-only";
/**
 * The order path of an attached landing (storefront.md STO-§17.3, STO-R12 (b); core §K.4 R2 contract step, C2-B2).
 *
 *   attachedDocFor(scope, target)   the version's doc with the LIVE product's items and stock overlaid, its offers kept
 *
 * `orderVersion` (src/lib/orders/resolve.ts) applies it to every page with `pages.product_id` and forces the fallback
 * comparison, so a shopper is never charged a price they did not see (any total ≠ `st` answers `stale`). Track S1 owns
 * this file in R2 and writes the body (`materializeAttached` over the product, STO-§17.2); the contract step froze the
 * signature (src/lib/contracts/r2-contract.ts) and ships the identity below. Nothing in R1 calls it: no landing is
 * attached to a product before R2, and `orderVersion` checks `releaseOn("R2")` first.
 */
import type { PageDoc } from "@/lib/page/schema";
import type { StoreScope } from "@/lib/tenancy/types";

export interface AttachedTarget {
  pageId: string;
  /** `pages.product_id`: a product of the same store */
  productId: string;
  /** the version the order is validated against (`orderVersion`'s choice) */
  versionId: string;
  doc: PageDoc;
}

/** The version's doc priced from the live product (S1, R2). Contract stub: the version's own doc. */
export async function attachedDocFor(scope: StoreScope, target: AttachedTarget): Promise<PageDoc> {
  void scope;
  return target.doc;
}
