/**
 * Guard for model-written copy. A small local model can drift: invent numbers ("98 % satisfied"),
 * make health claims, mix languages, use hype words or emojis. Every field is checked on its own;
 * a field that fails is dropped and the hand-written library copy is used in its place.
 *
 *   const { copy, rejected } = mergeAiCopy(library, aiJson, { locale, facts, productName, price });
 *
 * Pure & isomorphic.
 */
import type { Locale } from "@/lib/page/schema";
import { AiCopy, PageCopy, isIconName } from "./copy-schema";
import { fitText } from "./copy-library";

export interface GuardContext {
  locale: Locale;
  productName: string;
  /** merchant-provided facts — the only source of numbers the copy may use */
  facts: readonly string[];
  price?: number;
  deliveryText?: string | null;
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

const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}]/gu;
const ARABIC_LETTER = /[؀-ۿݐ-ݿࢠ-ࣿ]/gu;
const LATIN_LETTER = /[A-Za-zÀ-ÿ]/gu;
const ASCII_DIGITS = (s: string) =>
  s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));

export function numbersIn(s: string): string[] {
  return ASCII_DIGITS(s).match(/\d+(?:[.,]\d+)?/g)?.map((n) => n.replace(",", ".")) ?? [];
}

/** Numbers the copy may mention: those the merchant gave us (facts, name, price, delivery line). */
export function allowedNumbers(ctx: GuardContext): Set<string> {
  const out = new Set<string>();
  const add = (s: string | number | null | undefined) => {
    if (s === null || s === undefined) return;
    for (const n of numbersIn(String(s))) {
      out.add(n);
      out.add(String(Number(n)));
    }
  };
  for (const f of ctx.facts) add(f);
  add(ctx.productName);
  add(ctx.price);
  add(ctx.deliveryText);
  return out;
}

/** Clean one model string; null when it breaks a rule (caller falls back to the library). */
export function cleanAiText(input: unknown, ctx: GuardContext, allowed: Set<string>, max: number): string | null {
  if (typeof input !== "string") return null;
  let s = input
    .normalize("NFC")
    .replace(EMOJI, "")
    .replace(/[<>{}[\]\\`|^~]/g, "")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/[!¡]+/g, ".")
    .replace(/\.{2,}/g, ".")
    .replace(/\s+([.,;:?؟،])/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[.,;:]\s*/, "");
  if (!s) return null;
  // unbalanced *emphasis* markers → drop the markup, keep the words
  if ((s.match(/\*/g)?.length ?? 0) % 2 !== 0) s = s.replace(/\*/g, "");
  if (BANNED.some((re) => re.test(s)) || MEDICAL.some((re) => re.test(s))) return null;
  for (const n of numbersIn(s)) if (!allowed.has(n) && !allowed.has(String(Number(n)))) return null;
  // language check on texts long enough to judge
  const arabic = s.match(ARABIC_LETTER)?.length ?? 0;
  const latin = s.match(LATIN_LETTER)?.length ?? 0;
  const letters = arabic + latin;
  if (letters >= 12) {
    const nameLatin = ctx.productName.match(LATIN_LETTER)?.length ?? 0;
    const nameArabic = ctx.productName.match(ARABIC_LETTER)?.length ?? 0;
    if (ctx.locale === "ar" && arabic < (letters - Math.min(latin, nameLatin)) * 0.6) return null;
    if (ctx.locale !== "ar" && arabic - nameArabic > letters * 0.25) return null;
  }
  return fitText(s, max);
}

/* ------------------------------------------------------------------ */
/* Merge                                                               */
/* ------------------------------------------------------------------ */

export interface MergeResult {
  copy: PageCopy;
  /** AiCopy keys that were rejected and replaced by library copy */
  rejected: string[];
}

/**
 * Merge model output over the library copy. `ai` may be anything (worker output, stored JSON):
 * it is shape-checked first, then every field is cleaned and checked on its own.
 */
export function mergeAiCopy(library: PageCopy, ai: unknown, ctx: GuardContext): MergeResult {
  const rejected: string[] = [];
  const parsed = AiCopy.safeParse(ai);
  if (!parsed.success) return { copy: library, rejected: ["*"] };
  const a = parsed.data;
  const allowed = allowedNumbers(ctx);
  const t = (key: string, v: unknown, max: number): string | null => {
    const r = cleanAiText(v, ctx, allowed, max);
    if (r === null) rejected.push(key);
    return r;
  };
  /** all-or-nothing list: every item must pass and the minimum count must hold */
  const list = <T, R>(key: string, items: readonly T[], map: (item: T, i: number) => R | null, min: number): R[] | null => {
    const out: R[] = [];
    for (const [i, item] of items.entries()) {
      const r = map(item, i);
      if (r !== null) out.push(r);
    }
    if (out.length < min) {
      rejected.push(key);
      return null;
    }
    return out;
  };

  const c: PageCopy = structuredClone(library);

  c.tagline = t("tagline", a.tagline, 90) ?? c.tagline;
  c.hero.kicker = t("kicker", a.kicker, 60) ?? c.hero.kicker;
  c.hero.headline = t("headline", a.headline, 110) ?? c.hero.headline;
  c.hero.sub = t("sub", a.sub, 220) ?? c.hero.sub;
  const cta = t("cta", a.cta, 40);
  if (cta) c.hero.cta = cta;

  const benefits = list(
    "benefits",
    a.benefits,
    (b) => {
      const title = cleanAiText(b.title, ctx, allowed, 60);
      const text = cleanAiText(b.text, ctx, allowed, 200);
      return title && text ? { title, text, icon: isIconName(b.icon) ? b.icon : "check" } : null;
    },
    4,
  );
  if (benefits) c.benefits.items = benefits;

  c.problem.title = t("problem_title", a.problem_title, 110) ?? c.problem.title;
  const pains = list(
    "pains",
    a.pains,
    (p) => {
      const pain = cleanAiText(p.pain, ctx, allowed, 110);
      const fix = cleanAiText(p.fix, ctx, allowed, 110);
      return pain && fix ? { pain, fix } : null;
    },
    3,
  );
  if (pains) c.problem.points = pains;
  c.problem.solution = t("solution", a.solution, 190) ?? c.problem.solution;

  const steps = list(
    "steps",
    a.steps,
    (s, i) => {
      const title = cleanAiText(s.title, ctx, allowed, 60);
      const text = cleanAiText(s.text, ctx, allowed, 170);
      return title && text ? { title, text, icon: library.steps.items[i]?.icon ?? "check" } : null;
    },
    3,
  );
  if (steps) c.steps.items = steps;

  const faq = list(
    "faq",
    a.faq,
    (f) => {
      const q = cleanAiText(f.q, ctx, allowed, 110);
      const ans = cleanAiText(f.a, ctx, allowed, 320);
      return q && ans ? { q, a: ans } : null;
    },
    5,
  );
  if (faq) c.faq.items = faq;

  const guarantee = list("guarantee", a.guarantee, (g) => cleanAiText(g, ctx, allowed, 130), 3);
  if (guarantee) c.guarantee.lines = guarantee;

  c.cta.title = t("cta_title", a.cta_title, 110) ?? c.cta.title;
  c.cta.text = t("cta_text", a.cta_text, 200) ?? c.cta.text;
  if (cta) c.cta.button = cta;

  const storyTitle = t("story_title", a.story_title, 110);
  const story = t("story", a.story, 700);
  if (storyTitle && story) c.story = { ...c.story, title: storyTitle, text: story };

  const comparison = list(
    "comparison",
    a.comparison,
    (r) => {
      const label = cleanAiText(r.label, ctx, allowed, 70);
      const us = cleanAiText(r.us, ctx, allowed, 60);
      const them = cleanAiText(r.them, ctx, allowed, 60);
      return label && us && them ? { label, us, them } : null;
    },
    4,
  );
  if (comparison) c.comparison.rows = comparison;

  // the first announcement is the store's COD line (a policy, never rewritten); the model adds flavor
  const announce = list("announcement", a.announcement, (s) => cleanAiText(s, ctx, allowed, 60), 2);
  if (announce) {
    const first = library.announcement[0]!;
    const extra = announce.filter((s) => s.toLowerCase() !== first.toLowerCase()).slice(0, 2);
    c.announcement = [first, ...extra].slice(0, 4);
    if (c.announcement.length < 2) c.announcement = library.announcement;
  }

  const marquee = list("marquee", a.marquee, (s) => cleanAiText(s, ctx, allowed, 28), 4);
  if (marquee) c.marquee = marquee;

  c.seo.title = t("seo_title", a.seo_title, 70) ?? c.seo.title;
  c.seo.description = t("seo_description", a.seo_description, 165) ?? c.seo.description;

  const final = PageCopy.safeParse(c);
  return final.success ? { copy: final.data, rejected } : { copy: library, rejected: ["*"] };
}
