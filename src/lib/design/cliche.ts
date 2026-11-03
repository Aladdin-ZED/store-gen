/**
 * The cliché and specificity detector (P6 DESIGN; design.md DES-§9.3-§9.9, DG-07; docs/STORE-SAAS.md §K.2 P0 design
 * stubs). Pure and isomorphic. `clicheScore` (frozen signature, src/lib/contracts/r1-p0.ts) scores a text against
 * the ar / fr / en lexicons of ./lexicon in hits per 100 words, weighted: P7's guard v2 (rule 6) re-asks when hero +
 * benefits score above 1.0 or any weight-3 hit appears. The other exports are the copy part of the design gates:
 *
 *  - `structureOf` / `registerOf`: the heuristic taggers of DES-§9.5 (headline structure, ar register);
 *  - `specificity`: the share of hero + benefits sentences that name a fact, a merchant number, a sensory word or a
 *    cash-on-delivery fact (DES-§9.6);
 *  - `articleCheck`: the French article lint of D4 (a template against a `ProductRef`);
 *  - `numbersReport`: the D1 mirror (numbers the merchant did not give, conflicting figures); the refusal is landing's
 *    honesty gate;
 *  - `punctuate`: the repair table of DES-§9.7, generated text only (owner text is flagged, never rewritten);
 *  - `copyReport`: the C01-C09 / D3 / D4 items of one document by origin class (core §M.1 rule 2);
 *  - `shingles` / `jaccard`: the near-duplicate primitives (./text/shingles.ts); `inStoreReport` (C06) and
 *    `headlineItems` (C08, N05, the hard `design:N8`) read them and the cross-store verdicts by origin class.
 */
import { elides, type ProductRef } from "@/lib/ai/copy-library/product-ref";
import type { OriginClass } from "@/lib/db/schema";
import type { Locale, PageDoc } from "@/lib/page/schema";
import { textFieldsOf } from "@/lib/render/origin";
import type { DesignGateItem } from "./gates/types";
import type { HeadlineStructure } from "./genome";
import { AR, DARIJA_MARKERS, MSA_MARKERS } from "./lexicon/ar";
import { EN } from "./lexicon/en";
import { FR } from "./lexicon/fr";
import type { LexEntry, LocaleLexicon } from "./lexicon/types";
import { arClitic, arFold, arStem, arVerbStem, asciiDigits, matchKeys, sentences, textLocale, tokens, wordCount, type TextLocale } from "./text/normalize";

import { jaccard, shingles as shinglesOf } from "./text/shingles";

export { jaccard, shingles } from "./text/shingles";

/** p = the matched lexicon entry, w = its weight, k = what matched, at = the character offset in the text */
export interface ClicheHit {
  p: string;
  w: 1 | 2 | 3;
  k: "word" | "phrase" | "frame";
  at: number;
}

/** The copy part of a gate report (DES-§9.9, rev 2 shape). */
export interface CopyReport {
  cliche: number;
  spec: number;
  items: DesignGateItem[];
  dashes: number;
  bangs: number;
  registerBreaches: number;
  numbers: { unknown: { field: string; value: string }[]; conflicts: { value: string; fields: string[] }[] };
}

export const LEXICONS: Readonly<Record<TextLocale, LocaleLexicon>> = { ar: AR, fr: FR, en: EN };

/* ------------------------------------------------------------------ */
/* the matcher                                                         */
/* ------------------------------------------------------------------ */

/** One token of a compiled entry: the keys it accepts, or a gap of 1-6 tokens. */
type PatTok = { gap: true } | { gap: false; accept: ReadonlySet<string> };
interface Compiled {
  entry: LexEntry;
  pat: PatTok[];
}

/** The keys an entry token accepts, by its inflection class (DES-§9.3 rev 3). */
function acceptKeys(tok: string, entry: LexEntry, l: TextLocale, first: boolean): string[] {
  const keys = matchKeys(tok, l);
  const alt = first && entry.alt ? entry.alt.flatMap((a) => tokens(a, l).flatMap((t) => matchKeys(t, l))) : [];
  if (l === "ar" && /^[ء-ي]+$/.test(tok)) {
    // fixed: the surface and its clitic form only; n: plus the stem; v: plus the verb key
    const out = entry.infl === "fixed" ? [tok, arClitic(tok)] : entry.infl === "v" ? [tok, arClitic(tok), arStem(tok), arVerbStem(tok)] : [tok, arClitic(tok), arStem(tok)];
    return [...out, ...alt];
  }
  return entry.infl === "fixed" ? [keys[0]!, ...alt] : [...keys, ...alt];
}

/** One locale's entries compiled, indexed by the keys their first token accepts (built once at module load). */
function compileLocale(l: TextLocale): ReadonlyMap<string, readonly Compiled[]> {
  const index = new Map<string, Compiled[]>();
  for (const entry of LEXICONS[l].cliches) {
    const pat: PatTok[] = [];
    entry.p.split("…").forEach((part, i) => {
      if (i > 0) pat.push({ gap: true });
      tokens(part, l).forEach((t, j) => pat.push({ gap: false, accept: new Set(acceptKeys(t, entry, l, pat.length === 0 && j === 0)) }));
    });
    const first = pat[0];
    if (!first || first.gap) continue;
    for (const k of first.accept) index.set(k, [...(index.get(k) ?? []), { entry, pat }]);
  }
  return index;
}
const COMPILED: ReadonlyMap<TextLocale, ReadonlyMap<string, readonly Compiled[]>> = new Map((["ar", "fr", "en"] as const).map((l) => [l, compileLocale(l)]));

/** Tokens of a text with their matching keys (the offsets are computed for hits only). */
function keyed(text: string, l: TextLocale): { t: string; keys: string[] }[] {
  return tokens(text, l).map((t) => ({ t, keys: matchKeys(t, l) }));
}

/** The character offset of the i-th display token (an estimate for masked tokens: the previous one's end). */
function offsetOf(text: string, l: TextLocale, toks: readonly { t: string }[], i: number): number {
  const lower = l === "ar" ? arFold(asciiDigits(text)).toLowerCase() : text.normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase();
  let from = 0;
  for (let j = 0; j <= i; j++) {
    const t = toks[j]!.t;
    const found = t.startsWith("§") ? -1 : lower.indexOf(t.replace(/'$/, ""), from);
    if (j === i) return found >= 0 ? found : from;
    if (found >= 0) from = found + t.length;
  }
  return 0;
}

function matchAt(pat: readonly PatTok[], toks: readonly { keys: string[] }[], i: number, p = 0): number {
  if (p === pat.length) return i;
  const pt = pat[p]!;
  if (pt.gap) {
    for (let g = 1; g <= 6 && i + g <= toks.length; g++) {
      const end = matchAt(pat, toks, i + g, p + 1);
      if (end >= 0) return end;
    }
    return -1;
  }
  const t = toks[i];
  if (!t || !t.keys.some((k) => pt.accept.has(k))) return -1;
  return matchAt(pat, toks, i + 1, p + 1);
}

/** Every lexicon hit of a text; overlapping hits keep the heaviest (then the longest). */
export function clicheHits(text: string, locale: Locale | TextLocale): ClicheHit[] {
  const l = textLocale(locale);
  const toks = keyed(text, l);
  const found: { hit: ClicheHit; from: number; to: number }[] = [];
  const index = COMPILED.get(l)!;
  for (let i = 0; i < toks.length; i++) {
    const cands = new Set(toks[i]!.keys.flatMap((k) => index.get(k) ?? []));
    for (const { entry, pat } of cands) {
      const end = matchAt(pat, toks, i);
      if (end > i) found.push({ hit: { p: entry.p, w: entry.w, k: entry.k, at: i }, from: i, to: end });
    }
  }
  found.sort((a, b) => b.hit.w - a.hit.w || b.to - b.from - (a.to - a.from) || a.from - b.from);
  const taken: boolean[] = [];
  const out: ClicheHit[] = [];
  for (const f of found) {
    let free = true;
    for (let i = f.from; i < f.to; i++) if (taken[i]) free = false;
    if (!free) continue;
    for (let i = f.from; i < f.to; i++) taken[i] = true;
    out.push({ ...f.hit, at: offsetOf(text, l, toks, f.from) });
  }
  return out.sort((a, b) => a.at - b.at);
}

/** Hits per 100 words, weighted (DES-§9.9; ai.md guard v2 rule 6 re-asks above 1.0 or on any weight-3 hit). */
export function clicheScore(text: string, locale: Locale): { score: number; hits: ClicheHit[] } {
  const hits = clicheHits(text, locale);
  if (!hits.length) return { score: 0, hits };
  const words = Math.max(1, wordCount(text));
  const score = Math.round(((hits.reduce((s, h) => s + h.w, 0) * 100) / words) * 100) / 100;
  return { score, hits };
}

/* ------------------------------------------------------------------ */
/* structure and register                                              */
/* ------------------------------------------------------------------ */

const EN_IMPERATIVE = new Set(["order", "try", "make", "keep", "give", "wear", "choose", "meet", "bring", "take", "get", "pay", "check", "feel", "let", "start", "add", "use", "carry", "pour", "set", "slip", "pick", "put", "open", "see", "smell", "touch", "taste", "cook", "clean", "store", "fold", "pack", "rinse", "apply", "warm", "build", "treat", "say", "go", "come", "look", "find", "plan", "leave", "hold", "share", "spend", "skip", "swap", "trust"]);
const FR_IMPERATIVE = /^(offrez|prenez|choisissez|faites|laissez|gardez|portez|essayez|commandez|payez|recevez|decouvrez|glissez|appliquez|versez|rangez|pliez|sentez|touchez|goutez|ouvrez|mettez|passez|ajoutez|composez|testez|comparez|gagnez|profitez|regardez|verifiez|confiez|osez|vivez|revenez|reprenez|accordez|habillez|cuisinez|nettoyez|rechargez|emportez|partagez|servez|soignez|arrosez|installez|branchez|enfilez|drapez|coiffez|rasez|massez)$/;
const AR_IMPERATIVE = new Set(["اطلب", "اطلبي", "اختر", "اختاري", "جرب", "جربي", "خلي", "خلّي", "دير", "ديري", "شوف", "شوفي", "خذ", "خدي", "خود", "احصل", "امنح", "استعمل", "استعملي", "ضع", "ضعي", "حط", "حطي", "رتب", "اغسل", "اشحن", "البس", "البسي", "قدم", "قدمي", "عيش", "عيشي", "تمتع", "اكتشف", "استمتع", "عاين", "خلص", "خلصي", "اشري", "شري", "صب", "صبي", "سخن", "دفي", "ادهن", "ادهني"]);
const CONTRAST = {
  en: /\b(less|more|not|no|without|never)\b[^.]*[.,;:]\s*(?:[\p{L}']+\s+){0,3}\b(more|less|but|just|only|yes|all|nothing)\b/iu,
  fr: /(?<!\p{L})(moins|plus|pas|sans|jamais|rien)(?!\p{L})[^.]*[.,;:]\s*(?:[\p{L}']+\s+){0,3}(plus|moins|mais|juste|seulement|tout|rien)(?!\p{L})/iu,
  ar: /(أقل|اقل|لا|بلا|بدون|ماشي|ليس)[^.،]*[.،:]\s*(?:[\p{L}]+\s+){0,3}(أكثر|اكثر|بل|غير|فقط|لا)/u,
};

/** The headline structure of a title (DES-§9.5 heuristic tagger; the library's explicit tags win over it). */
export function structureOf(title: string, locale: Locale): HeadlineStructure {
  const l = textLocale(locale);
  const t = title.replace(/\*+/g, "").trim();
  if (/[?؟]\s*$/.test(t) || /^[^.]{0,80}[?؟]/.test(t)) return "question";
  if (/^[«"“„]/.test(t) || /\s[-–—]\s*\p{Lu}[\p{L} .']+$/u.test(t)) return "quote-led";
  if (/^\d/.test(asciiDigits(t))) return "number-led";
  if (CONTRAST[l].test(t)) return "contrast-pair";
  const first = sentences(t)[0] ?? t;
  if (first !== t && wordCount(first) <= 2) return "word-subline";
  const w0 = (tokens(t, l)[0] ?? "").replace(/'$/, "");
  if (l === "en" && EN_IMPERATIVE.has(w0)) return "imperative";
  if (l === "fr" && FR_IMPERATIVE.test(w0)) return "imperative";
  if (l === "ar" && (AR_IMPERATIVE.has(w0) || AR_IMPERATIVE.has(arClitic(w0)))) return "imperative";
  return "noun-phrase";
}

const DARIJA: ReadonlySet<string> = new Set(DARIJA_MARKERS.map((m) => arFold(m)));
const MSA: ReadonlySet<string> = new Set(MSA_MARKERS.map((m) => arFold(m)));
/** the `كا` present prefix (كايدير, كاتعطي, كانصح): three letters at least after it */
const KA_PRESENT = /^كا[يتن][ء-ي]{3,}$/;
/** the `كـ` present prefix (كيناسبك, كنصيفطو): never before م or ا (كيميائي, كيان), 3-5 letters after it */
const K_PRESENT = /^ك[ين][^ماء-ئ][ء-ي]{2,4}$/;
/** MSA words the `كـ` shape would read as Darija */
const K_NOT: ReadonlySet<string> = new Set(["كيفيه", "كيفيات", "كيلوغرام", "كيلومتر", "كينيا", "كنيسه"]);
/** the `ما…ش` negation in one word (ماتفوتش, متخافش), five letters at least */
const MA_SH = /^م[ء-ي]{3,}ش$/;

/** Darija and MSA markers of one sentence (after the clitic stripping of DES-§9.1). */
export function registerMarkers(sentence: string): { darija: number; msa: number } {
  const toks = tokens(sentence, "ar");
  let darija = 0;
  let msa = 0;
  toks.forEach((t, i) => {
    const forms = [t, arClitic(t)];
    if (forms.some((f) => DARIJA.has(f)) || KA_PRESENT.test(t) || (K_PRESENT.test(t) && !K_NOT.has(t)) || MA_SH.test(t) || (t.endsWith("ش") && t.length >= 4 && (toks[i - 1] === "ما" || toks[i - 1] === "م"))) darija++;
    else if (forms.some((f) => MSA.has(f))) msa++;
  });
  return { darija, msa };
}

/** One sentence: ≥ 2 markers and a margin of 2, else `none` (compatible with either register). */
function sentenceRegister(s: string): "msa" | "darija" | "mixed" | "none" {
  const { darija, msa } = registerMarkers(s);
  if (darija >= 2 && msa >= 2) return "mixed";
  if (darija - msa >= 2) return "darija";
  if (msa - darija >= 2) return "msa";
  return "none";
}

/** The register of an Arabic text (DES-§9.4 register row): per sentence, then `mixed` when both appear. */
export function registerOf(text: string): "msa" | "darija" | "mixed" | "none" {
  const calls = sentences(text).map(sentenceRegister);
  if (calls.includes("mixed") || (calls.includes("darija") && calls.includes("msa"))) return "mixed";
  if (calls.includes("darija")) return "darija";
  if (calls.includes("msa")) return "msa";
  return "none";
}

/* ------------------------------------------------------------------ */
/* facts and specificity                                               */
/* ------------------------------------------------------------------ */

/**
 * What the merchant gave (DES-§9.6, §9.11): the facts as typed, the analysis materials and colours, the store's
 * delivery text and policies; the product name and price for the numbers. The core's `CopyFacts` (the facts alone,
 * src/lib/editor/facts.server.ts) is accepted wherever this is.
 */
export interface DesignCopyFacts {
  facts: readonly string[];
  materials?: readonly string[];
  productName?: string | null;
  price?: number | string | null;
  deliveryText?: string | null;
  /** cash-on-delivery, delivery and exchange lines of the store's policies */
  policies?: readonly string[];
}
export type FactsArg = readonly string[] | DesignCopyFacts;
const factsOf = (f: FactsArg): DesignCopyFacts => (Array.isArray(f) ? { facts: f as readonly string[] } : (f as DesignCopyFacts));

function numbersIn(s: string): string[] {
  return asciiDigits(s).match(/\d+(?:[.,]\d+)?/g)?.map((n) => n.replace(",", ".")) ?? [];
}

/**
 * The numbers the copy may mention: those the merchant gave (facts, name, price, delivery line). The same rule as
 * `allowedNumbers` of src/lib/ai/guard.ts (P7's one choke point, not exported yet: CCR r1-p6-8 asks for the export;
 * this mirror goes when it lands).
 */
export function merchantNumbers(facts: FactsArg): Set<string> {
  const f = factsOf(facts);
  const out = new Set<string>();
  const add = (s: string | number | null | undefined) => {
    if (s === null || s === undefined) return;
    for (const n of numbersIn(String(s))) {
      out.add(n);
      out.add(String(Number(n)));
    }
  };
  for (const x of f.facts) add(x);
  add(f.productName);
  add(f.price);
  add(f.deliveryText);
  return out;
}

const STOP: Readonly<Record<TextLocale, ReadonlySet<string>>> = {
  en: new Set(["the", "and", "with", "for", "you", "your", "our", "all", "are", "its", "this", "that", "from", "one", "has", "have", "not", "but", "per", "each", "into", "made", "very", "more", "less"]),
  fr: new Set(["les", "des", "une", "pour", "avec", "sans", "dans", "sur", "est", "son", "ses", "vos", "votre", "aux", "qui", "que", "plus", "par", "tout", "tous", "tres", "bien", "chaque", "fait", "faite", "sont", "leur", "nos", "notre", "cette", "ces"]),
  ar: new Set(["في", "من", "على", "مع", "عن", "الي", "هذا", "هذه", "ذلك", "كل", "او", "ثم", "التي", "الذي", "لكل", "بين", "عند", "بعد", "قبل", "ديال", "حتي", "غير"]),
};

/** Content keys of the merchant's facts and materials (tokens of ≥ 3 letters, not function words). */
function factKeys(f: DesignCopyFacts, l: TextLocale): Set<string> {
  const out = new Set<string>();
  for (const s of [...f.facts, ...(f.materials ?? [])])
    for (const t of tokens(s, l)) if (!t.startsWith("§") && t.replace(/'/g, "").length >= 3 && !STOP[l].has(t)) for (const k of matchKeys(t, l)) out.add(k);
  return out;
}

/** Cached keys of one locale's sensory list. */
const keySet = (words: readonly string[], l: TextLocale): ReadonlySet<string> => new Set(words.flatMap((w) => tokens(w, l)).flatMap((t) => matchKeys(t, l)));
const SENSE_KEYS: ReadonlyMap<TextLocale, ReadonlySet<string>> = new Map((["ar", "fr", "en"] as const).map((l) => [l, keySet(LEXICONS[l].senses, l)]));
const senseKeys = (l: TextLocale): ReadonlySet<string> => SENSE_KEYS.get(l)!;

const codKey = (t: string, l: TextLocale) => (l === "ar" ? arClitic(t) : t);
/** The COD / delivery phrases of each locale as display tokens (built once at module load). */
const COD_PHRASES: ReadonlyMap<TextLocale, readonly (readonly string[])[]> = new Map(
  (["ar", "fr", "en"] as const).map((l) => [l, LEXICONS[l].cod.map((phrase) => tokens(phrase, l).map((t) => codKey(t, l)))]),
);

/** A COD / delivery phrase of the locale, matched on display tokens in order. */
function hasCod(toks: readonly string[], l: TextLocale): boolean {
  const keys = toks.map((t) => codKey(t, l));
  return COD_PHRASES.get(l)!.some((p) => {
    for (let i = 0; i + p.length <= keys.length; i++) if (p.every((x, j) => keys[i + j] === x)) return true;
    return false;
  });
}

/** Whether a word is one of the locale's sensory words (DES-§9.6), on the matching keys. */
export function isSenseWord(word: string, locale: Locale | TextLocale): boolean {
  const l = textLocale(locale);
  const sk = senseKeys(l);
  return tokens(word, l).some((t) => matchKeys(t, l).some((k) => sk.has(k)));
}

/** The precomputed keys `sentenceSpecific` reads (one call per document or per compose request). */
export function specificityCache(facts: FactsArg, locale: Locale | TextLocale): { facts: Set<string>; numbers: Set<string> } {
  const f = factsOf(facts);
  return { facts: factKeys(f, textLocale(locale)), numbers: merchantNumbers(f) };
}

/** Whether one sentence is specific (DES-§9.6): a fact, a merchant number, a sensory word or a COD fact. */
export function sentenceSpecific(sentence: string, facts: FactsArg, locale: Locale | TextLocale, cache?: { facts: Set<string>; numbers: Set<string> }): boolean {
  const l = textLocale(locale);
  const f = factsOf(facts);
  const fk = cache?.facts ?? factKeys(f, l);
  const nums = cache?.numbers ?? merchantNumbers(f);
  const toks = tokens(sentence, l);
  const sk = senseKeys(l);
  for (const t of toks) {
    if (t.startsWith("§")) continue;
    for (const k of matchKeys(t, l)) if (fk.has(k) || sk.has(k)) return true;
  }
  if (/\d/.test(sentence) && numbersIn(sentence).some((n) => nums.has(n) || nums.has(String(Number(n))))) return true;
  return hasCod(toks, l);
}

const HERO_FIELDS = /^(title|headline|heading|subtitle|sub|lead|text)$/;
const BENEFIT_FIELDS = /^(title|lead|intro|items\.\d+\.(title|text))$/;

/** Hero and benefits sentences of a document (DES-§9.6). */
function specSentences(doc: PageDoc): string[] {
  const out: string[] = [];
  for (const s of doc.sections) {
    if (s.hidden || (s.type !== "hero" && s.type !== "benefits")) continue;
    const re = s.type === "hero" ? HERO_FIELDS : BENEFIT_FIELDS;
    for (const [path, v] of textFieldsOf({ ...doc, sections: [s] })) if (re.test(path.slice(s.id.length + 1)) && v.trim()) out.push(...sentences(v));
  }
  return out;
}

/** spec = specific / total over the hero + benefits sentences (0-1; 1 for a page without any). */
export function specificity(doc: PageDoc, facts: FactsArg): number {
  const l = textLocale(doc.locale);
  const all = specSentences(doc);
  if (!all.length) return 1;
  const f = factsOf(facts);
  const cache = { facts: factKeys(f, l), numbers: merchantNumbers(f) };
  return Math.round((all.filter((s) => sentenceSpecific(s, f, l, cache)).length / all.length) * 1000) / 1000;
}

/* ------------------------------------------------------------------ */
/* articles (D4) and numbers (D1)                                      */
/* ------------------------------------------------------------------ */

const DET_BEFORE = () => /(?<![\p{L}'])(ce|cet|cette|le|la|les|du|de la|un|une|des|au|aux)\s+\{product\}/giu;
const DET_SLOT: Readonly<Record<string, string>> = { ce: "ce", cet: "ce", cette: "ce", le: "le", la: "le", les: "le", du: "de", "de la": "de", des: "de", un: "un", une: "un", au: "a", aux: "a" };

/**
 * The French article lint (DES-§9.5 D4): a determiner written before a bare `{product}`, a gendered slot without a
 * known gender, a contraction the typed article breaks ("à le sérum"), a missing elision ("de huile"), or the
 * inverted subject "Ce que change {product}". `fixed` = the template with gendered slots, or null when only the
 * name-free alternative can fix it (the gender is unknown).
 */
export function articleCheck(template: string, ref: ProductRef): { ok: boolean; fixed: string | null } {
  let fixed = template;
  let ok = true;
  if (DET_BEFORE().test(template)) {
    ok = false;
    fixed = fixed.replace(DET_BEFORE(), (_m, det: string) => {
      const slot = DET_SLOT[det.toLowerCase()] ?? "le";
      return slot === "a" ? "{product:a}" : `{product:${slot}}`;
    });
  }
  const inverted = /\bce que \p{L}+ \{product\}/iu;
  if (inverted.test(fixed)) {
    ok = false;
    fixed = fixed.replace(/(\bce que \p{L}+ )\{product\}/iu, "$1{product:ce}");
  }
  if (ref.article && /(?<![\p{L}'])(à|de)\s+\{product\}/iu.test(fixed)) {
    ok = false;
    fixed = fixed.replace(/(?<![\p{L}'])(à|de)\s+\{product\}/giu, (_m, p: string) => (p.toLowerCase() === "à" ? "{product:a}" : "{product:de}"));
  }
  if (!ref.article && elides(ref.text) && /(?<![\p{L}'])(de|que)\s+\{product\}/iu.test(fixed)) {
    ok = false;
    fixed = fixed.replace(/(?<![\p{L}'])(de|que)\s+\{product\}/giu, (_m, w: string) => `${w.toLowerCase() === "que" ? "qu" : "d"}'{product}`);
  }
  const gendered = /\{product:(le|ce|de|un|a)\}/.test(fixed);
  if (gendered && !ref.gender) return { ok: false, fixed: null };
  return { ok, fixed: ok ? null : fixed };
}

/** A number and the word after it ("50 ml" → ["50", "ml"]). */
function figures(s: string): { value: string; unit: string }[] {
  const out: { value: string; unit: string }[] = [];
  const re = /(\d+(?:[.,]\d+)?)\s*(%|[\p{L}]+)?/gu;
  for (const m of asciiDigits(s).matchAll(re)) out.push({ value: m[1]!.replace(",", "."), unit: (m[2] ?? "").toLowerCase() });
  return out;
}

/** Copy fields of a document (title-, lead- and body-like leaves; ids, icons and settings left out). */
const COPY_KEY = /(^|\.)(title|headline|heading|kicker|eyebrow|lead|subtitle|sub|intro|description|text|body|story|paragraph|q|a|pain|fix|solution|answer|quote|caption|note|label|reassurance|submitLabel|ctaLabel|buttonLabel|button|tagline|bigWord|us|them|message)$/;
export function copyFieldsOf(doc: PageDoc): Map<string, string> {
  const out = new Map<string, string>();
  for (const [path, v] of textFieldsOf(doc)) if (COPY_KEY.test(path) && v.trim()) out.set(path, v);
  return out;
}

/**
 * The D1 mirror (DES-§9.11): numbers in copy fields the merchant did not give (`unknown`), and one unit given two
 * values on the page (`conflicts`: "50 ml" here, "100 ml" there). Landing's honesty gate refuses; this feeds Q and
 * the wizard repair.
 */
export function numbersReport(doc: PageDoc, facts: FactsArg): { unknown: { field: string; value: string }[]; conflicts: { value: string; fields: string[] }[] } {
  const allowed = merchantNumbers(factsOf(facts));
  const unknown: { field: string; value: string }[] = [];
  const byUnit = new Map<string, Map<string, string[]>>();
  for (const [field, text] of copyFieldsOf(doc)) {
    for (const { value, unit } of figures(text)) {
      if (!allowed.has(value) && !allowed.has(String(Number(value)))) unknown.push({ field, value });
      if (!unit) continue;
      const m = byUnit.get(unit) ?? new Map<string, string[]>();
      m.set(value, [...(m.get(value) ?? []), field]);
      byUnit.set(unit, m);
    }
  }
  const conflicts: { value: string; fields: string[] }[] = [];
  for (const [unit, values] of byUnit) if (values.size > 1) for (const [v, fields] of values) conflicts.push({ value: `${v} ${unit}`, fields });
  return { unknown, conflicts };
}

/* ------------------------------------------------------------------ */
/* punctuation (DES-§9.7)                                              */
/* ------------------------------------------------------------------ */

const capitalise = (s: string) => s.replace(/^(\s*[*«"“]*)(\p{Ll})/u, (_m, pre: string, c: string) => pre + c.toUpperCase());

/**
 * The punctuation repair table of DES-§9.7 (generated text only; the panel's "Fix punctuation" applies it to owner
 * text after a click): clause dashes → `،` / `. ` / `, `, a dash before an explanation → `:`, an attribution dash →
 * `- `, ranges → `10-20`, the 2nd and later `!` → `.`, the 2nd and later `·` in a line → `، ` / `, `.
 */
export function punctuate(text: string, locale: Locale | TextLocale): string {
  const l = textLocale(locale);
  let s = text.replace(/(\d)\s*[–—]\s*(\d)/g, "$1-$2");
  s = s.replace(/^\s*[—–]\s*/gm, "- ");
  // a dash before a list or an explanation (the rest of the line starts a list or is short and ends the line)
  s = s.replace(/\s+[—–]\s+(?=[^—–]*$)/g, (m, at: number, all: string) => {
    const rest = all.slice(at + m.length);
    const words = wordCount(rest);
    const before = all.slice(0, at);
    if (/,/.test(rest) && words <= 8 && wordCount(before) >= 2) return l === "fr" ? " : " : ": ";
    if (l === "ar") return words >= 6 ? ". " : "، ";
    return words <= 4 ? ", " : ". ";
  });
  // remaining clause dashes
  s = s.replace(/\s*[—–]\s*/g, (m, at: number, all: string) => {
    const words = wordCount(all.slice(at + m.length).split(/[.!?؟]/)[0] ?? "");
    if (l === "ar") return words >= 6 ? ". " : "، ";
    return words <= 4 ? ", " : ". ";
  });
  // sentence starts after a full stop take a capital (fr / en)
  if (l !== "ar") s = s.replace(/([.!?]\s+)(\p{Ll})/gu, (_m, p: string, c: string) => p + c.toUpperCase());
  let bang = 0;
  s = s.replace(/!/g, () => (bang++ === 0 ? "!" : "."));
  s = s
    .split("\n")
    .map((line) => {
      let dot = 0;
      return line.replace(/\s*·\s*/g, (m) => (dot++ === 0 ? m : l === "ar" ? "، " : ", "));
    })
    .join("\n");
  return capitalise(s.replace(/\s{2,}/g, " ").replace(/\s+([,.،])/g, "$1"));
}

/* ------------------------------------------------------------------ */
/* the copy report                                                     */
/* ------------------------------------------------------------------ */

const TITLE_KEY = /(^|\.)(title|headline|heading)$/;

/** Article faults in rendered French copy (D4): "à le", "de les", a doubled article, a missing elision ("de huile"). */
export function articleFaults(text: string): string[] {
  const out: string[] = [];
  const t = text.replace(/\*+/g, "").replace(/’/g, "'");
  for (const re of [/(?<![\p{L}'])(à|de) (le|les) /giu, /(?<![\p{L}'])(le|la|ce|cet|cette|du|un|une|au|aux) (l'|le |la |les )/giu])
    for (const m of t.matchAll(re)) out.push(m[0].trim());
  for (const m of t.matchAll(/(?<![\p{L}'])(de|que|le|la) (\p{Ll}[\p{L}-]*)/gu)) if (elides(m[2]!)) out.push(m[0]);
  return out;
}

const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}]/u;
const DASH = /[—–]/g;
const GENERATED: ReadonlySet<OriginClass> = new Set(["engine", "local", "cloud"]);

/** Three adjectives or nouns joined by commas and one and / et / و in one sentence (the triad, C03). */
function isTriad(sentence: string, l: TextLocale): boolean {
  const and = l === "ar" ? "و" : l === "fr" ? "et" : "and";
  const re = l === "ar" ? /^[^،,]{1,24}[،,]\s*[^،,]{1,24}[،,]?\s*و[^،,]{1,24}$/ : new RegExp(`^[^,]{1,24},\\s*[^,]{1,24},?\\s+${and}\\s+[^,]{1,24}$`, "i");
  return sentence.split(/[.:;!?؟]/).some((part) => re.test(part.replace(/\*+/g, "").trim()) && wordCount(part) <= 9);
}
const NOT_JUST = { en: /\bnot (just|only) (a |an )?[\p{L} ]+[,.;]/iu, fr: /\bplus qu['’]une? [\p{L} ]+[,.;]/iu, ar: /ليس(ت)? مجرد|ماشي غير/ };

/**
 * The copy items of one document (DES-§9.4, C01-C09, D3, D4) by origin class (core §M.1 rule 2: `origin` = the
 * field path → class map of `originFrom`; with none every field is `library`). Generated `!` beyond the first and
 * generated FAQ register breaks are hard; owner text is flagged soft, never rewritten.
 */
export function copyReport(doc: PageDoc, facts: FactsArg, origin: ReadonlyMap<string, OriginClass> | null): CopyReport {
  const l = textLocale(doc.locale);
  const fields = copyFieldsOf(doc);
  const items: DesignGateItem[] = [];
  const classOf = (path: string): OriginClass => origin?.get(path) ?? "library";
  const sectionOf = (path: string) => path.split(".")[0];
  let dashes = 0;
  let bangs = 0;
  let clicheWeight = 0;
  let words = 0;
  let registerBreaches = 0;
  const titles: { path: string; text: string }[] = [];
  let triads = 0;
  for (const [path, text] of fields) {
    words += wordCount(text);
    const d = (text.match(DASH) ?? []).length;
    if (d) {
      dashes += d;
      items.push({ id: "C01", level: "soft", section: sectionOf(path), field: path, penalty: 1, msg: "design.copy.C01" });
    }
    bangs += (text.match(/!/g) ?? []).length;
    const hits = clicheHits(text, l);
    for (const h of hits) {
      clicheWeight += h.w;
      items.push({ id: "C02", level: "soft", section: sectionOf(path), field: path, penalty: h.w, msg: "design.copy.C02", vars: { phrase: h.p } });
    }
    if ((text.match(/·/g) ?? []).length > 1 || (TITLE_KEY.test(path) && text.includes("·"))) items.push({ id: "C07", level: "soft", section: sectionOf(path), field: path, penalty: 1, msg: "design.copy.C07" });
    if (EMOJI.test(text)) items.push({ id: "C09", level: "hard", section: sectionOf(path), field: path, penalty: 15, msg: "design.copy.C09" });
    if (NOT_JUST[l].test(text)) items.push({ id: "C03", level: "soft", section: sectionOf(path), field: path, penalty: 2, msg: "design.copy.C03", vars: { kind: "not-just" } });
    if (sentences(text).some((s) => isTriad(s, l))) triads++;
    if (TITLE_KEY.test(path)) titles.push({ path, text });
    if (l === "fr" && articleFaults(text).length) items.push({ id: "D4", level: "soft", section: sectionOf(path), field: path, penalty: 2, msg: "design.copy.D4" });
  }
  if (triads > 1) items.push({ id: "C03", level: "soft", penalty: 2, msg: "design.copy.C03", vars: { kind: "triad", count: triads } });
  // sameness and questions over the in-flow titles (N8 structure rule)
  const structs = titles.map((t) => structureOf(t.text, doc.locale));
  if (titles.length >= 3) {
    const top = Math.max(...[...new Set(structs)].map((s) => structs.filter((x) => x === s).length));
    if (new Set(structs).size === 1 || top / titles.length > 0.4 || (titles.length >= 8 && new Set(structs).size < 4))
      items.push({ id: "C03", level: "soft", penalty: 2, msg: "design.copy.C03", vars: { kind: "sameness", count: new Set(structs).size } });
  }
  const questions = structs.filter((s) => s === "question").length;
  if (questions > 2) items.push({ id: "C03", level: "soft", penalty: 2, msg: "design.copy.C03", vars: { kind: "questions", count: questions } });
  if (bangs > 1) {
    const generated = [...fields].some(([p, t]) => t.includes("!") && GENERATED.has(classOf(p)));
    items.push({ id: "C05", level: generated ? "hard" : "soft", penalty: generated ? 15 : 2, msg: "design.copy.C05", vars: { count: bangs } });
  }
  // the specificity target (C04)
  const spec = specificity(doc, facts);
  if (spec < 0.5) items.push({ id: "C04", level: "soft", penalty: Math.round((0.5 - spec) * 20), msg: "design.copy.C04", vars: { spec: Math.round(spec * 100) } });
  // the FAQ register pairs (D3, ar pages)
  if (l === "ar") {
    for (const [path, q] of fields) {
      const m = /^(.*\.items\.\d+)\.q$/.exec(path);
      if (!m) continue;
      const a = fields.get(`${m[1]}.a`);
      if (!a) continue;
      const rq = registerOf(q);
      const ra = registerOf(a);
      if ((rq === "msa" && ra === "darija") || (rq === "darija" && ra === "msa")) {
        registerBreaches++;
        const generated = GENERATED.has(classOf(path)) || GENERATED.has(classOf(`${m[1]}.a`));
        items.push({ id: "D3", level: generated ? "hard" : "soft", section: sectionOf(path), field: path, penalty: generated ? 15 : 2, msg: "design.copy.D3" });
      }
    }
  }
  const numbers = numbersReport(doc, facts);
  if (numbers.unknown.length) items.push({ id: "D1", level: "info", penalty: 0, msg: "design.copy.D1", vars: { count: numbers.unknown.length } });
  return { cliche: Math.round(((clicheWeight * 100) / Math.max(1, words)) * 100) / 100, spec, items, dashes, bangs, registerBreaches, numbers };
}

/* ------------------------------------------------------------------ */
/* near-duplicate headlines (DES-§9.8)                                 */
/* ------------------------------------------------------------------ */

const HEADLINE_PATH = /^[^.]+\.(title|headline|heading|lead|subtitle|sub|intro|description)$/;

/** The title and lead shingles of one page (the product name masked). */
export function pageShingles(doc: PageDoc): Set<string> {
  const out = new Set<string>();
  for (const [path, text] of copyFieldsOf(doc)) if (HEADLINE_PATH.test(path)) for (const g of shinglesOf(text, doc.locale, { product: doc.product.name })) out.add(g);
  return out;
}

/**
 * The in-store check (DES-§9.8, C06): the page's title + lead shingles against each other page of the store (the
 * store's own documents, no table). Above 0.5 Jaccard, the generated lines are listed for a recompose (`resample`) and
 * the owner's flagged (C06 soft −2), never rewritten.
 */
export function inStoreReport(doc: PageDoc, siblings: readonly PageDoc[], origin: ReadonlyMap<string, OriginClass> | null): { jaccard: number; resample: string[]; items: DesignGateItem[] } {
  const own = pageShingles(doc);
  const jac = Math.max(0, ...siblings.map((s) => jaccard(own, pageShingles(s))));
  if (jac <= 0.5) return { jaccard: jac, resample: [], items: [] };
  const resample: string[] = [];
  const items: DesignGateItem[] = [];
  for (const [path] of copyFieldsOf(doc)) {
    if (!HEADLINE_PATH.test(path)) continue;
    const o = origin?.get(path) ?? "library";
    if (GENERATED.has(o) || o === "library") resample.push(path);
    else items.push({ id: "C06", level: "soft", section: path.split(".")[0], field: path, penalty: 2, msg: "design.copy.C06" });
  }
  return { jaccard: jac, resample, items };
}

/**
 * The cross-store verdicts as items by origin (DES-§9.8, N8, core §M.4): an owner line `close` is the soft C08 (−1),
 * an owner or library line in the `high` band the soft N05 (−2) with the line focused, a generated line in it the hard
 * `design:N8` (the wizard recomposes first, so the owner never sees it). Nothing is rewritten for the owner.
 */
export function headlineItems(lines: readonly { path: string; verdict: "ok" | "close"; band: "low" | "mid" | "high" | null }[], origin: ReadonlyMap<string, OriginClass> | null): DesignGateItem[] {
  const out: DesignGateItem[] = [];
  for (const l of lines) {
    const o = origin?.get(l.path) ?? "library";
    const section = l.path.split(".")[0];
    if (l.band === "high") out.push(GENERATED.has(o) ? { id: "N8", level: "hard", section, field: l.path, penalty: 15, msg: "design.copy.N05" } : { id: "N05", level: "soft", section, field: l.path, penalty: 2, msg: "design.copy.N05" });
    else if (l.verdict === "close" && !GENERATED.has(o)) out.push({ id: "C08", level: "soft", section, field: l.path, penalty: 1, msg: "design.copy.C08" });
  }
  return out;
}
