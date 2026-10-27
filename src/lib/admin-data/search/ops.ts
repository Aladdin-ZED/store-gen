/**
 * ⌘K search provider of the ops track (P4 CALL CENTER, operations.md).
 * Extension file (docs/STORE-SAAS.md §I.3, §K.3; LAN Q18), created at P0 and imported by
 * src/lib/admin-data/search/registry.ts: until the track merges it finds nothing (no kinds, no hits).
 */
import type { SearchProvider } from "./types";

export const provider: SearchProvider = {
  id: "ops",
  kinds: [],
  search: async () => [],
};
