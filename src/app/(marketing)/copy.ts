/**
 * The platform's marketing copy (docs/STORE-SAAS.md §C.4 `(marketing)`), in Arabic, French and English. Every
 * sentence describes something the product does today; no figures, logos, testimonials or claims it cannot back.
 * French is the default locale of `/`; `?lang=ar|en` selects another (one cacheable URL per language).
 *
 * `home` is the homepage's own copy (the living models of ./living): every visitor-facing string in the three
 * languages, the id-keyed labels typed against the product's own vocabularies (outcomes, statuses, Director slots,
 * roles), and no digit anywhere (step numerals are rendered from the index). Latin product names inside Arabic are
 * isolated at render time (see `isolateLatin` in ./page.tsx). French puts a no-break space before `:` and `;`.
 */
import type { DirectorSlot } from "@/lib/ai/director/types";
import type { AttemptOutcome } from "@/lib/callcenter/outcomes";

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

/** The four order statuses the route model walks through (ids of ORDER_STATUSES, src/lib/orders/contract.ts). */
export type HomeStatus = "new" | "confirmed" | "in_transit" | "delivered";
/** The four store roles the roles cell shows (each in ACTIVE_STORE_ROLES, src/lib/auth/permissions.ts). */
export type HomeRole = "owner" | "manager" | "editor" | "agent";

export interface HomeCopy {
  pause: { pause: string; play: string };
  hero: { legend: string; caption: string };
  slots: Record<DirectorSlot, string>;
  gates: { design: string; budgets: string; honesty: string };
  engine: {
    title: string;
    lead: string;
    rows: readonly [{ name: string; body: string }, { name: string; body: string }, { name: string; body: string }];
    /** grid, layout and type, colour and image */
    layers: readonly [string, string, string];
    /** design, novelty, honesty */
    checks: readonly [string, string, string];
    caption: string;
  };
  director: { title: string; lead: string; token: string; caption: string };
  route: { title: string; lead: string; page: string; tracking: string; caption: string };
  statuses: Record<HomeStatus, string>;
  console: { title: string; lead: string; note: string; caption: string };
  outcomes: Record<AttemptOutcome, string>;
  roles: Record<HomeRole, string>;
  ops: {
    title: string;
    tracking: { title: string; body: string };
    delivery: { title: string; body: string; days: string };
    profit: { title: string; body: string; sales: string; costs: string; margin: string };
    health: { title: string; body: string };
    roles: { title: string; body: string };
    backups: { title: string; body: string };
  };
  dock: { title: string; lead: string; list: readonly [string, string, string, string]; caption: string };
  mirror: { title: string; lead: string; caption: string };
  steps: { title: string };
  final: { title: string };
}

export interface MarketingCopy {
  dir: "rtl" | "ltr";
  languageName: string;
  nav: { signIn: string; start: string; languages: string };
  /** the h1 is two sentences, each its own line from 1024 px up */
  hero: { eyebrow: string; title: readonly [string, string]; lead: string; primary: string; secondary: string };
  mock: { name: string; phone: string; city: string; order: string; note: string };
  steps: readonly [string, string, string];
  final: { cta: string };
  footer: { terms: string; privacy: string; aup: string; rights: string };
  meta: { title: string; description: string };
  home: HomeCopy;
}

const NB = " ";

export const COPY: Record<MarketingLocale, MarketingCopy> = {
  fr: {
    dir: "ltr",
    languageName: "Français",
    nav: { signIn: "Se connecter", start: "Créer ma boutique", languages: "Langue" },
    hero: {
      eyebrow: "Conçu pour le paiement à la livraison",
      title: ["Une boutique dessinée pour votre produit.", "Chaque commande suivie jusqu'à la porte."],
      lead: `Vos photos deviennent une boutique ou une page de vente au design unique. Ensuite, la plateforme porte chaque commande${NB}: formulaire, appels de vos agents, livraison et suivi.`,
      primary: "Créer ma boutique",
      secondary: "Se connecter",
    },
    mock: { name: "Nom complet", phone: "Téléphone", city: "Ville", order: "Commander", note: "Paiement à la livraison" },
    steps: ["Ajoutez votre produit et ses photos.", "Ajustez la page, puis publiez-la à votre adresse.", "Recevez les commandes et confirmez-les."],
    final: { cta: "Créer ma boutique" },
    footer: { terms: "Conditions d'utilisation", privacy: "Confidentialité", aup: "Utilisation acceptable", rights: "Tous droits réservés." },
    meta: {
      title: "Boutiques et pages de vente pour le paiement à la livraison",
      description: "Vos photos deviennent une boutique ou une page de vente au design unique, puis la plateforme porte chaque commande jusqu'à la porte de votre client.",
    },
    home: {
      pause: { pause: "Mettre en pause", play: "Relancer" },
      hero: {
        legend: "Direction de design",
        caption: `Illustration${NB}: une page de boutique s'assemble à partir des gènes de design principaux du moteur, passe les contrôles de design, de budgets et d'honnêteté, puis se recompose dans une direction contrastée et une direction d'exploration.`,
      },
      slots: { best_fit: "La plus juste", contrast: "Contraste", explore: "Exploration" },
      gates: { design: "Design", budgets: "Budgets", honesty: "Honnêteté" },
      engine: {
        title: "Chaque page est composée, jamais tirée d'un modèle.",
        lead: "Chaque boutique naît d'un génome de design. Grille, typographie, couleur, images, mouvement et ton sont choisis ensemble, puis contrôlés avant toute mise en ligne.",
        rows: [
          { name: "Contrôles de design", body: "Contraste, premier écran, typographie et règles de couleur sont vérifiés sur chaque page." },
          { name: "Contrôle de nouveauté", body: "Chaque nouveau design est comparé à ceux déjà créés, pour rester distinct." },
          { name: "Contrôle d'honnêteté", body: "La publication s'arrête quand une page affiche ce qu'elle ne peut pas prouver, comme des notes inventées." },
        ],
        layers: ["Grille", "Mise en page et typo", "Couleur et image"],
        checks: ["Design", "Nouveauté", "Honnêteté"],
        caption: `Illustration${NB}: chaque gène de design est tiré à nouveau${NB}; la grille, la mise en page et les couleurs de la page se recomposent, puis passent les contrôles de design, de nouveauté et d'honnêteté.`,
      },
      director: {
        title: "Trois directions. Vous en choisissez une.",
        lead: "Le Directeur IA lit votre produit, puis propose une direction juste, une en contraste et une exploration, chacune notée sur la même grille de design.",
        token: "Votre photo",
        caption: `Illustration${NB}: à partir d'une photo produit, le Directeur propose trois directions de page, chacune évaluée sur la même grille${NB}; vous en choisissez une.`,
      },
      route: {
        title: "Du premier geste à la porte du client.",
        lead: "Une commande passée sur votre page arrive dans la file de vos agents, se confirme par téléphone, part en livraison et reste visible pour votre client sur une page de suivi.",
        page: "Votre page",
        tracking: "Suivi de commande",
        caption: `Illustration${NB}: une commande quitte votre page, attend dans la file de vos agents, est confirmée par téléphone, voyage jusqu'à la porte du client et reste visible sur une page de suivi. Google Sheets, Telegram, l'API Conversions de Meta et WhatsApp sont prévenus en chemin${NB}; vous choisissez si Purchase est envoyé à la commande, à la confirmation ou à la livraison.`,
      },
      statuses: { new: "Nouvelle", confirmed: "Confirmée", in_transit: "En livraison", delivered: "Livrée" },
      console: {
        title: "Un seul écran pour chaque appel.",
        lead: "Vos agents prennent la commande suivante, suivent le script et notent le résultat en un geste.",
        note: "Chaque agent traite sa propre file. Les responsables voient tous les agents.",
        caption: `Illustration${NB}: la console des agents. La commande suivante passe de la file au script, l'agent suit le script et touche un résultat.`,
      },
      outcomes: {
        confirmed: "Confirmée",
        no_answer: "Injoignable",
        busy: "Occupé",
        switched_off: "Éteint",
        wrong_number: "Mauvais numéro",
        callback: "À rappeler",
        cancelled: "Annulée",
        fake: "Fausse commande",
        duplicate: "Doublon",
      },
      roles: { owner: "Propriétaire", manager: "Responsable", editor: "Éditeur", agent: "Agent" },
      ops: {
        title: "Ce qui fait tenir une activité en paiement à la livraison.",
        tracking: { title: "Suivi de commande", body: "Vos clients suivent leur commande sur leur propre page." },
        delivery: { title: "Zones et jours de livraison", body: "Choisissez où vous livrez et quels jours.", days: "Jours de livraison" },
        profit: { title: "Votre marge d'un coup d'œil", body: "Ventes, coûts et marge côte à côte.", sales: "Ventes", costs: "Coûts", margin: "Marge" },
        health: { title: "Santé de la boutique", body: "Des contrôles réguliers signalent ce qui demande votre attention." },
        roles: { title: "Rôles de l'équipe", body: "Chacun voit ce que son rôle permet." },
        backups: { title: "Sauvegardes", body: "Votre boutique est sauvegardée en instantanés." },
      },
      dock: {
        title: "Branché sur les outils que vous utilisez déjà.",
        lead: "Les nouvelles commandes peuvent partir vers Google Sheets et Telegram, vos agents envoient des modèles de messages WhatsApp, et l'API Conversions de Meta reçoit vos événements Lead et Purchase depuis le serveur.",
        list: ["Google Sheets", "API Conversions de Meta", "Telegram", "Modèles de messages WhatsApp"],
        caption: `Illustration${NB}: la plateforme au centre, reliée à Google Sheets, à l'API Conversions de Meta, à Telegram et à WhatsApp.`,
      },
      mirror: {
        title: "Arabe, français et anglais. Dans les deux sens, comme il faut.",
        lead: "Vos pages et formulaires fonctionnent dans chaque langue, et les pages en arabe se lisent de droite à gauche, mise en page comprise.",
        caption: `Illustration${NB}: la même page de commande dans une langue latine et en arabe, sa mise en page reflétée de part et d'autre de l'axe.`,
      },
      steps: { title: "En ligne en trois étapes." },
      final: { title: "Votre première page, composée aujourd'hui." },
    },
  },
  ar: {
    dir: "rtl",
    languageName: "العربية",
    nav: { signIn: "تسجيل الدخول", start: "أنشئ متجري", languages: "اللغة" },
    hero: {
      eyebrow: "مصمَّم للدفع عند الاستلام",
      title: ["متجر مصمَّم على قدّ منتجك.", `وكل طلبية متابَعة حتى${NB}باب${NB}الزبون.`],
      lead: "صورك تتحوّل إلى متجر أو صفحة بيع بتصميم خاص بها. وبعدها تتكفّل المنصة بكل طلبية: الاستمارة، مكالمات وكلائك، التوصيل والتتبّع.",
      primary: "أنشئ متجري",
      secondary: "تسجيل الدخول",
    },
    mock: { name: "الاسم الكامل", phone: "رقم الهاتف", city: "المدينة", order: "اطلب الآن", note: "الدفع عند الاستلام" },
    steps: ["أضف منتجك وصوره.", "عدّل الصفحة ثم انشرها على عنوانك.", "استقبل الطلبات وأكّدها."],
    final: { cta: "أنشئ متجري" },
    footer: { terms: "شروط الاستخدام", privacy: "الخصوصية", aup: "الاستخدام المقبول", rights: "جميع الحقوق محفوظة." },
    meta: {
      title: "متاجر وصفحات بيع للدفع عند الاستلام",
      description: "صورك تتحوّل إلى متجر أو صفحة بيع بتصميم خاص بها، وبعدها تتكفّل المنصة بكل طلبية حتى باب زبونك.",
    },
    home: {
      pause: { pause: "وقّف الحركة", play: "شغّل الحركة" },
      hero: {
        legend: "اتجاه التصميم",
        caption: "رسم توضيحي: صفحة متجر تتركّب من جينات التصميم الأساسية في المحرّك، وتجتاز فحوص التصميم والحدود والمصداقية، ثم تُعاد صياغتها في اتجاه مغاير واتجاه للاستكشاف.",
      },
      slots: { best_fit: "الأنسب", contrast: "المغاير", explore: "الاستكشاف" },
      gates: { design: "التصميم", budgets: "الحدود", honesty: "المصداقية" },
      engine: {
        title: `كل صفحة مركَّبة على المقاس، ماشي${NB}قالب${NB}جاهز.`,
        lead: "كل متجر يُرسم من جينوم تصميم: الشبكة والخط واللون والصور والحركة والأسلوب تُختار معًا، ثم تُفحص قبل أي نشر.",
        rows: [
          { name: "فحوص التصميم", body: "التباين والشاشة الأولى والخطوط وقواعد الألوان تُفحص في كل صفحة." },
          { name: "فحص التميّز", body: "كل تصميم جديد يُقارن بالتصاميم السابقة باش يبقى متميّز." },
          { name: "فحص المصداقية", body: "يتوقف النشر إذا عرضت الصفحة ادعاءات بلا أساس، مثل تقييمات مختلَقة." },
        ],
        layers: ["الشبكة", "التخطيط والخط", "اللون والصورة"],
        checks: ["التصميم", "التميّز", "المصداقية"],
        caption: "رسم توضيحي: كل جين تصميم يُسحب من جديد، فتُعاد صياغة شبكة الصفحة وتخطيطها وألوانها، ثم تجتاز فحوص التصميم والتميّز والمصداقية.",
      },
      director: {
        title: `ثلاثة اتجاهات، وأنت تختار${NB}واحد.`,
        lead: "المدير الذكي يقرأ منتجك، ويقترح اتجاهًا هو الأنسب، واتجاهًا مغايرًا، واتجاهًا للاستكشاف، وكل واحد يُقيَّم بنفس معايير التصميم.",
        token: "صورتك",
        caption: "رسم توضيحي: انطلاقًا من صورة منتج واحدة، يقترح المدير ثلاثة اتجاهات للصفحة، كل واحد يُقيَّم بنفس المعايير، وأنت تختار واحدًا.",
      },
      route: {
        title: `من أول ضغطة حتى باب${NB}الزبون.`,
        lead: "الطلبية اللي تتسجّل في صفحتك تدخل لقائمة وكلائك، تتأكّد بالهاتف، تخرج للتوصيل، ويبقى زبونك يتابعها في صفحة التتبّع.",
        page: "صفحتك",
        tracking: "تتبّع الطلبية",
        caption:
          "رسم توضيحي: طلبية تخرج من صفحتك، تنتظر في قائمة وكلائك، تتأكّد بالهاتف، توصل حتى باب الزبون وتبقى ظاهرة في صفحة التتبّع. Google Sheets وTelegram وMeta Conversions API وWhatsApp يتوصّلون بالخبر في الطريق، وأنت تختار متى يُرسل Purchase: عند الطلب أو عند التأكيد أو عند التسليم.",
      },
      statuses: { new: "جديدة", confirmed: "مؤكَّدة", in_transit: "في الطريق", delivered: "تسلّمها الزبون" },
      console: {
        title: "شاشة وحدة لكل مكالمة.",
        lead: "الوكيل ياخذ الطلبية الجاية من القائمة، يتبع السكريبت، ويسجّل النتيجة بضغطة وحدة.",
        note: "كل وكيل يخدم على القائمة ديالو، والمدير يشوف جميع الوكلاء.",
        caption: "رسم توضيحي: واجهة الوكلاء. الطلبية الجاية تنتقل من القائمة إلى السكريبت، والوكيل يتبع السكريبت ويضغط على النتيجة.",
      },
      outcomes: {
        confirmed: "مؤكَّدة",
        no_answer: "ما جاوبش",
        busy: "مشغول",
        switched_off: "مطفي",
        wrong_number: "رقم غالط",
        callback: "عاود الاتصال",
        cancelled: "ملغاة",
        fake: "طلب وهمي",
        duplicate: "مكرَّرة",
      },
      roles: { owner: "مالك", manager: "مدير", editor: "محرّر", agent: "وكيل" },
      ops: {
        title: `كل ما يحتاجه نشاط الدفع عند الاستلام باش يبقى${NB}واقف.`,
        tracking: { title: "تتبّع الطلبية", body: "زبونك يتبع طلبيته من صفحة خاصة به." },
        delivery: { title: "مناطق وأيام التوصيل", body: "اختار فين توصّل وفأي أيام.", days: "أيام التوصيل" },
        profit: { title: "الربح في لمحة", body: "المبيعات والتكاليف والهامش جنب بعض.", sales: "المبيعات", costs: "التكاليف", margin: "الهامش" },
        health: { title: "صحة المتجر", body: "فحوص منتظمة تنبّهك لما يحتاج انتباهك." },
        roles: { title: "أدوار الفريق", body: "كل واحد يشوف غير ما يسمح به دوره." },
        backups: { title: "النسخ الاحتياطية", body: "متجرك محفوظ في نسخ احتياطية." },
      },
      dock: {
        title: `مربوط بالأدوات اللي كتخدم بيها من${NB}قبل.`,
        lead: "الطلبات الجديدة تقدر توصل لـ Google Sheets وTelegram، والوكلاء يرسلون قوالب رسائل WhatsApp، وMeta Conversions API تستقبل أحداث Lead وPurchase من السيرفر.",
        list: ["Google Sheets", "Meta Conversions API", "Telegram", "قوالب رسائل WhatsApp"],
        caption: "رسم توضيحي: المنصة في الوسط، مربوطة بـ Google Sheets وMeta Conversions API وTelegram وWhatsApp.",
      },
      mirror: {
        title: `بالعربية والفرنسية والإنجليزية، وفي الاتجاهين كما${NB}يجب.`,
        lead: "صفحاتك واستماراتك تشتغل بكل لغة، والصفحات العربية تُقرأ من اليمين لليسار بتخطيط معكوس بالكامل.",
        caption: "رسم توضيحي: نفس صفحة الطلب بلغة لاتينية وبالعربية، وتخطيطها معكوس على جانبي المحور.",
      },
      steps: { title: `متجرك أونلاين في ثلاث${NB}خطوات.` },
      final: { title: `صفحتك الأولى، مصمَّمة${NB}اليوم.` },
    },
  },
  en: {
    dir: "ltr",
    languageName: "English",
    nav: { signIn: "Sign in", start: "Create my store", languages: "Language" },
    hero: {
      eyebrow: "Built for cash on delivery",
      title: ["A store designed for your product.", "Every order followed to the door."],
      lead: "Your photos become a store or a landing page with a design of its own. Then the platform carries every order: the form, your agents' calls, delivery and tracking.",
      primary: "Create my store",
      secondary: "Sign in",
    },
    mock: { name: "Full name", phone: "Phone", city: "City", order: "Order now", note: "Pay on delivery" },
    steps: ["Add your product and its photos.", "Adjust the page, then publish it at your address.", "Receive orders and confirm them."],
    final: { cta: "Create my store" },
    footer: { terms: "Terms of use", privacy: "Privacy", aup: "Acceptable use", rights: "All rights reserved." },
    meta: {
      title: "Stores and sales pages for cash on delivery",
      description: "Your photos become a store or a landing page with a design of its own, then the platform carries every order to your customer's door.",
    },
    home: {
      pause: { pause: "Pause motion", play: "Play motion" },
      hero: {
        legend: "Design direction",
        caption:
          "Illustration: a store page assembles from the engine's bold design genes, passes the design, budget and honesty checks, then re-composes into a contrasting direction and an exploratory one.",
      },
      slots: { best_fit: "Best fit", contrast: "Contrast", explore: "Explore" },
      gates: { design: "Design", budgets: "Budgets", honesty: "Honesty" },
      engine: {
        title: "Every page is composed, never templated.",
        lead: "Each store is drawn from a design genome. Grid, type, colour, imagery, motion and voice are chosen together, then checked before anything goes live.",
        rows: [
          { name: "Design gates", body: "Contrast, the first screen, type and colour rules are checked on every page." },
          { name: "Novelty check", body: "A new design is measured against the ones already made, so it stays distinct." },
          { name: "Honesty gate", body: "Publishing stops when a page shows claims it can't back, like invented ratings." },
        ],
        layers: ["Grid", "Layout and type", "Colour and image"],
        checks: ["Design", "Novelty", "Honesty"],
        caption: "Illustration: every design gene is re-sampled; the page's grid, layout and colour layers recompose, then pass the design, novelty and honesty checks.",
      },
      director: {
        title: "Three directions. You pick one.",
        lead: "The AI Director reads your product, then proposes a best fit, a contrast and an exploration, each scored against the same design rubric.",
        token: "Your photo",
        caption: "Illustration: from one product photo, the Director proposes three page directions, each assessed on the same rubric; you choose one.",
      },
      route: {
        title: "From the first tap to the door.",
        lead: "An order placed on your page lands in your agents' queue, is confirmed by phone, ships, and stays visible to your customer on a tracking page.",
        page: "Your page",
        tracking: "Order tracking",
        caption:
          "Illustration: an order leaves your page, waits in your agents' queue, is confirmed by phone, travels to the customer's door and stays visible on a tracking page. Google Sheets, Telegram, Meta Conversions API and WhatsApp are notified on the way; you choose whether Purchase is sent on order, on confirmation or on delivery.",
      },
      statuses: { new: "New", confirmed: "Confirmed", in_transit: "In transit", delivered: "Delivered" },
      console: {
        title: "One screen for every call.",
        lead: "Agents take the next order from the queue, follow the script, and record the outcome in one tap.",
        note: "Agents work their own queue. Managers see every agent.",
        caption: "Illustration: the agent console. The next order moves from the queue to the script, the agent follows the script and taps an outcome.",
      },
      outcomes: {
        confirmed: "Confirmed",
        no_answer: "No answer",
        busy: "Busy",
        switched_off: "Switched off",
        wrong_number: "Wrong number",
        callback: "Call back",
        cancelled: "Cancelled",
        fake: "Fake order",
        duplicate: "Duplicate",
      },
      roles: { owner: "Owner", manager: "Manager", editor: "Editor", agent: "Agent" },
      ops: {
        title: "What keeps a cash-on-delivery business standing.",
        tracking: { title: "Order tracking", body: "Your customers follow their order on their own page." },
        delivery: { title: "Delivery zones and days", body: "Choose where you deliver and on which days.", days: "Delivery days" },
        profit: { title: "Profit at a glance", body: "Sales, costs and margin side by side.", sales: "Sales", costs: "Costs", margin: "Margin" },
        health: { title: "Store health", body: "Regular checks point to what needs your attention." },
        roles: { title: "Team roles", body: "Each person sees what their role allows." },
        backups: { title: "Backups", body: "Your store is saved as snapshots." },
      },
      dock: {
        title: "Plugged into the tools you already use.",
        lead: "New orders can go to Google Sheets and Telegram, your agents send WhatsApp message templates, and Meta Conversions API receives your Lead and Purchase events from the server.",
        list: ["Google Sheets", "Meta Conversions API", "Telegram", "WhatsApp message templates"],
        caption: "Illustration: the platform at the centre, connected to Google Sheets, Meta Conversions API, Telegram and WhatsApp.",
      },
      mirror: {
        title: "Arabic, French and English. Both directions, done right.",
        lead: "Your pages and forms work in each language, and Arabic pages read right to left with the whole layout mirrored.",
        caption: "Illustration: the same order page in a Latin language and in Arabic, its layout mirrored across the axis.",
      },
      steps: { title: "Live in three steps." },
      final: { title: "Your first page, composed today." },
    },
  },
};
