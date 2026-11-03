/**
 * Copy library self-test:  npx tsx src/lib/ai/copy-library/selftest.ts
 *
 *   - family choice: modest wear (abaya, prayer dress or set, hijab, khimar, djellaba, kaftan; women
 *     and girls) gets the modest family and the right facets, from the category and the product's
 *     words; accessories, men's pieces and other garments keep their own family;
 *   - every family × facet combination × locale × WhatsApp state × a few seeds is a valid PageCopy,
 *     with no truncated line (every alternative fits its field), no unfilled slot or {wa:} block, no
 *     exclamation mark, one *emphasis* at most per headline;
 *   - without a WhatsApp number no line names WhatsApp; with one, the lines may;
 *   - no "your copy awaits" / "I want it" calls to action, and modest pages use the calm voice;
 *   - French typography: no-break space before ? ! : ; and typographic apostrophes;
 *   - icons: no jewel icon on a lace / embroidery benefit; the announcement and guarantee lines get
 *     distinct icons from the generator (copy-map iconsForLines);
 *   - DG-07 (design.md DES-§9.5, §9.12, §23.3): 0 em / en dashes in the library files; every hero title tagged, ≥ 3
 *     structures per family × locale; ≥ 24 skeletons per family × locale; every French template with the product
 *     slot rendered against the four ProductRef shapes with 0 article faults; no ar FAQ pair breaking its register;
 *     no stats renderer reading the figure tables (DS42).
 * Exits 1 on any failure.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { articleFaults, registerOf } from "@/lib/design/cliche";
import { skeletonCount } from "@/lib/design/copy-gen";
import { iconsForLines, TEXTILE_ORNAMENT } from "@/lib/generator/copy-map";
import { PRODUCT_CATEGORIES, type Locale, type ProductCategory } from "@/lib/page/schema";
import { PageCopy } from "../copy-schema";
import { copyFamily, fill, frTemplate, libraryCopy, libraryFor, lineTag, lineText, typeset, FACETS, FAMILIES, WORD_FAMILIES, type Facet, type Family, type Line } from "./index";
import { GENDER_LEXICON_SIZE, productRef, REF_SHAPES } from "./product-ref";
import type { FamilyCopy } from "./types";

let failures = 0;
const check = (ok: boolean, msg: string) => {
  if (!ok) {
    failures++;
    console.error(`  ✗ ${msg}`);
  }
};

const LOCALES = ["ar", "fr", "en"] as const;

/* 1. family choice */
const CASES: [name: string, category: ProductCategory, keywords: string, family: Family, facets: Facet[]][] = [
  ["Abaya de prière avec Dentelle", "kids", "", "modest", ["prayer", "girls", "lace"]],
  ["Abaya de prière avec Dentelle", "fashion", "", "modest", ["prayer", "lace"]],
  ["Abaya de prière en dentelle beige pour fille", "kids", "Tailles 4 à 12 ans", "modest", ["prayer", "girls", "lace"]],
  ["عباية صلاة بالدانتيل للبنات - بيج", "kids", "", "modest", ["prayer", "girls", "lace"]],
  ["Girls' lace prayer abaya", "fashion", "", "modest", ["prayer", "girls", "lace"]],
  ["Robe de prière deux pièces", "fashion", "", "modest", ["prayer"]],
  ["Ensemble de prière avec jupe", "other", "", "modest", ["prayer"]],
  ["طقم صلاة نسائي", "fashion", "", "modest", ["prayer"]],
  ["إسدال صلاة للبنات", "kids", "", "modest", ["prayer", "girls"]],
  ["Hijab en mousseline", "fashion", "", "modest", ["veil"]],
  ["Khimar long", "fashion", "", "modest", ["veil"]],
  ["Abaya + hijab assorti", "fashion", "", "modest", []],
  ["Djellaba femme brodée", "traditional", "", "modest", []],
  ["Caftan marocain velours", "traditional", "", "modest", []],
  ["Takchita mariage", "fashion", "", "modest", []],
  ["Djellaba enfant", "kids", "", "modest", ["kids"]],
  ["Modest dress with long sleeves", "fashion", "", "modest", []],
  ["Burkini", "sport", "", "modest", []],
  ["Abaya rose bébé", "fashion", "", "modest", []],
  ["Hijab jersey baby blue", "fashion", "", "modest", ["veil"]],
  ["خمار طويل للصلاة", "fashion", "", "modest", ["prayer", "veil"]],
  // other families stay theirs
  ["Djellaba homme", "traditional", "", "fashion", []],
  ["Jabador garçon", "kids", "", "fashion", []],
  ["Épingles pour hijab", "fashion", "", "fashion", []],
  ["Épingles pour hijab", "jewelry", "", "jewelry", []],
  ["Tapis de prière moelleux", "home", "", "home", []],
  ["Tapis de prière enfant", "kids", "", "kids", []],
  ["Robe de soirée", "fashion", "", "fashion", []],
  ["Pyjama fille", "kids", "", "fashion", []],
  ["Puzzle 100 pièces", "kids", "", "kids", []],
  ["Miel de thym", "organic-food", "", "terroir", []],
  ["Sérum Argan", "skincare", "", "skincare", []],
  ["Coffret Ramadan", "other", "", "general", []],
];
for (const [name, category, keywords, family, facets] of CASES) {
  const got = copyFamily({ category, productName: name, keywords });
  check(got.family === family && got.facets.join(",") === facets.join(","), `copyFamily("${name}", ${category}) = ${got.family} [${got.facets}], want ${family} [${facets}]`);
}

/* 2. every family / facet / locale / WhatsApp state */
const PRODUCTS: Record<string, [ProductCategory, string]> = {
  modest: ["fashion", "Abaya"],
  "modest+prayer": ["fashion", "Robe de prière"],
  "modest+girls": ["kids", "Abaya fille"],
  "modest+kids": ["kids", "Djellaba enfant"],
  "modest+lace": ["fashion", "Abaya en dentelle"],
  "modest+veil": ["fashion", "Hijab"],
  "modest+prayer+girls+lace": ["kids", "Abaya de prière avec Dentelle"],
  "modest+prayer+girls+veil": ["kids", "Voile de prière fille"],
};
const WA = /whats\s?app|واتساب|واتس اب/i;
const AWAITS = /vous attend|is waiting|في انتظارك|je le veux|i want it|أريد طلبه/i;
const LONG_NAME = "Produit d'essai très long avec un nom interminable pour tester les limites";

/** Every string of a PageCopy (with its path). */
function strings(v: unknown, path = ""): [string, string][] {
  if (typeof v === "string") return [[path, v]];
  if (Array.isArray(v)) return v.flatMap((x, i) => strings(x, `${path}[${i}]`));
  if (v && typeof v === "object") return Object.entries(v).flatMap(([k, x]) => strings(x, path ? `${path}.${k}` : k));
  return [];
}

let combos = 0;
const run = (label: string, category: ProductCategory, name: string, locale: Locale, wa: boolean, seed: number, productName = name) => {
  let c: PageCopy;
  try {
    c = libraryCopy({ category, locale, seed, productName, keywords: name === productName ? "" : name, market: "MA", hasWhatsapp: wa });
  } catch (e) {
    check(false, `${label}/${locale}/${wa ? "wa" : "no-wa"}/${seed}: ${String(e).slice(0, 300)}`);
    return;
  }
  combos++;
  const where = `${label}/${locale}/${wa ? "wa" : "no-wa"}/${seed}`;
  const all = strings(c);
  for (const [path, s] of all) {
    // lines carrying the product name are the merchant's words (and cut by design in the kicker
    // and SEO title): only the library's own text must fit untouched and be typeset
    const named = s.includes(productName.slice(0, 12));
    if (!named) check(!s.endsWith("…"), `${where}: truncated ${path}: "${s}"`);
    check(!/\{(product|delivery|where)\}|\{wa:/.test(s), `${where}: unfilled slot in ${path}: "${s}"`);
    check(!s.includes("!"), `${where}: exclamation mark in ${path}`);
    check(s === s.trim() && !/ {2}/.test(s), `${where}: stray spaces in ${path}: "${s}"`);
    if (!wa) check(!WA.test(s) || path.startsWith("whatsapp."), `${where}: WhatsApp named without a number in ${path}: "${s}"`);
    check(!AWAITS.test(s), `${where}: "awaits / I want it" call to action in ${path}: "${s}"`);
    if (locale === "fr") check(!/ [?!:;]/.test(s), `${where}: breaking space before punctuation in ${path}: "${s}"`);
    if ((locale === "fr" || locale === "en") && !named) check(!/\p{L}'\p{L}/u.test(s), `${where}: straight apostrophe in ${path}: "${s}"`);
  }
  check(((c.hero.headline.match(/\*/g) ?? []).length) <= 2, `${where}: more than one emphasis in the headline`);
  check(c.faq.items.length >= 5, `${where}: FAQ too short`);
  check(c.benefits.items.length >= 4 && new Set(c.benefits.items.map((b) => b.title)).size === c.benefits.items.length, `${where}: benefits repeat or too few`);
  if (label.startsWith("modest")) {
    const calm = { ar: /^اطلب الآن/, fr: /^(Commander|Je commande)$/, en: /^Order now$/ }[locale as "ar" | "fr" | "en"];
    check(calm.test(c.hero.cta) && calm.test(c.cta.button) && calm.test(c.sticky.label), `${where}: modest voice not used (${c.hero.cta} / ${c.cta.button} / ${c.sticky.label})`);
    // the size question always shows on a garment page
    check(c.faq.items.some((f) => /taille|size|مقاس|porter|wear|يُلبس/i.test(f.q)), `${where}: no size / wear question in the FAQ`);
  }
  if (label.includes("girls")) check(/fille|daughter|ابنتي/.test(JSON.stringify(c.faq.items)), `${where}: no girls' size question`);
  if (label.includes("lace")) check(c.benefits.items.some((b) => /dentelle|lace|دانتيل/i.test(b.title)), `${where}: no lace benefit`);
  // lace and embroidery are a textile motif: never the jewel icon
  for (const b of c.benefits.items) check(!(b.icon === "gem" && TEXTILE_ORNAMENT.test(`${b.title} ${b.text}`)), `${where}: gem icon on a textile benefit ("${b.title}")`);
  // the reassurance lists show each icon once (the generator assigns them: two cash icons side by side read as a glitch)
  for (const [list, lines] of [["announcement", c.announcement], ["guarantee", c.guarantee.lines]] as const) {
    const icons = iconsForLines(lines);
    if (lines.length <= 4) check(new Set(icons).size === icons.length, `${where}: repeated ${list} icon (${icons.join(", ")})`);
  }
  check((c.hero.kicker.match(/prière|prayer|صلاة/giu) ?? []).length <= 1, `${where}: the kicker repeats the name ("${c.hero.kicker}")`);
  if (label.includes("prayer")) check(c.benefits.items.some((b) => /mouvement|movement|حركة/.test(b.title)), `${where}: no prayer-comfort benefit`);
};

for (const locale of LOCALES) {
  for (const wa of [false, true]) {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      for (const cat of PRODUCT_CATEGORIES) run(cat, cat, "Produit", locale, wa, seed, seed === 1 ? LONG_NAME : "Produit");
      for (const [label, [cat, name]] of Object.entries(PRODUCTS)) run(label, cat, name, locale, wa, seed);
    }
  }
}

/* 3. every family exists in every locale, facets too, and every alternative is used somewhere */
const ALL_FAMILIES = [...FAMILIES, ...WORD_FAMILIES];
for (const locale of LOCALES) {
  const lib = libraryFor(locale);
  for (const f of ALL_FAMILIES) {
    const fam: FamilyCopy | undefined = lib.families[f];
    check(!!fam, `${locale}: family ${f} missing`);
    if (!fam) continue;
    check(fam.headline.every((h) => (lineText(h).match(/\*/g) ?? []).length === 2), `${locale}/${f}: a headline without exactly one *emphasis*`);
    if (locale === "ar") check(fam.solution.every((s) => !/\*\{product\}\*/.test(s)), `${locale}/${f}: emphasis around {product} (reverses Latin names on RTL pages)`);
  }
  for (const facet of FACETS) check(!!lib.families.modest.facets?.[facet], `${locale}: modest facet ${facet} missing`);
}
// every alternative fits its field (libraryCopy skips one that does not: it would never be seen)
{
  const LIMITS: Record<string, number> = {
    kicker: 60, headline: 110, sub: 220, bigWord: 16, tagline: 90, benefitsTitle: 110, problemTitle: 110, solution: 190,
    showcaseTitle: 110, stepsTitle: 110, marquee: 28, heroCta: 40, ctaTitle: 110, ctaButton: 40, sticky: 36,
  };
  const ITEM_LIMITS: Record<string, Record<string, number>> = {
    benefits: { title: 60, text: 200 },
    steps: { title: 60, text: 170 },
    faq: { q: 110, a: 320 },
    pains: { pain: 110, fix: 110 },
    comparison: { label: 70, us: 60, them: 60 },
    story: { title: 110, text: 700 },
  };
  for (const locale of LOCALES) {
    for (const wa of [false, true]) {
      const slots = { product: "Abaya de prière", delivery: "Livraison 24-48h partout au Maroc", where: "partout au Maroc", whatsapp: wa };
      const size = (s: string) => fill(typeset(locale, s), slots).length;
      for (const f of [...FAMILIES, ...WORD_FAMILIES]) {
        const fam = libraryFor(locale).families[f];
        const blocks: [string, Record<string, unknown>][] = [[f, fam as unknown as Record<string, unknown>], [`${f}.voice`, (fam.voice ?? {}) as Record<string, unknown>]];
        for (const [k, facet] of Object.entries(fam.facets ?? {})) blocks.push([`${f}.${k}`, facet as Record<string, unknown>]);
        for (const [label, block] of blocks) {
          for (const [key, value] of Object.entries(block)) {
            if (!Array.isArray(value)) continue;
            if (LIMITS[key]) for (const s of (value as Line[]).map(lineText)) check(size(s) <= LIMITS[key]!, `${locale}/${label}.${key} (${wa ? "wa" : "no-wa"}) over ${LIMITS[key]}: "${s}"`);
            const lim = ITEM_LIMITS[key];
            if (lim) for (const item of value as Record<string, string>[]) for (const [field, max] of Object.entries(lim)) check(size(item[field] ?? "") <= max, `${locale}/${label}.${key}.${field} (${wa ? "wa" : "no-wa"}) over ${max}: "${item[field]}"`);
          }
        }
      }
    }
  }
}
// the three locales describe the same facets with the same topics
const topics = (l: Locale) =>
  JSON.stringify(
    Object.entries(libraryFor(l).families.modest.facets ?? {}).map(([k, f]) => [k, (f.benefits ?? []).map((b) => b.topic), (f.faq ?? []).map((q) => q.topic), (f.comparison ?? []).map((r) => r.topic)]),
  );
check(topics("ar") === topics("fr") && topics("fr") === topics("en"), "modest facets differ between locales");

/* 4. DG-07 (design.md DES-§9.5, §9.12, §23.3): dashes, tags, structures, skeletons, French articles, stats, registers */
const LIBRARY_FILES = ["ar.ts", "fr.ts", "en.ts", "index.ts", "types.ts", "product-ref.ts"];
for (const f of LIBRARY_FILES) {
  const n = (readFileSync(path.join(__dirname, f), "utf8").match(/[—–]/g) ?? []).length;
  check(n === 0, `${f}: ${n} em / en dashes`);
}
let articleRenders = 0;
for (const locale of LOCALES) {
  const lib = libraryFor(locale);
  for (const f of ALL_FAMILIES) {
    const fam = lib.families[f];
    // every hero title carries its structure tag; ≥ 3 structures per family × locale
    check(fam.headline.every((h) => typeof h !== "string" && !!h.s), `${locale}/${f}: an untagged hero title`);
    const structures = new Set(fam.headline.map((h) => lineTag(h, locale).s));
    check(structures.size >= 3, `${locale}/${f}: ${structures.size} hero title structures (${[...structures]})`);
    // section titles read their tags through the heuristic taggers
    for (const t of [...fam.benefitsTitle, ...fam.problemTitle, ...fam.showcaseTitle, ...fam.stepsTitle]) check(!!lineTag(t, locale).s, `${locale}/${f}: untagged title "${t}"`);
    check(skeletonCount(locale, f) >= 24, `${locale}/${f}: ${skeletonCount(locale, f)} skeletons (≥ 24)`);
  }
  // a register-tagged library: no ar FAQ pair with an MSA question and a Darija answer (or the inverse)
  if (locale === "ar") {
    const pairs = [...Object.values(lib.common.faq).flat(), ...ALL_FAMILIES.flatMap((f) => lib.families[f].faq)];
    for (const qa of pairs) {
      const rq = registerOf(qa.q);
      const ra = registerOf(qa.a);
      check(!((rq === "msa" && ra === "darija") || (rq === "darija" && ra === "msa")), `ar FAQ register break: "${qa.q}" (${rq}) / "${qa.a}" (${ra})`);
    }
  }
}
// every French template with the product slot, rendered against the four ProductRef shapes: 0 article faults
{
  const fr = libraryFor("fr");
  const templates = new Set<string>();
  const walk = (v: unknown) => {
    if (typeof v === "string") {
      if (v.includes("{product")) templates.add(v);
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(fr);
  const typed = ["Sérum éclat", "Crème de nuit", "L'huile d'argan", "Zénith Pro"];
  REF_SHAPES.forEach((shape, i) => {
    const name = typed[i]!;
    const ref = productRef(name, "fr");
    check(ref.gender === shape.gender && ref.article === shape.article, `productRef("${name}") = ${JSON.stringify(ref)}`);
    for (const tpl of templates) {
      const t = typeset("fr", tpl);
      const out = fill(frTemplate(t, ref) ?? t, { product: name, delivery: "Livraison 24-48h", where: "partout au Maroc", whatsapp: true });
      articleRenders++;
      const faults = articleFaults(out);
      check(faults.length === 0, `article fault in "${out}" (${faults.join(", ")}) from "${tpl}"`);
    }
  });
  check(GENDER_LEXICON_SIZE >= 280, `the gender lexicon has ${GENDER_LEXICON_SIZE} nouns`);
}
// DS42: no stats renderer reads the figure tables (they are editor placeholders behind `sample`)
{
  const dir = path.join(__dirname, "..", "..", "..", "landing", "sections", "stats");
  for (const f of readdirSync(dir).filter((x) => /\.(tsx?|ts)$/.test(x) && x !== "copy.ts" && x !== "index.tsx")) {
    const src = readFileSync(path.join(dir, f), "utf8");
    check(!/\bSTATS\b|from "\.\/copy"/.test(src), `stats renderer ${f} references the figure tables`);
  }
}

console.log(`copy library: ${CASES.length} family cases, ${combos} copies, ${articleRenders} French article renders`);
console.log(failures ? `✗ ${failures} failure(s)` : "✓ all copy library checks passed");
process.exit(failures ? 1 : 0);
