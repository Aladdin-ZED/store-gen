/**
 * The restore library (docs/STORE-SAAS.md §H.6, R1 exit criterion 6; R1 P8 step 9): a backup day's folder into a target
 * database. R1's restore is a documented manual procedure (HANDOFF, CCR r1-p8-16): the drill
 * `npx tsx scripts/qa/storage-check.ts --restore-drill <day> --db cod_test_restore_<x>` drives this file.
 *
 *   1. read and validate `manifest.json`;
 *   2. verify every part first (present, its byte count, its sha256): one bad part and nothing is written;
 *   3. per table: the target's rows are emptied, then each part is checked again, opened (`backup:v1`), gunzipped, its
 *      NDJSON parsed and INSERTed in batches; the restored count must equal the manifest's.
 *
 * The SQL lives with the job's other cross-store statements (`sqlRestoreTarget`, src/lib/jobs/backup.ts); this file
 * only hands it rows. Errors carry a code, a table and a file name, never a value: nothing here prints a row.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { decodeRow, gunzip, ndjsonLines, sha256Hex } from "./format";
import { MANIFEST_FILE, parseManifest, type BackupManifestFile } from "./manifest";
import { openPart } from "./seal";

/** the only database names a restore writes into without the explicit manual flag */
export const RESTORE_DB_RE = /^cod_test_[a-z0-9_]{1,48}$/;
const ANY_DB_RE = /^[A-Za-z0-9_]{1,64}$/;

export type RestoreCode = "target_refused" | "no_manifest" | "bad_manifest" | "missing_part" | "checksum" | "open_failed" | "bad_line" | "row_count";

export class RestoreError extends Error {
  constructor(
    readonly code: RestoreCode,
    readonly table: string | null = null,
    readonly file: string | null = null,
  ) {
    super(`restore: ${code}${table ? ` (${table}${file ? `, ${file}` : ""})` : file ? ` (${file})` : ""}`);
    this.name = "RestoreError";
  }
}

/**
 * Throws `target_refused` unless `name` is a throwaway `cod_test_*` database; `manual: true` (the owner's own import,
 * never a test) accepts any plain database name. The app's own databases are refused either way when named in `deny`.
 */
export function assertRestoreTarget(name: string, opts: { manual?: boolean; deny?: readonly string[] } = {}): void {
  const ok = opts.manual ? ANY_DB_RE.test(name) : RESTORE_DB_RE.test(name);
  if (!ok || (opts.deny ?? []).includes(name)) throw new RestoreError("target_refused");
}

/** Where the rows go: one table emptied before its rows, then batches of rows with one column list each. */
export interface RestoreTarget {
  reset(table: string): Promise<void>;
  insert(table: string, columns: string[], rows: unknown[][]): Promise<void>;
}

export async function readBackupManifest(dir: string): Promise<BackupManifestFile> {
  let text: string;
  try {
    text = await readFile(join(dir, MANIFEST_FILE), "utf8");
  } catch {
    throw new RestoreError("no_manifest");
  }
  const m = parseManifest(text);
  if (!m) throw new RestoreError("bad_manifest");
  return m;
}

async function readPart(dir: string, table: string, part: { name: string; bytes: number; sha256: string }): Promise<Buffer> {
  let buf: Buffer;
  try {
    buf = await readFile(join(dir, part.name));
  } catch {
    throw new RestoreError("missing_part", table, part.name);
  }
  if (buf.length !== part.bytes || sha256Hex(buf) !== part.sha256) throw new RestoreError("checksum", table, part.name);
  return buf;
}

/** Every part present with the manifest's size and sha256 (PLA-§17: "the manifest checksums match the files"). */
export async function verifyBackupDir(dir: string, manifest?: BackupManifestFile): Promise<BackupManifestFile> {
  const m = manifest ?? (await readBackupManifest(dir));
  for (const t of m.tables) for (const p of t.parts) await readPart(dir, t.name, p);
  return m;
}

export interface RestoreOpts {
  /** only these tables (default: every table of the manifest) */
  tables?: readonly string[];
  /** rows per INSERT (default 200; also cut at 4 MB of line text) */
  batchRows?: number;
  /** after each table, with its restored row count */
  onTable?(name: string, rows: number): void;
}

/** Verifies, then restores. Returns each table's restored row count (equal to the manifest's, or it threw). */
export async function restoreBackupDir(dir: string, target: RestoreTarget, opts: RestoreOpts = {}): Promise<{ day: string; tables: { name: string; rows: number }[] }> {
  const manifest = await verifyBackupDir(dir);
  const only = opts.tables ? new Set(opts.tables) : null;
  const batchRows = Math.max(1, Math.min(5_000, opts.batchRows ?? 200));
  const out: { name: string; rows: number }[] = [];
  for (const t of manifest.tables) {
    if (only && !only.has(t.name)) continue;
    await target.reset(t.name);
    let restored = 0;
    let cols: string[] | null = null;
    let colsKey = "";
    let batch: unknown[][] = [];
    let batchBytes = 0;
    const flush = async () => {
      if (cols && batch.length) await target.insert(t.name, cols, batch);
      batch = [];
      batchBytes = 0;
    };
    for (const p of t.parts) {
      const sealed = await readPart(dir, t.name, p); // checked again: the file may have changed since the first pass
      let lines: string[];
      try {
        lines = ndjsonLines(await gunzip(openPart(sealed)));
      } catch {
        throw new RestoreError("open_failed", t.name, p.name);
      }
      for (const line of lines) {
        let row: { columns: string[]; values: unknown[] };
        try {
          row = decodeRow(line);
        } catch {
          throw new RestoreError("bad_line", t.name, p.name);
        }
        const key = row.columns.join("\u0000");
        if (key !== colsKey || batch.length >= batchRows || batchBytes + line.length > 4 * 1024 * 1024) {
          await flush();
          cols = row.columns;
          colsKey = key;
        }
        batch.push(row.values);
        batchBytes += line.length;
        restored++;
      }
    }
    await flush();
    if (restored !== t.rows) throw new RestoreError("row_count", t.name);
    opts.onTable?.(t.name, restored);
    out.push({ name: t.name, rows: restored });
  }
  return { day: manifest.day, tables: out };
}
