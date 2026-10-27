/**
 * The height model (P6 DESIGN; design.md DES-§5.3, DES-§5.12; docs/STORE-SAAS.md §K.2 P0 design stubs, §M.2,
 * DES-R19). Pure and isomorphic, no DOM: the core's budget gate measures rows C3, F1 and C2 with it, the wizard and
 * the gates with the same numbers (DS33). The signature is frozen (src/lib/contracts/r1-p0.ts) and the report shapes
 * are the maintainer's (./types.frozen.ts).
 *
 * P0 STUB (§K.2 stub rule): every report carries `stub: true`, `fold.ok = true`, every section 600 px and
 * `formTop = null`, so nothing is measured yet. While it is the stub, the budget gate only writes notes (C2 / C3 / F1
 * derive nothing from these numbers, and no row refuses a page before P6), and the STUB-BUILD LOCK holds (src/lib/render/prepublish/budget-limits.ts `heightModelIsStub`): `npm run build`
 * fails at prebuild without SG_STUB_BUILD_OK=1, the server throws at load in production, and a gate file written
 * with the stub says `stubBuild: true`, which scripts/deploy/archive.mjs refuses. P6 replaces the body with the
 * row-based model and sets HEIGHT_MODEL_VERSION ≥ 1 in the same change (no report of the real model carries `stub`).
 */
import type { Locale, PageDoc, ThemeLook } from "@/lib/page/schema";
import type { HeightReport, VariantFeaturesResolved } from "./types.frozen";

/** Bumped with the coefficients; calibration/heights.json records the version it was fitted against. 0 = the P0 stub. */
export const HEIGHT_MODEL_VERSION: number = 0;

const STUB_SECTION_PX = 600;

/** ≤ 1 ms. `doc` is widened to PageDoc | StorePageDoc at the R2 contract step (DES-R27). */
export function estimateHeights(
  doc: PageDoc,
  opts: { look: ThemeLook | null; locale: Locale; features: (type: string, variant: string, data: unknown) => VariantFeaturesResolved },
): HeightReport {
  const sections: HeightReport["sections"] = [];
  let top = 0;
  for (const s of doc.sections) {
    if (s.hidden || opts.features(s.type, s.variant, s.data).fixed !== null) continue;
    sections.push({ id: s.id, type: s.type, variant: s.variant, top, height: STUB_SECTION_PX });
    top += STUB_SECTION_PX;
  }
  const hero = doc.sections.find((s) => s.type === "hero" && !s.hidden);
  return {
    v: 1,
    viewport: 390,
    sections,
    total: top,
    screens: Math.round((top / 844) * 100) / 100,
    formTop: null,
    formHeight: null,
    fold: { family: hero?.variant ?? "", ok: true, items: {}, limit: 844 },
    inFlow: sections.length,
    stub: true,
  };
}
