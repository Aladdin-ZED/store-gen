/**
 * The designer seed genomes of the field archetype (P6 DESIGN; design.md DES-§17.2, DES-§7.7, DS22): parameters only, no
 * store data. Each seed fixes the bold genes and the derived genes the solver locks (`SampleOpts.locks`); the sampler
 * fills the rest and the planner draws the page. `review` names the QA fixture the seed is gated and rendered on
 * (`test:design` seeds group: Q ≥ 85 and 0 hard items after the wizard repair; Bolder and Calmer add no hard item).
 */
import type { DesignerSeed } from "./types";

export const seeds: readonly DesignerSeed[] = [
  { id: "field-gallery-led", archetype: "field", genes: { G2: "gallery-led", G4: "market", G9: "dark-luxe", G18: "framed", G23: "critical", G28: "plain", G3: "12/5:7/wide", G12: "soft", G13: "circle", G15: "flat", G16: "1", G17: "rounded", G20: "airy/ABAC", G22: "mixed", G26: "none", G27: "glow" }, review: { fixture: "argan", locale: "fr", brandSeed: "seed-field-3", direction: 0 } },
  { id: "field-cinematic", archetype: "field", genes: { G2: "cinematic", G4: "fresh", G9: "mono+signal", G18: "full-bleed-crop", G23: "expo", G28: "plain", G3: "8/1:1/wide", G12: "crisp", G13: "circle", G15: "hairline", G16: "0", G17: "rounded", G20: "airy/ABAC", G22: "mixed", G26: "highlight", G27: "pill" }, review: { fixture: "argan", locale: "fr", brandSeed: "seed-field-4", direction: 1 } },
  { id: "field-catalogue", archetype: "field", genes: { G2: "catalogue", G4: "meadow", G9: "ink+one", G18: "framed", G23: "critical", G28: "warm", G3: "8/5:7/wide", G12: "mixed", G13: "circle", G15: "hairline", G16: "0", G17: "rect", G20: "dense/AAB", G22: "start", G26: "none", G27: "soft" }, review: { fixture: "massage", locale: "fr", brandSeed: "seed-field-5", direction: 2 } },
  { id: "field-split-tension", archetype: "field", genes: { G2: "split-tension", G4: "market", G9: "duotone", G18: "framed-stage", G23: "critical", G28: "warm", G3: "12/4:8/offset", G12: "soft", G13: "circle", G15: "tonal", G16: "1", G17: "rounded", G20: "airy/ABAC", G22: "start", G26: "highlight", G27: "pill" }, review: { fixture: "parfum", locale: "fr", brandSeed: "seed-field-0", direction: 0 } },
];
