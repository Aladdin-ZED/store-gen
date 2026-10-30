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
];

/* ------------------------------------------------------------------ */
/* the queue's server actions (src/app/app/[store]/queue/actions.ts)    */
/* ------------------------------------------------------------------ */

const QUEUE = "src/app/app/[store]/queue/actions.ts";
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
];
