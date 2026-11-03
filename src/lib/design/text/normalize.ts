/**
 * The copy normalisers (P6 DESIGN; design.md DES-§9.1, QUAL-22). Pure and isomorphic. Two forms of one text:
 *
 *  - the **display form** (`tokens`): the locale row of DES-§9.1 plus the shared row (markup stripped, the product
 *    name → `§p`, numbers → `§n`, slot tokens → `§s`, split on punctuation). Shingles and the headline checks read it,
 *    so two stores selling different products under the same skeleton still share its 3-grams;
 *  - the **matching form** (`matchKeys`): the display token plus its stems, for the lexicon, fact and frame matching
 *    only. Arabic strips the proclitics (`AR_PREFIXES`, when ≥ 3 letters remain) and a light set of suffixes; the
 *    verb key also drops one conjugation prefix (ي / ت / ن / ا). French strips the elision and a suffix lemma table
 *    (`découvrez / découvrir / découvre` → `decouvr`); English a light stemmer (`elevates / elevated` → `elevat`).
 *
 * Arabic-Indic and Eastern digits read as ASCII in every locale; hamza seats, alef forms, ta marbuta and alef maqsura
 * are unified for comparison only (the library spells one way, DES-§9.10).
 */
import type { Locale } from "@/lib/page/schema";

/** The three copy locales (a Latin locale beyond fr / en reads as en). */
export type TextLocale = "ar" | "fr" | "en";
export const textLocale = (l: Locale | TextLocale): TextLocale => (l === "ar" ? "ar" : l === "fr" ? "fr" : "en");

/** Arabic proclitics stripped before stem matching (the article, and / with / for…), longest first. */
export const AR_PREFIXES: readonly string[] = ["وال", "بال", "فال", "كال", "لل", "ال", "و", "ب", "ل", "ف", "ك"];
/** The light stemmer's suffixes (pronouns and the sound plurals / duals), longest first. */
export const AR_SUFFIXES: readonly string[] = ["ها", "هم", "هن", "كم", "نا", "ات", "ين", "ون", "ان", "ك", "ي"];
/** One conjugation prefix the verb key drops (after the unification أ → ا). */
const AR_VERB_PREFIXES: readonly string[] = ["ي", "ت", "ن", "ا"];
/** French elided articles and pronouns (DES-§9.1). */
const FR_ELISIONS = /(?<!\p{L})(l|d|j|qu|n|s|c|m|t|jusqu|lorsqu|puisqu)'(?=\p{L})/gu;
const FR_ELIDED = /^(l|d|j|qu|n|s|c|m|t|jusqu|lorsqu|puisqu)'$/;
/** French suffixes of the lemma table, longest first (applied to tokens of ≥ 5 letters, a stem of ≥ 4 kept). */
const FR_SUFFIXES: readonly string[] = ["issement", "issent", "ement", "ables", "able", "ees", "ent", "ons", "ant", "ait", "ira", "ir", "ee", "es", "ez", "er", "is", "it", "e", "s"];
/** English suffixes of the light stemmer, longest first (a stem of ≥ 3 kept; a final e dropped after). */
const EN_SUFFIXES: readonly string[] = ["ingly", "edly", "ing", "ies", "ied", "ed", "es", "ly", "s"];

const TASHKEEL = /[ً-ٰٟۖ-ۭ]/g;
const TATWEEL = /ـ/g;

/** Arabic-Indic (٠-٩) and Eastern (۰-۹) digits → ASCII. */
export function asciiDigits(s: string): string {
  return s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/** The Arabic letter unification of DES-§9.1 (no case in Arabic). */
export function arFold(s: string): string {
  return s
    .normalize("NFKC")
    .replace(TASHKEEL, "")
    .replace(TATWEEL, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي");
}

/** The locale row of DES-§9.1 (no masking, no splitting): what two equal texts share. */
export function normalizeDisplay(text: string, locale: Locale | TextLocale): string {
  const l = textLocale(locale);
  let s = /[٠-٩۰-۹]/.test(text) ? asciiDigits(text) : text;
  if (l === "ar") {
    // Latin words inside Arabic copy (a brand, "argan") compare like the Latin locales
    s = arFold(s).replace(/[’‘]/g, "'").toLowerCase();
  } else if (l === "fr") {
    s = s.toLowerCase();
    // eslint-disable-next-line no-control-regex
    if (/[^\u0000-\u007f]/.test(s)) s = s.normalize("NFD").replace(/\p{M}+/gu, "").replace(/œ/g, "oe").replace(/æ/g, "ae").replace(/[’‘]/g, "'");
  } else {
    s = s.normalize("NFKC").toLowerCase().replace(/[’‘]/g, "'");
  }
  return s;
}

/** Arabic letters in a token (Latin tokens inside an Arabic text are never stripped). */
const isArabicWord = (t: string) => /^[ء-ي]+$/.test(t);

/** The proclitic stripped when ≥ 3 letters remain ("بالدانتيل" → "دانتيل", "والزيت" → "زيت"). */
export function arClitic(token: string): string {
  if (!isArabicWord(token)) return token;
  for (const p of AR_PREFIXES) if (token.startsWith(p) && token.length - p.length >= 3) return token.slice(p.length);
  return token;
}

/** Clitic, then one suffix stripped when ≥ 3 letters remain ("منتجاتنا" → "منتجات" → "منتج"). */
export function arStem(token: string): string {
  let t = arClitic(token);
  if (!isArabicWord(t)) return t;
  for (let pass = 0; pass < 2; pass++) {
    const s = AR_SUFFIXES.find((x) => t.endsWith(x) && t.length - x.length >= 3);
    if (!s) break;
    t = t.slice(0, -s.length);
  }
  return t;
}

/** The verb key: the stem with one conjugation prefix dropped when ≥ 3 letters remain ("يكتشف" / "تكتشف" → "كتشف"). */
export function arVerbStem(token: string): string {
  const t = arStem(token);
  const p = AR_VERB_PREFIXES.find((x) => t.startsWith(x) && t.length - x.length >= 3);
  return p ? t.slice(p.length) : t;
}

/** The French lemma of a display token ("découvrez" → "decouvr", "révolutionnaires" → "revolutionnair"). */
export function frLemma(token: string): string {
  if (token.length < 5 || !/^\p{L}+$/u.test(token)) return token;
  for (const s of FR_SUFFIXES) if (token.endsWith(s) && token.length - s.length >= 4) return token.slice(0, -s.length);
  return token;
}

/** The English light stem ("elevates", "elevated", "elevating" → "elevat"; "curated" → "curat"). */
export function enStem(token: string): string {
  if (token.length < 4 || !/^\p{L}+$/u.test(token)) return token;
  let t = token;
  for (const s of EN_SUFFIXES) {
    if (t.endsWith(s) && t.length - s.length >= 3) {
      t = s === "ies" || s === "ied" ? `${t.slice(0, -s.length)}y` : t.slice(0, -s.length);
      break;
    }
  }
  return t.length > 3 && t.endsWith("e") ? t.slice(0, -1) : t;
}

/** The matching keys of one display token: its surface and its stems (DES-§9.1 matching form). */
export function matchKeys(token: string, locale: Locale | TextLocale): string[] {
  const l = textLocale(locale);
  if (token.startsWith("§")) return [token];
  if (l === "ar") {
    if (!isArabicWord(token)) return [...new Set([token, enStem(token)])];
    return [...new Set([token, arClitic(token), arStem(token), arVerbStem(token)])];
  }
  return [...new Set([token, l === "fr" ? frLemma(token) : enStem(token)])];
}

export interface TokenOpts {
  /** the product name: its tokens become one `§p` */
  product?: string | null;
}

/** `{product}` / `{product:ce}` → `§p`; any other slot (`{delivery}`, `{where}`, `{wa:…}`) → `§s` */
const SLOT =/\{(product)(?::[a-z]+)?\}|\{[a-z]+(?::[^{}]*)?\}/g;

/** The raw display tokens of a text (no product masking). */
function rawTokens(text: string, l: TextLocale): string[] {
  let s = text.includes("{") ? text.replace(SLOT, (_m, p: string | undefined) => (p ? " §p " : " §s ")) : text;
  if (s.includes("*")) s = s.replace(/\*+/g, "");
  s = normalizeDisplay(s, l);
  if (l === "fr" && s.includes("'")) s = s.replace(FR_ELISIONS, "$1' ");
  // digits glued to a unit ("50ml", "24h") are two tokens
  if (/\d/.test(s)) s = s.replace(/(\d)(\p{L})/gu, "$1 $2").replace(/(\p{L})(\d)/gu, "$1 $2");
  const out: string[] = [];
  for (const raw of s.split(/[^\p{L}\p{N}§'.,]+/u)) {
    if (!raw) continue;
    // a decimal comma or point stays inside a number; elsewhere it splits
    const parts = /[.,]/.test(raw) ? raw.split(/(?<!\d)[.,]|[.,](?!\d)/) : [raw];
    for (const part of parts) {
      // quotes around a word go; the elided article keeps its apostrophe ("l'", "qu'")
      const t = !part.includes("'") ? part : l === "fr" && FR_ELIDED.test(part) ? part : part.replace(/^'+|'+$/g, "");
      if (!t) continue;
      out.push(t.charCodeAt(0) <= 57 && /^\d+(?:[.,]\d+)?$/.test(t) ? "§n" : t);
    }
  }
  return out;
}

/** Leading French / English articles of a product name typed with one ("L'huile d'argan" → "huile d'argan"). */
const NAME_ARTICLES = new Set(["l'", "le", "la", "les", "the", "un", "une", "a", "an"]);

/**
 * The display tokens (DES-§9.1, all rows): product name → `§p` (one token per occurrence, Arabic compared after its
 * clitic, so "بزيت الأركان" masks too), numbers → `§n`, slots → `§s`.
 */
export function tokens(text: string, locale: Locale | TextLocale, opts: TokenOpts = {}): string[] {
  const l = textLocale(locale);
  const out = rawTokens(text, l);
  const name = opts.product ? rawTokens(opts.product, l).filter((t) => t !== "§n") : [];
  while (name.length > 1 && NAME_ARTICLES.has(name[0]!)) name.shift();
  if (!name.length) return out;
  const key = (t: string) => (l === "ar" ? arClitic(t) : t);
  const nk = name.map(key);
  const masked: string[] = [];
  for (let i = 0; i < out.length; i++) {
    if (nk.every((k, j) => out[i + j] !== undefined && key(out[i + j]!) === k)) {
      masked.push("§p");
      i += nk.length - 1;
    } else masked.push(out[i]!);
  }
  return masked;
}

/** Words of a text (for rhythm and per-100-word rates): Unicode letter / number runs, markup and slots ignored. */
export function wordCount(text: string): number {
  return (text.replace(SLOT, " x ").replace(/\*+/g, "").match(/[\p{L}\p{N}]+(?:['’][\p{L}]+)?/gu) ?? []).length;
}

/** Sentences of a text (split after . ! ? ؟ and line breaks; a decimal point stays). */
export function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?؟…])\s+|(?<=[.!?؟])(?=\p{L})|\n+/u)
    .map((s) => s.trim())
    .filter((s) => /[\p{L}\p{N}]/u.test(s));
}

const ARABIC = /[؀-ۿ]/;
const FR_HINT = /[àâçéèêëîïôûùüÿœæ]|\b(le|la|les|des|du|une|vous|votre|vos|pour|avec|sans|est|et|qui|que|dans|sur|au|aux|en|ce|cette|ces)\b|\b[ldjnsc]'/i;
const EN_HINT = /\b(the|you|your|with|for|and|is|are|of|to|it|this|that|in|on|at|from)\b/i;

/** The locale a line is written in, from its script and its function words (the headline check has no locale). */
export function guessLocale(text: string): TextLocale {
  const letters = text.replace(/[^\p{L}]/gu, "");
  const ar = (letters.match(new RegExp(ARABIC.source, "g")) ?? []).length;
  if (ar * 2 >= letters.length && ar > 0) return "ar";
  const fr = (text.match(new RegExp(FR_HINT.source, "gi")) ?? []).length;
  const en = (text.match(new RegExp(EN_HINT.source, "gi")) ?? []).length;
  return fr > en ? "fr" : en > 0 ? "en" : FR_HINT.test(text) ? "fr" : "en";
}
