import "server-only";
/**
 * In-app notifications (docs/STORE-SAAS.md §I.4; platform.md PLA-§18.1, PLA Q.15): the frozen `notify()` signature.
 * R1.0: T2's minimal `notifications` insert behind it; R1 product: P1's full API (reads, unread counts, batching).
 *
 *   await notify({ audience: "store_role", storeId, roles: ["owner", "admin"] }, "store.restricted", { reason }, { link: appHref(h) });
 *
 * Never throws (failures go to error_events). C0a: a no-op that answers `{ deduped: true }` (the documented safe
 * default of a call that must never fail its caller) and logs once per process that nothing was stored.
 */
import type { PlatformRole, StoreRole } from "@/lib/auth/permissions";
import type { NotificationKind, NotificationSeverity, NotificationVars } from "@/lib/notify/registry";

export type NotifyTarget =
  | { audience: "user"; userId: string; storeId?: string | null } // one person (in one store, or platform-wide)
  | { audience: "store"; storeId: string } // every active member of the store
  | { audience: "store_role"; storeId: string; roles: readonly StoreRole[] }
  | { audience: "platform_staff"; minRole?: PlatformRole }; // staff feed (rank super_admin > admin > support > analyst)

export interface NotifyOpts {
  link?: string;
  severity?: NotificationSeverity;
  dedupeKey?: string;
  text?: string; // staff free text only, ≤ 600
  expiresInDays?: number;
  batch?: { windowMin: number };
}

declare global {
  var __sgNotifyStubWarned: boolean | undefined;
}

export async function notify<K extends NotificationKind>(target: NotifyTarget, kind: K, vars: NotificationVars<K>, opts?: NotifyOpts): Promise<{ id: number } | { deduped: true }> {
  void target;
  void vars;
  void opts;
  if (!globalThis.__sgNotifyStubWarned) {
    globalThis.__sgNotifyStubWarned = true;
    console.warn(`[notify] not implemented (T2): "${kind}" and later notifications are not stored`);
  }
  return { deduped: true };
}
