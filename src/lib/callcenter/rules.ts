import "server-only";
/**
 * Assignment rules (operations.md OPE-§5.6, OP-18; R2, S4 LOGISTICS owns this file). The contract step (C2-C) froze
 * `assignByRules` for the maintainer's R2 seam in P4's `assignOnCreate` (src/lib/orders/queue.ts): rules run FIRST, in
 * every assignment mode; `handled: true` ends the assignment with `assigned` (an agent id, or null = a rule decided to
 * leave the order in the pool); `handled: false` falls through to the store's mode (round robin, pull, manual). Test
 * orders are never assigned by a rule. Contract body until S4 merges: `{ handled: false, assigned: null }` (no rule can
 * exist before S4), so assignment behaves as in R1.
 */
import type { WriteScope } from "@/lib/tenancy/types";

/** Apply the store's assignment rules to a new order. S4 (contract body: not handled). */
export async function assignByRules(scope: WriteScope, order: { id: string; isTest: boolean }): Promise<{ handled: boolean; assigned: string | null }> {
  void scope;
  void order;
  return { handled: false, assigned: null };
}
