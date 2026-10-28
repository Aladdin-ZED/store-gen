import "server-only";
/**
 * The tick lease (docs/STORE-SAAS.md §H.2, rev 5 CRIT2-18; R1 P8): the `cron_cursors` row `job = 'tick'` (seeded by
 * 0005) is the tick's mutex, so a manual `curl` plus the cron, or a late hPanel firing, never run two ticks that race
 * the cursors and the `dailyAt` bookkeeping. It holds no pooled connection: each statement borrows a query-pool
 * connection for its own few milliseconds, and the lock pool (src/lib/db/locks.ts, 2 connections) stays free for the
 * jobs' one lock at a time and the request-path locks (§E.7).
 *
 *   acquire  INSERT IGNORE the seed row (P0 review G5: a lost seed row must not turn every tick into "skipped"), then
 *            one compare-and-set: `cursor` = tickId where it is '' or the lease is older than 110 s; affectedRows = 1
 *            (mysql2 sends FOUND_ROWS, so a matched row counts even when no value changed)
 *   renew    at every job boundary, under `cursor` = tickId; false = another tick took the lease over (this one ran
 *            past 110 s without a boundary) and the runner stops starting jobs
 *   release  in `finally`, `cursor` = '' under the same predicate (a taken-over lease is left to its new holder)
 *
 * A crashed tick's lease expires after 110 s, inside the 5-minute cron period. Times are the database's UTC clock
 * (UTC_TIMESTAMP(3), whatever the session zone; the query pool also sets '+00:00'), never the app's, so two app
 * processes with skewed clocks still agree. `cursor` is a reserved word in MariaDB 10.4 and MySQL 8: always quoted.
 */
import type { ResultSetHeader } from "mysql2/promise";
import { pool } from "@/lib/db/client";

/** a lease older than this is taken over (s) */
export const LEASE_SECONDS = 110;

/** The tick lease as the runner uses it (the database row in the app; a fake with a fake clock in test:jobs). */
export interface TickLease {
  /** true when this tick now holds the lease */
  acquire(tickId: string): Promise<boolean>;
  /** true while this tick still holds it */
  renew(tickId: string): Promise<boolean>;
  release(tickId: string): Promise<void>;
}

const affected = (res: unknown) => (res as ResultSetHeader).affectedRows ?? 0;

export const dbTickLease: TickLease = {
  async acquire(tickId) {
    const p = pool();
    // tenancy: platform cron_cursors tick lease row (no store column; §H.2)
    await p.query("INSERT IGNORE INTO cron_cursors (job, `cursor`, updated_at) VALUES ('tick', '', UTC_TIMESTAMP(3))");
    // tenancy: platform cron_cursors tick lease row (no store column; §H.2)
    const [res] = await p.query(
      `UPDATE cron_cursors SET \`cursor\` = ?, updated_at = UTC_TIMESTAMP(3) WHERE job = 'tick' AND (\`cursor\` = '' OR updated_at < UTC_TIMESTAMP(3) - INTERVAL ${LEASE_SECONDS} SECOND)`,
      [tickId],
    );
    return affected(res) === 1;
  },
  async renew(tickId) {
    // tenancy: platform cron_cursors tick lease row (no store column; §H.2)
    const [res] = await pool().query("UPDATE cron_cursors SET updated_at = UTC_TIMESTAMP(3) WHERE job = 'tick' AND `cursor` = ?", [tickId]);
    return affected(res) === 1;
  },
  async release(tickId) {
    // tenancy: platform cron_cursors tick lease row (no store column; §H.2)
    await pool().query("UPDATE cron_cursors SET `cursor` = '', updated_at = UTC_TIMESTAMP(3) WHERE job = 'tick' AND `cursor` = ?", [tickId]);
  },
};
