/**
 * `eval.judge` (AI-07; ai.md AI-§F.5): one pairwise, blind judgement of one atomic property, A/B order randomised, on a
 * model that is never the candidate's (`judgeModelsFor`). Types only. Both outputs are untrusted data blocks.
 */
import { z } from "zod";
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

export const JUDGE_VERDICTS = ["A", "B", "tie", "both_bad"] as const satisfies readonly JudgeOut["verdict"][];
/** The loose answer (AI-§B.4): the verdict is an enum in every projection; the reason is one line. */
export const JudgeLoose = z.object({ verdict: z.enum(JUDGE_VERDICTS), reason: z.string() });
export const JUDGE_LOOSE_JSON = z.toJSONSchema(JudgeLoose) as Record<string, unknown>;
