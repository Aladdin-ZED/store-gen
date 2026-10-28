/**
 * `copy.hero` (AI-02; ai.md AI-§A.8.2 stage 2b, AI-§D.3): one hero pack for one direction in the store's primary
 * locale. Guarded with the hero lengths (headline ≤ 84, sub ≤ 190, cta ≤ 32, kicker ≤ 56 optional), no dash, and the
 * direction's headline structure: `headlineStructureOf` (the detector) must read the structure the direction asked
 * for, so the three packs of one run differ in structure (AI-02 acceptance 1).
 */
import type { HeadlineStructure } from "@/lib/design/genome";
import type { Locale } from "@/lib/page/schema";
import { allowedNumbersFor, guardText } from "../../guard";
import { latinFold, numbersIn } from "../../guard-numbers";
import type { CopyDirection, CopyLocale, Market, TaskProduct } from "./common";
import { isRecord, type Finalize } from "./types";

export interface HeroPackInput {
  locale: CopyLocale;
  market: Market;
  product: TaskProduct;
  deliveryText: string | null;
  direction: CopyDirection;
}

export interface HeroPack {
  kicker?: string;
  headline: string;
  sub: string;
  cta: string;
}

/** The guarded pack: a rejected field is left out (the caller keeps the library's). */
export type HeroPackOut = Partial<HeroPack>;

export const HERO_MAX = { kicker: 56, headline: 84, sub: 190, cta: 32 } as const;

/* ------------------------------------------------------------------ */
/* Headline structure detector (G29, DES-§9.5)                         */
/* ------------------------------------------------------------------ */

const FR_IMPERATIVE = new Set(
  "offre offrez découvre découvrez laisse laissez prends prenez fais faites ose osez vis vivez choisis choisissez donne donnez garde gardez sens sentez essaie essayez adopte adoptez retrouve retrouvez profite profitez passe passez commande commandez porte portez dis dites viens venez regarde regardez imagine imaginez goûte goûtez savoure savourez change changez dors dormez respire respirez allume allumez cuisine cuisinez transforme transformez sublime sublimez révèle révélez protège protégez illumine illuminez".split(" "),
);
const EN_IMPERATIVE = new Set(
  "give discover treat make keep bring meet try get feel let wear order enjoy take find say choose add start love protect step own leave pour brew wake smell carry hold light turn go do stop see ditch skip swap pack spoil gift glow live dress walk sleep cook clean style shine rediscover experience embrace indulge unwind relax breathe taste savor savour meet upgrade travel".split(" "),
);
const AR_IMPERATIVE = new Set(
  "اكتشف اكتشفي اطلب اطلبي جرب جربي امنح امنحي عيش عيشي استمتع استمتعي اختار اختاري اختر خلي دير ديري شوف شوفي خذ خذي خود خودي دلل دللي اهدي احصل احصلي اجعل اجعلي ابدأ ابدئي اترك اتركي اعتني اعتن تمتع تمتعي تألق تألقي اشعر اشعري سيفط كمل ارتدي البس لبسي حافظ حافظي وفر وفري ودع ودعي جدد جددي امنحي هدي".split(" "),
);
const CONTRAST: Record<"fr" | "en" | "ar", [RegExp, RegExp][]> = {
  fr: [
    [/\bmoins\b/, /\bplus\b/],
    [/\bpas\b/, /\bmais\b/],
    [/\bsans\b/, /\b(avec|tout|toute)\b/],
    [/\bpeu\b/, /\bbeaucoup\b/],
  ],
  en: [
    [/\bless\b/, /\bmore\b/],
    [/\bnot\b/, /\bbut\b/],
    [/\b(no|without)\b/, /\b(all|every|with)\b/],
    [/\blight\b/, /\b(rich|deep|strong)\b/],
  ],
  ar: [
    [/أقل|اقل/, /أكثر|اكثر/],
    [/(?:^|\s)(?:بلا|بدون)(?:\s|$)/, /(?:^|\s)(?:بل|مع|كل)(?:\s|$)/],
    [/(?:^|\s)(?:ماشي|ليس|لا)(?:\s|$)/, /(?:^|\s)(?:بل|ولكن|لكن|غير)(?:\s|$)/],
  ],
};

/**
 * The headline structure of a line (design's G29 tags): quote-led, question, number-led, word-subline, contrast-pair,
 * imperative, else noun-phrase. A heuristic tagger: it reads punctuation, the first word and contrast pairs.
 */
export function headlineStructureOf(text: string, locale: Locale | string): HeadlineStructure {
  const lang = locale === "ar" ? "ar" : locale === "fr" ? "fr" : "en";
  const t = text.replace(/\*/g, "").trim();
  if (/^["«“„'‹]/.test(t)) return "quote-led";
  if (/[?؟]/.test(t)) return "question";
  const first = numbersIn(t, lang)[0];
  if (first && first.at <= 1) return "number-led";
  if (/^\s*[\p{L}\p{N}'’-]+(?:\s+[\p{L}\p{N}'’-]+)?\s*[.:]\s+\S/u.test(t)) return "word-subline";
  const halves = t.split(/[,.;:،]/).filter((h) => h.trim());
  if (halves.length >= 2) {
    const lower = lang === "ar" ? t : latinFold(t);
    for (const [a, b] of CONTRAST[lang]) {
      const ia = lower.search(a);
      const ib = lower.search(b);
      if (ia >= 0 && ib >= 0 && ia !== ib) return "contrast-pair";
    }
  }
  const word = (t.split(/[\s,.;:!،]+/u)[0] ?? "").toLowerCase();
  if (lang === "fr" && (FR_IMPERATIVE.has(word) || (/^\p{L}{3,}ez$/u.test(word) && !["chez", "assez"].includes(word)))) return "imperative";
  if (lang === "en" && EN_IMPERATIVE.has(word)) return "imperative";
  if (lang === "ar" && AR_IMPERATIVE.has(word.replace(/^و/, ""))) return "imperative";
  return "noun-phrase";
}

/* ------------------------------------------------------------------ */
/* finalize                                                            */
/* ------------------------------------------------------------------ */

/** The guard of `copy.hero` for the input's direction (its headline structure, when one is asked). */
export function heroFinalize(input: Pick<HeroPackInput, "direction">): Finalize<HeroPackOut> {
  return (raw, ctx) => {
    if (!isRecord(raw)) return null;
    const allowed = allowedNumbersFor(ctx);
    const value: HeroPackOut = {};
    const rejected: string[] = [];
    for (const key of ["kicker", "headline", "sub", "cta"] as const) {
      const v = raw[key];
      // the kicker is optional: an empty or missing one is no rejection
      if (key === "kicker" && (v === undefined || v === null || (typeof v === "string" && !v.trim()))) continue;
      const r = guardText(v, ctx, allowed, HERO_MAX[key]);
      if (r.ok) value[key] = r.text;
      else rejected.push(key);
    }
    const want = input.direction.headlineStructure;
    if (value.headline && want && headlineStructureOf(value.headline, ctx.locale) !== want) {
      delete value.headline;
      rejected.push("headline");
    }
    return { value, rejected };
  };
}
