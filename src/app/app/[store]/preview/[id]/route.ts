/**
 * GET /app/<handle>/preview/<pageId>[?v=<versionId>] — the member's full-page preview of one of the store's drafts (or
 * of one of its versions), rendered by the real publish renderer in a new tab (`pages.read` through storeGuard;
 * docs/STORE-SAAS.md §I.1). The page and the version are looked up in the store (another store's id is a 404,
 * LND-25), the document renders with the store render context of now (identity, its own files, its addresses) and
 * the page's add-ons for the preview mode (P3's `loadRenderAddons`), and nothing is cached or indexed.
 *
 * The landing runtime's inline <script> gets the request's CSP nonce when the proxy set one (see renderDraftPreview).
 */
import type { NextRequest } from "next/server";
import { getCspNonce } from "@/lib/auth";
import { previewSource } from "@/lib/editor/pages.server";
import { renderDraftPreview } from "@/lib/editor/preview.server";
import { loadRenderAddons } from "@/landing/addons/load.server";
import { loadStoreRenderContext, storeAssetResolver } from "@/lib/render/store-context.server";
import { storeGuard } from "@/lib/tenancy/seam";

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

  // the store's page and version only: another store's ids are the same 404 as missing ones
  const found = await previewSource(scope, id, versionId);
  if (!found) return plain(404, "Not found");

  const rc = await loadStoreRenderContext(scope, store, { pageId: id });
  const preview = await renderDraftPreview(found.doc, found.slug, {
    nonce: await getCspNonce(),
    rc,
    // the store's own files only (MED-18): another store's id in a document resolves like a deleted file
    assets: async (doc) => (await storeAssetResolver(scope, rc, doc)).resolver,
    addons: async (doc) => (await loadRenderAddons(scope, store, { pageId: id, doc, mode: "preview" })).landing,
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
