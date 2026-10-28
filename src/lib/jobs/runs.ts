import "server-only";
/**
 * What the runner reads and writes around the jobs (docs/STORE-SAAS.md §H.2; R1 P8): the `job_runs` rows (the Cron
 * panel's data, PLA-§15.1, and the last-tick alarm of §H.5) and each job's `cron_cursors` row (its round-robin cursor
 * and the `due` bookkeeping of ./due.ts). Both are platform rows of the job runner (§D.3); `job_runs.store_id` only
 * says which store a per-store row is about.
 *
 * - `job_runs`: one row per run (`store_id` NULL), plus one per store that did work (./recorder.ts), all in one INSERT.
 *   `summary` holds counts and codes only, never customer data. A store deleted meanwhile (errno 1452, the RESTRICT
 *   FK) drops that run's per-store rows and keeps the run row.
 * - `cron_cursors.state.due` is merged with JSON_MERGE_PATCH, so a job's own state keys (the `storage.walk` snapshot,
 *   P8 step 7) are never overwritten by the runner, and a null field removes its key.
 */
import type { RowDataPacket } from "mysql2/promise";
import { pool } from "@/lib/db/client";
import type { DueState } from "./due";
import { writeJobCursor } from "./scope";

/** One `job_runs` row. */
export interface JobRunRow {
  job: string;
  storeId: string | null;
  tickId: string | null;
  /** epoch ms */
  startedAt: number;
  ms: number;
  ok: boolean;
  processed: number;
  summary: Record<string, unknown> | null;
  errorCode: string | null;
}

/** Where the runner's rows go (the table in the app; an array in test:jobs). */
export interface JobRunSink {
  write(rows: readonly JobRunRow[]): Promise<void>;
}

/** A job's `cron_cursors` row as the runner sees it. */
export interface JobState {
  cursor: string;
  due: DueState | null;
}

/** The per-job rows (the table in the app; a Map in test:jobs). */
export interface JobStateStore {
  /** the rows of these jobs; a job with no row is absent */
  load(jobs: readonly string[]): Promise<Map<string, JobState>>;
  setCursor(job: string, cursor: string): Promise<void>;
  saveDue(job: string, due: Required<DueState>): Promise<void>;
}

const INT_MAX = 2_147_483_647;
const clampInt = (n: number) => (Number.isFinite(n) ? Math.min(INT_MAX, Math.max(0, Math.round(n))) : 0);

function tuple(r: JobRunRow): unknown[] {
  return [
    r.job.slice(0, 48),
    r.storeId,
    r.tickId,
    new Date(r.startedAt),
    clampInt(r.ms),
    r.ok ? 1 : 0,
    clampInt(r.processed),
    r.summary ? JSON.stringify(r.summary) : null,
    r.errorCode ? r.errorCode.slice(0, 64) : null,
  ];
}

async function insertRuns(rows: readonly JobRunRow[]): Promise<void> {
  if (!rows.length) return;
  const values = rows.flatMap(tuple);
  const tuples = rows.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
  // tenancy: platform job_runs rows of the runner (§D.3 P, opt. store: store_id names the store a row is about)
  await pool().query(`INSERT INTO job_runs (job, store_id, tick_id, started_at, ms, ok, processed, summary, error_code) VALUES ${tuples}`, values);
}

export const dbJobRuns: JobRunSink = {
  async write(rows) {
    try {
      await insertRuns(rows);
    } catch (err) {
      if ((err as { errno?: number } | null)?.errno !== 1452) throw err;
      // a store purged since its visit: keep the run rows, drop that run's per-store rows
      await insertRuns(rows.filter((r) => r.storeId === null));
    }
  },
};

function parseDue(raw: unknown): DueState | null {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const state = JSON.parse(raw) as { due?: unknown } | null;
    const due = state && typeof state === "object" ? state.due : null;
    if (!due || typeof due !== "object") return null;
    const d = due as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === "string" ? v : null);
    return { lastHour: str(d.lastHour), lastDay: str(d.lastDay), fails: typeof d.fails === "number" ? d.fails : null, failKey: str(d.failKey) };
  } catch {
    return null;
  }
}

export const dbJobState: JobStateStore = {
  async load(jobs) {
    const out = new Map<string, JobState>();
    if (!jobs.length) return out;
    // tenancy: platform cron_cursors job rows (no store column; §H.2)
    const [rows] = await pool().query<RowDataPacket[]>("SELECT job, `cursor`, state FROM cron_cursors WHERE job IN (?)", [[...jobs]]);
    for (const r of rows) out.set(String(r.job), { cursor: String(r.cursor ?? ""), due: parseDue(r.state) });
    return out;
  },
  setCursor: writeJobCursor,
  async saveDue(job, due) {
    const patch = JSON.stringify({ due });
    // tenancy: platform cron_cursors job rows (no store column; §H.2)
    await pool().query(
      "INSERT INTO cron_cursors (job, `cursor`, state, updated_at) VALUES (?, '', ?, UTC_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE state = JSON_MERGE_PATCH(IF(JSON_VALID(state), state, '{}'), VALUES(state)), updated_at = VALUES(updated_at)",
      [job, patch],
    );
  },
};
