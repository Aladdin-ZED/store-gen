// proves: OP-01, OP-02, OP-04, OP-06, SF-05
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

  const { and, eq: deq, sql } = load<typeof import("drizzle-orm")>("drizzle-orm");
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
    await H.runOrderHooks("created", "afterCommit", A, { on: "created", order: await rowOf(o1), conversion: null, target: { pageId: r1.pageId, versionId: null, source: "live" } });
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
    eq("expectRev from an older card: conflict with the fresh state", data(await O.recordOutcome(agent, { orderId: o1, expectRev: 0, channel: "call", outcome: "no_answer", idem: randomUUID() })), {
      ok: false,
      error: "conflict",
      current: { rev: (await rowOf(o1)).rev, states: { confirm: "attempting", ship: "none", money: "unpaid" }, status: "no_answer" },
    });

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
    const reads: [string, () => Promise<unknown>, () => Promise<unknown>][] = [
      ["orderTimeline", () => E.orderTimeline(A, owner, o), () => E.orderTimeline(impA, viewAs, o)],
      ["listCustomers", () => C.listCustomers(A, owner, {}), () => C.listCustomers(impA, viewAs, {})],
      ["getCustomer", () => C.getCustomer(A, owner, cust.id), () => C.getCustomer(impA, viewAs, cust.id)],
      ["duplicatesFor", () => D.duplicatesFor(A, { id: o, phone: p, isTest: false }), () => D.duplicatesFor(impA, { id: o, phone: p, isTest: false })],
      ["getOrder (admin.ts)", () => AD.getOrder(A, o), () => AD.getOrder(impA, o)],
      ["listOrders (admin.ts)", () => AD.listOrders(A, {}), () => AD.listOrders(impA, {})],
    ];
    const carries = (v: unknown) => [NAME, NOTE].filter((c) => JSON.stringify(v).includes(c));
    for (const [name, asMember, asStaff] of reads) {
      const m = await asMember();
      const s = await asStaff();
      ok(`${name}: no canary under an impersonation scope`, carries(s).length === 0, carries(s));
      if (name !== "duplicatesFor") ok(`${name}: the identity under a member scope (the canaries are there)`, carries(m).length > 0, carries(m));
      else ok(`${name}: ids, dates and states only, under any scope`, carries(m).length === 0 && JSON.stringify(m) === JSON.stringify(s));
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
