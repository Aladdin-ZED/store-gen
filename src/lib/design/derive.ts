/**
 * Back-derivation (P6 DESIGN; design.md DES-§4.7, DS52, DES-R27; docs/STORE-SAAS.md §K.2 P0 design stubs, R2): the
 * genome of an existing document, pure and total (never throws once implemented). Frozen at P0
 * (src/lib/contracts/r1-p0.ts); the doc type is widened to `PageDoc | StorePageDoc` at the R2 contract step. The stub
 * throws: a genome is a design reading, and the stub never invents one. P6 replaces the body and adds `deriveStrategy`.
 */
import type { PageDoc } from "@/lib/page/schema";
import type { DesignGenome } from "./genome";
import type { PhotoFacts } from "./photo-facts";

export function genomeOf(doc: PageDoc, opts?: { photos?: PhotoFacts }): DesignGenome {
  void doc;
  void opts;
  throw new Error("not implemented: P6 genomeOf");
}
