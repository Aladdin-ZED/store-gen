/**
 * The media storage driver's contract (docs/STORE-SAAS.md §G.1, OS-07): one interface, two backends.
 *
 *   mediaBackend().put(file, data)          // uploads: "fs" when the DATA_DIR boot check passed, else "db"
 *   storageFor(row).readRange(row, a, b)    // reads follow the row's own `media_files.storage`
 *
 * - `fs` (./fs.ts): `DATA_DIR/media/v1/<storeId[0..1]>/<storeId>/<key[0..1]>/<key>`, dirs 0700, files 0600 (§G.2).
 * - `db` (./db.ts): today's chunk store (`media_files` + `media_chunks`, src/lib/media/store.ts), `CHUNK_SIZE` frozen.
 * - The in-process LRU and the 2-connection read pool of store.ts stay in front of both (§G.1).
 *
 * The interface and `StoredFile` are the spec's text, unchanged; the verdict types below are the boot check's
 * (./check.ts, §G.2, ENGC-14).
 */

export interface StoredFile { storeId: string; key: string; assetId: string; mime: string; bytes: number; sha256: string; storage: "db" | "fs" }
export interface MediaStorage {
  readonly kind: "db" | "fs";
  /** durable before it resolves (fs: temp file + fsync + rename + fsync(dir)). rev 3 (ENGC-20): IDEMPOTENT — when the key exists and the
   *  existing file's sha256 equals the incoming one, resolve at once; otherwise replace atomically (temp + rename). A crash between the
   *  file write and the DB insert therefore never blocks the same upload for the sweeper's hour (test:storage case). */
  put(file: Omit<StoredFile, "storage">, data: Buffer): Promise<void>;
  head(key: string): Promise<StoredFile | null>;
  readAll(meta: StoredFile): Promise<Buffer>;                                    // ≤ 8 MB (MAX_CACHED_FILE)
  readRange(meta: StoredFile, start: number, end: number): Promise<ReadableStream<Uint8Array>>;
  remove(meta: Pick<StoredFile, "storeId" | "key" | "storage">): Promise<void>;  // idempotent
  usage(): Promise<{ bytes: number; files: number; freeBytes: number | null }>;   // health
}

/** `readAll`'s ceiling: store.ts's MAX_CACHED_FILE (the whole-file memory cache) is this value. */
export const MAX_READ_ALL = 8 * 1024 * 1024;

/**
 * A stored file that is not what its row says: `missing` (no file, or no chunks) or `mismatch` (length or sha256
 * differ). Readers turn it into a 404 and count it in the error ring (area `media`); it is never repaired silently.
 */
export class StoredFileError extends Error {
  constructor(readonly code: "missing" | "mismatch", key: string) {
    super(`media ${key}: ${code === "missing" ? "stored file is missing" : "stored file does not match its row"}`);
    this.name = "StoredFileError";
  }
}

/**
 * Why the boot check refused the directory (§G.2), or `ok`:
 * - `unset` / `relative`: the variable is not set, or not an absolute path;
 * - `inside_app`: its real path is inside `process.cwd()` or contains it (a deploy replaces the app folder; a parent of
 *   the app would hold every site of the account);
 * - `public_html`: a `public_html` segment, where the web server could serve the files;
 * - `missing`: it does not exist and its parent does not either; `not_dir`: it is a file;
 * - `symlink`: it (or one of its area folders, or the owner marker) is a symbolic link or a junction;
 * - `owner`: on POSIX, owned by another user than `process.getuid()` (skipped on win32);
 * - `not_writable`: a folder could not be created; `probe`: the write / fsync / rename / delete probe failed;
 * - `no_database`: DATABASE_URL names no database, so the owner marker cannot be written;
 * - `owner_mismatch`: `.sg-owner` names another app or another database (COD Studio shares the hosting account);
 * - `marker_unreadable`: `.sg-owner` exists but is not the marker's JSON;
 * - `error`: anything unexpected (the check never throws).
 */
export type MediaCheckCode =
  | "ok"
  | "unset"
  | "relative"
  | "inside_app"
  | "public_html"
  | "missing"
  | "not_dir"
  | "symlink"
  | "owner"
  | "not_writable"
  | "probe"
  | "no_database"
  | "owner_mismatch"
  | "marker_unreadable"
  | "error";

/** The boot check's answer, kept on `globalThis.__sgMediaBackend` and shown by the health tile. */
export interface MediaCheckVerdict {
  ok: boolean;
  code: MediaCheckCode;
  /** ISO time of the check */
  at: string;
  /** the variable the code is about (null when ok) */
  variable: "DATA_DIR" | "MEDIA_DIR" | null;
}

/** `globalThis.__sgMediaBackend` (declared in ./index.ts; L4 allow entry, CCR r1-p8-4): no store data. */
export interface MediaBackendState {
  verdict: MediaCheckVerdict | null;
  /** the one check in flight (concurrent first callers share it) */
  running: Promise<MediaCheckVerdict> | null;
}
