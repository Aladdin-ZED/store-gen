/**
 * The design measurement shapes frozen at P0 (MAINTAINER, not P6; docs/STORE-SAAS.md §K.2 P0 design stubs, §K.3,
 * §M.2, CRIT9, CRIT2-2; design.md DES-§5.3, DES-§8.4). The core's budget gate (src/lib/render/prepublish/budget.ts)
 * and the tracks that merge before P6 build against these three shapes, so they live in a file of their own: P6's
 * src/lib/design/types.ts re-exports them and owns everything else. Written out field by field and importing nothing
 * from P6's files, so an additive field P6 adds to `VariantFeatures` never changes a frozen shape (`test:design`
 * asserts every `VariantFeatures` resolves to `VariantFeaturesResolved`). A change is a CCR; the R2 contract step
 * widens `FoldItem` (store kinds) and the doc types of the functions that take them (DES-R27).
 *
 * R2 contract step (C2-B1, maintainer; core §K.4, ENGP-1 / DES-R27, STO-R29, DES-§8.13): the additive widening done.
 * `FoldItem` gains "name" | "identity" | "collections" (landing keeps filling its four keys; store kinds add theirs),
 * `FoldReport.items` keeps its `Partial<Record<FoldItem, number>>` shape over the wider key set, and
 * `VariantFeaturesResolved.fold` gains the optional `layout` through which a store hero family's `FoldLayout`
 * (src/storefront/fold.ts, STO-§9.5) reaches the one height model (DS33). Frozen again in src/lib/contracts/r2-contract.ts.
 */

/** The fold items: a landing hero family's four (R1) and the store kinds' three (R2, STO-§9.5). */
export type FoldItem = "image" | "price" | "cta" | "cod" | "name" | "identity" | "collections";

/**
 * A store hero family's declared fold layout as the height model reads it (STO-§9.5 `FoldLayout`, data only; the
 * storefront's src/storefront/fold.ts names it `FoldLayout`). `bottoms` are px from the page top at 390 of each
 * `mustShow` item's bottom edge for the sampled name and picker; the model derives each item's estimated top.
 */
export interface FoldLayoutData {
  /** the items that must sit inside the first 844 px at 390 (the server gate, budget:C2, with its error band) */
  mustShow: FoldItem[];
  bottoms: Partial<Record<FoldItem, number>>;
  /** px added per extra name line (ar: × 1.06) and per extra offer card in a `stack` / `tiers` picker */
  perNameLine: number;
  perOfferCard: number;
  /** where the hero's single text block sits */
  text: "column" | "statement" | "overlap";
}

/** The fold contract of the chosen hero family at 390 × 844 (DES-§5.12, core §M.2 row C2). */
export interface FoldReport {
  family: string;
  ok: boolean;
  /** estimated top px at 390; an absent key = the family has no such item */
  items: Partial<Record<FoldItem, number>>;
  limit: 844;
}

/** The height model's answer for one document at 390 px (DES-§5.3; core §M.2 rows C3, F1, C2). */
export interface HeightReport {
  v: 1;
  viewport: 390;
  sections: { id: string; type: string; variant: string; top: number; height: number }[];
  total: number;
  screens: number;
  formTop: number | null;
  formHeight: number | null;
  fold: FoldReport;
  inFlow: number;
  /** the P0 stub only (§K.2 stub rule: fold.ok = true, every section 600 px, formTop = null); the budget gate turns C2 / C3 / F1 into notes while it is set */
  stub?: true;
}

/**
 * A section variant's features with every optional field resolved (DES-§8.4): `Required<Omit<VariantFeatures, "decor"
 * | "slots" | "h" | "arrangements" | "fold" | "openers" | "textRuns">> & Pick<VariantFeatures, "slots" | "fold" |
 * "openers" | "textRuns" | "h">`, written out. `family` is required (the layout family orderAct2 / H35 / V38 read).
 */
export interface VariantFeaturesResolved {
  glass: number;
  aurora: boolean;
  centered: boolean;
  equalCards: 0 | 3 | 4;
  iconHeads: boolean;
  bento: boolean;
  scroller: boolean;
  signature: number;
  details: number;
  ghostWord: boolean;
  ring: boolean;
  overlayChips: number;
  dots: boolean;
  numberedEyebrow: boolean;
  animatesLayout: boolean;
  family: "split" | "grid" | "list" | "statement" | "ledger" | "table" | "media";
  /** primary CTAs the variant renders by default */
  ctas: number;
  cardGrid: boolean;
  picker: boolean;
  fixed: "bar" | "float" | null;
  /** the fixed layer's height at 390 */
  fixedPx: number;
  /** `[data-reveal]` nodes the variant emits inside scope "heads" */
  revealNodes: number;
  slots?: { name: string; cssWidth1440: number; cssWidth390: number; aspect: "4:5" | "3:4" | "1:1" | "2:3" | "16:9" | "21:9" | "free"; role: "hero" | "detail" | "context" | "proof" | "offer" | "thumb" }[];
  /** hero families only (DES-§5.12) */
  fold?: {
    rows: { el: "image" | "title" | "price" | "cta" | "cod" | "callouts" | "facts" | "band" | "grid"; vh?: number; lines?: number }[];
    /** R2 (store hero families, STO-§9.5): the family's FoldLayout, which the height model reads instead of `rows` */
    layout?: FoldLayoutData;
  } | null;
  openers?: ("bare" | "caption" | "number" | "quote" | "image" | "kicker")[];
  textRuns?: ("display" | "marquee" | "badge" | "ghost")[];
  /** height override in screens; the fixed form skips density, spacingFor and G21 (DES-§5.3, LAN R12) */
  h?: number | { base: number; fixed: true; per?: Partial<Record<"offerRow" | "optionGroup" | "bump", number>> };
}
