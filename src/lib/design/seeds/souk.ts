/**
 * The designer seed genomes of the souk archetype (P6 DESIGN; design.md DES-§17.2, DES-§7.7, DS22): parameters only, no
 * store data. Each seed fixes the bold genes and the derived genes the solver locks (`SampleOpts.locks`); the sampler
 * fills the rest and the planner draws the page. `review` names the QA fixture the seed is gated and rendered on
 * (`test:design` seeds group: Q ≥ 85 and 0 hard items after the wizard repair; Bolder and Calmer add no hard item).
 */
import type { DesignerSeed } from "./types";

export const seeds: readonly DesignerSeed[] = [
  { id: "souk-cinematic", archetype: "souk", genes: { G2: "cinematic", G4: "kasbah", G9: "duotone", G18: "full-bleed-crop", G23: "quint", G28: "warm", G3: "12/4:8/wide", G12: "soft", G13: "circle", G15: "ambient", G16: "1", G17: "arch", G20: "balanced/ABAC", G22: "mixed", G26: "color", G27: "pill" }, review: { fixture: "argan", locale: "fr", brandSeed: "seed-souk-1", direction: 1 } },
  { id: "souk-split-tension", archetype: "souk", genes: { G2: "split-tension", G4: "terroir", G9: "color-field", G18: "framed-stage", G23: "quint", G28: "warm", G3: "12/golden/wide", G12: "round", G13: "circle", G15: "flat", G16: "1", G17: "arch", G20: "airy/ABAC", G22: "mixed", G26: "color", G27: "pill" }, review: { fixture: "argan", locale: "fr", brandSeed: "seed-souk-2", direction: 2 } },
  { id: "souk-editorial-column", archetype: "souk", genes: { G2: "editorial-column", G4: "terroir", G9: "high-key", G18: "full-bleed-crop", G23: "critical", G28: "warm", G3: "12/5:7/offset", G12: "soft", G13: "circle", G15: "flat", G16: "0", G17: "arch", G20: "airy/ABAC", G22: "mixed", G26: "none", G27: "pill" }, review: { fixture: "argan", locale: "fr", brandSeed: "seed-souk-5", direction: 2 } },
  { id: "souk-catalogue", archetype: "souk", genes: { G2: "catalogue", G4: "dar", G9: "mono+signal", G18: "framed-stage", G23: "expo", G28: "plain", G3: "8/4:8/wide", G12: "soft", G13: "circle", G15: "hairline", G16: "0", G17: "arch", G20: "balanced/ABAC", G22: "start", G26: "none", G27: "outline" }, review: { fixture: "blender", locale: "fr", brandSeed: "seed-souk-3", direction: 0 } },
];
