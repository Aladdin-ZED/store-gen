/**
 * The `brief` eval set (P7 AI; ai.md AI-§F.3 briefs row, AI-20; gates brief@s1). 50 briefs (AI-20 (1): "0 violations
 * on 50 briefs"): the six brief cases (published pages with their sections and structure tags), the medical-adjacent
 * products, the 24 core products, the Darija-heavy and the modest / kids products, and the two stores that refuse
 * inspection, each as a two- or three-section page built from the case's own name and facts. Every hook must trace
 * to a fact, a policy or a section, with no before / after, no body question and no guaranteed result.
 */
import { fixtureOf } from "../../fixture-of";
import type { FamilySet } from "../../types";
import { BRIEF_CASES, CORE_CASES, DARIJA_CASES, MEDICAL_CASES, MODEST_CASES, POLICY_CASES, type EvalCase } from "../shared/cases";

const QUESTIONS = { ar: "أسئلتكم", fr: "Vos questions", en: "Questions" } as const;
const COD = { ar: "الدفع عند الاستلام.", fr: "Paiement à la livraison.", en: "Cash on delivery." } as const;
const OFFER = { ar: "اختار العرض ديالك", fr: "Choisissez votre offre", en: "Pick your offer" } as const;

/** A page the seller would publish for the case: the hero on its name and facts, the FAQ on COD, an offer section on every other case. */
function pageOf(c: EvalCase, i: number) {
  const sections = [
    { id: "hero", tag: "benefit", headline: c.product.name, lead: c.product.facts.join(". ") },
    { id: "faq", tag: "proof", headline: QUESTIONS[c.locale], lead: COD[c.locale] },
  ];
  if (i % 2 === 0) sections.push({ id: "offer", tag: "value", headline: OFFER[c.locale], lead: COD[c.locale] });
  return { basedOnVersionId: `pv_${c.id}_1`, locales: [c.locale], product: c.product, sections };
}

const PAGES: readonly EvalCase[] = [...MEDICAL_CASES, ...CORE_CASES, ...DARIJA_CASES, ...MODEST_CASES, ...POLICY_CASES.filter((c) => c.id.startsWith("policy-no-inspect"))];

export const SET: FamilySet<"ad.brief"> = {
  family: "brief",
  task: "ad.brief",
  fixtures: [
    ...BRIEF_CASES.map((c) => fixtureOf(c, "brief", "ad.brief", { basedOnVersionId: c.brief.basedOnVersionId, locales: c.brief.locales, product: c.product, sections: c.brief.sections })),
    ...PAGES.map((c, i) => fixtureOf(c, "brief", "ad.brief", pageOf(c, i))),
  ],
};
