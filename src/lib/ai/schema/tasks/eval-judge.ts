/**
 * `eval.judge` (AI-07; ai.md AI-§F.5): one pairwise, blind judgement of one atomic property, A/B order randomised, on a
 * model that is never the candidate's (`judgeModelsFor`). Types only. Both outputs are untrusted data blocks.
 */
import type { PromptFamily } from "../../tasks";
import type { Locale } from "@/lib/page/schema";

export const JUDGE_PROPERTIES = ["specificity", "naturalness", "honesty", "codRelevance", "notGenericAi", "designReadFit", "compositionJudgment", "whyLineClarity"] as const;
export type JudgeProperty = (typeof JUDGE_PROPERTIES)[number];

export interface JudgeInput {
  family: PromptFamily;
  property: JudgeProperty;
  locale: Locale;
  fixture: { id: string; brief: string };
  a: string;
  b: string;
}

export interface JudgeOut {
  verdict: "A" | "B" | "tie" | "both_bad";
  /** one line */
  reason: string;
}
