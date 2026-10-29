/**
 * The height model (P6 DESIGN; design.md DES-§5.3, DES-§5.12; docs/STORE-SAAS.md §K.2 P0 design stubs, §M.2,
 * DES-R19). Pure and isomorphic, no DOM: the core's budget gate measures rows C3, F1 and C2 with it, the wizard and
 * the gates with the same numbers (DS33). The signature is frozen (src/lib/contracts/r1-p0.ts) and the report shapes
 * are the maintainer's (./types.frozen.ts).
 *
 * Two parts:
 *  - the page total and the form top are a sum of section heights at 390: the variant's `features.h` (screens of 844)
 *    else the type's constant, × the density (airy 1.2, dense 0.85), × the section's spacing (tight 0.95, airy 1.08),
 *    + (G21 − 1) × 0.12 screen; a `features.h = { base, fixed: true, per }` entry skips the three multipliers and adds
 *    its `per` terms from the doc (the order form: 1.1 screens = 928 px in its default state, + 0.15 per offer row
 *    beyond 2, + 0.25 per per-piece option group, + 0.07 for the bump row; LAN R12);
 *  - the fold is estimated from element rows (QUAL-5): the hero family's fold stack from its composition sheet
 *    (./sheets.ts), the title's lines from the measured average advance of the display face per script at the
 *    family's size (`metrics.xWidthAvg` for Latin, `metrics.ar.advanceAvg` for Arabic through typeTokens' scale) in
 *    the 390 column, capped by the sheet's lines; line heights from typeTokens; control rows 40 / 52 / 24; gaps
 *    16 / 12 / 8. A variant drawn before its sheet (`PRE_SHEET`) uses the height and the stack measured on its renders
 *    for a document without look.
 *
 * A document without `look` is estimated through `genomeOf` (the archetype defaults: density, G21, the type genes),
 * so legacy pages get the same numbers as their genome. Fixed layers (the sticky bar, the WhatsApp float) never count.
 * The coefficients were fitted on src/lib/design/calibration/heights.json (scripts/qa/design-heights.ts), which
 * records the model version it was measured with; `test:design` keeps the page totals within 0.8-1.25 on ≥ 90 % of
 * pages and the fold items within p95 ≤ 10 %. ≤ 1 ms per document.
 */
import type { Locale, PageDoc, ThemeLook } from "@/lib/page/schema";
import { fontData } from "@/lib/theme/fonts";
import { genomeOf } from "./derive";
import { foldLayout, GAP, ROW, sheetOf, type FoldStep, type FoldType, type TypeStep } from "./sheets";
import type { FoldItem, HeightReport, VariantFeaturesResolved } from "./types.frozen";
import { arabicMetrics, typeTokens, type TypeLook } from "./typography";

/** Bumped with the coefficients; calibration/heights.json records the version it was fitted against. 0 = the P0 stub. */
export const HEIGHT_MODEL_VERSION: number = 1;

export const SCREEN = 844;
export const VIEWPORT = 390;

/** DES-§5.3 type constants in screens at 390, before density (a variant's `features.h` overrides its type's value). */
export const TYPE_SCREENS: Readonly<Record<string, number>> = {
  announcement: 0.05,
  header: 0.08,
  hero: 1.0,
  trustBar: 0.12,
  marquee: 0.1,
  benefits: 1.3,
  showcase: 1.1,
  gallery: 1.0,
  video: 0.9,
  beforeAfter: 1.0,
  problem: 0.9,
  reviews: 1.2,
  socialProof: 0.8,
  stats: 0.6,
  story: 1.0,
  comparison: 1.1,
  specs: 0.9,
  steps: 1.0,
  offer: 1.2,
  orderForm: 1.1,
  urgency: 0.4,
  guarantee: 0.6,
  faq: 1.2,
  cta: 0.7,
  footer: 0.6,
};
/** A type the table does not know (a section added later without `features.h`). */
const UNKNOWN_SCREENS = 1.0;

export const DENSITY_FACTOR = { airy: 1.2, balanced: 1, dense: 0.85 } as const;
export const SPACING_FACTOR = { tight: 0.95, normal: 1, airy: 1.08 } as const;
/** G21 adds (G21 − 1) × this many screens per section. */
export const G21_SCREENS = 0.12;

/** Sections whose height is a fixed row, never scaled (the header 68, the announcement 42; DES-§5.12). */
const FIXED_ROWS: Readonly<Record<string, number>> = { header: ROW.header, announcement: ROW.announcement };

/**
 * Variants drawn before their composition sheet (the pre-sheet compositions still rendered for documents without a
 * look): their section height (screens, before density) and, for heroes, the fold stack measured on their renders
 * (calibration/heights.json, fitted by scripts/qa/design-heights-fit.ts: the title and lead lines come from the model,
 * every other row is the measured median difference; Latin and Arabic apart). A variant leaves this table in the change
 * that redraws it from its sheet, and the calibration is re-measured in that change. A document with a look always
 * uses the sheet (looks are generated after the redraws).
 */
export interface PreSheet {
  h: number;
  fold?: Readonly<Record<"lat" | "ar", readonly FoldStep[]>>;
  /**
   * The pre-sheet composition sizes its image from the photo's shape (a wide product gets a landscape stage), which a
   * document does not carry: its fold estimate keeps a wider error until the redraw puts the image in the sheet's vh
   * row (test:design reports it against a 25 % bound instead of 10 %; the flag leaves with the entry).
   */
  photoSized?: true;
}

/** A title-first legacy hero: title, lead, image, price, CTA, COD. */
const titleFirst = (pad: number, gapImage: number, image: number, price: number, cta: number): FoldStep[] => [
  { el: "title", gap: pad, lines: 3, sizePx: 44, step: "D" },
  { el: "lead", gap: GAP.text, lines: 3, sizePx: 18, step: "L" },
  { el: "image", gap: gapImage, px: image },
  { el: "price", gap: 0, px: price },
  { el: "cta", gap: 0, px: cta },
  { el: "cod", gap: 0, px: ROW.cod },
];

export const PRE_SHEET: Readonly<Record<string, PreSheet>> = {
  "hero:stage": { h: 1.0, photoSized: true, fold: { lat: titleFirst(93, 70, 433, 111, 82), ar: titleFirst(75, 6, 423, 110, 82) } },
  "hero:editorial": { h: 1.25, fold: { lat: titleFirst(94, -38, 496, 112, 82), ar: titleFirst(106, 40, 509, 113, 82) } },
  "hero:spec": { h: 1.55, fold: { lat: titleFirst(112, 40, 706, 51, 83), ar: titleFirst(112, 40, 706, 51, 83) } },
  "hero:poster": {
    h: 1.15,
    photoSized: true,
    // the product and its price badge first, then the giant title, the lead and the button
    fold: {
      lat: [
        { el: "image", gap: 103, px: 267 },
        { el: "price", gap: 0, px: 141 },
        { el: "title", gap: 0, lines: 3, sizePx: 44, step: "D" },
        { el: "lead", gap: GAP.text, lines: 3, sizePx: 18, step: "L" },
        { el: "cta", gap: 116, px: 82 },
        { el: "cod", gap: 0, px: ROW.cod },
      ],
      ar: [
        { el: "image", gap: 88, px: 306 },
        { el: "price", gap: 0, px: 122 },
        { el: "title", gap: 0, lines: 3, sizePx: 44, step: "D" },
        { el: "lead", gap: GAP.text, lines: 3, sizePx: 18, step: "L" },
        { el: "cta", gap: 84, px: 84 },
        { el: "cod", gap: 0, px: ROW.cod },
      ],
    },
  },
  "problem:chat": { h: 1.6 },
  "socialProof:whatsapp": { h: 1.35 },
  "stats:big-numbers": { h: 1.5 },
  "cta:stamp": { h: 1.25 },
  "guarantee:seal": { h: 1.4 },
  "trustBar:stamps": { h: 0.45 },
  "marquee:tape": { h: 0.1 },
  "offer:tickets": { h: 2.4 },
};

/** The 390 title column of a hero (the container; the sheet's `max-inline-size` caps a display line at 14 ch). */
const MEASURE_390 = 358;

export interface HeightParams {
  dens: keyof typeof DENSITY_FACTOR;
  space: number;
  type: TypeLook["type"];
}

/** Density, G21 and the type genes: the look's, else the genome's (`genomeOf` reads the archetype defaults). */
export function heightParams(doc: PageDoc, look: ThemeLook | null): HeightParams {
  if (look) return { dens: look.dens, space: look.space, type: look.type };
  const g = genomeOf(doc);
  const b = g.brand;
  return {
    dens: g.page.G20.l,
    space: g.page.G21,
    type: { rm: b.G5.rm, rd: b.G5.rd, dmax: b.G5.dmax, w: b.G6.w, wAr: b.G6.wAr, tk: b.G6.tk, dc: b.G7.dc, lb: b.G7.lb, nu: b.G8 },
  };
}

/** Visible characters of a copy string without the inline markup (`*em*`, `**strong**`). */
const visibleChars = (s: unknown) => (typeof s === "string" ? [...s.replace(/\*+/g, "").trim()].length : 0);

/** Line metrics of the fold from typeTokens and the display face's measured advance (DES-§10.5 "Measure and line count"). */
export function foldType(doc: PageDoc, p: HeightParams, locale: Locale): FoldType {
  const ar = locale === "ar";
  const fonts = doc.theme.fonts;
  const tt = typeTokens({ display: fonts.display, body: fonts.body, displayAr: fonts.displayAr, bodyAr: fonts.bodyAr }, { type: p.type }, locale);
  const lat = fontData(fonts.display)?.metrics;
  const arm = arabicMetrics(fonts.displayAr)?.metrics;
  const latAdvance = (lat && lat.unitsPerEm > 0 ? lat.xWidthAvg / lat.unitsPerEm : 0.5) * (p.type.dc === "uppercase" ? 1.3 : 1);
  const arAdvance = arm ? (arm.advanceAvg / arm.unitsPerEm) * tt.arScale : 0.52;
  const leadLh = ar ? tt.bodyLh : 1.5;
  return {
    lineOf: (size: number, step: TypeStep) => {
      if (step === "L") return (ar ? 19 : 18) * leadLh;
      return ar ? size * tt.arScale * Math.max(tt.displayLh, 1.25) : size * tt.displayLh;
    },
    linesOf: (chars: number, size: number, measure: number, step: TypeStep) => {
      const adv = step === "L" ? (ar ? 0.5 : 0.48) : ar ? arAdvance : latAdvance;
      const em = step === "L" ? (ar ? 19 : 18) : size;
      // a display line never runs past 14 ch of its own face (T6)
      const column = step === "L" ? measure : Math.min(measure, 14 * em * Math.max(0.45, ar ? arAdvance : latAdvance) * 1.6);
      return Math.max(1, Math.ceil((chars * adv * em) / Math.max(1, column)));
    },
  };
}

/** A section's height at 390 in px. */
function sectionPx(f: VariantFeaturesResolved, type: string, variant: string, spacing: string, doc: PageDoc, p: HeightParams, look: boolean): number {
  const pre = look ? undefined : PRE_SHEET[`${type}:${variant}`];
  const h = pre ? pre.h : f.h;
  if (h !== undefined && typeof h === "object") {
    const per = h.per ?? {};
    const offers = Math.max(0, doc.offers.bundles.length - 2);
    // the per-piece option groups the form shows for the lead item (a field group or an order-level choice is not one)
    const groups = (doc.items[0]?.groups ?? []).filter((g) => g.kind !== "field" && (g as { perUnit?: boolean }).perUnit !== false).length;
    const bump = doc.offers.orderBump ? 1 : 0;
    return Math.round((h.base + offers * (per.offerRow ?? 0) + groups * (per.optionGroup ?? 0) + bump * (per.bump ?? 0)) * SCREEN);
  }
  if (h === undefined && FIXED_ROWS[type] !== undefined) return FIXED_ROWS[type]!;
  const base = typeof h === "number" ? h : (TYPE_SCREENS[type] ?? UNKNOWN_SCREENS);
  // a variant that draws nothing (header:none) takes no space, whatever the section spacing
  if (base === 0) return 0;
  const sp = SPACING_FACTOR[spacing as keyof typeof SPACING_FACTOR] ?? 1;
  return Math.round((base * DENSITY_FACTOR[p.dens] * sp + (p.space - 1) * G21_SCREENS) * SCREEN);
}

/** Generic fold steps from `features.fold` rows, for a hero family without a sheet. */
function stepsFromRows(rows: NonNullable<VariantFeaturesResolved["fold"]>["rows"]): FoldStep[] {
  const steps: FoldStep[] = [];
  for (const r of rows) {
    const first = steps.length === 0;
    switch (r.el) {
      case "image":
      case "grid":
        steps.push({ el: "image", gap: first ? 0 : GAP.afterImage, ...(r.vh !== undefined ? { vh: r.vh } : { px: 160 }) });
        break;
      case "title":
        steps.push({ el: "title", gap: first ? 0 : GAP.afterImage, lines: r.lines ?? 2, sizePx: 44, step: "D" });
        break;
      case "callouts":
        steps.push({ el: "callouts", gap: GAP.afterImage, lines: r.lines ?? 2, px: ROW.callout });
        break;
      case "facts":
        steps.push({ el: "facts", gap: GAP.text, lines: r.lines ?? 3, px: ROW.fact });
        break;
      case "band":
        steps.push({ el: "price", gap: GAP.afterImage, px: ROW.priceCta });
        break;
      case "price":
        steps.push({ el: "price", gap: GAP.afterImage, px: ROW.price });
        break;
      case "cta":
        steps.push(r.lines === 0 ? { el: "cta", gap: 0, inline: true } : { el: "cta", gap: GAP.text, px: ROW.button });
        break;
      case "cod":
        steps.push({ el: "cod", gap: GAP.beforeCod, px: ROW.cod });
        break;
    }
  }
  return steps;
}

const FOLD_ITEMS: readonly FoldItem[] = ["image", "price", "cta", "cod"];

/** ≤ 1 ms. `doc` is widened to PageDoc | StorePageDoc at the R2 contract step (DES-R27). */
export function estimateHeights(
  doc: PageDoc,
  opts: { look: ThemeLook | null; locale: Locale; features: (type: string, variant: string, data: unknown) => VariantFeaturesResolved },
): HeightReport {
  const p = heightParams(doc, opts.look);
  const sections: HeightReport["sections"] = [];
  let top = 0;
  let formTop: number | null = null;
  let formHeight: number | null = null;
  let hero: { variant: string; top: number; data: unknown; f: VariantFeaturesResolved } | null = null;
  let hasAnnouncement = false;
  for (const s of doc.sections) {
    if (s.hidden) continue;
    const f = opts.features(s.type, s.variant, s.data);
    if (f.fixed !== null) continue;
    const height = sectionPx(f, s.type, s.variant, s.spacing, doc, p, !!opts.look);
    if (s.type === "announcement" && !hero) hasAnnouncement = true;
    if (s.type === "hero" && !hero) hero = { variant: s.variant, top, data: s.data, f };
    if (s.type === "orderForm" && formTop === null) {
      formTop = top;
      formHeight = height;
    }
    sections.push({ id: s.id, type: s.type, variant: s.variant, top, height });
    top += height;
  }

  // the fold: the first hero's stack at 390 × 844 (DES-§5.12)
  const items: Partial<Record<FoldItem, number>> = {};
  if (hero) {
    const ar = opts.locale === "ar";
    const data = (hero.data ?? {}) as Record<string, unknown>;
    const type = foldType(doc, p, opts.locale);
    const pre = !opts.look ? PRE_SHEET[`hero:${hero.variant}`]?.fold : undefined;
    const sheet = sheetOf("hero", hero.variant);
    const steps = pre?.[ar ? "ar" : "lat"] ?? sheet?.fold ?? (hero.f.fold ? stepsFromRows(hero.f.fold.rows) : null);
    if (steps) {
      const lay = foldLayout(steps, {
        ar,
        top: hero.top,
        type,
        // an empty hero title renders the product name (HeroTitle)
        titleChars: visibleChars(data.title) || visibleChars(doc.product.name),
        leadChars: visibleChars(data.subtitle),
        measure390: MEASURE_390,
      });
      for (const k of FOLD_ITEMS) if (lay.items[k] !== undefined) items[k] = lay.items[k];
    }
  }
  const tops = FOLD_ITEMS.map((k) => items[k]).filter((v): v is number => v !== undefined);
  return {
    v: 1,
    viewport: VIEWPORT,
    sections,
    total: top,
    screens: Math.round((top / SCREEN) * 100) / 100,
    formTop,
    formHeight,
    fold: { family: hero?.variant ?? "", ok: tops.every((t) => t <= SCREEN), items, limit: SCREEN },
    inFlow: sections.length,
  };
}
