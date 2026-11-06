/**
 * Template self test (P5 INTEGRATIONS; operations.md OPE-§O.1 "templates", OPE-§7.4 acceptance, OPE-§22.2, §22.3;
 * OPE-§O.4 IN-05, OP-05, LP-04, AI-15). Offline: injected facts, no database, no network, no server module. It is the
 * templates section of scripts/qa/conversions-check.ts (`test:conversions`), and runs alone too:
 *
 *   npx tsx src/lib/integrations/templates.selftest.ts      (exit code 1 on failure)
 *
 * - the language: parse / render, optional blocks, literal braces, `unknown_var` / `unbalanced` / `too_long` with
 *   their positions, lenient rendering of a broken source;
 * - the WhatsApp built-ins: the OPE-§22.2 texts exactly (read from the spec table), in each locale's own catalog,
 *   parsing, no digit of their own; rendered over the 40 fixture orders in ar, fr and en with ZERO numbers absent from
 *   the order or the settings (the number scanner of src/lib/ai/guard.ts, proven equal below); an empty `eta_text`
 *   removes every timing sentence; `thank_you_confirm` says the order id and nothing else (LP-04);
 * - `confirm_number` (caller phone, else the WhatsApp digits, else empty) and `confirm_hours` (empty while the window
 *   is not `configured`, OD63; filled from a configured window built over src/lib/callcenter/window.fixtures.ts);
 * - `waLink`: ≤ 1,000 characters and ≤ 2,000 URL characters, optional blocks dropped first, then `units_text`
 *   shortened, the order id always kept, no bidi control character added;
 * - the repository's pure rules: agents never get a draft or an archived row (AI-15); the save checks.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { cleanAiText } from "@/lib/ai/guard";
import { hoursText, rangesForDay, type EffectiveWindow } from "@/lib/callcenter/window";
import { WINDOW_FIXTURES } from "@/lib/callcenter/window.fixtures";
import { formatMoney } from "@/lib/markets/money";
import { parseTemplate, renderTemplate, TEMPLATE_SRC_MAX, TEMPLATE_VARS, templateVars, type TemplateValues, type TemplateVar } from "./template-lang";
import { confirmHoursFor, confirmNumberOf, dialable, shortDate, templateValuesFrom } from "./template-values";
import { factsOf, FIXTURE_NOW, TEMPLATE_FIXTURES, type TemplateFixture } from "./templates.fixtures";
import { builtinTemplate, parseBuiltinId, TEMPLATE_LOCALES, WA_KIND_INFO, WA_KINDS, WA_KINDS_R1, type TemplateLocale, type WaKind } from "./whatsapp/builtins";
import { checkTemplateInput, chooseTemplate, type TemplateRowLike } from "./whatsapp/choose";
import { WA_TEXT_MAX, WA_URL_MAX, waLink, waMessage } from "./whatsapp/link";

export interface SectionResult {
  pass: number;
  failures: string[];
  notes: string[];
  ms: number;
}

/** The wall time this section may add to `test:conversions` (brief p5-01: ≤ 2 s). */
const BUDGET_MS = 2000;

/** Bidi controls (LRM, RLM, ALM, the embeddings, overrides and isolates): a rendered text never gains one. */
const BIDI = /[‎‏؜‪-‮⁦-⁩]/;

/* ------------------------------------------------------------------ */
/* the number scanner of src/lib/ai/guard.ts (allowedNumbers, :47-62)  */
/* ------------------------------------------------------------------ */

// guard.ts does not export `numbersIn` / `allowedNumbers` (CCR r1-p5-1 asks P7 to); these are the same rules, and
// `scannerParity` below proves them equal to the guard's own refusal through its exported `cleanAiText`.
const ASCII_DIGITS = (s: string) => s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
function numbersIn(s: string): string[] {
  return ASCII_DIGITS(s).match(/\d+(?:[.,]\d+)?/g)?.map((n) => n.replace(",", ".")) ?? [];
}
function allowedFrom(facts: readonly (string | number | null | undefined)[]): Set<string> {
  const out = new Set<string>();
  for (const f of facts) {
    if (f === null || f === undefined) continue;
    for (const n of numbersIn(String(f))) {
      out.add(n);
      out.add(String(Number(n)));
    }
  }
  return out;
}
const invented = (text: string, allowed: Set<string>) => numbersIn(text).filter((n) => !allowed.has(n) && !allowed.has(String(Number(n))));

/** Every number a fixture's texts may carry in `locale`: its stored facts and their plain renderings. */
function factNumbers(fx: TemplateFixture, locale: TemplateLocale): Set<string> {
  const o = fx.order;
  const cur = o.currency;
  return allowedFrom([
    o.id,
    o.name,
    o.productName,
    JSON.stringify(o.items),
    o.qty,
    o.total,
    o.shipping,
    o.city,
    o.address,
    o.landmark,
    o.carrierLabel,
    o.trackingRef,
    fx.store.name,
    fx.confirmation?.callerPhone,
    fx.confirmation?.whatsapp,
    fx.eta?.[locale],
    fx.hours,
    fx.upsell?.title,
    fx.upsell?.price,
    fx.trackingLink,
    // renderings of the facts above (grouped money, national phone, short date)
    formatMoney(o.total, cur, locale),
    formatMoney(o.shipping, cur, locale),
    fx.upsell ? formatMoney(fx.upsell.price, cur, locale) : null,
    fx.confirmation?.callerPhone ? dialable(fx.confirmation.callerPhone, fx.store.market) : null,
    fx.confirmation?.whatsapp ? dialable(`+${fx.confirmation.whatsapp}`, fx.store.market) : null,
    o.shipAfter ? shortDate(o.shipAfter, locale, fx.store.timezone) : null,
  ]);
}

/* ------------------------------------------------------------------ */
/* the OPE-§22.2 table                                                 */
/* ------------------------------------------------------------------ */

/** fr / ar / en of each kind, read from the spec's table (so a catalog that drifts from the spec fails). */
function specTexts(): Map<string, Record<TemplateLocale, string>> | null {
  let doc: string;
  try {
    doc = readFileSync(path.join(process.cwd(), "docs", "saas", "spec", "operations.md"), "utf8");
  } catch {
    return null;
  }
  const start = doc.indexOf("### OPE-§22.2");
  const end = doc.indexOf("### OPE-§22.3", start);
  if (start < 0 || end < 0) return null;
  const out = new Map<string, Record<TemplateLocale, string>>();
  for (const line of doc.slice(start, end).split("\n")) {
    const m = /^\| `([a-z_]+)`(?: \(R2\))? \|/.exec(line);
    if (!m) continue;
    const cells = line.split("|").map((c) => c.trim());
    // | kind | used by | fr | ar | en |
    const [fr, ar, en] = [cells[3], cells[4], cells[5]];
    if (fr && ar && en && fr !== "—") out.set(m[1]!, { fr, ar, en });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* the test                                                            */
/* ------------------------------------------------------------------ */

export function templatesSelftest(): SectionResult {
  const t0 = performance.now();
  let pass = 0;
  const failures: string[] = [];
  const notes: string[] = [];
  const eq = (label: string, got: unknown, want: unknown) => {
    const g = JSON.stringify(got);
    const w = JSON.stringify(want);
    if (g === w) pass++;
    else failures.push(`templates: ${label}\n    got:  ${g}\n    want: ${w}`);
  };
  const ok = (label: string, cond: boolean, info?: unknown) => {
    if (cond) pass++;
    else failures.push(`templates: ${label}${info === undefined ? "" : `\n    ${JSON.stringify(info)}`}`);
  };

  /* ---------------- the language ---------------- */
  const p = parseTemplate("Bonjour {customer_first_name}, ici {store_name}.[[ Livraison prévue {eta_text}.]] {customer_first_name}");
  ok("parse: ok", p.ok);
  eq("parse: each variable once, in order", p.ok ? p.vars : null, ["customer_first_name", "store_name", "eta_text"]);
  eq("parse: parts", p.ok ? p.parts.map((x) => x.kind) : null, ["text", "var", "text", "var", "text", "optional", "text", "var"]);
  eq("render: filled block kept", renderTemplate("A[[ B {eta_text}.]] C", { eta_text: "demain" }), "A B demain. C");
  eq("render: empty variable drops its block", renderTemplate("A[[ B {eta_text}.]] C", { eta_text: "" }), "A C");
  eq("render: whitespace-only is empty", renderTemplate("A[[ B {eta_text}.]] C", { eta_text: "   " }), "A C");
  eq("render: absent variable drops its block", renderTemplate("A[[ {city} {landmark}]]!", { city: "Fès" }), "A!");
  eq("render: a block without a variable stays", renderTemplate("A[[ B]] C", {}), "A B C");
  eq("render: empty variable outside a block leaves no double space", renderTemplate("ici[[ {agent_first_name} de]] {store_name}, à {city} et", { store_name: "Nour" }), "ici Nour, à et");
  eq("render: literal braces", renderTemplate("{{order_id}} = {order_id} }} {{", { order_id: "CMD-1" }), "{order_id} = CMD-1 } {");
  eq("render: braces around a variable", renderTemplate("{{{order_id}}}", { order_id: "CMD-1" }), "{CMD-1}");
  eq("render: single brackets are text", renderTemplate("[ok] [{qty}]", { qty: "2" }), "[ok] [2]");
  eq("render: line ends trimmed, newlines kept", renderTemplate("Ligne {city}\nDeux", {}), "Ligne\nDeux");
  eq("render: an abbreviation's period ends the sentence", renderTemplate("Livraison prévue {eta_text}. Merci… ok...", { eta_text: "le jeu. 5 nov." }), "Livraison prévue le jeu. 5 nov. Merci… ok...");
  eq("render: a value is never parsed again", renderTemplate("{customer_first_name}", { customer_first_name: "{order_id} [[x]]" }), "{order_id} [[x]]");
  const errors: [string, string, "unknown_var" | "unbalanced", number][] = [
    ["unknown variable", "Hi {name}", "unknown_var", 3],
    ["unknown variable, wrong case", "Total {Total}", "unknown_var", 6],
    ["unclosed variable", "Hi {order_id", "unbalanced", 3],
    ["empty braces", "{}", "unbalanced", 0],
    ["space inside braces", "{ order_id}", "unbalanced", 0],
    ["stray closing brace", "Hi } there", "unbalanced", 3],
    ["brace after a variable", "{order_id}}", "unbalanced", 10],
    ["unclosed block", "A [[B {city}", "unbalanced", 2],
    ["stray block end", "A ]] B", "unbalanced", 2],
    ["nested block", "[[a [[b]] c]]", "unbalanced", 4],
    ["error inside a block", "x[[ {nope}]]", "unknown_var", 4],
  ];
  for (const [label, src, error, at] of errors) eq(`parse error: ${label}`, parseTemplate(src), { ok: false, error, at });
  ok("parse: 1,000 characters accepted", parseTemplate("a".repeat(TEMPLATE_SRC_MAX)).ok);
  eq("parse: too_long at the 1,001st character", parseTemplate("a".repeat(TEMPLATE_SRC_MAX + 1)), { ok: false, error: "too_long", at: TEMPLATE_SRC_MAX });
  ok("parse: 1,000 emoji (code points, not UTF-16 units) accepted", parseTemplate("\u{1F600}".repeat(TEMPLATE_SRC_MAX)).ok);
  eq("parse: too_long `at` is a UTF-16 index", parseTemplate("\u{1F600}".repeat(TEMPLATE_SRC_MAX + 1)), { ok: false, error: "too_long", at: TEMPLATE_SRC_MAX * 2 });
  eq("parse: a lower cap (script lines)", parseTemplate("abcdef", { max: 5 }), { ok: false, error: "too_long", at: 5 });
  let threw = false;
  let lenient = "";
  try {
    lenient = renderTemplate("Hi {name} {order_id [[x", { order_id: "CMD-1" });
  } catch {
    threw = true;
  }
  ok("render: a broken source never throws", !threw);
  eq("render: a broken source renders leniently", lenient, "Hi {order_id [[x");
  eq("templateVars: lists known variables of a broken source", templateVars("{nope} {city} [[{city} {eta_text}"), ["city", "eta_text"]);
  ok("TEMPLATE_VARS: 23 unique variables (rev 3 appended last)", new Set(TEMPLATE_VARS).size === 23 && TEMPLATE_VARS.slice(-3).join() === "carrier_label,carrier_tracking,ship_after_date");

  /* ---------------- the number scanner equals the guard's ---------------- */
  {
    const probes: [string, string[]][] = [
      ["12", ["12"]],
      ["12", ["13"]],
      ["3,5", ["3.5"]],
      ["3,5", ["3"]],
      ["٣٤", ["34"]],
      ["۷", ["7"]],
      ["1 299", ["1299"]],
      ["1 299", ["1", "299"]],
      ["06", ["6"]],
      ["v2", []],
      ["no digit", []],
    ];
    const ctx = { locale: "en" as const, productName: "", facts: [] };
    let agree = 0;
    for (const [s, facts] of probes) {
      const allowed = allowedFrom(facts);
      const ours = invented(s, allowed).length === 0;
      const theirs = cleanAiText(s, ctx, allowed, 200) !== null;
      if (ours === theirs) agree++;
      else failures.push(`templates: scanner parity on ${JSON.stringify(s)} with ${JSON.stringify(facts)}: ours ${ours}, guard ${theirs}`);
    }
    if (agree === probes.length) pass++;
  }

  /* ---------------- the built-ins ---------------- */
  const spec = specTexts();
  if (!spec) notes.push("templates: docs/saas/spec/operations.md not found, the OPE-§22.2 text comparison was skipped");
  ok("built-ins: shipped is R2 and hidden from R1 lists", WA_KIND_INFO.shipped.release === "R2" && !WA_KINDS_R1.includes("shipped") && WA_KINDS_R1.length === WA_KINDS.length - 1);
  eq("built-ins: custom has no text", TEMPLATE_LOCALES.map((l) => builtinTemplate("custom", l)), [null, null, null]);
  eq("built-in ids: parse", [parseBuiltinId("builtin:confirm:ar"), parseBuiltinId("builtin:nope:fr"), parseBuiltinId("builtin:confirm:es"), parseBuiltinId("01JAAAAAAAAAAAAAAAAAAAAAAA")], [{ kind: "confirm", locale: "ar" }, null, null, null]);
  const kinds = WA_KINDS.filter((k) => WA_KIND_INFO[k].builtin);
  const bodies = new Map<string, string>();
  for (const kind of kinds) {
    for (const locale of TEMPLATE_LOCALES) {
      const b = builtinTemplate(kind, locale);
      if (!b) {
        failures.push(`templates: built-in ${kind}/${locale} is missing from its catalog`);
        continue;
      }
      bodies.set(`${kind}:${locale}`, b.body);
      ok(`built-in ${kind}/${locale}: id`, b.id === `builtin:${kind}:${locale}` && JSON.stringify(parseBuiltinId(b.id)) === JSON.stringify({ kind, locale }));
      const parsed = parseTemplate(b.body);
      ok(`built-in ${kind}/${locale}: parses`, parsed.ok, parsed);
      ok(`built-in ${kind}/${locale}: eta_text only inside an optional block`, parsed.ok && !parsed.parts.some((x) => x.kind === "var" && x.name === "eta_text"));
      if (spec) eq(`built-in ${kind}/${locale}: the OPE-§22.2 text`, b.body, spec.get(kind)?.[locale]);
      // every variable filled with a letter: the text of the template itself carries no digit
      const letters = Object.fromEntries(TEMPLATE_VARS.map((v) => [v, "X"])) as TemplateValues;
      ok(`built-in ${kind}/${locale}: no number of its own`, !/[0-9٠-٩۰-۹]/.test(renderTemplate(b.body, letters)));
    }
    const [fr, ar, en] = [bodies.get(`${kind}:fr`), bodies.get(`${kind}:ar`), bodies.get(`${kind}:en`)];
    ok(`built-in ${kind}: ar is Arabic, fr is not en`, !!ar && /[؀-ۿ]/.test(ar) && !!fr && fr !== en);
    ok(`built-in ${kind}: same variables in the three locales`, new Set([fr, ar, en].map((s) => templateVars(s ?? "").sort().join())).size === 1);
  }
  // the scanner catches a number a template would add (the negative control of the zero-number check)
  {
    const fx = TEMPLATE_FIXTURES[0]!;
    const v = templateValuesFrom(factsOf(fx, "fr"));
    const forged = renderTemplate(`${bodies.get("confirm:fr")} Livraison en 48 h, 98 % de clients satisfaits.`, v);
    eq("number scanner: a promise the store never made is caught", invented(forged, factNumbers(fx, "fr")), ["48", "98"]);
  }

  /* ---------------- 40 orders × 3 locales × every built-in ---------------- */
  const timing = (kind: WaKind, locale: TemplateLocale): string[] => {
    const parsed = parseTemplate(bodies.get(`${kind}:${locale}`) ?? "");
    if (!parsed.ok) return [];
    // the literal words of every optional block that carries {eta_text}: the timing sentences
    return parsed.parts.flatMap((part) =>
      part.kind === "optional" && part.parts.some((x) => x.kind === "var" && x.name === "eta_text")
        ? part.parts.filter((x): x is { kind: "text"; text: string } => x.kind === "text").map((x) => x.text.trim().replace(/[.:،]$/, "")).filter((s) => s.length > 2)
        : [],
    );
  };
  // OPE-§22.2's timing words, independent of where a template puts them
  const TIMING_WORDS: Record<TemplateLocale, string[]> = { fr: ["Livraison prévue", "arrive "], ar: ["التوصيل متوقع", "غادي يوصل"], en: ["Delivery is planned", "arrives "] };
  let renders = 0;
  let zeroNumber = 0;
  let etaChecked = 0;
  let waChecked = 0;
  for (const fx of TEMPLATE_FIXTURES) {
    for (const locale of TEMPLATE_LOCALES) {
      const values = templateValuesFrom(factsOf(fx, locale));
      const allowed = factNumbers(fx, locale);
      for (const kind of kinds) {
        const body = bodies.get(`${kind}:${locale}`);
        if (!body) continue;
        const text = renderTemplate(body, values);
        renders++;
        const extra = invented(text, allowed);
        if (extra.length === 0) zeroNumber++;
        else failures.push(`templates: ${fx.name} · ${kind}/${locale}: numbers not in the order or settings ${JSON.stringify(extra)} in ${JSON.stringify(text)}`);
        const words = timing(kind, locale);
        if (words.length) {
          etaChecked++;
          const leaked = fx.eta ? [] : words.filter((w) => text.includes(w));
          const missing = fx.eta && !text.includes(fx.eta[locale]) ? [fx.eta[locale]] : [];
          if (leaked.length || missing.length) failures.push(`templates: ${fx.name} · ${kind}/${locale}: timing ${leaked.length ? `sentence without an ETA ${JSON.stringify(leaked)}` : `ETA missing ${JSON.stringify(missing)}`}`);
        }
        const said = fx.eta ? [] : TIMING_WORDS[locale].filter((w) => text.includes(w));
        if (said.length) failures.push(`templates: ${fx.name} · ${kind}/${locale}: a delivery timing without an ETA ${JSON.stringify(said)} in ${JSON.stringify(text)}`);
        const msg = waMessage("+212612345678", body, values);
        waChecked++;
        const idKept = !templateVars(body).includes("order_id") || msg.text.includes(fx.order.id);
        if (!(msg.text.length > 0 && Array.from(msg.text).length <= WA_TEXT_MAX && msg.url.length <= WA_URL_MAX && idKept && !BIDI.test(msg.text))) {
          failures.push(`templates: ${fx.name} · ${kind}/${locale}: waLink caps or order id ${JSON.stringify({ trim: msg.trim, url: msg.url.length })}`);
        }
      }
    }
  }
  ok(`40 fixtures × 3 locales × ${kinds.length} built-ins rendered`, TEMPLATE_FIXTURES.length === 40 && renders === 40 * 3 * kinds.length, renders);
  ok(`zero numbers absent from the order or settings (${zeroNumber} of ${renders} texts)`, zeroNumber === renders);
  ok("the timing sentences were checked on the fixtures with and without an ETA", etaChecked > 0 && TEMPLATE_FIXTURES.some((f) => !f.eta) && TEMPLATE_FIXTURES.some((f) => !!f.eta));
  ok("every rendering fits a WhatsApp link with its order id", waChecked === renders);
  {
    const noEta = TEMPLATE_FIXTURES.find((f) => !f.eta && f.locale === "fr")!;
    const fr = renderTemplate(bodies.get("confirm:fr")!, templateValuesFrom(factsOf(noEta, "fr")));
    ok("an empty eta_text removes the delivery sentence (fr confirm)", !/Livraison prévue/.test(fr) && /Répondez OK pour confirmer/.test(fr), fr);
    const withEta = TEMPLATE_FIXTURES.find((f) => !!f.eta && f.locale === "ar")!;
    const ar = renderTemplate(bodies.get("delivery_day:ar")!, templateValuesFrom(factsOf(withEta, "ar")));
    ok("an ETA fills the delivery sentence (ar delivery_day)", ar.includes(`وغادي يوصل ${withEta.eta!.ar}.`), ar);
  }
  // LP-04: the shopper's own confirmation says the order id and nothing else
  for (const locale of TEMPLATE_LOCALES) {
    const fx = TEMPLATE_FIXTURES[7]!;
    const text = renderTemplate(bodies.get(`thank_you_confirm:${locale}`)!, templateValuesFrom(factsOf(fx, locale)));
    eq(`thank_you_confirm/${locale}: stored facts only`, text, bodies.get(`thank_you_confirm:${locale}`)!.replace("{order_id}", fx.order.id));
  }

  /* ---------------- the values (OPE-§7.1) ---------------- */
  {
    const fx = TEMPLATE_FIXTURES.find((f) => f.locale === "fr" && f.order.landmark && f.upsell && f.order.shipping > 0)!;
    const v = templateValuesFrom(factsOf(fx, "fr"));
    eq("values: first names", [v.customer_first_name, v.agent_first_name], [fx.order.name.split(" ")[0], fx.viewerName?.split(" ")[0]]);
    eq("values: order facts", [v.order_id, v.product, v.offer_label, v.qty, v.city, v.address, v.landmark], [fx.order.id, fx.order.productName, fx.order.items!.bundleLabel, String(fx.order.qty), fx.order.city, fx.order.address, fx.order.landmark]);
    eq("values: total and paid delivery in the store currency and the template locale", [v.total, v.shipping_text], [formatMoney(fx.order.total, "MAD", "fr"), `livraison ${formatMoney(35, "MAD", "fr")}`]);
    eq("values: upsell from the version doc", [v.upsell_title, v.upsell_price], [fx.upsell!.title, formatMoney(fx.upsell!.price, "MAD", "fr")]);
    ok("values: units_text is the customer text (labels, not warehouse codes)", !!v.units_text && !/\bNR\b|\bEUC\b/.test(v.units_text), v.units_text);
    ok("values: no order_count_today outside Telegram", !("order_count_today" in v));
    const free = TEMPLATE_FIXTURES.find((f) => f.order.shipping === 0)!;
    eq("values: free delivery words", TEMPLATE_LOCALES.map((l) => templateValuesFrom(factsOf(free, l)).shipping_text), ["التوصيل فابور", "livraison gratuite", "free delivery"]);
    const bare = templateValuesFrom({ ...factsOf(fx, "en"), order: { ...fx.order, city: null, address: null, landmark: null, carrierLabel: null, trackingRef: null, shipAfter: null }, viewerName: null, upsell: null, trackingLink: null, etaText: null });
    eq("values: NULL facts are absent, never empty strings", (["city", "address", "landmark", "carrier_label", "carrier_tracking", "ship_after_date", "agent_first_name", "upsell_title", "upsell_price", "tracking_link", "eta_text"] as TemplateVar[]).filter((k) => k in bare), []);
    const tracked = TEMPLATE_FIXTURES.find((f) => !!f.trackingLink)!;
    const tv = templateValuesFrom(factsOf(tracked, "fr"));
    eq("values: carrier and tracking", [tv.carrier_label, tv.carrier_tracking, tv.tracking_link], [tracked.order.carrierLabel, tracked.order.trackingRef, tracked.trackingLink]);
    const held = TEMPLATE_FIXTURES.find((f) => f.order.shipAfter && f.order.shipAfter > FIXTURE_NOW)!;
    eq("values: ship_after_date in each template locale", TEMPLATE_LOCALES.map((l) => templateValuesFrom(factsOf(held, l)).ship_after_date), ["10 نونبر", "10 nov.", "10 Nov"]);
    const passed = TEMPLATE_FIXTURES.find((f) => f.order.shipAfter && f.order.shipAfter <= FIXTURE_NOW)!;
    ok("values: a passed hold is no hold", !("ship_after_date" in templateValuesFrom(factsOf(passed, "fr"))));
    eq("values: a page locale without texts reads English words", templateValuesFrom({ ...factsOf(free, "en"), locale: "es" }).shipping_text, "free delivery");
  }

  /* ---------------- confirm_number ---------------- */
  eq("confirm_number: the caller phone, national", confirmNumberOf({ callerPhone: "+212522123456", whatsapp: "212698765432" }, "MA"), "0522123456");
  eq("confirm_number: falls back to the WhatsApp digits", confirmNumberOf({ whatsapp: "212698765432" }, "MA"), "0698765432");
  eq("confirm_number: empty when store.confirmation is unset", [confirmNumberOf(null, "MA"), confirmNumberOf({}, "MA")], ["", ""]);
  eq("confirm_number: another market's number stays international", confirmNumberOf({ callerPhone: "+33612345678" }, "MA"), "+33612345678");
  {
    const unset = TEMPLATE_FIXTURES.find((f) => f.confirmation === null)!;
    ok("confirm_number: absent from the values when unset (its block drops)", !("confirm_number" in templateValuesFrom(factsOf(unset, "fr"))));
    eq(
      "confirm_number: an optional block with it",
      renderTemplate("Merci.[[ Une question : {confirm_number}.]]", templateValuesFrom(factsOf(TEMPLATE_FIXTURES.find((f) => !!f.confirmation?.whatsapp && !f.confirmation.callerPhone)!, "fr"))),
      "Merci. Une question : 0698765432.",
    );
  }

  /* ---------------- confirm_hours (OD57, OD63) ---------------- */
  {
    let called = 0;
    const never = () => {
      called++;
      return "09:30-13:00";
    };
    // P4's fixtures carry saved windows too (since the P4 merge): the unsaved case is each fixture with `configured: false`
    const unconfigured = WINDOW_FIXTURES.map((c) => confirmHoursFor({ ...c.window, configured: false }, "fr", new Date(c.at), never));
    ok("confirm_hours: empty on every window the owner never saved (window.fixtures.ts)", WINDOW_FIXTURES.length > 0 && unconfigured.every((h) => h === "") && called === 0, unconfigured);
    // P4's hoursText wording: the fixture's `expect.hoursText` once P4 fills it; until then a stand-in that lists today's ranges
    const standIn = (w: EffectiveWindow, _l: unknown, _d: string, now: Date) => {
      const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: w.tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
      return rangesForDay(ymd, w)
        .map((r) => `${r.from}-${r.to}`)
        .join(", ");
    };
    let realAvailable = true;
    for (const c of WINDOW_FIXTURES) {
      const saved: EffectiveWindow = { ...c.window, configured: true };
      const at = new Date(c.at);
      const filled = confirmHoursFor(saved, "fr", at, standIn);
      // a day without a range (closed date, closed period, a night line's next day) stays empty even once saved
      const want = standIn(saved, "fr", "fr-MA", at);
      ok(`confirm_hours: filled once saved, empty on a day without a range · ${c.name}`, filled === want && (filled !== "" || want === ""), { filled, want });
      const real = confirmHoursFor(saved, "fr", at, hoursText);
      const wantReal = c.expect.hoursText?.fr;
      if (wantReal !== undefined) eq(`confirm_hours: P4's hoursText · ${c.name}`, real, wantReal);
      else if (real === "" && want !== "") realAvailable = false;
    }
    if (!realAvailable) notes.push("templates: P4's hoursText is still the P0 stub: a saved window answers \"\" (never a made-up line) until P4 merges");
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Casablanca", year: "numeric", month: "2-digit", day: "2-digit" }).format(FIXTURE_NOW);
    const closed: EffectiveWindow = { ...WINDOW_FIXTURES[0]!.window, configured: true, closedDates: [today] };
    eq("confirm_hours: empty on a closed day even once saved", confirmHoursFor(closed, "fr", FIXTURE_NOW, standIn), "");
    const hoursTpl = "Merci.[[ Nous appelons {confirm_hours}.]]";
    const fx = TEMPLATE_FIXTURES.find((f) => f.hours === null)!;
    eq("confirm_hours: its optional block drops while unset", renderTemplate(hoursTpl, templateValuesFrom(factsOf(fx, "fr"))), "Merci.");
    eq("confirm_hours: its block renders once set", renderTemplate(hoursTpl, templateValuesFrom({ ...factsOf(fx, "fr"), confirmHours: "09:30-13:00, 14:30-21:00" })), "Merci. Nous appelons 09:30-13:00, 14:30-21:00.");
  }

  /* ---------------- waLink (IN-05, OPE-§22.3) ---------------- */
  {
    const short = TEMPLATE_FIXTURES.find((f) => !!f.eta && f.locale === "fr" && !f.order.items?.units?.some((u) => u.label.startsWith("مجموعة")))!;
    const values = templateValuesFrom(factsOf(short, "fr"));
    const url = waLink("+212 6 12 34 56 78", bodies.get("confirm:fr")!, values);
    ok("waLink: https://wa.me/<digits>?text=<encoded>", url.startsWith("https://wa.me/212612345678?text=") && decodeURIComponent(url.split("?text=")[1]!) === renderTemplate(bodies.get("confirm:fr")!, values), url);
    eq("waLink: a text that fits is not trimmed", waMessage("+212612345678", bodies.get("confirm:fr")!, values).trim, "none");

    const longFx = TEMPLATE_FIXTURES.find((f) => f.name.includes("long cart") && f.locale === "ar" && !!f.eta)!;
    const lv = templateValuesFrom(factsOf(longFx, "ar"));
    const custom = "السلام {customer_first_name}، الطلب {order_id}: {units_text}، المجموع {total}.[[ التوصيل متوقع {eta_text}.]]";
    const full = renderTemplate(custom, lv);
    ok("waLink fixture: the long Arabic cart does not fit as is", encodeURIComponent(full).length > WA_URL_MAX, full.length);
    const m = waMessage("+212612345678", custom, lv);
    ok("waLink: URL ≤ 2,000 and text ≤ 1,000", m.url.length <= WA_URL_MAX && Array.from(m.text).length <= WA_TEXT_MAX, { url: m.url.length, text: m.text.length });
    eq("waLink: blocks dropped first, then units_text shortened", m.trim, "units");
    ok("waLink: the optional block went first", !m.text.includes("التوصيل متوقع"), m.text);
    ok("waLink: units_text ends with … and the order id stays", m.text.includes("…") && m.text.includes(longFx.order.id) && m.text.includes(lv.total!), m.text);
    ok("waLink: no bidi control character added", !BIDI.test(m.text) && !BIDI.test(decodeURIComponent(m.url.split("?text=")[1]!)));

    // dropping the block is enough: units_text is left whole
    const mid = { ...lv, units_text: "2 × Noir", eta_text: "ب".repeat(330) };
    const md = waMessage("+212612345678", custom, mid);
    ok("waLink: dropping the optional block can be enough (units_text kept whole)", md.trim === "optional" && md.text.includes("2 × Noir") && md.url.length <= WA_URL_MAX, { trim: md.trim, url: md.url.length });

    // the other free texts are shortened next, longest first, never the order id
    const crowded = "{address} {landmark} {product} {order_id}";
    const cv = { ...lv, address: "ع".repeat(300), landmark: "ق".repeat(160), product: "م".repeat(160) };
    const cm = waMessage("+212612345678", crowded, cv);
    ok("waLink: long free texts shortened, the order id kept", cm.trim === "values" && cm.url.length <= WA_URL_MAX && cm.text.endsWith(longFx.order.id), { trim: cm.trim, url: cm.url.length });

    // a template too long for any URL: cut at a word, the order id still at the end
    const huge = `${"كلمة ".repeat(190)}{order_id}`;
    const hm = waMessage("+212612345678", huge, lv);
    ok("waLink: a text no shortening fits is cut, the order id kept", hm.trim === "cut" && hm.url.length <= WA_URL_MAX && hm.text.endsWith(longFx.order.id) && hm.text.includes("…"), { trim: hm.trim, url: hm.url.length, end: hm.text.slice(-24) });
  }

  /* ---------------- the repository's rules (AI-15, OPE-§L) ---------------- */
  {
    const at = (min: number) => new Date(FIXTURE_NOW.getTime() - min * 60_000);
    const row = (id: string, pageId: string | null, status: TemplateRowLike["status"], source: TemplateRowLike["source"] = "user", position = 0, age = 0): TemplateRowLike => ({ id, pageId, status, source, position, updatedAt: at(age) });
    const PAGE = "01JAAAAAAAAAAAAAAAAAAAAAAA";
    eq("resolve: the page's active row wins", chooseTemplate([row("store", null, "active"), row("page", PAGE, "active")], PAGE)?.row.id, "page");
    eq("resolve: the store row when the page has none", chooseTemplate([row("store", null, "active")], PAGE), { row: row("store", null, "active"), source: "store" });
    eq("resolve: an AI draft of the page is never returned (AI-15)", chooseTemplate([row("draft", PAGE, "draft", "ai"), row("store", null, "active")], PAGE)?.row.id, "store");
    eq("resolve: drafts and archived rows only → the built-in", chooseTemplate([row("d1", null, "draft", "ai"), row("d2", PAGE, "draft", "ai"), row("old", null, "archived")], PAGE), null);
    eq("resolve: an approved AI row is active and served", chooseTemplate([row("ai", null, "active", "ai")], null)?.row.id, "ai");
    eq("resolve: another page's row never answers", chooseTemplate([row("other", "01JBBBBBBBBBBBBBBBBBBBBBBB", "active")], PAGE), null);
    eq("resolve: ties by position, then the newest", chooseTemplate([row("b", null, "active", "user", 1, 0), row("a-old", null, "active", "user", 0, 60), row("a-new", null, "active", "user", 0, 5)], null)?.row.id, "a-new");

    const good = { channel: "whatsapp", kind: "confirm", locale: "fr", name: "Confirmation", body: "Bonjour {customer_first_name}, {order_id}." };
    ok("save: a valid template", checkTemplateInput(good).ok);
    eq("save: unknown variable with its position", checkTemplateInput({ ...good, body: "Bonjour {prenom}" }), { ok: false, error: "unknown_var", field: "body", at: 8 });
    eq("save: unbalanced with its position", checkTemplateInput({ ...good, body: "Bonjour [[{city}" }), { ok: false, error: "unbalanced", field: "body", at: 8 });
    eq("save: body over 1,000 characters", checkTemplateInput({ ...good, body: "a".repeat(1001) }), { ok: false, error: "too_long", field: "body", at: 1000 });
    eq("save: name over 80 characters", checkTemplateInput({ ...good, name: "n".repeat(81) }), { ok: false, error: "invalid", field: "name" });
    eq("save: an empty body", checkTemplateInput({ ...good, body: "   " }), { ok: false, error: "invalid", field: "body" });
    eq("save: an unknown WhatsApp kind", checkTemplateInput({ ...good, kind: "promo_blast" }), { ok: false, error: "invalid", field: "kind" });
    eq("save: a locale without templates", checkTemplateInput({ ...good, locale: "es" }), { ok: false, error: "invalid", field: "locale" });
    eq("save: a malformed page id", checkTemplateInput({ ...good, pageId: "../x" }), { ok: false, error: "invalid", field: "pageId" });
    ok("save: a Telegram kind is a free slug", checkTemplateInput({ ...good, channel: "telegram", kind: "daily_summary" }).ok);
    ok("save: P4's call scripts are not this repository's", !checkTemplateInput({ ...good, channel: "call_script", kind: "script" }).ok);
  }

  const ms = performance.now() - t0;
  ok(`templates section within ${BUDGET_MS} ms`, ms <= BUDGET_MS, Math.round(ms));
  notes.push(`templates: ${renders} built-in renders over ${TEMPLATE_FIXTURES.length} orders, ${Math.round(ms)} ms`);
  return { pass, failures, notes, ms };
}

// standalone run: npx tsx src/lib/integrations/templates.selftest.ts
if (process.argv[1] && /templates\.selftest\.ts$/.test(process.argv[1])) {
  const r = templatesSelftest();
  for (const n of r.notes) console.log(`· ${n}`);
  for (const f of r.failures) console.log(`✗ ${f}`);
  console.log(r.failures.length ? `✗ ${r.failures.length} failure(s), ${r.pass} passed` : `✓ templates self test passed (${r.pass} assertions)`);
  process.exit(r.failures.length ? 1 : 0);
}
