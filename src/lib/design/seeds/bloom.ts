/**
 * The designer seed genomes of the bloom archetype (P6 DESIGN; design.md DES-§17.2, DES-§7.7, DS22): parameters only, no
 * store data. Each seed fixes the bold genes and the derived genes the solver locks (`SampleOpts.locks`); the sampler
 * fills the rest and the planner draws the page. `review` names the QA fixture the seed is gated and rendered on
 * (`test:design` seeds group: Q ≥ 85 and 0 hard items after the wizard repair; Bolder and Calmer add no hard item).
 */
import type { DesignerSeed } from "./types";

export const seeds: readonly DesignerSeed[] = [
  { id: "bloom-gallery-led", archetype: "bloom", genes: { G2: "gallery-led", G4: "petal", G9: "tonal", G18: "grid-contact", G23: "mask", G28: "warm", G3: "8/1:1/narrow", G12: "soft", G13: "circle", G15: "flat", G16: "0", G17: "pill", G20: "airy/AAB", G22: "mixed", G26: "italic", G27: "pill" }, review: { fixture: "argan", locale: "fr", brandSeed: "seed-bloom-0", direction: 0 } },
  { id: "bloom-cinematic", archetype: "bloom", genes: { G2: "cinematic", G4: "gloss", G9: "tonal", G18: "full-bleed-crop", G23: "mask", G28: "warm", G3: "8/1:1/wide", G12: "soft", G13: "circle", G15: "flat", G16: "1", G17: "pill", G20: "airy/ABAC", G22: "start", G26: "highlight", G27: "outline" }, review: { fixture: "argan", locale: "fr", brandSeed: "seed-bloom-1", direction: 1 } },
  { id: "bloom-quiet-luxe", archetype: "bloom", genes: { G2: "quiet-luxe", G4: "peony", G9: "ink+one", G18: "full-bleed-crop", G23: "mask", G28: "warm", G3: "8/4:8/wide", G12: "round", G13: "circle", G15: "hairline", G16: "1", G17: "pill", G20: "airy/ABAC", G22: "center-statement", G26: "none", G27: "solid" }, review: { fixture: "argan", locale: "fr", brandSeed: "seed-bloom-3", direction: 0 } },
  { id: "bloom-editorial-column", archetype: "bloom", genes: { G2: "editorial-column", G4: "dew", G9: "high-key", G18: "full-bleed-crop", G23: "mask", G28: "plain", G3: "8/golden/wide", G12: "mixed", G13: "circle", G15: "flat", G16: "0", G17: "rect", G20: "balanced/ABAC", G22: "mixed", G26: "swoosh", G27: "soft" }, review: { fixture: "argan", locale: "fr", brandSeed: "seed-bloom-4", direction: 1 } },
];
