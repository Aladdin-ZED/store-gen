import "server-only";
/**
 * The store's daily upload byte budget, `s:<storeId>:media:bytes` (docs/STORE-SAAS.md §E.8; TENANCY-MAP MED-14):
 * at most 1 GiB of received files per store and rolling day, on top of the per-member request bucket. It bounds the
 * processing one store can make the shared process do (decode, resize, AVIF), whatever its quota: a file that is
 * refused or deduped still cost the work, so the budget counts what was received, not what was stored.
 *
 * Same table and fixed window as src/lib/security/rate-limit.ts, weighted by bytes: the window row is reset when it
 * expired, then charged by one conditional UPDATE, so parallel uploads never overshoot and a refused file is not
 * counted.
 */
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import type { StoreScope } from "@/lib/tenancy/types";

export const DAILY_UPLOAD_BYTES = 1024 * 1024 * 1024;
const WINDOW_SEC = 24 * 3600;

const bucketOf = (scope: StoreScope) => `s:${scope.storeId}:media:bytes`;

/** Count `bytes` against the store's daily budget: false (nothing counted, `retryAfter` seconds) when it would exceed it. */
export async function spendUploadBytes(scope: StoreScope, bytes: number, limit = DAILY_UPLOAD_BYTES): Promise<{ ok: true } | { ok: false; retryAfter: number }> {
  const bucket = bucketOf(scope);
  const n = Math.max(0, Math.ceil(bytes));
  await db.execute(sql`
    INSERT INTO rate_limits (bucket, count, reset_at)
    VALUES (${bucket}, 0, DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ${WINDOW_SEC} SECOND))
    ON DUPLICATE KEY UPDATE
      count = IF(reset_at <= UTC_TIMESTAMP(3), 0, count),
      reset_at = IF(reset_at <= UTC_TIMESTAMP(3), DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ${WINDOW_SEC} SECOND), reset_at)
  `);
  const [res] = (await db.execute(sql`UPDATE rate_limits SET count = count + ${n} WHERE bucket = ${bucket} AND count + ${n} <= ${limit}`)) as unknown as [{ affectedRows?: number }];
  if ((res?.affectedRows ?? 0) > 0) return { ok: true };
  const [rows] = (await db.execute(sql`SELECT GREATEST(0, TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(3), reset_at)) AS ttl FROM rate_limits WHERE bucket = ${bucket}`)) as unknown as [{ ttl: number }[]];
  return { ok: false, retryAfter: Math.max(1, Number(rows[0]?.ttl ?? WINDOW_SEC)) };
}
