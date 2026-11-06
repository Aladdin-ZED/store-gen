/**
 * The designer seed shape (P6 DESIGN; design.md DES-§17.2, DES-§7.7 MAP-Elites elites, DS22). Parameters only: gene
 * values from GENE_VOCAB (the lock syntax of `SampleOpts.locks`: enum values, `G3` "cols/split/margin", `G20`
 * "level/pattern", `G16` the budget as a string), never a store id, a genome id or page text.
 */
import type { Archetype, Locale } from "@/lib/page/schema";
import type { GeneKey } from "../genome";

export interface DesignerSeed {
  /** `<archetype>-<grammar>` */
  id: string;
  archetype: Archetype;
  /** the locked genes: the six bold page and brand genes and the derived genes the solver locks */
  genes: Partial<Record<GeneKey, string>>;
  /** the QA fixture the seed is gated and rendered on (src/lib/page/fixtures.ts) */
  review: { fixture: string; locale: Extract<Locale, "ar" | "fr">; brandSeed: string; direction: 0 | 1 | 2 };
}
