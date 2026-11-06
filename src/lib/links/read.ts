import "server-only";
/**
 * The links screen's read model (P3 LANDING; landing.md LAN-§12.2): the store's short links, newest first, each with
 * its target resolved to a label (the page's title; the screen labels "Store home" and "Policy · <kind>" itself),
 * whether that target still answers (an unpublished or archived page makes the link a 404 until it is edited), the
 * stored clicks plus the ones counted in memory and not flushed yet, and the public address `storeUrl(store,
 * "/go/<code>")`. Also the picker's options: the store's published pages a link may open.
 */
import { and, desc, eq, inArray, like } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { pages, shortLinks } from "@/lib/db/schema";
import { isStoreSlug } from "@/lib/render/publish.server";
import { getStoreSetting } from "@/lib/settings";
import { whereStore } from "@/lib/tenancy/sql";
import type { StoreRow, StoreScope } from "@/lib/tenancy/types";
import { storeUrl } from "@/lib/urls";
import { pendingClicks } from "./clicks";
import { kindServed } from "./target";
import { isPolicyKind, type LinkTarget, type R2LinkTarget, type ShortLinkRow } from "./types";

/** The most links the screen lists (the plan's gauge is 200 by default). */
export const LINKS_LIST_MAX = 500;

/** A published page a link may open (the create and edit pickers). */
export interface LinkPageOption {
  id: string;
  title: string;
  slug: string;
}

async function servedKinds(scope: StoreScope, store: Pick<StoreRow, "mode">): Promise<(kind: string) => boolean> {
  const inStore = store.mode === "store" ? (await getStoreSetting(scope, "landing")).inStoreMode : false;
  return (kind) => kindServed(kind, store.mode, inStore);
}

/** The store's published pages a link may open, newest first. */
export async function linkPageOptions(scope: StoreScope, store: Pick<StoreRow, "mode">): Promise<LinkPageOption[]> {
  const served = await servedKinds(scope, store);
  const rows = await db
    .select({ id: pages.id, name: pages.name, slug: pages.slug, kind: pages.kind, versionId: pages.publishedVersionId })
    .from(pages)
    .where(whereStore(pages, scope, eq(pages.status, "published")))
    .orderBy(desc(pages.updatedAt))
    .limit(200);
  return rows.filter((p) => p.versionId && isStoreSlug(p.slug) && served(p.kind)).map((p) => ({ id: p.id, title: p.name, slug: p.slug }));
}

function targetOf(row: { targetKind: string; pageId: string | null; targetRef: string | null }): LinkTarget | R2LinkTarget {
  switch (row.targetKind) {
    case "page":
      return { kind: "page", pageId: row.pageId ?? "" };
    case "policy":
      return { kind: "policy", policy: isPolicyKind(row.targetRef) ? row.targetRef : "terms" };
    case "product":
      return { kind: "product", id: row.targetRef ?? "" };
    case "collection":
      return { kind: "collection", id: row.targetRef ?? "" };
    default:
      return { kind: "home" };
  }
}

/** The store's links for the screen (newest first, at most LINKS_LIST_MAX). */
export async function listShortLinks(scope: StoreScope, store: Pick<StoreRow, "id" | "handle" | "mode" | "primaryDomain">): Promise<ShortLinkRow[]> {
  const rows = await db
    .select({
      id: shortLinks.id,
      code: shortLinks.code,
      targetKind: shortLinks.targetKind,
      pageId: shortLinks.pageId,
      targetRef: shortLinks.targetRef,
      campaignId: shortLinks.campaignId,
      utm: shortLinks.utm,
      channel: shortLinks.channel,
      status: shortLinks.status,
      clicks: shortLinks.clicks,
      lastClickAt: shortLinks.lastClickAt,
      createdAt: shortLinks.createdAt,
    })
    .from(shortLinks)
    .where(whereStore(shortLinks, scope))
    .orderBy(desc(shortLinks.createdAt), desc(shortLinks.id))
    .limit(LINKS_LIST_MAX);
  if (!rows.length) return [];

  const pageIds = [...new Set(rows.flatMap((r) => (r.targetKind === "page" && r.pageId ? [r.pageId] : [])))];
  const found = pageIds.length
    ? await db
        .select({ id: pages.id, name: pages.name, slug: pages.slug, kind: pages.kind, status: pages.status, versionId: pages.publishedVersionId })
        .from(pages)
        .where(and(whereStore(pages, scope), inArray(pages.id, pageIds)))
    : [];
  const byId = new Map(found.map((p) => [p.id, p]));
  const served = await servedKinds(scope, store);
  const pending = pendingClicks(scope.storeId);

  return rows.map((r) => {
    const page = r.pageId ? byId.get(r.pageId) : undefined;
    const live =
      r.targetKind === "home" ||
      (r.targetKind === "policy" && isPolicyKind(r.targetRef)) ||
      (r.targetKind === "page" && !!page && page.status === "published" && !!page.versionId && isStoreSlug(page.slug) && served(page.kind));
    const extra = pending.get(r.id);
    const last = Math.max(r.lastClickAt?.getTime() ?? 0, extra?.last ?? 0);
    return {
      id: r.id,
      code: r.code,
      target: targetOf(r),
      targetTitle: r.targetKind === "page" ? (page?.name ?? null) : null,
      targetLive: live,
      channel: r.channel ?? null,
      utm: r.utm ?? {},
      status: r.status,
      clicks: r.clicks + (extra?.n ?? 0),
      lastClickAt: last ? new Date(last).toISOString() : null,
      campaignId: r.campaignId ?? null,
      createdAt: r.createdAt.toISOString(),
      url: storeUrl(store, `/go/${r.code}`),
    };
  });
}

/** ⌘K: the store's links whose code starts with `q` (at most `limit`). */
export async function searchLinkCodes(scope: StoreScope, q: string, limit = 5): Promise<{ id: string; code: string; status: "active" | "paused" }[]> {
  const prefix = q.trim().toLowerCase().replace(/^\/?go\//, "");
  if (prefix.length < 2 || !/^[a-z0-9-]+$/.test(prefix)) return [];
  const rows = await db
    .select({ id: shortLinks.id, code: shortLinks.code, status: shortLinks.status })
    .from(shortLinks)
    // the prefix holds [a-z0-9-] only: nothing for LIKE to escape
    .where(whereStore(shortLinks, scope, like(shortLinks.code, `${prefix}%`)))
    .orderBy(desc(shortLinks.createdAt))
    .limit(limit);
  return rows;
}
