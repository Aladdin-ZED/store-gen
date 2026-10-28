import "server-only";
/**
 * The error ring (docs/STORE-SAAS.md §H.5, OS-09): unexpected failures counted per hour in `error_events`, read by
 * `getHealth().errors`, the `edge` counters and the error-spike alarm (> 50 of one code in an hour).
 *
 *   recordError("orders", err);                                         // logError (CCR r1-p8-8) and the jobs
 *   recordError("action", err, { storeId: scope.storeId, route });       // the action wrappers' failure branch
 *   recordError("edge", null, { code: "path_unsigned" });               // a counted event without an error object
 *   await flushErrors();                                                 // the runner, at the end of each tick
 *
 * - One row per (hour bucket, area, code, route, store): `bucket` = "YYYY-MM-DDTHH" in UTC and `dedupe` =
 *   sha256(bucket|area|code|route|storeId), the unique key the flush upserts on (count added, last_at moved).
 * - `code` = `opts.code`, else the database driver's code found in the error's cause chain (ER_LOCK_DEADLOCK,
 *   ECONNREFUSED…), else the error's name.
 * - The sample is `{ summary: errorSummary(err) }` (src/lib/orders/log.ts) and nothing else: a database error is
 *   reduced to its code there, because drizzle's message quotes every bound value. A plain Error keeps its message in
 *   errorSummary, so the sample also masks e-mail addresses and digit runs of 6 or more (phones, order numbers) and is
 *   cut to 200 characters: no customer value is stored whatever the thrower wrote.
 * - `recordError` never throws and never waits: it merges into a buffer on `globalThis.__sgErrorBuffer` (at most 500
 *   keys; past that the counts go to one `errors` / `buffer_full` row) and schedules a flush at most every 30 s on an
 *   unref'd timer. A missing table (errno 1146: 0005 not applied) is logged once and the buffer dropped; a store id
 *   the stores table no longer has (errno 1452) is stored as NULL rather than losing the count; any other failure is
 *   logged (code only) and the rows go back into the buffer for the next flush.
 *
 * No store data is held: the buffer keeps hashes, codes, route patterns, store ids and counts (L4 allow entry, CCR
 * r1-p8-4). `route` is a route pattern ("/api/app/[store]/media"), never a URL with values; its query is cut off.
 */
import { createHash } from "node:crypto";
import { errorSummary } from "@/lib/orders/log";

/** the flush period (a tick also flushes at its end) */
export const ERROR_FLUSH_MS = 30_000;
/** buffered keys at most, the overflow row included */
export const ERROR_BUFFER_KEYS = 500;
const SUMMARY_MAX = 200;
const AREA_MAX = 32;
const CODE_MAX = 64;
const ROUTE_MAX = 120;
/** rows per INSERT */
const FLUSH_BATCH = 100;
const STORE_ID_RE = /^[0-9A-Za-z]{1,26}$/;
const OVERFLOW = { area: "errors", code: "buffer_full" } as const;

export interface RecordErrorOpts {
  storeId?: string | null;
  /** a route pattern, never a URL with values */
  route?: string | null;
  /** overrides the code read from the error */
  code?: string | null;
}

/** One buffered error_events row. */
export interface PendingError {
  dedupe: string;
  bucket: string;
  area: string;
  code: string;
  route: string | null;
  storeId: string | null;
  count: number;
  firstAt: number;
  lastAt: number;
  sample: { summary: string } | null;
}

interface ErrorBuffer {
  rows: Map<string, PendingError>;
  timer: ReturnType<typeof setTimeout> | null;
  lastFlushAt: number;
  flushing: Promise<void> | null;
  /** the "table missing" line went out */
  missingLogged: boolean;
  /** the last other flush failure line (ms), at most one a minute */
  failLoggedAt: number;
}

declare global {
  var __sgErrorBuffer: ErrorBuffer | undefined;
}

function buffer(): ErrorBuffer {
  return (globalThis.__sgErrorBuffer ??= { rows: new Map(), timer: null, lastFlushAt: 0, flushing: null, missingLogged: false, failLoggedAt: -Infinity });
}

/* ------------------------------------------------------------------ */
/* Keys and redaction (pure)                                           */
/* ------------------------------------------------------------------ */

/** "YYYY-MM-DDTHH" (UTC) of `at` (ms). */
export function errorBucket(at: number): string {
  return new Date(at).toISOString().slice(0, 13);
}

/** sha256(bucket|area|code|route|storeId), hex; a missing route or store is the empty string. */
export function errorDedupe(bucket: string, area: string, code: string, route: string | null, storeId: string | null): string {
  return createHash("sha256")
    .update([bucket, area, code, route ?? "", storeId ?? ""].join("|"), "utf8")
    .digest("hex");
}

/** lower-case [a-z0-9_.-], at most 32; "other" when nothing is left */
function cleanArea(area: unknown): string {
  const s = typeof area === "string" ? area.toLowerCase().replace(/[^a-z0-9_.-]+/g, "_").slice(0, AREA_MAX) : "";
  return s.replace(/^_+|_+$/g, "") || "other";
}

/** [A-Za-z0-9_.:-], at most 64; null when nothing is left */
function cleanCode(code: unknown): string | null {
  if (typeof code !== "string") return null;
  const s = code.replace(/[^A-Za-z0-9_.:-]+/g, "_").slice(0, CODE_MAX);
  return /[A-Za-z0-9]/.test(s) ? s : null;
}

function cleanRoute(route: unknown): string | null {
  if (typeof route !== "string") return null;
  const s = route
    .split(/[?#]/, 1)[0]!
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, ROUTE_MAX);
  return s || null;
}

/** The driver code of the first database error in the cause chain ("ER_DUP_ENTRY", "ECONNREFUSED"), or null. */
function driverCode(err: unknown): string | null {
  let e: unknown = err;
  for (let depth = 0; depth < 5 && e && typeof e === "object"; depth++) {
    const x = e as { code?: unknown; errno?: unknown; sqlState?: unknown; sqlMessage?: unknown; sql?: unknown; cause?: unknown };
    const fromDriver = "sqlMessage" in x || "sqlState" in x || "sql" in x || (typeof x.code === "string" && typeof x.errno === "number");
    if (fromDriver && typeof x.code === "string" && /^[A-Z0-9_]{2,64}$/.test(x.code)) return x.code;
    e = x.cause;
  }
  return null;
}

/** The code an error is counted under: the option, the driver's code, the error's name, else "unknown". */
export function errorCode(err: unknown, override?: string | null): string {
  return cleanCode(override) ?? cleanCode(driverCode(err)) ?? (err instanceof Error ? cleanCode(err.name) : null) ?? "unknown";
}

/** errorSummary with e-mail addresses and digit runs of 6+ masked, at most `max` characters (200; the outbox's 300). */
export function redactSummary(summary: string, max: number = SUMMARY_MAX): string {
  return summary
    .replace(/[^\s@<>()"',;:]+@[^\s@<>()"',;:]+\.[A-Za-z]{2,}/g, "<email>")
    .replace(/\+?\d(?:[\s.\-/]?\d){5,}/g, "<n>")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .slice(0, max);
}

/* ------------------------------------------------------------------ */
/* Recording                                                           */
/* ------------------------------------------------------------------ */

function merge(buf: ErrorBuffer, row: PendingError): void {
  const had = buf.rows.get(row.dedupe);
  if (had) {
    had.count += row.count;
    had.firstAt = Math.min(had.firstAt, row.firstAt);
    had.lastAt = Math.max(had.lastAt, row.lastAt);
    return;
  }
  if (buf.rows.size >= ERROR_BUFFER_KEYS - 1) {
    // full: the count survives under one overflow row of the hour (the last of the 500 slots)
    const bucket = errorBucket(row.lastAt);
    const dedupe = errorDedupe(bucket, OVERFLOW.area, OVERFLOW.code, null, null);
    const over = buf.rows.get(dedupe);
    if (over) {
      over.count += row.count;
      over.lastAt = Math.max(over.lastAt, row.lastAt);
    } else if (buf.rows.size < ERROR_BUFFER_KEYS) {
      buf.rows.set(dedupe, { dedupe, bucket, ...OVERFLOW, route: null, storeId: null, count: row.count, firstAt: row.firstAt, lastAt: row.lastAt, sample: null });
    }
    return;
  }
  buf.rows.set(row.dedupe, { ...row });
}

function schedule(buf: ErrorBuffer, now: number): void {
  if (buf.timer || !buf.rows.size) return;
  buf.timer = setTimeout(
    () => {
      buf.timer = null;
      void flushErrors();
    },
    Math.max(0, ERROR_FLUSH_MS - (now - buf.lastFlushAt)),
  );
  buf.timer.unref?.();
}

/** Counts one failure in the error ring. Never throws, never waits. */
export function recordError(area: string, err: unknown, opts: RecordErrorOpts = {}): void {
  try {
    const now = Date.now();
    const bucket = errorBucket(now);
    const a = cleanArea(area);
    const code = errorCode(err, opts.code);
    const route = cleanRoute(opts.route);
    const storeId = typeof opts.storeId === "string" && STORE_ID_RE.test(opts.storeId) ? opts.storeId : null;
    const sample = err === null || err === undefined ? null : { summary: redactSummary(errorSummary(err)) };
    const buf = buffer();
    merge(buf, { dedupe: errorDedupe(bucket, a, code, route, storeId), bucket, area: a, code, route, storeId, count: 1, firstAt: now, lastAt: now, sample });
    schedule(buf, now);
  } catch {
    // the error ring must never become the error
  }
}

/** A copy of the buffered rows (tests, and the health view of a process that has not flushed yet). */
export function pendingErrors(): PendingError[] {
  return [...buffer().rows.values()].map((r) => ({ ...r, sample: r.sample ? { ...r.sample } : null }));
}

/** Tests: drop the buffer and its timer. */
export function resetErrorBuffer(): void {
  const buf = globalThis.__sgErrorBuffer;
  if (buf?.timer) clearTimeout(buf.timer);
  globalThis.__sgErrorBuffer = undefined;
}

/* ------------------------------------------------------------------ */
/* Flushing                                                            */
/* ------------------------------------------------------------------ */

type Query = (sql: string, values: unknown[]) => Promise<unknown>;

const errnoOf = (err: unknown): number | null => {
  const n = (err as { errno?: unknown } | null)?.errno;
  return typeof n === "number" ? n : null;
};

/** One multi-row upsert on the dedupe key. */
async function upsert(query: Query, rows: PendingError[]): Promise<void> {
  const values: unknown[] = [];
  for (const r of rows) {
    values.push(r.dedupe, r.bucket, r.area, r.code, r.route, r.storeId, r.count, new Date(r.firstAt), new Date(r.lastAt), r.sample ? JSON.stringify(r.sample) : null);
  }
  const tuples = rows.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
  // tenancy: platform error ring (§H.5: one cross-store counter table written by the process, read by the console)
  await query(`INSERT INTO error_events (dedupe, bucket, area, code, route, store_id, count, first_at, last_at, sample) VALUES ${tuples} ON DUPLICATE KEY UPDATE count = count + VALUES(count), last_at = VALUES(last_at)`, values);
}

/**
 * Writes `rows`, moving `progress.done` past each row once it is stored (a failure part-way re-buffers only the rest);
 * a batch refused for a vanished store (errno 1452) is retried row by row, that row store-less.
 */
async function write(query: Query, rows: PendingError[], progress: { done: number }): Promise<void> {
  for (let i = 0; i < rows.length; i += FLUSH_BATCH) {
    const batch = rows.slice(i, i + FLUSH_BATCH);
    try {
      await upsert(query, batch);
      progress.done = i + batch.length;
    } catch (err) {
      if (errnoOf(err) !== 1452) throw err;
      for (const r of batch) {
        try {
          await upsert(query, [r]);
        } catch (e) {
          if (errnoOf(e) !== 1452 || !r.storeId) throw e;
          await upsert(query, [{ ...r, storeId: null }]);
        }
        progress.done++;
      }
    }
  }
}

async function defaultQuery(): Promise<Query | null> {
  if (!process.env.DATABASE_URL) return null;
  const { pool } = await import("@/lib/db/client");
  const p = pool();
  return (sql, values) => p.query(sql, values);
}

/**
 * Writes the buffered rows to `error_events` (the timer, and the runner at the end of each tick). Never throws.
 * `query` is for tests; the app passes nothing and the query pool is used. One flush at a time: a call during a flush
 * waits for it.
 */
export async function flushErrors(query?: Query): Promise<void> {
  const buf = buffer();
  if (buf.flushing) return buf.flushing;
  if (buf.timer) {
    clearTimeout(buf.timer);
    buf.timer = null;
  }
  const rows = [...buf.rows.values()];
  if (!rows.length) return;
  buf.rows = new Map();
  buf.lastFlushAt = Date.now();
  const progress = { done: 0 };
  const run = async (): Promise<void> => {
    try {
      const q = query ?? (await defaultQuery());
      if (!q) return; // no database configured: nothing can be kept
      await write(q, rows, progress);
    } catch (err) {
      if (errnoOf(err) === 1146) {
        if (!buf.missingLogged) console.error("[errors] error_events is missing (migration 0005 not applied): error counts are dropped until it is.");
        buf.missingLogged = true;
        return;
      }
      const now = Date.now();
      if (now - buf.failLoggedAt >= 60_000) {
        buf.failLoggedAt = now;
        console.error("[errors] flush failed, the counts are kept for the next one:", errorSummary(err));
      }
      for (const r of rows.slice(progress.done)) merge(buf, r);
      schedule(buf, Date.now());
    }
  };
  buf.flushing = run().finally(() => {
    buf.flushing = null;
  });
  return buf.flushing;
}
