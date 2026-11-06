/**
 * The product name as French grammar reads it (P6 DESIGN; design.md DES-§9.5 D4). Pure and isomorphic.
 *
 * `productRef(name, locale)` parses a name typed with its article ("l'huile d'argan", "La crème de nuit") or looks the
 * head noun up in a small noun-gender lexicon (≈ 300 product nouns); `gender: null` when unknown. No PageDoc field is
 * added: the wizard's Details step offers a "le / la" chip that prefixes the article in the typed name.
 * `articleFor(ref, slot)` resolves the library's and the generator's gendered slots: `{product:le}` → "l'huile",
 * `{product:ce}` → "cette huile", `{product:de}` → "de l'huile", `{product:un}` → "une huile", `{product:a}` →
 * "à l'huile" / "au sérum"; a template with a
 * gendered slot is drawn only when the gender is known (every such template has a name-free alternative).
 * Arabic and English names pass through as typed.
 */
import type { Locale } from "@/lib/page/schema";

export interface ProductRef {
  /** the name without its leading article, as typed otherwise ("huile d'argan", "Sérum Argan") */
  text: string;
  gender: "m" | "f" | null;
  article: "le" | "la" | "l'" | null;
  plural: boolean;
}

export type ArticleSlot = "le" | "ce" | "de" | "un" | "a" | "bare";

/** Feminine product nouns (head nouns, singular, accents folded). */
const FEM = [
  "huile", "creme", "lotion", "brume", "eau", "pommade", "poudre", "pate", "cire", "mousse", "gelee", "graisse", "essence",
  "savonnette", "lingette", "eponge", "brosse", "lime", "pince", "trousse", "palette", "base", "teinture", "coloration", "laque",
  "huile", "serviette", "bougie", "lampe", "veilleuse", "guirlande", "applique", "suspension", "horloge", "pendule", "etagere",
  "table", "chaise", "commode", "armoire", "console", "banquette", "couverture", "couette", "housse", "taie", "nappe",
  "parure", "moquette", "carpette", "natte", "vaisselle", "assiette", "tasse", "theiere", "cafetiere", "bouilloire",
  "casserole", "poele", "marmite", "cocotte", "tajine", "planche", "rape", "spatule", "louche", "passoire", "balance",
  "friteuse", "machine", "plancha", "yaourtiere", "gourde", "bouteille", "carafe", "boite", "boite", "corbeille", "poubelle",
  "serpilliere", "raclette", "pelle", "tondeuse", "perceuse", "visseuse", "scie", "meuleuse", "cle", "lampe", "torche",
  "batterie", "camera", "enceinte", "montre", "tablette", "souris", "manette", "console", "cle", "coque", "protection",
  "station", "prise", "rallonge", "ampoule", "antenne", "imprimante", "robe", "jupe", "chemise", "veste", "tunique",
  "abaya", "djellaba", "jellaba", "gandoura", "takchita", "kimono", "blouse", "chemisette", "combinaison", "salopette",
  "doudoune", "parka", "cape", "echarpe", "etole", "ceinture", "casquette", "chapka", "cagoule", "chaussette",
  "chaussure", "basket", "sandale", "babouche", "botte", "bottine", "ballerine", "mule", "pantoufle", "espadrille",
  "sacoche", "pochette", "valise", "besace", "banane", "bague", "chaine", "chainette", "gourmette", "boucle", "broche",
  "parure", "alliance", "barrette", "tiare", "couronne", "poupee", "peluche", "voiture", "figurine", "trottinette",
  "draisienne", "balancoire", "cabane", "tente", "piscine", "ardoise", "pate", "maquette", "toupie", "marionnette",
  "gamelle", "litiere", "laisse", "cage", "niche", "griffe", "friandise", "croquette", "datte", "olive", "confiture",
  "farine", "semoule", "epice", "tisane", "infusion", "amande", "noix", "noisette", "pistache", "figue", "graine",
  "huile", "argile", "rose", "plante", "fleur", "orchidee", "corde", "sangle", "barre", "haltere", "kettlebell",
  "corde", "bande", "ceinture", "genouillere", "chevillere", "gaine", "brassiere", "legging", "gourde", "raquette",
  "balle", "planche", "trottinette", "glaciere", "housse", "bache", "pompe", "bombe", "cire", "polish",
];

/** Masculine product nouns (head nouns, singular, accents folded). */
const MASC = [
  "serum", "savon", "shampoing", "shampooing", "apres-shampoing", "masque", "gommage", "baume", "gel", "lait", "tonique",
  "demaquillant", "deodorant", "parfum", "musc", "ambre", "oud", "encens", "bakhour", "spray", "soin", "kit", "coffret",
  "set", "lot", "pack", "duo", "trio", "rouge", "mascara", "crayon", "fard", "fond", "vernis", "dissolvant", "pinceau",
  "peigne", "lisseur", "fer", "seche-cheveux", "boucleur", "rasoir", "epilateur", "miroir", "tapis", "coussin", "plaid",
  "drap", "oreiller", "matelas", "rideau", "voilage", "store", "cadre", "tableau", "vase", "pot", "bocal", "panier",
  "plateau", "verre", "bol", "mug", "couteau", "ustensile", "fouet", "robot", "mixeur", "blender", "batteur", "four",
  "grille-pain", "presse-agrumes", "extracteur", "hachoir", "moulin", "cuiseur", "autocuiseur", "wok", "couscoussier",
  "plat", "moule", "thermos", "aspirateur", "balai", "seau", "chiffon", "desodorisant", "diffuseur", "humidificateur",
  "purificateur", "ventilateur", "radiateur", "chauffage", "climatiseur", "deshumidificateur", "fer", "defroisseur",
  "pistolet", "tournevis", "marteau", "niveau", "metre", "compresseur", "cric", "chargeur", "cable", "adaptateur",
  "ecouteur", "casque", "haut-parleur", "telephone", "smartphone", "ordinateur", "clavier", "ecran", "projecteur",
  "routeur", "support", "trepied", "drone", "jouet", "jeu", "puzzle", "ballon", "velo", "tricycle", "camion", "train",
  "robot", "livre", "cahier", "stylo", "sac", "cartable", "portefeuille", "porte-monnaie", "porte-cles", "bracelet",
  "collier", "pendentif", "bijou", "foulard", "hijab", "khimar", "voile", "niqab", "jilbab", "caftan", "kaftan", "burkini",
  "t-shirt", "tee-shirt", "pull", "sweat", "gilet", "cardigan", "manteau", "blouson", "jean", "pantalon", "short",
  "survetement", "pyjama", "ensemble", "costume", "tailleur", "body", "bonnet", "chapeau", "gant", "jabador", "sarouel",
  "slip", "boxer", "soutien-gorge", "maillot", "mocassin", "escarpin", "sabot", "panier", "collier", "harnais",
  "griffoir", "arbre", "aquarium", "terrarium", "miel", "amlou", "the", "cafe", "chocolat", "fromage", "beurre", "smen",
  "safran", "cumin", "paprika", "poivre", "sel", "sucre", "riz", "couscous", "ghassoul", "henne", "khol", "siwak",
  "argan", "complement", "tapis", "banc", "elastique", "stepper", "rameur", "velo", "trampoline", "sac", "nettoyant",
  "detergent", "lave-vitre", "desinfectant", "anti-moustique", "piege", "cendrier", "briquet", "porte-bebe", "biberon",
  "transat", "parc", "lit", "berceau", "landau", "siege", "rehausseur", "bavoir", "doudou", "hochet", "sticker", "tapis",
];

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/’/g, "'");

const FEM_SET: ReadonlySet<string> = new Set(FEM);
const MASC_SET: ReadonlySet<string> = new Set(MASC);
const ALL_NOUNS: ReadonlySet<string> = new Set([...FEM, ...MASC]);
/** The lexicon's size (the selftest asserts ≈ 300 nouns). */
export const GENDER_LEXICON_SIZE = ALL_NOUNS.size;

const VOWEL_START = /^[aeiouyhàâäéèêëîïôöùûüœæ]/i;
/** "h" aspiré product nouns keep their article un-elided ("le hammam", "la housse") */
const H_ASPIRE: ReadonlySet<string> = new Set(["housse", "hachoir", "harnais", "haut-parleur", "haltere", "hochet", "henne", "hamac", "hammam", "hijab"]);

/** The gender of a French head noun (its plural read as the singular), or null. */
export function nounGender(noun: string): "m" | "f" | null {
  const n = fold(noun);
  const sing = n.endsWith("x") || (n.endsWith("s") && n.length > 3) ? n.slice(0, -1) : n;
  for (const c of [n, sing]) {
    if (FEM_SET.has(c)) return "f";
    if (MASC_SET.has(c)) return "m";
  }
  return null;
}

/** Whether a noun elides its article ("l'huile", never "l'housse"). */
export const elides = (word: string): boolean => VOWEL_START.test(word) && !H_ASPIRE.has(fold(word).replace(/[^a-z-]/g, ""));

/** Parse a typed product name (DES-§9.5 D4). */
export function productRef(name: string, locale: Locale): ProductRef {
  const text = name.replace(/\s+/g, " ").trim();
  if (locale !== "fr") return { text, gender: null, article: null, plural: false };
  const m = /^(l['’]|le |la |les )(.+)$/i.exec(text);
  const rest = m ? m[2]!.trim() : text;
  const head = rest.split(/[\s,]+/)[0] ?? "";
  const art = m ? m[1]!.toLowerCase().replace("’", "'").trim() : null;
  const plural = art === "les";
  const looked = nounGender(head);
  const gender = art === "le" ? "m" : art === "la" ? "f" : looked;
  const article: ProductRef["article"] = art === "le" || art === "la" || art === "l'" ? (art as ProductRef["article"]) : null;
  return { text: rest, gender, article, plural };
}

/** The head noun with a lowercase first letter when it is a common noun ("Huile d'argan" → "huile d'argan"). */
function commonCase(ref: ProductRef): string {
  const head = ref.text.split(/\s/)[0] ?? "";
  // a brand-like head (all caps, a capital inside, or a word the lexicon does not know) keeps its case
  if (nounGender(head) === null || /^\p{Lu}{2,}/u.test(head) || /\p{Ll}\p{Lu}/u.test(head)) return ref.text;
  return ref.text.charAt(0).toLowerCase() + ref.text.slice(1);
}

/**
 * The gendered form of a slot (fr): "le" → "l'huile" / "le sérum" / "la crème"; "ce" → "cette huile" / "cet abricot"
 * / "ce sérum"; "de" → "de l'huile" / "du sérum" / "de la crème"; "un" → "une huile" / "un sérum"; "bare" → the name
 * as typed. null when the slot needs a gender the ref does not have (the caller draws the name-free alternative).
 */
export function articleFor(ref: ProductRef, slot: ArticleSlot): string | null {
  // the name as typed, its article kept (lowercase: the caller capitalises a line start)
  if (slot === "bare") return ref.article ? `${ref.article === "l'" ? "l'" : `${ref.article} `}${ref.text}` : ref.text;
  if (!ref.gender) return null;
  const noun = commonCase(ref);
  const el = elides(noun);
  if (ref.plural) return { le: `les ${noun}`, ce: `ces ${noun}`, de: `des ${noun}`, un: `des ${noun}`, a: `aux ${noun}` }[slot];
  const f = ref.gender === "f";
  switch (slot) {
    case "le":
      return el ? `l'${noun}` : `${f ? "la" : "le"} ${noun}`;
    case "ce":
      return f ? `cette ${noun}` : el ? `cet ${noun}` : `ce ${noun}`;
    case "de":
      return el ? `de l'${noun}` : f ? `de la ${noun}` : `du ${noun}`;
    case "un":
      return f ? `une ${noun}` : `un ${noun}`;
    case "a":
      return el ? `à l'${noun}` : f ? `à la ${noun}` : `au ${noun}`;
  }
}

/** The four ProductRef shapes test:copylib renders every French template against (DES-§9.5). */
export const REF_SHAPES: readonly ProductRef[] = [
  { text: "sérum éclat", gender: "m", article: null, plural: false },
  { text: "crème de nuit", gender: "f", article: null, plural: false },
  { text: "huile d'argan", gender: "f", article: "l'", plural: false },
  { text: "Zénith Pro", gender: null, article: null, plural: false },
];
