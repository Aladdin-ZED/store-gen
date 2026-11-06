/**
 * The store Monogram's tint (PLA-§22.3): two initials on a tinted disc. The hue is the brand accent when set, else one
 * derived from `stores.brand_seed`, folded out of the owner's band by `foldAllowedHue()`. The disc is the ink mixed into
 * the card (`color-mix(in oklab, <ink> 14%, var(--card))`), a blend test:admin-tokens proves clean with blendHit() of
 * src/lib/theme/blend.ts for every hue, in both modes. Pure and isomorphic.
 */
import { formatOklch, normHue, type Oklch } from "./contrast";

/**
 * The folded band: the owner's 25-75° widened by 3° on each side, so 8-bit rounding and the disc mix never land on
 * the edge. A hue inside is mirrored across the nearer edge (22 → 44 - h, below; 78 → 156 - h, above), so nearby seeds
 * keep distinct tints instead of piling up on one edge.
 */
export const MONOGRAM_FOLD = { min: 22, max: 78 } as const;

export function foldAllowedHue(h: number): number {
  const x = normHue(h);
  if (x < MONOGRAM_FOLD.min || x > MONOGRAM_FOLD.max) return x;
  const mid = (MONOGRAM_FOLD.min + MONOGRAM_FOLD.max) / 2;
  return x < mid ? normHue(2 * MONOGRAM_FOLD.min - x) : 2 * MONOGRAM_FOLD.max - x;
}

/** FNV-1a over the seed's UTF-16 units: stable across runtimes, no crypto needed. */
function hash32(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** The monogram's ink per mode, and the share of it mixed into `--card` for the disc. */
export const MONOGRAM_INK = { light: { l: 0.45, c: 0.09 }, dark: { l: 0.82, c: 0.08 } } as const;
export const MONOGRAM_DISC_SHARE = 0.14;

export interface MonogramTint {
  /** the folded hue, 0..360 */
  hue: number;
  light: { ink: string; disc: string };
  dark: { ink: string; disc: string };
}

/** The ink colour of a hue in one mode (exported for the checks). */
export function monogramInk(hue: number, mode: "light" | "dark"): Oklch {
  return { ...MONOGRAM_INK[mode], h: hue };
}

/**
 * The tint of a store's monogram: `accentHue` (the brand accent's hue) when set, else a hue from `seed`; folded out of
 * the band either way. The disc is a CSS colour-mix over `--card`, so it follows the surface and the mode.
 */
export function monogramTint(seed: string, accentHue?: number | null): MonogramTint {
  const raw = accentHue ?? (hash32(seed) % 3600) / 10;
  const hue = foldAllowedHue(raw);
  const disc = (ink: string) => `color-mix(in oklab, ${ink} ${MONOGRAM_DISC_SHARE * 100}%, var(--card))`;
  const light = formatOklch(monogramInk(hue, "light"));
  const dark = formatOklch(monogramInk(hue, "dark"));
  return { hue, light: { ink: light, disc: disc(light) }, dark: { ink: dark, disc: disc(dark) } };
}
