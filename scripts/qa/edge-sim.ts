/**
 * qa:edge-sim (docs/STORE-SAAS.md §J.3, §C.5): the Cloudflare Worker (`edge/worker.js`, run as it is) in front of
 * the app. Two parts:
 *
 *   npm run qa:edge-sim
 *     OFFLINE (no server, no database): the Worker's subrequest goes through a model of Cloudflare's cache
 *     (keyed by the subrequest URL, a zone "Cache Everything" rule assumed: the worst case) into src/proxy.ts
 *     and, for what the proxy forwards, the real document producers (documentResponse, permanentRedirect).
 *       1. the Worker alone: fail-closed bindings, refusals whose path and body never reach the origin (methods,
 *          Next-Action, platform-only areas incl. encoded spellings: forwarded as GET / HEAD `/s`; the apex never
 *          forwarded), stripped and stamped headers, the raw path and query byte for byte, the `cf` option (ENGC-2:
 *          a negative TTL for every status, never `cacheTtl`), Set-Cookie stripped, x-sg-mode, origin errors (503
 *          with Retry-After and HSTS);
 *       2. Worker → proxy → app in S mode: the store home rewritten without a trailing slash (ENGC-15), store
 *          pages and public APIs reached cookie-less (SEC-2) with a verified edge and a proxy-signed path
 *          (SEC-3), the own-handle 308, other handles and platform areas 404, no Set-Cookie on store hosts,
 *          the document CSP naming the store host only (§C.9), a wrong key (SEC-4), the EDGE_KEY rotation,
 *          a replayed header set after 5 minutes; the Worker's refusals byte-identical to the app's neutral 404
 *          of an unknown path (`/admin` = `/login`, §F.6);
 *       3. the cache (ENGC-2): two store hosts on one path never share a body and the apex request of that
 *          path answers the platform page, with the `cf` option, and again with a zone rule that ignores it
 *          (the origin's `CDN-Cache-Control: no-store` holds); a negative control without either leaks, and so does
 *          the former `cf: { cacheTtl: 0 }` (Cloudflare: cacheTtl forces caching, 0 = stored, served stale while
 *          it revalidates);
 *       4. platform cookies only with the `__Host-` prefix (SEC-13); a client x-sg-path never verifies on a
 *          path outside the proxy matcher (SEC-3).
 *
 *   npm run qa:edge-sim -- --base http://127.0.0.1:3451 --store <handle A> --store-b <handle B> [--slug <live slug of A>] [--strict]
 *     ONLINE (§J.3: a production build on port 3451+ against a cod_test_* database), run with the server's own
 *     PLATFORM_URL, STORE_ROOT_DOMAIN and EDGE_KEY in this process's environment (never printed). The requests
 *     are built by edge/worker.js itself and sent to --base with the apex as Host; the offline part runs first.
 *     Without --base the online part is reported as not run (exit code from the offline part).
 *
 * PENDING RULE (P0b): an R1 route case (P1-7: `GET https://<h>.<root>/report/<h>` → the neutral 404, PLA-§24.2) names
 * the route module it needs; while that file does not exist the case is listed as `pending (route not built: <file>)`,
 * counted neither as a pass nor as a failure. `--strict` (the R1 integration) turns every pending case into a failure.
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import Module from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { NextRequest as NextRequestType, NextResponse as NextResponseType } from "next/server";

// the modules under test are marked `import "server-only"`; outside Next that import throws
{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = require.resolve("next/dist/compiled/server-only/empty.js");
  M._resolveFilename = function (this: unknown, req: string, ...rest: unknown[]) {
    return req === "server-only" ? stub : orig.call(this, req, ...rest);
  };
}

const env = process.env as Record<string, string | undefined>;
const ARGS = process.argv.slice(2);
const arg = (name: string): string | null => {
  const i = ARGS.indexOf(`--${name}`);
  return i >= 0 ? (ARGS[i + 1] ?? null) : null;
};
const ONLINE_BASE = arg("base");
/** the online part keeps the caller's (= the server's) configuration; the offline part sets its own */
const ONLINE_ENV = { PLATFORM_URL: env.PLATFORM_URL ?? env.PUBLIC_URL, STORE_ROOT_DOMAIN: env.STORE_ROOT_DOMAIN, EDGE_KEY: env.EDGE_KEY };
const STRICT = ARGS.includes("--strict");
const REPO = join(__dirname, "..", "..");

const PLATFORM = "storegen.example";
const ROOT = PLATFORM;
const SHOP1 = `shop1.${ROOT}`;
const SHOP2 = `shop2.${ROOT}`;
const EDGE_KEY = "edgeSimKeyCurrent-6Hq2Zr8Vt4Lm1Xc9Pn3Wb7Ks5Dj0Fg";
const EDGE_KEY_OLD = "edgeSimKeyPrevious-2Tb9Qm4Wx7Lc1Vn8Rk3Zp6Hs5Jd0Gf";
const WORKER_ENV = { EDGE_KEY, ORIGIN: `https://${PLATFORM}`, STORE_ROOT: ROOT, WORKER_VERSION: "w-sim.1" };

// IS_PROD is read once at import: production, S mode on (STORE_ROOT_DOMAIN + EDGE_KEY)
env.NODE_ENV = "production";
env.APP_SECRET = "edgeSimAppSecret-9Wd3Kq7Lx2Vb5Nm8Rt1Zc4Hp6Jf0Gs";
env.ADMIN_GATE = "gate-edge-sim-4k8q2m7x";
env.PLATFORM_URL = `https://${PLATFORM}`;
env.STORE_ROOT_DOMAIN = ROOT;
env.EDGE_KEY = EDGE_KEY;
env.ADMIN_IP_ALLOWLIST = "";
for (const name of ["PUBLIC_URL", "ADMIN_HOST", "EDGE_KEY_PREV", "LEGACY_PLATFORM_HOSTS", "BEHIND_CLOUDFLARE", "TRUSTED_PROXY_HOPS"]) delete env[name];

let failures = 0;
let checks = 0;
function check(ok: boolean, msg: string): void {
  checks++;
  if (!ok) {
    failures++;
    console.error(`  ✗ ${msg}`);
  }
}
function eq<T>(actual: T, expected: T, msg: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  check(a === e, `${msg}: got ${a}, expected ${e}`);
}
const section = (title: string) => console.log(`• ${title}`);

/** The P0b pending rule: run `fn` once `route` (a file under src/app/**) exists; else list it, or fail it under --strict. */
const pendingCases: string[] = [];
async function routeCase(label: string, route: string, fn: () => unknown | Promise<unknown>): Promise<void> {
  if (existsSync(join(REPO, route))) {
    await fn();
    return;
  }
  const reason = `route not built: ${route}`;
  pendingCases.push(label);
  if (STRICT) check(false, `${label}: pending (${reason}) under --strict`);
  else console.log(`  … ${label}: pending (${reason})`);
}

/* ------------------------------------------------------------------ the Worker */

interface CfOption {
  cacheTtl?: number;
  cacheEverything?: boolean;
  cacheTtlByStatus?: Record<string, number>;
}
interface SubInit {
  method: string;
  headers: Headers;
  body: BodyInit | null;
  redirect?: string;
  cf?: CfOption;
}
interface Sub {
  url: string;
  init: SubInit;
}
interface Worker {
  fetch(request: Request, env: Record<string, string | undefined>): Promise<Response>;
}

type Origin = (url: string, init: SubInit) => Promise<Response>;
const subrequests: Sub[] = [];
let origin: Origin = async () => new Response("no origin", { status: 599 });
// the Worker's global fetch is its subrequest to the origin
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const sub: Sub = { url: String(input), init: init as unknown as SubInit };
  subrequests.push(sub);
  return origin(sub.url, sub.init);
}) as typeof fetch;

async function loadWorker(): Promise<Worker> {
  const mod = (await import(pathToFileURL(join(__dirname, "..", "..", "edge", "worker.js")).href)) as { default: Worker | { default: Worker } };
  const w = mod.default as Worker & { default?: Worker };
  return typeof w.fetch === "function" ? w : (w.default as Worker);
}

interface Visit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  env?: Record<string, string | undefined>;
  ip?: string | null;
}

const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

async function main(): Promise<void> {
  const worker = await loadWorker();
  const { NextRequest } = await import("next/server");
  const { proxy } = await import("@/proxy");
  const { edgeVerified, effectiveHost } = await import("@/lib/edge/host");
  const { verifiedRequestPath } = await import("@/lib/edge/path-sig");
  const { edgeTally, resetProxyLog } = await import("@/lib/edge/proxy-log");
  const { UNKNOWN_PAGE_HTML } = await import("@/lib/auth/unknown-page");
  const { documentResponse, permanentRedirect } = await import("@/lib/render/serve.server");
  const { buildLandingCsp } = await import("@/lib/render/csp");
  const { platformOrigin } = await import("@/lib/urls");

  // the proxy's log lines (bad_key, prev_key) are counted through edgeTally, not printed
  const warn = console.warn;
  console.warn = () => undefined;

  const visit = (host: string, path: string, o: Visit = {}): Promise<Response> => {
    const headers = new Headers(o.headers);
    if (o.ip !== null) headers.set("cf-connecting-ip", o.ip ?? "198.51.100.23");
    const request = new Request(`https://${host}${path}`, { method: o.method ?? "GET", headers, body: o.body });
    return worker.fetch(request, o.env ?? WORKER_ENV);
  };
  const lastSub = () => subrequests[subrequests.length - 1] ?? null;
  /** run `fn` and report whether the Worker sent a subrequest meanwhile */
  const reachedOrigin = async (fn: () => Promise<Response>): Promise<{ res: Response; reached: boolean }> => {
    const before = subrequests.length;
    const res = await fn();
    return { res, reached: subrequests.length > before };
  };

  /* -------------------------------------------------------------- the app behind the proxy */

  type Kind = "next" | "rewrite" | "answer";
  const kindOf = (res: NextResponseType): Kind => {
    if (res.headers.get("x-middleware-rewrite")) return "rewrite";
    if (res.headers.get("x-middleware-next") === "1") return "next";
    return "answer";
  };
  /** the request headers the handler receives (x-middleware-override-headers) */
  const forwarded = (res: NextResponseType, fallback: Headers): Headers => {
    const list = res.headers.get("x-middleware-override-headers");
    if (list === null) return new Headers(fallback);
    const out = new Headers();
    for (const name of list.split(",").filter(Boolean)) out.set(name, res.headers.get(`x-middleware-request-${name}`) ?? "");
    return out;
  };
  /** what a client sees of a proxy answer (the x-middleware-* plumbing removed) */
  const clientView = (res: Response): Response => {
    const headers = new Headers();
    res.headers.forEach((value, name) => {
      if (!name.startsWith("x-middleware-") && name !== "set-cookie") headers.append(name, value);
    });
    for (const c of res.headers.getSetCookie()) headers.append("set-cookie", c);
    return new Response(res.body, { status: res.status, headers });
  };

  const storedCsp = buildLandingCsp({
    mode: "live",
    scriptHashes: ["sha256-c2ltdWxhdGVkLXJ1bnRpbWUtY2h1bmstaGFzaA=="],
    styleHashes: ["sha256-c2ltdWxhdGVkLWlubGluZS1zdHlsZS1oYXNo"],
    pixels: { meta: true },
    mediaOrigins: [platformOrigin()],
    upgradeInsecureRequests: true,
  });

  /**
   * The route handlers behind the proxy, reduced to what the edge cares about: a store document through the
   * real documentResponse (its CSP narrowing, CDN-Cache-Control), a store 308 through permanentRedirect, a public
   * API answer, a platform page. Each answer also says what the handler saw (x-sim-*); store and public API
   * answers also try a Set-Cookie, so the Worker's stripping is visible.
   */
  const handler = async (target: string, method: string, headers: Headers): Promise<Response> => {
    const req = new Request(`https://${PLATFORM}${target}`, { method, headers });
    const store = /^\/s\/([a-z0-9-]+)(\/[^?]*)?/.exec(target);
    let res: Response;
    if (store && store[2] === "/moved") {
      res = permanentRedirect(req, `/s/${store[1]}/new-slug`);
    } else if (store) {
      const html = `<!doctype html><title>${store[1]}</title><p>store ${store[1]} page ${store[2] ?? "/"}</p>`;
      res = await documentResponse(req, { html, csp: storedCsp, etag: sha(html) }, { kind: "landing", store: { id: `st_${store[1]}`, handle: store[1]! } });
    } else if (target.startsWith("/api/public/")) {
      res = new Response('{"ok":true}', { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
    } else {
      res = new Response(`platform page ${target}`, { headers: { "Content-Type": "text/plain", "Cache-Control": "public, max-age=0, s-maxage=300" } });
    }
    if (store || target.startsWith("/api/public/")) res.headers.append("set-cookie", "sim-handler=1; Path=/");
    res.headers.set("x-sim-cookie", headers.has("cookie") ? "seen" : "none");
    res.headers.set("x-sim-edge", edgeVerified(headers) ? "verified" : "no");
    res.headers.set("x-sim-path", verifiedRequestPath(headers) ?? "unsigned");
    res.headers.set("x-sim-target", target);
    return res;
  };

  /** The app at the origin: the proxy, then (when it forwards) the handler; the proxy's own headers win. */
  const app: Origin = async (url, init) => {
    const headers = new Headers(init.headers);
    headers.set("host", new URL(url).host);
    const reqInit = { method: init.method, headers, body: init.body, duplex: "half" } as unknown as ConstructorParameters<typeof NextRequest>[1];
    const req: NextRequestType = new NextRequest(url, reqInit);
    const pres = proxy(req);
    const kind = kindOf(pres);
    if (kind === "answer") return clientView(pres);
    const u = new URL(url);
    const target = kind === "rewrite" ? (() => {
      const r = new URL(pres.headers.get("x-middleware-rewrite")!);
      return `${r.pathname}${r.search}`;
    })() : `${u.pathname}${u.search}`;
    const res = await handler(target, init.method, forwarded(pres, headers));
    pres.headers.forEach((value, name) => {
      if (!name.startsWith("x-middleware-") && name !== "set-cookie") res.headers.set(name, value);
    });
    for (const c of pres.headers.getSetCookie()) res.headers.append("set-cookie", c);
    return res;
  };

  /* -------------------------------------------------------------- Cloudflare's cache, modelled */

  interface CacheMode {
    /**
     * the subrequest's `cf` option is applied as Cloudflare documents it: a negative TTL in cacheTtlByStatus for
     * every status = never read, never stored; `cacheTtl` (any value) forces caching over the origin's headers,
     * and 0 means stored, expired at once and served stale while it revalidates (cf-cache-status UPDATING)
     */
    honourCf: boolean;
    /** the origin's CDN-Cache-Control: no-store keeps a response out of the cache */
    honourCdn: boolean;
  }
  /** A zone with a "Cache Everything" rule (the worst case): every GET is cached by URL unless something says no. */
  const cfCache = (mode: CacheMode, next: Origin): Origin & { size: () => number } => {
    const store = new Map<string, { status: number; headers: [string, string][]; body: string }>();
    const fn = (async (url: string, init: SubInit) => {
      const cf = mode.honourCf ? init.cf : undefined;
      const bypass = Object.entries(cf?.cacheTtlByStatus ?? {}).some(([range, ttl]) => range === "100-599" && ttl < 0);
      const forced = !bypass && typeof cf?.cacheTtl === "number";
      const usable = (init.method === "GET" || init.method === "HEAD") && !bypass;
      const hit = usable ? store.get(url) : undefined;
      if (hit) return new Response(hit.body, { status: hit.status, headers: [...hit.headers, ["cf-cache-status", forced ? "UPDATING" : "HIT"]] });
      const res = await next(url, init);
      const noStore = !forced && mode.honourCdn && /\bno-store\b/i.test(res.headers.get("cdn-cache-control") ?? "");
      if (usable && !noStore && (res.status === 200 || res.status === 308)) {
        const headers: [string, string][] = [];
        res.headers.forEach((v, k) => headers.push([k, v]));
        store.set(url, { status: res.status, headers, body: await res.clone().text() });
      }
      return res;
    }) as Origin & { size: () => number };
    fn.size = () => store.size;
    return fn;
  };

  /* ============================================================== 1. the Worker alone */
  section("Worker: bindings, refusals, stamping, response");
  origin = async (url, init) =>
    new Response(`origin ${init.method} ${url}`, { status: 200, headers: { "set-cookie": "a=1", "x-origin": "1", "x-middleware-rewrite": "/s/shop1/x" } });

  for (const [label, bindings] of [
    ["no EDGE_KEY", { ...WORKER_ENV, EDGE_KEY: undefined }],
    ["a short EDGE_KEY", { ...WORKER_ENV, EDGE_KEY: "short-key" }],
    ["no ORIGIN", { ...WORKER_ENV, ORIGIN: undefined }],
    ["an http ORIGIN", { ...WORKER_ENV, ORIGIN: `http://${PLATFORM}` }],
    ["an ORIGIN with a path", { ...WORKER_ENV, ORIGIN: `https://${PLATFORM}/x` }],
  ] as const) {
    const { res, reached } = await reachedOrigin(() => visit(SHOP1, "/", { env: bindings }));
    check(res.status === 503 && !reached, `${label}: the Worker answers 503 itself (got ${res.status}, origin reached: ${reached})`);
  }

  const refusals: [string, string, Visit][] = [
    ["PUT", "/x", { method: "PUT", body: "x" }],
    ["DELETE", "/x", { method: "DELETE" }],
    ["PATCH", "/x", { method: "PATCH", body: "x" }],
    ["a Next-Action POST", "/x", { method: "POST", headers: { "next-action": "abc" }, body: "[]" }],
    ["/admin", "/admin", {}],
    ["/ADMIN/pages", "/ADMIN/pages", {}],
    ["/%61dmin", "/%61dmin", {}],
    ["//admin", "//admin", {}],
    ["/app", "/app", {}],
    ["/app/shop1/orders", "/app/shop1/orders", {}],
    ["/api/app/shop1/pulse", "/api/app/shop1/pulse", {}],
    ["/api/admin/media", "/api/admin/media", { method: "POST", body: "x" }],
    ["/api/cron/tick", "/api/cron/tick", {}],
    ["/api/v1/orders", "/api/v1/orders", {}],
    ["/kit/token", "/kit/token", {}],
  ];
  for (const [label, path, o] of refusals) {
    const { reached } = await reachedOrigin(() => visit(SHOP1, path, { ...o, headers: { ...o.headers, "content-type": "text/plain" } }));
    const sub = lastSub()!;
    const read = (o.method ?? "GET") === "GET" ? "GET" : "HEAD";
    eq([reached, sub.url, sub.init.method, sub.init.body], [true, `https://${PLATFORM}/s`, read, null], `${label} on a store host: forwarded as ${read} /s, the path and body stay at the edge`);
    check(!sub.init.headers.has("content-type") && sub.init.headers.get("x-sg-host") === SHOP1, `${label}: stamped, without the body's headers`);
  }
  for (const host of [PLATFORM, `www.${ROOT}`]) {
    const { res, reached } = await reachedOrigin(() => visit(host, "/"));
    check(res.status === 404 && !reached, `${host} never runs through the Worker (got ${res.status})`);
  }
  for (const path of ["/application", "/apps", "/kits", "/api/public/order", "/s/shop1/x", "/administrator"]) {
    const { reached } = await reachedOrigin(() => visit(SHOP1, path, path.startsWith("/api/") ? { method: "POST", body: "{}" } : {}));
    check(reached, `${path} is not a platform-only path: forwarded`);
  }

  // stamping: every client x-sg-*, Cookie, Next.js internals and forwarding headers dropped; the six set
  {
    const t0 = Date.now();
    const res = await visit("SHOP1.storegen.example.", "/promo/x?fbclid=A%2Fb&utm_source=fb&&q=%20#frag", {
      headers: {
        "x-sg-edge": "forged",
        "x-sg-host": "evil.example",
        "x-sg-ip": "10.0.0.1",
        "x-sg-ts": "1",
        "x-sg-worker": "forged",
        "x-sg-path": "/app/victim",
        "x-sg-path-sig": "forged",
        "x-sg-rid": "01JAAAAAAAAAAAAAAAAAAAAAAA",
        cookie: "__Host-cs=stolen",
        "x-middleware-subrequest": "src/proxy:src/proxy:src/proxy:src/proxy:src/proxy",
        "x-forwarded-host": "evil.example",
        forwarded: "host=evil.example",
        "x-real-ip": "10.0.0.2",
        "x-nonce": "forged",
        "x-cs-pathname": "/admin",
        "accept-language": "fr-MA",
      },
      ip: "203.0.113.9",
    });
    const sub = lastSub()!;
    const h = sub.init.headers;
    eq(sub.url, `https://${PLATFORM}/promo/x?fbclid=A%2Fb&utm_source=fb&&q=%20`, "subrequest URL: the origin + the raw path and query, byte for byte");
    eq(sub.init.cf, { cacheTtlByStatus: { "100-599": -1 } }, "the cf option: a negative TTL for every status, never cacheTtl (ENGC-2)");
    eq(sub.init.redirect, "manual", "redirects are the browser's, never followed by the Worker");
    eq(h.get("x-sg-host"), SHOP1, "x-sg-host: the request host, lower-case, no trailing dot");
    eq(h.get("x-sg-edge"), EDGE_KEY, "x-sg-edge: the Worker secret");
    eq(h.get("x-sg-ip"), "203.0.113.9", "x-sg-ip: CF-Connecting-IP");
    eq(h.get("x-sg-proto"), "https", "x-sg-proto");
    eq(h.get("x-sg-worker"), "w-sim.1", "x-sg-worker: WORKER_VERSION");
    const ts = Number(h.get("x-sg-ts"));
    check(ts >= t0 && ts <= Date.now(), `x-sg-ts is the Worker's clock (${h.get("x-sg-ts")})`);
    for (const name of ["cookie", "x-middleware-subrequest", "x-forwarded-host", "forwarded", "x-real-ip", "x-nonce", "x-cs-pathname", "x-sg-path", "x-sg-path-sig", "x-sg-rid", "host"]) {
      check(!h.has(name), `client ${name} never reaches the origin`);
    }
    eq(h.get("accept-language"), "fr-MA", "ordinary request headers pass");
    eq(res.headers.getSetCookie(), [], "Set-Cookie stripped from the response");
    eq(res.headers.get("x-middleware-rewrite"), null, "Next's x-middleware-rewrite stripped from the response (ENGC-22)");
    eq(res.headers.get("x-sg-mode"), "subdomain", "x-sg-mode on the response");
    eq(res.headers.get("x-origin"), "1", "the origin's other headers pass");
  }
  {
    await visit(SHOP1, "/x", { ip: null, env: { ...WORKER_ENV, WORKER_VERSION: "bad version\r\nx: y" } });
    const h = lastSub()!.init.headers;
    check(!h.has("x-sg-ip"), "no CF-Connecting-IP: no x-sg-ip");
    eq(h.get("x-sg-worker"), "unset", "an unusable WORKER_VERSION is sent as 'unset'");
  }
  {
    origin = async () => new Response(null, { status: 308, headers: { location: "/promo?utm_source=fb", "set-cookie": "b=2" } });
    const res = await visit(SHOP1, "/s/shop1/promo?utm_source=fb");
    eq([res.status, res.headers.get("location"), res.headers.getSetCookie().length], [308, "/promo?utm_source=fb", 0], "a 308 passes with its Location, without its cookie");
    origin = async (_url, init) => new Response(`echo:${init.body === null ? "" : await new Response(init.body).text()}`);
    const post = await visit(SHOP1, "/api/public/order", { method: "POST", body: '{"pageKey":"k"}', headers: { "content-type": "application/json" } });
    eq(await post.text(), 'echo:{"pageKey":"k"}', "a POST body reaches the origin unchanged");
    origin = async () => {
      throw new Error("connection refused");
    };
    const down = await visit(SHOP1, "/");
    eq(
      [down.status, down.headers.get("x-sg-mode"), down.headers.get("retry-after"), down.headers.get("strict-transport-security"), await down.text()],
      [503, "subdomain", "30", "max-age=63072000", ""],
      "origin unreachable: the Worker's neutral 503 (Retry-After, store-class HSTS, no body)",
    );
  }

  /* ============================================================== 2. Worker → proxy → app */
  section("Worker → proxy → app (S mode)");
  origin = app;
  {
    const home = await visit(SHOP1, "/", { headers: { cookie: "__Host-cs=x; __Host-csg=y" } });
    eq([home.status, home.headers.get("x-sim-target")], [200, "/s/shop1"], "GET https://<h>.<root>/ → the store home, no trailing slash (ENGC-15)");
    eq(home.headers.get("x-sim-cookie"), "none", "no Cookie reaches the store route");
    eq(home.headers.get("x-sim-edge"), "verified", "the handler re-verifies the edge (D18)");
    eq(home.headers.get("x-sim-path"), "/", "the handler sees the proxy-signed path (SEC-3)");
    eq(home.headers.getSetCookie(), [], "no Set-Cookie on a store host");
    eq(home.headers.get("cdn-cache-control"), "no-store", "an edge-served document carries CDN-Cache-Control: no-store (ENGC-2)");
    eq(home.headers.get("strict-transport-security"), "max-age=63072000", "store host HSTS: no includeSubDomains (SEC-15)");
    const csp = home.headers.get("content-security-policy") ?? "";
    const directive = (name: string) => (csp.split(";").map((d) => d.trim()).find((d) => d.startsWith(`${name} `)) ?? "").split(/\s+/).slice(1);
    for (const name of ["connect-src", "form-action"]) {
      const values = directive(name);
      check(values.includes(`https://${SHOP1}/api/public/`), `${name} names the store host's public API (${values.join(" ")})`);
      check(!values.includes("'self'"), `${name}: no bare 'self' (SEC-2)`);
      check(!values.some((v) => v.includes(SHOP2) || v === `https://${PLATFORM}` || v === `https://${PLATFORM}/` || v.startsWith(`https://${PLATFORM}/api/public`)), `${name}: neither another store nor the platform origin (${values.join(" ")})`);
    }
    check(directive("img-src").includes(`https://${PLATFORM}`), "img-src allows the platform origin for media (R-D11)");

    const page = await visit(SHOP1, "/promo?utm_source=fb&fbclid=1");
    eq(page.headers.get("x-sim-target"), "/s/shop1/promo?utm_source=fb&fbclid=1", "a store page is rewritten with its raw query");
    const own = await visit(SHOP1, "/s/shop1/promo?fbclid=1&utm_source=fb");
    eq([own.status, own.headers.get("location"), own.headers.get("cache-control")], [308, `https://${SHOP1}/promo?fbclid=1&utm_source=fb`, "private, no-store"], "/s/<own handle>/x → 308 /x on the same host (D17)");
    const ownHome = await visit(SHOP1, "/s/shop1");
    eq(ownHome.headers.get("location"), `https://${SHOP1}/`, "/s/<own handle> → 308 /");
    const evil = await visit(SHOP1, "/s/shop1//evil.example/x");
    check(new URL(evil.headers.get("location") ?? "https://invalid/").host === SHOP1, `the own-handle 308 never leaves the host (${evil.headers.get("location")})`);
    const other = await visit(SHOP1, "/s/shop2/promo");
    eq([other.status, await other.text()], [404, UNKNOWN_PAGE_HTML], "/s/<other handle>/x → the neutral 404");

    const api = await visit(SHOP1, "/api/public/order", { method: "POST", body: "{}", headers: { cookie: "__Host-cs=x", "content-type": "application/json" } });
    eq([api.status, api.headers.get("x-sim-target"), api.headers.get("x-sim-cookie")], [200, "/api/public/order", "none"], "public API on a store host: passed cookie-less");
    eq(api.headers.getSetCookie(), [], "no Set-Cookie from a public API on a store host");

    const moved = await visit(SHOP1, "/moved");
    eq([moved.status, moved.headers.get("cache-control"), moved.headers.get("cdn-cache-control")], [308, "public, max-age=300", "no-store"], "a store route's canonical 308 through the edge: CDN-Cache-Control: no-store");

    // §F.6: one neutral 404 whoever produces it; the Worker's refusals are the app's answer for an unknown path
    const answer = async (res: Response) => {
      const headers: [string, string][] = [];
      res.headers.forEach((v, k) => headers.push([k, v]));
      return { status: res.status, headers: headers.sort(), body: await res.text() };
    };
    const login = await answer(await visit(SHOP1, "/login"));
    eq([login.status, login.body], [404, UNKNOWN_PAGE_HTML], "GET /login on a store host: the app's neutral 404");
    check(login.headers.some(([k]) => k === "strict-transport-security") && login.headers.some(([k]) => k === "content-security-policy"), "the neutral 404 carries its full header set (CSP, HSTS)");
    for (const path of ["/admin", "/%61dmin/x", "/app/shop1", "/api/cron/tick", "/kit/t"]) {
      eq(await answer(await visit(SHOP1, path)), login, `GET ${path} on a store host = GET /login: status, headers and bytes`);
    }
    // P1-7 (PLA-§24.2 rev 4): store hosts answer the neutral 404 for /report/* (never a 308 to the platform host)
    await routeCase("GET https://<h>.<root>/report/<h> (P1-7)", "src/app/(public)/report/[handle]/page.tsx", async () => {
      for (const path of ["/report/shop1", "/report/shop1?p=%2Fpromo", "/report/shop2", "/REPORT/shop1"]) {
        eq(await answer(await visit(SHOP1, path)), login, `GET ${path} on a store host = GET /login: the neutral 404, status, headers and bytes`);
      }
    });
    const postLogin = await answer(await visit(SHOP1, "/login", { method: "POST", body: "x" }));
    eq([postLogin.status, postLogin.body], [404, ""], "POST /login on a store host: the empty neutral 404");
    const refusedPosts: [string, string, Visit][] = [
      ["POST /api/admin/media", "/api/admin/media", { method: "POST", body: "x" }],
      ["a Next-Action POST", "/x", { method: "POST", headers: { "next-action": "abc" }, body: "[]" }],
      ["PUT", "/x", { method: "PUT", body: "x" }],
    ];
    for (const [label, path, o] of refusedPosts) {
      eq(await answer(await visit(SHOP1, path, o)), postLogin, `${label} on a store host = POST /login: status, headers and bytes`);
    }
  }
  // the proxy's store-host refusals, with the Worker's own list bypassed (a stale Worker, a forged direct set)
  {
    const direct = async (path: string, method = "GET", extra: Record<string, string> = {}) => {
      const headers = { "x-sg-host": SHOP1, "x-sg-edge": EDGE_KEY, "x-sg-ip": "198.51.100.1", "x-sg-proto": "https", "x-sg-worker": "w-old", "x-sg-ts": String(Date.now()), ...extra };
      return app(`https://${PLATFORM}${path}`, { method, headers: new Headers(headers), body: method === "GET" ? null : "x" });
    };
    for (const path of ["/admin", "/app/shop1", "/api/app/shop1/pulse", "/login", "/signup", "/invite/abc", "/reset/abc", "/report/shop1", "/kit/t", "/preview/t", "/d/shop1.storegen.example", "/api/cron/tick", "/api/v1/x"]) {
      const res = await direct(path);
      eq(res.status, 404, `store host ${path} → the neutral 404 at the proxy`);
    }
    eq((await direct("/x", "POST", { "next-action": "a1" })).status, 404, "store host Next-Action POST → 404 at the proxy");
    eq((await direct("/x", "PUT")).status, 404, "store host PUT → 404 at the proxy");
  }
  // labels the app refuses whatever the Worker forwards
  for (const host of [`admin.${ROOT}`, `app.${ROOT}`, `a.b.${ROOT}`, "x.example.org"]) {
    const res = await visit(host, "/");
    eq(res.status, 404, `${host} through the Worker → the neutral 404`);
  }
  // SEC-4: a Worker whose secret differs from EDGE_KEY → the neutral 404, counted
  {
    resetProxyLog();
    const res = await visit(SHOP1, "/", { env: { ...WORKER_ENV, EDGE_KEY: "edgeSimKeyWrong-1Ab2Cd3Ef4Gh5Ij6Kl7Mn8Op9Qr0St" } });
    eq([res.status, await res.text()], [404, UNKNOWN_PAGE_HTML], "a wrong Worker secret → the neutral 404 (never the platform)");
    eq(edgeTally().badKey.bad_key, 1, "the bad key is counted (edge_bad_key)");
  }
  // EDGE_KEY rotation: app (new + prev) while the Worker still has the old secret, then the end of the grace
  {
    resetProxyLog();
    env.EDGE_KEY = EDGE_KEY;
    env.EDGE_KEY_PREV = EDGE_KEY_OLD;
    const oldSecret = { ...WORKER_ENV, EDGE_KEY: EDGE_KEY_OLD };
    eq((await visit(SHOP1, "/", { env: oldSecret })).status, 200, "rotation step 1: the Worker's old secret is still accepted (EDGE_KEY_PREV)");
    check(edgeTally().prevKeyAt !== null, "a request on the previous key is recorded (prev_key)");
    eq((await visit(SHOP1, "/")).status, 200, "rotation step 2: the new Worker secret is accepted");
    delete env.EDGE_KEY_PREV;
    eq((await visit(SHOP1, "/", { env: oldSecret })).status, 404, "rotation step 3: once EDGE_KEY_PREV is gone the old secret is refused");
  }
  // SEC-4: a captured header set replayed straight to the origin after 5 minutes
  {
    await visit(SHOP1, "/promo");
    const captured = lastSub()!;
    const fresh = await app(captured.url, { ...captured.init, headers: new Headers(captured.init.headers), body: null });
    eq(fresh.status, 200, "the captured set verifies within the window");
    const realNow = Date.now;
    Date.now = () => realNow() + 6 * 60_000;
    try {
      const replay = await app(captured.url, { ...captured.init, headers: new Headers(captured.init.headers), body: null });
      eq(replay.status, 404, "the same set 6 minutes later → the neutral 404");
    } finally {
      Date.now = realNow;
    }
  }

  /* ============================================================== 3. the cache (ENGC-2) */
  section("Cloudflare cache keyed by the subrequest URL");
  const sameUrl = async (mode: CacheMode) => {
    origin = cfCache(mode, app);
    const a = await (await visit(SHOP1, "/promo")).text();
    const b = await (await visit(SHOP2, "/promo")).text();
    const b2 = await (await visit(SHOP2, "/promo")).text();
    // the browser-facing request on the apex has the same cache key as every Worker subrequest of the path
    const apex = await (await origin(`https://${PLATFORM}/promo`, { method: "GET", headers: new Headers(), body: null })).text();
    return { a, b, b2, apex };
  };
  {
    const r = await sameUrl({ honourCf: true, honourCdn: true });
    check(r.a.includes("store shop1") && r.b.includes("store shop2") && r.b2.includes("store shop2"), "with the cf option: each store host gets its own body");
    check(r.apex.startsWith("platform page"), `with the cf option: the apex request answers the platform page (${r.apex.slice(0, 40)})`);
  }
  {
    const r = await sameUrl({ honourCf: false, honourCdn: true });
    check(r.a.includes("store shop1") && r.b.includes("store shop2") && r.b2.includes("store shop2"), "a zone rule that ignores cf: CDN-Cache-Control: no-store still keeps stores apart");
    check(r.apex.startsWith("platform page"), "a zone rule that ignores cf: the apex request answers the platform page");
    origin = cfCache({ honourCf: false, honourCdn: true }, app);
    await visit(SHOP1, "/moved");
    const otherStore = await visit(SHOP2, "/moved");
    eq(otherStore.headers.get("location"), "/s/shop2/new-slug", "a store's 308 is never served to another store host");
  }
  {
    const r = await sameUrl({ honourCf: false, honourCdn: false });
    check(r.b.includes("store shop1") || r.apex.includes("store shop1"), "negative control (no cf option, no CDN-Cache-Control): the model does leak, so the checks above mean something");
  }
  {
    // the former option, replayed on the Worker's own subrequests: cacheTtl overrides cacheEverything:false and no-store
    const cache = cfCache({ honourCf: true, honourCdn: true }, app);
    origin = app;
    const legacy = async (host: string) => {
      await visit(host, "/promo");
      const sub = lastSub()!;
      const res = await cache(sub.url, { ...sub.init, headers: new Headers(sub.init.headers), cf: { cacheTtl: 0, cacheEverything: false } });
      return { body: await res.text(), status: res.headers.get("cf-cache-status") };
    };
    await legacy(SHOP1);
    const b = await legacy(SHOP2);
    check(b.body.includes("store shop1") && b.status === "UPDATING", `negative control: cf { cacheTtl: 0 } serves store shop1's page to shop2 (${b.status})`);
  }
  origin = app;

  /* ============================================================== 4. platform cookies, matcher-excluded paths */
  section("Platform cookies (__Host- only), SEC-3 outside the matcher");
  {
    const direct = (path: string) => app(`https://${PLATFORM}${path}`, { method: "GET", headers: new Headers(), body: null });
    const cookies = [...(await direct("/login")).headers.getSetCookie(), ...(await direct(`/${env.ADMIN_GATE}`)).headers.getSetCookie()];
    check(cookies.length >= 2, `the platform host sets its device and gate cookies (${cookies.length})`);
    for (const c of cookies) {
      const name = c.split("=")[0] ?? "";
      check(name.startsWith("__Host-") && /;\s*secure/i.test(c) && /;\s*path=\/(;|$)/i.test(c) && !/;\s*domain=/i.test(c), `platform cookie ${name}: __Host-, Secure, Path=/, no Domain`);
    }
    // /api/app/<h>/media never passes the proxy: a client-sent signed-path triple must not verify there
    const forged = new Headers({ host: PLATFORM, "x-sg-path": "/app/victim/media", "x-sg-rid": "01JAAAAAAAAAAAAAAAAAAAAAAA", "x-sg-path-sig": "AAAA" });
    eq(verifiedRequestPath(forged), null, "a client x-sg-path on a matcher-excluded path never verifies");
    eq(effectiveHost(new Headers({ host: PLATFORM, "x-sg-host": SHOP1 })).cls, "platform", "x-sg-host without x-sg-edge is ignored");
  }
  console.warn = warn;

  if (ONLINE_BASE) await online(worker);
  else console.log("online part: not run (pass --base http://127.0.0.1:3451 against a production build, §J.3)");

  const pendingNote = !pendingCases.length ? (STRICT ? "; --strict: nothing pending" : "") : STRICT ? `; ${pendingCases.length} pending case(s) counted as failures (--strict)` : `; ${pendingCases.length} case(s) pending, listed above (--strict fails them)`;
  console.log(failures ? `qa:edge-sim: ${failures} of ${checks} checks FAILED${pendingNote}` : `qa:edge-sim: all ${checks} checks passed${pendingNote}`);
  process.exit(failures ? 1 : 0);
}

/* ================================================================== online */

interface Answer {
  status: number;
  headers: Record<string, string>;
  cookies: string[];
  body: string;
}

/** One HTTP request to the server under test, with an explicit Host (node:http, so Host is ours to set). */
function send(base: URL, path: string, method: string, headers: Headers, body: string | null): Promise<Answer> {
  return new Promise((resolve, reject) => {
    const lib = base.protocol === "https:" ? https : http;
    const out: Record<string, string> = {};
    headers.forEach((v, k) => (out[k] = v));
    const req = lib.request({ host: base.hostname, port: base.port, path, method, headers: out, rejectUnauthorized: false }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => {
        const flat: Record<string, string> = {};
        for (const [k, v] of Object.entries(res.headers)) if (k !== "set-cookie" && v !== undefined) flat[k] = Array.isArray(v) ? v.join(", ") : v;
        resolve({ status: res.statusCode ?? 0, headers: flat, cookies: res.headers["set-cookie"] ?? [], body: Buffer.concat(chunks).toString("utf8") });
      });
    });
    req.on("error", reject);
    req.setTimeout(20_000, () => req.destroy(new Error("timeout")));
    if (body !== null) req.write(body);
    req.end();
  });
}

async function online(worker: Worker): Promise<void> {
  section(`online: ${ONLINE_BASE}`);
  const base = new URL(ONLINE_BASE!);
  const platformUrl = ONLINE_ENV.PLATFORM_URL;
  const root = ONLINE_ENV.STORE_ROOT_DOMAIN?.trim().toLowerCase();
  const key = ONLINE_ENV.EDGE_KEY?.trim();
  const a = arg("store");
  const b = arg("store-b");
  if (!platformUrl || !root || !key || !a || !b) {
    check(false, "online: PLATFORM_URL, STORE_ROOT_DOMAIN and EDGE_KEY (the server's) in the environment, --store and --store-b are required");
    return;
  }
  const apex = new URL(platformUrl).host;
  const bindings = { EDGE_KEY: key, ORIGIN: new URL(platformUrl).origin, STORE_ROOT: root, WORKER_VERSION: "w-edge-sim" };
  const health = await send(base, "/api/health", "GET", new Headers({ host: apex }), null).catch((e: unknown) => ({ status: 0, body: String(e) }) as Answer);
  if (health.status !== 200 || !/"app"\s*:\s*"store-gen"/.test(health.body)) {
    check(false, `online: ${base.origin}/api/health is not Store Gen (status ${health.status}); refusing to test another app (QA-01)`);
    return;
  }
  // the Worker's subrequests go to the server under test, with the apex as Host
  origin = async (url, init) => {
    const u = new URL(url);
    const headers = new Headers(init.headers);
    headers.set("host", apex);
    const body = init.body === null ? null : await new Response(init.body).text();
    const r = await send(base, `${u.pathname}${u.search}`, init.method, headers, body);
    const out = new Headers(r.headers);
    for (const c of r.cookies) out.append("set-cookie", c);
    return new Response(init.method === "HEAD" || [204, 304].includes(r.status) ? null : r.body, { status: r.status, headers: out });
  };
  const viaEdge = async (host: string, path: string, method = "GET", headers: Record<string, string> = {}, body?: string) => {
    const res = await worker.fetch(new Request(`https://${host}${path}`, { method, headers: { "cf-connecting-ip": "198.51.100.77", ...headers }, body }), bindings);
    return { status: res.status, headers: res.headers, body: await res.text() };
  };
  /** an edge-shaped request straight to the app (the Worker's own refusals bypassed), keeping Set-Cookie visible */
  const edgeDirect = (host: string, path: string, method = "GET", extra: Record<string, string> = {}, edgeKey = key) =>
    send(base, path, method, new Headers({ host: apex, "x-sg-host": host, "x-sg-edge": edgeKey, "x-sg-ip": "198.51.100.77", "x-sg-proto": "https", "x-sg-worker": "w-edge-sim", "x-sg-ts": String(Date.now()), ...extra }), method === "GET" || method === "HEAD" ? null : "{}");
  const hostA = `${a}.${root}`;
  const hostB = `${b}.${root}`;

  const homeA = await viaEdge(hostA, "/");
  const homeB = await viaEdge(hostB, "/");
  eq(homeA.status, 200, "online: GET https://<A>.<root>/ → 200 (ENGC-15)");
  check(homeA.body !== homeB.body, "online: two store hosts get different home documents");
  eq(homeA.headers.get("cdn-cache-control"), "no-store", "online: edge-served document carries CDN-Cache-Control: no-store");
  const csp = homeA.headers.get("content-security-policy") ?? "";
  check(csp.includes(`https://${hostA}/api/public/`) && !csp.includes(hostB), "online: the document CSP names A's host only");
  check(!/(connect-src|form-action)[^;]*'self'/.test(csp), "online: no bare 'self' in connect-src / form-action");
  const apexHome = await send(base, "/", "GET", new Headers({ host: apex }), null);
  check(apexHome.status === 200 && apexHome.body !== homeA.body, "online: the apex / answers the platform page, not a store's");

  for (const path of ["/does-not-exist-edge-sim", ...(arg("slug") ? [`/${arg("slug")}`] : [])]) {
    const plain = await viaEdge(hostA, path);
    const slash = await viaEdge(hostA, `${path}/`);
    const final = slash.status === 308 ? await viaEdge(hostA, new URL(slash.headers.get("location")!, `https://${hostA}`).pathname) : slash;
    eq([final.status, final.body === plain.body], [plain.status, true], `online: ${path}/ answers what ${path} answers`);
  }
  const own = await viaEdge(hostA, `/s/${a}/x?fbclid=1&utm_source=fb`);
  eq([own.status, own.headers.get("location")], [308, `https://${hostA}/x?fbclid=1&utm_source=fb`], "online: own-handle 308 with the raw query");
  for (const path of ["/admin", `/app/${a}`, "/login", "/signup", "/kit/t"]) eq((await edgeDirect(hostA, path)).status, 404, `online: store host ${path} → 404 at the app`);
  // P1-7 (PLA-§24.2 rev 4): GET https://<h>.<root>/report/<h> → the neutral 404, through the Worker and at the app
  await routeCase("online: GET https://<A>.<root>/report/<A> (P1-7)", "src/app/(public)/report/[handle]/page.tsx", async () => {
    const login = await viaEdge(hostA, "/login");
    for (const path of [`/report/${a}`, `/report/${a}?p=%2F`]) {
      const r = await viaEdge(hostA, path);
      eq(
        [r.status, r.body === login.body, r.headers.get("content-security-policy") === login.headers.get("content-security-policy"), r.headers.get("cache-control"), r.headers.get("location")],
        [404, true, true, login.headers.get("cache-control"), null],
        `online: ${path} on a store host = /login's neutral 404 (no 308)`,
      );
    }
    eq((await edgeDirect(hostA, `/report/${a}`)).status, 404, "online: store host /report/<h> → 404 at the app");
  });
  eq((await edgeDirect(hostA, "/x", "POST", { "next-action": "a1", origin: `https://${hostA}` })).status, 404, "online: store host Next-Action → 404 at the app");
  const neutralStore = await edgeDirect(hostA, "/admin");
  const wrong = await edgeDirect(hostA, "/", "GET", {}, "edgeSimWrongKey-1Ab2Cd3Ef4Gh5Ij6Kl7Mn8Op9Qr0St");
  eq([wrong.status, wrong.body === neutralStore.body], [404, true], "online: a wrong x-sg-edge → the neutral 404 (SEC-4)");
  for (const path of ["/", "/does-not-exist-edge-sim", `/s/${a}/x`]) {
    eq((await edgeDirect(hostA, path)).cookies, [], `online: no Set-Cookie from the app on a store host (${path})`);
  }
  for (const path of ["/", "/login", "/signup"]) {
    const res = await send(base, path, "GET", new Headers({ host: apex }), null);
    for (const c of res.cookies) check(c.startsWith("__Host-"), `online: platform ${path} cookie ${c.split("=")[0]} has the __Host- prefix (SEC-13)`);
  }
  const forgedPath = await send(base, `/api/app/${a}/media`, "POST", new Headers({ host: apex, "x-sg-path": `/app/${a}/media`, "x-sg-rid": "01JAAAAAAAAAAAAAAAAAAAAAAA", "x-sg-path-sig": "AAAA", "content-type": "application/octet-stream" }), "x");
  check(forgedPath.status === 404 || forgedPath.status === 403 || forgedPath.status === 401, `online: a client x-sg-path on the upload route picks no store (status ${forgedPath.status})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
