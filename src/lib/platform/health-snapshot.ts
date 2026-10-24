import "server-only";
/**
 * Store Health snapshots (docs/STORE-SAAS.md §I.7; platform.md PLA-§6.3). P1 owns the file (its full API is a P0
 * stub). C0a declares `markHealthDirty` early because R1.0 callers need it (T1's transitionStore, T3's publish):
 * until P1 merges it is a no-op, the safe default of a hint that only reorders the health job's work.
 */

/** Every console action on a store, every publish, zone save, integration change: recompute this store first. */
export async function markHealthDirty(storeId: string): Promise<void> {
  void storeId;
}
