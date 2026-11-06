/**
 * GENE_VOCAB, the closed vocabulary of gene values (P6 DESIGN; design.md DES-§4.1, DES-§4.2, DS59; docs/STORE-SAAS.md
 * §K.2 P0 design stubs). The only list of gene values: schemas, priors, the Director prompt (ai.md AI-§D.3 validates
 * against it and `test:ai` asserts the prompt block equals it) and the studio sliders import it.
 *
 * Every one of the 35 genes has an entry (the frozen shape of src/lib/contracts/r1-p0.ts): `enum` genes list their
 * values in the table's order, `range` genes give `[min, max, step]`, `struct` genes have their parts in
 * `GENE_PARTS` (the frozen entry carries no parts). G4's values are the pairing catalogue's loaded ids (DES-§10.3), so
 * a pairing whose faces are pending is never offered. G23 is the sampled family `G23.f` (bold); its solved parts (d,
 * r, st, sc) are `GENE_PARTS.G23`. `bucketOf()` maps a value to its `gene_stats` bucket (DES-§2.5).
 */
import { ARCHETYPES, COLOR_STRATEGIES, DEPTHS, EASE_FAMILIES, GRAMMARS, LADDERS, MASKS, REVEALS, TREATMENTS } from "@/lib/page/schema";
import { ANGLES, ASPECTS, CROPS, HEADLINE_STRUCTURES, OPENERS, VOICE_REGISTERS } from "./consts";
import type { GeneKey, GeneLevel } from "./genome";
import { loadCatalogue } from "./pairings";

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

/** One part of a struct gene: an enum part or a numeric range part. */
export interface GenePart {
  values?: readonly (string | number)[];
  range?: readonly [min: number, max: number, step: number];
}

/** The pairing ids the sampler may draw (the loaded catalogue; DES-§10.3). */
const pairingIds = (): readonly string[] => loadCatalogue().pairings.map((p) => p.id);

export const DENSITY_LEVELS = ["airy", "balanced", "dense"] as const;
export const DENSITY_PATTERNS = ["ABAC", "AAB", "ABAB"] as const;
export const ALIGN_BIASES = ["start", "mixed", "center-statement"] as const;
export const GLYPHS = ["dot", "spark", "diamond", "none"] as const;
export const NUMBERINGS = ["none", "plain", "padded"] as const;
export const CAPTIONS = ["mono", "smallcaps", "italic-serif", "plain"] as const;
export const EMPHASES = ["none", "swoosh", "highlight", "color", "italic"] as const;
export const BUTTONS = ["solid", "pill", "soft", "outline", "underline", "glow"] as const;
export const DARIJA = ["none", "cta", "light"] as const;
export const SPLITS = ["1:1", "5:7", "4:8", "3:9", "golden"] as const;
export const MARGINS = ["narrow", "wide", "offset"] as const;
export const LABELS = ["mono", "smallcaps", "plain"] as const;
export const REVEAL_SCOPES = ["heads", "hero", "none"] as const;

export const GENE_VOCAB: Readonly<Record<GeneKey, GeneVocabEntry>> = {
  G1: { level: "brand", kind: "enum", bold: true, values: ARCHETYPES },
  G2: { level: "page", kind: "enum", bold: true, values: GRAMMARS },
  G3: { level: "page", kind: "struct", bold: false },
  G4: { level: "brand", kind: "enum", bold: true, values: pairingIds() },
  G5: { level: "brand", kind: "struct", bold: false },
  G6: { level: "brand", kind: "struct", bold: false },
  G7: { level: "brand", kind: "struct", bold: false },
  G8: { level: "brand", kind: "enum", bold: false, values: ["lining", "oldstyle"] },
  G9: { level: "brand", kind: "enum", bold: true, values: COLOR_STRATEGIES },
  G10: { level: "page", kind: "range", bold: false, range: [0.03, 0.35, 0.01] },
  G11: { level: "brand", kind: "enum", bold: false, values: ["standard", "high"] },
  G12: { level: "brand", kind: "enum", bold: false, values: LADDERS },
  G13: { level: "brand", kind: "enum", bold: false, values: ["circle", "squircle"] },
  G14: { level: "brand", kind: "struct", bold: false },
  G15: { level: "brand", kind: "enum", bold: false, values: DEPTHS },
  G16: { level: "page", kind: "enum", bold: false, values: ["0", "1", "2"] },
  G17: { level: "brand", kind: "enum", bold: false, values: MASKS },
  G18: { level: "page", kind: "enum", bold: true, values: TREATMENTS },
  G19: { level: "section", kind: "struct", bold: false },
  G20: { level: "page", kind: "struct", bold: false },
  G21: { level: "page", kind: "range", bold: false, range: [0.75, 1.6, 0.05] },
  G22: { level: "page", kind: "enum", bold: false, values: ALIGN_BIASES },
  /** the sampled family G23.f (d, r, st, sc are solved from it, DES-§4.12; GENE_PARTS.G23) */
  G23: { level: "brand", kind: "enum", bold: true, values: EASE_FAMILIES },
  G24: { level: "page", kind: "struct", bold: false },
  G25: { level: "brand", kind: "struct", bold: false },
  G26: { level: "brand", kind: "enum", bold: false, values: EMPHASES },
  G27: { level: "brand", kind: "enum", bold: false, values: BUTTONS },
  G28: { level: "brand", kind: "enum", bold: true, values: VOICE_REGISTERS },
  G29: { level: "section", kind: "enum", bold: false, values: HEADLINE_STRUCTURES },
  G30: { level: "brand", kind: "struct", bold: false },
  G31: { level: "brand", kind: "enum", bold: false, values: DARIJA },
  G32: { level: "page", kind: "struct", bold: false },
  G33: { level: "page", kind: "struct", bold: false },
  G34: { level: "page", kind: "struct", bold: false },
  G35: { level: "page", kind: "struct", bold: false },
};

/** The parts of the struct genes (and the solved parts of G23), with their values or `[min, max, step]` (DES-§4.2). */
export const GENE_PARTS: Readonly<Partial<Record<GeneKey, Readonly<Record<string, GenePart>>>>> = {
  G3: { c: { values: [4, 8, 12] }, s: { values: SPLITS }, m: { values: MARGINS }, w: { range: [1080, 1440, 40] }, u: { values: [4, 8] } },
  G5: { rm: { range: [1.125, 1.25, 0.025] }, rd: { range: [1.2, 1.5, 0.025] }, dmax: { range: [48, 160, 8] } },
  G6: { w: { range: [100, 900, 10] }, wAr: { range: [100, 900, 10] }, tk: { range: [0, 0.03, 0.005] } },
  G7: { dc: { values: ["none", "uppercase"] }, lb: { values: LABELS } },
  G14: { w: { values: [0, 1, 1.5] }, s: { range: [0.08, 0.3, 0.02] } },
  G19: { a: { values: ASPECTS }, f: { values: ["thirds", "center", "bleed"] } },
  G20: { l: { values: DENSITY_LEVELS }, p: { values: DENSITY_PATTERNS } },
  G23: { f: { values: EASE_FAMILIES }, d: { range: [180, 900, 20] }, r: { values: REVEALS }, st: { range: [30, 80, 5] }, sc: { values: [0, 1] } },
  G25: { gl: { values: GLYPHS }, nb: { values: NUMBERINGS }, cap: { values: CAPTIONS } },
  G30: { mw: { range: [5, 14, 1] }, ex: { values: [0, 1] } },
  G32: { openers: { values: OPENERS } },
  G33: { crop: { values: CROPS }, aspect: { values: ASPECTS } },
  G35: { scope: { values: REVEAL_SCOPES }, kinds: { values: REVEALS }, nodes: { range: [0, 60, 1] } },
};

/**
 * The solver order of DES-§4.2 ("Order" column: smallest effective domain first, ties by this number). The bold genes
 * are sampled first (G1 … G28 in their own order); the rhythm genes and G24 are solved after the choreography expansion.
 */
export const GENE_ORDER: Readonly<Partial<Record<GeneKey, number>>> = {
  G16: 2, G10: 3, G20: 4, G5: 5, G6: 6, G7: 7, G12: 8, G3: 9, G15: 10, G17: 11, G14: 12, G21: 13, G22: 14, G23: 15, G25: 16,
  G26: 17, G27: 18, G8: 20, G11: 21, G13: 22, G30: 23, G31: 24,
};

/** The bold genes in sampling order (DES-§4.4: each conditions the next). */
export const BOLD_ORDER = ["G1", "G2", "G9", "G4", "G18", "G23", "G28"] as const;

/** The grid values of a range part (inclusive, rounded to the step's decimals). */
export function rangeValues([min, max, step]: readonly [number, number, number]): number[] {
  const out: number[] = [];
  const digits = Math.max(0, -Math.floor(Math.log10(step)) + 1);
  for (let k = 0; ; k++) {
    const v = Math.round((min + k * step) * 10 ** digits) / 10 ** digits;
    if (v > max + 1e-9) break;
    out.push(v);
  }
  return out;
}

/** The nearest grid value of a range (clamped). */
export function snap(v: number, [min, max, step]: readonly [number, number, number]): number {
  const k = Math.round((Math.min(max, Math.max(min, v)) - min) / step);
  const digits = Math.max(0, -Math.floor(Math.log10(step)) + 1);
  return Math.round(Math.min(max, min + k * step) * 10 ** digits) / 10 ** digits;
}

const inEnum = (gene: GeneKey, v: string) => !!GENE_VOCAB[gene].values?.includes(v);

/**
 * A gene value from its string form (a Director hint, a pin, a lock), or null when it is not in the vocabulary. Enum
 * genes take the value itself; G10 / G21 a number inside the range (snapped to the step); G16 "0" | "1" | "2"; G20
 * "airy" or "airy/ABAC"; G23 the family; G3 "12/5:7/offset" (columns / split / margin). Other struct genes are never
 * hinted, pinned or locked, so they return null.
 */
export function parseGeneValue(gene: string, raw: unknown): string | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const s = String(raw).trim().slice(0, 48);
  if (!(gene in GENE_VOCAB)) return null;
  const g = gene as GeneKey;
  const entry = GENE_VOCAB[g];
  if (g === "G20") {
    const [l, p] = s.split("/");
    if (!l || !(DENSITY_LEVELS as readonly string[]).includes(l)) return null;
    if (p !== undefined && !(DENSITY_PATTERNS as readonly string[]).includes(p)) return null;
    return p ? `${l}/${p}` : l;
  }
  if (g === "G3") {
    const [c, sp, m] = s.split("/");
    if (!["4", "8", "12"].includes(c ?? "") || !(SPLITS as readonly string[]).includes(sp ?? "") || !(MARGINS as readonly string[]).includes(m ?? "")) return null;
    return `${c}/${sp}/${m}`;
  }
  if (entry.kind === "enum") return inEnum(g, s) ? s : null;
  if (entry.kind === "range" && entry.range) {
    const n = Number(s);
    if (!Number.isFinite(n) || n < entry.range[0] - 1e-9 || n > entry.range[1] + 1e-9) return null;
    return String(snap(n, entry.range));
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* gene_stats buckets (DES-§2.5, DES-§4.2)                             */
/* ------------------------------------------------------------------ */

const band = (v: number, edges: readonly number[], labels: readonly string[]) => {
  for (let i = 0; i < edges.length; i++) if (v < edges[i]!) return labels[i]!;
  return labels[labels.length - 1]!;
};
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/**
 * The `gene_stats` bucket of a value (DES-§4.2): G5 rd → "1.20-1.30" | "1.30-1.40" | "1.40-1.50"; G6 w → hundreds;
 * G10 → "03-08" | "08-16" | "16-25" | "25-35"; G21 → "0.75-1.0" | "1.0-1.25" | "1.25-1.6"; G23 → family / d band
 * ("180-300" | "300-600" | "600-900"); other structs → their categorical parts joined with "/" ("12/5:7/offset");
 * enums and the copy gene "angle" → the value. The rhythm genes G24 and G32-G35 are not learned: null. A value
 * outside the vocabulary is null too.
 */
export function bucketOf(gene: GeneKey | "angle", value: unknown): string | null {
  if (gene === "angle") return typeof value === "string" && (ANGLES as readonly string[]).includes(value) ? value : null;
  if (gene === "G24" || gene === "G32" || gene === "G33" || gene === "G34" || gene === "G35") return null;
  const entry = GENE_VOCAB[gene];
  const r = rec(value);
  switch (gene) {
    case "G5":
      return typeof r.rd === "number" ? band(r.rd, [1.3, 1.4], ["1.20-1.30", "1.30-1.40", "1.40-1.50"]) : null;
    case "G6":
      return typeof r.w === "number" ? String(Math.min(900, Math.max(100, Math.floor(r.w / 100) * 100))) : null;
    case "G10":
      return typeof value === "number" ? band(value, [0.08, 0.16, 0.25], ["03-08", "08-16", "16-25", "25-35"]) : null;
    case "G21":
      return typeof value === "number" ? band(value, [1.0, 1.25], ["0.75-1.0", "1.0-1.25", "1.25-1.6"]) : null;
    case "G16":
      return typeof value === "number" && [0, 1, 2].includes(value) ? String(value) : null;
    case "G23":
      if (typeof r.f !== "string" || typeof r.d !== "number") return typeof value === "string" && inEnum("G23", value) ? value : null;
      return `${r.f}/${band(r.d, [300, 600], ["180-300", "300-600", "600-900"])}`;
    case "G3":
      return r.c !== undefined ? `${r.c}/${r.s}/${r.m}` : null;
    case "G7":
      return r.dc !== undefined ? `${r.dc}/${r.lb}` : null;
    case "G14":
      return r.w !== undefined ? String(r.w) : null;
    case "G19":
      return r.a !== undefined ? `${r.a}/${r.f}` : null;
    case "G20":
      return r.l !== undefined ? `${r.l}/${r.p}` : null;
    case "G25":
      return r.gl !== undefined ? `${r.gl}/${r.nb}/${r.cap}` : null;
    case "G30":
      return typeof r.mw === "number" ? `${band(r.mw, [8, 11], ["5-7", "8-10", "11-14"])}/${r.ex}` : null;
  }
  if (entry.kind === "enum") return typeof value === "string" && inEnum(gene, value) ? value : null;
  return null;
}
