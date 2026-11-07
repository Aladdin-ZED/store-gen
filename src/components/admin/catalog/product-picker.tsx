"use client";
/**
 * The products picker of the store-mode manual-order sheet (storefront.md STO-§16.9 step 5; core §K.4 S1 / S4 rows,
 * OPS-15). Track S1 STOREFRONT owns this file in R2 and builds it: search by name or SKU over the store's ACTIVE
 * products, then the Offers v2 pickers (offer, options, units) built from `productAsPageDoc`, read-only over the
 * catalog (it never edits a product). S4 LOGISTICS imports it read-only in `src/components/admin/orders/manual/**`
 * (the sheet's `store` / `both` branch) and builds against the props frozen here (C2-C); the sheet owns the lines
 * state and asks S1's `quoteManualOrderV3` for prices: the picker shows no amount of its own except the quote's.
 * Stub until S1 merges: renders nothing (`null`). No R1 screen mounts it (the store branch exists only in R2).
 */
import type { ReactElement } from "react";
import type { ManualLineV3, ManualQuoteV3 } from "@/lib/catalog/order-v3.server";
import type { Locale } from "@/lib/page/schema";

export interface ProductPickerProps {
  /** the store handle (the picker reads the store's active products through S1's admin API) */
  handle: string;
  /** the admin locale for labels; product names show in the store's default locale */
  locale: Locale;
  /** the sheet's lines, ≤ 20 (`LineIn` without `ls` / `rev`) */
  lines: readonly ManualLineV3[];
  /** add, change or remove a line; the sheet re-quotes (debounced 250 ms) */
  onChange(lines: ManualLineV3[]): void;
  /** the last server quote: per-line verdicts (`unavailable` / `removed` / `changed`) and the amounts shown */
  quote: ManualQuoteV3 | null;
  disabled?: boolean;
}

/** S1 (stub: renders nothing). */
export function ProductPicker(props: ProductPickerProps): ReactElement | null {
  void props;
  return null;
}
