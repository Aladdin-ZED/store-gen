/**
 * Differentiate in the builder (P6 DESIGN; design.md DES-§15.3, UX-24). Kept apart from ./panel.ts because the
 * resamples need the generator (src/lib/generator/remix.ts): the builder loads this module on demand, the first time
 * the Uniqueness group offers Differentiate.
 */
import type { PageDoc } from "@/lib/page/schema";
import { differentiateVariants, type DifferentiateVariant } from "./differentiate";
import { packView } from "./distance";

/** A Differentiate variant as a doc the builder can preview (before / after) and apply as one edit. */
export interface DiffCandidate {
  key: string;
  gene: DifferentiateVariant["gene"];
  to: string;
  doc: PageDoc;
  vec: number[];
}

/**
 * The page's ≤ 6 Differentiate candidates (DES-§15.3): the unlocked G2 / G18 first, then G4 / G9, the brand's and the
 * page's locks never moved. Each candidate is the page with the variant's theme; sections and copy stay.
 */
export function differentiateDocs(doc: PageDoc, seed: number, locked: Iterable<string> = []): DiffCandidate[] {
  return differentiateVariants(doc, seed, { locked }).map((v, i) => ({ key: `d${i}`, gene: v.gene, to: v.to, doc: { ...doc, theme: v.theme }, vec: packView(v.view) }));
}

/**
 * The first candidate that clears every band (DES-§15.3): never a platform `too_close`, never the clone flag, and no
 * band left `too_close`; a niche or own `close` still clears. Null = no seed found (the three differentiators show).
 */
export function pickDifferentiate<T extends { key: string }>(candidates: readonly T[], verdicts: readonly { key: string; platform: string; niche: string; own: string; clone: boolean }[]): T | null {
  for (const c of candidates) {
    const v = verdicts.find((x) => x.key === c.key);
    if (!v || v.clone) continue;
    if (v.platform === "too_close" || v.niche === "too_close" || v.own === "too_close") continue;
    return c;
  }
  return null;
}
