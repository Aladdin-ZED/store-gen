/**
 * Orange the page BLENDS (owner's no-orange rule, 2026-10-10).
 *
 * Two tokens that are each clean can still paint orange: the landing CSS mixes them —
 * `color-mix(in oklab, var(--sec-accent) 4–55%, var(--sec-bg | --sec-card | --sec-ink | #fff …))` for
 * tints, stages, wells and rings; `color-mix(…, transparent)` washes and every rgb(… / a) shadow,
 * glow and aurora light, which the browser composites over the block in sRGB; fade transitions and
 * the UGC ring draw gradients between section grounds and between accent and pop (hex stops
 * interpolate in sRGB, the eased stops in OKLab). A crimson accent over a butter field crosses the
 * band on the way (accent #c04558 × soft #ecdaa2 at 42% → OKLCH h 35°, c 0.079), and so does a gold
 * accent beside a rose pop.
 *
 * This module is the single definition of "a blend in the forbidden band" and of the blends the CSS
 * performs (pairs + the ratios the stylesheets use). buildPalette() and the depth materials use it to
 * stay clean for ANY spec (generated, re-rolled or hand-edited in the builder); the generator and
 * scripts/check-theme.ts use the token-level audit (orangeMixesInTokens) on the emitted theme.
 *
 * Pure & isomorphic; depends on color.ts only.
 */
import { hexToOklab, hexToRgb, HEX_RE, ORANGE_BAND, oklabToRgb8, parseColor, rgb8ToOklab, type Hex } from "./color";

/**
 * oklab: color-mix(in oklab) and eased gradient stops; srgb: alpha washes composited over a block and
 * legacy gradients; oklch: color-mix(in oklch), whose hue travels the shorter arc between the two —
 * crimson into sand passes straight through amber.
 */
export type BlendSpace = "oklab" | "srgb" | "oklch";

export interface BlendHit {
  /** share of the first color (0..1) */
  t: number;
  space: BlendSpace;
  /** OKLCH chroma and hue of the blended color */
  c: number;
  h: number;
}

/**
 * Default mix ratios: 4% … 96% in 4% steps (any tint, wash or gradient stop between two colors).
 * The CSS's own pairs sample only the ratios they use (MixPair.t).
 */
export const BLEND_STEPS: readonly number[] = Array.from({ length: 24 }, (_, i) => Math.round(((i + 1) / 25) * 100) / 100);

/** Sample ratios inside [t0, t1]: every 4% (every 1% on a short range), both ends included (kept inside 2–98%). */
const stepCache = new Map<string, readonly number[]>();
export function stepsIn(t: readonly [number, number]): readonly number[] {
  const key = `${t[0]}-${t[1]}`;
  const hit = stepCache.get(key);
  if (hit) return hit;
  const lo = Math.max(0.02, t[0]);
  const hi = Math.min(0.98, t[1]);
  const step = hi - lo <= 0.2 ? 0.01 : 0.04;
  const out: number[] = [];
  for (let v = lo; v < hi - 1e-9; v += step) out.push(Math.round(v * 1000) / 1000);
  out.push(Math.round(hi * 1000) / 1000);
  if (stepCache.size > 500) stepCache.clear();
  stepCache.set(key, out);
  return out;
}

/** A margin around the owner's band: hue widened by `hue` degrees on both sides, chroma floor lowered. */
export interface BandMargin {
  hue: number;
  chroma: number;
}

/** The owner's band exactly (OKLCH hue 25–75° with chroma > 0.06) — what the checkers measure. */
export const EXACT_BAND: BandMargin = { hue: 0, chroma: 0 };
/**
 * The engine's own guard for what it lets the page blend: 1° and 0.002 of chroma inside the rule, so
 * 8-bit rounding, a browser's mixing precision or a ratio between two samples never lands on the
 * edge (scripts/check-theme.ts reports the margin actually kept).
 */
export const BLEND_GUARD: BandMargin = { hue: 1, chroma: 0.002 };

/** Precomputed bounds of a margin: squared chroma floor and tan() of the hue limits (both under 90°). */
interface Bounds {
  c2: number;
  tanMin: number;
  tanMax: number;
}
const boundsCache = new WeakMap<BandMargin, Bounds>();
function boundsOf(m: BandMargin): Bounds {
  let b = boundsCache.get(m);
  if (!b) {
    const c = ORANGE_BAND.maxChroma - m.chroma;
    const rad = Math.PI / 180;
    b = { c2: c * c, tanMin: Math.tan((ORANGE_BAND.hueMin - m.hue) * rad), tanMax: Math.tan((ORANGE_BAND.hueMax + m.hue) * rad) };
    boundsCache.set(m, b);
  }
  return b;
}

/**
 * OKLab (a, b) in the band (with margin). The band sits inside the first quadrant (hue 0–90°), so a
 * hue test is a slope test: tan(hueMin) ≤ b / a ≤ tan(hueMax) — no atan2 in the hot loop.
 */
export function abInBand(a: number, b: number, m: BandMargin = EXACT_BAND): boolean {
  if (a <= 0 || b <= 0) return false;
  const k = boundsOf(m);
  if (a * a + b * b <= k.c2) return false;
  const r = b / a;
  return r >= k.tanMin && r <= k.tanMax;
}

const hueOf = (a: number, b: number) => {
  const h = (Math.atan2(b, a) * 180) / Math.PI;
  return h < 0 ? h + 360 : h;
};

/* endpoint cache: palettes re-test the same few dozen colors many times */
interface Endpoint {
  /** OKLab */
  l: number;
  a: number;
  b: number;
  /** OKLCH chroma and hue (radians) */
  c: number;
  hr: number;
  /** gamma sRGB 0..255 */
  r8: number;
  g8: number;
  b8: number;
}
const endpoints = new Map<string, Endpoint>();
function endpoint(hex: Hex): Endpoint {
  let e = endpoints.get(hex);
  if (e) return e;
  const o = hexToOklab(hex);
  const [r, g, b] = hexToRgb(hex);
  e = { l: o.l, a: o.a, b: o.b, c: Math.hypot(o.a, o.b), hr: Math.atan2(o.b, o.a), r8: Math.round(r * 255), g8: Math.round(g * 255), b8: Math.round(b * 255) };
  if (endpoints.size > 4000) endpoints.clear();
  endpoints.set(hex, e);
  return e;
}

const tmp: number[] = [0, 0, 0];
const tmp8: number[] = [0, 0, 0];

/** Where a mixed value is re-measured as the 8-bit color a browser paints (dark colors swing most). */
const NEAR: BandMargin = { hue: 8, chroma: 0.015 };

/** A mixed OKLab value in the band — as computed, or as painted once rounded to 8 bits. */
function labHit(L: number, a: number, b: number, m: BandMargin): { c: number; h: number } | null {
  if (abInBand(a, b, m)) return { c: Math.hypot(a, b), h: hueOf(a, b) };
  if (!abInBand(a, b, NEAR)) return null;
  oklabToRgb8(L, a, b, tmp8);
  rgb8ToOklab(tmp8[0]!, tmp8[1]!, tmp8[2]!, tmp);
  return abInBand(tmp[1]!, tmp[2]!, m) ? { c: Math.hypot(tmp[1]!, tmp[2]!), h: hueOf(tmp[1]!, tmp[2]!) } : null;
}

/**
 * The first blend of `x` into `y` that lands in the band: an OKLab mix (color-mix in oklab, eased
 * gradient stops), an sRGB mix quantized to 8 bits (alpha compositing of washes, shadows and lights;
 * legacy gradients) — "both" — or an OKLCH mix (hue along the shorter arc). `t` is the share of `x`.
 * null when every sampled blend is clean.
 */
export function blendHit(
  x: Hex,
  y: Hex,
  m: BandMargin = BLEND_GUARD,
  spaces: "both" | BlendSpace = "both",
  steps: readonly number[] = BLEND_STEPS,
): BlendHit | null {
  if (x === y) return null;
  const P = endpoint(x);
  const Q = endpoint(y);
  if (spaces === "oklch") return oklchHit(P, Q, m, steps);
  // quick exit: the whole segment sits on the cool side (b < 0) or the green/blue side (a < 0) of
  // OKLab — no mix of such colors reaches hue 22–78° (sRGB paths bow a little: a small margin)
  if ((P.b < -0.004 && Q.b < -0.004) || (P.a < -0.004 && Q.a < -0.004)) return null;
  for (const t of steps) {
    if (spaces !== "srgb") {
      const hit = labHit(Q.l + (P.l - Q.l) * t, Q.a + (P.a - Q.a) * t, Q.b + (P.b - Q.b) * t, m);
      if (hit) return { t, space: "oklab", ...hit };
    }
    if (spaces !== "oklab") {
      const r = Math.round(Q.r8 + (P.r8 - Q.r8) * t);
      const g = Math.round(Q.g8 + (P.g8 - Q.g8) * t);
      const bl = Math.round(Q.b8 + (P.b8 - Q.b8) * t);
      rgb8ToOklab(r, g, bl, tmp);
      if (abInBand(tmp[1]!, tmp[2]!, m)) return { t, space: "srgb", c: Math.hypot(tmp[1]!, tmp[2]!), h: hueOf(tmp[1]!, tmp[2]!) };
    }
  }
  return null;
}

/** OKLCH interpolation (CSS color-mix in oklch): chroma linear, hue along the shorter arc. */
function oklchHit(P: Endpoint, Q: Endpoint, m: BandMargin, steps: readonly number[]): BlendHit | null {
  // a gray end has no hue of its own (CSS: powerless) and takes the other end's
  const gray = 1e-4;
  const hp = P.c < gray ? Q.hr : P.hr;
  let hq = Q.c < gray ? P.hr : Q.hr;
  let d = hp - hq;
  if (d > Math.PI) hq += 2 * Math.PI;
  else if (d < -Math.PI) hq -= 2 * Math.PI;
  d = hp - hq;
  for (const t of steps) {
    const c = Q.c + (P.c - Q.c) * t;
    const h = hq + d * t;
    const hit = labHit(Q.l + (P.l - Q.l) * t, c * Math.cos(h), c * Math.sin(h), m);
    if (hit) return { t, space: "oklch", ...hit };
  }
  return null;
}

/** "#rrggbb" of any CSS color literal (fast path for the engine's own hex and rgb(r g b / a)). */
const RGB_LIT = /^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/;
export function literalHex(lit: string): Hex | null {
  const s = lit.trim().toLowerCase();
  if (HEX_RE.test(s)) return s;
  const m = RGB_LIT.exec(s);
  if (m) {
    const ch = [m[1], m[2], m[3]].map((v) => Math.min(255, Number(v)).toString(16).padStart(2, "0"));
    return `#${ch.join("")}`;
  }
  return parseColor(s);
}

/**
 * The first orange blend between two CSS colors (OKLab mix, then sRGB, 4–96%) against the owner's
 * exact band, as "t=0.42 oklab" — null when clean. Same contract as the generator's first helper.
 */
export function orangeBlend(a: string, b: string): string | null {
  const x = literalHex(a);
  const y = literalHex(b);
  if (!x || !y || x === y) return null;
  const hit = blendHit(x, y, EXACT_BAND);
  return hit ? `t=${hit.t} ${hit.space}` : null;
}

/* ------------------------------------------------------------------ */
/* The blends the landing CSS performs                                 */
/* ------------------------------------------------------------------ */

/**
 * One blend the CSS performs: `a` mixed into `b`, the share of `a` sampled over `t` (the ratios the
 * stylesheets actually use, with a little room either side), in OKLab (color-mix in oklab, eased
 * gradient stops), sRGB (alpha washes composited over the block, legacy gradients) or both.
 */
export interface MixPair {
  a: string;
  b: string;
  space: "both" | BlendSpace;
  t: readonly [number, number];
  /** the sampled ratios inside `t` (every 4%, both ends) */
  steps: readonly number[];
}
const mixPair = (a: string, b: string, space: MixPair["space"], t0: number, t1: number): MixPair => ({ a, b, space, t: [t0, t1], steps: stepsIn([t0, t1]) });

/**
 * Pairs mixed inside one section (`--sec-*` of the same [data-bg] block). Special names: "#ffffff" /
 * "#000000" (literal white / black in the CSS), "~neutral" (oklch(from var(--sec-bg) l 0 0), the
 * gray of the block's lightness), "lp-*" (root tokens).
 */
export const SECTION_MIXES: readonly MixPair[] = [
  // accent tints, wells, rings and stages: color-mix(in oklab, accent 4–55%, bg | card) and accent
  // washes (color-mix(…, transparent), rgb(accent / a) glows) composited over the block at 5–70%
  mixPair("sec-accent", "sec-bg", "both", 0.04, 0.72),
  // urgency's live-timer tints mix in oklch (7% / 14%)
  mixPair("sec-accent", "sec-bg", "oklch", 0.04, 0.18),
  mixPair("sec-accent", "sec-card", "both", 0.04, 0.72),
  mixPair("sec-accent", "sec-ink", "oklab", 0.24, 0.62),
  mixPair("sec-accent", "sec-line-strong", "oklab", 0, 1),
  mixPair("sec-accent", "~neutral", "oklab", 0.08, 0.26),
  mixPair("sec-accent", "#ffffff", "oklab", 0.4, 0.52),
  mixPair("sec-accent", "#000000", "oklab", 0.8, 0.9),
  mixPair("sec-accent", "lp-n-50", "oklab", 0.64, 0.76),
  mixPair("sec-accent", "lp-n-950", "oklab", 0.74, 0.86),
  // the button's own ink washed over the button (chips, sheen)
  mixPair("sec-accent-ink", "sec-accent", "both", 0.1, 0.3),
  // highlighter wash (--em-hl) and plain tones over the ground
  mixPair("sec-highlight", "sec-bg", "oklab", 0.55, 0.8),
  mixPair("sec-ink", "sec-bg", "both", 0.02, 0.5),
  mixPair("sec-ink", "sec-card", "both", 0.02, 0.2),
  mixPair("sec-ink-soft", "sec-card-ink", "oklab", 0.66, 0.78),
  mixPair("sec-card-ink", "sec-card", "oklab", 0.02, 0.82),
  mixPair("sec-card", "sec-bg", "oklab", 0.2, 0.8),
  mixPair("sec-card", "#ffffff", "oklab", 0.36, 0.9),
  mixPair("sec-card", "#000000", "oklab", 0.66, 0.74),
  mixPair("sec-chip", "sec-bg", "oklab", 0.2, 0.8),
  mixPair("sec-bg", "#000000", "oklab", 0.5, 0.95),
  mixPair("sec-bg", "lp-n-950", "oklab", 0.44, 0.56),
  // page-level tones washed over whatever block they land on: the order form's ink shadows
  // (55–80%), the dark scrims and video vignettes (16–55%), the pop glow under a bundle card (70%),
  // the video rim / glare (13–16%)
  mixPair("lp-ink", "sec-bg", "srgb", 0.5, 0.85),
  mixPair("lp-dark", "sec-bg", "srgb", 0.12, 0.6),
  mixPair("lp-pop", "sec-bg", "srgb", 0.6, 0.75),
  mixPair("lp-dark-ink", "sec-bg", "srgb", 0.1, 0.2),
  // status washes behind form messages and badges (10–24%)
  mixPair("sec-success", "sec-bg", "srgb", 0.08, 0.28),
  mixPair("sec-danger", "sec-bg", "srgb", 0.08, 0.28),
  mixPair("sec-success", "sec-card", "srgb", 0.08, 0.28),
  mixPair("sec-danger", "sec-card", "srgb", 0.08, 0.28),
  // the block's shadow color at its strongest layer (≤ 0.6), over the block and its cards — in the
  // emitted tokens every shadow literal is checked as a wash (SECTION_WASHES); "~shadow" is the
  // palette's own base color, so buildPalette() can see it before the depth tokens exist
  mixPair("~shadow", "sec-bg", "srgb", 0.02, 0.6),
  mixPair("~shadow", "sec-card", "srgb", 0.02, 0.6),
  // Offers v2 (docs/OFFERS.md §E.3, §E.6): the "solid" selected style on the bold slab is an ink fill whose
  // chips are the card washed over the ink (16%); monogram tiles and the "+" / "ou" chips lay accent
  // tints on the chip tone
  mixPair("sec-card", "sec-ink", "both", 0.1, 0.3),
  mixPair("sec-accent", "sec-chip", "oklab", 0.02, 0.3),
  // product stage tones and their lit / floor blends
  mixPair("mx-stage", "#ffffff", "oklab", 0.14, 0.9),
  mixPair("mx-stage-lo", "sec-ink", "oklab", 0.84, 0.92),
];

/**
 * Translucent materials of a section (every rgb(… / a) inside shadows, glows, glass, highlights, the product floor and
 * the stage presets): composited over the block and its cards (sRGB, 0 … a). This is the registry of every emitted
 * shadow and translucent colour (owner rule 1, DS48): `scripts/check-theme.ts` fails on an emitted token that carries a
 * translucent colour and is not listed here. The look tokens of DES-§4.10.1 / §4.11.1 (card and float shadows, the
 * recipe hairline, the stage glow, contact and plinth) are registered with the rest; the aurora lights are gone
 * (core D60 rev 3, V40).
 */
export const SECTION_WASHES: readonly string[] = [
  "lp-shadow-s",
  "lp-shadow-m",
  "lp-shadow-l",
  "lp-shadow-glow",
  "lp-shadow-product",
  "lp-shadow-product-filter",
  "lp-highlight",
  "lp-highlight-accent",
  "sec-glass",
  "sec-glass-border",
  "lp-stage-glow",
  "lp-shadow-card",
  "lp-shadow-float",
  "lp-line",
  "lp-stage-glow-2",
  "lp-stage-contact",
];

/** Page-level pairs: the UGC ring (conic pop → accent → a-300 → pop, sRGB). */
export const PAGE_MIXES: readonly MixPair[] = [
  mixPair("lp-accent", "lp-pop", "srgb", 0, 1),
  mixPair("lp-accent", "lp-a-300", "srgb", 0, 1),
  mixPair("lp-pop", "lp-a-300", "srgb", 0, 1),
];

/** Raw section grounds (dividers, fades in OKLab with an sRGB fallback, overlaps): any two may meet. */
export const GROUND_TOKENS: readonly string[] = ["lp-bg", "lp-soft", "lp-surface", "lp-accent", "lp-dark", "lp-pop"];

/** The first hit of a MixPair between two resolved colors. */
export function pairHit(p: MixPair, a: Hex, b: Hex, m: BandMargin = BLEND_GUARD): BlendHit | null {
  return blendHit(a, b, m, p.space, p.steps);
}

/** `fg` at `alpha` over `bg` (sRGB source-over, 8-bit) — the color a wash paints. */
function over(fg: { r8: number; g8: number; b8: number }, alpha: number, bg: { r8: number; g8: number; b8: number }) {
  return {
    r8: Math.round(fg.r8 * alpha + bg.r8 * (1 - alpha)),
    g8: Math.round(fg.g8 * alpha + bg.g8 * (1 - alpha)),
    b8: Math.round(fg.b8 * alpha + bg.b8 * (1 - alpha)),
  };
}

/**
 * Two translucent lights stacked over a ground (aurora overlaps): the upper light `li` (alpha up to
 * `ai`) over the lower one `lj` (up to `aj`) over `ground`. null when every stacked color is clean.
 */
export function stackHit(li: Hex, ai: number, lj: Hex, aj: number, ground: Hex, m: BandMargin = BLEND_GUARD): BlendHit | null {
  const I = endpoint(li);
  const J = endpoint(lj);
  const G = endpoint(ground);
  for (const u of [0.25, 0.5, 0.75, 1]) {
    const under = over(J, aj * u, G);
    for (const s of [0.25, 0.5, 0.75, 1]) {
      const c = over(I, ai * s, under);
      rgb8ToOklab(c.r8, c.g8, c.b8, tmp);
      if (abInBand(tmp[1]!, tmp[2]!, m)) return { t: s, space: "srgb", c: Math.hypot(tmp[1]!, tmp[2]!), h: hueOf(tmp[1]!, tmp[2]!) };
    }
  }
  return null;
}

/** The six [data-bg] blocks, in the token map's `${bg}:sec-…` prefix form. */
export const BLOCKS = ["base", "soft", "surface", "accent", "dark", "pop"] as const;
export type Block = (typeof BLOCKS)[number];

/** Where the colors of a mix check come from (a built palette, or emitted tokens). */
export interface MixResolver {
  /** a section-level name ("sec-accent", "~shadow", "lp-n-50" …) on one block; null = not available */
  section(block: Block, name: string): Hex | null;
  /** a page-level token ("lp-accent", "lp-a-300", "lp-bg" …) */
  root(name: string): Hex | null;
}

/**
 * Visit every orange blend of the section pairs, page pairs and ground pairs (the palette-level part
 * of the CSS's blends; orangeMixesInTokens adds the translucent materials). `visit` returns false to
 * stop early. Special names "#ffffff", "#000000" and "~neutral" are resolved here.
 */
export function forEachMixHit(r: MixResolver, m: BandMargin, visit: (label: string, a: Hex, b: Hex, hit: BlendHit) => boolean): void {
  for (const block of BLOCKS) {
    const k = (name: string): Hex | null => {
      if (name === "#ffffff" || name === "#000000") return name;
      if (name === "~neutral") {
        const g = r.section(block, "sec-bg");
        return g ? neutralOf(g) : null;
      }
      return r.section(block, name);
    };
    for (const p of SECTION_MIXES) {
      const a = k(p.a);
      const b = k(p.b);
      if (!a || !b) continue;
      const hit = pairHit(p, a, b, m);
      if (hit && !visit(`${block}:${p.a}×${p.b}`, a, b, hit)) return;
    }
  }
  for (const p of PAGE_MIXES) {
    const a = r.root(p.a);
    const b = r.root(p.b);
    if (!a || !b) continue;
    const hit = pairHit(p, a, b, m);
    if (hit && !visit(`${p.a}×${p.b}`, a, b, hit)) return;
  }
  for (let i = 0; i < GROUND_TOKENS.length; i++) {
    for (let j = i + 1; j < GROUND_TOKENS.length; j++) {
      const a = r.root(GROUND_TOKENS[i]!);
      const b = r.root(GROUND_TOKENS[j]!);
      if (!a || !b) continue;
      const hit = blendHit(a, b, m, "both");
      if (hit && !visit(`ground ${GROUND_TOKENS[i]}×${GROUND_TOKENS[j]}`, a, b, hit)) return;
    }
  }
}

const COLOR_LITERAL = /#[0-9a-fA-F]{6}\b|\brgba?\([^()]*\)/g;
const ALPHA_OF = /\/\s*([\d.]+)\s*\)$|,\s*([\d.]+)\s*\)$/;

/** Every translucent color literal in a token value, with its alpha (opaque literals are skipped). */
export function washesOf(value: string): { hex: Hex; alpha: number }[] {
  const out: { hex: Hex; alpha: number }[] = [];
  for (const lit of value.match(COLOR_LITERAL) ?? []) {
    const m = ALPHA_OF.exec(lit);
    const alpha = m ? Number(m[1] ?? m[2]) : 1;
    if (!(alpha > 0) || alpha >= 1) continue;
    const hex = literalHex(lit);
    if (hex) out.push({ hex, alpha });
  }
  return out;
}

/**
 * Every orange blend the page can paint from these tokens (BuiltTheme.tokens), as readable labels
 * ("soft:sec-accent×sec-bg #c04558×#ecdaa2 t=0.42 oklab (h 35.2° c 0.079)"). Default margin: the
 * owner's exact band.
 */
export function orangeMixesInTokens(tokens: Readonly<Record<string, string>>, m: BandMargin = EXACT_BAND): string[] {
  const out: string[] = [];
  const hex = (v: string | undefined): Hex | null => (v ? literalHex(v) : null);
  const report = (label: string, a: Hex, b: Hex, hit: BlendHit | null) => {
    if (hit) out.push(`${label} ${a}×${b} t=${hit.t} ${hit.space} (h ${hit.h.toFixed(1)}° c ${hit.c.toFixed(3)})`);
  };
  forEachMixHit(
    {
      // "~shadow" is palette-internal: the emitted shadows are checked below as washes
      section: (block, name) => (name.startsWith("~") ? null : hex(tokens[`${block}:${name}`] ?? tokens[name])),
      root: (name) => hex(tokens[name]),
    },
    m,
    (label, a, b, hit) => {
      report(label, a, b, hit);
      return true;
    },
  );
  for (const bg of BLOCKS) {
    const ground = hex(tokens[`${bg}:sec-bg`]);
    const card = hex(tokens[`${bg}:sec-card`]);
    for (const name of SECTION_WASHES) {
      const v = tokens[`${bg}:${name}`];
      if (!v) continue;
      for (const w of washesOf(v)) {
        if (ground) report(`${bg}:${name}/bg`, w.hex, ground, blendHit(w.hex, ground, m, "srgb", stepsIn([0.02, w.alpha])));
        if (card) report(`${bg}:${name}/card`, w.hex, card, blendHit(w.hex, card, m, "srgb", stepsIn([0.02, w.alpha])));
      }
    }
  }
  return out;
}

/** oklch(from <c> l 0 0): the gray of a color's own OKLab lightness. */
const neutralCache = new Map<string, Hex>();
export function neutralOf(hex: Hex): Hex {
  const hit = neutralCache.get(hex);
  if (hit) return hit;
  const L = hexToOklab(hex).l;
  // a neutral's linear luminance is L³ (OKLab), encoded back to sRGB
  const lin = Math.max(0, Math.min(1, L * L * L));
  const v = lin <= 0.0031308 ? lin * 12.92 : 1.055 * lin ** (1 / 2.4) - 0.055;
  const c = Math.round(Math.max(0, Math.min(1, v)) * 255)
    .toString(16)
    .padStart(2, "0");
  const n = `#${c}${c}${c}`;
  if (neutralCache.size > 2000) neutralCache.clear();
  neutralCache.set(hex, n);
  return n;
}
