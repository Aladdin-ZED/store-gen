/**
 * Shapes of the hand-written fallback copy library.
 *
 * Every string may use slots, filled at build time:
 *   {product}   product name as typed by the merchant
 *   {delivery}  delivery promise (store setting, else the market's default line)
 *   {where}     "partout au Maroc" / "في جميع أنحاء المغرب"… (market-aware)
 *   {wa:A|B}    A when the store has a WhatsApp number, B otherwise (either side may be empty; no
 *               braces or "|" inside). Copy never sends a visitor to a channel the store does not have.
 * and the landing kit's inline markup: *emphasis* (one per headline) and **strong**.
 *
 * Arrays of alternatives are picked with a seeded RNG, so "remix copy" changes wording but never
 * meaning. Rules for writers: concrete and sensory, no invented numbers, no medical claims, no
 * hype words, no exclamation marks (the page may use one, in the final call to action at most).
 * Write straight apostrophes and plain spaces: French and English typography (’, no-break spaces
 * before ? ! : ;) is applied when the copy is built.
 */
import type { IconName } from "@/landing/primitives/icons";
import type { HeadlineStructure } from "@/lib/design/genome";

/** A rhetorical device a line leans on (DES-§9.5). */
export type Device = "contrast" | "number" | "sensory" | "question" | "quote";

/**
 * A hero, section-title or lead line with its tags (DES-§9.5): the G29 structure, the device, the ar register. A
 * plain string is read as `{ t, s: structureOf(t), r: registerOf(t) }` (the heuristic taggers of src/lib/design/cliche.ts).
 */
export type Line = string | { t: string; s: HeadlineStructure; d?: Device; r?: "msa" | "darija" };

/** Copy families reached from a product category (see FAMILY_OF in index.ts). */
export const FAMILIES = [
  "skincare",
  "haircare",
  "fragrance",
  "jewelry",
  "fashion",
  "wellness",
  "fitness",
  "kitchen",
  "home",
  "kids",
  "pets",
  "tech",
  "auto",
  "terroir",
  "general",
] as const;

/**
 * Copy families chosen from the product's own words, whatever its category: a girl's prayer abaya
 * filed under "kids" is modest wear, never toy copy (see copyFamily in index.ts).
 */
export const WORD_FAMILIES = ["modest"] as const;

export type Family = (typeof FAMILIES)[number] | (typeof WORD_FAMILIES)[number];

/**
 * Facets refine a family from the product's words: prayer wear, a piece for girls (or children),
 * lace, a veil (hijab, khimar; no long garment). A facet's lines are each true for any product
 * carrying it, so several facets combine.
 */
export const FACETS = ["prayer", "girls", "kids", "lace", "veil"] as const;
export type Facet = (typeof FACETS)[number];

/**
 * Items with the same `topic` are the same point said for another kind of product: a facet's item
 * replaces the family's item on that topic (the girls' size question replaces the women's one).
 */
export interface Benefit {
  title: string;
  text: string;
  icon: IconName;
  topic?: string;
}

export interface Step {
  title: string;
  text: string;
  icon: IconName;
  topic?: string;
}

export interface Qa {
  q: string;
  a: string;
  topic?: string;
}

export interface CompareRow {
  label: string;
  us: string;
  them: string;
  topic?: string;
}

export interface Pain {
  pain: string;
  fix: string;
  topic?: string;
}

/** Calls to action in the family's own voice (calm modest wear: "Commander", never "Je le veux"). */
export interface FamilyVoice {
  heroCta?: string[];
  ctaTitle?: string[];
  ctaButton?: string[];
  sticky?: string[];
}

/** Copy specific to a product family (one locale). */
export interface FamilyCopy {
  kicker: string[];
  /** hero h1, ≤ 110 chars after slot filling, one *emphasis*; tagged, ≥ 3 structures per family (DES-§9.5) */
  headline: Line[];
  sub: string[];
  /** giant background word of the stage/poster heroes, ≤ 16 chars */
  bigWord: string[];
  tagline: string[];
  benefitsTitle: string[];
  /** 5-6 benefits; the generator shows 4-5, the first one always */
  benefits: Benefit[];
  problemTitle: string[];
  pains: Pain[];
  solution: string[];
  showcaseTitle: string[];
  stepsTitle: string[];
  steps: Step[];
  /**
   * product-usage questions (COD/delivery/exchange questions come from the common copy). Two are
   * shown; with more than two, the first is the family's key question and always shown.
   */
  faq: Qa[];
  story: { title: string; text: string }[];
  comparison: CompareRow[];
  marquee: string[];
  voice?: FamilyVoice;
  facets?: Partial<Record<Facet, FacetCopy>>;
}

/**
 * Lines for a facet. Text pools (headline, sub…) replace the family's when a facet has some (the
 * pools of several facets are merged); benefits lead the family's, Q&As / steps / pains / rows
 * replace the family's item on the same topic.
 */
export interface FacetCopy {
  kicker?: string[];
  headline?: Line[];
  sub?: string[];
  bigWord?: string[];
  tagline?: string[];
  benefitsTitle?: string[];
  benefits?: Benefit[];
  problemTitle?: string[];
  pains?: Pain[];
  solution?: string[];
  steps?: Step[];
  faq?: Qa[];
  story?: { title: string; text: string }[];
  comparison?: CompareRow[];
  marquee?: string[];
}

/** Copy shared by every family (one locale): COD reassurance, conversion, section titles. */
export interface CommonCopy {
  heroCta: string[];
  announcement: string[];
  trust: { icon: IconName; text: string }[];
  kickers: {
    benefits: string[];
    problem: string[];
    showcase: string[];
    steps: string[];
    story: string[];
    reviews: string[];
    socialProof: string[];
    gallery: string[];
    specs: string[];
    offer: string[];
    guarantee: string[];
    form: string[];
    cta: string[];
    faq: string[];
  };
  benefitsLead: string[];
  problemLead: string[];
  showcaseLead: string[];
  reviewsTitle: string[];
  socialProofTitle: string[];
  galleryTitle: string[];
  specsTitle: string[];
  comparison: { title: string[]; us: string; them: string };
  offer: { title: string[]; lead: string[]; cta: string[] };
  guarantee: { title: string[]; lines: string[] };
  form: { title: string[]; lead: string[]; submit: string[]; reassurance: string[] };
  cta: { title: string[]; text: string[]; button: string[] };
  faqTitle: string[];
  /** cash on delivery, delivery, inspection, exchange: 2 phrasings each */
  faq: { cod: Qa[]; delivery: Qa[]; inspect: Qa[]; exchange: Qa[] };
  sticky: { label: string[]; note: string[] };
  whatsapp: { label: string[]; message: string[] };
  bundles: [{ title: string; subtitle: string }, { title: string; subtitle: string }, { title: string; subtitle: string }];
  /**
   * Names of the offers the generator suggests on multi-item pages and the offer presets (Offers v2,
   * docs/OFFERS.md §H.1): titles ≤ 60, subtitles ≤ 90, shorts (segment labels) ≤ 14. `{n}` = a
   * count. No item names (the card's contents line shows them, and they follow renames), no prices.
   */
  offers: OfferCopy;
  seo: { title: string[]; description: string[] };
  thankYou: { title: string[]; message: string[] };
  /** market phrases for the {where} slot */
  where: { MA: string; other: string };
}

/** One suggested offer's words (see CommonCopy.offers). */
export interface OfferWords {
  title: string;
  subtitle: string;
  /** segment label when the automatic one would repeat another offer's ("×3" for a color pack) */
  short?: string;
}

export interface OfferCopy {
  /** one piece among 2+ products */
  choice: OfferWords;
  /** {n} pieces among 2+ products */
  anyN: OfferWords;
  /** two different products together */
  duo: OfferWords;
  /** three different products together */
  trio: OfferWords;
  /** every product of the page */
  set: OfferWords;
  /** one bought, one free */
  bogo: OfferWords;
  /** one piece in each of {n} colors */
  colors: OfferWords;
}

export interface LocaleLibrary {
  common: CommonCopy;
  families: Record<Family, FamilyCopy>;
}
