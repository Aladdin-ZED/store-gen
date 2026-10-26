import "server-only";
/**
 * The database half of store handles (docs/STORE-SAAS.md §C.7, §A.5.1): the list snapshot handleProblem reads,
 * availability, and the rename transaction. Imported lazily by src/lib/tenancy/handles.ts (whose frozen signatures
 * callers use), so the edge classifier that imports the pure handle rules never loads the database client.
 */
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { auditFrom } from "@/lib/audit";
import { errorSummary } from "@/lib/orders/log";
import { PROTECTED_BRANDS } from "@/lib/platform/data/protected-brands";
import { getPlatformSetting, setPlatformSetting } from "@/lib/settings";
import { invalidateStore } from "@/lib/tenancy/cache";
import { HandleError, handleFree, handleLists, nextRenameAt, setHandleLists, type BrandTerm, type HandleLists } from "@/lib/tenancy/handles";
import type { StoreCtx } from "@/lib/tenancy/types";
import { pool } from "./client";

/** The store the 0004 conversion made from a single-tenant install (§D.8 S1). */
export const LEGACY_STORE_ID = "00000000000000000000000001";

const LISTS_TTL_MS = 30_000;
/** a renamed handle redirects (and stays reserved) this long */
const REDIRECT_MONTHS = 12;

declare global {
  var __sgHandleListsLoading: Promise<HandleLists> | undefined;
}

/**
 * The snapshot of `platform.reservedHandles` and the active protected terms, reloaded after 30 s (one load in
 * flight per process). A failed load keeps the previous snapshot (the seeded list at worst) and is logged.
 */
export async function loadHandleLists(opts: { fresh?: boolean } = {}): Promise<HandleLists> {
  const current = handleLists();
  if (!opts.fresh && current.at > 0 && Date.now() - current.at < LISTS_TTL_MS) return current;
  globalThis.__sgHandleListsLoading ??= (async () => {
    try {
      const [platform, [rows]] = await Promise.all([
        getPlatformSetting("platform"),
        // tenancy: platform protected_brands is a P table (§D.3)
        pool().query<RowDataPacket[]>("SELECT term, `match`, active FROM protected_brands"),
      ]);
      const disabled = new Set(rows.filter((r) => !r.active).map((r) => String(r.term).toLowerCase()));
      const terms = new Map<string, BrandTerm>();
      for (const b of PROTECTED_BRANDS) if (!disabled.has(b.term)) terms.set(b.term, { term: b.term, match: b.match });
      for (const r of rows) if (r.active) terms.set(String(r.term).toLowerCase(), { term: String(r.term).toLowerCase(), match: r.match as BrandTerm["match"] });
      const next: HandleLists = { reserved: new Set(platform.reservedHandles), terms: [...terms.values()], at: Date.now() };
      setHandleLists(next);
      return next;
    } catch (err) {
      console.error("[handles] cannot load the reserved / protected lists; keeping the previous ones:", errorSummary(err));
      return handleLists();
    } finally {
      globalThis.__sgHandleListsLoading = undefined;
    }
  })();
  return globalThis.__sgHandleListsLoading;
}

/** The current-handle and history facts of one handle. */
async function handleFacts(handle: string): Promise<{ current: boolean; history: { storeId: string; reservedUntil: Date } | null }> {
  // tenancy: platform a handle is global (§C.7): any store's current handle and any store's reservation count
  const [[cur], [hist]] = await Promise.all([
    pool().query<RowDataPacket[]>("SELECT 1 FROM stores WHERE handle = ? LIMIT 1", [handle]),
    pool().query<RowDataPacket[]>("SELECT store_id, reserved_until FROM store_handle_history WHERE handle = ?", [handle]),
  ]);
  const h = hist[0];
  return { current: cur.length > 0, history: h ? { storeId: String(h.store_id), reservedUntil: h.reserved_until as Date } : null };
}

/** Free for a new store (`ownStoreId` null) or for that store's rename (its own old handles count as free). */
export async function handleIsFree(handle: string, ownStoreId: string | null): Promise<boolean> {
  return handleFree({ ...(await handleFacts(handle)), now: new Date(), ownStoreId });
}

/** The rename transaction (see renameHandle in src/lib/tenancy/handles.ts; the format was checked there). */
export async function renameStoreHandle(ctx: StoreCtx, next: string): Promise<void> {
  const storeId = ctx.store.id;
  const conn = await pool().getConnection();
  let from = "";
  let usedGrant = false;
  try {
    await conn.beginTransaction();
    // the store row lock serializes this store's renames (and the free-grant read below)
    const [[row]] = await conn.query<RowDataPacket[]>("SELECT handle, created_at FROM stores WHERE id = ? FOR UPDATE", [storeId]);
    if (!row || row.handle !== ctx.store.handle) throw new HandleError("status_changed");
    from = String(row.handle);
    const now = new Date();

    const [[last]] = await conn.query<RowDataPacket[]>("SELECT MAX(created_at) AS at FROM store_handle_history WHERE store_id = ? AND reason = 'renamed'", [storeId]);
    const retryAt = nextRenameAt(row.created_at as Date, (last?.at as Date | null) ?? null);
    if (retryAt.getTime() > now.getTime()) {
      // ENGC-30: store #1's derived handle may be changed once at any time
      const marker = storeId === LEGACY_STORE_ID ? await getPlatformSetting("tenancy_v1", { fresh: true }) : null;
      if (!marker?.freeRename) throw new HandleError("too_soon", null, retryAt);
      usedGrant = true;
    }

    // tenancy: platform handles are unique across stores: who holds or held `next` (§C.7)
    const [[hist]] = await conn.query<RowDataPacket[]>("SELECT store_id, reserved_until FROM store_handle_history WHERE handle = ? FOR UPDATE", [next]);
    const [[cur]] = await conn.query<RowDataPacket[]>("SELECT 1 AS x FROM stores WHERE handle = ? LIMIT 1", [next]);
    const history = hist ? { storeId: String(hist.store_id), reservedUntil: hist.reserved_until as Date } : null;
    if (!handleFree({ current: !!cur, history, now, ownStoreId: storeId })) throw new HandleError("unavailable");
    // taking back one of this store's own old handles ends its redirect
    if (history?.storeId === storeId) await conn.query("DELETE FROM store_handle_history WHERE handle = ? AND store_id = ?", [next, storeId]);

    let res: ResultSetHeader;
    try {
      [res] = await conn.query<ResultSetHeader>("UPDATE stores SET handle = ?, address_version = address_version + 1 WHERE id = ? AND handle = ?", [next, storeId, from]);
    } catch (err) {
      if ((err as { errno?: number }).errno === 1062) throw new HandleError("unavailable"); // stores_handle_uq: taken meanwhile
      throw err;
    }
    if (res.affectedRows !== 1) throw new HandleError("status_changed");

    const until = new Date(now);
    until.setUTCMonth(until.getUTCMonth() + REDIRECT_MONTHS);
    // tenancy: platform a handle is global (§C.7): its one history row points at the store that last held it
    await conn.query(
      `INSERT INTO store_handle_history (handle, store_id, reason, redirect_until, reserved_until, created_at) VALUES (?, ?, 'renamed', ?, ?, ?)
       ON DUPLICATE KEY UPDATE store_id = VALUES(store_id), reason = 'renamed', redirect_until = VALUES(redirect_until), reserved_until = VALUES(reserved_until), created_at = VALUES(created_at)`,
      [from, storeId, until, until, now],
    );
    if (usedGrant) {
      // consumed before the commit: a second rename waiting on the row lock reads it fresh and is refused
      const marker = await getPlatformSetting("tenancy_v1", { fresh: true });
      if (marker) await setPlatformSetting("tenancy_v1", { ...marker, freeRename: false }, { id: ctx.user.id, ip: ctx.actor.ip, kind: "system" });
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback().catch(() => undefined);
    throw err;
  } finally {
    conn.release();
  }
  invalidateStore(storeId);
  await auditFrom(ctx, "store.handle_renamed", { target: storeId, meta: { from, to: next, ...(usedGrant ? { freeRename: true } : {}) } });
}
