/**
 * The designer seed genomes of the maison archetype (P6 DESIGN; design.md DES-§17.2, DES-§7.7, DS22): parameters only, no
 * store data. Each seed fixes the bold genes and the derived genes the solver locks (`SampleOpts.locks`); the sampler
 * fills the rest and the planner draws the page. `review` names the QA fixture the seed is gated and rendered on
 * (`test:design` seeds group: Q ≥ 85 and 0 hard items after the wizard repair; Bolder and Calmer add no hard item).
 */
import type { DesignerSeed } from "./types";

export const seeds: readonly DesignerSeed[] = [
  { id: "maison-split-tension", archetype: "maison", genes: { G2: "split-tension", G4: "lumen", G9: "ink+one", G18: "framed-stage", G23: "expo", G28: "poetic-restrained", G3: "12/golden/offset", G12: "mixed", G13: "circle", G15: "hairline", G16: "0", G17: "rect", G20: "balanced/ABAC", G22: "mixed", G26: "none", G27: "solid" }, review: { fixture: "argan", locale: "fr", brandSeed: "seed-maison-0", direction: 0 } },
  { id: "maison-cinematic", archetype: "maison", genes: { G2: "cinematic", G4: "couture", G9: "mono+signal", G18: "full-bleed-crop", G23: "mask", G28: "plain", G3: "8/4:8/wide", G12: "crisp", G13: "circle", G15: "hairline", G16: "0", G17: "rounded", G20: "balanced/ABAC", G22: "start", G26: "none", G27: "outline" }, review: { fixture: "argan", locale: "fr", brandSeed: "seed-maison-1", direction: 1 } },
  { id: "maison-editorial-column", archetype: "maison", genes: { G2: "editorial-column", G4: "prive", G9: "high-key", G18: "framed", G23: "mask", G28: "poetic-restrained", G3: "8/5:7/narrow", G12: "crisp", G13: "circle", G15: "flat", G16: "0", G17: "rect", G20: "airy/AAB", G22: "mixed", G26: "none", G27: "solid" }, review: { fixture: "argan", locale: "fr", brandSeed: "seed-maison-4", direction: 1 } },
  { id: "maison-gallery-led", archetype: "maison", genes: { G2: "gallery-led", G4: "lumen", G9: "dark-luxe", G18: "framed", G23: "critical", G28: "poetic-restrained", G3: "12/1:1/narrow", G12: "crisp", G13: "circle", G15: "flat", G16: "1", G17: "arch", G20: "balanced/ABAC", G22: "mixed", G26: "none", G27: "soft" }, review: { fixture: "argan", locale: "ar", brandSeed: "seed-maison-2", direction: 2 } },
];
