import "server-only";
/**
 * Inventory writes (storefront.md STO-§5; S1 STOREFRONT owns this file in R2: levels, `adjustInventory`, the
 * `inventory_moves` history, low-stock crossings). The contract step (C2-C) froze `restockLines` for the callers
 * outside S1:
 *   - S4 LOGISTICS: the refused / returned lines of a settled partial child shipment (OPE OD51), inside S4's own
 *     transaction (`opts.tx`), and the drawer's "Remettre en stock" on a returned order (reason `returned_restock`);
 *   - S1's own `storefront` order hook (the first partial delivery's refused units).
 * Rule (STO-§5, rev 4): one `returned_restock` move per (order, product, stock key) whose `delta` is the SUM of the
 * restocked units over every call for the order (upsert on `im_order_uq`: the level moves by the difference), so a
 * replay or a later child outcome never double-counts. `lines` index into the v3 `items.lines` (a v2 order: line 0).
 * Stub until S1 merges: throws `NotBuiltYet("S1", "restockLines")`. No R1 path calls it.
 */
import { notBuiltYet } from "@/lib/contracts/not-built";
import type { Tx } from "@/lib/orders/hooks";
import type { WriteScope } from "@/lib/tenancy/types";

/** Units to put back: `i` = the line index in `orders.items`, `qty` = physical units of that line. */
export interface RestockLine {
  i: number;
  qty: number;
}

/** Put the given lines' units back in stock (idempotent per order and stock key). S1 (stub: NotBuiltYet). */
export async function restockLines(
  scope: WriteScope,
  orderId: string,
  lines: readonly RestockLine[],
  opts: { reason: "returned_restock"; tx?: Tx },
): Promise<{ moves: number }> {
  void scope;
  void orderId;
  void lines;
  void opts;
  return notBuiltYet("S1", "restockLines");
}
