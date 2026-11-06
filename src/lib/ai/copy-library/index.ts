/**
 * Fallback copy library: complete, hand-written page copy in ar / fr / en for 16 product families.
 * Guarantees a great page without any AI: `libraryCopy()` always returns a valid PageCopy.
 *
 *   const copy = libraryCopy({ category: "kids", locale: "fr", seed: 42, productName: "Abaya de prière", hasWhatsapp: false });
 *
 * The family comes from the category, refined by the product's own words (copyFamily): a girl's
 * prayer abaya filed under "kids" gets modest-wear copy for prayer and for girls, never toy copy.
 * Pure & isomorphic; deterministic per seed (remixing copy = a new seed).
 */
import type { Locale, Market, ProductCategory } from "@/lib/page/schema";
import { createT } from "@/landing/i18n";
import { articleCheck, registerOf, structureOf } from "@/lib/design/cliche";
import type { HeadlineStructure } from "@/lib/design/genome";
import { PageCopy } from "../copy-schema";
import { AR } from "./ar";
import { EN } from "./en";
import { FR } from "./fr";
import { articleFor, productRef, type ArticleSlot, type ProductRef } from "./product-ref";
import type { Benefit, CompareRow, Facet, FacetCopy, Family, FamilyCopy, Line, LocaleLibrary, Pain, Qa, Step } from "./types";

export { FACETS, FAMILIES, WORD_FAMILIES, type Facet, type Family, type Line } from "./types";
export { articleFor, productRef, type ProductRef } from "./product-ref";

/** The text of a tagged line. */
export const lineText = (l: Line): string => (typeof l === "string" ? l : l.t);

/** A line's tags (DES-§9.5): the explicit ones, else the heuristic taggers' reading of the plain string. */
export function lineTag(l: Line, locale: Locale): { t: string; s: HeadlineStructure; r: "msa" | "darija" | "mixed" | "none" } {
  if (typeof l !== "string") return { t: l.t, s: l.s, r: l.r ?? (locale === "ar" ? registerOf(l.t) : "none") };
  return { t: l, s: structureOf(l, locale), r: locale === "ar" ? registerOf(l) : "none" };
}

/**
 * A French template made article-safe for one product (DES-§9.5 D4): the lint's fix applied (a gendered slot for a
 * determiner, a contraction, an elision), gendered slots resolved through `articleFor`, and a bare `{product}` inside a
 * sentence given the lower-case article the name was typed with ("choisi l’huile d’argan"). null when only a
 * name-free alternative fits (the gender is unknown).
 */
export function frTemplate(template: string, ref: ProductRef): string | null {
  if (!template.includes("{product")) return template;
  const chk = articleCheck(template, ref);
  const t = chk.ok ? template : chk.fixed;
  if (t === null) return null;
  const typo = (v: string) => v.replace(/^(l|à l|de l)'/i, "$1’");
  return t
    .replace(/(?<![\p{L}’'])(d|qu)'\{product\}/giu, "$1’{product}")
    .replace(/\{product:(le|ce|de|un|a)\}/g, (_m, a: ArticleSlot) => {
      const v = articleFor(ref, a);
      return v === null ? "{product}" : typo(v);
    })
    .replace(/(^|[.!?]\s+)?\{product\}/g, (m, start: string | undefined) => (start !== undefined || !ref.article ? m : typo(articleFor(ref, "bare")!)));
}

const FAMILY_OF: Record<ProductCategory, Family> = {
  beauty: "skincare",
  skincare: "skincare",
  haircare: "haircare",
  fragrance: "fragrance",
  jewelry: "jewelry",
  watches: "jewelry",
  fashion: "fashion",
  bags: "fashion",
  health: "wellness",
  supplements: "wellness",
  fitness: "fitness",
  sport: "fitness",
  kitchen: "kitchen",
  home: "home",
  cleaning: "home",
  decor: "home",
  garden: "home",
  kids: "kids",
  toys: "kids",
  pets: "pets",
  tech: "tech",
  gadgets: "tech",
  car: "auto",
  tools: "auto",
  grooming: "auto",
  "organic-food": "terroir",
  traditional: "terroir",
  other: "general",
};

/** The family of a category alone (no product words). */
export const familyOf = (category: ProductCategory): Family => FAMILY_OF[category] ?? "general";

/** Locales with a hand-written library; others fall back to English until translated. */
const LIBRARIES: Partial<Record<Locale, LocaleLibrary>> = { ar: AR, fr: FR, en: EN };
export const LIBRARY_LOCALES: readonly Locale[] = ["ar", "fr", "en"];
export const libraryFor = (locale: Locale): LocaleLibrary => LIBRARIES[locale] ?? EN;

/* ------------------------------------------------------------------ */
/* Family from the product's words                                     */
/* ------------------------------------------------------------------ */

/** Lowercase, no Latin accents, no Arabic diacritics / tatweel / hamza seats ("prière" → "priere", "إسدال" → "اسدال"). */
const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .replace(/ـ/g, "")
    .toLowerCase()
    .normalize("NFC");

const lexicon = (words: readonly string[]) => new Set(words.map(norm));

/** Garments that are modest wear by name. */
const MODEST_GARMENT = lexicon([
  "abaya", "abayas", "abaia", "hijab", "hijabs", "hidjab", "hijeb", "khimar", "khimars", "jilbab", "jilbabs", "jilbeb",
  "djilbab", "isdal", "esdal", "isdel", "niqab", "niqabs", "burkini", "burkinis", "burqini", "djellaba", "djellabas", "jellaba",
  "jellabas", "jelaba", "jalaba", "jilaba", "jallaba", "djelaba", "kaftan", "kaftans", "caftan", "caftans", "qaftan", "takchita",
  "takchitas", "takshita", "tekchita", "gandoura", "gandouras", "jalabiya", "jalabiyas", "jalabiyya", "galabeya", "galabiya",
  "tarha", "melhfa", "malhfa",
  "عباية", "عبايه", "عبايات", "عباءة", "عباءات", "حجاب", "حجابات", "خمار", "خمارات", "جلباب", "جلابيب", "إسدال", "نقاب",
  "بوركيني", "جلابة", "جلابه", "جلالب", "جلابية", "جلابيه", "قفطان", "قفاطين", "تكشيطة", "تكشيطه", "طرحة", "طرحه", "ملحفة",
  "ملحفه",
]);
/** Of those, worn by women and girls (a "kids" one is a girl's piece). */
const FEMALE_GARMENT = lexicon([
  "abaya", "abayas", "abaia", "hijab", "hijabs", "hidjab", "hijeb", "khimar", "khimars", "jilbab", "jilbabs", "jilbeb", "djilbab",
  "isdal", "esdal", "isdel", "niqab", "niqabs", "burkini", "burkinis", "burqini", "kaftan", "kaftans", "caftan", "caftans",
  "qaftan", "takchita", "takchitas", "takshita", "tekchita", "tarha", "melhfa", "malhfa",
  "عباية", "عبايه", "عبايات", "عباءة", "عباءات", "حجاب", "حجابات", "خمار", "خمارات", "جلباب", "جلابيب", "إسدال", "نقاب",
  "بوركيني", "قفطان", "قفاطين", "تكشيطة", "تكشيطه", "طرحة", "طرحه", "ملحفة", "ملحفه",
]);
const PRAYER = lexicon(["prayer", "prayers", "priere", "prieres", "salat", "salah", "salaat", "namaz", "isdal", "esdal", "isdel", "صلاة", "صلاه", "إسدال"]);
const MODESTY = lexicon(["modest", "modesty", "modestwear", "pudique", "pudiques", "pudeur", "محتشم", "محتشمة", "محتشمه", "حشمة", "حشمه"]);
/** Clothing words (a prayer or modest word next to one names a garment: "robe de prière", "prayer set"). */
const GARMENT = lexicon([
  "robe", "robes", "dress", "dresses", "ensemble", "ensembles", "set", "sets", "tenue", "tenues", "outfit", "outfits", "tunique",
  "tunic", "jupe", "skirt", "voile", "veil", "foulard", "scarf", "echarpe", "cape", "kimono", "gilet", "cardigan", "manteau",
  "coat", "veste", "jacket", "pyjama", "pyjamas", "pajama", "pajamas", "chemise", "shirt", "pantalon", "trousers", "jumpsuit",
  "combinaison", "bonnet", "underscarf", "vetement", "vetements", "clothes", "clothing", "wear",
  "فستان", "فساتين", "طقم", "أطقم", "لباس", "ملابس", "ثوب", "أثواب", "تنورة", "قميص", "سروال", "معطف", "سترة", "شال", "وشاح",
  "إيشارب", "ايشارب", "بيجامة",
]);
/** Clothing that turns a "kids" / "traditional" / "other" product into fashion copy (mirrors the generator's garment words). */
const APPAREL = lexicon([
  "robe", "robes", "dress", "dresses", "pyjama", "pyjamas", "pajama", "pajamas", "ensemble", "tenue", "outfit", "jupe", "skirt",
  "pantalon", "trousers", "chemise", "shirt", "t-shirt", "tshirt", "sweat", "hoodie", "gilet", "cardigan", "manteau", "coat",
  "veste", "jacket", "tunique", "tunic", "jabador",
  "فستان", "فساتين", "بيجامة", "ملابس", "لباس", "طقم", "تنورة", "قميص", "سروال", "معطف", "سترة", "جابادور",
]);
/** Accessories and objects around modest wear: their own family, never garment copy. */
const NOT_GARMENT = lexicon([
  "epingle", "epingles", "pin", "pins", "aimant", "aimants", "magnet", "magnets", "broche", "broches", "cintre", "cintres",
  "organisateur", "organizer", "tapis", "mat", "mats", "rug", "sajada", "sajjada", "tasbih", "misbaha", "chapelet", "coffret",
  "livre", "book", "coran", "quran", "koran", "parfum", "perfume", "musc", "poupee", "doll",
  "دبوس", "دبابيس", "مشبك", "مشابك", "مغناطيس", "سجادة", "سجاده", "سجادات", "مسبحة", "سبحة", "مصحف", "قرآن", "كتاب", "عطر", "دمية",
]);
const MEN = lexicon([
  "homme", "hommes", "men", "mens", "man", "masculin", "garcon", "garcons", "boy", "boys",
  "رجال", "رجالي", "رجالية", "رجاليه", "رجل", "ولد", "أولاد", "ذكور", "ذكوري",
]);
const GIRLS = lexicon(["fille", "filles", "fillette", "fillettes", "girl", "girls", "بنت", "بنات", "بناتي", "طفلة", "طفلات", "صغيرات"]);
// no "bébé" / "baby": "rose bébé", "baby blue" name a colour far more often than an age
const KIDS = lexicon(["enfant", "enfants", "kid", "kids", "child", "children", "junior", "juniors", "toddler", "أطفال", "طفل", "صغار", "طفولي"]);
const LACE = lexicon(["lace", "laces", "dentelle", "dentelles", "guipure", "دانتيل", "دانتال", "دنتيل", "دانتيلا"]);
/** Head veils (their copy speaks of draping, not of a cut or a length)… */
const VEIL = lexicon([
  "hijab", "hijabs", "hidjab", "hijeb", "khimar", "khimars", "tarha", "voile", "voiles", "veil", "veils", "foulard", "foulards",
  "scarf", "scarves", "echarpe", "underscarf", "حجاب", "حجابات", "خمار", "خمارات", "طرحة", "طرحه", "شال", "وشاح", "إيشارب", "ايشارب",
]);
/** …unless a long garment comes with it ("abaya + hijab assorti"). */
const LONG_GARMENT = lexicon([
  "abaya", "abayas", "abaia", "jilbab", "jilbabs", "jilbeb", "djilbab", "isdal", "esdal", "isdel", "burkini", "burkinis", "djellaba",
  "djellabas", "jellaba", "jelaba", "jalaba", "jilaba", "jallaba", "kaftan", "kaftans", "caftan", "caftans", "qaftan", "takchita",
  "takshita", "tekchita", "gandoura", "jalabiya", "jalabiyya", "galabeya", "galabiya", "melhfa", "malhfa", "robe", "robes", "dress",
  "dresses", "tenue", "tenues", "ensemble", "ensembles", "set", "sets", "outfit", "tunique", "tunic", "jupe", "skirt", "jumpsuit",
  "combinaison", "عباية", "عبايه", "عبايات", "عباءة", "جلباب", "إسدال", "بوركيني", "جلابة", "جلابه", "جلابية", "جلابيه", "قفطان",
  "تكشيطة", "تكشيطه", "ملحفة", "ملحفه", "فستان", "طقم", "ثوب", "تنورة",
]);
/** An age ("4 à 12 ans", "6 years", "من 4 إلى 12 سنة"): a children's piece. */
const AGE = /[0-9٠-٩]\s*(?:ans?\b|years?\b|yrs?\b|سنوات|سنة|سنين|أعوام)/iu;

/** Categories a modest garment may be filed under (a hijab pin under jewelry stays jewelry). */
const MODEST_CATEGORIES = new Set<ProductCategory>(["fashion", "kids", "traditional", "other", "sport"]);
/** Categories whose own copy is about something else than garments (toys, honey, generic). */
const NON_APPAREL_COPY = new Set<ProductCategory>(["kids", "toys", "traditional", "other"]);

/** Arabic attached particles: "والعباية", "بالدانتيل", "للصلاة" still read as their word. */
const AR_PREFIX = /^(?:[وفبكل]?ال|لل|[وفبكل])/u;

function tokens(text: string): string[] {
  return norm(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 2 && w.length <= 32)
    .slice(0, 200);
}

function has(list: readonly string[], set: ReadonlySet<string>): boolean {
  return list.some((w) => {
    if (set.has(w)) return true;
    const bare = w.replace(AR_PREFIX, "");
    if (bare !== w && bare.length >= 2 && set.has(bare)) return true;
    return w.length > 3 && w.endsWith("s") && set.has(w.slice(0, -1));
  });
}

/** Short words that never make two phrases "say the same thing". */
const STOP = lexicon(["pour", "les", "des", "avec", "for", "the", "with", "and", "made", "mode", "من", "مع", "في"]);

/** The phrase repeats a word of the product name ("Abaya de prière · Pour la prière"). */
function repeatsName(phrase: string, name: string): boolean {
  const bare = (w: string) => w.replace(AR_PREFIX, "");
  const own = new Set(tokens(name).flatMap((w) => [w, bare(w)]));
  return tokens(phrase).some((w) => w.length >= 3 && !STOP.has(w) && (own.has(w) || own.has(bare(w))));
}

export interface CopyProfile {
  family: Family;
  /** refinements the product's words call for (only modest wear has some today) */
  facets: Facet[];
}

export interface CopyFamilyInput {
  /** the product's catalog category (or the generator's copy category: the result is the same) */
  category: ProductCategory;
  productName?: string | null;
  /** the product's other words: tagline, description, merchant facts */
  keywords?: string | null;
}

/**
 * Which copy family speaks for the product, from its category and its own words:
 *   - modest wear (abaya, prayer dress or set, hijab, khimar, djellaba, kaftan… for women and girls)
 *     → "modest", with facets: prayer, girls (or kids), veil (hijab, khimar), lace;
 *   - another garment filed under kids / toys / traditional / other → "fashion";
 *   - otherwise the category's family.
 * Accessories (hijab pins, prayer mats) and men's pieces keep their own family.
 */
export function copyFamily(input: CopyFamilyInput): CopyProfile {
  const text = `${input.productName ?? ""} ${input.keywords ?? ""}`;
  const words = tokens(text);
  const category = input.category;
  const garmentWord = has(words, GARMENT) || has(words, APPAREL);
  const modest =
    MODEST_CATEGORIES.has(category) &&
    !has(words, NOT_GARMENT) &&
    !has(words, MEN) &&
    (has(words, MODEST_GARMENT) || ((has(words, PRAYER) || has(words, MODESTY)) && garmentWord));
  if (modest) {
    // order matters where two facets speak to the same topic: the first one's line is kept (a
    // girl's veil gets the sizes-by-age lines, a woman's veil the draping ones)
    const facets: Facet[] = [];
    if (has(words, PRAYER)) facets.push("prayer");
    const kids = category === "kids" || has(words, KIDS) || has(words, GIRLS) || AGE.test(text);
    if (has(words, GIRLS) || (kids && (has(words, FEMALE_GARMENT) || has(words, PRAYER)))) facets.push("girls");
    else if (kids) facets.push("kids");
    if (has(words, VEIL) && !has(words, LONG_GARMENT)) facets.push("veil");
    if (has(words, LACE)) facets.push("lace");
    return { family: "modest", facets };
  }
  if (NON_APPAREL_COPY.has(category) && (has(words, APPAREL) || has(words, MODEST_GARMENT))) return { family: "fashion", facets: [] };
  return { family: familyOf(category), facets: [] };
}

/* ------------------------------------------------------------------ */
/* Text helpers                                                        */
/* ------------------------------------------------------------------ */

/**
 * Fit text into `max` characters at a word boundary (adds an ellipsis only when it had to cut).
 * Runs of spaces collapse; no-break spaces stay (French "Prêt ?" never breaks before the "?").
 */
export function fitText(text: string, max: number): string {
  const s = text.replace(/[^\S  ]+/g, " ").trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, Math.max(0, max - 1));
  const at = cut.lastIndexOf(" ");
  const base = (at > max * 0.55 ? cut.slice(0, at) : cut).replace(/[\s,;:.\-\u2013\u2014(]+$/u, "");
  // never leave an unbalanced *emphasis* marker behind
  const balanced = (base.match(/\*/g)?.length ?? 0) % 2 === 0 ? base : base.replace(/\*(?!.*\*)/u, "");
  return `${balanced}…`;
}

/** Product name usable inside copy: no markup characters, collapsed spaces. */
export function cleanName(name: string): string {
  return name.replace(/[*_<>{}[\]\\]/g, "").replace(/\s+/g, " ").trim() || "-";
}

export interface Slots {
  product: string;
  delivery: string;
  where: string;
  /** the store has a WhatsApp number ({wa:A|B} → A); omitted = no */
  whatsapp?: boolean;
}

/** `{wa:A|B}` → A with a WhatsApp number, B without. */
const WA_BLOCK = /\{wa:([^{}|]*)\|([^{}|]*)\}/g;

export function fill(template: string, slots: Slots): string {
  return template
    .replace(WA_BLOCK, (_, yes: string, no: string) => (slots.whatsapp ? yes : no))
    .replace(/\{(product|delivery|where)\}/g, (_, k: "product" | "delivery" | "where") => slots[k]);
}

const NBSP = " ";

/**
 * Typography of a library string (before its slots are filled, so the merchant's own words stay
 * as typed): the typographic apostrophe in French and English; in French a no-break space before
 * ? ! : ; » and after «.
 */
export function typeset(locale: Locale, s: string): string {
  if (locale !== "fr" && locale !== "en") return s;
  let out = s.replace(/(\p{L})'(?=[\p{L}*])/gu, "$1’");
  if (locale === "fr") out = out.replace(/ ([?!:;»])/g, `${NBSP}$1`).replace(/« /g, `«${NBSP}`);
  return out;
}

const DELIVERY_OTHER: Partial<Record<Locale, string>> = {
  ar: "توصيل سريع إلى باب المنزل",
  fr: "Livraison rapide à domicile",
  en: "Fast home delivery",
};

/** The delivery promise line: the store's own text when set, else the market default. */
export function deliveryLine(locale: Locale, market: Market, custom?: string | null): string {
  const own = custom?.replace(/\s+/g, " ").trim();
  if (own) return own.slice(0, 60);
  if (market === "MA") return createT(locale)("trust.delivery");
  return DELIVERY_OTHER[locale] ?? DELIVERY_OTHER.en!;
}

/* ------------------------------------------------------------------ */
/* Family + facets → one set of pools                                  */
/* ------------------------------------------------------------------ */

type Pool = "kicker" | "headline" | "sub" | "bigWord" | "tagline" | "benefitsTitle" | "problemTitle" | "solution";

interface Resolved extends Pick<FamilyCopy, Pool | "showcaseTitle" | "stepsTitle" | "story" | "marquee" | "voice"> {
  benefits: Benefit[];
  /** the first `lead` benefits are always shown, in order; the rest are shuffled */
  lead: number;
  pains: Pain[];
  steps: Step[];
  faq: Qa[];
  /** the first usage question is the family's key one (always shown) */
  faqPinned: boolean;
  comparison: CompareRow[];
}

const uniq = <T,>(list: readonly T[], key: (t: T) => string): T[] => {
  const seen = new Set<string>();
  return list.filter((t) => {
    const k = key(t);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

/**
 * Facet items replace the family's item on the same topic, in place; facet items on a new topic
 * are inserted (`at`: after the family's first item, at the end, or not at all).
 */
function byTopic<T extends { topic?: string }>(base: readonly T[], extra: readonly T[], at: "second" | "end" | "none"): T[] {
  const swap = new Map<string, T>();
  const fresh: T[] = [];
  for (const e of extra) {
    if (e.topic && base.some((b) => b.topic === e.topic)) {
      if (!swap.has(e.topic)) swap.set(e.topic, e);
    } else if (!e.topic || !fresh.some((f) => f.topic === e.topic)) fresh.push(e);
  }
  const out = base.map((b) => (b.topic ? (swap.get(b.topic) ?? b) : b));
  if (at === "second") out.splice(1, 0, ...fresh);
  else if (at === "end") out.push(...fresh);
  return out;
}

/**
 * `named`: facets the product name already says ("Abaya de prière"): their kicker ("· Pour la
 * prière") would only repeat it, in any language.
 */
function resolveFamily(fam: FamilyCopy, facets: readonly Facet[], named: readonly Facet[] = []): Resolved {
  const copyOf = (list: readonly Facet[]) => list.map((f) => fam.facets?.[f]).filter((f): f is FacetCopy => !!f);
  const active = copyOf(facets);
  const unnamed = copyOf(facets.filter((f) => !named.includes(f)));
  const pool = (key: Pool, from: readonly FacetCopy[] = active): string[] => {
    const extra = uniq(
      from.flatMap((f) => (f[key] ?? []).map(lineText)),
      (s) => s,
    );
    return extra.length ? extra : fam[key].map(lineText);
  };
  // benefits: each facet's first one leads, then the family's own first one; the rest shuffle
  const facetBenefits = uniq(
    [...active.map((f) => f.benefits?.[0]), ...active.flatMap((f) => f.benefits?.slice(1) ?? [])].filter((b): b is Benefit => !!b),
    (b) => b.topic ?? b.title,
  );
  const taken = new Set(facetBenefits.map((b) => b.topic).filter(Boolean));
  const own = fam.benefits.filter((b) => !b.topic || !taken.has(b.topic));
  const firsts = facetBenefits.filter((b) => active.some((f) => f.benefits?.[0] === b));
  const seconds = facetBenefits.filter((b) => !firsts.includes(b));
  const stories = active.flatMap((f) => f.story ?? []);
  return {
    kicker: pool("kicker", unnamed),
    headline: pool("headline"),
    sub: pool("sub"),
    bigWord: pool("bigWord"),
    tagline: pool("tagline"),
    benefitsTitle: pool("benefitsTitle"),
    problemTitle: pool("problemTitle"),
    solution: pool("solution"),
    showcaseTitle: fam.showcaseTitle,
    stepsTitle: fam.stepsTitle,
    benefits: [...firsts, ...own.slice(0, 1), ...seconds, ...own.slice(1)],
    lead: firsts.length + Math.min(1, own.length),
    pains: byTopic(fam.pains, active.flatMap((f) => f.pains ?? []), "end").slice(0, 5),
    steps: byTopic(fam.steps, active.flatMap((f) => f.steps ?? []), "none"),
    faq: byTopic(fam.faq, active.flatMap((f) => f.faq ?? []), "second"),
    faqPinned: fam.faq.length > 2,
    story: stories.length ? stories : fam.story,
    comparison: byTopic(fam.comparison, active.flatMap((f) => f.comparison ?? []), "second").slice(0, 6),
    marquee: uniq([...active.flatMap((f) => f.marquee ?? []), ...fam.marquee], (s) => s).slice(0, 8),
    ...(fam.voice ? { voice: fam.voice } : {}),
  };
}

/* ------------------------------------------------------------------ */
/* Builder                                                             */
/* ------------------------------------------------------------------ */

export interface LibraryInput {
  /** the product's catalog category (the generator's copy category works too) */
  category: ProductCategory;
  locale: Locale;
  market?: Market;
  /** seed for choosing among alternatives */
  seed: number;
  productName: string;
  /**
   * the product's other words (tagline, description, merchant facts): with the name, they pick the
   * family's refinements: a prayer abaya for girls, in lace (see copyFamily)
   */
  keywords?: string | null;
  /** store delivery line (Settings → Defaults); market default when empty */
  deliveryText?: string | null;
  /**
   * the store has a WhatsApp number. Omitted or false: no line sends the visitor to WhatsApp (FAQ
   * answers, guarantees, comparison rows and steps point to the confirmation call or the contact page).
   */
  hasWhatsapp?: boolean;
}

/** Small deterministic PRNG (mulberry32 over an FNV-1a hash of seed + key). */
function rngFor(seed: number, key: string): () => number {
  let h = 0x811c9dc5 ^ (seed >>> 0);
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function libraryCopy(input: LibraryInput): PageCopy {
  const lib = libraryFor(input.locale);
  const c = lib.common;
  const profile = copyFamily({ category: input.category, productName: input.productName, keywords: input.keywords });
  // what the name alone says (read as a plain garment: a "kids" category is not in the name)
  const named = copyFamily({ category: "fashion", productName: input.productName }).facets;
  const fam = resolveFamily(lib.families[profile.family], profile.facets, named);
  const market = input.market ?? "MA";
  const slots: Slots = {
    product: cleanName(input.productName),
    delivery: deliveryLine(input.locale, market, input.deliveryText),
    where: market === "MA" ? c.where.MA : c.where.other,
    whatsapp: input.hasWhatsapp === true,
  };
  /**
   * French articles (D4): the elision before a vowel ("l’idée d’Abaya…", never "de Abaya"), a typed article lower-cased
   * inside a sentence and contracted ("de l’huile", never "de L'huile"), gendered slots resolved; the merchant's own
   * name keeps its spelling
   */
  const ref = input.locale === "fr" ? productRef(slots.product, "fr") : null;
  /** a library string, typeset, with its slots filled */
  const F = (s: string) => {
    const t = typeset(input.locale, s);
    return fill(ref ? (frTemplate(t, ref) ?? t) : t, slots);
  };
  const seed = Math.abs(Math.trunc(input.seed)) >>> 0;
  /** pick one alternative that fits `max` after filling (shortest as last resort) */
  const one = (key: string, list: readonly string[], max: number): string => {
    const filled = list.map(F);
    const fitting = filled.filter((s) => s.length <= max);
    const pool = fitting.length ? fitting : [filled.reduce((a, b) => (b.length < a.length ? b : a))];
    const r = rngFor(seed, key);
    return fitText(pool[Math.floor(r() * pool.length) % pool.length]!, max);
  };
  const shuffled = <T,>(key: string, list: readonly T[]): T[] => {
    const r = rngFor(seed, key);
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [a[i], a[j]] = [a[j]!, a[i]!];
    }
    return a;
  };
  const QA = (x: Qa) => ({ q: fitText(F(x.q), 110), a: fitText(F(x.a), 320) });
  const qa = (key: string, list: readonly Qa[]) => QA(list[Math.floor(rngFor(seed, key)() * list.length) % list.length]!);
  /** list items that resolved to nothing (a WhatsApp-only line without a number) drop out */
  const lines = (list: readonly string[], max: number) => list.map((s) => fitText(F(s), max)).filter(Boolean);

  // 4 or 5 benefits: the leads (facets', then the family's strongest) in order, the rest varied
  const benefitCount = Math.max(rngFor(seed, "benefit-count")() < 0.5 ? 4 : 5, Math.min(5, fam.lead));
  const benefits = [...fam.benefits.slice(0, fam.lead), ...shuffled("benefits", fam.benefits.slice(fam.lead))].slice(0, benefitCount);
  const usage = fam.faqPinned ? [fam.faq[0]!, ...shuffled("usage-faq", fam.faq.slice(1))] : shuffled("usage-faq", fam.faq);
  const voice = fam.voice ?? {};
  const announcement = lines(c.announcement, 60);
  const trust = c.trust.map((t) => ({ icon: t.icon, text: fitText(F(t.text), 56) })).filter((t) => t.text);

  // a kicker never repeats the name it follows ("Abaya de prière · Pour la prière" → the name alone)
  const kickers = fam.kicker.filter((k) => {
    const [, after] = k.split("{product} · ");
    return after === undefined || !repeatsName(after, input.productName);
  });

  const copy: PageCopy = {
    tagline: one("tagline", fam.tagline, 90),
    hero: {
      kicker: one("kicker", kickers.length ? kickers : ["{product}"], 60),
      headline: one("headline", fam.headline.map(lineText), 110),
      sub: one("sub", fam.sub, 220),
      cta: one("hero-cta", voice.heroCta ?? c.heroCta, 40),
      bigWord: one("big-word", fam.bigWord, 16),
    },
    // the store's COD line first, then two of the others
    announcement: shuffled("announcement", announcement.slice(1)).slice(0, 2).concat(announcement[0]!).reverse(),
    trust,
    marquee: fam.marquee.map((s) => fitText(F(s), 28)),
    benefits: {
      kicker: one("benefits-kicker", c.kickers.benefits, 60),
      title: one("benefits-title", fam.benefitsTitle, 110),
      lead: one("benefits-lead", c.benefitsLead, 220),
      items: benefits.map((b) => ({ icon: b.icon, title: fitText(F(b.title), 60), text: fitText(F(b.text), 200) })),
    },
    problem: {
      kicker: one("problem-kicker", c.kickers.problem, 60),
      title: one("problem-title", fam.problemTitle, 110),
      lead: one("problem-lead", c.problemLead, 220),
      points: fam.pains.map((p) => ({ pain: fitText(F(p.pain), 110), fix: fitText(F(p.fix), 110) })),
      solution: one("solution", fam.solution, 190),
    },
    showcase: {
      kicker: one("showcase-kicker", c.kickers.showcase, 60),
      title: one("showcase-title", fam.showcaseTitle, 110),
      lead: one("showcase-lead", c.showcaseLead, 220),
    },
    steps: {
      kicker: one("steps-kicker", c.kickers.steps, 60),
      title: one("steps-title", fam.stepsTitle, 110),
      items: fam.steps.map((s) => ({ icon: s.icon, title: fitText(F(s.title), 60), text: fitText(F(s.text), 170) })),
    },
    story: (() => {
      const s = fam.story[Math.floor(rngFor(seed, "story")() * fam.story.length) % fam.story.length]!;
      return { kicker: one("story-kicker", c.kickers.story, 60), title: fitText(F(s.title), 110), text: fitText(F(s.text), 700) };
    })(),
    comparison: {
      title: one("comparison-title", c.comparison.title, 110),
      us: fitText(F(c.comparison.us), 30),
      them: fitText(F(c.comparison.them), 30),
      rows: fam.comparison.map((r) => ({ label: fitText(F(r.label), 70), us: fitText(F(r.us), 60), them: fitText(F(r.them), 60) })),
    },
    reviews: { kicker: one("reviews-kicker", c.kickers.reviews, 60), title: one("reviews-title", c.reviewsTitle, 110) },
    socialProof: { kicker: one("sp-kicker", c.kickers.socialProof, 60), title: one("sp-title", c.socialProofTitle, 110) },
    gallery: { kicker: one("gallery-kicker", c.kickers.gallery, 60), title: one("gallery-title", c.galleryTitle, 110) },
    specs: { kicker: one("specs-kicker", c.kickers.specs, 60), title: one("specs-title", c.specsTitle, 110) },
    offer: {
      kicker: one("offer-kicker", c.kickers.offer, 60),
      title: one("offer-title", c.offer.title, 110),
      lead: one("offer-lead", c.offer.lead, 220),
      cta: one("offer-cta", c.offer.cta, 40),
    },
    guarantee: {
      kicker: one("guarantee-kicker", c.kickers.guarantee, 60),
      title: one("guarantee-title", c.guarantee.title, 110),
      lines: lines(c.guarantee.lines, 130).slice(0, 3),
    },
    form: {
      kicker: one("form-kicker", c.kickers.form, 60),
      title: one("form-title", c.form.title, 110),
      lead: one("form-lead", c.form.lead, 220),
      submit: one("form-submit", c.form.submit, 48),
      reassurance: one("form-reassurance", c.form.reassurance, 150),
    },
    cta: {
      kicker: one("cta-kicker", c.kickers.cta, 60),
      title: one("cta-title", voice.ctaTitle ?? c.cta.title, 110),
      text: one("cta-text", c.cta.text, 200),
      button: one("cta-button", voice.ctaButton ?? c.cta.button, 40),
    },
    faq: {
      kicker: one("faq-kicker", c.kickers.faq, 60),
      title: one("faq-title", c.faqTitle, 110),
      // COD first (the #1 question), then delivery, inspection, usage, exchange
      items: [
        qa("faq-cod", c.faq.cod),
        qa("faq-delivery", c.faq.delivery),
        qa("faq-inspect", c.faq.inspect),
        ...usage.slice(0, 1).map(QA),
        qa("faq-exchange", c.faq.exchange),
        ...usage.slice(1, 2).map(QA),
      ],
    },
    sticky: { label: one("sticky-label", voice.sticky ?? c.sticky.label, 36), note: one("sticky-note", c.sticky.note, 56) },
    whatsapp: { label: one("wa-label", c.whatsapp.label, 56), message: one("wa-message", c.whatsapp.message, 180) },
    bundles: c.bundles.map((b) => ({ title: fitText(F(b.title), 50), subtitle: fitText(F(b.subtitle), 80) })),
    seo: { title: one("seo-title", c.seo.title, 70), description: one("seo-description", c.seo.description, 165) },
    thankYou: { title: one("ty-title", c.thankYou.title, 110), message: one("ty-message", c.thankYou.message, 400) },
  };
  return PageCopy.parse(copy);
}
