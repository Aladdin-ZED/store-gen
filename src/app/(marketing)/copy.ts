/**
 * The platform's marketing copy (docs/STORE-SAAS.md §C.4 `(marketing)`), in Arabic, French and English. Every
 * sentence describes something the product does today; no figures, logos, testimonials or claims it cannot back.
 * French is the default locale of `/`; `?lang=ar|en` selects another (one cacheable URL per language).
 */
export type MarketingLocale = "ar" | "fr" | "en";

export const MARKETING_LOCALES: readonly MarketingLocale[] = ["fr", "ar", "en"];

export function marketingLocale(value: string | string[] | undefined): MarketingLocale {
  const v = Array.isArray(value) ? value[0] : value;
  return v === "ar" || v === "en" ? v : "fr";
}

/** `/<path>` in a locale: French has no parameter (the canonical address), the others `?lang=`. */
export function localeHref(path: `/${string}`, locale: MarketingLocale): string {
  return locale === "fr" ? path : `${path}?lang=${locale}`;
}

export interface MarketingCopy {
  dir: "rtl" | "ltr";
  languageName: string;
  nav: { signIn: string; start: string; languages: string };
  hero: { eyebrow: string; title: string; lead: string; primary: string; secondary: string };
  mock: { name: string; phone: string; city: string; order: string; note: string };
  featuresTitle: string;
  features: { title: string; body: string }[];
  stepsTitle: string;
  steps: string[];
  languages: string;
  final: { title: string; cta: string };
  footer: { terms: string; privacy: string; aup: string; rights: string };
  meta: { title: string; description: string };
}

export const COPY: Record<MarketingLocale, MarketingCopy> = {
  fr: {
    dir: "ltr",
    languageName: "Français",
    nav: { signIn: "Se connecter", start: "Créer ma boutique", languages: "Langue" },
    hero: {
      eyebrow: "Conçu pour le paiement à la livraison",
      title: "Des pages de vente qui transforment vos visites en commandes.",
      lead: "Créez une page produit soignée en quelques minutes, recevez les commandes payées à la livraison et suivez chacune jusqu'à votre client.",
      primary: "Créer ma boutique",
      secondary: "Se connecter",
    },
    mock: { name: "Nom complet", phone: "Téléphone", city: "Ville", order: "Commander", note: "Paiement à la livraison" },
    featuresTitle: "Tout ce qu'une page COD doit faire, sans réglage technique",
    features: [
      { title: "Une page à partir de vos photos", body: "Ajoutez les photos de votre produit : la page se construit avec vos offres, vos textes et un design qui suit votre marque." },
      { title: "Un formulaire pensé pour le COD", body: "Nom, téléphone, ville : le client commande en quelques secondes, sans compte ni carte bancaire." },
      { title: "Offres et packs", body: "Packs, quantités, options et offre complémentaire après la commande, calculés au centime près." },
      { title: "Les commandes dans Google Sheets", body: "Chaque commande arrive dans votre feuille Google, prête pour votre équipe de confirmation et votre livreur." },
      { title: "Pixels et conversions", body: "Meta, TikTok, Snapchat et Google Analytics, avec l'envoi des événements côté serveur." },
      { title: "Protection contre les fausses commandes", body: "Un score de risque sur chaque commande, une liste de blocage et une vérification anti-robots avant qu'elle ne vous parvienne." },
    ],
    stepsTitle: "Trois étapes",
    steps: ["Ajoutez votre produit et ses photos.", "Ajustez la page, puis publiez-la à votre adresse.", "Recevez les commandes et confirmez-les."],
    languages: "En arabe, en français et en anglais, de droite à gauche quand il le faut.",
    final: { title: "Prêt pour votre première page ?", cta: "Créer ma boutique" },
    footer: { terms: "Conditions d'utilisation", privacy: "Confidentialité", aup: "Utilisation acceptable", rights: "Tous droits réservés." },
    meta: {
      title: "Pages de vente pour le paiement à la livraison",
      description: "Créez une page produit soignée en quelques minutes, recevez les commandes payées à la livraison et suivez chacune jusqu'à votre client.",
    },
  },
  ar: {
    dir: "rtl",
    languageName: "العربية",
    nav: { signIn: "تسجيل الدخول", start: "أنشئ متجري", languages: "اللغة" },
    hero: {
      eyebrow: "مصمَّم للدفع عند الاستلام",
      title: "صفحات بيع تحوّل الزيارات إلى طلبات.",
      lead: "أنشئ صفحة منتج أنيقة في دقائق، واستقبل الطلبات بالدفع عند الاستلام، وتابع كل طلب حتى يصل إلى زبونك.",
      primary: "أنشئ متجري",
      secondary: "تسجيل الدخول",
    },
    mock: { name: "الاسم الكامل", phone: "رقم الهاتف", city: "المدينة", order: "اطلب الآن", note: "الدفع عند الاستلام" },
    featuresTitle: "كل ما تحتاجه صفحة الدفع عند الاستلام، دون إعدادات تقنية",
    features: [
      { title: "صفحة من صور منتجك", body: "أضف صور منتجك فتُبنى الصفحة بعروضك ونصوصك وتصميم يليق بعلامتك." },
      { title: "استمارة مصمَّمة للدفع عند الاستلام", body: "الاسم والهاتف والمدينة: يطلب الزبون في ثوانٍ، دون حساب ولا بطاقة بنكية." },
      { title: "عروض وباقات", body: "باقات وكميات وخيارات وعرض إضافي بعد الطلب، محسوبة بدقة حتى السنتيم." },
      { title: "الطلبات في Google Sheets", body: "يصل كل طلب إلى جدولك على Google، جاهزًا لفريق التأكيد ولشركة التوصيل." },
      { title: "البكسلات والتحويلات", body: "Meta وTikTok وSnapchat وGoogle Analytics، مع إرسال الأحداث من جهة الخادم." },
      { title: "حماية من الطلبات الوهمية", body: "تقييم للمخاطر في كل طلب، وقائمة حظر، وتحقق من الروبوتات قبل أن يصلك الطلب." },
    ],
    stepsTitle: "ثلاث خطوات",
    steps: ["أضف منتجك وصوره.", "عدّل الصفحة ثم انشرها على عنوانك.", "استقبل الطلبات وأكّدها."],
    languages: "بالعربية والفرنسية والإنجليزية، ومن اليمين إلى اليسار عند الحاجة.",
    final: { title: "هل أنت مستعد لصفحتك الأولى؟", cta: "أنشئ متجري" },
    footer: { terms: "شروط الاستخدام", privacy: "الخصوصية", aup: "الاستخدام المقبول", rights: "جميع الحقوق محفوظة." },
    meta: {
      title: "صفحات بيع للدفع عند الاستلام",
      description: "أنشئ صفحة منتج أنيقة في دقائق، واستقبل الطلبات بالدفع عند الاستلام، وتابع كل طلب حتى يصل إلى زبونك.",
    },
  },
  en: {
    dir: "ltr",
    languageName: "English",
    nav: { signIn: "Sign in", start: "Create my store", languages: "Language" },
    hero: {
      eyebrow: "Built for cash on delivery",
      title: "Sales pages that turn visits into orders.",
      lead: "Build a polished product page in minutes, take cash-on-delivery orders and follow every one until it reaches your customer.",
      primary: "Create my store",
      secondary: "Sign in",
    },
    mock: { name: "Full name", phone: "Phone", city: "City", order: "Order now", note: "Pay on delivery" },
    featuresTitle: "Everything a COD page has to do, with no technical setup",
    features: [
      { title: "A page from your photos", body: "Add your product photos and the page builds itself with your offers, your copy and a design that follows your brand." },
      { title: "A form made for COD", body: "Name, phone, city: customers order in seconds, with no account and no card." },
      { title: "Offers and bundles", body: "Bundles, quantities, options and an add-on offer after the order, priced to the cent." },
      { title: "Orders in Google Sheets", body: "Every order lands in your Google Sheet, ready for your confirmation team and your courier." },
      { title: "Pixels and conversions", body: "Meta, TikTok, Snapchat and Google Analytics, with server-side events." },
      { title: "Protection against fake orders", body: "A risk score on every order, a blocklist and a bot check before an order reaches you." },
    ],
    stepsTitle: "Three steps",
    steps: ["Add your product and its photos.", "Adjust the page, then publish it at your address.", "Receive orders and confirm them."],
    languages: "In Arabic, French and English, right to left when it should be.",
    final: { title: "Ready for your first page?", cta: "Create my store" },
    footer: { terms: "Terms of use", privacy: "Privacy", aup: "Acceptable use", rights: "All rights reserved." },
    meta: {
      title: "Sales pages for cash on delivery",
      description: "Build a polished product page in minutes, take cash-on-delivery orders and follow every one until it reaches your customer.",
    },
  },
};
