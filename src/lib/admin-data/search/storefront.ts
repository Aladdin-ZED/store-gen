import "server-only";
/**
 * ⌘K search provider of the storefront file (S1 STOREFRONT, storefront.md STO-§27.2).
 * Extension file (docs/STORE-SAAS.md §K.3, §K.4), created empty at the R2 contract step (C2-D) and imported by
 * ./registry.ts (SEARCH_PROVIDERS); the track fills it and never edits the registry.
 */
import type { SearchProvider } from "./types";

export const provider: SearchProvider = {
  id: "storefront",
  kinds: [],
  search: async () => [],
};
