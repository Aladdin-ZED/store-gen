/**
 * Design types (P6 DESIGN; design.md DES-§2.1, DES-§4.9; docs/STORE-SAAS.md §K.2 P0 design stubs, CRIT9, CRIT2-2).
 * P6 owns this file; it re-exports the three P0-frozen measurement shapes from the maintainer's ./types.frozen.ts
 * (P6 never edits that file) and the JSON shapes of the `design_genomes` columns from src/lib/db/schema.ts (cut at
 * P0 with migration 0005), and owns everything else. `Band` and `NoveltyBands` are what the Director cards, the
 * reveal and the publish gate show: bands, never numbers (DS7).
 */
export type { FoldItem, FoldReport, HeightReport, VariantFeaturesResolved } from "./types.frozen";
export type { GateSummary, GenomeCompact, NoveltyBand as Band, NoveltyBands } from "@/lib/db/schema";
