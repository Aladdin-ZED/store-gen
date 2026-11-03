/**
 * generateDirections — product + photos (+ optional AI analysis and copy) → three complete,
 * art-directed PageDocs in three different archetypes, ready to preview and publish.
 */
import { copyFamily, libraryCopy, productRef } from "@/lib/ai/copy-library";
import type { PageCopy } from "@/lib/ai/copy-schema";
import { getMarket } from "@/lib/markets/info";
import {
  PageDoc,
  Product,
  Tracking,
  type Archetype,
  type Locale,
  type Market,
  type PageDocInput,
  type SectionInstance,
  type ThemeSpec,
} from "@/lib/page/schema";
import { validateDoc } from "@/lib/page/validate";
import { garmentOf } from "@/landing/sections/garment";
import { ARCHETYPE_DEFS, rankArchetypes, type ExtractedPalette } from "@/lib/theme";
import { getSection } from "@/landing/registry";
import { compileGenome, compileLook, type Compiled, type PlanDirectives } from "@/lib/design/compile";
import { distanceView, genomeDistance, nicheKey, type DistanceView } from "@/lib/design/distance";
import { GenomeError, type DesignGenome, type SampleInput } from "@/lib/design/genome";
import type { GeneHints } from "@/lib/design/hints";
import type { NicheShares } from "@/lib/design/novelty.server";
import type { PhotoFacts } from "@/lib/design/photo-facts";
import { PRIORS_VERSION } from "@/lib/design/priors";
import { directionArchetype, sampleGenome } from "@/lib/design/solve";
import type { BrandSetting } from "@/lib/settings/keys/brand";
import { composeCopy, type CopyExtras } from "./copy-map";
import { calmBands, chooseOrder, chooseVariant, finishPlan, fullOrder, planDesign, type DesignPlan, type PlanContext } from "./plan";
import { CatalogInputError, directionCatalog, displayInput, drawOfferDisplay, pickOfferDisplay, safeSelection } from "./offers";
import { deriveSeed, hash32 } from "./rng";
import { directSections } from "./direct";
import { garmentDetails, garmentPhoto, modestBigWord, type PhotoInfo } from "./garment";
import { glueDeep, glueEmphasis } from "./glue";
import { copyCategory, isGarment, moodFit, productKeywords, readMood, type MoodReading } from "./mood";
import { sectionData, sectionId, type DocBasics } from "./sections";
import { colorDistance, productTheme } from "./theme";
import { themeTones } from "./tones";

export interface GenerateInput {
  /**
   * product as typed in the wizard (validated with the Product schema): the page's story (name,
   * category, photos, rating). Without `items` it is also the page's one item: its price,
   * compare-at, SKU and options (`variants`) make the item "main".
   */
  product: unknown;
  /**
   * The page's items (Offers v2, wizard "Several products"; PageDoc `items`, 1–8, items[0] = lead):
   * given → used verbatim (validated with the Item schema); absent → one item from `product`.
   */
  items?: unknown;
  /**
   * The page's offers (PageDoc `offers.bundles`, 1–8): given → used verbatim (validated with the
   * Offer schema) by every direction; absent → suggestOffers on the items (src/lib/page/offer-presets.ts).
   */
  offers?: unknown;
  /**
   * The offer layout the owner chose in the wizard ("Look": a combo, PageDoc `offers.display`): given
   * → every direction uses it; absent → each archetype picks (docs/OFFERS.md §E.5).
   */
  display?: unknown;
  /** palette extracted from the main product photo */
  palette: ExtractedPalette | null;
  /** vibe keywords from the local AI ("luxury natural") */
  aiVibe?: string | null;
  /** AI copy already merged over the library (see mergeAiCopy), per locale */
  copy?: Partial<Record<Locale, PageCopy>>;
  /** merchant facts (3–5 bullets) */
  facts?: readonly string[];
  locale: Locale;
  market: Market;
  seedBase: number;
  /** Settings → Defaults */
  shippingFee?: number;
  deliveryText?: string | null;
  currency?: string;
  /**
   * Store WhatsApp number, international (wa.me digits, see whatsappDigits): enables the floating
   * button. The page itself does not pin it — the live store number is used when rendering.
   */
  whatsapp?: string | null;
  /**
   * Store identity from Settings → Store, when the caller knows it. Only steers composition (a
   * store without a real name gets no giant footer wordmark, no signed founder note); the page
   * never pins it — the live store details are used when rendering. Omitted = unknown (no steering).
   */
  store?: { name?: string | null } | null;
  /**
   * What the media library knows about the product photos (size, transparency and the upload's
   * subject analysis `focus`), by asset id. Optional: with it a garment's detail pins sit on the
   * real figure (never on a face) and a group shot is not the one the details are pinned on.
   */
  photos?: readonly PhotoInfo[];
  /** force the archetypes instead of ranking them (admin choice) */
  archetypes?: readonly Archetype[];
  /**
   * "Ad tracking for this page", the wizard's required answer (docs/OFFERS.md §A.4): a TrackingChoice
   * `{ kind: "ids", tracking }` (the page's pixels) or `{ kind: "none" }` ("No pixel on this page" →
   * `tracking.none`). A plain Tracking value is still read (one release). Validated with the Tracking
   * schema; omitted or invalid → no answer (`{}`: the checklist and the publish dialog ask for one).
   * The page is created with exactly this tracking: nothing is added when saving.
   */
  tracking?: unknown;
  /*
   * The design engine's inputs (design.md DES-§14.2; all optional: a caller without them gets the same engine with
   * neutral shares and seeds derived from `seedBase`).
   */
  /** the store's brand seed (`stores.brand_seed`, DS5); absent → `seed:<seedBase>` */
  brandSeed?: string;
  /** sha256(sorted asset ids, product name, category, locale) from the wizard (step 1); absent → `inputHashOf` */
  inputHash?: string;
  /** the store's brand kit (locks, DES-§12.3) */
  brand?: BrandSetting | null;
  /** the niche key (DES-§7.3); absent → nicheKey(market, category) */
  niche?: string;
  /** the niche's shares (`nicheSharesAction`, cached per session; k ≥ 10 or neutral) for H33 and the 4-gram rule */
  shares?: NicheShares | null;
  /**
   * The niche's archetype shares of live stores (H33 on G1, N5; k ≥ 10, rounded to 10 %). Until `NicheShares` carries
   * them (CCR r1-p6-7) the caller passes them here; absent = neutral.
   */
  vibeShares?: { n: number; shares: Record<string, number> } | null;
  /** the wizard's photo facts pass (DES-§4.11); absent → from `photos`, the cutout and the palette */
  photoFacts?: PhotoFacts;
  /** the release flag `design_new_heroes` (default on) */
  newHeroes?: boolean;
  /** the store's own pages as in-flow section tokens (the 4-gram rule, DES-§5.1) */
  ownPages?: number[][];
  /**
   * The owner's proof material (I6, DS42): customer reviews or messages, and the number of merchant figures
   * (`allowedNumbers`). Without them no reviews, social proof or stats section is planned.
   */
  proof?: { reviews?: boolean; figures?: number };
  /** Director hints (GH-1, flag `ai_director_brief`), validated by the caller (validateHints) */
  hints?: GeneHints;
  /** the hero-title skeleton ids of the store's last 5 pages (DES-§9.12 rotation); absent = none known */
  ownSkeletons?: readonly string[];
}

export interface Direction {
  archetype: Archetype;
  /** archetype display name ("Maison") */
  label: string;
  description: string;
  /** why this archetype was picked (the theme engine's ranking explanation, for debugging) */
  reason: string;
  /** the same, structured for display: ranking position (0 = best), matched vibe words, admin-forced */
  match: DirectionMatch;
  seed: number;
  doc: PageDoc;
  /** the planned genome (sections, rhythm genes, G24); null when the direction fell back to the archetype plan */
  genome?: DesignGenome | null;
  /** the engine-composed copy fields and their skeleton ids ("hero.headline" → "fr.t.np-fact"); absent = library or AI copy */
  skeletons?: Record<string, string>;
}

export interface DirectionMatch {
  rank: number;
  /** matched vibe words (AI vibe, then the product's own mood words: "calm", "modest", "lace"…) */
  vibes: string[];
  forced: boolean;
}

export class GeneratorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeneratorError";
  }
}

const cleanFacts = (facts: readonly string[] | undefined) =>
  (facts ?? [])
    .map((f) => f.replace(/\s+/g, " ").trim())
    .filter((f) => f.length > 0)
    .slice(0, 6);

/** "- fact" lines for product.description (BlockText bullets). */
export const factsToDescription = (facts: readonly string[]) => facts.map((f) => `- ${f.slice(0, 200)}`).join("\n").slice(0, 4000);

/** Facts back from a product description written by factsToDescription (used by copy remix). */
export const factsFromDescription = (description: string | undefined) =>
  (description ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("- "))
    .map((l) => l.slice(2).trim())
    .filter(Boolean);

/** Store names older installs stored as placeholders: not a real brand. */
const PLACEHOLDER_STORE = /^(my store|ma boutique|mon magasin|store|boutique|shop|متجري|المتجر)$/i;

/** true / false when the caller passed the store identity, null when unknown. */
function hasRealStoreName(store: GenerateInput["store"]): boolean | null {
  if (store === undefined || store === null) return null;
  const name = (store.name ?? "").replace(/\s+/g, " ").trim();
  return name.length > 0 && !PLACEHOLDER_STORE.test(name);
}

/** The product's mood from everything the merchant told us (see mood.ts). */
function moodOf(input: Pick<GenerateInput, "product" | "palette" | "aiVibe" | "facts">): { reading: MoodReading; keywords: string } {
  const parsed = Product.safeParse(input.product);
  const product = parsed.success ? parsed.data : null;
  const keywords = productKeywords(product ?? {}, cleanFacts(input.facts));
  return { reading: readMood({ keywords, category: product?.category ?? "other", palette: input.palette, aiVibe: input.aiVibe }), keywords };
}

/** Section types whose variant sets the composition of a page (spread across the three directions). */
const SPREAD_TYPES = new Set(["hero", "benefits", "problem", "steps", "showcase", "reviews", "socialProof", "orderForm", "offer"]);

/** A direction's design: the sampled genome and its compilation (DES-§14.2 step 3). */
export interface DirectionDesign {
  genome: DesignGenome;
  compiled: Compiled;
  /** hero-title skeletons the sibling directions already use (DES-§9.5 rotation) */
  copyAvoid?: ReadonlySet<string>;
}

/** A built direction: its document and, on the design path, the planned genome (sections, rhythm genes, G24). */
export interface BuiltDirection {
  doc: PageDoc;
  genome: DesignGenome | null;
  plan: DesignPlan | null;
  /** the engine-composed copy paths and their skeleton ids (DES-§9.12); null = library or AI copy */
  skeletons?: Record<string, string> | null;
}

/** The section schema accepts a top-level field (an unknown key would be stripped by the section's zod object). */
function accepts(type: string, field: string): boolean {
  const shape = (getSection(type)?.schema as { shape?: Record<string, unknown> } | undefined)?.shape;
  return !!shape && Object.prototype.hasOwnProperty.call(shape, field);
}

/** The colour-moment budget of a planned page: its G10 moments and the final CTA, ≤ 2 (colour-field ≤ 4; I4). */
const momentBudget = (g: DesignGenome, d: PlanDirectives) => Math.max(1, Math.min(g.brand.G9 === "color-field" ? 4 : 2, d.colorMoments + 1));

/**
 * Build one complete document for an archetype. `avoid` lists variants sibling directions already
 * use (made less likely, never forbidden). With `design` (the sampled and compiled genome) the page
 * is planned by the engine (DES-§5.5): grammar pools, the choreography, the rhythm planners and the
 * fold, the theme with its look; without it, today's archetype plan (kept for callers outside the
 * wizard and for old documents).
 */
export function buildDirection(input: GenerateInput, archetype: Archetype, seed: number, avoid?: ReadonlyMap<string, ReadonlySet<string>>, design?: DirectionDesign): PageDoc {
  return buildDirectionWithGenome(input, archetype, seed, avoid, design).doc;
}

/** buildDirection with the planned genome (the design path) for the distance check and the reveal. */
export function buildDirectionWithGenome(input: GenerateInput, archetype: Archetype, seed: number, avoid?: ReadonlyMap<string, ReadonlySet<string>>, design?: DirectionDesign): BuiltDirection {
  // the story (name, category, photos); without `items`, the v1 product is also the one item "main"
  const parsedProduct = Product.safeParse(input.product);
  if (!parsedProduct.success) throw new GeneratorError(input.items ? "The product is incomplete: a name is required." : "The product is incomplete: name and price are required.");
  const facts = cleanFacts(input.facts);
  const market = getMarket(input.market);
  const currency = input.currency && /^[A-Z]{3}$/.test(input.currency) ? input.currency : market.currency;
  const shippingFee = Math.max(0, input.shippingFee ?? 0);

  // the merchant's own words only (the library tagline is not product truth)
  const { reading, keywords } = moodOf(input);
  // a garment filed under kids / traditional gets garment copy (cut, fabric, size), not toy or terroir copy
  const copyCat = copyCategory(parsedProduct.data.category, keywords);
  const hasWhatsapp = /^\+?[0-9]{8,15}$/.test(input.whatsapp?.replace(/[\s().-]/g, "") ?? "");
  let copy: PageCopy =
    input.copy?.[input.locale] ??
    libraryCopy({
      // the library reads the family from the catalog category and the product's words: a girl's
      // prayer abaya filed under kids gets modest-wear copy for prayer and for girls; no line
      // promises WhatsApp replies when the store has no number
      category: parsedProduct.data.category,
      keywords,
      locale: input.locale,
      market: input.market,
      seed,
      productName: parsedProduct.data.name,
      deliveryText: input.deliveryText,
      hasWhatsapp,
    });

  const story = parsedProduct.data;
  const product: PageDoc["product"] = {
    ...story,
    tagline: story.tagline || copy.tagline,
    description: story.description || (facts.length ? factsToDescription(facts) : undefined),
  };
  // the items (options as typed: the order form, rendered by every direction, shows their pickers)
  // and the offers: the wizard's verbatim, else suggested from the items' prices and group photos.
  // F2: nothing here adds a per-piece option the owner did not type
  let catalog: ReturnType<typeof directionCatalog>;
  try {
    catalog = directionCatalog(input, { currency, product, copy });
  } catch (e) {
    throw new GeneratorError(e instanceof CatalogInputError ? e.message : "The products or offers are invalid.");
  }
  const { items, bundles } = catalog;

  let theme = design ? design.compiled.theme : productTheme({ category: product.category, palette: input.palette, aiVibe: input.aiVibe, keywords, mood: reading.mood, archetype, seed, locale: input.locale });
  // the owner's "Look" for every direction, else the page's draw over the archetype's prior (§E.5, DES-§8.12 #8)
  const display =
    displayInput(input.display) ??
    (design ? drawOfferDisplay(archetype, bundles, seed, { grammar: design.genome.page.G2, ladder: design.genome.brand.G12 }) : pickOfferDisplay(archetype, bundles, seed));
  const offers: PageDoc["offers"] = {
    bundles,
    display,
    extras: [],
    showPerUnit: true,
    showSavings: "both",
    shippingFee,
    urgency: {},
  };

  const garment = isGarment(product.category, keywords);
  const ctx: PlanContext = {
    archetype,
    seed,
    category: product.category,
    hasCutout: !!product.cutout,
    imageCount: product.images.length,
    hasFacts: facts.length >= 2,
    hasWhatsapp,
    mood: reading.mood,
    storeName: hasRealStoreName(input.store),
    garment,
    ...(avoid ? { avoid } : {}),
  };

  // the engine's plan (DES-§5.5): order, variants, rhythm genes and fold, from the compiled genome
  let plan: DesignPlan | null = null;
  let skeletons: Record<string, string> | null = null;
  const formCounts = { offers: bundles.length, groups: (items[0]?.groups ?? []).filter((g) => g.kind !== "field").length, bump: false };
  if (design) {
    const photoFacts = photoFactsOf(input, product);
    plan = planDesign(ctx, design.genome, {
      directives: design.compiled.plan,
      locale: input.locale,
      has: {
        ownerProof: !!input.proof?.reviews,
        video: false,
        photos: product.images.length,
        endDate: false,
        whatsapp: hasWhatsapp,
        storeName: ctx.storeName === true,
        figures: Math.max(0, Math.floor(input.proof?.figures ?? 0)),
        beforeAfter: false,
        offers: bundles.length,
        facts: facts.length >= 2,
        garment,
      },
      photos: photoFacts,
      assets: product.images.map((img) => ({ id: img.id, width: input.photos?.find((p) => p.id === img.id)?.width ?? 0 })),
      cutout: product.cutout?.id ?? null,
      fonts: theme.fonts,
      picker: display.picker,
      form: formCounts,
      shares: input.shares ?? null,
      newHeroes: input.newHeroes !== false,
      ...(input.ownPages ? { own: input.ownPages } : {}),
    });
    // the look after the planners: the reveal scope (G35) and the fold's dmax (H28) are part of it
    theme = { ...theme, look: compileLook(plan.genome, { photos: photoFacts }) };
    // engine-only copy (DES-§9.12): composed from the merchant's facts over the library, never over AI copy
    if (!input.copy?.[input.locale]) {
      const engine = composeCopy(copy, {
        locale: input.locale,
        family: copyFamily({ category: parsedProduct.data.category, productName: parsedProduct.data.name, keywords }).family,
        ref: productRef(parsedProduct.data.name, input.locale),
        facts: { facts, productName: parsedProduct.data.name, price: (parsedProduct.data as { price?: number }).price ?? null, deliveryText: input.deliveryText ?? null },
        directives: design.compiled.copy,
        seed,
        ...(plan.fold.titleLines ? { titleLines: plan.fold.titleLines } : {}),
        avoid: new Set([...(design.copyAvoid ?? []), ...(input.ownSkeletons ?? [])]),
      });
      copy = engine.copy;
      skeletons = engine.skeletons;
    }
  }

  // sections: build data first, then lay out backgrounds/dividers over the ones that exist
  // section defaults are content too, written from the real product: the sections read a garment
  // from its name whatever the category (garmentOf), and a girl's abaya filed under kids keeps its
  // children's lines (size by age, "her prayer outfit"). A product the sections cannot read as a
  // garment still gets its copy family's defaults (fit and fabric sample lines, not toy ones).
  const sectionsReadGarment = garment && garmentOf(product) !== null;
  const basics: DocBasics = { locale: input.locale, product: copyCat === product.category || sectionsReadGarment ? product : { ...product, category: copyCat }, items, offers, theme };
  // a garment's detail callouts describe a garment (the section's family defaults may not), and the
  // promise lines only point to WhatsApp when the store has a number
  // the photo a garment's details are pinned on (a single figure rather than a group shot) and its
  // subject analysis, when the caller knows it; a cutout is what the showcase shows, pins stay generic
  const pinned = garment && !product.cutout ? garmentPhoto(product.images, input.photos) : null;
  const extras: CopyExtras = {
    facts,
    ...(garment ? { details: garmentDetails(input.locale, product.category, keywords, pinned?.focus ?? null) } : {}),
    whatsapp: hasWhatsapp,
    ...(reading.modest ? { bigWord: modestBigWord(input.locale, keywords) } : {}),
  };
  const order: { type: string; variant: string }[] = plan
    ? fullOrder(ctx, plan.inFlow.map((s) => s.type)).map((type) => ({ type, variant: plan.inFlow.find((s) => s.type === type)?.variant ?? plan.variants.get(type) ?? chooseVariant(type, ctx) }))
    : fullOrder(ctx, chooseOrder(ctx)).map((type) => ({ type, variant: chooseVariant(type, ctx) }));
  const formAt = order.findIndex((o) => o.type === "orderForm");
  const taken = new Set<string>();
  const chosen: { type: string; variant: string; id: string; data: Record<string, unknown> }[] = [];
  for (const [at, { type, variant }] of order.entries()) {
    const id = sectionId(type, taken);
    let data = sectionData(type, id, basics, copy, extras);
    // the details were pinned on another photo than the main one: the showcase shows that photo
    // (only while the pins are the generator's own — merchant facts carry no positions to match)
    if (data && type === "showcase" && pinned && pinned.ref.id !== product.images[0]?.id && facts.length < 2) data = { ...data, image: pinned.ref };
    if (data && plan) data = designData(type, data, plan, at < formAt);
    if (data) chosen.push({ type, variant, id, data });
    else taken.delete(id);
  }
  // one scrolling band in the page body
  const built = calmBands(chosen, ctx);
  // backgrounds judged on the theme's real colors; transitions left to the renderer ("auto")
  const moments = plan
    ? plan.genome.page.G24.moments.map((i) => built.findIndex((b) => b.type === plan!.inFlow[i]?.type)).filter((i) => i >= 0)
    : undefined;
  const finished = finishPlan(built, archetype, seed, themeTones(theme, input.locale), {
    mood: reading.mood,
    ...(plan && design ? { budget: momentBudget(design.genome, design.compiled.plan), moments, heights: { dens: design.compiled.plan.density.l, space: plan.genome.page.G21, form: formCounts } } : {}),
  });
  const planned: SectionInstance[] = built.map((b, i) => ({
    id: b.id,
    type: b.type,
    variant: b.variant,
    bg: finished[i]!.bg,
    divider: finished[i]!.divider,
    spacing: finished[i]!.spacing,
    hidden: false,
    // a fragment written flush against an emphasis ("و*ساترة*", "*X*:") shares its word box (glue.ts)
    data: glueDeep(b.data, input.locale),
  }));
  const sections = directSections(planned);

  // the generator never pairs the bold order form (cards on an accent slab) with a solid selection
  const formVariant = sections.find((s) => s.type === "orderForm" && !s.hidden)?.variant;

  const ogImage = product.images[0];
  const draft: PageDocInput = {
    v: 2,
    locale: input.locale,
    market: input.market,
    currency,
    product,
    items,
    offers: { ...offers, display: safeSelection(display, formVariant) },
    form: {
      city: input.market === "MA" ? "select" : "text",
      address: "required",
      note: "optional",
      email: "hidden",
      // INTL has no phone country: keep the schema default rather than an invalid code
      ...(/^[A-Z]{2}$/.test(market.phone.country) ? { phoneCountry: market.phone.country } : {}),
      title: glueEmphasis(copy.form.title, input.locale),
      submitLabel: copy.form.submit,
      reassurance: glueEmphasis(copy.form.reassurance, input.locale),
    },
    theme,
    sections,
    seo: {
      title: copy.seo.title,
      description: copy.seo.description,
      ...(ogImage ? { ogImage } : {}),
      noindex: false,
    },
    tracking: trackingOf(input.tracking),
    thankYou: { title: glueEmphasis(copy.thankYou.title, input.locale), message: glueEmphasis(copy.thankYou.message, input.locale), showTimeline: true },
  };

  const { doc, issues } = validateDoc(draft);
  if (!doc) throw new GeneratorError(issues[0]?.message ?? "The generated page is invalid.");
  if (!plan) return { doc, genome: null, plan: null, skeletons: null };
  // the genome's sections, now that the ids exist (the hero's arrangement for the distance view and H33)
  const flowSeq = doc.sections.filter((s) => !s.hidden && !["announcement", "header", "footer", "stickyCta", "whatsappFloat"].includes(s.type)).map((s) => `${s.type}:${s.variant}`);
  const genome: DesignGenome = {
    ...plan.genome,
    page: { ...plan.genome.page, G24: { ...plan.genome.page.G24, seq: flowSeq.slice(0, 40) } },
    sections: doc.sections.slice(0, 40).map((s) => ({ id: s.id, type: s.type, variant: s.variant, ...(s.type === "hero" && plan!.heroArrange ? { arrange: plan!.heroArrange } : {}) })),
  };
  return { doc, genome, plan, skeletons };
}

/**
 * The planned data of a section (DES-§5.8, §5.9, §5.13): the hero's composition fields; the opener where the section
 * schema has the field; the kicker string only where the opener is a kicker (the hero keeps its own, V30); the `cta`
 * toggle off outside the primary CTAs; a pre-form FAQ held to 3 questions (the Objection production). Every field is
 * written optional, without a default; prices, items and offers are never touched.
 */
function designData(type: string, data: Record<string, unknown>, plan: DesignPlan, beforeForm: boolean): Record<string, unknown> {
  const out = { ...data };
  if (type === "hero") {
    for (const [k, v] of Object.entries(plan.heroData)) if (accepts("hero", k)) out[k] = v;
    if (plan.fold.repairs.includes("kicker") && typeof out.kicker === "string") out.kicker = "";
    return out;
  }
  const at = plan.inFlow.filter((s) => s.type !== "hero").findIndex((s) => s.type === type);
  if (at >= 0) {
    const opener = plan.openers[at];
    if (opener && accepts(type, "opener")) out.opener = opener;
    if (opener && opener !== "kicker" && typeof out.kicker === "string") out.kicker = "";
  }
  if (plan.ctaOff.has(type) && typeof out.cta === "boolean") out.cta = false;
  if (type === "faq" && beforeForm && Array.isArray(out.items)) out.items = out.items.slice(0, 3);
  return out;
}

/**
 * The page's tracking from the wizard's answer: `{ kind: "none" }` → "No pixel on this page";
 * `{ kind: "ids", tracking }` → those pixels; a plain Tracking value (one release) → as is. Invalid
 * or empty → `{}` (no answer yet).
 */
function trackingOf(value: unknown): PageDoc["tracking"] {
  if (value === undefined || value === null || typeof value !== "object") return {};
  const v = value as { kind?: unknown; tracking?: unknown };
  if (v.kind === "none") return { none: true };
  const parsed = Tracking.safeParse(v.kind === "ids" ? v.tracking : value);
  if (!parsed.success) return {};
  // "No pixel" and pixels at once: the pixels win (the same repair as upgradeDoc)
  if (parsed.data.none && hasPixel(parsed.data)) {
    const { none, ...rest } = parsed.data;
    void none;
    return rest;
  }
  return parsed.data;
}

const hasPixel = (t: PageDoc["tracking"]) => [t.metaPixelId, t.tiktokPixelId, t.snapPixelId, t.ga4Id].some((ids) => (Array.isArray(ids) ? ids.length > 0 : !!ids));

/** Vibe words the ranking matched for an archetype ('AI vibe "luxury, heritage" +0.60'). */
const matchedVibes = (reason: string) =>
  (/AI vibe "([^"]+)"/.exec(reason)?.[1] ?? "")
    .split(",")
    .map((w) => w.trim())
    .filter(Boolean);

export interface RankedDirection {
  archetype: Archetype;
  score: number;
  /** the engine's explanation, plus the mood adjustment */
  reason: string;
}

/**
 * Archetypes for the product, best first: the theme engine's ranking (category, photo palette, AI
 * vibe and the product's own words) adjusted by the product's mood. A calm product only gets quiet
 * interpretations — the loud languages are left out, not just ranked lower (see mood.ts). Use it
 * for "other styles" too, so every proposal stays appropriate.
 */
export function rankDirections(input: Pick<GenerateInput, "product" | "palette" | "aiVibe" | "facts">): RankedDirection[] {
  const parsed = Product.safeParse(input.product);
  const category = parsed.success ? parsed.data.category : "other";
  const { reading, keywords } = moodOf(input);
  const out: (RankedDirection & { at: number })[] = [];
  rankArchetypes({ category, palette: input.palette, aiVibe: input.aiVibe ?? null, keywords: keywords || null }).forEach((r, at) => {
    const fit = moodFit(r.archetype, reading);
    if (fit === null) return;
    const reason = fit ? `${r.reason}; ${reading.mood} product${reading.modest ? " (modest)" : ""} ${fit > 0 ? "+" : ""}${fit.toFixed(2)}` : r.reason;
    out.push({ archetype: r.archetype, score: Math.round((r.score + fit) * 1000) / 1000, reason, at });
  });
  return out.sort((a, b) => b.score - a.score || a.at - b.at).map(({ archetype, score, reason }) => ({ archetype, score, reason }));
}

/** The run's seeds (DS5): the store's brand seed and the hash of the product's inputs. */
function runSeeds(input: GenerateInput): { brandSeed: string; inputHash: string } {
  return { brandSeed: input.brandSeed?.trim() || `seed:${input.seedBase}`, inputHash: input.inputHash?.trim() || inputHashOf(input) };
}

/**
 * The product's input hash (DES-§14.2 step 1, DS5): the wizard computes sha256(sorted asset ids, product name,
 * category, locale) with WebCrypto and passes it; without one, a 32-bit FNV hash of the same fields stands in, so the
 * product's facts still enter the rng (N6).
 */
export function inputHashOf(input: Pick<GenerateInput, "product" | "locale">): string {
  const parsed = Product.safeParse(input.product);
  const p = parsed.success ? parsed.data : null;
  const ids = [...(p?.images ?? []).map((i) => i.id), ...(p?.cutout ? [p.cutout.id] : [])].sort();
  return hash32([ids.join(","), p?.name ?? "", p?.category ?? "", input.locale].join("|")).toString(16).padStart(8, "0");
}

/**
 * What the sampler reads about the photos (DES-§4.4 PhotoFacts): the wizard's facts pass when given, else built from
 * the media library's sizes (`photos`), the cutout and the photo palette. An unknown width reads as 0 (no tight crop,
 * no full-bleed treatment is planned on it).
 */
export function photoFactsOf(input: Pick<GenerateInput, "photoFacts" | "photos" | "palette">, product: Pick<PageDoc["product"], "images" | "cutout">): PhotoFacts {
  if (input.photoFacts) return input.photoFacts;
  const widths = product.images.map((img) => input.photos?.find((p) => p.id === img.id)?.width ?? 0);
  const alpha = !!product.cutout || product.images.some((img) => input.photos?.find((p) => p.id === img.id)?.alpha === true);
  const top = input.palette?.colors[0];
  return {
    count: product.images.length,
    maxWidth: Math.max(0, ...widths),
    hasCutout: alpha,
    dominant: top?.hex ?? null,
    background: { luminance: top?.lightness ?? 0.8, uniform: !!input.palette?.background },
    sharp: true,
  };
}

/** One direction's sample input (DES-§4.4 SampleInput). */
function sampleInputOf(input: GenerateInput, archetype: Archetype, i: 0 | 1 | 2, attempt: number, ranked: RankedDirection[], mood: MoodReading): SampleInput {
  const parsed = Product.safeParse(input.product);
  const product = parsed.success ? parsed.data : { images: [], category: "other" as const, cutout: undefined };
  return {
    archetype,
    ...runSeeds(input),
    directionIndex: i,
    attempt,
    mood,
    locale: input.locale,
    market: input.market,
    photos: photoFactsOf(input, product),
    niche: input.niche ?? nicheKey(input.market, product.category),
    brand: input.brand ?? null,
    ranked,
    shares: input.shares ?? null,
    priorsV: PRIORS_VERSION,
  };
}

/**
 * The three directions' archetypes (DES-§4.3 G1, rev 3 QUAL-35; DES-§8.12 root cause 1): forced archetypes (admin
 * choice) lead; then direction 1 is the best fit of `rankDirections` (mood-filtered) after the anti-concentration factor
 * on the niche's archetype shares (H33 on G1, `vibeShares`), directions 2 and 3 are drawn — seeded by the brand seed and the input hash (DS5) — from the next five
 * by score + 0.02, distinct. The fixed top 3 is retired.
 */
export function pickArchetypes(
  input: Pick<GenerateInput, "product" | "palette" | "aiVibe" | "archetypes" | "facts" | "brandSeed" | "inputHash" | "seedBase" | "locale" | "vibeShares">,
): { archetype: Archetype; reason: string; match: DirectionMatch }[] {
  const ranked = rankDirections(input);
  const { reading } = moodOf(input);
  const moodWords = reading.mood === "calm" ? ["calm", ...(reading.modest ? ["modest"] : [])] : [];
  const entry = (archetype: Archetype, forced: boolean) => {
    const rank = ranked.findIndex((r) => r.archetype === archetype);
    const reason = ranked[rank]?.reason ?? "Chosen by you";
    const vibes = [...new Set([...matchedVibes(reason), ...moodWords])].slice(0, 3);
    return { archetype, reason, match: { rank: rank < 0 ? ranked.length : rank, vibes, forced } };
  };
  const forced = (input.archetypes ?? []).filter((a, i, all) => all.indexOf(a) === i).map((a) => entry(a, true));
  const out = forced.slice(0, 3);
  const rest = ranked.filter((r) => !out.some((o) => o.archetype === r.archetype));
  const seeds = runSeeds(input as GenerateInput);
  for (let k = 0; out.length < 3 && k < 3 && rest.length; k++) {
    const { archetype } = directionArchetype({ ranked: rest, ...seeds, directionIndex: k as 0 | 1 | 2, vibeShares: input.vibeShares ?? null });
    if (!out.some((o) => o.archetype === archetype)) out.push(entry(archetype, false));
  }
  // fewer than three drawn (a short mood-filtered ranking): the ranking's order fills
  for (const r of ranked) {
    if (out.length >= 3) break;
    if (!out.some((o) => o.archetype === r.archetype)) out.push(entry(r.archetype, false));
  }
  return out;
}

/** OKLab distance from which two accents read as two different color voices (plum vs mocha ≈ 0.07). */
const DISTINCT_ACCENT = 0.065;
/** Two directions of one run differ at least this much (DES-§14.2 step 3, hard by construction; DS25). */
export const DIRECTION_MIN_D = 0.25;
/** Attempts per direction (DES-§14.2 step 3: attempts 0-3). */
const ATTEMPTS = 4;

/**
 * Three art-directed directions (distinct archetypes), deterministic per (brand seed, input hash, inputs). Each
 * direction samples its genome (DES-§4.4), compiles it, plans the page (choreography, rhythm planners, fold) and builds
 * the document; an attempt whose distance to an earlier direction is < 0.25 is skipped for the next (≤ 4), the most
 * distant kept otherwise. Built in order: each one also steers away from the hero and section compositions before it.
 */
export function generateDirections(input: GenerateInput): Direction[] {
  const avoid = new Map<string, Set<string>>();
  const views: DistanceView[] = [];
  const accents: string[] = [];
  // the hero-title skeletons of the directions already built: two directions of one run never share it (DES-§9.5)
  const copyAvoid = new Set<string>();
  const ranked = rankDirections(input);
  const { reading, keywords } = moodOf(input);
  const parsed = Product.safeParse(input.product);
  const category = parsed.success ? parsed.data.category : "other";
  return pickArchetypes(input).map(({ archetype, reason, match }, i) => {
    let best: { built: BuiltDirection; seed: number; d: number; view: DistanceView | null; voice: number } | null = null;
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      const sin = sampleInputOf(input, archetype, i as 0 | 1 | 2, attempt, ranked, reading);
      let built: BuiltDirection;
      let seed: number;
      try {
        const genome = sampleGenome(sin, input.hints ? { hints: input.hints } : {});
        seed = genome.seed;
        const theme = productTheme({ category, palette: input.palette, aiVibe: input.aiVibe, keywords, mood: reading.mood, archetype, seed, locale: input.locale });
        const compiled = compileGenome(genome, { theme, locale: input.locale, mood: reading.mood, brand: input.brand ?? null, photos: sin.photos, numbers: (input.proof?.figures ?? 0) >= 2 });
        built = buildDirectionWithGenome(input, archetype, seed, avoid, { genome, compiled, copyAvoid });
      } catch (e) {
        // a locked brand colour the no-orange repair would move fails the candidate (H24): the next attempt
        if (e instanceof GenomeError) continue;
        throw e;
      }
      const view = distanceView(built.genome!, { theme: built.doc.theme }, input.locale);
      const d = views.length ? Math.min(...views.map((v) => genomeDistance(v, view))) : 1;
      // a calm product draws its accent from a few quiet partners: two directions in one accent read as one proposal
      const voice = reading.mood !== "calm" || accents.every((a) => colorDistance(a, built.doc.theme.palette.accent) >= DISTINCT_ACCENT) ? 1 : 0;
      if (!best || voice > best.voice || (voice === best.voice && d > best.d)) best = { built, seed, d, view, voice };
      if (d >= DIRECTION_MIN_D && voice) break;
    }
    if (!best) {
      // every attempt refused (locked colours): the archetype's plan without a look
      const seed = deriveSeed(hash32(`${runSeeds(input).brandSeed}|${runSeeds(input).inputHash}`), `direction:${i}:fallback`);
      best = { built: { doc: buildDirection(input, archetype, seed, avoid), genome: null, plan: null }, seed, d: 0, view: null, voice: 0 };
    }
    if (best.view) views.push(best.view);
    const heroSkeleton = best.built.skeletons?.["hero.headline"];
    if (heroSkeleton) copyAvoid.add(heroSkeleton);
    const doc = best.built.doc;
    accents.push(doc.theme.palette.accent);
    for (const s of doc.sections) {
      if (!SPREAD_TYPES.has(s.type)) continue;
      const used = avoid.get(s.type) ?? new Set<string>();
      used.add(s.variant);
      avoid.set(s.type, used);
    }
    const def = ARCHETYPE_DEFS[archetype];
    return { archetype, label: def.label, description: def.description, reason, match, seed: best.seed, doc, genome: best.built.genome, ...(best.built.skeletons ? { skeletons: best.built.skeletons } : {}) };
  });
}
