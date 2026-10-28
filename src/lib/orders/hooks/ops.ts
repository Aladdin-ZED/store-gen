/**
 * Order hooks of the ops track (P4 CALL CENTER, operations.md OPE-§3.6, §9.1, §9.3, §10.1, §10.2, §21.4, §26).
 * Extension file (docs/STORE-SAAS.md §K.3; operations.md OPE-§3.6), created empty at P0 and imported by
 * src/lib/orders/hooks.ts; the track fills it and never edits the registry. Runs first (ops, then landing, then
 * integrations): `customer_id` and `city_key` are set here before landing's attribution reads them.
 *
 *   ops.created   afterCommit on created. One transaction: the `created` event (createOrderRow, maintainer-owned, does
 *                 not write it: P4 does, exactly once), `city_key` (exact or alias match only; a fuzzy match writes
 *                 nothing, the drawer suggests), `priority`, the customer row and `customer_id`. Then, each step on its
 *                 own: a honeypot order goes to `fake` (reason honeypot, source system) and stops there; the
 *                 store-wide duplicate check (`duplicate_suspected` on the new order and each match); the assignment
 *                 (`assignOnCreate`); the batched "new orders" notification of owners, admins and managers.
 *   ops.counters  inTx on transition: the customer counter deltas of the moves (test orders: none).
 *
 * Test orders (D54, OPE-§3.6): the customer counts them in `test_count` only, the duplicate check compares them with
 * test orders only, the queue hands them out like any order, and no "new orders" notification is sent. Hooks never
 * throw into the caller: a failed step is logged under `orders:hook:<name>` (src/lib/orders/hooks.ts).
 */
import { eq } from "drizzle-orm";
import { priorityOf } from "@/lib/callcenter/priority";
import { db } from "@/lib/db/client";
import { orderEvents, orders } from "@/lib/db/schema";
import { toCents } from "@/lib/finance/lite/cents";
import { notify } from "@/lib/platform/notify";
import { getStoreSetting } from "@/lib/settings";
import { getStoreById } from "@/lib/tenancy/public";
import { byId, whereStore } from "@/lib/tenancy/sql";
import type { WriteScope } from "@/lib/tenancy/types";
import { normalizeCity, type CityKey } from "../address";
import { applyCounterDeltas, counterDeltas, upsertCustomerForOrder } from "../customers";
import { findDuplicates } from "../duplicates";
import { appendEvents } from "../events";
import type { OrderHook, OrderHookEvent, OrderRow } from "../hooks";
import { logError } from "../log";
import { assignOnCreate } from "../queue";
import { transitionOrder } from "../transition";

const FLAG_CODE = /^[a-z0-9_.:-]{1,32}$/;

/**
 * The `created` event, `city_key`, `priority` and the customer, in one transaction (OPE-§9.1: same transaction).
 * Answers false when the order already has its `created` event (a hook run twice): nothing is written again.
 */
async function createdBookkeeping(scope: WriteScope, o: OrderRow, ctx: { market: string; aliases: Record<string, CityKey>; honeypot: boolean }): Promise<boolean> {
  const city = o.city ? normalizeCity(o.city, ctx.market, ctx.aliases) : null;
  const cityKey = city && (city.confidence === "exact" || city.confidence === "alias") ? city.key : null;
  const priority = priorityOf({ states: { confirm: o.confirmState, ship: o.shipState }, totalCents: toCents(o.total), risk: o.riskScore, attempts: o.attempts, priority: o.priority });
  return db.transaction(async (tx) => {
    // never twice: a retried hook finds its own event
    const [seen] = await tx
      .select({ id: orderEvents.id })
      .from(orderEvents)
      .where(whereStore(orderEvents, scope, eq(orderEvents.orderId, o.id), eq(orderEvents.type, "created")))
      .limit(1);
    if (seen) return false;
    // the order row first, then the customer row: the lock order of every transition (no deadlock between the two)
    await tx.update(orders).set({ cityKey, priority }).where(byId(orders, scope, o.id));
    await appendEvents(tx, scope, [
      {
        orderId: o.id,
        actorKind: o.createdBy ? "user" : "customer",
        actorId: o.createdBy ?? null,
        type: "created",
        at: o.createdAt,
        rev: o.rev,
        meta: {
          source: o.source,
          pageId: o.pageId,
          versionId: o.versionId,
          totalCents: toCents(o.total),
          risk: Math.max(0, Math.min(100, o.riskScore)),
          flags: (o.flags ?? []).filter((f) => FLAG_CODE.test(f)).slice(0, 24),
          ...(o.isTest ? { test: true } : {}),
        },
      },
    ]);
    // a bot's order never becomes a customer's history (its phone may be anyone's)
    if (!ctx.honeypot) {
      await upsertCustomerForOrder(tx, scope, { id: o.id, phone: o.phone, name: o.name, city: o.city, cityKey, locale: o.locale, isTest: o.isTest, createdAt: o.createdAt });
    }
    return true;
  });
}

/** "14:02" in the store's time zone (the notification says "12 new orders since 14:02"). */
function storeClock(at: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(at);
  } catch {
    return at.toISOString().slice(11, 16);
  }
}

/** One step after the bookkeeping: logged on failure, never stopping the next one. */
async function step(name: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    logError(`orders:hook:ops.created:${name}`, err);
  }
}

async function onCreated(scope: WriteScope, e: OrderHookEvent): Promise<void> {
  if (e.on !== "created") return;
  const o = e.order;
  const honeypot = (o.flags ?? []).includes("honeypot");
  const [store, ops] = await Promise.all([getStoreById(scope.storeId), getStoreSetting(scope, "ops")]);
  // a second run of the hook for the same order (a replayed creation) changes nothing: no second duplicate flag or ping
  if (!(await createdBookkeeping(scope, o, { market: store?.market ?? "MA", aliases: ops.cityAliases as Record<string, CityKey>, honeypot }))) return;

  // a honeypot order never reaches a person (OPE-§10.2): fake, by the system, and nothing else
  if (honeypot) {
    await step("honeypot", () => transitionOrder({ kind: "system", userId: null }, scope, { orderId: o.id, want: { confirm: "fake" }, source: "system", reason: "honeypot" }));
    return;
  }
  await step("duplicates", async () => {
    const matches = await findDuplicates(db, scope, { id: o.id, phone: o.phone, isTest: o.isTest }, ops.duplicateWindowDays, o.createdAt);
    if (!matches.length) return;
    await db.transaction((tx) =>
      appendEvents(tx, scope, [
        { orderId: o.id, actorKind: "system", type: "duplicate_suspected", meta: { of: matches.map((m) => m.id) } },
        ...matches.map((m) => ({ orderId: m.id, actorKind: "system" as const, type: "duplicate_suspected" as const, meta: { of: [o.id] } })),
      ]),
    );
  });
  await step("assign", () => assignOnCreate(scope, { id: o.id, isTest: o.isTest }));
  if (!o.isTest && store) {
    await step("notify", () =>
      notify(
        { audience: "store_role", storeId: scope.storeId, roles: ["owner", "admin", "manager"] },
        "ops.new_orders",
        { count: 1, sinceTime: storeClock(o.createdAt, store.timezone) },
        { link: `/app/${store.handle}/orders?view=to-call` },
      ),
    );
  }
}

/** The customer counters of a transition, in its transaction (OPE-§9.1). */
async function onTransition(scope: WriteScope, e: OrderHookEvent, tx?: Parameters<OrderHook["run"]>[2]): Promise<void> {
  if (e.on !== "transition" || e.after.isTest || !e.before.customerId) return;
  const deltas = counterDeltas(e.moves);
  if (!Object.keys(deltas).length) return;
  await applyCounterDeltas(tx ?? db, scope, e.before.customerId, deltas);
}

export const hooks: OrderHook[] = [
  { name: "ops.created", phase: "afterCommit", on: ["created"], run: onCreated },
  { name: "ops.counters", phase: "inTx", on: ["transition"], run: onTransition },
];
