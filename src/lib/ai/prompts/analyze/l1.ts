/**
 * `analyze@l1` (P7 AI; ai.md AI-§A.6, AI-§F.1; README.md beside this file): the on-device photo analysis, which is
 * today's `ANALYZE_PROMPT` (src/lib/ai/prompts.ts) with the strict `ANALYSIS_JSON_SCHEMA` for constrained decoding.
 * The same prompt serves every locale (the values are English); its text and the schema are the template hash.
 */
import { ANALYSIS_JSON_SCHEMA, AnalysisRaw } from "../../copy-schema";
import { ANALYZE_PROMPT } from "../../prompts";
import { imageBlocks, text } from "../blocks";
import type { PromptVersion } from "../types";

export const ANALYZE_L1: PromptVersion<"analyze"> = {
  task: "analyze",
  family: "analyze",
  version: "analyze@l1",
  provider: "local",
  rubricVersion: null,
  canary: false,
  goal: "The on-device photo analysis (today's ANALYZE_PROMPT), English values, constrained decoding.",
  evalSet: "analyze",
  platformBlock: () => ANALYZE_PROMPT,
  storeBlock: () => "",
  userBlock: (input) => [...imageBlocks(input.images), text(ANALYZE_PROMPT)],
  format: { name: "analyze_local_v1", zod: AnalysisRaw, json: ANALYSIS_JSON_SCHEMA as Record<string, unknown> },
  hashExtras: [],
};
