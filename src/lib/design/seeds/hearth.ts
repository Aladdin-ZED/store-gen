/**
 * The designer seed genomes of the hearth archetype (P6 DESIGN; design.md DES-§17.2, DES-§7.7, DS22): parameters only, no
 * store data. Each seed fixes the bold genes and the derived genes the solver locks (`SampleOpts.locks`); the sampler
 * fills the rest and the planner draws the page. `review` names the QA fixture the seed is gated and rendered on
 * (`test:design` seeds group: Q ≥ 85 and 0 hard items after the wizard repair; Bolder and Calmer add no hard item).
 */
import type { DesignerSeed } from "./types";

export const seeds: readonly DesignerSeed[] = [
  { id: "hearth-editorial-column", archetype: "hearth", genes: { G2: "editorial-column", G4: "brunch", G9: "duotone", G18: "full-bleed-crop", G23: "expo", G28: "warm", G3: "12/5:7/wide", G12: "mixed", G13: "circle", G15: "directional", G16: "1", G17: "rect", G20: "balanced/AAB", G22: "mixed", G26: "highlight", G27: "pill" }, review: { fixture: "argan", locale: "fr", brandSeed: "seed-hearth-0", direction: 0 } },
  { id: "hearth-specimen", archetype: "hearth", genes: { G2: "specimen", G4: "pantry", G9: "dark-luxe", G18: "framed-stage", G23: "mask", G28: "warm", G3: "12/5:7/offset", G12: "crisp", G13: "circle", G15: "hairline", G16: "0", G17: "circle", G20: "airy/AAB", G22: "mixed", G26: "none", G27: "outline" }, review: { fixture: "argan", locale: "fr", brandSeed: "seed-hearth-3", direction: 0 } },
  { id: "hearth-gallery-led", archetype: "hearth", genes: { G2: "gallery-led", G4: "pantry", G9: "duotone", G18: "grid-contact", G23: "critical", G28: "plain", G3: "12/1:1/wide", G12: "soft", G13: "circle", G15: "tonal", G16: "1", G17: "circle", G20: "balanced/ABAC", G22: "mixed", G26: "swoosh", G27: "solid" }, review: { fixture: "argan", locale: "fr", brandSeed: "seed-hearth-5", direction: 2 } },
  { id: "hearth-split-tension", archetype: "hearth", genes: { G2: "split-tension", G4: "loft", G9: "tonal", G18: "full-bleed-crop", G23: "critical", G28: "precise", G3: "8/golden/narrow", G12: "soft", G13: "circle", G15: "hairline", G16: "0", G17: "circle", G20: "balanced/ABAC", G22: "mixed", G26: "none", G27: "soft" }, review: { fixture: "argan", locale: "ar", brandSeed: "seed-hearth-1", direction: 1 } },
];
