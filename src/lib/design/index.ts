/**
 * The design engine's public API (P6 DESIGN; design.md DES-§4.9, DS59; docs/STORE-SAAS.md §K.2 P0 design stubs).
 * Isomorphic: no Node or DOM import (the server-only reads are ./novelty.server, ./headlines.server and
 * ./health.server; the browser-only alpha estimate is ./photo-facts). Every export below is frozen at P0
 * (src/lib/contracts/r1-p0.ts): P6 replaces the stub bodies and adds exports, never renames or re-types one.
 *
 * The Director vocabulary ai.md imports (QUAL-25, DS59; `test:ai` asserts its prompt block equals it): `GenomeCard`
 * (bands only), `Band`, `RepairOp`, `AI_REPAIR_OPS`, `GENE_VOCAB` and the task names `DIRECTOR_TASKS`.
 */
export * from "./genome";
export type { Band, FoldItem, FoldReport, GateSummary, GenomeCompact, HeightReport, NoveltyBands, VariantFeaturesResolved } from "./types";
export { GENE_VOCAB, type GeneVocabEntry } from "./vocab";
export { sampleGenome } from "./solve";
export { genomeOf } from "./derive";
export { validateHints, type GeneHints, type HintIntake } from "./hints";
export { clicheScore, type ClicheHit, type CopyReport } from "./cliche";
export { genomeDistance, type DistanceView } from "./distance";
export { estimateHeights, HEIGHT_MODEL_VERSION } from "./heights";
export { variantFeatures } from "./features";
export { renderDigest, type CodDigestInputs, type GenomeCard, type RenderDigest } from "./digest";
export { AI_REPAIR_OPS, type AiRepairOp, type RepairOp } from "./gates/repair";
export type { CompositionKey, DesignGateItem, GateId, GateReport, OriginClass, Register } from "./gates/types";
export type { PhotoFacts } from "./photo-facts";

/** The Director task names (design.plan and design.critique in R1, design.verify in R2), the same ids as ai.md's task registry. */
export const DIRECTOR_TASKS = ["design.plan", "design.critique", "design.verify"] as const;
export type DirectorTask = (typeof DIRECTOR_TASKS)[number];
