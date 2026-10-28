/**
 * Public store routes, renderer per store, resolvers and stats per store (docs/STORE-SAAS.md §C, §E.2, §E.5, §H.13,
 * D54, STAT-01 … 04; T3 R1.0 step "public-routes-render"). Exit code 1 on any failure.
 *
 *   npx tsx src/lib/render/selftest-public.ts [--db cod_test_t3_public] [--keep]
 *
 * Part 1 (pure, no database): signed test tokens and tracking links, the canonical-host table, store links and
 * URLs in P and S modes, the store renderer (canonical, links, media origins, no aggregateRating, the render hook:
 * hook-free bytes unchanged, test band, no pixel on a test render or a thank-you without the browser Purchase),
 * the placeholder home, robots and sitemap text.
 * Part 2 (XAMPP MariaDB, a throwaway `cod_test_t3_*` database created, migrated with drizzle and dropped): two
 * stores with the same slug, a pending, a suspended (notice on) and a closed store, renamed and deleted handles,
 * slug history, an order, media keys, an export; then every store route through `serveStoreRoute` with real
 * Request objects on the platform, legacy and store (Worker) hosts, the resolvers, stats per store and timezone,
 * the publish / unpublish guards and the preview-token rows; P0b package F: the in-place re-render (`rerenderInPlace`:
 * rendered in place, runtime_v 1 skipped, not live, a publish meanwhile → live_changed) and the generation record
 * read (`generationRecordFor`); P0b review F-13: the kit share resolver (`resolveKitShare`: a known token, a revoked
 * share, malformed tokens, the store states, one store's token never another's) and the store's request list
 * (`listStoreRequests`: the decision as granted / declined, never the staff note; F-15).
 *
 * Paths that read T1's settings API (rendering at publish, test renders, legal pages) or its envelope (`seal` /
 * `open` of preview tokens) are checked for what they must do once T1 has merged; while its C0a stubs are in place
 * they are reported as "deferred (T1 stub)" instead of passing or failing. Secrets are random test values made
 * here; nothing from .env.local is read or printed.
 */
import Module from "node:module";
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { byId, storeValues, whereStore } from "@/lib/tenancy/sql"; // framework-free: no server-only, no connection
import type { StoreScope, WriteScope } from "@/lib/tenancy/types";

// run outside Next: `server-only` resolves to its empty build (the renderer needs the plain React builds, so the
// react-server condition is not an option), every other module as in the app
const M = Module as unknown as { _resolveFilename: (request: string, ...rest: unknown[]) => string };
const resolveFilename = M._resolveFilename;
M._resolveFilename = function (request: string, ...rest: unknown[]) {
  if (request === "server-only") return require.resolve("next/dist/compiled/server-only/empty.js");
  return resolveFilename.call(this, request, ...rest);
};

const DB_RE = /^cod_test_(?:t3|m4|m5|p0b?)_[a-z0-9_]{1,40}$/;
const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const DB = arg("db") ?? "cod_test_t3_public";
const KEEP = process.argv.includes("--keep");
if (!DB_RE.test(DB)) throw new Error("the database must be named cod_test_t3_*, cod_test_m4_*, cod_test_m5_*, cod_test_p0_* or cod_test_p0b_*");

// test configuration: P mode on platform.test, a legacy host; random secrets (never a real one)
process.env.APP_SECRET = randomBytes(32).toString("hex");
process.env.PLATFORM_URL = "https://platform.test";
delete process.env.PUBLIC_URL;
process.env.LEGACY_PLATFORM_HOSTS = "old-platform.test";
delete process.env.STORE_ROOT_DOMAIN;
delete process.env.EDGE_KEY;
delete process.env.EDGE_KEY_PREV;
delete process.env.ADMIN_HOST;
process.env.DATABASE_URL = `mysql://root@127.0.0.1:3306/${DB}`;
const EDGE_KEY = randomBytes(32).toString("hex");

let failures = 0;
let deferred = 0;
const T1_STUB = /not implemented: T1/;
async function check(name: string, fn: () => unknown | Promise<unknown>): Promise<void> {
  try {
    await fn();
    console.log("  ✓", name);
  } catch (err) {
    if (err instanceof Error && T1_STUB.test(err.message)) {
      deferred++;
      console.log("  ·", name, "— deferred (T1 stub:", err.message.replace(/^.*not implemented: /, "") + ")");
      return;
    }
    failures++;
    console.log("  ✗", name, "\n     ", err instanceof Error ? err.message : err);
  }
}
/** a check whose code path reads T1's API: a T1 stub surfaces as a thrown "not implemented: T1" */
const deferIfStub = (message: string | null | undefined) => {
  if (message && T1_STUB.test(message)) throw new Error(message);
};

const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const req = (url: string, headers: Record<string, string> = {}, method = "GET") => new Request(url, { method, headers: { host: new URL(url).host, ...headers } });
const edgeHeaders = (host: string) => ({ host: "platform.test", "x-sg-edge": EDGE_KEY, "x-sg-host": host, "x-sg-ts": String(Date.now()), "x-sg-proto": "https" });
const setS = (on: boolean) => {
  if (on) {
    process.env.STORE_ROOT_DOMAIN = "shops.test";
    process.env.EDGE_KEY = EDGE_KEY;
  } else {
    delete process.env.STORE_ROOT_DOMAIN;
    delete process.env.EDGE_KEY;
  }
};

/* ------------------------------------------------------------------ */
/* Part 1: pure                                                        */
/* ------------------------------------------------------------------ */

async function pure(): Promise<void> {
  console.log("pure checks");
  const pub = await import("@/lib/tenancy/public");
  const routes = await import("./store-routes.server");
  const ctxMod = await import("./store-context.server");
  const urls = await import("@/lib/urls");
  const { storePageLinks } = await import("@/landing/context");
  const { renderLandingHtml, renderThankYouHtml, inlineHashes } = await import("./core");
  const { noAddons } = await import("@/landing/addons/types");
  const { getFixture, fixtureAssets } = await import("@/lib/page/fixtures");
  const { validateDoc } = await import("@/lib/page/validate");
  const store = (id: string, handle: string): import("@/lib/tenancy/types").StoreRow => ({
    id, handle, name: "Atlas Argan", mode: "landing", status: "active", planId: "beta", market: "MA", currency: "MAD", timezone: "Africa/Casablanca",
    defaultLocale: "fr", homePageId: null, brandSeed: "0123456789abcdef", catalogVersion: 0, addressVersion: 0, requireMember2fa: false, primaryDomain: null,
  });
  const A = store("01JAAAAAAAAAAAAAAAAAAAAAAA", "atlas-argan");
  const B = store("01JBBBBBBBBBBBBBBBBBBBBBBB", "baraka-home");

  await check("test token: a store's token verifies for 2 h, never for another store, never expired or post-dated", () => {
    const now = Date.UTC(2026, 9, 24, 12);
    const token = pub.signTestToken(A.id, now);
    assert.equal(pub.resolveTestToken(A, token, now).test, true);
    assert.equal(pub.resolveTestToken(A, token, now + 2 * 3600_000 - 1000).test, true);
    assert.equal(pub.resolveTestToken(A, token, now + 2 * 3600_000 + 1000).test, false, "expired after 2 h");
    assert.equal(pub.resolveTestToken(B, token, now).test, false, "store A's token on store B");
    assert.equal(pub.resolveTestToken(A, pub.signTestToken(A.id, now + 6 * 3600_000), now).test, false, "dated beyond its life");
    for (const bad of [null, "", "anything", `${token}x`, token.replace(/.$/, (c) => (c === "A" ? "B" : "A")), "zz.short"]) assert.equal(pub.resolveTestToken(A, bad, now).test, false, String(bad));
    assert.match(token, /^[0-9a-z]+\.[A-Za-z0-9_-]{22}$/);
  });

  await check("tracking link signature: <exp base36>.<sig22>, store-bound", () => {
    const s = pub.signTrackLink(A.id, "CMD-7K3Q9X");
    assert.match(s, /^[0-9a-z]+\.[A-Za-z0-9_-]{22}$/);
    assert.notEqual(pub.signTrackLink(B.id, "CMD-7K3Q9X"), s);
  });

  await check("public API answers per store state (§A.5.3)", () => {
    const a = pub.publicApiAnswer;
    assert.deepEqual(["order", "lead", "event", "upsell", "track"].map((x) => a("active", x as never)), ["open", "open", "open", "open", "open"]);
    assert.deepEqual(["order", "lead", "event", "upsell", "track"].map((x) => a("restricted", x as never)), ["unavailable", "unavailable", "open", "open", "open"]);
    assert.deepEqual(["order", "lead", "event", "upsell", "track"].map((x) => a("pending", x as never)), ["unavailable", "unavailable", "ignored", "unavailable", "not_found"]);
    assert.deepEqual(["order", "track"].map((x) => a("suspended", x as never)), ["unavailable", "not_found"]);
    for (const st of ["closed", "scheduled_deletion", "purged", "rejected"] as const) assert.equal(a(st, "event"), "not_found");
    assert.deepEqual(["pending", "active", "restricted", "suspended", "closed"].map((s) => pub.mediaServable(s as never)), [true, true, true, false, false]);
  });

  await check("canonical host: P → the platform host only; S → the store's own subdomain through the Worker", () => {
    const addr = ctxMod.addressOf(A);
    setS(false);
    assert.equal(routes.isCanonicalHost({ cls: "platform", label: null }, addr), true);
    assert.equal(routes.isCanonicalHost({ cls: "legacy", label: null }, addr), false);
    setS(true);
    assert.equal(routes.isCanonicalHost({ cls: "platform", label: null }, addr), false);
    assert.equal(routes.isCanonicalHost({ cls: "store", label: "atlas-argan" }, addr), true);
    assert.equal(routes.isCanonicalHost({ cls: "store", label: "baraka-home" }, addr), false);
    setS(false);
  });

  await check("store URLs: P /s/<h>/<slug>, S https://<h>.<root>/<slug>; the home never has a trailing slash", () => {
    const addr = ctxMod.addressOf(A);
    setS(false);
    assert.equal(urls.storeUrl(addr, "/"), "https://platform.test/s/atlas-argan");
    assert.deepEqual(ctxMod.storeDocumentUrls({ address: addr }, "argan"), { landing: "/s/atlas-argan/argan", thankYou: "/s/atlas-argan/argan/merci", endpoints: ctxMod.PUBLIC_ENDPOINTS });
    assert.equal(storePageLinks(urls.storeBase(addr), "argan").privacy, "/s/atlas-argan/policies/privacy?p=argan");
    assert.equal(urls.mediaUrl(addr, "abc-960.webp"), "/media/abc-960.webp");
    setS(true);
    assert.equal(urls.storeUrl(addr, "/argan"), "https://atlas-argan.shops.test/argan");
    assert.equal(urls.storeUrl(addr, "/"), "https://atlas-argan.shops.test/");
    assert.equal(storePageLinks(urls.storeBase(addr), "argan").home, "/argan");
    assert.equal(urls.mediaUrl(addr, "abc-960.webp"), "https://platform.test/media/abc-960.webp");
    setS(false);
  });

  const now = "2026-10-24T12:00:00.000Z";
  const fx = getFixture("argan", { now, locale: "fr" });
  const { doc } = validateDoc({ ...fx.doc, product: { ...fx.doc.product, rating: { value: 4.8, count: 120 } }, tracking: { metaPixelId: "123456789012345" } });
  assert.ok(doc, "fixture doc validates");
  const rcFor = (s: import("@/lib/tenancy/types").StoreRow, extra: Partial<import("./store-context.server").StoreRenderContext> = {}): import("./store-context.server").StoreRenderContext => {
    const address = ctxMod.addressOf(s);
    const mode = urls.addressMode(address);
    return {
      store: s, address, base: urls.storeBase(address), origin: urls.storeOrigin(address), mediaOrigins: mode === "P" ? [] : [urls.platformOrigin()],
      info: fx.store, endpoints: ctxMod.PUBLIC_ENDPOINTS, addons: noAddons(), thanksAddons: noAddons(), purchaseInBrowser: true, ...extra,
    };
  };
  const optsFor = (rc: import("./store-context.server").StoreRenderContext) => ({ ...ctxMod.storeRenderOptions(rc, { slug: "argan", pageKey: fx.pageKey, assets: fixtureAssets("/") }), now, upgradeInsecureRequests: true });

  await check("store render (P): canonical, og:url and JSON-LD at /s/<h>/<slug>, policies links, no aggregateRating", async () => {
    setS(false);
    const r = await renderLandingHtml(doc!, { ...optsFor(rcFor(A)), ver: "01JVVVVVVVVVVVVVVVVVVVVVVV" });
    assert.ok(r.html.includes('<link rel="canonical" href="https://platform.test/s/atlas-argan/argan"/>'), "canonical");
    assert.ok(r.html.includes('content="https://platform.test/s/atlas-argan/argan"'), "og:url");
    assert.ok(!/aggregateRating|AggregateRating/.test(r.html), "no aggregateRating in the document (§C.8)");
    assert.ok(r.html.includes("/s/atlas-argan/policies/privacy?p=argan"), "footer legal link");
    assert.ok(!r.html.includes('href="/legal/'), "no root /legal link");
    const cfg = JSON.parse(/<script type="application\/json" id="lp-config">([\s\S]*?)<\/script>/.exec(r.html)![1]!);
    assert.equal(cfg.thankYouUrl, "/s/atlas-argan/argan/merci");
    assert.equal(cfg.endpoints.order, "/api/public/order");
  });

  await check("report link (D76, CRIT15): the live landing carries its absolute reportUrl once; the thank-you links name their own path", async () => {
    setS(false);
    const rc = rcFor(A);
    const r = await renderLandingHtml(doc!, optsFor(rc));
    const href = "https://platform.test/report/atlas-argan?p=%2Fs%2Fatlas-argan%2Fargan";
    assert.equal(r.html.split(`href="${href}"`).length - 1, 1, "one report link on the landing page");
    assert.ok(r.html.includes('<p class="lp-report">'), "the Shell row (until P6's footer draws the link)");
    assert.equal(ctxMod.thankYouLinks(rc, "argan").report, "https://platform.test/report/atlas-argan?p=%2Fs%2Fatlas-argan%2Fargan%2Fmerci");
    assert.equal(ctxMod.storeReportUrl(rc, "/policies/terms"), "https://platform.test/report/atlas-argan?p=%2Fs%2Fatlas-argan%2Fpolicies%2Fterms");
  });

  await check("store render (S): media from the platform origin, listed in img-src and media-src", async () => {
    setS(true);
    const rc = rcFor(A);
    const r = await renderLandingHtml(doc!, optsFor({ ...rc, info: { ...fx.store } }));
    assert.ok(r.html.includes('<link rel="canonical" href="https://atlas-argan.shops.test/argan"/>'));
    const img = /img-src ([^;]*)/.exec(r.csp)![1]!;
    const media = /media-src ([^;]*)/.exec(r.csp)![1]!;
    assert.ok(img.includes("https://platform.test") && media.includes("https://platform.test"), r.csp);
    setS(false);
  });

  await check("render hook: an empty add-on set is byte-identical to no hook at all", async () => {
    const base = optsFor(rcFor(A));
    const plain = await renderLandingHtml(doc!, base);
    const hooked = await renderLandingHtml(doc!, { ...base, addons: noAddons(), purchaseInBrowser: true });
    assert.equal(hooked.html, plain.html);
    assert.equal(hooked.csp, plain.csp);
    const ty = await renderThankYouHtml(doc!, base);
    const tyHooked = await renderThankYouHtml(doc!, { ...base, addons: noAddons() });
    assert.equal(tyHooked.html, ty.html);
  });

  await check("test render options: no pixel (chunk nor CSP host), the test band, ?sg-test endpoints", async () => {
    const base = optsFor(rcFor(A));
    const live = await renderLandingHtml(doc!, base);
    assert.ok(live.csp.includes("connect.facebook.net"), "the live page loads its Meta pixel");
    const token = "abc.0123456789abcdefghijkl";
    const test = await renderLandingHtml(doc!, {
      ...base,
      urls: { ...base.urls, thankYou: `${base.urls.thankYou}?sg-test=${token}`, endpoints: { order: `/api/public/order?sg-test=${token}`, lead: `/api/public/lead?sg-test=${token}`, upsell: `/api/public/upsell?sg-test=${token}` } },
      pixels: false,
      addons: { ...noAddons(), banner: "test" },
    });
    assert.ok(!test.csp.includes("facebook"), "no pixel host in the test CSP");
    const cfg = JSON.parse(/<script type="application\/json" id="lp-config">([\s\S]*?)<\/script>/.exec(test.html)![1]!);
    assert.deepEqual(cfg.pixels, {});
    assert.equal(cfg.endpoints.event, undefined, "no event endpoint");
    assert.ok(cfg.endpoints.order.endsWith(`?sg-test=${token}`) && cfg.thankYouUrl.includes("sg-test="));
    assert.ok(test.html.includes('class="lp-test-band"') && test.html.includes("Mode test"), "the test band");
    const { scripts, styles } = inlineHashes(test.html);
    for (const h of [...scripts, ...styles]) assert.ok(test.csp.includes(`'${h}'`), "every inline hash is in the CSP");
    assert.ok(scripts.length < inlineHashes(live.html).scripts.length, "the pixels chunk is gone");
  });

  await check("purchaseInBrowser false: the thank-you page carries no pixel, the landing page keeps its own", async () => {
    const base = optsFor(rcFor(A, { purchaseInBrowser: false }));
    assert.equal((base as { purchaseInBrowser?: boolean }).purchaseInBrowser, false);
    const ty = await renderThankYouHtml(doc!, base);
    const cfg = JSON.parse(/<script type="application\/json" id="lp-config">([\s\S]*?)<\/script>/.exec(ty.html)![1]!);
    assert.deepEqual(cfg.pixels, {});
    assert.ok(!ty.csp.includes("facebook"));
    const landing = await renderLandingHtml(doc!, base);
    assert.ok(landing.csp.includes("connect.facebook.net"));
  });

  await check("render context (P0b F): lead kept while capture is on; hasAddons; the thank-you options carry their own report path and add-ons", async () => {
    const { LandingSetting } = await import("@/lib/settings/keys/landing");
    for (const capture of ["market_default", "on", "off"] as const) {
      // P3's stub answers true (today's behaviour): every page keeps its lead endpoint until the EU rule lands
      assert.deepEqual(ctxMod.storeEndpoints(A, LandingSetting.parse({ leads: { capture } })), ctxMod.PUBLIC_ENDPOINTS, capture);
    }
    assert.equal(ctxMod.hasAddons(noAddons()), false);
    for (const set of [{ css: ["assist"] }, { body: ["assist" as const] }, { head: ["exp-head" as const] }, { data: { "lp-assist": {} } }, { banner: "test" as const }]) {
      assert.equal(ctxMod.hasAddons({ ...noAddons(), ...set }), true, JSON.stringify(set));
    }
    const rc = rcFor(A, { thanksAddons: { ...noAddons(), css: ["thanks-block"] } });
    const input = { slug: "argan", pageKey: fx.pageKey, assets: fixtureAssets("/") };
    const landing = ctxMod.storeRenderOptions(rc, input);
    const thanks = ctxMod.storeRenderOptions(rc, { ...input, page: "thanks" });
    assert.equal("addons" in landing, false, "an empty landing set is never passed");
    assert.deepEqual(thanks.addons, { ...noAddons(), css: ["thanks-block"] });
    assert.deepEqual(thanks.links, ctxMod.thankYouLinks(rc, "argan"));
    assert.deepEqual(landing.urls.endpoints, ctxMod.PUBLIC_ENDPOINTS);
    const noLead = ctxMod.storeRenderOptions({ ...rc, endpoints: { order: "/api/public/order", event: "/api/public/event", upsell: "/api/public/upsell" } }, input);
    const r = await renderLandingHtml(doc!, { ...noLead, now, upgradeInsecureRequests: true });
    const cfg = JSON.parse(/<script type="application\/json" id="lp-config">([\s\S]*?)<\/script>/.exec(r.html)![1]!);
    assert.equal(cfg.endpoints.lead, undefined, "a store without lead capture: no endpoints.lead (LD11)");
    assert.equal(cfg.endpoints.order, "/api/public/order");
  });

  await check("one Purchase trigger rule (OD18): purchaseInBrowserFor is triggerFor(conversions, pageId) === 'order'", async () => {
    const { triggerFor } = await import("@/lib/orders/conversions-core");
    const P = "01JPPPPPPPPPPPPPPPPPPPPPPP";
    const base = { customEvents: true, manualOrders: false };
    const matrix: import("@/lib/settings/keys/conversions").ConversionsSetting[] = [
      { ...base, purchaseTrigger: "order", pageOverrides: { [P]: "confirmed" } },
      { ...base, purchaseTrigger: "delivered", pageOverrides: { [P]: "order" } },
      { ...base, purchaseTrigger: "confirmed", pageOverrides: {} },
    ];
    for (const conversions of matrix) {
      for (const pageId of [P, "01JQQQQQQQQQQQQQQQQQQQQQQQ", null]) {
        const want = (pageId ? conversions.pageOverrides[pageId] : undefined) ?? conversions.purchaseTrigger;
        assert.equal(triggerFor(conversions, pageId), want);
        assert.equal(ctxMod.purchaseInBrowserFor(conversions, pageId), want === "order");
      }
    }
  });

  await check("placeholder home: the store's name escaped, static, its one style in the CSP", () => {
    const p = routes.storePlaceholder({ name: `Atlas <b>"Argan"</b>`, defaultLocale: "ar" });
    assert.ok(p.html.includes("Atlas &#60;b&#62;&#34;Argan&#34;&#60;/b&#62;"));
    assert.ok(p.html.includes('dir="rtl"') && !p.html.includes("<script"));
    const { styles } = inlineHashes(p.html);
    assert.equal(styles.length, 1);
    assert.ok(p.csp.includes(`'${styles[0]}'`));
  });

  await check("robots and sitemap text", async () => {
    setS(false);
    assert.equal(routes.storeRobotsText({ ...A, status: "restricted" }, true), "User-agent: *\nDisallow: /\n");
    assert.equal(routes.storeRobotsText(A, false), "User-agent: *\nDisallow: /\n");
    assert.ok(routes.storeRobotsText(A, true).includes("Sitemap: https://platform.test/s/atlas-argan/sitemap.xml"));
    const xml = routes.sitemapXml([{ loc: "https://platform.test/s/atlas-argan/argan", lastmod: new Date(Date.UTC(2026, 9, 1)) }, { loc: "/relative" }]);
    assert.ok(xml.includes("<loc>https://platform.test/s/atlas-argan/argan</loc><lastmod>2026-10-01</lastmod>") && !xml.includes("/relative"));
    assert.equal(routes.restOf({ page: "home" }), "");
    assert.equal(routes.restOf({ page: "thanks", slug: "x" }), "/x/merci");
  });
}

/* ------------------------------------------------------------------ */
/* Part 2: database                                                    */
/* ------------------------------------------------------------------ */

const rootConnection = async () => {
  const mysql = (await import("mysql2/promise")).default;
  return mysql.createConnection({ host: "127.0.0.1", port: 3306, user: "root", charset: "utf8mb4_unicode_ci", timezone: "Z" });
};

interface Seed {
  A: string;
  B: string;
  C: string;
  D: string;
  E: string;
  pageA: string;
  pageAHidden: string;
  pageADraft: string;
  pageB: string;
  pageC: string;
  pageE: string;
  pageAGlow: string;
  pageARetro: string;
  pageAOff: string;
  versionA: string;
  versionGlow: string;
  versionRetro: string;
  keyA: string;
  keyC: string;
  keyE: string;
  keyExportPhp: string;
  orderA: string;
  orderD: string;
  mediaA: string;
  mediaD: string;
  htmlA: string;
  htmlB: string;
  Rr: string;
  /** P0b review F-13: kit share tokens (the raw token; the row holds its sha256) */
  shares: { a: { id: string; token: string }; b: { id: string; token: string }; revoked: string; restricted: string; suspended: string; pending: string };
}

async function seed(): Promise<Seed> {
  const { newId } = await import("@/lib/db/ids");
  const { getFixture } = await import("@/lib/page/fixtures");
  const conn = await (await import("mysql2/promise")).default.createConnection({ uri: process.env.DATABASE_URL!, charset: "utf8mb4_unicode_ci", timezone: "Z" });
  try {
    const fx = getFixture("argan", { now: "2026-10-24T12:00:00.000Z", locale: "fr" });
    // the dev fixtures are noindex; the live pages of this seed are indexable unless said otherwise
    const docJson = JSON.stringify({ ...fx.doc, seo: { ...fx.doc.seo, noindex: false } });
    const hiddenJson = JSON.stringify({ ...fx.doc, seo: { ...fx.doc.seo, noindex: true } });
    const store = async (handle: string, name: string, status: string, tz: string, extra: { suspendNotice?: boolean } = {}) => {
      const id = newId();
      await conn.query("INSERT INTO stores (id, handle, name, status, brand_seed, timezone, suspend_notice) VALUES (?, ?, ?, ?, ?, ?, ?)", [
        id, handle, name, status, randomBytes(8).toString("hex"), tz, extra.suspendNotice ? 1 : 0,
      ]);
      return id;
    };
    const page = async (storeId: string, slug: string, opts: { published: boolean; html?: string; doc?: string; key?: string; runtimeV?: number }) => {
      const id = newId();
      const key = opts.key ?? `pk_${randomBytes(12).toString("base64url")}`;
      await conn.query("INSERT INTO pages (id, store_id, slug, name, status, locale, public_key, draft) VALUES (?, ?, ?, ?, ?, 'fr', ?, ?)", [
        id, storeId, slug, slug, opts.published ? "published" : "draft", key, opts.doc ?? docJson,
      ]);
      let versionId: string | null = null;
      if (opts.published) {
        versionId = newId();
        const html = opts.html ?? `<!DOCTYPE html><title>${slug}</title>`;
        await conn.query(
          "INSERT INTO page_versions (id, store_id, page_id, kind, doc, html, thank_you_html, csp, thank_you_csp, etag, checksum, runtime_v) VALUES (?, ?, ?, 'publish', ?, ?, ?, ?, ?, ?, ?, ?)",
          [versionId, storeId, id, opts.doc ?? docJson, html, `<!DOCTYPE html><title>merci ${slug}</title>`, "default-src 'self'; connect-src 'self'; form-action 'self'", "default-src 'self'; connect-src 'self'", sha(html), sha(opts.doc ?? docJson), opts.runtimeV ?? 2],
        );
        await conn.query("UPDATE pages SET published_version_id = ?, first_published_at = '2026-10-01 10:00:00.000' WHERE id = ?", [versionId, id]);
      }
      return { id, key, versionId };
    };

    const A = await store("atlas-argan", "Atlas Argan", "active", "Africa/Casablanca");
    const B = await store("baraka-home", "Baraka Home", "active", "America/New_York");
    const C = await store("cedre-shop", "Cedre Shop", "pending", "Africa/Casablanca");
    const D = await store("dune-store", "Dune Store", "suspended", "Africa/Casablanca", { suspendNotice: true });
    const E = await store("erg-market", "Erg Market", "closed", "Africa/Casablanca");
    // review r1.0-t3 F4: not indexable, so never in the platform robots.txt: restricted, and every page noindex
    const Rr = await store("rif-goods", "Rif Goods", "restricted", "Africa/Casablanca");
    const N = await store("noor-hidden", "Noor Hidden", "active", "Africa/Casablanca");
    const htmlA = "<!DOCTYPE html><title>A argan</title>";
    const htmlB = "<!DOCTYPE html><title>B argan</title>";
    const a = await page(A, "argan", { published: true, html: htmlA, key: "pk_fixture_argan" });
    const aHidden = await page(A, "hidden", { published: true, doc: hiddenJson });
    const aDraft = await page(A, "serum", { published: false });
    // P0b F: the in-place re-render's pages (a live v2 page, a live runtime_v 1 page, a page never published)
    const aGlow = await page(A, "glow", { published: true });
    const aRetro = await page(A, "retro", { published: true, runtimeV: 1 });
    const aOff = await page(A, "brouillon", { published: false });
    const b = await page(B, "argan", { published: true, html: htmlB });
    const c = await page(C, "argan", { published: true });
    const e = await page(E, "argan", { published: true });
    const rr = await page(Rr, "argan", { published: true });
    await page(N, "argan", { published: true, doc: hiddenJson });
    await page(N, "serum", { published: false });
    await conn.query("UPDATE stores SET home_page_id = ? WHERE id = ?", [a.id, A]);
    // LP-20: A's old slug, an expired one; R-D53: a renamed handle of A, a deleted handle of E
    await conn.query("INSERT INTO page_slug_history (store_id, slug, page_id, until) VALUES (?, 'huile', ?, UTC_TIMESTAMP(3) + INTERVAL 30 DAY), (?, 'vieux', ?, UTC_TIMESTAMP(3) - INTERVAL 1 DAY)", [A, a.id, A, a.id]);
    await conn.query(
      "INSERT INTO store_handle_history (handle, store_id, reason, redirect_until, reserved_until) VALUES ('old-atlas', ?, 'renamed', UTC_TIMESTAMP(3) + INTERVAL 300 DAY, UTC_TIMESTAMP(3) + INTERVAL 300 DAY), ('gone-shop', ?, 'deleted', NULL, UTC_TIMESTAMP(3) + INTERVAL 100 DAY)",
      [A, E],
    );
    const order = async (storeId: string, pageId: string) => {
      const id = `CMD-${randomBytes(3).toString("hex").toUpperCase()}`;
      await conn.query(
        "INSERT INTO orders (id, store_id, page_id, name, phone, product_name, items, qty, subtotal, shipping, total, currency, idem) VALUES (?, ?, ?, 'Test', '+212600000000', 'Argan', ?, 1, 100, 0, 100, 'MAD', ?)",
        [id, storeId, pageId, JSON.stringify({ bundleId: "b", bundleLabel: "x1", qty: 1, unitPrice: 100, variants: [] }), randomUUID()],
      );
      return id;
    };
    const orderA = await order(A, a.id);
    const orderD = await order(D, a.id);
    const media = async (storeId: string) => {
      const key = `${randomBytes(16).toString("hex")}-960.webp`;
      await conn.query("INSERT INTO media_files (`key`, store_id, asset_id, mime, bytes, chunks, sha256) VALUES (?, ?, ?, 'image/webp', 10, 1, ?)", [key, storeId, randomBytes(16).toString("hex"), sha(key)]);
      return key;
    };
    const mediaA = await media(A);
    const mediaD = await media(D);
    const keyExportPhp = `pk_${randomBytes(12).toString("base64url")}`;
    await conn.query("INSERT INTO exports (id, store_id, page_id, version_id, mode, public_key, allowed_origins) VALUES (?, ?, ?, ?, 'php', ?, '[]')", [newId(), A, a.id, a.versionId, keyExportPhp]);
    // P0b review F-13: kit shares (campaigns.share_token_hash = sha256(token), cp_share_uq)
    const share = async (storeId: string, pageId: string, slug: string) => {
      const id = newId();
      const token = randomBytes(24).toString("base64url");
      await conn.query(
        "INSERT INTO campaigns (id, store_id, name, slug, page_id, product_ref, channels, kit, offers_hash, share_token_hash, status) VALUES (?, ?, ?, ?, ?, ?, '[]', '{}', ?, ?, 'live')",
        [id, storeId, slug, slug, pageId, JSON.stringify({ kind: "landing_items", id: pageId }), "0".repeat(16), sha(token)],
      );
      return { id, token };
    };
    const shareA = await share(A, a.id, "ramadan");
    const shareB = await share(B, b.id, "ramadan");
    const shareRevoked = await share(A, a.id, "ete");
    await conn.query("UPDATE campaigns SET share_token_hash = NULL WHERE id = ?", [shareRevoked.id]);
    const shares = {
      a: shareA,
      b: shareB,
      revoked: shareRevoked.token,
      restricted: (await share(Rr, rr.id, "ramadan")).token,
      suspended: (await share(D, a.id, "ramadan")).token,
      pending: (await share(C, c.id, "ramadan")).token,
    };
    return {
      Rr,
      shares,
      A, B, C, D, E, pageA: a.id, pageAHidden: aHidden.id, pageADraft: aDraft.id, pageB: b.id, pageC: c.id, pageE: e.id, versionA: a.versionId!,
      pageAGlow: aGlow.id, pageARetro: aRetro.id, pageAOff: aOff.id, versionGlow: aGlow.versionId!, versionRetro: aRetro.versionId!,
      keyA: a.key, keyC: c.key, keyE: e.key, keyExportPhp, orderA, orderD, mediaA, mediaD, htmlA, htmlB,
    };
  } finally {
    await conn.end();
  }
}

async function database(): Promise<void> {
  console.log(`database checks (${DB})`);
  const root = await rootConnection();
  await root.query(`DROP DATABASE IF EXISTS \`${DB}\``);
  await root.query(`CREATE DATABASE \`${DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await root.end();
  let s: Seed;
  try {
    const { runMigrations } = await import("@/lib/db/migrate");
    const m = await runMigrations();
    assert.equal(m.status, "applied");
    s = await seed();
  } catch (err) {
    failures++;
    console.log("  ✗ migrate + seed\n     ", err instanceof Error ? err.message : err);
    return;
  }

  const routes = await import("./store-routes.server");
  const pub = await import("@/lib/tenancy/public");
  const { UNKNOWN_PAGE_HTML, GONE_PAGE_HTML, UNAVAILABLE_PAGE_HTML } = await import("@/lib/auth/unknown-page");
  const { mintScope } = await import("@/lib/tenancy/seam");
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const { eq } = await import("drizzle-orm");
  // the suite's own reads and fixture writes go through the store predicate like the app's (lint L1-L3)
  const pageRow = async (scope: StoreScope, id: string) => (await db.select().from(schema.pages).where(byId(schema.pages, scope, id)).limit(1))[0];
  const slugHits = async (scope: StoreScope, slug: string) =>
    (await db.select({ hits: schema.pageSlugHistory.hits }).from(schema.pageSlugHistory).where(whereStore(schema.pageSlugHistory, scope, eq(schema.pageSlugHistory.slug, slug))).limit(1))[0]?.hits;
  const statsRows = async (scope: StoreScope) => db.select().from(schema.statsDaily).where(whereStore(schema.statsDaily, scope));
  const versionRow = async (scope: StoreScope, id: string) => (await db.select({ storeId: schema.pageVersions.storeId }).from(schema.pageVersions).where(byId(schema.pageVersions, scope, id)).limit(1))[0];
  const setFirstPublished = async (scope: WriteScope, id: string, value: ReturnType<typeof import("./publish.server").firstPublishedAt> | null) =>
    db.update(schema.pages).set({ firstPublishedAt: value }).where(byId(schema.pages, scope, id));
  const auditRow = async (scope: StoreScope, action: string, target: string) =>
    (await db.select().from(schema.auditLog).where(whereStore(schema.auditLog, scope, eq(schema.auditLog.action, action), eq(schema.auditLog.target, target))).limit(1))[0];
  const insertToken = async (scope: WriteScope, values: { id: string; pageId: string; audience: "seller"; expiresAt: Date }) => db.insert(schema.previewTokens).values(storeValues(scope, values));
  const tokenRow = async (scope: StoreScope, id: string) => (await db.select().from(schema.previewTokens).where(byId(schema.previewTokens, scope, id)).limit(1))[0];
  const deferredTasks: (() => Promise<void>)[] = [];
  const serve = (url: string, route: import("./store-routes.server").StoreRoute, handle: string, headers?: Record<string, string>) =>
    routes.serveStoreRoute(req(url, headers), handle, route, { defer: (t) => deferredTasks.push(t) });
  const P = "https://platform.test";

  await check("P mode: each store serves its own page at the same slug (bytes, ETag, narrowed CSP, shared cache)", async () => {
    setS(false);
    const a = await serve(`${P}/s/atlas-argan/argan`, { page: "landing", slug: "argan" }, "atlas-argan");
    assert.equal(a.status, 200);
    assert.equal(await a.text(), s.htmlA);
    assert.equal(a.headers.get("etag"), `"${sha(s.htmlA)}"`);
    assert.match(a.headers.get("content-security-policy") ?? "", /connect-src https:\/\/platform\.test\/api\/public\//);
    assert.ok(!/connect-src[^;]*'self'/.test(a.headers.get("content-security-policy") ?? ""), "no bare 'self'");
    assert.equal(a.headers.get("cache-control"), "public, max-age=0, must-revalidate, s-maxage=60");
    assert.equal(a.headers.get("cdn-cache-control"), null);
    const b = await serve(`${P}/s/baraka-home/argan`, { page: "landing", slug: "argan" }, "baraka-home");
    assert.equal(await b.text(), s.htmlB);
    const ty = await serve(`${P}/s/atlas-argan/argan/merci`, { page: "thanks", slug: "argan" }, "atlas-argan");
    assert.equal(ty.status, 200);
    assert.equal(ty.headers.get("cache-control"), "private, no-store");
    assert.equal(ty.headers.get("x-robots-tag"), "noindex, nofollow");
    const nm = await routes.serveStoreRoute(req(`${P}/s/atlas-argan/argan`, { "if-none-match": `"${sha(s.htmlA)}"` }), "atlas-argan", { page: "landing", slug: "argan" });
    assert.equal(nm.status, 304);
  });

  await check("unknown, draft, reserved and other-store pages are the neutral 404 (same bytes)", async () => {
    for (const [handle, slug] of [["atlas-argan", "serum"], ["atlas-argan", "nope"], ["atlas-argan", "policies"], ["nobody-here", "argan"], ["cedre-shop", "argan"], ["erg-market", "argan"]] as const) {
      const r = await serve(`${P}/s/${handle}/${slug}`, { page: "landing", slug }, handle);
      assert.equal(r.status, 404, `${handle}/${slug}`);
      assert.equal(await r.text(), UNKNOWN_PAGE_HTML, `${handle}/${slug}`);
    }
  });

  await check("suspended store with its notice → neutral 503, Retry-After 86400; deleted handle → neutral 410", async () => {
    const d = await serve(`${P}/s/dune-store/argan`, { page: "landing", slug: "argan" }, "dune-store");
    assert.equal(d.status, 503);
    assert.equal(d.headers.get("retry-after"), "86400");
    assert.equal(await d.text(), UNAVAILABLE_PAGE_HTML);
    const g = await serve(`${P}/s/gone-shop/argan`, { page: "landing", slug: "argan" }, "gone-shop");
    assert.equal(g.status, 410);
    assert.equal(await g.text(), GONE_PAGE_HTML);
  });

  await check("308s keep the raw query byte for byte: upper-case slug and handle, renamed handle, legacy host", async () => {
    const q = "?utm_source=fb&fbclid=AbC_-1%20x&ttclid=Z";
    const up = await serve(`${P}/s/atlas-argan/Argan${q}`, { page: "landing", slug: "Argan" }, "atlas-argan");
    assert.equal(up.status, 308);
    assert.equal(up.headers.get("location"), `${P}/s/atlas-argan/argan${q}`);
    assert.equal(up.headers.get("cache-control"), "public, max-age=300");
    const upHandle = await serve(`${P}/s/Atlas-Argan/argan${q}`, { page: "landing", slug: "argan" }, "Atlas-Argan");
    assert.equal(upHandle.headers.get("location"), `${P}/s/atlas-argan/argan${q}`);
    const renamed = await serve(`${P}/s/old-atlas/argan/merci${q}`, { page: "thanks", slug: "argan" }, "old-atlas");
    assert.equal(renamed.status, 308);
    assert.equal(renamed.headers.get("location"), `${P}/s/atlas-argan/argan/merci${q}`);
    const legacy = await serve(`https://old-platform.test/s/atlas-argan/argan${q}`, { page: "landing", slug: "argan" }, "atlas-argan");
    assert.equal(legacy.status, 308);
    assert.equal(legacy.headers.get("location"), `${P}/s/atlas-argan/argan${q}`);
    const home = await serve(`https://old-platform.test/s/atlas-argan`, { page: "home" }, "atlas-argan");
    assert.equal(home.headers.get("location"), `${P}/s/atlas-argan`);
  });

  await check("slug history (LP-20): 308 to the current slug in the same store, hit counted; expired and other-store slugs 404", async () => {
    const r = await serve(`${P}/s/atlas-argan/huile?x=1&y=%C3%A9`, { page: "landing", slug: "huile" }, "atlas-argan");
    assert.equal(r.status, 308);
    assert.equal(r.headers.get("location"), "/s/atlas-argan/argan?x=1&y=%C3%A9");
    const ty = await serve(`${P}/s/atlas-argan/huile/merci`, { page: "thanks", slug: "huile" }, "atlas-argan");
    assert.equal(ty.headers.get("location"), "/s/atlas-argan/argan/merci");
    for (const t of deferredTasks.splice(0)) await t();
    assert.equal(await slugHits(mintScope("public", s.A), "huile"), 2);
    assert.equal((await serve(`${P}/s/baraka-home/huile`, { page: "landing", slug: "huile" }, "baraka-home")).status, 404);
    assert.equal((await serve(`${P}/s/atlas-argan/vieux`, { page: "landing", slug: "vieux" }, "atlas-argan")).status, 404);
  });

  await check("home: the home page of the store; a store without one gets its branded 'no page yet' document", async () => {
    const a = await serve(`${P}/s/atlas-argan`, { page: "home" }, "atlas-argan");
    assert.equal(await a.text(), s.htmlA);
    const b = await serve(`${P}/s/baraka-home`, { page: "home" }, "baraka-home");
    assert.equal(b.status, 200);
    const html = await b.text();
    assert.ok(html.includes("<h1>Baraka Home</h1>") && !html.includes("<script"));
    assert.equal(b.headers.get("x-robots-tag"), "noindex, nofollow");
  });

  await check("S mode: the platform host 308s to the subdomain; the Worker's request is served with its own origin", async () => {
    setS(true);
    try {
      const moved = await serve(`${P}/s/atlas-argan/argan?a=1`, { page: "landing", slug: "argan" }, "atlas-argan");
      assert.equal(moved.status, 308);
      assert.equal(moved.headers.get("location"), "https://atlas-argan.shops.test/argan?a=1");
      const edge = await serve(`${P}/s/atlas-argan/argan`, { page: "landing", slug: "argan" }, "atlas-argan", edgeHeaders("atlas-argan.shops.test"));
      assert.equal(edge.status, 200);
      assert.match(edge.headers.get("content-security-policy") ?? "", /connect-src https:\/\/atlas-argan\.shops\.test\/api\/public\//);
      assert.equal(edge.headers.get("cdn-cache-control"), "no-store");
      // store B's subdomain asking for A's path (the proxy refuses it first): never served as A on B's host
      const cross = await serve(`${P}/s/atlas-argan/argan`, { page: "landing", slug: "argan" }, "atlas-argan", edgeHeaders("baraka-home.shops.test"));
      assert.equal(cross.status, 308);
      assert.equal(cross.headers.get("location"), "https://atlas-argan.shops.test/argan");
      const home = await serve(`${P}/s/atlas-argan`, { page: "home" }, "atlas-argan", edgeHeaders("atlas-argan.shops.test"));
      assert.equal(home.status, 200);
      const bad = await serve(`${P}/s/atlas-argan/argan`, { page: "landing", slug: "argan" }, "atlas-argan", { ...edgeHeaders("atlas-argan.shops.test"), "x-sg-edge": "x".repeat(40) });
      assert.equal(bad.status, 404, "an unverifiable edge key is the invalid class");
    } finally {
      setS(false);
    }
  });

  await check("a bad, expired or other-store test token gets the normal page", async () => {
    const bad = await serve(`${P}/s/atlas-argan/argan?sg-test=abc.0123456789abcdefghijkl`, { page: "landing", slug: "argan" }, "atlas-argan");
    assert.equal(await bad.text(), s.htmlA);
    const expired = pub.signTestToken(s.A, Date.now() - 3 * 3600_000);
    assert.equal(await (await serve(`${P}/s/atlas-argan/argan?sg-test=${expired}`, { page: "landing", slug: "argan" }, "atlas-argan")).text(), s.htmlA);
    const otherStore = pub.signTestToken(s.B);
    assert.equal(await (await serve(`${P}/s/atlas-argan/argan?sg-test=${otherStore}`, { page: "landing", slug: "argan" }, "atlas-argan")).text(), s.htmlA);
  });

  await check("a valid test token renders the test document (private, noindex, the band, ?sg-test endpoints)", async () => {
    const ok = await serve(`${P}/s/atlas-argan/argan?sg-test=${pub.signTestToken(s.A)}`, { page: "landing", slug: "argan" }, "atlas-argan");
    if (ok.status === 503) {
      const store = await pub.getStoreById(s.A);
      const { loadStoreRenderContext } = await import("./store-context.server");
      await loadStoreRenderContext(mintScope("public", s.A), store!); // throws the T1 stub → deferred
    }
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get("cache-control"), "private, no-store");
    const html = await ok.text();
    assert.ok(html.includes("lp-test-band") && html.includes("sg-test="));
  });

  await check("policies: a store's legal page (themed by ?p= within the store); unknown kinds 404", async () => {
    assert.equal((await serve(`${P}/s/atlas-argan/policies/cookies`, { page: "policy", kind: "cookies" }, "atlas-argan")).status, 404);
    const r = await serve(`${P}/s/atlas-argan/policies/privacy?p=argan`, { page: "policy", kind: "privacy" }, "atlas-argan");
    if (r.status === 503) {
      const { getStoreLegalDocument } = await import("./store-pages.server");
      await getStoreLegalDocument(mintScope("public", s.A), (await pub.getStoreById(s.A))!, "privacy", "argan");
    }
    assert.equal(r.status, 200);
    assert.ok((await r.text()).includes("Atlas Argan"));
  });

  await check("robots and sitemap per store; the platform robots lists live stores' sitemaps in P mode", async () => {
    const robots = await (await serve(`${P}/s/atlas-argan/robots.txt`, { page: "robots" }, "atlas-argan")).text();
    assert.ok(robots.includes("Sitemap: https://platform.test/s/atlas-argan/sitemap.xml"), robots);
    assert.equal((await serve(`${P}/s/cedre-shop/robots.txt`, { page: "robots" }, "cedre-shop")).status, 404);
    const map = await (await serve(`${P}/s/atlas-argan/sitemap.xml`, { page: "sitemap" }, "atlas-argan")).text();
    assert.ok(map.includes("<loc>https://platform.test/s/atlas-argan/argan</loc>"), map);
    assert.ok(!map.includes("/hidden") && !map.includes("baraka"), "noindex pages and other stores stay out");
    const platform = await routes.platformRobotsText();
    assert.ok(platform.includes("Sitemap: https://platform.test/s/atlas-argan/sitemap.xml") && platform.includes("Sitemap: https://platform.test/s/baraka-home/sitemap.xml"));
    assert.ok(!platform.includes("cedre-shop") && !platform.includes("erg-market"), "pending and closed stores are not listed");
    assert.ok(!platform.includes("rif-goods"), "a restricted store (its robots.txt is Disallow: /) is not listed");
    assert.ok(!platform.includes("noor-hidden"), "a store whose every published page is noindex (empty sitemap) is not listed");
    const noor = await (await serve(`${P}/s/noor-hidden/sitemap.xml`, { page: "sitemap" }, "noor-hidden")).text();
    assert.ok(!noor.includes("<loc>"), `the all-noindex store's own sitemap is empty too: ${noor}`);
    assert.ok(platform.includes("Disallow: /app/") && !platform.includes("Disallow: /s/"));
    setS(true);
    try {
      const s2 = await routes.platformRobotsText();
      assert.ok(s2.includes("Disallow: /s/") && !s2.includes("/s/atlas-argan/sitemap.xml"));
    } finally {
      setS(false);
    }
  });

  await check("other methods and other host classes: the neutral 404", async () => {
    const r = await routes.serveStoreRoute(req(`https://somewhere-else.test/s/atlas-argan/argan`), "atlas-argan", { page: "landing", slug: "argan" });
    assert.equal(r.status, 404);
  });

  await check("resolvePublicTarget: the target carries its store and a public scope; strict purpose refuses non-connected exports", async () => {
    const t = await pub.resolvePublicTarget(s.keyA);
    assert.ok(t);
    assert.equal(t.store.id, s.A);
    assert.equal(t.scope.storeId, s.A);
    assert.equal(t.scope.kind, "public");
    assert.equal(t.pageId, s.pageA);
    assert.equal(t.versionId, s.versionA);
    assert.ok(t.doc.product.name);
    assert.equal(await pub.resolvePublicTarget(s.keyExportPhp), null, "php export: no orders");
    assert.equal((await pub.resolvePublicTarget(s.keyExportPhp, { purpose: "event" }))?.store.id, s.A);
    const pending = await pub.resolvePublicTarget(s.keyC);
    assert.equal(pending?.store.status, "pending");
    assert.equal(pub.publicApiAnswer(pending!.store.status, "order"), "unavailable");
    assert.equal(await pub.resolvePublicTarget(s.keyE), null, "closed store");
    assert.equal(await pub.resolvePublicTarget("pk_unknown_key_123"), null);
    assert.equal(await pub.resolvePublicTarget("bad key!"), null);
  });

  await check("resolveOrderForTracking: the order's store; a signed link checked inside; non-servable stores answer null", async () => {
    const plain = await pub.resolveOrderForTracking(s.orderA, null);
    assert.equal(plain?.store.id, s.A);
    assert.equal((await pub.resolveOrderForTracking(s.orderA, pub.signTrackLink(s.A, s.orderA)))?.orderId, s.orderA);
    assert.equal(await pub.resolveOrderForTracking(s.orderA, pub.signTrackLink(s.B, s.orderA)), null, "B's signature on A's order");
    assert.equal(await pub.resolveOrderForTracking(s.orderA, "zz.AAAAAAAAAAAAAAAAAAAAAA"), null);
    assert.equal(await pub.resolveOrderForTracking(s.orderD, null), null, "suspended store");
    assert.equal(await pub.resolveOrderForTracking("CMD-NOPE00", null), null);
  });

  await check("handles: current, renamed (the new store row), gone, unknown; resolveStoreByHandle follows the rename", async () => {
    assert.equal((await pub.resolveStoreHandle("atlas-argan"))?.kind, "current");
    const renamed = await pub.resolveStoreHandle("old-atlas");
    assert.ok(renamed && renamed.kind === "renamed", "renamed");
    assert.equal(renamed.store.handle, "atlas-argan");
    assert.equal((await pub.resolveStoreHandle("gone-shop"))?.kind, "gone");
    assert.equal(await pub.resolveStoreHandle("no-such-store"), null);
    assert.equal((await pub.resolveStoreByHandle("old-atlas"))?.id, s.A);
    assert.equal(await pub.resolveStoreByHandle("gone-shop"), null);
    assert.equal(await pub.resolveStoreByHandle("BAD HANDLE"), null);
  });

  await check("kit shares (P0b review F-13): a known token → its campaign and store, never another store's", async () => {
    const a = await pub.resolveKitShare(s.shares.a.token);
    assert.equal(a?.store.id, s.A);
    assert.equal(a?.campaignId, s.shares.a.id);
    assert.equal(a?.scope.storeId, s.A);
    assert.equal(a?.scope.kind, "public");
    const b = await pub.resolveKitShare(s.shares.b.token);
    assert.equal(b?.store.id, s.B, "store B's token resolves to store B, though both campaigns share the slug");
    assert.equal(b?.campaignId, s.shares.b.id);
    assert.notEqual(a?.campaignId, b?.campaignId);
  });

  await check("kit shares (P0b review F-13): revoked, malformed and unknown tokens, and the store states", async () => {
    assert.equal(await pub.resolveKitShare(s.shares.revoked), null, "a revoked share (share_token_hash NULL)");
    for (const bad of ["", "short", "x".repeat(129), `${s.shares.a.token} `, `${s.shares.a.token.slice(0, 20)}/../x`, "é".repeat(20)])
      assert.equal(await pub.resolveKitShare(bad), null, `malformed ${JSON.stringify(bad.slice(0, 24))}`);
    assert.equal(await pub.resolveKitShare(randomBytes(24).toString("base64url")), null, "an unknown token");
    assert.equal(await pub.resolveKitShare(createHash("sha256").update(s.shares.a.token).digest("hex")), null, "the stored hash is not a token");
    assert.equal((await pub.resolveKitShare(s.shares.restricted))?.store.id, s.Rr, "a restricted store's share resolves");
    assert.equal(await pub.resolveKitShare(s.shares.suspended), null, "a suspended store's share");
    assert.equal(await pub.resolveKitShare(s.shares.pending), null, "a pending store's share");
  });

  await check("store requests (P0b review F-15): the decision as granted / declined, never the staff's note", async () => {
    const { newId } = await import("@/lib/db/ids");
    const conn = await (await import("mysql2/promise")).default.createConnection({ uri: process.env.DATABASE_URL!, charset: "utf8mb4_unicode_ci", timezone: "Z" });
    try {
      const rows: [string, string, string | null][] = [["plan_change", "approved", "internal: upsold"], ["limit_raise", "rejected", "internal: abuse suspicion"], ["mode_change", "pending", null], ["go_live", "withdrawn", null]];
      for (const [kind, status, note] of rows)
        await conn.query(
          "INSERT INTO signup_reviews (id, store_id, user_id, kind, score, signals, status, reason_note, band, request) VALUES (?, ?, ?, ?, 0, '{}', ?, ?, 'review', ?)",
          [newId(), s.A, newId(), kind, status, note, JSON.stringify({ kind })],
        );
      await conn.query("INSERT INTO signup_reviews (id, store_id, user_id, kind, score, signals, status, reason_note, band) VALUES (?, ?, ?, 'plan_change', 0, '{}', 'rejected', 'other store', 'review')", [newId(), s.B, newId()]);
    } finally {
      await conn.end();
    }
    const { listStoreRequests } = await import("@/lib/platform/requests");
    const list = await listStoreRequests(mintScope("member", s.A));
    assert.deepEqual(list.map((r) => [r.kind, r.status, r.outcome]).sort(), [["go_live", "withdrawn", null], ["limit_raise", "rejected", "declined"], ["mode_change", "pending", null], ["plan_change", "approved", "granted"]]);
    assert.ok(!JSON.stringify(list).includes("internal:") && !JSON.stringify(list).includes("other store"), "no staff note, no other store's row");
  });

  await check("media keys: the key's store; a suspended store's media is not servable", async () => {
    const a = await pub.resolveMediaKey(s.mediaA);
    assert.equal(a?.store.id, s.A);
    assert.equal(pub.mediaServable(a!.store.status), true);
    const d = await pub.resolveMediaKey(s.mediaD);
    assert.equal(pub.mediaServable(d!.store.status), false);
    assert.equal(await pub.resolveMediaKey("0".repeat(32) + "-960.webp"), null);
  });

  await check("stats per store: rows carry the store, days are the store's own (STAT-01), reads never cross stores", async () => {
    const stats = await import("@/lib/stats");
    const scopeA = mintScope("public", s.A);
    const scopeB = mintScope("public", s.B);
    // 23:30 UTC: already the 25th in Casablanca (UTC+1), still the 24th in New York
    const at = new Date(Date.UTC(2026, 9, 24, 23, 30));
    await stats.recordEvent(scopeA, s.pageA, { type: "view", vid: "v-1234567890" }, "203.0.113.7", at);
    await stats.bumpOrderStats(scopeB, s.pageB, at, { orders: 1, revenue: 199 });
    const [rowsA, rowsB] = await Promise.all([statsRows(scopeA), statsRows(scopeB)]);
    const ra = rowsA.find((r) => r.pageId === s.pageA);
    const rb = rowsB.find((r) => r.pageId === s.pageB);
    assert.ok(!rowsB.some((r) => r.pageId === s.pageA) && !rowsA.some((r) => r.pageId === s.pageB), "each page's counters only in its own store");
    assert.equal(ra?.storeId, s.A);
    assert.equal(String(ra?.day).slice(0, 10), "2026-10-25");
    assert.equal(ra?.views, 1);
    assert.equal(ra?.uniques, 1);
    assert.equal(rb?.storeId, s.B);
    assert.equal(String(rb?.day).slice(0, 10), "2026-10-24");
    const a = await stats.getPageStats(scopeA, { from: "2026-10-20", to: "2026-10-26" });
    assert.equal(a.totals.views, 1);
    assert.equal(a.totals.orders, 0, "B's order never in A's stats");
    assert.deepEqual(a.pages.map((p) => p.pageId), [s.pageA]);
    const b = await stats.getPageStats(scopeB, { from: "2026-10-20", to: "2026-10-26" });
    assert.equal(b.totals.orders, 1);
    assert.equal(b.totals.revenue, 199);
    assert.equal(b.totals.views, 0);
    await stats.deletePageStats(scopeB, s.pageA);
    assert.equal((await stats.getPageStats(scopeA, { from: "2026-10-20", to: "2026-10-26" })).totals.views, 1, "B can't delete A's stats");
  });

  await check("publish guards: a pending store may not publish; another store's page is not_found", async () => {
    const { publishPage, PublishError } = await import("./publish.server");
    const actor = { kind: "user" as const, userId: null, impersonatorId: null, ip: null };
    await assert.rejects(publishPage(mintScope("member", s.C), s.pageC, { actor }), (e: unknown) => e instanceof PublishError && e.code === "forbidden");
    await assert.rejects(publishPage(mintScope("member", s.A), s.pageB, { actor }), (e: unknown) => e instanceof PublishError && e.code === "not_found");
  });

  await check("publish in the store: version row in the store, page live, first_published_at set once (COALESCE)", async () => {
    const { publishPage } = await import("./publish.server");
    const actor = { kind: "user" as const, userId: null, impersonatorId: null, ip: null };
    let message: string | null = null;
    try {
      const res = await publishPage(mintScope("member", s.A), s.pageADraft, { actor });
      const row = await pageRow(mintScope("member", s.A), s.pageADraft);
      assert.equal(row?.status, "published");
      assert.equal(row?.publishedVersionId, res.versionId);
      assert.ok(row?.firstPublishedAt, "first_published_at set");
      const first = row!.firstPublishedAt!.getTime();
      const again = await publishPage(mintScope("member", s.A), s.pageADraft, { actor });
      const row2 = await pageRow(mintScope("member", s.A), s.pageADraft);
      assert.equal(row2?.publishedVersionId, again.versionId);
      assert.equal(row2?.firstPublishedAt?.getTime(), first, "COALESCE: the first publish instant is kept");
      assert.equal((await versionRow(mintScope("member", s.A), again.versionId))?.storeId, s.A);
      assert.equal(await versionRow(mintScope("member", s.B), again.versionId), undefined, "the version row is in A only");
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
      deferIfStub(message);
      throw err;
    }
  });

  await check("first_published_at: the publish SET fills it once and keeps it afterwards (COALESCE)", async () => {
    const { firstPublishedAt } = await import("./publish.server");
    const scopeA = mintScope("member", s.A);
    const first = new Date(Date.UTC(2026, 9, 24, 8, 0, 0, 123));
    // the publish check before this one set it (T1's envelope is real since the T1 merge): start from NULL
    await setFirstPublished(scopeA, s.pageADraft, null);
    await setFirstPublished(scopeA, s.pageADraft, firstPublishedAt(first));
    await setFirstPublished(scopeA, s.pageADraft, firstPublishedAt(new Date(Date.UTC(2026, 9, 25))));
    const row = await pageRow(scopeA, s.pageADraft);
    assert.equal(row?.firstPublishedAt?.toISOString(), first.toISOString());
    await setFirstPublished(scopeA, s.pageADraft, null);
  });

  await check("unpublish: another store's page untouched; the page goes offline, first_published_at stays", async () => {
    const { unpublishPage } = await import("./publish.server");
    const actor = { kind: "user" as const, userId: null, impersonatorId: null, ip: null };
    assert.equal(await unpublishPage(mintScope("member", s.B), s.pageAHidden, actor), false);
    assert.equal(await unpublishPage(mintScope("member", s.A), s.pageAHidden, actor), true);
    const row = await pageRow(mintScope("member", s.A), s.pageAHidden);
    assert.equal(row?.status, "draft");
    assert.equal(row?.firstPublishedAt?.toISOString(), "2026-10-01T10:00:00.000Z");
    assert.equal((await auditRow(mintScope("member", s.A), "page.unpublished", s.pageAHidden))?.storeId, s.A);
    assert.equal(await auditRow(mintScope("member", s.B), "page.unpublished", s.pageAHidden), undefined, "audited in A only");
    assert.equal(await unpublishPage(mintScope("member", s.A), s.pageAHidden, actor), false, "already offline");
  });

  await check("preview tokens: another store's page is not_found, impersonation and public scopes refused, revoke is store-bound", async () => {
    const pt = await import("./preview-token");
    const { SeamError } = await import("@/lib/tenancy/seam");
    const input = { pageId: s.pageB, ttlSec: 3_600, audience: "seller" as const };
    await assert.rejects(pt.mintPreviewToken(mintScope("member", s.A), input), (e: unknown) => e instanceof SeamError && e.code === "not_found");
    await assert.rejects(pt.mintPreviewToken(mintScope("impersonation", s.B), input), (e: unknown) => e instanceof SeamError && e.code === "forbidden");
    await assert.rejects(pt.mintPreviewToken(mintScope("public", s.B), input), (e: unknown) => e instanceof SeamError && e.code === "forbidden");
    await assert.rejects(pt.mintPreviewToken(mintScope("member", s.B), { ...input, ttlSec: 300_000 }));
    const { newId } = await import("@/lib/db/ids");
    const jti = newId();
    await insertToken(mintScope("member", s.B), { id: jti, pageId: s.pageB, audience: "seller", expiresAt: new Date(Date.now() + 3_600_000) });
    await assert.rejects(pt.revokePreviewToken(mintScope("member", s.A), jti), (e: unknown) => e instanceof SeamError && e.code === "not_found");
    await pt.revokePreviewToken(mintScope("member", s.B), jti);
    const row = await tokenRow(mintScope("member", s.B), jti);
    assert.ok(row?.revokedAt, "revoked");
    await assert.rejects(pt.revokePreviewToken(mintScope("member", s.B), jti), "a second revoke is not_found");
    const garbage = await routes.servePreview(req(`${P}/preview/not-a-token`), "not-a-token");
    assert.equal(garbage.status, 404);
    assert.equal((await routes.servePreview(req("https://old-platform.test/preview/x"), "x")).status, 404, "platform host only");
  });

  await check("preview tokens: mint → open → render → revoke → 404 (needs T1's envelope)", async () => {
    const pt = await import("./preview-token");
    const minted = await pt.mintPreviewToken(mintScope("member", s.A), { pageId: s.pageA, ttlSec: 3_600, audience: "seller" });
    const token = decodeURIComponent(minted.url.split("/preview/")[1]!);
    const opened = await pt.openPreviewToken(token);
    assert.equal(opened?.storeId, s.A);
    const r = await routes.servePreview(req(minted.url), token);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("referrer-policy"), "no-referrer");
    assert.equal(r.headers.get("cache-control"), "private, no-store");
    await pt.revokePreviewToken(mintScope("member", s.A), minted.tokenId);
    assert.equal((await routes.servePreview(req(minted.url), token)).status, 404);
  });

  /* ---- P0b package F: the in-place re-render (§H.3, D50; CCR P8-2) and the generation record (CCR P3-11) ---- */
  const versionFull = async (scope: StoreScope, id: string) => (await db.select().from(schema.pageVersions).where(byId(schema.pageVersions, scope, id)).limit(1))[0]!;
  const versionCount = async (scope: StoreScope, pageId: string) => (await db.select({ id: schema.pageVersions.id }).from(schema.pageVersions).where(whereStore(schema.pageVersions, scope, eq(schema.pageVersions.pageId, pageId)))).length;
  const reActor = { kind: "system" as const, userId: null, impersonatorId: null, ip: null };

  await check("rerenderInPlace: the live version is rewritten in place (same version id, new etag, doc and checksum unchanged, no new row, cache dropped)", async () => {
    const { rerenderInPlace } = await import("./publish.server");
    const scopeA = mintScope("system", s.A);
    // the stored (seeded) bytes are served, and cached, first
    const servedBefore = await serve(`${P}/s/atlas-argan/glow`, { page: "landing", slug: "glow" }, "atlas-argan");
    const before = await versionFull(scopeA, s.versionGlow);
    assert.equal(await servedBefore.text(), before.html);
    const pageBefore = await pageRow(scopeA, s.pageAGlow);
    const rows = await versionCount(scopeA, s.pageAGlow);
    const r = await rerenderInPlace(scopeA, s.pageAGlow, { reason: "store_info", actor: reActor });
    assert.equal(r.status, "rendered");
    assert.equal(r.versionId, s.versionGlow);
    assert.ok(Array.isArray(r.notes), "the warn-mode notes");
    const after = await versionFull(scopeA, s.versionGlow);
    assert.notEqual(after.etag, before.etag, "a new etag");
    assert.equal(r.etag, after.etag);
    assert.equal(after.etag, sha(after.html!), "the etag is the new html's");
    assert.ok(after.html!.startsWith("<!DOCTYPE html>") && after.html!.includes(s.versionGlow), "the real document, ver = the same version id");
    assert.ok(after.thankYouHtml !== before.thankYouHtml && after.csp !== before.csp && after.thankYouCsp !== before.thankYouCsp, "every rendered column rewritten");
    assert.equal(JSON.stringify(after.doc), JSON.stringify(before.doc), "the doc is untouched");
    assert.equal(after.checksum, before.checksum, "the checksum is untouched");
    assert.equal(after.runtimeV, 2, "runtime_v is untouched");
    assert.equal(after.createdAt.getTime(), before.createdAt.getTime());
    assert.equal(await versionCount(scopeA, s.pageAGlow), rows, "no new version row");
    const pageAfter = await pageRow(scopeA, s.pageAGlow);
    assert.equal(pageAfter?.publishedVersionId, s.versionGlow);
    assert.equal(pageAfter?.updatedAt.getTime(), pageBefore?.updatedAt.getTime(), "the draft stamp never moves");
    const servedAfter = await serve(`${P}/s/atlas-argan/glow`, { page: "landing", slug: "glow" }, "atlas-argan");
    assert.equal(await servedAfter.text(), after.html, "the store's render cache was dropped");
    // nothing changed in the store meanwhile: a second re-render writes the same bytes
    const again = await rerenderInPlace(scopeA, s.pageAGlow, { reason: "brand", actor: reActor });
    assert.equal(again.etag, after.etag, "deterministic");
  });

  await check("rerenderInPlace: runtime_v 1 → skipped_runtime_v1; unpublished, never published and other-store pages → not_live; nothing written", async () => {
    const { rerenderInPlace } = await import("./publish.server");
    const scopeA = mintScope("system", s.A);
    const retro = await versionFull(scopeA, s.versionRetro);
    const r = await rerenderInPlace(scopeA, s.pageARetro, { reason: "runtime", actor: reActor });
    assert.deepEqual(r, { status: "skipped_runtime_v1", versionId: s.versionRetro, notes: [] });
    assert.equal((await versionFull(scopeA, s.versionRetro)).etag, retro.etag);
    assert.equal((await rerenderInPlace(scopeA, s.pageAOff, { reason: "address", actor: reActor })).status, "not_live", "never published");
    assert.equal((await rerenderInPlace(scopeA, s.pageAHidden, { reason: "address", actor: reActor })).status, "not_live", "unpublished (its version kept)");
    const bVersion = (await pageRow(mintScope("system", s.B), s.pageB))!.publishedVersionId!;
    const bBefore = await versionFull(mintScope("system", s.B), bVersion);
    assert.equal((await rerenderInPlace(scopeA, s.pageB, { reason: "address", actor: reActor })).status, "not_live", "another store's page id");
    assert.equal((await versionFull(mintScope("system", s.B), bVersion)).etag, bBefore.etag, "store B's version untouched");
  });

  await check("rerenderInPlace: a publish between the load and the commit → live_changed, the new version left as published", async () => {
    const { publishPage, rerenderInPlace } = await import("./publish.server");
    const scopeA = mintScope("member", s.A);
    const actor = { kind: "user" as const, userId: null, impersonatorId: null, ip: null };
    const old = await versionFull(scopeA, s.versionGlow);
    const rows = await versionCount(scopeA, s.pageAGlow);
    // the re-render's commit transaction is the first one it opens: a real publish lands right before it
    const real = globalThis.__codDb!.db as unknown as { transaction: (...args: unknown[]) => Promise<unknown> };
    const original = real.transaction;
    let published: string | null = null;
    real.transaction = async (...args: unknown[]) => {
      delete (real as { transaction?: unknown }).transaction;
      published = (await publishPage(scopeA, s.pageAGlow, { actor })).versionId;
      return original.apply(real, args);
    };
    try {
      const r = await rerenderInPlace(scopeA, s.pageAGlow, { reason: "conversions", actor });
      assert.ok(published, "the publish ran");
      assert.equal(r.status, "live_changed");
      assert.equal(r.etag, undefined);
      const page = await pageRow(scopeA, s.pageAGlow);
      assert.equal(page?.publishedVersionId, published);
      const fresh = await versionFull(scopeA, published!);
      assert.equal(fresh.etag, sha(fresh.html!), "the new version keeps the publish's own bytes");
      assert.equal((await versionFull(scopeA, s.versionGlow)).etag, old.etag, "the old version is not written either");
      assert.equal(await versionCount(scopeA, s.pageAGlow), rows + 1, "only the publish's row");
    } finally {
      delete (real as { transaction?: unknown }).transaction;
    }
  });

  await check("generationRecordFor: report.gen of the page's newest chosen page genome in the store, cleaned; none → null; another store → null", async () => {
    const { generationRecordFor, hash16 } = await import("./prepublish");
    const { newId } = await import("@/lib/db/ids");
    const scopeA = mintScope("member", s.A);
    assert.equal(await generationRecordFor(scopeA, s.pageA), null, "no genome row");
    // P6's wizard writes these rows; the suite's fixture writes go through the store predicate like the app's
    const insertGenome = async (scope: WriteScope, source: "chosen" | "generated", gen: Record<string, unknown> | undefined, at: Date) =>
      db.insert(schema.designGenomes).values(
        storeValues(scope, {
          id: newId(),
          pageId: s.pageA,
          kind: "page" as const,
          source,
          niche: "beauty",
          bucket: "beauty|grid|mono",
          vec: [0],
          genome: { v: 1 as const, s: 1, b: {}, p: {}, x: [] },
          seed: 1,
          report: { v: 1 as const, hard: [], soft: [], slop: [], copy: { cliche: 0, spec: 0 }, ...(gen ? { gen: gen as never } : {}) },
          createdAt: at,
        }),
      );
    const h = hash16("Huile d'argan");
    await insertGenome(scopeA, "chosen", { "hero1.title": { h, o: "cloud" } }, new Date(Date.UTC(2026, 9, 1)));
    await insertGenome(scopeA, "chosen", { "hero1.title": { h, o: "engine" }, "hero1.lead": { h: "XYZ", o: "cloud" }, "hero1.kicker": { h, o: "robot" } }, new Date(Date.UTC(2026, 9, 2)));
    await insertGenome(scopeA, "generated", { "hero1.title": { h, o: "local" } }, new Date(Date.UTC(2026, 9, 3)));
    assert.deepEqual(await generationRecordFor(scopeA, s.pageA), { "hero1.title": { h, o: "engine" } }, "the newest chosen row; malformed entries dropped");
    assert.equal(await generationRecordFor(mintScope("member", s.B), s.pageA), null, "never across stores");
    await insertGenome(scopeA, "chosen", undefined, new Date(Date.UTC(2026, 9, 4)));
    assert.equal(await generationRecordFor(scopeA, s.pageA), null, "the newest chosen row has no record");
  });
}

async function main() {
  await pure();
  try {
    await database();
  } finally {
    const { pool } = await import("@/lib/db/client").catch(() => ({ pool: null as null | (() => { end: () => Promise<void> }) }));
    try {
      if (globalThis.__codDb && pool) await pool().end();
    } catch {
      // already closed
    }
    if (!KEEP) {
      const root = await rootConnection();
      await root.query(`DROP DATABASE IF EXISTS \`${DB}\``);
      const [left] = (await root.query("SHOW DATABASES LIKE 'cod\\_test\\_t3\\_%'")) as unknown as [Record<string, string>[]];
      await root.end();
      console.log(`dropped ${DB}; cod_test_t3_* left: ${left.length}`);
    }
  }
  console.log(failures ? `${failures} FAILURE(S), ${deferred} deferred` : `ALL OK (${deferred} deferred until T1 merges)`);
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
