/**
 * README.txt of the store export (docs/STORE-SAAS.md §F.9; R1 P8 step 8): Arabic, French and English, plain sentences,
 * no dash punctuation. Pure: the job passes what it wrote (the files and folders present, the part count) and the
 * notes of what it skipped (a table or a column this database does not have yet, a media file that could not be read),
 * so the README never lists a file that is not in the archive.
 */

export interface ReadmeInput {
  storeName: string;
  handle: string;
  /** when the export was requested (ISO) */
  createdAt: string;
  /** how many ZIP parts the export has (README.txt sits in the last one) */
  parts: number;
  /** top-level names present: "orders.csv", "pages/", "media/", … */
  files: readonly string[];
  /** machine notes of what was skipped, e.g. "table customers: not in this database" */
  notes: readonly string[];
}

type Lang = "ar" | "fr" | "en";

const FILES: Record<string, Record<Lang, string>> = {
  "orders.csv": { ar: "الطلبات، بكل الأعمدة وأرقام الهواتف كاملة", fr: "les commandes, toutes les colonnes, téléphones complets", en: "orders, every column, full phone numbers" },
  "leads.csv": { ar: "الطلبات غير المكتملة (الزوار الذين تركوا رقمهم)", fr: "les prospects (formulaires commencés)", en: "leads (started order forms)" },
  "customers.csv": { ar: "الزبائن", fr: "les clients", en: "customers" },
  "order_events.csv": { ar: "سجل كل طلب (التأكيد، الشحن، التسليم...)", fr: "l'historique de chaque commande", en: "the history of each order" },
  "members.csv": { ar: "فريق المتجر: الاسم، البريد، الدور، الحالة", fr: "l'équipe : nom, e-mail, rôle, statut", en: "the team: name, e-mail, role, status" },
  "audit.csv": { ar: "سجل النشاط الخاص بالمتجر", fr: "le journal d'activité de la boutique", en: "the store's activity log" },
  "agent_stats_daily.csv": { ar: "إحصائيات الموظفين اليومية", fr: "les statistiques quotidiennes des agents", en: "daily agent statistics" },
  "message_templates.csv": { ar: "نماذج الرسائل وسكريبتات المكالمات", fr: "les modèles de messages et scripts d'appel", en: "message templates and call scripts" },
  "short_links.csv": { ar: "الروابط القصيرة", fr: "les liens courts", en: "short links" },
  "settings.json": { ar: "إعدادات المتجر، بدون أي مفتاح سري", fr: "les réglages, sans aucune clé secrète", en: "store settings, without any secret key" },
  "campaigns.json": { ar: "الحملات وعُدّة الإعلانات، بدون روابط المشاركة", fr: "les campagnes et kits, sans liens de partage", en: "campaigns and ad kits, without share links" },
  "delivery_zones.json": { ar: "مناطق التوصيل", fr: "les zones de livraison", en: "delivery zones" },
  "ai_memory.json": { ar: "ذاكرة الذكاء الاصطناعي (ما علّمته وما تعلّمه)", fr: "la mémoire de l'IA (explicite et apprise)", en: "the AI memory (explicit and learned items)" },
  "health.json": { ar: "آخر تقييم لصحة المتجر", fr: "le dernier bilan de santé de la boutique", en: "the latest store health snapshot" },
  "pages/": { ar: "الصفحات المنشورة: doc.json و index.html و merci.html لكل صفحة", fr: "les pages publiées : doc.json, index.html et merci.html par page", en: "published pages: doc.json, index.html and merci.html per page" },
  "drafts/": { ar: "المسودات الحالية لكل صفحة", fr: "le brouillon actuel de chaque page", en: "the current draft of each page" },
  "media/": { ar: "الصور والفيديوهات، بأكبر نسخة محفوظة", fr: "les images et vidéos, dans la plus grande version gardée", en: "images and videos, in the largest stored version" },
};

const TEXT: Record<Lang, (i: ReadmeInput) => string[]> = {
  en: (i) => [
    `Data export of ${i.storeName} (${i.handle})`,
    `Requested on ${i.createdAt.slice(0, 10)} (UTC).`,
    "",
    i.parts > 1 ? `This export has ${i.parts} ZIP parts. Each part is a complete ZIP file: download and open every one.` : "This export is one ZIP file.",
    "",
    "What is inside:",
    ...i.files.map((f) => `  ${f}  ${FILES[f]?.en ?? ""}`.trimEnd()),
    "",
    "How to read it:",
    "  CSV files are UTF-8 and open in Excel or Google Sheets with Arabic text intact.",
    "  Amounts are written exactly as stored. The currency is in the currency column. Columns ending in _cents are whole cents (1999 = 19.99).",
    "  Dates are in UTC (ISO 8601). Test orders have is_test = 1.",
    "  A text cell that starts with = + - or @ (a phone like +212..., for example) begins with an apostrophe, so a spreadsheet shows it as text and never runs it as a formula.",
    "",
    "Never included: passwords, secret keys and tokens (Telegram, tracking, API keys, webhooks, carriers), the server-side tracking data of orders, share and test links, AI run outputs and internal platform flags.",
    "",
    "The download links work for 24 hours. The files are deleted 72 hours after the export was ready.",
  ],
  fr: (i) => [
    `Export des données de ${i.storeName} (${i.handle})`,
    `Demandé le ${i.createdAt.slice(0, 10)} (UTC).`,
    "",
    i.parts > 1 ? `Cet export compte ${i.parts} parties ZIP. Chaque partie est un fichier ZIP complet : téléchargez et ouvrez chacune.` : "Cet export tient en un seul fichier ZIP.",
    "",
    "Contenu :",
    ...i.files.map((f) => `  ${f}  ${FILES[f]?.fr ?? ""}`.trimEnd()),
    "",
    "Lecture :",
    "  Les CSV sont en UTF-8 et s'ouvrent dans Excel ou Google Sheets avec l'arabe intact.",
    "  Les montants sont écrits tels qu'enregistrés. La devise est dans la colonne currency. Les colonnes en _cents sont en centimes entiers (1999 = 19,99).",
    "  Les dates sont en UTC (ISO 8601). Les commandes de test ont is_test = 1.",
    "  Une cellule de texte qui commence par = + - ou @ (un téléphone +212..., par exemple) commence par une apostrophe : le tableur l'affiche comme du texte et ne l'exécute jamais comme une formule.",
    "",
    "Jamais inclus : mots de passe, clés et jetons secrets (Telegram, suivi publicitaire, clés API, webhooks, transporteurs), les données de suivi côté serveur des commandes, les liens de partage et de test, les sorties des exécutions IA et les indicateurs internes de la plateforme.",
    "",
    "Les liens de téléchargement sont valables 24 heures. Les fichiers sont supprimés 72 heures après que l'export est prêt.",
  ],
  ar: (i) => [
    `تصدير بيانات المتجر ${i.storeName} (${i.handle})`,
    `تاريخ الطلب: ${i.createdAt.slice(0, 10)} (بتوقيت UTC).`,
    "",
    i.parts > 1 ? `هذا التصدير فيه ${i.parts} ملفات ZIP. كل ملف كامل بوحده، حمّل وافتح كل واحد منهم.` : "هذا التصدير ملف ZIP واحد.",
    "",
    "المحتوى:",
    ...i.files.map((f) => `  ${f}  ${FILES[f]?.ar ?? ""}`.trimEnd()),
    "",
    "طريقة القراءة:",
    "  ملفات CSV بترميز UTF-8، وتفتح في Excel أو Google Sheets والنص العربي سليم.",
    "  المبالغ مكتوبة كما هي محفوظة، والعملة في عمود currency. الأعمدة التي تنتهي بـ _cents بالسنتيم (1999 = 19.99).",
    "  التواريخ بتوقيت UTC (ISO 8601). طلبات التجربة عندها is_test = 1.",
    "  أي خانة نصية تبدأ بـ = أو + أو - أو @ (مثل رقم هاتف +212...) تبدأ بفاصلة عليا ' حتى يعرضها الجدول كنص ولا ينفذها كمعادلة.",
    "",
    "لا يتم تصدير أبدًا: كلمات السر، المفاتيح والرموز السرية (Telegram، التتبع، مفاتيح API، الـ webhooks، شركات التوصيل)، بيانات التتبع من جهة الخادم، روابط المشاركة والتجربة، مخرجات الذكاء الاصطناعي، والمؤشرات الداخلية للمنصة.",
    "",
    "روابط التحميل صالحة لمدة 24 ساعة. تُحذف الملفات بعد 72 ساعة من جاهزية التصدير.",
  ],
};

const NOTES: Record<Lang, string> = {
  en: "Skipped (shown as found, for support):",
  fr: "Éléments ignorés (tels quels, pour le support) :",
  ar: "عناصر لم يتم تصديرها (كما هي، للدعم):",
};

/** README.txt: the three languages one after the other (Arabic first), CRLF line ends. */
export function buildReadme(input: ReadmeInput): string {
  const block = (lang: Lang) => {
    const lines = TEXT[lang](input);
    if (input.notes.length) lines.push("", NOTES[lang], ...input.notes.map((n) => `  ${n}`));
    return lines.join("\r\n");
  };
  return `${[block("ar"), block("fr"), block("en")].join("\r\n\r\n==========\r\n\r\n")}\r\n`;
}
