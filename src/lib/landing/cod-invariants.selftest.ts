// proves: LP-01, LAN-§3.7, LAN-§3.5
/**
 * test:cod-invariants (P3 LANDING; landing.md LAN-§3.7, LAN-§3.5 OF2, LAN-§25.1 row `test:cod-invariants`):
 *
 *   npm run test:cod-invariants        (tsx src/lib/landing/cod-invariants.selftest.ts; offline)
 *
 * 1. `codInvariants` over hand-built `HeightReport`s (src/lib/design/types.frozen.ts) and patched fixture pages: each
 *    of the seven invariants true and false; the P0 stub report (`formTop: null`) reads the form's section top.
 * 2. The OF2 height model (src/landing/sections/orderForm/height.ts): the 928 px base with ≤ 2 offers and the address
 *    row, + 0.15 per offer row beyond 2, + 0.25 per visible per-piece option group, + 0.07 for the bump, no
 *    multiplier; the `form:F1` bands; the `duo`, `tshirt` and `colors` fixtures in their default state.
 *
 * The 41-page baseline corpus case of LAN-§25.1 (23 stage pages fail `foldOk`, the form on screen 14-17 fails
 * `formScreen ≤ 3`) needs P6's real height model and the git-ignored qa/ corpus: it runs as an integration check at
 * the P6 merge (`qa:design-corpus`), not here.
 * Exits 1 on any failure.
 */
import type { HeightReport } from "@/lib/design/types.frozen";
import { estimateHeights } from "@/lib/design/heights";
import { getFixture } from "@/lib/page/fixtures";
import type { PageDoc } from "@/lib/page/schema";
import { orderFormBand, orderFormEstimate, ORDER_FORM_FEATURES_H, ORDER_FORM_SCREEN_PX } from "@/landing/sections/orderForm/height";
import { codInvariants, countdownPlaces, COD_NO_FORM_SCREENS, type CodInvariantInputs } from "./cod-invariants";

let failures = 0;
let checks = 0;
const check = (ok: boolean, name: string, detail?: unknown) => {
  checks++;
  if (!ok) {
    failures++;
    console.error(`FAIL ${name}${detail === undefined ? "" : ` ${JSON.stringify(detail)}`}`);
  }
};

const NOW = "2026-10-20T10:00:00.000Z";
const base = getFixture("argan", { locale: "fr", now: NOW }).doc;
/** The argan page with only these section types, in this order (ids are the types). */
function page(types: string[], patch: (doc: PageDoc) => void = () => {}): PageDoc {
  const doc = structuredClone(base);
  doc.sections = types.map((t) => {
    const s = base.sections.find((x) => x.type === t);
    if (!s) throw new Error(`argan has no ${t} section`);
    return structuredClone(s);
  });
  doc.offers.urgency = {};
  doc.form = { ...doc.form, whatsapp: undefined };
  patch(doc);
  return doc;
}

const report = (o: Partial<HeightReport> = {}): HeightReport => ({
  v: 1,
  viewport: 390,
  sections: [],
  total: 8_440,
  screens: 10,
  formTop: 1_688,
  formHeight: 928,
  fold: { family: "split", ok: true, items: { image: 120, price: 520, cta: 600, cod: 650 }, limit: 844 },
  inFlow: 9,
  ...o,
});
const inputs = (o: Partial<CodInvariantInputs> = {}, r: Partial<HeightReport> = {}): CodInvariantInputs => ({ heights: report(r), zonesLine: false, zonesWithLine: false, whatsapp: null, ...o });

const STORY = ["header", "hero", "benefits", "offer", "orderForm", "faq", "cta", "footer"];

/* ------------------------------------------------------------------ */
/* 1. the seven invariants                                             */
/* ------------------------------------------------------------------ */

// a page that meets every invariant
const good = codInvariants(page(STORY), inputs());
check(JSON.stringify(good) === JSON.stringify({ formScreen: 2, ctaTargetsForm: true, offerBeforeCta: true, deliveryLine: "n/a", whatsappConfigured: true, urgencyReal: true, foldOk: true }), "a page that meets every invariant", good);

// formScreen
check(codInvariants(page(STORY), inputs({}, { formTop: 2_532 })).formScreen === 3, "formScreen: 2,532 px is screen 3.0 (I2 holds)");
check(codInvariants(page(STORY), inputs({}, { formTop: 11_816 })).formScreen === 14, "formScreen: the baseline form on screen 14 (I2 fails)");
check(codInvariants(page(STORY), inputs({}, { formTop: null, sections: [{ id: "orderForm", type: "orderForm", variant: "card", top: 3_000, height: 600 }] })).formScreen === 3.55, "formScreen: the stub report's section top stands in for formTop");
check(codInvariants(page(STORY), inputs({}, { formTop: null, sections: [] })).formScreen === COD_NO_FORM_SCREENS, "formScreen: no top at all reads as no form (never as screen 0)");
const formless = page(STORY.filter((t) => t !== "orderForm"));
const noForm = codInvariants(formless, inputs({ zonesLine: true, zonesWithLine: true }));
check(noForm.formScreen === COD_NO_FORM_SCREENS && JSON.parse(JSON.stringify(noForm)).formScreen === COD_NO_FORM_SCREENS, "formScreen: no form gives 99, which survives JSON", noForm);

// ctaTargetsForm
check(!noForm.ctaTargetsForm, "ctaTargetsForm: false without a visible form (the hero's #order resolves nowhere)");
check(!codInvariants(page(STORY, (d) => {
    d.sections.find((s) => s.type === "orderForm")!.hidden = true;
  }), inputs()).ctaTargetsForm, "ctaTargetsForm: false when the form is hidden");

// offerBeforeCta
check(!codInvariants(page(["header", "hero", "cta", "offer", "orderForm", "footer"]), inputs()).offerBeforeCta, "offerBeforeCta: false when the final cta comes before the offer");
check(codInvariants(page(["header", "hero", "cta", "offer", "orderForm", "faq", "cta", "footer"], (d) => {
    d.sections[6]!.id = "cta2";
  }), inputs()).offerBeforeCta, "offerBeforeCta: true when the final cta follows the offer");
check(!codInvariants(page(["header", "hero", "offer", "orderForm", "offer", "cta", "footer"], (d) => {
    d.sections[4]!.id = "offer2";
  }), inputs()).offerBeforeCta, "offerBeforeCta: false with two pack pickers");
check(codInvariants(page(["header", "hero", "orderForm", "cta", "footer"]), inputs()).offerBeforeCta, "offerBeforeCta: true without an offer section");

// deliveryLine
check(codInvariants(page(STORY), inputs({ zonesLine: true, zonesWithLine: true })).deliveryLine === "present", "deliveryLine: present with zones on and a visible form");
check(noForm.deliveryLine === "absent", "deliveryLine: absent with zones on and no form");
check(codInvariants(page(STORY), inputs({ zonesLine: true, zonesWithLine: false })).deliveryLine === "n/a", "deliveryLine: n/a when no zone has a line to say");
check(codInvariants(page(STORY), inputs({ zonesLine: false, zonesWithLine: true })).deliveryLine === "n/a", "deliveryLine: n/a when the line is off");

// whatsappConfigured
const withFloat = page([...STORY, "whatsappFloat"]);
check(!codInvariants(withFloat, inputs()).whatsappConfigured, "whatsappConfigured: false, a floating button and no number");
check(codInvariants(withFloat, inputs({ whatsapp: "+212612345678" })).whatsappConfigured, "whatsappConfigured: true with the store's number");
check(codInvariants(page(STORY, (d) => {
    d.form.whatsapp = { enabled: true, number: "+212612345678" };
  }), inputs()).whatsappConfigured, "whatsappConfigured: true with the form's own number");
check(codInvariants(page(STORY), inputs()).whatsappConfigured, "whatsappConfigured: true when nothing shows WhatsApp");
check(!codInvariants(page([...STORY, "whatsappFloat"]), inputs({ whatsapp: "  " })).whatsappConfigured, "whatsappConfigured: a blank number is no number");

// urgencyReal
const END = "2026-10-30T22:59:00.000Z";
const both = page(["announcement", ...STORY.slice(0, 4), "urgency", ...STORY.slice(4)], (d) => {
  d.offers.urgency = { countdownEnd: END };
});
check(!codInvariants(both, inputs()).urgencyReal && countdownPlaces(both).length === 2, "urgencyReal: false, the countdown in the bar and in the urgency block", countdownPlaces(both));
check(codInvariants(page(["announcement", ...STORY], (d) => {
  d.offers.urgency = { countdownEnd: END };
}), inputs()).urgencyReal, "urgencyReal: true, one countdown");
check(codInvariants(page(["announcement", ...STORY, "urgency"]), inputs()).urgencyReal && countdownPlaces(page(["announcement", "urgency"])).length === 0, "urgencyReal: true without an end date (the blocks fall back, nothing counts down)");
const barOff = page(["announcement", ...STORY, "urgency"], (d) => {
  d.offers.urgency = { countdownEnd: END };
  d.sections[0]!.data = { ...d.sections[0]!.data, countdown: false };
});
check(codInvariants(barOff, inputs()).urgencyReal, "urgencyReal: true when the bar's countdown is switched off");
const stockLeads = page(["announcement", ...STORY, "urgency"], (d) => {
  d.offers.urgency = { countdownEnd: END, stockLeft: 12 };
  d.sections.find((s) => s.type === "urgency")!.variant = "stock";
});
check(codInvariants(stockLeads, inputs()).urgencyReal, "urgencyReal: true when the stock variant leads with the real stock");

// foldOk
check(!codInvariants(page(STORY), inputs({}, { fold: { family: "stage", ok: false, items: { image: 0, price: 980 }, limit: 844 } })).foldOk, "foldOk: false when the fold contract fails (a stage hero)");

// the P0 stub height model, as P6's digest will call it today
const stubReport = estimateHeights(page(STORY), { look: null, locale: "fr", features: () => ({ fixed: null }) as never });
const fromStub = codInvariants(page(STORY), { heights: stubReport, zonesLine: false, zonesWithLine: false, whatsapp: null });
check(stubReport.formTop === null && fromStub.formScreen === Math.round((stubReport.sections.find((s) => s.type === "orderForm")!.top / 844) * 100) / 100, "a stub HeightReport is accepted as it is and the form's section top stands in", { formTop: stubReport.formTop, formScreen: fromStub.formScreen });

/* ------------------------------------------------------------------ */
/* 2. the OF2 height model                                             */
/* ------------------------------------------------------------------ */

const one = page(STORY, (d) => {
  d.offers.bundles = d.offers.bundles.slice(0, 2);
  d.offers.orderBump = undefined;
  d.items = d.items.map((it) => ({ ...it, groups: [] }));
});
const e1 = orderFormEstimate(one, null);
check(e1.screens === 1.1 && e1.px === 928 && e1.address === "row", "OF2: ≤ 2 offers, no option, no bump: 1.1 screens, 928 px, the address row", e1);
check(orderFormEstimate(one, "optional").px === 928 && orderFormEstimate(one, "optional").address === "disclosure", "OF2: an optional address sits behind the disclosure in the same budget");
const three = page(STORY, (d) => {
  d.offers.orderBump = { enabled: true, title: "Trousse", price: 49 };
  d.items = d.items.map((it) => ({ ...it, groups: [] }));
});
const e3 = orderFormEstimate(three, "required");
check(e3.offerRows === 3 && e3.bump && e3.screens === 1.32 && e3.px === Math.round(1.32 * ORDER_FORM_SCREEN_PX), "OF2: + 0.15 for the third offer row, + 0.07 for the bump", e3);
const blender = getFixture("blender", { locale: "fr", now: NOW }).doc;
check(orderFormEstimate(blender, null).optionGroups === 0, "OF2: the blender's Duo (2 pieces) collapses its colours behind the summary row");
blender.offers.bundles = blender.offers.bundles.map((b) => ({ ...b, preselected: b.id === "one", badge: "none" }));
const single = orderFormEstimate(blender, null);
check(single.optionGroups === 1 && single.px === Math.round((1.1 + 0.15 * 1 + 0.25) * ORDER_FORM_SCREEN_PX), "OF2: a single piece shows its colour row: + 0.25", single);
for (const name of ["duo", "tshirt", "colors"] as const) {
  for (const locale of ["fr", "ar"] as const) {
    const e = orderFormEstimate(getFixture(name, { locale, now: NOW }).doc, null);
    check(e.px <= 1_100 && orderFormBand(e.px) === null, `OF2: ${name}/${locale} default state ≤ 1,100 px, no form:F1 item (${e.px} px)`, e);
  }
}
const tshirt = orderFormEstimate(getFixture("tshirt", { locale: "fr", now: NOW }).doc, null);
check(tshirt.optionGroups === 0 && tshirt.offerRows === 3 && tshirt.px === 1_055, "OF2: the t-shirt's Duo collapses its matrix and name rows; three offer rows: 1,055 px", tshirt);
check(orderFormBand(1_100) === null && orderFormBand(1_101) === "soft" && orderFormBand(1_750) === "soft" && orderFormBand(1_751) === "hard", "form:F1 bands: soft above 1,100 px, hard when × 0.8 > 1,400 px");
check(orderFormBand(2_840) === "hard", "form:F1: the 2,840 px baseline form is hard (× 0.8 = 2,272 > 1,400)");
check(ORDER_FORM_FEATURES_H.fixed === true && ORDER_FORM_FEATURES_H.base === 1.1 && ORDER_FORM_FEATURES_H.per.optionGroup === 0.25, "OF2: P6's features.h entry is fixed and carries the per-row terms");

console.log(`test:cod-invariants: ${checks} checks, ${failures} failed`);
if (failures) process.exit(1);
