/**
 * In-flight upload slots (per process), taken BEFORE an upload body is read.
 *
 * The CPU gate in process.ts only covers sharp/inspection work; without this, every concurrent
 * request would buffer its whole body (up to ~25 MB) while waiting. Limits: a few uploads per
 * process, fewer per store and per member of a store (the dashboard sends 2 files in parallel).
 *
 * Multi-tenant (docs/STORE-SAAS.md §E.6; TENANCY-MAP MED-14): slots are keyed `${storeId}:${userId}` and one store
 * never holds every process slot, so a busy store leaves room for the others.
 */

export const MAX_UPLOADS = 4;
export const MAX_UPLOADS_PER_STORE = 3;
export const MAX_UPLOADS_PER_USER = 2;

declare global {
  var __codUploadSlots: { total: number; perStore: Map<string, number>; perUser: Map<string, number> } | undefined;
}

const state = () => (globalThis.__codUploadSlots ??= { total: 0, perStore: new Map(), perUser: new Map() });

export type UploadSlot = { ok: true; release: () => void } | { ok: false; scope: "user" | "store" | "server" };

function decrement(map: Map<string, number>, key: string): void {
  const left = (map.get(key) ?? 1) - 1;
  if (left > 0) map.set(key, left);
  else map.delete(key);
}

export function takeUploadSlot(storeId: string, userId: string): UploadSlot {
  const s = state();
  const member = `${storeId}:${userId}`;
  const mine = s.perUser.get(member) ?? 0;
  if (mine >= MAX_UPLOADS_PER_USER) return { ok: false, scope: "user" };
  const store = s.perStore.get(storeId) ?? 0;
  if (store >= MAX_UPLOADS_PER_STORE) return { ok: false, scope: "store" };
  if (s.total >= MAX_UPLOADS) return { ok: false, scope: "server" };
  s.total++;
  s.perStore.set(storeId, store + 1);
  s.perUser.set(member, mine + 1);
  let released = false;
  return {
    ok: true,
    release() {
      if (released) return;
      released = true;
      s.total--;
      decrement(s.perStore, storeId);
      decrement(s.perUser, member);
    },
  };
}
