/**
 * test:public-api — public write path abuse and isolation regressions (security review area public-api;
 * docs/STORE-SAAS.md §C.9, §E.2, §E.3, §E.8, D54, D72, SEC-23; ORD-01 … ORD-07, ORD-17, ORD-18, ORD-21).
 * Exit code 1 on any failure.
 *
 *   node --conditions=react-server --import tsx scripts/qa/public-api-security.ts [--db cod_test_t3_publicapi] [--keep] [--offline]
 *
 * Pure checks always run:
 *  - client IP: CF-Connecting-IP only believed from Cloudflare's edge; IPv6 grouped by /64
 *  - CORS wildcards on shared hosting suffixes are refused; export allow-list entries naming the platform,
 *    legacy or console host, the store root domain or a sibling subdomain are refused (SEC-23)
 *  - the Origin of a live page must be one of its store's hosts: in S mode store B's subdomain cannot post
 *    store A's page key (V6); no reflected Host in production; cross-site fetches refused
 *  - export orders that skipped an enabled captcha reach the CAPI cut-off; database errors are logged
 *    without their bound values (no PII); the decoy answer's currency
 * Database checks (unless --offline): a throwaway database `cod_test_*` on the local MariaDB (root, no password)
 * is created, migrated with drizzle and dropped (kept with --keep). Two active stores A and B, a restricted, a
 * pending store, pages with published versions, exports; then the order pipeline, createOrderRow, leads, upsell
 * and the four route handlers with real Request objects:
 *  - honeypot submissions use up neither a victim phone's quota nor the page's; a page flood never refuses real
 *    shoppers; "duplicate" only to the ordering network; the per-phone limit counts stored orders; the per-IP
 *    limit holds across an IPv6 /64; connected exports cannot skip an enabled Turnstile
 *  - per store: rows carry the target's store, blocklist, per-phone limit, per-IP bucket, risk history and the
 *    flood breaker never cross stores; leads and upsells stay in their store
 *  - test orders (D54): `is_test`, flag "test", sheet disabled, no Purchase event, no stats; test and real orders
 *    never block each other
 *  - createOrderRow (D72): idem replay, another store's idem refused, the inTx hooks see the row and roll it back
 *    on failure, the afterCommit hooks get the Purchase event
 *  - routes: store states (§A.5.3), ?sg-test tokens per store, store-host Origins in P and S mode, export CORS;
 *    the upsell answers an origin refusal exactly like an unknown order (ORD-17), in S mode too
 *  - the interim guard of the R1.0 T3 review (finding 2): only store #1's orders reach the one Google Sheet
 *    (selectSyncBatch) and the legacy CAPI tokens; another store's order schedules neither
 *  - unique-visitor credit capped per network and page
 *
 * T1's settings API answers for real (the suite's settings double went at the R1.0 integration, after the T1 merge).
 * Secrets are random test values made here; nothing from .env.local is read or printed.
 */
import Module from "node:module";
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { DrizzleQueryError } from "drizzle-orm";

/* ------------------------------------------------------------------ */
/* Process setup                                                       */
/* ------------------------------------------------------------------ */

const DB_RE = /^cod_test_[a-z0-9_]{1,48}$/;
const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const DB = arg("db") ?? "cod_test_t3_publicapi";
const KEEP = process.argv.includes("--keep");
const OFFLINE = process.argv.includes("--offline");
if (!DB_RE.test(DB)) throw new Error("the database must be named cod_test_*");

const env = process.env as Record<string, string | undefined>;
env.NODE_ENV = "production";
env.APP_SECRET = randomBytes(32).toString("hex");
env.PLATFORM_URL = "https://platform.test";
delete env.PUBLIC_URL;
env.LEGACY_PLATFORM_HOSTS = "old-platform.test";
delete env.STORE_ROOT_DOMAIN;
delete env.EDGE_KEY;
delete env.EDGE_KEY_PREV;
env.ADMIN_HOST = "console.platform.test";
delete env.TURNSTILE_SITE_KEY;
delete env.TURNSTILE_SECRET_KEY;
delete env.BEHIND_CLOUDFLARE;
delete env.TRUSTED_PROXY_HOPS;
env.DATABASE_URL = `mysql://root@127.0.0.1:3306/${DB}`;
const EDGE_KEY = randomBytes(32).toString("hex");
/** S mode on shops.test (the Worker's key set), or P mode */
const setS = (on: boolean) => {
  if (on) {
    env.STORE_ROOT_DOMAIN = "shops.test";
    env.EDGE_KEY = EDGE_KEY;
  } else {
    delete env.STORE_ROOT_DOMAIN;
    delete env.EDGE_KEY;
  }
};

/**
 * Maps next/navigation to its server build, as Next's route bundles do: the seam's notFound / redirect need it, and
 * the client build needs React's createContext, which the react-server condition's React does not have.
 */
function installNavigationAlias(): void {
  const M = Module as unknown as { _resolveFilename: (request: string, ...rest: unknown[]) => string };
  const resolve = M._resolveFilename;
  const navigation = require.resolve("next/dist/client/components/navigation.react-server.js");
  M._resolveFilename = function (this: unknown, request: string, ...rest: unknown[]) {
    return request === "next/navigation" ? navigation : resolve.call(this, request, ...rest);
  };
}

let failures = 0;
const ok = (m: string) => console.log("  ✓", m);
async function check(name: string, fn: () => unknown | Promise<unknown>) {
  try {
    await fn();
    ok(name);
  } catch (err) {
    failures++;
    console.log("  ✗", name, "\n     ", err instanceof Error ? err.message : err);
  }
}

/** Runs `fn` with console.error lines matching `quiet` dropped (expected "outside a request" after() notices). */
async function hushed<T>(fn: () => Promise<T>, quiet = /outside a request scope|api\/(order|upsell):sync|could not schedule|orders:hook:qa\./): Promise<T> {
  const orig = console.error;
  console.error = (...a: unknown[]) => {
    if (!quiet.test(a.map(String).join(" "))) orig(...a);
  };
  try {
    return await fn();
  } finally {
    console.error = orig;
  }
}

/* ------------------------------------------------------------------ */
/* Pure                                                                */
/* ------------------------------------------------------------------ */

async function pure() {
  console.log("pure checks");
  const { errorSummary } = await import("@/lib/orders/log");
  const { checkOrigin, exportOriginProblem, originAllowed, registrableDomain } = await import("@/lib/orders/origin");
  const { scoreRisk, UNPROTECTED_MIN_SCORE } = await import("@/lib/orders/risk");
  const { canonicalIp, clientIp, isCloudflareIp, rateKeyIp } = await import("@/lib/security/ip");
  type RiskInput = import("@/lib/orders/risk").RiskInput;

  await check("canonicalIp strips ports, brackets, zones and IPv4-mapped prefixes", () => {
    assert.equal(canonicalIp("[2001:DB8::1]:443"), "2001:db8::1");
    assert.equal(canonicalIp("203.0.113.9:8080"), "203.0.113.9");
    assert.equal(canonicalIp("::ffff:203.0.113.9"), "203.0.113.9");
    assert.equal(canonicalIp("fe80::1%eth0"), "fe80::1");
    assert.equal(canonicalIp("unknown"), null);
    assert.equal(canonicalIp(""), null);
  });
  await check("rateKeyIp groups an IPv6 /64, keeps IPv4 addresses apart", () => {
    const a = rateKeyIp("2001:db8:1:2:aaaa::1");
    assert.equal(a, "2001:db8:1:2::/64");
    assert.equal(rateKeyIp("2001:0db8:0001:0002:ffff:ffff:ffff:ffff"), a);
    assert.equal(rateKeyIp("[2001:db8:1:2::9]:80"), a);
    assert.notEqual(rateKeyIp("2001:db8:1:3::1"), a);
    assert.equal(rateKeyIp("::ffff:198.51.100.7"), "198.51.100.7");
    assert.equal(rateKeyIp("64:ff9b::198.51.100.7"), "64:ff9b:0:0::/64");
    assert.notEqual(rateKeyIp("198.51.100.7"), rateKeyIp("198.51.100.8"));
  });
  await check("CF-Connecting-IP is only believed when the proxy hop is a Cloudflare edge", () => {
    try {
      env.BEHIND_CLOUDFLARE = "1";
      const h = (xff: string, cf?: string) => new Headers({ "x-forwarded-for": xff, ...(cf ? { "cf-connecting-ip": cf } : {}) });
      assert.ok(isCloudflareIp("172.68.1.2") && isCloudflareIp("2a06:98c1::1") && !isCloudflareIp("198.51.100.7"));
      // straight to the origin with a forged header → the connecting address
      assert.equal(clientIp(h("198.51.100.7", "203.0.113.5")), "198.51.100.7");
      assert.equal(clientIp(h("10.0.0.1, 198.51.100.7", "203.0.113.5")), "198.51.100.7");
      // through Cloudflare → the visitor
      assert.equal(clientIp(h("203.0.113.5, 172.68.1.2", "203.0.113.5")), "203.0.113.5");
      assert.equal(clientIp(h("2a06:98c1::1", "2001:db8::77")), "2001:db8::77");
      assert.equal(clientIp(h("172.68.1.2", "not-an-ip")), "172.68.1.2");
      env.BEHIND_CLOUDFLARE = "0";
      assert.equal(clientIp(h("203.0.113.5, 172.68.1.2", "203.0.113.5")), "172.68.1.2");
      assert.equal(clientIp(new Headers()), "0.0.0.0");
    } finally {
      delete env.BEHIND_CLOUDFLARE;
    }
  });
  await check("CORS wildcards on shared hosting / registry suffixes are refused", () => {
    assert.equal(originAllowed("https://attacker.vercel.app", ["*.vercel.app"]), false);
    assert.equal(originAllowed("https://attacker.netlify.app", ["https://*.netlify.app"]), false);
    assert.equal(originAllowed("https://evil.myshopify.com", ["*.myshopify.com"]), false);
    assert.equal(originAllowed("https://x.press.ma", ["*.press.ma"]), false);
    assert.equal(originAllowed("https://x.co.ma", ["*.co.ma"]), false);
    assert.equal(originAllowed("https://www.shop.ma", ["*.shop.ma"]), true);
    assert.equal(originAllowed("https://myshop.vercel.app", ["https://myshop.vercel.app"]), true);
  });
  await check("SEC-23: allow-list entries naming the platform's own namespace are refused (exact and wildcard)", () => {
    setS(true);
    try {
      const refused: [string, string][] = [
        ["https://platform.test", "https://platform.test"],
        ["https://old-platform.test", "old-platform.test"],
        ["https://console.platform.test", "https://console.platform.test"],
        ["https://shops.test", "shops.test"],
        ["https://baraka-home.shops.test", "https://baraka-home.shops.test"],
        ["https://www.shops.test", "*.shops.test"],
        ["https://a.b.shops.test", "*.b.shops.test"],
        ["https://www.platform.test", "*.platform.test"],
      ];
      for (const [origin, entry] of refused) {
        assert.equal(originAllowed(origin, [entry]), false, `${entry} must never be honoured`);
        assert.equal(exportOriginProblem(entry), "platform", entry);
      }
      assert.equal(exportOriginProblem("*.vercel.app"), "shared_suffix");
      assert.equal(exportOriginProblem("ftp://shop.ma"), "invalid");
      assert.equal(exportOriginProblem("https://shop.ma"), null);
      assert.equal(exportOriginProblem("*.shop.ma"), null);
      // the platform's temporary Hostinger host never claims every other Hostinger site
      env.PLATFORM_URL = "https://lightgreen-hippopotamus-140853.hostingersite.com";
      assert.equal(registrableDomain("lightgreen-hippopotamus-140853.hostingersite.com"), "lightgreen-hippopotamus-140853.hostingersite.com");
      assert.equal(registrableDomain("www.shop.co.ma"), "shop.co.ma");
      assert.equal(originAllowed("https://seller.hostingersite.com", ["https://seller.hostingersite.com"]), true);
      assert.equal(originAllowed("https://lightgreen-hippopotamus-140853.hostingersite.com", ["https://lightgreen-hippopotamus-140853.hostingersite.com"]), false);
    } finally {
      env.PLATFORM_URL = "https://platform.test";
      setS(false);
    }
  });
  await check("live Origin: the store's hosts only; S mode separates stores (V6); no reflected Host; cross-site refused", () => {
    const A = { id: "01JAAAAAAAAAAAAAAAAAAAAAAA", handle: "atlas-argan", primaryDomain: null };
    const r = (origin: string | null, headers: Record<string, string> = {}) =>
      new Request("https://platform.test/api/public/order", { method: "POST", headers: { host: "platform.test", ...(origin ? { origin } : {}), ...headers } });
    const live = { store: A, allowedOrigins: null };
    assert.deepEqual(checkOrigin(r("https://platform.test"), live), { ok: true, cors: null, noOrigin: false });
    assert.deepEqual(checkOrigin(r("https://old-platform.test"), live), { ok: true, cors: null, noOrigin: false }, "legacy HTML keeps ordering");
    assert.deepEqual(checkOrigin(r(null), live), { ok: true, cors: null, noOrigin: true });
    assert.deepEqual(checkOrigin(r(null, { "sec-fetch-site": "cross-site" }), live), { ok: false });
    assert.deepEqual(checkOrigin(r("https://platform.test", { "sec-fetch-site": "cross-site" }), live), { ok: false });
    // production never reflects Host / X-Forwarded-Host
    assert.deepEqual(checkOrigin(r("https://evil.test", { host: "evil.test", "x-forwarded-host": "evil.test" }), live), { ok: false });
    setS(true);
    try {
      assert.deepEqual(checkOrigin(r("https://atlas-argan.shops.test"), live), { ok: true, cors: null, noOrigin: false });
      assert.deepEqual(checkOrigin(r("https://baraka-home.shops.test"), live), { ok: false }, "store B's subdomain posting A's key (V6)");
      // an export allow-list cannot re-admit a sibling store host
      assert.deepEqual(checkOrigin(r("https://baraka-home.shops.test"), { store: A, allowedOrigins: ["https://baraka-home.shops.test"] }), { ok: false });
      assert.deepEqual(checkOrigin(r("https://shop.example"), { store: A, allowedOrigins: ["https://shop.example"] }), { ok: true, cors: "https://shop.example", noOrigin: false });
    } finally {
      setS(false);
    }
  });
  await check("risk: export orders that skipped an enabled captcha reach the CAPI cut-off", async () => {
    const { CONVERSION_MAX_RISK } = await import("@/lib/orders/conversions");
    assert.ok(UNPROTECTED_MIN_SCORE >= CONVERSION_MAX_RISK);
    const base: RiskInput = { honeypot: false, t: 30_000, ua: "Mozilla/5.0", captcha: "unprotected", noOrigin: false, ipOrders24h: 0, badHistory: 0, delivered: 0 };
    assert.ok(scoreRisk(base).score >= CONVERSION_MAX_RISK);
    assert.ok(scoreRisk({ ...base, delivered: 5 }).score >= CONVERSION_MAX_RISK);
    assert.ok(scoreRisk({ ...base, captcha: "missing" }).score < CONVERSION_MAX_RISK);
    const flagged = scoreRisk({ ...base, captcha: "off", pageBurst: true, duplicate: true });
    assert.deepEqual(flagged.flags, ["page_burst", "duplicate"]);
    assert.equal(flagged.score, 70);
  });
  await check("errorSummary never prints query parameters or driver messages", () => {
    const pii = ["+212661234567", "Fatima Zahra", "12 Rue des Roses"];
    const driver = Object.assign(new Error(`Duplicate entry '${pii[0]}' for key 'x'`), {
      code: "ER_DUP_ENTRY",
      errno: 1062,
      sqlState: "23000",
      sqlMessage: `Duplicate entry '${pii[0]}' for key 'x'`,
    });
    const q = new DrizzleQueryError("insert into `orders` (`name`, `phone`, `address`) values (?, ?, ?)", pii, driver);
    const s = errorSummary(q);
    assert.equal(s, "Error: ER_DUP_ENTRY (1062)");
    const bare = new DrizzleQueryError("select 1 where phone = ?", [pii[0]], undefined as unknown as Error);
    assert.equal(errorSummary(bare), "Error: query_failed");
    assert.equal(errorSummary(new TypeError("boom")), "TypeError: boom");
    assert.equal(errorSummary("x"), "unknown error");
  });
  await check("decoy answer: the page's currency, else the store's (ORD-07)", async () => {
    const { decoyResponse } = await import("@/lib/orders/create");
    const d = decoyResponse(null, undefined, { currency: "EUR" });
    assert.ok(d.ok && d.currency === "EUR" && d.total === 0 && /^CMD-[0-9A-Z]{6}$/.test(d.orderId));
  });
}

/* ------------------------------------------------------------------ */
/* Database                                                            */
/* ------------------------------------------------------------------ */

type PublicPageTarget = import("@/lib/tenancy/public").PublicPageTarget;
type OrderPayload = import("@/lib/orders/contract").OrderPayload;
type PageDocT = import("@/lib/page/schema").PageDoc;

interface Seed {
  /** store #1 (LEGACY_STORE_ID), the owner of the single-tenant sheet and CAPI tokens */
  L: string;
  keyL: string;
  A: string;
  B: string;
  R: string;
  C: string;
  keyA: string;
  keyA2: string;
  keyB: string;
  keyR: string;
  keyC: string;
  keyExportA: string;
  keyExportB: string;
  pageA: string;
  pageA2: string;
  pageB: string;
  doc: PageDocT;
}

const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

async function seed(): Promise<Seed> {
  const mysql = (await import("mysql2/promise")).default;
  const { newId } = await import("@/lib/db/ids");
  const { getFixture } = await import("@/lib/page/fixtures");
  const { validateDoc } = await import("@/lib/page/validate");
  const fx = getFixture("argan", { now: "2026-10-24T12:00:00.000Z", locale: "fr" });
  const { doc } = validateDoc({ ...fx.doc, tracking: { metaPixelId: "123456789012345" } });
  if (!doc) throw new Error("fixture document invalid");
  const docJson = JSON.stringify(doc);
  const conn = await mysql.createConnection({ uri: env.DATABASE_URL!, charset: "utf8mb4_unicode_ci", timezone: "Z" });
  try {
    const store = async (handle: string, status: string, currency = "MAD") => {
      const id = newId();
      await conn.query("INSERT INTO stores (id, handle, name, status, brand_seed, currency) VALUES (?, ?, ?, ?, ?, ?)", [id, handle, handle, status, randomBytes(8).toString("hex"), currency]);
      return id;
    };
    const page = async (storeId: string, slug: string) => {
      const id = newId();
      const versionId = newId();
      const key = `pk_${randomBytes(12).toString("base64url")}`;
      await conn.query("INSERT INTO pages (id, store_id, slug, name, status, locale, public_key, draft) VALUES (?, ?, ?, ?, 'published', 'fr', ?, ?)", [id, storeId, slug, slug, key, docJson]);
      const html = `<!DOCTYPE html><title>${slug}</title>`;
      await conn.query(
        "INSERT INTO page_versions (id, store_id, page_id, kind, doc, html, thank_you_html, csp, thank_you_csp, etag, checksum, runtime_v) VALUES (?, ?, ?, 'publish', ?, ?, ?, ?, ?, ?, ?, 2)",
        [versionId, storeId, id, docJson, html, "<!DOCTYPE html><title>merci</title>", "default-src 'self'", "default-src 'self'", sha(html), sha(docJson)],
      );
      await conn.query("UPDATE pages SET published_version_id = ? WHERE id = ?", [versionId, id]);
      return { id, key, versionId };
    };
    const exportOf = async (storeId: string, p: { id: string; versionId: string }, origins: string[]) => {
      const key = `pk_${randomBytes(12).toString("base64url")}`;
      await conn.query("INSERT INTO exports (id, store_id, page_id, version_id, mode, public_key, allowed_origins) VALUES (?, ?, ?, ?, 'connected', ?, ?)", [
        newId(), storeId, p.id, p.versionId, key, JSON.stringify(origins),
      ]);
      return key;
    };
    const { LEGACY_STORE_ID } = await import("@/lib/db/store-handles");
    await conn.query("INSERT INTO stores (id, handle, name, status, brand_seed, currency) VALUES (?, 'store-1', 'Store 1', 'active', ?, 'MAD')", [LEGACY_STORE_ID, randomBytes(8).toString("hex")]);
    const l = await page(LEGACY_STORE_ID, "argan");
    const A = await store("atlas-argan", "active");
    const B = await store("baraka-home", "active", "EUR");
    const R = await store("rif-goods", "restricted");
    const C = await store("cedre-shop", "pending");
    const a = await page(A, "argan");
    const a2 = await page(A, "serum");
    const b = await page(B, "argan");
    const r = await page(R, "argan");
    const c = await page(C, "argan");
    return {
      L: LEGACY_STORE_ID, keyL: l.key,
      A, B, R, C,
      keyA: a.key, keyA2: a2.key, keyB: b.key, keyR: r.key, keyC: c.key,
      keyExportA: await exportOf(A, a, ["https://shop.example"]),
      // store B lists store A's subdomain (SEC-23: never honoured)
      keyExportB: await exportOf(B, b, ["https://atlas-argan.shops.test", "*.shops.test"]),
      pageA: a.id, pageA2: a2.id, pageB: b.id, doc,
    };
  } finally {
    await conn.end();
  }
}

async function database() {
  console.log(`database checks (${DB})`);
  const mysql = (await import("mysql2/promise")).default;
  const root = await mysql.createConnection({ host: "127.0.0.1", port: 3306, user: "root", charset: "utf8mb4_unicode_ci", timezone: "Z" });
  await root.query(`DROP DATABASE IF EXISTS \`${DB}\``);
  await root.query(`CREATE DATABASE \`${DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  let s: Seed;
  try {
    const { runMigrations } = await import("@/lib/db/migrate");
    const m = await runMigrations();
    assert.equal(m.status, "applied");
    s = await seed();
  } catch (err) {
    failures++;
    console.log("  ✗ migrate + seed\n     ", err instanceof Error ? err.message : err);
    await root.end();
    return;
  }

  try {
    await scenarios(s);
  } finally {
    const { pool } = await import("@/lib/db/client");
    await pool().end().catch(() => undefined);
    if (!KEEP) await root.query(`DROP DATABASE IF EXISTS \`${DB}\``);
    await root.end();
  }
}

async function scenarios(s: Seed) {
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const { and, eq, sql } = await import("drizzle-orm");
  const { orders, leads, statsDaily, statsVisitors, blocklist } = schema;
  const create = await import("@/lib/orders/create");
  const { createOrder, createOrderRow, OrderIdemTaken, shopperActor, upsellTokenFor, STORE_FLOOD_LIMIT } = create;
  const { upsertLead } = await import("@/lib/orders/leads");
  const { acceptUpsell } = await import("@/lib/orders/upsell");
  const { recordEvent } = await import("@/lib/stats");
  const { hashIp } = await import("@/lib/security/crypto");
  const { resetBurstLimits } = await import("@/lib/security/burst-limit");
  const { storeBucket } = await import("@/lib/security/rate-limit");
  const pub = await import("@/lib/tenancy/public");
  const hooks = await import("@/lib/orders/hooks");
  const { UNPROTECTED_MIN_SCORE } = await import("@/lib/orders/risk");
  const { getMarket } = await import("@/lib/markets");
  const { offerUnits } = await import("@/lib/page/catalog");
  const { isChoiceGroup } = await import("@/lib/page/schema");
  const { newId } = await import("@/lib/db/ids");

  const target = async (key: string, purpose: "order" | "event" = "order"): Promise<PublicPageTarget> => {
    const t = await pub.resolvePublicTarget(key, { purpose });
    if (!t) throw new Error(`page key ${key} does not resolve`);
    return t;
  };
  const tA = await target(s.keyA);
  const tA2 = await target(s.keyA2);
  const tB = await target(s.keyB);
  const tExportA = await target(s.keyExportA);

  const { doc } = s;
  const bundle = doc.offers.bundles[0]!;
  const variants = Array.from({ length: offerUnits(bundle) }, () =>
    Object.fromEntries(doc.items[0]!.groups.filter(isChoiceGroup).map((g) => [g.id, (g.options.find((o) => !o.soldOut) ?? g.options[0]!).id])),
  );
  const city = getMarket(doc.market).cities?.[0]?.value ?? "Casablanca";
  let phoneSeq = 0;
  const newPhone = () => `066${String((Date.now() + phoneSeq * 7919) % 1_000_000).padStart(6, "0")}${phoneSeq++ % 10}`;
  const payload = (phone: string, pageKey: string, extra: Partial<OrderPayload> = {}): OrderPayload =>
    ({
      pageKey,
      idem: randomUUID(),
      eventId: `qa_${randomBytes(6).toString("hex")}`,
      bundleId: bundle.id,
      variants,
      bump: false,
      name: "Qa Tester",
      phone,
      city,
      address: "12 Rue Test, Maarif",
      email: "",
      website: "",
      t: 30_000,
      utm: {},
      ...extra,
    }) as OrderPayload;
  let ipSeq = 1;
  const newIp = () => `198.51.${100 + Math.floor(ipSeq / 250)}.${(ipSeq++ % 250) + 1}`;
  const order = (phone: string, ip: string, extra: { honeypot?: boolean; noOrigin?: boolean; target?: PublicPageTarget; test?: boolean; turnstile?: { siteKey: string; secretKey: string } | null; idem?: string } = {}) => {
    const t = extra.target ?? tA;
    const p = payload(phone, t.kind === "export" ? s.keyExportA : s.keyA, extra.idem ? { idem: extra.idem } : {});
    return hushed(() => createOrder(p, { ip, ua: "Mozilla/5.0 (QA)", target: t, noOrigin: extra.noOrigin ?? false, honeypot: extra.honeypot, test: extra.test, ...(extra.turnstile !== undefined ? { turnstile: extra.turnstile } : {}) }));
  };
  const orderId = (r: { response: import("@/lib/orders/contract").OrderResponse }) => (r.response as { orderId: string }).orderId;
  const stored = async (id: string) => (await db.select().from(orders).where(eq(orders.id, id)).limit(1))[0];
  const bucketCount = async (bucket: string) => {
    const [rows] = (await db.execute(sql`SELECT count FROM rate_limits WHERE bucket = ${bucket}`)) as unknown as [{ count: number }[]];
    return Number(rows[0]?.count ?? 0);
  };
  const presetBucket = (bucket: string, count: number) =>
    db.execute(sql`INSERT INTO rate_limits (bucket, count, reset_at) VALUES (${bucket}, ${count}, DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 600 SECOND))
      ON DUPLICATE KEY UPDATE count = ${count}, reset_at = DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 600 SECOND)`);

  await check("resolvePublicTarget: the target's store comes from the key's row (ORD-01)", () => {
    assert.equal(tA.storeId, s.A);
    assert.equal(tA.store.id, s.A);
    assert.equal(tA.scope.storeId, s.A);
    assert.equal(tA.scope.kind, "public");
    assert.equal(tB.storeId, s.B);
    assert.equal(tExportA.kind, "export");
    assert.equal(tExportA.storeId, s.A);
  });

  await check("honeypot traffic uses up neither the victim phone's quota nor the page's", async () => {
    const victim = newPhone();
    for (let i = 0; i < 5; i++) {
      const r = await order(victim, newIp(), { honeypot: true });
      assert.equal(r.response.ok, true, "decoy answer");
      assert.equal(r.sync, false);
    }
    const real = await order(victim, newIp());
    assert.equal(real.response.ok, true, `real customer refused: ${JSON.stringify(real.response)}`);
    assert.equal(await bucketCount(storeBucket(tA.scope, "order:page", s.pageA)), 1, "only the real order counted for the page");
    assert.equal(await bucketCount(storeBucket(tA.scope, "orders")), 1, "honeypots never count for the store flood breaker");
  });

  await check("a page flood flags orders instead of refusing real shoppers", async () => {
    await presetBucket(storeBucket(tA.scope, "order:page", s.pageA), 5000);
    const r = await order(newPhone(), newIp());
    assert.equal(r.response.ok, true, `refused: ${JSON.stringify(r.response)}`);
    const row = await stored(orderId(r));
    assert.ok(row?.flags?.includes("page_burst"), `flags: ${JSON.stringify(row?.flags)}`);
    await db.execute(sql`DELETE FROM rate_limits WHERE bucket = ${storeBucket(tA.scope, "order:page", s.pageA)}`);
  });

  await check("duplicate: only the ordering network hears it, never with an order id", async () => {
    const phone = newPhone();
    const home = newIp();
    assert.equal((await order(phone, home)).response.ok, true);
    const stranger = await order(phone, newIp());
    assert.equal(stranger.response.ok, true, `stranger learned something: ${JSON.stringify(stranger.response)}`);
    assert.ok((await stored(orderId(stranger)))?.flags?.includes("duplicate"));
    assert.deepEqual((await order(phone, home)).response, { ok: false, error: "duplicate" });
  });

  await check("per-phone limit counts stored orders; a cancelled one frees a slot", async () => {
    const phone = newPhone();
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) {
      const r = await order(phone, newIp());
      assert.equal(r.response.ok, true, `order ${i + 1}: ${JSON.stringify(r.response)}`);
      ids.push(orderId(r));
    }
    const fifth = await order(phone, newIp());
    assert.deepEqual(fifth.response, { ok: false, error: "rate_limited" });
    assert.ok(fifth.retryAfter && fifth.retryAfter > 86_000 && fifth.retryAfter <= 86_400, `retryAfter ${fifth.retryAfter}`);
    // ORD-04: the same phone still orders in store B
    assert.equal((await order(phone, newIp(), { target: tB })).response.ok, true, "store B is not limited by store A's orders");
    await db.update(orders).set({ status: "cancelled" }).where(eq(orders.id, ids[0]!));
    assert.equal((await order(phone, newIp())).response.ok, true);
  });

  await check("per-IP limit holds across a whole IPv6 /64, in its store only (ORD-02)", async () => {
    const prefix = `2001:db8:ab:${(Date.now() % 0xffff).toString(16)}`;
    const net = (n: number) => `${prefix}::${n.toString(16)}`;
    for (let i = 1; i <= 8; i++) assert.equal((await order(newPhone(), net(i))).response.ok, true, `order ${i}`);
    assert.deepEqual((await order(newPhone(), net(0xbeef))).response, { ok: false, error: "rate_limited" });
    assert.equal((await order(newPhone(), net(0xcafe), { target: tB })).response.ok, true, "the same network orders in store B");
    assert.equal(await bucketCount(`s:${s.A}:order:ip:${hashIp(net(1))}`), 9);
  });

  await check("store flood breaker: s:<sid>:orders at its limit answers 429 in that store only (ORD-21)", async () => {
    await presetBucket(storeBucket(tA.scope, "orders"), STORE_FLOOD_LIMIT);
    const refused = await order(newPhone(), newIp());
    assert.deepEqual(refused.response, { ok: false, error: "rate_limited" });
    assert.ok((refused.retryAfter ?? 0) > 0);
    assert.equal((await order(newPhone(), newIp(), { honeypot: true })).response.ok, true, "a bot still gets its decoy");
    assert.equal((await order(newPhone(), newIp(), { target: tB })).response.ok, true, "store B keeps taking orders");
    await db.execute(sql`DELETE FROM rate_limits WHERE bucket = ${storeBucket(tA.scope, "orders")}`);
  });

  await check("blocklist: one store's entry never blocks another store's shopper (ORD-03)", async () => {
    const phone = newPhone();
    const { normalizePhone } = await import("@/lib/markets/phone");
    const e164 = normalizePhone(phone, doc.form.phoneCountry)!.e164;
    await db.insert(blocklist).values({ id: newId(), storeId: s.B, kind: "phone", value: e164 });
    assert.equal((await order(phone, newIp())).response.ok, true, "store A ignores store B's blocklist");
    assert.deepEqual((await order(phone, newIp(), { target: tB })).response, { ok: false, error: "blocked" });
  });

  await check("risk history is the store's: store A's fake orders never raise store B's score (ORD-05)", async () => {
    const phone = newPhone();
    const first = await order(phone, newIp());
    await db.update(orders).set({ status: "fake" }).where(eq(orders.id, orderId(first)));
    const second = await order(phone, newIp(), { target: tA2 });
    const inB = await order(phone, newIp(), { target: tB });
    const a = await stored(orderId(second));
    const b = await stored(orderId(inB));
    assert.ok(a && b && a.riskScore > b.riskScore, `A ${a?.riskScore} vs B ${b?.riskScore}`);
    assert.equal(b!.storeId, s.B);
  });

  await check("rows carry the target's store; the page's stats are bumped in that store (ORD-06, STAT-02)", async () => {
    const r = await order(newPhone(), newIp(), { target: tB });
    const row = await stored(orderId(r));
    assert.equal(row?.storeId, s.B);
    assert.equal(row?.isTest, false);
    assert.equal(row?.sheetStatus, "pending");
    assert.equal(r.sync, true);
    assert.ok(r.conversion && r.conversion.orderId === row!.id, "a real order with a Meta pixel builds its Purchase event");
    const [st] = await db.select({ n: sql<number>`SUM(${statsDaily.orders})` }).from(statsDaily).where(and(eq(statsDaily.pageId, s.pageB), eq(statsDaily.storeId, s.B)));
    assert.ok(Number(st?.n) >= 1);
  });

  await check("test orders (D54): is_test, flag test, sheet disabled, no Purchase, no stats; never a duplicate of a real order", async () => {
    const phone = newPhone();
    const ip = newIp();
    const before = await db.select({ n: sql<number>`COALESCE(SUM(${statsDaily.orders}), 0)` }).from(statsDaily).where(eq(statsDaily.pageId, s.pageA2));
    const real = await order(phone, ip, { target: tA2 });
    assert.equal(real.response.ok, true);
    const test = await order(phone, ip, { target: tA2, test: true });
    assert.equal(test.response.ok, true, `test order refused: ${JSON.stringify(test.response)}`);
    assert.equal(test.sync, false);
    assert.equal(test.conversion, undefined, "no server-side Purchase for a test order");
    const row = await stored(orderId(test));
    assert.equal(row?.isTest, true);
    assert.ok(row?.flags?.includes("test"), JSON.stringify(row?.flags));
    assert.equal(row?.sheetStatus, "disabled");
    assert.equal(row?.storeId, s.A);
    const after = await db.select({ n: sql<number>`COALESCE(SUM(${statsDaily.orders}), 0)` }).from(statsDaily).where(eq(statsDaily.pageId, s.pageA2));
    assert.equal(Number(after[0]?.n) - Number(before[0]?.n), 1, "the real order counted, the test order did not");
    // a second test from the same network is a duplicate of the first test, not of the real order
    assert.deepEqual((await order(phone, ip, { target: tA2, test: true })).response, { ok: false, error: "duplicate" });
  });

  await check("connected export cannot skip an enabled Turnstile (the store's keys)", async () => {
    const keys = { siteKey: "1x00000000000000000000AA", secretKey: "1x0000000000000000000000000000000AA" };
    const script = await order(newPhone(), newIp(), { target: tExportA, noOrigin: true, turnstile: keys });
    assert.deepEqual(script.response, { ok: false, error: "invalid" });
    const browser = await order(newPhone(), newIp(), { target: tExportA, turnstile: keys });
    assert.equal(browser.response.ok, true);
    assert.equal(browser.conversion, undefined, "no server-side Purchase for an unprotected order");
    const row = await stored(orderId(browser));
    assert.ok((row?.riskScore ?? 0) >= UNPROTECTED_MIN_SCORE && row?.flags?.includes("captcha_missing"));
    assert.equal(row?.source, "export");
  });

  await check("createOrderRow (D72): idem replay in the store, another store's idem refused", async () => {
    const draft = (idem: string, pageId: string) => ({
      pageId, versionId: null, exportId: null, source: "live" as const, status: "new", name: "Qa", phone: "+212600000001", productName: "Argan",
      items: { bundleId: "b", bundleLabel: "x1", qty: 1, unitPrice: 100, variants: [] }, qty: 1, subtotal: 100, shipping: 0, total: 100, currency: "MAD", idem,
    });
    const idem = randomUUID();
    const ctx = (scope: PublicPageTarget["scope"]) => ({ scope, test: false, upsell: true, actor: shopperActor("198.51.100.250"), conversion: null });
    const first = await hushed(() => createOrderRow(draft(idem, s.pageA), ctx(tA.scope)));
    assert.equal(first.replayed, false);
    assert.ok(first.upsellToken && first.upsellToken === upsellTokenFor(first.orderId, idem));
    const again = await hushed(() => createOrderRow(draft(idem, s.pageA), ctx(tA.scope)));
    assert.deepEqual({ ...again, conversion: null }, { orderId: first.orderId, upsellToken: first.upsellToken, replayed: true, conversion: null });
    await assert.rejects(() => hushed(() => createOrderRow(draft(idem, s.pageB), ctx(tB.scope))), (e: unknown) => e instanceof OrderIdemTaken);
    const rows = await db.select({ id: orders.id, storeId: orders.storeId }).from(orders).where(eq(orders.idem, idem));
    assert.deepEqual(rows, [{ id: first.orderId, storeId: s.A }]);
  });

  await check("order hooks: inTx sees the row in its transaction and rolls it back on failure; afterCommit gets the Purchase", async () => {
    const list = hooks.ORDER_HOOKS as import("@/lib/orders/hooks").OrderHook[];
    const seen: { phase: string; storeId: string; orderId: string; test: boolean; conversion: boolean }[] = [];
    let fail = false;
    list.push(
      {
        name: "qa.intx",
        phase: "inTx",
        on: ["created"],
        async run(scope, e, tx) {
          if (e.on !== "created" || !tx) throw new Error("no created event / no transaction");
          seen.push({ phase: "inTx", storeId: scope.storeId, orderId: e.order.id, test: e.order.isTest, conversion: !!e.conversion });
          if (fail) throw new Error("qa: inTx refusal");
        },
      },
      {
        name: "qa.after",
        phase: "afterCommit",
        on: ["created"],
        async run(scope, e) {
          if (e.on === "created") seen.push({ phase: "afterCommit", storeId: scope.storeId, orderId: e.order.id, test: e.order.isTest, conversion: !!e.conversion });
        },
      },
    );
    try {
      const r = await order(newPhone(), newIp());
      assert.equal(r.response.ok, true);
      const id = orderId(r);
      assert.deepEqual(seen, [
        { phase: "inTx", storeId: s.A, orderId: id, test: false, conversion: false },
        { phase: "afterCommit", storeId: s.A, orderId: id, test: false, conversion: true },
      ]);
      seen.length = 0;
      const t = await order(newPhone(), newIp(), { test: true });
      assert.deepEqual(seen.map((x) => [x.phase, x.test, x.conversion]), [["inTx", true, false], ["afterCommit", true, false]]);
      assert.equal(orderId(t), seen[0]!.orderId);
      seen.length = 0;
      fail = true;
      const idem = randomUUID();
      await assert.rejects(() => order(newPhone(), newIp(), { idem }), /qa: inTx refusal/);
      assert.equal(seen.length, 1);
      assert.equal(await stored(seen[0]!.orderId), undefined, "the order row rolled back with the hook");
      assert.equal((await db.select({ id: orders.id }).from(orders).where(eq(orders.idem, idem))).length, 0);
    } finally {
      list.splice(list.findIndex((h) => h.name === "qa.intx"), 2);
    }
  });

  await check("leads stay in their store: row, network budget, test flag, another store's idem untouched (ORD-18)", async () => {
    const lead = (t: PublicPageTarget, key: string, extra: { idem?: string; ip?: string; test?: boolean; name?: string } = {}) =>
      upsertLead({ pageKey: key, idem: extra.idem ?? randomUUID(), phone: newPhone(), name: extra.name, city, utm: {} } as never, { ip: extra.ip ?? newIp(), target: t, test: extra.test });
    const idem = randomUUID();
    assert.deepEqual(await lead(tA, s.keyA, { idem, name: "Amina" }), { stored: true });
    const [row] = await db.select().from(leads).where(eq(leads.idem, idem));
    assert.equal(row?.storeId, s.A);
    assert.equal(row?.isTest, false);
    // the same idem posted to store B's page changes nothing in store A's row
    await lead(tB, s.keyB, { idem, name: "Intruder" });
    const [after] = await db.select().from(leads).where(eq(leads.idem, idem));
    assert.equal(after?.name, "Amina");
    assert.equal(after?.storeId, s.A);
    const testIdem = randomUUID();
    await lead(tA, s.keyA, { idem: testIdem, test: true });
    assert.equal((await db.select().from(leads).where(eq(leads.idem, testIdem)))[0]?.isTest, true);
    const ip = newIp();
    await presetBucket(storeBucket(tA.scope, "lead:ip", hashIp(ip)), 30);
    assert.deepEqual(await lead(tA, s.keyA, { ip }), { stored: false }, "store A's budget for this network is spent");
    assert.deepEqual(await lead(tB, s.keyB, { ip }), { stored: true }, "store B has its own");
  });

  await check("upsell: only in the order's store; a test order's upsell stays out of the stats (ORD-17)", async () => {
    const r = await order(newPhone(), newIp());
    assert.equal(r.response.ok, true);
    const token = (r.response as { upsellToken?: string }).upsellToken;
    assert.ok(token, "the page's upsell is on: a token is minted");
    const input = { orderId: orderId(r), token: token! };
    const found = await pub.resolveUpsellOrder(input.orderId);
    assert.equal(found?.store.id, s.A);
    assert.deepEqual((await acceptUpsell(tB.scope, input, { ip: newIp() })).response, { ok: false, error: "invalid" }, "store B's scope cannot touch store A's order");
    const accepted = await acceptUpsell(found!.scope, input, { ip: newIp() });
    assert.equal(accepted.response.ok, true, JSON.stringify(accepted.response));
    assert.equal(accepted.sync, true);
    assert.deepEqual((await acceptUpsell(found!.scope, input, { ip: newIp() })).response, { ok: false, error: "invalid" }, "single use");
    // a test order's upsell: accepted, no stats, no sheet
    const t = await order(newPhone(), newIp(), { test: true, target: tA2 });
    const tToken = (t.response as { upsellToken?: string }).upsellToken!;
    const before = await db.select({ r: sql<number>`COALESCE(SUM(${statsDaily.revenue}), 0)` }).from(statsDaily).where(eq(statsDaily.pageId, s.pageA2));
    const tUp = await acceptUpsell(tA2.scope, { orderId: orderId(t), token: tToken }, { ip: newIp() });
    assert.equal(tUp.response.ok, true);
    assert.equal(tUp.sync, false);
    const after = await db.select({ r: sql<number>`COALESCE(SUM(${statsDaily.revenue}), 0)` }).from(statsDaily).where(eq(statsDaily.pageId, s.pageA2));
    assert.equal(Number(after[0]?.r), Number(before[0]?.r));
    assert.equal(await pub.resolveUpsellOrder("CMD-ZZZZZZ"), null);
  });

  await check("unique-visitor credit is capped per network and page", async () => {
    const ip = newIp();
    for (let i = 0; i < 60; i++) await recordEvent(tB.scope, s.pageB, { type: "view", vid: `qa${randomBytes(8).toString("hex")}` }, ip);
    await recordEvent(tB.scope, s.pageB, { type: "view", vid: `qa${randomBytes(8).toString("hex")}` }, newIp());
    const [st] = await db
      .select({ views: sql<number>`SUM(${statsDaily.views})`, uniques: sql<number>`SUM(${statsDaily.uniques})` })
      .from(statsDaily)
      .where(eq(statsDaily.pageId, s.pageB));
    assert.equal(Number(st?.views), 61);
    assert.equal(Number(st?.uniques), 51);
    const [m] = await db.select({ n: sql<number>`COUNT(*)` }).from(statsVisitors).where(eq(statsVisitors.pageId, s.pageB));
    assert.equal(Number(m?.n), 51, "no visitor markers above the cap");
  });

  /* ---------------- the route handlers ---------------- */

  const orderRoute = await import("@/app/api/public/order/route");
  const leadRoute = await import("@/app/api/public/lead/route");
  const eventRoute = await import("@/app/api/public/event/route");
  const upsellRoute = await import("@/app/api/public/upsell/route");
  type Next = Parameters<typeof orderRoute.POST>[0];
  const post = async (route: { POST: (r: Next) => Promise<Response> }, path: string, body: unknown, headers: Record<string, string> = {}) => {
    resetBurstLimits();
    const req = new Request(`https://platform.test${path}`, {
      method: "POST",
      headers: { host: "platform.test", "content-type": "application/json", "x-forwarded-for": newIp(), "user-agent": "Mozilla/5.0 (QA)", origin: "https://platform.test", ...headers },
      body: JSON.stringify(body),
    });
    const res = await hushed(() => route.POST(req as Next));
    const text = await res.text();
    return { status: res.status, headers: res.headers, body: text ? (JSON.parse(text) as Record<string, unknown>) : null };
  };
  const tokenA = pub.signTestToken(s.A);
  const tokenB = pub.signTestToken(s.B);

  await check("route /order: per store, ?sg-test signed for the store makes a test order, another store's token does not", async () => {
    const real = await post(orderRoute, "/api/public/order", payload(newPhone(), s.keyA));
    assert.equal(real.status, 200, JSON.stringify(real.body));
    assert.equal((await stored(real.body!.orderId as string))?.storeId, s.A);
    const test = await post(orderRoute, `/api/public/order?sg-test=${encodeURIComponent(tokenA)}`, payload(newPhone(), s.keyA));
    assert.equal(test.status, 200);
    assert.equal((await stored(test.body!.orderId as string))?.isTest, true);
    const foreign = await post(orderRoute, `/api/public/order?sg-test=${encodeURIComponent(tokenB)}`, payload(newPhone(), s.keyA));
    assert.equal(foreign.status, 200);
    assert.equal((await stored(foreign.body!.orderId as string))?.isTest, false, "store B's token on store A's page is an ordinary visit");
  });

  await check("route /order: restricted and pending stores answer like an unknown key; the page key decides the store", async () => {
    for (const key of [s.keyR, s.keyC, "pk_unknown_page_key_0"]) {
      const r = await post(orderRoute, "/api/public/order", payload(newPhone(), key));
      assert.deepEqual([r.status, r.body], [404, { ok: false, error: "unavailable" }], key);
    }
    const [n] = await db.select({ n: sql<number>`COUNT(*)` }).from(orders).where(eq(orders.storeId, s.R));
    assert.equal(Number(n?.n), 0);
  });

  await check("route /order: store-host Origins (P: platform + legacy; S: the store's own subdomain only), cross-site refused", async () => {
    assert.equal((await post(orderRoute, "/api/public/order", payload(newPhone(), s.keyA), { origin: "https://old-platform.test" })).status, 200);
    assert.equal((await post(orderRoute, "/api/public/order", payload(newPhone(), s.keyA), { origin: "https://evil.test", host: "evil.test" })).status, 403);
    // no Origin (an empty header reads as none) but a browser's cross-site fetch metadata
    assert.equal((await post(orderRoute, "/api/public/order", payload(newPhone(), s.keyA), { origin: "", "sec-fetch-site": "cross-site" })).status, 403);
    setS(true);
    try {
      assert.equal((await post(orderRoute, "/api/public/order", payload(newPhone(), s.keyA), { origin: "https://atlas-argan.shops.test" })).status, 200);
      const cross = await post(orderRoute, "/api/public/order", payload(newPhone(), s.keyA), { origin: "https://baraka-home.shops.test" });
      assert.deepEqual([cross.status, cross.body], [403, { ok: false, error: "unavailable" }], "store B's subdomain posting store A's key (V6)");
      // store B's export lists store A's subdomain and *.shops.test: never honoured (SEC-23)
      const listed = await post(orderRoute, "/api/public/order", payload(newPhone(), s.keyExportB), { origin: "https://atlas-argan.shops.test" });
      assert.equal(listed.status, 403);
      assert.equal(listed.headers.get("access-control-allow-origin"), null);
    } finally {
      setS(false);
    }
  });

  await check("route /order: an export's own allow-list gets CORS; anything else 403", async () => {
    const okRes = await post(orderRoute, "/api/public/order", payload(newPhone(), s.keyExportA), { origin: "https://shop.example" });
    assert.equal(okRes.status, 200, JSON.stringify(okRes.body));
    assert.equal(okRes.headers.get("access-control-allow-origin"), "https://shop.example");
    assert.equal((await stored(okRes.body!.orderId as string))?.exportId !== null, true);
    assert.equal((await post(orderRoute, "/api/public/order", payload(newPhone(), s.keyExportA), { origin: "https://other.example" })).status, 403);
  });

  await check("route /lead and /event: per store; a test lead is_test; a pending store's beacons are ignored", async () => {
    const idem = randomUUID();
    const l = await post(leadRoute, `/api/public/lead?sg-test=${encodeURIComponent(tokenA)}`, { pageKey: s.keyA, idem, phone: newPhone(), city, utm: {} });
    assert.equal(l.status, 204);
    const [lr] = await db.select().from(leads).where(eq(leads.idem, idem));
    assert.equal(lr?.storeId, s.A);
    assert.equal(lr?.isTest, true);
    const restricted = randomUUID();
    assert.equal((await post(leadRoute, "/api/public/lead", { pageKey: s.keyR, idem: restricted, phone: newPhone(), utm: {} })).status, 204);
    assert.equal((await db.select().from(leads).where(eq(leads.idem, restricted))).length, 0, "a restricted store takes no leads");
    const ev = (key: string) => post(eventRoute, "/api/public/event", { pageKey: key, type: "view", vid: `qa${randomBytes(8).toString("hex")}` });
    const viewsOf = async (storeId: string) =>
      Number((await db.select({ v: sql<number>`COALESCE(SUM(${statsDaily.views}), 0)` }).from(statsDaily).where(eq(statsDaily.storeId, storeId)))[0]?.v);
    const beforeA = await viewsOf(s.A);
    assert.equal((await ev(s.keyA)).status, 204);
    assert.equal(await viewsOf(s.A), beforeA + 1);
    assert.equal((await ev(s.keyC)).status, 204);
    assert.equal(await viewsOf(s.C), 0, "pending: ignored");
    assert.equal((await ev(s.keyR)).status, 204);
    assert.equal(await viewsOf(s.R), 1, "restricted: beacons still count");
  });

  await check("route /upsell: the order's store decides; unknown and foreign-origin requests learn nothing", async () => {
    const placed = await post(orderRoute, "/api/public/order", payload(newPhone(), s.keyA));
    const body = { orderId: placed.body!.orderId, token: placed.body!.upsellToken };
    const placedB = await post(orderRoute, "/api/public/order", payload(newPhone(), s.keyB));
    const bodyB = { orderId: placedB.body!.orderId, token: placedB.body!.upsellToken };
    assert.ok(bodyB.token, "store B's page has its upsell on too");
    /** what a caller can tell apart: status, body, Vary and the CORS grant */
    const seen = (r: Awaited<ReturnType<typeof post>>) => [r.status, r.body, r.headers.get("vary"), r.headers.get("access-control-allow-origin")];
    const unknown = seen(await post(upsellRoute, "/api/public/upsell", { orderId: "CMD-ZZZZZZ", token: body.token }));
    assert.deepEqual(unknown, [422, { ok: false, error: "invalid" }, "Origin", null]);
    // ORD-17: a refused Origin answers exactly the unknown-order response (no 403 oracle)
    assert.deepEqual(seen(await post(upsellRoute, "/api/public/upsell", body, { origin: "https://evil.test" })), unknown, "a foreign Origin");
    setS(true);
    try {
      const fromA = { origin: "https://atlas-argan.shops.test" };
      assert.deepEqual(seen(await post(upsellRoute, "/api/public/upsell", { orderId: "CMD-ZZZZZZ", token: body.token }, fromA)), unknown, "S mode: an unknown id from A's host");
      assert.deepEqual(seen(await post(upsellRoute, "/api/public/upsell", bodyB, fromA)), unknown, "S mode: store B's order from A's host");
      assert.deepEqual(seen(await post(upsellRoute, "/api/public/upsell", { orderId: body.orderId, token: bodyB.token }, fromA)), unknown, "S mode: A's order with a wrong token");
    } finally {
      setS(false);
    }
    const up = await post(upsellRoute, "/api/public/upsell", body);
    assert.equal(up.status, 200, JSON.stringify(up.body));
    assert.equal(up.body!.orderId, body.orderId);
  });

  await check("interim guard (review r1.0-t3 F2): only store #1's orders reach the sheet and the CAPI tokens", async () => {
    const { selectSyncBatch } = await import("@/lib/sheets/sync");
    const tL = await target(s.keyL);
    const inB = await order(newPhone(), newIp(), { target: tB });
    const inL = await order(newPhone(), newIp(), { target: tL });
    assert.equal((await stored(orderId(inB)))?.sheetStatus, "pending", "store B's order is queued in its own store");
    assert.ok(inB.sync && inB.conversion, "store B's order would sync and has a Purchase event built");
    for (const opts of [{ force: true, limit: 200 }, { limit: 200 }]) {
      const batch = await selectSyncBatch(opts);
      assert.ok(batch.length > 0 && batch.every((o) => o.storeId === s.L), `only store #1's orders are selected (${JSON.stringify(opts)})`);
      assert.ok(batch.some((o) => o.id === orderId(inL)) && !batch.some((o) => o.id === orderId(inB)), "store #1's order in, store B's out");
    }
    // the route: after() runs outside a request here and throws, so a scheduled sheet push or CAPI dispatch logs a line
    const scheduled = async (key: string) => {
      resetBurstLimits();
      const lines: string[] = [];
      const orig = console.error;
      console.error = (...a: unknown[]) => void lines.push(a.map(String).join(" "));
      try {
        const req = new Request("https://platform.test/api/public/order", {
          method: "POST",
          headers: { host: "platform.test", "content-type": "application/json", "x-forwarded-for": newIp(), "user-agent": "Mozilla/5.0 (QA)", origin: "https://platform.test" },
          body: JSON.stringify(payload(newPhone(), key)),
        });
        const res = await orderRoute.POST(req as Next);
        assert.equal(res.status, 200, await res.text());
      } finally {
        console.error = orig;
      }
      return { sheet: lines.some((l) => l.includes("api/order:sync")), capi: lines.some((l) => l.includes("could not schedule")) };
    };
    assert.deepEqual(await scheduled(s.keyL), { sheet: true, capi: true }, "positive control: store #1 schedules both");
    assert.deepEqual(await scheduled(s.keyB), { sheet: false, capi: false }, "store B schedules neither the sheet push nor a CAPI Purchase");
  });
}

async function main() {
  installNavigationAlias();
  await pure();
  if (!OFFLINE) await database();
  else console.log("--offline: database checks skipped");
  console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
