import "server-only";
/**
 * Carrier rates per account (operations.md OPE-§16.4, §17.3; R2, S3 MONEY owns every `carrier_rates` write). The
 * contract step (C2-C) froze the figure S4 LOGISTICS shows in the "Rates" block of one carrier account: the estimated
 * fees (from S3's rates) against the fees the carrier's statements charged, over the account's parcels, integer minor
 * units, test orders excluded. null = no rate or no statement yet (an honest line, never 0). The editor of an account's
 * rates is S3's `<CarrierRatesEditor />` (src/components/admin/finance/carrier-rates-editor.tsx). Contract body until
 * S3 merges: null. No R1 path calls it.
 */
import type { StoreScope } from "@/lib/tenancy/types";

/** Estimated vs charged fees of one carrier account, or null. S3 (contract body: null). */
export async function carrierRateSummary(scope: StoreScope, accountId: string): Promise<{ estimatedCents: number; chargedCents: number; parcels: number } | null> {
  void scope;
  void accountId;
  return null;
}
