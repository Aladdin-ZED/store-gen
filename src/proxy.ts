/**
 * Request proxy (Next.js 16 "proxy" convention, Node.js runtime).
 *
 *  1. "/<ADMIN_GATE>"  → sets the signed gate cookie and redirects to /admin.
 *  2. /admin/** and /api/admin/** without a valid gate cookie (or from an IP outside
 *     ADMIN_IP_ALLOWLIST) → a 404 that looks like any unknown page; no admin code runs.
 *  3. Gated admin requests → per-request nonce CSP + hardening headers; the nonce reaches
 *     Next.js through the request's Content-Security-Policy header (and `x-nonce` for app code).
 *     A gate cookie older than a day is re-issued (sliding lifetime).
 *  4. ADMIN_HOST (optional) splits the origins: the gate, /admin and /api/admin work on that host
 *     only, and that host answers everything else (landing pages, legal pages, public APIs) with the
 *     same 404. The public pages load third-party pixel scripts; on the admin's origin those scripts
 *     could drive the admin with the owner's cookies.
 *  Everything else passes through untouched (landing route handlers set their own headers), minus
 *  any client-sent copy of the internal request headers.
 *  5. Every forwarded request carries the signed request path (x-sg-path, x-sg-rid, x-sg-path-sig;
 *     src/lib/edge/path-sig.ts, STORE-SAAS §C.3 step 2): the store seam reads a store action's store
 *     from it (C0a; T3 folds it into the host-class proxy).
 *
 * The app re-checks the gate itself (requireUser / assertAdminAccess) — this is the outer wall.
 */
import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_PATH_HEADER, GATE_COOKIE, IS_PROD, NONCE_HEADER, adminHost, publicSiteOrigin } from "@/lib/auth/config";
import { stampRequestPath } from "@/lib/edge/path-sig";
import {
  adminAreaOf,
  gateCookieOptions,
  gateTokenIssuedAt,
  isAdminHost,
  isAdminIpAllowed,
  isGatePath,
  issueGateToken,
  shouldRenewGateToken,
} from "@/lib/auth/gate";
import { UNKNOWN_PAGE_HEADERS, UNKNOWN_PAGE_HTML } from "@/lib/auth/unknown-page";
import { adminSecurityHeaders, baseSecurityHeaders, generateNonce } from "@/lib/security/headers";

const INTERNAL_HEADERS = [NONCE_HEADER, ADMIN_PATH_HEADER] as const;

/** Answer for un-gated admin requests: the public not-found page (HTML for GET, empty otherwise). */
function unknownUrl(req: NextRequest): NextResponse {
  const body = req.method === "GET" ? UNKNOWN_PAGE_HTML : null;
  return new NextResponse(body, { status: 404, headers: UNKNOWN_PAGE_HEADERS });
}

/** The request headers the app sees: client copies of the internal headers removed, the signed path set. */
function forwardHeaders(req: NextRequest): Headers {
  const headers = new Headers(req.headers);
  for (const name of INTERNAL_HEADERS) headers.delete(name);
  stampRequestPath(headers, `${req.nextUrl.pathname}${req.nextUrl.search}`);
  return headers;
}

/** Pass-through that never lets a client-supplied internal header reach the app. */
function passThrough(req: NextRequest): NextResponse {
  return NextResponse.next({ request: { headers: forwardHeaders(req) } });
}

/**
 * Framework paths a dedicated admin host still serves next to /admin (build assets, fonts, media and
 * the favicon never reach the proxy, see the matcher). Dev adds the overlay's endpoints and fixture photos.
 */
function isFrameworkPath(pathname: string): boolean {
  if (pathname.startsWith("/_next/")) return true;
  return !IS_PROD && (pathname.startsWith("/__nextjs") || pathname.startsWith("/dev-fixtures/"));
}

/**
 * The same path on the public site (PUBLIC_URL), for GET/HEAD; null otherwise. Only the origin comes
 * from config: the path is assigned as a path, so "//evil.example" stays on the public host.
 */
function toPublicSite(req: NextRequest): NextResponse | null {
  const origin = publicSiteOrigin();
  if (!origin || (req.method !== "GET" && req.method !== "HEAD")) return null;
  const target = new URL(origin);
  target.pathname = req.nextUrl.pathname;
  target.search = req.nextUrl.search;
  const res = NextResponse.redirect(target, 307);
  res.headers.set("Cache-Control", "private, no-store");
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}

export function proxy(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;
  // true on the dedicated admin host, and on every host when ADMIN_HOST is unset (shared origin)
  const onAdminHost = isAdminHost(req.headers);
  // a dedicated admin host: it answers nothing but the admin
  const adminOnly = onAdminHost && adminHost() !== null;

  if (isGatePath(pathname)) {
    // Wrong host, IP or method: behave as if the path meant nothing special.
    if (!onAdminHost || !isAdminIpAllowed(req.headers) || (req.method !== "GET" && req.method !== "HEAD")) {
      return adminOnly ? unknownUrl(req) : passThrough(req);
    }
    const res = NextResponse.redirect(new URL("/admin", req.url), 303);
    res.cookies.set(GATE_COOKIE, issueGateToken(), gateCookieOptions());
    for (const [name, value] of Object.entries(baseSecurityHeaders())) res.headers.set(name, value);
    res.headers.set("Cache-Control", "no-store");
    res.headers.set("Referrer-Policy", "no-referrer");
    res.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    return res;
  }

  // gateTokenIssuedAt() is null whenever the gate is unconfigured, the token invalid or expired.
  const gated = () => (onAdminHost && isAdminIpAllowed(req.headers) ? gateTokenIssuedAt(req.cookies.get(GATE_COOKIE)?.value) : null);

  if (!adminAreaOf(pathname)) {
    if (!adminOnly || isFrameworkPath(pathname)) return passThrough(req);
    // A landing page served on the admin host would run its pixel scripts on the admin's origin. The
    // owner's own links to live pages ("/<slug>", "/legal/…") go on to the public site; anyone else gets the 404.
    return (gated() !== null && toPublicSite(req)) || unknownUrl(req);
  }

  const issuedAt = gated();
  if (issuedAt === null) return unknownUrl(req);

  const nonce = generateNonce();
  const headers = adminSecurityHeaders(nonce, { dev: !IS_PROD });

  // Internal headers are always overwritten, never trusted from the client.
  const requestHeaders = forwardHeaders(req);
  requestHeaders.set(NONCE_HEADER, nonce);
  requestHeaders.set("Content-Security-Policy", headers["Content-Security-Policy"]!);
  requestHeaders.set(ADMIN_PATH_HEADER, `${pathname}${req.nextUrl.search}`.slice(0, 512));

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  for (const [name, value] of Object.entries(headers)) res.headers.set(name, value);
  if (shouldRenewGateToken(issuedAt)) res.cookies.set(GATE_COOKIE, issueGateToken(), gateCookieOptions());
  return res;
}

export const config = {
  matcher: [
    /*
     * Every path except build assets, the image optimizer, the favicon, self-hosted fonts, stored
     * media and the media upload endpoint. The gate path is a runtime secret, so the matcher has to
     * stay broad. /api/admin/media is left out so Next never buffers a copy of its ≤ 25 MB bodies
     * (that kept experimental.proxyClientMaxBodySize at 26 MB for every path); the route checks the
     * gate itself first and answers un-gated requests with the same 404 as below.
     */
    "/((?!_next/static|_next/image|favicon\\.ico|fonts/|media/|api/admin/media$).*)",
  ],
};
