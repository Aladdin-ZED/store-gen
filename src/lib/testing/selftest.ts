// proves: LP-19, SF-05
/**
 * test:test-orders (P3 LANDING; landing.md LAN-§14.4; docs/STORE-SAAS.md D54):
 *
 *   npm run test:test-orders  (tsx src/lib/testing/selftest.ts [--db cod_test_p3_testorders] [--verbose])
 *
 * DB-backed, on the two-store fixtures of scripts/qa/tenancy-check.ts (a throwaway cod_test_* database, dropped at the
 * end): the mint / verify round trip (`mintTestLink` → `resolveTestToken`), the 2 h life (2 h + 1 s refused), store
 * A's token refused on store B, another store's or an unpublished page refused (`not_found`), the audit row; the test
 * render (`renderTestDocument` through src/lib/testing/render.server.ts): no pixel (config nor CSP), the test band,
 * the `?sg-test=` order, lead and thank-you URLs and no `endpoints.event`; the store route serves it `private,
 * no-store` (an unsigned `?sg-test=` is an ordinary visit); `is_test` on the order and on the lead posted through the
 * public routes with the minted token. Exits 1 on any failure.
 */
import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import type { Kit } from "../../../scripts/qa/tenancy-check";
import { byId, whereStore } from "@/lib/tenancy/sql"; // framework-free: no server-only, no connection
import type { Actor, StoreScope, WriteScope } from "@/lib/tenancy/types";

process.env.TENANCY_DB ??= "cod_test_p3_testorders";
const req = createRequire(__filename);
const T = req("../../../scripts/qa/tenancy-check") as typeof import("../../../scripts/qa/tenancy-check");
const { check, suite, load } = T;

const HOUR = 3_600_000;

async function main(): Promise<number> {
  const kit: Kit = await T.setup();
  const { fx } = kit;
  const { db } = load<typeof import("@/lib/db/client")>("@/lib/db/client");
  const S = load<typeof import("@/lib/db/schema")>("@/lib/db/schema");
  const { eq } = load<typeof import("drizzle-orm")>("drizzle-orm");
  const L = load<typeof import("@/lib/testing/links")>("@/lib/testing/links");
  const R = load<typeof import("@/lib/testing/render.server")>("@/lib/testing/render.server");
  const P = load<typeof import("@/lib/tenancy/public")>("@/lib/tenancy/public");
  const SP = load<typeof import("@/lib/render/store-pages.server")>("@/lib/render/store-pages.server");
  const SR = load<typeof import("@/lib/render/store-routes.server")>("@/lib/render/store-routes.server");
  const { SeamError } = load<typeof import("@/lib/tenancy/seam")>("@/lib/tenancy/seam");
  const A = T.writeScope(fx.A.id);
  // every read and write of the cases goes through the store's scope (the tenancy lint's rules hold here too)
  const q = {
    auditRows: (scope: StoreScope, target: string) =>
      db.select({ id: S.auditLog.id, userId: S.auditLog.userId }).from(S.auditLog).where(whereStore(S.auditLog, scope, eq(S.auditLog.action, "page.test_link_created"), eq(S.auditLog.target, target))),
    standInHtml: (scope: WriteScope, versionId: string, html: string) =>
      db
        .update(S.pageVersions)
        .set({ html, csp: "default-src 'none'", etag: createHash("sha256").update(html).digest("hex"), thankYouHtml: html, thankYouCsp: "default-src 'none'" })
        .where(byId(S.pageVersions, scope, versionId)),
    pageKey: async (scope: StoreScope, pageId: string) => (await db.select({ key: S.pages.publicKey }).from(S.pages).where(byId(S.pages, scope, pageId)).limit(1))[0]?.key ?? "",
    versionDoc: async (scope: StoreScope, versionId: string) => (await db.select({ doc: S.pageVersions.doc }).from(S.pageVersions).where(byId(S.pageVersions, scope, versionId)).limit(1))[0]?.doc,
    order: async (scope: StoreScope, idem: string) => (await db.select({ isTest: S.orders.isTest, sheet: S.orders.sheetStatus }).from(S.orders).where(whereStore(S.orders, scope, eq(S.orders.idem, idem))).limit(1))[0],
    lead: async (scope: StoreScope, idem: string) => (await db.select({ isTest: S.leads.isTest }).from(S.leads).where(whereStore(S.leads, scope, eq(S.leads.idem, idem))).limit(1))[0],
  };
  const owner: Actor = { kind: "user", userId: fx.A.members.owner, impersonatorId: null, ip: null };
  const host = new URL(T.PLATFORM).host;
  const storeA = (await P.getStoreById(fx.A.id))!;
  const storeB = (await P.getStoreById(fx.B.id))!;

  /* ------------------------------------------------------------ mint and verify */
  suite("mint and verify (LAN-§14.1)");
  const now = Date.now();
  const link = await L.mintTestLinkAs(A, owner, fx.A.page.live, now);
  const url = new URL(link.url);
  const token = url.searchParams.get("sg-test") ?? "";
  check("the URL is the page's canonical address + ?sg-test=<token>", link.url.startsWith(`${T.PLATFORM}/s/${fx.A.handle}/${fx.A.slug}?sg-test=`) && url.search === `?sg-test=${encodeURIComponent(token)}`, link.url);
  check("expiresAt = now + 2 h", Math.abs(link.expiresAt.getTime() - (now + 2 * HOUR)) < 1_000, link.expiresAt);
  check("the token verifies for store A", P.resolveTestToken(storeA, token, now).test === true);
  check("…still 1 s before it ends", P.resolveTestToken(storeA, token, now + 2 * HOUR - 1_000).test === true);
  check("2 h + 1 s later it is refused", P.resolveTestToken(storeA, token, now + 2 * HOUR + 1_000).test === false);
  check("store A's token is refused on store B", P.resolveTestToken(storeB, token, now).test === false);
  check("a forged or unsigned token is refused", P.resolveTestToken(storeA, "abc.0123456789abcdefghijkl", now).test === false && P.resolveTestToken(storeA, "anything", now).test === false);
  const rows = await q.auditRows(A, fx.A.page.live);
  check("audited page.test_link_created in A with the member", rows.length === 1 && rows[0]!.userId === fx.A.members.owner, rows);
  for (const [name, pageId] of [
    ["B's page through A", fx.B.page.live],
    ["A's draft", fx.A.page.draft],
    ["A's archived page", fx.A.page.archived],
    ["a malformed id", "nope"],
  ] as const) {
    let code: string | null = null;
    try {
      await L.mintTestLink(A, pageId);
    } catch (err) {
      code = err instanceof SeamError ? err.code : String(err);
    }
    check(`${name} → not_found`, code === "not_found", code);
  }
  check("the frozen mintTestLink (system actor) mints too", (await L.mintTestLink(A, fx.A.page.live)).url.includes("?sg-test="));

  /* ------------------------------------------------------------ the test render */
  suite("the test document (LAN-§14.2)");
  // the fixture's live version holds a document but no rendered bytes: give it a stand-in live HTML, so the store
  // route finds the page (the test render renders the document itself)
  const liveHtml = "<!DOCTYPE html><title>live</title><p>live page</p>";
  await q.standInHtml(A, fx.A.version.live, liveHtml);
  const pub = P.publicScope(storeA);
  const page = await SP.getPublishedPage(pub, storeA, fx.A.slug);
  check("A's live page is served", !!page);
  if (page) {
    const doc = await R.renderTestDocument(pub, storeA, page, token, "landing");
    check("renderTestDocument renders", !!doc);
    if (doc) {
      const cfg = JSON.parse(/<script type="application\/json" id="lp-config">([\s\S]*?)<\/script>/.exec(doc.html)?.[1] ?? "{}") as {
        pixels?: Record<string, unknown>;
        endpoints?: Record<string, string | undefined>;
        thankYouUrl?: string;
      };
      check("no pixel: an empty pixel map and no pixel host in the CSP", JSON.stringify(cfg.pixels ?? {}) === "{}" && !/facebook|tiktok|snap|googletagmanager/.test(doc.csp), { pixels: cfg.pixels });
      check("the test band", doc.html.includes("lp-test-band"));
      check("the order endpoint and the thank-you URL carry ?sg-test=", !!cfg.endpoints?.order?.endsWith(`?sg-test=${encodeURIComponent(token)}`) && !!cfg.thankYouUrl?.includes(`sg-test=${encodeURIComponent(token)}`), cfg);
      check("the lead endpoint, when present, carries it too", !cfg.endpoints?.lead || cfg.endpoints.lead.endsWith(`?sg-test=${encodeURIComponent(token)}`));
      check("no endpoints.event (test traffic never reaches stats)", cfg.endpoints?.event === undefined);
    }
    const serve = async (query: string) => {
      const res = await SR.serveStoreRoute(new Request(`${T.PLATFORM}/s/${fx.A.handle}/${fx.A.slug}${query}`, { headers: { host, "user-agent": "test-orders" } }), fx.A.handle, { page: "landing", slug: fx.A.slug });
      return { status: res.status, cache: res.headers.get("cache-control"), csp: res.headers.get("content-security-policy") ?? "", html: await res.text() };
    };
    const served = await serve(`?sg-test=${encodeURIComponent(token)}`);
    check("the store route serves the test document private, no-store", served.status === 200 && served.cache === "private, no-store" && served.html.includes("lp-test-band"), { status: served.status, cache: served.cache });
    check(
      "…with its connect-src narrowed to the serving origin's public API (no bare 'self', SEC-2)",
      !/(connect-src|form-action)[^;]*'self'/.test(served.csp) && served.csp.includes("/api/public/"),
      served.csp,
    );
    const plain = await serve("?sg-test=anything");
    check("an unsigned ?sg-test= is an ordinary visit", plain.status === 200 && plain.cache !== "private, no-store" && !plain.html.includes("lp-test-band"));
  }

  /* ------------------------------------------------------------ is_test (LAN-§14.3) */
  suite("is_test on the order and the lead (D54)");
  {
    const pageKey = await q.pageKey(A, fx.A.page.live);
    const call = (file: string, template: string, body: unknown, ip: string) =>
      T.callRoute({ anonymous: true }, { file, template, methods: ["POST"] }, "POST", {}, { body, query: { "sg-test": token } }, { headers: { "x-forwarded-for": ip } });
    // a valid order of the live version: its first bundle with the first option of every choice group
    const doc = (await q.versionDoc(A, fx.A.version.live)) as import("@/lib/page/schema").PageDoc;
    const { offerUnits } = load<typeof import("@/lib/page/catalog")>("@/lib/page/catalog");
    const { isChoiceGroup } = load<typeof import("@/lib/page/schema")>("@/lib/page/schema");
    const { getMarket } = load<typeof import("@/lib/markets")>("@/lib/markets");
    const bundle = doc.offers.bundles[0]!;
    const variants = Array.from({ length: offerUnits(bundle) }, () =>
      Object.fromEntries((doc.items[0]?.groups ?? []).filter(isChoiceGroup).map((g) => [g.id, (g.options.find((o) => !o.soldOut) ?? g.options[0]!).id])),
    );
    const idem = randomUUID();
    const phone = `066${String(Date.now() % 1_000_000).padStart(6, "0")}1`;
    const order = await call(
      "src/app/api/public/order/route.ts",
      "/api/public/order",
      { pageKey: pageKey, idem, eventId: `qa_${idem.slice(0, 12)}`, bundleId: bundle.id, variants, bump: false, name: "Test Owner", phone, city: getMarket(doc.market).cities?.[0]?.value ?? "Casablanca", address: "12 Rue Test, Maarif", email: "", website: "", t: 30_000, utm: {} },
      "198.51.100.91",
    );
    const orderRow = await q.order(A, idem);
    check("an order posted with the minted token is is_test, its Sheets push disabled", orderRow?.isTest === true && orderRow.sheet === "disabled", { answer: order.ok ? order.value?.body.slice(0, 200) : order, row: orderRow });
    const leadIdem = randomUUID();
    const lead = await call("src/app/api/public/lead/route.ts", "/api/public/lead", { pageKey: pageKey, idem: leadIdem, phone: `066${String((Date.now() + 7919) % 1_000_000).padStart(6, "0")}2`, name: "Lead Test", city: "Rabat", bundleId: bundle.id }, "198.51.100.92");
    const leadRow = await q.lead(A, leadIdem);
    check("a lead posted with the minted token is is_test", leadRow?.isTest === true, { answer: lead.ok ? lead.value?.body.slice(0, 200) : lead, row: leadRow });
  }
  return 0;
}

void (async () => {
  const started = Date.now();
  let failed = 1;
  try {
    failed = await main();
  } catch (e) {
    check("the suite ran to the end", false, e instanceof Error ? e.stack : e);
  } finally {
    const left = await T.dropDatabase().catch((e: unknown) => [`cleanup failed: ${e instanceof Error ? e.message : String(e)}`]);
    const fails = T.report("test:test-orders (LP-19, SF-05)", [`database ${T.DB_NAME} dropped; cod_test_* left: ${left.length ? left.join(", ") : "none"}`, `${Math.round((Date.now() - started) / 1000)} s`]);
    process.exit(fails || failed ? 1 : 0);
  }
})();
