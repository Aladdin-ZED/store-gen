import "server-only";
/**
 * Chunked binary storage in MariaDB (media_files + media_chunks).
 * Hostinger wipes the app directory on deploy, so media lives in the database.
 *
 * - Writes use prepared statements (binary protocol): a 512 KB chunk travels as ~512 KB, well under a
 *   1 MB max_allowed_packet (text-protocol escaping would double it to ~1 MB).
 * - Reads (public GET /media/<key>, exports) can never tie up the pool the order API depends on:
 *     · they run on their OWN 2-connection pool behind a bounded wait queue — when it is full a read
 *       fails fast with MediaBusyError (the route answers 503) instead of queueing;
 *     · metadata hits are cached, misses for 60 s; concurrent loads of one key share one query;
 *     · files ≤ 8 MB are cached whole in a ~64 MB in-process LRU;
 *     · larger files (videos) are copied once into a private disk cache (sha256-verified) and served
 *       from disk by byte range. The database is streamed per request only when that cache is
 *       unavailable.
 *
 * Per store (docs/STORE-SAAS.md §E.6, MED-01; T4 review): the disk copy of a file is named after its store and its
 * media key (`<storeId>.<sha256(key)>`), never after its content, so two stores holding the same bytes never share a
 * copy (no cross-store "is it cached" timing, and deleting one store's file never evicts the other's). Every cached
 * entry carries its store: `evictStore(storeId)` drops a store's memory and disk entries (a purge, a suspension). The
 * directory is `mediaCacheDir()` (src/lib/storage/paths.ts, §G.2, MED-07): MEDIA_CACHE_DIR, else DATA_DIR/cache/media
 * once the DATA_DIR boot check passed, else `tmpdir()/store-gen-media` (never COD Studio's `cod-studio-media`).
 *
 * Two backends behind one front (§G.1, R1 P8): every `media_files` row says where its bytes live (`storage`). The
 * metadata cache, the LRU and the read pool serve both; a `db` row's bytes are the chunks below, an `fs` row's are a
 * file under DATA_DIR read through src/lib/media/storage/fs.ts (no disk copy needed: it already is one). An fs file
 * that is missing or differs from its row is a 404 counted in the error ring (`media` / `missing_file`,
 * `file_mismatch`), never served.
 * CHUNK_SIZE is part of the on-disk format: never change it once files exist.
 */
import { createHash, randomBytes } from "node:crypto";
import { chmod, lstat, mkdir, open, readdir, readFile, rename, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import mysql, { type PoolConnection, type RowDataPacket } from "mysql2/promise";
import { ByteLru } from "./lru";
import { pool } from "@/lib/db/client";
import { databaseUrl } from "@/lib/db/url";
import { recordError } from "@/lib/jobs/errors";
import { mediaCacheDir } from "@/lib/storage/paths";
import type { WriteScope } from "@/lib/tenancy/types";
import { mediaStorageChecked } from "./storage/check";
import { fsStorage, readFsFile } from "./storage/fs";
import { fileRangeStream, fileSha, sha256hex } from "./storage/io";
import { MAX_READ_ALL, StoredFileError } from "./storage/types";

export { sha256hex };

export const CHUNK_SIZE = 512 * 1024;
/** files above this size are served from the disk cache instead of the memory cache */
export const MAX_CACHED_FILE = MAX_READ_ALL;
const CACHE_BYTES = 64 * 1024 * 1024;
/** chunks fetched per round trip when copying or streaming a large file */
const STREAM_BATCH = 4;

/** dedicated media read pool: connections, waiting queries, longest wait */
export const READ_CONNECTIONS = 2;
export const READ_QUEUE = 32;
const READ_WAIT_MS = 10_000;

/** unknown keys are remembered this long (a 404 is cacheable for 60 s as well) */
const MISS_TTL_MS = 60_000;
const MAX_MISSES = 4096;

const DISK_BUDGET = 512 * 1024 * 1024;
/** after a disk failure (full, read-only…), stay on the database fallback this long */
const DISK_BACKOFF_MS = 10 * 60_000;
const SHA_RE = /^[a-f0-9]{64}$/;
/** a disk copy's file name: `<storeId>.<sha256(media key)>` */
const DISK_NAME_RE = /^([0-9A-HJKMNP-TV-Z]{26})\.([a-f0-9]{64})$/;

export interface MediaFileMeta {
  key: string;
  /** the store the file belongs to (`media_files.store_id`): the per-store cache entries and `evictStore` */
  storeId: string;
  assetId: string;
  mime: string;
  bytes: number;
  chunks: number;
  sha256: string;
  /** where the bytes live (`media_files.storage`): the chunk store or DATA_DIR (§G.1) */
  storage: "db" | "fs";
}

export interface MediaFile extends MediaFileMeta {
  data: Buffer;
}

export interface FileToStore {
  key: string;
  mime: string;
  data: Buffer;
}

/** Media reads are saturated (queue full or waited too long): answer 503, never queue further. */
export class MediaBusyError extends Error {
  constructor() {
    super("media reads saturated");
    this.name = "MediaBusyError";
  }
}

interface DiskEntry {
  storeId: string;
  bytes: number;
  /** content hashed by this process (files adopted from an earlier run are checked on first use) */
  verified: boolean;
}

interface MediaState {
  files: ByteLru<MediaFile>;
  metas: ByteLru<MediaFileMeta>;
  misses: Map<string, number>;
  metaFlights: Map<string, Promise<MediaFileMeta | null>>;
  fileFlights: Map<string, Promise<MediaFile | null>>;
  read: { pool: mysql.Pool | null; active: number; waiters: { grant: () => void }[] };
  disk: {
    ready: Promise<boolean> | null;
    /** the cache directory, set by prepareDisk (mediaCacheDir after the boot check); optional so a test reset may omit it */
    dir?: string | null;
    /** disk name (`<storeId>.<sha256(key)>`) → entry, least recently used first */
    index: Map<string, DiskEntry>;
    total: number;
    flights: Map<string, Promise<string | null>>;
    /** disk name (or "*" for the whole cache) → no disk attempt before this time */
    backoff: Map<string, number>;
  };
}

declare global {
  var __codMediaState: MediaState | undefined;
}

function state(): MediaState {
  globalThis.__codMediaState ??= {
    files: new ByteLru<MediaFile>(CACHE_BYTES, MAX_CACHED_FILE),
    // metadata entries are tiny: "size" 1 → at most 20k entries
    metas: new ByteLru<MediaFileMeta>(20_000, 1),
    misses: new Map(),
    metaFlights: new Map(),
    fileFlights: new Map(),
    read: { pool: null, active: 0, waiters: [] },
    disk: { ready: null, dir: null, index: new Map(), total: 0, flights: new Map(), backoff: new Map() },
  };
  return globalThis.__codMediaState;
}

/** The disk copy's name of one store's file: per store and media key, never per content (MED-01). */
export const diskName = (meta: Pick<MediaFileMeta, "storeId" | "key">): string => `${meta.storeId}.${sha256hex(meta.key)}`;

/** Concurrent callers for the same key share one in-flight load. */
function singleFlight<T>(flights: Map<string, Promise<T>>, key: string, load: () => Promise<T>): Promise<T> {
  const running = flights.get(key);
  if (running) return running;
  const p = load().finally(() => flights.delete(key));
  flights.set(key, p);
  return p;
}

/* ------------------------------------------------------------------ */
/* dedicated read pool                                                 */
/* ------------------------------------------------------------------ */

function readPool(): mysql.Pool {
  const r = state().read;
  if (!r.pool) {
    const url = databaseUrl();
    if (!url) throw new Error("DATABASE_URL is not set");
    r.pool = mysql.createPool({
      uri: url,
      connectionLimit: READ_CONNECTIONS,
      maxIdle: 1,
      idleTimeout: 60_000,
      // the gate below never lets more than READ_CONNECTIONS queries through; this is the backstop
      queueLimit: READ_QUEUE,
      enableKeepAlive: true,
      charset: "utf8mb4_unicode_ci",
      supportBigNumbers: true,
    });
  }
  return r.pool;
}

/** One media query: ≤ READ_CONNECTIONS running, ≤ READ_QUEUE waiting, each waiting ≤ READ_WAIT_MS. */
async function mediaQuery(sql: string, params: unknown[]): Promise<RowDataPacket[]> {
  const r = state().read;
  if (r.active < READ_CONNECTIONS) r.active++;
  else {
    if (r.waiters.length >= READ_QUEUE) throw new MediaBusyError();
    await new Promise<void>((resolve, reject) => {
      const waiter = {
        grant: () => {
          clearTimeout(timer);
          resolve();
        },
      };
      const timer = setTimeout(() => {
        const i = r.waiters.indexOf(waiter);
        if (i >= 0) r.waiters.splice(i, 1);
        reject(new MediaBusyError());
      }, READ_WAIT_MS);
      r.waiters.push(waiter);
    }); // the slot is handed over by the finishing query (active unchanged)
  }
  try {
    const [rows] = await readPool().query<RowDataPacket[]>(sql, params);
    return rows;
  } catch (err) {
    if (err instanceof Error && err.message === "Queue limit reached.") throw new MediaBusyError();
    throw err;
  } finally {
    const next = r.waiters.shift();
    if (next) next.grant();
    else r.active--;
  }
}

/* ------------------------------------------------------------------ */
/* writes (admin, inside the caller's transaction)                     */
/* ------------------------------------------------------------------ */

/**
 * Insert the files (metadata + chunks) of one asset of the scope's store using an open transaction connection: each
 * `media_files` row carries the store (0004: NOT NULL, MED-09) and its backend (`storage = 'db'`, P8's FS backend
 * sits next to it). The caller clears the 60 s miss memory again after its commit (`forgetMisses`): a reader between
 * this insert and the commit could otherwise remember the key as missing.
 */
export async function insertFiles(conn: PoolConnection, scope: WriteScope, assetId: string, files: readonly FileToStore[]): Promise<void> {
  const s = state();
  for (const f of files) {
    const chunks = Math.max(1, Math.ceil(f.data.length / CHUNK_SIZE));
    await conn.execute(
      "INSERT INTO media_files (`key`, store_id, asset_id, mime, bytes, chunks, sha256, storage) VALUES (?, ?, ?, ?, ?, ?, ?, 'db')",
      [f.key, scope.storeId, assetId, f.mime, f.data.length, chunks, sha256hex(f.data)],
    );
    for (let i = 0; i < chunks; i++) {
      await conn.execute("INSERT INTO media_chunks (`key`, idx, data) VALUES (?, ?, ?)", [
        f.key,
        i,
        f.data.subarray(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE),
      ]);
    }
    s.misses.delete(f.key);
  }
}

/**
 * The rows of one asset of the scope's store whose bytes are files under DATA_DIR (§G.4 step 5, the fs backend): the
 * caller wrote the files through `fsStorage.put` BEFORE its transaction, so these rows carry no chunk. `chunks` is
 * the count the chunk store would use (the migrator flips `storage` alone, §G.3, so both backends agree on it).
 */
export async function insertFsFileRows(conn: PoolConnection, scope: WriteScope, assetId: string, files: readonly FileToStore[]): Promise<void> {
  const s = state();
  for (const f of files) {
    const chunks = Math.max(1, Math.ceil(f.data.length / CHUNK_SIZE));
    await conn.execute(
      "INSERT INTO media_files (`key`, store_id, asset_id, mime, bytes, chunks, sha256, storage) VALUES (?, ?, ?, ?, ?, ?, ?, 'fs')",
      [f.key, scope.storeId, assetId, f.mime, f.data.length, chunks, sha256hex(f.data)],
    );
    s.misses.delete(f.key);
  }
}

/** After the caller's commit: forget the 60 s "unknown key" memory of new keys (a re-upload is served at once). */
export function forgetMisses(keys: readonly string[]): void {
  const s = state();
  for (const k of keys) s.misses.delete(k);
}

/** A stored file of an asset: its key and the backend its row names. */
export interface AssetFileRef {
  key: string;
  storage: "db" | "fs";
}

/**
 * Delete the rows of every file of one asset of the scope's store (inside the caller's transaction): the chunks of
 * its `db` files with them, and their disk-cache copies. The caller removes the `fs` files after its commit
 * (`storageFor(file).remove`), so a rollback never loses bytes a row still names.
 */
export async function deleteAssetFiles(conn: PoolConnection, scope: WriteScope, assetId: string): Promise<AssetFileRef[]> {
  const [rows] = await conn.query<RowDataPacket[]>("SELECT `key`, storage FROM media_files WHERE store_id = ? AND asset_id = ?", [scope.storeId, assetId]);
  const files: AssetFileRef[] = rows.map((r) => ({ key: String(r.key), storage: r.storage === "fs" ? "fs" : "db" }));
  const keys = files.map((f) => f.key);
  if (keys.length) {
    // media_chunks is keyed by the media key only (no store column): the keys are the store's, read above
    await conn.query("DELETE FROM media_chunks WHERE `key` IN (?)", [keys]);
    await conn.query("DELETE FROM media_files WHERE store_id = ? AND `key` IN (?)", [scope.storeId, keys]);
    // a cache: harmless to drop early even if the transaction rolls back
    for (const key of keys) void forgetDisk(diskName({ storeId: scope.storeId, key }));
  }
  return files;
}

/** Delete every file of one asset of the scope's store (inside the caller's transaction) and drop their disk copies. */
export async function deleteFilesOfAsset(conn: PoolConnection, scope: WriteScope, assetId: string): Promise<string[]> {
  return (await deleteAssetFiles(conn, scope, assetId)).map((f) => f.key);
}

/**
 * The keys among `keys` that have a `media_files` row of the scope's store right now (read on the main pool, past
 * every cache). A file is removed only when its key has none: two uploads of the same bytes in one store write the
 * same files, and the one that lost the race must not take the winner's (§G.4 step 6).
 */
export async function keysWithRows(scope: WriteScope, keys: readonly string[]): Promise<Set<string>> {
  const found = new Set<string>();
  for (let i = 0; i < keys.length; i += 500) {
    const [rows] = await pool().query<RowDataPacket[]>("SELECT `key` FROM media_files WHERE store_id = ? AND `key` IN (?)", [scope.storeId, keys.slice(i, i + 500)]);
    for (const r of rows) found.add(String(r.key));
  }
  return found;
}

export function evictKeys(keys: string[]): void {
  const s = state();
  for (const k of keys) {
    s.files.delete(k);
    s.metas.delete(k);
  }
}

/**
 * Drop everything this process caches of one store (§E.6): its whole files and metadata in memory and its disk
 * copies (index and files). A purge or a suspension calls it; the next read of a key that still exists loads again.
 */
export async function evictStore(storeId: string): Promise<void> {
  const s = state();
  s.files.deleteWhere((f) => f.storeId === storeId);
  s.metas.deleteWhere((m) => m.storeId === storeId);
  const names = [...s.disk.index.entries()].filter(([, e]) => e.storeId === storeId).map(([name]) => name);
  await Promise.all(names.map((name) => forgetDisk(name)));
}

/* ------------------------------------------------------------------ */
/* metadata                                                            */
/* ------------------------------------------------------------------ */

function knownMissing(key: string): boolean {
  const s = state();
  const until = s.misses.get(key);
  if (until === undefined) return false;
  if (until > Date.now()) return true;
  s.misses.delete(key);
  return false;
}

function rememberMissing(key: string): void {
  const m = state().misses;
  m.delete(key);
  m.set(key, Date.now() + MISS_TTL_MS);
  if (m.size > MAX_MISSES) m.delete(m.keys().next().value!);
}

/** Cached answer without touching the database: meta, null (known missing), undefined (unknown). */
export function peekMediaMeta(key: string): MediaFileMeta | null | undefined {
  const hit = state().metas.get(key);
  if (hit) return hit;
  return knownMissing(key) ? null : undefined;
}

export async function getMediaMeta(key: string): Promise<MediaFileMeta | null> {
  const cached = peekMediaMeta(key);
  if (cached !== undefined) return cached;
  const s = state();
  return singleFlight(s.metaFlights, key, async () => {
    // tenancy: public-key mediaKey (§E.3 rule 6, §G.6: a media key is global and random; the media route resolves its store first, resolveMediaKey)
    const [row] = await mediaQuery("SELECT `key`, store_id, asset_id, mime, bytes, chunks, sha256, storage FROM media_files WHERE `key` = ? LIMIT 1", [key]);
    if (!row) {
      rememberMissing(key);
      return null;
    }
    const meta: MediaFileMeta = {
      key: String(row.key),
      storeId: String(row.store_id),
      assetId: String(row.asset_id),
      mime: String(row.mime),
      bytes: Number(row.bytes),
      chunks: Number(row.chunks),
      sha256: String(row.sha256),
      storage: row.storage === "fs" ? "fs" : "db",
    };
    s.metas.set(key, meta, 1);
    return meta;
  });
}

/* ------------------------------------------------------------------ */
/* whole files                                                         */
/* ------------------------------------------------------------------ */

async function selectChunks(key: string, from: number, to: number): Promise<{ idx: number; data: Buffer }[]> {
  const rows = await mediaQuery(
    "SELECT idx, data FROM media_chunks WHERE `key` = ? AND idx BETWEEN ? AND ? ORDER BY idx",
    [key, from, to],
  );
  return rows.map((r) => ({ idx: Number(r.idx), data: r.data as Buffer }));
}

/**
 * Whole file (cached when ≤ 8 MB; larger db files come from the verified disk cache when possible, larger fs files
 * straight from DATA_DIR). Integrity is checked on cold loads: chunk count, length and sha256 (fs: length and sha256).
 * Returns null when the key does not exist or the stored data is inconsistent.
 */
export async function getMediaFile(key: string): Promise<MediaFile | null> {
  const s = state();
  const hit = s.files.get(key);
  if (hit) return hit;
  return singleFlight(s.fileFlights, key, async () => {
    let meta = await getMediaMeta(key);
    if (!meta) return null;
    if (meta.storage === "db") {
      const file = await loadFromChunks(meta);
      if (file !== "gone") return file;
      // no chunk at all: the migrator may have moved the file to DATA_DIR after this process cached its row (§G.3)
      meta = await reloadMeta(key);
      if (meta?.storage !== "fs") return null;
    }
    return loadFromFs(meta);
  });
}

/** A db row's bytes: the file, null when its chunks are inconsistent, "gone" when it has none left. */
async function loadFromChunks(meta: MediaFileMeta): Promise<MediaFile | null | "gone"> {
  if (meta.bytes > MAX_CACHED_FILE) {
    const path = await diskCopy(meta);
    if (path) {
      const data = await readFile(/* turbopackIgnore: true */ path).catch(() => null);
      if (data && data.length === meta.bytes) return { ...meta, data };
    }
  }
  const rows = await selectChunks(meta.key, 0, meta.chunks - 1);
  if (rows.length === 0) return "gone";
  if (rows.length !== meta.chunks || rows.some((r, i) => r.idx !== i)) return null;
  const data = rows.length === 1 ? rows[0]!.data : Buffer.concat(rows.map((r) => r.data));
  if (data.length !== meta.bytes) return null;
  if (meta.bytes <= MAX_CACHED_FILE && sha256hex(data) !== meta.sha256) return null;
  const file: MediaFile = { ...meta, data };
  state().files.set(meta.key, file, data.length);
  return file;
}

/** An fs row's bytes, checked against the row; a missing or different file is counted and answers null. */
async function loadFromFs(meta: MediaFileMeta): Promise<MediaFile | null> {
  try {
    const data = await readFsFile(meta);
    const file: MediaFile = { ...meta, data };
    if (meta.bytes <= MAX_CACHED_FILE) state().files.set(meta.key, file, data.length);
    return file;
  } catch (err) {
    if (!(err instanceof StoredFileError)) throw err; // EIO, EMFILE…: the caller's 503, never a cacheable 404
    countStoredFileError(err, meta);
    return null;
  }
}

function countStoredFileError(err: StoredFileError, meta: Pick<MediaFileMeta, "storeId">): void {
  recordError("media", null, { code: err.code === "missing" ? "missing_file" : "file_mismatch", storeId: meta.storeId });
}

/** The key's row read again (its cached metadata and miss memory dropped first). */
export function reloadMeta(key: string): Promise<MediaFileMeta | null> {
  const s = state();
  s.metas.delete(key);
  s.misses.delete(key);
  return getMediaMeta(key);
}

/** Cached whole file if present, without touching the database. */
export function peekMediaFile(key: string): MediaFile | undefined {
  return state().files.get(key);
}

/** True when serving this file's bytes needs no database work (an fs row's never does). */
export function mediaBodyCached(meta: MediaFileMeta): boolean {
  if (meta.storage === "fs") return true;
  const s = state();
  return meta.bytes <= MAX_CACHED_FILE ? s.files.get(meta.key) !== undefined : s.disk.index.get(diskName(meta))?.verified === true;
}

/* ------------------------------------------------------------------ */
/* disk cache for large files                                          */
/* ------------------------------------------------------------------ */

async function prepareDisk(): Promise<boolean> {
  const d = state().disk;
  try {
    // DATA_DIR/cache/media only once DATA_DIR passed its boot check: a refused directory gets no cache either
    const dir = mediaCacheDir((await mediaStorageChecked()).ok);
    d.dir = dir;
    await mkdir(/* turbopackIgnore: true */ dir, { recursive: true, mode: 0o700 });
    const st = await lstat(/* turbopackIgnore: true */ dir);
    if (!st.isDirectory()) return false; // e.g. a planted symlink
    if (process.platform !== "win32") {
      if (typeof process.getuid === "function" && st.uid !== process.getuid()) return false;
      if (st.mode & 0o077) await chmod(/* turbopackIgnore: true */ dir, 0o700);
    }
    // adopt complete files from an earlier run (hashed again before first use); drop stale partial writes
    const found: { name: string; storeId: string; bytes: number; at: number }[] = [];
    for (const name of await readdir(/* turbopackIgnore: true */ dir)) {
      const info = await stat(/* turbopackIgnore: true */ join(dir, name)).catch(() => null);
      if (!info?.isFile()) continue;
      const m = DISK_NAME_RE.exec(name);
      if (m) found.push({ name, storeId: m[1]!, bytes: info.size, at: info.mtimeMs });
      else if (name.endsWith(".part") && Date.now() - info.mtimeMs > DISK_BACKOFF_MS) {
        await unlink(/* turbopackIgnore: true */ join(dir, name)).catch(() => undefined);
      }
    }
    for (const f of found.sort((a, b) => a.at - b.at)) {
      if (d.index.has(f.name)) continue;
      d.index.set(f.name, { storeId: f.storeId, bytes: f.bytes, verified: false });
      d.total += f.bytes;
    }
    trimDisk();
    return true;
  } catch {
    return false;
  }
}

function trimDisk(): void {
  const d = state().disk;
  while (d.total > DISK_BUDGET && d.index.size > 0) void forgetDisk(d.index.keys().next().value!);
}

/** Drop a disk copy (index + file) by its disk name. Await the result before writing the same file again. */
function forgetDisk(name: string): Promise<void> {
  const d = state().disk;
  const entry = d.index.get(name);
  if (entry) {
    d.index.delete(name);
    d.total -= entry.bytes;
  }
  return d.dir && DISK_NAME_RE.test(name) ? unlink(/* turbopackIgnore: true */ join(d.dir, name)).catch(() => undefined) : Promise.resolve();
}

/** A local file-system failure (disk full, read-only, permissions) — distinct from database errors. */
class DiskError extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : "disk cache failure");
    this.name = "DiskError";
  }
}
const onDisk = <T>(op: Promise<T>): Promise<T> =>
  op.catch((err: unknown) => {
    throw new DiskError(err);
  });

/** Copy a stored file from the database to `path`, a batch of chunks at a time, verifying its sha256. */
async function copyToDisk(meta: MediaFileMeta, path: string): Promise<boolean> {
  const tmp = `${path}.${process.pid}-${randomBytes(4).toString("hex")}.part`;
  const fh = await onDisk(open(/* turbopackIgnore: true */ tmp, "wx", 0o600));
  const hash = createHash("sha256");
  let written = 0;
  let ok = false;
  try {
    for (let from = 0; from < meta.chunks; from += STREAM_BATCH) {
      const to = Math.min(meta.chunks - 1, from + STREAM_BATCH - 1);
      const rows = await selectChunks(meta.key, from, to);
      if (rows.length !== to - from + 1 || rows.some((r, i) => r.idx !== from + i)) return false;
      for (const r of rows) {
        hash.update(r.data);
        for (let off = 0; off < r.data.length; ) {
          const { bytesWritten } = await onDisk(fh.write(r.data, off, r.data.length - off, written + off));
          off += bytesWritten;
        }
        written += r.data.length;
      }
    }
    ok = written === meta.bytes && hash.digest("hex") === meta.sha256;
  } finally {
    await fh.close().catch(() => undefined);
    if (!ok) await unlink(/* turbopackIgnore: true */ tmp).catch(() => undefined);
  }
  if (!ok) return false;
  try {
    await rename(/* turbopackIgnore: true */ tmp, path);
    return true;
  } catch {
    await unlink(/* turbopackIgnore: true */ tmp).catch(() => undefined);
    return false;
  }
}

/**
 * Path of a verified disk copy of a large file, creating it on first use (one copy at a time per
 * file). Null when the disk cache is unavailable — callers fall back to the database.
 */
async function diskCopy(meta: MediaFileMeta): Promise<string | null> {
  const d = state().disk;
  const sha = meta.sha256;
  if (!SHA_RE.test(sha)) return null;
  const name = diskName(meta);
  if (!DISK_NAME_RE.test(name)) return null;
  const now = Date.now();
  if ((d.backoff.get("*") ?? 0) > now || (d.backoff.get(name) ?? 0) > now) return null;
  if (!(await (d.ready ??= prepareDisk())) || !d.dir) return null;
  const path = join(/* turbopackIgnore: true */ d.dir, name); // DATA_DIR/cache/media: never traced into the build
  const entry = d.index.get(name);
  if (entry?.verified && entry.bytes === meta.bytes) {
    d.index.delete(name); // most recently used
    d.index.set(name, entry);
    return path;
  }
  return singleFlight(d.flights, name, async () => {
    const adopted = d.index.get(name);
    if (adopted && !adopted.verified) {
      if (adopted.bytes === meta.bytes && (await fileSha(path)) === sha) {
        adopted.verified = true;
        return path;
      }
      await forgetDisk(name);
    }
    let ok: boolean;
    try {
      ok = await copyToDisk(meta, path);
    } catch (err) {
      if (!(err instanceof DiskError)) throw err; // database trouble (busy, connection) is the caller's to report
      d.backoff.set("*", Date.now() + DISK_BACKOFF_MS); // disk full / not writable: stop trying for a while
      return null;
    }
    // another process may have just written the same file (our rename lost the race): its content is checked
    if (!ok && (await fileSha(path)) !== sha) {
      d.backoff.set(name, Date.now() + DISK_BACKOFF_MS); // stored data inconsistent: don't re-copy every request
      return null;
    }
    const previous = d.index.get(name);
    if (previous) d.total -= previous.bytes;
    d.index.delete(name);
    d.index.set(name, { storeId: meta.storeId, bytes: meta.bytes, verified: true });
    d.total += meta.bytes;
    trimDisk();
    return d.index.has(name) ? path : null;
  });
}

/**
 * Bytes [start, end] (inclusive) of a large file: an fs row's straight from DATA_DIR; a db row's from the disk cache
 * (filled from the database once), or streamed from the database when the disk cache is unavailable.
 */
export async function openMediaRange(meta: MediaFileMeta, start: number, end: number): Promise<ReadableStream<Uint8Array>> {
  if (meta.storage === "fs") {
    try {
      return await fsStorage.readRange(meta, start, end);
    } catch (err) {
      if (err instanceof StoredFileError) countStoredFileError(err, meta);
      throw err;
    }
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    const path = await diskCopy(meta);
    if (!path) break;
    try {
      // a runtime cache path (DATA_DIR or os.tmpdir()): without the ignore, Turbopack traces the whole project into the
      // server output
      return fileRangeStream(await open(/* turbopackIgnore: true */ path, "r"), start, end);
    } catch {
      await forgetDisk(diskName(meta)); // removed under us (another process trimmed its cache): copy again once
    }
  }
  return streamMediaRange(meta, start, end);
}

/**
 * Stream bytes [start, end] (inclusive) of a stored file straight from the database, fetching only the
 * chunks that cover the range. Errors mid-stream (missing chunk, saturated reads) abort the response.
 */
export function streamMediaRange(meta: MediaFileMeta, start: number, end: number): ReadableStream<Uint8Array> {
  const first = Math.floor(start / CHUNK_SIZE);
  const last = Math.floor(end / CHUNK_SIZE);
  let next = first;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (next > last) {
        controller.close();
        return;
      }
      const upto = Math.min(last, next + STREAM_BATCH - 1);
      try {
        const rows = await selectChunks(meta.key, next, upto);
        if (rows.length !== upto - next + 1) throw new Error(`media ${meta.key}: missing chunk`);
        for (const r of rows) {
          const base = r.idx * CHUNK_SIZE;
          const s = Math.max(0, start - base);
          const e = Math.min(r.data.length, end - base + 1);
          if (e > s) controller.enqueue(new Uint8Array(r.data.buffer, r.data.byteOffset + s, e - s));
        }
        next = upto + 1;
        if (next > last) controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}

/** In-process cache occupancy (diagnostics for the admin). */
export function mediaCacheStats(): { files: number; bytes: number; diskFiles: number; diskBytes: number } {
  const s = state();
  return { files: s.files.size, bytes: s.files.bytes, diskFiles: s.disk.index.size, diskBytes: s.disk.total };
}
