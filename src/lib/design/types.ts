/**
 * Design types (P6 DESIGN; design.md DES-§2.1, DES-§4.9; docs/STORE-SAAS.md §K.2 P0 design stubs, CRIT9, CRIT2-2).
 * P6 owns this file; it re-exports the three P0-frozen measurement shapes from the maintainer's ./types.frozen.ts
 * (P6 never edits that file) and the JSON shapes of the `design_genomes` columns from src/lib/db/schema.ts (cut at
 * P0 with migration 0005), and owns everything else. `Band` and `NoveltyBands` are what the Director cards, the
 * reveal and the publish gate show: bands, never numbers (DS7).
 *
 * `VariantFeatures` (DES-§8.4) is the registry's `features` field (src/landing/registry.ts): optional fields default
 * to 0 / false, and `variantFeatures()` (./features.ts) resolves an entry to the frozen `VariantFeaturesResolved`.
 * Fields are only ever added here (additive), so the frozen shape never changes; `test:registry` asserts that every
 * entry resolves to it.
 */
import type { VariantFeaturesResolved } from "./types.frozen";
import type { Arrangement } from "./genome";

export type { FoldItem, FoldReport, HeightReport, VariantFeaturesResolved } from "./types.frozen";
export type { GateSummary, GenomeCompact, NoveltyBand as Band, NoveltyBands } from "@/lib/db/schema";

/** The layout family a variant belongs to (orderAct2, H35, V38 read it; DES-§5.1). */
export type LayoutFamily = VariantFeaturesResolved["family"];
/** One fold row of a hero family (DES-§5.12): the element, its vh cap at 844 or its line count. */
export type FoldRow = NonNullable<VariantFeaturesResolved["fold"]>["rows"][number];
/** One media slot of a variant (V11, V12, the photo plan). */
export type FeatureSlot = NonNullable<VariantFeaturesResolved["slots"]>[number];
/** The decorations a data field can switch off: the field's path in the section data (DES-§8.4). */
export type DecorKey = "ghost" | "ring" | "chips" | "aurora" | "dots" | "ticker";

/** A section variant's registry features (DES-§8.4); optional fields default to 0 / false. */
export interface VariantFeatures {
  glass?: number;
  /** false on every variant (V40, CRIT2-4; test:registry asserts it) */
  aurora?: false;
  centered?: boolean;
  equalCards?: 0 | 3 | 4;
  iconHeads?: boolean;
  bento?: boolean;
  scroller?: boolean;
  signature?: number;
  details?: number;
  ghostWord?: boolean;
  ring?: boolean;
  overlayChips?: number;
  dots?: boolean;
  numberedEyebrow?: boolean;
  animatesLayout?: boolean;
  slots?: VariantFeaturesResolved["slots"];
  /** data path that turns the decoration off (`false`, `""`, `0` or an empty list at that path) */
  decor?: Partial<Record<DecorKey, string>>;
  /** height in screens at 390 (DES-§5.3); `{ base, fixed: true, per? }` skips density, spacingFor and G21 */
  h?: VariantFeaturesResolved["h"];
  /** required on every variant (test:registry) */
  family: LayoutFamily;
  /** DG-15 (R3) */
  arrangements?: Arrangement[];
  /** primary CTAs the variant renders by default (hero 1, orderForm 1, cta 1, stickyCta 1, others 0 unless data.cta) */
  ctas?: number;
  cardGrid?: boolean;
  picker?: boolean;
  fixed?: "bar" | "float" | null;
  /** the fixed layer's height at 390 (bar ≤ 64, float ≤ 24 collapsed) */
  fixedPx?: number;
  /** `[data-reveal]` nodes the variant emits inside scope "heads" (R5) */
  revealNodes?: number;
  /** hero families only (DES-§5.12); generated from sheets.ts for a sheeted variant */
  fold?: VariantFeaturesResolved["fold"];
  /** openers the variant's header supports (absent = every opener; orderForm, footer and bars: none) */
  openers?: VariantFeaturesResolved["openers"];
  /** text that can clip (RTL6, I7, T8) */
  textRuns?: VariantFeaturesResolved["textRuns"];
}
