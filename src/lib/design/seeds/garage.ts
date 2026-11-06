/**
 * The designer seed genomes of the garage archetype (P6 DESIGN; design.md DES-§17.2, DES-§7.7, DS22): parameters only, no
 * store data. Each seed fixes the bold genes and the derived genes the solver locks (`SampleOpts.locks`); the sampler
 * fills the rest and the planner draws the page. `review` names the QA fixture the seed is gated and rendered on
 * (`test:design` seeds group: Q ≥ 85 and 0 hard items after the wizard repair; Bolder and Calmer add no hard item).
 */
import type { DesignerSeed } from "./types";

export const seeds: readonly DesignerSeed[] = [
  { id: "garage-poster", archetype: "garage", genes: { G2: "poster", G4: "workshop", G9: "mono+signal", G18: "framed-stage", G23: "critical", G28: "plain", G3: "12/1:1/wide", G12: "crisp", G13: "circle", G15: "hairline", G16: "0", G17: "cut", G20: "airy/ABAC", G22: "center-statement", G26: "swoosh", G27: "solid" }, review: { fixture: "argan", locale: "fr", brandSeed: "seed-garage-3", direction: 0 } },
  { id: "garage-split-tension", archetype: "garage", genes: { G2: "split-tension", G4: "chrome", G9: "duotone", G18: "framed-stage", G23: "mask", G28: "bold", G3: "12/golden/wide", G12: "crisp", G13: "circle", G15: "hairline", G16: "0", G17: "rounded", G20: "dense/ABAC", G22: "start", G26: "color", G27: "solid" }, review: { fixture: "argan", locale: "fr", brandSeed: "seed-garage-4", direction: 1 } },
  { id: "garage-specimen", archetype: "garage", genes: { G2: "specimen", G4: "carbon", G9: "color-field", G18: "framed-stage", G23: "critical", G28: "poetic-restrained", G3: "8/3:9/wide", G12: "crisp", G13: "circle", G15: "hairline", G16: "0", G17: "rect", G20: "airy/ABAC", G22: "mixed", G26: "none", G27: "soft" }, review: { fixture: "blender", locale: "ar", brandSeed: "seed-garage-4", direction: 1 } },
  { id: "garage-cinematic", archetype: "garage", genes: { G2: "cinematic", G4: "drive", G9: "ink+one", G18: "full-bleed-crop", G23: "mask", G28: "precise", G3: "12/1:1/wide", G12: "mixed", G13: "circle", G15: "hairline", G16: "1", G17: "cut", G20: "dense/ABAC", G22: "mixed", G26: "none", G27: "solid" }, review: { fixture: "parfum", locale: "fr", brandSeed: "seed-garage-0", direction: 0 } },
];
