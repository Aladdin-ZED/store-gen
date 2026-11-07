"use client";
/**
 * The money slot of the order drawer (operations.md OPE-§16.7, SF-09; R2, S3 MONEY owns
 * `src/components/admin/finance/**`). The contract step (C2-C) froze its props: the maintainer mounts
 * `<MoneySlot …/>` once inside P4's `MoneyBlock` (src/components/admin/orders/order-drawer.tsx) for the owner or a
 * `finance.read` holder, from the drawer's own order read. S3's body shows the money axis (collected vs total, refund,
 * the statement that remitted it: "collected 329.00 instead of 349.00 · statement AMX-41") and its actions. Stub until
 * S3 merges: renders nothing (`null`). No R1 screen mounts it.
 */
import type { ReactElement } from "react";
import type { MoneyState, ShipState } from "@/lib/orders/state";

export interface MoneySlotProps {
  orderId: string;
  money: MoneyState;
  ship: ShipState;
  totalCents: number;
  /** `orders.collected_cents` (null before delivery) */
  collectedCents: number | null;
  /** `orders.refund_cents` */
  refundCents: number | null;
  currency: string;
  /** the shipment's carrier account settlement, else "my carrier" (`accounting.myCarrier`); null = unknown */
  settlement: "statement" | "at_delivery" | null;
  /** the `remitted` event's statement line, when the money axis is remitted by a statement */
  remitted: { statementRef: string; line: number | null; at: string } | null;
}

/** S3 (stub: renders nothing). */
export function MoneySlot(props: MoneySlotProps): ReactElement | null {
  void props;
  return null;
}
