/**
 * Public types of the theme engine (re-exported by ./index.ts).
 */
import type { Archetype, Divider, ProductCategory } from "@/lib/page/schema";

export interface BuiltTheme {
  /**
   * CSS text: `:root{--lp-*…; --sec-* base map}` + one `[data-bg="…"]{…}` map per section background
   * + `::selection`. Each section map carries its colors (--sec-*, incl. --sec-success/danger/warn
   * ≥ 4.5:1 on that block's bg and card, --sec-highlight = the highlighter block behind *emphasis*
   * with --sec-ink ≥ 4.5:1 on it, --sec-chip clearly separated from the block) and its materials, all
   * tinted by that block:
   * --lp-shadow-s/m/l/glow, --lp-highlight(-accent), --lp-shadow-product(-filter), frosted glass
   * (--sec-glass, --sec-glass-ink ≥ 4.5:1 over any backdrop, --sec-glass-border, --sec-glass-solid)
   * and the stage glow (--lp-stage-glow; no aurora field since core D60 rev 3), plus the product stage tint
   * --mx-stage / --mx-stage-hi / --mx-stage-lo (one clean hue per block — the accent's light ramp on
   * pale grounds, tone on tone on color blocks — with --sec-ink ≥ 4.5:1 on all three; these outrank
   * the color-mix fallbacks base.css declares at zero specificity).
   * With `theme.look` the map also carries the look tokens (design.md DES-§4.5.3): the radius ladder, grid, type,
   * motion, the depth recipes (--lp-shadow-card, --lp-shadow-float, --lp-ring) and the stage presets.
   * Built only from enums, computed hex and numbers: safe to inline in <style>.
   */
  css: string;
  /** flat token map (name without leading "--" → value; section values keyed "<bg>:<name>"), for previews/debug */
  tokens: Record<string, string>;
  /**
   * font ids actually used for this locale, deduplicated: [display, body, accent?] for Latin pages,
   * [displayAr, bodyAr, accent?] for "ar" (where --lp-font-accent / --lp-font-label lead with the Arabic
   * companion — the display face beside a serif accent, the body face beside a mono — and keep the
   * Latin accent only as a glyph backup). Pass to fontFaceCss/fontPreloads.
   */
  fontIds: string[];
  /** weight used for each entry of `fontIds` (pass to fontPreloads to preload the right static file) */
  fontWeights: number[];
  /**
   * Discrete archetype choices exposed as attributes on <html> so CSS can switch styles — exactly the
   * value sets of docs/DESIGN.md §2.5 (THEME_ATTR_VALUES), e.g.
   * { "data-arch": "souk", "data-btn": "pill", "data-card": "soft", "data-emphasis": "swoosh",
   *   "data-mask": "arch", "data-glyph": "spark", "data-texture": "none", "data-radius": "soft",
   *   "data-shadow": "glow", "data-surfaces": "flush", "data-motion": "lively", "data-base": "tinted",
   *   "data-density": "balanced" }
   * plus, with `theme.look` only, data-look … data-corner (DES-§4.5.2).
   */
  attrs: Record<string, string>;
  /** divider family for this page (spec.dividers, or the archetype's family when empty) */
  dividers: Divider[];
  /** page color scheme (light for light/tinted bases) */
  scheme: "light" | "dark";
}

export interface ExtractedPalette {
  /** dominant colors sorted by visual importance, #rrggbb */
  colors: { hex: string; weight: number; chroma: number; lightness: number; hue: number }[];
  /** detected background color of the photo (corners), if any */
  background: string | null;
  /** product has transparent background */
  transparent: boolean;
  /** 0..1 average chroma of non-background pixels */
  colorfulness: number;
  /** 0..1 average lightness of non-background pixels */
  brightness: number;
  /** warm(>0) / cool(<0) bias, -1..1 */
  warmth: number;
}

export interface ArchetypeScore {
  archetype: Archetype;
  score: number;
  reason: string;
}

export interface ThemeFromProductInput {
  category: ProductCategory;
  palette: ExtractedPalette | null;
  /** optional hint from the local AI vision model (vibe keyword) */
  aiVibe?: string | null;
  /**
   * optional product text — name + tagline + description, any language (Arabic, French, English).
   * High-signal words steer the ranking and the palette: modest-fashion & devotional words (abaya,
   * prière, hijab, djellaba, kaftan, عباية, حجاب, صلاة…) → a quiet, modest-elegant page
   * (bloom / maison / editorial); perfume/luxury, tech, sport, kitchen, baby, skincare and terroir
   * words → their archetypes. Only matched words are used; the text never reaches the CSS.
   */
  keywords?: string | null;
  /** force an archetype (remix / admin choice) */
  archetype?: Archetype;
  seed: number;
}
