/**
 * Copy of the order form (ar · fr · en): default heading copy (product-aware, 2–3 alternatives) and
 * the few labels the kit's i18n does not carry (wallet-pass fields, the order line). Short,
 * concrete, COD-first; Arabic is clear MSA with light Moroccan touches.
 */
import type { Locale } from "@/lib/page/schema";
import { inLocale } from "../whatsappFloat/wa";

type L = { ar: string; fr: string; en: string };

const pick = <T,>(rng: () => number, list: readonly T[]): T => list[Math.min(list.length - 1, Math.floor(rng() * list.length))]!;

const NBSP = String.fromCharCode(0xa0);

/**
 * A product name short enough to sit inside a headline, else null. Typeset for line breaks: a
 * figure keeps its unit ("50 ml", "50 مل" never split across two lines) and a dash stays at the end
 * of its line instead of opening the next one.
 */
export function headlineName(name: string): string | null {
  const n = name.replace(/\s+/g, " ").trim();
  if (!(n.length > 0 && n.length <= 26 && !/[*\\]/.test(n))) return null;
  return n.replace(/ (?=[–—])/g, NBSP).replace(/(\d) (?=\S)/g, `$1${NBSP}`);
}

export interface FormCopy {
  kicker: string;
  title: string;
  lead: string;
  packsLabel: string;
  optionsLabel: string;
  detailsLabel: string;
}

export function formCopy(locale: Locale, productName: string, rng: () => number): FormCopy {
  const short = headlineName(productName);
  const titles: L[] = [
    { ar: "اطلب دابا، و*خلّص فالباب*", fr: "Commandez, *payez à la livraison*", en: "Order now, *pay at the door*" },
    { ar: "عمّر المعلومات، *والباقي علينا*", fr: "Trente secondes, *on\u00a0s'occupe du reste*", en: "Thirty seconds, *we\u00a0handle the rest*" },
  ];
  if (short)
    titles.push({
      ar: `${short}، *حتى لباب الدار*`,
      fr: `Votre ${short}, *livré chez vous*`,
      en: `Your ${short}, *delivered home*`,
    });
  const kickers: L[] = [
    { ar: "الطلب فـ 30 ثانية", fr: "Commande en 30 secondes", en: "Order in 30 seconds" },
    { ar: "بلا بطاقة، بلا حساب", fr: "Sans carte, sans compte", en: "No card, no account" },
  ];
  const leads: L[] = [
    {
      ar: "عمّر الخانات، ونعيطو ليك نأكدو الطلب. ما كتخلص حتى توصلك السلعة وتشوفها.",
      fr: "Remplissez le formulaire, un conseiller vous appelle pour confirmer. Vous ne payez qu'en recevant le colis.",
      en: "Fill in the form and we call you to confirm. You only pay once the parcel is in your hands.",
    },
    {
      ar: "غير اللي خاص. مكالمة وحدة باش نأكدو، والخلاص عند الاستلام.",
      fr: "Juste l'essentiel. Un appel pour confirmer, le paiement à la livraison.",
      en: "Just the essentials. One call to confirm, and you pay on delivery.",
    },
  ];
  return {
    kicker: inLocale(locale, pick(rng, kickers)),
    title: inLocale(locale, pick(rng, titles)),
    lead: inLocale(locale, pick(rng, leads)),
    packsLabel: "",
    optionsLabel: inLocale(locale, { ar: "اختار اللي بغيتي", fr: "Vos préférences", en: "Your choices" }),
    detailsLabel: inLocale(locale, { ar: "فين نوصلو ليك؟", fr: "Où vous livrer ?", en: "Where do we deliver?" }),
  };
}

/** A group name inside a sentence: "Couleur" → "couleur" (acronyms such as "EU" or "XL" are kept). */
function inSentence(locale: Locale, name: string): string {
  const n = name.trim();
  if (locale === "ar" || locale === "de") return n;
  return /^\p{Lu}\p{Ll}/u.test(n) ? n.charAt(0).toLocaleLowerCase(locale) + n.slice(1) : n;
}

/**
 * Microcopy of the product option pickers (variants.tsx). Messages are written into the markup
 * (data-msg on each group), so the runtime shows them without any i18n of its own.
 */
export function optionLabels(locale: Locale) {
  return {
    /** unit row of a multi-unit pack: "Pièce 2" ({n} is filled by the runtime in its template row) */
    unit: (n: number | string) =>
      inLocale(locale, { ar: `القطعة ${n}`, fr: `Pièce ${n}`, en: `Item ${n}`, es: `Unidad ${n}`, de: `Stück ${n}`, it: `Pezzo ${n}`, nl: `Stuk ${n}`, pt: `Unidade ${n}` }),
    sameForAll: inLocale(locale, {
      ar: "نفس الاختيار للكل",
      fr: "Même choix pour toutes",
      en: "Same for all",
      es: "Igual para todas",
      de: "Für alle gleich",
      it: "Uguale per tutti",
      nl: "Hetzelfde voor alle",
      pt: "Igual para todas",
    }),
    soldOut: inLocale(locale, { ar: "نفذ", fr: "épuisé", en: "sold out", es: "agotado", de: "ausverkauft", it: "esaurito", nl: "uitverkocht", pt: "esgotado" }),
    /** inline error of a group left empty: "Choisissez votre taille" */
    choose: (group: string) => {
      const g = inSentence(locale, group);
      return inLocale(locale, {
        ar: `اختار ${g}`,
        fr: `Choisissez votre ${g}`,
        en: `Choose your ${g}`,
        es: `Elige tu ${g}`,
        de: `Bitte ${g} wählen`,
        it: `Scegli: ${g}`,
        nl: `Kies je ${g}`,
        pt: `Escolha: ${g}`,
      });
    },
    /** the chosen option was sold out after the page was opened */
    gone: inLocale(locale, {
      ar: "هاد الاختيار ما بقاش متوفر، اختار واحد آخر",
      fr: "Cette option n'est plus disponible, choisissez-en une autre",
      en: "This option is no longer available, please choose another",
      es: "Esta opción ya no está disponible, elige otra",
      de: "Diese Option ist nicht mehr verfügbar, bitte wähle eine andere",
      it: "Questa opzione non è più disponibile, scegline un'altra",
      nl: "Deze optie is niet meer beschikbaar, kies een andere",
      pt: "Esta opção já não está disponível, escolha outra",
    }),
  };
}

/** "(optional)" suffix for fields that may stay empty. */
export const optionalLabel = (locale: Locale) => inLocale(locale, { ar: "اختياري", fr: "facultatif", en: "optional" });

/** Labels of the order form's own UI (wallet-pass fields, order line, fallbacks of empty data). */
export function uiLabels(locale: Locale) {
  return {
    total: inLocale(locale, { ar: "المجموع", fr: "Total", en: "Total" }),
    perUnit: inLocale(locale, { ar: "ثمن القطعة", fr: "Par pièce", en: "Per item" }),
    youSave: inLocale(locale, { ar: "كتربح", fr: "Économie", en: "You save" }),
    yourOrder: inLocale(locale, { ar: "طلبك", fr: "Votre commande", en: "Your order" }),
    options: inLocale(locale, { ar: "اختياراتك", fr: "Vos préférences", en: "Your choices" }),
    details: inLocale(locale, { ar: "فين نوصلو ليك؟", fr: "Où vous livrer ?", en: "Where do we deliver?" }),
    email: inLocale(locale, { ar: "name@example.com", fr: "nom@exemple.com", en: "name@example.com" }),
    /** the disclosure of an optional address (LAN-§3.5 OF2), the email and the note inside it */
    addAddress: inLocale(locale, { ar: "زيد العنوان", fr: "Ajouter une adresse", en: "Add an address" }),
    /** the same disclosure when it holds only the note or an optional email */
    addNote: inLocale(locale, { ar: "زيد شي ملاحظة", fr: "Ajouter une précision", en: "Add a note" }),
    /** the urgency chip with the owner's end date only ({date} in the page language) */
    endsOn: inLocale(locale, { ar: "العرض صالح حتى {date}", fr: "Offre valable jusqu'au {date}", en: "Offer ends {date}" }),
  };
}

/* ------------------------------------------------------------------ */
/* Offers v2 microcopy (docs/OFFERS.md §J.3) — all 8 locales           */
/* ------------------------------------------------------------------ */

type P8 = { ar: string; fr: string; en: string; es: string; de: string; it: string; nl: string; pt: string };

const fillTokens = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));

/** The phrase in the page locale, with {tokens} filled (unknown tokens are kept for the runtime). */
const say = (locale: Locale, p: P8, vars: Record<string, string | number> = {}) => fillTokens(p[locale] ?? p.en, vars);

const OFFER_WORDS = {
  choice: { ar: "على اختيارك", fr: "Au choix", en: "Your choice", es: "A elegir", de: "Nach Wahl", it: "A scelta", nl: "Naar keuze", pt: "À escolha" },
  anyN: { ar: "{n} على اختيارك", fr: "{n} au choix", en: "Any {n}", es: "{n} a elegir", de: "{n} nach Wahl", it: "{n} a scelta", nl: "{n} naar keuze", pt: "{n} à escolha" },
  duo: { ar: "الثنائي", fr: "Duo", en: "Duo", es: "Dúo", de: "Duo", it: "Duo", nl: "Duo", pt: "Duo" },
  trio: { ar: "الثلاثي", fr: "Trio", en: "Trio", es: "Trío", de: "Trio", it: "Trio", nl: "Trio", pt: "Trio" },
  or: { ar: "أو", fr: "ou", en: "or", es: "o", de: "oder", it: "o", nl: "of", pt: "ou" },
  free: { ar: "هدية", fr: "Offert", en: "Free", es: "Gratis", de: "Gratis", it: "In omaggio", nl: "Gratis", pt: "Grátis" },
  from: { ar: "من {price}", fr: "Dès {price}", en: "From {price}", es: "Desde {price}", de: "Ab {price}", it: "Da {price}", nl: "Vanaf {price}", pt: "Desde {price}" },
  fromWord: { ar: "من", fr: "Dès", en: "From", es: "Desde", de: "Ab", it: "Da", nl: "Vanaf", pt: "Desde" },
  soldOut: { ar: "نفذ", fr: "Épuisé", en: "Sold out", es: "Agotado", de: "Ausverkauft", it: "Esaurito", nl: "Uitverkocht", pt: "Esgotado" },
  contents: { ar: "شنو كاين فالباك", fr: "Contenu du pack", en: "What's in the pack", es: "Contenido del pack", de: "Im Paket", it: "Contenuto del pack", nl: "In het pakket", pt: "Conteúdo do pack" },
  allFree: { ar: "التوصيل فابور", fr: "Livraison gratuite", en: "Free delivery", es: "Envío gratis", de: "Kostenloser Versand", it: "Spedizione gratuita", nl: "Gratis verzending", pt: "Entrega grátis" },
  gift: { ar: "هدية: {label}", fr: "Cadeau : {label}", en: "Gift: {label}", es: "Regalo: {label}", de: "Geschenk: {label}", it: "Omaggio: {label}", nl: "Cadeau: {label}", pt: "Oferta: {label}" },
} satisfies Record<string, P8>;

const UNIT_WORDS = {
  head: { ar: "القطعة {n}", fr: "Pièce {n}", en: "Item {n}", es: "Unidad {n}", de: "Stück {n}", it: "Pezzo {n}", nl: "Stuk {n}", pt: "Unidade {n}" },
  /** ", pièce 2 sur 3" after the visible head (aria-label) */
  of: { ar: "، القطعة {n} من {u}", fr: ", pièce {n} sur {u}", en: ", item {n} of {u}", es: ", unidad {n} de {u}", de: ", Stück {n} von {u}", it: ", pezzo {n} di {u}", nl: ", stuk {n} van {u}", pt: ", unidade {n} de {u}" },
  chooseItem: { ar: "اختار المنتج", fr: "Choisissez l'article", en: "Choose the item", es: "Elige el artículo", de: "Artikel wählen", it: "Scegli l'articolo", nl: "Kies het artikel", pt: "Escolha o artigo" },
  forAll: { ar: "لـ{n} ديال {item}", fr: "Pour vos {n} {item}", en: "For your {n} {item}", es: "Para tus {n} {item}", de: "Für deine {n} {item}", it: "Per i tuoi {n} {item}", nl: "Voor je {n} {item}", pt: "Para os seus {n} {item}" },
  prefilled: { ar: "= القطعة 1", fr: "= pièce 1", en: "= item 1", es: "= unidad 1", de: "= Stück 1", it: "= pezzo 1", nl: "= stuk 1", pt: "= unidade 1" },
  edit: { ar: "بدّل", fr: "Modifier", en: "Edit", es: "Cambiar", de: "Ändern", it: "Modifica", nl: "Wijzig", pt: "Alterar" },
  next: { ar: "التالي", fr: "Suivant", en: "Next", es: "Siguiente", de: "Weiter", it: "Avanti", nl: "Volgende", pt: "Seguinte" },
  prev: { ar: "السابق", fr: "Précédent", en: "Back", es: "Anterior", de: "Zurück", it: "Indietro", nl: "Vorige", pt: "Anterior" },
  optionalPrice: { ar: "(اختياري · +{price})", fr: "(optionnel · +{price})", en: "(optional · +{price})", es: "(opcional · +{price})", de: "(optional · +{price})", it: "(facoltativo · +{price})", nl: "(optioneel · +{price})", pt: "(opcional · +{price})" },
  optional: { ar: "(اختياري)", fr: "(optionnel)", en: "(optional)", es: "(opcional)", de: "(optional)", it: "(facoltativo)", nl: "(optioneel)", pt: "(opcional)" },
  tooLong: { ar: "{max} حروف على الأكثر", fr: "{max} caractères maximum", en: "{max} characters max", es: "Máximo {max} caracteres", de: "Höchstens {max} Zeichen", it: "Massimo {max} caratteri", nl: "Maximaal {max} tekens", pt: "Máximo de {max} caracteres" },
  duplicate: { ar: "اختار منتج مختلف", fr: "Choisissez un article différent", en: "Choose a different item", es: "Elige un artículo distinto", de: "Wähle einen anderen Artikel", it: "Scegli un articolo diverso", nl: "Kies een ander artikel", pt: "Escolha um artigo diferente" },
  letters: { ar: "حروف فقط", fr: "Lettres uniquement", en: "Letters only", es: "Solo letras", de: "Nur Buchstaben", it: "Solo lettere", nl: "Alleen letters", pt: "Apenas letras" },
  latin: { ar: "حروف لاتينية فقط", fr: "Lettres latines uniquement", en: "Latin letters only", es: "Solo letras latinas", de: "Nur lateinische Buchstaben", it: "Solo lettere latine", nl: "Alleen Latijnse letters", pt: "Apenas letras latinas" },
  digits: { ar: "أرقام فقط", fr: "Chiffres uniquement", en: "Digits only", es: "Solo cifras", de: "Nur Ziffern", it: "Solo cifre", nl: "Alleen cijfers", pt: "Apenas algarismos" },
  range: { ar: "بين {min} و {max}", fr: "Entre {min} et {max}", en: "Between {min} and {max}", es: "Entre {min} y {max}", de: "Zwischen {min} und {max}", it: "Tra {min} e {max}", nl: "Tussen {min} en {max}", pt: "Entre {min} e {max}" },
  write: { ar: "كتب {name}", fr: "Indiquez {name}", en: "Enter {name}", es: "Indica {name}", de: "Bitte {name} angeben", it: "Indica {name}", nl: "Vul {name} in", pt: "Indique {name}" },
  unavailable: { ar: "نفذ من بعد ما حليتي الصفحة", fr: "Épuisé depuis l'ouverture de la page", en: "Sold out since you opened the page", es: "Agotado desde que abriste la página", de: "Ausverkauft, seit du die Seite geöffnet hast", it: "Esaurito da quando hai aperto la pagina", nl: "Uitverkocht sinds je de pagina opende", pt: "Esgotado desde que abriu a página" },
  offerGone: { ar: "هاد العرض ما بقاش متوفر", fr: "Cette offre n'est plus disponible", en: "This offer is no longer available", es: "Esta oferta ya no está disponible", de: "Dieses Angebot ist nicht mehr verfügbar", it: "Questa offerta non è più disponibile", nl: "Deze aanbieding is niet meer beschikbaar", pt: "Esta oferta já não está disponível" },
  otherOptions: { ar: "اختيارات أخرى", fr: "Autres options", en: "Other options", es: "Otras opciones", de: "Weitere Optionen", it: "Altre opzioni", nl: "Andere opties", pt: "Outras opções" },
  matrixNone: { ar: "ما كايناش", fr: "indisponible", en: "unavailable", es: "no disponible", de: "nicht verfügbar", it: "non disponibile", nl: "niet beschikbaar", pt: "indisponível" },
  switched: { ar: "تبدّل {dim}: {value}", fr: "{dim} changée : {value}", en: "{dim} changed: {value}", es: "{dim} cambiado: {value}", de: "{dim} geändert: {value}", it: "{dim} cambiato: {value}", nl: "{dim} gewijzigd: {value}", pt: "{dim} alterado: {value}" },
  conflict: {
    ar: "{value} ما كايناش ف {other}، اختار {dim}",
    fr: "{value} n'existe pas en {other}, choisissez {dim}",
    en: "{value} doesn't come in {other}, choose {dim}",
    es: "{value} no existe en {other}, elige {dim}",
    de: "{value} gibt es nicht in {other}, bitte {dim} wählen",
    it: "{value} non esiste in {other}, scegli {dim}",
    nl: "{value} bestaat niet in {other}, kies {dim}",
    pt: "{value} não existe em {other}, escolha {dim}",
  },
  stale: {
    ar: "تبدّل العرض، تأكد من الاختيار ديالك",
    fr: "L'offre a été mise à jour, vérifiez votre choix",
    en: "The offer was updated, please check your choice",
    es: "La oferta se ha actualizado, revisa tu elección",
    de: "Das Angebot wurde aktualisiert, bitte prüfe deine Auswahl",
    it: "L'offerta è stata aggiornata, controlla la tua scelta",
    nl: "De aanbieding is bijgewerkt, controleer je keuze",
    pt: "A oferta foi atualizada, verifique a sua escolha",
  },
  steps: { ar: "القطع", fr: "Vos pièces", en: "Your items", es: "Tus unidades", de: "Deine Stücke", it: "I tuoi pezzi", nl: "Je stuks", pt: "As suas unidades" },
  box: { ar: "عمّر الباك ديالك", fr: "Composez votre pack", en: "Build your pack", es: "Arma tu pack", de: "Stelle dein Paket zusammen", it: "Componi il tuo pack", nl: "Stel je pakket samen", pt: "Monte o seu pack" },
} satisfies Record<string, P8>;

export type OfferWord = keyof typeof OFFER_WORDS;
export type UnitWord = keyof typeof UNIT_WORDS;

/** Offer microcopy (§J.3 offer.*) in the page locale; `{tokens}` filled from `vars`. */
export const offerWord = (locale: Locale, key: OfferWord, vars?: Record<string, string | number>) => say(locale, OFFER_WORDS[key], vars);

/** Unit / fill / error microcopy (§J.3 unit.*, err.*, matrix.*, stale) in the page locale; unknown tokens are kept. */
export const unitWord = (locale: Locale, key: UnitWord, vars?: Record<string, string | number>) => say(locale, UNIT_WORDS[key], vars);

/** The §J.3 key → text table the automatic offer names read (catalog.ts OfferNameCtx.t). */
export function offerNameT(locale: Locale): (key: string, vars?: Record<string, string | number>) => string {
  const map: Record<string, OfferWord> = { "offer.choice": "choice", "offer.anyN": "anyN", "offer.duo": "duo", "offer.trio": "trio" };
  return (key, vars) => {
    const w = map[key];
    return w ? offerWord(locale, w, vars) : key;
  };
}
