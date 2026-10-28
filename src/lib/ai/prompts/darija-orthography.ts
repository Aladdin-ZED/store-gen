/**
 * The Darija orthography guide (P7 AI; ai.md AI-§F.2, rev 3 QUAL-30). Arabic-script Darija has no standard spelling,
 * so the prompts, the copy library and the detectors agree on one: one spelling per word for the ≈ 300 Darija words
 * the library, the CTAs and the call scripts use, the words that stay MSA even at `darija: light`, the Latin-script
 * (Arabizi) table used only when the owner asked for Arabizi, and the register rules.
 *
 *   lintDarija("صيفط الطلب دابا")      → [{ kind: "spelling", word: "صيفط", canonical: "سيفط", at: 0 }]
 *   normalizeDarija("صيفط الطلب")      → "سيفط الطلب"   (the guard's fix for model output; the library is linted, never rewritten)
 *
 * The guide is a prompt artifact: `DARIJA_GUIDE_VERSION` joins the copy prompt families' version hash (step 4), so an
 * edit is a prompt version; the native Darija reviewer of the calibration slice owns the edits. `test:ai` lints the
 * library's ar lines with `lintDarija` (a Darija word spelled outside the guide fails). The guide's words are Arabic
 * script, so the language-purity rule counts them as Arabic.
 *
 * Pure and isomorphic.
 */

export const DARIJA_GUIDE_VERSION = "dg1";

/**
 * canonical | variants (comma-separated: spellings the guide refuses) | gloss. Variants are never MSA words, so the
 * lint cannot flag a correct MSA line (زوج, ثلاثة, مئة, أربعة, حيث … stay out of the variant column).
 */
const TABLE = `
# particles, adverbs, questions
دابا | دبا, داب | now
بزاف | بزااف, بالزاف, بزاااف | a lot
واخا | وخا, واخة | okay
شحال | شحالة, شحل | how much
بشحال | بشحالة | for how much
غادي | غدي | going to
غادية | غدية | going to (f.)
كاين | كاينة, كين | there is
كاينين | كاينيين | there are
ماكاينش | ما كاينش, ماكينش, مكاينش | there is not
واش | واشش | question particle
علاش | علاه | why
فين | فاين | where
منين | مناين | from where, when
كيفاش | كيفش, كيفاه | how
إمتى | امتى, إيمتى, امتا, إمتا | when
شنو | اشنو, آشنو, شنوا, شنوة | what
شكون | شكوون, اشكون | who
شي | شيي | some
والو | والوو, والوا | nothing
ديما | ديمة, ديمان, دايما | always
مازال | مزال | still
بعدا | بعدة | anyway
صافي | صافيي | enough, done
يالاه | يلاه | let's go
ياك | ياكك | right?
راه | راهو | indeed, he is
راني | رانيي | I am
راك | راكك | you are
راكي | راكيي | you are (f.)
راها | راهى | she is
راهوم | راهم | they are
هاكا | هكا, هاكة | like this
هاكاك | هكاك, هاكاكا | like that
بحال | بحالل | like
شوية | شويا, شويه | a little
دغيا | دغية, دغيه | quickly
بالزربة | بالزربا, بزربة | in a hurry
باش | بش | so that
فاش | فاشش | when
ملي | مللي, ميلي | when, since
حيت | حييت | because
من بعد | منبعد | after, later
عاد | عادد | just
تما | تمة, تماك | there
هنايا | هنايه | right here
ماشي | ماشيي | not
بلاصة | بلاصا, بلاسة | place
نيشان | نيشانن | straight
ديريكت | ديركت, ديريكط | directly
كلشي | كل شي, كولشي | everything
حتى حاجة | حتى حاجه | anything
حتى واحد | حتى وحد | nobody
بلاما | بلا ما | without
غير | غيير | only
ولا | ولاا | or
بلا | بلاا | without
كيداير | كي داير | how are you
كيدايرة | كي دايرة | how are you (f.)
طوب | طووب | great
# pronouns, possessives
نتا | انتا, إنتا | you (m.)
نتي | انتي, إنتي | you (f.)
حنا | احنا, إحنا | we
نتوما | انتوما, نتومة | you (pl.)
هوما | هومة | they
ديال | ذيال, ديآل | of
ديالي | ذيالي | mine
ديالك | ذيالك | yours
ديالو | ذيالو, ديالوا | his
ديالها | ذيالها | hers
ديالنا | ذيالنا | ours
ديالكم | ذيالكم | yours (pl.)
ديالهم | ذيالهم | theirs
ليا | ليي | to me
ليك | ليكك | to you
ليها | ليهاا | to her
لينا | ليناا | to us
ليكم | ليكوم | to you (pl.)
ليهم | ليهوم | to them
معايا | معايه | with me
معاك | معاكك | with you
معاه | معاهو | with him
معاها | معاهاا | with her
معانا | معانه | with us
معاكم | معاكوم | with you (pl.)
عندو | عندوو | he has
عندها | عندهاا | she has
بيا | بييا | with me
بيك | بييك | with you
فيا | فييا | in me
هاد | هاذ | this
هادي | هاذي | this (f.)
هادا | هاذا | this (m.)
هادو | هاذو | these
هاداك | هاذاك | that one
هاديك | هاذيك | that one (f.)
هادوك | هاذوك | those
داك | داكك | that
ديك | ديكك | that (f.)
دوك | دوكك | those
# verbs
بغيت | بغييت | I want
بغيتي | بغيتيي | you want
بغا | بغاا | he wants
بغات | بغاتت | she wants
بغينا | بغيناا | we want
بغيتو | بغيتوا | you want (pl.)
كنبغي | كانبغي | I like
كتبغي | كاتبغي | you like
كيبغي | كايبغي | he likes
سيفط | صيفط, سيفت, صيفت | send
سيفطو | صيفطو, سيفطوا | send (pl.)
سيفطي | صيفطي | send (f.)
نسيفطو | نصيفطو, نسيفطوا | we send
كنسيفطو | كنصيفطو, كانسيفطو | we send (habit)
غنسيفطو | غنصيفطو | we will send
عيط | عي\u0651ط | call
عيطي | عيطيي | call (f.)
عيطو | عيطوا | call (pl.)
نعيط | نعيطط | I call
نعيطو | نعيطوا | we call
كنعيطو | كانعيطو, كنعيطوا | we call (habit)
غنعيطو | غانعيطو | we will call
نتصلو | نتاصلو, نتصلوا | we contact
كنتصلو | كانتصلو | we contact (habit)
خلي | خللي | leave
خليك | خليكك | stay
خلينا | خليناا | let us
خليني | خلينيي | let me
دير | ديير | do
ديري | ديريي | do (f.)
ديرو | ديروا | do (pl.)
ندير | نديير | I do
نديرو | نديروا | we do
جيب | جييب | bring
جيبو | جيبوا | bring (pl.)
شوف | شووف | look
شوفي | شوفيي | look (f.)
شوفو | شوفوا | look (pl.)
نشوفو | نشوفوا | we see
قول | قوول | say
قولي | قوليي | say (f.)
قوليا | قولييا | tell me
عطيني | اعطيني | give me
عطيه | اعطيه | give him
خود | خوذ | take
خودي | خوذي | take (f.)
خودو | خوذو, خودوا | take (pl.)
جربي | جربيي | try (f.)
جربو | جربوا | try (pl.)
كمل | كممل | complete
كملي | كمليي | complete (f.)
كيوصل | كايوصل | arrives
كيوصلك | كايوصلك | it reaches you
غيوصلك | غايوصلك, غادي يوصلك | it will reach you
توصلك | توصلكك | reaches you
نوصلو | نوصلوا | we deliver
خلص | خل\u0651ص | pay
خلصي | خلصيي | pay (f.)
كتخلص | كاتخلص | you pay
كتخلصي | كاتخلصي | you pay (f.)
تخلص | تخلصص | you pay
نخلصو | نخلصوا | we pay
شري | شريي | buy
شرا | شراا | he bought
نشري | نشريي | I buy
كنشري | كانشري | I buy (habit)
كتشري | كاتشري | you buy
عجبني | عجبنيي | I liked it
عجبك | عجبكك | you liked it
كيعجبك | كايعجبك | you like it
فهمتك | فهمتكك | I understand you
سمح ليا | سمحلي | excuse me
عافاك | عفاك, عافك | please
تقدر | تقدرر | you can
نقدر | نقدرر | I can
بقا | بقاا | he stayed
كاين شي | كاينشي | is there any
عاود | عاوود | repeat
نعاود | نعاوود | I repeat
تأكد | تأكدد | it is confirmed
نأكدو | ناكدو | we confirm
مشا | مشاا | he went
جا | جاا | he came
كيجي | كايجي | comes
غيجي | غايجي | will come
كتلبس | كاتلبس | you wear
كيدوم | كايدوم | it lasts
كيبان | كايبان | it looks
كيبانو | كايبانو | they look
# time
نهار | نهارر | day
ليوم | ليومم | today
البارح | لبارح | yesterday
غدا | غدى | tomorrow
عشية | العشيا | afternoon
فالصباح | فصباح | in the morning
فالليل | فليل | at night
بكري | بكريي | early
معطل | معطلل | late
سيمانة | سمانة, سيمانا | week
سيمانات | سمانات | weeks
دقايق | دقايقق | minutes
سوايع | سوايعع | hours
# commerce and objects
كوموند | كومند, كوماند | order
الكوموند | الكومند, الكوماند | the order
كولي | كوليه, كولية | parcel
الكولي | الكوليه, الكولية | the parcel
ليفرور | ليفروور, لفرور | courier
الليفرور | الليفروور, اللفرور | the courier
ليفريزون | ليفرزون, لافريزون | delivery
لاكارط | لاكارت | card
بورطابل | پورطابل, بورتابل | mobile phone
تيليفون | تلفون, تليفون | phone
نمرة | نمره | number
النمرة | النمره | the number
الحومة | الحوما | the neighbourhood
حومة | حوما | neighbourhood
طوموبيل | طونوبيل, طوموبيلة, طاموبيل | car
كريدي | كريديت | credit
فلوس | فلووس | money
الصرف | الصرفف | change
صولد | سولد | sale
بروموسيون | برومسيون, بروموسيو | promotion
كادو | كادوو, كدو | gift
الكادو | الكدو | the gift
حاجة | حاجه | thing
سلعة | سلعه | goods
السلعة | السلعه | the goods
موديل | موديلل | model
صاك | ساك | bag
الصاك | الساك | the bag
سبرديلة | صبرديلة, سبرديلا | sneaker
تريكو | تريكوو | sweater
جلابة | جلابه | djellaba
تكشيطة | تكشيطه | takchita
بلغة | بلغه | babouche
ماكلة | ماكله | food
باليزا | باليزه | suitcase
مانطو | مونطو | coat
كاشكول | كاشكوول | scarf
ولاد | ولااد | kids
دراري | دراريي | kids
راجل | راجلل | man
صاحبي | صاحبيي | my friend
خويا | خوييا | my brother
ختي | ختيي | my sister
لالة | لالا | madam
زربة | زربه | hurry
# adjectives
مزيان | مزيين | good
مزيانة | مزيينة | good (f.)
مزيانين | مزيينين | good (pl.)
زوين | زويين | beautiful
زوينة | زويينة | beautiful (f.)
واعر | واعرر | great
واعرة | واعرا | great (f.)
خايب | خايبب | bad
فابور | فابوور, فبور | free
رخيص | رخييص | cheap
غالي | غاليي | expensive
قاصح | قاسح | hard
تقيل | تقييل | heavy
صغيور | صغيوور | small
سخون | سخوون | hot
فرحان | فرحانن | happy
عيان | عيانن | tired
مقلق | مقلقق | annoyed
نقي | نقيي | clean
جديد | جدييد | new
كامل | كاملل | whole
# numerals (guard rule 5)
جوج | جوجج | two
تلاتة | تلاثة, تلاتا | three
ربعة | ربعه | four
تمنية | تمانية, تمنيا | eight
حداش | احداش, حضاش | eleven
طناش | اطناش, ثناش | twelve
تلطاش | تلتاش | thirteen
ربعطاش | ربعتاش | fourteen
خمسطاش | خمستاش | fifteen
سطاش | ستاش | sixteen
سبعطاش | سبعتاش | seventeen
تمنطاش | تمنتاش | eighteen
تسعطاش | تسعتاش | nineteen
تلاتين | تلاثين | thirty
ربعين | ربعيين | forty
تمانين | تمنين | eighty
مية | ميا | hundred
ميتين | ميتاين | two hundred
نص | نوص | half
# CTA and courtesy stock
سيفط الطلب | صيفط الطلب | send the order
بغيت نطلب | بغيت نتطلب | I want to order
اطلب دابا | اطلب داب | order now
خليك معنا | خليك معانا | stay with us
كمل الطلب | كمل الطلبب | finish the order
سولنا | سولونا | ask us
ما تفوتش | ماتفوتش | don't miss it
ما تخافش | ماتخافش | don't worry
ماكاين مشكل | ما كاين مشكل | no problem
ماشي مشكل | ماشي مشكيل | no problem
بالصحة | بالصحا | enjoy
الله يعطيك الصحة | الله يعطيك الصحا | thank you
مرحبا بيك | مرحبا بيكك | welcome
لاباس | لا باس | fine
لاباس عليك | لا باس عليك | how are you
نهارك مبروك | نهارك مبروكك | have a good day
تبارك الله | تبارك اللاه | well done
إن شاء الله | انشالله, إنشالله | God willing
`;

export interface DarijaWord {
  canonical: string;
  variants: readonly string[];
  gloss: string;
}

/** The guide, parsed once. */
export const DARIJA_WORDS: readonly DarijaWord[] = TABLE.split("\n")
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("#"))
  .map((l) => {
    const [canonical, variants, gloss] = l.split("|").map((x) => x.trim()) as [string, string, string];
    return { canonical, variants: variants.split(",").map((v) => v.trim()).filter((v) => v && v !== canonical), gloss };
  });

/** Words that stay MSA even at `darija: light`: prices, policies and legal lines (AI-§F.2). */
export const MSA_KEPT: readonly string[] = [
  "الدفع عند الاستلام", "درهم", "الثمن", "السعر", "المجموع", "التوصيل", "الشحن", "رسوم التوصيل", "الضمان", "الإرجاع", "الاسترجاع", "الاستبدال", "الاسترداد", "الشروط", "شروط الاستعمال", "سياسة الخصوصية", "الخصوصية", "المعاينة", "الفاتورة", "الطلبية", "العنوان", "المدينة", "الحي", "الهاتف", "رقم الهاتف", "الكمية", "المقاس", "اللون", "الإشعارات القانونية", "البيانات الشخصية",
];

/** Arabizi spellings, used only when the owner asked for Arabizi (`voice` allows it). */
export const ARABIZI: Readonly<Record<string, string>> = {
  دابا: "daba", بزاف: "bzaf", واخا: "wakha", شحال: "ch7al", غادي: "ghadi", كاين: "kayn", ماكاينش: "makaynch", واش: "wach", علاش: "3lach", فين: "fin", كيفاش: "kifach", إمتى: "imta", شنو: "chno", والو: "walo", ديما: "dima", مزيان: "mzyan", زوين: "zwin", فابور: "fabor", شوية: "chwiya", بغيت: "bghit", سيفط: "sift", عيط: "3iyet", ديال: "dyal", باش: "bach", حيت: "7it", ملي: "melli", دغيا: "dghya", بحال: "b7al", هاد: "had", هادي: "hadi", نتا: "nta", نتي: "nti", حنا: "7na", صافي: "safi", يالاه: "yallah", راه: "rah", خليك: "khellik", نهار: "nhar", سيمانة: "simana", عافاك: "3afak", لاباس: "labas", جوج: "jouj", تلاتة: "tlata", ربعة: "rb3a", خمسة: "khamsa", ستة: "stta", سبعة: "sb3a", تمنية: "tmnya", تسعة: "ts3a", عشرة: "3chra", عشرين: "3chrin", مية: "mya", ألف: "alf", نص: "nss", كوموند: "commande", كولي: "colis", ليفرور: "livreur",
};

/** Forms of other dialects the register rules refuse (Egyptian, Gulf, Levantine): a field carrying one is rejected. */
export const DIALECT_MARKERS: readonly { word: string; dialect: "egyptian" | "gulf" | "levantine" }[] = [
  ...["عايز", "عايزة", "عاوز", "عاوزة", "دلوقتي", "دلوقت", "كده", "كدا", "ازيك", "إزيك", "ازاي", "إزاي", "بتاع", "بتاعك", "بتاعتك", "بتاعي", "أوي", "اوي", "مفيش", "ايوه", "أيوه", "ده", "علشان", "عشان"].map((word) => ({ word, dialect: "egyptian" as const })),
  ...["وايد", "شلون", "شلونك", "هالحين", "جذي", "أبغى", "ابغى", "يبغى", "وش", "مب", "زلمة"].map((word) => ({ word, dialect: "gulf" as const })),
  ...["هلق", "هلأ", "شو", "كتير", "منيح", "هيك", "بدي", "بدك"].map((word) => ({ word, dialect: "levantine" as const })),
];

/** The register rules, as the prompt states them (AI-§F.2). */
export const DARIJA_REGISTER_RULES: readonly string[] = [
  "One spelling per Darija word: the guide's (كاين, دابا, بزاف, واخا, شحال, غادي, ديال).",
  "No vowel marks on Darija words.",
  "No Egyptian, Gulf or Levantine forms (عايز, دلوقتي, كده, وايد, شلون, شو, كتير).",
  "French loanwords in Arabic script only when common: كوموند, كولي, ليفرور, طوموبيل, كريدي, بورطابل.",
  "Prices, policies and legal lines stay in Modern Standard Arabic.",
  "Latin-script Darija (Arabizi) only when the owner asked for it.",
];

/* ------------------------------------------------------------------ */
/* Lint                                                                */
/* ------------------------------------------------------------------ */

const MARKS = /[\u064B-\u065F\u0670]/g;
const TATWEEL = /\u0640/g;
const ARABIC_RUN = /[ؠ-ي\u064B-\u065F\u0670-ۓ\u0640]+/g;

const strip = (s: string) => s.replace(MARKS, "").replace(TATWEEL, "");

const CANONICAL: ReadonlySet<string> = new Set(DARIJA_WORDS.map((w) => w.canonical));
/** one-word variants of one-word entries (a phrase entry's one-word variants are not spellings of a word) */
const VARIANT_TO_CANONICAL: ReadonlyMap<string, string> = new Map(
  DARIJA_WORDS.filter((w) => !w.canonical.includes(" ")).flatMap(({ canonical, variants }) => variants.filter((v) => !v.includes(" ")).map((v) => [v, canonical] as const)),
);
const PHRASES: readonly { re: RegExp; canonical: string; variant: string }[] = DARIJA_WORDS.flatMap(({ canonical, variants }) =>
  variants.filter((v) => v.includes(" ")).map((v) => ({ re: new RegExp(`(?<![\\p{L}])${v.replace(/ /g, "\\s+")}(?![\\p{L}])`, "gu"), canonical, variant: v })),
);
// a phrase variant whose words are all canonical words of their own ("بغيت نطلب" vs "بغيت نتطلب") stays a phrase hit
const DIALECT = new Map(DIALECT_MARKERS.map((d) => [d.word, d.dialect]));

export interface DarijaHit {
  kind: "spelling" | "dialect" | "vowel_marks";
  /** the word as written */
  word: string;
  /** the guide's spelling (spelling, vowel_marks) */
  canonical?: string;
  dialect?: "egyptian" | "gulf" | "levantine";
  at: number;
}

/** A one-letter conjunction or preposition glued to a word: و، ف، ب، ل. */
const PROCLITIC = /^([وفبل])(.{2,})$/u;

function lookup(word: string): { canonical: string; prefix: string } | null {
  const direct = VARIANT_TO_CANONICAL.get(word);
  if (direct) return { canonical: direct, prefix: "" };
  const m = PROCLITIC.exec(word);
  if (m && !CANONICAL.has(word)) {
    const c = VARIANT_TO_CANONICAL.get(m[2]!);
    if (c) return { canonical: c, prefix: m[1]! };
  }
  return null;
}

/**
 * Darija words written outside the guide (a variant spelling, or vowel marks on a guide word) and forms of other
 * dialects. MSA words are never judged: the guide only knows Darija words, and no variant is an MSA spelling.
 */
export function lintDarija(text: string): DarijaHit[] {
  const hits: DarijaHit[] = [];
  for (const m of text.matchAll(ARABIC_RUN)) {
    const raw = m[0];
    const word = strip(raw);
    const at = m.index;
    const found = lookup(word);
    if (found) hits.push({ kind: "spelling", word: raw, canonical: found.prefix + found.canonical, at });
    else if (raw !== word && (CANONICAL.has(word) || CANONICAL.has(word.replace(PROCLITIC, "$2")))) hits.push({ kind: "vowel_marks", word: raw, canonical: word, at });
    const dialect = DIALECT.get(word) ?? DIALECT.get(word.replace(PROCLITIC, "$2"));
    if (dialect) hits.push({ kind: "dialect", word: raw, dialect, at });
  }
  const plain = strip(text);
  for (const p of PHRASES) for (const m of plain.matchAll(p.re)) hits.push({ kind: "spelling", word: m[0], canonical: p.canonical, at: m.index });
  return hits.sort((a, b) => a.at - b.at);
}

/** Rewrites the guide's variant spellings and vowel-marked guide words to the canonical spelling (model output only). */
export function normalizeDarija(text: string): string {
  let out = text.replace(ARABIC_RUN, (raw) => {
    const word = strip(raw);
    const found = lookup(word);
    if (found) return found.prefix + found.canonical;
    return raw !== word && (CANONICAL.has(word) || CANONICAL.has(word.replace(PROCLITIC, "$2"))) ? word : raw;
  });
  for (const p of PHRASES) out = out.replace(p.re, p.canonical);
  return out;
}
