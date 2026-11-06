/**
 * Server ad events self test (P5 INTEGRATIONS; operations.md OPE-§20.2, §20.4, §20.5, §20.9 (2)-(5), OPE-§O.4 IN-02,
 * IN-03; OD16, OD18, OD19, OD20, OD21; core §H.1). Offline: no database, no network, no server module. It is the
 * "conversions" section of scripts/qa/conversions-check.ts (`test:conversions`), and runs alone too:
 *
 *   npx tsx src/lib/integrations/capi.selftest.ts      (exit code 1 on failure)
 *
 * - the trigger: a page override wins over the store's trigger, `null` and unknown pages take the store's;
 * - the matrix of OPE-§20.2 over every trigger × moment × custom events: the Purchase at the trigger, Meta-only
 *   ConfirmedOrder / DeliveredOrder at the other moments, TikTok the Purchase only, the event ids (order id, ".c", ".d");
 * - the risk gate (OD19): trigger `order` at creation only; a confirmation or a delivery sends at any risk;
 * - never sent: a test order, a honeypot row, a manual / WhatsApp order unless `manualOrders`;
 * - the context is kept while a later moment can send (`eventsAfter`);
 * - the 7-day guard on both sides of 7 d − 1 h;
 * - the outbox items: one per event and pixel with its own token, the dedupe key, the target, `pii`, the payload;
 * - the context: sealed JSON round trip, the 8 KB cap, a bad context refused, the rebuild (current total and customer
 *   fields, the event id and time), the contents collapse when the items changed, the server-fields-only context;
 * - the Meta body with the event name swapped; the retry classes of a failed send.
 */
import type { PurchaseConversion } from "@/lib/orders/conversions-core";
import {
  CAPI_CTX_PLAIN_MAX,
  CAPI_MAX_AGE_MS,
  CONVERSION_MAX_RISK,
  SERVER_EVENTS,
  capiContextOf,
  capiDedupeKey,
  capiOutboxItems,
  conversionFromContext,
  eventsAfter,
  fromWire,
  hashCustomer,
  isStale,
  itemsHashOf,
  metaEventBody,
  parseCapiContext,
  planConversionEvents,
  retryableFailure,
  serverOnlyContext,
  triggerFor,
  type ConversionMoment,
  type PurchaseTrigger,
} from "@/lib/orders/conversions-core";
import { ConversionsSetting } from "@/lib/settings/keys/conversions";

export interface SectionResult {
  pass: number;
  failures: string[];
  notes: string[];
  ms: number;
}

const BUDGET_MS = 1_500;
const PAGE_A = "01JPAGEAAAAAAAAAAAAAAAAAAA";
const PAGE_B = "01JPAGEBBBBBBBBBBBBBBBBBBB";
const META = "111111111111111";
const META_2 = "222222222222222";
const TT = "CTESTPIXEL0000000001";

function conversion(over: Partial<PurchaseConversion> = {}): PurchaseConversion {
  return {
    orderId: "CMD-CAPI01",
    eventId: "CMD-CAPI01",
    pageId: PAGE_A,
    source: "live",
    time: new Date("2026-10-20T10:00:00Z"),
    value: 349,
    currency: "MAD",
    qty: 2,
    numItems: 2,
    contentId: "SKU-1",
    contents: [
      { id: "SKU-1", quantity: 1, itemPrice: 200 },
      { id: "SKU-2", quantity: 1, itemPrice: 149 },
    ],
    contentName: "Argan duo",
    customer: { phone: "+212612345678", email: null, name: "Salma Test", city: "Casablanca", country: "MA" },
    client: { ip: "105.66.1.2", ua: "Mozilla/5.0 test", fbp: "fb.1.1700000000000.123456789", ttclid: "E.C.P.abcdefgh" },
    sourceUrl: "https://shop.example/argan",
    pixels: { meta: [META, META_2], tiktok: [TT] },
    risk: 10,
    ...over,
  };
}

export function capiSelftest(): SectionResult {
  const t0 = performance.now();
  let pass = 0;
  const failures: string[] = [];
  const notes: string[] = [];
  const ok = (label: string, cond: boolean, info?: unknown) => {
    if (cond) pass++;
    else failures.push(`conversions: ${label}${info === undefined ? "" : `\n    ${JSON.stringify(info)}`}`);
  };
  const eq = (label: string, got: unknown, want: unknown) => ok(label, JSON.stringify(got) === JSON.stringify(want), { got, want });

  /* ---------------- the trigger (OD18) ---------------- */
  const settings = ConversionsSetting.parse({ purchaseTrigger: "confirmed", pageOverrides: { [PAGE_B]: "delivered" } });
  eq("trigger: the store's trigger", triggerFor(settings, PAGE_A), "confirmed");
  eq("trigger: a page override wins", triggerFor(settings, PAGE_B), "delivered");
  eq("trigger: no page → the store's trigger", triggerFor(settings, null), "confirmed");
  eq("trigger: the default is order", triggerFor(ConversionsSetting.parse({}), PAGE_A), "order");

  /* ---------------- the matrix (OPE-§20.2) ---------------- */
  const order = { id: "CMD-M01", isTest: false, source: "live", risk: 10 };
  const plan = (trigger: PurchaseTrigger, customEvents: boolean, at: ConversionMoment, o: Partial<typeof order> & { honeypot?: boolean } = {}, manualOrders = false) =>
    planConversionEvents({ trigger, customEvents, manualOrders, order: { ...order, ...o }, at }).map((e) => `${e.event}:${e.eventId}:${e.platforms.join("+")}`);
  const want: Record<PurchaseTrigger, Record<ConversionMoment, [string[], string[]]>> = {
    order: {
      created: [["Purchase:CMD-M01:meta+tiktok"], ["Purchase:CMD-M01:meta+tiktok"]],
      confirmed: [["ConfirmedOrder:CMD-M01.c:meta"], []],
      delivered: [["DeliveredOrder:CMD-M01.d:meta"], []],
    },
    confirmed: {
      created: [[], []],
      confirmed: [["Purchase:CMD-M01:meta+tiktok"], ["Purchase:CMD-M01:meta+tiktok"]],
      delivered: [["DeliveredOrder:CMD-M01.d:meta"], []],
    },
    delivered: {
      created: [[], []],
      confirmed: [["ConfirmedOrder:CMD-M01.c:meta"], []],
      delivered: [["Purchase:CMD-M01:meta+tiktok"], ["Purchase:CMD-M01:meta+tiktok"]],
    },
  };
  for (const trigger of ["order", "confirmed", "delivered"] as const) {
    for (const at of ["created", "confirmed", "delivered"] as const) {
      eq(`matrix: ${trigger} at ${at}, custom events on`, plan(trigger, true, at), want[trigger][at][0]);
      eq(`matrix: ${trigger} at ${at}, custom events off`, plan(trigger, false, at), want[trigger][at][1]);
    }
  }
  ok("matrix: TikTok never receives a custom event", ["order", "confirmed", "delivered"].every((t) => (["created", "confirmed", "delivered"] as const).every((at) => plan(t as PurchaseTrigger, true, at).every((s) => s.startsWith("Purchase") || !s.includes("tiktok")))));
  ok("matrix: one Purchase per order over its whole life, for every trigger", (["order", "confirmed", "delivered"] as const).every((t) => (["created", "confirmed", "delivered"] as const).flatMap((at) => plan(t, true, at)).filter((s) => s.startsWith("Purchase")).length === 1));

  /* ---------------- the risk gate (OD19) ---------------- */
  const risky = { risk: CONVERSION_MAX_RISK };
  eq("risk: trigger order at creation, risk 70 → nothing", plan("order", true, "created", risky), []);
  eq("risk: trigger order at creation, risk 69 → the Purchase", plan("order", true, "created", { risk: CONVERSION_MAX_RISK - 1 }), ["Purchase:CMD-M01:meta+tiktok"]);
  eq("risk: trigger confirmed at confirmation, risk 95 → the Purchase", plan("confirmed", false, "confirmed", { risk: 95 }), ["Purchase:CMD-M01:meta+tiktok"]);
  eq("risk: trigger delivered at delivery, risk 95 → the Purchase", plan("delivered", false, "delivered", { risk: 95 }), ["Purchase:CMD-M01:meta+tiktok"]);
  eq("risk: the custom events of trigger order at any risk", plan("order", true, "confirmed", risky), ["ConfirmedOrder:CMD-M01.c:meta"]);

  /* ---------------- never sent (OPE-§20.2, §26, D54, OD16) ---------------- */
  for (const t of ["order", "confirmed", "delivered"] as const) {
    for (const at of ["created", "confirmed", "delivered"] as const) {
      eq(`never: a test order (${t} at ${at})`, plan(t, true, at, { isTest: true }, true), []);
      eq(`never: a honeypot row (${t} at ${at})`, plan(t, true, at, { honeypot: true }, true), []);
      eq(`never: a manual order without manualOrders (${t} at ${at})`, plan(t, true, at, { source: "manual" }), []);
      eq(`never: a WhatsApp order without manualOrders (${t} at ${at})`, plan(t, true, at, { source: "whatsapp" }), []);
    }
  }
  eq("manualOrders on: a manual order sends at its trigger", plan("order", false, "created", { source: "manual" }, true), ["Purchase:CMD-M01:meta+tiktok"]);
  eq("manualOrders on: a WhatsApp order's confirmation", plan("confirmed", false, "confirmed", { source: "whatsapp" }, true), ["Purchase:CMD-M01:meta+tiktok"]);

  /* ---------------- the context is kept while a later moment can send ---------------- */
  eq(
    "eventsAfter: per trigger × custom events × the moment reached",
    (["order", "confirmed", "delivered"] as const).flatMap((t) => [true, false].flatMap((ce) => (["created", "confirmed", "delivered"] as const).map((m) => eventsAfter(t, ce, m)))),
    // order: on → T T F, off → F F F; confirmed: on → T T F, off → T F F; delivered: on → T T F, off → T T F
    [true, true, false, false, false, false, true, true, false, true, false, false, true, true, false, true, true, false],
  );

  /* ---------------- the 7-day guard (OD20) ---------------- */
  const now = Date.parse("2026-10-30T12:00:00Z");
  ok("stale: 7 d − 1 h is the limit", CAPI_MAX_AGE_MS === 7 * 24 * 3_600_000 - 3_600_000);
  ok("stale: one millisecond younger than the limit is sent", !isStale(now - CAPI_MAX_AGE_MS + 1, now));
  ok("stale: exactly at the limit is sent", !isStale(now - CAPI_MAX_AGE_MS, now));
  ok("stale: one millisecond older than the limit is dropped", isStale(now - CAPI_MAX_AGE_MS - 1, now));
  ok("stale: 6 days old is sent", !isStale(new Date(now - 6 * 86_400_000), now));
  ok("stale: 7 days old is dropped", isStale(new Date(now - 7 * 86_400_000), now));
  ok("stale: an unreadable time is dropped", isStale(new Date("not a date"), now));

  /* ---------------- the outbox items (OPE-§20.4 (3)) ---------------- */
  const c = conversion();
  const planned = planConversionEvents({ trigger: "order", customEvents: true, manualOrders: false, order: { id: c.orderId, isTest: false, source: "live", risk: 10 }, at: "created" });
  const withToken = (platform: string, id: string) => !(platform === "meta" && id === META_2);
  const items = capiOutboxItems(c, planned, withToken, "created");
  eq(
    "items: one per pixel with its own token (META_2 has none), the target and the dedupe key",
    items.map((i) => [i.kind, i.topic, i.targetId, i.dedupeKey, i.pii]),
    [
      ["capi", "Purchase", `meta:${META}`, `capi:meta:${META}:CMD-CAPI01:Purchase`, true],
      ["capi", "Purchase", `tiktok:${TT}`, `capi:tiktok:${TT}:CMD-CAPI01:Purchase`, true],
    ],
  );
  const p0 = items[0]!.payload;
  eq("items: the payload's fields", [p0.platform, p0.pixelId, p0.event, p0.eventId, p0.eventTime, p0.ctx], ["meta", META, "Purchase", "CMD-CAPI01", "2026-10-20T10:00:00.000Z", "created"]);
  eq("items: the payload's conversion survives JSON", fromWire(JSON.parse(JSON.stringify(p0.conversion))).time.toISOString(), c.time.toISOString());
  ok("items: no token, no item", capiOutboxItems(c, planned, () => false, "created").length === 0);
  const confirmedItems = capiOutboxItems(
    { ...c, eventId: "x" },
    planConversionEvents({ trigger: "order", customEvents: true, manualOrders: false, order: { id: c.orderId, isTest: false, source: "live", risk: 10 }, at: "confirmed" }),
    () => true,
    "sealed",
  );
  eq("items: a custom event goes to Meta pixels only, with its own id", confirmedItems.map((i) => [i.targetId, i.payload.eventId]), [
    [`meta:${META}`, "CMD-CAPI01.c"],
    [`meta:${META_2}`, "CMD-CAPI01.c"],
  ]);
  ok("items: the dedupe key fits its column (≤ 160)", capiDedupeKey("tiktok", TT, "CMD-XXXXXXXXXXXXXXXX", "DeliveredOrder").length <= 160);

  /* ---------------- the sealed context (OD21) ---------------- */
  const items0 = { bundleId: "duo", qty: 2, unitPrice: 174.5, variants: [] };
  const hash = itemsHashOf(items0);
  eq("items hash: key order does not matter", itemsHashOf({ variants: [], unitPrice: 174.5, qty: 2, bundleId: "duo" }), hash);
  ok("items hash: a line edit changes it", itemsHashOf({ ...items0, qty: 3 }) !== hash);
  const ctx = capiContextOf(c, hash);
  const back = parseCapiContext(JSON.stringify(ctx));
  eq("context: JSON round trip", back, ctx);
  ok("context: no phone, name or e-mail inside", !JSON.stringify(ctx).includes("612345678") && !JSON.stringify(ctx).includes("Salma"));
  eq("context: the client data and the source URL", [ctx.client.ip, ctx.client.ua, ctx.client.fbp, ctx.client.ttclid, ctx.sourceUrl], ["105.66.1.2", "Mozilla/5.0 test", "fb.1.1700000000000.123456789", "E.C.P.abcdefgh", "https://shop.example/argan"]);
  const big = capiContextOf(conversion({ contents: Array.from({ length: 40 }, (_, i) => ({ id: `SKU-${"X".repeat(150)}-${i}`, quantity: 1, itemPrice: 1 })), client: { ip: null, ua: "U".repeat(1_000) } }), hash);
  ok("context: the cap keeps the plain JSON ≤ 5.8 KB (the envelope ≤ 8 KB)", JSON.stringify(big).length <= CAPI_CTX_PLAIN_MAX, JSON.stringify(big).length);
  ok("context: an oversized context drops its contents first", big.contents === undefined);
  eq("context: a bad context is refused", [parseCapiContext("{"), parseCapiContext(JSON.stringify({ ...ctx, v: 2 })), parseCapiContext(JSON.stringify({ ...ctx, pixels: { meta: ["1", "2", "3", "4"], tiktok: [] } }))], [null, null, null]);

  /* ---------------- the rebuild (OPE-§20.4 (2)) ---------------- */
  const facts = { id: c.orderId, phone: "+212700000009", email: "x@example.com", name: "Salma Corrected", city: "Rabat", totalCents: 31_900, qty: 2, itemsHash: hash, risk: 80 };
  const at = new Date("2026-10-22T09:30:00Z");
  const r = conversionFromContext(ctx, facts, { event: "ConfirmedOrder", time: at });
  eq("rebuild: the event id, time, current total and customer fields", [r.eventId, r.time.toISOString(), r.value, r.customer.phone, r.customer.name, r.customer.city, r.customer.country], [
    "CMD-CAPI01.c",
    at.toISOString(),
    319,
    "+212700000009",
    "Salma Corrected",
    "Rabat",
    "MA",
  ]);
  eq("rebuild: the items unchanged → the sealed contents", r.contents, c.contents);
  eq("rebuild: the client data from the context", r.client, c.client);
  const edited = conversionFromContext(ctx, { ...facts, qty: 3, itemsHash: itemsHashOf({ ...items0, qty: 3 }) }, { event: "Purchase", time: at });
  eq("rebuild: the items changed → one line (lead content id, the order's units, the average price)", [edited.contents, edited.qty, edited.numItems, edited.eventId], [[{ id: "SKU-1", quantity: 3, itemPrice: 106.33 }], 3, 3, "CMD-CAPI01"]);
  const bare = serverOnlyContext({ pageId: PAGE_A, source: "live", currency: "MAD", contentId: "SKU-1", contentName: "Argan duo", country: "MA", sourceUrl: null, pixels: { meta: [META], tiktok: [] }, qty: 2, itemsHash: hash });
  const fromBare = conversionFromContext(bare, facts, { event: "Purchase", time: at });
  eq("rebuild: server fields only → no client data, one average line", [fromBare.client, fromBare.contents], [{ ip: null, ua: null }, [{ id: "SKU-1", quantity: 2, itemPrice: 159.5 }]]);
  ok("rebuild: the server-fields-only context parses", parseCapiContext(JSON.stringify(bare)) !== null);

  /* ---------------- the Meta body and the retry classes ---------------- */
  const h = hashCustomer(r.customer);
  for (const event of SERVER_EVENTS) {
    const body = metaEventBody(r, h, event) as { data: { event_name: string; event_id: string; custom_data: { value: number; currency: string } }[] };
    eq(`meta body: ${event} carries its name, the event id, the value and the currency`, [body.data[0]!.event_name, body.data[0]!.event_id, body.data[0]!.custom_data.value, body.data[0]!.custom_data.currency], [event, "CMD-CAPI01.c", 319, "MAD"]);
  }
  ok("meta body: the test code only when given", !("test_event_code" in metaEventBody(r, h, "Purchase")) && metaEventBody(r, h, "Purchase", "TEST1").test_event_code === "TEST1");
  eq(
    "retry: no answer, 408, 429, 5xx and a rate code retry; other 4xx and refusals are final",
    [
      retryableFailure("meta", null, null),
      retryableFailure("meta", 408, null),
      retryableFailure("meta", 429, null),
      retryableFailure("meta", 503, null),
      retryableFailure("meta", 400, { error: { code: 17 } }),
      retryableFailure("meta", 400, { error: { code: 100, message: "Invalid parameter" } }),
      retryableFailure("meta", 401, { error: { code: 190 } }),
      retryableFailure("tiktok", 200, { code: 40100 }),
      retryableFailure("tiktok", 200, { code: 40001, message: "no permission" }),
    ],
    [true, true, true, true, true, false, false, true, false],
  );

  const ms = performance.now() - t0;
  ok(`the section stays within ${BUDGET_MS} ms`, ms <= BUDGET_MS, Math.round(ms));
  notes.push(`conversions section: ${Math.round(ms)} ms`);
  return { pass, failures, notes, ms };
}

// standalone run: npx tsx src/lib/integrations/capi.selftest.ts
if (process.argv[1] && /integrations[\\/]capi\.selftest\.ts$/.test(process.argv[1])) {
  const r = capiSelftest();
  for (const n of r.notes) console.log(`· ${n}`);
  for (const f of r.failures) console.log(`✗ ${f}`);
  console.log(r.failures.length ? `✗ ${r.failures.length} failure(s), ${r.pass} passed` : `✓ conversions self test passed (${r.pass} assertions)`);
  process.exit(r.failures.length ? 1 : 0);
}
