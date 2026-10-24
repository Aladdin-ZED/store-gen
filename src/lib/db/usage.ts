import "server-only";
/**
 * Size of the app's database against the hosting plan's per-database limit (Hostinger Business:
 * 3 GB). Past the limit Hostinger suspends write permissions until the size drops, so orders,
 * sign-ins and settings would fail along with everything else. Media files (media_chunks) are the
 * bulk of it: the admin warns from DB_WARN_RATIO on, and new uploads are refused from
 * DB_BLOCK_RATIO on so orders keep the remaining space.
 *
 * Size = SUM(data_length + index_length) of this database's tables, the figure phpMyAdmin shows.
 * InnoDB keeps these statistics approximate (refreshed as tables change), which is fine for 70 % /
 * 85 % marks. Cached per process for a few minutes; a stored upload clears the cache. Multi-tenant: this whole-DB
 * figure stays the platform floor of the DB backend (console only, TENANCY-MAP DB-17); each store is metered first by
 * its own `store_usage` gauges, recomputed from their sources by recomputeStoreGauges below.
 */
import type { RowDataPacket } from "mysql2/promise";
import { logError } from "@/lib/orders/log";
import type { UsageMetricName } from "@/lib/tenancy/entitlement-keys";
import type { WriteScope } from "@/lib/tenancy/types";
import { pool } from "./client";

/** Hostinger Business: 3 GB per database. Other plans: set DB_QUOTA_MB. */
const DEFAULT_QUOTA_MB = 3 * 1024;
export const DB_WARN_RATIO = 0.7;
export const DB_BLOCK_RATIO = 0.85;
const TTL_MS = 5 * 60_000;

export interface DbUsage {
  bytes: number;
  quotaBytes: number;
  /** bytes / quotaBytes */
  ratio: number;
  /** "warn" from DB_WARN_RATIO on, "full" from DB_BLOCK_RATIO on (new uploads are refused) */
  level: "ok" | "warn" | "full";
}

declare global {
  var __codDbUsage: { at: number; bytes: number } | undefined;
}

/** DB_QUOTA_MB when it is a positive whole number of MB, else 3 GB. */
export function dbQuotaBytes(): number {
  const raw = process.env.DB_QUOTA_MB?.trim() ?? "";
  const mb = /^\d{1,7}$/.test(raw) ? Number(raw) : 0;
  return (mb > 0 ? mb : DEFAULT_QUOTA_MB) * 1024 * 1024;
}

/** Current usage (cached), or null when the size can't be read: monitoring never blocks anything. */
export async function getDbUsage(opts: { fresh?: boolean } = {}): Promise<DbUsage | null> {
  let cached = globalThis.__codDbUsage;
  if (opts.fresh || !cached || Date.now() - cached.at > TTL_MS) {
    try {
      const [rows] = await pool().query<RowDataPacket[]>(
        "SELECT COALESCE(SUM(data_length + index_length), 0) AS bytes FROM information_schema.tables WHERE table_schema = DATABASE()",
      );
      cached = globalThis.__codDbUsage = { at: Date.now(), bytes: Number(rows[0]?.bytes ?? 0) };
    } catch (err) {
      logError("db:usage", err);
      return null;
    }
  }
  const quotaBytes = dbQuotaBytes();
  const ratio = cached.bytes / quotaBytes;
  return { bytes: cached.bytes, quotaBytes, ratio, level: ratio >= DB_BLOCK_RATIO ? "full" : ratio >= DB_WARN_RATIO ? "warn" : "ok" };
}

/** Forget the cached size after a write that grows it noticeably (a stored upload). */
export function invalidateDbUsage(): void {
  globalThis.__codDbUsage = undefined;
}

/* ------------------------------------------------------------------ */
/* Per-store gauges (docs/STORE-SAAS.md §A.4, §D.7; DB-17)             */
/* ------------------------------------------------------------------ */

/**
 * The gauges whose source tables exist since 0004, each with its count. The R1 product and R2 gauges (products,
 * campaigns, short_links, webhooks, custom_domains) join here with their tables (0005-0007).
 *   media_bytes  every stored file of the store (master + variants, every backend: media_files rows)
 *   pages        every page row (drafts and archived pages count, like the pages_max charge)
 *   members      every membership (active and suspended), agents included
 *   agents       memberships whose role is agent (rev 3, OPS-23)
 */
const GAUGE_SOURCES = {
  media_bytes: "SELECT COALESCE(SUM(bytes), 0) AS n FROM media_files WHERE store_id = ?",
  pages: "SELECT COUNT(*) AS n FROM pages WHERE store_id = ?",
  members: "SELECT COUNT(*) AS n FROM store_members WHERE store_id = ?",
  agents: "SELECT COUNT(*) AS n FROM store_members WHERE store_id = ? AND role = 'agent'",
} as const satisfies Partial<Record<UsageMetricName, string>>;
export type StoreGauge = keyof typeof GAUGE_SOURCES;
export const STORE_GAUGES = Object.keys(GAUGE_SOURCES) as StoreGauge[];

export interface GaugeDrift {
  before: number;
  after: number;
}

/**
 * Recomputes a store's gauges from their sources and writes the `store_usage` rows (period "total") whose value
 * drifted (§D.7): the store #1 conversion runs it once (§D.8 step 4), the nightly `usage.reconcile` job runs it per
 * store and logs the deltas. One row per gauge; a charge racing the correction is corrected by the next run.
 */
export async function recomputeStoreGauges(scope: WriteScope): Promise<Record<StoreGauge, GaugeDrift>> {
  const storeId = scope.storeId;
  const out = {} as Record<StoreGauge, GaugeDrift>;
  for (const gauge of STORE_GAUGES) {
    const [[src]] = await pool().query<RowDataPacket[]>(GAUGE_SOURCES[gauge], [storeId]);
    const [rows] = await pool().query<RowDataPacket[]>("SELECT value FROM store_usage WHERE store_id = ? AND metric = ? AND period = 'total'", [storeId, gauge]);
    const after = Number(src?.n ?? 0);
    const before = rows.length ? Number(rows[0]!.value) : 0;
    if (!rows.length || before !== after) {
      await pool().query(
        `INSERT INTO store_usage (store_id, metric, period, value, updated_at) VALUES (?, ?, 'total', ?, UTC_TIMESTAMP(3))
         ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = VALUES(updated_at)`,
        [storeId, gauge, after],
      );
    }
    out[gauge] = { before, after };
  }
  return out;
}
