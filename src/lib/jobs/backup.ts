import "server-only";
/**
 * The `backup` job (docs/STORE-SAAS.md §H.6, §F.9 SEC-20, §H.2 slot 5; OS-10, R-D52, D34; R1 P8 step 9): daily at
 * 03:30 in the platform zone, sliced and resumable over the following ticks, CPU-bound (the runner halves its budget
 * while the event loop lags, ENGC-11), yielding between slices.
 *
 * One `backup_runs` row per platform day (a Sunday's is the `weekly`, src/lib/backup/retention.ts):
 *   running  `cursor` = the run's table list, purge list and 90-day cutoff (fixed at the start), the table being
 *            written, its last written primary key and next part number; `manifest` = the parts written so far.
 *   done     `DATA_DIR/backups/<day>/<table>.<nnnn>.ndjson.gz.sg` (NDJSON, gzip, one `backup:v1` envelope per part
 *            ≤ 8 MB) and `manifest.json` (counts and sha256 only); nothing else is written there.
 *   failed   an error code (`no_data_dir`, `no_space`, `read_failed`, `seal_failed`, `write_failed`, `cursor_lost`) for
 *            P1's `backup_failed` alarm; the day's folder is removed. A database error is retried twice first.
 *   pruned   the retention calendar dropped it; its folder is deleted.
 *
 * Tables: `platform_backup.tables` (default BACKUP_TABLES) plus the money tables that exist, each in primary key
 * order. `page_versions`: the live versions only; `order_events` and `audit_log`: the last 90 days; `store_settings`
 * as stored (sealed). Every slice of a table with `store_id` (and `stores` by id) leaves out the stores of
 * `purgeRequests`, read fresh when the run starts; an id is dropped once the oldest retained snapshot started after its
 * request (§F.9: deletion complete within one weekly cycle).
 *
 * The whole-table reads below, and the restore target's statements, are the backup's only statements without a store
 * predicate: each is annotated `tenancy: platform` and counted in the `src/lib/jobs/**` pin (CCR r1-p8-4).
 */
import { createHash } from "node:crypto";
import { lstat, mkdir, readdir, rm, unlink } from "node:fs/promises";
import { join } from "node:path";
import { and, asc, eq, inArray } from "drizzle-orm";
import mysql from "mysql2/promise";
import { PART_RAW_LIMIT, PartBuffer, encodeRow, gzip, sha256Hex, writeFileDurable } from "@/lib/backup/format";
import { MANIFEST_FILE, TABLE_NAME_RE, buildId, buildManifest, isBackupDay, manifestColumn, partName } from "@/lib/backup/manifest";
import { assertRestoreTarget, type RestoreTarget } from "@/lib/backup/restore";
import { kindOfDay, purgeIdsToDrop, retentionPlan, type BackupKind } from "@/lib/backup/retention";
import { sealPart } from "@/lib/backup/seal";
import { db, pool } from "@/lib/db/client";
import { newId } from "@/lib/db/ids";
import { platformLock, withNamedLock } from "@/lib/db/locks";
import { backupRuns, type BackupManifest } from "@/lib/db/schema";
import { databaseUrl } from "@/lib/db/url";
import { mediaStorageChecked } from "@/lib/media/storage";
import { getPlatformSetting, setPlatformSetting, type PlatformActor } from "@/lib/settings";
import { BACKUP_TABLES } from "@/lib/settings/keys/platform_backup";
import { dataDir, dataPath } from "@/lib/storage/paths";
import { localClock, platformTimeZone } from "./due";
import { recordError } from "./errors";
import type { JobCtx, JobResult } from "./runner";

export const BACKUP_JOB = "backup";
export const BACKUP_AT = "03:30";
/** §H.6 "plus every R2 money table once it exists": backed up when present (the §F.9 R2 export list's money tables) */
export const MONEY_TABLES = Object.freeze(["product_costs", "ad_spend_daily", "shipments", "remittances", "remittance_lines", "expenses", "agent_earnings", "payouts", "finance_daily"]);
/** §H.6: these keep only the last 90 days (the column the window reads) */
export const RECENT_ONLY: Readonly<Record<string, string>> = Object.freeze({ order_events: "at", audit_log: "created_at" });
export const RECENT_DAYS = 90;
/** rows per slice: small for the tables holding whole documents */
const SLICE_ROWS: Readonly<Record<string, number>> = Object.freeze({ page_versions: 10, pages: 25 });
const DEFAULT_SLICE_ROWS = 500;
/** a slice is not started this close to the deadline (the part flush needs it) */
const FLUSH_MARGIN_MS = 500;
/** database errors retried before the run is failed `read_failed` */
const READ_RETRIES = 2;
/** `platformLock` name the purge (append) and the backup (drop) share for `purgeRequests` */
export const PURGE_REQUESTS_LOCK = "backup.purge";
const SYSTEM_ACTOR: PlatformActor = { id: "system:backup", kind: "system" };

export type BackupFailCode = "no_data_dir" | "no_space" | "read_failed" | "seal_failed" | "write_failed" | "cursor_lost";

/** The tests' forced slices and part size, and the clock. */
export interface BackupRunOpts {
  now?: () => number;
  /** raw NDJSON bytes per part (default PART_RAW_LIMIT, so a sealed part stays ≤ 8 MiB) */
  partLimitBytes?: number;
  /** rows per slice for every table */
  rowsPerSlice?: number;
  /** slices per tick */
  maxSlices?: number;
}

/** `backup_runs.cursor` while running. */
export interface BackupCursor {
  v: 1;
  tables: string[];
  /** store ids left out of every slice */
  purge: string[];
  /** UTC "YYYY-MM-DD HH:MM:SS.mmm": the 90-day window of RECENT_ONLY */
  cutoff: string;
  /** the table being written */
  i: number;
  /** its last written primary key */
  after: (string | number)[] | null;
  /** its next part number */
  part: number;
  /** database errors retried so far */
  fails?: number;
}

type Row = Record<string, unknown>;
/** a query through the pool or a target connection, with exact strings for dates, DECIMAL and BIGINT */
export type SliceQuery = (sql: string, values: unknown[]) => Promise<Row[]>;

export interface TableInfo {
  name: string;
  pk: string[];
  /** the column that names the store: `store_id`, or `id` for `stores`; null for platform tables */
  storeCol: string | null;
  storeNullable: boolean;
}

/** the store ids and the 90-day window a slice applies; null = the whole table (a restored copy) */
export interface SliceFilter {
  purge: readonly string[];
  cutoff: string;
}

const ident = (name: string) => {
  if (!/^[a-z][a-z0-9_]{0,63}$/.test(name)) throw new Error("backup: bad identifier");
  return `\`${name}\``;
};

const utcStamp = (ms: number) => new Date(ms).toISOString().replace("T", " ").slice(0, 23);

/** The app pool's reader (dateStrings, bigNumberStrings: every value read back exactly as stored). */
export const poolSliceQuery: SliceQuery = async (sql, values) => {
  const [rows] = await pool().query({ sql, values, dateStrings: true, supportBigNumbers: true, bigNumberStrings: true });
  return rows as Row[];
};

/** A target connection's reader (the restore's checks). */
export function connSliceQuery(conn: mysql.Connection): SliceQuery {
  return async (sql, values) => {
    const [rows] = await conn.query({ sql, values, dateStrings: true, supportBigNumbers: true, bigNumberStrings: true });
    return rows as Row[];
  };
}

/** Primary key and store column of each existing table of `names` (in this connection's database). */
export async function tableInfo(q: SliceQuery, names: readonly string[]): Promise<Map<string, TableInfo>> {
  const out = new Map<string, TableInfo>();
  const list = [...new Set(names)].filter((n) => TABLE_NAME_RE.test(n));
  if (!list.length) return out;
  const keys = await q(
    "SELECT TABLE_NAME AS t, COLUMN_NAME AS c FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND INDEX_NAME = 'PRIMARY' AND TABLE_NAME IN (?) ORDER BY TABLE_NAME, SEQ_IN_INDEX",
    [list],
  );
  const cols = await q(
    "SELECT TABLE_NAME AS t, COLUMN_NAME AS c, IS_NULLABLE AS n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (?) AND COLUMN_NAME = 'store_id'",
    [list],
  );
  for (const k of keys) {
    const t = String(k.t);
    const info = out.get(t) ?? { name: t, pk: [], storeCol: t === "stores" ? "id" : null, storeNullable: false };
    info.pk.push(String(k.c));
    out.set(t, info);
  }
  for (const c of cols) {
    const info = out.get(String(c.t));
    if (info) {
      info.storeCol = "store_id";
      info.storeNullable = String(c.n) === "YES";
    }
  }
  return out;
}

/**
 * One slice of `table` in primary key order after `after`: SELECT * with the run's filter (purged stores out, the live
 * page versions, the 90-day window) or, with `filter` null, the whole table.
 */
export async function readSlice(q: SliceQuery, info: TableInfo, filter: SliceFilter | null, after: readonly unknown[] | null, limit: number): Promise<Row[]> {
  const where: string[] = [];
  const values: unknown[] = [];
  if (filter) {
    if (info.storeCol && filter.purge.length) {
      const c = ident(info.storeCol);
      where.push(info.storeNullable ? `(${c} IS NULL OR ${c} NOT IN (?))` : `${c} NOT IN (?)`);
      values.push([...filter.purge]);
    }
    if (info.name === "page_versions") where.push("`id` IN (SELECT `published_version_id` FROM `pages` WHERE `published_version_id` IS NOT NULL)");
    const recent = RECENT_ONLY[info.name];
    if (recent) {
      where.push(`${ident(recent)} >= ?`);
      values.push(filter.cutoff);
    }
  }
  if (after && after.length === info.pk.length) {
    // keyset: (a > ?) OR (a = ? AND b > ?) …, written out so the primary key index serves it
    const ors: string[] = [];
    for (let i = 0; i < info.pk.length; i++) {
      const parts = info.pk.slice(0, i).map((c) => `${ident(c)} = ?`);
      parts.push(`${ident(info.pk[i]!)} > ?`);
      ors.push(`(${parts.join(" AND ")})`);
      values.push(...after.slice(0, i + 1));
    }
    where.push(`(${ors.join(" OR ")})`);
  }
  values.push(limit);
  const rows = await q(
    // tenancy: platform the logical backup (§H.6): whole tables of every store in key order, the purged stores left out
    `SELECT * FROM ${ident(info.name)}${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY ${info.pk.map(ident).join(", ")} LIMIT ?`,
    values,
  );
  return rows;
}

/** Row count and sha256 of a table's NDJSON lines in key order (the restore check compares a source and its copy). */
export async function tableDigest(q: SliceQuery, table: string, filter: SliceFilter | null, sliceRows = 500): Promise<{ rows: number; sha256: string } | null> {
  const info = (await tableInfo(q, [table])).get(table);
  if (!info || !info.pk.length) return null;
  const h = createHash("sha256");
  let rows = 0;
  let after: unknown[] | null = null;
  for (;;) {
    const slice = await readSlice(q, info, filter, after, sliceRows);
    for (const r of slice) h.update(encodeRow(r));
    rows += slice.length;
    if (slice.length < sliceRows) break;
    after = info.pk.map((c) => slice[slice.length - 1]![c]);
  }
  return { rows, sha256: h.digest("hex") };
}

/* ------------------------------------------------------------------ */
/* runs                                                                 */
/* ------------------------------------------------------------------ */

type RunRow = typeof backupRuns.$inferSelect;

export function backupDir(day: string): string {
  if (!isBackupDay(day)) throw new Error("backup: bad day");
  return dataPath("backups", null, day);
}

function parseCursor(raw: unknown): BackupCursor | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Partial<BackupCursor>;
  const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");
  if (c.v !== 1 || !strings(c.tables) || !strings(c.purge) || typeof c.cutoff !== "string") return null;
  if (!Number.isInteger(c.i) || c.i! < 0 || c.i! > c.tables.length || !Number.isInteger(c.part) || c.part! < 1) return null;
  if (c.after !== null && !(Array.isArray(c.after) && c.after.every((x) => typeof x === "string" || typeof x === "number"))) return null;
  if (c.tables.some((t) => !TABLE_NAME_RE.test(t))) return null;
  return { v: 1, tables: c.tables, purge: c.purge, cutoff: c.cutoff, i: c.i!, after: c.after ?? null, part: c.part!, fails: typeof c.fails === "number" ? c.fails : 0 };
}

/** The tables of a new run: the setting's (deduped) plus the money tables, those that exist with a primary key. */
async function runTables(): Promise<{ tables: string[]; skipped: number }> {
  const setting = await getPlatformSetting("platform_backup", { fresh: true });
  const wanted = [...new Set([...(setting.tables.length ? setting.tables : BACKUP_TABLES), ...MONEY_TABLES])];
  const info = await tableInfo(poolSliceQuery, wanted);
  const tables = wanted.filter((t) => (info.get(t)?.pk.length ?? 0) > 0);
  // a configured table that is missing (or keyless) is skipped and counted; a money table that does not exist yet is not
  const skipped = wanted.filter((t) => !tables.includes(t) && !MONEY_TABLES.includes(t)).length;
  return { tables, skipped };
}

async function runOfDay(day: string): Promise<RunRow | null> {
  const [row] = await db.select().from(backupRuns).where(eq(backupRuns.day, day)).limit(1);
  return row ?? null;
}

async function oldestRunning(): Promise<RunRow | null> {
  const [row] = await db.select().from(backupRuns).where(eq(backupRuns.state, "running")).orderBy(asc(backupRuns.day)).limit(1);
  return row ?? null;
}

/** A new row for `day` (INSERT IGNORE on (kind, day)); null when one exists already. */
async function insertRun(day: string, at: Date, fields: Partial<RunRow>): Promise<RunRow | null> {
  const kind: BackupKind = kindOfDay(day);
  const id = newId();
  const [res] = await db
    .insert(backupRuns)
    .ignore()
    .values({ id, kind, day, state: "running", startedAt: at, ...fields });
  if (!(res as { affectedRows?: number }).affectedRows) return null;
  const [row] = await db.select().from(backupRuns).where(eq(backupRuns.id, id)).limit(1);
  return row ?? null;
}

/**
 * A new run. The purge list is read under the lock appendPurgeRequest writes it under, with the run's start taken in
 * the same hold: a request stamped before the start is in the list (so this run filters it), one stamped after it
 * is not, and dropPurgedStores never drops an id on the strength of a run that did not filter it.
 */
async function startRun(day: string, nowMs: () => number): Promise<RunRow | null> {
  const { tables } = await runTables();
  const r = await withNamedLock(platformLock(PURGE_REQUESTS_LOCK), 5, async () => {
    const startMs = nowMs();
    const setting = await getPlatformSetting("platform_backup", { fresh: true });
    return { startMs, purge: setting.purgeRequests.map((q) => q.storeId) };
  });
  if (!r.ran) return null;
  const { startMs, purge } = r.value;
  const cursor: BackupCursor = { v: 1, tables, purge, cutoff: utcStamp(startMs - RECENT_DAYS * 86_400_000), i: 0, after: null, part: 1, fails: 0 };
  const manifest: BackupManifest = { v: 1, tables: [] };
  return insertRun(day, new Date(startMs), { cursor: cursor as unknown as Record<string, unknown>, manifest, bytes: 0 });
}

/** Removes everything in the day's folder that is neither a manifest part nor the manifest (temp files, old rewrites). */
async function removeStrays(dir: string, keep: ReadonlySet<string>): Promise<number> {
  let n = 0;
  for (const name of await readdir(dir).catch(() => [] as string[])) {
    if (keep.has(name)) continue;
    const st = await lstat(join(dir, name)).catch(() => null);
    if (st && (st.isFile() || st.isSymbolicLink())) {
      await unlink(join(dir, name)).catch(() => undefined);
      n++;
    }
  }
  return n;
}

async function failRun(run: RunRow, code: BackupFailCode, nowMs: number, err?: unknown): Promise<void> {
  await db.update(backupRuns).set({ state: "failed", error: code, cursor: null, doneAt: new Date(nowMs) }).where(and(eq(backupRuns.id, run.id), eq(backupRuns.state, "running")));
  if (dataDir() && isBackupDay(run.day)) await rm(backupDir(run.day), { recursive: true, force: true }).catch(() => undefined);
  recordError("backup", err ?? new Error(code), { code: `backup_${code}` });
}

function failCode(stage: "read" | "seal" | "write", err: unknown): BackupFailCode {
  const code = (err as { code?: unknown } | null)?.code;
  if (code === "ENOSPC" || code === "EDQUOT") return "no_space";
  return stage === "seal" ? "seal_failed" : stage === "write" ? "write_failed" : "read_failed";
}

interface WorkResult {
  state: "running" | "done" | "failed";
  slices: number;
  rows: number;
  parts: number;
  error?: BackupFailCode;
}

/** Slices of one run until the deadline (or `maxSlices`): parts written, the cursor saved after each. */
async function workRun(ctx: JobCtx, run: RunRow, opts: BackupRunOpts, nowMs: () => number): Promise<WorkResult> {
  const cursor = parseCursor(run.cursor);
  if (!cursor) {
    await failRun(run, "cursor_lost", nowMs());
    return { state: "failed", slices: 0, rows: 0, parts: 0, error: "cursor_lost" };
  }
  const progress: BackupManifest = run.manifest && Array.isArray(run.manifest.tables) ? { v: 1, tables: run.manifest.tables.map((t) => ({ ...t, parts: [...t.parts] })) } : { v: 1, tables: [] };
  let bytes = run.bytes ?? 0;
  const dir = backupDir(run.day);
  const limit = Math.max(1, opts.partLimitBytes ?? PART_RAW_LIMIT);
  const maxSlices = opts.maxSlices ?? Number.POSITIVE_INFINITY;
  const buf = new PartBuffer();
  const res: WorkResult = { state: "running", slices: 0, rows: 0, parts: 0 };
  let stage: "read" | "seal" | "write" = "write";

  const save = async () => {
    stage = "read";
    await db
      .update(backupRuns)
      .set({ cursor: cursor as unknown as Record<string, unknown>, manifest: progress, bytes })
      .where(and(eq(backupRuns.id, run.id), eq(backupRuns.state, "running")));
  };

  try {
    await mkdir(dir, { recursive: true, mode: 0o700 });
    stage = "read";
    const info = await tableInfo(poolSliceQuery, cursor.tables);
    const filter: SliceFilter = { purge: cursor.purge, cutoff: cursor.cutoff };

    while (cursor.i < cursor.tables.length) {
      const table = cursor.tables[cursor.i]!;
      const ti = info.get(table);
      let entry = progress.tables.find((t) => t.name === table);
      if (!entry) {
        entry = { name: table, rows: 0, parts: [] };
        progress.tables.push(entry);
      }
      const flush = async () => {
        if (!buf.rows) return;
        const { data, rows, lastKey } = buf.take();
        stage = "seal";
        const sealed = sealPart(await gzip(data));
        stage = "write";
        const name = partName(table, cursor.part);
        await writeFileDurable(join(dir, name), sealed);
        entry!.parts.push({ name, bytes: sealed.length, sha256: sha256Hex(sealed) });
        entry!.rows += rows;
        bytes += sealed.length;
        cursor.after = lastKey as (string | number)[] | null;
        cursor.part++;
        res.parts++;
        await save();
      };

      let tableDone = !ti || !ti.pk.length; // dropped since the run started: recorded with what it has (0 rows)
      let readAfter: unknown[] | null = cursor.after;
      while (!tableDone) {
        if (res.slices >= maxSlices || Date.now() >= ctx.deadline - FLUSH_MARGIN_MS) break;
        stage = "read";
        const size = Math.max(1, opts.rowsPerSlice ?? SLICE_ROWS[table] ?? DEFAULT_SLICE_ROWS);
        const rows = await readSlice(poolSliceQuery, ti!, filter, readAfter, size);
        res.slices++;
        for (const row of rows) {
          const line = Buffer.from(encodeRow(row), "utf8");
          if (!buf.fits(line, limit)) await flush();
          buf.push(line, ti!.pk.map((c) => row[c]));
        }
        res.rows += rows.length;
        if (rows.length) readAfter = ti!.pk.map((c) => rows[rows.length - 1]![c]);
        if (rows.length < size) tableDone = true;
        await ctx.yield();
      }
      await flush(); // a tick never ends with rows only in memory: the partial part is written and the cursor saved
      if (!tableDone) return res;
      cursor.i++;
      cursor.after = null;
      cursor.part = 1;
      cursor.fails = 0;
      await save();
    }

    // every table written: the manifest, then the row
    stage = "write";
    const file = buildManifest({ day: run.day, kind: run.kind }, progress, new Date(nowMs()), buildId());
    const text = Buffer.from(`${JSON.stringify(file, null, 2)}\n`, "utf8");
    await writeFileDurable(join(dir, MANIFEST_FILE), text);
    await removeStrays(dir, new Set([MANIFEST_FILE, ...file.tables.flatMap((t) => t.parts.map((p) => p.name))]));
    stage = "read";
    await db
      .update(backupRuns)
      .set({ state: "done", cursor: null, manifest: manifestColumn(file), bytes: bytes + text.length, doneAt: new Date(nowMs()), error: null })
      .where(and(eq(backupRuns.id, run.id), eq(backupRuns.state, "running")));
    res.state = "done";
    return res;
  } catch (err) {
    const code = failCode(stage, err);
    if (code === "read_failed" && (cursor.fails ?? 0) < READ_RETRIES) {
      // a database error: the runner retries at the next tick from the saved cursor
      cursor.fails = (cursor.fails ?? 0) + 1;
      await db
        .update(backupRuns)
        .set({ cursor: cursor as unknown as Record<string, unknown> })
        .where(and(eq(backupRuns.id, run.id), eq(backupRuns.state, "running")))
        .catch(() => undefined);
      throw err;
    }
    await failRun(run, code, nowMs(), err);
    return { ...res, state: "failed", error: code };
  }
}

/* ------------------------------------------------------------------ */
/* retention and purgeRequests                                          */
/* ------------------------------------------------------------------ */

/** Applies the retention calendar: pruned runs' folders deleted and their rows marked. Returns the pruned ids. */
export async function pruneBackups(): Promise<string[]> {
  const setting = await getPlatformSetting("platform_backup", { fresh: true });
  const runs = await db
    .select({ id: backupRuns.id, day: backupRuns.day, kind: backupRuns.kind, state: backupRuns.state })
    .from(backupRuns)
    .where(inArray(backupRuns.state, ["done", "failed"]));
  const { prune } = retentionPlan(runs, setting.retention);
  for (const id of prune) {
    const run = runs.find((r) => r.id === id)!;
    if (dataDir() && isBackupDay(run.day)) await rm(backupDir(run.day), { recursive: true, force: true });
    await db.update(backupRuns).set({ state: "pruned", cursor: null }).where(and(eq(backupRuns.id, id), inArray(backupRuns.state, ["done", "failed"])));
  }
  return prune;
}

/** Drops the purged store ids no retained snapshot can hold any more (§F.9 SEC-20). Returns the dropped ids. */
export async function dropPurgedStores(): Promise<string[]> {
  const first = await getPlatformSetting("platform_backup", { fresh: true });
  if (!first.purgeRequests.length) return [];
  const retained = await db.select({ startedAt: backupRuns.startedAt }).from(backupRuns).where(inArray(backupRuns.state, ["done", "running"]));
  const starts = retained.map((r) => ({ startedAt: r.startedAt.toISOString() }));
  if (!purgeIdsToDrop(first.purgeRequests, starts).length) return [];
  const r = await withNamedLock(platformLock(PURGE_REQUESTS_LOCK), 5, async () => {
    const cur = await getPlatformSetting("platform_backup", { fresh: true });
    const drop = new Set(purgeIdsToDrop(cur.purgeRequests, starts));
    if (!drop.size) return [];
    await setPlatformSetting("platform_backup", { ...cur, purgeRequests: cur.purgeRequests.filter((q) => !drop.has(q.storeId)) }, SYSTEM_ACTOR);
    return [...drop];
  });
  return r.ran ? r.value : [];
}

/**
 * The purge's side (P8 step 10): appends a store id to `purgeRequests` under the lock startRun reads it under, stamped
 * inside the hold (see startRun); false when the lock was not acquired. A repeated id keeps one entry, re-stamped.
 */
export async function appendPurgeRequest(storeId: string, now: () => number = Date.now): Promise<boolean> {
  const r = await withNamedLock(platformLock(PURGE_REQUESTS_LOCK), 5, async () => {
    const at = new Date(now()).toISOString();
    const cur = await getPlatformSetting("platform_backup", { fresh: true });
    const rest = cur.purgeRequests.filter((q) => q.storeId !== storeId);
    await setPlatformSetting("platform_backup", { ...cur, purgeRequests: [...rest, { storeId, at }] }, SYSTEM_ACTOR);
  });
  return r.ran;
}

/* ------------------------------------------------------------------ */
/* the job                                                              */
/* ------------------------------------------------------------------ */

/**
 * The registered body. A running run (whatever its day) carries on first; else today's run starts unless today has one.
 * After a run ends: pruning and the purgeRequests drop. Done once today's row exists and is no longer running.
 */
export async function backupJob(ctx: JobCtx, opts: BackupRunOpts = {}): Promise<JobResult> {
  const nowMs = opts.now ?? Date.now;
  const today = localClock(nowMs(), platformTimeZone()).day;

  const verdict = dataDir() ? await mediaStorageChecked() : null;
  if (!dataDir() || (verdict && !verdict.ok && verdict.variable !== "MEDIA_DIR")) {
    const row = await insertRun(today, new Date(nowMs()), { state: "failed", error: "no_data_dir", doneAt: new Date(nowMs()) });
    if (row) recordError("backup", new Error("no_data_dir"), { code: "backup_no_data_dir" });
    return { done: true, summary: { day: today, state: "failed", error: "no_data_dir" }, ...(row ? { errorCode: "backup_no_data_dir" } : {}) };
  }

  let run = await oldestRunning();
  if (!run) {
    if (await runOfDay(today)) {
      const pruned = await pruneBackups();
      const dropped = await dropPurgedStores();
      return { done: true, summary: { day: today, idle: true, pruned: pruned.length, purgeDropped: dropped.length } };
    }
    run = await startRun(today, nowMs);
    if (!run) return { done: false, summary: { day: today, raced: true } };
  }

  const r = await workRun(ctx, run, opts, nowMs);
  const summary: Record<string, number | string | boolean> = { day: run.day, state: r.state, slices: r.slices, rows: r.rows, parts: r.parts };
  if (r.state === "running") return { done: false, processed: r.rows, summary };
  summary.pruned = (await pruneBackups()).length;
  summary.purgeDropped = (await dropPurgedStores()).length;
  if (r.error) summary.error = r.error;
  const todays = run.day === today ? true : !!(await runOfDay(today));
  return { done: todays, processed: r.rows, summary, ...(r.error ? { errorCode: `backup_${r.error}` } : {}) };
}

/* ------------------------------------------------------------------ */
/* the restore target (the drill and test:storage)                      */
/* ------------------------------------------------------------------ */

/** RestoreTarget over a connection to the target database (FOREIGN_KEY_CHECKS off on it). */
export function sqlRestoreTarget(conn: mysql.Connection): RestoreTarget {
  return {
    async reset(table) {
      // tenancy: platform a restore into its own throwaway database empties the whole table before its rows (§H.6)
      await conn.query(`DELETE FROM ${ident(table)}`);
    },
    async insert(table, columns, rows) {
      // tenancy: platform a restore writes back every store's rows of the backup into its own database (§H.6)
      await conn.query(`INSERT INTO ${ident(table)} (${columns.map(ident).join(", ")}) VALUES ?`, [rows]);
    },
  };
}

/**
 * A connection to `dbName` on the server of DATABASE_URL, for a restore: `cod_test_*` only unless `manual` (the owner's
 * own import), never the app's own database. UTC, foreign key checks off.
 */
export async function openRestoreConnection(dbName: string, opts: { manual?: boolean } = {}): Promise<mysql.Connection> {
  const url = databaseUrl();
  if (!url) throw new Error("DATABASE_URL is not set");
  const u = new URL(url);
  const own = decodeURIComponent(u.pathname.replace(/^\//, ""));
  assertRestoreTarget(dbName, { manual: opts.manual, deny: [own, "cod_studio", "cod_storegen"] });
  u.pathname = `/${dbName}`;
  const conn = await mysql.createConnection({ uri: u.toString(), charset: "utf8mb4_unicode_ci", timezone: "Z", supportBigNumbers: true, bigNumberStrings: true, dateStrings: true });
  await conn.query("SET time_zone = '+00:00'");
  await conn.query("SET FOREIGN_KEY_CHECKS = 0");
  return conn;
}
