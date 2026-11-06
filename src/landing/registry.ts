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
/** A hero: one primary CTA, its own head, at most six reveal nodes under a look (DES-§5.11, src/landing/sections/reveal-scope.ts). */
const HERO = { ctas: 1, openers: NO_OPENER, revealNodes: 6 } as const;
/** `[data-reveal]` nodes of a SectionHeader inside the reveal scope "heads": its title and its lead (DES-§5.11). */
const HEAD = 2;
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
    // the redraws (DES-§4.5.4, sheets H1-H4, H9): ghost word and callout chips off unless the section asks (DS56), no
    // turning badge, one signature each (the sheet's), no aurora
    stage: sheet("hero:stage", {
      ...HERO,
      signature: 1,
      overlayChipsMax: 2,
      decor: { ghost: "bigWord", chips: "notes" },
      optIn: { ghost: "ghost", chips: "chips" },
      textRuns: ["display"],
    }),
    editorial: sheet("hero:editorial", { ...HERO, signature: 1, textRuns: ["display"] }),
    poster: sheet("hero:poster", { ...HERO, signature: 1, decor: { ghost: "bigWord" }, optIn: { ghost: "ghost" }, textRuns: ["display"] }),
    // kept for saved pages only (out of every pool): the quiet contact grid of H9, no chips, no glass
    scrapbook: {
      ...HERO,
      family: "grid",
      signature: 1,
      textRuns: ["display"],
      fold: { rows: [{ el: "grid", vh: 58 }, { el: "title", lines: 2 }, { el: "price" }, { el: "cta" }, { el: "cod" }] },
    },
    spec: sheet("hero:spec", { ...HERO, glass: 1, signature: 1, details: 1, overlayChips: 3, decor: { chips: "notes" }, textRuns: ["display"] }),
    split: sheet("hero:split", { ...HERO, textRuns: ["display"] }),
    // section kit II (DES-§4.5.4, sheets H6-H10): one signature each (the sheet's), no chips, no glass, no ghost word
    cinema: sheet("hero:cinema", { ...HERO, signature: 1, textRuns: ["display"] }),
    quiet: sheet("hero:quiet", { ...HERO, signature: 1, textRuns: ["display"] }),
    index: sheet("hero:index", { ...HERO, signature: 1, textRuns: ["display"] }),
    contact: sheet("hero:contact", { ...HERO, signature: 1, textRuns: ["display"] }),
    statement: sheet("hero:statement", { ...HERO, signature: 1, textRuns: ["display"] }),
  },
  trustBar: {
    chips: { family: "list", h: 0.4, glass: 1, openers: NO_OPENER },
    // redrawn as the chips row (S8): no medal, no ring text
    stamps: sheet("trustBar:stamps", { glass: 1, openers: NO_OPENER }),
    ledger: { family: "ledger", h: 0.45, iconHeads: true, openers: NO_OPENER },
    ribbon: { family: "list", h: 0.1, scroller: true, openers: NO_OPENER, textRuns: ["marquee"] },
  },
  marquee: {
    // redrawn as the outline strip (S8, I7): whole items, no tape, no rotation
    tape: sheet("marquee:tape", { glass: 1, scroller: true, openers: NO_OPENER, textRuns: ["marquee"] }),
    outline: { family: "statement", h: 0.15, glass: 1, scroller: true, openers: NO_OPENER, textRuns: ["marquee"] },
    double: { family: "statement", h: 0.25, scroller: true, openers: NO_OPENER, textRuns: ["marquee"] },
  },
  problem: {
    crossed: { family: "ledger", h: 1.45, ctas: 1, revealNodes: HEAD, textRuns: ["display"] },
    // the two-column ledger (S5): no bubbles, no button
    chat: sheet("problem:chat", { revealNodes: HEAD }),
    split: { family: "split", h: 2.15, ctas: 1, revealNodes: HEAD },
    quote: { family: "statement", h: 1.4, ctas: 1, centered: true, textRuns: ["display"] },
  },
  benefits: {
    numbered: { family: "list", h: 1.85, revealNodes: HEAD },
    bento: { family: "grid", h: 3.4, bento: true, glass: 1, iconHeads: true, revealNodes: HEAD },
    zigzag: { family: "split", h: 2.95, glass: 1, overlayChips: 1, revealNodes: HEAD },
    icons: { family: "grid", iconHeads: true, equalCards: 4, cardGrid: true, revealNodes: HEAD },
    stack: { family: "list", h: 5.15, animatesLayout: true, revealNodes: HEAD },
    // numbered rows with hanging thumbnails (S1): no icons
    hanging: sheet("benefits:hanging", { revealNodes: HEAD }),
  },
  showcase: {
    hotspots: { family: "media", h: 1.35, revealNodes: HEAD },
    exploded: { family: "media", h: 1.75, revealNodes: HEAD },
    ingredients: { family: "grid", h: 1.7, bento: true, revealNodes: HEAD },
    dimensions: { family: "media", h: 1.15, revealNodes: HEAD },
    // one large image and its caption column (S2): no price, no button
    figure: sheet("showcase:figure", { revealNodes: HEAD }),
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
    // the contact sheet (S3): 3-6 photos on a 2 px gap, no captions, no button
    contact: sheet("gallery:contact", { revealNodes: HEAD }),
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
    // plain quote cards (S6): no phone mock, no chip over a photo, no button
    whatsapp: sheet("socialProof:whatsapp", { equalCards: 3, cardGrid: true, revealNodes: HEAD }),
    ugc: { family: "media", h: 1.25, revealNodes: HEAD },
    counter: { family: "statement", h: 1.15, centered: true, revealNodes: HEAD, textRuns: ["marquee"] },
  },
  stats: {
    // merchant figures only (S7, DS42); the ticking number is the page's one detail
    "big-numbers": sheet("stats:big-numbers", { details: 1, revealNodes: HEAD }),
    rings: { family: "media", h: 1.05, revealNodes: HEAD },
    ticker: { family: "statement", scroller: true, revealNodes: HEAD, textRuns: ["marquee"] },
  },
  offer: {
    stacked: { family: "grid", h: 1.6, bento: true, picker: true, revealNodes: HEAD },
    // showcase cards with one cut corner (S8): no perforations, no pass colours
    tickets: sheet("offer:tickets", { picker: true, equalCards: 3, cardGrid: true, revealNodes: HEAD }),
    shelf: { family: "grid", h: 1.35, picker: true, equalCards: 3, cardGrid: true, revealNodes: HEAD },
    // the packs as a showcase (S4, R2): the form carries the picker, no button
    showcase: sheet("offer:showcase", { picker: false, scroller: true, equalCards: 3, cardGrid: true, revealNodes: HEAD }),
  },
  urgency: {
    countdown: { family: "media", h: 0.9, glass: 1, openers: NO_OPENER },
    stock: { family: "statement", h: 1.0, centered: true, dots: true, openers: NO_OPENER },
    banner: { family: "list", h: 0.35, ctas: 1, openers: NO_OPENER },
  },
  guarantee: {
    // a hairline card (S8): no seal shape, no circular text
    seal: sheet("guarantee:seal", { ctas: 1, revealNodes: HEAD }),
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
    // the quiet close (S8): start-aligned, one button, no ring of text
    stamp: sheet("cta:stamp", { ctas: 1, revealNodes: HEAD }),
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
