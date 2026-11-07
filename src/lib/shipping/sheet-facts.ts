import "server-only";
/**
 * The Google Sheets shipment binding (operations.md OPE-§19, IN-09 R2; S4 LOGISTICS owns `src/lib/shipping/**`). The
 * contract step (C2-C) froze `applySheetShipmentFacts` for S5 INTEGRATIONS 2's Sheets sync: the owner typed a
 * "Tracking", "Transporteur" or "Frais livraison" cell; S4 applies it to the order's shipment (creating the primary
 * shipment when none exists and the carrier label matches an account, `accountByLabel`), with `src.kind = "sheet"`
 * (actor kind `sheet`: hand-set, never carrier evidence, AI R45). S4's rule, frozen with it: every shipment write keeps
 * `orders.tracking_ref`, `orders.carrier_label` and `sheet_dirty |= 2` in sync, so the Sheet and the webhook tracking
 * field mirror the shipment. Stub until S4 merges: throws `NotBuiltYet("S4", "applySheetShipmentFacts")`; S5 keeps its
 * R1 behaviour (the columns written to `orders` only) when `isNotBuiltYet`. No R1 path calls it.
 */
import { notBuiltYet } from "@/lib/contracts/not-built";
import type { WriteScope } from "@/lib/tenancy/types";

/** Apply the Sheet's shipment cells of one order. S4 (stub: NotBuiltYet). */
export async function applySheetShipmentFacts(
  scope: WriteScope,
  orderId: string,
  facts: { tracking?: string; carrierLabel?: string; feeCents?: number },
  src: { kind: "sheet"; ref: string },
): Promise<{ ok: true; changed: boolean; shipmentId: string | null; carrierAccountId: string | null } | { ok: false; error: "not_found" | "invalid" | "no_shipment" }> {
  void scope;
  void orderId;
  void facts;
  void src;
  return notBuiltYet("S4", "applySheetShipmentFacts");
}
