import "server-only";
/**
 * Carrier accounts (operations.md OPE-§17.3; `carrier_accounts`, 0006; R2, S4 LOGISTICS owns `src/lib/shipping/**`).
 * The contract step (C2-C) froze the two readers other tracks call before S4 merges:
 *   - `listCarrierAccounts(scope, opts?)`: S3 MONEY's remittance matching and settlement per account;
 *   - `accountByLabel(scope, label)`: S5 INTEGRATIONS 2's Sheets "Transporteur" binding (folded match: case, accents
 *     and spaces ignored).
 * Contract bodies until S4 merges: no account (no row can exist before S4). No R1 path calls them.
 */
import type { carrierAccounts } from "@/lib/db/schema";
import type { StoreScope } from "@/lib/tenancy/types";

export type CarrierAccountRow = typeof carrierAccounts.$inferSelect;

/** The store's carrier accounts, active ones only unless `includeDisabled`. S4 (contract body: none). */
export async function listCarrierAccounts(scope: StoreScope, opts?: { includeDisabled?: boolean }): Promise<CarrierAccountRow[]> {
  void scope;
  void opts;
  return [];
}

/** The account whose label matches (folded), or null. S4 (contract body: null). */
export async function accountByLabel(scope: StoreScope, label: string): Promise<CarrierAccountRow | null> {
  void scope;
  void label;
  return null;
}
