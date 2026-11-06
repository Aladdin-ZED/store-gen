import "server-only";
/**
 * The facts of Settings → Address (P2 SHELL; platform.md PLA-§22.10.2; docs/STORE-SAAS.md §C.7, ENGC-30), all of the
 * scope's own store: when the handle may next change (one rename per 30 days, counted from the creation or the last
 * rename), whether store #1's one free rename is still unused, and how many pages still re-render at the new address
 * (P8's `renderSummary`, 0 while its stub is in place: the line then simply does not show).
 */
import { lastHandleRenameAt } from "@/lib/admin-data/dashboard";
import { LEGACY_STORE_ID } from "@/lib/db/store-handles";
import { renderSummary } from "@/lib/jobs/renders";
import { logError } from "@/lib/orders/log";
import { getPlatformSetting } from "@/lib/settings";
import { nextRenameAt } from "@/lib/tenancy/handles";
import type { StoreScope } from "@/lib/tenancy/types";

export interface RenameFacts {
  /** ISO; the rename is allowed from this moment (the past when allowed now) */
  nextAt: string;
  /** the store #1 conversion's free rename is still unused (allowed at any time, once) */
  freeRename: boolean;
}

export async function renameFacts(scope: StoreScope, createdAt: Date): Promise<RenameFacts> {
  const [last, marker] = await Promise.all([lastHandleRenameAt(scope), scope.storeId === LEGACY_STORE_ID ? getPlatformSetting("tenancy_v1") : null]);
  return {
    nextAt: nextRenameAt(createdAt, last).toISOString(),
    freeRename: !!marker?.freeRename,
  };
}

/** Pages of this store still queued or rendering for the `address` reason; 0 when the queue cannot be read. */
export async function addressRenders(scope: StoreScope): Promise<number> {
  try {
    const s = await renderSummary(scope);
    const row = s.byReason.find((r) => r.reason === "address");
    return row ? row.pending + row.running : 0;
  } catch (err) {
    // P8's stub throws until its merge: no queue, no line
    if (!(err instanceof Error && err.message.startsWith("not implemented"))) logError("settings:address-renders", err);
    return 0;
  }
}
