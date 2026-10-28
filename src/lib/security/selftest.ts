/**
 * test:security (docs/STORE-SAAS.md §J.1; the offline parts, no database, no Next server):
 *   npm run test:security      (tsx src/lib/security/selftest.ts; exit code 1 on any failure)
 *
 *  1. clientIp: X-Forwarded-For walked from the right (internal hops skipped, TRUSTED_PROXY_HOPS public hops
 *     counted, client-sent entries never picked), X-Real-IP fallback, Cloudflare only from a Cloudflare hop, and
 *     the Worker's x-sg-ip only when the edge verifies (§C.2: forged, wrong-key and stale sets ignored).
 *  2. clientIpReport: hop numbering and the "used" entry shown in Settings → Security.
 *  3. burstLimit: per-network windows, reset, bounded memory.
 *  4. CSRF strict same-origin (§C.9, SEC-11): Sec-Fetch-Site same-origin AND an Origin of the platform or console
 *     host the request was sent to; a missing Origin, "null", same-site, store / legacy / foreign hosts and a
 *     reflected X-Forwarded-Host are refused.
 *  5. Header sets (§F.6): base, platform UI per area (kit no-referrer, marketing cacheable), redirects, HSTS per
 *     host class (SEC-15).
 *  6. The neutral 404 / 410 / 503: one header set (nosniff, DENY, no-referrer, COOP / CORP, the hash CSP of the
 *     page's one inline style, HSTS), an empty body for every method but GET, never re-encoded.
 *  7. documentOrigins (production): the landing CSP only names PUBLIC_URL's host and its www twin;
 *     X-Forwarded-Host / a foreign Host never get in.
 *  8. Served store documents (§C.9, SEC-2): every kind (landing, thank-you, legal, test, preview) on the platform,
 *     legacy and store (Worker) hosts carries no bare 'self' and no bare app origin in connect-src / form-action,
 *     only `<serving origin>/api/public/` plus the pixel hosts; with no usable origin the same-origin part is dropped.
 *  9. Web storage on the shared origin (§C.9, LND-12 … 14): the runtime's storage names carry the store under
 *     /s/<handle> (one derivation, core skey), so two stores' UTM, visitor id, order hand-off and hashed
 *     advanced-matching data never meet; outside /s/ today's names stay.
 * 10. The test seams (§H.7, P0b CCR P5-6 / P7-9; ./test-seams): the truth table of every guard (the flag, an https
 *     origin, a non-loopback host, credentials or a path in the URL, a database not cod_test_, the boolean seams'
 *     own value and the app origin), on with every guard in production and in any NODE_ENV, off with one missing;
 *     testSeam() computed per call and logging one refusal line per process and seam, never a value.
 * The export allow-list rule (`originAllowed`, SEC-23) is proven by test:public-api; T2's `allowlistAddress()` behind
 * Cloudflare (SEC-14) and `p:login:acct` (SEC-22) join when their code merges.
 */
import Module from "node:module";
import type { PlatformUiArea } from "./headers";

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
// IS_PROD (auth/config, unknown-page) is read once, at import: set before the dynamic imports below
env.NODE_ENV = "production";
env.APP_SECRET = "securitySelftest-4Hq8Zr2Wm6Tn1Vb9Lx3Pd7Ks0Jf5Gc";
env.PLATFORM_URL = "https://storegen.example";
for (const name of ["PUBLIC_URL", "ADMIN_HOST", "STORE_ROOT_DOMAIN", "EDGE_KEY", "EDGE_KEY_PREV", "LEGACY_PLATFORM_HOSTS", "BEHIND_CLOUDFLARE", "TRUSTED_PROXY_HOPS"]) delete env[name];

const PLATFORM = "storegen.example";
const CONSOLE = "console.storegen.example";
const STORE = "shop1.storegen.example";
const LEGACY = "legacy-host.example.net";
const EDGE_KEY = "edgeKeySecurity-6pR2nW8vK4mT1xC7bL3hJ9dF5gQ0z";

let failures = 0;
let passes = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) passes++;
  else {
    failures++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
function eq<T>(name: string, actual: T, expected: T): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  check(name, a === e, `got ${a}, expected ${e}`);
}

function withEnv(vars: Record<string, string | undefined>, fn: () => void): void {
  const prev: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    prev[k] = env[k];
    if (v === undefined) delete env[k];
    else env[k] = v;
  }
  try {
    fn();
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete env[k];
      else env[k] = v;
    }
  }
}

const xff = (value: string, extra: Record<string, string> = {}) => new Headers({ "x-forwarded-for": value, ...extra });
/** the six headers of a Worker subrequest (§C.5) */
const worker = (o: { key?: string; ts?: number; ip?: string } = {}) => ({
  host: PLATFORM,
  "x-sg-host": STORE,
  "x-sg-edge": o.key ?? EDGE_KEY,
  "x-sg-ip": o.ip ?? "203.0.113.77",
  "x-sg-proto": "https",
  "x-sg-worker": "w-1",
  "x-sg-ts": String(o.ts ?? Date.now()),
});

async function main(): Promise<void> {
  const { BURST_LIMITS, burstLimit, resetBurstLimits } = await import("./burst-limit");
  const { clientIp, clientIpReport, isInternalIp } = await import("./ip");
  const { CsrfError, assertSameOrigin, checkSameOrigin } = await import("./csrf");
  const headersMod = await import("./headers");
  const unknown = await import("@/lib/auth/unknown-page");

  /* 1. clientIp ------------------------------------------------------------------------------- */
  console.log("clientIp");
  for (const [ip, internal] of [
    ["10.0.0.7", true],
    ["172.16.0.1", true],
    ["172.31.255.255", true],
    ["172.32.0.1", false],
    ["192.168.1.1", true],
    ["127.0.0.1", true],
    ["169.254.10.1", true],
    ["100.64.0.1", true],
    ["100.127.255.255", true],
    ["100.128.0.1", false],
    ["0.0.0.0", true],
    ["::1", true],
    ["::", true],
    ["fd12:3456::1", true],
    ["fe80::1%eth0", true],
    ["::ffff:10.0.0.1", true],
    ["2001:db8::1", false],
    ["203.0.113.5", false],
    ["not-an-ip", false],
  ] as const) {
    check(`isInternalIp(${ip}) = ${internal}`, isInternalIp(ip) === internal);
  }

  withEnv({ TRUSTED_PROXY_HOPS: undefined, BEHIND_CLOUDFLARE: "0" }, () => {
    eq("one hop: the connecting address", clientIp(xff("203.0.113.5")), "203.0.113.5");
    eq("client-sent entries on the left are ignored", clientIp(xff("1.1.1.1, 8.8.8.8, 203.0.113.5")), "203.0.113.5");
    eq("client-sent private entries are ignored", clientIp(xff("10.1.1.1, 203.0.113.5")), "203.0.113.5");
    eq("internal proxy hop on the right is skipped", clientIp(xff("203.0.113.5, 10.0.0.7")), "203.0.113.5");
    eq("several internal hops are skipped", clientIp(xff("6.6.6.6, 203.0.113.5, 10.0.0.7, 127.0.0.1")), "203.0.113.5");
    eq("IPv6 visitor behind an internal IPv6 hop", clientIp(xff("2001:db8::1, fd00::2")), "2001:db8::1");
    eq("IPv4-mapped internal hop is skipped", clientIp(xff("203.0.113.5, ::ffff:10.0.0.1")), "203.0.113.5");
    eq("brackets / ports are canonicalised", clientIp(xff("[2001:db8::1]:443")), "2001:db8::1");
    eq("only internal entries: the nearest one (local / in-network caller)", clientIp(xff("10.0.0.1, 127.0.0.1")), "127.0.0.1");
    eq("a public CDN hop with TRUSTED_PROXY_HOPS=1 is what the app sees", clientIp(xff("203.0.113.5, 198.51.100.9")), "198.51.100.9");
    eq("X-Real-IP when X-Forwarded-For is absent", clientIp(new Headers({ "x-real-ip": "203.0.113.9" })), "203.0.113.9");
    eq("nothing sent", clientIp(new Headers()), "0.0.0.0");
  });

  withEnv({ TRUSTED_PROXY_HOPS: "2", BEHIND_CLOUDFLARE: "0" }, () => {
    eq("hops=2: visitor in front of a public CDN hop", clientIp(xff("203.0.113.5, 198.51.100.9")), "203.0.113.5");
    eq("hops=2: client-sent entries still ignored", clientIp(xff("6.6.6.6, 203.0.113.5, 198.51.100.9")), "203.0.113.5");
    eq("hops=2: internal hops not counted", clientIp(xff("6.6.6.6, 203.0.113.5, 198.51.100.9, 10.0.0.2")), "203.0.113.5");
    eq("hops=2 but one public entry: that entry", clientIp(xff("203.0.113.5, 10.0.0.2")), "203.0.113.5");
  });

  withEnv({ TRUSTED_PROXY_HOPS: "0", BEHIND_CLOUDFLARE: "0" }, () => {
    eq("invalid TRUSTED_PROXY_HOPS falls back to 1", clientIp(xff("6.6.6.6, 203.0.113.5")), "203.0.113.5");
  });

  withEnv({ TRUSTED_PROXY_HOPS: undefined, BEHIND_CLOUDFLARE: "1" }, () => {
    eq("Cloudflare hop → CF-Connecting-IP", clientIp(xff("203.0.113.5, 172.68.1.2", { "cf-connecting-ip": "203.0.113.5" })), "203.0.113.5");
    eq(
      "Cloudflare hop behind an internal proxy → CF-Connecting-IP",
      clientIp(xff("203.0.113.5, 172.68.1.2, 10.0.0.3", { "cf-connecting-ip": "203.0.113.5" })),
      "203.0.113.5",
    );
    eq("forged CF-Connecting-IP straight to the origin is ignored", clientIp(xff("198.51.100.7", { "cf-connecting-ip": "203.0.113.5" })), "198.51.100.7");
  });

  // the Store Gen Worker (S mode): x-sg-ip only when x-sg-edge + x-sg-ts verify (§C.2, D18)
  withEnv({ EDGE_KEY, TRUSTED_PROXY_HOPS: undefined, BEHIND_CLOUDFLARE: "1" }, () => {
    const hop = "172.68.1.2"; // the Worker's subrequest reaches the origin through Cloudflare
    eq("verified Worker headers → x-sg-ip", clientIp(xff(hop, { ...worker({ ip: "203.0.113.77" }), "cf-connecting-ip": "172.70.0.9" })), "203.0.113.77");
    eq("verified Worker headers → IPv6 x-sg-ip canonicalised", clientIp(xff(hop, worker({ ip: "[2001:DB8::7]" }))), "2001:db8::7");
    eq("x-sg-ip without x-sg-edge is ignored", clientIp(xff("198.51.100.7", { "x-sg-ip": "203.0.113.77", "x-sg-ts": String(Date.now()) })), "198.51.100.7");
    eq("x-sg-ip with a wrong key is ignored", clientIp(xff("198.51.100.7", worker({ key: "edgeKeyForged-1111aaaa2222bbbb3333cccc4444dd" }))), "198.51.100.7");
    eq("x-sg-ip with a stale x-sg-ts is ignored", clientIp(xff("198.51.100.7", worker({ ts: Date.now() - 6 * 60_000 }))), "198.51.100.7");
    eq("a verified set with a malformed x-sg-ip falls back to the hop rules", clientIp(xff("198.51.100.7", worker({ ip: "not-an-ip" }))), "198.51.100.7");
    const r = clientIpReport(xff(hop, worker({ ip: "203.0.113.77" })));
    eq("report: viaEdge / viaCloudflare / clientIp", [r.viaEdge, r.viaCloudflare, r.clientIp], [true, true, "203.0.113.77"]);
  });
  withEnv({ EDGE_KEY: undefined, TRUSTED_PROXY_HOPS: undefined, BEHIND_CLOUDFLARE: "0" }, () => {
    eq("no EDGE_KEY on the server: x-sg-ip never trusted", clientIp(xff("198.51.100.7", worker())), "198.51.100.7");
  });

  /* 2. clientIpReport ------------------------------------------------------------------------- */
  console.log("clientIpReport");
  withEnv({ TRUSTED_PROXY_HOPS: "2", BEHIND_CLOUDFLARE: "0" }, () => {
    const r = clientIpReport(xff("6.6.6.6, 203.0.113.5, 198.51.100.9, 10.0.0.2"));
    eq("report: client ip", r.clientIp, "203.0.113.5");
    eq(
      "report: hops numbered from the right, internal ones unnumbered",
      r.hops.map((h) => [h.value, h.publicHop, h.internal, h.used]),
      [
        ["6.6.6.6", 3, false, false],
        ["203.0.113.5", 2, false, true],
        ["198.51.100.9", 1, false, false],
        ["10.0.0.2", null, true, false],
      ],
    );
    eq("report: trusted hops", r.trustedHops, 2);
    eq("report: not via the edge", r.viaEdge, false);
    const long = clientIpReport(xff(Array.from({ length: 20 }, (_, i) => `198.51.100.${i + 1}`).join(", ")));
    eq("report: at most 12 entries, the right-most", [long.hops.length, long.hops[0]?.value, long.hops.at(-1)?.publicHop], [12, "198.51.100.9", 1]);
    check("report: the used entry is inside the shown window", long.hops.some((h) => h.used));
  });

  /* 3. burstLimit ------------------------------------------------------------------------------ */
  console.log("burstLimit");
  {
    resetBurstLimits();
    const t0 = 1_000_000;
    const { limit, windowSec } = BURST_LIMITS.upsell;
    let last = burstLimit("upsell", "203.0.113.5", t0);
    for (let i = 1; i < limit; i++) last = burstLimit("upsell", "203.0.113.5", t0 + i);
    check("upsell: the limit itself passes", last.ok);
    const over = burstLimit("upsell", "203.0.113.5", t0 + limit);
    check("upsell: one over the limit is refused", !over.ok && over.retryAfter >= 1 && over.retryAfter <= windowSec);
    check("another network is not affected", burstLimit("upsell", "203.0.113.6", t0 + limit).ok);
    check("another scope is not affected", burstLimit("lead", "203.0.113.5", t0 + limit).ok);
    check("a new window starts after windowSec", burstLimit("upsell", "203.0.113.5", t0 + windowSec * 1000 + 1).ok);
    // one IPv6 /64 is one network
    resetBurstLimits();
    for (let i = 0; i < BURST_LIMITS.lead.limit; i++) burstLimit("lead", `2001:db8:1:2::${(i + 1).toString(16)}`, t0);
    check("IPv6 addresses of one /64 share a window", !burstLimit("lead", "2001:db8:1:2::ffff", t0).ok);
    // memory stays bounded under a flood of distinct networks
    resetBurstLimits();
    for (let i = 0; i < 25_000; i++) burstLimit("event", `10.${(i >> 16) & 255}.${(i >> 8) & 255}.${i & 255}`, t0);
    const size = globalThis.__codBurst?.size ?? 0;
    check("at most 10 000 windows are kept", size > 0 && size <= 10_000, `size ${size}`);
    resetBurstLimits();
  }

  /* 4. CSRF ------------------------------------------------------------------------------------ */
  console.log("csrf (strict same-origin)");
  const post = (headers: Record<string, string | undefined>, method = "POST", url = `https://${PLATFORM}/api/app/shop1/x`) => {
    const h = new Headers();
    for (const [k, v] of Object.entries(headers)) if (v !== undefined) h.set(k, v);
    return new Request(url, { method, headers: h });
  };
  /** null leaves the header out */
  const same = (host: string, origin: string | null = `https://${host}`, site: string | null = "same-origin") => ({
    host,
    origin: origin ?? undefined,
    "sec-fetch-site": site ?? undefined,
  });
  withEnv({ ADMIN_HOST: undefined }, () => {
    check("platform: same-origin + the platform Origin passes", checkSameOrigin(post(same(PLATFORM))));
    check("platform: an action's headers() are checked the same way", checkSameOrigin(new Headers(same(PLATFORM) as Record<string, string>)));
    check("a missing Origin is refused (SEC-11)", !checkSameOrigin(post(same(PLATFORM, null))));
    check("a missing Origin is refused for an action", !checkSameOrigin(new Headers({ host: PLATFORM, "sec-fetch-site": "same-origin" })));
    check('Origin "null" is refused', !checkSameOrigin(post(same(PLATFORM, "null"))));
    check("no Sec-Fetch-Site is refused", !checkSameOrigin(post(same(PLATFORM, `https://${PLATFORM}`, null))));
    check("Sec-Fetch-Site same-site is refused (a store subdomain is same-site)", !checkSameOrigin(post(same(PLATFORM, `https://${PLATFORM}`, "same-site"))));
    check("Sec-Fetch-Site cross-site is refused", !checkSameOrigin(post(same(PLATFORM, `https://${PLATFORM}`, "cross-site"))));
    check("Sec-Fetch-Site none is refused", !checkSameOrigin(post(same(PLATFORM, `https://${PLATFORM}`, "none"))));
    check("a foreign Origin is refused", !checkSameOrigin(post(same(PLATFORM, "https://evil.example.org"))));
    check("a store-host Origin is refused on the platform", !checkSameOrigin(post(same(PLATFORM, `https://${STORE}`))));
    check("an Origin with a path is malformed", !checkSameOrigin(post(same(PLATFORM, `https://${PLATFORM}/x`))));
    check("a non-http Origin is refused", !checkSameOrigin(post(same(PLATFORM, `ftp://${PLATFORM}`))));
    check("an Origin with an explicit default port is no browser serialisation: refused", !checkSameOrigin(post(same(PLATFORM, `https://${PLATFORM}:443`))));
    check(
      "X-Forwarded-Host is never reflected next to a real Host",
      !checkSameOrigin(post({ ...same(PLATFORM, "https://evil.example.org"), "x-forwarded-host": "evil.example.org" })),
    );
    check(
      "behind Hostinger's proxy: internal Host + X-Forwarded-Host = the platform",
      checkSameOrigin(post({ ...same("127.0.0.1:3000", `https://${PLATFORM}`), "x-forwarded-host": PLATFORM })),
    );
    check(
      "internal Host + a spoofed X-Forwarded-Host list: the right-most entry decides",
      !checkSameOrigin(post({ ...same("127.0.0.1:3000", "https://evil.example.org"), "x-forwarded-host": `evil.example.org, ${PLATFORM}` })),
    );
    check("safe methods always pass", ["GET", "HEAD", "OPTIONS"].every((m) => checkSameOrigin(post({ host: PLATFORM }, m))));
    check("a foreign Host is refused", !checkSameOrigin(post(same("evil.example.org"))));
    check("a legacy host is refused", (() => {
      let ok = true;
      withEnv({ LEGACY_PLATFORM_HOSTS: LEGACY }, () => (ok = !checkSameOrigin(post(same(LEGACY)))));
      return ok;
    })());
    let thrown: unknown = null;
    try {
      assertSameOrigin(post(same(PLATFORM, null)));
    } catch (err) {
      thrown = err;
    }
    check("assertSameOrigin throws CsrfError (403)", thrown instanceof CsrfError && thrown.status === 403);
  });
  withEnv({ ADMIN_HOST: CONSOLE }, () => {
    check("console host: its own Origin passes", checkSameOrigin(post(same(CONSOLE))));
    check("console host: the platform Origin is refused", !checkSameOrigin(post(same(CONSOLE, `https://${PLATFORM}`))));
    check("platform host: the console Origin is refused", !checkSameOrigin(post(same(PLATFORM, `https://${CONSOLE}`))));
    check("platform host: its own Origin still passes", checkSameOrigin(post(same(PLATFORM))));
  });
  withEnv({ STORE_ROOT_DOMAIN: PLATFORM, EDGE_KEY }, () => {
    const viaWorker = { ...worker(), origin: `https://${STORE}`, "sec-fetch-site": "same-origin" };
    check("a store host through the Worker is never a mutation origin (AUTH-24)", !checkSameOrigin(new Headers(viaWorker)));
    check("an unverifiable x-sg-edge on the platform host is refused", !checkSameOrigin(new Headers({ ...same(PLATFORM), "x-sg-edge": "nope" } as Record<string, string>)));
  });

  /* 5. header sets ----------------------------------------------------------------------------- */
  console.log("header sets");
  const { HSTS_MAX_AGE, adminCsp, baseSecurityHeaders, hstsValue, platformUiHeaders, redirectHeaders, generateNonce } = headersMod;
  {
    const base = baseSecurityHeaders();
    eq(
      "base headers",
      [base["X-Content-Type-Options"], base["X-Frame-Options"], base["Cross-Origin-Opener-Policy"], base["Referrer-Policy"]],
      ["nosniff", "DENY", "same-origin", "strict-origin-when-cross-origin"],
    );
    check("base: Permissions-Policy denies camera, microphone, geolocation, payment", /camera=\(\).*microphone=\(\).*geolocation=\(\).*payment=\(\)/.test(base["Permissions-Policy"] ?? ""));
    eq("base: HSTS in production", base["Strict-Transport-Security"], `max-age=${HSTS_MAX_AGE}`);
    eq("base: frame sameorigin", baseSecurityHeaders({ frame: "sameorigin" })["X-Frame-Options"], "SAMEORIGIN");
    check("base: frame false omits X-Frame-Options", !("X-Frame-Options" in baseSecurityHeaders({ frame: false })));
    check("base: hsts false omits HSTS", !("Strict-Transport-Security" in baseSecurityHeaders({ hsts: false })));

    eq("HSTS: two years", HSTS_MAX_AGE, 63_072_000);
    for (const cls of ["platform", "console", "legacy", "store", "custom", "reserved", "invalid", "foreign", null] as const) {
      eq(`HSTS P mode, ${cls}: no includeSubDomains`, hstsValue(cls), "max-age=63072000");
    }
    withEnv({ STORE_ROOT_DOMAIN: PLATFORM, EDGE_KEY }, () => {
      eq("HSTS S mode, platform: includeSubDomains (SEC-15)", hstsValue("platform"), "max-age=63072000; includeSubDomains");
      for (const cls of ["console", "legacy", "store", "custom", null] as const) eq(`HSTS S mode, ${cls}: no includeSubDomains`, hstsValue(cls), "max-age=63072000");
      eq("base headers take the host class", baseSecurityHeaders({ cls: "platform" })["Strict-Transport-Security"], "max-age=63072000; includeSubDomains");
    });
    withEnv({ STORE_ROOT_DOMAIN: PLATFORM, EDGE_KEY: undefined }, () => {
      eq("STORE_ROOT_DOMAIN without EDGE_KEY is P mode", hstsValue("platform"), "max-age=63072000");
    });

    const nonce = generateNonce();
    check("nonce: 128 bits base64", /^[A-Za-z0-9+/]{22}==$/.test(nonce));
    let refused = false;
    try {
      adminCsp("bad nonce;script-src *");
    } catch {
      refused = true;
    }
    check("adminCsp refuses a malformed nonce", refused);
    const csp = adminCsp(nonce, { dev: false });
    check("platform CSP: nonce + strict-dynamic, no unsafe-eval", csp.includes(`'nonce-${nonce}'`) && csp.includes("'strict-dynamic'") && !csp.includes("'unsafe-eval'"));
    check("platform CSP: frame-ancestors 'none', object-src 'none', base-uri 'none'", ["frame-ancestors 'none'", "object-src 'none'", "base-uri 'none'"].every((d) => csp.includes(d)));
    check("platform CSP: upgrade-insecure-requests on an https platform", csp.endsWith("upgrade-insecure-requests"));
    check("platform CSP (dev): unsafe-eval for React's dev tools, no upgrade", (() => {
      const dev = adminCsp(nonce, { dev: true });
      return dev.includes("'unsafe-eval'") && !dev.includes("upgrade-insecure-requests");
    })());
    withEnv({ PLATFORM_URL: "http://localhost:3410" }, () => {
      check("platform CSP: no upgrade on an http platform (npm run start locally)", !adminCsp(nonce, { dev: false }).includes("upgrade-insecure-requests"));
    });

    const ui = (area: PlatformUiArea) => platformUiHeaders(nonce, { dev: false, area, cls: "platform" });
    for (const area of ["console", "app", "auth"] as const) {
      const h = ui(area);
      eq(`${area}: Referrer-Policy, Cache-Control, X-Robots-Tag, CORP`, [h["Referrer-Policy"], h["Cache-Control"], h["X-Robots-Tag"], h["Cross-Origin-Resource-Policy"]], [
        "same-origin",
        "private, no-store",
        "noindex, nofollow, noarchive",
        "same-origin",
      ]);
      check(`${area}: the nonce CSP`, (h["Content-Security-Policy"] ?? "").includes(`'nonce-${nonce}'`));
    }
    const kit = ui("kit");
    eq("kit: no-referrer (no actions), private, noindex (ENGC-16)", [kit["Referrer-Policy"], kit["Cache-Control"], kit["X-Robots-Tag"]], ["no-referrer", "private, no-store", "noindex, nofollow, noarchive"]);
    const marketing = ui("marketing");
    eq("marketing: indexable and cacheable at the edge", [marketing["Cache-Control"], marketing["X-Robots-Tag"], marketing["Referrer-Policy"]], ["public, max-age=0, s-maxage=300", undefined, "same-origin"]);
    eq("platform UI defaults to the console set", platformUiHeaders(nonce, { dev: false })["Cache-Control"], "private, no-store");

    const r = redirectHeaders("platform");
    eq("redirects: base headers + private, no-store", [r["Cache-Control"], r["X-Content-Type-Options"], r["Strict-Transport-Security"]], ["private, no-store", "nosniff", "max-age=63072000"]);
    withEnv({ STORE_ROOT_DOMAIN: PLATFORM, EDGE_KEY }, () => {
      eq("redirects: HSTS of the host class", [redirectHeaders("platform")["Strict-Transport-Security"], redirectHeaders("store")["Strict-Transport-Security"]], [
        "max-age=63072000; includeSubDomains",
        "max-age=63072000",
      ]);
    });
  }

  /* 6. neutral pages ----------------------------------------------------------------------------- */
  console.log("neutral pages");
  {
    const { createHash } = await import("node:crypto");
    const { GONE_PAGE_HTML, UNAVAILABLE_PAGE_HTML, UNKNOWN_PAGE_HEADERS, UNKNOWN_PAGE_HTML, gonePageResponse, unavailablePageResponse, unknownPageHeaders, unknownPageResponse } = unknown;
    const get = unknownPageResponse("GET");
    eq("GET: 404", get.status, 404);
    eq("GET: the static page", await get.text(), UNKNOWN_PAGE_HTML);
    check("never re-encoded (no-transform)", /\bno-transform\b/.test(get.headers.get("cache-control") ?? ""));
    check("never cached", /\bno-store\b/.test(get.headers.get("cache-control") ?? ""));
    for (const method of ["HEAD", "POST", "OPTIONS", "PUT", "PATCH", "DELETE"]) {
      const r = unknownPageResponse(method);
      eq(`${method}: 404 with an empty body`, [r.status, await r.text()], [404, ""]);
    }
    const h = UNKNOWN_PAGE_HEADERS;
    eq(
      "404 set: nosniff, DENY, no-referrer, COOP, CORP, HSTS (§F.6)",
      [h["X-Content-Type-Options"], h["X-Frame-Options"], h["Referrer-Policy"], h["Cross-Origin-Opener-Policy"], h["Cross-Origin-Resource-Policy"], h["Strict-Transport-Security"]],
      ["nosniff", "DENY", "no-referrer", "same-origin", "same-origin", "max-age=63072000"],
    );
    const csp = h["Content-Security-Policy"] ?? "";
    const style = /<style>([\s\S]*?)<\/style>/.exec(UNKNOWN_PAGE_HTML)?.[1] ?? "";
    const hash = `'sha256-${createHash("sha256").update(style, "utf8").digest("base64")}'`;
    eq(
      "404 CSP: nothing but the page's own inline style",
      csp,
      `default-src 'none'; style-src ${hash}; img-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
    );
    for (const [label, html] of [["410", GONE_PAGE_HTML], ["503", UNAVAILABLE_PAGE_HTML]] as const) {
      check(`${label} page: the same inline style (one CSP hash)`, /<style>([\s\S]*?)<\/style>/.exec(html)?.[1] === style);
      check(`${label} page: no script, no external resource`, !/<script|src=|<link/i.test(html));
    }
    check("404 page: no script, no external resource", !/<script|src=|<link/i.test(UNKNOWN_PAGE_HTML));
    const gone = gonePageResponse("GET");
    const down = unavailablePageResponse("GET", undefined, 12);
    eq("410 / 503 statuses and bodies", [gone.status, down.status, await gone.text(), await down.text()], [410, 503, GONE_PAGE_HTML, UNAVAILABLE_PAGE_HTML]);
    const setOf = (r: Response) => {
      const out: Record<string, string> = {};
      r.headers.forEach((v, k) => (out[k] = v));
      return out;
    };
    const g = setOf(gone);
    const d = setOf(down);
    eq("503: Retry-After", d["retry-after"], "12");
    delete d["retry-after"];
    eq("404, 410 and 503 share one header set (the 404-uniformity rule)", [JSON.stringify(g), JSON.stringify(d)], [JSON.stringify(setOf(get)), JSON.stringify(setOf(get))]);
    // a suspended store with its notice says one day (D32); nothing longer
    eq("503 Retry-After: one day for a suspended store's notice", unavailablePageResponse("GET", undefined, 86_400).headers.get("retry-after"), "86400");
    eq("503 Retry-After is clamped to a day", unavailablePageResponse("GET", undefined, 999_999).headers.get("retry-after"), "86400");
    eq("HEAD 410: empty", await gonePageResponse("HEAD").text(), "");
    withEnv({ STORE_ROOT_DOMAIN: PLATFORM, EDGE_KEY }, () => {
      eq("404 on the platform host in S mode: includeSubDomains", unknownPageHeaders("platform")["Strict-Transport-Security"], "max-age=63072000; includeSubDomains");
      eq("404 on a store host: no includeSubDomains", unknownPageHeaders("store")["Strict-Transport-Security"], "max-age=63072000");
      eq(
        "a handler outside the proxy matcher passes its headers: the host class decides",
        unknownPageResponse("GET", new Headers({ host: PLATFORM })).headers.get("strict-transport-security"),
        "max-age=63072000; includeSubDomains",
      );
      eq("the frozen constant keeps the plain value", UNKNOWN_PAGE_HEADERS["Strict-Transport-Security"], "max-age=63072000");
    });
  }

  /* 7. documentOrigins (production) -------------------------------------------------------------- */
  console.log("documentOrigins (production)");
  const { documentOrigins } = await import("@/lib/render/serve.server");
  const req = (headers: Record<string, string>, url = "http://127.0.0.1:3000/argan") => new Request(url, { headers });
  const warn = console.warn;
  const warned: string[] = [];
  console.warn = (...args: unknown[]) => void warned.push(args.join(" "));
  try {
    withEnv({ PUBLIC_URL: "https://shop.ma", PLATFORM_URL: undefined, ADMIN_HOST: undefined }, () => {
      eq("PUBLIC_URL host", documentOrigins(req({ host: "shop.ma" })), ["https://shop.ma"]);
      eq("www twin is the same site", documentOrigins(req({ host: "www.shop.ma" })), ["https://shop.ma", "https://www.shop.ma"]);
      eq("X-Forwarded-Host never widens a real Host", documentOrigins(req({ host: "shop.ma", "x-forwarded-host": "evil.example" })), ["https://shop.ma"]);
      eq("X-Forwarded-Proto never changes PUBLIC_URL's scheme", documentOrigins(req({ host: "www.shop.ma", "x-forwarded-proto": "http" })), [
        "https://shop.ma",
        "https://www.shop.ma",
      ]);
      eq("a foreign Host is not reflected", documentOrigins(req({ host: "evil.example" })), ["https://shop.ma"]);
      check("a foreign Host is reported once in the runtime log", warned.filter((w) => w.includes("evil.example")).length === 1);
      documentOrigins(req({ host: "evil.example" }));
      check("…and only once", warned.filter((w) => w.includes("evil.example")).length === 1);
      eq("internal Host + proxy's X-Forwarded-Host twin", documentOrigins(req({ host: "127.0.0.1:3000", "x-forwarded-host": "www.shop.ma" })), [
        "https://shop.ma",
        "https://www.shop.ma",
      ]);
      eq("internal Host + spoofed X-Forwarded-Host", documentOrigins(req({ host: "127.0.0.1:3000", "x-forwarded-host": "www.shop.ma, evil.example" })), ["https://shop.ma"]);
      check("an internal Host is never reported", !warned.some((w) => w.includes("127.0.0.1")));
    });
    withEnv({ PUBLIC_URL: "http://localhost:3410", PLATFORM_URL: undefined }, () => {
      eq("local production run (next start)", documentOrigins(req({ host: "localhost:3410" }, "http://localhost:3410/x")), ["http://localhost:3410"]);
    });
    withEnv({ PUBLIC_URL: undefined, PLATFORM_URL: undefined }, () => {
      eq("no PUBLIC_URL: the addressed Host", documentOrigins(req({ host: "shop.ma", "x-forwarded-proto": "https" })), ["https://shop.ma"]);
      eq("no PUBLIC_URL: X-Forwarded-Host ignored next to a real Host", documentOrigins(req({ host: "shop.ma", "x-forwarded-host": "evil.example" })).length, 1);
      eq("no PUBLIC_URL: CSP syntax in Host is refused", documentOrigins(req({ host: "shop.ma; script-src *" })), []);
    });
  } finally {
    console.warn = warn;
  }

  /* 8. Served store documents: connect-src / form-action (SEC-2) -------------------------------- */
  console.log("served store documents (SEC-2)");
  const { documentResponse } = await import("@/lib/render/serve.server");
  const { buildLandingCsp } = await import("@/lib/render/csp");
  const stored = buildLandingCsp({
    mode: "live",
    scriptHashes: ["sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="],
    styleHashes: ["sha256-BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB="],
    pixels: { meta: true, tiktok: true },
    turnstile: true,
  });
  const directive = (csp: string, name: string) =>
    (new RegExp(`(?:^|;)\\s*${name}\\s+([^;]*)`).exec(csp)?.[1] ?? "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
  /** a source that unlocks a whole app origin: 'self', one of our hosts without a path, a scheme, "*" (vendor hosts are fine) */
  const appHosts = new Set([PLATFORM, CONSOLE, STORE, LEGACY]);
  const bare = (v: string) => {
    const origin = /^https?:\/\/([^/]+)\/?$/i.exec(v);
    return v.toLowerCase() === "'self'" || v === "*" || /^https?:$/i.test(v) || (!!origin && appHosts.has(origin[1]!.toLowerCase()));
  };
  const docKinds = ["landing", "thanks", "legal", "test", "preview"] as const;
  const shopAddress = { id: "01JAAAAAAAAAAAAAAAAAAAAAAA", handle: "shop1", primaryDomain: null };
  const served = async (headers: Record<string, string>, url: string) => {
    const out: Record<string, string> = {};
    for (const kind of docKinds) {
      const res = await documentResponse(new Request(url, { headers }), { html: "<!DOCTYPE html><title>x</title>", csp: stored, etag: "a".repeat(64) }, { kind, store: shopAddress });
      out[kind] = res.headers.get("content-security-policy") ?? "";
    }
    return out;
  };
  const noBareSource = (label: string, policies: Record<string, string>, api: string) => {
    for (const [kind, csp] of Object.entries(policies)) {
      for (const name of ["connect-src", "form-action"]) {
        const values = directive(csp, name);
        check(`${label} ${kind}: ${name} has no bare 'self' or app origin`, values.length > 0 && !values.some(bare), values.join(" "));
      }
      check(`${label} ${kind}: connect-src names ${api}`, directive(csp, "connect-src").includes(api), csp);
      check(`${label} ${kind}: the pixel hosts stay`, directive(csp, "connect-src").some((v) => v.includes("facebook")), csp);
    }
  };
  noBareSource("platform host", await served({ host: PLATFORM }, `https://${PLATFORM}/s/shop1/argan`), `https://${PLATFORM}/api/public/`);
  {
    // the legacy host 308s every page (§C.4); a document served there anyway is reported once as off PUBLIC_URL
    const quiet = console.warn;
    console.warn = () => undefined;
    try {
      noBareSource("legacy host", await served({ host: LEGACY }, `https://${LEGACY}/argan`), `https://${PLATFORM}/api/public/`);
    } finally {
      console.warn = quiet;
    }
  }
  {
    const prev = { root: env.STORE_ROOT_DOMAIN, key: env.EDGE_KEY };
    env.STORE_ROOT_DOMAIN = PLATFORM;
    env.EDGE_KEY = EDGE_KEY;
    try {
      const viaEdge = await served(worker(), `https://${PLATFORM}/argan`);
      noBareSource("store host (Worker)", viaEdge, `https://${STORE}/api/public/`);
      check("store host: the platform's public API is not listed", !directive(viaEdge.landing!, "connect-src").includes(`https://${PLATFORM}/api/public/`), viaEdge.landing);
      const forged = await served(worker({ key: "x".repeat(40) }), `https://${PLATFORM}/argan`);
      check("a forged Worker header set never names the store host", !Object.values(forged).some((c) => c.includes(STORE)), forged.landing);
    } finally {
      if (prev.root === undefined) delete env.STORE_ROOT_DOMAIN;
      else env.STORE_ROOT_DOMAIN = prev.root;
      if (prev.key === undefined) delete env.EDGE_KEY;
      else env.EDGE_KEY = prev.key;
    }
  }
  {
    const prev = env.PLATFORM_URL;
    delete env.PLATFORM_URL;
    try {
      const none = await served({ host: "shop.ma; script-src *" }, `https://${PLATFORM}/argan`);
      for (const [kind, csp] of Object.entries(none)) {
        check(
          `no usable origin ${kind}: the same-origin part is dropped (never a bare 'self')`,
          !directive(csp, "connect-src").some(bare) && directive(csp, "form-action").join(" ") === "'none'",
          csp,
        );
      }
    } finally {
      env.PLATFORM_URL = prev;
    }
  }

  /* 9. Web storage names per store (§C.9) ------------------------------------------------------ */
  console.log("web storage names per store (§C.9)");
  const core = await import("@/landing/runtime/core");
  const tracking = await import("@/landing/runtime/tracking");
  const orderStore = await import("@/landing/runtime/order-store");
  const pixels = await import("@/landing/runtime/pixels");
  type W = import("@/landing/runtime/core").W;
  const memory = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, String(v)), removeItem: (k: string) => void m.delete(k), keys: () => [...m.keys()].sort() };
  };
  const session = memory();
  const local = memory();
  const win = (path: string, search = "") => ({ location: { pathname: path, search }, sessionStorage: session, localStorage: local, crypto: globalThis.crypto }) as unknown as W;
  eq("skey: a store page in P mode", core.skey(win("/s/atlas-argan/argan"), "utm"), "lp:atlas-argan:utm");
  eq("skey: the store home shares the prefix", core.skey(win("/s/atlas-argan"), "vid"), "lp:atlas-argan:vid");
  eq("skey: the thank-you page shares it", core.skey(win("/s/atlas-argan/argan/merci"), "order"), "lp:atlas-argan:order");
  eq("skey: outside /s/ today's names stay", [core.skey(win("/argan"), "utm"), core.skey(win("/"), "wa"), core.skey(win("srcdoc"), "px-u")], ["lp-utm", "lp-wa", "lp-px-u"]);
  eq("skey: not a handle: today's name", [core.skey(win("/s/ab/x"), "utm"), core.skey(win("/s/Atlas/x"), "utm"), core.skey(win("/sx/atlas-argan"), "utm")], ["lp-utm", "lp-utm", "lp-utm"]);
  const utmA = tracking.captureUtm(win("/s/atlas-argan/argan", "?utm_source=fb&fbclid=AAA"));
  const utmB = tracking.captureUtm(win("/s/baraka-home/argan"));
  eq("captureUtm: store A's attribution", utmA, { source: "fb", fbclid: "AAA" });
  eq("captureUtm: store B never reads store A's session attribution", utmB, {});
  eq("captureUtm: a later page of store A keeps its attribution", tracking.captureUtm(win("/s/atlas-argan/serum")), { source: "fb", fbclid: "AAA" });
  eq("captureUtm: ScCid and utm_* map to their payload keys, values trimmed", tracking.captureUtm(win("/x", "?ScCid=%20s1%20&utm_term=t")), { term: "t", sccid: "s1" });
  const ctx = (path: string) => ({ win: win(path), doc: { cookie: "" } }) as unknown as import("@/landing/runtime/core").Ctx;
  const vidA = tracking.visitorId(ctx("/s/atlas-argan/argan"));
  const vidB = tracking.visitorId(ctx("/s/baraka-home/argan"));
  check("visitorId: one id per store", vidA !== vidB && tracking.visitorId(ctx("/s/atlas-argan/x")) === vidA);
  const rec = { orderId: "CMD-7K3Q9X", name: "Amina", total: 199, currency: "MAD", bundleLabel: "x1", items: "x1", qty: 1, eventId: "e1", ts: 1, pageKey: "pk_atlas_argan_1" };
  orderStore.writeOrder(win("/s/atlas-argan/argan"), rec);
  eq("order hand-off: store A's thank-you page reads it", orderStore.readOrder(win("/s/atlas-argan/argan/merci"))?.orderId, "CMD-7K3Q9X");
  eq("order hand-off: store B's thank-you page does not", orderStore.readOrder(win("/s/baraka-home/argan/merci")), null);
  session.setItem(core.skey(win("/s/atlas-argan/argan"), pixels.PX_USER_KEY), JSON.stringify({ ph: "a".repeat(64), phE: "b".repeat(64) }));
  check("advanced matching: store A's hashes stay store A's", pixels.readUser(win("/s/atlas-argan/argan/merci"))?.ph === "a".repeat(64) && pixels.readUser(win("/s/baraka-home/argan/merci")) === null);
  eq(
    "the per-store names in storage",
    [...session.keys(), ...local.keys()].filter((k) => k.startsWith("lp:")),
    ["lp:atlas-argan:order", "lp:atlas-argan:px-u", "lp:atlas-argan:utm", "lp:atlas-argan:vid", "lp:baraka-home:vid"],
  );

  /* 10. The test seams (§H.7, P0b CCR P5-6 / P7-9) --------------------------------------------- */
  console.log("test seams (§H.7)");
  const seams = await import("./test-seams");
  type SeamEnv = Record<string, string | undefined>;
  const TEST_DB = "mysql://root@127.0.0.1:3306/cod_test_p0b_seams";
  /** every guard holds: the flag, loopback origins (the mock, the fake AI endpoint, the app), a cod_test_ database */
  const all: SeamEnv = {
    NODE_ENV: "production",
    SG_E2E: "1",
    SG_E2E_MOCK_ORIGIN: "http://127.0.0.1:4010",
    SG_AI_BASE_URL: "http://localhost:4011/",
    SG_AI_NO_AFTER: "1",
    SG_AI_HARNESS: "1",
    PLATFORM_URL: "http://127.0.0.1:3452",
    DATABASE_URL: TEST_DB,
  };
  const decide = (seam: import("./test-seams").TestSeam, env: SeamEnv) => seams.decideTestSeam(seam, env);
  eq("TEST_SEAM_VARS: the five names of §H.7", [...seams.TEST_SEAM_VARS], ["SG_E2E", "SG_E2E_MOCK_ORIGIN", "SG_AI_BASE_URL", "SG_AI_NO_AFTER", "SG_AI_HARNESS"]);
  eq("production with every guard: e2e-mocks on, the mock origin", decide("e2e-mocks", all), { on: true, origin: "http://127.0.0.1:4010" });
  eq("production with every guard: ai-base-url on, its origin without the slash", decide("ai-base-url", all), { on: true, origin: "http://localhost:4011" });
  eq("production with every guard: ai-no-after on (a boolean seam: no origin)", decide("ai-no-after", all), { on: true, origin: null });
  eq("production with every guard: ai-harness on", decide("ai-harness", all), { on: true, origin: null });
  for (const nodeEnv of ["development", "test", undefined]) {
    eq(`never relaxed nor stricter outside production (NODE_ENV ${nodeEnv ?? "unset"})`, (["e2e-mocks", "ai-base-url", "ai-no-after", "ai-harness"] as const).map((s) => decide(s, { ...all, NODE_ENV: nodeEnv }).on), [true, true, true, true]);
  }
  eq("[::1] is loopback", decide("e2e-mocks", { ...all, SG_E2E_MOCK_ORIGIN: "http://[::1]:4010" }), { on: true, origin: "http://[::1]:4010" });
  eq("PUBLIC_URL is the app origin when PLATFORM_URL is unset", decide("ai-harness", { ...all, PLATFORM_URL: undefined, PUBLIC_URL: "http://localhost:3452" }).on, true);
  // the truth table: production with one guard missing → off, and the guard named
  const truth: [string, import("./test-seams").TestSeam, SeamEnv, import("./test-seams").TestSeamGuard | null | "on"][] = [
    ["the seam's own variable unset: off, nothing to log", "e2e-mocks", { ...all, SG_E2E_MOCK_ORIGIN: undefined }, null],
    ["a blank own variable: off, nothing to log", "ai-base-url", { ...all, SG_AI_BASE_URL: "  " }, null],
    ["flag missing", "e2e-mocks", { ...all, SG_E2E: undefined }, "flag"],
    ["flag not exactly \"1\"", "ai-base-url", { ...all, SG_E2E: "true" }, "flag"],
    ["flag missing (boolean seam)", "ai-no-after", { ...all, SG_E2E: "" }, "flag"],
    ["https origin", "e2e-mocks", { ...all, SG_E2E_MOCK_ORIGIN: "https://127.0.0.1:4010" }, "origin.protocol"],
    ["https AI endpoint", "ai-base-url", { ...all, SG_AI_BASE_URL: "https://api.anthropic.com" }, "origin.protocol"],
    ["non-loopback host", "e2e-mocks", { ...all, SG_E2E_MOCK_ORIGIN: "http://10.0.0.5:4010" }, "origin.host"],
    ["non-loopback host (a look-alike name)", "ai-base-url", { ...all, SG_AI_BASE_URL: "http://localhost.evil.example:4011" }, "origin.host"],
    ["non-loopback host (127.0.0.2)", "e2e-mocks", { ...all, SG_E2E_MOCK_ORIGIN: "http://127.0.0.2:4010" }, "origin.host"],
    ["credentials in the URL", "e2e-mocks", { ...all, SG_E2E_MOCK_ORIGIN: "http://user:pass@127.0.0.1:4010" }, "origin.credentials"],
    ["credentials in the URL (user only)", "ai-base-url", { ...all, SG_AI_BASE_URL: "http://key@localhost:4011" }, "origin.credentials"],
    ["a path beyond /", "ai-base-url", { ...all, SG_AI_BASE_URL: "http://localhost:4011/v1" }, "origin.path"],
    ["a query", "e2e-mocks", { ...all, SG_E2E_MOCK_ORIGIN: "http://127.0.0.1:4010/?x=1" }, "origin.path"],
    ["a host:port without a scheme (read as the scheme)", "e2e-mocks", { ...all, SG_E2E_MOCK_ORIGIN: "localhost:4010" }, "origin.protocol"],
    ["not a URL (an address and a port)", "e2e-mocks", { ...all, SG_E2E_MOCK_ORIGIN: "127.0.0.1:4010" }, "origin.parse"],
    ["not a URL at all", "ai-base-url", { ...all, SG_AI_BASE_URL: "http://" }, "origin.parse"],
    ["database not cod_test_", "e2e-mocks", { ...all, DATABASE_URL: "mysql://root@127.0.0.1:3306/cod_storegen" }, "database"],
    ["database not cod_test_ (the production name)", "ai-base-url", { ...all, DATABASE_URL: "mysql://u@127.0.0.1:3306/u641677794_storegen" }, "database"],
    ["database cod_testx (no underscore)", "ai-harness", { ...all, DATABASE_URL: "mysql://root@127.0.0.1:3306/cod_testx" }, "database"],
    ["database with capitals", "ai-no-after", { ...all, DATABASE_URL: "mysql://root@127.0.0.1:3306/cod_test_A" }, "database"],
    ["database name with a second path segment", "e2e-mocks", { ...all, DATABASE_URL: "mysql://root@127.0.0.1:3306/cod_test_x/y" }, "database"],
    ["no DATABASE_URL", "e2e-mocks", { ...all, DATABASE_URL: undefined }, "database"],
    ["boolean seam: its own variable not \"1\"", "ai-harness", { ...all, SG_AI_HARNESS: "yes" }, "value"],
    ["boolean seam: \"0\" is a refusal, not an off switch to trust", "ai-no-after", { ...all, SG_AI_NO_AFTER: "0" }, "value"],
    ["boolean seam: the app origin is https", "ai-no-after", { ...all, PLATFORM_URL: "https://storegen.example" }, "app-origin.protocol"],
    ["boolean seam: the app origin is not loopback", "ai-harness", { ...all, PLATFORM_URL: "http://192.168.1.20:3452" }, "app-origin.host"],
    ["boolean seam: no app origin", "ai-harness", { ...all, PLATFORM_URL: undefined, PUBLIC_URL: undefined }, "app-origin.missing"],
    ["boolean seam: PLATFORM_URL wins over a loopback PUBLIC_URL", "ai-no-after", { ...all, PLATFORM_URL: "https://storegen.example", PUBLIC_URL: "http://127.0.0.1:3452" }, "app-origin.protocol"],
    ["boolean seam: the app origin with a path", "ai-harness", { ...all, PLATFORM_URL: "http://127.0.0.1:3452/app" }, "app-origin.path"],
    ["boolean seams ignore SG_E2E_MOCK_ORIGIN / SG_AI_BASE_URL problems", "ai-harness", { ...all, SG_E2E_MOCK_ORIGIN: "https://x.example", SG_AI_BASE_URL: "https://x.example" }, "on"],
  ];
  for (const [name, seam, env, guard] of truth) {
    eq(`${seam}: ${name}`, decide(seam, env), guard === "on" ? { on: true, origin: null } : { on: false, guard });
  }
  // testSeam(): process.env per call, one refusal line per process and seam, never a value
  {
    const lines: string[] = [];
    const orig = console.error;
    console.error = (...a: unknown[]) => void lines.push(a.map(String).join(" "));
    const secretish = "seamSecretValue-7Hq2Lm9Xc4";
    try {
      withEnv({ ...all, SG_AI_BASE_URL: `https://${secretish}@ai.example` }, () => {
        eq("testSeam: a refused seam is null", seams.testSeam("ai-base-url"), null);
        eq("testSeam: a refused seam stays null on the next call", seams.testSeam("ai-base-url"), null);
        eq("testSeam: another seam is answered on its own", seams.testSeam("e2e-mocks"), { origin: "http://127.0.0.1:4010" });
      });
      eq("testSeam: one refusal line per process and seam, naming the seam and the guard", lines, ["[security] test seam ai-base-url refused: origin.protocol"]);
      check("testSeam: the line never carries a value", !lines.some((l) => l.includes(secretish) || l.includes("ai.example")), lines.join(" | "));
      withEnv({ ...all, SG_E2E: undefined }, () => eq("testSeam: computed per call (the flag removed → off)", seams.testSeam("e2e-mocks"), null));
      eq("testSeam: e2e-mocks logs its own line once", lines.slice(1), ["[security] test seam e2e-mocks refused: flag"]);
      withEnv({ ...all, SG_E2E: undefined }, () => seams.testSeam("e2e-mocks"));
      withEnv({ ...all, SG_AI_HARNESS: undefined, SG_AI_NO_AFTER: undefined }, () => {
        eq("testSeam: unrequested boolean seams are null", [seams.testSeam("ai-harness"), seams.testSeam("ai-no-after")], [null, null]);
      });
      eq("testSeam: no second line, and nothing for unrequested seams", lines.length, 2);
      withEnv(all, () => eq("testSeam: a boolean seam on", seams.testSeam("ai-harness"), { origin: null }));
    } finally {
      console.error = orig;
    }
  }
}

main().then(
  () => {
    console.log(`\n${passes} passed, ${failures} failed`);
    if (failures) process.exit(1);
  },
  (err: unknown) => {
    console.error(err);
    process.exit(1);
  },
);
