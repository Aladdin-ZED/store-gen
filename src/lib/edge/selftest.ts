/**
 * test:hosts (docs/STORE-SAAS.md §J.1): the §C.2 / §C.3 decision tables as pure functions; no database, no
 * Next server. It absorbs the former ADMIN_HOST self-test (src/lib/auth/host-selftest.ts).
 *
 *   npm run test:hosts        (tsx src/lib/edge/selftest.ts; exit code 1 on any failure)
 *
 *  1. Edge verification (SEC-4): forged x-sg-* without a key are ignored; a present-but-wrong key, a stale or
 *     missing x-sg-ts and an x-sg-edge with no EDGE_KEY configured are `invalid`; the EDGE_KEY_PREV grace;
 *     edgeClientIp only when verified; the bad_key / prev_key tally.
 *  2. classifyHost: the §C.2 table; hostOf (isomorphic) ≡ normalizeHost (auth/config).
 *  3. areaOf with encoded and oddly-cased paths (V1, offline part); the store / dashboard path parts.
 *  4. The signed request path (SEC-3): round trip, tampering, no APP_SECRET.
 *  5. The proxy per host class (§C.3): platform (gate, console, cookie-less store areas (SEC-2), manifest,
 *     device marker (SEC-12), kit / auth / marketing headers, the `Origin: null` action 403), the console host
 *     (ADMIN_HOST), legacy 308s with byte-identical queries, store hosts (rewrite without a trailing slash,
 *     ENGC-15; own-handle 308; other handles, actions and platform areas 404), reserved / invalid / foreign;
 *     x-sg-* stripping, the two header sets (ENGC-22), HSTS per host class (SEC-15).
 *  6. ADMIN_HOST parsing, the request host and the in-app gate re-check (from host-selftest.ts).
 *  7. The URL builders (§C.6) per addressing mode: the store home without a trailing slash, media, hosts,
 *     console, preview and report URLs.
 *  8. Development mode (a child process, IS_PROD is read at import): local hosts are the platform whatever
 *     PLATFORM_URL says; dev cookie names, no HSTS.
 */
import { spawnSync } from "node:child_process";
import Module from "node:module";
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
const DEV_CHILD = env.SG_TEST_HOSTS_DEV === "1";

const PLATFORM = "storegen.example";
const ROOT = PLATFORM; // STORE_ROOT_DOMAIN = the apex at launch
const CONSOLE = "console.storegen.example";
const LEGACY = "legacy-host.example.net";
const STORE = "shop1.storegen.example";
const GATE = "gate-k29fx81q4mz7w2pd";
const EDGE_KEY = "edgeKeyCurrent-3vT8pQ2mX7nL4wR9sK1dJ6hF5gB0cZ";
const EDGE_KEY_PREV = "edgeKeyPrevious-8aN3bM6vC1xZ4lK7jH2gF9dS5qW0e";
const APP_SECRET = "hostsSelftest-7Qm2Lx9Vb4Nc8Rt1Zp6Wd3Ks5Jh0Gf";

// IS_PROD (auth/config, unknown-page, device) is read once at import: set before the dynamic imports below
env.NODE_ENV = DEV_CHILD ? "development" : "production";
env.APP_SECRET = APP_SECRET;
env.ADMIN_GATE = GATE;
env.PLATFORM_URL = `https://${PLATFORM}`;
env.ADMIN_IP_ALLOWLIST = "";
env.LEGACY_PLATFORM_HOSTS = LEGACY;
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

function withEnv<T>(vars: Record<string, string | undefined>, fn: () => T): T {
  const prev: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    prev[k] = env[k];
    if (v === undefined) delete env[k];
    else env[k] = v;
  }
  try {
    return fn();
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete env[k];
      else env[k] = v;
    }
  }
}

async function withEnvAsync(vars: Record<string, string | undefined>, fn: () => Promise<void>): Promise<void> {
  const prev: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    prev[k] = env[k];
    if (v === undefined) delete env[k];
    else env[k] = v;
  }
  try {
    await fn();
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete env[k];
      else env[k] = v;
    }
  }
}

/** S mode on: STORE_ROOT_DOMAIN + EDGE_KEY (and the previous key during a rotation). */
const S_MODE = { STORE_ROOT_DOMAIN: ROOT, EDGE_KEY, EDGE_KEY_PREV: undefined } as const;

/** The six headers the Worker stamps (§C.5); `key: null` leaves x-sg-edge out, `ts: null` leaves x-sg-ts out. */
function workerHeaders(host: string, o: { key?: string | null; ts?: number | string | null; ip?: string; worker?: string } = {}): Record<string, string> {
  const h: Record<string, string> = { "x-sg-host": host, "x-sg-ip": o.ip ?? "203.0.113.7", "x-sg-proto": "https", "x-sg-worker": o.worker ?? "w-2026.10.1" };
  const key = o.key === undefined ? EDGE_KEY : o.key;
  if (key !== null) h["x-sg-edge"] = key;
  const ts = o.ts === undefined ? Date.now() : o.ts;
  if (ts !== null) h["x-sg-ts"] = String(ts);
  return h;
}

async function main(): Promise<void> {
  const { NextRequest } = await import("next/server");
  const { proxy } = await import("@/proxy");
  const host = await import("./host");
  const edgeEnv = await import("./env");
  const { hostOf } = edgeEnv;
  const { areaOf, appPathHandle, isAppManifestPath, storePathParts } = await import("./areas");
  const { PATH_HEADERS, stampRequestPath, verifiedRequestPath } = await import("./path-sig");
  const { DEVICE_COOKIE } = await import("./device");
  const { edgeTally, resetProxyLog } = await import("./proxy-log");
  const config = await import("@/lib/auth/config");
  const gate = await import("@/lib/auth/gate");
  const { UNKNOWN_PAGE_HTML, unknownPageHeaders, unknownPageResponse } = await import("@/lib/auth/unknown-page");
  const { redirectHeaders } = await import("@/lib/security/headers");

  const { effectiveHost, edgeCheck, edgeClientIp, edgeVerified, classifyHost } = host;
  const { GATE_COOKIE } = config;

  // the proxy's log lines are asserted (foreign once per host, bad_key once a minute), not printed
  const warned: string[] = [];
  const warn = console.warn;
  console.warn = (...args: unknown[]) => void warned.push(args.join(" "));

  interface Req {
    method?: string;
    /** the Host header (default: the platform host) */
    host?: string;
    headers?: Record<string, string>;
    cookie?: string;
  }
  /** A request as the proxy sees it; `path` is appended verbatim ("//evil.example/x" stays a path). */
  const request = (path: string, o: Req = {}): NextRequestType => {
    const h = o.host ?? PLATFORM;
    const headers = new Headers({ host: h, ...o.headers });
    if (o.cookie) headers.set("cookie", o.cookie);
    return new NextRequest(`https://${h}${path}`, { method: o.method ?? "GET", headers });
  };
  const run = (path: string, o: Req = {}): NextResponseType => proxy(request(path, o));
  /** a Worker subrequest: Host is the apex origin, the store host travels in x-sg-host */
  const viaEdge = (storeHost: string, path: string, o: Req & { edge?: Parameters<typeof workerHeaders>[1] } = {}) =>
    run(path, { ...o, host: PLATFORM, headers: { ...workerHeaders(storeHost, o.edge), ...o.headers } });

  /** The request headers the handler receives (x-middleware-override-headers), or null when nothing is forwarded. */
  const forwarded = (res: NextResponseType): Headers | null => {
    const list = res.headers.get("x-middleware-override-headers");
    if (list === null) return null;
    const out = new Headers();
    for (const name of list.split(",").filter(Boolean)) out.set(name, res.headers.get(`x-middleware-request-${name}`) ?? "");
    return out;
  };
  type Kind = "next" | "rewrite" | "redirect" | "404" | "403" | "other";
  const kind = (res: NextResponseType): Kind => {
    if (res.headers.get("x-middleware-rewrite")) return "rewrite";
    if (res.headers.get("x-middleware-next") === "1") return "next";
    if ([303, 307, 308].includes(res.status)) return "redirect";
    if (res.status === 404) return "404";
    if (res.status === 403) return "403";
    return "other";
  };
  const isUi = (res: NextResponseType) => kind(res) === "next" && /'nonce-[A-Za-z0-9+/=]+'/.test(res.headers.get("content-security-policy") ?? "");
  const rewriteTarget = (res: NextResponseType) => {
    const u = new URL(res.headers.get("x-middleware-rewrite") ?? "https://x.invalid/");
    return `${u.pathname}${u.search}`;
  };
  /** the response headers a client sees (the x-middleware-* plumbing removed) */
  const visible = (res: Response): Record<string, string> => {
    const out: Record<string, string> = {};
    res.headers.forEach((value, name) => {
      if (!name.startsWith("x-middleware-")) out[name] = value;
    });
    return out;
  };
  const lower = (h: Record<string, string>) => Object.fromEntries(Object.entries(h).map(([k, v]) => [k.toLowerCase(), v]));
  const sorted = (h: Record<string, string>) => JSON.stringify(Object.entries(h).sort(([a], [b]) => a.localeCompare(b)));
  const expectKind = (res: NextResponseType, want: Kind, label: string) => check(kind(res) === want, `${label}: ${kind(res)} (${res.status}), expected ${want}`);
  /** a proxy 404 / 403: exactly the neutral set of this host class (and the static page for a GET 404) */
  const expectNeutral = async (res: NextResponseType, cls: Parameters<typeof unknownPageHeaders>[0], label: string, method = "GET", status = 404) => {
    check(res.status === status, `${label}: status ${res.status}, expected ${status}`);
    check(sorted(visible(res)) === sorted(lower(unknownPageHeaders(cls))), `${label}: the neutral header set (got ${sorted(visible(res))})`);
    const body = await res.text();
    check(body === (status === 404 && method === "GET" ? UNKNOWN_PAGE_HTML : ""), `${label}: the neutral body`);
  };
  const expectRedirect = (res: NextResponseType, status: number, location: string, cls: Parameters<typeof redirectHeaders>[0], label: string) => {
    check(res.status === status, `${label}: status ${res.status}, expected ${status}`);
    check(res.headers.get("location") === location, `${label}: Location ${res.headers.get("location")}, expected ${location}`);
    const v = visible(res);
    for (const [name, value] of Object.entries(lower(redirectHeaders(cls)))) check(v[name] === value, `${label}: ${name} = ${v[name]}, expected ${value}`);
  };
  const stsOf = (res: Response) => res.headers.get("strict-transport-security");

  if (DEV_CHILD) {
    devChecks();
    return;
  }

  /* ------------------------------------------------------------------ 1. edge verification */
  console.log("edge verification");
  withEnv(S_MODE, () => {
    const now = Date.now();
    const at = (o: Parameters<typeof workerHeaders>[1] = {}) => new Headers({ host: PLATFORM, ...workerHeaders(STORE, o) });

    const forged = new Headers({ host: PLATFORM, "x-sg-host": STORE, "x-sg-ip": "203.0.113.7", "x-sg-ts": String(now) });
    eq(effectiveHost(forged), { host: PLATFORM, via: "direct", cls: "platform", label: null, workerVersion: null }, "x-sg-host / x-sg-ip without x-sg-edge are ignored");
    eq(edgeCheck(forged).state, "absent", "no x-sg-edge: absent");
    eq(edgeClientIp(forged), null, "no x-sg-edge: no edge client IP");

    eq(effectiveHost(at()), { host: STORE, via: "edge", cls: "store", label: "shop1", workerVersion: "w-2026.10.1" }, "verified Worker headers");
    check(edgeVerified(at()), "edgeVerified: the current key");
    eq(edgeClientIp(at({ ip: "2001:db8::5" })), "2001:db8::5", "edgeClientIp: x-sg-ip when verified");

    const wrong = at({ key: "edgeKeyForged-0000aaaa1111bbbb2222cccc3333dd" });
    eq(effectiveHost(wrong).cls, "invalid", "present-but-wrong key → invalid, never the platform (SEC-4)");
    eq(edgeCheck(wrong), { state: "invalid", reason: "bad_key" }, "wrong key reason");
    eq(edgeClientIp(wrong), null, "wrong key: x-sg-ip ignored");
    eq(effectiveHost(at({ key: "" })).cls, "invalid", "an empty x-sg-edge is present: invalid");

    eq(edgeCheck(at({ ts: now - 5 * 60_000 - 1_000 })), { state: "invalid", reason: "stale" }, "x-sg-ts older than 5 minutes");
    eq(edgeCheck(at({ ts: now + 5 * 60_000 + 1_000 })), { state: "invalid", reason: "stale" }, "x-sg-ts more than 5 minutes ahead");
    eq(edgeCheck(at({ ts: now - 4 * 60_000 })).state, "verified", "x-sg-ts 4 minutes old still verifies");
    eq(edgeCheck(at({ ts: null })), { state: "invalid", reason: "stale" }, "x-sg-ts missing");
    eq(edgeCheck(at({ ts: "12ab" })), { state: "invalid", reason: "stale" }, "x-sg-ts not a number");
    eq(effectiveHost(at({ ts: now - 6 * 60_000 })).cls, "invalid", "a replayed (stale) header set is invalid");
    eq(edgeCheck(at(), now + 10 * 60_000).state, "invalid", "the check takes the caller's clock");

    eq(effectiveHost(at({ worker: "bad version!" })).workerVersion, null, "a malformed x-sg-worker is dropped");
    const noHost = new Headers({ host: PLATFORM, "x-sg-edge": EDGE_KEY, "x-sg-ts": String(now) });
    eq(effectiveHost(noHost).cls, "invalid", "verified key without x-sg-host → invalid");
  });

  withEnv({ ...S_MODE, EDGE_KEY_PREV }, () => {
    const prev = new Headers({ host: PLATFORM, ...workerHeaders(STORE, { key: EDGE_KEY_PREV }) });
    eq(edgeCheck(prev), { state: "verified", key: "prev" }, "EDGE_KEY_PREV grace during a rotation");
    eq(effectiveHost(prev).cls, "store", "previous key: the store host");
  });
  withEnv(S_MODE, () => {
    const prev = new Headers({ host: PLATFORM, ...workerHeaders(STORE, { key: EDGE_KEY_PREV }) });
    eq(edgeCheck(prev), { state: "invalid", reason: "bad_key" }, "the previous key after EDGE_KEY_PREV is removed");
  });
  withEnv({ STORE_ROOT_DOMAIN: ROOT, EDGE_KEY: undefined, EDGE_KEY_PREV: undefined }, () => {
    const h = new Headers({ host: PLATFORM, ...workerHeaders(STORE) });
    eq(edgeCheck(h), { state: "invalid", reason: "unconfigured" }, "x-sg-edge with no EDGE_KEY on the server");
    eq(effectiveHost(h).cls, "invalid", "unconfigured: invalid, never the platform");
  });
  withEnv({ STORE_ROOT_DOMAIN: ROOT, EDGE_KEY: "change-me-change-me-change-me-change-me", EDGE_KEY_PREV: undefined }, () => {
    const h = new Headers({ host: PLATFORM, ...workerHeaders(STORE, { key: "change-me-change-me-change-me-change-me" }) });
    eq(edgeCheck(h), { state: "invalid", reason: "unconfigured" }, "a template EDGE_KEY never verifies");
  });
  withEnv({ STORE_ROOT_DOMAIN: ROOT, EDGE_KEY: "short-key-123", EDGE_KEY_PREV: undefined }, () => {
    const h = new Headers({ host: PLATFORM, ...workerHeaders(STORE, { key: "short-key-123" }) });
    eq(edgeCheck(h).state, "invalid", "an EDGE_KEY under 32 characters never verifies");
  });

  /* ------------------------------------------------------------------ 2. classifyHost */
  console.log("classifyHost");
  withEnv({ ...S_MODE, ADMIN_HOST: CONSOLE }, () => {
    const table: Array<[string, "edge" | "direct", string, string | null]> = [
      [PLATFORM, "direct", "platform", null],
      [PLATFORM, "edge", "platform", null],
      ["StoreGen.Example.", "direct", "platform", null],
      [`${PLATFORM}:443`, "direct", "platform", null],
      [CONSOLE, "direct", "console", null],
      [CONSOLE, "edge", "console", null],
      [LEGACY, "direct", "legacy", null],
      [LEGACY, "edge", "foreign", null],
      [STORE, "edge", "store", "shop1"],
      ["SHOP1.storegen.example", "edge", "store", "shop1"],
      [STORE, "direct", "foreign", null],
      ["www.storegen.example", "edge", "reserved", null],
      ["admin.storegen.example", "edge", "reserved", null],
      ["api.storegen.example", "edge", "reserved", null],
      ["app.storegen.example", "edge", "reserved", null],
      ["a.b.storegen.example", "edge", "invalid", null],
      ["a.b.storegen.example", "direct", "invalid", null],
      ["ab.storegen.example", "edge", "invalid", null],
      ["-shop.storegen.example", "edge", "invalid", null],
      ["xn--shop.storegen.example", "edge", "invalid", null],
      ["shop_1.storegen.example", "edge", "invalid", null],
      ["203.0.113.9", "direct", "invalid", null],
      ["203.0.113.9:3000", "edge", "invalid", null],
      ["[2001:db8::1]", "direct", "invalid", null],
      ["localhost:3450", "direct", "foreign", null], // production: a single-label name is no configured host
      ["", "direct", "invalid", null],
      ["evil.example.org", "direct", "foreign", null],
      ["evil.example.org", "edge", "foreign", null], // C mode (custom) is R3
      ["storegen.example.evil.org", "edge", "foreign", null],
    ];
    for (const [h, via, cls, label] of table) eq(classifyHost(h, via), { cls, label }, `classifyHost(${JSON.stringify(h)}, ${via})`);
  });
  withEnv({ PLATFORM_URL: undefined, PUBLIC_URL: undefined }, () => {
    eq(classifyHost(PLATFORM, "direct").cls, "foreign", "production with no PLATFORM_URL: fails closed (foreign)");
  });
  withEnv({ PLATFORM_URL: undefined, PUBLIC_URL: `https://${PLATFORM}/` }, () => {
    eq(classifyHost(PLATFORM, "direct").cls, "platform", "PUBLIC_URL is PLATFORM_URL's alias");
  });
  withEnv({ PLATFORM_URL: `https://${PLATFORM}`, PUBLIC_URL: "https://old.example.org" }, () => {
    eq(classifyHost(PLATFORM, "direct").cls, "platform", "PLATFORM_URL wins over PUBLIC_URL");
  });
  for (const raw of ["Shop.MA", "shop.ma.", "shop.ma:443", "shop.ma:80", "shop.ma:3000", "[::1]:3400", "localhost", "a b", "shop.ma/x", "u@shop.ma", "", " shop.ma ", "xn--mgbh0fb.ma", "تجربة.ma"]) {
    eq(hostOf(raw), config.normalizeHost(raw), `hostOf ≡ normalizeHost for ${JSON.stringify(raw)}`);
  }

  /* ------------------------------------------------------------------ 3. areas */
  console.log("areas");
  const areas: Array<[string, string]> = [
    ["/admin", "console"],
    ["/ADMIN/orders", "console"],
    ["/%61dmin", "console"],
    ["/%2561dmin", "other"], // one decode only, like adminAreaOf
    ["//admin", "console"],
    ["/\\admin", "console"],
    ["/admin%2Fx", "console"],
    ["/administrator", "other"],
    ["/api/admin/media", "console-api"],
    ["/api/app/shop1/orders", "app-api"],
    ["/api/public/order", "public-api"],
    ["/api/health", "public-api"],
    ["/api/hooks/cod", "public-api"],
    ["/api/v1/orders", "api-v1"],
    ["/api/cron/tick", "cron"],
    ["/api/other", "other"],
    ["/app", "app"],
    ["/app/shop1/orders", "app"],
    ["/App/manifest.webmanifest", "app"],
    ["/application", "other"],
    ["/login", "auth"],
    ["/login/verify", "auth"],
    ["/signup", "auth"],
    ["/invite/tok", "auth"],
    ["/invite/staff/tok", "auth"],
    ["/reset/tok", "auth"],
    ["/report/shop1", "auth"],
    ["/kit/tok", "kit"],
    ["/", "marketing"],
    ["/terms", "marketing"],
    ["/privacy", "marketing"],
    ["/aup", "marketing"],
    ["/features", "marketing"],
    ["/features/", "marketing"],
    ["/pricing", "other"],
    ["/s/shop1", "store"],
    ["/s/shop1/promo", "store"],
    ["/S/Shop1/Promo", "store"],
    ["/s", "store"],
    ["/sx", "other"],
    ["/d/shop.ma/x", "internal"],
    ["/preview/tok", "preview"],
    ["/argan-oil", "other"],
    ["/robots.txt", "other"],
    ["/%zz", "other"],
  ];
  for (const [path, area] of areas) eq(areaOf(path), area, `areaOf(${path})`);
  eq(areaOf(`/${GATE}`), "gate", "the gate path");
  eq(areaOf(`/${GATE.toUpperCase()}`), "other", "the gate is an exact match");
  check(isAppManifestPath("/app/manifest.webmanifest") && isAppManifestPath("/app/Manifest.webmanifest") && !isAppManifestPath("/app/manifest.json"), "isAppManifestPath");
  eq(storePathParts("/s/shop1"), { handle: "shop1", rest: "" }, "storePathParts: the store home");
  eq(storePathParts("/s/shop1/"), { handle: "shop1", rest: "/" }, "storePathParts: trailing slash kept in rest");
  eq(storePathParts("/s/Shop1/A/b"), { handle: "shop1", rest: "/a/b" }, "storePathParts: normalised");
  eq(storePathParts("/s/%73hop1/x"), { handle: "shop1", rest: "/x" }, "storePathParts: decoded");
  eq(storePathParts("/s/"), null, "storePathParts: no handle");
  eq(storePathParts("/s/shop_1/x"), null, "storePathParts: not a handle segment");
  eq(storePathParts("/sx/shop1"), null, "storePathParts: other prefix");
  eq(appPathHandle("/app/shop1/orders"), "shop1", "appPathHandle");
  eq(appPathHandle("/app/new"), null, "appPathHandle: /app/new is not a store");
  eq(appPathHandle("/app/account/security"), null, "appPathHandle: /app/account");
  eq(appPathHandle("/app/manifest.webmanifest"), null, "appPathHandle: the manifest");

  /* ------------------------------------------------------------------ 4. signed request path */
  console.log("signed request path");
  {
    const h = new Headers({ [PATH_HEADERS.path]: "/app/victim/orders", [PATH_HEADERS.sig]: "forged" });
    eq(verifiedRequestPath(h), null, "a client-chosen x-sg-path does not verify");
    stampRequestPath(h, "/app/shop1/orders?tab=2");
    eq(verifiedRequestPath(h), "/app/shop1/orders?tab=2", "stamped path verifies");
    check(/^[0-9A-HJKMNP-TV-Z]{26}$/.test(h.get(PATH_HEADERS.rid) ?? ""), "x-sg-rid is a ULID");
    const tampered = new Headers(h);
    tampered.set(PATH_HEADERS.path, "/app/victim/orders");
    eq(verifiedRequestPath(tampered), null, "a changed path breaks the signature");
    const rid = new Headers(h);
    rid.set(PATH_HEADERS.rid, "01ARZ3NDEKTSV4RRFFQ69G5FAV");
    eq(verifiedRequestPath(rid), null, "another request id breaks the signature");
    const noSig = new Headers(h);
    noSig.delete(PATH_HEADERS.sig);
    eq(verifiedRequestPath(noSig), null, "a missing signature");
    const long = new Headers();
    stampRequestPath(long, `/app/shop1/${"x".repeat(700)}`);
    eq(verifiedRequestPath(long)?.length, 512, "the stamped path is cut at 512 characters and still verifies");
    withEnv({ APP_SECRET: undefined }, () => {
      const none = new Headers({ [PATH_HEADERS.path]: "/app/victim", [PATH_HEADERS.rid]: "x", [PATH_HEADERS.sig]: "y" });
      stampRequestPath(none, "/app/shop1");
      check(!none.has(PATH_HEADERS.path) && !none.has(PATH_HEADERS.sig) && !none.has(PATH_HEADERS.rid), "no APP_SECRET: nothing stamped, client copies deleted");
      eq(verifiedRequestPath(h), null, "no APP_SECRET: nothing verifies (fail closed)");
    });
  }

  /* ------------------------------------------------------------------ 5. the proxy */
  console.log("proxy: platform host");
  const token = gate.issueGateToken();
  const gateCookie = `${GATE_COOKIE}=${token}`;
  {
    const res = run(`/${GATE}`);
    check(res.status === 303 && new URL(res.headers.get("location") ?? "", "https://x.invalid").pathname === "/admin", "the gate 303s to /admin");
    check((res.headers.get("set-cookie") ?? "").startsWith(`${GATE_COOKIE}=`), "the gate sets the gate cookie");
    check(GATE_COOKIE === "__Host-csg", "production gate cookie is __Host-");
    expectRedirect(res, 303, `https://${PLATFORM}/admin`, "platform", "gate redirect headers");
    expectKind(run(`/${GATE}`, { method: "POST" }), "next", "the gate path with POST is an ordinary path");
    expectKind(run(`/${GATE}`, { headers: { "x-forwarded-for": "198.51.100.1" } }), "redirect", "the gate with an empty allowlist");
    withEnv({ ADMIN_IP_ALLOWLIST: "198.51.100.2" }, () => {
      expectKind(run(`/${GATE}`, { headers: { "x-forwarded-for": "198.51.100.1" } }), "next", "the gate from an IP outside the allowlist");
      expectKind(run("/admin", { cookie: gateCookie, headers: { "x-forwarded-for": "198.51.100.1" } }), "404", "/admin from an IP outside the allowlist");
    });

    await expectNeutral(run("/admin"), "platform", "/admin without the gate cookie");
    await expectNeutral(run("/admin/orders", { method: "HEAD" }), "platform", "HEAD /admin/orders without the gate", "HEAD");
    await expectNeutral(run("/api/admin/media/x", { method: "POST" }), "platform", "admin API without the gate", "POST");
    await expectNeutral(run("/%61dmin"), "platform", "encoded /admin without the gate");

    const ui = run("/admin/orders?page=2", { cookie: gateCookie, headers: { "x-nonce": "forged", "x-cs-pathname": "/admin/forged" } });
    check(isUi(ui), "gated /admin: nonce CSP");
    const f = forwarded(ui)!;
    const nonce = f.get("x-nonce") ?? "";
    check(nonce !== "forged" && (ui.headers.get("content-security-policy") ?? "").includes(`'nonce-${nonce}'`), "the forwarded x-nonce is the response CSP's nonce");
    eq(f.get("content-security-policy"), ui.headers.get("content-security-policy"), "the request carries the CSP (Next reads the nonce there)");
    check(!f.has("x-cs-pathname"), "a client x-cs-pathname is deleted and never re-stamped (CCR r1.0-t3-1)");
    eq(verifiedRequestPath(f), "/admin/orders?page=2", "x-sg-path stamped and signed");
    eq(ui.headers.get("cache-control"), "private, no-store", "console: private, no-store");
    eq(ui.headers.get("referrer-policy"), "same-origin", "console: Referrer-Policy same-origin");
    check((ui.headers.get("x-robots-tag") ?? "").startsWith("noindex"), "console: noindex");
    check(ui.headers.get("set-cookie") === null, "a fresh gate cookie is not re-issued");
    const old = run("/admin", { cookie: `${GATE_COOKIE}=${gate.issueGateToken(Date.now() - 2 * 86_400_000)}` });
    check(isUi(old) && (old.headers.get("set-cookie") ?? "").startsWith(`${GATE_COOKIE}=`), "a day-old gate cookie is re-issued (sliding)");
    check(isUi(run("/api/admin/media/x", { method: "POST", cookie: gateCookie })), "gated admin API: platform UI headers");

    await expectNeutral(run("/d/shop.ma/x"), "platform", "/d/** direct on the platform host");

    for (const path of ["/s/shop1/promo", "/s/shop1", "/preview/tok", "/api/public/order", "/api/health", "/api/v1/orders"]) {
      const res = run(path, { cookie: `${gateCookie}; cs=session`, method: path.startsWith("/api/public") ? "POST" : "GET" });
      expectKind(res, "next", `${path} passes`);
      check(forwarded(res)?.has("cookie") === false, `${path}: the Cookie header is deleted (SEC-2)`);
      check(res.headers.get("content-security-policy") === null, `${path}: no platform UI CSP (the handler's headers)`);
    }
    const page = run("/argan-oil?utm_source=fb", { cookie: "cs=session" });
    expectKind(page, "next", "a legacy single-tenant path passes");
    eq(forwarded(page)?.get("cookie"), "cs=session", "cookies kept outside the cookie-less areas");

    const manifest = run("/app/manifest.webmanifest", { cookie: "cs=session" });
    expectKind(manifest, "next", "the dashboard manifest passes");
    check(manifest.headers.get("content-security-policy") === null && manifest.headers.get("cache-control") === null, "the manifest keeps the handler's Content-Type and Cache-Control (no nonce headers)");
    check(forwarded(manifest)?.has("cookie") === false && !forwarded(manifest)?.has("x-nonce"), "the manifest: no session, no nonce");

    const app = run("/app/shop1/orders");
    check(isUi(app), "/app: platform UI");
    eq([app.headers.get("referrer-policy"), app.headers.get("cache-control")], ["same-origin", "private, no-store"], "/app: same-origin, private");
    check(forwarded(app)?.has("x-cs-pathname") === false, "no x-cs-pathname on /app either");

    const kit = run("/kit/tok");
    check(isUi(kit), "/kit: platform UI");
    eq([kit.headers.get("referrer-policy"), kit.headers.get("cache-control")], ["no-referrer", "private, no-store"], "/kit: no-referrer, private (ENGC-16)");
    check((kit.headers.get("x-robots-tag") ?? "").startsWith("noindex"), "/kit: noindex");
    for (const path of ["/invite/tok", "/reset/tok", "/report/shop1", "/signup"]) {
      const res = run(path);
      check(isUi(res) && res.headers.get("referrer-policy") === "same-origin", `${path}: platform UI, same-origin (forms post before hydration)`);
    }
    const home = run("/");
    check(isUi(home), "marketing: nonce CSP");
    eq(home.headers.get("cache-control"), "public, max-age=0, s-maxage=300", "marketing: cacheable");
    eq(home.headers.get("x-robots-tag"), null, "marketing: indexable");
    check(home.headers.get("set-cookie") === null, "marketing: never a Set-Cookie (a public, cacheable answer)");

    // the device marker (SEC-12): every area-auth GET of the platform host without a well-formed one
    const login = run("/login");
    const sgd = login.headers.get("set-cookie") ?? "";
    check(DEVICE_COOKIE === "__Host-sgd" && new RegExp(`^__Host-sgd=[A-Za-z0-9_-]{22};`).test(sgd), `/login sets __Host-sgd (got ${sgd})`);
    check(/; Path=\/(;|$)/.test(sgd) && /; Secure(;|$)/.test(sgd) && /; HttpOnly(;|$)/.test(sgd) && /; SameSite=lax(;|$)/i.test(sgd) && !/Domain=/i.test(sgd), "__Host-sgd: Path=/, Secure, HttpOnly, SameSite=Lax, no Domain");
    check(/Max-Age=34560000/.test(sgd), "__Host-sgd lives 400 days");
    const kept = `__Host-sgd=${sgd.slice("__Host-sgd=".length, "__Host-sgd=".length + 22)}`;
    check(run("/signup", { cookie: kept }).headers.get("set-cookie") === null, "a well-formed marker is kept");
    check((run("/signup", { cookie: "__Host-sgd=short" }).headers.get("set-cookie") ?? "").startsWith("__Host-sgd="), "a malformed marker is replaced");
    check(run("/login", { method: "POST" }).headers.get("set-cookie") === null, "no marker on a POST (publicAction sets the fallback)");
    check(run("/app/shop1").headers.get("set-cookie") === null && run("/kit/tok").headers.get("set-cookie") === null, "no marker outside area auth");

    // §C.3 step 4 (CRIT2-11): an action POSTed with the literal Origin "null" → 403, never Next's 500
    const action = { method: "POST", headers: { "next-action": "7f1e", origin: "null" } };
    await expectNeutral(run("/invite/tok", action), "platform", "Next-Action with Origin: null", "POST", 403);
    await expectNeutral(run("/admin/settings", { ...action, cookie: gateCookie }), "platform", "console action with Origin: null", "POST", 403);
    check(isUi(run("/invite/tok", { method: "POST", headers: { "next-action": "7f1e" } })), "Next-Action without Origin passes (the wrapper refuses it, §C.9)");
    check(isUi(run("/invite/tok", { method: "POST", headers: { "next-action": "7f1e", origin: `https://${PLATFORM}` } })), "Next-Action with the platform Origin passes");
    check(isUi(run("/invite/tok", { method: "POST", headers: { origin: "null" } })), "Origin: null without Next-Action is not an action");

    // step 2: client copies of the internal headers never reach a handler on a direct request
    const sneaky = run("/s/shop1/promo", {
      headers: {
        "x-sg-host": STORE,
        "x-sg-ip": "198.51.100.66",
        "x-sg-proto": "https",
        "x-sg-worker": "w",
        "x-sg-ts": String(Date.now()),
        "x-sg-path": "/app/victim",
        "x-sg-path-sig": "forged",
        "x-sg-rid": "01ARZ3NDEKTSV4RRFFQ69G5FAV",
        "x-sg-anything": "1",
        "x-nonce": "n",
        "x-cs-pathname": "/admin",
      },
    });
    const sf = forwarded(sneaky)!;
    const leaked = [...sf.keys()].filter((k) => k.startsWith("x-sg-") && !Object.values(PATH_HEADERS).includes(k as never));
    eq(leaked, [], "every client-sent x-sg-* is deleted");
    eq(verifiedRequestPath(sf), "/s/shop1/promo", "x-sg-path is the proxy's own, signed");
    check(!sf.has("x-nonce") && !sf.has("x-cs-pathname"), "client x-nonce / x-cs-pathname deleted");

    // HSTS on every response the proxy produces or forwards (production), P mode: no includeSubDomains
    for (const res of [page, manifest, app, home, run("/admin"), run(`/${GATE}`)]) eq(stsOf(res), "max-age=63072000", "P mode HSTS");
  }

  withEnv(S_MODE, () => {
    for (const res of [run("/argan-oil"), run("/app/shop1"), run("/admin"), run(`/${GATE}`), run("/s/shop1")]) {
      eq(stsOf(res), "max-age=63072000; includeSubDomains", "S mode: HSTS includeSubDomains on the platform host (SEC-15)");
    }
    const stores = [viaEdge(STORE, "/promo"), viaEdge(STORE, "/admin"), viaEdge(STORE, "/s/shop1/x")];
    for (const res of stores) eq(stsOf(res), "max-age=63072000", "S mode: store hosts without includeSubDomains");
    eq(stsOf(run("/x", { host: LEGACY })), "max-age=63072000", "S mode: legacy host without includeSubDomains");
  });

  console.log("proxy: console host (ADMIN_HOST)");
  await withEnvAsync({ ADMIN_HOST: CONSOLE }, async () => {
    const legacyToken = withEnv({ ADMIN_HOST: undefined }, () => gate.issueGateToken());
    const opened = run(`/${GATE}`, { host: CONSOLE });
    const consoleToken = /^__Host-csg=([^;]+)/.exec(opened.headers.get("set-cookie") ?? "")?.[1] ?? "";
    check(opened.status === 303 && consoleToken.length > 0, "the gate opens on the console host");
    expectRedirect(opened, 303, `https://${CONSOLE}/admin`, "console", "console gate redirect");
    const cookie = `__Host-csg=${consoleToken}`;

    expectKind(run(`/${GATE}`), "next", "the gate path on the platform host is an ordinary path");
    expectKind(run("/admin/orders/export", { cookie }), "404", "the console on the platform host, even with a gate cookie");
    expectKind(run("/admin", { cookie, headers: { "x-forwarded-host": CONSOLE } }), "404", "a forged X-Forwarded-Host cannot reach the console");
    expectKind(run("/%61dmin", { cookie }), "404", "encoded /admin on the platform host");
    expectKind(run("/admin", { host: "127.0.0.1:3000", headers: { "x-forwarded-host": CONSOLE }, cookie }), "next", "proxy-rewritten Host with X-Forwarded-Host = the console");

    check(isUi(run("/admin/orders/export", { host: CONSOLE, cookie })), "console: gated /admin");
    check(isUi(run("/api/admin/media/x", { host: CONSOLE, cookie, method: "POST" })), "console: gated admin API");
    expectKind(run("/admin", { host: CONSOLE }), "404", "console: no gate cookie");
    expectKind(run("/admin", { host: CONSOLE, cookie: `__Host-csg=${legacyToken}` }), "404", "console: a gate cookie from before ADMIN_HOST");
    expectKind(run(`/${GATE}`, { host: CONSOLE, method: "POST" }), "404", "console: the gate with POST");
    check(isUi(run("/login", { host: CONSOLE })), "console: staff sign in where the console is");
    check(run("/login", { host: CONSOLE }).headers.get("set-cookie") === null, "console: no device marker (platform host only)");
    for (const path of ["/", "/argan-oil", "/s/shop1/x", "/app/shop1", "/api/cron/tick", "/robots.txt", "/kit/tok"]) {
      expectKind(run(path, { host: CONSOLE }), "404", `console: ${path} for a stranger`);
      expectKind(run(path, { host: CONSOLE, cookie }), "redirect", `console: ${path} for a gated browser goes to the platform`);
    }
    expectRedirect(run("/argan-oil?utm=x", { host: CONSOLE, cookie }), 307, `https://${PLATFORM}/argan-oil?utm=x`, "console", "console → platform keeps path and query");
    const twisted = run("//evil.example/x", { host: CONSOLE, cookie }).headers.get("location") ?? "";
    check(new URL(twisted).host === PLATFORM, `a "//host" path never leaves the platform host (got ${twisted})`);
    expectKind(run("/api/public/order", { host: CONSOLE, method: "POST" }), "404", "console: the order API");
    expectKind(run("/api/public/order", { host: CONSOLE, method: "POST", cookie }), "404", "console: the order API, gated");
    expectKind(run("/_next/webpack-hmr", { host: CONSOLE }), "next", "console: framework paths pass");
    await expectNeutral(run("/invite/tok", { host: CONSOLE, method: "POST", headers: { "next-action": "1", origin: "null" } }), "console", "console: Origin: null action 403", "POST", 403);
  });

  console.log("proxy: legacy host");
  await withEnvAsync(S_MODE, async () => {
    const L = { host: LEGACY };
    const store = run("/s/shop1/promo?x=1", { ...L, cookie: "cs=1" });
    expectKind(store, "next", "legacy: /s/<h>/… passes to the store route (it 308s to the canonical URL)");
    check(forwarded(store)?.has("cookie") === false, "legacy: store paths cookie-less");
    expectKind(run("/api/cron/tick?key=k", L), "next", "legacy: the cron tick (until the hPanel line moves)");
    expectKind(run("/api/health", L), "next", "legacy: /api/health");
    expectKind(run("/api/public/order", { ...L, method: "POST" }), "next", "legacy: POST /api/public/order");
    expectKind(run("/api/public/order", { ...L, method: "OPTIONS" }), "next", "legacy: the order API's preflight");
    const query = "?fbclid=IwAR0x_y-Z9&utm_source=fb&utm_campaign=%D8%B9%D8%B1%D8%B6+x%20y&&empty=&q=a%2Fb";
    expectRedirect(run(`/argan${query}`, L), 308, `https://${PLATFORM}/argan${query}`, "legacy", "legacy: GET → 308 to the platform, query byte for byte");
    expectRedirect(run("/app/shop1/orders", L), 308, `https://${PLATFORM}/app/shop1/orders`, "legacy", "legacy: /app → 308");
    expectRedirect(run("/login", L), 308, `https://${PLATFORM}/login`, "legacy", "legacy: /login → 308");
    expectRedirect(run("/", { ...L, method: "HEAD" }), 308, `https://${PLATFORM}/`, "legacy", "legacy: HEAD / → 308");
    const evil = run("//evil.example/x", L).headers.get("location") ?? "";
    check(new URL(evil).host === PLATFORM, `legacy: a "//host" path stays on the platform host (got ${evil})`);
    for (const [path, method] of [["/admin", "GET"], ["/api/admin/x", "POST"], ["/preview/tok", "GET"], ["/d/x/y", "GET"], ["/api/v1/orders", "GET"], [`/${GATE}`, "GET"], ["/argan", "POST"], ["/s/shop1/x", "POST"], ["/api/cron/other", "POST"]] as const) {
      await expectNeutral(run(path, { ...L, method }), "legacy", `legacy: ${method} ${path} → 404`, method);
    }
  });

  console.log("proxy: store host (S mode, through the Worker)");
  await withEnvAsync(S_MODE, async () => {
    const home = viaEdge(STORE, "/", { cookie: "cs=session" });
    expectKind(home, "rewrite", "store: / is rewritten");
    eq(rewriteTarget(home), "/s/shop1", "store home rewrite has no trailing slash (ENGC-15)");
    eq(rewriteTarget(viaEdge(STORE, "/promo?utm_source=tt&ttclid=E.C.P")), "/s/shop1/promo?utm_source=tt&ttclid=E.C.P", "store: path + raw query");
    eq(rewriteTarget(viaEdge(STORE, "/promo/merci")), "/s/shop1/promo/merci", "store: thank-you page");
    eq(rewriteTarget(viaEdge(STORE, "/robots.txt")), "/s/shop1/robots.txt", "store: robots.txt is the store's");
    eq(rewriteTarget(viaEdge(STORE, "/terms")), "/s/shop1/terms", "store: marketing paths are store paths");
    eq(rewriteTarget(viaEdge(STORE, "/", { method: "HEAD" })), "/s/shop1", "store: HEAD /");
    const hf = forwarded(home)!;
    check(!hf.has("cookie"), "store: the Cookie header is deleted");
    for (const name of ["x-sg-edge", "x-sg-host", "x-sg-ip", "x-sg-proto", "x-sg-worker", "x-sg-ts"]) check(hf.has(name), `store: the Worker's ${name} is kept so handlers re-verify (D18)`);
    eq(effectiveHost(hf).cls, "store", "store: the handler's own effectiveHost() re-verifies the forwarded set");
    eq(verifiedRequestPath(hf), "/", "store: x-sg-path is the browser's path");
    const extra = forwarded(viaEdge(STORE, "/x", { headers: { "x-sg-evil": "1", "x-sg-path": "/app/victim" } }))!;
    check(!extra.has("x-sg-evil") && verifiedRequestPath(extra) === "/x", "store: other x-sg-* deleted even when the edge verified");
    check(home.headers.get("set-cookie") === null, "store: no Set-Cookie");

    expectRedirect(viaEdge(STORE, "/s/shop1/promo?x=1&fbclid=a"), 308, `https://${STORE}/promo?x=1&fbclid=a`, "store", "store: own /s/<h>/x → 308 /x (D17)");
    expectRedirect(viaEdge(STORE, "/s/shop1"), 308, `https://${STORE}/`, "store", "store: own /s/<h> → 308 /");
    expectRedirect(viaEdge(STORE, "/S/SHOP1/Promo"), 308, `https://${STORE}/Promo`, "store", "store: case-folded own handle keeps the rest");
    await expectNeutral(viaEdge(STORE, "/s/other/promo"), "store", "store: another store's /s/ path");
    await expectNeutral(viaEdge(STORE, "/s/shop1/promo", { method: "POST" }), "store", "store: POST /s/<h>/… never redirects", "POST");

    const refused: Array<[string, string, Record<string, string>?]> = [
      ["/", "POST", { "next-action": "7f1e", origin: `https://${STORE}` }],
      ["/promo", "POST", { "next-action": "7f1e" }],
      ["/", "PUT"],
      ["/", "DELETE"],
      ["/", "PATCH"],
      ["/admin", "GET"],
      ["/%61dmin", "GET"],
      ["/api/admin/media/x", "POST"],
      ["/app/shop1", "GET"],
      ["/api/app/shop1/orders", "GET"],
      ["/login", "GET"],
      ["/signup", "GET"],
      ["/invite/tok", "GET"],
      ["/reset/tok", "GET"],
      ["/report/shop1", "GET"],
      ["/kit/tok", "GET"],
      ["/d/shop.ma/x", "GET"],
      ["/preview/tok", "GET"],
      ["/api/v1/orders", "GET"],
      ["/api/cron/tick", "GET"],
      [`/${GATE}`, "GET"],
    ];
    for (const [path, method, headers] of refused) await expectNeutral(viaEdge(STORE, path, { method, headers }), "store", `store: ${method} ${path} → 404`, method);

    const order = viaEdge(STORE, "/api/public/order", { method: "POST", cookie: "cs=1" });
    expectKind(order, "next", "store: POST /api/public/order passes");
    check(forwarded(order)?.has("cookie") === false, "store: public API cookie-less");
    expectKind(viaEdge(STORE, "/api/public/order", { method: "OPTIONS" }), "next", "store: OPTIONS (CORS preflight) passes");
  });

  console.log("proxy: reserved, invalid, foreign");
  await withEnvAsync(S_MODE, async () => {
    resetProxyLog();
    await expectNeutral(viaEdge("www.storegen.example", "/"), "reserved", "reserved label www");
    await expectNeutral(viaEdge("admin.storegen.example", "/login"), "reserved", "reserved label admin");
    await expectNeutral(viaEdge("a.b.storegen.example", "/"), "invalid", "deeper label through the edge");
    await expectNeutral(run("/", { host: "a.b.storegen.example" }), "invalid", "deeper label direct");
    await expectNeutral(run("/login", { host: "203.0.113.9" }), "invalid", "an IP literal Host in production");
    // SEC-4: a wrong key must never be served as the platform (it would put /login on every tenant hostname)
    const before = edgeTally().badKeyMinute;
    await expectNeutral(run("/login", { headers: workerHeaders(STORE, { key: "edgeKeyForged-0000aaaa1111bbbb2222cccc3333dd" }) }), "invalid", "a present-but-wrong x-sg-edge on the platform host");
    await expectNeutral(run("/signup", { headers: workerHeaders(STORE, { ts: Date.now() - 10 * 60_000 }) }), "invalid", "a replayed (stale) Worker header set");
    await expectNeutral(run("/", { headers: { "x-sg-edge": EDGE_KEY } }), "invalid", "the right key without a timestamp");
    eq(edgeTally().badKeyMinute - before, 3, "bad_key counted per request");
    eq(warned.filter((w) => w.includes("bad_key")).length, 1, "bad_key logged once a minute");
    await expectNeutral(run("/", { host: STORE }), "foreign", "a store host reached directly (no Worker)");
    run("/", { host: "evil.example.org" });
    run("/x", { host: "evil.example.org" });
    eq(warned.filter((w) => w.includes("evil.example.org")).length, 1, "a foreign host is logged once");
    check(edgeTally().verifiedAt !== null, "the last edge-verified request is recorded");
  });
  withEnv({ ...S_MODE, EDGE_KEY_PREV }, () => {
    viaEdge(STORE, "/", { edge: { key: EDGE_KEY_PREV } });
    viaEdge(STORE, "/x", { edge: { key: EDGE_KEY_PREV } });
    check(edgeTally().prevKeyAt !== null && warned.filter((w) => w.includes("prev_key")).length === 1, "prev_key recorded and logged once an hour");
  });

  // ENGC-22: the proxy's 404 is byte-identical to a route's 404 on the same host class
  console.log("header sets (ENGC-22)");
  for (const [label, vars, res, routeHeaders] of [
    ["platform, P mode", {}, () => run("/admin"), () => new Headers({ host: PLATFORM })],
    ["platform, S mode", S_MODE, () => run("/admin"), () => new Headers({ host: PLATFORM })],
    ["store host", S_MODE, () => viaEdge(STORE, "/admin"), () => forwarded(viaEdge(STORE, "/missing"))!],
    ["legacy host", S_MODE, () => run("/admin", { host: LEGACY }), () => new Headers({ host: LEGACY })],
  ] as const) {
    await withEnvAsync(vars, async () => {
      const proxied = res();
      const route = unknownPageResponse("GET", routeHeaders());
      check(sorted(visible(proxied)) === sorted(visible(route)), `${label}: proxy 404 headers ≡ route 404 headers`);
      check((await proxied.text()) === (await route.text()), `${label}: proxy 404 body ≡ route 404 body`);
    });
  }

  /* ------------------------------------------------------------------ 6. ADMIN_HOST parsing, request host, gate re-check */
  console.log("ADMIN_HOST parsing (from host-selftest)");
  const parsed: Array<[string | undefined, string | null]> = [
    [undefined, null],
    ["", null],
    [CONSOLE, CONSOLE],
    ["  https://Console.StoreGen.EXAMPLE/ ", CONSOLE],
    ["https://console.storegen.example:443", CONSOLE],
    ["console.storegen.example.", CONSOLE],
    ["http://studio.localhost:3400", "studio.localhost:3400"],
    ["console.storegen.example/admin", null],
    ["https://console.storegen.example/admin", null],
    ["https://user@console.storegen.example", null],
    ["ftp://console.storegen.example", null],
    ["127.0.0.1", null],
    ["[::1]:3400", null],
    ["localhost:3400", null],
    ["console storegen.example", null],
  ];
  for (const [value, want] of parsed) {
    withEnv({ ADMIN_HOST: value }, () => {
      eq(config.adminHost(), want, `adminHost(${JSON.stringify(value)})`);
      eq(edgeEnv.adminHostName(), want, `adminHostName(${JSON.stringify(value)}) ≡ adminHost`);
    });
  }
  withEnv({ PUBLIC_URL: `https://${PLATFORM}`, ADMIN_HOST: PLATFORM }, () => {
    eq(config.adminHost(), null, "ADMIN_HOST equal to the platform host is refused");
    check(config.authConfigWarnings().some((w) => w.startsWith("ADMIN_HOST must be a host of its own")), "…and reported at boot");
  });
  withEnv({ ADMIN_HOST: "not a host/" }, () => {
    check(config.authConfigWarnings().some((w) => w.startsWith("ADMIN_HOST is not a valid host name")), "an invalid ADMIN_HOST is reported at boot");
  });

  console.log("request host");
  const h = (init: Record<string, string>) => new Headers(init);
  eq(gate.requestHost(h({ host: PLATFORM, "x-forwarded-host": CONSOLE })), PLATFORM, "a script-sent X-Forwarded-Host never overrides a real Host");
  eq(gate.requestHost(h({ host: "127.0.0.1:3000", "x-forwarded-host": `evil.example.org, ${CONSOLE}` })), CONSOLE, "internal Host → the right-most X-Forwarded-Host");
  eq(gate.requestHost(h({ host: "localhost:3000", "x-forwarded-host": CONSOLE })), CONSOLE, "localhost Host → X-Forwarded-Host");
  eq(gate.requestHost(h({ host: "localhost:3000" })), "localhost:3000", "internal Host without X-Forwarded-Host stays itself");
  eq(gate.requestHost(h({ host: "Console.StoreGen.example:443" })), CONSOLE, "Host is normalised (case, default port)");
  eq(effectiveHost(h({ host: "127.0.0.1:3000", "x-forwarded-host": PLATFORM })).cls, "platform", "effectiveHost behind Hostinger's proxy (internal Host + X-Forwarded-Host)");

  console.log("in-app gate re-check");
  withEnv({ ADMIN_HOST: CONSOLE }, () => {
    const t = gate.issueGateToken();
    const legacyT = withEnv({ ADMIN_HOST: undefined }, () => gate.issueGateToken());
    check(gate.hasGateAccess(t, h({ host: CONSOLE })), "hasGateAccess: console host + cookie");
    check(!gate.hasGateAccess(t, h({ host: PLATFORM })), "hasGateAccess: the platform host is refused");
    check(!gate.hasGateAccess(t, h({ host: PLATFORM, "x-forwarded-host": CONSOLE })), "hasGateAccess: a forged X-Forwarded-Host is refused");
    check(!gate.hasGateAccess(legacyT, h({ host: CONSOLE })), "hasGateAccess: a cookie from before ADMIN_HOST is refused");
    check(!gate.hasGateAccess(t, h({ host: LEGACY })), "hasGateAccess (ADMIN_HOST): a legacy host is refused");
  });
  {
    // CCR r1.0-t3-2: the re-check decides on the effective host class, never wider than the proxy
    const shared = gate.issueGateToken();
    check(!gate.hasGateAccess(shared, h({ host: LEGACY })), "shared origin: a legacy host is refused");
    check(!gate.hasGateAccess(shared, h({ host: "foreign.example.org" })), "shared origin: a foreign host is refused");
    check(!gate.hasGateAccess(shared, h({ host: STORE })), "shared origin: a store host addressed directly is refused");
    withEnv(S_MODE, () => {
      check(!gate.hasGateAccess(shared, h({ host: PLATFORM, ...workerHeaders(STORE) })), "shared origin: a store host through the Worker is refused");
      check(!gate.hasGateAccess(shared, h({ host: PLATFORM, ...workerHeaders(STORE, { key: "wrong-key-wrong-key-wrong-key-00" }) })), "shared origin: an unverifiable edge (invalid) is refused");
    });
  }
  {
    const shared = gate.issueGateToken();
    check(gate.hasGateAccess(shared, h({ host: PLATFORM })), "shared origin: hasGateAccess on the platform host");
    const bound = withEnv({ ADMIN_HOST: CONSOLE }, () => gate.issueGateToken());
    check(!gate.hasGateAccess(bound, h({ host: PLATFORM })), "shared origin: a cookie bound to ADMIN_HOST opens nothing");
  }

  /* ------------------------------------------------------------------ 7. URL builders (§C.6) */
  console.log("URL builders");
  {
    const urls = await import("@/lib/urls");
    const shop = { id: "st_1", handle: "shop1" };
    eq(urls.addressMode(shop), "P", "P mode while S mode is off");
    eq(urls.storeUrl(shop), `https://${PLATFORM}/s/shop1`, "P: the store home has no trailing slash (ENGC-15)");
    eq(urls.storePath(shop, "/"), "/s/shop1", "P: storePath of the home");
    eq(urls.storeUrl(shop, "/promo"), `https://${PLATFORM}/s/shop1/promo`, "P: a page");
    eq(urls.mediaUrl(shop, "a b.webp"), "/media/a%20b.webp", "P: media is relative");
    eq([...urls.storeHosts(shop)], [PLATFORM, LEGACY], "P: the store's hosts are the platform and legacy hosts");
    eq(urls.addressMode({ ...shop, primaryDomain: "shop.ma" }), "P", "a custom domain is ignored before R3");
    withEnv(S_MODE, () => {
      eq(urls.addressMode(shop), "S", "S mode: STORE_ROOT_DOMAIN + EDGE_KEY");
      eq(urls.storeUrl(shop), `https://${STORE}/`, "S: the store home");
      eq(urls.storeBase(shop), "", "S: no path prefix");
      eq(urls.mediaUrl(shop, "k.webp"), `https://${PLATFORM}/media/k.webp`, "S: media from the platform origin");
      eq([...urls.storeHosts(shop)], [PLATFORM, STORE, LEGACY], "S: platform, subdomain, legacy");
    });
    eq([urls.consoleHref(), urls.consoleHref("/stores")], ["/admin", "/admin/stores"], "consoleHref without ADMIN_HOST");
    withEnv({ ADMIN_HOST: CONSOLE }, () => eq(urls.consoleHref("/stores"), `https://${CONSOLE}/admin/stores`, "consoleHref with ADMIN_HOST"));
    eq([urls.appHref("shop1"), urls.appHref("shop1", "/orders"), urls.apiHref("shop1", "/orders")], ["/app/shop1", "/app/shop1/orders", "/api/app/shop1/orders"], "appHref / apiHref");
    eq(urls.previewUrl("t/x"), `https://${PLATFORM}/preview/t%2Fx`, "previewUrl encodes the token");
    eq(urls.reportUrl(shop), `https://${PLATFORM}/report/shop1`, "reportUrl without a page");
    eq(urls.reportUrl(shop, "/s/shop1/promo?fbclid=1#top"), `https://${PLATFORM}/report/shop1?p=%2Fs%2Fshop1%2Fpromo`, "reportUrl drops the query and the fragment");
    eq(decodeURIComponent(urls.reportUrl(shop, `/${"a".repeat(400)}`).split("?p=")[1] ?? "").length, 300, "reportUrl caps the page path at 300 characters");
  }

  /* ------------------------------------------------------------------ 8. development mode */
  console.log("development mode (child process)");
  const child = spawnSync(process.execPath, [...process.execArgv, process.argv[1]!], {
    env: { ...process.env, SG_TEST_HOSTS_DEV: "1", NODE_ENV: "development" },
    encoding: "utf8",
    timeout: 60_000,
  });
  const out = `${child.stdout ?? ""}${child.stderr ?? ""}`.trim();
  if (out) console.log(out.replace(/^/gm, "  "));
  check(child.status === 0, `development checks (exit ${child.status}${child.error ? `, ${child.error.message}` : ""})`);

  console.warn = warn;

  /* ---------------------------------------------------------------- dev child */
  function devChecks(): void {
    for (const local of ["localhost:3450", "127.0.0.1:3450", "192.168.1.20:3450", "[::1]:3450"]) {
      eq(effectiveHost(new Headers({ host: local })).cls, "platform", `dev: ${local} is the platform with a production PLATFORM_URL set`);
    }
    withEnv({ PLATFORM_URL: undefined }, () => eq(effectiveHost(new Headers({ host: "localhost:3450" })).cls, "platform", "dev: localhost is the platform with no PLATFORM_URL"));
    eq(effectiveHost(new Headers({ host: "evil.example.org" })).cls, "foreign", "dev: a real foreign host stays foreign");
    withEnv(S_MODE, () => {
      const edgeLocal = new Headers({ host: "localhost:3450", ...workerHeaders("localhost") });
      check(effectiveHost(edgeLocal).cls !== "platform", "dev: the local rule is for direct requests only");
    });
    const res = run("/login", { host: "localhost:3450" });
    check(isUi(res), "dev: /login on localhost is platform UI");
    check((res.headers.get("set-cookie") ?? "").startsWith("sgd=") && !/Secure/.test(res.headers.get("set-cookie") ?? ""), "dev: the device marker is `sgd`, not Secure (http://localhost)");
    check(stsOf(res) === null && stsOf(run("/argan", { host: "localhost:3450" })) === null, "dev: no HSTS");
    check((run(`/${GATE}`, { host: "localhost:3450" }).headers.get("set-cookie") ?? "").startsWith("csg="), "dev: the gate cookie is `csg`");
  }
}

main().then(
  () => {
    if (DEV_CHILD) {
      if (failures) console.error(`✗ ${failures} of ${checks} development checks failed`);
      else console.log(`✓ ${checks} development checks passed`);
      process.exit(failures === 0 ? 0 : 1);
    }
    console.log(failures === 0 ? `\n✓ ${checks} checks passed` : `\n✗ ${failures} of ${checks} checks failed`);
    process.exit(failures === 0 ? 0 : 1);
  },
  (err: unknown) => {
    console.error(err);
    process.exit(1);
  },
);
