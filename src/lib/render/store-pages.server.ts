import "server-only";
/**
 * What a store's public routes serve (docs/STORE-SAAS.md §C.4.1, §C.8; PUB-02 … PUB-05, PUB-27; LP-20):
 *
 *   const page = await getPublishedPage(scope, store, "argan");     // GET <base>/argan (stored HTML, cached per store)
 *   const home = await getStoreHomePage(scope, store);              // GET <base> (stores.home_page_id, never another store's)
 *   const moved = await slugHistoryTarget(scope, "old-slug");       // LP-20: the slug that page lives at now, or null
 *   const legal = await getStoreLegalDocument(scope, store, "privacy", "argan");
 *   const urls = await listSitemapPages(scope, store);
 *
 * Every query carries the scope's store (§E.3): one store's slug, home, history or policies can never answer
 * another store's request. Published pages are served from the bytes rendered at publish time (no settings, no
 * React per request); legal documents are rendered on request from the published doc and the store's current
 * facts (./store-context.server.ts), then cached like pages.
 */
import { and, desc, eq, gt, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { pages, pageSlugHistory, pageVersions, storeSettings } from "@/lib/db/schema";
import type { PageDoc } from "@/lib/page/schema";
import { validateDoc } from "@/lib/page/validate";
import { inStore, whereStore } from "@/lib/tenancy/sql";
import type { StoreRow, StoreScope, WriteScope } from "@/lib/tenancy/types";
import { storePageLinks, type LegalKind } from "@/landing/context";
import { cacheGet, cacheSet } from "./cache.server";
import { renderLegalHtml, type RenderedHtml } from "./core";
import { isStoreSlug } from "./publish.server";
import { loadStoreRenderContext, storeAssetRows, storeResolver } from "./store-context.server";

export interface PublishedPage {
  pageId: string;
  versionId: string;
  slug: string;
  /** pages.public_key: the test render embeds it like the stored HTML does */
  publicKey: string;
  html: string;
  csp: string;
  etag: string;
  thankYouHtml: string;
  thankYouCsp: string;
  noindex: boolean;
  /** the published document (theme, locale, offers… of legal documents and test renders) */
  doc: PageDoc;
  /** when this version was published */
  publishedAt: Date;
}

/** The cache key of a store's entry: a bump of the store's catalog or address version is a new key (§E.6). */
const keyOf = (store: StoreRow, kind: string, path: string) => `${kind}:${path}:${store.catalogVersion}:${store.addressVersion}`;

/** Approximate bytes a cached page holds (its stored strings; the doc counted once). */
const pageBytes = (p: PublishedPage) => p.html.length + p.thankYouHtml.length + p.csp.length + p.thankYouCsp.length + JSON.stringify(p.doc).length;

async function loadPublished(scope: StoreScope, where: SQL): Promise<PublishedPage | null> {
  const [row] = await db
    .select({
      pageId: pages.id,
      slug: pages.slug,
      publicKey: pages.publicKey,
      versionId: pageVersions.id,
      html: pageVersions.html,
      csp: pageVersions.csp,
      etag: pageVersions.etag,
      thankYouHtml: pageVersions.thankYouHtml,
      thankYouCsp: pageVersions.thankYouCsp,
      doc: pageVersions.doc,
      createdAt: pageVersions.createdAt,
    })
    .from(pages)
    .innerJoin(pageVersions, and(eq(pageVersions.id, pages.publishedVersionId), eq(pageVersions.storeId, pages.storeId)))
    .where(whereStore(pages, scope, where, eq(pages.status, "published")))
    .limit(1);
  if (!row || !row.html || !row.csp || !row.etag || !row.thankYouHtml || !row.thankYouCsp) return null;
  return {
    pageId: row.pageId,
    versionId: row.versionId,
    slug: row.slug,
    publicKey: row.publicKey,
    html: row.html,
    csp: row.csp,
    etag: row.etag,
    thankYouHtml: row.thankYouHtml,
    thankYouCsp: row.thankYouCsp,
    noindex: row.doc?.seo?.noindex === true,
    doc: row.doc,
    publishedAt: row.createdAt,
  };
}

async function cached<T>(store: StoreRow, key: string, load: () => Promise<T | null>, bytes: (v: T) => number): Promise<T | null> {
  const hit = cacheGet<T>(store.id, key);
  if (hit) return hit.value;
  const value = await load();
  return cacheSet(store.id, key, value, value === null ? 0 : bytes(value));
}

/** The published version served at <base>/<slug> in this store (null: unknown, unpublished, reserved). */
export function getPublishedPage(scope: StoreScope, store: StoreRow, slug: string): Promise<PublishedPage | null> {
  if (!isStoreSlug(slug)) return Promise.resolve(null);
  return cached(store, keyOf(store, "page", slug), () => loadPublished(scope, eq(pages.slug, slug)), pageBytes);
}

/**
 * The page served at the store's home (<base>): `stores.home_page_id` when that page is published (§A.2, PUB-05:
 * never the latest page of another store, nor of this one); null → the store's "no page yet" document.
 */
export function getStoreHomePage(scope: StoreScope, store: StoreRow): Promise<PublishedPage | null> {
  const homeId = store.homePageId;
  if (!homeId) return Promise.resolve(null);
  return cached(store, keyOf(store, "home", homeId), () => loadPublished(scope, eq(pages.id, homeId)), pageBytes);
}

/**
 * LP-20 (LAN-§15.1): the slug a page lives at now when `slug` is one of its old slugs in this store (history row not
 * expired, page still published, slug moved); null otherwise (the route then answers its 404). Never across
 * stores: the history's primary key starts with the store.
 */
export async function slugHistoryTarget(scope: StoreScope, store: StoreRow, slug: string): Promise<string | null> {
  if (!isStoreSlug(slug)) return null;
  const found = await cached(
    store,
    keyOf(store, "moved", slug),
    async () => {
      const [row] = await db
        .select({ slug: pages.slug })
        .from(pageSlugHistory)
        .innerJoin(pages, and(eq(pages.id, pageSlugHistory.pageId), eq(pages.storeId, pageSlugHistory.storeId)))
        .where(and(inStore(pageSlugHistory, scope), eq(pageSlugHistory.slug, slug), gt(pageSlugHistory.until, sql`UTC_TIMESTAMP(3)`), eq(pages.status, "published")))
        .limit(1);
      return row && row.slug !== slug && isStoreSlug(row.slug) ? { slug: row.slug } : null;
    },
    () => 64,
  );
  return found?.slug ?? null;
}

/** Counts one redirect through an old slug (LAN-§15.1 "hits are counted like link clicks"); never throws. */
export async function countSlugHit(scope: WriteScope, slug: string): Promise<void> {
  try {
    await db
      .update(pageSlugHistory)
      .set({ hits: sql`${pageSlugHistory.hits} + 1` })
      .where(whereStore(pageSlugHistory, scope, eq(pageSlugHistory.slug, slug)));
  } catch {
    // a lost hit is not worth a failed redirect
  }
}

/** The page a legal document is dressed like: `?p=<slug>` of this store, else the home page, else its latest page. */
async function legalSource(scope: StoreScope, store: StoreRow, themeSlug: string | null): Promise<PublishedPage | null> {
  if (themeSlug && isStoreSlug(themeSlug)) {
    const page = await getPublishedPage(scope, store, themeSlug);
    if (page) return page;
  }
  const home = await getStoreHomePage(scope, store);
  if (home) return home;
  return cached(
    store,
    keyOf(store, "latest", ""),
    async () => {
      const [latest] = await db
        .select({ id: pages.id })
        .from(pages)
        .where(and(inStore(pages, scope), eq(pages.status, "published")))
        .orderBy(desc(pages.updatedAt))
        .limit(1);
      return latest ? loadPublished(scope, eq(pages.id, latest.id)) : null;
    },
    pageBytes,
  );
}

/** When the store's facts the legal texts are built from last changed (the `store` and `policies` settings). */
async function factsUpdatedAt(scope: StoreScope): Promise<Date | null> {
  const [row] = await db
    .select({ at: sql<Date | string | null>`MAX(${storeSettings.updatedAt})` })
    .from(storeSettings)
    .where(and(inStore(storeSettings, scope), sql`${storeSettings.key} IN ('store', 'policies')`));
  const at = row?.at ? new Date(row.at) : null;
  return at && Number.isFinite(at.getTime()) ? at : null;
}

/**
 * A legal document of the store (<base>/policies/<kind>, PUB-03): the theme, locale and form fields of the page it
 * is dressed like, the identity and contacts of the store now, "updated" at the later of that page's publish and
 * the last change of the store's facts. Null when the store has no published page or the doc no longer validates.
 */
export async function getStoreLegalDocument(scope: StoreScope, store: StoreRow, kind: LegalKind, themeSlug: string | null): Promise<RenderedHtml | null> {
  const page = await legalSource(scope, store, themeSlug);
  if (!page) return null;
  return cached(
    store,
    keyOf(store, "legal", `${page.versionId}:${page.slug}:${kind}`),
    async () => {
      const { doc } = validateDoc(page.doc);
      if (!doc) return null;
      const [rc, changed] = await Promise.all([loadStoreRenderContext(scope, store, { pageId: page.pageId }), factsUpdatedAt(scope)]);
      const rows = rc.info.logo ? await storeAssetRows(scope, [rc.info.logo.id]) : [];
      const updatedAt = new Date(Math.max(page.publishedAt.getTime(), changed?.getTime() ?? 0)).toISOString();
      return renderLegalHtml(doc, kind, {
        mode: "live",
        assets: storeResolver(rc.address, rows),
        store: rc.info,
        links: storePageLinks(rc.base, page.slug),
        updatedAt,
        mediaOrigins: rc.mediaOrigins,
      });
    },
    (r) => r.html.length + r.csp.length,
  );
}

/** Does the store have a published page at all? (its robots.txt says `Disallow: /` otherwise, §C.8) */
export async function storeHasPublishedPage(scope: StoreScope, store: StoreRow): Promise<boolean> {
  const found = await cached(
    store,
    keyOf(store, "any", ""),
    async () => {
      const [row] = await db
        .select({ id: pages.id })
        .from(pages)
        .where(and(inStore(pages, scope), eq(pages.status, "published")))
        .limit(1);
      return row ? { yes: true as const } : null;
    },
    () => 32,
  );
  return !!found;
}

export interface SitemapPage {
  slug: string;
  lastmod: Date;
}

/** The store's published, indexable pages for its sitemap (§C.8: canonical URLs only; at most 5,000). */
export async function listSitemapPages(scope: StoreScope, store: StoreRow): Promise<SitemapPage[]> {
  const list = await cached(
    store,
    keyOf(store, "sitemap", ""),
    async () => {
      const rows = await db
        .select({ slug: pages.slug, at: pageVersions.createdAt })
        .from(pages)
        .innerJoin(pageVersions, and(eq(pageVersions.id, pages.publishedVersionId), eq(pageVersions.storeId, pages.storeId)))
        .where(
          and(
            inStore(pages, scope),
            eq(pages.status, "published"),
            // seo.noindex pages stay out (JSON read in SQL: the version docs are not loaded)
            sql`COALESCE(JSON_UNQUOTE(JSON_EXTRACT(${pageVersions.doc}, '$.seo.noindex')), 'false') <> 'true'`,
          ),
        )
        .orderBy(desc(pageVersions.createdAt))
        .limit(5_000);
      return { pages: rows.filter((r) => isStoreSlug(r.slug)).map((r) => ({ slug: r.slug, lastmod: r.at })) };
    },
    (v) => 64 + v.pages.length * 96,
  );
  return list?.pages ?? [];
}
