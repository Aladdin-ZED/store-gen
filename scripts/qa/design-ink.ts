/**
 * The ink-density ratio of a pairing (P6 DESIGN; design.md DES-§10.2 F15, DES-§10.5 "Arabic display weight", DS37):
 * the ink coverage (ink area / ink bbox area) of the Arabic display word "متجر الأمل" at the catalogue's
 * `displayWeightAr` against the coverage of the Latin display word "Hamburgefonstiv" at the pairing's display weight
 * must lie in 0.85-1.15. Coverage comes from the flattened glyph outlines of the shipped files (`design-font.ts`: WOFF2
 * decoded, the variable instance from `gvar`, the Arabic positional forms and lam-alef from the font's own tables),
 * scanline-integrated with the nonzero rule, so overlapping contours of variable fonts count once. A pairing outside
 * the band is re-tuned in the catalogue, never shifted at compile (F15).
 *
 * Calibration (a P6 decision, reported in docs/saas/ccr/r1-p6-1.md): each word's coverage is divided by its script's
 * regular-text coverage (the median, at 400, of the shipped body faces of that script) before the two are compared.
 * The Arabic word spreads its ink over alef and lam ascenders, deep bowls and a word space, so at equal weight its raw
 * coverage is ≈ 0.83 × the Latin word's: a raw ratio would ask an Arabic face to be darker than "the same weight" and
 * put every poster pairing (Latin 800-900) out of reach of any Arabic weight. Relative to regular text, "as bold as
 * the Latin" is what the band measures.
 *
 *   npx tsx scripts/qa/design-ink.ts            the ratio of every loaded pairing (exit 1 when one is outside)
 *   npx tsx scripts/qa/design-ink.ts --tune     also the Arabic weights that would put each pairing in the band
 *
 * `theme:check` calls `inkRatios()` on the catalogue.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { FONT_DATA, fontData, nearestWeight } from "@/lib/theme/fonts";
import { Font, inkOf, layout } from "./design-font";

export const LATIN_WORD = "Hamburgefonstiv";
export const ARABIC_WORD = "متجر الأمل";
export const INK_BAND = [0.85, 1.15] as const;
/** The optical size a display word is measured at (the browser's `font-optical-sizing: auto` at a display size). */
const DISPLAY_OPSZ = 72;

const ROOT = join(__dirname, "..", "..");
const fonts = new Map<string, Font>();
const coverageCache = new Map<string, Coverage>();

export interface Coverage {
  /** ink area / ink bbox area */
  coverage: number;
  file: string;
  /** how the Arabic forms were reached (`isolated` = the font gave no positional forms: an approximation) */
  forms: Font["formSource"] | "latin";
}

/** The shipped file a face's word is measured from (the script's subset, upright; a static face's nearest weight). */
export function fontFile(id: string, script: "latin" | "arabic", weight: number): string | null {
  const f = fontData(id);
  if (!f) return null;
  const files = f.files.filter((x) => x.subset === script && x.style === "normal");
  const pick = f.variable ? files[0] : (files.find((x) => x.weight === String(nearestWeight(id, weight))) ?? files[0]);
  if (!pick) return null;
  const path = join(ROOT, "public", "fonts", id, pick.file);
  return existsSync(path) ? path : null;
}

function open(path: string): Font {
  let f = fonts.get(path);
  if (!f) fonts.set(path, (f = Font.open(path)));
  return f;
}

/** Ink coverage of the display word of `script` in face `id` at `weight`, or null when the face or file is missing. */
export function inkCoverage(id: string, weight: number, script: "latin" | "arabic"): Coverage | null {
  const key = `${id}|${weight}|${script}`;
  const hit = coverageCache.get(key);
  if (hit) return hit;
  const path = fontFile(id, script, weight);
  if (!path) return null;
  const font = open(path);
  const coords = font.normalise({ wght: nearestWeight(id, weight), opsz: DISPLAY_OPSZ });
  let gids: number[];
  let forms: Coverage["forms"] = "latin";
  if (script === "arabic") {
    // visual order: the logical run reversed
    gids = font.shapeArabic(ARABIC_WORD).reverse();
    forms = font.formSource;
  } else gids = [...LATIN_WORD].map((ch) => font.gid(ch.codePointAt(0)!));
  const ink = inkOf(layout(font, gids, coords));
  const box = (ink.bbox[2] - ink.bbox[0]) * (ink.bbox[3] - ink.bbox[1]);
  const out: Coverage = { coverage: box > 0 ? ink.area / box : 0, file: path.slice(ROOT.length + 1).replace(/\\/g, "/"), forms };
  coverageCache.set(key, out);
  return out;
}

/** The regular-text references: the shipped body faces of each script, at 400. */
export const REFERENCE_FACES = {
  latin: ["instrument-sans", "hanken-grotesk", "figtree", "dm-sans", "schibsted-grotesk", "archivo"],
  arabic: ["ibm-plex-sans-arabic", "noto-naskh-arabic", "readex-pro", "tajawal", "noto-kufi-arabic", "alexandria"],
} as const;

const refCache: Partial<Record<"latin" | "arabic", number>> = {};
/** The median coverage of a script's display word over its reference faces at 400 (the calibration of F15). */
export function referenceCoverage(script: "latin" | "arabic"): number {
  const hit = refCache[script];
  if (hit !== undefined) return hit;
  const v = REFERENCE_FACES[script]
    .map((id) => inkCoverage(id, 400, script)?.coverage)
    .filter((c): c is number => typeof c === "number")
    .sort((a, b) => a - b);
  const m = v.length ? (v.length % 2 ? v[(v.length - 1) / 2]! : (v[v.length / 2 - 1]! + v[v.length / 2]!) / 2) : 1;
  refCache[script] = m;
  return m;
}

export interface InkPairing {
  id: string;
  display: string;
  displayWeight: number;
  displayAr: string;
  displayWeightAr: number;
}
export interface InkResult {
  id: string;
  latin: number;
  arabic: number;
  /** raw Arabic coverage / Latin coverage (reported) */
  raw: number;
  /** the F15 ratio: each coverage relative to its script's regular text, Arabic / Latin */
  ratio: number;
  ok: boolean;
  forms: Coverage["forms"];
}

const calibrated = (ar: number, lat: number) => ar / referenceCoverage("arabic") / (lat / referenceCoverage("latin"));
const inBand = (r: number) => r >= INK_BAND[0] && r <= INK_BAND[1];

/** The F15 ratio of a pairing, or null when one of its faces is not shipped (a pending DES-R21 face). */
export function inkRatio(p: InkPairing): InkResult | null {
  const lat = inkCoverage(p.display, p.displayWeight, "latin");
  const ar = inkCoverage(p.displayAr, p.displayWeightAr, "arabic");
  if (!lat || !ar) return null;
  const ratio = calibrated(ar.coverage, lat.coverage);
  return { id: p.id, latin: lat.coverage, arabic: ar.coverage, raw: ar.coverage / lat.coverage, ratio, ok: inBand(ratio), forms: ar.forms };
}

/** The Arabic weights of `displayAr` (step 10 on a variable face, the shipped weights on a static one) inside the band. */
export function weightsInBand(p: InkPairing, face = p.displayAr): number[] {
  const f = fontData(face);
  const lat = inkCoverage(p.display, p.displayWeight, "latin");
  if (!f || !lat) return [];
  const cands = f.variable ? Array.from({ length: Math.floor((f.weightRange[1] - f.weightRange[0]) / 10) + 1 }, (_, i) => f.weightRange[0] + i * 10) : [...f.weights];
  return cands.filter((w) => {
    const ar = inkCoverage(face, w, "arabic");
    return ar ? inBand(calibrated(ar.coverage, lat.coverage)) : false;
  });
}

/** "350-520" style ranges of a sorted weight list (step 10). */
const ranges = (ws: number[]) => {
  const out: string[] = [];
  for (let i = 0; i < ws.length; ) {
    let j = i;
    while (j + 1 < ws.length && ws[j + 1]! - ws[j]! <= 10) j++;
    out.push(i === j ? `${ws[i]}` : `${ws[i]}-${ws[j]}`);
    i = j + 1;
  }
  return out.join(", ");
};

if (require.main === module) {
  // the catalogue is imported lazily so this module stays a leaf for theme:check
  void (async () => {
    const { loadCatalogue } = await import("@/lib/design/pairings");
    const cat = loadCatalogue();
    const tune = process.argv.includes("--tune");
    const alternates = ["alexandria", "readex-pro", "tajawal", "noto-kufi-arabic", "changa", "el-messiri"];
    let bad = 0;
    console.log(`references at 400: latin ${referenceCoverage("latin").toFixed(3)} · arabic ${referenceCoverage("arabic").toFixed(3)}`);
    for (const p of cat.pairings) {
      const r = inkRatio(p);
      if (!r) continue;
      if (!r.ok) bad++;
      const line = `${r.ok ? "  " : "✗ "}${p.id.padEnd(12)} ${p.display} ${p.displayWeight} / ${p.displayAr} ${p.displayWeightAr}: latin ${r.latin.toFixed(3)} arabic ${r.arabic.toFixed(3)} raw ${r.raw.toFixed(3)} ratio ${r.ratio.toFixed(3)} (${r.forms})`;
      let hint = "";
      if (tune && !r.ok) {
        const own = weightsInBand(p);
        hint = `  → ${p.displayAr} in band at ${own.length ? ranges(own) : "no weight"}`;
        if (!own.length) hint += `; others: ${alternates.map((f) => `${f} ${ranges(weightsInBand(p, f)) || "-"}`).join(" · ")}`;
      }
      console.log(line + hint);
    }
    console.log(`${cat.pairings.length} pairings, ${cat.pending.length} pending a DES-R21 face; ${bad} outside ${INK_BAND.join("-")}; ${Object.keys(FONT_DATA).length} shipped faces`);
    process.exit(bad ? 1 : 0);
  })();
}
