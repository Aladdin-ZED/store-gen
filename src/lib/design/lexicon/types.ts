/**
 * Shapes of the copy lexicons (P6 DESIGN; design.md DES-§9.3, DES-§9.4, DES-§9.6, QUAL-22). Pure data types.
 *
 * An entry is written as a stem with an inflection class; the matcher (../cliche.ts) compares the matching keys of
 * the normaliser (../text/normalize.ts) on both sides, so "découvrir l'univers", "découvre l'univers" and "sublime"
 * hit, not only the exact phrase. Frames use `…` as a gap of 1-6 tokens.
 */

/**
 * `fr`: `v1` -er verbs, `adj` gendered / plural adjectives, `n` nouns with a plural (all three: the lemma key);
 * `ar`: `v` a verb with the common conjugation prefixes ي / ت / ن / أ and suffixes (the verb key), `n` a noun with
 * the clitics and suffixes of DES-§9.1 (the stem key), `fixed` a frozen phrase (surface and clitic only);
 * `en`: the light stem everywhere (no class needed).
 */
export type InflectionClass = "v1" | "adj" | "n" | "v" | "fixed";

export interface LexEntry {
  p: string;
  w: 1 | 2 | 3;
  k: "word" | "phrase" | "frame";
  infl?: InflectionClass;
  /** other surface forms of the first token the stem rules cannot reach (an Arabic masdar: "اكتشاف" for "اكتشف") */
  alt?: readonly string[];
}

/** One locale's lexicons. */
export interface LocaleLexicon {
  /** the cliché seed list (DES-§9.3); owner and copy reviewers extend it */
  cliches: readonly LexEntry[];
  /** sensory verbs and nouns (DES-§9.6): a sentence naming one is specific */
  senses: readonly string[];
  /** words of a cash-on-delivery or delivery fact (DES-§9.6): the store's own policy, every page is COD */
  cod: readonly string[];
  /** places and moments of the warm register (DES-§9.10): never a claim, never a number */
  places: readonly string[];
}

/** Compact entry writer: the kind follows from the text (a gap → frame, a space → phrase). */
export function lex(p: string, w: 1 | 2 | 3, infl?: InflectionClass, alt?: readonly string[]): LexEntry {
  const k: LexEntry["k"] = p.includes("…") ? "frame" : /\s/.test(p.trim()) ? "phrase" : "word";
  return { p, w, k, ...(infl ? { infl } : {}), ...(alt ? { alt } : {}) };
}
