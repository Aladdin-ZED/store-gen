/**
 * Section variant features (P6 DESIGN; design.md DES-§8.4, DS33; docs/STORE-SAAS.md §K.2 P0 design stubs, §M.2,
 * DES-R19): the one data source the design gates, the core's budget gate and Store Health read. P6 adds `features` to
 * every variant of the registry (src/landing/registry.ts) and replaces this body with the registry lookup plus the data
 * toggles (`data.cta = false` → `ctas = 0`, `decor` paths, `data.opener`); the signature is frozen
 * (src/lib/contracts/r1-p0.ts) and the shape is the maintainer's (./types.frozen.ts).
 *
 * P0 stub: the documented defaults ("optional fields default to 0 / false"), `family: "grid"` for every variant, and
 * the two fixed layers DES-§8.4 names (stickyCta → "bar", whatsappFloat → "float"), so a fixed layer is never counted
 * as an in-flow section. Nothing else is claimed about a variant before its registry entry exists.
 */
import type { VariantFeaturesResolved } from "./types.frozen";

const FIXED_LAYERS: ReadonlyMap<string, "bar" | "float"> = new Map([
  ["stickyCta", "bar"],
  ["whatsappFloat", "float"],
]);

export function variantFeatures(type: string, variant: string, data: unknown): VariantFeaturesResolved {
  void variant;
  void data;
  return {
    glass: 0,
    aurora: false,
    centered: false,
    equalCards: 0,
    iconHeads: false,
    bento: false,
    scroller: false,
    signature: 0,
    details: 0,
    ghostWord: false,
    ring: false,
    overlayChips: 0,
    dots: false,
    numberedEyebrow: false,
    animatesLayout: false,
    family: "grid",
    ctas: 0,
    cardGrid: false,
    picker: false,
    fixed: FIXED_LAYERS.get(type) ?? null,
    fixedPx: 0,
    revealNodes: 0,
  };
}
