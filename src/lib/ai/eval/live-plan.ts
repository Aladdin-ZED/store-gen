/**
 * The live eval's pure plan (P7 AI; ai.md AI-§F.5, AI-§F.6; AI-07 (4)). Isomorphic, no I/O: which properties are
 * judged per family, the judge items of a run (one per fixture × property × juror, judge ≠ candidate asserted on
 * every item) and the A/B side of each case, randomised per case and stable per run. ./live.ts runs them.
 */
import type { PlatformAiSetting } from "@/lib/settings/keys/platform_ai";
import type { R1Family } from "../prompts/registry";
import { sha256Hex } from "../prompts/sha256";
import type { JudgeProperty } from "../schema/tasks/eval-judge";
import type { TaskClass } from "../tasks";
import { assertJudgeItems, juryFor, type JudgeItem } from "./jury";

/** The atomic properties judged per family (AI-§F.5); the screen and the judge itself have none (deterministic, calibration). */
export const JUDGE_PROPERTIES_OF: Readonly<Record<R1Family, readonly JudgeProperty[]>> = {
  "copy.page": ["specificity", "naturalness", "honesty", "codRelevance", "notGenericAi"],
  "copy.hero": ["specificity", "naturalness", "honesty", "codRelevance", "notGenericAi"],
  "copy.field": ["naturalness", "honesty", "notGenericAi"],
  analyze: ["specificity", "honesty"],
  "director.plan": ["designReadFit", "whyLineClarity"],
  "director.critique": ["compositionJudgment", "whyLineClarity"],
  script: ["naturalness", "codRelevance", "honesty"],
  brief: ["specificity", "codRelevance", "notGenericAi"],
  screen: [],
  judge: [],
};

/** ≤ 200 cases × 2 reps through Batches; the smoke run is the committed smoke cases × 1 rep with ≤ 40 judgements. */
export const LIVE_MAX_CASES = 200;
export const LIVE_REPS = 2;
export const SMOKE_MAX_JUDGEMENTS = 40;

/** The judge items of a run (one per fixture × property × juror), every item asserted judge ≠ candidate. */
export function judgePlan(runId: string, family: R1Family, cls: TaskClass, candidateModel: string, fixtures: readonly string[], settings: PlatformAiSetting, cap = Infinity): JudgeItem[] {
  const props = JUDGE_PROPERTIES_OF[family];
  if (!props.length) return [];
  const jury = juryFor(cls, settings, candidateModel);
  const items: JudgeItem[] = [];
  for (const fixtureId of fixtures) for (const property of props) jury.forEach((judgeModel, k) => items.push({ customId: `${runId}|${fixtureId}|${property}|${k}`, fixtureId, property, judgeModel, candidateModel }));
  const capped = items.slice(0, cap);
  assertJudgeItems(capped);
  return capped;
}

/** The side the candidate is shown on: randomised per case, stable per run (a re-ingest asks the same question). */
export const sideOf = (runId: string, fixtureId: string, property: string): "A" | "B" => (parseInt(sha256Hex(`${runId}|${fixtureId}|${property}`).slice(0, 2), 16) % 2 === 0 ? "A" : "B");
