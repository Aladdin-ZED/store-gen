/**
 * Photo facts and the model-free alpha estimate (P6 DESIGN; design.md DES-§4.4, DES-§4.11, UX-39; docs/STORE-SAAS.md
 * §K.2 P0 design stubs, CRIT10). Browser-only: the wizard (P6) and P2's onboarding photos step call `estimateAlpha`
 * on the 32 × 32 facts pass (one OffscreenCanvas, no download, no upload). P0 stub: `estimateAlpha` answers `null`
 * ("no estimate"), so the sampler treats the photo as having no cutout, today's behaviour. P6 replaces the body and
 * adds `photoFacts(bitmap, meta)`; the signature is frozen (src/lib/contracts/r1-p0.ts).
 */

/** What the sampler reads about the product photos (DES-§4.4): built from PhotoInfo, the asset metadata and the facts pass. */
export interface PhotoFacts {
  count: number;
  maxWidth: number;
  /** "estimated" = the model-free alpha estimate below */
  hasCutout: boolean | "estimated";
  /** "#rrggbb" */
  dominant: string | null;
  background: { luminance: number; uniform: boolean };
  sharp: boolean;
}

/** The product's box in the photo, normalised 0..1 (the focal default for cutouts, the stage presets' anchor). */
export interface AlphaBBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The edge flood-fill estimate (ΔE ≤ 6 OKLab from the four border bands); null when the background is not uniform enough. */
export function estimateAlpha(bitmap: ImageBitmap): { hasCutout: "estimated"; bbox: AlphaBBox } | null {
  void bitmap;
  return null;
}
