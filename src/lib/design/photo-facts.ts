/**
 * Photo facts and the model-free alpha estimate (P6 DESIGN; design.md DES-§4.4, DES-§4.11, DES-§14.2 step 2, UX-39,
 * DS54; docs/STORE-SAAS.md §K.2 P0 design stubs, CRIT10, D59). Browser-side: the wizard and P2's onboarding photos
 * step read each product photo once, in the browser, with no download and no upload; the result is never written to
 * the asset.
 *
 *   - `photoFacts(bitmap, meta)`: the 32 × 32 pass. The variance of the 2 px edge band (OKLab) decides `uniform`, its
 *     mean lightness is the background's luminance, the Laplacian variance of the luma decides `sharp`, and the mean
 *     of the pixels that differ from the background is the dominant colour.
 *   - `estimateAlpha(bitmap)`: a border flood-fill (ΔE ≤ 6, OKLab × 100, from the mean of the four border bands),
 *     first on the 32 × 32 pass (a cheap refusal), then confirmed at ≤ 1,024 px in one OffscreenCanvas (< 150 ms).
 *     null when the border is not one uniform colour, or when the product would fill (or miss) the frame.
 *
 * The pixel functions (`factsOfPixels`, `alphaOfPixels`) are pure, so test:design runs them on synthetic arrays.
 */
import { rgb8ToOklab, rgbToHex } from "@/lib/theme/color";

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

/** What the caller knows about the photo besides its pixels (the library row). */
export interface PhotoMeta {
  /** the product's photo count (the facts of one photo describe the set until merged) */
  count: number;
  /** the photo's stored width in px (the asset row), else the bitmap's */
  width?: number;
  /** the asset already has real transparency (a PNG / WebP cutout) */
  alpha?: boolean;
}

/** the facts pass size (DES-§4.11) */
export const FACTS_PX = 32;
/** the confirmation size of the alpha estimate */
export const ALPHA_PX = 1024;
/** ΔE in OKLab × 100 under which a pixel is background (DES-§4.11) */
export const ALPHA_DELTA_E = 6;
/** the edge band's RMS ΔE (OKLab × 100) up to which the background reads as one colour */
export const UNIFORM_RMS = 5;
/** Laplacian variance of the 32 × 32 luma (0-255) from which a photo reads as sharp */
export const SHARP_VARIANCE = 40;
/** the product must cover this share of the frame for an estimated cutout (a speck or a full frame is no cutout) */
const COVER = { min: 0.04, max: 0.9 } as const;

type Rgba = Uint8ClampedArray | Uint8Array;

/**
 * OKLab × 100 of every pixel (L, a, b interleaved). Large frames read the colour through a 15-bit table filled on
 * demand (5 bits per channel: ≤ 1.5 ΔE of rounding against the threshold of 6), so the 1,024 px confirmation stays
 * a lookup per pixel.
 */
function labOf(px: Rgba, n: number): Float32Array {
  const out = new Float32Array(n * 3);
  const tmp = [0, 0, 0];
  if (n > 4096) {
    const lut = new Float32Array(32768 * 3);
    const done = new Uint8Array(32768);
    for (let i = 0; i < n; i++) {
      const a = px[i * 4 + 3]! / 255;
      const r = px[i * 4]! * a + 255 * (1 - a);
      const g = px[i * 4 + 1]! * a + 255 * (1 - a);
      const b = px[i * 4 + 2]! * a + 255 * (1 - a);
      const k = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      if (!done[k]) {
        rgb8ToOklab(((r >> 3) << 3) + 4, ((g >> 3) << 3) + 4, ((b >> 3) << 3) + 4, tmp);
        lut[k * 3] = tmp[0]! * 100;
        lut[k * 3 + 1] = tmp[1]! * 100;
        lut[k * 3 + 2] = tmp[2]! * 100;
        done[k] = 1;
      }
      out[i * 3] = lut[k * 3]!;
      out[i * 3 + 1] = lut[k * 3 + 1]!;
      out[i * 3 + 2] = lut[k * 3 + 2]!;
    }
    return out;
  }
  for (let i = 0; i < n; i++) {
    const a = px[i * 4 + 3]! / 255;
    // transparent pixels read as white (how the photo sits on a light page)
    const r = px[i * 4]! * a + 255 * (1 - a);
    const g = px[i * 4 + 1]! * a + 255 * (1 - a);
    const b = px[i * 4 + 2]! * a + 255 * (1 - a);
    rgb8ToOklab(r, g, b, tmp);
    out[i * 3] = tmp[0]! * 100;
    out[i * 3 + 1] = tmp[1]! * 100;
    out[i * 3 + 2] = tmp[2]! * 100;
  }
  return out;
}

/** The border band's pixel indexes (`band` px deep on each side). */
function borderIndexes(w: number, h: number, band: number): number[] {
  const out: number[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (x < band || y < band || x >= w - band || y >= h - band) out.push(y * w + x);
  return out;
}

/** Mean and RMS ΔE of a set of pixels. */
function meanOf(lab: Float32Array, idx: readonly number[]): { mean: [number, number, number]; rms: number } {
  let L = 0;
  let A = 0;
  let B = 0;
  for (const i of idx) {
    L += lab[i * 3]!;
    A += lab[i * 3 + 1]!;
    B += lab[i * 3 + 2]!;
  }
  const n = Math.max(1, idx.length);
  const mean: [number, number, number] = [L / n, A / n, B / n];
  let sq = 0;
  for (const i of idx) sq += dist2(lab, i, mean);
  return { mean, rms: Math.sqrt(sq / n) };
}

function dist2(lab: Float32Array, i: number, m: readonly [number, number, number]): number {
  const dl = lab[i * 3]! - m[0];
  const da = lab[i * 3 + 1]! - m[1];
  const db = lab[i * 3 + 2]! - m[2];
  return dl * dl + da * da + db * db;
}

/** The facts of one photo from its pixels (the 32 × 32 pass, or any size). Pure. */
export function factsOfPixels(px: Rgba, w: number, h: number): Pick<PhotoFacts, "dominant" | "background" | "sharp"> {
  const n = w * h;
  const lab = labOf(px, n);
  const edge = meanOf(lab, borderIndexes(w, h, Math.max(1, Math.round(Math.min(w, h) / 16))));
  // the dominant colour: the mean of the pixels that are not background (the whole frame when everything is)
  const fg: number[] = [];
  const far = (ALPHA_DELTA_E * 2) ** 2;
  for (let i = 0; i < n; i++) if (dist2(lab, i, edge.mean) > far) fg.push(i);
  let r = 0;
  let g = 0;
  let b = 0;
  const use = fg.length >= n * 0.02 ? fg : Array.from({ length: n }, (_, i) => i);
  for (const i of use) {
    r += px[i * 4]!;
    g += px[i * 4 + 1]!;
    b += px[i * 4 + 2]!;
  }
  const dominant = use.length ? rgbToHex(Math.round(r / use.length), Math.round(g / use.length), Math.round(b / use.length)) : null;
  // sharpness: the variance of the 4-neighbour Laplacian of the luma (inner pixels)
  let sum = 0;
  let sum2 = 0;
  let k = 0;
  const luma = (i: number) => 0.2126 * px[i * 4]! + 0.7152 * px[i * 4 + 1]! + 0.0722 * px[i * 4 + 2]!;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lap = 4 * luma(i) - luma(i - 1) - luma(i + 1) - luma(i - w) - luma(i + w);
      sum += lap;
      sum2 += lap * lap;
      k++;
    }
  }
  const variance = k ? sum2 / k - (sum / k) ** 2 : 0;
  return {
    dominant,
    background: { luminance: Math.round(Math.max(0, Math.min(100, edge.mean[0]))) / 100, uniform: edge.rms <= UNIFORM_RMS },
    sharp: variance >= SHARP_VARIANCE,
  };
}

/**
 * The border flood-fill (DES-§4.11): every pixel connected to the border within ΔE ≤ 6 of the border's mean is
 * background; the rest is the product. null when the border is not one colour or the product covers < 4 % or > 90 %
 * of the frame. Pure.
 */
export function alphaOfPixels(px: Rgba, w: number, h: number): { bbox: AlphaBBox; cover: number } | null {
  const n = w * h;
  if (n < 16) return null;
  const lab = labOf(px, n);
  const border = borderIndexes(w, h, Math.max(1, Math.round(Math.min(w, h) / 64)));
  const edge = meanOf(lab, border);
  if (edge.rms > UNIFORM_RMS) return null;
  const limit = ALPHA_DELTA_E ** 2;
  const bg = new Uint8Array(n);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  for (const i of border) {
    if (bg[i] || dist2(lab, i, edge.mean) > limit) continue;
    bg[i] = 1;
    queue[tail++] = i;
  }
  const [mL, mA, mB] = edge.mean;
  /** marks j as background and queues it when it is within ΔE of the border's mean */
  const visit = (j: number) => {
    if (bg[j]) return;
    const dl = lab[j * 3]! - mL;
    const da = lab[j * 3 + 1]! - mA;
    const db = lab[j * 3 + 2]! - mB;
    if (dl * dl + da * da + db * db > limit) return;
    bg[j] = 1;
    queue[tail++] = j;
  };
  while (head < tail) {
    const i = queue[head++]!;
    const x = i % w;
    if (x > 0) visit(i - 1);
    if (x < w - 1) visit(i + 1);
    if (i >= w) visit(i - w);
    if (i < n - w) visit(i + w);
  }
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  let fg = 0;
  for (let i = 0; i < n; i++) {
    if (bg[i]) continue;
    fg++;
    const x = i % w;
    const y = (i - x) / w;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const cover = fg / n;
  if (maxX < 0 || cover < COVER.min || cover > COVER.max) return null;
  const r3 = (v: number) => Math.round(v * 1000) / 1000;
  return { bbox: { x: r3(minX / w), y: r3(minY / h), w: r3((maxX - minX + 1) / w), h: r3((maxY - minY + 1) / h) }, cover: r3(cover) };
}

/** The bitmap drawn at most `max` px on its long side, as RGBA (one OffscreenCanvas; null outside a browser). */
function pixelsOf(bitmap: ImageBitmap, max: number): { px: Uint8ClampedArray; w: number; h: number } | null {
  if (typeof OffscreenCanvas === "undefined" || !bitmap.width || !bitmap.height) return null;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0, w, h);
  return { px: ctx.getImageData(0, 0, w, h).data, w, h };
}

/** The 32 × 32 facts of one product photo (DES-§4.11). Browser-only; a photo it cannot read gets the neutral facts. */
export function photoFacts(bitmap: ImageBitmap, meta: PhotoMeta): PhotoFacts {
  const small = pixelsOf(bitmap, FACTS_PX);
  const base = { count: meta.count, maxWidth: meta.width ?? bitmap.width };
  if (!small) return { ...base, hasCutout: !!meta.alpha, dominant: null, background: { luminance: 0.8, uniform: false }, sharp: true };
  const facts = factsOfPixels(small.px, small.w, small.h);
  const hasCutout: PhotoFacts["hasCutout"] = meta.alpha ? true : facts.background.uniform && estimateAlpha(bitmap) ? "estimated" : false;
  return { ...base, hasCutout, ...facts };
}

/** The edge flood-fill estimate (ΔE ≤ 6 OKLab from the four border bands); null when the background is not uniform enough. */
export function estimateAlpha(bitmap: ImageBitmap): { hasCutout: "estimated"; bbox: AlphaBBox } | null {
  // the cheap refusal first: a busy border at 32 px is busy at any size
  const small = pixelsOf(bitmap, FACTS_PX);
  if (!small || !alphaOfPixels(small.px, small.w, small.h)) return null;
  const big = pixelsOf(bitmap, ALPHA_PX);
  const got = big ? alphaOfPixels(big.px, big.w, big.h) : null;
  return got ? { hasCutout: "estimated", bbox: got.bbox } : null;
}

/**
 * The product's facts from its photos' facts (the lead photo first): the count and the widest photo of the set, a
 * cutout when any photo has one (a real one beats an estimate), the lead photo's colour, background and sharpness.
 */
export function mergePhotoFacts(list: readonly PhotoFacts[]): PhotoFacts | null {
  const lead = list[0];
  if (!lead) return null;
  const real = list.some((p) => p.hasCutout === true);
  const est = list.some((p) => p.hasCutout === "estimated");
  return { ...lead, count: list.length, maxWidth: Math.max(...list.map((p) => p.maxWidth)), hasCutout: real ? true : est ? "estimated" : false };
}
