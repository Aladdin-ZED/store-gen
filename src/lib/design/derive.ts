/**
 * Back-derivation (P6 DESIGN; design.md DES-§4.7, DES-§4.2 "Back-derive" column, DS52, DES-R27; docs/STORE-SAAS.md
 * §K.2 P0 design stubs, R2): the genome of an existing document, pure and total (never throws). Frozen at P0
 * (src/lib/contracts/r1-p0.ts); the doc type is widened to `PageDoc | StorePageDoc` at the R2 contract step (done in C2-B1,
 * through the contract step's CCR: a store document is read through `storeDocShell` with the store look and market
 * the caller passes, src/lib/contracts/r2-contract.ts).
 *
 *  - With `doc.theme.look` the look's genes are read back exactly; G1, G4, G9 come from the spec; sections from
 *    `doc.sections`; the copy genes from the library tags (`noun-phrase` until the copy step tags them).
 *  - Without look: the archetype defaults of the Back-derive column and the hero-variant map (G2, G18), G9 from the
 *    palette (`deriveStrategy`). `archetypeGenes` is the same reading for an archetype alone: the sampler's fallback.
 *
 * The consistency the DG-02 acceptance asks for (`buildTheme(compileGenome(genomeOf(doc)).theme)` emits the attributes
 * `buildTheme(doc.theme)` emits today, outside the `[data-look]`-scoped ones) holds by construction: every attribute
 * the look replaces (button, card, mask, glyph, emphasis, density, radius kind) is read from the archetype here.
 */
import { ARCHETYPES, type Archetype, type Locale, type Market, type PageDoc, type SectionInstance, type ThemeLook, type ThemeSpec } from "@/lib/page/schema";
import type { StorePageDoc } from "@/storefront/schema";
import { ARCHETYPE_DEFS, EASE, findPairing, type ArchetypeDef } from "@/lib/theme/archetypes";
import { accentRole } from "@/lib/theme/fonts";
import { COLOR_PLANS } from "@/lib/theme/palette";
import { ASPECTS, FIXED_TYPES, VOICE_REGISTERS } from "./consts";

export { FIXED_TYPES } from "./consts";
import type { Aspect, BrandGenes, ColorStrategy, DesignGenome, Grammar, Opener, PageGenes, SectionGene, Treatment, VoiceRegister } from "./genome";
import { loadCatalogue, type Pairing } from "./pairings";
import type { PhotoFacts } from "./photo-facts";
import { G28_PRIORS, PRIORS_VERSION } from "./priors";
import { GENE_PARTS, snap } from "./vocab";

/** Section types whose header carries no title, so no headline structure (G29). */
const UNTITLED_TYPES: ReadonlySet<string> = new Set(["trustBar", "marquee", "urgency", "stats"]);
/** Section types that carry a primary call to action today (G34 back-derive: "every section with a button"). */
const CTA_TYPES: ReadonlySet<string> = new Set(["hero", "offer", "cta", "orderForm"]);
const STRONG_BGS: ReadonlySet<string> = new Set(["accent", "dark", "pop"]);

/** The visible in-flow sections, in page order. */
export const inFlowSections = <T extends Pick<SectionInstance, "type"> & { hidden?: boolean }>(sections: readonly T[]) =>
  sections.filter((s) => !s.hidden && !FIXED_TYPES.has(s.type));

/** The primary photo has alpha, real or estimated (H13, H27 (a)). */
export const hasAlpha = (photos: PhotoFacts | undefined) => !!photos && (photos.hasCutout === true || photos.hasCutout === "estimated");

/* ------------------------------------------------------------------ */
/* the Back-derive column                                              */
/* ------------------------------------------------------------------ */

/** Hero variant → (G2, G18) (DES-§4.7); `alpha` decides the stage / poster / spec treatments. */
export function heroGenes(variant: string, alpha: boolean): { G2: Grammar; G18: Treatment } {
  const stage: Treatment = alpha ? "cutout-stage" : "framed-stage";
  switch (variant) {
    case "stage":
      return { G2: "stage", G18: stage };
    case "editorial":
      return { G2: "editorial-column", G18: "framed" };
    case "poster":
      return { G2: "poster", G18: stage };
    case "scrapbook":
      return { G2: "gallery-led", G18: "grid-contact" };
    case "spec":
      return { G2: "specimen", G18: stage };
    case "split":
      return { G2: "split-tension", G18: "framed" };
    case "cinema":
      return { G2: "cinematic", G18: "full-bleed-crop" };
    case "quiet":
      return { G2: "quiet-luxe", G18: "framed" };
    case "index":
      return { G2: "catalogue", G18: "framed" };
    case "contact":
      return { G2: "gallery-led", G18: "grid-contact" };
    case "statement":
      return { G2: "quiet-luxe", G18: "framed" };
    default:
      return { G2: "editorial-column", G18: "framed" };
  }
}

/**
 * G9 from the palette (DES-§4.7): base dark + mono-luxe / ink-accent → dark-luxe; other dark → mono+signal;
 * ink-accent → ink+one; cool-precise → mono+signal; pop-complement / contrast-neon → color-field with ≥ 2
 * strong-ground sections, else duotone; clay-sage / earth-triad / mono-luxe on tinted → tonal; blush-berry /
 * warm-butter on light → high-key. The rows the table leaves open take the strategy whose plan carries the harmony,
 * and the result always allows the page's base (COLOR_PLANS bases), so the label never lies about the ground.
 */
export function deriveStrategy(palette: Pick<ThemeSpec["palette"], "base" | "harmony">, strongSections = 0): ColorStrategy {
  const { base, harmony } = palette;
  const pick = (s: ColorStrategy): ColorStrategy => {
    if (COLOR_PLANS[s].bases.includes(base)) return s;
    // the nearest strategy that allows the base and keeps the harmony, else any that allows the base
    const keep = (Object.keys(COLOR_PLANS) as ColorStrategy[]).find((k) => COLOR_PLANS[k].bases.includes(base) && COLOR_PLANS[k].harmonies.includes(harmony));
    return keep ?? (base === "dark" ? "mono+signal" : base === "tinted" ? "tonal" : "ink+one");
  };
  if (base === "dark") return harmony === "mono-luxe" || harmony === "ink-accent" ? "dark-luxe" : "mono+signal";
  switch (harmony) {
    case "ink-accent":
      return pick("ink+one");
    case "cool-precise":
      return pick("mono+signal");
    case "pop-complement":
    case "contrast-neon":
      return pick(strongSections >= 2 ? "color-field" : "duotone");
    case "clay-sage":
    case "earth-triad":
      return pick(base === "tinted" ? "tonal" : "duotone");
    case "mono-luxe":
      return pick(base === "tinted" ? "tonal" : "ink+one");
    case "blush-berry":
      return pick(base === "light" ? "high-key" : "duotone");
    case "warm-butter":
      return pick(base === "light" ? "high-key" : "duotone");
  }
}

/** G10 back-derive: the middle of the strategy's band (H21). */
export const areaMid = (s: ColorStrategy) => Math.round(((COLOR_PLANS[s].area[0] + COLOR_PLANS[s].area[1]) / 2) * 100) / 100;

/** G12 from a radius kind: none / subtle → crisp, soft → soft, round → round. */
export const ladderOfRadius = (kind: string): BrandGenes["G12"] => (kind === "soft" ? "soft" : kind === "round" ? "round" : "crisp");

/** G15 from the card style (and a deep shadow on raised cards): the inverse of the compile's card map (DES-§4.5.2). */
export function depthOf(card: ArchetypeDef["card"], shadow: string): BrandGenes["G15"] {
  switch (card) {
    case "flat":
      return "flat";
    case "outlined":
      return "hairline";
    case "raised":
      return shadow === "deep" ? "directional" : "ambient";
    // glass is a budget (G16), never a card tier (K5): the frosted card reads as a tonal surface
    case "soft":
    case "glass":
      return "tonal";
  }
}

/** G6.tk from the archetype's display tracking (−tk × log2(96 / 16) em at the back-derived 96 px display). */
export const tkOf = (tracking: number) => snap(Math.max(0, -tracking) / Math.log2(96 / 16), GENE_PARTS.G6!.tk!.range!);

/** G7.lb: a mono accent sets the labels in mono, uppercase labels read as small caps, else plain. */
export const labelsOf = (d: ArchetypeDef, accent: string | undefined): BrandGenes["G7"]["lb"] =>
  accent && accentRole(accent) === "mono" ? "mono" : d.labels.case === "uppercase" ? "smallcaps" : "plain";

/** G23 from the archetype's motion: the entrance curve's family, its middle duration and stagger. */
export function motionOf(d: ArchetypeDef): BrandGenes["G23"] {
  const f: BrandGenes["G23"]["f"] =
    d.motion.ease === EASE.editorial ? "mask" : d.motion.easeOut === EASE.expoOut ? "expo" : d.motion.easeOut === EASE.quintOut ? "quint" : d.motion.easeOut === EASE.quartOut ? "quart" : "critical";
  return { f, d: Math.min(900, Math.max(180, Math.round(d.motion.dur[1]))), r: [f === "mask" ? "mask-wipe" : "fade-rise"], st: Math.min(80, Math.max(30, Math.round(d.motion.stagger))), sc: false };
}

/** The top prior register of an archetype (G28 back-derive). */
export function topRegister(a: Archetype): VoiceRegister {
  const p = G28_PRIORS[a];
  return [...VOICE_REGISTERS].sort((x, y) => (p[y] ?? 0) - (p[x] ?? 0))[0]!;
}

/** G30 per register (DES-§9.10): the middle of its mean-words band and whether an exclamation is allowed. */
export const RHYTHM: Readonly<Record<VoiceRegister, { mw: readonly [number, number]; ex: 0 | 1 }>> = {
  plain: { mw: [7, 9], ex: 0 },
  warm: { mw: [9, 12], ex: 1 },
  precise: { mw: [6, 9], ex: 0 },
  bold: { mw: [5, 7], ex: 1 },
  "poetic-restrained": { mw: [8, 12], ex: 0 },
};

/** G31 back-derive: Darija in the buttons for Moroccan Arabic pages, else none (the owner's `store_ai` choice wins). */
export const darijaDefault = (market: Market, locale: Locale): BrandGenes["G31"] => (market === "MA" && locale === "ar" ? "cta" : "none");

/** The catalogue pairing whose four faces a theme uses, else the archetype's legacy row by display and body, else "custom". */
export function pairingOf(theme: Pick<ThemeSpec, "archetype" | "fonts">): { id: string; pairing: Pairing | null; displayWeight: number; displayWeightAr: number } {
  const f = theme.fonts;
  const cat = loadCatalogue();
  const exact = cat.pairings.find((p) => p.display === f.display && p.body === f.body && p.displayAr === f.displayAr && p.bodyAr === f.bodyAr);
  if (exact) return { id: exact.id, pairing: exact, displayWeight: exact.displayWeight, displayWeightAr: exact.displayWeightAr };
  const legacy = findPairing(ARCHETYPE_DEFS[theme.archetype], f.display, f.body);
  if (legacy) return { id: legacy.id, pairing: cat.byId.get(legacy.id) ?? null, displayWeight: legacy.displayWeight, displayWeightAr: legacy.displayWeightAr };
  const any = ARCHETYPE_DEFS[theme.archetype].fonts[0]!;
  return { id: "custom", pairing: null, displayWeight: any.displayWeight, displayWeightAr: any.displayWeightAr };
}

/** The brand and page genes an archetype implies before any sampling (the Back-derive column of DES-§4.2). */
export function archetypeGenes(
  archetype: Archetype,
  ctx: { market: Market; locale: Locale; pairing?: { id: string; displayWeight: number; displayWeightAr: number; accent?: string }; alpha?: boolean; strategy?: ColorStrategy; heroVariant?: string },
): { brand: BrandGenes; page: PageGenes } {
  const d = ARCHETYPE_DEFS[archetype];
  const p0 = ctx.pairing ?? (() => {
    const own = loadCatalogue().pairings.find((p) => p.archetype === archetype) ?? null;
    const legacy = d.fonts[0]!;
    return own ? { id: own.id, displayWeight: own.displayWeight, displayWeightAr: own.displayWeightAr, accent: own.accent } : { id: legacy.id, displayWeight: legacy.displayWeight, displayWeightAr: legacy.displayWeightAr, accent: legacy.accent };
  })();
  const register = topRegister(archetype);
  const motion = motionOf(d);
  const strategy = ctx.strategy ?? deriveStrategy({ base: "light", harmony: d.harmony });
  const hero = heroGenes(ctx.heroVariant ?? d.preferredVariants.hero[0] ?? "editorial", !!ctx.alpha);
  const rd = GENE_PARTS.G5!;
  const brand: BrandGenes = {
    G1: archetype,
    G4: p0.id,
    G5: { rm: snap(d.typeRatio[0], rd.rm!.range!), rd: snap(d.typeRatio[1], rd.rd!.range!), dmax: 96 },
    G6: { w: Math.min(900, Math.max(100, p0.displayWeight)), wAr: Math.min(900, Math.max(100, p0.displayWeightAr)), tk: tkOf(d.display.tracking) },
    G7: { dc: d.display.case, lb: labelsOf(d, p0.accent) },
    G8: "lining",
    G9: strategy,
    G11: "standard",
    G12: ladderOfRadius(d.radius.kind),
    G13: "circle",
    G14: { w: d.borderWidth <= 0 ? 0 : d.borderWidth >= 1.5 ? 1.5 : 1, s: snap(d.lineStrength, GENE_PARTS.G14!.s!.range!) },
    G15: depthOf(d.card, d.shadow),
    G17: d.mask,
    G23: motion,
    G25: { gl: d.glyph, nb: "none", cap: "plain" },
    G26: d.emphasis,
    G27: d.button,
    G28: register,
    G30: { mw: 9, ex: 1 },
    G31: darijaDefault(ctx.market, ctx.locale),
  };
  const page: PageGenes = {
    G2: hero.G2,
    G3: { c: 12, s: "1:1", m: "wide", w: Math.min(1440, Math.max(1080, d.container)), u: 8 },
    G10: areaMid(strategy),
    G16: d.card === "glass" ? 2 : 0,
    G18: hero.G18,
    G20: { l: d.density, p: "ABAC" },
    G21: 1,
    G22: "mixed",
    G24: { seq: [], moments: [], cross: null, signature: 0 },
    G32: { budget: 0, openers: [] },
    G33: { max: 3, uses: {} },
    G34: { primary: [], headerHidesInHero: true, floatCollapses: true },
    G35: { scope: "heads", kinds: motion.r, nodes: 0 },
    angle: "benefit",
  };
  return { brand, page };
}

/* ------------------------------------------------------------------ */
/* genomeOf                                                            */
/* ------------------------------------------------------------------ */

/** The opener a section declares (`data.opener`, DES-§5.8), else today's kicker. */
const openerOf = (s: SectionInstance): Opener => {
  const o = s.data.opener;
  return o === "bare" || o === "caption" || o === "number" || o === "quote" || o === "image" || o === "kicker" ? o : "kicker";
};

function sectionGenes(doc: PageDoc): SectionGene[] {
  return doc.sections.slice(0, 40).map((s) => {
    const g: SectionGene = { id: s.id.slice(0, 64), type: s.type, variant: s.variant };
    if (!FIXED_TYPES.has(s.type) && !UNTITLED_TYPES.has(s.type)) g.G29 = "noun-phrase";
    const ratio = s.data.ratio;
    if (typeof ratio === "string" && (ASPECTS as readonly string[]).includes(ratio)) g.G19 = { a: ratio as Aspect, f: "center" };
    const arrange = s.data.arrange;
    if (typeof arrange === "string" && /^[a-z0-9:(),.-]{1,32}$/.test(arrange)) g.arrange = arrange;
    return g;
  });
}

/** The rhythm genes a document shows (DES-§4.2 Back-derive: kickers everywhere, a CTA on every button section). */
function rhythmOf(doc: PageDoc): Pick<PageGenes, "G24" | "G32" | "G34"> {
  const flow = inFlowSections(doc.sections);
  const seq = flow.map((s) => `${s.type}:${s.variant}`).slice(0, 40);
  const moments = flow.flatMap((s, i) => (STRONG_BGS.has(s.bg) ? [i] : [])).slice(0, 40);
  const openers = flow.filter((s) => s.type !== "hero").map(openerOf).slice(0, 40);
  const primary = flow.filter((s) => CTA_TYPES.has(s.type) && s.data.cta !== false).map((s) => s.id.slice(0, 64));
  const sticky = doc.sections.some((s) => !s.hidden && s.type === "stickyCta");
  const list = [...primary.slice(0, sticky ? 5 : 6), ...(sticky ? ["sticky"] : [])];
  return {
    G24: { seq, moments, cross: null, signature: 0 },
    G32: { budget: Math.min(14, Math.ceil(Math.max(0, flow.length - 1) / 3)), openers },
    G34: { primary: list, headerHidesInHero: true, floatCollapses: !doc.sections.some((s) => !s.hidden && s.type === "whatsappFloat") || sticky },
  };
}

function readGenome(doc: PageDoc, opts?: { photos?: PhotoFacts }): DesignGenome {
  const theme = doc.theme;
  const look = theme.look;
  const alpha = hasAlpha(opts?.photos);
  const pairing = pairingOf(theme);
  const hero = doc.sections.find((s) => s.type === "hero" && !s.hidden);
  const strong = inFlowSections(doc.sections).filter((s) => STRONG_BGS.has(s.bg)).length;
  const strategy = look ? look.cs : deriveStrategy(theme.palette, strong);
  const base = archetypeGenes(theme.archetype, {
    market: doc.market,
    locale: doc.locale,
    pairing: { ...pairing, accent: theme.fonts.accent },
    alpha,
    strategy,
    heroVariant: hero?.variant,
  });
  const brand: BrandGenes = { ...base.brand };
  const page: PageGenes = { ...base.page, ...rhythmOf(doc) };
  // a builder radius override is the ladder the page shows
  if (theme.radius !== "archetype") brand.G12 = ladderOfRadius(theme.radius);
  if (look) {
    Object.assign(brand, {
      G5: { rm: look.type.rm, rd: look.type.rd, dmax: look.type.dmax },
      G6: { w: look.type.w, wAr: look.type.wAr, tk: look.type.tk },
      G7: { dc: look.type.dc, lb: look.type.lb },
      G8: look.type.nu,
      G9: look.cs,
      G11: look.hc ? "high" : "standard",
      G12: look.ladder,
      G13: look.corner,
      G14: { w: look.hair.w, s: look.hair.s },
      G15: look.depth,
      G17: look.mask,
      G23: { f: look.mo.f, d: look.mo.d, r: [...look.mo.r], st: look.mo.st, sc: look.mo.sc },
      G25: { gl: look.kit.gl, nb: look.kit.nb, cap: look.kit.cap },
      G26: look.em,
      G27: look.btn,
    } satisfies Partial<BrandGenes>);
    Object.assign(page, {
      G2: look.g,
      G3: { ...look.grid },
      G10: look.area,
      G16: look.glass,
      G18: look.img,
      G20: { l: look.dens, p: page.G20.p },
      G21: look.space,
      G22: look.align,
      G35: { scope: look.mo.scope, kinds: [...look.mo.r], nodes: page.G35.nodes },
    } satisfies Partial<PageGenes>);
  } else {
    page.G35 = { ...page.G35, kinds: brand.G23.r };
  }
  const why: string[] = look ? [] : ["derived"];
  return { v: 1, seed: theme.seed, priorsV: PRIORS_VERSION, brand, page, sections: sectionGenes(doc), why };
}

/**
 * A store template (STO-§6.2: sections and locale, no theme, product, items, offers or form) as the genome reader's
 * document: its sections and locale, the store's market and the store theme's look (DES-§8.13; the caller resolves
 * both from the store, the document carries neither). Pure.
 */
export function storeDocShell(doc: StorePageDoc, look: ThemeLook | null, market: Market): PageDoc {
  return {
    v: 2,
    locale: doc.locale,
    market,
    currency: "MAD",
    sections: doc.sections,
    theme: { archetype: "editorial", seed: 0, palette: { accent: "#2f4f4f", pop: "#8fbcbc", base: "light", harmony: "ink-accent" }, fonts: { display: "fraunces", body: "inter", displayAr: "readex-pro", bodyAr: "readex-pro" }, ...(look ? { look } : {}) },
  } as unknown as PageDoc;
}

/**
 * The genome of an existing document (DES-§4.7): pure and total, never throws (a reading that fails is the archetype's).
 * R2 (DES-§8.13): a `StorePageDoc` is read through `storeDocShell` with `opts.look` (the store theme's) and
 * `opts.market` (the store's; "INTL" when absent); both options are ignored for a `PageDoc`.
 */
export function genomeOf(doc: PageDoc | StorePageDoc, opts?: { photos?: PhotoFacts; look?: ThemeLook | null; market?: Market }): DesignGenome {
  if (typeof (doc as { kind?: unknown })?.kind === "string") return genomeOf(storeDocShell(doc as StorePageDoc, opts?.look ?? null, opts?.market ?? "INTL"), opts?.photos ? { photos: opts.photos } : undefined);
  return landingGenomeOf(doc as PageDoc, opts);
}

function landingGenomeOf(doc: PageDoc, opts?: { photos?: PhotoFacts }): DesignGenome {
  try {
    return readGenome(doc, opts);
  } catch {
    const archetype = (ARCHETYPES as readonly string[]).includes(doc?.theme?.archetype) ? doc.theme.archetype : "editorial";
    const { brand, page } = archetypeGenes(archetype, { market: doc?.market ?? "INTL", locale: doc?.locale ?? "fr" });
    const seed = Number.isInteger(doc?.theme?.seed) ? doc.theme.seed : 0;
    return { v: 1, seed, priorsV: PRIORS_VERSION, brand, page, sections: [], why: ["derived", "fallback"] };
  }
}
