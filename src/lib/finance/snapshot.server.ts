import "server-only";
/**
 * The carrier part of the order's cost snapshot (operations.md OPE-§16.3; R2, S3 MONEY). The snapshot freezes the
 * carrier (its rate and settlement) at the shipped move, so the ORDER of shipment creation decides them. Contract rule
 * (C2-C, frozen with the signature): S4 LOGISTICS inserts the `shipments` row (with `carrier_account_id`) BEFORE the
 * ship → shipped move, in the same or an earlier transaction, and calls `refreshSnapshotCarrier(tx, scope, orderId)`
 * when it attaches a shipment to an order that is already shipped. Stub until S3 merges: throws `NotBuiltYet("S3",
 * "refreshSnapshotCarrier")`. No R1 path calls it.
 */
import { notBuiltYet } from "@/lib/contracts/not-built";
import type { Tx } from "@/lib/orders/hooks";
import type { WriteScope } from "@/lib/tenancy/types";

/** Re-read the order's active shipment and rewrite the carrier part of `orders.cost_snapshot`. S3 (stub: NotBuiltYet). */
export async function refreshSnapshotCarrier(tx: Tx, scope: WriteScope, orderId: string): Promise<void> {
  void tx;
  void scope;
  void orderId;
  return notBuiltYet("S3", "refreshSnapshotCarrier");
}
