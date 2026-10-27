/**
 * GENE_VOCAB, the closed vocabulary of gene values (P6 DESIGN; design.md DES-§4.1, DES-§4.2, DS59; docs/STORE-SAAS.md
 * §K.2 P0 design stubs). The only list of gene values: schemas, priors, the Director prompt (ai.md AI-§D.3 validates
 * against it and `test:ai` asserts the prompt block equals it) and the studio sliders import it.
 *
 * P0: the enumerated genes whose values the gene table (DES-§4.2) and the frozen `ThemeSpec.look` vocabulary
 * (src/lib/page/schema.ts) already fix. P6 completes it at its merge: G4 from the pairing catalogue (DES-§10.3), the
 * ranges and structs with their steps, and `bucketOf()`; the entry shape is frozen (src/lib/contracts/r1-p0.ts).
 */
import { ARCHETYPES, COLOR_STRATEGIES, DEPTHS, EASE_FAMILIES, GRAMMARS, LADDERS, MASKS, TREATMENTS } from "@/lib/page/schema";
import { HEADLINE_STRUCTURES, VOICE_REGISTERS, type GeneKey, type GeneLevel } from "./genome";

export interface GeneVocabEntry {
  level: GeneLevel;
  kind: "enum" | "range" | "struct";
  /** one of the seven bold genes (sampled, DES-§4.3) */
  bold: boolean;
  /** enum: every allowed value, in the table's order */
  values?: readonly string[];
  /** range: [min, max, step] */
  range?: readonly [min: number, max: number, step: number];
}

export const GENE_VOCAB: Readonly<Partial<Record<GeneKey, GeneVocabEntry>>> = {
  G1: { level: "brand", kind: "enum", bold: true, values: ARCHETYPES },
  G2: { level: "page", kind: "enum", bold: true, values: GRAMMARS },
  G8: { level: "brand", kind: "enum", bold: false, values: ["lining", "oldstyle"] },
  G9: { level: "brand", kind: "enum", bold: true, values: COLOR_STRATEGIES },
  G11: { level: "brand", kind: "enum", bold: false, values: ["standard", "high"] },
  G12: { level: "brand", kind: "enum", bold: false, values: LADDERS },
  G13: { level: "brand", kind: "enum", bold: false, values: ["circle", "squircle"] },
  G15: { level: "brand", kind: "enum", bold: false, values: DEPTHS },
  G17: { level: "brand", kind: "enum", bold: false, values: MASKS },
  G18: { level: "page", kind: "enum", bold: true, values: TREATMENTS },
  G22: { level: "page", kind: "enum", bold: false, values: ["start", "mixed", "center-statement"] },
  /** the sampled family G23.f (d, r, st, sc are solved from it, DES-§4.12) */
  G23: { level: "brand", kind: "enum", bold: true, values: EASE_FAMILIES },
  G26: { level: "brand", kind: "enum", bold: false, values: ["none", "swoosh", "highlight", "color", "italic"] },
  G27: { level: "brand", kind: "enum", bold: false, values: ["solid", "pill", "soft", "outline", "underline", "glow"] },
  G28: { level: "brand", kind: "enum", bold: true, values: VOICE_REGISTERS },
  G29: { level: "section", kind: "enum", bold: false, values: HEADLINE_STRUCTURES },
  G31: { level: "brand", kind: "enum", bold: false, values: ["none", "cta", "light"] },
};
