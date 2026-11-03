/**
 * The `director.critique` eval set (P7 AI; ai.md AI-§F.3 Director row, AI-§A.8.9, AI-19a; gates
 * director.critique@s1). The 24 core products and the injection cases with their six engine candidates
 * (sets/shared/director.ts): the planted V03 hard gate (c4) and the F1 budget over (c6) are never picked, the
 * estimated C3 budget (c3) stays eligible. Round 1, no tiles (R1).
 *
 * Plus the JPEG-artefact case (AI-19 (6), QUAL-29): candidate c2 carries a raster orange hit from compression
 * artefacts (`raster.orangeRegions`, the soft `orangeAdvisory`) while its tokens are clean (no V03): it must stay
 * eligible, so the hit excludes nothing (the raster itself arrives with the tiles in R2).
 */
import { fixtureOf } from "../../fixture-of";
import type { EvalFixture, FamilySet } from "../../types";
import { CORE_CASES, INJECTION_CASES, type EvalCase } from "../shared/cases";
import { PLANTED_NEVER_PICKED, briefOf, candidatesOf, jpegArtefactOf, planOf } from "../shared/director";

const USED: readonly EvalCase[] = [...CORE_CASES, ...INJECTION_CASES];

const critiqueOf = (c: EvalCase, candidates = candidatesOf(c), extra: { tags?: string[]; id?: string } = {}): EvalFixture<"design.critique"> => {
  const f = fixtureOf(c, "director.critique", "design.critique", { brief: briefOf(c), plan: planOf(), candidates, round: 1, tilesPresent: false }, { ...extra, tags: ["planted:V03", "planted:F1-over", "estimated:C3", ...(extra.tags ?? [])] });
  return { ...f, expect: { ...f.expect, planted: [...PLANTED_NEVER_PICKED] } };
};

const jpegCase = CORE_CASES.find((c) => c.id === "core-blender-fr")!;
const jpeg = critiqueOf(jpegCase, jpegArtefactOf(candidatesOf(jpegCase)), { id: "core-blender-fr-jpeg", tags: ["planted:jpeg-artefact"] });
delete jpeg.smoke;

export const SET: FamilySet<"design.critique"> = {
  family: "director.critique",
  task: "design.critique",
  fixtures: [...USED.map((c) => critiqueOf(c)), jpeg],
};
