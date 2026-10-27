/**
 * Ad pixels — server side, offline (fetch is mocked; no network, no database), docs/OFFERS.md §A:
 *  - Tracking schema: legacy single ids → lists, dedupe, limits, empty → unset; `none` / `copiedFrom`;
 *    repair drops `none` when ids are set;
 *  - pixel library schema (ids, duplicates, caps, test windows) and the pure helpers (windows, diff,
 *    edits, labels, health throttle);
 *  - migration (pure part): store ids first, then by usage, no cap, labels;
 *  - per-pixel server credentials: own token only (legacy never read), the test code only inside an
 *    active window of the event's page;
 *  - Purchase payloads: event_id = order id, same event names as the browser pixel, hashed E.164
 *    phone, contents per item from allocate() incl. the bump item, one request per pixel with a token,
 *    tokens never in URLs; health classes of failures;
 *  - transport: retry on 5xx, failures never throw, TikTok non-zero codes are failures;
 *  - "Send test event": test_event_code always set, the platform's answer is reported, the platform's brand
 *    names the test product and the user agent (PIX-09);
 *  - per store (docs/STORE-SAAS.md §E.6, SET-11, SHT-09): the health throttle is keyed by store (one store's write
 *    never suppresses another's for the same pixel id); the Sheets ownership proof (code format, only the hash
 *    compared, found alone or inside other text, case-insensitive, never a near miss).
 *
 *   npx tsx scripts/qa/conversions-check.ts      (exit code 1 on failure)
 */
import { createHash } from "node:crypto";
import { OrderPayload } from "@/lib/orders/contract";
import { CONVERSION_MAX_RISK, dispatchPurchase, failureCode, orderContents, purchaseConversion, sendTestEvent, serverCredentials, type TrackingSecrets } from "@/lib/orders/conversions-core";
import { getFixture } from "@/lib/page/fixtures";
import { emptySelection, orderTotals } from "@/lib/page/pricing";
import { PageDoc, Tracking } from "@/lib/page/schema";
import { pixelChecks, pixelNotes } from "@/lib/pixels/checklist";
import { PIXEL_EVENTS } from "@/lib/pixels/ids";
import {
  editTracking,
  healthWriteDue,
  missingPixels,
  pixelLabel,
  pruneLibrary,
  testWindow,
  trackingDiff,
  usageText,
  withEntry,
  type PixelLibrary,
  type PixelLibraryView,
} from "@/lib/pixels/library";
import { collectPixels, migrationLabel } from "@/lib/pixels/migrate";
import { dueHealthUpdates, forgetHealthWrites, noteHealthWrite } from "@/lib/pixels/throttle";
import { newProofCode, proofFound, proofHash } from "@/lib/sheets/proof";
import { runtimePixels, trackingFlags } from "@/lib/pixels/tracking";
import { PixelLibrarySettings, TrackingSecretsSettings, redactSetting } from "@/lib/settings/schemas";

let pass = 0;
const failures: string[] = [];
function eq(label: string, got: unknown, want: unknown): void {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) pass++;
  else failures.push(`${label}\n    got:  ${g}\n    want: ${w}`);
}
function ok(label: string, cond: boolean, info?: unknown): void {
  if (cond) pass++;
  else failures.push(`${label}${info === undefined ? "" : `\n    ${JSON.stringify(info)}`}`);
}
const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

const META_A = "111111111111111";
const META_B = "222222222222222";
const TT_1 = "CTESTPIXEL0000000001";
const TT_2 = "CTESTPIXEL0000000002";
const SNAP = "1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d";
const PAGE = "01JAAAAAAAAAAAAAAAAAAAAAAA";
const OTHER_PAGE = "01JBBBBBBBBBBBBBBBBBBBBBBB";
const NOW = Date.parse("2026-10-16T10:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();

/* ---------------- Tracking schema ---------------- */
eq("legacy single id → list", Tracking.parse({ metaPixelId: META_A, ga4Id: "G-TEST1234" }), { metaPixelId: [META_A], ga4Id: ["G-TEST1234"] });
eq("lists kept, deduplicated", Tracking.parse({ tiktokPixelId: [TT_1, TT_2, TT_1] }).tiktokPixelId, [TT_1, TT_2]);
eq("empty list → unset", Tracking.parse({ metaPixelId: [] }).metaPixelId, undefined);
ok("4 Meta pixels refused", !Tracking.safeParse({ metaPixelId: [META_A, META_B, "333333333333333", "444444444444444"] }).success);
ok("2 Snap pixels refused", !Tracking.safeParse({ snapPixelId: [SNAP, "9a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d"] }).success);
ok("invalid id refused", !Tracking.safeParse({ tiktokPixelId: ["lowercase-id"] }).success);
eq("No pixel answer kept", Tracking.parse({ none: true }), { none: true });
{
  const fx = getFixture("massage");
  const legacy = PageDoc.safeParse({ ...fx.doc, tracking: { metaPixelId: META_A, tiktokPixelId: TT_1 } });
  ok("legacy page document still parses", legacy.success);
  if (legacy.success) {
    eq("legacy page → runtime pixels", runtimePixels(legacy.data.tracking), { meta: [META_A], tiktok: [TT_1] });
    eq("legacy page → CSP flags", trackingFlags(legacy.data.tracking), { meta: true, tiktok: true, snap: false, ga4: false });
  }
  eq("runtime pixels read raw legacy strings", runtimePixels({ metaPixelId: META_A, snapPixelId: SNAP }), { meta: [META_A], snap: [SNAP] });
  const both = PageDoc.safeParse({ ...fx.doc, tracking: { metaPixelId: [META_A], none: true, copiedFrom: "Argan" } });
  ok("repair drops `none` when ids are set, keeps copiedFrom", both.success && both.data.tracking.none === undefined && both.data.tracking.copiedFrom === "Argan", both.success ? both.data.tracking : both.error.issues);
  eq("runtime pixels ignore none / copiedFrom", runtimePixels({ none: true, copiedFrom: "x" }), {});
}

/* ---------------- pixel library ---------------- */
const entry = (platform: "meta" | "tiktok" | "snap" | "ga4", id: string, extra: Record<string, unknown> = {}) => ({ platform, id, label: "", addedAt: iso(NOW - 86_400_000), tests: [], ...extra });
ok("library: valid entries parse", PixelLibrarySettings.safeParse({ pixels: [entry("meta", META_A), entry("tiktok", TT_1)] }).success);
ok("library: duplicate refused", !PixelLibrarySettings.safeParse({ pixels: [entry("meta", META_A), entry("meta", META_A)] }).success);
ok("library: invalid id refused", !PixelLibrarySettings.safeParse({ pixels: [entry("meta", "abc")] }).success);
ok("library: label > 40 refused", !PixelLibrarySettings.safeParse({ pixels: [entry("meta", META_A, { label: "x".repeat(41) })] }).success);
ok("library: 6 test windows refused", !PixelLibrarySettings.safeParse({ pixels: [entry("meta", META_A, { tests: Array.from({ length: 6 }, () => ({ pageId: PAGE, until: iso(NOW + 60_000) })) })] }).success);
ok("library: 200 pixels allowed, 201 refused", PixelLibrarySettings.safeParse({ pixels: Array.from({ length: 200 }, (_, i) => entry("meta", String(1_000_000 + i))) }).success && !PixelLibrarySettings.safeParse({ pixels: Array.from({ length: 201 }, (_, i) => entry("meta", String(1_000_000 + i))) }).success);
eq("library: v defaults to 1, pixels to []", PixelLibrarySettings.parse({}), { v: 1, pixels: [] });

const library: PixelLibrary = PixelLibrarySettings.parse({
  pixels: [
    entry("meta", META_A, { label: "Compte principal" }),
    entry("meta", META_B, { label: "BM backup" }),
    entry("tiktok", TT_1, { label: "TikTok Maroc", tests: [{ pageId: PAGE, until: iso(NOW + 30 * 60_000) }, { pageId: OTHER_PAGE, until: iso(NOW - 60_000) }] }),
    entry("tiktok", TT_2),
  ],
});
ok("test window: active for its page", !!testWindow(library, "tiktok", TT_1, PAGE, NOW));
ok("test window: never for another page", testWindow(library, "tiktok", TT_1, "01JCCCCCCCCCCCCCCCCCCCCCCC", NOW) === null);
ok("test window: expired ignored", testWindow(library, "tiktok", TT_1, OTHER_PAGE, NOW) === null);
ok("test window: ends at `until`", testWindow(library, "tiktok", TT_1, PAGE, NOW + 30 * 60_000) === null);
eq("pruneLibrary drops expired windows", pruneLibrary(library, NOW).pixels[2]!.tests.map((w) => w.pageId), [PAGE]);
eq("withEntry replaces in place", withEntry(library, { ...library.pixels[1]!, label: "Backup 2" }).pixels.map((p) => p.label), ["Compte principal", "Backup 2", "TikTok Maroc", ""]);
eq("trackingDiff", trackingDiff({ metaPixelId: [META_A, META_B] }, { metaPixelId: [META_A], tiktokPixelId: [TT_1] }), {
  added: [{ platform: "meta", id: META_B }],
  removed: [{ platform: "tiktok", id: TT_1 }],
});
eq("editTracking: adding an id drops none and copiedFrom", editTracking({ none: true, copiedFrom: "Argan" }, "meta", [META_A]), { metaPixelId: [META_A] });
eq("editTracking: removing the last id leaves the page unanswered", editTracking({ metaPixelId: [META_A] }, "meta", []), {});
ok("missingPixels: no ids, no none", missingPixels({}) && !missingPixels({ none: true }) && !missingPixels({ ga4Id: ["G-TEST1234"] }));
eq("pixelLabel: label, else platform + masked id", [pixelLabel({ platform: "meta", id: META_A, label: "Compte principal" }), pixelLabel(undefined, "tiktok", TT_2)], ["Compte principal", "TikTok ••••0002"]);
eq("usageText", [usageText({ pages: 3, live: 2, exports: 1, drafts: 3 }), usageText({ pages: 1, live: 0, exports: 0, drafts: 1 })], ["Used on 3 pages · 2 live · 1 export", "Used on 1 page"]);
ok("health throttle: first write, changes and 10 min", healthWriteDue(undefined, { state: "ok" }, NOW) && !healthWriteDue({ state: "ok", at: NOW }, { state: "ok" }, NOW + 60_000) && healthWriteDue({ state: "ok", at: NOW }, { state: "refused", code: "token" }, NOW + 1) && healthWriteDue({ state: "ok", at: NOW }, { state: "ok" }, NOW + 10 * 60_000));

/* ---------------- per store: health throttle, Sheets proof ---------------- */
{
  const STORE_A = "0000000000000000000000QA01";
  const STORE_B = "0000000000000000000000QA02";
  const u = { platform: "meta" as const, id: META_A, state: "ok" };
  noteHealthWrite(STORE_A, u, NOW);
  eq("health throttle per store: A's write throttles A only", [dueHealthUpdates(STORE_A, [u], NOW + 1000).length, dueHealthUpdates(STORE_B, [u], NOW + 1000).length], [0, 1]);
  eq("health throttle per store: a changed state is due", dueHealthUpdates(STORE_A, [{ ...u, state: "refused", code: "token" }], NOW + 1000).length, 1);
  forgetHealthWrites(STORE_A, [`meta:${META_A}`]);
  eq("health throttle per store: a forgotten pixel is due again", dueHealthUpdates(STORE_A, [u], NOW + 1000).length, 1);

  const code = newProofCode(Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7, 30, 31]));
  eq("proof code: SG- + 10 Crockford base32", code, "SG-01234567YZ");
  ok("proof code: random codes have the format", Array.from({ length: 20 }, () => newProofCode()).every((c) => /^SG-[0-9A-HJKMNP-TV-Z]{10}$/.test(c)));
  const h = proofHash(code);
  ok("proof hash: sha256 hex, trimmed and case-insensitive", /^[0-9a-f]{64}$/.test(h) && proofHash(` ${code.toLowerCase()} `) === h);
  // the values are the spreadsheet's title and its tab titles (src/lib/sheets/connect.ts: never a cell, SHT-09)
  ok("proof found: the code as a tab's name", proofFound([["Ventes", "Commandes", code]], h));
  ok("proof found: inside the spreadsheet's name, any case", proofFound([[`ma boutique ${code.toLowerCase()} merci`, "Feuille 1"]], h));
  ok("proof not found: another code, a near miss, numbers, empty", !proofFound([[newProofCode(), code.slice(0, -1), "SG-01234567YY"], [12345]], h) && !proofFound(undefined, h) && !proofFound([[]], h));
}

/* ---------------- checklist ---------------- */
{
  const fx = getFixture("massage");
  const bare = PageDoc.parse({ ...fx.doc, tracking: {} });
  const view: PixelLibraryView = {
    canCreate: false,
    pixels: [
      { platform: "meta", id: META_A, label: "Compte principal", addedAt: iso(NOW), server: true, testCode: false, activeTests: [], health: { at: iso(NOW), state: "refused", code: "permission", testMode: false }, usage: { pages: 1, live: 1, exports: 0, drafts: 1 } },
      { platform: "tiktok", id: TT_1, label: "TikTok Maroc", addedAt: iso(NOW), server: false, testCode: false, activeTests: [], health: null, usage: { pages: 1, live: 1, exports: 0, drafts: 1 } },
    ],
  };
  eq("checklist: no pixel → warning", pixelChecks(bare, { library: null, health: {}, live: false }).map((c) => c.id), ["pixels:none"]);
  eq("checklist: No pixel answer → nothing", pixelChecks(PageDoc.parse({ ...fx.doc, tracking: { none: true } }), { library: null, health: {}, live: false }), []);
  const withIds = PageDoc.parse({ ...fx.doc, tracking: { metaPixelId: [META_A], tiktokPixelId: [TT_1], copiedFrom: "Argan" } });
  const checks = pixelChecks(withIds, { library: view, health: { [`meta:${META_A}`]: view.pixels[0]!.health! }, live: true });
  ok("checklist: server refusal warning with label and code", checks.length === 1 && /^Compte principal: server refused events \(permission\) since/.test(checks[0]!.title), checks);
  eq("notes: copied + browser-only", pixelNotes(withIds, { library: view }).map((n) => n.id), ["pixels:copied", `pixels:browser:tiktok:${TT_1}`]);
}

/* ---------------- migration (pure part) ---------------- */
{
  const store = { metaPixelId: [META_B], tiktokPixelId: [TT_2] };
  const sources = [
    { pageName: "Argan", tracking: { metaPixelId: [META_A] } },
    { pageName: "Massage", tracking: { metaPixelId: [META_A, META_B], tiktokPixelId: [TT_1] } },
    { pageName: "Massage", tracking: { metaPixelId: [META_A] } },
    { pageName: "Broken", tracking: { metaPixelId: ["not-an-id"], snapPixelId: SNAP } },
    { pageName: "Null", tracking: null },
  ];
  const got = collectPixels(store, sources);
  eq("migration: store ids first (their order), then by usage", got.map((p) => `${p.platform}:${p.id}`), [`meta:${META_B}`, `tiktok:${TT_2}`, `meta:${META_A}`, `tiktok:${TT_1}`, `snap:${SNAP}`]);
  eq("migration: first page name", got.find((p) => p.id === META_A)?.firstPage, "Argan");
  eq("migration: labels", [migrationLabel(got[0]!, 0), migrationLabel({ ...got[0]!, platform: "meta" }, 1), migrationLabel(got[2]!, 0)], ["Pixel principal", "Pixel 2", "Argan · ••••1111"]);
  ok("migration: long page names fit the 40-char label", migrationLabel({ platform: "meta", id: META_A, store: false, firstPage: "x".repeat(80) }, 0).length <= 40);
  const many = collectPixels(null, Array.from({ length: 150 }, (_, i) => ({ pageName: `P${i}`, tracking: { metaPixelId: [String(5_000_000 + i)] } })));
  eq("migration: no cap", many.length, 150);
}

/* ---------------- secrets: schema, redaction, credentials ---------------- */
const legacySecrets: TrackingSecrets = TrackingSecretsSettings.parse({
  metaCapiToken: "legacyMetaToken123",
  metaTestEventCode: "TEST111",
  tiktokToken: "legacyTikTokToken99",
  snapToken: "snapToken12345",
});
eq("legacy secrets parse with empty maps", [legacySecrets.metaTokens, legacySecrets.tiktokTestCodes], [{}, {}]);
{
  const s = TrackingSecretsSettings.parse({ metaTokens: { [META_A]: "ownTokenAAAA1111" }, metaTestCodes: { [META_A]: "TEST222" } });
  const red = redactSetting("tracking_secrets", s);
  eq("redactSetting masks per-pixel tokens", red.metaTokens, { [META_A]: "••••1111" });
  eq("own token, no window → production event", serverCredentials(s, library, "meta", META_A, PAGE, NOW), { token: "ownTokenAAAA1111" });
  eq("no token → browser only", serverCredentials(s, library, "meta", META_B, PAGE, NOW), null);
  eq("legacy single token is never read", serverCredentials(legacySecrets, library, "meta", META_B, PAGE, NOW), null);
  const tt = TrackingSecretsSettings.parse({ tiktokTokens: { [TT_1]: "ttOwnToken12345" }, tiktokTestCodes: { [TT_1]: "TEST999" } });
  eq("test code inside the page's window", serverCredentials(tt, library, "tiktok", TT_1, PAGE, NOW), { token: "ttOwnToken12345", testCode: "TEST999" });
  eq("same pixel, another page → production", serverCredentials(tt, library, "tiktok", TT_1, OTHER_PAGE, NOW), { token: "ttOwnToken12345" });
  eq("window over → production", serverCredentials(tt, library, "tiktok", TT_1, PAGE, NOW + 31 * 60_000), { token: "ttOwnToken12345" });
  ok("token map keys must be pixel ids", !TrackingSecretsSettings.safeParse({ metaTokens: { "not-an-id": "ownTokenAAAA1111" } }).success);
  ok("token maps take up to 200 pixels", TrackingSecretsSettings.safeParse({ metaTokens: Object.fromEntries(Array.from({ length: 200 }, (_, i) => [String(1_000_000 + i), "tokenValue12345"])) }).success);
}

/* ---------------- failure classes (pixel_health) ---------------- */
eq(
  "failureCode",
  [
    failureCode("meta", 400, { error: { code: 190, message: "Invalid OAuth access token." } }),
    failureCode("meta", 403, { error: { code: 10, message: "Permission denied" } }),
    failureCode("meta", 400, { error: { code: 100, message: "Unsupported post request. Object with ID does not exist" } }),
    failureCode("meta", 429, null),
    failureCode("meta", null, null),
    failureCode("tiktok", 200, { code: 40105, message: "Access token is incorrect or has been revoked" }),
    failureCode("tiktok", 200, { code: 40001, message: "No permission to operate" }),
    failureCode("tiktok", 200, { code: 40100, message: "Too many requests" }),
    failureCode("tiktok", 200, { code: 40002, message: "pixel code not found" }),
  ],
  ["token", "permission", "pixel", "rate", "network", "token", "permission", "rate", "pixel"],
);

/* ---------------- Purchase payloads + transport (mocked fetch) ---------------- */
interface Call {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}
const calls: Call[] = [];
let respond: (url: string, n: number) => { status: number; json: unknown } | "throw" = () => ({ status: 200, json: {} });
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string>, body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown> });
  const r = respond(url, calls.filter((c) => c.url === url).length);
  if (r === "throw") throw new TypeError("fetch failed");
  return new Response(JSON.stringify(r.json), { status: r.status, headers: { "content-type": "application/json" } });
}) as typeof fetch;

const okAnswer = (url: string) =>
  url.includes("graph.facebook.com") ? { status: 200, json: { events_received: 1, messages: [], fbtrace_id: "AbCdEf" } } : { status: 200, json: { code: 0, message: "OK", request_id: "req-1" } };

async function main() {
  const fx = getFixture("massage");
  const doc = PageDoc.parse({ ...fx.doc, tracking: { metaPixelId: [META_A, META_B], tiktokPixelId: [TT_1, TT_2], snapPixelId: [SNAP] } });
  const offer = doc.offers.bundles.find((b) => b.lines.reduce((n, l) => n + l.qty, 0) === 2) ?? doc.offers.bundles[0]!;
  const payload = OrderPayload.parse({
    pageKey: fx.pageKey,
    idem: "123e4567-e89b-42d3-a456-426614174000",
    eventId: "browser-uuid-0001",
    bundleId: offer.id,
    name: "Salma Test",
    phone: "+212612345678",
    t: 9000,
    utm: { ttclid: "E.C.P.ttclid12345" },
    fbp: "fb.1.1700000000000.1234567890",
    fbc: "fb.1.1700000000000.IwAR0abcdefgh",
    ttp: "ttp-cookie-value-123",
    ref: "https://shop.example/massage?utm_source=fb#top",
  });
  const selection = emptySelection(offer.id);
  const totals = orderTotals(doc, selection)!;
  const units = offer.lines.reduce((n, l) => n + l.qty, 0);
  const order = {
    totals,
    offer,
    selection,
    items: { qty: units, bundleLabel: "Pack Duo (x2)" },
    phone: { e164: "+212612345678", country: "MA" },
    email: null,
    name: "Salma Test",
    city: "Casablanca",
  } as unknown as Parameters<typeof purchaseConversion>[0]["order"];
  const target = { doc, pageId: PAGE, source: "live" as const };
  const at = new Date("2026-10-15T10:00:00Z");
  const base = { orderId: "CMD-PX0001", createdAt: at, payload, order, target, ip: "105.66.1.2", ua: "Mozilla/5.0 test" };

  ok("risky orders are not sent", purchaseConversion({ ...base, riskScore: CONVERSION_MAX_RISK }) === null);
  ok("no Meta/TikTok pixel → no event", purchaseConversion({ ...base, riskScore: 0, target: { ...target, doc: { ...doc, tracking: { snapPixelId: [SNAP] } } } }) === null);
  const c = purchaseConversion({ ...base, riskScore: 10 })!;
  eq("event id = order id (not the browser uuid)", c.eventId, "CMD-PX0001");
  eq("event pixels = the validated version's ids", c.pixels, { meta: [META_A, META_B], tiktok: [TT_1, TT_2] });
  eq("source url cleaned (no fragment)", c.sourceUrl, "https://shop.example/massage?utm_source=fb");
  const value = totals.total / 100;
  const cid = doc.items[0]!.sku || fx.pageKey;
  eq("single-item contents: units at the allocated price", c.contents, [{ id: cid, quantity: units, itemPrice: Math.round((offer.price / units) * 100) / 100 }]);
  eq("content name = product name (single item)", c.contentName, doc.product.name);

  /* multi-item contents (duo trio 349 = 149 + 149 + 199 by weight) + bump item at the bump price */
  {
    const dfx = getFixture("duo");
    const duo = PageDoc.parse({ ...dfx.doc, offers: { ...dfx.doc.offers, orderBump: { enabled: true, title: "Sérum", price: 99, item: "serum" } } });
    const trio = duo.offers.bundles.find((b) => b.id === "trio")!;
    const sel = { ...emptySelection("trio"), bump: true };
    const tot = orderTotals(duo, sel)!;
    const got = orderContents(duo, { offer: trio, selection: sel, totals: tot }, "PKDUO");
    eq("contents per item via allocate (largest remainder) + bump item", got, {
      contents: [
        { id: "PKDUO", quantity: 1, itemPrice: 104.63 },
        { id: "PKDUO.nuit", quantity: 1, itemPrice: 104.63 },
        { id: "PKDUO.serum", quantity: 2, itemPrice: 119.37 },
      ],
      numItems: 4,
    });
    const noBump = orderContents(duo, { offer: trio, selection: emptySelection("trio"), totals: orderTotals(duo, emptySelection("trio"))! }, "PKDUO");
    eq("no bump: Σ contents = offer price", Math.round(noBump.contents.reduce((n, x) => n + x.itemPrice * x.quantity, 0) * 100), 34900);
    const one = duo.offers.bundles.find((b) => b.id === "one")!;
    const choice = orderContents(duo, { offer: one, selection: { ...emptySelection("one"), units: [{ item: "nuit", options: {}, fields: {} }] }, totals: orderTotals(duo, emptySelection("one"))! }, "PKDUO");
    eq("choice unit counts as the chosen item", choice.contents.map((x) => x.id), ["PKDUO.nuit"]);
    const unresolved = orderContents(duo, { offer: one, selection: emptySelection("one"), totals: orderTotals(duo, emptySelection("one"))! }, "PKDUO");
    eq("unresolved choice unit = first available choice", unresolved.contents.map((x) => x.id), ["PKDUO"]);
    const conv = purchaseConversion({
      ...base,
      riskScore: 0,
      payload: { ...payload, pageKey: "PKDUO" },
      order: { ...order, offer: trio, selection: sel, totals: tot, items: { qty: 3, bundleLabel: "Le rituel complet (x3)" } } as unknown as Parameters<typeof purchaseConversion>[0]["order"],
      target: { ...target, doc: { ...duo, tracking: { metaPixelId: [META_A] } } },
    })!;
    eq("multi-item content name = offer label", conv.contentName, "Le rituel complet (x3)");
  }

  const secrets = TrackingSecretsSettings.parse({
    metaTokens: { [META_A]: "metaTokenAAAA1111" },
    metaTestCodes: { [META_A]: "TEST123" },
    tiktokTokens: { [TT_1]: "tiktokOwnToken99", [TT_2]: "tiktokOwnToken88" },
    tiktokTestCodes: { [TT_1]: "TEST777" },
    // legacy fields stay stored and must never be used
    metaCapiToken: "legacyMetaToken123",
    tiktokToken: "tiktokLegacyToken99",
  });
  respond = (url) => okAnswer(url);
  calls.length = 0;
  const results = await dispatchPurchase(c, secrets, library, NOW);
  eq(
    "one request per pixel with its OWN token; test code only in the page's window",
    results.map((r) => `${r.platform}:${r.pixelId}:${r.ok}:${r.testMode}`).sort(),
    [`meta:${META_A}:true:false`, `tiktok:${TT_1}:true:true`, `tiktok:${TT_2}:true:false`],
  );
  ok("legacy token never sent", !JSON.stringify(calls).includes("legacyMetaToken123") && !JSON.stringify(calls).includes("tiktokLegacyToken99"));
  const meta = calls.find((x) => x.url.includes("graph.facebook.com"))!;
  const metaEvent = (meta.body.data as Record<string, unknown>[])[0]!;
  eq("Meta URL (no token in it)", meta.url, `https://graph.facebook.com/v26.0/${META_A}/events`);
  eq("Meta token in the body", meta.body.access_token, "metaTokenAAAA1111");
  ok("Meta saved test code NOT attached outside a window", !("test_event_code" in meta.body));
  eq("Meta event name = browser purchase name", metaEvent.event_name, PIXEL_EVENTS.meta.purchase);
  eq("Meta event id", metaEvent.event_id, "CMD-PX0001");
  eq("Meta event time", metaEvent.event_time, Math.floor(at.getTime() / 1000));
  eq("Meta custom data", metaEvent.custom_data, {
    currency: "MAD",
    value,
    content_ids: [cid],
    content_type: "product",
    content_name: doc.product.name,
    contents: [{ id: cid, quantity: units, item_price: c.contents![0]!.itemPrice }],
    num_items: units,
    order_id: "CMD-PX0001",
  });
  const ud = metaEvent.user_data as Record<string, unknown>;
  eq("Meta ph = sha256 of 212… digits", ud.ph, [sha("212612345678")]);
  eq("Meta fn/ln/ct/country hashed", [ud.fn, ud.ln, ud.ct, ud.country], [[sha("salma")], [sha("test")], [sha("casablanca")], [sha("ma")]]);
  eq("Meta clear ids", [ud.client_ip_address, ud.client_user_agent, ud.fbp, ud.fbc], ["105.66.1.2", "Mozilla/5.0 test", payload.fbp, payload.fbc]);
  const tts = calls.filter((x) => x.url.includes("business-api.tiktok.com"));
  eq("TikTok one request per pixel code", tts.map((x) => x.body.event_source_id).sort(), [TT_1, TT_2]);
  const tt1 = tts.find((x) => x.body.event_source_id === TT_1)!;
  const tt2 = tts.find((x) => x.body.event_source_id === TT_2)!;
  eq("TikTok own token in the header only", [tt1.headers["Access-Token"], JSON.stringify(tt1.body).includes("tiktokOwnToken99")], ["tiktokOwnToken99", false]);
  eq("TikTok test code inside this page's window", [tt1.body.test_event_code, "test_event_code" in tt2.body], ["TEST777", false]);
  const ttEvent = (tt1.body.data as Record<string, unknown>[])[0]!;
  eq("TikTok event name = browser purchase name", ttEvent.event, PIXEL_EVENTS.tiktok.purchase);
  eq("TikTok event id", ttEvent.event_id, "CMD-PX0001");
  eq("TikTok phone = sha256 of +212 E.164", (ttEvent.user as Record<string, unknown>).phone, sha("+212612345678"));
  eq("TikTok click/browser ids", [(ttEvent.user as Record<string, unknown>).ttclid, (ttEvent.user as Record<string, unknown>).ttp], ["E.C.P.ttclid12345", "ttp-cookie-value-123"]);
  eq("TikTok properties", ttEvent.properties, {
    contents: [{ content_id: cid, content_type: "product", content_name: doc.product.name, quantity: units, price: c.contents![0]!.itemPrice }],
    content_type: "product",
    content_ids: [cid],
    currency: "MAD",
    value,
    order_id: "CMD-PX0001",
  });

  // another page firing the same TikTok pixel sends production events
  calls.length = 0;
  await dispatchPurchase({ ...c, pageId: OTHER_PAGE, pixels: { meta: [], tiktok: [TT_1] } }, secrets, library, NOW);
  ok("same pixel on another page: no test code", calls.length === 1 && !("test_event_code" in calls[0]!.body), calls.map((x) => x.body.test_event_code));

  // transport: a 500 is retried once; a network failure and a TikTok error code are failures, never throws
  respond = (url, n) => (url.includes("graph.facebook.com") && n === 1 ? { status: 500, json: { error: { message: "temporary" } } } : okAnswer(url));
  calls.length = 0;
  const one = { ...c, pixels: { meta: [META_A], tiktok: [] } };
  const retried = await dispatchPurchase(one, secrets, library, NOW);
  eq("5xx retried once then ok", [retried.map((r) => r.ok), calls.length], [[true], 2]);
  respond = () => "throw";
  const down = await dispatchPurchase(c, secrets, library, NOW);
  ok("network failure → results ok:false + code network, no throw", down.length === 3 && down.every((r) => !r.ok && !!r.detail && r.code === "network"), down);
  respond = (url) => (url.includes("tiktok") ? { status: 200, json: { code: 40105, message: "Access token is incorrect or has been revoked" } } : okAnswer(url));
  const ttErr = await dispatchPurchase({ ...c, pixels: { meta: [], tiktok: [TT_1] } }, secrets, library, NOW);
  ok("TikTok non-zero code is a failure (token)", ttErr.length === 1 && !ttErr[0]!.ok && /40105/.test(ttErr[0]!.detail ?? "") && ttErr[0]!.code === "token", ttErr);
  eq("no token → nothing sent", (await dispatchPurchase(c, TrackingSecretsSettings.parse({}), library, NOW)).length, 0);
  eq("only legacy tokens → nothing sent", (await dispatchPurchase(c, legacySecrets, library, NOW)).length, 0);

  // Settings → Pixels "Send test event"
  respond = (url) => okAnswer(url);
  calls.length = 0;
  const t1 = await sendTestEvent({ platform: "meta", pixelId: META_B, token: "metaTokenBBBB2222", testCode: "TEST999", siteUrl: "https://shop.example/", currency: "MAD", country: "MA" });
  const tb = calls[0]!.body;
  ok("test event: ok + facts", t1.ok && t1.facts.includes("events_received: 1") && t1.facts.includes("fbtrace_id: AbCdEf"), t1);
  eq("test event carries the test code + Purchase", [tb.test_event_code, (tb.data as Record<string, unknown>[])[0]!.event_name], ["TEST999", "Purchase"]);
  ok("test event id is TEST-…", /^TEST-[0-9A-F]{8}$/.test(t1.eventId), t1.eventId);
  respond = () => ({ status: 400, json: { error: { message: "Invalid OAuth access token.", code: 190, fbtrace_id: "Zz" } } });
  const t2 = await sendTestEvent({ platform: "meta", pixelId: META_B, token: "badTokenBBBB2222", testCode: "TEST999", siteUrl: null, currency: "MAD", country: "MA" });
  ok("test event: platform error reported + class", !t2.ok && t2.message === "Invalid OAuth access token." && t2.status === 400 && t2.facts.includes("code 190") && t2.code === "token", t2);
  respond = () => ({ status: 200, json: { code: 40002, message: "pixel code not found", request_id: "r2" } });
  const t3 = await sendTestEvent({ platform: "tiktok", pixelId: TT_1, token: "tiktokTokenXYZ123", testCode: "TEST42", siteUrl: null, currency: "MAD", country: "MA" });
  ok("TikTok test event error reported", !t3.ok && t3.message === "pixel code not found" && t3.facts.some((f) => f.includes("40002")), t3);
  respond = () => "throw";
  const t4 = await sendTestEvent({ platform: "tiktok", pixelId: TT_1, token: "tiktokTokenXYZ123", testCode: "TEST42", siteUrl: null, currency: "MAD", country: "MA" });
  ok("unreachable platform reported", !t4.ok && t4.status === null && /Couldn't reach TikTok/.test(t4.message), t4);
  // PIX-09: the test product and the user agent carry the platform's brand, never a hard-coded one
  respond = (url) => okAnswer(url);
  calls.length = 0;
  await sendTestEvent({ platform: "meta", pixelId: META_B, token: "metaTokenBBBB2222", testCode: "TEST999", siteUrl: "https://shop.example/", currency: "MAD", country: "MA", brand: "Store Gen" });
  const brandEvent = (calls[0]!.body.data as Record<string, Record<string, unknown>>[])[0]!;
  eq("test event brand: product name and user agent", [brandEvent.custom_data!.content_name, brandEvent.user_data!.client_user_agent], ["Test product (Store Gen)", "Mozilla/5.0 (compatible; Store-Gen-test-event/1.0)"]);
  ok("test event brand: no legacy name", !JSON.stringify(calls[0]!.body).includes("COD"));

  globalThis.fetch = realFetch;
  for (const f of failures) console.log(`✗ ${f}`);
  console.log(failures.length ? `✗ ${failures.length} failure(s), ${pass} passed` : `✓ conversions check passed (${pass} assertions)`);
  process.exit(failures.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
