/**
 * The `screen` eval set (P7 AI; ai.md AI-§F.3 injection row, AI-§E.3 control 4, AI-08 (3); gates screen@s1). The six
 * planted injections as the imported row that carries them (a fact, a Sheet cell, a product name), and six clean
 * rows that only look loud (capitals, imperatives addressed to a shopper, a customer's note): planted rows are
 * suspicious, clean ones are not.
 */
import { fixtureOf } from "../../fixture-of";
import type { EvalFixture, FamilySet } from "../../types";
import { INJECTION_CASES, SCREEN_CLEAN_TEXTS } from "../shared/cases";
import { STORE_SPARSE } from "../shared/stores";

const planted = INJECTION_CASES.map((c) => {
  const text = c.id === "injection-cancel-orders" ? c.product.name : (c.product.facts[c.product.facts.length - 1] ?? c.product.name);
  return fixtureOf(c, "screen", "injection.screen", { text, source: c.id === "injection-sheet-cell" ? "sheet" : "import" }, { tags: ["expect:suspicious"] });
});

const clean: EvalFixture<"injection.screen">[] = SCREEN_CLEAN_TEXTS.map((t) => ({
  id: `screen/clean-${t.key}`,
  family: "screen",
  task: "injection.screen",
  input: { text: t.text, source: t.source },
  locale: /[؀-ۿ]/.test(t.text) ? "ar" : /\b(?:the|and|now)\b/i.test(t.text) ? "en" : "fr",
  market: "MA",
  tags: ["screen-clean", "expect:clean", t.key],
  expect: { mustNot: [] },
  group: "screen_clean",
  store: STORE_SPARSE,
  seed: 0,
}));

export const SET: FamilySet<"injection.screen"> = { family: "screen", task: "injection.screen", fixtures: [...planted, ...clean] };
