// proves: LP-02, LAN-§3.3, LAN-§6.3
/**
 * test:policies (P3 LANDING; landing.md LAN-§25.1 rows `test:policies` and its rev 3 extension, LAN-§3.3, LAN-§6.3;
 * docs/STORE-SAAS.md §J.1):
 *
 *   npm run test:policies        (tsx src/lib/policies/selftest.ts; offline, no database, under a second)
 *
 * 1. `policyClaims` on the 120-line claim and 120-line clean fixtures of each locale (./fixtures/<locale>.ts):
 *    recall ≥ 95 % (the expected kind is found), false positives ≤ 2 % (any claim on a clean line); the near misses
 *    of LAN-§6.3 ("retour en force", "la livraison du produit", "garantie de qualité", a bare "appel") give nothing;
 *    Arabic-Indic and Latin digits read the same; the quantities come out in the kind's unit.
 * 2. `policyAllows` per claim and locale: the contradiction vs unset matrix of every kind, the LAN-§6.3 acceptance
 *    rows (generated "livraison gratuite" on a 29 DH page is contradicted; "retour sous 7 jours" is unset with
 *    `returns.accepted = null` and contradicted with `false`), and the calling window rule (D73, OD63): a call-time
 *    claim is unset while the window is not configured, a fact inside a configured window, contradicted outside it.
 * 3. `policyLines`: every card unset gives no line; a full policy gives ≤ 6 lines and ≤ 300 tokens in ar / fr / en,
 *    with no em or en dash; long owner lines are cut to the budget.
 * 4. The legal pages (src/landing/legal, LAN-§3.3 acceptance): every card unset gives the visible gap lines and no
 *    promise in ar / fr / en (no call line, no "check before paying"); each answer appears in each locale; every claim
 *    the documents make is one `policyAllows` backs (the store's own facts never contradict its legal pages); the
 *    hours line shows only for a configured window; the law's lines are flagged for review; the contact channels
 *    follow the Contact card; the shipping page carries the returns sections until `returns` is served.
 * Exits 1 on any failure.
 */
import { PoliciesSetting, type StorePolicyFacts } from "@/lib/settings/keys/policies";
import { policyAllows, policyClaims, policyLines, POLICY_LINES_MAX, POLICY_TOKENS_MAX, tokenEstimate, type PolicyClaim, type PolicyClaimKind, type PolicyVerdict, type PromiseFacts } from "./index";
import { createRenderContext, storePageLinks } from "@/landing/context";
import { legalPolicyGaps, legalReviewNotes, legalTexts, RETURNS_SERVED, type LegalPolicyInput, type LegalText, type LegalTextKind } from "@/landing/legal";
import type { Inline } from "@/landing/legal/model";
import { DEFAULT_WINDOW } from "@/lib/callcenter/defaults";
import type { EffectiveWindow } from "@/lib/callcenter/window";
import { fixtureAssets, getFixture } from "@/lib/page/fixtures";
import * as AR from "./fixtures/ar";
import * as EN from "./fixtures/en";
import * as FR from "./fixtures/fr";

let failures = 0;
let checks = 0;
const check = (ok: boolean, name: string, detail?: unknown) => {
  checks++;
  if (!ok) {
    failures++;
    console.error(`FAIL ${name}${detail === undefined ? "" : ` ${JSON.stringify(detail)}`}`);
  }
};

const UNSET: StorePolicyFacts = PoliciesSetting.parse({});
const facts = (patch: Partial<{ [K in keyof StorePolicyFacts]: unknown }>): StorePolicyFacts => PoliciesSetting.parse({ ...patch });
const first = (text: string, locale: "ar" | "fr" | "en", kind: PolicyClaimKind): PolicyClaim => {
  const c = policyClaims(text, locale).find((x) => x.kind === kind);
  if (!c) throw new Error(`no ${kind} claim in "${text}"`);
  return c;
};

/* ------------------------------------------------------------------ */
/* 1. the fixtures                                                     */
/* ------------------------------------------------------------------ */

for (const [locale, fx] of [["fr", FR], ["en", EN], ["ar", AR]] as const) {
  check(fx.claims.length === 120 && fx.clean.length === 120, `${locale}: 120 claim lines and 120 clean lines`, [fx.claims.length, fx.clean.length]);
  const missed = fx.claims.filter(([kind, text]) => !policyClaims(text, locale).some((c) => c.kind === kind));
  const recall = (fx.claims.length - missed.length) / fx.claims.length;
  check(recall >= 0.95, `${locale}: recall ${(recall * 100).toFixed(1)} % ≥ 95 %`, missed.slice(0, 6));
  const noisy = fx.clean.filter((text) => policyClaims(text, locale).length > 0);
  const fp = noisy.length / fx.clean.length;
  check(fp <= 0.02, `${locale}: false positives ${(fp * 100).toFixed(1)} % ≤ 2 %`, noisy.slice(0, 6));
  // every kind is exercised by at least 14 lines
  for (const kind of new Set(fx.claims.map(([k]) => k))) check(fx.claims.filter(([k]) => k === kind).length >= 14, `${locale}: ≥ 14 lines of ${kind}`);
  console.log(`${locale}: recall ${(recall * 100).toFixed(1)} %, false positives ${(fp * 100).toFixed(1)} %`);
}

for (const text of ["retour en force", "la livraison du produit", "garantie de qualité", "appel à l'action", "Paiement à la livraison", "Livraison partout au Maroc", "un appel"]) {
  check(policyClaims(text, "fr").length === 0, `fr near miss gives nothing: "${text}"`, policyClaims(text, "fr"));
}
for (const text of ["the return of the classics", "delivery of the product", "quality guarantee", "call to action"]) {
  check(policyClaims(text, "en").length === 0, `en near miss gives nothing: "${text}"`);
}
for (const text of ["ضمان الجودة", "التوصيل لجميع المدن", "اتصل بنا", "ترجع بشرتك ناعمة ف 7 أيام", "استرداد المبلغ", "يتصل بك عامل التوصيل قبل المرور", "الليفرور غادي يعيط ليك قبل ما يجي"]) {
  check(policyClaims(text, "ar").length === 0, `ar near miss gives nothing: "${text}"`);
}

// quantities in the kind's unit, ranges, qualifiers, times, thresholds
const q = (text: string, locale: "ar" | "fr" | "en", kind: PolicyClaimKind) => {
  const c = first(text, locale, kind);
  return { min: c.min, max: c.max, qualifier: c.qualifier, times: c.times };
};
check(JSON.stringify(q("Livraison 24/48h", "fr", "delivery_time")) === JSON.stringify({ min: 1, max: 2, qualifier: null, times: [] }), "24/48 h → 1 to 2 days");
check(q("Livraison en 36 h", "fr", "delivery_time").max === 2, "36 h rounds up to 2 days");
check(q("Garantie 2 ans", "fr", "warranty").max === 24, "2 ans → 24 months");
check(q("ضمان عامين", "ar", "warranty").max === 24, "عامين (a dual) → 24 months");
check(q("ضمان سنة", "ar", "warranty").max === 12, "سنة alone → 12 months");
check(q("Return it within a week", "en", "return_window").max === 7, "a week → 7 days");
check(q("Renvoyez-le sous quinze jours", "fr", "return_window").max === 15, "quinze (a number word) → 15");
check(q("On vous appelle dans l'heure", "fr", "confirmation_call").qualifier === "within_hour", "dans l'heure → within_hour");
check(JSON.stringify(q("Nous vous appelons entre 9h et 19h30", "fr", "confirmation_call").times) === JSON.stringify(["09:00", "19:30"]), "entre 9h et 19h30 → two clock times");
check(JSON.stringify(q("We'll call you between 9am and 7pm", "en", "confirmation_call").times) === JSON.stringify(["09:00", "19:00"]), "9am to 7pm → 09:00, 19:00");
check(q("Livraison offerte dès 300 DH", "fr", "free_delivery").max === 300, "a free-delivery threshold in currency units");
check(q("Frais de port gratuits dès 2 articles", "fr", "free_delivery").max === null, "a threshold without a currency is not an amount");
check(q("Livré demain", "fr", "delivery_time").qualifier === "next_day", "demain → next_day");
check(policyClaims("on vous appelle de 0522334455", "fr")[0]?.times.length === 0, "a phone number is never a clock time");

// the two digit systems read the same
const pairs: [string, string][] = [
  ["التوصيل ف 24 ساعة", "التوصيل ف ٢٤ ساعة"],
  ["الإرجاع خلال 7 أيام", "الإرجاع خلال ٧ أيام"],
  ["ضمان 18 شهر", "ضمان ١٨ شهر"],
  ["نعيطو ليك من 9 حتى ل 19", "نعيطو ليك من ٩ حتى ل ١٩"],
];
for (const [latin, indic] of pairs) {
  const strip = (cs: PolicyClaim[]) => JSON.stringify(cs.map(({ kind, min, max, qualifier, times }) => ({ kind, min, max, qualifier, times })));
  check(strip(policyClaims(latin, "ar")) === strip(policyClaims(indic, "ar")) && policyClaims(latin, "ar").length > 0, `Arabic-Indic digits read like Latin: ${latin}`);
}
// the matched text keeps the offsets of the text as given (bidi isolates and tatweel included)
const iso = "Prix: ⁦299 DH⁩ · التوصيل فـ ٢٤ ساعة";
const span = policyClaims(iso, "ar")[0];
check(!!span && iso.slice(span.start, span.end) === span.text && span.text.startsWith("التوصيل"), "claim offsets map back to the original text", span);

/* ------------------------------------------------------------------ */
/* 2. policyAllows                                                     */
/* ------------------------------------------------------------------ */

const verdict = (f: StorePolicyFacts | PromiseFacts, text: string, locale: "ar" | "fr" | "en", kind: PolicyClaimKind) => policyAllows(f, first(text, locale, kind));
const expect = (got: PolicyVerdict, want: PolicyVerdict, name: string) => check(got === want, `${name}: ${want}`, got);

// every kind is "unset" when every card is unset (and nothing else is known)
for (const kind of ["delivery_time", "free_delivery", "return_window", "exchange", "inspection", "warranty", "refund", "confirmation_call"] as const) {
  expect(policyAllows(UNSET, kind), "unset", `all cards unset, ${kind}`);
}

// the contradiction vs unset matrix, per kind, in the three locales
const MATRIX: { kind: PolicyClaimKind; lines: Record<"ar" | "fr" | "en", string>; unset: StorePolicyFacts | PromiseFacts; allowed: StorePolicyFacts | PromiseFacts; contradicted: StorePolicyFacts | PromiseFacts }[] = [
  {
    kind: "delivery_time",
    lines: { fr: "Livraison en 48 h", en: "Delivered in 48 hours", ar: "التوصيل ف 48 ساعة" },
    unset: UNSET,
    allowed: facts({ delivery: { typicalDays: [1, 3] } }),
    contradicted: { policies: UNSET, zones: { enabled: true, days: [[3, 5], [4, 6]] } },
  },
  {
    kind: "free_delivery",
    lines: { fr: "Livraison gratuite", en: "Free delivery", ar: "التوصيل مجاني" },
    unset: UNSET,
    allowed: { policies: UNSET, page: { shippingFee: 0, freeOffer: false } },
    contradicted: { policies: UNSET, page: { shippingFee: 29, freeOffer: false } },
  },
  {
    kind: "return_window",
    lines: { fr: "Retour sous 7 jours", en: "Return within 7 days", ar: "الإرجاع خلال 7 أيام" },
    unset: UNSET,
    allowed: facts({ returns: { accepted: true, windowDays: 14 } }),
    contradicted: facts({ returns: { accepted: false } }),
  },
  {
    kind: "exchange",
    lines: { fr: "Échange sous 7 jours", en: "Exchange within 7 days", ar: "التبديل خلال 7 أيام" },
    unset: UNSET,
    allowed: facts({ exchange: { accepted: true, windowDays: 7 } }),
    contradicted: facts({ exchange: { accepted: true, windowDays: 3 } }),
  },
  {
    kind: "inspection",
    lines: { fr: "Ouvrez le colis avant de payer", en: "Open the parcel before paying", ar: "حل الكولي قبل ما تخلص" },
    unset: UNSET,
    allowed: facts({ inspection: "allowed" }),
    contradicted: facts({ inspection: "not_allowed" }),
  },
  {
    kind: "warranty",
    lines: { fr: "Garantie 2 ans", en: "2-year warranty", ar: "ضمان عامين" },
    unset: UNSET,
    allowed: facts({ warranty: { months: 24 } }),
    contradicted: facts({ warranty: { months: 12 } }),
  },
  {
    kind: "refund",
    lines: { fr: "Remboursement sous 7 jours", en: "Full refund within 7 days", ar: "استرجاع الفلوس خلال 7 أيام" },
    unset: UNSET,
    allowed: facts({ refund: { method: "transfer", withinDays: 7 } }),
    contradicted: facts({ refund: { method: "cash", withinDays: 14 } }),
  },
  {
    kind: "confirmation_call",
    lines: { fr: "On vous appelle pour confirmer", en: "We'll call you to confirm", ar: "غادي نعيطو ليك باش نأكدو" },
    unset: UNSET,
    allowed: { policies: UNSET, confirmationCall: true },
    contradicted: { policies: UNSET, confirmationCall: false },
  },
];
for (const row of MATRIX) {
  for (const locale of ["fr", "en", "ar"] as const) {
    const text = row.lines[locale];
    expect(verdict(row.unset, text, locale, row.kind), "unset", `${row.kind} ${locale} "${text}" with the card unset`);
    expect(verdict(row.allowed, text, locale, row.kind), "allowed", `${row.kind} ${locale} "${text}" backed`);
    expect(verdict(row.contradicted, text, locale, row.kind), "contradicted", `${row.kind} ${locale} "${text}" against the policy`);
  }
}

// LAN-§6.3 acceptance rows
expect(verdict({ policies: UNSET, page: { shippingFee: 29, freeOffer: false } }, "Livraison gratuite partout au Maroc", "fr", "free_delivery"), "contradicted", "\"livraison gratuite\" on a page with a 29 DH fee and no free offer");
expect(verdict({ policies: UNSET, page: { shippingFee: 29, freeOffer: true } }, "Livraison gratuite pour le pack de 3", "fr", "free_delivery"), "allowed", "\"livraison gratuite\" with one free-delivery offer");
expect(verdict(facts({ returns: { accepted: null } }), "retour sous 7 jours", "fr", "return_window"), "unset", "\"retour sous 7 jours\" with returns.accepted = null");
expect(verdict(facts({ returns: { accepted: false } }), "retour sous 7 jours", "fr", "return_window"), "contradicted", "\"retour sous 7 jours\" with returns.accepted = false");
expect(verdict(facts({ returns: { accepted: true, windowDays: 7 } }), "Retour sous 30 jours", "fr", "return_window"), "contradicted", "a longer return window than the policy");
expect(verdict(facts({ returns: { accepted: true, windowDays: null } }), "Retour sous 7 jours", "fr", "return_window"), "unset", "returns accepted, no window typed");
expect(verdict(facts({ returns: { accepted: true, whoPays: "customer" } }), "Retours gratuits", "fr", "return_window"), "contradicted", "\"retours gratuits\" while the customer pays");
expect(verdict(facts({ returns: { accepted: true, whoPays: "store" } }), "Free returns", "en", "return_window"), "allowed", "free returns, the store pays");
expect(verdict(facts({ warranty: { months: 24 } }), "Garantie à vie", "fr", "warranty"), "contradicted", "a lifetime warranty is never 24 months");
expect(verdict(facts({ returns: { accepted: false } }), "Satisfait ou remboursé", "fr", "refund"), "contradicted", "\"satisfait ou remboursé\" while returns are refused");
expect(verdict(facts({ delivery: { freeFromCents: 30000 } }), "Livraison offerte dès 300 DH", "fr", "free_delivery"), "allowed", "the policy's own threshold (page unknown)");
expect(verdict(facts({ delivery: { freeFromCents: 30000 } }), "Livraison offerte dès 200 DH", "fr", "free_delivery"), "contradicted", "a lower threshold than the policy");
expect(verdict({ policies: facts({ delivery: { typicalDays: [2, 4] } }), zones: { enabled: true, days: [[0, 1], [2, 4]] } }, "Livraison en 24 h", "fr", "delivery_time"), "allowed", "zones on: one zone delivers within a day");
expect(verdict({ policies: facts({ delivery: { typicalDays: [0, 1] } }), zones: { enabled: true, days: [] } }, "Livraison en 24 h", "fr", "delivery_time"), "unset", "zones on with no days: typicalDays does not count");
expect(verdict(facts({ delivery: { typicalDays: [2, 4] } }), "Livraison le jour même", "fr", "delivery_time"), "contradicted", "same-day delivery against 2 to 4 days");
expect(verdict(facts({ refund: { method: "cash" } }), "Satisfait ou remboursé", "fr", "refund"), "allowed", "a refund method backs \"satisfait ou remboursé\"");

// confirmation_call: checkout.confirmationCall, withinHours and the calling window (D73, OD63)
const WIN = { configured: true, empty: false, ranges: [{ from: "09:30", to: "13:00" }, { from: "14:30", to: "21:00" }] };
const call = (f: Partial<PromiseFacts>): PromiseFacts => ({ policies: UNSET, confirmationCall: true, ...f });
expect(verdict(call({ withinHours: 2 }), "Notre équipe vous appelle sous 2 heures", "fr", "confirmation_call"), "allowed", "within 2 h = withinHours 2");
expect(verdict(call({ withinHours: 4 }), "Notre équipe vous appelle sous 2 heures", "fr", "confirmation_call"), "contradicted", "within 2 h, withinHours 4");
expect(verdict(call({ withinHours: null }), "Nous vous appelons dans l'heure", "fr", "confirmation_call"), "unset", "within the hour, no withinHours");
expect(verdict(call({ callWindow: { ...WIN, configured: false } }), "Nous vous appelons entre 9h30 et 21h", "fr", "confirmation_call"), "unset", "clock times while the window is not configured");
expect(verdict(call({ callWindow: WIN }), "Nous vous appelons entre 9h30 et 21h", "fr", "confirmation_call"), "allowed", "clock times inside the configured window");
expect(verdict(call({ callWindow: WIN }), "We'll call you between 8am and 7pm", "en", "confirmation_call"), "contradicted", "08:00 is outside the configured window");
expect(verdict(call({ callWindow: { ...WIN, empty: true } }), "On vous appelle aujourd'hui", "fr", "confirmation_call"), "contradicted", "today, the configured window is empty");
expect(verdict(call({ callWindow: WIN }), "كنعيطو ليك اليوم", "ar", "confirmation_call"), "allowed", "اليوم inside a configured window");
expect(verdict(call({}), "On vous appelle aujourd'hui", "fr", "confirmation_call"), "unset", "today, window unknown");
expect(verdict(call({ confirmationCall: false, withinHours: 2, callWindow: WIN }), "On vous appelle sous 2 heures", "fr", "confirmation_call"), "contradicted", "no confirmation call at all");

/* ------------------------------------------------------------------ */
/* 3. policyLines                                                      */
/* ------------------------------------------------------------------ */

const DASH = /[‒-―]/;
for (const locale of ["ar", "fr", "en", "de"]) check(policyLines(UNSET, locale).length === 0, `${locale}: every card unset gives no line`, policyLines(UNSET, locale));
const long = "x".repeat(10);
const FULL = facts({
  inspection: "allowed",
  delivery: { coverage: "national", typicalDays: [1, 3], freeFromCents: 30000 },
  returns: { accepted: true, windowDays: 7, whoPays: "customer", condition: { fr: "Produit non ouvert, dans son emballage.", ar: "السلعة ما تكونش محلولة.", en: "Unopened, in its box." } },
  exchange: { accepted: true, windowDays: 14 },
  refund: { method: "transfer", withinDays: 14 },
  warranty: { months: 24, text: { fr: "Sur le moteur.", ar: "على المحرك.", en: "On the motor." } },
  extras: [1, 2, 3, 4, 5, 6].map((i) => ({ id: `line-${i}`, text: { fr: `Ligne ${i} ${long} ${"mot ".repeat(25)}`, ar: `سطر ${i} ${"كلمة ".repeat(25)}`, en: `Line ${i} ${"word ".repeat(25)}` } })),
});
for (const locale of ["ar", "fr", "en"] as const) {
  const lines = policyLines(FULL, locale, { currency: "MAD" });
  const tokens = lines.reduce((n, l) => n + tokenEstimate(l), 0);
  check(lines.length >= 5 && lines.length <= POLICY_LINES_MAX, `${locale}: a full policy gives 5 to 6 lines`, lines);
  check(tokens <= POLICY_TOKENS_MAX, `${locale}: ≤ ${POLICY_TOKENS_MAX} tokens (${tokens})`);
  check(!lines.some((l) => DASH.test(l)), `${locale}: no em or en dash`, lines);
  check(lines.some((l) => l.includes("300 MAD")), `${locale}: the free-delivery threshold with its currency`, lines);
}
const fr = policyLines(FULL, "fr", { currency: "MAD" });
check(fr[0] === "Le client peut ouvrir et vérifier le colis avant de payer.", "fr: inspection line first", fr[0]);
check(fr.some((l) => l.startsWith("Livraison : dans tout le pays, en 1 à 3 jours en général, gratuite dès 300 MAD")), "fr: the delivery line", fr);
// one card set → exactly its line; a partly typed card says only what was typed
check(policyLines(facts({ returns: { accepted: false } }), "fr").join("|") === "Retours non acceptés.", "fr: returns refused is its own line");
check(policyLines(facts({ refund: { withinDays: 7 } }), "en").join("|") === "Refund within 7 days.", "en: a refund delay without a method");
check(policyLines(facts({ returns: { windowDays: 7 } }), "fr").length === 0, "fr: a window without an answer to \"accepted?\" says nothing");
check(policyLines(facts({ extras: [{ id: "cod", text: { fr: "Paiement à la livraison partout." } }] }), "ar").join("|").includes("Paiement à la livraison"), "ar: an owner line typed only in French still reaches the prompt");

/* ------------------------------------------------------------------ */
/* 4. the legal pages (LAN-§3.3)                                       */
/* ------------------------------------------------------------------ */

const LEGAL_NOW = "2026-10-20T10:00:00.000Z";
const LANGS = ["fr", "ar", "en"] as const;
type Lang = (typeof LANGS)[number];
const legalCtx = (locale: Lang) => {
  const fx = getFixture("argan", { locale, now: LEGAL_NOW });
  return createRenderContext(fx.doc, { mode: "live", assets: fixtureAssets(), base: "/", now: LEGAL_NOW, pageKey: "legal", store: fx.store, links: storePageLinks("/s/argan", "argan") });
};
const plainOf = (xs: readonly Inline[]) => xs.map((x) => (typeof x === "string" ? x : x.kind === "ph" ? "" : x.text)).join("");
/** A line that asks the owner for a policy answer ("Délai habituel : à compléter"): the question, never a promise. */
const asksPolicy = (xs: readonly Inline[]) => xs.some((x) => typeof x !== "string" && x.kind === "ph" && x.area === "policies");
/**
 * A document's lines as a shopper reads them. `promises` keeps only what commits the store: it leaves out the law's
 * lines (flagged for review) and the visible gap lines of unset answers.
 */
function linesOf(t: LegalText, promises: boolean): string[] {
  const keep = (xs: readonly Inline[]) => !(promises && asksPolicy(xs));
  const out = t.summary.filter(keep).map(plainOf);
  for (const s of t.sections) {
    for (const blk of s.blocks) {
      if (blk.kind === "p" || blk.kind === "callout") {
        if (!(promises && blk.review) && keep(blk.content)) out.push(plainOf(blk.content));
      } else if (blk.kind === "list") out.push(...blk.items.filter(keep).map(plainOf));
      else out.push(...blk.rows.filter((r) => keep(r.value)).map((r) => plainOf(r.value)));
    }
  }
  return out;
}
type Texts = ReturnType<typeof legalTexts>;
/** The documents that may promise something (privacy describes data uses only). */
const PROMISING: LegalTextKind[] = ["terms", "shipping", "returns", "contact"];
const callWindow = (configured: boolean): EffectiveWindow => ({ tz: "Africa/Casablanca", days: DEFAULT_WINDOW.days, closedDates: [], overrides: [], openOverrideUntil: null, configured });
const RANGES = [
  { from: "09:30", to: "13:00" },
  { from: "09:30", to: "12:15" },
  { from: "14:30", to: "21:00" },
];
const claimsOf = (texts: Texts, lang: Lang) => PROMISING.flatMap((k) => linesOf(texts[k], true).flatMap((line) => policyClaims(line, lang).map((c) => ({ ...c, doc: k }))));
const joined = (texts: Texts) => (Object.keys(texts) as LegalTextKind[]).flatMap((k) => linesOf(texts[k], false)).join("\n");

/** The page's own delivery charge: the one fact a legal page states without a policy card ("Livraison offerte" at 0). */
const pageFee = (lang: Lang): NonNullable<PromiseFacts["page"]> => {
  const { offers } = legalCtx(lang).doc;
  return { shippingFee: offers.shippingFee, freeOffer: offers.bundles.some((o) => o.freeShipping === true) };
};

// every card unset: the gaps, no promise, no call, no hours (only the page's real fee may be stated)
for (const lang of LANGS) {
  const ctx = legalCtx(lang);
  const texts = legalTexts(ctx, null);
  const claims = claimsOf(texts, lang).filter((c) => policyAllows({ policies: UNSET, page: pageFee(lang) }, c) !== "allowed");
  check(claims.length === 0, `${lang}: every card unset, the legal pages make no claim beyond the page's own fee`, claims.map((c) => `${c.doc}: ${c.text}`));
  const gaps = legalPolicyGaps(ctx, null);
  check(gaps.length === 6, `${lang}: every card unset gives its six gap lines (coverage, days, inspection, returns, exchange, refund)`, gaps);
  check(legalPolicyGaps(ctx, { policies: UNSET, confirmationCall: true, zonesWithDays: false, window: callWindow(true) }).length === 6, `${lang}: the call and the window answer no policy card`);
  const notes = legalReviewNotes(ctx);
  check(notes.some((n) => /31[-.]08/.test(n)) && notes.length >= 5, `${lang}: the withdrawal law and the legal guarantee are flagged for legal review`, notes.length);
  check(JSON.stringify(texts).includes(`"area":"policies"`), `${lang}: the gaps point at Policies`);
}
// the call and the hours come only from the store's answers
const frUnset = joined(legalTexts(legalCtx("fr"), null));
check(!frUnset.includes("Nous vous appelons") && !frUnset.includes("Horaires d'appel"), "fr: no confirmation call and no hours without the store's answers");
check(!frUnset.includes("après vérification du colis") && !frUnset.includes("Vérifiez l'état du colis"), "fr: inspection unset never promises a check before paying");
const startingHours = joined(legalTexts(legalCtx("fr"), { policies: UNSET, confirmationCall: true, zonesWithDays: false, window: callWindow(false) }));
check(startingHours.includes("Nous vous appelons pour confirmer") && !startingHours.includes("Horaires d'appel"), "fr: the call is promised, the starting hours are not (configured: false)");

// every answer, in every locale
const FULL_POLICY = facts({
  inspection: "allowed",
  delivery: { coverage: "national", typicalDays: [1, 3] },
  returns: { accepted: true, windowDays: 7, whoPays: "store", condition: { fr: "Produit non utilisé", ar: "منتج غير مستعمل", en: "Unused product" } },
  exchange: { accepted: true, windowDays: 14 },
  refund: { method: "cash", withinDays: 10 },
  warranty: { months: 12 },
  contact: { channels: ["whatsapp"] },
});
const FULL_INPUT: LegalPolicyInput = { policies: FULL_POLICY, confirmationCall: true, zonesWithDays: false, window: callWindow(true) };
const FULL_FACTS: PromiseFacts = { policies: FULL_POLICY, confirmationCall: true, withinHours: null, callWindow: { configured: true, empty: false, ranges: RANGES } };
const EXPECT: Record<Lang, string[]> = {
  fr: ["Livraison dans tout le Maroc, en 1 à 3 jours en général.", "après vérification du colis", "Nous vous appelons pour confirmer avant d'expédier.", "dans les 7 jours suivant la réception", "Les frais de retour sont à notre charge.", "Condition : Produit non utilisé.", "accepte les échanges dans les 14 jours", "Nous remboursons en espèces, dans les 10 jours", "une garantie de 1 an.", "Horaires d'appel : "],
  ar: ["التوصيل إلى جميع مدن المغرب، عادة من 1 إلى 3 أيام.", "بعد معاينة الطرد", "نتصل بك لتأكيد الطلب قبل الإرسال.", "خلال 7 أيام بعد الاستلام", "وتكون مصاريف الإرجاع على عاتقنا.", "الشرط: منتج غير مستعمل.", "يقبل المتجر الاستبدال خلال 14 يوما", "نرد لك المبلغ نقدا، خلال 10 أيام", "ضمانا لمدة سنة واحدة.", "أوقات الاتصال: "],
  en: ["Delivery to every city in Morocco, usually in 1 to 3 days.", "after checking the parcel", "We call you to confirm before shipping.", "within 7 days of delivery", "Return shipping is paid by the store.", "Condition: Unused product.", "accepts exchanges within 14 days", "We refund in cash, within 10 days", "a warranty of 1 year.", "Calling hours: "],
};
for (const lang of LANGS) {
  const ctx = legalCtx(lang);
  const texts = legalTexts(ctx, FULL_INPUT);
  const all = joined(texts);
  const missing = EXPECT[lang].filter((x) => !all.includes(x));
  check(missing.length === 0, `${lang}: each answer appears in the legal pages`, missing);
  check(legalPolicyGaps(ctx, FULL_INPUT).length === 0, `${lang}: every card answered leaves no policy gap`, legalPolicyGaps(ctx, FULL_INPUT));
  const claims = claimsOf(texts, lang);
  const refused = claims.filter((c) => policyAllows({ ...FULL_FACTS, page: pageFee(lang) }, c) !== "allowed");
  check(claims.length >= 3 && refused.length === 0, `${lang}: every claim of the legal pages is backed by the store's answers (${claims.length} claims)`, refused.map((c) => `${c.doc}: ${c.text} → ${policyAllows(FULL_FACTS, c)}`));
  // the Contact card says WhatsApp only: no phone link in any contact line or tile; the seller identity ledger keeps
  // the store's phone, a legal identity detail (loi n° 31-08 art. 29), whatever the channels
  const withoutIdentity = (Object.keys(texts) as LegalTextKind[]).map((k) => ({ ...texts[k], sections: texts[k].sections.map((x) => ({ ...x, blocks: x.blocks.filter((blk) => blk.kind !== "facts") })) }));
  check(JSON.stringify(texts.contact).includes("wa.me") && !JSON.stringify(withoutIdentity).includes("tel:"), `${lang}: the contact channels follow the Contact card (WhatsApp only)`);
  check(!/[–—]/.test(all), `${lang}: no em or en dash in the legal pages`, (all.match(/.{0,30}[–—].{0,30}/g) ?? []).slice(0, 3));
}

// the opposite answers: each refusal is said plainly, and no claim left contradicts them
const NO_POLICY = facts({ inspection: "not_allowed", delivery: { coverage: "listed_zones" }, returns: { accepted: false }, exchange: { accepted: false } });
const NO_INPUT: LegalPolicyInput = { policies: NO_POLICY, confirmationCall: false, zonesWithDays: true, window: null };
const NO_FACTS: PromiseFacts = { policies: NO_POLICY, confirmationCall: false, withinHours: null, callWindow: { configured: false, empty: true, ranges: [] } };
for (const lang of LANGS) {
  const refused = claimsOf(legalTexts(legalCtx(lang), NO_INPUT), lang).filter((c) => policyAllows({ ...NO_FACTS, page: pageFee(lang) }, c) !== "allowed");
  check(refused.length === 0, `${lang}: "no" answers never meet a promise that contradicts them`, refused.map((c) => `${c.doc}: ${c.text}`));
}
// a phone-only Contact card: no WhatsApp link and no "fastest on WhatsApp" line anywhere outside the identity ledger
const phoneOnly = legalTexts(legalCtx("fr"), { ...FULL_INPUT, policies: { ...FULL_POLICY, contact: { channels: ["phone"] } } });
const phoneJson = JSON.stringify(phoneOnly.contact.summary) + JSON.stringify(phoneOnly.contact.sections.filter((x) => x.id !== "company"));
check(!phoneJson.includes("wa.me") && !phoneJson.includes("WhatsApp") && phoneJson.includes("tel:"), "fr: a phone-only Contact card never points at WhatsApp", phoneOnly.contact.summary);
const frNo = joined(legalTexts(legalCtx("fr"), NO_INPUT));
check(["avant d'être ouvert", "n'accepte pas les retours", "ne propose pas d'échange", "affiche la date de livraison prévue pour votre ville"].every((x) => frNo.includes(x)), "fr: not allowed, not accepted and the zones' dates are each said");

// returns: its own document already, carried by the shipping page until it is served
const frFull = legalTexts(legalCtx("fr"), FULL_INPUT);
const RETURN_IDS = ["withdrawal", "returns", "exchange", "refund", "defects"];
check(JSON.stringify(frFull.returns.sections.map((x) => x.id)) === JSON.stringify(RETURN_IDS), "the returns document holds withdrawal, returns, exchange, refund and defects", frFull.returns.sections.map((x) => x.id));
check(RETURNS_SERVED || RETURN_IDS.every((id) => frFull.shipping.sections.some((x) => x.id === id)), "until returns is served, the shipping page carries its sections");
check(new Set(frFull.shipping.sections.map((x) => x.id)).size === frFull.shipping.sections.length, "the shipping page's section ids are unique (anchors)");

console.log(`test:policies: ${checks} checks, ${failures} failed`);
if (failures) process.exit(1);
