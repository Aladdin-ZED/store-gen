import "server-only";
/**
 * The shipping funnel of a store (R2, S4 LOGISTICS owns `src/lib/shipping/**`). The contract step (C2-C) froze
 * `shipmentFunnel` for S6 PLATFORM UX: the dashboard funnel's shipped / delivered steps and the console KPI row
 * (delivery rate, delivered sales, refusal / return rate). Orders shipped in the range (store-local "YYYY-MM-DD"), test
 * orders excluded; `deliveredCents` = the delivered orders' value in the store currency (integer minor units). null
 * renders an honest line, never 0. Contract body until S4 merges: null. No R1 path calls it.
 */
import type { StoreScope } from "@/lib/tenancy/types";

/** Shipped, delivered, refused and returned counts in a range, or null. S4 (contract body: null). */
export async function shipmentFunnel(
  scope: StoreScope,
  range: { from: string; to: string },
): Promise<{ shipped: number; delivered: number; refused: number; returned: number; deliveredCents: number; n: number } | null> {
  void scope;
  void range;
  return null;
}
