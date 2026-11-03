import "server-only";
/**
 * `media.migrate` (docs/STORE-SAAS.md §G.3, OS-07; R1 P8 step 7), slot 6, every tick, 3 s: while the DATA_DIR boot
 * check passed (`mediaBackend()` is fs) and files are still kept in the database (`media_files.storage = 'db'`: every
 * file uploaded before the filesystem backend, or during a fallback), move at most 50 per tick, store by store:
 *
 *   1. read the chunks and check them against the row (count, length, sha256);
 *   2. `put` them to the fs backend (durable, idempotent: a slice interrupted after its put finds the file there);
 *   3. in one transaction: `UPDATE media_files SET storage = 'fs' WHERE store_id = ? AND key = ? AND storage = 'db'`,
 *      then `DELETE FROM media_chunks WHERE key = ?` when that row flipped;
 *   4. drop the process's cached metadata of the key (readers that cached the db row follow it to the file anyway).
 *
 * Idempotent across interrupted ticks: before step 3 the row still says db and the next tick redoes 1-2 (the put
 * resolves at once); steps 3 and 4 commit together, so no chunk outlives its flipped row. A row deleted meanwhile (the
 * asset was deleted) flips nothing and its file is removed at once. A file whose chunks do not make its row is never
 * moved: it is reported (`error_events`, area `media`, `missing_file` or `file_mismatch`) and remembered in the job's
 * state (`bad`, ≤ 200 keys) so it does not take every tick's budget.
 *
 * Returns at once when there is no work: on the db backend, and for an hour after a probe found no db row (rows only
 * appear while a process runs on the fallback). InnoDB keeps the freed space until `OPTIMIZE TABLE media_chunks`,
 * which the owner runs in hPanel during a quiet hour (TENANCY-MAP §11.1); the console shows the reclaimable size.
 */
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { pool } from "@/lib/db/client";
import { recordError } from "@/lib/jobs/errors";
import { mediaBackendReady, fsStorage } from "@/lib/media/storage";
import { sha256hex } from "@/lib/media/storage/io";
import type { WriteScope } from "@/lib/tenancy/types";
import type { JobCtx, JobResult } from "../runner";
import { forEachStore, systemScope } from "../scope";
import { MIGRATE_BAD_MAX, MIGRATE_IDLE_MS, MIGRATE_MAX_FILES, STORES_WITH_DATA } from "./rules";
import { patchJobState, readJobState } from "./state";

/** epoch ms until which the probe is skipped (it found no db row); a number, no store data */
let idleUntil = 0;

/** Forget the idle memo (test:storage seeds db rows after a run that found none). */
export function resetMigrateIdle(): void {
  idleUntil = 0;
}

interface DbFileRow {
  key: string;
  assetId: string;
  mime: string;
  bytes: number;
  chunks: number;
  sha256: string;
}

interface MigrateRun {
  moved: number;
  movedBytes: number;
  bad: string[];
  newBad: number;
  gone: number;
}

const parseBad = (raw: unknown): string[] => (Array.isArray(raw) ? raw.filter((k): k is string => typeof k === "string" && k.length <= 120).slice(-MIGRATE_BAD_MAX) : []);

/** Whether any file is still kept in the database (the bad keys aside). One cross-store probe, at most hourly when idle. */
async function anyDbFile(bad: readonly string[]): Promise<boolean> {
  const notBad = bad.length ? " AND `key` NOT IN (?)" : "";
  // tenancy: platform the migrator's work probe: one key of any store, nothing read from it (§G.3)
  const [rows] = await pool().query<RowDataPacket[]>(`SELECT 1 FROM media_files WHERE storage = 'db'${notBad} LIMIT 1`, bad.length ? [bad] : []);
  return rows.length > 0;
}

/** The store's next db files (bad keys excluded), in key order. */
async function dbFilesOf(scope: WriteScope, limit: number, bad: readonly string[]): Promise<DbFileRow[]> {
  // one static statement (no fragment beside the store predicate): "" is never a key, so it stands for "no bad key"
  const [rows] = await pool().query<RowDataPacket[]>(
    "SELECT `key`, asset_id, mime, bytes, chunks, sha256 FROM media_files WHERE store_id = ? AND storage = 'db' AND `key` NOT IN (?) ORDER BY `key` LIMIT ?",
    [scope.storeId, bad.length ? bad : [""], limit],
  );
  return rows.map((r) => ({ key: String(r.key), assetId: String(r.asset_id), mime: String(r.mime), bytes: Number(r.bytes), chunks: Number(r.chunks), sha256: String(r.sha256) }));
}

/** The file's bytes from its chunks, checked against its row; why not when they do not make it. */
async function readChunks(row: DbFileRow): Promise<Buffer | "missing_file" | "file_mismatch"> {
  // media_chunks has no store column: the key is the row's, read under the store's scope above (D28: one store per key)
  const [rows] = await pool().query<RowDataPacket[]>("SELECT idx, data FROM media_chunks WHERE `key` = ? ORDER BY idx", [row.key]);
  if (rows.length === 0) return "missing_file";
  if (rows.length !== row.chunks || rows.some((r, i) => Number(r.idx) !== i)) return "file_mismatch";
  const data = rows.length === 1 ? (rows[0]!.data as Buffer) : Buffer.concat(rows.map((r) => r.data as Buffer));
  if (data.length !== row.bytes || sha256hex(data) !== row.sha256) return "file_mismatch";
  return data;
}

/** Steps 3-4 in one transaction: true when the row flipped (and its chunks went with it). */
async function flip(scope: WriteScope, key: string): Promise<boolean> {
  const conn = await pool().getConnection();
  try {
    await conn.beginTransaction();
    const [res] = await conn.query<ResultSetHeader>("UPDATE media_files SET storage = 'fs' WHERE store_id = ? AND `key` = ? AND storage = 'db'", [scope.storeId, key]);
    if (res.affectedRows === 1) await conn.query("DELETE FROM media_chunks WHERE `key` = ?", [key]);
    await conn.commit();
    return res.affectedRows === 1;
  } catch (err) {
    await conn.rollback().catch(() => undefined);
    throw err;
  } finally {
    conn.release();
  }
}

/** Moves the store's db files while the tick's cap and the job's deadline allow; returns how many moved. */
async function migrateStore(ctx: JobCtx, scope: WriteScope, run: MigrateRun): Promise<number> {
  const { evictKeys, keysWithRows } = await import("@/lib/media/store");
  const rows = await dbFilesOf(scope, MIGRATE_MAX_FILES - run.moved, run.bad);
  let moved = 0;
  for (const row of rows) {
    if (run.moved >= MIGRATE_MAX_FILES || Date.now() >= ctx.deadline) break;
    const data = await readChunks(row);
    if (typeof data === "string") {
      recordError("media", null, { code: data, storeId: scope.storeId, route: "job:media.migrate" });
      run.bad.push(row.key);
      run.newBad++;
      continue;
    }
    const file = { storeId: scope.storeId, key: row.key, assetId: row.assetId, mime: row.mime, bytes: row.bytes, sha256: row.sha256 };
    await fsStorage.put(file, data);
    if (await flip(scope, row.key)) {
      moved++;
      run.moved++;
      run.movedBytes += row.bytes;
    } else if (!(await keysWithRows(scope, [row.key])).has(row.key)) {
      // the asset was deleted between the read and the flip: its file has no row to claim it
      await fsStorage.remove({ storeId: scope.storeId, key: row.key, storage: "fs" });
      run.gone++;
    }
    evictKeys([row.key]);
    await ctx.yield();
  }
  return moved;
}

export async function mediaMigrateJob(ctx: JobCtx): Promise<JobResult> {
  if (Date.now() < idleUntil) return { done: true, summary: { idle: true } };
  const backend = await mediaBackendReady();
  if (backend.kind !== "fs") return { done: true, summary: { skipped: "backend_db" } };
  const state = await readJobState(ctx.job);
  const run: MigrateRun = { moved: 0, movedBytes: 0, bad: parseBad(state.bad), newBad: 0, gone: 0 };
  if (!(await anyDbFile(run.bad))) {
    idleUntil = Date.now() + MIGRATE_IDLE_MS;
    return { done: true, summary: { idle: true, bad: run.bad.length } };
  }
  const visit = await forEachStore(
    ctx,
    {
      job: ctx.job,
      states: STORES_WITH_DATA,
      budgetMs: Math.max(1, ctx.deadline - Date.now()),
      where: "pending_media_db",
      stop: () => run.moved >= MIGRATE_MAX_FILES || Date.now() >= ctx.deadline,
    },
    (_scope, store) => migrateStore(ctx, systemScope(ctx, store.id), run),
  );
  if (run.newBad) await patchJobState(ctx.job, { bad: run.bad.slice(-MIGRATE_BAD_MAX) });
  return {
    // work is left when the cap or the deadline stopped the visit; the next tick goes on from the cursor
    done: visit.done && run.moved < MIGRATE_MAX_FILES,
    processed: run.moved,
    summary: { moved: run.moved, movedBytes: run.movedBytes, ...(run.newBad ? { bad: run.newBad } : {}), ...(run.gone ? { gone: run.gone } : {}) },
  };
}
