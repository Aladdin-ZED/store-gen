import "server-only";
/**
 * Named locks (docs/STORE-SAAS.md §E.7): MySQL GET_LOCK on a connection of a dedicated LOCK pool of 2,
 * never the 6-connection query pool (src/lib/db/client.ts, ENGC-12).
 *
 *   const r = await withNamedLock(storeLock(scope.storeId, "zones"), 1, () => saveZonesTx(scope, input));
 *   if (!r.ran) return busy();                                            // → { ran: true, value } | { ran: false }
 *
 * GET_LOCK is connection scoped and server wide: the connection is held for the whole `fn` and the name
 * carries `db8` (first 8 hex chars of sha256(database name)), so two databases on one server never share a
 * lock. RELEASE_LOCK in `finally`; a connection whose release failed is destroyed, never pooled (it may
 * still hold the lock). Waiting for a pool connection is bounded by the same `timeoutSec` (rev 5,
 * CRIT2-18): no free connection in time → `{ ran: false }`, never an unbounded wait.
 *
 * Budget rules: a job holds at most one named lock at a time (nesting throws, it would deadlock a pool of
 * 2), a lock body avoids remote calls it can, and the cron tick itself holds none: its mutex is the
 * `cron_cursors` lease row `job = 'tick'` (§H.2), so one lock-pool connection always stays free for the
 * request-path locks (`saveZones` "zones", the round-robin "rr", `ensureTemplateSet` "templates").
 * Migrations and boot keep their own locks (./migrate.ts, ./boot-lock.ts).
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import mysql from "mysql2/promise";
import { databaseUrl } from "./url";

declare const LOCK: unique symbol;
/** A server-wide lock name built by storeLock / platformLock (≤ 64 chars, the MySQL limit). */
export type LockName = string & { readonly [LOCK]: true };

/** connections in the lock pool (§H.7 budget: 6 query + 2 lock + 2 media read = 10 per process) */
export const LOCK_POOL_SIZE = 2;

const NAME_RE = /^[a-z0-9][a-z0-9._-]*$/;
const STORE_ID_RE = /^[0-9A-Za-z]{1,26}$/;

let db8Cache: { url: string; db8: string } | null = null;

/** first 8 hex chars of sha256(database name), from DATABASE_URL's path (no connection needed) */
function db8(): string {
  const url = databaseUrl();
  if (!url) throw new Error("DATABASE_URL is not set");
  if (db8Cache?.url === url) return db8Cache.db8;
  let name = "";
  try {
    name = decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
  } catch {
    // not a URL: fall through to the error below
  }
  if (!name) throw new Error("DATABASE_URL names no database");
  const value = createHash("sha256").update(name, "utf8").digest("hex").slice(0, 8);
  db8Cache = { url, db8: value };
  return value;
}

/** `${db8}:s:${storeId}:${name}`; name ≤ 25 chars of [a-z0-9._-] */
export function storeLock(storeId: string, name: string): LockName {
  if (!STORE_ID_RE.test(storeId)) throw new Error("storeLock: bad store id");
  if (name.length > 25 || !NAME_RE.test(name)) throw new Error(`storeLock: bad lock name "${name}"`);
  return `${db8()}:s:${storeId}:${name}` as LockName;
}

/** `${db8}:p:${name}`; name ≤ 53 chars of [a-z0-9._-] */
export function platformLock(name: string): LockName {
  if (name.length > 53 || !NAME_RE.test(name)) throw new Error(`platformLock: bad lock name "${name}"`);
  return `${db8()}:p:${name}` as LockName;
}

declare global {
  var __sgLockPool: { url: string; pool: mysql.Pool } | undefined;
}

function lockPool(): mysql.Pool {
  const url = databaseUrl();
  if (!url) throw new Error("DATABASE_URL is not set");
  const current = globalThis.__sgLockPool;
  if (current?.url === url) return current.pool;
  if (current) void current.pool.end().catch(() => undefined);
  const pool = mysql.createPool({
    uri: url,
    connectionLimit: LOCK_POOL_SIZE,
    maxIdle: LOCK_POOL_SIZE,
    idleTimeout: 60_000,
    waitForConnections: true,
    enableKeepAlive: true,
    connectTimeout: 10_000,
    charset: "utf8mb4_unicode_ci",
    timezone: "Z",
  });
  globalThis.__sgLockPool = { url, pool };
  return pool;
}

/**
 * The lock held by the current async context (a job holds at most one). `active` turns false on release, so
 * work the body left running (an `after()` callback inherits the context) may take a lock of its own later.
 */
const held = new AsyncLocalStorage<{ lock: LockName; active: boolean }>();

/** A pool connection within `ms`, or null; a connection that arrives after the deadline goes straight back. */
async function connectionWithin(pool: mysql.Pool, ms: number): Promise<mysql.PoolConnection | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const pending = pool.getConnection();
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), Math.max(0, ms));
  });
  try {
    const conn = await Promise.race([pending, timeout]);
    if (conn === null) pending.then((c) => c.release(), () => undefined);
    return conn;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Runs `fn` while holding `lock`. `timeoutSec` bounds the wait for a lock-pool connection and, for what is
 * left of it, the GET_LOCK wait (1 s on request paths). Not acquired in time → `{ ran: false }`.
 */
export async function withNamedLock<T>(lock: LockName, timeoutSec: number, fn: () => Promise<T>): Promise<{ ran: true; value: T } | { ran: false }> {
  const outer = held.getStore();
  if (outer?.active) throw new Error(`withNamedLock: "${lock}" requested while "${outer.lock}" is held (one named lock at a time, §E.7)`);
  const started = Date.now();
  const budgetMs = Math.max(0, timeoutSec) * 1000;
  const conn = await connectionWithin(lockPool(), budgetMs);
  if (!conn) return { ran: false };
  // a named lock lives as long as its session: a connection that may still hold it never goes back to the pool
  let reusable = false;
  try {
    const waitSec = Math.max(0, budgetMs - (Date.now() - started)) / 1000;
    const [rows] = (await conn.query("SELECT GET_LOCK(?, ?) AS got", [lock, Math.round(waitSec * 1000) / 1000])) as unknown as [{ got: number | null }[]];
    if (Number(rows[0]?.got) !== 1) {
      reusable = true;
      return { ran: false };
    }
    const state = { lock, active: true };
    try {
      return { ran: true, value: await held.run(state, fn) };
    } finally {
      state.active = false;
      reusable = await conn.query("SELECT RELEASE_LOCK(?)", [lock]).then(
        () => true,
        () => false,
      );
    }
  } finally {
    if (reusable) conn.release();
    else conn.destroy();
  }
}
