import "server-only";
/**
 * The asset reference index (docs/STORE-SAAS.md §G.5, OS-07): which owner of a store (a page's draft, a live version,
 * the brand logo; R2's products and themes) shows which of the store's assets. It answers "Used in" (ADM-24), the
 * delete 409 (MED-12) and the cutout re-render (DES-§4.11).
 *
 *   const ids = extractAssetIds({ kind: "doc", doc });                    // pure: every asset id of a document
 *   await syncAssetRefs(scope, "page", pageId, ids, { live: false });     // replaces that owner's rows
 *   const uses = await assetUsage(scope, assetId);                       // [{ ownerKind, ownerId, live, pageId?, pageName? }]
 *   await enqueueRenders(scope, await livePagesUsing(scope, sourceId), "cutout");
 *
 * - §G.5 names this module `src/lib/media/refs.ts`. It lives here because P8's row owns `src/lib/storage/**`, and a
 *   new file in `src/lib/media/` is nobody's in R1 (spec drift, recorded in r1-p8-report.md).
 * - `extractAssetIds` reuses `collectAssetIds` (src/landing/context.ts) for landing documents, so the index, the
 *   renderer and the export agree on what "uses an asset" means. A damaged document yields what it can, never throws.
 * - `syncAssetRefs` keeps only ids of the store's own assets (the §E.3 rule 5 check, as a filter: a document may name
 *   a missing or another store's id, which renders as nothing and is never indexed), then replaces the owner's rows
 *   with one DELETE and one INSERT IGNORE in a transaction. Two syncs of one owner serialize on its index range; a
 *   deadlock between them is retried.
 * - Until CCR r1-p8-7 calls `syncAssetRefs` from save, publish, restore and the brand setting, `assetUsage` and
 *   `livePagesUsing` also read the documents themselves: an exact scan of the store's non-archived landing drafts,
 *   its live versions and its brand logo (`collectAssetIds` over the parsed JSON, at most `pages_max` documents of
 *   each, never a LIKE). P8 step 12 removes the scan once the CCR has landed.
 * - `reconcileStoreRefs` (the nightly refs.reconcile job, P8 step 7) heals the index of one store: owners whose rows
 *   are missing or older than their source are rebuilt, rows of owners that no longer exist (or stopped being live)
 *   are removed, so the index is right even before CCR r1-p8-7's call sites land.
 * - Every statement binds the store from the scope. Another store's asset id answers `[]`, like a missing one.
 */
import { and, asc, eq, gt, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { assetRefs, assets, pages, pageVersions } from "@/lib/db/schema";
import { collectAssetIds } from "@/landing/context";
import type { PageDoc } from "@/lib/page/schema";
import { inStore, storeValues, whereStore } from "@/lib/tenancy/sql";
import type { StoreScope, WriteScope } from "@/lib/tenancy/types";

export type AssetOwnerKind = (typeof assetRefs.$inferSelect)["ownerKind"];
export const ASSET_OWNER_KINDS: readonly AssetOwnerKind[] = assetRefs.ownerKind.enumValues;

/** An asset id as documents and rows carry it (32 lowercase hex today; 16-64 accepted, like ASSET_ID_RE). */
const ASSET_ID = /^[a-f0-9]{16,64}$/;
const OWNER_ID = /^[A-Za-z0-9_.:-]{1,64}$/;
/** The logo roles of the `brand` setting (DES-R16). */
const LOGO_ROLES = ["primary", "mark", "wordmark", "inverse"] as const;
/** keys of an AssetRef (src/lib/page/schema.ts): an object with an asset id and only these keys is a reference */
const REF_KEYS: ReadonlySet<string> = new Set(["id", "alt", "fx", "fy", "box"]);
/** the generic walk's bounds (themes, other settings): depth, visited values */
const WALK_DEPTH = 14;
const WALK_NODES = 20_000;
/** ids per owner (a document references far fewer); ids per IN list */
const MAX_IDS = 2_000;
const CHUNK = 500;
/** documents read per statement by the scan, and the ceiling when the plan's `pages_max` is unlimited */
const SCAN_BATCH = 20;
const SCAN_CEILING = 2_000;
const SYNC_TRIES = 6; // ten parallel syncs of one owner deadlock on the gap lock more than twice under load

/** What `extractAssetIds` reads: a landing document, a store theme (R2), or a store setting's value. */
export type AssetSource =
  | { kind: "doc"; doc: PageDoc | unknown }
  | { kind: "theme"; theme: unknown }
  | { kind: "settings"; key: string; value: unknown };

/** One use of an asset in its store. `pageId` / `pageName` / `pageSlug` are set for page and page_version owners. */
export interface AssetUse {
  ownerKind: AssetOwnerKind;
  ownerId: string;
  /** shown to visitors right now: a live version, the brand logo */
  live: boolean;
  pageId?: string;
  pageName?: string;
  pageSlug?: string;
}

/** The dashboard's shape of the same answer (src/lib/admin-data/assets.ts `AssetUsage`): per page, plus the logo. */
export interface AssetUsageByPage {
  pages: { id: string; name: string; slug: string; inDraft: boolean; live: boolean }[];
  storeLogo: boolean;
}

/* ------------------------------------------------------------------ */
/* Extraction (pure)                                                   */
/* ------------------------------------------------------------------ */

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Every asset id of a landing document; a damaged one (missing parts, wrong types) yields what it can. */
function docAssetIds(doc: unknown): string[] {
  if (!isObject(doc)) return [];
  const sections = Array.isArray(doc.sections) ? doc.sections.filter(isObject) : [];
  try {
    return collectAssetIds({ ...doc, sections } as unknown as PageDoc);
  } catch {
    return walkAssetIds(doc);
  }
}

/**
 * Asset ids anywhere in a JSON value: AssetRef-shaped objects (`{ id, alt?, fx?, fy?, box? }`) and string values of
 * keys named `assetId` or ending in `AssetId`. Bounded in depth and size.
 */
function walkAssetIds(value: unknown): string[] {
  const ids = new Set<string>();
  let nodes = 0;
  const visit = (v: unknown, depth: number): void => {
    if (depth > WALK_DEPTH || ++nodes > WALK_NODES || v === null || typeof v !== "object") return;
    if (Array.isArray(v)) {
      for (const x of v) visit(x, depth + 1);
      return;
    }
    const o = v as Record<string, unknown>;
    if (typeof o.id === "string" && ASSET_ID.test(o.id) && Object.keys(o).every((k) => REF_KEYS.has(k))) {
      ids.add(o.id);
      return;
    }
    for (const [k, x] of Object.entries(o)) {
      if (typeof x === "string" && (k === "assetId" || k.endsWith("AssetId")) && ASSET_ID.test(x)) ids.add(x);
      else visit(x, depth + 1);
    }
  };
  visit(value, 0);
  return [...ids];
}

/** The logo asset ids of a `brand` setting value (null roles skipped). */
function brandAssetIds(value: unknown): string[] {
  const logo = isObject(value) && isObject(value.logo) ? value.logo : null;
  if (!logo) return [];
  return [...new Set(LOGO_ROLES.map((r) => logo[r]).filter((id): id is string => typeof id === "string" && ASSET_ID.test(id)))];
}

/**
 * Every asset id the source shows, unique, in the order first met. Landing documents go through the renderer's own
 * `collectAssetIds`; the `brand` setting through its logo roles; a theme or another setting through the bounded walk.
 */
export function extractAssetIds(source: AssetSource): string[] {
  if (source.kind === "doc") return docAssetIds(source.doc);
  if (source.kind === "settings" && source.key === "brand") return brandAssetIds(source.value);
  return walkAssetIds(source.kind === "theme" ? source.theme : source.value);
}

/* ------------------------------------------------------------------ */
/* The index                                                           */
/* ------------------------------------------------------------------ */

/** The ids among `ids` that are assets of the scope's store (exact strings: the `_ci` collation also matches case variants). */
async function ownAssetIds(scope: StoreScope, ids: readonly string[]): Promise<string[]> {
  const wanted = [...new Set(ids.filter((id) => typeof id === "string" && ASSET_ID.test(id)))];
  const own = new Set<string>();
  for (let i = 0; i < wanted.length; i += CHUNK) {
    const rows = await db.select({ id: assets.id }).from(assets).where(whereStore(assets, scope, inArray(assets.id, wanted.slice(i, i + CHUNK))));
    for (const r of rows) own.add(r.id);
  }
  return wanted.filter((id) => own.has(id));
}

const isDeadlock = (err: unknown): boolean => {
  let e: unknown = err;
  for (let depth = 0; e && typeof e === "object" && depth < 4; depth++) {
    const { code, errno, cause } = e as { code?: unknown; errno?: unknown; cause?: unknown };
    if (code === "ER_LOCK_DEADLOCK" || errno === 1213) return true;
    e = cause;
  }
  return false;
};

/**
 * Replaces the rows of one owner of the scope's store: `ids` filtered to the store's own assets, each with `live`.
 * An empty list removes the owner's rows (a deleted page, a version that stopped being live). Returns how many rows
 * the owner has now. Throws RangeError for an unknown owner kind or a malformed owner id.
 */
export async function syncAssetRefs(scope: WriteScope, ownerKind: AssetOwnerKind, ownerId: string, ids: readonly string[], opts: { live: boolean }): Promise<{ refs: number }> {
  if (!ASSET_OWNER_KINDS.includes(ownerKind)) throw new RangeError(`asset-refs: unknown owner kind ${String(ownerKind)}`);
  if (typeof ownerId !== "string" || !OWNER_ID.test(ownerId)) throw new RangeError("asset-refs: malformed owner id");
  if (ids.length > MAX_IDS) throw new RangeError(`asset-refs: more than ${MAX_IDS} ids for one owner`);
  const own = await ownAssetIds(scope, ids);
  const live = opts.live === true;
  for (let attempt = 1; ; attempt++) {
    try {
      await db.transaction(async (tx) => {
        await tx.delete(assetRefs).where(whereStore(assetRefs, scope, eq(assetRefs.ownerKind, ownerKind), eq(assetRefs.ownerId, ownerId)));
        if (own.length) {
          await tx
            .insert(assetRefs)
            .ignore()
            .values(own.map((assetId) => storeValues(scope, { assetId, ownerKind, ownerId, live })));
        }
      });
      return { refs: own.length };
    } catch (err) {
      if (attempt >= SYNC_TRIES || !isDeadlock(err)) throw err;
      await new Promise((r) => setTimeout(r, 5 + Math.floor(Math.random() * 25 * attempt)));
    }
  }
}

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

async function ownsAsset(scope: StoreScope, assetId: string): Promise<boolean> {
  if (!ASSET_ID.test(assetId)) return false;
  return (await ownAssetIds(scope, [assetId])).length === 1;
}

/** How many documents of each kind the scan reads: the plan's `pages_max`, bounded. */
async function scanLimit(scope: StoreScope): Promise<number> {
  try {
    const { entitlement } = await import("@/lib/tenancy/entitlements");
    const max = await entitlement(scope, "pages_max");
    return typeof max === "number" && max > 0 ? Math.min(SCAN_CEILING, max) : SCAN_CEILING;
  } catch {
    return SCAN_CEILING;
  }
}

interface ScannedPage {
  id: string;
  name: string;
  slug: string;
  versionId: string | null;
}

/** The store's live landing pages whose live version shows `assetId` (keyset batches, ≤ `limit` documents). */
async function scanLive(scope: StoreScope, assetId: string, limit: number): Promise<ScannedPage[]> {
  const out: ScannedPage[] = [];
  let after = "";
  for (let read = 0; read < limit; ) {
    const rows = await db
      .select({ id: pages.id, name: pages.name, slug: pages.slug, versionId: pageVersions.id, doc: pageVersions.doc })
      .from(pages)
      .innerJoin(pageVersions, and(eq(pageVersions.id, pages.publishedVersionId), inStore(pageVersions, scope)))
      .where(whereStore(pages, scope, eq(pages.status, "published"), eq(pages.kind, "landing"), gt(pages.id, after)))
      .orderBy(asc(pages.id))
      .limit(Math.min(SCAN_BATCH, limit - read));
    for (const r of rows) if (docAssetIds(r.doc).includes(assetId)) out.push({ id: r.id, name: r.name, slug: r.slug, versionId: r.versionId });
    read += rows.length;
    if (rows.length < SCAN_BATCH) break;
    after = rows[rows.length - 1]!.id;
  }
  return out;
}

/** The store's non-archived landing pages whose draft shows `assetId`. */
async function scanDrafts(scope: StoreScope, assetId: string, limit: number): Promise<ScannedPage[]> {
  const out: ScannedPage[] = [];
  let after = "";
  for (let read = 0; read < limit; ) {
    const rows = await db
      .select({ id: pages.id, name: pages.name, slug: pages.slug, doc: pages.draft })
      .from(pages)
      .where(whereStore(pages, scope, ne(pages.status, "archived"), eq(pages.kind, "landing"), gt(pages.id, after)))
      .orderBy(asc(pages.id))
      .limit(Math.min(SCAN_BATCH, limit - read));
    for (const r of rows) if (docAssetIds(r.doc).includes(assetId)) out.push({ id: r.id, name: r.name, slug: r.slug, versionId: null });
    read += rows.length;
    if (rows.length < SCAN_BATCH) break;
    after = rows[rows.length - 1]!.id;
  }
  return out;
}

/** Whether the scope's store's brand logo (any role) is `assetId`. */
async function isBrandLogo(scope: StoreScope, assetId: string): Promise<boolean> {
  const { getStoreSetting } = await import("@/lib/settings");
  return brandAssetIds(await getStoreSetting(scope, "brand")).includes(assetId);
}

/** The index rows of one asset, page names resolved; rows whose owner no longer exists are left out (stale). */
async function indexedUses(scope: StoreScope, assetId: string): Promise<AssetUse[]> {
  const rows = await db
    .select({ ownerKind: assetRefs.ownerKind, ownerId: assetRefs.ownerId, live: assetRefs.live })
    .from(assetRefs)
    .where(whereStore(assetRefs, scope, eq(assetRefs.assetId, assetId)))
    .limit(MAX_IDS);
  const pageIds = rows.filter((r) => r.ownerKind === "page").map((r) => r.ownerId);
  const versionIds = rows.filter((r) => r.ownerKind === "page_version").map((r) => r.ownerId);
  const byPage = new Map<string, { name: string; slug: string }>();
  const byVersion = new Map<string, { pageId: string; name: string; slug: string; published: boolean }>();
  for (let i = 0; i < pageIds.length; i += CHUNK) {
    const found = await db
      .select({ id: pages.id, name: pages.name, slug: pages.slug })
      .from(pages)
      .where(whereStore(pages, scope, inArray(pages.id, pageIds.slice(i, i + CHUNK)), ne(pages.status, "archived")));
    for (const p of found) byPage.set(p.id, p);
  }
  for (let i = 0; i < versionIds.length; i += CHUNK) {
    const found = await db
      .select({ versionId: pageVersions.id, pageId: pages.id, name: pages.name, slug: pages.slug, status: pages.status, liveVersionId: pages.publishedVersionId })
      .from(pageVersions)
      .innerJoin(pages, and(eq(pages.id, pageVersions.pageId), inStore(pages, scope)))
      .where(whereStore(pageVersions, scope, inArray(pageVersions.id, versionIds.slice(i, i + CHUNK))));
    for (const v of found) byVersion.set(v.versionId, { pageId: v.pageId, name: v.name, slug: v.slug, published: v.status === "published" && v.liveVersionId === v.versionId });
  }
  const out: AssetUse[] = [];
  for (const r of rows) {
    if (r.ownerKind === "page") {
      const p = byPage.get(r.ownerId);
      if (p) out.push({ ownerKind: r.ownerKind, ownerId: r.ownerId, live: r.live, pageId: r.ownerId, pageName: p.name, pageSlug: p.slug });
    } else if (r.ownerKind === "page_version") {
      // a version is live while it is its page's published one; a row the publish path has not updated yet is not
      const v = byVersion.get(r.ownerId);
      if (v) out.push({ ownerKind: r.ownerKind, ownerId: r.ownerId, live: r.live && v.published, pageId: v.pageId, pageName: v.name, pageSlug: v.slug });
    } else out.push({ ownerKind: r.ownerKind, ownerId: r.ownerId, live: r.live });
  }
  return out;
}

const usageKey = (u: Pick<AssetUse, "ownerKind" | "ownerId">) => `${u.ownerKind}:${u.ownerId}`;

/**
 * Where one of the store's assets is used: the index rows, united (until CCR r1-p8-7) with the exact scan of the
 * store's drafts, live versions and brand logo. Live uses first, then by page name. `[]` for a malformed, missing or
 * another store's id.
 */
export async function assetUsage(scope: StoreScope, assetId: string): Promise<AssetUse[]> {
  if (!(await ownsAsset(scope, assetId))) return [];
  const limit = await scanLimit(scope);
  const [indexed, live, drafts, logo] = await Promise.all([indexedUses(scope, assetId), scanLive(scope, assetId, limit), scanDrafts(scope, assetId, limit), isBrandLogo(scope, assetId)]);
  const uses = new Map<string, AssetUse>();
  for (const u of indexed) uses.set(usageKey(u), u);
  for (const p of live) {
    const u: AssetUse = { ownerKind: "page_version", ownerId: p.versionId!, live: true, pageId: p.id, pageName: p.name, pageSlug: p.slug };
    uses.set(usageKey(u), u);
  }
  for (const p of drafts) {
    const u: AssetUse = { ownerKind: "page", ownerId: p.id, live: false, pageId: p.id, pageName: p.name, pageSlug: p.slug };
    if (!uses.has(usageKey(u))) uses.set(usageKey(u), u);
  }
  if (logo) uses.set("brand:brand", { ownerKind: "brand", ownerId: "brand", live: true });
  return [...uses.values()].sort((a, b) => Number(b.live) - Number(a.live) || (a.pageName ?? "").localeCompare(b.pageName ?? "") || usageKey(a).localeCompare(usageKey(b)));
}

/** The same answer per page (draft and live merged) plus the logo flag: the dashboard's "Used in" and the delete dialog. */
export function usageByPage(uses: readonly AssetUse[]): AssetUsageByPage {
  const byPage = new Map<string, AssetUsageByPage["pages"][number]>();
  for (const u of uses) {
    if (!u.pageId || (u.ownerKind !== "page" && u.ownerKind !== "page_version")) continue;
    const p = byPage.get(u.pageId) ?? { id: u.pageId, name: u.pageName ?? "", slug: u.pageSlug ?? "", inDraft: false, live: false };
    if (u.ownerKind === "page") p.inDraft = true;
    else if (u.live) p.live = true;
    byPage.set(u.pageId, p);
  }
  return {
    pages: [...byPage.values()].filter((p) => p.inDraft || p.live).sort((a, b) => Number(b.live) - Number(a.live) || a.name.localeCompare(b.name)),
    storeLogo: uses.some((u) => u.ownerKind === "brand" && u.live),
  };
}

/** `assetUsage` in the dashboard's shape. */
export async function assetUsageByPage(scope: StoreScope, assetId: string): Promise<AssetUsageByPage> {
  return usageByPage(await assetUsage(scope, assetId));
}

/**
 * Ids of the store's live landing pages whose live version shows `assetId` (the cutout re-render, DES-§4.11): the
 * index's live version rows united with the exact scan of the live versions. `[]` for another store's id.
 */
export async function livePagesUsing(scope: StoreScope, assetId: string): Promise<string[]> {
  if (!(await ownsAsset(scope, assetId))) return [];
  const [indexed, scanned] = await Promise.all([indexedUses(scope, assetId), scanLive(scope, assetId, await scanLimit(scope))]);
  const ids = new Set(scanned.map((p) => p.id));
  for (const u of indexed) if (u.ownerKind === "page_version" && u.live && u.pageId) ids.add(u.pageId);
  return [...ids];
}

/* ------------------------------------------------------------------ */
/* The nightly reconcile                                               */
/* ------------------------------------------------------------------ */

/** pages read per statement by the reconcile */
const RECONCILE_PAGE = 200;

export interface RefsReconcileResult {
  /** pages looked at */
  pages: number;
  /** owners whose rows were rebuilt from their source (an owner with no asset of the store, and no rows, is not counted) */
  rebuilt: number;
  /** owners whose rows were removed (gone, archived, no longer live) */
  removed: number;
}

/**
 * Heals the scope's store's index (the refs.reconcile job, §G.5): for every page, its draft (`page`, not live) and its
 * live version (`page_version`, live), and for the brand setting (`brand`, live):
 * - a draft is rebuilt when it has no rows or its page changed after them (`pages.updated_at` > the rows' newest
 *   `updated_at`); a live version (an immutable document) when it has no rows or a row not marked live; the brand when
 *   its rows are not exactly the setting's own logo assets;
 * - the rows of a page that no longer exists or is archived, and of a version that is no longer its page's live one,
 *   are removed.
 * Other owner kinds (products, themes, R2) are left to their own call sites. `yieldFn` runs between batches.
 */
export async function reconcileStoreRefs(scope: WriteScope, opts: { yieldFn?: () => Promise<void> } = {}): Promise<RefsReconcileResult> {
  const pause = opts.yieldFn ?? (() => Promise.resolve());
  const groups = new Map<string, { at: Date | null; minLive: number }>();
  const groupRows = await db
    .select({
      ownerKind: assetRefs.ownerKind,
      ownerId: assetRefs.ownerId,
      at: sql<Date | null>`MAX(${assetRefs.updatedAt})`.mapWith(assetRefs.updatedAt),
      minLive: sql<number>`MIN(${assetRefs.live})`.mapWith(Number),
    })
    .from(assetRefs)
    .where(whereStore(assetRefs, scope, inArray(assetRefs.ownerKind, ["page", "page_version", "brand"])))
    .groupBy(assetRefs.ownerKind, assetRefs.ownerId);
  for (const g of groupRows) groups.set(`${g.ownerKind}:${g.ownerId}`, { at: g.at, minLive: g.minLive });

  const drafts: string[] = [];
  const versions: string[] = [];
  const keep = new Set<string>();
  let pageCount = 0;
  let after = "";
  for (;;) {
    const batch = await db
      .select({ id: pages.id, status: pages.status, updatedAt: pages.updatedAt, versionId: pages.publishedVersionId })
      .from(pages)
      .where(whereStore(pages, scope, after ? gt(pages.id, after) : undefined))
      .orderBy(asc(pages.id))
      .limit(RECONCILE_PAGE);
    for (const p of batch) {
      pageCount++;
      if (p.status !== "archived") {
        const key = `page:${p.id}`;
        keep.add(key);
        const g = groups.get(key);
        if (!g || !g.at || p.updatedAt.getTime() > g.at.getTime()) drafts.push(p.id);
      }
      if (p.status === "published" && p.versionId) {
        const key = `page_version:${p.versionId}`;
        keep.add(key);
        const g = groups.get(key);
        if (!g || g.minLive === 0) versions.push(p.versionId);
      }
    }
    if (batch.length < RECONCILE_PAGE) break;
    after = batch[batch.length - 1]!.id;
    await pause();
  }

  let rebuilt = 0;
  for (let i = 0; i < drafts.length; i += SCAN_BATCH) {
    const rows = await db
      .select({ id: pages.id, doc: pages.draft })
      .from(pages)
      .where(whereStore(pages, scope, inArray(pages.id, drafts.slice(i, i + SCAN_BATCH))));
    for (const r of rows) {
      const { refs } = await syncAssetRefs(scope, "page", r.id, docAssetIds(r.doc).slice(0, MAX_IDS), { live: false });
      if (refs > 0 || groups.has(`page:${r.id}`)) rebuilt++; // a draft with no asset of the store has no rows to heal
    }
    await pause();
  }
  for (let i = 0; i < versions.length; i += SCAN_BATCH) {
    const rows = await db
      .select({ id: pageVersions.id, doc: pageVersions.doc })
      .from(pageVersions)
      .where(whereStore(pageVersions, scope, inArray(pageVersions.id, versions.slice(i, i + SCAN_BATCH))));
    for (const r of rows) {
      const { refs } = await syncAssetRefs(scope, "page_version", r.id, docAssetIds(r.doc).slice(0, MAX_IDS), { live: true });
      if (refs > 0 || groups.has(`page_version:${r.id}`)) rebuilt++;
    }
    await pause();
  }

  // the brand logo: its rows must be exactly the setting's own assets, all live
  const { getStoreSetting } = await import("@/lib/settings");
  const logo = await ownAssetIds(scope, brandAssetIds(await getStoreSetting(scope, "brand", { fresh: true })));
  const brandRows = await db
    .select({ assetId: assetRefs.assetId, live: assetRefs.live })
    .from(assetRefs)
    .where(whereStore(assetRefs, scope, eq(assetRefs.ownerKind, "brand"), eq(assetRefs.ownerId, "brand")));
  const sameLogo = brandRows.length === logo.length && brandRows.every((r) => r.live && logo.includes(r.assetId));
  if (!sameLogo) {
    await syncAssetRefs(scope, "brand", "brand", logo, { live: true });
    if (logo.length) rebuilt++;
  }

  // rows of owners that are gone, archived or no longer live
  const stale: Record<"page" | "page_version", string[]> = { page: [], page_version: [] };
  for (const g of groupRows) {
    if ((g.ownerKind === "page" || g.ownerKind === "page_version") && !keep.has(`${g.ownerKind}:${g.ownerId}`)) stale[g.ownerKind].push(g.ownerId);
  }
  let removed = !sameLogo && !logo.length && brandRows.length ? 1 : 0;
  for (const kind of ["page", "page_version"] as const) {
    for (let i = 0; i < stale[kind].length; i += CHUNK) {
      const ids = stale[kind].slice(i, i + CHUNK);
      await db.delete(assetRefs).where(whereStore(assetRefs, scope, eq(assetRefs.ownerKind, kind), inArray(assetRefs.ownerId, ids)));
      removed += ids.length;
    }
  }
  return { pages: pageCount, rebuilt, removed };
}
