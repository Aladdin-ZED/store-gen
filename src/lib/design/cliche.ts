/**
 * The cliché and specificity detector (P6 DESIGN; design.md DES-§9.3, DES-§9.9, DG-07; docs/STORE-SAAS.md §K.2 P0
 * design stubs). Pure and isomorphic. P7's guard v2 (rule 6) re-asks when hero + benefits score above 1.0 or any
 * weight-3 hit appears. P0 stub: no lexicon yet, so no hit and a score of 0 (no re-ask, today's behaviour). P6
 * replaces the body with the ar / fr / en lexicons and adds `structureOf`, `specificity`, `copyReport`, `shingles`,
 * `jaccard`, `registerOf`, `articleCheck` and `numbersReport`; the frozen signature is in src/lib/contracts/r1-p0.ts.
 */
import type { Locale } from "@/lib/page/schema";
import type { DesignGateItem } from "./gates/types";

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

/** Hits per 100 words, weighted. */
export function clicheScore(text: string, locale: Locale): { score: number; hits: ClicheHit[] } {
  void text;
  void locale;
  return { score: 0, hits: [] };
}
