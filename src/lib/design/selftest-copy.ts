/**
 * The copy groups of `test:design` (P6 DESIGN; design.md DES-§25.1, DES-§1.4 DG-07, DES-§9). Registered into
 * DESIGN_GROUPS by scripts/qa/design-check.ts:
 *
 *  - copy-normalise: the ar / fr / en normalisers, clitics and stems, the masks, shingles and Jaccard;
 *  - copy-cliche: the real-text cliché fixture per locale (qa/design-corpus/cliche-fixture.<locale>.json) at recall
 *    ≥ 85 %, the 120-line clean fixture (library text) at ≤ 5 %, inflected and clitic forms;
 *  - copy-register: `registerOf` ≥ 90 % on the 60 labelled lines, ≤ 2 % false `darija` calls on the 200 mixed
 *    sentences (labels pending a native speaker: reported);
 *  - copy-rules: the punctuate table (C01, C05, C07), specificity (C04), the article lint (D4), numbers (D1), the
 *    copy report by origin class;
 *  - copy-gen: ≥ 24 skeletons per family × locale; the sweep: ≥ 40 distinct hero titles per family × locale, 0
 *    dashes, spec ≥ 0.5 and clicheScore < 1.0 on every line, French article-safe, the ar register tag obeyed,
 *    distinct hero skeletons across the three directions, ≤ 0.3 ms per line (scaled by the machine's calibration);
 *  - copy-minhash: bottom-k containment within ± 0.08 of the exact value on synthetic sets.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { libraryFor, lineText, FAMILIES, WORD_FAMILIES, type Family } from "@/lib/ai/copy-library";
import { productRef, REF_SHAPES } from "@/lib/ai/copy-library/product-ref";
import { getFixture } from "@/lib/page/fixtures";
import type { PageDoc } from "@/lib/page/schema";
import { STRUCTURE_WEIGHTS } from "./compile";
import { articleCheck, articleFaults, clicheHits, clicheScore, copyFieldsOf, copyReport, headlineItems, inStoreReport, numbersReport, punctuate, registerOf, sentenceSpecific, specificity, structureOf } from "./cliche";
import { composeLines, SKELETONS, skeletonCount, type CopyFamily } from "./copy-gen";
import { VOICE_REGISTERS, type VoiceRegister } from "./genome";
import { LABELLED, MIXED, REGISTER_LABELS_PENDING } from "./lexicon/register-fixture";
import { registerDesignGroup } from "./selftest";
import { bottomK, containment, exactContainment, sketchThreshold } from "./text/minhash";
import { arStem, frLemma, matchKeys, tokens } from "./text/normalize";
import { jaccard, shingles } from "./text/shingles";
import { mulberry32 } from "@/lib/theme/rng";

const LOCALES = ["ar", "fr", "en"] as const;
/** A uniformly mixed 64-bit hex hash for the synthetic sketches (the server's is HMAC-SHA256). */
const h64 = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);
const ALL_FAMILIES: readonly CopyFamily[] = [...FAMILIES, ...WORD_FAMILIES];

registerDesignGroup({
  id: "copy-normalise",
  title: "copy normalisers: ar letters, tashkeel, digits, clitics and stems; fr elision and lemmas; the §p / §n / §s masks; shingles and Jaccard",
  ids: ["DG-07"],
  run({ check }) {
    check(tokens("إِنَّ الأَرْگَانَ ٣ مرّات", "ar").join(" ") === "ان الارگان §n مرات", `ar fold: ${tokens("إِنَّ الأَرْگَانَ ٣ مرّات", "ar").join(" ")}`);
    check(tokens("زيت أركان ممتازة لمستى", "ar").includes("ممتازه") && tokens("مستشفى", "ar")[0] === "مستشفي", "ar ta marbuta / alef maqsura");
    check(matchKeys("بالدانتيل", "ar").includes("دانتيل") && matchKeys("والزيت", "ar").includes("زيت"), "ar clitics");
    check(arStem("منتجاتنا") === "منتج" && arStem("بال") === "بال", `ar light stem: ${arStem("منتجاتنا")}`);
    check(clicheHits("لاكتشاف عالم من النعومة", "ar").some((h) => h.p === "اكتشف عالم"), "ar frame through the shared stem");
    check(tokens("L’huile d’argan, l'été", "fr").join(" ") === "l' huile d' argan l' ete", `fr elision: ${tokens("L’huile d’argan, l'été", "fr").join(" ")}`);
    check(["découvrez", "découvrir", "découvre"].every((w) => frLemma(tokens(w, "fr")[0]!) === "decouvr"), "fr lemma découvr");
    check(["sublimez", "sublimer", "sublime"].every((w) => frLemma(tokens(w, "fr")[0]!) === "sublim") && frLemma("revolutionnaires") === "revolutionnair", "fr lemma sublim / révolutionnair");
    check(tokens("Œuvre *cœur* {delivery} 50ml, 4,5 cm", "fr").join(" ") === "oeuvre coeur §s §n ml §n cm", `fr masks: ${tokens("Œuvre *cœur* {delivery} 50ml, 4,5 cm", "fr").join(" ")}`);
    check(tokens("L'huile d'argan, pressée à froid", "fr", { product: "Huile d'argan" }).join(" ") === "l' §p pressee a froid", "fr product mask");
    check(tokens("بزيت الأركان المغربي", "ar", { product: "زيت الأركان" }).join(" ") === "§p المغربي", "ar product mask through the clitic");
    check(tokens("The {product} ships today", "en").join(" ") === "the §p ships today", "slot mask");
    const short = shingles("Douceur au quotidien", "fr");
    check(short.length === 3 && short.includes("douceur au quotidien"), `≤ 3 tokens: 2-grams + the line (${short})`);
    check(shingles("Huile d'argan, pressée à froid, 100 % pure.", "fr", { product: "Huile d'argan" }).every((s) => s.split(" ").length === 3), "3-grams");
    check(jaccard(new Set(["a", "b"]), new Set(["b", "c"])) === 1 / 3 && jaccard(new Set(), new Set()) === 0, "jaccard");
  },
});

/** The clean fixture: 40 library lines per locale (hero titles, leads, benefit titles), slots filled. */
function cleanLines(locale: (typeof LOCALES)[number]): string[] {
  const lib = libraryFor(locale);
  const out: string[] = [];
  const name = locale === "ar" ? "زيت الأركان" : locale === "fr" ? "Huile d'argan" : "Argan oil";
  for (const f of ALL_FAMILIES) {
    const fam = lib.families[f];
    for (const s of [...fam.headline.map(lineText), ...fam.sub, ...fam.benefits.map((b) => b.title)]) out.push(s.replace(/\{product\}/g, name).replace(/\{[a-z]+(:[^}]*)?\}/g, ""));
  }
  // an even spread: every third line, 40 per locale
  return out.filter((_, i) => i % 3 === 0).slice(0, 40);
}

function fixture(locale: string): { pending: boolean; cliche: string[] } {
  return JSON.parse(readFileSync(path.join(process.cwd(), "qa", "design-corpus", `cliche-fixture.${locale}.json`), "utf8")) as { pending: boolean; cliche: string[] };
}

registerDesignGroup({
  id: "copy-cliche",
  title: "cliché detector: recall ≥ 85 % on the seller-text fixture per locale, ≤ 5 % on the 120-line clean fixture, inflected and clitic forms",
  ids: ["DG-07", "C02"],
  run({ check, note }) {
    let clean = 0;
    let cleanHits = 0;
    for (const l of LOCALES) {
      const fx = fixture(l);
      const missed = fx.cliche.filter((t) => clicheScore(t, l).hits.length === 0);
      const recall = 1 - missed.length / fx.cliche.length;
      check(recall >= 0.85, `${l} recall ${(recall * 100).toFixed(0)} % < 85 % (missed: ${missed.slice(0, 6).join(" | ")})`);
      note(`${l}: recall ${(recall * 100).toFixed(0)} % on ${fx.cliche.length} lines${fx.pending ? " (fixture pending the owner's 40 real pages)" : ""}`);
      const lines = cleanLines(l);
      const flagged = lines.filter((t) => clicheHits(t, l).length > 0);
      clean += lines.length;
      cleanHits += flagged.length;
      if (flagged.length) note(`${l} clean hits: ${flagged.map((t) => `${t} [${clicheHits(t, l).map((h) => h.p)}]`).join(" | ")}`);
    }
    check(clean === 120, `clean fixture has ${clean} lines`);
    check(cleanHits / clean <= 0.05, `clean fixture flagged ${cleanHits}/${clean}`);
    // inflections, clitics, frames
    check(clicheHits("Découvre l'univers de la marque", "fr").length > 0 && clicheHits("Elle sublime le teint", "fr").length > 0, "fr inflected forms");
    check(clicheHits("It elevated my mornings", "en").length > 0 && clicheHits("Whether you're running or resting", "en").some((h) => h.k === "frame"), "en inflection and frame");
    check(clicheHits("والسحري في هذا المنتج", "ar").length > 0 && clicheHits("ليس مجرد عطر بل توقيع", "ar").some((h) => h.k === "frame"), "ar clitic and frame");
    const s = clicheScore("Elevate your routine with a seamless serum.", "en");
    check(s.score > 1 && s.hits.every((h) => h.at >= 0) && s.hits[0]!.at === 0, `score shape ${JSON.stringify(s)}`);
    check(clicheScore("Huile d'argan, pressée à froid.", "fr").score === 0, "a clean line scores 0");
  },
});

registerDesignGroup({
  id: "copy-register",
  title: "register (D3): ≥ 90 % on the 60 labelled lines, ≤ 2 % false darija calls on the 200 MSA-frame sentences",
  ids: ["DG-07", "D3"],
  run({ check, note }) {
    const wrong = LABELLED.filter((x) => registerOf(x.t) !== x.label);
    const acc = 1 - wrong.length / LABELLED.length;
    check(LABELLED.length === 60 && acc >= 0.9, `labelled accuracy ${(acc * 100).toFixed(0)} % (${wrong.map((w) => `${w.t} → ${registerOf(w.t)}`).slice(0, 6).join(" | ")})`);
    const falseDarija = MIXED.filter((t) => registerOf(t) === "darija");
    check(MIXED.length === 200 && falseDarija.length / MIXED.length <= 0.02, `${falseDarija.length} false darija calls: ${falseDarija.slice(0, 4).join(" | ")}`);
    note(`labelled ${(acc * 100).toFixed(0)} %, mixed false darija ${falseDarija.length}/200${REGISTER_LABELS_PENDING ? " (labels PENDING a native speaker's review)" : ""}`);
  },
});

/** A copy of a fixture document with one section's fields replaced. */
function withSection(doc: PageDoc, type: string, data: Record<string, unknown>): PageDoc {
  return { ...doc, sections: doc.sections.map((s) => (s.type === type ? { ...s, data: { ...s.data, ...data } } : s)) };
}

registerDesignGroup({
  id: "copy-rules",
  title: "copy rules: the punctuate table (C01 / C05 / C07), specificity (C04), the article lint (D4), numbers (D1), the report, in-store (C06) and cross-store (C08, N05, N8) items by origin",
  ids: ["DG-07", "C01", "C04", "C05", "C06", "C07", "C08", "D4", "D1", "N8"],
  run({ check }) {
    const P: [string, "ar" | "fr" | "en", string][] = [
      ["Douceur — au quotidien", "fr", "Douceur, au quotidien"],
      ["A fragrance is a memory — this one stays tied to the good moments.", "en", "A fragrance is a memory. This one stays tied to the good moments."],
      ["Trois formats — petit, moyen, grand", "fr", "Trois formats : petit, moyen, grand"],
      ["— Salma, Casablanca", "en", "- Salma, Casablanca"],
      ["Livraison 24–48h", "fr", "Livraison 24-48h"],
      ["Super ! Vraiment ! Top !", "fr", "Super ! Vraiment. Top."],
      ["Coton · Lin · Soie", "en", "Coton · Lin, Soie"],
      ["عطر خفيف — يدوم طوال اليوم", "ar", "عطر خفيف، يدوم طوال اليوم"],
    ];
    for (const [input, l, want] of P) check(punctuate(input, l) === want, `punctuate(${input}) = ${JSON.stringify(punctuate(input, l))}, want ${JSON.stringify(want)}`);
    // D4: the four shapes
    const [m, f, el, none] = REF_SHAPES;
    check(articleCheck("Ce que change {product}", m!).fixed === "Ce que change {product:ce}", "inverted subject → {product:ce}");
    check(articleCheck("Découvrez la {product}", f!).fixed === "Découvrez {product:le}", "a written determiner → {product:le}");
    check(articleCheck("L'idée de {product}", el!).fixed === "L'idée {product:de}", "a typed article contracts");
    check(articleCheck("Le choix de {product}", productRef("Abaya noire", "fr")).fixed === "Le choix d'{product}", "elision before a vowel");
    check(articleCheck("Essayez {product:le}", none!).fixed === null && !articleCheck("Essayez {product:le}", none!).ok, "a gendered slot without a gender needs the name-free line");
    check(articleCheck("{product}, pressée à froid", none!).ok, "a bare name at the start is safe");
    check(articleFaults("Le prix de le sérum, à le matin").length === 2 && articleFaults("de huile").length === 1 && articleFaults("Le prix du sérum, de l’huile").length === 0, "rendered faults");
    // specificity, numbers, the report
    const doc = getFixture("massage").doc as PageDoc;
    const facts = { facts: ["Pressée à froid", "Flacon de 50 ml"], productName: doc.product.name };
    const s0 = specificity(doc, facts);
    check(s0 >= 0 && s0 <= 1, `specificity in 0-1 (${s0})`);
    check(sentenceSpecific("Une texture qui glisse.", { facts: [] }, "fr") && sentenceSpecific("Flacon de 50 ml.", facts, "fr") && sentenceSpecific("Vous payez à la réception.", { facts: [] }, "fr"), "sensory / fact / COD sentences are specific");
    check(!sentenceSpecific("Le meilleur choix pour vous.", facts, "fr"), "a generic sentence is not");
    const vague = withSection(doc, "hero", { title: "Le meilleur choix pour vous", subtitle: "Une évidence. Un plaisir." });
    check(specificity(vague, { facts: [] }) <= specificity(doc, facts), "vague copy scores lower");
    const nums = numbersReport(withSection(doc, "hero", { title: "Flacon de 100 ml, 50 ml offerts" }), facts);
    check(nums.unknown.some((u) => u.value === "100") && nums.conflicts.length >= 2, `numbers report ${JSON.stringify(nums)}`);
    const dashed = withSection(doc, "hero", { title: "Douceur — au quotidien !", subtitle: "Trois couleurs ! Deux tailles !" });
    const owner = copyReport(dashed, facts, null);
    check(owner.dashes >= 1 && owner.items.some((i) => i.id === "C01") && owner.items.some((i) => i.id === "C05" && i.level === "soft"), "owner / library text: C01 and a soft C05");
    const heroId = dashed.sections.find((s) => s.type === "hero")!.id;
    const engine = copyReport(dashed, facts, new Map([[`${heroId}.title`, "engine" as const]]));
    check(engine.items.some((i) => i.id === "C05" && i.level === "hard"), "generated `!` beyond the first is hard");
    // in-store (C06) and cross-store items by origin (C08, N05, the hard N8)
    const same = inStoreReport(doc, [doc], null);
    check(same.jaccard > 0.5 && same.resample.length > 0 && same.items.length === 0, "an identical sibling: library lines resampled, nothing flagged");
    const ownerMap = new Map([...copyFieldsOf(doc).keys()].map((k) => [k, "owner" as const]));
    check(inStoreReport(doc, [doc], ownerMap).items.every((i) => i.id === "C06" && i.level === "soft") && inStoreReport(doc, [], null).jaccard === 0, "owner lines flagged C06, never rewritten");
    const items = headlineItems(
      [
        { path: "h.title", verdict: "close", band: null },
        { path: "h.sub", verdict: "ok", band: "high" },
        { path: "b.title", verdict: "close", band: "high" },
      ],
      new Map([
        ["h.title", "owner" as const],
        ["h.sub", "library" as const],
        ["b.title", "engine" as const],
      ]),
    );
    check(items.map((i) => `${i.id}:${i.level}`).join() === "C08:soft,N05:soft,N8:hard", `headline items ${items.map((i) => i.id)}`);
    check(structureOf("Moins de produits, une peau plus *confortable*.", "fr") === "contrast-pair" && structureOf("Commandez maintenant", "fr") === "imperative" && structureOf("Ready?", "en") === "question", "structureOf");
  },
});

/** A small merchant-fact pool per locale (the sweep draws 2-4 per plan). */
const FACT_POOL: Readonly<Record<(typeof LOCALES)[number], readonly string[]>> = {
  fr: ["Pressée à froid", "100 % coton", "Flacon de 50 ml", "Fabriqué au Maroc", "3 couleurs", "Lavable en machine", "Acier inoxydable", "Sans parfum ajouté", "Taille unique", "Livré avec sa pochette", "2 tailles", "Poignée en bois", "Recharge USB", "Coton bio", "Pour cheveux secs", "Tissu crêpe", "Fermeture éclair", "Origine Agadir", "Garantie 6 mois", "Boîte de 12"],
  en: ["Cold-pressed", "100% cotton", "50 ml bottle", "Made in Morocco", "3 colours", "Machine washable", "Stainless steel", "No added fragrance", "One size", "Comes with a pouch", "2 sizes", "Wooden handle", "USB charging", "Organic cotton", "For dry hair", "Crepe fabric", "Zip closure", "From Agadir", "6-month warranty", "Box of 12"],
  ar: ["معصور على البارد", "100٪ قطن", "عبوة 50 مل", "صنع في المغرب", "3 ألوان", "يغسل في الغسالة", "فولاذ مقاوم للصدأ", "بدون عطر مضاف", "مقاس واحد", "مع حقيبة صغيرة", "مقاسان", "مقبض من الخشب", "شحن USB", "قطن عضوي", "للشعر الجاف", "قماش كريب", "سحاب", "من أكادير", "ضمان 6 أشهر", "علبة من 12"],
};
const NAMES: Readonly<Record<(typeof LOCALES)[number], readonly string[]>> = {
  fr: ["Huile d'argan", "Sérum éclat", "Abaya fluide", "Montre Atlas", "Robot pétrin", "Tapis de prière", "Bougie ambre"],
  en: ["Argan oil", "Glow serum", "Flowing abaya", "Atlas watch", "Stand mixer", "Prayer mat", "Amber candle"],
  ar: ["زيت الأركان", "سيروم الإشراقة", "عباية واسعة", "ساعة أطلس", "عجانة كهربائية", "سجادة صلاة", "شمعة عنبر"],
};

registerDesignGroup({
  id: "copy-gen",
  title: "compositional headlines: ≥ 24 skeletons per family × locale; the sweep: ≥ 40 distinct hero titles, 0 dashes, spec ≥ 0.5, cliché < 1.0, article-safe, register-true, ≤ 0.3 ms per line",
  ids: ["DG-07", "DS51", "C08"],
  run({ full, check, note }) {
    const plans = full ? 140 : 20;
    for (const l of LOCALES) for (const f of ALL_FAMILIES) check(skeletonCount(l, f) >= 24, `${l}/${f}: ${skeletonCount(l, f)} skeletons`);
    check(SKELETONS.fr.common.length >= 15 && SKELETONS.ar.common.length >= 15, "the common set");
    // the machine's speed: the line budget scales with a fixed loop (8 tracks share this machine)
    const c0 = performance.now();
    let acc = 0;
    for (let i = 0; i < 2_000_000; i++) acc += i % 7;
    const scale = Math.max(1, (performance.now() - c0) / 4) * (acc > 0 ? 1 : 1);
    let lines = 0;
    let ms = 0;
    let bad = 0;
    for (const l of LOCALES) {
      for (const fam of ALL_FAMILIES) {
        const titles = new Set<string>();
        for (let p = 0; p < plans; p++) {
          const rng = mulberry32(p * 7919 + fam.length * 31 + l.charCodeAt(0));
          const register: VoiceRegister = VOICE_REGISTERS[p % VOICE_REGISTERS.length]!;
          const pool = FACT_POOL[l];
          const facts = Array.from({ length: 2 + (p % 3) }, () => pool[Math.floor(rng() * pool.length)]!).filter((x, i, a) => a.indexOf(x) === i);
          const name = NAMES[l][p % NAMES[l].length]!;
          const ref = productRef(name, l);
          const t0 = performance.now();
          const got = composeLines(
            { ref, facts: { facts, productName: name }, directives: { register, structures: STRUCTURE_WEIGHTS[register], angle: (["benefit", "ritual", "proof", "value"] as const)[p % 4]!, darija: (["none", "cta", "light"] as const)[p % 3]! }, locale: l, family: fam as Family, section: "hero", field: "title" },
            rng,
            3,
          );
          ms += performance.now() - t0;
          lines += got.length;
          for (const g of got) {
            titles.add(g.t);
            const fault =
              /[—–·!]/.test(g.t) ||
              clicheScore(g.t, l).score >= 1 ||
              clicheHits(g.t, l).some((h) => h.w === 3) ||
              (l === "fr" && articleFaults(g.t).length > 0) ||
              (l === "ar" && !["none", g.r].includes(registerOf(g.t))) ||
              !["fact", "number", "sense", "cod"].some((s) => g.slots.includes(s));
            const ss = g.t.replace(/\*+/g, "").split(/(?<=[.?؟])\s+/).filter(Boolean);
            const spec = ss.filter((s) => sentenceSpecific(s, { facts, productName: name }, l)).length / ss.length;
            if (fault || spec < 0.5) {
              bad++;
              if (bad <= 8) check(false, `${l}/${fam}: "${g.t}" (${g.skeleton}, spec ${spec.toFixed(2)})`);
            }
          }
        }
        check(titles.size >= 40, `${l}/${fam}: ${titles.size} distinct hero titles over ${plans} plans`);
      }
    }
    check(bad === 0, `${bad} composed lines broke a rule`);
    const perLine = ms / Math.max(1, lines);
    check(perLine <= 0.3 * scale, `${perLine.toFixed(3)} ms per line (budget 0.3 × machine scale ${scale.toFixed(1)})`);
    note(`${lines} lines, ${perLine.toFixed(3)} ms per line (machine scale ${scale.toFixed(1)})`);
    // rotation: three draws with the avoid set never share the hero skeleton
    const used = new Set<string>();
    const ref = productRef("Huile d'argan", "fr");
    for (let d = 0; d < 3; d++) {
      const [line] = composeLines(
        { ref, facts: { facts: ["Pressée à froid", "100 % pure", "Flacon de 50 ml"] }, directives: { register: "plain", structures: STRUCTURE_WEIGHTS.plain, angle: "benefit", darija: "none" }, locale: "fr", family: "skincare", section: "hero", field: "title", avoid: used },
        mulberry32(d),
        1,
      );
      check(!!line && !used.has(line.skeleton), `direction ${d} reuses a hero skeleton`);
      if (line) used.add(line.skeleton);
    }
    // no fact, no number, no policy line → nothing invented: the caller keeps the library line
    const none = composeLines({ ref, facts: { facts: [] }, directives: { register: "precise", structures: STRUCTURE_WEIGHTS.precise, angle: "proof", darija: "none" }, locale: "fr", family: "skincare", section: "hero", field: "title" }, mulberry32(1), 3);
    check(none.every((x) => !x.slots.includes("number") && !x.slots.includes("fact")), "no fact slot without facts");
    check(composeLines({ ref, facts: { facts: ["Pressée à froid"] }, directives: { register: "precise", structures: { "number-led": 1 }, angle: "proof", darija: "none" }, locale: "fr", family: "skincare", section: "hero", field: "title" }, mulberry32(1), 5).every((x) => x.s !== "number-led"), "number-led is skipped without a merchant number");
  },
});

registerDesignGroup({
  id: "copy-minhash",
  title: "bottom-k (k = 256) containment within ± 0.08 of the exact value on synthetic sets",
  ids: ["DG-07", "N8"],
  run({ check, note }) {
    // a store's live titles and leads hold 100-1,000 shingles (1-6 pages); a candidate set of a few hundred
    const errs: number[] = [];
    for (let trial = 0; trial < 40; trial++) {
      const rng = mulberry32(1000 + trial);
      const bSize = 256 + Math.floor(rng() * 768);
      const cSize = 200 + Math.floor(rng() * 300);
      const overlap = 0.1 + rng() * 0.8;
      const b = new Set<string>();
      for (let i = 0; i < bSize; i++) b.add(h64(`b:${trial}:${i}`));
      const bArr = [...b];
      const c = new Set<string>();
      for (let i = 0; i < cSize; i++) c.add(rng() < overlap ? bArr[Math.floor(rng() * bArr.length)]! : h64(`c:${trial}:${i}`));
      const sketch = bottomK(b);
      const est = containment([...c], new Set(sketch), sketchThreshold(sketch)) ?? 0;
      errs.push(Math.abs(est - exactContainment(c, b)));
    }
    const within = errs.filter((e) => e <= 0.08).length / errs.length;
    const mean = errs.reduce((a, e) => a + e, 0) / errs.length;
    check(within === 1 && mean <= 0.04, `${(within * 100).toFixed(0)} % of 40 sets within ± 0.08 (mean error ${mean.toFixed(3)})`);
    note(`${(within * 100).toFixed(0)} % within ± 0.08, mean error ${mean.toFixed(3)}, worst ${Math.max(...errs).toFixed(3)} over 40 synthetic sets`);
    const small = bottomK(["b", "a", "c", "a"]);
    check(small.join("") === "abc" && sketchThreshold(small) === null && containment(["a", "z"], new Set(small), null) === 0.5, "small sketch: ∞ threshold");
  },
});
