import "server-only";
/**
 * The test render (docs/STORE-SAAS.md D54, §C.4.1; landing.md LAN-§14.2): a store page or its thank-you page opened
 * with a valid `?sg-test=<token>` is rendered on request from the PUBLISHED version with
 *  - no pixel (`cfg.pixels = {}`: the pixels chunk is absent, and the CSP lists no pixel host);
 *  - `endpoints.order` / `lead` / `upsell` and the thank-you URL carrying `?sg-test=<token>` (the order API then
 *    marks the order `is_test`), `endpoints.event` omitted (test traffic never reaches stats_daily);
 *  - the test band (`addons.banner = "test"`);
 * served `private, no-store`, `noindex` with the CSP computed for this document (narrowed to the serving origin's
 * public API like every store document, SEC-2). The frozen runtime chunk is untouched: endpoint strings are opaque
 * to it. P3 re-exports it from src/lib/testing/render.server.ts in R1 product.
 */
import { TEST_PARAM } from "@/lib/tenancy/public";
import type { StoreRow, StoreScope } from "@/lib/tenancy/types";
import { validateDoc } from "@/lib/page/validate";
import { renderLandingHtml, renderThankYouHtml, type RenderedHtml } from "./core";
import type { PublishedPage } from "./store-pages.server";
import { loadStoreRenderContext, PUBLIC_ENDPOINTS, storeAssetResolver, storeDocumentUrls, storeRenderOptions, thankYouLinks } from "./store-context.server";

export { TEST_PARAM };

/** `path` + `?sg-test=<token>` (the token is base36 + base64url: nothing to escape, encoded anyway). */
const withToken = (path: string, token: string) => `${path}${path.includes("?") ? "&" : "?"}${TEST_PARAM}=${encodeURIComponent(token)}`;

/** Render `page` (published) of `store` as a test document; null when its stored doc no longer validates. */
export async function renderTestDocument(scope: StoreScope, store: StoreRow, page: PublishedPage, token: string, kind: "landing" | "thanks"): Promise<RenderedHtml | null> {
  const { doc } = validateDoc(page.doc);
  if (!doc) return null;
  const rc = await loadStoreRenderContext(scope, store, { pageId: page.pageId });
  const { resolver } = await storeAssetResolver(scope, rc, doc);
  const base = storeRenderOptions(rc, { slug: page.slug, pageKey: page.publicKey, assets: resolver });
  const plain = storeDocumentUrls(rc, page.slug);
  const urls = {
    landing: plain.landing,
    thankYou: withToken(plain.thankYou, token),
    endpoints: {
      order: withToken(PUBLIC_ENDPOINTS.order, token),
      lead: withToken(PUBLIC_ENDPOINTS.lead, token),
      upsell: withToken(PUBLIC_ENDPOINTS.upsell, token),
    },
  };
  const opts = { ...base, urls, ver: page.versionId, pixels: false, addons: { ...rc.addons, banner: "test" as const } };
  return kind === "landing" ? renderLandingHtml(doc, opts) : renderThankYouHtml(doc, { ...opts, links: thankYouLinks(rc, page.slug) });
}
