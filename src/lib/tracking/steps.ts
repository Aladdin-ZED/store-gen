/**
 * The tracking timeline (P3 LANDING; landing.md LAN-§9.2): operations' state axes (core §D.2 0005) → the shopper's
 * steps. Pure and isomorphic.
 *
 *   placed            always
 *   confirmed         confirm_state = confirmed (or the parcel already left)
 *   shipped           ship_state ∈ {shipped, in_transit} and every later delivery state
 *   out_for_delivery  ship_state ∈ {out_for_delivery, attempt_failed, delivered}
 *   delivered         ship_state = delivered
 *   cancelled         confirm_state ∈ {cancelled, fake, duplicate}: one neutral word for the shopper
 *   returned          ship_state ∈ {refused, returned, lost}
 *
 * Each step is dated by the first `order_events` row of its transition (`state_changed` with that `to_state`), else
 * by the order's own timestamp column. A legacy order whose axes were never written (both at their defaults while
 * `status` moved on) maps from `orders.status` (src/lib/orders/contract.ts ORDER_STATUSES).
 */
import type { TrackRequestKind, TrackStep, TrackStepId } from "./contract";

export type ConfirmState = "new" | "attempting" | "callback" | "confirmed" | "cancelled" | "fake" | "duplicate" | "unreachable";
export type ShipState =
  | "none"
  | "to_pack"
  | "packed"
  | "shipped"
  | "in_transit"
  | "out_for_delivery"
  | "delivered"
  | "refused"
  | "returned"
  | "lost"
  | "attempt_failed"
  | "postponed";

/** The order columns the timeline reads. */
export interface TrackOrderAxes {
  status: string;
  confirmState: ConfirmState;
  shipState: ShipState;
  createdAt: Date;
  confirmedAt: Date | null;
  shippedAt: Date | null;
  deliveredAt: Date | null;
  finalAt: Date | null;
}

/** One `order_events` row as the timeline reads it. */
export interface TrackEvent {
  type: string;
  actorKind: string;
  toState: string | null;
  at: Date;
  meta: Record<string, unknown> | null;
}

const CANCELLED: ReadonlySet<string> = new Set(["cancelled", "fake", "duplicate"]);
const RETURNED: ReadonlySet<string> = new Set(["refused", "returned", "lost"]);
const LEFT: ReadonlySet<string> = new Set(["shipped", "in_transit", "out_for_delivery", "attempt_failed", "postponed", "delivered", "refused", "returned", "lost"]);
const AT_DOOR: ReadonlySet<string> = new Set(["out_for_delivery", "attempt_failed", "delivered"]);

/** `orders.status` → the axes of a legacy row (the projection of OPE-§3.3, read backwards). */
const LEGACY: Readonly<Record<string, { confirm: ConfirmState; ship: ShipState }>> = {
  confirmed: { confirm: "confirmed", ship: "none" },
  shipped: { confirm: "confirmed", ship: "shipped" },
  in_transit: { confirm: "confirmed", ship: "in_transit" },
  delivered: { confirm: "confirmed", ship: "delivered" },
  returned: { confirm: "confirmed", ship: "returned" },
  refused: { confirm: "confirmed", ship: "refused" },
  lost: { confirm: "confirmed", ship: "lost" },
  cancelled: { confirm: "cancelled", ship: "none" },
  fake: { confirm: "fake", ship: "none" },
  duplicate: { confirm: "duplicate", ship: "none" },
};

/** The axes the timeline and the request rule use: the row's own, or the legacy status mapping. */
export function effectiveAxes(order: Pick<TrackOrderAxes, "status" | "confirmState" | "shipState">): { confirm: ConfirmState; ship: ShipState } {
  if (order.confirmState === "new" && order.shipState === "none") {
    const legacy = LEGACY[order.status];
    if (legacy) return legacy;
  }
  return { confirm: order.confirmState, ship: order.shipState };
}

/** Requests are open while the order is alive and has not left the warehouse (LAN-§9.3). */
export function requestsOpen(order: Pick<TrackOrderAxes, "status" | "confirmState" | "shipState">): boolean {
  const { confirm, ship } = effectiveAxes(order);
  return !CANCELLED.has(confirm) && (ship === "none" || ship === "to_pack");
}

const iso = (d: Date | null | undefined) => (d && Number.isFinite(d.getTime()) ? d.toISOString() : null);

/** The first `state_changed` event that moved the order into one of `states`. */
function firstMove(events: readonly TrackEvent[], states: ReadonlySet<string>): Date | null {
  let best: Date | null = null;
  for (const e of events) {
    if (e.type !== "state_changed" || !e.toState || !states.has(e.toState)) continue;
    if (!best || e.at.getTime() < best.getTime()) best = e.at;
  }
  return best;
}

export function trackSteps(order: TrackOrderAxes, events: readonly TrackEvent[]): { steps: TrackStep[]; current: TrackStepId } {
  const { confirm, ship } = effectiveAxes(order);
  const placed: TrackStep = { id: "placed", at: iso(order.createdAt), done: true };
  if (CANCELLED.has(confirm)) {
    const at = firstMove(events, CANCELLED) ?? order.finalAt;
    return { steps: [placed, { id: "cancelled", at: iso(at), done: true }], current: "cancelled" };
  }
  const left = LEFT.has(ship);
  const confirmed: TrackStep = { id: "confirmed", at: null, done: confirm === "confirmed" || left };
  if (confirmed.done) confirmed.at = iso(firstMove(events, new Set(["confirmed"])) ?? order.confirmedAt);
  const shipped: TrackStep = { id: "shipped", at: left ? iso(firstMove(events, new Set(["shipped", "in_transit"])) ?? order.shippedAt) : null, done: left };
  if (RETURNED.has(ship)) {
    const at = firstMove(events, RETURNED) ?? order.finalAt;
    return { steps: [placed, confirmed, shipped, { id: "returned", at: iso(at), done: true }], current: "returned" };
  }
  const door = AT_DOOR.has(ship);
  const out: TrackStep = { id: "out_for_delivery", at: door ? iso(firstMove(events, AT_DOOR)) : null, done: door };
  const delivered: TrackStep = { id: "delivered", at: ship === "delivered" ? iso(firstMove(events, new Set(["delivered"])) ?? order.deliveredAt) : null, done: ship === "delivered" };
  const steps = [placed, confirmed, shipped, out, delivered];
  const current = [...steps].reverse().find((s) => s.done)?.id ?? "placed";
  return { steps, current };
}

/** Actors whose event means the store has acted on the order since a shopper's request. */
const STORE_ACTORS: ReadonlySet<string> = new Set(["user", "sheet", "api", "platform"]);

/**
 * The shopper's requests still waiting (one per kind, LAN-§9.3): a `customer_request` of that kind with no later
 * event by the store (an agent, the Sheet, the API, the console). Once the store acts, a new request may follow.
 */
export function pendingRequests(events: readonly TrackEvent[]): TrackRequestKind[] {
  const sorted = [...events].sort((a, b) => a.at.getTime() - b.at.getTime());
  const open = new Set<TrackRequestKind>();
  for (const e of sorted) {
    if (e.type === "customer_request" && e.actorKind === "customer") {
      const kind = e.meta?.kind;
      if (kind === "change_address" || kind === "change_phone" || kind === "cancel" || kind === "other") open.add(kind);
    } else if (STORE_ACTORS.has(e.actorKind)) {
      open.clear();
    }
  }
  return [...open];
}
