/**
 * Pulse counters of the shell track (P2 SHELL, platform.md PLA-§22.6; docs/STORE-SAAS.md §I.4).
 * Extension file (docs/STORE-SAAS.md §I.4, §K.3), created at P0 and imported by src/lib/pulse/registry.ts; the track
 * fills it and never edits the registry.
 *
 *   membersPendingInvites      the store's open invites (not accepted, revoked or expired); only for a role with
 *                              `members.read` (the Team badge), the key is left out for the others
 *   notificationsUnreadStore   the viewer's unread notifications of this store: the bell's `unread` without the
 *                              viewer's account-wide rows (P1's `unreadCount` for the store, minus the store-less one)
 *
 * Store-level and cheap: the invite count is one indexed count per store, kept 5 s (`scopedCache("shell-pulse")`, so
 * it may be shared across the store's viewers); the unread counts are P1's, cached 5 s per reader (never across
 * viewers). Within the 50 ms budget a failing read omits the keys (`runContributors`).
 *
 * The database readers are wired in by the pulse's server loader (src/app/api/app/[store]/pulse/load.ts, the only
 * caller of the contributors) when it loads: this file imports nothing server-only, so the pure `test:pulse` imports
 * the registry without a server, and the route never waits for a lazy module graph inside its 50 ms.
 */
import { can, isStoreRole, type StoreRole } from "@/lib/auth/permissions";
import { scopedCache } from "@/lib/tenancy/cache";
import type { StoreScope } from "@/lib/tenancy/types";
import type { PulseContributor } from "../types";

/** The cap of P1's unread count (src/lib/platform/notify.ts `UNREAD_CAP`): a count at the cap may be higher. */
const UNREAD_CAP = 100;

export interface ShellPulseSources {
  /** the store's open invites */
  pendingInvites(scope: StoreScope): Promise<number>;
  /** P1's unread count for the reader: in the store (`inStore`) or the account-wide rows only */
  unread(scope: StoreScope, viewer: { userId: string; role: string }, inStore: boolean): Promise<number>;
}

/**
 * The shell's counters over `sources` (the selftest passes fakes and its own cache name; `contributor` below, the
 * database readers and `shell-pulse`).
 */
export function shellContributor(sources: ShellPulseSources, opts: { cacheName?: string; ttlMs?: number } = {}): PulseContributor {
  const invites = scopedCache<number>({ name: opts.cacheName ?? "shell-pulse", maxEntries: 2_000, ttlMs: opts.ttlMs ?? 5_000 });
  return {
    id: "shell",
    async contribute(scope, viewer) {
      const role = isStoreRole(viewer.role) ? viewer.role : null;
      const seesTeam = role !== null && can(role, "members.read");
      // each read starts on a later tick: a source that throws synchronously is one rejection, never an orphaned one
      const later = <T>(fn: () => Promise<T>) => Promise.resolve().then(fn);
      const [pending, store, account] = await Promise.all([
        seesTeam ? invites.getOrLoad(scope.storeId, "invites", () => sources.pendingInvites(scope)) : Promise.resolve(null),
        later(() => sources.unread(scope, viewer, true)),
        later(() => sources.unread(scope, viewer, false)),
      ]);
      const out: Record<string, number> = {
        notificationsUnreadStore: store >= UNREAD_CAP ? UNREAD_CAP : Math.max(0, store - account),
      };
      if (pending !== null) out.membersPendingInvites = pending;
      return out;
    },
  };
}

/**
 * P1's notification reader for one of the two counts: in the store (its store, store_role and own rows), or the
 * viewer's account-wide rows only (no store). Staff viewing a store (impersonation) read only rows addressed to them
 * (P0 review G2). Pure.
 */
export function shellUnreadReader(scope: StoreScope, viewer: { userId: string; role: string }, inStore: boolean): { userId: string; storeId: string | null; role: StoreRole | null; platformRole: "none" } {
  const role = scope.kind === "impersonation" || !isStoreRole(viewer.role) ? null : viewer.role;
  return { userId: viewer.userId, storeId: inStore ? scope.storeId : null, role: inStore ? role : null, platformRole: "none" };
}

let wired: ShellPulseSources | null = null;

/** The server loader's one call at its load: the database readers behind `contributor`. */
export function wireShellPulseSources(sources: ShellPulseSources): void {
  wired = sources;
}

function sources(): ShellPulseSources {
  if (!wired) throw new Error("shell pulse: the database readers are not wired (src/app/api/app/[store]/pulse/load.ts)");
  return wired;
}

// async, so a missing wiring is a rejection Promise.all settles (never a synchronous throw beside a pending read)
export const contributor: PulseContributor = shellContributor({
  pendingInvites: async (scope) => sources().pendingInvites(scope),
  unread: async (scope, viewer, inStore) => sources().unread(scope, viewer, inStore),
});
