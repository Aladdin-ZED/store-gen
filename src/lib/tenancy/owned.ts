import "server-only";
/**
 * References inside a store are validated against the same store before use (docs/STORE-SAAS.md §E.3 rule 5): asset
 * ids in a document (LND-05, MED-18), `sourceAssetId` (MED-02), page and version ids in history and exports (EXP-01,
 * ADM-19), pixel ids, product ids. Another store's id and a missing id fail identically (`not_found`).
 *
 *   await assertOwned(scope, "asset", assetRefsIn(doc));
 *
 * Signature frozen at C0a; T2 implements the body (§K.1).
 */
import type { StoreScope } from "./types";

export type OwnedKind = "page" | "version" | "asset" | "export" | "pixel" | "product" | "campaign" | "zone";

/** Throws SeamError("not_found") (src/lib/tenancy/seam.ts) unless every id belongs to the scope's store. */
export async function assertOwned(scope: StoreScope, kind: OwnedKind, ids: readonly string[]): Promise<void> {
  void scope;
  void kind;
  void ids;
  throw new Error("not implemented: T2 (assertOwned)");
}
