/**
 * Order text and units of a v3 (store) order (storefront.md STO-§16.4, STO-§16.5; request STO-R8; isomorphic, pure).
 * Track S1 STOREFRONT owns this file in R2. The contract step (C2-C) froze the two readers S3 MONEY, S4 LOGISTICS and S5
 * INTEGRATIONS 2 call for `items.v === 3` rows (Sheets "Variante" / "SKU" / "Articles", the drawer lines, the Carrier
 * CSV and manifest, picking lists, webhook items); `orderText(items)` (src/lib/orders/text.ts) dispatches v3 here.
 *
 * - `orderUnitsV3(items)`: every line's physical units, each pack's units repeated `n` times, tagged with its line and
 *   product. The contract body below is final unless S1 changes it through its own tests (it is the plain flattening
 *   of the frozen `OrderItemsV3`).
 * - `orderTextV3(items, opts)`: `textV3 := lineText (" ++ " lineText)*`, `lineText := [n " × "] productShort
 *   [" (" packLabel ")"] [" : " packText]`, warehouse and customer modes, 1,000-character cap with
 *   ` … (+{n}, voir {orderId})`. Stub until S1 merges: throws `NotBuiltYet("S1", "orderTextV3")`.
 * No R1 path reaches either: no v3 order exists before R2.
 */
import { notBuiltYet } from "@/lib/contracts/not-built";
import type { OrderUnit } from "@/lib/db/schema";
import type { OrderItemsV3 } from "@/lib/orders/contract-v3";
import { orderUnits, type TextMode } from "@/lib/orders/text";

/** One physical unit of a v3 order, tagged with its line (index into `items.lines`) and product. */
export type OrderUnitV3 = OrderUnit & { line: number; productId: string; productKey: string; productName: string };

/** The physical units of every line (free units included, the bump never: v3 has none). */
export function orderUnitsV3(items: OrderItemsV3): OrderUnitV3[] {
  const out: OrderUnitV3[] = [];
  items.lines.forEach((l, line) => {
    const pack = orderUnits(l.pack, l.productName);
    for (let k = 0; k < Math.max(1, l.n); k++) {
      for (const u of pack) out.push({ ...u, line, productId: l.productId, productKey: l.productKey, productName: l.productName });
    }
  });
  return out;
}

/** The warehouse / customer text of a v3 order (STO-§16.5). S1 (stub: NotBuiltYet). */
export function orderTextV3(items: OrderItemsV3, opts: { mode?: TextMode; orderId?: string } = {}): string {
  void items;
  void opts;
  return notBuiltYet("S1", "orderTextV3");
}
