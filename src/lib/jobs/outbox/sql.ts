import "server-only";
/**
 * The outbox's statements (docs/STORE-SAAS.md §H.1; R1 P8 step 4): the enqueue INSERT and the drainer's claim, read
 * back, outcome and release (./drain.ts `DrainStore`).
 *
 * A store's rows are always reached through its scope (`store_id = ?` bound from `scope.storeId`, §E.3), in a function
 * that takes the scope: the drain of store A can never touch store B's rows. The platform items (`store_id` NULL: mail,
 * R2) have their own statements, each annotated: they belong to no store (§E.3 rule 6; counted for the
 * `src/lib/jobs/**` pin, CCR r1-p8-4).
 *
 * Concurrent drains meet in InnoDB's index locks (a claim's range scan against another drain's outcome writes moving
 * rows in `ob_due_idx` / `ob_store_idx`), so a statement can be chosen as a deadlock victim (1213) or time out on a lock
 * (1205); an autocommit statement is then rolled back whole, and running it again is safe. Claims retry twice, then
 * give the contention to the drainer, which leaves the kind for the next round; outcome and release writes retry four
 * times, because a sent item whose outcome is lost would stay `running` until its lease ends and be sent again.
 */
import { sql, type SQL } from "drizzle-orm";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { db, pool } from "@/lib/db/client";
import type { Tx } from "@/lib/orders/hooks";
import type { StoreScope, WriteScope } from "@/lib/tenancy/types";
import type { OutboxKind } from "../outbox";
import type { DrainStore, RawItem } from "./drain";
import { isContention } from "./drain";
import { claimStatement, type Outcome } from "./rules";

/** One row to insert, in column order: id, store_id, kind, topic, target_id, dedupe_key, payload, encrypted, next_at. */
export type InsertRow = [id: string, storeId: string | null, kind: OutboxKind, topic: string, targetId: string | null, dedupeKey: string, payload: string, encrypted: 0 | 1, nextAt: Date | null];

/** rows per INSERT statement */
const INSERT_BATCH = 100;
const CLAIM_TRIES = 3;
const WRITE_TRIES = 5;

const affected = (res: unknown): number => {
  const head = Array.isArray(res) ? res[0] : res;
  const n = (head as Partial<ResultSetHeader> | undefined)?.affectedRows;
  return typeof n === "number" ? n : 0;
};

/* ------------------------------------------------------------------ */
/* Enqueue                                                             */
/* ------------------------------------------------------------------ */

function insertStatement(rows: readonly InsertRow[]): SQL {
  const tuples = rows.map((r) => sql`(${r[0]}, ${r[1]}, ${r[2]}, ${r[3]}, ${r[4]}, ${r[5]}, ${r[6]}, ${r[7]}, COALESCE(${r[8]}, UTC_TIMESTAMP(3)))`);
  // each row carries its own store id (the enqueuing scope's, or NULL for a platform item): INSERT IGNORE on dedupe_key
  return sql`INSERT IGNORE INTO outbox (id, store_id, kind, topic, target_id, dedupe_key, payload, encrypted, next_at) VALUES ${sql.join(tuples, sql`, `)}`;
}

/**
 * One multi-row `INSERT IGNORE` (per 100 rows) on the caller's transaction, else on the pool (several statements then
 * share one transaction): the rows inserted; the rest were duplicates of a kept `dedupe_key`.
 */
export async function insertItems(rows: readonly InsertRow[], tx?: Tx): Promise<number> {
  const run = async (exec: Pick<Tx, "execute">): Promise<number> => {
    let inserted = 0;
    for (let i = 0; i < rows.length; i += INSERT_BATCH) inserted += affected(await exec.execute(insertStatement(rows.slice(i, i + INSERT_BATCH))));
    return inserted;
  };
  if (tx) return run(tx);
  if (rows.length <= INSERT_BATCH) return run(db);
  return db.transaction((t) => run(t));
}

/* ------------------------------------------------------------------ */
/* The drainer's statements                                            */
/* ------------------------------------------------------------------ */

const COLUMNS = "id, store_id, kind, topic, target_id, dedupe_key, payload, encrypted, attempts, created_at";

function toRaw(r: RowDataPacket): RawItem {
  return {
    id: String(r.id),
    storeId: r.store_id === null ? null : String(r.store_id),
    kind: r.kind as OutboxKind,
    topic: String(r.topic),
    targetId: r.target_id === null ? null : String(r.target_id),
    dedupeKey: String(r.dedupe_key),
    payload: String(r.payload),
    encrypted: Number(r.encrypted) === 1,
    attempts: Number(r.attempts),
    createdAt: r.created_at instanceof Date ? r.created_at : new Date(String(r.created_at)),
  };
}

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

/** The finish parameters shared by both owners: state, attempts, next_at, done_at, last_status, last_error, last_ms. */
function finishValues(outcome: Outcome, ms: number, now: number): unknown[] {
  const lastMs = Math.min(2_147_483_647, Math.max(0, Math.round(ms)));
  if (outcome.state === "done") return ["done", null, null, new Date(now), outcome.status, null, lastMs];
  if (outcome.state === "pending") return ["pending", outcome.attempts, new Date(outcome.nextAt), null, outcome.status, outcome.error, lastMs];
  // done_at is the time a row reached its final state, done, dead or cancelled (retention: done 14 days, dead and cancelled 30 days, §H.11)
  if (outcome.state === "cancelled") return ["cancelled", outcome.attempts, null, new Date(now), outcome.status, outcome.error, lastMs];
  return ["dead", outcome.attempts, null, new Date(now), outcome.status, outcome.error, lastMs];
}

/** A store's rows: every statement binds `scope.storeId`. */
async function claimStore(scope: WriteScope, kinds: readonly OutboxKind[], limit: number, claim: string): Promise<RawItem[]> {
  const p = pool();
  await withContentionRetry(() => p.query(claimStatement(kinds.length, "store"), [claim, ...kinds, scope.storeId, limit]));
  const [rows] = await p.query<RowDataPacket[]>(`SELECT ${COLUMNS} FROM outbox WHERE claim = ? AND store_id = ? ORDER BY next_at, id`, [claim, scope.storeId]);
  return rows.map(toRaw);
}

async function finishStore(scope: WriteScope, id: string, claim: string, outcome: Outcome, ms: number, now: number): Promise<boolean> {
  const [res] = await withContentionRetry(
    () =>
      pool().query(
        "UPDATE outbox SET state = ?, attempts = COALESCE(?, attempts), next_at = COALESCE(?, next_at), done_at = ?, last_status = ?, last_error = ?, last_ms = ?, claim = NULL, lease_until = NULL WHERE id = ? AND claim = ? AND store_id = ?",
        [...finishValues(outcome, ms, now), id, claim, scope.storeId],
      ),
    WRITE_TRIES,
  );
  return affected(res) === 1;
}

async function releaseStore(scope: WriteScope, ids: readonly string[], claim: string, nextAt: number | null): Promise<void> {
  if (!ids.length) return;
  await withContentionRetry(
    () =>
      pool().query(
        `UPDATE outbox SET state = 'pending', next_at = COALESCE(?, next_at), claim = NULL, lease_until = NULL WHERE claim = ? AND store_id = ? AND id IN (${ids.map(() => "?").join(", ")})`,
        [nextAt === null ? null : new Date(nextAt), claim, scope.storeId, ...ids],
      ),
    WRITE_TRIES,
  );
}

/** The kinds among `kinds` with a pending item in the store. */
async function pendingKinds(scope: StoreScope, kinds: readonly OutboxKind[]): Promise<OutboxKind[]> {
  if (!kinds.length) return [];
  const [rows] = await pool().query<RowDataPacket[]>(
    `SELECT DISTINCT kind FROM outbox WHERE store_id = ? AND state = 'pending' AND kind IN (${kinds.map(() => "?").join(", ")})`,
    [scope.storeId, ...kinds],
  );
  return rows.map((r) => r.kind as OutboxKind);
}

/** The platform items (`store_id` NULL): annotated, they belong to no store. */
async function claimPlatform(kinds: readonly OutboxKind[], limit: number, claim: string): Promise<RawItem[]> {
  const p = pool();
  await withContentionRetry(() => p.query(claimStatement(kinds.length, "platform"), [claim, ...kinds, limit]));
  // tenancy: platform the platform items just claimed (store_id NULL), read back by their claim token
  const [rows] = await p.query<RowDataPacket[]>(`SELECT ${COLUMNS} FROM outbox WHERE claim = ? AND store_id IS NULL ORDER BY next_at, id`, [claim]);
  return rows.map(toRaw);
}

async function finishPlatform(id: string, claim: string, outcome: Outcome, ms: number, now: number): Promise<boolean> {
  const [res] = await withContentionRetry(
    () =>
      pool().query(
        // tenancy: platform one platform item's outcome (store_id NULL), under its claim token
        "UPDATE outbox SET state = ?, attempts = COALESCE(?, attempts), next_at = COALESCE(?, next_at), done_at = ?, last_status = ?, last_error = ?, last_ms = ?, claim = NULL, lease_until = NULL WHERE id = ? AND claim = ? AND store_id IS NULL",
        [...finishValues(outcome, ms, now), id, claim],
      ),
    WRITE_TRIES,
  );
  return affected(res) === 1;
}

async function releasePlatform(ids: readonly string[], claim: string, nextAt: number | null): Promise<void> {
  if (!ids.length) return;
  await withContentionRetry(
    () =>
      pool().query(
        // tenancy: platform platform items (store_id NULL) given back under their claim token
        `UPDATE outbox SET state = 'pending', next_at = COALESCE(?, next_at), claim = NULL, lease_until = NULL WHERE claim = ? AND store_id IS NULL AND id IN (${ids.map(() => "?").join(", ")})`,
        [nextAt === null ? null : new Date(nextAt), claim, ...ids],
      ),
    WRITE_TRIES,
  );
}

/** The drainer's statements over the app's pool. */
export const dbDrainStore: DrainStore = {
  claim: (owner, kinds, limit, claim) => (owner ? claimStore(owner, kinds, limit, claim) : claimPlatform(kinds, limit, claim)),
  finish: (owner, id, claim, outcome, ms, now) => (owner ? finishStore(owner, id, claim, outcome, ms, now) : finishPlatform(id, claim, outcome, ms, now)),
  release: (owner, ids, claim, nextAt) => (owner ? releaseStore(owner, ids, claim, nextAt) : releasePlatform(ids, claim, nextAt)),
  pendingKinds,
};
