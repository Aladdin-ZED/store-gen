/**
 * qa:headers (docs/STORE-SAAS.md §J.3, §F.6, §C.3 step 4, §C.9): the response header sets per response class and
 * host class. Two parts:
 *
 *   npm run qa:headers
 *     OFFLINE (no server, no database): every producer called in memory with production settings, in P mode and
 *     in S mode.
 *       1. The neutral 404 / 410 / 503 / action 403 (ENGC-22): the proxy's answers on every host class (un-gated
 *          console, /d, store-host refusals, legacy refusals, a wrong edge key, a foreign host) and the route
 *          producers (unknownPageResponse, notFoundResponse, goneResponse, unavailableResponse) carry one header
 *          set per host class, byte for byte; its §F.6 content (nosniff, DENY, no-referrer, COOP / CORP, the hash
 *          CSP, HSTS); GET has the page, every other method an empty body.
 *       2. Platform UI through the proxy: the nonce CSP (fresh per request), `same-origin` on console, app,
 *          login, signup, invite, reset and report, `no-referrer` only on /kit/* (ENGC-16), `private, no-store`
 *          + noindex, marketing indexable with `public, max-age=0, s-maxage=300`, the dashboard manifest without
 *          nonce headers or a cookie (ENGC-24).
 *       3. HSTS (SEC-15): `includeSubDomains` only on the platform host in S mode; not in P mode, on legacy
 *          hosts, on store hosts or in a neutral answer of those classes.
 *       4. Redirects: the proxy's (303 gate, 307 / 308 host moves, the own-handle 308) carry the base headers +
 *          `private, no-store`; a canonical store 308 `public, max-age=300` (+ `CDN-Cache-Control: no-store`
 *          through the edge, ENGC-2).
 *       5. Store documents (documentResponse) for every kind (landing, legal, thank-you, test, preview) on the
 *          platform host (P mode) and a store host (S mode, through the Worker): cache policy, noindex,
 *          referrer, COOP `same-origin-allow-popups`, CORP, `CDN-Cache-Control: no-store` only via the edge,
 *          and no bare 'self' or bare app origin in connect-src / form-action (SEC-2).
 *       6. Public JSON APIs (apiHeaders): base headers, `no-store`, noindex.
 *       7. The R1 routes (P0b: P1-7, P2-14, P3-7, P8-12), at the proxy: the console's JSON, CSV, media and download
 *          routes behind the gate (`private, no-store`, noindex, `same-origin`; the media route keeps the handler's
 *          sandbox CSP and `private, no-store`, with the proxy's CORP `same-origin`, frame DENY and noindex), the dashboard's pulse, search and export download passed with the session and nothing that
 *          would override the handler's ETag / Cache-Control / Content-Disposition, `/track` and `/go/<code>`
 *          reaching their store routes cookie-less (rewritten with the raw query on a store host).
 *
 *   npm run qa:headers -- --base http://127.0.0.1:3451 --store <handle> --slug <live slug> [--go <code>] [--go-paused <code>]
 *                         [--media <key>] [--store-id <id of --store>] [--backup-day <YYYY-MM-DD>] [--strict]
 *     ONLINE (§J.3: a production build on port 3451+ against a cod_test_* database), run with the server's
 *     PLATFORM_URL (and, for the store-host cases, STORE_ROOT_DOMAIN and EDGE_KEY; never printed) in this
 *     process's environment: the same classes over HTTP, incl. the fallback rewrite, the route 404s, /api/health,
 *     the media route and, when given, the `/go/<code>` 308 (`private, no-store`) and its 410 page. The offline part
 *     runs first; without --base the online part is reported as not run. The R1 route cases that need a session or a
 *     bearer value read it from the environment, never printed: QA_HEADERS_MEMBER_COOKIE (the Cookie header of an
 *     owner of --store), QA_HEADERS_OUTSIDER_COOKIE (a signed-in user who is not a member), QA_HEADERS_STAFF_COOKIE
 *     (a gated super_admin console session with a fresh step-up), QA_HEADERS_TEST_TOKEN (a ?sg-test token of --store),
 *     QA_HEADERS_KIT_TOKEN (a live kit share token), QA_HEADERS_EXPORT_PATH, QA_HEADERS_EXPORT_EXPIRED_PATH,
 *     QA_HEADERS_EXPORT_FOREIGN_PATH (signed `/api/app/<h>/exports/<jobId>/<part>?t=…` paths: valid, expired, another
 *     store's job under --store's handle) and QA_HEADERS_CONSOLE_EXPORT_PATH (a signed console export part).
 *
 * PENDING RULE (P0b): every R1 route case names the route module it needs (its file under src/app/**). While that
 * file does not exist the case is listed as `pending (route not built: <file>)` and counted neither as a pass nor as
 * a failure; an online case whose route exists but whose input the run did not get is listed as `pending (needs …)`.
 * `--strict` (the R1 integration) turns every pending case into a failure.
 */
import { existsSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import Module from "node:module";
import { join } from "node:path";
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
const ONLINE_ENV = { PLATFORM_URL: env.PLATFORM_URL ?? env.PUBLIC_URL, STORE_ROOT_DOMAIN: env.STORE_ROOT_DOMAIN, EDGE_KEY: env.EDGE_KEY };
/** the online inputs that carry a session or a bearer value (see the header): read once, never printed */
const SECRET_INPUTS = {
  member: env.QA_HEADERS_MEMBER_COOKIE,
  outsider: env.QA_HEADERS_OUTSIDER_COOKIE,
  staff: env.QA_HEADERS_STAFF_COOKIE,
  testToken: env.QA_HEADERS_TEST_TOKEN,
  kitToken: env.QA_HEADERS_KIT_TOKEN,
  exportPath: env.QA_HEADERS_EXPORT_PATH,
  exportExpired: env.QA_HEADERS_EXPORT_EXPIRED_PATH,
  exportForeign: env.QA_HEADERS_EXPORT_FOREIGN_PATH,
  consoleExport: env.QA_HEADERS_CONSOLE_EXPORT_PATH,
};
const STRICT = ARGS.includes("--strict");
const REPO = join(__dirname, "..", "..");

const PLATFORM = "storegen.example";
const ROOT = PLATFORM;
const STORE = `shop1.${ROOT}`;
const LEGACY = "legacy-host.example.net";
const GATE = "gate-headers-q7m2x9k4";
const EDGE_KEY = "headersCheckEdgeKey-5Jr8Wq2Lm6Xv1Nc9Tb3Zk7Hp4Df0";
const HSTS = "max-age=63072000";
const HSTS_SUB = "max-age=63072000; includeSubDomains";
/** the media routes' CSP (core §F.6 "Media": today's sandbox CSP) */
const MEDIA_SANDBOX_CSP = "default-src 'none'; sandbox";

// IS_PROD is read once at import
env.NODE_ENV = "production";
env.APP_SECRET = "headersCheckAppSecret-3Vb8Nq1Zx6Lm9Kc4Rt7Wp2Hd5Jf0";
env.ADMIN_GATE = GATE;
env.PLATFORM_URL = `https://${PLATFORM}`;
env.LEGACY_PLATFORM_HOSTS = LEGACY;
env.ADMIN_IP_ALLOWLIST = "";
for (const name of ["PUBLIC_URL", "ADMIN_HOST", "STORE_ROOT_DOMAIN", "EDGE_KEY", "EDGE_KEY_PREV", "BEHIND_CLOUDFLARE", "TRUSTED_PROXY_HOPS"]) delete env[name];

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

/* ------------------------------------------------------------------ the P0b pending rule */

const pendingCases: string[] = [];
/**
 * Runs an R1 route case once `route` (a file under src/app/**) exists and every input in `missing` is given;
 * otherwise lists it as pending (counted neither as a pass nor as a failure), or fails it under --strict.
 */
async function routeCase(label: string, route: string, fn: () => unknown | Promise<unknown>, missing: readonly string[] = []): Promise<void> {
  const reason = !existsSync(join(REPO, route)) ? `route not built: ${route}` : missing.length ? `needs ${missing.join(", ")}` : null;
  if (reason === null) {
    await fn();
    return;
  }
  pendingCases.push(`${label}: pending (${reason})`);
  if (STRICT) check(false, `${label}: pending (${reason}) under --strict`);
  else console.log(`  … ${label}: pending (${reason})`);
}
/** the names of the inputs a case lacks (the values are never printed) */
const lacking = (inputs: Record<string, string | null | undefined>): string[] =>
  Object.entries(inputs)
    .filter(([, v]) => !v)
    .map(([name]) => name);

/** S mode on (STORE_ROOT_DOMAIN + EDGE_KEY) for the duration of `fn`. */
async function inSMode<T>(fn: () => Promise<T> | T): Promise<T> {
  env.STORE_ROOT_DOMAIN = ROOT;
  env.EDGE_KEY = EDGE_KEY;
  try {
    return await fn();
  } finally {
    delete env.STORE_ROOT_DOMAIN;
    delete env.EDGE_KEY;
  }
}

/** Headers a client sees, lower-case names, without the proxy's x-middleware-* plumbing and the per-response Date. */
function visible(h: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  h.forEach((value, name) => {
    if (!name.startsWith("x-middleware-") && name !== "date" && name !== "set-cookie") out[name] = value;
  });
  return out;
}
const sorted = (h: Record<string, string>) => JSON.stringify(Object.entries(h).sort(([a], [b]) => a.localeCompare(b)));

/** The values of one CSP directive. */
function directive(csp: string, name: string): string[] {
  const part = csp.split(";").map((d) => d.trim()).find((d) => d.split(/\s+/)[0] === name);
  return part ? part.split(/\s+/).slice(1) : [];
}

/** SEC-2: connect-src and form-action name `<origin>/api/public/` (or pixel hosts), never 'self' or a bare app origin. */
function assertNarrowed(csp: string, origins: readonly string[], label: string): void {
  for (const name of ["connect-src", "form-action"]) {
    const values = directive(csp, name);
    check(!values.includes("'self'"), `${label}: ${name} has no bare 'self' (${values.join(" ")})`);
    for (const o of origins) {
      check(!values.includes(o) && !values.includes(`${o}/`), `${label}: ${name} has no bare ${o}`);
    }
    check(values.some((v) => v.endsWith("/api/public/")), `${label}: ${name} names a public API path`);
  }
}

async function main(): Promise<void> {
  const { NextRequest } = await import("next/server");
  const { proxy } = await import("@/proxy");
  const { UNKNOWN_PAGE_CSP, UNKNOWN_PAGE_HTML, GONE_PAGE_HTML, unknownPageHeaders, unknownPageResponse, gonePageResponse, unavailablePageResponse } = await import("@/lib/auth/unknown-page");
  const { documentResponse, notFoundResponse, goneResponse, unavailableResponse, permanentRedirect, DOCUMENT_COOP } = await import("@/lib/render/serve.server");
  const { buildLandingCsp } = await import("@/lib/render/csp");
  const { issueGateToken } = await import("@/lib/auth/gate");
  const { GATE_COOKIE } = await import("@/lib/auth/config");
  const { apiHeaders } = await import("@/lib/orders/http");

  const warn = console.warn;
  console.warn = () => undefined; // the proxy's foreign-host / bad_key lines

  interface Req {
    method?: string;
    host?: string;
    headers?: Record<string, string>;
    cookie?: string;
    /** a Worker subrequest for this store host (Host = the apex, the store host in x-sg-host) */
    edge?: string;
    edgeKey?: string;
  }
  const request = (path: string, o: Req = {}): NextRequestType => {
    const host = o.edge ? PLATFORM : (o.host ?? PLATFORM);
    const headers = new Headers({ host, ...o.headers });
    if (o.edge) {
      headers.set("x-sg-host", o.edge);
      headers.set("x-sg-edge", o.edgeKey ?? EDGE_KEY);
      headers.set("x-sg-ip", "198.51.100.4");
      headers.set("x-sg-proto", "https");
      headers.set("x-sg-worker", "w-headers");
      headers.set("x-sg-ts", String(Date.now()));
    }
    if (o.cookie) headers.set("cookie", o.cookie);
    const method = o.method ?? "GET";
    return new NextRequest(`https://${host}${path}`, { method, headers, body: method === "GET" || method === "HEAD" ? undefined : "x" });
  };
  const run = (path: string, o: Req = {}): NextResponseType => proxy(request(path, o));
  const plainReq = (path: string, o: Req = {}): Request => {
    const r = request(path, o);
    return new Request(r.url, { method: r.method, headers: r.headers });
  };

  /* ============================================================== 1. the neutral set */
  section("neutral 404 / 410 / 503 / 403: one header set per host class (ENGC-22)");
  const neutralCases = async (mode: "P" | "S") => {
    const label = (s: string) => `[${mode}] ${s}`;
    const producers: [string, Response, string, "platform" | "store" | "legacy" | "invalid" | "foreign"][] = [];
    const add = (name: string, res: Response, method: string, cls: "platform" | "store" | "legacy" | "invalid" | "foreign") => producers.push([name, res, method, cls]);
    add("proxy: un-gated /admin", run("/admin"), "GET", "platform");
    add("proxy: un-gated HEAD /api/admin/x", run("/api/admin/x", { method: "HEAD" }), "HEAD", "platform");
    add("proxy: /d/x", run("/d/x"), "GET", "platform");
    add("proxy: foreign host", run("/", { host: "elsewhere.example.org" }), "GET", "foreign");
    add("proxy: legacy /preview/t", run("/preview/t", { host: LEGACY }), "GET", "legacy");
    add("proxy: legacy POST /x", run("/x", { host: LEGACY, method: "POST" }), "POST", "legacy");
    add("route: unknownPageResponse (platform)", unknownPageResponse("GET", request("/x").headers), "GET", "platform");
    add("route: notFoundResponse POST (platform)", notFoundResponse(plainReq("/x", { method: "POST" })), "POST", "platform");
    add("route: notFoundResponse (legacy)", notFoundResponse(plainReq("/s/x/y", { host: LEGACY })), "GET", "legacy");
    if (mode === "S") {
      add("proxy: store host /admin", run("/admin", { edge: STORE }), "GET", "store");
      add("proxy: store host Next-Action", run("/x", { edge: STORE, method: "POST", headers: { "next-action": "a" } }), "POST", "store");
      add("proxy: store host /s/other/x", run("/s/other/x", { edge: STORE }), "GET", "store");
      add("proxy: reserved label", run("/", { edge: `admin.${ROOT}` }), "GET", "invalid");
      add("proxy: wrong edge key", run("/", { edge: STORE, edgeKey: "headersWrongEdgeKey-1Qa2Ws3Ed4Rf5Tg6Yh7Uj8Ik9Ol0" }), "GET", "invalid");
      add("route: notFoundResponse (store host)", notFoundResponse(plainReq("/s/shop1/nope", { edge: STORE })), "GET", "store");
      add("route: unknownPageResponse (store host)", unknownPageResponse("GET", request("/x", { edge: STORE }).headers), "GET", "store");
    }
    for (const [name, res, method, cls] of producers) {
      const want = unknownPageHeaders(cls);
      check(res.status === 404, label(`${name}: status ${res.status}`));
      eq(sorted(visible(res.headers)), sorted(Object.fromEntries(Object.entries(want).map(([k, v]) => [k.toLowerCase(), v]))), label(`${name}: the neutral header set of class ${cls}`));
      eq(await res.text(), method === "GET" ? UNKNOWN_PAGE_HTML : "", label(`${name}: body`));
    }
    // the set across producers of one class is one set
    const byClass = new Map<string, Set<string>>();
    for (const [, res, , cls] of producers) {
      const set = byClass.get(cls) ?? new Set<string>();
      set.add(sorted(visible(res.headers)));
      byClass.set(cls, set);
    }
    for (const [cls, sets] of byClass) eq(sets.size, 1, label(`one 404 header set on class ${cls}`));

    // 410, 503, action 403: the same set (+ Retry-After for 503)
    const gone = goneResponse(plainReq("/s/old/x"));
    eq([gone.status, sorted(visible(gone.headers)), await gone.text()], [410, sorted(visible(unknownPageResponse("GET", request("/x").headers).headers)), GONE_PAGE_HTML], label("410: the neutral set"));
    const goneHead = gonePageResponse("HEAD", request("/x").headers);
    eq(await goneHead.text(), "", label("410 HEAD: empty body"));
    const down = unavailableResponse(plainReq("/s/x/y"), 86_400);
    const downHeaders = visible(down.headers);
    eq(downHeaders["retry-after"], "86400", label("503: Retry-After"));
    delete downHeaders["retry-after"];
    eq(sorted(downHeaders), sorted(visible(unknownPageResponse("GET", request("/x").headers).headers)), label("503: the neutral set + Retry-After"));
    eq(unavailablePageResponse("GET", request("/x").headers).headers.get("retry-after"), "30", label("503 default Retry-After"));
    const action = run("/x", { method: "POST", headers: { "next-action": "abc", origin: "null" } });
    eq([action.status, sorted(visible(action.headers)), await action.text()], [403, sorted(visible(unknownPageResponse("GET", request("/x").headers).headers)), ""], label("Origin: null action → 403 with the neutral set, empty"));

    // §F.6 content of the set
    const h = unknownPageHeaders("platform");
    eq(
      [h["X-Content-Type-Options"], h["X-Frame-Options"], h["Referrer-Policy"], h["Cross-Origin-Opener-Policy"], h["Cross-Origin-Resource-Policy"], h["Content-Security-Policy"]],
      ["nosniff", "DENY", "no-referrer", "same-origin", "same-origin", UNKNOWN_PAGE_CSP],
      label("the neutral set's §F.6 content"),
    );
    check(/^default-src 'none'; style-src 'sha256-[A-Za-z0-9+/=]{44}'; img-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'$/.test(UNKNOWN_PAGE_CSP), label(`the neutral CSP (${UNKNOWN_PAGE_CSP})`));
    check(/no-store/.test(h["Cache-Control"] ?? "") && /no-transform/.test(h["Cache-Control"] ?? ""), label("the neutral set is never stored nor re-encoded"));
    eq(unknownPageHeaders("platform")["Strict-Transport-Security"], mode === "S" ? HSTS_SUB : HSTS, label("neutral HSTS on the platform host"));
    for (const cls of ["store", "legacy", "invalid", "foreign"] as const) eq(unknownPageHeaders(cls)["Strict-Transport-Security"], HSTS, label(`neutral HSTS on class ${cls}`));
  };
  await neutralCases("P");
  await inSMode(() => neutralCases("S"));

  /* ============================================================== 2. platform UI */
  section("platform UI through the proxy (§F.6 platform UI row)");
  const uiCases = async (mode: "P" | "S") => {
    const label = (s: string) => `[${mode}] ${s}`;
    const hsts = mode === "S" ? HSTS_SUB : HSTS;
    const nonces = new Set<string>();
    const ui = (path: string, o: Req = {}) => {
      const res = run(path, o);
      const csp = res.headers.get("content-security-policy") ?? "";
      const nonce = /'nonce-([A-Za-z0-9+/=]+)'/.exec(csp)?.[1];
      check(res.headers.get("x-middleware-next") === "1", label(`${path}: passed to the page`));
      check(!!nonce, label(`${path}: nonce CSP`));
      if (nonce) {
        check(!nonces.has(nonce), label(`${path}: a fresh nonce`));
        nonces.add(nonce);
      }
      for (const d of ["'strict-dynamic'", "frame-ancestors 'none'", "object-src 'none'", "base-uri 'none'", "upgrade-insecure-requests"]) check(csp.includes(d), label(`${path}: CSP has ${d}`));
      eq([res.headers.get("x-content-type-options"), res.headers.get("x-frame-options"), res.headers.get("cross-origin-opener-policy"), res.headers.get("cross-origin-resource-policy")], ["nosniff", "DENY", "same-origin", "same-origin"], label(`${path}: base headers`));
      eq(res.headers.get("strict-transport-security"), hsts, label(`${path}: HSTS`));
      return res;
    };
    for (const path of ["/login", "/signup", "/invite/abc", "/invite/staff/abc", "/reset/abc", "/report/shop1", "/app/shop1", "/app/shop1/orders"]) {
      const res = ui(path);
      eq([res.headers.get("referrer-policy"), res.headers.get("cache-control"), res.headers.get("x-robots-tag")], ["same-origin", "private, no-store", "noindex, nofollow, noarchive"], label(`${path}: same-origin, private, noindex`));
    }
    const kit = ui("/kit/token123");
    eq([kit.headers.get("referrer-policy"), kit.headers.get("cache-control"), kit.headers.get("x-robots-tag")], ["no-referrer", "private, no-store", "noindex, nofollow, noarchive"], label("/kit/*: no-referrer (ENGC-16)"));
    for (const path of ["/", "/features", "/terms", "/privacy", "/aup"]) {
      const res = ui(path);
      eq([res.headers.get("cache-control"), res.headers.get("x-robots-tag"), res.headers.get("referrer-policy")], ["public, max-age=0, s-maxage=300", null, "same-origin"], label(`${path}: marketing, indexable`));
    }
    const gated = ui("/admin/pages", { cookie: `${GATE_COOKIE}=${issueGateToken()}` });
    eq([gated.headers.get("referrer-policy"), gated.headers.get("cache-control")], ["same-origin", "private, no-store"], label("/admin (gated): console headers"));
    const manifest = run("/app/manifest.webmanifest", { cookie: "__Host-cs=x" });
    check(manifest.headers.get("x-middleware-next") === "1" && !manifest.headers.has("content-security-policy") && !manifest.headers.has("cache-control"), label("manifest: no nonce headers, the handler's Content-Type / Cache-Control kept"));
    eq(manifest.headers.getSetCookie(), [], label("manifest: no Set-Cookie"));
    eq(manifest.headers.get("x-middleware-request-cookie"), null, label("manifest: no session cookie reaches it"));
    // the device marker on auth pages: __Host- only
    for (const c of run("/login").headers.getSetCookie()) check(c.startsWith("__Host-") && /;\s*secure/i.test(c), label(`auth cookie ${c.split("=")[0]}: __Host-, Secure`));
  };
  await uiCases("P");
  await inSMode(() => uiCases("S"));

  /* ============================================================== 3 + 4. HSTS on passes, redirects */
  section("HSTS per host class (SEC-15), redirects");
  {
    eq(run("/s/shop1/x").headers.get("strict-transport-security"), HSTS, "[P] platform store path: HSTS without includeSubDomains");
    eq(run("/api/public/order", { method: "POST" }).headers.get("strict-transport-security"), HSTS, "[P] platform public API: HSTS");
    eq(run("/s/shop1/x", { host: LEGACY }).headers.get("strict-transport-security"), HSTS, "legacy store path: HSTS without includeSubDomains");
    await inSMode(() => {
      eq(run("/s/shop1/x").headers.get("strict-transport-security"), HSTS_SUB, "[S] platform: includeSubDomains");
      eq(run("/x", { edge: STORE }).headers.get("strict-transport-security"), HSTS, "[S] store host: no includeSubDomains");
      eq(run("/api/public/order", { edge: STORE, method: "POST" }).headers.get("strict-transport-security"), HSTS, "[S] store host public API: no includeSubDomains");
    });

    const redirectSet = (res: Response, label: string, status: number, hsts: string) => {
      eq(res.status, status, `${label}: status`);
      eq([res.headers.get("cache-control"), res.headers.get("x-content-type-options"), res.headers.get("x-frame-options"), res.headers.get("referrer-policy"), res.headers.get("strict-transport-security")], ["private, no-store", "nosniff", "DENY", "strict-origin-when-cross-origin", hsts], `${label}: base headers + private, no-store`);
      check(!res.headers.has("content-security-policy"), `${label}: no document CSP on a redirect`);
    };
    const gate = run(`/${GATE}`);
    redirectSet(gate, "303 gate", 303, HSTS);
    for (const c of gate.headers.getSetCookie()) check(c.startsWith("__Host-csg=") && /;\s*httponly/i.test(c) && /;\s*secure/i.test(c), "gate cookie: __Host-, HttpOnly, Secure");
    const legacy = run("/login?next=%2Fapp", { host: LEGACY });
    redirectSet(legacy, "legacy 308", 308, HSTS);
    eq(legacy.headers.get("location"), `https://${PLATFORM}/login?next=%2Fapp`, "legacy 308: the platform host, the query byte for byte");
    const sneaky = run("//evil.example/x", { host: LEGACY });
    eq(new URL(sneaky.headers.get("location") ?? "https://invalid/").host, PLATFORM, "legacy 308 of //evil.example/x stays on the platform host");
    await inSMode(() => {
      const own = run("/s/shop1/x?fbclid=1", { edge: STORE });
      redirectSet(own, "[S] own-handle 308", 308, HSTS);
      eq(own.headers.get("location"), `https://${STORE}/x?fbclid=1`, "[S] own-handle 308 target");
    });
    const canonical = permanentRedirect(plainReq("/s/Shop1/x"), "https://storegen.example/s/shop1/x?utm_source=fb");
    eq([canonical.status, canonical.headers.get("cache-control"), canonical.headers.get("x-content-type-options"), canonical.headers.get("strict-transport-security"), canonical.headers.get("cdn-cache-control")], [308, "public, max-age=300", "nosniff", HSTS, null], "canonical 308 (direct): public, max-age=300");
    await inSMode(() => {
      const viaEdge = permanentRedirect(plainReq("/s/shop1/X", { edge: STORE }), "/s/shop1/x");
      eq([viaEdge.headers.get("cache-control"), viaEdge.headers.get("cdn-cache-control")], ["public, max-age=300", "no-store"], "[S] canonical 308 via the edge: CDN-Cache-Control: no-store (ENGC-2)");
    });
  }

  /* ============================================================== 5. store documents */
  section("store documents (documentResponse) per kind and host class");
  {
    const store = { id: "st_shop1", handle: "shop1" };
    const csp = buildLandingCsp({ mode: "live", scriptHashes: ["sha256-aGVhZGVycy1jaGVjay1zY3JpcHQtaGFzaA=="], styleHashes: ["sha256-aGVhZGVycy1jaGVjay1zdHlsZS1oYXNo"], pixels: { meta: true, tiktok: true }, upgradeInsecureRequests: true });
    const html = "<!doctype html><title>t</title><p>store document</p>";
    type K = "landing" | "legal" | "thanks" | "test" | "preview";
    const expected: Record<K, { cache: string; robots: string | null; referrer: string }> = {
      landing: { cache: "public, max-age=0, must-revalidate, s-maxage=60", robots: null, referrer: "strict-origin-when-cross-origin" },
      legal: { cache: "public, max-age=0, must-revalidate, s-maxage=60", robots: "noindex, follow", referrer: "strict-origin-when-cross-origin" },
      thanks: { cache: "private, no-store", robots: "noindex, nofollow", referrer: "no-referrer" },
      test: { cache: "private, no-store", robots: "noindex, nofollow", referrer: "strict-origin-when-cross-origin" },
      preview: { cache: "private, no-store", robots: "noindex, nofollow", referrer: "no-referrer" },
    };
    const docCases = async (where: "platform" | "store") => {
      for (const kind of Object.keys(expected) as K[]) {
        if (where === "store" && kind === "preview") continue; // previews live on the platform host only (D20)
        const req = where === "store" ? plainReq("/x", { edge: STORE }) : plainReq(`/s/shop1/x`);
        const res = await documentResponse(req, { html, csp, etag: "a".repeat(64) }, { kind, store });
        const label = `${where} ${kind}`;
        const want = expected[kind];
        eq([res.status, res.headers.get("cache-control"), res.headers.get("x-robots-tag"), res.headers.get("referrer-policy")], [200, want.cache, want.robots, want.referrer], `${label}: cache, robots, referrer`);
        eq([res.headers.get("cross-origin-opener-policy"), res.headers.get("cross-origin-resource-policy"), res.headers.get("x-content-type-options"), res.headers.get("x-frame-options")], [DOCUMENT_COOP, "same-origin", "nosniff", "DENY"], `${label}: COOP / CORP / nosniff / DENY`);
        eq(res.headers.get("cdn-cache-control"), where === "store" ? "no-store" : null, `${label}: CDN-Cache-Control only via the edge`);
        eq(res.headers.get("strict-transport-security"), where === "store" ? HSTS : env.STORE_ROOT_DOMAIN ? HSTS_SUB : HSTS, `${label}: HSTS`);
        const served = res.headers.get("content-security-policy") ?? "";
        assertNarrowed(served, [`https://${PLATFORM}`, `https://${STORE}`], label);
        const api = where === "store" ? `https://${STORE}/api/public/` : `https://${PLATFORM}/api/public/`;
        check(directive(served, "connect-src").includes(api) && directive(served, "form-action").includes(api), `${label}: the serving origin's public API (${api})`);
        if (where === "store") check(!served.includes(`https://${PLATFORM}/api/public/`), `${label}: the platform's API is not named on a store host`);
        check(served.includes("frame-ancestors 'none'"), `${label}: frame-ancestors 'none'`);
      }
      // a store host the store does not own (another handle's Worker request): never reflected
      if (where === "store") {
        const res = await documentResponse(plainReq("/x", { edge: `shop2.${ROOT}` }), { html, csp }, { kind: "landing", store });
        check(!(res.headers.get("content-security-policy") ?? "").includes(`shop2.${ROOT}`), "a host outside storeHosts(store) is never put in the CSP");
      }
      // a Host that is not the platform's (direct): its origin is never reflected
      const foreign = await documentResponse(plainReq("/s/shop1/x", { host: "evil.example.org", headers: { "x-forwarded-host": "evil2.example.org" } }), { html, csp }, { kind: "landing", store });
      check(!/evil2?\.example\.org/.test(foreign.headers.get("content-security-policy") ?? ""), `${where}: no reflected Host / X-Forwarded-Host in the CSP`);
    };
    await docCases("platform");
    await inSMode(() => docCases("platform"));
    await inSMode(() => docCases("store"));
  }

  /* ============================================================== 6. public JSON APIs */
  section("public JSON APIs (apiHeaders)");
  {
    const h = apiHeaders({ "Access-Control-Allow-Origin": "https://shop.example" });
    eq([h.get("cache-control"), h.get("x-content-type-options"), h.get("x-frame-options"), h.get("x-robots-tag")], ["no-store", "nosniff", "DENY", "noindex, nofollow"], "apiHeaders: base headers + no-store + noindex");
    eq(h.get("access-control-allow-origin"), "https://shop.example", "apiHeaders: CORS only as the caller allowed it");
    check(!apiHeaders().has("access-control-allow-origin"), "apiHeaders: no CORS by default");
  }

  /* ============================================================== 7. R1 routes at the proxy (P0b) */
  section("R1 routes at the proxy (P0b: P1-7, P2-14, P3-7, P8-12; each pending until its route exists)");
  {
    const ULID_A = "01JAAAAAAAAAAAAAAAAAAAAAAA";
    const ULID_B = "01JBBBBBBBBBBBBBBBBBBBBBBB";
    const SESSION = "__Host-cs=headersCheckSessionToken";
    const gated = () => `${GATE_COOKIE}=${issueGateToken()}; ${SESSION}`;
    /** the Cookie header the handler receives (null: deleted by the proxy) */
    const forwardedCookie = (res: NextResponseType) => res.headers.get("x-middleware-request-cookie");
    const neutralSet = (o: Req = {}) => sorted(visible(unknownPageResponse("GET", request("/x", o).headers).headers));
    /** path + query of the proxy's internal rewrite */
    const rewrittenTo = (res: NextResponseType) => {
      const target = res.headers.get("x-middleware-rewrite");
      if (!target) return null;
      const u = new URL(target);
      return `${u.pathname}${u.search}`;
    };
    // P1-7: the console's route handlers (PLA-§M.2), behind the gate: the proxy's console headers win over a handler's
    // (Next appends a handler header only when the proxy set none), so they are the client's values
    const consoleRows: [string, string, string][] = [
      ["GET /api/admin/pulse", "src/app/api/admin/pulse/route.ts", "/api/admin/pulse"],
      ["GET /api/admin/search", "src/app/api/admin/search/route.ts", "/api/admin/search?q=xx"],
      ["GET /api/admin/stores.csv", "src/app/api/admin/stores.csv/route.ts", "/api/admin/stores.csv?status=active"],
      ["GET /api/admin/audit.csv", "src/app/api/admin/audit.csv/route.ts", "/api/admin/audit.csv"],
      ["the console export download", "src/app/api/admin/stores/[id]/exports/[jobId]/[part]/route.ts", `/api/admin/stores/${ULID_A}/exports/${ULID_B}/1?t=x`],
      ["the backup download", "src/app/api/admin/backups/[day]/route.ts", "/api/admin/backups/2026-10-27"],
    ];
    // P2-14, P8-12: the dashboard's route handlers: passed with the session, nothing set over the handler's headers
    const appRows: [string, string, string][] = [
      ["GET /api/app/<h>/pulse (P2-14)", "src/app/api/app/[store]/pulse/route.ts", "/api/app/shop1/pulse"],
      ["GET /api/app/<h>/search (P2-14)", "src/app/api/app/[store]/search/route.ts", "/api/app/shop1/search?q=xx"],
      ["GET /api/app/<h>/exports/<jobId>/<part> (P8-12)", "src/app/api/app/[store]/exports/[jobId]/[part]/route.ts", `/api/app/shop1/exports/${ULID_B}/1?t=x`],
    ];
    for (const mode of ["P", "S"] as const) {
      const label = (s: string) => `[${mode}] ${s}`;
      const inMode = (fn: () => void) => (mode === "S" ? inSMode(fn) : fn());
      const hsts = mode === "S" ? HSTS_SUB : HSTS;
      for (const [name, route, path] of consoleRows) {
        await routeCase(label(`${name} (P1-7)`), route, () =>
          inMode(() => {
            const res = run(path, { cookie: gated() });
            eq(
              [res.headers.get("x-middleware-next"), res.headers.get("cache-control"), res.headers.get("x-robots-tag"), res.headers.get("referrer-policy"), res.headers.get("x-content-type-options"), res.headers.get("strict-transport-security")],
              ["1", "private, no-store", "noindex, nofollow, noarchive", "same-origin", "nosniff", hsts],
              label(`${name}: gated, passed with private, no-store, noindex, same-origin`),
            );
            check(forwardedCookie(res) !== null, label(`${name}: the session reaches the handler`));
            const open = run(path);
            eq([open.status, sorted(visible(open.headers))], [404, neutralSet()], label(`${name}: without the gate, the neutral 404`));
          }),
        );
      }
      // the console media proxy (PLA-§M.2, core §F.6 "Media"): the sandbox CSP must reach the client, so the proxy may not
      // put its console nonce CSP on this path; since P0b V-1 it passes a gated read like the dashboard manifest
      // (isConsoleMediaPath, src/lib/edge/areas.ts)
      await routeCase(label("GET /api/admin/stores/<id>/media/<key> (P1-7)"), "src/app/api/admin/stores/[id]/media/[key]/route.ts", () =>
        inMode(() => {
          const res = run(`/api/admin/stores/${ULID_A}/media/headers-check-media-key`, { cookie: gated() });
          const csp = res.headers.get("content-security-policy");
          const cache = res.headers.get("cache-control");
          check(res.headers.get("x-middleware-next") === "1" && forwardedCookie(res) !== null, label("console media: gated, passed to the handler with the session"));
          check(csp === null || csp === MEDIA_SANDBOX_CSP, label(`console media: the proxy leaves the handler's sandbox CSP in place (a proxy CSP would win; got ${csp})`));
          check(cache === null || cache === "private, no-store", label(`console media: never stored (got ${cache})`));
          check([null, "nosniff"].includes(res.headers.get("x-content-type-options")), label("console media: nothing but nosniff for X-Content-Type-Options"));
          // P0b review F-4: the rest of the console set stays on the passed read (the proxy's values win over the handler's)
          eq(
            [res.headers.get("cross-origin-resource-policy"), res.headers.get("x-frame-options"), res.headers.get("referrer-policy"), (res.headers.get("x-robots-tag") ?? "").split(",")[0]],
            ["same-origin", "DENY", "same-origin", "noindex"],
            label("console media: CORP same-origin, frame DENY, Referrer-Policy same-origin, noindex from the proxy"),
          );
        }),
      );
      for (const [name, route, path] of appRows) {
        await routeCase(label(name), route, () =>
          inMode(() => {
            const res = run(path, { cookie: SESSION, headers: { "if-none-match": '"headers-check-etag"' } });
            check(res.headers.get("x-middleware-next") === "1", label(`${name}: passed to the handler`));
            eq(
              ["content-security-policy", "cache-control", "x-robots-tag", "content-disposition", "etag", "referrer-policy"].map((h) => res.headers.get(h)),
              [null, null, null, null, null, null],
              label(`${name}: the proxy sets none of the handler's headers (ETag, Cache-Control, Content-Disposition reach the client)`),
            );
            eq(res.headers.get("strict-transport-security"), hsts, label(`${name}: HSTS`));
            check(forwardedCookie(res) !== null && res.headers.get("x-middleware-request-if-none-match") === '"headers-check-etag"', label(`${name}: the session and If-None-Match reach the handler`));
            eq(res.headers.getSetCookie(), [], label(`${name}: no Set-Cookie from the proxy`));
            if (mode === "S") {
              const viaStore = run(path, { edge: STORE, cookie: SESSION });
              eq([viaStore.status, sorted(visible(viaStore.headers))], [404, neutralSet({ edge: STORE })], label(`${name}: on a store host, the neutral 404`));
            }
          }),
        );
      }
      // P3-7: /track (wave 1) and /go/<code> (wave 2) reach their store routes cookie-less; the documents' headers are theirs
      const storeRows: [string, string, string][] = [
        ["GET <base>/track (P3-7 wave 1)", "src/app/s/[store]/track/route.ts", "/track?o=CMD-7K3Q9X&s=k1.headersCheckSig"],
        ["GET <base>/go/<code> (P3-7 wave 2)", "src/app/s/[store]/go/[code]/route.ts", "/go/abc123?fbclid=A%2Fb&utm_x=1"],
      ];
      for (const [name, route, path] of storeRows) {
        await routeCase(label(name), route, () =>
          inMode(() => {
            const direct = run(`/s/shop1${path}`, { cookie: SESSION });
            eq(
              [direct.headers.get("x-middleware-next"), forwardedCookie(direct), direct.headers.get("content-security-policy"), direct.headers.get("cache-control"), direct.headers.get("referrer-policy")],
              ["1", null, null, null, null],
              label(`${name}: /s/<h>${path.split("?")[0]} passed cookie-less, with the route's own document headers`),
            );
            if (mode === "S") {
              const viaEdge = run(path, { edge: STORE, cookie: SESSION });
              eq([rewrittenTo(viaEdge), forwardedCookie(viaEdge), viaEdge.headers.get("cache-control")], [`/s/shop1${path}`, null, null], label(`${name}: on the store host, rewritten with the raw query, cookie-less`));
            }
          }),
        );
      }
    }
    // P3-7: the test render keeps its §F.6 row (section 5 asserts `private, no-store`, `noindex, nofollow` and the
    // narrowed connect-src / form-action without a bare 'self' for kind "test" on the platform and store hosts),
    // `/kit/*` the auth class with `no-referrer` (section 2); the online part adds both over HTTP.
  }
  console.warn = warn;

  if (ONLINE_BASE) await online();
  else console.log("online part: not run (pass --base http://127.0.0.1:3451 against a production build, §J.3)");

  const pendingNote = !pendingCases.length ? (STRICT ? "; --strict: nothing pending" : "") : STRICT ? `; ${pendingCases.length} pending case(s) counted as failures (--strict)` : `; ${pendingCases.length} case(s) pending, listed above (--strict fails them)`;
  console.log(failures ? `qa:headers: ${failures} of ${checks} checks FAILED${pendingNote}` : `qa:headers: all ${checks} checks passed${pendingNote}`);
  process.exit(failures ? 1 : 0);
}

/* ================================================================== online */

interface Answer {
  status: number;
  headers: Record<string, string>;
  cookies: string[];
  body: string;
}

function send(base: URL, path: string, method: string, headers: Record<string, string>, body: string | null = null): Promise<Answer> {
  return new Promise((resolve, reject) => {
    const lib = base.protocol === "https:" ? https : http;
    const req = lib.request({ host: base.hostname, port: base.port, path, method, headers, rejectUnauthorized: false }, (res) => {
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

/** the header set without the per-connection / per-response names */
const comparable = (a: Answer) => {
  const out = { ...a.headers };
  for (const k of ["date", "connection", "keep-alive", "transfer-encoding"]) delete out[k];
  return JSON.stringify(Object.entries(out).sort(([x], [y]) => x.localeCompare(y)));
};

async function online(): Promise<void> {
  section(`online: ${ONLINE_BASE}`);
  const base = new URL(ONLINE_BASE!);
  const platformUrl = ONLINE_ENV.PLATFORM_URL;
  const handle = arg("store");
  const slug = arg("slug");
  if (!platformUrl || !handle || !slug) {
    check(false, "online: PLATFORM_URL (the server's) in the environment, --store and --slug are required");
    return;
  }
  const apex = new URL(platformUrl).host;
  const root = ONLINE_ENV.STORE_ROOT_DOMAIN?.trim().toLowerCase();
  const key = ONLINE_ENV.EDGE_KEY?.trim();
  const sMode = !!root && !!key && key.length >= 32;
  const get = (path: string, extra: Record<string, string> = {}, method = "GET") => send(base, path, method, { host: apex, ...extra });
  const edge = (path: string, method = "GET", extra: Record<string, string> = {}) =>
    send(base, path, method, { host: apex, "x-sg-host": `${handle}.${root}`, "x-sg-edge": key!, "x-sg-ip": "198.51.100.8", "x-sg-proto": "https", "x-sg-worker": "w-headers", "x-sg-ts": String(Date.now()), ...extra });

  const health = await get("/api/health").catch((e: unknown) => ({ status: 0, headers: {}, cookies: [], body: String(e) }) as Answer);
  if (health.status !== 200 || !/"app"\s*:\s*"store-gen"/.test(health.body)) {
    check(false, `online: ${base.origin}/api/health is not Store Gen (status ${health.status}); refusing to test another app (QA-01)`);
    return;
  }
  eq([health.headers["cache-control"], health.headers["x-content-type-options"]], ["no-store", "nosniff"], "online: /api/health: no-store + base headers");

  // 404 uniformity: the proxy, the route handlers and the fallback rewrite
  // in S mode the platform host 308s a live store's /s/<h>/** to its subdomain (asserted below), so that path is P only
  const platform404 = [
    await get("/admin"),
    await get("/d/x"),
    ...(sMode ? [] : [await get(`/s/${handle}/no-such-slug-qa`)]),
    await get("/s/no-such-handle-qa"),
    await get("/no/such/deep/path"),
    await get("/no-such-slug-qa"),
  ];
  for (const r of platform404) eq(r.status, 404, "online: platform 404 status");
  eq(new Set(platform404.map(comparable)).size, 1, "online: one 404 header set on the platform host (proxy, routes, fallback)");
  eq(new Set(platform404.map((r) => r.body)).size, 1, "online: one 404 body on the platform host");
  eq(platform404[0]!.headers["strict-transport-security"], sMode ? HSTS_SUB : HSTS, "online: platform 404 HSTS");
  const head404 = await get("/admin", {}, "HEAD");
  eq([head404.status, head404.body], [404, ""], "online: HEAD 404 empty");
  const action = await get("/", { "next-action": "abc", origin: "null", "content-type": "text/plain" }, "POST");
  eq(action.status, 403, "online: Origin: null action → 403 (CRIT2-11)");
  // the bodies differ in length only by the status line's text: compare with the 404's length (a chunked 404 has none)
  const actionHeaders = { ...action.headers };
  const length404 = platform404[0]!.headers["content-length"];
  if (length404 === undefined) delete actionHeaders["content-length"];
  else actionHeaders["content-length"] = length404;
  eq(comparable({ ...action, headers: actionHeaders }), comparable(platform404[0]!), "online: the 403 carries the neutral set");

  // platform UI (`/report/<h>` and `/invite/staff/<token>` are R1 route cases, below)
  for (const path of ["/login", "/signup", "/invite/qa-token", "/reset/qa-token"]) {
    const r = await get(path);
    eq([r.headers["referrer-policy"], r.headers["cache-control"]?.includes("no-store"), /noindex/.test(r.headers["x-robots-tag"] ?? "")], ["same-origin", true, true], `online: ${path} same-origin, no-store, noindex`);
    check(/'nonce-/.test(r.headers["content-security-policy"] ?? ""), `online: ${path} nonce CSP`);
    for (const c of r.cookies) check(c.startsWith("__Host-"), `online: ${path} cookie ${c.split("=")[0]} with __Host-`);
  }
  const kit = await get("/kit/qa-token");
  eq(kit.headers["referrer-policy"], "no-referrer", "online: /kit/* no-referrer");
  const home = await get("/");
  eq([home.headers["cache-control"], home.headers["x-robots-tag"]], ["public, max-age=0, s-maxage=300", undefined], "online: marketing / indexable");
  const manifest = await get("/app/manifest.webmanifest", { cookie: "__Host-cs=x" });
  // until P2 / T4 add the route, /app/<h> answers it (a 404, or the sign-in redirect for a signed-out visitor)
  if (manifest.status !== 200) console.log(`  (manifest not served yet: P2 / T4 route; status ${manifest.status})`);
  else eq([manifest.headers["content-type"]?.split(";")[0], manifest.headers["cache-control"], manifest.cookies.length, "content-security-policy" in manifest.headers], ["application/manifest+json", "public, max-age=3600", 0, false], "online: manifest public, max-age=3600, no cookie, no nonce CSP");

  // store documents (P mode on the platform host, or the canonical 308 in S mode)
  const page = await get(`/s/${handle}/${slug}`);
  if (sMode) {
    eq([page.status, page.headers["location"], page.headers["cache-control"]], [308, `https://${handle}.${root}/${slug}`, "public, max-age=300"], "online: [S] platform /s/<h>/x → canonical 308");
    const viaEdge = await edge(`/${slug}`);
    eq([viaEdge.status, viaEdge.headers["cdn-cache-control"], viaEdge.headers["strict-transport-security"]], [200, "no-store", HSTS], "online: [S] store document via the edge");
    const csp = viaEdge.headers["content-security-policy"] ?? "";
    check(!/(connect-src|form-action)[^;]*'self'/.test(csp) && csp.includes(`https://${handle}.${root}/api/public/`), "online: [S] store document CSP narrowed to the store host");
    const store404 = [await edge("/admin"), await edge("/no-such-slug-qa"), await edge("/s/other-handle/x")];
    // these requests skip the Worker, which strips Next's x-middleware-* response headers (a rewritten route's 404
    // carries x-middleware-rewrite; asserted by qa:edge-sim): compare what a visitor of the store host receives
    const viaWorker = (a: Answer): Answer => ({ ...a, headers: Object.fromEntries(Object.entries(a.headers).filter(([k]) => !k.startsWith("x-middleware-"))) });
    eq(new Set(store404.map((r) => comparable(viaWorker(r)))).size, 1, "online: [S] one 404 header set on the store host");
    eq(store404[0]!.headers["strict-transport-security"], HSTS, "online: [S] store host 404 HSTS");
    eq(store404.flatMap((r) => r.cookies), [], "online: [S] no Set-Cookie on the store host");
  } else {
    eq([page.status, page.headers["cache-control"], page.headers["cross-origin-opener-policy"], page.headers["cdn-cache-control"]], [200, "public, max-age=0, must-revalidate, s-maxage=60", "same-origin-allow-popups", undefined], "online: [P] live store document");
    const csp = page.headers["content-security-policy"] ?? "";
    check(!/(connect-src|form-action)[^;]*'self'/.test(csp) && csp.includes("/api/public/"), "online: [P] store document CSP narrowed (SEC-2)");
    const thanks = await get(`/s/${handle}/${slug}/merci`);
    eq([thanks.headers["cache-control"], /noindex/.test(thanks.headers["x-robots-tag"] ?? ""), thanks.headers["referrer-policy"]], ["private, no-store", true, "no-referrer"], "online: [P] thank-you page private, noindex, no-referrer");
    const legal = await get(`/s/${handle}/policies/privacy`);
    if (legal.status === 200) eq(legal.headers["x-robots-tag"], "noindex, follow", "online: [P] legal page noindex, follow");
    const upper = await get(`/s/${handle}/${slug.toUpperCase()}?utm_source=fb`);
    eq([upper.status, upper.headers["cache-control"], upper.headers["location"]?.endsWith(`/s/${handle}/${slug}?utm_source=fb`)], [308, "public, max-age=300", true], "online: [P] upper-case slug → canonical 308 with the query");
  }
  const order = await get("/api/public/order", { "content-type": "application/json", origin: `https://${apex}` }, "POST");
  eq([order.headers["cache-control"], order.headers["x-content-type-options"]], ["no-store", "nosniff"], "online: public API: no-store + base headers");
  const media = arg("media");
  if (media) {
    const r = await get(`/media/${media}`);
    eq([r.headers["content-security-policy"], r.headers["x-content-type-options"], r.headers["cross-origin-resource-policy"], !!r.headers["strict-transport-security"]], [MEDIA_SANDBOX_CSP, "nosniff", "cross-origin", true], "online: media sandbox CSP, nosniff, CORP, HSTS");
    eq([r.headers["cache-control"], r.headers["cdn-cache-control"]], ["public, max-age=31536000, immutable", "public, max-age=86400"], "online: media a year in the browser, a day at the edge (CCR r1.0-m-6)");
  }

  /* ---------------- the R1 routes (P0b: P1-7, P2-14, P3-7, P8-12; the pending rule) ---------------- */
  section("online: R1 routes (P0b; each pending until its route exists)");
  const { member, outsider, staff, testToken, kitToken, exportPath, exportExpired, exportForeign, consoleExport } = SECRET_INPUTS;
  const neutral404 = platform404[0]!;
  /** §F.6: the neutral 404, its header set byte-identical to the other 404 producers (the proxy's, the routes', the fallback) */
  const isNeutral404 = (r: Answer, label: string) => {
    eq([r.status, r.body === neutral404.body], [404, true], `${label}: the neutral 404`);
    eq(comparable(r), comparable(neutral404), `${label}: the neutral 404's header set, byte for byte`);
  };
  /** the platform UI auth class (§F.6, PLA-§M.2, LAN-§13.5): nonce CSP, noindex, `private, no-store`, the referrer policy */
  const authClass = (r: Answer, label: string, referrer: "same-origin" | "no-referrer") => {
    eq([r.headers["referrer-policy"], r.headers["cache-control"], /noindex/.test(r.headers["x-robots-tag"] ?? "")], [referrer, "private, no-store", true], `${label}: ${referrer}, private, no-store, noindex`);
    check(/'nonce-/.test(r.headers["content-security-policy"] ?? ""), `${label}: nonce CSP`);
    for (const c of r.cookies) check(c.startsWith("__Host-"), `${label}: cookie ${c.split("=")[0]} with __Host-`);
  };
  const attachment = (r: Answer) => /^attachment\b/i.test(r.headers["content-disposition"] ?? "");
  /** the same signed path with its `t` changed in its last character */
  const tamperedT = (path: string) => {
    const u = new URL(path, "http://qa.invalid");
    const t = u.searchParams.get("t") ?? "";
    u.searchParams.set("t", t ? `${t.slice(0, -1)}${t.endsWith("A") ? "B" : "A"}` : "invalid");
    return `${u.pathname}${u.search}`;
  };
  /** a store document path: through the edge in S mode, under /s/<h> in P mode */
  const docPath = (path: string) => (sMode ? edge(path) : get(`/s/${handle}${path}`));

  // P1-7 (PLA-§M.2, PLA-§24.2): the public staff-invite and report pages
  await routeCase("online: GET /invite/staff/<token> (P1-7)", "src/app/(public)/invite/staff/[token]/page.tsx", async () => authClass(await get("/invite/staff/qa-token"), "online: /invite/staff/<token>", "same-origin"));
  await routeCase("online: GET /report/<handle> (P1-7)", "src/app/(public)/report/[handle]/page.tsx", async () => authClass(await get(`/report/${handle}`), "online: /report/<handle>", "same-origin"));
  // P1-7: the console's route handlers, as a gated super_admin
  const consoleRoutes: [string, string, string, boolean][] = [
    ["GET /api/admin/pulse", "src/app/api/admin/pulse/route.ts", "/api/admin/pulse", false],
    ["GET /api/admin/search", "src/app/api/admin/search/route.ts", "/api/admin/search?q=xx", false],
    ["GET /api/admin/stores.csv", "src/app/api/admin/stores.csv/route.ts", "/api/admin/stores.csv", true],
    ["GET /api/admin/audit.csv", "src/app/api/admin/audit.csv/route.ts", "/api/admin/audit.csv", true],
  ];
  for (const [name, route, path, csv] of consoleRoutes) {
    await routeCase(
      `online: ${name} (P1-7)`,
      route,
      async () => {
        const r = await get(path, { cookie: staff! });
        eq([r.status, r.headers["cache-control"], r.headers["x-content-type-options"]], [200, "private, no-store", "nosniff"], `online: ${name}: 200, private, no-store`);
        if (csv) check(attachment(r), `online: ${name}: Content-Disposition attachment`);
      },
      lacking({ QA_HEADERS_STAFF_COOKIE: staff }),
    );
  }
  const storeId = arg("store-id");
  await routeCase(
    "online: GET /api/admin/stores/<id>/media/<key> (P1-7)",
    "src/app/api/admin/stores/[id]/media/[key]/route.ts",
    async () => {
      const r = await get(`/api/admin/stores/${storeId}/media/${media}`, { cookie: staff! });
      eq(
        [r.status, r.headers["content-security-policy"], r.headers["x-content-type-options"], r.headers["cache-control"], r.headers["cross-origin-resource-policy"], (r.headers["x-robots-tag"] ?? "").split(",")[0]],
        [200, MEDIA_SANDBOX_CSP, "nosniff", "private, no-store", "same-origin", "noindex"],
        "online: console media: the sandbox CSP, nosniff, private, no-store, CORP same-origin, noindex (P0b review F-4)",
      );
    },
    lacking({ QA_HEADERS_STAFF_COOKIE: staff, "--store-id": storeId, "--media": media }),
  );
  await routeCase(
    "online: the console export download (P1-7)",
    "src/app/api/admin/stores/[id]/exports/[jobId]/[part]/route.ts",
    async () => {
      const r = await get(consoleExport!, { cookie: staff! });
      eq([r.status, r.headers["cache-control"], attachment(r)], [200, "private, no-store", true], "online: console export download: private, no-store, attachment");
    },
    lacking({ QA_HEADERS_STAFF_COOKIE: staff, QA_HEADERS_CONSOLE_EXPORT_PATH: consoleExport }),
  );
  const backupDay = arg("backup-day");
  await routeCase(
    "online: the backup download (P1-7)",
    "src/app/api/admin/backups/[day]/route.ts",
    async () => {
      const r = await get(`/api/admin/backups/${backupDay}`, { cookie: staff! });
      eq([r.status, r.headers["cache-control"], attachment(r)], [200, "private, no-store", true], "online: backup download: private, no-store, attachment");
    },
    lacking({ QA_HEADERS_STAFF_COOKIE: staff, "--backup-day": backupDay }),
  );

  // P2-14 (core §F.6 public JSON row: the pulse adds ETag and answers 304; PLA-§M.2)
  await routeCase(
    "online: GET /api/app/<h>/pulse (P2-14)",
    "src/app/api/app/[store]/pulse/route.ts",
    async () => {
      const path = `/api/app/${handle}/pulse`;
      const r = await get(path, { cookie: member! });
      const etag = r.headers["etag"];
      eq([r.status, r.headers["cache-control"], !!etag], [200, "private, no-store", true], "online: pulse: 200 with an ETag, private, no-store");
      if (etag) {
        const again = await get(path, { cookie: member!, "if-none-match": etag });
        eq([again.status, again.body], [304, ""], "online: pulse: a matching If-None-Match → 304, no body");
      }
      isNeutral404(await get(path, { cookie: outsider! }), "online: pulse for a non-member");
    },
    lacking({ QA_HEADERS_MEMBER_COOKIE: member, QA_HEADERS_OUTSIDER_COOKIE: outsider }),
  );
  await routeCase(
    "online: GET /api/app/<h>/search (P2-14)",
    "src/app/api/app/[store]/search/route.ts",
    async () => {
      const r = await get(`/api/app/${handle}/search?q=xx`, { cookie: member! });
      eq([r.status, r.headers["cache-control"], r.cookies.length], [200, "private, no-store", 0], "online: search: private, no-store, no Set-Cookie");
    },
    lacking({ QA_HEADERS_MEMBER_COOKIE: member }),
  );

  // P3-7 (LAN-§9.1, §12.1, §13.5, §14.2, §25.3; core §F.6 store documents and redirects)
  await routeCase("online: GET <base>/track (P3-7 wave 1)", "src/app/s/[store]/track/route.ts", async () => {
    const r = await docPath("/track");
    eq([r.status, r.headers["cache-control"], /noindex/.test(r.headers["x-robots-tag"] ?? ""), r.headers["referrer-policy"]], [200, "private, no-store", true, "no-referrer"], "online: /track (the lookup form): noindex, private, no-store, no-referrer");
    const csp = r.headers["content-security-policy"] ?? "";
    check(!/(connect-src|form-action)[^;]*'self'/.test(csp) && csp.includes("/api/public/"), "online: /track: CSP narrowed to the serving origin's public API (SEC-2)");
    eq(r.cookies, [], "online: /track: no Set-Cookie");
  });
  const go = arg("go");
  const goPaused = arg("go-paused");
  await routeCase(
    "online: GET <base>/go/<code> (P3-7 wave 2)",
    "src/app/s/[store]/go/[code]/route.ts",
    async () => {
      const r = await docPath(`/go/${go}`);
      eq([r.status, r.headers["cache-control"]], [308, "private, no-store"], "online: /go/<code> 308 is private, no-store (not canonical)");
      const paused = await docPath(`/go/${goPaused}`);
      eq([paused.status, /no-store/.test(paused.headers["cache-control"] ?? ""), paused.headers["x-content-type-options"], paused.cookies.length], [410, true, "nosniff", 0], "online: a paused /go/<code> → its 410 page, never stored");
    },
    lacking({ "--go": go, "--go-paused": goPaused }),
  );
  await routeCase(
    "online: GET /kit/<token> (P3-7 wave 2)",
    "src/app/(public)/kit/[token]/page.tsx",
    async () => {
      const r = await get(`/kit/${encodeURIComponent(kitToken!)}`);
      eq(r.status, 200, "online: /kit/<token>: the share page");
      authClass(r, "online: /kit/<token>", "no-referrer");
    },
    lacking({ QA_HEADERS_KIT_TOKEN: kitToken }),
  );
  await routeCase(
    "online: the test render (P3-7)",
    "src/app/s/[store]/[slug]/route.ts",
    async () => {
      const r = await docPath(`/${slug}?sg-test=${encodeURIComponent(testToken!)}`);
      eq([r.status, r.headers["cache-control"], /noindex/.test(r.headers["x-robots-tag"] ?? "")], [200, "private, no-store", true], "online: test render: private, no-store, noindex");
      const csp = r.headers["content-security-policy"] ?? "";
      for (const name of ["connect-src", "form-action"]) {
        const values = directive(csp, name);
        check(!values.includes("'self'") && values.some((v) => v.endsWith("/api/public/")), `online: test render: ${name} narrowed to <serving origin>/api/public/, no bare 'self' (${values.join(" ")})`);
      }
    },
    lacking({ QA_HEADERS_TEST_TOKEN: testToken }),
  );

  // P8-12 (core §F.9 download, §F.6)
  await routeCase(
    "online: GET /api/app/<h>/exports/<jobId>/<part> (P8-12)",
    "src/app/api/app/[store]/exports/[jobId]/[part]/route.ts",
    async () => {
      const valid = await get(exportPath!, { cookie: member! });
      eq([valid.status, attachment(valid), valid.headers["cache-control"], valid.headers["x-content-type-options"]], [200, true, "private, no-store", "nosniff"], "online: a valid signed download: attachment, private, no-store, nosniff");
      isNeutral404(await get(tamperedT(exportPath!), { cookie: member! }), "online: a bad t");
      isNeutral404(await get(exportExpired!, { cookie: member! }), "online: an expired t");
      isNeutral404(await get(exportForeign!, { cookie: member! }), "online: another store's job");
    },
    lacking({ QA_HEADERS_MEMBER_COOKIE: member, QA_HEADERS_EXPORT_PATH: exportPath, QA_HEADERS_EXPORT_EXPIRED_PATH: exportExpired, QA_HEADERS_EXPORT_FOREIGN_PATH: exportForeign }),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
