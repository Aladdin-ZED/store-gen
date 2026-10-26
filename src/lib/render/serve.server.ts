import "server-only";
/**
 * HTTP responses for rendered store documents (docs/STORE-SAAS.md §F.6 "Store documents"; route handlers under
 * src/app/s/[store]/**, /preview/<token>, dev fixtures).
 *  - landing:   hash CSP of the version · ETag + 304 · short shared cache, always revalidated
 *  - legal:     same caching as landing · noindex (boilerplate shared by every page)
 *  - thank-you: hash CSP · no-store · noindex
 *  - test:      a test render (D54): its own hash CSP (no pixel) · no-store · noindex
 *  - preview:   /preview/<token> (SEC-7): no-store · noindex · no referrer (the URL is a bearer link)
 * Plus the base security headers (nosniff, referrer policy, permissions policy, X-Frame-Options, the HSTS
 * of the request's host class) and, while the request came through the Worker (`via = edge`),
 * `CDN-Cache-Control: no-store` (ENGC-2: until OS-12's host-keyed cache, no Cloudflare cache may hold a
 * store document keyed by the apex URL).
 *
 * Isolation from the dashboard and the console (one origin in P mode; the pixel loaders' scripts run
 * with the document's origin): the stored CSP's same-origin connect-src / form-action is narrowed per
 * request to `<serving origin>/api/public/` (./csp scopeToPublicApi, SEC-2), the serving origin being the
 * store's own host when the Worker verified it and it is one of `storeHosts(store)`, else the platform
 * origin (never a reflected Host); and COOP is DOCUMENT_COOP — never the platform UI's "same-origin", so
 * a window this document opens on /app or /admin, or one they open on it, lands in another browsing
 * context group.
 *
 * Content-coding (./compress): brotli, else gzip, from Accept-Encoding; `Vary: Accept-Encoding` on
 * every document response; Content-Length always exact. Each representation has its own validator:
 *   identity "<sha256>" (strong) · brotli W/"<sha256>-br" · gzip W/"<sha256>-gz"
 * (weak: the compressed bytes are upgraded once in the background, the document is the same), and
 * If-None-Match is compared against the representation being selected, so a cache never gets a 304
 * for bytes in an encoding it does not hold. Encoded bodies are cached per version in memory; a zlib
 * failure falls back to identity, never to an error page.
 */
import { createHash } from "node:crypto";
import { IS_PROD, isInternalHost, normalizeHost, publicSiteOrigin } from "@/lib/auth/config";
import { requestHost } from "@/lib/auth/gate";
import { gonePageResponse, unavailablePageResponse, unknownPageResponse } from "@/lib/auth/unknown-page";
import { effectiveHost } from "@/lib/edge/host";
import { platformUrl } from "@/lib/edge/env";
import { baseSecurityHeaders } from "@/lib/security/headers";
import { storeHosts, type StoreAddress } from "@/lib/urls";
import { encodeCached, encodeOnce, MIN_COMPRESS_BYTES, negotiateEncoding, type Coding } from "./compress";
import { originOf, scopeToPublicApi } from "./csp";

export interface ServeDocument {
  html: string;
  csp: string;
  /** sha256 hex of html (landing pages, legal documents): the base of the representation ETags */
  etag?: string;
}

export interface ServeOptions {
  kind: "landing" | "thanks" | "legal" | "test" | "preview";
  /** the store the document belongs to: its own hosts may serve it (S / C modes, via the Worker) */
  store?: StoreAddress;
  /** seo.noindex of the page (thank-you pages are always noindex) */
  noindex?: boolean;
  /** extra cache policy override (dev fixtures: no-store) */
  cacheControl?: string;
  /**
   * "cache" (default): encoded once per document and kept (stored versions, legal documents).
   * "once": encoded at the fast level and not kept — for documents rendered anew on every request.
   * Defaults to "once" when `cacheControl` overrides the policy with no-store (dev fixtures).
   */
  encoding?: "cache" | "once";
}

const LANDING_CACHE = "public, max-age=0, must-revalidate, s-maxage=60";

/**
 * COOP of every rendered document. The admin keeps "same-origin" (security/headers): two different
 * values force a browsing-context-group switch between them in both directions (a popup a vendor
 * script opens on /admin/** is cut off from its opener, and so is a live page the admin opens).
 * Same value as exports, where the WhatsApp hand-off opens a new tab.
 */
export const DOCUMENT_COOP = "same-origin-allow-popups";

const HOST_RE = /^[a-z0-9.-]+(?::\d{1,5})?$/;
/** a store host the Worker forwarded: no port, labels only */
const EDGE_HOST_RE = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;
const firstValue = (v: string | null) => v?.split(",")[0]?.trim().toLowerCase() || null;

/** "www.mystore.ma" ↔ "mystore.ma": the same site under its other usual name. */
const isWwwTwin = (a: string, b: string) => a === `www.${b}` || b === `www.${a}`;

declare global {
  var __codForeignHosts: Set<string> | undefined;
}

/** Runtime-log line (once per host and process) for a document served under a host PUBLIC_URL doesn't name. */
function reportForeignHost(host: string | null, publicOrigin: string): void {
  // an internal Host (the proxy's own name for the app) says nothing about what the visitor opened
  if (!host || !HOST_RE.test(host) || isInternalHost(host)) return;
  const seen = (globalThis.__codForeignHosts ??= new Set());
  if (seen.has(host) || seen.size >= 20) return;
  seen.add(host);
  console.warn(
    `[landing] a page was opened on ${host}, which is not PUBLIC_URL (${publicOrigin}): orders sent from there are blocked by the page's security policy. Update PUBLIC_URL if the site moved to this domain.`,
  );
}

/**
 * The origins a browser may be showing this document under: its runtime posts to the public API with
 * relative URLs, so the document's own origin must be allowed by the CSP (./csp scopeToPublicApi).
 *
 * A store host (S mode, R3 custom domains): `https://<effective host>` alone, only when the Worker's key
 * verified (`via = edge`) and the host is one of `storeHosts(store)` (§C.9); the request's own Host is
 * never reflected.
 *
 * The CSP goes out on responses shared caches keep (s-maxage), so in production nothing a client can
 * set without changing the cache key is reflected into it (X-Forwarded-Host, X-Forwarded-Proto):
 * PUBLIC_URL's origin, plus the request's host only when it is PUBLIC_URL's host or its www./bare twin
 * (with PUBLIC_URL's scheme). Any other host gets PUBLIC_URL's origin alone, and a runtime-log line.
 * Without PUBLIC_URL (a misconfiguration the boot log reports), the host the browser addressed
 * (security: Host first, see auth/gate requestHost).
 *
 * In development the request's own Host and X-Forwarded-Host are accepted (LAN devices, tunnels).
 * Hosts are validated (no CSP syntax can get through) and only ever widen the public-API sources; an
 * "http" source also matches https (CSP3), so a TLS-terminating proxy that sends no proto still works.
 */
export function documentOrigins(req: Request, store?: StoreAddress): string[] {
  const eff = effectiveHost(req.headers);
  if (store && eff.via === "edge" && (eff.cls === "store" || eff.cls === "custom") && EDGE_HOST_RE.test(eff.host) && storeHosts(store).has(eff.host)) {
    return [`https://${eff.host}`];
  }
  const out = new Set<string>();
  const pub = platformUrl()?.origin ?? publicSiteOrigin();
  if (IS_PROD) {
    const host = requestHost(req.headers);
    if (pub) {
      out.add(pub);
      const { protocol, host: pubHost } = new URL(pub);
      const publicHost = normalizeHost(pubHost);
      if (host && publicHost && host !== publicHost) {
        if (isWwwTwin(host, publicHost) && HOST_RE.test(host)) out.add(`${protocol}//${host}`);
        else reportForeignHost(host, pub);
      }
      return [...out];
    }
    const o = host && HOST_RE.test(host) ? originOf(`${requestScheme(req) ?? "https"}://${host}`) : null;
    return o ? [o] : [];
  }
  if (pub) out.add(pub);
  const scheme = requestScheme(req);
  if (!scheme) return [...out];
  for (const host of [firstValue(req.headers.get("host")), firstValue(req.headers.get("x-forwarded-host"))]) {
    if (!host || !HOST_RE.test(host)) continue;
    const o = originOf(`${scheme}://${host}`);
    if (o) out.add(o);
  }
  return [...out];
}

/** "https" / "http" from X-Forwarded-Proto, else from the request URL; null for anything else. */
function requestScheme(req: Request): "https" | "http" | null {
  const forwarded = firstValue(req.headers.get("x-forwarded-proto"));
  if (forwarded === "https" || forwarded === "http") return forwarded;
  try {
    const scheme = new URL(req.url).protocol.replace(/:$/, "");
    return scheme === "https" || scheme === "http" ? scheme : null;
  } catch {
    return null;
  }
}

/** The ETag of one representation of a document whose identity bytes hash to `sha`. */
export function representationTag(sha: string, coding: Coding): string {
  if (coding === "identity") return `"${sha}"`;
  return `W/"${sha}-${coding === "br" ? "br" : "gz"}"`;
}

const ENTITY_TAG_RE = /\*|(?:W\/)?"[^"]*"/g;

/** If-None-Match (weak comparison, RFC 9110 §13.1.2): "*" or one of the listed tags equals `tag`. */
export function etagMatches(header: string | null, tag: string): boolean {
  if (!header) return false;
  const opaque = tag.replace(/^W\//, "");
  for (const m of header.matchAll(ENTITY_TAG_RE)) {
    const candidate = m[0];
    if (candidate === "*" || candidate.replace(/^W\//, "") === opaque) return true;
  }
  return false;
}

const sha256hex = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

/** Documents that are never stored by a shared cache (a per-visitor or bearer document). */
const PRIVATE_KINDS: ReadonlySet<ServeOptions["kind"]> = new Set(["thanks", "test", "preview"]);

export async function documentResponse(req: Request, docu: ServeDocument, opts: ServeOptions): Promise<Response> {
  const eff = effectiveHost(req.headers);
  const headers = new Headers(baseSecurityHeaders({ frame: "deny", cls: eff.cls }));
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set("Content-Security-Policy", scopeToPublicApi(docu.csp, documentOrigins(req, opts.store)));
  headers.set("Cross-Origin-Opener-Policy", DOCUMENT_COOP);
  headers.set("Cross-Origin-Resource-Policy", "same-origin");
  headers.set("Vary", "Accept-Encoding");
  // ENGC-2: Cloudflare keys a Worker subrequest by the apex URL; no store document may enter that cache
  if (eff.via === "edge") headers.set("CDN-Cache-Control", "no-store");
  if (PRIVATE_KINDS.has(opts.kind)) {
    headers.set("Cache-Control", opts.cacheControl ?? "private, no-store");
    headers.set("X-Robots-Tag", "noindex, nofollow");
    // the thank-you URL carries the order id, a preview URL its bearer token: neither leaves in a Referer
    if (opts.kind !== "test") headers.set("Referrer-Policy", "no-referrer");
  } else {
    headers.set("Cache-Control", opts.cacheControl ?? LANDING_CACHE);
    if (opts.kind === "legal") headers.set("X-Robots-Tag", "noindex, follow");
    else if (opts.noindex) headers.set("X-Robots-Tag", "noindex, nofollow");
  }

  // UTF-16 length ≤ UTF-8 byte length: no full scan of the document just to apply the threshold
  let coding: Coding = docu.html.length >= MIN_COMPRESS_BYTES ? negotiateEncoding(req.headers.get("accept-encoding")) : "identity";
  const validated = docu.etag !== undefined && !PRIVATE_KINDS.has(opts.kind);

  if (validated) {
    const tag = representationTag(docu.etag!, coding);
    headers.set("ETag", tag);
    if (etagMatches(req.headers.get("if-none-match"), tag)) {
      // 304: validators and cache policy only, no representation metadata
      headers.delete("Content-Type");
      return new Response(null, { status: 304, headers });
    }
  }

  let body: string | Uint8Array<ArrayBuffer> = docu.html;
  let length = -1;
  if (coding !== "identity") {
    const once = opts.encoding ? opts.encoding === "once" : /\bno-store\b/i.test(opts.cacheControl ?? "");
    try {
      const encoded = once ? await encodeOnce(docu.html, coding) : await encodeCached(docu.etag ?? sha256hex(docu.html), docu.html, coding);
      body = encoded;
      length = encoded.byteLength;
      headers.set("Content-Encoding", coding);
    } catch {
      // already logged by ./compress — the document still goes out, uncompressed and correctly tagged
      coding = "identity";
      if (validated) headers.set("ETag", representationTag(docu.etag!, coding));
    }
  }
  // a string body goes out as UTF-8 (lone surrogates → U+FFFD, 3 bytes — Buffer.byteLength counts the same)
  headers.set("Content-Length", String(length >= 0 ? length : Buffer.byteLength(docu.html, "utf8")));
  return new Response(req.method === "HEAD" ? null : body, { status: 200, headers });
}

/**
 * Permanent redirect (308, GET/HEAD only) of the redirect class (§F.6): base headers with the request's HSTS and
 * `Cache-Control: public, max-age=300` (canonical addresses, slug history, lower-case slugs). `location` is either
 * a same-origin path + query (relative: behind Hostinger's proxy the host seen by Node is not necessarily the
 * public one) or an absolute canonical URL built by `storeUrl()` from the configuration, never from the request.
 */
export function permanentRedirect(req: Request, location: string): Response {
  const eff = effectiveHost(req.headers);
  const headers = new Headers(baseSecurityHeaders({ frame: "deny", cls: eff.cls }));
  headers.set("Location", location);
  headers.set("Cache-Control", "public, max-age=300");
  // ENGC-2, as for documents: a store host's 308 (renamed handle, upper-case slug) cached under the apex URL
  // would send every other store's visitors of that path to this store
  if (eff.via === "edge") headers.set("CDN-Cache-Control", "no-store");
  return new Response(null, { status: 308, headers });
}

/** The neutral public 404, byte for byte the proxy's answer for un-gated admin URLs (with the host class's HSTS). */
export function notFoundResponse(req: Request): Response {
  return unknownPageResponse(req.method, req.headers);
}

/** The neutral 410: a deleted store's handle in quarantine (§C.7). */
export function goneResponse(req: Request): Response {
  return gonePageResponse(req.method, req.headers);
}

/**
 * The neutral 503: the store backend (database) is unreachable (Retry-After 30), or a suspended store whose notice
 * the console turned on (D32: `Retry-After: 86400`). Never cached, never indexed, the neutral header set.
 */
export function unavailableResponse(req: Request, retryAfterSec?: number): Response {
  return unavailablePageResponse(req.method, req.headers, retryAfterSec);
}
