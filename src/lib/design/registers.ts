/**
 * Registers (design.md DES-§11.1; DG-11; pure). Track S2 BRAND & LOGO owns this file in R2. `compileRegister` gives a
 * store document its tokens: marketing = `compileGenome` with the page genes; commerce and transactional = the brand
 * genes with the clamps (motion ≤ 250 ms, glass off, accent area ≤ 0.08, …), plus the PDP family drawn from G2 through
 * storefront's pool and the islands' page genes. The contract step (C2-C) froze the signature for S1 STOREFRONT's
 * store render and templates. Stub until S2 merges: throws `NotBuiltYet("S2", "compileRegister")`. No R1 path calls it.
 */
import { notBuiltYet } from "@/lib/contracts/not-built";
import type { Register } from "@/storefront/kinds";
import type { BrandGenome } from "./brand";
import type { Compiled } from "./compile";
import type { PageGenes } from "./genome";

/** Compile the brand (and, in the marketing register, a page's genes) for one register. S2 (stub: NotBuiltYet). */
export function compileRegister(brand: BrandGenome, register: Register, page?: PageGenes): Compiled {
  void brand;
  void register;
  void page;
  return notBuiltYet("S2", "compileRegister");
}
