import "server-only";
/**
 * The store's template set (storefront.md STO-D2, STO-§6.3; core §A.2, §A.5.1, STO-R17). Track S1 owns this file in R2
 * and writes the body: one `home`, `product`, `collection`, `search`, `cart`, `checkout`, `not_found` page per store,
 * created as drafts from `defaultTemplate(kind, shape)` under the named lock `templates` (src/lib/db/locks.ts), the
 * utility kinds published in the states that publish.
 *
 *   ensureTemplateSet(scope, opts)   idempotent; answers the kinds it created and published
 *
 * The R2 contract step (C2-B2) froze the signature (src/lib/contracts/r2-contract.ts) and wrote its two callers: the
 * mode switch to `store` / `both` (`updateStoreMode`, src/lib/admin-data/store-profile.ts) and the `pending → active`
 * transition of a `store` / `both` store (src/lib/tenancy/lifecycle.ts), both with a system scope and both only while
 * `releaseOn("R2")`. Until S1 writes it, this is the typed no-op of §A.2.
 */
import type { Actor, WriteScope } from "@/lib/tenancy/types";
import type { StorePageKind } from "@/storefront/schema";

/** The store page kinds exist before the first request reaches them (S1, R2). Contract stub: nothing created. */
export async function ensureTemplateSet(scope: WriteScope, opts?: { actor?: Actor }): Promise<{ created: StorePageKind[]; published: StorePageKind[] }> {
  void scope;
  void opts;
  return { created: [], published: [] };
}
