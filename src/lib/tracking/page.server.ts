import "server-only";
/**
 * Which published document dresses the tracking page (P3 LANDING; landing.md LAN-§9.4): the shopper sees the look
 * she ordered from. An order's view takes its own version's ThemeSpec and locale (`orders.version_id`); the lookup
 * form takes the store's home page; either falls back to the store's most recently updated published page, then to
 * the brand defaults (no document: the page's neutral tokens). Every read carries the store's scope.
 */
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { pages, pageVersions } from "@/lib/db/schema";
import type { PageDoc } from "@/lib/page/schema";
import { validateDoc } from "@/lib/page/validate";
import { getStoreHomePage } from "@/lib/render/store-pages.server";
import { whereStore } from "@/lib/tenancy/sql";
import type { StoreRow, StoreScope } from "@/lib/tenancy/types";

export interface TrackDocSource {
  doc: PageDoc;
  /** the page's slug: the legal links' `?p=` theme hint */
  slug: string;
  pageId: string;
}

/** A page version's document of this store, validated (null: unknown here, or no longer valid). */
async function versionSource(scope: StoreScope, pageId: string, versionId: string): Promise<TrackDocSource | null> {
  const [row] = await db
    .select({ doc: pageVersions.doc, slug: pages.slug })
    .from(pageVersions)
    .innerJoin(pages, and(eq(pages.id, pageVersions.pageId), eq(pages.storeId, pageVersions.storeId)))
    .where(whereStore(pageVersions, scope, eq(pageVersions.id, versionId), eq(pageVersions.pageId, pageId), eq(pages.kind, "landing")))
    .limit(1);
  if (!row) return null;
  const { doc } = validateDoc(row.doc);
  return doc ? { doc, slug: row.slug, pageId } : null;
}

/** The store's most recently updated published page. */
async function latestPublished(scope: StoreScope): Promise<TrackDocSource | null> {
  const [row] = await db
    .select({ id: pages.id, slug: pages.slug, versionId: pages.publishedVersionId })
    .from(pages)
    .where(whereStore(pages, scope, eq(pages.status, "published")))
    .orderBy(desc(pages.updatedAt))
    .limit(1);
  return row?.versionId ? versionSource(scope, row.id, row.versionId) : null;
}

async function homeSource(scope: StoreScope, store: StoreRow): Promise<TrackDocSource | null> {
  const home = await getStoreHomePage(scope, store);
  if (!home) return null;
  const { doc } = validateDoc(home.doc);
  return doc ? { doc, slug: home.slug, pageId: home.pageId } : null;
}

/** The document of an order's view: its own version, else the home page, else the latest published page. */
export async function orderDocSource(scope: StoreScope, store: StoreRow, order: { pageId: string | null; versionId: string | null }): Promise<TrackDocSource | null> {
  // 0006: a store (v3) order has no landing page (page_id NULL); R1 rows always carry one
  return (order.versionId && order.pageId ? await versionSource(scope, order.pageId, order.versionId) : null) ?? (await homeSource(scope, store)) ?? (await latestPublished(scope));
}

/** The document of the lookup form: the home page, else the latest published page. */
export async function lookupDocSource(scope: StoreScope, store: StoreRow): Promise<TrackDocSource | null> {
  return (await homeSource(scope, store)) ?? (await latestPublished(scope));
}
