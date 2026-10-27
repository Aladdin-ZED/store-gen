import "server-only";
/**
 * Asset helpers for the store's admin lists: slim asset rows for thumbnails/previews (only what the landing renderer
 * needs), the media library's default alt text, where a file is used, and the library counts.
 *
 * Alt text convention: assets have no dedicated column, so the library keeps the default alt as a
 * tag "alt:<text>" in assets.tags (searchable by the media API's `q`). Pages keep their own alt on
 * each AssetRef; this default pre-fills it when an image is picked.
 *
 * Multi-tenant (docs/STORE-SAAS.md §E.3, ADM-24): every read is the scope's store only (an asset id of another store
 * answers like a missing one; ids are per store, D21) and the alt write takes a `WriteScope`.
 */
import { and, count, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { assets, pages, pageVersions } from "@/lib/db/schema";
import { ASSET_ID_RE } from "@/lib/media";
import { assetRowOf } from "@/lib/media/asset-row";
import type { AssetRef, PageDoc } from "@/lib/page/schema";
import { getStoreSetting } from "@/lib/settings";
import { entitlement } from "@/lib/tenancy/entitlements";
import { byId, inStore, whereStore } from "@/lib/tenancy/sql";
import type { StoreScope, WriteScope } from "@/lib/tenancy/types";
import { affected, auditIn, type Actor } from "./store-audit";
import { collectAssetIds, type AssetRowLike } from "@/landing/context";

export type PreviewAssetRow = AssetRowLike;
export type PreviewAssetMap = Record<string, PreviewAssetRow>;

export const ALT_TAG_PREFIX = "alt:";
export const ALT_MAX = 200;

export function altFromTags(tags: readonly string[] | null | undefined): string {
  const tag = tags?.find((t) => t.startsWith(ALT_TAG_PREFIX));
  return tag ? tag.slice(ALT_TAG_PREFIX.length) : "";
}

/** The store's asset rows among `ids` (unknown and other stores' ids are left out), in chunks of 500. */
async function storeAssetRows(scope: StoreScope, ids: readonly string[]) {
  const wanted = [...new Set(ids.filter((id) => ASSET_ID_RE.test(id)))];
  const rows: (typeof assets.$inferSelect)[] = [];
  for (let i = 0; i < wanted.length; i += 500) {
    rows.push(...(await db.select().from(assets).where(whereStore(assets, scope, inArray(assets.id, wanted.slice(i, i + 500))))));
  }
  return rows;
}

/** Asset rows (by id) of the store for every image the documents (and extra refs, e.g. the store logo) reference. */
export async function previewAssetsFor(scope: StoreScope, docs: readonly PageDoc[], extra: readonly (AssetRef | undefined)[] = []): Promise<PreviewAssetMap> {
  const ids = new Set<string>();
  for (const doc of docs) for (const id of collectAssetIds(doc, [...extra])) ids.add(id);
  for (const ref of extra) if (ref?.id) ids.add(ref.id);
  if (!ids.size) return {};
  const rows = await storeAssetRows(scope, [...ids]);
  // the renderer row every path shares (subject analysis included): previews crop like the live page
  return Object.fromEntries(rows.map((r) => [r.id, assetRowOf(r)]));
}

/** How many of `ids` are files of the store's library (a document may only reference those, §E.3 rule 5). */
export async function countStoreAssets(scope: StoreScope, ids: readonly string[]): Promise<number> {
  return (await storeAssetRows(scope, ids)).length;
}

/** Strip control characters and collapse whitespace; ≤ ALT_MAX chars. */
export function cleanAlt(input: string): string {
  return input
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, ALT_MAX);
}

/** Set (or clear, with "") the library's default alt text of one of the store's assets (audited). False if unknown. */
export async function setAssetAlt(scope: WriteScope, id: string, alt: string, actor: Actor): Promise<boolean> {
  if (!ASSET_ID_RE.test(id)) return false;
  const [row] = await db.select({ tags: assets.tags }).from(assets).where(byId(assets, scope, id)).limit(1);
  if (!row) return false;
  const value = cleanAlt(alt);
  const tags = (row.tags ?? []).filter((t) => !t.startsWith(ALT_TAG_PREFIX));
  if (value) tags.push(ALT_TAG_PREFIX + value);
  if (affected(await db.update(assets).set({ tags }).where(byId(assets, scope, id))) === 0) return false;
  await auditIn(scope, actor, "media.alt_updated", { target: id });
  return true;
}

export interface AssetUsage {
  /** non-archived pages whose draft or live version shows the file */
  pages: { id: string; name: string; slug: string; inDraft: boolean; live: boolean }[];
  /** the file is one of the store's logos (brand: primary, mark, wordmark or inverse) */
  storeLogo: boolean;
}

/** LIKE pattern matching an asset id inside stored document JSON (ids are lowercase hex: no wildcards). */
const idNeedle = (id: string) => `%"${id}"%`;

/**
 * Published pages of the store whose LIVE version shows the file (what visitors see right now). Asset ids are
 * lowercase hex and only ever appear in documents as AssetRef ids, so a text search of the stored JSON is exact.
 */
export async function livePagesUsing(scope: StoreScope, id: string, limit = 200): Promise<{ id: string; name: string; slug: string }[]> {
  if (!ASSET_ID_RE.test(id)) return [];
  return db
    .select({ id: pages.id, name: pages.name, slug: pages.slug })
    .from(pages)
    .innerJoin(pageVersions, and(eq(pageVersions.id, pages.publishedVersionId), inStore(pageVersions, scope)))
    .where(whereStore(pages, scope, eq(pages.status, "published"), sql`${pageVersions.doc} LIKE ${idNeedle(id)}`))
    .limit(limit);
}

/** Whether the file is one of the store's logos (`brand.logo`, DES-R16). */
export async function isStoreLogo(scope: StoreScope, id: string): Promise<boolean> {
  const { logo } = await getStoreSetting(scope, "brand");
  return [logo.primary, logo.mark, logo.wordmark, logo.inverse].includes(id);
}

/** Where a file of the store is used (drafts, live versions, store logo), so deleting it never breaks a page by surprise. */
export async function assetUsage(scope: StoreScope, id: string): Promise<AssetUsage> {
  if (!ASSET_ID_RE.test(id)) return { pages: [], storeLogo: false };
  // another store's asset answers like a missing one (§E.3), even when one of this store's documents names its id
  const [own] = await db.select({ id: assets.id }).from(assets).where(byId(assets, scope, id)).limit(1);
  if (!own) return { pages: [], storeLogo: false };
  const [drafts, live, storeLogo] = await Promise.all([
    db
      .select({ id: pages.id, name: pages.name, slug: pages.slug })
      .from(pages)
      .where(whereStore(pages, scope, ne(pages.status, "archived"), sql`${pages.draft} LIKE ${idNeedle(id)}`))
      .limit(200),
    livePagesUsing(scope, id),
    isStoreLogo(scope, id),
  ]);
  const byPage = new Map<string, AssetUsage["pages"][number]>();
  for (const p of drafts) byPage.set(p.id, { ...p, inDraft: true, live: false });
  for (const p of live) byPage.set(p.id, { ...(byPage.get(p.id) ?? { ...p, inDraft: false }), live: true });
  return {
    pages: [...byPage.values()].sort((a, b) => Number(b.live) - Number(a.live) || a.name.localeCompare(b.name)),
    storeLogo,
  };
}

/** The store's library counts for the filter chips (images split into photos / cutouts). */
export async function mediaCounts(scope: StoreScope): Promise<{ all: number; photo: number; cutout: number; video: number }> {
  const rows = await db.select({ kind: assets.kind, alpha: assets.alpha, n: count() }).from(assets).where(inStore(assets, scope)).groupBy(assets.kind, assets.alpha);
  const out = { all: 0, photo: 0, cutout: 0, video: 0 };
  for (const r of rows) {
    const n = Number(r.n);
    out.all += n;
    if (r.kind === "video") out.video += n;
    else if (r.alpha) out.cutout += n;
    else out.photo += n;
  }
  return out;
}

/** The store's media storage against its plan (ADM-06: tenants see their own quota, never the platform database). */
export interface StoreStorage {
  /** what the store's files take (masters, variants, AVIF) */
  bytes: number;
  /** the plan's `media_bytes` limit; null while the entitlement can't be read or when it is unlimited */
  quotaBytes: number | null;
  /** bytes / quotaBytes (0 without a quota) */
  ratio: number;
  /** "warn" from 80 % of the quota (the §I.4 quota banner), "full" at the limit (uploads are refused) */
  level: "ok" | "warn" | "full";
}

export const STORAGE_WARN_RATIO = 0.8;

export async function storeStorage(scope: StoreScope): Promise<StoreStorage> {
  const [[row], quota] = await Promise.all([
    db.select({ bytes: sql<string | number | null>`COALESCE(SUM(${assets.storedBytes}), 0)` }).from(assets).where(inStore(assets, scope)),
    entitlement(scope, "media_bytes").catch(() => null),
  ]);
  const bytes = Number(row?.bytes ?? 0) || 0;
  const quotaBytes = typeof quota === "number" && quota > 0 ? quota : null;
  const ratio = quotaBytes ? bytes / quotaBytes : 0;
  return { bytes, quotaBytes, ratio, level: !quotaBytes ? "ok" : ratio >= 1 ? "full" : ratio >= STORAGE_WARN_RATIO ? "warn" : "ok" };
}
