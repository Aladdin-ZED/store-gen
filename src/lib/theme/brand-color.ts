/**
 * No-orange brand colours (P6 DESIGN; design.md DES-§12.4, DS17, core D37, `allowSellerBrandOrange = false`). Pure and
 * isomorphic: the brand kit's colour picker and the logo palette extraction call it before a colour is stored.
 *
 * `nearestAllowed(hex)` leaves a colour outside the guard band unchanged (OKLCH hue 25-75° at chroma > 0.06, with the
 * engine's margin, color.ts `nearOrange`); otherwise it returns the candidate with the smallest OKLab ΔE to the input
 * among the low side (crimson / berry), the high side (golden yellow) and the muted version (same lightness and hue,
 * chroma 0.056 / 0.05 / 0.042, or 0.038 / 0.032 / 0.025 for L ≥ 0.8: sand). Ties go to muted. The result is never in
 * the guard band, so the function is idempotent.
 *
 * `allowedForRole(hex, role)` adds the gold band for the accent and pop roles (H34, V37, UX-17): a pick at hue 75-95°
 * with chroma > 0.10 takes the "sand + signal" path, the gold is kept as the page's warm neutral (chroma ≤ 0.06) and an
 * olive, teal or majorelle accent is proposed instead. Neutrals may stay in that band at C ≤ 0.06. An uploaded logo
 * file is never recoloured; only the palette taken from it goes through here.
 */
import { deltaE, fromOklch, nearOrange, noOrange, toOklch, type Hex } from "./color";
import { goldBand, sandSignal } from "./palette";

export interface AllowedColor {
  hex: Hex;
  moved: boolean;
  side: "low" | "high" | "muted" | null;
  deltaE: number;
}

/** The muted candidate: the first of the guard's chroma steps at the same lightness and hue that leaves the band. */
function muted(hex: Hex): Hex {
  const o = toOklch(hex);
  for (const c of o.l >= 0.8 ? [0.038, 0.032, 0.025] : [0.056, 0.05, 0.042]) {
    const x = fromOklch({ l: o.l, c, h: o.h });
    if (!nearOrange(toOklch(x))) return x;
  }
  return fromOklch({ l: o.l, c: 0.02, h: o.h });
}

const normalise = (hex: Hex): Hex => hex.toLowerCase();

/** The closest allowed colour to `hex` (DES-§12.4). */
export function nearestAllowed(hexIn: Hex): AllowedColor {
  const hex = normalise(hexIn);
  if (!nearOrange(toOklch(hex))) return { hex, moved: false, side: null, deltaE: 0 };
  // muted first, so a tie (equal ΔE) keeps it
  const cands: { hex: Hex; side: "low" | "high" | "muted" }[] = [
    { hex: muted(hex), side: "muted" },
    { hex: noOrange(hex, "low"), side: "low" },
    { hex: noOrange(hex, "high"), side: "high" },
  ];
  let best = cands[0]!;
  let bestE = deltaE(hex, best.hex);
  for (const c of cands.slice(1)) {
    const e = deltaE(hex, c.hex);
    if (e < bestE - 1e-12) {
      best = c;
      bestE = e;
    }
  }
  return { hex: best.hex, moved: true, side: best.side, deltaE: bestE };
}

export type BrandColorRole = "accent" | "pop" | "neutral" | "ink";

export interface RoleColor extends AllowedColor {
  /** which rule moved the pick: the owner's orange band, or the gold band of the accent and pop roles */
  band: "orange" | "gold" | null;
  /** on the gold path: the gold kept as the warm neutral (chroma ≤ 0.06) */
  sand?: Hex;
}

/** `nearestAllowed`, then the gold band for the accent and pop roles (H34 "sand + signal"). */
export function allowedForRole(hexIn: Hex, role: BrandColorRole): RoleColor {
  const a = nearestAllowed(hexIn);
  if ((role !== "accent" && role !== "pop") || !goldBand(a.hex)) return { ...a, band: a.moved ? "orange" : null };
  const s = sandSignal(a.hex);
  const hex = role === "accent" ? s.accent : s.pop;
  return { hex, moved: true, side: null, deltaE: deltaE(normalise(hexIn), hex), band: "gold", sand: s.sand };
}
