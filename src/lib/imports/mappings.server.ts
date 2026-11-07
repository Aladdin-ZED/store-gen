import "server-only";
/**
 * Saved import mappings (operations.md OPE-§18.1 step 3, §18.3; `import_mappings`, 0006). Track S3 MONEY owns this
 * file in R2. The contract step (C2-C) froze the repository S4 LOGISTICS calls for the `manifest` kind (its carrier
 * manifest column lists, OPE-§17.3) and for the auto-picked mapping of its tracking / status imports:
 *   - a mapping is per (store, kind, name) (`im_name_uq`), optionally bound to a carrier account;
 *   - `spec` is a `MappingSpec` for the import kinds and a `ManifestMappingSpec` for `manifest` (an export column list);
 *   - writes take a `WriteCtx` (D71) and the kind's permission (`finance.write` for S3's kinds, `shipments.write` for
 *     tracking / status / manifest).
 * Stubs until S3 merges: throw `NotBuiltYet("S3", …)`. No R1 path calls them (R1's Carrier CSV columns stay in the
 * `ops.carrierCsv` setting).
 */
import { z } from "zod";
import { MANIFEST_SOURCES } from "@/lib/callcenter/carrier-csv";
import { notBuiltYet } from "@/lib/contracts/not-built";
import type { importMappings } from "@/lib/db/schema";
import type { ActionResult, StoreScope, WriteCtx } from "@/lib/tenancy/types";
import type { ImportKind, MappingSpec } from "./registry";

/** The `manifest` kind's spec: the ordered output columns (OPE-§18.3), the same shape as `ops.carrierCsv`. */
export const ManifestMappingSpec = z.object({
  v: z.literal(1),
  columns: z.array(z.object({ header: z.string().min(1).max(40), source: z.enum(MANIFEST_SOURCES), value: z.string().max(80).optional() })).min(1).max(20),
  delimiter: z.enum([",", ";"]),
});
export type ManifestMappingSpec = z.infer<typeof ManifestMappingSpec>;

export type ImportMappingRow = typeof importMappings.$inferSelect;

export interface SaveMappingInput {
  /** absent = a new mapping */
  id?: string;
  kind: ImportKind;
  /** ≤ 60, unique per (store, kind) */
  name: string;
  spec: MappingSpec | ManifestMappingSpec;
  carrierAccountId?: string | null;
}

/** The store's mappings of one kind (optionally of one carrier account), most recently updated first. S3 (stub: NotBuiltYet). */
export async function listMappings(scope: StoreScope, kind: ImportKind, opts?: { carrierAccountId?: string }): Promise<ImportMappingRow[]> {
  void scope;
  void kind;
  void opts;
  return notBuiltYet("S3", "listMappings");
}

/** One mapping of the store, or null. S3 (stub: NotBuiltYet). */
export async function getMapping(scope: StoreScope, id: string): Promise<ImportMappingRow | null> {
  void scope;
  void id;
  return notBuiltYet("S3", "getMapping");
}

/** Create or update a mapping (`name_taken` on a duplicate name). S3 (stub: NotBuiltYet). */
export async function saveMapping(ctx: WriteCtx, input: SaveMappingInput): Promise<ActionResult<{ id: string }>> {
  void ctx;
  void input;
  return notBuiltYet("S3", "saveMapping");
}
