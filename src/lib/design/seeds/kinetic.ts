/**
 * The designer seed genomes of the kinetic archetype (P6 DESIGN; design.md DES-§17.2, DES-§7.7, DS22): parameters only, no
 * store data. Each seed fixes the bold genes and the derived genes the solver locks (`SampleOpts.locks`); the sampler
 * fills the rest and the planner draws the page. `review` names the QA fixture the seed is gated and rendered on
 * (`test:design` seeds group: Q ≥ 85 and 0 hard items after the wizard repair; Bolder and Calmer add no hard item).
 */
import type { DesignerSeed } from "./types";

export const seeds: readonly DesignerSeed[] = [
  { id: "kinetic-cinematic", archetype: "kinetic", genes: { G2: "cinematic", G4: "runway", G9: "mono+signal", G18: "full-bleed-crop", G23: "mask", G28: "bold", G3: "12/1:1/wide", G12: "crisp", G13: "circle", G15: "hairline", G16: "1", G17: "arch", G20: "airy/AAB", G22: "mixed", G26: "none", G27: "solid" }, review: { fixture: "argan", locale: "fr", brandSeed: "seed-kinetic-0", direction: 0 } },
  { id: "kinetic-specimen", archetype: "kinetic", genes: { G2: "specimen", G4: "stadium", G9: "duotone", G18: "framed-stage", G23: "quart", G28: "bold", G3: "12/5:7/offset", G12: "crisp", G13: "circle", G15: "flat", G16: "1", G17: "cut", G20: "airy/ABAC", G22: "start", G26: "highlight", G27: "solid" }, review: { fixture: "argan", locale: "fr", brandSeed: "seed-kinetic-1", direction: 1 } },
  { id: "kinetic-split-tension", archetype: "kinetic", genes: { G2: "split-tension", G4: "sprint", G9: "mono+signal", G18: "full-bleed-crop", G23: "critical", G28: "bold", G3: "12/golden/wide", G12: "crisp", G13: "circle", G15: "hairline", G16: "0", G17: "rounded", G20: "airy/ABAC", G22: "mixed", G26: "color", G27: "solid" }, review: { fixture: "argan", locale: "fr", brandSeed: "seed-kinetic-2", direction: 2 } },
  { id: "kinetic-editorial-column", archetype: "kinetic", genes: { G2: "editorial-column", G4: "parade", G9: "ink+one", G18: "full-bleed-crop", G23: "critical", G28: "precise", G3: "12/5:7/offset", G12: "crisp", G13: "circle", G15: "flat", G16: "0", G17: "rect", G20: "dense/ABAC", G22: "mixed", G26: "color", G27: "solid" }, review: { fixture: "argan", locale: "ar", brandSeed: "seed-kinetic-3", direction: 0 } },
];
