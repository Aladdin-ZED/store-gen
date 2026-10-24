import "server-only";
/**
 * Allow-lists of the active connected exports, for CORS preflights: an OPTIONS request carries no
 * page key, so the union of every active list (src/lib/tenancy/public.ts listActiveExportOrigins, the one
 * cross-store read, origins only) is all a preflight can be checked against; the POST then checks the
 * allow-list of its own export only.
 *
 *  - cached in this process for a minute (a platform-keyed ScopedCache: every route bundle shares one copy),
 *  - dropped whenever this process creates, revokes or removes an export, or a store is invalidated,
 *  - an origin missing from the cached list is looked up again (at most every few seconds), so a
 *    brand-new export also works at once when another process or bundle created it — instead of
 *    the shopper's first orders failing with a CORS error for up to a minute.
 * Entries naming the platform's own namespace never match (./origin originAllowed, SEC-23).
 */
import { onStoreInvalidated, scopedCache } from "@/lib/tenancy/cache";
import { listActiveExportOrigins } from "@/lib/tenancy/public";
import { originAllowed } from "./origin";

const TTL_MS = 60_000;
/** A miss re-reads the table at most this often (bounds the cost of preflights from random origins). */
const MISS_REFRESH_MS = 3_000;
/** platform-keyed entries (§E.6: the store id "p") */
const P = "p";

interface OriginsEntry {
  at: number;
  list: string[];
}

const union = scopedCache<OriginsEntry>({ name: "export-origins", maxEntries: 1, ttlMs: TTL_MS });
onStoreInvalidated("export-origins", () => union.delete(P));

async function load(): Promise<string[]> {
  const list = await listActiveExportOrigins();
  union.set(P, "union", { at: Date.now(), list });
  return list;
}

/** Union of the allow-lists of all active (non-revoked) exports. */
export async function activeExportOrigins(): Promise<string[]> {
  return union.get(P, "union")?.list ?? load();
}

/** Is `origin` allowed by any active export? A cached "no" is confirmed against the database. */
export async function exportOriginAllowed(origin: string): Promise<boolean> {
  if (originAllowed(origin, await activeExportOrigins())) return true;
  const hit = union.get(P, "union");
  if (hit && Date.now() - hit.at < MISS_REFRESH_MS) return false;
  return originAllowed(origin, await load());
}

/** Call after an export is created, revoked or deleted. */
export function invalidateExportOrigins(): void {
  union.delete(P);
}
