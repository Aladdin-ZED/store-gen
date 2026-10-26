import "server-only";
/**
 * Pixel usage (docs/OFFERS.md §A.2 #5): computed, never stored. Which pages of the store fire a pixel —
 * in their draft, on their live version — and how many of its non-revoked exports bake it in.
 *
 *   pixelUsage(scope)                   every pixel → usage (≤ 1000 non-archived pages; cached 30 s per store)
 *   pixelUsageOf(scope, platform, id)   one pixel's pages (LIKE prefilter, confirmed on the tracking ids)
 *   invalidatePixelUsage(storeId)       after saves, publishes, replaces (this worker)
 *
 * Per store (docs/STORE-SAAS.md §E.3, §E.6; PIX-05): every scan carries the store predicate on pages,
 * versions and exports, and the index is the store's entry of `scopedCache("pixel-usage")`, so one
 * store's pages never count in another store's library.
 *
 * Only `$.tracking` of each stored document is read (JSON_EXTRACT on the LONGTEXT column), never the
 * whole document, and ids are confirmed with pixelIdList on that value.
 */
import { and, desc, eq, isNull, ne, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { exportsTable, pages, pageVersions } from "@/lib/db/schema";
import { scopedCache } from "@/lib/tenancy/cache";
import { inStore, whereStore } from "@/lib/tenancy/sql";
import type { StoreScope } from "@/lib/tenancy/types";
import { PIXEL_ID_RE, type PixelPlatform } from "./ids";
import { NO_USAGE, pixelKey, trackingRefs, type PixelUsageCount } from "./library";

const TTL_MS = 30_000;
const PAGE_LIMIT = 1000;

export interface PixelPageUse {
  pageId: string;
  name: string;
  slug: string;
  inDraft: boolean;
  inLive: boolean;
  /** non-revoked exports of this page firing the pixel */
  exports: number;
}

export type UsageIndex = Map<string, PixelPageUse[]>;

const usageCache = () => scopedCache<UsageIndex>({ name: "pixel-usage", maxEntries: 500, ttlMs: TTL_MS });
const INDEX = "index";

/**
 * Drop the store's cached index. Without a store id every store's index goes: the form of today's
 * store-less callers (the publish path), until they pass the page's store (T3).
 */
export function invalidatePixelUsage(storeId?: string): void {
  if (storeId) usageCache().delete(storeId);
  else usageCache().clear();
}

/** `$.tracking` of a JSON column as raw JSON text (null when absent). */
const trackingOf = (col: SQL | typeof pages.draft | typeof pageVersions.doc) => sql<string | null>`JSON_EXTRACT(${col}, '$.tracking')`;

function parseTracking(raw: unknown): unknown {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(String(raw)) as unknown;
  } catch {
    return null;
  }
}

/** LIKE needle of an id inside stored JSON (pixel ids hold no LIKE wildcards: [0-9A-Za-z-]). */
const needle = (id: string) => `%"${id}"%`;

/** A page's live version, inside the store as well. */
const liveJoin = (scope: StoreScope) => and(eq(pageVersions.id, pages.publishedVersionId), inStore(pageVersions, scope));

async function scan(scope: StoreScope, filter?: { draft: SQL; version: SQL }): Promise<UsageIndex> {
  const [drafts, live, exps] = await Promise.all([
    db
      .select({ id: pages.id, name: pages.name, slug: pages.slug, tracking: trackingOf(pages.draft) })
      .from(pages)
      .where(whereStore(pages, scope, ne(pages.status, "archived"), filter?.draft))
      .limit(PAGE_LIMIT),
    db
      .select({ id: pages.id, name: pages.name, slug: pages.slug, tracking: trackingOf(pageVersions.doc) })
      .from(pages)
      .innerJoin(pageVersions, liveJoin(scope))
      .where(whereStore(pages, scope, eq(pages.status, "published"), filter?.version))
      .limit(PAGE_LIMIT),
    db
      .select({ pageId: exportsTable.pageId, name: pages.name, slug: pages.slug, tracking: trackingOf(pageVersions.doc) })
      .from(exportsTable)
      .innerJoin(pageVersions, and(eq(pageVersions.id, exportsTable.versionId), inStore(pageVersions, scope)))
      .innerJoin(pages, and(eq(pages.id, exportsTable.pageId), inStore(pages, scope)))
      .where(whereStore(exportsTable, scope, isNull(exportsTable.revokedAt), filter?.version))
      .limit(PAGE_LIMIT * 2),
  ]);
  const index: UsageIndex = new Map();
  const touch = (key: string, page: { id: string; name: string; slug: string }): PixelPageUse => {
    let list = index.get(key);
    if (!list) index.set(key, (list = []));
    let row = list.find((r) => r.pageId === page.id);
    if (!row) list.push((row = { pageId: page.id, name: page.name, slug: page.slug, inDraft: false, inLive: false, exports: 0 }));
    return row;
  };
  for (const r of drafts) for (const p of trackingRefs(parseTracking(r.tracking) as Record<string, unknown>)) touch(pixelKey(p.platform, p.id), r).inDraft = true;
  for (const r of live) for (const p of trackingRefs(parseTracking(r.tracking) as Record<string, unknown>)) touch(pixelKey(p.platform, p.id), r).inLive = true;
  for (const r of exps) for (const p of trackingRefs(parseTracking(r.tracking) as Record<string, unknown>)) touch(pixelKey(p.platform, p.id), { id: r.pageId, name: r.name, slug: r.slug }).exports++;
  return index;
}

/** Every pixel of the store → its pages (cached 30 s per store in this worker). */
export async function pixelUsage(scope: StoreScope, opts: { fresh?: boolean } = {}): Promise<UsageIndex> {
  const cache = usageCache();
  if (opts.fresh) cache.delete(scope.storeId, INDEX);
  return cache.getOrLoad(scope.storeId, INDEX, () => scan(scope));
}

/** One pixel's pages in the store, read now (LIKE prefilter, confirmed on the tracking ids). */
export async function pixelUsageOf(scope: StoreScope, platform: PixelPlatform, id: string): Promise<PixelPageUse[]> {
  if (!PIXEL_ID_RE[platform].test(id)) return [];
  const like = needle(id);
  const index = await scan(scope, { draft: sql`${pages.draft} LIKE ${like}`, version: sql`${pageVersions.doc} LIKE ${like}` });
  return sortUses(index.get(pixelKey(platform, id)) ?? []);
}

export const sortUses = (list: PixelPageUse[]) => [...list].sort((a, b) => Number(b.inLive) - Number(a.inLive) || a.name.localeCompare(b.name));

/** Counts of a pixel's pages. */
export function usageCount(list: readonly PixelPageUse[] | undefined): PixelUsageCount {
  if (!list?.length) return NO_USAGE;
  return {
    pages: list.filter((r) => r.inDraft || r.inLive).length,
    live: list.filter((r) => r.inLive).length,
    exports: list.reduce((n, r) => n + r.exports, 0),
    drafts: list.filter((r) => r.inDraft).length,
  };
}

export interface LivePagePixels {
  pixels: { platform: PixelPlatform; id: string }[];
  /** the live version answered "No pixel on this page" */
  none: boolean;
}

/** The live pixels of every live page of the store (Pages list chips, "No pixel" filter). */
export async function livePagePixels(scope: StoreScope): Promise<Record<string, LivePagePixels>> {
  const rows = await db
    .select({ id: pages.id, tracking: trackingOf(pageVersions.doc) })
    .from(pages)
    .innerJoin(pageVersions, liveJoin(scope))
    .where(whereStore(pages, scope, eq(pages.status, "published")))
    .limit(PAGE_LIMIT);
  const out: Record<string, LivePagePixels> = {};
  for (const r of rows) {
    const t = parseTracking(r.tracking) as Record<string, unknown> | null;
    out[r.id] = { pixels: trackingRefs(t), none: !!t && t.none === true };
  }
  return out;
}

export interface RecentPagePixels {
  pageId: string;
  name: string;
  pixels: { platform: PixelPlatform; id: string }[];
}

/** The store's most recently edited non-archived pages whose draft has pixels ("Same as…" in the wizard). */
export async function recentPagesWithPixels(scope: StoreScope, limit = 8): Promise<RecentPagePixels[]> {
  const rows = await db
    .select({ id: pages.id, name: pages.name, tracking: trackingOf(pages.draft) })
    .from(pages)
    .where(whereStore(pages, scope, ne(pages.status, "archived")))
    .orderBy(desc(pages.updatedAt))
    .limit(60);
  const out: RecentPagePixels[] = [];
  for (const r of rows) {
    const pixels = trackingRefs(parseTracking(r.tracking) as Record<string, unknown> | null);
    if (pixels.length) out.push({ pageId: r.id, name: r.name, pixels });
    if (out.length >= limit) break;
  }
  return out;
}
