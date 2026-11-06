/**
 * The compositional headline and lead generator (P6 DESIGN; design.md DES-§9.12, DS51, UX-18, QUAL-1). Pure, seeded,
 * isomorphic. The engine-only path (Cloud AI off, the wow demo) composes the hero title, the section titles and the
 * leads from slots instead of picking one of three library lines, so two stores with the same photos read
 * differently and a crowded niche cannot converge on a skeleton.
 *
 * Slots: `{fact}` / `{fact2}` (the merchant's facts, as typed), `{number}` (a fact that starts with a merchant number:
 * "100 % coton", "3 couleurs"; absent → the skeleton is not drawn), `{word}` (one sensory noun of the family),
 * `{use}` / `{do}` (the family's usage moment and verb), `{place}` (the warm register's places and moments),
 * `{product}` / `{product:le|ce|de|un|a}` (the `ProductRef`, French articles through `articleFor`), `{=cod}` (a marker:
 * the line states the store's cash-on-delivery policy, which every page of this platform carries). A skeleton whose
 * slots the store cannot fill is not drawn: no number, place or claim is ever invented (owner rule 4, DS42).
 *
 * Every returned line obeys the voice table (./voice.ts: rhythm, no exclamation, Darija only where G31 and the surface
 * allow it), has no cliché hit (`clicheScore` < 1.0), no em / en dash, no `·`, no French article fault, fits the
 * field and the `maxLines` filter, keeps its longest word under `maxWordChars` (the `--sh-word` fit), names ≥ 1 fact,
 * number, sensory or COD slot and has `spec ≥ 0.5` on its own sentences. The name-led neutral skeleton
 * (`{product}, {fact}.`) is the last resort; ≤ 0.3 ms per line.
 */
import { typeset } from "@/lib/ai/copy-library";
import { articleFor, type ArticleSlot, type ProductRef } from "@/lib/ai/copy-library/product-ref";
import type { Family } from "@/lib/ai/copy-library/types";
import type { Locale } from "@/lib/page/schema";
import { articleFaults, clicheHits, isSenseWord, LEXICONS, merchantNumbers, registerOf, sentenceSpecific, specificityCache, type DesignCopyFacts } from "./cliche";
import type { CopyDirectives } from "./compile";
import type { Angle, HeadlineStructure } from "./genome";
import { asciiDigits, sentences, textLocale, wordCount, type TextLocale } from "./text/normalize";
import { registerAllowed, VOICE, type Surface } from "./voice";

export type CopyFamily = Family;

/** One skeleton: a structure × an angle × a slot pattern, with its register tag (ar) and the fields it writes. */
export interface Skeleton {
  id: string;
  s: HeadlineStructure;
  angle: Angle;
  t: string;
  r: "msa" | "darija" | "none";
  field: "title" | "lead";
  /** common skeletons: the sections they title (benefits, faq, offer, guarantee, cta) */
  sections?: readonly string[];
  /** a `{place}` skeleton is drawn only for a register that names places (warm, poetic-restrained) */
}

export interface ComposeInput {
  ref: ProductRef;
  /** merchant facts, materials, policies, delivery text (the numbers come from these only) */
  facts: DesignCopyFacts;
  directives: Pick<CopyDirectives, "register" | "structures" | "angle" | "darija"> & Partial<Pick<CopyDirectives, "meanWords" | "exclaim">>;
  locale: Locale;
  family: CopyFamily;
  section: string;
  field: "title" | "lead" | "kicker" | "cta";
  /** the fold's line cap (H28: 2), read with `lineChars` per line */
  maxLines?: number;
  lineChars?: number;
  /** the `--sh-word` fit: the longest word the hero column holds at dmax */
  maxWordChars?: number;
  /** skeleton ids already used (the sibling directions, the store's last pages) */
  avoid?: ReadonlySet<string>;
}

export interface ComposedLine {
  t: string;
  s: HeadlineStructure;
  angle: Angle;
  /** which fact / number / sensory / cod / place slots were filled */
  slots: string[];
  r: "msa" | "darija" | "none";
  /** the skeleton id, for the sweep's distinctness count and the rotation */
  skeleton: string;
}

/* ------------------------------------------------------------------ */
/* the skeletons                                                       */
/* ------------------------------------------------------------------ */

type Row = [id: string, s: HeadlineStructure, angle: Angle, t: string, r?: "msa" | "darija"];
const rows = (l: TextLocale, field: "title" | "lead", list: readonly Row[], sections?: readonly string[]): Skeleton[] =>
  list.map(([id, s, angle, t, r]) => ({ id: `${l}.${field === "lead" ? "l" : "t"}.${id}`, s, angle, t, r: r ?? (l === "ar" ? "msa" : "none"), field, ...(sections ? { sections } : {}) }));

const CORE_TITLES: Readonly<Record<TextLocale, readonly Row[]>> = {
  fr: [
    ["np-fact", "noun-phrase", "benefit", "{product}, {fact}."],
    ["np-two", "noun-phrase", "proof", "{product} : {fact}, {fact2}."],
    ["np-list", "noun-phrase", "origin", "{fact}. {fact2}. {product}."],
    ["ws-name", "word-subline", "benefit", "*{word}.* {product}, {fact}."],
    ["ws-facts", "word-subline", "proof", "*{word}.* {fact}, {fact2}."],
    ["nl-name", "number-led", "proof", "{number}. {product}, {fact}."],
    ["nl-cod", "number-led", "value", "{number}, et vous payez à la réception.{=cod}"],
    ["im-try", "imperative", "benefit", "Essayez {product:le} : {fact}."],
    ["im-order", "imperative", "value", "Commandez {product:le}, payez à la réception.{=cod}"],
    ["np-place", "noun-phrase", "ritual", "{product}, {place}. {fact}."],
    ["cp-card", "contrast-pair", "value", "Pas de carte bancaire. Vous payez {product:le} à la réception.{=cod}"],
    ["cp-plain", "contrast-pair", "proof", "{fact}. Rien de plus."],
    ["np-rest", "noun-phrase", "proof", "{fact}, {fact2}. Le reste se voit à la réception.{=cod}"],
    ["q-fact", "question", "benefit", "{fact} ? C'est {product:le}."],
    ["np-gift", "noun-phrase", "gift", "{product}, {fact}. Un cadeau simple."],
    ["np-cod", "noun-phrase", "value", "{product}, {fact}. Vous payez à la réception.{=cod}"],
    ["im-start", "imperative", "ritual", "Commencez {place} avec {product:le}. {fact}."],
    ["np-words", "noun-phrase", "proof", "{product} en deux mots : {fact}, {fact2}."],
    ["nl-two", "number-led", "proof", "{number}. {fact2}."],
    ["cp-promise", "contrast-pair", "proof", "Pas une promesse. {fact}, {fact2}."],
    ["cp-less", "contrast-pair", "benefit", "Moins de mots. {fact}."],
    ["im-reason", "imperative", "benefit", "Choisissez {product:le} pour une raison : {fact}."],
  ],
  en: [
    ["np-fact", "noun-phrase", "benefit", "{product}, {fact}."],
    ["np-two", "noun-phrase", "proof", "{product}: {fact}, {fact2}."],
    ["np-list", "noun-phrase", "origin", "{fact}. {fact2}. {product}."],
    ["ws-name", "word-subline", "benefit", "*{word}.* {product}, {fact}."],
    ["ws-facts", "word-subline", "proof", "*{word}.* {fact}, {fact2}."],
    ["nl-name", "number-led", "proof", "{number}. {product}, {fact}."],
    ["nl-cod", "number-led", "value", "{number}, and you pay on delivery.{=cod}"],
    ["im-try", "imperative", "benefit", "Try {product}: {fact}."],
    ["im-order", "imperative", "value", "Order {product}, pay when it arrives.{=cod}"],
    ["np-place", "noun-phrase", "ritual", "{product}, {place}. {fact}."],
    ["cp-card", "contrast-pair", "value", "No card needed. You pay for {product} on delivery.{=cod}"],
    ["cp-plain", "contrast-pair", "proof", "{fact}. Nothing more."],
    ["np-rest", "noun-phrase", "proof", "{fact}, {fact2}. You see the rest when it arrives.{=cod}"],
    ["q-fact", "question", "benefit", "{fact}? That's {product}."],
    ["np-gift", "noun-phrase", "gift", "{product}, {fact}. A simple gift."],
    ["np-cod", "noun-phrase", "value", "{product}, {fact}. You pay on delivery.{=cod}"],
    ["im-start", "imperative", "ritual", "Start {place} with {product}. {fact}."],
    ["np-words", "noun-phrase", "proof", "{product} in two words: {fact}, {fact2}."],
    ["nl-two", "number-led", "proof", "{number}. {fact2}."],
    ["cp-promise", "contrast-pair", "proof", "Not a promise. {fact}, {fact2}."],
    ["cp-less", "contrast-pair", "benefit", "Less talk. {fact}."],
    ["im-reason", "imperative", "benefit", "Choose {product} for one reason: {fact}."],
  ],
  ar: [
    ["np-fact", "noun-phrase", "benefit", "{product}، {fact}."],
    ["np-two", "noun-phrase", "proof", "{product}: {fact}، {fact2}."],
    ["np-list", "noun-phrase", "origin", "{fact}. {fact2}. {product}."],
    ["ws-name", "word-subline", "benefit", "*{word}.* {product}، {fact}."],
    ["ws-facts", "word-subline", "proof", "*{word}.* {fact}، {fact2}."],
    ["nl-name", "number-led", "proof", "{number}. {product}، {fact}."],
    ["nl-cod", "number-led", "value", "{number}، والدفع عند الاستلام.{=cod}"],
    ["im-try", "imperative", "benefit", "جرّب {product}: {fact}."],
    ["im-order", "imperative", "value", "اطلب {product} وادفع عند الاستلام.{=cod}"],
    ["np-place", "noun-phrase", "ritual", "{product}، {place}. {fact}."],
    ["cp-card", "contrast-pair", "value", "بدون بطاقة بنكية. تدفع ثمن {product} عند الاستلام.{=cod}"],
    ["cp-plain", "contrast-pair", "proof", "{fact}. لا أكثر."],
    ["np-rest", "noun-phrase", "proof", "{fact}، {fact2}. والباقي تراه عند الاستلام.{=cod}"],
    ["q-fact", "question", "benefit", "{fact}؟ {product}."],
    ["np-gift", "noun-phrase", "gift", "{product}، {fact}. هدية بسيطة."],
    ["np-cod", "noun-phrase", "value", "{product}، {fact}. والدفع عند الاستلام.{=cod}"],
    ["im-start", "imperative", "ritual", "ابدأ يومك مع {product}. {fact}."],
    ["np-words", "noun-phrase", "proof", "{product} في كلمتين: {fact}، {fact2}."],
    ["nl-two", "number-led", "proof", "{number}. {fact2}."],
    ["cp-promise", "contrast-pair", "proof", "ليس وعدا. {fact}، {fact2}."],
    ["cp-less", "contrast-pair", "benefit", "كلام أقل. {fact}."],
    ["im-reason", "imperative", "benefit", "اختر {product} لسبب واحد: {fact}."],
    // Darija (G31 = light only)
    ["dj-cod", "noun-phrase", "value", "{product}، {fact}. وخلّص ملي توصلك.{=cod}", "darija"],
    ["dj-try", "imperative", "value", "جرّب {product}: {fact}، والخلاص ملي يوصلك.{=cod}", "darija"],
    ["dj-daily", "noun-phrase", "ritual", "{product} معاك كل صباح. {fact}.", "darija"],
  ],
};

const CORE_LEADS: Readonly<Record<TextLocale, readonly Row[]>> = {
  fr: [
    ["two-cod", "noun-phrase", "value", "{product} : {fact}, {fact2}. Vous payez à la réception.{=cod}"],
    ["facts-order", "noun-phrase", "proof", "{fact}. {fact2}. Commandez en quelques secondes, vous payez quand le colis arrive.{=cod}"],
    ["reason", "noun-phrase", "benefit", "On a choisi {product:le} pour une raison : {fact}. Et vous payez à la livraison.{=cod}"],
    ["door", "noun-phrase", "value", "{fact}, {fact2}. Livré chez vous, payé à la réception.{=cod}"],
    ["place", "noun-phrase", "ritual", "{product}, {place} : {fact}. Vous payez à la réception.{=cod}"],
    ["know", "noun-phrase", "proof", "Ce qu'il faut savoir sur {product:le} : {fact}, {fact2}."],
    ["number", "number-led", "proof", "{number}, {fact2}. Vous ne payez qu'à la réception.{=cod}"],
    ["simple", "noun-phrase", "value", "{product}. {fact}. Une commande simple, un paiement à la livraison.{=cod}"],
  ],
  en: [
    ["two-cod", "noun-phrase", "value", "{product}: {fact}, {fact2}. You pay on delivery.{=cod}"],
    ["facts-order", "noun-phrase", "proof", "{fact}. {fact2}. Order in a few seconds and pay when the parcel arrives.{=cod}"],
    ["reason", "noun-phrase", "benefit", "We chose {product} for one reason: {fact}. And you pay on delivery.{=cod}"],
    ["door", "noun-phrase", "value", "{fact}, {fact2}. Delivered to your door, paid on arrival.{=cod}"],
    ["place", "noun-phrase", "ritual", "{product} {place}: {fact}. You pay on delivery.{=cod}"],
    ["know", "noun-phrase", "proof", "What to know about {product}: {fact}, {fact2}."],
    ["number", "number-led", "proof", "{number}, {fact2}. You only pay on delivery.{=cod}"],
    ["simple", "noun-phrase", "value", "{product}. {fact}. A simple order, cash on delivery.{=cod}"],
  ],
  ar: [
    ["two-cod", "noun-phrase", "value", "{product}: {fact}، {fact2}. والدفع عند الاستلام.{=cod}"],
    ["facts-order", "noun-phrase", "proof", "{fact}. {fact2}. اطلب في ثوان وادفع عند وصول الطرد.{=cod}"],
    ["reason", "noun-phrase", "benefit", "اخترنا {product} لسبب واحد: {fact}. وتدفع عند الاستلام.{=cod}"],
    ["door", "noun-phrase", "value", "{fact}، {fact2}. يصلك إلى باب البيت وتدفع عند الاستلام.{=cod}"],
    ["place", "noun-phrase", "ritual", "{product} {place}: {fact}. والدفع عند الاستلام.{=cod}"],
    ["know", "noun-phrase", "proof", "ما تحتاج معرفته عن {product}: {fact}، {fact2}."],
    ["number", "number-led", "proof", "{number}، {fact2}. ولا تدفع إلا عند الاستلام.{=cod}"],
    ["simple", "noun-phrase", "value", "{product}. {fact}. طلب بسيط، والدفع عند الاستلام.{=cod}"],
    ["dj-door", "noun-phrase", "value", "{fact}، {fact2}. كيوصلك حتى لباب الدار وكتخلص ملي توصلك.{=cod}", "darija"],
  ],
};

/** The family templates: `{word}`, `{use}` and `{do}` read the family's vocabulary (FAMILY_VOCAB). */
const FAMILY_ROWS: Readonly<Record<TextLocale, { titles: readonly Row[]; leads: readonly Row[] }>> = {
  fr: {
    titles: [
      ["f-ws-use", "word-subline", "ritual", "*{word}.* {product}, {use}."],
      ["f-im-use", "imperative", "ritual", "{do} {product:le} {use}. {fact}."],
      ["f-np-use", "noun-phrase", "ritual", "{product} {use}, {fact}."],
    ],
    leads: [["f-use", "imperative", "ritual", "{do} {product:le} {use} : {fact}, {fact2}. Vous payez à la réception.{=cod}"]],
  },
  en: {
    titles: [
      ["f-ws-use", "word-subline", "ritual", "*{word}.* {product}, {use}."],
      ["f-im-use", "imperative", "ritual", "{do} {product} {use}. {fact}."],
      ["f-np-use", "noun-phrase", "ritual", "{product} {use}, {fact}."],
    ],
    leads: [["f-use", "imperative", "ritual", "{do} {product} {use}: {fact}, {fact2}. You pay on delivery.{=cod}"]],
  },
  ar: {
    titles: [
      ["f-ws-use", "word-subline", "ritual", "*{word}.* {product}، {use}."],
      ["f-im-use", "imperative", "ritual", "{do} {product} {use}. {fact}."],
      ["f-np-use", "noun-phrase", "ritual", "{product} {use}، {fact}."],
    ],
    leads: [["f-use", "imperative", "ritual", "{do} {product} {use}: {fact}، {fact2}. والدفع عند الاستلام.{=cod}"]],
  },
};

/** The section titles and leads shared by every family (DES-§9.12 the `common` set). */
const COMMON_ROWS: Readonly<Record<TextLocale, readonly [section: string, field: "title" | "lead", row: Row][]>> = {
  fr: [
    ["benefits", "title", ["b-remember", "noun-phrase", "benefit", "Ce qu'il faut retenir : {fact}."]],
    ["benefits", "title", ["b-detail", "noun-phrase", "proof", "En détail : {fact}, {fact2}."]],
    ["benefits", "title", ["b-why", "question", "benefit", "Pourquoi {product:le} ? {fact}."]],
    ["benefits", "title", ["b-word", "word-subline", "benefit", "*{word}*, et le reste en détail."]],
    ["benefits", "lead", ["b-lead", "noun-phrase", "proof", "{fact}, {fact2} : voici le détail."]],
    ["faq", "title", ["q-topics", "noun-phrase", "value", "Paiement, livraison, échange : vos questions.{=cod}"]],
    ["faq", "title", ["q-before", "noun-phrase", "value", "Avant de commander : vous payez à la réception.{=cod}"]],
    ["faq", "title", ["q-product", "noun-phrase", "proof", "Vos questions sur {product:le} et la livraison.{=cod}"]],
    ["offer", "title", ["o-pick", "imperative", "value", "Choisissez votre formule, payez à la réception.{=cod}"]],
    ["offer", "title", ["o-options", "noun-phrase", "value", "Vos options pour {product:le}, paiement à la livraison.{=cod}"]],
    ["offer", "title", ["o-one", "noun-phrase", "value", "Une formule, un paiement à la réception.{=cod}"]],
    ["offer", "lead", ["o-lead", "noun-phrase", "value", "Vous choisissez, vous payez à la réception. {fact}.{=cod}"]],
    ["guarantee", "title", ["g-only", "noun-phrase", "value", "Vous payez seulement à la réception.{=cod}"]],
    ["guarantee", "title", ["g-nothing", "contrast-pair", "value", "Rien à payer avant la livraison.{=cod}"]],
    ["guarantee", "title", ["g-wait", "noun-phrase", "value", "Le paiement attend le colis.{=cod}"]],
    ["cta", "title", ["c-name", "noun-phrase", "value", "{product}, {fact}. Paiement à la réception.{=cod}"]],
    ["cta", "title", ["c-order", "imperative", "value", "Commandez {product:le}, vous payez à la réception.{=cod}"]],
    ["cta", "title", ["c-left", "noun-phrase", "benefit", "{fact}. Il ne reste qu'à commander."]],
    ["cta", "lead", ["c-lead", "noun-phrase", "value", "{fact}. Livraison chez vous, paiement à la réception.{=cod}"]],
  ],
  en: [
    ["benefits", "title", ["b-remember", "noun-phrase", "benefit", "What to remember: {fact}."]],
    ["benefits", "title", ["b-detail", "noun-phrase", "proof", "In detail: {fact}, {fact2}."]],
    ["benefits", "title", ["b-why", "question", "benefit", "Why {product}? {fact}."]],
    ["benefits", "title", ["b-word", "word-subline", "benefit", "*{word}*, and the rest in detail."]],
    ["benefits", "lead", ["b-lead", "noun-phrase", "proof", "{fact}, {fact2}: here is the detail."]],
    ["faq", "title", ["q-topics", "noun-phrase", "value", "Payment, delivery, exchange: your questions.{=cod}"]],
    ["faq", "title", ["q-before", "noun-phrase", "value", "Before you order: you pay on delivery.{=cod}"]],
    ["faq", "title", ["q-product", "noun-phrase", "proof", "Your questions about {product} and delivery.{=cod}"]],
    ["offer", "title", ["o-pick", "imperative", "value", "Pick your option, pay on delivery.{=cod}"]],
    ["offer", "title", ["o-options", "noun-phrase", "value", "Your options for {product}, cash on delivery.{=cod}"]],
    ["offer", "title", ["o-one", "noun-phrase", "value", "One choice, paid on delivery.{=cod}"]],
    ["offer", "lead", ["o-lead", "noun-phrase", "value", "You choose, you pay on delivery. {fact}.{=cod}"]],
    ["guarantee", "title", ["g-only", "noun-phrase", "value", "You only pay on delivery.{=cod}"]],
    ["guarantee", "title", ["g-nothing", "contrast-pair", "value", "Nothing to pay before it arrives.{=cod}"]],
    ["guarantee", "title", ["g-wait", "noun-phrase", "value", "Payment waits for the parcel.{=cod}"]],
    ["cta", "title", ["c-name", "noun-phrase", "value", "{product}, {fact}. Pay on delivery.{=cod}"]],
    ["cta", "title", ["c-order", "imperative", "value", "Order {product}, pay when it arrives.{=cod}"]],
    ["cta", "title", ["c-left", "noun-phrase", "benefit", "{fact}. All that's left is to order."]],
    ["cta", "lead", ["c-lead", "noun-phrase", "value", "{fact}. Delivered to your door, paid on arrival.{=cod}"]],
  ],
  ar: [
    ["benefits", "title", ["b-remember", "noun-phrase", "benefit", "ما يجب تذكره: {fact}."]],
    ["benefits", "title", ["b-detail", "noun-phrase", "proof", "بالتفصيل: {fact}، {fact2}."]],
    ["benefits", "title", ["b-why", "question", "benefit", "لماذا {product}؟ {fact}."]],
    ["benefits", "title", ["b-word", "word-subline", "benefit", "*{word}*، والباقي بالتفصيل."]],
    ["benefits", "lead", ["b-lead", "noun-phrase", "proof", "{fact}، {fact2}: إليك التفاصيل."]],
    ["faq", "title", ["q-topics", "noun-phrase", "value", "الدفع، التوصيل، الاستبدال: أسئلتكم.{=cod}"]],
    ["faq", "title", ["q-before", "noun-phrase", "value", "قبل الطلب: الدفع عند الاستلام.{=cod}"]],
    ["faq", "title", ["q-product", "noun-phrase", "proof", "أسئلتكم عن {product} والتوصيل.{=cod}"]],
    ["offer", "title", ["o-pick", "imperative", "value", "اختر عرضك وادفع عند الاستلام.{=cod}"]],
    ["offer", "title", ["o-options", "noun-phrase", "value", "عروض {product}، والدفع عند الاستلام.{=cod}"]],
    ["offer", "title", ["o-one", "noun-phrase", "value", "عرض واحد، والدفع عند الاستلام.{=cod}"]],
    ["offer", "lead", ["o-lead", "noun-phrase", "value", "تختار وتدفع عند الاستلام. {fact}.{=cod}"]],
    ["guarantee", "title", ["g-only", "noun-phrase", "value", "لا تدفع إلا عند الاستلام.{=cod}"]],
    ["guarantee", "title", ["g-nothing", "contrast-pair", "value", "لا شيء تدفعه قبل التوصيل.{=cod}"]],
    ["guarantee", "title", ["g-wait", "noun-phrase", "value", "الدفع ينتظر وصول الطرد.{=cod}"]],
    ["cta", "title", ["c-name", "noun-phrase", "value", "{product}، {fact}. والدفع عند الاستلام.{=cod}"]],
    ["cta", "title", ["c-order", "imperative", "value", "اطلب {product} وادفع عند الاستلام.{=cod}"]],
    ["cta", "title", ["c-left", "noun-phrase", "benefit", "{fact}. لم يبق إلا الطلب."]],
    ["cta", "title", ["c-dj", "imperative", "value", "طلب {product} دابا، وخلّص ملي يوصلك.{=cod}", "darija"]],
    ["cta", "lead", ["c-lead", "noun-phrase", "value", "{fact}. يصلك إلى الباب وتدفع عند الاستلام.{=cod}"]],
  ],
};

interface Vocab {
  word: readonly string[];
  use: readonly string[];
  do: string;
}

/** One sensory noun, a usage moment and a verb per family × locale: never a claim, never a number. */
const FAMILY_VOCAB: Readonly<Record<TextLocale, Readonly<Record<CopyFamily, Vocab>>>> = {
  fr: {
    skincare: { word: ["Douceur", "Texture", "Toucher"], use: ["matin et soir", "après la douche"], do: "Appliquez" },
    haircare: { word: ["Douceur", "Souplesse", "Toucher"], use: ["après le lavage", "sur cheveux humides"], do: "Appliquez" },
    fragrance: { word: ["Parfum", "Odeur", "Sillage"], use: ["le jour comme le soir", "pour les grandes occasions"], do: "Portez" },
    jewelry: { word: ["Éclat", "Finition", "Détail"], use: ["tous les jours", "pour les grandes occasions"], do: "Portez" },
    fashion: { word: ["Tombé", "Tissu", "Coupe"], use: ["du matin au soir", "au quotidien"], do: "Portez" },
    wellness: { word: ["Douceur", "Calme", "Rituel"], use: ["chaque jour", "le soir"], do: "Gardez" },
    fitness: { word: ["Rythme", "Prise", "Geste"], use: ["à la maison", "entre deux séances"], do: "Emportez" },
    kitchen: { word: ["Goût", "Arôme", "Geste"], use: ["pour les repas du quotidien", "à chaque repas"], do: "Utilisez" },
    home: { word: ["Toucher", "Confort", "Détail"], use: ["au quotidien", "dans chaque pièce"], do: "Installez" },
    kids: { word: ["Jeu", "Couleurs", "Toucher"], use: ["à la maison", "après l'école"], do: "Offrez" },
    pets: { word: ["Douceur", "Confort", "Jeu"], use: ["à la maison", "au quotidien"], do: "Offrez" },
    tech: { word: ["Prise", "Format", "Geste"], use: ["partout avec vous", "au quotidien"], do: "Emportez" },
    auto: { word: ["Prise", "Précision", "Geste"], use: ["au garage", "sur la route"], do: "Gardez" },
    terroir: { word: ["Goût", "Arôme", "Saveur"], use: ["au petit-déjeuner", "à table"], do: "Servez" },
    general: { word: ["Détail", "Toucher", "Usage"], use: ["au quotidien", "à la maison"], do: "Gardez" },
    modest: { word: ["Tombé", "Douceur", "Tissu"], use: ["du matin au soir", "au quotidien"], do: "Portez" },
  },
  en: {
    skincare: { word: ["Softness", "Texture", "Touch"], use: ["morning and night", "after the shower"], do: "Apply" },
    haircare: { word: ["Softness", "Shine", "Touch"], use: ["after washing", "on damp hair"], do: "Apply" },
    fragrance: { word: ["Scent", "Trail", "Notes"], use: ["day or night", "for the big days"], do: "Wear" },
    jewelry: { word: ["Shine", "Finish", "Detail"], use: ["every day", "for the big days"], do: "Wear" },
    fashion: { word: ["Drape", "Fabric", "Cut"], use: ["from morning to night", "every day"], do: "Wear" },
    wellness: { word: ["Calm", "Softness", "Ritual"], use: ["every day", "in the evening"], do: "Keep" },
    fitness: { word: ["Grip", "Rhythm", "Weight"], use: ["at home", "between sessions"], do: "Take" },
    kitchen: { word: ["Taste", "Aroma", "Texture"], use: ["for everyday meals", "at every meal"], do: "Use" },
    home: { word: ["Comfort", "Texture", "Detail"], use: ["every day", "in every room"], do: "Set up" },
    kids: { word: ["Play", "Colour", "Texture"], use: ["at home", "after school"], do: "Give" },
    pets: { word: ["Comfort", "Play", "Softness"], use: ["at home", "every day"], do: "Give" },
    tech: { word: ["Grip", "Size", "Click"], use: ["wherever you go", "every day"], do: "Take" },
    auto: { word: ["Grip", "Precision", "Weight"], use: ["in the garage", "on the road"], do: "Keep" },
    terroir: { word: ["Taste", "Aroma", "Flavour"], use: ["at breakfast", "at the table"], do: "Serve" },
    general: { word: ["Detail", "Feel", "Use"], use: ["every day", "at home"], do: "Keep" },
    modest: { word: ["Drape", "Softness", "Fabric"], use: ["from morning to night", "every day"], do: "Wear" },
  },
  ar: {
    skincare: { word: ["نعومة", "ملمس", "قوام"], use: ["صباحا ومساء", "بعد الاستحمام"], do: "ضع" },
    haircare: { word: ["نعومة", "لمعان", "ملمس"], use: ["بعد الغسل", "على الشعر المبلل"], do: "ضع" },
    fragrance: { word: ["عطر", "رائحة", "أثر"], use: ["في النهار كما في المساء", "في المناسبات"], do: "استعمل" },
    jewelry: { word: ["لمعة", "تشطيب", "تفاصيل"], use: ["كل يوم", "في المناسبات"], do: "ارتد" },
    fashion: { word: ["قماش", "قصة", "انسدال"], use: ["من الصباح إلى المساء", "كل يوم"], do: "ارتد" },
    wellness: { word: ["هدوء", "نعومة", "راحة"], use: ["كل يوم", "في المساء"], do: "استعمل" },
    fitness: { word: ["قبضة", "إيقاع", "حركة"], use: ["في البيت", "بين الحصص"], do: "خذ" },
    kitchen: { word: ["مذاق", "رائحة", "طعم"], use: ["لوجبات كل يوم", "مع كل وجبة"], do: "استعمل" },
    home: { word: ["راحة", "ملمس", "تفاصيل"], use: ["كل يوم", "في كل غرفة"], do: "ضع" },
    kids: { word: ["لعب", "ألوان", "ملمس"], use: ["في البيت", "بعد المدرسة"], do: "قدّم" },
    pets: { word: ["راحة", "لعب", "نعومة"], use: ["في البيت", "كل يوم"], do: "قدّم" },
    tech: { word: ["قبضة", "حجم", "استعمال"], use: ["أينما ذهبت", "كل يوم"], do: "خذ" },
    auto: { word: ["قبضة", "دقة", "وزن"], use: ["في المرآب", "على الطريق"], do: "استعمل" },
    terroir: { word: ["مذاق", "رائحة", "نكهة"], use: ["في الفطور", "على المائدة"], do: "قدّم" },
    general: { word: ["تفاصيل", "ملمس", "استعمال"], use: ["كل يوم", "في البيت"], do: "استعمل" },
    modest: { word: ["انسدال", "نعومة", "قماش"], use: ["من الصباح إلى المساء", "كل يوم"], do: "ارتدي" },
  },
};

const FAMILY_LIST: readonly CopyFamily[] = Object.keys(FAMILY_VOCAB.en) as CopyFamily[];
const TEXT_LOCALES: readonly TextLocale[] = ["ar", "fr", "en"];

/** The skeletons per locale × family (the core set and the family templates) plus the `common` section set. */
export const SKELETONS: Readonly<Record<TextLocale, Readonly<Record<CopyFamily | "common", readonly Skeleton[]>>>> = Object.fromEntries(
  TEXT_LOCALES.map((l) => {
    const core = [...rows(l, "title", CORE_TITLES[l]), ...rows(l, "lead", CORE_LEADS[l])];
    const fam = Object.fromEntries(
      FAMILY_LIST.map((f) => [
        f,
        [...core, ...rows(l, "title", FAMILY_ROWS[l].titles).map((s) => ({ ...s, id: `${s.id}.${f}` })), ...rows(l, "lead", FAMILY_ROWS[l].leads).map((s) => ({ ...s, id: `${s.id}.${f}` }))],
      ]),
    );
    const common = COMMON_ROWS[l].map(([section, field, row]) => ({ ...rows(l, field, [row], [section])[0]! }));
    return [l, { ...fam, common }];
  }),
) as Record<TextLocale, Record<CopyFamily | "common", Skeleton[]>>;

/** The name-led neutral skeleton (DES-§9.8): product-specific by construction, the last resort. */
const NEUTRAL: Readonly<Record<TextLocale, Skeleton>> = {
  fr: { id: "fr.t.neutral", s: "noun-phrase", angle: "benefit", t: "{product}, {fact}.", r: "none", field: "title" },
  en: { id: "en.t.neutral", s: "noun-phrase", angle: "benefit", t: "{product}, {fact}.", r: "none", field: "title" },
  ar: { id: "ar.t.neutral", s: "noun-phrase", angle: "benefit", t: "{product}، {fact}.", r: "msa", field: "title" },
};

/** The section titles the common set writes; the hero is the family's. */
export const COMPOSED_SECTIONS: ReadonlySet<string> = new Set(["hero", "benefits", "faq", "offer", "guarantee", "cta"]);

/* ------------------------------------------------------------------ */
/* filling                                                             */
/* ------------------------------------------------------------------ */

const PLACE_REGISTERS = new Set(["warm", "poetic-restrained"]);
const SLOT = /\{(=cod|product(?::(le|ce|de|un|a))?|fact2?|number|word|use|do|place)\}/g;
const MAX = { title: 110, lead: 220 } as const;

/** A merchant fact usable inside a generated line: one clause, no markup the line rules refuse (never rewritten). */
function usableFact(f: string, l: TextLocale): string | null {
  const s = f.replace(/\s+/g, " ").trim().replace(/[.;:,!]+$/u, "");
  if (s.length < 2 || s.length > 48) return null;
  if (/[—–·!?؟*{}<>|\n]|[\p{Extended_Pictographic}]/u.test(s)) return null;
  if (/[.;]/.test(s.replace(/\d[.,]\d/g, ""))) return null;
  if (clicheHits(s, l).length) return null;
  return s;
}

/** Lower-case the first letter of a fact set inside a sentence ("Pressée à froid" → "pressée à froid"; "UV400" stays). */
function inner(fact: string, l: TextLocale): string {
  if (l === "ar") return fact;
  const w = fact.split(/\s/)[0] ?? "";
  if (/\d/.test(w) || /^\p{Lu}{2,}/u.test(w) || /\p{Ll}\p{Lu}/u.test(w)) return fact;
  return fact.charAt(0).toLowerCase() + fact.slice(1);
}

/** Sentence starts take a capital (fr / en): the line start and after `. ` / `? ` (emphasis markers skipped). */
function sentenceCase(s: string, l: TextLocale): string {
  if (l === "ar") return s;
  return s.replace(/(^|[.?!]\*?\s+)(\*?)(\p{Ll})/gu, (_m, pre: string, star: string, c: string) => pre + star + c.toUpperCase());
}

interface FillCtx {
  l: TextLocale;
  input: ComposeInput;
  facts: string[];
  numbered: string[];
  vocab: Vocab;
  rng: () => number;
  spec: ReturnType<typeof specificityCache>;
}

const pick = <T,>(rng: () => number, list: readonly T[]): T | undefined => (list.length ? list[Math.floor(rng() * list.length) % list.length] : undefined);

/** Fill one skeleton, or null when a slot cannot be filled from the store's own material. */
function fill(sk: Skeleton, c: FillCtx): { t: string; slots: string[] } | null {
  const { l, input } = c;
  if (sk.t.includes("{place}") && !PLACE_REGISTERS.has(input.directives.register)) return null;
  const slots = new Set<string>();
  const usedFacts: string[] = [];
  const takeFact = (): string | null => {
    const left = c.facts.filter((f) => !usedFacts.includes(f));
    const f = pick(c.rng, left);
    if (!f) return null;
    usedFacts.push(f);
    return f;
  };
  let failed = false;
  // the number slot first: its fact is then not reused by {fact}
  let number: string | null = null;
  if (sk.t.includes("{number}")) {
    number = pick(c.rng, c.numbered) ?? null;
    if (!number) return null;
    usedFacts.push(number);
  }
  const template = typeset(input.locale, sk.t);
  const out = template.replace(SLOT, (_m, key: string, art: string | undefined) => {
    if (failed) return "";
    if (key === "=cod") {
      slots.add("cod");
      return "";
    }
    if (key.startsWith("product")) {
      const v = l === "fr" ? articleFor(input.ref, (art as ArticleSlot | undefined) ?? "bare") : input.ref.text;
      if (v === null || !v) failed = true;
      // the article is the generator's text: its apostrophe is typographic (the name keeps the merchant's)
      return (v ?? "").replace(/^(l|à l|de l)'/i, "$1’");
    }
    if (key === "fact" || key === "fact2") {
      const f = takeFact();
      if (!f) failed = true;
      else slots.add("fact");
      return f ? inner(f, l) : "";
    }
    if (key === "number") {
      slots.add("number");
      return number!;
    }
    if (key === "word") {
      const w = pick(c.rng, c.vocab.word)!;
      if (isSenseWord(w, l)) slots.add("sense");
      return w;
    }
    if (key === "use") return pick(c.rng, c.vocab.use)!;
    if (key === "do") return c.vocab.do;
    if (key === "place") {
      slots.add("place");
      return pick(c.rng, LEXICONS[l].places)!;
    }
    return "";
  });
  if (failed) return null;
  const t = sentenceCase(out.replace(/\s+([.,،:])/g, (m, p: string) => (l === "fr" && p === ":" ? m : p)).replace(/\s{2,}/g, " ").trim(), l);
  if (!["fact", "number", "sense", "cod"].some((k) => slots.has(k))) return null;
  return { t, slots: [...slots] };
}

/** The surface a field writes on (the register rule of DES-§9.4). */
const surfaceOf = (field: ComposeInput["field"]): Surface => (field === "title" ? "title" : field === "lead" ? "lead" : field === "cta" ? "cta" : "kicker");

/** Whether a filled line passes every rule of DES-§9.12. */
function passes(line: string, sk: Skeleton, c: FillCtx): boolean {
  const { l, input } = c;
  const plain = line.replace(/\*+/g, "");
  if (plain.length > MAX[sk.field]) return false;
  if (/[—–·!]/.test(line)) return false;
  if (input.maxLines && plain.length > input.maxLines * (input.lineChars ?? (l === "ar" ? 15 : 17))) return false;
  if (input.maxWordChars && Math.max(...plain.split(/[\s,.:;،؟?]+/).map((w) => w.length)) > input.maxWordChars) return false;
  if (clicheHits(line, l).length) return false;
  if (l === "fr" && articleFaults(line).length) return false;
  if (l === "ar") {
    const got = registerOf(line);
    if (got === "mixed" || (got !== "none" && got !== sk.r)) return false;
    if (!registerAllowed(sk.r, surfaceOf(input.field), input.directives.darija, input.locale)) return false;
  }
  // rhythm (G30): a sentence never runs past the register's band by more than its slack
  const [, hi] = VOICE[input.directives.register].words;
  const ss = sentences(plain);
  if (ss.some((s) => wordCount(s) > hi + (sk.field === "lead" ? 8 : 4))) return false;
  const specific = ss.filter((s) => sentenceSpecific(s, input.facts, l, c.spec)).length;
  return specific * 2 >= ss.length;
}

/** The weight of a skeleton under the directives: a title's G29 structure weight (leads: even), the angle doubled. */
function weightOf(sk: Skeleton, d: ComposeInput["directives"]): number {
  if (sk.field === "lead") return sk.angle === d.angle ? 2 : 1;
  const total = Object.values(d.structures).reduce((s: number, v) => s + (v ?? 0), 0);
  const w = total > 0 ? (d.structures[sk.s] ?? 0) / total : 1 / 7;
  // a structure the register does not weigh stays drawable for the section titles (the common set is small)
  const base = w > 0 ? w : sk.sections ? 0.05 : 0;
  return base * (sk.angle === d.angle ? 2 : 1);
}

/** The pool of a request: the family's skeletons for the hero, the common set for the other sections. */
function poolOf(input: ComposeInput, l: TextLocale): readonly Skeleton[] {
  const field = input.field === "title" || input.field === "lead" ? input.field : null;
  if (!field) return [];
  if (input.section === "hero") return (SKELETONS[l][input.family] ?? SKELETONS[l].general).filter((s) => s.field === field);
  return SKELETONS[l].common.filter((s) => s.field === field && s.sections?.includes(input.section));
}

/**
 * n candidates with distinct skeletons, the best-weighted first (a seeded weighted draw without replacement). Empty
 * when nothing is fillable: the caller keeps the library line (DES-§9.12 "the library stays").
 */
export function composeLines(input: ComposeInput, rng: () => number, n: number): ComposedLine[] {
  const l = textLocale(input.locale);
  const facts = input.facts.facts.map((f) => usableFact(f, l)).filter((f): f is string => !!f);
  const allowed = merchantNumbers(input.facts);
  const numbered = facts.filter((f) => /^\d/.test(asciiDigits(f)) && (asciiDigits(f).match(/\d+(?:[.,]\d+)?/g) ?? []).every((x) => allowed.has(x.replace(",", "."))));
  const c: FillCtx = { l, input, facts, numbered, vocab: FAMILY_VOCAB[l][input.family] ?? FAMILY_VOCAB[l].general, rng, spec: specificityCache(input.facts, l) };
  const pool = poolOf(input, l).filter((s) => !input.avoid?.has(s.id));
  const weighted = pool.map((sk) => ({ sk, w: weightOf(sk, input.directives) })).filter((x) => x.w > 0);
  const out: ComposedLine[] = [];
  const seen = new Set<string>();
  while (out.length < n && weighted.length) {
    const total = weighted.reduce((s, x) => s + x.w, 0);
    let r = rng() * total;
    let at = 0;
    for (; at < weighted.length - 1; at++) {
      r -= weighted[at]!.w;
      if (r <= 0) break;
    }
    const { sk } = weighted.splice(at, 1)[0]!;
    // two fills per skeleton: another fact draw may pass where the first did not
    for (let attempt = 0; attempt < 2; attempt++) {
      const got = fill(sk, c);
      if (!got || seen.has(got.t) || !passes(got.t, sk, c)) continue;
      seen.add(got.t);
      out.push({ t: got.t, s: sk.s, angle: sk.angle, slots: got.slots, r: sk.r, skeleton: sk.id });
      break;
    }
  }
  if (!out.length && input.section === "hero" && input.field === "title" && !input.avoid?.has(NEUTRAL[l].id)) {
    const got = fill(NEUTRAL[l], c);
    if (got && passes(got.t, NEUTRAL[l], c)) out.push({ t: got.t, s: "noun-phrase", angle: "benefit", slots: got.slots, r: NEUTRAL[l].r, skeleton: NEUTRAL[l].id });
  }
  return out;
}

/** The skeleton count per locale × family (the DG-07 acceptance reads it). */
export function skeletonCount(locale: TextLocale, family: CopyFamily): number {
  return SKELETONS[locale][family].length;
}
