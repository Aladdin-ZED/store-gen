/**
 * The `director.critique` eval set (P7 AI; ai.md AI-§F.3 Director row, AI-§A.8.9, AI-19a; gates
 * director.critique@s1). The 24 core products and the injection cases with their six engine candidates
 * (sets/shared/director.ts): the planted V03 hard gate (c4) and the F1 budget over (c6) are never picked, the
 * estimated C3 budget (c3) stays eligible. Round 1, no tiles (R1).
 */
import { fixtureOf } from "../../fixture-of";
import type { FamilySet } from "../../types";
import { CORE_CASES, INJECTION_CASES, type EvalCase } from "../shared/cases";
import { PLANTED_NEVER_PICKED, briefOf, candidatesOf, planOf } from "../shared/director";

const USED: readonly EvalCase[] = [...CORE_CASES, ...INJECTION_CASES];

export const SET: FamilySet<"design.critique"> = {
  family: "director.critique",
  task: "design.critique",
  fixtures: USED.map((c) => {
    const f = fixtureOf(c, "director.critique", "design.critique", { brief: briefOf(c), plan: planOf(), candidates: candidatesOf(c), round: 1, tilesPresent: false }, { tags: ["planted:V03", "planted:F1-over", "estimated:C3"] });
    return { ...f, expect: { ...f.expect, planted: [...PLANTED_NEVER_PICKED] } };
  }),
};
