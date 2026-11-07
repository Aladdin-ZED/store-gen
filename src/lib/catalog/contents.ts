/**
 * Ad-event contents of a v3 (store) order (storefront.md STO-§16.6 with STO-D18; isomorphic, pure). Track S1
 * STOREFRONT owns this file in R2. The contract step (C2-C) froze `contentsOfV3` for S5 INTEGRATIONS 2's server events
 * (the P5 conversions it takes over in R2) and S1's own `store-thanks` chunk:
 *   per unit content id = `contentIdOf(item, productKey)` (SKU, else `<productKey>.<itemId>`, `<productKey>` for
 *   `main`), quantity summed per id across lines × `n`, `itemPrice` from `allocate()` per pack (free units 0);
 *   `value` = the order total; `numItems` = Σ quantities; `contentName` = the product name for one line, else
 *   "{n} produits".
 * The line shape is the R1 conversions' `ContentLine` (src/lib/orders/conversions-core.ts), so one sender serves v2 and
 * v3 orders. Stub until S1 merges: throws `NotBuiltYet("S1", "contentsOfV3")`. No R1 path reaches it.
 */
import { notBuiltYet } from "@/lib/contracts/not-built";
import type { OrderItemsV3 } from "@/lib/orders/contract-v3";
import type { ContentLine } from "@/lib/orders/conversions-core";
import type { StoreRow } from "@/lib/tenancy/types";

export interface OrderContentsV3 {
  contents: ContentLine[];
  numItems: number;
  /** the order total, currency units (2 decimals) */
  value: number;
  contentName: string;
}

/** The contents of a v3 order for pixel and server events. S1 (stub: NotBuiltYet). */
export function contentsOfV3(items: OrderItemsV3, store: StoreRow): OrderContentsV3 {
  void items;
  void store;
  return notBuiltYet("S1", "contentsOfV3");
}
