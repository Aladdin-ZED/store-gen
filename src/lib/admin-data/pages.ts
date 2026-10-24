import "server-only";
/**
 * Pages for the admin: the library list (with 7-day funnel numbers and "unpublished changes"),
 * and the page-level mutations used by the Pages screen (duplicate, unpublish, archive, restore,
 * delete, home page). Call these only after requireUser() with the right permission.
 *
 * Multi-tenant (docs/STORE-SAAS.md §E.3, §K.1): T4 moves every function onto a StoreScope; `listPagesForConsole(scope)`
 * (the console and the health job, PLA Q.11, SEC-18) is frozen at C0a and throws "not implemented: T4" until then.
 */
import { createHash } from "node:crypto";
import { and, asc, count, desc, eq, gte, inArray, like, ne, or, sql, type SQL } from "drizzle-orm";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db/client";
import { newId, newPublicKey } from "@/lib/db/ids";
import { pages, pageVersions, statsDaily } from "@/lib/db/schema";
import type { PageDoc } from "@/lib/page/schema";
import { validateDoc } from "@/lib/page/validate";
import { invalidatePublished } from "@/lib/render/cache.server";
import { isServableSlug, RESERVED_SLUGS } from "@/lib/render/publish.server";
import { getSetting, setSetting } from "@/lib/settings";
import { deletePageStats } from "@/lib/stats";
import type { StoreScope } from "@/lib/tenancy/types";
import { addDays, dayKey } from "./time";

export type PageStatus = "draft" | "published" | "archived";

export interface Actor {
  id: string;
  ip?: string | null;
}

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
const likeEscape = (s: string) => s.replace(/[\\%_]/g, (m) => "\\" + m);

export async function homePageId(): Promise<string | null> {
  // the pages.is_home flag is gone (0004 copies it to stores.home_page_id); setHomePage always wrote the setting too
  const home = await getSetting("home");
  return home.pageId ?? null;
}

export async function listPages(filters: PageFilters = {}): Promise<PageListItem[]> {
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
    .leftJoin(pageVersions, eq(pageVersions.id, pages.publishedVersionId))
    .where(where.length ? and(...where) : undefined)
    .orderBy(filters.sort === "name" ? asc(pages.name) : desc(pages.updatedAt))
    .limit(500);
  if (!rows.length) return [];

  const ids = rows.map((r) => r.id);
  const today = dayKey();
  const [versionCounts, week, home] = await Promise.all([
    db
      .select({ pageId: pageVersions.pageId, n: count() })
      .from(pageVersions)
      .where(and(inArray(pageVersions.pageId, ids), ne(pageVersions.kind, "autosave")))
      .groupBy(pageVersions.pageId),
    db
      .select({
        pageId: statsDaily.pageId,
        uniques: sql<number>`COALESCE(SUM(${statsDaily.uniques}), 0)`,
        orders: sql<number>`COALESCE(SUM(${statsDaily.orders}), 0)`,
        revenue: sql<number>`COALESCE(SUM(${statsDaily.revenue}), 0)`,
      })
      .from(statsDaily)
      .where(and(inArray(statsDaily.pageId, ids), gte(statsDaily.day, addDays(today, -6))))
      .groupBy(statsDaily.pageId),
    homePageId(),
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
export async function pageOptions(opts: { includeArchived?: boolean } = {}): Promise<{ id: string; name: string; slug: string; status: PageStatus }[]> {
  return db
    .select({ id: pages.id, name: pages.name, slug: pages.slug, status: pages.status })
    .from(pages)
    .where(opts.includeArchived ? undefined : ne(pages.status, "archived"))
    .orderBy(desc(pages.updatedAt))
    .limit(500);
}

export async function pageCounts(): Promise<Record<PageStatus, number>> {
  const rows = await db.select({ s: pages.status, n: count() }).from(pages).groupBy(pages.status);
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

/** First free servable slug: base, base-2, base-3… */
export async function uniqueSlug(base: string): Promise<string> {
  const root = slugify(base);
  const taken = new Set(
    (await db.select({ slug: pages.slug }).from(pages).where(like(pages.slug, `${likeEscape(root)}%`))).map((r) => r.slug),
  );
  if (!taken.has(root) && isServableSlug(root)) return root;
  for (let n = 2; n < 10_000; n++) {
    const candidate = `${root}-${n}`;
    if (!taken.has(candidate) && isServableSlug(candidate)) return candidate;
  }
  return `${root}-${newId().slice(-6).toLowerCase()}`;
}

/* ------------------------------------------------------------------ */
/* mutations                                                           */
/* ------------------------------------------------------------------ */

async function getPageRow(id: string) {
  const [row] = await db.select().from(pages).where(eq(pages.id, id)).limit(1);
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

/** Create a new draft page from a document (used by duplicate and "duplicate version as page"). */
export async function createPageFromDoc(
  input: { name: string; doc: PageDoc; versionLabel: string; /** source page name: the copy's pixels get "copied from" */ copiedFrom?: string },
  actor: Actor,
): Promise<{ id: string; slug: string }> {
  if (input.copiedFrom !== undefined) input = { ...input, doc: copiedTracking(input.doc, input.copiedFrom) };
  const id = newId();
  const slug = await uniqueSlug(input.name);
  const now = new Date();
  const name = input.name.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 160) || "Untitled page";
  await db.transaction(async (tx) => {
    await tx.insert(pages).values({
      id,
      slug,
      name,
      status: "draft",
      locale: input.doc.locale,
      publicKey: newPublicKey(),
      draft: input.doc,
      createdBy: actor.id,
      createdAt: now,
      updatedAt: now,
    });
    await tx.insert(pageVersions).values({
      id: newId(),
      pageId: id,
      kind: "import",
      label: input.versionLabel.slice(0, 160),
      doc: input.doc,
      checksum: docChecksum(input.doc),
      createdBy: actor.id,
      createdAt: now,
    });
  });
  return { id, slug };
}

export async function duplicatePage(id: string, actor: Actor): Promise<{ id: string; slug: string } | null> {
  const page = await getPageRow(id);
  if (!page) return null;
  const created = await createPageFromDoc({ name: `${page.name} (copy)`, doc: page.draft, versionLabel: `Duplicated from “${page.name}”`, copiedFrom: page.name }, actor);
  await audit("page.duplicated", { userId: actor.id, target: created.id, meta: { from: id }, ip: actor.ip });
  return created;
}

/*
 * Status changes (unpublish, archive, restore) leave updatedAt alone: it is the draft's
 * compare-and-swap stamp (builder autosave, publishPage), and the draft does not change.
 */

/** Take a page offline (its versions and its address are kept). */
export async function unpublishPage(id: string, actor: Actor): Promise<boolean> {
  const res = await db
    .update(pages)
    .set({ status: "draft" })
    .where(and(eq(pages.id, id), eq(pages.status, "published")));
  const ok = affected(res) === 1;
  if (ok) {
    invalidatePublished();
    await audit("page.unpublished", { userId: actor.id, target: id, ip: actor.ip });
  }
  return ok;
}

async function clearHomeIf(id: string, actor: Actor): Promise<void> {
  const home = await getSetting("home");
  if (home.pageId === id) await setSetting("home", { pageId: null }, actor);
}

export async function archivePage(id: string, actor: Actor): Promise<boolean> {
  const res = await db.update(pages).set({ status: "archived" }).where(and(eq(pages.id, id), ne(pages.status, "archived")));
  const ok = affected(res) === 1;
  if (ok) {
    await clearHomeIf(id, actor);
    invalidatePublished();
    await audit("page.archived", { userId: actor.id, target: id, ip: actor.ip });
  }
  return ok;
}

/** Bring an archived page back as a draft. */
export async function restoreArchivedPage(id: string, actor: Actor): Promise<boolean> {
  const res = await db.update(pages).set({ status: "draft" }).where(and(eq(pages.id, id), eq(pages.status, "archived")));
  const ok = affected(res) === 1;
  if (ok) await audit("page.unarchived", { userId: actor.id, target: id, ip: actor.ip });
  return ok;
}

/**
 * Delete a page with its versions and analytics. Orders are kept (they are business records);
 * exports of the page stop working because their page no longer resolves.
 */
export async function deletePage(id: string, actor: Actor): Promise<boolean> {
  const page = await getPageRow(id);
  if (!page) return false;
  await clearHomeIf(id, actor);
  await db.transaction(async (tx) => {
    await tx.delete(pageVersions).where(eq(pageVersions.pageId, id));
    await tx.delete(pages).where(eq(pages.id, id));
  });
  await deletePageStats(id);
  invalidatePublished();
  await audit("page.deleted", { userId: actor.id, target: id, meta: { slug: page.slug, name: page.name }, ip: actor.ip });
  return true;
}

/** Make a page the one served at "/" (null → automatic: the latest published page). */
export async function setHomePage(id: string | null, actor: Actor): Promise<boolean> {
  if (id) {
    const page = await getPageRow(id);
    if (!page || page.status === "archived") return false;
  }
  await setSetting("home", { pageId: id }, actor);
  invalidatePublished();
  await audit("page.home_set", { userId: actor.id, target: id ?? "auto", ip: actor.ip });
  return true;
}

export const PIXEL_KEYS = ["metaPixelId", "tiktokPixelId", "snapPixelId", "ga4Id"] as const;
/** @deprecated the store `pixels` setting is read only by the pixel library migration (§A.6) */
export type StorePixels = Pick<PageDoc["tracking"], (typeof PIXEL_KEYS)[number]>;


export function affected(res: unknown): number {
  const head = Array.isArray(res) ? res[0] : res;
  const n = (head as { affectedRows?: number } | undefined)?.affectedRows;
  return typeof n === "number" ? n : 0;
}

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

/** Read-only, through any scope (platformScope for the console, systemScope for the health job). T4. */
export async function listPagesForConsole(scope: StoreScope): Promise<ConsolePageRow[]> {
  void scope;
  throw new Error("not implemented: T4 (listPagesForConsole)");
}
