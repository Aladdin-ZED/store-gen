import "server-only";
/**
 * A storage job's own keys in its `cron_cursors.state` (R1 P8 step 7): the walk's cursor and snapshot, a daily pass,
 * the sweep's phase, the migrator's bad keys. The runner keeps its `due` keys in the same object (src/lib/jobs/runs.ts),
 * so a write here replaces only the keys it names, under the row's lock; a null value removes its key.
 *
 * `cron_cursors` is a job-runner row with no store column (§D.3): nothing here reads or writes store data.
 */
import type { RowDataPacket } from "mysql2/promise";
import { pool } from "@/lib/db/client";

function parseState(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "string" || !raw) return {};
  try {
    const v: unknown = JSON.parse(raw);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** The job's state object ({} when it has no row, or an unreadable one). */
export async function readJobState(job: string): Promise<Record<string, unknown>> {
  // tenancy: platform cron_cursors is a job-runner row (no store column, §D.3)
  const [rows] = await pool().query<RowDataPacket[]>("SELECT state FROM cron_cursors WHERE job = ?", [job]);
  return rows.length ? parseState(rows[0]!.state) : {};
}

/**
 * Sets `patch`'s keys in the job's state (null removes a key), every other key kept: a read-modify-write under the
 * row's lock, so the runner's `due` and the job's other keys survive. The row is created on first use.
 */
export async function patchJobState(job: string, patch: Record<string, unknown>): Promise<void> {
  const conn = await pool().getConnection();
  try {
    await conn.beginTransaction();
    // tenancy: platform cron_cursors is a job-runner row (the job's row seeded on first use)
    await conn.query("INSERT IGNORE INTO cron_cursors (job, `cursor`, state, updated_at) VALUES (?, '', '{}', UTC_TIMESTAMP(3))", [job]);
    // tenancy: platform cron_cursors is a job-runner row (read under its lock)
    const [rows] = await conn.query<RowDataPacket[]>("SELECT state FROM cron_cursors WHERE job = ? FOR UPDATE", [job]);
    const state = parseState(rows[0]?.state);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === undefined) delete state[k];
      else state[k] = v;
    }
    // tenancy: platform cron_cursors is a job-runner row (written back with the other keys kept)
    await conn.query("UPDATE cron_cursors SET state = ?, updated_at = UTC_TIMESTAMP(3) WHERE job = ?", [JSON.stringify(state), job]);
    await conn.commit();
  } catch (err) {
    await conn.rollback().catch(() => undefined);
    throw err;
  } finally {
    conn.release();
  }
}
