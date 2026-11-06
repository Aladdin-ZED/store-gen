/**
 * The curated style guide (P7 AI; ai.md AI-§G.3 R1, AI-§F.2 row 2, rev 3 QUAL-31): six exemplars per locale that the
 * copy families' block 2 carries whole (stable, so one cached prefix serves every store), while block 4 names the two
 * a request follows (`styleRotation`), so references rotate and outputs do not converge. The R1 learning loop is this
 * rotation plus the store's explicit voice and memory; no database exemplar exists before R3 (AI-14).
 *
 * Exemplars carry structure, never specifics: every line is written with slots ({product}, {use}, {fact}, {pain},
 * {gain}, {delivery}, {policy}) instead of real nouns, carries its headline structure (`s`, design's G29 ids) and its
 * rhythm (`d`). `test:ai` lints the guide: no claim noun of guard-claims.ts, no figure in digits or words, no dash,
 * no banned word, and the Arabic lines spell Darija as the orthography guide does.
 *
 * Pure and isomorphic; editing a line changes the copy families' `templateHash` (a new prompt version).
 */
import type { HeadlineStructure } from "@/lib/design/genome";
import type { CopyLocale } from "../prompts";
import { sha256Hex } from "./sha256";

export interface StyleExemplar {
  /** "fr-3": the name block 4 refers to */
  id: string;
  /** the headline structure (G29) */
  s: HeadlineStructure;
  /** the rhythm: word count and clause shape of the headline */
  d: string;
  headline: string;
  sub: string;
  benefit: { title: string; text: string };
  faq: { q: string; a: string };
  cta: string;
}

export const STYLE_SLOTS = ["{product}", "{use}", "{fact}", "{pain}", "{gain}", "{delivery}", "{policy}"] as const;
export const EXEMPLARS_PER_LOCALE = 6;

const FR: readonly StyleExemplar[] = [
  {
    id: "fr-1",
    s: "noun-phrase",
    d: "6 words, one clause, the emphasis on the benefit",
    headline: "Le confort de {use}, sans *effort*.",
    sub: "{fact}. Un objet pensé pour le quotidien, simple à prendre en main.",
    benefit: { title: "Pensé pour vous", text: "Chaque détail sert {use} : rien de superflu, rien à apprendre." },
    faq: { q: "Comment se passe le paiement ?", a: "Vous payez en espèces au livreur, à la réception. Rien n'est payé en ligne." },
    cta: "Je commande",
  },
  {
    id: "fr-2",
    s: "imperative",
    d: "5 words, a verb first, a short qualifier",
    headline: "Offrez-vous {use}, *tout simplement*.",
    sub: "{fact}. Vous commandez en un instant et vous payez à la livraison.",
    benefit: { title: "Prêt à l'emploi", text: "Vous le sortez de la boîte et vous l'utilisez tout de suite." },
    faq: { q: "Où livrez-vous ?", a: "{delivery}. Un conseiller vous appelle pour confirmer la commande avant l'envoi." },
    cta: "Je le veux",
  },
  {
    id: "fr-3",
    s: "question",
    d: "6 words, one question, no answer in the headline",
    headline: "Et si {use} devenait *facile* ?",
    sub: "{fact}. Une réponse concrète à un petit souci de tous les jours.",
    benefit: { title: "Moins de tracas", text: "{fact} : vous gagnez du temps là où il vous manquait." },
    faq: { q: "Comment l'utiliser ?", a: "{fact}. Le mode d'emploi est dans la boîte, et l'équipe répond à vos questions lors de l'appel de confirmation." },
    cta: "Commander maintenant",
  },
  {
    id: "fr-4",
    s: "contrast-pair",
    d: "6 words, two mirrored halves",
    headline: "Moins de {pain}, plus de *{gain}*.",
    sub: "{fact}. La différence se voit à l'usage, pas sur l'étiquette.",
    benefit: { title: "Ce qui change", text: "{pain} laisse la place à {gain}, sans rien changer à vos habitudes." },
    faq: { q: "Et si le produit ne me convient pas ?", a: "{policy}. Posez toutes vos questions lors de l'appel de confirmation." },
    cta: "Je passe commande",
  },
  {
    id: "fr-5",
    s: "quote-led",
    d: "the merchant's own words in quotes, then a short close",
    headline: "« {fact} », et c'est *tout*.",
    sub: "Nous préférons dire peu et dire vrai.",
    benefit: { title: "Dit simplement", text: "{fact}, sans promesse que la boutique ne peut pas tenir." },
    faq: { q: "Combien coûte la livraison ?", a: "Le prix et les frais de livraison s'affichent avant de valider. {delivery}." },
    cta: "Je commande",
  },
  {
    id: "fr-6",
    s: "word-subline",
    d: "one emphasised word, then a plain subline",
    headline: "*Simple.* {product} pour {use}.",
    sub: "{fact}. Commandez maintenant, payez à la réception du colis.",
    benefit: { title: "À votre rythme", text: "Vous l'utilisez quand vous voulez, comme vous voulez." },
    faq: { q: "Comment commander ?", a: "Remplissez le formulaire, un conseiller vous appelle pour confirmer, puis le livreur vous apporte le colis." },
    cta: "Commander",
  },
];

const EN: readonly StyleExemplar[] = [
  {
    id: "en-1",
    s: "noun-phrase",
    d: "7 words, one clause, the emphasis on the benefit",
    headline: "The comfort of {use}, without the *effort*.",
    sub: "{fact}. Made for everyday use and easy to pick up.",
    benefit: { title: "Made for you", text: "Every detail serves {use}: nothing extra, nothing to learn." },
    faq: { q: "How do I pay?", a: "You pay the courier in cash when the parcel arrives. Nothing is paid online." },
    cta: "Order now",
  },
  {
    id: "en-2",
    s: "imperative",
    d: "5 words, a verb first, a short qualifier",
    headline: "Treat yourself to {use}, *simply*.",
    sub: "{fact}. Order in a moment and pay on delivery.",
    benefit: { title: "Ready to use", text: "Take it out of the box and use it straight away." },
    faq: { q: "Where do you deliver?", a: "{delivery}. A teammate calls you to confirm the order before it ships." },
    cta: "I want it",
  },
  {
    id: "en-3",
    s: "question",
    d: "5 words, one question, no answer in the headline",
    headline: "What if {use} got *easier*?",
    sub: "{fact}. A practical answer to a small everyday problem.",
    benefit: { title: "Less hassle", text: "{fact}, so you get back time you were missing." },
    faq: { q: "How do I use it?", a: "{fact}. The instructions are in the box, and the team answers your questions on the confirmation call." },
    cta: "Order now",
  },
  {
    id: "en-4",
    s: "contrast-pair",
    d: "4 words, two mirrored halves",
    headline: "Less {pain}, more *{gain}*.",
    sub: "{fact}. You see the difference in use, not on the label.",
    benefit: { title: "What changes", text: "{pain} gives way to {gain}, and your routine stays the same." },
    faq: { q: "What if it does not suit me?", a: "{policy}. Ask anything on the confirmation call." },
    cta: "Place my order",
  },
  {
    id: "en-5",
    s: "quote-led",
    d: "the merchant's own words in quotes, then a short close",
    headline: "\"{fact}\", and that is *all*.",
    sub: "We would rather say little and say it true.",
    benefit: { title: "Plainly said", text: "{fact}, with no promise the shop cannot keep." },
    faq: { q: "How much is delivery?", a: "The price and the delivery fee show before you confirm. {delivery}." },
    cta: "Order now",
  },
  {
    id: "en-6",
    s: "word-subline",
    d: "one emphasised word, then a plain subline",
    headline: "*Simple.* {product} for {use}.",
    sub: "{fact}. Order now, pay when the parcel arrives.",
    benefit: { title: "On your terms", text: "Use it when you like, the way you like." },
    faq: { q: "How do I order?", a: "Fill in the form, a teammate calls to confirm, then the courier brings the parcel." },
    cta: "Order",
  },
];

const AR: readonly StyleExemplar[] = [
  {
    id: "ar-1",
    s: "noun-phrase",
    d: "5 words, one clause, the emphasis on the benefit",
    headline: "راحة {use} بدون *عناء*.",
    sub: "{fact}. منتج بسيط للاستعمال اليومي وسهل منذ البداية.",
    benefit: { title: "مصمم لك", text: "كل تفصيل في خدمة {use}، بلا تعقيد ولا شيء زائد." },
    faq: { q: "كيف يتم الدفع؟", a: "تدفع نقداً للموزع عند الاستلام. لا يوجد أي دفع عبر الإنترنت." },
    cta: "اطلب دابا",
  },
  {
    id: "ar-2",
    s: "imperative",
    d: "4 words, a verb first, a short qualifier",
    headline: "امنح نفسك {use} *ببساطة*.",
    sub: "{fact}. اطلب بسهولة وادفع عند الاستلام.",
    benefit: { title: "جاهز للاستعمال", text: "تخرجه من العلبة وتستعمله مباشرة." },
    faq: { q: "أين توصلون؟", a: "{delivery}. يتصل بك فريقنا لتأكيد الطلب قبل الإرسال." },
    cta: "بغيت نطلب",
  },
  {
    id: "ar-3",
    s: "question",
    d: "5 words, one question, no answer in the headline",
    headline: "ماذا لو أصبح {use} *أسهل*؟",
    sub: "{fact}. حل عملي لمشكلة صغيرة نعيشها يومياً.",
    benefit: { title: "تعب أقل", text: "{fact}، فتربح وقتاً كنت تحتاجه." },
    faq: { q: "كيف أستعمله؟", a: "{fact}. طريقة الاستعمال داخل العلبة، والفريق يجيب عن أسئلتك أثناء مكالمة التأكيد." },
    cta: "اطلب الآن",
  },
  {
    id: "ar-4",
    s: "contrast-pair",
    d: "5 words, two mirrored halves",
    headline: "{pain} أقل، و*{gain}* أكثر.",
    sub: "{fact}. الفرق يظهر في الاستعمال، لا في الكلام.",
    benefit: { title: "ما الذي يتغير", text: "يترك {pain} مكانه لـ{gain}، وتبقى عاداتك كما هي." },
    faq: { q: "وإذا لم يناسبني المنتج؟", a: "{policy}. اسأل عن كل التفاصيل أثناء مكالمة التأكيد." },
    cta: "سيفط الطلب",
  },
  {
    id: "ar-5",
    s: "quote-led",
    d: "the merchant's own words in quotes, then a short close",
    headline: "«{fact}»، وهذا *كل* ما يهم.",
    sub: "نفضل أن نقول القليل وأن نقول الصدق.",
    benefit: { title: "بكل وضوح", text: "{fact}، بدون وعود لا يستطيع المتجر الوفاء بها." },
    faq: { q: "كم ثمن التوصيل؟", a: "يظهر الثمن ورسوم التوصيل قبل تأكيد الطلب. {delivery}." },
    cta: "اطلب دابا",
  },
  {
    id: "ar-6",
    s: "word-subline",
    d: "one emphasised word, then a plain subline",
    headline: "*ببساطة.* {product} من أجل {use}.",
    sub: "{fact}. اطلب الآن وادفع عند استلام الطرد.",
    benefit: { title: "على راحتك", text: "تستعمله متى شئت وكما تشاء." },
    faq: { q: "كيف أطلب؟", a: "املأ الاستمارة، يتصل بك مستشار لتأكيد الطلب، ثم يوصل لك الموزع الطرد." },
    cta: "بغيت نطلب",
  },
];

export const STYLE_GUIDE: Readonly<Record<CopyLocale, readonly StyleExemplar[]>> = { ar: AR, fr: FR, en: EN };

/** The lines an exemplar carries, by field, for the lint and the renderer. */
export function exemplarLines(e: StyleExemplar): string[] {
  return [e.headline, e.sub, e.benefit.title, e.benefit.text, e.faq.q, e.faq.a, e.cta];
}

export type StyleField = "headline" | "sub" | "benefit" | "faq" | "cta";

/** The guide as block 2 states it, for the fields a family writes (one stable text for ar, fr and en). */
export function renderStyleGuide(fields: readonly StyleField[]): string {
  const out = [
    "## Style guide (six exemplars per language; each request names the two to follow)",
    "The exemplars show rhythm and structure only. They were written for other products; the words in braces are slots, never facts. Never copy their wording, and never take a fact, a material, an origin or a promise from them.",
  ];
  for (const locale of ["ar", "fr", "en"] as const) {
    out.push("", `### ${locale}`);
    for (const e of STYLE_GUIDE[locale]) {
      const parts: string[] = [`${e.id} (structure ${e.s}; rhythm: ${e.d})`];
      if (fields.includes("headline")) parts.push(`  headline: ${e.headline}`);
      if (fields.includes("sub")) parts.push(`  sub: ${e.sub}`);
      if (fields.includes("benefit")) parts.push(`  benefit: ${e.benefit.title} | ${e.benefit.text}`);
      if (fields.includes("faq")) parts.push(`  faq: ${e.faq.q} | ${e.faq.a}`);
      if (fields.includes("cta")) parts.push(`  cta: ${e.cta}`);
      out.push(...parts);
    }
  }
  return out.join("\n");
}

/** The 15 unordered pairs of 0..5 (C(6,2)), in a fixed order. */
export const STYLE_PAIRS: readonly (readonly [number, number])[] = Array.from({ length: EXEMPLARS_PER_LOCALE }, (_, i) =>
  Array.from({ length: EXEMPLARS_PER_LOCALE - i - 1 }, (_, k) => [i, i + k + 1] as const),
).flat();

/**
 * Which two exemplars a request follows (AI-§G.3): `hash(storeId|pageId|seed) mod C(6,2)`. Only the pair's names
 * travel (block 4); the store id never does.
 */
export function styleRotation(storeId: string, pageId: string | null, seed: string | number): readonly [number, number] {
  const h = sha256Hex(`${storeId}|${pageId ?? ""}|${seed}`);
  return STYLE_PAIRS[parseInt(h.slice(0, 8), 16) % STYLE_PAIRS.length]!;
}

/** Block 4's operator line naming the pair, e.g. "Follow the rhythm of style exemplars fr-2 and fr-5." */
export function rotationLine(locale: CopyLocale, pair: readonly [number, number]): string {
  return `Follow the rhythm and structure of style exemplars ${locale}-${pair[0] + 1} and ${locale}-${pair[1] + 1}; write new words for this product.`;
}
