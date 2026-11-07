/**
 * The shared WOFF2 → sfnt reader (CCR r1-p6-1 §3, rev 5 CRIT2-7; design.md DES-§13.3 step 2, DES-§10.5). The R2
 * contract step (C2-E, S2 shared need #19) froze the signature and gave the body to S2 BRAND & LOGO (its
 * `scripts/build-logo-fonts.mjs` is the first consumer; P6 finished at R1 exit): `readWoff2(buf)` answers the font's
 * flavor and every table as standard sfnt bytes:
 *   - `glyf` / `loca` reconstructed per W3C WOFF2 §5.1-5.3 (loca short or long from `head.indexToLocFormat`);
 *   - `hmtx` per §5.4 when that table is transformed;
 *   - every other table copied (decompressed).
 * Start from P6's `decodeWoff2Glyf` in scripts/qa/design-font.ts (triplets, 255UInt16, composites) plus a glyf
 * encoder; the CRIT2-7 self-check: the reconstructed boxes equal the `.woff` boxes for Tajawal. One implementation:
 * once it is real, design-font.ts switches to it through a maintainer CCR (no second reconstruction).
 * Contract body until S2 writes it: throws "not implemented: S2 (readWoff2)".
 */

/**
 * @param {Buffer} buf a WOFF2 file
 * @returns {{ flavor: number; tables: Map<string, Buffer> }} the sfnt flavor (0x00010000 TrueType, 'OTTO' CFF) and its tables by tag
 */
export function readWoff2(buf) {
  void buf;
  throw new Error("not implemented: S2 (readWoff2)");
}
