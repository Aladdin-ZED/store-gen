/**
 * The numbers audit (P3 LANDING; landing.md LAN-§6.4, LD33, LD17; design-baseline D1, D2; docs/STORE-SAAS.md §M.1
 * rule 2, §M.3): every number on a landing page traces to one merchant field, and one fact never shows two values.
 * Pure and isomorphic; the honesty gate (src/lib/render/prepublish/landing.ts) and the builder checklist read it.
 *
 *   const allowed = allowedNumbersFor(doc, { policies, zones, confirmation, facts });
 *   auditNumbers(doc, allowed, "fr", origin)   → [{ path, value: "40", cls: "fact", why: "conflict", level: "hard", … }]
 *   sensitiveFields(doc)                        → [{ path: "items.0.groups.1", label: "Mot de passe" }]
 *
 * The seven rules of LAN-§6.4:
 *  1. numerals are read from every visible text field (each visible section's text fields by its registry field
 *     specs, `product.*`, the items' names, the offers' labels, the bump and the upsell, the form's texts, `seo.*`,
 *     the thank-you texts) in Latin and Arabic-Indic digits with the locale's separators, and from the visible
 *     numeric data of the proof sections (stats values, the order counter, review stars and star counts, the stock
 *     batch);
 *  2. a numeral is allowed when it equals a value of `allowed.all` (`allowedNumbersFor`: the guard's merchant facts,
 *     every offer's pricing, units, the page fee, zone days, policy windows, `withinHours`, `stockLeft`, the countdown
 *     end's date parts, the attested facts); a year (1990 to 2100, after a year word) is always allowed; phone
 *     numbers, order ids, URLs, colours, clock times and anything inside a bidi isolate (\u2066−25%\u2069, a price chip) are
 *     skipped;
 *  3. a numeral outside the set is `why: "unknown"`;
 *  4. a numeral of a single-valued class (delivery days, return days, warranty months, call hours, fee, stock, rating,
 *     review count, countdown) that differs from the value the store set is `why: "conflict"` with that value; two
 *     product facts with the same unit and the same lead word ("prêt en 30 s" and "prêt en 40 s") are a conflict on
 *     the later field;
 *  5. `allowedNumbersFor` wraps the guard's `allowedNumbers` (src/lib/ai/guard.ts, P7) rather than re-implementing it
 *     (./guard-numbers.ts holds the adapter until CCR r1-p3-1 exports it);
 *  6. level by origin and class: hard for a conflict, a generated field, a proof class (`PROOF_CLASSES`) or a numeral
 *     inside a proof section; otherwise (an owner-typed fact, size, count or year) soft, cleared by one attestation;
 *  7. an attested numeral (`page.fact_attested`, `factsFor`) is a merchant fact: `allowedNumbersFor` adds it.
 */
import { getSection } from "@/landing/registry";
import { valuesOfKind } from "@/lib/editor/fields";
import { offersMath } from "@/lib/page/pricing";
import { isChoiceGroup, isFieldGroup, isMatrixGroup, type Locale, type PageDoc } from "@/lib/page/schema";
import type { DeliveryZoneRow } from "@/lib/delivery/types";
import type { StorePolicyFacts } from "@/lib/settings/keys/policies";
import type { StoreSetting } from "@/lib/settings/keys/store";
import { guardAllowedNumbers } from "./guard-numbers";

export type NumberClass =
  | "price"
  | "compare_at"
  | "unit_price"
  | "savings"
  | "fee"
  | "units"
  | "qty"
  | "delivery_days"
  | "return_days"
  | "warranty_months"
  | "within_hours"
  | "stock"
  | "countdown"
  | "stat"
  | "counter"
  | "rating"
  | "review_count"
  | "weight_volume"
  | "fact"
  | "phone"
  | "order_id"
  | "year"
  | "other";

/** Owner rule 4's classes: a numeral of these is always a hard finding (rev 3, ENGP-8). */
export const PROOF_CLASSES: ReadonlySet<NumberClass> = new Set<NumberClass>(["stat", "counter", "rating", "review_count", "stock", "price", "compare_at", "unit_price", "savings", "countdown"]);

/** Sections whose every numeral is proof (LAN-§6.1): a finding inside one is hard whatever its class. */
export const PROOF_SECTIONS: ReadonlySet<string> = new Set(["reviews", "socialProof", "stats", "beforeAfter"]);

/** Classes a page states one value of: a different value is a conflict with the store's (rule 4). */
const SINGLE_VALUED: ReadonlySet<NumberClass> = new Set<NumberClass>(["delivery_days", "return_days", "warranty_months", "within_hours", "fee", "stock", "rating", "review_count", "countdown"]);

/** Digits normalised: Latin, no spaces or thousands separators, "," → "." ("9 400" → "9400", "4,7" → "4.7"). */
export interface AllowedNumbers {
  byClass: Partial<Record<NumberClass, string[]>>;
  all: Set<string>;
}

/** The store's side of the audit (LAN-§6.4 `allowedNumbersFor`); `facts` = the wizard's facts and every attested value (`factsFor`). */
export interface NumberStoreFacts {
  policies: StorePolicyFacts;
  zones: readonly DeliveryZoneRow[];
  /** `store.confirmation` (`withinHours`) */
  confirmation: StoreSetting["confirmation"];
  facts: readonly string[];
  /** `checkout.zonesEnabled`: the zones' days count only while zones are on (default: on when there are zones) */
  zonesEnabled?: boolean;
  /** `product.rating` was attested (`page.proof_attested` "rating", LAN-§6.1): its value and count are merchant facts */
  ratingAttested?: boolean;
  /** rev 3 (ENGP-1): the bound product of a store section (R2 widens `doc` to `ProductDoc`, STO-§6.2) */
  product?: { doc: { price: number; compareAt?: number }; facts: readonly string[] } | null;
}

export interface NumberFinding {
  /** doc path of the field ("benefits.items.2.text", "product.tagline", "stats.items.0.value") */
  path: string;
  /** the numeral with its unit as written ("40 s", "3 couleurs", "+9 400 pièces"), ≤ 40 characters */
  text: string;
  /** the normalised numeral ("40", "9400", "4.7") */
  value: string;
  cls: NumberClass | null;
  why: "unknown" | "conflict";
  /** the value the page or the store already states ("30 s", "1-3") */
  conflictsWith?: string;
  origin: "generated" | "owner";
  level: "hard" | "soft";
}

/* ------------------------------------------------------------------ */
/* values                                                              */
/* ------------------------------------------------------------------ */

const num = (n: number) => String(Math.round(n * 100) / 100);
const cents = (c: number) => num(c / 100);

/** Arabic-Indic and Persian digits to Latin, Arabic separators to the French ones (length kept, so offsets hold). */
export function latinDigits(s: string): string {
  let out = "";
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    if (c >= 0x0660 && c <= 0x0669) out += String(c - 0x0660);
    else if (c >= 0x06f0 && c <= 0x06f9) out += String(c - 0x06f0);
    else if (ch === "٫") out += ","; // Arabic decimal separator
    else if (ch === "٬") out += "\u202F"; // Arabic thousands separator → a thin space, read as French grouping
    else out += ch;
  }
  return out;
}

/** The numerals of a free text ("3 couleurs, 50 ml" → ["3", "50"]), as `recordFacts` stores them. */
export function factNumerals(text: string): string[] {
  const found = latinDigits(text).match(/\d+(?:[.,]\d+)?/g) ?? [];
  return found.map((n) => String(Number(n.replace(",", "."))));
}

/** The ISO date and time parts of an instant as typed and in UTC (the countdown's "31 octobre", "23:59"). */
function dateParts(iso: string): number[] {
  const out = new Set<number>();
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  if (m) for (const p of m.slice(1)) out.add(Number(p));
  const t = Date.parse(iso);
  if (Number.isFinite(t)) {
    const d = new Date(t);
    for (const p of [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes()]) out.add(p);
    // Morocco (UTC+1 outside Ramadan): the day and hour a shopper reads
    const ma = new Date(t + 3_600_000);
    for (const p of [ma.getUTCDate(), ma.getUTCHours()]) out.add(p);
  }
  return [...out];
}

/**
 * The numerals a page may show, by class (LAN-§6.4 rule 2): the guard's `allowedNumbers` (merchant facts, product
 * name, lead price) plus the pricing of every offer (`offersMath`: price, card price, reference, savings in money
 * and percent, per-unit), the items' prices and option surcharges, units and line quantities, the bump and the
 * upsell, the page fee, the zones' days, the policy windows, `withinHours`, `stockLeft`, the countdown end's date
 * parts, the numerals of the catalog's own labels ("500 ml", "XL 2024" as an option) and the attested facts.
 */
export function allowedNumbersFor(doc: PageDoc, store: NumberStoreFacts): AllowedNumbers {
  const byClass: Partial<Record<NumberClass, Set<string>>> = {};
  const add = (cls: NumberClass, v: string | number | null | undefined) => {
    if (v === null || v === undefined || v === "") return;
    const set = (byClass[cls] ??= new Set());
    if (typeof v === "number") {
      if (Number.isFinite(v)) set.add(num(v));
    } else for (const n of factNumerals(v)) set.add(n);
  };

  // rule 5: the guard's rule first (facts, product name, price), then the classes it does not know
  const lead = doc.items[0];
  for (const n of guardAllowedNumbers({ locale: doc.locale, productName: doc.product.name, facts: [...store.facts], price: lead?.price })) add("fact", n);
  for (const f of store.facts) add("fact", f);
  add("fact", doc.product.name);

  for (const m of offersMath(doc)) {
    add("price", cents(m.price));
    add("price", cents(m.from));
    if (m.showReference) {
      add("compare_at", cents(m.reference));
      add("compare_at", cents(m.displayReference));
      add("savings", cents(m.savings));
      add("savings", m.savingsPct);
    }
    if (m.perUnit !== null) add("unit_price", cents(m.perUnit));
    add("units", m.units);
  }
  for (const o of doc.offers.bundles) for (const l of o.lines) add("qty", l.qty);
  for (const it of doc.items) {
    add("price", it.price);
    if (it.compareAt !== undefined && it.compareAt > it.price) {
      add("compare_at", it.compareAt);
      add("savings", it.compareAt - it.price);
      add("savings", Math.round(((it.compareAt - it.price) / it.compareAt) * 100));
    }
    add("fact", it.name);
    add("fact", it.short);
    for (const g of it.groups) {
      add("fact", g.name);
      const choices = isChoiceGroup(g) ? g.options : isMatrixGroup(g) ? g.dims.flatMap((d) => d.values) : [];
      for (const o of choices) {
        add("fact", o.label);
        add("price", o.delta);
      }
      if (isMatrixGroup(g)) for (const c of g.cells) add("price", c.delta);
      if (isFieldGroup(g)) {
        add("price", g.delta);
        add("fact", g.max);
      }
    }
  }
  for (const x of doc.offers.extras) {
    if (x.kind === "field") add("price", x.delta);
    else {
      for (const o of x.options) {
        add("fact", o.label);
        add("price", o.delta);
      }
    }
  }
  const bump = doc.offers.orderBump;
  if (bump?.enabled) add("price", bump.price);
  const up = doc.offers.upsell;
  if (up?.enabled) {
    add("price", up.price);
    if (up.compareAt !== undefined && up.compareAt > up.price) {
      add("compare_at", up.compareAt);
      add("savings", up.compareAt - up.price);
      add("savings", Math.round(((up.compareAt - up.price) / up.compareAt) * 100));
    }
  }
  if (doc.offers.shippingFee > 0) add("fee", doc.offers.shippingFee);

  const zonesOn = store.zonesEnabled ?? store.zones.length > 0;
  if (zonesOn) {
    for (const z of store.zones) {
      add("delivery_days", z.etaMinDays);
      add("delivery_days", z.etaMaxDays);
    }
  }
  const p = store.policies;
  if (!zonesOn && p.delivery.typicalDays) for (const d of p.delivery.typicalDays) add("delivery_days", d);
  add("return_days", p.returns.windowDays);
  add("return_days", p.exchange.windowDays);
  add("return_days", p.refund.withinDays);
  add("warranty_months", p.warranty.months);
  if (p.delivery.freeFromCents !== null) add("price", p.delivery.freeFromCents / 100);
  add("within_hours", store.confirmation.withinHours);

  add("stock", doc.offers.urgency.stockLeft);
  const end = doc.offers.urgency.countdownEnd;
  if (end) for (const part of dateParts(end)) add("countdown", part);
  if (store.ratingAttested && doc.product.rating) {
    add("rating", doc.product.rating.value);
    add("review_count", doc.product.rating.count);
  }
  if (store.product) {
    add("price", store.product.doc.price);
    add("compare_at", store.product.doc.compareAt);
    for (const f of store.product.facts) add("fact", f);
  }

  const out: Partial<Record<NumberClass, string[]>> = {};
  const all = new Set<string>();
  for (const [cls, set] of Object.entries(byClass) as [NumberClass, Set<string>][]) {
    out[cls] = [...set].sort((a, b) => Number(a) - Number(b));
    for (const n of set) all.add(n);
  }
  return { byClass: out, all };
}

/* ------------------------------------------------------------------ */
/* visible fields                                                      */
/* ------------------------------------------------------------------ */

interface TextField {
  path: string;
  text: string;
  /** the section type when the field is section data */
  section: string | null;
  sectionId: string | null;
}
interface NumericField {
  path: string;
  value: number;
  cls: NumberClass;
  section: string;
  sectionId: string;
}

/** The visible numeric data of the proof sections (rule 1); every other numeric field is a setting (a pin, a slider start, "out of"). */
const NUMERIC: Record<string, readonly { re: RegExp; cls: NumberClass }[]> = {
  stats: [{ re: /^items\.\d+\.value$/, cls: "stat" }],
  socialProof: [{ re: /(?:^|\.)count$/, cls: "counter" }],
  reviews: [
    { re: /^items\.\d+\.rating$/, cls: "rating" },
    { re: /^breakdown\./, cls: "review_count" },
  ],
  urgency: [{ re: /(?:^|\.)batchSize$/, cls: "stock" }],
};

/** Every string leaf of a value (sections without registry specs). */
function leaves(value: unknown, path: string, out: { path: string; text: string }[], depth = 0): void {
  if (depth > 8) return;
  if (typeof value === "string") out.push({ path, text: value });
  else if (Array.isArray(value)) value.forEach((v, i) => leaves(v, `${path}.${i}`, out, depth + 1));
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) leaves(v, `${path}.${k}`, out, depth + 1);
}

function visibleFields(doc: PageDoc, every = false): { texts: TextField[]; numbers: NumericField[] } {
  const texts: TextField[] = [];
  const numbers: NumericField[] = [];
  const text = (path: string, value: string | undefined | null, section: string | null = null, sectionId: string | null = null) => {
    if (typeof value === "string" && (every ? value.trim() !== "" : /\d|[٠-٩۰-۹]/.test(value))) texts.push({ path, text: value, section, sectionId });
  };
  for (const s of doc.sections) {
    if (s.hidden) continue;
    const def = getSection(s.type);
    if (def) {
      for (const v of valuesOfKind(def.fields, s.data, ["text", "textarea"])) text(`${s.id}.${v.path}`, typeof v.value === "string" ? v.value : null, s.type, s.id);
      for (const v of valuesOfKind(def.fields, s.data, ["number"])) {
        const rule = NUMERIC[s.type]?.find((r) => r.re.test(v.path));
        if (rule && typeof v.value === "number" && Number.isFinite(v.value) && v.value > 0) numbers.push({ path: `${s.id}.${v.path}`, value: v.value, cls: rule.cls, section: s.type, sectionId: s.id });
      }
    } else {
      const out: { path: string; text: string }[] = [];
      leaves(s.data, s.id, out);
      for (const l of out) text(l.path, l.text, s.type, s.id);
    }
  }
  text("product.name", doc.product.name);
  text("product.tagline", doc.product.tagline);
  text("product.description", doc.product.description);
  doc.items.forEach((it, i) => {
    text(`items.${i}.name`, it.name);
    text(`items.${i}.short`, it.short);
  });
  doc.offers.bundles.forEach((o, i) => {
    text(`offers.bundles.${i}.title`, o.title);
    text(`offers.bundles.${i}.subtitle`, o.subtitle);
    text(`offers.bundles.${i}.badgeText`, o.badgeText);
    text(`offers.bundles.${i}.gift.label`, o.gift?.label);
    o.perks.forEach((p, j) => text(`offers.bundles.${i}.perks.${j}`, p));
  });
  const bump = doc.offers.orderBump;
  if (bump?.enabled) {
    text("offers.orderBump.title", bump.title);
    text("offers.orderBump.description", bump.description);
  }
  const upsell = doc.offers.upsell;
  if (upsell?.enabled) {
    text("offers.upsell.title", upsell.title);
    text("offers.upsell.description", upsell.description);
  }
  text("form.title", doc.form.title);
  text("form.submitLabel", doc.form.submitLabel);
  text("form.reassurance", doc.form.reassurance);
  text("seo.title", doc.seo.title);
  text("seo.description", doc.seo.description);
  text("thankYou.title", doc.thankYou.title);
  text("thankYou.message", doc.thankYou.message);
  return { texts, numbers };
}

/**
 * Every visible text field of the page that is not empty, in document order, with the section it belongs to: the
 * fields rule 1 reads, digits or not. The promise scan of the honesty gate (`honesty:promise`, LAN-§6.3) reads them.
 */
export function visibleTexts(doc: PageDoc): { path: string; text: string; section: string | null; sectionId: string | null }[] {
  return visibleFields(doc, true).texts;
}

/* ------------------------------------------------------------------ */
/* reading numerals                                                    */
/* ------------------------------------------------------------------ */

interface Numeral {
  start: number;
  end: number;
  raw: string;
  value: string;
  /** the parts of a grouped number ("2 199" → ["2", "199"]): read separately when the whole is not allowed */
  parts: string[] | null;
  /**
   * A range ("24–48h", "2 à 4 jours", "1-3"): its start and end offsets. The head reads the unit after the tail and
   * both members are labelled with the whole range, which the audit reports once.
   */
  range?: { start: number; end: number };
}

/** What may stand between the two members of a range ("24–48h", "2 à 4 jours", "3 أو 4 أيام"); never "et" / "و", a list. */
const RANGE_GAP = /^\s*(?:[-–—]|à|a|to|ou|or|حتى|ل|الى|إلى|او|أو)\s*$/iu;

const CURRENCY = /^\s*(?:dh|dhs|mad|dirhams?|درهم|دراهم|د\.م|€|eur|euros?|\$|usd)(?![\p{L}])/iu;
const CURRENCY_BEFORE = /(?:€|\$|mad|dh)\s*$/iu;

/** Spans the audit never reads: bidi isolates, <bdi> runs, phone numbers, order ids, URLs, e-mails, colours, clock times, "7j/7". */
function masked(text: string): [number, number][] {
  const spans: [number, number][] = [];
  const mark = (re: RegExp) => {
    for (const m of text.matchAll(re)) spans.push([m.index!, m.index! + m[0].length]);
  };
  mark(/[\u2066-\u2068][^\u2069]*\u2069?/g); // \u2066−25%\u2069, a price chip
  mark(/<bdi\b[^>]*>[\s\S]*?<\/bdi>/gi);
  mark(/https?:\/\/\S+|www\.\S+|[\w.+-]+@[\w-]+\.[\w.]+/gi);
  mark(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/gi);
  mark(/(?:\+|00)?\d(?:[ .\u00A0\u202F-]?\d){7,}/g); // phone: 8+ digits
  mark(/(?:#|n°|no\.|nº|رقم)\s?[A-Z0-9][A-Z0-9-]{3,}/gi); // order ids
  mark(/(?:\d{1,2}\s*[:h]\s*\d{2})(?!\d)/gi); // 09:30, 9h30
  mark(/(?:à|a|dès|des|de|entre|avant|après|jusqu'à|from|at|before|after|until|between|من|حتى|مع|الساعة|قبل)\s+\d{1,2}\s*(?:h|am|pm)(?![\p{L}\d])/giu); // "avant 12h", "de 9h"
  mark(/\d{1,2}\s*(?:j|h|jours?|days?)?\s*\/\s*\d{1,2}(?![\d/])/gi); // 7j/7, 24h/24, 7/7
  return spans;
}

/** The numerals of a text with the locale's grouping and decimal marks (rule 1). */
function numeralsOf(text: string, locale: Locale): Numeral[] {
  const latin = latinDigits(text);
  const skip = masked(latin);
  const en = locale === "en";
  // en: "9,400" and "4.7"; fr / ar and the other locales: "9 400", "9.400" and "4,7"
  const re = en ? /\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g : /\d{1,3}(?:[ \u00A0\u202F]\d{3})+(?:,\d+)?|\d{1,3}(?:\.\d{3})+(?![\d,])|\d+(?:[.,]\d+)?/g;
  const out: Numeral[] = [];
  for (const m of latin.matchAll(re)) {
    const start = m.index!;
    const end = start + m[0].length;
    if (skip.some(([a, b]) => start < b && end > a)) continue;
    // never inside a Latin word or an identifier ("H2O", "A4", "FG-380"); "x3" is a count, and an attached Arabic
    // preposition ("ف24", "ب300") keeps its number
    const prev = latin[start - 1] ?? "";
    if (/[A-Za-zÀ-ɏ]/.test(prev) && !/[x×]/i.test(prev)) continue;
    if (prev === "-" && /[A-Za-zÀ-ɏ]/.test(latin[start - 2] ?? "")) continue;
    const raw = m[0];
    const grouped = /[ \u00A0\u202F]/.test(raw) || (!en && /^\d{1,3}(?:\.\d{3})+$/.test(raw)) || (en && raw.includes(","));
    const value = en ? String(Number(raw.replace(/,/g, ""))) : String(Number(raw.replace(/[ \u00A0\u202F]/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".")));
    out.push({ start, end, raw, value, parts: grouped ? raw.split(/[ \u00A0\u202F.,]/).map((x) => String(Number(x))) : null });
  }
  // two neighbours read as a range when only a range word separates them and the second is the larger, within 10\u00D7
  // ("24\u201348h", "1-3 jours"; never "Pack 2 - 199 DH")
  for (let i = 0; i + 1 < out.length; i++) {
    const [a, b] = [out[i]!, out[i + 1]!];
    const [x, y] = [Number(a.value), Number(b.value)];
    if (a.range || !RANGE_GAP.test(latin.slice(a.end, b.start)) || !(x > 0 && y > x && y <= x * 10)) continue;
    a.range = b.range = { start: a.start, end: b.end };
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* classifying a numeral                                               */
/* ------------------------------------------------------------------ */

interface Read {
  cls: NumberClass | null;
  /** the value compared with the class's allowed values ("48 h" of delivery → "2") */
  as: string | null;
  /** the canonical unit after the numeral ("s", "ml", "h") for fact conflicts */
  unit: string | null;
  /** the numeral and its unit as written */
  label: string;
}

const lower = (s: string) => s.toLowerCase();
const after = (t: string, i: number, n = 32) => lower(t.slice(i, i + n));
const before = (t: string, i: number, n = 40) => lower(t.slice(Math.max(0, i - n), i));

const TIME_UNIT: [RegExp, "hour" | "day" | "week" | "month" | "year" | "minute" | "second"][] = [
  [/^\s*-?\s*(?:secondes?|seconds?|secs?|s|ثانية|ثواني|ثوان)(?![\p{L}])/u, "second"],
  [/^\s*-?\s*(?:minutes?|mins?|mn|دقيقة|دقايق|دقائق)(?![\p{L}])/u, "minute"],
  [/^\s*-?\s*(?:heures?|hours?|hrs?|h|ساعة|ساعات|سوايع)(?![\p{L}])/u, "hour"],
  [/^\s*-?\s*(?:jours?|days?|j|يوم|أيام|ايام|يام|نهار)(?![\p{L}])/u, "day"],
  [/^\s*-?\s*(?:semaines?|weeks?|أسبوع|اسبوع|أسابيع|سيمانة|سيمانات)(?![\p{L}])/u, "week"],
  [/^\s*-?\s*(?:mois|months?|شهر|شهور|أشهر|اشهر)(?![\p{L}])/u, "month"],
  [/^\s*-?\s*(?:ans?|années?|years?|yrs?|سنة|سنين|سنوات|عام|أعوام)(?![\p{L}])/u, "year"],
];
const MEASURE = /^\s*(ml|cl|l|litres?|liters?|g|gr|grammes?|grams?|kg|mg|oz|cm|mm|m|mètres?|meters?|w|watts?|mah|v|volts?|°c|°|mp|go|gb|mo|mb|مل|ملل|لتر|غرام|غ|كلغ|كيلو|سنتيم|سم|ملم|متر|واط)(?![\p{L}])/iu;
const UNITS = /^\s*(?:pièces?|pcs|unités?|units?|packs?|flacons?|bouteilles?|boîtes?|pots?|حبة|حبات|قطعة|قطع|علبة|علب)(?![\p{L}])/iu;
const COUNTER_AFTER = /^\s*(?:\+\s*)?(?:clients?|clientes?|commandes?|colis|personnes|ventes?|vendu(?:e|s|es)?|familles|acheteu(?:r|se)s?|customers?|orders?|parcels?|sold|buyers?|happy|زبون|زبونة|زبناء|زبونات|طلبية|طلبيات|كولي|عائلة|شخص|مشتري)(?![\p{L}])|^\s*pièces\s+vendues/iu;
const REVIEWS_AFTER = /^\s*\)?\s*(?:avis|reviews?|notes?|évaluations?|ratings?|تقييم|تقييمات|تعليق|تعليقات|رأي|آراء)(?![\p{L}])/iu;
const RATING_AFTER = /^\s*(?:\/\s*5|★|⭐|étoiles?|stars?|نجوم|نجمة)|^\s*\(\s*\d/iu;
const STOCK_BEFORE = /(?:plus que|il reste|reste|restant|seulement|only|just|باقي|بقاو|بقات|غير)\s*$/iu;
const SAVINGS_BEFORE = /(?:[−-]|moins|remise|réduction|promo|économisez|économie|save|off|discount|خصم|تخفيض|تخفيظ|ناقص|وفر|ربح)\s*(?:de\s+|of\s+)?$/iu;
const SAVINGS_AFTER = /^\s*%?\s*(?:off|de\s+(?:remise|réduction)|d'économie|خصم|تخفيض)/iu;
const STAT_AFTER = /^\s*%\s*(?:des|de\s+nos|of|من|ديال)\s+(?:client|utilisat|user|customer|femme|homme|mère|personne|زبون|زبناء|زبونات|مستعمل|ناس|الناس|نساء)|^\s*%\s*(?:satisf|recommand|recommend|راض)/iu;
const COMPARE_BEFORE = /(?:au lieu de|instead of|was|avant|prix normal|عوض|بدل|بلاصة|كان)\s*$/iu;
const FEE_CONTEXT = /(?:livraison|frais|port|delivery|shipping|توصيل|التوصيل|الشحن)/iu;
const DELIVERY_CONTEXT = /(?:livr|expédi|expédition|deliver|ship|dispatch|توصيل|التوصيل|كيوصل|كتوصل|توصلك|يوصلك|نوصلو)/iu;
const RETURN_CONTEXT = /(?:retour|retourn|renvo|rétract|échang|rembours|return|exchange|refund|money back|ارجاع|إرجاع|الارجاع|الإرجاع|ترجع|تبديل|التبديل|تبدل|استرجاع|استرداد)/iu;
const WARRANTY_CONTEXT = /(?:garanti|warranty|guarantee|ضمان|ضمانة|كارانتي)/iu;
const CALL_CONTEXT = /(?:appel|appelle|rappel|call|phone|نعيط|نتاصل|نتصل|الاتصال|التواصل)/iu;
const AGO_CONTEXT = /(?:il y a|ago|منذ|هادي|هذي)\s*$/iu;
const YEAR_BEFORE = /(?:depuis|since|en|in|année|year|collection|édition|edition|saison|season|©|copyright|fondée?|founded|established|منذ|من|سنة|عام|موسم|مجموعة)\s*$/iu;
const MONTHS = /^\s*(?:janv|févr|fevr|mars|avr|mai|juin|juil|août|aout|sept|oct|nov|déc|dec|jan|feb|mar|apr|may|jun|jul|aug|sep|يناير|فبراير|مارس|أبريل|ابريل|ماي|يونيو|يوليوز|يوليو|غشت|أغسطس|شتنبر|سبتمبر|أكتوبر|اكتوبر|نونبر|نوفمبر|دجنبر|ديسمبر|جانفي|فيفري|أفريل)/iu;
const DATE_SLASH = /^\/\d{1,2}(?:\/\d{2,4})?/;
const COMPOUND = /^\s*(?:en|in|-in-|في|ف)\s*1(?![\d])/iu;

const IN_DAYS = { second: 1 / 86_400, minute: 1 / 1_440, hour: 1 / 24, day: 1, week: 7, month: 30, year: 365 } as const;
const UNIT_CANON: Record<string, string> = { second: "s", minute: "min", hour: "h", day: "d", week: "w", month: "mo", year: "y" };

/**
 * The class of one numeral from the words around it (`text`, Latin digits) and the section it sits in; `written` is
 * the same text as the page has it (same offsets: `latinDigits` keeps lengths), for the finding's words.
 */
function classify(text: string, written: string, n: Numeral, section: string | null): Read {
  // a range member reads the words around the whole range: the head takes the tail's unit ("24–48h" → hours)
  const from = n.range?.start ?? n.start;
  const to = n.range?.end ?? n.end;
  const a = after(text, to);
  const b = before(text, from);
  const value = Number(n.value);
  const label = (len: number) => {
    const end = Math.min(written.length, to + len);
    // a bare numeral reads with the word before it ("XL 2024", "Modèle 3"), the words a seller recognises
    const lead = len === 0 && !n.range ? /([\p{L}][\p{L}\p{N}'-]{0,11})\s+$/u.exec(written.slice(Math.max(0, from - 14), from))?.[1] : undefined;
    return `${lead ? `${lead} ` : ""}${written.slice(from, end).trim()}`.slice(0, 40);
  };
  const prefix = b.endsWith("+") ? "+" : "";
  const write = (len: number) => (prefix ? `+${label(len)}` : label(len));

  // ratings and review counts: "4,7/5", "4,7 (312)", "312 avis"
  if (RATING_AFTER.test(a) && value <= 5) return { cls: "rating", as: n.value, unit: null, label: write(/^\s*(?:\/\s*5|★|⭐|étoiles?|stars?|نجوم|نجمة)/iu.exec(a)?.[0].length ?? 0) };
  if (/\(\s*$/.test(b) && /\d[.,]\d\s*\(\s*$/.test(before(text, n.start, 12))) return { cls: "review_count", as: n.value, unit: null, label: write(0) };
  if (REVIEWS_AFTER.test(a)) return { cls: "review_count", as: n.value, unit: null, label: write(REVIEWS_AFTER.exec(a)![0].length) };
  // money
  const cur = CURRENCY.exec(a);
  if (cur || CURRENCY_BEFORE.test(b)) {
    const len = cur?.[0].length ?? 0;
    if (COMPARE_BEFORE.test(b)) return { cls: "compare_at", as: n.value, unit: null, label: write(len) };
    if (SAVINGS_BEFORE.test(b)) return { cls: "savings", as: n.value, unit: null, label: write(len) };
    if (FEE_CONTEXT.test(b.slice(-28))) return { cls: "fee", as: n.value, unit: null, label: write(len) };
    return { cls: "price", as: n.value, unit: null, label: write(len) };
  }
  // percentages
  if (/^\s*%/.test(a)) {
    const len = /^\s*%/.exec(a)![0].length;
    if (SAVINGS_BEFORE.test(b) || SAVINGS_AFTER.test(a)) return { cls: "savings", as: n.value, unit: null, label: write(len) };
    if (STAT_AFTER.test(a) || (section && PROOF_SECTIONS.has(section))) return { cls: "stat", as: n.value, unit: null, label: write(len + 12) };
    return { cls: "fact", as: n.value, unit: "%", label: write(/^\s*%\s*[\p{L}]+/u.exec(a)?.[0].length ?? len) };
  }
  // dates: "31 octobre", "31/10/2026" (the countdown's parts)
  if (MONTHS.test(a) || DATE_SLASH.test(a)) return { cls: "countdown", as: n.value, unit: null, label: write((MONTHS.exec(a) ?? DATE_SLASH.exec(a))![0].length) };
  // years
  if (/^\d{4}$/.test(n.value) && value >= 1990 && value <= 2100 && YEAR_BEFORE.test(b)) return { cls: "year", as: n.value, unit: null, label: write(0) };
  // stock and counters
  if (STOCK_BEFORE.test(b) && (UNITS.test(a) || /^\s*(?:en stock|left|in stock)/iu.test(a))) return { cls: "stock", as: n.value, unit: null, label: write(12) };
  if (prefix || COUNTER_AFTER.test(a)) return { cls: "counter", as: n.value, unit: null, label: write(/^\s*[\p{L}]+(?:\s+[\p{L}]+)?/u.exec(a)?.[0].length ?? 0) };
  // "2 en 1"
  if (COMPOUND.test(a)) return { cls: "fact", as: n.value, unit: null, label: write(COMPOUND.exec(a)![0].length) };
  // durations: delivery, returns, warranty, call, or a product fact ("prêt en 30 s", "autonomie 8 heures")
  for (const [re, unit] of TIME_UNIT) {
    const m = re.exec(a);
    if (!m) continue;
    const ctx = b.slice(-36);
    const len = m[0].length;
    if (AGO_CONTEXT.test(b)) return { cls: "other", as: n.value, unit: UNIT_CANON[unit]!, label: write(len) };
    if (DELIVERY_CONTEXT.test(ctx)) return { cls: "delivery_days", as: num(unit === "hour" || unit === "minute" || unit === "second" ? Math.ceil(value * IN_DAYS[unit] - 1e-9) : value * IN_DAYS[unit]), unit: "d", label: write(len) };
    if (WARRANTY_CONTEXT.test(ctx)) return { cls: "warranty_months", as: num(unit === "year" ? value * 12 : unit === "month" ? value : value * IN_DAYS[unit] / 30), unit: "mo", label: write(len) };
    if (RETURN_CONTEXT.test(ctx)) return { cls: "return_days", as: num(value * IN_DAYS[unit]), unit: "d", label: write(len) };
    if (CALL_CONTEXT.test(ctx) && (unit === "hour" || unit === "minute")) return { cls: "within_hours", as: num(unit === "minute" ? value / 60 : value), unit: "h", label: write(len) };
    return { cls: "fact", as: n.value, unit: UNIT_CANON[unit]!, label: write(len) };
  }
  const measure = MEASURE.exec(a);
  if (measure) return { cls: "weight_volume", as: n.value, unit: lower(measure[1]!), label: write(measure[0].length) };
  if (/[x×]\s*$/iu.test(b) || /^\s*[x×](?![\p{L}])/iu.test(a) || UNITS.test(a)) return { cls: "units", as: n.value, unit: null, label: write(UNITS.exec(a)?.[0].length ?? 0) };
  const word = /^\s*[\p{L}][\p{L}'-]*/u.exec(a);
  if (word) return { cls: "qty", as: n.value, unit: null, label: write(word[0].length) };
  return { cls: "other", as: n.value, unit: null, label: write(0) };
}

/** The word a numeral is about ("prêt en 30 s" → "prêt"), for the same-fact conflict of rule 4. */
const STOP = new Set(["en", "de", "du", "des", "la", "le", "les", "l", "d", "à", "a", "au", "aux", "pour", "avec", "et", "ou", "sous", "dans", "in", "of", "the", "for", "with", "and", "or", "within", "ف", "في", "ب", "ل", "خلال", "حتى", "من", "و", "مع", "غير"]);
function leadWord(text: string, start: number): string | null {
  const words = lower(text.slice(Math.max(0, start - 40), start)).split(/[^\p{L}]+/u).filter(Boolean);
  for (let i = words.length - 1; i >= 0; i--) {
    const w = words[i]!.normalize("NFD").replace(/[̀-ͯ]/g, "");
    if (!STOP.has(w) && w.length >= 3) return w;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* the audit                                                           */
/* ------------------------------------------------------------------ */

function allowedAs(allowed: AllowedNumbers, r: Read, raw: Numeral): boolean {
  if (allowed.all.has(raw.value)) return true;
  if (r.as !== null && r.cls && allowed.byClass[r.cls]?.includes(r.as)) return true;
  if (r.cls === "year") return true;
  return false;
}

/**
 * Every numeral of the page's visible text and proof data that no merchant field backs, or that contradicts the
 * value the store set (LAN-§6.4 rules 1 to 7). One finding per field and value, in document order. `origin` is the
 * gate's fold of the core's `originFrom` (a path it does not name is the owner's). `opts.attestedSections` are the
 * proof sections the owner confirmed as real (`page.proof_attested`): their numerals are the owner's proof, not
 * findings.
 */
export function auditNumbers(
  doc: PageDoc,
  allowed: AllowedNumbers,
  locale: Locale,
  origin: ReadonlyMap<string, "generated" | "owner">,
  opts: { attestedSections?: ReadonlySet<string> } = {},
): NumberFinding[] {
  const out: NumberFinding[] = [];
  const seen = new Set<string>();
  /** ranges already reported, by field and start ("24–48h" is one finding, not "24" and "48h") */
  const ranges = new Set<string>();
  const facts = new Map<string, { value: string; label: string }>();
  const { texts, numbers } = visibleFields(doc);

  const push = (path: string, section: string | null, value: string, r: Read, why: "unknown" | "conflict", conflictsWith?: string) => {
    const key = `${path}\u0000${value}`;
    if (seen.has(key)) return;
    seen.add(key);
    const from = origin.get(path) === "generated" ? "generated" : "owner";
    const inProof = !!section && PROOF_SECTIONS.has(section);
    const hard = why === "conflict" || from === "generated" || (r.cls !== null && PROOF_CLASSES.has(r.cls)) || inProof;
    out.push({ path, text: r.label, value, cls: r.cls, why, ...(conflictsWith !== undefined ? { conflictsWith } : {}), origin: from, level: hard ? "hard" : "soft" });
  };

  for (const f of texts) {
    if (f.sectionId && opts.attestedSections?.has(f.sectionId)) continue;
    const latin = latinDigits(f.text);
    for (const n of numeralsOf(f.text, locale)) {
      const r = classify(latin, f.text, n, f.section);
      if (r.cls === "phone" || r.cls === "order_id") continue;
      // a grouped number whose whole is not allowed but whose parts are ("Pack 2 199 DH") reads as its parts
      const reads: { n: Numeral; r: Read }[] =
        n.parts && !allowedAs(allowed, r, n) && n.parts.every((p) => allowed.all.has(p)) ? n.parts.map((p) => ({ n: { ...n, value: p, parts: null }, r: { ...r, as: p } })) : [{ n, r }];
      for (const { n: m, r: read } of reads) {
        const ok = allowedAs(allowed, read, m);
        // rule 4b: two facts with the same unit and lead word ("prêt en 30 s", "prêt en 40 s")
        if ((read.cls === "fact" || read.cls === "weight_volume") && read.unit && read.unit !== "%") {
          const lead = leadWord(latin, m.start);
          if (lead) {
            const key = `${read.unit}\u0000${lead}`;
            const prior = facts.get(key);
            if (prior && prior.value !== m.value) {
              push(f.path, f.section, m.value, read, "conflict", prior.label);
              continue;
            }
            if (!prior) facts.set(key, { value: m.value, label: read.label });
          }
        }
        if (ok) continue;
        if (m.range) {
          const key = `${f.path}\u0000${m.range.start}`;
          if (ranges.has(key)) continue;
          ranges.add(key);
        }
        const known = read.cls && SINGLE_VALUED.has(read.cls) ? allowed.byClass[read.cls] : undefined;
        if (known?.length) push(f.path, f.section, m.value, read, "conflict", known.length === 2 ? `${known[0]}-${known[1]}` : known.join(", "));
        else push(f.path, f.section, m.value, read, "unknown");
      }
    }
  }
  for (const f of numbers) {
    if (opts.attestedSections?.has(f.sectionId)) continue;
    const value = num(f.value);
    const r: Read = { cls: f.cls, as: value, unit: null, label: value };
    if (allowedAs(allowed, r, { start: 0, end: 0, raw: value, value, parts: null })) continue;
    const known = SINGLE_VALUED.has(f.cls) ? allowed.byClass[f.cls] : undefined;
    if (known?.length) push(f.path, f.section, value, r, "conflict", known.join(", "));
    else push(f.path, f.section, value, r, "unknown");
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* sensitive fields (rev 3, SEC-18; core D76, §M.3)                    */
/* ------------------------------------------------------------------ */

/**
 * Labels a COD page never asks for: passwords, one-time and verification codes, card numbers and security codes,
 * bank account numbers (`honesty:password_field`). The storefront's `storefront:form_field_foreign` imports this list,
 * so both gates refuse the same fields. "Code postal", "code promo", "carte cadeau" and a gift-card message stay clean.
 */
export const SENSITIVE_FIELD_RE: Record<"ar" | "fr" | "en", RegExp> = {
  fr: /\b(?:mot\s+de\s+passe|mdp|code\s+(?:sms|otp|pin|secret|d'accès|de\s+(?:vérification|confirmation|sécurité|validation))|(?:num(?:é|e)ro|n°|no)\s+de\s+(?:la\s+)?carte|carte\s+(?:bancaire|de\s+cr(?:é|e)dit|cb|visa|mastercard)|cryptogramme|cvv|cvc|date\s+d'expiration|rib|iban|otp)\b/iu,
  en: /\b(?:password|passcode|pass\s+code|pin(?:\s+code)?|otp|one[-\s]time\s+(?:code|password)|verification\s+code|sms\s+code|security\s+code|card\s+number|credit\s+card|debit\s+card|cvv|cvc|expiry\s+date|expiration\s+date|iban|bank\s+account|sort\s+code|routing\s+number)\b/iu,
  ar: /(?:كلمة\s+(?:ال)?(?:سر|مرور|السر|المرور)|كلمة\s+السر|الرقم\s+السري|الكود\s+السري|رمز\s+(?:ال)?(?:تحقق|تأكيد|التحقق|التأكيد|الأمان|الامان|سري)|كود\s+(?:ال)?(?:تأكيد|تحقق|sms|اس\s*ام\s*اس)|رقم\s+(?:ال)?بطاقة|البطاقة\s+البنكية|بطاقة\s+(?:ال)?(?:ائتمان|بنكية)|الحساب\s+البنكي|رقم\s+الحساب|الكود\s+اللي\s+وصلك|(?<![\p{L}])(?:cvv|rib|iban|otp)(?![\p{L}]))/iu,
};

const sensitive = (label: string) => (Object.values(SENSITIVE_FIELD_RE) as RegExp[]).some((re) => re.test(label));

/**
 * The option and form fields whose label (or placeholder) asks for something a COD page never collects (rev 3,
 * SEC-18): the items' `field` option groups and the order-level `field` extras. The gate adds `input[type=password]`
 * and `autocomplete^="cc-"` / `"one-time-code"` from the rendered HTML.
 */
export function sensitiveFields(doc: PageDoc): { path: string; label: string }[] {
  const out: { path: string; label: string }[] = [];
  doc.items.forEach((it, i) =>
    it.groups.forEach((g, j) => {
      if (isFieldGroup(g) && (sensitive(g.name) || (g.placeholder ? sensitive(g.placeholder) : false))) out.push({ path: `items.${i}.groups.${j}`, label: g.name });
    }),
  );
  doc.offers.extras.forEach((x, j) => {
    if (x.kind === "field" && (sensitive(x.name) || (x.placeholder ? sensitive(x.placeholder) : false))) out.push({ path: `offers.extras.${j}`, label: x.name });
  });
  return out;
}
