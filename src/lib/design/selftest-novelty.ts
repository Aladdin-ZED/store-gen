/**
 * The novelty-service test groups (P6 DESIGN step 9; design.md DES-§25.1 `test:design`, DES-§7.4, DES-§7.9, DES-§19,
 * DES-§1.4 DG-05). Registered with ./selftest and run by scripts/qa/design-check.ts. Pure: the server module's DB part
 * is `test:design-db`; these groups run the in-memory pool (src/lib/design/pool.ts) the server keeps in its cache.
 *
 *  - novelty-pool: the packed bounds equal `bounds(…, "full")`; `verdictOf` (bounds first) equals the brute-force
 *    bands and clone flag on every candidate of a clustered pool; the caller's rows and the newcomers of an incumbent
 *    never count; the device tail; the thresholds' floors; τ_niche at n = 10 / 50 / 150;
 *  - novelty-timing: 1 candidate × 20,000 rows ≤ 20 ms p95, 12 candidates ≤ 150 ms p95 (DS57, DES-§19);
 *  - niche-shares: k ≥ 10 stores, 10 % steps, ± one store-equivalent of noise, one store weighs 1, seq4 / tells;
 *  - capacity (--full): 200 stores join each of the three crowded niches (DES-§7.9, DES-§17.7): the fallback share
 *    < 5 % at every checkpoint and the mean pairwise d at n = 200 ≥ τ_niche(200) + 0.10.
 */
import { mulberry32 } from "@/lib/theme/rng";
import calibration from "./calibration.json";
import { bandOf, bounds, devicesOfVec, genomeDistance, packView, unpackView, type DistanceView } from "./distance";
import { CAPACITY_NICHES, simulateNiche } from "./fixtures/capacity";
import {
  bucketKey,
  emptyShard,
  mergeThresholds,
  nicheTau,
  packedBounds,
  roundShare,
  shardOf,
  sharesOf,
  storesInNiche,
  tellsMask,
  tellsOfMask,
  TELL_DEVICES,
  toInt16,
  upsertRow,
  verdictOf,
  type PoolShard,
} from "./pool";
import { registerDesignGroup } from "./selftest";
import { randomView } from "./selftest-genome";
import type { Band } from "./types";

/** A view as the pool stores it (the packed round trip: 3-decimal fractions). */
const stored = (v: DistanceView) => unpackView(packView(v));

/** A neighbour of `v`: a few cheap genes moved, the sequence trimmed (close or too close to it). */
function near(v: DistanceView, rng: () => number): DistanceView {
  const out: DistanceView = { ...v, cat: { ...v.cat }, num: { ...v.num }, seq: v.seq.slice() };
  const keys = ["base", "ladder", "mask", "depth", "button", "emphasis", "glyph", "density", "align"] as const;
  for (let i = 0; i < 1 + Math.floor(rng() * 4); i++) out.cat[keys[Math.floor(rng() * keys.length)]!] += 1;
  if (rng() < 0.5) out.seq = out.seq.slice(1);
  if (rng() < 0.3) out.cat.grammar = (out.cat.grammar + 1) % 9;
  return stored(out);
}

const NICHES = ["MA:skincare", "MA:fragrance", "FR:skincare"];

/** A pool of `rows` rows over `stores` stores, a share of them near `anchors`. */
function buildPool(rows: number, stores: number, anchors: readonly DistanceView[], rng: () => number, shards = 16): { shards: PoolShard[]; views: Map<string, { view: DistanceView; store: string; niche: string; bucket: string; fpa: number }> } {
  const out = Array.from({ length: shards }, emptyShard);
  const views = new Map<string, { view: DistanceView; store: string; niche: string; bucket: string; fpa: number }>();
  for (let i = 0; i < rows; i++) {
    const view = anchors.length && rng() < 0.3 ? near(anchors[Math.floor(rng() * anchors.length)]!, rng) : stored(randomView(rng));
    const id = `r${i}`;
    const store = `s${Math.floor(rng() * stores)}`;
    const niche = NICHES[Math.floor(rng() * NICHES.length)]!;
    const bucket = bucketKey(niche, view);
    const fpa = Math.floor(rng() * 1000);
    upsertRow(out[shardOf(id, shards)]!, { id, storeId: store, kind: "page", niche, bucket, fpa, vec: packView(view, Math.floor(rng() * 8192)) });
    views.set(id, { view, store, niche, bucket, fpa });
  }
  return { shards: out, views };
}

const worse = (a: Band, b: Band): Band => (a === "too_close" || b === "too_close" ? "too_close" : a === "close" || b === "close" ? "close" : "ok");

registerDesignGroup({
  id: "novelty-pool",
  title: "the pool's bounds-first verdicts equal the brute-force bands; incumbency, devices, thresholds, τ_niche",
  ids: ["DG-05", "DS6", "DS7", "DS57"],
  run({ full, check, note }) {
    const rng = mulberry32(20261105);
    // the packed bounds are distance.ts bounds(…, "full")
    let bad = 0;
    for (let i = 0; i < (full ? 20_000 : 5_000); i++) {
      const a = stored(randomView(rng));
      const b = rng() < 0.3 ? near(a, rng) : stored(randomView(rng));
      const pb = packedBounds(Int16Array.from(packView(a)), Int16Array.from(packView(b)));
      const ref = bounds(a, b, "full");
      if (Math.abs(pb.lo - ref.lo) > 1e-9 || Math.abs(pb.hi - ref.hi) > 1e-9) bad++;
    }
    check(bad === 0, `${bad} pairs where the packed bounds differ from bounds(…, "full")`);

    // verdictOf = brute force, on a clustered pool
    const anchors = Array.from({ length: 12 }, () => stored(randomView(rng)));
    const { shards, views } = buildPool(full ? 3_000 : 900, 40, anchors, rng, 8);
    const th = mergeThresholds(calibration.thresholds);
    let mismatch = 0;
    let fullRows = 0;
    let rowsSeen = 0;
    const seen = { too_close: 0, close: 0, clone: 0 };
    const cands = full ? 400 : 150;
    for (let k = 0; k < cands; k++) {
      const view = rng() < 0.6 ? near(anchors[k % anchors.length]!, rng) : stored(randomView(rng));
      const niche = NICHES[k % NICHES.length]!;
      const me = `s${k % 40}`;
      const since = k % 3 === 0 ? Math.floor(rng() * 1000) : null;
      const tau = nicheTau(th, storesInNiche(shards, niche));
      const bucket = bucketKey(niche, view);
      const got = verdictOf(view, Int16Array.from(packView(view)), shards, { excludeStore: me, niche, bucket, tauPlatform: th.platform, tauNiche: tau, clone: th.clone, margin: th.margin, incumbentSince: since });
      let platform: Band = "ok";
      let nicheBand: Band = "ok";
      let clone = false;
      for (const r of views.values()) {
        if (r.store === me || (since !== null && r.fpa > since)) continue;
        rowsSeen++;
        const d = genomeDistance(view, r.view);
        platform = worse(platform, bandOf(d, th.platform));
        if (r.niche === niche) nicheBand = worse(nicheBand, bandOf(d, tau));
        if (r.bucket === bucket && d < th.clone - 1e-12) clone = true;
      }
      fullRows += got.full;
      if (got.platform !== platform || got.niche !== nicheBand || got.clone !== clone) mismatch++;
      if (got.platform === "too_close") seen.too_close++;
      if (got.niche === "close" || got.platform === "close") seen.close++;
      if (got.clone) seen.clone++;
    }
    check(mismatch === 0, `${mismatch} of ${cands} candidates where verdictOf differs from the brute-force bands`);
    check(seen.too_close > 0 && seen.clone > 0 && seen.too_close < cands, `the clustered pool exercises the bands (too_close ${seen.too_close}, close ${seen.close}, clone ${seen.clone})`);
    note(`${cands} candidates · ${views.size} rows · full distances on ${((fullRows / Math.max(1, rowsSeen)) * 100).toFixed(1)} % of the rows`);

    // the caller's own rows never count; an incumbent never meets a newcomer
    const one = Array.from({ length: 2 }, emptyShard);
    const a = stored(randomView(rng));
    upsertRow(one[0]!, { id: "x", storeId: "me", kind: "page", niche: "MA:skincare", bucket: bucketKey("MA:skincare", a), fpa: 500, vec: packView(a) });
    const opts = { niche: "MA:skincare", bucket: bucketKey("MA:skincare", a), tauPlatform: 0.25, tauNiche: 0.4, clone: 0.12, margin: 0.05 };
    const self = verdictOf(a, Int16Array.from(packView(a)), one, { ...opts, excludeStore: "me" });
    check(self.platform === "ok" && self.niche === "ok" && !self.clone, "the caller's own row counted");
    const other = verdictOf(a, Int16Array.from(packView(a)), one, { ...opts, excludeStore: "you" });
    check(other.platform === "too_close" && other.niche === "too_close" && other.clone, "an identical row of another store is not too_close and a clone");
    const incumbent = verdictOf(a, Int16Array.from(packView(a)), one, { ...opts, excludeStore: "you", incumbentSince: 100 });
    check(incumbent.platform === "ok" && !incumbent.clone, "a newcomer's row counted against the incumbent (QUAL-19)");
    // a row at exactly τ_platform is `close` (ten 1-weight genes apart: d = 10 / 40)
    const b = { ...a, cat: { ...a.cat } };
    for (const k of ["base", "ladder", "mask", "depth", "button", "emphasis", "glyph", "motion", "density", "align"] as const) b.cat[k] += 1;
    const atTau = verdictOf(b, Int16Array.from(packView(b)), one, { ...opts, excludeStore: "you" });
    check(Math.abs(genomeDistance(a, b) - 0.25) < 1e-9 && atTau.platform === "close" && atTau.niche === "too_close" && !atTau.clone, `d = τ_platform reads ${atTau.platform} / ${atTau.niche}`);
    const brand = verdictOf({ ...a, kind: "brand" }, Int16Array.from(packView({ ...a, kind: "brand" })), one, { ...opts, excludeStore: "you" });
    check(brand.platform === "ok", "a brand candidate compared with page rows");

    // the device tail
    const mask = tellsMask(["ghost", "tape", "padded", "nope"]);
    const vec = packView(a, mask);
    check(devicesOfVec(vec) === mask && devicesOfVec(packView(a)) === 0 && tellsOfMask(mask).join() === "ghost,tape,padded", "the device tail round trip");
    check(genomeDistance(unpackView(vec), a) === 0 && JSON.stringify(vec).length <= 400, "the tail changes the view or the vector is over 400 B");
    check(TELL_DEVICES.length === 13 && toInt16([...packView(a).slice(0, -1), 40_000]) === null && toInt16(packView(a)) !== null, "toInt16 range checks");

    // thresholds: calibration ⊕ console, never below the floors; τ_niche(n)
    const t = mergeThresholds(calibration.thresholds, { platform: 0.2, niche: 0.5, clone: 0.1, ownPage: 0.35, brandRadius: 0.5 });
    check(t.platform === 0.25 && t.nicheBase === 0.5 && t.clone === 0.12 && t.ownPage === 0.35 && t.brandRadius <= 0.35, `merged thresholds ${JSON.stringify(t)}`);
    const t0 = mergeThresholds(calibration.thresholds);
    const taus = [10, 50, 150].map((n) => nicheTau(t0, n));
    check(Math.abs(taus[0]! - 0.4) < 1e-9 && Math.abs(taus[1]! - 0.3625) < 1e-9 && Math.abs(taus[2]! - 0.3) < 1e-9, `τ_niche(10, 50, 150) = ${taus.join(" / ")}`);
    check(nicheTau(mergeThresholds(calibration.thresholds, { platform: 0.3 }), 200) >= 0.35 - 1e-9, "τ_niche falls below τ_platform + 0.05");
    check(bucketKey(`MA:${"x".repeat(80)}`, a).length <= 96, "a bucket over 96 characters");
  },
});

const p95 = (xs: number[]) => xs.slice().sort((x, y) => x - y)[Math.min(xs.length - 1, Math.ceil(xs.length * 0.95) - 1)]!;

registerDesignGroup({
  id: "novelty-timing",
  title: "checkNovelty compute: 1 candidate × 20,000 rows ≤ 20 ms p95, 12 candidates ≤ 150 ms p95 (DS57)",
  ids: ["DG-05", "DS57"],
  run({ check, note }) {
    const rng = mulberry32(57);
    const anchors = Array.from({ length: 40 }, () => stored(randomView(rng)));
    const { shards } = buildPool(20_000, 2_000, anchors, rng);
    const th = mergeThresholds(calibration.thresholds);
    const cands = Array.from({ length: 12 }, (_, i) => (i % 2 ? near(anchors[i]!, rng) : stored(randomView(rng))));
    const run = (list: readonly DistanceView[]) => {
      let full = 0;
      const t0 = performance.now();
      for (const v of list) {
        const niche = NICHES[0]!;
        full += verdictOf(v, Int16Array.from(packView(v)), shards, { excludeStore: "s1", niche, bucket: bucketKey(niche, v), tauPlatform: th.platform, tauNiche: nicheTau(th, 200), clone: th.clone, margin: th.margin }).full;
      }
      return { ms: performance.now() - t0, full };
    };
    run(cands); // warm
    const one: number[] = [];
    let oneFull = 0;
    for (let i = 0; i < 40; i++) {
      const r = run([cands[i % cands.length]!]);
      one.push(r.ms);
      oneFull += r.full;
    }
    const twelve: number[] = [];
    for (let i = 0; i < 12; i++) twelve.push(run(cands).ms);
    check(p95(one) <= 20, `1 candidate × 20,000 rows: p95 ${p95(one).toFixed(1)} ms (> 20 ms)`);
    check(p95(twelve) <= 150, `12 candidates × 20,000 rows: p95 ${p95(twelve).toFixed(1)} ms (> 150 ms)`);
    note(`1 × 20,000: p95 ${p95(one).toFixed(1)} ms · 12 × 20,000: p95 ${p95(twelve).toFixed(1)} ms · full distances on ${((oneFull / (40 * 20_000)) * 100).toFixed(2)} % of the rows`);
  },
});

registerDesignGroup({
  id: "niche-shares",
  title: "niche shares: k ≥ 10 stores, 10 % steps, ± one store-equivalent of noise, one store weighs 1, seq4 and tells",
  ids: ["DS49", "QUAL-32", "DES-§22"],
  run({ check }) {
    const rng = mulberry32(49);
    const rowsFor = (stores: number, extra = 0) => {
      const rows: { storeId: string; vec: Int16Array }[] = [];
      for (let s = 0; s < stores; s++) {
        const n = s === 0 ? 1 + extra : 1;
        for (let k = 0; k < n; k++) {
          const v = stored(randomView(rng));
          rows.push({ storeId: `s${s}`, vec: Int16Array.from(packView({ ...v, seq: [1, 2, 3, 4, 5, ...v.seq.slice(0, 6)] }, tellsMask(s % 2 ? ["ghost", "tape"] : ["tape", "stamp", "slider"]))) });
        }
      }
      return rows;
    };
    const quiet = () => 0 as const;
    const nine = sharesOf(rowsFor(9), quiet);
    check(nine.n === 0 && Object.keys(nine.grammar).length === 0 && nine.seq4.length === 0 && nine.tells.length === 0, "9 stores: shares are not empty");
    const ten = sharesOf(rowsFor(10), quiet);
    const maps = [ten.grammar, ten.strategy, ten.heroFamily, ten.heroArrangement, ten.displayFamily, ten.arDisplay, ten.arDisplayClass, ten.motion, ten.ghost];
    check(ten.n === 10 && maps.every((m) => Object.values(m).every((x) => x > 0 && x <= 1 && Math.abs(x * 10 - Math.round(x * 10)) < 1e-9)), "10 stores: shares are not 10 % steps");
    check(ten.ghost.on === 0.5 && ten.ghost.off === 0.5, `ghost on / off ${JSON.stringify(ten.ghost)}`);
    check(ten.seq4.length >= 1 && ten.seq4.length <= 20 && ten.seq4.every((g) => g.gram.length === 4) && ten.seq4[0]!.share === 1 && ten.seq4[0]!.gram.join() === "1,2,3,4", `seq4 ${JSON.stringify(ten.seq4.slice(0, 2))}`);
    check(ten.tells.some((t) => t.pair.join("|") === "ghost|tape" && t.share === 0.5) && ten.tells.every((t) => t.pair[0] < t.pair[1] || TELL_DEVICES.indexOf(t.pair[0] as never) < TELL_DEVICES.indexOf(t.pair[1] as never)), `tells ${JSON.stringify(ten.tells.slice(0, 3))}`);
    // one store with 30 pages weighs what a one-page store weighs
    const heavy = sharesOf(rowsFor(10, 29), quiet);
    check(heavy.ghost.on === 0.5 && heavy.n === 10, `a 30-page store weighs more than one store: ${JSON.stringify(heavy.ghost)}`);
    // the noise moves a share by at most one store-equivalent before rounding
    const noisy = sharesOf(rowsFor(10), (f, v) => ((f.length + v.length) % 3) - 1 as -1 | 0 | 1);
    check(Math.abs((noisy.ghost.on ?? 0) - 0.5) <= 0.1 + 1e-9 && roundShare(5, 1, 10) === 0.6 && roundShare(0, -1, 10) === 0, "the noise is not bounded by one store-equivalent");
    check(!JSON.stringify(ten).includes("s1"), "a store id in the shares");
    check(ten.n === 10 && sharesOf(rowsFor(14), quiet).n === 10 && sharesOf(rowsFor(15), quiet).n === 20, "n is not rounded to 10");
  },
});

registerDesignGroup({
  id: "capacity",
  title: "capacity: 200 stores × 3 crowded niches, fallback share < 5 %, mean pairwise d at n = 200 ≥ τ_niche(200) + 0.10 (--full)",
  ids: ["DG-05", "DG-09", "QUAL-3", "UX-24"],
  run({ full, check, note }) {
    if (!full) {
      note("the 200-store simulation runs with --full (qa:design-corpus --capacity prints the whole report)");
      return;
    }
    for (const c of CAPACITY_NICHES) {
      const r = simulateNiche(c, { stores: 200 });
      const last = r.checkpoints.at(-1);
      check(r.stores >= 190, `${c.niche}: only ${r.stores} stores joined`);
      check(r.pass, `${c.niche}: ${r.why.join("; ")}`);
      note(
        `${c.niche}: ` +
          r.checkpoints.map((p) => `n ${p.n} d̄ ${p.mean.toFixed(3)} σ ${p.sd.toFixed(3)} P(d<τ) ${(p.pUnder * 100).toFixed(1)} % fallback ${(p.fallbackShare * 100).toFixed(1)} %`).join(" · ") +
          (last ? ` · top grammar ${(last.top.grammar * 100).toFixed(0)} % strategy ${(last.top.strategy * 100).toFixed(0)} % hero ${(last.top.heroFamily * 100).toFixed(0)} %` : ""),
      );
    }
  },
});
