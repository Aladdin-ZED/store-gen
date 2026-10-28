/**
 * Shopper copy defaults of the landing part (P3 LANDING; landing.md LAN-§24.2, LD26). Pure data, isomorphic, grouped
 * by surface so a chunk bundles only its own group (`assist` imports `DZ` through src/lib/delivery/eta.ts and
 * line.ts, nothing else). Arabic is Moroccan-friendly (Darija vocabulary, Arabic script); no default carries an em
 * or en dash (DG-07: words carry ranges); `{vars}` are filled as text, never as HTML.
 *
 * Day counts are composed by src/lib/delivery/eta.ts (`dayRangeText`): `range` when the bounds differ, `within` when
 * the lower bound is 0, `exact` when they are equal, `sameDay` for 0. The `[one, two, other]` triples are the plural
 * forms these numbers need (Arabic has a dual; French and English repeat `other` for two).
 */

export type ShopperLocale = "ar" | "fr" | "en";

export interface DzCopy {
  /** no city picked yet: "Livraison en 1 à 3 jours ouvrés selon la ville" ({days} = a day-count phrase) */
  general: string;
  /** a city picked: "Livraison à Fès : entre jeu. 30 et ven. 31 oct." */
  city: string;
  /** a city picked in a zone without days: "Livraison à Fès" (the fee follows) */
  cityOnly: string;
  /** "Autre" in a zone without days: "Livraison" (the fee follows) */
  deliveryOnly: string;
  /** "Autre" or no city label: "Livraison entre jeu. 30 et ven. 31 oct." */
  cityless: string;
  between: string;
  on: string;
  /** the muted marker every rendered date carries (LAN-§7.2 step 5) */
  estimated: string;
  /** pre-call surfaces of a store that confirms by phone (OPS-12) */
  afterCall: string;
  /** the clause separator before `afterCall` */
  comma: string;
  free: string;
  notServed: string;
  /** "Autre" in a not-served "*" zone */
  notServedOther: string;
  notServedCta: string;
  notServedText: string;
  notServedTextOther: string;
  range: string;
  within: readonly [one: string, two: string, other: string];
  exact: readonly [one: string, two: string, other: string];
  sameDay: string;
}

export const DZ: Readonly<Record<ShopperLocale, DzCopy>> = {
  ar: {
    general: "التوصيل {days} على حسب المدينة",
    city: "التوصيل لـ{city}: {dates}",
    cityOnly: "التوصيل لـ{city}",
    deliveryOnly: "التوصيل",
    cityless: "التوصيل {dates}",
    between: "ما بين {from} و{to}",
    on: "نهار {date}",
    estimated: "(تقريبي)",
    afterCall: "بعد التأكيد بالتيليفون",
    comma: "، ",
    free: "التوصيل بالمجان",
    notServed: "مازال ما كنوصلوش لـ{city}.",
    notServedOther: "مازال ما كنوصلوش للمدينة ديالك.",
    notServedCta: "كتب لينا فواتساب",
    notServedText: "السلام عليكم، واش كتوصلو لـ{city}؟",
    notServedTextOther: "السلام عليكم، واش كتوصلو للمدينة ديالي؟",
    range: "من {min} حتى {max} أيام ديال الخدمة",
    within: ["خلال نهار واحد ديال الخدمة", "خلال يومين ديال الخدمة", "خلال {n} أيام ديال الخدمة"],
    exact: ["فنهار واحد ديال الخدمة", "فيومين ديال الخدمة", "فـ{n} أيام ديال الخدمة"],
    sameDay: "فنفس النهار",
  },
  fr: {
    general: "Livraison {days} selon la ville",
    city: "Livraison à {city} : {dates}",
    cityOnly: "Livraison à {city}",
    deliveryOnly: "Livraison",
    cityless: "Livraison {dates}",
    between: "entre {from} et {to}",
    on: "le {date}",
    estimated: "(estimation)",
    afterCall: "après confirmation par téléphone",
    comma: ", ",
    free: "livraison gratuite",
    notServed: "Nous ne livrons pas encore à {city}.",
    notServedOther: "Nous ne livrons pas encore dans votre ville.",
    notServedCta: "Écrivez-nous sur WhatsApp",
    notServedText: "Bonjour, livrez-vous à {city} ?",
    notServedTextOther: "Bonjour, livrez-vous dans ma ville ?",
    range: "en {min} à {max} jours ouvrés",
    within: ["sous 1 jour ouvré", "sous {n} jours ouvrés", "sous {n} jours ouvrés"],
    exact: ["en 1 jour ouvré", "en {n} jours ouvrés", "en {n} jours ouvrés"],
    sameDay: "le jour même",
  },
  en: {
    general: "Delivery {days}, depending on the city",
    city: "Delivery to {city}: {dates}",
    cityOnly: "Delivery to {city}",
    deliveryOnly: "Delivery",
    cityless: "Delivery {dates}",
    between: "between {from} and {to}",
    on: "on {date}",
    estimated: "(estimated)",
    afterCall: "after we confirm by phone",
    comma: ", ",
    free: "free delivery",
    notServed: "We don't deliver to {city} yet.",
    notServedOther: "We don't deliver to your city yet.",
    notServedCta: "Message us on WhatsApp",
    notServedText: "Hello, do you deliver to {city}?",
    notServedTextOther: "Hello, do you deliver to my city?",
    range: "in {min} to {max} working days",
    within: ["within 1 working day", "within {n} working days", "within {n} working days"],
    exact: ["in 1 working day", "in {n} working days", "in {n} working days"],
    sameDay: "the same day",
  },
};

/** `{name}` placeholders filled from `vars`; an unknown placeholder is left as written (a copy bug shows, never crashes). */
export function fill(template: string, vars: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (Object.hasOwn(vars, k) ? String(vars[k]) : m));
}

/**
 * `fill` for a template that names a city after the Arabic preposition "لـ": a name with the article ("الداخلة",
 * "الدار البيضاء") contracts as written Arabic does ("للداخلة"), every other name keeps "لـفاس".
 */
export function fillCity(template: string, vars: Readonly<Record<string, string | number>> & { city: string }): string {
  const city = vars.city;
  const t = city.startsWith("ال") ? template.split("لـ{city}").join(`ل${city.slice(1)}`) : template;
  return fill(t, vars);
}
