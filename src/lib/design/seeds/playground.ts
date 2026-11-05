/**
 * The designer seed genomes of the playground archetype (P6 DESIGN; design.md DES-§17.2, DES-§7.7, DS22): parameters only, no
 * store data. Each seed fixes the bold genes and the derived genes the solver locks (`SampleOpts.locks`); the sampler
 * fills the rest and the planner draws the page. `review` names the QA fixture the seed is gated and rendered on
 * (`test:design` seeds group: Q ≥ 85 and 0 hard items after the wizard repair; Bolder and Calmer add no hard item).
 */
import type { DesignerSeed } from "./types";

export const seeds: readonly DesignerSeed[] = [
  { id: "playground-stage", archetype: "playground", genes: { G2: "stage", G4: "majorelle", G9: "duotone", G18: "framed-stage", G23: "mask", G28: "warm", G3: "8/1:1/narrow", G12: "mixed", G13: "circle", G15: "directional", G16: "1", G17: "cut", G20: "dense/AAB", G22: "mixed", G26: "highlight", G27: "soft" }, review: { fixture: "argan", locale: "fr", brandSeed: "seed-playground-0", direction: 0 } },
  { id: "playground-poster", archetype: "playground", genes: { G2: "poster", G4: "parade", G9: "color-field", G18: "framed-stage", G23: "expo", G28: "warm", G3: "8/5:7/wide", G12: "round", G13: "circle", G15: "flat", G16: "0", G17: "blob", G20: "dense/AAB", G22: "center-statement", G26: "highlight", G27: "pill" }, review: { fixture: "argan", locale: "fr", brandSeed: "seed-playground-1", direction: 1 } },
  { id: "playground-specimen", archetype: "playground", genes: { G2: "specimen", G4: "jelly", G9: "duotone", G18: "framed", G23: "critical", G28: "bold", G3: "8/3:9/wide", G12: "crisp", G13: "circle", G15: "ambient", G16: "0", G17: "blob", G20: "dense/AAB", G22: "start", G26: "none", G27: "soft" }, review: { fixture: "argan", locale: "fr", brandSeed: "seed-playground-2", direction: 2 } },
  { id: "playground-catalogue", archetype: "playground", genes: { G2: "catalogue", G4: "parade", G9: "color-field", G18: "framed-stage", G23: "expo", G28: "warm", G3: "12/4:8/wide", G12: "mixed", G13: "circle", G15: "hairline", G16: "1", G17: "cut", G20: "dense/AAB", G22: "start", G26: "color", G27: "outline" }, review: { fixture: "parfum", locale: "fr", brandSeed: "seed-playground-0", direction: 0 } },
];
