import "server-only";
/**
 * Test-order links (P3 LANDING; landing.md LAN-§14.1, SF-05; docs/STORE-SAAS.md D54, §K.2 P0): `storeUrl(store,
 * "/<slug>") + "?sg-test=" + token`, the token from the core's `signTestToken` (src/lib/tenancy/public.ts, T3), valid
 * 2 h and bound to the store, not the page; the page must be a published page of the scope's store (else
 * `not_found`, the same answer for another store's page id). Audited `page.test_link_created` (`pages.publish`, the
 * caller's permission). Typed stub frozen at P0, with a `WriteScope` (D71: the audit row).
 *
 * The scope carries no actor, so the frozen `mintTestLink` audits as the system; P3's actions call `mintTestLinkAs`
 * with the request's member, so the store's activity names who opened the test.
 */
import { and, desc, eq } from "drizzle-orm";
import { auditIn } from "@/lib/admin-data/store-audit";
import { db } from "@/lib/db/client";
import { pages } from "@/lib/db/schema";
import { isStoreSlug } from "@/lib/render/publish.server";
import { SeamError } from "@/lib/tenancy/seam";
import { byId, whereStore } from "@/lib/tenancy/sql";
import { getStoreById, signTestToken, TEST_PARAM } from "@/lib/tenancy/public";
import type { Actor, StoreRow, StoreScope, WriteScope } from "@/lib/tenancy/types";
import { storeUrl } from "@/lib/urls";

/** The life of a test link (D54): the token's own TTL, 2 h. */
export const TEST_LINK_TTL_MS = 2 * 3_600_000;
const ID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const SYSTEM: Actor = { kind: "system", userId: null, impersonatorId: null, ip: null };

/** `mintTestLink` with the actor of the audit row (the actions' member). */
export async function mintTestLinkAs(scope: WriteScope, actor: Actor, pageId: string, now = Date.now()): Promise<{ url: string; expiresAt: Date }> {
  if (!ID_RE.test(pageId)) throw new SeamError("not_found");
  const [page] = await db
    .select({ id: pages.id, slug: pages.slug, status: pages.status, versionId: pages.publishedVersionId })
    .from(pages)
    .where(byId(pages, scope, pageId))
    .limit(1);
  if (!page || page.status !== "published" || !page.versionId || !isStoreSlug(page.slug)) throw new SeamError("not_found");
  const store = await getStoreById(scope.storeId);
  if (!store) throw new SeamError("not_found");
  const token = signTestToken(store.id, now);
  // the token's exp is whole seconds from `now`; the link is announced with the same 2 h
  const expiresAt = new Date(now + TEST_LINK_TTL_MS);
  const url = `${storeUrl(store, `/${page.slug}`)}?${TEST_PARAM}=${encodeURIComponent(token)}`;
  await auditIn(scope, actor, "page.test_link_created", { target: page.id, meta: { pageId: page.id, expiresAt: expiresAt.toISOString() } });
  return { url, expiresAt };
}

export async function mintTestLink(scope: WriteScope, pageId: string): Promise<{ url: string; expiresAt: Date }> {
  return mintTestLinkAs(scope, SYSTEM, pageId);
}

/**
 * The page "Open a test order" opens when none is named (the address card, ⌘K outside the builder): the store's home
 * page when it is published, else its latest published landing page; null when nothing is live.
 */
export async function testOrderPageId(scope: StoreScope, store: Pick<StoreRow, "homePageId">): Promise<string | null> {
  if (store.homePageId) {
    const [home] = await db.select({ id: pages.id }).from(pages).where(whereStore(pages, scope, eq(pages.id, store.homePageId), eq(pages.status, "published"))).limit(1);
    if (home) return home.id;
  }
  const [latest] = await db
    .select({ id: pages.id })
    .from(pages)
    .where(whereStore(pages, scope, and(eq(pages.status, "published"), eq(pages.kind, "landing"))))
    .orderBy(desc(pages.updatedAt))
    .limit(1);
  return latest?.id ?? null;
}
