import "server-only";
/**
 * The ⌘K search provider registry (docs/STORE-SAAS.md §I.3, §K.3; LAN Q18). Maintainer-owned: the import lines of
 * every track's `./<track>.ts` (each exports `provider: SearchProvider`) are written here at P0, so no track edits this
 * file; `scripts/qa/registries-check.ts` proves no file is left out. The consumer is P2's src/lib/admin-data/search.ts
 * (the `/api/app/<h>/search` route): it runs every provider for the viewer's store within `SEARCH_BUDGET_MS` and drops
 * a slower one. A provider that has not merged yet has no kinds and finds nothing.
 */
import { provider as design } from "./design";
import { provider as landing } from "./landing";
import { provider as ops } from "./ops";
import type { SearchProvider } from "./types";

export type { SearchHit, SearchProvider } from "./types";
export { SEARCH_BUDGET_MS } from "./types";

/** Every provider, in track order (P3, P4, P6). */
export const SEARCH_PROVIDERS: readonly SearchProvider[] = [landing, ops, design];
