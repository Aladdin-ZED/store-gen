import "server-only";
/**
 * `transitionOrder` and `applyExternalStatus` (P4 CALL CENTER; operations.md OPE-§3.5; docs/STORE-SAAS.md §K.2 P0):
 * the only writer of `orders.status`, `confirm_state`, `ship_state` and `money_state` besides the creation insert
 * (OPE-§3.7). Typed stubs frozen at P0; P4 replaces the bodies, never the signatures
 * (src/lib/contracts/r1-p0.ts asserts them).
 *
 * The scope is a `WriteScope` (D71: every repository that writes a tenant table takes one; OPE-§3.5 predates D71 and
 * writes `StoreScope`), so lint L6 passes P4's body without a cast. The order hooks receive the same scope.
 */
import type { StorePermission, StoreRole } from "@/lib/auth/permissions";
import type { AttemptOutcome, DeliveryOutcome } from "@/lib/callcenter/outcomes";
import type { StoreCtx, SystemCtx, WriteScope } from "@/lib/tenancy/types";
import type { OrderStatus } from "./contract";
import type { OrderRow } from "./hooks";
import type { CancelReason, MoneyState, OrderStates, ReturnReason, ShipState, TransitionSource } from "./state";

export interface OrderActor {
  kind: "user" | "system" | "api" | "bot" | "customer" | "sheet" | "carrier";
  userId: string | null;
  can?: (p: StorePermission) => boolean;
  role?: StoreRole;
}

/** The actor of a member's request (kind "user") or of a job (kind "system"), for `transitionOrder`. */
export function actorFrom(ctx: StoreCtx | SystemCtx, kind?: OrderActor["kind"]): OrderActor {
  void ctx;
  void kind;
  throw new Error("not implemented: P4 actorFrom");
}

export interface TransitionInput {
  orderId: string;
  want: Partial<OrderStates>;
  source: TransitionSource;
  /** UI passes the rev it rendered; external sources omit it (internal retry ×3) */
  expectRev?: number;
  /** coded; † moves refuse without it (≥ 3 chars for free text) */
  reason?: CancelReason | string;
  /** ≤ 500 */
  note?: string;
  /** callback: > now, ≤ now + 30 days */
  dueAt?: Date;
  /** must be an order of the same store and phone */
  duplicateOf?: string;
  /** orders.force_status + reason; any from → to on one axis */
  force?: boolean;
  /** written as call_attempt in the same transaction */
  attempt?: { channel: "call" | "whatsapp"; outcome: AttemptOutcome | DeliveryOutcome; lane?: "confirm" | "delivery" };
  extra?: Partial<Pick<OrderRow, "dueAt" | "attempts" | "assigneeId" | "leaseUntil" | "claimToken" | "firstTouchAt" | "priority" | "cancelReason">>;
  /** external reference for the event meta (sheet row, import run, webhook delivery) */
  ref?: string;
  // rev 3 (additive):
  /** ship → refused / returned / lost (OD50) */
  returnReason?: ReturnReason;
  /** confirm → confirmed with a hold, ship → postponed (OD49); null removes a hold */
  shipAfter?: Date | null;
  /** ship → delivered (R2, OD51); default = total; 0 ≤ x ≤ total cents */
  collectedCents?: number;
  /** R2 partial delivery (OD51), written as line_outcome */
  lines?: { i: number; state: "delivered" | "refused" | "pending"; qty: number }[];
  /** OD53: the customer called; relaxes the OD12 visibility rule for a looked-up order */
  inbound?: boolean;
}

export type TransitionError = "not_found" | "illegal" | "conflict" | "reason_required" | "forbidden" | "locked_ship" | "bad_due" | "bad_duplicate" | "bad_hold" | "bad_amount";
export type TransitionResult =
  | { ok: true; rev: number; states: OrderStates; status: OrderStatus; eventIds: number[]; changed: boolean }
  | { ok: false; error: TransitionError; current?: { rev: number; states: OrderStates; status: OrderStatus } };

/** One transaction: legality, implied and automatic moves, the projection, events, then the order hooks (OPE-§3.5). */
export async function transitionOrder(actor: OrderActor, scope: WriteScope, input: TransitionInput): Promise<TransitionResult> {
  void actor;
  void scope;
  void input;
  throw new Error("not implemented: P4 transitionOrder");
}

/** Sheets, carrier files, imports and the API: never forced, never role-checked, legality and implication kept (OPE-§3.4). */
export async function applyExternalStatus(
  scope: WriteScope,
  orderId: string,
  ext: { legacy?: OrderStatus; ship?: ShipState; money?: MoneyState; at?: Date },
  src: { kind: "sheet" | "carrier" | "import" | "api"; ref?: string },
): Promise<TransitionResult | { ok: true; changed: false; noop: true }> {
  void scope;
  void orderId;
  void ext;
  void src;
  throw new Error("not implemented: P4 applyExternalStatus");
}
