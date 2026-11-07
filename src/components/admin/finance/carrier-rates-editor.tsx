"use client";
/**
 * The rates editor of ONE carrier account (operations.md OPE-§16.4, §17.3; R2, S3 MONEY owns every `carrier_rates`
 * write). The contract step (C2-C) froze its props for S4 LOGISTICS, which embeds it in the "Rates" block of its
 * carrier page (`/shipping/carriers`) next to `carrierRateSummary` (src/lib/finance/rates.server.ts). Stub until S3
 * merges: renders nothing (`null`); S4 shows the honest "Rates are set in Finance" line meanwhile. No R1 screen mounts it.
 */
import type { ReactElement } from "react";

/** S3 (stub: renders nothing). */
export function CarrierRatesEditor(props: { handle: string; accountId: string; canWrite: boolean }): ReactElement | null {
  void props;
  return null;
}
