/**
 * The design measurement shapes frozen at P0 (MAINTAINER, not P6; docs/STORE-SAAS.md §K.2 P0 design stubs, §K.3,
 * §M.2, CRIT9, CRIT2-2; design.md DES-§5.3, DES-§8.4). The core's budget gate (src/lib/render/prepublish/budget.ts)
 * and the tracks that merge before P6 build against these three shapes, so they live in a file of their own: P6's
 * src/lib/design/types.ts re-exports them and owns everything else. Written out field by field and importing nothing
 * from P6's files, so an additive field P6 adds to `VariantFeatures` never changes a frozen shape (`test:design`
 * asserts every `VariantFeatures` resolves to `VariantFeaturesResolved`). A change is a CCR; the R2 contract step
 * widens `FoldItem` (store kinds) and the doc types of the functions that take them (DES-R27).
 */

/** The fold items of a landing hero family (R1); widened additively to | "name" | "identity" | "collections" at the R2 contract step. */
export type FoldItem = "image" | "price" | "cta" | "cod";

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
  fold?: { rows: { el: "image" | "title" | "price" | "cta" | "cod" | "callouts" | "facts" | "band" | "grid"; vh?: number; lines?: number }[] } | null;
  openers?: ("bare" | "caption" | "number" | "quote" | "image" | "kicker")[];
  textRuns?: ("display" | "marquee" | "badge" | "ghost")[];
  /** height override in screens; the fixed form skips density, spacingFor and G21 (DES-§5.3, LAN R12) */
  h?: number | { base: number; fixed: true; per?: Partial<Record<"offerRow" | "optionGroup" | "bump", number>> };
}
