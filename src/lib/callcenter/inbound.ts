import "server-only";
/**
 * Inbound calls (P4 CALL CENTER; operations.md OPE-§5.7, OD53, OD12, OD61, core §E.3 rule 3, §L "Inbound lookups"):
 * a customer calls the store and whoever picks up finds the caller's open orders by their number.
 *
 *   inboundLookup(ctx, phoneInput)   agents.self; bucket `s:<sid>:inbound:<uid>` 60 / h (the 61st → rate_limited)
 *     1. the input, normalised with the store's market (`normalizePhone`): fewer than 8 digits → `too_short` (no
 *        prefix search for agents; owners and managers keep the ≥ 4-digit search of the orders list); an input that
 *        is not a valid number of the market is a miss
 *     2. exact E.164 on `customers.phone` (`cu_store_phone_uq`) for the caller's counters, and the phone's orders on
 *        `orders_store_phone_idx`: the open ones (confirm new / attempting / callback / unreachable, or confirmed and
 *        not final), newest first, at most 10, masked; the closed ones as a count. Unreachable is open here: the
 *        customer calling back is the class-W move that confirms it (OPE-§3.2, §5.7 step 3)
 *     3. a miss answers `{ customer: null, orders: [], otherOrders: 0 }`, through the same three reads as a match, so a
 *        lookup of another store's customer is the same shape in the same timing class
 *     4. the returned ids become the agent's inbound visibility for 10 minutes (`scopedCache("ops-inbound")` under
 *        `${storeId}:${userId}`, ./visibility.ts): `takeOrder` and `recordOutcome` with `inbound: true` accept them
 *   inboundLookupsThisHour(scope, userIds)   the bucket's count per agent ("lookups: 61 this hour" on the board,
 *        acceptance (c)): the refused lookups count too, so a scraping pattern is never silent
 *
 * Every customer field passes through P1's `maskIfImpersonation` (OD61); the phone leaves masked (OD11).
 */
import { and, count, desc, eq, inArray, notInArray, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { customers, orders, users } from "@/lib/db/schema";
import { normalizePhone, toAsciiDigits } from "@/lib/markets/phone";
import type { OrderStatus } from "@/lib/orders/contract";
import { maskPhone } from "@/lib/orders/masking";
import { projectStatus, type MoneyState, type OrderStates } from "@/lib/orders/state";
import { toCents } from "@/lib/finance/lite/cents";
import { maskIfImpersonation } from "@/lib/platform/mask";
import { rateLimit, storeBucket } from "@/lib/security/rate-limit";
import { whereStore } from "@/lib/tenancy/sql";
import type { ActionResult, StoreCtx, StoreScope } from "@/lib/tenancy/types";
import { firstNameOf, type CustomerHistoryCounts } from "./card";
import { opsNow } from "./presence";
import { laneOf } from "./priority";
import { rememberInbound } from "./visibility";

export interface InboundOrder {
  id: string;
  createdAt: string;
  status: OrderStatus;
  states: OrderStates;
  product: string;
  totalCents: number;
  /** in either lane, whatever its due time: "Take this order" claims it */
  callable: boolean;
  /** another member's active claim (display name, first word) */
  held: { by: string; until: string } | null;
  lane: "confirm" | "delivery" | null;
}

export interface InboundResult {
  customer: { firstName: string; phoneMasked: string; history: CustomerHistoryCounts | null } | null;
  /** open orders only, newest first, ≤ 10 */
  orders: InboundOrder[];
  /** closed ones, count only */
  otherOrders: number;
}

/** OPE-§L: `s:<sid>:inbound:<uid>` 60 / h; ≥ 8 digits; ≤ 10 orders */
export const INBOUND_LIMIT = 60;
const INBOUND_WINDOW_SEC = 3_600;
export const INBOUND_MIN_DIGITS = 8;
const INBOUND_MAX_ORDERS = 10;
const OPEN_CONFIRM = ["new", "attempting", "callback", "unreachable"] as const;
const FINAL_SHIP = ["delivered", "refused", "returned", "lost"] as const;

const EMPTY: InboundResult = { customer: null, orders: [], otherOrders: 0 };

/** confirm open (unreachable included), or confirmed and not at a final ship state */
const openOrder = or(inArray(orders.confirmState, [...OPEN_CONFIRM]), and(eq(orders.confirmState, "confirmed"), notInArray(orders.shipState, [...FINAL_SHIP])))!;

/** The caller's open orders by their number (see the header). */
export async function inboundLookup(ctx: StoreCtx, phoneInput: string): Promise<ActionResult<InboundResult>> {
  if (!ctx.can("agents.self")) return { ok: false, error: "forbidden" };
  if (typeof phoneInput !== "string" || phoneInput.length > 64) return { ok: false, error: "invalid" };
  const digits = toAsciiDigits(phoneInput).replace(/\D/g, "");
  if (digits.length < INBOUND_MIN_DIGITS) return { ok: false, error: "too_short" };
  const { scope } = ctx;
  const uid = ctx.user.id;
  if (!(await rateLimit(storeBucket(scope, "inbound", uid), INBOUND_LIMIT, INBOUND_WINDOW_SEC)).ok) return { ok: false, error: "rate_limited" };

  // a number that is not one of the market's runs the same reads on a value no row holds: one timing class
  const e164 = normalizePhone(phoneInput, ctx.store.market)?.e164 ?? "+0";
  const now = opsNow();
  const [[cust], open, [closed]] = await Promise.all([
    db
      .select({
        name: customers.name,
        ordersCount: customers.ordersCount,
        deliveredCount: customers.deliveredCount,
        refusedCount: customers.refusedCount,
        returnedCount: customers.returnedCount,
        cancelledCount: customers.cancelledCount,
        fakeCount: customers.fakeCount,
      })
      .from(customers)
      .where(whereStore(customers, scope, eq(customers.phone, e164)))
      .limit(1),
    db
      .select({
        id: orders.id,
        createdAt: orders.createdAt,
        confirmState: orders.confirmState,
        shipState: orders.shipState,
        moneyState: orders.moneyState,
        productName: orders.productName,
        total: orders.total,
        name: orders.name,
        assigneeId: orders.assigneeId,
        claimToken: orders.claimToken,
        leaseUntil: orders.leaseUntil,
        holder: users.name,
      })
      .from(orders)
      .leftJoin(users, eq(users.id, orders.assigneeId))
      .where(whereStore(orders, scope, eq(orders.phone, e164), openOrder))
      .orderBy(desc(orders.createdAt))
      .limit(INBOUND_MAX_ORDERS),
    db
      .select({ n: count() })
      .from(orders)
      .where(whereStore(orders, scope, eq(orders.phone, e164), sql`NOT (${openOrder})`)),
  ]);

  const result: InboundResult = {
    customer: null,
    orders: open.map((r) => {
      const states: OrderStates = { confirm: r.confirmState, ship: r.shipState, money: r.moneyState as MoneyState };
      const lane = laneOf(states);
      const heldByOther = !!r.claimToken && !!r.leaseUntil && r.leaseUntil.getTime() > now.getTime() && r.assigneeId !== uid;
      return {
        id: r.id,
        createdAt: r.createdAt.toISOString(),
        status: projectStatus(states),
        states,
        product: r.productName,
        totalCents: toCents(r.total),
        // either lane, any due time (OPE-§5.7 step 2); a postponed delivery is not claimable
        callable: lane !== null && !(lane === "delivery" && states.ship !== "attempt_failed"),
        held: heldByOther ? { by: firstNameOf(r.holder) || "—", until: r.leaseUntil!.toISOString() } : null,
        lane: lane === null ? null : lane === "delivery" ? "delivery" : "confirm",
      };
    }),
    otherOrders: Number(closed?.n ?? 0),
  };
  const nameRow = cust ?? (open[0] ? { name: open[0].name } : null);
  if (nameRow) {
    const m = maskIfImpersonation(ctx.scope, { name: nameRow.name ?? "", phone: null, address: null, city: null, landmark: null, note: null });
    result.customer = {
      firstName: firstNameOf(m.name),
      phoneMasked: maskPhone(e164),
      history: cust
        ? { orders: cust.ordersCount, delivered: cust.deliveredCount, refused: cust.refusedCount, returned: cust.returnedCount, cancelled: cust.cancelledCount, fake: cust.fakeCount }
        : null,
    };
  }
  if (!result.customer && !result.orders.length && !result.otherOrders) return { ok: true, data: EMPTY };
  if (result.orders.length) rememberInbound(scope, uid, result.orders.map((o) => o.id));
  return { ok: true, data: result };
}

/**
 * The lookups each agent made in their current hour window (the bucket's count, refusals included; 0 for an agent
 * without one). One read of `rate_limits` by the agents' bucket names (`storeBucket`, so another store's count is
 * never read).
 */
export async function inboundLookupsThisHour(scope: StoreScope, userIds: readonly string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = Object.fromEntries(userIds.map((u) => [u, 0]));
  if (!userIds.length) return out;
  const byBucket = new Map(userIds.map((u) => [String(storeBucket(scope, "inbound", u)), u]));
  const [rows] = (await db.execute(
    sql`SELECT bucket, count FROM rate_limits WHERE bucket IN (${sql.join(
      [...byBucket.keys()].map((b) => sql`${b}`),
      sql`, `,
    )}) AND reset_at > UTC_TIMESTAMP(3)`,
  )) as unknown as [{ bucket: string; count: number }[]];
  for (const r of rows) {
    const u = byBucket.get(r.bucket);
    if (u) out[u] = Number(r.count);
  }
  return out;
}
