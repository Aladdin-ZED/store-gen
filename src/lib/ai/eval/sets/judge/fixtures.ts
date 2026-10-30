/**
 * The `judge` eval set (P7 AI; ai.md AI-§F.5 calibration, AI-07 (6); gates judge@s1). Known negatives the judge must
 * fail (an empty output, "I don't know", a confident answer for another product), a verbosity pair (the longer
 * output says nothing more: it must not win), an identical pair (tie) and a dishonest pair (an invented figure
 * loses on honesty). The expected verdict is the `expect:` tag; the order of A and B is fixed here and randomised
 * by the harness.
 */
import { fixtureOf } from "../../fixture-of";
import type { EvalFixture, FamilySet } from "../../types";
import { CORE_CASES, type EvalCase } from "../shared/cases";

const caseById = (id: string): EvalCase => {
  const c = CORE_CASES.find((x) => x.id === id);
  if (!c) throw new Error(`judge fixtures: no case ${id}`);
  return c;
};
const serum = caseById("core-serum-fr");
const blender = caseById("core-blender-en");
const briefOf = (c: EvalCase) => `${c.product.name} (${c.product.category}), ${(c.product.priceMinor / 100).toFixed(0)} ${c.product.currency}. Facts: ${c.product.facts.join("; ")}.`;

const GOOD_FR = "Un sérum léger à l'huile d'argan et à la vitamine E, en flacon de 30 ml. Vous payez à la livraison.";
const GOOD_EN = "A portable blender with a USB rechargeable battery and a 400 ml cup. Pay in cash on delivery.";

const PAIRS = [
  { key: "empty", c: serum, property: "specificity" as const, a: GOOD_FR, b: "", expect: "A" },
  { key: "dont-know", c: blender, property: "codRelevance" as const, a: "I don't know", b: GOOD_EN, expect: "B" },
  { key: "wrong-product", c: serum, property: "honesty" as const, a: "Des écouteurs Bluetooth avec un boîtier de charge, livrés partout.", b: GOOD_FR, expect: "B" },
  {
    key: "verbosity",
    c: blender,
    property: "specificity" as const,
    a: `${GOOD_EN} This portable blender has a USB rechargeable battery and a 400 ml cup. Truly a blender that blends, made for blending, ready to blend whenever you want to blend.`,
    b: GOOD_EN,
    expect: "B",
  },
  { key: "identical", c: serum, property: "naturalness" as const, a: GOOD_FR, b: GOOD_FR, expect: "tie" },
  { key: "invented-figure", c: serum, property: "honesty" as const, a: "Un sérum à l'huile d'argan, adopté par 10 000 clientes, résultats en 7 jours.", b: GOOD_FR, expect: "B" },
];

export const SET: FamilySet<"eval.judge"> = {
  family: "judge",
  task: "eval.judge",
  fixtures: PAIRS.map((p, i): EvalFixture<"eval.judge"> => {
    const f = fixtureOf(p.c, "judge", "eval.judge", { family: "copy.page", property: p.property, locale: p.c.locale, fixture: { id: p.c.id, brief: briefOf(p.c) }, a: p.a, b: p.b }, { id: `${p.c.id}-${p.key}`, tags: [`expect:${p.expect}`, `property:${p.property}`] });
    const out: EvalFixture<"eval.judge"> = { ...f, group: "judge", expect: { mustNot: [] } };
    delete out.smoke;
    return i === 0 ? { ...out, smoke: true } : out;
  }),
};
