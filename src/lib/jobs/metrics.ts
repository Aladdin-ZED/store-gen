import "server-only";
/**
 * Process ops metrics (docs/STORE-SAAS.md §H.2 ENGC-11, §H.5 `db` / `tick`, §H.7 "Database connection budget"
 * ENGC-12): numbers only, never a store's data.
 *
 *   startLagSampling(); …the tick's jobs… const lag = stopLagSampling();   // { p95Ms, maxMs } of event-loop lag
 *   ctx.lagMs = currentLagMs;                                               // renders / backups shorten their budget > 100 ms
 *   ensureOpsSamplers();                                                    // boot (CCR r1-p8-1), runTick and getHealth
 *   poolWaitP95Ms(); lockPoolWaitP95Ms();                                   // getHealth().db; null with no samples
 *
 * - Lag: `perf_hooks.monitorEventLoopDelay` at a 20 ms resolution while a tick runs. The histogram records the whole
 *   timer interval, so the resolution is subtracted (an idle loop reads ≈ 0, never 20).
 * - Query-pool wait: `ensureOpsSamplers()` attaches 'enqueue' and 'acquire' listeners to `pool()` once and keeps the
 *   enqueue times in FIFO order. mysql2 hands a released connection straight to the oldest waiter WITHOUT emitting
 *   'acquire' (lib/base/pool.js `_handleSuccessfulRelease`), so a waiter is matched by the pool's queue length
 *   shrinking: read on every 'acquire' and by a 25 ms unref'd poll while anyone waits. An acquisition that never
 *   queued is a 0 ms sample, so the p95 is over every acquisition, not only the unlucky ones.
 * - Lock-pool wait: measured by src/lib/db/locks.ts around its connection wait (`recordLockPoolWait`), timeouts
 *   included (at the full wait).
 * - Both waits are rolling 5-minute windows (at most 4,096 samples each, the newest kept); the `pool_wait` alarm
 *   (§H.5) fires on a p95 above 500 ms.
 *
 * All state sits on one `globalThis.__sgOpsMetrics` (one copy per process even across bundles; L4 allow entry, CCR
 * r1-p8-4). Every reader takes an optional `now` so test:jobs drives the windows with a fake clock.
 */
import { monitorEventLoopDelay, type IntervalHistogram } from "node:perf_hooks";

/** the lag histogram's timer interval (ms) */
export const LAG_RESOLUTION_MS = 20;
/** the rolling window of the pool-wait samples */
export const WAIT_WINDOW_MS = 5 * 60_000;
/** samples kept per window (the newest) */
export const MAX_WAIT_SAMPLES = 4096;
/** the waiter poll while the query pool has a queue */
const QUEUE_POLL_MS = 25;

interface Sample {
  at: number;
  ms: number;
}

/** The slice of a mysql2 (promise) pool the sampler uses; `pool._connectionQueue` is read, never written. */
export interface SampledPool {
  on(event: "enqueue" | "acquire", listener: (...args: unknown[]) => void): unknown;
  pool?: { _connectionQueue?: { length?: unknown } };
}

interface OpsMetrics {
  lag: { hist: IntervalHistogram | null; startedAt: number; last: { p95Ms: number | null; maxMs: number | null } | null };
  poolWaits: Sample[];
  lockWaits: Sample[];
  /** enqueue times of the query pool's current waiters, oldest first */
  queued: number[];
  /** the pool the listeners are on (attached once) */
  attached: SampledPool | null;
  /** the listeners' clock (Date.now; a fake one in test:jobs) */
  clock: () => number;
  poll: ReturnType<typeof setInterval> | null;
}

declare global {
  var __sgOpsMetrics: OpsMetrics | undefined;
}

function state(): OpsMetrics {
  return (globalThis.__sgOpsMetrics ??= { lag: { hist: null, startedAt: 0, last: null }, poolWaits: [], lockWaits: [], queued: [], attached: null, clock: Date.now, poll: null });
}

/* ------------------------------------------------------------------ */
/* Percentiles                                                         */
/* ------------------------------------------------------------------ */

/** Nearest-rank percentile (p in 0-100) of `values`; null when empty. p 0 is the minimum, p 100 the maximum. */
export function percentile(values: readonly number[], p: number): number | null {
  const xs = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!xs.length) return null;
  const q = Math.min(100, Math.max(0, Number.isFinite(p) ? p : 0));
  const rank = Math.max(1, Math.ceil((q / 100) * xs.length));
  return xs[rank - 1]!;
}

/* ------------------------------------------------------------------ */
/* Rolling wait windows                                                */
/* ------------------------------------------------------------------ */

function push(list: Sample[], ms: number, at: number): void {
  if (!Number.isFinite(ms) || !Number.isFinite(at)) return;
  list.push({ at, ms: Math.max(0, ms) });
  // trimmed in batches so a busy pool does not shift the array on every sample
  if (list.length > MAX_WAIT_SAMPLES + 512) list.splice(0, list.length - MAX_WAIT_SAMPLES);
}

function windowP95(list: Sample[], now: number): number | null {
  const from = now - WAIT_WINDOW_MS;
  let drop = 0;
  while (drop < list.length && list[drop]!.at < from) drop++;
  if (drop) list.splice(0, drop);
  const recent = list.length > MAX_WAIT_SAMPLES ? list.slice(-MAX_WAIT_SAMPLES) : list;
  const p = percentile(
    recent.filter((s) => s.at <= now).map((s) => s.ms),
    95,
  );
  return p === null ? null : Math.round(p);
}

/** One query-pool acquisition: `ms` spent waiting for a connection (0 when one was free). */
export function recordPoolWait(ms: number, now: number = Date.now()): void {
  push(state().poolWaits, ms, now);
}

/** One lock-pool acquisition (src/lib/db/locks.ts): `ms` spent waiting, the full wait when it timed out. */
export function recordLockPoolWait(ms: number, now: number = Date.now()): void {
  push(state().lockWaits, ms, now);
}

/** p95 of the query pool's waits over the last 5 minutes (ms), or null with no samples. */
export function poolWaitP95Ms(now: number = Date.now()): number | null {
  reconcileQueue(now);
  return windowP95(state().poolWaits, now);
}

/** p95 of the lock pool's waits over the last 5 minutes (ms), or null with no samples. */
export function lockPoolWaitP95Ms(now: number = Date.now()): number | null {
  return windowP95(state().lockWaits, now);
}

/* ------------------------------------------------------------------ */
/* The query-pool sampler                                              */
/* ------------------------------------------------------------------ */

function queueLength(p: SampledPool): number | null {
  const n = p.pool?._connectionQueue?.length;
  return typeof n === "number" && Number.isInteger(n) && n >= 0 ? n : null;
}

/**
 * Records the waits of the waiters the pool served since the last look and returns how many. With the pool's queue
 * unreadable (a mysql2 upgrade renamed it) only an 'acquire' serves one waiter, the oldest: approximate, never
 * unbounded, and the poll then does nothing.
 */
function reconcileQueue(now: number, acquire = false): number {
  const s = state();
  if (!s.attached) return 0;
  const waiting = queueLength(s.attached);
  const target = waiting ?? (acquire ? Math.max(0, s.queued.length - 1) : s.queued.length);
  let served = 0;
  while (s.queued.length > target) {
    recordPoolWait(now - s.queued.shift()!, now);
    served++;
  }
  if (!s.queued.length && s.poll) {
    clearInterval(s.poll);
    s.poll = null;
  }
  return served;
}

function onEnqueue(now: number): void {
  const s = state();
  s.queued.push(now);
  if (s.queued.length > MAX_WAIT_SAMPLES) s.queued.shift(); // a stuck pool: the oldest waiters stop being tracked
  if (!s.poll) {
    const clock = s.clock;
    s.poll = setInterval(() => reconcileQueue(clock()), QUEUE_POLL_MS);
    s.poll.unref?.();
  }
}

function onAcquire(now: number): void {
  // waiters exist only while every connection is busy, so an acquisition with none queued never waited; a waiter
  // served through a fresh connection (after a destroyed one) emits 'acquire' and is counted once, here
  const served = state().queued.length ? reconcileQueue(now, true) : 0;
  if (!served) recordPoolWait(0, now);
}

/**
 * Attaches the query-pool listeners once per process (boot, runTick and getHealth call it; idempotent and never
 * throws). `target` and `clock` are for tests; the app passes nothing and the pool is loaded lazily, so importing
 * this module (the lock path does) never loads the database client. Returns true when the listeners are on `target`
 * now or already were on a pool; for the app's own pool the attach completes once the import resolves.
 */
export function ensureOpsSamplers(target?: SampledPool, clock: () => number = Date.now): boolean {
  const s = state();
  if (target) return attach(target, clock);
  if (s.attached) return true;
  if (!process.env.DATABASE_URL) return false;
  void import("@/lib/db/client").then(
    (m) => {
      try {
        attach(m.pool() as unknown as SampledPool, clock);
      } catch {
        // DATABASE_URL unusable: nothing to sample (the app logs that elsewhere)
      }
    },
    () => undefined,
  );
  return false;
}

function attach(p: SampledPool, clock: () => number): boolean {
  const s = state();
  if (s.attached === p) return true;
  if (s.attached) return false; // one pool per process; a second target is refused rather than mixed in
  try {
    // a listener of a pool the state no longer knows (after resetOpsMetrics) goes quiet
    p.on("enqueue", () => {
      if (state().attached === p) onEnqueue(state().clock());
    });
    p.on("acquire", () => {
      if (state().attached === p) onAcquire(state().clock());
    });
    s.attached = p;
    s.clock = clock;
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Event-loop lag (the tick)                                           */
/* ------------------------------------------------------------------ */

const lagOf = (ns: number): number => Math.max(0, Math.round(ns / 1e6 - LAG_RESOLUTION_MS));

/** Starts (or restarts) the lag histogram for one tick. */
export function startLagSampling(): void {
  const s = state();
  s.lag.hist?.disable();
  const hist = monitorEventLoopDelay({ resolution: LAG_RESOLUTION_MS });
  hist.enable();
  s.lag = { hist, startedAt: Date.now(), last: s.lag.last };
}

function readLag(hist: IntervalHistogram): { p95Ms: number | null; maxMs: number | null } {
  if (!hist.count) return { p95Ms: null, maxMs: null };
  return { p95Ms: lagOf(hist.percentile(95)), maxMs: lagOf(hist.max) };
}

/** Stops the tick's histogram: event-loop lag p95 and max (ms), null when the tick was too short to sample. */
export function stopLagSampling(): { p95Ms: number | null; maxMs: number | null } {
  const s = state();
  const hist = s.lag.hist;
  if (!hist) return { p95Ms: null, maxMs: null };
  hist.disable();
  const out = readLag(hist);
  s.lag = { hist: null, startedAt: 0, last: out };
  return out;
}

/** The running tick's lag estimate so far (its p95, ms); 0 outside a tick or before the first sample. */
export function currentLagMs(): number {
  const hist = state().lag.hist;
  return hist ? (readLag(hist).p95Ms ?? 0) : 0;
}

/** The lag of the last finished tick, or null (getHealth reads job_runs; this is the process's own copy). */
export function lastTickLag(): { p95Ms: number | null; maxMs: number | null } | null {
  return state().lag.last;
}

/** Tests: forget every sample and the attached pool (its listeners stay registered but go quiet). */
export function resetOpsMetrics(): void {
  const s = globalThis.__sgOpsMetrics;
  if (s?.poll) clearInterval(s.poll);
  s?.lag.hist?.disable();
  globalThis.__sgOpsMetrics = undefined;
}
