/**
 * The genome-core test groups (P6 DESIGN step 2; design.md DES-§25.1 `test:design`, DES-§1.4 DG-02, DG-03, DG-05,
 * GH-1, RD-1). Registered with ./selftest and run by scripts/qa/design-check.ts: the seeded fast subset (20 seeds)
 * inside `npm test`, the 200-seed sweeps with `--full`.
 *
 *  - genome-determinism: the same (seed, inputs, priorsV, hints) gives a byte-identical genome; the strict schema;
 *    pack / unpack round trip ≤ 1,200 B; the distance view round trip ≤ 400 B;
 *  - genome-hard-rules: 11 archetypes × 3 moods × seeds satisfy every genome-level H-rule; the solver stays ≤ 200
 *    expansions and ≤ 3 ms (p95);
 *  - genome-compile: `buildTheme(compileGenome(g).theme)` never throws, `orangeMixes` is empty, the look ≤ 700 B and
 *    valid, a dark base only where H11 / H27 allow it;
 *  - genome-derive: `genomeOf` is total and schema-valid; on the baseline fixtures `compileGenome(genomeOf(doc))`
 *    emits today's attributes except the `[data-look]`-scoped ones and the reviewed look decisions (K5, H26);
 *  - gene-spread: the 2,000-doc spread (every G12 / G15 / G17 / G25 / G26 / G27 value under ≥ 4 archetypes);
 *  - hints: invalid values dropped, locks respected, one pin honoured, a second dropped (`second_pin`);
 *  - distance: symmetric, d(a, a) = 0, [0, 1], Σw 40 / 21 / 19, bounds-first = full on 10,000 pairs, the
 *    locale-aware pairing cases, τ_niche, two stores with identical inputs ≥ 0.25 (GEN-12);
 *  - tokens-table: append-only against the committed snapshot;
 *  - director-vocab: GENE_VOCAB, bucketOf, the GenomeCard schema carries bands only (RD-1 schema part).
 */
import { ARCHETYPES, ThemeLook, type Archetype, type Locale, type Market, type PageDoc } from "@/lib/page/schema";
import { FIXTURE_ASSETS, FIXTURE_NAMES, getFixture } from "@/lib/page/fixtures";
import { SECTIONS } from "@/landing/registry";
import { readMood, type MoodReading } from "@/lib/generator/mood";
import { rankDirections } from "@/lib/generator/directions";
import { productTheme } from "@/lib/generator/theme";
import { buildTheme, orangeMixes } from "@/lib/theme";
import { mulberry32 } from "@/lib/theme/rng";
import snapshot from "./calibration/tokens-table.json";
import { compileGenome, type CompileCtx } from "./compile";
import { genomeOf } from "./derive";
import { GenomeCardSchema, type GenomeCard } from "./digest";
import {
  bounds,
  crowdView,
  distanceBand,
  distanceView,
  genomeDistance,
  bandOf,
  nicheKey,
  packView,
  pairingDistance,
  tauNiche,
  unpackView,
  weightSum,
  type DistanceView,
} from "./distance";
import { BOLD_GENES, DesignGenomeSchema, GENE_KEYS, packGenome, unpackGenome, type DesignGenome, type SampleInput, type SampleOpts } from "./genome";
import { applyHints, validateHints } from "./hints";
import { FIXED_TYPES } from "./consts";
import { DIRECTOR_TASKS } from "./index";
import { AI_REPAIR_OPS } from "./gates/repair";
import type { NicheShares } from "./novelty.server";
import { loadCatalogue } from "./pairings";
import type { PhotoFacts } from "./photo-facts";
import { PRIORS_VERSION } from "./priors";
import { registerDesignGroup } from "./selftest";
import { hardViolations, MAX_EXPANSIONS, repel, sampleGenome, sampleGenomeWithStats } from "./solve";
import { FONT_TOKENS, HERO_TOKENS, PAIRING_TOKENS, SECTION_TOKENS } from "./tokens-table";
import { bucketOf, GENE_VOCAB } from "./vocab";

const NOW = "2026-10-28T09:00:00.000Z";
const LOCALES: readonly Locale[] = ["ar", "fr", "en"];
const MARKETS: readonly Market[] = ["MA", "FR", "BE", "INTL"];
const MOODS: readonly MoodReading[] = [
  { mood: "calm", modest: false, words: [] },
  { mood: "lively", modest: false, words: [] },
  { mood: "neutral", modest: false, words: [] },
];

/** Photo profiles the hard rules read (H08, H13, H27, H36): one phone shot, cutouts, a dark set, a small one. */
export const PHOTO_PROFILES: readonly PhotoFacts[] = [
  { count: 1, maxWidth: 1200, hasCutout: false, dominant: "#c8c8b8", background: { luminance: 0.92, uniform: true }, sharp: true },
  { count: 3, maxWidth: 2000, hasCutout: true, dominant: "#5a3b2a", background: { luminance: 1, uniform: true }, sharp: true },
  { count: 2, maxWidth: 1600, hasCutout: "estimated", dominant: "#3a5a4a", background: { luminance: 0.88, uniform: true }, sharp: true },
  { count: 5, maxWidth: 2400, hasCutout: false, dominant: "#2a2a3a", background: { luminance: 0.2, uniform: false }, sharp: true },
  { count: 1, maxWidth: 700, hasCutout: false, dominant: "#8a8a70", background: { luminance: 0.6, uniform: false }, sharp: false },
  { count: 4, maxWidth: 1800, hasCutout: false, dominant: "#b0a090", background: { luminance: 0.7, uniform: false }, sharp: true },
];

/** The archetypes ranked with `first` on top and the rest in a seeded order (the shape rankDirections gives). */
function rankedFor(first: Archetype, seed: number): SampleInput["ranked"] {
  const rng = mulberry32(seed * 7919 + 13);
  const rest = ARCHETYPES.filter((a) => a !== first)
    .map((a) => ({ a, k: rng() }))
    .sort((x, y) => x.k - y.k)
    .map((x) => x.a);
  return [first, ...rest].map((archetype, i) => ({ archetype, score: Math.round((1 - i * 0.07) * 1000) / 1000, reason: "test" }));
}

/** A synthetic sample input: the archetype forced (the H-rule sweep covers all eleven), the rest rotated by seed. */
export function inputOf(archetype: Archetype, mood: MoodReading, seed: number, over: Partial<SampleInput> = {}): SampleInput {
  return {
    archetype,
    brandSeed: `store-${seed}`,
    inputHash: `input-${archetype}-${mood.mood}`,
    directionIndex: (seed % 3) as 0 | 1 | 2,
    attempt: 0,
    mood,
    locale: LOCALES[seed % 3]!,
    market: MARKETS[seed % MARKETS.length]!,
    photos: PHOTO_PROFILES[seed % PHOTO_PROFILES.length]!,
    niche: "MA:skincare",
    brand: null,
    ranked: rankedFor(archetype, seed),
    shares: null,
    priorsV: PRIORS_VERSION,
    ...over,
  };
}

/** The sample inputs of a baseline fixture (its product, photo palette, ranking and mood). */
const FIXTURE_DOCS = new Map<string, PageDoc>();
const fixtureDoc = (name: (typeof FIXTURE_NAMES)[number], locale: Locale) => {
  const key = `${name}|${locale}`;
  let doc = FIXTURE_DOCS.get(key);
  if (!doc) FIXTURE_DOCS.set(key, (doc = getFixture(name, { now: NOW, locale: locale as "ar" | "fr" | "en" }).doc));
  return doc;
};

function fixtureInput(name: (typeof FIXTURE_NAMES)[number], brandSeed: string, directionIndex: 0 | 1 | 2, locale: Locale = "fr"): { input: SampleInput; doc: PageDoc } {
  const doc = fixtureDoc(name, locale);
  const asset = FIXTURE_ASSETS.find((a) => a.id === doc.product.images[0]?.id) ?? FIXTURE_ASSETS[0]!;
  const palette = asset.palette;
  const ranked = rankDirections({ product: doc.product, palette });
  const mood = readMood({ keywords: `${doc.product.name} ${doc.product.tagline ?? ""}`, category: doc.product.category, palette });
  const bg = palette.colors[0]?.lightness ?? 0.8;
  const photos: PhotoFacts = {
    count: doc.product.images.length,
    maxWidth: asset.width,
    hasCutout: asset.alpha ? true : false,
    dominant: asset.dominant ?? null,
    background: { luminance: bg, uniform: palette.background !== null },
    sharp: true,
  };
  return {
    doc,
    input: {
      brandSeed,
      inputHash: `fixture-${name}`,
      directionIndex,
      attempt: 0,
      mood,
      locale,
      market: doc.market,
      photos,
      niche: `${doc.market}:${doc.product.category}`,
      brand: null,
      ranked,
      shares: null,
      priorsV: PRIORS_VERSION,
    },
  };
}

/**
 * The genome with the shape of a generated page (the solver leaves sections and rhythm to the choreography step): a
 * fixture doc's fixed sections and its first 14 in-flow sections (DES-§5.2: 8-14), every asset at its three uses.
 */
function withSections(g: DesignGenome, doc: PageDoc): DesignGenome {
  const d = genomeOf(doc);
  const flow = d.sections.filter((s) => !FIXED_TYPES.has(s.type)).slice(0, 14);
  const kept = new Set(flow.map((s) => s.id));
  const sections = d.sections
    .filter((s) => FIXED_TYPES.has(s.type) || kept.has(s.id))
    .map((s, i) => (i % 4 === 1 ? { ...s, G19: { a: "4:5" as const, f: "thirds" as const }, arrange: "split(5:7)" } : s));
  const assets = [...new Set(doc.product.images.map((i) => i.id))].slice(0, 3);
  const uses: DesignGenome["page"]["G33"]["uses"] = {};
  assets.forEach((id, i) => {
    uses[id] = [
      { role: i === 0 ? "hero" : "detail", aspect: "4:5", crop: "full", section: "hero" },
      { role: "context", aspect: "16:9", crop: i % 2 ? "tight" : "context", section: flow[3]?.id ?? "story" },
      { role: "thumb", aspect: "1:1", crop: "bleed", section: flow[6]?.id ?? "offer" },
    ];
  });
  return {
    ...g,
    page: {
      ...g.page,
      G24: { ...d.page.G24, seq: flow.map((s) => `${s.type}:${s.variant}`), moments: d.page.G24.moments.filter((m) => m < flow.length) },
      G32: { budget: Math.ceil((flow.length - 1) / 3), openers: d.page.G32.openers.slice(0, flow.length - 1) },
      G33: { max: 3, uses },
      G34: { ...d.page.G34, primary: d.page.G34.primary.filter((id) => id === "sticky" || kept.has(id)) },
    },
    sections,
  };
}

/** The product theme a compile reads (memoised per archetype, photo, mood and locale: productTheme is the costly part). */
const THEMES = new Map<string, CompileCtx["theme"]>();
const ctxFor = (g: DesignGenome, input: SampleInput, seed: number): CompileCtx => {
  const asset = seed % FIXTURE_ASSETS.length;
  const key = `${g.brand.G1}|${asset}|${input.mood.mood}|${input.locale}`;
  let theme = THEMES.get(key);
  if (!theme) THEMES.set(key, (theme = productTheme({ category: "skincare", palette: FIXTURE_ASSETS[asset]!.palette, archetype: g.brand.G1, seed: asset, mood: input.mood.mood, locale: input.locale })));
  return { theme, locale: input.locale, mood: input.mood.mood, photos: input.photos };
};

const p95 = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * 0.95))] ?? 0;
};

/* ------------------------------------------------------------------ */
/* determinism, schema, pack                                           */
/* ------------------------------------------------------------------ */

registerDesignGroup({
  id: "genome-determinism",
  title: "byte-identical genome per (seed, inputs, priorsV, hints); strict schema; pack ≤ 1,200 B and view ≤ 400 B round trips",
  ids: ["DG-02", "DG-05"],
  run({ full, check, note }) {
    const seeds = full ? 200 : 20;
    let maxPack = 0;
    let maxVec = 0;
    const fixtures = FIXTURE_NAMES.map((n) => fixtureInput(n, "store-pack", 0, "fr"));
    for (let s = 0; s < seeds; s++) {
      const a = ARCHETYPES[s % ARCHETYPES.length]!;
      const input = inputOf(a, MOODS[s % 3]!, s);
      const opts: SampleOpts = s % 2 ? { hints: { G2: [{ value: "split-tension", weight: 3 }], G10: [{ value: "0.05", weight: 2 }] } } : {};
      const one = JSON.stringify(sampleGenome(input, opts));
      const two = JSON.stringify(sampleGenome({ ...input, ranked: input.ranked.map((r) => ({ ...r })) }, structuredClone(opts)));
      check(one === two, `seed ${s} ${a}: two samples of the same inputs differ`);
      const g = JSON.parse(one) as DesignGenome;
      const other = sampleGenome({ ...input, brandSeed: `${input.brandSeed}-b` }, opts);
      check(other.seed !== g.seed, `seed ${s}: another brand seed gives the same sampling seed (DS5)`);
      check(sampleGenome({ ...input, priorsV: "p1-261028" }, opts).priorsV === "p1-261028", `seed ${s}: priorsV is not recorded`);
      const parsed = DesignGenomeSchema.safeParse(g);
      check(parsed.success, `seed ${s} ${a}: schema ${parsed.success ? "" : JSON.stringify(parsed.error.issues[0])}`);
      // the storage form, with a fixture's sections and rhythm (the realistic size)
      const fx = fixtures[s % fixtures.length]!;
      const big = withSections(g, fx.doc);
      const packed = packGenome(big);
      const bytes = JSON.stringify(packed).length;
      maxPack = Math.max(maxPack, bytes);
      check(bytes <= 1200, `seed ${s}: packed genome is ${bytes} B (> 1,200)`);
      let back: DesignGenome | null = null;
      try {
        back = unpackGenome(JSON.parse(JSON.stringify(packed)));
      } catch (e) {
        check(false, `seed ${s}: unpack threw ${(e as Error).message}`);
      }
      if (back) check(JSON.stringify(back) === JSON.stringify(DesignGenomeSchema.parse(big)), `seed ${s}: pack / unpack round trip differs`);
      // the distance view round trip
      const compiled = compileGenome(big, ctxFor(big, input, s));
      const view = distanceView(big, compiled, input.locale);
      const vec = packView(view);
      maxVec = Math.max(maxVec, JSON.stringify(vec).length);
      check(JSON.stringify(vec).length <= 400, `seed ${s}: packed view is ${JSON.stringify(vec).length} B (> 400)`);
      const v2 = unpackView(vec);
      check(genomeDistance(view, v2) < 0.002, `seed ${s}: unpackView(packView(v)) is ${genomeDistance(view, v2).toFixed(4)} from v`);
    }
    // a back-derived legacy page (the 27-section baseline docs) packs within the budget too
    for (const name of FIXTURE_NAMES) {
      const legacy = genomeOf(getFixture(name, { now: NOW, locale: "ar" }).doc);
      const bytes = JSON.stringify(packGenome(legacy)).length;
      maxPack = Math.max(maxPack, bytes);
      check(bytes <= 1200, `${name}: the back-derived genome packs to ${bytes} B (> 1,200)`);
      check(JSON.stringify(unpackGenome(packGenome(legacy))) === JSON.stringify(DesignGenomeSchema.parse(legacy)), `${name}: legacy pack / unpack round trip differs`);
    }
    // the stress genome: every in-flow section with a title structure, five arranged sections (R3), six why keys, a
    // brief with twelve dropped values; the stored form keeps the budget by cutting only the dropped-hint log, from
    // its end
    {
      const fx = fixtures[0]!;
      const base = withSections(sampleGenome(inputOf("field", MOODS[2]!, 19), { hints: { G2: [{ value: "split-tension", weight: 3 }] } }), fx.doc);
      const stress: DesignGenome = {
        ...base,
        sections: base.sections.map((x) => (FIXED_TYPES.has(x.type) ? x : { ...x, G29: "contrast-pair" as const })),
        why: ["design.why.cutout", "design.why.onePhoto", "design.why.background", "design.why.darkFromPhoto", "design.why.manyPhotos", "derived"],
        hints: { from: "director", accepted: ["G2", "G9", "G10"], pinned: ["G2"], dropped: Array.from({ length: 12 }, (_, i) => ({ gene: "G18", value: `tight-detail-${i}`, why: "photo" as const })) },
      };
      const packed = packGenome(stress);
      const bytes = JSON.stringify(packed).length;
      maxPack = Math.max(maxPack, bytes);
      check(bytes <= 1200, `the stress genome packs to ${bytes} B (> 1,200)`);
      const back = unpackGenome(JSON.parse(JSON.stringify(packed)));
      const kept = back.hints?.dropped.length ?? 0;
      check(kept < 12, `the stress genome kept all 12 dropped hints at ${bytes} B`);
      const { hints: h1, ...rest1 } = back;
      const { hints: h2, ...rest2 } = DesignGenomeSchema.parse(stress);
      check(JSON.stringify(rest1) === JSON.stringify(rest2), "the stress genome lost more than its dropped-hint log");
      check(JSON.stringify(h1?.dropped) === JSON.stringify(h2?.dropped.slice(0, kept)) && JSON.stringify(h1?.accepted) === JSON.stringify(h2?.accepted), "the dropped-hint log was not cut from its end");
    }
    // an unknown value is a GenomeError, never a silent genome
    const g = sampleGenome(inputOf("souk", MOODS[1]!, 3));
    const bad = packGenome(g);
    let threw = false;
    try {
      unpackGenome({ ...bad, b: { ...bad.b, 9: "neon-orange" } });
    } catch (e) {
      threw = (e as Error).name === "GenomeError";
    }
    check(threw, "unpackGenome accepted an unknown G9 value");
    note(`packed genome ≤ ${maxPack} B, packed view ≤ ${maxVec} B over ${seeds} seeds`);
  },
});

/* ------------------------------------------------------------------ */
/* hard rules, solver budget                                           */
/* ------------------------------------------------------------------ */

registerDesignGroup({
  id: "genome-hard-rules",
  title: "11 archetypes × 3 moods × seeds satisfy every genome-level H-rule; ≤ 200 expansions, ≤ 3 ms p95",
  ids: ["DG-02"],
  run({ full, check, note }) {
    const seeds = full ? 200 : 20;
    const times: number[] = [];
    let maxExp = 0;
    let relaxed = 0;
    let fallback = 0;
    let n = 0;
    // warm the catalogue and the module caches before timing
    sampleGenome(inputOf("maison", MOODS[2]!, 0));
    for (const a of ARCHETYPES) {
      for (const mood of MOODS) {
        for (let s = 0; s < seeds; s++) {
          const input = inputOf(a, mood, s);
          const t0 = performance.now();
          const { genome, stats } = sampleGenomeWithStats(input);
          times.push(performance.now() - t0);
          n++;
          maxExp = Math.max(maxExp, stats.expansions);
          if (stats.relaxed) relaxed++;
          if (stats.fallback) fallback++;
          check(stats.expansions <= MAX_EXPANSIONS * 2, `${a} ${mood.mood} ${s}: ${stats.expansions} expansions`);
          const v = hardViolations(genome, input);
          check(v.length === 0, `${a} ${mood.mood} seed ${s}: ${v.join("; ")}`);
          check(genome.brand.G1 === a, `${a} ${mood.mood} ${s}: the forced archetype became ${genome.brand.G1}`);
        }
      }
    }
    // a solve is ≤ 200 expansions; only the relax path solves twice (DES-§4.4)
    check(maxExp <= MAX_EXPANSIONS || relaxed > 0, `max ${maxExp} expansions without a relax`);
    const t95 = p95(times);
    check(t95 <= 3, `solver p95 ${t95.toFixed(2)} ms (> 3 ms)`);
    check(fallback / n <= 0.01, `${fallback} of ${n} samples fell back to the archetype genome`);
    note(`${n} samples · p95 ${t95.toFixed(2)} ms · max ${Math.max(...times).toFixed(2)} ms · max ${maxExp} expansions · relaxed ${relaxed} · fallback ${fallback}`);
  },
});

/* ------------------------------------------------------------------ */
/* compile                                                             */
/* ------------------------------------------------------------------ */

registerDesignGroup({
  id: "genome-compile",
  title: "buildTheme(compileGenome(g).theme) never throws, orangeMixes empty, look ≤ 700 B, dark base only where H11 / H27 allow",
  ids: ["DG-02"],
  run({ full, check, note }) {
    const seeds = full ? 20 : 1;
    let maxLook = 0;
    let n = 0;
    for (const a of ARCHETYPES) {
      for (const mood of MOODS) {
        for (let s = 0; s < seeds; s++) {
          const input = inputOf(a, mood, s * 3 + ARCHETYPES.indexOf(a));
          const g = sampleGenome(input);
          const at = `${a} ${mood.mood} ${s} (${g.brand.G9}, ${g.page.G18})`;
          try {
            const { theme, plan, copy } = compileGenome(g, ctxFor(g, input, s));
            n++;
            const bytes = JSON.stringify(theme.look).length;
            maxLook = Math.max(maxLook, bytes);
            check(bytes <= 700, `${at}: look ${bytes} B`);
            check(ThemeLook.safeParse(theme.look).success, `${at}: the look does not parse`);
            const built = buildTheme(theme, input.locale);
            check(built.attrs["data-look"] === "1" && built.attrs["data-grammar"] === g.page.G2, `${at}: the look attributes are missing`);
            const mixes = orangeMixes(theme, input.locale);
            check(mixes.length === 0, `${at}: orange ${mixes.slice(0, 3).join(", ")}`);
            if (g.brand.G9 === "dark-luxe") check(theme.palette.base === "dark", `${at}: dark-luxe without a dark base (H11)`);
            if (theme.palette.base === "dark") check(g.brand.G9 === "dark-luxe" || g.brand.G9 === "mono+signal", `${at}: a dark base for ${g.brand.G9} (H27)`);
            check(plan.grammar === g.page.G2 && plan.heroPool.length > 0, `${at}: no hero pool for ${g.page.G2}`);
            check(copy.register === g.brand.G28 && copy.meanWords === g.brand.G30.mw, `${at}: copy directives differ from the genome`);
            check(!("number-led" in copy.structures), `${at}: number-led offered without merchant numbers`);
          } catch (e) {
            check(false, `${at}: threw ${(e as Error).message}`);
          }
        }
      }
    }
    note(`${n} compiled · look ≤ ${maxLook} B`);
  },
});

/* ------------------------------------------------------------------ */
/* back-derivation                                                     */
/* ------------------------------------------------------------------ */

/** The attributes only a look emits (`[data-look]`-scoped, DES-§4.5.2). */
const LOOK_ATTRS = new Set(["data-look", "data-grammar", "data-ladder", "data-depth", "data-labels", "data-align", "data-img", "data-reveal-kinds", "data-reveal-scope", "data-numbering", "data-caption", "data-corner"]);

/**
 * The reviewed look decisions on a re-emitted theme (the look decides them by design, so a back-derived look cannot
 * restate today's value): K5 (glass is a per-variant budget, never the page's card tier: a `glass` card reads as the
 * tonal depth, `data-card="soft"`), H26 (`panels` only with a flat or hairline card tier) and the radius ladder's
 * legacy kind (`none` has no ladder: crisp, `data-radius="subtle"`).
 */
function reviewed(attr: string, today: string, look: string): boolean {
  if (attr === "data-card") return today === "glass" && look === "soft";
  if (attr === "data-surfaces") return today === "panels" && look === "flush";
  if (attr === "data-radius") return today === "none" && look === "subtle";
  return false;
}

registerDesignGroup({
  id: "genome-derive",
  title: "genomeOf: total, schema-valid; compileGenome(genomeOf(doc)) re-emits today's attributes on the baseline fixtures",
  ids: ["DG-02"],
  run({ full, check, note }) {
    let docs = 0;
    const allowed = new Map<string, number>();
    const archetypes = full ? ARCHETYPES : ARCHETYPES.slice(0, 2);
    for (const name of FIXTURE_NAMES) {
      for (const locale of ["ar", "fr"] as const) {
        for (const arch of [undefined, ...archetypes]) {
          const doc = arch ? getFixture(name, { now: NOW, locale, archetype: arch }).doc : fixtureDoc(name, locale);
          docs++;
          const at = `${name} ${locale} ${doc.theme.archetype}`;
          const g = genomeOf(doc);
          const parsed = DesignGenomeSchema.safeParse(g);
          check(parsed.success, `${at}: genomeOf is not schema-valid ${parsed.success ? "" : JSON.stringify(parsed.error.issues[0])}`);
          check(g.brand.G1 === doc.theme.archetype && g.why.includes("derived"), `${at}: archetype or why`);
          const compiled = compileGenome(g, { theme: doc.theme, locale, derived: true });
          const today = buildTheme(doc.theme, locale).attrs;
          const again = buildTheme(compiled.theme, locale).attrs;
          for (const [k, v] of Object.entries(today)) {
            if (again[k] === v) continue;
            if (reviewed(k, v, again[k] ?? "")) {
              allowed.set(`${k} ${v}→${again[k]}`, (allowed.get(`${k} ${v}→${again[k]}`) ?? 0) + 1);
              continue;
            }
            check(false, `${at}: ${k} "${v}" became "${again[k] ?? "∅"}"`);
          }
          for (const k of Object.keys(again)) if (!(k in today)) check(LOOK_ATTRS.has(k), `${at}: new attribute ${k} outside the look set`);
          // the look round trip: a doc with the compiled look reads back the same genes
          const withLook = { ...doc, theme: compiled.theme };
          const back = genomeOf(withLook);
          check(JSON.stringify(back.brand) === JSON.stringify(g.brand) || back.brand.G9 === g.brand.G9, `${at}: the look does not read back`);
          check(JSON.stringify(back.page.G3) === JSON.stringify(compiled.theme.look!.grid) && back.page.G2 === g.page.G2, `${at}: look grid or grammar not read back`);
        }
      }
    }
    // total: never throws, whatever the input
    for (const junk of [null, undefined, {}, { theme: null }, { theme: { archetype: "x" }, sections: 5 }, "doc", 42]) {
      let g: DesignGenome | null = null;
      try {
        g = genomeOf(junk as unknown as PageDoc);
      } catch (e) {
        check(false, `genomeOf threw on ${JSON.stringify(junk)}: ${(e as Error).message}`);
      }
      if (g) check(DesignGenomeSchema.safeParse(g).success && g.why.includes("fallback"), `genomeOf(${JSON.stringify(junk)}) is not a schema-valid fallback`);
    }
    note(`${docs} docs · reviewed look decisions: ${[...allowed].map(([k, c]) => `${k} ×${c}`).join(", ") || "none"}`);
  },
});

/* ------------------------------------------------------------------ */
/* gene spread (DG-03)                                                 */
/* ------------------------------------------------------------------ */

registerDesignGroup({
  id: "gene-spread",
  title: "the 2,000-doc gene spread: every G12 / G15 / G17 / G25 / G26 / G27 value appears under ≥ 4 archetypes",
  ids: ["DG-03"],
  run({ full, check, note }) {
    const total = full ? 10_000 : 2_000;
    const seen = new Map<string, Set<Archetype>>();
    const add = (k: string, a: Archetype) => (seen.get(k) ?? seen.set(k, new Set()).get(k)!).add(a);
    for (let i = 0; i < total; i++) {
      const a = ARCHETYPES[i % ARCHETYPES.length]!;
      const mood = MOODS[Math.floor(i / ARCHETYPES.length) % 3]!;
      const g = sampleGenome(inputOf(a, mood, i));
      add(`G12 ${g.brand.G12}`, a);
      add(`G15 ${g.brand.G15}`, a);
      add(`G17 ${g.brand.G17}`, a);
      add(`G25.gl ${g.brand.G25.gl}`, a);
      add(`G25.nb ${g.brand.G25.nb}`, a);
      add(`G25.cap ${g.brand.G25.cap}`, a);
      add(`G26 ${g.brand.G26}`, a);
      add(`G27 ${g.brand.G27}`, a);
    }
    const parts: [string, readonly string[]][] = [
      ["G12", GENE_VOCAB.G12.values!],
      ["G15", GENE_VOCAB.G15.values!],
      ["G17", GENE_VOCAB.G17.values!],
      ["G25.gl", ["dot", "spark", "diamond", "none"]],
      ["G25.nb", ["none", "plain", "padded"]],
      ["G25.cap", ["mono", "smallcaps", "italic-serif", "plain"]],
      ["G26", GENE_VOCAB.G26.values!],
      ["G27", GENE_VOCAB.G27.values!],
    ];
    const thin: string[] = [];
    for (const [gene, values] of parts) {
      for (const v of values) {
        const n = seen.get(`${gene} ${v}`)?.size ?? 0;
        check(n >= 4, `${gene} = ${v} appears under ${n} archetype(s) (< 4)`);
        if (n < 6) thin.push(`${gene}=${v}:${n}`);
      }
    }
    note(`${total} genomes · values under < 6 archetypes: ${thin.join(", ") || "none"}`);
  },
});

/* ------------------------------------------------------------------ */
/* hints and pins (GH-1)                                               */
/* ------------------------------------------------------------------ */

registerDesignGroup({
  id: "hints",
  title: "Director hints: invalid values dropped, locks respected, one pin honoured, a second dropped (second_pin)",
  ids: ["GH-1"],
  run({ check }) {
    // validateHints: the vocabulary check
    const v = validateHints({
      hints: {
        G2: [{ value: "poster", weight: 9 }, { value: "brutalist", weight: 2 }, "stage"],
        G9: { value: "ink+one" },
        G10: [{ value: 0.04, weight: 2 }, { value: 0.9 }],
        G20: "airy/ABAB",
        G3: [{ value: "12/5:7/offset" }],
        G99: "x",
        G4: [{ value: "<script>", weight: 3 }],
      },
      pin: { gene: "G2", value: "poster" },
      pins: { G9: "duotone", G18: "nope" },
    });
    check(v.hints.G2?.some((h) => h.value === "poster" && h.weight === 3), "a weight above 3 is not clamped to 3");
    check(v.hints.G2?.some((h) => h.value === "stage" && h.weight === 1), "a bare string hint is not weight 1");
    check(!v.hints.G2?.some((h) => h.value === "brutalist"), "an unknown grammar was accepted");
    check(v.hints.G10?.length === 1 && v.hints.G10[0]!.value === "0.04", "G10 out of range accepted or in range dropped");
    check(v.hints.G20?.[0]?.value === "airy/ABAB", "G20 'airy/ABAB' not accepted");
    check(!("G3" in v.hints) && !("G99" in v.hints) && !v.hints.G4?.length, "a non-hintable gene or an unknown pairing was accepted");
    const vocab = v.intake.dropped.filter((d) => d.why === "vocab").map((d) => `${d.gene}:${d.value}`);
    for (const k of ["G2:brutalist", "G10:0.9", "G3:12/5:7/offset", "G99:x", "G4:<script>", "G18:nope"]) check(vocab.includes(k), `${k} not dropped as vocab (${vocab.join(", ")})`);
    check(JSON.stringify(v.pins) === JSON.stringify({ G2: "poster" }), `the first pin is not kept alone: ${JSON.stringify(v.pins)}`);
    check(v.intake.dropped.some((d) => d.gene === "G9" && d.why === "second_pin"), "the second pin is not dropped as second_pin");
    check(v.intake.pinned.length === 1 && v.intake.pinned[0] === "G2", "intake.pinned is not [G2]");
    check(validateHints("garbage").intake.accepted.length === 0 && validateHints(null).intake.dropped.length === 0, "a non-object brief is not empty");
    // applyHints never adds a value and caps at 3×
    const prior = { a: 0.5, b: 0.5 };
    const out = applyHints(prior, "G2", { G2: [{ value: "a", weight: 3 }, { value: "zzz", weight: 3 }] });
    check(out.a === 1.5 && out.b === 0.5 && !("zzz" in out), `applyHints ${JSON.stringify(out)}`);
    check(applyHints(prior, "G2", { G2: [{ value: "a", weight: 3 }] }, 2).a === 1, "the exploration slot is not capped at 2×");

    // sampleGenome: one pin honoured (lively, a cutout photo) for every archetype; a second pin dropped
    const lively = MOODS[1]!;
    let posters = 0;
    for (const a of ARCHETYPES) {
      const input = inputOf(a, lively, 1, { photos: PHOTO_PROFILES[1]!, directionIndex: 0 });
      const g = sampleGenome(input, { pins: { G9: "tonal" } });
      check(g.brand.G9 === "tonal" && g.hints?.pinned.includes("G9"), `${a}: the tonal pin was not honoured (${g.brand.G9})`);
      check(hardViolations(g, input).length === 0, `${a}: the pinned genome breaks ${hardViolations(g, input).join("; ")}`);
      const two = sampleGenome(input, { pins: { G2: "stage", G9: "tonal" } });
      check(two.page.G2 === "stage" && !!two.hints?.dropped.some((d) => d.gene === "G9" && d.why === "second_pin"), `${a}: the second pin was not dropped`);
      // a poster pin needs a heavy display face (H04): honoured where the archetype has one, else dropped as "pin"
      const p = sampleGenome(input, { pins: { G2: "poster" } });
      if (p.page.G2 === "poster") posters++;
      check(p.page.G2 === "poster" ? !!p.hints?.pinned.includes("G2") && hardViolations(p, input).length === 0 : !!p.hints?.dropped.some((d) => d.gene === "G2" && d.why === "pin"), `${a}: a poster pin neither honoured nor dropped as pin`);
    }
    for (const a of ["playground", "kinetic", "garage"] as const) {
      const p = sampleGenome(inputOf(a, lively, 1, { photos: PHOTO_PROFILES[1]!, directionIndex: 0 }), { pins: { G2: "poster" } });
      check(p.page.G2 === "poster", `${a}: the poster pin was not honoured (${p.page.G2})`);
    }
    check(posters >= 3, `the poster pin was honoured for ${posters} archetypes only`);
    // a pin that breaks a hard rule (calm ⇒ no poster, H01) is dropped with why "pin"
    const calm = inputOf("maison", MOODS[0]!, 2);
    const cp = sampleGenome(calm, { pins: { G2: "poster" } });
    check(cp.page.G2 !== "poster" && cp.hints?.dropped.some((d) => d.gene === "G2" && d.why === "pin"), "a calm poster pin was not dropped as pin");
    // a pin the photo facts refuse (gallery-led needs ≥ 3 photos, H08)
    const one = inputOf("souk", lively, 3, { photos: PHOTO_PROFILES[0]! });
    const op = sampleGenome(one, { pins: { G2: "gallery-led" } });
    check(op.page.G2 !== "gallery-led" && op.hints?.dropped.some((d) => d.why === "pin"), "a one-photo gallery-led pin was not dropped");
    // locks respected: a lock wins over hints and pins, and a hint on a locked gene is dropped as locked
    for (let s = 0; s < 10; s++) {
      const input = inputOf(ARCHETYPES[s]!, lively, s, { photos: PHOTO_PROFILES[3]! });
      const g = sampleGenome(input, { locks: { G9: "tonal", G12: "round", G27: "outline" }, hints: { G9: [{ value: "duotone", weight: 3 }] }, pins: { G9: "color-field" } });
      check(g.brand.G9 === "tonal" && g.brand.G12 === "round" && g.brand.G27 === "outline", `seed ${s}: a lock was not kept (${g.brand.G9}, ${g.brand.G12}, ${g.brand.G27})`);
      check(!!g.hints?.dropped.some((d) => d.gene === "G9" && d.value === "duotone" && d.why === "locked"), `seed ${s}: a hint on a locked gene was not dropped as locked`);
      check(!!g.hints?.dropped.some((d) => d.gene === "G9" && d.value === "color-field" && d.why === "pin"), `seed ${s}: a pin against a lock was not dropped as pin`);
    }
    // brand kit locks (DES-§12.3): the setting's genes, a locked pairing, the voice of brandView
    const pairing = loadCatalogue().pairings.find((p) => p.archetype === "editorial")!.id;
    const brand = {
      genes: { G1: "editorial", G17: "arch" },
      fonts: { pairing, locked: true },
      colors: { accent: null, pop: null, neutralHue: null, base: null, locks: [], moves: [], fromLogo: [] },
      voiceSummary: { register: "warm", darija: "light" },
    } as unknown as SampleInput["brand"];
    const bk = sampleGenome(inputOf("souk", lively, 4, { archetype: undefined, brand }));
    check(bk.brand.G1 === "editorial" && bk.brand.G17 === "arch" && bk.brand.G4 === pairing, `the brand kit locks were not kept (${bk.brand.G1}, ${bk.brand.G17}, ${bk.brand.G4})`);
    check(bk.brand.G28 === "warm" && bk.brand.G31 === "light", `the store_ai voice was not kept (${bk.brand.G28}, ${bk.brand.G31})`);
    // a hinted value that breaks a hard rule is dropped as hard_rule; no brief → no hints record
    const hr = sampleGenome(calm, { hints: { G9: [{ value: "color-field", weight: 3 }] } });
    check(hr.brand.G9 !== "color-field" && !!hr.hints?.dropped.some((d) => d.gene === "G9" && d.why === "hard_rule"), "a calm color-field hint was not dropped as hard_rule");
    check(sampleGenome(calm).hints === undefined, "a genome without a brief carries a hints record");
    // hints move the draw (a 3× hint shifts the value's share)
    let hinted = 0;
    let plain = 0;
    for (let s = 0; s < 60; s++) {
      const input = inputOf("editorial", lively, s, { photos: PHOTO_PROFILES[3]!, directionIndex: 0 });
      if (sampleGenome(input, { hints: { G9: [{ value: "tonal", weight: 3 }] } }).brand.G9 === "tonal") hinted++;
      if (sampleGenome(input).brand.G9 === "tonal") plain++;
    }
    check(hinted > plain, `a 3× hint did not raise the share (${hinted} vs ${plain} of 60)`);
  },
});

/* ------------------------------------------------------------------ */
/* distance (DG-05)                                                    */
/* ------------------------------------------------------------------ */

/** A random distance view (property tests): every component exercised, the costly ones included. */
export function randomView(rng: () => number): DistanceView {
  const int = (n: number) => Math.floor(rng() * n);
  const pick = (n: number) => (rng() < 0.08 ? -1 : int(n));
  const hist = (n: number) => {
    const h = Array.from({ length: n }, () => (rng() < 0.5 ? 0 : rng()));
    const s = h.reduce((a, b) => a + b, 0);
    return h.map((x) => (s ? Math.round((x / s) * 1000) / 1000 : 0));
  };
  const lab = (): [number, number, number] => [Math.round(rng() * 1000) / 1000, Math.round((rng() - 0.5) * 300) / 1000, Math.round((rng() - 0.5) * 300) / 1000];
  return {
    v: 2,
    kind: "page",
    locale: (["ar", "fr", "en"] as const)[int(3)]!,
    cat: {
      grammar: pick(9),
      strategy: pick(7),
      treatment: pick(7),
      pairing: pick(6),
      displayFamily: pick(5),
      arDisplay: pick(4),
      bodyAr: pick(3),
      base: pick(3),
      ladder: pick(4),
      mask: pick(7),
      depth: pick(5),
      button: pick(6),
      emphasis: pick(5),
      glyph: pick(4),
      motion: pick(6),
      density: pick(3),
      align: pick(3),
    },
    accent: lab(),
    pop: lab(),
    num: { rd: rng(), w: rng(), space: rng(), area: rng(), ctas: rng(), nSections: rng() },
    hero: pick(12),
    seq: Array.from({ length: int(25) }, () => int(14)),
    tags: hist(7),
    openers: hist(6),
    crops: int(16),
  };
}

registerDesignGroup({
  id: "distance",
  title: "distance: symmetric, d(a,a)=0, [0,1], Σw 40/21/19, bounds-first = full on 10,000 pairs, locale-aware pairing, GEN-12",
  ids: ["DG-05"],
  run({ full, check, note }) {
    check(weightSum("full") === 40 && weightSum("page") === 21 && weightSum("brand") === 19, `Σw ${weightSum("full")} / ${weightSum("page")} / ${weightSum("brand")}`);
    check(weightSum("page") + weightSum("brand") === weightSum("full"), "page + brand ≠ full");
    const rng = mulberry32(20261028);
    const pairs = full ? 50_000 : 10_000;
    let fullComputed = 0;
    let bad = 0;
    for (let i = 0; i < pairs; i++) {
      const a = randomView(rng);
      const b = rng() < 0.15 ? { ...a, cat: { ...a.cat, grammar: (a.cat.grammar + 1) % 9 }, seq: a.seq.slice(1) } : randomView(rng);
      // every pair in the full scope, every fourth in the page and brand scopes too
      for (const scope of i % 4 === 0 ? (["full", "page", "brand"] as const) : (["full"] as const)) {
        const d = genomeDistance(a, b, scope);
        if (!(d >= 0 && d <= 1)) bad++;
        if (Math.abs(d - genomeDistance(b, a, scope)) > 1e-12) bad++;
        const { lo, hi } = bounds(a, b, scope);
        if (lo > d + 1e-12 || hi < d - 1e-12) bad++;
        const tau = [0.12, 0.25, 0.3, 0.4, 0.35][i % 5]!;
        const band = distanceBand(a, b, tau, scope);
        if (band.full) fullComputed++;
        if (band.band !== bandOf(d, tau)) bad++;
      }
      if (i < 2000 && genomeDistance(a, a) !== 0) bad++;
    }
    check(bad === 0, `${bad} property failures over ${pairs} pairs (range, symmetry, bounds, bounds-first band)`);
    note(`${pairs} pairs · the costly components computed for ${((fullComputed / (pairs * 1.5)) * 100).toFixed(1)} % of the band calls`);

    // the locale-aware pairing component (QUAL-28)
    const base = randomView(mulberry32(7));
    const v = (locale: DistanceView["locale"], pairing: number, display: number, arDisplay: number, bodyAr: number): DistanceView => ({ ...base, locale, cat: { ...base.cat, pairing, displayFamily: display, arDisplay, bodyAr } });
    const cases: [DistanceView, DistanceView, number, string][] = [
      [v("fr", 3, 1, 2, 0), v("en", 3, 1, 4, 1), 0, "Latin: same pairing"],
      [v("fr", 3, 1, 2, 0), v("fr", 5, 1, 2, 0), 0.5, "Latin: same display family"],
      [v("fr", 3, 1, 2, 0), v("fr", 5, 2, 2, 0), 1, "Latin: other display family"],
      [v("ar", 3, 1, 2, 0), v("ar", 5, 4, 2, 0), 0, "Arabic: same displayAr and bodyAr"],
      [v("ar", 3, 1, 2, 0), v("ar", 3, 1, 2, 1), 0.5, "Arabic: same displayAr only (same pairing id is not enough)"],
      [v("ar", 3, 1, 2, 0), v("ar", 3, 1, 3, 0), 1, "Arabic: other displayAr"],
      [v("ar", 3, 1, 2, 0), v("fr", 3, 1, 2, 0), 0.5, "cross-locale: both display faces shared"],
      [v("ar", 3, 1, 2, 0), v("fr", 3, 1, 3, 0), 1, "cross-locale: one face differs"],
    ];
    for (const [a, b, want, label] of cases) {
      check(pairingDistance(a, b) === want && pairingDistance(b, a) === want, `${label}: ${pairingDistance(a, b)} (want ${want})`);
    }

    // τ_niche(n) (DES-§7.9): 0.40 ≤ 20, linear to 0.30 at 100, never below τ_platform + 0.05
    const tn: [number, number][] = [[10, 0.4], [20, 0.4], [50, 0.3625], [100, 0.3], [150, 0.3]];
    for (const [n, want] of tn) check(Math.abs(tauNiche(n) - want) < 1e-9, `τ_niche(${n}) = ${tauNiche(n)} (want ${want})`);
    check(tauNiche(1000, 0.32) === 0.3, "τ_niche falls below τ_platform + 0.05");
    check(bandOf(0.3, 0.25) === "ok" && bandOf(0.27, 0.25) === "close" && bandOf(0.2, 0.25) === "too_close", "bandOf edges");
    // the niche key (DES-§7.3): the owner's category, else the copy family, else "general"
    check(nicheKey("MA", "skincare", "fragrance") === "MA:skincare" && nicheKey("FR", null, "modest") === "FR:modest" && nicheKey("MA", null, null) === "MA:general", "nicheKey");
    check(nicheKey("MA", "Skin Care!", undefined) === "MA:general", "nicheKey accepted a raw label");

    // the crowd view: null under k = 10 stores; otherwise it takes the niche's modal values, never a store's vector
    const shares = (n: number): NicheShares => ({ n, grammar: { poster: 0.3, stage: 0.2 }, strategy: { tonal: 0.4 }, heroFamily: { stage: 0.5 }, heroArrangement: {}, displayFamily: { fraunces: 0.2 }, arDisplay: {}, arDisplayClass: {}, motion: { expo: 0.3 }, ghost: {}, seq4: [], tells: [] });
    check(crowdView(shares(0), base) === null && crowdView(shares(9), base) === null, "a crowd view under k = 10 stores");
    const crowd = crowdView(shares(40), base);
    check(!!crowd && crowd.cat.grammar === 1 && crowd.cat.strategy === 3 && crowd.cat.motion === 0 && crowd.seq === base.seq, "the crowd view does not take the modal values");

    // GEN-12: two stores with identical inputs diverge (seeds mix the brand seed, DS5); the run is repelled first
    const dists: number[] = [];
    const runs = full ? 40 : 8;
    for (let r = 0; r < runs; r++) {
      const name = FIXTURE_NAMES[r % FIXTURE_NAMES.length]!;
      const locale = r % 2 ? "ar" : "fr";
      const run = (store: string) => {
        const cands = ([0, 1, 2] as const).map((i) => {
          const { input, doc } = fixtureInput(name, store, i, locale);
          const genome = sampleGenome(input);
          return { input, genome, doc };
        });
        const viewOf = (g: DesignGenome, c: { input: SampleInput }) => {
          const doc = cands[0]!.doc;
          const wg = withSections(g, doc);
          return distanceView(wg, compileGenome(wg, ctxFor(wg, c.input, r)), c.input.locale);
        };
        return repel(cands, [], 0.25, viewOf).candidates.map((c) => viewOf(c.genome, c));
      };
      const A = run(`store-a-${r}`);
      const B = run(`store-b-${r}`);
      for (let i = 0; i < 3; i++) dists.push(genomeDistance(A[i]!, B[i]!));
    }
    const under = dists.filter((d) => d < 0.25).length;
    const mean = dists.reduce((s, d) => s + d, 0) / dists.length;
    check(mean >= 0.25, `GEN-12: mean distance between two identical-input stores ${mean.toFixed(3)} (< 0.25)`);
    // the sampler alone (no platform pool yet): ≥ 85 % of the direction pairs clear the platform band; the novelty
    // service's platform band (too_close resampled in the wizard, hard at publish) catches the rest
    check(under <= dists.length * 0.15, `GEN-12: ${under} of ${dists.length} direction pairs under 0.25`);
    note(`GEN-12: ${dists.length} direction pairs · mean ${mean.toFixed(3)} · min ${Math.min(...dists).toFixed(3)} · ${under} under 0.25`);
  },
});

/* ------------------------------------------------------------------ */
/* the token tables (append-only)                                      */
/* ------------------------------------------------------------------ */

registerDesignGroup({
  id: "tokens-table",
  title: "the distance-view token tables are append-only (committed snapshot)",
  ids: ["DG-05"],
  run({ check }) {
    const lists: [string, readonly string[], readonly string[]][] = [
      ["sections", SECTION_TOKENS, snapshot.sections],
      ["heroes", HERO_TOKENS, snapshot.heroes],
      ["pairings", PAIRING_TOKENS, snapshot.pairings],
      ["fonts", FONT_TOKENS, snapshot.fonts],
    ];
    for (const [name, now, snap] of lists) {
      check(now.length >= snap.length, `${name}: ${snap.length - now.length} token(s) removed`);
      snap.forEach((t, i) => check(now[i] === t, `${name}[${i}]: "${t}" became "${now[i]}" (append only)`));
      check(new Set(now).size === now.length, `${name}: a duplicate token`);
    }
    // every catalogue pairing and every section variant the generator can emit has a token
    for (const p of loadCatalogue().pairings) check(PAIRING_TOKENS.includes(p.id as never), `pairing ${p.id} has no token`);
    for (const s of SECTIONS) for (const v of s.variants) check(SECTION_TOKENS.includes(`${s.type}:${v.id}` as never), `section variant ${s.type}:${v.id} has no token`);
  },
});

/* ------------------------------------------------------------------ */
/* the Director vocabulary (DS59, RD-1 schema part)                    */
/* ------------------------------------------------------------------ */

registerDesignGroup({
  id: "director-vocab",
  title: "GENE_VOCAB (35 genes, 7 bold), bucketOf, task names, AI_REPAIR_OPS; the GenomeCard carries bands only",
  ids: ["DG-02", "RD-1"],
  run({ check }) {
    check(Object.keys(GENE_VOCAB).length === 35 && GENE_KEYS.every((k) => k in GENE_VOCAB), "GENE_VOCAB is not the 35 genes");
    const bold = GENE_KEYS.filter((k) => GENE_VOCAB[k].bold);
    check(JSON.stringify(bold) === JSON.stringify([...BOLD_GENES].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))), `bold genes ${bold.join(",")}`);
    for (const k of GENE_KEYS) {
      const e = GENE_VOCAB[k];
      if (e.kind === "enum") check((e.values?.length ?? 0) > 1 && new Set(e.values).size === e.values!.length, `${k}: an enum without distinct values`);
      if (e.kind === "range") check(!!e.range && e.range[0] < e.range[1] && e.range[2] > 0, `${k}: a bad range`);
    }
    check(JSON.stringify(GENE_VOCAB.G4.values) === JSON.stringify(loadCatalogue().pairings.map((p) => p.id)), "G4 values are not the loaded catalogue");
    const buckets: [Parameters<typeof bucketOf>[0], unknown, string | null][] = [
      ["G5", { rm: 1.2, rd: 1.333, dmax: 96 }, "1.30-1.40"],
      ["G6", { w: 650, wAr: 600, tk: 0.01 }, "600"],
      ["G10", 0.05, "03-08"],
      ["G10", 0.3, "25-35"],
      ["G21", 1.25, "1.25-1.6"],
      ["G23", { f: "mask", d: 640, r: ["mask-wipe"], st: 70, sc: false }, "mask/600-900"],
      ["G3", { c: 12, s: "5:7", m: "offset", w: 1200, u: 8 }, "12/5:7/offset"],
      ["G2", "poster", "poster"],
      ["G2", "brutalist", null],
      ["G32", { budget: 3, openers: [] }, null],
      ["angle", "ritual", "ritual"],
    ];
    for (const [gene, value, want] of buckets) check(bucketOf(gene, value) === want, `bucketOf(${gene}, ${JSON.stringify(value)}) = ${bucketOf(gene, value)} (want ${want})`);
    check(JSON.stringify(DIRECTOR_TASKS) === JSON.stringify(["design.plan", "design.critique", "design.verify"]), "the Director task names");
    check(AI_REPAIR_OPS.length === 9 && !(AI_REPAIR_OPS as readonly string[]).includes("reorderSection"), "AI_REPAIR_OPS");

    // the GenomeCard schema: the distance is three bands and the first-page marker, never a number (DS7)
    const card: GenomeCard = {
      id: "dir-1",
      slot: "best_fit",
      bold: { G1: "maison", G2: "quiet-luxe", G4: "couture", G9: "dark-luxe", G18: "framed", G23: "quint", G28: "poetic-restrained" },
      derived: { ladder: "soft", depth: "hairline" },
      q: 82,
      slop: 1,
      composition: 11,
      gateFails: ["V05"],
      distance: { own: "first", niche: "ok", platform: "close" },
      explanation: ["design.why.onePhoto"],
    };
    check(GenomeCardSchema.safeParse(card).success, "a valid card is refused");
    for (const bad of [
      { ...card, distance: { ...card.distance, niche: 0.31 } },
      { ...card, distance: { ...card.distance, platform: "0.2" } },
      { ...card, distance: { ...card.distance, raw: 0.4 } },
      { ...card, storeId: "s_123" },
    ]) check(!GenomeCardSchema.safeParse(bad).success, `a card with ${JSON.stringify(bad.distance ?? {})} / extra keys is accepted`);
  },
});
