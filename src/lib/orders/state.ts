/**
 * The order state machine (P4 CALL CENTER; operations.md OPE-§3.2-§3.6, OD3-OD5, OD48-OD52; docs/STORE-SAAS.md §K.2
 * P0). Pure and isomorphic: the drawer's "Move to…" menu reads `legalMoves`, `transitionOrder` (server-only,
 * ./transition.ts) runs `planTransition` inside its transaction and writes exactly the plan.
 *
 *   three axes      confirm × ship × money, each with its transition table (the data below = OPE-§3.2 verbatim)
 *   projection      `projectStatus` is the ONLY mapping from the axes to the legacy label (OPE-§3.3, §3.7)
 *   implied moves   a ship target on an unconfirmed order confirms it first; a target beyond the next step walks
 *                   none → to_pack → shipped → target (OPE-§3.4), each step a move with `implied: true`
 *   automatic       side moves of the same write (confirmed ⇒ to_pack, terminal ⇒ ship none, delivered ⇒ money
 *                   collected (+ remitted when the cash is taken at the door, OD52), delivered → returned ⇒ unpaid),
 *                   each a move with `auto: true`, recorded as its own `state_changed` event with source "system"
 *
 * Frozen at P0: the state lists, `projectStatus`, `legacyToWanted`, `Move`, `OrderSnapshot`, `TransitionSource`,
 * `MoveClass`. P4 widened `Move` by one optional flag (`auto`) and moved `OrderActor` here from ./transition.ts (which
 * re-exports it unchanged) so the pure plan and client components need no server module.
 */
import type { StorePermission, StoreRole } from "@/lib/auth/permissions";
import { priorityOf } from "@/lib/callcenter/priority";
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
/** the system codes of CANCEL_REASONS: never offered in a picker (OPE-§6.4) */
export const SYSTEM_CANCEL_REASONS: readonly CancelReason[] = ["blocked", "attempts_exhausted"];
export type TransitionSource = "ui" | "bulk" | "outcome" | "sheet" | "carrier" | "import" | "api" | "bot" | "customer" | "system";
/** move classes: who may make a legal move (checked against StoreCtx.can, core §A.3) */
export type MoveClass = "W" /* orders.write */ | "A" /* orders.assign */ | "L" /* shipments.write */ | "M" /* finance.write */ | "S" /* system only */;

/** Who moves an order (OPE-§3.5). Defined here so the pure plan can read it; ./transition.ts re-exports it. */
export interface OrderActor {
  kind: "user" | "system" | "api" | "bot" | "customer" | "sheet" | "carrier";
  userId: string | null;
  can?: (p: StorePermission) => boolean;
  role?: StoreRole;
}

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
  /** P4: an automatic side move of the same write (OPE-§3.2), recorded with source "system" */
  auto?: true;
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

/* ------------------------------------------------------------------ */
/* the three transition tables (OPE-§3.2, data)                        */
/* ------------------------------------------------------------------ */

/** One legal cell: who may make the move, and its conditions. A missing cell is an illegal move. */
export interface MoveCell {
  /** any one of these classes may make it */
  by: readonly MoveClass[];
  /** † a reason is required (a coded reason, or free text of at least 3 characters) */
  reason?: true;
  /** only while ship ∈ none, to_pack, packed (the moves out of `confirmed`) */
  preShip?: true;
}
type Table<S extends string> = { readonly [F in S]: { readonly [T in S]?: MoveCell } };

const cell = (by: readonly MoveClass[], extra?: Omit<MoveCell, "by">): MoveCell => ({ by, ...extra });
const W = cell(["W"]);
const W_R = cell(["W"], { reason: true });
const S_A = cell(["S", "A"]);
const A_R = cell(["A"], { reason: true });
const L = cell(["L"]);
const S = cell(["S"]);
const M = cell(["M"]);
const M_R = cell(["M"], { reason: true });

/** a confirmation still to be won: the same row for new, attempting and callback */
const OPEN_ROW = { attempting: W, callback: W, confirmed: W, cancelled: W_R, fake: W, duplicate: W, unreachable: S_A } as const;

/**
 * Confirmation axis (row = from). Self moves (attempting → attempting, callback → callback) are no-ops on the axis:
 * the attempt they stand for is the outcome's `call_attempt` event, not a move.
 */
export const CONFIRM_MOVES: Table<ConfirmState> = {
  new: OPEN_ROW,
  attempting: OPEN_ROW,
  callback: OPEN_ROW,
  // P4: every move out of `confirmed` needs the order still pre-ship (the spec names it on `cancelled`; a fake,
  // duplicate or re-call of a parcel already handed to a carrier would leave it shipped under a decided label)
  confirmed: {
    attempting: cell(["A"], { reason: true, preShip: true }),
    cancelled: cell(["W"], { reason: true, preShip: true }),
    fake: cell(["A"], { preShip: true }),
    duplicate: cell(["A"], { preShip: true }),
  },
  cancelled: { attempting: A_R, confirmed: A_R },
  fake: { attempting: A_R },
  duplicate: { attempting: A_R },
  unreachable: { attempting: W, callback: W, confirmed: W, cancelled: W_R, fake: W, duplicate: W },
};

/** Shipping axis. Every move off `none` needs confirm = confirmed (or an implied confirmation, OPE-§3.4). */
export const SHIP_MOVES: Table<ShipState> = {
  none: { to_pack: S },
  to_pack: { packed: L, shipped: L, none: S },
  packed: { shipped: L, to_pack: L, none: S },
  shipped: { in_transit: L, out_for_delivery: L, attempt_failed: L, delivered: L, refused: L, returned: L, lost: L },
  in_transit: { out_for_delivery: L, attempt_failed: L, delivered: L, refused: L, returned: L, lost: L },
  out_for_delivery: { in_transit: L, attempt_failed: L, delivered: L, refused: L, returned: L },
  // attempt_failed → attempt_failed is the next failed attempt: a real move, counted (OD48)
  attempt_failed: { out_for_delivery: L, in_transit: L, delivered: L, refused: L, returned: L, lost: L, postponed: cell(["L", "S"]), attempt_failed: L },
  postponed: { out_for_delivery: L, in_transit: L, attempt_failed: L, delivered: L, refused: L, returned: L, lost: L },
  refused: { returned: L },
  delivered: { returned: A_R },
  returned: { to_pack: A_R },
  lost: { delivered: A_R, returned: A_R },
};

/** Money axis. `refunded` and its cells are R2 (OD59, 0006): planned here, refused by the R1 writer. */
export const MONEY_MOVES: Table<MoneyState> = {
  unpaid: { collected: cell(["S", "M"]) },
  collected: { remitted: cell(["M", "S"]), disputed: M, written_off: M_R, unpaid: S, refunded: M_R },
  disputed: { remitted: M, written_off: M_R, collected: M },
  remitted: { disputed: M_R, refunded: M_R },
  written_off: { collected: M_R },
  refunded: { collected: M_R },
};

/** ship ∈ none, to_pack, packed: nothing handed to a carrier yet */
export const PRE_SHIP: ReadonlySet<ShipState> = new Set(["none", "to_pack", "packed"]);
/** the decided confirmation states that close an order (they clear the lease, the claim and `due_at`) */
export const TERMINAL_CONFIRM: ReadonlySet<ConfirmState> = new Set(["cancelled", "fake", "duplicate", "unreachable"]);
/** a ship target on these confirms the order first (OPE-§3.4) */
const IMPLIED_CONFIRM_FROM: ReadonlySet<ConfirmState> = new Set(["new", "attempting", "callback", "unreachable"]);
/** "Reopen first": people get `illegal`, external sources `external_rejected` (OPE-§3.4, OD5) */
const REOPEN_FIRST: ReadonlySet<ConfirmState> = new Set(["cancelled", "fake", "duplicate"]);
const FINAL_SHIP: ReadonlySet<ShipState> = new Set(["refused", "returned", "lost"]);
const FINAL_ANY: ReadonlySet<ShipState> = new Set(["delivered", "refused", "returned", "lost"]);
/** the walked path: the next step of none → to_pack → shipped (packed joins at shipped) */
const CHAIN_NEXT: Partial<Record<ShipState, ShipState>> = { none: "to_pack", to_pack: "shipped", packed: "shipped" };
const EXTERNAL_SOURCES: ReadonlySet<TransitionSource> = new Set(["sheet", "carrier", "import", "api"]);
const DAY_MS = 86_400_000;
/** callback dates (OPE-§3.5) and holds (OD49) */
export const MAX_CALLBACK_DAYS = 30;
export const MAX_HOLD_DAYS = 60;

/* ------------------------------------------------------------------ */
/* projection and legacy labels (OPE-§3.3, §3.4)                       */
/* ------------------------------------------------------------------ */

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
 *
 * "noop" whenever the label already is the order's projection, so a coarse label never coarsens a finer state
 * (`attempt_failed`, `postponed`, `out_for_delivery` stay under "En livraison"). `no_answer` and `callback` carry no
 * attempt or time here: the caller adds the attempt (`no_answer`) and the next ladder time (`callback`). Legality
 * beyond the table's two "else reject" notes (terminal protection, the walked path) is `planTransition`'s.
 */
export function legacyToWanted(label: OrderStatus, cur: OrderStates): Partial<OrderStates> | "noop" | "reject" {
  if (projectStatus(cur) === label) return "noop";
  switch (label) {
    case "new":
      return "noop"; // nobody "un-calls" an order from a sheet; the app's label is written back
    case "confirmed":
      return cur.confirm === "confirmed" ? "noop" : { confirm: "confirmed" };
    case "no_answer":
      return { confirm: "attempting" };
    case "callback":
      return { confirm: "callback" };
    case "cancelled":
      return PRE_SHIP.has(cur.ship) ? { confirm: "cancelled" } : "reject";
    case "fake":
      return PRE_SHIP.has(cur.ship) ? { confirm: "fake" } : "reject";
    case "duplicate":
      return { confirm: "duplicate" };
    case "unreachable":
      return { confirm: "unreachable" };
    case "shipped":
    case "in_transit":
    case "delivered":
    case "refused":
    case "returned":
    case "lost":
      return { ship: label };
  }
}

/* ------------------------------------------------------------------ */
/* who may move what                                                   */
/* ------------------------------------------------------------------ */

/** The classes an actor holds for one write (OPE-§3.2, §3.4). */
export interface MovePerms {
  /** "S" only for the system */
  classes: ReadonlySet<MoveClass>;
  /** orders.force_status (never for external sources or the system) */
  force: boolean;
  /** a sheet, carrier file, import or API call: never forced, never role-checked, terminal confirmation protected */
  external: boolean;
}

const ALL_BUT_SYSTEM: readonly MoveClass[] = ["W", "A", "L", "M"];

export function movePermsOf(actor: OrderActor, source: TransitionSource): MovePerms {
  if (EXTERNAL_SOURCES.has(source) || actor.kind === "sheet" || actor.kind === "carrier" || actor.kind === "api") {
    return { classes: new Set(ALL_BUT_SYSTEM), force: false, external: true };
  }
  if (actor.kind === "system" || source === "system") return { classes: new Set([...ALL_BUT_SYSTEM, "S"]), force: false, external: false };
  // R3: the WhatsApp bot and the customer's own confirmation act like an agent's outcome, nothing more
  if (actor.kind === "bot" || actor.kind === "customer") return { classes: new Set(["W"]), force: false, external: false };
  const can = actor.can ?? (() => false);
  const classes = new Set<MoveClass>();
  if (can("orders.write")) classes.add("W");
  if (can("orders.assign")) classes.add("A");
  if (can("shipments.write")) classes.add("L");
  if (can("finance.write")) classes.add("M");
  return { classes, force: can("orders.force_status"), external: false };
}

const holds = (c: MoveCell, perms: MovePerms) => c.by.some((k) => perms.classes.has(k));

/** A coded reason of either list, or free text of at least 3 characters (OPE-§3.5). */
export function isValidReason(reason: string | undefined | null): boolean {
  if (!reason) return false;
  const r = reason.trim();
  return (CANCEL_REASONS as readonly string[]).includes(r) || (RETURN_REASONS as readonly string[]).includes(r) || r.length >= 3;
}

/**
 * The ship states between `from` and `to`, `to` included: the direct cell, else the walked path none → to_pack →
 * shipped (packed joins at shipped) up to a state with a direct cell. null = unreachable.
 */
function shipRoute(from: ShipState, to: ShipState): ShipState[] | null {
  const steps: ShipState[] = [];
  let at = from;
  for (;;) {
    if (SHIP_MOVES[at][to]) return [...steps, to];
    const next = CHAIN_NEXT[at];
    if (!next || next === to) return next === to ? [...steps, to] : null;
    steps.push(next);
    at = next;
  }
}

export interface LegalMove {
  axis: Axis;
  to: ConfirmState | ShipState | MoneyState;
  /** the class that makes the final move */
  by: MoveClass;
  /** a reason must be given */
  reason: boolean;
  /** implied steps come first (an implied confirmation, a walked path) */
  implied: boolean;
}

/**
 * Every move the actor may request from `cur` (the "Move to…" menu, OPE-§12.6): the direct cells it holds a class
 * for, plus the ship targets reachable through implied steps. Forced moves are not listed (the menu's "Force…").
 */
export function legalMoves(cur: OrderStates, perms: MovePerms): LegalMove[] {
  const out: LegalMove[] = [];
  const byOf = (c: MoveCell): MoveClass => c.by.find((k) => perms.classes.has(k))!;
  for (const to of CONFIRM_STATES) {
    const c = to === cur.confirm ? undefined : CONFIRM_MOVES[cur.confirm][to];
    if (!c || !holds(c, perms) || (c.preShip && !PRE_SHIP.has(cur.ship))) continue;
    if (perms.external && REOPEN_FIRST.has(cur.confirm)) continue;
    out.push({ axis: "confirm", to, by: byOf(c), reason: !!c.reason && !perms.external, implied: false });
  }
  // a decided order (cancelled, fake, duplicate) takes no ship target until it is reopened
  const impliedConfirm = cur.confirm !== "confirmed" && IMPLIED_CONFIRM_FROM.has(cur.confirm);
  if (cur.confirm === "confirmed" || impliedConfirm) {
    // after an implied confirmation the order sits at to_pack (the automatic move)
    const start: ShipState = impliedConfirm && cur.ship === "none" ? "to_pack" : cur.ship;
    for (const to of SHIP_STATES) {
      if (to === start && to !== "attempt_failed") continue;
      const route = shipRoute(start, to);
      if (!route) continue;
      const prev = route.length > 1 ? route[route.length - 2]! : start;
      const c = SHIP_MOVES[prev][to]!;
      if (!holds(c, perms)) continue;
      out.push({ axis: "ship", to, by: byOf(c), reason: !!c.reason && !perms.external, implied: impliedConfirm || route.length > 1 });
    }
  }
  for (const to of MONEY_STATES) {
    const c = to === cur.money ? undefined : MONEY_MOVES[cur.money][to];
    if (!c || !holds(c, perms)) continue;
    out.push({ axis: "money", to, by: byOf(c), reason: !!c.reason && !perms.external, implied: false });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* the plan                                                            */
/* ------------------------------------------------------------------ */

/** What the plan reads of the order (one row read inside the transition's transaction). */
export interface PlanOrder {
  id: string;
  states: OrderStates;
  totalCents: number;
  riskScore: number;
  attempts: number;
  deliveryAttempts: number;
  /** the stored priority (≥ 1000 = pinned) */
  priority: number;
  shippedAt: Date | null;
  /** R2 (0006): the cash collected; refunds are bounded by it */
  collectedCents?: number | null;
  /** R2: an active shipment row exists, so leaving `to_pack` / `packed` answers `locked_ship` */
  shipmentOpen?: boolean;
}

/** The plan's share of `TransitionInput` (./transition.ts), structurally the same fields. */
export interface PlanInput {
  want: Partial<OrderStates>;
  source: TransitionSource;
  reason?: string;
  dueAt?: Date;
  duplicateOf?: string;
  force?: boolean;
  /** queue bookkeeping the caller sets in the same UPDATE; the plan's own effects win on a clash */
  extra?: { dueAt?: Date | null; attempts?: number; assigneeId?: string | null; leaseUntil?: Date | null; claimToken?: string | null; firstTouchAt?: Date | null; priority?: number; cancelReason?: string | null };
  returnReason?: ReturnReason;
  shipAfter?: Date | null;
  collectedCents?: number;
  /** R2 (OD59): the amount of a move to `refunded`, 0 < x ≤ collected */
  refundCents?: number;
}

export interface PlanCtx {
  now: Date;
  /** who holds the cash after `delivered` (OD52; R1: accounting.myCarrier.settlement) */
  settlement: "at_delivery" | "statement";
  /** the order's `delivery_rescue` calls so far, and ops.rescue.maxCalls (OD48) */
  rescueCallsSoFar: number;
  maxCalls: number;
  /** the member written to `confirmed_by` on a confirmation they made (user actors only; null otherwise) */
  userId: string | null;
}

/** The columns one planned write sets, beside `rev = rev + 1` (names of src/lib/db/schema.ts `orders`). */
export interface PlanSet {
  status: OrderStatus;
  confirmState?: ConfirmState;
  shipState?: ShipState;
  moneyState?: MoneyState;
  confirmedBy?: string | null;
  confirmedAt?: Date;
  dueAt?: Date | null;
  leaseUntil?: Date | null;
  claimToken?: string | null;
  assigneeId?: string | null;
  attempts?: number;
  firstTouchAt?: Date | null;
  priority?: number;
  cancelReason?: string | null;
  mergedInto?: string | null;
  deliveryAttempts?: number;
  shipAfter?: Date | null;
  returnReason?: ReturnReason | null;
  shippedAt?: Date;
  deliveredAt?: Date;
  /** null on a re-shipment (returned → to_pack) */
  finalAt?: Date | null;
  /** R2 (0006, OD51 / OD59): written by the writer once the columns exist */
  collectedCents?: number;
  refundCents?: number;
  refundedAt?: Date;
}

/** What the events of the write record beyond the moves. */
export interface PlanFlags {
  /** `hold_set` (OD49): the hold written (a date), or removed (null) */
  hold?: Date | null;
  /** attempt_failed while rescue calls remain: the order entered the delivery lane (OD48) */
  deliveryLane?: true;
  /** attempt_failed with no rescue call left: event meta `rescue_exhausted` */
  rescueExhausted?: true;
  /** delivered with the cash taken at the door: event meta `settlement: "at_delivery"` (OD52) */
  settledAtDelivery?: true;
}

export type PlanError = "not_found" | "illegal" | "conflict" | "reason_required" | "forbidden" | "locked_ship" | "bad_due" | "bad_duplicate" | "bad_hold" | "bad_amount";

export type Plan =
  | { ok: true; moves: Move[]; states: OrderStates; status: OrderStatus; set: PlanSet; flags: PlanFlags; changed: boolean }
  | { ok: false; error: PlanError; hint?: "reopen_first" | "external_rejected" };

const fail = (error: PlanError, hint?: "reopen_first" | "external_rejected"): Plan => (hint ? { ok: false, error, hint } : { ok: false, error });
const isConfirm = (v: unknown): v is ConfirmState => (CONFIRM_STATES as readonly unknown[]).includes(v);
const isShip = (v: unknown): v is ShipState => (SHIP_STATES as readonly unknown[]).includes(v);
const isMoney = (v: unknown): v is MoneyState => (MONEY_STATES as readonly unknown[]).includes(v);

/**
 * Plans one write (OPE-§3.2-§3.5): the requested move(s), the implied steps and the automatic side moves, the column
 * set and the new projection, or the error the writer answers. Pure: the writer adds `rev`, the events, the attempt
 * and the hooks. Axes are planned confirm → ship → money, each from the state the previous ones left.
 */
export function planTransition(cur: PlanOrder, input: PlanInput, perms: MovePerms, ctx: PlanCtx): Plan {
  const { want } = input;
  if ((want.confirm !== undefined && !isConfirm(want.confirm)) || (want.ship !== undefined && !isShip(want.ship)) || (want.money !== undefined && !isMoney(want.money))) {
    return fail("illegal");
  }
  const now = ctx.now.getTime();
  const st: OrderStates = { ...cur.states };
  const moves: Move[] = [];
  const flags: PlanFlags = {};
  const set: Omit<PlanSet, "status"> = { ...input.extra };
  const reason = input.reason?.trim() || (perms.external ? input.source : undefined);
  let delivered = false;
  let refunded = false;

  /* the effects of one move on the state and the columns (OPE-§3.2 "Automatic side moves") */
  const confirmTo = (to: ConfirmState, flag: { implied?: true; forced?: true }) => {
    const from = st.confirm;
    moves.push({ axis: "confirm", from, to, ...flag });
    st.confirm = to;
    set.confirmState = to;
    if (from === "cancelled") set.cancelReason = null;
    if (from === "duplicate") set.mergedInto = null;
    if (to === "confirmed") {
      set.confirmedAt = ctx.now;
      set.confirmedBy = flag.implied ? null : ctx.userId;
      set.dueAt = null;
      if (st.ship === "none") shipTo("to_pack", { auto: true, ...(flag.implied ? { implied: true } : {}) });
      return;
    }
    if (TERMINAL_CONFIRM.has(to)) {
      set.leaseUntil = null;
      set.claimToken = null;
      set.dueAt = null;
      if (reason && (CANCEL_REASONS as readonly string[]).includes(reason)) set.cancelReason = reason;
      else if (to === "cancelled") set.cancelReason = "other";
      if (to === "duplicate") set.mergedInto = input.duplicateOf ?? null;
    }
    // leaving `confirmed` (a decided order, or "needs another call") takes an unshipped parcel off the pack list
    if (from === "confirmed" && (st.ship === "to_pack" || st.ship === "packed")) shipTo("none", { auto: true });
  };
  const shipTo = (to: ShipState, flag: { implied?: true; forced?: true; auto?: true }) => {
    const from = st.ship;
    moves.push({ axis: "ship", from, to, ...flag });
    st.ship = to;
    set.shipState = to;
    if (to === "shipped" && cur.shippedAt === null && set.shippedAt === undefined) set.shippedAt = ctx.now;
    if (to === "attempt_failed") {
      set.deliveryAttempts = (set.deliveryAttempts ?? cur.deliveryAttempts) + 1;
      if (ctx.rescueCallsSoFar < ctx.maxCalls) {
        set.dueAt = ctx.now; // the delivery lane: the only writer of due_at on a confirmed order
        flags.deliveryLane = true;
        delete flags.rescueExhausted;
      } else {
        set.dueAt = null;
        flags.rescueExhausted = true;
        delete flags.deliveryLane;
      }
      return;
    }
    set.dueAt = null; // every other ship move takes the order out of the delivery lane
    if (to === "postponed") {
      if (input.shipAfter !== undefined) set.shipAfter = input.shipAfter;
      return;
    }
    if (to === "delivered") {
      delivered = true;
      set.deliveredAt = ctx.now;
      if (!FINAL_ANY.has(from)) set.finalAt = ctx.now;
      set.collectedCents = input.collectedCents ?? cur.totalCents;
      if (st.money === "unpaid") {
        moneyTo("collected", { auto: true });
        if (ctx.settlement === "at_delivery") {
          moneyTo("remitted", { auto: true });
          flags.settledAtDelivery = true;
        }
      }
      return;
    }
    if (FINAL_SHIP.has(to)) {
      // final_at is the moment the parcel's outcome became final: refused → returned keeps the refusal's moment
      if (!FINAL_ANY.has(from)) set.finalAt = ctx.now;
      // the coded reason (OD50): a new one replaces it; none keeps the refusal's on refused → returned, else NULL
      if (input.returnReason !== undefined) set.returnReason = input.returnReason;
      else if (!FINAL_SHIP.has(from)) set.returnReason = null;
      // a customer return after delivery: the cash goes back unless the carrier already remitted it (OD59)
      if (from === "delivered" && to === "returned" && st.money === "collected") moneyTo("unpaid", { auto: true });
      return;
    }
    if (from === "returned" && to === "to_pack") {
      // a re-shipment starts a new parcel outcome
      set.finalAt = null;
      set.returnReason = null;
    }
  };
  const moneyTo = (to: MoneyState, flag: { forced?: true; auto?: true }) => {
    moves.push({ axis: "money", from: st.money, to, ...flag });
    st.money = to;
    set.moneyState = to;
    if (to === "refunded") {
      refunded = true;
      set.refundCents = input.refundCents;
      set.refundedAt = ctx.now;
    }
  };

  if (input.force) {
    /* orders.force_status: any from → to on one axis, with a reason; automatic side moves still follow */
    if (perms.external || !perms.force) return fail("forbidden");
    const axes = (["confirm", "ship", "money"] as const).filter((a) => want[a] !== undefined && want[a] !== cur.states[a]);
    if (axes.length !== 1) return fail("illegal");
    if (!isValidReason(reason)) return fail("reason_required");
    if (want.confirm === "duplicate" && (!input.duplicateOf || input.duplicateOf === cur.id)) return fail("bad_duplicate");
    if (axes[0] === "confirm") confirmTo(want.confirm!, { forced: true });
    else if (axes[0] === "ship") shipTo(want.ship!, { forced: true });
    else moneyTo(want.money!, { forced: true });
  } else {
    /* 1. confirmation */
    if (want.confirm !== undefined && want.confirm !== st.confirm) {
      const to = want.confirm;
      if (perms.external && REOPEN_FIRST.has(st.confirm)) return fail("illegal", "external_rejected");
      const c = CONFIRM_MOVES[st.confirm][to];
      if (!c) return fail("illegal", REOPEN_FIRST.has(st.confirm) ? "reopen_first" : undefined);
      if (c.preShip && !PRE_SHIP.has(st.ship)) return fail("illegal");
      if (!holds(c, perms)) return fail("forbidden");
      if (c.reason && !isValidReason(reason)) return fail("reason_required");
      if (to === "duplicate") {
        const person = !perms.external && !perms.classes.has("S");
        if ((person && !input.duplicateOf) || input.duplicateOf === cur.id) return fail("bad_duplicate");
      }
      confirmTo(to, {});
    }

    /* 2. shipping (an implied confirmation first, then the walked path) */
    const selfCounted = want.ship === "attempt_failed" && st.ship === "attempt_failed";
    if (want.ship !== undefined && (want.ship !== st.ship || selfCounted)) {
      const to = want.ship;
      let implied = false;
      if (st.confirm !== "confirmed") {
        if (REOPEN_FIRST.has(st.confirm)) return fail("illegal", perms.external ? "external_rejected" : "reopen_first");
        if (!IMPLIED_CONFIRM_FROM.has(st.confirm)) return fail("illegal");
        implied = true;
      }
      const start: ShipState = implied && st.ship === "none" ? "to_pack" : st.ship;
      const route = to === start && !selfCounted ? [] : shipRoute(start, to);
      if (!route) return fail("illegal");
      if (route.length > 0) {
        const prev = route.length > 1 ? route[route.length - 2]! : start;
        const c = SHIP_MOVES[prev][to]!;
        // people with the class of the final move may make its implied steps (OPE-§3.4)
        if (!holds(c, perms)) return fail("forbidden");
        if (c.reason && !isValidReason(reason)) return fail("reason_required");
      } else if (!holds(CONFIRM_MOVES[st.confirm].confirmed!, perms)) {
        // nothing left to move after the implied confirmation: it is the request, and needs its own class
        return fail("forbidden");
      }
      if (implied) confirmTo("confirmed", { implied: true });
      route.forEach((s, i) => shipTo(s, i < route.length - 1 ? { implied: true } : {}));
    }

    /* 3. money (no walked path: every money move is a direct cell) */
    if (want.money !== undefined && want.money !== st.money) {
      const c = MONEY_MOVES[st.money][want.money];
      if (!c) return fail("illegal");
      if (!holds(c, perms)) return fail("forbidden");
      if (c.reason && !isValidReason(reason)) return fail("reason_required");
      moneyTo(want.money, {});
    }
  }

  /* checks on the values the moves carry */
  // R2: an active shipment pins the parcel; taking it off the pack list waits until the shipment is cancelled
  if (cur.shipmentOpen && moves.some((m) => m.axis === "ship" && m.to === "none")) return fail("locked_ship");
  if (input.dueAt !== undefined && st.confirm === "callback") {
    const t = input.dueAt.getTime();
    if (!(t > now) || t > now + MAX_CALLBACK_DAYS * DAY_MS) return fail("bad_due");
    set.dueAt = input.dueAt;
  }
  if (input.shipAfter !== undefined) {
    const t = input.shipAfter === null ? null : input.shipAfter.getTime();
    if (t !== null && (!(t > now) || t > now + MAX_HOLD_DAYS * DAY_MS)) return fail("bad_hold");
    const postponed = moves.some((m) => m.axis === "ship" && m.to === "postponed");
    // a hold sits on a confirmed order not yet handed over: set with the confirmation, from the drawer, or by postponing
    if (!postponed && !(st.confirm === "confirmed" && PRE_SHIP.has(st.ship))) return fail("bad_hold");
    set.shipAfter = input.shipAfter;
    flags.hold = input.shipAfter;
  }
  if (input.collectedCents !== undefined) {
    const x = input.collectedCents;
    if (!delivered || !Number.isInteger(x) || x < 0 || x > cur.totalCents) return fail("bad_amount");
  }
  if (refunded || input.refundCents !== undefined) {
    const x = input.refundCents;
    const cap = cur.collectedCents ?? cur.totalCents;
    if (!refunded || x === undefined || !Number.isInteger(x) || x <= 0 || x > cap) return fail("bad_amount");
  }
  // every terminal confirmation clears the lease, the claim and due_at, whatever the caller's bookkeeping said
  if (TERMINAL_CONFIRM.has(st.confirm) && moves.some((m) => m.axis === "confirm")) {
    set.leaseUntil = null;
    set.claimToken = null;
    set.dueAt = null;
  }

  const changed = moves.length > 0 || flags.hold !== undefined;
  // recomputed on every write that can move it: a state move, or the caller's attempts / pin (a repeated no-answer)
  if (changed || input.extra?.attempts !== undefined || input.extra?.priority !== undefined) {
    set.priority = priorityOf({ states: st, totalCents: cur.totalCents, risk: cur.riskScore, attempts: set.attempts ?? cur.attempts, priority: set.priority ?? cur.priority });
  }
  const status = projectStatus(st);
  return { ok: true, moves, states: st, status, set: { ...set, status }, flags, changed };
}
