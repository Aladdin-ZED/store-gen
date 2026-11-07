/**
 * The Campaign Kit compiler (P3 LANDING, wave 2; landing.md LAN-§13.2, §13.3, SF-01; docs/STORE-SAAS.md §K.2 P0). Pure
 * over its inputs, < 300 ms: every number in the kit is a price, an offer, the page fee or an ETA range from the inputs
 * (the brief passes the same `allowedNumbers` guard as AI output); three angles with three different structure tags
 * present on the page; `doNotSay` lists every claim the store did not make. The Cloud brief (`ad.brief`, P7) never
 * blocks the kit. Typed stub frozen at P0; the kit shapes are the `campaigns.kit` column's (src/lib/db/schema.ts).
 *
 *   facts        the product name, every available offer (its name through `offerName`, so French slots read
 *                "2 pièces" with the right article, and its price), the page fee ("free delivery" only when it is 0)
 *                and the general ETA range of the zones (`deliverySummary`, the lead days included), per locale
 *   angles       the page's section titles tagged with P6's structure tagger (`structureOf`, DES-§9.5); up to three
 *                distinct tags, the hero first; each angle's hook is a copy-library headline line of the product's
 *                family with that structure (≤ 12 words, the French ones article-safe through `frTemplate`), the
 *                section's own title as the fallback in the page's language; primary text and headline from facts
 *   visual       the page's image-treatment gene (`theme.look.img`) as one sentence; a 6-beat 15 s UGC sheet
 *   script       the store's call scripts (P4's OP-05 documents, the built-ins for a missing language) with the
 *                page's facts filled and the customer's variables kept as {placeholders}; the calling hours line
 *                (`weekHoursText`) heads it unless `noShopperHours`
 *   pixelPlan    the page's pixels named from the library, what fires where, the Purchase trigger, a test-code reminder
 *
 * Inputs beyond the frozen P0 shape are optional (`scripts`, `window`, `now`, `leadDays`): the service passes them,
 * a caller of the P0 shape still compiles.
 */
import type { AdBrief, CampaignChannel, CampaignKit, ShortLinkUtm } from "@/lib/db/schema";
import { BUILTIN_SCRIPTS } from "@/lib/callcenter/script-builtins";
import type { ScriptDoc } from "@/lib/callcenter/script";
import type { EffectiveWindow } from "@/lib/callcenter/window";
import type { DeliveryZoneRow } from "@/lib/delivery/types";
import { deliverySummary } from "@/lib/delivery/line";
import { AD_BANNED } from "@/lib/ai/schema/tasks/ad-brief";
import { allowedNumbersFor, GUARD_LISTS } from "@/lib/ai/guard";
import { numbersIn } from "@/lib/ai/guard-numbers";
import { copyFamily, fill as fillSlots, frTemplate, libraryFor, lineTag, lineText, productRef, typeset } from "@/lib/ai/copy-library";
import { structureOf } from "@/lib/design/cliche";
import { parseTemplate, type TemplateVar } from "@/lib/integrations/template-lang";
import { noShopperHours, weekHoursText } from "@/lib/landing/hours";
import { fmtCents } from "@/landing/runtime/money";
import { moneyFormat } from "@/lib/markets/info";
import { defaultOfferId, offerName } from "@/lib/page/catalog";
import { toCents } from "@/lib/page/pricing";
import type { Offer, PageDoc } from "@/lib/page/schema";
import { pixelLabel, trackingRefs, type PixelLibraryView } from "@/lib/pixels/library";
import type { StorePolicyFacts } from "@/lib/settings/keys/policies";
import type { StoreRow } from "@/lib/tenancy/types";
import { pricingFingerprint } from "./fingerprint";

export type { AdBrief, CampaignChannel, CampaignKit, ShortLinkUtm } from "@/lib/db/schema";

export type Loc = "ar" | "fr" | "en";

export interface CompileKitInput {
  doc: PageDoc;
  version: { id: string; publishedAt: string };
  store: StoreRow;
  locales: Loc[];
  policies: StorePolicyFacts;
  zones: DeliveryZoneRow[];
  pixels: PixelLibraryView;
  trigger: "order" | "confirmed" | "delivered";
  templates: { confirm: Record<Loc, string>; script: ScriptDoc };
  channels: CampaignChannel[];
  slug: string;
  links: { channel: CampaignChannel; url: string; utm: ShortLinkUtm; shortLinkId: string }[];
  cloud?: { brief: AdBrief | null };
  /** the store's script per language (P4's selection); a missing one is `templates.script` for the page's language, else the built-in */
  scripts?: Partial<Record<Loc, ScriptDoc>>;
  /** the calling window (`callingWindowFor`): the script's hours line, omitted when `noShopperHours(window, now)` */
  window?: EffectiveWindow | null;
  /** the compile time (default: now); also `compiledAt` */
  now?: Date;
  /** `checkout.confirmationLeadDays`: added to the ETA range like the page does */
  leadDays?: number;
}

export interface CompileKitResult {
  kit: CampaignKit;
  /** the pricing fingerprint of the compiled version (LAN-§18.4); a later publish that moves it marks the kit stale */
  offersHash: string;
  problems: { code: "no_structure_tags" | "no_locale" | "pixel_missing"; detail?: string }[];
}

const LOCS: readonly Loc[] = ["ar", "fr", "en"];
const HOOK_MAX_WORDS = 12;
const ANGLES = 3;

/** Section types that frame the page (bars, chrome): their titles are not an angle. */
const CHROME: ReadonlySet<string> = new Set(["announcement", "header", "footer", "stickyCta", "whatsappFloat", "marquee"]);
/** The order angles are taken in: the promise first, then the problem, the offer, the proof; the form and the FAQ last. */
const PRIORITY = ["hero", "problem", "benefits", "offer", "guarantee", "story", "comparison", "steps", "showcase", "reviews", "socialProof", "cta", "gallery", "video", "stats", "beforeAfter", "trustBar", "specs", "orderForm", "faq"];
/** The lists whose entries carry their own titles (a benefit, a step, a promise): the next source of a structure. */
const ITEM_LISTS = ["items", "steps", "promises", "notes"];

/* ------------------------------------------------------------------ */
/* small text helpers                                                  */
/* ------------------------------------------------------------------ */

/** A page or library string as plain text: *emphasis* markers out, spaces folded, no em or en dash. */
const plain = (s: string): string =>
  s
    .replace(/\*/g, "")
    .replace(/\s*[–—]\s*/g, ", ")
    .replace(/\s+/g, " ")
    .trim();
const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;
const BANNED: readonly RegExp[] = [...GUARD_LISTS.banned, ...GUARD_LISTS.medical, ...AD_BANNED];
/** A banned, medical or ad-rule word (the test counts the same lists). */
export const bannedIn = (s: string) => BANNED.some((re) => re.test(s));

/** FNV-1a 32 over a string: a deterministic pick per page version and angle (same inputs, same kit). */
function seedOf(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/* ------------------------------------------------------------------ */
/* shopper words (ar Darija in Arabic script, fr with vous, en)        */
/* ------------------------------------------------------------------ */

interface KitWords {
  cod: string;
  freeDelivery: string;
  delivered: (eta: string) => string;
  hours: (h: string) => string;
  ugc: (v: { hook: string; product: string; section: string; offer: string; price: string }) => string[];
  visual: Record<string, string>;
}

const WORDS: Readonly<Record<Loc, KitWords>> = {
  ar: {
    cod: "الدفع عند الاستلام",
    freeDelivery: "التوصيل بالمجان",
    delivered: (eta) => `التوصيل ${eta}`,
    hours: (h) => `أوقات المكالمات: ${h}`,
    ugc: (v) => [
      `البداية: ${v.hook}`,
      `المنتوج فاليد، فضو طبيعي: ${v.product}`,
      `لقطة قريبة على: ${v.section}`,
      `العرض فالشاشة: ${v.offer}، ${v.price}`,
      "الدفع عند الاستلام، كتقولها قدام الكاميرا",
      "النهاية: كتدوز الطلب فالصفحة",
    ],
    visual: {
      "cutout-stage": "المنتوج بوحدو على خلفية صافية، الضو جاي من الجنب، والظل خفيف تحتو.",
      "framed-stage": "المنتوج فوسط إطار هادئ، بلون واحد من ألوان الصفحة.",
      "full-bleed-crop": "صورة كاملة الشاشة، المنتوج قريب ومقطوع شوية فالطرف، فضو طبيعي.",
      framed: "صورة نقية فإطار، المنتوج واضح وكامل، بلا ديكور زايد.",
      "tight-detail": "لقطات قريبة بزاف على التفاصيل: الملمس، الغطا، الخياطة.",
      "tonal-duotone": "صورة بلونين من ألوان الصفحة، والمنتوج بارز فالوسط.",
      "grid-contact": "شبكة ديال صور صغيرة: المنتوج من زوايا مختلفة وفالاستعمال.",
    },
  },
  fr: {
    cod: "Paiement à la livraison",
    freeDelivery: "Livraison gratuite",
    delivered: (eta) => `Livraison ${eta}`,
    hours: (h) => `Appels : ${h}`,
    ugc: (v) => [
      `Ouverture : ${v.hook}`,
      `Le produit en main, en lumière naturelle : ${v.product}`,
      `Plan rapproché sur : ${v.section}`,
      `L'offre à l'écran : ${v.offer}, ${v.price}`,
      "Paiement à la livraison, dit face caméra",
      "Fin : le geste de commander sur la page",
    ],
    visual: {
      "cutout-stage": "Le produit détouré sur un fond uni, une lumière latérale et une ombre douce au sol.",
      "framed-stage": "Le produit centré dans un cadre calme, d'une seule couleur de la page.",
      "full-bleed-crop": "Une image plein écran, le produit tout proche et coupé au bord, en lumière naturelle.",
      framed: "Une photo nette dans un cadre, le produit entier et lisible, sans décor superflu.",
      "tight-detail": "Des plans très serrés sur les détails : la texture, le bouchon, les finitions.",
      "tonal-duotone": "Une image en deux tons de la page, le produit net au centre.",
      "grid-contact": "Une grille de petites photos : le produit sous plusieurs angles et en usage.",
    },
  },
  en: {
    cod: "Cash on delivery",
    freeDelivery: "Free delivery",
    delivered: (eta) => `Delivered ${eta}`,
    hours: (h) => `Calls: ${h}`,
    ugc: (v) => [
      `Opening: ${v.hook}`,
      `The product in hand, in daylight: ${v.product}`,
      `Close-up on: ${v.section}`,
      `The offer on screen: ${v.offer}, ${v.price}`,
      "Cash on delivery, said to camera",
      "End: the tap that orders on the page",
    ],
    visual: {
      "cutout-stage": "The product cut out on a plain backdrop, side light and a soft shadow below.",
      "framed-stage": "The product centred in a calm frame, one colour of the page.",
      "full-bleed-crop": "A full-screen image, the product close and cropped at the edge, in daylight.",
      framed: "A clean framed photo, the whole product readable, no extra props.",
      "tight-detail": "Very tight shots of the details: the texture, the cap, the finish.",
      "tonal-duotone": "An image in two tones of the page, the product sharp in the centre.",
      "grid-contact": "A grid of small photos: the product from several angles and in use.",
    },
  },
};

/* ------------------------------------------------------------------ */
/* facts                                                               */
/* ------------------------------------------------------------------ */

interface Facts {
  product: string;
  offers: { offer: Offer; label: Record<Loc, string>; price: string; totalCents: number }[];
  defaultIdx: number;
  fee: Record<Loc, string | null>;
  freeDelivery: boolean;
  eta: Record<Loc, string | null>;
  upsell: { title: string; price: string } | null;
  money: (cents: number) => string;
}

function factsOf(i: CompileKitInput): Facts {
  const { doc } = i;
  const money = (cents: number) => fmtCents(cents, moneyFormat(doc.currency, doc.locale));
  const feeCents = toCents(doc.offers.shippingFee);
  const available = doc.offers.bundles.filter((b) => !b.soldOut);
  const list = available.length ? available : doc.offers.bundles.slice(0, 1);
  const offers = list.map((offer) => {
    const label = Object.fromEntries(LOCS.map((l) => [l, plain(offerName({ doc: { ...doc, locale: l } }, offer))])) as Record<Loc, string>;
    const cents = toCents(offer.price);
    return { offer, label, price: money(cents), totalCents: cents + (offer.freeShipping ? 0 : feeCents) };
  });
  const defId = defaultOfferId(doc.offers, doc.items);
  const defaultIdx = Math.max(0, offers.findIndex((o) => o.offer.id === defId));
  const fee = Object.fromEntries(
    LOCS.map((l) => [l, deliverySummary(i.zones, l, { fee: feeCents === 0 ? { free: true } : { free: false, text: money(feeCents) } }).feeText]),
  ) as Record<Loc, string | null>;
  const eta = Object.fromEntries(LOCS.map((l) => [l, deliverySummary(i.zones, l, { leadDays: i.leadDays ?? 0 }).etaText])) as Record<Loc, string | null>;
  const up = doc.offers.upsell?.enabled ? doc.offers.upsell : null;
  return {
    product: plain(doc.product.name),
    offers,
    defaultIdx,
    fee,
    freeDelivery: feeCents === 0,
    eta,
    upsell: up ? { title: plain(up.title), price: money(toCents(up.price)) } : null,
    money,
  };
}

/** The facts as texts: the only sources of a number in the kit (prices, quantities, fee, ETA range, totals). */
export function factTexts(f: Pick<Facts, "offers" | "fee" | "eta" | "upsell" | "money">): string[] {
  return [
    ...f.offers.flatMap((o) => [...LOCS.map((l) => o.label[l]), o.price, f.money(o.totalCents), ...o.offer.lines.map((l) => String(l.qty))]),
    ...LOCS.flatMap((l) => [f.fee[l] ?? "", f.eta[l] ?? ""]),
    f.upsell ? `${f.upsell.title} ${f.upsell.price}` : "",
  ].filter(Boolean);
}

/** The guard's number set over the facts (ai.md AI-§D.2 rule 5): what `compileKit` and `test:kit` both check with. */
export function kitAllowedNumbers(i: Pick<CompileKitInput, "doc" | "zones" | "leadDays">) {
  return allowedNumbersFor({ locale: i.doc.locale, productName: i.doc.product.name, facts: factTexts(factsOf(i as CompileKitInput)) });
}

/* ------------------------------------------------------------------ */
/* angles                                                              */
/* ------------------------------------------------------------------ */

interface Tagged {
  sectionId: string;
  type: string;
  title: string;
  tag: string;
}

/**
 * The page's titles with their structure tags (DES-§9.5), in angle order: every section's own title first (by
 * PRIORITY), then the titles of its entries (a benefit, a step, a promise), so a page whose section titles share one
 * structure still offers the others it shows.
 */
export function taggedSections(doc: PageDoc): Tagged[] {
  const rank = (type: string) => {
    const r = PRIORITY.indexOf(type);
    return r < 0 ? PRIORITY.length : r;
  };
  const titleOf = (data: Record<string, unknown>) => [data.title, data.heading, data.headline].find((v): v is string => typeof v === "string" && v.trim() !== "");
  const own: Tagged[] = [];
  const entries: Tagged[] = [];
  for (const s of doc.sections) {
    if (s.hidden || CHROME.has(s.type)) continue;
    const raw = titleOf(s.data);
    if (raw && plain(raw)) own.push({ sectionId: s.id, type: s.type, title: plain(raw), tag: structureOf(raw, doc.locale) });
    for (const key of ITEM_LISTS) {
      const list = s.data[key];
      if (!Array.isArray(list)) continue;
      for (const item of list) {
        const t = item && typeof item === "object" ? titleOf(item as Record<string, unknown>) : undefined;
        if (t && plain(t)) entries.push({ sectionId: s.id, type: s.type, title: plain(t), tag: structureOf(t, doc.locale) });
      }
    }
  }
  const byRank = (a: Tagged, b: Tagged) => rank(a.type) - rank(b.type);
  return [...own.sort(byRank), ...entries.sort(byRank)];
}

/** The first section of each structure tag, in angle order. */
export function distinctTags(sections: readonly Tagged[]): Tagged[] {
  const seen = new Set<string>();
  return sections.filter((s) => {
    if (seen.has(s.tag)) return false;
    seen.add(s.tag);
    return true;
  });
}

/** A copy-library headline of the product's family with this structure, ready for the locale (or null). */
function libraryHook(i: CompileKitInput, loc: Loc, tag: string | null, seed: number, ok: (s: string) => boolean): string | null {
  const { family } = copyFamily({ category: i.doc.product.category, productName: i.doc.product.name });
  const lines = libraryFor(loc).families[family]?.headline ?? [];
  const ref = loc === "fr" ? productRef(i.doc.product.name, "fr") : null;
  const candidates: string[] = [];
  for (const line of lines) {
    if (tag !== null && lineTag(line, loc).s !== tag) continue;
    const src = typeset(loc, lineText(line));
    if (/\{(?:delivery|where|wa:)/.test(src)) continue;
    const t = ref ? frTemplate(src, ref) : src;
    if (t === null) continue;
    const text = plain(fillSlots(t, { product: plain(i.doc.product.name), delivery: "", where: "" }));
    if (text && wordCount(text) <= HOOK_MAX_WORDS && ok(text)) candidates.push(text);
  }
  return candidates.length ? candidates[seed % candidates.length]! : null;
}

const docLocOf = (doc: PageDoc): Loc => (doc.locale === "ar" || doc.locale === "fr" ? doc.locale : "en");

function anglesOf(i: CompileKitInput, f: Facts, ok: (s: string, l: Loc) => boolean): { brief: AdBrief; tagCount: number } {
  const sections = distinctTags(taggedSections(i.doc));
  const docLoc = docLocOf(i.doc);
  const def = f.offers[f.defaultIdx]!;
  const picked: Tagged[] = sections.length ? sections.slice(0, ANGLES) : [{ sectionId: "product", type: "product", title: f.product, tag: structureOf(f.product, i.doc.locale) }];
  const treatment = i.doc.theme.look?.img ?? "framed";
  const angles: AdBrief["angles"] = picked.map((s, n) => {
    const seed = seedOf(`${i.version.id}:${s.tag}`);
    const hook = {} as Record<Loc, string>;
    const primary = {} as Record<Loc, string>;
    const headline = {} as Record<Loc, string>;
    for (const l of LOCS) {
      const own = l === docLoc && wordCount(s.title) <= HOOK_MAX_WORDS && ok(s.title, l) ? s.title : null;
      const h = libraryHook(i, l, s.tag, seed, (t) => ok(t, l)) ?? own ?? libraryHook(i, l, null, seed, (t) => ok(t, l)) ?? f.product;
      hook[l] = h;
      const w = WORDS[l];
      const tail = [`${def.label[l]}: ${def.price}`, w.cod, f.freeDelivery ? w.freeDelivery : null, f.eta[l] ? w.delivered(f.eta[l]!) : null].filter(Boolean).join(". ");
      // a question keeps its mark; any other hook ends on a period before the facts
      primary[l] = `${/[?؟]$/u.test(h) ? h : `${h.replace(/[.!]+$/u, "")}.`} ${tail}.`;
      headline[l] = n === 0 ? f.product : n === 1 ? `${def.label[l]}: ${def.price}` : w.cod;
    }
    return {
      id: s.tag,
      tag: s.tag,
      name: s.title,
      hook,
      primary,
      headline,
      visual: WORDS[docLoc].visual[treatment] ?? WORDS[docLoc].visual.framed!,
      ugc15: WORDS[docLoc].ugc({ hook: hook[docLoc], product: f.product, section: s.title, offer: def.label[docLoc], price: def.price }),
    };
  });
  return { brief: { angles, doNotSay: doNotSayOf(i), compliance: ["cod", "no_before_after", "no_body_question", "no_guarantee"], source: "library" }, tagCount: sections.length };
}

/** LAN-§13.3: every claim the store did not make. */
function doNotSayOf(i: CompileKitInput): string[] {
  const { doc, policies } = i;
  const now = (i.now ?? new Date()).getTime();
  const end = doc.offers.urgency.countdownEnd ? Date.parse(doc.offers.urgency.countdownEnd) : NaN;
  const out: string[] = ["medical"];
  if (toCents(doc.offers.shippingFee) !== 0) out.push("free_delivery");
  if (!doc.product.rating) out.push("ratings");
  if (!(Number.isFinite(end) && end > now)) out.push("deadline");
  if (doc.offers.urgency.stockLeft === undefined) out.push("stock");
  if (policies.returns.accepted !== true) out.push("returns");
  if (policies.inspection !== "allowed") out.push("inspection");
  out.push("numbers");
  return out;
}

/* ------------------------------------------------------------------ */
/* script                                                              */
/* ------------------------------------------------------------------ */

/** The variables the kit fills from the page; every other one stays a {placeholder} (the customer's, the agent's). */
const PAGE_VARS: ReadonlySet<TemplateVar> = new Set<TemplateVar>(["product", "offer_label", "units_text", "qty", "total", "shipping_text", "eta_text", "store_name", "upsell_title", "upsell_price"]);

/** A template with the page's values in and the other variables kept; an optional block with an empty page value goes. */
export function kitText(src: string, values: Partial<Record<TemplateVar, string>>): string {
  const parsed = parseTemplate(src, { max: 4_000 });
  if (!parsed.ok) return "";
  const part = (p: { kind: "text"; text: string } | { kind: "var"; name: TemplateVar }): string | null => {
    if (p.kind === "text") return p.text;
    if (!PAGE_VARS.has(p.name)) return `{${p.name}}`;
    const v = (values[p.name] ?? "").trim();
    return v ? v : null;
  };
  let out = "";
  for (const p of parsed.parts) {
    if (p.kind === "optional") {
      const bits = p.parts.map(part);
      if (bits.every((b) => b !== null)) out += bits.join("");
    } else out += part(p) ?? "";
  }
  return out.replace(/\s+/g, " ").trim();
}

function scriptOf(i: CompileKitInput, f: Facts): CampaignKit["script"] {
  const docLoc = docLocOf(i.doc);
  const docs = Object.fromEntries(LOCS.map((l) => [l, i.scripts?.[l] ?? (l === docLoc ? i.templates.script : BUILTIN_SCRIPTS[l])])) as Record<Loc, ScriptDoc>;
  const def = f.offers[f.defaultIdx]!;
  const qty = def.offer.lines.reduce((n, l) => n + l.qty, 0);
  const values = (l: Loc): Partial<Record<TemplateVar, string>> => ({
    product: f.product,
    offer_label: def.label[l],
    units_text: def.label[l],
    qty: String(qty),
    total: f.money(def.totalCents),
    shipping_text: f.fee[l] ?? "",
    eta_text: f.eta[l] ?? "",
    store_name: i.store.name,
    upsell_title: f.upsell?.title ?? "",
    upsell_price: f.upsell?.price ?? "",
  });
  const steps: CampaignKit["script"]["steps"] = [];
  const now = i.now ?? new Date();
  const w = i.window;
  if (w && !noShopperHours(w, now)) {
    const hours = Object.fromEntries(LOCS.map((l) => [l, weekHoursText(w, l, l, now)])) as Record<Loc, string>;
    if (LOCS.every((l) => hours[l])) steps.push({ id: "hours", text: Object.fromEntries(LOCS.map((l) => [l, WORDS[l].hours(hours[l])])) as Record<Loc, string> });
  }
  const order: string[] = [];
  for (const l of [docLoc, ...LOCS]) for (const s of docs[l].steps) if (!order.includes(s.id)) order.push(s.id);
  for (const id of order) {
    const text = {} as Record<Loc, string>;
    for (const l of LOCS) {
      const s = docs[l].steps.find((x) => x.id === id);
      const v = values(l);
      text[l] = !s || (s.when === "upsell" && !(v.upsell_title && v.upsell_price)) ? "" : kitText(s.say, v);
    }
    if (LOCS.some((l) => text[l])) steps.push({ id, text });
  }
  const objIds: string[] = [];
  for (const l of [docLoc, ...LOCS]) for (const o of docs[l].objections) if (!objIds.includes(o.id)) objIds.push(o.id);
  for (const id of objIds) {
    // the built-in "trust" answer says the parcel is seen before paying: only a store that allows inspection says it
    if (id === "trust" && i.policies.inspection !== "allowed") continue;
    const text = {} as Record<Loc, string>;
    for (const l of LOCS) {
      const o = docs[l].objections.find((x) => x.id === id);
      const v = values(l);
      // an answer needing a page fact the page lacks is dropped (OPE-§7.3: each only restates stored facts)
      const needs = o ? [...o.say.replace(/\[\[[\s\S]*?\]\]/g, "").matchAll(/\{([a-z_]+)\}/g)].map((m) => m[1] as TemplateVar) : [];
      text[l] = o && needs.every((n) => !PAGE_VARS.has(n) || (v[n] ?? "").trim()) ? kitText(o.say, v) : "";
    }
    if (LOCS.some((l) => text[l])) steps.push({ id: `obj_${id}`, text });
  }
  return { steps };
}

/* ------------------------------------------------------------------ */
/* pixel plan                                                          */
/* ------------------------------------------------------------------ */

function pixelPlanOf(i: CompileKitInput): CampaignKit["pixelPlan"] {
  const refs = trackingRefs(i.doc.tracking as Record<string, unknown>);
  const lib = new Map(i.pixels.pixels.map((p) => [`${p.platform}:${p.id}`, p]));
  const pixels = refs.map((r) => pixelLabel(lib.get(`${r.platform}:${r.id}`), r.platform, r.id));
  const purchaseWhere = i.trigger === "order" ? "thank_you" : i.trigger === "confirmed" ? "server_confirmed" : "server_delivered";
  const events = refs.length
    ? [
        { name: "PageView", where: "page_load" },
        { name: "ViewContent", where: "page_load" },
        { name: "AddToCart", where: "offer_pick" },
        { name: "InitiateCheckout", where: "form_start" },
        { name: "Lead", where: "phone_valid" },
        { name: "Purchase", where: purchaseWhere },
      ]
    : [];
  const testHint = refs.some((r) => lib.get(`${r.platform}:${r.id}`)?.testCode === true);
  return { pixels, trigger: i.trigger, events, testHint };
}

/* ------------------------------------------------------------------ */
/* compile                                                             */
/* ------------------------------------------------------------------ */

export function compileKit(input: CompileKitInput): CompileKitResult {
  const problems: CompileKitResult["problems"] = [];
  const locales = [...new Set(input.locales.filter((l): l is Loc => LOCS.includes(l)))];
  if (!locales.length) {
    problems.push({ code: "no_locale" });
    locales.push(docLocOf(input.doc));
  }
  const f = factsOf(input);
  const allowed = allowedNumbersFor({ locale: input.doc.locale, productName: input.doc.product.name, facts: factTexts(f) });
  const ok = (s: string, l: Loc) => !bannedIn(s) && numbersIn(s, l).every((t) => allowed.allows(t));
  const { brief: template, tagCount } = anglesOf(input, f, ok);
  if (tagCount < ANGLES) problems.push({ code: "no_structure_tags", detail: String(tagCount) });
  const pixelPlan = pixelPlanOf(input);
  if (!pixelPlan.pixels.length) problems.push({ code: "pixel_missing" });
  const first = locales[0]!;

  const kit: CampaignKit = {
    v: 1,
    compiledAt: (input.now ?? new Date()).toISOString(),
    locales,
    facts: {
      product: f.product,
      offers: f.offers.map((o) => ({ label: o.label[first], price: o.price })),
      fee: f.fee[first],
      eta: LOCS.every((l) => f.eta[l]) ? (f.eta as Record<Loc, string>) : null,
    },
    links: input.links.map((l) => ({ channel: l.channel, shortLinkId: l.shortLinkId, url: l.url, utm: l.utm })),
    whatsappConfirm: { ar: input.templates.confirm.ar ?? "", fr: input.templates.confirm.fr ?? "", en: input.templates.confirm.en ?? "" },
    script: scriptOf(input, f),
    brief: input.cloud?.brief ?? template,
    pixelPlan,
  };
  return { kit, offersHash: pricingFingerprint(input.doc), problems };
}
