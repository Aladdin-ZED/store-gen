/**
 * The edge cache purge request (core §C.5 Worker HTML cache, OS-12 / OS-13; R2, S6 PLATFORM UX owns
 * `src/lib/edge-cache/**`). The contract step (C2-C) froze `requestEdgePurge` and its reasons: every writer that
 * invalidates a store's render cache reaches it through ONE guarded call in `invalidateStoreRender(storeId)`
 * (src/lib/render/cache.server.ts, the maintainer's seam), so S1's catalog writes, S2's theme activations, publishes,
 * settings, lifecycle and handle changes purge the Worker cache without calling anything of S6's. Synchronous, never
 * throws, never awaits the network (S6's body enqueues an `edge_purge` outbox item, coalesced per store). Contract body
 * until S6 merges and while the HTML cache is off: a no-op. Isomorphic (no import), so the seam costs nothing in R1.
 */

export type EdgePurgeReason = "render" | "publish" | "settings" | "lifecycle" | "handle" | "theme" | "catalog" | "manual";

/** Ask the edge to drop the store's cached HTML (whole hosts, or the given paths). S6 (contract body: no-op). */
export function requestEdgePurge(storeId: string, opts: { reason: EdgePurgeReason; paths?: readonly string[]; hosts?: readonly string[] }): void {
  void storeId;
  void opts;
}
