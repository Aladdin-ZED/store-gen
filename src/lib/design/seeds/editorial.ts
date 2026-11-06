/**
 * The designer seed genomes of the editorial archetype (P6 DESIGN; design.md DES-§17.2, DES-§7.7, DS22): parameters only, no
 * store data. Each seed fixes the bold genes and the derived genes the solver locks (`SampleOpts.locks`); the sampler
 * fills the rest and the planner draws the page. `review` names the QA fixture the seed is gated and rendered on
 * (`test:design` seeds group: Q ≥ 85 and 0 hard items after the wizard repair; Bolder and Calmer add no hard item).
 */
import type { DesignerSeed } from "./types";

export const seeds: readonly DesignerSeed[] = [
  { id: "editorial-editorial-column", archetype: "editorial", genes: { G2: "editorial-column", G4: "swiss", G9: "color-field", G18: "tonal-duotone", G23: "quart", G28: "bold", G3: "8/5:7/narrow", G12: "crisp", G13: "circle", G15: "flat", G16: "1", G17: "rect", G20: "airy/AAB", G22: "start", G26: "none", G27: "solid" }, review: { fixture: "argan", locale: "fr", brandSeed: "seed-editorial-0", direction: 0 } },
  { id: "editorial-gallery-led", archetype: "editorial", genes: { G2: "gallery-led", G4: "index", G9: "high-key", G18: "full-bleed-crop", G23: "mask", G28: "poetic-restrained", G3: "12/1:1/wide", G12: "mixed", G13: "circle", G15: "flat", G16: "0", G17: "rect", G20: "airy/ABAC", G22: "mixed", G26: "highlight", G27: "soft" }, review: { fixture: "argan", locale: "fr", brandSeed: "seed-editorial-4", direction: 1 } },
  { id: "editorial-quiet-luxe", archetype: "editorial", genes: { G2: "quiet-luxe", G4: "column", G9: "tonal", G18: "full-bleed-crop", G23: "quint", G28: "bold", G3: "12/golden/wide", G12: "soft", G13: "circle", G15: "flat", G16: "1", G17: "rounded", G20: "airy/ABAC", G22: "mixed", G26: "color", G27: "outline" }, review: { fixture: "argan", locale: "ar", brandSeed: "seed-editorial-1", direction: 1 } },
  { id: "editorial-split-tension", archetype: "editorial", genes: { G2: "split-tension", G4: "swiss", G9: "mono+signal", G18: "framed", G23: "mask", G28: "plain", G3: "12/golden/offset", G12: "crisp", G13: "circle", G15: "hairline", G16: "0", G17: "blob", G20: "airy/ABAC", G22: "start", G26: "color", G27: "solid" }, review: { fixture: "argan", locale: "ar", brandSeed: "seed-editorial-2", direction: 2 } },
];
