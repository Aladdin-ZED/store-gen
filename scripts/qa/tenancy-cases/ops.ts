/**
 * Two-store attack cases of the ops track (P4 CALL CENTER, operations.md OPE-§O.2 `test:tenancy`, OD12, OD53, OD61).
 * Extension file (docs/STORE-SAAS.md §F.1, §J.2, §K.3; DES-R13), created empty at P0 and loaded by
 * scripts/qa/tenancy-check.ts (`test:tenancy`). The cases grow with each P4 step; step 2 (the one writer, the
 * timeline and notes, customers, duplicates) adds:
 *   - reads: store B's owner with A's order, customer and event ids answers exactly what missing ids answer, and no
 *     canary of A reaches B (orderTimeline, getCustomer, listCustomers with A's customer name, duplicatesFor with
 *     A's phone)
 *   - writes: the same for transitionOrder, applyExternalStatus, moveToLegacy, appendOrderEvent, addNote, editNote,
 *     hideNote and dismissDuplicate, and A's rows are byte-identical afterwards
 *   - impersonation (OD61): A's timeline and customer reads under a "view as store" scope carry no customer canary,
 *     while the member scope does (the positive control)
 * Step 3 (the queue, presence, outcomes) adds:
 *   - Next as B's agent never hands out A's orders; takeOrder (inbound or not, and with A's id forged into B's inbound
 *     set), releaseOrder, recordOutcome (inbound or not) and renewLease with A's ids answer what missing ids answer;
 *     assignOrders answers A's ids per id exactly like missing ones; A's Idempotency-Key replayed in B is a fresh
 *     answer, never A's card; B's pulse counts B's rows only; releaseAllLeases(B) leaves A alone; A is byte-identical
 * Step 4 (the card, the reveal, the inbound lookup, the hot-path routes) adds:
 *   - revealPhone, addNote and inboundLookup as B's members with A's ids and A's customer phone: the answers of
 *     missing ids, the empty inbound shape, no canary of A
 *   - the four routes `POST /api/app/<h>/ops/*` through storeGuard with an Idempotency-Key: reveal and outcome with A's
 *     ids answer the 404 of a missing id, next as B's agent never hands out A's orders; the key is required (400
 *     `idem_required`) and a body over 2 KB is refused (413)
 *   - `actions`: the attack cases of the nine queue actions (src/app/app/[store]/queue/actions.ts), which join the
 *     harness's action × role suite
 * Step 5 (manual orders, editing, lead conversion, block-and-cancel, holds, tracking, recall) adds:
 *   - editOrder, convertLeadToOrder, createManualOrder / quoteManualOrder on A's page, setOrderHold, setOrderTracking,
 *     requestRecall, markCarrierNotified, saveCustomerNote, blockPreview and blockPhoneAndCancel (by A's order) as B's
 *     owner with A's ids: the answers of missing ids; A's customer's number typed in B blocks it in B only and never
 *     moves or marks an order of A
 *   - `actions`: the new actions of src/app/app/[store]/orders/actions.ts and src/app/app/[store]/customers/actions.ts
 * Step 6 (the list, saved views, bulk and undo, the Carrier CSV, slips, the export-ZIP writers, test orders) adds:
 *   - a saved view with A's page id lists no rows; B lists, renames and deletes none of A's views; bulkMove,
 *     bulkAssign and bulkPin with A's ids answer not_found per id; a forged undo token answers expired; the Carrier
 *     CSV with A's ids lists them as refused and never exports them; no slip of A; B's export files and test-order
 *     delete carry and touch nothing of A; GET /orders/print and /orders/carrier-csv with A's ids leak nothing
 *   - `actions`: the eleven new actions of src/app/app/[store]/orders/actions.ts
 * Step 7 (KPIs, aggregates, the board, the pulse, ⌘K, label mapping, the team actions) adds:
 *   - orderKpis, queueCounts, opsAggregates, the board payload, the ops pulse contributor and the ⌘K provider as B's
 *     owner count B's rows only and carry no canary of A; mapping in B a label A's orders carry touches no order of A;
 *     GET /ops/state on B's address carries nothing of A and on A's address is refused
 *   - `actions`: the team/agents and team/callcenter actions, saveCallingWindowAction and openTestOrderAction
 * Step 8 (Profit lite) adds:
 *   - saveItemCost on A's page, markCashReceived with A's order, breakEvenFor and costHistory of A's page as B's
 *     owner: the answers of missing ids; B's costs overview, carrier rates, ad-spend grid and card carry nothing of A
 *   - `actions`: the nine actions of src/app/app/[store]/finance/actions.ts
 * Modules are loaded inside the cases (the harness has set the environment by then): this file imports types only.
 */
import Module from "node:module";
import { randomUUID } from "node:crypto";
import type { TenancyCase, TenancyKit, TrackActionCase } from "../tenancy-check";
import type { StoreCtx, WriteCtx, WriteScope } from "@/lib/tenancy/types";

const load = <T>(id: string): T => Module.createRequire(__filename)(id) as T;
const answer = (o: { ok: boolean; value?: unknown; error?: unknown }) => (o.ok ? { value: o.value } : { threw: o.error instanceof Error ? o.error.message.slice(0, 200) : String(o.error) });
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const ghostId26 = () => Array.from({ length: 26 }, () => CROCKFORD[Math.floor(Math.random() * 32)]).join("");
/** an event id that exists nowhere */
const GHOST_EVENT = 2_147_000_000;

/** A's customer row and a note on A's main order (the canaries the reads must never hand to B). */
async function seedA(kit: TenancyKit): Promise<{ customerId: string; noteId: number; phone: string }> {
  const { db } = load<typeof import("@/lib/db/client")>("@/lib/db/client");
  const S = load<typeof import("@/lib/db/schema")>("@/lib/db/schema");
  const { eq } = load<typeof import("drizzle-orm")>("drizzle-orm");
  const C = load<typeof import("@/lib/orders/customers")>("@/lib/orders/customers");
  const E = load<typeof import("@/lib/orders/events")>("@/lib/orders/events");
  const A = kit.scope("A") as WriteScope;
  const [o] = await db.select().from(S.orders).where(eq(S.orders.id, kit.fx.A.order.main)).limit(1);
  if (!o) throw new Error("ops cases: A's main order is missing");
  const existing = o.customerId;
  const customerId =
    existing ??
    (await db.transaction((tx) => C.upsertCustomerForOrder(tx, A, { id: o.id, phone: o.phone, name: o.name, city: o.city, cityKey: o.cityKey, locale: o.locale, isTest: o.isTest, createdAt: o.createdAt })));
  const [noteId] = await E.appendEvents(db, A, [{ orderId: o.id, actorKind: "user", actorId: kit.fx.A.members.owner, type: "note", note: kit.fx.A.customer.note }]);
  return { customerId, noteId: noteId!, phone: o.phone };
}

/** B's owner, through the real seam (requireStoreMember with B's handle). */
async function asBOwner<T>(kit: TenancyKit, fn: (ctx: StoreCtx, write: WriteCtx) => Promise<T>) {
  const { requireStoreMember, memberWriteCtx } = load<typeof import("@/lib/tenancy/seam")>("@/lib/tenancy/seam");
  return kit.call({ userId: kit.fx.B.members.owner }, `/app/${kit.fx.B.handle}/orders`, async () => {
    const ctx = await requireStoreMember({ handle: kit.fx.B.handle });
    return fn(ctx, memberWriteCtx(ctx));
  });
}

/** B's member of `role` (owner or agent), through the real seam (requireStoreMember with B's handle). */
async function asB<T>(kit: TenancyKit, role: "owner" | "agent", fn: (ctx: StoreCtx, write: WriteCtx) => Promise<T>) {
  const { requireStoreMember, memberWriteCtx } = load<typeof import("@/lib/tenancy/seam")>("@/lib/tenancy/seam");
  return kit.call({ userId: kit.fx.B.members[role] }, `/app/${kit.fx.B.handle}/queue`, async () => {
    const ctx = await requireStoreMember({ handle: kit.fx.B.handle });
    return fn(ctx, memberWriteCtx(ctx));
  });
}

/** fn with A's ids vs fn with ids that exist nowhere: the same answer, and no canary of A in it. */
async function same(kit: TenancyKit, label: string, real: Awaited<ReturnType<typeof kit.call>>, ghost: Awaited<ReturnType<typeof kit.call>>, sent?: unknown): Promise<void> {
  if (!kit.ranReal(label, real, ghost)) return;
  kit.check(`${label}: same answer as a missing id`, JSON.stringify(answer(real)) === JSON.stringify(answer(ghost)), { real: answer(real), ghost: answer(ghost) });
  const leaked = kit.leaks(answer(real), { sent });
  kit.check(`${label}: no canary of A`, leaked.length === 0, leaked);
}

/** A manual order's input on `pageId` (an offer no fixture has: the function answers its field error, never a write). */
const manualInput = (pageId: string) => ({
  pageId,
  selection: { offerId: "solo", units: [] as never[], extras: {}, bump: false },
  customer: { name: "Salma Test", phone: "0612345678", city: "Casablanca", address: "Rue 1 numero 2" },
  confirmed: false,
  idem: randomUUID(),
});

/** The customer row of `orderId`, or an id no customer has. */
async function customerOf(orderId: string): Promise<string> {
  const { db } = load<typeof import("@/lib/db/client")>("@/lib/db/client");
  const S = load<typeof import("@/lib/db/schema")>("@/lib/db/schema");
  const { eq } = load<typeof import("drizzle-orm")>("drizzle-orm");
  const [row] = await db.select({ id: S.orders.customerId }).from(S.orders).where(eq(S.orders.id, orderId)).limit(1);
  return row?.id ?? ghostId26();
}

let seeded: Promise<{ customerId: string; noteId: number; phone: string }> | null = null;
const seedOnce = (kit: TenancyKit) => (seeded ??= seedA(kit));

export const cases: TenancyCase[] = [
  {
    name: "ops reads: B's owner with A's order, customer and event ids",
    async run(kit) {
      const a = await seedOnce(kit);
      const E = load<typeof import("@/lib/orders/events")>("@/lib/orders/events");
      const C = load<typeof import("@/lib/orders/customers")>("@/lib/orders/customers");
      const D = load<typeof import("@/lib/orders/duplicates")>("@/lib/orders/duplicates");
      const ids = { order: kit.fx.A.order.main, customer: a.customerId };
      const ghosts = { order: kit.ghostify(kit.fx.A.order.main), customer: ghostId26() };
      const B = kit.scope("B");
      for (const [label, fn] of [
        ["orderTimeline(B, A's order)", (x: typeof ids) => asBOwner(kit, (ctx) => E.orderTimeline(B, ctx, x.order))],
        ["getCustomer(B, A's customer)", (x: typeof ids) => asBOwner(kit, (ctx) => C.getCustomer(B, ctx, x.customer))],
      ] as const) {
        await same(kit, label, await fn(ids), await fn(ghosts));
      }
      const byName = await asBOwner(kit, (ctx) => C.listCustomers(B, ctx, { search: kit.fx.A.customer.name }));
      kit.check("listCustomers(B, q = A's customer name): no canary of A", byName.ok && kit.leaks(answer(byName), { sent: kit.fx.A.customer.name }).length === 0, answer(byName));
      const dup = await kit.call({ anonymous: true }, "/", () => D.duplicatesFor(B, { id: ghosts.order, phone: a.phone, isTest: false }));
      kit.check("duplicatesFor(B, A's phone): B's orders only (none)", dup.ok && Array.isArray(dup.value) && dup.value.length === 0, answer(dup));
    },
  },
  {
    name: "ops writes: B's owner with A's ids never touches A",
    async run(kit) {
      const a = await seedOnce(kit);
      const T = load<typeof import("@/lib/orders/transition")>("@/lib/orders/transition");
      const E = load<typeof import("@/lib/orders/events")>("@/lib/orders/events");
      const D = load<typeof import("@/lib/orders/duplicates")>("@/lib/orders/duplicates");
      const before = await kit.snapshotA();
      const real = { order: kit.fx.A.order.main, other: kit.fx.A.order.failed, note: a.noteId };
      const ghost = { order: kit.ghostify(kit.fx.A.order.main), other: kit.ghostify(kit.fx.A.order.failed), note: GHOST_EVENT };
      const attacks: [string, (x: typeof real) => ReturnType<typeof asBOwner>][] = [
        ["transitionOrder(B, A's order)", (x) => asBOwner(kit, (_c, w) => T.transitionOrder(T.actorFrom(w), w.scope, { orderId: x.order, want: { confirm: "fake" }, source: "ui" }))],
        ["transitionOrder(B, A's order, inbound)", (x) => asBOwner(kit, (_c, w) => T.transitionOrder(T.actorFrom(w), w.scope, { orderId: x.order, want: { confirm: "confirmed" }, source: "outcome", inbound: true }))],
        ["applyExternalStatus(B, A's order)", (x) => asBOwner(kit, (_c, w) => T.applyExternalStatus(w.scope, x.order, { legacy: "delivered" }, { kind: "sheet", ref: "row:2", agentLabel: "Samira" }))],
        ["moveToLegacy(B, A's order)", (x) => asBOwner(kit, (_c, w) => T.moveToLegacy(w, x.order, "cancelled", undefined, { reason: "other" }))],
        ["appendOrderEvent(B, A's order)", (x) => asBOwner(kit, (_c, w) => E.appendOrderEvent(w.scope, x.order, { actorKind: "customer", type: "track_opened", meta: { via: "link" } }))],
        ["addNote(B, A's order)", (x) => asBOwner(kit, (_c, w) => E.addNote(w, x.order, "pwned"))],
        ["editNote(B, A's note)", (x) => asBOwner(kit, (_c, w) => E.editNote(w, x.order, x.note, "pwned"))],
        ["hideNote(B, A's note)", (x) => asBOwner(kit, (_c, w) => E.hideNote(w, x.order, x.note))],
        ["dismissDuplicate(B, A's orders)", (x) => asBOwner(kit, (_c, w) => D.dismissDuplicate(w, x.order, x.other))],
      ];
      for (const [label, fn] of attacks) await same(kit, label, await fn(real), await fn(ghost));
      const after = await kit.snapshotA();
      kit.check("ops writes: A's rows unchanged by every attempt", after === before);
    },
  },
  {
    name: "ops impersonation: A's timeline and customers under a view-as scope carry no customer canary (OD61)",
    async run(kit) {
      const a = await seedOnce(kit);
      const E = load<typeof import("@/lib/orders/events")>("@/lib/orders/events");
      const C = load<typeof import("@/lib/orders/customers")>("@/lib/orders/customers");
      const { can, isWritePermission } = load<typeof import("@/lib/auth/permissions")>("@/lib/auth/permissions");
      const viewer = (kind: "member" | "impersonation") =>
        ({
          user: { id: kit.fx.staff.id, email: "staff@tenancy.test", name: "Staff", totpEnabled: true, sessionId: "s", platformRole: "support", locale: null, lastStoreId: null },
          store: kit.fx.rows.A,
          membership: { role: "manager", status: "active", ...(kind === "impersonation" ? { synthetic: "impersonation" } : {}) },
          scope: kit.scope("A", kind),
          actor: { kind: kind === "impersonation" ? "impersonation" : "user", userId: kit.fx.staff.id, impersonatorId: null, ip: null },
          impersonation: null,
          stepUpUntil: null,
          can: (p: Parameters<typeof can>[1]) => can("manager", p) && (kind === "member" || !isWritePermission(p)),
        }) as unknown as StoreCtx;
      const reads = (kind: "member" | "impersonation") => {
        const v = viewer(kind);
        const s = kit.scope("A", kind);
        return kit.call({ anonymous: true }, "/", async () => ({
          timeline: await E.orderTimeline(s, v, kit.fx.A.order.main),
          customer: await C.getCustomer(s, v, a.customerId),
          customers: await C.listCustomers(s, v, {}),
        }));
      };
      const member = await reads("member");
      const staff = await reads("impersonation");
      if (!kit.ranReal("ops impersonation reads", member, staff)) return;
      kit.check("ops reads under A's member scope carry A's customer fields (the positive control)", kit.leaks(answer(member), { only: ["customer"] }).length > 0, answer(member));
      const leaked = kit.leaks(answer(staff), { only: ["customer"] });
      kit.check("ops reads under A's impersonation scope: no customer canary", leaked.length === 0, leaked);
    },
  },
  {
    name: "ops queue: B's agent and owner never claim, take, release, record, assign or count A's orders",
    async run(kit) {
      await seedOnce(kit);
      const Q = load<typeof import("@/lib/orders/queue")>("@/lib/orders/queue");
      const O = load<typeof import("@/lib/callcenter/outcomes")>("@/lib/callcenter/outcomes");
      const I = load<typeof import("@/lib/callcenter/idem")>("@/lib/callcenter/idem");
      const V = load<typeof import("@/lib/callcenter/visibility")>("@/lib/callcenter/visibility");
      const { setStoreSetting, getStoreSetting } = load<typeof import("@/lib/settings")>("@/lib/settings");
      const { db } = load<typeof import("@/lib/db/client")>("@/lib/db/client");
      const { sql } = load<typeof import("drizzle-orm")>("drizzle-orm");
      const before = await kit.snapshotA();
      const B = kit.scope("B") as WriteScope;
      const real = { order: kit.fx.A.order.main, other: kit.fx.A.order.failed };
      const ghost = { order: kit.ghostify(real.order), other: kit.ghostify(real.other) };
      const uuid = () => randomUUID();
      // B's calling window open for the duration of the case (restored, and B's claims released, at the end)
      const opsB = await getStoreSetting(B, "ops");
      await setStoreSetting(B, "ops", { ...opsB, openOverrideUntil: new Date(Date.now() + 3_600_000).toISOString() }, { id: kit.fx.B.members.owner });
      try {
        const nxt = await asB(kit, "agent", (_c, w) => Q.nextOrder(w, { idem: uuid() }));
        const nxtA = answer(nxt);
        kit.check("nextOrder(B's agent): never one of A's orders, no canary of A", nxt.ok && !JSON.stringify(nxtA).includes(real.order) && !JSON.stringify(nxtA).includes(real.other) && kit.leaks(nxtA).length === 0, nxtA);

        // A's ids from B: the answer of a missing id, and A untouched
        const attacks: [string, (x: typeof real) => ReturnType<typeof asB>][] = [
          ["takeOrder(B's agent, A's order, inbound)", (x) => asB(kit, "agent", (_c, w) => Q.takeOrder(w, x.order, { inbound: true }))],
          ["takeOrder(B's owner, A's order)", (x) => asB(kit, "owner", (_c, w) => Q.takeOrder(w, x.order, { inbound: false }))],
          ["releaseOrder(B's agent, A's order)", (x) => asB(kit, "agent", (_c, w) => Q.releaseOrder(w, x.order, "skip"))],
          ["recordOutcome(B's owner, A's order)", (x) => asB(kit, "owner", (_c, w) => O.recordOutcome(w, { orderId: x.order, expectRev: 0, channel: "call", outcome: "confirmed", idem: uuid() }))],
          ["recordOutcome(B's agent, A's order, inbound)", (x) => asB(kit, "agent", (_c, w) => O.recordOutcome(w, { orderId: x.order, expectRev: 0, channel: "call", outcome: "confirmed", inbound: true, idem: uuid() }))],
          ["renewLease(B, A's order)", (x) => asB(kit, "agent", (_c, w) => Q.renewLease(w.scope, x.order, w.user.id))],
        ];
        for (const [label, fn] of attacks) await same(kit, label, await fn(real), await fn(ghost));
        // B's agent with A's ids in their inbound set (a forged lookup): still nothing of A
        const forged = await asB(kit, "agent", async (_c, w) => {
          V.rememberInbound(w.scope, w.user.id, [real.order]);
          return Q.takeOrder(w, real.order, { inbound: true });
        });
        kit.check("takeOrder(B's agent) with A's id in B's inbound set: not_found", forged.ok && JSON.stringify(forged.value) === JSON.stringify({ ok: false, error: "not_found" }), answer(forged));
        // assignOrders answers per id: A's ids read exactly like missing ones
        const assign = async (x: typeof real) => asB(kit, "owner", (_c, w) => Q.assignOrders(w, [x.order, x.other], kit.fx.B.members.agent));
        const [aReal, aGhost] = [await assign(real), await assign(ghost)];
        const codes = (r: Awaited<ReturnType<typeof assign>>) => {
          const v = r.ok ? r.value : undefined;
          return v?.ok ? v.data.results.map((e) => (e.ok ? "ok" : e.error)) : answer(r);
        };
        if (kit.ranReal("assignOrders(B's owner, A's orders)", aReal, aGhost)) {
          kit.check("assignOrders(B's owner, A's orders): the per-id answers of missing ids", JSON.stringify(codes(aReal)) === JSON.stringify(codes(aGhost)) && JSON.stringify(codes(aReal)) === JSON.stringify(["not_found", "not_found"]), [codes(aReal), codes(aGhost)]);
          kit.check("assignOrders(B's owner, A's orders): no canary of A", kit.leaks(answer(aReal), { sent: [real.order, real.other] }).length === 0, kit.leaks(answer(aReal), { sent: [real.order, real.other] }));
        }

        // A's Idempotency-Key replayed in B (the member of both stores): a fresh result, never A's card
        const key = uuid();
        await kit.call({ anonymous: true }, "/", () =>
          I.withIdem(
            kit.scope("A"),
            kit.fx.dual,
            key,
            async () => ({ ok: true, order: { id: real.order, customer: { firstName: kit.fx.A.customer.name } } }),
            (r) => r,
          ),
        );
        const replay = await kit.call({ userId: kit.fx.dual }, `/app/${kit.fx.B.handle}/queue`, async () => {
          const { requireStoreMember, memberWriteCtx } = load<typeof import("@/lib/tenancy/seam")>("@/lib/tenancy/seam");
          const ctx = await requireStoreMember({ handle: kit.fx.B.handle });
          return Q.nextOrder(memberWriteCtx(ctx), { idem: key });
        });
        if (kit.ranReal("nextOrder(B, A's Idempotency-Key)", replay)) {
          const r = answer(replay);
          kit.check("nextOrder(B, A's Idempotency-Key): a fresh answer, no canary of A", !JSON.stringify(r).includes(real.order) && !JSON.stringify(r).includes('"replayed"') && kit.leaks(r).length === 0, r);
        }

        // the pulse counts B's rows only: the same numbers as a count over B's orders
        const pulse = await kit.call({ anonymous: true }, "/", () => Q.opsPulse(B, { userId: kit.fx.B.members.owner, role: "owner" }));
        const [[counts]] = (await db.execute(sql`
          SELECT SUM((confirm_state IN ('new', 'attempting', 'callback') AND (due_at IS NULL OR due_at <= UTC_TIMESTAMP(3)) OR confirm_state = 'confirmed' AND due_at IS NOT NULL AND due_at <= UTC_TIMESTAMP(3)) AND (lease_until IS NULL OR lease_until < UTC_TIMESTAMP(3))) AS queueNow,
                 SUM(confirm_state = 'callback' AND due_at <= UTC_TIMESTAMP(3)) AS dueCallbacks
            FROM orders WHERE store_id = ${kit.fx.B.id}`)) as unknown as [[{ queueNow: unknown; dueCallbacks: unknown }]];
        if (kit.ranReal("opsPulse(B)", pulse)) {
          const v = pulse.value as { queueNow: number; dueCallbacks: number };
          kit.check("opsPulse(B): the queue and the callbacks of B's own orders", v.queueNow === Number(counts?.queueNow ?? 0) && v.dueCallbacks === Number(counts?.dueCallbacks ?? 0), { pulse: v, counts });
        }
        const released = await kit.call({ anonymous: true }, "/", () => Q.releaseAllLeases(B));
        kit.check("releaseAllLeases(B) runs on B's own claims", released.ok, answer(released));
      } finally {
        await setStoreSetting(B, "ops", opsB, { id: kit.fx.B.members.owner });
      }
      kit.check("ops queue: A's rows unchanged by every attempt", (await kit.snapshotA()) === before);
    },
  },
  {
    name: "ops hot path: B never reveals, looks up or records A's orders, through the functions and the four routes",
    async run(kit) {
      await seedOnce(kit);
      const R = load<typeof import("@/lib/callcenter/reveal")>("@/lib/callcenter/reveal");
      const I = load<typeof import("@/lib/callcenter/inbound")>("@/lib/callcenter/inbound");
      const E = load<typeof import("@/lib/orders/events")>("@/lib/orders/events");
      const before = await kit.snapshotA();
      const real = { order: kit.fx.A.order.main };
      const ghost = { order: kit.ghostify(real.order) };

      // the functions: A's ids from B answer what missing ids answer
      const attacks: [string, (x: typeof real) => ReturnType<typeof asB>][] = [
        ["revealPhone(B's owner, A's order)", (x) => asB(kit, "owner", (_c, w) => R.revealPhone(w, x.order, "call", { idem: randomUUID() }))],
        ["revealPhone(B's agent, A's order, WhatsApp)", (x) => asB(kit, "agent", (_c, w) => R.revealPhone(w, x.order, "whatsapp", { templateId: "builtin:wa:confirm", idem: randomUUID() }))],
        ["addNote(B's agent, A's order)", (x) => asB(kit, "agent", (_c, w) => E.addNote(w, x.order, "pwned"))],
      ];
      for (const [label, fn] of attacks) await same(kit, label, await fn(real), await fn(ghost));

      // B's agent looking A's customer up: the empty shape (or B's own orders of that number), never A's
      const look = await asB(kit, "agent", (c) => I.inboundLookup(c, kit.fx.A.customer.phone));
      if (kit.ranReal("inboundLookup(B's agent, A's customer phone)", look)) {
        const v = look.value as Awaited<ReturnType<typeof I.inboundLookup>>;
        const ids = v.ok ? v.data.orders.map((o) => o.id) : [];
        kit.check("inboundLookup(B's agent, A's customer phone): no order of A, no canary of A", v.ok && !ids.includes(kit.fx.A.order.main) && !ids.includes(kit.fx.A.order.failed) && kit.leaks(answer(look), { sent: kit.fx.A.customer.phone }).length === 0, answer(look));
      }

      // the routes (OD36): the same answers through storeGuard, with an Idempotency-Key
      const route = (name: string) => ({ file: `src/app/api/app/[store]/ops/${name}/route.ts`, template: `/api/app/[store]/ops/${name}`, methods: ["POST"] });
      const post = (who: string, name: string, body: unknown, headers: Record<string, string> = { "idempotency-key": randomUUID() }) =>
        kit.callRoute({ userId: who }, route(name), "POST", { store: kit.fx.B.handle }, { body }, { headers });
      const status = (o: Awaited<ReturnType<typeof post>>) => (o.ok ? { status: o.value!.status, body: o.value!.body } : answer(o));
      for (const [label, name, body] of [
        ["POST /ops/reveal (B's owner, A's order)", "reveal", (x: typeof real) => ({ orderId: x.order, why: "call" })],
        ["POST /ops/reveal (B's owner, A's order, WhatsApp)", "reveal", (x: typeof real) => ({ orderId: x.order, why: "whatsapp", templateId: "builtin:wa:confirm" })],
        ["POST /ops/outcome (B's owner, A's order)", "outcome", (x: typeof real) => ({ orderId: x.order, expectRev: 0, channel: "call", outcome: "no_answer" })],
        ["POST /ops/outcome (B's owner, A's order, inbound)", "outcome", (x: typeof real) => ({ orderId: x.order, expectRev: 0, channel: "call", outcome: "confirmed", inbound: true })],
      ] as const) {
        const r = await post(kit.fx.B.members.owner, name, body(real));
        const g = await post(kit.fx.B.members.owner, name, body(ghost));
        if (!kit.ranReal(label, r, g)) continue;
        const rs = status(r) as { status?: number; body?: string };
        const gs = status(g) as { status?: number; body?: string };
        kit.check(`${label}: 404, the answer of a missing id`, rs.status === 404 && JSON.stringify(rs) === JSON.stringify(gs).split(ghost.order).join(real.order), { real: rs, ghost: gs });
        kit.check(`${label}: no canary of A`, kit.leaks(rs, { sent: real.order }).length === 0, kit.leaks(rs, { sent: real.order }));
      }
      const next = await post(kit.fx.B.members.agent, "next", {});
      if (kit.ranReal("POST /ops/next (B's agent)", next)) {
        const n = status(next) as { status?: number; body?: string };
        kit.check("POST /ops/next (B's agent): 200, never one of A's orders, no canary of A", n.status === 200 && !String(n.body).includes(kit.fx.A.order.main) && !String(n.body).includes(kit.fx.A.order.failed) && kit.leaks(n).length === 0, n);
      }
      // the hot-path contract itself (OD36): the key is required, the body is bounded
      const noKey = await post(kit.fx.B.members.agent, "next", {}, {});
      const big = await post(kit.fx.B.members.owner, "reveal", { orderId: "X", why: "call", templateId: "x".repeat(3_000) });
      const pres = await kit.callRoute({ userId: kit.fx.B.members.agent }, route("presence"), "POST", { store: kit.fx.B.handle }, { body: { heartbeat: true } }, {});
      if (kit.ranReal("the hot-path contract", noKey, big, pres)) {
        kit.check("POST /ops/next without an Idempotency-Key: 400 idem_required", (status(noKey) as { status?: number }).status === 400 && String((status(noKey) as { body?: string }).body).includes("idem_required"), status(noKey));
        kit.check("POST /ops/reveal with a body over 2 KB: 413", (status(big) as { status?: number }).status === 413, status(big));
        kit.check("POST /ops/presence heartbeat: 200 without a key", (status(pres) as { status?: number }).status === 200, status(pres));
      }
      kit.check("ops hot path: A's rows unchanged by every attempt", (await kit.snapshotA()) === before);
    },
  },
  {
    name: "ops edits: B's owner edits, converts, blocks, holds, tracks and recalls with A's ids, never touching A",
    async run(kit) {
      const a = await seedOnce(kit);
      const ED = load<typeof import("@/lib/orders/edit")>("@/lib/orders/edit");
      const M = load<typeof import("@/lib/orders/manual")>("@/lib/orders/manual");
      const AD = load<typeof import("@/lib/orders/admin")>("@/lib/orders/admin");
      const C = load<typeof import("@/lib/orders/customers")>("@/lib/orders/customers");
      const before = await kit.snapshotA();
      const real = { order: kit.fx.A.order.main, lead: kit.fx.A.lead, page: kit.fx.A.page.live, customer: a.customerId };
      const ghost = { order: kit.ghostify(kit.fx.A.order.main), lead: kit.ghostify(kit.fx.A.lead), page: kit.ghostify(kit.fx.A.page.live), customer: ghostId26() };
      const FIXED_IDEM = "00000000-0000-4000-8000-000000000001";
      const attacks: [string, (x: typeof real) => ReturnType<typeof asBOwner>][] = [
        ["editOrder(B, A's order)", (x) => asBOwner(kit, (_c, w) => ED.editOrder(w, x.order, { note: "pwned", name: "Pwned Name" }, 0))],
        ["convertLeadToOrder(B, A's lead)", (x) => asBOwner(kit, (_c, w) => M.convertLeadToOrder(w, x.lead, { ...manualInput(""), idem: FIXED_IDEM, selection: { offerId: "", units: [], extras: {}, bump: false } }))],
        ["createManualOrder(B, A's page)", (x) => asBOwner(kit, (_c, w) => M.createManualOrder(w, { ...manualInput(x.page), idem: FIXED_IDEM }))],
        ["quoteManualOrder(B, A's page)", (x) => asBOwner(kit, (_c, w) => M.quoteManualOrder(w, { ...manualInput(x.page), idem: FIXED_IDEM }))],
        ["setOrderHold(B, A's order)", (x) => asBOwner(kit, (_c, w) => ED.setOrderHold(w, x.order, new Date(Date.now() + 3 * 86_400_000)))],
        ["setOrderTracking(B, A's order)", (x) => asBOwner(kit, (_c, w) => ED.setOrderTracking(w, x.order, { trackingRef: "TRK123", carrierLabel: "Amana" }))],
        ["requestRecall(B, A's order)", (x) => asBOwner(kit, (_c, w) => ED.requestRecall(w, x.order, "changed_mind"))],
        ["markCarrierNotified(B, A's order)", (x) => asBOwner(kit, (_c, w) => ED.markCarrierNotified(w, x.order))],
        ["saveCustomerNote(B, A's customer)", (x) => asBOwner(kit, (_c, w) => C.saveCustomerNote(w, x.customer, "pwned"))],
        ["blockPreview(B, A's order)", (x) => asBOwner(kit, (c) => AD.blockPreview(c, { orderId: x.order }))],
        ["blockPhoneAndCancel(B, A's order)", (x) => asBOwner(kit, (_c, w) => AD.blockPhoneAndCancel(w, { orderId: x.order, openOrders: "fake" }))],
      ];
      for (const [label, fn] of attacks) await same(kit, label, await fn(real), await fn(ghost));
      // A's customer's number typed in B: B's own blocklist entry; no order of A is moved or listed
      const typed = await asBOwner(kit, (_c, w) => AD.blockPhoneAndCancel(w, { phone: a.phone, openOrders: "fake" }));
      const v = (typed.ok ? typed.value : null) as { ok?: boolean; data?: { moved: unknown[]; untouched: unknown[] } } | null;
      kit.check(
        "blockPhoneAndCancel(B, A's customer's number): B's own entry, no order of A moved or listed",
        !!v?.ok && !JSON.stringify(v.data ?? {}).includes(kit.fx.A.order.main) && kit.leaks(answer(typed), { sent: a.phone }).length === 0,
        answer(typed),
      );
      kit.check("ops edits: A's rows unchanged by every attempt", (await kit.snapshotA()) === before);
    },
  },
  {
    name: "ops list: B's saved views, bulk actions, Carrier CSV, slips, undo and export writers never reach A",
    async run(kit) {
      await seedOnce(kit);
      const AD = load<typeof import("@/lib/orders/admin")>("@/lib/orders/admin");
      const Z = load<typeof import("@/lib/orders/export-zip")>("@/lib/orders/export-zip");
      const aView = await viewOf(kit.fx.A.id);
      const before = await kit.snapshotA();
      const aIds = [kit.fx.A.order.main, kit.fx.A.order.failed];
      // a saved view naming A's page: it saves in B and lists nothing of A
      const view = await asBOwner(kit, async (_c, w) => {
        const saved = await AD.saveView(w, { name: "A's page", query: { pageId: kit.fx.A.page.live } });
        return { saved: saved.ok ? "saved" : saved.error, rows: (await AD.listOrders(w.scope, { pageId: kit.fx.A.page.live })).items };
      });
      if (kit.ranReal("a saved view with A's page id", view)) {
        const v = view.ok ? (view.value as { saved: string; rows: unknown[] }) : null;
        kit.check("a saved view with A's page id is refused as not_found and its query lists no rows", !!v && v.saved === "not_found" && v.rows.length === 0, answer(view));
      }
      const views = await asBOwner(kit, async (c, w) => ({ list: await AD.listSavedViews(c), del: await AD.deleteView(w, aView), ren: await AD.renameView(w, aView, "pwned") }));
      if (kit.ranReal("B's saved-view calls with A's view id", views)) {
        const v = views.ok ? (views.value as { list: { id: string }[]; del: { ok: boolean; error?: string }; ren: { ok: boolean; error?: string } }) : null;
        kit.check("B lists none of A's views; renaming or deleting A's view answers not_found", !!v && !v.list.some((x) => x.id === aView) && v.del.error === "not_found" && v.ren.error === "not_found", answer(views));
      }
      // bulk with A's ids: not_found per id, nothing of A in the answer
      const bulk = await asBOwner(kit, async (_c, w) => ({
        move: await AD.bulkMove(w, aIds, { want: { confirm: "fake" } }),
        assign: await AD.bulkAssign(w, aIds, null),
        pin: await AD.bulkPin(w, aIds, true),
        undo: await AD.undoMove(w, ghostId26()),
      }));
      if (kit.ranReal("bulk with A's ids", bulk)) {
        type R = { ok: boolean; data?: { ok: string[]; failed: { id: string; error: string }[] }; error?: string };
        const v = bulk.ok ? (bulk.value as { move: R; assign: R; pin: R; undo: R }) : null;
        const perId = (r: R | undefined) => !!r?.ok && r.data!.ok.length === 0 && r.data!.failed.length === aIds.length && r.data!.failed.every((f) => f.error === "not_found");
        kit.check("bulkMove / bulkAssign / bulkPin with A's ids: not_found per id", !!v && perId(v.move) && perId(v.assign) && perId(v.pin), answer(bulk));
        kit.check("undoMove with a forged token: expired", v?.undo.error === "expired", answer(bulk));
        kit.check("bulk with A's ids: no canary of A", kit.leaks(answer(bulk), { sent: aIds }).length === 0, kit.leaks(answer(bulk), { sent: aIds }));
      }
      // the Carrier CSV with A's ids: listed as refused, never exported; the slips: nothing
      const carrier = await asBOwner(kit, async (c, w) => {
        await AD.saveCarrierCsvColumns(w, { columns: [{ header: "Ref", source: "order_id" }, { header: "Tel", source: "phone" }, { header: "Nom", source: "name" }] });
        return { csv: await AD.carrierExport(w, aIds, { partial: true }), slips: await AD.slipsFor(c, aIds) };
      });
      if (kit.ranReal("the Carrier CSV and the slips with A's ids", carrier)) {
        const v = carrier.ok ? (carrier.value as { csv: { ok: boolean; error?: string; notFound?: string[] }; slips: unknown[] }) : null;
        kit.check("carrierExport(B, A's ids): refused as not found, never exported", !!v && !v.csv.ok && v.csv.error === "refused" && JSON.stringify(v.csv.notFound) === JSON.stringify(aIds), answer(carrier));
        kit.check("slipsFor(B, A's ids): no slip", v?.slips.length === 0, answer(carrier));
        kit.check("the Carrier CSV and the slips: no canary of A", kit.leaks(answer(carrier), { sent: aIds }).length === 0, kit.leaks(answer(carrier), { sent: aIds }));
      }
      // the export ZIP writers of B carry nothing of A; B's test-order delete leaves A alone
      const zip = await asBOwner(kit, async (_c, w) => {
        const files: string[] = [];
        for (const f of Z.EXPORT_ZIP_WRITERS) files.push(await Z.writeZipCsv(w.scope, f.file));
        await AD.deleteTestOrders(w.scope, { olderThan: new Date(Date.now() + 86_400_000), limit: 1000 });
        return files.join("\n");
      });
      if (kit.ranReal("B's export writers", zip)) kit.check("B's export ZIP files: no canary of A", kit.leaks(answer(zip)).length === 0 && !String(zip.ok ? zip.value : "").includes(kit.fx.A.order.main), kit.leaks(answer(zip)));
      // the routes: print with A's ids answers the empty page; the Carrier CSV needs the step-up first
      const route = (name: string) => ({ file: `src/app/api/app/[store]/orders/${name}/route.ts`, template: `/api/app/[store]/orders/${name}`, methods: ["GET"] });
      const print = await kit.callRoute({ userId: kit.fx.B.members.owner }, route("print"), "GET", { store: kit.fx.B.handle }, { query: { ids: aIds.join(",") } }, {});
      const csv = await kit.callRoute({ userId: kit.fx.B.members.owner }, route("carrier-csv"), "GET", { store: kit.fx.B.handle }, { query: { ids: aIds.join(",") } }, {});
      if (kit.ranReal("the print and carrier-csv routes with A's ids", print, csv)) {
        kit.check("GET /orders/print with A's ids: no canary of A", kit.leaks(answer(print), { sent: aIds }).length === 0, kit.leaks(answer(print), { sent: aIds }));
        kit.check("GET /orders/carrier-csv with A's ids: no canary of A (step-up or refusal first)", kit.leaks(answer(csv), { sent: aIds }).length === 0, answer(csv));
      }
      kit.check("ops list: A's rows unchanged by every attempt", (await kit.snapshotA()) === before);
    },
  },
  {
    name: "ops insights: B's KPIs, tiles, aggregates, board, pulse, search and label mapping never count or touch A",
    async run(kit) {
      await seedOnce(kit);
      const { db } = load<typeof import("@/lib/db/client")>("@/lib/db/client");
      const S = load<typeof import("@/lib/db/schema")>("@/lib/db/schema");
      const { eq } = load<typeof import("drizzle-orm")>("drizzle-orm");
      const PR = load<typeof import("@/lib/orders/profile")>("@/lib/orders/profile");
      const AG = load<typeof import("@/lib/callcenter/aggregates")>("@/lib/callcenter/aggregates");
      const BD = load<typeof import("@/lib/callcenter/board.server")>("@/lib/callcenter/board.server");
      const LB = load<typeof import("@/lib/callcenter/labels")>("@/lib/callcenter/labels");
      const { contributor } = load<typeof import("@/lib/pulse/contributors/ops")>("@/lib/pulse/contributors/ops");
      const { provider } = load<typeof import("@/lib/admin-data/search/ops")>("@/lib/admin-data/search/ops");
      const countOf = async (storeId: string) => (await db.select({ id: S.orders.id }).from(S.orders).where(eq(S.orders.storeId, storeId))).length;
      const bTotal = await countOf(kit.fx.B.id);
      // A's main order carries a sheet label nobody mapped: mapping that label in B must never touch it
      await db.update(S.orders).set({ confirmedByLabel: "Tenancy Label" }).where(eq(S.orders.id, kit.fx.A.order.main));
      const before = await kit.snapshotA();
      const reads = await asBOwner(kit, async (c, w) => {
        PR.forgetOrderInsights(w.scope);
        const today = new Date().toISOString().slice(0, 10);
        const from = new Date(Date.now() - 27 * 86_400_000).toISOString().slice(0, 10);
        return {
          kpis: await PR.orderKpis(w.scope, "28d"),
          counts: await PR.queueCounts(w.scope),
          agg: await AG.opsAggregates(w.scope, { from, to: today, dims: ["city", "page", "source", "agent"] }),
          board: await BD.boardState(w.scope),
          pulse: await contributor.contribute(w.scope, { userId: c.user.id, role: "owner" }),
          search: await provider.search(w.scope, kit.fx.A.customer.phone.slice(-6), { userId: c.user.id, role: "owner" }),
          searchName: await provider.search(w.scope, kit.fx.A.customer.name.slice(0, 5), { userId: c.user.id, role: "owner" }),
          map: await LB.mapAgentLabel(w, "Tenancy Label", kit.fx.B.members.agent),
          fill: await LB.backfillMappedLabel(w, "Tenancy Label", kit.fx.B.members.agent),
        };
      });
      if (kit.ranReal("B's insight reads", reads)) {
        type R = {
          kpis: { placed: number };
          counts: { toCallNow: number; toShip: number; callbacksDue: number };
          agg: { cells: Record<string, { key: string; placed: number }[]> };
          board: { agents: { userId: string }[] };
          pulse: Record<string, number>;
          search: { id: string }[];
          searchName: { id: string }[];
          map: { ok: boolean };
          fill: { count: number };
        };
        const v = reads.ok ? (reads.value as R) : null;
        const aggPlaced = v ? Object.values(v.agg.cells).map((cells) => cells.reduce((s, c) => s + c.placed, 0)) : [];
        kit.check("orderKpis / queueCounts of B count B's orders only", !!v && v.kpis.placed <= bTotal && v.counts.toCallNow <= bTotal && v.counts.toShip <= bTotal, v && { kpis: v.kpis.placed, counts: v.counts, bTotal });
        kit.check("opsAggregates of B never counts A's rows (every dim sums to at most B's orders)", aggPlaced.every((n) => n <= bTotal), { aggPlaced, bTotal });
        kit.check("opsAggregates of B: no cell keyed by A's page", !!v && !v.agg.cells.page!.some((c) => c.key === kit.fx.A.page.live), v?.agg.cells.page);
        kit.check("the board of B lists none of A's members", !!v && !v.board.agents.some((a) => Object.values(kit.fx.A.members).includes(a.userId) && !Object.values(kit.fx.B.members).includes(a.userId)), v?.board.agents);
        kit.check("the ops pulse contributor of B counts B's rows only", !!v && (v.pulse.queueNow ?? 0) <= bTotal && (v.pulse.newOrders ?? 0) <= bTotal, v?.pulse);
        kit.check("⌘K in B finds none of A's orders by A's phone digits or name", !!v && !v.search.some((h) => h.id === kit.fx.A.order.main || h.id === kit.fx.A.order.failed) && !v.searchName.some((h) => h.id === kit.fx.A.order.main), v && { search: v.search, name: v.searchName });
        kit.check("mapping a label in B touches no order of A", !!v && v.fill.count === 0, v?.fill);
        kit.check("B's insight reads: no canary of A", kit.leaks(answer(reads)).length === 0, kit.leaks(answer(reads)));
      }
      const [a] = await db.select({ by: S.orders.confirmedBy }).from(S.orders).where(eq(S.orders.id, kit.fx.A.order.main)).limit(1);
      kit.check("A's order keeps confirmed_by NULL after B mapped the same label", a?.by === null, a);
      // GET /ops/state on B's address: B's board only; on A's address: the guard's refusal
      const route = { file: "src/app/api/app/[store]/ops/state/route.ts", template: "/api/app/[store]/ops/state", methods: ["GET"] };
      const onB = await kit.callRoute({ userId: kit.fx.B.members.owner }, route, "GET", { store: kit.fx.B.handle }, { query: { view: "board" } }, {});
      const onA = await kit.callRoute({ userId: kit.fx.B.members.owner }, route, "GET", { store: kit.fx.A.handle }, { query: { view: "board" } }, {});
      const queue = await kit.callRoute({ userId: kit.fx.B.members.agent }, route, "GET", { store: kit.fx.B.handle }, { query: { view: "queue" } }, {});
      if (kit.ranReal("GET /ops/state", onB, onA, queue)) {
        kit.check("GET /ops/state?view=board on B: no canary of A", kit.leaks(answer(onB)).length === 0, kit.leaks(answer(onB)));
        kit.check("GET /ops/state on A's address by B's owner: refused", onA.ok && (onA.value as { status: number }).status >= 400, answer(onA));
        kit.check("GET /ops/state?view=queue by B's agent: no canary of A", kit.leaks(answer(queue)).length === 0, kit.leaks(answer(queue)));
      }
      kit.check("ops insights: A's rows unchanged by every attempt", (await kit.snapshotA()) === before);
      await db.update(S.orders).set({ confirmedByLabel: null }).where(eq(S.orders.id, kit.fx.A.order.main));
    },
  },
  {
    name: "ops finance: B's owner saves Profit lite costs on A's page, marks A's cash, and reads none of A's figures",
    async run(kit) {
      await seedOnce(kit);
      const FC = load<typeof import("@/lib/finance/lite/costs.server")>("@/lib/finance/lite/costs.server");
      const FB = load<typeof import("@/lib/finance/lite/breakeven.server")>("@/lib/finance/lite/breakeven.server");
      const FR = load<typeof import("@/lib/finance/lite/carrier.server")>("@/lib/finance/lite/carrier.server");
      const FP = load<typeof import("@/lib/finance/lite/spend.server")>("@/lib/finance/lite/spend.server");
      const { markCashReceived } = load<typeof import("@/lib/finance/lite/settlement.server")>("@/lib/finance/lite/settlement.server");
      const before = await kit.snapshotA();
      const real = { page: kit.fx.A.page.live, order: kit.fx.A.order.main };
      const ghost = { page: kit.ghostify(kit.fx.A.page.live), order: kit.ghostify(kit.fx.A.order.main) };
      const attacks: [string, (x: typeof real) => ReturnType<typeof asBOwner>][] = [
        ["saveItemCost(B, A's page)", (x) => asBOwner(kit, (_c, w) => FC.saveItemCost(w, { pageId: x.page, itemId: "main", costCents: 1_000 }))],
        ["breakEvenFor(B, A's page)", (x) => asBOwner(kit, (c) => FB.breakEvenFor(c.scope, { pageId: x.page }))],
        ["costHistory(B, A's page)", (x) => asBOwner(kit, (c) => FC.costHistory(c.scope, { pageId: x.page, itemId: "main" }))],
      ];
      for (const [label, fn] of attacks) await same(kit, label, await fn(real), await fn(ghost));
      // Mark cash received with A's order: answered per id (the id sent comes back), not_found like a missing one
      const cash = await asBOwner(kit, (_c, w) => markCashReceived(w, [real.order, ghost.order]));
      if (kit.ranReal("markCashReceived(B, A's order)", cash)) {
        const v = cash.ok ? (cash.value as { ok: boolean; data?: { ok: string[]; failed: { id: string; error: string }[] } }) : null;
        kit.check("markCashReceived(B, A's order): not_found per id, like a missing one", !!v?.ok && v.data!.ok.length === 0 && v.data!.failed.length === 2 && v.data!.failed.every((f) => f.error === "not_found"), answer(cash));
        kit.check("markCashReceived(B, A's order): no canary of A", kit.leaks(answer(cash), { sent: [real.order, ghost.order] }).length === 0, kit.leaks(answer(cash), { sent: [real.order, ghost.order] }));
      }
      const reads = await asBOwner(kit, async (c) => ({ costs: await FC.costsOverview(c.scope, "MAD"), rates: await FR.myCarrierRates(c.scope), grid: await FP.adSpendGrid(c.scope, 14), card: await FB.breakEvenFor(c.scope) }));
      kit.check("Profit lite reads in B carry nothing of A (pages, rates, grid, card)", reads.ok && !JSON.stringify(answer(reads)).includes(kit.fx.A.page.live) && kit.leaks(answer(reads)).length === 0, answer(reads));
      kit.check("ops finance: A's rows unchanged by every attempt", (await kit.snapshotA()) === before);
    },
  },
];

/* ------------------------------------------------------------------ */
/* the queue's server actions (src/app/app/[store]/queue/actions.ts)    */
/* ------------------------------------------------------------------ */

const QUEUE = "src/app/app/[store]/queue/actions.ts";
const ORDERS = "src/app/app/[store]/orders/actions.ts";
const CUSTOMERS = "src/app/app/[store]/customers/actions.ts";
const AGENTS = "src/app/app/[store]/team/agents/actions.ts";
const CALLCENTER = "src/app/app/[store]/team/callcenter/actions.ts";
const WINDOW = "src/lib/callcenter/window-actions.ts";
const FINANCE = "src/app/app/[store]/finance/actions.ts";
/** a calling week in the ISO shape (OD57) */
const WEEK = { 1: [{ from: "09:00", to: "19:00" }], 2: [{ from: "09:00", to: "19:00" }], 3: [{ from: "09:00", to: "19:00" }], 4: [{ from: "09:00", to: "19:00" }], 5: [{ from: "09:00", to: "12:00" }], 6: [{ from: "10:00", to: "16:00" }], 7: [] };
const SCRIPT = { v: 1, steps: [{ id: "hello", title: "Bonjour", say: "Bonjour {customer_first_name}" }] };

/** A fresh AI draft script of `storeId` (an approve flips it, so every call gets its own). */
async function draftOf(storeId: string): Promise<string> {
  const { db } = load<typeof import("@/lib/db/client")>("@/lib/db/client");
  const S = load<typeof import("@/lib/db/schema")>("@/lib/db/schema");
  const { newId } = load<typeof import("@/lib/db/ids")>("@/lib/db/ids");
  const id = newId();
  await db.insert(S.messageTemplates).values({ id, storeId, channel: "call_script", kind: "script", locale: "fr", pageId: null, name: "AI draft", body: JSON.stringify(SCRIPT), status: "draft", source: "ai" });
  return id;
}
/** an Idempotency-Key the cache refuses (not a UUID): the real and the ghost call each run, never a replay of the other */
const NO_CACHE = "tenancy-no-cache";

/** A note of `orderId` (its event id), or an id no note has. */
async function noteOf(orderId: string): Promise<number> {
  const { db } = load<typeof import("@/lib/db/client")>("@/lib/db/client");
  const S = load<typeof import("@/lib/db/schema")>("@/lib/db/schema");
  const { and, eq } = load<typeof import("drizzle-orm")>("drizzle-orm");
  const [row] = await db
    .select({ id: S.orderEvents.id })
    .from(S.orderEvents)
    .where(and(eq(S.orderEvents.orderId, orderId), eq(S.orderEvents.type, "note")))
    .limit(1);
  return row?.id ?? GHOST_EVENT;
}

/** A shared orders view of `storeId` (made on first use; `fresh` makes another), for the saved-view action cases. */
async function viewOf(storeId: string, fresh = false): Promise<string> {
  const { db } = load<typeof import("@/lib/db/client")>("@/lib/db/client");
  const S = load<typeof import("@/lib/db/schema")>("@/lib/db/schema");
  const { and, eq, isNull } = load<typeof import("drizzle-orm")>("drizzle-orm");
  const { newId } = load<typeof import("@/lib/db/ids")>("@/lib/db/ids");
  if (!fresh) {
    const [row] = await db
      .select({ id: S.savedViews.id })
      .from(S.savedViews)
      .where(and(eq(S.savedViews.storeId, storeId), eq(S.savedViews.surface, "orders"), isNull(S.savedViews.userId)))
      .limit(1);
    if (row) return row.id;
  }
  const id = newId();
  await db.insert(S.savedViews).values({ id, storeId, userId: null, surface: "orders", name: "To pack · Fès", query: { view: "to_pack", cityKey: "fes" }, position: 0 });
  return id;
}

export const actions: TrackActionCase[] = [
  { file: QUEUE, name: "nextOrderAction", area: "orders", path: "/queue", permission: ["agents.self"], write: true, victim: () => [randomUUID()], own: () => [randomUUID()] },
  { file: QUEUE, name: "releaseOrderAction", area: "orders", path: "/queue", permission: ["agents.self"], write: true, victim: (fx) => [fx.A.order.main, "skip"], own: (fx) => [fx.B.order.main, "skip"] },
  { file: QUEUE, name: "setPresenceAction", area: "orders", path: "/queue", permission: ["agents.self"], write: true, victim: () => ["online"], own: () => ["online"] },
  {
    file: QUEUE,
    name: "recordOutcomeAction",
    area: "orders",
    path: "/queue",
    permission: ["orders.write"],
    write: true,
    victim: (fx) => [{ orderId: fx.A.order.main, expectRev: 0, channel: "call", outcome: "no_answer", idem: NO_CACHE }],
    own: async (fx, fresh) => [{ orderId: await fresh.order(fx.B), expectRev: 0, channel: "call", outcome: "no_answer", idem: NO_CACHE }],
  },
  { file: QUEUE, name: "revealPhoneAction", area: "orders", path: "/queue", permission: ["orders.reveal_phone"], write: true, victim: (fx) => [fx.A.order.main, "call"], own: (fx) => [fx.B.order.main, "call"] },
  { file: QUEUE, name: "addNoteAction", area: "orders", path: "/queue", permission: ["orders.write"], write: true, victim: (fx) => [fx.A.order.main, "pwned"], own: (fx) => [fx.B.order.main, "Rappeler après 18h"] },
  {
    file: QUEUE,
    name: "editNoteAction",
    area: "orders",
    path: "/queue",
    permission: ["orders.write"],
    write: true,
    victim: async (fx) => [fx.A.order.main, await noteOf(fx.A.order.main), "pwned"],
    own: async (fx) => [fx.B.order.main, await noteOf(fx.B.order.main), "Rappeler après 19h"],
  },
  { file: QUEUE, name: "takeOrderAction", area: "orders", path: "/queue", permission: ["agents.self"], write: true, victim: (fx) => [fx.A.order.main, { inbound: true }], own: (fx) => [fx.B.order.main, {}] },
  { file: QUEUE, name: "inboundLookupAction", area: "orders", path: "/queue", permission: ["agents.self"], write: true, victim: (fx) => [fx.A.customer.phone], own: (fx) => [fx.B.customer.phone] },
  // the console's reads (P4 step 9): the script tab and the timeline column of an order the member sees
  { file: QUEUE, name: "queueScriptAction", area: "orders", path: "/queue", permission: ["orders.read"], write: false, victim: (fx) => [fx.A.order.main, "ar"], own: (fx) => [fx.B.order.main, "ar"] },
  { file: QUEUE, name: "queueTimelineAction", area: "orders", path: "/queue", permission: ["orders.read"], write: false, victim: (fx) => [fx.A.order.main], own: (fx) => [fx.B.order.main] },
  // the orders screen (P4 step 5); the R1.0 actions of the same file stay in the harness's own catalogue
  { file: ORDERS, name: "moveOrderAction", area: "orders", path: "/orders", permission: ["orders.write"], write: true, victim: (fx) => [fx.A.order.main, "no_answer"], own: async (fx, fresh) => [await fresh.order(fx.B), "no_answer"] },
  { file: ORDERS, name: "forceMoveAction", area: "orders", path: "/orders", permission: ["orders.force_status"], write: true, victim: (fx) => [fx.A.order.main, "fake", "attack"], own: async (fx, fresh) => [await fresh.order(fx.B), "fake", "test reason"] },
  { file: ORDERS, name: "editOrderAction", area: "orders", path: "/orders", permission: ["orders.edit"], write: true, victim: (fx) => [fx.A.order.main, { note: "pwned" }, 0], own: async (fx, fresh) => [await fresh.order(fx.B), { note: "Porte bleue" }, 0] },
  { file: ORDERS, name: "quoteManualOrderAction", area: "orders", path: "/orders", permission: ["orders.create"], write: true, victim: (fx) => [manualInput(fx.A.page.live)], own: (fx) => [manualInput(fx.B.page.live)] },
  { file: ORDERS, name: "createManualOrderAction", area: "orders", path: "/orders", permission: ["orders.create"], write: true, victim: (fx) => [manualInput(fx.A.page.live)], own: (fx) => [manualInput(fx.B.page.live)] },
  {
    file: ORDERS,
    name: "convertLeadAction",
    area: "orders",
    path: "/orders",
    permission: ["orders.create", "leads.write"],
    write: true,
    victim: (fx) => [fx.A.lead, { ...manualInput(""), pageId: undefined }],
    own: (fx) => [fx.B.lead, { ...manualInput(""), pageId: undefined }],
  },
  { file: ORDERS, name: "dismissDuplicateAction", area: "orders", path: "/orders", permission: ["orders.write"], write: true, victim: (fx) => [fx.A.order.main, fx.A.order.failed], own: (fx) => [fx.B.order.main, fx.B.order.failed] },
  { file: ORDERS, name: "setShipAfterAction", area: "orders", path: "/orders", permission: ["orders.write"], write: true, victim: (fx) => [fx.A.order.main, null], own: async (fx, fresh) => [await fresh.order(fx.B), null] },
  { file: ORDERS, name: "setTrackingAction", area: "orders", path: "/orders", permission: ["shipments.write"], write: true, victim: (fx) => [fx.A.order.main, { trackingRef: "TRK1" }], own: async (fx, fresh) => [await fresh.order(fx.B), { trackingRef: "TRK2", carrierLabel: "Amana" }] },
  { file: ORDERS, name: "requestRecallAction", area: "orders", path: "/orders", permission: ["orders.write"], write: true, victim: (fx) => [fx.A.order.main, "changed_mind"], own: async (fx, fresh) => [await fresh.order(fx.B), "changed_mind"] },
  { file: ORDERS, name: "markCarrierNotifiedAction", area: "orders", path: "/orders", permission: ["shipments.write"], write: true, victim: (fx) => [fx.A.order.main], own: async (fx, fresh) => [await fresh.order(fx.B)] },
  { file: ORDERS, name: "assignOrderAction", area: "orders", path: "/orders", permission: ["orders.assign"], write: true, victim: (fx) => [fx.A.order.main, null], own: async (fx, fresh) => [await fresh.order(fx.B), null] },
  // the customers screen (P4 step 5)
  { file: CUSTOMERS, name: "blockPreviewAction", area: "blocklist", path: "/customers", permission: ["blocklist.write"], write: true, victim: (fx) => [{ orderId: fx.A.order.main }], own: (fx) => [{ orderId: fx.B.order.main }] },
  { file: CUSTOMERS, name: "blockPhoneAndCancelAction", area: "blocklist", path: "/customers", permission: ["blocklist.write"], write: true, victim: (fx) => [{ orderId: fx.A.order.main, openOrders: "fake" }], own: () => [{ phone: `+2126${String(Math.floor(Math.random() * 9e7) + 1e7)}`, openOrders: "keep" }] },
  { file: CUSTOMERS, name: "unblockAction", area: "blocklist", path: "/customers", permission: ["blocklist.write"], write: true, victim: (fx) => [fx.A.block.phone], own: (fx, fresh) => fresh.block(fx.B).then((id) => [id]) },
  { file: CUSTOMERS, name: "saveCustomerNoteAction", area: "orders", path: "/customers", permission: ["orders.write"], write: true, victim: async (fx) => [await customerOf(fx.A.order.main), "pwned"], own: async (fx) => [await customerOf(fx.B.order.main), "Client fidèle"] },
  // P4 step 6: the list's bulk, undo, saved views, Carrier file columns and test-order delete
  { file: ORDERS, name: "bulkAssignAction", area: "orders", path: "/orders", permission: ["orders.assign"], write: true, victim: (fx) => [[fx.A.order.main], null, NO_CACHE], own: async (fx, fresh) => [[await fresh.order(fx.B)], null, NO_CACHE] },
  { file: ORDERS, name: "bulkPinAction", area: "orders", path: "/orders", permission: ["orders.assign"], write: true, victim: (fx) => [[fx.A.order.main], true, NO_CACHE], own: async (fx, fresh) => [[await fresh.order(fx.B)], true, NO_CACHE] },
  { file: ORDERS, name: "bulkMoveAction", area: "orders", path: "/orders", permission: ["orders.write"], write: true, victim: (fx) => [[fx.A.order.main], { legacy: "fake" }, NO_CACHE], own: async (fx, fresh) => [[await fresh.order(fx.B)], { legacy: "no_answer" }, NO_CACHE] },
  { file: ORDERS, name: "undoMoveAction", area: "orders", path: "/orders", permission: ["orders.write"], write: true, victim: () => [ghostId26()], own: () => [ghostId26()] },
  { file: ORDERS, name: "saveCarrierCsvColumnsAction", area: "orders", path: "/orders", permission: ["shipments.write"], write: true, victim: () => [{ columns: [{ header: "Ref", source: "order_id" }] }], own: () => [{ columns: [{ header: "Ref", source: "order_id" }, { header: "Tel", source: "phone" }], delimiter: ";" }] },
  { file: ORDERS, name: "deleteTestOrdersAction", area: "orders", path: "/orders", permission: ["settings.write"], write: true, victim: () => [], own: () => [] },
  { file: ORDERS, name: "listSavedViewsAction", area: "orders", path: "/orders", permission: ["orders.read"], write: false, victim: () => [], own: () => [] },
  { file: ORDERS, name: "saveViewAction", area: "orders", path: "/orders", permission: ["orders.write"], write: true, victim: (fx) => [{ name: "A's page", query: { pageId: fx.A.page.live } }], own: (fx) => [{ name: "Mes commandes", query: { pageId: fx.B.page.live } }] },
  { file: ORDERS, name: "renameViewAction", area: "orders", path: "/orders", permission: ["orders.write"], write: true, victim: async (fx) => [await viewOf(fx.A.id), "pwned"], own: async (fx) => [await viewOf(fx.B.id), "Renamed"] },
  { file: ORDERS, name: "deleteViewAction", area: "orders", path: "/orders", permission: ["orders.write"], write: true, victim: async (fx) => [await viewOf(fx.A.id)], own: async (fx) => [await viewOf(fx.B.id, true)] },
  { file: ORDERS, name: "reorderViewsAction", area: "orders", path: "/orders", permission: ["orders.write"], write: true, victim: async (fx) => [[await viewOf(fx.A.id)]], own: async (fx) => [[await viewOf(fx.B.id)]] },
  // P4 step 7: the team screens' settings, label mapping, scripts and the calling window; ⌘K's test order
  { file: AGENTS, name: "updateAgentProfileAction", area: "team", path: "/team/agents", permission: ["callcenter.configure"], write: true, victim: (fx) => [fx.A.members.agent, { dailyCap: 1, weight: 5 }], own: (fx) => [fx.B.members.agent, { dailyCap: 40, weight: 2 }] },
  { file: AGENTS, name: "mapAgentLabelAction", area: "team", path: "/team/agents", permission: ["callcenter.configure"], write: true, victim: (fx) => ["Pwned", fx.A.members.agent], own: (fx) => ["Hamid", fx.B.members.agent] },
  { file: AGENTS, name: "unmapAgentLabelAction", area: "team", path: "/team/agents", permission: ["callcenter.configure"], write: true, victim: () => ["Pwned"], own: () => ["Hamid"] },
  { file: CALLCENTER, name: "saveOpsSettingsAction", area: "settings", path: "/team/callcenter", permission: ["callcenter.configure"], write: true, victim: () => [{ busyRetryMinutes: 5 }], own: () => [{ busyRetryMinutes: 20, firstTouchTargetMin: 15 }] },
  { file: CALLCENTER, name: "openCallsNowAction", area: "settings", path: "/team/callcenter", permission: ["callcenter.configure"], write: true, victim: () => [], own: () => [] },
  { file: CALLCENTER, name: "saveWindowOverridesAction", area: "settings", path: "/team/callcenter", permission: ["callcenter.configure"], write: true, victim: () => [[]], own: () => [[{ label: "Ramadan", from: "2027-02-08", to: "2027-03-09", days: WEEK }]] },
  { file: CALLCENTER, name: "saveScriptAction", area: "settings", path: "/team/callcenter", permission: ["callcenter.configure"], write: true, victim: (fx) => [{ pageId: fx.A.page.live, locale: "fr", doc: SCRIPT }], own: (fx) => [{ pageId: fx.B.page.live, locale: "fr", doc: SCRIPT }], mixed: (fx) => [{ pageId: fx.A.page.live, locale: "fr", doc: SCRIPT }] },
  { file: CALLCENTER, name: "resetScriptAction", area: "settings", path: "/team/callcenter", permission: ["callcenter.configure"], write: true, victim: (fx) => [{ pageId: fx.A.page.live, locale: "fr" }], own: (fx) => [{ pageId: fx.B.page.live, locale: "fr" }] },
  { file: CALLCENTER, name: "approveScriptDraftAction", area: "settings", path: "/team/callcenter", permission: ["callcenter.configure"], write: true, victim: async (fx) => [await draftOf(fx.A.id)], own: async (fx) => [await draftOf(fx.B.id)] },
  { file: WINDOW, name: "saveCallingWindowAction", area: "settings", path: "/team/callcenter", permission: ["callcenter.configure"], write: true, victim: () => [{ days: WEEK }], own: () => [{ days: WEEK, closedDates: ["2026-12-25"] }] },
  { file: ORDERS, name: "openTestOrderAction", area: "pages", path: "/orders", permission: ["pages.publish"], write: true, victim: () => [], own: () => [] },
  { file: FINANCE, name: "saveItemCostAction", area: "settings", path: "/finance", permission: ["finance.write"], write: true, victim: (fx) => [{ pageId: fx.A.page.live, itemId: "main", costCents: 1_000 }], own: (fx) => [{ pageId: fx.B.page.live, itemId: "main", costCents: 3_800 }] },
  { file: FINANCE, name: "saveSkuCostAction", area: "settings", path: "/finance", permission: ["finance.write"], write: true, victim: () => [{ sku: "PWN-1", costCents: 1 }], own: () => [{ sku: "ARG-250", costCents: 3_800 }] },
  { file: FINANCE, name: "saveCarrierRateAction", area: "settings", path: "/finance", permission: ["finance.write"], write: true, victim: () => [{ cityKey: "*", deliveryFeeCents: 1, returnFeeCents: 1 }], own: () => [{ cityKey: "*", deliveryFeeCents: 3_500, returnFeeCents: 2_000 }] },
  { file: FINANCE, name: "saveAdSpendCellAction", area: "settings", path: "/finance", permission: ["finance.write"], write: true, victim: () => [{ platform: "meta", day: new Date().toISOString().slice(0, 10), spendCents: 1 }], own: () => [{ platform: "meta", day: new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10), spendCents: 10_000 }] },
  { file: FINANCE, name: "savePackagingAction", area: "settings", path: "/finance", permission: ["finance.write"], write: true, victim: () => [{ packagingCents: 1 }], own: () => [{ packagingCents: 500 }] },
  { file: FINANCE, name: "saveSettlementAction", area: "settings", path: "/finance", permission: ["finance.write"], write: true, victim: () => [{ settlement: "statement" }], own: () => [{ settlement: "at_delivery" }] },
  { file: FINANCE, name: "saveAdAccountAction", area: "settings", path: "/finance", permission: ["finance.write"], write: true, victim: () => [{ platform: "meta", currency: "EUR" }], own: () => [{ platform: "meta", currency: "USD" }] },
  { file: FINANCE, name: "saveAdRateAction", area: "settings", path: "/finance", permission: ["finance.write"], write: true, victim: () => [{ currency: "EUR", fromDay: "2026-10-01", rateMilli: 1 }], own: () => [{ currency: "USD", fromDay: "2026-10-01", rateMilli: 9_850 }] },
  { file: FINANCE, name: "markCashReceivedAction", area: "orders", path: "/finance", permission: ["finance.write"], write: true, victim: (fx) => [[fx.A.order.main]], own: async (fx, fresh) => [[await fresh.order(fx.B)]] },
  // P4 step 10: the list's "Show more", the drawer's timeline and note hiding, the manual-order sheet's reads
  { file: ORDERS, name: "listOrdersAction", area: "orders", path: "/orders", permission: ["orders.read"], write: false, victim: (fx) => [{ page_id: fx.A.page.live }, "MjAyNi0xMS0wNlQwMDowMDowMC4wMDBaLiIx"], own: (fx) => [{ page_id: fx.B.page.live }, "MjAyNi0xMS0wNlQwMDowMDowMC4wMDBaLiIx"] },
  { file: ORDERS, name: "orderTimelineAction", area: "orders", path: "/orders", permission: ["orders.read"], write: false, victim: (fx) => [fx.A.order.main, { filter: "notes" }], own: (fx) => [fx.B.order.main, { filter: "all" }] },
  { file: ORDERS, name: "hideNoteAction", area: "orders", path: "/orders", permission: ["orders.assign"], write: true, victim: (fx) => [fx.A.order.main, 1], own: (fx) => [fx.B.order.main, 1] },
  { file: ORDERS, name: "manualSheetBootAction", area: "orders", path: "/orders", permission: ["orders.create"], write: true, victim: () => [], own: () => [] },
  { file: ORDERS, name: "manualPageAction", area: "orders", path: "/orders", permission: ["orders.create"], write: true, victim: (fx) => [fx.A.page.live], own: (fx) => [fx.B.page.live] },
];
