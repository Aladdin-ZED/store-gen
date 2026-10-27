/**
 * Genome distance (P6 DESIGN; design.md DES-§7.1, DES-§7.2; docs/STORE-SAAS.md §K.2 P0 design stubs). Pure and
 * isomorphic: `genomeDistance(a, b, scope)` in [0, 1], symmetric, over the packed views stored in
 * `design_genomes.vec`. Typed at P0 (src/lib/contracts/r1-p0.ts); P6 replaces the body and adds `distanceView`,
 * `packView` / `unpackView` and the append-only token table. The stub throws: a distance is a measurement, and the
 * stub never invents one.
 */

export interface DistanceView {
  v: 2;
  kind: "page" | "brand";
  /** rev 3 (QUAL-28): the rendered script decides which display face counts */
  locale: "ar" | "fr" | "en";
  /** indices into GENE_VOCAB value lists, -1 = n/a */
  cat: {
    grammar: number;
    strategy: number;
    treatment: number;
    pairing: number;
    displayFamily: number;
    arDisplay: number;
    bodyAr: number;
    base: number;
    ladder: number;
    mask: number;
    depth: number;
    button: number;
    emphasis: number;
    glyph: number;
    motion: number;
    density: number;
    align: number;
  };
  /** OKLab of the compiled palette */
  accent: [number, number, number];
  pop: [number, number, number];
  /** normalised 0..1 by the gene ranges (ctas / 6, (nSections − 8) / 6) */
  num: { rd: number; w: number; space: number; area: number; ctas: number; nSections: number };
  /** token id of hero variant + arrangement */
  hero: number;
  /** ≤ 24 token ids of in-flow "type:variant" */
  seq: number[];
  /** 7-bin histogram of G29 over titles, normalised */
  tags: number[];
  /** 6-bin histogram of G32 openers, normalised */
  openers: number[];
  /** bitmask of the crop families used (full / tight / context / bleed) */
  crops: number;
}

/** [0, 1], symmetric, d(a, a) = 0 (DES-§7.2 weights: full 40, page 21, brand 19). */
export function genomeDistance(a: DistanceView, b: DistanceView, scope: "full" | "page" | "brand" = "full"): number {
  void a;
  void b;
  void scope;
  throw new Error("not implemented: P6 genomeDistance");
}
