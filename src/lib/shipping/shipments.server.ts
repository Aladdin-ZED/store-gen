import "server-only";
/**
 * Shipments (operations.md OPE-§17.4; `shipments`, `shipment_events`, 0006; R2, S4 LOGISTICS owns
 * `src/lib/shipping/**`). The contract step (C2-C) froze the readers and the one write other tracks call before S4
 * merges:
 *   - `shipmentByTracking(scope, accountId, tracking)`: S3 MONEY's remittance matching (a statement line → its
 *     shipment; S3 writes `shipments.remittance_id` and the actual fees);
 *   - `trackingLinkFor(scope, orderId)`: S5 INTEGRATIONS 2's webhook payload `tracking` field (OPE-§23.2) and P5's
 *     "shipped" WhatsApp template `{tracking_link}`; null = no tracking yet;
 *   - `setShipmentTracking(ctx, shipmentId, tracking)`: tracking ≤ 64 trimmed, unique per (store, account)
 *     (`tracking_taken`), mirrors `orders.tracking_ref` for the primary shipment, event `tracking_set`, moves a to_pack /
 *     packed shipment to shipped; clearing never moves the axis.
 * Contract bodies until S4 merges: the reads answer "none"; the write throws `NotBuiltYet("S4",
 * "setShipmentTracking")`. No R1 path calls them.
 */
import { notBuiltYet } from "@/lib/contracts/not-built";
import type { shipments } from "@/lib/db/schema";
import type { ActionResult, StoreScope, WriteCtx } from "@/lib/tenancy/types";

export type ShipmentRow = typeof shipments.$inferSelect;

/** The shipment of this account with this tracking number, or null. S4 (contract body: null). */
export async function shipmentByTracking(scope: StoreScope, accountId: string, tracking: string): Promise<ShipmentRow | null> {
  void scope;
  void accountId;
  void tracking;
  return null;
}

/** The order's primary shipment tracking (carrier label, number, public URL when the account has one). S4 (contract body: null). */
export async function trackingLinkFor(scope: StoreScope, orderId: string): Promise<{ carrier: string; number: string; url?: string } | null> {
  void scope;
  void orderId;
  return null;
}

/** Set or clear a shipment's tracking number. S4 (stub: NotBuiltYet). */
export async function setShipmentTracking(ctx: WriteCtx, shipmentId: string, tracking: string | null): Promise<ActionResult<{ changed: boolean; orderRev: number }>> {
  void ctx;
  void shipmentId;
  void tracking;
  return notBuiltYet("S4", "setShipmentTracking");
}
