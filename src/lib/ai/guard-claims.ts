/**
 * Claim nouns: what a thing IS rather than how it looks (P7 AI; ai.md AI-§D.2 rule 7, rev 3 QUAL-18). A vision model
 * that calls a PU bag "cuir véritable" or a glass bottle "crystal" makes a false claim the number rule cannot see, so:
 *  - `finalize("analyze")` moves every material, origin and certification noun of `summary` and `materials` into
 *    `suggestedFacts` (unticked chips) and keeps appearance only;
 *  - the copy guard rejects a field naming a claim the merchant's own words (facts, store facts, product name) do not
 *    contain, so an unticked suggestion never reaches a page through a model's guess.
 *
 * Closed per-locale lists: leathers, metals, stones, fibres, woods, glass and ceramics, origins, labels. Words that are
 * also colours ("gold", "doré", "turquoise", "ذهبي") are colours here; the metal claim needs its material form ("or
 * massif", "solid gold", "من الذهب"). Also the closed colour-word list `analyze` keeps its colours from.
 *
 * Pure and isomorphic.
 */
import type { Locale } from "@/lib/page/schema";

export type ClaimGroup = "leather" | "metal" | "stone" | "fibre" | "wood" | "glass" | "origin" | "label";
export type ClaimKind = "material" | "origin" | "label";
type Lang = "fr" | "en" | "ar";

export interface ClaimHit {
  kind: ClaimKind;
  group: ClaimGroup;
  /** the matched text, as written */
  text: string;
  /** offsets in the original text, the preposition before it included in [cut, end) */
  at: number;
  end: number;
  cut: number;
}

const kindOf = (g: ClaimGroup): ClaimKind => (g === "origin" ? "origin" : g === "label" ? "label" : "material");

/** One term per entry; "*" stands for one word (a place: "made in *"). Longer terms are tried first. */
const CLAIMS: Record<Lang, Record<ClaimGroup, readonly string[]>> = {
  fr: {
    leather: ["cuir véritable", "cuir pleine fleur", "cuir de vachette", "cuir d'agneau", "cuir synthétique", "simili cuir", "similicuir", "cuir", "daim", "nubuck", "vachette", "croûte de cuir"],
    metal: ["en or massif", "en argent massif", "or massif", "or 9 carats", "or 14 carats", "or 18 carats", "or 24 carats", "18 carats", "14 carats", "24 carats", "9 carats", "plaqué or", "en or", "argent massif", "argent 925", "argent sterling", "en argent", "plaqué argent", "acier inoxydable", "acier chirurgical", "acier", "inox", "titane", "laiton", "cuivre", "platine", "vermeil", "aluminium", "carats", "carat"],
    stone: ["diamants", "diamant", "rubis", "saphir", "perles", "perle", "zircon", "zirconium", "oxyde de zirconium", "quartz", "améthyste", "nacre", "agate", "pierres précieuses", "pierre précieuse", "pierres naturelles", "pierre naturelle"],
    fibre: ["pure soie", "soie", "100 % coton", "pur coton", "coton bio", "coton", "lin", "laine", "cachemire", "mérinos", "alpaga", "mohair", "polyester", "nylon", "élasthanne", "lycra", "viscose", "bambou"],
    wood: ["bois massif", "bois naturel", "bois de thuya", "bois d'olivier", "bois", "chêne", "noyer", "hêtre", "teck", "acajou", "ébène", "thuya", "cèdre"],
    glass: ["verre trempé", "verre soufflé", "cristal", "verre", "céramique", "porcelaine", "faïence", "grès", "terre cuite", "marbre", "borosilicate"],
    origin: ["fait main au *", "fait main en *", "fait main à *", "faite main au *", "fait main", "faite main", "faits main", "faites main", "fait à la main", "faite à la main", "artisanal", "artisanale", "artisanaux", "made in *", "fabriqué au *", "fabriqué en *", "fabriqué à *", "fabriquée au *", "fabriquée en *", "fabriquée à *", "fabriqués au *", "produit au *", "produit en *", "d'origine", "importé", "importée", "importés", "beldi", "beldia"],
    label: ["biologique", "bio", "certifié", "certifiée", "certifiés", "certifiées", "agréé", "norme ce", "marquage ce", "écolabel", "ecocert", "vegan", "végan", "végane", "cruelty free", "cruelty-free", "halal", "hypoallergénique", "testé dermatologiquement", "dermatologiquement testé", "sans paraben", "sans parabène", "sans parabènes", "sans sulfate", "sans sulfates", "100 % naturel", "100 % naturelle", "oeko-tex", "gots", "fsc", "fda", "iso", "authentique"],
  },
  en: {
    leather: ["genuine leather", "real leather", "full-grain leather", "full grain leather", "vegan leather", "faux leather", "leather", "suede", "nubuck", "calfskin", "lambskin", "cowhide"],
    metal: ["18k solid gold", "solid gold", "real gold", "18k", "14k", "24k", "9k", "pure gold", "gold-plated", "gold plated", "18k gold", "14k gold", "24k gold", "sterling silver", "solid silver", "925 silver", "silver-plated", "silver plated", "stainless steel", "surgical steel", "steel", "titanium", "brass", "copper", "platinum", "aluminum", "aluminium", "tungsten", "karat", "carat"],
    stone: ["diamonds", "diamond", "ruby", "sapphire", "pearls", "pearl", "cubic zirconia", "zirconia", "zircon", "quartz", "amethyst", "mother-of-pearl", "agate", "gemstones", "gemstone", "precious stones", "precious stone", "natural stone"],
    fibre: ["pure silk", "silk", "100% cotton", "organic cotton", "cotton", "linen", "wool", "cashmere", "merino", "alpaca", "mohair", "polyester", "nylon", "spandex", "elastane", "lycra", "viscose", "rayon", "bamboo"],
    wood: ["solid wood", "natural wood", "olive wood", "thuya wood", "wooden", "wood", "oak", "walnut", "beech", "teak", "mahogany", "ebony", "thuya", "cedar"],
    glass: ["tempered glass", "blown glass", "crystal", "glass", "ceramic", "porcelain", "stoneware", "earthenware", "terracotta", "marble", "borosilicate"],
    origin: ["handmade in *", "hand-made in *", "handcrafted in *", "crafted in *", "handmade", "hand-made", "handcrafted", "hand-crafted", "made by hand", "artisanal", "artisan-made", "made in *", "imported from *", "imported", "moroccan-made", "italian-made", "french-made", "beldi"],
    label: ["organic", "certified", "ce marked", "ce certified", "ecocert", "vegan", "cruelty-free", "cruelty free", "halal", "hypoallergenic", "dermatologically tested", "paraben-free", "paraben free", "sulfate-free", "sulfate free", "100% natural", "all-natural", "oeko-tex", "gots", "fsc", "fda approved", "fda", "iso", "genuine", "authentic"],
  },
  ar: {
    leather: ["جلد طبيعي", "جلد أصلي", "جلد حقيقي", "جلد بقري", "جلد الماعز", "جلد الغنم", "جلد صناعي", "الجلد الطبيعي", "جلدية", "شامواه"],
    metal: ["ذهب خالص", "من الذهب", "مطلي بالذهب", "مطلية بالذهب", "بالذهب", "عيار", "فضة خالصة", "من الفضة", "مطلي بالفضة", "فضة", "ستانلس", "فولاذ", "تيتانيوم", "نحاس", "بلاتين", "ألمنيوم", "ألومنيوم"],
    stone: ["ألماس", "الماس", "ياقوت", "زمرد", "لؤلؤ", "حجر كريم", "أحجار كريمة", "زركون", "عقيق", "كوارتز"],
    fibre: ["حرير طبيعي", "حرير", "قطن", "قطني", "قطنية", "كتان", "صوف", "كشمير", "بوليستر", "نايلون", "ليكرا", "فيسكوز"],
    wood: ["خشب العرعار", "خشب الزيتون", "خشب طبيعي", "خشب", "خشبي", "خشبية", "عرعار", "بلوط", "زان", "ساج", "خيزران"],
    glass: ["زجاج", "زجاجي", "زجاجية", "كريستال", "بلور", "سيراميك", "خزف", "فخار", "رخام", "بورسلين"],
    origin: ["صنع في *", "صناعة مغربية", "صناعة يدوية في *", "صناعة يدوية", "صنع يدوي", "مصنوع يدويا", "مصنوعة يدويا", "مصنوع في *", "مصنوعة في *", "منتوج مغربي", "منتج مغربي", "مستورد", "مستوردة", "بلدي", "بلدية", "حرفي"],
    label: ["عضوي", "عضوية", "بيو", "حلال", "معتمد", "معتمدة", "حاصل على شهادة", "مصادق عليه", "خالي من البارابين", "خال من البارابين", "بدون بارابين", "مختبر جلديا", "مضاد للحساسية", "أصلي", "أصلية", "iso", "fda"],
  },
};

/** "*" in a term: a place (a country or a Moroccan city), in any locale's spelling. */
const PLACES = [
  "maroc", "morocco", "italie", "italy", "france", "espagne", "spain", "turquie", "turkey", "chine", "china", "allemagne", "germany", "usa", "japon", "japan", "corée", "korea", "inde", "india", "portugal", "tunisie", "tunisia", "égypte", "egypt", "europe",
  "fès", "fez", "marrakech", "casablanca", "rabat", "tanger", "tangier", "agadir", "essaouira", "meknès", "ouarzazate", "tétouan", "chefchaouen", "oujda", "safi", "taroudant",
  "المغرب", "إيطاليا", "فرنسا", "إسبانيا", "تركيا", "الصين", "ألمانيا", "أمريكا", "اليابان", "كوريا", "الهند", "تونس", "مصر", "أوروبا", "فاس", "مراكش", "الدار البيضاء", "الرباط", "طنجة", "أكادير", "الصويرة", "مكناس", "ورزازات", "تطوان", "شفشاون", "وجدة", "آسفي", "تارودانت",
];

/** A preposition the claim leaves behind when it is cut ("un sac en cuir" → "un sac"). */
const LEAD_IN = /(?:^|[\s,(])(?:en|de|d'|d’|du|des|à|in|of|from|made of|made from|من|في|ب)\s*$/iu;

/* ------------------------------------------------------------------ */
/* Folding with an offset map                                          */
/* ------------------------------------------------------------------ */

const AR_MARKS = /[\u064B-\u065F\u0670\u0640]/;

/** Lower case, no accents, Arabic folded (no marks, one alef …); `map[i]` = the original offset of folded char i. */
export function foldWithMap(s: string): { f: string; map: number[] } {
  let f = "";
  const map: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (AR_MARKS.test(c)) continue;
    let d = c.normalize("NFD").replace(/[\u0300-\u036F]/g, "").toLowerCase();
    if (d.length !== 1) d = c.toLowerCase().length === 1 ? c.toLowerCase() : c;
    d = d.replace(/[أإآٱ]/, "ا").replace("ى", "ي").replace("ة", "ه").replace("’", "'");
    f += d;
    map.push(i);
  }
  map.push(s.length);
  return { f, map };
}
const fold = (s: string) => foldWithMap(s).f;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const PLACE_SOURCE = `(?:${PLACES.map((p) => escape(fold(p)).replace(/ /g, "\\s+")).join("|")})`;
function termSource(term: string): string {
  return term
    .split(" ")
    .map((part) => (part === "*" ? PLACE_SOURCE : escape(fold(part)).replace(/-/g, "[-\\s]?")))
    .join("\\s+")
    .replace(/\\s\+%/g, "\\s*%");
}

/** one regex per locale and group: Arabic terms take a proclitic (و، ف، ب، ل، ك) and the article */
const REGEX: Record<Lang, [ClaimGroup, RegExp][]> = Object.fromEntries(
  (["fr", "en", "ar"] as const).map((lang) => [
    lang,
    (Object.entries(CLAIMS[lang]) as [ClaimGroup, readonly string[]][]).map(([group, terms]) => {
      const alt = [...terms].sort((a, b) => b.length - a.length).map(termSource).join("|");
      const pre = lang === "ar" ? "(?:[وفبلك]?(?:ال)?)" : "";
      return [group, new RegExp(`(?<![\\p{L}\\p{N}])${pre}(?:${alt})(?![\\p{L}\\p{N}])`, "giu")] as [ClaimGroup, RegExp];
    }),
  ]),
) as Record<Lang, [ClaimGroup, RegExp][]>;

/** Every claim noun in `text`, read with the given locales' lists (all three by default: a model may mix them). */
export function claimsIn(text: string, locales: readonly (Locale | Lang)[] = ["fr", "en", "ar"]): ClaimHit[] {
  const { f, map } = foldWithMap(text);
  const hits: ClaimHit[] = [];
  const langs = [...new Set(locales.map((l) => (l === "ar" ? "ar" : l === "fr" ? "fr" : "en")))] as Lang[];
  for (const lang of langs) {
    for (const [group, re] of REGEX[lang]) {
      re.lastIndex = 0;
      for (let m = re.exec(f); m; m = re.exec(f)) {
        const at = map[m.index]!;
        const end = map[m.index + m[0].length]!;
        const lead = LEAD_IN.exec(text.slice(0, at));
        const cut = lead ? at - lead[0].replace(/^[\s,(]/, "").length : at;
        hits.push({ kind: kindOf(group), group, text: text.slice(at, end), at, end, cut });
      }
    }
  }
  // overlapping matches of different lists: the earliest, then the longest, wins
  hits.sort((a, b) => a.at - b.at || b.end - a.end);
  const kept: ClaimHit[] = [];
  for (const h of hits) if (!kept.some((k) => h.at < k.end && h.end > k.at)) kept.push(h);
  return kept;
}

/** `text` without the claims (and the preposition before each); tidies the spaces and punctuation left behind. */
export function stripClaims(text: string, hits: readonly ClaimHit[] = claimsIn(text)): string {
  let out = text;
  for (const h of [...hits].sort((a, b) => b.at - a.at)) out = out.slice(0, h.cut) + out.slice(h.end);
  return out
    .replace(/\s+([,.;:!?،؟])/g, "$1")
    .replace(/([,،])\s*([,.،;])/g, "$2")
    .replace(/\b(?:et|and|ou|or)\s*([.,;])/gi, "$1")
    .replace(/(?:^|\s)(?:و|أو)\s*([.,،؛])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s,.;:،]+/, "")
    .replace(/[\s,;:،]+$/, "")
    .trim();
}

/** The claim's words appear in the merchant's own sources (facts, store facts, product name), proclitics aside. */
export function claimAllowed(hit: ClaimHit, sources: string): boolean {
  const src = fold(sources);
  const t = fold(hit.text).replace(/^[وفبلك]?(?:ال)?(?=\S{2,})/, "");
  return src.includes(t) || src.includes(fold(hit.text));
}

/* ------------------------------------------------------------------ */
/* Colour words (analyze keeps its colours from these)                 */
/* ------------------------------------------------------------------ */

const COLOURS: Record<Lang, readonly string[]> = {
  fr: ["blanc", "blanche", "noir", "noire", "gris", "grise", "beige", "crème", "ivoire", "écru", "marron", "brun", "brune", "chocolat", "caramel", "camel", "taupe", "kaki", "vert", "verte", "olive", "menthe", "sauge", "turquoise", "bleu", "bleue", "marine", "ciel", "cobalt", "indigo", "violet", "violette", "lilas", "lavande", "mauve", "prune", "bordeaux", "rouge", "framboise", "rose", "fuchsia", "corail", "saumon", "pêche", "nude", "poudré", "jaune", "moutarde", "citron", "orange", "doré", "dorée", "argenté", "argentée", "bronze", "cuivré", "cuivrée", "champagne", "transparent", "transparente", "multicolore", "pastel", "sable", "terracotta", "rouille", "anthracite", "clair", "claire", "foncé", "foncée", "mat", "brillant"],
  en: ["white", "black", "grey", "gray", "beige", "cream", "ivory", "brown", "chocolate", "caramel", "camel", "tan", "taupe", "khaki", "green", "olive", "mint", "sage", "teal", "turquoise", "blue", "navy", "sky", "cobalt", "indigo", "purple", "violet", "lilac", "lavender", "mauve", "plum", "burgundy", "maroon", "red", "raspberry", "pink", "fuchsia", "coral", "salmon", "peach", "nude", "blush", "yellow", "mustard", "lemon", "orange", "gold", "golden", "silver", "bronze", "copper", "champagne", "clear", "transparent", "multicolor", "multicolour", "pastel", "sand", "terracotta", "rust", "charcoal", "light", "dark", "pale", "matte", "glossy"],
  ar: ["أبيض", "بيضاء", "أسود", "سوداء", "رمادي", "رمادية", "بيج", "كريمي", "عاجي", "بني", "بنية", "قهوي", "كاكي", "أخضر", "خضراء", "زيتي", "نعناعي", "فيروزي", "أزرق", "زرقاء", "كحلي", "سماوي", "نيلي", "بنفسجي", "ليلكي", "موف", "عنابي", "خمري", "أحمر", "حمراء", "وردي", "وردية", "فوشيا", "مرجاني", "خوخي", "أصفر", "صفراء", "خردلي", "ليموني", "برتقالي", "ذهبي", "ذهبية", "فضي", "فضية", "برونزي", "نحاسي", "شفاف", "شفافة", "رملي", "فاتح", "غامق", "داكن", "لامع", "مطفي"],
};
const COLOUR_SET: ReadonlySet<string> = new Set(Object.values(COLOURS).flat().map(fold));

/** Does `s` name a colour (a word of the closed lists, any locale)? */
export function isColourPhrase(s: string): boolean {
  return fold(s)
    .split(/[^\p{L}]+/u)
    .some((word) => word && (COLOUR_SET.has(word) || COLOUR_SET.has(word.replace(/^(?:ال)/, ""))));
}

/** The lists, for tests and the Campaign Kit's `doNotSay` (P3 reads them, LAN-§13.3). */
export const CLAIM_TERMS: Readonly<Record<Lang, Readonly<Record<ClaimGroup, readonly string[]>>>> = CLAIMS;
export const COLOUR_WORDS: Readonly<Record<Lang, readonly string[]>> = COLOURS;
