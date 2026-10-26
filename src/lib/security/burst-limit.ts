/**
 * Per-process burst guard for the public endpoints: a fixed window per network (rateKeyIp: the IPv4
 * address, or the IPv6 /64), counted in memory, checked BEFORE any database work.
 *
 * The database limits (./rate-limit) stay the real policy: they survive restarts and are shared by
 * every process. This guard only keeps a flood away from MariaDB (each DB limit costs two queries,
 * and the page lookup more), so its limits sit far above anything a shopper sends, even many
 * shoppers behind one mobile-carrier address (CGNAT).
 *
 * Memory is bounded: at most MAX_KEYS windows; when full, expired windows go first, then the oldest.
 */
import { rateKeyIp } from "./ip";

interface Window {
  count: number;
  resetAt: number;
}

declare global {
  var __codBurst: Map<string, Window> | undefined;
}

const MAX_KEYS = 10_000;

export interface BurstResult {
  ok: boolean;
  /** seconds until the window resets (≥ 1) */
  retryAfter: number;
}

/** Limits per network and window, per public endpoint. */
export const BURST_LIMITS = {
  /** COD orders: the database keeps 60 per 10 min per network (then per-phone and per-page limits) */
  order: { limit: 120, windowSec: 60 },
  /** analytics beacons: the database keeps 240 per 10 min per network */
  event: { limit: 240, windowSec: 60 },
  /** abandoned-lead capture: the database keeps 30 per 10 min per network */
  lead: { limit: 60, windowSec: 60 },
  /** one-click upsell: the database keeps 20 per 10 min per network */
  upsell: { limit: 40, windowSec: 60 },
  /** cron key guesses: the database keeps 60 per 10 min per network; the real job calls twice */
  cron: { limit: 30, windowSec: 600 },
  /** public liveness (GET /api/health): monitors poll every minute or so; one `SELECT 1` per allowed call (CCR r1.0-t3-4) */
  health: { limit: 60, windowSec: 60 },
  /** public auth forms (publicAction, §B.1 / §B.2 step 1): the DB buckets keep 5/h (signup, report) and 10/15 min (invite, reset, login per IP) */
  signup: { limit: 20, windowSec: 600 },
  invite: { limit: 30, windowSec: 600 },
  reset: { limit: 30, windowSec: 600 },
  report: { limit: 20, windowSec: 600 },
  login: { limit: 60, windowSec: 600 },
  /** the signup form's live handle check (publicAction("handle"), one call per pause in typing): the database keeps 60 / 10 min */
  handle: { limit: 120, windowSec: 600 },
} as const;

export type BurstScope = keyof typeof BURST_LIMITS;

/** Count one request of `ip` in `scope`; ok=false once the window's limit is passed. */
export function burstLimit(scope: BurstScope, ip: string, now: number = Date.now()): BurstResult {
  const { limit, windowSec } = BURST_LIMITS[scope];
  const map = (globalThis.__codBurst ??= new Map());
  const key = `${scope}:${rateKeyIp(ip)}`;
  let w = map.get(key);
  if (!w || w.resetAt <= now) {
    if (w) map.delete(key); // re-inserted below: the Map stays ordered by window start
    if (map.size >= MAX_KEYS) evict(map, now);
    w = { count: 0, resetAt: now + windowSec * 1000 };
    map.set(key, w);
  }
  w.count++;
  return { ok: w.count <= limit, retryAfter: Math.max(1, Math.ceil((w.resetAt - now) / 1000)) };
}

function evict(map: Map<string, Window>, now: number): void {
  for (const [key, w] of map) if (w.resetAt <= now) map.delete(key);
  if (map.size < MAX_KEYS) return;
  // a flood of distinct networks: drop the oldest tenth (insertion order = window start)
  let drop = Math.ceil(MAX_KEYS / 10);
  for (const key of map.keys()) {
    if (drop-- <= 0) break;
    map.delete(key);
  }
}

/** Test hook: forget every window. */
export function resetBurstLimits(): void {
  globalThis.__codBurst = undefined;
}
