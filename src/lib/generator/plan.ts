/**
 * Page planner — turns an archetype + seed into a section plan that follows DESIGN.md §4:
 *   1. neighbors always read as a change of field (judged on the theme's real colors when known);
 *   2. one full-bleed color moment in the top half (a block that is real color on this theme);
 *   3. order form near the top (the hero CTA scrolls to it), offers mid-page, a final CTA;
 *   4. density alternates (strips and statements between dense blocks);
 *   5. transitions are left to the renderer ("auto": drawn only where the color changes, flush pages).
 * On top of the archetype's taste it applies the product's mood (mood.ts: a calm product gets no
 * scrolling bands, poster or sticker compositions, fewer color blocks, more air) and the redesign
 * audit's template tells (accordion FAQ, three equal cards) are made the exception, not the default.
 * Pure & deterministic per seed.
 */
import type { Archetype, Divider, ProductCategory, SectionBg } from "@/lib/page/schema";
import { SECTION_BGS } from "@/lib/page/schema";
import { getSection } from "@/landing/registry";
import { ARCHETYPE_DEFS, THEME_SECTION_TYPES, type ThemeSectionType } from "@/lib/theme";
import type { ProductMood } from "./mood";
import { rngFor, weighted, shuffle } from "./rng";
import { NAMED_TONES, type Tones } from "./tones";

export type Spacing = "tight" | "normal" | "airy";

export interface PlannedSection {
  type: string;
  variant: string;
  bg: SectionBg;
  divider: Divider | "auto";
  spacing: Spacing;
}

export interface PlanContext {
  archetype: Archetype;
  seed: number;
  category: ProductCategory;
  hasCutout: boolean;
  /** product photos (not counting the cutout) */
  imageCount: number;
  /** the merchant gave 2+ product facts */
  hasFacts: boolean;
  /** a WhatsApp number is configured (floating button) */
  hasWhatsapp: boolean;
  /** the product's mood (mood.ts); "calm" quiets the composition. Default "neutral". */
  mood?: ProductMood;
  /**
   * The store has a real name (Settings → Store): true / false; null or absent = unknown. Without
   * one, compositions that put the store's name forward (giant footer wordmark, signed notes) step back.
   */
  storeName?: boolean | null;
  /**
   * A garment (abaya, dress, kaftan… or the fashion category, see mood.ts isGarment). Without merchant
   * facts its page leaves out the compositions that print hard product data (spec sheets, dimension
   * drawings, material boards): the section defaults would describe another kind of product.
   */
  garment?: boolean;
  /**
   * Variants already shown by sibling directions (type → variant ids): made much less likely so
   * the three proposals differ in composition, not only in color and type.
   */
  avoid?: ReadonlyMap<string, ReadonlySet<string>>;
}

/* ------------------------------------------------------------------ */
/* Section order                                                       */
/* ------------------------------------------------------------------ */

const TOP = ["announcement", "header"] as const;
const FLOATING = ["stickyCta", "whatsappFloat"] as const;
/** thin full-width strips: always tight; a strong strip may punctuate right under a color block */
const STRIPS = new Set(["announcement", "header", "trustBar", "marquee"]);
const STRONG: ReadonlySet<SectionBg> = new Set(["accent", "dark", "pop"]);
const STRONG_ORDER: readonly SectionBg[] = ["accent", "dark", "pop"];
const NEUTRAL: readonly SectionBg[] = ["base", "soft", "surface"];

/** Archetype affinity for optional story/proof blocks (0 = never, 1 = always). */
const AFFINITY: Readonly<Record<Archetype, Partial<Record<string, number>>>> = {
  maison: { problem: 0.35, story: 0.9, comparison: 0.1, specs: 0.35, marquee: 0.35, gallery: 0.7, socialProof: 0.3 },
  apothecary: { problem: 0.85, story: 0.45, comparison: 0.5, specs: 0.45, marquee: 0.15, gallery: 0.4, socialProof: 0.35 },
  souk: { problem: 0.55, story: 0.85, comparison: 0.2, specs: 0.2, marquee: 0.6, gallery: 0.6, socialProof: 0.75 },
  playground: { problem: 0.8, story: 0.25, comparison: 0.35, specs: 0.15, marquee: 0.8, gallery: 0.5, socialProof: 0.75 },
  kinetic: { problem: 0.75, story: 0.2, comparison: 0.7, specs: 0.45, marquee: 0.85, gallery: 0.45, socialProof: 0.45 },
  circuit: { problem: 0.6, story: 0.2, comparison: 0.75, specs: 0.85, marquee: 0.3, gallery: 0.4, socialProof: 0.3 },
  hearth: { problem: 0.8, story: 0.45, comparison: 0.6, specs: 0.4, marquee: 0.35, gallery: 0.45, socialProof: 0.75 },
  bloom: { problem: 0.6, story: 0.5, comparison: 0.25, specs: 0.15, marquee: 0.45, gallery: 0.65, socialProof: 0.6 },
  field: { problem: 0.55, story: 0.85, comparison: 0.3, specs: 0.3, marquee: 0.4, gallery: 0.55, socialProof: 0.5 },
  editorial: { problem: 0.45, story: 0.6, comparison: 0.25, specs: 0.45, marquee: 0.6, gallery: 0.8, socialProof: 0.25 },
  garage: { problem: 0.7, story: 0.25, comparison: 0.75, specs: 0.8, marquee: 0.6, gallery: 0.35, socialProof: 0.45 },
};

/** Three proven COD storylines. `$visual`, `$proof`, `$extra` and `$strip` are resolved per page. */
const TEMPLATES: readonly (readonly string[])[] = [
  // classic: promise → benefits → form early → proof and detail → offers → reassurance
  ["hero", "trustBar", "benefits", "orderForm", "problem", "$visual", "$proof", "steps", "$extra", "$strip", "offer", "guarantee", "faq", "cta"],
  // story-first: hook with the problem, then the solution in detail, form after the first proof of value
  ["hero", "trustBar", "problem", "benefits", "$visual", "orderForm", "$proof", "steps", "$extra", "$strip", "offer", "guarantee", "faq", "cta"],
  // proof-first: social proof right after the benefits, before the form
  ["hero", "$strip", "benefits", "$proof", "orderForm", "$visual", "problem", "steps", "$extra", "offer", "guarantee", "faq", "cta"],
];

/** Preferred template per archetype (index into TEMPLATES), best first. */
const TEMPLATE_PREF: Readonly<Record<Archetype, readonly number[]>> = {
  maison: [1, 0, 2],
  apothecary: [1, 0, 2],
  souk: [1, 2, 0],
  playground: [2, 0, 1],
  kinetic: [0, 2, 1],
  circuit: [0, 1, 2],
  hearth: [0, 2, 1],
  bloom: [2, 1, 0],
  field: [1, 0, 2],
  editorial: [1, 2, 0],
  garage: [0, 2, 1],
};

const exists = (type: string) => !!getSection(type);

/** In-flow section types (top bars, footer and floating bars added around them). */
export function chooseOrder(ctx: PlanContext, templateIndex?: number): string[] {
  const aff = AFFINITY[ctx.archetype];
  const rng = rngFor(ctx.seed, "order");
  // a calm page has no scrolling word strip
  const calmFactor = (type: string) => (ctx.mood === "calm" && type === "marquee" ? 0 : 1);
  const roll = (type: string) => rng() < (aff[type] ?? 0.5) * calmFactor(type);
  const tIndex =
    templateIndex ?? weighted(rngFor(ctx.seed, "template"), TEMPLATE_PREF[ctx.archetype].map((t, i) => ({ value: t, weight: [0.6, 0.28, 0.12][i]! })));
  const template = TEMPLATES[tIndex % TEMPLATES.length]!;

  const visual = ctx.imageCount >= 3 && (roll("gallery") || (!ctx.hasCutout && ctx.imageCount >= 4)) ? "gallery" : "showcase";
  const proof = roll("socialProof") ? "socialProof" : "reviews";
  // a garment without merchant facts has no spec sheet to show (the defaults would be another product's)
  const extraPool = ctx.garment && !ctx.hasFacts ? ["story", "comparison"] : ["story", "comparison", "specs"];
  const extras = shuffle(rngFor(ctx.seed, "extras"), extraPool).filter((t) => roll(t)).slice(0, 2);
  const strip = roll("marquee") ? "marquee" : null;

  const out: string[] = [];
  for (const slot of template) {
    if (slot === "$visual") out.push(visual);
    else if (slot === "$proof") out.push(proof);
    else if (slot === "$extra") out.push(...extras);
    else if (slot === "$strip") {
      if (strip) out.push(strip);
    } else if (slot === "problem") {
      if (roll("problem")) out.push("problem");
    } else out.push(slot);
  }
  // the proof-first template opens with a strip: fall back to the trust bar when no marquee
  if (template[1] === "$strip" && !strip) out.splice(1, 0, "trustBar");
  return out.filter((t, i) => exists(t) && out.indexOf(t) === i);
}

/** Full page: top bars + in-flow order + footer + floating bars. */
export function fullOrder(ctx: PlanContext, inFlow: readonly string[]): string[] {
  const floating = FLOATING.filter((t) => t !== "whatsappFloat" || ctx.hasWhatsapp);
  return [...TOP, ...inFlow, "footer", ...floating].filter(exists);
}

/* ------------------------------------------------------------------ */
/* Variants                                                            */
/* ------------------------------------------------------------------ */

const isThemeType = (t: string): t is ThemeSectionType => (THEME_SECTION_TYPES as readonly string[]).includes(t);

/** Variants that read best with a transparent cutout of the product. */
const CUTOUT_HEROES = new Set(["stage", "poster", "spec"]);
/** Sections whose composition sibling directions never share (when the archetype offers another). */
const STRICT_SPREAD = new Set(["hero", "benefits"]);
/** Variants that show one product photo per item. */
const MEDIA_HUNGRY = new Set(["benefits:zigzag", "benefits:stack", "steps:illustrated"]);

/**
 * Template tells the redesign audit flags: the accordion FAQ and three equal cards in a row (step
 * cards, three promise columns). Still possible — the archetype's other compositions just lead.
 */
const GENERIC: Readonly<Record<string, number>> = {
  "faq:accordion": 0.35,
  "specs:accordion": 0.5,
  "steps:cards": 0.45,
  "guarantee:split": 0.55,
};

/** Loud compositions a calm product never needs (scrolling bands, posters, stickers, stamps). */
const LOUD_FOR_CALM: Readonly<Record<string, number>> = {
  "hero:poster": 0.05,
  "hero:scrapbook": 0.15,
  "hero:spec": 0.1,
  "announcement:ticker": 0.15,
  "trustBar:ribbon": 0.05,
  "trustBar:stamps": 0.3,
  "marquee:tape": 0.1,
  "marquee:double": 0.3,
  "orderForm:bold": 0.05,
  "offer:tickets": 0.4,
  "cta:stamp": 0.2,
  "guarantee:seal": 0.45,
  "socialProof:counter": 0.35,
  "stats:ticker": 0.2,
  "reviews:notes": 0.45,
  "comparison:versus": 0.4,
  "faq:chat": 0.6,
};

/**
 * Compositions that put the store's own name forward (a giant wordmark, a signature, a persona):
 * without a real store name they would make a brand out of the product name. The giant wordmark,
 * the signed founder note and the signed promise card leave the draw (≤ 0.1); the others step back.
 */
const NEEDS_STORE_NAME: Readonly<Record<string, number>> = {
  "footer:big": 0.05,
  "story:letter": 0.08,
  "guarantee:letter": 0.08,
  "faq:chat": 0.5,
  "specs:label": 0.6,
};

/**
 * Compositions that print hard product data (measurements, materials, a spec sheet): for a garment
 * without merchant facts the section defaults would describe another kind of product (a necklace's
 * 316L steel, 12 g and 45 cm chain under a prayer abaya) — they leave the draw.
 */
const NEEDS_FACTS_FOR_GARMENT: Readonly<Record<string, number>> = {
  "showcase:dimensions": 0,
  "showcase:ingredients": 0,
};

/**
 * Compositions styled as a WhatsApp channel (recreated chats, status stories with store replies):
 * on a store without a WhatsApp number they suggest a conversation the visitor cannot start — the
 * section's other proof compositions (story frames, the order counter) take their place.
 */
const NEEDS_WHATSAPP: Readonly<Record<string, number>> = {
  "socialProof:whatsapp": 0,
};

/**
 * Compositions whose whole point is one hard figure ("1 850 orders delivered and paid since the
 * store opened"): a generated page has no real figure yet, and an invented one printed huge is a
 * fake statistic, not a sample testimony. They leave the draw while the section has another
 * composition; the merchant picks them in the builder once the number is real.
 */
const INVENTED_FIGURE: Readonly<Record<string, number>> = {
  "socialProof:counter": 0,
};

type ReservationContext = Pick<PlanContext, "mood" | "storeName" | "garment" | "hasFacts" | "hasWhatsapp">;

/**
 * Combined weight multiplier of a variant for this page (1 = no reservation). The store name counts
 * as missing unless the caller says it is real: the wizard does not always know it, and a page that
 * signs a note or prints a giant wordmark with the product's name is worse than one that does not.
 */
function reservation(key: string, ctx: ReservationContext): number {
  let m = GENERIC[key] ?? 1;
  if (ctx.mood === "calm") m *= LOUD_FOR_CALM[key] ?? 1;
  if (ctx.storeName !== true) m *= NEEDS_STORE_NAME[key] ?? 1;
  if (ctx.garment && !ctx.hasFacts) m *= NEEDS_FACTS_FOR_GARMENT[key] ?? 1;
  if (!ctx.hasWhatsapp) m *= NEEDS_WHATSAPP[key] ?? 1;
  m *= INVENTED_FIGURE[key] ?? 1;
  return m;
}

/**
 * The section kit II variants (design.md DES-§4.5.4, sheets H6-H10, S1-S4): composed for a genome's look, reached
 * through the grammar pools (src/lib/design/compile.ts, release flag `design_new_heroes`). The archetype draw below
 * never picks them, so pages generated without a look stay what they were.
 */
export const LOOK_ONLY: ReadonlySet<string> = new Set([
  "hero:cinema",
  "hero:quiet",
  "hero:index",
  "hero:contact",
  "hero:statement",
  "benefits:hanging",
  "showcase:figure",
  "gallery:contact",
  "offer:showcase",
]);

type VariantContext = Pick<PlanContext, "archetype" | "seed" | "hasCutout" | "imageCount" | "avoid" | "mood" | "storeName" | "garment" | "hasFacts" | "hasWhatsapp">;

export function chooseVariant(
  type: string,
  ctx: VariantContext,
  salt = "",
  exclude?: ReadonlySet<string>,
): string {
  const def = getSection(type);
  const every = def?.variants.map((v) => v.id).filter((id) => id !== "none" && !LOOK_ONLY.has(`${type}:${id}`)) ?? [];
  const allowed = exclude ? every.filter((id) => !exclude.has(id)) : every;
  const ids = allowed.length ? allowed : every;
  if (!def || ids.length === 0) return def?.variants[0]?.id ?? "default";
  const prefs = isThemeType(type) ? ARCHETYPE_DEFS[ctx.archetype].preferredVariants[type].filter((v) => ids.includes(v)) : [];
  const tagged = def.variants.filter((v) => v.archetypes?.includes(ctx.archetype) && ids.includes(v.id)).map((v) => v.id);
  const ranked = [...prefs, ...tagged.filter((v) => !prefs.includes(v))];
  // a composition this page all but rules out (a poster hero for a prayer abaya, a giant wordmark
  // without a store name) leaves the draw while the archetype offers another — even one a sibling
  // direction already shows
  const fitting = ranked.filter((id) => reservation(`${type}:${id}`, ctx) > 0.1);
  // when the archetype offers nothing that fits, the section's other compositions that do
  const others = fitting.length ? [] : ids.filter((id) => !ranked.includes(id) && reservation(`${type}:${id}`, ctx) > 0.1);
  const all = fitting.length ? fitting : others.length ? others : ranked;
  // the first impressions (hero, benefits): sibling directions never repeat them while the archetype has another
  const fresh = STRICT_SPREAD.has(type) ? all.filter((id) => !ctx.avoid?.get(type)?.has(id)) : all;
  const preferred = fresh.length ? fresh : all;
  if (preferred.length === 0) return ids[0]!;
  // when a preferred composition is a template tell or too loud for this product, the section's
  // other compositions join the draw (never for the hero: it is the archetype's signature)
  const reserved = preferred.some((id) => reservation(`${type}:${id}`, ctx) < 1);
  const extras =
    reserved && type !== "hero"
      ? ids.filter((id) => !preferred.includes(id) && reservation(`${type}:${id}`, ctx) >= 1 && !(STRICT_SPREAD.has(type) && ctx.avoid?.get(type)?.has(id)))
      : [];
  const pool = [...preferred, ...extras];
  const weights = pool.map((id, i) => {
    let w = i < preferred.length ? ([0.58, 0.27, 0.15, 0.08][i] ?? 0.05) : 0.2;
    w *= reservation(`${type}:${id}`, ctx);
    if (type === "hero" && CUTOUT_HEROES.has(id) && !ctx.hasCutout) w *= 0.2;
    if (type === "hero" && id === "split" && ctx.imageCount < 2) w *= 0.6;
    if (type === "gallery" && ctx.imageCount < 3) w *= 0.5;
    // one photo per item: with few photos the same picture would repeat down the page
    if (ctx.imageCount < 3 && MEDIA_HUNGRY.has(`${type}:${id}`)) w *= 0.25;
    // sections a sibling direction already composed this way: a gentle nudge elsewhere
    if (ctx.avoid?.get(type)?.has(id)) w *= 0.15;
    return { value: id, weight: w };
  });
  return weighted(rngFor(ctx.seed, `variant:${type}${salt}`), weights);
}

/** Variants that carry an endless scrolling band (MarqueeTrack). */
const MOVING_VARIANTS = new Set(["socialProof:counter", "stats:ticker", "trustBar:ribbon"]);
const isMoving = (type: string, variant: string) => type === "marquee" || MOVING_VARIANTS.has(`${type}:${variant}`);

/**
 * One scrolling band in the page body: two or three marquees on one page read as filler, not as a
 * signature. The marquee section keeps it when the page has one, else the first moving variant; the
 * other moving variants are re-chosen among the section's calm ones (the announcement ticker is a top
 * bar convention and stays).
 */
export function calmBands<T extends { type: string; variant: string }>(items: readonly T[], ctx: VariantContext): T[] {
  let kept = items.findIndex((it) => it.type === "marquee");
  return items.map((it, i) => {
    if (it.type === "announcement" || !isMoving(it.type, it.variant)) return it;
    if (kept < 0) kept = i;
    if (i === kept) return it;
    const moving = new Set((getSection(it.type)?.variants ?? []).map((v) => v.id).filter((id) => isMoving(it.type, id)));
    const variant = chooseVariant(it.type, ctx, ":calm", moving);
    return variant === it.variant ? it : { ...it, variant };
  });
}

/* ------------------------------------------------------------------ */
/* Backgrounds                                                         */
/* ------------------------------------------------------------------ */

type Slot = SectionBg | "M1" | "M2" | "M3";

/** Background wishes per section (and per variant), most wanted first. M1–M3 = the page's color moments. */
const BG_PREFS: Readonly<Record<string, readonly Slot[]>> = {
  announcement: ["M1", "dark", "accent"],
  header: ["base"],
  "hero:poster": ["M1", "accent", "pop", "dark"],
  "hero:spec": ["dark", "M1"],
  "hero:stage": ["soft", "base", "surface"],
  "hero:editorial": ["base", "soft"],
  "hero:scrapbook": ["soft", "base"],
  "hero:split": ["base", "surface"],
  hero: ["soft", "base"],
  trustBar: ["surface", "soft", "M1"],
  "trustBar:ribbon": ["M1", "accent", "pop"],
  marquee: ["M1", "M2", "accent", "dark"],
  problem: ["soft", "base", "M2"],
  "problem:quote": ["M2", "dark", "soft"],
  benefits: ["base", "surface", "soft"],
  showcase: ["surface", "soft", "M2"],
  "showcase:hotspots": ["M2", "surface", "soft"],
  stats: ["M1", "M2", "surface"],
  beforeAfter: ["surface", "soft", "base"],
  gallery: ["base", "soft"],
  video: ["dark", "M2", "surface"],
  orderForm: ["soft", "surface", "base"],
  "orderForm:bold": ["M1", "accent", "pop"],
  reviews: ["soft", "base", "surface"],
  socialProof: ["soft", "base", "surface"],
  steps: ["base", "surface", "soft"],
  story: ["M2", "soft", "dark"],
  "story:manifesto": ["M2", "dark", "accent"],
  comparison: ["base", "surface"],
  specs: ["surface", "base", "soft"],
  offer: ["base", "soft", "surface"],
  urgency: ["base", "soft", "surface"],
  guarantee: ["surface", "soft", "base"],
  faq: ["base", "soft"],
  cta: ["M1", "M2", "accent", "dark"],
  footer: ["dark", "soft", "surface"],
  stickyCta: ["base"],
  whatsappFloat: ["base"],
};

/**
 * Calm pages: the thin top bar is a quiet ink line (never the accent), strips stay on light fields,
 * and the color moments are kept for content that earns them.
 */
const CALM_BG_PREFS: Readonly<Record<string, readonly Slot[]>> = {
  announcement: ["dark", "soft", "surface"],
  trustBar: ["surface", "soft", "base"],
  "trustBar:ribbon": ["soft", "surface", "M1"],
  marquee: ["soft", "surface", "M2"],
  stats: ["surface", "soft", "M1"],
  "orderForm:bold": ["soft", "surface", "M1"],
  // the page ends light: a dark slab under the final color block is one heavy block too many
  footer: ["soft", "surface", "dark"],
};

const prefsFor = (type: string, variant: string, mood?: ProductMood): readonly Slot[] =>
  (mood === "calm" ? (CALM_BG_PREFS[`${type}:${variant}`] ?? CALM_BG_PREFS[type]) : undefined) ??
  BG_PREFS[`${type}:${variant}`] ??
  BG_PREFS[type] ??
  ["base", "soft"];

/** Backgrounds a variant supports (VariantDef.bgs; all when unrestricted). */
function allowedFor(type: string, variant: string): readonly SectionBg[] {
  const v = getSection(type)?.variants.find((x) => x.id === variant);
  return v?.bgs?.length ? v.bgs : SECTION_BGS;
}

/**
 * The page's color moments: the archetype's characteristic blocks that are real color on THIS theme
 * (a pale pop or a dark block on a dark page is not), then the other strong blocks; a moment too close
 * to an earlier one moves to the end so M1 and M2 never look like the same color.
 */
export function colorMoments(archetype: Archetype, tones: Tones, mood?: ProductMood): SectionBg[] {
  const own = [...new Set(ARCHETYPE_DEFS[archetype].colorMoments)].filter((b) => STRONG.has(b));
  const others = STRONG_ORDER.filter((b) => !own.includes(b));
  const out: SectionBg[] = [];
  // the archetype's own moments first, then the remaining color blocks; within each group a block
  // that looks like one already chosen waits behind the ones that differ
  for (const group of [own, others]) {
    const real = group.filter((b) => tones.strong(b));
    const kept = real.filter((b, k) => real.slice(0, k).every((a) => tones.distinct(a, b)));
    out.push(...kept, ...real.filter((b) => !kept.includes(b)));
  }
  // a theme without any real color block: fall back to the names (still the archetype's order)
  const moments = out.length ? out : [...own, ...others];
  // calm pages: the pop is a tonal companion, never a block of its own (when another moment exists)
  const calm = mood === "calm" ? moments.filter((b) => b !== "pop") : moments;
  return calm.length ? calm : moments;
}

export interface BackgroundOptions {
  /** the product's mood: "calm" pages get fewer color blocks and no pop-colored content block */
  mood?: ProductMood;
}

const isTop = (t: string) => t === "announcement" || t === "header";
/** In-flow distance below which a color block does not repeat its color (3 = two sections between). */
const SAME_COLOR_GAP = 3;
const isFloating = (t: string) => getSection(t)?.category === "floating";

/**
 * Assign a background to every section. `items` is the full page in order (floating included).
 * `seed` varies neutral choices so remixes look different without breaking the rules. With `tones`
 * (the theme's real section colors) "different" and "strong" are judged on color, not on names:
 *   1. neighbors always read as a change (two near-identical fields never touch);
 *   2. a color block never touches another color block — except a thin strip (marquee, ribbon) in a
 *      clearly different color right under it, a classic punctuation;
 *   3. at most four color blocks in the page body (one more per five sections beyond twenty; the
 *      pop color once, any other color twice; the last one kept for the final CTA); one of them in
 *      the top half;
 *   4. every pick respects the variant's own `bgs` restriction.
 */
export function assignBackgrounds(
  items: readonly { type: string; variant: string }[],
  archetype: Archetype,
  seed: number,
  tones?: Tones | null,
  opts: BackgroundOptions = {},
): SectionBg[] {
  const T = tones ?? NAMED_TONES;
  const calm = opts.mood === "calm";
  const moments = colorMoments(archetype, T, opts.mood);
  const moment = (k: number) => moments[k % moments.length]!;
  const resolve = (s: Slot): SectionBg => (s === "M1" ? moment(0) : s === "M2" ? moment(1) : s === "M3" ? moment(2) : s);
  const flowIdx = items.map((it, i) => (isTop(it.type) || isFloating(it.type) ? -1 : i)).filter((i) => i >= 0);
  const half = flowIdx[Math.ceil(flowIdx.length / 2)] ?? items.length;
  const rng = rngFor(seed, "bgs");
  const isStrip = (i: number) => STRIPS.has(items[i]?.type ?? "") && !isTop(items[i]!.type);
  const isBody = (i: number) => !isTop(items[i]!.type) && !isFloating(items[i]!.type) && items[i]!.type !== "footer";
  const strongBlock = (bg: SectionBg | undefined) => !!bg && STRONG.has(bg) && T.strong(bg);
  // four color blocks on a regular page, one more per five sections beyond twenty; two on a calm
  // one (a moment in the top half and the final CTA: a third heavy block reads as an accident on a
  // soft page)
  const strongBudget = (calm ? 2 : 4) + Math.max(0, Math.floor((flowIdx.length - 20) / 5));
  let strongLeft = strongBudget;
  let popLeft = calm ? 0 : 1;
  const ctaAt = items.findIndex((it) => it.type === "cta");
  const used = new Map<SectionBg, number>();
  /** in-flow position of the last block painted in each color (a moment is not repeated two sections later) */
  const lastAt = new Map<SectionBg, number>();
  const out: SectionBg[] = [];

  items.forEach((it, i) => {
    if (isFloating(it.type)) {
      out.push("base");
      return;
    }
    if (it.type === "header") {
      out.push("base");
      return;
    }
    const allowed = new Set(allowedFor(it.type, it.variant));
    const prefs = [...new Set(prefsFor(it.type, it.variant, opts.mood).map(resolve))];
    // light shuffle among two equally calm first choices keeps remixes fresh (a color moment keeps its slot)
    const calmPair = prefs.length > 2 && !STRONG.has(prefs[0]!) && !STRONG.has(prefs[1]!);
    const ordered = calmPair && rng() < 0.35 ? [prefs[1]!, prefs[0]!, ...prefs.slice(2)] : prefs;
    const candidates = [...ordered, ...NEUTRAL, ...moments].filter((b, k, all) => allowed.has(b) && all.indexOf(b) === k);
    // the last in-flow neighbor (floating bars are not neighbors)
    let p = i - 1;
    while (p >= 0 && isFloating(items[p]!.type)) p--;
    const prev = p >= 0 ? out[p] : undefined;
    const prevIsHeader = p >= 0 && items[p]!.type === "header";
    const prevTop = p >= 0 && isTop(items[p]!.type);
    const ok = (bg: SectionBg) => {
      // calm pages never paint a block or a strip in the pop color
      if (calm && bg === "pop" && strongBlock(bg)) return false;
      if (!prev || prevIsHeader) return !strongBlock(bg) || strongLeft > 0 || isTop(it.type);
      if (!T.distinct(prev, bg)) return false;
      const touching = strongBlock(bg) && strongBlock(prev) && !prevTop && it.type !== "footer";
      // a strong strip may sit right under a block of another color; a block never follows a strong strip
      if (touching && !(isStrip(i) && !isStrip(p))) return false;
      if (!strongBlock(bg) || !isBody(i) || isStrip(i)) return true;
      // the last color block is kept for the final CTA when the page has one further down
      const reserve = it.type !== "cta" && ctaAt > i ? 1 : 0;
      // the pop color is a spark: one content block at most (strips may still carry it); any other
      // color block twice at most, so the moments stay moments — and never the same color again
      // within two sections (plum, a light block, plum reads as one block broken in two)
      const near = flowIdx.indexOf(i) - (lastAt.get(bg) ?? Number.NEGATIVE_INFINITY) < SAME_COLOR_GAP;
      return strongLeft > reserve && !near && (bg === "pop" ? popLeft > 0 : (used.get(bg) ?? 0) < 2);
    };
    const bg = candidates.find(ok) ?? candidates.find((b) => !prev || T.distinct(prev, b)) ?? candidates[0] ?? "base";
    if (strongBlock(bg) && isBody(i) && !isStrip(i)) {
      strongLeft--;
      if (bg === "pop") popLeft--;
      used.set(bg, (used.get(bg) ?? 0) + 1);
      lastAt.set(bg, flowIdx.indexOf(i));
    }
    out.push(bg);
  });

  const neighbors = (i: number) => {
    let a = i - 1;
    while (a >= 0 && isFloating(items[a]!.type)) a--;
    let b = i + 1;
    while (b < items.length && isFloating(items[b]!.type)) b++;
    return [a >= 0 && items[a]!.type !== "header" ? out[a] : undefined, b < items.length ? out[b] : undefined] as const;
  };
  const fits = (i: number, bg: SectionBg) => {
    const [before, after] = neighbors(i);
    return allowedFor(items[i]!.type, items[i]!.variant).includes(bg) && (!before || T.distinct(before, bg)) && (!after || T.distinct(bg, after));
  };

  // rule 3: one color moment in the top half of the page — a content block (a strip is punctuation)
  const topHalf = flowIdx.filter((i) => i < half);
  if (!topHalf.some((i) => strongBlock(out[i]) && !isStrip(i))) {
    const candidates = ["showcase", "problem", "story", "socialProof", "reviews", "stats", "steps", "marquee", "trustBar"];
    search: for (const type of candidates) {
      const i = topHalf.find((j) => items[j]!.type === type);
      if (i === undefined) continue;
      const [before, after] = neighbors(i);
      if (strongBlock(before) || strongBlock(after)) continue;
      const popUsed = out.some((b, j) => b === "pop" && isBody(j) && !isStrip(j));
      const pos = flowIdx.indexOf(i);
      const sameNear = (bg: SectionBg) =>
        flowIdx.some((j, k) => j !== i && out[j] === bg && isBody(j) && !isStrip(j) && Math.abs(k - pos) < SAME_COLOR_GAP);
      for (const pick of moments) {
        if (pick === "pop" && popUsed && !isStrip(i)) continue;
        if (!isStrip(i) && sameNear(pick)) continue;
        if (fits(i, pick)) {
          out[i] = pick;
          break search;
        }
      }
    }
  }

  // the promotion above may exceed the page's budget of color blocks: the latest block of the bottom
  // half that is not the final CTA goes back to a quiet ground (the moment moved up, it did not
  // multiply). When no quiet ground differs from both neighbors (two neutrals that read as one), it
  // takes one that differs from the section above and the repair below re-flows what follows.
  const blocks = () => flowIdx.filter((i) => isBody(i) && !isStrip(i) && strongBlock(out[i]));
  const quietFor = (i: number) => {
    const allowed = allowedFor(items[i]!.type, items[i]!.variant);
    const [before] = neighbors(i);
    return NEUTRAL.find((b) => fits(i, b)) ?? NEUTRAL.find((b) => allowed.includes(b) && (!before || T.distinct(before, b)));
  };
  for (let guard = 0; blocks().length > strongBudget && guard < 4; guard++) {
    const extra = blocks()
      .filter((i) => i >= half && items[i]!.type !== "cta")
      .reverse()
      .find((i) => quietFor(i) !== undefined);
    if (extra === undefined) break;
    out[extra] = quietFor(extra)!;
  }

  // repair: neighbors must still read as a change after the moves above (footer vs final CTA
  // included) — a quiet ground first, a color block only while the page's budget allows, else a
  // quiet ground that differs from the section above (the next section is repaired in turn)
  for (let i = 1; i < out.length; i++) {
    if (isFloating(items[i]!.type) || isTop(items[i]!.type)) continue;
    const [before] = neighbors(i);
    if (!before || T.distinct(before, out[i]!)) continue;
    const allowed = allowedFor(items[i]!.type, items[i]!.variant);
    const room = !isBody(i) || isStrip(i) || blocks().filter((j) => j !== i).length < strongBudget;
    out[i] =
      NEUTRAL.find((b) => allowed.includes(b) && fits(i, b)) ??
      (room ? moments.find((b) => allowed.includes(b) && fits(i, b)) : undefined) ??
      NEUTRAL.find((b) => allowed.includes(b) && T.distinct(before, b)) ??
      out[i]!;
  }
  return out.map((b) => ((SECTION_BGS as readonly string[]).includes(b) ? b : "base"));
}

/* ------------------------------------------------------------------ */
/* Spacing                                                             */
/* ------------------------------------------------------------------ */

/** Statement sections: the page breathes around them. */
const AIRY = new Set(["story", "cta", "hero", "problem:quote", "story:manifesto"]);
/** Dense compositions: the section after them gets more air (density alternates). */
const DENSE = new Set(["benefits:bento", "comparison", "specs", "reviews:wall", "showcase:exploded", "gallery", "offer", "orderForm"]);
/** Long working sections never get extra air themselves: it only stretches the scroll. */
const COMPACT = new Set(["orderForm", "offer", "faq", "comparison", "specs", "urgency"]);

/**
 * Vertical rhythm of a section. Statements breathe, working blocks stay compact, and the section
 * after a dense one gets more air (density alternates). A calm page breathes everywhere — unless
 * its archetype is already airy: its base section space is the generous one, and doubling it on
 * every block flattens the rhythm into one long, even scroll (≈ 20 phone screens for a prayer
 * abaya); there the alternation carries the calm.
 */
export function spacingFor(type: string, variant: string, prevType?: string, prevVariant?: string, mood?: ProductMood, density?: "airy" | "balanced" | "dense"): Spacing {
  if (STRIPS.has(type) || isFloating(type)) return "tight";
  if (AIRY.has(type) || AIRY.has(`${type}:${variant}`)) return "airy";
  if (COMPACT.has(type)) return "normal";
  const prevDense = prevType ? DENSE.has(prevType) || DENSE.has(`${prevType}:${prevVariant}`) : false;
  if (mood === "calm" && density !== "airy") return "airy";
  return prevDense ? "airy" : "normal";
}

/* ------------------------------------------------------------------ */
/* Whole plan                                                          */
/* ------------------------------------------------------------------ */

export interface PlanOptions {
  /** force a storyline (index into the templates) */
  templateIndex?: number;
  /** the theme's real section colors (see tones.ts); without them the rhythm is judged on names */
  tones?: Tones | null;
}

export function planSections(ctx: PlanContext, opts: PlanOptions = {}): PlannedSection[] {
  const types = fullOrder(ctx, chooseOrder(ctx, opts.templateIndex));
  const withVariants = calmBands(types.map((type) => ({ type, variant: chooseVariant(type, ctx) })), ctx);
  return finishPlan(withVariants, ctx.archetype, ctx.seed, opts.tones, { mood: ctx.mood });
}

/**
 * Backgrounds and spacing for an ordered list of (type, variant). Transitions stay "auto": the
 * renderer draws them from the live theme (only where the color really changes, only on flush
 * pages, never against a thin strip), so a later switch to panels or another palette stays right.
 */
export function finishPlan(
  items: readonly { type: string; variant: string }[],
  archetype: Archetype,
  seed: number,
  tones?: Tones | null,
  opts: BackgroundOptions = {},
): PlannedSection[] {
  const bgs = assignBackgrounds(items, archetype, seed, tones, opts);
  const density = ARCHETYPE_DEFS[archetype].density;
  return items.map((it, i) => ({
    type: it.type,
    variant: it.variant,
    bg: bgs[i]!,
    divider: "auto",
    spacing: spacingFor(it.type, it.variant, items[i - 1]?.type, items[i - 1]?.variant, opts.mood, density),
  }));
}

/** Canonical order of every in-flow type a storyline can hold (layout remix sorts by it). */
export function templateOrder(index: number): string[] {
  const template = TEMPLATES[((index % TEMPLATES.length) + TEMPLATES.length) % TEMPLATES.length]!;
  const expand: Record<string, readonly string[]> = {
    $visual: ["showcase", "gallery"],
    $proof: ["socialProof", "reviews"],
    $extra: ["story", "comparison", "specs"],
    $strip: template[1] === "$strip" ? ["marquee", "trustBar"] : ["marquee"],
  };
  return template.flatMap((slot) => expand[slot] ?? [slot]);
}

/** Movable in-flow types the layout remix may reorder (everything else keeps its place). */
export const LAYOUT_TYPES = new Set(TEMPLATES.flat().filter((t) => !t.startsWith("$")).concat(["showcase", "gallery", "reviews", "socialProof", "story", "comparison", "specs", "marquee"]));
export const TEMPLATE_COUNT = TEMPLATES.length;
