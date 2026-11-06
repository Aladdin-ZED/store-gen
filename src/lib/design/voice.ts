/**
 * The copy voice system as data (P6 DESIGN; design.md DES-§9.10, G28 / G30 / G31, DS44). Pure and isomorphic. The
 * five registers of G28 are voices: each fixes the sentence rhythm, the headline structures (DES-§9.5 weights,
 * compile.ts `STRUCTURE_WEIGHTS`), what a lead may do and how ar / fr / en realise it. The compositional generator
 * (copy-gen.ts), the library and the Director prompts (ai.md) read this one table.
 */
import type { Locale } from "@/lib/page/schema";
import type { BrandGenes, VoiceRegister } from "./genome";
import { textLocale } from "./text/normalize";

export interface VoiceRules {
  /** G30: the mean words per sentence the register keeps to (inclusive range) */
  words: readonly [number, number];
  /** G30: exclamation marks a page may carry (only ever on the final CTA) */
  exclaim: 0 | 1;
  /** the lead and body rule, in one line (for the Director prompt and the brand page) */
  lead: string;
  /** a metaphor or an image is allowed (poetic-restrained: one per sentence; precise: never) */
  image: boolean;
  /** a place or a moment of the warm list may be named (`{place}`) */
  place: boolean;
  /** the per-locale realisation: words a line of the register never uses (matched on the lexicon's keys) */
  avoid: Readonly<Record<"ar" | "fr" | "en", readonly string[]>>;
  /** the per-locale realisation, for the prompts and the brand page */
  realise: Readonly<Record<"ar" | "fr" | "en", string>>;
}

export const VOICE: Readonly<Record<VoiceRegister, VoiceRules>> = {
  plain: {
    words: [7, 9],
    exclaim: 0,
    lead: "one fact per sentence; verbs in the present; no adjective without a noun it measures",
    image: false,
    place: false,
    avoid: { ar: [], fr: ["découvrez", "découvrir"], en: ["discover"] },
    realise: { ar: "MSA short sentences; Darija in CTAs and FAQ questions when G31 ≥ cta", fr: "vous, present, no « découvrez »", en: "plain present, no « discover »" },
  },
  warm: {
    words: [9, 12],
    exclaim: 1,
    lead: "second person, a place or a moment, one sensory noun per lead",
    image: false,
    place: true,
    avoid: { ar: [], fr: ["tu", "toi", "ton", "ta", "tes"], en: [] },
    realise: { ar: "MSA with Darija warmth words in CTAs (دابا, ديالك)", fr: "never tutoiement; « chez vous » allowed", en: "contractions allowed" },
  },
  precise: {
    words: [6, 9],
    exclaim: 0,
    lead: "numbers only from the merchant's; materials, dimensions, counts; no metaphor",
    image: false,
    place: false,
    avoid: { ar: [], fr: [], en: [] },
    realise: { ar: "MSA only in the body; a Darija CTA is allowed", fr: "nominal sentences allowed (« Lame en acier. »)", en: "spec-sheet nouns" },
  },
  bold: {
    words: [4, 7],
    exclaim: 1,
    lead: "imperative or a word and a subline; at most two clauses; the exclamation, if any, on the final CTA",
    image: false,
    place: false,
    avoid: { ar: [], fr: [], en: [] },
    realise: { ar: "Darija-leaning when G31 = light (مصنوع باش يدوم)", fr: "imperatives (« Faites-le durer. »)", en: "imperatives" },
  },
  "poetic-restrained": {
    words: [8, 12],
    exclaim: 0,
    lead: "one image per sentence, concrete nouns, no « world of »; a contrast pair allowed once per page",
    image: true,
    place: true,
    avoid: { ar: ["عالم"], fr: ["univers", "sublimer", "sublime"], en: ["elevate", "tapestry", "world"] },
    realise: { ar: "MSA, no Darija in the body; the CTA may be Darija", fr: "no « univers », no « sublimer »", en: "no « elevate », no « tapestry »" },
  },
};

/** Surfaces of a page where Darija may appear, per G31 (DES-§9.4 register row: the planner's rule). */
export type Surface = "title" | "lead" | "body" | "cta" | "sticky" | "form" | "faq-q" | "faq-a" | "kicker";

/** Whether a line in `r` may sit on `surface` of a page whose Darija gene is `darija` (ar only; fr / en: always). */
export function registerAllowed(r: "msa" | "darija" | "none" | "mixed", surface: Surface, darija: BrandGenes["G31"], locale: Locale): boolean {
  if (textLocale(locale) !== "ar" || r === "none" || r === "msa") return true;
  if (darija === "none") return false;
  const cta: readonly Surface[] = ["cta", "sticky", "form", "faq-q"];
  if (cta.includes(surface)) return true;
  // light: leads, bodies and FAQ answers too, and the bold register's Darija-leaning titles (DES-§9.10)
  return darija === "light" && (surface === "lead" || surface === "faq-a" || surface === "body" || surface === "title");
}

/** Mean words per sentence within the register's band, with one word of slack on each side (G30). */
export function rhythmFits(meanWords: number, register: VoiceRegister, slack = 1): boolean {
  const [lo, hi] = VOICE[register].words;
  return meanWords >= lo - slack && meanWords <= hi + slack;
}
