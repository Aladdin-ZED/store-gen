/**
 * Policy claims in shopper text (P3 LANDING; landing.md LAN-§6.3 rev 3 ENGP-8, LAN-§3.3; docs/STORE-SAAS.md §M.3):
 * the sentences of a page that promise something only a store policy can back ("livraison gratuite", "retour sous 7
 * jours", "on vous appelle dans l'heure"). The honesty gate checks each one with `policyAllows` (./index.ts) and P7's
 * guard reads the same patterns, so a page and a generated line are judged alike. Pure and isomorphic.
 *
 *   policyClaims("Livraison en 24 h, retour sous 7 jours", "fr")
 *   → [{ kind: "delivery_time", max: 1, … }, { kind: "return_window", max: 7, … }]
 *
 * A claim is a policy keyword WITH a quantity or a qualifier: "retour en force", "la livraison du produit",
 * "garantie de qualité" and a bare "appel" give nothing. Numbers are read in Latin and Arabic-Indic digits, as number
 * words ("deux ans", "جوج أيام") and as Arabic duals ("يومين" = 2 days). The patterns live per locale in
 * ./claims.<locale>.ts; Moroccan pages mix French and Arabic, so an `ar` or `fr` text is read with both lexicons.
 *
 * Quantities come out in the kind's own unit: days for delivery, returns, exchanges and refunds, months for a
 * warranty, hours for a confirmation call. `min` / `max` are the stated bounds ("24/48 h" → 1 and 2 days, "en 48 h"
 * → max 2); null when the claim states no number.
 */
import type { Locale } from "@/lib/page/schema";
import { AR_LEXICON } from "./claims.ar";
import { EN_LEXICON } from "./claims.en";
import { FR_LEXICON } from "./claims.fr";

export const POLICY_CLAIM_KINDS = ["delivery_time", "free_delivery", "return_window", "exchange", "inspection", "warranty", "refund", "confirmation_call"] as const;
export type PolicyClaimKind = (typeof POLICY_CLAIM_KINDS)[number];

export type ClaimUnit = "minute" | "hour" | "day" | "week" | "month" | "year";

/** A promise without a number, or what the number means. */
export type ClaimQualifier =
  | "free" /* "livraison gratuite", "retour gratuit", "échange offert" */
  | "next_day"
  | "same_day"
  | "today" /* a call "aujourd'hui" */
  | "within_hour"
  | "lifetime"
  | "money_back" /* "satisfait ou remboursé" */
  | "before_paying" /* open or check the parcel before paying */
  | "confirm"; /* "on vous appelle pour confirmer": a call promised, no time */

export interface PolicyClaim {
  kind: PolicyClaimKind;
  /** the matched words as written in the text */
  text: string;
  /** UTF-16 offsets in the text as given */
  start: number;
  end: number;
  /** stated bounds in the kind's unit (days · months for `warranty` · hours for `confirmation_call` · the threshold in currency units for `free_delivery`) */
  min: number | null;
  max: number | null;
  qualifier: ClaimQualifier | null;
  /** clock times a call claim states, "HH:MM" ("entre 9h et 19h" → ["09:00", "19:00"]) */
  times: string[];
}

/** One pattern of a lexicon. Named groups: n, m (a number and an upper bound), u (unit word), d (a dual word: number and unit), s (a unit word that means one: "سنة"), q (qualifier word), t1, t2 (clock times), c (a currency threshold). */
export interface ClaimRule {
  kind: PolicyClaimKind;
  re: string;
  /** the claim's qualifier when the rule fixes it ("satisfait ou remboursé" → money_back) */
  qualifier?: ClaimQualifier;
}

/** The pattern parts a lexicon composes its rules from (built once per lexicon by `compile`). */
export interface ClaimParts {
  /** left and right word boundaries that work for accented Latin and Arabic letters */
  B: string;
  E: string;
  /** a number (digits or a number word), as group n / m, or ungrouped */
  N: string;
  M: string;
  NUM: string;
  /** a number or a range "24/48", "2 à 4", "من 24 حتى 48" (groups n and m) */
  R: string;
  /** a time unit word (group u) */
  U: string;
  /** a dual word, number and unit at once (group d): "يومين", "ساعتين" */
  D: string;
  /** a unit word that means one of it (group s): "سنة", "عام", "شهر" */
  S: string;
  /** zero to four filler words, no punctuation in between */
  W: string;
  /** clock times (groups t1, t2) */
  T1: string;
  T2: string;
  /** an amount of money after a threshold word (group c) */
  C: string;
}

export interface ClaimLexicon {
  /** number words → value, lower case */
  numbers: Readonly<Record<string, number>>;
  /** time unit words → unit, lower case, longest forms first is not needed (sorted by the compiler) */
  units: Readonly<Record<string, ClaimUnit>>;
  /** words that carry a number and a unit ("يومين" → 2 days) */
  duals: Readonly<Record<string, readonly [number, ClaimUnit]>>;
  /** unit words that mean "one" when they stand alone ("سنة" → 1 year) */
  singles: Readonly<Record<string, ClaimUnit>>;
  /** qualifier words → qualifier (and the bound they imply, in the kind's unit: "demain" → 1 day) */
  qualifiers: Readonly<Record<string, readonly [ClaimQualifier, number | null]>>;
  /** range separators between two numbers */
  rangeSeparators: readonly string[];
  /** currency words after a threshold amount */
  currency: string;
  /**
   * Optional fast path: a regex source (normalised text: bare alef, no harakat) of stems one of which every rule of
   * the lexicon contains. A text without any is skipped; the claim fixtures of `test:policies` prove nothing is lost.
   */
  hint?: string;
  rules: (p: ClaimParts) => readonly ClaimRule[];
}

/* ------------------------------------------------------------------ */
/* normalisation                                                       */
/* ------------------------------------------------------------------ */

/** Text the patterns read, with a map back to the offsets of the text as given. */
interface Normalised {
  text: string;
  /** index in `text` → index in the original */
  at: number[];
}

const ARABIC_MARKS = /[\u064B-\u0652\u0670\u0640]/; // harakat, superscript alef, tatweel: dropped
const SPACES = /[\u00A0\u202F\u2007\u2009\u200A]/;
const BIDI = /[\u200E\u200F\u202A-\u202E\u2066-\u2069]/;

/**
 * Digits to Latin (Arabic-Indic and Persian), no-break spaces to spaces, curly apostrophes to straight, dashes to "-",
 * Arabic marks, tatweel and bidi controls dropped, hamza-carrying alefs to a bare alef, Latin lower-cased. The Arabic
 * lexicon is written in this normalised spelling.
 */
export function normaliseClaimText(input: string): Normalised {
  let text = "";
  const at: number[] = [];
  for (let i = 0; i < input.length; i++) {
    let c = input[i]!;
    if (ARABIC_MARKS.test(c) || BIDI.test(c)) continue;
    const code = c.charCodeAt(0);
    if (code >= 0x0660 && code <= 0x0669) c = String(code - 0x0660);
    else if (code >= 0x06f0 && code <= 0x06f9) c = String(code - 0x06f0);
    else if (c === "\u066B") c = ","; // Arabic decimal separator
    else if (c === "\u066C") continue; // Arabic thousands separator
    else if (SPACES.test(c)) c = " ";
    else if (c === "\u2019" || c === "\u02BC" || c === "\u2018") c = "'";
    else if (c === "\u2013" || c === "\u2014" || c === "\u2012" || c === "\u2212") c = "-";
    else if (c === "\u0623" || c === "\u0625" || c === "\u0622") c = "\u0627"; // \u0623 \u0625 \u0622 \u2192 \u0627: "\u0623\u064a\u0627\u0645" and "\u0627\u064a\u0627\u0645" are one word
    else if (c === "\u0649") c = "\u064a"; // \u0649 \u2192 \u064a
    else {
      const lower = c.toLowerCase();
      if (lower.length === 1) c = lower;
    }
    text += c;
    at.push(i);
  }
  at.push(input.length);
  return { text, at };
}

/* ------------------------------------------------------------------ */
/* compiling a lexicon                                                 */
/* ------------------------------------------------------------------ */

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+");
const alt = (words: readonly string[]) => [...words].sort((a, b) => b.length - a.length).map(escape).join("|");

/** The Arabic spelling folds of `normaliseClaimText`, applied to a lexicon so its authors may write "حتى" or "أيام". */
const fold = (s: string) => s.replace(/[\u064B-\u0652\u0670\u0640]/g, "").replace(/[\u0623\u0625\u0622]/g, "\u0627").replace(/\u0649/g, "\u064A");
const foldKeys = <V>(o: Readonly<Record<string, V>>): Record<string, V> => Object.fromEntries(Object.entries(o).map(([k, v]) => [fold(k), v]));

function folded(lexicon: ClaimLexicon): ClaimLexicon {
  return {
    numbers: foldKeys(lexicon.numbers),
    units: foldKeys(lexicon.units),
    duals: foldKeys(lexicon.duals),
    singles: foldKeys(lexicon.singles),
    qualifiers: foldKeys(lexicon.qualifiers),
    rangeSeparators: lexicon.rangeSeparators.map(fold),
    currency: fold(lexicon.currency),
    rules: (p) => lexicon.rules(p).map((r) => ({ ...r, re: fold(r.re) })),
  };
}

interface Compiled {
  lexicon: ClaimLexicon;
  rules: { rule: ClaimRule; re: RegExp }[];
  /** the script every keyword of the lexicon is written in: a text without it cannot match (the gate's fast path) */
  script: RegExp;
  /** the lexicon's `hint`: a text with none of these stems cannot match either */
  hint: RegExp | null;
}

/** Arabic letters; Latin letters (with the French accents). */
const ARABIC_SCRIPT = /[\u0620-\u064A\u0671-\u06D3]/;
const LATIN_SCRIPT = /[A-Za-z\u00C0-\u00FF]/;

function compile(authored: ClaimLexicon, script: RegExp): Compiled {
  const lexicon = folded(authored);
  const B = "(?<![\\p{L}\\p{N}])";
  const E = "(?![\\p{L}\\p{N}])";
  const words = alt(Object.keys(lexicon.numbers));
  const NUM = `(?:\\d{1,4}(?:[.,]\\d{1,2})?${words ? `|${B}(?:${words})${E}` : ""})`;
  const units = alt(Object.keys(lexicon.units));
  const sep = alt(lexicon.rangeSeparators);
  const N = `(?<n>${NUM})`;
  const M = `(?<m>${NUM})`;
  // "24h/48h", "24-48 h", "2 à 4 jours": the first number may carry its own unit
  const R = `${N}(?:\\s*(?:${units})?\\s*(?:${sep})\\s*${M})?`;
  const U = `\\s*-?\\s*(?<u>${units})${E}`;
  // a dual or a lone unit word starts a word, or follows an attached Arabic preposition ("فيومين", "بسنة")
  const LEAD = "(?<![\\p{L}\\p{N}])(?:[فبل](?=\\p{L}))?";
  const D = `${LEAD}(?<d>${alt(Object.keys(lexicon.duals)) || "(?!)"})${E}`;
  const S = `${LEAD}(?<s>${alt(Object.keys(lexicon.singles)) || "(?!)"})${E}`;
  const W = "(?:\\s+[\\p{L}'-]+){0,4}?";
  // a clock time never runs into more digits ("de 0522…" is a phone number, not 05:00)
  const time = (g: string) => `(?<${g}>\\d{1,2}(?:\\s*(?:h|:)\\s*\\d{2}|\\s*h(?![\\p{L}]))?(?:\\s*(?:am|pm)${E})?)(?![\\p{N}])`;
  // a threshold needs its currency ("dès 300 DH"): "dès 2 pièces" is not an amount
  const C = `(?<c>\\d{1,6}(?:[ .,]\\d{3})*(?:[.,]\\d{1,2})?)\\s*(?:${lexicon.currency})${E}`;
  const parts: ClaimParts = { B, E, N, M, NUM, R, U, D, S, W, T1: time("t1"), T2: time("t2"), C };
  return { lexicon, rules: lexicon.rules(parts).map((rule) => ({ rule, re: new RegExp(rule.re, "giu") })), script, hint: authored.hint ? new RegExp(authored.hint, "u") : null };
}

const LEXICONS: Record<"ar" | "fr" | "en", Compiled> = {
  ar: compile(AR_LEXICON, ARABIC_SCRIPT),
  fr: compile(FR_LEXICON, LATIN_SCRIPT),
  en: compile(EN_LEXICON, LATIN_SCRIPT),
};

/** Which lexicons read a text of this page locale: Moroccan pages mix French and Arabic. */
function lexiconsFor(locale: Locale | "ar" | "fr" | "en"): Compiled[] {
  if (locale === "ar") return [LEXICONS.ar, LEXICONS.fr];
  if (locale === "fr") return [LEXICONS.fr, LEXICONS.ar];
  if (locale === "en") return [LEXICONS.en];
  return [LEXICONS.en, LEXICONS.fr];
}

/* ------------------------------------------------------------------ */
/* values                                                              */
/* ------------------------------------------------------------------ */

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

function numberOf(raw: string | undefined, lexicon: ClaimLexicon): number | null {
  if (raw === undefined) return null;
  const s = clean(raw);
  if (/^\d/.test(s)) {
    const n = Number(s.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return lexicon.numbers[s] ?? null;
}

/** Hours, days or months per unit, for the kind's own unit. */
const IN_HOURS: Record<ClaimUnit, number> = { minute: 1 / 60, hour: 1, day: 24, week: 168, month: 720, year: 8_760 };
const IN_DAYS: Record<ClaimUnit, number> = { minute: 1 / 1_440, hour: 1 / 24, day: 1, week: 7, month: 30, year: 365 };
const IN_MONTHS: Record<ClaimUnit, number> = { minute: 0, hour: 0, day: 1 / 30, week: 7 / 30, month: 1, year: 12 };

function inKindUnit(kind: PolicyClaimKind, value: number, unit: ClaimUnit): number {
  if (kind === "confirmation_call") return Math.round(value * IN_HOURS[unit] * 100) / 100;
  if (kind === "warranty") return Math.round(value * IN_MONTHS[unit] * 100) / 100;
  // a delivery or return time in hours rounds up to whole days ("48 h" → 2, "36 h" → 2)
  const days = value * IN_DAYS[unit];
  return unit === "hour" || unit === "minute" ? Math.ceil(days - 1e-9) : Math.round(days * 100) / 100;
}

/** "9h" → "09:00", "19h30" → "19:30", "7 pm" → "19:00"; null for an impossible time. */
function clock(raw: string | undefined): string | null {
  if (!raw) return null;
  const m = /^(\d{1,2})(?:\s*(?:h|:)\s*(\d{2})|\s*h)?(?:\s*(am|pm))?$/.exec(clean(raw));
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  if (m[3] === "pm" && h < 12) h += 12;
  if (m[3] === "am" && h === 12) h = 0;
  if (h > 24 || min > 59) return null;
  return `${String(h % 24).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function claimOf(match: RegExpExecArray, rule: ClaimRule, lexicon: ClaimLexicon): Omit<PolicyClaim, "text" | "start" | "end"> | null {
  const g = match.groups ?? {};
  let qualifier: ClaimQualifier | null = rule.qualifier ?? null;
  let min: number | null = null;
  let max: number | null = null;
  const unitWord = g.u !== undefined ? lexicon.units[clean(g.u)] : undefined;
  if (g.d !== undefined) {
    const dual = lexicon.duals[clean(g.d)];
    if (dual) min = max = inKindUnit(rule.kind, dual[0], dual[1]);
  } else if (g.s !== undefined) {
    const unit = lexicon.singles[clean(g.s)];
    if (unit) min = max = inKindUnit(rule.kind, 1, unit);
  } else if (rule.kind === "free_delivery") {
    // the only number of a free-delivery claim is its threshold ("dès 300 DH"), in currency units
    const c = g.c !== undefined ? Number(clean(g.c).replace(/[ .](?=\d{3}\b)/g, "").replace(",", ".")) : NaN;
    if (Number.isFinite(c)) min = max = c;
  } else if (g.n !== undefined) {
    const n = numberOf(g.n, lexicon);
    const m = numberOf(g.m, lexicon);
    if (n === null) return null;
    // a call or a delivery "in 30" with no unit is not a promise we can read
    if (!unitWord) return null;
    const a = inKindUnit(rule.kind, n, unitWord);
    const b = m !== null ? inKindUnit(rule.kind, m, unitWord) : null;
    min = b !== null ? Math.min(a, b) : a;
    max = b !== null ? Math.max(a, b) : a;
    // "en 48 h" states an upper bound only; "entre 2 et 4 jours" both
    if (b === null) min = null;
  }
  if (g.q !== undefined) {
    const q = lexicon.qualifiers[clean(g.q)];
    if (q) {
      qualifier = q[0];
      if (q[1] !== null && max === null) max = q[1];
    }
  }
  const times = [clock(g.t1), clock(g.t2)].filter((t): t is string => t !== null);
  if (rule.kind === "free_delivery") qualifier ??= "free";
  if (rule.kind === "confirmation_call" && max === null && !times.length) qualifier ??= "confirm";
  if (max === null && qualifier === null && !times.length) return null;
  return { kind: rule.kind, min, max, qualifier, times };
}

/* ------------------------------------------------------------------ */
/* entry point                                                         */
/* ------------------------------------------------------------------ */

/**
 * The policy claims of a text, in reading order. Overlapping matches of one kind keep the longest (a call promise
 * with its time beats the bare promise); claims of different kinds may overlap ("satisfait ou remboursé sous 14
 * jours" is one refund claim). Unsupported locales read the English and French patterns.
 */
export function policyClaims(text: string, locale: Locale | "ar" | "fr" | "en"): PolicyClaim[] {
  if (!text || !/[\p{L}]/u.test(text)) return [];
  const norm = normaliseClaimText(text);
  const found: PolicyClaim[] = [];
  for (const { lexicon, rules, script, hint } of lexiconsFor(locale)) {
    // every rule of a lexicon needs one of its words: a text without its script, or without one of its stems, has
    // no claim of it (the 400-field pages stay inside the gate's 40 ms)
    if (!script.test(norm.text) || (hint && !hint.test(norm.text))) continue;
    for (const { rule, re } of rules) {
      re.lastIndex = 0;
      for (let m = re.exec(norm.text); m; m = re.exec(norm.text)) {
        if (m[0].length === 0) {
          re.lastIndex++;
          continue;
        }
        const c = claimOf(m, rule, lexicon);
        if (!c) continue;
        const start = norm.at[m.index]!;
        const end = norm.at[m.index + m[0].length] ?? text.length;
        found.push({ ...c, text: text.slice(start, end).trim(), start, end });
      }
    }
  }
  found.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
  const out: PolicyClaim[] = [];
  for (const c of found) {
    const clash = out.findIndex((o) => o.kind === c.kind && c.start < o.end && o.start < c.end);
    if (clash < 0) out.push(c);
    else if (c.end - c.start > out[clash]!.end - out[clash]!.start) out[clash] = c;
  }
  return out;
}
