/**
 * remixDoc — new take on an existing page without losing the merchant's work (design.md DES-§14.7).
 *
 *   design   resample one of G9 (colour strategy), G4 (pairing), G18 (image treatment), unlocked, seeded, and
 *            re-solve the dependent genes; the archetype, the sections and their content stay.
 *   layout   re-plan under the same genome: the variants from the grammar pools and the Act2 order (constrained,
 *            orderAct2); a page without a look re-orders its movable middle along another storyline (TEMPLATES).
 *   copy     re-picks wording alternatives from the copy library for every text the generator owns (headlines,
 *            benefits, FAQ…). Product facts, prices and offers are kept; only the titles of ×N packs on single-item
 *            pages are re-worded ("Pack Duo").
 *   all      a new page genome within the brand locks (the archetype kept), its layout, then copy.
 *   more     "More like this": 1-2 solved genes mutated (never a bold one).
 *   bolder / calmer   one Boldness step (the R1 slice of DG-12, DS31): G5.rd ± 0.05, G10 to its band's end, G20.l one
 *            step, G21 ∓ 0.1, G2 one step along quiet-luxe ← editorial-column ← split-tension ← cinematic ← poster
 *            when the next value is valid; nothing else moves (the rhythm genes are re-planned).
 *   upgrade  "Upgrade to design DNA": a page without a look gets `genomeOf(doc)` compiled with a look and the rhythm
 *            plans (CTA plan, reveal scope); copy untouched. A page with a look is returned as is.
 *
 * Every scope but copy gives a page without a look one (through `genomeOf`). design, layout, all and more must land
 * d_page ≥ 0.15 from the current page (the next seed is tried, ≤ 6). Prices, items and offers are never changed
 * (integer cents as the owner typed them). Pure & deterministic per seed. Always returns a valid document (the input
 * on failure).
 */
import { libraryCopy } from "@/lib/ai/copy-library";
import { isLegacyOffer, offerUnits } from "@/lib/page/catalog";
import { DEPTHS, LADDERS, MASKS, PageDoc, ThemeSpec, type Locale, type PageDoc as PageDocT, type SectionInstance } from "@/lib/page/schema";
import { validateDoc } from "@/lib/page/validate";
import { getSection } from "@/landing/registry";
import { CTA_LIKE, orderAct2, IMAGE_TEXT } from "@/lib/design/choreography";
import { compileGenome, compileLook } from "@/lib/design/compile";
import { planCtas } from "@/lib/design/cta";
import { genomeOf } from "@/lib/design/derive";
import { distanceView, genomeDistance } from "@/lib/design/distance";
import { variantFeatures } from "@/lib/design/features";
import type { BoldGene, DesignGenome, GeneKey, SampleInput } from "@/lib/design/genome";
import type { PhotoFacts } from "@/lib/design/photo-facts";
import { PRIORS_VERSION } from "@/lib/design/priors";
import { planReveals } from "@/lib/design/reveals";
import { hardViolations, sampleGenome } from "@/lib/design/solve";
import { COLOR_PLANS } from "@/lib/theme/palette";
import { factsFromDescription, inputHashOf } from "./directions";
import { garmentDetails, modestBigWord } from "./garment";
import { drawHero, drawVariants, heroComposition, LAYOUT_TYPES, TEMPLATE_COUNT, calmBands, chooseVariant, finishPlan, templateOrder, type PlanContext } from "./plan";
import { formVariantOf, safeSelection } from "./offers";
import { glueDeep, glueEmphasis } from "./glue";
import { isGarment, moodFit, productKeywords, readMood, type MoodReading } from "./mood";
import { deriveSeed, rngFor } from "./rng";
import { recopySection } from "./sections";
import { rerollTheme } from "./theme";
import { themeTones } from "./tones";

export type RemixScope = "design" | "layout" | "copy" | "all" | "more" | "bolder" | "calmer" | "upgrade";

export interface RemixOptions {
  seed: number;
  scope: RemixScope;
}

/** A remix result is at least this far from the current page (DES-§14.7), else the next seed (≤ 6). */
export const REMIX_MIN_D = 0.15;
const REMIX_SEEDS = 6;

const isFloating = (s: SectionInstance) => getSection(s.type)?.category === "floating";
const isTop = (s: SectionInstance) => getSection(s.type)?.category === "top";

/**
 * The page's product mood, read again from the product's words (the photo palette is not stored in
 * the page). A page whose archetype a calm product would never get (chosen by hand) is not calmed.
 */
function moodOfDoc(doc: PageDocT): { reading: MoodReading; keywords: string } {
  const keywords = productKeywords(doc.product, factsFromDescription(doc.product.description));
  const reading = readMood({ keywords, category: doc.product.category, palette: null });
  return { reading: moodFit(doc.theme.archetype, reading) === null ? { ...reading, mood: "neutral" } : reading, keywords };
}

/** The page carries a WhatsApp channel: its own pinned number, or the store's floating button. */
const hasWhatsapp = (doc: PageDocT) => !!doc.form.whatsapp?.enabled || doc.sections.some((s) => s.type === "whatsappFloat");

function planContext(doc: PageDocT, seed: number): PlanContext {
  const { reading, keywords } = moodOfDoc(doc);
  return {
    mood: reading.mood,
    garment: isGarment(doc.product.category, keywords),
    archetype: doc.theme.archetype,
    seed,
    category: doc.product.category,
    hasCutout: !!doc.product.cutout,
    imageCount: doc.product.images.length,
    hasFacts: factsFromDescription(doc.product.description).length >= 2,
    // the page pins its own number, or follows the store's (then it carries the floating button)
    hasWhatsapp: hasWhatsapp(doc),
  };
}

/**
 * Re-flow backgrounds and spacing over the current order (variants as given), judged on the colors
 * of `doc.theme`; transitions go back to "auto" (the renderer draws them from the live theme).
 */
function reflow(doc: PageDocT, sections: SectionInstance[], seed: number): SectionInstance[] {
  const look = doc.theme.look;
  const plan = finishPlan(
    sections.map((s) => ({ type: s.type, variant: s.variant })),
    doc.theme.archetype,
    seed,
    themeTones(doc.theme, doc.locale),
    {
      mood: moodOfDoc(doc).reading.mood,
      ...(look
        ? {
            budget: look.cs === "color-field" ? 4 : 2,
            heights: { dens: look.dens, space: look.space, form: { offers: doc.offers.bundles.length, groups: (doc.items[0]?.groups ?? []).filter((g) => g.kind !== "field").length, bump: !!doc.offers.orderBump } },
          }
        : {}),
    },
  );
  return sections.map((s, i) => ({ ...s, bg: plan[i]!.bg, divider: plan[i]!.divider, spacing: plan[i]!.spacing }));
}

/* ------------------------------------------------------------------ */
/* the genome of a page                                                */
/* ------------------------------------------------------------------ */

/** What the solver knows about a saved page's photos (no facts pass in the builder: sizes unknown). */
function photosOfDoc(doc: PageDocT): PhotoFacts {
  return { count: doc.product.images.length, maxWidth: 0, hasCutout: !!doc.product.cutout, dominant: null, background: { luminance: 0.8, uniform: false }, sharp: true };
}

/** The sample input of a remix (DS5: the remix seed is the brand seed, the page's inputs the hash). */
function remixInput(doc: PageDocT, seed: number, g: DesignGenome): SampleInput {
  const { reading } = moodOfDoc(doc);
  return {
    archetype: g.brand.G1,
    brandSeed: `remix:${seed}`,
    inputHash: inputHashOf({ product: doc.product, locale: doc.locale }),
    directionIndex: 0,
    attempt: 0,
    mood: reading,
    locale: doc.locale,
    market: doc.market,
    photos: photosOfDoc(doc),
    niche: `${doc.market}:${doc.product.category}`,
    brand: null,
    ranked: [{ archetype: g.brand.G1, score: 1, reason: "remix" }],
    shares: null,
    priorsV: PRIORS_VERSION,
  };
}

/** The current values of the bold genes, as locks. */
function boldLocks(g: DesignGenome, except: readonly BoldGene[] = []): Partial<Record<GeneKey, string>> {
  const all: Record<BoldGene, string> = { G1: g.brand.G1, G2: g.page.G2, G9: g.brand.G9, G4: g.brand.G4, G18: g.page.G18, G23: g.brand.G23.f, G28: g.brand.G28 };
  const out: Partial<Record<GeneKey, string>> = {};
  for (const [k, v] of Object.entries(all) as [BoldGene, string][]) if (!except.includes(k)) out[k] = v;
  return out;
}

/** A page's genome with its look: the page's own reading (a page without a look gets the derived one). */
function withLook(doc: PageDocT): PageDocT {
  if (doc.theme.look) return doc;
  try {
    const g = genomeOf(doc);
    const compiled = compileGenome(g, { theme: doc.theme, locale: doc.locale, derived: true });
    return { ...doc, theme: compiled.theme };
  } catch {
    return doc;
  }
}

/** The page's distance view (DES-§7.1, page scope). */
const viewOf = (doc: PageDocT) => distanceView(genomeOf(doc), { theme: doc.theme }, doc.locale, "page");

/** The first of ≤ 6 seeded tries that lands ≥ 0.15 from `doc` (the farthest one otherwise). */
function farEnough(doc: PageDocT, seed: number, make: (seed: number) => PageDocT): PageDocT {
  const base = viewOf(doc);
  let best: { doc: PageDocT; d: number } | null = null;
  for (let k = 0; k < REMIX_SEEDS; k++) {
    const next = make(deriveSeed(seed, `try:${k}`));
    const d = genomeDistance(base, viewOf(next), "page");
    if (!best || d > best.d) best = { doc: next, d };
    if (d >= REMIX_MIN_D) break;
  }
  return best!.doc;
}

/* ------------------------------------------------------------------ */
/* design                                                              */
/* ------------------------------------------------------------------ */

/** design: one of G9 / G4 / G18 resampled (unlocked), the dependent genes re-solved, the theme re-compiled. */
function remixDesign(doc: PageDocT, seed: number): PageDocT {
  const g = genomeOf(doc);
  const locked = new Set(doc.theme.look?.locks ?? []);
  const genes = (["G9", "G4", "G18"] as const).filter((x) => !locked.has(x));
  if (!genes.length) return remixLegacyDesign(doc, seed);
  // the gene to resample first, seeded; the others follow when it cannot move
  const start = Math.floor(rngFor(seed, "remix:design")() * genes.length);
  const order = genes.map((_, i) => genes[(i + start) % genes.length]!);
  const { reading } = moodOfDoc(doc);
  for (const gene of order) {
    const current = gene === "G4" ? g.brand.G4 : gene === "G9" ? g.brand.G9 : g.page.G18;
    for (let k = 0; k < 4; k++) {
      let next: DesignGenome;
      try {
        next = sampleGenome(remixInput(doc, deriveSeed(seed, `${gene}:${k}`), g), { locks: boldLocks(g, [gene]) });
      } catch {
        continue;
      }
      const value = gene === "G4" ? next.brand.G4 : gene === "G9" ? next.brand.G9 : next.page.G18;
      if (value === current) continue;
      try {
        // the page's own palette is the input of G9 → palette; its layout genes and rhythm stay the page's
        next = { ...next, page: { ...next.page, G24: g.page.G24, G32: g.page.G32, G33: g.page.G33, G34: g.page.G34, G35: g.page.G35 }, sections: g.sections };
        const compiled = compileGenome(next, { theme: doc.theme, locale: doc.locale, mood: reading.mood, photos: photosOfDoc(doc) });
        // a new seed: the theme's illustration and texture draws move with the genes
        const theme = ThemeSpec.parse({ ...compiled.theme, archetype: doc.theme.archetype, seed: next.seed });
        const out: PageDocT = { ...doc, theme };
        return { ...out, sections: reflow(out, doc.sections, deriveSeed(seed, "flow")) };
      } catch {
        continue;
      }
    }
  }
  return remixLegacyDesign(doc, seed);
}

/** Today's design remix (a page whose three genes are all locked, or a solver refusal): fonts, mood and variants re-picked. */
function remixLegacyDesign(doc: PageDocT, seed: number): PageDocT {
  const { reading, keywords } = moodOfDoc(doc);
  const theme = rerollTheme(doc.theme, doc.product.category, deriveSeed(seed, "theme"), { keywords, mood: reading.mood, locale: doc.locale });
  const next: PageDocT = { ...doc, theme: doc.theme.look ? { ...theme, look: doc.theme.look } : theme };
  const ctx = planContext(next, deriveSeed(seed, "variants"));
  const rechosen = doc.sections.map((s) => {
    const def = getSection(s.type);
    // keep variants the admin cannot get back from the archetype (unknown types, single-variant sections)
    if (!def || def.variants.length < 2) return s;
    return { ...s, variant: chooseVariant(s.type, ctx, ":remix") };
  });
  // one scrolling band in the page body (a single-variant section keeps its own)
  const sections = reflow(next, calmBands(rechosen, ctx), deriveSeed(seed, "flow"));
  // a new bold order form never gets a solid selection (accent on accent, §E.3)
  const display = safeSelection(doc.offers.display, formVariantOf({ sections }));
  return { ...next, sections, ...(display !== doc.offers.display ? { offers: { ...doc.offers, display } } : {}) };
}

/* ------------------------------------------------------------------ */
/* layout                                                              */
/* ------------------------------------------------------------------ */

/** layout on a page with a look: the variants from the genome's pools and the Act2 order re-planned; the set of sections kept. */
function remixPlannedLayout(doc: PageDocT, seed: number): PageDocT {
  const g = genomeOf(doc);
  const compiled = compileGenome(g, { theme: doc.theme, locale: doc.locale, derived: true });
  const ctx = planContext(doc, deriveSeed(seed, "variants"));
  const d = { directives: compiled.plan, has: { ownerProof: false, video: false, photos: doc.product.images.length, endDate: false, whatsapp: ctx.hasWhatsapp, storeName: false, offers: doc.offers.bundles.length, facts: ctx.hasFacts, garment: !!ctx.garment } };
  const variants = drawVariants(ctx, d);
  const hero = drawHero(ctx, { directives: compiled.plan, photos: photosOfDoc(doc), locale: doc.locale }).hero;
  // the block a page without a final cta closes on keeps its variant (it is the page's last ask)
  const flowAll = doc.sections.filter((s) => !isTop(s) && !isFloating(s) && s.type !== "footer");
  const lastFlow = flowAll.at(-1);
  const closingId = !doc.sections.some((s) => s.type === "cta") && lastFlow && CTA_LIKE.has(`${lastFlow.type}:${lastFlow.variant}`) ? lastFlow.id : null;
  const sections = doc.sections.map((s) => {
    const def = getSection(s.type);
    if (!def || def.variants.length < 2 || s.type === "urgency" || s.id === closingId) return s;
    if (s.type === "hero") {
      if (s.variant === hero) return s;
      const comp = heroComposition(hero, ctx.seed, doc.locale, { directives: compiled.plan, photos: photosOfDoc(doc), shares: null });
      return { ...s, variant: hero, data: { ...s.data, ...comp.data } };
    }
    const v = variants.get(s.type);
    return v && def.variants.some((x) => x.id === v) ? { ...s, variant: v } : s;
  });
  // Act2: the blocks between the order form and the close, re-ordered under H35
  const formAt = sections.findIndex((s) => s.type === "orderForm");
  const ctaAt = sections.map((s) => s.type).lastIndexOf("cta");
  const footerAt = sections.findIndex((s) => s.type === "footer");
  // a page that closes on a block which already asks (Close → ε: offer:showcase, guarantee:split) keeps it last
  const closer = ctaAt <= formAt && footerAt > formAt + 1 && CTA_LIKE.has(`${sections[footerAt - 1]!.type}:${sections[footerAt - 1]!.variant}`) ? footerAt - 1 : -1;
  const end = ctaAt > formAt ? ctaAt : closer > formAt ? closer : footerAt > formAt ? footerAt : -1;
  let ordered = sections;
  if (formAt >= 0 && end > formAt + 2) {
    const act2 = sections.slice(formAt + 1, end).filter((s) => !isTop(s) && !isFloating(s));
    const byType = new Map(act2.map((s) => [s.type, s]));
    const types = orderAct2(
      act2.map((s) => s.type),
      g.page.G20.p,
      rngFor(seed, "remix:act2"),
      {
        familyOf: (t) => variantFeatures(t, byType.get(t)!.variant, null).family,
        imageText: (t) => IMAGE_TEXT.has(`${t}:${byType.get(t)!.variant}`),
        before: ["orderForm"],
      },
    );
    // a near-tie order may repeat the current one: rotate by the seed so the remix moves
    const same = types.join() === act2.map((s) => s.type).join();
    const finalTypes = same && types.length > 2 ? [...types.slice(1), types[0]!] : types;
    ordered = [...sections.slice(0, formAt + 1), ...finalTypes.map((t) => byType.get(t)!), ...sections.slice(end)];
  }
  const out: PageDocT = { ...doc, sections: ordered };
  const display = safeSelection(doc.offers.display, formVariantOf({ sections: ordered }));
  return { ...out, sections: reflow(out, ordered, deriveSeed(seed, "flow")), ...(display !== doc.offers.display ? { offers: { ...doc.offers, display } } : {}) };
}

/** layout on a page without a look: the movable middle along another storyline (TEMPLATES, kept for old documents). */
function remixLegacyLayout(doc: PageDocT, seed: number): PageDocT {
  const all = doc.sections;
  const head = all.filter(isTop);
  const floating = all.filter(isFloating);
  const body = all.filter((s) => !isTop(s) && !isFloating(s));
  const heroAt = body.findIndex((s) => s.type === "hero");
  const footerAt = body.findIndex((s) => s.type === "footer");
  const start = heroAt >= 0 ? heroAt + 1 : 0;
  const end = footerAt >= 0 ? footerAt : body.length;
  const middle = body.slice(start, end);
  if (middle.length < 3) return doc;

  // target order of the known types along a storyline different from the current one when possible
  const current = middle.filter((s) => LAYOUT_TYPES.has(s.type)).map((s) => s.type).join(",");
  let order: string[] = [];
  for (let k = 0; k < TEMPLATE_COUNT; k++) {
    const candidate = templateOrder(seed + k).filter((t) => t !== "hero");
    order = candidate;
    const projected = middle
      .filter((s) => LAYOUT_TYPES.has(s.type))
      .slice()
      .sort((a, b) => rank(candidate, a.type) - rank(candidate, b.type))
      .map((s) => s.type)
      .join(",");
    if (projected !== current) break;
  }

  // movable sections take the template order; the others keep their slots
  const movable = middle.filter((s) => LAYOUT_TYPES.has(s.type)).sort((a, b) => rank(order, a.type) - rank(order, b.type) || middle.indexOf(a) - middle.indexOf(b));
  let m = 0;
  const reordered = middle.map((s) => (LAYOUT_TYPES.has(s.type) ? movable[m++]! : s));
  const sections = [...head, ...body.slice(0, start), ...reordered, ...body.slice(end), ...floating];
  return { ...doc, sections: reflow(doc, sections, deriveSeed(seed, "flow")) };
}

/** Position of a type in a template order (unknown types sort last, stable). */
function rank(order: readonly string[], type: string): number {
  const i = order.indexOf(type);
  return i < 0 ? order.length + 1 : i;
}

/* ------------------------------------------------------------------ */
/* all, more, bolder / calmer, upgrade                                 */
/* ------------------------------------------------------------------ */

/** all: a new page genome (the archetype and the brand-level genes kept), compiled, then its layout. */
function remixAll(doc: PageDocT, seed: number): PageDocT {
  const g = genomeOf(doc);
  const { reading } = moodOfDoc(doc);
  try {
    const locks = boldLocks(g, ["G2", "G18", "G9", "G4"]);
    const next = sampleGenome(remixInput(doc, seed, g), { locks });
    const compiled = compileGenome({ ...next, sections: g.sections }, { theme: doc.theme, locale: doc.locale, mood: reading.mood, photos: photosOfDoc(doc) });
    const out: PageDocT = { ...doc, theme: ThemeSpec.parse({ ...compiled.theme, archetype: doc.theme.archetype }) };
    return remixPlannedLayout(out, deriveSeed(seed, "layout"));
  } catch {
    return remixPlannedLayout(withLook(doc), deriveSeed(seed, "layout"));
  }
}

/** The solved (never bold) genes "More like this" may mutate, as look fields (DES-§14.7). */
const MORE_GENES = ["ladder", "depth", "mask", "glyph", "emphasis", "button", "corner", "space", "rd"] as const;

/** more: 1-2 solved genes moved to another valid value; the rest of the look as it is. */
function remixMore(doc: PageDocT, seed: number): PageDocT {
  const base = withLook(doc);
  const g = genomeOf(base);
  const rng = rngFor(seed, "remix:more");
  const facts = factsInput(base);
  const n = 1 + (rng() < 0.5 ? 1 : 0);
  const picked = new Set<(typeof MORE_GENES)[number]>();
  while (picked.size < n) picked.add(MORE_GENES[Math.floor(rng() * MORE_GENES.length)]!);
  let cur: DesignGenome = structuredClone(g);
  const one = <T,>(values: readonly T[], now: T): T => {
    const other = values.filter((v) => v !== now);
    return other.length ? other[Math.floor(rng() * other.length)]! : now;
  };
  for (const gene of picked) {
    for (let k = 0; k < 6; k++) {
      const t: DesignGenome = structuredClone(cur);
      if (gene === "ladder") t.brand.G12 = one(LADDERS, t.brand.G12);
      if (gene === "depth") t.brand.G15 = one(DEPTHS, t.brand.G15);
      if (gene === "mask") t.brand.G17 = one(MASKS, t.brand.G17);
      if (gene === "glyph") t.brand.G25 = { ...t.brand.G25, gl: one(["dot", "spark", "diamond", "none"] as const, t.brand.G25.gl) };
      if (gene === "emphasis") t.brand.G26 = one(["none", "highlight", "color", "italic"] as const, t.brand.G26);
      if (gene === "button") t.brand.G27 = one(["solid", "pill", "soft", "outline"] as const, t.brand.G27);
      if (gene === "corner") t.brand.G13 = t.brand.G13 === "circle" ? "squircle" : "circle";
      if (gene === "space") t.page.G21 = Math.round(Math.min(1.6, Math.max(0.75, t.page.G21 + (rng() < 0.5 ? -0.1 : 0.1))) * 100) / 100;
      if (gene === "rd") t.brand.G5 = { ...t.brand.G5, rd: Math.round(Math.min(1.5, Math.max(1.2, t.brand.G5.rd + (rng() < 0.5 ? -0.05 : 0.05))) * 1000) / 1000 };
      if (hardViolations(t, facts).length <= hardViolations(cur, facts).length) {
        cur = t;
        break;
      }
    }
  }
  return lookPatched(base, cur);
}

/** The genome's look over the page (a look-only change keeps the palette, fonts and builder fields as they are). */
function lookPatched(doc: PageDocT, g: DesignGenome): PageDocT {
  const prev = doc.theme.look;
  const look = compileLook(g, { photos: photosOfDoc(doc), ...(prev?.gid ? { gid: prev.gid } : {}), ...(prev?.locks ? { locks: prev.locks } : {}) });
  const theme = ThemeSpec.parse({ ...doc.theme, look });
  return { ...doc, theme };
}

/** What the hard rules read about a saved page (mood, locale, photos; no brand kit in the builder's remix). */
const factsInput = (doc: PageDocT) => ({ mood: moodOfDoc(doc).reading, locale: doc.locale as Locale, photos: photosOfDoc(doc), brand: null });

/** The G2 boldness chain (DES-§14.7): calmer moves left, bolder right. */
const BOLD_CHAIN = ["quiet-luxe", "editorial-column", "split-tension", "cinematic", "poster"] as const;
const DENSITY_STEP = ["airy", "balanced", "dense"] as const;

/**
 * One Boldness step on a genome (DES-§14.7, DS31): only G5.rd, G10, G20.l, G21 and G2 move; G2 only when the next
 * value of the chain breaks no hard rule (H04, H05, H07, H22 …), and a move that would break one is undone. Exported
 * for the DG-12 test ("Bolder / Calmer move only their genes").
 */
export function boldnessStep(g: DesignGenome, dir: "bolder" | "calmer", facts: Pick<SampleInput, "mood" | "locale" | "photos" | "brand">): DesignGenome {
  const up = dir === "bolder";
  let cur: DesignGenome = structuredClone(g);
  const faults = (x: DesignGenome) => hardViolations(x, facts).length;
  const tryMove = (f: (t: DesignGenome) => void) => {
    const t = structuredClone(cur);
    f(t);
    if (faults(t) <= faults(cur)) cur = t;
  };
  tryMove((t) => (t.brand.G5 = { ...t.brand.G5, rd: Math.round(Math.min(1.5, Math.max(1.2, t.brand.G5.rd + (up ? 0.05 : -0.05))) * 1000) / 1000 }));
  const band = COLOR_PLANS[cur.brand.G9].area;
  tryMove((t) => (t.page.G10 = up ? band[1] : band[0]));
  tryMove((t) => {
    const i = DENSITY_STEP.indexOf(t.page.G20.l);
    const l = DENSITY_STEP[Math.min(2, Math.max(0, i + (up ? 1 : -1)))]!;
    // H23: dense ⇒ G21 ≤ 1.1, airy ⇒ G21 ≥ 1.1 (the space step follows)
    const space = Math.round(Math.min(1.6, Math.max(0.75, t.page.G21 + (up ? -0.1 : 0.1))) * 100) / 100;
    t.page.G20 = { ...t.page.G20, l };
    t.page.G21 = l === "dense" ? Math.min(1.1, space) : l === "airy" ? Math.max(1.1, space) : space;
  });
  if (cur.page.G21 === g.page.G21) tryMove((t) => (t.page.G21 = Math.round(Math.min(1.6, Math.max(0.75, t.page.G21 + (up ? -0.1 : 0.1))) * 100) / 100));
  const at = (BOLD_CHAIN as readonly string[]).indexOf(cur.page.G2);
  if (at >= 0) {
    const next = BOLD_CHAIN[at + (up ? 1 : -1)];
    if (next) tryMove((t) => (t.page.G2 = next));
  }
  return cur;
}

/** bolder / calmer: the step, the hero re-drawn when the grammar's pool no longer holds it, the rhythm re-planned. */
function remixBoldness(doc: PageDocT, seed: number, dir: "bolder" | "calmer"): PageDocT {
  const base = withLook(doc);
  const g = genomeOf(base);
  const next = boldnessStep(g, dir, factsInput(base));
  let sections = base.sections;
  if (next.page.G2 !== g.page.G2) {
    const compiled = compileGenome(next, { theme: base.theme, locale: base.locale, derived: true });
    const ctx = planContext(base, deriveSeed(seed, "variants"));
    const heroAt = sections.findIndex((s) => s.type === "hero");
    const pool = compiled.plan.heroPool.map((v) => v.variant);
    if (heroAt >= 0 && !pool.includes(sections[heroAt]!.variant)) {
      const hero = drawHero(ctx, { directives: compiled.plan, photos: photosOfDoc(base), locale: base.locale }).hero;
      const comp = heroComposition(hero, ctx.seed, base.locale, { directives: compiled.plan, photos: photosOfDoc(base), shares: null });
      sections = sections.map((s, i) => (i === heroAt ? { ...s, variant: hero, data: { ...s.data, ...comp.data } } : s));
    }
  }
  const flow = sections.filter((s) => !s.hidden && !isTop(s) && !isFloating(s) && s.type !== "footer");
  next.page.G35 = planReveals(flow, { grammar: next.page.G2, density: next.page.G20.l, kinds: next.brand.G23.r });
  const out = lookPatched({ ...base, sections }, next);
  return { ...out, sections: reflow(out, sections, deriveSeed(seed, "flow")) };
}

/** upgrade: a page without a look gets its own genome compiled with one, the CTA plan and the reveal scope. */
function remixUpgrade(doc: PageDocT): PageDocT {
  if (doc.theme.look) return doc;
  const up = withLook(doc);
  if (!up.theme.look) return doc;
  const g = genomeOf(up);
  const flow = up.sections.filter((s) => !s.hidden && !isTop(s) && !isFloating(s) && s.type !== "footer");
  g.page.G35 = planReveals(flow, { grammar: g.page.G2, density: g.page.G20.l, kinds: g.brand.G23.r });
  const cta = planCtas(flow.map((s) => ({ id: s.id, type: s.type, variant: s.variant })), { sticky: up.sections.some((s) => s.type === "stickyCta"), whatsapp: hasWhatsapp(up) });
  const off = new Set(cta.off);
  // the CTA plan's toggles (data, not copy): no button outside the primary CTAs
  const sections = up.sections.map((s) => (off.has(s.id) && typeof s.data.cta === "boolean" && s.data.cta ? { ...s, data: { ...s.data, cta: false } } : s));
  return lookPatched({ ...up, sections }, g);
}

/* ------------------------------------------------------------------ */
/* copy                                                                */
/* ------------------------------------------------------------------ */

/** Pin positions of the page's showcase details ({x, y} per point, in order; empty when none). */
function pinsOf(doc: PageDocT): { x: number; y: number }[] {
  const s = doc.sections.find((x) => x.type === "showcase");
  const points = (s?.data as { points?: unknown } | undefined)?.points;
  if (!Array.isArray(points)) return [];
  const out: { x: number; y: number }[] = [];
  for (const p of points) {
    const { x, y } = (p ?? {}) as { x?: unknown; y?: unknown };
    if (typeof x !== "number" || typeof y !== "number") return [];
    out.push({ x, y });
  }
  return out;
}

function remixCopy(doc: PageDocT, seed: number): PageDocT {
  const facts = factsFromDescription(doc.product.description);
  const { keywords, reading } = moodOfDoc(doc);
  const copy = libraryCopy({
    // catalog category + the product's words pick the family and its facets (see directions.ts)
    category: doc.product.category,
    keywords,
    locale: doc.locale,
    market: doc.market,
    seed: deriveSeed(seed, "copy"),
    productName: doc.product.name,
    hasWhatsapp: hasWhatsapp(doc),
  });
  // new words for a garment's details, same pins: the page's pins were placed on its photo (on the
  // real figure when the photo analysis was known) and a copy remix does not move them
  const pins = pinsOf(doc);
  const fresh = isGarment(doc.product.category, keywords) ? garmentDetails(doc.locale, doc.product.category, keywords) : null;
  const details = fresh && pins.length === fresh.length ? fresh.map((d, i) => ({ ...d, ...pins[i]! })) : fresh;
  const extras = {
    facts,
    ...(details ? { details } : {}),
    whatsapp: hasWhatsapp(doc),
    ...(reading.modest ? { bigWord: modestBigWord(doc.locale, keywords) } : {}),
  };
  const sections = doc.sections.map((s) => ({ ...s, data: glueDeep(recopySection(s, copy, extras), doc.locale) }));
  const bundleText = copy.bundles;
  return {
    ...doc,
    product: { ...doc.product, tagline: copy.tagline },
    offers: {
      ...doc.offers,
      bundles: doc.offers.bundles.map((b) => {
        // titles are rewritten only on ×N packs of a single-item page ("Pack Duo"); every other
        // offer (several items, choices, gifts, color packs) keeps the owner's words
        const qty = doc.items.length === 1 && isLegacyOffer(doc, b) ? offerUnits(b) : 0;
        const t = qty >= 1 && qty <= 3 ? bundleText[qty - 1] : undefined;
        return t ? { ...b, title: t.title, subtitle: t.subtitle } : b;
      }),
    },
    form: { ...doc.form, title: glueEmphasis(copy.form.title, doc.locale), submitLabel: copy.form.submit, reassurance: glueEmphasis(copy.form.reassurance, doc.locale) },
    seo: { ...doc.seo, title: copy.seo.title, description: copy.seo.description },
    thankYou: { ...doc.thankYou, title: glueEmphasis(copy.thankYou.title, doc.locale), message: glueEmphasis(copy.thankYou.message, doc.locale) },
    sections,
  };
}

/* ------------------------------------------------------------------ */
/* entry                                                               */
/* ------------------------------------------------------------------ */

export function remixDoc(doc: PageDocT, opts: RemixOptions): PageDocT {
  const parsed = PageDoc.safeParse(doc);
  if (!parsed.success) return doc;
  const seed = Math.abs(Math.trunc(Number.isFinite(opts.seed) ? opts.seed : 0)) % 2_147_483_647;
  let next = parsed.data;
  try {
    switch (opts.scope) {
      case "design":
        next = farEnough(next, deriveSeed(seed, "design"), (s) => remixDesign(withLook(next), s));
        break;
      case "layout":
        // a page without a look keeps today's storylines (TEMPLATES) and gains its look
        next = farEnough(next, deriveSeed(seed, "layout"), (s) => (next.theme.look ? remixPlannedLayout(next, s) : withLook(remixLegacyLayout(next, s))));
        break;
      case "copy":
        next = remixCopy(next, deriveSeed(seed, "copy"));
        break;
      case "all":
        next = farEnough(next, deriveSeed(seed, "all"), (s) => remixAll(next, s));
        next = remixCopy(next, deriveSeed(seed, "copy"));
        break;
      case "more":
        next = farEnough(next, deriveSeed(seed, "more"), (s) => remixMore(next, s));
        break;
      case "bolder":
      case "calmer":
        next = remixBoldness(next, deriveSeed(seed, opts.scope), opts.scope);
        break;
      case "upgrade":
        next = remixUpgrade(next);
        break;
    }
  } catch {
    return doc;
  }
  const { doc: valid } = validateDoc(next);
  return valid ?? doc;
}
