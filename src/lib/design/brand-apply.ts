/**
 * "Apply my brand to this page" and the brand side of the DNA card's locks (P6 DESIGN; design.md DES-§11.6,
 * DES-§12.3, DES-§15.4). Pure and isomorphic: the builder applies the result as one normal draft edit (one ⌘Z),
 * published by the owner like any other change.
 *
 *   const next = applyBrand(doc, brand);   // null: the page already wears the brand
 *   brandLockedGenes(brand)                // ["G1", "G4", …]: what generation and Differentiate never move
 */
import { ARCHETYPES, type Archetype, type PageDoc } from "@/lib/page/schema";
import { genomeOf } from "./derive";
import type { DesignGenome } from "./genome";
import { applyOps } from "./gates/apply";
import { loadCatalogue } from "./pairings";
import type { RepairOp } from "./gates/repair";
import { GENE_VOCAB } from "./vocab";

/** The bold genes the DNA card can lock (DES-§15.4: seven toggles). */
export const LOCK_GENES = ["G1", "G2", "G4", "G9", "G18", "G23", "G28"] as const;
export type LockGene = (typeof LOCK_GENES)[number];
/** Page genes: locked per page only ("Page genes lock per page"). */
export const PAGE_ONLY_GENES: ReadonlySet<LockGene> = new Set(["G2", "G18"]);
/** The brand genes the brand setting stores itself (`brand.genes`); G4 is `fonts.locked`, G28 the store voice. */
export const BRAND_SETTING_GENES = ["G1", "G9", "G23"] as const;
export type BrandSettingGene = (typeof BRAND_SETTING_GENES)[number];

/** The part of the brand setting (and the store voice) the builder reads, as the design context action returns it. */
export interface BrandLite {
  accent: string | null;
  pop: string | null;
  base: "light" | "tinted" | "dark" | null;
  neutralHue: number | null;
  pairing: string | null;
  fontsLocked: boolean;
  colorLocks: readonly string[];
  genes: Partial<Record<BrandSettingGene, string>>;
  /** the store voice is set (G28 reads it as a lock) */
  voice: boolean;
}

/** The genes the brand locks (DES-§12.3): `brand.genes` keys, G4 with `fonts.locked`, G28 with a set voice. */
export function brandLockedGenes(brand: BrandLite | null): LockGene[] {
  if (!brand) return [];
  const out: LockGene[] = BRAND_SETTING_GENES.filter((g) => typeof brand.genes[g] === "string");
  if (brand.fontsLocked && brand.pairing) out.push("G4");
  if (brand.voice) out.push("G28");
  return out;
}

/** The page's current value of a lockable gene (G23: its ease family), the value a brand lock stores. */
export function geneValue(g: DesignGenome, gene: LockGene): string {
  switch (gene) {
    case "G1":
      return g.brand.G1;
    case "G2":
      return g.page.G2;
    case "G4":
      return g.brand.G4;
    case "G9":
      return g.brand.G9;
    case "G18":
      return g.page.G18;
    case "G23":
      return g.brand.G23.f;
    case "G28":
      return g.brand.G28;
  }
}

/** True when the value is in the gene's vocabulary (the save path's check, DES-§12.3). */
export function validBrandGene(gene: BrandSettingGene, value: string): boolean {
  const entry = GENE_VOCAB[gene];
  return !!entry && entry.kind === "enum" && (entry.values ?? []).includes(value);
}

/**
 * The page with the brand's colours, pairing and locked genes (DES-§11.6), or null when nothing changes. Colours and
 * the base are copied as set; the pairing and the brand genes move through `changeGene`, so the look is re-compiled
 * exactly as a repair would (a gene the page locks stays).
 */
export function applyBrand(doc: PageDoc, brand: BrandLite): PageDoc | null {
  let d = structuredClone(doc);
  const ops: RepairOp[] = [];
  if (brand.pairing) ops.push({ op: "changeGene", gene: "G4", to: brand.pairing });
  // G1 and G9 move through the repair; G23's lock is its ease family, read by generation (the look keeps its motion)
  for (const gene of ["G1", "G9"] as const) {
    const to = brand.genes[gene];
    if (to && validBrandGene(gene, to)) ops.push({ op: "changeGene", gene, to });
  }
  if (d.theme.look) {
    if (ops.length) d = applyOps(d, genomeOf(d), ops).doc;
  } else if (brand.pairing) {
    // a page made before design DNA has no look to re-compile: the pairing's faces are set directly
    const pair = loadCatalogue().byId.get(brand.pairing);
    if (pair) d.theme.fonts = { display: pair.display, body: pair.body, ...(pair.accent ? { accent: pair.accent } : {}), displayAr: pair.displayAr, bodyAr: pair.bodyAr };
  }
  // the brand's own colours last: a strategy change re-plans the pop, the brand's set pop still wins
  const p = d.theme.palette;
  if (brand.accent) p.accent = brand.accent;
  if (brand.pop) p.pop = brand.pop;
  if (brand.base) p.base = brand.base;
  if (brand.neutralHue !== null) p.neutralHue = brand.neutralHue;
  const archetype = brand.genes.G1;
  if (archetype && (ARCHETYPES as readonly string[]).includes(archetype)) d.theme.archetype = archetype as Archetype;
  return JSON.stringify(d.theme) === JSON.stringify(doc.theme) ? null : d;
}
