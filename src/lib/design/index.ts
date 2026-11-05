/**
 * The design engine's public API (P6 DESIGN; design.md DES-§4.9, DS59; docs/STORE-SAAS.md §K.2 P0 design stubs).
 * Isomorphic: no Node or DOM import (the server-only reads are ./novelty.server, ./headlines.server and
 * ./health.server; the browser-only alpha estimate is ./photo-facts). Every export frozen at P0
 * (src/lib/contracts/r1-p0.ts) keeps its name and type; P6 adds exports.
 *
 * The Director vocabulary ai.md imports (QUAL-25, DS59; `test:ai` asserts its prompt block equals it): `GenomeCard`
 * (bands only), `Band`, `RepairOp`, `AI_REPAIR_OPS`, `GENE_VOCAB` and the task names `DIRECTOR_TASKS`.
 */
export * from "./genome";
export type { Band, FoldItem, FoldReport, GateSummary, GenomeCompact, HeightReport, NoveltyBands, VariantFeaturesResolved } from "./types";
export { BOLD_ORDER, bucketOf, GENE_ORDER, GENE_PARTS, GENE_VOCAB, parseGeneValue, type GenePart, type GeneVocabEntry } from "./vocab";
export { BASE_PRIORS, PRIOR_FLOOR, PRIORS_VERSION, priorFor, priorsV, type GenePrior } from "./priors";
export { directionArchetype, hardViolations, MAX_EXPANSIONS, repel, sampleGenome, sampleGenomeWithStats, type RepelCandidate, type SampleStats } from "./solve";
export { compileGenome, compileLook, grammarPools, LOOK_MAX_BYTES, type CompileCtx, type Compiled, type CopyDirectives, type PlanDirectives, type WeightedVariant } from "./compile";
export { deriveStrategy, genomeOf } from "./derive";
export { applyHints, HINTABLE, validateHints, type GeneHints, type HintIntake } from "./hints";
export { clicheScore, type ClicheHit, type CopyReport } from "./cliche";
export { bandOf, bounds, crowdView, distanceBand, distanceView, genomeDistance, nicheKey, packView, tauNiche, unpackView, type DistanceView } from "./distance";
export { estimateHeights, HEIGHT_MODEL_VERSION } from "./heights";
export { variantFeatures } from "./features";
export { critiqueSummary, genomeCard, GenomeCardSchema, renderDigest, type CodDigestInputs, type CritiqueInput, type GenomeCard, type RenderDigest } from "./digest";
export { AI_REPAIR_OPS, applyOps, repairDoc, type AiRepairOp, type ApplyCtx, type RepairOp } from "./gates/repair";
export { qScore, runGates, summarize, toGateItem } from "./gates/run";
export type { AssetMeta, BaselineTargetId, CompositionKey, DesignGateItem, GateId, GateInput, GateReport, HeadlineVerdict, OriginClass, Register, RepairLog, StorePageDoc, StorePageKind } from "./gates/types";
export { gateInputFor, KIND_GATES, type GateInputCtx, type KindGates } from "./gate-input";
export { chipText, colourWord, explainGenome, whyText, type ExplainFacts, type GenomeChip } from "./explain";
export { DESIGNER_SEEDS, seedsFor, type DesignerSeed } from "./seeds";
export type { PhotoFacts } from "./photo-facts";

/** The Director task names (design.plan and design.critique in R1, design.verify in R2), the same ids as ai.md's task registry. */
export const DIRECTOR_TASKS = ["design.plan", "design.critique", "design.verify"] as const;
export type DirectorTask = (typeof DIRECTOR_TASKS)[number];
