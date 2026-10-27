/**
 * The Director's inputs (P6 DESIGN; design.md DES-§8.9, DS34, DS59; docs/STORE-SAAS.md §K.2 P0 design stubs,
 * CRIT2-6): the render digest (computed from the doc, the features and the heights, no DOM) and the genome card the
 * Director sees instead of a genome. Pure and isomorphic. P7 (merging before P6) builds its Director pass against
 * these shapes; the pass over a real digest runs at the R1 integration. Frozen at P0 (src/lib/contracts/r1-p0.ts);
 * P6 replaces the body and adds `genomeCard(…)` and `critiqueSummary(…)`.
 *
 * `cod` (core §K.2, LAN-§3.7, ra §1.3 R9): the COD invariants, built by P3's `codInvariants(doc, inputs)` (the one
 * implementation the digest, the builder checklist and the honesty gate share) from the report's heights and the store
 * facts the caller passes as `renderDigest`'s fifth argument; `null` when the caller passed none. The Director's hard
 * R9 row reads it; with `cod: null` R9 is scored from `heights` and `hero.fold` alone (form position and fold), never
 * from guessed store facts (P0 review G1).
 *
 * P0 stub: `renderDigest` reports what its inputs already state (the genome's strategy, the doc's base, the gate
 * report's heights and fold) with empty counts, zero measurements, `gates: { hard: [], soft: [], slop: 0, q: 0 }`,
 * `cod: null` (P3's `codInvariants` is itself a stub) and `stub: true`, so a reader can tell nothing was measured.
 */
import type { CodInvariantInputs, CodInvariants } from "@/lib/landing/cod-invariants";
import type { PageDoc, SectionBg } from "@/lib/page/schema";
import type { BuiltTheme } from "@/lib/theme/types";
import type { BoldGene, ColorStrategy, DesignGenome, Opener } from "./genome";
import type { GateId, GateReport } from "./gates/types";
import type { Band, FoldReport, HeightReport } from "./types";

/** rethink-ai §1.2 `RenderDigest`: counts only, never customer data */
export interface RenderDigest {
  v: 1;
  sections: {
    id: string;
    type: string;
    variant: string;
    /** layout family for the repetition cap */
    family: string;
    opener: Opener;
    align: "start" | "center";
    bg: SectionBg;
    glass: number;
    kicker: boolean;
    words: number;
    cardGrid: boolean;
    ctas: number;
    reveals: number;
  }[];
  hero: { family: string; headlineLines390: number; subWords: number; textElements: number; ctaWraps: boolean; ctaContrast: number; fitsViewport390: boolean; topPaddingPx: number; fold: FoldReport };
  counts: {
    eyebrows: number;
    eyebrowBudget: number;
    centeredRun: number;
    sameFamilyMax: number;
    zigzagRun: number;
    marquees: number;
    bento: number;
    equalCardTriplets: number;
    glass: number;
    reveals: number;
    ctas: number;
    photoUses: Record<string, number>;
    fullBleedMoments: number;
  };
  type: { pairing: string; displayFamily: string; arDisplay: string | null; heroDisplayPx390: number; ratio: number; weightsPerSectionMax: number };
  colour: { strategy: ColorStrategy; base: "light" | "tinted" | "dark"; accentOklch: [number, number, number]; popOklch: [number, number, number]; accentArea: number; orangeAdvisory: boolean };
  gates: { hard: GateId[]; soft: GateId[]; slop: number; q: number };
  heights: Pick<HeightReport, "total" | "screens" | "formTop" | "inFlow">;
  /** counts only; never customer data */
  honesty: { allowedNumbers: number; numbersInCopy: number; proofSections: string[] };
  /** the COD invariants (LAN-§3.7, R9) from `codInvariants(doc, { heights, ...cod })`; null = no store facts were passed */
  cod: CodInvariants | null;
  /** the P0 stub only: nothing was measured */
  stub?: true;
}

/** rethink-ai §1.2 `GenomeCard` (≈ 120 tokens): distance as bands only (DS7); the single source ai.md imports (QUAL-25, DS59). */
export interface GenomeCard {
  id: string;
  slot: "best_fit" | "contrast" | "explore";
  bold: Record<BoldGene, string>;
  derived: Record<string, string | number>;
  q: number;
  slop: number;
  composition: number;
  gateFails: GateId[];
  distance: { own: Band | "first"; niche: Band; platform: Band };
  /** the DES-§4.8 chips as text, e.g. "Editorial column · Fraunces/Readex Pro · ink+one · tight-detail crops" */
  explanation: string[];
}

/** What `renderDigest` needs of the store besides the doc to fill `cod` (the heights come from the gate report). */
export type CodDigestInputs = Omit<CodInvariantInputs, "heights">;

/** ≤ 2 ms */
export function renderDigest(doc: PageDoc, theme: BuiltTheme, genome: DesignGenome, report: GateReport, cod?: CodDigestInputs): RenderDigest {
  void theme;
  void cod;
  const fold = report.heights.fold;
  return {
    v: 1,
    sections: [],
    hero: { family: fold.family, headlineLines390: 0, subWords: 0, textElements: 0, ctaWraps: false, ctaContrast: 0, fitsViewport390: fold.ok, topPaddingPx: 0, fold },
    counts: { eyebrows: 0, eyebrowBudget: 0, centeredRun: 0, sameFamilyMax: 0, zigzagRun: 0, marquees: 0, bento: 0, equalCardTriplets: 0, glass: 0, reveals: 0, ctas: 0, photoUses: {}, fullBleedMoments: 0 },
    type: { pairing: "", displayFamily: "", arDisplay: null, heroDisplayPx390: 0, ratio: 0, weightsPerSectionMax: 0 },
    colour: { strategy: genome.brand.G9, base: doc.theme.palette.base, accentOklch: [0, 0, 0], popOklch: [0, 0, 0], accentArea: 0, orangeAdvisory: false },
    gates: { hard: [], soft: [], slop: 0, q: 0 },
    heights: { total: report.heights.total, screens: report.heights.screens, formTop: report.heights.formTop, inFlow: report.heights.inFlow },
    honesty: { allowedNumbers: 0, numbersInCopy: 0, proofSections: [] },
    cod: null,
    stub: true,
  };
}
