/**
 * Theme engine verification — run with: npx tsx scripts/check-theme.ts
 * (THEME_CHECK_ALL=1 prints every failure instead of the first 40)
 *
 * Two sizes (docs/STORE-SAAS.md §J.1, CCR r1.0-c0b-3 item 1):
 *   npx tsx scripts/check-theme.ts          the seeded subset of `npm test` (~30 s): every check runs. All 40 seeds' specs
 *                                           are checked (validity, orange, dividers, determinism, the 8-look variety);
 *                                           seeds 0-3 are built and verified, with the independent blend measure on
 *                                           seeds 0-1 and the dense aurora grid on seed 0; the first 100 of the 600
 *                                           hand-edited specs (blend on 50, dense on 17, the full sweep's shares); the
 *                                           calm, adversarial, ranking, font and contract blocks run in full
 *   npx tsx scripts/check-theme.ts --full   the full sweep below: 40 seeds built (blend on 0-3, dense on 0-2), 600
 *                                           hand-edited specs (blend on 300, dense on 100); `npm run test:slow`
 *
 * For every archetype × 40 seeds × synthetic product photos × locales (ar, fr):
 *   themeFromProduct → buildTheme must not throw, and every contrast guarantee is re-verified on the
 *   EMITTED tokens (not on internal structures): section text/accent pairs, frosted glass over any
 *   backdrop, and the aurora light field sampled from its CSS on a grid. Also checks the v2 contract
 *   (DESIGN.md §2.5 attribute value sets, modern dividers, grain ≤ 3%, composable shadows, the modern
 *   font palette, variant ids of SECTIONS.md), determinism, seed variety, CSS safety, font files on
 *   disk, the extractor, the gamut mapper against culori, and the archetype ranking. Exits 1 on failure.
 *
 * Owner rules (2026-10-10), verified on every build (product-derived AND hand-edited):
 *   - NO ORANGE: every color in the emitted CSS (hex and rgb(), shadows, glass, aurora, stage, status,
 *     selection) is measured with culori's OKLCH — none may have hue 25–75° with chroma > 0.06. The
 *     matrix includes a vivid orange and a terracotta product, and the fuzzer feeds orange specs.
 *   - NO ORANGE BLENDS: what the page mixes from those tokens is measured too, independently of the
 *     engine. Every color-mix() of the landing stylesheets (every .css under src/landing, parsed here) is
 *     evaluated on every section of a build with culori (oklab / oklch / srgb, nested mixes, washes
 *     over the block and its cards), plus the fades between any two grounds, the accent ↔ pop ring,
 *     the aurora field as rendered, and every translucent shadow / glow / glass over its block. The
 *     engine's own audit (orangeMixesInTokens) must also be empty on every build, and a set of
 *     adversarial hand-edited specs (crimson on butter, gold on blush, red beside sage…) must come
 *     out clean.
 *   - CALM PRODUCTS STAY CALM: a beige product ranks a calm archetype first (kids included, whatever
 *     the AI vibe says), modest/devotional keywords (fr/ar/en) rank bloom/maison/editorial first, and
 *     a quiet product gets a muted accent + soft pop.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { converter, formatHex, modeLrgb, modeOklab, modeOklch, modeRgb, parse as culoriParse, toGamut, useMode as registerMode, wcagContrast } from "culori/fn";
import { ARCHETYPES, DIVIDERS, HARMONIES, ProductCategory, SECTION_BGS, ThemeSpec, type Archetype, type Locale } from "../src/lib/page/schema";
import {
  ARCHETYPE_DEFS,
  CALM_ARCHETYPES,
  FONT_DATA,
  THEME_ATTR_VALUES,
  THEME_SECTION_TYPES,
  GROUND_TOKENS,
  buildTheme,
  extractPalette,
  orangeMixesInTokens,
  fontFaceCss,
  fontPreloads,
  isCalmPalette,
  isQuietProduct,
  rankArchetypes,
  themeFromProduct,
  type ExtractedPalette,
} from "../src/lib/theme";
import { composite, contrast, deltaE, fromOklch, hueDistance, luminance, toOklch } from "../src/lib/theme/color";
import { mulberry32 } from "../src/lib/theme/rng";

registerMode(modeRgb);
registerMode(modeLrgb);
registerMode(modeOklab);
registerMode(modeOklch);
const culoriOklch = converter("oklch");
const culoriOklab = converter("oklab");
const culoriRgb = converter("rgb");

const ROOT = join(__dirname, "..");
const SEEDS = 40;
/** `--full` (test:slow) builds every seed and every hand-edited spec; npm test builds the first seeds only (see the header) */
const FULL = process.argv.includes("--full");
const BUILT_SEEDS = FULL ? SEEDS : 4;
/** the seeds whose builds also get the independent CSS blend measure, and the dense 41-point aurora grid (9 points elsewhere) */
const BLEND_SEEDS = FULL ? 4 : 2;
const DENSE_SEEDS = FULL ? 3 : 1;
const LOCALES: Locale[] = ["ar", "fr"];

let failures = 0;
const failLog: string[] = [];
function fail(msg: string) {
  failures++;
  if (failLog.length < (process.env.THEME_CHECK_ALL ? 100000 : 40)) failLog.push(msg);
}
function assert(cond: unknown, msg: string) {
  if (!cond) fail(msg);
}

/* ------------------------------------------------------------------ */
/* v2 contract constants (docs/DESIGN.md, docs/SECTIONS.md)             */
/* ------------------------------------------------------------------ */

/** Variant ids per section type — docs/SECTIONS.md (ids are a contract; looks were modernized). */
const VARIANT_CATALOG: Record<string, readonly string[]> = {
  announcement: ["ticker", "static", "split"],
  header: ["minimal", "centered", "none"],
  hero: ["stage", "editorial", "poster", "scrapbook", "spec", "split"],
  trustBar: ["chips", "stamps", "ledger", "ribbon"],
  marquee: ["tape", "outline", "double"],
  reviews: ["wall", "carousel", "summary", "notes"],
  socialProof: ["whatsapp", "ugc", "counter"],
  stats: ["big-numbers", "rings", "ticker"],
  beforeAfter: ["slider", "cards", "timeline"],
  problem: ["crossed", "chat", "split", "quote"],
  benefits: ["numbered", "bento", "zigzag", "icons", "stack"],
  showcase: ["hotspots", "exploded", "ingredients", "dimensions"],
  steps: ["timeline", "cards", "illustrated", "strip"],
  story: ["letter", "image-text", "manifesto"],
  gallery: ["carousel", "masonry", "filmstrip", "lookbook"],
  video: ["framed", "phone", "fullbleed"],
  comparison: ["table", "versus", "checklist"],
  specs: ["sheet", "tabs", "accordion", "label"],
  offer: ["stacked", "tickets", "shelf"],
  urgency: ["countdown", "stock", "banner"],
  guarantee: ["seal", "split", "letter"],
  orderForm: ["card", "split", "minimal", "bold"],
  cta: ["banner", "stamp", "poster"],
  faq: ["accordion", "two-col", "chat"],
  footer: ["simple", "big"],
  stickyCta: ["bar", "pill"],
  whatsappFloat: ["bubble", "tab"],
};

/** Dated families (handwriting, stencil, calligraphic display) — must not ship at all. */
const BANNED_FONTS = ["caveat", "big-shoulders-stencil-display", "aref-ruqaa", "rakkas", "lalezar"];
/** The modern type palette per slot (task brief / DESIGN.md §3). */
const LATIN_DISPLAY = ["bodoni-moda", "instrument-serif", "fraunces", "young-serif", "gloock", "bricolage-grotesque", "archivo", "big-shoulders-display", "schibsted-grotesk", "hanken-grotesk", "instrument-sans", "dm-sans", "figtree"];
const ARABIC_DISPLAY = ["alexandria", "reem-kufi", "el-messiri", "readex-pro", "noto-kufi-arabic", "changa", "baloo-bhaijaan-2", "marhey", "ibm-plex-sans-arabic", "tajawal", "lemonada"];
const ACCENTS = ["jetbrains-mono", "ibm-plex-mono", "instrument-serif"];
const MODERN_DIVIDERS = DIVIDERS.filter((d) => d !== "none");
const GRAIN_MAX = 0.03;
const COMPOSABLE = ["lp-shadow-s", "lp-shadow-m", "lp-shadow-l", "lp-shadow-glow", "lp-highlight", "lp-highlight-accent"];

/* ------------------------------------------------------------------ */
/* synthetic product photos (64×64 RGBA)                               */
/* ------------------------------------------------------------------ */

type RGB = [number, number, number];
const hexRgb = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

function photo(opts: { bg: string | null; body: string; label?: string; noise?: number; seed: number }): { rgba: Uint8ClampedArray; w: number; h: number } {
  const w = 64;
  const h = 64;
  const rgba = new Uint8ClampedArray(w * h * 4);
  const rnd = mulberry32(opts.seed);
  const bg = opts.bg ? hexRgb(opts.bg) : null;
  const body = hexRgb(opts.body);
  const label = opts.label ? hexRgb(opts.label) : null;
  const n = opts.noise ?? 6;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const dx = (x - 32) / 18;
      const dy = (y - 34) / 26;
      const inside = dx * dx + dy * dy <= 1;
      const onLabel = inside && label && Math.abs(y - 36) < 6;
      let c: RGB | null = inside ? (onLabel ? label : body) : bg;
      if (!c) {
        rgba[i + 3] = 0;
        continue;
      }
      const shade = inside ? 1 - Math.max(0, dx) * 0.25 : 1; // a little modelling light
      c = [c[0] * shade, c[1] * shade, c[2] * shade];
      rgba[i] = c[0] + (rnd() - 0.5) * n;
      rgba[i + 1] = c[1] + (rnd() - 0.5) * n;
      rgba[i + 2] = c[2] + (rnd() - 0.5) * n;
      rgba[i + 3] = 255;
    }
  }
  return { rgba, w, h };
}

const PHOTOS: Record<string, ReturnType<typeof photo>> = {
  "vivid red": photo({ bg: "#f4f4f2", body: "#d81e2c", label: "#f6f1e7", seed: 1 }),
  "pastel pink": photo({ bg: "#ffffff", body: "#f2b8c6", label: "#c9a46a", seed: 2 }),
  "black product": photo({ bg: "#ffffff", body: "#141414", label: "#3a3a3a", seed: 3 }),
  "white product": photo({ bg: "#ececec", body: "#fbfbfb", label: "#d8d8d8", seed: 4 }),
  olive: photo({ bg: "#e9e4d8", body: "#6b7330", label: "#c8a24a", seed: 5 }),
  transparent: photo({ bg: null, body: "#1f6fd1", label: "#ffb703", seed: 6 }),
  // owner rule tests: an orange product must never yield an orange page, a beige one stays calm
  "vivid orange": photo({ bg: "#f3f3f1", body: "#ff7a1a", label: "#fff4e8", seed: 7 }),
  terracotta: photo({ bg: "#efe9e1", body: "#b4502c", label: "#e8d9c5", seed: 8 }),
  "beige lace": photo({ bg: "#f6f3ef", body: "#d8c4a3", label: "#ece2cf", seed: 9 }),
};

const PALETTES: Record<string, ExtractedPalette> = {};
for (const [name, p] of Object.entries(PHOTOS)) PALETTES[name] = extractPalette(p.rgba, p.w, p.h);

/* extractor sanity */
{
  const red = PALETTES["vivid red"]!;
  const top = red.colors[0]!;
  assert(top && top.chroma > 0.15 && (top.hue < 40 || top.hue > 350), `extract: vivid red top color ${JSON.stringify(top)}`);
  assert(red.background !== null, "extract: vivid red background not detected");
  assert(red.warmth > 0.3, `extract: vivid red warmth ${red.warmth}`);
  assert(PALETTES.transparent!.transparent, "extract: transparent not detected");
  assert(!PALETTES["vivid red"]!.transparent, "extract: opaque photo flagged transparent");
  assert(PALETTES.transparent!.warmth < 0.2, `extract: blue product warmth ${PALETTES.transparent!.warmth}`);
  assert(PALETTES["black product"]!.brightness < 0.3, `extract: black brightness ${PALETTES["black product"]!.brightness}`);
  assert(PALETTES["black product"]!.colorfulness < 0.15, `extract: black colorfulness ${PALETTES["black product"]!.colorfulness}`);
  assert(PALETTES["white product"]!.brightness > 0.8, `extract: white brightness ${PALETTES["white product"]!.brightness}`);
  const again = extractPalette(PHOTOS.olive!.rgba, 64, 64);
  assert(JSON.stringify(again) === JSON.stringify(PALETTES.olive), "extract: not deterministic");
  // the orange photos really are orange (otherwise the no-orange matrix would prove nothing)
  for (const name of ["vivid orange", "terracotta"]) {
    const top = PALETTES[name]!.colors[0]!;
    assert(top.chroma > 0.1 && top.hue >= 25 && top.hue <= 75, `extract: ${name} top color is not orange ${JSON.stringify(top)}`);
    assert(!isCalmPalette(PALETTES[name]!), `extract: ${name} read as calm`);
  }
  assert(isCalmPalette(PALETTES["beige lace"]!), `extract: beige lace not calm (colorful=${PALETTES["beige lace"]!.colorfulness})`);
  assert(isCalmPalette(PALETTES["white product"]!) && isCalmPalette(PALETTES["black product"]!), "extract: white/black products should read calm");
  assert(!isCalmPalette(PALETTES["vivid red"]!) && !isCalmPalette(PALETTES.transparent!), "extract: vivid products read calm");
}

/* ------------------------------------------------------------------ */
/* no orange: an independent measure (culori OKLCH) of emitted colors  */
/* ------------------------------------------------------------------ */

const BAND = { hueMin: 25, hueMax: 75, maxC: 0.06 };
const orangeCache = new Map<string, boolean>();
/** culori's OKLCH of an 8-bit color is in the forbidden band. */
function bandOrange(hex: string): boolean {
  const key = hex.toLowerCase();
  const hit = orangeCache.get(key);
  if (hit !== undefined) return hit;
  const o = culoriOklch(key);
  const v = !!o && (o.c ?? 0) > BAND.maxC && o.h !== undefined && o.h >= BAND.hueMin && o.h <= BAND.hueMax;
  orangeCache.set(key, v);
  return v;
}
const CSS_HEX = /#[0-9a-fA-F]{6}(?![0-9a-fA-F])/g;
const CSS_RGB = /rgb\((\d{1,3}) (\d{1,3}) (\d{1,3})(?: \/ [\d.]+)?\)/g;
const noOrangeStats = { colors: 0, builds: 0, nearest: 180 };
/** Every color written into a theme's CSS that falls in the band (hex and rgb() forms). */
function orangeLeaks(css: string): string[] {
  const out = new Set<string>();
  const seen = (hex: string, raw: string) => {
    noOrangeStats.colors++;
    const o = culoriOklch(hex.toLowerCase());
    if (o && (o.c ?? 0) > BAND.maxC && o.h !== undefined) {
      const d = o.h < BAND.hueMin ? BAND.hueMin - o.h : o.h > BAND.hueMax ? o.h - BAND.hueMax : 0;
      noOrangeStats.nearest = Math.min(noOrangeStats.nearest, d);
    }
    if (bandOrange(hex)) out.add(raw);
  };
  for (const m of css.matchAll(CSS_HEX)) seen(m[0], m[0]);
  for (const m of css.matchAll(CSS_RGB)) {
    const hex = `#${[m[1], m[2], m[3]].map((x) => Number(x).toString(16).padStart(2, "0")).join("")}`;
    seen(hex, m[0]);
  }
  noOrangeStats.builds++;
  return [...out];
}
{
  // the measure itself: classic oranges are caught, the allowed neighbours are not
  for (const h of ["#ff7a1a", "#b4502c", "#ff5533", "#f28c28", "#c8871a", "#ff0000", "#f2b48c"]) assert(bandOrange(h), `no-orange measure misses ${h}`);
  for (const h of ["#c11f3b", "#f5c518", "#d8c39a", "#4a2a1f", "#f6f1e7", "#efc8bc", "#2f45b0"]) assert(!bandOrange(h), `no-orange measure flags allowed ${h}`);
}

/* ------------------------------------------------------------------ */
/* no orange blends: the color-mix() of the landing CSS, measured      */
/* independently (culori), on the emitted tokens                       */
/* ------------------------------------------------------------------ */

type MixArg =
  | { kind: "token"; names: string[] }
  | { kind: "hex"; hex: string }
  | { kind: "transparent" }
  | { kind: "neutral"; names: string[] }
  | { kind: "mix"; mix: CssMix };
interface CssMix {
  space: "oklab" | "oklch" | "srgb";
  a: MixArg;
  pa: number | null;
  b: MixArg;
  pb: number | null;
  /** a calc()'d share (e.g. a timeline progress): sampled over 0–100% */
  dynamic: boolean;
  src: string;
}

/** Component-local custom properties that are a theme token under another name (base.css, sections). */
const MIX_ALIASES: Record<string, string> = { "em-hl": "sec-highlight", "mx-tint-of": "sec-accent", "btn-bg": "sec-accent", "btn-ink": "sec-accent-ink" };

function landingCss(dir: string): string[] {
  const out: string[] = [];
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) {
      if (f !== "generated") out.push(...landingCss(p));
    } else if (f.endsWith(".css")) out.push(p);
  }
  return out;
}
function splitTopLevel(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}
function closingParen(s: string, open: number): number {
  let d = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === "(") d++;
    else if (s[i] === ")" && --d === 0) return i;
  }
  return -1;
}
const varNames = (s: string) => [...s.matchAll(/--([\w-]+)/g)].map((m) => m[1]!);
function parseMixArg(raw: string): { arg: MixArg | null; p: number | null; dynamic: boolean } {
  let s = raw.trim();
  let p: number | null = null;
  let dynamic = false;
  const tail = /\s+(-?[\d.]+)%$/.exec(s);
  if (tail) {
    p = Number(tail[1]);
    s = s.slice(0, tail.index).trim();
  }
  const head = /^(-?[\d.]+)%\s+/.exec(s);
  if (head) {
    p = Number(head[1]);
    s = s.slice(head[0].length).trim();
  }
  const calc = /\s+calc\(.*\)$/.exec(s);
  if (calc) {
    dynamic = true;
    s = s.slice(0, calc.index).trim();
  }
  if (s === "transparent") return { arg: { kind: "transparent" }, p, dynamic };
  if (s.startsWith("color-mix(")) {
    const m = parseCssMix(s.slice(10, s.length - 1), s);
    return { arg: m ? { kind: "mix", mix: m } : null, p, dynamic };
  }
  if (/^oklch\(from var\(--[\w-]+\) l 0 0\)$/.test(s)) return { arg: { kind: "neutral", names: varNames(s) }, p, dynamic };
  if (s.startsWith("var(")) return { arg: { kind: "token", names: varNames(s) }, p, dynamic };
  const c = culoriParse(s);
  return { arg: c ? { kind: "hex", hex: formatHex(c) } : null, p, dynamic };
}
function parseCssMix(inner: string, src: string): CssMix | null {
  const parts = splitTopLevel(inner);
  if (parts.length !== 3) return null;
  const space = /^in\s+(oklab|oklch|srgb)/.exec(parts[0]!);
  if (!space) return null;
  const A = parseMixArg(parts[1]!);
  const B = parseMixArg(parts[2]!);
  if (!A.arg || !B.arg) return null;
  return { space: space[1] as CssMix["space"], a: A.arg, pa: A.p, b: B.arg, pb: B.p, dynamic: A.dynamic || B.dynamic, src };
}
/** Every distinct color-mix() of the landing stylesheets (the generated bundle is skipped: same sources). */
const CSS_MIXES: CssMix[] = [];
let cssMixCount = 0;
{
  const seen = new Set<string>();
  for (const file of landingCss(join(ROOT, "src", "landing"))) {
    const css = readFileSync(file, "utf8");
    for (let i = css.indexOf("color-mix("); i >= 0; i = css.indexOf("color-mix(", i + 10)) {
      const end = closingParen(css, i + 9);
      if (end < 0) continue;
      cssMixCount++;
      const src = css.slice(i, end + 1).replace(/\s+/g, " ");
      if (seen.has(src)) continue;
      seen.add(src);
      const m = parseCssMix(css.slice(i + 10, end), src);
      if (m) CSS_MIXES.push(m);
    }
  }
  assert(CSS_MIXES.length >= 100, `css blends: only ${CSS_MIXES.length} color-mix() parsed from src/landing (parser broken?)`);
}

interface RGBA {
  r: number;
  g: number;
  b: number;
  alpha: number;
}
const rgbaOf = (hex: string): RGBA => ({ r: parseInt(hex.slice(1, 3), 16) / 255, g: parseInt(hex.slice(3, 5), 16) / 255, b: parseInt(hex.slice(5, 7), 16) / 255, alpha: 1 });
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
/** A color painted over an opaque ground (source-over, sRGB), 8-bit hex. */
function paintOver(c: RGBA, ground: string): string {
  const g = rgbaOf(ground);
  const a = clamp01(c.alpha);
  return formatHex({ mode: "rgb", r: clamp01(c.r) * a + g.r * (1 - a), g: clamp01(c.g) * a + g.g * (1 - a), b: clamp01(c.b) * a + g.b * (1 - a) });
}
/** CSS Color 5 color-mix() of two opaque colors: share `wa` of A, in oklab / oklch (shorter hue) / srgb. */
function mixOpaque(space: CssMix["space"], A: RGBA, B: RGBA, wa: number): RGBA {
  const wb = 1 - wa;
  if (space === "srgb") return { r: A.r * wa + B.r * wb, g: A.g * wa + B.g * wb, b: A.b * wa + B.b * wb, alpha: 1 };
  if (space === "oklab") {
    const x = culoriOklab({ mode: "rgb", r: A.r, g: A.g, b: A.b })!;
    const y = culoriOklab({ mode: "rgb", r: B.r, g: B.g, b: B.b })!;
    const c = culoriRgb({ mode: "oklab", l: x.l * wa + y.l * wb, a: x.a * wa + y.a * wb, b: x.b * wa + y.b * wb });
    return { r: c.r, g: c.g, b: c.b, alpha: 1 };
  }
  const x = culoriOklch({ mode: "rgb", r: A.r, g: A.g, b: A.b })!;
  const y = culoriOklch({ mode: "rgb", r: B.r, g: B.g, b: B.b })!;
  // a gray end's hue is powerless: it takes the other end's
  let hx = x.c > 1e-4 && x.h !== undefined ? x.h : (y.h ?? 0);
  let hy = y.c > 1e-4 && y.h !== undefined ? y.h : hx;
  if (hy - hx > 180) hx += 360;
  else if (hx - hy > 180) hy += 360;
  const c = culoriRgb({ mode: "oklch", l: x.l * wa + y.l * wb, c: x.c * wa + y.c * wb, h: (hx * wa + hy * wb) % 360 });
  return { r: c.r, g: c.g, b: c.b, alpha: 1 };
}
/** Evaluate a parsed color-mix() against one section's tokens; null when an operand is not a theme color. */
function evalCssMix(m: CssMix, tok: (name: string) => string | undefined, share: number | null): RGBA | null {
  const resolve = (a: MixArg): RGBA | "transparent" | null => {
    if (a.kind === "transparent") return "transparent";
    if (a.kind === "hex") return rgbaOf(a.hex);
    if (a.kind === "mix") return evalCssMix(a.mix, tok, null);
    for (const n of a.names) {
      const v = tok(MIX_ALIASES[n] ?? n);
      if (!v || !/^#[0-9a-f]{6}$/.test(v)) continue;
      if (a.kind === "token") return rgbaOf(v);
      const g = culoriRgb({ mode: "oklab", l: culoriOklab(v)!.l, a: 0, b: 0 });
      return { r: g.r, g: g.g, b: g.b, alpha: 1 };
    }
    return null;
  };
  const A = resolve(m.a);
  const B = resolve(m.b);
  if (!A || !B || (A === "transparent" && B === "transparent")) return null;
  let pa = share !== null ? share * 100 : m.pa;
  let pb = share !== null ? 100 - share * 100 : m.pb;
  if (pa === null && pb === null) pa = pb = 50;
  else if (pa === null) pa = 100 - pb!;
  else if (pb === null) pb = 100 - pa;
  const sum = pa + pb!;
  if (sum <= 0) return null;
  const wa = pa / sum;
  const alphaMul = Math.min(1, sum / 100);
  // mixing with transparent (premultiplied) keeps the color and scales its alpha: a wash
  if (A === "transparent") return { ...(B as RGBA), alpha: (B as RGBA).alpha * (1 - wa) * alphaMul };
  if (B === "transparent") return { ...A, alpha: A.alpha * wa * alphaMul };
  const out = mixOpaque(m.space, A, B, wa);
  out.alpha = (A.alpha * wa + B.alpha * (1 - wa)) * alphaMul;
  return out;
}

const blendStats = { measured: 0, builds: 0, nearest: 180, worst: "" };
function measureBlend(hex: string, what: string, out: string[]) {
  blendStats.measured++;
  const o = culoriOklch(hex);
  if (o && (o.c ?? 0) > BAND.maxC && o.h !== undefined) {
    const d = o.h < BAND.hueMin ? BAND.hueMin - o.h : o.h > BAND.hueMax ? o.h - BAND.hueMax : 0;
    if (d < blendStats.nearest) {
      blendStats.nearest = d;
      blendStats.worst = `${what} → ${hex}`;
    }
  }
  if (bandOrange(hex)) out.push(`${what} → ${hex}`);
}
const RGB_ALPHA = /rgb\((\d{1,3}) (\d{1,3}) (\d{1,3}) \/ ([\d.]+)\)/g;
const SHARES = [0.04, 0.08, 0.12, 0.16, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.96];
const DIVIDER_STOPS = [0.12, 0.5, 0.88];

/**
 * Every orange the page would paint by blending this theme's tokens, measured with culori:
 *  - each color-mix() of the stylesheets on each [data-bg] block (washes painted over the block and its card);
 *  - fades between any two grounds (OKLab stops of the divider + the sRGB gradient between them);
 *  - the UGC ring (conic pop → accent → a-300 → pop, sRGB);
 *  - every translucent rgb(… / a) in shadows, glows, glass and aurora lights, over the block and its card.
 */
function blendLeaks(t: Record<string, string>): string[] {
  const out: string[] = [];
  blendStats.builds++;
  for (const sbg of SECTION_BGS) {
    const tok = (name: string) => t[`${sbg}:${name}`] ?? t[name];
    const grounds = [t[`${sbg}:sec-bg`]!, t[`${sbg}:sec-card`]!];
    for (const m of CSS_MIXES) {
      for (const share of m.dynamic ? [0.1, 0.3, 0.5, 0.7, 0.9] : [null]) {
        const c = evalCssMix(m, tok, share);
        if (!c) continue;
        for (const g of c.alpha >= 0.999 ? grounds.slice(0, 1) : grounds) measureBlend(paintOver(c, g), `[${sbg}] ${m.src.slice(0, 90)}`, out);
      }
    }
    for (const name of ["lp-shadow-s", "lp-shadow-m", "lp-shadow-l", "lp-shadow-glow", "lp-shadow-product", "lp-shadow-product-filter", "sec-glass", "lp-aurora", "lp-stage-glow"]) {
      for (const m of (t[`${sbg}:${name}`] ?? "").matchAll(RGB_ALPHA)) {
        const c = { r: Number(m[1]) / 255, g: Number(m[2]) / 255, b: Number(m[3]) / 255, alpha: Number(m[4]) };
        if (c.alpha <= 0) continue;
        for (const g of grounds) for (const k of [1, 0.5]) measureBlend(paintOver({ ...c, alpha: c.alpha * k }, g), `[${sbg}] ${name} ${m[0]} over ${g}`, out);
      }
    }
  }
  const lerpPair = (a: string, b: string, what: string, oklab: readonly number[], srgb: readonly number[]) => {
    const A = rgbaOf(a);
    const B = rgbaOf(b);
    for (const s of oklab) measureBlend(paintOver(mixOpaque("oklab", A, B, s), "#000000"), `${what} oklab ${s}`, out);
    for (const s of srgb) measureBlend(paintOver(mixOpaque("srgb", A, B, s), "#000000"), `${what} srgb ${s}`, out);
  };
  for (let i = 0; i < GROUND_TOKENS.length; i++) {
    for (let j = i + 1; j < GROUND_TOKENS.length; j++) {
      lerpPair(t[GROUND_TOKENS[i]!]!, t[GROUND_TOKENS[j]!]!, `fade ${GROUND_TOKENS[i]}→${GROUND_TOKENS[j]}`, DIVIDER_STOPS, SHARES);
    }
  }
  for (const [a, b] of [["lp-pop", "lp-accent"], ["lp-accent", "lp-a-300"], ["lp-a-300", "lp-pop"]] as const) lerpPair(t[a]!, t[b]!, `ring ${a}→${b}`, [], SHARES);
  return out;
}
{
  // the measure itself: crimson into butter at 42% (oklab) is amber, plum into stone is clean, an oklch
  // mix of crimson into sand passes through orange, a 22% crimson wash over butter does too
  const leak = (space: CssMix["space"], a: string, b: string, s: number) => bandOrange(paintOver(mixOpaque(space, rgbaOf(a), rgbaOf(b), s), "#000000"));
  assert(leak("oklab", "#c04558", "#ecdaa2", 0.42), "blend measure: crimson × butter (oklab 42%) not seen as orange");
  assert(!leak("oklab", "#5d2e45", "#efebe2", 0.42), "blend measure: plum × stone flagged");
  assert(leak("oklch", "#d03643", "#e9d9b0", 0.3), "blend measure: oklch crimson × sand not seen as orange");
  assert(bandOrange(paintOver({ ...rgbaOf("#c8102e"), alpha: 0.3 }, "#f1d98a")), "blend measure: crimson wash over butter not seen as orange");
}

/* ------------------------------------------------------------------ */
/* gamut mapping & contrast vs culori                                  */
/* ------------------------------------------------------------------ */
{
  const ref = toGamut("rgb", "oklch");
  const rnd = mulberry32(42);
  let worst = 0;
  for (let i = 0; i < 4000; i++) {
    const o = { l: rnd(), c: rnd() * 0.37, h: rnd() * 360 };
    const mine = fromOklch(o);
    const theirs = formatHex(ref({ mode: "oklch", ...o }));
    const a = hexRgb(mine);
    const b = hexRgb(theirs);
    worst = Math.max(worst, Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
  }
  assert(worst <= 2, `gamut: fromOklch differs from culori toGamut by ${worst}/255`);
  for (let i = 0; i < 500; i++) {
    const a = fromOklch({ l: rnd(), c: rnd() * 0.3, h: rnd() * 360 });
    const b = fromOklch({ l: rnd(), c: rnd() * 0.3, h: rnd() * 360 });
    assert(Math.abs(contrast(a, b) - wcagContrast(a, b)) < 0.02, `contrast mismatch ${a} ${b}`);
  }
  const rt = toOklch("#b4502c");
  assert(fromOklch(rt) === "#b4502c", "oklch round-trip");
  assert(composite("#ffffff", 0.5, "#000000") === "#808080" && composite("#123456", 1, "#ffffff") === "#123456", "composite: source-over in sRGB");
  console.log(`gamut mapper vs culori: max channel delta ${worst}/255`);
}

/* ------------------------------------------------------------------ */
/* ranking sanity                                                      */
/* ------------------------------------------------------------------ */
{
  const top = (category: Parameters<typeof rankArchetypes>[0]["category"], aiVibe: string | null, palette: ExtractedPalette | null = null) =>
    rankArchetypes({ category, palette, aiVibe })[0]!.archetype;
  assert(top("fragrance", null) === "maison", "rank: fragrance → maison");
  assert(top("other", "luxury premium") === "maison", "rank: luxury vibe → maison");
  assert(top("other", "playful") === "playground", "rank: playful vibe → playground");
  assert(top("tech", null) === "circuit", "rank: tech → circuit");
  assert(top("traditional", "handmade") === "souk", "rank: traditional → souk");
  assert(top("garden", "natural") === "field", "rank: garden → field");
  assert(top("tools", "rugged") === "garage", "rank: tools → garage");
  assert(top("skincare", "clinical") === "apothecary", "rank: skincare → apothecary");
  assert(top("kitchen", "cozy") === "hearth", "rank: kitchen → hearth");
  assert(top("beauty", "feminine") === "bloom", "rank: beauty → bloom");
  assert(top("sport", "energetic") === "kinetic", "rank: sport → kinetic");
  assert(top("fashion", "minimal") === "editorial", "rank: fashion → editorial");
  assert(top("beauty", "glowy radiant") === "bloom", "rank: glow vibe → bloom");
  const r = rankArchetypes({ category: "fragrance", palette: PALETTES["black product"]!, aiVibe: "luxury" });
  assert(r.length === ARCHETYPES.length && r[0]!.reason.includes("AI vibe"), "rank: reasons");

  // calm photo → calm archetype first (categories with a strong own intent — tech, sport, tools,
  // car — keep their language; it then renders with the quiet palette)
  const beige = PALETTES["beige lace"]!;
  const STRONG = new Set(["tech", "gadgets", "sport", "fitness", "tools", "car"]);
  for (const category of ProductCategory.options) {
    if (STRONG.has(category)) continue;
    for (const aiVibe of [null, "playful cute colorful", "vintage handmade", "modern sleek", "sporty bold"]) {
      const first = top(category, aiVibe, beige);
      assert(CALM_ARCHETYPES.includes(first), `rank: beige ${category} (vibe ${aiVibe}) → ${first}, expected a calm archetype`);
    }
  }
  assert(top("kids", "playful cute", beige) !== "playground", "rank: calm kids photo became playground");
  // modest / devotional keywords in any language → modest-elegant
  const MODEST = ["bloom", "maison", "editorial"];
  const modestTexts = [
    "Abaya de prière pour fille — dentelle beige, tissu doux",
    "Robe de prière enfant avec hijab intégré",
    "عباية صلاة للبنات بالدانتيل",
    "إسدال الصلاة للأطفال مع خمار",
    "Djellaba brodée pour l'Aïd",
    "Girls prayer dress, modest kaftan",
  ];
  for (const keywords of modestTexts) {
    for (const [category, palette] of [["kids", beige], ["kids", PALETTES["vivid red"]!], ["fashion", null], ["other", PALETTES.transparent!]] as const) {
      const first = rankArchetypes({ category, palette, aiVibe: "playful cute", keywords })[0]!;
      assert(MODEST.includes(first.archetype), `rank: modest "${keywords}" (${category}) → ${first.archetype}`);
      assert(first.reason.includes("keywords modest"), `rank: modest keywords not explained (${first.reason})`);
    }
    assert(isQuietProduct({ palette: PALETTES["vivid red"]!, keywords }), `quiet: modest "${keywords}" should be quiet`);
  }
  const kw = (keywords: string, category: Parameters<typeof rankArchetypes>[0]["category"] = "other") => rankArchetypes({ category, palette: null, aiVibe: null, keywords })[0]!.archetype;
  assert(kw("Parfum oud intense 100ml") === "maison", "rank: perfume keywords → maison");
  assert(kw("عطر العود الفاخر") === "maison", "rank: arabic perfume keywords → maison");
  assert(kw("Écouteurs Bluetooth sans fil") === "circuit", "rank: tech keywords → circuit");
  assert(kw("سماعات بلوتوث لاسلكية") === "circuit", "rank: arabic tech keywords → circuit");
  assert(kw("Pistolet de massage musculaire") === "kinetic", "rank: sport keywords → kinetic");
  assert(kw("خلاط كهربائي للمطبخ") === "hearth", "rank: arabic kitchen keywords → hearth");
  assert(kw("Biberon anti-colique pour bébé", "kids") !== "playground", "rank: baby keywords should not be playground");
  assert(isQuietProduct({ palette: null, keywords: "Biberon anti-colique pour bébé" }), "quiet: baby keywords");
  // look-alike words must not fire: "return guarantee" (العودة) is not oud, Riyadh is not sport
  assert(!rankArchetypes({ category: "other", palette: null, aiVibe: null, keywords: "ضمان العودة 7 أيام" })[0]!.reason.includes("keywords"), "rank: العودة matched oud");
  assert(!rankArchetypes({ category: "other", palette: null, aiVibe: null, keywords: "توصيل إلى الرياض" })[0]!.reason.includes("keywords"), "rank: الرياض matched sport");
  assert(!isQuietProduct({ palette: PALETTES["vivid red"]!, keywords: "Écouteurs Bluetooth" }), "quiet: a vivid tech product is not quiet");
}

/* quiet palettes: the owner's beige prayer abaya (kids) — calm, soft, never loud */
{
  const beige = PALETTES["beige lace"]!;
  const archetypesSeen = new Set<string>();
  for (let seed = 0; seed < 60; seed++) {
    for (const keywords of [null, "Abaya de prière fille — dentelle beige", "عباية صلاة للبنات"]) {
      const spec = themeFromProduct({ category: "kids", palette: beige, aiVibe: "cute playful", keywords, seed });
      archetypesSeen.add(spec.archetype);
      const label = `quiet beige kids seed ${seed} (${keywords ?? "no keywords"})`;
      assert(CALM_ARCHETYPES.includes(spec.archetype), `${label}: archetype ${spec.archetype} is not calm`);
      const A = toOklch(spec.palette.accent);
      const Pp = toOklch(spec.palette.pop);
      assert(A.c <= 0.09, `${label}: accent ${spec.palette.accent} too vivid (C ${A.c.toFixed(3)})`);
      assert(Pp.c <= 0.06, `${label}: pop ${spec.palette.pop} too vivid (C ${Pp.c.toFixed(3)})`);
      assert(spec.motion === "calm", `${label}: motion ${spec.motion}`);
      assert(spec.palette.base !== "dark", `${label}: dark page for a calm product`);
      assert(spec.ornament <= 0.7, `${label}: ornament ${spec.ornament}`);
      assert(!spec.dividers.some((x) => x === "diagonal" || x === "steps"), `${label}: angular transitions ${spec.dividers}`);
      const theme = buildTheme(spec, seed % 2 ? "ar" : "fr");
      // dusty grounds, never candy blush or butter; no highlighter-marker emphasis on a modest page
      const softC = culoriOklch(theme.tokens["lp-soft"]!)?.c ?? 0;
      const bgC = culoriOklch(theme.tokens["lp-bg"]!)?.c ?? 0;
      assert(softC <= 0.026, `${label}: soft band ${theme.tokens["lp-soft"]} too colored (C ${softC.toFixed(3)})`);
      assert(bgC <= 0.028, `${label}: page ${theme.tokens["lp-bg"]} too colored (C ${bgC.toFixed(3)})`);
      assert(theme.attrs["data-emphasis"] !== "highlight", `${label}: highlighter emphasis on a quiet page`);
      const quietBlends = blendLeaks(theme.tokens);
      if (quietBlends.length) fail(`${label}: orange blends: ${quietBlends.slice(0, 2).join(" · ")}`);
      // nothing loud anywhere: every emitted design color stays soft (chroma ≤ 0.12); status colors
      // (success/danger/warn) keep their signal chroma
      let loud: string | null = null;
      for (const [name, value] of Object.entries(theme.tokens)) {
        if (loud || /success|danger|warn/.test(name)) continue;
        for (const m of value.matchAll(CSS_HEX)) {
          const o = culoriOklch(m[0].toLowerCase());
          if (o && (o.c ?? 0) > 0.12) loud = `${name}=${m[0]} (C ${(o.c ?? 0).toFixed(3)})`;
        }
      }
      if (loud) fail(`${label}: loud color ${loud} in a quiet theme`);
    }
  }
  assert(archetypesSeen.size >= 2, `quiet: beige kids always lands on ${[...archetypesSeen]}`);
  // any calm photo in a calm language is quiet (muted accent, soft pop, light ground); a calm photo
  // in a loud language it was forced or ranked into keeps that language's energy — still no orange
  for (const photoName of ["beige lace", "white product", "black product"]) {
    for (const archetype of CALM_ARCHETYPES) {
      for (let seed = 0; seed < 12; seed++) {
        const spec = themeFromProduct({ category: "other", palette: PALETTES[photoName]!, archetype, seed });
        const label = `quiet ${photoName} × ${archetype} seed ${seed}`;
        assert(toOklch(spec.palette.accent).c <= 0.11 && toOklch(spec.palette.pop).c <= 0.07, `${label}: loud palette ${spec.palette.accent}/${spec.palette.pop}`);
        assert(spec.palette.base !== "dark" && spec.motion === "calm", `${label}: ${spec.palette.base} page, ${spec.motion} motion`);
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* archetype definitions & the modern type palette                     */
/* ------------------------------------------------------------------ */
for (const id of BANNED_FONTS) assert(!(id in FONT_DATA), `fonts: dated family ${id} is still shipped`);
for (const f of Object.values(FONT_DATA)) assert(f.category !== "handwriting", `fonts: handwriting family ${f.id} is shipped`);

for (const a of ARCHETYPES) {
  const d = ARCHETYPE_DEFS[a];
  assert(d.fonts.length >= 2 && d.fonts.length <= 3, `${a}: needs 2–3 font pairings`);
  for (const p of d.fonts) {
    for (const id of [p.display, p.body, p.accent, p.displayAr, p.bodyAr]) if (id) assert(id in FONT_DATA, `${a}/${p.id}: unknown font ${id}`);
    assert(FONT_DATA[p.displayAr].scripts.includes("arabic") && FONT_DATA[p.bodyAr].scripts.includes("arabic"), `${a}/${p.id}: Arabic fonts must cover arabic`);
    assert(LATIN_DISPLAY.includes(p.display), `${a}/${p.id}: Latin display ${p.display} is not in the modern palette`);
    assert(ARABIC_DISPLAY.includes(p.displayAr), `${a}/${p.id}: Arabic display ${p.displayAr} is not in the modern palette`);
    assert(!p.accent || ACCENTS.includes(p.accent), `${a}/${p.id}: accent ${p.accent} must be a mono label face or a serif italic`);
  }
  for (const t of THEME_SECTION_TYPES) {
    const prefs = d.preferredVariants[t] ?? [];
    assert(prefs.length > 0, `${a}: no preferred variants for ${t}`);
    for (const v of prefs) assert(VARIANT_CATALOG[t]?.includes(v), `${a}: unknown variant ${t}/${v}`);
    assert(new Set(prefs).size === prefs.length, `${a}: duplicate variants for ${t}`);
  }
  for (const s of d.signature) assert(/^#[0-9a-f]{6}$/.test(s.accent) && /^#[0-9a-f]{6}$/.test(s.pop), `${a}: bad signature hex`);
  for (const s of d.signature) assert(!bandOrange(s.accent) && !bandOrange(s.pop), `${a}: signature "${s.name}" is orange (${s.accent} / ${s.pop})`);
  assert(!/terracotta|saffron|tomato|tangerine|coral|amber|apricot|ochre|orange/i.test(`${d.description} ${d.signature.map((s) => s.name).join(" ")}`), `${a}: description/signatures still promise orange`);
  assert(d.dividers.length > 0 && d.dividers.every((x) => MODERN_DIVIDERS.includes(x)), `${a}: dividers must be modern (${d.dividers})`);
  assert(d.texture.opacity <= GRAIN_MAX, `${a}: grain opacity ${d.texture.opacity} > ${GRAIN_MAX}`);
  assert(Math.abs(d.tilt[0]) <= 3 && Math.abs(d.tilt[1]) <= 3, `${a}: tilt beyond 3° (${d.tilt})`);
  assert(d.borderWidth > 0 && d.borderWidth <= 2, `${a}: border width ${d.borderWidth}`);
  assert(d.glass.alpha >= 0.3 && d.glass.alpha <= 1 && d.glass.blur >= 8 && d.glass.blur <= 32, `${a}: glass ${JSON.stringify(d.glass)}`);
  for (const [attr, value] of [
    ["data-btn", d.button],
    ["data-card", d.card],
    ["data-emphasis", d.emphasis],
    ["data-mask", d.mask],
    ["data-glyph", d.glyph],
    ["data-shadow", d.shadow],
    ["data-texture", d.texture.kind],
    ["data-radius", d.radius.kind],
    ["data-surfaces", d.surfaces.kind],
  ] as const) {
    assert((THEME_ATTR_VALUES[attr] as readonly string[]).includes(value), `${a}: ${attr}=${value} is not a v2 value`);
  }
}

/* fonts on disk */
for (const f of Object.values(FONT_DATA)) {
  for (const file of f.files) assert(existsSync(join(ROOT, "public", "fonts", f.id, file.file)), `font file missing: ${f.id}/${file.file}`);
}
for (const id of BANNED_FONTS) assert(!existsSync(join(ROOT, "public", "fonts", id)), `fonts: public/fonts/${id} should be removed`);

/* ------------------------------------------------------------------ */
/* emitted-CSS parsers (independent of the engine's internals)         */
/* ------------------------------------------------------------------ */

const RGBA = /^rgb\((\d{1,3}) (\d{1,3}) (\d{1,3}) \/ ([\d.]+)\)$/;
function parseRgba(v: string): { hex: string; a: number } | null {
  const m = RGBA.exec(v.trim());
  if (!m) return null;
  const hex = `#${[m[1], m[2], m[3]].map((x) => Number(x).toString(16).padStart(2, "0")).join("")}`;
  return { hex, a: Number(m[4]) };
}

interface Light {
  w: number;
  h: number;
  x: number;
  y: number;
  hex: string;
  a: number;
  hint: number;
}
const GRADIENT = /radial-gradient\(([\d.]+)% ([\d.]+)% at ([\d.]+)% ([\d.]+)%,(rgb\([^)]*\)),([\d.]+)%,(rgb\([^)]*\))\)/g;
function parseField(v: string): Light[] {
  const out: Light[] = [];
  for (const m of v.matchAll(GRADIENT)) {
    const c = parseRgba(m[5]!);
    const end = parseRgba(m[7]!);
    if (!c || !end || end.a !== 0 || end.hex !== c.hex) return [];
    out.push({ w: Number(m[1]), h: Number(m[2]), x: Number(m[3]), y: Number(m[4]), hex: c.hex, a: c.a, hint: Number(m[6]) / 100 });
  }
  return out;
}

/** The field's color at (x, y) in % of the box, as CSS renders it (color hint falloff, top layer first). */
function fieldAt(bg: string, lights: Light[], x: number, y: number): string {
  let c = bg;
  for (let i = lights.length - 1; i >= 0; i--) {
    const L = lights[i]!;
    const t = Math.hypot((x - L.x) / L.w, (y - L.y) / L.h);
    if (t >= 1) continue;
    const p = t ** (Math.log(0.5) / Math.log(L.hint));
    c = composite(L.hex, L.a * (1 - p), c);
  }
  return c;
}

/* ------------------------------------------------------------------ */
/* the big matrix                                                      */
/* ------------------------------------------------------------------ */

const PAIRS_GLOBAL: [string, string, number][] = [];
for (const bg of ["lp-bg", "lp-surface", "lp-surface-2"]) {
  for (const fg of ["lp-ink", "lp-ink-soft", "lp-ink-mute", "lp-accent-strong", "lp-success", "lp-danger", "lp-warn"]) PAIRS_GLOBAL.push([fg, bg, 4.5]);
  PAIRS_GLOBAL.push(["lp-line-strong", bg, 3]);
}
PAIRS_GLOBAL.push(["lp-accent-strong", "lp-accent-soft", 4.5], ["lp-accent-ink", "lp-accent", 4.5], ["lp-pop-ink", "lp-pop", 4.5], ["lp-dark-ink", "lp-dark", 4.5]);

const PAIRS_SECTION: [string, string, number][] = [
  ["sec-ink", "sec-bg", 4.5],
  ["sec-ink", "sec-card", 4.5],
  ["sec-ink-soft", "sec-bg", 4.5],
  ["sec-ink-soft", "sec-card", 4.5],
  ["sec-card-ink", "sec-card", 4.5],
  ["sec-chip-ink", "sec-chip", 4.5],
  ["sec-ink", "sec-highlight", 4.5],
  ["sec-accent-ink", "sec-accent", 4.5],
  ["sec-accent", "sec-bg", 3],
  ["sec-accent", "sec-card", 3],
  ["sec-line-strong", "sec-bg", 3],
  ["sec-success", "sec-bg", 4.5],
  ["sec-success", "sec-card", 4.5],
  ["sec-danger", "sec-bg", 4.5],
  ["sec-danger", "sec-card", 4.5],
  ["sec-warn", "sec-bg", 4.5],
  ["sec-warn", "sec-card", 4.5],
];

/** Minimum ΔEOK between color blocks so the page rhythm (DESIGN.md §4) is actually visible. */
const DISTINCT: [string, string, number][] = [
  ["surface:sec-bg", "base:sec-bg", 0.017],
  ["soft:sec-bg", "base:sec-bg", 0.03],
  ["dark:sec-bg", "base:sec-bg", 0.045],
  ["accent:sec-bg", "base:sec-bg", 0.08],
  ["pop:sec-bg", "base:sec-bg", 0.06],
];

const stats = { worstText: 21, worstAccent: 21, worstGlass: 21, worstAuroraText: 21, worstAuroraAccent: 21, minAurora: 1, maxGlassAlpha: 0, minGlassAlpha: 1, maxCss: 0, minHighlight: 1, worstStageText: 21, minStageDelta: 1, maxStageHueDrift: 0 };

/** Stage tones may only drift this far (OKLCH hue, degrees) from the accent's or the block's own hue. */
const STAGE_HUE_DRIFT = 20;

/**
 * Section pairs that must hold for every theme (product-derived or hand-edited), plus glass over any
 * backdrop and the aurora field sampled on a `grid`×`grid` lattice (+ each light's center).
 */
function checkSections(t: Record<string, string>, label: string, grid: number) {
  for (const sbg of SECTION_BGS) {
    const k = (name: string) => t[`${sbg}:${name}`]!;
    for (const [fg, bg, min] of PAIRS_SECTION) {
      const r = contrast(k(fg), k(bg));
      if (min >= 4.5) stats.worstText = Math.min(stats.worstText, r);
      else if (fg === "sec-accent") stats.worstAccent = Math.min(stats.worstAccent, r);
      if (r < min) fail(`${label}: [${sbg}] ${fg} on ${bg} = ${r.toFixed(2)} < ${min} (${k(fg)} / ${k(bg)})`);
    }
    // the highlighter block must actually read as a highlight on its block
    const hl = deltaE(k("sec-highlight"), k("sec-bg"));
    stats.minHighlight = Math.min(stats.minHighlight, hl);
    if (hl < 0.04) fail(`${label}: [${sbg}] --sec-highlight invisible on its block (ΔE ${hl.toFixed(3)})`);
    // chip text keeps the section's polarity (no dark label inside a light-text block, or vice versa)
    const inkUp = luminance(k("sec-ink")) > luminance(k("sec-bg"));
    const chipUp = luminance(k("sec-chip-ink")) > luminance(k("sec-chip"));
    assert(inkUp === chipUp, `${label}: [${sbg}] chip text flips polarity (${k("sec-chip-ink")} on ${k("sec-chip")})`);

    // frosted glass: text stays AA whatever photo is behind the chip, and on the opaque fallback
    const glass = parseRgba(k("sec-glass"));
    if (!glass) {
      fail(`${label}: [${sbg}] --sec-glass is not rgb(… / a): ${k("sec-glass")}`);
    } else {
      stats.maxGlassAlpha = Math.max(stats.maxGlassAlpha, glass.a);
      stats.minGlassAlpha = Math.min(stats.minGlassAlpha, glass.a);
      const ink = k("sec-glass-ink");
      for (const behind of ["#000000", "#ffffff", k("sec-bg")]) {
        const r = contrast(ink, composite(glass.hex, glass.a, behind));
        stats.worstGlass = Math.min(stats.worstGlass, r);
        if (r < 4.5) fail(`${label}: [${sbg}] glass ink ${ink} over ${behind} = ${r.toFixed(2)} < 4.5 (glass ${k("sec-glass")})`);
      }
      const rs = contrast(ink, k("sec-glass-solid"));
      if (rs < 4.5) fail(`${label}: [${sbg}] glass ink on --sec-glass-solid = ${rs.toFixed(2)}`);
      assert(parseRgba(k("sec-glass-border")), `${label}: [${sbg}] --sec-glass-border is not rgb(… / a)`);
    }

    // aurora: three soft lights from product hues; text and buttons keep contrast everywhere on it
    const lights = parseField(k("lp-aurora"));
    if (lights.length !== 3) {
      fail(`${label}: [${sbg}] --lp-aurora is not three radial lights: ${k("lp-aurora").slice(0, 120)}`);
      continue;
    }
    for (let i = 0; i < 3; i++) {
      const own = parseRgba(k(`lp-aurora-${i + 1}`));
      assert(own && own.hex === lights[i]!.hex && own.a === lights[i]!.a, `${label}: [${sbg}] --lp-aurora-${i + 1} ≠ field light ${i + 1}`);
      stats.minAurora = Math.min(stats.minAurora, lights[i]!.a);
      assert(lights[i]!.a <= 0.55, `${label}: [${sbg}] aurora light ${i + 1} too strong (${lights[i]!.a})`);
    }
    const pts: [number, number][] = lights.map((l) => [l.x, l.y]);
    for (let gx = 0; gx < grid; gx++) for (let gy = 0; gy < grid; gy++) pts.push([(gx * 100) / (grid - 1), (gy * 100) / (grid - 1)]);
    const fieldLeaks: string[] = [];
    for (const [x, y] of pts) {
      const c = fieldAt(k("sec-bg"), lights, x, y);
      measureBlend(c, `[${sbg}] aurora at ${x.toFixed(0)}%,${y.toFixed(0)}%`, fieldLeaks);
      const ri = Math.min(contrast(k("sec-ink"), c), contrast(k("sec-ink-soft"), c));
      const ra = contrast(k("sec-accent"), c);
      stats.worstAuroraText = Math.min(stats.worstAuroraText, ri);
      stats.worstAuroraAccent = Math.min(stats.worstAuroraAccent, ra);
      if (ri < 4.5) fail(`${label}: [${sbg}] text on aurora at ${x.toFixed(0)}%,${y.toFixed(0)}% = ${ri.toFixed(2)} < 4.5`);
      if (ra < 3) fail(`${label}: [${sbg}] --sec-accent on aurora at ${x.toFixed(0)}%,${y.toFixed(0)}% = ${ra.toFixed(2)} < 3`);
    }
    if (fieldLeaks.length) fail(`${label}: orange in the aurora field: ${fieldLeaks.slice(0, 2).join(" · ")}`);
    // stage glow (behind a cutout, over the plain section): its center is light 1 at full strength
    const stage = /^radial-gradient\(closest-side,(rgb\([^)]*\)),/.exec(k("lp-stage-glow"));
    const center = stage ? parseRgba(stage[1]!) : null;
    if (!center) fail(`${label}: [${sbg}] --lp-stage-glow malformed`);
    else {
      const c = composite(center.hex, center.a, k("sec-bg"));
      assert(contrast(k("sec-ink"), c) >= 4.5 && contrast(k("sec-accent"), c) >= 3, `${label}: [${sbg}] stage glow lowers contrast below AA`);
    }
    // product stage tint: one clean hue, clearly off its block, the block's ink AA on every tone
    {
      const st = k("mx-stage");
      const de = deltaE(st, k("sec-bg"));
      stats.minStageDelta = Math.min(stats.minStageDelta, de);
      if (de < 0.03) fail(`${label}: [${sbg}] --mx-stage barely separates from its block (ΔE ${de.toFixed(3)}: ${st} / ${k("sec-bg")})`);
      for (const name of ["mx-stage", "mx-stage-hi", "mx-stage-lo"]) {
        const r = contrast(k("sec-ink"), k(name));
        stats.worstStageText = Math.min(stats.worstStageText, r);
        if (r < 4.5) fail(`${label}: [${sbg}] --sec-ink on --${name} = ${r.toFixed(2)} < 4.5 (${k(name)})`);
      }
      // never a mix of two hues: with a colorful source, the stage keeps chroma and one of its hues
      const A = toOklch(t["lp-accent"]!);
      const B = toOklch(k("sec-bg"));
      const S = toOklch(st);
      if (Math.max(A.c, B.c >= 0.08 ? B.c : 0) >= 0.06) {
        // hue is only meaningful with some chroma (8-bit rounding swings the hue of near-grays)
        const drift = S.c < 0.025 ? 0 : Math.min(A.c >= 0.03 ? hueDistance(S.h, A.h) : 180, B.c >= 0.02 ? hueDistance(S.h, B.h) : 180);
        stats.maxStageHueDrift = Math.max(stats.maxStageHueDrift, drift);
        if (S.c < 0.01 || drift > STAGE_HUE_DRIFT) fail(`${label}: [${sbg}] --mx-stage ${st} is muddy (C ${S.c.toFixed(3)}, hue drift ${drift.toFixed(0)}° from accent ${t["lp-accent"]} / block ${k("sec-bg")})`);
      }
    }
    // material tokens always compose inside box-shadow lists
    for (const name of COMPOSABLE) assert(k(name) && k(name) !== "none" && !k(name).includes("undefined"), `${label}: [${sbg}] ${name} is not composable (${k(name)})`);
    // no blur beyond 72px (Chromium seams under large rounded panels, paint cost on phones)
    for (const name of ["lp-shadow-s", "lp-shadow-m", "lp-shadow-l", "lp-shadow-glow"]) {
      for (const layer of k(name).split(",")) {
        const blur = /^(?:inset )?0 -?[\d.]+(?:px)? ([\d.]+)px/.exec(layer.trim());
        if (blur && Number(blur[1]) > 72) fail(`${label}: [${sbg}] ${name} blurs ${blur[1]}px > 72px`);
      }
    }
  }
}

/** Violet/indigo band an aurora light may only use when the product itself lives there. */
const violet = (hex: string) => {
  const o = toOklch(hex);
  return o.c >= 0.035 && o.h >= 262 && o.h <= 318;
};

const REQUIRED_TOKENS = [
  "lp-bg", "lp-surface", "lp-surface-2", "lp-soft", "lp-ink", "lp-ink-soft", "lp-ink-mute", "lp-line", "lp-line-strong", "lp-accent", "lp-accent-ink",
  "lp-accent-soft", "lp-accent-strong", "lp-pop", "lp-pop-ink", "lp-dark", "lp-dark-ink", "lp-success", "lp-danger", "lp-warn", "lp-a-50", "lp-a-950",
  "lp-n-50", "lp-n-950", "lp-font-display", "lp-font-body", "lp-font-accent", "lp-font-label", "lp-font-emphasis", "lp-emphasis-style",
  "lp-display-weight", "lp-medium-weight", "lp-semibold-weight", "lp-display-tracking", "lp-display-case", "lp-display-lh", "lp-body-lh", "lp-label-case", "lp-label-tracking",
  "lp-step--1", "lp-step-0", "lp-step-1", "lp-step-2", "lp-step-3", "lp-step-4", "lp-step-5", "lp-step-6",
  "lp-radius-xs", "lp-radius-s", "lp-radius-m", "lp-radius-l", "lp-radius-xl", "lp-radius-btn", "lp-radius-media", "lp-radius-pill",
  "lp-radius-panel", "lp-panel-inset", "lp-panel-gap", "lp-border-w", "lp-border-style",
  "lp-shadow-s", "lp-shadow-m", "lp-shadow-l", "lp-shadow-glow", "lp-highlight", "lp-highlight-accent", "lp-shadow-product", "lp-shadow-product-filter",
  "lp-glass-blur", "lp-glass-filter", "sec-glass", "sec-glass-ink", "sec-glass-border", "sec-glass-solid",
  "lp-aurora-1", "lp-aurora-2", "lp-aurora-3", "lp-aurora", "lp-stage-glow", "mx-stage", "mx-stage-hi", "mx-stage-lo",
  "lp-ease", "lp-ease-out", "lp-ease-spring", "lp-ease-in-out", "lp-ease-expo-out", "lp-ease-quint-out", "lp-ease-pop",
  "lp-dur-s", "lp-dur-m", "lp-dur-l", "lp-stagger", "lp-reveal-distance", "lp-space-section", "lp-container", "lp-gutter",
  "lp-grain", "lp-grain-opacity", "lp-tilt-min", "lp-tilt-max", "lp-ornament",
  "sec-bg", "sec-ink", "sec-ink-soft", "sec-line", "sec-line-strong", "sec-accent", "sec-accent-ink", "sec-card", "sec-card-ink", "sec-chip", "sec-chip-ink",
  "sec-highlight", "sec-success", "sec-danger", "sec-warn",
];
const ATTR_KEYS = ["data-arch", ...Object.keys(THEME_ATTR_VALUES)].sort();

/** Contract checks shared by product-derived and hand-edited builds. */
function checkContract(theme: ReturnType<typeof buildTheme>, spec: ThemeSpec, locale: Locale, label: string) {
  const t = theme.tokens;
  for (const name of REQUIRED_TOKENS) assert(typeof t[name] === "string" && t[name]!.length > 0, `${label}: missing token ${name}`);
  assert(JSON.stringify(Object.keys(theme.attrs).sort()) === JSON.stringify(ATTR_KEYS), `${label}: attrs keys ${Object.keys(theme.attrs)}`);
  assert((ARCHETYPES as readonly string[]).includes(theme.attrs["data-arch"]!), `${label}: bad data-arch`);
  for (const [attr, values] of Object.entries(THEME_ATTR_VALUES)) {
    assert((values as readonly string[]).includes(theme.attrs[attr]!), `${label}: ${attr}="${theme.attrs[attr]}" is not in the DESIGN.md §2.5 value set`);
  }
  assert(!/undefined|NaN|null|Infinity|<\/|@import|javascript:|expression\(/i.test(theme.css), `${label}: unsafe/invalid CSS`);
  assert((theme.css.match(/{/g) ?? []).length === (theme.css.match(/}/g) ?? []).length, `${label}: unbalanced braces`);
  assert((theme.css.match(/\(/g) ?? []).length === (theme.css.match(/\)/g) ?? []).length, `${label}: unbalanced parentheses`);
  stats.maxCss = Math.max(stats.maxCss, theme.css.length);
  // ≥ 1: an admin may pick one family for display and body with no accent
  assert(theme.fontIds.length >= 1 && theme.fontIds.every((id) => id in FONT_DATA), `${label}: bad fontIds ${theme.fontIds}`);
  assert(theme.dividers.length > 0 && theme.dividers.every((d) => (DIVIDERS as readonly string[]).includes(d)), `${label}: dividers ${theme.dividers}`);
  // grain: the only texture, never above 3%
  const grain = Number(t["lp-grain-opacity"]);
  assert(grain >= 0 && grain <= GRAIN_MAX, `${label}: grain opacity ${grain}`);
  assert((theme.attrs["data-texture"] === "none") === (t["lp-grain"] === "none"), `${label}: --lp-grain disagrees with data-texture`);
  // surfaces: panels are inset + rounded, flush is edge to edge
  const panels = theme.attrs["data-surfaces"] === "panels";
  assert(panels ? t["lp-panel-inset"] !== "0px" : t["lp-panel-inset"] === "0px" && t["lp-radius-panel"] === "0px", `${label}: panel tokens vs data-surfaces`);
  // lengths stay lengths: a bare 0 breaks every max() / min() / calc() that reads a radius or spacing token
  for (const name of ["lp-radius-xs", "lp-radius-s", "lp-radius-m", "lp-radius-l", "lp-radius-xl", "lp-radius-btn", "lp-radius-media", "lp-radius-panel", "lp-panel-inset", "lp-panel-gap", "lp-border-w", "lp-reveal-distance"]) {
    assert(t[name] !== "0" && !/(^|[(,\s])0(?=[,)\s]|$)/.test(t[name]!), `${label}: ${name} has a bare 0 (${t[name]})`);
  }
  // a call to action is never a square slab: ≥ 12px corners (or a pill)
  const btnR = Number.parseFloat(t["lp-radius-btn"]!);
  assert(btnR >= 12, `${label}: --lp-radius-btn ${t["lp-radius-btn"]} < 12px`);
  // glass never over-saturates what is behind it (a cream page turns peach)
  const sat = /saturate\((\d+)%\)/.exec(t["lp-glass-filter"]!);
  assert(sat && Number(sat[1]) <= 130, `${label}: glass saturation ${t["lp-glass-filter"]}`);
  if (spec.surfaces !== "archetype") assert(theme.attrs["data-surfaces"] === spec.surfaces, `${label}: surfaces override ignored`);
  if (spec.shadow !== "archetype") assert(theme.attrs["data-shadow"] === spec.shadow, `${label}: shadow override ignored`);
  // motion off: no movement anywhere
  if (spec.motion === "off") assert(t["lp-dur-m"] === "0ms" && t["lp-ease-spring"] === "linear" && t["lp-reveal-distance"] === "0px", `${label}: motion off still moves`);
  if (locale === "ar") {
    assert(FONT_DATA[theme.fontIds[0] as keyof typeof FONT_DATA].scripts.includes("arabic"), `${label}: ar display font lacks arabic`);
    assert(t["lp-display-tracking"] === "0" && t["lp-display-case"] === "none" && t["lp-label-tracking"] === "0" && Number(t["lp-body-lh"]) >= 1.7, `${label}: arabic overrides`);
    assert(theme.attrs["data-emphasis"] !== "italic" && t["lp-emphasis-style"] === "normal", `${label}: italic emphasis in arabic`);
    // every Arabic-facing stack leads with an Arabic face: a Latin face first would also own the
    // space (U+0020) between Arabic words — a mono label face splits Arabic labels into islands
    for (const token of ["lp-font-display", "lp-font-body", "lp-font-accent", "lp-font-label", "lp-font-emphasis"]) {
      const family = /^"([^"]+)"/.exec(t[token]!)?.[1];
      const font = Object.values(FONT_DATA).find((f) => f.family === family);
      assert(font?.scripts.includes("arabic"), `${label}: Arabic page sets ${token} to Latin-only ${family}`);
    }
  }
  // root --sec-* and materials equal the base map
  for (const k of ["sec-bg", "sec-ink", "sec-accent", "sec-card", "sec-glass", "lp-aurora", "lp-shadow-m"]) assert(t[k] === t[`base:${k}`], `${label}: root ${k} ≠ base`);
  for (const [fg, bg, min] of PAIRS_GLOBAL) {
    const r = contrast(t[fg]!, t[bg]!);
    if (min >= 4.5) stats.worstText = Math.min(stats.worstText, r);
    if (r < min) fail(`${label}: ${fg} on ${bg} = ${r.toFixed(2)} < ${min} (${t[fg]} / ${t[bg]})`);
  }
}

/** Minimum ΔEOK between a chip and its block (product-derived themes; dark = block luminance < 0.05). */
const CHIP_MIN = 0.03;
const CHIP_MIN_DARK = 0.055;

let builds = 0;
const worstDistinct: Record<string, number> = {};
const worstChip = { light: 1, dark: 1 };
const variety: Record<string, Set<string>> = {};
const surfacesSeen: Record<string, Set<string>> = {};
const samples: { label: string; tokens: Record<string, string>; spec: ThemeSpec }[] = [];
let violetLeaks = 0;
const t0 = performance.now();
let buildMs = 0;

for (const archetype of ARCHETYPES as readonly Archetype[]) {
  surfacesSeen[archetype] = new Set();
  for (const [photoName, palette] of Object.entries(PALETTES)) {
    const key = `${archetype} × ${photoName}`;
    variety[key] = new Set();
    for (let seed = 0; seed < SEEDS; seed++) {
      const label = `${key} seed ${seed}`;
      let spec: ThemeSpec;
      try {
        spec = themeFromProduct({ category: "other", palette, aiVibe: null, archetype, seed });
      } catch (e) {
        fail(`${label}: themeFromProduct threw ${(e as Error).message}`);
        continue;
      }
      assert(ThemeSpec.safeParse(spec).success, `${label}: invalid ThemeSpec`);
      assert(spec.archetype === archetype, `${label}: archetype not respected`);
      assert(!bandOrange(spec.palette.accent) && !bandOrange(spec.palette.pop), `${label}: orange in the spec (${spec.palette.accent} / ${spec.palette.pop})`);
      assert(spec.dividers.every((d) => ARCHETYPE_DEFS[archetype].dividers.includes(d as never)), `${label}: dividers outside the archetype family`);
      const again = themeFromProduct({ category: "other", palette, aiVibe: null, archetype, seed });
      assert(JSON.stringify(again) === JSON.stringify(spec), `${label}: themeFromProduct not deterministic`);
      variety[key]!.add(`${spec.palette.accent}|${spec.palette.pop}|${spec.palette.base}|${spec.fonts.display}|${spec.fonts.displayAr}|${spec.surfaces}`);
      if (seed >= BUILT_SEEDS) continue;

      for (const locale of LOCALES) {
        let theme: ReturnType<typeof buildTheme>;
        const b0 = performance.now();
        try {
          theme = buildTheme(spec, locale);
        } catch (e) {
          fail(`${label} ${locale}: buildTheme threw ${(e as Error).message}`);
          continue;
        }
        buildMs += performance.now() - b0;
        builds++;
        const t = theme.tokens;
        surfacesSeen[archetype]!.add(theme.attrs["data-surfaces"]!);
        checkContract(theme, spec, locale, `${label} ${locale}`);
        const leaks = orangeLeaks(theme.css);
        if (leaks.length) fail(`${label} ${locale}: orange in the emitted CSS: ${leaks.slice(0, 4).join(" ")}`);
        // no orange blends: the engine's own audit on every build, the independent CSS measure on a sample
        const audit = orangeMixesInTokens(t);
        if (audit.length) fail(`${label} ${locale}: engine blend audit: ${audit.slice(0, 2).join(" · ")}`);
        if (seed < BLEND_SEEDS) {
          const bl = blendLeaks(t);
          if (bl.length) fail(`${label} ${locale}: orange blends: ${bl.slice(0, 3).join(" · ")}`);
        }
        // dense aurora sampling for a few seeds, a coarser lattice elsewhere (same guarantees)
        checkSections(t, `${label} ${locale}`, seed < DENSE_SEEDS ? 41 : 9);
        // aurora hues come from the product: no indigo/violet light unless accent or pop is violet
        if (!violet(t["lp-accent"]!) && !violet(t["lp-pop"]!)) {
          const third = parseRgba(t["lp-aurora-3"]!);
          if (third && third.a > 0 && violet(third.hex)) violetLeaks++;
        }
        for (const [a, b, min] of DISTINCT) {
          const d = deltaE(t[a]!, t[b]!);
          worstDistinct[a] = Math.min(worstDistinct[a] ?? 1, d);
          if (d < min) fail(`${label} ${locale}: ${a} too close to ${b} (ΔE ${d.toFixed(3)} < ${min}: ${t[a]} / ${t[b]})`);
        }
        // chips must read as pills, not loose text — on near-black grounds chroma alone does not register
        for (const sbg of SECTION_BGS) {
          const d = deltaE(t[`${sbg}:sec-chip`]!, t[`${sbg}:sec-bg`]!);
          const dark = luminance(t[`${sbg}:sec-bg`]!) < 0.05;
          const min = dark ? CHIP_MIN_DARK : CHIP_MIN;
          worstChip[dark ? "dark" : "light"] = Math.min(worstChip[dark ? "dark" : "light"], d);
          if (d < min) fail(`${label} ${locale}: [${sbg}] chip barely separates from its block (ΔE ${d.toFixed(3)} < ${min})`);
        }
        if (locale === "fr" && seed < 2 && (photoName === "vivid red" || photoName === "black product")) samples.push({ label, tokens: t, spec });
      }
    }
    if (variety[key]!.size < 8) fail(`${key}: only ${variety[key]!.size} distinct looks across ${SEEDS} seeds`);
  }
}
const elapsed = performance.now() - t0;
assert(violetLeaks === 0, `aurora: ${violetLeaks} themes put a violet light on a non-violet product`);
for (const a of ARCHETYPES) {
  if (ARCHETYPE_DEFS[a].surfaces.alt > 0) assert(surfacesSeen[a]!.size === 2, `${a}: surfaces never varies across seeds`);
}

/* ------------------------------------------------------------------ */
/* admin-edited specs: any valid ThemeSpec must keep the guarantees    */
/* ------------------------------------------------------------------ */
const FUZZ = FULL ? 600 : 100;
/** the hand-edited specs that also get the blend measure, and the dense aurora grid: the same shares of FUZZ in both sizes */
const FUZZ_BLEND = FUZZ / 2;
const FUZZ_DENSE = Math.ceil(FUZZ / 6);
let fuzzBuilds = 0;
{
  const rnd = mulberry32(0xf00d);
  const any = <T,>(items: readonly T[]) => items[Math.floor(rnd() * items.length)]!;
  const EDGE = ["#000000", "#ffffff", "#808080", "#767676", "#ff0000", "#00ff00", "#0000ff", "#ffff00", "#00ffff", "#ff00ff", "#111111", "#fefefe", "#ff7a1a", "#b4502c", "#ff8a1f", "#e9ad3f", "#f2b48c", "#c8871a", "#4a2a1f"];
  const randomHex = () => (rnd() < 0.2 ? any(EDGE) : `#${Array.from({ length: 3 }, () => Math.floor(rnd() * 256).toString(16).padStart(2, "0")).join("")}`);
  const fontIds = [...Object.keys(FONT_DATA), "aref-ruqaa", "caveat"];
  for (let i = 0; i < FUZZ; i++) {
    const input = {
      archetype: any(ARCHETYPES),
      seed: Math.floor(rnd() * 2_147_483_647),
      palette: { accent: randomHex(), pop: randomHex(), neutralHue: rnd() < 0.5 ? rnd() * 360 : undefined, base: any(["light", "tinted", "dark"] as const), harmony: any(HARMONIES) },
      fonts: { display: any(fontIds), body: any(fontIds), accent: rnd() < 0.2 ? "not-a-font" : any(fontIds), displayAr: any(fontIds), bodyAr: any(fontIds) },
      radius: any(["archetype", "none", "subtle", "soft", "round"] as const),
      shadow: any(["archetype", "none", "soft", "deep", "glow"] as const),
      texture: any(["archetype", "none", "grain"] as const),
      surfaces: any(["archetype", "flush", "panels"] as const),
      motion: any(["calm", "lively", "off"] as const),
      dividers: rnd() < 0.5 ? [] : DIVIDERS.filter(() => rnd() < 0.4).slice(0, 4),
      ornament: Math.round(rnd() * 20) / 10,
    };
    const spec = ThemeSpec.parse(input);
    const label = `fuzz ${i} (${spec.archetype}/${spec.palette.harmony}/${spec.palette.base} ${spec.palette.accent}+${spec.palette.pop})`;
    for (const locale of LOCALES) {
      let theme: ReturnType<typeof buildTheme>;
      try {
        theme = buildTheme(spec, locale);
      } catch (e) {
        fail(`${label} ${locale}: buildTheme threw ${(e as Error).message}`);
        continue;
      }
      fuzzBuilds++;
      checkContract(theme, spec, locale, `${label} ${locale}`);
      const leaks = orangeLeaks(theme.css);
      if (leaks.length) fail(`${label} ${locale}: orange in the emitted CSS: ${leaks.slice(0, 4).join(" ")}`);
      const audit = orangeMixesInTokens(theme.tokens);
      if (audit.length) fail(`${label} ${locale}: engine blend audit: ${audit.slice(0, 2).join(" · ")}`);
      if (i < FUZZ_BLEND) {
        const bl = blendLeaks(theme.tokens);
        if (bl.length) fail(`${label} ${locale}: orange blends: ${bl.slice(0, 3).join(" · ")}`);
      }
      checkSections(theme.tokens, `${label} ${locale}`, i < FUZZ_DENSE ? 41 : 9);
      if (spec.dividers.length) assert(JSON.stringify(theme.dividers) === JSON.stringify(spec.dividers), `${label}: spec dividers ignored`);
    }
  }
}

/* calm bloom: the blush stays a dusty whisper (#ffdfe3 at C 0.036 read candy pink over a whole page) */
let bloomCalmSoftMax = 0;
{
  for (let seed = 0; seed < 24; seed++) {
    for (const keywords of ["Abaya de prière fille — dentelle beige", "عباية صلاة للبنات"]) {
      const spec = themeFromProduct({ category: "kids", palette: PALETTES["beige lace"]!, aiVibe: null, keywords, archetype: "bloom", seed });
      const theme = buildTheme(spec, "fr");
      const c = culoriOklch(theme.tokens["lp-soft"]!)?.c ?? 0;
      bloomCalmSoftMax = Math.max(bloomCalmSoftMax, c);
      assert(c <= 0.026, `calm bloom seed ${seed}: soft ${theme.tokens["lp-soft"]} (C ${c.toFixed(3)}) is not a dusty blush`);
      assert(theme.attrs["data-emphasis"] !== "highlight", `calm bloom seed ${seed}: highlighter emphasis`);
    }
  }
}

/* adversarial hand-edited specs: the pairs that blend through orange must come out clean */
let adversarialBuilds = 0;
let adversarialMoved = 0;
{
  const PAIRS: readonly (readonly [string, string, (typeof HARMONIES)[number]])[] = [
    ["#c04558", "#a6c99f", "warm-butter"], // crimson over butter (the generator's original case)
    ["#d03643", "#fbd530", "warm-butter"],
    ["#c8102e", "#f2d16b", "pop-complement"],
    ["#e11d48", "#fbd530", "pop-complement"],
    ["#c49800", "#dd385b", "blush-berry"], // gold beside a rose pop
    ["#ffc21f", "#f9a8c0", "blush-berry"],
    ["#b6595d", "#93ae8d", "clay-sage"], // rose clay beside sage
    ["#97363e", "#184735", "mono-luxe"], // oxblood beside bottle green
    ["#a08400", "#6b1d29", "mono-luxe"],
    ["#d72a45", "#f9ed52", "ink-accent"], // signal red + highlighter
    ["#c33d45", "#327957", "earth-triad"],
    ["#ff7a1a", "#ffd23f", "warm-butter"], // orange picked in the builder
  ];
  const archs = ["hearth", "bloom", "souk", "playground", "editorial", "maison"] as const;
  let n = 0;
  for (const [accent, pop, harmony] of PAIRS) {
    for (const base of ["light", "tinted", "dark"] as const) {
      const archetype = archs[n++ % archs.length]!;
      const f = ARCHETYPE_DEFS[archetype].fonts[0]!;
      const spec = ThemeSpec.parse({
        archetype,
        seed: n,
        palette: { accent, pop, base, harmony },
        fonts: { display: f.display, body: f.body, displayAr: f.displayAr, bodyAr: f.bodyAr },
        dividers: ["fade", "curve"],
      });
      const label = `adversarial ${accent}+${pop} ${harmony}/${base} (${archetype})`;
      const theme = buildTheme(spec, "fr");
      adversarialBuilds++;
      if (theme.tokens["lp-accent"] !== accent) adversarialMoved++;
      checkContract(theme, spec, "fr", label);
      const leaks = orangeLeaks(theme.css);
      if (leaks.length) fail(`${label}: orange in the emitted CSS: ${leaks.slice(0, 4).join(" ")}`);
      const audit = orangeMixesInTokens(theme.tokens);
      if (audit.length) fail(`${label}: engine blend audit: ${audit.slice(0, 2).join(" · ")}`);
      const bl = blendLeaks(theme.tokens);
      if (bl.length) fail(`${label}: orange blends: ${bl.slice(0, 3).join(" · ")}`);
      checkSections(theme.tokens, label, 17);
    }
  }
  // a calm, already-clean pair is left exactly as designed (the guard only moves what blends orange)
  for (const [accent, pop, harmony] of [["#5d2e45", "#efe2c4", "blush-berry"], ["#2f4a6b", "#e8dcc6", "mono-luxe"], ["#3f6f63", "#a8bea0", "clay-sage"]] as const) {
    const f = ARCHETYPE_DEFS.bloom.fonts[0]!;
    const spec = ThemeSpec.parse({ archetype: "bloom", seed: 7, palette: { accent, pop, base: "light", harmony }, fonts: { display: f.display, body: f.body, displayAr: f.displayAr, bodyAr: f.bodyAr } });
    const t = buildTheme(spec, "fr").tokens;
    assert(t["lp-accent"] === accent && t["lp-pop"] === pop, `blend guard moved a clean pair ${accent}/${pop} → ${t["lp-accent"]}/${t["lp-pop"]}`);
  }
}

/* ranking & fonts edge cases */
{
  const r = rankArchetypes({ category: "__proto__" as never, palette: null, aiVibe: null });
  assert(r.length === ARCHETYPES.length && r[0]!.reason.startsWith("other "), `rank: unknown category should rank like "other" (${r[0]?.reason})`);
  // display = body (single family): the second preload must not be the mono accent
  const ed = themeFromProduct({ category: "fashion", palette: null, archetype: "editorial", seed: 0 });
  const sameFamily = buildTheme(
    { ...ed, fonts: { display: "archivo", body: "archivo", accent: "ibm-plex-mono", displayAr: "noto-kufi-arabic", bodyAr: "ibm-plex-sans-arabic" } },
    "fr",
  );
  const pre = fontPreloads(sameFamily.fontIds, "fr", "/", sameFamily.fontWeights);
  assert(pre.length === 1 && pre[0]!.href.includes("/archivo/"), `fontPreloads: accent face preloaded ${JSON.stringify(pre)}`);
  assert(fontPreloads(["instrument-serif", "tajawal"], "ar", "/").every((p) => p.href.includes("/tajawal/")), "fontPreloads ar: Latin-only face preloaded");
  // mono accent → labels use it; no accent → labels use the body face
  assert(sameFamily.tokens["lp-font-label"]!.startsWith('"IBM Plex Mono"'), `lp-font-label should be the mono accent (${sameFamily.tokens["lp-font-label"]})`);
  const noAccent = buildTheme(themeFromProduct({ category: "kitchen", palette: null, archetype: "hearth", seed: 1 }), "fr");
  assert(noAccent.tokens["lp-font-label"] === noAccent.tokens["lp-font-body"], "lp-font-label should fall back to the body face");
  // italic emphasis prefers the display face's own italic (Bodoni italic inside Bodoni headlines)
  const maison = buildTheme({ ...themeFromProduct({ category: "fragrance", palette: null, archetype: "maison", seed: 0 }), fonts: { display: "bodoni-moda", body: "hanken-grotesk", displayAr: "el-messiri", bodyAr: "noto-naskh-arabic" } }, "fr");
  assert(maison.tokens["lp-font-emphasis"]!.startsWith('"Bodoni Moda"') && maison.tokens["lp-emphasis-style"] === "italic", "italic emphasis should use Bodoni's italic");
}

/* fonts css */
{
  for (const locale of LOCALES) {
    const ids = Object.keys(FONT_DATA);
    const css = fontFaceCss(ids, locale, "./");
    assert(css.includes("font-display:swap") && css.includes("size-adjust"), `fontFaceCss ${locale}`);
    const arabicFiles = /-arabic-(?:wght|\d{3})-normal\.woff2/;
    assert(locale === "ar" ? arabicFiles.test(css) : !arabicFiles.test(css), `fontFaceCss ${locale}: arabic subsets`);
    const pre = fontPreloads(["tajawal", "readex-pro", "jetbrains-mono"], locale, "/", [700, 400]);
    assert(pre.length === 2 && pre.every((p) => p.type === "font/woff2"), `fontPreloads ${locale}`);
    if (locale === "ar") assert(pre[0]!.href === "/fonts/tajawal/tajawal-arabic-700-normal.woff2", `fontPreloads ar weight: ${pre[0]!.href}`);
  }
  let threw = false;
  try {
    fontFaceCss(["figtree"], "fr", '/x");background:url(evil');
  } catch {
    threw = true;
  }
  assert(threw, "fontFaceCss must reject unsafe base");
}

/* ------------------------------------------------------------------ */
/* report                                                              */
/* ------------------------------------------------------------------ */

const swatch = (hex: string) => {
  const [r, g, b] = hexRgb(hex);
  return `\x1b[48;2;${r};${g};${b}m    \x1b[0m ${hex}`;
};
console.log(`\n${FULL ? "full sweep" : "seeded subset (--full for every seed)"} · builds: ${builds} (${ARCHETYPES.length} archetypes × ${BUILT_SEEDS} of ${SEEDS} seeds × ${Object.keys(PALETTES).length} photos × ${LOCALES.length} locales) in ${(elapsed / 1000).toFixed(1)}s — buildTheme ${(buildMs / Math.max(1, builds)).toFixed(2)} ms/theme`);
console.log(`worst text contrast ${stats.worstText.toFixed(2)}:1 (≥ 4.5) · worst --sec-accent contrast ${stats.worstAccent.toFixed(2)}:1 (≥ 3)`);
console.log(`glass: worst ink-over-any-backdrop ${stats.worstGlass.toFixed(2)}:1 (≥ 4.5) · fill opacity ${stats.minGlassAlpha}–${stats.maxGlassAlpha}`);
console.log(`aurora: worst text ${stats.worstAuroraText.toFixed(2)}:1 (≥ 4.5) · worst accent ${stats.worstAuroraAccent.toFixed(2)}:1 (≥ 3) · weakest light alpha ${stats.minAurora} · violet leaks ${violetLeaks}`);
console.log(`highlight: min ΔEOK vs its block ${stats.minHighlight.toFixed(3)} (≥ 0.04)`);
console.log(`stage: worst ink on --mx-stage(-hi/-lo) ${stats.worstStageText.toFixed(2)}:1 (≥ 4.5) · min ΔEOK vs block ${stats.minStageDelta.toFixed(3)} (≥ 0.03) · max hue drift ${stats.maxStageHueDrift.toFixed(1)}° (≤ ${STAGE_HUE_DRIFT}°)`);
console.log(`hand-edited specs: ${fuzzBuilds} builds (${FUZZ} random valid ThemeSpecs × ${LOCALES.length} locales)`);
console.log(`no orange: ${noOrangeStats.colors} emitted colors measured in ${noOrangeStats.builds} builds (culori OKLCH) · closest chromatic hue ${noOrangeStats.nearest.toFixed(1)}° outside the 25–75° band`);
console.log(
  `no orange blends: ${cssMixCount} color-mix() in src/landing (${CSS_MIXES.length} distinct) evaluated per block in ${blendStats.builds} builds + fades, ring, washes, aurora field — ${blendStats.measured} blended colors (culori) · closest chromatic blend ${blendStats.nearest.toFixed(2)}° outside the band (${blendStats.worst.slice(0, 120)})`,
);
console.log(`adversarial hand-edited specs: ${adversarialBuilds} builds clean (${adversarialMoved} accents nudged) · calm bloom soft band max C ${bloomCalmSoftMax.toFixed(3)} (≤ 0.026)`);
console.log(`block separation (min ΔEOK vs base): ${DISTINCT.map(([a, , min]) => `${a.split(":")[0]} ${(worstDistinct[a] ?? 0).toFixed(3)} (≥ ${min})`).join(" · ")}`);
console.log(`chip separation (min ΔEOK vs its block): light blocks ${worstChip.light.toFixed(3)} (≥ ${CHIP_MIN}) · near-black blocks ${worstChip.dark.toFixed(3)} (≥ ${CHIP_MIN_DARK})`);
const minVariety = Math.min(...Object.values(variety).map((s) => s.size));
console.log(`seed variety: min ${minVariety} distinct looks / ${SEEDS} seeds per archetype×photo · largest theme CSS ${(stats.maxCss / 1024).toFixed(1)} KB`);
console.log("\nphoto palettes:");
for (const [name, p] of Object.entries(PALETTES)) {
  console.log(`  ${name.padEnd(14)} ${p.colors.slice(0, 3).map((c) => swatch(c.hex)).join("  ")}  bg ${p.background ?? "—"} transparent=${p.transparent} colorful=${p.colorfulness} bright=${p.brightness} warm=${p.warmth}`);
}
console.log("\nsample themes:");
for (const s of samples.filter((_, i) => i % 3 === 0).slice(0, 8)) {
  const t = s.tokens;
  console.log(`  ${s.label} · ${s.spec.palette.harmony} · ${s.spec.palette.base} · ${s.spec.fonts.display}/${s.spec.fonts.body}`);
  console.log(`    bg ${swatch(t["lp-bg"]!)}  ink ${swatch(t["lp-ink"]!)}  accent ${swatch(t["lp-accent"]!)}  pop ${swatch(t["lp-pop"]!)}  soft ${swatch(t["lp-soft"]!)}  dark ${swatch(t["lp-dark"]!)}`);
}
console.log("\nexample (maison, black product, seed 0, ar):");
{
  const spec = themeFromProduct({ category: "fragrance", palette: PALETTES["black product"]!, aiVibe: "luxury", seed: 0 });
  const th = buildTheme(spec, "ar");
  console.log(`  attrs ${JSON.stringify(th.attrs)}`);
  console.log(`  fonts ${th.fontIds.join(", ")} · dividers ${th.dividers.join(", ")} · css ${(th.css.length / 1024).toFixed(1)} KB`);
}

// the engine guards 22–80° (ORANGE_GUARD): nothing it emits sits on the edge of the owner's 25–75° rule
assert(noOrangeStats.nearest >= 2.5, `no orange: an emitted chromatic color sits ${noOrangeStats.nearest.toFixed(1)}° from the band (guard margin lost)`);

if (failures > 0) {
  console.error(`\n✗ ${failures} failure(s):`);
  for (const l of failLog) console.error(`  - ${l}`);
  process.exit(1);
}
console.log("\n✓ all theme checks passed");
