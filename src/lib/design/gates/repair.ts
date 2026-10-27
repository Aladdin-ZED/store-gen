/**
 * Repair operations (P6 DESIGN; design.md DES-§8.6, DES-§8.9, DS59; docs/STORE-SAAS.md §K.2 P0 design stubs, QUAL-25).
 * `RepairOp` and the closed subset `AI_REPAIR_OPS` the Director may propose are the one source of the vocabulary:
 * P7's `director/types.ts` imports them and `test:ai` asserts its prompt block equals `AI_REPAIR_OPS` (there is no
 * `reorderSection`, `setAlignment` or `setImageTreatment`). Frozen at P0 (src/lib/contracts/r1-p0.ts); P6 adds
 * `applyOps(doc, genome, ops)` here at its merge.
 */
import type { SectionBg } from "@/lib/page/schema";
import type { GeneKey, HeadlineStructure, Opener, PhotoPlan, RevealPlan } from "../genome";

export type RepairOp =
  | { op: "swapVariant"; section: string; to: string }
  | { op: "changeGene"; gene: GeneKey; to: string }
  /** library alternative; generated text only */
  | { op: "rewriteLine"; section: string; field: string; structure?: HeadlineStructure }
  | { op: "setBg"; section: string; to: SectionBg }
  | { op: "setAlign"; section: string; to: "start" | "center" }
  | { op: "solidifyGlass"; section: string }
  | { op: "snapLadder" }
  | { op: "frameImage"; section: string; slot: string }
  | { op: "dropDecor"; section: string; decor: "ghost" | "ring" | "chips" | "aurora" | "dots" | "ticker" }
  /** optional types only: marquee, socialProof, stats, urgency, video, gallery, beforeAfter */
  | { op: "dropSection"; section: string }
  | { op: "moveSection"; section: string; to: number }
  /** dashes, exclamations, middle dots (DES-§9.7) */
  | { op: "punctuate"; section: string; field: string }
  // rev 2
  /** opener → "bare" */
  | { op: "dropKicker"; section: string }
  | { op: "setOpener"; section: string; to: Opener }
  /** generated text only; library alternative that fits */
  | { op: "trimCopy"; section: string; field: string; maxWords: number }
  | { op: "rebalancePhotos"; plan: PhotoPlan }
  | { op: "scopeReveals"; to: RevealPlan["scope"] }
  /** data.cta = false (R1) */
  | { op: "collapseCta"; section: string }
  /** the grammar's next hero family that satisfies the fold (C2) and the photo facts */
  | { op: "swapHeroFamily"; to: string }
  | { op: "snapPop" }
  | { op: "flattenSurfaces" }
  // rev 3
  | { op: "sandSignal" }
  /** the fold ladder's image step (≥ 36 vh) */
  | { op: "setHeroImageVh"; vh: number }
  /** the N1 / N2 fix of DES-§15.3 */
  | { op: "differentiate"; gene: "G2" | "G18" | "G4" | "G9"; seeds: number };

/** The closed subset the Director may propose (rethink-ai §1.2); ai.md validates against it. */
export const AI_REPAIR_OPS = ["swapVariant", "changeGene", "rewriteLine", "dropKicker", "setOpener", "setAlign", "moveSection", "trimCopy", "swapHeroFamily"] as const satisfies readonly RepairOp["op"][];
export type AiRepairOp = Extract<RepairOp, { op: (typeof AI_REPAIR_OPS)[number] }>;
