import "server-only";
/**
 * Per-version outcome counters (ai.md AI-§G.4, AI-12; core §D.6 `stats_version_daily`, §K.4 R2 contract step C2-B2:
 * AI R22, LAN Q26). Track S7 owns this file in R2 and writes the body (one upsert of the delta on the row
 * (store, page, version, variant_key, utm_source, day)); S7's order hook (`src/lib/orders/hooks/ai.ts`) bumps the
 * order columns, `recordEvent` (src/lib/stats/index.ts, the call line written by the contract step) the beacon ones.
 *
 *   bumpVersionStats(scope, pageId, versionId, day, utmSource, delta, variantKey = "")
 *   utmBucket(source)   the beacon's `utm.source` as the row's `utm_source` (≤ 40 chars, '' when absent)
 *
 * Test traffic never reaches it (D54: test renders carry no event endpoint, test orders skip the stats). The signature
 * is frozen in src/lib/contracts/r2-contract.ts; the contract stub writes nothing.
 */
import type { WriteScope } from "@/lib/tenancy/types";

/** The counters of a `stats_version_daily` row a bump may move (every field optional, each a non-negative delta). */
export type VersionStatsDelta = Partial<
  Record<"views" | "uniques" | "formStarts" | "orders" | "confirmed" | "delivered" | "returned" | "fake" | "refused" | "cancelled" | "deliveredEvidence", number>
>;

/** `utm_source` of a row: the beacon's source trimmed and lower-cased to ≤ 40 characters, '' when there is none. */
export function utmBucket(source: string | null | undefined): string {
  return typeof source === "string" ? source.trim().toLowerCase().slice(0, 40) : "";
}

/** One bump of a version's day row (S7, R2). Contract stub: nothing is written. */
export async function bumpVersionStats(scope: WriteScope, pageId: string, versionId: string, day: string, utmSource: string, delta: VersionStatsDelta, variantKey = ""): Promise<void> {
  void scope;
  void pageId;
  void versionId;
  void day;
  void utmSource;
  void delta;
  void variantKey;
}
