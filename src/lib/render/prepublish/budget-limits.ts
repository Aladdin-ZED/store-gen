/**
 * The budget gate's thresholds (maintainer; docs/STORE-SAAS.md §M.2, D52, D66; design-baseline §5 C2, C3, F1, F5).
 * Pure constants, importable anywhere (P7's `budgetVerdicts` reads `HEIGHT_BAND` / `FOLD_BAND`); every limit keeps
 * the baseline value it replaced beside it, so a future owner sees what changed. `test:prepublish` reads the height
 * fixtures from P6's committed src/lib/design/calibration/heights.json, never from the git-ignored baseline index.
 *
 * Also the one STUB-BUILD LOCK predicate (P0 maintainer decision 5): `heightModelIsStub()` is true exactly while
 * design's height model is the P0 stub. scripts/qa/stub-lock.ts (prebuild), the module-load guard of ./budget.ts and
 * scripts/qa/gate-ok.ts all ask it, so a build, a server and a deploy archive agree on "stub or not".
 */
import { HEIGHT_MODEL_VERSION } from "@/lib/design/heights";

/** the accepted error of the height estimate (0.8-1.25): hard when the estimate × 0.8 is over the limit (rev 3, ENGP-6) */
export const HEIGHT_BAND = 0.8;
/** the fold error (±10 %): hard when a fold item's estimated top × 0.9 is past the 844 px line, i.e. > 938 px (rev 3) */
export const FOLD_BAND = 0.9;
/** the only server viewport (390 × 844) */
export const FOLD_LINE_PX = 844;
/** the soft band of the fold: the lowest fold item's estimated top in 760-938 px is an "estimated" note */
export const FOLD_SOFT_PX = 760;

/** One kind's thresholds (§M.2 per-kind profiles, D66, STO-R25). */
export interface BudgetProfile {
  sections: { soft: number; hard: number };
  heightPx: { soft: number; hard: number };
  /** null = the kind has no order form (F1 not evaluated) */
  formTopPx: { soft: number; hard: number | null } | null;
  ctas: { soft: number; hard: number };
  glass: { soft: number; hard: number };
  reveals: { soft: number; hard: number };
  photoReuse: { soft: number; hard: number };
  htmlGz: { soft: number; hard: number };
  /** C2 source: the landing hero family's fold, the store kind's FoldLayout (STO-§9.5), or skipped */
  fold: "hero-family" | "kind-layout" | "none";
}

const KB = 1024;

/** The D52 ceilings: a registered profile may only tighten them (every hard value is clamped at registration). */
export const D52_CEILINGS = { htmlGz: 140 * KB, sections: 16, heightPx: 15_000, ctas: 8, glass: 4, reveals: 120, photoReuse: 4 } as const;

/** Landing pages: the §M.2 table (never re-registered). Baseline: 170 KB, 27 sections, 26.5-31.8k px, the form on screen 14-17. */
export const LANDING_PROFILE: BudgetProfile = {
  sections: { soft: 14, hard: 16 }, // baseline 27
  heightPx: { soft: 12_000, hard: 15_000 }, // baseline 26,525-31,757 px at 390 (median 28,463)
  formTopPx: { soft: 3_000, hard: 3_000 }, // baseline: the form on screen 14-17
  ctas: { soft: 6, hard: 8 }, // the sticky bar counts as 1
  glass: { soft: 2, hard: 4 }, // outside nav and sticky
  reveals: { soft: 60, hard: 120 },
  photoReuse: { soft: 3, hard: 4 }, // sticky and form thumbnails excluded
  htmlGz: { soft: 90 * KB, hard: 140 * KB }, // baseline 170 KB
  fold: "hero-family",
};

/** budget:F5 soft rows that are not part of a profile (§M.2): pictures (control arm only) and fonts. */
export const PICTURES_SOFT = 16;
export const FONT_FAMILIES_SOFT = 2;
export const FONT_FILES_SOFT = 4;
/** budget:K2 full-bleed accent / pop moments (section variant features, DES-§8.4) */
export const COLOUR_MOMENTS = { soft: 2, hard: 4 } as const;

/** True while design's height model is the P0 stub (HEIGHT_MODEL_VERSION 0; its reports carry `stub: true`). */
export function heightModelIsStub(): boolean {
  return HEIGHT_MODEL_VERSION === 0;
}

/** The STUB-BUILD LOCK's message (prebuild, server load, archive): one wording, so a red build is self-explaining. */
export const STUB_LOCK_MESSAGE =
  "stub-lock: design's height model (src/lib/design/heights.ts) is still the P0 stub, so the D52 budget gate only writes notes (C2, C3 and F1 cannot be measured, and no row refuses a page before P6). " +
  "This build must not ship: it runs only with SG_STUB_BUILD_OK=1 (the maintainer's merge gates before P6), and scripts/deploy/archive.mjs refuses its gate file.";
