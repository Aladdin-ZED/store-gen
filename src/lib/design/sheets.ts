/**
 * Composition sheets (P6 DESIGN; design.md DES-§5.13, DS47, UX-1; the fold budgets of DES-§5.12): the drawings a
 * variant is built from, as data. One sheet per hero family (H1-H10) and per new or redrawn section (S1-S8): the grid
 * at 390 / 768 / 1440 in grid units, the slots (aspect, CSS width at 390 and 1440, photo role), the type steps and
 * their line caps, the fold stack at 390 (heroes), the price cluster and COD placement, the signature detail, the RTL
 * mirror and the recipe.
 *
 * The registry's `features.fold`, `features.slots` and `features.h` of a sheeted variant are GENERATED from here
 * (`sheetFeatures`), so the drawing and the model cannot drift: `test:registry` fails on a hand-edited value, and
 * the height model (./heights.ts) reads the same fold stacks. Pure data and arithmetic, isomorphic.
 *
 * Grid units (the real CSS, `--lp-gutter` 1 rem and `--lp-container` 1280): 390 = 4 columns in a 358 px container,
 * gutter 16; 768 = 8 columns in 720 px, gutter 24; 1440 = 12 columns in 1,280 px, gutter 32. Cells: IMG media slot,
 * TTL title, KCK kicker, LED lead, PRC price cluster (price, old price, discount chip as one inline-flex unit), CTA
 * primary button, COD the cash-on-delivery line, FCT a fact row, CAP a caption, "·" an empty cell (negative space is
 * drawn). Type steps: D display (the hero title, 44-56 px at 390), T section title (28-32), L lead (18, ar 19), B body
 * (16, ar 17), C caption (13, ar 14), P price (22-24, tabular lining).
 */
import type { FeatureSlot, FoldRow, LayoutFamily } from "./types";

export type Breakpoint = 390 | 768 | 1440;
export type SheetId = "H1" | "H2" | "H3" | "H4" | "H5" | "H6" | "H7" | "H8" | "H9" | "H10" | "S1" | "S2" | "S3" | "S4" | "S5" | "S6" | "S7" | "S8";
export type TypeStep = "D" | "T" | "L" | "B" | "C" | "P";

/** The real grid per breakpoint (base.css `.lp-container`, `--lp-gutter`). */
export const GRID: Readonly<Record<Breakpoint, { cols: 4 | 8 | 12; container: number; gutter: number }>> = {
  390: { cols: 4, container: 358, gutter: 16 },
  768: { cols: 8, container: 720, gutter: 24 },
  1440: { cols: 12, container: 1280, gutter: 32 },
};

/** CSS width of `n` columns at a breakpoint, rounded to the pixel. */
export function span(bp: Breakpoint, n: number): number {
  const g = GRID[bp];
  const col = (g.container - (g.cols - 1) * g.gutter) / g.cols;
  return Math.round(n * col + Math.max(0, n - 1) * g.gutter);
}

/** One cell of a sheet row: what sits there and how many grid columns it spans. */
export type Cell = readonly [what: string, cols: number];

/**
 * One step of a hero's fold stack at 390 (DES-§5.12 budget rows). `gap` is the space before the step. A step is a
 * fixed `px` row, a `vh` cap (of 844; `vhAr` for Arabic), or text lines (`lines` = the cap; the size is `sizePx` at
 * step `step`). `inline` = the step shares the previous step's line (price + CTA on one 52 px line). `optional` = the
 * step leaves the fold (it moves under it) when the stack would pass the 760 px target, the first rung of H28.
 * A `band` or `grid` step holds `inner` steps; its height is its padding plus theirs, at least its `vh` cap.
 */
export interface FoldStep {
  el: FoldRow["el"] | "kicker" | "lead";
  gap: number;
  px?: number;
  vh?: number;
  vhAr?: number;
  lines?: number;
  step?: TypeStep;
  sizePx?: number;
  inline?: true;
  optional?: true;
  /** band / grid: padding (top + bottom) and the steps inside */
  pad?: number;
  inner?: readonly FoldStep[];
}

export interface Sheet {
  id: SheetId;
  /** the registry key `type:variant` the sheet draws */
  key: string;
  family: LayoutFamily;
  grammars?: readonly string[];
  treatments?: readonly string[];
  grid: Readonly<Record<Breakpoint, readonly (readonly Cell[])[]>>;
  slots: readonly FeatureSlot[];
  /** type steps and line caps at 390 / 1440 */
  type: { title: { step: TypeStep; px390: number; lines390: number; lines1440: number }; lead?: { lines390: number } };
  /** hero families only: the fold stack at 390 (after the header 68 and the announcement 42) */
  fold?: readonly FoldStep[];
  /** where the price cluster and the COD line sit */
  price: "stacked" | "line" | "band" | "cell" | "none";
  cod: "below" | "cell" | "band" | "none";
  /** estimated section height at 390, in screens of 844 (the registry's `features.h`) */
  h: number;
  signature: string;
  /** decorative details the sheet allows beside the signature */
  details: number;
  rtl: string;
  recipe: string;
}

/* §5.12 control heights and gaps at 390 (px) */
export const ROW = { header: 68, announcement: 42, price: 40, button: 52, priceCta: 52, cod: 24, callout: 28, fact: 32 } as const;
export const GAP = { afterImage: 16, text: 12, beforeCod: 8 } as const;
/** the fold target and the gate's hard line at 390 × 844 (DES-§5.12 three zones) */
export const FOLD_TARGET = 760;
export const FOLD_HARD = 938;

const s390 = (n: number) => span(390, n);
const s1440 = (n: number) => span(1440, n);
const slot = (name: string, aspect: FeatureSlot["aspect"], role: FeatureSlot["role"], w390: number, w1440: number): FeatureSlot => ({ name, aspect, role, cssWidth390: w390, cssWidth1440: w1440 });
const title = (lines: number, sizePx = 44, step: TypeStep = "D"): FoldStep => ({ el: "title", gap: 0, lines, sizePx, step });

/* ------------------------------------------------------------------ */
/* Hero families H1-H10                                                */
/* ------------------------------------------------------------------ */

const H1: Sheet = {
  id: "H1",
  key: "hero:stage",
  family: "media",
  grammars: ["stage"],
  treatments: ["cutout-stage", "framed-stage"],
  grid: {
    390: [[["IMG", 4]], [["TTL", 4]], [["PRC", 4]], [["CTA", 4]], [["COD", 4]]],
    768: [[["·", 1], ["IMG", 5], ["·", 2]], [["TTL", 6], ["·", 2]], [["PRC", 2], ["CTA", 3], ["COD", 3]]],
    1440: [[["KCK", 6], ["IMG", 5], ["·", 1]], [["TTL", 6], ["IMG", 5], ["·", 1]], [["LED", 5], ["·", 1], ["IMG", 5], ["·", 1]], [["PRC", 2], ["CTA", 2], ["COD", 2], ["IMG", 5], ["·", 1]]],
  },
  slots: [slot("main", "free", "hero", s390(4), s1440(5))],
  type: { title: { step: "D", px390: 44, lines390: 2, lines1440: 2 } },
  fold: [
    { el: "image", gap: 0, vh: 46, vhAr: 42 },
    { ...title(2), gap: GAP.afterImage },
    { el: "price", gap: 16, px: ROW.price },
    { el: "cta", gap: GAP.text, px: ROW.button },
    { el: "cod", gap: GAP.beforeCod, px: ROW.cod },
  ],
  price: "stacked",
  cod: "below",
  h: 0.95,
  signature: "the product landing on its stage (the preset's glow / contact / plinth and the scale-in row)",
  details: 0,
  rtl: "the grid mirrors; at 1440 the text column is inline-start, the product inline-end; price cluster and COD line one bdi group each",
  recipe: "cutout-stage with glow (maison, bloom, souk), contact (apothecary, field, hearth, editorial) or plinth (circuit, kinetic, garage, playground); framed-stage with plinth or contact only",
};

const H2: Sheet = {
  id: "H2",
  key: "hero:editorial",
  family: "split",
  grammars: ["editorial-column"],
  treatments: ["framed", "tight-detail"],
  grid: {
    390: [[["KCK", 4]], [["TTL", 4]], [["LED", 4]], [["IMG", 4]], [["PRC", 2], ["CTA", 2]], [["COD", 4]]],
    768: [[["KCK", 5], ["·", 3]], [["TTL", 5], ["·", 3]], [["LED", 4], ["·", 4]], [["IMG", 5], ["PRC", 3]], [["IMG", 5], ["CTA", 3]], [["IMG", 5], ["COD", 3]]],
    1440: [[["·", 1], ["KCK", 5], ["IMG", 6]], [["·", 1], ["TTL", 5], ["IMG", 6]], [["·", 1], ["LED", 4], ["·", 1], ["IMG", 6]], [["·", 1], ["PRC", 2], ["CTA", 2], ["COD", 1], ["IMG", 6]]],
  },
  slots: [slot("main", "4:5", "hero", s390(4), s1440(6))],
  type: { title: { step: "D", px390: 44, lines390: 2, lines1440: 3 }, lead: { lines390: 2 } },
  fold: [
    { el: "kicker", gap: 0, px: 24 },
    title(2),
    { el: "lead", gap: GAP.text, lines: 2, step: "L", sizePx: 18, optional: true },
    { el: "image", gap: GAP.afterImage, vh: 40 },
    { el: "price", gap: GAP.afterImage, px: ROW.priceCta },
    { el: "cta", gap: 0, inline: true },
    { el: "cod", gap: GAP.beforeCod, px: ROW.cod },
  ],
  price: "line",
  cod: "below",
  h: 0.9,
  signature: "the title's line-by-line mask-wipe and the one empty column at 1440",
  details: 0,
  rtl: "the empty column stays inline-start; the caption column of the caption opener hangs inline-start",
  recipe: "hairline frame on light bases, surface panel on dark (H27 c)",
};

const H3: Sheet = {
  id: "H3",
  key: "hero:poster",
  family: "statement",
  grammars: ["poster"],
  treatments: ["cutout-stage", "framed-stage", "full-bleed-crop"],
  grid: {
    390: [[["TTL", 4]], [["IMG", 4]], [["PRC", 2], ["CTA", 2]], [["COD", 4]]],
    768: [[["TTL", 7], ["·", 1]], [["IMG", 4], ["PRC", 4]], [["IMG", 4], ["CTA", 4]], [["IMG", 4], ["COD", 4]]],
    1440: [[["TTL", 9], ["·", 3]], [["IMG", 6], ["PRC", 4], ["·", 2]], [["IMG", 6], ["CTA", 2], ["COD", 2], ["·", 2]]],
  },
  slots: [slot("main", "4:5", "hero", s390(4), s1440(6))],
  type: { title: { step: "D", px390: 56, lines390: 2, lines1440: 2 } },
  fold: [
    title(2, 56),
    { el: "image", gap: GAP.afterImage, vh: 40 },
    { el: "band", gap: GAP.afterImage, pad: 0, inner: [{ el: "price", gap: 0, px: ROW.priceCta }, { el: "cta", gap: 0, inline: true }] },
    { el: "cod", gap: GAP.beforeCod, px: ROW.cod },
  ],
  price: "band",
  cod: "below",
  h: 0.85,
  signature: "the image's mask reveal; no turning badge (S17)",
  details: 0,
  rtl: "the title keeps text-align start; the band is inline-end from 768; never uppercase in ar",
  recipe: "display weight ≥ 700 (H04); the price band is one of the page's colour moments (color-field / duotone)",
};

const H4: Sheet = {
  id: "H4",
  key: "hero:spec",
  family: "media",
  grammars: ["specimen"],
  treatments: ["cutout-stage", "framed-stage", "tight-detail"],
  grid: {
    390: [[["IMG", 4]], [["FCT", 2], ["FCT", 2]], [["TTL", 4]], [["PRC", 2], ["CTA", 2]], [["COD", 4]]],
    768: [[["IMG", 5], ["FCT", 3]], [["IMG", 5], ["FCT", 3]], [["TTL", 5], ["PRC", 1], ["CTA", 1], ["COD", 1]]],
    1440: [[["FCT", 3], ["IMG", 6], ["FCT", 3]], [["FCT", 3], ["IMG", 6], ["·", 3]], [["TTL", 6], ["PRC", 2], ["CTA", 2], ["COD", 2]]],
  },
  slots: [slot("main", "4:5", "hero", s390(4), s1440(6))],
  type: { title: { step: "D", px390: 44, lines390: 2, lines1440: 2 } },
  fold: [
    { el: "image", gap: 0, vh: 40 },
    { el: "callouts", gap: GAP.afterImage, lines: 2, px: ROW.callout },
    { ...title(2), gap: GAP.afterImage },
    { el: "price", gap: GAP.afterImage, px: ROW.priceCta },
    { el: "cta", gap: 0, inline: true },
    { el: "cod", gap: GAP.beforeCod, px: ROW.cod },
  ],
  price: "line",
  cod: "below",
  h: 0.9,
  signature: "the callout lines drawing in (line-draw, quart)",
  details: 1,
  rtl: "callouts at inline-start of the image mirror; leader lines mirror; numbers LTR isolates",
  recipe: "glass only when G16 allows, else hairline cards; merchant facts only; leader lines from 1024 to merchant anchors",
};

const H5: Sheet = {
  id: "H5",
  key: "hero:split",
  family: "split",
  grammars: ["split-tension"],
  treatments: ["framed", "full-bleed-crop", "cutout-stage"],
  grid: {
    390: [[["IMG", 4]], [["TTL", 4]], [["PRC", 2], ["CTA", 2]], [["COD", 4]]],
    768: [[["TTL", 3], ["IMG", 5]], [["LED", 3], ["IMG", 5]], [["PRC", 1], ["CTA", 2], ["IMG", 5]], [["COD", 3], ["IMG", 5]]],
    1440: [[["TTL", 5], ["·", 1], ["IMG", 6]], [["LED", 4], ["·", 2], ["IMG", 6]], [["PRC", 2], ["CTA", 3], ["·", 1], ["IMG", 6]], [["COD", 5], ["·", 1], ["IMG", 6]]],
  },
  slots: [slot("main", "4:5", "hero", s390(4), s1440(6))],
  type: { title: { step: "D", px390: 44, lines390: 2, lines1440: 3 }, lead: { lines390: 2 } },
  fold: [
    { el: "image", gap: 0, vh: 44 },
    { ...title(2), gap: GAP.afterImage },
    { el: "price", gap: GAP.afterImage, px: ROW.priceCta },
    { el: "cta", gap: 0, inline: true },
    { el: "cod", gap: GAP.beforeCod, px: ROW.cod },
  ],
  price: "line",
  cod: "below",
  h: 0.9,
  signature: "the media's edge wipe; the unequal split (the text column is never centred)",
  details: 0,
  rtl: "mediaSide is logical: end puts the image on the left in ar; the bleed edge follows",
  recipe: "ratio 5:7 default, 4:8 with offset margins, never 1:1 (H22); bleed only when the asset is ≥ 1.5 × the slot at DPR 2 (H13)",
};

const H6: Sheet = {
  id: "H6",
  key: "hero:cinema",
  family: "media",
  grammars: ["cinematic"],
  treatments: ["full-bleed-crop", "tight-detail"],
  grid: {
    390: [[["IMG", 4]], [["TTL", 4]], [["PRC", 2], ["CTA", 2]], [["COD", 4]]],
    768: [[["IMG", 8]], [["TTL", 2], ["PRC", 1], ["CTA", 1], ["COD", 1], ["CAP", 3]]],
    1440: [[["IMG", 12]], [["TTL", 2], ["PRC", 1], ["CTA", 1], ["·", 5], ["CAP", 3]], [["COD", 4], ["·", 8]]],
  },
  slots: [slot("main", "21:9", "hero", 390, 1440)],
  type: { title: { step: "D", px390: 44, lines390: 2, lines1440: 2 } },
  fold: [
    { el: "image", gap: 0, vh: 50 },
    {
      el: "band",
      gap: 0,
      pad: 24,
      inner: [title(2), { el: "price", gap: 0, px: ROW.priceCta }, { el: "cta", gap: 0, inline: true }, { el: "cod", gap: 0, px: ROW.cod }],
    },
  ],
  price: "band",
  cod: "band",
  h: 0.85,
  signature: "the slow settle (1.08 → 1 over --lp-dur-l × 1.5) and the optional −6 % scroll translate",
  details: 0,
  rtl: "the band is inline-start at 1440, the caption inline-end",
  recipe: "edge-to-edge photo ≥ 1.5 × the slot at DPR 2 on every declared breakpoint, else a mobile-only bleed with a framed desktop fallback; text never over the photo except the caption (never in the fold)",
};

const H7: Sheet = {
  id: "H7",
  key: "hero:quiet",
  family: "media",
  grammars: ["quiet-luxe"],
  treatments: ["framed", "full-bleed-crop", "cutout-stage"],
  grid: {
    390: [[["·", 0.5], ["IMG", 3], ["·", 0.5]], [["TTL", 4]], [["PRC", 1], ["CTA", 2], ["COD", 1]]],
    768: [[["·", 2], ["IMG", 4], ["·", 2]], [["TTL", 4], ["·", 4]], [["PRC", 2], ["CTA", 2], ["COD", 2], ["·", 2]]],
    1440: [[["·", 3], ["IMG", 4], ["·", 1], ["TTL", 3], ["·", 1]], [["·", 3], ["IMG", 4], ["·", 1], ["PRC", 1], ["CTA", 2], ["·", 1]], [["·", 3], ["IMG", 4], ["·", 1], ["COD", 3], ["·", 1]]],
  },
  slots: [slot("main", "4:5", "hero", s390(4) - 2 * GRID[390].gutter, s1440(4))],
  type: { title: { step: "D", px390: 44, lines390: 1, lines1440: 1 } },
  fold: [
    { el: "image", gap: 0, vh: 52 },
    { ...title(1), gap: GAP.afterImage },
    { el: "price", gap: GAP.text, px: ROW.priceCta },
    { el: "cta", gap: 0, inline: true },
    { el: "cod", gap: GAP.beforeCod, px: ROW.cod },
  ],
  price: "line",
  cod: "below",
  h: 0.75,
  signature: "stillness: the image's slow fade is the whole choreography; the page's longest stagger",
  details: 0,
  rtl: "the 1440 text column is inline-end (left in ar)",
  recipe: "G20.l airy, G10 ≤ 0.10, G16 ≤ 1 (H05); hairline or flat depth; the title is the product name or a ≤ 4-word noun phrase",
};

const H8: Sheet = {
  id: "H8",
  key: "hero:index",
  family: "list",
  grammars: ["catalogue"],
  treatments: ["framed", "cutout-stage", "framed-stage"],
  grid: {
    390: [[["IMG", 4]], [["TTL", 4]], [["FCT", 4]], [["FCT", 4]], [["FCT", 4]], [["PRC", 2], ["CTA", 2]], [["COD", 4]]],
    768: [[["IMG", 4], ["TTL", 4]], [["IMG", 4], ["FCT", 4]], [["IMG", 4], ["FCT", 4]], [["IMG", 4], ["FCT", 4]], [["IMG", 4], ["PRC", 1], ["CTA", 2], ["COD", 1]]],
    1440: [[["IMG", 5], ["TTL", 6], ["·", 1]], [["IMG", 5], ["FCT", 6], ["·", 1]], [["IMG", 5], ["FCT", 6], ["·", 1]], [["IMG", 5], ["FCT", 6], ["·", 1]], [["IMG", 5], ["PRC", 2], ["CTA", 2], ["COD", 2], ["·", 1]]],
  },
  slots: [slot("main", "4:5", "hero", s390(4), s1440(5))],
  type: { title: { step: "D", px390: 44, lines390: 2, lines1440: 2 } },
  fold: [
    { el: "image", gap: 0, vh: 36 },
    { ...title(2), gap: GAP.afterImage },
    { el: "facts", gap: GAP.text, lines: 3, px: ROW.fact },
    { el: "price", gap: GAP.afterImage, px: ROW.priceCta },
    { el: "cta", gap: 0, inline: true },
    { el: "cod", gap: GAP.beforeCod, px: ROW.cod },
  ],
  price: "line",
  cod: "below",
  h: 0.8,
  signature: "the index rows ticking in with their hairlines (line-draw)",
  details: 0,
  rtl: "row numbers are LTR isolates at inline-start of each row; the hairlines run full width",
  recipe: "3-5 merchant facts as numbered rows (32 px, hairline between rows); padded numbering is a counted device (DS56); 2 facts in the fold when the title takes 2 Arabic lines",
};

const contactCell = (w: number) => w;
const H9: Sheet = {
  id: "H9",
  key: "hero:contact",
  family: "grid",
  grammars: ["gallery-led"],
  treatments: ["grid-contact"],
  grid: {
    390: [[["IMG", 2], ["IMG", 2]], [["TTL", 4]], [["COD", 4]]],
    768: [[["IMG", 3], ["IMG", 3], ["TTL", 2]], [["IMG", 3], ["IMG", 3], ["PRC", 1], ["CTA", 1]]],
    1440: [[["IMG", 4], ["IMG", 4], ["TTL", 4]], [["IMG", 4], ["IMG", 4], ["PRC", 2], ["CTA", 2]]],
  },
  slots: ["a", "b", "c", "d"].map((n, i) => slot(n, "1:1", i === 0 ? "hero" : "context", contactCell(Math.round((GRID[390].container - 2) / 2)), contactCell(Math.round((GRID[1440].container - 4) / 3)))),
  type: { title: { step: "T", px390: 28, lines390: 2, lines1440: 2 } },
  fold: [
    {
      el: "grid",
      gap: 0,
      vh: 58,
      pad: 0,
      inner: [
        { el: "image", gap: 0, px: Math.round((GRID[390].container - 2) / 2) + 2 },
        { ...title(2, 28, "T"), gap: 16 },
        { el: "price", gap: GAP.text, px: ROW.price },
        { el: "cta", gap: GAP.text, px: ROW.button },
      ],
    },
    { el: "cod", gap: GAP.beforeCod, px: ROW.cod },
  ],
  price: "cell",
  cod: "below",
  h: 0.7,
  signature: "the cell cascade: reading order, +1 stagger per cell, the title cell last",
  details: 0,
  rtl: "the grid mirrors; titleCell is logical (tr = inline-end top, the top-left cell in ar)",
  recipe: "3-4 distinct photos ≥ 1.5 × the cell at DPR 2, 1:1 cells (4:5 at 1440 with 4 photos), 2 px gaps; no tape, no polaroid frames",
};

const H10: Sheet = {
  id: "H10",
  key: "hero:statement",
  family: "statement",
  grammars: ["quiet-luxe", "poster", "editorial-column"],
  treatments: ["framed", "cutout-stage"],
  grid: {
    390: [[["TTL", 4]], [["IMG", 2], ["·", 2]], [["PRC", 2], ["CTA", 2]], [["COD", 4]], [["LED", 4]]],
    768: [[["TTL", 6], ["·", 2]], [["IMG", 3], ["LED", 2], ["PRC", 1], ["CTA", 2]], [["IMG", 3], ["·", 2], ["COD", 3]]],
    1440: [[["TTL", 8], ["·", 4]], [["LED", 4], ["IMG", 3], ["PRC", 2], ["CTA", 2], ["COD", 1]]],
  },
  slots: [slot("main", "4:5", "hero", 160, s1440(3))],
  type: { title: { step: "D", px390: 48, lines390: 3, lines1440: 3 }, lead: { lines390: 2 } },
  fold: [
    title(3, 48),
    { el: "image", gap: GAP.afterImage, px: 160 },
    { el: "price", gap: GAP.afterImage, px: ROW.priceCta },
    { el: "cta", gap: 0, inline: true },
    { el: "cod", gap: GAP.beforeCod, px: ROW.cod },
  ],
  price: "line",
  cod: "below",
  h: 0.7,
  signature: "the type itself (ratio ≥ 3 against the body); no other device on the hero",
  details: 0,
  rtl: "word-subline sets the big word on its own line in both scripts; the Arabic big word is sized by --sh-word (S12)",
  recipe: "structure word-subline or contrast-pair (never an em dash); a framed thumbnail ≥ 160 px or a small cut-out on a plinth; the one-asset default (H36)",
};

/* ------------------------------------------------------------------ */
/* Sections S1-S8                                                      */
/* ------------------------------------------------------------------ */

const S1: Sheet = {
  id: "S1",
  key: "benefits:hanging",
  family: "list",
  grid: {
    390: [[["TTL", 4]], [["FCT", 1], ["B", 3]], [["FCT", 1], ["B", 3]], [["FCT", 1], ["B", 3]]],
    768: [[["FCT", 1], ["IMG", 1], ["TTL", 5], ["·", 1]], [["FCT", 1], ["IMG", 1], ["B", 5], ["·", 1]]],
    1440: [[["FCT", 1], ["IMG", 1], ["TTL", 5], ["·", 5]], [["FCT", 1], ["IMG", 1], ["B", 5], ["·", 5]]],
  },
  slots: [slot("thumb", "1:1", "thumb", 72, 72)],
  type: { title: { step: "T", px390: 30, lines390: 2, lines1440: 2 } },
  price: "none",
  cod: "none",
  h: 0.95,
  signature: "the hanging thumbnail that breaks the text column's edge at ≥ 768",
  details: 0,
  rtl: "thumbnails and numbers hang inline-start; numerals LTR isolates",
  recipe: "3-5 rows, 72 px thumbnails (≥ 1.5 × at DPR 2, else the numbered ledger), number at C mono / smallcaps, title B/600 one line, body ≤ 24 words, hairlines; no icons (S07)",
};

const S2: Sheet = {
  id: "S2",
  key: "showcase:figure",
  family: "media",
  grid: {
    390: [[["TTL", 4]], [["IMG", 4]], [["CAP", 4]]],
    768: [[["TTL", 5], ["·", 3]], [["IMG", 6], ["CAP", 2]]],
    1440: [[["·", 1], ["TTL", 6], ["·", 5]], [["·", 1], ["IMG", 8], ["CAP", 3]]],
  },
  slots: [slot("figure", "4:5", "context", s390(4), s1440(8))],
  type: { title: { step: "T", px390: 30, lines390: 2, lines1440: 2 } },
  price: "none",
  cod: "none",
  h: 0.8,
  signature: "the caption column hanging in the margin (hang arrangement at ≥ 1024)",
  details: 0,
  rtl: "the caption column is inline-end; FIG. 01 becomes الشكل 01 with the numeral in an LTR isolate",
  recipe: "hairline frame on light and tinted bases, the surface panel on dark (H27 c); no CTA, no price (a showcase never sells)",
};

const S3: Sheet = {
  id: "S3",
  key: "gallery:contact",
  family: "grid",
  treatments: ["grid-contact"],
  grid: {
    390: [[["TTL", 4]], [["IMG", 2], ["IMG", 2]], [["IMG", 2], ["IMG", 2]]],
    768: [[["TTL", 5], ["·", 3]], [["IMG", 3], ["IMG", 3], ["IMG", 2]], [["IMG", 3], ["IMG", 3], ["IMG", 2]]],
    1440: [[["TTL", 5], ["·", 1], ["LED", 4], ["·", 2]], [["IMG", 4], ["IMG", 4], ["IMG", 4]], [["IMG", 4], ["IMG", 4], ["IMG", 4]]],
  },
  slots: ["a", "b", "c", "d", "e", "f"].map((n) => slot(n, "1:1", "context", Math.round((GRID[390].container - 2) / 2), Math.round((GRID[1440].container - 4) / 3))),
  type: { title: { step: "T", px390: 30, lines390: 2, lines1440: 2 }, lead: { lines390: 2 } },
  price: "none",
  cod: "none",
  h: 1.0,
  signature: "the uniform grid itself; distinct assets only (H08)",
  details: 0,
  rtl: "reading order mirrors (cell a at inline-start top)",
  recipe: "3-6 distinct photos, 1:1 cells, 2 px gaps, no captions, frames or lightbox chrome; each cell ≥ 1.5 × its CSS width at DPR 2, else the count drops",
};

const S4: Sheet = {
  id: "S4",
  key: "offer:showcase",
  family: "grid",
  grid: {
    390: [[["TTL", 4]], [["PCK", 3], ["PCK", 1]], [["CAP", 4]]],
    768: [[["TTL", 5], ["·", 3]], [["PCK", 3], ["PCK", 3], ["PCK", 2]]],
    1440: [[["·", 1], ["TTL", 5], ["·", 6]], [["·", 1], ["PCK", 3], ["PCK", 4], ["PCK", 3], ["·", 1]]],
  },
  slots: [],
  type: { title: { step: "T", px390: 30, lines390: 2, lines1440: 2 } },
  price: "cell",
  cod: "none",
  h: 0.9,
  signature: "none: a quiet section by design (it may be the page's quiet screen, C4)",
  details: 0,
  rtl: "the row scrolls from inline-start; prices stay one bdi group",
  recipe: "2-3 pack cards (72 vw with a 12 % peek at 390), per-piece price P tabular, savings chip as an LTR isolate; no picker, no button; the recommended pack on --lp-accent-soft, never a best-seller badge without merchant data",
};

const S5: Sheet = {
  id: "S5",
  key: "problem:chat",
  family: "ledger",
  grid: {
    390: [[["TTL", 4]], [["B", 4]], [["·", 1], ["B", 3]], [["B", 4]], [["·", 1], ["B", 3]]],
    768: [[["TTL", 5], ["LED", 3]], [["B", 4], ["B", 4]], [["B", 4], ["B", 4]]],
    1440: [[["TTL", 4], ["·", 1], ["LED", 5], ["·", 2]], [["·", 1], ["B", 4], ["B", 6], ["·", 1]], [["·", 1], ["B", 4], ["B", 6], ["·", 1]]],
  },
  slots: [],
  type: { title: { step: "T", px390: 30, lines390: 2, lines1440: 2 } },
  price: "none",
  cod: "none",
  h: 0.85,
  signature: "the ledger's hairlines (line-draw) or none",
  details: 0,
  rtl: "columns mirror (pain at inline-start)",
  recipe: "3-4 rows: pain B/600 one line, the answer B ≤ 2 lines; no bubbles, timestamps or avatars (S20); the quote opener allowed",
};

const S6: Sheet = {
  id: "S6",
  key: "socialProof:whatsapp",
  family: "grid",
  grid: {
    390: [[["TTL", 4]], [["QTE", 4]], [["QTE", 4]]],
    768: [[["TTL", 5], ["·", 3]], [["QTE", 3], ["QTE", 2], ["QTE", 3]]],
    1440: [[["·", 2], ["QTE", 8], ["·", 2]], [["·", 2], ["CAP", 4], ["·", 6]]],
  },
  slots: [],
  type: { title: { step: "T", px390: 30, lines390: 2, lines1440: 2 } },
  price: "none",
  cod: "none",
  h: 1.0,
  signature: "the single wide quote under editorial-column or quiet-luxe",
  details: 0,
  rtl: "quotation marks « » / „“ per locale from the voice table",
  recipe: "owner-attested quotes only: 2-3 cards, quote B/L ≤ 6 lines at 390, name and city at C; never a timestamp, rating or avatar the owner did not upload; card tier from G15, no phone frame (S21)",
};

const S7: Sheet = {
  id: "S7",
  key: "stats:big-numbers",
  family: "grid",
  grid: {
    390: [[["FIG", 2], ["FIG", 2]], [["FIG", 2], ["FIG", 2]]],
    768: [[["FIG", 2], ["FIG", 2], ["FIG", 2], ["FIG", 2]], [["CAP", 8]]],
    1440: [[["FIG", 3], ["FIG", 3], ["FIG", 3], ["FIG", 3]], [["CAP", 12]]],
  },
  slots: [],
  type: { title: { step: "T", px390: 30, lines390: 2, lines1440: 2 } },
  price: "none",
  cod: "none",
  h: 0.6,
  signature: "the ticking number (one per page, S11)",
  details: 0,
  rtl: "figures are LTR isolates with the unit per locale",
  recipe: "2-4 figures from allowedNumbers at step-5 tabular lining (never a gradient or a bar, S22), label C ≤ 2 lines, a source line only when the owner typed one",
};

/** S8: the five redraws that keep their ids (owner rule 2): no seal, stamp, tape or ticket shapes, no circular text. */
const S8_BASE = { id: "S8", grid: { 390: [], 768: [], 1440: [] }, slots: [], details: 0 } as const;
const S8_CTA: Sheet = {
  ...S8_BASE,
  key: "cta:stamp",
  family: "statement",
  grid: {
    390: [[["TTL", 4]], [["PRC", 4]], [["CTA", 4]], [["COD", 4]]],
    768: [[["TTL", 6], ["·", 2]], [["PRC", 2], ["CTA", 4], ["·", 2]], [["COD", 6], ["·", 2]]],
    1440: [[["TTL", 6], ["·", 6]], [["PRC", 2], ["CTA", 4], ["·", 6]], [["COD", 6], ["·", 6]]],
  },
  type: { title: { step: "T", px390: 30, lines390: 2, lines1440: 2 } },
  price: "stacked",
  cod: "below",
  h: 0.6,
  signature: "one button, one COD line (the restraint of the massage-default-ar closing block)",
  rtl: "the block mirrors; the COD line and the price cluster stay one bdi group each",
  recipe: "start-aligned (a centred 8-col block only on poster / quiet-luxe / statement pages); a colour moment when the plan assigns one; no countdown (R3), no second button",
};
const S8_SEAL: Sheet = {
  ...S8_BASE,
  key: "guarantee:seal",
  family: "statement",
  type: { title: { step: "T", px390: 30, lines390: 2, lines1440: 2 } },
  price: "none",
  cod: "none",
  h: 0.7,
  signature: "a hairline card with the guarantee text and the merchant's return policy line",
  rtl: "the card mirrors",
  recipe: "the '0 DH d'avance' mark is a text chip, never a seal shape",
};
const S8_STAMPS: Sheet = {
  ...S8_BASE,
  key: "trustBar:stamps",
  family: "list",
  type: { title: { step: "C", px390: 14, lines390: 1, lines1440: 1 } },
  price: "none",
  cod: "none",
  h: 0.4,
  signature: "none: the chips variant's row",
  rtl: "the row mirrors",
  recipe: "out of every pool; the redraw for old docs is the chips row",
};
const S8_TAPE: Sheet = {
  ...S8_BASE,
  key: "marquee:tape",
  family: "statement",
  type: { title: { step: "D", px390: 44, lines390: 1, lines1440: 1 } },
  price: "none",
  cod: "none",
  h: 0.15,
  signature: "the outline marquee with whole-item duplication (I7)",
  rtl: "ar tracks run inline-start → end",
  recipe: "no tape texture, no rotation",
};
const S8_TICKETS: Sheet = {
  ...S8_BASE,
  key: "offer:tickets",
  family: "grid",
  type: { title: { step: "T", px390: 30, lines390: 2, lines1440: 2 } },
  price: "cell",
  cod: "none",
  h: 1.0,
  signature: "the showcase cards with a cut corner as the one allowed device",
  rtl: "the row mirrors; prices stay one bdi group",
  recipe: "no perforations",
};

/** Every sheet, keyed by `type:variant`. */
export const SHEETS: Readonly<Record<string, Sheet>> = Object.fromEntries(
  [H1, H2, H3, H4, H5, H6, H7, H8, H9, H10, S1, S2, S3, S4, S5, S6, S7, S8_CTA, S8_SEAL, S8_STAMPS, S8_TAPE, S8_TICKETS].map((s) => [s.key, s]),
);

export const sheetOf = (type: string, variant: string): Sheet | undefined => SHEETS[`${type}:${variant}`];

/* ------------------------------------------------------------------ */
/* Features generated from a sheet                                     */
/* ------------------------------------------------------------------ */

/** The frozen fold rows of a stack: band and grid flatten to their own row, the text-only steps (kicker, lead) drop. */
function foldRows(steps: readonly FoldStep[]): FoldRow[] {
  const rows: FoldRow[] = [];
  for (const s of steps) {
    if (s.el === "kicker" || s.el === "lead") continue;
    const row: FoldRow = { el: s.el };
    if (s.vh !== undefined) row.vh = s.vh;
    // `lines: 0` = shares the previous row's line (price + CTA on one 52 px line)
    if (s.inline) row.lines = 0;
    else if (s.lines !== undefined) row.lines = s.lines;
    rows.push(row);
  }
  return rows;
}

/** `features.fold`, `features.slots` and `features.h` of a sheeted variant: what the registry must declare. */
export function sheetFeatures(sheet: Sheet): { fold?: { rows: FoldRow[] }; slots: FeatureSlot[]; h: number } {
  return {
    ...(sheet.fold ? { fold: { rows: foldRows(sheet.fold) } } : {}),
    slots: sheet.slots.map((s) => ({ ...s })),
    h: sheet.h,
  };
}

/* ------------------------------------------------------------------ */
/* The fold stack at 390                                               */
/* ------------------------------------------------------------------ */

/** Line metrics of the fold's title and lead (from typeTokens; the sheet's nominal values otherwise). */
export interface FoldType {
  /** px per line of a display / title run at `sizePx` */
  lineOf(sizePx: number, step: TypeStep): number;
  /** lines a text of `chars` characters takes at `sizePx` in a `measurePx` column */
  linesOf(chars: number, sizePx: number, measurePx: number, step: TypeStep): number;
}

/** The §5.12 nominal type: Latin display line-height 1.05; Arabic × 1.08 scale with line-height 1.28; lead 27 / 30.5 px per line. */
export function nominalType(ar: boolean): FoldType {
  return {
    lineOf: (size, step) => (step === "L" ? (ar ? 30.5 : 27) : ar ? size * 1.08 * 1.28 : size * 1.05),
    linesOf: () => Number.POSITIVE_INFINITY,
  };
}

export interface FoldLayout {
  /** top px at 390 of each fold item (the header and announcement included) */
  items: Partial<Record<"image" | "title" | "price" | "cta" | "cod", number>>;
  /** the bottom of the lowest fold item */
  bottom: number;
  /** optional steps moved under the fold (H28's first rung) */
  dropped: string[];
}

/**
 * Lays out a hero sheet's fold stack at 390 (DES-§5.12): from `top` (the hero's top; by default the header 68 and
 * the announcement 42 when the page has one), the steps in order. Text steps take `min(cap, lines needed)` lines of `type`; with `titleChars`
 * unknown the cap is used (the worst case). An optional step is kept only when the stack still ends ≤ the 760 target.
 */
export function foldLayout(
  steps: readonly FoldStep[],
  opts: { ar: boolean; type: FoldType; top?: number; announcement?: boolean; titleChars?: number; leadChars?: number; measure390?: number },
): FoldLayout {
  const measure = opts.measure390 ?? GRID[390].container;
  const textLines = (s: FoldStep): number => {
    const cap = s.lines ?? 1;
    const chars = s.el === "title" ? opts.titleChars : s.el === "lead" ? opts.leadChars : undefined;
    if (chars === undefined || !s.sizePx || !s.step) return cap;
    return Math.max(1, Math.min(cap, opts.type.linesOf(chars, s.sizePx, measure, s.step)));
  };
  const heightOf = (s: FoldStep): number => {
    if (s.inline) return 0;
    if (s.el === "band" || s.el === "grid") return 0; // laid out by `place`
    if (s.vh !== undefined) return Math.round(((opts.ar && s.vhAr !== undefined ? s.vhAr : s.vh) * 844) / 100);
    if (s.el === "title" || s.el === "lead") return Math.round(textLines(s) * opts.type.lineOf(s.sizePx ?? 44, s.step ?? "D"));
    if ((s.el === "callouts" || s.el === "facts") && s.px) return (s.lines ?? 1) * s.px;
    return s.px ?? 0;
  };
  const run = (list: readonly FoldStep[], keepOptional: boolean) => {
    const items: FoldLayout["items"] = {};
    const dropped: string[] = [];
    let y = opts.top ?? ROW.header + (opts.announcement ? ROW.announcement : 0);
    let bottom = y;
    let lastTop = y;
    const place = (s: FoldStep, at: number): number => {
      // returns the y after the step
      if (s.el === "band" || s.el === "grid") {
        let iy = at + (s.pad ?? 0) / 2;
        for (const inner of s.inner ?? []) iy = place(inner, iy);
        const end = iy + (s.pad ?? 0) / 2;
        const cap = s.vh !== undefined ? at + Math.round(((opts.ar && s.vhAr !== undefined ? s.vhAr : s.vh) * 844) / 100) + (opts.ar && s.el === "grid" ? 16 : 0) : 0;
        return Math.max(end, cap);
      }
      const top = s.inline ? lastTop : at + s.gap;
      const h = heightOf(s);
      if (s.el === "image" || s.el === "title" || s.el === "price" || s.el === "cta" || s.el === "cod") {
        if (items[s.el] === undefined) items[s.el] = Math.round(top);
        bottom = Math.max(bottom, Math.round(top + (s.inline ? 0 : h)));
      }
      if (!s.inline) lastTop = top;
      return s.inline ? at : top + h;
    };
    for (const s of list) {
      if (s.optional && !keepOptional) {
        dropped.push(s.el);
        continue;
      }
      // a lead the hero does not have takes no row (its gap included)
      if (s.el === "lead" && opts.leadChars === 0) continue;
      // a band or grid step's own gap
      y = s.el === "band" || s.el === "grid" ? place(s, y + s.gap) : place(s, y);
    }
    return { items, bottom, dropped };
  };
  const full = run(steps, true);
  if (!steps.some((s) => s.optional) || full.bottom <= FOLD_TARGET) return full;
  return run(steps, false);
}
