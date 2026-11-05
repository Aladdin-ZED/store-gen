/**
 * The designer seed genomes of the apothecary archetype (P6 DESIGN; design.md DES-§17.2, DES-§7.7, DS22): parameters only, no
 * store data. Each seed fixes the bold genes and the derived genes the solver locks (`SampleOpts.locks`); the sampler
 * fills the rest and the planner draws the page. `review` names the QA fixture the seed is gated and rendered on
 * (`test:design` seeds group: Q ≥ 85 and 0 hard items after the wizard repair; Bolder and Calmer add no hard item).
 */
import type { DesignerSeed } from "./types";

export const seeds: readonly DesignerSeed[] = [
  { id: "apothecary-stage", archetype: "apothecary", genes: { G2: "stage", G4: "ritual", G9: "high-key", G18: "framed-stage", G23: "expo", G28: "plain", G3: "12/5:7/wide", G12: "soft", G13: "circle", G15: "flat", G16: "0", G17: "rounded", G20: "balanced/ABAC", G22: "start", G26: "highlight", G27: "pill" }, review: { fixture: "argan", locale: "fr", brandSeed: "seed-apothecary-1", direction: 1 } },
  { id: "apothecary-specimen", archetype: "apothecary", genes: { G2: "specimen", G4: "dermo", G9: "high-key", G18: "framed-stage", G23: "critical", G28: "precise", G3: "12/3:9/wide", G12: "crisp", G13: "circle", G15: "hairline", G16: "0", G17: "pill", G20: "airy/ABAC", G22: "start", G26: "none", G27: "pill" }, review: { fixture: "argan", locale: "fr", brandSeed: "seed-apothecary-2", direction: 2 } },
  { id: "apothecary-editorial-column", archetype: "apothecary", genes: { G2: "editorial-column", G4: "botanica", G9: "duotone", G18: "framed", G23: "quint", G28: "warm", G3: "12/5:7/offset", G12: "soft", G13: "circle", G15: "tonal", G16: "2", G17: "pill", G20: "balanced/AAB", G22: "start", G26: "none", G27: "pill" }, review: { fixture: "argan", locale: "fr", brandSeed: "seed-apothecary-3", direction: 0 } },
  { id: "apothecary-split-tension", archetype: "apothecary", genes: { G2: "split-tension", G4: "assay", G9: "tonal", G18: "framed", G23: "critical", G28: "precise", G3: "8/4:8/narrow", G12: "soft", G13: "circle", G15: "tonal", G16: "0", G17: "rounded", G20: "airy/AAB", G22: "start", G26: "none", G27: "soft" }, review: { fixture: "argan", locale: "fr", brandSeed: "seed-apothecary-4", direction: 1 } },
];
