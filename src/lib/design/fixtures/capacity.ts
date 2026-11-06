/**
 * The capacity simulation (P6 DESIGN; design.md DES-§7.9, DES-§17.7, QUAL-3, UX-24; test-only module): stores join one
 * niche in sequence, each runs the engine's wizard on a fixture product with realistic photo facts, the owner-choice
 * model picks one of the three directions, and the live pool grows by the chosen page. `test:design --full` asserts the
 * DES-§7.9 numbers on it; `qa:design-corpus --capacity` prints the full report. Pure and deterministic per seed (the
 * pool is in memory: src/lib/design/pool.ts, the same code as the server's).
 *
 * The wizard step it models (DES-§14.2 step 5, until the wizard runs on the engine in step 11): the niche shares feed
 * H33 once the niche has ≥ 10 stores; a direction whose niche band is `too_close` tries the ≤ 6 `differentiate`
 * variants; a direction none of them clears is a fallback (DES-§7.9 step 4). Photo classes: studio 3-4 photos 40 %,
 * one phone photo 45 % (`low-asset`), two photos 15 %; locales ar 50 % / fr 35 % / en 15 %; owner choice 55 / 30 / 15 %.
 */
import { generateDirections, type GenerateInput } from "@/lib/generator/directions";
import { hash32 } from "@/lib/generator/rng";
import type { FixtureName } from "@/lib/page/fixtures";
import { mulberry32 } from "@/lib/theme/rng";
import calibration from "../calibration.json";
import { differentiateVariants } from "../differentiate";
import { distanceView, genomeDistance, packView, type DistanceView } from "../distance";
import { emptyShard, mergeThresholds, nicheTau, sharesOf, shardOf, upsertRow, verdictOf, bucketKey, type PoolShard } from "../pool";
import { heroFamilyOf } from "../tokens-table";
import { fixtureInput } from "./prepublish";

export interface CapacityNiche {
  /** the niche key the stores share */
  niche: string;
  fixture: FixtureName;
}

/** DES-§7.9: the three most crowded niche fixtures. */
export const CAPACITY_NICHES: readonly CapacityNiche[] = [
  { niche: "MA:skincare", fixture: "argan" },
  { niche: "MA:fragrance", fixture: "parfum" },
  { niche: "MA:modest", fixture: "tshirt" },
];

export const CAPACITY_CHECKPOINTS = [10, 20, 50, 100, 200] as const;

export interface CapacityCheckpoint {
  n: number;
  tau: number;
  mean: number;
  sd: number;
  /** P(d < τ_niche(n)) over the live pool's pairs */
  pUnder: number;
  /** stores so far whose chosen direction needed the exhaustion path */
  fallbackShare: number;
  /** stores so far whose chosen direction would have met design:N1 at publish without the wizard's resample */
  n1Share: number;
  /** the largest grammar, strategy and hero-family shares of the live pool */
  top: { grammar: number; strategy: number; heroFamily: number };
  /** mean Jaccard of the hero titles of consecutive stores (DS51) */
  heroJaccard: number;
}

export interface CapacityReport {
  niche: string;
  stores: number;
  checkpoints: CapacityCheckpoint[];
  pass: boolean;
  why: string[];
}

const LOCALES = ["ar", "fr", "en"] as const;

function pickLocale(r: number): (typeof LOCALES)[number] {
  return r < 0.5 ? "ar" : r < 0.85 ? "fr" : "en";
}

/** The owner-choice model (QUAL-8): directions 1 / 2 / 3 at 55 / 30 / 15 %. */
export const ownerChoice = (r: number) => (r < 0.55 ? 0 : r < 0.85 ? 1 : 2);

/** One store's wizard input: the fixture product with a photo class, a locale and the store's own seeds. */
function storeInput(c: CapacityNiche, k: number, rng: () => number): GenerateInput {
  const locale = pickLocale(rng());
  const input = fixtureInput(c.fixture, locale, 1000 + k, `cap-${c.niche}-${k}`);
  const r = rng();
  const keep = r < 0.4 ? 4 : r < 0.85 ? 1 : 2;
  const product = input.product as { images: { id: string }[] };
  const images = product.images.slice(0, keep);
  const photos = (input.photos ?? []).slice(0, keep).map((p) => (keep === 1 ? { ...p, alpha: false, width: Math.min(p.width, 1280) } : p));
  return { ...input, niche: c.niche, product: { ...product, images, cutout: keep === 1 ? undefined : (input.product as { cutout?: unknown }).cutout }, photos };
}

const words = (s: string) => new Set(s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean));
function jaccard(a: string, b: string): number {
  const A = words(a);
  const B = words(b);
  if (!A.size && !B.size) return 0;
  let i = 0;
  for (const w of A) if (B.has(w)) i++;
  return i / (A.size + B.size - i);
}

const heroTitle = (doc: { sections: { type: string; data: Record<string, unknown> }[] }) => {
  const hero = doc.sections.find((s) => s.type === "hero");
  const t = hero?.data.title ?? hero?.data.headline;
  return typeof t === "string" ? t : "";
};

function topShare(values: readonly (number | string | null)[]): number {
  if (!values.length) return 0;
  const m = new Map<number | string | null, number>();
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
  return Math.max(...m.values()) / values.length;
}

/** The DES-§17.7 run of one niche: `stores` stores in sequence, with checkpoints at n ∈ {10, 20, 50, 100, 200}. */
export function simulateNiche(c: CapacityNiche, opts: { stores?: number; seed?: number; onStore?: (n: number) => void } = {}): CapacityReport {
  const stores = opts.stores ?? 200;
  const rng = mulberry32(hash32(`capacity|${c.niche}|${opts.seed ?? 1}`));
  const th = mergeThresholds(calibration.thresholds);
  const shards: PoolShard[] = Array.from({ length: 4 }, emptyShard);
  const live: DistanceView[] = [];
  const titles: string[] = [];
  let fallbacks = 0;
  let n1 = 0;
  const checkpoints: CapacityCheckpoint[] = [];
  for (let k = 0; k < stores; k++) {
    const storeId = `store-${k}`;
    const input = storeInput(c, k, rng);
    const rows: { storeId: string; vec: Int16Array }[] = [];
    for (const s of shards) for (let i = 0; i < s.ids.length; i++) rows.push({ storeId: s.stores[i]!, vec: s.vecs[i]! });
    const shares = sharesOf(rows, () => 0);
    const tau = nicheTau(th, k);
    let dirs;
    try {
      dirs = generateDirections({ ...input, shares });
    } catch {
      continue;
    }
    const judged = dirs.map((d, i) => {
      if (!d.genome) return { view: null as DistanceView | null, fallback: false, n1: false, doc: d.doc };
      const view = distanceView(d.genome, { theme: d.doc.theme }, d.doc.locale);
      const verdict = (v: DistanceView) => {
        const packed = Int16Array.from(packView(v));
        return verdictOf(v, packed, shards, { excludeStore: storeId, niche: c.niche, bucket: bucketKey(c.niche, v), tauPlatform: th.platform, tauNiche: tau, clone: th.clone, margin: th.margin });
      };
      const first = verdict(view);
      const blocked = (r: ReturnType<typeof verdict>) => r.niche === "too_close" || r.platform === "too_close" || r.clone;
      if (!blocked(first)) return { view, fallback: false, n1: false, doc: d.doc };
      for (const v of differentiateVariants(d.doc, hash32(`${storeId}|${i}`))) if (!blocked(verdict(v.view))) return { view: v.view, fallback: false, n1: true, doc: d.doc };
      return { view, fallback: true, n1: true, doc: d.doc };
    });
    const chosen = judged[ownerChoice(rng())] ?? judged[0]!;
    if (!chosen.view) continue;
    if (chosen.fallback) fallbacks++;
    if (chosen.n1) n1++;
    const id = `row-${k}`;
    upsertRow(shards[shardOf(id, shards.length)]!, { id, storeId, kind: "page", niche: c.niche, bucket: bucketKey(c.niche, chosen.view), fpa: k, vec: packView(chosen.view) });
    live.push(chosen.view);
    titles.push(heroTitle(chosen.doc));
    opts.onStore?.(live.length);
    if ((CAPACITY_CHECKPOINTS as readonly number[]).includes(live.length)) {
      const n = live.length;
      const t = nicheTau(th, n);
      const ds: number[] = [];
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) ds.push(genomeDistance(live[i]!, live[j]!));
      const mean = ds.reduce((s, d) => s + d, 0) / Math.max(1, ds.length);
      const sd = Math.sqrt(ds.reduce((s, d) => s + (d - mean) ** 2, 0) / Math.max(1, ds.length));
      let jac = 0;
      for (let i = 1; i < titles.length; i++) jac += jaccard(titles[i - 1]!, titles[i]!);
      checkpoints.push({
        n,
        tau: t,
        mean,
        sd,
        pUnder: ds.filter((d) => d < t).length / Math.max(1, ds.length),
        fallbackShare: fallbacks / n,
        n1Share: n1 / n,
        top: { grammar: topShare(live.map((v) => v.cat.grammar)), strategy: topShare(live.map((v) => v.cat.strategy)), heroFamily: topShare(live.map((v) => heroFamilyOf(v.hero))) },
        heroJaccard: titles.length > 1 ? jac / (titles.length - 1) : 0,
      });
    }
  }
  const why: string[] = [];
  for (const cp of checkpoints) if (cp.fallbackShare >= 0.05) why.push(`n ${cp.n}: fallback share ${(cp.fallbackShare * 100).toFixed(1)} % (≥ 5 %)`);
  const last = checkpoints.at(-1);
  if (last && last.n >= stores && last.mean < last.tau + 0.1) why.push(`n ${last.n}: mean pairwise d ${last.mean.toFixed(3)} < τ_niche ${last.tau.toFixed(3)} + 0.10`);
  return { niche: c.niche, stores: live.length, checkpoints, pass: why.length === 0, why };
}
