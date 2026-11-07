"use client";
/**
 * The store-mode "test order" slot of the dashboard's `AddressCard` (storefront.md STO-D33; S1 STOREFRONT owns this
 * file in R2). The contract step (C2-C) froze its props for S6 PLATFORM UX, which takes over P2's dashboard
 * (`src/components/admin/dashboard/blocks.tsx`) and passes `slots.testOrder = <StoreTestOrderSlot live={…} />` when the
 * store mode is `store` or `both`, keeping P2's / P3's `TestOrderSlot` for landing mode. S1's body mints the store's
 * 2-hour `?sg-test=` link (no pixel fires, the order is marked test) and opens it; disabled while no store page is live.
 * Stub until S1 merges: renders nothing (`null`). No R1 screen mounts it.
 */
import type { ReactElement } from "react";

/** S1 (stub: renders nothing). `live`: the store's home is published. */
export function StoreTestOrderSlot(p: { live: boolean }): ReactElement | null {
  void p;
  return null;
}
