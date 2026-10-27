import "server-only";
/**
 * Logical backups (P8 PLATFORM OPS; docs/STORE-SAAS.md §H.6, OS-10, D34; platform.md PLA Q.25, PLA-§17; §K.2 P0):
 * NDJSON per table slice, gzip, sealed (`backup:v1`), in `DATA_DIR/backups/<YYYY-MM-DD>/`, 7 daily + 4 weekly. The
 * console lists the runs and lets a super_admin download a day (`backups.manage` ↑). Typed stubs frozen at P0.
 */
import type { backupRuns } from "@/lib/db/schema";

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

/** Newest first. */
export async function listBackupRuns(): Promise<BackupRunSummary[]> {
  throw new Error("not implemented: P8 listBackupRuns");
}

/** The sealed part files of one day (`path` relative to `DATA_DIR`). */
export async function backupFiles(day: string): Promise<{ name: string; path: string; bytes: number }[]> {
  void day;
  throw new Error("not implemented: P8 backupFiles");
}
