import "server-only";
/**
 * The media storage driver (docs/STORE-SAAS.md §G.1, OS-07): which backend a new file goes to, and which one a stored
 * file is read from.
 *
 *   const backend = await mediaBackendReady();   // uploads (§G.4 step 5): the check's verdict, awaited once
 *   mediaBackend();                              // the same choice, synchronously ("db" until a verdict exists)
 *   storageFor(row).readRange(row, a, b);        // reads follow the row's own `media_files.storage`
 *
 * - `mediaBackend()` is the fs backend only when the DATA_DIR boot check (./check.ts, §G.2) passed; otherwise, and
 *   while no verdict exists yet, the db backend (the fallback, with a red health tile). Until CCR r1-p8-1 runs the
 *   check at boot (src/instrumentation.ts step 3), the first call starts it once, lazily; concurrent callers share the
 *   run, and `mediaBackendReady()` waits for it.
 * - `storageFor(meta)` never consults the verdict: a row written to the filesystem is read from it even after a later
 *   boot fell back to the database (its read then fails visibly, it is never served from somewhere else).
 * - The verdict lives on `globalThis.__sgMediaBackend` (L4 allow entry, CCR r1-p8-4): `{ verdict, running }`, no
 *   store data.
 */
import { mediaStorageChecked, mediaStorageVerdict, runMediaStorageCheck } from "./check";
import { dbStorage } from "./db";
import { fsStorage } from "./fs";
import type { MediaBackendState, MediaCheckVerdict, MediaStorage, StoredFile } from "./types";

declare global {
  // the DATA_DIR boot-check verdict and its one run in flight (§G.2); written by ./check.ts
  var __sgMediaBackend: MediaBackendState | undefined;
}

export type { MediaBackendState, MediaCheckCode, MediaCheckVerdict, MediaStorage, StoredFile } from "./types";
export { MAX_READ_ALL, StoredFileError } from "./types";
export { runMediaStorageCheck, mediaStorageChecked, mediaStorageVerdict } from "./check";
export { dbStorage } from "./db";
export { fsStorage } from "./fs";

/** "fs" when the boot check passed, else "db" (fallback, health red). Starts the check when none has run yet. */
export function mediaBackend(): MediaStorage {
  const verdict = mediaStorageVerdict();
  if (!verdict && !globalThis.__sgMediaBackend?.running) void runMediaStorageCheck();
  return verdict?.ok ? fsStorage : dbStorage;
}

/** `mediaBackend()` once the check has a verdict (the upload path awaits this; it never rejects). */
export async function mediaBackendReady(): Promise<MediaStorage> {
  const verdict: MediaCheckVerdict = await mediaStorageChecked();
  return verdict.ok ? fsStorage : dbStorage;
}

/** The backend a stored file lives on: its row's `storage` column. */
export function storageFor(meta: Pick<StoredFile, "storage">): MediaStorage {
  return meta.storage === "fs" ? fsStorage : dbStorage;
}
