import "server-only";
/**
 * ⌘K search provider of the ops track (P4 CALL CENTER, operations.md OPE-§27.7, OD53, OD61; UX-02).
 * Extension file (docs/STORE-SAAS.md §I.3, §K.3; LAN Q18), imported by src/lib/admin-data/search/registry.ts.
 *
 *   order      an id prefix ("MA-7K"), ≥ 4 phone digits or an exact tracking reference (`searchOrders`); agents see
 *              their own queue only, plus the exact-phone inbound lookup at ≥ 8 digits
 *   customer   a name fragment (≥ 3 characters) or ≥ 4 phone digits, for members who read every order and customers
 *              (`searchCustomers`; agents never list customers)
 *
 * Every hit is masked (first name + initial, `06 •• •• 56 78`); both halves run in parallel inside the 120 ms budget.
 */
import { searchCustomers, searchOrders } from "@/lib/orders/profile";
import type { SearchHit, SearchProvider } from "./types";

export const provider: SearchProvider = {
  id: "ops",
  kinds: ["order", "customer"],
  search: async (scope, q, viewer) => {
    const [ordersHits, customerHits] = await Promise.all([searchOrders(scope, q, viewer, 8), searchCustomers(scope, q, viewer, 8)]);
    const seen = new Set<string>();
    const out: SearchHit[] = [];
    for (const h of [...ordersHits, ...customerHits]) {
      const key = `${h.kind}:${h.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(h);
    }
    return out;
  },
};
