import "server-only";
/**
 * "Report this store" (P1 CONSOLE; platform.md PLA-§24.2 R1 slice, PD70; docs/STORE-SAAS.md D76, §K.2 P0, PL-20):
 * the one writer of the insert-only `abuse_reports` table, called only by P1's own public page `/report/<handle>`
 * (`reportStoreAction`, `publicAction` with Turnstile when configured, buckets `p:report:ip:<h>` 5/h and
 * `p:report:store:<h>` 20/day). It inserts the row (`status = 'new'`, the hashed IP, the contact sealed with the
 * platform envelope purpose `abuse:contact`), marks the store's health dirty (the `abuse_reports_new` flag) and
 * notifies staff (`staff.abuse_report`, deduped per store and day). The reporter sees the same thanks whatever happened
 * (no handle oracle), and nothing is sent to the store in R1. Frozen at P0 (src/lib/contracts/r1-p0.ts); P0 stub:
 * throws, since the page that calls it is P1's.
 */
import type { abuseReports } from "@/lib/db/schema";

export type AbuseReason = (typeof abuseReports.$inferInsert)["reason"];

export interface AbuseReportInput {
  /** the reported store's handle as typed in the URL; an unknown or purged handle is discarded silently */
  handle: string;
  reason: AbuseReason;
  /** ≤ 2,000 chars, plain text */
  details: string | null;
  /** the page path the reporter came from (`?p=`): same host only, query stripped, ≤ 300 chars */
  pagePath: string | null;
  /** optional e-mail or phone, sealed before the insert, read by nobody in R1 */
  contact: string | null;
  /** the request's IP, stored only as `ip_hash` */
  ip: string | null;
}

export async function recordAbuseReport(input: AbuseReportInput): Promise<void> {
  void input;
  throw new Error("not implemented: P1 recordAbuseReport");
}
