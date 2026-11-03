/**
 * The backup manifest (docs/STORE-SAAS.md §H.6, PLA-§17; R1 P8 step 9): `DATA_DIR/backups/<day>/manifest.json` holds
 * counts and hashes only, never a value:
 *
 *   { v: 1, day, kind, createdAt, build, tables: [{ name, rows, parts: [{ name, bytes, sha256 }] }] }
 *
 * `backup_runs.manifest` keeps the schema's `BackupManifest` subset ({ v, tables }); a part's key is `name` there and
 * here (the schema type wins over the step brief's `file`). Part files are `<table>.<nnnn>.ndjson.gz.sg`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { BackupManifest } from "@/lib/db/schema";

export const MANIFEST_FILE = "manifest.json";
/** a table name the job writes (and the restore accepts): what platform_backup.tables allows */
export const TABLE_NAME_RE = /^[a-z][a-z0-9_]{1,63}$/;
export const PART_FILE_RE = /^([a-z][a-z0-9_]{1,63})\.(\d{4,6})\.ndjson\.gz\.sg$/;
export const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** `orders.0001.ndjson.gz.sg` */
export function partName(table: string, n: number): string {
  if (!TABLE_NAME_RE.test(table) || !Number.isInteger(n) || n < 1 || n > 999_999) throw new Error("backup: bad part name");
  return `${table}.${String(n).padStart(4, "0")}.ndjson.gz.sg`;
}

/** A real calendar day "YYYY-MM-DD". */
export function isBackupDay(day: unknown): day is string {
  if (typeof day !== "string" || !DAY_RE.test(day)) return false;
  const d = new Date(`${day}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === day;
}

const Part = z.strictObject({ name: z.string().regex(PART_FILE_RE), bytes: z.number().int().min(1), sha256: z.string().regex(/^[0-9a-f]{64}$/) });
const Table = z.strictObject({ name: z.string().regex(TABLE_NAME_RE), rows: z.number().int().min(0), parts: z.array(Part) });

export const BackupManifestFile = z.strictObject({
  v: z.literal(1),
  day: z.string().refine(isBackupDay),
  kind: z.enum(["daily", "weekly"]),
  createdAt: z.iso.datetime(),
  build: z.string().max(64).nullable(),
  tables: z.array(Table),
});
export type BackupManifestFile = z.output<typeof BackupManifestFile>;

/** The file's object from the run's progress. */
export function buildManifest(run: { day: string; kind: "daily" | "weekly" }, progress: BackupManifest, createdAt: Date, build: string | null): BackupManifestFile {
  return BackupManifestFile.parse({ v: 1, day: run.day, kind: run.kind, createdAt: createdAt.toISOString(), build, tables: progress.tables });
}

/** A manifest file's text → its object, or null when it is not one (never throws, never echoes the text). Strict: a key
 * the format does not name (a sample row, say) makes it not a manifest. */
export function parseManifest(text: string): BackupManifestFile | null {
  try {
    const r = BackupManifestFile.safeParse(JSON.parse(text));
    if (!r.success) return null;
    // every part belongs to its own table, once
    const seen = new Set<string>();
    for (const t of r.data.tables) {
      for (const p of t.parts) {
        if (PART_FILE_RE.exec(p.name)?.[1] !== t.name || seen.has(p.name)) return null;
        seen.add(p.name);
      }
    }
    return r.data;
  } catch {
    return null;
  }
}

/** The `backup_runs.manifest` column's subset. */
export function manifestColumn(file: Pick<BackupManifestFile, "tables">): BackupManifest {
  return { v: 1, tables: file.tables.map((t) => ({ name: t.name, rows: t.rows, parts: t.parts.map((p) => ({ name: p.name, bytes: p.bytes, sha256: p.sha256 })) })) };
}

/** The deployed commit (first 12 hex of `qa/.build-sha`, shipped in the archive), else null. */
export function buildId(cwd: string = process.cwd()): string | null {
  try {
    const sha = readFileSync(join(cwd, "qa", ".build-sha"), "utf8").trim();
    return /^[0-9a-f]{40}$/.test(sha) ? sha.slice(0, 12) : null;
  } catch {
    return null;
  }
}
