/**
 * Section registry — the catalog the builder, generator and renderer use.
 * Order here = order in the "Add section" library.
 *
 * `VARIANT_FEATURES` (P6 DESIGN; design.md DES-§8.4, DES-§5.13, DS33) is every variant's `features`: the data the
 * design gates, the core's budget gate (rows C2, C3, F1, R1, R4, R5, K2, I1) and Store Health read through
 * `variantFeatures()` (src/lib/design/features.ts). A sheeted variant's `fold`, `slots` and `h` are generated from its
 * composition sheet (`sheetFeatures`, src/lib/design/sheets.ts), never typed by hand; the other `h` values are
 * fitted on the measured renders (src/lib/design/calibration/heights.json, scripts/qa/design-heights.ts). The order
 * form's entries are an overlay here because orderForm/** is P3's (LAN R12: 1.1 screens, fixed). `test:registry`
 * (src/landing/selftest-registry.ts) holds the rules: every variant declares features and a family, heroes a fold,
 * fixed layers their height, sheets equal, decor paths exist, aurora false.
 */
import { SHEETS, sheetFeatures } from "@/lib/design/sheets";
import type { VariantFeatures } from "@/lib/design/types";
import type { AnySectionDefinition } from "./types";
import announcement from "./sections/announcement";
import header from "./sections/header";
import hero from "./sections/hero";
import trustBar from "./sections/trustBar";
import marquee from "./sections/marquee";
import problem from "./sections/problem";
import benefits from "./sections/benefits";
import showcase from "./sections/showcase";
import steps from "./sections/steps";
import story from "./sections/story";
import gallery from "./sections/gallery";
import video from "./sections/video";
import beforeAfter from "./sections/beforeAfter";
import comparison from "./sections/comparison";
import specs from "./sections/specs";
import reviews from "./sections/reviews";
import socialProof from "./sections/socialProof";
import stats from "./sections/stats";
import offer from "./sections/offer";
import urgency from "./sections/urgency";
import guarantee from "./sections/guarantee";
import orderForm from "./sections/orderForm";
import cta from "./sections/cta";
import faq from "./sections/faq";
import footer from "./sections/footer";
import stickyCta from "./sections/stickyCta";
import whatsappFloat from "./sections/whatsappFloat";

export const SECTIONS: AnySectionDefinition[] = [
  announcement,
  header,
  hero,
  trustBar,
  marquee,
  problem,
  benefits,
  showcase,
  steps,
  story,
  gallery,
  video,
  beforeAfter,
  comparison,
  specs,
  reviews,
  socialProof,
  stats,
  offer,
  urgency,
  guarantee,
  orderForm,
  cta,
  faq,
  footer,
  stickyCta,
  whatsappFloat,
];

const BY_TYPE = new Map<string, AnySectionDefinition>(SECTIONS.map((s) => [s.type, s]));

export function getSection(type: string): AnySectionDefinition | undefined {
  return BY_TYPE.get(type);
}

export const SECTION_TYPES = SECTIONS.map((s) => s.type);

/* ------------------------------------------------------------------ */
/* Variant features (DES-§8.4)                                         */
/* ------------------------------------------------------------------ */

/** A sheeted variant: `family`, `fold`, `slots` and `h` from its composition sheet (DS47). */
const sheet = (key: string, f: Omit<VariantFeatures, "fold" | "slots" | "h" | "family">): VariantFeatures => {
  const sh = SHEETS[key];
  if (!sh) throw new Error(`no composition sheet ${key}`);
  return { ...f, family: sh.family, ...sheetFeatures(sh) };
};

/** No opener: the variant draws no SectionHeader (bars, strips, the hero's own head, the form, the footer). */
const NO_OPENER: VariantFeatures["openers"] = [];
const HERO = { ctas: 1, openers: NO_OPENER } as const;
/** `[data-reveal]` nodes of a SectionHeader with a kicker, a title and a lead (measured on the fixtures). */
const HEAD = 4;
/** The order form (P3's type): 1.1 screens in its default state, fixed (LAN R12, DES-§5.3). */
const FORM_H: VariantFeatures["h"] = { base: 1.1, fixed: true, per: { offerRow: 0.15, optionGroup: 0.25, bump: 0.07 } };

/** Every variant's features, by type then variant id (orderForm: the P3-owned type's overlay). */
export const VARIANT_FEATURES: Readonly<Record<string, Readonly<Record<string, VariantFeatures>>>> = {
  announcement: {
    ticker: { family: "list", glass: 1, scroller: true, openers: NO_OPENER, textRuns: ["marquee"] },
    static: { family: "list", centered: true, openers: NO_OPENER },
    split: { family: "list", glass: 1, openers: NO_OPENER },
  },
  header: {
    minimal: { family: "list", glass: 1, ctas: 1, openers: NO_OPENER },
    centered: { family: "list", glass: 1, centered: true, openers: NO_OPENER },
    none: { family: "list", h: 0, openers: NO_OPENER },
  },
  hero: {
    stage: sheet("hero:stage", { ...HERO, glass: 1, ghostWord: true, overlayChips: 3, revealNodes: 12, decor: { ghost: "bigWord", chips: "notes" }, textRuns: ["display", "ghost"] }),
    editorial: sheet("hero:editorial", { ...HERO, revealNodes: 13, textRuns: ["display"] }),
    poster: sheet("hero:poster", { ...HERO, ring: true, ghostWord: true, revealNodes: 10, decor: { ghost: "bigWord" }, textRuns: ["display", "ghost", "badge"] }),
    scrapbook: {
      ...HERO,
      family: "grid",
      glass: 1,
      overlayChips: 2,
      revealNodes: 11,
      decor: { chips: "notes" },
      textRuns: ["display"],
      fold: { rows: [{ el: "grid", vh: 58 }, { el: "title", lines: 2 }, { el: "price" }, { el: "cta" }, { el: "cod" }] },
    },
    spec: sheet("hero:spec", { ...HERO, glass: 1, overlayChips: 3, revealNodes: 16, decor: { chips: "notes" }, textRuns: ["display"] }),
    split: sheet("hero:split", { ...HERO, revealNodes: 12, textRuns: ["display"] }),
  },
  trustBar: {
    chips: { family: "list", h: 0.4, glass: 1, openers: NO_OPENER },
    stamps: sheet("trustBar:stamps", { ring: true, openers: NO_OPENER, textRuns: ["badge"] }),
    ledger: { family: "ledger", h: 0.45, iconHeads: true, openers: NO_OPENER },
    ribbon: { family: "list", h: 0.1, scroller: true, openers: NO_OPENER, textRuns: ["marquee"] },
  },
  marquee: {
    tape: sheet("marquee:tape", { scroller: true, openers: NO_OPENER, textRuns: ["marquee"] }),
    outline: { family: "statement", h: 0.15, glass: 1, scroller: true, openers: NO_OPENER, textRuns: ["marquee"] },
    double: { family: "statement", h: 0.25, scroller: true, openers: NO_OPENER, textRuns: ["marquee"] },
  },
  problem: {
    crossed: { family: "ledger", h: 1.45, ctas: 1, revealNodes: HEAD, textRuns: ["display"] },
    chat: sheet("problem:chat", { glass: 1, ctas: 1, revealNodes: HEAD }),
    split: { family: "split", h: 2.15, ctas: 1, revealNodes: HEAD },
    quote: { family: "statement", h: 1.4, ctas: 1, centered: true, textRuns: ["display"] },
  },
  benefits: {
    numbered: { family: "list", h: 1.85, revealNodes: HEAD },
    bento: { family: "grid", h: 3.4, bento: true, glass: 1, iconHeads: true, revealNodes: HEAD },
    zigzag: { family: "split", h: 2.95, glass: 1, overlayChips: 1, revealNodes: HEAD },
    icons: { family: "grid", iconHeads: true, equalCards: 4, cardGrid: true, revealNodes: HEAD },
    stack: { family: "list", h: 5.15, animatesLayout: true, revealNodes: HEAD },
  },
  showcase: {
    hotspots: { family: "media", h: 1.35, revealNodes: HEAD },
    exploded: { family: "media", h: 1.75, revealNodes: HEAD },
    ingredients: { family: "grid", h: 1.7, bento: true, revealNodes: HEAD },
    dimensions: { family: "media", h: 1.15, revealNodes: HEAD },
  },
  steps: {
    timeline: { family: "list", h: 1.15, ctas: 1, animatesLayout: true, revealNodes: HEAD },
    cards: { family: "grid", h: 1.75, ctas: 1, glass: 1, equalCards: 3, cardGrid: true, revealNodes: HEAD },
    illustrated: { family: "grid", h: 1.45, ctas: 1, glass: 1, revealNodes: HEAD },
    strip: { family: "grid", h: 0.85, ctas: 1, scroller: true, equalCards: 4, cardGrid: true, revealNodes: HEAD },
  },
  story: {
    letter: { family: "split", revealNodes: 3 },
    "image-text": { family: "split", h: 1.55, glass: 1, overlayChips: 1 },
    manifesto: { family: "statement", h: 1.05, centered: true, animatesLayout: true, textRuns: ["display"] },
  },
  gallery: {
    carousel: { family: "media", h: 1.2, ctas: 1, scroller: true, revealNodes: HEAD },
    masonry: { family: "grid", h: 1.4, ctas: 1, bento: true, revealNodes: HEAD },
    filmstrip: { family: "media", h: 1.25, ctas: 1, scroller: true, revealNodes: HEAD },
    lookbook: { family: "grid", h: 1.2, ctas: 1, revealNodes: HEAD },
  },
  video: {
    framed: { family: "media", h: 1.25, ctas: 1, glass: 1, revealNodes: HEAD },
    phone: { family: "split", h: 1.3, ctas: 1, overlayChips: 2, revealNodes: HEAD },
    fullbleed: { family: "media", h: 1.2, ctas: 1, animatesLayout: true, revealNodes: HEAD, textRuns: ["display"] },
  },
  beforeAfter: {
    slider: { family: "media", h: 1.5, glass: 1, animatesLayout: true, revealNodes: HEAD },
    cards: { family: "grid", h: 1.75, revealNodes: HEAD },
    timeline: { family: "list", revealNodes: HEAD },
  },
  comparison: {
    table: { family: "table", h: 1.3, ctas: 1, revealNodes: HEAD },
    versus: { family: "split", h: 2.4, ctas: 1, revealNodes: HEAD },
    checklist: { family: "split", h: 1.85, ctas: 1, revealNodes: HEAD },
  },
  specs: {
    sheet: { family: "ledger", h: 1.3, ctas: 1, revealNodes: HEAD },
    tabs: { family: "table", h: 1.4, ctas: 1, glass: 1, revealNodes: HEAD },
    accordion: { family: "list", h: 2.15, ctas: 1, iconHeads: true, revealNodes: HEAD },
    label: { family: "split", h: 1.75, ctas: 1, revealNodes: HEAD },
  },
  reviews: {
    wall: { family: "grid", h: 1.7, bento: true, scroller: true, revealNodes: HEAD },
    carousel: { family: "statement", h: 0.95, centered: true, scroller: true, revealNodes: 6 },
    summary: { family: "split", h: 2.1, revealNodes: HEAD },
    notes: { family: "grid", h: 1.35, scroller: true, revealNodes: 6 },
  },
  socialProof: {
    whatsapp: sheet("socialProof:whatsapp", { glass: 1, overlayChips: 1, equalCards: 3, cardGrid: true, revealNodes: HEAD }),
    ugc: { family: "media", h: 1.25, revealNodes: HEAD },
    counter: { family: "statement", h: 1.15, centered: true, ring: true, revealNodes: HEAD, textRuns: ["badge", "marquee"] },
  },
  stats: {
    "big-numbers": sheet("stats:big-numbers", { revealNodes: HEAD }),
    rings: { family: "media", h: 1.05, revealNodes: HEAD },
    ticker: { family: "statement", scroller: true, revealNodes: HEAD, textRuns: ["marquee"] },
  },
  offer: {
    stacked: { family: "grid", h: 1.6, bento: true, picker: true, revealNodes: 7 },
    tickets: sheet("offer:tickets", { picker: true, equalCards: 3, cardGrid: true, revealNodes: 7 }),
    shelf: { family: "grid", h: 1.35, picker: true, equalCards: 3, cardGrid: true, revealNodes: HEAD },
  },
  urgency: {
    countdown: { family: "media", h: 0.9, glass: 1, openers: NO_OPENER },
    stock: { family: "statement", h: 1.0, centered: true, dots: true, openers: NO_OPENER },
    banner: { family: "list", h: 0.35, ctas: 1, openers: NO_OPENER },
  },
  guarantee: {
    seal: sheet("guarantee:seal", { ctas: 1, ring: true, revealNodes: HEAD, textRuns: ["badge"] }),
    split: { family: "split", h: 1.6, ctas: 1, iconHeads: true, overlayChips: 1, revealNodes: HEAD },
    letter: { family: "statement", ctas: 1 },
  },
  orderForm: {
    card: { family: "split", ctas: 1, picker: true, h: FORM_H, openers: NO_OPENER },
    split: { family: "split", ctas: 1, picker: true, h: FORM_H, openers: NO_OPENER },
    minimal: { family: "list", ctas: 1, picker: true, h: FORM_H, openers: NO_OPENER },
    bold: { family: "statement", ctas: 1, picker: true, ring: true, h: FORM_H, openers: NO_OPENER, textRuns: ["badge"] },
  },
  cta: {
    banner: { family: "split", h: 1.0, ctas: 1, revealNodes: HEAD },
    stamp: sheet("cta:stamp", { ctas: 1, centered: true, ring: true, revealNodes: HEAD, textRuns: ["badge"] }),
    poster: { family: "statement", h: 0.8, ctas: 1, centered: true, textRuns: ["display"] },
  },
  faq: {
    accordion: { family: "list", h: 1.5, revealNodes: HEAD },
    "two-col": { family: "ledger", h: 1.85, animatesLayout: true, revealNodes: HEAD },
    chat: { family: "list", h: 2.85, revealNodes: HEAD },
  },
  footer: {
    simple: { family: "list", h: 1.1, openers: NO_OPENER },
    big: { family: "statement", h: 1.8, openers: NO_OPENER, textRuns: ["display"] },
  },
  stickyCta: {
    bar: { family: "list", glass: 1, ctas: 1, fixed: "bar", fixedPx: 64, openers: NO_OPENER },
    pill: { family: "list", ctas: 1, fixed: "bar", fixedPx: 56, openers: NO_OPENER },
  },
  whatsappFloat: {
    bubble: { family: "list", glass: 1, fixed: "float", fixedPx: 24, openers: NO_OPENER },
    tab: { family: "list", glass: 1, fixed: "float", fixedPx: 24, openers: NO_OPENER },
  },
};
