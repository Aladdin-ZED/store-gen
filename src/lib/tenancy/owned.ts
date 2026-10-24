import "server-only";
/**
 * References inside a store are validated against the same store before use (docs/STORE-SAAS.md §E.3 rule 5): asset
 * ids in a document (LND-05, MED-18), `sourceAssetId` (MED-02), page and version ids in history and exports (EXP-01,
 * ADM-19), pixel ids, product ids. Another store's id and a missing id fail identically (`not_found`): the same
 * statement runs for both and its answer is only "how many of these ids are this store's".
 *
 *   await assertOwned(scope, "asset", assetRefsIn(doc));
 *
 * `pixel` ids are library refs (`<platform>:<id>`, src/lib/pixels/library.ts `pixelKey`): a pixel id is not unique
 * across stores (two stores may use one Meta pixel), so ownership means "in this store's pixel library". The
 * `product` (R2), `campaign` and `zone` (0005, P0) kinds have no table in R1.0: asking for them is a programming
 * error, thrown as such rather than answered `not_found`.
 */
import { inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { assets, exportsTable, pageVersions, pages } from "@/lib/db/schema";
import { getStoreSetting } from "@/lib/settings";
import { SeamError } from "./seam";
import { whereStore } from "./sql";
import type { StoreScope } from "./types";

export type OwnedKind = "page" | "version" | "asset" | "export" | "pixel" | "product" | "campaign" | "zone";

/** Ids per statement (the IN list); a document never references more, a longer call runs several statements. */
const CHUNK = 500;
const ID_MAX = 64;

async function ownedPages(scope: StoreScope, ids: string[]): Promise<string[]> {
  const rows = await db.select({ id: pages.id }).from(pages).where(whereStore(pages, scope, inArray(pages.id, ids)));
  return rows.map((r) => r.id);
}

async function ownedVersions(scope: StoreScope, ids: string[]): Promise<string[]> {
  const rows = await db.select({ id: pageVersions.id }).from(pageVersions).where(whereStore(pageVersions, scope, inArray(pageVersions.id, ids)));
  return rows.map((r) => r.id);
}

async function ownedAssets(scope: StoreScope, ids: string[]): Promise<string[]> {
  const rows = await db.select({ id: assets.id }).from(assets).where(whereStore(assets, scope, inArray(assets.id, ids)));
  return rows.map((r) => r.id);
}

async function ownedExports(scope: StoreScope, ids: string[]): Promise<string[]> {
  const rows = await db.select({ id: exportsTable.id }).from(exportsTable).where(whereStore(exportsTable, scope, inArray(exportsTable.id, ids)));
  return rows.map((r) => r.id);
}

async function ownedPixels(scope: StoreScope, refs: string[]): Promise<string[]> {
  const library = await getStoreSetting(scope, "pixel_library");
  const known = new Set(library.pixels.map((p) => `${p.platform}:${p.id}`));
  return refs.filter((r) => known.has(r));
}

const LOOKUP: Record<Exclude<OwnedKind, "product" | "campaign" | "zone">, (scope: StoreScope, ids: string[]) => Promise<string[]>> = {
  page: ownedPages,
  version: ownedVersions,
  asset: ownedAssets,
  export: ownedExports,
  pixel: ownedPixels,
};

/** Throws SeamError("not_found") (src/lib/tenancy/seam.ts) unless every id belongs to the scope's store. */
export async function assertOwned(scope: StoreScope, kind: OwnedKind, ids: readonly string[]): Promise<void> {
  if (kind === "product" || kind === "campaign" || kind === "zone") {
    throw new Error(`assertOwned("${kind}"): no ${kind} table in this release (products: R2; campaigns, zones: 0005)`);
  }
  const wanted = [...new Set(ids)];
  if (wanted.length === 0) return;
  if (wanted.some((id) => typeof id !== "string" || id.length === 0 || id.length > ID_MAX)) throw new SeamError("not_found");
  const lookup = LOOKUP[kind];
  let owned = 0;
  for (let i = 0; i < wanted.length; i += CHUNK) {
    const chunk = wanted.slice(i, i + CHUNK);
    // exact strings: the `_ci` collation would also match a case variant of an owned id
    const got = new Set(await lookup(scope, chunk));
    owned += chunk.filter((id) => got.has(id)).length;
  }
  if (owned !== wanted.length) throw new SeamError("not_found");
}
