/**
 * Backup part contents (docs/STORE-SAAS.md §H.6; R1 P8 step 9): the NDJSON row encoding, the part buffer and its 8 MB
 * rule, async `node:zlib` gzip, sha256 and the durable file write. No database, no key.
 *
 * One line is one row, a JSON object keyed by column name. The job reads with mysql2's `dateStrings` and
 * `bigNumberStrings` (src/lib/jobs/backup.ts), so dates, DECIMAL and BIGINT values are exact strings; a binary value is
 * `{"$b": base64}` and a JSON column mysql2 parsed is `{"$j": its JSON text}`. `decodeRow` reverses both, so the
 * restore INSERTs exactly what was read.
 */
import { createHash, randomBytes } from "node:crypto";
import { open, rename, unlink } from "node:fs/promises";
import { promisify } from "node:util";
import { gunzip as gunzipCb, gzip as gzipCb } from "node:zlib";

/** a sealed part stays ≤ 8 MiB (§H.6): the raw NDJSON is cut 64 KiB below it, gzip and the envelope add less */
export const PART_MAX_BYTES = 8 * 1024 * 1024;
export const PART_RAW_LIMIT = PART_MAX_BYTES - 64 * 1024;

const gzipAsync = promisify(gzipCb);
const gunzipAsync = promisify(gunzipCb);

export function gzip(data: Buffer): Promise<Buffer> {
  return gzipAsync(data, { level: 6 });
}

export function gunzip(data: Buffer): Promise<Buffer> {
  return gunzipAsync(data);
}

export function sha256Hex(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

/** One column value as it goes into a line. */
export function encodeValue(v: unknown): unknown {
  if (v === undefined) return null;
  if (Buffer.isBuffer(v)) return { $b: v.toString("base64") };
  if (typeof v === "bigint") return v.toString();
  if (v instanceof Date) return v.toISOString(); // never with dateStrings; kept total
  if (v !== null && typeof v === "object") return { $j: JSON.stringify(v) };
  return v;
}

/** The value back for the INSERT: a Buffer for `$b`, the JSON text for `$j`, anything else unchanged. */
export function decodeValue(v: unknown): unknown {
  if (v !== null && typeof v === "object" && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    if (typeof o.$b === "string") return Buffer.from(o.$b, "base64");
    if (typeof o.$j === "string") return o.$j;
  }
  return v;
}

/** A row as one NDJSON line, with its newline. */
export function encodeRow(row: Record<string, unknown>): string {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) out[k] = encodeValue(v);
  return `${JSON.stringify(out)}\n`;
}

/** One line back to its columns and values; throws on a line that is not a JSON object. */
export function decodeRow(line: string): { columns: string[]; values: unknown[] } {
  const parsed: unknown = JSON.parse(line);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("backup: a line is not a row");
  const columns = Object.keys(parsed);
  return { columns, values: columns.map((c) => decodeValue((parsed as Record<string, unknown>)[c])) };
}

/** Whether a line of `lineBytes` still goes into a part holding `partBytes`: always the first line, else within the limit. */
export function fitsPart(partBytes: number, lineBytes: number, limit: number): boolean {
  return partBytes === 0 || partBytes + lineBytes <= limit;
}

/** The rows of the part being built: lines, their bytes, and the primary key of the last row (the cursor once written). */
export class PartBuffer {
  private chunks: Buffer[] = [];
  bytes = 0;
  rows = 0;
  lastKey: unknown[] | null = null;

  /** false when the part must be written before this line (see fitsPart) */
  fits(line: Buffer, limit: number): boolean {
    return fitsPart(this.bytes, line.length, limit);
  }

  push(line: Buffer, key: unknown[]): void {
    this.chunks.push(line);
    this.bytes += line.length;
    this.rows++;
    this.lastKey = key;
  }

  /** the part's NDJSON, the buffer emptied */
  take(): { data: Buffer; rows: number; lastKey: unknown[] | null } {
    const out = { data: Buffer.concat(this.chunks), rows: this.rows, lastKey: this.lastKey };
    this.chunks = [];
    this.bytes = 0;
    this.rows = 0;
    this.lastKey = null;
    return out;
  }
}

/** Splits NDJSON into its non-empty lines. */
export function ndjsonLines(data: Buffer): string[] {
  return data.toString("utf8").split("\n").filter((l) => l.length > 0);
}

/**
 * Writes `data` to `path` durably: a temp file beside it (0600, never an existing one), fsync, then rename over the
 * target, so a reader sees the old file or the whole new one. The temp file is removed on failure.
 */
export async function writeFileDurable(path: string, data: Buffer): Promise<void> {
  const tmp = `${path}.tmp-${randomBytes(6).toString("hex")}`;
  const fh = await open(tmp, "wx", 0o600);
  try {
    await fh.writeFile(data);
    await fh.sync();
  } catch (err) {
    await fh.close().catch(() => undefined);
    await unlink(tmp).catch(() => undefined);
    throw err;
  }
  await fh.close();
  try {
    await rename(tmp, path);
  } catch (err) {
    await unlink(tmp).catch(() => undefined);
    throw err;
  }
}
