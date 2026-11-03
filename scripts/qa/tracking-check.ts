// proves: LP-05
/**
 * test:tracking (P3 LANDING; landing.md LAN-§9.5, §9.1-§9.4, §3.9, §8.6 bullet 3, LD8, LD9; docs/STORE-SAAS.md §E.2, §E.8):
 *
 *   npm run test:tracking        (tsx scripts/qa/tracking-check.ts [--verbose])
 *
 * DB-backed: the two-store fixtures of scripts/qa/tenancy-check.ts (`setup()`: a throwaway cod_test_* database on
 * XAMPP's MariaDB, migrated and seeded with stores A and B, dropped at the end). Cases:
 *  1. the pure layer: the step mapping of every axis value (legacy status fallback, cancelled / fake / duplicate as one
 *     word, refused / returned / lost), the dates of the first transition event, the request rule, pending requests,
 *     the phone mask, the request schema;
 *  2. links: `signedTrackPath` / `trackUrl` verify through `resolveOrderForTracking`, a tampered `s` does not;
 *  3. the API's five failure classes (unknown order, wrong digits, wrong proof, another store's order from its host,
 *     a non-servable store's order) answer byte-identical bodies and statuses, each after ≥ 150 ms;
 *  4. the three proofs open the order (`s` answered to a lookup and a proof); the 11th lookup of one order in a day is
 *     refused even with the right digits while the signed and proof links still work;
 *  5. requests: one request writes one event and one notification, a repeat writes nothing, a phone in the text is
 *     masked, the order never changes (LD9); a shipped order and `landing.tracking.requests` off answer `closed`;
 *  6. five intent clicks in flight write one `customer_confirm_intent`;
 *  7. no TrackView of the fixtures carries phone digits beyond the last 4, the address, the city, the note or the e-mail;
 *  8. the document: the lookup form (noindex, `private, no-store`, `no-referrer`, the CSP narrowed to the public API),
 *     a signed view, A's signed link under B's handle (404, nothing of A), a tampered link (404 lookup); exactly one
 *     report link per document, never carrying `?o=`, `s=` or `#`.
 * Exits 1 on any failure.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import type { Kit } from "./tenancy-check";
import type { WriteScope } from "@/lib/tenancy/types";

process.env.TENANCY_DB ??= "cod_test_p3_tracking";
const req = createRequire(__filename);
const T = req("./tenancy-check") as typeof import("./tenancy-check");
const { check, suite, load } = T;

type Db = typeof import("@/lib/db/client");
type Schema = typeof import("@/lib/db/schema");
type Orm = typeof import("drizzle-orm");

const EDGE_KEY = randomBytes(32).toString("hex");
const env = process.env as Record<string, string | undefined>;
const setS = (on: boolean) => {
  if (on) {
    env.STORE_ROOT_DOMAIN = "shops.test";
    env.EDGE_KEY = EDGE_KEY;
  } else {
    delete env.STORE_ROOT_DOMAIN;
    delete env.EDGE_KEY;
  }
};
const newIp = () => `198.51.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}`;
const HOUR = 3_600_000;

async function main(): Promise<number> {
  const kit: Kit = await T.setup();
  const { fx } = kit;
  const { db } = load<Db>("@/lib/db/client");
  const S = load<Schema>("@/lib/db/schema");
  const { and, eq } = load<Orm>("drizzle-orm");
  const { newOrderId } = load<typeof import("@/lib/db/ids")>("@/lib/db/ids");
  const ST = load<typeof import("@/lib/tracking/steps")>("@/lib/tracking/steps");
  const C = load<typeof import("@/lib/tracking/contract")>("@/lib/tracking/contract");
  const F = load<typeof import("@/lib/tracking/format")>("@/lib/tracking/format");
  const L = load<typeof import("@/lib/tracking/links")>("@/lib/tracking/links");
  const API = load<typeof import("@/lib/tracking/api.server")>("@/lib/tracking/api.server");
  const V = load<typeof import("@/lib/tracking/view.server")>("@/lib/tracking/view.server");
  const SV = load<typeof import("@/lib/tracking/serve.server")>("@/lib/tracking/serve.server");
  const P = load<typeof import("@/lib/tenancy/public")>("@/lib/tenancy/public");
  const CA = load<typeof import("@/lib/tenancy/cache")>("@/lib/tenancy/cache");
  const SET = load<typeof import("@/lib/settings")>("@/lib/settings");
  const A = T.scopeOf(fx.A.id) as WriteScope;
  const PLATFORM = T.PLATFORM;
  const host = new URL(PLATFORM).host;

  /** An order row of the store with a phone, a city, an address, a note and an e-mail the view must never show. */
  const order = async (store: "A" | "B", o: Partial<typeof S.orders.$inferInsert> = {}) => {
    const id = newOrderId("TRK");
    const phone = `+2126${String(Math.floor(10_000_000 + Math.random() * 89_999_999))}`;
    const idem = randomUUID();
    await db.insert(S.orders).values({
      id,
      storeId: fx[store].id,
      pageId: fx[store].page.live,
      versionId: fx[store].version.live,
      status: "new",
      name: "Salma Bennani",
      phone,
      city: "Marrakech",
      address: "Rue Secrète 12, Gueliz",
      note: "Appeler après 18h, code porte 4471",
      email: "salma.secret@example.test",
      productName: "Huile d'argan",
      items: { v: 2, bundleId: "b1", bundleLabel: "1 x Argan", qty: 1, unitPrice: 199, variants: [] } as never,
      qty: 1,
      subtotal: 199,
      shipping: 0,
      total: 199,
      currency: "MAD",
      idem,
      createdAt: new Date(Date.now() - 2 * HOUR),
      ...o,
    } as never);
    return { id, phone, idem, last4: phone.slice(-4) };
  };

  type Answer = { status: number; text: string; body: Record<string, unknown> | null; ms: number; headers: Headers };
  const post = async (body: unknown, opts: { ip?: string; headers?: Record<string, string> } = {}): Promise<Answer> => {
    const started = Date.now();
    const res = await API.handleTrackApi(
      new Request(`${PLATFORM}/api/public/track`, {
        method: "POST",
        headers: { host, origin: PLATFORM, "content-type": "application/json", "x-forwarded-for": opts.ip ?? newIp(), "sec-fetch-site": "same-origin", ...opts.headers },
        body: JSON.stringify(body),
      }),
    );
    const text = await res.text();
    return { status: res.status, text, body: text ? (JSON.parse(text) as Record<string, unknown>) : null, ms: Date.now() - started, headers: res.headers };
  };
  const edgeFor = (h: string) => ({ "x-sg-host": h, "x-sg-edge": EDGE_KEY, "x-sg-ip": newIp(), "x-sg-proto": "https", "x-sg-worker": "w-tracking", "x-sg-ts": String(Date.now()), origin: `https://${h}` });
  const signedOf = (path: string) => new URL(path, PLATFORM).searchParams.get("s")!;
  const events = (id: string, type: string) => db.select().from(S.orderEvents).where(and(eq(S.orderEvents.orderId, id), eq(S.orderEvents.type, type)));
  const notes = async (id: string) => (await db.select().from(S.notifications).where(eq(S.notifications.kind, "order.customer_request"))).filter((n) => (n.vars as Record<string, unknown> | null)?.orderId === id);

  /* ------------------------------------------------------------ 1. the pure layer */
  suite("steps, mask and schema (pure)");
  {
    const t0 = new Date("2026-10-20T09:00:00Z");
    const base = { status: "new", confirmState: "new" as const, shipState: "none" as const, createdAt: t0, confirmedAt: null, shippedAt: null, deliveredAt: null, finalAt: null };
    const ev = (toState: string, at: string) => ({ type: "state_changed", actorKind: "user", toState, at: new Date(at), meta: null });
    const ids = (r: ReturnType<typeof ST.trackSteps>) => r.steps.map((s) => `${s.id}${s.done ? "+" : "-"}`).join(" ");
    const fresh = ST.trackSteps(base, []);
    check("a new order: placed is current, the four next steps ahead", fresh.current === "placed" && ids(fresh) === "placed+ confirmed- shipped- out_for_delivery- delivered-", ids(fresh));
    const conf = ST.trackSteps({ ...base, confirmState: "confirmed" }, [ev("confirmed", "2026-10-20T11:00:00Z"), ev("confirmed", "2026-10-20T12:00:00Z")]);
    check("confirmed: dated by the first transition event", conf.current === "confirmed" && conf.steps[1]!.at === "2026-10-20T11:00:00.000Z", conf.steps[1]);
    for (const [ship, current] of [
      ["to_pack", "confirmed"],
      ["packed", "confirmed"],
      ["shipped", "shipped"],
      ["in_transit", "shipped"],
      ["postponed", "shipped"],
      ["out_for_delivery", "out_for_delivery"],
      ["attempt_failed", "out_for_delivery"],
      ["delivered", "delivered"],
    ] as const) {
      const r = ST.trackSteps({ ...base, confirmState: "confirmed", shipState: ship }, []);
      check(`ship ${ship} → ${current}`, r.current === current, ids(r));
    }
    for (const confirm of ["cancelled", "fake", "duplicate"] as const) {
      const r = ST.trackSteps({ ...base, confirmState: confirm }, []);
      check(`confirm ${confirm} → the one neutral "cancelled"`, r.current === "cancelled" && ids(r) === "placed+ cancelled+", ids(r));
    }
    for (const ship of ["refused", "returned", "lost"] as const) {
      const r = ST.trackSteps({ ...base, confirmState: "confirmed", shipState: ship }, []);
      check(`ship ${ship} → returned`, r.current === "returned" && ids(r) === "placed+ confirmed+ shipped+ returned+", ids(r));
    }
    const legacy = ST.trackSteps({ ...base, status: "shipped" }, []);
    check("a legacy row (axes at their defaults, status shipped) maps from orders.status", legacy.current === "shipped", ids(legacy));
    check("legacy cancelled maps to cancelled", ST.trackSteps({ ...base, status: "cancelled" }, []).current === "cancelled");
    check("requests open while new or to_pack, closed once packed or cancelled", ST.requestsOpen(base) && ST.requestsOpen({ ...base, shipState: "to_pack" }) && !ST.requestsOpen({ ...base, shipState: "packed" }) && !ST.requestsOpen({ ...base, confirmState: "fake" }) && !ST.requestsOpen({ ...base, status: "shipped" }));
    const rq = (kind: string, at: string, actorKind = "customer") => ({ type: "customer_request", actorKind, toState: null, at: new Date(at), meta: { kind } });
    check("a request stays pending until the store acts", JSON.stringify(ST.pendingRequests([rq("cancel", "2026-10-20T10:00:00Z")])) === '["cancel"]');
    check("a store event after the request ends it", ST.pendingRequests([rq("cancel", "2026-10-20T10:00:00Z"), { type: "call_attempt", actorKind: "user", toState: null, at: new Date("2026-10-20T11:00:00Z"), meta: null }]).length === 0);
    check("the mask keeps the last 4 digits only", F.maskPhoneLast4("+212612345678") === "•• •• 56 78", F.maskPhoneLast4("+212612345678"));
    check("the schema refuses an unknown op, a 5-digit pin and a 301-character text", [
      { op: "delete", o: "CMD-7K3Q9X" },
      { op: "lookup", o: "CMD-7K3Q9X", last4: "12345" },
      { op: "request", o: "CMD-7K3Q9X", auth: { last4: "1234" }, kind: "other", text: "x".repeat(301) },
    ].every((b) => !C.TrackRequest.safeParse(b).success));
  }

  /* ------------------------------------------------------------ 2. links */
  suite("signed links");
  const a1 = await order("A");
  {
    const path = L.signedTrackPath({ id: fx.A.id, handle: fx.A.handle }, a1.id);
    check("signedTrackPath: <base>/track?o=&s=", path.startsWith(`/s/${fx.A.handle}/track?o=${a1.id}&s=`) && C.SIGNED_RE.test(signedOf(path)), path);
    const url = L.trackUrl({ id: fx.A.id, handle: fx.A.handle }, a1.id);
    check("trackUrl: absolute, on the store's origin", url.startsWith(`${PLATFORM}/s/${fx.A.handle}/track?o=`), url);
    const ok = await P.resolveOrderForTracking(a1.id, signedOf(path));
    check("the signed link resolves to A", ok?.store.id === fx.A.id);
    const s = signedOf(path);
    const forged = `${s.slice(0, -1)}${s.endsWith("A") ? "B" : "A"}`;
    check("a tampered s resolves to nothing", (await P.resolveOrderForTracking(a1.id, forged)) === null);
    const asB = `${s.split(".")[0]}.${P.signTrackLink(fx.B.id, a1.id).split(".")[1]}`;
    check("a signature made with B's key does not open A's order", (await P.resolveOrderForTracking(a1.id, asB)) === null);
  }

  /* ------------------------------------------------------------ 3. the five failure classes */
  suite("api: the five failure classes answer the same bytes");
  {
    const a = await order("A");
    const b = await order("B");
    const unknown = await post({ op: "lookup", o: newOrderId("TRK"), last4: "0000" });
    const wrongDigits = await post({ op: "lookup", o: a.id, last4: a.last4 === "0000" ? "1111" : "0000" });
    const wrongProof = await post({ op: "proof", o: a.id, k: randomUUID() });
    setS(true);
    let otherStore: Answer;
    try {
      otherStore = await post({ op: "lookup", o: a.id, last4: a.last4 }, { headers: edgeFor(`${fx.B.handle}.shops.test`) });
      const own = await post({ op: "lookup", o: a.id, last4: a.last4 }, { headers: edgeFor(`${fx.A.handle}.shops.test`) });
      check("control: A's own host finds A's order (S mode)", own.status === 200 && own.body?.ok === true, own.body);
    } finally {
      setS(false);
    }
    await db.update(S.stores).set({ status: "pending" }).where(eq(S.stores.id, fx.B.id));
    CA.invalidateStore(fx.B.id);
    const notServable = await post({ op: "lookup", o: b.id, last4: b.last4 });
    await db.update(S.stores).set({ status: "active" }).where(eq(S.stores.id, fx.B.id));
    CA.invalidateStore(fx.B.id);
    const classes = { unknown, wrongDigits, wrongProof, otherStore, notServable };
    const all = Object.values(classes);
    check("every class: 404 { ok: false, error: not_found }", all.every((r) => r.status === 404 && r.text === '{"ok":false,"error":"not_found"}'), Object.fromEntries(Object.entries(classes).map(([k, v]) => [k, [v.status, v.text]])));
    check("every class: byte-identical body", new Set(all.map((r) => r.text)).size === 1);
    check("every class: the same headers", new Set(all.map((r) => JSON.stringify([...r.headers.entries()].sort()))).size === 1);
    check("every answer padded to ≥ 150 ms", all.every((r) => r.ms >= 150), all.map((r) => r.ms));
    const bOwn = await post({ op: "lookup", o: b.id, last4: b.last4 });
    check("control: B's order opens again once B is active", bOwn.status === 200, bOwn.body);
    const bad = await post({ op: "lookup", o: "nope" });
    check("a malformed body answers invalid (422)", bad.status === 422 && bad.body?.error === "invalid", bad.body);
  }

  /* ------------------------------------------------------------ 4. three proofs, failed lookups */
  suite("api: the three proofs, and the failed-lookup limit");
  {
    const a = await order("A");
    const look = await post({ op: "lookup", o: a.id, last4: a.last4 });
    check("lookup: the right digits open the order, with its signed s", look.status === 200 && look.body?.ok === true && C.SIGNED_RE.test(String(look.body?.s)) && (look.body?.view as { orderId?: string })?.orderId === a.id, look.body);
    const proof = await post({ op: "proof", o: a.id, k: a.idem });
    check("proof: the order's idem opens it, with its signed s", proof.status === 200 && C.SIGNED_RE.test(String(proof.body?.s)), proof.body);
    const s = String(look.body?.s);
    const signed = await post({ op: "signed", o: a.id, s });
    check("signed: the s answered to the lookup opens it (no new s)", signed.status === 200 && signed.body?.ok === true && signed.body?.s === undefined, signed.body);
    const wrong = a.last4 === "9999" ? "1111" : "9999";
    const tries: number[] = [];
    for (let i = 0; i < 10; i++) tries.push((await post({ op: "lookup", o: a.id, last4: wrong })).status);
    check("ten wrong lookups: ten not_found", tries.every((st) => st === 404), tries);
    const eleventh = await post({ op: "lookup", o: a.id, last4: a.last4 });
    check("the 11th lookup of the day is refused, even with the right digits", eleventh.status === 404 && eleventh.text === '{"ok":false,"error":"not_found"}', eleventh.body);
    const byLast4 = await post({ op: "request", o: a.id, auth: { last4: a.last4 }, kind: "other" });
    check("a request proven by the 4 digits is refused too", byLast4.status === 404, byLast4.body);
    check("…while the signed link still works", (await post({ op: "signed", o: a.id, s })).status === 200);
    check("…and the proof link too", (await post({ op: "proof", o: a.id, k: a.idem })).status === 200);
    const other = await order("A");
    check("another order of the store is not affected", (await post({ op: "lookup", o: other.id, last4: other.last4 })).status === 200);
  }

  /* ------------------------------------------------------------ 5. requests */
  suite("api: requests (LD9)");
  {
    const a = await order("A");
    const s = P.signTrackLink(fx.A.id, a.id);
    const before = (await db.select().from(S.orders).where(eq(S.orders.id, a.id)))[0]!;
    const r1 = await post({ op: "request", o: a.id, auth: { s }, kind: "change_address", text: "Nouvelle adresse, appelez le 06 12 34 56 78 svp" });
    check("a request answers ok with the view", r1.status === 200 && r1.body?.ok === true, r1.body);
    const ev1 = await events(a.id, "customer_request");
    check("one customer_request event, actor customer, meta { kind, text }", ev1.length === 1 && ev1[0]!.actorKind === "customer" && (ev1[0]!.meta as { kind?: string })?.kind === "change_address", ev1);
    check("a phone number in the text never reaches the event", !/\d{2}\s?\d{2}\s?\d{2}\s?\d{2}/.test(String((ev1[0]?.meta as { text?: string })?.text)), ev1[0]?.meta);
    const n1 = await notes(a.id);
    check("one order.customer_request notification, to owners, admins and managers of A", n1.length === 1 && n1[0]!.storeId === fx.A.id && n1[0]!.audience === "store_role", n1);
    const view = r1.body?.view as { pending?: string[]; canRequest?: { changeAddress?: boolean } };
    check("the view marks the kind pending and offers it no more", view?.pending?.includes("change_address") === true && view.canRequest?.changeAddress === false, view);
    const r2 = await post({ op: "request", o: a.id, auth: { s }, kind: "change_address" });
    check("a repeat of a pending kind answers ok and writes nothing", r2.status === 200 && (await events(a.id, "customer_request")).length === 1 && (await notes(a.id)).length === 1);
    const r3 = await post({ op: "request", o: a.id, auth: { k: a.idem }, kind: "cancel" });
    check("another kind (proven by the idem) writes its own event", r3.status === 200 && (await events(a.id, "customer_request")).length === 2);
    const after = (await db.select().from(S.orders).where(eq(S.orders.id, a.id)))[0]!;
    check("the order itself never changes (status, axes, address, rev)", JSON.stringify([before.status, before.confirmState, before.shipState, before.address, before.rev]) === JSON.stringify([after.status, after.confirmState, after.shipState, after.address, after.rev]));

    const shipped = await order("A", { status: "shipped", confirmState: "confirmed", shipState: "shipped" });
    const closed = await post({ op: "request", o: shipped.id, auth: { s: P.signTrackLink(fx.A.id, shipped.id) }, kind: "cancel" });
    check("a request on a shipped order answers closed", closed.status === 409 && closed.body?.error === "closed" && (await events(shipped.id, "customer_request")).length === 0, closed.body);
    await SET.updateStoreSetting(A, "landing", { tracking: { requests: false } }, { id: fx.A.members.owner });
    const off = await order("A");
    const offAnswer = await post({ op: "request", o: off.id, auth: { k: off.idem }, kind: "other" });
    check("with landing.tracking.requests off: closed, and the view offers no request", offAnswer.body?.error === "closed" && (await events(off.id, "customer_request")).length === 0, offAnswer.body);
    const offView = await post({ op: "proof", o: off.id, k: off.idem });
    const can = (offView.body?.view as { canRequest?: Record<string, boolean> })?.canRequest ?? {};
    check("…the view's canRequest is all false", Object.values(can).every((v) => v === false) && Object.keys(can).length === 3, can);
    await SET.updateStoreSetting(A, "landing", { tracking: { requests: true } }, { id: fx.A.members.owner });
  }

  /* ------------------------------------------------------------ 6. intent */
  suite("api: the confirm intent is written once per order");
  {
    const a = await order("A");
    const clicks = await Promise.all(Array.from({ length: 5 }, () => post({ op: "intent", o: a.id, k: a.idem, kind: "confirm_whatsapp" })));
    check("five clicks: five ok answers", clicks.every((c) => c.status === 200 && c.body?.ok === true), clicks.map((c) => c.body));
    check("…and one customer_confirm_intent event", (await events(a.id, "customer_confirm_intent")).length === 1);
    const wrong = await post({ op: "intent", o: a.id, k: randomUUID(), kind: "confirm_whatsapp" });
    check("a wrong k answers not_found", wrong.status === 404);
  }

  /* ------------------------------------------------------------ 7. view fixtures */
  suite("views carry no phone beyond the last 4 and no address");
  {
    const fixtures = await Promise.all([
      order("A"),
      order("A", { status: "confirmed", confirmState: "confirmed", confirmedAt: new Date(Date.now() - HOUR) }),
      order("A", { status: "shipped", confirmState: "confirmed", shipState: "shipped", carrierLabel: "Amana", trackingRef: "AM123456789MA" }),
      order("A", { status: "delivered", confirmState: "confirmed", shipState: "delivered" }),
      order("A", { status: "cancelled", confirmState: "cancelled" }),
      order("A", { status: "returned", confirmState: "confirmed", shipState: "returned" }),
    ]);
    for (const f of fixtures) {
      const row = await V.loadTrackOrder(A, f.id);
      for (const locale of ["fr", "ar", "en"] as const) {
        const view = await V.buildTrackView(A, row!, { locale });
        const json = JSON.stringify(view);
        const digits = f.phone.replace(/\D/g, "");
        const leaks = [digits.slice(-5), digits.slice(-6, -1), digits.slice(0, 5), "Secrète", "Gueliz", "Marrakech", "4471", "salma.secret", "Bennani"].filter((x) => json.includes(x));
        check(`view ${row!.status}/${locale}: no phone digit beyond the last 4, no address, city, note, e-mail or last name`, leaks.length === 0 && view.maskedPhone.endsWith(`${f.last4.slice(0, 2)} ${f.last4.slice(2)}`), leaks);
      }
    }
    const carried = await V.buildTrackView(A, (await V.loadTrackOrder(A, fixtures[2]!.id))!, { locale: "fr" });
    check("the carrier comes from carrier_label / tracking_ref", carried.carrier?.name === "Amana" && carried.carrier.ref === "AM123456789MA", carried.carrier);
    check("another store's order id reads nothing through A's scope", (await V.loadTrackOrder(A, (await order("B")).id)) === null);
  }

  /* ------------------------------------------------------------ 8. the document */
  suite("the /track document");
  {
    const get = async (handle: string, query = "") => {
      const res = await SV.serveTrack(new Request(`${PLATFORM}/s/${handle}/track${query}`, { headers: { host, "user-agent": "tracking-check" } }), handle);
      return { status: res.status, headers: res.headers, html: await res.text() };
    };
    const reports = (html: string) => [...html.matchAll(/href="([^"]*\/report\/[^"]*)"/g)].map((m) => m[1]!.replace(/&amp;/g, "&"));
    const lookup = await get(fx.A.handle);
    const csp = lookup.headers.get("content-security-policy") ?? "";
    check(
      "lookup: 200, noindex, private no-store, no-referrer",
      lookup.status === 200 && lookup.headers.get("cache-control") === "private, no-store" && /noindex/.test(lookup.headers.get("x-robots-tag") ?? "") && lookup.headers.get("referrer-policy") === "no-referrer",
      [lookup.status, lookup.headers.get("cache-control"), lookup.headers.get("x-robots-tag"), lookup.headers.get("referrer-policy")],
    );
    check("lookup: the CSP narrows connect-src / form-action to the public API (no bare 'self')", !/(connect-src|form-action)[^;]*'self'/.test(csp) && csp.includes("/api/public/"), csp);
    check("lookup: the form (hidden until the chunk runs), the noscript line, the chunk", lookup.html.includes("data-trk-lookup") && lookup.html.includes("<noscript>") && lookup.html.includes('referrerPolicy:"same-origin"'));
    const markup = (html: string) => html.replace(/<style>[\s\S]*?<\/style>/g, "");
    const ownCss = load<typeof import("@/landing/generated/assets")>("@/landing/generated/assets").addonCss.track ?? "";
    check("lookup: no glass, no aurora, no grain (markup and the page's own CSS)", !/aurora|grain|glass/.test(markup(lookup.html)) && !/backdrop-filter|aurora|grain/.test(ownCss) && ownCss.length > 0);
    const a = await order("A");
    const path = L.signedTrackPath({ id: fx.A.id, handle: fx.A.handle }, a.id);
    const query = path.slice(path.indexOf("?"));
    const view = await get(fx.A.handle, query);
    const digits = a.phone.replace(/\D/g, "");
    check("signed: 200 with the status, the id in an LTR isolate, the masked phone", view.status === 200 && view.html.includes(`<bdi dir="ltr" class="trk-num">${a.id}</bdi>`) && view.html.includes(`•• •• ${a.last4.slice(0, 2)} ${a.last4.slice(2)}`) && view.html.includes("data-trk-requests"), view.status);
    check("signed: no phone beyond the last 4, no address, note, e-mail", ![digits.slice(-5), "Secrète", "4471", "salma.secret"].some((x) => view.html.includes(x)));
    for (const [name, doc] of [
      ["lookup", lookup],
      ["signed", view],
    ] as const) {
      const r = reports(doc.html);
      check(`${name}: exactly one report link, to the platform's /report/<h>, with no ?o=, s= or #`, r.length === 1 && r[0]!.startsWith(`${PLATFORM}/report/${fx.A.handle}`) && !/[?&]o=|[?&]s=|#|sg-test/.test(decodeURIComponent(r[0]!)), r);
    }
    const underB = await get(fx.B.handle, query);
    const masked = `•• •• ${a.last4.slice(0, 2)} ${a.last4.slice(2)}`;
    check(
      "A's signed link under B's handle: 404, the lookup, nothing of A",
      underB.status === 404 && underB.html.includes("data-trk-lookup") && !markup(underB.html).includes("trk-steps") && !underB.html.includes(masked) && !underB.html.includes(`/s/${fx.A.handle}/`),
      underB.status,
    );
    const tampered = await get(fx.A.handle, query.replace(/.$/, (ch) => (ch === "A" ? "B" : "A")));
    check("a tampered link: 404, the lookup with the not-found notice", tampered.status === 404 && tampered.html.includes('role="alert"') && tampered.html.includes("data-trk-lookup"), tampered.status);
    const idOnly = await get(fx.A.handle, `?o=${a.id}`);
    check("?o= alone: the lookup with the id filled", idOnly.status === 200 && idOnly.html.includes(`value="${a.id}"`), idOnly.status);
    const upper = await get(fx.A.handle.toUpperCase(), query);
    check("a non-canonical handle: 308 with the raw query, byte for byte", upper.status === 308 && (upper.headers.get("location") ?? "").endsWith(`/s/${fx.A.handle}/track${query}`), upper.headers.get("location"));
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
    const fails = T.report("test:tracking (LP-05)", [`database ${T.DB_NAME} dropped; cod_test_* left: ${left.length ? left.join(", ") : "none"}`, `${Math.round((Date.now() - started) / 1000)} s`]);
    process.exit(fails || failed ? 1 : 0);
  }
})();
