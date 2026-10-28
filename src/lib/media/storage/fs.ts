import "server-only";
/**
 * The filesystem media backend (docs/STORE-SAAS.md §G.1, §G.2; OS-07, R-D11, D22; rev 3 ENGC-20):
 *
 *   DATA_DIR/media/v1/<storeId[0..1]>/<storeId>/<key[0..1]>/<key>     dirs 0700, files 0600 (MEDIA_DIR replaces DATA_DIR/media)
 *   DATA_DIR/media/tmp/<random>                                        temp files, same file system, so the rename is atomic
 *
 * - `put` is durable and idempotent: the bytes must be the row's (length, sha256); when the target already holds the
 *   same sha256 it resolves at once (a crash between the file and the DB row never blocks the retry); otherwise it
 *   writes a temp file (0600) and fsyncs it, creates the shard folders (0700), renames over the target and fsyncs the
 *   folders it changed. Windows cannot fsync a folder (./io.ts).
 * - `readAll` (≤ 8 MB) and `readFsFile` check the length and the sha256 against the row; `readRange` checks the
 *   length (the bytes were hashed at `put`), opens the file first so a missing one fails before any byte is sent, and
 *   streams through the shared `fileRangeStream`. A file that is not the row's throws `StoredFileError`.
 * - `remove` is idempotent and prunes the folders it emptied (key shard, store, store shard; never `v1`).
 * - `head(key)` finds the store through the key's row (src/lib/media/store.ts's cached metadata): the layout needs it.
 * - `usage()` is the last complete walk snapshot (`cron_cursors` row `storage.walk`, P8 step 7), else zeros; free
 *   bytes are measured against DATA_DIR_BUDGET_BYTES, never `statfs` (§G.2).
 *
 * Every path is built by `mediaFilePath` (src/lib/storage/paths.ts), which refuses a bad store id or key before any
 * file call.
 */
import { randomBytes } from "node:crypto";
import { mkdir, open, readFile, rename, rmdir, stat, unlink, type FileHandle } from "node:fs/promises";
import { dirname, join } from "node:path";
import { budgetBytes, readWalkSnapshot, WALK_JOB } from "@/lib/storage/walk";
import { mediaFilePath, mediaTmpDir } from "@/lib/storage/paths";
import { assertBytesMatch, assertRange, fileRangeStream, fileSha, fsyncDir, isErrno, sha256hex, writeFileDurable } from "./io";
import { MAX_READ_ALL, StoredFileError, type MediaStorage, type StoredFile } from "./types";

/** a rename over a file a reader holds open fails on Windows: retried this often, this far apart */
const WIN_RENAME_RETRIES = 3;
const WIN_RENAME_WAIT_MS = 25;

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The target holds exactly these bytes (size first, then the streamed sha256). */
async function holds(path: string, file: { bytes: number; sha256: string }): Promise<boolean> {
  const st = await stat(/* turbopackIgnore: true */ path).catch(() => null);
  if (!st?.isFile() || st.size !== file.bytes) return false;
  return (await fileSha(path)) === file.sha256;
}

async function renameOver(from: string, to: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(/* turbopackIgnore: true */ from, to);
      return;
    } catch (err) {
      if (process.platform !== "win32" || attempt >= WIN_RENAME_RETRIES || !isErrno(err, "EPERM", "EBUSY", "EACCES")) throw err;
      await pause(WIN_RENAME_WAIT_MS * (attempt + 1));
    }
  }
}

/** fsync `dir` and every folder `mkdir` created above it (their new entries), up to the parent of the first one. */
async function fsyncChain(dir: string, firstCreated: string | undefined): Promise<void> {
  await fsyncDir(dir);
  if (!firstCreated) return;
  const stop = dirname(firstCreated);
  for (let p = dirname(dir); p.length >= stop.length; p = dirname(p)) {
    await fsyncDir(p);
    if (p === stop || dirname(p) === p) break;
  }
}

async function put(file: Omit<StoredFile, "storage">, data: Buffer): Promise<void> {
  assertBytesMatch(file, data);
  const target = mediaFilePath(file.storeId, file.key);
  if (await holds(target, file)) return; // ENGC-20: the same bytes are already there
  const tmpDir = mediaTmpDir();
  if (!tmpDir) throw new Error("storage: no media root (DATA_DIR / MEDIA_DIR)");
  await mkdir(/* turbopackIgnore: true */ tmpDir, { recursive: true, mode: 0o700 });
  const tmp = join(tmpDir, randomBytes(16).toString("hex"));
  try {
    await writeFileDurable(tmp, data, 0o600);
    const dir = dirname(target);
    for (let attempt = 0; ; attempt++) {
      const created = await mkdir(/* turbopackIgnore: true */ dir, { recursive: true, mode: 0o700 });
      try {
        await renameOver(tmp, target);
        await fsyncChain(dir, created);
        return;
      } catch (err) {
        // a concurrent remove() pruned the folder between mkdir and rename: create it again, once
        if (attempt === 0 && isErrno(err, "ENOENT")) continue;
        throw err;
      }
    }
  } finally {
    await unlink(/* turbopackIgnore: true */ tmp).catch(() => undefined); // gone after a rename; a leftover otherwise
  }
}

async function head(key: string): Promise<StoredFile | null> {
  // the row locates the file (store id) and describes it; lazy: store.ts reads fs rows through this module
  const { getMediaMeta } = await import("@/lib/media/store");
  const meta = await getMediaMeta(key);
  if (!meta) return null;
  const st = await stat(/* turbopackIgnore: true */ mediaFilePath(meta.storeId, meta.key)).catch(() => null);
  if (!st?.isFile() || st.size !== meta.bytes) return null;
  return { storeId: meta.storeId, key: meta.key, assetId: meta.assetId, mime: meta.mime, bytes: meta.bytes, sha256: meta.sha256, storage: "fs" };
}

/** The whole file, checked against its row (length, sha256); `StoredFileError` when it is missing or differs. */
export async function readFsFile(meta: Pick<StoredFile, "storeId" | "key" | "bytes" | "sha256">): Promise<Buffer> {
  let data: Buffer;
  try {
    data = await readFile(/* turbopackIgnore: true */ mediaFilePath(meta.storeId, meta.key));
  } catch (err) {
    if (isErrno(err, "ENOENT", "ENOTDIR")) throw new StoredFileError("missing", meta.key);
    throw err;
  }
  if (data.length !== meta.bytes || sha256hex(data) !== meta.sha256) throw new StoredFileError("mismatch", meta.key);
  return data;
}

async function readAll(meta: StoredFile): Promise<Buffer> {
  if (meta.bytes > MAX_READ_ALL) throw new RangeError(`media ${meta.key}: readAll is for files up to 8 MB`);
  return readFsFile(meta);
}

async function readRange(meta: StoredFile, start: number, end: number): Promise<ReadableStream<Uint8Array>> {
  assertRange(meta.bytes, start, end);
  let fh: FileHandle;
  try {
    fh = await open(/* turbopackIgnore: true */ mediaFilePath(meta.storeId, meta.key), "r");
  } catch (err) {
    if (isErrno(err, "ENOENT", "ENOTDIR")) throw new StoredFileError("missing", meta.key);
    throw err;
  }
  const handle = fh;
  const st = await handle.stat().catch(async (err: unknown) => {
    await handle.close().catch(() => undefined);
    throw err;
  });
  if (st.size !== meta.bytes) {
    await fh.close().catch(() => undefined);
    throw new StoredFileError("mismatch", meta.key);
  }
  return fileRangeStream(fh, start, end);
}

async function remove(meta: Pick<StoredFile, "storeId" | "key" | "storage">): Promise<void> {
  const path = mediaFilePath(meta.storeId, meta.key);
  try {
    await unlink(/* turbopackIgnore: true */ path);
  } catch (err) {
    if (!isErrno(err, "ENOENT", "ENOTDIR")) throw err;
  }
  // best effort: key shard, store folder, store shard; the first folder that is not empty (or is gone) stops it
  let dir = dirname(path);
  for (let i = 0; i < 3; i++) {
    try {
      await rmdir(/* turbopackIgnore: true */ dir);
    } catch {
      break;
    }
    dir = dirname(dir);
  }
}

async function usage(): Promise<{ bytes: number; files: number; freeBytes: number | null }> {
  try {
    const { db } = await import("@/lib/db/client");
    const { cronCursors } = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");
    const [row] = await db.select({ state: cronCursors.state }).from(cronCursors).where(eq(cronCursors.job, WALK_JOB)).limit(1);
    const snap = readWalkSnapshot(row?.state ?? null);
    if (!snap) return { bytes: 0, files: 0, freeBytes: null };
    const budget = budgetBytes();
    return { bytes: snap.bytes, files: snap.files, freeBytes: Math.max(0, budget - snap.bytes) };
  } catch {
    return { bytes: 0, files: 0, freeBytes: null }; // no table yet (before 0005), or the database is down: health shows zeros
  }
}

export const fsStorage: MediaStorage = Object.freeze({ kind: "fs" as const, put, head, readAll, readRange, remove, usage });
