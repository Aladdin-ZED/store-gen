import "server-only";
/**
 * File mechanics shared by the fs backend (./fs.ts), the boot check (./check.ts) and the disk cache of
 * src/lib/media/store.ts (docs/STORE-SAAS.md §G.1: "fs.ts builds on today's fileRangeStream / copyToDisk / fileSha
 * mechanics"). They moved here unchanged from store.ts, so both layers read and hash files the same way.
 *
 * - `writeFileDurable` creates a new file (never an existing one: `wx`), writes every byte and fsyncs it before it
 *   resolves; `fsyncDir` makes a rename or a new entry durable. Windows cannot fsync a directory: EPERM, EISDIR and
 *   EINVAL are tolerated there only (NTFS journals the metadata itself), never on POSIX.
 * - Every path here is a runtime path under DATA_DIR or the cache: each fs call carries `turbopackIgnore` so the
 *   build never traces the project into the server output (the same reason as store.ts's open()).
 */
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { open, type FileHandle } from "node:fs/promises";

/** bytes read per pull of a range stream */
export const READ_BLOCK = 64 * 1024;

export const sha256hex = (data: Buffer | string) => createHash("sha256").update(data).digest("hex");

/** True when `err` is a Node system error with one of these codes. */
export function isErrno(err: unknown, ...codes: string[]): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === "string" && codes.includes(code);
}

/** Throws unless `data` is exactly the file the row will describe (length, then sha256). */
export function assertBytesMatch(file: { key: string; bytes: number; sha256: string }, data: Buffer): void {
  if (!Buffer.isBuffer(data)) throw new TypeError(`media ${file.key}: data is not a Buffer`);
  if (!Number.isSafeInteger(file.bytes) || file.bytes < 0 || data.length !== file.bytes) throw new Error(`media ${file.key}: ${data.length} bytes, the row says ${file.bytes}`);
  if (!/^[a-f0-9]{64}$/.test(file.sha256) || sha256hex(data) !== file.sha256) throw new Error(`media ${file.key}: sha256 does not match the data`);
}

/** Throws a RangeError unless [start, end] is an inclusive byte range inside a file of `bytes` bytes. */
export function assertRange(bytes: number, start: number, end: number): void {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || end >= bytes) {
    throw new RangeError(`bad byte range ${start}-${end} of ${bytes}`);
  }
}

/** sha256 of a file, streamed; null when it cannot be read. */
export async function fileSha(path: string): Promise<string | null> {
  try {
    const h = createHash("sha256");
    for await (const chunk of createReadStream(/* turbopackIgnore: true */ path)) h.update(chunk as Buffer);
    return h.digest("hex");
  } catch {
    return null;
  }
}

/** Writes `data` to a NEW file (`wx`, `mode`), fsynced before it resolves; a partial file is removed by the caller. */
export async function writeFileDurable(path: string, data: Buffer, mode = 0o600): Promise<void> {
  const fh = await open(/* turbopackIgnore: true */ path, "wx", mode);
  try {
    for (let off = 0; off < data.length; ) {
      const { bytesWritten } = await fh.write(data, off, data.length - off, off);
      off += bytesWritten;
    }
    await fh.sync();
  } finally {
    await fh.close().catch(() => undefined);
  }
}

/** fsync a directory, so a rename or a new entry in it survives a crash (tolerated on win32 only, see the header). */
export async function fsyncDir(dir: string): Promise<void> {
  let fh: FileHandle | null = null;
  try {
    fh = await open(/* turbopackIgnore: true */ dir, "r");
    await fh.sync();
  } catch (err) {
    if (!(process.platform === "win32" && isErrno(err, "EPERM", "EISDIR", "EINVAL"))) throw err;
  } finally {
    await fh?.close().catch(() => undefined);
  }
}

/** Bytes [start, end] of an open file, read on demand (64 KB at a time); the stream closes the handle. */
export function fileRangeStream(fh: FileHandle, start: number, end: number): ReadableStream<Uint8Array> {
  let pos = start;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    fh.close().catch(() => undefined);
  };
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const want = Math.min(READ_BLOCK, end - pos + 1);
        const buf = Buffer.allocUnsafe(want);
        const { bytesRead } = await fh.read(buf, 0, want, pos);
        if (bytesRead <= 0) throw new Error("media file is shorter than expected");
        pos += bytesRead;
        controller.enqueue(new Uint8Array(buf.buffer, buf.byteOffset, bytesRead));
        if (pos > end) {
          close();
          controller.close();
        }
      } catch (err) {
        close();
        controller.error(err);
      }
    },
    cancel() {
      close();
    },
  });
}
