import "server-only";
/**
 * The platform console's money figures of a store (R2, S3 MONEY). The contract step (C2-C) froze the readers S6
 * PLATFORM UX renders: the dashboard funnel's "collected" step and the "cash to collect" tile (`cashCollected`), and the
 * console Ops tab's remittance ageing (`remittanceAgeingForConsole`, the OPE-§16.7 buckets). Test orders excluded,
 * integer minor units. null renders an honest line, never 0. Contract bodies until S3 merges: null. No R1 path calls
 * them.
 */
import type { StoreScope } from "@/lib/tenancy/types";
import type { AgeingLabel } from "./remittance/cash-held.server";

/** Collected and still-to-collect money of delivered orders in a range (store-local "YYYY-MM-DD"). S3 (contract body: null). */
export async function cashCollected(scope: StoreScope, range: { from: string; to: string }): Promise<{ collectedCents: number; toCollectCents: number; n: number } | null> {
  void scope;
  void range;
  return null;
}

/** Collected-not-remitted money by age (statement carriers). S3 (contract body: null). */
export async function remittanceAgeingForConsole(scope: StoreScope): Promise<{ buckets: { label: AgeingLabel; cents: number; orders: number }[]; n: number } | null> {
  void scope;
  return null;
}
