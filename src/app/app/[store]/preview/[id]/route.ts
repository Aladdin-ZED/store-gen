/**
 * GET /app/<handle>/preview/<pageId>[?v=<versionId>] — the member's full-page preview of one of the store's drafts (or
 * of one of its versions), rendered by the real publish renderer in a new tab (`pages.read` through storeGuard;
 * docs/STORE-SAAS.md §I.1). The page and the version are looked up in the store (another store's id is a 404,
 * LND-25), the document renders with the store's identity and its own files, and nothing is cached or indexed.
 *
 * The landing runtime's inline <script> gets the request's CSP nonce when the proxy set one (see renderDraftPreview).
 */
import { and, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { collectAssetIds, liveAssetResolver } from "@/landing/context";
import { storeInfoOf } from "@/lib/admin-data/store-info";
import { getCspNonce } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { pages, pageVersions } from "@/lib/db/schema";
import { renderDraftPreview } from "@/lib/editor/preview.server";
import { getAssetsByIds } from "@/lib/media";
import { storeGuard } from "@/lib/tenancy/seam";
import { byId } from "@/lib/tenancy/sql";
import { storePath } from "@/lib/urls";

type Ctx = { params: Promise<{ store: string; id: string }> };

const ROW_ID = /^[0-9A-HJKMNP-TV-Z]{26}$/;

function plain(status: number, text: string): Response {
  return new Response(text, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" },
  });
}

export async function GET(req: NextRequest, ctx: Ctx): Promise<Response> {
  const { store: handle, id } = await ctx.params;
  const g = await storeGuard(req, handle, "pages.read");
  if (!g.ok) return plain(g.response.status, g.response.status === 401 ? "Sign in to preview this page." : g.response.status === 403 ? "Forbidden" : "Not found");
  const { scope, store } = g.ctx;

  const versionId = req.nextUrl.searchParams.get("v");
  if (!ROW_ID.test(id) || (versionId !== null && !ROW_ID.test(versionId))) return plain(404, "Not found");

  const [page] = await db.select({ slug: pages.slug, draft: pages.draft }).from(pages).where(byId(pages, scope, id)).limit(1);
  if (!page) return plain(404, "Not found");
  let source: unknown = page.draft;
  if (versionId) {
    const [v] = await db
      .select({ doc: pageVersions.doc })
      .from(pageVersions)
      .where(and(byId(pageVersions, scope, versionId), eq(pageVersions.pageId, id)))
      .limit(1);
    if (!v) return plain(404, "Not found");
    source = v.doc;
  }

  const info = await storeInfoOf(scope, store);
  const preview = await renderDraftPreview(source, page.slug, {
    nonce: await getCspNonce(),
    store: info,
    // the store's own files only (MED-18): another store's id in a document resolves like a deleted file
    assets: async (doc) => liveAssetResolver(await getAssetsByIds(scope, collectAssetIds(doc, [info.logo]))),
    paths: { landing: storePath(store, `/${page.slug}`), thankYou: storePath(store, `/${page.slug}/merci`) },
  });
  if (!preview.ok) return plain(422, "This draft has errors that prevent a preview. Fix them in the builder.");

  return new Response(preview.html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
      "Referrer-Policy": "no-referrer",
    },
  });
}
