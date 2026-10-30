/**
 * The `brief` eval set (P7 AI; ai.md AI-§F.3 briefs row, AI-20; gates brief@s1). The six brief cases (published
 * pages with their sections and structure tags) and the medical-adjacent products as two-section pages: every hook
 * must trace to a fact, a policy or a section, with no before / after, no body question and no guaranteed result.
 */
import { fixtureOf } from "../../fixture-of";
import type { FamilySet } from "../../types";
import { BRIEF_CASES, MEDICAL_CASES } from "../shared/cases";

const QUESTIONS = { ar: "أسئلتكم", fr: "Vos questions", en: "Questions" } as const;
const COD = { ar: "الدفع عند الاستلام.", fr: "Paiement à la livraison.", en: "Cash on delivery." } as const;

export const SET: FamilySet<"ad.brief"> = {
  family: "brief",
  task: "ad.brief",
  fixtures: [
    ...BRIEF_CASES.map((c) => fixtureOf(c, "brief", "ad.brief", { basedOnVersionId: c.brief.basedOnVersionId, locales: c.brief.locales, product: c.product, sections: c.brief.sections })),
    ...MEDICAL_CASES.map((c) =>
      fixtureOf(c, "brief", "ad.brief", {
        basedOnVersionId: `pv_${c.id}_1`,
        locales: [c.locale],
        product: c.product,
        sections: [
          { id: "hero", tag: "benefit", headline: c.product.name, lead: c.product.facts.join(". ") },
          { id: "faq", tag: "proof", headline: QUESTIONS[c.locale], lead: COD[c.locale] },
        ],
      }),
    ),
  ],
};
