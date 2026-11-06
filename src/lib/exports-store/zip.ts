/**
 * The resumable ZIP writer of the store export (docs/STORE-SAAS.md §F.9, PL-09; R1 P8 step 8).
 *
 *   const parts = await ZipParts.open(dir, cursor.zip);          // null: part 1, a new file
 *   await parts.add("orders.csv", { path: stage }, "deflate", { size });
 *   cursor.zip = parts.state();                                   // saved with the job's cursor, then the next slice
 *   const done = await parts.finish();                            // [{ name: "part-1.zip", bytes, sha256 }, …]
 *
 * - Each part `part-<n>.zip` is a complete archive of its own (its own central directory), at most `limit` bytes
 *   (500 MB): an entry that would not fit starts the next part, unless the part is empty (one larger entry stands
 *   alone; ZIP32 still holds it, entries and parts stay far below 4 GiB, so no ZIP64 is written).
 * - Entries: `store` (method 0) for media, `deflate` (method 8, zlib raw deflate) for text. Each local header is
 *   written with zero CRC and sizes, the data streamed after it, then the CRC-32 and both sizes are patched in place
 *   (no data descriptor, so every reader takes the archive). Names are UTF-8 (general purpose bit 11).
 * - Resumable across ticks: the part's offset and its central-directory records travel in the job's cursor
 *   (`ZipState`, compact keys). Reopening truncates the file to the saved offset, so whatever a dead tick wrote after
 *   its last saved cursor is discarded and redone; a file shorter than the saved offset is a lost part (`part_short`).
 * - CRC-32: node:zlib's `crc32` when the runtime has it (Node ≥ 22.2), else the classic table.
 */
import { createReadStream } from "node:fs";
import { once } from "node:events";
import { open, stat, type FileHandle } from "node:fs/promises";
import { join } from "node:path";
import * as zlib from "node:zlib";

/** §F.9: parts of at most 500 MB */
export const PART_LIMIT_BYTES = 500 * 1024 * 1024;
/** the 16-bit entry count of a ZIP32 directory, with room to spare */
export const MAX_PART_ENTRIES = 65_000;
const ZIP32_MAX = 0xffff_ffff;
const LOCAL_HEAD = 30;
const CENTRAL_HEAD = 46;
const EOCD = 22;
const UTF8_FLAG = 0x0800;

/* ------------------------------------------------------------------ */
/* CRC-32                                                              */
/* ------------------------------------------------------------------ */

const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** CRC-32 (IEEE) by table, continuing from `prev`. */
export function crc32Table(data: Uint8Array, prev = 0): number {
  let c = (prev ^ 0xffff_ffff) >>> 0;
  for (let i = 0; i < data.length; i++) c = TABLE[(c ^ data[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffff_ffff) >>> 0;
}

const nativeCrc = (zlib as unknown as { crc32?: (data: Uint8Array, value?: number) => number }).crc32;

/** CRC-32 continuing from `prev`: node:zlib's when available, else the table. */
export function crc32(data: Uint8Array, prev = 0): number {
  return nativeCrc ? nativeCrc(data, prev) >>> 0 : crc32Table(data, prev);
}

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

/** One central-directory record, as carried in the cursor. */
export interface ZipEntryRec {
  /** name */
  n: string;
  /** CRC-32 */
  c: number;
  /** compressed size */
  z: number;
  /** uncompressed size */
  u: number;
  /** offset of the local header */
  o: number;
  /** method: 0 stored, 8 deflate */
  m: 0 | 8;
  /** DOS time, DOS date */
  t: number;
  d: number;
}

export interface ZipState {
  v: 1;
  /** bytes of the part written so far (where the next local header goes) */
  offset: number;
  entries: ZipEntryRec[];
}

export const emptyZipState = (): ZipState => ({ v: 1, offset: 0, entries: [] });

const u32 = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= ZIP32_MAX;
const u16 = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 0xffff;

/** A cursor's ZipState, or null when it is not one (the job then fails rather than writing a broken archive). */
export function parseZipState(raw: unknown): ZipState | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Partial<ZipState>;
  if (s.v !== 1 || !u32(s.offset) || !Array.isArray(s.entries)) return null;
  const entries: ZipEntryRec[] = [];
  for (const e of s.entries as Partial<ZipEntryRec>[]) {
    if (!e || typeof e.n !== "string" || !e.n || !u32(e.c) || !u32(e.z) || !u32(e.u) || !u32(e.o) || (e.m !== 0 && e.m !== 8) || !u16(e.t) || !u16(e.d)) return null;
    entries.push({ n: e.n, c: e.c, z: e.z, u: e.u, o: e.o, m: e.m, t: e.t, d: e.d });
  }
  return { v: 1, offset: s.offset, entries };
}

/** The DOS time and date of `at` (UTC fields; ZIP has no zone), clamped to 1980-2107. */
export function dosDateTime(at: Date): { time: number; date: number } {
  const ms = Number.isFinite(at.getTime()) ? at.getTime() : Date.UTC(1980, 0, 1);
  const d = new Date(Math.min(Math.max(ms, Date.UTC(1980, 0, 1)), Date.UTC(2107, 11, 31, 23, 59, 58)));
  return {
    time: (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | Math.floor(d.getUTCSeconds() / 2),
    date: ((d.getUTCFullYear() - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate(),
  };
}

/** Thrown when a saved part cannot be resumed (the file is gone or shorter than the cursor says). */
export class ZipResumeError extends Error {
  constructor(readonly code: "part_missing" | "part_short") {
    super(`zip: cannot resume the part (${code})`);
    this.name = "ZipResumeError";
  }
}

/** An entry's bytes: a buffer, a file on disk, or a stream opened when the entry is written. */
export type ZipSource = Uint8Array | { path: string } | { stream: () => Promise<AsyncIterable<Uint8Array>> | AsyncIterable<Uint8Array> };
export type ZipMethod = "store" | "deflate";
export interface AddOptions {
  mtime?: Date;
  /** awaited between chunks of a large entry (the job's `ctx.yield`) */
  yieldFn?: () => Promise<void>;
}

const YIELD_EVERY = 4 * 1024 * 1024;

/** A safe archive path: relative, `/`-separated, no empty, `.` or `..` segment, no backslash or control character. */
export function safeEntryName(name: string): boolean {
  if (typeof name !== "string" || !name || name.length > 512 || name.startsWith("/") || /[\\\u0000-\u001f]/.test(name)) return false;
  return name.split("/").every((s) => s !== "" && s !== "." && s !== "..");
}

async function* chunksOf(src: ZipSource): AsyncIterable<Uint8Array> {
  if (src instanceof Uint8Array) {
    yield src;
    return;
  }
  if ("path" in src) {
    for await (const chunk of createReadStream(/* turbopackIgnore: true */ src.path, { highWaterMark: 256 * 1024 })) yield chunk as Buffer;
    return;
  }
  yield* await src.stream();
}

/* ------------------------------------------------------------------ */
/* One part                                                            */
/* ------------------------------------------------------------------ */

/** One archive file, appended entry by entry, resumable from a `ZipState`. */
export class ZipPartWriter {
  private closed = false;

  private constructor(
    private readonly fh: FileHandle,
    private readonly st: ZipState,
  ) {}

  /** Opens `path` at `state` (truncating anything written after it), or as a new empty part when `state` is null. */
  static async open(path: string, state: ZipState | null): Promise<ZipPartWriter> {
    if (!state || state.offset === 0) {
      const fh = await open(/* turbopackIgnore: true */ path, "w", 0o600);
      return new ZipPartWriter(fh, { v: 1, offset: 0, entries: [] });
    }
    let fh: FileHandle;
    try {
      fh = await open(/* turbopackIgnore: true */ path, "r+");
    } catch (err) {
      if ((err as { code?: string }).code === "ENOENT") throw new ZipResumeError("part_missing");
      throw err;
    }
    const size = (await fh.stat()).size;
    if (size < state.offset) {
      await fh.close().catch(() => undefined);
      throw new ZipResumeError("part_short");
    }
    if (size > state.offset) await fh.truncate(state.offset);
    return new ZipPartWriter(fh, { v: 1, offset: state.offset, entries: state.entries.map((e) => ({ ...e })) });
  }

  /** bytes written so far */
  get bytes(): number {
    return this.st.offset;
  }

  get count(): number {
    return this.st.entries.length;
  }

  /** The size of the central directory and end record if the part were finished now, plus `extraNames` more entries. */
  directoryBytes(...extraNames: string[]): number {
    let n = EOCD;
    for (const e of this.st.entries) n += CENTRAL_HEAD + Buffer.byteLength(e.n, "utf8");
    for (const name of extraNames) n += CENTRAL_HEAD + Buffer.byteLength(name, "utf8");
    return n;
  }

  state(): ZipState {
    return { v: 1, offset: this.st.offset, entries: this.st.entries.map((e) => ({ ...e })) };
  }

  private async writeAt(data: Uint8Array, position: number): Promise<void> {
    for (let off = 0; off < data.length; ) {
      const { bytesWritten } = await this.fh.write(data, off, data.length - off, position + off);
      off += bytesWritten;
    }
  }

  /** Appends one entry. On a throw the state is unchanged (the bytes past the old offset are ignored, then truncated). */
  async add(name: string, src: ZipSource, method: ZipMethod, opts: AddOptions = {}): Promise<ZipEntryRec> {
    if (this.closed) throw new Error("zip: the part is closed");
    if (!safeEntryName(name)) throw new Error("zip: bad entry name");
    if (this.st.entries.some((e) => e.n === name)) throw new Error("zip: duplicate entry name");
    const nameBuf = Buffer.from(name, "utf8");
    const at = this.st.offset;
    const m: 0 | 8 = method === "deflate" ? 8 : 0;
    const { time, date } = dosDateTime(opts.mtime ?? new Date());
    const head = Buffer.alloc(LOCAL_HEAD + nameBuf.length);
    head.writeUInt32LE(0x04034b50, 0);
    head.writeUInt16LE(20, 4); // version needed: 2.0
    head.writeUInt16LE(UTF8_FLAG, 6);
    head.writeUInt16LE(m, 8);
    head.writeUInt16LE(time, 10);
    head.writeUInt16LE(date, 12);
    // CRC-32 (14), compressed (18) and uncompressed (22) sizes: patched once the data is written
    head.writeUInt16LE(nameBuf.length, 26);
    head.writeUInt16LE(0, 28);
    nameBuf.copy(head, LOCAL_HEAD);
    await this.writeAt(head, at);

    let pos = at + head.length;
    let crc = 0;
    let u = 0;
    let z = 0;
    let sinceYield = 0;
    const tick = async (n: number) => {
      sinceYield += n;
      if (opts.yieldFn && sinceYield >= YIELD_EVERY) {
        sinceYield = 0;
        await opts.yieldFn();
      }
    };

    if (m === 0) {
      for await (const chunk of chunksOf(src)) {
        crc = crc32(chunk, crc);
        u += chunk.length;
        await this.writeAt(chunk, pos);
        pos += chunk.length;
        z += chunk.length;
        await tick(chunk.length);
      }
    } else {
      const def = zlib.createDeflateRaw({ level: 6 });
      const drain = (async () => {
        try {
          for await (const out of def as AsyncIterable<Buffer>) {
            await this.writeAt(out, pos);
            pos += out.length;
            z += out.length;
          }
        } catch (err) {
          def.destroy(err as Error);
          throw err;
        }
      })();
      try {
        for await (const chunk of chunksOf(src)) {
          crc = crc32(chunk, crc);
          u += chunk.length;
          if (!def.write(chunk)) await once(def, "drain");
          await tick(chunk.length);
        }
        def.end();
      } catch (err) {
        def.destroy();
        await drain.catch(() => undefined);
        throw err;
      }
      await drain;
    }

    if (u > ZIP32_MAX || z > ZIP32_MAX || pos > ZIP32_MAX) throw new Error("zip: the entry needs ZIP64");
    const patch = Buffer.alloc(12);
    patch.writeUInt32LE(crc >>> 0, 0);
    patch.writeUInt32LE(z, 4);
    patch.writeUInt32LE(u, 8);
    await this.writeAt(patch, at + 14);
    const rec: ZipEntryRec = { n: name, c: crc >>> 0, z, u, o: at, m, t: time, d: date };
    this.st.offset = pos;
    this.st.entries.push(rec);
    return { ...rec };
  }

  /** Writes the central directory and the end record, fsyncs and closes; answers the part's size. */
  async finish(): Promise<number> {
    if (this.closed) throw new Error("zip: the part is closed");
    const records: Buffer[] = [];
    for (const e of this.st.entries) {
      const nb = Buffer.from(e.n, "utf8");
      const b = Buffer.alloc(CENTRAL_HEAD + nb.length);
      b.writeUInt32LE(0x02014b50, 0);
      b.writeUInt16LE(20, 4); // made by: 2.0 (MS-DOS attributes: readers create plain files)
      b.writeUInt16LE(20, 6);
      b.writeUInt16LE(UTF8_FLAG, 8);
      b.writeUInt16LE(e.m, 10);
      b.writeUInt16LE(e.t, 12);
      b.writeUInt16LE(e.d, 14);
      b.writeUInt32LE(e.c, 16);
      b.writeUInt32LE(e.z, 20);
      b.writeUInt32LE(e.u, 24);
      b.writeUInt16LE(nb.length, 28);
      // extra (30), comment (32), disk (34), internal (36), external (38) attributes: 0
      b.writeUInt32LE(e.o, 42);
      nb.copy(b, CENTRAL_HEAD);
      records.push(b);
    }
    const cd = Buffer.concat(records);
    const end = Buffer.alloc(EOCD);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(this.st.entries.length, 8);
    end.writeUInt16LE(this.st.entries.length, 10);
    end.writeUInt32LE(cd.length, 12);
    end.writeUInt32LE(this.st.offset, 16);
    await this.writeAt(cd, this.st.offset);
    await this.writeAt(end, this.st.offset + cd.length);
    const total = this.st.offset + cd.length + end.length;
    await this.fh.truncate(total);
    await this.fh.sync();
    await this.close();
    return total;
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.fh.close().catch(() => undefined);
  }
}

/* ------------------------------------------------------------------ */
/* Parts                                                               */
/* ------------------------------------------------------------------ */

/** A finished part, as `export_jobs.parts` holds it. */
export interface PartInfo {
  name: string;
  bytes: number;
  sha256: string;
}

/** The parts writer's cursor: the part being written (1-based), its zip state, the parts already finished. */
export interface PartsState {
  n: number;
  zip: ZipState;
  done: PartInfo[];
}

export const partFileName = (n: number): string => `part-${n}.zip`;

/** A cursor's PartsState, or null when it is not one. */
export function parsePartsState(raw: unknown): PartsState | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Partial<PartsState>;
  const zip = parseZipState(s.zip);
  if (!zip || typeof s.n !== "number" || !Number.isInteger(s.n) || s.n < 1 || s.n > 9_999 || !Array.isArray(s.done)) return null;
  const done: PartInfo[] = [];
  for (const p of s.done as Partial<PartInfo>[]) {
    if (!p || typeof p.name !== "string" || !u32(p.bytes) || typeof p.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(p.sha256)) return null;
    done.push({ name: p.name, bytes: p.bytes, sha256: p.sha256 });
  }
  if (done.length !== s.n - 1) return null;
  return { n: s.n, zip, done };
}

/** Does an entry of about `size` bytes still fit the current part? (pure; the writer's rule, test:jobs drives it) */
export function fitsPart(p: { bytes: number; count: number; directoryBytes: number }, name: string, size: number, method: ZipMethod, limit: number): boolean {
  if (p.count === 0) return true; // a part takes at least one entry, whatever its size
  if (p.count >= MAX_PART_ENTRIES) return false;
  const nameBytes = Buffer.byteLength(name, "utf8");
  // raw deflate of incompressible data grows by ≤ 5 bytes per 16 KB block, plus a little framing
  const data = method === "deflate" ? size + Math.ceil(size / 16_384) * 5 + 64 : size;
  return p.bytes + LOCAL_HEAD + nameBytes + data + p.directoryBytes + CENTRAL_HEAD + nameBytes <= limit;
}

async function sha256File(path: string): Promise<string> {
  const { createHash } = await import("node:crypto");
  const h = createHash("sha256");
  for await (const chunk of createReadStream(/* turbopackIgnore: true */ path, { highWaterMark: 1024 * 1024 })) h.update(chunk as Buffer);
  return h.digest("hex");
}

/** The export's parts in one folder: entries go to the current part, a full part is finished and the next one begun. */
export class ZipParts {
  private constructor(
    private readonly dir: string,
    private n: number,
    private writer: ZipPartWriter,
    private readonly done: PartInfo[],
    private readonly limit: number,
  ) {}

  /** Resumes from `state` (null: part 1, a new file). `limit` is the part size cap (500 MB; tests pass less). */
  static async open(dir: string, state: PartsState | null, limit: number = PART_LIMIT_BYTES): Promise<ZipParts> {
    const s = state ?? { n: 1, zip: emptyZipState(), done: [] };
    const writer = await ZipPartWriter.open(join(dir, partFileName(s.n)), s.zip);
    return new ZipParts(dir, s.n, writer, s.done.map((p) => ({ ...p })), limit);
  }

  /** the number of the part being written */
  get part(): number {
    return this.n;
  }

  state(): PartsState {
    return { n: this.n, zip: this.writer.state(), done: this.done.map((p) => ({ ...p })) };
  }

  /** How many parts the export has once an entry `name` of about `size` bytes is added (README.txt names the count). */
  partsWith(name: string, size: number, method: ZipMethod): number {
    const w = this.writer;
    return this.n + (fitsPart({ bytes: w.bytes, count: w.count, directoryBytes: w.directoryBytes() }, name, size, method, this.limit) ? 0 : 1);
  }

  /** Adds an entry; `size` (the bytes to be written, when known) decides whether it starts the next part. */
  async add(name: string, src: ZipSource, method: ZipMethod, opts: AddOptions & { size?: number } = {}): Promise<void> {
    let size = opts.size;
    if (size === undefined) size = src instanceof Uint8Array ? src.length : "path" in src ? (await stat(/* turbopackIgnore: true */ src.path)).size : 0;
    const w = this.writer;
    if (!fitsPart({ bytes: w.bytes, count: w.count, directoryBytes: w.directoryBytes() }, name, size, method, this.limit)) await this.roll();
    await this.writer.add(name, src, method, opts);
  }

  private async finishCurrent(): Promise<PartInfo> {
    const name = partFileName(this.n);
    const bytes = await this.writer.finish();
    const info: PartInfo = { name, bytes, sha256: await sha256File(join(this.dir, name)) };
    this.done.push(info);
    return info;
  }

  private async roll(): Promise<void> {
    await this.finishCurrent();
    this.n++;
    this.writer = await ZipPartWriter.open(join(this.dir, partFileName(this.n)), null);
  }

  /** Finishes the current part (an empty one only when it is the first) and answers every part. */
  async finish(): Promise<PartInfo[]> {
    if (this.writer.count > 0 || this.done.length === 0) await this.finishCurrent();
    else await this.writer.close();
    return this.done.map((p) => ({ ...p }));
  }

  async close(): Promise<void> {
    await this.writer.close();
  }
}
