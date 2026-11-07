/**
 * The Brand Genome (design.md DES-§11.2; R2 store generation; pure). Track S2 BRAND & LOGO owns this file in R2 and
 * writes `sampleBrand` (G1 from `rankArchetypes` over the pooled palettes and the majority category; G4, G9, G28 under
 * the locks; the brand-level genes through P6's solver; the house genes; `GeneHints` validated, locks win;
 * deterministic per seed and inputs), `houseGenes`, `brandDistance`, `campaignDrift`, `bringCloser`. The contract step
 * (C2-C) froze the shapes and the two functions other tracks call before S2 merges:
 *   - S1 STOREFRONT: `houseGenes(brand)` for `expandHome`, `sampleBrand` for `startStoreDesign`'s instant candidates;
 *   - S2's own `compileBlueprint` (S7 AI DATA's blueprint compiles through it).
 * `sampleBrand` is a stub until S2 merges (throws `NotBuiltYet("S2", "sampleBrand")`); `houseGenes` reads the frozen
 * field. No R1 path calls either (R1 keeps the brand setting's locks, DES-§11.6).
 */
import type { z } from "zod";
import { notBuiltYet } from "@/lib/contracts/not-built";
import type { ProductCategory } from "@/lib/page/schema";
import type { BrandSetting, ColorRole } from "@/lib/settings/keys/brand";
import type { ExtractedPalette } from "@/lib/theme/types";
import type { BrandGenes, GeneKey, PageGenes } from "./genome";
import type { GeneHints } from "./hints";

/** Locked brand parts (from the brand setting / the store theme, DES-§12.3): never resampled. */
export interface BrandLocks {
  colors: z.infer<typeof ColorRole>[];
  pairing: boolean;
  genes: GeneKey[];
}

export interface BrandGenome {
  v: 1;
  brand: BrandGenes;
  /** the store's default page rhythm */
  house: Pick<PageGenes, "G3" | "G16" | "G20" | "G21" | "G22">;
  locks: BrandLocks;
  seed: number;
  logo?: { version: number } | null;
}

/** DES-§14.4 step 2: the store's products (palettes and category), the brand kit, the brand seed and the niche. */
export interface BrandSampleInput {
  products: { palettes: ExtractedPalette[]; category: ProductCategory }[];
  brand: BrandSetting;
  brandSeed: number;
  niche: string;
  /** the blueprint's stage-1 hints (AI-11, Cloud AI on); validated against GENE_VOCAB, locks win */
  hints?: GeneHints;
}

/** Sample the store's Brand Genome (novelty context `theme`, kind `brand`). S2 (stub: NotBuiltYet). */
export function sampleBrand(input: BrandSampleInput): BrandGenome {
  void input;
  return notBuiltYet("S2", "sampleBrand");
}

/** The house genes S1's `expandHome` draws the home from (the store's default page rhythm). */
export function houseGenes(brand: BrandGenome): BrandGenome["house"] {
  return brand.house;
}
