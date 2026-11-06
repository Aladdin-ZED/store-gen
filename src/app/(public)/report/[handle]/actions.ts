"use server";
/**
 * "Report this store" (P1 CONSOLE; platform.md PLA-§24.2 R1 slice, §M.1, PD70; docs/STORE-SAAS.md §B.1, D76, PL-20):
 * the public form of `/report/<handle>` on the platform host.
 *
 *   const r = await reportStoreAction({ handle, reason: "scam", details, pagePath, contact, turnstile });
 *   // r.ok → r.data.message === "report.thanks"
 *
 * Through `publicAction("report")`: same-origin, the burst floor, `p:report:ip:<h>` 5/h, the platform Turnstile when
 * it is configured; then `recordAbuseReport` (its own buckets, the insert, the staff signal). An unknown or purged
 * handle stores nothing and answers the same thanks as a recorded report: the form is no handle oracle. Nothing is
 * sent to the store, and a report is not an audit event.
 */
import { publicAction } from "@/lib/auth";
import { recordAbuseReport, type AbuseReason } from "@/lib/platform/abuse-report";
import type { ActionResult } from "@/lib/tenancy/types";

export interface ReportStoreInput {
  handle: string;
  reason: AbuseReason;
  details?: string | null;
  /** the page path the reporter came from (`?p=`): kept only as a same-host path without its query */
  pagePath?: string | null;
  /** optional e-mail or phone, sealed before the insert */
  contact?: string | null;
  /** the widget's `cf-turnstile-response` */
  turnstile?: string | null;
}

const str = (v: unknown, max: number): string | null => (typeof v === "string" && v.length > 0 ? v.slice(0, max) : null);

/** The report; every accepted post answers `report.thanks`, whatever happened to it (PL-20: no oracle). */
export async function reportStoreAction(input: ReportStoreInput): Promise<ActionResult<{ message: "report.thanks" }>> {
  return publicAction(
    "report",
    async (ctx) => {
      await recordAbuseReport({
        handle: str(input?.handle, 80) ?? "",
        reason: input?.reason,
        details: str(input?.details, 4_000),
        pagePath: str(input?.pagePath, 600),
        contact: str(input?.contact, 240),
        ip: ctx.ip,
      });
      return { message: "report.thanks" as const };
    },
    { turnstile: "when-configured", burst: "report", token: str(input?.turnstile, 2_048) },
  );
}
