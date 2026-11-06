/**
 * The `copy.field` eval set (P7 AI; ai.md AI-§F.3, AI-05; gates copy.field@s1 and @l1). The cases that carry a line
 * to rewrite: Darija CTAs (intent darija), modest pieces (concrete), injected lines (shorter: the injection must not
 * survive), long names (shorter), the word numbers (shorter: the planted figure must go) and the misread materials
 * (premium: no material may appear).
 */
import { fixtureOf } from "../../fixture-of";
import type { FamilySet } from "../../types";
import { DARIJA_CASES, INJECTION_CASES, LONG_EMPTY_CASES, MISREAD_CASES, MODEST_CASES, WORD_NUMBER_CASES, type EvalCase } from "../shared/cases";

const USED: readonly EvalCase[] = [...DARIJA_CASES, ...MODEST_CASES, ...INJECTION_CASES, ...LONG_EMPTY_CASES, ...WORD_NUMBER_CASES, ...MISREAD_CASES].filter((c) => c.field);

export const SET: FamilySet<"copy.field"> = {
  family: "copy.field",
  task: "copy.field",
  fixtures: USED.map((c) => {
    const f = c.field!;
    return fixtureOf(
      c,
      "copy.field",
      "copy.field",
      { locale: c.locale, field: f.path, text: f.text, max: f.max, intent: f.intent, targetLocale: f.targetLocale ?? null, product: { name: c.product.name, facts: c.product.facts }, mustAvoid: [] },
      { tags: [`intent:${f.intent}`, `category:${c.product.category}`] },
    );
  }),
};
