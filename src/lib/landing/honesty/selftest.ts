// proves: LP-01, LP-02, LP-21, SF-03, LAN-§6.4, LAN-§3.2.1, LAN-§6.5, LAN-§23.7
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
 * 4. The honesty gate (`landingGateItems`, src/lib/render/prepublish/landing.ts) on every LAN-§3.2.1 fixture of
 *    src/lib/render/prepublish/landing.fixtures.ts (the core's `test:prepublish` imports them at the P3 merge; until
 *    then they run here): exactly the expected items, refused or published as expected, ≤ 40 ms a page once warm;
 *    the form sweep (every variant × airy / balanced / dense × ar / fr) answers no `form:F1` and no `form:F3`; `warn`
 *    mode changes no item; the check and the listener are registered; the listener never throws.
 * 5. The catalogs (LAN-§6.5, D67): every `landing.gate.*` and `health.landing.*` key in en / fr / ar with the same
 *    placeholders, no em or en dash, no "Step n"; every key an item names exists.
 * 6. Store Health (LAN-§23.7, until P1's `test:health` runs the fixtures): the 17 rules with their groups, severities,
 *    points and `minN`; each fixture fires and is silent as declared; no two rules share a metric in a group; the
 *    two-store fixture (A's facts never answer for B).
 * Exits 1 on any failure.
 */
import Module from "node:module";
import { cleanAiText } from "@/lib/ai/guard";
import type { HealthInputs } from "@/lib/health/types";
import type { Actor, StoreRow } from "@/lib/tenancy/types";
import { FIXTURE_LOCALES, FIXTURE_NAMES } from "@/lib/page/fixtures";
import { numeralsIn } from "@/lib/editor/check-facts";
import { PoliciesSetting } from "@/lib/settings/keys/policies";
import { arabicDigits, basePage, fixtureSource, generated, honestyFixtures, HONESTY_NOW, SENSITIVE_LABELS, setText, singleOffer, storeFacts, zoneRow, type HonestyFixture } from "./fixtures";
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

/* ------------------------------------------------------------------ */
/* 4 to 6: the gate, the catalogs, Store Health                         */
/* ------------------------------------------------------------------ */

// outside Next: `server-only` resolves to its empty build (the gate's loader and the health rules import the db client,
// which never connects at import)
{
  const M = Module as unknown as { _resolveFilename: (request: string, ...rest: unknown[]) => string };
  const resolveFilename = M._resolveFilename;
  M._resolveFilename = function (request: string, ...rest: unknown[]) {
    if (request === "server-only") return require.resolve("next/dist/compiled/server-only/empty.js");
    return resolveFilename.call(this, request, ...rest);
  };
}

async function gateChecks(): Promise<void> {
  const L = await import("@/lib/render/prepublish/landing");
  const F = await import("@/lib/render/prepublish/landing.fixtures");
  const { heightModelIsStub } = await import("@/lib/render/prepublish/budget-limits");
  const { orderFormBand } = await import("@/landing/sections/orderForm/height");
  // scopes come from the seam's minting sites only (lint L6): a system scope, as the jobs and the media selftest use
  const { systemCtx, systemScope } = await import("@/lib/jobs/scope");
  const scopeOf = (storeId: string) => systemScope(systemCtx("qa.honesty"), storeId);
  const gsrc = fixtureSource();
  const fixtures = F.landingGateFixtures(gsrc);
  // the publisher the core's registry hands the check (a fake store: no database is read by the pure gate)
  const publisher = {
    scope: scopeOf("STOREFIXTUREAAAAAAAAAAAAAA"),
    store: { id: "STOREFIXTUREAAAAAAAAAAAAAA", handle: "fixture", market: "MA", timezone: "Africa/Casablanca", status: "active" } as unknown as StoreRow,
    actor: { kind: "user", userId: "USERFIXTUREAAAAAAAAAAAAAAA", impersonatorId: null, ip: null } as Actor,
    pageId: "PAGEFIXTUREAAAAAAAAAAAAAAA",
  };
  const full = (ctx: (typeof fixtures)[number]["ctx"]) => ({ ...publisher, ...ctx });
  const stub = heightModelIsStub();
  const want = ["honesty:sample", "honesty:I4", "honesty:I5", "honesty:D1", "honesty:D2", "honesty:countdown_reset", "honesty:countdown_twice", "honesty:promise", "honesty:stock_untyped", "honesty:password_field", "form:F3"];
  const seen = new Set<string>();
  for (const fx of fixtures) {
    if (fx.integrationOnly && stub) continue;
    const items = L.landingGateItems(full(fx.ctx), fx.inputs);
    items.filter((i) => i.level === "hard").forEach((i) => seen.add(i.id));
    const problems = F.landingFixtureProblems(fx, items);
    check(problems.length === 0, `gate: ${fx.name} (${fx.about})`, problems);
  }
  check(want.every((id) => seen.has(id)), "gate: every refusing row of LAN-§3.2.1 refuses on a fixture", want.filter((id) => !seen.has(id)));
  check(fixtures.some((f) => f.integrationOnly), "gate: the 2,840 px baseline form is listed (asserted once the height model is real)");
  // named acceptance rows (LP-02, LP-21)
  const at = (name: string) => {
    const fx = fixtures.find((f) => f.name === name)!;
    return L.landingGateItems(full(fx.ctx), fx.inputs);
  };
  const conflict = at("blender-conflict").find((i) => i.id === "honesty:D1");
  check(!!conflict && conflict.vars?.a === "40 s" && conflict.vars?.b === "30 secondes", "gate: the blender's conflict names both values", conflict?.vars);
  const sample = at("sample-reviews")[0];
  check(sample?.fix?.actionId === "landing:attest-proof" && sample.title === "landing.gate.honesty.sample.title", "gate: example proof leads to the attestation sheet", sample);
  const promiseSoft = at("owner-return-unset").find((i) => i.id === "honesty:promise");
  check(promiseSoft?.vars?.card === "returns" && promiseSoft.vars?.value === 7, "gate: an unset policy claim prefills its Policies card and value", promiseSoft?.vars);

  // ≤ 40 ms a page once warm (the second pass: the first compiles the claim patterns and fills their memo)
  for (const fx of fixtures) L.landingGateItems(full(fx.ctx), fx.inputs);
  let worst = 0;
  let worstName = "";
  for (const fx of fixtures) {
    const t0 = performance.now();
    L.landingGateItems(full(fx.ctx), fx.inputs);
    const ms = performance.now() - t0;
    if (ms > worst) [worst, worstName] = [ms, fx.name];
  }
  check(worst <= 40, `gate: every fixture page in ≤ 40 ms warm (worst ${worst.toFixed(1)} ms, ${worstName})`);

  // warn mode changes no item (honesty has no warn mode, core §M.1 rule 3)
  for (const name of ["sample-reviews", "countdown-moved-back", "owner-facts"]) {
    const fx = fixtures.find((f) => f.name === name)!;
    const block = L.landingGateItems(full(fx.ctx), fx.inputs);
    const warn = L.landingGateItems({ ...full(fx.ctx), mode: "warn" }, fx.inputs);
    check(JSON.stringify(block) === JSON.stringify(warn), `gate: warn mode answers the same items (${name})`);
  }

  // the form sweep
  const sweep = F.formSweepFixtures(gsrc);
  const bad = sweep.filter((fx) => F.landingFixtureProblems(fx, L.landingGateItems(full(fx.ctx), fx.inputs)).length > 0).map((fx) => fx.name);
  check(sweep.length >= 7 * 2 * 4 * 3 && bad.length === 0, `gate: ${sweep.length} default-state forms (variant × density × ar / fr): no form:F1, no form:F3`, bad.slice(0, 5));
  check(orderFormBand(1_100) === null && orderFormBand(1_101) === "soft" && orderFormBand(1_750) === "soft" && orderFormBand(1_751) === "hard", "gate: form:F1 bands (soft > 1,100 px, hard when × 0.8 > 1,400)");

  // the registry and the listener
  await import("@/lib/render/prepublish");
  check(globalThis.__sgPrePublish?.checks.get("landing") === L.landingCheck && globalThis.__sgPrePublish?.listeners.get("landing") === L.landingPublishListener, "gate: the check and the listener are registered as \"landing\"");
  const fx = fixtures.find((f) => f.name === "countdown-extended")!;
  let threw = false;
  const logged = console.error;
  console.error = () => {};
  try {
    // no database here: the health mark is the P1 stub, the audit write fails and is logged
    await L.landingPublishListener({ ...full(fx.ctx), versionId: "VERSIONFIXTUREAAAAAAAAAAAA", event: "published" });
    await L.landingPublishListener({ ...full(fx.ctx), versionId: "VERSIONFIXTUREAAAAAAAAAAAA", event: "unpublished" });
  } catch {
    threw = true;
  } finally {
    console.error = logged;
  }
  check(!threw, "gate: the publish listener never throws");
  // wave 2: the kits' read needs the database (test:kit holds its DB cases); here it answers or fails, never hangs
  const kits = await L.markKitsStaleFor(publisher.scope, publisher.pageId, fx.ctx.doc).then(
    () => "done",
    () => "no-db",
  );
  check(kits === "done" || kits === "no-db", "gate: markKitsStaleFor settles (the listener's step isolates a failure)");

  // 5. the catalogs: every key an item names, and every landing key in the three locales
  const { messageOf } = await import("@/lib/i18n/admin");
  const { messages: en } = await import("@/lib/i18n/admin/en/landing");
  const { messages: fr } = await import("@/lib/i18n/admin/fr/landing");
  const { messages: ar } = await import("@/lib/i18n/admin/ar/landing");
  const named = new Set<string>();
  for (const f of [...fixtures, ...sweep.slice(0, 4)]) for (const i of L.landingGateItems(full(f.ctx), f.inputs)) [i.title, i.detail].forEach((k) => k && named.add(k));
  check([...named].every((k) => messageOf(k, "en") !== undefined && (en as Record<string, string>)[k] !== undefined), "catalogs: every key an item names is in the landing catalog", [...named].filter((k) => !(k in en)));
  const vars = (tpl: string) => [...tpl.matchAll(/\{(\w+)(?:,\s*plural)?/g)].map((m) => m[1]!).filter((v, i, a) => a.indexOf(v) === i).sort().join(",");
  const keys = Object.keys(en).filter((k) => k.startsWith("landing.gate.") || k.startsWith("health.landing."));
  const missing: string[] = [];
  const placeholder: string[] = [];
  const dashes: string[] = [];
  for (const k of keys) {
    for (const [lang, cat] of [["en", en], ["fr", fr], ["ar", ar]] as const) {
      const tpl = (cat as Record<string, string | undefined>)[k];
      if (tpl === undefined) {
        missing.push(`${lang} ${k}`);
        continue;
      }
      if (vars(tpl) !== vars((en as Record<string, string>)[k]!)) placeholder.push(`${lang} ${k}`);
      if (/[\u2013\u2014]|\bStep \d|\bÉtape \d/.test(tpl)) dashes.push(`${lang} ${k}`);
    }
  }
  check(keys.length >= 90 && missing.length === 0, `catalogs: ${keys.length} gate and health keys in en, fr and ar`, missing);
  check(placeholder.length === 0, "catalogs: the same placeholders in every locale", placeholder);
  check(dashes.length === 0, "catalogs: no em or en dash, no step number", dashes);

  // 6. Store Health
  const H = await import("@/lib/health/rules/landing");
  const T = await import("@/lib/health/types");
  const TABLE: Record<string, [string, 1 | 2 | 3, number?]> = {
    "landing:no_live_page": ["setup", 3],
    "landing:zones_empty": ["setup", 2],
    "landing:holidays_unreviewed": ["setup", 1],
    "landing:policies_unreviewed": ["setup", 1],
    "landing:no_caller": ["setup", 1],
    "landing:countdown_ended": ["trust", 3],
    "landing:compare_not_higher": ["trust", 2],
    "landing:stock_zero": ["trust", 2],
    "landing:stock_stale": ["trust", 1],
    "landing:proof_unattested": ["trust", 2],
    "landing:no_seo": ["conversion", 1],
    "landing:no_alt": ["conversion", 1],
    "landing:no_pixel": ["conversion", 2],
    "landing:form_hidden": ["conversion", 3],
    "landing:leads_slow": ["conversion", 1, 20],
    "landing:wa_intents_waiting": ["conversion", 1, 3],
    "landing:fee_mismatch": ["conversion", 1, 20],
  };
  const table = new Map(H.LANDING_HEALTH_TABLE.map((r) => [r.id, r]));
  check(H.rules.length === 17 && Object.keys(TABLE).every((id) => H.rules.some((r) => r.id === id)), "health: the 17 rules of LAN-§23.7", H.rules.map((r) => r.id));
  for (const [id, [group, severity, minN]] of Object.entries(TABLE)) {
    const r = table.get(id);
    const rule = H.rules.find((x) => x.id === id);
    check(r?.group === group && r.severity === severity && r.points === ({ 1: 3, 2: 6, 3: 10 } as const)[severity] && r.minN === minN && rule?.minN === minN && rule?.release === "R1", `health: ${id} is ${group} ${severity} / ${({ 1: 3, 2: 6, 3: 10 } as const)[severity]}${minN ? `, minN ${minN}` : ""}`, r);
  }
  check(H.rules.every((r) => T.HEALTH_RULE_PREFIXES.landing.some((p) => r.id.startsWith(`${p}:`))), "health: every id carries the file's prefix (PD79)");
  const base = (over: Partial<HealthInputs>): HealthInputs => ({ ...(EMPTY_INPUTS as HealthInputs), ...over });
  const metrics = new Map<string, string>();
  let healthWorst = 0;
  for (const fx of H.fixtures) {
    const rule = H.rules.find((r) => r.id === fx.rule);
    if (!rule) {
      check(false, `health: ${fx.rule} has a rule`);
      continue;
    }
    const fires = base(fx.fires);
    const t0 = performance.now();
    const issue = await rule.collect(scopeOf(fires.store.id), fires);
    healthWorst = Math.max(healthWorst, performance.now() - t0);
    const silent = base(fx.silent);
    const quiet = await rule.collect(scopeOf(silent.store.id), silent);
    check(!!issue && issue.id === fx.rule && (!fx.expect?.severity || issue.severity === fx.expect.severity) && (!fx.expect?.metric || issue.evidence.metric === fx.expect.metric), `health: ${fx.rule} fires on its fixture`, issue);
    check(quiet === null, `health: ${fx.rule} is silent on its other fixture${table.get(fx.rule)?.minN ? " (below minN)" : ""}`, quiet);
    if (issue) {
      const key = `${issue.group} ${issue.evidence.metric}`;
      check(!metrics.has(key), `health: ${fx.rule} has its own metric in its group`, metrics.get(key));
      metrics.set(key, fx.rule);
      check(issue.text === `health.landing.${fx.rule.slice(8)}.text` && issue.fix.label === `health.landing.${fx.rule.slice(8)}.fix` && (en as Record<string, string>)[issue.text] !== undefined, `health: ${fx.rule} speaks through its catalog keys`);
      if (issue.fix.kind === "link") check(issue.fix.href("argan").startsWith("/app/argan/"), `health: ${fx.rule}'s fix is a store link`, issue.fix.href("argan"));
    }
  }
  check(H.fixtures.length === 17, "health: one fixture per rule");
  // the fix column of LAN-§23.7: a store link, or the builder of the named page on its tab or section (CCR r1-p3-5)
  const FIX: Record<string, string> = {
    "landing:no_live_page": "/pages",
    "landing:zones_empty": "/settings/delivery",
    "landing:holidays_unreviewed": "/settings/delivery",
    "landing:policies_unreviewed": "/settings/policies",
    "landing:no_caller": "/settings/checkout",
    "landing:countdown_ended": "/pages/PAGEHEALTHAAAAAAAAAAAAAAAA/edit?tab=offers",
    "landing:compare_not_higher": "/pages/PAGEHEALTHAAAAAAAAAAAAAAAA/edit?tab=product",
    "landing:stock_zero": "/pages/PAGEHEALTHAAAAAAAAAAAAAAAA/edit?tab=offers",
    "landing:stock_stale": "/pages/PAGEHEALTHAAAAAAAAAAAAAAAA/edit?tab=offers",
    "landing:proof_unattested": "/pages/PAGEHEALTHAAAAAAAAAAAAAAAA/edit?section=reviews",
    "landing:no_seo": "/pages/PAGEHEALTHAAAAAAAAAAAAAAAA/edit?tab=seo",
    "landing:no_alt": "/pages/PAGEHEALTHAAAAAAAAAAAAAAAA/edit?tab=product",
    "landing:no_pixel": "/pages/PAGEHEALTHAAAAAAAAAAAAAAAA/edit?tab=seo",
    "landing:form_hidden": "/pages/PAGEHEALTHAAAAAAAAAAAAAAAA/edit?tab=form",
    "landing:leads_slow": "/leads",
    "landing:wa_intents_waiting": "/leads?kind=whatsapp",
    "landing:fee_mismatch": "/pages/PAGEHEALTHAAAAAAAAAAAAAAAA/edit?tab=offers",
  };
  for (const fx of H.fixtures) {
    const fires = base(fx.fires);
    const issue = await H.rules.find((r) => r.id === fx.rule)?.collect(scopeOf(fires.store.id), fires);
    const href = issue?.fix.kind === "link" ? issue.fix.href("argan") : null;
    check(href === `/app/argan${FIX[fx.rule]}`, `health: ${fx.rule}'s fix opens ${FIX[fx.rule]}`, href);
  }
  check(healthWorst <= 40, `health: every rule in ≤ 40 ms over its facts (worst ${healthWorst.toFixed(1)} ms)`);
  // the two-store fixture: B's scope never takes A's facts, and B's own are quiet
  const two = H.twoStoreFixture();
  const inputsB = base(two.inputsB);
  let refused = 0;
  for (const rule of H.rules) {
    try {
      await rule.collect(scopeOf(two.b.storeId), { ...inputsB, landing: two.a } as HealthInputs);
    } catch {
      refused++;
    }
  }
  check(refused === H.rules.length, "health: A's facts never answer for B's scope (two stores)", refused);
  const issuesA = H.landingIssues(two.a, base(H.quietInputs()));
  const issuesB = H.landingIssues(two.b, inputsB);
  check(issuesA.length >= 6 && issuesB.length === 0, "health: A trips its page rules, B (quiet) none", { a: issuesA.map((i) => i.id), b: issuesB.map((i) => i.id) });
}

/** P1's empty base inputs, as `test:health` merges fixtures over them (every source failed: null). */
const EMPTY_INPUTS: Omit<HealthInputs, "store" | "now"> & { now: Date } = {
  now: new Date(HONESTY_NOW),
  slaHours: null,
  pages: null,
  brand: null,
  abuseReports: null,
  orders: null,
  integrations: null,
  sheets: null,
  ai: null,
  design: null,
  usage: null,
  settings: null,
  members: null,
  review: null,
  zones: null,
};

gateChecks().then(
  () => {
    console.log(`test:honesty: ${checks} checks, ${failures} failed (${all.length} fixtures)`);
    if (failures) process.exit(1);
  },
  (err: unknown) => {
    console.error("test:honesty crashed:", err);
    process.exit(1);
  },
);
