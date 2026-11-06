import "server-only";
/**
 * The database media backend (docs/STORE-SAAS.md §G.1, §G.3): today's chunk store of src/lib/media/store.ts
 * (`media_files` + `media_chunks`, 512 KB chunks, `CHUNK_SIZE` frozen), wrapped unchanged. It is the fallback while
 * the DATA_DIR boot check fails, and the home of every file uploaded before the filesystem backend.
 *
 * - `put` checks the bytes (length, sha256) and resolves: on this backend the chunks travel WITH the row, through
 *   `insertFiles` inside the upload's own transaction (§G.4 step 5), so they are durable exactly when the row is and a
 *   crash can leave no chunk without its row. Idempotent by construction.
 * - Reads go through the chunk store (its read pool, its caches): `readAll` = `getMediaFile`, `readRange` =
 *   `streamMediaRange` (only the chunks that cover the range).
 * - `remove` deletes a key's chunks unless its `media_files` row still says they are its bytes (`storage = 'db'`) or
 *   belongs to another store: after the asset's rows are gone, or once the migrator flipped the row to `fs` (§G.3).
 *   Idempotent; a wrong store id removes nothing.
 * - `usage()` is the chunk table's size (information_schema, no scan of the blobs) and its file count (chunk 0 of each
 *   file); the platform DB quota is getDbUsage's (§H.5).
 */
import type { RowDataPacket } from "mysql2/promise";
import { pool } from "@/lib/db/client";
import { CHUNK_SIZE, getMediaFile, getMediaMeta, reloadMeta, streamMediaRange } from "@/lib/media/store";
import { assertBytesMatch, assertRange } from "./io";
import { MAX_READ_ALL, StoredFileError, type MediaStorage, type StoredFile } from "./types";

/** The chunk count of a file of `bytes` bytes (at least one chunk, as `insertFiles` writes it). */
export const chunksOf = (bytes: number) => Math.max(1, Math.ceil(bytes / CHUNK_SIZE));

async function put(file: Omit<StoredFile, "storage">, data: Buffer): Promise<void> {
  assertBytesMatch(file, data);
}

async function head(key: string): Promise<StoredFile | null> {
  const meta = await getMediaMeta(key);
  if (!meta || meta.storage !== "db") return null;
  return { storeId: meta.storeId, key: meta.key, assetId: meta.assetId, mime: meta.mime, bytes: meta.bytes, sha256: meta.sha256, storage: "db" };
}

async function readAll(meta: StoredFile): Promise<Buffer> {
  if (meta.bytes > MAX_READ_ALL) throw new RangeError(`media ${meta.key}: readAll is for files up to 8 MB`);
  const file = await getMediaFile(meta.key);
  if (!file || file.storeId !== meta.storeId) throw new StoredFileError("missing", meta.key);
  if (file.bytes !== meta.bytes || file.sha256 !== meta.sha256) throw new StoredFileError("mismatch", meta.key);
  return file.data;
}

async function readRange(meta: StoredFile, start: number, end: number): Promise<ReadableStream<Uint8Array>> {
  assertRange(meta.bytes, start, end);
  return streamMediaRange({ ...meta, chunks: chunksOf(meta.bytes) }, start, end);
}

async function remove(meta: Pick<StoredFile, "storeId" | "key" | "storage">): Promise<void> {
  // media_chunks has no store column. A key belongs to one store (D28): another store's key, or a key this store's row
  // still keeps in the database, is left alone (read past the caches); the DELETE re-checks the store's own row.
  const row = await reloadMeta(meta.key);
  if (row && (row.storeId !== meta.storeId || row.storage === "db")) return;
  await pool().query(
    "DELETE FROM media_chunks WHERE `key` = ? AND NOT EXISTS (SELECT 1 FROM media_files WHERE store_id = ? AND `key` = ? AND storage = 'db')",
    [meta.key, meta.storeId, meta.key],
  );
}

async function usage(): Promise<{ bytes: number; files: number; freeBytes: number | null }> {
  try {
    const [size] = await pool().query<RowDataPacket[]>(
      "SELECT COALESCE(data_length + index_length, 0) AS bytes FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'media_chunks'",
    );
    const [count] = await pool().query<RowDataPacket[]>("SELECT COUNT(*) AS files FROM media_chunks WHERE idx = 0");
    return { bytes: Number(size[0]?.bytes ?? 0), files: Number(count[0]?.files ?? 0), freeBytes: null };
  } catch {
    return { bytes: 0, files: 0, freeBytes: null };
  }
}

export const dbStorage: MediaStorage = Object.freeze({ kind: "db" as const, put, head, readAll, readRange, remove, usage });
