import "server-only";
/**
 * Cash held by carriers (operations.md OPE-§16.7 step 5, SF-09; R2, S3 MONEY owns `src/lib/finance/**`). Collected-not-
 * remitted orders of each STATEMENT carrier account by `delivered_at` age (0-7, 8-14, 15-30, > 30 days), test orders
 * excluded, integer minor units; `at_delivery` accounts and "my carrier" set to `at_delivery` never appear (OD52). The
 * contract step (C2-C) froze the two readers other owners call:
 *   - `cashHeldSummary(scope, opts?)`: S4 LOGISTICS's carriers page (and S3's own finance screens); null = nothing to
 *     show (no statement account), rendered as an honest line, never zeros;
 *   - `cashHeldLines(scope)`: P5's Telegram daily summary (wired by the maintainer, `notifications.telegram.cashHeld`):
 *     one line per carrier above `accounting.cashHeldAlertDays` ("Amana détient 3 240,00 MAD depuis plus de 15 jours
 *     (12 colis)."), formatted by the caller from these figures.
 * Contract bodies until S3 merges: null and [] (no statement can exist before S3). No R1 path calls them.
 */
import type { StoreScope } from "@/lib/tenancy/types";

/** The ageing buckets of OPE-§16.7 (the console's remittance ageing uses the same labels). */
export type AgeingLabel = "0-7" | "8-14" | "15-30" | "30+";
export interface AgeingBucket {
  label: AgeingLabel;
  cents: number;
  orders: number;
}

export interface CashHeldSummary {
  currency: string;
  /** `accounting.cashHeldAlertDays` */
  alertDays: number;
  carriers: { accountId: string; label: string; buckets: AgeingBucket[]; totalCents: number; orders: number; oldestDays: number }[];
  totalCents: number;
  orders: number;
}

/** One carrier above the alert threshold, for the daily summary. */
export interface CashHeldLine {
  accountId: string;
  label: string;
  /** money held longer than `days` days */
  cents: number;
  parcels: number;
  days: number;
  currency: string;
}

/** Cash held per statement carrier, or null when the store has none. S3 (contract body: null). */
export async function cashHeldSummary(scope: StoreScope, opts?: { at?: Date }): Promise<CashHeldSummary | null> {
  void scope;
  void opts;
  return null;
}

/** The carriers above the alert threshold. S3 (contract body: none). */
export async function cashHeldLines(scope: StoreScope): Promise<CashHeldLine[]> {
  void scope;
  return [];
}
