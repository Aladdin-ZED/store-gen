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
 * Modules are loaded inside the cases (the harness has set the environment by then): this file imports types only.
 */
import Module from "node:module";
import type { TenancyCase, TenancyKit } from "../tenancy-check";
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
];
