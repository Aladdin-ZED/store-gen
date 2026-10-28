/**
 * Generator self-test:  npx tsx src/lib/generator/selftest.ts
 *
 * For 20 product setups (categories × locales × markets × photo situations):
 *   - generateDirections returns 3 docs in 3 different archetypes that also differ in layout/look;
 *   - every doc passes validateDoc with ZERO issues and follows the page rhythm rules;
 *   - remixDoc (design / layout / copy / all) keeps content where it should and stays valid;
 *   - no generated theme carries orange (OKLCH hue 25°–75°, chroma > 0.06) — accent, pop, every
 *     color token the theme engine builds from them, status colors included, and every blend the
 *     landing CSS makes from them (tints, stages, highlighters, fade transitions, accent ↔ pop glows);
 *   - a garment without merchant facts never shows another product's data (no spec sheet, no
 *     dimension drawing or material board, garment detail callouts instead of the family defaults);
 *     an unknown store name gets no signed note / promise card or giant wordmark; a store without
 *     WhatsApp gets no "we answer on WhatsApp" promise lines;
 *   - a calm, modest product (a girl's beige lace prayer abaya, fr / ar / en) gets three different
 *     quiet directions: calm archetypes only, calm motion, light grounds, muted accents, pastel pops,
 *     no loud compositions, distinct accents — and its remixes stay calm;
 *   - the store identity defaults: no invented "My store", the product's short name stands in;
 *   - product options (a wizard draft: colors linked to photos + sizes) and the chosen ad pixels
 *     reach every direction unchanged, with the order form that shows the pickers and the first
 *     color's photo leading the page;
 *   - offers (docs/OFFERS.md §E.5, §H.1): every direction's offer layout follows its archetype's rule
 *     (picker, selection, density; never the bold order form with a solid selection, remixes
 *     included); suggestOffers on 1–8 items is honest (price below the pieces bought alone, falling
 *     with size, charm-rounded from the owner's prices, never a compare-at, free delivery off), ≤ 8,
 *     valid; duo pages get one / duo / trio, single items ×1 / ×2 / ×3, matrix products per-piece
 *     fills and a color pack; the wizard's items, offers, look and tracking answer reach every
 *     direction verbatim; presets, the admin offer sentence, remix titles;
 * plus library copy coverage and the AI copy guard. Exits 1 on any failure.
 */
import { libraryCopy, FAMILIES, familyOf } from "@/lib/ai/copy-library";
import { mergeAiCopy } from "@/lib/ai/guard";
import type { AiCopy } from "@/lib/ai/copy-schema";
import {
  PRODUCT_CATEGORIES,
  type Archetype,
  type Locale,
  type Market,
  type OfferDensity,
  type OfferPicker,
  type OfferSelection,
  type PageDoc,
  type ProductCategory,
} from "@/lib/page/schema";
import {
  cleanVariants,
  colorPalette,
  inferPreset,
  isOrangeHex,
  leadPhotoId,
  photoColorSuggestions,
  presetName,
  presetValues,
  relocalizeVariants,
  splitOptionText,
  swatchFor,
  type VariantGroup,
} from "@/lib/page/variant-presets";
import { expandUnits, groupPhotos, offerAvailable, offerSignature, offerUnits } from "@/lib/page/catalog";
import { fillStats, resolveDisplay } from "@/lib/page/display";
import { getFixture } from "@/lib/page/fixtures";
import { OFFER_PRESETS, ownPhoto, presetOffer, suggestOffers } from "@/lib/page/offer-presets";
import { offerContents, offerSentence } from "@/lib/page/offer-text";
import { bundleMath, offerMath } from "@/lib/page/pricing";
import { validateDoc } from "@/lib/page/validate";
import { createRenderContext, isRealStoreName, liveAssetResolver, PREVIEW_LINKS, shortProductName } from "@/landing/context";
import { getSection } from "@/landing/registry";
import { SETTINGS, StoreSettings } from "@/lib/settings/schemas";
import { CALM_ARCHETYPES, parseColor, toOklch, type ExtractedPalette } from "@/lib/theme";
import { buildDirection, generateDirections, readMood, remixDoc, suggestBundles, type Direction, type GenerateInput } from "./index";
import { offerTextsFor, pickOfferDisplay, safeSelection } from "./offers";
import { rngFor } from "./rng";
import { CALM_LIMITS, colorDistance, isOrange, orangeBlend, orangeMixes, orangeTokens, withoutOrange } from "./theme";
import { PageDocObject, ThemeSpec, type AssetRef } from "@/lib/page/schema";
import { themeTones } from "./tones";
import { glueDeep, glueEmphasis } from "./glue";

let failures = 0;
const fail = (msg: string) => {
  failures++;
  console.error(`  ✗ ${msg}`);
};
const check = (ok: boolean, msg: string) => {
  if (!ok) fail(msg);
};

const hex = (n: number) => n.toString(16).padStart(32, "0");
const ref = (n: number, alt = "") => ({ id: hex(n), alt });

function palette(hexes: [string, number, number, number, number][], extra: Partial<ExtractedPalette> = {}): ExtractedPalette {
  return {
    colors: hexes.map(([h, weight, chroma, lightness, hue]) => ({ hex: h, weight, chroma, lightness, hue })),
    background: "#f4f2ee",
    transparent: false,
    colorfulness: 0.4,
    brightness: 0.6,
    warmth: 0.1,
    ...extra,
  };
}

interface Setup {
  name: string;
  category: ProductCategory;
  locale: Locale;
  market: Market;
  price: number;
  images: number;
  cutout: boolean;
  palette: ExtractedPalette | null;
  facts: string[];
  aiVibe?: string;
  whatsapp?: string;
  shippingFee?: number;
}

const P = {
  argan: palette([["#c8902e", 0.5, 0.12, 0.66, 70], ["#5b3a1a", 0.2, 0.08, 0.33, 55]], { warmth: 0.5 }),
  blush: palette([["#e9b7b5", 0.6, 0.07, 0.8, 18], ["#a14d5a", 0.15, 0.12, 0.47, 8]], { brightness: 0.75 }),
  black: palette([["#1b1b1d", 0.7, 0.01, 0.18, 280]], { brightness: 0.15, colorfulness: 0.05 }),
  neon: palette([["#23d160", 0.4, 0.2, 0.75, 145], ["#1240ff", 0.3, 0.25, 0.45, 265]], { colorfulness: 0.8 }),
  white: palette([["#f3f3f1", 0.8, 0.005, 0.95, 90]], { brightness: 0.92, colorfulness: 0.03 }),
  olive: palette([["#6b7a3a", 0.5, 0.09, 0.52, 115]], { warmth: 0.2 }),
  red: palette([["#d4232f", 0.55, 0.21, 0.53, 25]], { colorfulness: 0.7 }),
};

const SETUPS: Setup[] = [
  { name: "argan oil ar", category: "skincare", locale: "ar", market: "MA", price: 199, images: 4, cutout: true, palette: P.argan, facts: ["زيت أركان معصور على البارد", "قارورة 30 مل", "بدون عطر مضاف"], aiVibe: "natural heritage" },
  { name: "serum fr", category: "beauty", locale: "fr", market: "MA", price: 249, images: 3, cutout: true, palette: P.blush, facts: ["Flacon 30 ml", "Texture légère"], whatsapp: "+212612345678" },
  { name: "perfume ar", category: "fragrance", locale: "ar", market: "MA", price: 349, images: 2, cutout: true, palette: P.black, facts: [], aiVibe: "luxury" },
  { name: "watch fr", category: "watches", locale: "fr", market: "MA", price: 599, images: 5, cutout: false, palette: P.black, facts: ["Bracelet acier", "Étanche 3 ATM", "Mouvement quartz"] },
  { name: "hair straightener en", category: "haircare", locale: "en", market: "MA", price: 299, images: 3, cutout: true, palette: P.red, facts: ["Ceramic plates", "Heats up in 60 seconds"] },
  { name: "dress fr", category: "fashion", locale: "fr", market: "MA", price: 279, images: 6, cutout: false, palette: P.blush, facts: ["Tailles S à XL", "Coton"], aiVibe: "minimal" },
  { name: "bag ar", category: "bags", locale: "ar", market: "MA", price: 229, images: 1, cutout: false, palette: P.argan, facts: [] },
  { name: "supplement fr", category: "supplements", locale: "fr", market: "MA", price: 189, images: 2, cutout: true, palette: P.olive, facts: ["60 gélules", "Cure d'un mois"], aiVibe: "clinical natural" },
  { name: "massage gun ar", category: "fitness", locale: "ar", market: "MA", price: 449, images: 3, cutout: true, palette: P.neon, facts: ["6 رؤوس", "بطارية قابلة للشحن"], aiVibe: "sport" },
  { name: "yoga mat en", category: "sport", locale: "en", market: "FR", price: 39.9, images: 2, cutout: false, palette: P.olive, facts: ["6 mm thick", "Non-slip"] },
  { name: "blender fr", category: "kitchen", locale: "fr", market: "MA", price: 349, images: 4, cutout: true, palette: P.white, facts: ["Bol 1,5 L", "6 lames inox"], shippingFee: 20 },
  { name: "cleaning ar", category: "cleaning", locale: "ar", market: "MA", price: 129, images: 2, cutout: false, palette: P.neon, facts: [] },
  { name: "lamp fr", category: "decor", locale: "fr", market: "BE", price: 59.9, images: 3, cutout: true, palette: P.argan, facts: ["Lumière chaude", "Rechargeable USB"] },
  { name: "toy ar", category: "toys", locale: "ar", market: "MA", price: 149, images: 3, cutout: true, palette: P.red, facts: ["من 3 سنوات"], aiVibe: "playful" },
  { name: "pet bed en", category: "pets", locale: "en", market: "MA", price: 259, images: 2, cutout: false, palette: P.blush, facts: ["Washable cover"] },
  { name: "earbuds fr", category: "tech", locale: "fr", market: "MA", price: 299, images: 4, cutout: true, palette: P.white, facts: ["Bluetooth 5.3", "Boîtier de charge"], aiVibe: "tech" },
  { name: "car vacuum ar", category: "car", locale: "ar", market: "MA", price: 249, images: 3, cutout: true, palette: P.black, facts: ["لاسلكي", "فلتر قابل للغسل"] },
  { name: "trimmer en", category: "grooming", locale: "en", market: "MA", price: 199, images: 2, cutout: true, palette: P.black, facts: [] },
  { name: "honey fr", category: "organic-food", locale: "fr", market: "MA", price: 179, images: 3, cutout: false, palette: P.argan, facts: ["Miel de thym", "Pot de 500 g"], aiVibe: "heritage natural" },
  { name: "unknown en", category: "other", locale: "en", market: "INTL", price: 9.5, images: 0, cutout: false, palette: null, facts: [] },
];

const STRONG = new Set(["accent", "dark", "pop"]);

function checkRhythm(doc: PageDoc, where: string) {
  const flow = doc.sections.filter((s) => {
    const cat = getSection(s.type)?.category;
    return cat !== "floating" && cat !== "top";
  });
  for (let i = 1; i < doc.sections.length; i++) {
    const a = doc.sections[i - 1]!;
    const b = doc.sections[i]!;
    if (getSection(b.type)?.category === "floating" || a.type === "header" || b.type === "header") continue;
    check(a.bg !== b.bg, `${where}: neighbors ${a.id} and ${b.id} share bg "${a.bg}"`);
  }
  const half = flow.slice(0, Math.ceil(flow.length / 2));
  check(half.some((s) => STRONG.has(s.bg)), `${where}: no color moment in the top half (${half.map((s) => `${s.type}:${s.bg}`).join(" ")})`);
  const formAt = flow.findIndex((s) => s.type === "orderForm");
  check(formAt >= 0 && formAt <= Math.ceil(flow.length * 0.55), `${where}: order form not near the top (index ${formAt} of ${flow.length})`);
  check(flow.at(-2)?.type === "cta" || flow.some((s) => s.type === "cta"), `${where}: no final CTA`);
  check(doc.sections.some((s) => s.type === "stickyCta"), `${where}: no sticky CTA`);
  for (const s of doc.sections) {
    if (s.divider !== "none" && s.divider !== "auto") {
      const prev = doc.sections[doc.sections.indexOf(s) - 1];
      check(!!prev && prev.bg !== s.bg, `${where}: divider "${s.divider}" on ${s.id} without a background change`);
    }
  }
  check(!doc.offers.urgency.countdownEnd, `${where}: a countdown was invented`);
  checkTones(doc, where);
}

const STRIP_TYPES = new Set(["trustBar", "marquee"]);

/** The rhythm judged on the theme's real colors (what the visitor sees), not on token names. */
function checkTones(doc: PageDoc, where: string) {
  const tones = themeTones(doc.theme, doc.locale);
  check(!!tones, `${where}: theme tones unavailable`);
  if (!tones) return;
  const flow = doc.sections.filter((s) => {
    const cat = getSection(s.type)?.category;
    return cat !== "floating" && cat !== "top";
  });
  for (let i = 1; i < flow.length; i++) {
    const a = flow[i - 1]!;
    const b = flow[i]!;
    check(tones.distinct(a.bg, b.bg), `${where}: ${a.id} (${a.bg}) and ${b.id} (${b.bg}) read as one field (ΔE ${tones.dist(a.bg, b.bg).toFixed(3)})`);
    const touching = tones.strong(a.bg) && tones.strong(b.bg) && b.type !== "footer";
    check(!touching || (STRIP_TYPES.has(b.type) && !STRIP_TYPES.has(a.type)), `${where}: color blocks ${a.id} (${a.bg}) and ${b.id} (${b.bg}) touch`);
  }
  const content = flow.filter((s) => !STRIP_TYPES.has(s.type) && s.type !== "footer");
  const pops = content.filter((s) => s.bg === "pop" && tones.strong("pop")).length;
  check(pops <= 1, `${where}: ${pops} pop-colored content blocks`);
  const anyStrong = (["accent", "dark", "pop"] as const).some((b) => tones.strong(b));
  if (anyStrong) {
    const half = flow.slice(0, Math.ceil(flow.length / 2));
    check(half.some((s) => tones.strong(s.bg) && !STRIP_TYPES.has(s.type)), `${where}: no real color moment in the top half (${half.map((s) => `${s.type}:${s.bg}`).join(" ")})`);
  }
}

/** Generation-time direction: promises said once, CTAs every other section at most. */
function checkDirection(doc: PageDoc, where: string) {
  const flow = doc.sections.filter((s) => {
    const cat = getSection(s.type)?.category;
    return cat !== "floating" && cat !== "top" && cat !== "bottom";
  });
  const heroAt = flow.findIndex((s) => s.type === "hero");
  if (heroAt >= 0 && flow.slice(heroAt + 1, heroAt + 3).some((s) => s.type === "trustBar")) {
    const trust = flow[heroAt]!.data.trust;
    check(!Array.isArray(trust) || trust.length === 0, `${where}: hero repeats the trust bar's promises`);
  }
  const moving = flow.filter((s) => s.type === "marquee" || ["socialProof:counter", "stats:ticker", "trustBar:ribbon"].includes(`${s.type}:${s.variant}`));
  check(moving.length <= 1, `${where}: ${moving.length} scrolling bands (${moving.map((s) => `${s.type}:${s.variant}`).join(", ")})`);
  const ctaOn = (s: PageDoc["sections"][number]) => s.data.cta === true || (typeof s.data.cta === "string" && s.data.cta.trim().length > 0);
  for (let i = 1; i < flow.length; i++) {
    check(!(ctaOn(flow[i - 1]!) && ctaOn(flow[i]!)), `${where}: order buttons in two sections in a row (${flow[i - 1]!.id}, ${flow[i]!.id})`);
  }
}

/** Owner rule: no orange in any generated theme (product colors and every token built from them). */
function checkNoOrange(doc: PageDoc, where: string) {
  const { accent, pop } = doc.theme.palette;
  check(!isOrange(accent), `${where}: orange accent ${accent}`);
  check(!isOrange(pop), `${where}: orange pop ${pop}`);
  const found = orangeTokens(doc.theme, doc.locale);
  check(found.product.length === 0, `${where}: ${found.product.length} orange token(s): ${found.product.slice(0, 3).join(" ")}`);
  check(found.status.length === 0, `${where}: orange status token(s): ${found.status.slice(0, 3).join(" ")}`);
  const blends = orangeMixes(doc.theme, doc.locale);
  check(blends.length === 0, `${where}: ${blends.length} orange blend(s): ${blends.slice(0, 2).join(" | ")}`);
}

/**
 * §E.5 — the offer layout each archetype gives (the spec's table, independent of offers.ts):
 * single-item pickers (70 / 30), image-led picker, selected style, density.
 */
const SPEC_LOOK: Record<Archetype, { single: OfferPicker[]; led: OfferPicker; selection: OfferSelection; density: OfferDensity }> = {
  maison: { single: ["tiers", "pills"], led: "visual", selection: "outline", density: "comfortable" },
  apothecary: { single: ["stack", "tiers"], led: "stack", selection: "soft", density: "comfortable" },
  souk: { single: ["ticket", "visual"], led: "visual", selection: "solid", density: "comfortable" },
  playground: { single: ["visual", "ticket"], led: "visual", selection: "soft", density: "comfortable" },
  kinetic: { single: ["tiers", "stack"], led: "visual", selection: "outline", density: "compact" },
  circuit: { single: ["tiers", "pills"], led: "stack", selection: "outline", density: "compact" },
  hearth: { single: ["stack", "visual"], led: "visual", selection: "soft", density: "comfortable" },
  bloom: { single: ["visual", "stack"], led: "visual", selection: "soft", density: "comfortable" },
  field: { single: ["stack", "visual"], led: "stack", selection: "soft", density: "comfortable" },
  editorial: { single: ["pills", "tiers"], led: "visual", selection: "outline", density: "comfortable" },
  garage: { single: ["ticket", "tiers"], led: "stack", selection: "outline", density: "compact" },
};

/** Image-led offer set (§E.5): an offer with 2+ distinct items, a choice line, or a custom visual. */
const imageLedSet = (offers: PageDoc["offers"]["bundles"]) =>
  offers.some((o) => o.visual.mode === "custom" || o.lines.some((l) => "choice" in l.pick) || new Set(o.lines.map((l) => ("item" in l.pick ? l.pick.item : ""))).size >= 2);

/** Never the bold order form (cards on an accent slab) with a solid selection (§E.3). */
function checkNoBoldSolid(doc: PageDoc, where: string) {
  const form = doc.sections.find((x) => x.type === "orderForm" && !x.hidden);
  check(!(form?.variant === "bold" && doc.offers.display.selection === "solid"), `${where}: bold order form with a solid selection`);
}

/** The generated offer layout follows the archetype rule of §E.5 (an owner's "Look" is checked by the caller). */
function checkOfferDisplay(doc: PageDoc, where: string) {
  const d = doc.offers.display;
  const look = SPEC_LOOK[doc.theme.archetype];
  const n = doc.offers.bundles.length;
  const led = imageLedSet(doc.offers.bundles);
  check(d.fill === "auto" && d.media === "auto", `${where}: offer fill/media ${d.fill}/${d.media} (generator leaves both "auto")`);
  if (n <= 1) check(d.picker === "stack", `${where}: one offer shown as ${d.picker}`);
  else if (n >= 5) check(led && n <= 6 ? d.picker === "visual" : d.picker === "stack" && d.density === "compact", `${where}: ${n} offers shown as ${d.picker}/${d.density}`);
  else check(led ? d.picker === look.led : look.single.includes(d.picker), `${where}: picker ${d.picker} for a ${led ? "image-led" : "single-item"} set (want ${led ? look.led : look.single.join(" / ")})`);
  check(d.picker !== "pills" || n <= 4, `${where}: segments with ${n} offers`);
  if (!(n >= 5 && !(led && n <= 6))) check(d.density === look.density, `${where}: density ${d.density}, want ${look.density}`);
  const form = doc.sections.find((x) => x.type === "orderForm" && !x.hidden);
  check(d.selection === (form?.variant === "bold" && look.selection === "solid" ? "soft" : look.selection), `${where}: selection ${d.selection}, want ${look.selection}${form?.variant === "bold" ? " (bold form)" : ""}`);
  checkNoBoldSolid(doc, where);
}

const signature = (doc: PageDoc) =>
  [doc.theme.archetype, doc.theme.fonts.display, ...doc.sections.map((s) => `${s.type}:${s.variant}:${s.bg}`)].join("|");

console.log("generator self-test");

/* 1 — directions for 20 products */
const t0 = Date.now();
let heroSpread = 0;
let moodSpread = 0;
for (const [n, s] of SETUPS.entries()) {
  const product = {
    name: s.name.replace(/ (ar|fr|en)$/, "").replace(/^./, (c) => c.toUpperCase()),
    category: s.category,
    price: s.price,
    images: Array.from({ length: s.images }, (_, i) => ref(n * 100 + i + 1, `photo ${i + 1}`)),
    ...(s.cutout ? { cutout: ref(n * 100 + 99, "cutout") } : {}),
  };
  let dirs;
  try {
    dirs = generateDirections({
      product,
      palette: s.palette,
      aiVibe: s.aiVibe ?? null,
      facts: s.facts,
      locale: s.locale,
      market: s.market,
      seedBase: 1000 + n,
      shippingFee: s.shippingFee,
      whatsapp: s.whatsapp ?? null,
    });
  } catch (e) {
    fail(`${s.name}: generateDirections threw ${String(e)}`);
    continue;
  }
  check(dirs.length === 3, `${s.name}: expected 3 directions, got ${dirs.length}`);
  check(new Set(dirs.map((d) => d.archetype)).size === dirs.length, `${s.name}: archetypes repeat (${dirs.map((d) => d.archetype)})`);
  check(new Set(dirs.map((d) => signature(d.doc))).size === dirs.length, `${s.name}: two directions look identical`);
  // composition, not only color: the three proposals should not share one hero layout
  const heroes = new Set(dirs.map((d) => d.doc.sections.find((x) => x.type === "hero")?.variant));
  check(heroes.size >= 2, `${s.name}: the three directions share one hero composition (${[...heroes].join(", ")})`);
  heroSpread += heroes.size;
  moodSpread += new Set(dirs.map((d) => d.doc.theme.palette.base)).size;
  // the page follows the live store number instead of pinning a copy of it
  check(dirs.every((d) => !d.doc.form.whatsapp), `${s.name}: the store WhatsApp number was pinned into the page`);
  if (s.whatsapp) check(dirs.every((d) => d.doc.sections.some((x) => x.type === "whatsappFloat")), `${s.name}: WhatsApp button missing`);
  for (const d of dirs) {
    const where = `${s.name}/${d.archetype}`;
    const { doc, issues } = validateDoc(d.doc);
    check(!!doc, `${where}: validateDoc returned null`);
    check(issues.length === 0, `${where}: ${issues.length} issue(s): ${issues.slice(0, 3).map((i) => `${i.path} ${i.message}`).join(" | ")}`);
    check(d.doc.locale === s.locale && d.doc.market === s.market, `${where}: locale/market changed`);
    check(d.doc.sections.length >= 12, `${where}: only ${d.doc.sections.length} sections`);
    checkRhythm(d.doc, where);
    checkDirection(d.doc, where);
    checkNoOrange(d.doc, where);
    checkOfferDisplay(d.doc, where);
    // bundles: genuine per-unit savings, popular ×2, best ×3
    const b = d.doc.offers.bundles;
    if (b.length === 3) {
      const m = b.map((x) => bundleMath(d.doc, x));
      check(m[1]!.perUnit < m[0]!.perUnit && m[2]!.perUnit < m[1]!.perUnit, `${where}: per-unit prices do not decrease (${b.map((x) => x.price)})`);
      check(b[1]!.badge === "popular" && b[2]!.badge === "best", `${where}: badges wrong`);
    }
    // remix scopes
    for (const scope of ["design", "layout", "copy", "all"] as const) {
      const r = remixDoc(d.doc, { seed: 7 + n, scope });
      const v = validateDoc(r);
      check(v.issues.length === 0, `${where}: remix ${scope} → ${v.issues.length} issue(s): ${v.issues.slice(0, 2).map((i) => i.message).join(" | ")}`);
      check(r.items[0]!.price === d.doc.items[0]!.price && r.offers.bundles.length === d.doc.offers.bundles.length, `${where}: remix ${scope} changed the offer`);
      const ids = (x: PageDoc) => x.sections.map((sec) => sec.id).sort().join(",");
      check(ids(r) === ids(d.doc), `${where}: remix ${scope} added/removed sections`);
      if (scope === "design") {
        check(r.theme.archetype === d.doc.theme.archetype, `${where}: design remix changed the archetype`);
        check(r.theme.palette.accent === d.doc.theme.palette.accent, `${where}: design remix changed the product color`);
        check(r.theme.seed !== d.doc.theme.seed, `${where}: design remix kept the seed`);
        check(JSON.stringify(r.sections.map((x) => x.data)) === JSON.stringify(d.doc.sections.map((x) => x.data)), `${where}: design remix changed content`);
      }
      if (scope === "layout") {
        check(JSON.stringify([...r.sections].sort((a, c) => a.id.localeCompare(c.id)).map((x) => x.data)) === JSON.stringify([...d.doc.sections].sort((a, c) => a.id.localeCompare(c.id)).map((x) => x.data)), `${where}: layout remix changed content`);
        check(r.sections[0]?.type === d.doc.sections[0]?.type && r.sections.at(-1)?.type === d.doc.sections.at(-1)?.type, `${where}: layout remix moved the page ends`);
      }
      if (scope !== "copy") checkRhythm(r, `${where}/remix-${scope}`);
      if (scope === "design" || scope === "all") checkNoOrange(r, `${where}/remix-${scope}`);
      checkNoBoldSolid(r, `${where}/remix-${scope}`);
      check(JSON.stringify(r.offers.bundles.map((o) => [o.id, o.price, o.lines])) === JSON.stringify(d.doc.offers.bundles.map((o) => [o.id, o.price, o.lines])), `${where}: remix ${scope} changed the offers' contents or prices`);
    }
  }
}
console.log(`  directions + remix: ${SETUPS.length} products in ${Date.now() - t0} ms`);
console.log(`  spread per product: ${(heroSpread / SETUPS.length).toFixed(2)} hero layouts, ${(moodSpread / SETUPS.length).toFixed(2)} page moods (of 3)`);

/* 2 — a calm, modest product: three quiet directions, never orange, never loud */
const BEIGE = palette(
  [["#e6d9c6", 0.55, 0.03, 0.88, 80], ["#c9b59a", 0.25, 0.045, 0.76, 75], ["#f4efe8", 0.12, 0.01, 0.95, 82]],
  { background: "#f7f4ef", colorfulness: 0.08, brightness: 0.82, warmth: 0.25 },
);
interface CalmSetup {
  name: string;
  product: string;
  category: ProductCategory;
  locale: Locale;
  facts: string[];
  palette: ExtractedPalette | null;
  aiVibe?: string;
}
const CALM_SETUPS: CalmSetup[] = [
  { name: "abaya fr", product: "Abaya de prière en dentelle beige pour fille", category: "kids", locale: "fr", facts: ["Dentelle douce", "Tailles 4 à 12 ans", "Voile assorti inclus"], palette: BEIGE, aiVibe: "cute playful" },
  { name: "abaya ar", product: "عباية صلاة بالدانتيل للبنات - بيج", category: "kids", locale: "ar", facts: ["دانتيل ناعم", "مقاسات من 4 إلى 12 سنة"], palette: BEIGE },
  { name: "abaya en", product: "Girls' lace prayer abaya", category: "fashion", locale: "en", facts: ["Soft lace trim", "Matching veil"], palette: BEIGE },
  { name: "abaya no photo", product: "Abaya de prière fille", category: "kids", locale: "fr", facts: [], palette: null },
  // the owner's test (2026-10-10): name only, no facts, no store settings (the wizard passes no store)
  { name: "abaya owner ar", product: "Abaya de prière avec Dentelle", category: "kids", locale: "ar", facts: [], palette: BEIGE },
];

/** Another product's hard data under a garment (the "style" family defaults are jewelry). */
const NOT_A_GARMENT = /316L|acier|steel|فولاذ|fermoir|clasp|قفل|chaîne|chain|سلسلة|écrin|gift box|علبة هدية|\b\d+ ?(g|غ)\b/i;
const WHATSAPP_PROMISE = /whats\s?app|واتساب/i;

/** A garment page without facts: no spec sheet, dimension drawing or material board, garment callouts. */
function checkGarment(doc: PageDoc, where: string) {
  check(!doc.sections.some((x) => x.type === "specs"), `${where}: a spec sheet without merchant facts`);
  const showcase = doc.sections.find((x) => x.type === "showcase");
  if (!showcase) return;
  check(!["dimensions", "ingredients"].includes(showcase.variant), `${where}: showcase:${showcase.variant} without merchant facts`);
  const points = (showcase.data.points as { label?: string; text?: string }[] | undefined) ?? [];
  const wrong = points.filter((p) => NOT_A_GARMENT.test(`${p.label ?? ""} ${p.text ?? ""}`));
  check(wrong.length === 0, `${where}: showcase callouts describe another product (${wrong.map((p) => p.label).join(", ")})`);
}

/** No promise line pointing to a WhatsApp the store does not have. */
function checkNoWhatsappPromise(doc: PageDoc, where: string) {
  const lines: string[] = [];
  for (const s of doc.sections) {
    if (s.type === "announcement") lines.push(...((s.data.items as { text?: string }[] | undefined) ?? []).map((i) => i.text ?? ""));
    if (s.type === "trustBar") lines.push(...((s.data.items as { title?: string }[] | undefined) ?? []).map((i) => i.title ?? ""));
    if (s.type === "guarantee") lines.push(...((s.data.promises as { text?: string }[] | undefined) ?? []).map((i) => i.text ?? ""));
  }
  const promised = lines.filter((l) => WHATSAPP_PROMISE.test(l));
  check(promised.length === 0, `${where}: WhatsApp promised without a number (${promised.join(" / ")})`);
}
/** Compositions a calm page never gets (scrolling word strips, posters, stickers, bold color forms). */
const LOUD_VARIANTS = new Set(["hero:poster", "hero:scrapbook", "hero:spec", "trustBar:ribbon", "orderForm:bold", "marquee:tape", "stats:ticker"]);
const chroma = (hex: string) => toOklch(parseColor(hex)!).c;
const lightness = (hex: string) => toOklch(parseColor(hex)!).l;

function checkCalm(doc: PageDoc, where: string) {
  const t = doc.theme;
  check((CALM_ARCHETYPES as readonly string[]).includes(t.archetype), `${where}: loud archetype ${t.archetype}`);
  check(t.motion === "calm", `${where}: motion ${t.motion}`);
  check(t.palette.base !== "dark", `${where}: dark page`);
  check(chroma(t.palette.accent) <= CALM_LIMITS.accentChroma + 0.005, `${where}: loud accent ${t.palette.accent} (C ${chroma(t.palette.accent).toFixed(3)})`);
  const popC = chroma(t.palette.pop);
  check(popC <= CALM_LIMITS.popChroma + 0.005 && (lightness(t.palette.pop) >= CALM_LIMITS.popMinL - 0.01 || popC <= 0.03), `${where}: loud pop ${t.palette.pop}`);
  check(t.ornament <= 0.7 + 1e-9, `${where}: ornament ${t.ornament}`);
  check(!t.dividers.some((d) => d === "diagonal" || d === "steps"), `${where}: angular transitions ${t.dividers.join(",")}`);
  const loud = doc.sections.filter((x) => LOUD_VARIANTS.has(`${x.type}:${x.variant}`) || x.type === "marquee");
  check(loud.length === 0, `${where}: loud compositions ${loud.map((x) => `${x.type}:${x.variant}`).join(", ")}`);
  const tones = themeTones(t, doc.locale);
  const flow = doc.sections.filter((x) => !["top", "floating"].includes(getSection(x.type)?.category ?? ""));
  const blocks = flow.filter((x) => x.type !== "footer" && (tones ? tones.strong(x.bg) : STRONG.has(x.bg)));
  check(blocks.length <= 2, `${where}: ${blocks.length} color blocks (${blocks.map((x) => `${x.type}:${x.bg}`).join(" ")})`);
  check(!doc.sections.some((x) => x.bg === "pop" && (tones ? tones.strong("pop") : true)), `${where}: a pop-colored block on a calm page`);
  const bar = doc.sections.find((x) => x.type === "announcement");
  check(!bar || (bar.bg !== "accent" && bar.bg !== "pop"), `${where}: announcement bar on ${bar?.bg}`);
}

let calmDirections = 0;
for (const [n, c] of CALM_SETUPS.entries()) {
  const product = { name: c.product, category: c.category, price: 249, images: [1, 2, 3, 4].map((i) => ref(9000 + n * 10 + i, c.product)) };
  const reading = readMood({ keywords: [c.product, ...c.facts].join(" "), category: c.category, palette: c.palette, aiVibe: c.aiVibe ?? null });
  check(reading.mood === "calm" && reading.modest, `${c.name}: read as ${reading.mood}${reading.modest ? " (modest)" : ""}`);
  // the owner's setup leaves the store out (unknown), like the wizard does
  const owner = c.name.startsWith("abaya owner");
  const input: GenerateInput = { product, palette: c.palette, aiVibe: c.aiVibe ?? null, facts: c.facts, locale: c.locale, market: "MA", seedBase: 4242 + n, ...(owner ? {} : { store: { name: "" } }) };
  let dirs: Direction[];
  try {
    dirs = generateDirections(input);
  } catch (e) {
    fail(`${c.name}: generateDirections threw ${String(e)}`);
    continue;
  }
  check(dirs.length === 3 && new Set(dirs.map((d) => d.archetype)).size === 3, `${c.name}: expected 3 different archetypes (${dirs.map((d) => d.archetype)})`);
  check(dirs.every((d) => d.match.vibes.includes("calm")), `${c.name}: the "why" line misses the calm reading`);
  const accents = dirs.map((d) => d.doc.theme.palette.accent);
  const pairs: [number, number][] = [[0, 1], [0, 2], [1, 2]];
  const distinctPairs = pairs.filter(([a, b]) => colorDistance(accents[a]!, accents[b]!) >= 0.065).length;
  check(distinctPairs >= 2, `${c.name}: the three directions share one accent (${accents.join(" ")})`);
  for (const d of dirs) {
    const where = `${c.name}/${d.archetype}`;
    calmDirections++;
    check(validateDoc(d.doc).issues.length === 0, `${where}: invalid doc`);
    checkCalm(d.doc, where);
    checkNoOrange(d.doc, where);
    checkRhythm(d.doc, where);
    // no real store name: no giant wordmark or signed note making a brand of the product name
    const branded = d.doc.sections.filter((x) => ["footer:big", "story:letter", "guarantee:letter"].includes(`${x.type}:${x.variant}`));
    check(branded.length === 0, `${where}: store-name compositions without a store name (${branded.map((x) => `${x.type}:${x.variant}`).join(", ")})`);
    if (c.facts.length < 2) checkGarment(d.doc, where);
    checkNoWhatsappPromise(d.doc, where);
    // no fragment left flush against an emphasis ("و*ساترة*" would wrap "و" alone at a line end)
    check(JSON.stringify(glueDeep(d.doc.sections, d.doc.locale)) === JSON.stringify(d.doc.sections), `${where}: a fragment glued to an emphasis stays outside it`);
    for (const scope of ["design", "all"] as const) {
      const r = remixDoc(d.doc, { seed: 31 + n, scope });
      checkCalm(r, `${where}/remix-${scope}`);
      checkNoOrange(r, `${where}/remix-${scope}`);
    }
  }
  // the admin forcing a loud language still gets a calm reading of it (colors, motion), never orange
  const forced = generateDirections({ ...input, archetypes: ["playground"] })[0]!;
  check(
    forced.archetype === "playground" && forced.doc.theme.motion === "calm" && chroma(forced.doc.theme.palette.accent) <= CALM_LIMITS.accentChroma + 0.005,
    `${c.name}: forced playground not calmed`,
  );
  checkNoOrange(forced.doc, `${c.name}/forced-playground`);
}
console.log(`  calm product: ${CALM_SETUPS.length} setups, ${calmDirections} directions`);

// the mood reader stays out of the way of loud and ordinary products
check(readMood({ keywords: "Pistolet de massage 6 têtes", category: "fitness", palette: P.neon, aiVibe: "sport" }).mood !== "calm", "mood: massage gun read as calm");
check(readMood({ keywords: "Jouet néon fun", category: "toys", palette: P.red }).mood === "lively", "mood: neon toy not lively");
check(readMood({ keywords: "Mixeur 1,5 L 6 lames inox", category: "kitchen", palette: P.white }).mood === "neutral", "mood: blender not neutral");
check(readMood({ keywords: "Body bébé en coton bio", category: "kids", palette: null }).mood === "calm", "mood: baby body not calm");

/* 2a — options and pixels from the wizard: Color (2, linked to photos) + Size (4), Meta + TikTok */
/** JSON with sorted keys: equal values whatever the key order (schemas re-order object keys) */
const stable = (v: unknown): string =>
  JSON.stringify(v, (_, x: unknown) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x));
{
  let checked = 0;
  for (const locale of ["ar", "fr", "en"] as const) {
    const colors = locale === "ar" ? ["أسود", "بيج"] : locale === "fr" ? ["Noir", "Beige"] : ["Black", "Beige"];
    const variants: VariantGroup[] = [
      {
        id: "g-color",
        name: presetName("color", locale),
        kind: "swatch",
        perUnit: true,
        display: "auto",
        options: colors.map((label, i) => ({ id: `o-c${i}`, label, swatch: swatchFor(label), image: ref(31 + i, label), soldOut: false })),
      },
      {
        id: "g-size",
        name: presetName("size", locale),
        kind: "text",
        perUnit: true,
        display: "auto",
        options: presetValues("size", locale)
          .slice(1, 5)
          .map((label, i) => ({ id: `o-s${i}`, label, soldOut: i === 3 })),
      },
    ];
    check(stable(cleanVariants(variants)) === stable(variants), `options/${locale}: a clean wizard draft changed in cleanVariants`);
    const lead = leadPhotoId(variants);
    // the wizard makes the first color's photo the main one: it leads the images
    const images = [ref(31), ref(32), ref(33)];
    const tracking = { metaPixelId: ["1234567890123456", "6543210987654321"], tiktokPixelId: ["C4ABCDEF12345678"] };
    const input: GenerateInput = {
      product: { name: locale === "ar" ? "عباية الصلاة بالدونتيل" : locale === "fr" ? "Abaya de prière en dentelle" : "Lace prayer abaya", price: 279, category: "fashion", images, variants },
      palette: P.black,
      facts: [],
      locale,
      market: "MA",
      seedBase: 4242,
      tracking,
    };
    for (const d of generateDirections(input)) {
      const where = `options/${locale}/${d.archetype}`;
      checked++;
      check(stable(d.doc.items[0]!.groups) === stable(variants), `${where}: the item's options changed`);
      check(d.doc.product.images[0]?.id === lead, `${where}: the first color's photo does not lead the page`);
      const hero = d.doc.sections.find((x) => x.type === "hero");
      const heroImage = (hero?.data.image as { id?: string } | undefined)?.id ?? d.doc.product.cutout?.id ?? d.doc.product.images[0]?.id;
      check(heroImage === lead, `${where}: hero shows ${heroImage}, not the first color's photo`);
      const form = d.doc.sections.filter((x) => x.type === "orderForm" && !x.hidden);
      check(form.length === 1, `${where}: ${form.length} visible order forms`);
      check(stable(d.doc.tracking) === stable(tracking), `${where}: tracking ${JSON.stringify(d.doc.tracking)}`);
      const { doc, issues } = validateDoc(d.doc);
      check(!!doc && stable(doc.items[0]!.groups) === stable(variants), `${where}: options lost in validateDoc`);
      check(!issues.some((i) => i.level === "error"), `${where}: invalid (${issues.find((i) => i.level === "error")?.message})`);
    }
  }
  // no pixels chosen → none; an invalid value → none (never a broken page)
  const base: GenerateInput = { product: { name: "Sac", price: 199, category: "bags", images: [ref(40)] }, palette: null, locale: "fr", market: "MA", seedBase: 9 };
  check(JSON.stringify(generateDirections(base)[0]!.doc.tracking) === "{}", "options: tracking invented without a choice");
  check(JSON.stringify(generateDirections({ ...base, tracking: { metaPixelId: "not-a-pixel" } })[0]!.doc.tracking) === "{}", "options: invalid tracking kept");
  console.log(`  options + pixels: ${checked} directions keep the wizard's options and pixels`);

  // presets and the color dictionary: no orange offered, typed names get their real swatch
  for (const l of ["ar", "fr", "en"] as const) check(colorPalette(l).every((c) => !isOrangeHex(c.hex)), `options/${l}: orange in the quick-add palette`);
  check(swatchFor("Orange") === "#e8772e" && swatchFor("برتقالي") === "#e8772e", "options: a typed orange lost its real swatch");
  check(swatchFor("الأسود") === swatchFor("Noir") && swatchFor("كحلي") === swatchFor("Bleu marine") && swatchFor("Noir mat") === swatchFor("Black"), "options: color names (ar / fr / en) not matched");
  const fromPhotos = photoColorSuggestions(
    [
      { id: "a", palette: { colors: [{ hex: "#b98a57", weight: 0.7 }, { hex: "#1b1b1d", weight: 0.25 }], background: null } },
      { id: "b", palette: { colors: [{ hex: "#e8772e", weight: 0.8 }], background: null } },
    ],
    "fr",
  );
  check(fromPhotos.length === 1 && fromPhotos[0]!.label === "Noir" && fromPhotos[0]!.photoId === "a", `options: photo suggestions ${JSON.stringify(fromPhotos)}`);
  check(splitOptionText("S, M ,L,,XL\nXXL، m").join("|") === "S|M|L|XL|XXL", "options: list splitting");
  check(inferPreset({ name: "Pointure", kind: "text", options: [] }) === "shoe" && inferPreset({ name: "x", kind: "swatch", options: [] }) === "color", "options: preset inference");
  const fr: VariantGroup[] = [
    { id: "g-c", name: "Couleur", kind: "swatch", perUnit: true, display: "auto", options: [{ id: "o-1", label: "Noir", swatch: "#141414", soldOut: false }, { id: "o-2", label: "Lavande pastel", soldOut: false }] },
    { id: "g-v", name: "Contenance", kind: "text", perUnit: false, display: "auto", options: [{ id: "o-3", label: "50 ml", soldOut: false }] },
    { id: "g-m", name: "Matière", kind: "text", perUnit: true, display: "auto", options: [{ id: "o-4", label: "Soie", soldOut: false }] },
  ];
  const ar = relocalizeVariants(fr, "fr", "ar");
  check(
    ar[0]!.name === "اللون" && ar[0]!.options[0]!.label === "أسود" && ar[0]!.options[1]!.label === "Lavande pastel" && ar[1]!.name === "الحجم" && ar[1]!.options[0]!.label === "50 مل" && ar[2] === fr[2],
    `options: fr → ar wording ${JSON.stringify(ar.map((g) => [g.name, g.options.map((o) => o.label)]))}`,
  );
  check(stable(relocalizeVariants(ar, "ar", "fr")) === stable(fr), "options: ar → fr does not come back");
}

/* 2b — orange the page blends: a crimson accent over a butter field crosses the band, the repair re-pairs it */
{
  check(orangeBlend("#c04558", "#ecdaa2") !== null, "blend: crimson × butter not seen as orange");
  check(orangeBlend("#5d2e45", "#efebe2") === null, "blend: plum × stone wrongly seen as orange");
  const hearth = ThemeSpec.parse({
    archetype: "hearth",
    seed: 988291824,
    palette: { accent: "#c04558", pop: "#a6c99f", base: "tinted", harmony: "warm-butter" },
    fonts: { display: "young-serif", body: "dm-sans", displayAr: "el-messiri", bodyAr: "tajawal" },
  });
  // the theme engine now neutralises a butter field under a red-side accent at the source (2026-10-10:
  // 0 of 23 760 hand-made specs blend orange); the generator's repair stays as the second guard — it
  // must leave a clean theme untouched and clean any theme that still blends
  const before = orangeMixes(hearth, "fr");
  const fixed = withoutOrange(hearth, "fr");
  check(orangeMixes(fixed, "fr").length === 0 && orangeTokens(fixed, "fr").product.length === 0, `blend: repair left ${orangeMixes(fixed, "fr").length} orange blend(s)`);
  check(before.length > 0 ? fixed !== hearth : fixed === hearth, before.length > 0 ? "blend: a blending theme came back unchanged" : "blend: withoutOrange changed a clean theme");
  console.log(
    `  orange blends: crimson-on-butter hearth ${hearth.palette.accent}/${hearth.palette.pop} → ${before.length ? `${before.length} blend(s), repaired to ${fixed.palette.accent}/${fixed.palette.pop}` : "clean at the source (theme engine), kept as is"}`,
  );
}

/* 2c — emphasis glue: a fragment written flush against an emphasis joins its word box */
{
  const g = (text: string, locale: Locale, want: string, msg: string) => {
    const got = glueEmphasis(text, locale);
    check(got === want, `glue: ${msg} (got ${JSON.stringify(got)})`);
  };
  g("ناعمة مثلها، و*ساترة* كما يجب.", "ar", "ناعمة مثلها، *وساترة* كما يجب.", "Arabic proclitic left outside the emphasis");
  g("رقّة الإطلالة *المحتشمة*: {product}.", "ar", "رقّة الإطلالة *المحتشمة:* {product}.", "colon left after the emphasis");
  g("رقّة *Abaya de prière*: {product}.", "ar", "رقّة *Abaya de prière*: {product}.", "punctuation moved into a Latin run on an Arabic page");
  g("و*Abaya* x", "ar", "و*Abaya* x", "an Arabic letter joined to a Latin word");
  g("Envie de l’*essayer* ?", "fr", "Envie de *l’essayer ?*", "French elision / high punctuation left outside");
  g("Un **gras** et *doux* ici", "fr", "Un **gras** et *doux* ici", "strong or spaced text changed");
}

/* 3 — template tells stay the exception */
{
  let faqs = 0;
  let accordions = 0;
  for (const [n, s] of SETUPS.entries()) {
    const dirs = generateDirections({
      product: { name: s.name, category: s.category, price: s.price, images: Array.from({ length: s.images }, (_, i) => ref(n * 100 + i + 1)) },
      palette: s.palette,
      facts: s.facts,
      locale: s.locale,
      market: s.market,
      seedBase: 7000 + n,
    });
    for (const d of dirs) {
      const faq = d.doc.sections.find((x) => x.type === "faq");
      if (!faq) continue;
      faqs++;
      if (faq.variant === "accordion") accordions++;
    }
  }
  check(accordions / Math.max(1, faqs) <= 0.4, `accordion FAQ in ${accordions} of ${faqs} pages (a template tell, should be the exception)`);
  console.log(`  template tells: accordion FAQ in ${accordions}/${faqs} pages`);
}

/* 4 — store identity: never an invented "My store" */
{
  const store = StoreSettings.parse(SETTINGS.store.defaults());
  check(store.storeName === "", `settings: store name defaults to "${store.storeName}"`);
  check(!StoreSettings.safeParse({ storeName: "" }).success, "settings: an empty store name can be saved");
  check(StoreSettings.safeParse({ storeName: "Argania" }).success, "settings: a real store name is refused");
  check(!isRealStoreName("My store") && !isRealStoreName("متجري") && !isRealStoreName("") && isRealStoreName("Argania"), "store: placeholder names not recognized");
  const shorts: [string, string][] = [
    ["Abaya de prière en dentelle beige pour fille", "Abaya de prière"],
    ["Sérum Argan Bio 30 ml", "Sérum Argan Bio"],
    ["Girls' lace prayer abaya — beige", "Girls' lace prayer"],
    ["Montre N°5 | acier", "Montre N°5"],
    ["عباية صلاة بالدانتيل للبنات - بيج", "عباية صلاة بالدانتيل"],
    ["Trimmer", "Trimmer"],
  ];
  for (const [full, want] of shorts) check(shortProductName(full) === want, `shortProductName("${full}") = "${shortProductName(full)}", want "${want}"`);
  const doc = generateDirections({ product: { name: "Abaya de prière en dentelle", category: "kids", price: 249 }, palette: BEIGE, locale: "fr", market: "MA", seedBase: 1 })[0]!.doc;
  const name = (storeName: string) =>
    createRenderContext(doc, { mode: "preview", assets: liveAssetResolver([]), base: "/", now: "2026-10-10T10:00:00.000Z", pageKey: "selftest", store: { name: storeName }, links: PREVIEW_LINKS }).store.name;
  check(name("") === "Abaya de prière", `store fallback: "${name("")}" for an unnamed store`);
  check(name("My store") === "Abaya de prière", `store fallback: placeholder "My store" shown as "${name("My store")}"`);
  check(name("Argania") === "Argania", `store: real name replaced by "${name("Argania")}"`);
  console.log("  store identity: defaults and fallback");
}

/* 5 — library copy: every family × locale × a few seeds is a valid PageCopy */
let libCount = 0;
for (const cat of PRODUCT_CATEGORIES) {
  for (const locale of ["ar", "fr", "en"] as const) {
    for (const seed of [1, 2, 3]) {
      try {
        const c = libraryCopy({ category: cat, locale, seed, productName: "Produit d'essai très long avec un nom interminable pour tester", market: "MA" });
        libCount++;
        check(c.faq.items.length >= 5, `library ${cat}/${locale}: FAQ too short`);
        check(!/\{(product|delivery|where)\}/.test(JSON.stringify(c)), `library ${cat}/${locale}: unfilled slot`);
        const bangs = (JSON.stringify(c).match(/!/g) ?? []).length;
        check(bangs === 0, `library ${cat}/${locale}: ${bangs} exclamation marks`);
      } catch (e) {
        fail(`library ${cat}/${locale}/${seed}: ${String(e).slice(0, 200)}`);
      }
    }
  }
}
check(new Set(PRODUCT_CATEGORIES.map(familyOf)).size === FAMILIES.length, "some families are never used");
console.log(`  library copy: ${libCount} combinations`);

/* 6 — offers (docs/OFFERS.md §E.5, §H.1) */
{
  const T = { fr: offerTextsFor("fr"), ar: offerTextsFor("ar"), en: offerTextsFor("en") };
  const base = getFixture("duo", { locale: "fr" }).doc;
  type Items = PageDoc["items"];
  type Offers = PageDoc["offers"]["bundles"];
  /** a full page around items + offers (the duo fixture's sections, theme, form) */
  const { orderBump: _bump, upsell: _upsell, ...plainOffers } = base.offers;
  void _bump;
  void _upsell;
  const pageOf = (items: Items, bundles: Offers, extra: Partial<PageDoc> = {}): PageDoc => ({ ...base, ...extra, items, offers: { ...plainOffers, extras: [], bundles } });
  /** no-break spaces (Intl money) read as plain spaces */
  const plain = (t: string) => t.replace(/[  ]/g, " ");
  /** MAD: whole, ending in 9 · decimal currencies: x.90, or whole ending in 9 (99, 119) */
  const charming = (p: number, currency: string) => (Number.isInteger(p) ? p % 10 === 9 : currency !== "MAD" && Math.abs(p * 100 - Math.round(p) * 100 + 10) < 1e-6);
  const sameItemOf = (o: Offers[number]) => {
    const ids = new Set(o.lines.map((l) => ("item" in l.pick ? l.pick.item : "")));
    return ids.size === 1 && !ids.has("") ? [...ids][0]! : null;
  };

  /** The invariants of every suggestion set (§H.1, §I.5). */
  function checkSuggestions(doc: PageDoc, offers: Offers, where: string) {
    check(offers.length >= 1 && offers.length <= 8, `${where}: ${offers.length} offers`);
    check(new Set(offers.map((o) => o.id)).size === offers.length, `${where}: duplicate offer ids`);
    check(offers.filter((o) => o.badge === "popular").length <= 1 && offers.filter((o) => o.badge === "best").length <= 1, `${where}: badges repeat`);
    const page = pageOf(doc.items, offers, { currency: doc.currency, product: doc.product });
    const parsed = PageDocObject.safeParse(page);
    check(parsed.success, `${where}: invalid doc (${parsed.success ? "" : parsed.error.issues[0]?.message} at ${parsed.success ? "" : parsed.error.issues[0]?.path.join(".")})`);
    const v = validateDoc(page);
    check(!!v.doc && !v.issues.some((i) => i.level === "error"), `${where}: validateDoc error ${v.issues.find((i) => i.level === "error")?.message}`);
    check(new Set(offers.map((o) => offerSignature(o))).size === offers.length, `${where}: two offers with the same contents`);
    const byId = new Map(doc.items.map((it) => [it.id, it]));
    const assetIds = new Set(doc.items.flatMap((it) => [...it.images.map((r) => r.id), ...(it.cutout ? [it.cutout.id] : [])]));
    const groupIds = new Set(groupPhotos(doc).map((g) => g.asset.id));
    const families = new Map<string, { units: number; ratio: number; id: string }[]>();
    for (const o of offers) {
      const m = offerMath(page, o);
      const units = offerUnits(o);
      check(o.freeShipping === false, `${where}/${o.id}: free delivery set (D10: it follows the page fee)`);
      check(o.compareAt === undefined, `${where}/${o.id}: a compare-at price was invented`);
      check(o.price > 0, `${where}/${o.id}: price ${o.price}`);
      if (units >= 2) check(m.price < m.reference, `${where}/${o.id}: ${o.price} is not below its pieces bought alone (${m.reference / 100})`);
      else check(doc.items.some((it) => it.price === o.price), `${where}/${o.id}: single piece at ${o.price}, not an item price`);
      if (units >= 2) check(charming(o.price, doc.currency), `${where}/${o.id}: ${o.price} ${doc.currency} is not charm-rounded`);
      for (const l of o.lines) {
        if ("choice" in l.pick) {
          check(l.pick.choice.every((id) => { const it = byId.get(id); return !!it && !!ownPhoto(doc, it); }), `${where}/${o.id}: a choice item has no photo of its own (blocks publishing)`);
          const prices = new Set(l.pick.choice.map((id) => byId.get(id)?.price));
          check(prices.size === 1 ? l.pick.surcharge === "none" : l.pick.surcharge === "difference", `${where}/${o.id}: choice surcharge ${l.pick.surcharge} for prices ${[...prices].join("/")}`);
        }
      }
      if (o.visual.mode === "custom") {
        check(o.visual.images.every((r) => assetIds.has(r.id)), `${where}/${o.id}: custom visual uses a photo of no item`);
        check(o.visual.images.every((r) => !groupIds.has(r.id) || !r.box), `${where}/${o.id}: a group photo is cropped in the visual`);
      }
      const fam = sameItemOf(o) ? `item:${sameItemOf(o)}` : "mix";
      families.set(fam, [...(families.get(fam) ?? []), { units, ratio: m.price / Math.max(1, m.reference), id: o.id }]);
    }
    // the bigger the pack, the lower its price relative to its pieces bought alone (per piece, for same-item packs)
    for (const [fam, list] of families) {
      for (const a of list) for (const b of list) if (a.units < b.units) check(b.ratio < a.ratio - 1e-9, `${where}: ${b.id} (${b.units} pieces) is not cheaper relative to its pieces than ${a.id} (${a.units}) in ${fam}`);
    }
  }

  // 6a — single items: ×1 / ×2 popular / ×3 best at today's numbers (+ the v1 alias)
  for (const [price, currency] of [[99, "MAD"], [149, "MAD"], [199, "MAD"], [249, "MAD"], [299, "MAD"], [1299, "MAD"], [29.9, "EUR"], [59.9, "EUR"], [3, "MAD"]] as const) {
    const items: Items = [{ id: "main", name: "", images: [ref(500)], price, groups: [], soldOut: false }];
    const b = suggestOffers({ items, currency, product: base.product }, T.fr);
    const legacy = suggestBundles(price, currency, []);
    check(stable(legacy.map((o) => [o.id, o.price, o.lines])) === stable(b.map((o) => [o.id, o.price, o.lines])), `offers ${price} ${currency}: the v1 alias suggestBundles differs`);
    if (price < 5) {
      check(b.length === 1, `offers ${price}: expected a single pack`);
      continue;
    }
    check(b.map((o) => offerSignature(o)).join(" ") === "main×1 main×2 main×3", `offers ${price} ${currency}: ${b.map((o) => offerSignature(o)).join(" ")}`);
    check(b[1]?.badge === "popular" && b[2]?.badge === "best" && b[0]?.title === T.fr.packs[0]?.title, `offers ${price}: badges / titles`);
    checkSuggestions(pageOf(items, b, { currency }), b, `offers ${price} ${currency}`);
    console.log(`  offers ${price} ${currency}: ${b.map((x) => x.price).join(" / ")}`);
  }

  // 6b — the owner's duo page (§C.5): one cream of two (crops), the duo on its group photo, the trio
  for (const locale of ["fr", "ar", "en"] as const) {
    const doc = getFixture("duo", { locale }).doc;
    const o = suggestOffers(doc, T[locale]);
    const where = `duo/${locale}`;
    check(o.map((x) => offerSignature(x)).join(" ") === "[main|nuit]×1 main×1+nuit×1 main×1+nuit×1+serum×1", `${where}: ${o.map((x) => offerSignature(x)).join(" ")}`);
    const [one, duo, trio] = o;
    const pair = doc.items[0]!.images.find((r) => !r.box)!.id;
    const serum = doc.items[2]!.images[0]!.id;
    check(one?.price === 149 && one.badge === "none" && one.title === T[locale].choice.title, `${where}: "Au choix" ${one?.price} ${one?.title}`);
    check(duo?.price === 249 && duo.badge === "popular" && duo.visual.mode === "custom" && duo.visual.images.map((r) => r.id).join() === pair, `${where}: duo ${duo?.price} ${JSON.stringify(duo?.visual)}`);
    check(trio?.badge === "best" && trio.visual.mode === "custom" && trio.visual.images.map((r) => r.id).join() === `${pair},${serum}`, `${where}: trio visual ${JSON.stringify(trio?.visual)}`);
    checkSuggestions(doc, o, where);
    const display = pickOfferDisplay("bloom", o, 1);
    check(display.picker === "visual", `${where}: an image-led set shown as ${display.picker} on bloom`);
    if (locale === "fr") console.log(`  duo page: ${o.map((x) => `${x.title} ${x.price}`).join(" · ")}`);
  }

  // 6c — seeded catalogs: 1–8 items, prices close or apart, own photos, crops, group photos, colors, matrix, sold out
  const PRICES: Record<string, number[]> = { MAD: [49, 99, 129, 149, 155, 159, 199, 249, 299, 449, 999], EUR: [9.9, 19.9, 24.9, 29.9, 39.9, 59.9] };
  const COLORS = ["Noir", "Blanc", "Gris", "Bleu marine", "Beige"];
  let catalogs = 0;
  const shapes = new Map<string, number>();
  for (let n = 0; n < 240; n++) {
    const r = rngFor(9100 + n, "catalog");
    const currency = r() < 0.8 ? "MAD" : "EUR";
    const count = 1 + Math.floor(r() * 8);
    const group = r() < 0.5 ? ref(7000 + n * 20) : null;
    const items: Items = Array.from({ length: count }, (_, k) => {
      const images: AssetRef[] = [];
      if (group && k < 3 && r() < 0.7) images.push(r() < 0.5 ? { ...group, box: { x: 0.05 + 0.3 * (k % 3), y: 0.1, w: 0.3, h: 0.8 } } : group);
      if (r() < 0.75) images.push(ref(7001 + n * 20 + k));
      const groups: Items[number]["groups"] = [];
      const roll = r();
      if (roll < 0.25) {
        const nc = 2 + Math.floor(r() * 4);
        groups.push({ id: "g-col", name: "Couleur", kind: "swatch", perUnit: true, display: "auto", options: COLORS.slice(0, nc).map((label, i) => ({ id: `o-${i}`, label, swatch: swatchFor(label) ?? "#141414", soldOut: i === 1 && r() < 0.3 })) });
      } else if (roll < 0.4) {
        groups.push({
          id: "g-fit",
          name: "Couleur & taille",
          kind: "matrix",
          perUnit: true,
          display: "auto",
          dims: [
            { id: "d-col", name: "Couleur", kind: "swatch", values: COLORS.slice(0, 3).map((label, i) => ({ id: `o-c${i}`, label, soldOut: false })) },
            { id: "d-size", name: "Taille", kind: "text", values: ["S", "M", "L"].map((label, i) => ({ id: `o-s${i}`, label, soldOut: false, ...(i === 2 ? { delta: 20 } : {}) })) },
          ],
          cells: r() < 0.5 ? [{ v: { "d-col": "o-c0" }, state: "out" }] : [],
        });
      }
      const prices = PRICES[currency]!;
      return { id: k === 0 ? "main" : `item-${k}`, name: count > 1 ? `Produit ${k + 1}` : "", images, price: prices[Math.floor(r() * prices.length)]!, groups, soldOut: count > 2 && r() < 0.06 };
    });
    const doc = pageOf(items, base.offers.bundles, { currency });
    const offers = suggestOffers(doc, T.fr, { rules: true });
    catalogs++;
    const shape = `${count} item${count > 1 ? "s" : ""}: ${offers.length} offers`;
    shapes.set(shape, (shapes.get(shape) ?? 0) + 1);
    checkSuggestions(doc, offers, `catalog ${n} (${count} items, ${currency})`);
    // every offer can be ordered as suggested, and matrix / per-piece options stay to fill per piece
    const page = pageOf(items, offers, { currency });
    check(offers.every((o) => offerAvailable(o, items)) || items.every((it) => it.soldOut), `catalog ${n}: an unavailable offer suggested`);
    if (count === 1) check(offers[0]?.id === "x1", `catalog ${n}: single item without ×1`);
    const sold = new Set(offers.flatMap((o) => o.lines.flatMap((l) => ("item" in l.pick ? [l.pick.item] : l.pick.choice))));
    if (items.some((it) => sold.has(it.id) && it.groups.length && !it.soldOut)) check(resolveDisplay(page, { archetype: "bloom", formVariant: "card" }).fill !== "none", `catalog ${n}: options to fill but no personalize step`);
  }
  console.log(`  offers: ${catalogs} seeded catalogs honest and valid (${[...shapes.entries()].sort().slice(0, 6).map(([k, v]) => `${k} ×${v}`).join(", ")}…)`);

  // 6d — two items: close prices → "Au choix" + "Duo"; apart → each alone + "Duo"; no own photos → each alone
  {
    const it = (id: string, price: number, images: AssetRef[]): Items[number] => ({ id, name: id === "main" ? "Huile" : "Savon", images, price, groups: [], soldOut: false });
    const shot = ref(810);
    const close = [it("main", 149, [ref(811), shot]), it("savon", 159, [ref(812), shot])];
    const c = suggestOffers(pageOf(close, base.offers.bundles), T.fr);
    check(c.map((o) => offerSignature(o)).join(" ") === "[main|savon;difference]×1 main×1+savon×1", `two close: ${c.map((o) => offerSignature(o)).join(" ")}`);
    check(c[1]?.visual.mode === "custom" && c[1].visual.images[0]?.id === shot.id && c[1].badge === "popular", "two close: the duo is not on their group photo");
    checkSuggestions(pageOf(close, c), c, "two close");
    const apart = [it("main", 99, [ref(813)]), it("savon", 249, [ref(814)])];
    const a = suggestOffers(pageOf(apart, base.offers.bundles), T.fr);
    check(a.map((o) => offerSignature(o)).join(" ") === "main×1 savon×1 main×1+savon×1" && a[0]?.title === "Huile" && a[1]?.title === "Savon", `two apart: ${a.map((o) => `${offerSignature(o)} ${o.title}`).join(" | ")}`);
    check(a[2]!.price > 249 && a[2]!.price < 348, `two apart: duo ${a[2]?.price} not between the priciest alone and both alone`);
    const noOwn = [it("main", 149, [shot]), it("savon", 149, [shot])];
    const no = suggestOffers(pageOf(noOwn, base.offers.bundles), T.fr);
    check(no.every((o) => o.lines.every((l) => "item" in l.pick)), "two without own photos: a choice line (it would block publishing)");
  }

  // 6e — 4–8 items: "Au choix" · "2 au choix" · "3 au choix" · "Coffret complet" (≤ 6 items)
  for (const count of [4, 6, 7]) {
    const items: Items = Array.from({ length: count }, (_, k) => ({ id: k ? `p-${k}` : "main", name: `Parfum ${k + 1}`, images: [ref(820 + k)], price: 199 + (k % 2) * 50, groups: [], soldOut: false }));
    const o = suggestOffers(pageOf(items, base.offers.bundles), T.fr);
    const want = count <= 6 ? ["one", "any2", "any3", "set"] : ["one", "any2", "any3"];
    check(o.map((x) => x.id).join() === want.join(), `${count} items: ${o.map((x) => x.id).join()}`);
    check(o.find((x) => x.id === "any2")?.badge === "popular" && (count > 6 || o.find((x) => x.id === "set")?.badge === "best"), `${count} items: badges`);
    checkSuggestions(pageOf(items, o), o, `${count} items`);
  }

  // 6f — matrix (color × size): ×1 / ×2 / ×3 + "Pack 3 couleurs", every piece filled on its own
  for (const name of ["tshirt", "colors"] as const) {
    const doc = getFixture(name).doc;
    const o = suggestOffers(doc, T[doc.locale as "fr" | "ar"], { rules: true });
    const page = pageOf(doc.items, o, { locale: doc.locale, currency: doc.currency, product: doc.product });
    check(o.map((x) => x.id).join() === "x1,x2,x3,colors", `${name}: ${o.map((x) => x.id).join()}`);
    const colors = o.find((x) => x.id === "colors");
    const locks = colors?.lines.map((l) => Object.values(l.rules ?? {})[0]).map((r) => (r && "lock" in r ? r.lock : "")) ?? [];
    check(locks.join() === "o-noir,o-blanc,o-gris" && colors?.price === o.find((x) => x.id === "x3")?.price, `${name}: color pack ${locks.join()} at ${colors?.price}`);
    check(colors?.short === T[doc.locale as "fr" | "ar"].colors.short?.replace("{n}", "3"), `${name}: color pack segment label "${colors?.short}" (would read ×3 twice)`);
    const stats = fillStats(page);
    const resolved = resolveDisplay(page, { archetype: doc.theme.archetype, formVariant: "card" });
    check(stats.units === 3 && resolved.fill !== "none", `${name}: per-piece fill (${stats.units} pieces to fill, fill ${resolved.fill})`);
    check(expandUnits(colors!, doc.items).every((u) => u.rules && Object.keys(u.rules).length === 1), `${name}: color pack pieces lost their color`);
    checkSuggestions(page, o, name);
    const off = suggestOffers(doc, T.fr, { rules: false });
    check(off.map((x) => x.id).join() === "x1,x2,x3", `${name}: color pack without the RULES switch`);
  }
  {
    // a color choice group of 3+ colors (no matrix) → the pack locks the group itself
    const items: Items = [{ id: "main", name: "", images: [ref(830)], price: 179, soldOut: false, groups: [{ id: "g-color", name: "Couleur", kind: "swatch", perUnit: true, display: "auto", options: ["Noir", "Beige", "Gris", "Blanc"].map((label, i) => ({ id: `o-${i}`, label, soldOut: i === 0 })) }] }];
    const o = suggestOffers(pageOf(items, base.offers.bundles), T.fr, { rules: true });
    const colors = o.find((x) => x.id === "colors");
    check(!!colors && colors.lines.map((l) => JSON.stringify(l.rules)).join() === ['{"g-color":{"lock":"o-1"}}', '{"g-color":{"lock":"o-2"}}', '{"g-color":{"lock":"o-3"}}'].join(), `choice colors: ${JSON.stringify(colors?.lines.map((l) => l.rules))}`);
  }

  // 6g — presets: valid, honest, priced from the items
  for (const name of ["duo", "tshirt"] as const) {
    const doc = getFixture(name).doc;
    for (const p of OFFER_PRESETS) {
      const o = presetOffer(p, doc, { texts: T.fr });
      const page = { ...doc, offers: { ...doc.offers, bundles: [...doc.offers.bundles, o].slice(-8) } };
      const where = `preset ${p} on ${name}`;
      check(!doc.offers.bundles.some((b) => b.id === o.id), `${where}: id ${o.id} taken`);
      check(PageDocObject.safeParse(page).success, `${where}: invalid doc`);
      check(o.freeShipping === false && o.compareAt === undefined, `${where}: free delivery or compare-at set`);
      const m = offerMath(page, o);
      const giftOnly = o.lines.some((l) => l.free) && m.price >= m.reference;
      if (offerUnits(o) >= 2 && !giftOnly) check(m.price < m.reference, `${where}: ${o.price} not below ${m.reference / 100}`);
    }
  }
  {
    const doc = getFixture("duo").doc;
    const bogo = presetOffer("bogo", doc);
    const m = offerMath(doc, bogo);
    check(offerSignature(bogo) === "gift:main×1+main×1" && bogo.price === 149 && m.reference === 29800, `bogo: ${offerSignature(bogo)} ${bogo.price} ref ${m.reference / 100}`);
    const any3 = presetOffer("any-n", doc, { items: ["main", "nuit"], qty: 3 });
    check(offerSignature(any3) === "[main|nuit]×3" && any3.price < 3 * 149, `any-n: ${offerSignature(any3)} ${any3.price}`);
    const colors = presetOffer("pack-colors", getFixture("tshirt").doc, { values: ["o-noir", "o-gris"] });
    check(colors.lines.length === 2 && colors.lines.every((l) => l.rules?.["g-fit.d-col"]), `pack-colors with values: ${JSON.stringify(colors.lines)}`);
    check(presetOffer("choose-one", getFixture("tshirt").doc).lines.every((l) => "item" in l.pick), "choose-one on a single-item page: a choice of one");
  }

  // 6h — the admin sentence (page language), the composer's contents line
  {
    const doc = getFixture("duo", { locale: "fr" }).doc;
    const trio = doc.offers.bundles.find((o) => o.id === "trio")!;
    const want = "Le client reçoit 1 Crème jour + 1 Crème nuit + 1 Sérum éclat, paie 349 DH au lieu de 497 (−148), livraison offerte";
    check(plain(offerSentence(doc, trio)) === want, `sentence: "${offerSentence(doc, trio)}"`);
    const one = doc.offers.bundles.find((o) => o.id === "one")!;
    check(offerContents(doc, one) === "1 au choix (Jour ou Nuit) · 1 pièce", `contents: "${offerContents(doc, one)}"`);
    const paid = { ...doc, offers: { ...doc.offers, shippingFee: 30 } };
    check(plain(offerSentence(paid, trio)).endsWith("+ 30 DH de livraison"), `sentence with a fee: "${offerSentence(paid, trio)}"`);
    const ar = getFixture("duo", { locale: "ar" }).doc;
    const s = offerSentence(ar, ar.offers.bundles.find((o) => o.id === "trio")!);
    check(s.startsWith("الزبون كيتوصل بـ 1 كريم النهار") && s.includes("بلاصة 497 (−148)"), `sentence ar: "${s}"`);
    const tee = getFixture("colors").doc;
    const pack = tee.offers.bundles.find((o) => o.lines.length === 3 && o.lines.every((l) => l.rules));
    if (pack) check(/\(أسود\)/.test(offerContents(tee, pack)), `contents with locks: "${offerContents(tee, pack)}"`);
  }

  // 6i — the wizard's items, offers, look and tracking answer reach every direction verbatim
  {
    const duo = getFixture("duo", { locale: "fr" }).doc;
    const product = { name: duo.product.name, category: duo.product.category, images: duo.product.images };
    const input: GenerateInput = { product, items: duo.items, palette: null, locale: "fr", market: "MA", seedBase: 77, tracking: { kind: "none" } };
    const dirs = generateDirections(input);
    check(dirs.length === 3, `wizard items: ${dirs.length} directions`);
    for (const d of dirs) {
      const where = `wizard items/${d.archetype}`;
      check(stable(d.doc.items) === stable(duo.items), `${where}: the items changed`);
      check(d.doc.offers.bundles.map((o) => offerSignature(o)).join(" ") === "[main|nuit]×1 main×1+nuit×1 main×1+nuit×1+serum×1", `${where}: offers ${d.doc.offers.bundles.map((o) => offerSignature(o)).join(" ")}`);
      check(d.doc.tracking.none === true && !d.doc.tracking.metaPixelId, `${where}: "No pixel" answer lost (${JSON.stringify(d.doc.tracking)})`);
      check(validateDoc(d.doc).issues.length === 0, `${where}: ${validateDoc(d.doc).issues.map((i) => i.message).slice(0, 2).join(" | ")}`);
      checkOfferDisplay(d.doc, where);
      // copy remix keeps every multi-item offer title
      const r = remixDoc(d.doc, { seed: 5, scope: "copy" });
      check(stable(r.offers.bundles.map((o) => o.title)) === stable(d.doc.offers.bundles.map((o) => o.title)), `${where}: copy remix re-worded multi-item offers`);
    }
    // offers and look given → used by every direction as they are; pixels answered → those pixels
    const look = { picker: "pills", fill: "box", selection: "outline", media: "large", density: "comfortable" } as const;
    const tracking = { kind: "ids", tracking: { tiktokPixelId: ["C4ABCDEF12345678"] } };
    const given = generateDirections({ ...input, offers: duo.offers.bundles, display: look, tracking });
    for (const d of given) {
      check(stable(d.doc.offers.bundles) === stable(duo.offers.bundles), `wizard offers/${d.archetype}: offers changed`);
      check(stable(d.doc.offers.display) === stable(look), `wizard look/${d.archetype}: ${JSON.stringify(d.doc.offers.display)}`);
      check(stable(d.doc.tracking) === stable({ tiktokPixelId: ["C4ABCDEF12345678"] }), `wizard pixels/${d.archetype}: ${JSON.stringify(d.doc.tracking)}`);
    }
    let threw = "";
    try {
      generateDirections({ ...input, items: [{ id: "main", name: "Crème", price: -1 }] });
    } catch (e) {
      threw = e instanceof Error ? e.message : String(e);
    }
    check(threw.includes("products are incomplete"), `wizard items: invalid items not refused clearly (${threw || "no error"})`);
    threw = "";
    try {
      generateDirections({ ...input, offers: [{ id: "x", lines: [], price: 10 }] });
    } catch (e) {
      threw = e instanceof Error ? e.message : String(e);
    }
    check(threw.includes("offers are incomplete"), `wizard offers: invalid offers not refused clearly (${threw || "no error"})`);
    // a single-item page's ×N titles are re-worded by a copy remix (the v1 behaviour)
    const single = generateDirections({ product: { name: "Sac", price: 199, category: "bags", images: [ref(40)] }, palette: null, locale: "fr", market: "MA", seedBase: 9 })[0]!.doc;
    const renamed = { ...single, offers: { ...single.offers, bundles: single.offers.bundles.map((o) => ({ ...o, title: "Mon pack" })) } };
    const rr = remixDoc(renamed, { seed: 3, scope: "copy" });
    check(rr.offers.bundles.map((o) => o.title).join("|") === T.fr.packs.map((t) => t.title).join("|"), `single item: copy remix titles ${rr.offers.bundles.map((o) => o.title).join("|")}`);
    console.log(`  wizard input: items / offers / look / tracking kept in ${dirs.length + given.length} directions`);
  }

  // 6j — never the bold form with a solid selection: souk (solid) directions across seeds, and the guard itself
  {
    let bold = 0;
    for (let k = 0; k < 60; k++) {
      const doc = buildDirection({ product: { name: "Tapis berbère", price: 899, category: "decor", images: [ref(900 + k)] }, palette: P.argan, locale: "fr", market: "MA", seedBase: 3000 + k }, "souk", 3000 + k);
      if (doc.sections.some((x) => x.type === "orderForm" && x.variant === "bold")) bold++;
      checkOfferDisplay(doc, `souk seed ${k}`);
      checkNoBoldSolid(remixDoc(doc, { seed: k, scope: "design" }), `souk seed ${k}/remix-design`);
    }
    const solid = { picker: "ticket", fill: "auto", selection: "solid", media: "auto", density: "comfortable" } as const;
    check(safeSelection(solid, "bold").selection === "soft" && safeSelection(solid, "card").selection === "solid", "safeSelection: bold + solid not turned soft");
    console.log(`  bold + solid: never paired (${bold} bold souk forms in 60 seeds)`);
  }
}

/* 7 — AI copy guard */
const lib = libraryCopy({ category: "skincare", locale: "fr", seed: 1, productName: "Sérum Argan" });
const ai: AiCopy = {
  tagline: "Le sérum qui nourrit sans graisser",
  kicker: "Sérum Argan",
  headline: "Une peau *souple* dès le premier soir",
  sub: "Un sérum léger qui pénètre vite et laisse la peau douce, sans film gras.",
  cta: "Je commande",
  benefits: [
    { title: "Texture légère", text: "Il pénètre en quelques secondes, sans effet collant.", icon: "drop" },
    { title: "98 % de clientes satisfaites", text: "Un chiffre inventé que le garde-fou doit refuser.", icon: "star" },
    { title: "Flacon de 30 ml", text: "Un format pratique qui se glisse dans la trousse.", icon: "box" },
    { title: "Peau confortable", text: "La peau reste souple toute la journée.", icon: "feather" },
  ],
  problem_title: "Votre peau tiraille ?",
  pains: [
    { pain: "La peau qui tiraille", fix: "Une peau confortable" },
    { pain: "Un film gras", fix: "Une texture légère" },
    { pain: "Un teint terne", fix: "Une peau lumineuse" },
  ],
  solution: "Le geste simple : *Sérum Argan*.",
  steps: [
    { title: "Peau propre", text: "Nettoyez votre visage." },
    { title: "Trois gouttes", text: "Appliquez par pressions légères." },
    { title: "Laissez agir", text: "Une minute suffit." },
  ],
  faq: [
    { q: "Comment payer ?", a: "En espèces à la livraison." },
    { q: "Délais de livraison ?", a: "Rapide, partout au Maroc." },
    { q: "Puis-je vérifier ?", a: "Oui, avant de payer." },
    { q: "Ça guérit l'acné ?", a: "Il guérit l'acné en une semaine." },
    { q: "Peaux sensibles ?", a: "Faites un test au préalable." },
  ],
  guarantee: ["Paiement à la livraison.", "Vérifiez avant de payer.", "Service client sur WhatsApp."],
  cta_title: "Prête à l'essayer !",
  cta_text: "Commandez en trente secondes.",
  story_title: "Notre histoire",
  story: "Un sérum pensé pour les peaux qui manquent de confort, simple à utiliser au quotidien et livré partout au Maroc avec paiement à la livraison.",
  comparison: [
    { label: "Texture", us: "Légère", them: "Grasse" },
    { label: "Paiement", us: "À la livraison", them: "D'avance" },
    { label: "Vérification", us: "Avant de payer", them: "Aucune" },
    { label: "Service", us: "WhatsApp", them: "Aucun" },
  ],
  announcement: ["Paiement à la livraison", "Livraison rapide", "Une révolutionnaire nouveauté"],
  marquee: ["Peau douce", "Texture légère", "Éclat", "Confort", "Livraison"],
  seo_title: "Sérum Argan — paiement à la livraison",
  seo_description: "Commandez le Sérum Argan et payez à la livraison. Une texture légère qui pénètre vite, pour une peau douce et confortable.",
};
const merged = mergeAiCopy(lib, ai, { locale: "fr", productName: "Sérum Argan", facts: ["Flacon de 30 ml"], price: 199 });
check(merged.rejected.includes("benefits"), "guard: invented 98 % accepted");
check(merged.rejected.includes("faq"), "guard: medical claim accepted");
check(!merged.rejected.includes("steps"), "guard: clean steps rejected");
check(merged.rejected.includes("announcement") === false && merged.copy.announcement.length >= 2, "guard: announcement merge broken");
check(!merged.copy.announcement.some((a) => /volutionnaire/i.test(a)), "guard: hype word accepted");
check(!merged.copy.cta.title.includes("!"), "guard: exclamation mark kept");
check(merged.copy.hero.headline === "Une peau *souple* dès le premier soir", "guard: clean headline rejected");
check(merged.copy.benefits.items === lib.benefits.items || JSON.stringify(merged.copy.benefits.items) === JSON.stringify(lib.benefits.items), "guard: rejected benefits not replaced by the library");
const arabicInFr = mergeAiCopy(lib, { ...ai, sub: "هذا نص عربي طويل لا يجب أن يظهر في صفحة فرنسية أبداً" }, { locale: "fr", productName: "Sérum Argan", facts: [], price: 199 });
check(arabicInFr.rejected.includes("sub"), "guard: wrong-language field accepted");

// P0b review F-8: the onboarding reveal's degraded contract (DES-§14.3). buildRevealDirections resolves three
// directions with distinct ids and valid documents and invents no GenomeCard (a card is null or one P6 computed); a
// product the generator refuses rejects, which P2 shows as the `error` state with Retry (directions null).
void (async () => {
  const { buildRevealDirections } = await import("@/components/generate/reveal/directions");
  const base = { palette: null, facts: [], category: "beauty" as const, locale: "fr" as const, photos: [], market: "MA" as const, seedBase: 4242 };
  try {
    const dirs = await buildRevealDirections({ ...base, product: { name: "Sérum Argan", category: "beauty", price: 199, images: [] } });
    check(dirs.length === 3 && new Set(dirs.map((d) => d.id)).size === 3, `reveal: three directions with distinct ids (${dirs.map((d) => d.id).join(", ")})`);
    for (const d of dirs) {
      check(validateDoc(d.doc).issues.length === 0, `reveal ${d.id}: the document validates`);
      check(d.card === null || typeof d.card.explanation?.length === "number", `reveal ${d.id}: a card is null or a computed GenomeCard, never invented`);
      check(d.label.length > 0, `reveal ${d.id}: a label`);
    }
  } catch (e) {
    fail(`reveal: buildRevealDirections rejected a complete product: ${String(e)}`);
  }
  const refused = await buildRevealDirections({ ...base, product: { category: "beauty" } }).then(
    () => false,
    () => true,
  );
  check(refused, "reveal: a product without a name or price rejects (P2's error state)");
  console.log(failures ? `✗ ${failures} failure(s)` : "✓ all generator checks passed");
  process.exit(failures ? 1 : 0);
})();
