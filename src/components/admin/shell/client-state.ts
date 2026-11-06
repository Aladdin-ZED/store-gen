/**
 * The store's client state, cleared on a store switch and on sign-out (P2 SHELL; platform.md PLA-§22.3; docs/
 * STORE-SAAS.md §B.4, §E.6). Browser module; every storage call is wrapped, so a blocked storage (private mode, a
 * sandbox) clears nothing and throws nothing.
 *
 *   clearStoreClientState(prevStoreId, userId)   // the switcher, before navigating to the next store
 *
 * What goes, for `prevStoreId`:
 * - the builder's unsaved copies `bld:unsaved:<storeId>:<userId>:*` (localStorage; the order the builder writes, and
 *   the `<userId>:<storeId>` order PLA-§22.3 names, both matched);
 * - the generator's drafts `sg:<storeId>:<userId>:*` and the store-wide `sg:gen:<storeId>:v2` (sessionStorage);
 * - the in-memory caches registered with `onStoreClientClear` (the focal cache registers itself when its module
 *   adopts the hook; until then its keys are already per store);
 * - the store's pulse pollers (`stopPulsePollers`) and its running browser AI jobs (P7's `cancelStoreAiJobs`).
 */
import { cancelStoreAiJobs } from "@/lib/ai/router/client";
import { clearDashboardDrafts } from "../lib/drafts";
import { clearClientErrors } from "./client-errors";
import { stopPulsePollers } from "./pulse-election";

type Cleaner = (storeId: string, userId: string) => void;
const CLEANERS = new Set<Cleaner>();

/** Registers an in-memory cache's clear for store switches; answers the unregister function. */
export function onStoreClientClear(fn: Cleaner): () => void {
  CLEANERS.add(fn);
  return () => CLEANERS.delete(fn);
}

/** The storage keys of `storeId` and `userId` that a switch removes (pure: `test:shell` checks it). */
export function storeKeyMatches(key: string, storeId: string, userId: string): boolean {
  if (!storeId || !userId) return false;
  return (
    key.startsWith(`bld:unsaved:${storeId}:${userId}:`) ||
    key.startsWith(`bld:unsaved:${userId}:${storeId}:`) ||
    key.startsWith(`sg:${storeId}:${userId}:`) ||
    key === `sg:gen:${storeId}:v2`
  );
}

function sweep(area: () => Storage, storeId: string, userId: string): number {
  let removed = 0;
  try {
    const store = area();
    const keys: string[] = [];
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (key && storeKeyMatches(key, storeId, userId)) keys.push(key);
    }
    for (const key of keys) {
      try {
        store.removeItem(key);
        removed++;
      } catch {
        // one key refused: the others still go
      }
    }
  } catch {
    // storage blocked: nothing was kept, nothing to clear
  }
  return removed;
}

export interface ClearReport {
  storageKeys: number;
  pollers: number;
  cleaners: number;
}

/** Clears `prevStoreId`'s client state for `userId` (store switch and sign-out). */
export function clearStoreClientState(
  prevStoreId: string,
  userId: string,
  areas: { local: () => Storage; session: () => Storage } = { local: () => localStorage, session: () => sessionStorage },
): ClearReport {
  const storageKeys = sweep(areas.local, prevStoreId, userId) + sweep(areas.session, prevStoreId, userId);
  let pollers = 0;
  try {
    pollers = stopPulsePollers(prevStoreId);
  } catch {
    // a poller that fails to stop is collected with its page
  }
  let cleaners = 0;
  for (const fn of [...CLEANERS]) {
    try {
      fn(prevStoreId, userId);
      cleaners++;
    } catch {
      // one cache failing does not keep the others
    }
  }
  try {
    cancelStoreAiJobs(prevStoreId);
  } catch {
    // P7's hook: a failure leaves the job to its own timeout
  }
  return { storageKeys, pollers, cleaners };
}

/**
 * Sign-out from any surface of a store (the account menu, the legal sheet): the store's client state, the dashboard's
 * drafts of this browser (§E.6) and the Help sheet's error ring. Never throws: the sign-out form submits either way.
 */
export function signOutCleanup(storeId: string, userId: string): void {
  try {
    clearStoreClientState(storeId, userId);
  } catch {
    // nothing kept that the next session could read
  }
  try {
    clearDashboardDrafts();
  } catch {
    // storage blocked
  }
  clearClientErrors();
}
