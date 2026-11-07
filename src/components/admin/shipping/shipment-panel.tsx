"use client";
/**
 * The order's shipment panel (operations.md OPE-§17.4, §17.5, OD55; R2, S4 LOGISTICS owns
 * `src/components/admin/shipping/**`). The R2 contract step (C2-E) froze its props and mounted it in P4's order drawer
 * (src/components/admin/orders/order-drawer.tsx) in place of the R1 tracking block when the order has a shipment (the
 * drawer's R2 block, absent while `releaseOn("R2")` is false): in R2 the shipment is the truth. S4's body loads the
 * shipment, its carrier events, the tracking, cancel-before-pickup and "Changes to pass on". Stub until S4 merges:
 * renders nothing (`null`).
 */
import type { ReactElement } from "react";

export interface ShipmentPanelProps {
  orderId: string;
  /** the drawer's re-read after a change */
  onChanged: () => void;
}

/** S4 (stub: renders nothing). */
export function ShipmentPanel(props: ShipmentPanelProps): ReactElement | null {
  void props;
  return null;
}
