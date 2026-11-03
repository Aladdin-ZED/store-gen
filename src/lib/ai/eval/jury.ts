/**
 * Who judges a candidate (P7 AI; ai.md AI-§F.5, AI-D28; QUAL-13; AI-07 (4)). Pure and isomorphic.
 *
 *   juryFor("director_interactive", settings)   → ["claude-fable-5-1", "claude-sonnet-5-5"]
 *   judgeItems({ fixtures, properties, cls, candidateModel, settings })
 *                                               → one batch item per (fixture, property, juror), each asserted
 *                                                 `judgeModel ≠ candidateModel` (a JuryError otherwise)
 *   combineJury(["A", "A"]) → "A";  combineJury(["A", "B"]) → "disagree" (the human review queue, not counted)
 *
 * The juries live in `platform_ai.evalGate` (`judgeModel` for the Worker, `jury[class]` for the others); the setting
 * refuses a jury that holds its class's model at save (`juryProblems`, the same rule as the settings' superRefine),
 * and the builder asserts it again on every item, because the candidate may be a canaried model change
 * (`classesCanary`) that the stored class model does not show. Unlike `judgeModelsFor` (tasks.ts), which drops the
 * candidate's model from a list, nothing here is filtered: a jury that contains the candidate is refused.
 */
import type { PlatformAiSetting } from "@/lib/settings/keys/platform_ai";
import type { JudgeProperty } from "../schema/tasks/eval-judge";
import type { TaskClass } from "../tasks";
import type { Verdict } from "./pairwise";

export class JuryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JuryError";
  }
}

/** The jurors of a candidate class, as stored (the Worker's single judge is a jury of one). */
export function juryFor(cls: TaskClass, settings: PlatformAiSetting, candidateModel: string = settings.classes[cls].model): string[] {
  const jury = cls === "worker" ? [settings.evalGate.judgeModel] : [...settings.evalGate.jury[cls]];
  if (jury.includes(candidateModel)) throw new JuryError(`the ${cls} jury (${jury.join(", ")}) contains the candidate's model ${candidateModel}`);
  return jury;
}

/** The save-time check: every class whose jury holds its own model (empty = the setting may be saved). */
export function juryProblems(settings: PlatformAiSetting): string[] {
  const out: string[] = [];
  for (const cls of ["worker", "director_interactive", "director_deep", "fast"] as const) {
    try {
      juryFor(cls, settings);
    } catch (e) {
      out.push((e as Error).message);
    }
  }
  return out;
}

export interface JudgeItem {
  /** the batch item's custom id: "<fixture id>|<property>|<juror index>" */
  customId: string;
  fixtureId: string;
  property: JudgeProperty;
  judgeModel: string;
  candidateModel: string;
}

/** Throws when any item would let a model judge its own output. */
export function assertJudgeItems(items: readonly JudgeItem[]): void {
  const bad = items.filter((i) => i.judgeModel === i.candidateModel);
  if (bad.length) throw new JuryError(`${bad.length} judge item(s) judged by the candidate's model (${bad[0]!.candidateModel}), e.g. ${bad[0]!.customId}`);
}

/** The judge batch of one candidate run: one item per (fixture, property, juror), every item asserted. */
export function judgeItems(a: { fixtures: readonly string[]; properties: readonly JudgeProperty[]; cls: TaskClass; candidateModel: string; settings: PlatformAiSetting }): JudgeItem[] {
  const jury = juryFor(a.cls, a.settings, a.candidateModel);
  const items = a.fixtures.flatMap((fixtureId) => a.properties.flatMap((property) => jury.map((judgeModel, k) => ({ customId: `${fixtureId}|${property}|${k}`, fixtureId, property, judgeModel, candidateModel: a.candidateModel }))));
  assertJudgeItems(items);
  return items;
}

/** The jury's verdict on one item: unanimous, else "disagree" (queued for a person, not counted). */
export function combineJury(verdicts: readonly Verdict[]): Verdict | "disagree" {
  if (!verdicts.length) return "disagree";
  return verdicts.every((v) => v === verdicts[0]) ? verdicts[0]! : "disagree";
}
