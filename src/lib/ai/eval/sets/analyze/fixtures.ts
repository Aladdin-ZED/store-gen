/**
 * The `analyze` eval set (P7 AI; ai.md AI-§F.3 analyze row, AI-04, AI-21, QUAL-18; gates analyze@s1 and @l1). Repo
 * photos ≤ 80 KB with rights (public/dev-fixtures/CREDITS.md, sets/shared/photos/CREDITS.md): an orange-family
 * product, a cluttered flat lay with a printed label, an out-of-focus photo, a plain one, and the clear glass bottle
 * of the misread group (no material fact: "crystal" must not appear).
 */
import { fixtureOf, imagesOf } from "../../fixture-of";
import type { FamilySet } from "../../types";
import { ANALYZE_CASES, MISREAD_CASES, type EvalCase } from "../shared/cases";

const USED: readonly EvalCase[] = [...ANALYZE_CASES, ...MISREAD_CASES.filter((c) => c.photos?.length)];

export const SET: FamilySet<"analyze"> = {
  family: "analyze",
  task: "analyze",
  fixtures: USED.map((c) => fixtureOf(c, "analyze", "analyze", { images: imagesOf(c), adminLocale: c.locale, product: { name: c.product.name, category: c.product.category } })),
};
