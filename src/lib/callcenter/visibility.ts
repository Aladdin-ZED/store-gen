import "server-only";
/**
 * Who sees which order (P4 CALL CENTER; operations.md OD12, OD53, OPE-§3.5 step 2, §4.1, §5.7, §9.2). One rule for
 * the writer (`transitionOrder`), the timeline, the notes and the customer reads, so an agent's answer never depends
 * on the door they used:
 *
 *   orders.read_all            every order of the store (owners, admins, managers, logistics, accountants)
 *   the own-queue grant        an agent (`ownQueueOnly(role, "orders.write")`, §A.3.2 `agent*`): the orders they hold
 *                              (`assignee_id`) or confirmed (`confirmed_by`), plus the ids of their inbound lookups of
 *                              the last 10 minutes (OD53), which the writer accepts only with `input.inbound`
 *   anyone else                no order at all
 *
 * A refusal is never its own answer: callers turn it into the `not_found` of a missing id (core §E.3 rule 3).
 */
import { ownQueueOnly, type StorePermission, type StoreRole } from "@/lib/auth/permissions";
import { scopedCache } from "@/lib/tenancy/cache";
import type { StoreScope } from "@/lib/tenancy/types";

/** The viewer as the rule reads it: a member's ctx (`StoreCtx`) and an `OrderActor` both fit. */
export interface OrderViewer {
  /** "user" for a member; any other actor kind (system, sheet, carrier, api, …) is not restricted */
  kind: string;
  userId: string | null;
  role?: StoreRole;
  can?: (p: StorePermission) => boolean;
}

/** The order columns the rule reads. */
export interface VisibleOrder {
  id: string;
  assigneeId: string | null;
  confirmedBy: string | null;
}

/** The inbound visibility of each agent (OPE-§5.7 step 1): `${userId}` → the order ids a lookup returned, 10 minutes. */
const inbound = scopedCache<readonly string[]>({ name: "ops-inbound", maxEntries: 5_000, ttlMs: 10 * 60_000 });
/** at most this many ids per agent (a lookup returns ≤ 10 open orders; a few lookups in a row stay listed) */
const INBOUND_MAX = 50;

/** Records the order ids an exact-phone lookup returned to `userId` (OPE-§5.7; called by the inbound lookup). */
export function rememberInbound(scope: StoreScope, userId: string, orderIds: readonly string[]): void {
  const prior = inbound.get(scope.storeId, userId) ?? [];
  const merged = [...new Set([...orderIds, ...prior])].slice(0, INBOUND_MAX);
  inbound.set(scope.storeId, userId, merged);
}

/** The ids of `userId`'s lookups of the last 10 minutes in this store. */
export function inboundIdsOf(scope: StoreScope, userId: string): ReadonlySet<string> {
  return new Set(inbound.get(scope.storeId, userId) ?? []);
}

/** True when the viewer sees every order of the store (no own-queue restriction applies). */
export function seesAllOrders(viewer: OrderViewer): boolean {
  if (viewer.kind !== "user") return true;
  return !!viewer.can?.("orders.read_all");
}

/** True when the viewer is a member restricted to their own queue (an agent). */
export function ownQueueViewer(viewer: OrderViewer): boolean {
  return viewer.kind === "user" && !seesAllOrders(viewer) && !!viewer.role && ownQueueOnly(viewer.role, "orders.write") && !!viewer.userId;
}

/**
 * The rule. `inboundOk` is the writer's `input.inbound` (an action that says the customer called); reads pass true,
 * since a lookup already showed the agent that order.
 */
export function viewerSeesOrder(scope: StoreScope, viewer: OrderViewer, order: VisibleOrder, inboundOk: boolean): boolean {
  if (seesAllOrders(viewer)) return true;
  if (!ownQueueViewer(viewer)) return false;
  const me = viewer.userId!;
  if (order.assigneeId === me || order.confirmedBy === me) return true;
  return inboundOk && inboundIdsOf(scope, me).has(order.id);
}
