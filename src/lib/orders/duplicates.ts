import "server-only";
/**
 * Store-wide duplicate detection (P4 CALL CENTER; operations.md OPE-§9.3, OD13; OP-06 R1 = flag + link, no merge).
 *
 * The predicate: the same phone in the same store, another order, the same kind (a test order matches test orders
 * only, D54), created within `ops.duplicateWindowDays`, still open (confirm new / attempting / callback, or confirmed
 * and not handed to a carrier), newest first, at most 5 (`orders_store_phone_idx`). The `ops.created` hook writes
 * `duplicate_suspected` on the new order and on each match; the queue card and the drawer compute the pairs at read
 * time with the same predicate (`duplicatesFor`), so dismissing or deciding one order updates every view at once.
 * "Keep both" writes `duplicate_dismissed` on the two orders and the pair is never shown again; "Mark as duplicate"
 * is the confirm move `duplicate` with `duplicateOf` (the writer, ./transition.ts).
 *
 * The public path's own rule (same phone, same page, 12 h, src/lib/orders/create.ts) is unchanged and complementary.
 */
import { and, desc, eq, gte, inArray, ne, or } from "drizzle-orm";
import { viewerSeesOrder } from "@/lib/callcenter/visibility";
import { db } from "@/lib/db/client";
import { orderEvents, orders } from "@/lib/db/schema";
import { getStoreSetting } from "@/lib/settings";
import { byId, whereStore } from "@/lib/tenancy/sql";
import type { StoreScope, WriteCtx } from "@/lib/tenancy/types";
import { appendEvents, viewerOf, type EventDb } from "./events";
import type { ConfirmState, ShipState } from "./state";

export interface DuplicateMatch {
  id: string;
  createdAt: Date;
  confirmState: ConfirmState;
  shipState: ShipState;
}

/** The order the predicate is asked about. */
export interface DuplicateProbe {
  id: string;
  /** E.164 */
  phone: string;
  isTest: boolean;
}

export const DUPLICATE_LIMIT = 5;
const OPEN_CONFIRM: ConfirmState[] = ["new", "attempting", "callback"];
const PRE_SHIP: ShipState[] = ["none", "to_pack", "packed"];

/** The §9.3 predicate over the store's orders (the caller's transaction, or the pool). `days` 0 turns it off. */
export async function findDuplicates(tx: EventDb, scope: StoreScope, order: DuplicateProbe, days: number, now = new Date()): Promise<DuplicateMatch[]> {
  if (!(days > 0)) return [];
  return tx
    .select({ id: orders.id, createdAt: orders.createdAt, confirmState: orders.confirmState, shipState: orders.shipState })
    .from(orders)
    .where(
      whereStore(
        orders,
        scope,
        eq(orders.phone, order.phone),
        ne(orders.id, order.id),
        eq(orders.isTest, order.isTest),
        gte(orders.createdAt, new Date(now.getTime() - days * 86_400_000)),
        or(inArray(orders.confirmState, OPEN_CONFIRM), and(eq(orders.confirmState, "confirmed"), inArray(orders.shipState, PRE_SHIP))),
      ),
    )
    .orderBy(desc(orders.createdAt))
    .limit(DUPLICATE_LIMIT);
}

/** The pairs of `orderIds` a person kept apart ("Keep both"), as `a|b` keys in both directions. */
async function dismissedPairs(scope: StoreScope, orderIds: readonly string[]): Promise<Set<string>> {
  if (!orderIds.length) return new Set();
  const rows = await db
    .select({ orderId: orderEvents.orderId, meta: orderEvents.meta })
    .from(orderEvents)
    .where(whereStore(orderEvents, scope, inArray(orderEvents.orderId, [...orderIds]), eq(orderEvents.type, "duplicate_dismissed")));
  const out = new Set<string>();
  for (const r of rows) {
    const of = Array.isArray((r.meta as { of?: unknown } | null)?.of) ? ((r.meta as { of: unknown[] }).of.filter((x) => typeof x === "string") as string[]) : [];
    for (const other of of) {
      out.add(`${r.orderId}|${other}`);
      out.add(`${other}|${r.orderId}`);
    }
  }
  return out;
}

/**
 * The possible duplicates of one order, at read time (the queue card, the drawer): the predicate, minus the pairs a
 * person kept apart. Ids, dates and states only: no customer field leaves this function.
 */
export async function duplicatesFor(scope: StoreScope, order: DuplicateProbe): Promise<DuplicateMatch[]> {
  const { duplicateWindowDays } = await getStoreSetting(scope, "ops");
  const matches = await findDuplicates(db, scope, order, duplicateWindowDays);
  if (!matches.length) return [];
  const kept = await dismissedPairs(scope, [order.id, ...matches.map((m) => m.id)]);
  return matches.filter((m) => !kept.has(`${order.id}|${m.id}`));
}

/**
 * "Keep both" (OPE-§9.3): the member says the two orders are not duplicates; `duplicate_dismissed` on each, and the pair
 * is never shown again. Both orders must be the store's, of the same phone, and the first one visible to the member.
 */
export async function dismissDuplicate(ctx: WriteCtx, orderId: string, otherId: string): Promise<{ ok: true } | { ok: false; error: "not_found" }> {
  const { scope } = ctx;
  if (!ctx.can("orders.write") || typeof orderId !== "string" || typeof otherId !== "string" || orderId === otherId) return { ok: false, error: "not_found" };
  const [order] = await db
    .select({ id: orders.id, phone: orders.phone, assigneeId: orders.assigneeId, confirmedBy: orders.confirmedBy })
    .from(orders)
    .where(byId(orders, scope, orderId))
    .limit(1);
  if (!order || !viewerSeesOrder(scope, viewerOf(ctx), order, true)) return { ok: false, error: "not_found" };
  const [other] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(byId(orders, scope, otherId), eq(orders.phone, order.phone)))
    .limit(1);
  if (!other) return { ok: false, error: "not_found" };
  await db.transaction((tx) =>
    appendEvents(tx, scope, [
      { orderId, actorKind: "user", actorId: ctx.user.id, type: "duplicate_dismissed", meta: { of: [otherId] } },
      { orderId: otherId, actorKind: "user", actorId: ctx.user.id, type: "duplicate_dismissed", meta: { of: [orderId] } },
    ]),
  );
  return { ok: true };
}
