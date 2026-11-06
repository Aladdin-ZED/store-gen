import "server-only";
/**
 * Logical backups (P8 PLATFORM OPS; docs/STORE-SAAS.md §H.6, OS-10, D34; platform.md PLA Q.25, PLA-§17; §K.2 P0):
 * NDJSON per table slice, gzip, sealed (`backup:v1`), in `DATA_DIR/backups/<YYYY-MM-DD>/`, 7 daily + 4 weekly. The
 * console lists the runs and lets a super_admin download a day (`backups.manage` ↑). Signatures frozen at P0; the
 * bodies are P8 step 9: the job is src/lib/jobs/backup.ts, the file format and restore library ./format.ts,
 * ./seal.ts, ./manifest.ts, ./retention.ts, ./restore.ts.
 *
 * `backup_runs` is a platform table (no store column): nothing here reads store data.
 */
import { lstat } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { backupRuns } from "@/lib/db/schema";
import { dataDir, dataPath } from "@/lib/storage/paths";
import { MANIFEST_FILE, PART_FILE_RE, isBackupDay } from "./manifest";

export interface BackupRunSummary {
  id: string;
  kind: (typeof backupRuns.$inferSelect)["kind"];
  /** YYYY-MM-DD, platform timezone */
  day: string;
  state: (typeof backupRuns.$inferSelect)["state"];
  bytes: number | null;
  /** the manifest's tables and row counts */
  tables: { name: string; rows: number }[];
  startedAt: string;
  doneAt: string | null;
  error: string | null;
}

/** the console's table: the newest runs, pruned ones included (their state says so) */
const LIST_LIMIT = 100;

/** Newest first. */
export async function listBackupRuns(): Promise<BackupRunSummary[]> {
  const rows = await db.select().from(backupRuns).orderBy(desc(backupRuns.day), desc(backupRuns.startedAt)).limit(LIST_LIMIT);
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    day: r.day,
    state: r.state,
    bytes: r.bytes ?? null,
    tables: (Array.isArray(r.manifest?.tables) ? r.manifest.tables : []).map((t) => ({ name: t.name, rows: t.rows })),
    startedAt: r.startedAt.toISOString(),
    doneAt: r.doneAt ? r.doneAt.toISOString() : null,
    error: r.error ?? null,
  }));
}

/**
 * The sealed part files of one day (`path` relative to `DATA_DIR`). Only a `done` run's: `manifest.json` first, then
 * every part its manifest lists, each a regular file inside `DATA_DIR/backups/<day>`. [] for a bad day, no DATA_DIR,
 * a day without a done run, or a part missing on disk (a partial ZIP would not match its manifest).
 */
export async function backupFiles(day: string): Promise<{ name: string; path: string; bytes: number }[]> {
  if (!isBackupDay(day) || !dataDir()) return [];
  const [run] = await db
    .select({ manifest: backupRuns.manifest })
    .from(backupRuns)
    .where(and(eq(backupRuns.day, day), eq(backupRuns.state, "done")))
    .limit(1);
  if (!run) return [];
  const dir = dataPath("backups", null, day);
  const names = [MANIFEST_FILE, ...(run.manifest?.tables ?? []).flatMap((t) => t.parts.map((p) => p.name))];
  const out: { name: string; path: string; bytes: number }[] = [];
  for (const name of names) {
    if (name !== MANIFEST_FILE && !PART_FILE_RE.test(name)) return [];
    const abs = resolve(join(dir, name));
    if (!abs.startsWith(resolve(dir) + sep)) return [];
    const st = await lstat(abs).catch(() => null);
    if (!st || !st.isFile()) return [];
    out.push({ name, path: `backups/${day}/${name}`, bytes: st.size });
  }
  return out;
}
