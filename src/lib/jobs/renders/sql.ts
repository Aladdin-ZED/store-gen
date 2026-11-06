import "server-only";
/**
 * The render queue's statements (docs/STORE-SAAS.md §H.3, D25, ENGC-4; R1 P8 step 5): the enqueue's page reads and
 * INSERT IGNORE, the drain's claim, read back, outcome, release, requeue and resolve (./drain.ts `RenderRepo`), the
 * failed jobs a retry queues again, and the fan-out's `cron_cursors` row (a job-runner row with no store column).
 *
 * Every statement is reached through a store's scope and binds `store_id` from it (§E.3): a job of store A can never
 * touch store B's rows, and a page id of B enqueued under A's scope matches no page of A. None needs a
 * `tenancy: platform` annotation.
 *
 * `dedupe` is the page id while a job is **pending** only (D25, ENGC-4): the claim sets it NULL; a job that goes back
 * to pending (a retry, a release) takes it back with `UPDATE IGNORE` (judged by `changedRows`), and when a newer
 * pending job of the page holds it (enqueued during the render, with the newer context) the older job is closed as
 * `skipped` / `superseded` instead.
 * Concurrent claims meet in InnoDB's index locks like the outbox's: deadlocks and lock wait timeouts are retried.
 */
import { eq, inArray, isNotNull } from "drizzle-orm";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { db, pool } from "@/lib/db/client";
import { newId } from "@/lib/db/ids";
import { pages } from "@/lib/db/schema";
import { whereStore } from "@/lib/tenancy/sql";
import type { StoreScope, WriteScope } from "@/lib/tenancy/types";
import { isContention } from "../outbox/drain";
import type { RenderReason } from "../renders";
import type { ClaimedRender, RenderRepo } from "./drain";
import { ERROR_MAX, FANOUT_JOB, ID_BATCH, INSERT_BATCH, claimStatement, parseFanout, type FanoutState, type RenderOutcome } from "./rules";

const CLAIM_TRIES = 3;
const WRITE_TRIES = 5;

const affected = (res: unknown): number => {
  const head = Array.isArray(res) ? res[0] : res;
  const n = (head as Partial<ResultSetHeader> | undefined)?.affectedRows;
  return typeof n === "number" ? n : 0;
};
/**
 * The rows an UPDATE IGNORE really changed. mysql2 connects with CLIENT_FOUND_ROWS, so `affectedRows` counts the rows
 * the WHERE matched, and a row whose new `dedupe` collides with a newer pending job is matched but left as it was
 * ("Rows matched: 1  Changed: 0"). Each such statement changes `state`, so a changed row is never a no-op update.
 */
const changed = (res: unknown): number => {
  const head = Array.isArray(res) ? res[0] : res;
  const n = (head as Partial<ResultSetHeader> | undefined)?.changedRows;
  return typeof n === "number" ? n : 0;
};

/** Runs one statement, retrying contention (`tries` in all) after a short random pause. */
async function withContentionRetry<T>(fn: () => Promise<T>, tries: number = CLAIM_TRIES): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= tries || !isContention(err)) throw err;
      await new Promise((r) => setTimeout(r, 5 + Math.floor(Math.random() * 25 * attempt)));
    }
  }
}

const chunks = <T>(list: readonly T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
};
const marks = (n: number) => Array.from({ length: n }, () => "?").join(", ");

/* ------------------------------------------------------------------ */
/* Enqueue                                                             */
/* ------------------------------------------------------------------ */

/** The store's live pages: published, with a live version. */
export async function livePageIds(scope: StoreScope): Promise<string[]> {
  const rows = await db
    .select({ id: pages.id })
    .from(pages)
    .where(whereStore(pages, scope, eq(pages.status, "published"), isNotNull(pages.publishedVersionId)));
  return rows.map((r) => r.id);
}

/** The ids among `ids` that are pages of the scope's store (another store's id matches nothing). */
export async function storePageIds(scope: StoreScope, ids: readonly string[]): Promise<string[]> {
  const found: string[] = [];
  for (const part of chunks(ids, ID_BATCH)) {
    const rows = await db
      .select({ id: pages.id })
      .from(pages)
      .where(whereStore(pages, scope, inArray(pages.id, part)));
    found.push(...rows.map((r) => r.id));
  }
  return found;
}

/**
 * One pending job per page (`INSERT IGNORE` on `dedupe = page_id`, D25), 100 rows per statement: the rows inserted.
 * A page that already has a pending job keeps it, and keeps the lower of the two priorities (a Purchase-trigger
 * change, 4, is not held behind a pending address job, 5).
 */
export async function insertJobs(scope: WriteScope, pageIds: readonly string[], reason: RenderReason, priority: number): Promise<number> {
  let inserted = 0;
  for (const part of chunks(pageIds, INSERT_BATCH)) {
    const tuples = part.map(() => "(?, ?, ?, ?, ?, ?)").join(", ");
    const values = part.flatMap((pageId) => [newId(), scope.storeId, pageId, reason, priority, pageId]);
    const n = affected(await withContentionRetry(() => pool().query(`INSERT IGNORE INTO render_jobs (id, store_id, page_id, reason, priority, dedupe) VALUES ${tuples}`, values), WRITE_TRIES));
    inserted += n;
    if (n < part.length) {
      await withContentionRetry(
        () => pool().query(`UPDATE render_jobs SET priority = ? WHERE store_id = ? AND state = 'pending' AND priority > ? AND dedupe IN (${marks(part.length)})`, [priority, scope.storeId, priority, ...part]),
        WRITE_TRIES,
      );
    }
  }
  return inserted;
}

/* ------------------------------------------------------------------ */
/* The drain's statements                                              */
/* ------------------------------------------------------------------ */

function toClaimed(r: RowDataPacket): ClaimedRender {
  return { id: String(r.id), storeId: String(r.store_id), pageId: String(r.page_id), reason: r.reason as RenderReason, priority: Number(r.priority), attempts: Number(r.attempts) };
}

async function claim(scope: WriteScope, limit: number, token: string): Promise<ClaimedRender[]> {
  const p = pool();
  await withContentionRetry(() => p.query(claimStatement(), [token, scope.storeId, limit]));
  const [rows] = await p.query<RowDataPacket[]>("SELECT id, store_id, page_id, reason, priority, attempts FROM render_jobs WHERE claim = ? AND store_id = ? ORDER BY priority, not_before, id", [token, scope.storeId]);
  return rows.map(toClaimed);
}

/** Closes a claimed job as superseded: a newer pending job of its page holds `dedupe`. 1 = closed, 0 = claim lost. */
async function supersede(scope: WriteScope, ids: readonly string[], token: string, attempts: number | null): Promise<number> {
  if (!ids.length) return 0;
  const [res] = await withContentionRetry(
    () =>
      pool().query(
        `UPDATE render_jobs SET state = 'skipped', attempts = COALESCE(?, attempts), error = 'superseded', done_at = UTC_TIMESTAMP(3), claim = NULL, lease_until = NULL WHERE store_id = ? AND claim = ? AND id IN (${marks(ids.length)})`,
        [attempts, scope.storeId, token, ...ids],
      ),
    WRITE_TRIES,
  );
  return affected(res);
}

async function finish(scope: WriteScope, job: ClaimedRender, token: string, outcome: RenderOutcome): Promise<"ok" | "lost" | "superseded"> {
  if (outcome.state === "pending") {
    // back to pending with dedupe = page_id, unless a newer pending job of the page holds it (UPDATE IGNORE skips the row)
    const [res] = await withContentionRetry(
      () =>
        pool().query(
          "UPDATE IGNORE render_jobs SET state = 'pending', dedupe = page_id, attempts = ?, error = ?, not_before = UTC_TIMESTAMP(3) + INTERVAL ? SECOND, claim = NULL, lease_until = NULL WHERE store_id = ? AND id = ? AND claim = ?",
          [outcome.attempts, outcome.error.slice(0, ERROR_MAX), Math.ceil(outcome.retryInMs / 1000), scope.storeId, job.id, token],
        ),
      WRITE_TRIES,
    );
    if (changed(res) === 1) return "ok";
    return (await supersede(scope, [job.id], token, outcome.attempts)) === 1 ? "superseded" : "lost";
  }
  const attempts = outcome.state === "failed" ? outcome.attempts : null;
  const [res] = await withContentionRetry(
    () =>
      pool().query(
        "UPDATE render_jobs SET state = ?, attempts = COALESCE(?, attempts), error = ?, done_at = UTC_TIMESTAMP(3), claim = NULL, lease_until = NULL WHERE store_id = ? AND id = ? AND claim = ?",
        [outcome.state, attempts, outcome.error === null ? null : outcome.error.slice(0, ERROR_MAX), scope.storeId, job.id, token],
      ),
    WRITE_TRIES,
  );
  return affected(res) === 1 ? "ok" : "lost";
}

async function release(scope: WriteScope, ids: readonly string[], token: string): Promise<{ released: number; superseded: number }> {
  if (!ids.length) return { released: 0, superseded: 0 };
  const [res] = await withContentionRetry(
    () =>
      pool().query(`UPDATE IGNORE render_jobs SET state = 'pending', dedupe = page_id, claim = NULL, lease_until = NULL WHERE store_id = ? AND claim = ? AND id IN (${marks(ids.length)})`, [
        scope.storeId,
        token,
        ...ids,
      ]),
    WRITE_TRIES,
  );
  const released = changed(res);
  // what still holds the claim collided with a newer pending job of its page
  const superseded = released < ids.length ? await supersede(scope, ids, token, null) : 0;
  return { released, superseded };
}

async function requeue(scope: WriteScope, job: ClaimedRender): Promise<void> {
  await insertJobs(scope, [job.pageId], job.reason, job.priority);
}

async function resolveFailed(scope: WriteScope, pageIds: readonly string[]): Promise<number> {
  let n = 0;
  for (const part of chunks(pageIds, ID_BATCH)) {
    const [res] = await withContentionRetry(
      () =>
        pool().query(
          `UPDATE render_jobs SET state = 'skipped', error = LEFT(CONCAT('resolved:', COALESCE(error, '')), 200) WHERE store_id = ? AND state = 'failed' AND page_id IN (${marks(part.length)})`,
          [scope.storeId, ...part],
        ),
      WRITE_TRIES,
    );
    n += affected(res);
  }
  return n;
}

/** The drain's statements over the app's pool. */
export const dbRenderRepo: RenderRepo = { claim, finish, release, requeue, resolveFailed };

/** The store's failed jobs as (page, reason), at most 2,000 (Retry failed: Store Health, PLA-§15.1 / §16.2). */
export async function failedJobs(scope: StoreScope, reason: RenderReason | null): Promise<{ pageId: string; reason: RenderReason }[]> {
  const [rows] = reason
    ? await pool().query<RowDataPacket[]>("SELECT page_id, reason FROM render_jobs WHERE store_id = ? AND state = 'failed' AND reason = ? GROUP BY page_id, reason ORDER BY page_id LIMIT 2000", [scope.storeId, reason])
    : await pool().query<RowDataPacket[]>("SELECT page_id, reason FROM render_jobs WHERE store_id = ? AND state = 'failed' GROUP BY page_id, reason ORDER BY page_id LIMIT 2000", [scope.storeId]);
  return rows.map((r) => ({ pageId: String(r.page_id), reason: r.reason as RenderReason }));
}

/* ------------------------------------------------------------------ */
/* The fan-out's row (`cron_cursors.state.fanout`)                     */
/* ------------------------------------------------------------------ */

/** The fan-out request and its progress, or null (none yet, or a row this code cannot read). */
export async function readFanout(): Promise<FanoutState | null> {
  // tenancy: platform cron_cursors is a job-runner row (no store column, §D.3)
  const [rows] = await pool().query<RowDataPacket[]>("SELECT state FROM cron_cursors WHERE job = ?", [FANOUT_JOB]);
  return rows.length ? parseFanout(rows[0]!.state) : null;
}

/**
 * Writes `next` as the fan-out under the row's lock (a read-modify-write of the whole `state`, so the runner's `due`
 * keys stay; JSON_MERGE_PATCH would drop a null `doneAt`). `when` decides from the fan-out stored now: "idle" writes
 * only when none is in progress (a request), "same" only while the stored one is `next.id` (a run's progress). Answers
 * whether it wrote, and the fan-out that was there.
 */
export async function writeFanout(next: FanoutState, when: "idle" | "same"): Promise<{ written: boolean; current: FanoutState | null }> {
  const conn = await pool().getConnection();
  try {
    await conn.beginTransaction();
    // tenancy: platform cron_cursors is a job-runner row (the seed of the fan-out's row)
    await conn.query("INSERT IGNORE INTO cron_cursors (job, `cursor`, state, updated_at) VALUES (?, '', '{}', UTC_TIMESTAMP(3))", [FANOUT_JOB]);
    // tenancy: platform cron_cursors is a job-runner row (read under its lock)
    const [rows] = await conn.query<RowDataPacket[]>("SELECT state FROM cron_cursors WHERE job = ? FOR UPDATE", [FANOUT_JOB]);
    const raw = rows[0]?.state;
    const current = parseFanout(raw);
    const ok = when === "idle" ? !current || current.doneAt !== null : current?.id === next.id;
    if (!ok) {
      await conn.rollback();
      return { written: false, current };
    }
    let state: Record<string, unknown> = {};
    try {
      const parsed: unknown = typeof raw === "string" && raw ? JSON.parse(raw) : {};
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) state = parsed as Record<string, unknown>;
    } catch {
      // an unreadable state is replaced (the runner re-creates its due keys)
    }
    // tenancy: platform cron_cursors is a job-runner row (the fan-out written back with the other keys kept)
    await conn.query("UPDATE cron_cursors SET state = ?, updated_at = UTC_TIMESTAMP(3) WHERE job = ?", [JSON.stringify({ ...state, fanout: next }), FANOUT_JOB]);
    await conn.commit();
    return { written: true, current };
  } catch (err) {
    await conn.rollback().catch(() => undefined);
    throw err;
  } finally {
    conn.release();
  }
}
