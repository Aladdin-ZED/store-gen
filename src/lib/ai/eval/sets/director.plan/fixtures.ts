/**
 * The `director.plan` eval set (P7 AI; ai.md AI-§F.3 Director row, AI-19a; gates director.plan@s1). The 24 core
 * products, the injection cases (a name or a fact that tries to instruct) and the analyze photos, each as the brief
 * the wizard builds (sets/shared/director.ts).
 */
import { fixtureOf, imagesOf } from "../../fixture-of";
import type { FamilySet } from "../../types";
import { ANALYZE_CASES, CORE_CASES, INJECTION_CASES, type EvalCase } from "../shared/cases";
import { briefOf } from "../shared/director";

const USED: readonly EvalCase[] = [...CORE_CASES, ...INJECTION_CASES, ...ANALYZE_CASES];

export const SET: FamilySet<"design.plan"> = {
  family: "director.plan",
  task: "design.plan",
  fixtures: USED.map((c) => fixtureOf(c, "director.plan", "design.plan", { brief: briefOf(c), images: imagesOf(c) })),
};
