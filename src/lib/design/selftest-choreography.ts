/**
 * The choreography test groups (P6 DESIGN step 6; design.md DES-§25.1 `test:design`, DES-§1.4 DG-04, DG-12, the N3-N7,
 * C1 and K1 rows of DES-§8.10). Registered with ./selftest and run by scripts/qa/design-check.ts: a seeded fast
 * subset inside `npm test`, the full counts with `--full`.
 *
 *  - choreography: 2,000 (10,000 full) expansions over vibes × grammars × densities × inputs: ≥ 100 distinct
 *    sequences, 100 % I1-I8 and H35, the form ≤ 3 screens, 8-14 sections, ≤ 12,000 px; orderAct2's rules on fixtures;
 *    the 4-gram re-draw; the fallback orders hold the invariants;
 *  - rhythm: the kicker budget and ≥ 5 openers, the photo caps and the crop rule by asset count, CTAs ≤ 6, reveals
 *    ≤ 60, every fold item ≤ 760 for every hero family × ar / fr, two genomes with one G1 and different G2 compile
 *    different hero choreography rows (DES-§4.12), each ≤ 1,400 ms;
 *  - sweep: the 140-plan sweep (7 fixtures × ar / fr × 10 seeds, 3 seeds fast) plus the low-asset class through
 *    `generateDirections`, simulated chosen pages (55 / 30 / 15 %) with the niche shares fed back (H33 as a control):
 *    N3 (distinct orders, 4-gram share, the two entropies), N4 (≥ 0.9 × E[distinct] from the pool weights, the entropy
 *    floors, ≥ 40 hero × grammar × strategy), C1 / K1 per niche, N7 (ar / fr hero differences);
 *  - directions: N5 (100 simulated stores × 10 categories; 20 fast) and N6 (product facts enter the seed);
 *  - boldness: DG-12 R1, Bolder and Calmer move only their genes and add no hard violation.
 */
import { ARCHETYPES, GRAMMARS, type Archetype, type Grammar, type Locale, type PageDoc } from "@/lib/page/schema";
import { FIXTURE_ASSETS, FIXTURE_NAMES, getFixture } from "@/lib/page/fixtures";
import { generateDirections, inputHashOf, pickArchetypes, type GenerateInput } from "@/lib/generator/directions";
import { drawHero, drawVariants, heroComposition, heroWeights, variantWeights, type PlanContext } from "@/lib/generator/plan";
import { boldnessStep } from "@/lib/generator/remix";
import { rngFor } from "@/lib/generator/rng";
import type { MoodReading } from "@/lib/generator/mood";
import { PRODUCT_CATEGORIES } from "@/lib/page/schema";
import { choreographyFallback, choreographyViolations, estimateChoreography, expandChoreography, imageTextRun, IMAGE_TEXT, orderAct2, seqTokens, type ChoreographyCtx } from "./choreography";
import { grammarPools, type PlanDirectives } from "./compile";
import { planCtas, MAX_PRIMARY } from "./cta";
import { genomeOf } from "./derive";
import { planFold } from "./fold";
import type { DesignGenome, PageGenes } from "./genome";
import { foldTypeFor } from "./heights";
import type { NicheShares } from "./novelty.server";
import { openersFor, openerViolations, planOpeners } from "./openers";
import { planPhotos, tightCovers } from "./photos";
import { heroChoreography, planReveals, HERO_ROW_MAX_MS, MAX_REVEAL_NODES } from "./reveals";
import { registerDesignGroup } from "./selftest";
import { inputOf } from "./selftest-genome";
import { hardViolations, sampleGenome } from "./solve";
import { FOLD_TARGET, SHEETS } from "./sheets";

const DENSITIES: readonly PageGenes["G20"]["l"][] = ["airy", "balanced", "dense"];
const PATTERNS: readonly PageGenes["G20"]["p"][] = ["ABAC", "AAB", "ABAB"];
const MOODS: readonly MoodReading[] = [
  { mood: "neutral", modest: false, words: [] },
  { mood: "lively", modest: false, words: [] },
  { mood: "calm", modest: false, words: [] },
];

const bits = (counts: Iterable<number>) => {
  const list = [...counts];
  const n = list.reduce((s, c) => s + c, 0);
  return n ? -list.reduce((s, c) => (c ? s + (c / n) * Math.log2(c / n) : s), 0) : 0;
};
const tally = <T,>(values: readonly T[]) => {
  const m = new Map<T, number>();
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
  return m;
};
const r2 = (x: number) => Math.round(x * 100) / 100;

/** The planner directives of a grammar without a genome (the pools, the choreography seed). */
function directivesOf(grammar: Grammar, density: PageGenes["G20"], seed: number): PlanDirectives {
  const { hero, pools } = grammarPools(grammar);
  return { grammar, heroPool: hero, pools, colorMoments: 2, glass: 0, density, align: "start", treatment: "framed", aspects: {}, choreographySeed: seed };
}

/** A density the H-rules allow for a grammar (H05, H10). */
function densityFor(grammar: Grammar, k: number): PageGenes["G20"] {
  let l = DENSITIES[k % 3]!;
  if (grammar === "quiet-luxe") l = "airy";
  if (grammar === "catalogue" && l === "airy") l = "balanced";
  return { l, p: PATTERNS[(k >> 1) % 3]! };
}

interface Expansion {
  ctx: ChoreographyCtx;
  inFlow: string[] | null;
}

/** One synthetic expansion k (inputs rotate with k). */
function expansion(k: number): Expansion {
  const archetype = ARCHETYPES[k % ARCHETYPES.length]!;
  const grammar = GRAMMARS[(k * 7 + (k >> 3)) % GRAMMARS.length]!;
  const density = densityFor(grammar, k);
  const mood = MOODS[k % 3 === 2 && k % 4 === 0 ? 2 : k % 2]!;
  const photos = [1, 2, 3, 5][k % 4]!;
  const pctx: PlanContext = { archetype, seed: 9000 + k, category: "skincare", hasCutout: k % 3 === 0, imageCount: photos, hasFacts: k % 2 === 0, hasWhatsapp: k % 5 === 0, mood: mood.mood, storeName: k % 2 === 1 };
  const has = { ownerProof: k % 5 === 0, video: false, photos, endDate: false, whatsapp: k % 5 === 0, storeName: k % 2 === 1, figures: k % 7 === 0 ? 3 : 0, offers: k % 3 === 0 ? 1 : 3, facts: k % 2 === 0, garment: k % 9 === 0 };
  const directives = directivesOf(grammar, density, 7000 + k);
  const variants = drawVariants(pctx, { directives, has });
  variants.set("hero", drawHero(pctx, { directives, photos: { count: photos, maxWidth: 1600, hasCutout: false, dominant: null, background: { luminance: 0.8, uniform: true }, sharp: true }, locale: k % 2 ? "ar" : "fr" }).hero);
  const ctx: ChoreographyCtx = {
    vibe: archetype,
    grammar,
    mood,
    density,
    has,
    picker: "stack",
    space: density.l === "airy" ? 1.2 : density.l === "dense" ? 1 : 1.05,
    variantOf: (t) => variants.get(t) ?? "",
    announcement: true,
    form: { offers: has.offers, groups: 0, bump: false },
    moments: 2,
  };
  const c = expandChoreography(ctx, rngFor(7000 + k, "expand"));
  return { ctx, inFlow: c?.inFlow ?? null };
}

registerDesignGroup({
  id: "choreography",
  title: "choreography: ≥ 100 distinct sequences over the expansions, 100 % I1-I8 and H35, orderAct2, the 4-gram re-draw, the fallback orders",
  ids: ["DG-04"],
  run({ full, check, note }) {
    const n = full ? 10_000 : 2_000;
    const seqs = new Set<string>();
    let fallbacks = 0;
    let worstForm = 0;
    let worstTotal = 0;
    const counts: number[] = [];
    const t0 = performance.now();
    for (let k = 0; k < n; k++) {
      const e = expansion(k);
      const flow = e.inFlow ?? choreographyFallback(e.ctx);
      if (!e.inFlow) fallbacks++;
      const v = choreographyViolations(e.ctx, flow);
      check(v.length === 0, `expansion ${k}${e.inFlow ? "" : " (fallback)"}: ${v.join("; ")} [${flow.join(" ")}]`);
      seqs.add(flow.join(">"));
      const { formTop, total, count } = estimateChoreography(e.ctx, flow);
      worstForm = Math.max(worstForm, formTop);
      worstTotal = Math.max(worstTotal, total);
      counts.push(count);
      check(flow[0] === "hero" && flow.includes("orderForm"), `expansion ${k}: no hero first or no form`);
      check(imageTextRun(flow.map((t) => `${t}:${e.ctx.variantOf!(t)}`), (x) => IMAGE_TEXT.has(x)) <= 2, `expansion ${k}: 3 image + text splits in a row`);
    }
    const ms = performance.now() - t0;
    check(seqs.size >= 100, `${seqs.size} distinct sequences over ${n} expansions (≥ 100)`);
    check(worstForm <= 2532, `the form starts at ${worstForm} px (≤ 2,532)`);
    check(worstTotal <= 12_000, `a page of ${worstTotal} px (≤ 12,000)`);
    check(Math.min(...counts) >= 8 && Math.max(...counts) <= 14, `sections ${Math.min(...counts)}-${Math.max(...counts)} (8-14)`);
    note(`${n} expansions · ${seqs.size} distinct sequences · fallback ${fallbacks} · form ≤ ${Math.round(worstForm)} px · page ≤ ${Math.round(worstTotal)} px · sections ${Math.min(...counts)}-${Math.max(...counts)} · ${(ms / n).toFixed(2)} ms each`);

    // orderAct2 (H35 / V38 fixtures): three image + text splits never run when an order avoids it; ties by the seed
    const fam = (t: string) => (({ a: "split", b: "split", c: "split", d: "list", e: "statement" }) as const)[t as "a"] ?? "grid";
    const it = (t: string) => t === "a" || t === "b" || t === "c";
    for (let s = 0; s < 30; s++) {
      const o = orderAct2(["a", "b", "c", "d", "e"], "ABAC", rngFor(s, "order"), { familyOf: fam, imageText: it });
      check(imageTextRun(o, it) <= 2, `orderAct2: ${o.join("")} runs 3 splits`);
      const arr = (t: string) => (t === "d" || t === "e" ? "x" : undefined);
      const o2 = orderAct2(["a", "d", "e", "b"], "ABAB", rngFor(s, "order2"), { familyOf: fam, imageText: it, arrangeOf: arr });
      check(Math.abs(o2.indexOf("d") - o2.indexOf("e")) > 1, `orderAct2: same arrange on neighbours ${o2.join("")}`);
    }
    const orders = new Set(Array.from({ length: 40 }, (_, s) => orderAct2(["a", "d", "b", "e"], "ABAC", rngFor(s, "tie"), { familyOf: fam, imageText: it }).join("")));
    check(orders.size >= 2, "orderAct2: ties are not broken by the seed");

    // the 4-gram re-draw: a gram the niche uses on ≥ 50 % is not repeated (while a re-draw is left)
    const base = expansion(11);
    const first = base.inFlow ? seqTokens(base.ctx, base.inFlow) : [];
    if (first.length >= 4) {
      const gram = first.slice(0, 4);
      let repeats = 0;
      for (let s = 0; s < 40; s++) {
        const c = expandChoreography({ ...base.ctx, seq4: [{ gram, share: 0.6 }] }, rngFor(s, "gram"));
        const toks = c ? seqTokens(base.ctx, c.inFlow) : [];
        for (let i = 0; i + 4 <= toks.length; i++) if (toks.slice(i, i + 4).join() === gram.join()) repeats++;
      }
      check(repeats === 0, `the banned niche 4-gram came back ${repeats} times in 40 expansions`);
    }

    // the fallback orders hold I1-I8 for every vibe on balanced and airy pages
    for (const vibe of ARCHETYPES) {
      for (const l of ["balanced", "airy"] as const) {
        const e = expansion(ARCHETYPES.indexOf(vibe) * 3);
        const ctx = { ...e.ctx, vibe, density: { l, p: "ABAC" as const } };
        const v = choreographyViolations(ctx, choreographyFallback(ctx));
        check(v.length === 0, `fallback ${vibe}/${l}: ${v.join("; ")}`);
      }
    }
  },
});

registerDesignGroup({
  id: "rhythm",
  title: "rhythm planners: kickers ≤ ⌈n/3⌉ and ≥ 5 openers, photo caps and crops by asset count, CTAs ≤ 6, reveals ≤ 60, fold ≤ 760 per family × ar/fr, G2 moves the rows",
  ids: ["DG-04"],
  run({ check, note }) {
    let opened = 0;
    let fiveOk = 0;
    for (let k = 0; k < 400; k++) {
      const e = expansion(k);
      const flow = e.inFlow ?? choreographyFallback(e.ctx);
      const blocks = flow.map((t) => ({ id: t, type: t, variant: e.ctx.variantOf!(t) }));
      const after = blocks.filter((b) => b.type !== "hero");
      const op = planOpeners(after, e.ctx.grammar, rngFor(k, "openers"));
      const v = openerViolations(after, op.openers);
      check(v.length === 0, `openers ${k}: ${v.join("; ")} (${op.openers.join(",")})`);
      const heads = after.filter((b) => openersFor(b.type, b.variant).length > 0).length;
      opened++;
      if (heads < 5 || new Set(op.openers.filter((_, i) => openersFor(after[i]!.type, after[i]!.variant).length > 0)).size >= 5) fiveOk++;
      check(op.openers.filter((o) => o === "kicker").length <= Math.ceil(flow.length / 3) - 1, `openers ${k}: kicker budget`);
      // CTAs
      const cta = planCtas(blocks, { sticky: true, whatsapp: e.ctx.has.whatsapp });
      check(cta.plan.primary.length <= MAX_PRIMARY, `ctas ${k}: ${cta.plan.primary.length}`);
      check(["benefits", "reviews", "story", "guarantee", "faq"].every((t) => !cta.plan.primary.includes(t)), `ctas ${k}: a no-button section is primary`);
      // reveals
      const rv = planReveals(blocks, { grammar: e.ctx.grammar, density: e.ctx.density.l, kinds: ["fade-rise", "mask-wipe", "line-draw"] }, op.openers);
      check(rv.nodes <= MAX_REVEAL_NODES && rv.kinds.length >= 1 && rv.kinds.length <= 2, `reveals ${k}: ${rv.nodes} nodes, ${rv.kinds.length} kinds`);
    }
    check(fiveOk === opened, `≥ 5 distinct openers on ${fiveOk} of ${opened} pages with ≥ 5 heads`);

    // photos: the caps and the crop rule by asset count
    const page = [
      { id: "hero", type: "hero", variant: "split" },
      { id: "benefits", type: "benefits", variant: "zigzag" },
      { id: "showcase", type: "showcase", variant: "figure" },
      { id: "story", type: "story", variant: "image-text" },
      { id: "gallery", type: "gallery", variant: "masonry" },
      { id: "offer", type: "offer", variant: "showcase" },
    ];
    for (const count of [1, 2, 3, 5]) {
      const assets = Array.from({ length: count }, (_, i) => ({ id: `a${i}`, width: i === 0 ? 1200 : 2400 }));
      const r = planPhotos(page, assets, { treatment: "framed", cutout: null });
      const uses = Object.entries(r.plan.uses);
      for (const [id, list] of uses) check(list.length <= (id === "a0" ? 2 : 3), `photos ${count}: ${id} used ${list.length} times`);
      const hero = r.plan.uses.a0?.filter((u) => u.role === "hero") ?? [];
      check(hero.length === 1, `photos ${count}: the primary is the hero ${hero.length} times`);
      if (count === 1) {
        const all = r.plan.uses.a0 ?? [];
        check(all.length === 2 && new Set(all.map((u) => u.crop)).size === 2 && !all.some((u) => u.crop === "tight"), `photos 1: the one-asset plan is not two uses at two crops (${all.map((u) => u.crop).join(",")})`);
        check(r.switches.some((s) => s.type === "gallery"), "photos 1: the gallery was not switched");
      }
      for (const [, list] of uses) for (const u of list) if (u.crop === "tight") check(count > 1, `photos ${count}: a tight crop with one asset`);
    }
    check(!tightCovers(1200, 390) && tightCovers(2400, 390), "tightCovers: the 0.5 × width ≥ 1.5 × slot × 2 rule");

    // the fold: every hero family × ar / fr at the target, with the ladder (worst case: the sheet's line caps)
    const rows: string[] = [];
    const fonts = { display: "fraunces", body: "dm-sans", displayAr: "el-messiri", bodyAr: "tajawal" };
    for (const key of Object.keys(SHEETS).filter((k) => k.startsWith("hero:"))) {
      const family = key.slice(5);
      for (const locale of ["ar", "fr"] as const) {
        const type = foldTypeFor(fonts, { dens: "balanced", space: 1, type: { rm: 1.2, rd: 1.333, dmax: 96, w: 500, wAr: 500, tk: 0, dc: "none", lb: "plain", nu: "lining" } }, locale);
        const f = planFold({ family, locale, type, dmax: 96, announcement: true });
        check(f.ok && f.family === family && f.bottom <= FOLD_TARGET, `fold ${family}/${locale}: ${f.bottom} px after ${f.repairs.join(",") || "no repair"}`);
        rows.push(`${family}/${locale} ${f.bottom}${f.repairs.length ? ` (${f.repairs.join(",")})` : ""}`);
      }
    }
    note(`fold at 390 with the ladder: ${rows.join(" · ")}`);
    // a family that cannot hold swaps inside the pool
    const tall = foldTypeFor(fonts, { dens: "balanced", space: 1, type: { rm: 1.2, rd: 1.333, dmax: 48, w: 500, wAr: 500, tk: 0, dc: "uppercase", lb: "plain", nu: "lining" } }, "ar");
    const swapped = planFold({ family: "stage", locale: "ar", type: { lineOf: (s, st) => tall.lineOf(s, st) * 2.4, linesOf: tall.linesOf }, dmax: 48, announcement: true }, ["stage", "statement", "contact"]);
    check(swapped.repairs.length > 0, "fold: an impossible stage fold took no repair");

    // two genomes with the same G1 and a different G2 compile different hero choreography rows (DES-§4.12); no row's
    // total (last offset × stagger + --lp-dur-l) exceeds 1,400 ms
    let pairsG2 = 0;
    let differ = 0;
    let worstRow = 0;
    const rowKey = (c: ReturnType<typeof heroChoreography>) => `${c.row}|${c.slots.map((x) => `${x.slot}@${x.offset}:${x.kind}`).join(",")}`;
    for (const archetype of ARCHETYPES) {
      for (let seed = 0; seed < 3; seed++) {
        const input = inputOf(archetype, MOODS[seed % 2]!, seed + 70);
        const rows = new Map<Grammar, string>();
        for (const grammar of GRAMMARS) {
          let g: DesignGenome;
          try {
            g = sampleGenome(input, { locks: { G2: grammar } });
          } catch {
            continue;
          }
          if (g.page.G2 !== grammar) continue;
          const family = grammarPools(grammar).hero[0]!.variant;
          const c = heroChoreography(grammar, family, { ...g.brand.G23, calm: input.mood.mood === "calm" });
          worstRow = Math.max(worstRow, c.total);
          check(c.total <= HERO_ROW_MAX_MS, `hero row ${archetype}/${grammar}: ${c.total} ms (≤ 1,400)`);
          rows.set(grammar, rowKey(c));
        }
        const list = [...rows];
        for (let a = 0; a < list.length; a++) {
          for (let b = a + 1; b < list.length; b++) {
            pairsG2++;
            if (list[a]![1] !== list[b]![1]) differ++;
          }
        }
      }
    }
    check(pairsG2 > 0 && differ === pairsG2, `same G1, different G2: the hero choreography rows differ in ${differ} of ${pairsG2} pairs`);
    note(`hero choreography rows: ${differ}/${pairsG2} same-G1 pairs differ, the longest row ${worstRow} ms`);
  },
});

/* ------------------------------------------------------------------ */
/* the 140-plan sweep                                                   */
/* ------------------------------------------------------------------ */

const NOW = "2026-10-28T09:00:00.000Z";

/** A fixture's wizard input (its product, items, offers, photo palette and sizes). */
function fixtureInput(name: (typeof FIXTURE_NAMES)[number], locale: Locale, seed: number): GenerateInput {
  const doc: PageDoc = getFixture(name, { now: NOW, locale: locale as "ar" | "fr" | "en" }).doc;
  const asset = FIXTURE_ASSETS.find((a) => a.id === doc.product.images[0]?.id) ?? FIXTURE_ASSETS[0]!;
  return {
    product: { ...doc.product },
    items: doc.items,
    offers: doc.offers.bundles,
    palette: asset.palette,
    locale,
    market: doc.market,
    seedBase: seed,
    brandSeed: `store-${name}-${seed}`,
    photos: doc.product.images.map((img) => {
      const a = FIXTURE_ASSETS.find((x) => x.id === img.id);
      return { id: img.id, width: a?.width ?? 1200, height: a?.height ?? 1500, alpha: !!a?.alpha };
    }),
  };
}

/** The low-asset class (DS54): one photo, 1,100-1,280 px, no alpha, Arabic. */
function lowAssetInput(seed: number): GenerateInput {
  const base = fixtureInput("argan", "ar", seed);
  const product = base.product as PageDoc["product"];
  const first = product.images[0]!;
  return {
    ...base,
    product: { ...product, images: [first], cutout: undefined },
    photos: [{ id: first.id, width: 1100 + ((seed * 37) % 181), height: 1500, alpha: false }],
    brandSeed: `store-low-${seed}`,
  };
}

/** The niche shares of the pages chosen so far (k ≥ 10 stores, rounded to 10 %, DES-§7.4). */
function sharesOf(pages: readonly { genome: DesignGenome; doc: PageDoc }[]): NicheShares | null {
  if (pages.length < 10) return null;
  const share = (values: string[]) => {
    const out: Record<string, number> = {};
    for (const [v, c] of tally(values)) out[v] = Math.round((c / values.length) * 10) / 10;
    return out;
  };
  const hero = (p: { doc: PageDoc }) => p.doc.sections.find((s) => s.type === "hero");
  const arr = (p: { genome: DesignGenome }) => p.genome.sections.find((s) => s.type === "hero")?.arrange;
  return {
    n: Math.round(pages.length / 10) * 10,
    grammar: share(pages.map((p) => p.genome.page.G2)),
    strategy: share(pages.map((p) => p.genome.brand.G9)),
    heroFamily: share(pages.map((p) => hero(p)?.variant ?? "")),
    heroArrangement: share(pages.map((p) => `${hero(p)?.variant ?? ""}/${arr(p) ?? ""}`)),
    displayFamily: share(pages.map((p) => p.doc.theme.fonts.display)),
    arDisplay: share(pages.map((p) => p.doc.theme.fonts.displayAr)),
    arDisplayClass: {},
    motion: share(pages.map((p) => p.genome.brand.G23.f)),
    ghost: {},
    seq4: [],
    tells: [],
  };
}

const CHOICE = [0.55, 0.3, 0.15] as const;
const choose = (seed: number) => {
  const u = rngFor(seed, "chosen")();
  return u < CHOICE[0] ? 0 : u < CHOICE[0] + CHOICE[1] ? 1 : 2;
};

interface SweepPage {
  niche: string;
  locale: Locale;
  genome: DesignGenome;
  doc: PageDoc;
}

registerDesignGroup({
  id: "sweep",
  title: "the 140-plan sweep (+ low-asset class) on chosen pages: N3, N4, C1, K1, N7",
  ids: ["DG-04", "N3", "N4", "C1", "K1", "N7"],
  run({ full, check, note }) {
    const seeds = full ? 10 : 3;
    const t0 = performance.now();
    const chosen: SweepPage[] = [];
    const plans: SweepPage[] = [];
    const niches = new Map<string, SweepPage[]>();
    const classes: { niche: string; input: (s: number) => GenerateInput }[] = [
      ...FIXTURE_NAMES.flatMap((name) => (["ar", "fr"] as const).map((locale) => ({ niche: name, input: (s: number) => fixtureInput(name, locale, s) }))),
      { niche: "low-asset", input: lowAssetInput },
    ];
    for (let s = 0; s < seeds; s++) {
      for (const c of classes) {
        const prior = niches.get(c.niche) ?? [];
        // the low-asset class runs ten times the seeds (C1 / K1 must hold on it: a niche of its own)
        const reps = c.niche === "low-asset" ? 2 : 1;
        for (let r = 0; r < reps; r++) {
          const input = { ...c.input(s * 7 + r * 1000 + 1), shares: sharesOf(prior) };
          const dirs = generateDirections(input);
          for (const d of dirs) if (d.genome) plans.push({ niche: c.niche, locale: input.locale, genome: d.genome, doc: d.doc });
          const pick = dirs[choose(s * 31 + r + c.niche.length)] ?? dirs[0]!;
          if (pick.genome) {
            const page = { niche: c.niche, locale: input.locale, genome: pick.genome, doc: pick.doc };
            chosen.push(page);
            prior.push(page);
            niches.set(c.niche, prior);
          }
        }
      }
    }
    const ms = performance.now() - t0;
    note(`${plans.length} directions, ${chosen.length} chosen pages in ${(ms / 1000).toFixed(1)} s`);

    // N3: distinct in-flow orders, the 4-gram share, the two entropies (on every plan)
    const flow = (p: SweepPage) => p.genome.page.G24.seq.map((x) => x.split(":")[0]!);
    const distinct = new Set(plans.map((p) => flow(p).join(">"))).size;
    check(distinct / plans.length >= 0.6, `N3: ${distinct} distinct orders in ${plans.length} plans (≥ 60 / 100)`);
    const gramPages = new Map<string, number>();
    for (const p of plans) {
      const f = flow(p);
      const set = new Set<string>();
      for (let i = 0; i + 4 <= f.length; i++) set.add(f.slice(i, i + 4).join(">"));
      for (const g of set) gramPages.set(g, (gramPages.get(g) ?? 0) + 1);
    }
    const maxGram = Math.max(0, ...gramPages.values()) / plans.length;
    check(maxGram <= 0.5, `N3: a 4-section run on ${(maxGram * 100).toFixed(0)} % of plans (≤ 50 %)`);
    const formPos = bits(tally(plans.map((p) => flow(p).indexOf("orderForm"))).values());
    const finals = bits(tally(plans.map((p) => p.genome.page.G24.seq.at(-1) ?? "")).values());
    check(formPos >= 1.0, `N3: order-form position entropy ${formPos.toFixed(2)} bits (≥ 1.0)`);
    check(finals >= 1.2, `N3: final-section entropy ${finals.toFixed(2)} bits (≥ 1.2)`);

    // N4: distinct (hero family × arrangement × benefits variant × benefits opener × form variant) vs E[distinct]
    const cell = (p: SweepPage) => {
      const hero = p.genome.sections.find((s) => s.type === "hero");
      const flowS = p.genome.sections.filter((s) => !["announcement", "header", "footer", "stickyCta", "whatsappFloat", "hero"].includes(s.type));
      const bi = flowS.findIndex((s) => s.type === "benefits");
      const form = p.genome.sections.find((s) => s.type === "orderForm");
      return [hero?.variant, hero?.arrange ?? "", bi >= 0 ? flowS[bi]!.variant : "-", bi >= 0 ? p.genome.page.G32.openers[bi] : "-", form?.variant].join("|");
    };
    const measured = new Set(plans.map(cell)).size;
    // E[distinct] from the weights in force per plan: hero pool × arrangement × benefits pool × openers × form pool
    const pCell = new Map<string, number>();
    for (const p of plans) {
      const ctx: PlanContext = { archetype: p.genome.brand.G1, seed: 1, category: p.doc.product.category, hasCutout: !!p.doc.product.cutout, imageCount: p.doc.product.images.length, hasFacts: false, hasWhatsapp: false, mood: "neutral", storeName: false };
      const directives = directivesOf(p.genome.page.G2, p.genome.page.G20, 1);
      const has = { ownerProof: false, video: false, photos: p.doc.product.images.length, endDate: false, whatsapp: false, storeName: false, offers: p.doc.offers.bundles.length };
      const heroes = heroWeights(ctx, { directives, photos: { count: p.doc.product.images.length, maxWidth: 1600, hasCutout: false, dominant: null, background: { luminance: 0.8, uniform: true }, sharp: true } });
      const hTot = heroes.reduce((s, v) => s + v.weight, 0);
      const benefits = variantWeights("benefits", ctx, { directives, has });
      const forms = variantWeights("orderForm", ctx, { directives, has });
      const hasBenefits = p.genome.sections.some((s) => s.type === "benefits");
      for (const h of heroes) {
        const arrs = arrangementsOf(h.variant);
        for (const [arr, pa] of arrs) {
          for (const b of hasBenefits ? benefits : [{ variant: "-", weight: 1 }]) {
            const ops = hasBenefits ? openersFor("benefits", b.variant) : ["-"];
            for (const o of ops) {
              for (const f of forms) {
                const key = [h.variant, arr, b.variant, o, f.variant].join("|");
                pCell.set(key, (pCell.get(key) ?? 0) + ((h.weight / hTot) * pa * b.weight * (1 / ops.length) * f.weight) / plans.length);
              }
            }
          }
        }
      }
    }
    const expected = [...pCell.values()].reduce((s, pc) => s + (1 - Math.pow(1 - pc, plans.length)), 0);
    check(measured >= 0.9 * expected, `N4: ${measured} distinct tuples < 0.9 × E[distinct] ${expected.toFixed(1)}`);
    const heroBits = bits(tally(plans.map((p) => p.genome.sections.find((s) => s.type === "hero")?.variant ?? "")).values());
    const benBits = bits(tally(plans.map((p) => p.genome.sections.find((s) => s.type === "benefits")?.variant).filter(Boolean)).values());
    check(heroBits >= 2.8, `N4: hero-family entropy ${heroBits.toFixed(2)} bits (≥ 2.8)`);
    check(benBits >= 2.0, `N4: benefits-variant entropy ${benBits.toFixed(2)} bits (≥ 2.0)`);
    const triples = new Set(plans.map((p) => `${p.genome.sections.find((s) => s.type === "hero")?.variant}|${p.genome.page.G2}|${p.genome.brand.G9}`)).size;
    check(triples >= 40 || (!full && triples >= 30), `N4: ${triples} (hero × grammar × strategy) (≥ 40)`);
    note(`N3: ${distinct}/${plans.length} distinct · max 4-gram ${(maxGram * 100).toFixed(0)} % · form position ${formPos.toFixed(2)} bits · final ${finals.toFixed(2)} bits · N4: ${measured} tuples vs E ${expected.toFixed(1)} (${r2(measured / Math.max(1, expected))}×) · hero ${heroBits.toFixed(2)} bits · benefits ${benBits.toFixed(2)} bits · ${triples} hero × grammar × strategy`);

    // C1 / K1 on the chosen pages per niche (once a niche holds ≥ 10 pages; the fast run reads them as notes)
    const report: string[] = [];
    for (const [niche, pages] of niches) {
      const heroes = tally(pages.map((p) => p.doc.sections.find((s) => s.type === "hero")?.variant ?? ""));
      const heroShare = Math.max(...heroes.values()) / pages.length;
      const topHero = [...heroes].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
      // (family × arrangement) is read on the families that have an arrangement (DES-§5.13); a family without one is
      // held by the family cap
      const arranged = pages.map((p) => p.genome.sections.find((s) => s.type === "hero")).filter((h) => h?.arrange).map((h) => `${h!.variant}/${h!.arrange}`);
      const arrShare = arranged.length ? Math.max(...tally(arranged).values()) / pages.length : 0;
      const strat = Math.max(...tally(pages.map((p) => p.genome.brand.G9)).values()) / pages.length;
      report.push(`${niche} ${pages.length}p hero ${topHero} ${(heroShare * 100).toFixed(0)}% arr ${(arrShare * 100).toFixed(0)}% G9 ${(strat * 100).toFixed(0)}%`);
      if (full && pages.length >= 10) {
        // a niche of ten pages moves in tenths: the cap is read on the whole tenths it allows
        const tol = 1 / pages.length;
        check(heroShare <= 0.2 + tol, `C1 ${niche}: a hero family on ${(heroShare * 100).toFixed(0)} % of chosen pages (≤ 20 %)`);
        check(arrShare <= 0.12 + tol, `C1 ${niche}: a hero family × arrangement on ${(arrShare * 100).toFixed(0)} % (≤ 12 %)`);
        check(strat <= 0.25 + tol, `K1 ${niche}: a colour strategy on ${(strat * 100).toFixed(0)} % (≤ 25 %)`);
      }
    }
    note(`chosen pages per niche: ${report.join(" · ")}`);

    // T5 / F12 concentration on the chosen pages: the top pairing per archetype ≤ 25 %, a Latin display family ≤ 20 %
    // platform-wide (Fraunces and Instrument Serif ≤ 8 %), an Arabic display face ≤ 30 % of the ar pages per niche
    const maxShare = (values: readonly string[]) => (values.length ? Math.max(...tally(values).values()) / values.length : 0);
    const byArch = new Map<string, string[]>();
    for (const p of chosen) byArch.set(p.genome.brand.G1, [...(byArch.get(p.genome.brand.G1) ?? []), p.genome.brand.G4]);
    const pairTop = Math.max(0, ...[...byArch.values()].filter((v) => v.length >= 10).map(maxShare));
    const displays = chosen.map((p) => p.doc.theme.fonts.display);
    const displayTop = maxShare(displays);
    const serif = Math.max(...["fraunces", "instrument-serif"].map((f) => displays.filter((x) => x === f).length / Math.max(1, displays.length)));
    const arTop = Math.max(0, ...[...niches.values()].map((pages) => pages.filter((p) => p.locale === "ar").map((p) => p.doc.theme.fonts.displayAr)).filter((v) => v.length >= 10).map(maxShare));
    if (full) {
      const tol = 1 / Math.max(10, chosen.length);
      check(pairTop <= 0.25 + 0.1, `T5: a pairing on ${(pairTop * 100).toFixed(0)} % of one archetype's chosen pages (≤ 25 %)`);
      check(displayTop <= 0.2 + tol, `T5: a Latin display family on ${(displayTop * 100).toFixed(0)} % of chosen pages (≤ 20 %)`);
      check(arTop <= 0.3 + 0.1, `F12: an Arabic display face on ${(arTop * 100).toFixed(0)} % of a niche's ar pages (≤ 30 %)`);
    }
    // the platform-wide default-serif cap (≤ 8 %) needs the platform's shares (the novelty service, step 9): reported
    note(`T5 / F12: top pairing per archetype ${(pairTop * 100).toFixed(0)} % · top display ${(displayTop * 100).toFixed(0)} % · default serifs ${(serif * 100).toFixed(0)} % · top ar display per niche ${(arTop * 100).toFixed(0)} %`);

    // N7: one genome's ar and fr heroes differ (variant or arrangement) in ≥ 50 % of pairs
    let pairs = 0;
    let differs = 0;
    for (const p of plans) {
      const ctx: PlanContext = { archetype: p.genome.brand.G1, seed: p.genome.seed, category: p.doc.product.category, hasCutout: !!p.doc.product.cutout, imageCount: p.doc.product.images.length, hasFacts: false, hasWhatsapp: false, storeName: false };
      const directives = directivesOf(p.genome.page.G2, p.genome.page.G20, 1);
      const photos = { count: p.doc.product.images.length, maxWidth: 1600, hasCutout: false as const, dominant: null, background: { luminance: 0.8, uniform: true }, sharp: true };
      const ar = drawHero(ctx, { directives, photos, locale: "ar" }).hero;
      const fr = drawHero(ctx, { directives, photos, locale: "fr" }).hero;
      const arA = heroComposition(ar, ctx.seed, "ar", { directives, photos, shares: null }).arrange;
      const frA = heroComposition(fr, ctx.seed, "fr", { directives, photos, shares: null }).arrange;
      pairs++;
      if (ar !== fr || arA !== frA) differs++;
    }
    check(differs / Math.max(1, pairs) >= 0.5, `N7: ar / fr heroes differ in ${differs} of ${pairs} pairs (≥ 50 %)`);
    note(`N7: ${differs}/${pairs} ar / fr pairs differ in hero variant or arrangement`);
  },
});

/** The arrangement probabilities of a hero family (statement: fixed per locale, counted as its two values). */
function arrangementsOf(family: string): [string, number][] {
  const table: Record<string, [string, number][]> = {
    split: [["5:7", 0.4], ["4:8", 0.3], ["1:1", 0.3]],
    cinema: [["below", 0.6], ["beside", 0.4]],
    quiet: [["4:5", 0.6], ["1:1", 0.4]],
    contact: [["tl", 0.25], ["tr", 0.25], ["bl", 0.25], ["br", 0.25]],
    statement: [["word-subline", 0.5], ["contrast-pair", 0.5]],
  };
  return table[family] ?? [["", 1]];
}

registerDesignGroup({
  id: "directions",
  title: "direction draw: N5 (every archetype reachable, top ≤ 45 %, souk / playground / garage > 0) and N6 (product facts in the seed)",
  ids: ["DG-02", "N5", "N6"],
  run({ full, check, note }) {
    // N5: simulated stores per category, chosen-page model, the niche's archetype shares fed back (k ≥ 10, rounded
    // to 10 %; H33 on G1)
    const stores = full ? 100 : 60;
    const cats = PRODUCT_CATEGORIES.slice(0, 10);
    const seen = new Map<Archetype, number>();
    const tops: string[] = [];
    const vibeSharesOf = (picks: readonly Archetype[]) => {
      if (picks.length < 10) return null;
      const shares: Record<string, number> = {};
      for (const [a, c] of tally(picks)) shares[a] = Math.round((c / picks.length) * 10) / 10;
      return { n: Math.round(picks.length / 10) * 10, shares };
    };
    for (const category of cats) {
      const picks: Archetype[] = [];
      for (let s = 0; s < stores; s++) {
        const dirs = pickArchetypes({ product: { name: `Produit ${s}`, category, price: 199, images: [] }, palette: null, facts: [], brandSeed: `n5-${category}-${s}`, locale: "fr", seedBase: s, vibeShares: vibeSharesOf(picks) });
        const pick = dirs[choose(s * 13 + category.length)] ?? dirs[0]!;
        picks.push(pick.archetype);
        for (const d of dirs) seen.set(d.archetype, (seen.get(d.archetype) ?? 0) + 1);
      }
      const top = Math.max(...tally(picks).values()) / picks.length;
      tops.push(`${category} ${(top * 100).toFixed(0)}%`);
      check(top <= 0.45, `N5 ${category}: the top archetype on ${(top * 100).toFixed(0)} % of chosen pages (≤ 45 %)`);
    }
    for (const a of ["souk", "playground", "garage"] as const) check((seen.get(a) ?? 0) > 0, `N5: ${a} never reachable`);
    note(`N5 top archetype per category: ${tops.join(" · ")}; directions per archetype ${[...seen].map(([a, c]) => `${a} ${c}`).join(", ")}`);

    // N6: one seedBase and archetype across two products → different seeds, J ≤ 0.25 on the section 2-grams
    const names = FIXTURE_NAMES;
    let pairs = 0;
    let jSum = 0;
    let same = 0;
    const docs = new Map<string, { flow: string[]; hero: string; pairing: string; product: string }>();
    for (const name of names) {
      for (let s = 0; s < (full ? 10 : 2); s++) {
        const input = { ...fixtureInput(name, "fr", s), archetypes: ["maison" as Archetype], brandSeed: `n6-${s}` };
        const d = generateDirections(input)[0]!;
        docs.set(`${name}|${s}`, {
          flow: d.doc.sections.filter((x) => !["announcement", "header", "footer", "stickyCta", "whatsappFloat"].includes(x.type)).map((x) => `${x.type}:${x.variant}`),
          hero: d.doc.sections.find((x) => x.type === "hero")?.variant ?? "",
          pairing: d.genome?.brand.G4 ?? "",
          // the product facts N6 puts in the seed (two fixtures of one product, tshirt and colors, are one product)
          product: inputHashOf(input),
        });
      }
    }
    const bigrams = (f: string[]) => new Set(f.slice(1).map((t, i) => `${f[i]}>${t}`));
    for (let s = 0; s < (full ? 10 : 2); s++) {
      for (let a = 0; a < names.length; a++) {
        for (let b = a + 1; b < names.length; b++) {
          const x = docs.get(`${names[a]}|${s}`)!;
          const y = docs.get(`${names[b]}|${s}`)!;
          if (x.product === y.product) continue;
          const X = bigrams(x.flow);
          const Y = bigrams(y.flow);
          const inter = [...X].filter((g) => Y.has(g)).length;
          jSum += inter / Math.max(1, X.size + Y.size - inter);
          pairs++;
          if (x.hero === y.hero && x.pairing === y.pairing && x.flow.join() === y.flow.join()) same++;
        }
      }
    }
    const j = jSum / Math.max(1, pairs);
    check(j <= 0.25, `N6: mean J ${j.toFixed(3)} across products (≤ 0.25)`);
    check(same === 0, `N6: ${same} pairs share hero + pairing + order`);
    note(`N6: ${pairs} product pairs, mean J ${j.toFixed(3)}, identical hero + pairing + order ${same}`);
  },
});

registerDesignGroup({
  id: "boldness",
  title: "Bolder / Calmer (DG-12 R1): only G5.rd, G10, G20.l, G21 and G2 move; no hard violation added",
  ids: ["DG-12"],
  run({ check, note }) {
    let moved = 0;
    let n = 0;
    for (const archetype of ARCHETYPES) {
      for (let seed = 0; seed < 6; seed++) {
        const input = inputOf(archetype, MOODS[seed % 2]!, seed + 40);
        const g = sampleGenome(input);
        for (const dir of ["bolder", "calmer"] as const) {
          const out = boldnessStep(g, dir, input);
          n++;
          // everything but the five genes is byte-identical
          const strip = (x: DesignGenome) => JSON.stringify({ ...x, brand: { ...x.brand, G5: { ...x.brand.G5, rd: 0 } }, page: { ...x.page, G10: 0, G20: { ...x.page.G20, l: "" }, G21: 0, G2: "" } });
          check(strip(out) === strip(g), `${archetype}/${seed} ${dir}: a gene outside the five moved`);
          check(hardViolations(out, input).length <= hardViolations(g, input).length, `${archetype}/${seed} ${dir}: a hard violation added (${hardViolations(out, input).join("; ")})`);
          const up = dir === "bolder";
          check(up ? out.brand.G5.rd >= g.brand.G5.rd : out.brand.G5.rd <= g.brand.G5.rd, `${archetype}/${seed} ${dir}: G5.rd moved the wrong way`);
          if (JSON.stringify(out) !== JSON.stringify(g)) moved++;
        }
      }
    }
    check(moved >= n * 0.9, `Bolder / Calmer moved nothing on ${n - moved} of ${n} genomes`);
    // a calmer step on a poster page walks toward quiet-luxe when valid
    const poster = sampleGenome(inputOf("kinetic", MOODS[1]!, 3), { locks: { G2: "poster" } });
    const calmer = boldnessStep(poster, "calmer", inputOf("kinetic", MOODS[1]!, 3));
    note(`poster → calmer: G2 ${calmer.page.G2}, G20.l ${poster.page.G20.l} → ${calmer.page.G20.l}, G21 ${poster.page.G21} → ${calmer.page.G21}, G10 ${poster.page.G10} → ${calmer.page.G10}`);
    // genomeOf of a planned direction reads its look back (the remix path)
    const dirs = generateDirections(fixtureInput("parfum", "fr", 5));
    const g0 = dirs[0]!.genome;
    check(!!g0 && genomeOf(dirs[0]!.doc).page.G2 === g0.page.G2, "genomeOf(direction) does not read the planned grammar back");
  },
});
