/**
 * Numbers in text, digits AND words (P7 AI; ai.md AI-§D.2 rule 5, rev 3 QUAL-17). Guard v2's number rule: a figure a
 * model writes must be one the merchant gave (facts, store facts, product name, price, delivery text, the policies and
 * the calling window), so "après deux semaines", "trois gouttes", "في أسبوعين", "جوج دقايق", "twice a day" or "half the
 * price" carry a figure exactly like "94 %" does.
 *
 *   numbersIn("Résultats après deux semaines", "fr")   → [{ value: 2, unit: "time", base: 20160, … }]
 *   const allowed = new AllowedNumbers().addText("Cure de 14 jours");
 *   allowed.allows(numbersIn("deux semaines", "fr")[0]!)   → true  (same unit class, same duration)
 *   new AllowedNumbers().addText("2 pièces").allows(numbersIn("deux semaines", "fr")[0]!)   → false
 *
 * Every match becomes a `NumberToken`: the value as written, its unit class when a unit follows (or is part of the
 * word: the Arabic duals أسبوعين, يومين, مرتين), and the value in the class's base unit (minutes, grams, millilitres,
 * millimetres, a ratio, a count), so 14 jours = deux semaines = 2 weeks. A token is allowed when an allowed value of the
 * same class has the same base value, or when the values are equal and one side carries no unit.
 *
 * Words that are also ordinary words count only next to a unit of time ("en une minute", "دقيقة واحدة"; "un geste",
 * "une pièce", "خطوة واحدة" are articles and pronouns): un / une, neuf (new), one, واحد / وحدة (someone), ست, سبع, تسع
 * ("it fits"); نص ("text" in MSA) also before a price word ("بنص الثمن"). Rank-1 ordinals (premier, first, أول),
 * "les deux" (both) and "entre deux" / "between two" (an idiom: between two sizes) are not numbers. The Latin-script
 * Darija numerals count only when the store's voice allows Arabizi (`opts.arabizi`).
 *
 * Pure and isomorphic.
 */
import type { Locale } from "@/lib/page/schema";

export type UnitClass = "time" | "count" | "mass" | "volume" | "length" | "ratio" | "money" | "times" | "rank";

export interface NumberToken {
  /** the value as written: 2 for "deux semaines", 0.5 for "moitié", 1500 for "1 500" */
  value: number;
  /** another reading of an ambiguous digit group ("1.500" is 1500 or 1.5) */
  alt?: number;
  /** the unit class, null when the number stands alone */
  unit: UnitClass | null;
  /** the value in the class's base unit (minutes, grams, millilitres, millimetres, ratio, units); = value when unit is null */
  base: number;
  /** the matched text */
  raw: string;
  /** character offset in the normalised text */
  at: number;
  kind: "digit" | "word";
}

export interface NumbersOpts {
  /** the Latin-script Darija numerals (jouj, tlata …), only when the voice asks for Arabizi */
  arabizi?: boolean;
}

type Lang = "fr" | "en" | "ar";
const langOf = (locale: Locale | string): Lang => (locale === "ar" ? "ar" : locale === "fr" ? "fr" : "en");

/* ------------------------------------------------------------------ */
/* Normalisation and tokens                                            */
/* ------------------------------------------------------------------ */

const HARAKAT = /[\u064B-\u065F\u0670\u0640]/g;

/** Arabic letters folded for lookups: no vowel marks or tatweel, one alef, ى → ي, ة → ه, ؤ → و, ئ → ي. */
export function arFold(s: string): string {
  return s
    .replace(HARAKAT, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي");
}

/** Latin folded for lookups: lower case, no accents, typographic apostrophe → '. */
export function latinFold(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036F]/g, "")
    .replace(/[’ʼ`]/g, "'");
}

/** Arabic-Indic and Persian digits → ASCII. */
export function asciiDigits(s: string): string {
  return s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

interface Tok {
  /** folded text used for lookups */
  k: string;
  raw: string;
  at: number;
  end: number;
  digit: boolean;
  /** joined to the previous token by a hyphen (dix-huit) */
  hyphen: boolean;
}

const TOKEN = /\d+(?:[.,]\d+)?|[\p{L}\p{M}]+(?:['’][\p{L}\p{M}]+)?|[%٪×$€]/gu;
/** a group of exactly three digits after a space continues the number ("1 500 DH") */
const THOUSANDS = /^[\s\u00A0\u202F]\d{3}(?!\d)/;

function tokenize(text: string): Tok[] {
  const s = asciiDigits(text.normalize("NFC"));
  const out: Tok[] = [];
  TOKEN.lastIndex = 0;
  for (let m = TOKEN.exec(s); m; m = TOKEN.exec(s)) {
    let raw = m[0];
    let end = m.index + raw.length;
    const digit = /^\d/.test(raw);
    // "1 500", "1 500 000" → one number (French and Arabic group thousands with a space)
    if (/^\d{1,3}$/.test(raw)) {
      while (THOUSANDS.test(s.slice(end))) {
        raw += s.slice(end, end + 4);
        end += 4;
      }
      TOKEN.lastIndex = end;
    }
    const hyphen = m.index > 0 && s[m.index - 1] === "-" && out.length > 0 && out[out.length - 1]!.end === m.index - 1;
    const k = /[\u0600-\u06FF]/.test(raw) ? arFold(raw) : latinFold(raw);
    out.push({ k, raw, at: m.index, end, digit, hyphen });
  }
  return out;
}

/** Elided French prefixes: "d'heures" → "heures", "l'an" → "an". */
const ELISION = /^(?:d|l|qu|j|n|s|c)'/;
/** Arabic proclitics tried, longest first, when a bare token is not in a table. */
/** (ك "like" is left out: كمية, كيلو … would read as a number word behind it) */
const AR_PREFIXES = ["وبال", "فبال", "وال", "بال", "فال", "لل", "ال", "و", "ف", "ب", "ل"];

/* ------------------------------------------------------------------ */
/* Units                                                               */
/* ------------------------------------------------------------------ */

interface UnitDef {
  unit: UnitClass;
  /** base units per one of this unit */
  f: number;
  /** a dual form carries its own count (أسبوعين = 2 weeks) */
  dual?: true;
}

const MIN = 1;
const HOUR = 60;
const DAY = 1_440;
const WEEK = 10_080;
const MONTH = 43_200;
const YEAR = 525_600;

const u = (unit: UnitClass, f: number, words: string): [string, UnitDef][] => words.split(" ").map((w) => [w, { unit, f }]);
const dual = (unit: UnitClass, f: number, words: string): [string, UnitDef][] => words.split(" ").map((w) => [arFold(w), { unit, f, dual: true }]);

const UNITS: Record<Lang, ReadonlyMap<string, UnitDef>> = {
  fr: new Map([
    ...u("time", 1 / 60, "seconde secondes sec"),
    ...u("time", MIN, "minute minutes min mn mins"),
    ...u("time", HOUR, "heure heures h hr hrs"),
    ...u("time", DAY, "jour jours j journee journees nuit nuits"),
    ...u("time", WEEK, "semaine semaines sem"),
    ...u("time", MONTH, "mois"),
    ...u("time", YEAR, "an ans annee annees"),
    ...u(
      "count",
      1,
      "piece pieces article articles unite unites produit produits paire paires pack packs lot lots flacon flacons tube tubes boite boites sachet sachets gelule gelules capsule capsules comprime comprimes goutte gouttes application applications utilisation utilisations usage usages lavage lavages client clients cliente clientes personne personnes commande commandes avis etoile etoiles couleur couleurs coloris modele modeles etape etapes geste gestes place places poche poches compartiment compartiments vitesse vitesses niveau niveaux exemplaire exemplaires",
    ),
    ...u("mass", 0.001, "mg"),
    ...u("mass", 1, "g gr gramme grammes"),
    ...u("mass", 1_000, "kg kilo kilos kilogramme kilogrammes"),
    ...u("volume", 1, "ml"),
    ...u("volume", 10, "cl"),
    ...u("volume", 1_000, "l litre litres"),
    ...u("length", 1, "mm"),
    ...u("length", 10, "cm"),
    ...u("length", 1_000, "m metre metres"),
    ...u("length", 1_000_000, "km"),
    ...u("ratio", 0.01, "% pourcent"),
    ...u("money", 1, "dh dhs mad dirham dirhams € eur euro euros $ usd dollar dollars"),
    ...u("times", 1, "fois x ×"),
  ]),
  en: new Map([
    ...u("time", 1 / 60, "second seconds sec secs"),
    ...u("time", MIN, "minute minutes min mins"),
    ...u("time", HOUR, "hour hours h hr hrs"),
    ...u("time", DAY, "day days night nights"),
    ...u("time", WEEK, "week weeks wk wks"),
    ...u("time", MONTH, "month months"),
    ...u("time", YEAR, "year years yr yrs"),
    ...u(
      "count",
      1,
      "piece pieces item items unit units product products pair pairs pack packs set sets bottle bottles tube tubes box boxes sachet sachets capsule capsules tablet tablets drop drops use uses wash washes application applications customer customers people person persons order orders review reviews star stars color colors colour colours size sizes model models step steps pocket pockets compartment compartments speed speeds level levels seat seats",
    ),
    ...u("mass", 0.001, "mg"),
    ...u("mass", 1, "g gram grams gramme grammes"),
    ...u("mass", 1_000, "kg kilo kilos kilogram kilograms"),
    ...u("volume", 1, "ml"),
    ...u("volume", 10, "cl"),
    ...u("volume", 1_000, "l liter liters litre litres"),
    ...u("length", 1, "mm"),
    ...u("length", 10, "cm"),
    ...u("length", 1_000, "m meter meters metre metres"),
    ...u("length", 1_000_000, "km"),
    ...u("ratio", 0.01, "% percent"),
    ...u("money", 1, "dh dhs mad dirham dirhams € eur euro euros $ usd dollar dollars"),
    ...u("times", 1, "times x ×"),
  ]),
  ar: new Map([
    ...u("time", 1 / 60, "ثانيه ثواني ثوان"),
    ...u("time", MIN, "دقيقه دقايق دقائق"),
    ...u("time", HOUR, "ساعه ساعات سوايع"),
    ...u("time", DAY, "يوم ايام يام نهار ليله ليالي"),
    ...u("time", WEEK, "اسبوع اسابيع سيمانه سيمانات سمانه"),
    ...u("time", MONTH, "شهر شهور اشهر"),
    ...u("time", YEAR, "سنه سنوات سنين عام اعوام"),
    ...u(
      "count",
      1,
      "قطعه قطع حبه حبات وحده وحدات منتج منتجات منتوج علبه علب قنينه كبسوله كبسولات قطره قطرات استعمال استعمالات غسله زبون زبونه زبناء زباين زبائن عميل عملاء شخص اشخاص طلب طلبات تقييم تقييمات نجمه نجوم لون الوان مقاس مقاسات موديل موديلات خطوه خطوات مرحله مراحل جيب جيوب سرعه سرعات مستوي مستويات",
    ),
    ...u("mass", 0.001, "ملغ"),
    ...u("mass", 1, "غ غرام جرام غرامات"),
    ...u("mass", 1_000, "كلغ كيلو كيلوغرام"),
    ...u("volume", 1, "مل ملل"),
    ...u("volume", 1_000, "لتر لترات ليتر"),
    ...u("length", 1, "مم"),
    ...u("length", 10, "سم"),
    ...u("length", 1_000, "متر امتار"),
    ...u("ratio", 0.01, "% ٪ بالمايه بالميه"),
    ...u("money", 1, "درهم دراهم dh"),
    ...u("times", 1, "مره مرات"),
    ...dual("time", MIN, "دقيقتين"),
    ...dual("time", HOUR, "ساعتين"),
    ...dual("time", DAY, "يومين ليلتين نهارين"),
    ...dual("time", WEEK, "أسبوعين اسبوعين سيمانتين"),
    ...dual("time", MONTH, "شهرين"),
    ...dual("time", YEAR, "سنتين عامين"),
    ...dual("count", 1, "قطعتين حبتين خطوتين علبتين"),
    ...dual("times", 1, "مرتين"),
  ]),
};
/** two-token units, checked before the one-token ones */
const UNITS2: Record<Lang, ReadonlyMap<string, UnitDef>> = {
  fr: new Map([["pour cent", { unit: "ratio", f: 0.01 }]]),
  en: new Map([
    ["per cent", { unit: "ratio", f: 0.01 }],
    ["percent off", { unit: "ratio", f: 0.01 }],
  ]),
  ar: new Map([
    [`${arFold("في")} ${arFold("المائة")}`, { unit: "ratio", f: 0.01 }],
    [`${arFold("في")} ${arFold("المئة")}`, { unit: "ratio", f: 0.01 }],
    [`${arFold("في")} ${arFold("المية")}`, { unit: "ratio", f: 0.01 }],
  ]),
};
/** words skipped between a number and its unit ("trois de plus" no; "جوج ديال السوايع", "dozens of hours") */
const FILLERS: Record<Lang, ReadonlySet<string>> = {
  fr: new Set(["de", "d", "des"]),
  en: new Set(["of"]),
  ar: new Set([arFold("ديال"), arFold("د"), arFold("دال")]),
};

/** The Latin-script Darija units, only with `arabizi`. */
const ARABIZI_UNITS = new Map<string, UnitDef>([
  ...u("time", MIN, "dqiqa d9i9a dqayq d9aye9"),
  ...u("time", HOUR, "sa3a swaye3"),
  ...u("time", DAY, "nhar ayam iyam yam"),
  ...u("time", WEEK, "simana simanat"),
  ...u("time", MONTH, "chhar chhour"),
  ...u("time", YEAR, "3am"),
  ...u("count", 1, "7ba 7bat"),
  ...u("times", 1, "merra merrat"),
]);

/* ------------------------------------------------------------------ */
/* Number words                                                        */
/* ------------------------------------------------------------------ */

type WordKind = "num" | "mult" | "frac" | "rank" | "times" | "approx";
interface WordDef {
  v: number;
  kind: WordKind;
  /** counts only next to a unit (also an ordinary word) */
  needsUnit?: true;
}

const w = (kind: WordKind, pairs: string, needsUnit = false): [string, WordDef][] =>
  pairs.split(",").map((p) => {
    const [word, v] = p.trim().split("=") as [string, string];
    return [word.trim(), { v: Number(v), kind, ...(needsUnit ? { needsUnit: true as const } : {}) }];
  });
const arw = (kind: WordKind, pairs: string, needsUnit = false): [string, WordDef][] => w(kind, pairs, needsUnit).map(([k, d]) => [arFold(k), d]);

const WORDS: Record<Lang, ReadonlyMap<string, WordDef>> = {
  fr: new Map([
    ...w("num", "un=1, une=1, neuf=9", true),
    ...w(
      "num",
      "deux=2, trois=3, quatre=4, cinq=5, six=6, sept=7, huit=8, dix=10, onze=11, douze=12, treize=13, quatorze=14, quinze=15, seize=16, vingt=20, vingts=20, trente=30, quarante=40, cinquante=50, soixante=60, septante=70, huitante=80, nonante=90",
    ),
    ...w("mult", "cent=100, cents=100, mille=1000, million=1000000, millions=1000000, milliard=1000000000, milliards=1000000000"),
    ...w("frac", "demi=0.5, demie=0.5, moitie=0.5, tiers=0.3333, quart=0.25, quarts=0.25"),
    ...w("rank", "deuxieme=2, troisieme=3, quatrieme=4, cinquieme=5, sixieme=6, septieme=7, huitieme=8, neuvieme=9, dixieme=10"),
    ...w("times", "double=2, doubles=2, triple=3, triples=3, quadruple=4"),
    ...w("approx", "dizaine=10, dizaines=10, douzaine=12, douzaines=12, vingtaine=20, trentaine=30, centaine=100, centaines=100, millier=1000, milliers=1000"),
  ]),
  en: new Map([
    ...w("num", "one=1", true),
    ...w(
      "num",
      "two=2, three=3, four=4, five=5, six=6, seven=7, eight=8, nine=9, ten=10, eleven=11, twelve=12, thirteen=13, fourteen=14, fifteen=15, sixteen=16, seventeen=17, eighteen=18, nineteen=19, twenty=20, thirty=30, forty=40, fifty=50, sixty=60, seventy=70, eighty=80, ninety=90",
    ),
    ...w("mult", "hundred=100, thousand=1000, million=1000000, billion=1000000000"),
    ...w("frac", "half=0.5, halves=0.5, quarter=0.25, quarters=0.25"),
    ...w("rank", "third=3, fourth=4, fifth=5, sixth=6, seventh=7, eighth=8, ninth=9, tenth=10"),
    ...w("times", "twice=2, thrice=3, double=2, doubles=2, triple=3, quadruple=4"),
    ...w("approx", "dozen=12, dozens=12, hundreds=100, thousands=1000, millions=1000000"),
  ]),
  ar: new Map([
    ...arw("num", "واحد=1, واحدة=1, وحدة=1, ست=6, سبع=7, تسع=9, ثمان=8", true),
    ...arw(
      "num",
      "اثنان=2, اثنين=2, اثنتان=2, اثنتين=2, ثلاث=3, ثلاثة=3, أربع=4, أربعة=4, خمس=5, خمسة=5, ستة=6, سبعة=7, ثماني=8, ثمانية=8, تسعة=9, عشر=10, عشرة=10, عشرون=20, عشرين=20, ثلاثون=30, ثلاثين=30, أربعون=40, أربعين=40, خمسون=50, خمسين=50, ستون=60, ستين=60, سبعون=70, سبعين=70, ثمانون=80, ثمانين=80, تسعون=90, تسعين=90",
    ),
    // Darija (Arabic script, the orthography of src/lib/ai/prompts/darija-orthography.ts)
    ...arw(
      "num",
      "جوج=2, تلاتة=3, تلات=3, ربعة=4, تمنية=8, حداش=11, طناش=12, تلطاش=13, ربعطاش=14, خمسطاش=15, سطاش=16, سبعطاش=17, تمنطاش=18, تسعطاش=19, تلاتين=30, ربعين=40, تمانين=80",
    ),
    ...arw("mult", "مئة=100, مائة=100, مية=100, ميتين=200, مئتان=200, مئتين=200, مائتين=200, ثلاثمائة=300, ثلاثمئة=300, أربعمائة=400, أربعمئة=400, خمسمائة=500, خمسمئة=500, ستمائة=600, سبعمائة=700, ثمانمائة=800, تسعمائة=900, ألف=1000, ألفين=2000, آلاف=1000, مليون=1000000, ملايين=1000000"),
    ...arw("frac", "نصف=0.5, ثلث=0.3333, ربع=0.25"),
    ...arw("frac", "نص=0.5", true),
    ...arw("rank", "الثالث=3, الثالثة=3, الرابع=4, الرابعة=4, الخامس=5, الخامسة=5, السادس=6, السادسة=6, السابع=7, السابعة=7, الثامن=8, الثامنة=8, التاسع=9, التاسعة=9, العاشر=10, العاشرة=10"),
    ...arw("times", "ضعف=2, ضعفين=2, الضعف=2"),
    ...arw("approx", "عشرات=10, مئات=100, الاف=1000"),
  ]),
};
const ARABIZI_WORDS = new Map<string, WordDef>([
  ...w("num", "wahed=1, wa7ed=1, w7da=1", true),
  ...w("num", "jouj=2, jooj=2, zouj=2, tlata=3, rb3a=4, reb3a=4, khamsa=5, stta=6, setta=6, sb3a=7, seb3a=7, tmnya=8, tmenya=8, ts3a=9, tes3a=9, 3chra=10, 3achra=10, 3chrin=20, 3echrin=20"),
  ...w("mult", "mya=100, miya=100, alf=1000"),
  ...w("frac", "nss=0.5, ness=0.5"),
]);

/** joiners inside one number ("vingt et un", "one hundred and five", "مئة و خمسين") */
const JOINERS: Record<Lang, ReadonlySet<string>> = { fr: new Set(["et"]), en: new Set(["and"]), ar: new Set([arFold("و")]) };

/* ------------------------------------------------------------------ */
/* Scanner                                                             */
/* ------------------------------------------------------------------ */

function lookupWord(t: Tok, lang: Lang, opts: NumbersOpts): WordDef | null {
  if (t.digit) return null;
  if (lang === "ar") {
    if (/^[a-z0-9']+$/.test(t.k)) return opts.arabizi ? (ARABIZI_WORDS.get(t.k) ?? null) : null;
    const direct = WORDS.ar.get(t.k);
    if (direct) return direct;
    for (const p of AR_PREFIXES) {
      if (!t.k.startsWith(p) || t.k.length - p.length < 2) continue;
      const rest = t.k.slice(p.length);
      // "الاثنين" with the article is Monday, not two
      if (p.includes("ال") && rest === arFold("اثنين")) return null;
      const d = WORDS.ar.get(rest);
      if (d) return d;
    }
    return null;
  }
  return WORDS[lang].get(t.k.replace(ELISION, "")) ?? null;
}

function lookupUnit(toks: readonly Tok[], i: number, lang: Lang, opts: NumbersOpts): { def: UnitDef; next: number } | null {
  let j = i;
  // at most one filler word between the number and its unit
  if (toks[j] && FILLERS[lang].has(toks[j]!.k.replace(ELISION, "")) && toks[j + 1]) j++;
  const a = toks[j];
  if (!a) return null;
  const b = toks[j + 1];
  if (b) {
    const two = UNITS2[lang].get(`${a.k} ${b.k}`);
    if (two) return { def: two, next: j + 2 };
  }
  const key = lang === "ar" ? a.k : a.k.replace(ELISION, "");
  const one = UNITS[lang].get(key) ?? (lang === "ar" && opts.arabizi ? ARABIZI_UNITS.get(key) : undefined);
  if (one && !one.dual) return { def: one, next: j + 1 };
  if (lang === "ar") {
    for (const p of AR_PREFIXES) {
      if (!key.startsWith(p) || key.length - p.length < 1) continue;
      const d = UNITS.ar.get(key.slice(p.length));
      if (d && !d.dual) return { def: d, next: j + 1 };
    }
  }
  return null;
}

/** A unit noun just before position i ("خطوة واحدة", "ساعة واحدة"): Arabic puts the counted noun first. */
function unitBefore(toks: readonly Tok[], i: number, lang: Lang): UnitDef | null {
  if (lang !== "ar" || i === 0) return null;
  const prev = toks[i - 1]!;
  const d = UNITS.ar.get(prev.k) ?? UNITS.ar.get(prev.k.replace(/^ال/, ""));
  return d && !d.dual ? d : null;
}

function digitValue(raw: string): { value: number; alt?: number } {
  const compact = raw.replace(/[\s\u00A0\u202F]/g, "");
  const m = /^(\d+)[.,](\d+)$/.exec(compact);
  if (m && m[2]!.length === 3 && m[1]!.length <= 3) return { value: Number(m[1]! + m[2]!), alt: Number(`${m[1]}.${m[2]}`) };
  return { value: Number(compact.replace(",", ".")) };
}

/**
 * Every number in `s` for `locale`: digit runs (Arabic-Indic digits included, "1 500" as one), number words and
 * their sequences ("dix-huit", "vingt et un", "quatre-vingt-dix", "one hundred and twenty", "مئة وخمسين"), fractions
 * and multipliers, the Arabic duals, with the unit that follows (or precedes, for Arabic) when there is one.
 */
export function numbersIn(s: string, locale: Locale | string, opts: NumbersOpts = {}): NumberToken[] {
  const lang = langOf(locale);
  const toks = tokenize(s);
  const out: NumberToken[] = [];
  const push = (value: number, def: UnitDef | null, i0: number, i1: number, kind: NumberToken["kind"], alt?: number) => {
    const first = toks[i0]!;
    const last = toks[Math.max(i0, i1 - 1)]!;
    out.push({ value, ...(alt !== undefined ? { alt } : {}), unit: def?.unit ?? null, base: def ? value * def.f : value, raw: s.slice(first.at, last.end), at: first.at, kind });
  };

  for (let i = 0; i < toks.length; i++) {
    const t = toks[i]!;
    // × / x glued to a digit: "x2" is twice
    if ((t.k === "x" || t.k === "×") && toks[i + 1]?.digit && toks[i + 1]!.at === t.end) {
      push(digitValue(toks[i + 1]!.raw).value, { unit: "times", f: 1 }, i, i + 2, "digit");
      i++;
      continue;
    }
    if (t.digit) {
      const { value, alt } = digitValue(t.raw);
      const unit = lookupUnit(toks, i + 1, lang, opts);
      push(value, unit?.def ?? null, i, unit ? unit.next : i + 1, "digit", alt);
      if (unit) i = unit.next - 1;
      continue;
    }
    // an Arabic dual carries its own count
    const dualDef = lang === "ar" ? arDual(t.k) : null;
    if (dualDef) {
      push(2, dualDef, i, i + 1, "word");
      continue;
    }
    const def = lookupWord(t, lang, opts);
    if (!def) continue;
    // "les deux", "tous les deux": both; "entre deux tailles", "between two sizes": an idiom, not a figure
    if (def.v === 2 && def.kind === "num" && ["les", "entre", "between", arFold("بين")].includes(toks[i - 1]?.k ?? "")) continue;

    let value = def.v;
    let j = i + 1;
    if (def.kind === "num" || def.kind === "mult") {
      const seq = sequence(toks, i, lang, opts);
      value = seq.value;
      j = seq.next;
    }
    // an ordinal ranks; the noun after it is not its unit ("le deuxième flacon")
    const unit = def.kind === "rank" ? null : lookupUnit(toks, j, lang, opts);
    let unitDef: UnitDef | null = unit?.def ?? null;
    const single = j === i + 1;
    if (def.needsUnit && single) {
      // an ambiguous word is a number only beside a unit of time; "بنص الثمن": a fraction of the price is a figure
      if (unitDef?.unit !== "time") unitDef = unitBefore(toks, i, lang);
      if (unitDef?.unit !== "time") unitDef = def.kind === "frac" && toks[j] && PRICE_WORDS.has(toks[j]!.k.replace(/^(?:ب|ف|و)?ال/, "")) ? { unit: "ratio", f: 1 } : null;
      if (!unitDef) continue;
    }
    if (!unitDef) {
      if (def.kind === "frac") unitDef = { unit: "ratio", f: 1 };
      else if (def.kind === "times") unitDef = { unit: "times", f: 1 };
      else if (def.kind === "rank") unitDef = { unit: "rank", f: 1 };
    }
    const next = unit ? unit.next : j;
    push(value, unitDef, i, next, "word");
    i = next - 1;
  }
  // a range shares its unit: "24–48h", "2 à 4 jours", "من 2 إلى 4 أيام"
  for (let k = out.length - 2; k >= 0; k--) {
    const a = out[k]!;
    const b = out[k + 1]!;
    if (a.unit || !b.unit || b.value === 0) continue;
    if (!RANGE_GAP.test(asciiDigits(s.normalize("NFC")).slice(a.at + a.raw.length, b.at))) continue;
    const f = b.base / b.value;
    a.unit = b.unit;
    a.base = a.value * f;
  }
  return out;
}

/** what separates the two ends of a range */
const RANGE_GAP = /^\s*(?:-|–|—|\/|à|a|au|to|ou|or|إلى|الى|ل|حتى|و)\s*$/i;

/** "ثمن", "سعر", "prix", "price" (folded, without the article): what a fraction word may be a fraction of */
const PRICE_WORDS: ReadonlySet<string> = new Set([arFold("ثمن"), arFold("تمن"), arFold("سعر"), "prix", "price", "tarif"]);

function arDual(k: string): UnitDef | null {
  for (const p of ["", ...AR_PREFIXES]) {
    if (p && !k.startsWith(p)) continue;
    const d = UNITS.ar.get(k.slice(p.length));
    if (d?.dual) return d;
  }
  return null;
}

/**
 * One number written in words, from toks[i]: "vingt et un", "dix-huit", "quatre-vingt-dix", "cent deux",
 * "one hundred and twenty", "خمسة وعشرين", "مئة وخمسين". A following word that is not smaller starts a new number
 * ("trois quatre" are two), except across a hyphen, a joiner or the Arabic "و".
 */
function sequence(toks: readonly Tok[], i: number, lang: Lang, opts: NumbersOpts): { value: number; next: number } {
  let total = 0;
  let current = 0;
  let lastUnit = Infinity;
  let j = i;
  let joined = false;
  for (;;) {
    const tj = toks[j];
    const dj = tj ? lookupWord(tj, lang, opts) : null;
    if (!tj || !dj || !(dj.kind === "num" || dj.kind === "mult")) break;
    if (j > i) {
      const linked = joined || tj.hyphen || (lang === "ar" && tj.k.startsWith(arFold("و")) && !WORDS.ar.has(tj.k));
      const frVingt = lang === "fr" && (tj.k === "vingt" || tj.k === "vingts") && current > 0 && current < 10;
      if (dj.kind === "num" && !linked && !frVingt && (lang === "ar" || dj.v >= lastUnit)) break;
    }
    if (dj.kind === "mult") {
      current = (current || 1) * dj.v;
      if (dj.v >= 1000) {
        total += current;
        current = 0;
      }
      lastUnit = Infinity;
    } else if (lang === "fr" && (tj.k === "vingt" || tj.k === "vingts") && current > 0 && current < 10 && j > i) {
      current *= 20; // quatre-vingt(s)
      lastUnit = 20;
    } else {
      current += dj.v;
      lastUnit = dj.v;
    }
    j++;
    joined = false;
    const joiner = toks[j];
    const after = toks[j + 1] ? lookupWord(toks[j + 1]!, lang, opts) : null;
    if (joiner && JOINERS[lang].has(joiner.k) && after && (after.kind === "num" || after.kind === "mult")) {
      j++;
      joined = true;
    }
  }
  return { value: total + current, next: Math.max(j, i + 1) };
}

/* ------------------------------------------------------------------ */
/* Allowed numbers                                                     */
/* ------------------------------------------------------------------ */

const EPS = 1e-6;
const close = (a: number, b: number) => Math.abs(a - b) <= EPS * Math.max(1, Math.abs(a), Math.abs(b));

/**
 * The numbers a text may state: every number of the merchant's sources (read in every locale, so a French fact on an
 * Arabic page still counts) plus plain values (the price, `ctx.numbers`) and values with a unit (a policy's 7 days).
 */
export class AllowedNumbers {
  private readonly tokens: { value: number; alt?: number; unit: UnitClass | null; base: number }[] = [];

  /** every number in `text`, read with the fr, en and ar tables (and Arabizi when asked) */
  addText(text: string | number | null | undefined, opts: NumbersOpts = {}): this {
    if (text === null || text === undefined) return this;
    const s = String(text);
    // one reading per position: a locale that sees a unit wins over one that reads a bare number there
    const at = new Map<number, NumberToken[]>();
    for (const l of ["fr", "en", "ar"] as const) for (const t of numbersIn(s, l, { arabizi: true, ...opts })) at.set(t.at, [...(at.get(t.at) ?? []), t]);
    for (const list of at.values()) {
      const withUnit = list.filter((t) => t.unit);
      for (const t of withUnit.length ? withUnit : list.slice(0, 1)) this.tokens.push(t);
    }
    return this;
  }

  /** one value; with a unit class and the factor of its unit (days → 1440) it also allows that duration in other units */
  addValue(value: number | string, unit: UnitClass | null = null, factor = 1): this {
    const v = typeof value === "number" ? value : Number(String(value).replace(",", "."));
    if (Number.isFinite(v)) this.tokens.push({ value: v, unit, base: unit ? v * factor : v });
    return this;
  }

  /** same class and same base value; or the same value when one side has no unit */
  allows(t: Pick<NumberToken, "value" | "alt" | "unit" | "base">): boolean {
    const values = t.alt === undefined ? [t.value] : [t.value, t.alt];
    return this.tokens.some((a) => {
      if (a.unit && t.unit) return a.unit === t.unit && (close(a.base, t.base) || (t.alt !== undefined && close(a.base, (t.base / t.value) * t.alt)));
      const av = a.alt === undefined ? [a.value] : [a.value, a.alt];
      return values.some((v) => av.some((x) => close(v, x)));
    });
  }

  get size(): number {
    return this.tokens.length;
  }
}

/** The day, hour and month factors of the base unit, for policy values ("returns within 7 days"). */
export const TIME_FACTOR = { minute: MIN, hour: HOUR, day: DAY, week: WEEK, month: MONTH, year: YEAR } as const;
