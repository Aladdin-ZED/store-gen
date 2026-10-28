import "server-only";
/**
 * Customers per (store, E.164 phone) (P4 CALL CENTER; operations.md OPE-§2.3, §9.1, §9.2, OD12, OD14, OD61; OP-06,
 * SF-05). Nothing crosses stores (ORD-05): the row, its counters and every read are the scope's.
 *
 *   upsertCustomerForOrder  creation (the `ops.created` hook): INSERT … ON DUPLICATE KEY UPDATE on (store_id, phone),
 *                           `orders_count + 1` (a test order: `test_count + 1` only), then the newest order refreshes
 *                           name / city / city_key / locale / last order, and `orders.customer_id` is set
 *   counterDeltas           per transition (the `ops.counters` inTx hook): the state left −1, the state entered +1;
 *                           test orders touch nothing but `test_count`
 *   moveOrderCustomer       a phone edit moves the order (and its counters) to the other customer row
 *   reconcileCustomers      recomputes the counters from `orders` (the nightly `ops.customers_reconcile`) and returns
 *                           the drift it fixed
 *   listCustomers / getCustomer  reads: phones always masked (OD11), customer fields through `maskIfImpersonation`
 *                           (OD61); agents see the customers of the orders they can see, counts only (OD12, §9.2)
 *
 * Counters (OPE-§9.1): confirmed_count, cancelled_count (cancelled and unreachable), fake_count, delivered_count,
 * refused_count, returned_count (returned and lost); orders_count and test_count count orders. Honeypot orders never
 * reach a customer row (they are bots, not people: OPE-§10.2).
 */
import { and, desc, eq, gt, gte, inArray, like, lt, or, sql, type SQL } from "drizzle-orm";
import type { AnyMySqlColumn } from "drizzle-orm/mysql-core";
import { inboundIdsOf, ownQueueViewer, seesAllOrders, type OrderViewer } from "@/lib/callcenter/visibility";
import { db } from "@/lib/db/client";
import { newId } from "@/lib/db/ids";
import { blocklist, customers, orders } from "@/lib/db/schema";
import { toCents } from "@/lib/finance/lite/cents";
import { toAsciiDigits } from "@/lib/markets/phone";
import { maskIfImpersonation } from "@/lib/platform/mask";
import { getStoreSetting } from "@/lib/settings";
import { byId, storeValues, whereStore } from "@/lib/tenancy/sql";
import type { StoreCtx, StoreScope, WriteScope } from "@/lib/tenancy/types";
import type { OrderStatus } from "./contract";
import type { EventDb } from "./events";
import { maskPhone } from "./masking";
import { projectStatus, type ConfirmState, type Move, type OrderStates, type ShipState } from "./state";

export type CustomerRecord = typeof customers.$inferSelect;
export type CounterKey = "confirmedCount" | "cancelledCount" | "fakeCount" | "deliveredCount" | "refusedCount" | "returnedCount";
export const COUNTER_KEYS: readonly CounterKey[] = ["confirmedCount", "cancelledCount", "fakeCount", "deliveredCount", "refusedCount", "returnedCount"];

const CONFIRM_COUNTER: Partial<Record<ConfirmState, CounterKey>> = { confirmed: "confirmedCount", cancelled: "cancelledCount", unreachable: "cancelledCount", fake: "fakeCount" };
const SHIP_COUNTER: Partial<Record<ShipState, CounterKey>> = { delivered: "deliveredCount", refused: "refusedCount", returned: "returnedCount", lost: "returnedCount" };

/* ------------------------------------------------------------------ */
/* counters                                                            */
/* ------------------------------------------------------------------ */

/** The counters an order in `states` holds (one per axis at most). */
export function countersOf(states: Pick<OrderStates, "confirm" | "ship">): CounterKey[] {
  return [CONFIRM_COUNTER[states.confirm], SHIP_COUNTER[states.ship]].filter((k): k is CounterKey => !!k);
}

/** The net counter change of a transition's moves (pure): the state left −1, the state entered +1, zeros dropped. */
export function counterDeltas(moves: readonly Move[]): Partial<Record<CounterKey, number>> {
  const d: Partial<Record<CounterKey, number>> = {};
  const add = (k: CounterKey | undefined, n: number) => {
    if (k) d[k] = (d[k] ?? 0) + n;
  };
  for (const m of moves) {
    if (m.axis === "confirm") {
      add(CONFIRM_COUNTER[m.from], -1);
      add(CONFIRM_COUNTER[m.to], +1);
    } else if (m.axis === "ship") {
      add(SHIP_COUNTER[m.from], -1);
      add(SHIP_COUNTER[m.to], +1);
    }
  }
  for (const k of Object.keys(d) as CounterKey[]) if (d[k] === 0) delete d[k];
  return d;
}

const COLUMN: Record<CounterKey | "ordersCount" | "testCount", AnyMySqlColumn> = {
  confirmedCount: customers.confirmedCount,
  cancelledCount: customers.cancelledCount,
  fakeCount: customers.fakeCount,
  deliveredCount: customers.deliveredCount,
  refusedCount: customers.refusedCount,
  returnedCount: customers.returnedCount,
  ordersCount: customers.ordersCount,
  testCount: customers.testCount,
};

/** Adds the deltas to one customer row of the store (never below 0; the nightly reconcile reports any drift). */
export async function applyCounterDeltas(tx: EventDb, scope: WriteScope, customerId: string, deltas: Partial<Record<CounterKey | "ordersCount" | "testCount", number>>): Promise<void> {
  const set: Record<string, SQL> = {};
  for (const [k, n] of Object.entries(deltas) as [keyof typeof COLUMN, number][]) {
    if (!n) continue;
    const col = COLUMN[k];
    set[k] = sql`GREATEST(${col} + ${n}, 0)`;
  }
  if (!Object.keys(set).length) return;
  await tx
    .update(customers)
    .set({ ...set, updatedAt: new Date() })
    .where(byId(customers, scope, customerId));
}

/* ------------------------------------------------------------------ */
/* creation and phone edits                                            */
/* ------------------------------------------------------------------ */

/** What the customer row takes from an order. */
export interface CustomerOrderFacts {
  id: string;
  /** E.164 */
  phone: string;
  name: string | null;
  city: string | null;
  cityKey: string | null;
  locale: string | null;
  isTest: boolean;
  createdAt: Date;
}

const affectedRows = (res: unknown): number => {
  const head = Array.isArray(res) ? res[0] : res;
  return Number((head as { affectedRows?: number } | undefined)?.affectedRows ?? 0);
};

/**
 * The order's customer row, created or counted (OPE-§9.1), then linked: `orders.customer_id`. Runs in the caller's
 * transaction (the `created` event's). A test order counts in `test_count` only and refreshes the name, city and last
 * order only of a row that has no real order yet, so testing never overwrites a real customer's details.
 */
export async function upsertCustomerForOrder(tx: EventDb, scope: WriteScope, order: CustomerOrderFacts): Promise<string> {
  const now = new Date();
  const real = !order.isTest;
  const id = newId();
  const res = await tx
    .insert(customers)
    .values(
      storeValues(scope, {
        id,
        phone: order.phone,
        name: order.name?.slice(0, 120) ?? null,
        city: order.city?.slice(0, 120) ?? null,
        cityKey: order.cityKey,
        locale: order.locale?.slice(0, 5) ?? null,
        ordersCount: real ? 1 : 0,
        testCount: real ? 0 : 1,
        firstOrderAt: order.createdAt,
        lastOrderAt: order.createdAt,
        lastOrderId: order.id,
        createdAt: now,
        updatedAt: now,
      }),
    )
    .onDuplicateKeyUpdate({ set: { ordersCount: sql`${customers.ordersCount} + ${real ? 1 : 0}`, testCount: sql`${customers.testCount} + ${real ? 0 : 1}`, updatedAt: now } });
  let customerId = id;
  if (affectedRows(res) !== 1) {
    // an existing customer (MySQL answers 2 for the update of the existing row): refresh from the newest order
    const [row] = await tx
      .select({ id: customers.id, ordersCount: customers.ordersCount, firstOrderAt: customers.firstOrderAt, lastOrderAt: customers.lastOrderAt })
      .from(customers)
      .where(whereStore(customers, scope, eq(customers.phone, order.phone)))
      .limit(1);
    if (!row) throw new Error("customers: the upserted row is not readable in its store");
    customerId = row.id;
    // the counters above already include this order: a row with only test orders has ordersCount 0 (test) or 1 (this one)
    const realOnRow = real ? row.ordersCount > 1 : row.ordersCount > 0;
    const owns = real || !realOnRow;
    const newer = !row.lastOrderAt || order.createdAt.getTime() >= row.lastOrderAt.getTime();
    const firstReal = real && row.ordersCount === 1;
    // the patch's type has no storeId: a customer row never moves to another store (tenancy-lint L3b)
    const set: Partial<Omit<typeof customers.$inferInsert, "storeId" | "id">> = {};
    if (owns && newer) {
      Object.assign(set, { name: order.name?.slice(0, 120) ?? null, city: order.city?.slice(0, 120) ?? null, cityKey: order.cityKey, lastOrderAt: order.createdAt, lastOrderId: order.id });
      if (order.locale) set.locale = order.locale.slice(0, 5);
    }
    if (firstReal || !row.firstOrderAt || (owns && order.createdAt.getTime() < row.firstOrderAt.getTime())) set.firstOrderAt = order.createdAt;
    if (Object.keys(set).length) await tx.update(customers).set(set).where(byId(customers, scope, customerId));
  }
  await tx.update(orders).set({ customerId }).where(byId(orders, scope, order.id));
  return customerId;
}

/**
 * A phone edit (OPE-§9.1, `editOrder`): the order leaves its customer row (its order count and the counters of its
 * current states) and joins the row of the new phone. In the edit's transaction; answers the new customer id.
 */
export async function moveOrderCustomer(tx: EventDb, scope: WriteScope, order: CustomerOrderFacts & { states: Pick<OrderStates, "confirm" | "ship">; customerId: string | null }): Promise<string> {
  const held = order.isTest ? [] : countersOf(order.states);
  if (order.customerId) {
    const minus: Partial<Record<CounterKey | "ordersCount" | "testCount", number>> = order.isTest ? { testCount: -1 } : { ordersCount: -1 };
    for (const k of held) minus[k] = (minus[k] ?? 0) - 1;
    await applyCounterDeltas(tx, scope, order.customerId, minus);
  }
  const next = await upsertCustomerForOrder(tx, scope, order);
  if (held.length) await applyCounterDeltas(tx, scope, next, Object.fromEntries(held.map((k) => [k, 1])));
  return next;
}

/* ------------------------------------------------------------------ */
/* the nightly reconcile                                               */
/* ------------------------------------------------------------------ */

export interface ReconcileResult {
  scanned: number;
  /** rows whose counters were wrong and are now fixed */
  fixed: number;
  /** Σ |stored − recomputed| per counter over the scanned rows */
  drift: Record<CounterKey | "ordersCount" | "testCount", number>;
  /** the cursor for the next call; null when the store is done */
  nextAfterId: string | null;
}

export const RECONCILE_MAX = 5_000;

/** Recomputes the counters of up to `limit` customers after `afterId` from their linked orders (OPE-§9.1, §J). */
export async function reconcileCustomers(scope: WriteScope, opts: { afterId?: string | null; limit?: number } = {}): Promise<ReconcileResult> {
  const limit = Math.max(1, Math.min(RECONCILE_MAX, Math.trunc(opts.limit ?? RECONCILE_MAX)));
  const rows = await db
    .select()
    .from(customers)
    .where(whereStore(customers, scope, opts.afterId ? gt(customers.id, opts.afterId) : undefined))
    .orderBy(customers.id)
    .limit(limit);
  const drift = { ordersCount: 0, testCount: 0, confirmedCount: 0, cancelledCount: 0, fakeCount: 0, deliveredCount: 0, refusedCount: 0, returnedCount: 0 };
  if (!rows.length) return { scanned: 0, fixed: 0, drift, nextAfterId: null };
  const n = (cond: SQL) => sql<number>`COALESCE(SUM(CASE WHEN ${cond} THEN 1 ELSE 0 END), 0)`;
  const real = sql`${orders.isTest} = 0`;
  const truth = new Map<string, Record<keyof typeof drift, number>>();
  for (let i = 0; i < rows.length; i += 1_000) {
    const ids = rows.slice(i, i + 1_000).map((r) => r.id);
    const agg = await db
      .select({
        customerId: orders.customerId,
        ordersCount: n(real),
        testCount: n(sql`${orders.isTest} = 1`),
        confirmedCount: n(sql`${real} AND ${orders.confirmState} = 'confirmed'`),
        cancelledCount: n(sql`${real} AND ${orders.confirmState} IN ('cancelled', 'unreachable')`),
        fakeCount: n(sql`${real} AND ${orders.confirmState} = 'fake'`),
        deliveredCount: n(sql`${real} AND ${orders.shipState} = 'delivered'`),
        refusedCount: n(sql`${real} AND ${orders.shipState} = 'refused'`),
        returnedCount: n(sql`${real} AND ${orders.shipState} IN ('returned', 'lost')`),
      })
      .from(orders)
      .where(whereStore(orders, scope, inArray(orders.customerId, ids)))
      .groupBy(orders.customerId);
    for (const a of agg) {
      const { customerId, ...counts } = a;
      if (customerId) truth.set(customerId, Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, Number(v)])) as Record<keyof typeof drift, number>);
    }
  }
  let fixed = 0;
  for (const r of rows) {
    const want = truth.get(r.id) ?? { ordersCount: 0, testCount: 0, confirmedCount: 0, cancelledCount: 0, fakeCount: 0, deliveredCount: 0, refusedCount: 0, returnedCount: 0 };
    const set: Partial<Record<keyof typeof drift, number>> = {};
    for (const k of Object.keys(drift) as (keyof typeof drift)[]) {
      const diff = Math.abs(r[k] - want[k]);
      if (diff) {
        drift[k] += diff;
        set[k] = want[k];
      }
    }
    if (Object.keys(set).length) {
      fixed++;
      await db.update(customers).set(set).where(byId(customers, scope, r.id));
    }
  }
  return { scanned: rows.length, fixed, drift, nextAfterId: rows.length === limit ? rows[rows.length - 1]!.id : null };
}

/* ------------------------------------------------------------------ */
/* reads                                                               */
/* ------------------------------------------------------------------ */

/** One line of /customers (OPE-§9.2): no phone field, only the masked number. */
export interface CustomerListRow {
  id: string;
  name: string | null;
  phoneMasked: string;
  city: string | null;
  orders: number;
  delivered: number;
  refusedReturned: number;
  lastOrderAt: string | null;
  blocked: boolean;
}

export type CustomerFilter = "refused_returned" | "blocked" | "repeat";
export const CUSTOMER_PAGE = 50;

const viewerOf = (ctx: StoreCtx): OrderViewer => ({ kind: "user", userId: ctx.user.id, role: ctx.membership.role, can: (p) => ctx.can(p) });

/** The customer fields a scope may see (OD61): the name and the internal note masked under impersonation. */
function shown<T extends { name: string | null; note?: string | null; city: string | null }>(scope: StoreScope, row: T): { name: string | null; note: string | null } {
  const m = maskIfImpersonation(scope, { name: row.name, phone: null, address: null, city: row.city, landmark: null, note: row.note ?? null });
  return { name: m.name === null ? null : String(m.name), note: m.note === null ? null : String(m.note) };
}

/** The ids of the customers an agent can see: those of the orders they hold or confirmed (OD12's window), or looked up. */
async function agentCustomerIds(scope: StoreScope, userId: string, historyDays: number): Promise<SQL> {
  const since = new Date(Date.now() - historyDays * 86_400_000);
  const inbound = [...inboundIdsOf(scope, userId)];
  const mine = or(and(or(eq(orders.assigneeId, userId), eq(orders.confirmedBy, userId)), gte(orders.createdAt, since)), inbound.length ? inArray(orders.id, inbound) : undefined);
  const ids = await db
    .selectDistinct({ id: orders.customerId })
    .from(orders)
    .where(whereStore(orders, scope, mine))
    .limit(5_000);
  const list = ids.map((r) => r.id).filter((x): x is string => !!x);
  return list.length ? inArray(customers.id, list) : sql`FALSE`;
}

/** "Salma" / "0612…" / "612345": a name, or at least 4 digits of the phone (matched in the store, never shown). */
function searchCond(scope: StoreScope, search: string | undefined): SQL | undefined {
  const q = search?.trim().slice(0, 80);
  if (!q) return undefined;
  // masked customer fields can't be searched for either: a hit would confirm them (OD61)
  if (scope.kind === "impersonation") return sql`FALSE`;
  const digits = toAsciiDigits(q).replace(/[^0-9]/g, "").replace(/^0+/, "");
  const escaped = q.replace(/[\\%_]/g, (c) => `\\${c}`);
  return or(like(customers.name, `%${escaped}%`), digits.length >= 4 ? like(customers.phone, `%${digits}%`) : undefined);
}

/**
 * The store's customers, last order first (keyset by `cursor`, 50 a page). `customers.read` required; agents see the
 * customers of the orders they can see. Phones masked for every role; names masked under impersonation.
 */
export async function listCustomers(scope: StoreScope, viewer: StoreCtx, q: { search?: string; filter?: CustomerFilter } = {}, page: { cursor?: string | null } = {}): Promise<{ items: CustomerListRow[]; next: string | null }> {
  if (!viewer.can("customers.read")) return { items: [], next: null };
  const v = viewerOf(viewer);
  const conds: (SQL | undefined)[] = [searchCond(scope, q.search)];
  if (!seesAllOrders(v)) {
    if (!ownQueueViewer(v)) return { items: [], next: null };
    const { agentHistoryDays } = await getStoreSetting(scope, "ops");
    conds.push(await agentCustomerIds(scope, v.userId!, agentHistoryDays));
  }
  if (q.filter === "refused_returned") conds.push(sql`(${customers.refusedCount} + ${customers.returnedCount}) > 0`);
  if (q.filter === "repeat") conds.push(gte(customers.deliveredCount, 2));
  if (q.filter === "blocked") {
    conds.push(inArray(customers.phone, db.select({ v: blocklist.value }).from(blocklist).where(whereStore(blocklist, scope, eq(blocklist.kind, "phone")))));
  }
  const cursor = parseCursor(page.cursor);
  if (cursor) conds.push(or(lt(customers.lastOrderAt, cursor.at), and(eq(customers.lastOrderAt, cursor.at), lt(customers.id, cursor.id))));
  const rows = await db
    .select()
    .from(customers)
    .where(whereStore(customers, scope, ...conds))
    .orderBy(desc(customers.lastOrderAt), desc(customers.id))
    .limit(CUSTOMER_PAGE + 1);
  const pageRows = rows.slice(0, CUSTOMER_PAGE);
  const phones = pageRows.map((r) => r.phone);
  const blocked = phones.length
    ? new Set((await db.select({ v: blocklist.value }).from(blocklist).where(whereStore(blocklist, scope, eq(blocklist.kind, "phone"), inArray(blocklist.value, phones)))).map((b) => b.v))
    : new Set<string>();
  const items = pageRows.map((r) => ({
    id: r.id,
    name: shown(scope, r).name,
    phoneMasked: maskPhone(r.phone),
    city: r.city,
    orders: r.ordersCount,
    delivered: r.deliveredCount,
    refusedReturned: r.refusedCount + r.returnedCount,
    lastOrderAt: r.lastOrderAt?.toISOString() ?? null,
    blocked: blocked.has(r.phone),
  }));
  const last = pageRows[pageRows.length - 1];
  return { items, next: rows.length > CUSTOMER_PAGE && last?.lastOrderAt ? `${last.lastOrderAt.toISOString()}|${last.id}` : null };
}

function parseCursor(c: string | null | undefined): { at: Date; id: string } | null {
  const m = /^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\|([0-9A-Z]{26})$/.exec(c ?? "");
  if (!m) return null;
  const at = new Date(m[1]!);
  return Number.isNaN(at.getTime()) ? null : { at, id: m[2]! };
}

/** The customer page (OPE-§9.2). Agents: counts only (no order list, no internal note). */
export interface CustomerDetail {
  id: string;
  name: string | null;
  phoneMasked: string;
  city: string | null;
  cityKey: string | null;
  firstOrderAt: string | null;
  lastOrderAt: string | null;
  counts: { orders: number; confirmed: number; delivered: number; refused: number; returned: number; cancelled: number; fake: number; test: number };
  note: string | null;
  blocked: boolean;
  /** the customer's orders, newest first (≤ 50); null for agents (OD12) */
  orders: { id: string; createdAt: string; productName: string; status: OrderStatus; totalCents: number; currency: string; isTest: boolean }[] | null;
}

export async function getCustomer(scope: StoreScope, viewer: StoreCtx, id: string): Promise<CustomerDetail | null> {
  if (typeof id !== "string" || !/^[0-9A-Z]{26}$/.test(id) || !viewer.can("customers.read")) return null;
  const v = viewerOf(viewer);
  const all = seesAllOrders(v);
  if (!all && !ownQueueViewer(v)) return null;
  const [row] = await db.select().from(customers).where(byId(customers, scope, id)).limit(1);
  if (!row) return null;
  if (!all) {
    // an agent reaches a customer only through an order they can see, or an inbound lookup (OPE-§9.2, §5.7)
    const inbound = [...inboundIdsOf(scope, v.userId!)];
    const [seen] = await db
      .select({ id: orders.id })
      .from(orders)
      .where(whereStore(orders, scope, eq(orders.customerId, id), or(eq(orders.assigneeId, v.userId!), eq(orders.confirmedBy, v.userId!), inbound.length ? inArray(orders.id, inbound) : undefined)))
      .limit(1);
    if (!seen) return null;
  }
  const [block] = await db
    .select({ id: blocklist.id })
    .from(blocklist)
    .where(whereStore(blocklist, scope, eq(blocklist.kind, "phone"), eq(blocklist.value, row.phone)))
    .limit(1);
  const list = all
    ? await db
        .select({ id: orders.id, createdAt: orders.createdAt, productName: orders.productName, confirmState: orders.confirmState, shipState: orders.shipState, total: orders.total, currency: orders.currency, isTest: orders.isTest })
        .from(orders)
        .where(whereStore(orders, scope, eq(orders.customerId, id)))
        .orderBy(desc(orders.createdAt))
        .limit(50)
    : null;
  const s = shown(scope, row);
  return {
    id: row.id,
    name: s.name,
    phoneMasked: maskPhone(row.phone),
    city: row.city,
    cityKey: row.cityKey,
    firstOrderAt: row.firstOrderAt?.toISOString() ?? null,
    lastOrderAt: row.lastOrderAt?.toISOString() ?? null,
    counts: {
      orders: row.ordersCount,
      confirmed: row.confirmedCount,
      delivered: row.deliveredCount,
      refused: row.refusedCount,
      returned: row.returnedCount,
      cancelled: row.cancelledCount,
      fake: row.fakeCount,
      test: row.testCount,
    },
    note: all ? s.note : null,
    blocked: !!block,
    orders:
      list?.map((o) => ({
        id: o.id,
        createdAt: o.createdAt.toISOString(),
        productName: o.productName,
        status: projectStatus({ confirm: o.confirmState, ship: o.shipState }),
        totalCents: toCents(o.total),
        currency: o.currency,
        isTest: o.isTest,
      })) ?? null,
  };
}
