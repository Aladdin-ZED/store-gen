/**
 * The order state machine's vocabulary (P4 CALL CENTER; operations.md OPE-§3.2-§3.4, OPE-§3.6; docs/STORE-SAAS.md
 * §K.2 P0). Pure and isomorphic. Frozen at P0: P4 fills `legacyToWanted`, adds `planTransition` and widens nothing it
 * did not own. `projectStatus` is the spec's own code (OPE-§3.3) and works from P0, because P5's Sheets push (merging
 * before P4) writes the projected label; it is the only mapping from the axes to a status label (OPE-§3.7).
 */
import type { OrderStatus } from "./contract";

export const CONFIRM_STATES = ["new", "attempting", "callback", "confirmed", "cancelled", "fake", "duplicate", "unreachable"] as const;
/** display order; the DB enum appends attempt_failed and postponed last (core §D.2, OPE-§2.1) */
export const SHIP_STATES = ["none", "to_pack", "packed", "shipped", "in_transit", "out_for_delivery", "attempt_failed", "postponed", "delivered", "refused", "returned", "lost"] as const;
/** `refunded` is R2 (OD59, 0006) */
export const MONEY_STATES = ["unpaid", "collected", "remitted", "disputed", "written_off", "refunded"] as const;
/** OD50: coded reasons of the ship moves to refused / returned / lost; the confirm axis keeps CANCEL_REASONS */
export const RETURN_REASONS = ["customer_absent", "refused_price", "changed_mind", "wrong_item", "damaged", "unreachable", "no_cash", "address_wrong", "not_ordered", "other"] as const;
export type ReturnReason = (typeof RETURN_REASONS)[number];
export type ConfirmState = (typeof CONFIRM_STATES)[number];
export type ShipState = (typeof SHIP_STATES)[number];
export type MoneyState = (typeof MONEY_STATES)[number];
export type Axis = "confirm" | "ship" | "money";
export interface OrderStates {
  confirm: ConfirmState;
  ship: ShipState;
  money: MoneyState;
}

export const CANCEL_REASONS = ["changed_mind", "price", "mistake", "bought_elsewhere", "not_ordered", "wrong_number", "out_of_zone", "delay", "see_first", "customer_request", "blocked", "attempts_exhausted", "other"] as const;
export type CancelReason = (typeof CANCEL_REASONS)[number];
export type TransitionSource = "ui" | "bulk" | "outcome" | "sheet" | "carrier" | "import" | "api" | "bot" | "customer" | "system";
/** move classes: who may make a legal move (checked against StoreCtx.can, core §A.3) */
export type MoveClass = "W" /* orders.write */ | "A" /* orders.assign */ | "L" /* shipments.write */ | "M" /* finance.write */ | "S" /* system only */;

/** One move on one axis, as `planTransition` plans it and the transition hooks receive it (OPE-§3.2, §3.6). */
export type Move = (
  | { axis: "confirm"; from: ConfirmState; to: ConfirmState }
  | { axis: "ship"; from: ShipState; to: ShipState }
  | { axis: "money"; from: MoneyState; to: MoneyState }
) & {
  /** an implied step (a ship target before confirmation, a walked path, OPE-§3.4) */
  implied?: true;
  /** orders.force_status with a reason (OPE-§3.5) */
  forced?: true;
};

/**
 * An order as the transition and edit hooks see it, before and after (OPE-§3.6): the axes, the projection and `rev`,
 * plus the columns a hook may read. Open for fields P4 adds (an R2 hook reads `lineOutcomes`, OD51).
 */
export interface OrderSnapshot {
  id: string;
  rev: number;
  status: OrderStatus;
  states: OrderStates;
  isTest: boolean;
  customerId: string | null;
  assigneeId: string | null;
  cityKey: string | null;
  totalCents: number;
  [field: string]: unknown;
}

/** The one mapping from the axes to the legacy label (OPE-§3.3, the spec's code). */
export function projectStatus(s: Pick<OrderStates, "confirm" | "ship">): OrderStatus {
  switch (s.ship) {
    case "delivered":
      return "delivered";
    case "refused":
      return "refused";
    case "returned":
      return "returned";
    case "lost":
      return "lost";
    case "in_transit":
    case "out_for_delivery":
      return "in_transit";
    case "attempt_failed":
    case "postponed":
      return "in_transit"; // the sheet keeps "En livraison"; the finer state lives on the axis chip and the drawer
    case "shipped":
      return "shipped";
  }
  // ship ∈ none, to_pack, packed
  switch (s.confirm) {
    case "confirmed":
      return "confirmed";
    case "cancelled":
      return "cancelled";
    case "fake":
      return "fake";
    case "duplicate":
      return "duplicate";
    case "unreachable":
      return "unreachable";
    case "callback":
      return "callback";
    case "attempting":
      return "no_answer";
    case "new":
      return "new";
  }
}

/**
 * Maps a legacy label (sheet column C, a CSV status column, the "Move to…" menu) to the wanted axis states
 * (OPE-§3.4): "noop" when the label changes nothing, "reject" when it is illegal from the current states.
 */
export function legacyToWanted(label: OrderStatus, cur: OrderStates): Partial<OrderStates> | "noop" | "reject" {
  void label;
  void cur;
  throw new Error("not implemented: P4 legacyToWanted");
}
