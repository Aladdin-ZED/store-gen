/**
 * The generator's heavy half — direction building and its mood-aware style ranking (section
 * registry, every section's copy, the plan rules), the copy family a product reads as, and the
 * hand-written copy library with the AI-copy guard. Never imported statically:
 * the wizard loads it on demand through ./kit-loader, so the first step opens without it.
 */
export { copyCategory, generateDirections, productKeywords, rankDirections } from "@/lib/generator";
export { libraryCopy } from "@/lib/ai/copy-library";
export { mergeAiCopy } from "@/lib/ai/guard";
// the generation pipeline (DES-§14.2): candidates, novelty, keep rule, headline check, repairs, the direction views
export { runDesignPipeline, worstBand, type PipelineDeps, type PipelineDirection, type PipelineResult, type PipelineStep } from "./pipeline";
export { differentiateVariants } from "@/lib/design/differentiate";
export { validateHints } from "@/lib/design/hints";
export { nicheKey } from "@/lib/design/distance";
export { explainGenome } from "@/lib/design/explain";
export { genomeOf } from "@/lib/design/derive";
