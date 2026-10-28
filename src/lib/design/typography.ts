/**
 * The typography engine (P6 DESIGN; design.md DES-§10.5, DS37; T1-T3, T6, T7, V15, N7, F13).
 *
 * `typeTokens(pairing, look, locale)` turns a pairing and the type genes of a compiled look (G5 scale, G6 weights and
 * tracking, G7 case and labels, G8 numerals) into the `--lp-*` type tokens, from the font manifest's metrics. Pure,
 * isomorphic and arithmetic only (DES-§19: ≤ 0.2 ms per pairing × locale). Only documents with `theme.look` use it;
 * a document without one keeps the archetype's type tokens (src/lib/theme/tokens.ts).
 *
 * Latin values read `FONT_DATA[id].metrics` (measured on each font's Latin file). Arabic values read the manifest's
 * `metrics.ar` once the maintainer's build step measures it on the Arabic subset (DES-R21); until then they read
 * `AR_METRICS_FALLBACK`, a hand-tuned table with `measured: false`. Nothing computed from the fallback is ever
 * called "measured": `arabicMetricsLabel` gives "tuned" for it, and `theme:check` lists the faces as `metrics_missing`.
 */
import type { Locale, ThemeLook } from "@/lib/page/schema";
import { fontData } from "@/lib/theme/fonts";

/** The Arabic metrics of a face (font units), measured on Arabic glyphs (DES-§10.5 step 1). */
export interface ArabicMetrics {
  unitsPerEm: number;
  /** 10th-90th percentile band of the main-body ink of ب ت ن س ص ه م ل ك ا (dots excluded) */
  bodyBand: number;
  /** the tooth of ب ت ن س */
  toothHeight: number;
  /** the loops of ه م و ف ق */
  loopHeight: number;
  /** highest dot or mark (ت ث ن ش ذ ز, hamza on أ ئ ؤ) */
  markAbove: number;
  /** depth of the lowest dot or mark (ب ج ي, hamza under إ), positive */
  markBelow: number;
  alefHeight: number;
  /** frequency-weighted average advance per character over scripts/sync-fonts/ar-sample.json */
  advanceAvg: number;
  /** true only for values the manifest's build step measured; the fallback table is false */
  measured: boolean;
}

/**
 * Hand-tuned Arabic metrics for the twelve shipped Arabic faces and the three DES-R21 additions, `measured: false`
 * (DES-§10.5 step 2). The shipped rows were tuned from glyph inspection of the shipped files (the outlines of
 * scripts/qa/design-font.ts, the word list of ar-sample.json) and rounded; the Cairo, Kufam and Vazirmatn rows are
 * estimates until those faces ship. The manifest's `metrics.ar` (measured: true) replaces every row.
 */
export const AR_METRICS_FALLBACK: Readonly<Record<string, ArabicMetrics>> = {
  "el-messiri": { unitsPerEm: 1000, bodyBand: 580, toothHeight: 480, loopHeight: 480, markAbove: 865, markBelow: 410, alefHeight: 660, advanceAvg: 475, measured: false },
  "reem-kufi": { unitsPerEm: 1000, bodyBand: 455, toothHeight: 450, loopHeight: 450, markAbove: 1020, markBelow: 360, alefHeight: 800, advanceAvg: 520, measured: false },
  lemonada: { unitsPerEm: 1000, bodyBand: 660, toothHeight: 530, loopHeight: 605, markAbove: 1040, markBelow: 520, alefHeight: 775, advanceAvg: 605, measured: false },
  marhey: { unitsPerEm: 1000, bodyBand: 540, toothHeight: 495, loopHeight: 405, markAbove: 910, markBelow: 490, alefHeight: 735, advanceAvg: 480, measured: false },
  changa: { unitsPerEm: 1000, bodyBand: 580, toothHeight: 470, loopHeight: 480, markAbove: 850, markBelow: 440, alefHeight: 630, advanceAvg: 490, measured: false },
  alexandria: { unitsPerEm: 1000, bodyBand: 595, toothHeight: 600, loopHeight: 515, markAbove: 985, markBelow: 520, alefHeight: 820, advanceAvg: 530, measured: false },
  "noto-kufi-arabic": { unitsPerEm: 1000, bodyBand: 615, toothHeight: 570, loopHeight: 485, markAbove: 960, markBelow: 450, alefHeight: 760, advanceAvg: 500, measured: false },
  "noto-naskh-arabic": { unitsPerEm: 1000, bodyBand: 550, toothHeight: 410, loopHeight: 435, markAbove: 895, markBelow: 435, alefHeight: 670, advanceAvg: 420, measured: false },
  "readex-pro": { unitsPerEm: 1000, bodyBand: 550, toothHeight: 525, loopHeight: 535, markAbove: 1000, markBelow: 475, alefHeight: 740, advanceAvg: 510, measured: false },
  "baloo-bhaijaan-2": { unitsPerEm: 1000, bodyBand: 480, toothHeight: 385, loopHeight: 355, markAbove: 920, markBelow: 395, alefHeight: 670, advanceAvg: 440, measured: false },
  "ibm-plex-sans-arabic": { unitsPerEm: 1000, bodyBand: 515, toothHeight: 380, loopHeight: 410, markAbove: 905, markBelow: 440, alefHeight: 740, advanceAvg: 440, measured: false },
  tajawal: { unitsPerEm: 1000, bodyBand: 480, toothHeight: 430, loopHeight: 440, markAbove: 800, markBelow: 375, alefHeight: 645, advanceAvg: 485, measured: false },
  cairo: { unitsPerEm: 1000, bodyBand: 560, toothHeight: 470, loopHeight: 470, markAbove: 900, markBelow: 430, alefHeight: 700, advanceAvg: 480, measured: false },
  kufam: { unitsPerEm: 1000, bodyBand: 580, toothHeight: 520, loopHeight: 500, markAbove: 940, markBelow: 420, alefHeight: 760, advanceAvg: 520, measured: false },
  vazirmatn: { unitsPerEm: 1000, bodyBand: 540, toothHeight: 460, loopHeight: 470, markAbove: 920, markBelow: 450, alefHeight: 720, advanceAvg: 470, measured: false },
};

/** Faces with tall marks (F13): their display line-height is never below 1.32 (`cairo` from weight 700). */
const TALL_MARKS: Readonly<Record<string, number>> = { "el-messiri": 0, cairo: 700 };

/** The Arabic metrics of a face: the manifest's measured block, else the fallback row, else null. */
export function arabicMetrics(id: string): { metrics: ArabicMetrics; source: "measured" | "fallback" } | null {
  const m = fontData(id)?.metrics as ({ ar?: Omit<ArabicMetrics, "unitsPerEm"> & { unitsPerEm?: number } } & { unitsPerEm: number }) | undefined;
  if (m?.ar && m.ar.measured) return { metrics: { ...m.ar, unitsPerEm: m.ar.unitsPerEm ?? m.unitsPerEm }, source: "measured" };
  const fb = AR_METRICS_FALLBACK[id];
  return fb ? { metrics: fb, source: "fallback" } : null;
}

/** What a chip, a note or a report may say about Arabic type values (DES-§10.5 step 2): never "measured" for the fallback. */
export const arabicMetricsLabel = (source: "measured" | "fallback") => (source === "measured" ? "measured" : "tuned");

/** Tabular lining figures on every price, counter, phone and quantity, in every face (T1). */
export const PRICE_NUMERALS = "tabular-nums lining-nums";

/** The faces of a pairing the engine reads (weights come from the look). */
export interface TypePairing {
  display: string;
  body: string;
  displayAr: string;
  bodyAr: string;
}

/** The type genes the engine reads: `look.type` of the compiled genome (G5, G6, G7, G8). */
export type TypeLook = Pick<ThemeLook, "type">;

export interface TypeTokens {
  /** `--lp-*` type tokens (names without the leading dashes) */
  vars: Record<string, string>;
  /** px at the 390 viewport and at the 1440 viewport, per step −1 … 6 */
  steps: Record<number, { m: number; d: number }>;
  /** the hero display (step 5) at 390 px (T6: ≥ 44) */
  heroAt390: number;
  /** display / body at 390 and at 1440 (V15: ≥ 2.5) */
  ratio: { m: number; d: number };
  displayLh: number;
  bodyLh: number;
  /** padding-block on Arabic display runs (em); 0 for Latin */
  displayPad: number;
  /** Arabic body size harmonisation, 1.04-1.14 */
  arScale: number;
  /** the Arabic faces' metric source (null when the locale is not Arabic and no Arabic metrics were needed) */
  arSource: "measured" | "fallback" | null;
}

const num = (v: number, d = 3) => {
  const s = v.toFixed(d).replace(/0+$/, "").replace(/\.$/, "");
  return s === "-0" ? "0" : s;
};
const rem = (px: number) => `${num(px / 16, 4)}rem`;
const clampN = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** The fluid range of every step: its 390 value up to 360 px, its 1440 value from 1280 px (today's scale, tokens.ts). */
const V_MIN = 360;
const V_MAX = 1280;
function fluid(m: number, d: number): string {
  if (Math.abs(d - m) < 0.01) return rem(d);
  const lo = Math.min(m, d);
  const hi = Math.max(m, d);
  const slope = (d - m) / (V_MAX - V_MIN);
  const icpt = m - slope * V_MIN;
  const vw = slope * 100;
  return `clamp(${rem(lo)},${rem(icpt)} ${vw < 0 ? "-" : "+"} ${num(Math.abs(vw), 4)}vw,${rem(hi)})`;
}
/** Value of a fluid step at a viewport width (the clamp() above, evaluated). */
const at = (s: { m: number; d: number }, vw: number) => clampN(s.m + ((s.d - s.m) * (vw - V_MIN)) / (V_MAX - V_MIN), Math.min(s.m, s.d), Math.max(s.m, s.d));

/** Latin tracking at a size (G6.tk): −tk × log2(size / 16) em, clamped −0.05 … 0 (DES-§4.2 G6, DES-§10.5). */
export const latinTracking = (tk: number, sizePx: number) => clampN(-tk * Math.log2(Math.max(1, sizePx) / 16), -0.05, 0);

/**
 * The type tokens of a pairing under a look (DES-§10.5). Fluid steps from G5: body 16 px at 390 (18 at 1440), ratio
 * `rm` on mobile and `rd` on desktop for steps −1 … 4; the hero display (step 5) ≥ 44 px at 390 and ≥ 2.5 × the body
 * at both ends (T6, V15); step 6 reaches `dmax`, the display cap. Arabic: `--lp-ar-scale` matches the Arabic body's
 * main-body ink band to the Latin body's x-height (clamped 1.04-1.14), the display line-height comes from the marks
 * (F13), tracking is always 0.
 */
export function typeTokens(pairing: TypePairing, look: TypeLook, locale: Locale): TypeTokens {
  const t = look.type;
  const ar = locale === "ar";
  // desktop: 18 × rd^n capped at dmax (the display cap); mobile: 16 × rm^n, the hero display (step 5) lifted to 44 px
  const steps: Record<number, { m: number; d: number }> = {};
  for (let n = -1; n <= 4; n++) steps[n] = { m: 16 * t.rm ** n, d: Math.min(t.dmax, 18 * t.rd ** n) };
  const s5m = Math.max(44, 2.5 * 16, 16 * t.rm ** 5);
  const s5d = Math.max(s5m, 2.5 * 18, Math.min(t.dmax, 18 * t.rd ** 5));
  steps[5] = { m: s5m, d: s5d };
  steps[6] = { m: Math.max(s5m * t.rm, 16 * t.rm ** 6), d: Math.max(s5d, Math.min(t.dmax, 18 * t.rd ** 6)) };

  // Arabic metrics: body (size harmonisation) and display (line-height, padding)
  const latBody = fontData(pairing.body)?.metrics;
  const arBody = arabicMetrics(pairing.bodyAr);
  const arDisplay = arabicMetrics(pairing.displayAr);
  const xh = latBody && latBody.xHeight > 0 ? latBody.xHeight / latBody.unitsPerEm : 0.5;
  const arScale = arBody ? clampN(xh / (arBody.metrics.bodyBand / arBody.metrics.unitsPerEm), 1.04, 1.14) : 1.08;
  const latDisplay = fontData(pairing.display)?.metrics;

  // line heights (DES-§10.5): Latin display by dmax (1.10 at 48 → 1.02 at ≥ 120), body 1.5; Arabic from the marks
  const latDisplayLh = 1.1 - (0.08 * clampN(t.dmax - 48, 0, 72)) / 72;
  let arDisplayLh = 1.32;
  if (arDisplay) {
    const m = arDisplay.metrics;
    arDisplayLh = Math.max(1.25, (m.markAbove + m.markBelow + 0.08 * m.unitsPerEm) / m.unitsPerEm);
    const tallFrom = TALL_MARKS[pairing.displayAr];
    if (tallFrom !== undefined && t.wAr >= tallFrom) arDisplayLh = Math.max(arDisplayLh, 1.32);
  }
  const displayLh = ar ? arDisplayLh : latDisplayLh;
  const bodyLh = ar ? 1.7 : 1.55;
  const displayPad = ar ? 0.12 : 0;

  // tracking: Latin per size, 0 for Arabic. The hero display's tracking at 390 and at 1440, interpolated over the
  // viewport like the steps: `trackM em` plus a px slope that reaches `trackD em` of the desktop display size
  const trackM = latinTracking(t.tk, steps[5]!.m);
  const trackD = latinTracking(t.tk, steps[5]!.d);
  const slope = ((trackD - trackM) * steps[5]!.d) / (V_MAX - V_MIN);
  const tracking =
    ar || t.tk === 0
      ? "0em"
      : Math.abs(trackM - trackD) < 0.0005
        ? `${num(trackD, 4)}em`
        : `clamp(${num(Math.min(trackM, trackD), 4)}em,calc(${num(trackM, 4)}em + ${num(slope, 5)} * (100vw - ${V_MIN}px)),${num(Math.max(trackM, trackD), 4)}em)`;

  // labels (G7.lb): mono and small caps are uppercase with Latin tracking ≤ 13 px; Arabic never
  const labelCase = ar || t.lb === "plain" ? "none" : "uppercase";
  const labelTracking = ar || t.lb === "plain" ? "0em" : t.lb === "mono" ? "0.04em" : "0.06em";

  // numerals in running copy (G8): old-style only for a serif body on a Latin page; prices are always PRICE_NUMERALS
  const serifBody = fontData(pairing.body)?.category === "serif";
  const numCopy = !ar && t.nu === "oldstyle" && serifBody ? "oldstyle-nums" : "lining-nums";

  // the emphasis underline / swoosh sits below the descender box of the display face (T3 soft)
  const depth = ar && arDisplay ? arDisplay.metrics.markBelow / arDisplay.metrics.unitsPerEm : latDisplay ? Math.abs(latDisplay.descent) / latDisplay.unitsPerEm : 0.25;
  const emOffset = clampN(depth * 0.5, 0.08, 0.28);

  const vars: Record<string, string> = {};
  for (let n = -1; n <= 6; n++) vars[`lp-step-${n}`] = fluid(steps[n]!.m, steps[n]!.d);
  vars["lp-display-weight"] = String(ar ? t.wAr : t.w);
  vars["lp-display-weight-ar"] = String(t.wAr);
  vars["lp-display-tracking"] = tracking;
  vars["lp-display-case"] = ar ? "none" : t.dc;
  vars["lp-display-lh"] = num(displayLh);
  vars["lp-display-pad"] = `${num(displayPad, 2)}em`;
  vars["lp-body-lh"] = num(bodyLh, 2);
  vars["lp-label-case"] = labelCase;
  vars["lp-label-tracking"] = labelTracking;
  vars["lp-num-copy"] = numCopy;
  vars["lp-ar-scale"] = num(arScale);
  vars["lp-em-offset"] = `${num(emOffset)}em`;

  const heroAt390 = at(steps[5]!, 390);
  return {
    vars,
    steps,
    heroAt390,
    ratio: { m: heroAt390 / at(steps[0]!, 390), d: at(steps[5]!, 1440) / at(steps[0]!, 1440) },
    displayLh,
    bodyLh,
    displayPad,
    arScale,
    arSource: !arDisplay && !arBody ? null : arDisplay?.source !== "fallback" && arBody?.source !== "fallback" ? "measured" : "fallback",
  };
}

/**
 * The Arabic line count of a title at a size and measure (DES-§10.5 "Measure and line count"): characters × the
 * measured (or tuned) average advance, never the Latin `xWidthAvg`.
 */
export function arabicLines(face: string, chars: number, sizePx: number, measurePx: number): number {
  const m = arabicMetrics(face)?.metrics ?? AR_METRICS_FALLBACK.tajawal!;
  const width = (chars * m.advanceAvg * sizePx) / m.unitsPerEm;
  return Math.max(1, Math.ceil(width / Math.max(1, measurePx)));
}
