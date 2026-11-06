/**
 * The legal pages' promises (P3 LANDING; landing.md LAN-§3.3, LD29, LAN-§6.3; docs/STORE-SAAS.md D39, D73): every
 * sentence of a legal page that commits the store (where and how fast it delivers, opening the parcel before paying,
 * the confirmation call, returns, exchanges, refunds, the store's own warranty, the calling hours) is built here from
 * the store's answers (`LegalPolicy`, ./policy.ts) in ar / fr / en, so ./content.ts never writes one from a default.
 *
 * Two markers carry what is not the store's word:
 *  - an unset answer gives a visible gap (`gap`, Settings → Policies), never a sentence;
 *  - a line that quotes the law (the withdrawal right of loi n° 31-08 or the EU rules, the legal guarantee) is a
 *    `law` block: shown as written, listed for the merchant as "needs legal review" (core D39), and never presented
 *    as a store policy.
 * Pure and isomorphic.
 */
import { b, callout, gap, law, list, p, type Block, type Inline, type LegalSection } from "./model";
import type { LegalPolicy } from "./policy";

type Lang = "ar" | "fr" | "en";
export type LegalRegime = "MA" | "EU" | "INTL";

export interface PromiseInput {
  lang: Lang;
  regime: LegalRegime;
  pol: LegalPolicy;
  /** the store's contact line ("sur WhatsApp au …"), or its gap */
  contact: Inline[];
  /** the form's city is a select (the "Autre ville" hint) */
  citySelect: boolean;
}

/** What a legal text takes from the store's answers. Blocks are complete; summaries are "in short" lines. */
export interface LegalPromises {
  /** shipping "in short": where and how fast (one line when both are known, else one per answer) */
  deliverySummary: Inline[][];
  /** shipping "in short": how the parcel is paid */
  paySummary: Inline[];
  /** shipping and returns "in short": the law's withdrawal line, then the store's returns answer when given */
  returnsSummary: Inline[][];
  /** terms "in short": the call line, null when the store does not confirm by phone */
  callSummary: Inline[] | null;
  /** shipping section "zones" */
  coverage: Block;
  /** shipping section "times" */
  times: Block;
  /** shipping section "steps" (confirmation, shipping, delivery, payment) */
  steps: Inline[][];
  /** shipping section "check" */
  check: Block;
  /** terms "order": the step after the form */
  orderConfirm: Inline[];
  /** terms "payment": the paragraph after the cash-on-delivery callout */
  payment: Block;
  /** terms "withdrawal" (the law, flagged for review) */
  withdrawal: Block[];
  /** terms "warranty": the legal guarantee (law) and the store's own warranty when it gives one */
  warranty: Block[];
  /** the returns sections: withdrawal, returns, exchange, refund, defects */
  returnsSections: LegalSection[];
  /** contact "orders" */
  contactOrders: Block;
  /** contact "reach": the calling hours, null while a shopper may not be told any (`noShopperHours`) */
  hours: Block | null;
}

/* ------------------------------------------------------------------ */
/* counted words                                                       */
/* ------------------------------------------------------------------ */

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Arabic counted nouns: 1 "يوم واحد", 2 "يومين", 3 to 10 "أيام", 11 and more "يوما". */
function arCount(n: number, w: { one: string; two: string; few: string; many: string }): string {
  if (n === 1) return w.one;
  if (n === 2) return w.two;
  return `${n} ${n <= 10 ? w.few : w.many}`;
}
const AR_DAYS = { one: "يوم واحد", two: "يومين", few: "أيام", many: "يوما" };
const AR_MONTHS = { one: "شهر واحد", two: "شهرين", few: "أشهر", many: "شهرا" };
const AR_YEARS = { one: "سنة واحدة", two: "سنتين", few: "سنوات", many: "سنة" };

function days(lang: Lang, n: number): string {
  if (lang === "ar") return arCount(n, AR_DAYS);
  return lang === "fr" ? plural(n, "jour", "jours") : plural(n, "day", "days");
}

/** "2 à 4 jours", "من 2 إلى 4 أيام", "2 to 4 days"; one value when both ends agree. */
function dayRange(lang: Lang, pair: readonly [number, number]): string {
  const a = Math.min(pair[0], pair[1]);
  const z = Math.max(pair[0], pair[1]);
  if (a === z) return days(lang, a);
  if (lang === "ar") return `من ${a} إلى ${z} ${z <= 10 ? AR_DAYS.few : AR_DAYS.many}`;
  return lang === "fr" ? `${a} à ${z} jours` : `${a} to ${z} days`;
}

/** A warranty length: whole years read as years ("2 ans", "سنتين", "2 years"). */
function months(lang: Lang, m: number): string {
  const years = m % 12 === 0 ? m / 12 : null;
  if (lang === "ar") return years ? arCount(years, AR_YEARS) : arCount(m, AR_MONTHS);
  if (lang === "fr") return years ? plural(years, "an", "ans") : `${m} mois`;
  return years ? plural(years, "year", "years") : plural(m, "month", "months");
}

/** An owner text in the page's language, else another language the owner typed (her condition is never hidden). */
function locText(t: { ar?: string; fr?: string; en?: string } | undefined, lang: Lang): string {
  if (!t) return "";
  const order: Lang[] = lang === "ar" ? ["ar", "fr", "en"] : lang === "fr" ? ["fr", "en", "ar"] : ["en", "fr", "ar"];
  for (const l of order) {
    const s = t[l]?.replace(/\s+/g, " ").trim().replace(/[.;،]+$/, "");
    if (s) return s;
  }
  return "";
}

/* ------------------------------------------------------------------ */
/* the words, per language                                             */
/* ------------------------------------------------------------------ */

type Method = "cash" | "transfer" | "store_credit";

interface Words {
  sectionTitles: { withdrawal: string; returns: string; exchange: string; refund: string; defects: string };
  // delivery
  coverageShort: { national: (ma: boolean) => string; zones: string };
  usually: (range: string) => Inline[];
  dated: string;
  /** the dated line on its own (the coverage unknown) */
  datedLine: string;
  coverageGap: Inline[];
  timeGap: Inline[];
  coverageNational: (ma: boolean) => string;
  citySelectNote: string;
  coverageZones: (dated: boolean) => string;
  timesDated: string;
  timesTypical: (range: string, call: boolean) => Inline[];
  // inspection and payment
  payAllowed: Inline[];
  payPlain: Inline[];
  checkAllowed: Inline[];
  checkNot: Inline[];
  checkGap: Inline[];
  stepConfirm: Inline[];
  stepShip: Inline[];
  stepDeliver: Inline[];
  stepPayChecked: Inline[];
  stepPay: Inline[];
  callSummary: string;
  orderConfirmCall: string;
  orderConfirmPlain: string;
  paymentAllowed: string;
  paymentNot: string;
  paymentGap: Inline[];
  // the law
  withdrawalLaw: Record<LegalRegime, Inline[]>;
  withdrawalExercise: (contact: Inline[], regime: LegalRegime) => Inline[];
  withdrawalExceptions: (regime: LegalRegime) => Inline[];
  withdrawalSummary: Record<LegalRegime, Inline[]>;
  legalGuarantee: string;
  guaranteeContact: (contact: Inline[]) => Inline[];
  storeWarranty: (length: string, text: string) => Inline[];
  defects: string;
  // the store's returns, exchanges and refunds
  returnsAccepted: (window: Inline[]) => Inline[];
  windowDays: (n: string) => Inline[];
  windowGap: Inline[];
  returnsStorePays: string;
  returnsCustomerPays: string;
  returnsPayGap: Inline[];
  condition: (text: string) => Inline[];
  returnsSteps: (contact: Inline[]) => Inline[][];
  returnsNot: string;
  returnsGap: Inline[];
  returnsSummaryYes: (window: string | null) => Inline[];
  returnsSummaryNo: string;
  exchangeYes: (window: Inline[], contact: Inline[]) => Inline[];
  exchangeNo: string;
  exchangeGap: Inline[];
  method: Record<Method, string>;
  refundBoth: (method: string, n: string) => Inline[];
  refundMethodOnly: (method: string) => Inline[];
  refundDaysOnly: (n: string) => Inline[];
  refundGap: Inline[];
  // contact
  ordersCall: string;
  ordersFollowUp: string;
  hours: (text: string) => Inline[];
}

const FR: Words = {
  sectionTitles: { withdrawal: "Droit de rétractation", returns: "Retours", exchange: "Échanges", refund: "Remboursement", defects: "Produit défectueux ou erreur" },
  coverageShort: { national: (ma) => (ma ? "Livraison dans tout le Maroc" : "Livraison dans tout le pays"), zones: "Livraison dans les villes de nos zones" },
  usually: (range) => [", en ", b(range), " en général"],
  dated: ", date de votre ville affichée dans le formulaire",
  datedLine: "Date de livraison de votre ville affichée dans le formulaire.",
  coverageGap: ["Zones de livraison : ", gap("tout le pays ou vos villes")],
  timeGap: ["Délai habituel : ", gap("nombre de jours")],
  coverageNational: (ma) => (ma ? "Nous livrons dans toutes les villes du Maroc desservies par notre société de livraison." : "Nous livrons dans tout le pays, dans les zones desservies par notre société de livraison."),
  citySelectNote: " Si votre ville n'apparaît pas dans la liste du formulaire, choisissez « Autre ville » et précisez votre localité dans l'adresse.",
  coverageZones: (dated) => `Nous livrons dans les villes de nos zones de livraison.${dated ? " Choisissez votre ville dans le formulaire pour voir la date de livraison prévue." : " En cas de doute sur votre ville, contactez-nous avant de commander."}`,
  timesDated: "Le formulaire de commande affiche la date de livraison prévue pour votre ville. Le délai peut être plus long pour les zones éloignées, les jours fériés ou en période de forte affluence.",
  timesTypical: (range, call) => ["Délai habituel : ", b(range), `, à partir de la confirmation de votre commande${call ? " par téléphone" : ""}. Il peut être plus long pour les zones éloignées, les jours fériés ou en période de forte affluence.`],
  payAllowed: ["Paiement en espèces à la réception, ", b("après vérification du colis"), "."],
  payPlain: ["Paiement en espèces, ", b("au livreur, à la réception"), "."],
  checkAllowed: ["Vérifiez l'état du colis et son contenu ", b("avant de payer"), ". S'il est endommagé, incomplet ou ne correspond pas à votre commande, vous pouvez le refuser : vous ne payez rien."],
  checkNot: ["Le colis se paie au livreur ", b("avant d'être ouvert"), ". Si un problème apparaît à l'ouverture, contactez-nous avec une photo."],
  checkGap: ["Ouverture du colis avant de payer : ", gap("autorisée ou non"), "."],
  stepConfirm: [b("Confirmation"), " : nous vous appelons ou vous écrivons sur WhatsApp pour confirmer la commande et l'adresse."],
  stepShip: [b("Expédition"), " : votre colis est remis à notre société de livraison."],
  stepDeliver: [b("Livraison"), " : le livreur vous appelle avant de passer, gardez votre téléphone à portée de main."],
  stepPayChecked: [b("Paiement"), " : vous vérifiez le colis, puis vous payez le livreur en espèces."],
  stepPay: [b("Paiement"), " : vous payez le livreur en espèces, à la réception."],
  callSummary: "Nous vous appelons pour confirmer avant d'expédier.",
  orderConfirmCall: "Nous vous appelons ou vous écrivons sur WhatsApp pour confirmer la commande et l'adresse : la commande est expédiée après cette confirmation.",
  orderConfirmPlain: "Votre commande est ensuite préparée et remise à notre société de livraison.",
  paymentAllowed: "Vous pouvez vérifier votre colis à la réception, avant de payer. S'il est endommagé ou ne correspond pas à votre commande, vous pouvez le refuser sans rien payer.",
  paymentNot: "Le colis se paie au livreur avant d'être ouvert. Si un problème apparaît à l'ouverture, contactez-nous avec une photo.",
  paymentGap: ["Vérification du colis avant paiement : ", gap("autorisée ou non"), "."],
  withdrawalLaw: {
    MA: ["Conformément à la ", b("loi n° 31-08"), " édictant des mesures de protection du consommateur, vous disposez d'un délai de ", b("7 jours"), " à compter de la réception de votre commande pour exercer votre droit de rétractation, sans avoir à vous justifier ni à payer de pénalité, à l'exception des frais de retour."],
    EU: ["Conformément à la réglementation européenne sur les contrats à distance, vous disposez d'un délai de ", b("14 jours"), " à compter de la réception de votre commande pour vous rétracter, sans avoir à vous justifier. Les frais de retour restent à votre charge."],
    INTL: ["Vous pouvez vous rétracter après réception de votre commande dans le délai prévu par la loi applicable ; les frais de retour restent à votre charge."],
  },
  withdrawalExercise: (contact, regime) => [
    "Pour l'exercer, contactez-nous ",
    ...contact,
    " en indiquant votre numéro de commande. Le produit doit être retourné complet, dans son état d'origine. ",
    regime === "MA"
      ? "Les sommes versées sont remboursées sans délai, et au plus tard dans les 15 jours suivant l'exercice du droit de rétractation."
      : regime === "EU"
        ? "Les sommes versées sont remboursées au plus tard 14 jours après la rétractation ; le remboursement peut attendre la réception du produit retourné."
        : "Les sommes versées sont remboursées dans les délais prévus par la loi applicable.",
  ],
  withdrawalExceptions: (regime) => [
    "Ce droit ne s'applique pas, dans les cas prévus par la loi, aux produits confectionnés selon vos spécifications ou personnalisés, ni aux produits qui, du fait de leur nature, ne peuvent être réexpédiés ou sont susceptibles de se détériorer rapidement",
    regime === "EU" ? ", ni aux produits d'hygiène ou cosmétiques descellés après la livraison." : ".",
  ],
  withdrawalSummary: {
    MA: ["Droit de rétractation : ", b("7 jours"), " après réception (loi n° 31-08)."],
    EU: ["Droit de rétractation : ", b("14 jours"), " après réception."],
    INTL: ["Droit de rétractation dans le délai prévu par la loi applicable."],
  },
  legalGuarantee: "Les produits bénéficient de la garantie légale contre les défauts de la chose vendue : un produit défectueux ou non conforme à votre commande est remplacé ou remboursé, et les frais de retour sont à la charge de la boutique.",
  guaranteeContact: (contact) => ["Pour la faire jouer, contactez-nous ", ...contact, " avec une photo du produit."],
  storeWarranty: (length, text) => ["La boutique offre en plus une garantie de ", b(length), text ? ` : ${text}.` : "."],
  defects: "Si vous recevez un produit défectueux ou différent de votre commande, signalez-le-nous dès que possible avec une photo : il est remplacé ou remboursé, et les frais de retour sont à la charge de la boutique.",
  returnsAccepted: (window) => ["La boutique accepte les retours ", ...window, ". "],
  windowDays: (n) => ["dans les ", b(n), " suivant la réception"],
  windowGap: ["dans un délai de ", gap("nombre de jours"), " après la réception"],
  returnsStorePays: "Les frais de retour sont à notre charge.",
  returnsCustomerPays: "Les frais de retour sont à votre charge.",
  returnsPayGap: ["Frais de retour : ", gap("à la charge de la boutique ou du client"), "."],
  condition: (text) => ["Condition : ", text, "."],
  returnsSteps: (contact) => [
    ["Contactez-nous ", ...contact, " en indiquant votre numéro de commande."],
    ["Renvoyez le produit complet, dans son état et son emballage d'origine, selon les instructions que nous vous donnons."],
  ],
  returnsNot: "En dehors du droit de rétractation et des produits défectueux, la boutique n'accepte pas les retours.",
  returnsGap: ["Retours en dehors du droit de rétractation : ", gap("acceptés ou non, délai et frais"), "."],
  returnsSummaryYes: (window) => (window ? ["Retours acceptés sous ", b(window), "."] : ["Retours acceptés."]),
  returnsSummaryNo: "Pas de retour en dehors du droit de rétractation.",
  exchangeYes: (window, contact) => ["Une autre taille, une autre couleur ou un autre article ? La boutique accepte les échanges ", ...window, ", selon les stocks disponibles. Contactez-nous ", ...contact, "."],
  exchangeNo: "La boutique ne propose pas d'échange.",
  exchangeGap: ["Échanges : ", gap("acceptés ou non, et délai"), "."],
  method: { cash: "en espèces", transfer: "par virement bancaire", store_credit: "sous forme d'avoir" },
  refundBoth: (method, n) => ["Nous remboursons ", b(method), ", dans les ", b(n), " suivant la réception du produit retourné."],
  refundMethodOnly: (method) => ["Nous remboursons ", b(method), ". Délai de remboursement : ", gap("nombre de jours"), "."],
  refundDaysOnly: (n) => ["Nous remboursons dans les ", b(n), " suivant la réception du produit retourné. Mode de remboursement : ", gap("espèces, virement ou avoir"), "."],
  refundGap: ["Remboursement : ", gap("mode et délai"), "."],
  ordersCall: "Après votre commande, nous vous appelons pour la confirmer. ",
  ordersFollowUp: "Pour toute question sur une livraison en cours, contactez-nous avec votre numéro de commande (affiché sur la page de confirmation) et le numéro de téléphone utilisé pour commander.",
  hours: (text) => ["Horaires d'appel : ", b(text), "."],
};

const AR: Words = {
  sectionTitles: { withdrawal: "حق التراجع", returns: "الإرجاع", exchange: "الاستبدال", refund: "استرداد المبلغ", defects: "منتج معيب أو خطأ في الطلب" },
  coverageShort: { national: (ma) => (ma ? "التوصيل إلى جميع مدن المغرب" : "التوصيل إلى جميع أنحاء البلاد"), zones: "التوصيل إلى مدن مناطقنا" },
  // "عادة من 1 إلى 3 أيام", "عادة في يومين": a range carries its own "من"
  usually: (range) => ["، عادة ", ...(range.startsWith("من ") ? [] : ["في "]), b(range)],
  dated: "، وتاريخ مدينتك يظهر في الاستمارة",
  datedLine: "تاريخ التوصيل إلى مدينتك يظهر في الاستمارة.",
  coverageGap: ["مناطق التوصيل: ", gap("جميع أنحاء البلاد أو مدن محددة")],
  timeGap: ["أجل التوصيل المعتاد: ", gap("عدد الأيام")],
  coverageNational: (ma) => (ma ? "نوصل إلى جميع مدن المغرب التي تخدمها شركة التوصيل التي نتعامل معها." : "نوصل إلى جميع أنحاء البلاد، في المناطق التي تخدمها شركة التوصيل التي نتعامل معها."),
  citySelectNote: " وإذا لم تجد مدينتك في لائحة الاستمارة، اختر «مدينة أخرى» واكتب اسم منطقتك في العنوان.",
  coverageZones: (dated) => `نوصل إلى مدن مناطق التوصيل الخاصة بنا.${dated ? " اختر مدينتك في الاستمارة لترى تاريخ التوصيل المتوقع." : " وإذا كان لديك شك بخصوص مدينتك، تواصل معنا قبل الطلب."}`,
  timesDated: "تعرض استمارة الطلب تاريخ التوصيل المتوقع لمدينتك. وقد يطول الأجل بالنسبة للمناطق البعيدة أو في أيام العطل أو فترات الضغط.",
  timesTypical: (range, call) => ["الأجل المعتاد: ", b(range), `، ابتداء من تأكيد طلبك${call ? " هاتفيا" : ""}. وقد يطول بالنسبة للمناطق البعيدة أو في أيام العطل أو فترات الضغط.`],
  payAllowed: ["الدفع نقدا عند الاستلام، ", b("بعد معاينة الطرد"), "."],
  payPlain: ["الدفع نقدا ", b("لعامل التوصيل عند الاستلام"), "."],
  checkAllowed: ["عاين حالة الطرد ومحتواه ", b("قبل الأداء"), ". وإذا كان متضررا أو ناقصا أو لا يطابق طلبك، يمكنك رفضه دون أداء أي شيء."],
  checkNot: ["يُؤدى ثمن الطرد لعامل التوصيل ", b("قبل فتحه"), ". وإذا ظهر أي مشكل عند الفتح، تواصل معنا مع صورة."],
  checkGap: ["فتح الطرد قبل الأداء: ", gap("مسموح أو غير مسموح"), "."],
  stepConfirm: [b("التأكيد"), ": نتصل بك هاتفيا أو عبر واتساب لتأكيد الطلب والعنوان."],
  stepShip: [b("الإرسال"), ": نسلم طردك لشركة التوصيل."],
  stepDeliver: [b("التسليم"), ": يتصل بك عامل التوصيل قبل المرور، فاحرص على أن يكون هاتفك قريبا منك."],
  stepPayChecked: [b("الأداء"), ": تعاين الطرد، ثم تؤدي الثمن نقدا لعامل التوصيل."],
  stepPay: [b("الأداء"), ": تؤدي الثمن نقدا لعامل التوصيل عند الاستلام."],
  callSummary: "نتصل بك لتأكيد الطلب قبل الإرسال.",
  orderConfirmCall: "نتصل بك هاتفيا أو عبر واتساب لتأكيد الطلب والعنوان، ولا يُرسل الطلب إلا بعد هذا التأكيد.",
  orderConfirmPlain: "بعد ذلك يُجهَّز طلبك ويُسلَّم لشركة التوصيل.",
  paymentAllowed: "يمكنك معاينة طردك عند الاستلام وقبل الأداء. وإذا كان متضررا أو لا يطابق طلبك، يمكنك رفضه دون أداء أي شيء.",
  paymentNot: "يُؤدى ثمن الطرد لعامل التوصيل قبل فتحه. وإذا ظهر أي مشكل عند الفتح، تواصل معنا مع صورة.",
  paymentGap: ["معاينة الطرد قبل الأداء: ", gap("مسموح أو غير مسموح"), "."],
  withdrawalLaw: {
    MA: ["طبقا ", b("للقانون رقم 31.08"), " القاضي بتحديد تدابير لحماية المستهلك، لك أجل ", b("7 أيام"), " ابتداء من تاريخ استلام طلبك لممارسة حقك في التراجع، دون الحاجة إلى تبرير ودون أداء أي غرامة، باستثناء مصاريف الإرجاع."],
    EU: ["طبقا للتنظيم الأوروبي الخاص بالعقود عن بعد، لك أجل ", b("14 يوما"), " ابتداء من تاريخ استلام طلبك للتراجع دون الحاجة إلى تبرير، وتبقى مصاريف الإرجاع على عاتقك."],
    INTL: ["يمكنك التراجع بعد استلام طلبك داخل الأجل الذي ينص عليه القانون المعمول به، وتبقى مصاريف الإرجاع على عاتقك."],
  },
  withdrawalExercise: (contact, regime) => [
    "لممارسة هذا الحق، تواصل معنا ",
    ...contact,
    " مع ذكر رقم الطلب. يجب إرجاع المنتج كاملا وفي حالته الأصلية. ",
    regime === "MA"
      ? "وتُرد المبالغ المؤداة دون تأخير، وفي أجل أقصاه 15 يوما من تاريخ ممارسة حق التراجع."
      : regime === "EU"
        ? "وتُرد المبالغ المؤداة في أجل أقصاه 14 يوما من تاريخ التراجع، ويمكن أن ينتظر الاسترداد التوصل بالمنتج المرجع."
        : "وتُرد المبالغ المؤداة داخل الآجال التي ينص عليها القانون المعمول به.",
  ],
  withdrawalExceptions: (regime) => [
    "لا يسري هذا الحق، في الحالات التي ينص عليها القانون، على المنتجات المصنوعة حسب مواصفاتك أو المخصصة لك، ولا على المنتجات التي لا يمكن إعادة إرسالها بحكم طبيعتها أو المعرضة للتلف السريع",
    regime === "EU" ? "، ولا على منتجات النظافة أو التجميل التي فُتح غلافها بعد التسليم." : ".",
  ],
  withdrawalSummary: {
    MA: ["حق التراجع: ", b("7 أيام"), " بعد الاستلام (القانون رقم 31.08)."],
    EU: ["حق التراجع: ", b("14 يوما"), " بعد الاستلام."],
    INTL: ["حق التراجع داخل الأجل الذي ينص عليه القانون المعمول به."],
  },
  legalGuarantee: "تستفيد المنتجات من الضمان القانوني لعيوب الشيء المبيع: يُستبدل المنتج المعيب أو غير المطابق لطلبك أو يُرد ثمنه، وتكون مصاريف الإرجاع على عاتق المتجر.",
  guaranteeContact: (contact) => ["للاستفادة منه، تواصل معنا ", ...contact, " مع صورة للمنتج."],
  storeWarranty: (length, text) => ["ويقدم المتجر أيضا ضمانا لمدة ", b(length), text ? `: ${text}.` : "."],
  defects: "إذا توصلت بمنتج معيب أو مختلف عن طلبك، أخبرنا في أقرب وقت مع صورة: يُستبدل المنتج أو يُرد ثمنه، وتكون مصاريف الإرجاع على عاتق المتجر.",
  returnsAccepted: (window) => ["يقبل المتجر الإرجاع ", ...window, ". "],
  windowDays: (n) => ["خلال ", b(n), " بعد الاستلام"],
  windowGap: ["خلال أجل ", gap("عدد الأيام"), " بعد الاستلام"],
  returnsStorePays: "وتكون مصاريف الإرجاع على عاتقنا.",
  returnsCustomerPays: "وتكون مصاريف الإرجاع على عاتقك.",
  returnsPayGap: ["مصاريف الإرجاع: ", gap("على المتجر أو على الزبون"), "."],
  condition: (text) => ["الشرط: ", text, "."],
  returnsSteps: (contact) => [
    ["تواصل معنا ", ...contact, " مع ذكر رقم الطلب."],
    ["أرجع المنتج كاملا، في حالته وتغليفه الأصليين، حسب التعليمات التي نقدمها لك."],
  ],
  returnsNot: "لا يقبل المتجر الإرجاع خارج حق التراجع وحالات المنتجات المعيبة.",
  returnsGap: ["الإرجاع خارج حق التراجع: ", gap("مقبول أم لا، والأجل والمصاريف"), "."],
  returnsSummaryYes: (window) => (window ? ["الإرجاع مقبول خلال ", b(window), "."] : ["الإرجاع مقبول."]),
  returnsSummaryNo: "لا إرجاع خارج حق التراجع.",
  exchangeYes: (window, contact) => ["مقاس آخر أو لون آخر أو منتج آخر؟ يقبل المتجر الاستبدال ", ...window, "، حسب المخزون المتوفر. تواصل معنا ", ...contact, "."],
  exchangeNo: "لا يقترح المتجر الاستبدال.",
  exchangeGap: ["الاستبدال: ", gap("مقبول أم لا، والأجل"), "."],
  method: { cash: "نقدا", transfer: "بتحويل بنكي", store_credit: "على شكل رصيد لدى المتجر" },
  refundBoth: (method, n) => ["نرد لك المبلغ ", b(method), "، خلال ", b(n), " بعد توصلنا بالمنتج المرجع."],
  refundMethodOnly: (method) => ["نرد لك المبلغ ", b(method), ". أجل الاسترداد: ", gap("عدد الأيام"), "."],
  refundDaysOnly: (n) => ["نرد لك المبلغ خلال ", b(n), " بعد توصلنا بالمنتج المرجع. طريقة الاسترداد: ", gap("نقدا أو بتحويل أو كرصيد"), "."],
  refundGap: ["استرداد المبلغ: ", gap("الطريقة والأجل"), "."],
  ordersCall: "بعد طلبك، نتصل بك لتأكيده. ",
  ordersFollowUp: "لأي سؤال عن توصيل جار، تواصل معنا مع ذكر رقم الطلب (الظاهر في صفحة التأكيد) ورقم الهاتف الذي استعملته في الطلب.",
  hours: (text) => ["أوقات الاتصال: ", b(text), "."],
};

const EN: Words = {
  sectionTitles: { withdrawal: "Right of withdrawal", returns: "Returns", exchange: "Exchanges", refund: "Refunds", defects: "Faulty product or mistake" },
  coverageShort: { national: (ma) => (ma ? "Delivery to every city in Morocco" : "Delivery nationwide"), zones: "Delivery to the cities of our zones" },
  usually: (range) => [", usually in ", b(range)],
  dated: ", with your city's date shown in the form",
  datedLine: "Your city's delivery date is shown in the form.",
  coverageGap: ["Delivery areas: ", gap("nationwide or listed cities")],
  timeGap: ["Usual delivery time: ", gap("number of days")],
  coverageNational: (ma) => (ma ? "We deliver to every Moroccan city served by our delivery company." : "We deliver nationwide, to the areas served by our delivery company."),
  citySelectNote: " If your city is not in the form's list, choose “Other city” and add your locality to the address.",
  coverageZones: (dated) => `We deliver to the cities of our delivery zones.${dated ? " Pick your city in the form to see the expected delivery date." : " If you are unsure about your city, contact us before ordering."}`,
  timesDated: "The order form shows the expected delivery date for your city. It may take longer for remote areas, on public holidays or at busy times.",
  timesTypical: (range, call) => ["Usual time: ", b(range), `, from the moment your order is confirmed${call ? " by phone" : ""}. It may take longer for remote areas, on public holidays or at busy times.`],
  payAllowed: ["Pay in cash on delivery, ", b("after checking the parcel"), "."],
  payPlain: ["Pay in cash, ", b("to the courier on delivery"), "."],
  checkAllowed: ["Check the parcel and its contents ", b("before paying"), ". If it is damaged, incomplete or does not match your order, you can refuse it: you pay nothing."],
  checkNot: ["The parcel is paid for ", b("before it is opened"), ". If something is wrong when you open it, contact us with a photo."],
  checkGap: ["Opening the parcel before paying: ", gap("allowed or not"), "."],
  stepConfirm: [b("Confirmation"), ": we call you or message you on WhatsApp to confirm the order and address."],
  stepShip: [b("Shipping"), ": your parcel is handed to our delivery company."],
  stepDeliver: [b("Delivery"), ": the courier calls you before coming, so keep your phone close."],
  stepPayChecked: [b("Payment"), ": you check the parcel, then pay the courier in cash."],
  stepPay: [b("Payment"), ": you pay the courier in cash on delivery."],
  callSummary: "We call you to confirm before shipping.",
  orderConfirmCall: "We call you or message you on WhatsApp to confirm the order and address: the order ships after this confirmation.",
  orderConfirmPlain: "Your order is then prepared and handed to our delivery company.",
  paymentAllowed: "You can check your parcel on delivery, before paying. If it is damaged or does not match your order, you can refuse it and pay nothing.",
  paymentNot: "The parcel is paid for before it is opened. If something is wrong when you open it, contact us with a photo.",
  paymentGap: ["Checking the parcel before paying: ", gap("allowed or not"), "."],
  withdrawalLaw: {
    MA: ["Under ", b("Law No. 31-08"), " on consumer protection, you have ", b("7 days"), " from receiving your order to exercise your right of withdrawal, without giving a reason or paying any penalty, except for return costs."],
    EU: ["Under the European rules on distance contracts, you have ", b("14 days"), " from receiving your order to withdraw, without giving a reason. Return costs are yours."],
    INTL: ["You can withdraw after receiving your order within the period set by the applicable law; return costs are yours."],
  },
  withdrawalExercise: (contact, regime) => [
    "To do so, contact us ",
    ...contact,
    " with your order number. The product must be returned complete and in its original condition. ",
    regime === "MA"
      ? "The amounts paid are refunded without delay, and at the latest within 15 days of the withdrawal."
      : regime === "EU"
        ? "The amounts paid are refunded at the latest 14 days after the withdrawal; the refund may wait until the returned product is received."
        : "The amounts paid are refunded within the periods set by the applicable law.",
  ],
  withdrawalExceptions: (regime) => [
    "Where the law provides, this right does not apply to products made to your specifications or personalised, nor to products that by nature cannot be sent back or may deteriorate quickly",
    regime === "EU" ? ", nor to hygiene or cosmetic products unsealed after delivery." : ".",
  ],
  withdrawalSummary: {
    MA: ["Right of withdrawal: ", b("7 days"), " after delivery (Law No. 31-08)."],
    EU: ["Right of withdrawal: ", b("14 days"), " after delivery."],
    INTL: ["Right of withdrawal within the period set by the applicable law."],
  },
  legalGuarantee: "Products are covered by the legal warranty against defects in the goods sold: a faulty product, or one that does not match your order, is replaced or refunded, and return costs are paid by the store.",
  guaranteeContact: (contact) => ["To use it, contact us ", ...contact, " with a photo of the product."],
  storeWarranty: (length, text) => ["The store also gives a warranty of ", b(length), text ? `: ${text}.` : "."],
  defects: "If you receive a faulty product or one that differs from your order, tell us as soon as possible with a photo: it is replaced or refunded, and return costs are paid by the store.",
  returnsAccepted: (window) => ["The store accepts returns ", ...window, ". "],
  windowDays: (n) => ["within ", b(n), " of delivery"],
  windowGap: ["within ", gap("number of days"), " of delivery"],
  returnsStorePays: "Return shipping is paid by the store.",
  returnsCustomerPays: "Return shipping is paid by you.",
  returnsPayGap: ["Return shipping: ", gap("paid by the store or the customer"), "."],
  condition: (text) => ["Condition: ", text, "."],
  returnsSteps: (contact) => [
    ["Contact us ", ...contact, " with your order number."],
    ["Send the product back complete, in its original condition and packaging, following our instructions."],
  ],
  returnsNot: "Outside the right of withdrawal and faulty products, the store does not accept returns.",
  returnsGap: ["Returns outside the right of withdrawal: ", gap("accepted or not, time limit and costs"), "."],
  returnsSummaryYes: (window) => (window ? ["Returns accepted within ", b(window), "."] : ["Returns accepted."]),
  returnsSummaryNo: "No returns outside the right of withdrawal.",
  exchangeYes: (window, contact) => ["Another size, colour or item? The store accepts exchanges ", ...window, ", subject to stock. Contact us ", ...contact, "."],
  exchangeNo: "The store does not offer exchanges.",
  exchangeGap: ["Exchanges: ", gap("accepted or not, and time limit"), "."],
  method: { cash: "in cash", transfer: "by bank transfer", store_credit: "as store credit" },
  refundBoth: (method, n) => ["We refund ", b(method), ", within ", b(n), " of receiving the returned product."],
  refundMethodOnly: (method) => ["We refund ", b(method), ". Refund time: ", gap("number of days"), "."],
  refundDaysOnly: (n) => ["We refund within ", b(n), " of receiving the returned product. Refund method: ", gap("cash, transfer or store credit"), "."],
  refundGap: ["Refunds: ", gap("method and time limit"), "."],
  ordersCall: "After you order, we call you to confirm it. ",
  ordersFollowUp: "For any question about a delivery in progress, contact us with your order number (shown on the confirmation page) and the phone number you ordered with.",
  hours: (text) => ["Calling hours: ", b(text), "."],
};

const WORDS: Record<Lang, Words> = { fr: FR, ar: AR, en: EN };

/* ------------------------------------------------------------------ */
/* the builder                                                         */
/* ------------------------------------------------------------------ */

const section = (id: string, title: string, blocks: Block[]): LegalSection => ({ id, title, blocks });

/**
 * The hours line as one unit per range: a range never wraps at its hyphen ("09:30-" / "12:15"; U+2060 word joiners),
 * and in Arabic each clock time or range sits in a first-strong isolate (U+2066 … U+2069), so "09:30-13:00" never
 * reads "13:00-09:30", as the page's price chips do (LD38, RTL1).
 */
const hoursRuns = (s: string, lang: Lang) =>
  s.replace(/(\d{1,2}:\d{2})(?:\s*-\s*(\d{1,2}:\d{2}))?/g, (_m, a: string, z?: string) => {
    const run = z ? `${a}\u2060-\u2060${z}` : a;
    return lang === "ar" ? `\u2066${run}\u2069` : run;
  });

/** Every promise of a legal page, from the store's answers (an unset one gives its gap, never a sentence). */
export function legalPromises(input: PromiseInput): LegalPromises {
  const { lang, regime, pol, contact } = input;
  const w = WORDS[lang];
  const ma = regime === "MA";
  const pf = pol.policies;
  const { call, zonesWithDays: dated } = pol;
  const inspection = pf.inspection;
  const typical = pf.delivery.typicalDays;

  // delivery: where, then how fast (the zones' dates win over the typical range, which only holds while zones are off)
  const coverage = pf.delivery.coverage;
  const where: Inline[] | null = coverage === "national" ? [w.coverageShort.national(ma)] : coverage === "listed_zones" ? [w.coverageShort.zones] : null;
  const when: Inline[] | null = dated ? [w.dated] : typical ? w.usually(dayRange(lang, typical)) : null;
  const deliverySummary: Inline[][] = where
    ? when
      ? [[...where, ...when, "."]]
      : [[...where, "."], [...w.timeGap, "."]]
    : [[...w.coverageGap, "."], dated ? [w.datedLine] : typical ? [w.timeGap[0]!, b(dayRange(lang, typical)), "."] : [...w.timeGap, "."]];

  const coverageBlock =
    coverage === "national"
      ? p(w.coverageNational(ma), ma && input.citySelect ? w.citySelectNote : "")
      : coverage === "listed_zones"
        ? p(w.coverageZones(dated))
        : p(...w.coverageGap, ".");
  const times = dated ? p(w.timesDated) : typical ? p(...w.timesTypical(dayRange(lang, typical), call)) : p(...w.timeGap, ".");

  // the parcel: checked before paying only when the store said so
  const paySummary = inspection === "allowed" ? w.payAllowed : w.payPlain;
  const check = inspection === "allowed" ? callout("shield-check", ...w.checkAllowed) : inspection === "not_allowed" ? callout("info", ...w.checkNot) : p(...w.checkGap);
  const steps = [...(call ? [w.stepConfirm] : []), w.stepShip, w.stepDeliver, inspection === "allowed" ? w.stepPayChecked : w.stepPay];
  const payment = inspection === "allowed" ? p(w.paymentAllowed) : inspection === "not_allowed" ? p(w.paymentNot) : p(...w.paymentGap);

  // the law (D39: shown as written, flagged for review)
  const withdrawal = [law(...w.withdrawalLaw[regime]), law(...w.withdrawalExercise(contact, regime)), law(...w.withdrawalExceptions(regime))];
  const warranty: Block[] = [law(w.legalGuarantee), p(...w.guaranteeContact(contact))];
  if (pf.warranty.months !== null) warranty.push(p(...w.storeWarranty(months(lang, pf.warranty.months), locText(pf.warranty.text, lang))));

  // the store's own returns, exchanges and refunds
  const r = pf.returns;
  const windowOf = (n: number | null): Inline[] => (n !== null ? w.windowDays(days(lang, n)) : w.windowGap);
  const returnsBlocks: Block[] = [];
  if (r.accepted === true) {
    const pays: Inline[] = r.whoPays === "store" ? [w.returnsStorePays] : r.whoPays === "customer" ? [w.returnsCustomerPays] : w.returnsPayGap;
    returnsBlocks.push(p(...w.returnsAccepted(windowOf(r.windowDays)), ...pays));
    const cond = locText(r.condition, lang);
    if (cond) returnsBlocks.push(p(...w.condition(cond)));
    returnsBlocks.push(list(...w.returnsSteps(contact)));
  } else if (r.accepted === false) returnsBlocks.push(p(w.returnsNot));
  else returnsBlocks.push(p(...w.returnsGap));

  const ex = pf.exchange;
  const exchange = ex.accepted === true ? p(...w.exchangeYes(windowOf(ex.windowDays), contact)) : ex.accepted === false ? p(w.exchangeNo) : p(...w.exchangeGap);

  const f = pf.refund;
  const method = f.method !== "unset" ? w.method[f.method] : null;
  const within = f.withinDays !== null ? days(lang, f.withinDays) : null;
  const refund = method && within ? p(...w.refundBoth(method, within)) : method ? p(...w.refundMethodOnly(method)) : within ? p(...w.refundDaysOnly(within)) : p(...w.refundGap);

  const t = w.sectionTitles;
  const returnsSections = [
    section("withdrawal", t.withdrawal, withdrawal),
    section("returns", t.returns, returnsBlocks),
    section("exchange", t.exchange, [exchange]),
    section("refund", t.refund, [refund]),
    section("defects", t.defects, [law(w.defects)]),
  ];
  const returnsSummary: Inline[][] = [w.withdrawalSummary[regime]];
  if (r.accepted === true) returnsSummary.push(w.returnsSummaryYes(r.windowDays !== null ? days(lang, r.windowDays) : null));
  else if (r.accepted === false) returnsSummary.push([w.returnsSummaryNo]);

  return {
    deliverySummary,
    paySummary,
    returnsSummary,
    callSummary: call ? [w.callSummary] : null,
    coverage: coverageBlock,
    times,
    steps,
    check,
    orderConfirm: [call ? w.orderConfirmCall : w.orderConfirmPlain],
    payment,
    withdrawal,
    warranty,
    returnsSections,
    contactOrders: p(call ? w.ordersCall : "", w.ordersFollowUp),
    hours: pol.hours ? p(...w.hours(hoursRuns(pol.hours, lang))) : null,
  };
}
