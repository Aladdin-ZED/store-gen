import "server-only";
/**
 * `media.sweep` (docs/STORE-SAAS.md §G.3; R1 P8 step 7), slot 6, daily 02:10, 3 s a tick until done: the media root
 * holds exactly the files the rows name.
 *
 * - **Orphans are deleted**: a file on disk with no `media_files` row of its store and older than an hour (an upload
 *   writes its files before its rows, and an idempotent re-put refreshes the time), and a temp file of
 *   `<media root>/tmp` older than an hour. The keys about to be deleted are read again just before the unlink, so a
 *   row inserted meanwhile keeps its file. Folders emptied by the sweep are pruned (key shard, store, store shard).
 * - **Missing files are reported, never deleted**: a row with `storage = 'fs'` whose file is not on disk counts one
 *   `missing_file` in the error ring (area `media`, with its store) per file, up to 500 per store and run; the row
 *   stays (its asset answers 404 and shows in the console, nothing is repaired silently).
 *
 * The disk is the source: the sweep walks the store folders under `<media root>/v1` in id order, so a purged store's
 * leftovers (no store row, so no forEachStore visit) are swept too. Phases, resumable in `cron_cursors.state.sweep`:
 * `tmp` → `disk` (store folders after the last one done, each compared with its store's rows through that store's
 * scope) → `rows` (stores with fs rows and no folder at all: every such file is missing). A folder name that is not a
 * store id is never touched (counted as `foreign`).
 *
 * It runs only while the DATA_DIR boot check passes: a refused directory (another app's marker, a link…) is never
 * swept.
 */
import type { Dirent } from "node:fs";
import { readdir, rmdir, stat, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { asc, gt } from "drizzle-orm";
import type { RowDataPacket } from "mysql2/promise";
import { db, pool } from "@/lib/db/client";
import { mediaFiles } from "@/lib/db/schema";
import { recordError } from "@/lib/jobs/errors";
import { KEY_RE } from "@/lib/media/keys";
import { mediaBackendReady } from "@/lib/media/storage";
import { areaBase, mediaTmpDir, STORE_DIR_ID_RE } from "@/lib/storage/paths";
import { whereStore } from "@/lib/tenancy/sql";
import type { WriteScope } from "@/lib/tenancy/types";
import type { JobCtx, JobResult } from "../runner";
import { systemScope } from "../scope";
import { MISSING_REPORT_MAX, parseSweep, sweepVerdict, type SweepState } from "./rules";
import { patchJobState, readJobState } from "./state";

const ROW_PAGE = 2_000;
const STAT_BATCH = 64;
const ROUTE = "job:media.sweep";

export interface SweepRun {
  tmpDeleted: number;
  orphans: number;
  /** files with no row kept because they are younger than an hour */
  fresh: number;
  missing: number;
  stores: number;
  foreign: number;
}

const newRun = (): SweepRun => ({ tmpDeleted: 0, orphans: 0, fresh: 0, missing: 0, stores: 0, foreign: 0 });

const isGone = (err: unknown) => {
  const code = (err as { code?: string } | null)?.code;
  return code === "ENOENT" || code === "ENOTDIR";
};

async function list(dir: string): Promise<Dirent[]> {
  try {
    return await readdir(/* turbopackIgnore: true */ dir, { withFileTypes: true });
  } catch (err) {
    if (isGone(err)) return [];
    throw err;
  }
}

/** The file's age in ms, or null when it vanished. */
async function ageOf(path: string, now: number): Promise<number | null> {
  try {
    return now - (await stat(/* turbopackIgnore: true */ path)).mtimeMs;
  } catch (err) {
    if (isGone(err)) return null;
    throw err;
  }
}

async function removeFile(path: string): Promise<boolean> {
  try {
    await unlink(/* turbopackIgnore: true */ path);
    return true;
  } catch (err) {
    if (isGone(err)) return false;
    throw err;
  }
}

/** rmdir when empty; any failure (not empty, gone) leaves it. */
const pruneDir = (dir: string) => rmdir(/* turbopackIgnore: true */ dir).then(() => true, () => false);

/* ------------------------------------------------------------------ */
/* tmp                                                                 */
/* ------------------------------------------------------------------ */

/** Temp files older than an hour; false when the deadline stopped it (the next tick lists the folder again). */
async function sweepTmp(ctx: JobCtx, tmp: string | null, run: SweepRun): Promise<boolean> {
  if (!tmp) return true;
  const entries = (await list(tmp)).filter((e) => !e.isDirectory());
  for (let i = 0; i < entries.length; i += STAT_BATCH) {
    if (Date.now() >= ctx.deadline) return false;
    const now = Date.now();
    for (const e of entries.slice(i, i + STAT_BATCH)) {
      const path = join(tmp, e.name);
      const age = await ageOf(path, now);
      if (age !== null && sweepVerdict({ row: false, ageMs: age }) === "delete" && (await removeFile(path))) run.tmpDeleted++;
    }
    await ctx.yield();
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* disk: one store folder                                              */
/* ------------------------------------------------------------------ */

/** The store's media keys and where each row keeps its bytes. */
async function rowsOf(scope: WriteScope): Promise<Map<string, "db" | "fs">> {
  const out = new Map<string, "db" | "fs">();
  let after = "";
  for (;;) {
    const page = await db
      .select({ key: mediaFiles.key, storage: mediaFiles.storage })
      .from(mediaFiles)
      .where(whereStore(mediaFiles, scope, after ? gt(mediaFiles.key, after) : undefined))
      .orderBy(asc(mediaFiles.key))
      .limit(ROW_PAGE);
    for (const r of page) out.set(r.key, r.storage);
    if (page.length < ROW_PAGE) return out;
    after = page[page.length - 1]!.key;
  }
}

/** The store ids with a folder under `<media root>/v1` (`<id[0..1]>/<id>`), in id order; other names are counted. */
async function storeFolders(v1: string, run: SweepRun): Promise<string[]> {
  const ids: string[] = [];
  for (const shard of await list(v1)) {
    if (!shard.isDirectory()) {
      run.foreign++;
      continue;
    }
    for (const e of await list(join(v1, shard.name))) {
      if (e.isDirectory() && STORE_DIR_ID_RE.test(e.name) && e.name.slice(0, 2) === shard.name) ids.push(e.name);
      else run.foreign++;
    }
  }
  return ids.sort();
}

/**
 * Compares one store folder with the store's rows: orphans older than an hour deleted (their keys read again first),
 * fs rows without their file reported. Returns the files deleted.
 */
export async function sweepStoreFolder(ctx: Pick<JobCtx, "yield">, scope: WriteScope, dir: string, run: SweepRun): Promise<number> {
  const { keysWithRows } = await import("@/lib/media/store");
  const rows = await rowsOf(scope);
  const seen = new Set<string>();
  const candidates: { path: string; key: string | null }[] = [];
  const shards: string[] = [];
  for (const e of await list(dir)) {
    const at = join(dir, e.name);
    if (!e.isDirectory()) {
      candidates.push({ path: at, key: null }); // nothing belongs directly in a store folder
      continue;
    }
    shards.push(at);
    for (const f of await list(at)) {
      if (f.isDirectory()) continue; // never created by the backend; left alone
      // the row's file is `<key[0..1]>/<key>`: a key in another shard is not where its row's bytes are
      const key = KEY_RE.test(f.name) && f.name.slice(0, 2) === e.name ? f.name : null;
      if (key && rows.has(key)) seen.add(key);
      else candidates.push({ path: join(at, f.name), key });
    }
    await ctx.yield();
  }

  const now = Date.now();
  const doomed: { path: string; key: string | null }[] = [];
  for (const c of candidates) {
    const age = await ageOf(c.path, now);
    if (age === null) continue;
    if (sweepVerdict({ row: false, ageMs: age }) === "delete") doomed.push(c);
    else run.fresh++;
  }
  // a row inserted since the read above keeps its file (an upload's put precedes its rows by milliseconds)
  const claimed = await keysWithRows(
    scope,
    doomed.flatMap((d) => (d.key ? [d.key] : [])),
  );
  let deleted = 0;
  for (const d of doomed) {
    if (d.key && claimed.has(d.key)) continue;
    if (await removeFile(d.path)) deleted++;
  }
  run.orphans += deleted;
  if (deleted) {
    for (const s of shards) await pruneDir(s);
    if (await pruneDir(dir)) await pruneDir(dirname(dir));
  }

  let missing = 0;
  for (const [key, storage] of rows) {
    if (storage !== "fs" || seen.has(key)) continue;
    if (missing < MISSING_REPORT_MAX) recordError("media", null, { code: "missing_file", storeId: scope.storeId, route: ROUTE });
    missing++;
  }
  run.missing += missing;
  run.stores++;
  return deleted;
}

/** Store folders after `state.after`, one at a time, until the deadline; false when it stopped early. */
async function sweepDisk(ctx: JobCtx, v1: string, state: SweepState, run: SweepRun): Promise<boolean> {
  for (const id of await storeFolders(v1, run)) {
    if (id <= state.after) continue;
    if (Date.now() >= ctx.deadline) return false;
    // a purged store's folder too: its scope reads no row, so every file in it is an orphan
    await sweepStoreFolder(ctx, systemScope(ctx, id), join(v1, id.slice(0, 2), id), run);
    state.after = id;
    await ctx.yield();
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* rows: stores with fs rows and no folder                             */
/* ------------------------------------------------------------------ */

async function sweepRowsWithoutFolder(ctx: JobCtx, v1: string, run: SweepRun): Promise<void> {
  // tenancy: platform the sweeper's store list: fs file counts per store, no row's content (§G.3)
  const [rows] = await pool().query<RowDataPacket[]>("SELECT store_id, COUNT(*) AS n FROM media_files WHERE storage = 'fs' GROUP BY store_id");
  for (const r of rows) {
    const id = String(r.store_id);
    if (!STORE_DIR_ID_RE.test(id)) continue;
    const exists = await stat(/* turbopackIgnore: true */ join(v1, id.slice(0, 2), id)).then(
      (s) => s.isDirectory(),
      () => false,
    );
    if (exists) continue; // compared with its rows in the disk phase
    const n = Number(r.n) || 0;
    for (let i = 0; i < Math.min(n, MISSING_REPORT_MAX); i++) recordError("media", null, { code: "missing_file", storeId: id, route: ROUTE });
    run.missing += n;
    await ctx.yield();
  }
}

/* ------------------------------------------------------------------ */
/* The job                                                             */
/* ------------------------------------------------------------------ */

export async function mediaSweepJob(ctx: JobCtx): Promise<JobResult> {
  const backend = await mediaBackendReady();
  const v1 = areaBase("media");
  if (backend.kind !== "fs" || !v1) return { done: true, summary: { skipped: "backend_db" } };
  const stored = parseSweep((await readJobState(ctx.job)).sweep);
  const state: SweepState = stored ?? { phase: "tmp", after: "" };
  const run = newRun();
  const summary = () => ({ ...run, phase: state.phase });

  if (state.phase === "tmp") {
    if (!(await sweepTmp(ctx, mediaTmpDir(), run))) {
      await patchJobState(ctx.job, { sweep: state });
      return { done: false, processed: run.tmpDeleted, summary: summary() };
    }
    state.phase = "disk";
    state.after = "";
  }
  if (state.phase === "disk") {
    if (!(await sweepDisk(ctx, v1, state, run))) {
      await patchJobState(ctx.job, { sweep: state });
      return { done: false, processed: run.tmpDeleted + run.orphans, summary: summary() };
    }
    state.phase = "rows";
    state.after = "";
  }
  await sweepRowsWithoutFolder(ctx, v1, run);
  await patchJobState(ctx.job, { sweep: null });
  return { done: true, processed: run.tmpDeleted + run.orphans, summary: { ...run, phase: "done" } };
}
