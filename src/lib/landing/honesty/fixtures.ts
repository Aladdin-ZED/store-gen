/**
 * Honesty fixtures (P3 LANDING; landing.md LAN-§6.1, LAN-§6.4 acceptance, LAN-§3.2.1 `test:prepublish` list): compact,
 * committed reproductions of the design-baseline findings, built from src/lib/page/fixtures.ts plus patches. Never
 * read from the git-ignored qa/ corpus. `test:honesty` (./selftest.ts) checks the numbers audit and the sensitive
 * fields on them; the honesty gate's fixtures (src/lib/render/prepublish/landing.fixtures.ts) reuse the docs with the
 * gate ids listed in `gate`.
 *
 * Every page starts from `basePage`: a fixture with only a few sections, every digit-bearing text replaced by a plain
 * sentence, no countdown, no stock, so the numbers on it are exactly the ones a patch puts there.
 */
import { getFixture, type FixtureName } from "@/lib/page/fixtures";
import type { AssetRef, PageDoc } from "@/lib/page/schema";
import type { DeliveryZoneRow } from "@/lib/delivery/types";
import { PoliciesSetting, type StorePolicyFacts } from "@/lib/settings/keys/policies";
import type { NumberStoreFacts } from "./numbers";

/** Every fixture renders at this instant (no countdown runs out under a test). */
export const HONESTY_NOW = "2026-10-20T10:00:00.000Z";

type Lang = "ar" | "fr" | "en";
const NEUTRAL: Record<Lang, string> = {
  fr: "Un geste simple, pensé pour vous.",
  ar: "حاجة بسيطة، مصنوعة ليك.",
  en: "A simple thing, made for you.",
};

/** Every string with a digit becomes a plain sentence (bounded fields keep their length). */
function scrub<T>(value: T, lang: Lang): T {
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") return /\d|[٠-٩]/.test(v) ? NEUTRAL[lang].slice(0, Math.max(1, v.length)) : v;
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(value) as T;
}

export const BASE_SECTIONS = ["header", "hero", "benefits", "offer", "orderForm", "faq", "footer"] as const;

/**
 * Where the fixture pages come from: `getFixture` builds a theme and every section's defaults (tens of ms), so a set
 * of fixtures shares one source that builds each name and language once (`fixtureSource()`, a fresh one per set: no
 * module state).
 */
export interface FixtureSource {
  doc(name: FixtureName, lang: Lang): PageDoc;
}
export function fixtureSource(): FixtureSource {
  const built = new Map<string, PageDoc>();
  return {
    doc(name, lang) {
      const key = `${name}/${lang}`;
      let doc = built.get(key);
      if (!doc) built.set(key, (doc = getFixture(name, { locale: lang, now: HONESTY_NOW }).doc));
      return structuredClone(doc);
    },
  };
}

/** A fixture page with only `keep` sections and no number but the pricing (LAN-§6.4 fixtures start from zero). */
export function basePage(src: FixtureSource, name: FixtureName, lang: Lang, keep: readonly string[] = BASE_SECTIONS): PageDoc {
  const doc = src.doc(name, lang);
  doc.sections = doc.sections.filter((s) => keep.includes(s.type)).map((s) => ({ ...s, data: scrub(s.data, lang) }));
  doc.product = { ...doc.product, tagline: NEUTRAL[lang], description: NEUTRAL[lang] };
  doc.offers = scrub(doc.offers, lang);
  doc.offers.urgency = {};
  doc.form = scrub(doc.form, lang);
  doc.seo = { ...doc.seo, title: doc.product.name.replace(/\d/g, "").trim(), description: NEUTRAL[lang] };
  doc.thankYou = scrub(doc.thankYou, lang);
  return doc;
}

/** Sets a text at a section path ("benefits.items.0.text": section id, then the data path). */
export function setText(doc: PageDoc, path: string, text: string): PageDoc {
  const [id, ...rest] = path.split(".");
  const s = doc.sections.find((x) => x.id === id);
  if (!s || !rest.length) throw new Error(`honesty fixture: no section path ${path}`);
  let cur: Record<string, unknown> = s.data;
  for (const seg of rest.slice(0, -1)) {
    const next = cur[seg];
    if (!next || typeof next !== "object") throw new Error(`honesty fixture: no data at ${path}`);
    cur = next as Record<string, unknown>;
  }
  cur[rest.at(-1)!] = text;
  return doc;
}

/** One offer of one unit at 149 (no compare-at, bump or upsell): small numbers stay free for the facts cases. */
export function singleOffer(doc: PageDoc, price = 149): PageDoc {
  const item = { ...doc.items[0]!, price, compareAt: undefined, groups: [] };
  const offer = doc.offers.bundles[0]!;
  doc.items = [item];
  doc.offers.bundles = [{ ...offer, price, compareAt: undefined, lines: [{ ...offer.lines[0]!, qty: 1, pick: { item: item.id } }] }];
  doc.offers.orderBump = undefined;
  doc.offers.upsell = undefined;
  doc.offers.shippingFee = 0;
  return doc;
}

export const UNSET_POLICIES: StorePolicyFacts = PoliciesSetting.parse({});

export function storeFacts(over: Partial<NumberStoreFacts> = {}): NumberStoreFacts {
  return { policies: UNSET_POLICIES, zones: [], confirmation: {}, facts: [], ...over };
}

export const zoneRow = (cities: string[], eta: [number, number] | null, position = 0): DeliveryZoneRow => ({
  id: `Z${String(position + 1).padStart(25, "0")}`,
  name: `Zone ${position + 1}`,
  cities: cities as DeliveryZoneRow["cities"],
  feeCents: null,
  freeFromCents: null,
  etaMinDays: eta ? eta[0] : null,
  etaMaxDays: eta ? eta[1] : null,
  notServed: false,
  note: null,
  position,
});

/** An origin map: these paths generated, every other path the owner's. */
export const generated = (...paths: string[]): Map<string, "generated" | "owner"> => new Map(paths.map((p) => [p, "generated" as const]));

export interface ExpectedFinding {
  path: string;
  value: string;
  level: "hard" | "soft";
  why: "unknown" | "conflict";
}

export interface HonestyFixture {
  name: string;
  doc: PageDoc;
  store: NumberStoreFacts;
  origin: ReadonlyMap<string, "generated" | "owner">;
  attestedSections?: ReadonlySet<string>;
  /** exactly the numbers-audit findings expected (path, value, level, why), in any order; absent = not checked (a proof page whose sample copy the gate refuses first) */
  numbers?: ExpectedFinding[];
  /** the gate ids the honesty gate (P3 step 3) answers on this page; [] = it publishes */
  gate: string[];
}

/* ------------------------------------------------------------------ */
/* the baseline contradictions (design-baseline §3.7)                  */
/* ------------------------------------------------------------------ */

/** The blender page: the wizard said "30 secondes", a generated benefit says "40 s", the FAQ repeats "30 s". */
function blender(src: FixtureSource): HonestyFixture {
  const doc = basePage(src, "blender", "fr");
  doc.product.tagline = "Un smoothie frais en 30 secondes, au bureau comme à la plage";
  setText(doc, "benefits.items.0.text", "Smoothie prêt en 40 s, au bureau comme en voyage.");
  setText(doc, "faq.items.0.a", "30 s et c'est prêt, puis un rinçage à l'eau.");
  return {
    name: "blender-30s-40s",
    doc,
    store: storeFacts({ facts: ["Prêt en 30 secondes"] }),
    origin: generated("benefits.items.0.text", "faq.items.0.a"),
    numbers: [{ path: "benefits.items.0.text", value: "40", level: "hard", why: "unknown" }],
    gate: ["honesty:D1"],
  };
}

/** The same page once the owner attested "40 s" too: one fact, two values, a conflict on the later field. */
function blenderConflict(src: FixtureSource): HonestyFixture {
  const doc = basePage(src, "blender", "fr");
  setText(doc, "benefits.items.0.text", "Prêt en 40 s, au bureau comme en voyage.");
  doc.product.description = "Prêt en 30 secondes, il se rince sous l'eau.";
  return {
    name: "blender-conflict",
    doc,
    store: storeFacts({ facts: ["Prêt en 30 secondes", "Prêt en 40 s"] }),
    origin: new Map(),
    numbers: [{ path: "product.description", value: "30", level: "hard", why: "conflict" }],
    gate: ["honesty:D1"],
  };
}

/** The t-shirt page: "+9 400 pièces" in the hero, "1 000 colis" in a benefit (counters nobody typed). */
function tshirt(src: FixtureSource): HonestyFixture {
  const doc = basePage(src, "tshirt", "fr");
  setText(doc, "hero.subtitle", "Déjà +9 400 pièces vendues dans tout le Maroc.");
  setText(doc, "benefits.items.1.text", "1 000 colis préparés chaque mois dans notre atelier.");
  return {
    name: "tshirt-counters",
    doc,
    store: storeFacts(),
    origin: generated("hero.subtitle"),
    numbers: [
      { path: "hero.subtitle", value: "9400", level: "hard", why: "unknown" },
      { path: "benefits.items.1.text", value: "1000", level: "hard", why: "unknown" },
    ],
    gate: ["honesty:D1"],
  };
}

/** The library hero: "4,7 (312 avis)" printed on every page. */
function libraryRating(src: FixtureSource): HonestyFixture {
  const doc = basePage(src, "argan", "fr");
  setText(doc, "hero.subtitle", "Noté 4,7 (312 avis) par nos clientes.");
  return {
    name: "library-rating",
    doc,
    store: storeFacts(),
    origin: generated("hero.subtitle"),
    numbers: [
      { path: "hero.subtitle", value: "4.7", level: "hard", why: "unknown" },
      { path: "hero.subtitle", value: "312", level: "hard", why: "unknown" },
    ],
    gate: ["honesty:D1"],
  };
}

/** The library stats section ("94 %", "Questionnaire auprès de nos clientes"), still flagged sample. */
function libraryStats(src: FixtureSource): HonestyFixture {
  const doc = basePage(src, "argan", "fr", [...BASE_SECTIONS, "stats"]);
  const stats = doc.sections.find((s) => s.type === "stats")!;
  stats.data = { ...stats.data, sample: true, items: [{ value: 94, prefix: "", suffix: "%", label: "des clientes satisfaites", source: "Questionnaire auprès de nos clientes" }] };
  return {
    name: "library-stats",
    doc,
    store: storeFacts(),
    origin: new Map(),
    numbers: [{ path: "stats.items.0.value", value: "94", level: "hard", why: "unknown" }],
    gate: ["honesty:sample", "honesty:D2", "honesty:D1"],
  };
}

/* ------------------------------------------------------------------ */
/* owner-typed facts (rev 3, ENGP-8)                                   */
/* ------------------------------------------------------------------ */

const OWNER_FACTS = ["3 couleurs", "2 en 1", "100 % coton", "50 ml", "XL 2024"] as const;

function ownerFactsDoc(src: FixtureSource): PageDoc {
  const doc = singleOffer(basePage(src, "argan", "fr"));
  setText(doc, "benefits.items.0.text", "Disponible en 3 couleurs.");
  setText(doc, "benefits.items.1.text", "Un soin 2 en 1, visage et cheveux.");
  setText(doc, "benefits.items.2.text", "Une trousse en 100 % coton offerte.");
  setText(doc, "benefits.items.3.text", "Un flacon de 50 ml qui dure.");
  setText(doc, "faq.items.0.a", "La recette s'appelle XL 2024.");
  return doc;
}
const OWNER_PATHS = ["benefits.items.0.text", "benefits.items.1.text", "benefits.items.2.text", "benefits.items.3.text", "faq.items.0.a"] as const;
const OWNER_VALUES = ["3", "2", "100", "50", "2024"] as const;

/** Owner-typed "3 couleurs", "2 en 1", "100 % coton", "50 ml", "XL 2024": one soft finding each. */
function ownerFacts(src: FixtureSource): HonestyFixture {
  return {
    name: "owner-facts",
    doc: ownerFactsDoc(src),
    store: storeFacts(),
    origin: new Map(),
    numbers: OWNER_PATHS.map((path, i) => ({ path, value: OWNER_VALUES[i]!, level: "soft" as const, why: "unknown" as const })),
    gate: [],
  };
}

/** The same page after the five attestations (`page.fact_attested`, source owner): nothing left. */
function ownerFactsAttested(src: FixtureSource): HonestyFixture {
  return { name: "owner-facts-attested", doc: ownerFactsDoc(src), store: storeFacts({ facts: [...OWNER_FACTS] }), origin: new Map(), numbers: [], gate: [] };
}

/** A generated "3 couleurs" is hard: the model wrote a number nobody typed. */
function generatedFact(src: FixtureSource): HonestyFixture {
  const doc = singleOffer(basePage(src, "argan", "fr"));
  setText(doc, "benefits.items.0.text", "Disponible en 3 couleurs.");
  return {
    name: "generated-fact",
    doc,
    store: storeFacts(),
    origin: generated("benefits.items.0.text"),
    numbers: [{ path: "benefits.items.0.text", value: "3", level: "hard", why: "unknown" }],
    gate: ["honesty:D1"],
  };
}

/* ------------------------------------------------------------------ */
/* the two digit systems                                               */
/* ------------------------------------------------------------------ */

const AR_TEXTS = {
  "benefits.items.0.text": ["متوفر ب ٤ ألوان.", "متوفر ب 4 ألوان."],
  "benefits.items.1.text": ["قنينة ديال ٥٠ مل كتكفي شهر.", "قنينة ديال 50 مل كتكفي شهر."],
  "benefits.items.2.text": ["التوصيل ف ٤٨ ساعة لجميع المدن.", "التوصيل ف 48 ساعة لجميع المدن."],
  "hero.subtitle": ["+٩٬٤٠٠ زبونة جربوه.", "+9 400 زبونة جربوه."],
  "faq.items.0.a": ["الثمن ١٤٩ درهم والتوصيل فابور.", "الثمن 149 درهم والتوصيل فابور."],
} as const;

/** An Arabic page in Arabic-Indic digits (`indic`) or in the ar-MA Latin digits: identical findings. */
export function arabicDigits(src: FixtureSource, system: "indic" | "latin"): HonestyFixture {
  const doc = singleOffer(basePage(src, "argan", "ar"));
  for (const [path, [indic, latin]] of Object.entries(AR_TEXTS)) setText(doc, path, system === "indic" ? indic : latin);
  return {
    name: `ar-digits-${system}`,
    doc,
    store: storeFacts({ zones: [zoneRow(["casablanca"], [1, 3])], zonesEnabled: true }),
    origin: generated("hero.subtitle"),
    numbers: [
      { path: "hero.subtitle", value: "9400", level: "hard", why: "unknown" },
      { path: "benefits.items.0.text", value: "4", level: "soft", why: "unknown" },
      { path: "benefits.items.1.text", value: "50", level: "soft", why: "unknown" },
      { path: "benefits.items.2.text", value: "48", level: "hard", why: "conflict" },
    ],
    gate: ["honesty:D1"],
  };
}

/* ------------------------------------------------------------------ */
/* keep-list pages (design-baseline §6): every number backed            */
/* ------------------------------------------------------------------ */

/** A clean page in fr: price, saving, stock, delivery days, warranty, a year, a phone number, isolates. */
function keepListFr(src: FixtureSource): HonestyFixture {
  const doc = basePage(src, "blender", "fr");
  doc.offers.urgency = { stockLeft: 52 };
  doc.product.tagline = "Un smoothie frais en 30 secondes";
  doc.product.description = "380 ml, 6 lames en inox, recharge USB-C. Depuis 2019 dans nos cuisines.";
  setText(doc, "hero.subtitle", "199 DH au lieu de 249 DH, et le Duo à 359 DH.");
  setText(doc, "benefits.items.0.text", "Livraison en 1 à 3 jours, paiement à la réception.");
  setText(doc, "benefits.items.1.text", "Plus que 52 pièces en stock.");
  setText(doc, "benefits.items.2.text", "Garantie 12 mois sur le moteur.");
  setText(doc, "faq.items.0.a", "Une question ? Appelez le 06 12 34 56 78, de 9h à 18h, 7j/7.");
  setText(doc, "faq.items.1.a", "Remise ⁦−37%⁩ sur le pack, prix en <bdi>1 299 DH</bdi> chez nos voisins.");
  return {
    name: "keep-list-fr",
    doc,
    store: storeFacts({ facts: ["Prêt en 30 secondes", "380 ml", "6 lames"], zones: [zoneRow(["casablanca"], [1, 3])], zonesEnabled: true, policies: PoliciesSetting.parse({ warranty: { months: 12 } }) }),
    origin: generated("hero.subtitle", "benefits.items.0.text", "benefits.items.1.text", "benefits.items.2.text"),
    numbers: [],
    gate: [],
  };
}

/** A clean page in ar (Arabic-Indic digits): the price, the zone's days, a fact the wizard gave. */
function keepListAr(src: FixtureSource): HonestyFixture {
  const doc = basePage(src, "argan", "ar");
  const price = doc.items[0]!.price;
  doc.product.description = "زيت أركان صافي، قنينة ديال ٣٠ مل.";
  setText(doc, "hero.subtitle", `الثمن ${String(price).replace(/\d/g, (d) => String.fromCharCode(0x0660 + Number(d)))} درهم، والدفع عند الاستلام.`);
  setText(doc, "benefits.items.0.text", "التوصيل من ١ حتى ل ٣ أيام.");
  return {
    name: "keep-list-ar",
    doc,
    store: storeFacts({ facts: ["قنينة 30 مل"], zones: [zoneRow(["casablanca"], [1, 3])], zonesEnabled: true }),
    origin: generated("hero.subtitle", "benefits.items.0.text"),
    numbers: [],
    gate: [],
  };
}

/* ------------------------------------------------------------------ */
/* proof sections and sensitive fields (the gate's LAN-§6.1 fixtures)  */
/* ------------------------------------------------------------------ */

const image = (doc: PageDoc, i: number): AssetRef => doc.product.images[i % doc.product.images.length]!;

/** A visible reviews section still flagged sample (LAN-§6.1 `honesty:sample`). */
function sampleReviews(src: FixtureSource): HonestyFixture {
  const doc = basePage(src, "argan", "fr", [...BASE_SECTIONS, "reviews"]);
  const reviews = src.doc("argan", "fr").sections.find((s) => s.type === "reviews")!;
  doc.sections.splice(doc.sections.length - 1, 0, { ...reviews, data: { ...reviews.data, sample: true } });
  return { name: "sample-reviews", doc, store: storeFacts(), origin: new Map(), gate: ["honesty:sample"] };
}

/** A before/after with one photo used twice (the baseline's "SANS / AVEC" on a desaturated copy). */
function oneImageBeforeAfter(src: FixtureSource): HonestyFixture {
  const doc = basePage(src, "argan", "fr", [...BASE_SECTIONS, "beforeAfter"]);
  const ba = doc.sections.find((s) => s.type === "beforeAfter")!;
  const one = image(doc, 0);
  ba.data = { ...ba.data, sample: false, before: { image: one, label: "Avant", when: "", caption: "" }, after: { image: one, label: "Après", when: "", caption: "" } };
  return { name: "one-image-before-after", doc, store: storeFacts(), origin: new Map(), attestedSections: new Set([ba.id]), numbers: [], gate: ["honesty:I4"] };
}

/** A "video" section with a poster and no video file or URL. */
function stillVideo(src: FixtureSource): HonestyFixture {
  const doc = basePage(src, "argan", "fr", [...BASE_SECTIONS, "video"]);
  const v = doc.sections.find((s) => s.type === "video")!;
  const data = { ...v.data, sample: false, poster: image(doc, 0) } as Record<string, unknown>;
  delete data.video;
  v.data = data;
  return { name: "still-video", doc, store: storeFacts(), origin: new Map(), numbers: [], gate: ["honesty:I4"] };
}

/** A gallery with two distinct photos and no fill (≥ 3 needed). */
function twoAssetGallery(src: FixtureSource): HonestyFixture {
  const doc = basePage(src, "tshirt", "fr", [...BASE_SECTIONS, "gallery"]);
  const g = doc.sections.find((s) => s.type === "gallery")!;
  g.data = { ...g.data, fill: false, items: [{ image: image(doc, 0), caption: "" }, { image: image(doc, 1), caption: "" }] };
  return { name: "two-asset-gallery", doc, store: storeFacts(), origin: new Map(), numbers: [], gate: ["honesty:I4"] };
}

/** The four labels a COD page never asks for, as an item field and as order extras (SEC-18). */
export const SENSITIVE_LABELS = ["Mot de passe", "Code SMS", "Numéro de carte", "كلمة السر"] as const;

function sensitivePage(src: FixtureSource): HonestyFixture {
  const doc = basePage(src, "tshirt", "fr");
  const item = doc.items[0]!;
  const fieldGroup = item.groups.find((g) => g.kind === "field");
  if (!fieldGroup || fieldGroup.kind !== "field") throw new Error("honesty fixture: the tshirt has no field group");
  item.groups = [...item.groups.filter((g) => g !== fieldGroup), { ...fieldGroup, id: "g-pass", name: SENSITIVE_LABELS[0] }];
  doc.offers.extras = SENSITIVE_LABELS.slice(1).map((name, i) => ({ ...fieldGroup, id: `x-${i + 1}`, name, scope: "all" as const }));
  return { name: "sensitive-fields", doc, store: storeFacts(), origin: new Map(), numbers: [], gate: ["honesty:password_field"] };
}

/** Every fixture of the set, built fresh (callers may mutate them). */
export function honestyFixtures(src: FixtureSource = fixtureSource()): HonestyFixture[] {
  return [
    blender(src),
    blenderConflict(src),
    tshirt(src),
    libraryRating(src),
    libraryStats(src),
    ownerFacts(src),
    ownerFactsAttested(src),
    generatedFact(src),
    arabicDigits(src, "indic"),
    arabicDigits(src, "latin"),
    keepListFr(src),
    keepListAr(src),
    sampleReviews(src),
    oneImageBeforeAfter(src),
    stillVideo(src),
    twoAssetGallery(src),
    sensitivePage(src),
  ];
}
