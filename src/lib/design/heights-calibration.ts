/**
 * The height model's calibration fixture (P6 DESIGN; design.md DES-§5.3, DES-§5.12, QUAL-5, ENGP-6; core §M.2).
 * `calibration/heights.json` is committed: per page of the baseline matrix (the 39 landings of qa/saas-baseline, the
 * same recipes) the height measured in Edge at 390 × 844, each in-flow section's height and the hero's fold items.
 * Numbers and ids only, never page text. `scripts/qa/design-heights.ts` writes it; `test:design` compares the model
 * with it (page total ratio within 0.8-1.25 on ≥ 90 % of pages, fold item error p95 ≤ 10 %), and `test:prepublish`
 * may read it for its C2 / C3 / F1 fixtures.
 */
import { ARCHETYPES, type Archetype } from "@/lib/page/schema";
import type { FixtureLocale, FixtureName } from "@/lib/page/fixtures";
import heightsJson from "./calibration/heights.json";

/** The fixed render time of the baseline matrix (countdowns stay stable): qa/saas-baseline/render-all.sh. */
export const CALIBRATION_NOW = "2026-10-24T10:00:00.000Z";

export interface CalibrationRecipe {
  fixture: FixtureName;
  locale: FixtureLocale;
  arch: Archetype | null;
  seed: number | null;
}

/** A measured fold: top px at 390 of each hero element (absent when the hero has none). */
export type CalibrationFold = Partial<Record<"image" | "title" | "price" | "cta" | "cod", number>>;

export interface CalibrationPage extends CalibrationRecipe {
  total: number;
  /** the hero variant */
  hero: string;
  fold: CalibrationFold;
  /** [type, variant, measured px] per in-flow section, in page order */
  sections: [string, string, number][];
}

export interface CalibrationFile {
  v: 1;
  /** HEIGHT_MODEL_VERSION when the pages were measured */
  model: number;
  viewport: [390, 844];
  now: string;
  renderer: string;
  pages: CalibrationPage[];
}

const FIXTURES: readonly FixtureName[] = ["argan", "massage", "blender", "parfum", "duo", "tshirt", "colors"];

/** The baseline matrix (qa/saas-baseline/render-all.sh, landings only): 14 defaults, 22 archetype pages, 3 seeds. */
export const CALIBRATION_RECIPES: readonly CalibrationRecipe[] = [
  ...FIXTURES.flatMap((fixture) => (["ar", "fr"] as const).map((locale) => ({ fixture, locale, arch: null, seed: null }))),
  ...ARCHETYPES.flatMap((arch) => (["argan", "tshirt"] as const).map((fixture) => ({ fixture, locale: "ar" as const, arch, seed: null }))),
  ...[7, 4242, 90210].map((seed) => ({ fixture: "argan" as const, locale: "ar" as const, arch: null, seed })),
];

export const recipeName = (r: CalibrationRecipe) => [r.fixture, r.arch ?? "default", r.locale, r.seed !== null ? `s${r.seed}` : ""].filter(Boolean).join("-");

export const HEIGHTS_CALIBRATION = heightsJson as unknown as CalibrationFile;
