/**
 * Compile a genome to a ThemeSpec with `look`, the planner's directives and the copy directives (P6 DESIGN; design.md
 * DES-§4.4 "G9 → palette", DES-§4.5, DES-§5.4, DES-§9.5, DES-§9.10, DES-§12.3, DS2, DS4; H24, H25, H27, H34). Pure.
 *
 *  - The palette: the strategy's plan over the product palette the theme engine read (`productTheme`), through
 *    `planPalette` (the strategy's harmonies, the archetype's own when it is in the set; the H25 pop; the H34 sand +
 *    signal path) with the brand's locked roles kept (DES-§12.3), the base decided by the strategy and the photo (H27),
 *    a calm product's limits, then today's no-orange repair (H24); a locked colour the repair would have to move fails
 *    the candidate (GenomeError, the wizard resamples).
 *  - The look: the render-relevant genes, ≤ 700 B of JSON (DS2). An estimated cutout renders as `framed-stage` until the
 *    real mask lands (DES-§4.11: the genome says what the design is, the doc what is rendered).
 *  - A genome that is a reading of an existing theme (`ctx.derived`, genomeOf) keeps that theme's palette and builder
 *    fields, so `compileGenome(genomeOf(doc))` re-emits today's attributes (the DG-02 consistency).
 */
import { ThemeSpec, ThemeLook, type Locale, type SectionBg } from "@/lib/page/schema";
import type { ProductMood } from "@/lib/generator/mood";
import { deriveSeed, rngFor } from "@/lib/generator/rng";
import { calmTheme, withoutOrange } from "@/lib/generator/theme";
import { ARCHETYPE_DEFS, type BaseMood, type ThemeSectionType } from "@/lib/theme/archetypes";
import { COLOR_PLANS, planPalette } from "@/lib/theme/palette";
import type { BrandSetting } from "@/lib/settings/keys/brand";
import { FIXED_TYPES, hasAlpha } from "./derive";
import { GenomeError, type Angle, type Aspect, type BoldGene, type BrandGenes, type DesignGenome, type Grammar, type HeadlineStructure, type PageGenes, type Treatment, type VoiceRegister } from "./genome";
import { loadCatalogue } from "./pairings";
import type { PhotoFacts } from "./photo-facts";

/** The look's JSON budget (DS2, `theme:check` asserts it over sampled genomes). */
export const LOOK_MAX_BYTES = 700;

export interface WeightedVariant {
  variant: string;
  weight: number;
}

export interface PlanDirectives {
  grammar: Grammar;
  heroPool: WeightedVariant[];
  pools: Partial<Record<ThemeSectionType, WeightedVariant[]>>;
  colorMoments: number;
  glass: 0 | 1 | 2;
  density: PageGenes["G20"];
  align: PageGenes["G22"];
  treatment: Treatment;
  aspects: Partial<Record<string, Aspect>>;
  choreographySeed: number;
}

export interface CopyDirectives {
  register: VoiceRegister;
  structures: Partial<Record<HeadlineStructure, number>>;
  angle: Angle;
  darija: BrandGenes["G31"];
  meanWords: number;
  exclaim: 0 | 1;
  /** the sections whose opener is a kicker (G32): the copy step drops the kicker string elsewhere (DES-§5.8) */
  kickers: Set<string>;
}

export interface Compiled {
  theme: ThemeSpec;
  plan: PlanDirectives;
  copy: CopyDirectives;
}

export interface CompileCtx {
  /**
   * The product theme (`productTheme({ …, archetype: genome.brand.G1 })`): its palette is the input of G9 → palette,
   * its seed, motion, dividers and ornament are kept; its builder fields are reset to the archetype so the look decides
   * (DS4), unless `derived`.
   */
  theme: ThemeSpec;
  locale: Locale;
  mood?: ProductMood;
  brand?: BrandSetting | null;
  photos?: PhotoFacts;
  /** the genome is a reading of `theme` (genomeOf): keep its palette and builder fields verbatim */
  derived?: boolean;
  /** the design_genomes id (`look.gid`) */
  gid?: string;
  /** "Lock for this page" (`look.locks`, DES-§15.4) */
  locks?: readonly BoldGene[];
  /** the page has merchant figures (`number-led` headlines allowed, DES-§9.5) */
  numbers?: boolean;
}

/* ------------------------------------------------------------------ */
/* the grammar pools (DES-§5.4)                                        */
/* ------------------------------------------------------------------ */

type Pools = { hero: [string, number][] } & Partial<Record<ThemeSectionType, [string, number][]>>;
const POOLS: Readonly<Record<Grammar, Pools>> = {
  "editorial-column": {
    hero: [["editorial", 0.45], ["split", 0.3], ["statement", 0.25]],
    benefits: [["zigzag", 0.35], ["numbered", 0.25], ["hanging", 0.25], ["stack", 0.15]],
    gallery: [["lookbook", 0.4], ["filmstrip", 0.3], ["contact", 0.3]],
    showcase: [["ingredients", 0.4], ["figure", 0.3]],
    steps: [["timeline", 0.5], ["strip", 0.5]],
    story: [["letter", 0.4], ["image-text", 0.4], ["manifesto", 0.2]],
    orderForm: [["split", 0.5], ["minimal", 0.5]],
    faq: [["two-col", 0.6], ["accordion", 0.4]],
    trustBar: [["ledger", 0.6], ["chips", 0.4]],
  },
  poster: {
    hero: [["poster", 0.7], ["statement", 0.2], ["split", 0.1]],
    benefits: [["bento", 0.35], ["stack", 0.35], ["zigzag", 0.3]],
    gallery: [["carousel", 0.6], ["contact", 0.4]],
    showcase: [["hotspots", 0.5]],
    steps: [["cards", 0.6], ["strip", 0.4]],
    story: [["manifesto", 0.7], ["image-text", 0.3]],
    orderForm: [["bold", 0.7], ["card", 0.3]],
    faq: [["accordion", 0.7], ["two-col", 0.3]],
    trustBar: [["ribbon", 0.5], ["chips", 0.5]],
  },
  "gallery-led": {
    hero: [["contact", 0.5], ["split", 0.3], ["cinema", 0.2]],
    benefits: [["stack", 0.5], ["zigzag", 0.5]],
    gallery: [["masonry", 0.4], ["contact", 0.3], ["lookbook", 0.3]],
    showcase: [["exploded", 0.3], ["figure", 0.4]],
    steps: [["illustrated", 0.5], ["strip", 0.5]],
    story: [["image-text", 0.7], ["letter", 0.3]],
    orderForm: [["card", 0.5], ["split", 0.5]],
    faq: [["accordion", 0.6], ["two-col", 0.4]],
    trustBar: [["chips", 0.7], ["ledger", 0.3]],
  },
  stage: {
    hero: [["stage", 0.75], ["spec", 0.25]],
    benefits: [["numbered", 0.4], ["hanging", 0.3], ["bento", 0.3]],
    gallery: [["carousel", 0.5]],
    showcase: [["hotspots", 0.5], ["exploded", 0.5]],
    steps: [["cards", 0.5], ["timeline", 0.5]],
    story: [["image-text", 0.6], ["letter", 0.4]],
    orderForm: [["card", 0.6], ["bold", 0.4]],
    faq: [["accordion", 0.6], ["two-col", 0.4]],
    trustBar: [["chips", 0.6], ["ribbon", 0.4]],
  },
  specimen: {
    hero: [["spec", 0.55], ["index", 0.45]],
    benefits: [["numbered", 0.6], ["stack", 0.4]],
    gallery: [["filmstrip", 0.5]],
    showcase: [["dimensions", 0.5], ["exploded", 0.5]],
    steps: [["timeline", 0.6], ["strip", 0.4]],
    story: [["manifesto", 0.5], ["letter", 0.5]],
    orderForm: [["minimal", 0.6], ["split", 0.4]],
    faq: [["two-col", 0.7], ["accordion", 0.3]],
    trustBar: [["ledger", 0.8], ["chips", 0.2]],
  },
  catalogue: {
    hero: [["index", 0.65], ["split", 0.35]],
    benefits: [["stack", 0.5], ["numbered", 0.5]],
    gallery: [["masonry", 0.6], ["filmstrip", 0.4]],
    showcase: [["dimensions", 0.6], ["figure", 0.4]],
    steps: [["strip", 0.7], ["timeline", 0.3]],
    story: [["letter", 0.6], ["image-text", 0.4]],
    orderForm: [["minimal", 0.7], ["card", 0.3]],
    faq: [["two-col", 0.6], ["accordion", 0.4]],
    trustBar: [["ledger", 0.7], ["chips", 0.3]],
  },
  "split-tension": {
    hero: [["split", 0.65], ["editorial", 0.2], ["statement", 0.15]],
    benefits: [["zigzag", 0.6], ["bento", 0.4]],
    gallery: [["lookbook", 0.4], ["carousel", 0.6]],
    showcase: [["hotspots", 0.5], ["ingredients", 0.5]],
    steps: [["timeline", 0.5], ["cards", 0.5]],
    story: [["image-text", 0.7], ["manifesto", 0.3]],
    orderForm: [["split", 0.7], ["card", 0.3]],
    faq: [["accordion", 0.5], ["two-col", 0.5]],
    trustBar: [["chips", 0.5], ["ledger", 0.5]],
  },
  cinematic: {
    hero: [["cinema", 0.8], ["split", 0.2]],
    benefits: [["stack", 0.6], ["zigzag", 0.4]],
    gallery: [["filmstrip", 0.6], ["lookbook", 0.4]],
    showcase: [["exploded", 0.5], ["figure", 0.5]],
    steps: [["strip", 0.6], ["timeline", 0.4]],
    story: [["image-text", 0.5], ["manifesto", 0.5]],
    orderForm: [["split", 0.6], ["bold", 0.4]],
    faq: [["accordion", 0.7], ["two-col", 0.3]],
    trustBar: [["ribbon", 0.5], ["chips", 0.5]],
  },
  "quiet-luxe": {
    hero: [["quiet", 0.6], ["statement", 0.25], ["editorial", 0.15]],
    benefits: [["stack", 0.6], ["hanging", 0.4]],
    gallery: [["lookbook", 0.7], ["filmstrip", 0.3]],
    showcase: [["ingredients", 0.6], ["figure", 0.4]],
    steps: [["timeline", 0.7], ["strip", 0.3]],
    story: [["letter", 0.7], ["manifesto", 0.3]],
    orderForm: [["minimal", 0.8], ["split", 0.2]],
    faq: [["two-col", 0.6], ["accordion", 0.4]],
    trustBar: [["ledger", 0.8], ["chips", 0.2]],
  },
};

/** The grammar's pools as weighted variants (the choreography step filters them by the registry and the archetype). */
export function grammarPools(g: Grammar): { hero: WeightedVariant[]; pools: Partial<Record<ThemeSectionType, WeightedVariant[]>> } {
  const { hero, ...rest } = POOLS[g];
  const wv = (list: [string, number][]) => list.map(([variant, weight]) => ({ variant, weight }));
  const pools: Partial<Record<ThemeSectionType, WeightedVariant[]>> = {};
  for (const [type, list] of Object.entries(rest) as [ThemeSectionType, [string, number][]][]) pools[type] = wv(list);
  return { hero: wv(hero), pools };
}

/* ------------------------------------------------------------------ */
/* copy (DES-§9.5, DES-§9.10)                                          */
/* ------------------------------------------------------------------ */

/** Title structure weights per register (DES-§9.5); `number-led` only with merchant numbers. */
export const STRUCTURE_WEIGHTS: Readonly<Record<VoiceRegister, Partial<Record<HeadlineStructure, number>>>> = {
  plain: { "noun-phrase": 0.35, "word-subline": 0.25, imperative: 0.2, "contrast-pair": 0.2 },
  warm: { imperative: 0.3, "noun-phrase": 0.25, question: 0.15, "quote-led": 0.15, "contrast-pair": 0.15 },
  precise: { "noun-phrase": 0.35, "number-led": 0.25, "contrast-pair": 0.25, "word-subline": 0.15 },
  bold: { imperative: 0.4, "word-subline": 0.3, "contrast-pair": 0.3 },
  "poetic-restrained": { "word-subline": 0.35, "noun-phrase": 0.3, "contrast-pair": 0.2, "quote-led": 0.15 },
};

function structuresFor(register: VoiceRegister, numbers: boolean): Partial<Record<HeadlineStructure, number>> {
  const w = { ...STRUCTURE_WEIGHTS[register] };
  if (!numbers) delete w["number-led"];
  const total = Object.values(w).reduce((s, v) => s + v, 0);
  const out: Partial<Record<HeadlineStructure, number>> = {};
  for (const [k, v] of Object.entries(w) as [HeadlineStructure, number][]) out[k] = Math.round((v / total) * 1000) / 1000;
  return out;
}

/** The sections whose G32 opener is a kicker (the openers follow the in-flow sections after the hero). */
function kickerSections(g: DesignGenome): Set<string> {
  const flow = g.sections.filter((s) => !FIXED_TYPES.has(s.type) && s.type !== "hero");
  const out = new Set<string>();
  g.page.G32.openers.forEach((o, i) => {
    const s = flow[i];
    if (o === "kicker" && s) out.add(s.id);
  });
  const hero = g.sections.find((s) => s.type === "hero");
  if (hero && g.page.G32.openers.length) out.add(hero.id); // the hero keeps its own kicker (DES-§8.6 V30)
  return out;
}

/* ------------------------------------------------------------------ */
/* palette (DES-§4.4 "G9 → palette", H27, DES-§12.3)                   */
/* ------------------------------------------------------------------ */

/** The page base of a strategy for the product (H27): dark only for dark-luxe, or mono+signal on a photo that allows it. */
export function baseFor(g: DesignGenome, want: BaseMood, photos: PhotoFacts | undefined): BaseMood {
  const plan = COLOR_PLANS[g.brand.G9];
  const t = g.page.G18;
  const darkOk = hasAlpha(photos) || (!!photos && photos.count > 0 && photos.background.luminance <= 0.35) || t === "framed" || t === "framed-stage" || t === "tight-detail";
  if (g.brand.G9 === "dark-luxe") return "dark";
  if (g.brand.G9 === "mono+signal") return want === "dark" && darkOk ? "dark" : "light";
  return plan.bases.includes(want) ? want : plan.bases[0]!;
}

function paletteOf(g: DesignGenome, ctx: CompileCtx): ThemeSpec["palette"] {
  const src = ctx.theme.palette;
  if (ctx.derived) return src;
  const colors = ctx.brand?.colors;
  const locked = new Set(colors?.locks ?? []);
  const wantBase = locked.has("base") && colors?.base ? colors.base : src.base;
  const base = baseFor(g, wantBase, ctx.photos);
  const archHarmony = ARCHETYPE_DEFS[g.brand.G1].harmony;
  const plan = COLOR_PLANS[g.brand.G9];
  // the archetype's own harmony wins when it is in the strategy's set (DES-§4.4)
  const harmony = plan.harmonies.includes(archHarmony) ? archHarmony : src.harmony;
  const accent = locked.has("accent") && colors?.accent ? colors.accent : src.accent;
  const neutralHue = locked.has("neutral") && colors?.neutralHue !== null && colors?.neutralHue !== undefined ? colors.neutralHue : src.neutralHue;
  const u = rngFor(g.seed, "compile:pop")();
  const planned = planPalette({ accent, base, harmony, ...(neutralHue === undefined ? {} : { neutralHue }) }, g.brand.G9, { archetype: g.brand.G1, u });
  return {
    accent: locked.has("accent") && colors?.accent ? colors.accent : planned.accent,
    pop: locked.has("pop") && colors?.pop ? colors.pop : planned.pop,
    ...(planned.neutralHue === undefined ? {} : { neutralHue: locked.has("neutral") && neutralHue !== undefined ? neutralHue : planned.neutralHue }),
    base: planned.base,
    harmony: planned.harmony,
  };
}

/* ------------------------------------------------------------------ */
/* the look and the theme                                              */
/* ------------------------------------------------------------------ */

/** The render-relevant genes as `ThemeSpec.look` (DES-§4.5.1). */
export function compileLook(g: DesignGenome, ctx: Pick<CompileCtx, "photos" | "gid" | "locks">): ThemeLook {
  const b = g.brand;
  const p = g.page;
  // an estimated cutout renders framed on its plinth until the real mask exists (DES-§4.11)
  const img: Treatment = p.G18 === "cutout-stage" && ctx.photos?.hasCutout === "estimated" ? "framed-stage" : p.G18;
  const look: ThemeLook = {
    v: 1,
    g: p.G2,
    grid: { c: p.G3.c, s: p.G3.s, m: p.G3.m, w: Math.round(p.G3.w), u: p.G3.u },
    type: { rm: b.G5.rm, rd: b.G5.rd, dmax: Math.round(b.G5.dmax), w: Math.round(b.G6.w), wAr: Math.round(b.G6.wAr), tk: b.G6.tk, dc: b.G7.dc, lb: b.G7.lb, nu: b.G8 },
    cs: b.G9,
    area: p.G10,
    hc: b.G11 === "high",
    ladder: b.G12,
    corner: b.G13,
    hair: { w: b.G14.w, s: b.G14.s },
    depth: b.G15,
    glass: p.G16,
    mask: b.G17,
    img,
    dens: p.G20.l,
    space: p.G21,
    align: p.G22,
    mo: { f: b.G23.f, d: Math.round(b.G23.d), r: [...b.G23.r], st: Math.round(b.G23.st), sc: b.G23.sc, scope: p.G35.scope },
    kit: { gl: b.G25.gl, nb: b.G25.nb, cap: b.G25.cap },
    em: b.G26,
    btn: b.G27,
  };
  if (ctx.gid) look.gid = ctx.gid;
  if (ctx.locks?.length) look.locks = [...new Set(ctx.locks)];
  return look;
}

/** The genome's pairing as ThemeSpec fonts (a "custom" pairing keeps the theme's fonts). */
function fontsOf(g: DesignGenome, fallback: ThemeSpec["fonts"]): ThemeSpec["fonts"] {
  const p = loadCatalogue().byId.get(g.brand.G4);
  if (!p) return fallback;
  return { display: p.display, body: p.body, ...(p.accent ? { accent: p.accent } : {}), displayAr: p.displayAr, bodyAr: p.bodyAr };
}

/** The theme a genome compiles to (DES-§4.5): archetype, fonts, palette, look; the H24 repair last. */
function themeOf(g: DesignGenome, ctx: CompileCtx): ThemeSpec {
  const src = ctx.theme;
  const sameArchetype = src.archetype === g.brand.G1;
  const look = compileLook(g, ctx);
  const draft: ThemeSpec = {
    ...src,
    archetype: g.brand.G1,
    fonts: ctx.derived ? src.fonts : fontsOf(g, src.fonts),
    palette: paletteOf(g, ctx),
    // the look decides shape, depth and surfaces unless the genome reads an existing theme (DS4: builder overrides win)
    radius: ctx.derived ? src.radius : "archetype",
    shadow: ctx.derived ? src.shadow : "archetype",
    texture: ctx.derived ? src.texture : "archetype",
    surfaces: ctx.derived ? src.surfaces : "archetype",
    dividers: sameArchetype || ctx.derived ? src.dividers : [],
    ornament: sameArchetype || ctx.derived ? src.ornament : ARCHETYPE_DEFS[g.brand.G1].ornament,
    look,
  };
  let theme = ThemeSpec.parse(draft);
  if (ctx.derived) return theme;
  if (ctx.mood === "calm") {
    // a calm product keeps today's calmer accent, pop, motion and dividers; the ground stays the one the strategy and
    // the photo decided (H11, H27), so a calm dark-luxe direction is never relabelled onto a tinted base
    const planned = theme.palette.base;
    theme = calmTheme(theme);
    if (theme.palette.base !== planned) theme = ThemeSpec.parse({ ...theme, palette: { ...theme.palette, base: planned } });
  }
  // H24: today's palette repair; the brand's locked roles must survive it (GEN-07)
  const repaired = withoutOrange(theme, ctx.locale);
  const locked = new Set(ctx.brand?.colors.locks ?? []);
  if (locked.has("accent") && repaired.palette.accent !== theme.palette.accent) throw new GenomeError("H24: the locked accent cannot be kept without orange");
  if (locked.has("pop") && repaired.palette.pop !== theme.palette.pop) throw new GenomeError("H24: the locked pop cannot be kept without orange");
  return repaired;
}

/** The planner's directives (DES-§4.5): grammar pools, colour moments, glass, density, alignment, treatment, aspects. */
function planOf(g: DesignGenome): PlanDirectives {
  const { hero, pools } = grammarPools(g.page.G2);
  const [lo, hi] = COLOR_PLANS[g.brand.G9].moments;
  const moments = lo + Math.floor(rngFor(g.seed, "compile:moments")() * (hi - lo + 1));
  const aspects: Partial<Record<string, Aspect>> = {};
  for (const s of g.sections) if (s.G19) aspects[s.id] = s.G19.a;
  return {
    grammar: g.page.G2,
    heroPool: hero,
    pools,
    colorMoments: Math.min(hi, moments),
    glass: g.page.G16,
    density: { ...g.page.G20 },
    align: g.page.G22,
    treatment: g.page.G18,
    aspects,
    choreographySeed: deriveSeed(g.seed, "choreography"),
  };
}

/** Pure: the genome as a ThemeSpec with `look`, the plan directives and the copy directives (DES-§4.5). */
export function compileGenome(g: DesignGenome, ctx: CompileCtx): Compiled {
  const theme = themeOf(g, ctx);
  const bytes = JSON.stringify(theme.look).length;
  if (bytes > LOOK_MAX_BYTES) throw new GenomeError(`look is ${bytes} B (≤ ${LOOK_MAX_BYTES})`);
  return {
    theme,
    plan: planOf(g),
    copy: {
      register: g.brand.G28,
      structures: structuresFor(g.brand.G28, !!ctx.numbers),
      angle: g.page.angle,
      darija: g.brand.G31,
      meanWords: g.brand.G30.mw,
      exclaim: g.brand.G30.ex,
      kickers: kickerSections(g),
    },
  };
}

/** The strong grounds a planner may paint for colour moments (I4). */
export const MOMENT_BGS: readonly SectionBg[] = ["accent", "dark", "pop"];
