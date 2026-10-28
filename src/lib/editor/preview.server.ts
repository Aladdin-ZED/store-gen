import "server-only";
/**
 * Full-page draft preview (GET /app/<handle>/preview/<pageId>): renders a stored draft or version of one store with
 * the real publish renderer, made safe to show inside the dashboard (LND-25: the store render context of now, i.e. the
 * store's identity, its own files, its addresses and legal links; the caller builds it from the seam's scope):
 *  - pixels removed and noindex forced; the runtime runs in "preview" mode (no orders, events);
 *  - the page's add-ons for the preview mode (`opts.addons`: P3's `loadRenderAddons(…, { mode: "preview" })`, the
 *    landing set; passed to the renderer only when not empty) and the live page's endpoints (`rc.endpoints`);
 *  - every <script> carries the admin CSP nonce (the response travels under the admin CSP);
 *  - a fixed "Preview · not live" badge so it is never mistaken for the live page.
 */
import type { RenderAddons } from "@/landing/addons/types";
import { storePageLinks, type AssetResolver } from "@/landing/context";
import type { PageDoc } from "@/lib/page/schema";
import { validateDoc } from "@/lib/page/validate";
import { renderLandingHtml } from "@/lib/render/render.server";
import { hasAddons, storeDocumentUrls, storeReportUrl, type StoreRenderContext } from "@/lib/render/store-context.server";

const NONCE = /^[A-Za-z0-9+/=_-]{16,128}$/;

/** Static badge (no user content); inline styles are allowed by the admin CSP. */
const BADGE =
  '<div aria-hidden="true" style="position:fixed;z-index:2147483647;inset-block-start:12px;inset-inline-end:12px;padding:6px 12px;border-radius:999px;' +
  "background:rgba(20,18,14,.78);color:#fff;font:600 12px/1.2 ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;letter-spacing:.01em;" +
  'pointer-events:none;-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);box-shadow:0 6px 20px rgba(0,0,0,.18)">Preview · not live</div>';

export type DraftPreview = { ok: true; html: string } | { ok: false; reason: "invalid" };

/**
 * `opts.rc` is the page's store's render context (`loadStoreRenderContext(scope, store)`: identity, base, origin,
 * endpoints); `opts.assets` a resolver over the store's own files only (`storeAssetResolver`); `opts.addons` the
 * landing add-ons of the previewed document (the route's `loadRenderAddons` call, mode "preview").
 */
export async function renderDraftPreview(
  source: unknown,
  slug: string,
  opts: { nonce?: string | null; rc: StoreRenderContext; assets: (doc: PageDoc) => Promise<AssetResolver>; addons?: (doc: PageDoc) => Promise<RenderAddons> },
): Promise<DraftPreview> {
  const { doc } = validateDoc(source);
  if (!doc) return { ok: false, reason: "invalid" };

  // never load pixels from a preview, never let it be indexed
  const previewDoc = { ...doc, tracking: {}, seo: { ...doc.seo, noindex: true } };
  const [assets, addons] = await Promise.all([opts.assets(previewDoc), opts.addons?.(previewDoc)]);
  const rendered = await renderLandingHtml(previewDoc, {
    mode: "live",
    runtimeMode: "preview",
    assets,
    pageKey: "pk_preview_page",
    store: opts.rc.info,
    // the store's own addresses ("/s/<h>/<slug>" in P mode) and legal links
    urls: storeDocumentUrls(opts.rc, slug, opts.rc.endpoints),
    links: storePageLinks(opts.rc.base, slug, storeReportUrl(opts.rc, `/${slug}`)),
    upgradeInsecureRequests: false,
    // the render hook: only a set that changes something (a hook-free preview keeps today's bytes)
    ...(addons && hasAddons(addons) ? { addons } : {}),
  });

  let html = rendered.html;
  if (opts.nonce && NONCE.test(opts.nonce)) html = html.replace(/<script(?=[\s>])(?![^>]*\snonce=)/g, `<script nonce="${opts.nonce}"`);
  html = html.replace(/<body([^>]*)>/, (m) => `${m}${BADGE}`);
  return { ok: true, html };
}
