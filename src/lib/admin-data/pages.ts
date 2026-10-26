import "server-only";
/**
 * Pages of one store for the dashboard: the library list (with 7-day funnel numbers and "unpublished changes"),
 * the page-level mutations of the Pages screen (duplicate, unpublish, archive, restore, delete, home page), the
 * generator's create-from-directions, and the console's read of a store's pages.
 *
 * Multi-tenant (docs/STORE-SAAS.md §E.3, D71): every function takes the scope first and every predicate carries the
 * store (`whereStore` / `byId` / `inStore` on joins); an id of another store answers exactly like a missing one;
 * inserts take `store_id` from the scope only; every write takes a `WriteScope`, so a platform or impersonation scope
 * cannot reach one. The store's home page is `stores.home_page_id` (the `home` setting is gone, SET-07).
 */
import { createHash } from "node:crypto";
import { and, asc, count, desc, eq, gte, inArray, like, ne, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { newId, newPublicKey } from "@/lib/db/ids";
import { pages, pageVersions, statsDaily, stores } from "@/lib/db/schema";
import type { PageDoc } from "@/lib/page/schema";
import { validateDoc } from "@/lib/page/validate";
import { invalidatePublished } from "@/lib/render/cache.server";
import { isServableSlug, RESERVED_SLUGS } from "@/lib/render/publish.server";
import { deletePageStats } from "@/lib/stats";
import { invalidateStore } from "@/lib/tenancy/cache";
import { STORE_RESERVED_SLUGS } from "@/lib/tenancy/handles";
import { getStoreById } from "@/lib/tenancy/public";
import { byId, inStore, storeValues, whereStore } from "@/lib/tenancy/sql";
import type { StoreScope, WriteScope } from "@/lib/tenancy/types";
import { affected, auditIn, likeEscape, type Actor } from "./store-audit";
import { addDays, dayKey, STATS_TZ } from "./time";

export type { Actor };

export type PageStatus = "draft" | "published" | "archived";

export interface PageListItem {
  id: string;
  slug: string;
  name: string;
  status: PageStatus;
  locale: string;
  isHome: boolean;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  /** the draft differs from what visitors get */
  unpublishedChanges: boolean;
  /** repaired draft for thumbnails (null when the draft cannot be rendered) */
  doc: PageDoc | null;
  productName: string;
  price: number | null;
  currency: string;
  archetype: string | null;
  versions: number;
  week: { uniques: number; orders: number; revenue: number };
}

export interface PageFilters {
  q?: string;
  /** "active" = draft + published (default) */
  status?: PageStatus | "active" | "all";
  sort?: "updated" | "name" | "orders";
}

export const docChecksum = (doc: unknown) => createHash("sha256").update(JSON.stringify(doc), "utf8").digest("hex");

/** The scope's own `stores` row (the store cache, §E.5): its home page and its calendar. */
const storeOf = (scope: StoreScope) => getStoreById(scope.storeId);

/** The store's home page (`stores.home_page_id`; null = automatic). */
export async function homePageId(scope: StoreScope): Promise<string | null> {
  return (await storeOf(scope))?.homePageId ?? null;
}

export async function listPages(scope: StoreScope, filters: PageFilters = {}): Promise<PageListItem[]> {
  const where: SQL[] = [];
  const status = filters.status ?? "active";
  if (status === "active") where.push(ne(pages.status, "archived"));
  else if (status !== "all") where.push(eq(pages.status, status));
  const q = filters.q?.trim().slice(0, 80);
  if (q) where.push(or(like(pages.name, `%${likeEscape(q)}%`), like(pages.slug, `%${likeEscape(q.toLowerCase())}%`))!);

  const rows = await db
    .select({
      id: pages.id,
      slug: pages.slug,
      name: pages.name,
      status: pages.status,
      locale: pages.locale,
      draft: pages.draft,
      createdAt: pages.createdAt,
      updatedAt: pages.updatedAt,
      publishedVersionId: pages.publishedVersionId,
      publishedAt: pageVersions.createdAt,
      publishedChecksum: pageVersions.checksum,
    })
    .from(pages)
    .leftJoin(pageVersions, and(eq(pageVersions.id, pages.publishedVersionId), inStore(pageVersions, scope)))
    .where(whereStore(pages, scope, ...where))
    .orderBy(filters.sort === "name" ? asc(pages.name) : desc(pages.updatedAt))
    .limit(500);
  if (!rows.length) return [];

  const ids = rows.map((r) => r.id);
  const store = await storeOf(scope);
  // the store's calendar day: stats_daily is bucketed by it
  const today = dayKey(new Date(), store?.timezone ?? STATS_TZ);
  const home = store?.homePageId ?? null;
  const [versionCounts, week] = await Promise.all([
    db
      .select({ pageId: pageVersions.pageId, n: count() })
      .from(pageVersions)
      .where(whereStore(pageVersions, scope, inArray(pageVersions.pageId, ids), ne(pageVersions.kind, "autosave")))
      .groupBy(pageVersions.pageId),
    db
      .select({
        pageId: statsDaily.pageId,
        uniques: sql<number>`COALESCE(SUM(${statsDaily.uniques}), 0)`,
        orders: sql<number>`COALESCE(SUM(${statsDaily.orders}), 0)`,
        revenue: sql<number>`COALESCE(SUM(${statsDaily.revenue}), 0)`,
      })
      .from(statsDaily)
      .where(whereStore(statsDaily, scope, inArray(statsDaily.pageId, ids), gte(statsDaily.day, addDays(today, -6))))
      .groupBy(statsDaily.pageId),
  ]);
  const versionsBy = new Map(versionCounts.map((v) => [v.pageId, Number(v.n)]));
  const weekBy = new Map(week.map((w) => [w.pageId, { uniques: Number(w.uniques), orders: Number(w.orders), revenue: Number(w.revenue) }]));

  const items = rows.map((r): PageListItem => {
    const { doc } = validateDoc(r.draft);
    const raw = r.draft as Partial<PageDoc> | null;
    return {
      id: r.id,
      slug: r.slug,
      name: r.name,
      status: r.status,
      locale: r.locale,
      isHome: r.id === home,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      publishedAt: r.status === "published" && r.publishedAt ? r.publishedAt.toISOString() : null,
      unpublishedChanges: r.status === "published" && !!r.publishedChecksum && r.publishedChecksum !== docChecksum(doc ?? r.draft),
      doc,
      productName: doc?.product.name ?? raw?.product?.name ?? r.name,
      price: doc?.items[0]?.price ?? null,
      currency: doc?.currency ?? raw?.currency ?? "MAD",
      archetype: doc?.theme.archetype ?? null,
      versions: versionsBy.get(r.id) ?? 0,
      week: weekBy.get(r.id) ?? { uniques: 0, orders: 0, revenue: 0 },
    };
  });
  if (filters.sort === "orders") items.sort((a, b) => b.week.orders - a.week.orders || b.week.uniques - a.week.uniques);
  return items;
}

/** Minimal list for filters, pickers and the command palette. */
export async function pageOptions(scope: StoreScope, opts: { includeArchived?: boolean } = {}): Promise<{ id: string; name: string; slug: string; status: PageStatus }[]> {
  return db
    .select({ id: pages.id, name: pages.name, slug: pages.slug, status: pages.status })
    .from(pages)
    .where(whereStore(pages, scope, opts.includeArchived ? undefined : ne(pages.status, "archived")))
    .orderBy(desc(pages.updatedAt))
    .limit(500);
}

export async function pageCounts(scope: StoreScope): Promise<Record<PageStatus, number>> {
  const rows = await db.select({ s: pages.status, n: count() }).from(pages).where(inStore(pages, scope)).groupBy(pages.status);
  const out: Record<PageStatus, number> = { draft: 0, published: 0, archived: 0 };
  for (const r of rows) out[r.s] = Number(r.n);
  return out;
}

/* ------------------------------------------------------------------ */
/* slugs                                                               */
/* ------------------------------------------------------------------ */

/** ASCII slug from a name (accents folded; non-Latin names fall back to "page"). */
export function slugify(input: string): string {
  const s = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return s && !RESERVED_SLUGS.has(s) ? s : "page";
}

/** A slug a page of the store can take: servable, and not one of the store's own route segments (§C.4.1). */
const storeSlugFree = (slug: string) => isServableSlug(slug) && !STORE_RESERVED_SLUGS.has(slug);

/** First free slug of the store: base, base-2, base-3… (each store has its own namespace, ADM-12). */
export async function uniqueSlug(scope: StoreScope, base: string): Promise<string> {
  const root = slugify(base);
  const taken = new Set(
    (await db.select({ slug: pages.slug }).from(pages).where(whereStore(pages, scope, like(pages.slug, `${likeEscape(root)}%`)))).map((r) => r.slug),
  );
  if (!taken.has(root) && storeSlugFree(root)) return root;
  for (let n = 2; n < 10_000; n++) {
    const candidate = `${root}-${n}`;
    if (!taken.has(candidate) && storeSlugFree(candidate)) return candidate;
  }
  return `${root}-${newId().slice(-6).toLowerCase()}`;
}

/* ------------------------------------------------------------------ */
/* mutations                                                           */
/* ------------------------------------------------------------------ */

async function getPageRow(scope: StoreScope, id: string) {
  const [row] = await db.select().from(pages).where(byId(pages, scope, id)).limit(1);
  return row ?? null;
}

/**
 * A copy's tracking: the same pixel ids, marked "Pixels copied from {page}" (docs/OFFERS.md §A.4)
 * until the owner keeps or edits them. A copy without ids keeps its answer as it is.
 */
export function copiedTracking(doc: PageDoc, from: string): PageDoc {
  const t = doc.tracking ?? {};
  const hasIds = !!(t.metaPixelId?.length || t.tiktokPixelId?.length || t.snapPixelId?.length || t.ga4Id?.length);
  if (!hasIds) return doc;
  return { ...doc, tracking: { ...t, copiedFrom: from.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 120) || "another page" } };
}

const cleanPageName = (s: string) => s.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);

/** mysql2 error code, looking through drizzle's wrapping (`cause`). */
function dbErrorCode(err: unknown): string | undefined {
  for (let e: unknown = err, depth = 0; e && typeof e === "object" && depth < 4; depth++) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === "string") return code;
    e = (e as { cause?: unknown }).cause;
  }
  return undefined;
}

/**
 * Insert a new draft page under the store's first free slug. Another page of the store may take the same address
 * between the check and the insert (`pages_store_slug_uq`): retried twice with a fresh slug.
 */
async function insertWithFreeSlug(scope: WriteScope, slugBase: string, insert: (slug: string) => Promise<void>): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    const slug = await uniqueSlug(scope, slugBase);
    try {
      await insert(slug);
      return slug;
    } catch (err) {
      if (dbErrorCode(err) !== "ER_DUP_ENTRY" || attempt >= 2) throw err;
    }
  }
}

/** Create a new draft page from a document (used by duplicate and "duplicate version as page"). */
export async function createPageFromDoc(
  scope: WriteScope,
  input: { name: string; doc: PageDoc; versionLabel: string; /** source page name: the copy's pixels get "copied from" */ copiedFrom?: string },
  actor: Actor,
): Promise<{ id: string; slug: string }> {
  if (input.copiedFrom !== undefined) input = { ...input, doc: copiedTracking(input.doc, input.copiedFrom) };
  const id = newId();
  const now = new Date();
  const name = cleanPageName(input.name) || "Untitled page";
  const slug = await insertWithFreeSlug(scope, input.name, (slug) =>
    db.transaction(async (tx) => {
      await tx.insert(pages).values(
        storeValues(scope, {
          id,
          slug,
          name,
          status: "draft" as const,
          locale: input.doc.locale,
          publicKey: newPublicKey(),
          draft: input.doc,
          createdBy: actor.userId,
          createdAt: now,
          updatedAt: now,
        }),
      );
      await tx.insert(pageVersions).values(
        storeValues(scope, {
          id: newId(),
          pageId: id,
          kind: "import" as const,
          label: input.versionLabel.slice(0, 160),
          doc: input.doc,
          checksum: docChecksum(input.doc),
          createdBy: actor.userId,
          createdAt: now,
        }),
      );
    }),
  );
  return { id, slug };
}

/**
 * The generator's "Use this direction" (GEN-01): a draft page from the chosen direction, every direction kept as a
 * "generation" version (the chosen one last, so it is the newest = the draft). The documents are validated by the
 * caller and their assets checked against the store (`assertOwned`).
 */
export async function createPageFromDirections(
  scope: WriteScope,
  input: { name: string; slugBase: string; chosen: number; directions: readonly { label: string; doc: PageDoc }[] },
  actor: Actor,
): Promise<{ id: string; slug: string }> {
  const { directions, chosen } = input;
  const page = directions[chosen];
  if (!page) throw new Error("createPageFromDirections: no chosen direction");
  const id = newId();
  const now = Date.now();
  const order = [...directions.keys()].filter((i) => i !== chosen).concat(chosen);
  const slug = await insertWithFreeSlug(scope, input.slugBase, (slug) =>
    db.transaction(async (tx) => {
      await tx.insert(pages).values(
        storeValues(scope, {
          id,
          slug,
          name: cleanPageName(input.name) || "Untitled page",
          status: "draft" as const,
          locale: page.doc.locale,
          publicKey: newPublicKey(),
          draft: page.doc,
          createdBy: actor.userId,
          createdAt: new Date(now),
          updatedAt: new Date(now),
        }),
      );
      await tx.insert(pageVersions).values(
        order.map((i, n) =>
          storeValues(scope, {
            id: newId(),
            pageId: id,
            kind: "generation" as const,
            label: `Direction ${i + 1} · ${directions[i]!.label}${i === chosen ? " (chosen)" : ""}`.slice(0, 160),
            doc: directions[i]!.doc,
            checksum: docChecksum(directions[i]!.doc),
            createdBy: actor.userId,
            createdAt: new Date(now - (order.length - 1 - n)),
          }),
        ),
      );
    }),
  );
  await auditIn(scope, actor, "page.generated", {
    target: id,
    meta: { archetypes: directions.map((d) => d.doc.theme.archetype), chosen: page.doc.theme.archetype, locale: page.doc.locale },
  });
  return { id, slug };
}

export async function duplicatePage(scope: WriteScope, id: string, actor: Actor): Promise<{ id: string; slug: string } | null> {
  const page = await getPageRow(scope, id);
  if (!page) return null;
  const created = await createPageFromDoc(scope, { name: `${page.name} (copy)`, doc: page.draft, versionLabel: `Duplicated from “${page.name}”`, copiedFrom: page.name }, actor);
  await auditIn(scope, actor, "page.duplicated", { target: created.id, meta: { from: id } });
  return created;
}

/*
 * Status changes (unpublish, archive, restore) leave updatedAt alone: it is the draft's
 * compare-and-swap stamp (builder autosave, publishPage), and the draft does not change.
 */

/** Take a page offline (its versions and its address are kept). */
export async function unpublishPage(scope: WriteScope, id: string, actor: Actor): Promise<boolean> {
  const res = await db
    .update(pages)
    .set({ status: "draft" })
    .where(and(byId(pages, scope, id), eq(pages.status, "published")));
  const ok = affected(res) === 1;
  if (ok) {
    invalidatePublished();
    await auditIn(scope, actor, "page.unpublished", { target: id });
  }
  return ok;
}

/** The store's home page goes back to automatic when it was `id` (a compare-and-set on the store's own row). */
async function clearHomeIf(scope: WriteScope, id: string): Promise<void> {
  const res = await db.update(stores).set({ homePageId: null }).where(and(eq(stores.id, scope.storeId), eq(stores.homePageId, id)));
  if (affected(res) > 0) invalidateStore(scope.storeId);
}

export async function archivePage(scope: WriteScope, id: string, actor: Actor): Promise<boolean> {
  const res = await db
    .update(pages)
    .set({ status: "archived" })
    .where(and(byId(pages, scope, id), ne(pages.status, "archived")));
  const ok = affected(res) === 1;
  if (ok) {
    await clearHomeIf(scope, id);
    invalidatePublished();
    await auditIn(scope, actor, "page.archived", { target: id });
  }
  return ok;
}

/** Bring an archived page back as a draft. */
export async function restoreArchivedPage(scope: WriteScope, id: string, actor: Actor): Promise<boolean> {
  const res = await db
    .update(pages)
    .set({ status: "draft" })
    .where(and(byId(pages, scope, id), eq(pages.status, "archived")));
  const ok = affected(res) === 1;
  if (ok) await auditIn(scope, actor, "page.unarchived", { target: id });
  return ok;
}

/**
 * Delete a page with its versions and analytics. Orders are kept (they are business records);
 * exports of the page stop working because their page no longer resolves.
 */
export async function deletePage(scope: WriteScope, id: string, actor: Actor): Promise<boolean> {
  const page = await getPageRow(scope, id);
  if (!page) return false;
  await clearHomeIf(scope, id);
  const removed = await db.transaction(async (tx) => {
    await tx.delete(pageVersions).where(whereStore(pageVersions, scope, eq(pageVersions.pageId, id)));
    return affected(await tx.delete(pages).where(byId(pages, scope, id)));
  });
  if (removed !== 1) return false;
  // the page was this store's (deleted above), so its analytics rows are too
  await deletePageStats(id);
  invalidatePublished();
  await auditIn(scope, actor, "page.deleted", { target: id, meta: { slug: page.slug, name: page.name } });
  return true;
}

/** Make a page the store's home (null → automatic: the latest published page). */
export async function setHomePage(scope: WriteScope, id: string | null, actor: Actor): Promise<boolean> {
  if (id) {
    const page = await getPageRow(scope, id);
    if (!page || page.status === "archived") return false;
  }
  // the scope's own `stores` row only (ADM-18: the old flag was cleared on every page of every store)
  await db.update(stores).set({ homePageId: id, updatedAt: new Date() }).where(eq(stores.id, scope.storeId));
  invalidateStore(scope.storeId);
  invalidatePublished();
  await auditIn(scope, actor, "page.home_set", { target: id ?? "auto" });
  return true;
}

export const PIXEL_KEYS = ["metaPixelId", "tiktokPixelId", "snapPixelId", "ga4Id"] as const;
/** @deprecated the store `pixels` setting is read only by the pixel library migration (§A.6) */
export type StorePixels = Pick<PageDoc["tracking"], (typeof PIXEL_KEYS)[number]>;

/* ------------------------------------------------------------------ */
/* console                                                             */
/* ------------------------------------------------------------------ */

/** One page of a store as the console's Pages strip and the health job read it (PLA-§7.5; rev 3 SEC-18: name, seoTitle). */
export interface ConsolePageRow {
  id: string;
  name: string;
  /** the published document's SEO title (null when unset or never published) */
  seoTitle: string | null;
  slug: string;
  status: PageStatus;
  updatedAt: Date;
  lastPublishedAt: Date | null;
  views30d: number;
  orders30d: number;
  versionsKept: number;
  storedBytes: number;
}

/**
 * Read-only, through any scope (platformScope for the console, systemScope for the health job): every page of the
 * store, newest first, with the last 30 store days of views and orders and what its versions keep.
 */
export async function listPagesForConsole(scope: StoreScope): Promise<ConsolePageRow[]> {
  const rows = await db
    .select({
      id: pages.id,
      name: pages.name,
      slug: pages.slug,
      status: pages.status,
      updatedAt: pages.updatedAt,
      draftBytes: sql<number>`LENGTH(${pages.draft})`,
      // the live document's title, read in SQL so no document is parsed; a row that isn't valid JSON gives NULL
      seoTitle: sql<string | null>`CASE WHEN JSON_VALID(${pageVersions.doc}) THEN JSON_UNQUOTE(JSON_EXTRACT(${pageVersions.doc}, '$.seo.title')) END`,
    })
    .from(pages)
    .leftJoin(pageVersions, and(eq(pageVersions.id, pages.publishedVersionId), inStore(pageVersions, scope)))
    .where(inStore(pages, scope))
    .orderBy(desc(pages.updatedAt))
    .limit(500);
  if (!rows.length) return [];

  const ids = rows.map((r) => r.id);
  const today = dayKey(new Date(), (await storeOf(scope))?.timezone ?? STATS_TZ);
  const [versions, stats] = await Promise.all([
    db
      .select({
        pageId: pageVersions.pageId,
        n: count(),
        bytes: sql<number>`COALESCE(SUM(LENGTH(${pageVersions.doc}) + COALESCE(LENGTH(${pageVersions.html}), 0) + COALESCE(LENGTH(${pageVersions.thankYouHtml}), 0)), 0)`,
        lastPublishedAt: sql<Date | null>`MAX(CASE WHEN ${pageVersions.kind} = 'publish' THEN ${pageVersions.createdAt} END)`.mapWith(pageVersions.createdAt),
      })
      .from(pageVersions)
      .where(whereStore(pageVersions, scope, inArray(pageVersions.pageId, ids)))
      .groupBy(pageVersions.pageId),
    db
      .select({
        pageId: statsDaily.pageId,
        views: sql<number>`COALESCE(SUM(${statsDaily.views}), 0)`,
        orders: sql<number>`COALESCE(SUM(${statsDaily.orders}), 0)`,
      })
      .from(statsDaily)
      .where(whereStore(statsDaily, scope, inArray(statsDaily.pageId, ids), gte(statsDaily.day, addDays(today, -29))))
      .groupBy(statsDaily.pageId),
  ]);
  const versionsBy = new Map(versions.map((v) => [v.pageId, v]));
  const statsBy = new Map(stats.map((s) => [s.pageId, s]));
  return rows.map((r) => {
    const v = versionsBy.get(r.id);
    const s = statsBy.get(r.id);
    const title = r.seoTitle?.trim();
    return {
      id: r.id,
      name: r.name,
      seoTitle: title ? title : null,
      slug: r.slug,
      status: r.status,
      updatedAt: r.updatedAt,
      lastPublishedAt: v?.lastPublishedAt ?? null,
      views30d: Number(s?.views ?? 0),
      orders30d: Number(s?.orders ?? 0),
      versionsKept: Number(v?.n ?? 0),
      storedBytes: Number(r.draftBytes ?? 0) + Number(v?.bytes ?? 0),
    };
  });
}
