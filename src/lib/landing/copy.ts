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

/* ------------------------------------------------------------------ */
/* The tracking page (LAN-§9.4, §24.2 `trk.*`)                         */
/* ------------------------------------------------------------------ */

/** Step verbs of the timeline (LAN-§9.2): verbs, never numbers. */
export type TrkStepCopy = Record<"placed" | "confirmed" | "shipped" | "out_for_delivery" | "delivered" | "cancelled" | "returned", string>;

export interface TrkCopy {
  title: string;
  lead: string;
  hello: string;
  orderNo: string;
  last4: string;
  find: string;
  another: string;
  placedOn: string;
  phone: string;
  total: string;
  step: TrkStepCopy;
  timeline: string;
  shippedWith: string;
  carrierRef: string;
  confirmedOn: string;
  needChange: string;
  changeAddress: string;
  cancel: string;
  other: string;
  requested: string;
  sheetNote: string;
  sheetText: string;
  send: string;
  close: string;
  sent: string;
  notFound: string;
  rateLimited: string;
  closed: string;
  error: string;
  whatsapp: string;
  /** the prefilled WhatsApp text: "Bonjour, ma commande {order_id} : " */
  waText: string;
  call: string;
  hours: string;
  noscript: string;
  returnsIn: string;
  returns: string;
  storeLinks: string;
}

export const TRK: Readonly<Record<ShopperLocale, TrkCopy>> = {
  ar: {
    title: "تتبّع الطلب",
    lead: "دخّل رقم الطلب و آخر 4 أرقام ديال التيليفون ديالك.",
    hello: "مرحبا {name}",
    orderNo: "رقم الطلب",
    last4: "آخر 4 أرقام ديال التيليفون ديالك",
    find: "شوف الطلب ديالي",
    another: "تتبّع طلب آخر",
    placedOn: "تدار نهار {date}",
    phone: "التيليفون",
    total: "المجموع",
    step: {
      placed: "توصلنا بالطلب",
      confirmed: "تأكد الطلب",
      shipped: "خرج مع شركة التوصيل",
      out_for_delivery: "الموزع فالطريق ليك",
      delivered: "توصلتي بالطلب",
      cancelled: "تلغى الطلب",
      returned: "رجع للمتجر",
    },
    timeline: "فين وصل الطلب",
    shippedWith: "خرج مع {carrier}",
    carrierRef: "المرجع {ref}",
    confirmedOn: "تأكد الطلب نهار {date}",
    needChange: "بغيتي تبدّل شي حاجة؟",
    changeAddress: "بدّل العنوان ديالي",
    cancel: "لغي الطلب ديالي",
    other: "طلب آخر",
    requested: "الطلب تصيفط",
    sheetNote: "المتجر غادي يتواصل معاك.",
    sheetText: "زيد شي تفاصيل إلا بغيتي (اختياري)",
    send: "صيفط الطلب",
    close: "سدّ",
    sent: "الطلب ديالك وصل. المتجر غادي يتواصل معاك.",
    notFound: "ما لقيناش هاد الطلب. تأكد من الرقم ومن الأرقام الأربعة.",
    rateLimited: "بزاف ديال المحاولات. عاود من بعد شي دقايق.",
    closed: "هاد الطلب خرج ديجا: كتب للمتجر إلا بغيتي شي حاجة.",
    error: "وقع مشكل. عاود من بعد شوية.",
    whatsapp: "كتب للمتجر فواتساب",
    waText: "السلام عليكم، الطلب ديالي {order_id}: ",
    call: "عيّط للمتجر",
    hours: "الأوقات: {hours}",
    noscript: "شغّل JavaScript باش تقلب على الطلب ديالك، ولا كتب للمتجر فواتساب.",
    returnsIn: "الإرجاع مقبول خلال {n} {days}.",
    returns: "الإرجاع مقبول.",
    storeLinks: "معلومات المتجر",
  },
  fr: {
    title: "Suivi de commande",
    lead: "Entrez votre numéro de commande et les 4 derniers chiffres de votre téléphone.",
    hello: "Bonjour {name}",
    orderNo: "Numéro de commande",
    last4: "4 derniers chiffres de votre téléphone",
    find: "Voir ma commande",
    another: "Suivre une autre commande",
    placedOn: "Passée le {date}",
    phone: "Téléphone",
    total: "Total",
    step: {
      placed: "Commande reçue",
      confirmed: "Confirmée",
      shipped: "Expédiée",
      out_for_delivery: "En cours de livraison",
      delivered: "Livrée",
      cancelled: "Annulée",
      returned: "Retournée à la boutique",
    },
    timeline: "Où en est votre commande",
    shippedWith: "Expédiée avec {carrier}",
    carrierRef: "Réf. {ref}",
    confirmedOn: "Confirmée le {date}",
    needChange: "Besoin d'un changement ?",
    changeAddress: "Changer mon adresse",
    cancel: "Annuler ma commande",
    other: "Autre demande",
    requested: "Demande envoyée",
    sheetNote: "La boutique vous contactera.",
    sheetText: "Précisez si besoin (facultatif)",
    send: "Envoyer la demande",
    close: "Fermer",
    sent: "Demande envoyée. La boutique vous contacte.",
    notFound: "Nous ne trouvons pas cette commande. Vérifiez le numéro et les 4 chiffres.",
    rateLimited: "Trop d'essais. Réessayez dans quelques minutes.",
    closed: "Cette commande est déjà expédiée : écrivez à la boutique pour toute demande.",
    error: "Une erreur est survenue. Réessayez dans un instant.",
    whatsapp: "Écrire à la boutique sur WhatsApp",
    waText: "Bonjour, ma commande {order_id} : ",
    call: "Appeler la boutique",
    hours: "Horaires : {hours}",
    noscript: "Activez JavaScript pour retrouver votre commande, ou écrivez à la boutique sur WhatsApp.",
    returnsIn: "Retours acceptés sous {n} {days}.",
    returns: "Retours acceptés.",
    storeLinks: "Informations de la boutique",
  },
  en: {
    title: "Order tracking",
    lead: "Enter your order number and the last 4 digits of your phone.",
    hello: "Hello {name}",
    orderNo: "Order number",
    last4: "Last 4 digits of your phone",
    find: "Show my order",
    another: "Track another order",
    placedOn: "Placed on {date}",
    phone: "Phone",
    total: "Total",
    step: {
      placed: "Order received",
      confirmed: "Confirmed",
      shipped: "Shipped",
      out_for_delivery: "Out for delivery",
      delivered: "Delivered",
      cancelled: "Cancelled",
      returned: "Returned to the store",
    },
    timeline: "Where your order is",
    shippedWith: "Shipped with {carrier}",
    carrierRef: "Ref. {ref}",
    confirmedOn: "Confirmed on {date}",
    needChange: "Need a change?",
    changeAddress: "Change my address",
    cancel: "Cancel my order",
    other: "Other request",
    requested: "Request sent",
    sheetNote: "The store will contact you.",
    sheetText: "Add details if you like (optional)",
    send: "Send request",
    close: "Close",
    sent: "Request sent. The store will contact you.",
    notFound: "We can't find this order. Check the number and the 4 digits.",
    rateLimited: "Too many tries. Try again in a few minutes.",
    closed: "This order has already shipped: message the store for any request.",
    error: "Something went wrong. Try again in a moment.",
    whatsapp: "Message the store on WhatsApp",
    waText: "Hello, my order {order_id}: ",
    call: "Call the store",
    hours: "Hours: {hours}",
    noscript: "Turn on JavaScript to look up your order, or message the store on WhatsApp.",
    returnsIn: "Returns accepted within {n} {days}.",
    returns: "Returns accepted.",
    storeLinks: "Store information",
  },
};

/** The day word after a count in the returns line: Arabic 2 to 10 take the plural, French and English 1 the singular. */
export function trkDays(n: number, locale: ShopperLocale): string {
  if (locale === "ar") return n >= 2 && n <= 10 ? "أيام" : "يوم";
  if (locale === "fr") return n === 1 ? "jour" : "jours";
  return n === 1 ? "day" : "days";
}

/** The shopper locale of a page locale: ar and fr as they are, every other locale reads the English copy. */
export const shopperLocaleOf = (locale: string | null | undefined): ShopperLocale => (locale === "ar" || locale === "fr" ? locale : "en");

/* ------------------------------------------------------------------ */
/* The thank-you blocks (LAN-§8.1, §8.3, §24.2 `ty.*`)                 */
/* ------------------------------------------------------------------ */

/** Plural forms of one phrase: `Intl.PluralRules` picks the form, `other` is the fallback (and the form the spec shows). */
export type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };

export interface TyCopy {
  /** the pill beside the order number */
  confirm: string;
  /** the call step with a time: "Nous vous appelons du {phone} pour confirmer, {when}." */
  expect: string;
  /** the same sentence without `{when}` (no saved window, no time to promise) */
  expectPlain: string;
  expectSave: string;
  /** `{when}` inside a calling range with `withinHours`: "dans les {n} heures" */
  whenWithin: PluralForms;
  /** `{when}` inside a calling range without `withinHours` */
  whenNow: string;
  whenToday: string;
  whenTomorrow: string;
  /** `{day}`: the weekday name in the page language */
  whenDay: string;
  track: string;
}

export const TY: Readonly<Record<ShopperLocale, TyCopy>> = {
  ar: {
    confirm: "أكّد الطلب فواتساب",
    expect: "غادي نعيطو ليك من {phone} باش نأكدو الطلب، {when}.",
    expectPlain: "غادي نعيطو ليك من {phone} باش نأكدو الطلب.",
    expectSave: "سجّل هاد الرقم باش تعرف بلي حنا اللي كنعيطو.",
    whenWithin: { one: "فساعة الجاية", two: "فساعتين الجايين", few: "فـ{n} ساعات الجايين", many: "فـ{n} ساعة الجاية", other: "فـ{n} ساعة الجاية" },
    whenNow: "اليوم",
    whenToday: "اليوم من {time}",
    whenTomorrow: "غدا من {time}",
    whenDay: "نهار {day} من {time}",
    track: "تتبّع الطلب ديالي",
  },
  fr: {
    confirm: "Confirmer sur WhatsApp",
    expect: "Nous vous appelons du {phone} pour confirmer, {when}.",
    expectPlain: "Nous vous appelons du {phone} pour confirmer.",
    expectSave: "Enregistrez ce numéro pour reconnaître notre appel.",
    whenWithin: { one: "dans l'heure", other: "dans les {n} heures" },
    whenNow: "aujourd'hui",
    whenToday: "aujourd'hui à partir de {time}",
    whenTomorrow: "demain à partir de {time}",
    whenDay: "{day} à partir de {time}",
    track: "Suivre ma commande",
  },
  en: {
    confirm: "Confirm on WhatsApp",
    expect: "We'll call you from {phone} to confirm, {when}.",
    expectPlain: "We'll call you from {phone} to confirm.",
    expectSave: "Save this number so you recognise our call.",
    whenWithin: { one: "within the hour", other: "within {n} hours" },
    whenNow: "today",
    whenToday: "today from {time}",
    whenTomorrow: "tomorrow from {time}",
    whenDay: "{day} from {time}",
    track: "Track my order",
  },
};

/** The form of `n` in `locale` (`Intl.PluralRules`), `{n}` filled; `other` when the runtime has no plural data. */
export function plural(forms: PluralForms, n: number, locale: ShopperLocale): string {
  let rule: Intl.LDMLPluralRule = "other";
  try {
    rule = new Intl.PluralRules(locale).select(n);
  } catch {
    /* no plural data: the `other` form */
  }
  return fill(forms[rule] ?? forms.other, { n });
}

/* ------------------------------------------------------------------ */
/* Order on WhatsApp (LP-11, wave 2; LAN-§11, §24.2 `wa.*`)            */
/* ------------------------------------------------------------------ */

export interface WaCopy {
  button: string;
  ready: string;
  toConfirm: string;
  /** the builder preview's note under the button (LAN-§5.3) */
  liveOnly: string;
}

export const WA: Readonly<Record<ShopperLocale, WaCopy>> = {
  ar: { button: "دير الطلب فواتساب", ready: "الرسالة واجدة فواتساب · المرجع {ref}", toConfirm: "باقي خاصنا نعرفو: {list}", liveOnly: "كيخدم غير فالصفحة المنشورة" },
  fr: { button: "Commander sur WhatsApp", ready: "Votre message est prêt dans WhatsApp · Réf. {ref}", toConfirm: "À préciser : {list}", liveOnly: "Fonctionne sur la page en ligne" },
  en: { button: "Order on WhatsApp", ready: "Your message is ready in WhatsApp · Ref. {ref}", toConfirm: "To confirm: {list}", liveOnly: "Works on the live page" },
};

/* ------------------------------------------------------------------ */
/* Page-wide lines (LAN-§14.3, §3.9, §17.4; §24.2)                     */
/* ------------------------------------------------------------------ */

export interface LpCopy {
  /** `test.banner`: the chip of a test order */
  testBanner: string;
  /** `link.inactive`: a short link or a test link that no longer works */
  linkInactive: string;
  /** `link.home`: the inactive link page's way back to the store home */
  linkHome: string;
  /** `lp.report`: the same words as the storefront's `footer.report` */
  report: string;
  /** `lp.reload` (R2) */
  reload: string;
}

export const LP: Readonly<Record<ShopperLocale, LpCopy>> = {
  ar: { testBanner: "طلب تجريبي: ما كيتحسبش", linkInactive: "هاد الرابط ما بقاش خدام.", linkHome: "سير للصفحة الرئيسية ديال المتجر", report: "بلّغ على هاد المتجر", reload: "عاود حمّل الصفحة" },
  fr: { testBanner: "Commande test : non comptée", linkInactive: "Ce lien n'est plus actif.", linkHome: "Aller à l'accueil de la boutique", report: "Signaler cette boutique", reload: "Recharger la page" },
  en: { testBanner: "Test order: not counted", linkInactive: "This link is no longer active.", linkHome: "Go to the store home", report: "Report this store", reload: "Reload the page" },
};
