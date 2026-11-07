// proves: OP-01, OP-02, OP-03, OP-04, OP-06, OP-07, OP-08, OP-09, OP-10, OP-11, OP-12, OP-14, OP-16, PL-09, SF-01, SF-04, SF-05, SF-11, UX-02
/**
 * `test:ops-db` (P4 CALL CENTER; operations.md OPE-§O.2, §O.4; docs/STORE-SAAS.md §J.2): the call centre against a
 * real MariaDB. Creates a throwaway `cod_test_p4_opsdb_*` database on XAMPP's MariaDB (root, no password,
 * 127.0.0.1:3306), runs the app's migrator, seeds two stores and drops the database at the end (unless --keep).
 *   npm run test:ops-db [-- --db cod_test_p4_opsdb_x] [--keep]
 *
 *   writer       (OP-01) the CAS conflict answers the fresh state; a sheet pull from a terminal state is refused,
 *                written as `external_rejected` and the label marked for rewrite (sheet_dirty bit 1); an implied
 *                confirmation from "Expédiée" with the Agent cell; forced moves are audited; the agent visibility
 *                rule and the inbound set; the at-delivery settlement; another store's id answers not_found
 *   events       (OP-02) exactly one event per move, attempt and note; the timeline newest first with masked
 *                phones; a note edit after 5 minutes or by another member refused; hidden notes; filters and keyset
 *   customers    (SF-05, OP-06) counters equal `reconcileCustomers` after a mixed run; drift is found and fixed; a
 *                phone edit moves the counters; honeypot orders never become a customer
 *   duplicates   (OP-06) store-wide, test orders match test orders only, "Keep both" hides the pair
 *   test orders  (SF-05) the operations rows of the OPE-§3.6 exclusions table
 *   outcomes     (OP-04) recordOutcome on the real writer: the ladder and first_touch_at, busy retried once,
 *                exhaustion under `close` and `keep_open` (OPE-§6.3), the callback horizon (`bad_due`) and its
 *                outside-window warning, the coded reasons, fake + block, duplicate rules, the hold, the delivery
 *                lane's five outcomes (OD48), an inbound confirmation of an unreachable order (OD53)
 *   hot path     (OP-03, OP-07, OP-14, OD53) OPE-§5.7 acceptance (b) and (c): the inbound lookup is the agent's
 *                visibility (an unreachable customer calling back is confirmed by the agent who picked up, a second
 *                agent without a lookup gets not_found), the 61st lookup in an hour is refused and counted; the reveal
 *                (who may, exactly one phone_revealed per reveal and none on a replay, WhatsApp's whatsapp_sent, the
 *                lease renewal, another store's template); riskBandOutcomes null below 30 decided and exact above;
 *                attemptStats in store-local cells; the queue card from its reads; a stale card's fresh copy
 *   manual       (OP-08, OP-12, OD49, OD55, OPS-21) the manual total equals the public path's total for the test:offers
 *                fixtures (duo, tshirt, colors); a replayed idem returns the first order; blocked, duplicate and the
 *                adjustment rules; editOrder re-prices, locks a shipped order but its address / landmark / note
 *                (inTransit); recall and the carrier tick; the hold bounds (bad_hold); tracking implies packed;
 *                block-and-cancel moves open orders to fake / cancelled(blocked), lists shipped ones, never another
 *                store's; convertLeadToOrder pre-fills, answers already_converted the second time, not_found across stores
 *   list         (OP-09, OP-16, SF-05, PL-09, OD12, OD49, OD55) the agent predicate on listOrders, masked list rows,
 *                keyset paging; a held order out of To pack and the Carrier CSV and in On hold; the Carrier CSV moves
 *                exported orders to packed once and refuses B's ids; slips; bulk on 200 ids with per-order results and
 *                201 refused, idem replays; undo only while rev is unchanged and within the window; saved views and
 *                their limits; the export-ZIP writers (full phones, no capi_ctx / Telegram canary); delete test orders
 *   insights     (OP-10, OP-11, SF-01, SF-11, UX-02, OPE-§14.4) the agent_stats_daily rollup (abandoned included)
 *                equals a full recompute and a deleted day comes back byte for byte; queueCounts equals a recompute;
 *                opsAggregates and attemptStats on a 50,000-order store (multi-row seed) within 400 ms, cells under 5
 *                suppressed, NULL city under '*', no canary in any cell; returnReasonMix equals a recompute; a mapped
 *                sheet label backfills confirmed_by for 90 days (test and older orders apart) and the rollup still
 *                equals a recompute; the ⌘K provider ≤ 120 ms, masked and agent-restricted; the calling window save
 *                writes the ops row only and sets savedAt; overrides, Open calls now, scripts (save, approve, reset)
 *                and agent profiles
 *   finance      (SF-04, SF-05, OD52, OD56, OPS-24) an at_delivery store's delivered move writes collected and remitted
 *                in one rev bump (never cash held), a statement store's stays collected; Mark cash received on 200
 *                ids (201 refused, another store's id not_found, meta settlement manual); item and SKU costs on a
 *                live page (B with A's page: not_found), history kept; carrier rates, packaging, settlement, ad
 *                accounts, dated rates and spend cells (a day without a rate excluded and counted); the break-even
 *                card with zero costs lists what to add, with costs a number; the KPIs and Profit lite read the
 *                same before and after a test order; fin.alerts fires once and keeps; the fin:* health facts
 *   masking      (OD61) every read function of this step masks under an impersonation scope and is the identity
 *                under a member scope (canaries)
 */
import Module from "node:module";
import { randomBytes, randomUUID } from "node:crypto";

// the modules under test are marked `import "server-only"`; outside Next that import throws
{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = require.resolve("drizzle-orm"); // any resolvable module: server-only exports nothing used
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    return req === "server-only" ? stub : orig.call(this, req, ...rest);
  };
}

const flag = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const dbName = flag("db") ?? `cod_test_p4_opsdb_${randomBytes(3).toString("hex")}`;
const KEEP = process.argv.includes("--keep");
if (!/^cod_test_p4_[a-z0-9_]{1,40}$/.test(dbName)) {
  console.error(`✗ refusing to run on database "${dbName}": use a throwaway cod_test_p4_* name`);
  process.exit(1);
}
const DB_SERVER = "mysql://root@127.0.0.1:3306";
{
  // this process's platform: a fresh secret, P mode, never the owner's environment
  const env = process.env as Record<string, string | undefined>;
  for (const k of ["PUBLIC_URL", "STORE_ROOT_DOMAIN", "EDGE_KEY", "ADMIN_HOST", "LEGACY_PLATFORM_HOSTS", "TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY", "GOOGLE_SA_JSON_B64"]) delete env[k];
  env.DATABASE_URL = `${DB_SERVER}/${dbName}`;
  env.APP_SECRET = randomBytes(32).toString("hex");
  env.PLATFORM_URL = "http://localhost:3451";
}

async function rootQuery(q: string): Promise<void> {
  const mysql = (await import("mysql2/promise")).default;
  const conn = await mysql.createConnection({ uri: DB_SERVER, charset: "utf8mb4_unicode_ci" });
  try {
    await conn.query(q);
  } finally {
    await conn.end();
  }
}

let pass = 0;
const failures: string[] = [];
let section = "";
const ok = (label: string, cond: boolean, info?: unknown) => {
  if (cond) pass++;
  else failures.push(`[${section}] ${label}${info === undefined ? "" : `\n    ${JSON.stringify(info)}`}`);
};
const eq = (label: string, got: unknown, want: unknown) => ok(label, JSON.stringify(got) === JSON.stringify(want), { got, want });

/** CommonJS `require`, so the server-only stub above sees every load. */
const load = <T>(id: string): T => Module.createRequire(__filename)(id) as T;

const STORE_A = "0P4A0000000000000000000001";
const STORE_B = "0P4B0000000000000000000002";

async function main(): Promise<number> {
  await rootQuery(`DROP DATABASE IF EXISTS \`${dbName}\``);
  await rootQuery(`CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  const { runMigrations } = load<typeof import("@/lib/db/migrate")>("@/lib/db/migrate");
  await runMigrations();

  const { and, eq: deq, inArray, sql } = load<typeof import("drizzle-orm")>("drizzle-orm");
  const { db } = load<typeof import("@/lib/db/client")>("@/lib/db/client");
  const S = load<typeof import("@/lib/db/schema")>("@/lib/db/schema");
  const { newId } = load<typeof import("@/lib/db/ids")>("@/lib/db/ids");
  const { can } = load<typeof import("@/lib/auth/permissions")>("@/lib/auth/permissions");
  const { mintScope } = load<typeof import("@/lib/tenancy/seam")>("@/lib/tenancy/seam");
  const { getStoreById } = load<typeof import("@/lib/tenancy/public")>("@/lib/tenancy/public");
  const { setStoreSetting, getStoreSetting } = load<typeof import("@/lib/settings")>("@/lib/settings");
  const { createOrderRow } = load<typeof import("@/lib/orders/create")>("@/lib/orders/create");
  const T = load<typeof import("@/lib/orders/transition")>("@/lib/orders/transition");
  const E = load<typeof import("@/lib/orders/events")>("@/lib/orders/events");
  const C = load<typeof import("@/lib/orders/customers")>("@/lib/orders/customers");
  const D = load<typeof import("@/lib/orders/duplicates")>("@/lib/orders/duplicates");
  const AD = load<typeof import("@/lib/orders/admin")>("@/lib/orders/admin");
  const { rememberInbound } = load<typeof import("@/lib/callcenter/visibility")>("@/lib/callcenter/visibility");
  type StoreRole = import("@/lib/auth/permissions").StoreRole;
  type WriteCtx = import("@/lib/tenancy/types").WriteCtx;
  type StoreCtx = import("@/lib/tenancy/types").StoreCtx;
  type WriteScope = import("@/lib/tenancy/types").WriteScope;

  /* ---------------- two stores, their members ---------------- */
  for (const [id, handle] of [
    [STORE_A, "ops-a"],
    [STORE_B, "ops-b"],
  ] as const) {
    await db.insert(S.stores).values({ id, handle, name: handle.toUpperCase(), status: "active", brandSeed: "0123456789abcdef" });
  }
  const person = (label: string) => ({ id: newId(), email: `${label}@opsdb.test`, name: label.replace(/-/g, " "), passwordHash: "x" });
  const U = { ownerA: person("Owner-A"), managerA: person("Manager-A"), agentA: person("Agent-A"), agent2A: person("Agent-Two"), ownerB: person("Owner-B") };
  for (const u of Object.values(U)) await db.insert(S.users).values(u);
  await db.insert(S.storeMembers).values([
    { storeId: STORE_A, userId: U.ownerA.id, role: "owner" },
    { storeId: STORE_A, userId: U.managerA.id, role: "manager" },
    { storeId: STORE_A, userId: U.agentA.id, role: "agent" },
    { storeId: STORE_A, userId: U.agent2A.id, role: "agent" },
    { storeId: STORE_B, userId: U.ownerB.id, role: "owner" },
  ]);
  const rowA = (await getStoreById(STORE_A))!;
  const rowB = (await getStoreById(STORE_B))!;
  const A = mintScope("member", STORE_A) as WriteScope;
  const B = mintScope("member", STORE_B) as WriteScope;
  const impA = mintScope("impersonation", STORE_A);
  const ctxOf = (store: "A" | "B", user: { id: string; email: string; name: string }, role: StoreRole): WriteCtx =>
    ({
      user: { id: user.id, email: user.email, name: user.name, totpEnabled: false, sessionId: "s", platformRole: "none", locale: null, lastStoreId: null },
      store: store === "A" ? rowA : rowB,
      membership: { role, status: "active" },
      scope: store === "A" ? A : B,
      actor: { kind: "user", userId: user.id, impersonatorId: null, ip: null },
      impersonation: null,
      stepUpUntil: null,
      can: (p) => can(role, p),
    }) as WriteCtx;
  const owner = ctxOf("A", U.ownerA, "owner");
  const manager = ctxOf("A", U.managerA, "manager");
  const agent = ctxOf("A", U.agentA, "agent");
  const agent2 = ctxOf("A", U.agent2A, "agent");
  const ownerBCtx = ctxOf("B", U.ownerB, "owner");
  /** the staff "view as store" of A: a read-only manager view through the impersonation scope (D70) */
  const viewAs = { ...manager, scope: impA, membership: { role: "manager" as const, status: "active" as const, synthetic: "impersonation" as const } } as unknown as StoreCtx;
  const system = { kind: "system" as const, userId: null };

  /* ---------------- orders through the one insert (D72); the ops.created hook runs inline ---------------- */
  let phoneSeq = 10_000_000;
  const freshPhone = () => `+2126${String(phoneSeq++).padStart(8, "0")}`;
  async function order(scope: WriteScope, o: { phone?: string; name?: string; city?: string; test?: boolean; flags?: string[]; total?: number; note?: string } = {}): Promise<string> {
    const r = await createOrderRow(
      {
        pageId: newId(),
        versionId: null,
        exportId: null,
        source: "live",
        status: "new",
        name: o.name ?? "Salma Bennani",
        phone: o.phone ?? freshPhone(),
        phoneRaw: null,
        city: o.city ?? "Fès",
        address: "Hay Salam 12",
        note: o.note ?? null,
        email: null,
        productName: "Argan",
        items: { bundleId: "b1", bundleLabel: "1 flacon", qty: 1, unitPrice: 100, variants: [{}] },
        qty: 1,
        subtotal: o.total ?? 249.9,
        shipping: 0,
        total: o.total ?? 249.9,
        currency: "MAD",
        locale: "fr",
        utm: null,
        ref: null,
        ipHash: null,
        ua: null,
        eventId: null,
        idem: randomUUID(),
        riskScore: 10,
        flags: o.flags ?? null,
        sheetStatus: "pending",
      },
      { scope, test: !!o.test, upsell: false, actor: { kind: "api", userId: null, impersonatorId: null, ip: null }, conversion: null },
    );
    return r.orderId;
  }
  const rowOf = async (id: string) => (await db.select().from(S.orders).where(deq(S.orders.id, id)).limit(1))[0]!;
  const eventsOf = (id: string, type?: string) =>
    db
      .select()
      .from(S.orderEvents)
      .where(type ? and(deq(S.orderEvents.orderId, id), deq(S.orderEvents.type, type)) : deq(S.orderEvents.orderId, id))
      .orderBy(S.orderEvents.id);
  const countEvents = async (id: string) => (await eventsOf(id)).length;
  const customerOf = async (phone: string, storeId = STORE_A) =>
    (await db.select().from(S.customers).where(and(deq(S.customers.storeId, storeId), deq(S.customers.phone, phone))).limit(1))[0];

  /* ================================================================ */
  section = "writer";
  {
    // creation: the created event once, city_key from an exact match, priority, the customer
    const o1 = await order(A, { city: "Fès" });
    const r1 = await rowOf(o1);
    eq("creation: city_key from the exact city", r1.cityKey, "fes");
    ok("creation: priority set (new lane 500 + amount)", r1.priority === 510, r1.priority);
    ok("creation: customer linked", !!r1.customerId);
    eq("creation: exactly one created event, rev 0", (await eventsOf(o1, "created")).map((e) => [e.rev, (e.meta as { totalCents?: number }).totalCents]), [[0, 24990]]);
    const fuzzy = await rowOf(await order(A, { city: "Kenitre" }));
    eq("creation: a fuzzy city writes no key (the drawer suggests)", fuzzy.cityKey, null);
    // a replayed creation hook (the same order twice) writes nothing again: no second event, count or flag
    const H = load<typeof import("@/lib/orders/hooks")>("@/lib/orders/hooks");
    const eventsBefore = await countEvents(o1);
    await H.runOrderHooks("created", "afterCommit", A, { on: "created", order: await rowOf(o1), conversion: null, target: { pageId: r1.pageId!, versionId: null, source: "live" } });
    eq("creation: a replayed hook writes nothing again", [await countEvents(o1), (await customerOf(r1.phone))?.ordersCount], [eventsBefore, 1]);

    // CAS (OD4)
    const a = await T.transitionOrder(T.actorFrom(owner), A, { orderId: o1, want: { confirm: "attempting" }, source: "ui", expectRev: 0 });
    ok("a person's move with the rendered rev", a.ok && a.rev === 1 && a.status === "no_answer", a);
    const before = await countEvents(o1);
    const stale = await T.transitionOrder(T.actorFrom(owner), A, { orderId: o1, want: { confirm: "confirmed" }, source: "ui", expectRev: 0 });
    eq("a stale rev answers conflict with the fresh state", stale, { ok: false, error: "conflict", current: { rev: 1, states: { confirm: "attempting", ship: "none", money: "unpaid" }, status: "no_answer" } });
    eq("a conflict writes nothing", [await countEvents(o1), (await rowOf(o1)).rev], [before, 1]);
    const noop = await T.transitionOrder(T.actorFrom(owner), A, { orderId: o1, want: { confirm: "attempting" }, source: "ui" });
    ok("a no-op answers changed: false and writes nothing", noop.ok && !noop.changed && noop.rev === 1 && (await countEvents(o1)) === before, noop);

    // external pull from a terminal state (OD5)
    const o2 = await order(A);
    ok("fake by a person", (await T.transitionOrder(T.actorFrom(owner), A, { orderId: o2, want: { confirm: "fake" }, source: "ui" })).ok);
    await db.update(S.orders).set({ sheetDirty: 0 }).where(deq(S.orders.id, o2));
    const rev2 = (await rowOf(o2)).rev;
    const pull = await T.applyExternalStatus(A, o2, { legacy: "shipped" }, { kind: "sheet", ref: "row:7" });
    ok("a sheet's Expédiée on a fake order is refused", !pull.ok && pull.error === "illegal", pull);
    const r2 = await rowOf(o2);
    eq("terminal protection: state and rev unchanged, the label marked for rewrite (bit 1)", [r2.confirmState, r2.shipState, r2.rev, r2.sheetDirty & 1], ["fake", "none", rev2, 1]);
    eq("terminal protection: one external_rejected with the ref", (await eventsOf(o2, "external_rejected")).map((e) => e.meta), [{ source: "sheet", wanted: "shipped", why: "terminal", ref: "row:7" }]);
    const noopPull = await T.applyExternalStatus(A, o2, { legacy: "fake" }, { kind: "sheet", ref: "row:7" });
    eq("the sheet's own label is a noop", noopPull, { ok: true, changed: false, noop: true });

    // implied confirmation from "Expédiée", with the Agent cell (OD54)
    const o3 = await order(A);
    const shipped = await T.applyExternalStatus(A, o3, { legacy: "shipped" }, { kind: "sheet", ref: "row:8", agentLabel: "Samira" });
    ok("an implied confirmation from shipped", shipped.ok && "rev" in shipped && shipped.rev === 1 && shipped.status === "shipped", shipped);
    const r3 = await rowOf(o3);
    eq("implied: the axes, the label attribution, shipped_at", [r3.confirmState, r3.shipState, r3.confirmedBy, r3.confirmedByLabel, !!r3.shippedAt, !!r3.confirmedAt], ["confirmed", "shipped", null, "Samira", true, true]);
    eq(
      "implied: one state_changed per move, each with the new rev",
      (await eventsOf(o3, "state_changed")).map((e) => [e.fromState, e.toState, e.rev, e.actorKind, (e.meta as Record<string, unknown>).implied ?? null, (e.meta as Record<string, unknown>).agentLabel ?? null]),
      [
        ["new", "confirmed", 1, "sheet", true, "Samira"],
        ["none", "to_pack", 1, "system", true, null],
        ["to_pack", "shipped", 1, "sheet", null, null],
      ],
    );
    // a mapped label writes confirmed_by
    await setStoreSetting(A, "ops", { ...(await getStoreSetting(A, "ops")), agentLabels: { Karim: U.agentA.id } }, { id: U.ownerA.id });
    const o4 = await order(A);
    await T.applyExternalStatus(A, o4, { legacy: "confirmed" }, { kind: "sheet", agentLabel: "Karim" });
    eq("a mapped Agent cell writes confirmed_by", [(await rowOf(o4)).confirmedBy, (await rowOf(o4)).confirmedByLabel], [U.agentA.id, null]);
    const cancelShipped = await T.applyExternalStatus(A, o3, { legacy: "cancelled" }, { kind: "sheet", ref: "row:8" });
    ok("a sheet's Annulée after shipping is refused and recorded", !cancelShipped.ok && (await eventsOf(o3, "external_rejected")).length === 1, cancelShipped);

    // the at-delivery settlement (OD52): delivered writes collected and remitted in one rev
    const deliveredRes = await T.applyExternalStatus(A, o3, { legacy: "delivered" }, { kind: "carrier", ref: "run:1" });
    const r3b = await rowOf(o3);
    eq("at_delivery: delivered, collected and remitted in one rev bump", [deliveredRes.ok && "rev" in deliveredRes ? deliveredRes.rev : null, r3b.shipState, r3b.moneyState, !!r3b.deliveredAt, !!r3b.finalAt], [2, "delivered", "remitted", true, true]);
    eq(
      "at_delivery: the settlement on the remitted event",
      (await eventsOf(o3, "state_changed")).filter((e) => e.rev === 2).map((e) => [e.toState, (e.meta as Record<string, unknown>).settlement ?? null]),
      [
        ["delivered", null],
        ["collected", null],
        ["remitted", "at_delivery"],
      ],
    );
    await setStoreSetting(B, "accounting", { ...(await getStoreSetting(B, "accounting")), myCarrier: { settlement: "statement", confirmedAt: null } }, { id: U.ownerB.id });
    const oB = await order(B);
    await T.applyExternalStatus(B, oB, { legacy: "delivered" }, { kind: "carrier" });
    eq("statement: the money stays collected", (await rowOf(oB)).moneyState, "collected");

    // forced moves (orders.force_status + a reason, one axis) are audited
    const forcedRefused = await T.transitionOrder(T.actorFrom(agent), A, { orderId: o2, want: { confirm: "attempting" }, source: "ui", force: true, reason: "customer called back" });
    ok("an agent cannot force", !forcedRefused.ok, forcedRefused);
    const noReason = await T.transitionOrder(T.actorFrom(manager), A, { orderId: o2, want: { confirm: "attempting" }, source: "ui", force: true });
    eq("a forced move needs a reason", noReason.ok ? "ok" : noReason.error, "reason_required");
    const forced = await T.transitionOrder(T.actorFrom(manager), A, { orderId: o2, want: { confirm: "new" }, source: "ui", force: true, reason: "set back by the owner" });
    ok("a manager forces fake → new with a reason", forced.ok && forced.states.confirm === "new", forced);
    const lastForced = (await eventsOf(o2, "state_changed")).at(-1)!;
    eq("forced: event forced, the free-text reason in the note", [(lastForced.meta as Record<string, unknown>).forced, lastForced.note], [true, "set back by the owner"]);
    const audits = await db.select().from(S.auditLog).where(and(deq(S.auditLog.action, "orders.status_forced"), deq(S.auditLog.target, o2)));
    eq("forced: one audit row in the store", audits.map((r) => [r.storeId, (r.meta as Record<string, unknown>)?.to]), [[STORE_A, "new"]]);

    // OD12 visibility and the inbound set (OD53)
    const o5 = await order(A);
    const hidden = await T.transitionOrder(T.actorFrom(agent), A, { orderId: o5, want: { confirm: "confirmed" }, source: "ui" });
    eq("an agent's move on an order they don't hold: not_found", hidden, { ok: false, error: "not_found" });
    const noLookup = await T.transitionOrder(T.actorFrom(agent), A, { orderId: o5, want: { confirm: "confirmed" }, source: "outcome", inbound: true });
    eq("inbound without a lookup: not_found", noLookup, { ok: false, error: "not_found" });
    rememberInbound(A, U.agentA.id, [o5]);
    const flagLess = await T.transitionOrder(T.actorFrom(agent), A, { orderId: o5, want: { confirm: "confirmed" }, source: "outcome" });
    eq("a looked-up order without the inbound flag: not_found", flagLess, { ok: false, error: "not_found" });
    const inbound = await T.transitionOrder(T.actorFrom(agent), A, { orderId: o5, want: { confirm: "confirmed" }, source: "outcome", inbound: true });
    ok("inbound: the agent confirms the looked-up order", inbound.ok, inbound);
    const r5 = await rowOf(o5);
    eq("inbound: confirmed_by the agent, meta inbound", [r5.confirmedBy, (await eventsOf(o5, "state_changed"))[0]?.meta && ((await eventsOf(o5, "state_changed"))[0]!.meta as Record<string, unknown>).inbound], [U.agentA.id, true]);
    const own = await T.transitionOrder(T.actorFrom(agent), A, { orderId: o5, want: { confirm: "cancelled" }, source: "ui", reason: "changed_mind" });
    ok("the agent now sees the order they confirmed", own.ok, own);
    eq("cancel reason coded", [(await rowOf(o5)).cancelReason, (await eventsOf(o5, "state_changed")).at(-2)?.reasonCode], ["changed_mind", "changed_mind"]);

    // the legacy menu (OPE-§12.6)
    const o6 = await order(A);
    const cb = await T.moveToLegacy(owner, o6, "callback");
    const r6 = await rowOf(o6);
    ok("Move to Rappel: callback with a ladder time ahead", cb.ok && r6.confirmState === "callback" && !!r6.dueAt && r6.dueAt.getTime() > Date.now(), [cb, r6.dueAt]);
    const na = await T.moveToLegacy(owner, o6, "no_answer");
    ok("Move to Pas de réponse: attempting + one attempt", na.ok && (await rowOf(o6)).attempts === 1 && (await eventsOf(o6, "call_attempt")).length === 1, na);
    eq("Move to Annulée without a reason: reason_required", await T.moveToLegacy(owner, o6, "cancelled").then((r) => (r.ok ? "ok" : r.error)), "reason_required");
    eq("the deprecated updateOrderStatus is a thin wrapper", await AD.updateOrderStatus(A, o6, "confirmed", { kind: "user", userId: U.ownerA.id, impersonatorId: null, ip: null }), { ok: true, sheet: "queued" });
    eq("the deprecated wrapper never writes another store's order", await AD.updateOrderStatus(B, o6, "fake", { kind: "user", userId: U.ownerB.id, impersonatorId: null, ip: null }), { ok: false, error: "Order not found." });

    // honeypot orders never reach a person (OPE-§10.2)
    const hp = await order(A, { flags: ["honeypot", "fast"] });
    const rhp = await rowOf(hp);
    eq("honeypot: fake by the system, reason honeypot, no customer", [rhp.confirmState, rhp.customerId, (await eventsOf(hp, "state_changed")).map((e) => [e.actorKind, e.reasonCode])], ["fake", null, [["system", "honeypot"]]]);

    // another store's id answers like a missing one
    const aRow = await rowOf(o1);
    const fromB = [
      await T.transitionOrder(T.actorFrom(ownerBCtx), B, { orderId: o1, want: { confirm: "fake" }, source: "ui" }),
      await T.applyExternalStatus(B, o1, { legacy: "delivered" }, { kind: "sheet" }),
      await T.moveToLegacy(ownerBCtx, o1, "fake"),
      await E.appendOrderEvent(B, o1, { actorKind: "customer", type: "track_opened", meta: { via: "link" } }),
    ];
    eq("store B with A's order id: not_found everywhere", fromB, [{ ok: false, error: "not_found" }, { ok: false, error: "not_found" }, { ok: false, error: "not_found" }, { ok: false, error: "not_found" }]);
    eq("A's order unchanged by B", JSON.stringify(await rowOf(o1)), JSON.stringify(aRow));

    // appendOrderEvent: catalog, meta schema, phones and secrets refused, rev never changes
    const revBefore = (await rowOf(o1)).rev;
    eq("appendOrderEvent: an unknown type", await E.appendOrderEvent(A, o1, { actorKind: "customer", type: "made_up" as never }), { ok: false, error: "bad_type" });
    eq("appendOrderEvent: a phone in the meta", await E.appendOrderEvent(A, o1, { actorKind: "customer", type: "customer_request", meta: { kind: "address", text: "rappelez-moi au 0612345678" } }), { ok: false, error: "bad_meta" });
    eq("appendOrderEvent: a token in the meta", await E.appendOrderEvent(A, o1, { actorKind: "customer", type: "kit_shared", meta: { campaignId: "x", shareToken: "abc" } }), { ok: false, error: "bad_meta" });
    eq("appendOrderEvent: a meta off its schema", await E.appendOrderEvent(A, o1, { actorKind: "customer", type: "track_opened", meta: { via: "carrier-pigeon" } }), { ok: false, error: "bad_meta" });
    const appended = await E.appendOrderEvent(A, o1, { actorKind: "customer", type: "track_opened", meta: { via: "link" } });
    ok("appendOrderEvent: accepted, rev unchanged", appended.ok && (await rowOf(o1)).rev === revBefore, appended);
  }

  /* ================================================================ */
  section = "events";
  {
    const o = await order(A, { phone: "+212612345678" });
    await db.update(S.orders).set({ assigneeId: U.agentA.id }).where(deq(S.orders.id, o));
    const count = async () => (await eventsOf(o)).length;
    let n = await count();
    const att = await T.transitionOrder(T.actorFrom(agent), A, { orderId: o, want: { confirm: "attempting" }, source: "outcome", attempt: { channel: "call", outcome: "no_answer" }, extra: { attempts: 1 } });
    ok("an attempt with its move", att.ok, att);
    eq("one move and one attempt: two events", (await count()) - n, 2);
    n = await count();
    const att2 = await T.transitionOrder(T.actorFrom(agent), A, { orderId: o, want: { confirm: "attempting" }, source: "outcome", attempt: { channel: "call", outcome: "busy" }, extra: { attempts: 2 } });
    ok("a repeated no-contact attempt (no move) is still written", att2.ok && att2.changed === false, att2);
    eq("an attempt alone: one event", (await count()) - n, 1);
    eq("attempt numbers", (await eventsOf(o, "call_attempt")).map((e) => (e.meta as { attemptNo: number }).attemptNo), [1, 2]);
    n = await count();
    const note = await E.addNote(agent, o, "Le client dit de rappeler au 0661-22-33-44 après 18h");
    ok("a note", note.ok, note);
    eq("one note: one event, rev unchanged", [(await count()) - n, (await rowOf(o)).rev], [1, 2]);
    n = await count();
    await T.transitionOrder(T.actorFrom(agent), A, { orderId: o, want: { confirm: "confirmed" }, source: "outcome" });
    eq("a confirmation is two moves (confirmed + to_pack): two events", (await count()) - n, 2);
    eq("addNote: empty and too long", [await E.addNote(agent, o, "   "), await E.addNote(agent, o, "x".repeat(501))], [{ ok: false, error: "empty" }, { ok: false, error: "too_long" }]);
    eq("addNote on an order the agent cannot see", await E.addNote(agent2, o, "hello"), { ok: false, error: "not_found" });
    // an edit's phone values (stored E.164) and the timeline
    await E.appendEvents(db, A, [{ orderId: o, actorKind: "user", actorId: U.managerA.id, type: "field_edited", meta: { fields: [{ f: "phone", before: "+212612345678", after: "+212698765432" }] } }]);

    const tl = await E.orderTimeline(A, owner, o);
    const ids = tl.items.map((i) => i.id);
    ok("the timeline is newest first", ids.length > 5 && ids.every((id, i) => i === 0 || id < ids[i - 1]!), ids);
    const text = JSON.stringify(tl);
    ok("the timeline masks every phone (the note and the edit)", !/0661|22-33-44|612345678|698765432/.test(text) && text.includes("•"), tl.items.slice(0, 3));
    eq("the timeline names its actors", tl.items.find((i) => i.type === "note")?.actor, { kind: "user", name: "Agent A" });
    eq("the created line is the oldest, by the shopper", [tl.items.at(-1)?.type, tl.items.at(-1)?.actor.kind], ["created", "customer"]);
    ok("every item says masked: true", tl.items.every((i) => i.masked === true));
    eq("filter calls", [...new Set((await E.orderTimeline(A, owner, o, { filter: "calls" })).items.map((i) => i.type))], ["call_attempt"]);
    eq("filter notes", (await E.orderTimeline(A, owner, o, { filter: "notes" })).items.map((i) => i.type), ["note"]);
    const p1 = await E.orderTimeline(A, owner, o, { limit: 2 });
    const p2 = await E.orderTimeline(A, owner, o, { limit: 2, beforeId: p1.items.at(-1)!.id });
    ok("keyset paging", p1.more && p1.items.length === 2 && p2.items.length === 2 && p2.items[0]!.id < p1.items[1]!.id, [p1.items.map((i) => i.id), p2.items.map((i) => i.id)]);
    eq("the timeline of an order the agent can't see is empty", await E.orderTimeline(A, agent2, o), { items: [], more: false });
    eq("the timeline of A's order from B is empty", await E.orderTimeline(B, ownerBCtx, o), { items: [], more: false });

    // note edits (author, 5 minutes) and hiding (managers)
    const noteId = (note as { id: number }).id;
    eq("an edit by another member is refused", await E.editNote(manager, o, noteId, "autre texte"), { ok: false, error: "forbidden" });
    eq("an edit after 5 minutes is refused", await E.editNote(agent, o, noteId, "trop tard", new Date(Date.now() + 6 * 60_000)), { ok: false, error: "too_late" });
    const edited = await E.editNote(agent, o, noteId, "Rappeler après 18h");
    ok("the author edits within 5 minutes", edited.ok, edited);
    const notes = (await E.orderTimeline(A, owner, o, { filter: "notes" })).items;
    eq("one line per note, its latest text, marked edited", notes.map((i) => [i.text.vars?.text, i.detail?.map((d) => d.key)]), [["Rappeler après 18h", ["ops.tl.detail.edited"]]]);
    eq("an agent cannot hide a note", await E.hideNote(agent, o, noteId), { ok: false, error: "forbidden" });
    ok("a manager hides a note", (await E.hideNote(manager, o, noteId)).ok);
    eq("a hidden note is gone for agents", (await E.orderTimeline(A, agent, o, { filter: "notes" })).items.length, 0);
    eq("a hidden note is marked for managers", (await E.orderTimeline(A, manager, o, { filter: "notes" })).items.map((i) => i.detail?.map((d) => d.key)), [["ops.tl.detail.edited", "ops.tl.detail.hidden"]]);
    ok("the hidden text stays stored for the audit", (await eventsOf(o, "note")).some((e) => e.note?.includes("0661")));
  }

  /* ================================================================ */
  section = "customers";
  {
    const p1 = freshPhone();
    const p2 = freshPhone();
    const sys = (id: string, want: Parameters<typeof T.transitionOrder>[2]["want"], extra: Partial<Parameters<typeof T.transitionOrder>[2]> = {}) => T.transitionOrder(system, A, { orderId: id, want, source: "system", ...extra });
    const carrier = (id: string, ship: "shipped" | "delivered" | "refused" | "returned" | "lost") => T.applyExternalStatus(A, id, { ship }, { kind: "carrier" });
    // p1: delivered, refused then returned, cancelled; a test order
    const d1 = await order(A, { phone: p1, name: "Nadia El Amrani" });
    await carrier(d1, "shipped");
    await carrier(d1, "delivered");
    const d2 = await order(A, { phone: p1 });
    await carrier(d2, "refused");
    await carrier(d2, "returned");
    const d3 = await order(A, { phone: p1 });
    await sys(d3, { confirm: "cancelled" }, { reason: "changed_mind" });
    const t1 = await order(A, { phone: p1, test: true, name: "Test Person" });
    await sys(t1, { confirm: "confirmed" });
    // p2: fake, unreachable, lost
    const e1 = await order(A, { phone: p2 });
    await sys(e1, { confirm: "fake" });
    const e2 = await order(A, { phone: p2 });
    await sys(e2, { confirm: "unreachable" });
    const e3 = await order(A, { phone: p2 });
    await carrier(e3, "shipped");
    await carrier(e3, "lost");
    const c1 = (await customerOf(p1))!;
    eq(
      "p1 counters: 3 orders, 1 test, 2 confirmed, 1 delivered, 0 refused (moved on), 1 returned, 1 cancelled",
      [c1.ordersCount, c1.testCount, c1.confirmedCount, c1.deliveredCount, c1.refusedCount, c1.returnedCount, c1.cancelledCount, c1.fakeCount],
      [3, 1, 2, 1, 0, 1, 1, 0],
    );
    eq("a test order never refreshes a real customer's name", c1.name, "Salma Bennani");
    const c2 = (await customerOf(p2))!;
    eq("p2 counters: fake 1, cancelled 1 (unreachable), returned 1 (lost), confirmed 1", [c2.ordersCount, c2.fakeCount, c2.cancelledCount, c2.returnedCount, c2.confirmedCount], [3, 1, 1, 1, 1]);
    // the whole store: the hooks' deltas equal the recompute
    const r1 = await C.reconcileCustomers(A);
    ok("after the mixed run the counters equal the recompute (no drift)", r1.fixed === 0 && Object.values(r1.drift).every((v) => v === 0) && r1.scanned > 5, r1);
    await db.update(S.customers).set({ deliveredCount: 9 }).where(deq(S.customers.id, c1.id));
    const r2 = await C.reconcileCustomers(A);
    eq("drift is found and fixed", [r2.fixed, r2.drift.deliveredCount, (await customerOf(p1))!.deliveredCount], [1, 8, 1]);
    const page1 = await C.reconcileCustomers(A, { limit: 2 });
    ok("reconcile pages by id", page1.scanned === 2 && !!page1.nextAfterId && (await C.reconcileCustomers(A, { afterId: page1.nextAfterId })).scanned > 0, page1);
    // a phone edit moves the order and its counters
    const p3 = freshPhone();
    const moved = await rowOf(d1);
    await db.transaction(async (tx) => {
      await tx.update(S.orders).set({ phone: p3 }).where(deq(S.orders.id, d1));
      await C.moveOrderCustomer(tx, A, { id: d1, phone: p3, name: moved.name, city: moved.city, cityKey: moved.cityKey, locale: moved.locale, isTest: false, createdAt: moved.createdAt, states: { confirm: moved.confirmState, ship: moved.shipState }, customerId: moved.customerId });
    });
    const c3 = (await customerOf(p3))!;
    eq("moved: the new customer holds the order and its delivered count", [c3.ordersCount, c3.deliveredCount, c3.confirmedCount, (await rowOf(d1)).customerId === c3.id], [1, 1, 1, true]);
    eq("moved: the old customer lost them", [(await customerOf(p1))!.ordersCount, (await customerOf(p1))!.deliveredCount], [2, 0]);
    const r3 = await C.reconcileCustomers(A);
    eq("after the move the counters still equal the recompute", r3.fixed, 0);
    // a test order on a new phone: test_count only
    const p4 = freshPhone();
    await order(A, { phone: p4, test: true });
    const c4 = (await customerOf(p4))!;
    eq("a test-only customer: orders 0, test 1", [c4.ordersCount, c4.testCount], [0, 1]);
    // B never sees A's customers
    eq("B's reconcile scans B only", (await C.reconcileCustomers(B)).scanned, (await db.select().from(S.customers).where(deq(S.customers.storeId, STORE_B))).length);
    // reads (OD12): agents see the customers of their orders only, counts only
    const all = await C.listCustomers(A, owner, {});
    ok("owners list every customer, phones masked", all.items.length > 4 && all.items.every((c) => c.phoneMasked.includes("•")) && !JSON.stringify(all).includes(p1), all.items.slice(0, 2));
    const hit = await C.listCustomers(A, owner, { search: p1.slice(-8) });
    eq("search by ≥ 4 phone digits, matched server-side", hit.items.map((c) => c.id), [c1.id]);
    eq("search by name", (await C.listCustomers(A, owner, { search: "Salma" })).items.length > 0, true);
    eq("an agent with no order sees no customer", (await C.listCustomers(A, agent2, {})).items, []);
    await db.update(S.orders).set({ assigneeId: U.agent2A.id }).where(deq(S.orders.id, e1));
    eq("an agent sees the customers of the orders they hold", (await C.listCustomers(A, agent2, {})).items.map((c) => c.id), [c2.id]);
    const asAgent = await C.getCustomer(A, agent2, c2.id);
    eq("an agent's customer page: counts only (no order list, no note)", [asAgent?.orders, asAgent?.note, asAgent?.counts.fake], [null, null, 1]);
    eq("an agent's customer page of another customer: null", await C.getCustomer(A, agent2, c1.id), null);
    const asOwner = await C.getCustomer(A, owner, c2.id);
    eq("an owner's customer page lists the orders", asOwner?.orders?.length, 3);
    eq("B with A's customer id: null", await C.getCustomer(B, ownerBCtx, c1.id), null);
    eq("filter refused or returned", (await C.listCustomers(A, owner, { filter: "refused_returned" })).items.map((c) => c.id).sort(), [c1.id, c2.id].sort());
    await db.insert(S.blocklist).values({ id: newId(), storeId: STORE_A, kind: "phone", value: p2, reason: "test", createdAt: new Date() });
    const blocked = await C.listCustomers(A, owner, { filter: "blocked" });
    eq("filter blocked", blocked.items.map((c) => [c.id, c.blocked]), [[c2.id, true]]);
  }

  /* ================================================================ */
  section = "duplicates";
  {
    const p = freshPhone();
    const first = await order(A, { phone: p });
    const second = await order(A, { phone: p });
    eq("the new order is flagged with the open one", (await eventsOf(second, "duplicate_suspected")).map((e) => e.meta), [{ of: [first] }]);
    eq("and the open one with the new one", (await eventsOf(first, "duplicate_suspected")).map((e) => e.meta), [{ of: [second] }]);
    const t1 = await order(A, { phone: p, test: true });
    eq("a test order never matches real ones", (await eventsOf(t1, "duplicate_suspected")).length, 0);
    const t2 = await order(A, { phone: p, test: true });
    eq("a test order matches test orders only", (await eventsOf(t2, "duplicate_suspected")).map((e) => e.meta), [{ of: [t1] }]);
    const inB = await order(B, { phone: p });
    eq("nothing crosses stores", (await eventsOf(inB, "duplicate_suspected")).length, 0);
    eq("read time: the pair", (await D.duplicatesFor(A, { id: second, phone: p, isTest: false })).map((m) => m.id), [first]);
    eq("Keep both from B: not_found", await D.dismissDuplicate(ownerBCtx, second, first), { ok: false, error: "not_found" });
    eq("Keep both", await D.dismissDuplicate(owner, second, first), { ok: true });
    eq("the pair is never shown again (both ways)", [(await D.duplicatesFor(A, { id: second, phone: p, isTest: false })).length, (await D.duplicatesFor(A, { id: first, phone: p, isTest: false })).length], [0, 0]);
    eq("duplicate_dismissed on both orders", [(await eventsOf(first, "duplicate_dismissed")).length, (await eventsOf(second, "duplicate_dismissed")).length], [1, 1]);
    await T.transitionOrder(system, A, { orderId: first, want: { confirm: "cancelled" }, source: "system", reason: "other" });
    await T.transitionOrder(system, A, { orderId: second, want: { confirm: "cancelled" }, source: "system", reason: "other" });
    const third = await order(A, { phone: p });
    eq("decided orders are not duplicates", (await eventsOf(third, "duplicate_suspected")).length, 0);
    const markDup = await T.transitionOrder(T.actorFrom(owner), A, { orderId: t2, want: { confirm: "duplicate" }, source: "ui", duplicateOf: inB });
    eq("Mark as duplicate of another store's order: bad_duplicate", markDup.ok ? "ok" : markDup.error, "bad_duplicate");
    const markOk = await T.transitionOrder(T.actorFrom(owner), A, { orderId: t2, want: { confirm: "duplicate" }, source: "ui", duplicateOf: t1 });
    eq("Mark as duplicate links merged_into", [markOk.ok, (await rowOf(t2)).mergedInto], [true, t1]);
    await setStoreSetting(A, "ops", { ...(await getStoreSetting(A, "ops")), duplicateWindowDays: 0 }, { id: U.ownerA.id });
    const off = await order(A, { phone: p });
    eq("a window of 0 days turns the check off", (await eventsOf(off, "duplicate_suspected")).length, 0);
    await setStoreSetting(A, "ops", { ...(await getStoreSetting(A, "ops")), duplicateWindowDays: 3 }, { id: U.ownerA.id });
  }

  /* ================================================================ */
  section = "test orders";
  {
    // the operations rows of the OPE-§3.6 exclusions table, one per hook behaviour
    const p = freshPhone();
    const real = await order(A, { phone: p });
    const notesBefore = (await db.select().from(S.notifications).where(and(deq(S.notifications.storeId, STORE_A), deq(S.notifications.kind, "ops.new_orders")))).map((r) => (r.vars as { count: number }).count).reduce((a, b) => a + b, 0);
    const test = await order(A, { phone: p, test: true });
    const notesAfter = (await db.select().from(S.notifications).where(and(deq(S.notifications.storeId, STORE_A), deq(S.notifications.kind, "ops.new_orders")))).map((r) => (r.vars as { count: number }).count).reduce((a, b) => a + b, 0);
    const cust = (await customerOf(p))!;
    const table: [string, unknown, unknown][] = [
      ["ops.created · customer: test_count only", [cust.ordersCount, cust.testCount], [1, 1]],
      ["ops.created · the created event says test", (await eventsOf(test, "created"))[0]?.meta && ((await eventsOf(test, "created"))[0]!.meta as { test?: true }).test, true],
      ["ops.created · duplicate check among test orders only", (await eventsOf(test, "duplicate_suspected")).length, 0],
      ["ops.created · linked to the customer like any order", (await rowOf(test)).customerId, cust.id],
      ["ops.created · no new-orders notification", notesAfter - notesBefore, 0],
    ];
    await T.transitionOrder(system, A, { orderId: test, want: { confirm: "confirmed" }, source: "system" });
    await T.applyExternalStatus(A, test, { ship: "delivered" }, { kind: "carrier" });
    const after = (await customerOf(p))!;
    table.push(["ops.counters · a test order's moves change no counter", [after.confirmedCount, after.deliveredCount, after.testCount], [0, 0, 1]]);
    table.push(["ops.counters · the real order's move still counts", await T.transitionOrder(system, A, { orderId: real, want: { confirm: "confirmed" }, source: "system" }).then(async () => (await customerOf(p))!.confirmedCount), 1]);
    for (const [label, got, want] of table) eq(label, got, want);
    const notified = await db.select().from(S.notifications).where(and(deq(S.notifications.storeId, STORE_A), deq(S.notifications.kind, "ops.new_orders")));
    ok("real orders notify owners, admins and managers, batched", notified.length >= 1 && notified.every((r) => JSON.stringify(r.roles) === JSON.stringify(["owner", "admin", "manager"]) && /^\d{2}:\d{2}$/.test(String((r.vars as { sinceTime?: string }).sinceTime))), notified.map((r) => [r.roles, r.vars]));
    ok("the notification link is the store's to-call view", notified.every((r) => r.link === "/app/ops-a/orders?view=to-call"), notified.map((r) => r.link));
  }

  /* ================================================================ */
  section = "outcomes";
  {
    // OPE-§6.1, §6.1a, §6.3, §6.5 on the real writer (the queue's own suite, test:queue, covers the claims)
    const O = load<typeof import("@/lib/callcenter/outcomes")>("@/lib/callcenter/outcomes");
    const L = load<typeof import("@/lib/callcenter/ladder")>("@/lib/callcenter/ladder");
    const W = load<typeof import("@/lib/callcenter/window")>("@/lib/callcenter/window");
    const { callingWindowFor } = load<typeof import("@/lib/callcenter/window.server")>("@/lib/callcenter/window.server");
    type OutcomeInput = import("@/lib/callcenter/outcomes").OutcomeInput;
    const ops = await getStoreSetting(A, "ops");
    const w = await callingWindowFor(A);
    const tz = w.tz;
    /** an order of A held by `ctx` (the agent sees only the orders they hold, OD12) */
    const held = async (ctx: WriteCtx, o: Parameters<typeof order>[1] = {}) => {
      const id = await order(A, o);
      await db.update(S.orders).set({ assigneeId: ctx.user.id }).where(deq(S.orders.id, id));
      return id;
    };
    const record = async (ctx: WriteCtx, id: string, input: Partial<OutcomeInput> & { outcome: OutcomeInput["outcome"] }) =>
      O.recordOutcome(ctx, { orderId: id, expectRev: (await rowOf(id)).rev, channel: "call", idem: randomUUID(), ...input });
    const data = (r: Awaited<ReturnType<typeof record>>) => (r.ok ? r.data : null);
    const errorOf = (r: Awaited<ReturnType<typeof record>>) => (r.ok ? (r.data.ok ? "ok" : r.data.error) : `action:${r.error}`);
    /** a due time the writer computed a few ms after `expected` was: equal, or within 5 s when nothing snapped it */
    const near = (got: Date | null | undefined, expected: Date | "exhausted") => expected !== "exhausted" && !!got && Math.abs(got.getTime() - expected.getTime()) < 5_000;

    // no_answer: the ladder, first_touch_at, the attempt's meta, the claim ended
    const o1 = await held(agent);
    await db.update(S.orders).set({ claimToken: "tok-1", leaseUntil: new Date(Date.now() + 600_000) }).where(deq(S.orders.id, o1));
    const r1 = await record(agent, o1, { outcome: "no_answer", objectionId: "price_high" });
    const row1 = await rowOf(o1);
    ok("no_answer: attempting, one attempt", errorOf(r1) === "ok" && row1.confirmState === "attempting" && row1.attempts === 1, r1);
    ok("… due at the ladder's first step, in the window", near(row1.dueAt, L.nextDue(1, new Date(), new Date(), ops, tz)), [row1.dueAt, L.nextDue(1, new Date(), new Date(), ops, tz)]);
    eq("… first_touch_at set, the claim ended", [!!row1.firstTouchAt, row1.claimToken, row1.leaseUntil], [true, null, null]);
    const at1 = (await eventsOf(o1, "call_attempt"))[0];
    eq("… one call_attempt by the agent: channel, attemptNo, nextDueAt, the objection chip", [at1?.actorId, at1?.reasonCode, at1?.meta], [U.agentA.id, "no_answer", { channel: "call", outcome: "no_answer", attemptNo: 1, nextDueAt: row1.dueAt!.toISOString(), objectionId: "price_high" }]);
    const ft = row1.firstTouchAt!.getTime();
    await record(agent, o1, { outcome: "no_answer" });
    eq("first_touch_at is set once", (await rowOf(o1)).firstTouchAt?.getTime(), ft);
    const staleCard = data(await O.recordOutcome(agent, { orderId: o1, expectRev: 0, channel: "call", outcome: "no_answer", idem: randomUUID() }));
    eq("expectRev from an older card: conflict with the fresh state", staleCard && !staleCard.ok ? { ok: staleCard.ok, error: staleCard.error, current: staleCard.current } : staleCard, {
      ok: false,
      error: "conflict",
      current: { rev: (await rowOf(o1)).rev, states: { confirm: "attempting", ship: "none", money: "unpaid" }, status: "no_answer" },
    });
    ok("… with the order's fresh card (its rev), and no other member named (the agent wrote it)", !!staleCard && !staleCard.ok && staleCard.card?.rev === (await rowOf(o1)).rev && staleCard.updatedBy === null, staleCard && !staleCard.ok && { card: staleCard.card?.rev, updatedBy: staleCard.updatedBy });

    // busy / switched_off: the first in a row after busyRetryMinutes, the next on the ladder
    const o2 = await held(agent);
    await record(agent, o2, { outcome: "busy" });
    ok("the first busy: retried after busyRetryMinutes", near((await rowOf(o2)).dueAt, W.snapIntoWindow(new Date(Date.now() + ops.busyRetryMinutes * 60_000), w)), (await rowOf(o2)).dueAt);
    await record(agent, o2, { outcome: "switched_off" });
    ok("a second busy / switched off in a row: the ladder (attempt 2)", near((await rowOf(o2)).dueAt, L.ladderNext(2, new Date(), ops, tz)) && (await rowOf(o2)).attempts === 2, (await rowOf(o2)).dueAt);

    // exhaustion, policy close (OPE-§6.3): the last attempt closes the order in the same transaction
    const o3 = await held(agent);
    for (let i = 0; i < ops.ladder.length; i++) await record(agent, o3, { outcome: "no_answer" });
    eq(`${ops.ladder.length} unanswered attempts: still attempting`, [(await rowOf(o3)).confirmState, (await rowOf(o3)).attempts], ["attempting", ops.ladder.length]);
    const last = await record(agent, o3, { outcome: "busy" });
    const row3 = await rowOf(o3);
    eq("the last attempt (even a first busy): unreachable, reason attempts_exhausted, no due time", [errorOf(last), row3.confirmState, row3.cancelReason, row3.dueAt, row3.attempts], ["ok", "unreachable", "attempts_exhausted", null, ops.ladder.length + 1]);
    const closing = (await eventsOf(o3)).filter((e) => e.rev === row3.rev);
    eq(
      "… one transaction: the agent's attempt and the system's move",
      closing.map((e) => [e.type, e.actorKind, e.reasonCode]),
      [
        ["call_attempt", "user", "busy"],
        ["state_changed", "system", "attempts_exhausted"],
      ],
    );

    // exhaustion, policy keep_open: one try a day until keepOpenDays after the first attempt
    await setStoreSetting(A, "ops", { ...(await getStoreSetting(A, "ops")), unreachable: "keep_open", keepOpenDays: 7 }, { id: U.ownerA.id });
    const opsKeep = await getStoreSetting(A, "ops");
    const o4 = await held(agent);
    for (let i = 0; i < opsKeep.ladder.length; i++) await record(agent, o4, { outcome: "no_answer" });
    await record(agent, o4, { outcome: "no_answer" });
    const row4 = await rowOf(o4);
    ok("keep_open: after the ladder, attempting with one try the next open day", row4.confirmState === "attempting" && near(row4.dueAt, L.keepOpenNext(row4.firstTouchAt!, new Date(), opsKeep, tz)), [row4.confirmState, row4.dueAt]);
    await db.update(S.orders).set({ firstTouchAt: new Date(Date.now() - 8 * 86_400_000) }).where(deq(S.orders.id, o4));
    await record(agent, o4, { outcome: "no_answer" });
    eq("keep_open: past keepOpenDays the next unanswered try closes it", [(await rowOf(o4)).confirmState, (await rowOf(o4)).cancelReason], ["unreachable", "attempts_exhausted"]);
    await setStoreSetting(A, "ops", { ...opsKeep, unreachable: "close" }, { id: U.ownerA.id });

    // callbacks (OPE-§6.5, §L "Callback horizon")
    const o5 = await held(agent);
    const soon = new Date(Date.now() + 4 * 60_000).toISOString();
    const far = new Date(Date.now() + 31 * 86_400_000).toISOString();
    eq("a callback in 4 minutes, in 31 days, or without a time: bad_due", [errorOf(await record(agent, o5, { outcome: "callback", dueAt: soon })), errorOf(await record(agent, o5, { outcome: "callback", dueAt: far })), errorOf(await record(agent, o5, { outcome: "callback" }))], ["bad_due", "bad_due", "bad_due"]);
    const tomorrow = W.addDaysYmd(W.storeYmd(new Date(), tz), 1);
    const night = W.instantAt(tomorrow, "03:00", tz);
    const cb = await record(agent, o5, { outcome: "callback", dueAt: night.toISOString() });
    const row5 = await rowOf(o5);
    eq("outside the window a callback is a warning, never a refusal", [errorOf(cb), data(cb)?.warning], ["ok", "outside_window"]);
    eq("… the owner keeps it until due + grace, no claim", [row5.confirmState, row5.dueAt?.getTime(), row5.assigneeId, row5.leaseUntil?.getTime(), row5.claimToken], ["callback", night.getTime(), U.agentA.id, night.getTime() + ops.callbackGraceMinutes * 60_000, null]);
    const o5b = await held(agent);
    const morning = await record(agent, o5b, { outcome: "callback", dueAt: W.instantAt(tomorrow, "10:00", tz).toISOString() });
    ok("inside the window: no warning", errorOf(morning) === "ok" && data(morning)?.warning === undefined, morning);

    // the decided outcomes
    const o6 = await held(agent);
    eq("cancelled needs a coded reason", errorOf(await record(agent, o6, { outcome: "cancelled" })), "reason_required");
    eq("a system reason is not pickable", (await record(agent, o6, { outcome: "cancelled", reason: "attempts_exhausted" as never })).ok, false);
    await record(agent, o6, { outcome: "cancelled", reason: "price" });
    eq("cancelled with a reason", [(await rowOf(o6)).confirmState, (await rowOf(o6)).cancelReason], ["cancelled", "price"]);
    const o7 = await held(agent);
    await record(agent, o7, { outcome: "wrong_number" });
    eq("wrong_number: cancelled (wrong_number), the attempt counted", [(await rowOf(o7)).confirmState, (await rowOf(o7)).cancelReason, (await rowOf(o7)).attempts], ["cancelled", "wrong_number", 1]);
    const p = freshPhone();
    const f1 = await held(agent, { phone: p });
    const f2 = await order(A, { phone: p });
    eq("fake + Block this number needs blocklist.write", errorOf(await record(agent, f1, { outcome: "fake", blockPhone: true })), "forbidden");
    const fk = await record(manager, f1, { outcome: "fake", blockPhone: true });
    eq("a manager's fake + block: the phone blocked, the phone's other open orders listed for review", [errorOf(fk), data(fk)?.review], ["ok", [f2]]);
    eq("… on the blocklist", (await db.select().from(S.blocklist).where(and(deq(S.blocklist.storeId, STORE_A), deq(S.blocklist.value, p)))).length, 1);
    const d1 = await held(agent, { phone: p });
    eq("duplicate needs duplicateOf", errorOf(await record(agent, d1, { outcome: "duplicate" })), "bad_duplicate");
    eq("duplicate of another phone's order", errorOf(await record(agent, d1, { outcome: "duplicate", duplicateOf: o6 })), "bad_duplicate");
    eq("duplicate of an order that is itself a duplicate", await (async () => {
      const d0 = await order(A, { phone: p });
      await T.transitionOrder(T.actorFrom(owner), A, { orderId: d0, want: { confirm: "duplicate" }, source: "ui", duplicateOf: f2 });
      return errorOf(await record(agent, d1, { outcome: "duplicate", duplicateOf: d0 }));
    })(), "bad_duplicate");
    await record(agent, d1, { outcome: "duplicate", duplicateOf: f2 });
    eq("duplicate of an order of the same phone: merged_into", [(await rowOf(d1)).confirmState, (await rowOf(d1)).mergedInto], ["duplicate", f2]);
    const confirmedNext = await record(manager, f2, { outcome: "confirmed", andNext: true });
    ok("Save and next: the next answer rides on the outcome", errorOf(confirmedNext) === "ok" && !!data(confirmedNext)?.next, confirmedNext);
    const hold = await record(manager, await order(A), { outcome: "confirmed", shipAfter: W.addDaysYmd(W.storeYmd(new Date(), tz), 5) });
    ok("confirmed with Deliver from…: the hold and its event (OD49)", errorOf(hold) === "ok", hold);
    eq("a hold beyond 60 days: bad_hold", errorOf(await record(manager, await order(A), { outcome: "confirmed", shipAfter: W.addDaysYmd(W.storeYmd(new Date(), tz), 61) })), "bad_hold");

    // the delivery lane (OPE-§6.1a, OD48)
    const failedParcel = async () => {
      const id = await order(A);
      await T.transitionOrder(system, A, { orderId: id, want: { confirm: "confirmed" }, source: "system" });
      await T.applyExternalStatus(A, id, { ship: "shipped" }, { kind: "carrier" });
      await T.applyExternalStatus(A, id, { ship: "attempt_failed" }, { kind: "carrier" });
      await db.update(S.orders).set({ assigneeId: U.agentA.id }).where(deq(S.orders.id, id));
      return id;
    };
    const l1 = await failedParcel();
    const l1row = await rowOf(l1);
    ok("a failed delivery attempt enters the lane (a due time)", l1row.shipState === "attempt_failed" && !!l1row.dueAt, [l1row.shipState, l1row.dueAt]);
    eq("a confirm outcome on it: illegal", errorOf(await record(agent, l1, { outcome: "confirmed" })), "illegal");
    await record(agent, l1, { outcome: "no_answer" });
    const l1a = await rowOf(l1);
    ok("rescue no_answer: retried after rescue.retryMinutes, attempts untouched", near(l1a.dueAt, W.snapIntoWindow(new Date(Date.now() + ops.rescue.retryMinutes * 60_000), w)) && l1a.attempts === 0 && l1a.confirmState === "confirmed", [l1a.dueAt, l1a.attempts]);
    eq("… a call_attempt of the delivery lane", (await eventsOf(l1, "call_attempt")).map((e) => [(e.meta as { lane?: string }).lane, (e.meta as { attemptNo: number }).attemptNo]), [["delivery", 1]]);
    await record(agent, l1, { outcome: "busy" });
    eq("a second unanswered rescue call: the next open day at 11:00", (await rowOf(l1)).dueAt?.getTime(), (L.rescueNext(2, 2, new Date(), ops, tz) as Date).getTime());
    for (let i = 2; i < ops.rescue.maxCalls; i++) await record(agent, l1, { outcome: "no_answer" });
    eq(`after ${ops.rescue.maxCalls} rescue calls the parcel leaves the lane (rescue_exhausted)`, [(await rowOf(l1)).dueAt, (await eventsOf(l1, "delivery_rescue")).map((e) => e.reasonCode)], [null, ["rescue_exhausted"]]);
    const l2 = await failedParcel();
    eq("reschedule needs shipAfter", errorOf(await record(agent, l2, { outcome: "reschedule" })), "bad_hold");
    const in3 = W.addDaysYmd(W.storeYmd(new Date(), tz), 3);
    await record(agent, l2, { outcome: "reschedule", shipAfter: in3 });
    const l2row = await rowOf(l2);
    eq("reschedule: postponed with the hold, out of the lane", [l2row.shipState, l2row.shipAfter?.getTime(), l2row.dueAt], ["postponed", W.instantAt(in3, "00:00", tz).getTime(), null]);
    eq("… hold_set and delivery_rescue in the same transaction", (await eventsOf(l2)).filter((e) => e.rev === l2row.rev).map((e) => e.type), ["call_attempt", "state_changed", "hold_set", "delivery_rescue"]);
    const l3 = await failedParcel();
    eq("cancel_recall needs a reason", errorOf(await record(agent, l3, { outcome: "cancel_recall" })), "reason_required");
    await record(agent, l3, { outcome: "cancel_recall", reason: "changed_mind" });
    eq("cancel_recall: recall_requested (carrier not notified), the ship axis untouched", [(await rowOf(l3)).shipState, (await rowOf(l3)).dueAt, (await eventsOf(l3, "recall_requested")).map((e) => e.meta)], ["attempt_failed", null, [{ reason: "changed_mind", carrierNotified: false }]]);
    const l4 = await failedParcel();
    await record(agent, l4, { outcome: "customer_informed", note: "Disponible demain matin" });
    eq("customer_informed: out of the lane, the rescue and the note written", [(await rowOf(l4)).dueAt, (await eventsOf(l4)).filter((e) => ["delivery_rescue", "note"].includes(e.type)).map((e) => e.type)], [null, ["delivery_rescue", "note"]]);

    // inbound (OPE-§5.7 acceptance b): an unreachable customer calls back
    const u1 = await order(A);
    await T.transitionOrder(system, A, { orderId: u1, want: { confirm: "unreachable" }, source: "system", reason: "attempts_exhausted" });
    eq("inbound without a lookup: not_found", errorOf(await record(agent2, u1, { outcome: "confirmed", inbound: true })), "not_found");
    rememberInbound(A, U.agent2A.id, [u1]);
    eq("a non-inbound outcome on an order outside the lanes: illegal", errorOf(await record(agent2, u1, { outcome: "no_answer", inbound: true })), "illegal");
    await record(agent2, u1, { outcome: "confirmed", inbound: true });
    const u1row = await rowOf(u1);
    eq("inbound confirmed on an unreachable order: confirmed_by the agent, meta inbound", [u1row.confirmState, u1row.confirmedBy, (await eventsOf(u1, "call_attempt")).map((e) => (e.meta as { inbound?: true }).inbound)], ["confirmed", U.agent2A.id, [true]]);
    eq("another store's order: not_found", errorOf(await record(ownerBCtx, o1, { outcome: "no_answer" })), "not_found");
  }

  /* ================================================================ */
  section = "hot path";
  {
    const O = load<typeof import("@/lib/callcenter/outcomes")>("@/lib/callcenter/outcomes");
    const I = load<typeof import("@/lib/callcenter/inbound")>("@/lib/callcenter/inbound");
    const R = load<typeof import("@/lib/callcenter/reveal")>("@/lib/callcenter/reveal");
    const G = load<typeof import("@/lib/callcenter/aggregates")>("@/lib/callcenter/aggregates");
    const K = load<typeof import("@/lib/callcenter/card")>("@/lib/callcenter/card");
    type OutcomeInput = import("@/lib/callcenter/outcomes").OutcomeInput;
    const member = async (label: string, role: StoreRole) => {
      const u = person(label);
      await db.insert(S.users).values(u);
      await db.insert(S.storeMembers).values({ storeId: STORE_A, userId: u.id, role });
      return { u, ctx: ctxOf("A", u, role) };
    };
    const { u: u3, ctx: agent3 } = await member("Agent-Three", "agent");
    const { u: u4, ctx: agent4 } = await member("Agent-Four", "agent");
    const record = async (ctx: WriteCtx, id: string, input: Partial<OutcomeInput> & { outcome: OutcomeInput["outcome"] }) =>
      O.recordOutcome(ctx, { orderId: id, expectRev: (await rowOf(id)).rev, channel: "call", idem: randomUUID(), ...input });
    const errorOf = (r: Awaited<ReturnType<typeof record>>) => (r.ok ? (r.data.ok ? "ok" : r.data.error) : `action:${r.error}`);
    const national = (e164: string) => `0${e164.slice(4)}`;

    // inbound (OPE-§5.7 acceptance b): the lookup is the agent's visibility
    const p1 = freshPhone();
    const u2 = await order(A, { phone: p1, name: "Hind Tazi" });
    await T.transitionOrder(system, A, { orderId: u2, want: { confirm: "unreachable" }, source: "system", reason: "attempts_exhausted" });
    const closed = await order(A, { phone: p1, name: "Hind Tazi" });
    await T.transitionOrder(T.actorFrom(owner), A, { orderId: closed, want: { confirm: "cancelled" }, source: "ui", reason: "other" });
    eq("inbound: fewer than 8 digits → too_short", await I.inboundLookup(agent3, "06 12 34 5"), { ok: false, error: "too_short" });
    const look = await I.inboundLookup(agent3, national(p1));
    const lo = look.ok ? look.data : null;
    ok(
      "inbound: the caller's open order (unreachable is open), the closed one as a count, the first name",
      !!lo && lo.orders.map((o) => o.id).join() === u2 && lo.otherOrders === 1 && lo.customer?.firstName === "Hind" && lo.customer.history?.orders === 2,
      look,
    );
    ok("inbound: unreachable is not claimable (no lane), nobody holds it", !!lo && lo.orders[0]!.callable === false && lo.orders[0]!.lane === null && lo.orders[0]!.held === null && lo.orders[0]!.status === "unreachable", lo?.orders);
    ok("inbound: the phone leaves masked only", !!lo && lo.customer!.phoneMasked.includes("•") && !JSON.stringify(look).includes(p1.slice(4)), lo?.customer);
    eq("inbound: a second agent without a lookup → not_found", errorOf(await record(agent2, u2, { outcome: "confirmed", inbound: true })), "not_found");
    eq("inbound: the looked-up order confirmed by the agent who picked up", errorOf(await record(agent3, u2, { outcome: "confirmed", inbound: true })), "ok");
    const u2row = await rowOf(u2);
    const moved = (await eventsOf(u2, "state_changed")).filter((e) => e.toState === "confirmed");
    eq(
      "… confirmed_by and first_touch_at set, the move and the attempt marked inbound, decided by that agent",
      [u2row.confirmState, u2row.confirmedBy, !!u2row.firstTouchAt, moved.map((e) => [e.actorId, (e.meta as { inbound?: true }).inbound]), (await eventsOf(u2, "call_attempt")).map((e) => (e.meta as { inbound?: true }).inbound)],
      ["confirmed", u3.id, true, [[u3.id, true]], [true]],
    );
    eq("inbound: a number no customer has → the empty shape", await I.inboundLookup(agent3, national(freshPhone())), { ok: true, data: { customer: null, orders: [], otherOrders: 0 } });
    eq("inbound: a number of no market → the empty shape", await I.inboundLookup(agent3, "99999999"), { ok: true, data: { customer: null, orders: [], otherOrders: 0 } });
    eq("inbound: store B looking up A's customer → the empty shape", await I.inboundLookup(ownerBCtx, national(p1)), { ok: true, data: { customer: null, orders: [], otherOrders: 0 } });
    const held = await order(A, { phone: p1, name: "Hind Tazi" });
    await db.update(S.orders).set({ assigneeId: U.agentA.id, claimToken: "tok-held", leaseUntil: new Date(Date.now() + 600_000) }).where(deq(S.orders.id, held));
    const look2 = await I.inboundLookup(agent3, `+${p1.slice(1)}`);
    const h = look2.ok ? look2.data.orders.find((o) => o.id === held) : undefined;
    ok("inbound: another agent's active claim shows who holds it and until when; a new order is claimable", !!h && h.callable && h.lane === "confirm" && h.held?.by === "Agent" && !!h.held.until, h);

    // inbound (acceptance c): the 61st lookup in an hour is refused and the board sees 61
    for (let i = 0; i < 60; i++) await I.inboundLookup(agent4, national(p1));
    eq("inbound: the 61st lookup in an hour → rate_limited", await I.inboundLookup(agent4, national(p1)), { ok: false, error: "rate_limited" });
    await I.inboundLookup(agent4, "06 12");
    eq("inbound: the board's hourly count includes the refusal (61), too_short costs nothing", await I.inboundLookupsThisHour(A, [u4.id, U.ownerA.id]), { [u4.id]: 61, [U.ownerA.id]: 0 });

    // the reveal (OP-07): exactly one phone_revealed per reveal, none on a replay
    const pr = freshPhone();
    const rv = await order(A, { phone: pr });
    const key = randomUUID();
    const r1 = await R.revealPhone(owner, rv, "call", { idem: key });
    const { parsePhoneNumberFromString } = load<typeof import("libphonenumber-js/max")>("libphonenumber-js/max");
    eq("reveal (owner, any order): e164, national, tel, wa", r1, { ok: true, data: { e164: pr, national: parsePhoneNumberFromString(pr)!.formatNational(), tel: `tel:${pr}`, wa: `https://wa.me/${pr.slice(1)}` } });
    eq("reveal: a replay answers the same", await R.revealPhone(owner, rv, "call", { idem: key }), r1);
    eq("reveal: exactly one phone_revealed (meta why), none for the replay", (await eventsOf(rv, "phone_revealed")).map((e) => [e.actorId, e.meta]), [[U.ownerA.id, { why: "call" }]]);
    eq("reveal: the same key with another reason → invalid, no event", [await R.revealPhone(owner, rv, "view", { idem: key }), (await eventsOf(rv, "phone_revealed")).length], [{ ok: false, error: "invalid" }, 1]);
    eq("reveal: an agent who never held the order → not_found", await R.revealPhone(agent3, rv, "call"), { ok: false, error: "not_found" });
    await db.update(S.orders).set({ assigneeId: u3.id, claimToken: "tok-rv", leaseUntil: new Date(Date.now() + 60_000) }).where(deq(S.orders.id, rv));
    await E.appendEvents(db, A, [{ orderId: rv, actorKind: "user", actorId: u3.id, type: "claimed", meta: { leaseUntil: new Date(Date.now() + 60_000).toISOString() } }]);
    const r3 = await R.revealPhone(agent3, rv, "view");
    const ops = await getStoreSetting(A, "ops");
    ok("reveal: the claim holder → ok, and the lease renewed to now + leaseMinutes", r3.ok && ((await rowOf(rv)).leaseUntil?.getTime() ?? 0) > Date.now() + (ops.leaseMinutes - 1) * 60_000, [r3, (await rowOf(rv)).leaseUntil]);
    await db.update(S.orders).set({ assigneeId: null, claimToken: null, leaseUntil: null }).where(deq(S.orders.id, rv));
    ok("reveal: released, held in the last 30 minutes (OD60) → ok", (await R.revealPhone(agent3, rv, "whatsapp")).ok);
    const realNow = Date.now;
    Date.now = () => realNow.call(Date) + 31 * 60_000;
    try {
      eq("reveal: held 31 minutes ago → not_found", await R.revealPhone(agent3, rv, "call"), { ok: false, error: "not_found" });
      await db.update(S.orders).set({ confirmState: "callback", assigneeId: u3.id, dueAt: new Date(Date.now() + 3_600_000) }).where(deq(S.orders.id, rv));
      ok("reveal: the callback's owner → ok", (await R.revealPhone(agent3, rv, "call")).ok);
    } finally {
      Date.now = realNow;
    }
    const before = (await eventsOf(rv)).length;
    const wa = await R.revealPhone(owner, rv, "whatsapp", { templateId: "builtin:wa:confirm" });
    ok("reveal (WhatsApp, built-in template): the wa.me link (no text while P5's renderer is its stub)", wa.ok && wa.data.wa.startsWith(`https://wa.me/${pr.slice(1)}`), wa);
    eq("… phone_revealed and whatsapp_sent", (await eventsOf(rv)).slice(before).map((e) => [e.type, e.meta]), [
      ["phone_revealed", { why: "whatsapp" }],
      ["whatsapp_sent", { template: "builtin:wa:confirm", locale: "fr" }],
    ]);
    const tplB = newId();
    await db.insert(S.messageTemplates).values({ id: tplB, storeId: STORE_B, channel: "whatsapp", kind: "custom", locale: "fr", name: "B", body: "Bonjour {customer_first_name}" });
    const n0 = (await eventsOf(rv)).length;
    eq("reveal: another store's template id → not_found, nothing written", [await R.revealPhone(owner, rv, "whatsapp", { templateId: tplB }), (await eventsOf(rv)).length], [{ ok: false, error: "not_found" }, n0]);
    eq("reveal: a template id outside the list → invalid", await R.revealPhone(owner, rv, "whatsapp", { templateId: "builtin:wa:refund" }), { ok: false, error: "invalid" });
    eq("reveal: an impersonation scope → forbidden", await R.revealPhone(viewAs as WriteCtx, rv, "call"), { ok: false, error: "forbidden" });
    eq("reveal: another store's order → not_found", await R.revealPhone(ownerBCtx, rv, "call"), { ok: false, error: "not_found" });

    // the store calibration (OD39, OP-14): null below 30 decided orders of the band, exact from 30
    const STORE_C = "0P4C0000000000000000000003";
    await db.insert(S.stores).values({ id: STORE_C, handle: "ops-c", name: "OPS-C", status: "active", brandSeed: "0123456789abcdef" });
    const Cs = mintScope("member", STORE_C) as WriteScope;
    const decided = async (n: number, risk: number, state: "confirmed" | "cancelled" | "fake" | "unreachable" | "duplicate" | "new", o: { test?: boolean; flags?: string[]; daysAgo?: number } = {}) => {
      for (let i = 0; i < n; i++) {
        const id = await order(Cs, { test: o.test, flags: o.flags });
        await db
          .update(S.orders)
          .set({ riskScore: risk, confirmState: state, ...(o.daysAgo ? { createdAt: new Date(Date.now() - o.daysAgo * 86_400_000) } : {}) })
          .where(deq(S.orders.id, id));
      }
    };
    await decided(10, 55, "fake");
    await decided(5, 60, "cancelled");
    await decided(4, 69, "unreachable");
    await decided(10, 50, "confirmed");
    // never counted: a test order, a honeypot, a duplicate, an open order, an order of 100 days ago, a low score
    await decided(1, 55, "fake", { test: true });
    await decided(1, 55, "fake", { flags: ["honeypot"] });
    await decided(1, 55, "duplicate");
    await decided(1, 55, "new");
    await decided(1, 55, "fake", { daysAgo: 100 });
    await decided(1, 40, "fake");
    G.forgetOpsAggregates(Cs);
    eq("calibration: 29 decided orders in the band → null", await G.riskBandOutcomes(Cs), { check: null, high: null });
    await decided(1, 52, "confirmed");
    eq("calibration: still the cached hour", (await G.riskBandOutcomes(Cs)).check, null);
    G.forgetOpsAggregates(Cs);
    eq("calibration: 30 decided → exact (19 fake + cancelled + unreachable of 30 = 6,333 bp)", await G.riskBandOutcomes(Cs), { check: { band: "check", decided: 30, bad: 19, badShareBp: 6333 }, high: null });

    // attemptStats (OD44): store-local (ISO weekday, hour), contacted = not no_answer / busy / switched_off
    const [cOrder] = await db.select({ id: S.orders.id }).from(S.orders).where(and(deq(S.orders.storeId, STORE_C), deq(S.orders.isTest, false))).limit(1);
    const [cTest] = await db.select({ id: S.orders.id }).from(S.orders).where(and(deq(S.orders.storeId, STORE_C), deq(S.orders.isTest, true))).limit(1);
    const at = new Date(Date.now() - 7 * 86_400_000);
    at.setUTCMinutes(20, 0, 0);
    const attempt = (orderId: string, code: string, when: Date) => ({ orderId, actorKind: "user" as const, actorId: U.agentA.id, type: "call_attempt" as const, reasonCode: code, meta: { channel: "call", outcome: code, attemptNo: 1 }, at: when });
    await E.appendEvents(db, Cs, [
      ...Array.from({ length: 20 }, () => attempt(cOrder!.id, "no_answer", at)),
      ...Array.from({ length: 5 }, () => attempt(cOrder!.id, "busy", at)),
      ...Array.from({ length: 12 }, () => attempt(cOrder!.id, "confirmed", at)),
      attempt(cOrder!.id, "callback", at),
      attempt(cTest!.id, "confirmed", at),
      attempt(cOrder!.id, "confirmed", new Date(Date.now() - 100 * 86_400_000)),
    ]);
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Casablanca", weekday: "short", hour: "2-digit", hourCycle: "h23" }).formatToParts(at).map((p) => [p.type, p.value]));
    const wd = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(parts.weekday!) + 1;
    eq("attemptStats: one cell at the store-local weekday and hour, test and 90-day-old attempts left out", await G.attemptStats(Cs), [{ weekday: wd, hour: Number(parts.hour), attempts: 38, contacted: 13 }]);
    eq("bestHourOf: the cell with ≥ 30 attempts", G.bestHourOf(await G.attemptStats(Cs), wd), { weekday: wd, hour: Number(parts.hour), attempts: 38, contacted: 13 });

    // the card (OPE-§5.3): built from the row and its reads
    const pc = freshPhone();
    const c1 = await order(A, { phone: pc, name: "Nadia Berrada", note: "porte bleue" });
    const c2 = await order(A, { phone: pc, name: "Nadia Berrada" });
    const c2row = await rowOf(c2);
    const tplA = newId();
    await db.insert(S.messageTemplates).values({ id: tplA, storeId: STORE_A, channel: "whatsapp", kind: "confirm", locale: "fr", name: "Confirmation maison", body: "Bonjour {customer_first_name}, commande {order_id}." });
    const scriptA = newId();
    await db.insert(S.messageTemplates).values({ id: scriptA, storeId: STORE_A, channel: "call_script", kind: "script", locale: "fr", name: "Script", body: JSON.stringify({ v: 1, steps: [{ id: "hello", title: "Bonjour", say: "Bonjour {customer_first_name}." }] }) });
    const card = await K.buildQueueOrder(A, (await K.cardRow(A, c2))!, owner, { leaseUntil: null, mine: false, maxCalls: 3 });
    ok("card: the customer's counters, the masked phone, the address and note for the call", card.customer.history?.orders === 2 && card.customer.phoneMasked.includes("•") && card.customer.firstName === "Nadia" && card.customer.address === "Hay Salam 12", card.customer);
    eq("card: the other open order of the phone is a possible duplicate", card.duplicates.map((d) => [d.id, d.status]), [[c1, "new"]]);
    eq("card: the store's own confirm template replaces the built-in", card.templates.map((x) => x.id), [tplA, "builtin:wa:missed_call", "builtin:wa:address"]);
    eq(
      "card: the store-wide script row is picked and rendered by P5's renderer (merged): one step, nothing unavailable",
      [card.script.source, card.script.templateId, card.script.locale, card.script.unavailable ?? null, card.script.steps.length],
      ["store", scriptA, "fr", null, 1],
    );
    eq("card: no ETA while P3's zone line is its stub; no calibration below 30", [card.eta, card.risk.calibration], [{ text: null, cityKey: "fes" }, null]);
    ok("card: money in cents, no full phone, ≤ 6 KB gzipped", card.totalCents === 24_990 && !JSON.stringify(card).includes(pc.slice(1)) && K.cardGzBytes(card) <= 6_144, K.cardGzBytes(card));
    const masked = await K.buildQueueOrder(impA, c2row, viewAs, { leaseUntil: null, mine: false, maxCalls: 3 });
    ok("card: under an impersonation scope the customer fields are masked (OD61)", masked.customer.firstName === "Nadia" && masked.customer.address !== "Hay Salam 12" && !JSON.stringify(masked).includes("Berrada"), masked.customer);

    // a stale card (OPE-§13.2 step 5): the fresh card and who changed the order
    await db.update(S.orders).set({ assigneeId: u3.id }).where(deq(S.orders.id, c2));
    await T.transitionOrder(T.actorFrom(manager), A, { orderId: c2, want: { confirm: "attempting" }, source: "ui" });
    const stale = await O.recordOutcome(agent3, { orderId: c2, expectRev: c2row.rev, channel: "call", outcome: "no_answer", idem: randomUUID() });
    const sd = stale.ok ? stale.data : null;
    ok("conflict: the fresh state, the fresh card and the manager's first name", !!sd && !sd.ok && sd.error === "conflict" && sd.card?.id === c2 && sd.card.rev === (await rowOf(c2)).rev && sd.updatedBy === "Manager", sd && { error: !sd.ok && sd.error, card: sd.card?.id, updatedBy: sd.updatedBy });
  }

  /* ================================================================ */
  section = "manual";
  {
    const M = load<typeof import("@/lib/orders/manual")>("@/lib/orders/manual");
    const ED = load<typeof import("@/lib/orders/edit")>("@/lib/orders/edit");
    const { createOrder } = load<typeof import("@/lib/orders/create")>("@/lib/orders/create");
    const { resolvePublicTarget } = load<typeof import("@/lib/tenancy/public")>("@/lib/tenancy/public");
    const { getFixture } = load<typeof import("@/lib/page/fixtures")>("@/lib/page/fixtures");
    const { toCents } = load<typeof import("@/lib/finance/lite/cents")>("@/lib/finance/lite/cents");
    type Sel = import("@/lib/orders/manual").ManualOrderInput["selection"];
    type FixtureName = import("@/lib/page/fixtures").FixtureName;

    /** a published page of `store` with the fixture as its published version */
    async function livePageOf(storeId: string, name: FixtureName): Promise<{ pageId: string; key: string; versionId: string }> {
      const doc = getFixture(name, { locale: "fr" }).doc;
      const pageId = newId();
      const versionId = newId();
      const key = `pk${randomBytes(10).toString("hex")}`;
      await db.insert(S.pages).values({ id: pageId, storeId, slug: `${name}-${pageId.slice(-6).toLowerCase()}`, name, status: "published", locale: "fr", publicKey: key, draft: doc, publishedVersionId: versionId });
      await db.insert(S.pageVersions).values({ id: versionId, storeId, pageId, kind: "publish", doc, checksum: "0".repeat(64), runtimeV: 2 });
      return { pageId, key, versionId };
    }
    const customer = (phone: string) => ({ name: "Salma Bennani", phone, city: "Casablanca", address: "Rue 12 Maarif" });
    const input = (pageId: string, sel: Sel, phone: string, more: Partial<import("@/lib/orders/manual").ManualOrderInput> = {}) => ({
      pageId,
      selection: sel,
      customer: customer(phone),
      confirmed: false,
      idem: randomUUID(),
      ...more,
    });
    const selOf = (offerId: string, units: Sel["units"] = []): Sel => ({ offerId, units, extras: {}, bump: false });
    const dataOf = <T>(r: { ok: boolean; data?: T }) => (r.ok ? (r as { data: T }).data : null);

    // OP-08 parity: the manual total equals the public path's total for the test:offers fixtures (duo, tshirt, colors)
    const vectors: [FixtureName, Sel][] = [
      ["duo", selOf("duo")],
      ["duo", selOf("trio")],
      ["tshirt", selOf("x1", [{ o: { "g-fit": "d-col=o-noir|d-size=o-m" }, f: {} }])],
      ["tshirt", selOf("x2", [{ o: { "g-fit": "d-col=o-noir|d-size=o-m" }, f: {} }, { o: { "g-fit": "d-col=o-noir|d-size=o-m" }, f: {} }])],
      ["colors", selOf("colors", [{ o: { "g-fit": "d-size=o-m" }, f: {} }, { o: { "g-fit": "d-size=o-l" }, f: {} }, { o: { "g-fit": "d-size=o-s" }, f: {} }])],
    ];
    const pagesOf = new Map<FixtureName, Awaited<ReturnType<typeof livePageOf>>>();
    const parityOk = new Set<FixtureName>();
    for (const [name, sel] of vectors) {
      if (!pagesOf.has(name)) pagesOf.set(name, await livePageOf(STORE_A, name));
      const page = pagesOf.get(name)!;
      const m = await M.createManualOrder(owner, input(page.pageId, sel, freshPhone()));
      const shown = dataOf(m) ? toCents((await rowOf(dataOf(m)!.orderId)).total) : 0;
      const target = await resolvePublicTarget(page.key);
      const pub = target
        ? await createOrder(
            { v: 2, pageKey: page.key, idem: randomUUID(), eventId: `evt_${randomBytes(6).toString("hex")}`, bundleId: sel.offerId, bump: sel.bump, name: "Salma Bennani", phone: freshPhone(), city: "Casablanca", address: "Rue 12 Maarif", t: 9000, utm: {}, ver: page.versionId, st: shown, units: sel.units, extras: sel.extras },
            { ip: `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`, ua: "Mozilla/5.0 (parity)", target },
          )
        : null;
      const pubId = pub?.response.ok ? (pub.response as { orderId: string }).orderId : null;
      const mid = dataOf(m)?.orderId;
      if (!mid || !pubId) {
        ok(`parity ${name}/${sel.offerId}: both paths accept the selection (or both refuse it)`, !mid && !pubId, { manual: m, public: pub?.response });
        continue;
      }
      const [mr, pr] = [await rowOf(mid), await rowOf(pubId)];
      eq(`parity ${name}/${sel.offerId}: manual total = public total (cents), same items`, [toCents(mr.total), JSON.stringify(mr.items)], [toCents(pr.total), JSON.stringify(pr.items)]);
      parityOk.add(name);
      if (name === "duo" && sel.offerId === "duo") {
        eq("manual row: source, risk 0, flag manual, creator, store currency and locale, sheet pending, not a test", [mr.source, mr.riskScore, mr.flags, mr.createdBy, mr.currency, mr.locale, mr.sheetStatus, mr.isTest], ["manual", 0, ["manual"], U.ownerA.id, rowA.currency, rowA.defaultLocale, "pending", false]);
        eq("manual row: one created event, by the creator, source manual", (await eventsOf(mid, "created")).map((e) => [e.actorKind, e.actorId, (e.meta as { source?: string }).source]), [["user", U.ownerA.id, "manual"]]);
      }
    }
    eq("parity: every fixture has at least one accepted vector", [...parityOk].sort(), ["colors", "duo", "tshirt"]);

    const duo = pagesOf.get("duo")!;
    // idempotency (OD36): a replayed idem answers the first order, nothing new
    {
      const i = input(duo.pageId, selOf("duo"), freshPhone(), { confirmed: true });
      const first = dataOf(await M.createManualOrder(owner, i));
      const again = dataOf(await M.createManualOrder(owner, i));
      ok("a replayed idem answers the first order with replayed: true", !!first && !!again && again.orderId === first.orderId && again.replayed === true, { first, again });
      const fr = await rowOf(first!.orderId);
      eq("confirmed: the creator is confirmed_by, to_pack", [fr.confirmState, fr.shipState, fr.confirmedBy], ["confirmed", "to_pack", U.ownerA.id]);
    }
    // a page of another store, a draft page, an unknown offer
    {
      const bPage = await livePageOf(STORE_B, "duo");
      const other = await M.createManualOrder(owner, input(bPage.pageId, selOf("duo"), freshPhone()));
      eq("another store's page: not_found", other.ok ? "ok" : other.error, "not_found");
      const bad = await M.createManualOrder(owner, input(duo.pageId, selOf("nope"), freshPhone()));
      ok("an unknown offer: invalid with the field error (bundleId)", !bad.ok && bad.error === "invalid" && (bad as { fields?: Record<string, string> }).fields?.bundleId === "invalid", bad);
      const q = await M.quoteManualOrder(owner, input(duo.pageId, selOf("trio"), ""));
      const qd = dataOf(q);
      ok("quote without a phone: the server's lines and total, the phone field error", !!qd && qd.totalCents === 34900 && qd.lines.length >= 1 && qd.fields?.phone === "required", q);
    }
    // blocked, duplicate, adjustment
    {
      const p = freshPhone();
      const first = dataOf(await M.createManualOrder(owner, input(duo.pageId, selOf("duo"), p)));
      const dup = await M.createManualOrder(owner, input(duo.pageId, selOf("duo"), p));
      ok("same phone, open order: duplicate with the ids", !dup.ok && dup.error === "duplicate" && JSON.stringify((dup as { duplicates?: { id: string }[] }).duplicates?.map((d) => d.id)) === JSON.stringify([first?.orderId]), dup);
      ok("allowDuplicate: created", (await M.createManualOrder(owner, input(duo.pageId, selOf("duo"), p, { allowDuplicate: true }))).ok);
      const pb = freshPhone();
      await AD.blockPhone(A, pb, "MA", "test", owner.actor);
      const blocked = await M.createManualOrder(owner, input(duo.pageId, selOf("duo"), pb));
      ok("a blocked number: blocked, with the staff sentence", !blocked.ok && blocked.error === "blocked" && (blocked as { text?: string }).text === "This number is blocked in your store", blocked);
      const agentAdj = await M.createManualOrder(agent, input(duo.pageId, selOf("duo"), freshPhone(), { adjustCents: -1000, adjustReason: "remise fidèle" }));
      eq("an agent's adjustment: forbidden", agentAdj.ok ? "ok" : agentAdj.error, "forbidden");
      eq("an adjustment without a reason: reason_required", ((r) => (r.ok ? "ok" : r.error))(await M.createManualOrder(owner, input(duo.pageId, selOf("duo"), freshPhone(), { adjustCents: -1000 }))), "reason_required");
      eq("an adjustment below −subtotal: bad_adjust", ((r) => (r.ok ? "ok" : r.error))(await M.createManualOrder(owner, input(duo.pageId, selOf("duo"), freshPhone(), { adjustCents: -30000, adjustReason: "trop" }))), "bad_adjust");
      const adj = dataOf(await M.createManualOrder(owner, input(duo.pageId, selOf("duo"), freshPhone(), { adjustCents: -1000, adjustReason: "remise fidèle" })));
      const ar = adj ? await rowOf(adj.orderId) : null;
      eq("a manager's adjustment: total = subtotal + shipping − 10.00", ar && [toCents(ar.total), ar.adjustCents], [23900, -1000]);
      const agentOwn = dataOf(await M.createManualOrder(agent, input(duo.pageId, selOf("duo"), freshPhone(), { confirmed: true })));
      const ao = agentOwn ? await rowOf(agentOwn.orderId) : null;
      eq("an agent's order stays theirs and is confirmed by them", ao && [ao.assigneeId, ao.confirmState, ao.confirmedBy], [U.agentA.id, "confirmed", U.agentA.id]);
    }
    // editOrder (OPE-§11.3): re-price, locks, in-transit contact edits
    {
      const created = dataOf(await M.createManualOrder(owner, input(duo.pageId, selOf("duo"), freshPhone())))!;
      const r0 = await rowOf(created.orderId);
      await db.update(S.orders).set({ sheetDirty: 0 }).where(deq(S.orders.id, created.orderId));
      const e1 = await ED.editOrder(owner, created.orderId, { selection: { ...selOf("trio") } }, r0.rev);
      const d1 = dataOf(e1);
      ok("edit lines: re-priced by the engine (trio 349.00), rev + 1, priced with the order's version", !!d1 && d1.totalCents === 34900 && d1.rev === r0.rev + 1 && d1.pricedWith === "order_version", e1);
      const r1 = await rowOf(created.orderId);
      eq("edit lines: the row's money, qty and sheet bit 4", [toCents(r1.total), r1.qty, r1.sheetDirty & 4, r1.rev], [34900, 3, 4, r0.rev + 1]);
      const fe = await eventsOf(created.orderId, "field_edited");
      eq("edit lines: one field_edited with items and total before / after", fe.map((e) => (e.meta as { fields: { f: string }[] }).fields.map((f) => f.f)), [["items", "total"]]);
      eq("a stale rev: conflict", ((r) => (r.ok ? "ok" : r.error))(await ED.editOrder(owner, created.orderId, { note: "x" }, r0.rev)), "conflict");
      // phone change: E.164 stored in the event, the customer link moved
      const np = freshPhone();
      const e2 = dataOf(await ED.editOrder(owner, created.orderId, { phone: `0${np.slice(4)}` }, r1.rev));
      const r2 = await rowOf(created.orderId);
      ok("phone edit: normalised with the store market, the customer moved", !!e2 && r2.phone === np && r2.customerId !== r1.customerId && !!r2.customerId, { e2, phone: r2.phone });
      const tl = await E.orderTimeline(A, owner, created.orderId);
      ok("the timeline renders the edited phone masked", !JSON.stringify(tl).includes(np.slice(4)), tl.items[0]);
      // shipped: only address / landmark / note, with inTransit
      await T.applyExternalStatus(A, created.orderId, { legacy: "shipped" }, { kind: "sheet", ref: "row:99" });
      const r3 = await rowOf(created.orderId);
      eq("shipped: lines locked", ((r) => (r.ok ? "ok" : r.error))(await ED.editOrder(owner, created.orderId, { selection: selOf("duo") }, r3.rev)), "locked");
      eq("shipped: the phone locked", ((r) => (r.ok ? "ok" : r.error))(await ED.editOrder(owner, created.orderId, { phone: freshPhone() }, r3.rev)), "locked");
      const t1 = await ED.editOrder(owner, created.orderId, { address: "Rue 40 Gauthier", landmark: "près de la pharmacie" }, r3.rev);
      ok("shipped: address and landmark accepted, inTransit", t1.ok && t1.data.inTransit === true, t1);
      const last = (await eventsOf(created.orderId, "field_edited")).at(-1)!;
      eq("the in-transit event carries inTransit: true", (last.meta as { inTransit?: boolean }).inTransit, true);
      // recall (OPS-21) and the warehouse tick
      eq("recall on a shipped order", await ED.requestRecall(owner, created.orderId, "changed_mind"), { ok: true, changed: true });
      eq("recall again: no second event", await ED.requestRecall(owner, created.orderId, "changed_mind"), { ok: true, changed: false });
      eq("carrier notified", await ED.markCarrierNotified(owner, created.orderId), { ok: true, changed: true });
      eq("recall events", (await eventsOf(created.orderId, "recall_requested")).map((e) => e.meta), [{ reason: "changed_mind", carrierNotified: false }, { reason: "changed_mind", carrierNotified: true }]);
      const fresh = dataOf(await M.createManualOrder(owner, input(duo.pageId, selOf("duo"), freshPhone())))!;
      eq("recall on a pre-ship order: illegal", await ED.requestRecall(owner, fresh.orderId, "changed_mind"), { ok: false, error: "illegal" });
      // another store
      eq("editOrder from B with A's id: not_found", ((r) => (r.ok ? "ok" : r.error))(await ED.editOrder(ownerBCtx, created.orderId, { note: "x" }, r3.rev)), "not_found");
    }
    // the hold (OD49) and tracking (OD55)
    {
      const c = dataOf(await M.createManualOrder(owner, input(duo.pageId, selOf("duo"), freshPhone(), { confirmed: true })))!;
      eq("a hold beyond 60 days: bad_hold", await ED.setOrderHold(owner, c.orderId, new Date(Date.now() + 61 * 86_400_000)), { ok: false, error: "bad_hold" });
      eq("a hold in the past: bad_hold", await ED.setOrderHold(owner, c.orderId, new Date(Date.now() - 60_000)), { ok: false, error: "bad_hold" });
      const at = new Date(Date.now() + 5 * 86_400_000);
      const h = await ED.setOrderHold(owner, c.orderId, at);
      ok("a hold in 5 days: set, with hold_set", h.ok && h.changed && (await rowOf(c.orderId)).shipAfter?.getTime() === at.getTime() && (await eventsOf(c.orderId, "hold_set")).length === 1, h);
      const rm = await ED.setOrderHold(owner, c.orderId, null);
      ok("null removes the hold", rm.ok && (await rowOf(c.orderId)).shipAfter === null, rm);
      const u = dataOf(await M.createManualOrder(owner, input(duo.pageId, selOf("duo"), freshPhone())))!;
      eq("a hold on an unconfirmed order: bad_hold", await ED.setOrderHold(owner, u.orderId, at), { ok: false, error: "bad_hold" });
      const viaCreate = await M.createManualOrderWith(owner, input(duo.pageId, selOf("duo"), freshPhone(), { confirmed: true }), { shipAfter: new Date(Date.now() + 90 * 86_400_000) });
      eq("create with a hold beyond 60 days: bad_hold", viaCreate.ok ? "ok" : viaCreate.error, "bad_hold");
      eq("tracking: forbidden for an agent", ((r) => (r.ok ? "ok" : r.error))(await ED.setOrderTracking(agent, c.orderId, { trackingRef: "AM123" })), "forbidden");
      const tr = dataOf(await ED.setOrderTracking(owner, c.orderId, { trackingRef: "AM123456MA", carrierLabel: "Amana" }));
      const tc = await rowOf(c.orderId);
      ok("tracking: stored, tracking_set, implies packed", !!tr && tr.packed && tc.trackingRef === "AM123456MA" && tc.carrierLabel === "Amana" && tc.shipState === "packed" && (await eventsOf(c.orderId, "tracking_set")).length === 1, { tr, ship: tc.shipState });
    }
    // block and cancel (OP-12, OPE-§9.5)
    {
      const p = freshPhone();
      const o1 = dataOf(await M.createManualOrder(owner, input(duo.pageId, selOf("duo"), p)))!.orderId;
      const o2 = dataOf(await M.createManualOrder(owner, input(duo.pageId, selOf("duo"), p, { confirmed: true, allowDuplicate: true })))!.orderId;
      const o3 = dataOf(await M.createManualOrder(owner, input(duo.pageId, selOf("duo"), p, { allowDuplicate: true })))!.orderId;
      await T.applyExternalStatus(A, o3, { legacy: "shipped" }, { kind: "sheet", ref: "row:100" });
      const ob = await order(B, { phone: p });
      const preview = dataOf(await AD.blockPreview(owner, { orderId: o1 }));
      eq("preview: 2 open orders and 1 shipped, the number masked", preview && [preview.open, preview.shipped, preview.alreadyBlocked, preview.phoneMasked.includes(p.slice(-6))], [2, 1, false, false]);
      eq("an agent may not block", ((r) => (r.ok ? "ok" : r.error))(await AD.blockPhoneAndCancel(agent, { orderId: o1, openOrders: "fake" })), "forbidden");
      const bc = dataOf(await AD.blockPhoneAndCancel(manager, { phone: `0${p.slice(4)}`, openOrders: "fake" }));
      ok("block and cancel: both open orders moved to fake, the shipped one listed untouched", !!bc && bc.moved.every((m) => m.ok) && bc.moved.length === 2 && JSON.stringify(bc.untouched) === JSON.stringify([o3]), bc);
      eq("the open orders are fake, the shipped one stays shipped", [(await rowOf(o1)).confirmState, (await rowOf(o2)).confirmState, (await rowOf(o3)).shipState], ["fake", "fake", "shipped"]);
      ok("events: blocked on each order of the number", (await eventsOf(o1, "blocked")).length === 1 && (await eventsOf(o3, "blocked")).length === 1);
      const bob = await rowOf(ob);
      eq("store B's order of the same number: untouched", [bob.confirmState, (await eventsOf(ob, "blocked")).length], ["new", 0]);
      eq("the number is blocked in A only", (await db.select().from(S.blocklist).where(and(deq(S.blocklist.kind, "phone"), deq(S.blocklist.value, p)))).map((b) => b.storeId), [STORE_A]);
      const p2 = freshPhone();
      const c1 = dataOf(await M.createManualOrder(owner, input(duo.pageId, selOf("duo"), p2)))!.orderId;
      const bc2 = dataOf(await AD.blockPhoneAndCancel(manager, { orderId: c1, openOrders: "cancel" }));
      const c1r = await rowOf(c1);
      ok("openOrders cancel: cancelled with reason blocked", !!bc2 && c1r.confirmState === "cancelled" && c1r.cancelReason === "blocked", { bc2, state: c1r.confirmState, reason: c1r.cancelReason });
    }
    // lead conversion (OPE-§11.4)
    {
      const leadId = newId();
      const lp = freshPhone();
      await db.insert(S.leads).values({ id: leadId, storeId: STORE_A, pageId: duo.pageId, idem: randomUUID(), phone: lp, name: "Nadia Lead", city: "Casablanca", bundleId: "duo", kind: "whatsapp", sel: { v: 2, bundleId: "duo", units: [], extras: {}, bump: false } });
      const conv = { selection: selOf(""), customer: { name: "", phone: "", city: "", address: "Rue 3 Hay Hassani" }, confirmed: false, idem: randomUUID() };
      eq("B converting A's lead: not_found", ((r) => (r.ok ? "ok" : r.error))(await M.convertLeadToOrder(ownerBCtx, leadId, conv)), "not_found");
      const c1 = await M.convertLeadToOrder(owner, leadId, conv);
      const cid = dataOf(c1)?.orderId;
      ok("a WhatsApp lead converts to a whatsapp order pre-filled from the lead", !!cid, c1);
      if (cid) {
        const cr = await rowOf(cid);
        eq("the converted order: source, phone, name, total of the duo", [cr.source, cr.phone, cr.name, toCents(cr.total)], ["whatsapp", lp, "Nadia Lead", 24900]);
        eq("the created event carries the lead id", (await eventsOf(cid, "created")).map((e) => (e.meta as { leadId?: string }).leadId), [leadId]);
        const lead = (await db.select().from(S.leads).where(deq(S.leads.id, leadId)))[0]!;
        // P3's markLeadConverted (merged): an agent's conversion is a recovery (LAN-§10.4); its phone match never pre-empts it
        eq("the lead: converted by an agent (a recovery)", [lead.convertedOrderId, lead.convertedVia, lead.status], [cid, "agent", "recovered"]);
      }
      const again = await M.convertLeadToOrder(owner, leadId, { ...conv, idem: randomUUID() });
      ok("a second conversion: already_converted with the order id", !again.ok && again.error === "already_converted" && (again as { orderId?: string }).orderId === cid, again);
    }
  }

  /* ================================================================ */
  section = "list";
  {
    const V = load<typeof import("@/lib/callcenter/views")>("@/lib/callcenter/views");
    const Q = load<typeof import("@/lib/orders/queue")>("@/lib/orders/queue");
    const viewerOfCtx = AD.listViewerOf;
    // the agent predicate (OD12): the agent's list is their own orders, whatever the query says
    const mineA = await order(A, { name: "Agent Owned" });
    const notMine = await order(A, { name: "Pool Order" });
    ok("assign one order to the agent", (await Q.assignOrders(manager, [mineA], U.agentA.id)).ok);
    const agentList = await AD.listOrders(A, { viewer: viewerOfCtx(agent) }, { pageSize: 200 });
    ok("listOrders with an agent viewer: only the agent's orders", agentList.items.some((r) => r.id === mineA) && !agentList.items.some((r) => r.id === notMine), agentList.items.map((r) => r.id));
    const agentAsks = await AD.listOrders(A, { viewer: viewerOfCtx(agent), assignee: "none" }, { pageSize: 200 });
    ok(
      "an agent asking for the pool gets only pool orders they confirmed (the predicate is server-side)",
      agentAsks.items.every((r) => r.assigneeId === null && r.confirmedBy === U.agentA.id) && !agentAsks.items.some((r) => r.id === notMine),
      agentAsks.items.map((r) => [r.id, r.assigneeId, r.confirmedBy]),
    );
    const mgrList = await AD.listOrders(A, { viewer: viewerOfCtx(manager) }, { pageSize: 200 });
    ok("a manager sees every order", mgrList.items.some((r) => r.id === notMine) && mgrList.items.some((r) => r.id === mineA));
    const row = mgrList.items.find((r) => r.id === mineA)!;
    const full = (await rowOf(mineA)).phone;
    ok("list rows: the phone masked, no address / note / e-mail key", !row.phoneMasked.includes(full.slice(-6)) && !("address" in row) && !("note" in row) && !("email" in row) && !("phone" in row), row);
    // keyset paging: two pages of 2, no overlap, the cursor of the last page is null
    const p1 = await AD.listOrders(A, {}, { pageSize: 2 });
    const p2 = await AD.listOrders(A, {}, { pageSize: 2, after: p1.next ?? undefined });
    ok("keyset: page 2 follows page 1 without overlap, total only on the first page", !!p1.next && p2.items.length === 2 && p2.items.every((r) => !p1.items.some((x) => x.id === r.id)) && p1.total > 4 && p2.total === 0, { p1: p1.items.map((r) => r.id), p2: p2.items.map((r) => r.id), t: [p1.total, p2.total] });
    const byPrio = await AD.listOrders(A, { sort: "priority_desc" }, { pageSize: 3 });
    const byPrio2 = await AD.listOrders(A, { sort: "priority_desc" }, { pageSize: 3, after: byPrio.next ?? undefined });
    ok("keyset on priority: descending across pages", [...byPrio.items, ...byPrio2.items].every((r, i, a) => i === 0 || a[i - 1]!.priority >= r.priority), [...byPrio.items, ...byPrio2.items].map((r) => r.priority));

    // holds (OD49): a held order is out of To pack and of the Carrier CSV, and in On hold
    const shipNow = await order(A, { name: "Ready Ship" });
    const shipPhone = (await rowOf(shipNow)).phone;
    const heldO = await order(A, { name: "Held Ship" });
    ok("confirm the ready order", (await T.transitionOrder(T.actorFrom(manager), A, { orderId: shipNow, want: { confirm: "confirmed" }, source: "ui" })).ok);
    const hold = await T.transitionOrder(T.actorFrom(manager), A, { orderId: heldO, want: { confirm: "confirmed" }, source: "ui", shipAfter: new Date(Date.now() + 3 * 86_400_000) });
    ok("confirm the held order with a hold", hold.ok && (await rowOf(heldO)).shipState === "to_pack" && !!(await rowOf(heldO)).shipAfter, hold);
    const toPack = (await AD.listOrders(A, { view: "to_pack" }, { pageSize: 200 })).items.map((r) => r.id);
    const onHold = (await AD.listOrders(A, { view: "on_hold" }, { pageSize: 200 })).items.map((r) => r.id);
    ok("To pack lists the ready order, not the held one", toPack.includes(shipNow) && !toPack.includes(heldO), toPack);
    ok("On hold lists the held order only", onHold.includes(heldO) && !onHold.includes(shipNow), onHold);
    eq("the On hold row carries its Ship from", (await AD.listOrders(A, { view: "on_hold" }, { pageSize: 200 })).items.find((r) => r.id === heldO)?.shipAfter, (await rowOf(heldO)).shipAfter!.toISOString());

    // the Carrier CSV (OP-16, OD55)
    eq("no column list yet: not_configured", ((r) => (r.ok ? "ok" : r.error))(await AD.carrierExport(manager, [shipNow])), "not_configured");
    const saved = await AD.saveCarrierCsvColumns(manager, { columns: [{ header: "Tel", source: "phone" }, { header: "Montant", source: "cod_amount" }, { header: "Ref", source: "order_id" }], delimiter: ";" });
    ok("saveCarrierCsvColumns stores ops.carrierCsv (markPacked on by default)", saved.ok && (await getStoreSetting(A, "ops")).carrierCsv?.markPacked === true, saved);
    eq("an agent may not save the columns", ((r) => (r.ok ? "ok" : r.error))(await AD.saveCarrierCsvColumns(agent, { columns: [{ header: "X", source: "qty" }] })), "forbidden");
    const refused = await AD.carrierExport(manager, [shipNow, heldO]);
    ok("a held order in the selection: refused with its id, nothing written", !refused.ok && refused.error === "refused" && JSON.stringify(refused.held) === JSON.stringify([heldO]) && (await eventsOf(shipNow, "manifest_exported")).length === 0, refused);
    const part = await AD.carrierExport(manager, [shipNow, heldO], { partial: true });
    ok("partial: the ready order exported, the held one listed as refused", part.ok && JSON.stringify(part.exported) === JSON.stringify([shipNow]) && JSON.stringify(part.refused.held) === JSON.stringify([heldO]), part);
    if (part.ok) {
      ok("the file: the BOM, the headers, national digits and the decimal comma", part.csv.startsWith("\uFEFFTel;Montant;Ref\r\n") && part.csv.includes(`0${shipPhone.slice(4)};249,90;${shipNow}`), part.csv);
    }
    eq("the exported order moved to packed, once, with manifest_exported", [(await rowOf(shipNow)).shipState, (await eventsOf(shipNow, "manifest_exported")).map((e) => e.meta)], ["packed", [{ why: "manifest" }]]);
    const again = await AD.carrierExport(manager, [shipNow]);
    ok("a second export: no second move on the axis, one more manifest_exported", again.ok && again.packed.length === 0 && (await rowOf(shipNow)).shipState === "packed" && (await eventsOf(shipNow, "manifest_exported")).length === 2, again);
    ok("the held order: still to_pack, no event", (await rowOf(heldO)).shipState === "to_pack" && (await eventsOf(heldO, "manifest_exported")).length === 0);
    await AD.saveCarrierCsvColumns(ownerBCtx, { columns: [{ header: "Ref", source: "order_id" }] });
    const fromB = await AD.carrierExport(ownerBCtx, [shipNow], { partial: true });
    ok("B exporting A's ids: refused as not found, never exported", !fromB.ok && fromB.error === "refused" && JSON.stringify(fromB.notFound) === JSON.stringify([shipNow]) && (await eventsOf(shipNow, "manifest_exported")).length === 2, fromB);
    const slips = await AD.slipsFor(manager, [heldO, shipNow]);
    ok("slips: held orders last, masked phones, the warehouse text", slips.map((s) => s.id).join() === `${shipNow},${heldO}` && slips[1]!.held && slips.every((s) => !s.phoneMasked.includes(shipPhone.slice(-6))) && slips[0]!.items.length > 0, slips);

    // bulk (OPE-§12.4): 200 ids, per-order results; 201 refused
    const many: string[] = [];
    for (let i = 0; i < 198; i++) many.push(await order(A, { name: `Bulk ${i}` }));
    const bOrder = await order(B);
    const ids200 = [...many, bOrder, "CMD-NOPE0000"];
    const idem = randomUUID();
    const bm = await AD.bulkMove(manager, ids200, { want: { confirm: "attempting" } }, { idem });
    ok("bulkMove on 200 ids: 198 moved, B's id and a missing one not_found", bm.ok && bm.data.ok.length === 198 && bm.data.failed.length === 2 && bm.data.failed.every((f) => f.error === "not_found") && !!bm.data.undo, bm.ok ? { ok: bm.data.ok.length, failed: bm.data.failed } : bm);
    eq("B's order untouched", (await rowOf(bOrder)).confirmState, "new");
    const replay = await AD.bulkMove(manager, ids200, { want: { confirm: "attempting" } }, { idem });
    ok("an idem replay returns the stored result and writes nothing", replay.ok && replay.data.replayed === true && replay.data.ok.length === 198 && (await eventsOf(many[0]!, "state_changed")).length === 1, replay.ok ? replay.data.ok.length : replay);
    eq("201 ids refused", ((r) => (r.ok ? "ok" : r.error))(await AD.bulkMove(manager, [...ids200, "CMD-NOPE0001"], { legacy: "confirmed" })), "invalid");
    eq("an agent may not bulk assign", ((r) => (r.ok ? "ok" : r.error))(await AD.bulkAssign(agent, [many[0]!], null)), "forbidden");
    const pin = await AD.bulkPin(manager, [many[0]!, many[1]!, bOrder], true);
    ok("bulkPin: ≥ 1000, B's id not_found", pin.ok && (await rowOf(many[0]!)).priority >= 1000 && pin.data.failed.length === 1 && pin.data.failed[0]!.id === bOrder, pin);
    const asg = await AD.bulkAssign(manager, [many[2]!, bOrder], U.agentA.id);
    ok("bulkAssign: per-order results", asg.ok && JSON.stringify(asg.data.ok) === JSON.stringify([many[2]]) && asg.data.failed[0]?.id === bOrder, asg);

    // undo (OPE-§12.5): only while rev is unchanged, within the window
    const u1 = await order(A);
    const mv = await AD.bulkMove(manager, [u1], { legacy: "confirmed" });
    const tok = mv.ok ? mv.data.undo : null;
    ok("a move answers an undo token", !!tok && (await rowOf(u1)).confirmState === "confirmed" && (await rowOf(u1)).confirmedBy === U.managerA.id);
    eq("another member's token: expired", ((r) => (r.ok ? "ok" : r.error))(await AD.undoMove(owner, tok!)), "expired");
    const und = await AD.undoMove(manager, tok!);
    const ur = await rowOf(u1);
    ok("undo within the window: the exact previous state, rev bumped", und.ok && JSON.stringify(und.data.ok) === JSON.stringify([u1]) && ur.confirmState === "new" && ur.shipState === "none" && ur.confirmedBy === null && ur.confirmedAt === null && ur.status === "new", { und, ur: [ur.confirmState, ur.shipState, ur.confirmedBy, ur.status] });
    const sc = await eventsOf(u1, "state_changed");
    ok("compensating state_changed events with meta.undo, and one undo event", sc.filter((e) => (e.meta as { undo?: boolean }).undo).length >= 1 && (await eventsOf(u1, "undo")).length === 1, sc.map((e) => [e.fromState, e.toState, e.meta]));
    eq("a token is single-use", ((r) => (r.ok ? "ok" : r.error))(await AD.undoMove(manager, tok!)), "expired");
    const u2 = await order(A);
    const mv2 = await AD.bulkMove(manager, [u2], { legacy: "confirmed" });
    await T.transitionOrder(T.actorFrom(owner), A, { orderId: u2, want: { ship: "packed" }, source: "ui" });
    const und2 = await AD.undoMove(manager, mv2.ok ? mv2.data.undo! : "");
    ok("undo after someone else changed the order: conflict, nothing restored", und2.ok && und2.data.failed[0]?.error === "conflict" && (await rowOf(u2)).shipState === "packed", und2);
    const u3 = await order(A);
    const mv3 = await AD.bulkMove(manager, [u3], { legacy: "confirmed" });
    const realNow = Date.now;
    Date.now = () => realNow() + 10_000;
    const und3 = await AD.undoMove(manager, mv3.ok ? mv3.data.undo! : "");
    Date.now = realNow;
    ok("undo 10 s later: still restored", und3.ok && und3.data.ok[0] === u3 && (await rowOf(u3)).confirmState === "new", und3);
    const u4 = await order(A);
    const mv4 = await AD.bulkMove(manager, [u4], { legacy: "confirmed" });
    Date.now = () => realNow() + 16_000;
    const und4 = await AD.undoMove(manager, mv4.ok ? mv4.data.undo! : "");
    Date.now = realNow;
    ok("undo after the window: expired, the move stays", !und4.ok && und4.error === "expired" && (await rowOf(u4)).confirmState === "confirmed", und4);
    const single = await AD.moveWithUndo(manager, u4, "cancelled", undefined, { reason: "other" });
    ok("a single Move to… answers its own undo token", single.ok && !!single.undo, single);

    // saved views (OPE-§12.2, §L)
    const sv = await AD.saveView(agent, { name: "  Mes rappels  ", query: { view: "callbacks" } });
    ok("a personal view (any member), the name trimmed", sv.ok && (await AD.listSavedViews(agent)).some((v) => v.name === "Mes rappels" && !v.shared && v.mine), sv);
    eq("an agent may not share a view", ((r) => (r.ok ? "ok" : r.error))(await AD.saveView(agent, { name: "Team", query: {}, shared: true })), "forbidden");
    eq("an invalid query refused", ((r) => (r.ok ? "ok" : r.error))(await AD.saveView(manager, { name: "Bad", query: { confirm: ["sold" as never] } })), "invalid");
    const shared = await AD.saveView(manager, { name: "Fès to pack", query: { view: "to_pack", cityKey: "fes" }, shared: true });
    ok("a shared view by a manager is listed for the agent", shared.ok && (await AD.listSavedViews(agent)).some((v) => v.name === "Fès to pack" && v.shared && !v.mine), shared);
    eq("the agent cannot delete the shared view", ((r) => (r.ok ? "ok" : r.error))(await AD.deleteView(agent, shared.ok ? shared.data.id : "")), "not_found");
    for (let i = 0; i < 29; i++) await AD.saveView(owner, { name: `V${i}`, query: {} });
    eq("the 30th personal view saves", ((r) => (r.ok ? "ok" : r.error))(await AD.saveView(owner, { name: "V29", query: {} })), "ok");
    eq("the 31st refused", ((r) => (r.ok ? "ok" : r.error))(await AD.saveView(owner, { name: "V30", query: {} })), "limit");
    eq("B never sees A's views", (await AD.listSavedViews(ownerBCtx)).length, 0);
    void V;

    // the store export ZIP writers (PL-09, OPE-§27.4)
    const Z = load<typeof import("@/lib/orders/export-zip")>("@/lib/orders/export-zip");
    const zipOrder = await order(A, { name: "Zip Canary" });
    const CANARY_CAPI = "CANARY-CAPI-CTX-9Z";
    await db.update(S.orders).set({ capiCtx: CANARY_CAPI }).where(deq(S.orders.id, zipOrder));
    const CANARY_TG = "123456789:CANARYtelegramTOKENxxxxxxxxxxxxx";
    await setStoreSetting(A, "telegram", { enabled: true, botToken: CANARY_TG, chatId: "-1001234567", pii: "masked" }, { id: U.ownerA.id, ip: null });
    const files: Record<string, string> = {};
    for (const w of Z.EXPORT_ZIP_WRITERS) files[w.file] = await Z.writeZipCsv(A, w.file);
    const zipPhone = (await rowOf(zipOrder)).phone;
    ok("orders.csv: the full phone and the appended columns", files["orders.csv"]!.includes(zipPhone) && files["orders.csv"]!.split("\r\n")[0]!.endsWith("Delivery attempts"), files["orders.csv"]!.slice(0, 400));
    ok("the five files exist with their headers", Object.keys(files).length === 5 && Object.values(files).every((f) => f.startsWith("\uFEFF")), Object.keys(files));
    ok("customers.csv lists the store's customers, order_events.csv the meta as JSON", files["customers.csv"]!.includes(zipPhone) && files["order_events.csv"]!.includes('"{""axis"":'), files["order_events.csv"]!.slice(0, 300));
    const leaked = Object.entries(files).filter(([, f]) => f.includes(CANARY_CAPI) || f.includes(CANARY_TG) || f.includes("CANARYtelegram"));
    eq("no capi_ctx, Telegram token, carrier credential or webhook secret canary in any file", leaked.map(([k]) => k), []);
    const bPhone = (await rowOf(bOrder)).phone;
    ok("A's export carries nothing of B", Object.values(files).every((f) => !f.includes(bOrder) && !f.includes(bPhone)));

    // delete test orders (SF-05, OPE-§26)
    const tp = freshPhone();
    const oldTest = await order(A, { phone: tp, test: true });
    const newTest = await order(A, { phone: tp, test: true });
    const oldReal = await order(A, { phone: tp });
    const past = new Date(Date.now() - 2 * 3_600_000);
    await db.update(S.orders).set({ createdAt: past }).where(deq(S.orders.id, oldTest));
    await db.update(S.orders).set({ createdAt: past }).where(deq(S.orders.id, oldReal));
    const bTest = await order(B, { test: true });
    await db.update(S.orders).set({ createdAt: past }).where(deq(S.orders.id, bTest));
    eq("an agent may not delete test orders", ((r) => (r.ok ? "ok" : r.error))(await AD.deleteTestOrdersNow(agent)), "forbidden");
    const del = await AD.deleteTestOrdersNow(owner);
    ok("delete test orders: only the store's is_test rows older than 1 h", del.ok && del.data.deleted === 1, del);
    const left = await db.select({ id: S.orders.id }).from(S.orders).where(sql`${S.orders.id} IN (${oldTest}, ${newTest}, ${oldReal}, ${bTest})`);
    eq("the old test order is gone; the fresh test order, the real one and B's stay", left.map((r) => r.id).sort(), [newTest, oldReal, bTest].sort());
    eq("its events are gone", (await eventsOf(oldTest)).length, 0);
    eq("test_count recomputed", (await customerOf(tp))?.testCount, 1);
    const audits = await db.select().from(S.auditLog).where(and(deq(S.auditLog.storeId, STORE_A), deq(S.auditLog.action, "orders.test_deleted")));
    eq("audit orders.test_deleted { count }", audits.map((a) => (a.meta as { count?: number } | null)?.count), [1]);
    eq("housekeeping's signature: deleteTestOrders(scope, { olderThan, limit })", await AD.deleteTestOrders(A, { olderThan: new Date(Date.now() - 3_600_000), limit: 10 }), { deleted: 0 });

  }

  /* ================================================================ */
  section = "insights";
  {
    // P4 step 7 (OP-10, OP-11, SF-11, SF-01, UX-02, OPE-§14.4 acceptance): the rollup, queueCounts, the aggregates on a
    // 50,000-order store, returnReasonMix, the sheet-label backfill, the ⌘K provider and the calling-window save
    const KS = load<typeof import("@/lib/callcenter/kpis.server")>("@/lib/callcenter/kpis.server");
    const AG = load<typeof import("@/lib/callcenter/aggregates")>("@/lib/callcenter/aggregates");
    const LB = load<typeof import("@/lib/callcenter/labels")>("@/lib/callcenter/labels");
    const ST = load<typeof import("@/lib/callcenter/settings.server")>("@/lib/callcenter/settings.server");
    const PR = load<typeof import("@/lib/orders/profile")>("@/lib/orders/profile");
    const IS = load<typeof import("@/lib/callcenter/insights-sql")>("@/lib/callcenter/insights-sql");
    const W = load<typeof import("@/lib/callcenter/window")>("@/lib/callcenter/window");
    const { callingWindowFor } = load<typeof import("@/lib/callcenter/window.server")>("@/lib/callcenter/window.server");
    const { provider } = load<typeof import("@/lib/admin-data/search/ops")>("@/lib/admin-data/search/ops");
    const tz = (await callingWindowFor(A)).tz;
    const today = W.storeYmd(new Date(), tz);

    // ---- the rollup (OPE-§14.4): an agent's moves two days ago, a late final on the confirming agent, an abandonment
    const day2 = W.addDaysYmd(today, -2);
    const back = (ids: string[], days: number) =>
      sql`UPDATE order_events SET at = at - INTERVAL ${days} DAY WHERE store_id = ${STORE_A} AND order_id IN (${sql.join(
        ids.map((i) => sql`${i}`),
        sql`, `,
      )})`;
    const rolled: string[] = [];
    for (let i = 0; i < 4; i++) {
      const id = await order(A);
      await db.update(S.orders).set({ assigneeId: U.agent2A.id }).where(deq(S.orders.id, id));
      const want = i < 3 ? "confirmed" : "cancelled";
      const r = await T.transitionOrder(T.actorFrom(agent2), A, { orderId: id, want: { confirm: want }, source: "ui", ...(want === "cancelled" ? { reason: "price" } : {}) });
      ok(`rollup seed: ${want} by the agent`, r.ok, r);
      rolled.push(id);
    }
    await E.appendEvents(db, A, [{ orderId: rolled[0]!, actorKind: "user", actorId: U.agent2A.id, type: "released", reasonCode: "lease_expired", meta: { why: "lease_expired" } }]);
    await db.execute(back(rolled, 2));
    await db.update(S.orders).set({ confirmedAt: sql`confirmed_at - INTERVAL 2 DAY` }).where(sql`${S.orders.id} IN (${sql.join(rolled.map((i) => sql`${i}`), sql`, `)})`);
    const res = await KS.rollupAgentStats(A);
    const stored = async () =>
      await db.select().from(S.agentStatsDaily).where(deq(S.agentStatsDaily.storeId, STORE_A)).orderBy(S.agentStatsDaily.day, S.agentStatsDaily.userId);
    const rows = await stored();
    const mine = rows.find((r) => r.userId === U.agent2A.id && r.day === day2);
    ok("rollup: the agent's day two days ago (3 confirmed, 1 cancelled, 4 decided, 1 abandoned)", !!mine && mine.confirmed === 3 && mine.cancelled === 1 && mine.decided === 4 && mine.abandoned === 1, { mine, res });
    // a full recompute of the same days from the events equals the table
    const w = await callingWindowFor(A);
    const bounds = IS.dayBounds(tz, W.addDaysYmd(today, -14), W.addDaysYmd(today, -1));
    const recomputed = (await KS.computeAgentDays(A, bounds, w)).filter((d) => d.decided + d.attempts + d.abandoned + d.claimed + d.reveals + d.callbacks + d.shipped + d.delivered + d.refused + d.returned + d.lost + d.worked > 0);
    eq(
      "rollup: the stored rows equal a full recompute (confirmed, cancelled, decided, abandoned per agent and day)",
      rows.map((r) => [r.userId, r.day, r.confirmed, r.cancelled, r.decided, r.abandoned, r.unreachable]),
      recomputed.map((d) => [d.userId, d.day, d.confirmed, d.cancelled, d.decided, d.abandoned, d.unreachable]),
    );
    // independent recount of the confirmations of that day straight from order_events
    const [direct] = (await db.execute(
      sql`SELECT COUNT(DISTINCT order_id) AS n FROM order_events WHERE store_id = ${STORE_A} AND type = 'state_changed' AND to_state = 'confirmed' AND actor_id = ${U.agent2A.id} AND at >= ${bounds.find((b) => b.ymd === day2)!.from} AND at < ${bounds.find((b) => b.ymd === day2)!.to}`,
    )) as unknown as [{ n: number }[]];
    eq("rollup: the confirmations equal a direct count of the events", mine?.confirmed, Number(direct[0]?.n));
    const before = JSON.stringify(rows);
    await db.delete(S.agentStatsDaily).where(and(deq(S.agentStatsDaily.storeId, STORE_A), deq(S.agentStatsDaily.day, day2)));
    await KS.rollupAgentStats(A);
    eq("rollup: deleting a day's rows and re-running restores them byte for byte", JSON.stringify(await stored()), before);

    // ---- queueCounts equals a recompute on the seeded store (OP-11)
    PR.forgetOrderInsights(A);
    const qc = await PR.queueCounts(A);
    const now = new Date();
    const n = async (where: ReturnType<typeof sql>) => Number(((await db.execute(sql`SELECT COUNT(*) AS n FROM orders WHERE store_id = ${STORE_A} AND ${where}`)) as unknown as [{ n: number }[]])[0][0]?.n ?? 0);
    const expect = {
      toCallNow: await n(sql`confirm_state IN ('new', 'attempting') AND (due_at IS NULL OR due_at <= ${now}) AND (lease_until IS NULL OR lease_until < ${now})`),
      callbacksDue: await n(sql`confirm_state = 'callback' AND due_at <= ${now}`),
      waitingRetry: await n(sql`confirm_state = 'attempting' AND due_at > ${now}`),
      toShip: await n(sql`confirm_state = 'confirmed' AND ship_state IN ('to_pack', 'packed') AND (ship_after IS NULL OR ship_after <= ${now})`),
      holds: await n(sql`confirm_state = 'confirmed' AND ship_state IN ('to_pack', 'packed') AND ship_after > ${now}`),
      deliveryRescue: await n(sql`confirm_state = 'confirmed' AND ship_state = 'attempt_failed'`),
    };
    eq("queueCounts equals a recompute (to call, callbacks, retry, to ship, holds, delivery problems)", { toCallNow: qc.toCallNow, callbacksDue: qc.callbacksDue, waitingRetry: qc.waitingRetry, toShip: qc.toShip, holds: qc.holds, deliveryRescue: qc.deliveryRescue }, expect);
    ok("queueCounts carries every rev 3 field", ["oldestRescueMin", "oldestToShipDays", "nextHoldDay", "inboundLookupsHour", "liveAgents", "firstTouchBreaches", "abandonedToday", "oldestCallbackOverdueMin"].every((k) => k in qc), Object.keys(qc));
    const qcB = await PR.queueCounts(B);
    ok("queueCounts of B never counts A's rows", qcB.toCallNow <= (await db.select({ id: S.orders.id }).from(S.orders).where(deq(S.orders.storeId, STORE_B))).length, qcB);

    // ---- the aggregates on a 50,000-order store (multi-row inserts), honeypot and test rows with a canary
    const STORE_D = "0P4D0000000000000000000004";
    await db.insert(S.stores).values({ id: STORE_D, handle: "ops-d", name: "OPS-D", status: "active", brandSeed: "0123456789abcdef" });
    const Cs = mintScope("member", STORE_D) as WriteScope;
    const CANARY = "Canary Agg-Qx9";
    const CANARY_PHONE = "+212699887766";
    const CITIES = ["casablanca", "rabat", "fes", "marrakech", "tanger", null] as const;
    const CONFIRM = ["new", "confirmed", "confirmed", "confirmed", "cancelled", "unreachable", "fake"] as const;
    const SHIP = ["delivered", "delivered", "refused", "returned", "to_pack"] as const;
    const RET = ["customer_absent", "refused_price", null] as const;
    const t0 = Date.now() - 27 * 86_400_000;
    let seq = 0;
    const seedRow = (i: number) => {
      const confirm = CONFIRM[i % CONFIRM.length]!;
      const ship: (typeof SHIP)[number] | "none" = confirm === "confirmed" ? SHIP[i % SHIP.length]! : "none";
      const honeypot = i % 997 === 0;
      const test = i % 1009 === 0;
      const created = new Date(t0 + ((i * 47_123) % (27 * 86_400_000)));
      return {
        id: `PC-${(seq++).toString(36).toUpperCase().padStart(8, "0")}`,
        storeId: STORE_D,
        pageId: i % 3 === 0 ? "0PAGEC00000000000000000001" : "0PAGEC00000000000000000002",
        source: (i % 10 === 0 ? "manual" : "live") as "manual" | "live",
        name: honeypot || test ? CANARY : "Client Normal",
        phone: honeypot || test ? CANARY_PHONE : `+2126${String(10_000_000 + (i % 9_000_000)).padStart(8, "0")}`,
        city: "Ville",
        cityKey: CITIES[i % CITIES.length] ?? null,
        productName: "Argan",
        items: { bundleId: i % 2 ? "duo" : "solo", bundleLabel: "x", qty: 1, unitPrice: 100, variants: [{}] },
        qty: 1,
        subtotal: 199,
        shipping: 0,
        total: 199,
        currency: "MAD",
        utm: i % 4 === 0 ? null : { utm_campaign: `camp-${i % 3}`, utm_content: `angle-${i % 5}` },
        idem: randomUUID(),
        flags: honeypot ? ["honeypot"] : null,
        isTest: test,
        confirmState: confirm,
        shipState: ship,
        returnReason: ship === "refused" || ship === "returned" ? RET[i % RET.length]! : null,
        finalAt: ship === "delivered" || ship === "refused" || ship === "returned" ? new Date(Math.min(Date.now() - 60_000, created.getTime() + 3 * 86_400_000)) : null,
        createdAt: created,
      };
    };
    const TOTAL = 50_000;
    const seedStart = Date.now();
    for (let i = 0; i < TOTAL; i += 1_000) await db.insert(S.orders).values(Array.from({ length: Math.min(1_000, TOTAL - i) }, (_, k) => seedRow(i + k)));
    // a rare city (3 orders): its cell is suppressed
    await db.insert(S.orders).values([0, 1, 2].map((k) => ({ ...seedRow(7 * k + 1), id: `PC-RARE000${k}`, idem: randomUUID(), cityKey: "ifrane", isTest: false, flags: null })));
    // 20,000 call attempts for attemptStats, multi-row too
    const evRows = Array.from({ length: 20_000 }, (_, i) => ({
      storeId: STORE_D,
      orderId: `PC-${(i * 2).toString(36).toUpperCase().padStart(8, "0")}`,
      at: new Date(Date.now() - ((i * 131_071) % (80 * 86_400_000))),
      actorKind: "user" as const,
      actorId: U.agentA.id,
      type: "call_attempt" as const,
      reasonCode: i % 3 === 0 ? "no_answer" : "reached",
    }));
    for (let i = 0; i < evRows.length; i += 2_000) await db.insert(S.orderEvents).values(evRows.slice(i, i + 2_000));
    console.log(`  insights: seeded ${TOTAL + 3} orders and ${evRows.length} attempts in ${((Date.now() - seedStart) / 1000).toFixed(1)} s`);
    const from = W.addDaysYmd(today, -27);
    // best of 3 for both timings (cache forgotten each time): 8 worktrees share this MariaDB, so one run is noise-bound
    let agg!: Awaited<ReturnType<typeof AG.opsAggregates>>;
    let aggMs = Infinity;
    for (let run = 0; run < 3; run += 1) {
      AG.forgetOpsAggregates(Cs);
      const a0 = performance.now();
      agg = await AG.opsAggregates(Cs, { from, to: today, dims: ["city", "source", "campaign", "angle", "hour", "weekday"] });
      aggMs = Math.min(aggMs, performance.now() - a0);
    }
    // the 400 ms target (OPE-§27.6) assumes a buffer pool that holds the store's rows; XAMPP ships 16 MB, so on such a
    // box the bound is relative: the six dims (two grouped scans run side by side, one of them extracting the utm JSON
    // per row) cost at most 3 plain grouped scans of the same rows (a scan is the floor)
    const [[pool]] = (await db.execute(sql`SELECT @@innodb_buffer_pool_size AS b`)) as unknown as [[{ b: number }]];
    const smallPool = Number(pool?.b ?? 0) < 256 * 1024 * 1024;
    let scanMs = Infinity;
    for (let run = 0; run < 3; run += 1) {
      const c0 = performance.now();
      await db.execute(sql`SELECT confirm_state, ship_state, COUNT(*) FROM orders WHERE store_id = ${STORE_D} AND created_at >= ${IS.dayBounds(tz, from, from)[0]!.from} AND is_test = 0 AND (flags IS NULL OR flags NOT LIKE '%"honeypot"%') GROUP BY confirm_state, ship_state`);
      scanMs = Math.min(scanMs, performance.now() - c0);
    }
    const aggBound = smallPool ? Math.max(400, 3 * scanMs) : 400;
    console.log(`  insights: opsAggregates ${Math.round(aggMs)} ms, one plain scan ${Math.round(scanMs)} ms, buffer pool ${Math.round(Number(pool?.b ?? 0) / 1048576)} MB, bound ${Math.round(aggBound)} ms`);
    ok("opsAggregates: six dims on 50,000 orders within 400 ms (or 3 plain scans on a small buffer pool)", aggMs <= aggBound, { aggMs: Math.round(aggMs), scanMs: Math.round(scanMs), aggBound: Math.round(aggBound) });
    ok("opsAggregates: cells under 5 orders suppressed and counted (the rare city)", agg.suppressed >= 1 && !agg.cells.city.some((c) => c.key === "ifrane"), { suppressed: agg.suppressed, cities: agg.cells.city.map((c) => c.key) });
    ok("opsAggregates: an order without a city key counts under '*'", agg.cells.city.some((c) => c.key === "*"), agg.cells.city.map((c) => c.key));
    ok("opsAggregates: no canary of a test or honeypot order in any cell", !JSON.stringify(agg).includes(CANARY) && !JSON.stringify(agg).includes(CANARY_PHONE.slice(-6)));
    ok("opsAggregates: hour cells are store hours 0-23, weekday cells ISO 1-7", agg.cells.hour.every((c) => Number(c.key) >= 0 && Number(c.key) <= 23) && agg.cells.weekday.every((c) => Number(c.key) >= 1 && Number(c.key) <= 7) && agg.cells.weekday.length === 7);
    ok("opsAggregates: campaign and angle from orders.utm ('*' = none)", agg.cells.campaign.some((c) => c.key === "camp-1") && agg.cells.angle.some((c) => c.key === "angle-4") && agg.cells.campaign.some((c) => c.key === "*"));
    const [direct2] = (await db.execute(
      sql`SELECT COALESCE(NULLIF(city_key, ''), '*') AS k, COUNT(*) AS n FROM orders WHERE store_id = ${STORE_D} AND is_test = 0 AND (flags IS NULL OR flags NOT LIKE '%"honeypot"%') AND created_at >= ${IS.dayBounds(tz, from, from)[0]!.from} GROUP BY k HAVING n >= 5 ORDER BY k`,
    )) as unknown as [{ k: string; n: number }[]];
    eq("opsAggregates: the city cells equal a direct recount (test and honeypot orders excluded)", [...agg.cells.city].sort((x, y) => x.key.localeCompare(y.key)).map((c) => [c.key, c.placed]), direct2.map((r) => [r.k, Number(r.n)]).sort((x, y) => String(x[0]).localeCompare(String(y[0]))));
    const cmp = await AG.opsAggregates(Cs, { from: W.addDaysYmd(today, -6), to: today, dims: ["source"], compareWith: "previous" });
    ok("opsAggregates: compareWith previous fills the delta", cmp.cells.source.every((c) => !!c.delta && typeof c.delta.prevPlaced === "number"), cmp.cells.source[0]);
    // R2 contract step C2-E (S4 #57): the carrier dim keys on orders.carrier_label ('*' = none), suppressed like the key dims
    const byCarrier = await AG.opsAggregates(Cs, { from, to: today, dims: ["carrier"] });
    const [directCarrier] = (await db.execute(
      sql`SELECT COALESCE(NULLIF(LEFT(carrier_label, 60), ''), '*') AS k, COUNT(*) AS n FROM orders WHERE store_id = ${STORE_D} AND is_test = 0 AND (flags IS NULL OR flags NOT LIKE '%"honeypot"%') AND created_at >= ${IS.dayBounds(tz, from, from)[0]!.from} GROUP BY k HAVING n >= 5 ORDER BY k`,
    )) as unknown as [{ k: string; n: number }[]];
    eq("opsAggregates: the carrier cells equal a direct recount of orders.carrier_label ('*' = none)", [...byCarrier.cells.carrier].sort((x, y) => x.key.localeCompare(y.key)).map((c) => [c.key, c.placed]), directCarrier.map((r) => [r.k, Number(r.n)]).sort((x, y) => String(x[0]).localeCompare(String(y[0]))));
    let threw = false;
    try {
      await AG.opsAggregates(Cs, { from, to: today, dims: ["page", "city", "source", "agent", "offer", "campaign", "angle"] });
    } catch {
      threw = true;
    }
    ok("opsAggregates: more than 6 dims per call is refused", threw);
    AG.forgetOpsAggregates(Cs);
    const s0 = performance.now();
    const att = await AG.attemptStats(Cs);
    const attMs = performance.now() - s0;
    const e0 = performance.now();
    await db.execute(sql`SELECT COUNT(*) FROM order_events e JOIN orders o ON o.store_id = ${STORE_D} AND o.id = e.order_id WHERE e.store_id = ${STORE_D} AND e.type = 'call_attempt' AND o.is_test = 0`);
    const evScanMs = performance.now() - e0;
    const attBound = smallPool ? Math.max(400, 2.5 * evScanMs) : 400;
    console.log(`  insights: attemptStats ${Math.round(attMs)} ms, one plain joined scan ${Math.round(evScanMs)} ms, bound ${Math.round(attBound)} ms`);
    ok("attemptStats: 20,000 attempts within 400 ms (or 2.5 plain scans on a small buffer pool), store-local cells", attMs <= attBound && att.length > 0 && att.every((c) => c.hour >= 0 && c.hour <= 23 && c.weekday >= 1 && c.weekday <= 7), { attMs: Math.round(attMs), evScanMs: Math.round(evScanMs) });
    // order j = 2i carries attempt i; the honeypot (j % 997) and test (j % 1009) orders' attempts never count
    const realAttempts = evRows.filter((_, i) => (2 * i) % 997 !== 0 && (2 * i) % 1009 !== 0).length;
    eq("attemptStats: the cells sum to the real orders' attempts of the last 90 days", att.reduce((s, c) => s + c.attempts, 0), realAttempts);
    // returnReasonMix equals a recompute
    const rmix = await AG.returnReasonMix(Cs, 28);
    const span = IS.spanOf(IS.trailingDays(tz, new Date(), 28));
    const [direct3] = (await db.execute(
      sql`SELECT return_reason AS r, COUNT(*) AS n FROM orders WHERE store_id = ${STORE_D} AND ship_state IN ('refused', 'returned', 'lost') AND final_at >= ${span.from} AND final_at < ${span.to} AND is_test = 0 AND (flags IS NULL OR flags NOT LIKE '%"honeypot"%') GROUP BY r`,
    )) as unknown as [{ r: string | null; n: number }[]];
    eq(
      "returnReasonMix equals a recompute (null = no reason given)",
      rmix.map((l) => [l.reason, l.count]).sort((x, y) => String(x[0]).localeCompare(String(y[0]))),
      direct3.map((r) => [r.r, Number(r.n)]).sort((x, y) => String(x[0]).localeCompare(String(y[0]))),
    );
    ok("returnReasonMix: shares are Kpis with n = the finals", rmix.every((l) => l.share.n === rmix.reduce((s, x) => s + x.count, 0)));

    // ---- a mapped sheet label backfills confirmed_by for 90 days; the rollup equals a recompute after
    const labelled: string[] = [];
    for (let i = 0; i < 3; i++) {
      const id = await order(A, { test: i === 2 });
      await db.update(S.orders).set({ confirmState: "confirmed", shipState: "to_pack", confirmedByLabel: "Hamid", confirmedAt: new Date() }).where(deq(S.orders.id, id));
      labelled.push(id);
    }
    const old = await order(A);
    await db.update(S.orders).set({ confirmState: "confirmed", confirmedByLabel: "Hamid", createdAt: new Date(Date.now() - 95 * 86_400_000) }).where(deq(S.orders.id, old));
    LB.forgetSheetAgents(A);
    const sheetBefore = await LB.sheetAgents(A);
    ok("sheetAgents: the unmapped label is listed with its counts (n < 20: no rate)", sheetBefore.some((r) => r.label === "Hamid" && r.confirmed === 2 && "insufficient" in r.confirmationRate), sheetBefore);
    eq("mapAgentLabel: refused for someone who is not a member of the store", (await LB.mapAgentLabel(manager, "Hamid", U.ownerB.id)).ok, false);
    const mapped = await LB.mapAgentLabel(manager, "  Hamid ", U.agent2A.id);
    ok("mapAgentLabel: the label is normalised and written to ops.agentLabels", mapped.ok && (await getStoreSetting(A, "ops", { fresh: true })).agentLabels.Hamid === U.agent2A.id, mapped);
    const fill = await LB.backfillMappedLabel(manager, "Hamid", U.agent2A.id);
    eq("backfill: the 90-day real orders of the label get confirmed_by (test and older orders apart)", fill.count, 2);
    eq("backfill: confirmed_by per order", await Promise.all([...labelled, old].map(async (id) => (await rowOf(id)).confirmedBy)), [U.agent2A.id, U.agent2A.id, null, null]);
    const assigned = (await eventsOf(labelled[0]!, "assigned")).filter((e) => (e.meta as { by?: string } | null)?.by === "label_map");
    eq("backfill: one assigned event by label_map per touched order", assigned.length, 1);
    const audit = await db.select({ meta: S.auditLog.meta }).from(S.auditLog).where(and(deq(S.auditLog.storeId, STORE_A), deq(S.auditLog.action, "callcenter.label_mapped")));
    eq("backfill: audit callcenter.label_mapped { label, count }", audit.map((a) => a.meta), [{ label: "Hamid", count: 2 }]);
    eq("backfill: a second run touches nothing", (await LB.backfillMappedLabel(manager, "Hamid", U.agent2A.id)).count, 0);
    LB.forgetSheetAgents(A);
    ok("sheetAgents: a mapped label leaves the table", !(await LB.sheetAgents(A)).some((r) => r.label === "Hamid"));
    const afterMap = await stored();
    const recomputed2 = (await KS.computeAgentDays(A, bounds, w)).filter((d) => d.decided + d.attempts + d.abandoned + d.claimed + d.reveals + d.callbacks + d.shipped + d.delivered + d.refused + d.returned + d.lost + d.worked > 0);
    eq("rollup after the mapping equals a recompute", afterMap.map((r) => [r.userId, r.day, r.confirmed, r.decided]), recomputed2.map((d) => [d.userId, d.day, d.confirmed, d.decided]));
    eq("unmapAgentLabel: removed, attributions kept", [(await LB.unmapAgentLabel(manager, "Hamid")).ok, (await rowOf(labelled[0]!)).confirmedBy], [true, U.agent2A.id]);

    // ---- the ⌘K provider: ≤ 120 ms, masked, agent-restricted
    const sp = freshPhone();
    const so = await order(A, { phone: sp, name: "Rachida Searchable" });
    const p0 = performance.now();
    const hits = await provider.search(A, sp.slice(-6), { userId: U.ownerA.id, role: "owner" });
    const spMs = performance.now() - p0;
    ok("⌘K: an owner finds the order by 6 phone digits, masked, in ≤ 120 ms", spMs <= 120 && hits.some((h) => h.kind === "order" && h.id === so) && !JSON.stringify(hits).includes(sp.slice(-6)), { ms: Math.round(spMs), hits });
    ok("⌘K: customers by a name fragment, masked", (await provider.search(A, "Rachida", { userId: U.ownerA.id, role: "owner" })).some((h) => h.kind === "customer" && h.title === "Rachida S."));
    const agentHits = await provider.search(A, sp.slice(-6), { userId: U.agentA.id, role: "agent" });
    ok("⌘K: an agent does not find an order outside their queue by 6 digits, and never a customer", !agentHits.some((h) => h.id === so) && !agentHits.some((h) => h.kind === "customer"), agentHits);
    ok("⌘K: B's owner never finds A's order", !(await provider.search(B, sp.slice(-6), { userId: U.ownerB.id, role: "owner" })).some((h) => h.id === so));

    // ---- saving the calling window writes the ops row only and sets savedAt (OD63, CRIT2)
    const otherKeys = async () => JSON.stringify(await db.select({ key: S.storeSettings.key, value: S.storeSettings.value }).from(S.storeSettings).where(and(deq(S.storeSettings.storeId, STORE_A), sql`${S.storeSettings.key} <> 'ops'`)).orderBy(S.storeSettings.key));
    const beforeKeys = await otherKeys();
    const days = { 1: [{ from: "09:00", to: "13:00" }, { from: "15:00", to: "20:00" }], 2: [{ from: "09:00", to: "20:00" }], 3: [{ from: "09:00", to: "20:00" }], 4: [{ from: "09:00", to: "20:00" }], 5: [{ from: "09:00", to: "12:00" }], 6: [{ from: "10:00", to: "18:00" }], 7: [] };
    const saved = await ST.saveCallingWindow(owner, { days, closedDates: ["2026-12-25"] });
    const opsNowSetting = await getStoreSetting(A, "ops", { fresh: true });
    ok("saveCallingWindow: ops.callingWindow saved with savedAt", saved.ok && opsNowSetting.callingWindow.savedAt === (saved.ok ? saved.data.savedAt : "") && JSON.stringify(opsNowSetting.callingWindow.days[1]) === JSON.stringify(days[1]), saved);
    eq("saveCallingWindow: no other key of the store changed (no store / policies write)", await otherKeys(), beforeKeys);
    ok("saveCallingWindow: callingWindowFor answers configured", (await callingWindowFor(A)).configured === true);
    eq("saveCallingWindow: a 0-based week is refused", (await ST.saveCallingWindow(owner, { days: { 0: [], ...days } })).ok, false);
    eq("saveCallingWindow: an agent may not", (await ST.saveCallingWindow(agent, { days })).ok, false);
    const audits = await db.select({ action: S.auditLog.action }).from(S.auditLog).where(and(deq(S.auditLog.storeId, STORE_A), deq(S.auditLog.action, "callcenter.settings.updated")));
    ok("saveCallingWindow: audited callcenter.settings.updated", audits.length >= 1);
    const opened = await ST.openCallsNow(owner);
    ok("openCallsNow: openOverrideUntil = now + 2 h", opened.ok && Math.abs(new Date((await getStoreSetting(A, "ops", { fresh: true })).openOverrideUntil!).getTime() - Date.now() - 2 * 3_600_000) < 10_000, opened);
    eq("saveWindowOverrides: overlapping schedules are refused", (await ST.saveWindowOverrides(owner, [{ label: "A", from: "2027-02-01", to: "2027-02-20", days }, { label: "B", from: "2027-02-15", to: "2027-03-01", days }])).ok, false);
    ok("saveWindowOverrides: a dated schedule saves", (await ST.saveWindowOverrides(owner, [{ label: "Ramadan", from: "2027-02-08", to: "2027-03-09", days }])).ok);
    const scriptSaved = await ST.saveScript(owner, { pageId: null, locale: "fr", doc: { v: 1, steps: [{ id: "hello", title: "Bonjour", say: "Bonjour {customer_first_name}" }] } });
    ok("saveScript: an active call_script row of every page in fr", scriptSaved.ok, scriptSaved);
    const draftId = newId();
    await db.insert(S.messageTemplates).values({ id: draftId, storeId: STORE_A, channel: "call_script", kind: "script", locale: "fr", pageId: null, name: "AI draft", body: JSON.stringify({ v: 1, steps: [{ id: "ai", title: "Accueil", say: "Bonjour" }] }), status: "draft", source: "ai" });
    const approved = await ST.approveScriptDraft(owner, draftId);
    const tplRows = await db.select({ id: S.messageTemplates.id, status: S.messageTemplates.status }).from(S.messageTemplates).where(and(deq(S.messageTemplates.storeId, STORE_A), deq(S.messageTemplates.channel, "call_script")));
    ok("approveScriptDraft: the draft is active, the previous active row archived", approved.ok && tplRows.find((t) => t.id === draftId)?.status === "active" && tplRows.filter((t) => t.status === "active").length === 1, tplRows);
    eq("approveScriptDraft: B's owner with A's draft id answers not_found", (await ST.approveScriptDraft(ownerBCtx, draftId)).ok, false);
    const reset = await ST.resetScript(owner, { pageId: null, locale: "fr" });
    const left = (await db.select({ id: S.messageTemplates.id, s: S.messageTemplates.status }).from(S.messageTemplates).where(and(deq(S.messageTemplates.storeId, STORE_A), deq(S.messageTemplates.channel, "call_script"), deq(S.messageTemplates.locale, "fr"), sql`${S.messageTemplates.pageId} IS NULL`))).filter((t) => t.s === "active");
    ok("resetScript: back to the built-in (no active every-page fr row)", reset.ok && left.length === 0, { reset, left });
    eq("updateAgentProfile: a call taker's cap and weight", (await ST.updateAgentProfile(manager, U.agentA.id, { dailyCap: 60, weight: 3 })).ok, true);
    eq("updateAgentProfile: B's member answers not_found", (await ST.updateAgentProfile(manager, U.ownerB.id, { dailyCap: null, weight: 1 })), { ok: false, error: "not_found" });
  }

  /* ================================================================ */
  section = "finance";
  {
    const FC = load<typeof import("@/lib/finance/lite/costs.server")>("@/lib/finance/lite/costs.server");
    const FR = load<typeof import("@/lib/finance/lite/carrier.server")>("@/lib/finance/lite/carrier.server");
    const FS = load<typeof import("@/lib/finance/lite/settings.server")>("@/lib/finance/lite/settings.server");
    const FP = load<typeof import("@/lib/finance/lite/spend.server")>("@/lib/finance/lite/spend.server");
    const FB = load<typeof import("@/lib/finance/lite/breakeven.server")>("@/lib/finance/lite/breakeven.server");
    const FA = load<typeof import("@/lib/finance/lite/alerts.server")>("@/lib/finance/lite/alerts.server");
    const FH = load<typeof import("@/lib/finance/lite/health.server")>("@/lib/finance/lite/health.server");
    const { markCashReceived } = load<typeof import("@/lib/finance/lite/settlement.server")>("@/lib/finance/lite/settlement.server");
    const { getFixture } = load<typeof import("@/lib/page/fixtures")>("@/lib/page/fixtures");
    const { forgetOpsAggregates } = load<typeof import("@/lib/callcenter/aggregates")>("@/lib/callcenter/aggregates");
    const { storeYmd, addDaysYmd } = load<typeof import("@/lib/callcenter/window")>("@/lib/callcenter/window");
    const PR = load<typeof import("@/lib/orders/profile")>("@/lib/orders/profile");

    // OD52: at_delivery (A, the default) vs statement (B, set in the writer section)
    const door = await order(A);
    await T.applyExternalStatus(A, door, { legacy: "shipped" }, { kind: "sheet" });
    const doorRev = (await rowOf(door)).rev;
    await T.applyExternalStatus(A, door, { legacy: "delivered" }, { kind: "carrier" });
    const doorRow = await rowOf(door);
    eq("at_delivery: delivered + collected + remitted in one rev bump", [doorRow.rev - doorRev, doorRow.shipState, doorRow.moneyState], [1, "delivered", "remitted"]);
    const cashHeld = await db.select({ id: S.orders.id }).from(S.orders).where(and(deq(S.orders.storeId, STORE_A), deq(S.orders.shipState, "delivered"), deq(S.orders.moneyState, "collected")));
    ok("at_delivery: never in cash held (delivered and collected)", !cashHeld.some((r) => r.id === door), cashHeld.length);

    /** a sheet's Expédiée then the final label (the path the Sheets pull takes) */
    const finish = async (scope: WriteScope, id: string, legacy: "delivered" | "refused" | "returned") => {
      await T.applyExternalStatus(scope, id, { legacy: "shipped" }, { kind: "sheet" });
      return T.applyExternalStatus(scope, id, { legacy }, { kind: "sheet" });
    };
    // Mark cash received on 200 ids of the statement store
    const ids: string[] = [];
    for (let i = 0; i < 200; i++) {
      const id = await order(B);
      await finish(B, id, "delivered");
      ids.push(id);
    }
    const collectedB = async () => (await db.select({ id: S.orders.id }).from(S.orders).where(and(deq(S.orders.storeId, STORE_B), deq(S.orders.moneyState, "collected"), inArray(S.orders.id, ids)))).length;
    eq("statement: 200 delivered orders stay collected", await collectedB(), 200);
    eq("markCashReceived: 201 ids refused", (await markCashReceived(ownerBCtx, [...ids, "CMD-ZZZZZZ"])).ok, false);
    eq("markCashReceived: an agent may not", (await markCashReceived(ctxOf("B", U.ownerB, "agent"), ids.slice(0, 1))).ok, false);
    const cashT0 = Date.now();
    const cash = await markCashReceived(ownerBCtx, ids);
    ok("markCashReceived: 200 ids, each answered ok", cash.ok && cash.data.ok.length === 200 && cash.data.failed.length === 0, cash.ok ? cash.data.failed.slice(0, 3) : cash);
    ok("markCashReceived: 200 ids within 30 s", Date.now() - cashT0 < 30_000, Date.now() - cashT0);
    eq("markCashReceived: every order remitted", await collectedB(), 0);
    const ev = (await eventsOf(ids[0]!, "state_changed")).at(-1)!;
    eq("markCashReceived: the event (money remitted, meta settlement manual, source bulk)", [ev.toState, (ev.meta as Record<string, unknown>).settlement, (ev.meta as Record<string, unknown>).source], ["remitted", "manual", "bulk"]);
    const across = await markCashReceived(ownerBCtx, [door]);
    eq("markCashReceived: another store's id answers not_found", across.ok ? across.data.failed : across, [{ id: door, error: "not_found" }]);

    // costs on a live page
    const doc = getFixture("duo", { locale: "fr" }).doc;
    const pageId = newId();
    const versionId = newId();
    await db.insert(S.pages).values({ id: pageId, storeId: STORE_A, slug: `fin-${pageId.slice(-6).toLowerCase()}`, name: "Argan duo", status: "published", locale: "fr", publicKey: `pk${randomBytes(10).toString("hex")}`, draft: doc, publishedVersionId: versionId });
    await db.insert(S.pageVersions).values({ id: versionId, storeId: STORE_A, pageId, kind: "publish", doc, checksum: "0".repeat(64), runtimeV: 2 });
    const item = doc.items[0]!;
    eq("saveItemCost: B's owner with A's page answers not_found", await FC.saveItemCost(ownerBCtx, { pageId, itemId: item.id, costCents: 3_000 }), { ok: false, error: "not_found" });
    eq("saveItemCost: an unknown item answers not_found", (await FC.saveItemCost(owner, { pageId, itemId: "nope-item", costCents: 3_000 })).ok, false);
    eq("saveItemCost: a manager may not (finance.write)", await FC.saveItemCost(manager, { pageId, itemId: item.id, costCents: 3_000 }), { ok: false, error: "forbidden" });
    eq("saveItemCost: a fractional amount refused", (await FC.saveItemCost(owner, { pageId, itemId: item.id, costCents: 30.5 })).ok, false);
    const zero = await FB.breakEvenFor(A, { pageId });
    ok("zero costs: the card lists what to add and carries no number", !zero.result.ok && zero.result.missing.includes("packaging") && zero.result.missing.includes("delivery_fee"), zero.result);
    ok("saveSkuCost: a store-wide SKU cost", (await FC.saveSkuCost(owner, { sku: "arg-250", costCents: 3_800 })).ok);
    ok("saveItemCost: the item's own cost", (await FC.saveItemCost(owner, { pageId, itemId: item.id, costCents: 4_000 })).ok);
    ok("saveItemCost: a second change keeps the history", (await FC.saveItemCost(owner, { pageId, itemId: item.id, costCents: 4_200, note: "new supplier" })).ok);
    eq("history kept, newest first", (await FC.costHistory(A, { pageId, itemId: item.id })).map((h) => h.costCents), [4_200, 4_000]);
    const ov = await FC.costsOverview(A, "MAD");
    eq("costsOverview: the item's current cost", ov.pages.find((p) => p.pageId === pageId)?.items.find((i) => i.itemId === item.id)?.costCents, 4_200);
    eq("costsOverview in B: nothing of A", (await FC.costsOverview(B, "MAD")).pages.some((p) => p.pageId === pageId), false);

    // carrier rates, packaging, settlement, ad accounts and rates
    eq("saveCarrierRate: an unknown city refused", (await FR.saveCarrierRate(owner, { cityKey: "atlantis", deliveryFeeCents: 3_500, returnFeeCents: 2_000 })).ok, false);
    ok("saveCarrierRate: the default row", (await FR.saveCarrierRate(owner, { cityKey: "*", deliveryFeeCents: 3_500, returnFeeCents: 2_000, codFeeBp: 100 })).ok);
    ok("saveCarrierRate: a city row, then an update of it", (await FR.saveCarrierRate(owner, { cityKey: "fes", deliveryFeeCents: 4_000, returnFeeCents: 2_000 })).ok && (await FR.saveCarrierRate(owner, { cityKey: "fes", deliveryFeeCents: 4_500, returnFeeCents: 2_500 })).ok);
    eq("myCarrierRates: '*' first, one row per city", (await FR.myCarrierRates(A)).map((r) => [r.cityKey, r.deliveryFeeCents]), [["*", 3_500], ["fes", 4_500]]);
    eq("myCarrierRates in B: none of A's", (await FR.myCarrierRates(B)).length, 0);
    ok("savePackaging", (await FS.savePackaging(owner, { packagingCents: 500 })).ok);
    const settled = await FS.saveSettlement(owner, { settlement: "at_delivery" });
    ok("saveSettlement: confirmedAt set now", settled.ok && !!(await getStoreSetting(A, "accounting", { fresh: true })).myCarrier.confirmedAt, settled);
    ok("saveAdAccount: Meta billed in USD", (await FS.saveAdAccount(owner, { platform: "meta", currency: "usd" })).ok);
    eq("saveAdRate: the store currency refused", (await FS.saveAdRate(owner, { currency: "MAD", fromDay: "2026-10-01", rateMilli: 1_000 })).ok, false);
    const today = storeYmd(new Date(), "Africa/Casablanca");
    ok("saveAdSpendCell: a USD cell without a rate yet", (await FP.saveAdSpendCell(owner, { platform: "meta", day: today, spendCents: 10_000 })).ok);
    eq("saveAdSpendCell: a future day refused", (await FP.saveAdSpendCell(owner, { platform: "meta", day: addDaysYmd(today, 1), spendCents: 1 })).ok, false);
    const noRate = await FP.spendBetween(A, addDaysYmd(today, -27), today);
    eq("a day without a rate is excluded and counted", [noRate.cents, noRate.missingRates, noRate.missingDays], [0, 1, [today]]);
    ok("saveAdRate: 1 USD = 9.85 MAD from 28 days ago", (await FS.saveAdRate(owner, { currency: "usd", fromDay: addDaysYmd(today, -28), rateMilli: 9_850 })).ok);
    ok("saveAdSpendCell: a MAD cell on TikTok", (await FP.saveAdSpendCell(owner, { platform: "tiktok", day: today, spendCents: 20_000 })).ok);
    const withRate = await FP.spendBetween(A, addDaysYmd(today, -27), today);
    eq("converted at the owner's rate", [withRate.cents, withRate.missingRates], [98_500 + 20_000, 0]);
    const grid = await FP.adSpendGrid(A, 14);
    eq("the grid: 14 days, today first, Meta billed in USD, the converted total", [grid.days.length, grid.days[0]?.day, grid.accounts.meta, grid.days[0]?.totalStoreCents, grid.daysNotCounted], [14, today, "USD", 118_500, 0]);
    eq("the grid in B: empty", (await FP.adSpendGrid(B, 14)).days.every((d) => d.cells.every((c) => c.spendCents === null)), true);
    ok("saveAdSpendCell: 0 clears the cell", (await FP.saveAdSpendCell(owner, { platform: "tiktok", day: today, spendCents: 0 })).ok && (await FP.spendBetween(A, today, today)).cents === 98_500);
    const finAudits = await db.select({ action: S.auditLog.action }).from(S.auditLog).where(and(deq(S.auditLog.storeId, STORE_A), deq(S.auditLog.action, "finance.settings.updated")));
    ok("the accounting writes are audited finance.settings.updated", finAudits.length >= 4, finAudits.length);

    // the break-even card with costs on 30 delivered and 4 returned orders of this page
    async function orderOnPage(pid: string, itemId: string): Promise<string> {
      const id = await order(A);
      await db
        .update(S.orders)
        .set({ pageId: pid, items: { v: 2, bundleId: "duo", bundleLabel: "1", qty: 1, unitPrice: 249.9, variants: [{}], units: [{ item: itemId, label: "", options: [] }] } })
        .where(deq(S.orders.id, id));
      return id;
    }
    for (let i = 0; i < 36; i++) {
      const id = await orderOnPage(pageId, item.id);
      if (i < 34) await finish(A, id, i < 30 ? "delivered" : "returned");
      else await T.applyExternalStatus(A, id, { legacy: "cancelled" }, { kind: "sheet" });
    }
    forgetOpsAggregates(A);
    const card = await FB.breakEvenFor(A, { pageId });
    ok("with costs and n ≥ 30: a number inside its interval", card.result.ok && card.result.interval.lowCents <= card.result.ePlacedCents && card.result.ePlacedCents <= card.result.interval.highCents, card.result);
    eq("the CPA is store-level with the converted spend", [card.cpa.spendCents, card.cpa.placedCents !== null], [98_500, true]);

    // SF-05: the KPIs and Profit lite read the same before and after a test order
    const snap = async () => {
      forgetOpsAggregates(A);
      const be = await FB.breakEvenFor(A);
      const k = await PR.orderKpis(A, "28d");
      return JSON.stringify([be.counts, be.result, be.cpa, be.byAngle, be.outcomesAsOf, k]);
    };
    const snapBefore = await snap();
    const testId = await order(A, { test: true });
    await finish(A, testId, "delivered");
    eq("SF-05: Profit lite and the KPIs read the same after a delivered test order", await snap(), snapBefore);

    // fin.alerts: a refusal spike fires once, then is kept
    const spikeIds: string[] = [];
    for (let i = 0; i < 20; i++) spikeIds.push(await order(A, { city: "Tanger" }));
    for (const [i, id] of spikeIds.entries()) await finish(A, id, i < 12 ? "refused" : "delivered");
    const first = await FA.runFinAlerts(A, rowA);
    const second = await FA.runFinAlerts(A, rowA);
    const openRows = await db.select().from(S.profitAlerts).where(and(deq(S.profitAlerts.storeId, STORE_A), sql`${S.profitAlerts.clearedAt} IS NULL`));
    ok("fin.alerts: fires once and keeps on the next run", first.fired >= 1 && second.fired === 0 && second.kept === first.fired, { first, second });
    ok("fin.alerts: the open rows carry their evidence with n", openRows.length === first.fired && openRows.every((r) => typeof (r.evidence as Record<string, number>).n === "number"), openRows.map((r) => [r.kind, r.key]));
    const notes = await db.select({ kind: S.notifications.kind }).from(S.notifications).where(and(deq(S.notifications.storeId, STORE_A), deq(S.notifications.kind, "fin.profit_alert")));
    ok("fin.alerts: one notification per firing", notes.length === first.fired, notes.length);
    eq("fin.alerts in B: nothing fires from A's orders", (await FA.runFinAlerts(B, rowB)).fired, 0);

    // the fin:* health facts
    FH.forgetFinHealthFacts(A);
    const facts = await FH.finHealthFacts(A);
    eq("finHealthFacts: on, settlement confirmed, no rate missing", [facts.on, facts.settlementConfirmed, facts.adRateMissingDays], [true, true, 0]);
  }

  /* ================================================================ */
  section = "masking";
  {
    // canaries: a customer name and an internal note that must never reach an impersonating session (OD61)
    const NAME = "Zineb Canaryname";
    const NOTE = "CANARY-NOTE-7Q";
    const p = freshPhone();
    const o = await order(A, { phone: p, name: NAME, note: "porte bleue" });
    await E.addNote(owner, o, `${NOTE} appeler le soir`);
    await E.appendEvents(db, A, [{ orderId: o, actorKind: "user", actorId: U.ownerA.id, type: "field_edited", meta: { fields: [{ f: "address", before: "Hay Salam 12", after: `${NOTE} rue 5` }] } }]);
    const cust = (await customerOf(p))!;
    await db.update(S.customers).set({ note: `${NOTE} bon client` }).where(deq(S.customers.id, cust.id));
    const DR = load<typeof import("@/lib/admin-data/orders")>("@/lib/admin-data/orders");
    const drawer = await DR.orderDrawerJson(owner, o);
    ok("the drawer: the phone masked, the timeline, the risk and the script for a manager", !!drawer && !drawer.phone.includes(p.slice(-6)) && drawer.ops.timeline.items.length > 0 && !!drawer.ops.risk && drawer.ops.script !== null, drawer && { phone: drawer.phone, script: !!drawer.ops.script });
    eq("the drawer: an agent who does not hold the order gets null", await DR.orderDrawerJson(agent, o), null);
    const reads: [string, () => Promise<unknown>, () => Promise<unknown>][] = [
      ["orderTimeline", () => E.orderTimeline(A, owner, o), () => E.orderTimeline(impA, viewAs, o)],
      ["listCustomers", () => C.listCustomers(A, owner, {}), () => C.listCustomers(impA, viewAs, {})],
      ["getCustomer", () => C.getCustomer(A, owner, cust.id), () => C.getCustomer(impA, viewAs, cust.id)],
      ["duplicatesFor", () => D.duplicatesFor(A, { id: o, phone: p, isTest: false }), () => D.duplicatesFor(impA, { id: o, phone: p, isTest: false })],
      ["getOrder (admin.ts)", () => AD.getOrder(A, o), () => AD.getOrder(impA, o)],
      ["listOrders (admin.ts)", () => AD.listOrders(A, {}), () => AD.listOrders(impA, {})],
      ["orderDrawerJson (the drawer)", () => DR.orderDrawerJson(owner, o), () => DR.orderDrawerJson(viewAs, o)],
    ];
    const carries = (v: unknown) => [NAME, NOTE].filter((c) => JSON.stringify(v).includes(c));
    for (const [name, asMember, asStaff] of reads) {
      const m = await asMember();
      const s = await asStaff();
      ok(`${name}: no canary under an impersonation scope`, carries(s).length === 0, carries(s));
      if (name !== "duplicatesFor") ok(`${name}: the identity under a member scope (the canaries are there)`, carries(m).length > 0, carries(m));
      else ok(`${name}: ids, dates and states only, under any scope`, carries(m).length === 0 && JSON.stringify(m) === JSON.stringify(s));
    }
    // the inbound lookup (OPE-§5.7) hands out a first name, the masked phone and counts only, under any scope
    const IN = load<typeof import("@/lib/callcenter/inbound")>("@/lib/callcenter/inbound");
    for (const [label, ctx] of [["a member", owner], ["an impersonation", viewAs]] as const) {
      const look = await IN.inboundLookup(ctx, `0${p.slice(4)}`);
      ok(`inboundLookup under ${label} scope: the first name only, no canary`, look.ok && look.data.customer?.firstName === "Zineb" && look.data.orders.length === 1 && carries(look).length === 0, look);
    }
    eq("a search on a masked field finds nothing under impersonation", (await C.listCustomers(impA, viewAs, { search: "Zineb" })).items, []);
    const staffName = (await C.getCustomer(impA, viewAs, cust.id))?.name;
    eq("the masked name keeps a first name and an initial", staffName, "Zineb C.");
  }

  for (const f of failures) console.log(`✗ ${f}`);
  console.log(failures.length ? `✗ test:ops-db: ${failures.length} failure(s), ${pass} passed` : `✓ test:ops-db: ${pass} assertions passed (${dbName})`);
  void sql;
  return failures.length ? 1 : 0;
}

async function cleanup(): Promise<void> {
  try {
    const { pool } = load<typeof import("@/lib/db/client")>("@/lib/db/client");
    await pool().end();
  } catch {
    // the pool was never opened
  }
  if (KEEP) console.log(`… kept ${dbName}`);
  else await rootQuery(`DROP DATABASE IF EXISTS \`${dbName}\``).catch((e: unknown) => console.error(`✗ could not drop ${dbName}:`, e instanceof Error ? e.message : e));
}

main()
  .then(async (code) => {
    await cleanup();
    process.exit(code);
  })
  .catch(async (e) => {
    console.error(e);
    await cleanup();
    process.exit(1);
  });
