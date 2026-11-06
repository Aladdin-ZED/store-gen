/**
 * The novelty pool in memory (P6 DESIGN; design.md DES-§7.4, DES-§7.9, DES-§22, DS6, DS7, DS49, DS57). Pure and
 * framework-free: src/lib/design/novelty.server.ts keeps the shards in the core's `scopedCache("novelty-pool")` and
 * asks them for verdicts; `test:design` times them on a synthetic pool, and `qa:design-corpus` runs its in-memory
 * growing pool on the same code.
 *
 *  - A row is `{ id, storeId, kind, niche, bucket, fpa, vec }` with the packed view as an `Int16Array` (DS57). The store
 *    id stays in this process only: it excludes the caller's own rows and counts the niche's stores, and no answer ever
 *    carries it.
 *  - `verdictOf(view, …)`: the platform, niche and clone bands of one candidate, the cheap part first. The categorical
 *    and numeric components give `lo` (the sequence and the two histograms at 0) and `hi = lo + 6/40`; only a row the
 *    bounds cannot decide computes the full distance (`genomeDistance`, the same function the tests compare with).
 *  - `sharesOf(rows, noise)`: the niche shares of DES-§7.4 (k ≥ 10 stores, 10 % rounding, ± one store-equivalent of
 *    noise, each store weighing 1 whatever its page count, `n` rounded to 10).
 *  - The thresholds (`mergeThresholds`): calibration.json, raised by `platform_design.thresholds`, never below the
 *    R-D36 floors.
 */
import { arDisplayClass } from "./pairings";
import { bandOf, devicesOfVec, genomeDistance, tauNiche, unpackView, VEC, VEC_CAT, VEC_NUM, type DistanceView } from "./distance";
import { COLOR_STRATEGIES, EASE_FAMILIES, GRAMMARS } from "./genome";
import { FONT_TOKENS, HERO_TOKENS, heroFamilyOf } from "./tokens-table";
import type { NicheShares } from "./novelty.server";
import type { Band } from "./types";

/* ------------------------------------------------------------------ */
/* thresholds                                                          */
/* ------------------------------------------------------------------ */

export interface Thresholds {
  /** d below it against another store's row of the same bucket = a clone (DS6) */
  clone: number;
  /** the platform band */
  platform: number;
  /** the base of τ_niche(n) (DES-§7.9) */
  nicheBase: number;
  /** the own-page band (page scope) */
  ownPage: number;
  brandRadius: number;
  /** ok ≥ τ + margin, close in [τ, τ + margin) */
  margin: number;
}

/** The R-D36 floors: no calibration and no console value goes below them. */
export const THRESHOLD_FLOORS = { clone: 0.12, platform: 0.25, nicheBase: 0.4, ownPage: 0.3 } as const;
/** brandRadius is a ceiling (DES-§17.3: min(0.35, …)). */
export const BRAND_RADIUS_MAX = 0.35;

type Calibration = { clone?: number; platform?: number; nicheBase?: number; ownPage?: number; brandRadius?: number; bandMargin?: number };
type Overrides = { platform?: number; niche?: number; ownPage?: number; brandRadius?: number; clone?: number } | null | undefined;

const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);

/** calibration.json ⊕ platform_design.thresholds (the console may only raise them), never below the floors. */
export function mergeThresholds(cal: Calibration, over?: Overrides): Thresholds {
  const pick = (c: number | undefined, o: number | undefined, floor: number) => Math.max(floor, num(c, floor), num(o, floor));
  return {
    clone: pick(cal.clone, over?.clone, THRESHOLD_FLOORS.clone),
    platform: pick(cal.platform, over?.platform, THRESHOLD_FLOORS.platform),
    nicheBase: pick(cal.nicheBase, over?.niche, THRESHOLD_FLOORS.nicheBase),
    ownPage: pick(cal.ownPage, over?.ownPage, THRESHOLD_FLOORS.ownPage),
    brandRadius: Math.min(BRAND_RADIUS_MAX, num(over?.brandRadius, num(cal.brandRadius, BRAND_RADIUS_MAX))),
    margin: Math.max(0.05, num(cal.bandMargin, 0.05)),
  };
}

/** τ_niche(n) for n distinct stores with pool rows in the niche (exact n, DES-§7.9). */
export const nicheTau = (t: Thresholds, n: number) => tauNiche(n, t.nicheBase, t.platform);

/* ------------------------------------------------------------------ */
/* tell devices and buckets                                            */
/* ------------------------------------------------------------------ */

/** The S26 tell devices (gates/slop.ts `tellDevices`, rev 3: thirteen), one bit each in the packed tail. */
export const TELL_DEVICES = ["ghost", "eyebrows", "hotspots", "chat", "stamp", "tape", "bigNumbers", "slider", "countdown", "phone", "footerWord", "figCaption", "padded"] as const;

export function tellsMask(devices: readonly string[]): number {
  let m = 0;
  for (const d of devices) {
    const i = (TELL_DEVICES as readonly string[]).indexOf(d);
    if (i >= 0) m |= 1 << i;
  }
  return m;
}

export const tellsOfMask = (mask: number): string[] => TELL_DEVICES.filter((_, i) => (mask >> i) & 1);

/** The clone pre-filter partition (R-D36, `dg_bucket_idx`): "niche|grammar|colorStrategy", ≤ 96 characters. */
export function bucketKey(niche: string, view: Pick<DistanceView, "cat">): string {
  return `${niche}|${GRAMMARS[view.cat.grammar] ?? "-"}|${COLOR_STRATEGIES[view.cat.strategy] ?? "-"}`.slice(0, 96);
}

/* ------------------------------------------------------------------ */
/* the shards                                                          */
/* ------------------------------------------------------------------ */

export interface PoolRowInput {
  id: string;
  storeId: string;
  kind: "page" | "brand";
  niche: string;
  bucket: string;
  /** first_published_at as epoch ms (the first-come key, QUAL-19); null when unknown */
  fpa: number | null;
  vec: readonly number[];
}

/** One shard of the pool (columns; a removed row is swapped with the last). */
export interface PoolShard {
  ids: string[];
  stores: string[];
  /** 0 page, 1 brand */
  kinds: number[];
  niches: string[];
  buckets: string[];
  fpas: (number | null)[];
  vecs: Int16Array[];
  /**
   * The fixed head of every row's vector (the cheap components, `HEAD_STRIDE` slots per row) in one contiguous array,
   * row i at i × HEAD_STRIDE: the bounds loop reads memory in order instead of chasing 20,000 small arrays.
   */
  heads: Int16Array;
  index: Map<string, number>;
  bytes: number;
}

/** The head slots kept contiguous (the packed layout up to and including `crops`). */
export const HEAD_STRIDE = 48;

export const emptyShard = (): PoolShard => ({ ids: [], stores: [], kinds: [], niches: [], buckets: [], fpas: [], vecs: [], heads: new Int16Array(64 * HEAD_STRIDE), index: new Map(), bytes: 0 });

/** rough bytes of one row in memory: the typed array and its head copy, the id and store strings, the slots */
const rowBytes = (vecLen: number) => 2 * vecLen + 2 * HEAD_STRIDE + 2 * 26 * 2 + 64;

function writeHead(s: PoolShard, i: number, vec: Int16Array): void {
  if ((i + 1) * HEAD_STRIDE > s.heads.length) {
    const grown = new Int16Array(Math.max(s.heads.length * 2, (i + 1) * HEAD_STRIDE));
    grown.set(s.heads);
    s.heads = grown;
  }
  s.heads.set(vec.subarray(0, HEAD_STRIDE), i * HEAD_STRIDE);
}

/** A packed vector as Int16 (null when a value is out of range or not an integer: the row is skipped). */
export function toInt16(vec: readonly number[]): Int16Array | null {
  if (!Array.isArray(vec) || vec.length < VEC.seq || vec[0] !== 2) return null;
  const out = new Int16Array(vec.length);
  for (let i = 0; i < vec.length; i++) {
    const v = vec[i]!;
    if (!Number.isInteger(v) || v < -32768 || v > 32767) return null;
    out[i] = v;
  }
  const n = out[VEC.n]!;
  if (n < 0 || n > 24 || (out.length !== VEC.seq + n && out.length !== VEC.seq + n + 1)) return null;
  return out;
}

/** Insert or replace a row; strings pass through `intern` so equal niches and buckets share one string. */
export function upsertRow(s: PoolShard, r: PoolRowInput, intern: (v: string) => string = (v) => v): boolean {
  const vec = toInt16(r.vec);
  if (!vec) return false;
  let i = s.index.get(r.id);
  if (i === undefined) {
    i = s.ids.length;
    s.ids.push(r.id);
    s.index.set(r.id, i);
    s.stores.push("");
    s.kinds.push(0);
    s.niches.push("");
    s.buckets.push("");
    s.fpas.push(null);
    s.vecs.push(vec);
  } else s.bytes -= rowBytes(s.vecs[i]!.length);
  s.stores[i] = intern(r.storeId);
  s.kinds[i] = r.kind === "page" ? 0 : 1;
  s.niches[i] = intern(r.niche);
  s.buckets[i] = intern(r.bucket);
  s.fpas[i] = r.fpa;
  s.vecs[i] = vec;
  writeHead(s, i, vec);
  s.bytes += rowBytes(vec.length);
  return true;
}

export function removeRow(s: PoolShard, id: string): void {
  const i = s.index.get(id);
  if (i === undefined) return;
  const last = s.ids.length - 1;
  s.bytes -= rowBytes(s.vecs[i]!.length);
  s.index.delete(id);
  if (i !== last) {
    for (const col of [s.ids, s.stores, s.kinds, s.niches, s.buckets, s.fpas, s.vecs] as unknown[][]) col[i] = col[last];
    s.heads.copyWithin(i * HEAD_STRIDE, last * HEAD_STRIDE, (last + 1) * HEAD_STRIDE);
    s.index.set(s.ids[i]!, i);
  }
  for (const col of [s.ids, s.stores, s.kinds, s.niches, s.buckets, s.fpas, s.vecs] as unknown[][]) col.pop();
}

/** The shard of a row id (FNV-1a over the id). */
export function shardOf(id: string, shards: number): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193);
  return (h >>> 0) % shards;
}

export const poolSize = (shards: readonly PoolShard[]) => shards.reduce((s, x) => s + x.ids.length, 0);

/** The distinct stores with pool rows in a niche (the exact n of τ_niche(n)). */
export function storesInNiche(shards: readonly PoolShard[], niche: string): number {
  const seen = new Set<string>();
  for (const s of shards) for (let i = 0; i < s.ids.length; i++) if (s.niches[i] === niche) seen.add(s.stores[i]!);
  return seen.size;
}

/* ------------------------------------------------------------------ */
/* the bounds on packed vectors (DS57)                                 */
/* ------------------------------------------------------------------ */

const C = VEC_CAT;
const W_FULL = 40;
/** the weight of the three costly components (sequence 3, copy structure 2, openers 1) */
const OPEN_FULL = 6;
const EPS = 1e-12;

/*
 * The packed offsets the hot loop reads as literals (distance.ts VEC; asserted below, so a layout change fails at load
 * instead of comparing the wrong slots): locale 2, the 17 categorical genes 3-19 (grammar, strategy, treatment, pairing,
 * displayFamily, arDisplay, bodyAr, base, ladder, mask, depth, button, emphasis, glyph, motion, density, align), accent
 * 20-22, pop 23-25, the six numbers 26-31 (rd, w, space, area, ctas, nSections), hero 32, crops 46.
 */
if (
  VEC.locale !== 2 || C.grammar !== 3 || C.strategy !== 4 || C.treatment !== 5 || C.pairing !== 6 || C.displayFamily !== 7 || C.arDisplay !== 8 || C.bodyAr !== 9 ||
  C.base !== 10 || C.motion !== 17 || C.density !== 18 || C.align !== 19 || VEC.accent !== 20 || VEC.pop !== 23 || VEC_NUM.rd !== 26 || VEC_NUM.nSections !== 31 ||
  VEC.hero !== 32 || VEC.crops !== 46
)
  throw new Error("pool: the packed view layout moved; update the offsets of cheapFull");

const popcount = (n: number) => {
  let c = 0;
  for (let x = n >>> 0; x; x &= x - 1) c++;
  return c;
};

/** The locale-aware pairing component on packed vectors (distance.ts `pairingDistance`); `b` read at offset `o`. */
function pairingD(a: Int16Array, b: Int16Array, o: number): number {
  const arA = a[2] === 0;
  const arB = b[o + 2] === 0;
  if (!arA && !arB) {
    if (a[6] === b[o + 6] && (a[6]! >= 0 || (a[7] === b[o + 7] && a[8] === b[o + 8] && a[9] === b[o + 9]))) return 0;
    return a[7]! >= 0 && a[7] === b[o + 7] ? 0.5 : 1;
  }
  if (arA && arB) {
    if (a[8] === b[o + 8] && a[9] === b[o + 9]) return 0;
    return a[8]! >= 0 && a[8] === b[o + 8] ? 0.5 : 1;
  }
  return a[7]! >= 0 && a[7] === b[o + 7] && a[8]! >= 0 && a[8] === b[o + 8] ? 0.5 : 1;
}

/** min(1, OKLab ΔE / 0.15) of the integer triples at a[i] and b[o + i] (× 1,000): no square root past the cap. */
function labD(a: Int16Array, b: Int16Array, o: number, i: number): number {
  const x = a[i]! - b[o + i]!;
  const y = a[i + 1]! - b[o + i + 1]!;
  const z = a[i + 2]! - b[o + i + 2]!;
  const q = x * x + y * y + z * z;
  return q >= 22_500 ? 1 : Math.sqrt(q) / 150;
}

/** Σ w·d of the cheap components of the full scope (out of 40; the costly 6 left out); `b` read at offset `o`. */
export function cheapFull(a: Int16Array, b: Int16Array, o = 0): number {
  let s = 0;
  if (a[3] !== b[o + 3]) s += 3;
  if (a[4] !== b[o + 4]) s += 3;
  if (a[5] !== b[o + 5]) s += 3;
  s += 3 * pairingD(a, b, o);
  s += 2 * labD(a, b, o, 20) + labD(a, b, o, 23);
  for (let i = 10; i <= 19; i++) if (a[i] !== b[o + i]) s += 1;
  s += (Math.abs(a[26]! - b[o + 26]!) + Math.abs(a[27]! - b[o + 27]!) + Math.abs(a[28]! - b[o + 28]!) + Math.abs(a[29]! - b[o + 29]!) + Math.abs(a[30]! - b[o + 30]!) + Math.abs(a[31]! - b[o + 31]!)) / 1000;
  if (a[32] !== b[o + 32]) s += 2;
  const ca = a[46]!;
  const cb = b[o + 46]!;
  if (ca !== cb) {
    const u = popcount(ca | cb);
    if (u) s += 1 - popcount(ca & cb) / u;
  }
  return s;
}

/** lo ≤ d ≤ hi on packed vectors, full scope (equal to distance.ts `bounds(…, "full")`). */
export function packedBounds(a: Int16Array, b: Int16Array): { lo: number; hi: number } {
  const s = cheapFull(a, b);
  return { lo: s / W_FULL, hi: Math.min(1, (s + OPEN_FULL) / W_FULL) };
}

const viewOfRow = (v: Int16Array): DistanceView => unpackView(Array.from(v));

/* ------------------------------------------------------------------ */
/* verdicts                                                            */
/* ------------------------------------------------------------------ */

export interface PoolVerdict {
  platform: Band;
  niche: Band;
  clone: boolean;
  /** rows whose band needed the full distance (the < 5 % of DS57) */
  full: number;
  /** only with `exact`: the nearest full distance per band (the development ring, never persisted or answered) */
  nearest?: { platform: number; niche: number };
}

export interface VerdictOpts {
  /** the caller's store: its own rows never count */
  excludeStore: string;
  niche: string;
  bucket: string;
  tauPlatform: number;
  tauNiche: number;
  clone: number;
  margin: number;
  /**
   * The caller's page first went live at this instant (epoch ms): another store's row first published later is the
   * newcomer and never counts against the incumbent (QUAL-19). null = no live history (a new page).
   */
  incumbentSince?: number | null;
  /** compute the exact nearest distances too (development only, SG_DESIGN_DEBUG) */
  exact?: boolean;
}

const worse = (a: Band, b: Band): Band => (a === "too_close" || b === "too_close" ? "too_close" : a === "close" || b === "close" ? "close" : "ok");

/**
 * The platform, niche and clone verdict of one candidate over the shards (DES-§7.4): platform = the worst band over
 * other stores' rows of the same kind (τ_platform), niche = the same rows of the niche (τ_niche(n)), clone = a row of
 * the candidate's bucket at d < clone. Bounds first; equal to the full computation on every pair.
 */
export function verdictOf(view: DistanceView, packed: Int16Array, shards: readonly PoolShard[], o: VerdictOpts): PoolVerdict {
  const kind = view.kind === "page" ? 0 : 1;
  const exact = !!o.exact;
  const tp = o.tauPlatform;
  const tn = o.tauNiche;
  const okP = tp + o.margin - EPS;
  const okN = tn + o.margin - EPS;
  const cloneT = o.clone - EPS;
  let platform: Band = "ok";
  let niche: Band = "ok";
  let clone = false;
  let fullCount = 0;
  let nearP = 1;
  let nearN = 1;
  const incumbent = o.incumbentSince ?? null;
  for (const s of shards) {
    const n = s.ids.length;
    const stores = s.stores;
    const kinds = s.kinds;
    const vecs = s.vecs;
    const heads = s.heads;
    for (let i = 0; i < n; i++) {
      if (kinds[i] !== kind || stores[i] === o.excludeStore) continue;
      if (incumbent !== null) {
        const f = s.fpas[i];
        if (f !== null && f !== undefined && f > incumbent) continue;
      }
      const inNiche = s.niches[i] === o.niche;
      const inBucket = s.buckets[i] === o.bucket;
      if (!exact && platform === "too_close" && (niche === "too_close" || !inNiche) && (clone || !inBucket)) continue;
      const vec = vecs[i]!;
      const cheap = cheapFull(packed, heads, i * HEAD_STRIDE);
      const lo = cheap / W_FULL;
      const up = (cheap + OPEN_FULL) / W_FULL;
      const hi = up < 1 ? up : 1;
      let d = -1;
      if (exact) {
        d = genomeDistance(view, viewOfRow(vec));
        fullCount++;
        if (d < nearP) nearP = d;
        if (inNiche && d < nearN) nearN = d;
      }
      if (platform !== "too_close") {
        let b: Band;
        if (lo >= okP) b = "ok";
        else if (hi < tp - EPS) b = "too_close";
        else {
          if (d < 0) {
            d = genomeDistance(view, viewOfRow(vec));
            fullCount++;
          }
          b = bandOf(d, tp);
        }
        if (b !== "ok") platform = worse(platform, b);
      }
      if (inNiche && niche !== "too_close") {
        let b: Band;
        if (lo >= okN) b = "ok";
        else if (hi < tn - EPS) b = "too_close";
        else {
          if (d < 0) {
            d = genomeDistance(view, viewOfRow(vec));
            fullCount++;
          }
          b = bandOf(d, tn);
        }
        if (b !== "ok") niche = worse(niche, b);
      }
      if (inBucket && !clone && lo < cloneT) {
        if (hi < cloneT) clone = true;
        else {
          if (d < 0) {
            d = genomeDistance(view, viewOfRow(vec));
            fullCount++;
          }
          clone = d < cloneT;
        }
      }
    }
  }
  return { platform, niche, clone, full: fullCount, ...(exact ? { nearest: { platform: nearP, niche: nearN } } : {}) };
}

/** The worst band of a candidate against a list of views (the own pages, page scope). */
export function worstBand(view: DistanceView, refs: readonly DistanceView[], tau: number, scope: "full" | "page" | "brand" = "page"): Band {
  let out: Band = "ok";
  for (const r of refs) {
    out = worse(out, bandOf(genomeDistance(view, r, scope), tau));
    if (out === "too_close") break;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* niche shares (DES-§7.4, DS49, QUAL-32)                              */
/* ------------------------------------------------------------------ */

/** k-anonymity: shares exist only over ≥ 10 stores. */
export const SHARES_MIN_STORES = 10;

export const EMPTY_SHARES = (): NicheShares => ({
  n: 0,
  grammar: {},
  strategy: {},
  heroFamily: {},
  heroArrangement: {},
  displayFamily: {},
  arDisplay: {},
  arDisplayClass: {},
  motion: {},
  ghost: {},
  seq4: [],
  tells: [],
});

/** −1, 0 or +1 store-equivalent for a (field, value) of this refresh (keyed by the server; deterministic per hour). */
export type ShareNoise = (field: string, value: string) => -1 | 0 | 1;

/** A share rounded to 10 % after the noise, in [0, 1]. */
export const roundShare = (weight: number, noise: number, stores: number) => Math.round(Math.min(1, Math.max(0, (weight + noise) / stores)) * 10) / 10;

type MapField = Exclude<keyof NicheShares, "n" | "seq4" | "tells">;

/**
 * The niche's shares over its page rows (one niche's rows, any store): value → share maps rounded to 10 % with the
 * noise term, each store weighing 1 (its rows 1 / its row count each); empty below 10 stores; zero shares left out.
 */
export function sharesOf(rows: readonly { storeId: string; vec: ArrayLike<number> }[], noise: ShareNoise): NicheShares {
  const perStore = new Map<string, number>();
  for (const r of rows) if (r.vec[VEC.kind] === 0) perStore.set(r.storeId, (perStore.get(r.storeId) ?? 0) + 1);
  const stores = perStore.size;
  if (stores < SHARES_MIN_STORES) return EMPTY_SHARES();
  const acc: Record<MapField, Map<string, number>> = {
    grammar: new Map(),
    strategy: new Map(),
    heroFamily: new Map(),
    heroArrangement: new Map(),
    displayFamily: new Map(),
    arDisplay: new Map(),
    arDisplayClass: new Map(),
    motion: new Map(),
    ghost: new Map(),
  };
  const grams = new Map<string, number>();
  const pairs = new Map<string, number>();
  const add = (m: Map<string, number>, k: string | null | undefined, w: number) => {
    if (k) m.set(k, (m.get(k) ?? 0) + w);
  };
  for (const r of rows) {
    const v = r.vec;
    if (v[VEC.kind] !== 0) continue;
    const w = 1 / perStore.get(r.storeId)!;
    add(acc.grammar, GRAMMARS[v[C.grammar]!], w);
    add(acc.strategy, COLOR_STRATEGIES[v[C.strategy]!], w);
    const hero = v[VEC.hero]!;
    add(acc.heroFamily, heroFamilyOf(hero), w);
    add(acc.heroArrangement, HERO_TOKENS[hero], w);
    add(acc.displayFamily, FONT_TOKENS[v[C.displayFamily]!], w);
    const ar = FONT_TOKENS[v[C.arDisplay]!];
    add(acc.arDisplay, ar, w);
    add(acc.arDisplayClass, ar ? arDisplayClass(ar) : null, w);
    add(acc.motion, EASE_FAMILIES[v[C.motion]!], w);
    const devices = devicesOfVec(v);
    add(acc.ghost, devices & 1 ? "on" : "off", w);
    // the 4-grams of the in-flow sequence, each counted once per page
    const n = v[VEC.n]!;
    const seen = new Set<string>();
    for (let i = 0; i + 4 <= n; i++) {
      const g = `${v[VEC.seq + i]},${v[VEC.seq + i + 1]},${v[VEC.seq + i + 2]},${v[VEC.seq + i + 3]}`;
      if (!seen.has(g)) {
        seen.add(g);
        add(grams, g, w);
      }
    }
    const tells = tellsOfMask(devices);
    for (let i = 0; i < tells.length; i++) for (let j = i + 1; j < tells.length; j++) add(pairs, `${tells[i]}|${tells[j]}`, w);
  }
  const out = EMPTY_SHARES();
  out.n = Math.round(stores / 10) * 10;
  for (const field of Object.keys(acc) as MapField[]) {
    const m: Record<string, number> = {};
    for (const [k, w] of [...acc[field]].sort(([x], [y]) => (x < y ? -1 : 1))) {
      const share = roundShare(w, noise(field, k), stores);
      if (share > 0) m[k] = share;
    }
    out[field] = m;
  }
  const top = (m: Map<string, number>, field: string) =>
    [...m]
      .map(([k, w]) => ({ k, share: roundShare(w, noise(field, k), stores) }))
      .filter((x) => x.share > 0)
      .sort((x, y) => y.share - x.share || (x.k < y.k ? -1 : 1))
      .slice(0, 20);
  out.seq4 = top(grams, "seq4").map(({ k, share }) => ({ gram: k.split(",").map(Number), share }));
  out.tells = top(pairs, "tells").map(({ k, share }) => ({ pair: k.split("|") as [string, string], share }));
  return out;
}
