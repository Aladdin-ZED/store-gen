import "server-only";
/**
 * The order's active shipment facts (operations.md OPE-§3.2, OD51, OD52; R2, S4 LOGISTICS owns `src/lib/shipping/**`).
 * The contract step (C2-C) froze `activeShipmentFacts` for the maintainer's R2 seam in P4's `transition.ts` (preloaded
 * inside every transition): `open` = a shipment of the order is not settled (the ship axis is `locked_ship` while it
 * exists), `settlement` = its carrier account's (`statement` | `at_delivery`), null when the order has no shipment (the
 * transition then falls back to `accounting.myCarrier`). Runs inside the caller's transaction when `tx` is given.
 * Contract body until S4 merges: `{ open: false, settlement: null }` (no shipment row can exist before S4), so every
 * transition behaves as in R1.
 */
import type { Tx } from "@/lib/orders/hooks";
import type { WriteScope } from "@/lib/tenancy/types";

/** Is a shipment of the order open, and how does its carrier settle? S4 (contract body: no shipment). */
export async function activeShipmentFacts(scope: WriteScope, orderId: string, tx?: Tx): Promise<{ open: boolean; settlement: "statement" | "at_delivery" | null }> {
  void scope;
  void orderId;
  void tx;
  return { open: false, settlement: null };
}
