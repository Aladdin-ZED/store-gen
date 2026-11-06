/**
 * test:design groups of step 11 (P6 DESIGN; design.md DES-§14.2, DES-§14.1, DES-§4.11, DES-§1.4 GN-1 / SF-02 / DS54):
 *  - alpha: the model-free alpha estimate and the 32 × 32 facts pass on synthetic pixel arrays (a product on a
 *    uniform ground, a busy ground, an empty frame, a blurred frame);
 *  - pipeline: the wizard's DES-§14.2 path on the fixtures (no server): three directions pairwise d ≥ 0.25 with a
 *    median ≥ 0.35, four chips without a dot and a why line from the templates on each, ≥ 1 of 3 stage / specimen /
 *    dark for argan and parfum with the estimated cutout, the low-asset store over ≥ 2 hero families, the candidate
 *    step's time;
 *  - degrade: a slow novelty call shows no words; a `too_close` pick is never shown; the niche-only exhaustion path;
 *    `close` headlines recomposed then dropped to the library line; forged copy-gene tags dropped (the rows and `report.gen` ≤ 600 B are test:design-db's).
 */
import { runDesignPipeline, worstBand } from "@/components/generate/pipeline";
import { messages as EN } from "@/lib/i18n/admin/en/design";
import { directionCandidates, type GenerateInput } from "@/lib/generator/directions";
import type { PageDoc } from "@/lib/page/schema";
import { applyCopyGenes, validCopyGenes } from "./copy-genes";
import { genomeOf } from "./derive";
import { genomeDistance } from "./distance";
import { variantFeatures } from "./features";
import { fixtureInput } from "./fixtures/prepublish";
import type { NoveltyVerdict } from "./novelty.server";
import { alphaOfPixels, factsOfPixels, type PhotoFacts } from "./photo-facts";
import { registerDesignGroup } from "./selftest";

/** A w × h RGBA frame of one colour with an optional box of another (and optional noise on the ground). */
function frame(w: number, h: number, ground: [number, number, number], box?: { x: number; y: number; w: number; h: number; c: [number, number, number] }, noise = 0): Uint8ClampedArray {
  const px = new Uint8ClampedArray(w * h * 4);
  let s = 7;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff - 0.5) * 2 * noise;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const inBox = box && x >= box.x && x < box.x + box.w && y >= box.y && y < box.y + box.h;
      const c = inBox ? box.c : ground;
      px[i] = c[0] + (inBox ? 0 : rnd());
      px[i + 1] = c[1] + (inBox ? 0 : rnd());
      px[i + 2] = c[2] + (inBox ? 0 : rnd());
      px[i + 3] = 255;
    }
  }
  return px;
}

registerDesignGroup({
  id: "alpha",
  title: "estimateAlpha / photoFacts on synthetic frames: border flood-fill at ΔE ≤ 6, edge-band uniformity, Laplacian sharpness",
  ids: ["DS54", "UX-39", "D59"],
  run({ check, note }) {
    // a jade bottle on a white sweep: the box comes back, the ground reads uniform and light
    const product = frame(64, 64, [246, 246, 244], { x: 20, y: 12, w: 24, h: 40, c: [32, 110, 96] });
    const a = alphaOfPixels(product, 64, 64);
    check(!!a, "a product on a uniform ground has no alpha estimate");
    if (a) check(Math.abs(a.bbox.x - 20 / 64) < 0.02 && Math.abs(a.bbox.w - 24 / 64) < 0.02 && Math.abs(a.bbox.h - 40 / 64) < 0.02, `the box is off: ${JSON.stringify(a.bbox)}`);
    const f = factsOfPixels(product, 64, 64);
    check(f.background.uniform && f.background.luminance > 0.9, `the white sweep reads ${JSON.stringify(f.background)}`);
    check(f.sharp, "a hard-edged product reads as blurred");
    check(!!f.dominant && f.dominant !== "#f6f6f4", `the dominant colour is the ground (${f.dominant})`);
    // a busy ground (noise well above ΔE 6): no estimate, not uniform
    const busy = frame(64, 64, [160, 150, 140], { x: 20, y: 12, w: 24, h: 40, c: [32, 110, 96] }, 60);
    check(alphaOfPixels(busy, 64, 64) === null, "a busy ground still gets an alpha estimate");
    check(!factsOfPixels(busy, 64, 64).background.uniform, "a busy ground reads uniform");
    // an empty frame (nothing to cut out) and a full-frame product: no estimate
    check(alphaOfPixels(frame(64, 64, [250, 250, 250]), 64, 64) === null, "an empty frame gets an estimate");
    check(alphaOfPixels(frame(64, 64, [250, 250, 250], { x: 1, y: 1, w: 62, h: 62, c: [20, 20, 20] }), 64, 64) === null, "a full-frame product gets an estimate");
    // a soft gradient (a blurred photo): not sharp
    const blur = new Uint8ClampedArray(32 * 32 * 4);
    for (let i = 0; i < 32 * 32; i++) blur.set([120 + (i % 32), 120 + (i % 32), 120, 255], i * 4);
    check(!factsOfPixels(blur, 32, 32).sharp, "a smooth gradient reads as sharp");
    // the confirmation size: 1,024 px in well under 150 ms
    const big = frame(1024, 1024, [246, 246, 244], { x: 300, y: 200, w: 400, h: 600, c: [32, 110, 96] });
    const t0 = performance.now();
    const b = alphaOfPixels(big, 1024, 1024);
    const ms = performance.now() - t0;
    check(!!b && ms < 600, `the 1,024 px flood-fill took ${ms.toFixed(0)} ms`);
    note(`1,024 px flood-fill ${ms.toFixed(0)} ms (budget < 150 ms in the browser)`);
  },
});

const ESTIMATED: PhotoFacts = { count: 1, maxWidth: 1600, hasCutout: "estimated", dominant: "#2a6e60", background: { luminance: 0.95, uniform: true }, sharp: true };

/** The low-asset class (DS54): one photo, 1,100-1,280 px, no alpha, Arabic. */
function lowAsset(seed: number): GenerateInput {
  const base = fixtureInput("argan", "ar", seed);
  const product = base.product as PageDoc["product"];
  const first = product.images[0]!;
  return { ...base, product: { ...product, images: [first], cutout: undefined }, photos: [{ id: first.id, width: 1100 + ((seed * 37) % 181), height: 1500, alpha: false }], brandSeed: `store-low-${seed}` };
}

const heroFamily = (doc: PageDoc) => {
  const hero = doc.sections.find((s) => s.type === "hero");
  return hero ? variantFeatures("hero", hero.variant, hero.data).family : "none";
};

registerDesignGroup({
  id: "pipeline",
  title: "the DES-§14.2 pipeline on the fixtures: d ≥ 0.25 pairwise (median ≥ 0.35), GN-1 chips and why, stage / specimen / dark with the estimated cutout, low-asset ≥ 2 families",
  ids: ["DES-14.2", "GN-1", "SF-02", "DS25", "DS54", "UX-01"],
  async run({ full, check, note }) {
    const names = ["argan", "parfum", "massage", "blender"] as const;
    const seeds = full ? [1, 2, 3, 4, 5] : [3];
    const pairs: number[] = [];
    let candMs = 0;
    let runs = 0;
    for (const name of names) {
      for (const seed of seeds) {
        const input = fixtureInput(name, name === "argan" ? "ar" : "fr", seed);
        const t0 = performance.now();
        directionCandidates({ ...input, inputHash: `h-${seed}` }, { budget: true });
        candMs = Math.max(candMs, performance.now() - t0);
        runs++;
        const r = await runDesignPipeline(input);
        check(r.directions.length === 3, `${name}/${seed}: ${r.directions.length} directions`);
        const views = r.directions.map((d) => d.view);
        for (let i = 0; i < views.length; i++) {
          for (let j = i + 1; j < views.length; j++) {
            const a = views[i];
            const b = views[j];
            if (!a || !b) continue;
            const d = genomeDistance(a, b);
            pairs.push(d);
            check(d >= 0.25, `${name}/${seed}: directions ${i + 1} and ${j + 1} at d ${d.toFixed(3)} < 0.25`);
          }
        }
        for (const d of r.directions) {
          check(d.chips.length === 4, `${name}/${seed} ${d.archetype}: ${d.chips.length} chips`);
          check(d.chips.every((c) => c.key in EN), `${name}/${seed}: a chip key outside the catalogue`);
          check(d.card.explanation.every((x) => !x.includes("·")), `${name}/${seed}: a chip joined with a dot`);
          check(d.why.key in EN && d.why.key.startsWith("design.why."), `${name}/${seed}: the why line ${d.why.key} is not a template`);
          check(!d.exhausted && d.bands === null, `${name}/${seed}: bands without a check`);
        }
      }
    }
    const sorted = [...pairs].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
    check(median >= 0.35, `the median pairwise distance is ${median.toFixed(3)} < 0.35`);
    note(`${pairs.length} pairs, median d ${median.toFixed(3)}, min ${sorted[0]?.toFixed(3)}; the candidate step ${candMs.toFixed(0)} ms (max of ${runs}, full documents per attempt)`);
    check(candMs < 2500, `the candidate step took ${candMs.toFixed(0)} ms`);

    // the estimated cutout opens the stage, the specimen sheet or a dark page for the two product fixtures
    for (const name of ["argan", "parfum"] as const) {
      let hit = 0;
      for (const seed of full ? [1, 2, 3, 4] : [3]) {
        const r = await runDesignPipeline({ ...fixtureInput(name, "fr", seed), photoFacts: ESTIMATED });
        if (r.directions.some((d) => d.dna.page.G2 === "stage" || d.dna.page.G2 === "specimen" || d.dna.brand.G9 === "dark-luxe")) hit++;
      }
      check(hit > 0, `${name}: no stage / specimen / dark direction with the estimated cutout`);
    }

    // DS54: the low-asset store's three directions span ≥ 2 hero families
    for (const seed of full ? [1, 2, 3, 4, 5] : [2]) {
      const r = await runDesignPipeline(lowAsset(seed));
      const families = new Set(r.directions.map((d) => heroFamily(d.doc)));
      check(families.size >= 2, `low-asset/${seed}: one hero family (${[...families].join(", ")})`);
    }
  },
});

registerDesignGroup({
  id: "pipeline-degrade",
  title: "the pipeline degrades: no words on a slow check, never a too-close candidate, the niche exhaustion path, headline recomposition, forged copy genes dropped",
  ids: ["DES-14.2", "DS6", "UX-24", "DES-9.8"],
  async run({ check }) {
    const input = fixtureInput("parfum", "fr", 3);
    // a check slower than the timeout: the directions, no bands, the quiet line
    const slow = await runDesignPipeline(input, { timeoutMs: 30, novelty: () => new Promise((r) => setTimeout(() => r([]), 200)) });
    check(slow.novelty === "unavailable" && slow.directions.every((d) => d.bands === null), `a slow check: ${slow.novelty}`);

    // the first direction's first attempt is too close (platform): the re-sample never shows it
    const tooClose = await runDesignPipeline(input, {
      novelty: async (cands) => cands.map((c): NoveltyVerdict => ({ key: c.key, platform: c.key.startsWith("0:0:") ? "too_close" : "ok", niche: "ok", own: "ok", clone: false })),
    });
    check(
      tooClose.directions.every((d) => !d.key.startsWith("0:0:") && worstBand(tooClose.verdicts.get(d.key)) < 2),
      `a too-close candidate is shown: ${tooClose.directions.map((d) => d.key).join(", ")}`,
    );

    // the niche alone is full: the exhaustion path shows a candidate with the niche note and the differentiators
    const full = await runDesignPipeline(input, { novelty: async (cands) => cands.map((c) => ({ key: c.key, platform: "ok" as const, niche: "too_close" as const, own: "first" as const, clone: false })) });
    check(
      full.directions.some((d) => d.exhausted && d.bands?.niche === "close" && d.bands.fallback === true),
      `no exhaustion path: ${full.directions.map((d) => `${d.exhausted}/${d.bands?.niche}`).join(", ")}`,
    );
    const pd = full.directions.map((d) => d.view).filter((v) => !!v);
    for (let i = 0; i < pd.length; i++) for (let j = i + 1; j < pd.length; j++) check(genomeDistance(pd[i]!, pd[j]!) >= 0.25, "the exhaustion path broke the pairwise distance");

    // every composed line close: recomposed (other skeletons), then the library line; never the original
    const base = await runDesignPipeline(input);
    let calls = 0;
    const closed = await runDesignPipeline(input, {
      headlines: async (texts) => {
        calls++;
        return texts.map(() => ({ verdict: "close" as const }));
      },
    });
    const heroBefore = base.directions[0]!.lines?.["hero.headline"]?.t;
    const heroAfter = closed.directions[0]!.lines?.["hero.headline"]?.t;
    check(calls >= 2 && calls <= 5, `${calls} headline calls (≤ 5: three recompositions, the neutral skeleton, then the library)`);
    check(!heroBefore || heroAfter !== heroBefore, "a close hero title was kept");
    check(closed.directions.every((d) => !d.lines || Object.keys(d.lines).length < Object.keys(base.directions[0]!.lines ?? {}).length + 1), "lines grew");

    // copy genes: vocabulary values kept, forged ones dropped; the generation record stays ≤ 600 B
    const tags = validCopyGenes({ angle: "benefit", titles: { hero: "noun-phrase", faq: "<script>", "bad key!": "question" } });
    check(tags.angle === "benefit" && tags.titles.hero === "noun-phrase" && !("faq" in tags.titles) && tags.dropped === 2, `copy genes: ${JSON.stringify(tags)}`);
    const forged = validCopyGenes({ angle: "free-shipping-guaranteed", titles: { hero: "made-up" } });
    check(forged.angle === null && Object.keys(forged.titles).length === 0 && forged.dropped === 2, "a forged copy gene survived");
    const d0 = base.directions[0]!;
    const g = applyCopyGenes(genomeOf(d0.doc), validCopyGenes(d0.copyGenes));
    check(g.page.angle === (d0.copyGenes.angle ?? genomeOf(d0.doc).page.angle), "the angle tag was not applied");
  },
});
