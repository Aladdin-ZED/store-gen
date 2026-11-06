import "server-only";
/**
 * The novelty service (P6 DESIGN; design.md DES-§7.4, DES-§7.5, DES-§7.8, DES-§7.9, DES-§22, H33, DS6-DS8, DS49, DS57;
 * docs/STORE-SAAS.md §E.6, D64). Server-only: the pooled `design_genomes` views of every store are read here and answered
 * as bands and coarse shares only. No store id, no vector, no genome and no distance ever leaves this module.
 *
 *  - The pool: the core's `scopedCache("novelty-pool")` under the platform key "p" (≤ 20,000 rows, ≤ 10 MB) holds the
 *    pool rows (`pool = 1`: live, or reserved for 30 / 90 days) as 16 shards of packed `Int16Array` views (src/lib/
 *    design/pool.ts). A refresh runs at most every 60 s: the one cross-store query of the track, annotated, reads the rows
 *    whose `updated_at` passed the watermark (rows that left the pool are evicted by the same read); a full reload, newest
 *    first, runs when a shard was evicted and every 15 minutes (a purged store's rows go then).
 *  - `checkNovelty(scope, req, ctx)`: per candidate (≤ 16) the platform band (τ_platform, other stores' rows of the same
 *    kind), the niche band (τ_niche(n), n = the niche's distinct stores), the clone flag (d < 0.12 on the candidate's
 *    bucket) and the own band (page scope, τ_own: hard against the last 5 published pages of the same product, the rest
 *    can only make it `close`; "first" without own pages). Bounds first (DS57). Another store's row first published after
 *    the caller's page is the newcomer and never counts against it (QUAL-19, `pages.first_published_at`).
 *  - The kill switch: the flag `design_novelty_check` and `platform_design.novelty`, the weaker wins: "off" → every band
 *    ok, no clone; "warn" → computed, and the publish check never blocks on them (`noveltyMode`).
 *  - Limits: `design:novelty` 60 calls / 10 min per store outside publish (refused with `rate_limited`), ≤ 16 candidates.
 *  - `nicheShares(niche)`: DES-§7.4's value → share maps over the niche's pool rows, k ≥ 10 stores, 10 % rounding with
 *    a keyed ± one store-equivalent noise, computed once per niche per hour (the hour is the watermark that enters
 *    `priorsV`). Synchronous: it answers from the loaded pool (empty before the first load); `loadNicheShares` loads it.
 *  - `exhaustionTest(scope, input, niche)`: DES-§7.9 step 4, ≤ 6 deterministic `differentiate` variants seeded by the
 *    page id and the pool watermark, bounds first against the pool: the first that clears τ_niche(n) (and stays clear of
 *    the platform band and the clone flag), else "exhausted".
 *  - Raw distances go only to an in-memory ring of the last 2,000 verdicts, in development with SG_DESIGN_DEBUG=1.
 */
import { and, asc, desc, eq, gt, inArray, lt, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { designGenomes } from "@/lib/db/schema";
import { hash32 } from "@/lib/generator/rng";
import type { PageDoc } from "@/lib/page/schema";
import { hmac } from "@/lib/security/crypto";
import { rateLimit, storeBucket } from "@/lib/security/rate-limit";
import { getPlatformSetting } from "@/lib/settings";
import { scopedCache } from "@/lib/tenancy/cache";
import { SeamError } from "@/lib/tenancy/seam";
import type { StoreScope } from "@/lib/tenancy/types";
import calibration from "./calibration.json";
import { differentiateVariants, type DifferentiateVariant } from "./differentiate";
import { packView, type DistanceView } from "./distance";
import { designFlag } from "./flags.server";
import { ownRecent, pageFacts, type OwnRow } from "./genomes.server";
import {
  bucketKey,
  emptyShard,
  EMPTY_SHARES,
  mergeThresholds,
  nicheTau,
  poolSize,
  removeRow,
  shardOf,
  sharesOf,
  storesInNiche,
  toInt16,
  upsertRow,
  verdictOf as verdictOfPool,
  worstBand,
  type PoolShard,
  type ShareNoise,
  type Thresholds,
} from "./pool";
import type { Band } from "./types";

export type NoveltyContext = "wizard" | "remix" | "studio" | "publish" | "theme";

/** ≤ 16 candidates per call (the Director budget is 12 per pass, QUAL-25) */
export interface NoveltyRequest {
  candidates: { key: string; view: DistanceView }[];
  niche: string;
  pageId?: string | null;
}

export interface NoveltyVerdict {
  key: string;
  platform: Band;
  niche: Band;
  own: Band | "first";
  clone: boolean;
}

/** value → share maps over the niche's pool rows, k ≥ 10 stores or empty, shares rounded to 10 % (DES-§7.4) */
export interface NicheShares {
  /** live stores, rounded to 10 */
  n: number;
  grammar: Record<string, number>;
  strategy: Record<string, number>;
  heroFamily: Record<string, number>;
  heroArrangement: Record<string, number>;
  displayFamily: Record<string, number>;
  arDisplay: Record<string, number>;
  arDisplayClass: Record<string, number>;
  motion: Record<string, number>;
  ghost: Record<string, number>;
  /** top 20 4-grams */
  seq4: { gram: number[]; share: number }[];
  /** device pairs */
  tells: { pair: [string, string]; share: number }[];
}

export type { Thresholds } from "./pool";

/** ≤ 16 candidates per call (DES-§7.4, DES-§24.2). */
export const NOVELTY_CANDIDATES_MAX = 16;
/** The store's bucket (DES-§7.4): 60 calls / 10 min, shared by `nicheSharesAction`. */
export const NOVELTY_RATE = { name: "design:novelty", limit: 60, windowSec: 600, per: "store" } as const;
/** The hard own-page scope (QUAL-4): the last 5 published pages of the same product. */
export const OWN_HARD_PAGES = 5;

const P = "p";
const SHARDS = 16;
const REFRESH_MS = 60_000;
const FULL_RELOAD_MS = 15 * 60_000;
const KEEP_MS = 60 * 60_000;
const PAGE_ROWS = 5_000;
const POOL_MAX = 20_000;
const RING_MAX = 2_000;
const OVERLAP_MS = 2_000;

interface PoolState {
  /** the last row read: (updated_at, id) */
  wm: { at: number; id: string } | null;
  fullAt: number;
}
interface Snapshot {
  shards: PoolShard[];
  /** the pool watermark (seeds the exhaustion test) */
  watermark: string;
}
interface SharesEntry {
  hour: string;
  shares: NicheShares;
}
interface RingEntry {
  at: number;
  ctx: NoveltyContext;
  key: string;
  platform: number;
  niche: number;
  tauNiche: number;
}
type Entry = { t: "shard"; s: PoolShard } | { t: "state"; s: PoolState } | { t: "fresh"; snap: Snapshot } | { t: "shares"; e: SharesEntry } | { t: "ring"; rows: RingEntry[] } | { t: "mark" };

const pool = scopedCache<Entry>({
  name: "novelty-pool",
  maxEntries: POOL_MAX,
  maxBytes: 10 * 1024 * 1024,
  ttlMs: REFRESH_MS,
  sizeOf: (e) => (e.t === "shard" ? e.s.bytes : e.t === "ring" ? e.rows.length * 64 : e.t === "shares" ? 4_096 : 128),
});

/* ------------------------------------------------------------------ */
/* thresholds and mode                                                 */
/* ------------------------------------------------------------------ */

/** calibration.json ⊕ platform_design.thresholds (the console only raises them), never below the R-D36 floors. */
export function thresholds(over?: Parameters<typeof mergeThresholds>[1]): Thresholds {
  return mergeThresholds(calibration.thresholds, over);
}

type Mode = "on" | "warn" | "off";
const MODES: readonly Mode[] = ["off", "warn", "on"];
const asMode = (v: unknown): Mode | null => (typeof v === "string" && (MODES as readonly string[]).includes(v) ? (v as Mode) : null);

/**
 * The effective novelty mode for the scope's store: the flag `design_novelty_check` (a store can be exempted) and
 * `platform_design.novelty` (the platform switch), the weaker of the two (off < warn < on).
 */
export async function noveltyMode(scope: StoreScope): Promise<Mode> {
  const setting = await getPlatformSetting("platform_design").catch(() => null);
  const flag = asMode(await designFlag("design_novelty_check", scope)) ?? "on";
  const platform = asMode(setting?.novelty) ?? "on";
  return MODES[Math.min(MODES.indexOf(flag), MODES.indexOf(platform))]!;
}

async function settingThresholds(): Promise<Thresholds> {
  const setting = await getPlatformSetting("platform_design").catch(() => null);
  return thresholds(setting?.thresholds);
}

/* ------------------------------------------------------------------ */
/* the pool cache                                                      */
/* ------------------------------------------------------------------ */

const shardKey = (i: number) => `shard:${i}`;

/**
 * Reads the pool rows that changed since the watermark (incremental, oldest first, rows that left the pool included so
 * they are evicted) or, for a full reload, the pool rows newest first. One query text for both.
 */
async function poolRows(full: boolean, cursor: { at: number; id: string } | null) {
  const at = cursor ? new Date(cursor.at) : null;
  // tenancy: platform design-novelty (DES-R9, D64): the pool read; store ids stay in this process, never answered
  return db
    .select({
      id: designGenomes.id,
      storeId: designGenomes.storeId,
      kind: designGenomes.kind,
      niche: designGenomes.niche,
      bucket: designGenomes.bucket,
      vec: designGenomes.vec,
      pool: designGenomes.pool,
      fpa: designGenomes.firstPublishedAt,
      updatedAt: designGenomes.updatedAt,
    })
    .from(designGenomes)
    .where(
      full
        ? and(eq(designGenomes.pool, true), at ? or(lt(designGenomes.updatedAt, at), and(eq(designGenomes.updatedAt, at), lt(designGenomes.id, cursor!.id))) : undefined)
        : and(inArray(designGenomes.pool, [false, true]), at ? or(gt(designGenomes.updatedAt, at), and(eq(designGenomes.updatedAt, at), gt(designGenomes.id, cursor!.id))) : undefined),
    )
    .orderBy(...(full ? [desc(designGenomes.updatedAt), desc(designGenomes.id)] : [asc(designGenomes.updatedAt), asc(designGenomes.id)]))
    .limit(PAGE_ROWS);
}

async function refresh(): Promise<Entry> {
  const now = Date.now();
  const prev = pool.get(P, "state");
  let shards: PoolShard[] | null = null;
  if (prev?.t === "state" && now - prev.s.fullAt < FULL_RELOAD_MS) {
    const got = Array.from({ length: SHARDS }, (_, i) => pool.get(P, shardKey(i)));
    if (got.every((e) => e?.t === "shard")) shards = got.map((e) => (e as { s: PoolShard }).s);
  }
  const full = shards === null;
  const state: PoolState = full ? { wm: null, fullAt: now } : (prev as { s: PoolState }).s;
  shards ??= Array.from({ length: SHARDS }, emptyShard);
  const names = new Map<string, string>();
  const intern = (v: string) => {
    const hit = names.get(v);
    if (hit !== undefined) return hit;
    names.set(v, v);
    return v;
  };
  // the incremental read starts 2 s before the watermark (a row committed late with an earlier updated_at is still
  // seen; re-reading a row is an idempotent upsert); an empty pool starts at its last full reload
  let cursor: { at: number; id: string } | null = full ? null : { at: (state.wm?.at ?? state.fullAt) - OVERLAP_MS, id: "" };
  let size = poolSize(shards);
  for (let page = 0; page < POOL_MAX / PAGE_ROWS + 1; page++) {
    const rows = await poolRows(full, cursor);
    for (const r of rows) {
      const shard = shards[shardOf(r.id, SHARDS)]!;
      if (!r.pool) {
        if (shard.index.has(r.id)) size--;
        removeRow(shard, r.id);
        continue;
      }
      const known = shard.index.has(r.id);
      if (!known && size >= POOL_MAX) continue;
      if (upsertRow(shard, { id: r.id, storeId: r.storeId, kind: r.kind, niche: r.niche, bucket: r.bucket, fpa: r.fpa ? r.fpa.getTime() : null, vec: r.vec }, intern) && !known) size++;
    }
    const last = rows.at(-1);
    if (full && rows.length) {
      const first = rows[0]!;
      if (page === 0) state.wm = { at: first.updatedAt.getTime(), id: first.id };
    }
    if (last) cursor = { at: last.updatedAt.getTime(), id: last.id };
    if (!full && last) state.wm = cursor;
    if (rows.length < PAGE_ROWS || (full && size >= POOL_MAX)) break;
  }
  shards.forEach((s, i) => pool.set(P, shardKey(i), { t: "shard", s }, { ttlMs: KEEP_MS }));
  pool.set(P, "state", { t: "state", s: state }, { ttlMs: KEEP_MS });
  return { t: "fresh", snap: { shards, watermark: state.wm ? `${state.wm.at}.${state.wm.id}` : "empty" } };
}

/** The loaded pool, refreshed at most every 60 s (single flight). */
async function ensurePool(): Promise<Snapshot> {
  const e = await pool.getOrLoad(P, "fresh", refresh, { ttlMs: REFRESH_MS });
  return (e as { snap: Snapshot }).snap;
}

/** The pool as loaded now, without a refresh (null before the first load or after an eviction). */
function loadedShards(): PoolShard[] | null {
  const fresh = pool.get(P, "fresh");
  if (fresh?.t === "fresh") return fresh.snap.shards;
  const got = Array.from({ length: SHARDS }, (_, i) => pool.get(P, shardKey(i)));
  return got.every((e) => e?.t === "shard") ? got.map((e) => (e as { s: PoolShard }).s) : null;
}

/** Drops the pool and the shares (tests; the next call reloads it fully). */
export function resetNoveltyPool(): void {
  pool.clear();
}

/** Ends the 60-second freshness now (tests, the console's "refresh"): the next call reads the rows past the watermark. */
export function expireNoveltyPool(): void {
  pool.delete(P, "fresh");
}

/* ------------------------------------------------------------------ */
/* checkNovelty                                                        */
/* ------------------------------------------------------------------ */

const hourOf = (t = Date.now()) => new Date(t).toISOString().slice(0, 13);

function debugOn(): boolean {
  return process.env.SG_DESIGN_DEBUG === "1" && process.env.NODE_ENV !== "production";
}

function remember(rows: RingEntry[]): void {
  const prev = pool.get(P, "ring");
  const ring = prev?.t === "ring" ? prev.rows : [];
  ring.push(...rows);
  if (ring.length > RING_MAX) ring.splice(0, ring.length - RING_MAX);
  pool.set(P, "ring", { t: "ring", rows: ring }, { ttlMs: 24 * KEEP_MS });
}

/** The raw distances of the last ≤ 2,000 verdicts (development with SG_DESIGN_DEBUG=1 only; else empty). */
export function noveltyDebugRing(): readonly RingEntry[] {
  if (!debugOn()) return [];
  const e = pool.get(P, "ring");
  return e?.t === "ring" ? e.rows.slice() : [];
}

function logOffOncePerHour(): void {
  const key = `off:${hourOf()}`;
  if (pool.get(P, key)) return;
  pool.set(P, key, { t: "mark" }, { ttlMs: KEEP_MS });
  console.warn("[design] novelty_off: the cross-store novelty check is switched off");
}

/** τ_niche(n) of a niche now (n = its distinct stores with pool rows, exact). Server-side only: never answered. */
export async function nicheThreshold(niche: string): Promise<number> {
  const [snap, th] = await Promise.all([ensurePool(), settingThresholds()]);
  return nicheTau(th, storesInNiche(snap.shards, niche));
}

/** The own-page band (QUAL-4): hard against the last 5 published pages of the product, the rest only `close`. */
function ownBand(view: DistanceView, own: readonly OwnRow[], product: string | null, tau: number): Band | "first" {
  if (!own.length) return "first";
  const hard: DistanceView[] = [];
  const soft: DistanceView[] = [];
  for (const r of own) {
    const same = product === null || r.product === null || r.product === product;
    if (r.source === "published" && same && hard.length < OWN_HARD_PAGES) hard.push(r.view);
    else soft.push(r.view);
  }
  const h = worstBand(view, hard, tau, "page");
  if (h !== "ok") return h;
  return worstBand(view, soft, tau, "page") === "ok" ? "ok" : "close";
}

export async function checkNovelty(scope: StoreScope, req: NoveltyRequest, ctx: NoveltyContext): Promise<NoveltyVerdict[]> {
  const candidates = req.candidates.slice(0, NOVELTY_CANDIDATES_MAX);
  if (!candidates.length) return [];
  const allOk = (): NoveltyVerdict[] => candidates.map((c) => ({ key: c.key, platform: "ok", niche: "ok", own: "ok", clone: false }));
  const mode = await noveltyMode(scope);
  if (mode === "off") {
    logOffOncePerHour();
    return allOk();
  }
  if (ctx !== "publish") {
    const r = await rateLimit(storeBucket(scope, NOVELTY_RATE.name), NOVELTY_RATE.limit, NOVELTY_RATE.windowSec);
    if (!r.ok) throw new SeamError("rate_limited");
  }
  const pageId = req.pageId ?? null;
  const [snap, th, facts, own] = await Promise.all([ensurePool(), settingThresholds(), pageId ? pageFacts(scope, pageId) : Promise.resolve(null), ownRecent(scope, { excludePageId: pageId })]);
  const tauNiche = nicheTau(th, storesInNiche(snap.shards, req.niche));
  const exact = debugOn();
  const ring: RingEntry[] = [];
  const out = candidates.map((c): NoveltyVerdict => {
    const packed = toInt16(packView(c.view));
    if (!packed) return { key: c.key, platform: "ok", niche: "ok", own: ownBand(c.view, own, facts?.product ?? null, th.ownPage), clone: false };
    const v = verdictFor(c.view, packed, snap.shards, scope, req.niche, th, tauNiche, facts?.firstPublishedAt ?? null, exact);
    if (exact && v.nearest) ring.push({ at: Date.now(), ctx, key: c.key, platform: v.nearest.platform, niche: v.nearest.niche, tauNiche });
    return { key: c.key, platform: v.platform, niche: v.niche, own: ownBand(c.view, own, facts?.product ?? null, th.ownPage), clone: v.clone };
  });
  if (ring.length) remember(ring);
  return out;
}

function verdictFor(view: DistanceView, packed: Int16Array, shards: readonly PoolShard[], scope: StoreScope, niche: string, th: Thresholds, tauNiche: number, since: Date | null, exact = false) {
  return verdictOfPool(view, packed, shards, {
    excludeStore: scope.storeId,
    niche,
    bucket: bucketKey(niche, view),
    tauPlatform: th.platform,
    tauNiche,
    clone: th.clone,
    margin: th.margin,
    incumbentSince: since ? since.getTime() : null,
    exact,
  });
}

/* ------------------------------------------------------------------ */
/* niche shares                                                        */
/* ------------------------------------------------------------------ */

/** The keyed noise of one niche and hour: −1, 0 or +1 store-equivalent per (field, value). */
function noiseFor(niche: string, hour: string): ShareNoise {
  return (field, value) => ((parseInt(hmac(`${niche}\u0000${hour}\u0000${field}\u0000${value}`, "niche-shares-noise").slice(0, 8), 16) % 3) - 1) as -1 | 0 | 1;
}

/** The shares of the niche from the loaded pool, computed once per hour per niche (empty before the pool loads). */
export function nicheShares(niche: string): NicheShares {
  const hour = hourOf();
  const hit = pool.get(P, `shares:${niche}`);
  if (hit?.t === "shares" && hit.e.hour === hour) return structuredClone(hit.e.shares);
  if (!loadedShards()) return EMPTY_SHARES();
  const shares = nicheSharesForHour(niche, hour);
  const nextHour = (Math.floor(Date.now() / 3_600_000) + 1) * 3_600_000;
  pool.set(P, `shares:${niche}`, { t: "shares", e: { hour, shares } }, { ttlMs: Math.max(1_000, nextHour - Date.now()) });
  return structuredClone(shares);
}

/**
 * The niche's shares as the hour `hour` ("YYYY-MM-DDTHH") would compute them from the pool loaded now, uncached (the
 * differencing test of DES-§22 and the console). Server-side only, like every share.
 */
export function nicheSharesForHour(niche: string, hour: string): NicheShares {
  const shards = loadedShards();
  if (!shards) return EMPTY_SHARES();
  const rows: { storeId: string; vec: Int16Array }[] = [];
  for (const s of shards) for (let i = 0; i < s.ids.length; i++) if (s.niches[i] === niche) rows.push({ storeId: s.stores[i]!, vec: s.vecs[i]! });
  return sharesOf(rows, noiseFor(niche, hour));
}

/** The hour watermark of the niche's current shares ("YYYY-MM-DDTHH", UTC), the part of `priorsV` they decide. */
export function nicheSharesWatermark(niche: string): string | null {
  const hit = pool.get(P, `shares:${niche}`);
  return hit?.t === "shares" ? hit.e.hour : null;
}

/** `nicheShares` after the pool is loaded (the action and the server-side wizard call this one). */
export async function loadNicheShares(niche: string): Promise<NicheShares> {
  await ensurePool();
  return nicheShares(niche);
}

/* ------------------------------------------------------------------ */
/* the exhaustion test (DES-§7.9 step 4)                               */
/* ------------------------------------------------------------------ */

export interface ExhaustionInput {
  pageId: string;
  /** the page as it would publish (its look decides the genome) */
  doc: PageDoc;
  /** the brand's gene locks (`brand.genes`, G4 when `brand.fonts.locked`); the page's own look locks are read too */
  locked?: readonly string[];
  /** the page's view when the caller has it (its seq / tags / openers / crops are kept) */
  view?: DistanceView;
}

/**
 * ≤ 6 deterministic `differentiate` variants (seeded by the page id and the pool watermark) checked bounds first
 * against the pool: the first that clears τ_niche(n) without meeting the platform band or the clone flag, else
 * "exhausted" (the niche is full for this page's constraints: N1 goes soft with `vars.fallback = 1`).
 */
export async function exhaustionTest(scope: StoreScope, input: ExhaustionInput, niche: string): Promise<DifferentiateVariant | "exhausted"> {
  const [snap, th, facts] = await Promise.all([ensurePool(), settingThresholds(), pageFacts(scope, input.pageId)]);
  const tauNiche = nicheTau(th, storesInNiche(snap.shards, niche));
  const seed = hash32(`${input.pageId}|${snap.watermark}`);
  const variants = differentiateVariants(input.doc, seed, { locked: input.locked, ...(input.view ? { base: input.view } : {}) });
  for (const v of variants) {
    const packed = toInt16(packView(v.view));
    if (!packed) continue;
    const r = verdictFor(v.view, packed, snap.shards, scope, niche, th, tauNiche, facts?.firstPublishedAt ?? null);
    if (r.niche !== "too_close" && r.platform !== "too_close" && !r.clone) return v;
  }
  return "exhausted";
}

