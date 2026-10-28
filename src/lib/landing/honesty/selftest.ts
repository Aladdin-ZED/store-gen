// proves: LP-02, LAN-§6.4
/**
 * test:honesty (P3 LANDING; landing.md LAN-§6.4 acceptance, LAN-§25.1 row `test:honesty`, LAN-§1.4 LP-02):
 *
 *   npm run test:honesty        (tsx src/lib/landing/honesty/selftest.ts; offline, no database)
 *
 * 1. `auditNumbers` on the committed fixtures (./fixtures.ts): the baseline contradictions (blender "30 s" / "40 s",
 *    t-shirt "+9 400 pièces" / "1 000 colis", the library "4,7 (312)" hero, the library "94 %") give exactly the
 *    expected hard findings; owner-typed "3 couleurs", "2 en 1", "100 % coton", "50 ml", "XL 2024" give one soft
 *    finding each and none after attestation; a generated "3 couleurs" is hard; the keep-list pages give none; the
 *    two digit systems of an Arabic page give identical findings; isolates, <bdi> runs, phones and clock times are
 *    never flagged.
 * 2. `allowedNumbersFor`: the pricing of every offer, the zones' days (only while zones are on), the policy windows,
 *    `withinHours`, `stockLeft`, the countdown's date parts, an attested rating; the guard adapter (rule 5).
 * 3. `sensitiveFields` / `SENSITIVE_FIELD_RE`: the four labels are flagged, the fixture pages (7 × ar / fr / en) and
 *    the near misses ("Code postal", "Code promo", "Message sur la carte cadeau") are not.
 * Exits 1 on any failure.
 */
import { cleanAiText } from "@/lib/ai/guard";
import { FIXTURE_LOCALES, FIXTURE_NAMES } from "@/lib/page/fixtures";
import { numeralsIn } from "@/lib/editor/check-facts";
import { PoliciesSetting } from "@/lib/settings/keys/policies";
import { arabicDigits, basePage, fixtureSource, generated, honestyFixtures, SENSITIVE_LABELS, setText, singleOffer, storeFacts, zoneRow, type HonestyFixture } from "./fixtures";
import { guardAllowedNumbers, guardNumbersIn } from "./guard-numbers";
import { allowedNumbersFor, auditNumbers, factNumerals, PROOF_CLASSES, SENSITIVE_FIELD_RE, sensitiveFields, type NumberFinding } from "./numbers";

let failures = 0;
let checks = 0;
const check = (ok: boolean, name: string, detail?: unknown) => {
  checks++;
  if (!ok) {
    failures++;
    console.error(`FAIL ${name}${detail === undefined ? "" : ` ${JSON.stringify(detail)}`}`);
  }
};

const audit = (fx: HonestyFixture): NumberFinding[] => auditNumbers(fx.doc, allowedNumbersFor(fx.doc, fx.store), fx.doc.locale, fx.origin, { attestedSections: fx.attestedSections });
const key = (f: { path: string; value: string; level: string; why: string }) => `${f.path} ${f.value} ${f.level} ${f.why}`;

/* ------------------------------------------------------------------ */
/* 1. the fixtures                                                     */
/* ------------------------------------------------------------------ */

const src = fixtureSource();
const all = honestyFixtures(src);
let elapsed = 0;
for (const fx of all) {
  if (!fx.numbers) continue;
  const t0 = performance.now();
  const got = audit(fx);
  elapsed += performance.now() - t0;
  const want = fx.numbers.map(key).sort();
  const have = got.map(key).sort();
  check(JSON.stringify(have) === JSON.stringify(want), `${fx.name}: exactly the expected findings`, { want, have: got.map((f) => ({ ...f })) });
}
check(elapsed < 1_000, `the fixtures audit in < 1 s (${Math.round(elapsed)} ms)`);

// the finding's words, class and origin on the baseline cases
const byName = (name: string) => all.find((f) => f.name === name)!;
const blender = audit(byName("blender-30s-40s"))[0];
check(blender?.text === "40 s" && blender.cls === "fact" && blender.origin === "generated", "blender: the finding reads \"40 s\", a fact, generated", blender);
const conflict = audit(byName("blender-conflict"))[0];
check(conflict?.conflictsWith === "40 s", "blender conflict: names the other value", conflict);
const counters = audit(byName("tshirt-counters"));
check(counters.every((f) => f.cls === "counter" && PROOF_CLASSES.has(f.cls)) && counters[0]?.text.startsWith("+9 400"), "t-shirt: both numerals are counters (a proof class)", counters);
const rating = audit(byName("library-rating"));
check(JSON.stringify(rating.map((f) => f.cls)) === JSON.stringify(["rating", "review_count"]), "library hero: a rating and a review count", rating);
const owner = audit(byName("owner-facts"));
check(JSON.stringify(owner.map((f) => f.text)) === JSON.stringify(["3 couleurs", "2 en 1", "100 % coton", "50 ml", "XL 2024"]), "owner facts: the finding's words are what the attestation sheet shows", owner.map((f) => f.text));
check(owner.every((f) => f.origin === "owner" && f.level === "soft" && !PROOF_CLASSES.has(f.cls!)), "owner facts: owner-typed, soft, never a proof class", owner);

// attesting each fact through its finding's words clears it (rule 7: recordFacts stores numeralsIn(text))
const attested = byName("owner-facts");
const store = storeFacts({ facts: owner.map((f) => f.text) });
check(auditNumbers(attested.doc, allowedNumbersFor(attested.doc, store), "fr", new Map()).length === 0, "owner facts: none left once each finding's words are attested");
check(owner.every((f) => numeralsIn(f.text).includes(f.value)), "owner facts: recordFacts' numeralsIn finds the value in the words it stores", owner.map((f) => [f.text, numeralsIn(f.text)]));

// the two digit systems: identical findings (the words differ by their digits only)
const strip = (fs: NumberFinding[]) => JSON.stringify(fs.map((f) => ({ ...f, text: "" })));
const indic = audit(arabicDigits(src, "indic"));
const latin = audit(arabicDigits(src, "latin"));
check(indic.length === 4 && strip(indic) === strip(latin), "ar: Arabic-Indic and ar-MA Latin digits give identical findings", { indic, latin });

// isolates, <bdi>, phones, clock times, "7j/7", identifiers, URLs: never flagged
const quiet = singleOffer(basePage(src, "argan", "fr"));
const QUIET = [
  "Remise ⁦−25%⁩ aujourd'hui.",
  "⁧٣٧٪⁩ de remise.",
  "Prix voisin <bdi>1 299 DH</bdi>.",
  "Appelez le 06 12 34 56 78 ou le +212 522 33 44 00.",
  "Ouvert de 9h à 18h, 7j/7, livraison 24h/24.",
  "Câble USB-C, référence FG-380, format A4.",
  "Écrivez à contact@atelier-12.ma ou sur https://wa.me/212612345678.",
  "Commande #A12B9 confirmée.",
];
const faq = quiet.sections.find((s) => s.type === "faq")!;
const faqItem = (faq.data.items as Record<string, unknown>[])[0]!;
faq.data = { ...faq.data, items: QUIET.map((a, i) => ({ ...faqItem, q: `Question ${"abcdefgh"[i]}`, a })) };
const quietFindings = auditNumbers(quiet, allowedNumbersFor(quiet, storeFacts()), "fr", generated(...QUIET.map((_, i) => `faq.items.${i}.a`)));
check(quietFindings.length === 0, "isolates, <bdi>, phones, clock times, identifiers, URLs and order ids are never read", quietFindings);

// hidden sections are ignored; an attested proof section's numerals are the owner's proof
const hidden = byName("library-stats");
hidden.doc.sections.find((s) => s.type === "stats")!.hidden = true;
check(audit(hidden).length === 0, "a hidden stats section gives nothing");
const proof = byName("library-stats");
check(auditNumbers(proof.doc, allowedNumbersFor(proof.doc, proof.store), "fr", new Map(), { attestedSections: new Set(["stats"]) }).length === 0, "an attested stats section gives nothing");

// conflicts of a single-valued class: "48 h" against zones of 1 to 3 days; a matching "1 à 3 jours" is fine
const zones = singleOffer(basePage(src, "argan", "fr"));
setText(zones, "benefits.items.0.text", "Livraison en 48 h partout.");
setText(zones, "benefits.items.1.text", "Livraison en 1 à 3 jours.");
const zoneFindings = auditNumbers(zones, allowedNumbersFor(zones, storeFacts({ zones: [zoneRow(["*"], [1, 3])], zonesEnabled: true })), "fr", new Map());
check(zoneFindings.length === 1 && zoneFindings[0]!.why === "conflict" && zoneFindings[0]!.conflictsWith === "1-3" && zoneFindings[0]!.level === "hard", "\"48 h\" against zones of 1 to 3 days is a hard conflict", zoneFindings);
const zonesOff = auditNumbers(zones, allowedNumbersFor(zones, storeFacts({ zones: [zoneRow(["*"], [1, 3])], zonesEnabled: false })), "fr", new Map());
check(zonesOff.some((f) => f.value === "3" && f.cls === "delivery_days"), "zones off: the zones' days are not allowed", zonesOff);

/* ------------------------------------------------------------------ */
/* 2. allowedNumbersFor                                                */
/* ------------------------------------------------------------------ */

const blenderDoc = src.doc("blender", "fr");
const policies = PoliciesSetting.parse({ returns: { accepted: true, windowDays: 7 }, exchange: { accepted: true, windowDays: 14 }, refund: { withinDays: 10 }, warranty: { months: 24 }, delivery: { typicalDays: [2, 4], freeFromCents: 30_000 } });
const allowed = allowedNumbersFor(blenderDoc, storeFacts({ policies, confirmation: { withinHours: 2 }, facts: ["Prêt en 30 secondes"] }));
const has = (cls: keyof typeof allowed.byClass, v: string) => !!allowed.byClass[cls]?.includes(v);
check(has("price", "199") && has("price", "359") && has("price", "499") && has("price", "89"), "allowed: offer and upsell prices", allowed.byClass.price);
check(has("compare_at", "249") && has("compare_at", "398") && has("savings", "50") && has("savings", "20"), "allowed: references and savings (money and percent)", { c: allowed.byClass.compare_at, s: allowed.byClass.savings });
check(has("unit_price", "179.5") && has("units", "3"), "allowed: per-unit price and units", { u: allowed.byClass.unit_price, n: allowed.byClass.units });
check(has("delivery_days", "2") && has("delivery_days", "4"), "allowed: typicalDays while zones are off", allowed.byClass.delivery_days);
check(has("return_days", "7") && has("return_days", "14") && has("return_days", "10") && has("warranty_months", "24") && has("within_hours", "2") && has("price", "300"), "allowed: policy windows, withinHours and the free-delivery threshold");
check(has("stock", "52") && (allowed.byClass.countdown?.length ?? 0) >= 3 && has("fact", "30"), "allowed: stock, the countdown's date parts, the wizard's facts", { stock: allowed.byClass.stock, cd: allowed.byClass.countdown });
check(!allowed.all.has("4.5") && !allowed.all.has("86"), "allowed: an unattested product rating is not a fact");
const rated = allowedNumbersFor(blenderDoc, storeFacts({ ratingAttested: true }));
check(rated.byClass.rating?.includes("4.5") === true && rated.byClass.review_count?.includes("86") === true, "allowed: an attested rating and its count", rated.byClass.rating);
const withZones = allowedNumbersFor(blenderDoc, storeFacts({ policies, zones: [zoneRow(["fes"], [1, 2]), zoneRow(["*"], [3, 5], 1)], zonesEnabled: true }));
check(JSON.stringify(withZones.byClass.delivery_days) === JSON.stringify(["1", "2", "3", "5"]), "allowed: the zones' days replace typicalDays while zones are on", withZones.byClass.delivery_days);
check([...allowed.all].every((v) => /^\d+(?:\.\d+)?$/.test(v)), "allowed: every value is a normalised numeral", [...allowed.all].filter((v) => !/^\d+(?:\.\d+)?$/.test(v)));

// rule 5: the guard adapter reads numerals exactly like guard.ts (Latin and Arabic-Indic digits, "," as ".")
check(JSON.stringify(guardNumbersIn("٣ ألوان, 2,5 kg, 050 ml")) === JSON.stringify(["3", "2.5", "050"]), "guard adapter: numbersIn", guardNumbersIn("٣ ألوان, 2,5 kg, 050 ml"));
const g = guardAllowedNumbers({ locale: "fr", productName: "Blender 380", facts: ["050 ml"], price: 199, deliveryText: "Livraison 24h" });
check(["050", "50", "380", "199", "24"].every((v) => g.has(v)), "guard adapter: facts, name, price and delivery text, as written and as numbers", [...g]);
check(JSON.stringify(factNumerals("3 couleurs, 2,5 kg, ٥٠ مل")) === JSON.stringify(numeralsIn("3 couleurs, 2,5 kg, ٥٠ مل")), "factNumerals reads like recordFacts' numeralsIn");
// the adapter against the guard's own entry point (CCR r1-p3-1): a line made of numerals the adapter allows passes
// cleanAiText, and the same line with one numeral it refuses is rejected, in both digit systems
for (const [locale, ok, bad] of [
  ["fr", "Bol de 1,5 l, 380 W, prêt pour 199 DH et livré en 24h.", "Bol de 1,5 l, 380 W, prêt pour 199 DH et livré en 48h."],
  ["ar", "خلاط 380 واط، ب ١٩٩ درهم، كاس ٥٠ مل.", "خلاط 380 واط، ب ١٩٩ درهم، كاس ٦٠ مل."],
] as const) {
  // the guard also checks the language, so each line is judged in its own locale
  const gctx = { locale, productName: "Blender 380", facts: ["Bol de 1,5 l", "50 ml"], price: 199, deliveryText: "Livraison 24h" };
  const gok = guardAllowedNumbers(gctx);
  check(guardNumbersIn(ok).every((n) => gok.has(n)) && cleanAiText(ok, gctx, gok, 200) !== null, `guard adapter: cleanAiText keeps a line the adapter allows: ${ok}`);
  check(!guardNumbersIn(bad).every((n) => gok.has(n)) && cleanAiText(bad, gctx, gok, 200) === null, `guard adapter: cleanAiText drops the numeral the adapter refuses: ${bad}`);
}

/* ------------------------------------------------------------------ */
/* 3. sensitive fields                                                 */
/* ------------------------------------------------------------------ */

const sens = sensitiveFields(byName("sensitive-fields").doc);
check(JSON.stringify(sens.map((s) => s.label).sort()) === JSON.stringify([...SENSITIVE_LABELS].sort()), "sensitiveFields flags the four labels", sens);
check(sens.some((s) => s.path.startsWith("items.0.groups.")) && sens.filter((s) => s.path.startsWith("offers.extras.")).length === 3, "sensitiveFields: the item field and the three order extras", sens.map((s) => s.path));
let clean = 0;
for (const name of FIXTURE_NAMES) {
  for (const locale of FIXTURE_LOCALES) {
    const found = sensitiveFields(src.doc(name, locale));
    if (found.length) check(false, `sensitiveFields: nothing on ${name}/${locale}`, found);
    else clean++;
  }
}
check(clean === FIXTURE_NAMES.length * FIXTURE_LOCALES.length, `sensitiveFields: nothing on the ${clean} fixture pages`);
const NEAR = ["Code postal", "Code promo", "Message sur la carte cadeau", "Prénom à imprimer", "Taille", "Postal code", "Promo code", "Gift card message", "Engraving", "رقم الهاتف", "الاسم للطباعة", "كود البرومو", "Numéro de téléphone"];
for (const label of NEAR) check(!Object.values(SENSITIVE_FIELD_RE).some((re) => re.test(label)), `"${label}" is not a sensitive field`);
const BAD = ["Mot de passe", "Code SMS", "Code de vérification", "Numéro de carte", "Carte bancaire", "CVV", "RIB", "IBAN", "Password", "One-time code", "Card number", "Security code", "كلمة السر", "كلمة المرور", "رمز التحقق", "رقم البطاقة", "الكود اللي وصلك"];
for (const label of BAD) check(Object.values(SENSITIVE_FIELD_RE).some((re) => re.test(label)), `"${label}" is a sensitive field`);

console.log(`test:honesty: ${checks} checks, ${failures} failed (${all.length} fixtures)`);
if (failures) process.exit(1);
