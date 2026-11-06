/**
 * The 40 synthetic orders the template texts are proven on (P5 INTEGRATIONS; operations.md OPE-§O.1 templates
 * paragraph, OPE-§7.4 acceptance, OPE-§O.4 IN-05, OP-05, LP-04). Data only, pure: ./templates.selftest.ts renders every
 * WhatsApp built-in over them in ar, fr and en; P4's script tests may read the same orders (read-only import).
 *
 * Every person, phone and address is invented. Across the 40: the three order locales; with and without a landmark,
 * a city, an address, a zone ETA, an upsell (offered, or already taken), a hold (future, or passed), a carrier and
 * tracking number, a saved calling window; free and paid delivery; totals under and over 1,000 (grouped digits);
 * a confirmation number set as the caller phone, as WhatsApp digits only, or not at all; another market's store
 * (EUR, +33); and four long carts whose `units_text` passes the WhatsApp caps in Arabic.
 */
import type { OrderItems, OrderUnit } from "@/lib/db/schema";
import type { TemplateFacts, TemplateOrder } from "./template-values";
import type { TemplateLocale } from "./whatsapp/builtins";

export interface TemplateFixture {
  name: string;
  /** the order's locale */
  locale: TemplateLocale;
  order: TemplateOrder;
  store: TemplateFacts["store"];
  viewerName: string | null;
  confirmation: TemplateFacts["confirmation"];
  /** the zone line's ETA text per locale; null = no zone / no ETA */
  eta: Record<TemplateLocale, string> | null;
  /** today's hours line once the owner saved the window (OD63); null = never saved */
  hours: string | null;
  /** the version doc's upsell, offered (not taken); null = none or taken */
  upsell: TemplateFacts["upsell"];
  trackingLink: string | null;
}

/** Tuesday 3 November 2026, 11:00 in Casablanca */
export const FIXTURE_NOW = new Date("2026-11-03T10:00:00.000Z");

const NAMES = ["Salma Benali", "Youssef El Amrani", "سلمى بنعلي", "Khadija Ouazzani", "Hamza Tazi", "يوسف العمراني", "Imane Chraibi", "Mehdi Alaoui", "Nadia Berrada", "Omar Lahlou", "Anaïs Martin", "خديجة الوزاني"];
const CITIES = ["Casablanca", "Rabat", "Fès", "Marrakech", "Tanger", "Agadir", "Oujda", "Kénitra"];
const ADDRESSES = ["Rue Ibnou Mounir, résidence Al Amal, appt 4", "حي السلام، زنقة 12، رقم 7", "12 boulevard Zerktouni", "Lotissement Al Wifaq, villa 33", "Derb Sultan, rue 8 n° 21"];
const LANDMARKS = ["en face de la pharmacie Al Amal", "قرب المسجد الكبير", "next to the Marjane car park", "à côté de l'école Ibn Battouta"];
const STORES: TemplateFacts["store"][] = [
  { name: "Nour Cosmetics", market: "MA", timezone: "Africa/Casablanca" },
  { name: "متجر الأطلس", market: "MA", timezone: "Africa/Casablanca" },
  { name: "Atlas Home", market: "MA", timezone: "Africa/Casablanca" },
];
const AGENTS = ["Samira Idrissi", "Karim", "ليلى"];
/** `store.confirmation`: the caller phone, WhatsApp digits only, unset */
const CONFIRMATIONS: TemplateFacts["confirmation"][] = [{ callerPhone: "+212522123456" }, { whatsapp: "212698765432" }, null];

const ETA: Record<TemplateLocale, string> = {
  fr: "entre le jeu. 5 nov. et le sam. 7 nov.",
  ar: "بين الخميس 5 نونبر والسبت 7 نونبر",
  en: "between Thu 5 Nov and Sat 7 Nov",
};

const unit = (value: string, code: string, size?: string): OrderUnit => ({
  item: "main",
  label: "",
  options: [{ name: "Couleur", value, code }, ...(size ? [{ name: "Taille", value: `Taille ${size}`, code: `T${size}` }] : [])],
});

/** a two-item pack, a free unit and a typed field */
const PACK: OrderUnit[] = [
  { item: "huile", label: "Huile d'argan 50 ml", short: "Huile 50", options: [] },
  { item: "savon", label: "Savon noir", short: "Savon", options: [{ name: "Parfum", value: "Eucalyptus", code: "EUC" }] },
  { item: "savon", label: "Savon noir", short: "Savon", free: true, options: [{ name: "Parfum", value: "Rose", code: "RS" }] },
];

/** a long cart: 18 distinct units with long Arabic and French labels */
function longCart(seed: number): OrderUnit[] {
  const colours = ["أسود ليلي", "Bleu nuit profond", "أخضر زيتوني", "Blanc cassé naturel", "رمادي فاتح", "Beige sable du désert"];
  return Array.from({ length: 18 }, (_, k) => ({
    item: `i${k}`,
    label: `${k % 2 ? "Coffret soin visage complet" : "مجموعة العناية الكاملة بالوجه"} ${k + seed}`,
    short: `Coffret ${k + seed}`,
    options: [{ name: "Couleur", value: colours[(k + seed) % colours.length]!, code: `C${k}` }],
    fields: [{ name: "Message", value: k % 3 ? "عيد ميلاد سعيد يا أمي الغالية" : "Joyeux anniversaire maman" }],
  }));
}

function items(i: number, units: OrderUnit[], label: string, unitPrice: number, takenUpsell: boolean): OrderItems {
  return {
    v: 2,
    bundleId: `b${i % 3}`,
    bundleLabel: label,
    qty: units.length,
    unitPrice,
    variants: [],
    units,
    ...(i % 6 === 1 ? { gift: { label: "Pochette en coton" } } : {}),
    ...(takenUpsell ? { upsell: { title: "Savon noir 200 g", price: 59 } } : {}),
  };
}

function fixture(i: number): TemplateFixture {
  // the flags use co-prime cycles so every combination the tests look for occurs (e.g. #37: fr, landmark, upsell, paid delivery)
  const locale = (["fr", "ar", "en"] as const)[i % 3]!;
  const foreign = i % 20 === 19;
  const long = i % 10 === 7;
  const landmark = Math.floor(i / 2) % 2 === 0;
  const eta = i % 4 !== 3;
  const takenUpsell = i % 8 === 5;
  const offeredUpsell = i % 5 === 1 && !takenUpsell;
  const free = i % 4 === 2;
  const big = i % 7 === 3;
  const hold = i % 6 === 2 ? new Date("2026-11-10T09:00:00.000Z") : i % 6 === 3 ? new Date("2026-10-30T09:00:00.000Z") : null;
  const tracked = i % 6 === 4;
  const units = long ? longCart(i) : i % 2 ? PACK : [unit(i % 4 ? "Noir" : "Rose poudré", i % 4 ? "NR" : "RP", i % 5 ? undefined : "42"), unit("Noir", "NR")];
  const total = big ? 1299.5 + i : 149 + i * 10;
  const label = long ? "Le grand coffret (x18)" : i % 2 ? "Pack Duo (x2)" : `Offre ${units.length} pièces`;
  const confirmation = foreign ? { callerPhone: "+33612345678" } : (CONFIRMATIONS[Math.floor(i / 3) % CONFIRMATIONS.length] ?? null);
  const orderId = `CMD-${(62_000_000 + i * 1_234_567).toString(36).toUpperCase()}`;
  const tags = [
    long && "long cart",
    free ? "free delivery" : "paid delivery",
    landmark && "landmark",
    eta ? "eta" : "no eta",
    offeredUpsell && "upsell",
    takenUpsell && "upsell taken",
    hold && (hold > FIXTURE_NOW ? "hold" : "hold passed"),
    tracked && "tracking",
    big && "over 1,000",
    foreign && "EUR",
  ].filter(Boolean);
  return {
    name: `#${i + 1} ${locale}: ${tags.join(", ")}`,
    locale,
    order: {
      id: orderId,
      name: NAMES[i % NAMES.length]!,
      productName: long ? "Coffret soin visage" : ["Huile d'argan pure", "Sérum éclat", "زيت الأركان", "Montre classique"][i % 4]!,
      items: items(i, units, label, Math.round((total / units.length) * 100) / 100, takenUpsell),
      qty: units.length,
      total,
      shipping: free ? 0 : 35,
      currency: foreign ? "EUR" : "MAD",
      city: i % 9 === 8 ? null : CITIES[i % CITIES.length]!,
      address: i % 11 === 10 ? null : ADDRESSES[i % ADDRESSES.length]!,
      landmark: landmark ? LANDMARKS[i % LANDMARKS.length]! : null,
      carrierLabel: tracked ? "Amana" : null,
      trackingRef: tracked ? `AM${String(480_120_000 + i)}MA` : null,
      shipAfter: hold,
    },
    store: foreign ? { name: "Maison Claire", market: "FR", timezone: "Europe/Paris" } : STORES[i % STORES.length]!,
    viewerName: i % 6 === 5 ? null : AGENTS[i % AGENTS.length]!,
    confirmation,
    eta: eta ? ETA : null,
    hours: i % 5 === 0 ? "09:30-13:00, 14:30-21:00" : null,
    upsell: offeredUpsell ? { title: "Savon noir 200 g", price: 59 } : null,
    trackingLink: tracked ? `https://nour.storegen.ma/track?o=${orderId}&s=mkq81x0.Zx9pQ2rT7vW1yA3bC5dE6f` : null,
  };
}

export const TEMPLATE_FIXTURES: readonly TemplateFixture[] = Array.from({ length: 40 }, (_, i) => fixture(i));

/** The facts of a fixture rendered in `locale` (the queue may switch the template language, OPE-§7.2). */
export function factsOf(fx: TemplateFixture, locale: TemplateLocale, now: Date = FIXTURE_NOW): TemplateFacts {
  return {
    order: fx.order,
    locale,
    store: fx.store,
    viewerName: fx.viewerName,
    confirmation: fx.confirmation,
    etaText: fx.eta ? fx.eta[locale] : null,
    confirmHours: fx.hours ?? "",
    upsell: fx.upsell,
    trackingLink: fx.trackingLink,
    now,
  };
}
