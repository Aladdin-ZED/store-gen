/**
 * The product document (storefront.md STO-§4.1; isomorphic, pure). Track S1 STOREFRONT owns this file in R2 and adds
 * `ProductDocJson` validation (`checkProductDoc`, the STO-§4.4 store rules) and the body of `productAsPageDoc`. The
 * contract step (C2-C, core §K.4 rev 4 / OPS-14, PLA Q3.8) froze the signature of the synthetic-doc builder below,
 * including the onboarding `direction`, because three other tracks call it before S1 merges:
 *   - S6 PLATFORM UX: the store-mode onboarding reveal (`useDirectionAction`) renders three folds of one product, one
 *     per direction, with `productAsPageDoc(product, { …sctx, direction })`;
 *   - S7 AI DATA: the store blueprint critique builds the PDP doc it reviews;
 *   - S1's own product picker (S4's manual-order sheet) builds the Offers v2 pickers from it.
 * Stub until S1 merges: throws `NotBuiltYet("S1", "productAsPageDoc")`. No R1 path calls it (no product exists in R1).
 */
import { notBuiltYet } from "@/lib/contracts/not-built";
import type { inventoryLevels, ProductRow } from "@/lib/db/schema";
import type { PageGenes } from "@/lib/design/genome";
import type { FormConfig, Locale, PageDoc, ThemeSpec, Tracking } from "@/lib/page/schema";
import type { StoreRow } from "@/lib/tenancy/types";

/** One `inventory_levels` row (STO-§3.2, §5.3): the `applyStock` input. */
export type InventoryLevelRow = typeof inventoryLevels.$inferSelect;

/** What the builder reads of a product row (a saved row, or the editor's unsaved draft). */
export type ProductRowLike = Pick<ProductRow, "id" | "publicKey" | "rev" | "status" | "slug" | "doc" | "content">;

export interface ProductDocStoreCtx {
  store: StoreRow;
  locale: Locale;
  /** the store field model (STO-§15.5) as a FormConfig */
  form: FormConfig;
  /** STO-D25 */
  minFeeCents: number;
  /** `applyStock` input (STO-§5.3) */
  levels: readonly InventoryLevelRow[];
  /** compiled store theme, commerce register (STO-§8.4) */
  theme: ThemeSpec;
  /** storefront pixel answer (STO-D18) */
  tracking: Tracking;
  /**
   * rev 4 (OPS-14, core §A.2 / §K.4, PLA Q3.8): the onboarding direction of a `store`-mode reveal. When set, `theme` is
   * compiled from the direction's genome in the commerce register (never the store theme, which does not exist yet)
   * and the PDP family is the one the direction's G2 draws (STO-§12.8 pool), so the three reveal folds differ in
   * family, pairing and colour; the priced content (items, offers, stock) is identical across directions.
   */
  direction?: { key: string; genome: PageGenes };
}

/**
 * The synthetic PageDoc of a product, used by the renderer, the runtime config v2 and order validation (STO-§12.2,
 * §16.4): `{ v: 2, locale, market, currency, product (rating dropped), items: applyStock(…).items, offers (shipping =
 * minFeeCents / 100, no bump, no upsell), form, theme, sections: [], seo, tracking, thankYou }` through
 * `PageDocObject.parse`. S1 (stub: NotBuiltYet).
 */
export function productAsPageDoc(p: ProductRowLike, s: ProductDocStoreCtx): PageDoc {
  void p;
  void s;
  return notBuiltYet("S1", "productAsPageDoc");
}
