import "server-only";
/**
 * The upload pipeline's file write on the DB backend (docs/STORE-SAAS.md §G.1, §G.4 step 5; MED-09): the chunk store's
 * `insertFiles` (./store.ts) with the scope's store on every `media_files` row and `storage = 'db'` (CCR r1.0-t4-5,
 * r1.0-m-4). P8's `storage/db.ts` (§G.1) wraps the same call.
 */
import type { PoolConnection } from "mysql2/promise";
import type { WriteScope } from "@/lib/tenancy/types";
import { insertFiles, type FileToStore } from "./store";

export { forgetMisses } from "./store";

/** Insert the files of one asset of the scope's store inside the caller's open transaction. */
export async function insertStoreFiles(conn: PoolConnection, scope: WriteScope, assetId: string, files: readonly FileToStore[]): Promise<void> {
  await insertFiles(conn, scope, assetId, files);
}

/** Bytes the files take in storage (master + every variant + AVIF): the asset's `stored_bytes`, the quota charge. */
export const storedBytesOf = (files: readonly FileToStore[]) => files.reduce((n, f) => n + f.data.length, 0);
