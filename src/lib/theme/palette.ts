/**
 * Palette engine — nine harmony strategies that turn (accent, pop, neutral hue, base mood) into the
 * full token set of docs/DESIGN.md §2.1 plus a complete `--sec-*` map for every section background.
 *
 * Guarantees (verified by scripts/check-theme.ts for every archetype × seed × palette × locale, and
 * for randomly fuzzed admin-edited specs):
 *  - every text/background pair ≥ 4.5:1 (ink, ink-soft, ink-mute, accent-strong, status colors,
 *    every --sec-ink / --sec-ink-soft / --sec-card-ink / --sec-chip-ink / --sec-accent-ink, and the
 *    per-section --sec-success / --sec-danger / --sec-warn);
 *  - --sec-accent ≥ 3:1 against --sec-bg and --sec-card (solved to 3.25:1, so the subtle aurora
 *    light fields of depth.ts can sit under a button and still keep it ≥ 3:1);
 *  - --lp-accent-ink on --lp-accent and --lp-pop-ink on --lp-pop ≥ 4.5:1.
 * Within a section, --sec-card always sits on the same luminance side as --sec-bg, so --sec-ink,
 * --sec-ink-soft and --sec-accent are valid on cards too; chip text keeps the section's polarity.
 * Neutrals are always tinted (chroma ≥ 0.004) — never dead gray.
 *
 * No orange (owner's rule, 2026-10-10): accent and pop are gated through noOrange() whatever the spec
 * says (generated, re-rolled or hand-edited), every derived color is created through uiColor()/mix()
 * /ensureContrast() (color.ts), which never return a color in the guard band, the recipes' partner
 * colors are crimson/berry, rose, gold, olive, sage, teal, majorelle, cobalt…, danger is a crimson and
 * warn a yellow. A quiet palette (muted accent + soft pop) keeps fixed-hue tints and highlighters soft.
 *
 * No orange BLENDS either (blend.ts): the CSS mixes the tokens (accent tints into every ground, washes,
 * shadows, accent ↔ pop rings, fades between grounds), and a crimson accent over a butter or sand
 * field passes through brick and amber on the way even though both tokens are clean. Each section
 * picks an action color, highlighter and status tones whose blends with its block stay clean; then
 * buildPalette() audits every blend the CSS performs and, for any spec, steps through the least
 * visible adjustments until none crosses the band: an ink that leans to the accent (rosewood beside
 * crimson, not cocoa), quieter or accent-tinted grounds, then a pop and finally an accent nudged
 * further from the band (crimson → raspberry, amber-gold → lemon gold).
 */
import type { Archetype, ColorStrategy, Depth, SectionBg } from "@/lib/page/schema";
import type { BaseMood, Harmony } from "./archetypes";
import { BLEND_GUARD, blendHit, forEachMixHit, neutralOf, pairHit, SECTION_MIXES, stepsIn, type Block, type MixPair } from "./blend";
import {
  clamp,
  colorScale,
  contrast,
  deltaE,
  ensureContrast,
  hueDistance,
  isLight,
  leaveOrangeBand,
  nearOrange,
  ORANGE_GUARD,
  luminance,
  minContrast,
  mix,
  neutralScale,
  noOrange,
  normHue,
  onColor,
  toOklch,
  uiColor,
  type Hex,
  type Oklch,
  type OrangeSide,
  type Scale,
} from "./color";
import { pick, range } from "./rng";

export interface PaletteSpec {
  accent: Hex;
  pop: Hex;
  neutralHue?: number;
  base: BaseMood;
  harmony: Harmony;
}

export interface PaletteOptions {
  /** archetype hairline strength 0..1 */
  lineStrength: number;
  /**
   * G11 contrast level (documents with `look` only): "high" moves the ink 0.04 further from the ground and strengthens
   * hairlines × 1.25 (DES-§4.2 G11). Absent = standard, today's palette.
   */
  contrastLevel?: "standard" | "high";
}

export interface SectionColors {
  bg: Hex;
  ink: Hex;
  inkSoft: Hex;
  line: Hex;
  /** ≥ 3:1 boundary color (inputs, focus outlines) */
  lineStrong: Hex;
  accent: Hex;
  accentInk: Hex;
  card: Hex;
  cardInk: Hex;
  chip: Hex;
  chipInk: Hex;
  /** highlighter block behind *emphasis* words — clearly visible on bg, --sec-ink ≥ 4.5:1 on it */
  highlight: Hex;
  /** status text readable on this section's bg and card (form errors on color blocks) */
  success: Hex;
  danger: Hex;
  warn: Hex;
  /** base color for soft shadows in this section */
  shadow: Hex;
  scheme: "light" | "dark";
}

export interface Palette {
  scheme: "light" | "dark";
  /**
   * Muted accent + soft pop (calm, modest, baby products): grounds, tints and highlighters stay
   * whispers, and the theme swaps a highlighter-block emphasis for a quieter one.
   */
  quiet: boolean;
  neutralHue: number;
  bg: Hex;
  surface: Hex;
  surface2: Hex;
  soft: Hex;
  ink: Hex;
  inkSoft: Hex;
  inkMute: Hex;
  line: Hex;
  lineStrong: Hex;
  accent: Hex;
  accentInk: Hex;
  accentSoft: Hex;
  accentStrong: Hex;
  pop: Hex;
  popInk: Hex;
  dark: Hex;
  darkInk: Hex;
  success: Hex;
  danger: Hex;
  warn: Hex;
  a: Scale;
  n: Scale;
  sections: Record<SectionBg, SectionColors>;
}

type HueSource = "accent" | "pop" | "neutral" | number;

export interface HarmonyRecipe {
  id: Harmony;
  label: string;
  description: string;
  neutralHue: (accent: Oklch, base: BaseMood) => number;
  neutralC: Readonly<Record<BaseMood, number>>;
  bgL: Readonly<Record<BaseMood, number>>;
  ink: { l: number; c: number; hue: HueSource };
  soft: { from: HueSource | ((accent: Oklch, pop: Oklch) => HueSource); l: number; c: number };
  dark: { from: HueSource; l: number; c: number };
  /** product color → accent shaping range */
  accentL: readonly [number, number];
  accentC: readonly [number, number];
  /** pull toward the harmony's preferred accent lightness (k = 0 none … 1 full) */
  accentPull: { l: number; k: number };
  /** harmony pop for an accent */
  pop: (accent: Oklch, rng: () => number) => Oklch;
}

const P = (h: number, l: number, c: number): Oklch => ({ h, l, c });

/**
 * Playful partner colors: bubblegum, sunshine, mint, cobalt, lagoon, lime, sky, cherry — candy-bright
 * and never orange (no tomato, tangerine or coral: the owner's no-orange rule).
 */
const PLAYFUL: readonly Oklch[] = [
  P(355, 0.74, 0.17),
  P(95, 0.88, 0.17),
  P(165, 0.82, 0.12),
  P(262, 0.52, 0.21),
  P(195, 0.68, 0.1),
  P(128, 0.87, 0.19),
  P(238, 0.74, 0.11),
  P(14, 0.6, 0.2),
];
const isWarm = (h: number) => h < 110 || h > 330;
const isGreen = (o: Oklch) => o.c >= 0.03 && o.h > 100 && o.h < 185;

/** Pick among candidates that are far enough (hue) from the accent; seeded among the best two. */
function farthest(accent: Oklch, cands: readonly Oklch[], rng: () => number, minDist = 55): Oklch {
  const scored = cands
    .map((c) => ({ c, d: (accent.c < 0.03 ? 90 : hueDistance(c.h, accent.h)) + Math.abs(c.l - accent.l) * 60 }))
    .filter((s) => s.d >= minDist)
    .sort((a, b) => b.d - a.d);
  if (scored.length === 0) return cands[0]!;
  return pick(rng, scored.slice(0, Math.min(2, scored.length))).c;
}

export const HARMONY_RECIPES: Readonly<Record<Harmony, HarmonyRecipe>> = {
  "mono-luxe": {
    id: "mono-luxe",
    label: "Mono luxe",
    description: "Warm ivory or velvet near-black with a single precious accent (oxblood, champagne, bottle green).",
    neutralHue: (a, base) => (base === "dark" && a.c > 0.02 ? a.h : 78),
    neutralC: { light: 0.01, tinted: 0.02, dark: 0.008 },
    bgL: { light: 0.972, tinted: 0.932, dark: 0.165 },
    ink: { l: 0.19, c: 0.012, hue: "neutral" },
    soft: { from: "neutral", l: 0.925, c: 0.02 },
    dark: { from: "accent", l: 0.2, c: 0.03 },
    accentL: [0.32, 0.62],
    accentC: [0.04, 0.13],
    accentPull: { l: 0.4, k: 0.5 },
    // champagne gold, pale champagne, oxblood, bottle green, midnight
    pop: (a, rng) => farthest(a, [P(88, 0.74, 0.1), P(88, 0.85, 0.05), P(16, 0.36, 0.11), P(165, 0.36, 0.06), P(258, 0.36, 0.08)], rng, 50),
  },
  "clay-sage": {
    id: "clay-sage",
    label: "Clay & sage",
    description: "Soft rose clay against muted sage or mint on oat and stone neutrals — calm, clinical warmth.",
    // oat and stone (never apricot): warm neutrals sit at sand hues, 80°+
    neutralHue: (a) => (a.h > 100 && a.h < 180 && a.c > 0.03 ? 80 : 84),
    neutralC: { light: 0.012, tinted: 0.028, dark: 0.012 },
    bgL: { light: 0.975, tinted: 0.942, dark: 0.2 },
    ink: { l: 0.23, c: 0.02, hue: "neutral" },
    // the sage side of the pair tints the soft blocks (accent when the product itself is green)
    soft: { from: (a, p) => (isGreen(a) || !isGreen(p) ? "accent" : "pop"), l: 0.93, c: 0.04 },
    dark: { from: "accent", l: 0.27, c: 0.045 },
    accentL: [0.45, 0.66],
    accentC: [0.05, 0.12],
    accentPull: { l: 0.56, k: 0.3 },
    // rose clay and oat against sage and mint (clay is a dusty rose here, never terracotta)
    pop: (a, rng) => {
      if (a.c >= 0.03 && a.h > 100 && a.h < 185) return pick(rng, [P(14, 0.68, 0.085), P(90, 0.85, 0.07)]);
      if (a.c >= 0.03 && isWarm(a.h)) return pick(rng, [P(140, 0.72, 0.055), P(175, 0.68, 0.045)]);
      return pick(rng, [P(90, 0.85, 0.07), P(14, 0.68, 0.085)]);
    },
  },
  "earth-triad": {
    id: "earth-triad",
    label: "Earth triad",
    description: "Gold, burgundy, majorelle, deep teal and mint tea on warm sand — sun-warm modern Moroccan.",
    // warm sand, not peach: a tinted page at 68° read apricot-cream
    neutralHue: () => 82,
    neutralC: { light: 0.016, tinted: 0.032, dark: 0.02 },
    bgL: { light: 0.968, tinted: 0.932, dark: 0.2 },
    ink: { l: 0.22, c: 0.03, hue: 45 },
    soft: { from: "neutral", l: 0.9, c: 0.045 },
    dark: { from: "accent", l: 0.26, c: 0.06 },
    accentL: [0.45, 0.72],
    accentC: [0.09, 0.17],
    accentPull: { l: 0.56, k: 0.25 },
    // gold (saffron-free), burgundy, majorelle, mint tea, deep teal
    pop: (a, rng) => farthest(a, [P(89, 0.8, 0.14), P(12, 0.42, 0.12), P(268, 0.46, 0.17), P(160, 0.52, 0.09), P(205, 0.46, 0.08)], rng, 70),
  },
  "pop-complement": {
    id: "pop-complement",
    label: "Pop complement",
    description: "Two vivid partner colors as clean, candy-bright color blocks.",
    neutralHue: (a) => (a.c > 0.03 ? a.h : 250),
    neutralC: { light: 0.008, tinted: 0.03, dark: 0.02 },
    bgL: { light: 0.976, tinted: 0.95, dark: 0.2 },
    ink: { l: 0.2, c: 0.035, hue: "accent" },
    soft: { from: "pop", l: 0.93, c: 0.08 },
    dark: { from: "accent", l: 0.25, c: 0.07 },
    accentL: [0.58, 0.8],
    accentC: [0.14, 0.24],
    accentPull: { l: 0.68, k: 0.3 },
    // curated partners instead of a raw complement (pure cyan-on-red glares; violets read "AI")
    pop: (a, rng) => {
      const partners = PLAYFUL.filter((c) => a.c < 0.03 || hueDistance(c.h, a.h) >= 70);
      return pick(rng, partners.length ? partners : PLAYFUL);
    },
  },
  "contrast-neon": {
    id: "contrast-neon",
    label: "Contrast neon",
    description: "Graphite and cool white with one electric accent — volt, cyan, crimson.",
    neutralHue: (a) => (a.c < 0.03 || isWarm(a.h) ? 255 : 60),
    neutralC: { light: 0.005, tinted: 0.012, dark: 0.012 },
    bgL: { light: 0.97, tinted: 0.905, dark: 0.17 },
    ink: { l: 0.17, c: 0.012, hue: "neutral" },
    soft: { from: "neutral", l: 0.915, c: 0.012 },
    dark: { from: "neutral", l: 0.19, c: 0.014 },
    accentL: [0.55, 0.92],
    accentC: [0.16, 0.26],
    accentPull: { l: 0.7, k: 0 },
    // volt, cyan, signal yellow, crimson, electric blue, ice
    pop: (a, rng) => farthest(a, [P(122, 0.92, 0.22), P(205, 0.8, 0.13), P(98, 0.9, 0.18), P(16, 0.58, 0.21), P(262, 0.52, 0.24), P(240, 0.9, 0.04)], rng, 60),
  },
  "cool-precise": {
    id: "cool-precise",
    label: "Cool precise",
    description: "Cool graphite neutrals, electric blue or cyan, an acid lime or signal-red spark.",
    neutralHue: (a) => (a.c > 0.03 && a.h >= 180 && a.h <= 290 ? a.h : 248),
    neutralC: { light: 0.008, tinted: 0.018, dark: 0.022 },
    bgL: { light: 0.976, tinted: 0.955, dark: 0.18 },
    ink: { l: 0.2, c: 0.022, hue: "neutral" },
    soft: { from: "neutral", l: 0.945, c: 0.016 },
    dark: { from: "neutral", l: 0.21, c: 0.035 },
    accentL: [0.5, 0.7],
    accentC: [0.1, 0.22],
    accentPull: { l: 0.58, k: 0.3 },
    // acid lime, signal red (crimson side), aqua
    pop: (a, rng) => farthest(a, [P(125, 0.9, 0.2), P(16, 0.58, 0.19), P(205, 0.8, 0.12)], rng, 60),
  },
  "warm-butter": {
    id: "warm-butter",
    label: "Warm butter",
    description: "Cream and butter with berry, olive or sage — a sunny kitchen.",
    neutralHue: () => 88,
    neutralC: { light: 0.02, tinted: 0.048, dark: 0.02 },
    bgL: { light: 0.975, tinted: 0.942, dark: 0.22 },
    ink: { l: 0.24, c: 0.03, hue: 50 },
    soft: { from: 92, l: 0.925, c: 0.075 },
    dark: { from: "accent", l: 0.26, c: 0.05 },
    accentL: [0.52, 0.68],
    accentC: [0.1, 0.19],
    accentPull: { l: 0.6, k: 0.4 },
    // berry against butter/olive accents; butter or sage against everything else
    pop: (a, rng) => {
      if (a.c >= 0.03 && a.h > 65 && a.h < 140) return P(10, 0.55, 0.16);
      return pick(rng, [P(92, 0.9, 0.1), P(140, 0.8, 0.07)]);
    },
  },
  "blush-berry": {
    id: "blush-berry",
    label: "Blush & berry",
    description: "Blush neutrals with berry, rose or cherry; petal and champagne-nude pops.",
    // blush on the pink side of the accent (a warmer shift would drift toward peach)
    neutralHue: (a) => (a.c > 0.03 && (a.h > 330 || a.h < 40) ? (a.h > 330 ? normHue(a.h + 10) : Math.min(a.h + 6, 18)) : 18),
    neutralC: { light: 0.012, tinted: 0.03, dark: 0.025 },
    bgL: { light: 0.976, tinted: 0.94, dark: 0.2 },
    ink: { l: 0.23, c: 0.035, hue: "accent" },
    soft: { from: "accent", l: 0.935, c: 0.04 },
    dark: { from: "accent", l: 0.25, c: 0.065 },
    accentL: [0.42, 0.62],
    accentC: [0.08, 0.17],
    accentPull: { l: 0.5, k: 0.3 },
    pop: (a, rng) => {
      if (a.l < 0.6) return pick(rng, [P(normHue(a.h + 12), 0.88, 0.05), P(86, 0.88, 0.05)]);
      return pick(rng, [P(5, 0.46, 0.15), P(45, 0.4, 0.05)]);
    },
  },
  "ink-accent": {
    id: "ink-accent",
    label: "Ink & accent",
    description: "Crisp white and true black with one decisive accent and a highlighter pop.",
    neutralHue: (_a, base) => (base === "dark" ? 260 : 85),
    neutralC: { light: 0.005, tinted: 0.012, dark: 0.008 },
    bgL: { light: 0.976, tinted: 0.94, dark: 0.155 },
    ink: { l: 0.16, c: 0.008, hue: "neutral" },
    soft: { from: "neutral", l: 0.935, c: 0.008 },
    dark: { from: "neutral", l: 0.17, c: 0.01 },
    accentL: [0.45, 0.65],
    accentC: [0.12, 0.22],
    accentPull: { l: 0.55, k: 0.3 },
    pop: (a, rng) => {
      // a gold accent takes a cobalt ink-blue (a crimson beside gold rings through amber)
      if (a.c >= 0.03 && a.h > 70 && a.h < 125) return P(258, 0.46, 0.16);
      // a crimson / berry accent takes a cool highlighter (ice, mint): a yellow one beside red blends orange
      const red = a.c >= 0.03 && (a.h >= 290 || a.h < 30);
      if (rng() < 0.7) return red ? pick(rng, [P(205, 0.93, 0.06), P(165, 0.92, 0.09)]) : P(105, 0.93, 0.17);
      // a split complement that lands on orange takes the other split
      const split = P(normHue(a.h + 150), 0.62, 0.15);
      return nearOrange(split) ? P(normHue(a.h - 150), 0.62, 0.15) : split;
    },
  },
};

/**
 * Shape a product color into the harmony's accent range (with a tiny seeded jitter for variety). The
 * result is never orange: a muted warm tone (tan, caramel) becomes taupe/cocoa; a real orange rotates
 * to crimson/berry or to golden yellow (`side`, seeded by the vibe engine for mid-band oranges, picks
 * the direction, else the nearer side); a deep amber goes to oxblood, not to olive.
 */
export function shapeAccent(harmony: Harmony, color: Oklch, rng: () => number, side?: OrangeSide): Oklch {
  const r = HARMONY_RECIPES[harmony];
  const lMin = r.accentL[0];
  let lMax = r.accentL[1];
  let k = r.accentPull.k;
  // antique gold / brass stays luminous in mono-luxe instead of turning brown
  if (harmony === "mono-luxe" && color.h > 76 && color.h < 100) {
    lMax = 0.74;
    k = 0;
  }
  const pulled = color.l + (r.accentPull.l - color.l) * k;
  const shaped = {
    l: clamp(pulled + range(rng, -0.03, 0.03), lMin, lMax),
    c: clamp(color.c * range(rng, 0.94, 1.06), r.accentC[0], r.accentC[1]),
    h: normHue(color.h + range(rng, -4, 4)),
  };
  return leaveOrange(cleanYellow(shaped), side);
}

/**
 * Exit the orange band for a designed color (accent or pop) — the policy of shapeAccent. A vivid
 * color just past the guard (80–88°, amber-gold) is nudged to a clean golden yellow so a designed
 * accent never reads as amber.
 */
export function leaveOrange(o: Oklch, side?: OrangeSide): Oklch {
  if (o.c > 0.1 && o.h > ORANGE_GUARD.hueMax && o.h < 88) return { ...o, h: 89 };
  if (!nearOrange(o)) return o;
  if (o.c <= 0.1 && !side) return leaveOrangeBand(o);
  const s: OrangeSide = side ?? (o.h < 50 ? "low" : "high");
  return leaveOrangeBand(o, s === "high" && o.l < 0.5 ? "low" : s);
}

/**
 * Mid-lightness, low-chroma yellows read as khaki / olive drab — a dated, muddy accent. Turn them
 * into a clean gold or honey (warmer hue, more chroma, a little more light). True olive greens
 * (hue ≥ 112) and already-clean golds are left alone.
 */
function cleanYellow(o: Oklch): Oklch {
  if (o.h < 80 || o.h > 112 || o.l < 0.36 || o.l > 0.7 || o.c >= 0.13) return o;
  // gold, not amber: the hue stays well clear of the orange band (88-94 degrees)
  return { l: Math.max(o.l, 0.62), c: Math.max(o.c, 0.13), h: clamp(o.h, 88, 94) };
}

/**
 * Page background for a harmony/base/neutral hue — the single formula used by buildPalette and by
 * the vibe engine (to keep the pop color from melting into the page).
 * Light backgrounds stay ≤ L 0.976 in every recipe so --lp-surface (≈ +0.021) reads as a separate
 * block instead of the same off-white.
 */
export function pageBackground(harmony: Harmony, base: BaseMood, neutralHue: number): Hex {
  const R = HARMONY_RECIPES[harmony];
  const nc = R.neutralC[base];
  return uiColor({ l: R.bgL[base], c: base === "light" ? nc * 0.8 : nc, h: normHue(neutralHue) });
}

/* ------------------------------------------------------------------ */
/* Solver                                                              */
/* ------------------------------------------------------------------ */

const hueOf =(src: HueSource, accent: Oklch, pop: Oklch, neutralHue: number) =>
  typeof src === "number" ? src : src === "accent" ? accent.h : src === "pop" ? pop.h : neutralHue;

/**
 * chroma available from a hue source (near-neutral products give near-neutral tints). A fixed hue
 * (warm-butter's butter band) stays a whisper on a quiet palette (muted accent + soft pop: calm and
 * modest products), so a cream page never gets a loud yellow block.
 */
const chromaOf = (src: HueSource, max: number, accent: Oklch, pop: Oklch, neutralC: number, quiet = false) => {
  if (typeof src === "number") return quiet ? Math.min(max, 0.035) : max;
  if (src === "neutral") return Math.max(neutralC, Math.min(max, neutralC * 1.6));
  const c = src === "accent" ? accent.c : pop.c;
  return Math.max(0.006, Math.min(max, c * 0.5 + 0.004));
};

/**
 * Text with a 7:1 target, never below 4.5:1. When 7:1 is out of reach (mid-tone color blocks) the
 * deepest *tinted* ink is preferred over pure black/white, as long as it still clears 4.5:1.
 */
function text(fg: Hex, bgs: readonly Hex[]): Hex {
  const t = ensureContrast(fg, bgs, 7);
  if (minContrast(t, bgs) >= 7) return t;
  const o = toOklch(fg);
  const darker = luminance(fg) < luminance(bgs[0]!);
  const tinted = uiColor({ l: darker ? 0.13 : 0.99, c: Math.min(o.c, darker ? 0.03 : 0.012), h: o.h });
  if (minContrast(tinted, bgs) >= 4.5) return tinted;
  return minContrast(t, bgs) >= 4.5 ? t : ensureContrast(t, bgs, 4.5);
}

interface AccentCandidate {
  hex: Hex;
  /** the designed color this candidate stands for (adjustment cost is measured from it) */
  identity: Hex;
  penalty: number;
}
const cand = (hex: Hex, penalty: number, identity: Hex = hex): AccentCandidate => ({ hex, identity, penalty });

/**
 * Pick the action color that stays closest to a designed color while reaching `min` against `bgs`:
 * cost = ΔE(identity → adjusted) + penalty. A dark bottle-green accent on a near-black page would
 * have to turn mint to pass — the champagne pop (or the ink) wins instead. A candidate whose blends
 * with the block cross the orange band (`clean`) only wins when no clean candidate passes: a crimson
 * button on a butter pop block becomes the ink pill instead of tinting the block brick.
 */
function pickAccent(cands: readonly AccentCandidate[], bgs: readonly Hex[], min: number, clean?: (hex: Hex) => boolean): Hex {
  let best: Hex | null = null;
  let bestCost = Infinity;
  let bestClean = false;
  for (const c of cands) {
    const adj = ensureContrast(c.hex, bgs, min);
    if (minContrast(adj, bgs) < min) continue;
    const isClean = clean ? clean(adj) : true;
    const cost = deltaE(c.identity, adj) + c.penalty;
    if ((isClean && !bestClean) || (isClean === bestClean && cost < bestCost)) {
      bestCost = cost;
      best = adj;
      bestClean = isClean;
    }
  }
  return best ?? ensureContrast(cands[cands.length - 1]!.hex, bgs, min);
}

/**
 * A card tone on the same luminance side as `bg` (so section inks stay valid on cards): lighter on
 * light backgrounds; lifted on dark ones — or deepened when lifting would cross to the light side.
 */
function cardFor(bg: Hex): Hex {
  const o = toOklch(bg);
  if (isLight(bg)) {
    const l = o.l > 0.955 ? Math.min(1, o.l + 0.02) : Math.min(0.995, o.l + 0.045);
    // on saturated color blocks the card stays a clean lighter tone of the block (washing the
    // chroma out turns orange into tan, gold into beige)
    return uiColor({ l, c: o.c * (o.c >= 0.06 ? 0.85 : 0.55), h: o.h });
  }
  const lifted = uiColor({ l: o.l + 0.055, c: o.c * 0.9, h: o.h });
  if (!isLight(lifted)) return lifted;
  return uiColor({ l: Math.max(0, o.l - 0.05), c: o.c, h: o.h });
}

const mixOf = (a: string, b: string): MixPair => {
  const p = SECTION_MIXES.find((x) => x.a === a && x.b === b);
  if (!p) throw new Error(`blend pair ${a}×${b} is not in SECTION_MIXES`);
  return p;
};
const SHADOW_ON_BG = mixOf("~shadow", "sec-bg");
const SHADOW_ON_CARD = mixOf("~shadow", "sec-card");
const HIGHLIGHT_ON_BG = mixOf("sec-highlight", "sec-bg");
const DANGER_ON_BG = mixOf("sec-danger", "sec-bg");
const DANGER_ON_CARD = mixOf("sec-danger", "sec-card");
/** every blend the CSS makes of a section's action color, with what it is mixed into */
const ACCENT_MIXES = SECTION_MIXES.filter((p) => p.a === "sec-accent");

/**
 * Base color for a block's soft shadows: a deep tone of the block (a shadow on burgundy is a deep
 * burgundy), dimmed toward neutral when its washes over the block would turn brick or amber.
 */
function shadowBase(bg: Hex, card: Hex): Hex {
  const o = toOklch(bg);
  const l = Math.min(0.24, o.l * 0.3);
  let c = Math.min(0.045, o.c * 0.6);
  for (;;) {
    const s = uiColor({ l, c, h: o.h });
    if (c <= 0.006 || (!pairHit(SHADOW_ON_BG, s, bg) && !pairHit(SHADOW_ON_CARD, s, card))) return s;
    c *= 0.5;
  }
}

/** Status colors, preferred first: a block whose washes turn one orange takes the next (danger leans berry). */
interface StatusColors {
  success: readonly Hex[];
  danger: readonly Hex[];
  warn: readonly Hex[];
}

/** Action-color target on its section: 3:1 (WCAG non-text) plus headroom for light fields behind it. */
const SECTION_ACCENT_MIN = 3.25;

function section(
  bg: Hex,
  o: {
    ink: Hex;
    card?: Hex;
    accents: readonly AccentCandidate[];
    chip?: (s: { bg: Hex; ink: Hex; accent: Hex }) => { chip: Hex; chipInk: Hex };
    /** colors a highlighter block may be tinted from, preferred first */
    marks: readonly Hex[];
    status: StatusColors;
    lineStrength: number;
    /** chroma ceiling of a highlighter tinted from the marks (quiet palettes keep it a whisper) */
    markC?: number;
    /** page neutrals the CSS mixes the action color with (--lp-n-50 / --lp-n-950) */
    n50: Hex;
    n950: Hex;
    /**
     * color blocks (accent, pop, dark) swap a candidate whose blends with the block cross the band
     * for a clean one; page grounds keep the accent (the blend guard re-voices the grounds instead)
     */
    preferClean?: boolean;
    /** one hue per color block: the near-white pill is the first choice (an accent block's CTA) */
    preferWhite?: boolean;
  },
): SectionColors {
  const card = o.card ?? cardFor(bg);
  const pair = [bg, card];
  const ink = text(o.ink, pair);
  const inkSoft = ensureContrast(mix(ink, bg, 0.3), pair, 5);
  const line = mix(bg, ink, 0.1 + 0.75 * clamp(o.lineStrength, 0, 1));
  const lineStrong = ensureContrast(mix(bg, ink, 0.5), pair, 3);
  // last resorts: a near-white button on mid/dark blocks (more refined than a black pill), then ink
  const bgO = toOklch(bg);
  const white = uiColor({ l: 0.985, c: Math.min(bgO.c * 0.25, 0.015), h: bgO.h });
  // what the CSS mixes the action color into on this block (tints, wells, rings, timelines, glows)
  const into: Record<string, Hex> = {
    "sec-bg": bg,
    "sec-card": card,
    "sec-ink": ink,
    "sec-line-strong": lineStrong,
    "~neutral": neutralOf(bg),
    "#ffffff": "#ffffff",
    "#000000": "#000000",
    "lp-n-50": o.n50,
    "lp-n-950": o.n950,
  };
  const clean = (acc: Hex) => ACCENT_MIXES.every((p) => !into[p.b] || !pairHit(p, acc, into[p.b]!));
  const accent = pickAccent([...o.accents, cand(white, o.preferWhite ? 0 : 0.14), cand(ink, 0.18)], pair, SECTION_ACCENT_MIN, o.preferClean ? clean : undefined);
  const accentInk = onColor(accent);
  const chipDef = o.chip?.({ bg, ink, accent }) ?? defaultChip(bg, ink);
  const scheme = isLight(bg) ? "light" : "dark";
  // status hues re-solved (lightness only) for this block: an order form on an accent/dark block
  // keeps readable error text; on the page's own backgrounds the page status colors pass unchanged.
  // Their 10–24% washes must not turn brick on a gold or butter block: the next hue is taken then.
  const washClean = (s: Hex) => !pairHit(DANGER_ON_BG, s, bg) && !pairHit(DANGER_ON_CARD, s, card);
  const status = (cands: readonly Hex[]) => {
    let first: Hex | null = null;
    for (const c of cands) {
      const s = ensureContrast(c, pair, 4.5);
      first ??= s;
      if (washClean(s)) return s;
    }
    // a clay or cocoa block where every status hue washes brick: the first one, calmer
    const o = toOklch(first!);
    for (const k of [0.7, 0.5, 0.35, 0.2]) {
      const s = ensureContrast(uiColor({ l: o.l, c: o.c * k, h: o.h }), pair, 4.5);
      if (washClean(s)) return s;
    }
    return first!;
  };
  return {
    bg,
    ink,
    inkSoft,
    line,
    lineStrong,
    accent,
    accentInk,
    card,
    cardInk: ink,
    chip: chipDef.chip,
    chipInk: chipDef.chipInk,
    highlight: highlightFor(bg, ink, o.marks, o.markC),
    success: status(o.status.success),
    danger: status(o.status.danger),
    warn: status(o.status.warn),
    shadow: shadowBase(bg, card),
    scheme,
  };
}

/**
 * Chip on a section: a small step toward the ink (a pressed tag) with the section ink as text. On
 * mid-tone color blocks that step can push the ink below AA — then the chip steps away from the ink
 * instead, so chip text keeps the section's polarity rather than flipping to the opposite ink.
 */
function defaultChip(bg: Hex, ink: Hex): { chip: Hex; chipInk: Hex } {
  const toward = mix(bg, ink, 0.12);
  if (contrast(ink, toward) >= 4.5) return { chip: toward, chipInk: ink };
  const bgO = toOklch(bg);
  const inkIsLight = luminance(ink) > luminance(bg);
  const away = uiColor({ l: inkIsLight ? 0.13 : 0.985, c: Math.min(bgO.c * 0.3, 0.02), h: bgO.h });
  for (const t of [0.16, 0.24, 0.32]) {
    const chip = mix(bg, away, t);
    if (contrast(ink, chip) >= 4.5 && deltaE(chip, bg) >= 0.03) return { chip, chipInk: ink };
  }
  return { chip: toward, chipInk: ensureContrast(ink, toward, 4.5) };
}

/**
 * Highlighter block for *emphasis* (data-emphasis="highlight"), built as a clean tone — never a mix of
 * two hues, which turns complements into mud. Saturated blocks get a tone of their own color stepped
 * away from the ink (tone-on-tone); other blocks a pastel (dark text) or deep tone (light text) of the
 * pop/accent. It must clearly read on the block (ΔEOK ≥ 0.06) while --sec-ink keeps ≥ 4.5:1 on it.
 */
function highlightFor(bg: Hex, ink: Hex, marks: readonly Hex[], markC = 0.16): Hex {
  const b = toOklch(bg);
  const lightInk = luminance(ink) > luminance(bg);
  // readable, visible, and its wash into the block (--em-hl) never lands on amber or brick
  const fits = (c: Hex) => contrast(ink, c) >= 4.5 && deltaE(c, bg) >= 0.06 && !pairHit(HIGHLIGHT_ON_BG, c, bg);
  // away from the ink first (only adds contrast); toward it when the block already sits at the end of
  // the lightness scale (near-white page, near-black panel) and there is no room left on that side
  const away = [0.1, 0.14, 0.07].map((d) => (lightInk ? -d : d));
  const toward = [0.08, 0.12, 0.16].map((d) => (lightInk ? d : -d));
  const tonal = (): Hex | null => {
    for (const d of [...away, ...toward]) {
      const l = b.l + d;
      if (l < 0.06 || l > 0.97) continue;
      const c = uiColor({ l, c: b.c * 0.9, h: b.h });
      if (fits(c)) return c;
    }
    return null;
  };
  const fromMarks = (): Hex | null => {
    for (const m of marks) {
      const o = toOklch(m);
      // deep tones of yellow are olive drab — a highlighter on a dark block takes the other mark
      if (o.c < 0.03 || (lightInk && o.h > 75 && o.h < 115)) continue;
      const ls = lightInk ? (b.l < 0.45 ? [b.l + 0.16, b.l + 0.12, b.l + 0.08] : [b.l - 0.1, b.l - 0.16]) : [0.92, 0.88, 0.84, 0.8];
      for (const l of ls) {
        const c = uiColor({ l, c: Math.min(o.c * 0.9, lightInk ? 0.15 : 0.16, markC), h: o.h });
        if (fits(c)) return c;
      }
    }
    return null;
  };
  const found = b.c >= 0.06 ? (tonal() ?? fromMarks()) : (fromMarks() ?? tonal());
  if (found) return found;
  // last resort: a tone stepped away from the ink (can only add contrast)
  const far = uiColor({ l: lightInk ? 0.1 : 0.995, c: Math.min(b.c * 0.4, 0.03), h: b.h });
  for (const t of [0.22, 0.32, 0.45]) {
    const c = mix(bg, far, t);
    if (deltaE(c, bg) >= 0.04) return c;
  }
  return mix(bg, far, 0.6);
}

/** The first candidate that stands out from `bg` by ≥ `min` ΔEOK, else the most distinct one. */
function distinctFrom(bg: Hex, cands: readonly Hex[], min: number): Hex {
  let best = cands[0]!;
  let bestD = -1;
  for (const c of cands) {
    const d = deltaE(c, bg);
    if (d >= min) return c;
    if (d > bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* Solve                                                               */
/* ------------------------------------------------------------------ */

/**
 * Adjustments the blend guard may apply on top of the spec (the plain solve uses none), from the
 * least visible (the ink's hue) to the most (the accent itself).
 */
interface Tweak {
  /** accent / pop replacing the spec's (already outside the band) */
  accent?: Hex;
  pop?: Hex;
  /** neutral hue for the page grounds, surfaces, n-scale and neutral-sourced blocks */
  neutralHue?: number;
  /** multiplier on the neutral chroma (page grounds, surfaces, n-scale) */
  neutralK?: number;
  /** multiplier on the soft block's chroma */
  softK?: number;
  /** multiplier on the dark block's chroma */
  darkK?: number;
  /** ink hue (rosewood ink beside a crimson accent instead of cocoa), chroma ≤ 0.022 */
  inkHue?: number;
  /** soft block hue (a fixed butter band turns blush beside a vivid crimson, as a last resort) */
  softHue?: number;
}

/** Quiet palettes: muted accent + soft pop — the engine's own calm palettes and the generator's calm limits. */
const QUIET_ACCENT_C = 0.11;
const QUIET_POP_C = 0.07;
/**
 * Ground chroma ceilings on a quiet page: a whole calm page in blush or butter at chroma 0.04 reads as
 * candy pink / yellow; dusty grounds (rose-ivory, sand, stone) sit at ≤ 0.024.
 */
const QUIET_GROUND_C = 0.024;
const QUIET_SOFT_C = 0.022;

/** The page's grounds and color identities: everything the blocks are made of, before any contrast solving. */
interface Grounds {
  accent: Hex;
  pop: Hex;
  A: Oklch;
  PO: Oklch;
  quiet: boolean;
  base: BaseMood;
  isDark: boolean;
  nh: number;
  nc: number;
  bgL: number;
  bg: Hex;
  surface: Hex;
  surface2: Hex;
  soft: Hex;
  dark: Hex;
  darkC: number;
  darkHue: number;
  n: Scale;
  a: Scale;
}

/* the guard rebuilds grounds for many candidate adjustments: the scales of a color are built once */
const accentScales = new Map<Hex, Scale>();
function scaleOf(hex: Hex): Scale {
  let s = accentScales.get(hex);
  if (!s) {
    s = colorScale(hex);
    if (accentScales.size > 512) accentScales.clear();
    accentScales.set(hex, s);
  }
  return s;
}
const neutralScales = new Map<string, Scale>();
function neutralScaleOf(hue: number, chroma: number): Scale {
  const key = `${hue}|${chroma}`;
  let s = neutralScales.get(key);
  if (!s) {
    s = neutralScale(hue, chroma);
    if (neutralScales.size > 512) neutralScales.clear();
    neutralScales.set(key, s);
  }
  return s;
}

function groundsOf(spec: PaletteSpec, tw: Tweak): Grounds {
  const R = HARMONY_RECIPES[spec.harmony];
  // the gate for every spec (generated, re-rolled or hand-edited): accent and pop are never orange
  const accent = tw.accent ?? noOrange(spec.accent.toLowerCase());
  const pop = tw.pop ?? noOrange(spec.pop.toLowerCase());
  const A = toOklch(accent);
  const PO = toOklch(pop);
  /** muted accent + soft pop (calm / modest products): grounds, fixed-hue tints and highlighters stay whispers */
  const quiet = A.c <= QUIET_ACCENT_C && PO.c <= QUIET_POP_C;
  const base = spec.base;
  const isDark = base === "dark";
  const nh = normHue(tw.neutralHue ?? spec.neutralHue ?? R.neutralHue(A, base));
  const nc = Math.min(R.neutralC[base] * (tw.neutralK ?? 1), quiet ? QUIET_GROUND_C : 1);
  const bgL = R.bgL[base];
  // same formula as pageBackground(), on the (possibly quieted) neutral chroma
  const bg = uiColor({ l: bgL, c: base === "light" ? nc * 0.8 : nc, h: nh });
  const surface = isDark
    ? uiColor({ l: bgL + 0.05, c: nc, h: nh })
    : uiColor({ l: base === "tinted" ? 0.988 : Math.min(0.997, bgL + 0.021), c: nc * 0.45, h: nh });
  const surface2 = isDark ? uiColor({ l: bgL + 0.09, c: nc * 1.1, h: nh }) : uiColor({ l: bgL - 0.035, c: nc * 1.1, h: nh });

  /* soft (gentle color-block) */
  const softFrom = typeof R.soft.from === "function" ? R.soft.from(A, PO) : R.soft.from;
  const softHue = tw.softHue ?? hueOf(softFrom, A, PO, nh);
  let softC = chromaOf(softFrom, R.soft.c, A, PO, nc, quiet) * (tw.softK ?? 1);
  // a quiet page's soft band is a dusty tint (rose-ivory, sand, sage mist), never candy blush
  if (quiet) softC = Math.min(softC, QUIET_SOFT_C);
  let softL = isDark ? bgL + 0.055 : base === "tinted" ? Math.min(R.soft.l, bgL) - 0.035 : R.soft.l;
  // the soft block must read as its own band, not as the page with a smudge
  if (!isDark && bgL - softL < 0.04) softL = bgL - 0.04;
  const soft = uiColor({ l: softL, c: isDark ? softC * 0.8 : softC, h: softHue });

  /* dark (inverse, product-tinted) */
  const darkHue = hueOf(R.dark.from, A, PO, nh);
  const darkK = tw.darkK ?? 1;
  const darkC = chromaOf(R.dark.from, R.dark.c, A, PO, nc, quiet) * darkK;
  const dark = !isDark
    ? uiColor({ l: R.dark.l, c: darkC, h: darkHue })
    : R.dark.from === "accent" && A.c >= 0.03
      ? // product-tinted harmonies: a deep velvet panel of the product color
        uiColor({ l: bgL + 0.045, c: clamp(A.c * 0.55, 0.035, 0.08) * darkK, h: A.h })
      : // asphalt / graphite / ink harmonies: a deeper black
        uiColor({ l: Math.max(0.08, bgL - 0.07), c: darkC, h: darkHue });

  return { accent, pop, A, PO, quiet, base, isDark, nh, nc, bgL, bg, surface, surface2, soft, dark, darkC, darkHue, n: neutralScaleOf(nh, nc), a: scaleOf(accent) };
}

function finishPalette(spec: PaletteSpec, opts: PaletteOptions, tw: Tweak, g: Grounds): Palette {
  const R = HARMONY_RECIPES[spec.harmony];
  const { accent, pop, A, PO, quiet, base, isDark, nh, nc, bgL, bg, surface, surface2, soft, dark, darkC, darkHue } = g;
  const markC = quiet ? 0.045 : 0.16;
  const high = opts.contrastLevel === "high";
  const s = clamp(opts.lineStrength * (high ? 1.25 : 1), 0, 1);
  const inkSep = high ? 0.04 : 0;
  const page = [bg, surface, surface2];

  /* inks ---------------------------------------------------------------- */
  const inkHue = tw.inkHue ?? hueOf(R.ink.hue, A, PO, nh);
  const inkC0 = R.ink.hue === "accent" ? Math.min(R.ink.c, A.c * 0.3 + 0.006) : R.ink.c;
  const inkC = tw.inkHue === undefined ? inkC0 : Math.min(inkC0, 0.022);
  const ink = text(
    isDark ? uiColor({ l: Math.min(0.99, 0.955 + inkSep), c: Math.min(nc, 0.012), h: nh }) : uiColor({ l: Math.max(0.05, R.ink.l - inkSep), c: inkC, h: inkHue }),
    page,
  );
  const inkSoft = ensureContrast(mix(ink, bg, 0.3), page, 5.5);
  const inkMute = ensureContrast(mix(ink, bg, 0.48), page, 4.6);
  const line = mix(bg, ink, 0.1 + 0.75 * s);
  const lineStrong = ensureContrast(mix(bg, ink, 0.5), page, 3);

  /* accent family ------------------------------------------------------ */
  const accentInk = onColor(accent, { hue: A.h });
  const accentSoft = isDark
    ? uiColor({ l: bgL + 0.085, c: Math.min(A.c * 0.45, 0.07), h: A.h })
    : uiColor({ l: base === "tinted" ? 0.915 : 0.935, c: Math.min(A.c * 0.32, 0.055), h: A.h });
  const accentStrong = ensureContrast(
    uiColor({ l: clamp(A.l + (isDark ? 0.06 : -0.06), 0, 1), c: A.c, h: A.h }),
    [...page, accentSoft],
    4.5,
  );
  const popInk = onColor(pop, { hue: PO.h });

  const darkCard = cardFor(dark);
  const darkInk = text(uiColor({ l: 0.965, c: Math.min(darkC, 0.012), h: darkHue }), [dark, darkCard]);

  /* status -------------------------------------------------------------- */
  // danger is a crimson (< 25 deg) and warn a yellow (>= 85 deg): status colors obey the no-orange rule.
  // Alternatives lean away from the band for blocks whose washes would turn brick (berry, deeper green).
  const statusFor = (h: number, c = 0.13) => ensureContrast(uiColor({ l: isDark ? 0.8 : 0.5, c, h }), page, 4.5);
  const status: StatusColors = {
    success: [statusFor(150), statusFor(162), statusFor(172), statusFor(160, 0.085)],
    danger: [statusFor(18), statusFor(9), statusFor(0), statusFor(352), statusFor(6, 0.085)],
    warn: [statusFor(92), statusFor(100)],
  };

  /* sections ------------------------------------------------------------ */
  const pageAccents = [cand(accent, 0), cand(accentStrong, 0.06, accent), cand(pop, 0.12)];
  // a paler accent tint for chips when accent-soft sits too close to a tinted section background
  const accentPale = uiColor({ l: 0.975, c: Math.min(A.c * 0.2, 0.035), h: A.h });
  // on dark pages a deep accent tint is mostly chroma, which barely registers on near-black: when the
  // tint alone is too faint the chip is also lifted toward the ink so the pill reads as a surface
  const darkChip = (sb: Hex, t: number) =>
    distinctFrom(sb, [mix(sb, accent, t), mix(mix(sb, ink, 0.1), accent, t), mix(sb, ink, 0.14)], 0.06);
  const accentChip = ({ bg: sb }: { bg: Hex }) => {
    // a page tinted in the accent's own family (blush page, rose accent) needs a deeper tint to read
    const accentDeep = () => uiColor({ l: Math.max(0.8, toOklch(sb).l - 0.075), c: Math.min(A.c * 0.4, 0.07), h: A.h });
    const chip = isDark ? darkChip(sb, 0.18) : distinctFrom(sb, [accentSoft, accentPale, accentDeep()], 0.04);
    return { chip, chipInk: ensureContrast(accentStrong, chip, 4.5) };
  };
  const common = { status, lineStrength: s, markC, n50: g.n[50], n950: g.n[950] };
  const sections: Record<SectionBg, SectionColors> = {
    base: section(bg, { ink, card: surface, accents: pageAccents, chip: accentChip, marks: [pop, accent], ...common }),
    soft: section(soft, {
      ink,
      accents: pageAccents,
      chip: ({ bg: sb }) => {
        const chip = isDark ? darkChip(sb, 0.2) : surface;
        return { chip, chipInk: ensureContrast(accentStrong, chip, 4.5) };
      },
      marks: [pop, accent],
      ...common,
    }),
    surface: section(surface, { ink, card: isDark ? surface2 : bg, accents: pageAccents, chip: accentChip, marks: [pop, accent], ...common }),
    // an accent block carries one hue: its CTA is a near-white pill (a sage button on raspberry is two
    // loud colors at once); the candy-bright pop-complement keeps its designed pop
    accent: section(accent, {
      ink: accentInk,
      accents: [cand(pop, spec.harmony === "pop-complement" ? 0 : 0.06)],
      marks: [pop],
      preferClean: true,
      preferWhite: spec.harmony !== "pop-complement",
      ...common,
    }),
    dark: section(dark, {
      ink: darkInk,
      card: darkCard,
      accents: [cand(accent, 0), cand(pop, 0.1)],
      chip: ({ bg: sb, ink: si, accent: sa }) => {
        const chip = mix(sb, si, 0.12);
        return { chip, chipInk: ensureContrast(sa, chip, 4.5) };
      },
      marks: [accent, pop],
      preferClean: true,
      ...common,
    }),
    pop: section(pop, { ink: popInk, accents: [cand(accent, 0)], marks: [accent], preferClean: true, ...common }),
  };

  return {
    scheme: isDark ? "dark" : "light",
    quiet,
    neutralHue: nh,
    bg,
    surface,
    surface2,
    soft,
    ink,
    inkSoft,
    inkMute,
    line,
    lineStrong,
    accent,
    accentInk,
    accentSoft,
    accentStrong,
    pop,
    popInk,
    dark,
    darkInk,
    success: status.success[0]!,
    danger: status.danger[0]!,
    warn: status.warn[0]!,
    a: { ...g.a },
    n: { ...g.n },
    sections,
  };
}

/* ------------------------------------------------------------------ */
/* Blend guard                                                         */
/* ------------------------------------------------------------------ */

/** Where a palette's colors sit for the blend audit (the names the CSS mixes). */
function paletteResolver(p: Palette) {
  const root: Record<string, Hex> = {
    "lp-accent": p.accent,
    "lp-pop": p.pop,
    "lp-ink": p.ink,
    "lp-dark-ink": p.darkInk,
    "lp-a-300": p.a[300],
    "lp-bg": p.bg,
    "lp-soft": p.soft,
    "lp-surface": p.surface,
    "lp-dark": p.dark,
    "lp-n-50": p.n[50],
    "lp-n-950": p.n[950],
  };
  const sec = (s: SectionColors): Record<string, Hex> => ({
    "sec-bg": s.bg,
    "sec-ink": s.ink,
    "sec-ink-soft": s.inkSoft,
    "sec-line-strong": s.lineStrong,
    "sec-accent": s.accent,
    "sec-accent-ink": s.accentInk,
    "sec-card": s.card,
    "sec-card-ink": s.cardInk,
    "sec-chip": s.chip,
    "sec-highlight": s.highlight,
    "sec-success": s.success,
    "sec-danger": s.danger,
    "sec-warn": s.warn,
    "~shadow": s.shadow,
  });
  const blocks = new Map<Block, Record<string, Hex>>();
  for (const [k, v] of Object.entries(p.sections)) blocks.set(k as Block, sec(v));
  return {
    section: (block: Block, name: string) => blocks.get(block)?.[name] ?? root[name] ?? null,
    root: (name: string) => root[name] ?? null,
  };
}

/** Blends of this palette the CSS would paint in the band (with the engine's margin), up to `limit`. */
export function paletteBlendIssues(p: Palette, limit = Infinity): { count: number; labels: string[] } {
  const labels: string[] = [];
  forEachMixHit(paletteResolver(p), BLEND_GUARD, (label) => {
    labels.push(label);
    return labels.length < limit;
  });
  return { count: labels.length, labels };
}

/**
 * The blends decided by the grounds alone — accent ↔ pop, the accent ramp, every pair of section
 * grounds (fades) and each ground into black / the deepest neutral — checked before the costly
 * contrast solve. 0 means a full solve is worth trying.
 */
function groundBlendIssues(g: Grounds, limit = 1): number {
  const blockBg: Record<Block, Hex> = { base: g.bg, soft: g.soft, surface: g.surface, accent: g.accent, dark: g.dark, pop: g.pop };
  const root: Record<string, Hex> = {
    "lp-accent": g.accent,
    "lp-pop": g.pop,
    "lp-a-300": g.a[300],
    "lp-bg": g.bg,
    "lp-soft": g.soft,
    "lp-surface": g.surface,
    "lp-dark": g.dark,
    "lp-n-950": g.n[950],
  };
  let n = 0;
  forEachMixHit(
    { section: (block, name) => (name === "sec-bg" ? blockBg[block] : (root[name] ?? null)), root: (name) => root[name] ?? null },
    BLEND_GUARD,
    () => ++n < limit,
  );
  return n;
}

const isRedSide = (o: Oklch) => o.c >= 0.03 && (o.h >= 290 || o.h < 25);
const isYellowSide = (o: Oklch) => o.c >= 0.03 && o.h > 75 && o.h < 135;

/** The same color with its hue moved `d` degrees further from the band (reds toward berry, golds toward lemon). */
function awayFromBand(hex: Hex, d: number): Hex {
  const o = toOklch(hex);
  const dir = isRedSide(o) ? -1 : isYellowSide(o) ? 1 : 0;
  if (dir === 0) return hex;
  return uiColor({ l: o.l, c: o.c, h: normHue(o.h + dir * d) });
}

interface Rung {
  tw: Tweak;
  cost: number;
}

/** Accent ↔ pop as the page blends them: the UGC ring (with the accent's a-300) and a fade between their blocks. */
const RING_STEPS = stepsIn([0, 1]);
/** True when the page can blend this accent and pop without orange (ring, fade, the accent's a-300). */
export function accentPopClean(accent: Hex, pop: Hex): boolean {
  return pairClean(noOrange(accent.toLowerCase()), noOrange(pop.toLowerCase()));
}
function pairClean(accent: Hex, pop: Hex): boolean {
  const a300 = scaleOf(accent)[300];
  return (
    blendHit(accent, pop, BLEND_GUARD, "both", RING_STEPS) === null &&
    blendHit(accent, a300, BLEND_GUARD, "srgb", RING_STEPS) === null &&
    blendHit(pop, a300, BLEND_GUARD, "srgb", RING_STEPS) === null
  );
}

interface PairMove {
  accent?: Hex;
  pop?: Hex;
  cost: number;
}

/**
 * Accent / pop moves, cheapest first: the pop moved in hue (a sage leaning teal), softened, or swapped
 * for a cool partner (a butter highlighter beside crimson can only become sage, teal or cobalt —
 * every warm partner rings through amber); the accent nudged a few degrees further from the band
 * (crimson → raspberry, amber-gold → lemon gold) or softened — the product's own color weighs most.
 * Cost ≈ ΔEOK of the move.
 */
function pairMoves(accent: Hex, pop: Hex): PairMove[] {
  const A = toOklch(accent);
  const PO = toOklch(pop);
  const pops: { pop?: Hex; cost: number }[] = [{ cost: 0 }];
  if (PO.c >= 0.03) {
    const seen = new Set<Hex>([pop]);
    const add = (h: Hex, k = 0.8) => {
      if (seen.has(h)) return;
      seen.add(h);
      pops.push({ pop: h, cost: deltaE(pop, h) * k });
    };
    for (const d of [8, 16, 28, 45]) {
      add(uiColor({ l: PO.l, c: PO.c, h: normHue(PO.h + d) }));
      add(uiColor({ l: PO.l, c: PO.c, h: normHue(PO.h - d) }));
    }
    for (const k of [0.6, 0.35]) add(uiColor({ l: PO.l, c: PO.c * k, h: PO.h }));
    // a pale pop stays a pastel in its new hue (a butter highlighter becomes ice, not neon aqua)
    const coolC = PO.l > 0.85 ? Math.min(Math.max(PO.c * 0.5, 0.04), 0.07) : Math.min(Math.max(PO.c, 0.05), 0.12);
    for (const h of [150, 195, 250]) add(uiColor({ l: PO.l, c: coolC, h }), 0.6);
    add(uiColor({ l: PO.l, c: Math.min(PO.c, 0.03), h: PO.h }), 0.6);
  }
  const accents: { accent?: Hex; cost: number }[] = [{ cost: 0 }];
  for (const d of [4, 8, 12, 16, 24]) {
    const a = awayFromBand(accent, d);
    if (a !== accent && !accents.some((x) => x.accent === a)) accents.push({ accent: a, cost: deltaE(accent, a) * 2.5 });
  }
  if (A.c > 0.06) {
    const softer = uiColor({ l: A.l, c: A.c * 0.75, h: A.h });
    accents.push({ accent: softer, cost: deltaE(accent, softer) * 2.5 });
  }
  return accents.flatMap((a) => pops.map((p) => ({ accent: a.accent, pop: p.pop, cost: a.cost + p.cost }))).sort((x, y) => x.cost - y.cost);
}

/**
 * The first `n` accent / pop moves (cheapest first) whose ring and fade stay clean. `popFree`: the
 * pop is not part of the problem (only grounds and the accent are), so it keeps its color.
 */
function cleanPairMoves(accent: Hex, pop: Hex, n: number, popFree = false): PairMove[] {
  const out: PairMove[] = [];
  for (const m of pairMoves(accent, pop)) {
    if (popFree && m.pop) continue;
    if (pairClean(m.accent ?? accent, m.pop ?? pop)) out.push(m);
    if (out.length >= n) break;
  }
  return out;
}

/**
 * The nearest accent / pop pair the page can blend without orange (the UGC ring accent → pop → a-300,
 * a fade between their blocks). Generators use it to design clean pairs up front, so the spec — and
 * the builder's swatches — show the colors the page renders. Unchanged when already clean.
 */
export function cleanAccentPop(accent: Hex, pop: Hex, accept?: (accent: Hex, pop: Hex) => boolean): { accent: Hex; pop: Hex } {
  const a = noOrange(accent.toLowerCase());
  const p = noOrange(pop.toLowerCase());
  let first: { accent: Hex; pop: Hex } | null = null;
  for (const m of pairMoves(a, p)) {
    const pair = { accent: m.accent ?? a, pop: m.pop ?? p };
    if (!pairClean(pair.accent, pair.pop)) continue;
    // the nearest clean pair that still reads as designed (a pop that stands off the page …)
    if (!accept || accept(pair.accent, pair.pop)) return pair;
    first ??= pair;
  }
  return first ?? { accent: a, pop: p };
}

/**
 * The adjustments the guard may try, cheapest look-change first: clean accent / pop pairs (above)
 * crossed with re-voiced grounds — an ink that leans to the accent (rosewood beside crimson, not
 * cocoa), quieter grounds, rose-ivory or sand grounds.
 */
function blendRungs(g: Grounds, labels: readonly string[]): Rung[] {
  const { A } = g;
  const red = isRedSide(A);
  const lean = red ? (A.h >= 290 ? A.h : Math.min(A.h, 12)) : isYellowSide(A) ? 92 : undefined;
  const inkHue = red ? lean : undefined;
  const grounds: Rung[] = [{ tw: {}, cost: 0 }];
  if (inkHue !== undefined) grounds.push({ tw: { inkHue }, cost: 0.004 });
  grounds.push({ tw: { inkHue, neutralK: 0.5, softK: 0.6 }, cost: 0.014 });
  if (lean !== undefined) grounds.push({ tw: { inkHue, neutralHue: lean, softK: 0.7 }, cost: 0.022 });
  grounds.push({ tw: { inkHue, neutralHue: lean, neutralK: 0.45, softK: 0.4, darkK: 0.6 }, cost: 0.03 });
  grounds.push({ tw: { inkHue: inkHue ?? A.h, neutralK: 0.2, softK: 0.2, darkK: 0.4 }, cost: 0.045 });
  if (lean !== undefined) grounds.push({ tw: { inkHue, neutralHue: lean, softHue: lean, neutralK: 0.25, softK: 0.25, darkK: 0.5 }, cost: 0.05 });
  // the pop only moves when it takes part in a failing blend (its block, a ground pair, the ring)
  const popFree =
    pairClean(g.accent, g.pop) &&
    !labels.some((l) => l.includes("lp-pop") || l.startsWith("pop:") || l.startsWith("accent:sec-accent") || l.startsWith("accent:sec-highlight"));
  const out: Rung[] = [];
  for (const p of cleanPairMoves(g.accent, g.pop, 10, popFree)) {
    for (const gr of grounds) {
      if (gr.cost === 0 && !p.pop && !p.accent) continue;
      out.push({ tw: { ...gr.tw, ...(p.pop ? { pop: p.pop } : {}), ...(p.accent ? { accent: p.accent } : {}) }, cost: gr.cost + p.cost });
    }
  }
  out.sort((x, y) => x.cost - y.cost);
  // last resort, always reachable: whisper grounds leaning to the accent, the accent at its farthest
  // nudge, a cool pop — nothing left to ring through brick or amber
  const farA = awayFromBand(g.accent, 24);
  const PO = toOklch(g.pop);
  const coolPop = PO.c >= 0.03 ? uiColor({ l: PO.l, c: Math.min(Math.max(PO.c, 0.05), 0.12), h: hueDistance(195, toOklch(farA).h) >= 90 ? 195 : 250 }) : g.pop;
  const h0 = toOklch(farA).h;
  out.push({ tw: { inkHue: h0, neutralHue: h0, softHue: h0, neutralK: 0.2, softK: 0.2, darkK: 0.4, accent: farA, pop: coolPop }, cost: 1 });
  out.push({ tw: { inkHue: h0, neutralHue: h0, softHue: h0, neutralK: 0, softK: 0, darkK: 0, accent: farA, pop: uiColor({ l: PO.l, c: Math.min(PO.c, 0.02), h: PO.h }) }, cost: 2 });
  return out;
}

/** Full solves (≈ 2 ms each) the guard may spend on one spec; ground pre-checks are cheap. */
const MAX_FULL_SOLVES = 8;

/**
 * Block separation the page rhythm relies on (pop, accent, soft, dark and surface blocks against the
 * page; scripts/check-theme.ts DISTINCT): an adjustment may not blur a block into the page — it keeps
 * at least the designed minimum, or what the plain solve had when that was already less.
 */
const SEPARATION: readonly (readonly [keyof Grounds, number])[] = [
  ["pop", 0.06],
  ["accent", 0.08],
  ["soft", 0.03],
  ["dark", 0.045],
  ["surface", 0.017],
];
function keepsSeparation(g: Grounds, g0: Grounds): boolean {
  return SEPARATION.every(([k, min]) => deltaE(g[k] as Hex, g.bg) >= Math.min(min, deltaE(g0[k] as Hex, g0.bg)));
}

export function buildPalette(spec: PaletteSpec, opts: PaletteOptions): Palette {
  const g0 = groundsOf(spec, {});
  const first = finishPalette(spec, opts, {}, g0);
  const issues = paletteBlendIssues(first);
  if (issues.count === 0) return first;
  // the plain solve paints orange somewhere: step through the least visible adjustments until no
  // blend the CSS performs crosses the band (any spec — generated, re-rolled or hand-edited)
  let best = { palette: first, count: issues.count };
  let solves = 0;
  for (const { tw, cost } of blendRungs(g0, issues.labels)) {
    // past the budget only the last-resort rungs (cost ≥ 1) are still tried
    if (solves >= MAX_FULL_SOLVES && cost < 1) continue;
    const g = groundsOf(spec, tw);
    if (groundBlendIssues(g) > 0 || (cost < 1 && !keepsSeparation(g, g0))) continue;
    solves++;
    const p = finishPalette(spec, opts, tw, g);
    const { count } = paletteBlendIssues(p, best.count);
    if (count === 0) return p;
    if (count < best.count) best = { palette: p, count };
  }
  return best.palette;
}

/** All text/background pairs the engine guarantees (used by scripts/check-theme.ts and previews). */
export function contrastAudit(p: Palette): { name: string; ratio: number; min: number }[] {
  const out: { name: string; ratio: number; min: number }[] = [];
  const add = (name: string, fg: Hex, bg: Hex, min: number) => out.push({ name, ratio: contrast(fg, bg), min });
  for (const [bgName, bg] of [["bg", p.bg], ["surface", p.surface], ["surface-2", p.surface2]] as const) {
    add(`ink/${bgName}`, p.ink, bg, 4.5);
    add(`ink-soft/${bgName}`, p.inkSoft, bg, 4.5);
    add(`ink-mute/${bgName}`, p.inkMute, bg, 4.5);
    add(`accent-strong/${bgName}`, p.accentStrong, bg, 4.5);
    add(`success/${bgName}`, p.success, bg, 4.5);
    add(`danger/${bgName}`, p.danger, bg, 4.5);
    add(`warn/${bgName}`, p.warn, bg, 4.5);
    add(`line-strong/${bgName}`, p.lineStrong, bg, 3);
  }
  add("accent-strong/accent-soft", p.accentStrong, p.accentSoft, 4.5);
  add("accent-ink/accent", p.accentInk, p.accent, 4.5);
  add("pop-ink/pop", p.popInk, p.pop, 4.5);
  add("dark-ink/dark", p.darkInk, p.dark, 4.5);
  for (const [k, s] of Object.entries(p.sections)) {
    add(`${k}: ink/bg`, s.ink, s.bg, 4.5);
    add(`${k}: ink/card`, s.ink, s.card, 4.5);
    add(`${k}: ink-soft/bg`, s.inkSoft, s.bg, 4.5);
    add(`${k}: ink-soft/card`, s.inkSoft, s.card, 4.5);
    add(`${k}: card-ink/card`, s.cardInk, s.card, 4.5);
    add(`${k}: chip-ink/chip`, s.chipInk, s.chip, 4.5);
    add(`${k}: ink/highlight`, s.ink, s.highlight, 4.5);
    add(`${k}: accent-ink/accent`, s.accentInk, s.accent, 4.5);
    add(`${k}: accent/bg`, s.accent, s.bg, 3);
    add(`${k}: accent/card`, s.accent, s.card, 3);
    add(`${k}: line-strong/bg`, s.lineStrong, s.bg, 3);
    for (const st of ["success", "danger", "warn"] as const) {
      add(`${k}: ${st}/bg`, s[st], s.bg, 4.5);
      add(`${k}: ${st}/card`, s[st], s.card, 4.5);
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* G9 colour strategies (design.md DES-§4.10, DES-§4.4; DS38, H25, H34) */
/* ------------------------------------------------------------------ */

/**
 * How a strategy derives its pop from the accent (H25, the "Pop rule" column of DES-§4.10):
 *  - tint: the accent's own hue, lighter, chroma within ±0.04 (ink+one; dark-luxe, where a dark base allows no third hue)
 *  - split: analogous ±30° or complement 150-210°, chroma within ±0.04 (duotone, color-field)
 *  - same-hue: the same hue at another lightness, chroma within ±0.04 (tonal)
 *  - pastel: analogous, chroma ≤ 0.08 (high-key)
 *  - desaturated: the accent's hue at chroma ≤ 0.04 (mono+signal)
 */
export type PopRule = "tint" | "split" | "same-hue" | "pastel" | "desaturated";

/** A colour strategy as a complete plan (DES-§4.10): base, harmonies, moments, accent area, pop and surfaces. */
export interface ColorPlan {
  strategy: ColorStrategy;
  /** page bases the strategy allows (H27 decides between them from the photo) */
  bases: readonly BaseMood[];
  /**
   * The harmonies of the "G9 → palette" sets (DES-§4.4) that keep H25. A harmony recipe still gives the neutrals, ink,
   * soft and dark tones; on a document with `look` the pop always comes from `planPop` (the recipes' own `pop`
   * functions, which pick partners 55-150° away and gold champagnes, belong to documents without look only).
   */
  harmonies: readonly Harmony[];
  /** harmonies allowed only for some archetypes (contrast-neon: playground, kinetic) */
  only?: Partial<Record<Harmony, readonly Archetype[]>>;
  /** colour moments per page (I4) */
  moments: readonly [number, number];
  /** the G10 accent-area band (H21) */
  area: readonly [number, number];
  pop: PopRule;
  /** full-bleed accent / pop moments per page (≤ 2; color-field ≤ 4, never more than one per screen) */
  fullBleed: number;
  /** the card tiers (G15) the strategy's surfaces allow (H26) */
  cards: readonly Depth[];
  /** tonal may add one tinted layer (the one exception to one card tier) */
  extraLayer: boolean;
}

export const COLOR_PLANS: Readonly<Record<ColorStrategy, ColorPlan>> = {
  "ink+one": { strategy: "ink+one", bases: ["light", "tinted"], harmonies: ["ink-accent", "cool-precise", "mono-luxe"], moments: [1, 1], area: [0.03, 0.08], pop: "tint", fullBleed: 1, cards: ["flat", "hairline"], extraLayer: false },
  duotone: { strategy: "duotone", bases: ["light", "tinted"], harmonies: ["pop-complement", "blush-berry", "clay-sage", "earth-triad"], moments: [2, 2], area: [0.12, 0.22], pop: "split", fullBleed: 2, cards: ["flat", "hairline", "tonal", "ambient", "directional"], extraLayer: false },
  "color-field": { strategy: "color-field", bases: ["light"], harmonies: ["pop-complement", "warm-butter", "contrast-neon"], only: { "contrast-neon": ["playground", "kinetic"] }, moments: [2, 3], area: [0.25, 0.35], pop: "split", fullBleed: 4, cards: ["flat", "hairline"], extraLayer: false },
  tonal: { strategy: "tonal", bases: ["tinted"], harmonies: ["clay-sage", "mono-luxe", "earth-triad"], moments: [1, 2], area: [0.08, 0.16], pop: "same-hue", fullBleed: 2, cards: ["tonal", "flat", "hairline"], extraLayer: true },
  "dark-luxe": { strategy: "dark-luxe", bases: ["dark"], harmonies: ["mono-luxe", "ink-accent"], moments: [1, 1], area: [0.04, 0.1], pop: "tint", fullBleed: 1, cards: ["flat", "hairline"], extraLayer: false },
  "high-key": { strategy: "high-key", bases: ["light"], harmonies: ["blush-berry", "warm-butter", "cool-precise"], moments: [1, 1], area: [0.1, 0.2], pop: "pastel", fullBleed: 1, cards: ["flat", "hairline"], extraLayer: false },
  "mono+signal": { strategy: "mono+signal", bases: ["light", "dark"], harmonies: ["ink-accent", "cool-precise"], moments: [1, 1], area: [0.03, 0.06], pop: "desaturated", fullBleed: 1, cards: ["hairline"], extraLayer: false },
};

/** The gold band of the accent and pop roles (H34, V37): hue 75-95° at chroma > 0.10, measured on the 8-bit colour. */
export function goldBand(hex: Hex): boolean {
  const o = toOklch(hex);
  return o.c > 0.1 && o.h >= 75 && o.h <= 95;
}

/** Hue distance below which a pop counts as analogous, and the complement window (H25). */
const ANALOGOUS = 30;
const COMPLEMENT: readonly [number, number] = [150, 210];
/** 8-bit rounding and gamut mapping move a chroma by a few thousandths: the H25 chroma checks allow this much. */
const CHROMA_EPS = 0.008;

/**
 * Chroma below which an accent or a pop has no hue identity (a near-neutral): the hue relations of H25 do not apply to
 * it (a taupe accent beside an olive pop is a neutral beside one colour, not two hues).
 */
const HUELESS = 0.06;

/**
 * The H25 rule a pop breaks for a strategy, or null. The ±0.04 chroma window binds the analogous / complement pop of
 * `split`; a tint, a same-hue step, a pastel or a signal grey keeps the accent's hue and takes the chroma its
 * lightness allows (a light tint of a vivid accent cannot keep its chroma in sRGB).
 */
export function popRuleViolation(accentHex: Hex, popHex: Hex, strategy: ColorStrategy): string | null {
  const A = toOklch(accentHex);
  const P = toOklch(popHex);
  const rule = COLOR_PLANS[strategy].pop;
  const dh = A.c < HUELESS || P.c < HUELESS ? 0 : hueDistance(A.h, P.h);
  const dc = Math.abs(A.c - P.c);
  if (goldBand(popHex)) return `pop in the gold band (h ${P.h.toFixed(0)}°, C ${P.c.toFixed(3)})`;
  switch (rule) {
    case "split":
      if (!(dh <= ANALOGOUS || (dh >= COMPLEMENT[0] && dh <= COMPLEMENT[1]))) return `pop ${dh.toFixed(0)}° from the accent (analogous ≤ 30° or complement 150-210°)`;
      if (A.c >= HUELESS && dc > 0.04 + CHROMA_EPS) return `pop chroma ${dc.toFixed(3)} from the accent's (≤ 0.04)`;
      return null;
    case "tint":
    case "same-hue":
      if (dh > ANALOGOUS) return `pop ${dh.toFixed(0)}° from the accent (a tint keeps the accent's hue)`;
      return null;
    case "pastel":
      if (dh > ANALOGOUS) return `pastel pop ${dh.toFixed(0)}° from the accent (analogous ≤ 30°)`;
      if (P.c > 0.08 + CHROMA_EPS) return `pastel pop chroma ${P.c.toFixed(3)} (≤ 0.08)`;
      return null;
    case "desaturated":
      if (P.c > 0.04 + CHROMA_EPS) return `signal pop chroma ${P.c.toFixed(3)} (≤ 0.04)`;
      return null;
  }
}

/** A pop candidate is usable when it is outside the orange guard and the gold band. */
const usablePop = (o: Oklch) => {
  const hex = uiColor(o);
  return !goldBand(hex) && !nearOrange(toOklch(hex)) ? hex : null;
};

/**
 * The pop of a strategy from its accent (H25). `u` ∈ [0, 1) is the caller's seeded draw (the analogous / complement
 * choice and the offset); every candidate leaves the orange guard and the gold band, and the first that keeps the
 * rule wins (a tint of the accent is the last resort, which every rule accepts but `split`'s complement).
 */
export function planPop(accentHex: Hex, strategy: ColorStrategy, base: BaseMood, u = 0.5): Hex {
  const A = toOklch(accentHex);
  const dark = base === "dark";
  const tint = (): Oklch => ({ l: dark ? clamp(A.l + 0.2, 0.55, 0.86) : clamp(A.l + 0.28, 0.78, 0.92), c: Math.max(0.012, A.c - 0.04), h: A.h });
  const cands: Oklch[] = [];
  switch (COLOR_PLANS[strategy].pop) {
    case "tint":
      cands.push(tint(), { ...tint(), c: Math.max(0.012, A.c - 0.02) });
      break;
    case "split": {
      // a contrasting lightness for a visible second field first, then steps back toward the accent's lightness
      // until the hue holds its chroma in sRGB (a light complement of a vivid crimson clips to a pastel); chroma
      // within ±0.04 of the accent's
      const far = A.l < 0.58 ? clamp(A.l + 0.24, 0.62, 0.84) : clamp(A.l - 0.22, 0.38, 0.6);
      const ls = [far, (far + A.l) / 2, A.l, A.l < 0.58 ? A.l - 0.08 : A.l + 0.08].map((l) => clamp(l, 0.3, 0.9));
      const c = clamp(A.c + (u - 0.5) * 0.06, 0.04, Math.max(0.04, A.c + 0.04));
      const comp = 150 + u * 60;
      const ana = (u < 0.5 ? -1 : 1) * (18 + (u % 0.5) * 24);
      const order = u < 0.55 ? [comp, ana, 180, -ana] : [ana, comp, -ana, 180];
      for (const dh of order) for (const l of ls) for (const k of [c, Math.max(0.04, A.c - 0.03)]) cands.push({ l, c: k, h: normHue(A.h + dh) });
      break;
    }
    case "same-hue":
      cands.push({ l: A.l < 0.6 ? clamp(A.l + 0.25, 0.7, 0.9) : clamp(A.l - 0.25, 0.3, 0.55), c: Math.max(0.012, A.c - 0.03), h: A.h });
      break;
    case "pastel":
      for (const dh of [(u - 0.5) * 50, 20, -20, 0]) cands.push({ l: 0.88, c: Math.min(0.075, Math.max(0.03, A.c)), h: normHue(A.h + dh) });
      break;
    case "desaturated":
      cands.push({ l: dark ? 0.32 : 0.86, c: Math.min(0.035, A.c), h: A.h });
      break;
  }
  for (const o of cands) {
    const hex = usablePop(o);
    if (hex && !popRuleViolation(accentHex, hex, strategy)) return hex;
  }
  return usablePop(tint()) ?? uiColor({ ...tint(), c: 0.02 });
}

/** The colour families that flatter gold, outside 22-95° (H34): olive, teal, majorelle. */
export const SIGNAL_FAMILIES = { olive: 122, teal: 200, majorelle: 250 } as const;
export type SignalFamily = keyof typeof SIGNAL_FAMILIES;

/**
 * "Sand + signal" (H34, DES-§4.10 worked example): a gold accent or pop becomes the page's warm neutral (its hue at
 * chroma ≤ 0.06, the "sand") and the accent moves to a signal family outside 22-95° (the nearest in hue by default,
 * olive for every gold), at a lightness that holds AA on sand; the pop follows the strategy from the new accent (H25).
 */
export function sandSignal(goldHex: Hex, opts: { family?: SignalFamily; strategy?: ColorStrategy; base?: BaseMood; u?: number } = {}): { sand: Hex; neutralHue: number; accent: Hex; pop: Hex; family: SignalFamily } {
  const G = toOklch(goldHex);
  const family = opts.family ?? (Object.entries(SIGNAL_FAMILIES).sort((a, b) => hueDistance(a[1], G.h) - hueDistance(b[1], G.h))[0]![0] as SignalFamily);
  const sand = uiColor({ l: clamp(Math.max(G.l, 0.9), 0.9, 0.97), c: Math.min(0.045, G.c), h: G.h });
  const accent = uiColor({ l: clamp(G.l, 0.42, 0.5), c: clamp(G.c * 0.75, 0.08, 0.12), h: SIGNAL_FAMILIES[family] });
  const pop = planPop(accent, opts.strategy ?? "duotone", opts.base ?? "light", opts.u ?? 0.7);
  return { sand, neutralHue: normHue(G.h), accent, pop, family };
}

/**
 * The palette half of a compiled genome (DES-§4.4 "G9 → palette"): the strategy's base and harmony (the input's when
 * the plan allows them), the accent out of the gold band (sand + signal), and the H25 pop. Every colour still goes
 * through the no-orange stack (uiColor, buildPalette's blend audit).
 */
export function planPalette(
  input: { accent: Hex; base: BaseMood; harmony: Harmony; neutralHue?: number },
  strategy: ColorStrategy,
  opts: { archetype?: Archetype; u?: number } = {},
): { accent: Hex; pop: Hex; base: BaseMood; harmony: Harmony; neutralHue?: number } {
  const plan = COLOR_PLANS[strategy];
  const allowed = plan.harmonies.filter((h) => !plan.only?.[h] || (opts.archetype && plan.only[h]!.includes(opts.archetype)));
  const harmony = allowed.includes(input.harmony) ? input.harmony : allowed[0]!;
  const base = plan.bases.includes(input.base) ? input.base : plan.bases[0]!;
  let accent = noOrange(input.accent);
  let neutralHue = input.neutralHue;
  // a margin around the gold band: the palette's darker and lighter accent steps (sections' action colours, the
  // strong accent) move the hue a few degrees, so a gold-adjacent accent takes the sand + signal path too
  const A = toOklch(accent);
  if (goldBand(accent) || (A.c > 0.08 && A.h >= 68 && A.h <= 102)) {
    const s = sandSignal(accent, { strategy, base, u: opts.u });
    accent = s.accent;
    neutralHue = s.neutralHue;
  }
  const pop = planPop(accent, strategy, base, opts.u);
  return { accent, pop, base, harmony, ...(neutralHue === undefined ? {} : { neutralHue }) };
}

/**
 * Chromatic hues of a dark-base palette beyond the accent's family (H25 "no third hue on a dark base"): every token
 * colour with chroma > 0.06 must sit within ±30° of the accent or the pop. Returns the offending token names.
 */
export function thirdHues(tokens: Readonly<Record<string, string>>, names: readonly string[] = ["lp-soft", "lp-dark", "lp-surface", "lp-bg", "lp-accent-soft"]): string[] {
  const acc = tokens["lp-accent"];
  const pop = tokens["lp-pop"];
  if (!acc || !pop) return [];
  const A = toOklch(acc);
  const P = toOklch(pop);
  return names.filter((n) => {
    const v = tokens[n];
    if (!v || !/^#[0-9a-f]{6}$/i.test(v)) return false;
    const o = toOklch(v);
    return o.c > 0.06 && hueDistance(o.h, A.h) > ANALOGOUS && hueDistance(o.h, P.h) > ANALOGOUS;
  });
}

