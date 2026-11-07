/**
 * Compiling a store blueprint (design.md DES-§24 "store blueprint (AI-11, R2)" row, DES-§14.4; pure). Track S2 BRAND &
 * LOGO owns this file in R2: the blueprint's gene hints are validated against `GENE_VOCAB` (invalid ones dropped and
 * listed), the brand comes from `sampleBrand` with those hints, the home = the storyline id + the house genes for S1's
 * `expandHome`; it emits gene values and ids only, never a fact, number, price or policy text. The contract step (C2-C)
 * froze the signature for S7 AI DATA's blueprint job (acceptance: the blueprint compiles with 0 hard gate items) and
 * S1's `applyStoreBlueprint`. Stub until S2 merges: throws `NotBuiltYet("S2", "compileBlueprint")`. No R1 path calls it.
 */
import { notBuiltYet } from "@/lib/contracts/not-built";
import type { StoreBlueprint } from "@/lib/catalog/blueprint";
import type { BrandGenome, BrandSampleInput } from "./brand";
import type { PlanDirectives } from "./compile";

/** The blueprint's brand and home plan (the hints come from the blueprint, the rest from `input`). S2 (stub: NotBuiltYet). */
export function compileBlueprint(bp: StoreBlueprint, input: Omit<BrandSampleInput, "hints">): { brand: BrandGenome; home: PlanDirectives } {
  void bp;
  void input;
  return notBuiltYet("S2", "compileBlueprint");
}
