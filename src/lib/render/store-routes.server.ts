import "server-only";
/**
 * The public store routes (docs/STORE-SAAS.md §C.1, §C.4, §C.4.1, §C.8): the request logic behind the thin route
 * files of src/app/s/[store]/** and src/app/preview/[token], so it runs (and is tested) without Next's request
 * scope.
 *
 *   return serveStoreRoute(req, (await params).store, { page: "landing", slug }, { defer: after });
 *
 * Order of answers for `/s/<h>/<rest>`:
 *  1. the host class: platform (P mode), store (S mode, through the Worker) and legacy hosts reach a store route;
 *     anything else answers the neutral 404 (the proxy refuses them first);
 *  2. the handle: unknown → 404; deleted within its quarantine → the neutral 410; renamed → 308 to the new URL;
 *  3. the store state (§A.5.3): active / restricted serve; a suspended store with its notice → 503
 *     (Retry-After 86400); every other state → 404 (store existence never leaks);
 *  4. the canonical address (§C.1, §C.8): a request that reached a non-canonical address (the platform host in S
 *     mode, a legacy host, a renamed handle, an upper-case handle or slug) answers 308 to `storeUrl(store, rest)`
 *     with the raw query, byte for byte;
 *  5. the page: published bytes (ETag, 304); else the slug history (LP-20: 308 to the slug the page has now);
 *     else 404. A valid `?sg-test=<token>` renders the test document (D54; `s:<sid>:test-render` 60 / h, an
 *     invalid or over-limit token gets the normal page).
 * A database or render failure answers the neutral 503 and is logged without request data.
 */
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { pages } from "@/lib/db/schema";
import { effectiveHost, type EffectiveHost } from "@/lib/edge/host";
import { subdomainMode } from "@/lib/edge/env";
import { errorSummary } from "@/lib/orders/log";
import { validateDoc } from "@/lib/page/validate";
import { baseSecurityHeaders } from "@/lib/security/headers";
import { rateLimit } from "@/lib/security/rate-limit";
import {
  getStoreById,
  listIndexableStoreHandles,
  previewServable,
  publicScope,
  publicStoreAnswer,
  resolveStoreHandle,
  resolveTestToken,
} from "@/lib/tenancy/public";
import { inStore } from "@/lib/tenancy/sql";
import type { StoreRow, StoreScope } from "@/lib/tenancy/types";
import { addressMode, platformOrigin, storePath, storeUrl, type StoreAddress } from "@/lib/urls";
import { isLegalKind } from "@/landing/context";
import { renderLandingHtml } from "./core";
import { openPreviewToken } from "./preview-token";
import { isStoreSlug } from "./publish.server";
import { documentResponse, goneResponse, notFoundResponse, permanentRedirect, unavailableResponse } from "./serve.server";
import { addressOf, loadStoreRenderContext, storeAssetResolver, storeRenderOptions } from "./store-context.server";
import {
  countSlugHit,
  getPublishedPage,
  getStoreHomePage,
  getStoreLegalDocument,
  listSitemapPages,
  slugHistoryTarget,
  storeHasPublishedPage,
  type PublishedPage,
} from "./store-pages.server";
import { renderTestDocument, TEST_PARAM } from "./test-render.server";

export type StoreRoute =
  | { page: "home" }
  | { page: "landing"; slug: string }
  | { page: "thanks"; slug: string }
  | { page: "policy"; kind: string }
  | { page: "robots" }
  | { page: "sitemap" };

export interface RouteDeps {
  /** Next's `after()`: work that must not delay the answer (slug-history hit counters) */
  defer?: (task: () => Promise<void>) => void;
  /** the clock (tests) */
  now?: number;
}

/** Test renders per store and hour (LAN-§14.2). */
const TEST_RENDERS_PER_HOUR = 60;

/** The path of a route below the store base ("" for the home). */
export function restOf(route: StoreRoute): "" | `/${string}` {
  switch (route.page) {
    case "home":
      return "";
    case "landing":
      return `/${route.slug}`;
    case "thanks":
      return `/${route.slug}/merci`;
    case "policy":
      return `/policies/${route.kind}`;
    case "robots":
      return "/robots.txt";
    case "sitemap":
      return "/sitemap.xml";
  }
}

/** The raw query of the request ("" or "?…"), exactly as the client sent it. */
function rawQuery(req: Request): string {
  const url = req.url;
  const q = url.indexOf("?");
  if (q < 0) return "";
  const hash = url.indexOf("#", q);
  const search = hash < 0 ? url.slice(q) : url.slice(q, hash);
  return search === "?" ? "" : search;
}

/**
 * Is the request at the store's canonical address (§C.1)? P mode: the platform host; S mode: the store's own
 * subdomain through the Worker. (C mode, R3, arrives through /d/<host>.) Legacy hosts never are.
 */
export function isCanonicalHost(eff: Pick<EffectiveHost, "cls" | "label">, store: StoreAddress): boolean {
  const mode = addressMode(store);
  if (eff.cls === "platform") return mode === "P";
  if (eff.cls === "store") return mode === "S" && eff.label === store.handle;
  return false;
}

const log = (what: string, err: unknown) => console.error(`[store] ${what}:`, errorSummary(err));

/** Serve one store route (GET / HEAD; the route files answer every other method with the neutral 404). */
export async function serveStoreRoute(req: Request, handleParam: string, route: StoreRoute, deps: RouteDeps = {}): Promise<Response> {
  const eff = effectiveHost(req.headers);
  if (eff.cls !== "platform" && eff.cls !== "store" && eff.cls !== "legacy") return notFoundResponse(req);
  const handle = handleParam.toLowerCase();
  let found;
  try {
    found = await resolveStoreHandle(handle);
  } catch (err) {
    log("handle lookup failed", err);
    return unavailableResponse(req);
  }
  if (!found) return notFoundResponse(req);
  if (found.kind === "gone") return goneResponse(req);
  const store = found.store;
  const address = addressOf(store);
  try {
    const answer = await publicStoreAnswer(store);
    if (answer === "not_found") return notFoundResponse(req);
    if (answer === "unavailable") return unavailableResponse(req, 86_400);

    const lowerRoute = lowerSlug(route);
    const canonical = found.kind === "current" && handle === handleParam && isCanonicalHost(eff, address) && lowerRoute === route;
    if (!canonical) {
      // an upper-case slug that is not a store slug even in lower case is a 404 on every address
      if (lowerRoute !== route && "slug" in lowerRoute && !isStoreSlug(lowerRoute.slug)) return notFoundResponse(req);
      return permanentRedirect(req, storeUrl(address, restOf(lowerRoute) || "/") + rawQuery(req));
    }
    const scope = publicScope(store);
    switch (route.page) {
      case "home":
        return await serveHome(req, scope, store);
      case "landing":
      case "thanks":
        return await servePage(req, scope, store, route.slug, route.page, deps);
      case "policy":
        return await servePolicy(req, scope, store, route.kind);
      case "robots":
        return await storeRobots(req, scope, store);
      case "sitemap":
        return await storeSitemap(req, scope, store);
    }
  } catch (err) {
    log("store route failed", err);
    return unavailableResponse(req);
  }
}

/** The route with its slug in lower case (today's rule: /Argan → /argan, 308), or the same object when it has none. */
function lowerSlug(route: StoreRoute): StoreRoute {
  if ((route.page === "landing" || route.page === "thanks") && route.slug !== route.slug.toLowerCase()) return { ...route, slug: route.slug.toLowerCase() };
  if (route.page === "policy" && route.kind !== route.kind.toLowerCase()) return { ...route, kind: route.kind.toLowerCase() };
  return route;
}

async function serveHome(req: Request, scope: StoreScope, store: StoreRow): Promise<Response> {
  const page = await getStoreHomePage(scope, store);
  const address = addressOf(store);
  if (page) return documentResponse(req, { html: page.html, csp: page.csp, etag: page.etag }, { kind: "landing", noindex: page.noindex, store: address });
  const placeholder = storePlaceholder(store);
  return documentResponse(req, placeholder, { kind: "landing", noindex: true, store: address });
}

async function servePage(req: Request, scope: StoreScope, store: StoreRow, slug: string, kind: "landing" | "thanks", deps: RouteDeps): Promise<Response> {
  if (!isStoreSlug(slug)) return notFoundResponse(req);
  const page = await getPublishedPage(scope, store, slug);
  const address = addressOf(store);
  if (!page) {
    const moved = await slugHistoryTarget(scope, store, slug);
    if (!moved) return notFoundResponse(req);
    const count = () => countSlugHit(scope, slug);
    if (deps.defer) deps.defer(count);
    else await count();
    return permanentRedirect(req, storePath(address, kind === "landing" ? `/${moved}` : `/${moved}/merci`) + rawQuery(req));
  }
  const token = new URL(req.url).searchParams.get(TEST_PARAM);
  if (token && resolveTestToken(store, token, deps.now).test) {
    const test = await testDocument(scope, store, page, token, kind);
    if (test) return documentResponse(req, test, { kind: "test", store: address });
  }
  if (kind === "landing") return documentResponse(req, { html: page.html, csp: page.csp, etag: page.etag }, { kind: "landing", noindex: page.noindex, store: address });
  return documentResponse(req, { html: page.thankYouHtml, csp: page.thankYouCsp }, { kind: "thanks", store: address });
}

/** The test render, or null when the store's hourly budget is spent (the visit then gets the normal page). */
async function testDocument(scope: StoreScope, store: StoreRow, page: PublishedPage, token: string, kind: "landing" | "thanks") {
  const gate = await rateLimit(`s:${store.id}:test-render`, TEST_RENDERS_PER_HOUR, 3_600);
  if (!gate.ok) return null;
  const rendered = await renderTestDocument(scope, store, page, token, kind);
  return rendered ? { html: rendered.html, csp: rendered.csp } : null;
}

async function servePolicy(req: Request, scope: StoreScope, store: StoreRow, kind: string): Promise<Response> {
  if (!isLegalKind(kind)) return notFoundResponse(req);
  // ?p= is only a theme hint inside this store: anything that is not a plain slug falls back to the home page
  const p = new URL(req.url).searchParams.get("p");
  const slug = p && p.length <= 80 ? p.toLowerCase() : null;
  const legal = await getStoreLegalDocument(scope, store, kind, slug);
  if (!legal) return notFoundResponse(req);
  return documentResponse(req, { html: legal.html, csp: legal.csp, etag: legal.etag }, { kind: "legal", store: addressOf(store) });
}

/* ------------------------------------------------------------------ */
/* SEO files (§C.8)                                                    */
/* ------------------------------------------------------------------ */

const SEO_CACHE = "public, max-age=0, s-maxage=300";

/** A small public text answer (robots.txt, sitemap.xml) with the base headers of the request's host class. */
export function seoFileResponse(req: Request, body: string, type: "text/plain" | "application/xml"): Response {
  const eff = effectiveHost(req.headers);
  const headers = new Headers(baseSecurityHeaders({ frame: "deny", cls: eff.cls }));
  headers.set("Content-Type", `${type}; charset=utf-8`);
  headers.set("Cache-Control", SEO_CACHE);
  headers.set("Cross-Origin-Resource-Policy", "same-origin");
  if (eff.via === "edge") headers.set("CDN-Cache-Control", "no-store");
  headers.set("Content-Length", String(Buffer.byteLength(body, "utf8")));
  return new Response(req.method === "HEAD" ? null : body, { status: 200, headers });
}

/** The store's robots.txt: its sitemap at the canonical origin; `Disallow: /` while it is not active or has no page. */
export function storeRobotsText(store: StoreRow, hasPage: boolean): string {
  if (store.status !== "active" || !hasPage) return "User-agent: *\nDisallow: /\n";
  const sitemap = storeUrl(addressOf(store), "/sitemap.xml");
  return `User-agent: *\nAllow: /\n${/^https?:\/\//.test(sitemap) ? `\nSitemap: ${sitemap}\n` : ""}`;
}

async function storeRobots(req: Request, scope: StoreScope, store: StoreRow): Promise<Response> {
  return seoFileResponse(req, storeRobotsText(store, await storeHasPublishedPage(scope, store)), "text/plain");
}

const xmlEscape = (s: string) => s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** A sitemap of absolute URLs (an entry without an absolute URL is left out: PLATFORM_URL unset in development). */
export function sitemapXml(entries: readonly { loc: string; lastmod?: Date }[]): string {
  const urls = entries
    .filter((e) => /^https?:\/\//.test(e.loc))
    .map((e) => `<url><loc>${xmlEscape(e.loc)}</loc>${e.lastmod ? `<lastmod>${e.lastmod.toISOString().slice(0, 10)}</lastmod>` : ""}</url>`)
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>\n`;
}

async function storeSitemap(req: Request, scope: StoreScope, store: StoreRow): Promise<Response> {
  const address = addressOf(store);
  const list = store.status === "active" ? await listSitemapPages(scope, store) : [];
  return seoFileResponse(req, sitemapXml(list.map((p) => ({ loc: storeUrl(address, `/${p.slug}`), lastmod: p.lastmod }))), "application/xml");
}

/**
 * The platform robots.txt (§C.8): marketing allowed; the dashboard, the console, previews and the APIs disallowed;
 * `/s/` too once S mode is on (stores then live on their subdomains). While S mode is off, one `Sitemap:` line per
 * live store with a published page, after the platform's own.
 */
export async function platformRobotsText(): Promise<string> {
  const origin = platformOrigin();
  const lines = ["User-agent: *", "Allow: /", "Disallow: /app/", "Disallow: /admin/", "Disallow: /api/", "Disallow: /preview/"];
  if (subdomainMode()) lines.push("Disallow: /s/");
  const maps: string[] = [];
  if (/^https?:\/\//.test(origin)) {
    maps.push(`${origin}/sitemap.xml`);
    if (!subdomainMode()) for (const handle of await listIndexableStoreHandles()) maps.push(`${origin}/s/${handle}/sitemap.xml`);
  }
  return `${lines.join("\n")}\n${maps.length ? `\n${maps.map((m) => `Sitemap: ${m}`).join("\n")}\n` : ""}`;
}

/* ------------------------------------------------------------------ */
/* The store's "no page yet" home (§A.2)                               */
/* ------------------------------------------------------------------ */

const PLACEHOLDER_COPY: Record<"ar" | "fr" | "en", { line: string; soon: string }> = {
  ar: { line: "يُحضّر هذا المتجر صفحته الأولى.", soon: "عودوا قريبًا." },
  fr: { line: "Cette boutique prépare sa première page.", soon: "Revenez bientôt." },
  en: { line: "This store is preparing its first page.", soon: "Please come back soon." },
};

const PLACEHOLDER_STYLE =
  ":root{--bg:#f7f8f9;--ink:#16181b;--soft:#5f6670;--line:#e3e6ea}@media (prefers-color-scheme:dark){:root{--bg:#121315;--ink:#eceef0;--soft:#9aa1aa;--line:#2a2d31}}" +
  "*{box-sizing:border-box}html,body{margin:0;min-height:100%}body{display:grid;place-items:center;min-height:100vh;min-height:100dvh;padding:24px;" +
  "background:var(--bg);color:var(--ink);font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,'Noto Sans Arabic',Tahoma,sans-serif;" +
  "line-height:1.5;-webkit-font-smoothing:antialiased}main{width:100%;max-width:30rem;text-align:center}" +
  "h1{margin:0;font-size:clamp(1.75rem,6vw,2.5rem);font-weight:650;letter-spacing:-.02em;line-height:1.15;text-wrap:balance}" +
  "hr{width:3rem;margin:1.5rem auto;border:0;border-top:1px solid var(--line)}p{margin:0;color:var(--soft);font-size:1rem;text-wrap:pretty}p+p{margin-top:.25rem}";

const htmlEscape = (s: string) => s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);
const styleHash = `'sha256-${createHash("sha256").update(PLACEHOLDER_STYLE, "utf8").digest("base64")}'`;

/** The branded "no page yet" home of a live store without a published home page: static, no script, noindex. */
export function storePlaceholder(store: Pick<StoreRow, "name" | "defaultLocale">): { html: string; csp: string; etag: string } {
  const locale = store.defaultLocale === "ar" || store.defaultLocale === "en" ? store.defaultLocale : "fr";
  const copy = PLACEHOLDER_COPY[locale];
  const name = htmlEscape(store.name.trim() || "—");
  const html =
    `<!DOCTYPE html><html lang="${locale}" dir="${locale === "ar" ? "rtl" : "ltr"}"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow">` +
    `<meta name="color-scheme" content="light dark"><title>${name}</title><style>${PLACEHOLDER_STYLE}</style></head>` +
    `<body><main><h1>${name}</h1><hr><p>${copy.line}</p><p>${copy.soon}</p></main></body></html>`;
  const csp = `default-src 'none'; style-src ${styleHash}; img-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`;
  return { html, csp, etag: createHash("sha256").update(html, "utf8").digest("hex") };
}

/* ------------------------------------------------------------------ */
/* /preview/<token> (D20, SEC-7)                                       */
/* ------------------------------------------------------------------ */

/**
 * A private preview: platform host only; the token opens and its row is live (./preview-token.ts); the store is
 * servable for previews (pending, active, restricted); the page is still in that store. Renders the latest draft
 * (else the published version) on request with an offline runtime (no order, no pixel, no network), `noindex`,
 * `private, no-store`, no referrer. Every refusal is the neutral 404.
 */
export async function servePreview(req: Request, token: string): Promise<Response> {
  if (effectiveHost(req.headers).cls !== "platform") return notFoundResponse(req);
  try {
    const opened = await openPreviewToken(token);
    if (!opened) return notFoundResponse(req);
    const store = await getStoreById(opened.storeId);
    if (!store || !previewServable(store.status)) return notFoundResponse(req);
    const scope = publicScope(store);
    const [page] = await db
      .select({ id: pages.id, slug: pages.slug, publicKey: pages.publicKey, draft: pages.draft })
      .from(pages)
      .where(and(inStore(pages, scope), eq(pages.id, opened.pageId)))
      .limit(1);
    if (!page) return notFoundResponse(req);
    const doc = validateDoc(page.draft).doc ?? (await getPublishedPage(scope, store, page.slug).then((p) => (p ? validateDoc(p.doc).doc : null)));
    if (!doc) return notFoundResponse(req);
    const rc = await loadStoreRenderContext(scope, store, { pageId: page.id });
    const { resolver } = await storeAssetResolver(scope, rc, doc);
    const rendered = await renderLandingHtml(doc, { ...storeRenderOptions(rc, { slug: page.slug, pageKey: page.publicKey, assets: resolver }), runtimeMode: "preview" });
    return documentResponse(req, { html: rendered.html, csp: rendered.csp }, { kind: "preview", store: addressOf(store), encoding: "once" });
  } catch (err) {
    log("preview failed", err);
    return unavailableResponse(req);
  }
}
