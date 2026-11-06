import "server-only";
/**
 * The server half of the ops ⌘K commands (P4 CALL CENTER; operations.md OPE-§27.7, UX-02; core D54, SF-05): what a
 * command runs that the browser cannot. Each one is the same function the screen's own button calls.
 *
 *   openTestOrder   "Open a test order" (pages.publish: owners, admins, editors): the store's most recently updated
 *                   published landing gets a 2-hour test link from P3's `mintTestLink` (audited there as
 *                   `page.test_link_created`). While P3's function is its P0 stub the answer is `unavailable`, and a
 *                   store with no published page answers `no_page`: nothing is invented.
 */
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { pages } from "@/lib/db/schema";
import { logError } from "@/lib/orders/log";
import { mintTestLink } from "@/lib/testing/links";
import { whereStore } from "@/lib/tenancy/sql";
import type { ActionResult, WriteCtx } from "@/lib/tenancy/types";

export async function openTestOrder(ctx: WriteCtx): Promise<ActionResult<{ url: string; expiresAt: string }>> {
  if (!ctx.can("pages.publish")) return { ok: false, error: "forbidden" };
  const [page] = await db
    .select({ id: pages.id })
    .from(pages)
    .where(whereStore(pages, ctx.scope, and(eq(pages.status, "published"), eq(pages.kind, "landing"))))
    .orderBy(desc(pages.updatedAt))
    .limit(1);
  if (!page) return { ok: false, error: "no_page" };
  try {
    const link = await mintTestLink(ctx.scope, page.id);
    return { ok: true, data: { url: link.url, expiresAt: link.expiresAt.toISOString() } };
  } catch (err) {
    if (!(err instanceof Error && err.message.startsWith("not implemented"))) logError("ops:test-link", err);
    return { ok: false, error: "unavailable" };
  }
}
