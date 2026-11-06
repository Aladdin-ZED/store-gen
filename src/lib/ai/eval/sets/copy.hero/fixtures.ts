/**
 * The `copy.hero` eval set (P7 AI; ai.md AI-§F.3, AI-02 (1); gates copy.hero@s1). One hero pack per case for one
 * direction; the slot, the headline structure and the angle rotate over the cases so the three structures of a
 * run (noun-phrase, contrast-pair, question) are all exercised.
 */
import { fixtureOf } from "../../fixture-of";
import type { FamilySet } from "../../types";
import { CORE_CASES, DARIJA_CASES, INJECTION_CASES, MEDICAL_CASES, MISREAD_CASES, MODEST_CASES, NICHE_CASES, type EvalCase } from "../shared/cases";

const USED: readonly EvalCase[] = [...CORE_CASES, ...DARIJA_CASES, ...MEDICAL_CASES, ...MODEST_CASES, ...INJECTION_CASES, ...NICHE_CASES, ...MISREAD_CASES];
const DIRECTIONS = [
  { slot: "best_fit", headlineStructure: "noun-phrase", angle: "benefit" },
  { slot: "contrast", headlineStructure: "contrast-pair", angle: "problem" },
  { slot: "explore", headlineStructure: "question", angle: "value" },
] as const;

export const SET: FamilySet<"copy.hero"> = {
  family: "copy.hero",
  task: "copy.hero",
  fixtures: USED.map((c, i) => {
    const d = DIRECTIONS[i % DIRECTIONS.length]!;
    return fixtureOf(c, "copy.hero", "copy.hero", { locale: c.locale, market: c.store.market, product: c.product, deliveryText: c.deliveryText, direction: { ...d, mustAvoid: [] } }, { tags: [`structure:${d.headlineStructure}`] });
  }),
};
