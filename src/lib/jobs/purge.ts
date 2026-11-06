import "server-only";
/**
 * The `purge` job (docs/STORE-SAAS.md §H.9, §F.9 "Deletion", §A.5.1; rev 3 ENGC-31, SEC-20, SEC-21; §H.2 slot 5; R1 P8
 * step 10): deletes one store's data in slices across ticks, then leaves the tombstone. Never a cascade, never inside a
 * request.
 *
 * - **Which store.** One whose purge is already under way (a `cron_cursors` row `purge:<storeId>`), else the oldest
 *   due one: `scheduled_deletion` whose `purge_after` has passed (24 h after scheduling, or now for an executed purge
 *   request, PLA-§8.1), or `rejected` for 30 days (REJECTED_PURGE_DAYS). When it finishes with time left, the next.
 * - **Before every slice** the store row is read again: any other status (a cancelled deletion is `closed` again, a
 *   reopened appeal `pending`) ends the purge there and drops its cursor, so a later purge starts from step 1 (every
 *   step is idempotent).
 * - **A dry count** of every planned table runs before the first slice and is logged as counts only.
 * - **The steps** are purgePlan() (./purge/plan.ts): `DELETE … WHERE store_id = ? LIMIT 2000` per table until a slice
 *   deletes fewer, the per-store DATA_DIR folders (refused while DATA_DIR or MEDIA_DIR fails its boot check: a refused
 *   directory may be another deployment's), yielding between slices; then the kept rows: audit_log meta through
 *   redactMetaForPurge, legal_acceptances.ua NULL, signup_reviews signals emptied (NOT NULL in schema.ts) and
 *   business_context NULL, platform_notes soft-deleted with the body "[purged]"; then `{ storeId, at }` appended to
 *   `platform_backup.purgeRequests` (§H.6 drops it after one weekly cycle), the caches (evictStore, invalidateStore),
 *   and last transitionStore(systemCtx("purge"), id, "purged"), which writes the tombstone (handle NULL, name
 *   "(purged)") and quarantines the handle 180 days.
 * - **Progress** lives in `cron_cursors` `purge:<storeId>` (`state.purge`): the step, the audit keyset position, the dry
 *   count. Saved after each finished step and whenever the run stops, so a dead tick repeats one step at most.
 *
 * Budget: ≤ 11 s a tick (slot 5's whole slice). §F.9 says "≤ 15 s per tick"; slot 5 guarantees 11 s, so the purge
 * takes that and runs after the backup and the exports (recorded in the P8 report). Every delete binds `store_id = ?`
 * to the id of the store row the job read; the statements whose table name comes from the plan, and the queue reads
 * that pick a store, are annotated `tenancy: platform` and counted for CCR r1-p8-4.
 */
import { createHash } from "node:crypto";
import { rm } from "node:fs/promises";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { pool } from "@/lib/db/client";
import { mediaStorageChecked } from "@/lib/media/storage";
import { evictStore } from "@/lib/media/store";
import { hmac } from "@/lib/security/crypto";
import { dataDir, mediaRoot, perStoreDirs, type DataArea } from "@/lib/storage/paths";
import { invalidateStore } from "@/lib/tenancy/cache";
import { LifecycleError, REJECTED_PURGE_DAYS, transitionStore } from "@/lib/tenancy/lifecycle";
import type { StoreStatus } from "@/lib/tenancy/types";
import { appendPurgeRequest } from "./backup";
import { errorCode, recordError } from "./errors";
import { purgePlan, type PurgePlan, type PurgeStep } from "./purge/plan";
import { PURGED_NOTE_BODY, PURGED_SIGNALS, redactMetaForPurge } from "./purge/redact";
import type { JobCtx, JobResult } from "./runner";
import { systemCtx, systemScope } from "./scope";
import { patchJobState, readJobState } from "./storage/state";

export const PURGE_JOB = "purge";
/** the cron_cursors row of one store's purge */
export const PURGE_CURSOR_PREFIX = "purge:";
/** rows per DELETE (§F.9 "slices of ≤ 2,000 rows") */
export const PURGE_SLICE_ROWS = 2000;
/** audit rows read per redaction slice */
const AUDIT_SLICE_ROWS = 500;
const DAY = 86_400_000;
const STORE_ID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const TABLE_RE = /^[a-z][a-z0-9_]{0,63}$/;

/** The kept rows, the backup request, the caches and the tombstone: the steps after the plan's, in this order. */
export const PURGE_AFTER_STEPS = Object.freeze(["audit", "legal", "signup", "notes", "backup", "caches", "tombstone"] as const);
export type PurgeAfterStep = (typeof PURGE_AFTER_STEPS)[number];

/** Why a store is purged (the tombstone's status_reason). */
export type PurgeReason = "purge_scheduled" | "purge_rejected";

/** `cron_cursors.state.purge` of `purge:<storeId>`. */
export interface PurgeCursor {
  v: 1;
  storeId: string;
  reason: PurgeReason;
  /** index into plan.steps, then PURGE_AFTER_STEPS */
  step: number;
  /** the audit redaction's keyset position (last audit_log.id done) */
  auditAfter: number;
  /** the dry count before the first slice: rows per planned table (counts only) */
  dry: Record<string, number>;
  startedAt: string;
  /** planSignature() of the plan `step` indexes; another plan (a deploy added a table) restarts at step 0 */
  plan: string;
}

/** The tests' forced slices and clock. */
export interface PurgeRunOpts {
  now?: () => number;
  /** rows per DELETE (default 2,000) */
  sliceRows?: number;
  /** slices per run, every kind counted (default: until the deadline) */
  maxSlices?: number;
  plan?: PurgePlan;
}

/* ------------------------------------------------------------------ */
/* which store                                                          */
/* ------------------------------------------------------------------ */

interface StoreFacts {
  status: StoreStatus;
  purgeAfter: Date | null;
  statusChangedAt: Date | null;
}

/** Why `store` may be purged at `nowMs`, or null (pure). */
export function purgeReasonOf(store: StoreFacts, nowMs: number): PurgeReason | null {
  if (store.status === "scheduled_deletion" && store.purgeAfter && store.purgeAfter.getTime() <= nowMs) return "purge_scheduled";
  if (store.status === "rejected" && store.statusChangedAt && store.statusChangedAt.getTime() + REJECTED_PURGE_DAYS * DAY <= nowMs) return "purge_rejected";
  return null;
}

async function storeFacts(storeId: string): Promise<StoreFacts | null> {
  // tenancy: platform the purge reads the store row it works on, by id (stores has no store_id column)
  const [rows] = await pool().query<RowDataPacket[]>("SELECT status, purge_after, status_changed_at FROM stores WHERE id = ?", [storeId]);
  const r = rows[0];
  return r ? { status: r.status as StoreStatus, purgeAfter: (r.purge_after as Date | null) ?? null, statusChangedAt: (r.status_changed_at as Date | null) ?? null } : null;
}

const cursorJob = (storeId: string) => `${PURGE_CURSOR_PREFIX}${storeId}`;

function parseCursor(raw: unknown, storeId: string): PurgeCursor | null {
  const c = raw as Partial<PurgeCursor> | null;
  if (!c || c.v !== 1 || c.storeId !== storeId || (c.reason !== "purge_scheduled" && c.reason !== "purge_rejected")) return null;
  if (!Number.isInteger(c.step) || c.step! < 0 || !Number.isInteger(c.auditAfter) || typeof c.startedAt !== "string") return null;
  return { v: 1, storeId, reason: c.reason, step: c.step!, auditAfter: c.auditAfter!, dry: c.dry && typeof c.dry === "object" ? c.dry : {}, startedAt: c.startedAt, plan: typeof c.plan === "string" ? c.plan : "" };
}

/** A short fingerprint of a plan's steps (their kind, table or area, in order). */
export function planSignature(plan: PurgePlan): string {
  const label = (s: PurgeStep) => (s.kind === "area" ? `area:${s.area}` : `${s.by}:${s.table}`);
  return createHash("sha256").update(plan.steps.map(label).join(",")).digest("hex").slice(0, 16);
}

/** The store of the oldest purge under way (its cursor row), else the oldest due store; null when there is none. */
async function nextStore(nowMs: number): Promise<{ storeId: string; cursor: PurgeCursor | null } | null> {
  // tenancy: platform the purges under way: cron_cursors rows purge:<storeId> (no store column, §D.3)
  const [open] = await pool().query<RowDataPacket[]>("SELECT job, state FROM cron_cursors WHERE job LIKE 'purge:%' ORDER BY updated_at, job LIMIT 1");
  if (open[0]) {
    const storeId = String(open[0].job).slice(PURGE_CURSOR_PREFIX.length);
    let state: Record<string, unknown> = {};
    try {
      state = JSON.parse(String(open[0].state ?? "{}")) as Record<string, unknown>;
    } catch {
      state = {};
    }
    if (STORE_ID_RE.test(storeId)) return { storeId, cursor: parseCursor(state.purge, storeId) };
    await dropCursor(String(open[0].job)); // never a store id: not ours to follow
    return nextStore(nowMs);
  }
  // tenancy: platform the purge queue (§H.9): the oldest store due, whatever its id (stores has no store_id column)
  const [due] = await pool().query<RowDataPacket[]>(
    `SELECT id FROM stores
      WHERE (status = 'scheduled_deletion' AND purge_after IS NOT NULL AND purge_after <= ?)
         OR (status = 'rejected' AND status_changed_at IS NOT NULL AND status_changed_at <= ?)
      ORDER BY COALESCE(purge_after, status_changed_at), id LIMIT 1`,
    [new Date(nowMs), new Date(nowMs - REJECTED_PURGE_DAYS * DAY)],
  );
  return due[0] ? { storeId: String(due[0].id), cursor: null } : null;
}

async function saveCursor(c: PurgeCursor): Promise<void> {
  await patchJobState(cursorJob(c.storeId), { purge: c });
}

async function dropCursor(job: string): Promise<void> {
  // tenancy: platform one purge's own cron_cursors row (no store column)
  await pool().query("DELETE FROM cron_cursors WHERE job = ?", [job]);
}

/* ------------------------------------------------------------------ */
/* the statements                                                       */
/* ------------------------------------------------------------------ */

/** headline_shingles.owner_tag of a store: hmac(storeId, "shingle-owner")[:16] (D35). */
export function shingleOwnerTag(storeId: string): string {
  return hmac(storeId, "shingle-owner").slice(0, 16);
}

function tableName(step: Extract<PurgeStep, { kind: "rows" }>): string {
  if (!TABLE_RE.test(step.table)) throw new Error(`purge: bad table name ${step.table}`);
  return step.table;
}

/** Rows of one planned table the store still has (the dry count; counts only). */
async function countRows(step: Extract<PurgeStep, { kind: "rows" }>, storeId: string): Promise<number> {
  let rows: RowDataPacket[];
  if (step.by === "owner_tag") {
    [rows] = await pool().query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM headline_shingles WHERE owner_tag = ?", [shingleOwnerTag(storeId)]);
  } else if (step.by === "media_key") {
    [rows] = await pool().query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM media_chunks WHERE `key` IN (SELECT `key` FROM media_files WHERE store_id = ?)", [storeId]);
  } else {
    // tenancy: platform the purge's dry count: one planned table (its name from schema.ts), the store's rows only
    [rows] = await pool().query<RowDataPacket[]>(`SELECT COUNT(*) AS n FROM \`${tableName(step)}\` WHERE store_id = ?`, [storeId]);
  }
  return Number(rows[0]?.n ?? 0);
}

/** One DELETE slice of a planned table; the rows it deleted. */
async function deleteSlice(step: Extract<PurgeStep, { kind: "rows" }>, storeId: string, limit: number): Promise<number> {
  let res: ResultSetHeader;
  if (step.by === "owner_tag") {
    [res] = await pool().query<ResultSetHeader>("DELETE FROM headline_shingles WHERE owner_tag = ? LIMIT ?", [shingleOwnerTag(storeId), limit]);
  } else if (step.by === "media_key") {
    // the chunks of the store's own media_files rows (deleted by the next step, which holds the keys)
    [res] = await pool().query<ResultSetHeader>("DELETE FROM media_chunks WHERE `key` IN (SELECT `key` FROM media_files WHERE store_id = ?) LIMIT ?", [storeId, limit]);
  } else {
    // tenancy: platform the purge (§F.9): one planned table (its name from schema.ts), only the store being purged
    [res] = await pool().query<ResultSetHeader>(`DELETE FROM \`${tableName(step)}\` WHERE store_id = ? LIMIT ?`, [storeId, limit]);
  }
  return res.affectedRows;
}

/** Removes the store's folder of `area` (nothing when the area's root is not configured). */
async function removeArea(area: DataArea, storeId: string): Promise<void> {
  const entry = perStoreDirs(storeId).find((d) => d.area === area);
  if (!entry) return;
  await rm(entry.dir, { recursive: true, force: true, maxRetries: 2 });
}

/** One audit redaction slice after `afterId`: the next keyset position, or null when the store's rows are done. */
async function redactAuditSlice(storeId: string, afterId: number, limit: number): Promise<{ next: number | null; updated: number }> {
  const [rows] = await pool().query<RowDataPacket[]>("SELECT id, meta FROM audit_log WHERE store_id = ? AND id > ? ORDER BY id LIMIT ?", [storeId, afterId, limit]);
  let updated = 0;
  for (const r of rows) {
    if (r.meta === null || r.meta === undefined) continue;
    const before = String(r.meta);
    const after = redactMetaForPurge(before) as string;
    if (after === before) continue;
    await pool().query("UPDATE audit_log SET meta = ? WHERE id = ? AND store_id = ?", [after, r.id, storeId]);
    updated++;
  }
  return { next: rows.length < limit ? null : Number(rows[rows.length - 1]!.id), updated };
}

/** One bounded UPDATE of a kept table; true when the store has no row left to change. */
async function keptSlice(step: "legal" | "signup" | "notes", storeId: string, limit: number): Promise<{ done: boolean; rows: number }> {
  let res: ResultSetHeader;
  if (step === "legal") {
    [res] = await pool().query<ResultSetHeader>("UPDATE legal_acceptances SET ua = NULL WHERE store_id = ? AND ua IS NOT NULL LIMIT ?", [storeId, limit]);
  } else if (step === "signup") {
    const empty = JSON.stringify(PURGED_SIGNALS);
    [res] = await pool().query<ResultSetHeader>("UPDATE signup_reviews SET signals = ?, business_context = NULL WHERE store_id = ? AND (signals <> ? OR business_context IS NOT NULL) LIMIT ?", [
      empty,
      storeId,
      empty,
      limit,
    ]);
  } else {
    [res] = await pool().query<ResultSetHeader>(
      "UPDATE platform_notes SET deleted_at = COALESCE(deleted_at, UTC_TIMESTAMP(3)), body = ? WHERE store_id = ? AND (deleted_at IS NULL OR body <> ?) LIMIT ?",
      [PURGED_NOTE_BODY, storeId, PURGED_NOTE_BODY, limit],
    );
  }
  return { done: res.affectedRows < limit, rows: res.affectedRows };
}

/* ------------------------------------------------------------------ */
/* one store                                                            */
/* ------------------------------------------------------------------ */

type StoreOutcome =
  /** the tombstone is written */
  | { state: "purged" }
  /** time or forced slices ran out: the cursor is saved */
  | { state: "running" }
  /** the store is no longer due (another status): the cursor is dropped */
  | { state: "refused"; status: StoreStatus | "missing" }
  /** a step cannot run now (DATA_DIR refused, the backup setting's lock busy, a database error): retried next tick */
  | { state: "waiting"; code: string };

interface RunState {
  slices: number;
  rows: number;
  readonly maxSlices: number;
  readonly sliceRows: number;
}

async function purgeStore(ctx: JobCtx, storeId: string, saved: PurgeCursor | null, plan: PurgePlan, run: RunState, nowMs: () => number): Promise<StoreOutcome> {
  const facts = await storeFacts(storeId);
  const reason = facts ? purgeReasonOf(facts, nowMs()) : null;
  if (!facts || !reason) {
    await dropCursor(cursorJob(storeId));
    return { state: "refused", status: facts?.status ?? "missing" };
  }
  // the store id every statement binds: the row the job read, through the system seam
  const scope = systemScope(ctx, storeId);
  const sid = scope.storeId;
  const signature = planSignature(plan);
  let cursor: PurgeCursor = saved ?? { v: 1, storeId: sid, reason, step: 0, auditAfter: 0, dry: {}, startedAt: new Date(nowMs()).toISOString(), plan: signature };
  // a cursor of another plan (a deploy between two ticks added or moved a table): every step again, each is idempotent
  if (cursor.plan !== signature) cursor = { ...cursor, step: 0, auditAfter: 0, plan: signature };

  if (!saved) {
    // the dry count (§H.9 safety): every planned table, logged as counts only
    const dry: Record<string, number> = {};
    for (const step of plan.steps) if (step.kind === "rows") dry[step.table] = await countRows(step, sid);
    const total = Object.values(dry).reduce((n, v) => n + v, 0);
    console.info(`[purge] ${sid} (${reason}): dry count ${total} rows in ${Object.keys(dry).length} tables`, JSON.stringify(dry));
    cursor = { ...cursor, dry };
    await saveCursor(cursor);
  }

  const total = plan.steps.length + PURGE_AFTER_STEPS.length;
  const outOfTime = () => Date.now() >= ctx.deadline || run.slices >= run.maxSlices;
  while (cursor.step < total) {
    if (outOfTime()) {
      await saveCursor(cursor);
      return { state: "running" };
    }
    // the status before every slice (§H.9): any other status ends the purge here
    const now = await storeFacts(sid);
    if (!now || purgeReasonOf(now, nowMs()) === null) {
      await dropCursor(cursorJob(sid));
      return { state: "refused", status: now?.status ?? "missing" };
    }
    run.slices++;
    let finished = false;
    if (cursor.step < plan.steps.length) {
      const step = plan.steps[cursor.step]!;
      if (step.kind === "area") {
        if (dataDir() || mediaRoot()) {
          const verdict = await mediaStorageChecked();
          if (!verdict.ok) {
            await saveCursor(cursor);
            return { state: "waiting", code: "purge_data_dir_refused" };
          }
        }
        await removeArea(step.area, sid);
        finished = true;
      } else {
        const n = await deleteSlice(step, sid, run.sliceRows);
        run.rows += n;
        finished = n < run.sliceRows;
      }
    } else {
      const after = PURGE_AFTER_STEPS[cursor.step - plan.steps.length]!;
      if (after === "audit") {
        const r = await redactAuditSlice(sid, cursor.auditAfter, Math.min(AUDIT_SLICE_ROWS, run.sliceRows));
        run.rows += r.updated;
        if (r.next === null) finished = true;
        else cursor = { ...cursor, auditAfter: r.next };
      } else if (after === "legal" || after === "signup" || after === "notes") {
        const r = await keptSlice(after, sid, run.sliceRows);
        run.rows += r.rows;
        finished = r.done;
      } else if (after === "backup") {
        // §F.9 SEC-20: the next backups leave the store out, and drop the id after one weekly cycle
        if (!(await appendPurgeRequest(sid, nowMs))) {
          await saveCursor(cursor);
          return { state: "waiting", code: "purge_backup_lock" };
        }
        finished = true;
      } else if (after === "caches") {
        await evictStore(sid);
        invalidateStore(sid);
        finished = true;
      } else {
        try {
          await transitionStore(systemCtx(PURGE_JOB), sid, "purged", { reason: cursor.reason });
        } catch (err) {
          if (err instanceof LifecycleError && (err.code === "status_changed" || err.code === "invalid")) {
            await dropCursor(cursorJob(sid));
            return { state: "refused", status: (await storeFacts(sid))?.status ?? "missing" };
          }
          throw err;
        }
        await dropCursor(cursorJob(sid));
        console.info(`[purge] ${sid}: purged (${cursor.reason}), tombstone written`);
        return { state: "purged" };
      }
    }
    if (finished) {
      cursor = { ...cursor, step: cursor.step + 1 };
      await saveCursor(cursor);
    }
    await ctx.yield();
  }
  return { state: "running" };
}

/* ------------------------------------------------------------------ */
/* the job                                                              */
/* ------------------------------------------------------------------ */

/** The registered body: one store at a time, the next one when a purge ends with time left. */
export async function purgeJob(ctx: JobCtx, opts: PurgeRunOpts = {}): Promise<JobResult> {
  const nowMs = opts.now ?? Date.now;
  const plan = opts.plan ?? purgePlan();
  const run: RunState = { slices: 0, rows: 0, maxSlices: opts.maxSlices ?? Number.POSITIVE_INFINITY, sliceRows: opts.sliceRows ?? PURGE_SLICE_ROWS };
  const summary: Record<string, number | string | boolean> = { purged: 0, refused: 0 };
  const result = (done: boolean, extra: Partial<JobResult> = {}): JobResult => ({ done, processed: run.rows, summary: { ...summary, slices: run.slices, rows: run.rows }, ...extra });
  const seen = new Set<string>();

  for (;;) {
    if (Date.now() >= ctx.deadline || run.slices >= run.maxSlices) return result(false);
    const next = await nextStore(nowMs());
    if (!next) return result(true);
    if (seen.has(next.storeId)) return result(false); // never twice in one run (a cursor that could not be dropped)
    seen.add(next.storeId);
    summary.store = next.storeId;
    let out: StoreOutcome;
    try {
      out = await purgeStore(ctx, next.storeId, next.cursor, plan, run, nowMs);
    } catch (err) {
      console.error(`[purge] ${next.storeId} failed:`, errorCode(err));
      // no storeId: the ring's row would be a new error_events row of the store being purged
      recordError("jobs", err, { route: `job:${PURGE_JOB}` });
      return result(false, { errorCode: "purge_failed" });
    }
    if (out.state === "purged") (summary.purged as number)++;
    else if (out.state === "refused") {
      (summary.refused as number)++;
      summary.refusedStatus = out.status;
    } else if (out.state === "waiting") {
      recordError("jobs", new Error(out.code), { route: `job:${PURGE_JOB}`, code: out.code });
      return result(false, { errorCode: out.code });
    } else return result(false);
  }
}
