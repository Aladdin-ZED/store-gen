import "server-only";
/**
 * Old addresses of a store's pages (docs/STORE-SAAS.md §C.4.1, §D.4 `page_slug_history`; landing.md LAN-§15.1,
 * LAN Q22, LP-20). When a page that was ever published moves, its old slug keeps answering for 12 months: the store
 * slug route (T3) looks the slug up here before its 404 and answers 308 to the page's new address while that page is
 * live. The primary key starts with the store, so one store's history never redirects another store's visitors.
 *
 * R1.0 home of P3's `recordSlugMove` (`src/lib/landing/slugs.ts` in R1, same signature, same rows).
 */
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { pages, pageSlugHistory } from "@/lib/db/schema";
import { byId, storeValues, whereStore } from "@/lib/tenancy/sql";
import type { WriteScope } from "@/lib/tenancy/types";

/** How long an old slug keeps redirecting (LAN-§15.1). */
export const SLUG_HISTORY_MONTHS = 12;

function monthsAhead(from: Date, months: number): Date {
  const d = new Date(from.getTime());
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

/**
 * After the page `pageId` moved away from `oldSlug`: remembers the old address when the page was ever published
 * (a draft that never went live has no address to keep), and drops the row of the slug the page now uses (it
 * serves the page itself, and a page that moves back must not redirect to itself). Upsert: an old slug that
 * already pointed at another page of the store now points at this one, with a fresh 12 months and no hits.
 * Returns whether a row was written.
 */
export async function recordSlugMove(scope: WriteScope, pageId: string, oldSlug: string, now = new Date()): Promise<boolean> {
  const [page] = await db
    .select({ slug: pages.slug, firstPublishedAt: pages.firstPublishedAt, publishedVersionId: pages.publishedVersionId })
    .from(pages)
    .where(byId(pages, scope, pageId))
    .limit(1);
  if (!page) return false;
  await releaseOldSlug(scope, page.slug);
  if (page.slug === oldSlug || (!page.firstPublishedAt && !page.publishedVersionId)) return false;
  const until = monthsAhead(now, SLUG_HISTORY_MONTHS);
  await db
    .insert(pageSlugHistory)
    .values(storeValues(scope, { slug: oldSlug, pageId, until, hits: 0, createdAt: now }))
    .onDuplicateKeyUpdate({ set: { pageId, until, hits: 0, createdAt: now } });
  return true;
}

/**
 * A page of the store takes `slug` (a move, a new page): the old address that pointed elsewhere now opens this page,
 * so its history row goes (LAN-§15.1 "This old address of «X» will open this page from now on").
 */
export async function releaseOldSlug(scope: WriteScope, slug: string): Promise<void> {
  await db.delete(pageSlugHistory).where(whereStore(pageSlugHistory, scope, eq(pageSlugHistory.slug, slug)));
}
