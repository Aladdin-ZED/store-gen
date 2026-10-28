/**
 * Store Health snapshots (docs/STORE-SAAS.md §I.7; platform.md PLA-§6.3.4). P1 owns the file; its API is frozen at P0
 * (src/lib/contracts/r1-p0.ts) because P2 (the tenant ring, "Recompute now", snooze) merges before P1.
 *
 * P0 stubs, each the safe default of a table nobody writes before P1's `platform.health` job exists:
 *   - `markHealthDirty` (declared at C0a for T1's transitionStore and T3's publish): a no-op, a hint that only reorders
 *     the job's work;
 *   - `getStoreHealth`: `null` = not computed yet (the ring's "computing" state, PLA Q4.4);
 *   - `requestHealthRecompute`: marks the store dirty and answers when it did (`queuedAt`); the rate limit
 *     `s:<sid>:health:recompute` 6/h is the calling action's (PLA-§M.1 `recomputeHealthAction`);
 *   - `snoozeHealthIssue`: throws, because no issue exists to snooze before P1 computes one;
 *   - `unsnoozeHealthIssue` (P0b, CCR P2-7: PLA-§22.16's "n snoozed" with Unsnooze): throws, for the same reason.
 */
import type { StoreHealthView } from "@/lib/health/types";
import type { StoreCtx, StoreScope } from "@/lib/tenancy/types";

export type { StoreHealthView } from "@/lib/health/types";

/** Every console action on a store, every publish, zone save, integration change: recompute this store first. */
export async function markHealthDirty(storeId: string): Promise<void> {
  void storeId;
}

/** The store's own row, cached 5 min ("health" scopedCache, §E.6); null = not computed yet; flags only for platform scopes. */
export async function getStoreHealth(scope: StoreScope): Promise<StoreHealthView | null> {
  void scope;
  return null;
}

/** health.snooze: writes `snoozed[issueId]` for 7 days, audits store.health.snoozed, invalidates the cache. */
export async function snoozeHealthIssue(ctx: StoreCtx, issueId: string, days: 7): Promise<void> {
  void ctx;
  void issueId;
  void days;
  throw new Error("not implemented: P1 snoozeHealthIssue");
}

/** health.snooze: removes `snoozed[issueId]`, audits store.health.snoozed with `{ unsnoozed: true }`, invalidates the cache. */
export async function unsnoozeHealthIssue(ctx: StoreCtx, issueId: string): Promise<void> {
  void ctx;
  void issueId;
  throw new Error("not implemented: P1 unsnoozeHealthIssue");
}

/** "Recompute now" (§I.7, PLA-§6.3): markHealthDirty; the job computes within ≤ 5 min. */
export async function requestHealthRecompute(ctx: StoreCtx): Promise<{ queuedAt: string }> {
  await markHealthDirty(ctx.store.id);
  return { queuedAt: new Date().toISOString() };
}
