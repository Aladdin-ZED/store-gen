import "server-only";
/**
 * The upload pipeline's file write on the DB backend (docs/STORE-SAAS.md §G.1, §G.4 step 5; MED-09): today's chunk
 * format (`media_files` + `media_chunks`, CHUNK_SIZE, prepared statements so a 512 KB chunk travels as ~512 KB),
 * with the row's `store_id` from the scope and `storage = 'db'`.
 *
 * R1.0 adapter (CCR r1.0-t4-5): `insertFiles` in ./store.ts (not a T4 file) still inserts `media_files` without
 * `store_id`, which 0004 made NOT NULL, so every upload through it fails. Once the CCR gives it the store, this file
 * becomes a one-line call to it; P8's `storage/db.ts` (§G.1) then wraps the same statements.
 */
import type { PoolConnection } from "mysql2/promise";
import type { WriteScope } from "@/lib/tenancy/types";
import { CHUNK_SIZE, sha256hex, type FileToStore } from "./store";

/** Insert the files of one asset of the scope's store inside the caller's open transaction. */
export async function insertStoreFiles(conn: PoolConnection, scope: WriteScope, assetId: string, files: readonly FileToStore[]): Promise<void> {
  for (const f of files) {
    const chunks = Math.max(1, Math.ceil(f.data.length / CHUNK_SIZE));
    await conn.execute(
      "INSERT INTO media_files (`key`, store_id, asset_id, mime, bytes, chunks, sha256, storage) VALUES (?, ?, ?, ?, ?, ?, ?, 'db')",
      [f.key, scope.storeId, assetId, f.mime, f.data.length, chunks, sha256hex(f.data)],
    );
    for (let i = 0; i < chunks; i++) {
      await conn.execute("INSERT INTO media_chunks (`key`, idx, data) VALUES (?, ?, ?)", [f.key, i, f.data.subarray(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE)]);
    }
  }
}

/**
 * After the commit: forget the store's 60 s "unknown key" memory for the new keys (what `insertFiles` does inside
 * the transaction), so a file deleted and uploaded again within a minute is served at once.
 */
export function forgetMisses(keys: readonly string[]): void {
  const misses = globalThis.__codMediaState?.misses;
  if (misses) for (const k of keys) misses.delete(k);
}

/** Bytes the files take in storage (master + every variant + AVIF): the asset's `stored_bytes`, the quota charge. */
export const storedBytesOf = (files: readonly FileToStore[]) => files.reduce((n, f) => n + f.data.length, 0);
