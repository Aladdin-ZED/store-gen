import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import type { StoreScope } from "@/lib/tenancy/types";

export interface RateResult {
  ok: boolean;
  count: number;
  limit: number;
  /** seconds until the window resets */
  retryAfter: number;
}

/* ------------------------------------------------------------------ */
/* buckets (docs/STORE-SAAS.md §E.8)                                  */
/* ------------------------------------------------------------------ */

declare const BUCKET: unique symbol;

/**
 * A rate-limit bucket name, built only by `platformBucket()` (`p:<name>[:<key>]`, platform-wide) or
 * `storeBucket()` (`s:<storeId>:<name>[:<key>]`, one store's budget), so a store's limits can never be
 * spent by another store's traffic and lint L5 can tell a built bucket from a hand-written string.
 */
export type Bucket = string & { readonly [BUCKET]: true };

/** `rate_limits.bucket` is varchar(191); a longer name would be cut and could collide with another bucket. */
export const BUCKET_MAX = 191;
/** Lower-case segments joined by ":": "login:ip", "sheets:connect", "test-render", "ai:u". */
const NAME_RE = /^[a-z][a-z0-9_-]*(?::[a-z0-9][a-z0-9_.-]*)*$/;
/** One segment: a hash, an id or a fixed word. No "@" (e-mail), no ":" (IPv6 or a nested name). */
const KEY_RE = /^[A-Za-z0-9_.-]{1,128}$/;
const IPV4_RE = /^\d{1,3}(?:\.\d{1,3}){3}$/;

function bucketName(prefix: string, name: string, key: string | undefined): Bucket {
  if (!NAME_RE.test(name)) throw new RangeError(`rate bucket name "${name}" must be lower-case segments joined by ":"`);
  if (key !== undefined && (!KEY_RE.test(key) || IPV4_RE.test(key))) {
    // keys are hashes or ids, never a raw e-mail or IP (§E.8): hash them with hashIp() / hmac() first
    throw new RangeError(`rate bucket key for "${name}" must be a hash or an id (1-128 of [A-Za-z0-9_.-], not an IP)`);
  }
  const bucket = key === undefined ? `${prefix}:${name}` : `${prefix}:${name}:${key}`;
  if (bucket.length > BUCKET_MAX) throw new RangeError(`rate bucket "${bucket.slice(0, 40)}…" is over ${BUCKET_MAX} chars`);
  return bucket as Bucket;
}

/** Platform-wide bucket `p:<name>[:<key>]` (login, signup, the coarse public floors, cron). */
export function platformBucket(name: string, key?: string): Bucket {
  return bucketName("p", name, key);
}

/** One store's bucket `s:<storeId>:<name>[:<key>]` (orders, leads, publish, AI, exports per store). */
export function storeBucket(scope: StoreScope, name: string, key?: string): Bucket {
  return bucketName(`s:${scope.storeId}`, name, key);
}

/* ------------------------------------------------------------------ */
/* limiter                                                            */
/* ------------------------------------------------------------------ */

/**
 * Fixed-window rate limiter stored in MariaDB (survives process restarts — Hostinger stops idle apps).
 * One atomic upsert per call. Build the bucket with `platformBucket()` / `storeBucket()`.
 */
export function rateLimit(bucket: Bucket, limit: number, windowSec: number): Promise<RateResult>;
/**
 * @deprecated R1.0 migration path (§E.8, ENGC-28): today's string buckets ("login:ip:<hash>") keep compiling until
 * each track converts its callers; the maintainer removes this overload at the R1.0 integration and lint L5 turns on.
 */
export function rateLimit(bucket: string, limit: number, windowSec: number): Promise<RateResult>;
export async function rateLimit(bucket: string | Bucket, limit: number, windowSec: number): Promise<RateResult> {
  const key = bucket.slice(0, BUCKET_MAX);
  await db.execute(sql`
    INSERT INTO rate_limits (bucket, count, reset_at)
    VALUES (${key}, 1, DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ${windowSec} SECOND))
    ON DUPLICATE KEY UPDATE
      count = IF(reset_at <= UTC_TIMESTAMP(3), 1, count + 1),
      reset_at = IF(reset_at <= UTC_TIMESTAMP(3), DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ${windowSec} SECOND), reset_at)
  `);
  const [rows] = (await db.execute(
    sql`SELECT count, GREATEST(0, TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(3), reset_at)) AS ttl FROM rate_limits WHERE bucket = ${key}`,
  )) as unknown as [{ count: number; ttl: number }[]];
  const row = rows[0] ?? { count: 1, ttl: windowSec };
  return { ok: row.count <= limit, count: row.count, limit, retryAfter: Number(row.ttl) };
}

/** Has `bucket` already used up `limit` in its current window? Read-only: counts nothing. */
export function rateLimitReached(bucket: Bucket, limit: number): Promise<boolean>;
/** @deprecated string buckets: see `rateLimit` (removed at the R1.0 integration). */
export function rateLimitReached(bucket: string, limit: number): Promise<boolean>;
export async function rateLimitReached(bucket: string | Bucket, limit: number): Promise<boolean> {
  const key = bucket.slice(0, BUCKET_MAX);
  const [rows] = (await db.execute(
    sql`SELECT count FROM rate_limits WHERE bucket = ${key} AND reset_at > UTC_TIMESTAMP(3)`,
  )) as unknown as [{ count: number }[]];
  return Number(rows[0]?.count ?? 0) >= limit;
}

/** Housekeeping — delete expired buckets (called from the cron tick). */
export async function purgeRateLimits(): Promise<void> {
  await db.execute(sql`DELETE FROM rate_limits WHERE reset_at < DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 HOUR)`);
}
