/**
 * The designer seed genomes of the circuit archetype (P6 DESIGN; design.md DES-§17.2, DES-§7.7, DS22): parameters only, no
 * store data. Each seed fixes the bold genes and the derived genes the solver locks (`SampleOpts.locks`); the sampler
 * fills the rest and the planner draws the page. `review` names the QA fixture the seed is gated and rendered on
 * (`test:design` seeds group: Q ≥ 85 and 0 hard items after the wizard repair; Bolder and Calmer add no hard item).
 */
import type { DesignerSeed } from "./types";

export const seeds: readonly DesignerSeed[] = [
  { id: "circuit-specimen", archetype: "circuit", genes: { G2: "specimen", G4: "trace", G9: "dark-luxe", G18: "framed-stage", G23: "expo", G28: "precise", G3: "12/3:9/offset", G12: "crisp", G13: "circle", G15: "hairline", G16: "1", G17: "rounded", G20: "airy/ABAC", G22: "start", G26: "none", G27: "outline" }, review: { fixture: "argan", locale: "fr", brandSeed: "seed-circuit-0", direction: 0 } },
  { id: "circuit-gallery-led", archetype: "circuit", genes: { G2: "gallery-led", G4: "lumen", G9: "dark-luxe", G18: "framed", G23: "mask", G28: "precise", G3: "12/5:7/wide", G12: "mixed", G13: "circle", G15: "flat", G16: "2", G17: "cut", G20: "balanced/ABAC", G22: "mixed", G26: "italic", G27: "outline" }, review: { fixture: "argan", locale: "fr", brandSeed: "seed-circuit-5", direction: 2 } },
  { id: "circuit-cinematic", archetype: "circuit", genes: { G2: "cinematic", G4: "orbit", G9: "mono+signal", G18: "full-bleed-crop", G23: "mask", G28: "precise", G3: "8/4:8/wide", G12: "round", G13: "circle", G15: "hairline", G16: "1", G17: "rounded", G20: "balanced/ABAC", G22: "start", G26: "none", G27: "solid" }, review: { fixture: "argan", locale: "ar", brandSeed: "seed-circuit-1", direction: 1 } },
  { id: "circuit-split-tension", archetype: "circuit", genes: { G2: "split-tension", G4: "spec-sheet", G9: "tonal", G18: "full-bleed-crop", G23: "critical", G28: "bold", G3: "12/golden/wide", G12: "soft", G13: "circle", G15: "hairline", G16: "2", G17: "rounded", G20: "airy/ABAC", G22: "start", G26: "none", G27: "outline" }, review: { fixture: "blender", locale: "ar", brandSeed: "seed-circuit-4", direction: 1 } },
];
