/**
 * ThemeSpec + locale → CSS custom properties (docs/DESIGN.md §2) + [data-bg] section maps + <html>
 * attributes (§2.5). Every interpolated value is a validated enum, a computed "#rrggbb", a number, or a
 * constant from this module / the font manifest — no user text ever reaches the CSS.
 *
 * Two paths (design.md DES-§4.5.2, DES-§4.5.3, DS4):
 *  - a document without `theme.look` keeps today's tokens and attributes, except the owner-rule fixes that apply to
 *    every page at its next render: no bounce outside `playground` (DS28: `SPRINGS.soft` ζ 0.86, `--lp-ease-pop` is
 *    the bouncy spring on `playground` only), no grain (`data-texture="none"`, no `--lp-grain*`) and no aurora
 *    custom property (`--lp-aurora*`; core D60 rev 3, V40);
 *  - with `look` (the compiled design genome), and only then, the look replaces the archetype locks (button, card,
 *    mask, glyph, emphasis, density, radius kind), adds the look attributes and emits the look tokens: the four-tier
 *    radius ladder (the legacy `--lp-radius-*` scale re-derived from it), grid, the typography engine's type tokens
 *    (src/lib/design/typography.ts), section spacing, the motion family, the depth recipes and the stage presets.
 *    Precedence: an explicit non-"archetype" builder value (`radius`, `shadow`, `surfaces`) > `look` > the archetype.
 *    Texture is never an override any more.
 */
import { dirOf, Locale, SECTION_BGS, ThemeSpec, type Divider, type SectionBg, type ThemeLook } from "@/lib/page/schema";
import { typeTokens } from "@/lib/design/typography";
import {
  ARCHETYPE_DEFS,
  EASE,
  findPairing,
  SPRINGS,
  type ArchetypeDef,
  type CardStyle,
  type FontPairing,
  type RadiusDef,
  type RadiusKind,
  type ShadowKind,
  type SpringKind,
  type SurfacesKind,
} from "./archetypes";
import { auroraGeometry, auroraHues, blobPolygon, lookDepth, lookStage, sectionDepth, sectionGlass, sectionStage, sectionStageGlow } from "./depth";
import { accentRole, arabicLineHeights, fontData, fontStack, hasItalic, isKnownFont, nearestWeight } from "./fonts";
import { buildPalette, type Palette, type SectionColors } from "./palette";
import { renderedTexture } from "./textures";
import type { BuiltTheme } from "./types";

/* ------------------------------------------------------------------ */
/* Presets for spec overrides                                          */
/* ------------------------------------------------------------------ */

/**
 * A call to action is never a square slab (the owner's "red rectangle CTAs"): button corners are at
 * least 12px, about a quarter of the button's height, in every archetype and preset — "none" keeps
 * crisp cards and media but not a boxy CTA. 999 = pill.
 */
const BTN_RADIUS_MIN_PX = 12;
/** Backdrop saturation of frosted glass: beyond 1.3 a cream or blush page behind a chip turns peach. */
const GLASS_SATURATE_MAX = 1.3;

/** Admin radius overrides — generous, continuous scales (l/xl/media/panel shrink fluidly on phones). */
const RADIUS_PRESETS: Record<RadiusKind, RadiusDef> = {
  none: { kind: "none", scale: [0, 0, 0, 0, 0], btn: BTN_RADIUS_MIN_PX, media: 0, panel: 0 },
  subtle: { kind: "subtle", scale: [4, 6, 10, 14, 18], btn: BTN_RADIUS_MIN_PX, media: 16, panel: 24 },
  soft: { kind: "soft", scale: [8, 12, 16, 22, 28], btn: 14, media: 24, panel: 32 },
  round: { kind: "round", scale: [12, 18, 24, 32, 40], btn: 999, media: 32, panel: 44 },
};

/** Damped-spring easing sampled into CSS linear() (normalized so it settles exactly at 1). */
function springEasing(kind: SpringKind): string {
  const z = SPRINGS[kind];
  const settle = z >= 1 ? 8.5 : -Math.log(0.003) / z;
  const wd = z < 1 ? Math.sqrt(1 - z * z) : 0;
  const x = (t: number) =>
    z >= 1 ? 1 - Math.exp(-t) * (1 + t) : 1 - Math.exp(-z * t) * (Math.cos(wd * t) + (z / wd) * Math.sin(wd * t));
  const n = z >= 1 ? 20 : 40;
  const pts: string[] = [];
  for (let i = 0; i <= n; i++) pts.push(i === n ? "1" : num(x((i / n) * settle), 3));
  return `linear(${pts.join(",")})`;
}

export const SPRING_EASINGS: Readonly<Record<SpringKind, string>> = {
  gentle: springEasing("gentle"),
  soft: springEasing("soft"),
  bouncy: springEasing("bouncy"),
};

/* ------------------------------------------------------------------ */
/* The look vocabulary as tokens (design.md DES-§4.5.3, DES-§4.12)     */
/* ------------------------------------------------------------------ */

/** The G12 radius ladders, chip / control / card / media in px (999 = pill; mixed media 0 = the `rect` / `cut` mask). */
export const LADDER_PX: Readonly<Record<ThemeLook["ladder"], readonly [number, number, number, number]>> = {
  crisp: [2, 4, 6, 8],
  soft: [6, 10, 16, 24],
  round: [999, 14, 24, 32],
  mixed: [4, 8, 12, 0],
};
/** The legacy radius kind nearest each ladder (`data-radius`, so old selectors keep working). */
const LADDER_KIND: Readonly<Record<ThemeLook["ladder"], RadiusKind>> = { crisp: "subtle", soft: "soft", round: "round", mixed: "subtle" };
/** `data-card` from the G15 depth (DES-§4.5.2); `glass` is a per-variant choice inside the glass budget, never the page's. */
const CARD_OF_DEPTH: Readonly<Record<ThemeLook["depth"], CardStyle>> = { flat: "flat", hairline: "outlined", tonal: "soft", ambient: "raised", directional: "raised" };

/** The G23 easing families (DES-§4.12): `critical` is the ζ 1 spring, `soft-spring` the ζ 0.86 one (playground only). */
export const EASE_FAMILY_CURVES: Readonly<Record<ThemeLook["mo"]["f"], string>> = {
  expo: EASE.expoOut,
  quint: EASE.quintOut,
  quart: EASE.quartOut,
  critical: SPRING_EASINGS.gentle,
  "soft-spring": SPRING_EASINGS.soft,
  mask: EASE.editorial,
};
/** Duration scale of the three motion tokens (× G23.d), clamped 160-1000 ms (DES-§4.5.3). */
const DUR_SCALE = [0.45, 0.8, 1.15] as const;
const DUR_MIN = 160;
const DUR_MAX = 1000;

/** Section spacing per density (rem / rem + vw / rem), × G21 with `look`. */
const SPACE_NUM: Readonly<Record<ArchetypeDef["density"], readonly [number, number, number, number]>> = {
  airy: [5, 3.1, 8, 10],
  balanced: [4.25, 2.8, 6.2, 8],
  dense: [3.5, 2.4, 4.8, 6.5],
};
/** G3 margins as gutters: narrow 16 → 24 px, wide and offset 20 → 64 px (phones keep a 20 px floor; offset layouts are drawn by the sections). */
const GUTTER: Readonly<Record<ThemeLook["grid"]["m"], readonly [number, number]>> = { narrow: [16, 24], wide: [20, 64], offset: [20, 64] };
/** G3 splits in fr units (golden = 0.382 / 0.618). */
const SPLIT: Readonly<Record<ThemeLook["grid"]["s"], readonly [number, number]>> = { "1:1": [1, 1], "5:7": [5, 7], "4:8": [4, 8], "3:9": [3, 9], golden: [0.382, 0.618] };

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function num(v: number, digits = 4): string {
  const s = v.toFixed(digits).replace(/0+$/, "").replace(/\.$/, "");
  return s === "-0" ? "0" : s;
}
/** Always a <length> ("0px", never a bare 0): radius and spacing tokens feed max(), min() and calc(). */
const px = (v: number) => `${num(v, 2)}px`;
const rem = (pxv: number) => `${num(pxv / 16)}rem`;
const ms = (v: number) => `${Math.round(v)}ms`;

const V_MIN = 360;
const V_MAX = 1280;

/** clamp() that grows linearly from `lo` px at 360px to `hi` px at 1280px viewports. */
function fluidPx(lo: number, hi: number): string {
  if (lo === hi) return px(hi);
  const slope = (hi - lo) / (V_MAX - V_MIN);
  const intercept = lo - slope * V_MIN;
  return `clamp(${px(lo)},${px(intercept)} + ${num(slope * 100, 3)}vw,${px(hi)})`;
}

/** Large radii relax on phones (a 40px corner on a 340px card reads bubbly): 75% at 360px. */
const fluidRadius = (v: number) => (v >= 16 && v < 999 ? fluidPx(Math.round(v * 0.75), v) : px(v));

/** Fluid type scale steps −1…6 between 360px and 1280px viewports. */
function typeScale(ratio: readonly [number, number]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = -1; i <= 6; i++) {
    const a = 16 * ratio[0] ** i;
    const b = 18 * ratio[1] ** i;
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const slope = (b - a) / (V_MAX - V_MIN);
    const intercept = a - slope * V_MIN;
    const vw = slope * 100;
    out[`lp-step-${i}`] = `clamp(${rem(lo)},${rem(intercept)} ${vw < 0 ? "-" : "+"} ${num(Math.abs(vw))}vw,${rem(hi)})`;
  }
  return out;
}

const spaceOf = (density: ArchetypeDef["density"], k = 1, grid = false) => {
  const [a, b, c, d] = SPACE_NUM[density];
  // a look snaps the bounds to its 4 px grid (V04: every spacing token is a multiple of the grid unit)
  const snap = (rem: number) => (grid ? Math.round(rem * 4) / 4 : rem);
  return `clamp(${num(snap(a * k), 3)}rem,${num(b * k, 3)}rem + ${num(c * k, 3)}vw,${num(snap(d * k), 3)}rem)`;
};

interface ResolvedFonts {
  pairing: FontPairing;
  display: string;
  body: string;
  accent: string | null;
  displayAr: string;
  bodyAr: string;
  displayWeight: number;
  displayWeightAr: number;
}

function resolveFonts(spec: ThemeSpec, d: ArchetypeDef): ResolvedFonts {
  const pairing = findPairing(d, spec.fonts.display, spec.fonts.body) ?? d.fonts[0]!;
  const known = (id: string | undefined, fallback: string) => (id && isKnownFont(id) ? id : fallback);
  // the Arabic slots must actually cover Arabic — a Latin-only face there would silently hand every
  // Arabic headline to the system font
  const arabic = (id: string, fallback: string) => (fontData(id)?.scripts.includes("arabic") ? id : fallback);
  const display = known(spec.fonts.display, pairing.display);
  const displayAr = arabic(spec.fonts.displayAr, pairing.displayAr);
  // with `look` the weights are the genome's (G6: the catalogue's displayWeight / displayWeightAr, F15)
  const look = spec.look;
  return {
    pairing,
    display,
    body: known(spec.fonts.body, pairing.body),
    accent: spec.fonts.accent === undefined ? (pairing.accent ?? null) : isKnownFont(spec.fonts.accent) ? spec.fonts.accent : (pairing.accent ?? null),
    displayAr,
    bodyAr: arabic(spec.fonts.bodyAr, pairing.bodyAr),
    displayWeight: nearestWeight(display, look ? look.type.w : pairing.displayWeight),
    displayWeightAr: nearestWeight(displayAr, look ? look.type.wAr : pairing.displayWeightAr),
  };
}

const ACCENT_WEIGHT = { mono: 500, serif: 400, sans: 500 } as const;

/** Font ids (deduplicated, in preload order) and weights a theme uses for a locale (BuiltTheme.fontIds / fontWeights). */
export function themeFonts(spec: ThemeSpec, locale: Locale): { fontIds: string[]; fontWeights: number[] } {
  const d = ARCHETYPE_DEFS[spec.archetype];
  const f = resolveFonts(spec, d);
  return fontsOf(f, locale === "ar");
}

function accentOf(f: ResolvedFonts, ar: boolean) {
  const role = f.accent ? accentRole(f.accent) : null;
  // Arabic companion of the Latin accent: the Arabic display face for serif flourishes, the Arabic
  // body face for mono labels / spec numbers
  const accentAr = role === "serif" ? f.displayAr : f.bodyAr;
  // Arabic pages set the accent / label stack Arabic face first, so the weight is the one that face
  // ships (no faux bold): regular beside a serif flourish, medium for labels (mono role)
  const accentWeight = !role ? 400 : ar ? nearestWeight(accentAr, role === "mono" ? ACCENT_WEIGHT.mono : 400) : ACCENT_WEIGHT[role];
  return { role, accentAr, accentWeight };
}

function fontsOf(f: ResolvedFonts, ar: boolean): { fontIds: string[]; fontWeights: number[] } {
  const { accentAr, accentWeight } = accentOf(f, ar);
  const fontIds: string[] = [];
  const fontWeights: number[] = [];
  const addFont = (id: string | null, w: number) => {
    if (!id || fontIds.includes(id)) return;
    fontIds.push(id);
    fontWeights.push(w);
  };
  if (ar) {
    addFont(f.displayAr, f.displayWeightAr);
    addFont(f.bodyAr, 400);
    if (f.accent) {
      addFont(accentAr, accentWeight);
      // the Latin accent only backs up glyphs the Arabic face lacks
      addFont(f.accent, nearestWeight(f.accent, accentWeight));
    }
  } else {
    addFont(f.display, f.displayWeight);
    addFont(f.body, 400);
    addFont(f.accent, accentWeight);
  }
  return { fontIds, fontWeights };
}

function sectionVars(sec: SectionColors): Record<string, string> {
  return {
    "sec-bg": sec.bg,
    "sec-ink": sec.ink,
    "sec-ink-soft": sec.inkSoft,
    "sec-line": sec.line,
    "sec-line-strong": sec.lineStrong,
    "sec-accent": sec.accent,
    "sec-accent-ink": sec.accentInk,
    "sec-card": sec.card,
    "sec-card-ink": sec.cardInk,
    "sec-chip": sec.chip,
    "sec-chip-ink": sec.chipInk,
    "sec-highlight": sec.highlight,
    "sec-success": sec.success,
    "sec-danger": sec.danger,
    "sec-warn": sec.warn,
  };
}

function paletteVars(p: Palette): Record<string, string> {
  const v: Record<string, string> = {
    "lp-bg": p.bg,
    "lp-surface": p.surface,
    "lp-surface-2": p.surface2,
    "lp-soft": p.soft,
    "lp-ink": p.ink,
    "lp-ink-soft": p.inkSoft,
    "lp-ink-mute": p.inkMute,
    "lp-line": p.line,
    "lp-line-strong": p.lineStrong,
    "lp-accent": p.accent,
    "lp-accent-ink": p.accentInk,
    "lp-accent-soft": p.accentSoft,
    "lp-accent-strong": p.accentStrong,
    "lp-pop": p.pop,
    "lp-pop-ink": p.popInk,
    "lp-dark": p.dark,
    "lp-dark-ink": p.darkInk,
    "lp-success": p.success,
    "lp-danger": p.danger,
    "lp-warn": p.warn,
  };
  for (const [step, hex] of Object.entries(p.a)) v[`lp-a-${step}`] = hex;
  for (const [step, hex] of Object.entries(p.n)) v[`lp-n-${step}`] = hex;
  return v;
}

const decls = (vars: Record<string, string>) =>
  Object.entries(vars)
    .map(([k, v]) => `--${k}:${v}`)
    .join(";");

/* ------------------------------------------------------------------ */
/* buildTheme                                                          */
/* ------------------------------------------------------------------ */

export function buildThemeTokens(input: ThemeSpec, localeInput: Locale): BuiltTheme {
  const parsed = ThemeSpec.safeParse(input);
  if (!parsed.success) throw new Error(`invalid theme spec: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  const spec = parsed.data;
  const locale = Locale.parse(localeInput);
  const ar = locale === "ar";
  const rtl = dirOf(locale) === "rtl";
  const d = ARCHETYPE_DEFS[spec.archetype];
  const look = spec.look ?? null;
  const playground = spec.archetype === "playground";

  /* fonts ---------------------------------------------------------------- */
  const f = resolveFonts(spec, d);
  const { role, accentAr, accentWeight } = accentOf(f, ar);
  const bodyStrong = (id: string) => nearestWeight(id, 700);
  const { fontIds, fontWeights } = fontsOf(f, ar);

  // *emphasis* in italic: the display face's own italic first (Bodoni, Fraunces, Instrument Serif),
  // else a serif accent's italic inside a grotesk headline; no italic available → accent color
  const italicFont = !ar ? ([f.display, f.accent].find((id) => id && hasItalic(id)) ?? null) : null;
  let emphasis: string = look ? look.em : d.emphasis;
  if (emphasis === "italic" && !italicFont) emphasis = "color";

  const bodyStack = ar ? fontStack(f.bodyAr) : fontStack(f.body);
  // Arabic pages: the Arabic companion leads the stack. A Latin face first would also own U+0020
  // (Latin unicode-range), so every space between two Arabic words would take its advance — a mono's
  // wide space splits labels into islands. The Latin accent stays behind it as a last resort.
  const accentStack = f.accent ? (ar ? fontStack(accentAr, [f.accent]) : fontStack(f.accent, [f.body])) : bodyStack;
  const lh = ar ? arabicLineHeights(f.displayAr, d.display.lineHeight) : null;
  const typeVars: Record<string, string> = {
    "lp-font-display": ar ? fontStack(f.displayAr) : fontStack(f.display),
    "lp-font-body": bodyStack,
    "lp-font-accent": accentStack,
    // small labels / captions / spec numbers: the mono accent when there is one, else the body face
    "lp-font-label": role === "mono" ? accentStack : bodyStack,
    "lp-font-emphasis": ar ? fontStack(f.displayAr) : italicFont ? fontStack(italicFont) : fontStack(f.display),
    "lp-emphasis-style": italicFont && emphasis === "italic" ? "italic" : "normal",
    "lp-display-weight": String(ar ? f.displayWeightAr : f.displayWeight),
    "lp-display-tracking": ar ? "0" : `${num(d.display.tracking, 3)}em`,
    "lp-display-case": ar ? "none" : d.display.case,
    "lp-display-lh": num(ar ? lh!.display : d.display.lineHeight, 2),
    "lp-body-lh": num(ar ? Math.max(lh!.body, d.bodyLineHeight + 0.15) : d.bodyLineHeight, 2),
    "lp-body-weight": "400",
    "lp-strong-weight": String(bodyStrong(ar ? f.bodyAr : f.body)),
    // in-between weights for quiet hierarchy (labels, prices, nav) — the nearest the body face ships,
    // so Arabic never gets a faux bold
    "lp-medium-weight": String(nearestWeight(ar ? f.bodyAr : f.body, 500)),
    "lp-semibold-weight": String(nearestWeight(ar ? f.bodyAr : f.body, 600)),
    "lp-accent-weight": String(accentWeight),
    "lp-label-case": ar ? "none" : d.labels.case,
    "lp-label-tracking": ar ? "0" : `${num(d.labels.tracking, 3)}em`,
    ...typeScale(d.typeRatio),
  };
  if (look) {
    // the typography engine (DES-§10.5) replaces the archetype's fixed ratio, tracking, case and leading
    const tt = typeTokens({ display: f.display, body: f.body, displayAr: f.displayAr, bodyAr: f.bodyAr }, look, locale);
    Object.assign(typeVars, tt.vars);
    typeVars["lp-display-weight"] = String(ar ? f.displayWeightAr : f.displayWeight);
    typeVars["lp-display-weight-ar"] = String(f.displayWeightAr);
  }

  /* color ---------------------------------------------------------------- */
  const palette = buildPalette(
    { accent: spec.palette.accent, pop: spec.palette.pop, neutralHue: spec.palette.neutralHue, base: spec.palette.base, harmony: spec.palette.harmony },
    look ? { lineStrength: look.hair.s, ...(look.hc ? { contrastLevel: "high" as const } : {}) } : { lineStrength: d.lineStrength },
  );
  // a quiet page (calm, modest, baby products) never gets the highlighter-block emphasis (the owner's
  // rejected "yellow marker"): the display face's italic where there is one, else the accent color
  if (palette.quiet && emphasis === "highlight") {
    emphasis = italicFont ? "italic" : "color";
    if (emphasis === "italic") typeVars["lp-emphasis-style"] = "italic";
  }

  /* shape, depth, material, motion --------------------------------------- */
  const shadowKind: ShadowKind = spec.shadow === "archetype" ? d.shadow : spec.shadow;
  // D60: no grain on generated pages; an owner's `grain` stays in the doc and is ignored here
  const textureKind = renderedTexture(spec.texture === "archetype" ? d.texture.kind : spec.texture);
  const depth = look?.depth ?? null;
  // H26: panels only with a flat or hairline card tier (an explicit builder choice still wins, DS4)
  const archetypeSurfaces: SurfacesKind = depth && d.surfaces.kind === "panels" && depth !== "flat" && depth !== "hairline" ? "flush" : d.surfaces.kind;
  const surfaces: SurfacesKind = spec.surfaces === "archetype" ? archetypeSurfaces : spec.surfaces;
  const motion = spec.motion;
  const off = motion === "off";
  const durMul = motion === "calm" ? 1.25 : 1;
  const dividers: Divider[] = spec.dividers.length > 0 ? [...spec.dividers] : [...d.dividers];
  const panels = surfaces === "panels";

  // radius: an explicit builder kind, else the look's ladder, else the archetype
  const explicitRadius = spec.radius !== "archetype";
  let radius: RadiusDef = explicitRadius ? RADIUS_PRESETS[spec.radius as RadiusKind] : d.radius;
  let ladder: readonly [number, number, number, number] | null = null;
  if (look) {
    if (explicitRadius) ladder = [radius.scale[0], radius.scale[1], radius.scale[3], radius.media];
    else {
      ladder = LADDER_PX[look.ladder];
      const [chip, control, card, media] = ladder;
      const xl = media > 0 && media < 999 ? media : Math.round(card * 1.33);
      radius = {
        kind: LADDER_KIND[look.ladder],
        scale: [chip >= 999 ? Math.min(control, 8) : chip, control, control, card, xl],
        btn: look.btn === "pill" ? 999 : Math.max(BTN_RADIUS_MIN_PX, control),
        media,
        panel: Math.max(card, xl) + 8,
      };
    }
  }

  const shapeVars: Record<string, string> = {
    "lp-radius-xs": px(radius.scale[0]),
    "lp-radius-s": px(radius.scale[1]),
    "lp-radius-m": px(radius.scale[2]),
    "lp-radius-l": fluidRadius(radius.scale[3]),
    "lp-radius-xl": fluidRadius(radius.scale[4]),
    "lp-radius-btn": px(radius.btn >= 999 ? 999 : Math.max(BTN_RADIUS_MIN_PX, radius.btn)),
    "lp-radius-media": fluidRadius(radius.media),
    "lp-radius-pill": "999px",
    // floating section panels (data-surfaces="panels"): inset from the viewport, rounded, spaced
    "lp-radius-panel": panels ? fluidRadius(radius.panel) : "0px",
    "lp-panel-inset": panels ? fluidPx(8, 20) : "0px",
    "lp-panel-gap": panels ? fluidPx(8, 20) : "0px",
    "lp-border-w": px(look ? look.hair.w : d.borderWidth),
    "lp-border-style": "solid",
  };
  if (look && ladder) {
    const [chip, control, card, media] = ladder;
    shapeVars["lp-radius-chip"] = px(chip);
    shapeVars["lp-radius-control"] = px(control);
    shapeVars["lp-radius-card"] = fluidRadius(card);
    shapeVars["lp-radius-media"] = fluidRadius(media);
    // mask geometry (DES-§4.11.1): the cut corner is the card radius × 2 (crisp) or × 3; the blob is a seeded polygon
    shapeVars["lp-mask-cut"] = `calc(var(--lp-radius-card) * ${look.ladder === "crisp" ? 2 : 3})`;
    if (look.mask === "blob") shapeVars["lp-mask-blob"] = blobPolygon(spec.seed);
  }

  const motionVars: Record<string, string> = look
    ? lookMotion(look, motion, playground)
    : {
        "lp-ease": off ? "linear" : d.motion.ease,
        "lp-ease-out": off ? "linear" : d.motion.easeOut,
        "lp-ease-spring": off ? "linear" : SPRING_EASINGS[motion === "calm" ? "gentle" : d.motion.spring],
        // the shared smooth vocabulary (DESIGN.md §6): decelerations, and a pop for badges/checks that
        // overshoots only on playground (DS28)
        "lp-ease-in-out": off ? "linear" : EASE.inOut,
        "lp-ease-expo-out": off ? "linear" : EASE.expoOut,
        "lp-ease-quint-out": off ? "linear" : EASE.quintOut,
        "lp-ease-pop": off ? "linear" : SPRING_EASINGS[motion === "calm" || !playground ? "soft" : "bouncy"],
        "lp-dur-s": ms(off ? 0 : d.motion.dur[0] * durMul),
        "lp-dur-m": ms(off ? 0 : d.motion.dur[1] * durMul),
        "lp-dur-l": ms(off ? 0 : d.motion.dur[2] * durMul),
        "lp-stagger": ms(off ? 0 : d.motion.stagger * (motion === "calm" ? 1.2 : 1)),
      };
  motionVars["lp-reveal-distance"] = px(off ? 0 : Math.round(d.motion.distance * (motion === "calm" ? 0.6 : 1)));

  const spaceVars: Record<string, string> = look
    ? {
        "lp-space-section": spaceOf(look.dens, look.space, true),
        "lp-container": rem(look.grid.w),
        "lp-gutter": fluidPx(GUTTER[look.grid.m][0], GUTTER[look.grid.m][1]),
        "lp-unit": px(look.grid.u),
        "lp-split-a": `${num(SPLIT[look.grid.s][0], 3)}fr`,
        "lp-split-b": `${num(SPLIT[look.grid.s][1], 3)}fr`,
      }
    : {
        "lp-space-section": spaceOf(d.density),
        "lp-container": rem(d.container),
        "lp-gutter": "clamp(1rem,0.55rem + 2vw,2rem)",
      };

  const materialVars: Record<string, string> = {
    "lp-glass-blur": px(d.glass.blur),
    "lp-glass-filter": `blur(${px(d.glass.blur)}) saturate(${Math.round(Math.min(d.glass.saturate, GLASS_SATURATE_MAX) * 100)}%)`,
    "lp-tilt-min": `${num(d.tilt[0], 2)}deg`,
    "lp-tilt-max": `${num(d.tilt[1], 2)}deg`,
    "lp-ornament": num(spec.ornament, 2),
  };

  /* sections ------------------------------------------------------------- */
  // the aurora field is no longer emitted (D60); a document without look keeps its stage glow, the
  // field's first light, so its tones are still solved
  const hues = look ? null : auroraHues(palette.accent, palette.pop, palette.neutralHue);
  const geo = look ? null : auroraGeometry(spec.seed, rtl);
  const depthVars = (sec: SectionColors): Record<string, string> => {
    const dp = sectionDepth(shadowKind, sec, palette.accent);
    const gl = sectionGlass(sec, d.glass);
    const st = sectionStage(sec, palette.accent);
    const out: Record<string, string> = {
      "lp-shadow-s": dp.shadowS,
      "lp-shadow-m": dp.shadowM,
      "lp-shadow-l": dp.shadowL,
      "lp-shadow-glow": dp.shadowGlow,
      "lp-highlight": dp.highlight,
      "lp-highlight-accent": dp.highlightAccent,
      "lp-shadow-product": dp.product,
      "lp-shadow-product-filter": dp.productFilter,
      "sec-glass": gl.fill,
      "sec-glass-ink": gl.ink,
      "sec-glass-border": gl.border,
      "sec-glass-solid": gl.solid,
      "lp-stage-glow": hues && geo ? sectionStageGlow(sec, hues, geo) : "none",
      // product stage tint, one clean hue per block (outranks the color-mix fallbacks of base.css,
      // which sit in :where() at zero specificity)
      "mx-stage": st.stage,
      "mx-stage-hi": st.hi,
      "mx-stage-lo": st.lo,
    };
    if (depth) {
      // the depth recipes and stage presets of the look (DES-§4.10.1, §4.11.1)
      const rd = lookDepth(depth, sec, spec.archetype);
      const sp = lookStage(sec, palette.accent);
      out["lp-shadow-card"] = rd.shadowCard;
      out["lp-shadow-float"] = rd.shadowFloat;
      out["lp-highlight"] = rd.highlight;
      out["lp-ring"] = rd.ring;
      if (rd.line) out["lp-line"] = rd.line;
      out["lp-stage-glow"] = sp.glow;
      out["lp-stage-glow-2"] = sp.glow2;
      out["lp-stage-contact"] = sp.contact;
      out["lp-stage-plinth"] = sp.plinth;
      out["lp-stage-plinth-line"] = sp.plinthLine;
    }
    return out;
  };
  const baseSec = palette.sections.base;
  const rootVars: Record<string, string> = {
    ...paletteVars(palette),
    ...typeVars,
    ...shapeVars,
    ...motionVars,
    ...spaceVars,
    ...materialVars,
    ...sectionVars(baseSec),
    ...depthVars(baseSec),
  };

  const blocks: string[] = [`:root{color-scheme:${palette.scheme};accent-color:${baseSec.accent};${decls(rootVars)}}`];
  const tokens: Record<string, string> = { ...rootVars };
  for (const bg of SECTION_BGS as readonly SectionBg[]) {
    const sec = palette.sections[bg];
    const vars: Record<string, string> = { ...sectionVars(sec), ...depthVars(sec) };
    blocks.push(`[data-bg="${bg}"]{color-scheme:${sec.scheme};accent-color:${sec.accent};${decls(vars)}}`);
    for (const [k, v] of Object.entries(vars)) tokens[`${bg}:${k}`] = v;
  }
  blocks.push(`::selection{background:${palette.accent};color:${palette.accentInk}}`);

  const attrs: Record<string, string> = {
    "data-arch": d.id,
    "data-btn": look ? look.btn : d.button,
    "data-card": depth ? CARD_OF_DEPTH[depth] : d.card,
    "data-emphasis": ar && emphasis === "italic" ? "color" : emphasis,
    "data-mask": look ? look.mask : d.mask,
    "data-glyph": look ? look.kit.gl : d.glyph,
    "data-texture": textureKind,
    "data-radius": radius.kind,
    "data-shadow": shadowKind,
    "data-surfaces": surfaces,
    "data-motion": motion,
    "data-base": spec.palette.base,
    "data-density": look ? look.dens : d.density,
  };
  if (look) {
    attrs["data-look"] = "1";
    attrs["data-grammar"] = look.g;
    attrs["data-ladder"] = look.ladder;
    attrs["data-depth"] = look.depth;
    attrs["data-labels"] = look.type.lb;
    attrs["data-align"] = look.align;
    attrs["data-img"] = look.img;
    attrs["data-reveal-kinds"] = [...new Set(look.mo.r)].join(" ");
    attrs["data-reveal-scope"] = look.mo.scope;
    attrs["data-numbering"] = look.kit.nb;
    attrs["data-caption"] = look.kit.cap;
    // squircle corners are emitted only from DG-19 (later)
    attrs["data-corner"] = "circle";
  }

  return { css: blocks.join("\n"), tokens, fontIds, fontWeights, attrs, dividers, scheme: palette.scheme };
}

/** The G23 motion tokens of a look (DES-§4.12): one family per page, durations from G23.d, no overshoot off playground. */
function lookMotion(look: ThemeLook, motion: ThemeSpec["motion"], playground: boolean): Record<string, string> {
  const off = motion === "off";
  const calm = motion === "calm";
  // soft-spring is playground's only (H15); a stray value elsewhere falls back to the critically damped spring
  const family = look.mo.f === "soft-spring" && !playground ? "critical" : look.mo.f;
  const curve = EASE_FAMILY_CURVES[family];
  const dur = (k: number) => ms(off ? 0 : Math.min(DUR_MAX, Math.max(DUR_MIN, look.mo.d * k * (calm ? 1.25 : 1))));
  const out: Record<string, string> = {
    "lp-ease": off ? "linear" : curve,
    "lp-ease-out": off ? "linear" : curve,
    "lp-ease-in-out": off ? "linear" : EASE.inOut,
    "lp-ease-expo-out": off ? "linear" : EASE.expoOut,
    "lp-ease-quint-out": off ? "linear" : EASE.quintOut,
    "lp-ease-pop": off ? "linear" : SPRING_EASINGS[playground && !calm ? "bouncy" : "soft"],
    "lp-dur-s": dur(DUR_SCALE[0]),
    "lp-dur-m": dur(DUR_SCALE[1]),
    "lp-dur-l": dur(DUR_SCALE[2]),
    "lp-stagger": ms(off ? 0 : look.mo.st * (calm ? 1.2 : 1)),
  };
  // --lp-ease-spring only for the soft-spring family on playground: absent elsewhere, so a stray selector cannot bounce
  if (family === "soft-spring" && !off) out["lp-ease-spring"] = SPRING_EASINGS.soft;
  return out;
}
