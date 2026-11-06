/**
 * Guard for model-written copy. A model can drift: invent numbers ("98 % satisfied", "après deux semaines"), make
 * health claims, name a material it guessed from a photo, promise a delivery time or a call the store never promised,
 * mix languages, use hype words, dashes or emojis. Every field is checked on its own; a field that fails is dropped and
 * the hand-written library copy is used in its place.
 *
 *   const { copy, rejected, origin } = mergeAiCopy(library, aiJson, { locale, facts, productName, price });
 *
 * Guard v2 (ai.md AI-§D.2, the rule numbers below are its own):
 *   1. loose parse: `mergeAiCopy` reads `AiCopyLoose` key by key, slices every list to its strict maximum and keeps its
 *      minimum; "*" now means only "not an object";
 *   2. no WhatsApp line without a number (`hasWhatsapp: false`): a FAQ item or guarantee line is replaced by the
 *      library's line, item by item; any other field is rejected;
 *   3. policies, not promises (./guard-policies.ts), incl. the call-timing rule against `callingHours`;
 *   4. no links, e-mails or phone numbers;
 *   5. allowed numbers, number words included (./guard-numbers.ts);
 *   7. no material, origin or certification the merchant's words do not contain (./guard-claims.ts);
 *   9. no em or en dash: rewritten (a range becomes a hyphen, a break a comma or a period); one middle dot per line at
 *      most (10);
 *  11. the kicker budget: with `kickers` set, a section outside it loses its kicker, library or model (the hero keeps
 *      its own);
 *  12. closed vocabularies (`closedVocab`) for the Director's outputs;
 *  AI-06: `wordsAvoid`, the store's banned words; the ar output is spelt with the Darija guide and refuses other
 *  dialects' forms (prompts/darija-orthography.ts).
 * Rules 3, 4, 5's number words, 7, 9 and 10 and the Darija rules run in a v2 context (`isGuardV2`: any of the v2
 * fields set, as `finalizeCtxFor` always does); a context without them (today's callers) keeps the R1.0 rules.
 *
 * Pure & isomorphic.
 */
import type { Locale } from "@/lib/page/schema";
import type { StorePolicyFacts } from "@/lib/settings/keys/policies";
import type { CopyOrigin } from "./provider/types";
import { AiCopyLoose, KICKER_SECTIONS, PageCopy, isIconName, type AiCopy } from "./copy-schema";
import { fitText } from "./copy-library";
import { claimAllowed, claimsIn, foldWithMap } from "./guard-claims";
import { AllowedNumbers, TIME_FACTOR, numbersIn } from "./guard-numbers";
import { policyAllows, policyClaimsIn, policyNumbers } from "./guard-policies";
import { lintDarija, normalizeDarija } from "./prompts/darija-orthography";

/** What rule 3 knows of the calling window (FinalizeCtx.callingHours, built by finalizeCtxFor). */
export interface CallingHours {
  /** `shopperPromiseAllowed(w) ? hoursText(w, …) : null`: the only call-timing words a text may state */
  text: string | null;
  /** store.confirmation.withinHours; null = no promise */
  withinHours: number | null;
}

export interface GuardContext {
  locale: Locale;
  productName: string;
  /** merchant-provided facts — the only source of numbers the copy may use */
  facts: readonly string[];
  price?: number;
  deliveryText?: string | null;
  /** DES-R20 / AI-D26: the PageCopy sections allowed a kicker (design's CopyDirectives.kickers); absent = every section keeps its own */
  kickers?: ReadonlySet<string>;
  /** GEN-09: false = no line may send the visitor to WhatsApp */
  hasWhatsapp?: boolean;
  /** rule 3: the store's policy facts */
  policies?: StorePolicyFacts;
  /** rule 3: the page's real delivery fee is 0, or the offer has free shipping */
  freeShipping?: boolean;
  /** rule 3: the call-timing words a line may state */
  callingHours?: CallingHours;
  /** AI-06: the store's banned words (store_ai.voice.wordsAvoid) */
  wordsAvoid?: readonly string[];
  /** who wrote the fields the merge keeps (`MergeResult.origin`); default "local" (the browser worker) */
  origin?: "cloud" | "local";
  /** owner-typed store facts (ai_memory facts): numbers and claims allowed like the product facts */
  storeFacts?: readonly string[];
  /** aggregate tasks: the only other numbers a text may quote */
  numbers?: ReadonlySet<string>;
  /** the voice asked for Arabizi: the Latin-script Darija numerals count as numbers */
  arabizi?: boolean;
}

/* ------------------------------------------------------------------ */
/* Rules                                                               */
/* ------------------------------------------------------------------ */

/** Hype and empty marketing words (DESIGN.md §1.1) in en / fr / ar. */
const BANNED = [
  /\b(elevate|unlock|revolutioni[sz]e|revolutionary|game[- ]?changer|seamless(ly)?|cutting[- ]edge|next[- ]level|unleash|supercharge|world[- ]class|best[- ]in[- ]class)\b/i,
  /\b(r[ée]volutionnaire|r[ée]volutionne[rz]?|miracle|miraculeu(x|se)|magique|in[ée]dit|exceptionnel(le)?|incroyable|ultime)\b/i,
  /(ثوري|معجزة|سحري|خارق|لا مثيل له|الأفضل في العالم)/u,
];

/** Health / medical claims — never allowed on a COD landing page. */
const MEDICAL = [
  /\b(cure[sd]?|curing|heal(s|ed|ing)?|treat(s|ing)? (acne|eczema|psoriasis|pain|hair loss|infections?|diseases?)|diagnos\w*|diseases?|diabet\w*|cancer|infections?|prescription|clinically proven|doctor[- ]recommended|weight loss|burns? fat|anti[- ]hair[- ]loss)\b/i,
  /\b(gu[ée]ri[rt]?|gu[ée]rison|maladies?|diab[èe]te|cancer|infections?|m[ée]dicaments?|cliniquement prouv[ée]e?|perte de poids|maigri[rt]|br[ûu]le[rz]? les graisses|anti[- ]chute)\b/i,
  /(يعالج|يشفي|شفاء|مرض|السكري|سرطان|التهاب|دواء|مثبت طبيا|مثبت سريريا|إنقاص الوزن|تخسيس|حرق الدهون)/u,
];

/** The guard's word lists, for the eval scorers (src/lib/ai/eval/scorers.ts), which count hits on raw output too. */
export const GUARD_LISTS = { banned: BANNED, medical: MEDICAL } as const;

/** Rule 4: links and e-mail addresses (phone numbers fail the number rule unless the owner typed them). */
const LINK = /https?:\/\/|www\.|\b[\w.-]+\.(?:com|ma|fr|net|shop|store|org|io|co)\b/i;
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;
/** Rule 2: a line that sends the visitor to WhatsApp. */
const WHATSAPP = /whats\s?app|واتس|واتساب|ouatsap/i;

const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}]/gu;
const ARABIC_LETTER = /[\u0600-ۿݐ-ݿࢠ-\u08FF]/gu;
const LATIN_LETTER = /[A-Za-zÀ-ÿ]/gu;
/** em, en, figure and horizontal-bar dashes (rule 9) */
const DASH = /[\u2012\u2013\u2014\u2015\u2E3A\u2E3B]/;
/** middle dots and bullets used as separators (rule 10) */
const DOTS = /[\u00B7\u2022\u2219]/g;

/**
 * Rule 9, the local per-locale table (design's `punctuate` is not exported by its P0 stub): a range between figures
 * becomes a hyphen, a dash that opens or closes the line goes, a dash before a capital becomes a period, any other a
 * comma (ar "،").
 */
export function rewriteDashes(s: string, locale: Locale): string {
  if (!DASH.test(s)) return s;
  const comma = locale === "ar" ? "، " : ", ";
  return s
    .replace(/(\d)\s*[\u2012\u2013\u2014\u2015]\s*(\d)/g, "$1-$2")
    .replace(/^\s*[\u2012-\u2015\u2E3A\u2E3B]+\s*/, "")
    .replace(/\s*[\u2012-\u2015\u2E3A\u2E3B]+\s*$/, "")
    .replace(/\s*[\u2012-\u2015\u2E3A\u2E3B]+\s*(?=\p{Lu})/gu, ". ")
    .replace(/\s*[\u2012-\u2015\u2E3A\u2E3B]+\s*/g, comma);
}

/** Rule 10: one middle dot per line at most; a line with more reads as a list, so every dot becomes a comma. */
export function rationDots(s: string, locale: Locale): string {
  const comma = locale === "ar" ? "، " : ", ";
  return s
    .split("\n")
    .map((line) => ((line.match(DOTS)?.length ?? 0) > 1 ? line.replace(/\s*[\u00B7\u2022\u2219]\s*/g, comma) : line))
    .join("\n");
}

/** The numbers a text may state: facts, store facts, the name, the price, the delivery line, the policies, the calling window. */
export function allowedNumbersFor(ctx: GuardContext): AllowedNumbers {
  const a = new AllowedNumbers();
  for (const f of ctx.facts) a.addText(f);
  for (const f of ctx.storeFacts ?? []) a.addText(f);
  a.addText(ctx.productName);
  if (ctx.price !== undefined) a.addValue(ctx.price);
  a.addText(ctx.deliveryText);
  for (const n of ctx.numbers ?? []) a.addValue(n);
  for (const p of policyNumbers(ctx.policies)) a.addValue(p.value, p.unit, p.factor);
  if (ctx.callingHours?.text) a.addText(ctx.callingHours.text);
  if (ctx.callingHours?.withinHours) a.addValue(ctx.callingHours.withinHours, "time", TIME_FACTOR.hour);
  return a;
}

/** The merchant's own words, where a claim noun (rule 7) must already appear. */
export const claimSources = (ctx: GuardContext) => [ctx.productName, ...ctx.facts, ...(ctx.storeFacts ?? []), ctx.deliveryText ?? ""].join(" \n ");

function avoidPattern(word: string): RegExp | null {
  const w = foldWithMap(word.trim()).f;
  if (w.length < 2) return null;
  const body = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  const pre = /[\u0600-ۿ]/.test(w) ? "(?:[وفبلك]?(?:ال)?)" : "";
  return new RegExp(`(?<![\\p{L}\\p{N}])${pre}${body}(?![\\p{L}\\p{N}])`, "u");
}

export type GuardReason =
  | "not_text"
  | "empty"
  | "banned"
  | "medical"
  | "link"
  | "whatsapp"
  | "words_avoid"
  | "dialect"
  | "number"
  | "claim"
  | "policy"
  | "language"
  | "too_long";

export interface GuardTextOpts {
  /** the number rule (default on); off for suggested facts, which are shown unticked and may quote a label */
  numbers?: boolean;
  /** the claim rule (default on); off for the analyze chips, which ARE the claims */
  claims?: boolean;
}

/**
 * A v2 context: one of guard v2's fields is set (`finalizeCtxFor` sets them all). An R1.0 context (none of them, the
 * shape today's callers pass) keeps the R1.0 rules exactly: digit runs compared by value, no claim, dialect, link,
 * dash or policy rule, an over-long text cut by `fitText`. A caller opts into guard v2 by passing what it knows.
 */
export function isGuardV2(ctx: GuardContext): boolean {
  return (
    ctx.kickers !== undefined ||
    ctx.hasWhatsapp !== undefined ||
    ctx.policies !== undefined ||
    ctx.freeShipping !== undefined ||
    ctx.callingHours !== undefined ||
    ctx.wordsAvoid !== undefined ||
    ctx.origin !== undefined ||
    ctx.storeFacts !== undefined ||
    ctx.numbers !== undefined ||
    ctx.arabizi !== undefined
  );
}

/**
 * Clean one model string and say why it fails. The text is normalised first (emoji, markup and control characters
 * out, "!" → "."; in a v2 context dashes rewritten, middle dots rationed and Darija spelt with the guide), then every
 * rule runs. In a v2 context a text longer than `max` is refused rather than cut: an ellipsis in a headline reads as a
 * bug.
 */
export function guardText(input: unknown, ctx: GuardContext, allowed: AllowedNumbers, max: number, opts: GuardTextOpts = {}): { ok: true; text: string } | { ok: false; reason: GuardReason } {
  if (typeof input !== "string") return { ok: false, reason: "not_text" };
  const v2 = isGuardV2(ctx);
  const raw = input.normalize("NFC");
  let s = (v2 ? rationDots(rewriteDashes(raw, ctx.locale), ctx.locale) : raw)
    .replace(EMOJI, "")
    .replace(/[<>{}[\]\\`|^~]/g, "")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/[!¡]+/g, ".")
    .replace(/\.{2,}/g, ".")
    .replace(/\s+([.,;:?؟،])/g, "$1")
    .replace(/([,،])(?=[.,،])/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[.,;:،]\s*/, "");
  if (!s) return { ok: false, reason: "empty" };
  // unbalanced *emphasis* markers → drop the markup, keep the words
  if ((s.match(/\*/g)?.length ?? 0) % 2 !== 0) s = s.replace(/\*/g, "");
  if (v2 && ctx.locale === "ar") {
    if (lintDarija(s).some((h) => h.kind === "dialect")) return { ok: false, reason: "dialect" };
    s = normalizeDarija(s);
  }
  if (BANNED.some((re) => re.test(s))) return { ok: false, reason: "banned" };
  if (MEDICAL.some((re) => re.test(s))) return { ok: false, reason: "medical" };
  if (v2 && (LINK.test(s) || EMAIL.test(s))) return { ok: false, reason: "link" };
  if (ctx.hasWhatsapp === false && WHATSAPP.test(s)) return { ok: false, reason: "whatsapp" };
  if (ctx.wordsAvoid?.length) {
    const folded = foldWithMap(s).f;
    if (ctx.wordsAvoid.some((w) => avoidPattern(w)?.test(folded))) return { ok: false, reason: "words_avoid" };
  }
  if (opts.numbers !== false) {
    // R1.0: digit runs compared by value; v2: number words too, with their unit class
    const tokens = numbersIn(s, ctx.locale, { arabizi: ctx.arabizi }).filter((t) => v2 || t.kind === "digit");
    for (const n of tokens) if (!allowed.allows(v2 ? n : { value: n.value, alt: n.alt, unit: null, base: n.value })) return { ok: false, reason: "number" };
  }
  if (v2 && opts.claims !== false) {
    const sources = claimSources(ctx);
    // every locale's list: a model writing French may still slip in an English "leather"
    for (const h of claimsIn(s)) if (!claimAllowed(h, sources)) return { ok: false, reason: "claim" };
  }
  if (v2) for (const c of policyClaimsIn(s, ctx.locale)) if (!policyAllows(c, ctx)) return { ok: false, reason: "policy" };
  if (languageOf(s, ctx.locale, ctx.productName) === false) return { ok: false, reason: "language" };
  if (v2 && s.length > max) return { ok: false, reason: "too_long" };
  return { ok: true, text: fitText(s, max) };
}

/**
 * The language rule on a text long enough to judge (≥ 12 letters; else null): an ar text is mostly Arabic letters (the
 * product name's Latin letters forgiven), any other locale has at most a quarter of Arabic letters beyond the name's.
 */
export function languageOf(s: string, locale: Locale, productName: string): boolean | null {
  const arabic = s.match(ARABIC_LETTER)?.length ?? 0;
  const latin = s.match(LATIN_LETTER)?.length ?? 0;
  const letters = arabic + latin;
  if (letters < 12) return null;
  const nameLatin = productName.match(LATIN_LETTER)?.length ?? 0;
  const nameArabic = productName.match(ARABIC_LETTER)?.length ?? 0;
  if (locale === "ar") return arabic >= (letters - Math.min(latin, nameLatin)) * 0.6;
  return arabic - nameArabic <= letters * 0.25;
}

/** Clean one model string; null when it breaks a rule (caller falls back to the library). */
export function cleanAiText(input: unknown, ctx: GuardContext, allowed: AllowedNumbers | ReadonlySet<string>, max: number, opts?: GuardTextOpts): string | null {
  const a = allowed instanceof AllowedNumbers ? allowed : [...allowed].reduce((acc, v) => acc.addValue(v), new AllowedNumbers());
  const r = guardText(input, ctx, a, max, opts);
  return r.ok ? r.text : null;
}

/** Rule 12: keep the values of a closed vocabulary, drop (and report) the others. */
export function closedVocab<T extends string>(values: readonly unknown[], vocab: readonly T[], onDrop?: (value: unknown) => void): T[] {
  const set = new Set<string>(vocab);
  const out: T[] = [];
  for (const v of values) {
    if (typeof v === "string" && set.has(v)) out.push(v as T);
    else onDrop?.(v);
  }
  return out;
}

export const inVocab = <T extends string>(value: unknown, vocab: readonly T[]): value is T => typeof value === "string" && (vocab as readonly string[]).includes(value);

/* ------------------------------------------------------------------ */
/* The copy fields                                                     */
/* ------------------------------------------------------------------ */

/** PageCopy maxima of the AiCopy scalars (the guard cleans to the page's real limits). */
const SCALAR_MAX = {
  tagline: 90,
  kicker: 60,
  headline: 110,
  sub: 220,
  cta: 40,
  problem_title: 110,
  solution: 190,
  cta_title: 110,
  cta_text: 200,
  story_title: 110,
  story: 700,
  seo_title: 70,
  seo_description: 165,
} as const satisfies Partial<Record<keyof AiCopy, number>>;
type ScalarKey = keyof typeof SCALAR_MAX;
type ListKey = "benefits" | "pains" | "steps" | "faq" | "guarantee" | "comparison" | "announcement" | "marquee";

type Benefit = AiCopy["benefits"][number];
type Pain = AiCopy["pains"][number];
type Step = AiCopy["steps"][number];
type Qa = AiCopy["faq"][number];
type Row = AiCopy["comparison"][number];
interface ListValues {
  benefits: Benefit;
  pains: Pain;
  steps: Step;
  faq: Qa;
  guarantee: string;
  comparison: Row;
  announcement: string;
  marquee: string;
}
/** an item of a cleaned list; `ai: false` = the library's line took its place (rule 2) */
type Item<T> = { v: T; ai: boolean };

/** strict maximum (slice) and merge minimum of each list (today's minima) */
const LISTS: { [K in ListKey]: { max: number; min: number } } = {
  benefits: { max: 5, min: 4 },
  pains: { max: 4, min: 3 },
  steps: { max: 3, min: 3 },
  faq: { max: 5, min: 5 },
  guarantee: { max: 3, min: 3 },
  comparison: { max: 4, min: 4 },
  announcement: { max: 3, min: 2 },
  marquee: { max: 6, min: 4 },
};

interface Cleaned {
  scalars: Partial<Record<ScalarKey, string>>;
  lists: { [K in ListKey]?: Item<ListValues[K]>[] };
  rejected: string[];
}

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** One item's fields through the guard: ok, rejected for WhatsApp only (the library's line may stand in), or failed. */
function guardItem<T extends Record<string, string>>(fields: { [K in keyof T]: [unknown, number] }, ctx: GuardContext, allowed: AllowedNumbers): { ok: true; v: T } | { ok: false; whatsapp: boolean } {
  const out = {} as T;
  let whatsapp = false;
  let failed = false;
  for (const [k, [value, max]] of Object.entries(fields) as [keyof T, [unknown, number]][]) {
    const r = guardText(value, ctx, allowed, max);
    if (r.ok) out[k] = r.text as T[keyof T];
    else if (r.reason === "whatsapp") whatsapp = true;
    else failed = true;
  }
  return failed || whatsapp ? { ok: false, whatsapp: whatsapp && !failed } : { ok: true, v: out };
}

/**
 * Every AiCopy key through the loose schema and the guard. `lib` (the merge) lets a library line take the place of a
 * WhatsApp FAQ item or guarantee line (rule 2); without it (the server's finalize) such an item is dropped.
 */
function cleanCopy(a: Record<string, unknown>, ctx: GuardContext, lib: PageCopy | null): Cleaned {
  const allowed = allowedNumbersFor(ctx);
  const out: Cleaned = { scalars: {}, lists: {}, rejected: [] };
  const shape = AiCopyLoose.shape;

  for (const key of Object.keys(SCALAR_MAX) as ScalarKey[]) {
    const parsed = shape[key].safeParse(a[key]);
    const r = parsed.success ? guardText(parsed.data, ctx, allowed, SCALAR_MAX[key]) : null;
    if (r?.ok) out.scalars[key] = r.text;
    else out.rejected.push(key);
  }

  const list = <K extends ListKey>(key: K, clean: (item: unknown, i: number) => { ok: true; v: ListValues[K] } | { ok: false; whatsapp: boolean }, libItems: readonly ListValues[K][] | null) => {
    const raw = key === "benefits" && Array.isArray(a[key]) ? (a[key] as unknown[]).map((b) => (isPlainObject(b) && !isIconName(b.icon) ? { ...b, icon: "check" } : b)) : a[key];
    const parsed = shape[key].safeParse(raw);
    if (!parsed.success) {
      out.rejected.push(key);
      return;
    }
    const items: Item<ListValues[K]>[] = [];
    (parsed.data as unknown[]).slice(0, LISTS[key].max).forEach((item, i) => {
      const r = clean(item, i);
      if (r.ok) items.push({ v: r.v, ai: true });
      else if (r.whatsapp) {
        out.rejected.push(`${key}.${i}`);
        const stand = libItems?.[i];
        if (stand !== undefined) items.push({ v: stand, ai: false });
      }
    });
    if (items.length < LISTS[key].min) out.rejected.push(key);
    else out.lists[key] = items as Cleaned["lists"][K];
  };

  list(
    "benefits",
    (b) => {
      const item = b as Benefit;
      const r = guardItem<{ title: string; text: string }>({ title: [item.title, 60], text: [item.text, 200] }, ctx, allowed);
      return r.ok ? { ok: true, v: { ...r.v, icon: isIconName(item.icon) ? item.icon : "check" } as Benefit } : r;
    },
    null,
  );
  list("pains", (p) => guardItem<Pain>({ pain: [(p as Pain).pain, 110], fix: [(p as Pain).fix, 110] }, ctx, allowed), null);
  list("steps", (s) => guardItem<Step>({ title: [(s as Step).title, 60], text: [(s as Step).text, 170] }, ctx, allowed), null);
  list("faq", (f) => guardItem<Qa>({ q: [(f as Qa).q, 110], a: [(f as Qa).a, 320] }, ctx, allowed), lib ? lib.faq.items : null);
  list(
    "guarantee",
    (g) => {
      const r = guardText(g, ctx, allowed, 130);
      return r.ok ? { ok: true, v: r.text } : { ok: false, whatsapp: r.reason === "whatsapp" };
    },
    lib ? lib.guarantee.lines : null,
  );
  list("comparison", (r) => guardItem<Row>({ label: [(r as Row).label, 70], us: [(r as Row).us, 60], them: [(r as Row).them, 60] }, ctx, allowed), null);
  // the first announcement is the store's COD line (a policy, never rewritten); a WhatsApp extra is simply left out
  list(
    "announcement",
    (s) => {
      const r = guardText(s, ctx, allowed, 60);
      return r.ok ? { ok: true, v: r.text } : { ok: false, whatsapp: false };
    },
    null,
  );
  list(
    "marquee",
    (s) => {
      const r = guardText(s, ctx, allowed, 28);
      return r.ok ? { ok: true, v: r.text } : { ok: false, whatsapp: false };
    },
    null,
  );
  return out;
}

/**
 * The server's finalize for `copy.page` (AI-§B.4, AI-§D.3): the guarded fields of a loose AiCopy, rejected keys left
 * out, lists sliced and their WhatsApp items dropped. The browser merges the result over its library with
 * `mergeAiCopy`, which reads a partial object key by key. null = not an object (`invalid_output`).
 */
export function guardAiCopy(ai: unknown, ctx: GuardContext): { value: Partial<AiCopy>; rejected: string[] } | null {
  if (!isPlainObject(ai)) return null;
  const c = cleanCopy(ai, ctx, null);
  const value: Partial<AiCopy> = { ...c.scalars };
  for (const [key, items] of Object.entries(c.lists) as [ListKey, Item<unknown>[]][]) (value as Record<string, unknown>)[key] = items.map((i) => i.v);
  return { value, rejected: c.rejected };
}

/* ------------------------------------------------------------------ */
/* Merge                                                               */
/* ------------------------------------------------------------------ */

export interface MergeResult {
  copy: PageCopy;
  /** AiCopy keys that were rejected and replaced by library copy ("faq.2": one item replaced, rule 2; "*": not an object) */
  rejected: string[];
  /** rev 4 (QUAL-1): who wrote each text leaf of `copy` ("hero.headline", "faq.items.0.q"): the model (ctx.origin) or the library */
  origin: Record<string, CopyOrigin>;
}

/** Rule 11: with a plan, a section outside it loses its kicker (library or model); the hero keeps its own. */
function applyKickerBudget(c: PageCopy, kickers: ReadonlySet<string> | undefined): PageCopy {
  if (!kickers) return c;
  for (const section of KICKER_SECTIONS) if (!kickers.has(section)) delete c[section].kicker;
  return c;
}

/** Every string leaf of `value` under `prefix`, as dot paths with array indices ("faq.items.0.q"). */
function leaves(value: unknown, prefix: string, out: string[] = []): string[] {
  if (typeof value === "string") out.push(prefix);
  else if (Array.isArray(value)) value.forEach((v, i) => leaves(v, `${prefix}.${i}`, out));
  else if (isPlainObject(value)) for (const [k, v] of Object.entries(value)) leaves(v, prefix ? `${prefix}.${k}` : k, out);
  return out;
}

function originMap(c: PageCopy, written: ReadonlySet<string>, who: CopyOrigin): Record<string, CopyOrigin> {
  return Object.fromEntries(leaves(c, "").map((p) => [p, written.has(p) ? who : "library"]));
}

/**
 * Merge model output over the library copy. `ai` may be anything (worker output, a server value, stored JSON): each
 * key is read with the loose schema, then every field is cleaned and checked on its own; a partial object keeps the
 * library for the keys it lacks.
 */
export function mergeAiCopy(library: PageCopy, ai: unknown, ctx: GuardContext): MergeResult {
  const who: CopyOrigin = ctx.origin ?? "local";
  const fallback = (rejected: string[]): MergeResult => {
    const copy = applyKickerBudget(structuredClone(library), ctx.kickers);
    return { copy, rejected, origin: originMap(copy, new Set(), who) };
  };
  if (!isPlainObject(ai)) return fallback(["*"]);
  const { scalars: s, lists: l, rejected } = cleanCopy(ai, ctx, library);
  const c: PageCopy = structuredClone(library);
  const written = new Set<string>();
  const put = (path: string, value: unknown) => leaves(value, path, []).forEach((p) => written.add(p));
  const scalar = <K extends ScalarKey>(key: K, set: (v: string) => void, path: string) => {
    const v = s[key];
    if (v === undefined) return;
    set(v);
    written.add(path);
  };

  scalar("tagline", (v) => (c.tagline = v), "tagline");
  scalar("kicker", (v) => (c.hero.kicker = v), "hero.kicker");
  scalar("headline", (v) => (c.hero.headline = v), "hero.headline");
  scalar("sub", (v) => (c.hero.sub = v), "hero.sub");
  if (s.cta !== undefined) {
    c.hero.cta = s.cta;
    c.cta.button = s.cta;
    written.add("hero.cta").add("cta.button");
  }
  scalar("problem_title", (v) => (c.problem.title = v), "problem.title");
  scalar("solution", (v) => (c.problem.solution = v), "problem.solution");
  scalar("cta_title", (v) => (c.cta.title = v), "cta.title");
  scalar("cta_text", (v) => (c.cta.text = v), "cta.text");
  if (s.story_title !== undefined && s.story !== undefined) {
    c.story = { ...c.story, title: s.story_title, text: s.story };
    written.add("story.title").add("story.text");
  }
  scalar("seo_title", (v) => (c.seo.title = v), "seo.title");
  scalar("seo_description", (v) => (c.seo.description = v), "seo.description");

  /** a list written item by item: AI items are marked, library stand-ins are not */
  const items = <T>(list: Item<T>[], path: string): T[] => {
    list.forEach((it, i) => it.ai && put(`${path}.${i}`, it.v));
    return list.map((it) => it.v);
  };
  if (l.benefits) c.benefits.items = items(l.benefits, "benefits.items");
  if (l.pains) c.problem.points = items(l.pains, "problem.points");
  if (l.steps) {
    c.steps.items = l.steps.map((it, i) => ({ ...it.v, icon: library.steps.items[i]?.icon ?? "check" }));
    l.steps.forEach((_, i) => written.add(`steps.items.${i}.title`).add(`steps.items.${i}.text`));
  }
  if (l.faq) c.faq.items = items(l.faq, "faq.items");
  if (l.guarantee) c.guarantee.lines = items(l.guarantee, "guarantee.lines");
  if (l.comparison) c.comparison.rows = items(l.comparison, "comparison.rows");
  if (l.announcement) {
    const first = library.announcement[0]!;
    const extra = l.announcement.map((i) => i.v).filter((x) => x.toLowerCase() !== first.toLowerCase()).slice(0, 2);
    c.announcement = [first, ...extra].slice(0, 4);
    if (c.announcement.length < 2) c.announcement = library.announcement;
    else extra.forEach((_, i) => written.add(`announcement.${i + 1}`));
  }
  if (l.marquee) c.marquee = items(l.marquee, "marquee");

  applyKickerBudget(c, ctx.kickers);
  const final = PageCopy.safeParse(c);
  if (!final.success) return fallback(["*"]);
  return { copy: final.data, rejected, origin: originMap(final.data, written, who) };
}

