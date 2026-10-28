/**
 * Depth & materials (docs/DESIGN.md §1.2): per-section shadows, inner highlights, accent glow, frosted
 * glass and aurora light. Everything is derived from the section's solved colors (palette.ts), so a
 * shadow on a burgundy block is a deep burgundy, glass on a dark panel is smoked, and the light
 * fields are made of the product's own hues — never a stock purple→blue gradient.
 *
 * Guarantees (re-verified on the emitted tokens by scripts/check-theme.ts):
 *  - --sec-glass-ink ≥ 4.5:1 on the glass composited over ANY backdrop (pure black, pure white, the
 *    section bg) and on --sec-glass-solid (the opaque fallback) — glass chips stay AA over photos;
 *  - --sec-ink / --sec-ink-soft ≥ 4.5:1 and --sec-accent ≥ 3:1 everywhere on the aurora field as
 *    rendered (solved over a lattice of the whole box, overlaps and soft edges included), and on
 *    --lp-stage-glow over the plain section (it sits behind a product, not under the field's text);
 *  - the product stage tint (--mx-stage, -hi, -lo) is one clean hue, clearly off its block, with
 *    --sec-ink ≥ 4.5:1 on all three tones;
 *  - no orange: every tone is created through uiColor()/mix() (color.ts), which never return a color
 *    in the forbidden band (OKLCH hue 25–75° with chroma > 0.06), and the light hues below never
 *    interpolate across it.
 *
 * "No shadow" is emitted as `0 0 #0000` so tokens always compose: `box-shadow: var(--lp-highlight),
 * var(--lp-shadow-m)` stays valid in every theme. Values are built from computed hex + numbers only.
 */
import type { GlassDef, ShadowKind } from "./archetypes";
import { BLEND_GUARD, blendHit, stackHit, stepsIn } from "./blend";
import {
  clamp,
  colorScale,
  composite,
  contrast,
  deltaE,
  ensureContrast,
  hueDistance,
  lerpHue,
  luminance,
  minContrast,
  mix,
  nearOrange,
  normHue,
  rgba,
  roundAlpha,
  SCALE_STEPS,
  toOklch,
  uiColor,
  type Hex,
  type ScaleStep,
} from "./color";
import type { SectionColors } from "./palette";
import { range, rngFor } from "./rng";

/** A composable "no shadow" (valid inside a comma-separated box-shadow list, unlike `none`). */
export const NO_SHADOW = "0 0 #0000";

/** Glass text target — a hair above AA so 8-bit rounding in any browser keeps it ≥ 4.5:1. */
const GLASS_MIN = 4.6;
const AURORA_TEXT_MIN = 4.6;
const AURORA_ACCENT_MIN = 3.08;

const num = (v: number) => {
  const s = v.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  return s === "-0" ? "0" : s;
};
const px = (v: number) => (v === 0 ? "0" : `${num(v)}px`);

/* ------------------------------------------------------------------ */
/* Shadows, highlight, glow                                            */
/* ------------------------------------------------------------------ */

/** [y offset, blur, spread, alpha, tinted-glow layer?] — every layer is vertical (no RTL mirroring). */
type Layer = readonly [number, number, number, number, boolean?];
interface ShadowRecipe {
  s: readonly Layer[];
  m: readonly Layer[];
  l: readonly Layer[];
}

/**
 * Multi-layer shadows: a tight contact layer + a wide ambient layer (+ a long penumbra for large
 * elevations), large blur and low opacity, the way physical light falls — never one gray blob.
 * Blur radii stay ≤ 72px: beyond that Chromium can tile the blurred mask of a large rounded panel
 * into a visible horizontal seam, and the paint cost grows with the radius on phones.
 */
const RECIPES: Readonly<Record<Exclude<ShadowKind, "none">, ShadowRecipe>> = {
  soft: {
    s: [[1, 2, 0, 0.06], [2, 6, -2, 0.06]],
    m: [[1, 2, 0, 0.04], [4, 10, -4, 0.07], [16, 32, -12, 0.14]],
    l: [[2, 4, 0, 0.04], [12, 24, -8, 0.09], [40, 72, -24, 0.2]],
  },
  deep: {
    s: [[1, 2, 0, 0.08], [4, 10, -4, 0.1]],
    m: [[2, 4, 0, 0.05], [10, 20, -8, 0.14], [28, 48, -18, 0.24]],
    l: [[4, 8, 0, 0.05], [24, 40, -16, 0.18], [56, 72, -26, 0.32]],
  },
  glow: {
    s: [[1, 2, 0, 0.06], [4, 12, -4, 0.14, true]],
    m: [[1, 2, 0, 0.04], [8, 18, -8, 0.1], [18, 40, -14, 0.3, true]],
    l: [[2, 4, 0, 0.04], [16, 32, -12, 0.12], [36, 72, -22, 0.36, true]],
  },
};

/** Interactive glow intensity per shadow language (selection rings, hovered buttons). */
const GLOW_STRENGTH: Readonly<Record<ShadowKind, number>> = { none: 0.65, soft: 0.8, deep: 0.85, glow: 1 };

export interface SectionDepth {
  shadowS: string;
  shadowM: string;
  shadowL: string;
  /** accent glow for focus/selection/hover — tinted by this section's action color */
  shadowGlow: string;
  /** 1px inner top highlight for raised surfaces (cards, chips) */
  highlight: string;
  /** the same highlight tuned for surfaces filled with --sec-accent (buttons, selected pills) */
  highlightAccent: string;
  /** background-image of the contact-shadow ellipse under a cutout */
  product: string;
  /** `filter:` drop-shadow chain for the cutout itself */
  productFilter: string;
}

/** Colored-shadow base: a deeper, richer version of the block's hue (or the product hue on near-neutral pages). */
function tintedGlowColor(sec: SectionColors, productAccent: Hex): Hex {
  const bg = toOklch(sec.bg);
  const a = toOklch(productAccent);
  const first = bg.c >= 0.06 ? uiColor({ l: 0.42, c: Math.min(0.2, bg.c * 1.2), h: bg.h }) : uiColor({ l: 0.55, c: clamp(a.c, 0.02, 0.18), h: a.h });
  // a crimson glow under a card on a butter block blooms brick: the glow then takes the block's own
  // hue, or dims toward a neutral shadow
  const washes = stepsIn([0.02, 0.6]);
  const clean = (g: Hex) => blendHit(g, sec.bg, BLEND_GUARD, "srgb", washes) === null && blendHit(g, sec.card, BLEND_GUARD, "srgb", washes) === null;
  if (clean(first)) return first;
  const o = toOklch(first);
  const cands = [uiColor({ l: o.l, c: o.c, h: bg.h }), uiColor({ l: o.l, c: o.c * 0.5, h: o.h }), uiColor({ l: o.l, c: Math.min(o.c, 0.02), h: o.h })];
  return cands.find(clean) ?? sec.shadow;
}

function highlightAlpha(surface: Hex, light: number, dark: number): number {
  const lum = luminance(surface);
  if (lum > 0.6) return light;
  if (lum < 0.06) return dark;
  return dark + ((lum - 0.06) / 0.54) * (light - dark) * 0.6;
}

export function sectionDepth(kind: ShadowKind, sec: SectionColors, productAccent: Hex): SectionDepth {
  const c = sec.shadow;
  const dark = sec.scheme === "dark";
  // light falls off faster on dark grounds: shadows need more weight to read at all
  const k = dark ? 2 : 1;
  const glowC = tintedGlowColor(sec, productAccent);
  const layers = (ls: readonly Layer[]) =>
    ls
      .map(([y, blur, spread, alpha, glow]) =>
        `0 ${px(y)} ${px(blur)}${spread ? ` ${px(spread)}` : ""} ${glow ? rgba(glowC, Math.min(0.6, alpha * (dark ? 1.25 : 1))) : rgba(c, Math.min(0.6, alpha * k))}`,
      )
      .join(",");

  const g = sec.accent;
  const gs = GLOW_STRENGTH[kind] * (dark ? 1.15 : 1);
  const shadowGlow = `0 0 0 1px ${rgba(g, 0.16 * gs)},0 6px 18px -6px ${rgba(g, Math.min(0.7, 0.5 * gs))},0 16px 40px -16px ${rgba(g, Math.min(0.6, 0.4 * gs))}`;

  const pk = dark ? 1.6 : 1;
  const product = `radial-gradient(closest-side,${rgba(c, 0.42 * pk)},${rgba(c, 0.16 * pk)} 55%,${rgba(c, 0)})`;
  const productFilter =
    kind === "none"
      ? `drop-shadow(0 12px 18px ${rgba(c, 0.16 * pk)})`
      : kind === "soft"
        ? `drop-shadow(0 2px 3px ${rgba(c, 0.12 * pk)}) drop-shadow(0 18px 24px ${rgba(c, 0.18 * pk)})`
        : kind === "deep"
          ? `drop-shadow(0 3px 4px ${rgba(c, 0.14 * pk)}) drop-shadow(0 32px 36px ${rgba(c, 0.26 * pk)})`
          : `drop-shadow(0 2px 3px ${rgba(c, 0.12 * pk)}) drop-shadow(0 24px 40px ${rgba(glowC, Math.min(0.6, 0.34 * pk))})`;

  const highlight = `inset 0 1px 0 0 ${rgba("#ffffff", highlightAlpha(sec.card, 0.7, 0.07))}`;
  const highlightAccent = `inset 0 1px 0 0 ${rgba("#ffffff", highlightAlpha(sec.accent, 0.45, 0.14))}`;

  if (kind === "none") {
    return { shadowS: NO_SHADOW, shadowM: NO_SHADOW, shadowL: NO_SHADOW, shadowGlow, highlight, highlightAccent, product, productFilter };
  }
  const r = RECIPES[kind];
  return { shadowS: layers(r.s), shadowM: layers(r.m), shadowL: layers(r.l), shadowGlow, highlight, highlightAccent, product, productFilter };
}

/* ------------------------------------------------------------------ */
/* Frosted glass                                                       */
/* ------------------------------------------------------------------ */

export interface SectionGlass {
  /** translucent fill, `rgb(… / a)` */
  fill: string;
  /** the opaque tone of the glass */
  tone: Hex;
  alpha: number;
  /** text on the glass: ≥ 4.5:1 whatever is behind it */
  ink: Hex;
  /** 1px edge */
  border: string;
  /** opaque fallback fill when backdrop-filter is unsupported (ink is AA on it too) */
  solid: Hex;
}

/**
 * Glass of the section's polarity — frosted light glass under dark text, smoked glass under light
 * text — at the archetype's designed opacity, raised step by step until the text clears AA over a
 * pure black AND a pure white backdrop (so a chip floating over any photo stays readable).
 */
export function sectionGlass(sec: SectionColors, def: GlassDef): SectionGlass {
  const bg = toOklch(sec.bg);
  const smoked = luminance(sec.ink) > luminance(sec.bg);
  const tone = smoked
    ? uiColor({ l: clamp(bg.l + 0.05, 0.2, 0.3), c: Math.min(bg.c * 0.7, 0.045), h: bg.h })
    : uiColor({ l: 0.985, c: Math.min(bg.c * 0.22, 0.016), h: bg.h });
  let alpha = roundAlpha(clamp(def.alpha, 0.3, 1));
  let ink = sec.ink;
  for (;;) {
    const behind = [composite(tone, alpha, "#000000"), composite(tone, alpha, "#ffffff"), composite(tone, alpha, sec.bg), tone];
    ink = ensureContrast(sec.ink, behind, GLASS_MIN);
    if (minContrast(ink, behind) >= GLASS_MIN || alpha >= 1) break;
    alpha = roundAlpha(Math.min(1, alpha + 0.02));
  }
  // on near-white pages a white edge disappears: use a faint ink hairline there instead
  const border = smoked ? rgba("#ffffff", 0.14) : bg.l < 0.9 ? rgba("#ffffff", 0.55) : rgba(sec.ink, 0.1);
  return { fill: rgba(tone, alpha), tone, alpha, ink, border, solid: tone };
}

/* ------------------------------------------------------------------ */
/* Product stage tint                                                  */
/* ------------------------------------------------------------------ */

export interface SectionStage {
  /** --mx-stage: the surface a product stands on (slab, disc, arch, framed cutout) */
  stage: Hex;
  /** --mx-stage-hi: where the key light lands (top of the sweep, centre of a disc) */
  hi: Hex;
  /** --mx-stage-lo: the floor end of the sweep */
  lo: Hex;
}

/** A stage reads as its own lit surface on the block, never as a smudge. */
const STAGE_MIN_DE = 0.035;
/** Captions and chips can sit on a stage: the block's ink keeps AA on every tone (final hex: the rendered ratio). */
const STAGE_TEXT_MIN = 4.5;
/** Chroma from which a block is a color block: its stage lights up in its own hue (tone on tone). */
const OWN_HUE_C = 0.08;
/** Chroma from which a block below the pale range is visibly colored (sage, forest, burgundy …). */
const TINTED_C = 0.03;
/** Lightness from which a light block is pale: its stage is the nearest distinct tint (a-100, a-200 …). */
const PALE_L = 0.86;
/**
 * Chroma ceilings of a stage on a neutral or tinted ground (highlight, stage, floor): the light end of
 * a light, vivid accent's ramp (lime, lemon, aqua) is still neon; a stage is a tinted surface, not a
 * second accent block. Color blocks keep their own chroma (tone on tone).
 */
const STAGE_C_MAX = { hi: 0.055, stage: 0.09, lo: 0.12 } as const;

/**
 * Stage tint for a block — always ONE clean hue, never an OKLab mix of the action color into the
 * block (complements like rose on aqua, or navy on cream, meet in gray mud):
 *  - pale grounds (near white, tinted, pastel): the product accent's light ramp (--lp-a-100 →
 *    a-200 …, chroma-capped so a neon accent still gives a tinted surface), the first step that
 *    clearly separates from the ground;
 *  - color blocks keep their own hue, tone on tone: a lit window one step lighter under dark text, a
 *    deeper well under light text (which only adds contrast);
 *  - near-black blocks: a dim stage light of the product hue, lifted off the ground;
 *  - a near-neutral product (black, white, steel) borrows the block's own tint instead of gray.
 * The highlight end is the next lighter tone, the floor end the next deeper one.
 */
export function sectionStage(sec: SectionColors, productAccent: Hex): SectionStage {
  const bg = toOklch(sec.bg);
  const A = toOklch(productAccent);
  const neutralProduct = A.c < 0.03;
  const readable = (c: Hex) => contrast(sec.ink, c) >= STAGE_TEXT_MIN;
  const inkLight = luminance(sec.ink) > luminance(sec.bg);

  if (!inkLight) {
    // a light block is a color block when it is saturated, or visibly colored below the pale range
    const own = bg.c >= OWN_HUE_C || (bg.l < PALE_L && bg.c >= TINTED_C);
    const source = own ? sec.bg : neutralProduct ? uiColor({ l: 0.88, c: clamp(bg.c * 1.4, 0.008, 0.035), h: bg.h }) : productAccent;
    const ramp = colorScale(source);
    const L = (s: ScaleStep) => toOklch(ramp[s]).l;
    // pale grounds: the first clearly distinct tint (a tinted panel, a-100 → a-200 …); deeper
    // grounds: the closest lighter step (a lit window), then deeper ones
    const order: ScaleStep[] =
      bg.l >= PALE_L
        ? [100, 200, 300, 400, 500]
        : [...SCALE_STEPS.filter((s) => L(s) > bg.l).reverse(), ...SCALE_STEPS.filter((s) => L(s) <= bg.l)];
    const tame = (hex: Hex, max: number): Hex => {
      if (own) return hex;
      const o = toOklch(hex);
      return o.c > max ? uiColor({ l: o.l, c: max, h: o.h }) : hex;
    };
    for (const s of order) {
      const stage = tame(ramp[s], STAGE_C_MAX.stage);
      if (deltaE(stage, sec.bg) < STAGE_MIN_DE || !readable(stage)) continue;
      const i = SCALE_STEPS.indexOf(s);
      const up = tame(i > 0 ? ramp[SCALE_STEPS[i - 1]!] : mix(stage, "#ffffff", 0.45), STAGE_C_MAX.hi);
      const down = tame(i < SCALE_STEPS.length - 1 ? ramp[SCALE_STEPS[i + 1]!] : stage, STAGE_C_MAX.lo);
      return { stage, hi: readable(up) ? up : stage, lo: readable(down) ? down : stage };
    }
    return { stage: sec.card, hi: sec.card, lo: sec.card };
  }

  const pick = (cands: readonly Hex[], fallback: Hex): Hex => cands.find(readable) ?? fallback;

  if (bg.l < 0.42) {
    // near-black / deep blocks: a dim stage light of the product hue (of the block's own hue when it
    // is a saturated color block), lifted off the ground — light reads as lightness down here, so the
    // chroma stays moderate (a deep dye would read as a stain)
    const own = bg.c >= OWN_HUE_C || (neutralProduct && bg.c >= 0.02);
    const hue = own ? bg.h : A.h;
    // never grayer than a block of the same hue (a velvet navy block keeps a navy stage)
    const kin = bg.c >= TINTED_C && hueDistance(bg.h, hue) <= 40;
    const c = own ? Math.min(bg.c, 0.09) : neutralProduct ? Math.min(bg.c, 0.03) : Math.max(clamp(A.c * 0.4, 0.02, 0.065), kin ? Math.min(bg.c, 0.09) : 0);
    const tone = (l: number, k: number): Hex => uiColor({ l: clamp(l, 0, 1), c: c * k, h: hue });
    // measured from a floor of L 0.12: on pure black a small step has no room for any hue
    const base = Math.max(bg.l, 0.12);
    for (let lift = 1; ; lift *= 0.8) {
      const stage = tone(base + 0.08 * lift, 1);
      const hi = tone(base + 0.15 * lift, 1.1);
      const lo = tone(base + 0.03 * lift, 0.75);
      if ((readable(stage) && readable(hi) && readable(lo)) || lift < 0.3) {
        return { stage: pick([stage], sec.bg), hi: pick([hi, stage], sec.bg), lo: pick([lo], sec.bg) };
      }
    }
  }

  // mid-tone blocks under light text (a rose, cobalt or forest color block): a deeper well of the
  // block's own hue; a gray mid-tone block takes the product hue at a quiet chroma
  const own = bg.c >= TINTED_C;
  const hue = own ? bg.h : A.h;
  const c = own ? bg.c : neutralProduct ? bg.c : clamp(A.c * 0.5, 0.02, 0.1);
  const tone = (l: number, k: number): Hex => uiColor({ l: clamp(l, 0, 1), c: c * k, h: hue });
  const stage = pick([tone(bg.l - 0.055, 1), tone(bg.l - 0.08, 1)], sec.bg);
  const lo = pick([tone(bg.l - 0.11, 0.95)], stage);
  const hi = pick([tone(bg.l + 0.03, 0.95), tone(bg.l + 0.015, 0.95), tone(bg.l - 0.02, 1)], stage);
  return { stage, hi, lo };
}

/* ------------------------------------------------------------------ */
/* Aurora light                                                        */
/* ------------------------------------------------------------------ */

export interface AuroraHue {
  h: number;
  c: number;
}

/** Indigo/violet band — only ever used when the product itself lives there. */
const isViolet = (h: number) => h >= 262 && h <= 318;

/**
 * Three light hues from the product: the accent, the pop, and an analogous neighbour of the accent
 * leaning toward the pop. The neighbour never drifts into indigo/violet unless the product is there.
 */
export function auroraHues(accent: Hex, pop: Hex, neutralHue: number): readonly [AuroraHue, AuroraHue, AuroraHue] {
  const A = toOklch(accent);
  const P = toOklch(pop);
  const aColored = A.c >= 0.03;
  const pColored = P.c >= 0.03;
  const h1 = aColored ? A.h : pColored ? P.h : neutralHue;
  const c1 = aColored ? A.c : pColored ? P.c * 0.6 : 0.025;
  const h2 = pColored ? P.h : normHue(h1 + 40);
  const c2 = pColored ? P.c : c1 * 0.8;
  const toward = pColored && hueDistance(h1, h2) > 4 ? (normHue(h2 - h1) <= 180 ? 1 : -1) : 1;
  const productViolet = (aColored && isViolet(h1)) || (pColored && isViolet(h2));
  // the analogous neighbour leans toward the pop, else away from it; never into violet (unless the
  // product lives there) and never onto orange (crimson + 32° or gold − 32° would) — then it stays
  // on the accent's own hue
  const c3Of = (h: number) => (isViolet(h) && !productViolet ? Math.min(0.03, c1) : c1 * 0.85);
  const fine = (h: number) => !(isViolet(h) && !productViolet) && !nearOrange({ l: 0.7, c: c3Of(h), h });
  const h3 = [normHue(h1 + 32 * toward), normHue(h1 - 32 * toward)].find(fine) ?? h1;
  const c3 = c3Of(h3);
  return [
    { h: h1, c: c1 },
    { h: h2, c: c2 },
    { h: h3, c: c3 },
  ];
}

export interface SectionAurora {
  /** --lp-aurora-1/2/3: `rgb(… / a)` lights (accent, pop, analogous) */
  lights: readonly [string, string, string];
  /** --lp-aurora: ready-made background-image (three soft radial lights) */
  field: string;
  /** --lp-stage-glow: product-tinted ambient glow for behind a cutout (use on the plain section, not over --lp-aurora) */
  stage: string;
}

/**
 * Light color for a block. Where there is room the light moves AWAY from the ink (a luminous glow on
 * tinted grounds, a deeper bloom on mid-tone blocks with light text), which only adds contrast; on
 * near-white pages it is a pale pastel and on near-black ones a dim colored glow, both kept low.
 * On saturated color blocks the lights lean toward the block's own hue (tone-on-tone light reads
 * richer there, and keeps luminance steady across the soft edges); a far hue that would bloom darker
 * on a colored mid-tone block takes the block's own hue outright.
 */
function lightTone(sec: SectionColors, hue: AuroraHue): Hex {
  const bg = toOklch(sec.bg);
  const inkLight = luminance(sec.ink) > luminance(sec.bg);
  // a deeper bloom in a far hue on a colored block under light text reads as a stain (crimson
  // light on a forest-green block turns brown): those blocks bloom in their own hue
  const stain = inkLight && bg.l >= 0.4 && bg.c >= 0.03 && hueDistance(bg.h, hue.h) > 60;
  // leaning toward the block's hue must not pass through orange (a crimson block under a gold light)
  const lean = lerpHue(bg.h, hue.h, 0.35);
  const h = stain ? bg.h : bg.c >= 0.08 ? (nearOrange({ l: 0.6, c: 0.1, h: lean }) ? bg.h : lean) : hue.h;
  let l: number;
  let c: number;
  if (!inkLight) {
    if (bg.l <= 0.9) {
      l = Math.min(0.975, bg.l + 0.06);
      c = clamp(hue.c * 0.5, 0.025, 0.09);
    } else {
      l = clamp(bg.l - 0.035, 0.86, 0.95);
      c = clamp(hue.c * 0.55, 0.03, 0.1);
    }
  } else if (bg.l >= 0.4) {
    l = bg.l - 0.07;
    c = clamp(hue.c, 0.04, 0.16);
  } else {
    l = clamp(bg.l + 0.1, 0.22, 0.36);
    c = clamp(hue.c * 0.9, 0.04, 0.14);
  }
  return uiColor({ l, c, h });
}

/* ---- the field as rendered ------------------------------------------- */

/** Color hint of each light (38%): CSS interpolation progress p = t^(ln 0.5 / ln 0.38) — a soft falloff. */
const HINT = 0.38;
const HINT_EXP = Math.log(0.5) / Math.log(HINT);

/** One radial light: center and radii in % of the section box (x already mirrored for RTL). */
export interface AuroraSpot {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface AuroraGeometry {
  spots: readonly [AuroraSpot, AuroraSpot, AuroraSpot];
  /** relative strength of each light over a lattice of the box (+ each light alone, fading out) */
  probes: readonly (readonly [number, number, number])[];
}

/** Relative opacity (0..1) of a light at a point of the box (both in % units). */
export function lightCoverage(s: AuroraSpot, x: number, y: number): number {
  const t = Math.hypot((x - s.x) / s.w, (y - s.y) / s.h);
  return t >= 1 ? 0 : 1 - t ** HINT_EXP;
}

/** Lattice resolution of the contrast solver (scripts/check-theme.ts re-samples at 41×41). */
const LATTICE = 17;

/**
 * Seeded composition shared by every section of a page: one light high on the start side, one on the
 * end side, one low and wide. Probes cover the whole box: WCAG luminance is not monotonic along a
 * hue-shifted blend, so a half-covered point can be darker than both the light and the ground — the
 * solver must look everywhere, not just where the lights are strongest.
 */
export function auroraGeometry(seed: number, rtl: boolean): AuroraGeometry {
  const rng = rngFor(seed, "aurora");
  const mx = (v: number) => (rtl ? 100 - v : v);
  const spots = [
    { x: mx(range(rng, 8, 30)), y: range(rng, 8, 30), w: range(rng, 52, 70), h: range(rng, 48, 64) },
    { x: mx(range(rng, 70, 92)), y: range(rng, 14, 42), w: range(rng, 42, 60), h: range(rng, 40, 58) },
    { x: mx(range(rng, 34, 66)), y: range(rng, 76, 96), w: range(rng, 60, 82), h: range(rng, 42, 58) },
  ] as const;
  const at = (x: number, y: number) => [lightCoverage(spots[0], x, y), lightCoverage(spots[1], x, y), lightCoverage(spots[2], x, y)] as const;
  const probes: (readonly [number, number, number])[] = [];
  // each light alone, fading out (also covers --lp-stage-glow, which is light 1 on the plain section)
  for (const k of [1, 0.8, 0.6, 0.45, 0.3, 0.15]) probes.push([k, 0, 0], [0, k, 0], [0, 0, k]);
  for (const s of spots) probes.push(at(s.x, s.y));
  for (let i = 0; i < LATTICE; i++) {
    for (let j = 0; j < LATTICE; j++) {
      const w = at((i * 100) / (LATTICE - 1), (j * 100) / (LATTICE - 1));
      if (w[0] + w[1] + w[2] > 0) probes.push(w);
    }
  }
  return { spots, probes };
}

/* fast numeric path for the solver: 8-bit channels + a linearization table (same math as color.ts) */
const LIN = Array.from({ length: 256 }, (_, i) => {
  const v = i / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
});
const rgb8 = (hex: Hex): readonly [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const ratio = (x: number, y: number) => (x > y ? (x + 0.05) / (y + 0.05) : (y + 0.05) / (x + 0.05));

/**
 * Worst contrast of each of `fgs` against the field at `alpha` (lights composited bottom-most first,
 * exactly like composite(): alpha rounded to 3 decimals, 8-bit result).
 */
function worstOnField(bg: Hex, tones: readonly Hex[], alpha: number, geo: AuroraGeometry, fgs: readonly Hex[]): number[] {
  const base = rgb8(bg);
  const lights = tones.map(rgb8);
  const fgLum = fgs.map(luminance);
  const worst = fgs.map(() => Infinity);
  for (const w of geo.probes) {
    let r = base[0];
    let g = base[1];
    let b = base[2];
    for (let i = lights.length - 1; i >= 0; i--) {
      if (w[i]! <= 0) continue;
      const a = roundAlpha(alpha * w[i]!);
      const L = lights[i]!;
      r = Math.round(L[0] * a + r * (1 - a));
      g = Math.round(L[1] * a + g * (1 - a));
      b = Math.round(L[2] * a + b * (1 - a));
    }
    const y = 0.2126 * LIN[r]! + 0.7152 * LIN[g]! + 0.0722 * LIN[b]!;
    for (let k = 0; k < fgs.length; k++) worst[k] = Math.min(worst[k]!, ratio(fgLum[k]!, y));
  }
  return worst;
}

/** Strongest alpha a light ever gets (sectionAurora caps the field at 0.55). */
const LIGHT_MAX_ALPHA = 0.55;

/**
 * Lights whose glow over the block, over its cards, or over another light would pass through brick
 * or amber (a tan pop light on a crimson block, a crimson light over a sand one) are re-toned: first
 * the block's own hue (tone-on-tone light), then half the chroma, then a near-neutral glow.
 */
function cleanLights(sec: SectionColors, tones: readonly Hex[]): Hex[] {
  const out = [...tones];
  const washes = stepsIn([0.02, LIGHT_MAX_ALPHA]);
  const bad = (t: Hex, i: number) =>
    blendHit(t, sec.bg, BLEND_GUARD, "srgb", washes) !== null ||
    blendHit(t, sec.card, BLEND_GUARD, "srgb", washes) !== null ||
    out.some(
      (o, j) => j !== i && o !== t && (stackHit(t, LIGHT_MAX_ALPHA, o, LIGHT_MAX_ALPHA, sec.bg) !== null || stackHit(o, LIGHT_MAX_ALPHA, t, LIGHT_MAX_ALPHA, sec.bg) !== null),
    );
  const bg = toOklch(sec.bg);
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < out.length; i++) {
      if (!bad(out[i]!, i)) continue;
      const o = toOklch(out[i]!);
      const cands = [
        ...(bg.c >= 0.03 ? [uiColor({ l: o.l, c: o.c, h: bg.h })] : []),
        uiColor({ l: o.l, c: o.c * 0.5, h: o.h }),
        uiColor({ l: o.l, c: Math.min(o.c, 0.03), h: bg.c >= 0.03 ? bg.h : o.h }),
        uiColor({ l: o.l, c: Math.min(o.c, 0.012), h: o.h }),
      ];
      out[i] = cands.find((c) => !bad(c, i)) ?? cands[cands.length - 1]!;
    }
  }
  return out;
}

export function sectionAurora(sec: SectionColors, hues: readonly [AuroraHue, AuroraHue, AuroraHue], geo: AuroraGeometry): SectionAurora {
  const tones = cleanLights(
    sec,
    hues.map((h) => lightTone(sec, h)),
  );
  // targets keep a hair of margin, but never ask more than the plain block already gives (the palette
  // guarantees that plain block ≥ 4.5 / ≥ 3), so a light that only adds contrast is always allowed
  const textMin = (fg: Hex) => Math.min(AURORA_TEXT_MIN, contrast(fg, sec.bg));
  const inkMin = textMin(sec.ink);
  const inkSoftMin = textMin(sec.inkSoft);
  const accentMin = Math.min(AURORA_ACCENT_MIN, contrast(sec.accent, sec.bg));
  const ok = (a: number) => {
    const [ink, inkSoft, accent] = worstOnField(sec.bg, tones, a, geo, [sec.ink, sec.inkSoft, sec.accent]);
    return ink! >= inkMin && inkSoft! >= inkSoftMin && accent! >= accentMin;
  };
  // subtle by design (≤ 0.55); lowered just enough that text and buttons keep their contrast everywhere
  const max = luminance(sec.ink) > luminance(sec.bg) ? 0.5 : 0.55;
  let a = max;
  if (!ok(max)) {
    let lo = 0;
    let hi = max;
    for (let i = 0; i < 10; i++) {
      const mid = (lo + hi) / 2;
      if (ok(mid)) lo = mid;
      else hi = mid;
    }
    a = Math.floor(lo * 1000) / 1000;
  }
  const lights = [rgba(tones[0]!, a), rgba(tones[1]!, a), rgba(tones[2]!, a)] as const;
  const clear = tones.map((t) => rgba(t, 0));
  const field = geo.spots
    .map((s, i) => `radial-gradient(${num(s.w)}% ${num(s.h)}% at ${num(s.x)}% ${num(s.y)}%,${lights[i]},${HINT * 100}%,${clear[i]})`)
    .join(",");
  const stage = `radial-gradient(closest-side,${lights[0]},${rgba(tones[0]!, a * 0.45)} 50%,${clear[0]})`;
  return { lights, field, stage };
}

/**
 * The stage glow of a section without the aurora field (core D60 rev 3, V40): --lp-aurora and --lp-aurora-1..3 are
 * no longer emitted, but a document without `look` keeps today's --lp-stage-glow, which is the first light of the
 * section's solved field (the same tones, the same contrast-safe alpha).
 */
export function sectionStageGlow(sec: SectionColors, hues: readonly [AuroraHue, AuroraHue, AuroraHue], geo: AuroraGeometry): string {
  return sectionAurora(sec, hues, geo).stage;
}

/* ------------------------------------------------------------------ */
/* Depth recipes (design.md DES-§4.10.1; G15 × base, DS48)             */
/* ------------------------------------------------------------------ */

/** The ground tiers the recipes key on: light (L ≥ 0.8), tinted (0.5 ≤ L < 0.8), dark (L < 0.5). */
export type GroundTier = "light" | "tinted" | "dark";
export const groundTier = (bg: Hex): GroundTier => {
  const l = toOklch(bg).l;
  return l >= 0.8 ? "light" : l >= 0.5 ? "tinted" : "dark";
};

/** The archetypes whose `directional` depth is a drawn offset plate (DES-§4.10.1); the others cast an angled shadow. */
const PLATE_ARCHETYPES = ["circuit", "kinetic", "garage", "playground"];

export interface LookDepth {
  /** --lp-shadow-card */
  shadowCard: string;
  /** --lp-shadow-float: sticky bar, float, popover */
  shadowFloat: string;
  /** --lp-line: the recipe's hairline, or null where the recipe draws none (the palette's line stays) */
  line: string | null;
  /** --lp-highlight: the 1 px inner top highlight, composable (NO_SHADOW when none) */
  highlight: string;
  /** --lp-ring: the focus ring, ≥ 3:1 on the ground and the card */
  ring: Hex;
}

/** A translucent colour whose wash over the block or its card stays out of the orange band, else the block's shadow tone. */
function cleanWashColor(color: Hex, sec: SectionColors, alpha: number): Hex {
  const washes = stepsIn([0.02, Math.min(0.98, Math.max(0.03, alpha))]);
  const clean = (c: Hex) => blendHit(c, sec.bg, BLEND_GUARD, "srgb", washes) === null && blendHit(c, sec.card, BLEND_GUARD, "srgb", washes) === null;
  if (clean(color)) return color;
  if (clean(sec.shadow)) return sec.shadow;
  const o = toOklch(sec.shadow);
  return uiColor({ l: o.l, c: Math.min(o.c, 0.01), h: o.h });
}

/**
 * The five depth recipes (G15) on a section (DES-§4.10.1). Shadow colours are the block's shadow tone tinted toward
 * the accent (85 / 15), so a shadow never reads grey on a tinted ground and never blooms orange (every wash is checked
 * against the block and its card, else the plain shadow tone is used). Every value is composable and built from
 * computed colours and numbers only.
 */
export function lookDepth(depth: "flat" | "hairline" | "tonal" | "ambient" | "directional", sec: SectionColors, archetype: string): LookDepth {
  const tier = groundTier(sec.bg);
  const sh = cleanWashColor(mix(sec.shadow, sec.accent, 0.15), sec, 0.45);
  const plain = cleanWashColor(sec.shadow, sec, 0.32);
  const floatFlat = `0 8px 24px -12px ${rgba(plain, 0.18)}`;
  const hair = (a: number) => rgba(cleanWashColor(sec.ink, sec, a), a);
  const ring = ensureContrast(sec.accent, [sec.bg, sec.card], 3);
  const top = (a: number) => `inset 0 1px 0 0 ${rgba("#ffffff", a)}`;
  switch (depth) {
    case "flat":
      return { shadowCard: NO_SHADOW, shadowFloat: floatFlat, line: null, highlight: NO_SHADOW, ring };
    case "hairline":
      return { shadowCard: NO_SHADOW, shadowFloat: floatFlat, line: hair(tier === "light" ? 0.09 : tier === "tinted" ? 0.14 : 0.18), highlight: tier === "dark" ? top(0.35) : NO_SHADOW, ring };
    case "tonal":
      return { shadowCard: NO_SHADOW, shadowFloat: floatFlat, line: hair(0.06), highlight: NO_SHADOW, ring };
    case "ambient": {
      const [a1, a2] = tier === "light" ? [0.06, 0.14] : tier === "tinted" ? [0.08, 0.18] : [0.28, 0.4];
      return {
        shadowCard: `0 1px 2px ${rgba(sh, a1)},0 12px 32px -16px ${rgba(sh, a2)}`,
        shadowFloat: `0 16px 48px -20px ${rgba(sh, 0.32)}`,
        line: tier === "light" ? hair(0.06) : null,
        highlight: tier === "dark" ? top(0.45) : NO_SHADOW,
        ring,
      };
    }
    case "directional": {
      const plate = PLATE_ARCHETYPES.includes(archetype);
      const angled = `0 10px 28px -12px ${rgba(plain, 0.24)}`;
      const acc = cleanWashColor(sec.accent, sec, 0.22);
      return {
        shadowCard: plate ? `0 8px 0 -2px ${rgba(acc, 0.22)}` : angled,
        // plate shadows never on floating layers
        shadowFloat: `0 14px 40px -18px ${rgba(plain, 0.3)}`,
        line: hair(0.12),
        highlight: NO_SHADOW,
        ring,
      };
    }
  }
}

/* ------------------------------------------------------------------ */
/* Stage presets (design.md DES-§4.11.1; DS48)                         */
/* ------------------------------------------------------------------ */

export interface LookStage {
  /** --lp-stage-glow: the product-tinted radial (≤ 0.10 alpha, the core D60 ceiling) */
  glow: string;
  /** --lp-stage-glow-2: the tighter second radial */
  glow2: string;
  /** --lp-stage-contact: the contact-shadow colour */
  contact: string;
  /** --lp-stage-plinth: the plinth slab */
  plinth: Hex;
  /** --lp-stage-plinth-line: its top hairline */
  plinthLine: Hex;
}

/**
 * The colours of the three stage presets on a section (DES-§4.11.1). `dominant` is the product's colour (the
 * palette accent, which the vibe engine draws from the photo). Geometry belongs to the hero CSS (the preset's
 * bbox-relative sizes); these tokens carry colour and alpha only.
 */
export function lookStage(sec: SectionColors, dominant: Hex): LookStage {
  const tier = groundTier(sec.bg);
  const glowC = cleanWashColor(mix(dominant, sec.bg, 0.3), sec, 0.1);
  const a = tier === "light" ? 0.074 : tier === "tinted" ? 0.058 : 0.1;
  const glow = `radial-gradient(closest-side,${rgba(glowC, a)},${rgba(glowC, 0)})`;
  const glow2 = `radial-gradient(closest-side,${rgba(glowC, 0.032)},${rgba(glowC, 0)} 50%)`;
  const contactC = cleanWashColor(mix(sec.shadow, dominant, 0.2), sec, 0.45);
  const contact = rgba(contactC, tier === "light" ? 0.22 : tier === "tinted" ? 0.26 : 0.45);
  const g = toOklch(sec.bg);
  const plinth = tier === "dark" ? uiColor({ l: clamp(g.l + 0.06, 0, 1), c: g.c, h: g.h }) : mix(sec.bg, dominant, 0.12);
  return { glow, glow2, contact, plinth, plinthLine: sec.line };
}

/**
 * The `blob` mask (DES-§4.11.1): a 6-point closed spline on a unit circle, radii r_i ∈ [0.82, 1.0] from
 * `rng("mask:blob")`, tangents at ±0.55 of the chord, as a CSS `polygon()` in percentages of the media box (48 points,
 * so it scales with the slot and needs no SVG `clipPath`). RTL mirrors it in CSS (`scale(-1, 1)`).
 */
export function blobPolygon(seed: number): string {
  const rng = rngFor(seed, "mask:blob");
  const n = 6;
  const pts = Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2 - Math.PI / 2;
    const r = range(rng, 0.82, 1);
    return [Math.cos(t) * r, Math.sin(t) * r] as const;
  });
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n]!;
    const p1 = pts[i]!;
    const p2 = pts[(i + 1) % n]!;
    const p3 = pts[(i + 2) % n]!;
    // Catmull-Rom tangents scaled to 0.55 of the chord: a smooth, closed cubic through the six points
    const k = 0.55 / 2;
    const c1 = [p1[0] + (p2[0] - p0[0]) * k, p1[1] + (p2[1] - p0[1]) * k];
    const c2 = [p2[0] - (p3[0] - p1[0]) * k, p2[1] - (p3[1] - p1[1]) * k];
    for (let s = 0; s < 8; s++) {
      const t = s / 8;
      const u = 1 - t;
      const x = u * u * u * p1[0] + 3 * u * u * t * c1[0]! + 3 * u * t * t * c2[0]! + t * t * t * p2[0];
      const y = u * u * u * p1[1] + 3 * u * u * t * c1[1]! + 3 * u * t * t * c2[1]! + t * t * t * p2[1];
      out.push(`${num(50 + x * 50)}% ${num(50 + y * 50)}%`);
    }
  }
  return `polygon(${out.join(",")})`;
}
