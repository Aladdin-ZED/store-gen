/**
 * Request proxy (Next.js 16 "proxy" convention, Node.js runtime): docs/STORE-SAAS.md §C.3. It parses,
 * classifies and rewrites; it never touches the database, and the only process state it keeps is its log
 * tally (foreign hosts once per host, unverifiable or previous edge keys; src/lib/edge/proxy-log.ts), which
 * decides nothing.
 *
 *  1. eff = effectiveHost(headers) (§C.2: the verified Worker headers, else the addressed Host; an x-sg-edge
 *     that does not verify is class "invalid", counted as `bad_key`), area = areaOf(pathname).
 *  2. Forwarded request headers: client copies of x-nonce / the legacy x-cs-pathname and of every x-sg-* deleted (the
 *     Worker's six kept when the edge verified, so handlers can re-verify, D18), the signed request path set
 *     (x-sg-path, x-sg-rid, x-sg-path-sig; SEC-3), the nonce headers for platform UI areas, and the Cookie
 *     header deleted wherever no cookie is ever needed (store pages, previews, public APIs; SEC-2).
 *  3. A rule per host class:
 *     platform  the gate, /admin and /api/admin as before (behind the gate cookie, or 404); with ADMIN_HOST set
 *               the console lives on its own host and is a 404 here. /d/** 404. Platform UI areas (console,
 *               app, auth, kit, marketing) get the nonce CSP + platformUiHeaders, except the dashboard
 *               manifest and the console media proxy (gated, the handler's headers; P0b V-1); area-auth GETs
 *               without a device marker get `__Host-sgd` (SEC-12). The rest passes.
 *     console   ADMIN_HOST: the gate, /admin, /api/admin and the sign-in pages; framework paths pass; any other
 *               path sends a gated browser to the same path on the platform host and anyone else to the 404.
 *     legacy    a former platform host: store paths, the cron tick, /api/health and the public POST APIs pass;
 *               other reads 308 to the platform host with the query byte for byte; the rest 404s.
 *     store     <handle>.<root> through the Worker: actions, odd methods and platform-only areas 404;
 *               /s/<own handle>/x 308s to /x; public APIs pass cookie-less; everything else is rewritten to
 *               /s/<handle><path>, never with a trailing slash for the home (ENGC-15).
 *     custom    (R3) the same with the rewrite target /d/<host><path>.
 *     reserved, invalid, foreign: the neutral 404 (foreign also logs the host once).
 *  4. On the platform and console hosts a Server Action POST whose Origin is the literal "null" gets a 403
 *     before Next's own action check can answer 500 (rev 5, CRIT2-11).
 *
 * Every answer the proxy produces is one of two header sets (ENGC-22): 404 / 403 → unknownPageHeaders() only
 * (byte-identical to a route's unknown-slug answer), redirects → redirectHeaders(). A forwarded response keeps
 * the handler's headers plus the host-class HSTS (§F.6: on every response, 404s included).
 *
 * The app re-checks everything itself (requireUser, the seam, assertAdminAccess, storeAction refusing non-platform
 * hosts): this is the outer wall.
 */
import { NextResponse, type NextRequest } from "next/server";
import { GATE_COOKIE, IS_PROD, NONCE_HEADER } from "@/lib/auth/config";
import { gateCookieOptions, gateTokenIssuedAt, isAdminIpAllowed, issueGateToken, shouldRenewGateToken } from "@/lib/auth/gate";
import { UNKNOWN_PAGE_HTML, unknownPageHeaders } from "@/lib/auth/unknown-page";
import { areaOf, isAppManifestPath, isConsoleMediaPath, normalizePath, storePathParts, type Area } from "@/lib/edge/areas";
import { DEVICE_COOKIE, deviceCookieOptions, newDeviceId, readDeviceId } from "@/lib/edge/device";
import { adminHostName, platformUrl } from "@/lib/edge/env";
import { EDGE_HEADERS, edgeCheck, effectiveHost, type EffectiveHost } from "@/lib/edge/host";
import { noteEdgeCheck, reportForeignHost } from "@/lib/edge/proxy-log";
import { stampRequestPath } from "@/lib/edge/path-sig";
import { generateNonce, hstsValue, platformUiHeaders, redirectHeaders, type PlatformUiArea } from "@/lib/security/headers";

interface Ctx {
  req: NextRequest;
  eff: EffectiveHost;
  area: Area;
  /** upper-case request method */
  method: string;
  /** raw pathname and search ("" or "?…"), as the browser sent them */
  pathname: string;
  search: string;
}

/** The Worker's request headers (§C.5): forwarded only when the edge verified. */
const EDGE_KEEP: ReadonlySet<string> = new Set(Object.values(EDGE_HEADERS));

/** Areas a store (or custom) host never serves (§C.3 `store` row). */
const STORE_REFUSED: ReadonlySet<Area> = new Set(["console", "console-api", "app", "app-api", "auth", "kit", "internal", "preview", "api-v1", "cron", "gate"]);
const STORE_METHODS: ReadonlySet<string> = new Set(["GET", "HEAD", "POST", "OPTIONS"]);

/** Areas a legacy host answers with the 404 rather than a move to the platform (§C.4: console, preview, /d, api-v1). */
const LEGACY_REFUSED: ReadonlySet<Area> = new Set(["console", "console-api", "gate", "internal", "preview", "api-v1"]);

/** Platform areas that never need a cookie: the Cookie header is deleted before the handler runs (SEC-2). */
const COOKIELESS: ReadonlySet<Area> = new Set(["store", "preview", "public-api", "api-v1"]);

/** Proxy areas rendered as platform UI (nonce CSP, §F.6 "Platform UI"). */
const UI_AREA: Partial<Record<Area, PlatformUiArea>> = {
  console: "console",
  "console-api": "console",
  app: "app",
  auth: "auth",
  kit: "kit",
  marketing: "marketing",
};

const isRead = (ctx: Ctx) => ctx.method === "GET" || ctx.method === "HEAD";

/* ------------------------------------------------------------------ answers */

/** The neutral 404 (HTML for GET, empty otherwise) or the empty action 403: the one 404 header set. */
function neutral(ctx: Ctx, status: 404 | 403 = 404): NextResponse {
  const body = status === 404 && ctx.method === "GET" ? UNKNOWN_PAGE_HTML : null;
  return new NextResponse(body, { status, headers: unknownPageHeaders(ctx.eff.cls) });
}

/** A redirect the proxy produces: base headers + `private, no-store`. */
function redirect(ctx: Ctx, location: URL, status: 303 | 307 | 308): NextResponse {
  const res = NextResponse.redirect(location, status);
  for (const [name, value] of Object.entries(redirectHeaders(ctx.eff.cls))) res.headers.set(name, value);
  return res;
}

/** `path` + the raw query on `origin`. The path is assigned as a path, so "//evil.example" stays on that host. */
function urlOn(origin: string, path: string, search: string): URL {
  const target = new URL(origin);
  target.pathname = path;
  target.search = search;
  return target;
}

/** The same path and query on the platform host (GET/HEAD only); null when no platform URL is configured. */
function toPlatform(ctx: Ctx, status: 307 | 308): NextResponse | null {
  const origin = platformUrl();
  if (!origin || !isRead(ctx)) return null;
  return redirect(ctx, urlOn(origin.origin, ctx.pathname, ctx.search), status);
}

/** The pre-R1.0 console path header: the app reads the signed x-sg-path now (CCR r1.0-t3-1); a client copy is still deleted. */
const LEGACY_PATH_HEADER = "x-cs-pathname";

/** The request headers the app sees (step 2). */
function forwardHeaders(ctx: Ctx, opts: { cookie: boolean }): Headers {
  const headers = new Headers(ctx.req.headers);
  headers.delete(NONCE_HEADER);
  headers.delete(LEGACY_PATH_HEADER);
  const keepEdge = ctx.eff.via === "edge";
  for (const name of [...headers.keys()]) {
    if (name.startsWith("x-sg-") && !(keepEdge && EDGE_KEEP.has(name))) headers.delete(name);
  }
  if (!opts.cookie) headers.delete("cookie");
  stampRequestPath(headers, `${ctx.pathname}${ctx.search}`);
  return headers;
}

/** The host-class HSTS on a response the handler produces (production; the proxy's value wins, §F.6). */
function withHsts(ctx: Ctx, res: NextResponse): NextResponse {
  if (IS_PROD) res.headers.set("Strict-Transport-Security", hstsValue(ctx.eff.cls));
  return res;
}

function pass(ctx: Ctx, opts: { cookie: boolean } = { cookie: true }): NextResponse {
  return withHsts(ctx, NextResponse.next({ request: { headers: forwardHeaders(ctx, opts) } }));
}

/** Internal rewrite to `path` (+ the raw query), cookie-less: the store and custom host classes. */
function rewrite(ctx: Ctx, path: string): NextResponse {
  const url = ctx.req.nextUrl.clone();
  url.pathname = path;
  url.search = ctx.search;
  return withHsts(ctx, NextResponse.rewrite(url, { request: { headers: forwardHeaders(ctx, { cookie: false }) } }));
}

/** A platform UI request: the per-request nonce reaches Next through the request's CSP header (and x-nonce). */
function platformUi(ctx: Ctx, area: PlatformUiArea): NextResponse {
  const nonce = generateNonce();
  const headers = platformUiHeaders(nonce, { dev: !IS_PROD, area, cls: ctx.eff.cls });
  const requestHeaders = forwardHeaders(ctx, { cookie: true });
  requestHeaders.set(NONCE_HEADER, nonce);
  requestHeaders.set("Content-Security-Policy", headers["Content-Security-Policy"]!);
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  for (const [name, value] of Object.entries(headers)) res.headers.set(name, value);
  return res;
}

/* ------------------------------------------------------------------ the console gate (today's logic) */

/** Issue time of a valid gate cookie from an allowed IP; null otherwise (gate unconfigured, invalid, expired). */
function gatedAt(ctx: Ctx): number | null {
  return isAdminIpAllowed(ctx.req.headers) ? gateTokenIssuedAt(ctx.req.cookies.get(GATE_COOKIE)?.value) : null;
}

/** "/<ADMIN_GATE>": sets the signed gate cookie and 303s to /admin; a wrong IP or method gets `otherwise`. */
function gate(ctx: Ctx, otherwise: () => NextResponse): NextResponse {
  if (!isAdminIpAllowed(ctx.req.headers) || !isRead(ctx)) return otherwise();
  const res = redirect(ctx, new URL("/admin", ctx.req.url), 303);
  res.cookies.set(GATE_COOKIE, issueGateToken(), gateCookieOptions());
  return res;
}

/**
 * /admin/**, /api/admin/**: platform UI behind the gate cookie, re-issued once a day (sliding lifetime). A read of the
 * console media proxy passes behind the same gate with the session but without the console header set, so the
 * handler's sandbox CSP, nosniff and `private, no-store` are what the client gets (P0b V-1, like the manifest).
 */
function consoleArea(ctx: Ctx): NextResponse {
  const issuedAt = gatedAt(ctx);
  if (issuedAt === null) return neutral(ctx);
  const res = isRead(ctx) && isConsoleMediaPath(ctx.pathname) ? pass(ctx) : platformUi(ctx, "console");
  if (shouldRenewGateToken(issuedAt)) res.cookies.set(GATE_COOKIE, issueGateToken(), gateCookieOptions());
  return res;
}

/**
 * Framework paths a dedicated console host still serves next to /admin (build assets, fonts, media and the
 * favicon never reach the proxy, see the matcher). Dev adds the overlay's endpoints and fixture photos.
 */
function isFrameworkPath(pathname: string): boolean {
  if (pathname.startsWith("/_next/")) return true;
  return !IS_PROD && (pathname.startsWith("/__nextjs") || pathname.startsWith("/dev-fixtures/"));
}

/* ------------------------------------------------------------------ host classes */

function onPlatform(ctx: Ctx): NextResponse {
  const { area } = ctx;
  // ADMIN_HOST set: the console left this origin (D44); the gate path is then an ordinary unknown path here
  const consoleElsewhere = adminHostName() !== null;
  if (area === "gate") return consoleElsewhere ? pass(ctx) : gate(ctx, () => pass(ctx));
  if (area === "console" || area === "console-api") return consoleElsewhere ? neutral(ctx) : consoleArea(ctx);
  if (area === "internal") return neutral(ctx);
  if (COOKIELESS.has(area)) return pass(ctx, { cookie: false });
  // the dashboard's manifest: public, no session, the handler's Content-Type and Cache-Control (PLA Q.26)
  if (area === "app" && isRead(ctx) && isAppManifestPath(ctx.pathname)) return pass(ctx, { cookie: false });
  const ui = UI_AREA[area];
  if (!ui) return pass(ctx);
  const res = platformUi(ctx, ui);
  if (area === "auth" && ctx.method === "GET" && !readDeviceId(ctx.req.cookies.get(DEVICE_COOKIE)?.value)) {
    res.cookies.set(DEVICE_COOKIE, newDeviceId(), deviceCookieOptions());
  }
  return res;
}

function onConsole(ctx: Ctx): NextResponse {
  const { area } = ctx;
  if (area === "gate") return gate(ctx, () => neutral(ctx));
  if (area === "console" || area === "console-api") return consoleArea(ctx);
  // staff sign in where the console is (its host-only session cookie never reaches the platform host)
  if (area === "auth") return platformUi(ctx, "auth");
  if (isFrameworkPath(ctx.pathname)) return pass(ctx);
  // A store page served on the console host would run its pixel scripts on the console's origin. A gated
  // browser's own links to live pages go on to the platform host; anyone else gets the 404.
  return (gatedAt(ctx) !== null && toPlatform(ctx, 307)) || neutral(ctx);
}

function onLegacy(ctx: Ctx): NextResponse {
  const { area } = ctx;
  if (LEGACY_REFUSED.has(area)) return neutral(ctx);
  const path = normalizePath(ctx.pathname);
  // the store route answers 308 to storeUrl(store, /<rest>): only it knows the handle's canonical address
  if (area === "store" && isRead(ctx) && storePathParts(ctx.pathname)) return pass(ctx, { cookie: false });
  // the hPanel cron line keeps the old host until the owner updates it
  if (area === "cron" && isRead(ctx) && path === "/api/cron/tick") return pass(ctx);
  if (area === "public-api") {
    if (path === "/api/health") return pass(ctx, { cookie: false });
    // pages published before the move (and exports) keep posting here; OPTIONS is a POST's CORS preflight
    const publicWrite = path.startsWith("/api/public/") && (ctx.method === "POST" || ctx.method === "OPTIONS");
    if (publicWrite) return pass(ctx, { cookie: false });
  }
  return toPlatform(ctx, 308) ?? neutral(ctx);
}

/** The store home is `/s/<h>`, never `/s/<h>/` (ENGC-15: it would miss src/app/s/[store]/route.ts). */
const homeless = (pathname: string) => (pathname === "/" ? "" : pathname);

function onStore(ctx: Ctx, label: string): NextResponse {
  const { area, req } = ctx;
  if (req.headers.has("next-action") || !STORE_METHODS.has(ctx.method) || STORE_REFUSED.has(area)) return neutral(ctx);
  if (area === "store") {
    const parts = storePathParts(ctx.pathname);
    if (!parts || parts.handle !== label) return neutral(ctx);
    if (ctx.method !== "GET" && ctx.method !== "HEAD") return neutral(ctx); // POST / OPTIONS never redirect
    // own handle: the same page without the prefix on this host (D17); the raw remainder when it is a plain one
    const prefix = `/s/${label}`;
    const raw = ctx.pathname.toLowerCase().startsWith(prefix) ? ctx.pathname.slice(prefix.length) : null;
    const rest = raw !== null && (raw === "" || raw.startsWith("/")) ? raw : parts.rest;
    return redirect(ctx, urlOn(`https://${ctx.eff.host}`, rest || "/", ctx.search), 308);
  }
  if (area === "public-api") return pass(ctx, { cookie: false });
  return rewrite(ctx, `/s/${label}${homeless(ctx.pathname)}`);
}

function onCustom(ctx: Ctx): NextResponse {
  const { area, req } = ctx;
  if (req.headers.has("next-action") || !STORE_METHODS.has(ctx.method) || STORE_REFUSED.has(area) || area === "store") return neutral(ctx);
  if (area === "public-api") return pass(ctx, { cookie: false });
  // the /d/[host]/[[...path]] handler resolves the host to its store (verified store_domains only)
  return rewrite(ctx, `/d/${ctx.eff.host}${homeless(ctx.pathname)}`);
}

export function proxy(req: NextRequest): NextResponse {
  const now = Date.now();
  const eff = effectiveHost(req.headers, { now });
  // a Worker header set: bad_key / prev_key telemetry (a direct request carries none and costs nothing here)
  if (req.headers.has(EDGE_HEADERS.key)) noteEdgeCheck(edgeCheck(req.headers, now), now);
  const { pathname, search } = req.nextUrl;
  const ctx: Ctx = { req, eff, area: areaOf(pathname), method: req.method.toUpperCase(), pathname, search };

  switch (eff.cls) {
    case "platform":
    case "console":
      // step 4: an action POSTed with `Origin: null` (a no-referrer form) is refused here, never a 500
      if (ctx.method === "POST" && req.headers.has("next-action") && req.headers.get("origin") === "null") return neutral(ctx, 403);
      return eff.cls === "platform" ? onPlatform(ctx) : onConsole(ctx);
    case "legacy":
      return onLegacy(ctx);
    case "store":
      return eff.label ? onStore(ctx, eff.label) : neutral(ctx);
    case "custom":
      return onCustom(ctx);
    case "foreign":
      if (eff.host) reportForeignHost(eff.host);
      return neutral(ctx);
    default: // reserved, invalid
      return neutral(ctx);
  }
}

export const config = {
  matcher: [
    /*
     * Every path except build assets, the image optimizer, the favicon, self-hosted fonts, stored media and
     * the two media upload endpoints (constants only: proxy.md). The gate path is a runtime secret, so the
     * matcher has to stay broad. The upload endpoints are left out so Next never buffers a copy of their
     * ≤ 25 MB bodies (that kept experimental.proxyClientMaxBodySize at 26 MB for every path); they call
     * effectiveHost() and refuse non-platform hosts themselves, check the gate or the seam first and answer
     * refusals with the same 404 as below. /media/* serves every host class itself.
     */
    "/((?!_next/static|_next/image|favicon\\.ico|fonts/|media/|api/admin/media$|api/app/[^/]+/media$).*)",
  ],
};
