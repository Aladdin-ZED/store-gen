/**
 * Archetypes — eleven contemporary design languages (docs/DESIGN.md §3, v2 · Modern). Each definition is
 * pure data: type pairings, color harmony, shape, depth, material (glass, surfaces), motion and the section
 * variants that suit it. Tokens (tokens.ts) and the vibe engine (vibe.ts) read these; sections only ever see
 * the resulting CSS custom properties and the `data-*` attributes on <html> (DESIGN.md §2.5 value sets,
 * mirrored in THEME_ATTR_VALUES below).
 *
 * This module has type-only imports, so components can read `ARCHETYPE_DEFS[a].glyph/.tilt/.mask/…`
 * without pulling the palette solver or the font manifest into a bundle.
 *
 * Every font id below is a key of the generated font manifest (fonts.generated.ts) — the type
 * `KnownFontId` makes a typo (or a dropped, dated family) a compile error.
 */
import type { Archetype, Depth, Divider, EaseFamily, Grammar, HARMONIES, Ladder, Mask, Reveal, SectionBg, ThemeLook, Treatment } from "@/lib/page/schema";
import type { KnownFontId } from "./fonts.generated";

export type Harmony = (typeof HARMONIES)[number];

/* ------------------------------------------------------------------ */
/* <html> attribute value sets (DESIGN.md §2.5 — exact contract)        */
/* ------------------------------------------------------------------ */

export const BUTTON_STYLES = ["solid", "pill", "glow", "soft", "outline", "underline"] as const;
export const CARD_STYLES = ["flat", "soft", "outlined", "raised", "glass"] as const;
/**
 * "italic" automatically becomes "color" for Arabic pages (no italics in Arabic). "none" (G26, DS56) exists only
 * with `look`: the hero title carries no emphasised word.
 */
export const EMPHASIS_STYLES = ["swoosh", "highlight", "color", "italic", "none"] as const;
/** "rect" and "cut" exist only with `look` (DES-§4.11.1; the `mixed` ladder's media takes one of them, DS55). */
export const MASK_STYLES = ["arch", "circle", "pill", "rounded", "rect", "cut", "blob"] as const;
export const GLYPH_STYLES = ["dot", "spark", "diamond", "none"] as const;
/** grain = ultra-subtle film grain (≤ 3% opacity), meant for gradient/dark fields only. */
export const TEXTURE_KINDS = ["none", "grain"] as const;
export const RADIUS_KINDS = ["none", "subtle", "soft", "round"] as const;
export const SHADOW_KINDS = ["none", "soft", "deep", "glow"] as const;
/** panels: sections are large rounded panels inset from the viewport edge · flush: edge to edge. */
export const SURFACES_KINDS = ["flush", "panels"] as const;
export const MOTION_KINDS = ["calm", "lively", "off"] as const;
export const BASE_MOODS = ["light", "tinted", "dark"] as const;
export const DENSITIES = ["airy", "balanced", "dense"] as const;

export type ButtonStyle = (typeof BUTTON_STYLES)[number];
export type CardStyle = (typeof CARD_STYLES)[number];
export type EmphasisStyle = (typeof EMPHASIS_STYLES)[number];
export type MaskStyle = (typeof MASK_STYLES)[number];
export type GlyphStyle = (typeof GLYPH_STYLES)[number];
export type TextureKind = (typeof TEXTURE_KINDS)[number];
export type RadiusKind = (typeof RADIUS_KINDS)[number];
export type ShadowKind = (typeof SHADOW_KINDS)[number];
export type SurfacesKind = (typeof SURFACES_KINDS)[number];
export type MotionKind = (typeof MOTION_KINDS)[number];
export type BaseMood = (typeof BASE_MOODS)[number];
export type Density = (typeof DENSITIES)[number];
export type SpringKind = "gentle" | "soft" | "bouncy";

/*
 * The attributes that exist only when the document carries `theme.look` (DES-§4.5.2). The value lists repeat the
 * page-schema vocabulary (GRAMMARS, LADDERS, …) because this module keeps type-only imports; `SameSet` below makes
 * any drift between the two a compile error.
 */
export const LOOK_FLAGS = ["1"] as const;
export const GRAMMAR_VALUES = ["editorial-column", "poster", "gallery-led", "stage", "specimen", "catalogue", "split-tension", "cinematic", "quiet-luxe"] as const;
export const LADDER_VALUES = ["crisp", "soft", "round", "mixed"] as const;
export const DEPTH_VALUES = ["flat", "hairline", "tonal", "ambient", "directional"] as const;
export const LABEL_STYLES = ["mono", "smallcaps", "plain"] as const;
export const ALIGN_VALUES = ["start", "mixed", "center-statement"] as const;
export const TREATMENT_VALUES = ["cutout-stage", "framed-stage", "full-bleed-crop", "framed", "tight-detail", "tonal-duotone", "grid-contact"] as const;
/** `data-reveal-kinds` is a token list (1-2 of these, space-separated), never `data-reveal` (the frozen runtime's selector). */
export const REVEAL_VALUES = ["fade-rise", "blur-in", "mask-wipe", "scale-in", "line-draw"] as const;
export const REVEAL_SCOPES = ["heads", "hero", "none"] as const;
export const NUMBERING_STYLES = ["none", "plain", "padded"] as const;
export const CAPTION_STYLES = ["mono", "smallcaps", "italic-serif", "plain"] as const;
/** `squircle` is emitted only from DG-19 (later); until then the compiled theme writes `circle`. */
export const CORNER_STYLES = ["circle", "squircle"] as const;
export const EASE_FAMILY_VALUES = ["expo", "quint", "quart", "critical", "soft-spring", "mask"] as const;

type SameSet<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const sameSets: [
  SameSet<(typeof GRAMMAR_VALUES)[number], Grammar>,
  SameSet<(typeof LADDER_VALUES)[number], Ladder>,
  SameSet<(typeof DEPTH_VALUES)[number], Depth>,
  SameSet<(typeof LABEL_STYLES)[number], ThemeLook["type"]["lb"]>,
  SameSet<(typeof ALIGN_VALUES)[number], ThemeLook["align"]>,
  SameSet<(typeof TREATMENT_VALUES)[number], Treatment>,
  SameSet<(typeof REVEAL_VALUES)[number], Reveal>,
  SameSet<(typeof REVEAL_SCOPES)[number], ThemeLook["mo"]["scope"]>,
  SameSet<(typeof NUMBERING_STYLES)[number], ThemeLook["kit"]["nb"]>,
  SameSet<(typeof CAPTION_STYLES)[number], ThemeLook["kit"]["cap"]>,
  SameSet<(typeof CORNER_STYLES)[number], ThemeLook["corner"]>,
  SameSet<(typeof MASK_STYLES)[number], Mask>,
  SameSet<(typeof EMPHASIS_STYLES)[number], ThemeLook["em"]>,
  SameSet<(typeof BUTTON_STYLES)[number], ThemeLook["btn"]>,
  SameSet<(typeof GLYPH_STYLES)[number], ThemeLook["kit"]["gl"]>,
  SameSet<(typeof DENSITIES)[number], ThemeLook["dens"]>,
  SameSet<(typeof EASE_FAMILY_VALUES)[number], EaseFamily>,
] = [true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true];
void sameSets;

/** Every attribute buildTheme() puts on <html>, with its complete value set (data-arch excluded: ARCHETYPES). */
export const THEME_ATTR_VALUES = {
  "data-btn": BUTTON_STYLES,
  "data-card": CARD_STYLES,
  "data-emphasis": EMPHASIS_STYLES,
  "data-mask": MASK_STYLES,
  "data-glyph": GLYPH_STYLES,
  "data-texture": TEXTURE_KINDS,
  "data-radius": RADIUS_KINDS,
  "data-shadow": SHADOW_KINDS,
  "data-surfaces": SURFACES_KINDS,
  "data-motion": MOTION_KINDS,
  "data-base": BASE_MOODS,
  "data-density": DENSITIES,
  "data-look": LOOK_FLAGS,
  "data-grammar": GRAMMAR_VALUES,
  "data-ladder": LADDER_VALUES,
  "data-depth": DEPTH_VALUES,
  "data-labels": LABEL_STYLES,
  "data-align": ALIGN_VALUES,
  "data-img": TREATMENT_VALUES,
  "data-reveal-kinds": REVEAL_VALUES,
  "data-reveal-scope": REVEAL_SCOPES,
  "data-numbering": NUMBERING_STYLES,
  "data-caption": CAPTION_STYLES,
  "data-corner": CORNER_STYLES,
} as const satisfies Record<string, readonly string[]>;
export type ThemeAttr = keyof typeof THEME_ATTR_VALUES;

/** The attributes buildTheme() emits only for a document with `theme.look` (DES-§4.5.2); the others are always emitted. */
export const LOOK_ATTRS = [
  "data-look",
  "data-grammar",
  "data-ladder",
  "data-depth",
  "data-labels",
  "data-align",
  "data-img",
  "data-reveal-kinds",
  "data-reveal-scope",
  "data-numbering",
  "data-caption",
  "data-corner",
] as const satisfies readonly ThemeAttr[];
/** Attributes whose value is a space-separated token list (each token from the value set). */
export const TOKEN_LIST_ATTRS: readonly ThemeAttr[] = ["data-reveal-kinds"];
/** Values a document without `look` never gets (they only come from a compiled genome). */
export const LOOK_ONLY_VALUES: Partial<Record<ThemeAttr, readonly string[]>> = { "data-emphasis": ["none"], "data-mask": ["rect", "cut"] };

/** Section types of the landing kit (docs/SECTIONS.md) — keys of `preferredVariants`. */
export const THEME_SECTION_TYPES = [
  "announcement",
  "header",
  "hero",
  "trustBar",
  "marquee",
  "reviews",
  "socialProof",
  "stats",
  "beforeAfter",
  "problem",
  "benefits",
  "showcase",
  "steps",
  "story",
  "gallery",
  "video",
  "comparison",
  "specs",
  "offer",
  "urgency",
  "guarantee",
  "orderForm",
  "cta",
  "faq",
  "footer",
  "stickyCta",
  "whatsappFloat",
] as const;
export type ThemeSectionType = (typeof THEME_SECTION_TYPES)[number];

/* ------------------------------------------------------------------ */
/* Definition shape                                                    */
/* ------------------------------------------------------------------ */

export interface FontPairing {
  id: string;
  /** short designer rationale, shown in the admin font picker */
  note: string;
  display: KnownFontId;
  body: KnownFontId;
  /** monospace labels/spec numbers, or a serif whose italic carries *emphasis* inside a sans headline */
  accent?: KnownFontId;
  displayAr: KnownFontId;
  bodyAr: KnownFontId;
  /** desired display weights (clamped to what the font ships) */
  displayWeight: number;
  displayWeightAr: number;
}

export interface MotionDef {
  /** symmetric ease for state changes */
  ease: string;
  /** entrance ease (reveals) */
  easeOut: string;
  spring: SpringKind;
  /** durations (ms) for small / medium / large movements when motion is "lively" */
  dur: readonly [number, number, number];
  /** stagger between siblings (ms) */
  stagger: number;
  /** reveal travel distance (px) */
  distance: number;
}

export interface RadiusDef {
  kind: RadiusKind;
  /** xs · s · m · l · xl at desktop size (px); l/xl scale down fluidly on phones */
  scale: readonly [number, number, number, number, number];
  /** button radius (999 = pill; ≥ 12 otherwise — a CTA is never a square slab, BTN_RADIUS_MIN in tokens.ts) */
  btn: number;
  /** media radius (px, desktop) */
  media: number;
  /** section panel radius when surfaces = panels (px, desktop) */
  panel: number;
}

export interface GlassDef {
  /** backdrop blur (px) */
  blur: number;
  /**
   * backdrop saturation (1 = none). ≤ 1.3: a stronger boost turns a warm cream or blush behind a
   * glass chip peach (the theme caps it at GLASS_SATURATE_MAX whatever the data says).
   */
  saturate: number;
  /** designed fill opacity — raised automatically where text on the glass would drop below AA */
  alpha: number;
}

export interface SignaturePair {
  name: string;
  accent: string;
  pop: string;
}

export interface ArchetypeDef {
  id: Archetype;
  label: string;
  description: string;
  harmony: Harmony;
  fonts: readonly FontPairing[];
  display: { case: "none" | "uppercase"; tracking: number; lineHeight: number };
  bodyLineHeight: number;
  /** modular type-scale ratio at 360px and at 1280px */
  typeRatio: readonly [number, number];
  /** small labels/captions (Latin): case + tracking (em) */
  labels: { case: "none" | "uppercase"; tracking: number };
  radius: RadiusDef;
  /** hairline / outline width (px) — always solid; dashed and double rules are not part of the language */
  borderWidth: number;
  /** hairline strength 0..1 (0 = barely there, 1 = ink) */
  lineStrength: number;
  shadow: ShadowKind;
  /** grain opacity is capped at 0.03 by the engine */
  texture: { kind: TextureKind; opacity: number };
  glass: GlassDef;
  /** default surfaces; `alt` = probability (0..1) that themeFromProduct picks the other mode for variety */
  surfaces: { kind: SurfacesKind; alt: number };
  motion: MotionDef;
  defaultMotion: "calm" | "lively";
  /** modern section transitions, most characteristic first ("none" is always available on its own) */
  dividers: readonly Exclude<Divider, "none">[];
  /** an archetype never declares the look-only "none" */
  emphasis: Exclude<EmphasisStyle, "none">;
  button: ButtonStyle;
  card: CardStyle;
  /** an archetype never declares the look-only rect / cut masks */
  mask: Exclude<MaskStyle, "rect" | "cut">;
  glyph: GlyphStyle;
  /** seeded rotation range (deg) for collage cards / stickers — modern: straight or ≤ 3° */
  tilt: readonly [number, number];
  density: Density;
  /** max content width (px) */
  container: number;
  /** default ornament density 0..2 */
  ornament: number;
  /** weights for the page base mood */
  baseMood: Readonly<Record<BaseMood, number>>;
  /**
   * designed accent/pop pairs used when there is no product photo to read — never orange (OKLCH hue
   * 25–75° with chroma > 0.06 is forbidden). A calm, low-color photo never uses these: the vibe engine
   * builds a quiet palette from the product's own hue instead.
   */
  signature: readonly SignaturePair[];
  /**
   * Color blocks for the page's color moments (accent / dark / pop only), most characteristic first.
   * The planner keeps those that are real color on the built theme (a dark block on a dark page or a
   * pale pop is not) and never lets two look-alike blocks lead (src/lib/generator/tones.ts).
   */
  colorMoments: readonly SectionBg[];
  /** variant ids per section type (docs/SECTIONS.md), most modern/characteristic first */
  preferredVariants: Readonly<Record<ThemeSectionType, readonly string[]>>;
}

/**
 * Damping ratio per spring: 1 = critically damped (no overshoot) … 0.55 = playful overshoot. DS28: no bounce outside
 * `playground` — `soft` is ζ 0.86 (≈ 0.5 % overshoot, below perception; it was 0.78, a ≈ 2 % soft bounce on seven
 * archetypes) and `bouncy` (ζ 0.56) is emitted only for `playground` (tokens.ts).
 */
export const SPRINGS: Record<SpringKind, number> = { gentle: 1, soft: 0.86, bouncy: 0.56 };
/** The overshoot rule (DS28, H15): a spring below this damping ratio overshoots by more than 0.6 %. */
export const SPRING_ZETA_MIN = 0.85;
/** The archetypes allowed an overshoot easing (DS28): playground only. */
export const OVERSHOOT_ARCHETYPES: readonly Archetype[] = ["playground"];

/** Shared easing vocabulary (smooth, decelerating — never the browser's default `ease`). */
export const EASE = {
  inOut: "cubic-bezier(.65,0,.35,1)",
  inOutSoft: "cubic-bezier(.45,0,.25,1)",
  expoOut: "cubic-bezier(.16,1,.3,1)",
  quintOut: "cubic-bezier(.22,1,.36,1)",
  quartOut: "cubic-bezier(.25,1,.5,1)",
  circOut: "cubic-bezier(0,.55,.45,1)",
  editorial: "cubic-bezier(.77,0,.18,1)",
} as const;

const def = (d: ArchetypeDef) => d;

/* ------------------------------------------------------------------ */
/* The eleven languages                                                */
/* ------------------------------------------------------------------ */

export const ARCHETYPE_DEFS: Readonly<Record<Archetype, ArchetypeDef>> = {
  maison: def({
    id: "maison",
    label: "Maison",
    description:
      "Quiet luxury: velvet dark or warm ivory, a precious champagne/oxblood accent, spotlit product, Didone display, hairline structure, vast space and silky blur-to-sharp reveals.",
    harmony: "mono-luxe",
    fonts: [
      { id: "couture", note: "Bodoni Moda with optical sizes — hairline contrast at display size, its italic for emphasis; Hanken for calm text; El Messiri over Noto Naskh for refined Arabic.", display: "bodoni-moda", body: "hanken-grotesk", displayAr: "el-messiri", bodyAr: "noto-naskh-arabic", displayWeight: 400, displayWeightAr: 500 },
      { id: "atelier", note: "Slim Instrument Serif with Instrument Sans and mono reference numbers — a modern atelier; Reem Kufi's clean geometry for Arabic.", display: "instrument-serif", body: "instrument-sans", accent: "ibm-plex-mono", displayAr: "reem-kufi", bodyAr: "ibm-plex-sans-arabic", displayWeight: 400, displayWeightAr: 500 },
      { id: "salon", note: "Gloock's sharp contemporary wedges with an Instrument Serif italic for emphasis, Hanken text; El Messiri for Arabic.", display: "gloock", body: "hanken-grotesk", accent: "instrument-serif", displayAr: "el-messiri", bodyAr: "ibm-plex-sans-arabic", displayWeight: 400, displayWeightAr: 600 },
    ],
    display: { case: "none", tracking: -0.02, lineHeight: 1.02 },
    bodyLineHeight: 1.62,
    typeRatio: [1.25, 1.5],
    labels: { case: "uppercase", tracking: 0.16 },
    radius: { kind: "subtle", scale: [2, 4, 8, 12, 16], btn: 12, media: 28, panel: 32 },
    borderWidth: 1,
    lineStrength: 0.18,
    shadow: "deep",
    texture: { kind: "grain", opacity: 0.026 },
    glass: { blur: 24, saturate: 1.25, alpha: 0.62 },
    surfaces: { kind: "panels", alt: 0.2 },
    motion: { ease: EASE.inOut, easeOut: EASE.quintOut, spring: "gentle", dur: [340, 720, 1000], stagger: 70, distance: 16 },
    defaultMotion: "calm",
    dividers: ["arch", "fade", "curve"],
    emphasis: "italic",
    button: "solid",
    card: "outlined",
    mask: "arch",
    glyph: "diamond",
    tilt: [0, 0],
    density: "airy",
    container: 1160,
    ornament: 0.7,
    baseMood: { light: 0.4, tinted: 0.2, dark: 0.4 },
    signature: [
      { name: "oxblood & champagne", accent: "#6b1e2b", pop: "#cfb07a" },
      { name: "bottle green & champagne", accent: "#1f4a3b", pop: "#d8c39a" },
      { name: "midnight & antique gold", accent: "#1c2840", pop: "#bf9a55" },
      { name: "champagne & espresso", accent: "#b48c45", pop: "#4a2a1f" },
    ],
    colorMoments: ["dark", "accent"],
    preferredVariants: {
      announcement: ["static", "split", "ticker"],
      header: ["centered", "minimal"],
      hero: ["stage", "editorial", "split"],
      trustBar: ["ledger", "chips"],
      marquee: ["outline", "double"],
      reviews: ["carousel", "summary", "wall"],
      socialProof: ["whatsapp", "counter"],
      stats: ["big-numbers", "rings"],
      beforeAfter: ["slider", "cards"],
      problem: ["quote", "split"],
      benefits: ["numbered", "bento", "zigzag"],
      showcase: ["hotspots", "ingredients", "exploded"],
      steps: ["timeline", "strip"],
      story: ["manifesto", "image-text", "letter"],
      gallery: ["lookbook", "filmstrip", "carousel"],
      video: ["framed", "fullbleed"],
      comparison: ["table", "checklist"],
      specs: ["sheet", "accordion", "tabs"],
      offer: ["shelf", "stacked", "tickets"],
      urgency: ["banner", "countdown"],
      guarantee: ["seal", "letter", "split"],
      orderForm: ["split", "minimal", "card"],
      cta: ["banner", "stamp", "poster"],
      faq: ["two-col", "accordion"],
      footer: ["big", "simple"],
      stickyCta: ["bar", "pill"],
      whatsappFloat: ["bubble", "tab"],
    },
  }),

  apothecary: def({
    id: "apothecary",
    label: "Apothecary",
    description:
      "Clinical clean: soft rose clay, mint or sage, frosted glass panels, crisp hairlines, ingredient chips and data — lab precision with a soft optical serif.",
    harmony: "clay-sage",
    fonts: [
      { id: "lab-serif", note: "Fraunces' soft optical display with Instrument Sans and mono lab labels; Readex Pro over IBM Plex Sans Arabic.", display: "fraunces", body: "instrument-sans", accent: "ibm-plex-mono", displayAr: "readex-pro", bodyAr: "ibm-plex-sans-arabic", displayWeight: 400, displayWeightAr: 500 },
      { id: "dermo", note: "Slim Instrument Serif (italic emphasis) over DM Sans — a contemporary dermo-cosmetics shelf; Readex Pro for Arabic.", display: "instrument-serif", body: "dm-sans", accent: "ibm-plex-mono", displayAr: "readex-pro", bodyAr: "ibm-plex-sans-arabic", displayWeight: 400, displayWeightAr: 500 },
      { id: "formula", note: "All-grotesk precision: Hanken Grotesk medium with JetBrains Mono batch codes; Alexandria for Arabic.", display: "hanken-grotesk", body: "hanken-grotesk", accent: "jetbrains-mono", displayAr: "alexandria", bodyAr: "readex-pro", displayWeight: 500, displayWeightAr: 500 },
    ],
    display: { case: "none", tracking: -0.025, lineHeight: 1.04 },
    bodyLineHeight: 1.6,
    typeRatio: [1.2, 1.38],
    labels: { case: "uppercase", tracking: 0.1 },
    radius: { kind: "soft", scale: [8, 12, 16, 20, 24], btn: 999, media: 24, panel: 32 },
    borderWidth: 1,
    lineStrength: 0.16,
    shadow: "soft",
    texture: { kind: "none", opacity: 0 },
    glass: { blur: 20, saturate: 1.25, alpha: 0.62 },
    surfaces: { kind: "panels", alt: 0.2 },
    motion: { ease: EASE.inOutSoft, easeOut: EASE.quintOut, spring: "soft", dur: [240, 480, 640], stagger: 60, distance: 14 },
    defaultMotion: "calm",
    dividers: ["curve", "fade", "wave"],
    emphasis: "highlight",
    button: "pill",
    card: "glass",
    mask: "rounded",
    glyph: "dot",
    tilt: [0, 0],
    density: "balanced",
    container: 1180,
    ornament: 0.8,
    baseMood: { light: 0.6, tinted: 0.4, dark: 0 },
    signature: [
      { name: "sage teal & blush", accent: "#3f6f63", pop: "#f0c9cb" },
      { name: "rose clay & sage", accent: "#a35760", pop: "#a8bea0" },
      { name: "cobalt & blush", accent: "#2e4f8f", pop: "#eecaca" },
    ],
    colorMoments: ["accent", "dark", "pop"],
    preferredVariants: {
      announcement: ["static", "ticker"],
      header: ["minimal", "centered"],
      hero: ["stage", "split", "editorial"],
      trustBar: ["chips", "ledger"],
      marquee: ["outline", "double"],
      reviews: ["summary", "wall", "carousel"],
      socialProof: ["whatsapp", "ugc", "counter"],
      stats: ["rings", "big-numbers"],
      beforeAfter: ["slider", "timeline"],
      problem: ["split", "crossed"],
      benefits: ["bento", "numbered", "icons"],
      showcase: ["ingredients", "hotspots"],
      steps: ["timeline", "cards"],
      story: ["image-text", "letter"],
      gallery: ["carousel", "lookbook"],
      video: ["phone", "framed"],
      comparison: ["checklist", "table"],
      specs: ["tabs", "label", "accordion"],
      offer: ["stacked", "tickets", "shelf"],
      urgency: ["banner", "countdown", "stock"],
      guarantee: ["split", "seal"],
      orderForm: ["card", "split"],
      cta: ["banner", "poster"],
      faq: ["accordion", "two-col"],
      footer: ["simple", "big"],
      stickyCta: ["bar", "pill"],
      whatsappFloat: ["bubble"],
    },
  }),

  souk: def({
    id: "souk",
    label: "Souk",
    description:
      "Modern Moroccan: majorelle, deep teal, burgundy, olive or gold from the product on warm sand, clean arch masks, abstract zellige line geometry at whisper opacity, sun-warm glows.",
    harmony: "earth-triad",
    fonts: [
      { id: "riad", note: "Gloock's contemporary wedge serif with Figtree; Reem Kufi's clean kufic geometry over Readex Pro.", display: "gloock", body: "figtree", displayAr: "reem-kufi", bodyAr: "readex-pro", displayWeight: 400, displayWeightAr: 600 },
      { id: "medina", note: "Fraunces medium — warm and soft — with DM Sans; Alexandria's modern geometric Arabic.", display: "fraunces", body: "dm-sans", displayAr: "alexandria", bodyAr: "readex-pro", displayWeight: 500, displayWeightAr: 600 },
      { id: "atlas", note: "Instrument Serif (italic emphasis) with Figtree; El Messiri's modern calligraphic geometry over Tajawal.", display: "instrument-serif", body: "figtree", displayAr: "el-messiri", bodyAr: "tajawal", displayWeight: 400, displayWeightAr: 600 },
    ],
    display: { case: "none", tracking: -0.015, lineHeight: 1.04 },
    bodyLineHeight: 1.6,
    typeRatio: [1.22, 1.42],
    labels: { case: "uppercase", tracking: 0.12 },
    radius: { kind: "soft", scale: [8, 12, 20, 24, 28], btn: 999, media: 28, panel: 36 },
    borderWidth: 1,
    lineStrength: 0.22,
    shadow: "glow",
    texture: { kind: "grain", opacity: 0.022 },
    glass: { blur: 18, saturate: 1.25, alpha: 0.64 },
    surfaces: { kind: "flush", alt: 0.35 },
    motion: { ease: EASE.inOutSoft, easeOut: EASE.quintOut, spring: "soft", dur: [260, 520, 720], stagger: 70, distance: 18 },
    defaultMotion: "lively",
    dividers: ["arch", "curve", "wave"],
    emphasis: "swoosh",
    button: "pill",
    card: "soft",
    mask: "arch",
    glyph: "spark",
    tilt: [-2, 2],
    density: "balanced",
    container: 1180,
    ornament: 1.1,
    baseMood: { light: 0.3, tinted: 0.6, dark: 0.1 },
    signature: [
      { name: "majorelle & gold", accent: "#2f45b0", pop: "#e5bc46" },
      { name: "burgundy & mint tea", accent: "#812a3b", pop: "#90ceac" },
      { name: "deep teal & gold", accent: "#00626a", pop: "#e5bc46" },
      { name: "olive & majorelle", accent: "#6a7b27", pop: "#3446b4" },
    ],
    colorMoments: ["accent", "pop", "dark"],
    preferredVariants: {
      announcement: ["ticker", "split"],
      header: ["centered", "minimal"],
      hero: ["stage", "editorial", "split"],
      trustBar: ["stamps", "chips"],
      marquee: ["tape", "double"],
      reviews: ["wall", "notes"],
      socialProof: ["whatsapp", "counter"],
      stats: ["big-numbers", "ticker"],
      beforeAfter: ["cards", "slider"],
      problem: ["chat", "crossed"],
      benefits: ["zigzag", "bento"],
      showcase: ["ingredients", "exploded"],
      steps: ["illustrated", "timeline"],
      story: ["image-text", "letter"],
      gallery: ["masonry", "carousel"],
      video: ["framed"],
      comparison: ["table", "versus"],
      specs: ["label", "sheet"],
      offer: ["tickets", "stacked"],
      urgency: ["countdown", "banner"],
      guarantee: ["seal", "split"],
      orderForm: ["card", "bold"],
      cta: ["banner", "stamp"],
      faq: ["accordion", "chat"],
      footer: ["big", "simple"],
      stickyCta: ["bar"],
      whatsappFloat: ["bubble"],
    },
  }),

  playground: def({
    id: "playground",
    label: "Playground",
    description:
      "Playful modern: vivid color blocks, big rounded shapes, soft clay-3D depth, crisp vector stickers and springy, bouncy interactions.",
    harmony: "pop-complement",
    fonts: [
      { id: "sticker", note: "Bricolage Grotesque's display cut, extra-bold, with Figtree; Baloo Bhaijaan 2's round Arabic over Readex Pro.", display: "bricolage-grotesque", body: "figtree", displayAr: "baloo-bhaijaan-2", bodyAr: "readex-pro", displayWeight: 800, displayWeightAr: 700 },
      { id: "candy", note: "Bricolage bold with DM Sans; Marhey's bouncy modern Arabic over Tajawal.", display: "bricolage-grotesque", body: "dm-sans", displayAr: "marhey", bodyAr: "tajawal", displayWeight: 700, displayWeightAr: 700 },
      { id: "bounce", note: "Young Serif's chunky friendly serif with Figtree; Lemonada's rounded geometric Arabic.", display: "young-serif", body: "figtree", displayAr: "lemonada", bodyAr: "readex-pro", displayWeight: 400, displayWeightAr: 600 },
    ],
    display: { case: "none", tracking: -0.035, lineHeight: 0.96 },
    bodyLineHeight: 1.55,
    typeRatio: [1.25, 1.45],
    labels: { case: "none", tracking: 0.01 },
    radius: { kind: "round", scale: [12, 18, 24, 32, 40], btn: 999, media: 36, panel: 44 },
    borderWidth: 2,
    lineStrength: 0.3,
    shadow: "deep",
    texture: { kind: "none", opacity: 0 },
    glass: { blur: 14, saturate: 1.3, alpha: 0.7 },
    surfaces: { kind: "flush", alt: 0.2 },
    motion: { ease: EASE.inOutSoft, easeOut: EASE.expoOut, spring: "bouncy", dur: [200, 420, 600], stagger: 55, distance: 24 },
    defaultMotion: "lively",
    dividers: ["wave", "curve", "arch"],
    emphasis: "highlight",
    button: "soft",
    card: "raised",
    mask: "blob",
    glyph: "spark",
    tilt: [-3, 3],
    density: "dense",
    container: 1200,
    ornament: 1.4,
    baseMood: { light: 0.55, tinted: 0.45, dark: 0 },
    signature: [
      { name: "sunshine & cobalt", accent: "#ffc21f", pop: "#2f55eb" },
      { name: "bubblegum & mint", accent: "#ff6fae", pop: "#3fd3a3" },
      { name: "aqua & bubblegum", accent: "#00bdbe", pop: "#ff99c2" },
      { name: "lime & sky", accent: "#b0eb52", pop: "#46a6ef" },
    ],
    colorMoments: ["pop", "accent", "dark"],
    preferredVariants: {
      announcement: ["ticker"],
      header: ["minimal"],
      hero: ["poster", "scrapbook", "stage", "split"],
      trustBar: ["chips", "stamps", "ribbon"],
      marquee: ["tape", "double"],
      reviews: ["notes", "wall"],
      socialProof: ["ugc", "whatsapp", "counter"],
      stats: ["big-numbers", "rings"],
      beforeAfter: ["slider", "cards"],
      problem: ["chat", "split"],
      benefits: ["bento", "stack", "icons"],
      showcase: ["exploded", "hotspots"],
      steps: ["cards", "illustrated"],
      story: ["image-text"],
      gallery: ["masonry", "filmstrip"],
      video: ["phone", "framed"],
      comparison: ["versus", "checklist"],
      specs: ["accordion", "tabs"],
      offer: ["stacked", "tickets"],
      urgency: ["stock", "countdown"],
      guarantee: ["split", "seal"],
      orderForm: ["bold", "card"],
      cta: ["stamp", "poster", "banner"],
      faq: ["chat", "accordion"],
      footer: ["big", "simple"],
      stickyCta: ["bar", "pill"],
      whatsappFloat: ["bubble"],
    },
  }),

  kinetic: def({
    id: "kinetic",
    label: "Kinetic",
    description:
      "Sport-tech: dark field, one electric accent with a soft glow, condensed bold uppercase, clean gradient speed lines, fast expo-out motion and velocity marquees.",
    harmony: "contrast-neon",
    fonts: [
      { id: "stadium", note: "Big Shoulders Display extra-bold uppercase over Archivo with mono split times; Changa for athletic Arabic.", display: "big-shoulders-display", body: "archivo", accent: "jetbrains-mono", displayAr: "changa", bodyAr: "noto-kufi-arabic", displayWeight: 800, displayWeightAr: 700 },
      { id: "velocity", note: "Archivo extra-bold, tightly set — a performance grotesk; Noto Kufi Arabic heavy over Readex Pro.", display: "archivo", body: "archivo", accent: "ibm-plex-mono", displayAr: "noto-kufi-arabic", bodyAr: "readex-pro", displayWeight: 800, displayWeightAr: 800 },
      { id: "track", note: "Big Shoulders black with Figtree; Alexandria heavy for Arabic.", display: "big-shoulders-display", body: "figtree", accent: "jetbrains-mono", displayAr: "alexandria", bodyAr: "tajawal", displayWeight: 900, displayWeightAr: 800 },
    ],
    display: { case: "uppercase", tracking: 0, lineHeight: 0.9 },
    bodyLineHeight: 1.55,
    typeRatio: [1.28, 1.6],
    labels: { case: "uppercase", tracking: 0.1 },
    radius: { kind: "subtle", scale: [6, 8, 12, 14, 16], btn: 999, media: 16, panel: 24 },
    borderWidth: 1,
    lineStrength: 0.3,
    shadow: "glow",
    texture: { kind: "grain", opacity: 0.024 },
    glass: { blur: 16, saturate: 1.25, alpha: 0.6 },
    surfaces: { kind: "flush", alt: 0.15 },
    motion: { ease: EASE.inOut, easeOut: EASE.expoOut, spring: "soft", dur: [160, 260, 380], stagger: 40, distance: 28 },
    defaultMotion: "lively",
    dividers: ["diagonal", "steps", "fade"],
    emphasis: "color",
    button: "glow",
    card: "flat",
    mask: "rounded",
    glyph: "diamond",
    tilt: [-2, 2],
    density: "dense",
    container: 1240,
    ornament: 1,
    baseMood: { light: 0.35, tinted: 0.05, dark: 0.6 },
    signature: [
      { name: "volt & crimson", accent: "#d4ff3a", pop: "#da2848" },
      { name: "electric cyan & volt", accent: "#00c8e2", pop: "#d6ff3c" },
      { name: "racing crimson & ice", accent: "#c91f3a", pop: "#cfe6ff" },
      { name: "electric blue & volt", accent: "#1f55ff", pop: "#d6ff3c" },
    ],
    colorMoments: ["dark", "accent", "pop"],
    preferredVariants: {
      announcement: ["ticker", "split"],
      header: ["minimal"],
      hero: ["poster", "spec", "split"],
      trustBar: ["ribbon", "chips"],
      marquee: ["tape", "outline", "double"],
      reviews: ["wall", "carousel"],
      socialProof: ["ugc", "counter", "whatsapp"],
      stats: ["big-numbers", "ticker"],
      beforeAfter: ["slider", "timeline"],
      problem: ["split", "crossed"],
      benefits: ["stack", "bento"],
      showcase: ["hotspots", "dimensions"],
      steps: ["cards", "strip"],
      story: ["manifesto", "image-text"],
      gallery: ["filmstrip", "carousel"],
      video: ["fullbleed", "phone"],
      comparison: ["versus", "table"],
      specs: ["tabs", "accordion"],
      offer: ["stacked", "shelf"],
      urgency: ["countdown", "stock", "banner"],
      guarantee: ["split", "seal"],
      orderForm: ["bold", "card"],
      cta: ["poster", "banner"],
      faq: ["accordion"],
      footer: ["big"],
      stickyCta: ["bar"],
      whatsappFloat: ["bubble"],
    },
  }),

  circuit: def({
    id: "circuit",
    label: "Circuit",
    description:
      "Precision tech (Apple / Nothing): black or white, a fine dot grid, mono spec labels, layered glass, thin lines and numbers that tick up.",
    harmony: "cool-precise",
    fonts: [
      { id: "spec-sheet", note: "Schibsted Grotesk throughout with JetBrains Mono readouts; Alexandria over IBM Plex Sans Arabic.", display: "schibsted-grotesk", body: "schibsted-grotesk", accent: "jetbrains-mono", displayAr: "alexandria", bodyAr: "ibm-plex-sans-arabic", displayWeight: 600, displayWeightAr: 600 },
      { id: "firmware", note: "Instrument Sans semibold with mono readouts; Readex Pro for Arabic.", display: "instrument-sans", body: "instrument-sans", accent: "jetbrains-mono", displayAr: "readex-pro", bodyAr: "ibm-plex-sans-arabic", displayWeight: 600, displayWeightAr: 600 },
      { id: "silicon", note: "Hanken Grotesk semibold, tight, with IBM Plex Mono annotations; Alexandria over Readex Pro.", display: "hanken-grotesk", body: "hanken-grotesk", accent: "ibm-plex-mono", displayAr: "alexandria", bodyAr: "readex-pro", displayWeight: 600, displayWeightAr: 500 },
    ],
    display: { case: "none", tracking: -0.04, lineHeight: 1 },
    bodyLineHeight: 1.58,
    typeRatio: [1.22, 1.42],
    labels: { case: "uppercase", tracking: 0.08 },
    radius: { kind: "soft", scale: [8, 12, 16, 22, 28], btn: 999, media: 28, panel: 36 },
    borderWidth: 1,
    lineStrength: 0.2,
    shadow: "soft",
    texture: { kind: "none", opacity: 0 },
    glass: { blur: 24, saturate: 1.3, alpha: 0.6 },
    surfaces: { kind: "panels", alt: 0.15 },
    motion: { ease: EASE.inOut, easeOut: EASE.expoOut, spring: "gentle", dur: [200, 380, 560], stagger: 45, distance: 14 },
    defaultMotion: "lively",
    dividers: ["steps", "fade", "diagonal"],
    emphasis: "color",
    button: "pill",
    card: "glass",
    mask: "rounded",
    glyph: "dot",
    tilt: [0, 0],
    density: "balanced",
    container: 1200,
    ornament: 0.8,
    baseMood: { light: 0.45, tinted: 0.1, dark: 0.45 },
    signature: [
      { name: "electric blue & acid lime", accent: "#2f5bff", pop: "#c6f23c" },
      { name: "cyan & acid lime", accent: "#0a8fb0", pop: "#c6f23c" },
      { name: "acid lime & electric blue", accent: "#b9f03c", pop: "#3a66ff" },
    ],
    colorMoments: ["dark", "accent", "pop"],
    preferredVariants: {
      announcement: ["split", "static"],
      header: ["minimal"],
      hero: ["spec", "stage", "split"],
      trustBar: ["chips", "ledger"],
      marquee: ["outline"],
      reviews: ["summary", "wall"],
      socialProof: ["counter", "whatsapp"],
      stats: ["big-numbers", "rings"],
      beforeAfter: ["slider"],
      problem: ["split", "crossed"],
      benefits: ["bento", "stack", "numbered"],
      showcase: ["hotspots", "exploded", "dimensions"],
      steps: ["strip", "timeline"],
      story: ["manifesto", "image-text"],
      gallery: ["filmstrip", "carousel"],
      video: ["fullbleed", "framed"],
      comparison: ["table", "checklist"],
      specs: ["tabs", "sheet"],
      offer: ["stacked", "shelf"],
      urgency: ["countdown", "banner"],
      guarantee: ["split", "seal"],
      orderForm: ["split", "card"],
      cta: ["banner", "poster"],
      faq: ["two-col", "accordion"],
      footer: ["simple", "big"],
      stickyCta: ["bar"],
      whatsappFloat: ["bubble"],
    },
  }),

  hearth: def({
    id: "hearth",
    label: "Hearth",
    description:
      "Soft home: warm creams with butter, berry, olive or sage, pillowy rounded shapes, generous soft shadows and friendly, gentle lifts.",
    harmony: "warm-butter",
    fonts: [
      { id: "kitchen", note: "Young Serif — a warm, chunky contemporary serif — with DM Sans; El Messiri over Tajawal.", display: "young-serif", body: "dm-sans", displayAr: "el-messiri", bodyAr: "tajawal", displayWeight: 400, displayWeightAr: 600 },
      { id: "pantry", note: "Fraunces semibold — soft and round — with Figtree; Reem Kufi over Tajawal.", display: "fraunces", body: "figtree", displayAr: "reem-kufi", bodyAr: "tajawal", displayWeight: 600, displayWeightAr: 600 },
      { id: "sunday", note: "Bricolage Grotesque semibold, friendly and modern, with DM Sans; Alexandria over Readex Pro.", display: "bricolage-grotesque", body: "dm-sans", displayAr: "alexandria", bodyAr: "readex-pro", displayWeight: 600, displayWeightAr: 600 },
    ],
    display: { case: "none", tracking: -0.02, lineHeight: 1.04 },
    bodyLineHeight: 1.6,
    typeRatio: [1.2, 1.38],
    labels: { case: "uppercase", tracking: 0.08 },
    radius: { kind: "round", scale: [10, 16, 24, 28, 32], btn: 999, media: 32, panel: 40 },
    borderWidth: 1,
    lineStrength: 0.2,
    shadow: "soft",
    texture: { kind: "none", opacity: 0 },
    glass: { blur: 18, saturate: 1.2, alpha: 0.66 },
    surfaces: { kind: "panels", alt: 0.35 },
    motion: { ease: EASE.inOutSoft, easeOut: EASE.quartOut, spring: "soft", dur: [240, 450, 640], stagger: 60, distance: 18 },
    defaultMotion: "lively",
    dividers: ["curve", "wave", "arch"],
    emphasis: "swoosh",
    button: "soft",
    card: "soft",
    mask: "circle",
    glyph: "dot",
    tilt: [-2, 2],
    density: "balanced",
    container: 1160,
    ornament: 1.1,
    baseMood: { light: 0.4, tinted: 0.6, dark: 0 },
    signature: [
      { name: "berry & butter", accent: "#b42f52", pop: "#f5d77b" },
      { name: "olive & raspberry", accent: "#6b7a2c", pop: "#d25577" },
      { name: "cornflower & butter", accent: "#4a6fd0", pop: "#f4d57a" },
    ],
    colorMoments: ["accent", "pop", "dark"],
    preferredVariants: {
      announcement: ["ticker", "static"],
      header: ["minimal", "centered"],
      hero: ["stage", "scrapbook", "split"],
      trustBar: ["chips", "stamps"],
      marquee: ["tape", "double"],
      reviews: ["wall", "notes"],
      socialProof: ["whatsapp", "counter"],
      stats: ["big-numbers", "rings"],
      beforeAfter: ["slider", "cards"],
      problem: ["chat", "crossed"],
      benefits: ["zigzag", "bento", "icons"],
      showcase: ["hotspots", "exploded"],
      steps: ["illustrated", "cards"],
      story: ["image-text", "letter"],
      gallery: ["masonry", "carousel"],
      video: ["framed", "phone"],
      comparison: ["table", "versus"],
      specs: ["accordion", "label"],
      offer: ["stacked", "tickets"],
      urgency: ["banner", "countdown"],
      guarantee: ["split", "letter"],
      orderForm: ["card"],
      cta: ["banner", "stamp"],
      faq: ["accordion", "chat"],
      footer: ["simple"],
      stickyCta: ["bar"],
      whatsappFloat: ["bubble"],
    },
  }),

  bloom: def({
    id: "bloom",
    label: "Bloom",
    description:
      "Beauty glow: blush, nude and berry, glossy highlights, soft gradient light and glow halos, elegant serif with its italic, pill and soft-blob shapes, blur-in reveals.",
    harmony: "blush-berry",
    fonts: [
      { id: "petal", note: "Instrument Serif with its italic for emphasis, Hanken text; El Messiri over Tajawal.", display: "instrument-serif", body: "hanken-grotesk", displayAr: "el-messiri", bodyAr: "tajawal", displayWeight: 400, displayWeightAr: 600 },
      { id: "gloss", note: "Fraunces light at display size — soft, glossy curves — with Figtree; Reem Kufi over Tajawal.", display: "fraunces", body: "figtree", displayAr: "reem-kufi", bodyAr: "tajawal", displayWeight: 300, displayWeightAr: 500 },
      { id: "cover", note: "Bodoni Moda — beauty-cover contrast — with DM Sans; El Messiri over Readex Pro.", display: "bodoni-moda", body: "dm-sans", displayAr: "el-messiri", bodyAr: "readex-pro", displayWeight: 500, displayWeightAr: 500 },
    ],
    display: { case: "none", tracking: -0.025, lineHeight: 0.98 },
    bodyLineHeight: 1.6,
    typeRatio: [1.25, 1.48],
    labels: { case: "uppercase", tracking: 0.16 },
    radius: { kind: "round", scale: [12, 18, 24, 32, 40], btn: 999, media: 36, panel: 44 },
    borderWidth: 1,
    lineStrength: 0.14,
    shadow: "glow",
    texture: { kind: "grain", opacity: 0.02 },
    glass: { blur: 22, saturate: 1.25, alpha: 0.6 },
    surfaces: { kind: "panels", alt: 0.2 },
    motion: { ease: EASE.inOutSoft, easeOut: EASE.quintOut, spring: "soft", dur: [300, 550, 800], stagger: 70, distance: 18 },
    defaultMotion: "lively",
    dividers: ["wave", "curve", "fade"],
    emphasis: "italic",
    button: "glow",
    card: "raised",
    mask: "pill",
    glyph: "spark",
    tilt: [-1.5, 1.5],
    density: "airy",
    container: 1160,
    ornament: 1,
    baseMood: { light: 0.45, tinted: 0.55, dark: 0 },
    signature: [
      { name: "berry & petal", accent: "#b0285a", pop: "#f5c8d0" },
      { name: "rose & champagne", accent: "#d4566d", pop: "#e6d6b3" },
      { name: "cherry & blush", accent: "#c11f3b", pop: "#f9d4da" },
    ],
    colorMoments: ["accent", "pop", "dark"],
    preferredVariants: {
      announcement: ["ticker", "static"],
      header: ["centered", "minimal"],
      hero: ["stage", "editorial", "split"],
      trustBar: ["chips"],
      marquee: ["double", "outline"],
      reviews: ["carousel", "notes", "wall"],
      socialProof: ["ugc", "whatsapp"],
      stats: ["rings", "big-numbers"],
      beforeAfter: ["slider", "cards"],
      problem: ["chat", "quote"],
      benefits: ["zigzag", "bento", "stack"],
      showcase: ["hotspots", "exploded", "ingredients"],
      steps: ["illustrated", "timeline"],
      story: ["image-text", "manifesto"],
      gallery: ["lookbook", "filmstrip", "carousel"],
      video: ["phone", "framed"],
      comparison: ["table", "checklist"],
      specs: ["tabs", "accordion"],
      offer: ["shelf", "stacked"],
      urgency: ["countdown", "banner"],
      guarantee: ["split", "seal"],
      orderForm: ["card", "split"],
      cta: ["poster", "banner", "stamp"],
      faq: ["accordion", "chat"],
      footer: ["simple", "big"],
      stickyCta: ["pill", "bar"],
      whatsappFloat: ["bubble"],
    },
  }),

  field: def({
    id: "field",
    label: "Field",
    description:
      "Fresh organic: greens and sun tones, natural light gradients, generous rounded media, minimal leaf line icons and organic grow-in motion.",
    harmony: "clay-sage",
    fonts: [
      { id: "harvest", note: "Young Serif + Figtree — fresh and friendly; Reem Kufi over Readex Pro.", display: "young-serif", body: "figtree", displayAr: "reem-kufi", bodyAr: "readex-pro", displayWeight: 400, displayWeightAr: 600 },
      { id: "herbarium", note: "Fraunces medium over Instrument Sans with mono origin labels — a modern botanical plate; El Messiri over Readex Pro.", display: "fraunces", body: "instrument-sans", accent: "ibm-plex-mono", displayAr: "el-messiri", bodyAr: "readex-pro", displayWeight: 500, displayWeightAr: 600 },
      { id: "fresh", note: "Bricolage Grotesque semibold with Figtree — a contemporary grocer; Alexandria over Tajawal.", display: "bricolage-grotesque", body: "figtree", displayAr: "alexandria", bodyAr: "tajawal", displayWeight: 600, displayWeightAr: 600 },
    ],
    display: { case: "none", tracking: -0.02, lineHeight: 1.04 },
    bodyLineHeight: 1.62,
    typeRatio: [1.2, 1.38],
    labels: { case: "uppercase", tracking: 0.1 },
    radius: { kind: "soft", scale: [8, 12, 18, 22, 28], btn: 999, media: 28, panel: 32 },
    borderWidth: 1,
    lineStrength: 0.2,
    shadow: "soft",
    texture: { kind: "none", opacity: 0 },
    glass: { blur: 18, saturate: 1.2, alpha: 0.64 },
    surfaces: { kind: "panels", alt: 0.35 },
    motion: { ease: EASE.inOutSoft, easeOut: EASE.quintOut, spring: "soft", dur: [300, 600, 820], stagger: 80, distance: 18 },
    defaultMotion: "lively",
    dividers: ["wave", "curve", "arch"],
    emphasis: "swoosh",
    button: "pill",
    card: "soft",
    mask: "rounded",
    glyph: "dot",
    tilt: [-1.5, 1.5],
    density: "balanced",
    container: 1160,
    ornament: 1,
    baseMood: { light: 0.4, tinted: 0.6, dark: 0 },
    signature: [
      { name: "leaf & sun", accent: "#4d7c39", pop: "#e9b948" },
      { name: "moss & rose clay", accent: "#5d6a2b", pop: "#d29095" },
      { name: "honey gold & leaf", accent: "#b38c15", pop: "#5b8a4a" },
    ],
    colorMoments: ["accent", "dark", "pop"],
    preferredVariants: {
      announcement: ["ticker", "static"],
      header: ["minimal", "centered"],
      hero: ["stage", "editorial", "split"],
      trustBar: ["chips", "stamps"],
      marquee: ["tape", "outline"],
      reviews: ["wall", "summary"],
      socialProof: ["whatsapp", "counter"],
      stats: ["big-numbers", "rings"],
      beforeAfter: ["cards", "slider"],
      problem: ["crossed", "split"],
      benefits: ["numbered", "zigzag", "bento"],
      showcase: ["ingredients", "exploded"],
      steps: ["illustrated", "timeline"],
      story: ["image-text", "letter"],
      gallery: ["masonry", "carousel"],
      video: ["framed"],
      comparison: ["checklist", "table"],
      specs: ["label", "sheet"],
      offer: ["stacked", "tickets"],
      urgency: ["banner", "stock"],
      guarantee: ["seal", "letter"],
      orderForm: ["card"],
      cta: ["banner", "poster"],
      faq: ["accordion"],
      footer: ["simple"],
      stickyCta: ["bar"],
      whatsappFloat: ["bubble"],
    },
  }),

  editorial: def({
    id: "editorial",
    label: "Editorial",
    description:
      "Swiss editorial: strong grid, huge tight type, monochrome plus one accent, mono captions and index numbers, crisp rules, refined clip and mask reveals.",
    harmony: "ink-accent",
    fonts: [
      { id: "masthead", note: "Archivo extra-bold, tightly tracked, with Plex Mono captions; Noto Kufi Arabic over IBM Plex Sans Arabic.", display: "archivo", body: "archivo", accent: "ibm-plex-mono", displayAr: "noto-kufi-arabic", bodyAr: "ibm-plex-sans-arabic", displayWeight: 800, displayWeightAr: 800 },
      { id: "feuilleton", note: "Instrument Serif headlines with italic pull words over Instrument Sans, mono folios; El Messiri over IBM Plex Sans Arabic.", display: "instrument-serif", body: "instrument-sans", accent: "ibm-plex-mono", displayAr: "el-messiri", bodyAr: "ibm-plex-sans-arabic", displayWeight: 400, displayWeightAr: 700 },
      { id: "swiss", note: "Hanken Grotesk bold — neo-grotesk discipline — with JetBrains Mono captions; IBM Plex Sans Arabic throughout.", display: "hanken-grotesk", body: "hanken-grotesk", accent: "jetbrains-mono", displayAr: "ibm-plex-sans-arabic", bodyAr: "ibm-plex-sans-arabic", displayWeight: 700, displayWeightAr: 700 },
    ],
    display: { case: "none", tracking: -0.05, lineHeight: 0.92 },
    bodyLineHeight: 1.6,
    typeRatio: [1.28, 1.62],
    labels: { case: "uppercase", tracking: 0.1 },
    radius: { kind: "subtle", scale: [2, 4, 6, 8, 12], btn: 12, media: 6, panel: 12 },
    borderWidth: 1,
    lineStrength: 0.7,
    shadow: "none",
    texture: { kind: "none", opacity: 0 },
    glass: { blur: 12, saturate: 1.15, alpha: 0.78 },
    surfaces: { kind: "panels", alt: 0.3 },
    motion: { ease: EASE.editorial, easeOut: EASE.expoOut, spring: "gentle", dur: [240, 520, 760], stagger: 55, distance: 12 },
    defaultMotion: "calm",
    dividers: ["steps", "fade", "diagonal"],
    emphasis: "highlight",
    button: "underline",
    card: "flat",
    mask: "rounded",
    glyph: "none",
    tilt: [0, 0],
    density: "airy",
    container: 1280,
    ornament: 0.6,
    baseMood: { light: 0.8, tinted: 0.1, dark: 0.1 },
    signature: [
      { name: "signal crimson & highlighter", accent: "#cc243d", pop: "#f2ea5a" },
      { name: "cobalt & highlighter", accent: "#2343d6", pop: "#f2ea5a" },
      { name: "ink green & rose", accent: "#1d5b45", pop: "#ea90a1" },
    ],
    colorMoments: ["dark", "accent", "pop"],
    preferredVariants: {
      announcement: ["static", "split"],
      header: ["minimal", "centered"],
      hero: ["editorial", "split", "poster"],
      trustBar: ["ledger"],
      marquee: ["outline", "double"],
      reviews: ["carousel", "wall"],
      socialProof: ["counter", "ugc", "whatsapp"],
      stats: ["big-numbers"],
      beforeAfter: ["slider"],
      problem: ["quote", "crossed"],
      benefits: ["numbered", "bento"],
      showcase: ["dimensions", "hotspots"],
      steps: ["strip", "timeline"],
      story: ["manifesto", "image-text"],
      gallery: ["lookbook", "filmstrip"],
      video: ["fullbleed", "framed"],
      comparison: ["checklist", "table"],
      specs: ["sheet", "accordion"],
      offer: ["stacked", "tickets"],
      urgency: ["banner", "countdown"],
      guarantee: ["split", "letter"],
      orderForm: ["minimal", "split"],
      cta: ["poster", "banner"],
      faq: ["two-col", "accordion"],
      footer: ["big", "simple"],
      stickyCta: ["bar"],
      whatsappFloat: ["tab", "bubble"],
    },
  }),

  garage: def({
    id: "garage",
    label: "Garage",
    description:
      "Industrial modern: dark steel and graphite, one signal accent (acid yellow, signal green, crimson), bold condensed type, precise lines and a subtle metallic sheen — punchy, snappy motion.",
    harmony: "contrast-neon",
    fonts: [
      { id: "workshop", note: "Big Shoulders Display extra-bold over Archivo with mono part numbers; Noto Kufi Arabic heavy over Tajawal.", display: "big-shoulders-display", body: "archivo", accent: "jetbrains-mono", displayAr: "noto-kufi-arabic", bodyAr: "tajawal", displayWeight: 800, displayWeightAr: 800 },
      { id: "torque", note: "Archivo extra-bold uppercase with DM Sans and Plex Mono specs; Changa over Tajawal.", display: "archivo", body: "dm-sans", accent: "ibm-plex-mono", displayAr: "changa", bodyAr: "tajawal", displayWeight: 800, displayWeightAr: 700 },
      { id: "chrome", note: "Schibsted Grotesk black — machined and modern — with mono readouts; Alexandria heavy over Tajawal.", display: "schibsted-grotesk", body: "schibsted-grotesk", accent: "jetbrains-mono", displayAr: "alexandria", bodyAr: "tajawal", displayWeight: 800, displayWeightAr: 800 },
    ],
    display: { case: "uppercase", tracking: 0.005, lineHeight: 0.92 },
    bodyLineHeight: 1.55,
    typeRatio: [1.26, 1.55],
    labels: { case: "uppercase", tracking: 0.12 },
    radius: { kind: "subtle", scale: [4, 6, 10, 12, 16], btn: 12, media: 12, panel: 20 },
    borderWidth: 1,
    lineStrength: 0.4,
    shadow: "deep",
    texture: { kind: "grain", opacity: 0.026 },
    glass: { blur: 16, saturate: 1.2, alpha: 0.62 },
    surfaces: { kind: "flush", alt: 0.15 },
    motion: { ease: EASE.inOut, easeOut: EASE.expoOut, spring: "soft", dur: [150, 260, 400], stagger: 40, distance: 24 },
    defaultMotion: "lively",
    dividers: ["diagonal", "steps", "fade"],
    emphasis: "color",
    button: "solid",
    card: "outlined",
    mask: "rounded",
    glyph: "dot",
    tilt: [0, 0],
    density: "dense",
    container: 1240,
    ornament: 0.9,
    baseMood: { light: 0.25, tinted: 0.15, dark: 0.6 },
    signature: [
      { name: "signal yellow & graphite", accent: "#f5c518", pop: "#7fa6c8" },
      { name: "signal green & steel", accent: "#2eb45c", pop: "#9fb6cc" },
      { name: "racing crimson & steel", accent: "#c91f3a", pop: "#8fb0cc" },
      { name: "steel blue & acid yellow", accent: "#3977a8", pop: "#edee31" },
    ],
    colorMoments: ["dark", "pop", "accent"],
    preferredVariants: {
      announcement: ["ticker"],
      header: ["minimal"],
      hero: ["spec", "poster", "split"],
      trustBar: ["chips", "ledger", "ribbon"],
      marquee: ["tape", "outline"],
      reviews: ["wall", "summary"],
      socialProof: ["counter", "whatsapp"],
      stats: ["big-numbers", "ticker"],
      beforeAfter: ["slider", "cards"],
      problem: ["split", "crossed"],
      benefits: ["bento", "icons"],
      showcase: ["dimensions", "hotspots"],
      steps: ["cards", "timeline"],
      story: ["image-text", "manifesto"],
      gallery: ["filmstrip", "carousel"],
      video: ["fullbleed", "framed"],
      comparison: ["versus", "table"],
      specs: ["sheet", "tabs"],
      offer: ["stacked", "shelf"],
      urgency: ["stock", "countdown"],
      guarantee: ["split", "seal"],
      orderForm: ["bold", "card"],
      cta: ["poster", "banner"],
      faq: ["accordion"],
      footer: ["big", "simple"],
      stickyCta: ["bar"],
      whatsappFloat: ["bubble"],
    },
  }),
};

/** Pairing matching the spec's Latin fonts (display + body), if any. */
export function findPairing(d: ArchetypeDef, display: string, body: string): FontPairing | undefined {
  return d.fonts.find((p) => p.display === display && p.body === body) ?? d.fonts.find((p) => p.display === display);
}

/* ------------------------------------------------------------------ */
/* The pairing catalogue rows (design.md DES-§10.3, DES-§10.4)         */
/* ------------------------------------------------------------------ */

/**
 * The seven faces of the DES-R21 roster growth (DS60). They are pairing data before they are fonts: a catalogue row
 * that names one is skipped at load and reported as `pending_font` until the maintainer's `sync-fonts.mjs` manifest
 * carries it (src/lib/design/pairings.ts).
 */
export const PENDING_FONT_IDS = ["cairo", "kufam", "vazirmatn", "cormorant-garamond", "dm-serif-display", "syne", "manrope"] as const;
export type PendingFontId = (typeof PENDING_FONT_IDS)[number];
export type CatalogueFontId = KnownFontId | PendingFontId;

/** One row of the pairing catalogue: the legacy FontPairing shape over catalogue font ids, plus where else it fits. */
export interface CataloguePairing {
  id: string;
  /** one-sentence designer rationale (font picker, DNA card) */
  note: string;
  display: CatalogueFontId;
  body: CatalogueFontId;
  accent?: CatalogueFontId;
  displayAr: CatalogueFontId;
  bodyAr: CatalogueFontId;
  displayWeight: number;
  /** the Arabic display weight the engine emits, validated by the ink-density ratio (F15), never shifted at compile */
  displayWeightAr: number;
  /** archetypes that may borrow the pairing at prior weight 0.3 (DES-§10.3 "also fits") */
  alsoFits: readonly Archetype[];
}

type Row = Omit<CataloguePairing, "alsoFits"> & { alsoFits?: readonly Archetype[] };
const row = (r: Row): CataloguePairing => ({ ...r, alsoFits: r.alsoFits ?? [] });

/**
 * The DES-§10.3 additions (five per archetype), the three shipped-face rows that keep ≥ 8 pairings per archetype while
 * the DES-R21 faces are pending (`batch`, `trace`, `market`), and, below, the DES-§10.4 rows written for the R21
 * faces. Weights are Latin display / Arabic display. The legacy rows of `ARCHETYPE_DEFS[*].fonts` keep their ids and
 * values for old documents; the catalogue re-points the ones that break F11 / F14 (`CATALOGUE_REPOINTS`).
 */
export const PAIRING_ADDITIONS: Readonly<Record<Archetype, readonly CataloguePairing[]>> = {
  maison: [
    row({ id: "nocturne", note: "Bodoni Moda's hairlines over Instrument Sans, with a light Alexandria so the Arabic keeps the same quiet weight.", display: "bodoni-moda", displayWeight: 400, body: "instrument-sans", displayAr: "alexandria", displayWeightAr: 240, bodyAr: "ibm-plex-sans-arabic", alsoFits: ["editorial"] }),
    row({ id: "gallery", note: "Gloock's sharp wedges with Plex Mono catalogue numbers; El Messiri carries the same stroke contrast in Arabic.", display: "gloock", displayWeight: 400, body: "instrument-sans", accent: "ibm-plex-mono", displayAr: "el-messiri", displayWeightAr: 600, bodyAr: "noto-naskh-arabic", alsoFits: ["editorial", "bloom"] }),
    row({ id: "satin", note: "Fraunces at its lightest optical size reads like satin; a light Alexandria matches its soft colour in Arabic.", display: "fraunces", displayWeight: 300, body: "hanken-grotesk", displayAr: "alexandria", displayWeightAr: 230, bodyAr: "ibm-plex-sans-arabic", alsoFits: ["bloom"] }),
    row({ id: "monolith", note: "One slim Instrument Serif line over Schibsted Grotesk, set large and alone; a light Readex Pro keeps the Arabic plain.", display: "instrument-serif", displayWeight: 400, body: "schibsted-grotesk", displayAr: "readex-pro", displayWeightAr: 320, bodyAr: "ibm-plex-sans-arabic", alsoFits: ["apothecary"] }),
    row({ id: "prive", note: "Bodoni Moda medium with a firm Schibsted body; a light Noto Kufi Arabic sets a crisp geometric line beside the Didone.", display: "bodoni-moda", displayWeight: 500, body: "schibsted-grotesk", displayAr: "noto-kufi-arabic", displayWeightAr: 280, bodyAr: "tajawal" }),
  ],
  apothecary: [
    row({ id: "clinic", note: "Schibsted Grotesk semibold with JetBrains Mono doses; Vazirmatn gives the Arabic a plain, clinical weight.", display: "schibsted-grotesk", displayWeight: 600, body: "schibsted-grotesk", accent: "jetbrains-mono", displayAr: "vazirmatn", displayWeightAr: 600, bodyAr: "ibm-plex-sans-arabic", alsoFits: ["circuit"] }),
    row({ id: "ritual", note: "Instrument Serif over Figtree for a calm daily routine; a light Alexandria keeps the Arabic as quiet.", display: "instrument-serif", displayWeight: 400, body: "figtree", displayAr: "alexandria", displayWeightAr: 300, bodyAr: "readex-pro", alsoFits: ["bloom", "field"] }),
    row({ id: "assay", note: "DM Sans semibold with Plex Mono assay labels, a lab sheet set in one family; Alexandria semibold in Arabic.", display: "dm-sans", displayWeight: 600, body: "dm-sans", accent: "ibm-plex-mono", displayAr: "alexandria", displayWeightAr: 600, bodyAr: "tajawal", alsoFits: ["circuit"] }),
    row({ id: "botanica", note: "Fraunces regular for the plant, Hanken for the facts and JetBrains Mono for the batch; a light Readex Pro in Arabic.", display: "fraunces", displayWeight: 400, body: "hanken-grotesk", accent: "jetbrains-mono", displayAr: "readex-pro", displayWeightAr: 310, bodyAr: "ibm-plex-sans-arabic", alsoFits: ["field"] }),
    row({ id: "serum", note: "Bodoni Moda over Instrument Sans with Plex Mono concentrations, a serum label; a light Alexandria keeps the Arabic as fine.", display: "bodoni-moda", displayWeight: 400, body: "instrument-sans", accent: "ibm-plex-mono", displayAr: "alexandria", displayWeightAr: 240, bodyAr: "ibm-plex-sans-arabic", alsoFits: ["maison"] }),
    row({ id: "batch", note: "Hanken Grotesk semibold over DM Sans with Plex Mono batch codes; Tajawal bold keeps the Arabic headline crisp and geometric.", display: "hanken-grotesk", displayWeight: 600, body: "dm-sans", accent: "ibm-plex-mono", displayAr: "tajawal", displayWeightAr: 700, bodyAr: "ibm-plex-sans-arabic", alsoFits: ["circuit"] }),
  ],
  souk: [
    row({ id: "majorelle", note: "Bricolage Grotesque semibold with Figtree, Reem Kufi only for small labels; Noto Kufi Arabic carries the headline.", display: "bricolage-grotesque", displayWeight: 600, body: "figtree", accent: "reem-kufi", displayAr: "noto-kufi-arabic", displayWeightAr: 600, bodyAr: "tajawal", alsoFits: ["playground"] }),
    row({ id: "dar", note: "Young Serif's warm round serif over DM Sans; El Messiri semibold matches its contrast in Arabic.", display: "young-serif", displayWeight: 400, body: "dm-sans", displayAr: "el-messiri", displayWeightAr: 600, bodyAr: "readex-pro", alsoFits: ["hearth"] }),
    row({ id: "kasbah", note: "Archivo bold, wide and sturdy, with Figtree; Changa's condensed bold gives the Arabic the same compact force.", display: "archivo", displayWeight: 700, body: "figtree", displayAr: "changa", displayWeightAr: 700, bodyAr: "tajawal", alsoFits: ["garage"] }),
    row({ id: "sahara", note: "Instrument Serif over Hanken with an open measure; a light Alexandria keeps the Arabic even.", display: "instrument-serif", displayWeight: 400, body: "hanken-grotesk", displayAr: "alexandria", displayWeightAr: 300, bodyAr: "ibm-plex-sans-arabic", alsoFits: ["field"] }),
    row({ id: "agadir", note: "Fraunces medium with Instrument Sans; Readex Pro over Noto Naskh for a modern, readable Arabic page.", display: "fraunces", displayWeight: 500, body: "instrument-sans", displayAr: "readex-pro", displayWeightAr: 370, bodyAr: "noto-naskh-arabic" }),
  ],
  playground: [
    row({ id: "pop", note: "Bricolage Grotesque extra-bold with Figtree; Baloo Bhaijaan 2 bold is round and friendly in Arabic.", display: "bricolage-grotesque", displayWeight: 800, body: "figtree", displayAr: "baloo-bhaijaan-2", displayWeightAr: 760, bodyAr: "tajawal" }),
    row({ id: "jelly", note: "Young Serif's soft chunky serif over DM Sans; Baloo Bhaijaan 2 semibold keeps the same bounce in Arabic.", display: "young-serif", displayWeight: 400, body: "dm-sans", displayAr: "baloo-bhaijaan-2", displayWeightAr: 600, bodyAr: "readex-pro", alsoFits: ["hearth"] }),
    row({ id: "block", note: "Archivo extra-bold, set big and tight, with DM Sans; Lemonada bold rounds the Arabic without losing weight.", display: "archivo", displayWeight: 800, body: "dm-sans", displayAr: "lemonada", displayWeightAr: 700, bodyAr: "tajawal" }),
    row({ id: "sprout", note: "Fraunces bold, soft and playful at display size, with Figtree; Marhey bold for a lively Arabic headline.", display: "fraunces", displayWeight: 700, body: "figtree", displayAr: "marhey", displayWeightAr: 700, bodyAr: "readex-pro" }),
    row({ id: "parade", note: "Big Shoulders Display extra-bold over Figtree; Changa bold, condensed like the Latin, in Arabic.", display: "big-shoulders-display", displayWeight: 800, body: "figtree", displayAr: "changa", displayWeightAr: 700, bodyAr: "tajawal", alsoFits: ["kinetic"] }),
  ],
  kinetic: [
    row({ id: "sprint", note: "Archivo black with Instrument Sans and JetBrains Mono split times; Changa extra-bold for athletic Arabic.", display: "archivo", displayWeight: 900, body: "instrument-sans", accent: "jetbrains-mono", displayAr: "changa", displayWeightAr: 800, bodyAr: "ibm-plex-sans-arabic", alsoFits: ["garage"] }),
    row({ id: "pulse", note: "Bricolage Grotesque extra-bold over Hanken; Noto Kufi Arabic extra-bold keeps the same square energy.", display: "bricolage-grotesque", displayWeight: 800, body: "hanken-grotesk", displayAr: "noto-kufi-arabic", displayWeightAr: 800, bodyAr: "readex-pro" }),
    row({ id: "lane", note: "Schibsted Grotesk extra-bold set tight with Plex Mono lap times; Alexandria bold in Arabic.", display: "schibsted-grotesk", displayWeight: 800, body: "schibsted-grotesk", accent: "ibm-plex-mono", displayAr: "alexandria", displayWeightAr: 700, bodyAr: "tajawal", alsoFits: ["circuit"] }),
    row({ id: "drive", note: "Big Shoulders Display black over DM Sans; Noto Kufi Arabic extra-bold matches its condensed weight.", display: "big-shoulders-display", displayWeight: 900, body: "dm-sans", displayAr: "noto-kufi-arabic", displayWeightAr: 880, bodyAr: "ibm-plex-sans-arabic", alsoFits: ["garage"] }),
    row({ id: "arena", note: "Hanken Grotesk extra-bold with Figtree and JetBrains Mono stats; Changa bold over Readex Pro in Arabic.", display: "hanken-grotesk", displayWeight: 800, body: "figtree", accent: "jetbrains-mono", displayAr: "changa", displayWeightAr: 700, bodyAr: "readex-pro" }),
  ],
  circuit: [
    row({ id: "kernel", note: "DM Sans semibold with JetBrains Mono readouts; Cairo semibold gives the Arabic a humanist, technical voice.", display: "dm-sans", displayWeight: 600, body: "dm-sans", accent: "jetbrains-mono", displayAr: "cairo", displayWeightAr: 600, bodyAr: "ibm-plex-sans-arabic", alsoFits: ["apothecary"] }),
    row({ id: "lumen", note: "Instrument Serif headlines over Instrument Sans with mono specs, a calm tech note; a light Alexandria in Arabic.", display: "instrument-serif", displayWeight: 400, body: "instrument-sans", accent: "jetbrains-mono", displayAr: "alexandria", displayWeightAr: 300, bodyAr: "ibm-plex-sans-arabic", alsoFits: ["maison"] }),
    row({ id: "array", note: "Archivo bold over Instrument Sans with Plex Mono part numbers; Noto Kufi Arabic bold in Arabic.", display: "archivo", displayWeight: 700, body: "instrument-sans", accent: "ibm-plex-mono", displayAr: "noto-kufi-arabic", displayWeightAr: 700, bodyAr: "readex-pro", alsoFits: ["garage"] }),
    row({ id: "orbit", note: "Bricolage Grotesque semibold with Hanken and JetBrains Mono; Readex Pro semibold over Tajawal in Arabic.", display: "bricolage-grotesque", displayWeight: 600, body: "hanken-grotesk", accent: "jetbrains-mono", displayAr: "readex-pro", displayWeightAr: 600, bodyAr: "tajawal" }),
    row({ id: "signal", note: "Schibsted Grotesk bold over Figtree with Plex Mono signals; Changa semibold keeps the Arabic compact.", display: "schibsted-grotesk", displayWeight: 700, body: "figtree", accent: "ibm-plex-mono", displayAr: "changa", displayWeightAr: 600, bodyAr: "ibm-plex-sans-arabic" }),
    row({ id: "trace", note: "Archivo semibold with Instrument Sans and JetBrains Mono traces; Tajawal bold for a clean geometric Arabic headline.", display: "archivo", displayWeight: 600, body: "instrument-sans", accent: "jetbrains-mono", displayAr: "tajawal", displayWeightAr: 700, bodyAr: "readex-pro" }),
  ],
  hearth: [
    row({ id: "terrace", note: "Fraunces medium over DM Sans, warm and generous; Alexandria over Tajawal in Arabic.", display: "fraunces", displayWeight: 500, body: "dm-sans", displayAr: "alexandria", displayWeightAr: 340, bodyAr: "tajawal", alsoFits: ["field"] }),
    row({ id: "loft", note: "Instrument Serif over Figtree for a slower kitchen story; a light Noto Kufi Arabic for the Arabic headline.", display: "instrument-serif", displayWeight: 400, body: "figtree", displayAr: "noto-kufi-arabic", displayWeightAr: 350, bodyAr: "readex-pro", alsoFits: ["bloom"] }),
    row({ id: "brunch", note: "Bricolage Grotesque semibold with Figtree; Marhey bold brings a playful Arabic.", display: "bricolage-grotesque", displayWeight: 580, body: "figtree", displayAr: "marhey", displayWeightAr: 700, bodyAr: "tajawal", alsoFits: ["playground"] }),
    row({ id: "ceramic", note: "Gloock's chiselled serif over Hanken; Alexandria keeps the Arabic plain beside it.", display: "gloock", displayWeight: 400, body: "hanken-grotesk", displayAr: "alexandria", displayWeightAr: 440, bodyAr: "ibm-plex-sans-arabic" }),
    row({ id: "nest", note: "Young Serif over Instrument Sans, soft and homely; Baloo Bhaijaan 2 semibold in Arabic.", display: "young-serif", displayWeight: 400, body: "instrument-sans", displayAr: "baloo-bhaijaan-2", displayWeightAr: 600, bodyAr: "readex-pro", alsoFits: ["playground"] }),
  ],
  bloom: [
    row({ id: "rosewater", note: "Bodoni Moda over Figtree, a beauty cover; a light Noto Kufi Arabic answers its fine hairlines in Arabic.", display: "bodoni-moda", displayWeight: 400, body: "figtree", displayAr: "noto-kufi-arabic", displayWeightAr: 240, bodyAr: "readex-pro", alsoFits: ["maison"] }),
    row({ id: "peony", note: "Fraunces regular over DM Sans with Reem Kufi labels; a light Readex Pro for the Arabic headline.", display: "fraunces", displayWeight: 400, body: "dm-sans", accent: "reem-kufi", displayAr: "readex-pro", displayWeightAr: 310, bodyAr: "ibm-plex-sans-arabic" }),
    row({ id: "dew", note: "Instrument Serif over Instrument Sans, fresh and light; a light Alexandria over Tajawal in Arabic.", display: "instrument-serif", displayWeight: 400, body: "instrument-sans", displayAr: "alexandria", displayWeightAr: 300, bodyAr: "tajawal", alsoFits: ["apothecary"] }),
    row({ id: "blossom", note: "Young Serif over Hanken with Lemonada semibold, rounded and cheerful in Arabic.", display: "young-serif", displayWeight: 400, body: "hanken-grotesk", displayAr: "lemonada", displayWeightAr: 600, bodyAr: "tajawal", alsoFits: ["playground"] }),
    row({ id: "silk", note: "Gloock over Figtree; El Messiri semibold over Noto Naskh for a refined Arabic page.", display: "gloock", displayWeight: 400, body: "figtree", displayAr: "el-messiri", displayWeightAr: 600, bodyAr: "noto-naskh-arabic", alsoFits: ["maison"] }),
  ],
  field: [
    row({ id: "meadow", note: "Instrument Serif over DM Sans, open and airy; a light Alexandria over Readex Pro in Arabic.", display: "instrument-serif", displayWeight: 400, body: "dm-sans", displayAr: "alexandria", displayWeightAr: 300, bodyAr: "readex-pro" }),
    row({ id: "terroir", note: "Gloock over Instrument Sans with Plex Mono origin labels; El Messiri semibold over Noto Naskh in Arabic.", display: "gloock", displayWeight: 400, body: "instrument-sans", accent: "ibm-plex-mono", displayAr: "el-messiri", displayWeightAr: 600, bodyAr: "noto-naskh-arabic", alsoFits: ["souk"] }),
    row({ id: "ridge", note: "Archivo bold over Figtree, sturdy and outdoor; Changa bold over Tajawal in Arabic.", display: "archivo", displayWeight: 700, body: "figtree", displayAr: "changa", displayWeightAr: 700, bodyAr: "tajawal", alsoFits: ["garage"] }),
    row({ id: "orchard", note: "Bricolage Grotesque semibold over Hanken; Cairo extra-bold gives the Arabic a warm, humanist sans.", display: "bricolage-grotesque", displayWeight: 600, body: "hanken-grotesk", displayAr: "cairo", displayWeightAr: 800, bodyAr: "ibm-plex-sans-arabic", alsoFits: ["hearth"] }),
    row({ id: "cedar", note: "Fraunces semibold over Schibsted Grotesk; Noto Kufi Arabic over Readex Pro in Arabic.", display: "fraunces", displayWeight: 600, body: "schibsted-grotesk", displayAr: "noto-kufi-arabic", displayWeightAr: 480, bodyAr: "readex-pro" }),
    row({ id: "market", note: "Young Serif over DM Sans, a friendly grocer's sign; Tajawal bold keeps the Arabic headline simple and sturdy.", display: "young-serif", displayWeight: 400, body: "dm-sans", displayAr: "tajawal", displayWeightAr: 700, bodyAr: "readex-pro", alsoFits: ["hearth"] }),
  ],
  editorial: [
    row({ id: "broadsheet", note: "Bodoni Moda over Instrument Sans with Plex Mono folios; a light Noto Kufi Arabic over Noto Naskh in Arabic.", display: "bodoni-moda", displayWeight: 400, body: "instrument-sans", accent: "ibm-plex-mono", displayAr: "noto-kufi-arabic", displayWeightAr: 240, bodyAr: "noto-naskh-arabic", alsoFits: ["maison"] }),
    row({ id: "column", note: "Fraunces regular over Schibsted Grotesk, a long-read column; a light Readex Pro in Arabic.", display: "fraunces", displayWeight: 400, body: "schibsted-grotesk", displayAr: "readex-pro", displayWeightAr: 310, bodyAr: "ibm-plex-sans-arabic" }),
    row({ id: "folio", note: "Gloock over DM Sans with JetBrains Mono page numbers; Noto Kufi Arabic semibold over Tajawal in Arabic.", display: "gloock", displayWeight: 400, body: "dm-sans", accent: "jetbrains-mono", displayAr: "noto-kufi-arabic", displayWeightAr: 600, bodyAr: "tajawal" }),
    row({ id: "index", note: "Schibsted Grotesk extra-bold with Instrument Serif only for the italic emphasis word; Alexandria bold in Arabic.", display: "schibsted-grotesk", displayWeight: 800, body: "schibsted-grotesk", accent: "instrument-serif", displayAr: "alexandria", displayWeightAr: 700, bodyAr: "ibm-plex-sans-arabic", alsoFits: ["circuit"] }),
    row({ id: "runway", note: "Big Shoulders Display extra-bold over Hanken, a fashion headline; Changa bold over Readex Pro in Arabic.", display: "big-shoulders-display", displayWeight: 800, body: "hanken-grotesk", displayAr: "changa", displayWeightAr: 700, bodyAr: "readex-pro", alsoFits: ["kinetic"] }),
  ],
  garage: [
    row({ id: "piston", note: "Archivo black over Hanken with JetBrains Mono part numbers; Changa extra-bold in Arabic.", display: "archivo", displayWeight: 900, body: "hanken-grotesk", accent: "jetbrains-mono", displayAr: "changa", displayWeightAr: 800, bodyAr: "ibm-plex-sans-arabic", alsoFits: ["kinetic"] }),
    row({ id: "alloy", note: "Schibsted Grotesk extra-bold over DM Sans with Plex Mono specs; Noto Kufi Arabic bold in Arabic.", display: "schibsted-grotesk", displayWeight: 800, body: "dm-sans", accent: "ibm-plex-mono", displayAr: "noto-kufi-arabic", displayWeightAr: 700, bodyAr: "readex-pro", alsoFits: ["circuit"] }),
    row({ id: "gauge", note: "Big Shoulders Display extra-bold over Instrument Sans with JetBrains Mono readings; Alexandria bold in Arabic.", display: "big-shoulders-display", displayWeight: 800, body: "instrument-sans", accent: "jetbrains-mono", displayAr: "alexandria", displayWeightAr: 700, bodyAr: "tajawal" }),
    row({ id: "carbon", note: "Hanken Grotesk extra-bold throughout with Plex Mono specs; Readex Pro bold over Tajawal in Arabic.", display: "hanken-grotesk", displayWeight: 800, body: "hanken-grotesk", accent: "ibm-plex-mono", displayAr: "readex-pro", displayWeightAr: 700, bodyAr: "tajawal", alsoFits: ["circuit"] }),
    row({ id: "rally", note: "Bricolage Grotesque extra-bold over Archivo; Changa bold over Tajawal in Arabic.", display: "bricolage-grotesque", displayWeight: 800, body: "archivo", displayAr: "changa", displayWeightAr: 700, bodyAr: "tajawal", alsoFits: ["kinetic"] }),
  ],
};

/**
 * The DES-§10.4 rows for the DES-R21 faces (Cairo, Kufam, Vazirmatn, Cormorant Garamond, DM Serif Display, Syne,
 * Manrope). Each names at least one pending face, so it enters the catalogue only once the manifest carries every face
 * it names; its ink-density ratio (F15) is measured then.
 */
export const R21_PAIRINGS: Readonly<Record<Archetype, readonly CataloguePairing[]>> = {
  maison: [
    row({ id: "velours", note: "Cormorant Garamond medium, an old-style serif that is neither Didone nor a 2025 default, over Hanken; an extra-light Alexandria in Arabic.", display: "cormorant-garamond", displayWeight: 500, body: "hanken-grotesk", displayAr: "alexandria", displayWeightAr: 230, bodyAr: "ibm-plex-sans-arabic", alsoFits: ["bloom"] }),
    row({ id: "noir", note: "DM Serif Display's high contrast over Instrument Sans; Cairo medium keeps the Arabic calm and legible beside it.", display: "dm-serif-display", displayWeight: 400, body: "instrument-sans", displayAr: "cairo", displayWeightAr: 500, bodyAr: "ibm-plex-sans-arabic", alsoFits: ["editorial"] }),
  ],
  apothecary: [
    row({ id: "tonic", note: "Manrope semibold over Instrument Sans with Plex Mono doses; Cairo semibold for a humanist, readable Arabic.", display: "manrope", displayWeight: 600, body: "instrument-sans", accent: "ibm-plex-mono", displayAr: "cairo", displayWeightAr: 600, bodyAr: "readex-pro", alsoFits: ["circuit"] }),
    row({ id: "vial", note: "Instrument Sans semibold with JetBrains Mono labels; Vazirmatn semibold keeps the Arabic plain and exact.", display: "instrument-sans", displayWeight: 600, body: "instrument-sans", accent: "jetbrains-mono", displayAr: "vazirmatn", displayWeightAr: 600, bodyAr: "ibm-plex-sans-arabic" }),
  ],
  souk: [
    row({ id: "sabra", note: "Bricolage Grotesque bold over DM Sans; Kufam bold brings an open, squared kufi to a modern Moroccan page.", display: "bricolage-grotesque", displayWeight: 700, body: "dm-sans", displayAr: "kufam", displayWeightAr: 700, bodyAr: "readex-pro" }),
  ],
  playground: [
    row({ id: "confetti", note: "Syne extra-bold, wide and graphic, over Figtree; Baloo Bhaijaan 2 bold keeps the Arabic round.", display: "syne", displayWeight: 800, body: "figtree", displayAr: "baloo-bhaijaan-2", displayWeightAr: 700, bodyAr: "tajawal" }),
    row({ id: "fizz", note: "Syne extra-bold over DM Sans; Vazirmatn black gives the Arabic a heavy, plain poster weight.", display: "syne", displayWeight: 800, body: "dm-sans", displayAr: "vazirmatn", displayWeightAr: 900, bodyAr: "readex-pro", alsoFits: ["kinetic"] }),
  ],
  kinetic: [
    row({ id: "relay", note: "Syne extra-bold, extended and fast, over Figtree; Kufam extra-bold matches its squared energy in Arabic.", display: "syne", displayWeight: 800, body: "figtree", displayAr: "kufam", displayWeightAr: 800, bodyAr: "tajawal" }),
  ],
  circuit: [
    row({ id: "lattice", note: "Manrope bold with JetBrains Mono readouts; Kufam semibold sets a precise, gridded Arabic.", display: "manrope", displayWeight: 700, body: "manrope", accent: "jetbrains-mono", displayAr: "kufam", displayWeightAr: 600, bodyAr: "ibm-plex-sans-arabic" }),
  ],
  hearth: [
    row({ id: "supper", note: "DM Serif Display over Figtree, a warm menu headline; Cairo semibold over Tajawal in Arabic.", display: "dm-serif-display", displayWeight: 400, body: "figtree", displayAr: "cairo", displayWeightAr: 600, bodyAr: "tajawal" }),
  ],
  bloom: [
    row({ id: "rosa", note: "Cormorant Garamond regular over Figtree, delicate and literary; an extra-light Readex Pro over Tajawal in Arabic.", display: "cormorant-garamond", displayWeight: 400, body: "figtree", displayAr: "readex-pro", displayWeightAr: 180, bodyAr: "tajawal" }),
    row({ id: "pollen", note: "Manrope medium, quiet and modern, over Figtree; Cairo medium over Tajawal in Arabic.", display: "manrope", displayWeight: 500, body: "figtree", displayAr: "cairo", displayWeightAr: 500, bodyAr: "tajawal" }),
  ],
  field: [
    row({ id: "grove", note: "Cormorant Garamond semibold over DM Sans with Plex Mono origins; a light Alexandria over Tajawal in Arabic.", display: "cormorant-garamond", displayWeight: 600, body: "dm-sans", accent: "ibm-plex-mono", displayAr: "alexandria", displayWeightAr: 250, bodyAr: "tajawal" }),
    row({ id: "acre", note: "Manrope bold over DM Sans, plain and outdoors; Readex Pro semibold over Tajawal in Arabic.", display: "manrope", displayWeight: 700, body: "dm-sans", displayAr: "readex-pro", displayWeightAr: 600, bodyAr: "tajawal" }),
  ],
  editorial: [
    row({ id: "gazette", note: "Cormorant Garamond medium over Instrument Sans, a literary page; an extra-light Noto Kufi Arabic over Noto Naskh in Arabic.", display: "cormorant-garamond", displayWeight: 500, body: "instrument-sans", displayAr: "noto-kufi-arabic", displayWeightAr: 220, bodyAr: "noto-naskh-arabic" }),
    row({ id: "dispatch", note: "DM Serif Display over Schibsted Grotesk with Plex Mono datelines; Vazirmatn bold for a firm Arabic headline.", display: "dm-serif-display", displayWeight: 400, body: "schibsted-grotesk", accent: "ibm-plex-mono", displayAr: "vazirmatn", displayWeightAr: 700, bodyAr: "ibm-plex-sans-arabic" }),
    row({ id: "broadside", note: "Cormorant Garamond semibold over Schibsted Grotesk with JetBrains Mono notes; a light Noto Kufi Arabic in Arabic (Kufam has no weight light enough for F15).", display: "cormorant-garamond", displayWeight: 600, body: "schibsted-grotesk", accent: "jetbrains-mono", displayAr: "noto-kufi-arabic", displayWeightAr: 260, bodyAr: "ibm-plex-sans-arabic" }),
  ],
  garage: [
    row({ id: "forge", note: "Syne bold over DM Sans with Plex Mono part numbers; Vazirmatn extra-bold, heavy without Changa's condensation.", display: "syne", displayWeight: 700, body: "dm-sans", accent: "ibm-plex-mono", displayAr: "vazirmatn", displayWeightAr: 800, bodyAr: "tajawal", alsoFits: ["kinetic"] }),
    row({ id: "rivet", note: "Archivo extra-bold over Hanken with JetBrains Mono specs; Kufam bold, squared like a machined plate, in Arabic.", display: "archivo", displayWeight: 800, body: "hanken-grotesk", accent: "jetbrains-mono", displayAr: "kufam", displayWeightAr: 700, bodyAr: "readex-pro", alsoFits: ["circuit"] }),
  ],
};

/**
 * Legacy rows the catalogue re-points or re-tunes: an old document keeps the fonts and weights in its own
 * `ThemeSpec.fonts` and archetype row, so nothing live changes; a new generation gets these values.
 *  - Reem Kufi, Noto Naskh Arabic and IBM Plex Sans Arabic are never `displayAr` (F11);
 *  - El Messiri pairs only with contrast serifs (F14), and only where its lightest weight (400) is not darker than the
 *    Latin display (F15): beside a hairline Bodoni or a slim Instrument Serif the catalogue sets a light Arabic face;
 *  - the Arabic display weight follows the ink-density ratio (F15, scripts/qa/design-ink.ts --tune).
 */
export const CATALOGUE_REPOINTS: Readonly<Record<string, Partial<Pick<CataloguePairing, "displayAr" | "displayWeightAr" | "displayWeight" | "note">>>> = {
  couture: { displayAr: "alexandria", displayWeightAr: 240, note: "Bodoni Moda with optical sizes, hairline contrast at display size and its italic for emphasis; Hanken for calm text; a light Alexandria keeps the Arabic as fine as the hairlines." },
  atelier: { displayAr: "alexandria", displayWeightAr: 300, note: "Slim Instrument Serif with Instrument Sans and mono reference numbers, a modern atelier; a light Alexandria for the Arabic." },
  "lab-serif": { displayWeightAr: 310 },
  dermo: { displayWeightAr: 320 },
  riad: { displayAr: "noto-kufi-arabic", displayWeightAr: 600, note: "Gloock's contemporary wedge serif with Figtree; Noto Kufi Arabic semibold, a clean kufic geometry over Readex Pro." },
  medina: { displayWeightAr: 340 },
  atlas: { displayAr: "changa", displayWeightAr: 350, note: "Instrument Serif's narrow cut (italic emphasis) with Figtree; a light Changa, as narrow as the serif, over Tajawal." },
  sticker: { displayWeightAr: 760 },
  candy: { displayWeight: 580, note: "Bricolage Grotesque semibold with DM Sans; Marhey bold, its bouncy modern Arabic, over Tajawal." },
  pantry: { displayAr: "readex-pro", displayWeightAr: 430, note: "Fraunces semibold, soft and round, with Figtree; Readex Pro over Tajawal for a plain, warm Arabic." },
  petal: { displayAr: "alexandria", displayWeightAr: 300, note: "Instrument Serif with its italic for emphasis, Hanken text; a light Alexandria over Tajawal." },
  gloss: { displayAr: "alexandria", displayWeightAr: 230, note: "Fraunces light at display size, soft glossy curves, with Figtree; a light Alexandria over Tajawal." },
  cover: { displayAr: "alexandria", displayWeightAr: 260, note: "Bodoni Moda, beauty-cover contrast, with DM Sans; a light Alexandria keeps the Arabic as fine." },
  harvest: { displayAr: "noto-kufi-arabic", displayWeightAr: 600, note: "Young Serif and Figtree, fresh and friendly; Noto Kufi Arabic semibold over Readex Pro." },
  herbarium: { displayAr: "noto-kufi-arabic", displayWeightAr: 420, note: "Fraunces medium over Instrument Sans with mono origin labels, a modern botanical plate; Noto Kufi Arabic over Readex Pro." },
  feuilleton: { displayAr: "changa", displayWeightAr: 350, note: "Instrument Serif headlines with italic pull words over Instrument Sans, mono folios; a light Changa, narrow like the serif." },
  swiss: { displayAr: "readex-pro", displayWeightAr: 600, note: "Hanken Grotesk bold, neo-grotesk discipline, with JetBrains Mono captions; Readex Pro semibold over IBM Plex Sans Arabic." },
};
