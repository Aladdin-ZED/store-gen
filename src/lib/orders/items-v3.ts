/**
 * FROZEN CONTRACT (R2 contract step C2-B1, maintainer; storefront.md STO-§16.4, request STO-R8): the zod-free half of
 * src/lib/orders/contract-v3.ts, so isomorphic R1 readers (Sheets rows, the call-center card, message templates) read
 * `orders.items` without pulling zod into a client chunk. Owning track: S1 STOREFRONT writes `OrderItemsV3`; S3 / S4 /
 * S5 read it. A track never edits this file: a change goes through a CCR to the maintainer (docs/saas/ccr/README.md)
 * and is re-frozen in src/lib/contracts/r2-contract.ts.
 */
import type { OrderItems } from "@/lib/db/schema";
import type { OrderItemsV3 } from "./contract-v3";

/** `orders.items` of any row: v1 / v2 (`OrderItems`) or v3 (request STO-R8). */
export type AnyOrderItems = OrderItems | OrderItemsV3;

/** The row is a store (v3) order. */
export const isItemsV3 = (items: AnyOrderItems): items is OrderItemsV3 => (items as { v?: unknown } | null | undefined)?.v === 3;

/**
 * The v1 / v2 view of any `orders.items` (request STO-R8): the R1 readers (drawer, CSV, Sheets, call-center card,
 * Telegram, templates, tracking) read every order through it. A v1 / v2 value is returned AS IS (the same object, so
 * R1 output is byte-identical); a v3 value becomes one v2-shaped record over all its lines: the labels joined with
 * " + " ("2 × Name · Pack"), the physical units of every pack repeated `n` times with the product name as the unit
 * label when the pack had none, `qty` = Σ n × pack.qty, `price` = Σ lineCents / 100 with `deltas` 0, `unitPrice` =
 * that price / qty. Read-only: a writer of a v3 order never writes this view back (it would drop the lines).
 * S1's `orderTextV3` / `orderUnitsV3` (src/lib/catalog/order-text-v3.ts) replace it where a reader knows v3.
 */
export function orderItemsView(items: AnyOrderItems): OrderItems {
  if (!isItemsV3(items)) return items;
  const units: NonNullable<OrderItems["units"]> = [];
  const variants: OrderItems["variants"] = [];
  const extras: NonNullable<OrderItems["extras"]> = [];
  let qty = 0;
  let cents = 0;
  for (const l of items.lines) {
    const n = Math.max(1, l.n);
    qty += n * l.pack.qty;
    cents += l.lineCents;
    for (let i = 0; i < n; i++) {
      for (const u of l.pack.units ?? []) units.push({ ...u, label: u.label || l.productName });
      variants.push(...(l.pack.variants ?? []));
    }
    extras.push(...(l.pack.extras ?? []));
  }
  const price = cents / 100;
  return {
    v: 2,
    bundleId: items.lines.map((l) => l.pack.bundleId).join("+"),
    bundleLabel: items.lines.map((l) => `${l.n > 1 ? `${l.n} × ` : ""}${l.productName}${l.pack.bundleLabel ? ` · ${l.pack.bundleLabel}` : ""}`).join(" + "),
    qty,
    unitPrice: qty > 0 ? Math.round(cents / qty) / 100 : 0,
    variants,
    units,
    ...(extras.length ? { extras } : {}),
    price,
    deltas: 0,
  };
}
