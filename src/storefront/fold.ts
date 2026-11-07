/**
 * FROZEN CONTRACT: written by the R2 contract step (C2-B1, maintainer; docs/STORE-SAAS.md §K.4, storefront.md
 * STO-§27.1, STO ENGP-27 "four frozen files"). Owning track: S1 STOREFRONT builds the hero families on it; S2 (the
 * Brand Genome's G2 draw), design's gates and the core's budget gate (budget:C2, `BudgetProfile.fold = "kind-layout"`)
 * read it. A track never edits this file: a change goes through a CCR to the maintainer (docs/saas/ccr/README.md) and
 * is re-frozen in src/lib/contracts/r2-contract.ts.
 *
 * Hero families, grammars and fold layouts (STO-§9.5, §12.8; STO-D31, D32, DS33). Pure and isomorphic: data
 * (`HERO_FAMILIES`, `PDP_FAMILIES`, `FAMILY_GRAMMARS`, the pools, `FoldLayout`, `foldLayoutFor`) and the one wrapper
 * `checkFold`, a THIN call into design's height model (`estimateHeights`, DES-§8.13 point 2): there is no second fold
 * computation here. The layouts themselves are S1's data (./sections/features.ts `STORE_FOLD_LAYOUTS`).
 */
import { estimateHeights } from "@/lib/design/heights";
import type { FoldItem, FoldLayoutData } from "@/lib/design/types.frozen";
import type { Grammar, Locale } from "@/lib/page/schema";
import { FOLD_BAND, FOLD_LINE_PX, FOLD_SOFT_PX } from "@/lib/render/prepublish/budget-limits";
import type { StorePageDoc, StorePageKind } from "./schema";
import { STORE_FOLD_LAYOUTS, storeVariantFeatures } from "./sections/features";

export type { FoldItem } from "@/lib/design/types.frozen";

/** `storeHero` variants (home, page; STO-§9.5). */
export const HERO_FAMILIES = ["stage", "editorial-split", "poster-type", "bento-lead", "cinematic-bleed", "quiet-luxe", "catalogue-index", "specimen-sheet"] as const;
/** `productDetail` variants (STO-§12.8). */
export const PDP_FAMILIES = ["split", "stacked", "rail", "immersive", "specimen", "quiet"] as const;
export type HeroFamily = (typeof HERO_FAMILIES)[number];
export type PdpFamily = (typeof PDP_FAMILIES)[number];

/** The "grammars served" columns of STO-§9.5 and STO-§12.8 (design's G2, DES-§4.1). */
export const FAMILY_GRAMMARS: Readonly<Record<HeroFamily | PdpFamily, readonly Grammar[]>> = {
  stage: ["stage"],
  "editorial-split": ["editorial-column", "split-tension"],
  "poster-type": ["poster"],
  "bento-lead": ["gallery-led"],
  "cinematic-bleed": ["cinematic"],
  "quiet-luxe": ["quiet-luxe"],
  "catalogue-index": ["catalogue", "specimen"],
  "specimen-sheet": ["specimen"],
  split: ["split-tension", "editorial-column"],
  stacked: ["poster", "catalogue"],
  rail: ["catalogue", "specimen"],
  immersive: ["cinematic"],
  specimen: ["specimen"],
  quiet: ["quiet-luxe"],
};

/** The store's G2 → home hero family, with weights (the storefront's row of DES-§5.4; STO-§9.5 "Pool weights"). */
export const HERO_POOL: Readonly<Record<Grammar, readonly (readonly [HeroFamily, number])[]>> = {
  stage: [["stage", 0.7], ["specimen-sheet", 0.3]],
  "editorial-column": [["editorial-split", 0.6], ["quiet-luxe", 0.4]],
  poster: [["poster-type", 0.7], ["bento-lead", 0.3]],
  "gallery-led": [["bento-lead", 0.6], ["editorial-split", 0.4]],
  specimen: [["specimen-sheet", 0.6], ["catalogue-index", 0.4]],
  catalogue: [["catalogue-index", 0.7], ["bento-lead", 0.3]],
  "split-tension": [["editorial-split", 0.7], ["stage", 0.3]],
  cinematic: [["cinematic-bleed", 0.8], ["poster-type", 0.2]],
  "quiet-luxe": [["quiet-luxe", 0.7], ["editorial-split", 0.3]],
};

/** The store's G2 → PDP family, with weights (STO-§12.8 "Pool weights"). */
export const PDP_POOL: Readonly<Record<Grammar, readonly (readonly [PdpFamily, number])[]>> = {
  "split-tension": [["split", 0.7], ["immersive", 0.3]],
  "editorial-column": [["split", 0.6], ["quiet", 0.4]],
  poster: [["stacked", 0.6], ["immersive", 0.4]],
  "gallery-led": [["rail", 0.6], ["immersive", 0.4]],
  stage: [["specimen", 0.5], ["split", 0.5]],
  specimen: [["specimen", 0.7], ["rail", 0.3]],
  catalogue: [["rail", 0.5], ["stacked", 0.5]],
  cinematic: [["immersive", 0.7], ["split", 0.3]],
  "quiet-luxe": [["quiet", 0.8], ["split", 0.2]],
};

/**
 * A hero family's fold contract (STO-§9.5), the shape design's height model reads (`FoldLayoutData`,
 * src/lib/design/types.frozen.ts):
 *  - `mustShow`: elements that must sit inside the first 844 px at 390 in every locale (the SERVER gate, budget:C2,
 *    through the height model with its error band); 360 × 740 is a Playwright-only soft check in qa:storefront-e2e;
 *  - `bottoms`: estimated px from the top of each mustShow item's bottom edge at 390, for a 2-line name in the store's
 *    locale and a single-offer picker (`cta` = the primary action's bottom edge); layout data only, the gate reads the
 *    model's `FoldReport.items` = each item's estimated TOP, derived as bottom − the item's own height;
 *  - `perNameLine` (ar: × 1.06) and `perOfferCard` (`stack` / `tiers` pickers): what the estimator adds for the
 *    store's longest name and tallest picker;
 *  - `text`: where the hero's single text block sits (start-aligned column, centred statement, or overlapping the image).
 */
export type FoldLayout = FoldLayoutData;

/** The hero section of a kind: the section whose variant is the family. */
export const HERO_SECTION_OF: Readonly<Partial<Record<StorePageKind, "storeHero" | "productDetail" | "collectionHeader">>> = {
  home: "storeHero",
  page: "storeHero",
  product: "productDetail",
  collection: "collectionHeader",
};

/** The registry's `fold` entry of a kind's hero variant; null for a kind without a hero family or an unknown variant. Data only. */
export function foldLayoutFor(kind: StorePageKind, variant: string): FoldLayout | null {
  const type = HERO_SECTION_OF[kind];
  return (type && STORE_FOLD_LAYOUTS[type][variant]) || null;
}

/** The announcement bar's height at 390, added above the hero when the store shows one (STO-§12.8). */
export const ANNOUNCEMENT_PX = 36;
/** Arabic display lines run taller (STO-§9.5 `perNameLine`: ar × 1.06). */
export const AR_LINE_FACTOR = 1.06;

/** A fold item outside the target zone (core §M.2 three zones; `estimated`: the verdict comes from the height model). */
export interface FoldIssue {
  item: FoldItem;
  /** the item's estimated top at 390 */
  top: number;
  /** hard: top × FOLD_BAND > 844 (> 938 px); soft: a note in 760-938 px */
  level: "hard" | "soft";
  estimated: true;
}

/** The layout for one sample: the announcement bar above everything, extra name lines below the name, extra offer cards above the CTA. */
export function sampledLayout(layout: FoldLayout, locale: Locale, sample: { nameLines: 2 | 3; offerCards: number; announcement: boolean }): FoldLayout {
  const lineShift = Math.max(0, sample.nameLines - 2) * layout.perNameLine * (locale === "ar" ? AR_LINE_FACTOR : 1);
  const cardShift = Math.max(0, sample.offerCards - 1) * layout.perOfferCard;
  const top = sample.announcement ? ANNOUNCEMENT_PX : 0;
  const bottoms: FoldLayout["bottoms"] = {};
  for (const [k, b] of Object.entries(layout.bottoms) as [FoldItem, number][]) {
    // every item may sit below the name (the conservative reading); only the CTA sits below the offer picker
    bottoms[k] = Math.round(b + top + lineShift + (k === "cta" ? cardShift : 0));
  }
  return { ...layout, bottoms };
}

/**
 * rev 3 (ENGP-1, DS33): a THIN call into design's height model, never a second fold computation:
 * `estimateHeights(doc, { look, locale, features })` with the store's section features and the kind's FoldLayout (for
 * this sample) passed through `features.fold.layout` of the hero section; returns the FoldReport items outside the
 * target zone as FoldIssue[] (rev 4, core §M.2 three zones: hard when an item's estimated top × 0.9 > 844, i.e.
 * > 938 px; soft note with `estimated` when 760 < top ≤ 938; nothing at ≤ 760).
 */
export function checkFold(doc: StorePageDoc, kind: StorePageKind, variant: string, locale: Locale, sample: { nameLines: 2 | 3; offerCards: number; announcement: boolean }): FoldIssue[] {
  const layout = foldLayoutFor(kind, variant);
  const heroType = HERO_SECTION_OF[kind];
  if (!layout || !heroType) return [];
  const sampled = sampledLayout(layout, locale, sample);
  const report = estimateHeights(doc, {
    look: null,
    locale,
    features: (type, v, data) => {
      const f = storeVariantFeatures(type, v, data);
      // the kind's hero section carries the family under test (the draw checks a candidate before the doc holds it)
      return type === heroType ? { ...f, fold: { rows: f.fold?.rows ?? [], layout: sampled } } : f;
    },
  });
  const issues: FoldIssue[] = [];
  for (const item of sampled.mustShow) {
    const top = report.fold.items[item];
    if (top === undefined) continue;
    if (top * FOLD_BAND > FOLD_LINE_PX) issues.push({ item, top, level: "hard", estimated: true });
    else if (top > FOLD_SOFT_PX) issues.push({ item, top, level: "soft", estimated: true });
  }
  return issues;
}
