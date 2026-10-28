/**
 * Queue priority (P4 CALL CENTER; operations.md OPE-§5.4, OD48). Pure and isomorphic: `planTransition`
 * (src/lib/orders/state.ts) recomputes it on every transition, the creation hook and `editOrder` on every edit.
 *
 *   priorityOf(o) = base[lane]                         delivery 650 · callback 600 · new 500 · attempting 300
 *                 + min(100, 5 × floor(totalCents / 10_000))   +5 per 100 of currency, at most +100
 *                 − (risk ≥ 70 ? 150 : risk ≥ 50 ? 50 : 0)     likely-fake orders after real ones
 *                 − min(200, 40 × attempts)                    tried often → later
 *                 + (pinned ? 1000 : 0)                        manager "Pin to top" (pinned ⇔ stored priority ≥ 1000)
 *
 * Every weight is a reasoned starting value, not researched [to tune]. Age is not in the number: the claim's ORDER BY
 * uses `due_at` / `created_at` next, so a fresh order is never starved by an old one of the same priority.
 */
import type { OrderStates } from "@/lib/orders/state";

/** the queue lanes and their base (OD48: a rescue outranks a callback, the parcel is out and the courier waits) */
export const PRIORITY_BASE = { delivery: 650, callback: 600, new: 500, attempting: 300 } as const;
export type QueueLane = keyof typeof PRIORITY_BASE;
/** "Pin to top": a stored priority ≥ PIN_BOOST is pinned, and stays pinned through every recomputation */
export const PIN_BOOST = 1000;

/** The lane an order is ranked in; null for an order no lane hands out (decided, or confirmed and moving normally). */
export function laneOf(s: Pick<OrderStates, "confirm" | "ship">): QueueLane | null {
  switch (s.confirm) {
    case "new":
    case "attempting":
    case "callback":
      return s.confirm;
    case "confirmed":
      return s.ship === "attempt_failed" || s.ship === "postponed" ? "delivery" : null;
    default:
      return null;
  }
}

export const isPinned = (storedPriority: number): boolean => storedPriority >= PIN_BOOST;

export interface PriorityInput {
  states: Pick<OrderStates, "confirm" | "ship">;
  totalCents: number;
  /** orders.risk_score (0-100) */
  risk: number;
  /** orders.attempts (the confirm ladder's no-contact attempts) */
  attempts: number;
  /** the stored priority: ≥ PIN_BOOST keeps the pin */
  priority?: number;
}

export function priorityOf(o: PriorityInput): number {
  const lane = laneOf(o.states);
  const base = lane === null ? 0 : PRIORITY_BASE[lane];
  const amount = Math.min(100, 5 * Math.floor(Math.max(0, o.totalCents) / 10_000));
  const risk = o.risk >= 70 ? 150 : o.risk >= 50 ? 50 : 0;
  const tries = Math.min(200, 40 * Math.max(0, Math.trunc(o.attempts)));
  return base + amount - risk - tries + (isPinned(o.priority ?? 0) ? PIN_BOOST : 0);
}
