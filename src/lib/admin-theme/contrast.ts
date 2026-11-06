/**
 * Admin colour maths (core §I.6, DES-§16.2): OKLCH ↔ OKLab ↔ sRGB and the WCAG 2.x contrast ratio, for the token
 * generator, the monogram tint and `scripts/qa/admin-tokens-check.ts`. Pure and isomorphic; no dependency, so the
 * build script (scripts/build-admin-css.mjs) can load it before anything else exists.
 *
 * Conversions follow CSS Color 4 (Björn Ottosson's OKLab matrices). Out-of-gamut values are clipped per channel, which
 * is what every admin token stays clear of anyway: the checks measure what a browser paints.
 */

export interface Oklch {
  /** lightness 0..1 */
  l: number;
  /** chroma ≥ 0 */
  c: number;
  /** hue in degrees 0..360 */
  h: number;
  /** alpha 0..1 (1 when omitted) */
  alpha?: number;
}

export const normHue = (h: number): number => ((h % 360) + 360) % 360;

const round = (v: number, digits: number): number => {
  const k = 10 ** digits;
  return Math.round(v * k) / k;
};

/** "oklch(L C H)" (or "oklch(L C H / A)") with at most 4 decimals of L and C and 2 of H: the generator's one format. */
export function formatOklch(o: Oklch): string {
  const body = `${round(o.l, 4)} ${round(o.c, 4)} ${round(normHue(o.h), 2)}`;
  return o.alpha === undefined || o.alpha >= 1 ? `oklch(${body})` : `oklch(${body} / ${round(o.alpha, 3)})`;
}

const OKLCH_RE = /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)(?:deg)?\s*(?:\/\s*([\d.]+)(%?)\s*)?\)$/i;

/** Parses "oklch(L C H [/ A])" (L as a number or a percentage, A likewise); null for anything else. */
export function parseOklch(value: string): Oklch | null {
  const m = OKLCH_RE.exec(value.trim());
  if (!m) return null;
  const l = Number(m[1]) / (m[2] ? 100 : 1);
  const c = Number(m[3]);
  const h = Number(m[4]);
  const out: Oklch = { l, c, h: normHue(h) };
  if (m[5] !== undefined) out.alpha = Number(m[5]) / (m[6] ? 100 : 1);
  return [l, c, h].every(Number.isFinite) ? out : null;
}

/** OKLCH → OKLab [L, a, b]. */
export function oklchToOklab(o: Oklch): [number, number, number] {
  const hr = (o.h * Math.PI) / 180;
  return [o.l, o.c * Math.cos(hr), o.c * Math.sin(hr)];
}

/** OKLab → OKLCH (an achromatic colour gets hue 0). */
export function oklabToOklch(L: number, a: number, b: number): Oklch {
  const c = Math.hypot(a, b);
  return { l: L, c, h: c < 1e-7 ? 0 : normHue((Math.atan2(b, a) * 180) / Math.PI) };
}

/** OKLab → linear-light sRGB (unclamped). */
export function oklabToLinearRgb(L: number, a: number, b: number): [number, number, number] {
  const l = (L + 0.3963377773761749 * a + 0.2158037573099136 * b) ** 3;
  const m = (L - 0.1055613458156586 * a - 0.0638541728258133 * b) ** 3;
  const s = (L - 0.0894841775298119 * a - 1.2914855480194092 * b) ** 3;
  return [
    4.0767416360759583 * l - 3.3077115392580629 * m + 0.2309699031821043 * s,
    -1.2684379732850315 * l + 2.6097573492876882 * m - 0.341319376002657 * s,
    -0.0041960761386756 * l - 0.7034186179359362 * m + 1.7076146940746117 * s,
  ];
}

/** linear-light sRGB → OKLab. */
export function linearRgbToOklab(r: number, g: number, b: number): [number, number, number] {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const toGamma = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

/** True when the colour is inside sRGB (a small tolerance for rounding). */
export function inSrgbGamut(o: Oklch): boolean {
  return oklabToLinearRgb(...oklchToOklab(o)).every((v) => v >= -1e-4 && v <= 1 + 1e-4);
}

/** OKLCH → gamma-encoded sRGB channels 0..1, clipped. */
export function oklchToSrgb(o: Oklch): [number, number, number] {
  const [r, g, b] = oklabToLinearRgb(...oklchToOklab(o));
  return [toGamma(clamp01(r)), toGamma(clamp01(g)), toGamma(clamp01(b))];
}

/** OKLCH → "#rrggbb" (alpha ignored): the input `blendHit()` of src/lib/theme/blend.ts takes. */
export function oklchToHex(o: Oklch): string {
  return `#${oklchToSrgb(o)
    .map((v) => Math.round(v * 255).toString(16).padStart(2, "0"))
    .join("")}`;
}

/** "#rrggbb" → OKLCH. */
export function hexToOklch(hex: string): Oklch {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => toLinear(v / 255)) as [number, number, number];
  return oklabToOklch(...linearRgbToOklab(r, g, b));
}

/** WCAG relative luminance of an OKLCH colour (alpha ignored: composite first with `over()`). */
export function luminance(o: Oklch): number {
  const [r, g, b] = oklabToLinearRgb(...oklchToOklab(o)).map(clamp01) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio, 1..21. */
export function contrastRatio(fg: Oklch, bg: Oklch): number {
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** `fg` at its alpha composited over an opaque `bg`, in gamma sRGB as a browser paints it. */
export function over(fg: Oklch, bg: Oklch): Oklch {
  const a = fg.alpha ?? 1;
  if (a >= 1) return { l: fg.l, c: fg.c, h: fg.h };
  const f = oklchToSrgb(fg);
  const b = oklchToSrgb(bg);
  const [r, g, bl] = f.map((v, i) => toLinear(v * a + b[i]! * (1 - a))) as [number, number, number];
  return oklabToOklch(...linearRgbToOklab(r, g, bl));
}

/** ΔEOK: the Euclidean distance in OKLab (the "within ΔE 0.01" of DES-§16.2). */
export function deltaE(x: Oklch, y: Oklch): number {
  const [l1, a1, b1] = oklchToOklab(x);
  const [l2, a2, b2] = oklchToOklab(y);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

/** The owner's band (rule 1): OKLCH hue 25-75° with chroma above 0.06. */
export const ORANGE_HUE_MIN = 25;
export const ORANGE_HUE_MAX = 75;
export const ORANGE_CHROMA = 0.06;

export function inOrangeBand(o: Oklch): boolean {
  return o.c > ORANGE_CHROMA && o.h >= ORANGE_HUE_MIN && o.h <= ORANGE_HUE_MAX;
}
