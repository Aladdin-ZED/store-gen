/**
 * The `copy.page` eval set (P7 AI; ai.md AI-§F.3, AI-02; gates copy.page@s1 and @l1). Every shared group a page's
 * copy can fail on: the core products, Darija-heavy, medical-adjacent, modest / kids / Arabic names, injection, no
 * WhatsApp / no inspection, long and empty facts, the niche, the word numbers and the misread materials.
 */
import { fixtureOf } from "../../fixture-of";
import type { FamilySet } from "../../types";
import { CORE_CASES, DARIJA_CASES, INJECTION_CASES, LONG_EMPTY_CASES, MEDICAL_CASES, MISREAD_CASES, MODEST_CASES, NICHE_CASES, POLICY_CASES, WORD_NUMBER_CASES, type EvalCase } from "../shared/cases";

const USED: readonly EvalCase[] = [...CORE_CASES, ...DARIJA_CASES, ...MEDICAL_CASES, ...MODEST_CASES, ...INJECTION_CASES, ...POLICY_CASES, ...LONG_EMPTY_CASES, ...NICHE_CASES, ...WORD_NUMBER_CASES, ...MISREAD_CASES];

export const SET: FamilySet<"copy.page"> = {
  family: "copy.page",
  task: "copy.page",
  fixtures: USED.map((c) => fixtureOf(c, "copy.page", "copy.page", { locale: c.locale, market: c.store.market, product: c.product, analysis: null, deliveryText: c.deliveryText, direction: null, kickers: null })),
};
