"use client";
/**
 * The dashboard's drafts kept in this browser (docs/STORE-SAAS.md §E.6, TENANCY-MAP §7.8; GEN-03, LND-29): the
 * generator's wizard and copy (`sg:<storeId>:<userId>:…`, sessionStorage) and the builder's unsaved copies
 * (`bld:unsaved:<storeId>:<userId>:…`, localStorage). Keyed by store and member, so another store or another member
 * signing in on the same device never gets them back; and cleared when the member signs out.
 *
 *   <form action={logout} onSubmit={clearDashboardDrafts}>   ·   purgeForeignDrafts(storeId, userId)
 */

/** Every key prefix of a dashboard draft (the single-tenant `cod-studio:generate:*` keys included). */
const PREFIXES = ["sg:", "bld:unsaved:", "cod-studio:generate:"] as const;

function each(area: () => Storage, visit: (store: Storage, key: string) => void): void {
  try {
    const store = area();
    const keys: string[] = [];
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (key) keys.push(key);
    }
    for (const key of keys) visit(store, key);
  } catch {
    // storage blocked (private mode, a sandbox): nothing kept, nothing to clear
  }
}

/** Sign-out: every dashboard draft of this browser goes (both storages). */
export function clearDashboardDrafts(): void {
  for (const area of [() => sessionStorage, () => localStorage]) {
    each(area, (store, key) => {
      if (PREFIXES.some((p) => key.startsWith(p))) store.removeItem(key);
    });
  }
}

/**
 * The generator's drafts another member left in this tab for `storeId`, and the store-only keys written before
 * drafts were per member (`sg:<storeId>:generate:…`), are deleted when `userId` opens it. The member's own drafts of
 * their other stores stay.
 */
export function purgeForeignDrafts(storeId: string, userId: string): void {
  each(
    () => sessionStorage,
    (store, key) => {
      if (!key.startsWith(`sg:${storeId}:`)) return;
      const owner = key.split(":")[2];
      if (owner !== userId) store.removeItem(key);
    },
  );
}
