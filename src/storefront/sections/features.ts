/**
 * S1 STOREFRONT owns this file (src/storefront/** outside the four frozen contract files, STO-§27.2). Pre-registered by
 * the R2 contract step (C2-B1, maintainer) as the data the frozen src/storefront/fold.ts reads; S1 fills it without a
 * CCR (its registry's `features` and `fold` fields, STO-§9.2, should read the same values), the two export names and
 * types are frozen (src/lib/contracts/r2-contract.ts).
 *
 *  - `storeVariantFeatures(type, variant, data)`: the features of any section a store document holds: a store section
 *    through the store registry's `features` (STO-§6.1 `features.h` values: storeHero 1.0, collectionTiles 0.9, ...),
 *    a landing section through design's `variantFeatures`. The stub answers design's resolver for every type (a store
 *    type it does not know gets the documented defaults, 1 screen), so the height model runs before S1 merges.
 *  - `STORE_FOLD_LAYOUTS`: each hero family's FoldLayout (STO-§9.5 home families, STO-§12.8 PDP families). The stub
 *    holds what the spec states: the `mustShow` columns, the PDP families' measured CTA bottoms (fr, 2-line name,
 *    single offer: STO-§12.8 "Measured bottoms at 390"), 33 px per extra name line and 64 px per extra offer card
 *    (STO-§12.8 composition). The home families' bottoms are not measured yet: S1 records them from its render
 *    calibration (`qa:storefront-e2e`); until then they are empty and the fold gate has no item to judge.
 *
 * Pure and isomorphic.
 */
import { variantFeatures } from "@/lib/design/features";
import type { FoldLayoutData, VariantFeaturesResolved } from "@/lib/design/types.frozen";

export function storeVariantFeatures(type: string, variant: string, data: unknown): VariantFeaturesResolved {
  return variantFeatures(type, variant, data);
}

const PDP_MUST_SHOW = ["image", "name", "price", "cod", "cta"] as const;
const pdp = (ctaBottom: number, text: FoldLayoutData["text"]): FoldLayoutData => ({ mustShow: [...PDP_MUST_SHOW], bottoms: { cta: ctaBottom }, perNameLine: 33, perOfferCard: 64, text });
const home = (mustShow: FoldLayoutData["mustShow"], text: FoldLayoutData["text"]): FoldLayoutData => ({ mustShow, bottoms: {}, perNameLine: 33, perOfferCard: 64, text });

/** Section type → variant (family) → FoldLayout. The frozen `foldLayoutFor(kind, variant)` reads this table. */
export const STORE_FOLD_LAYOUTS: Readonly<Record<"storeHero" | "productDetail" | "collectionHeader", Readonly<Record<string, FoldLayoutData>>>> = {
  storeHero: {
    stage: home(["image", "name", "price", "cta", "identity"], "column"),
    "editorial-split": home(["image", "cta", "identity"], "column"),
    "poster-type": home(["image", "cta", "identity"], "column"),
    "bento-lead": home(["collections", "cta", "identity"], "column"),
    "cinematic-bleed": home(["image", "cta", "identity"], "overlap"),
    "quiet-luxe": home(["cta", "identity"], "column"),
    "catalogue-index": home(["collections", "cta", "identity"], "column"),
    "specimen-sheet": home(["image", "name", "price", "cta", "identity"], "column"),
  },
  productDetail: {
    stacked: pdp(696, "column"),
    split: pdp(712, "column"),
    immersive: pdp(730, "overlap"),
    specimen: pdp(746, "column"),
    quiet: pdp(764, "column"),
    rail: pdp(768, "column"),
  },
  collectionHeader: {},
};
