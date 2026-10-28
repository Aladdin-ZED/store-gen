import "server-only";
/**
 * "Report this store" (P1 CONSOLE; platform.md PLA-§24.2 R1 slice, PD70; docs/STORE-SAAS.md D76, §B.1, §E.8, PL-20):
 * the one writer of the insert-only `abuse_reports` table, called only by P1's own public page `/report/<handle>`
 * (`reportStoreAction`, a `publicAction` with Turnstile when configured).
 *
 *   await recordAbuseReport({ handle, reason, details, pagePath, contact, ip });   // AuthRefusal("rate_limited") past a bucket
 *
 * In order:
 *   1. the input is parsed (`parseAbuseReport`, ./abuse-input.ts; a ZodError → `invalid`): reason from the enum,
 *      details ≤ 2,000 characters of plain text, contact ≤ 120, the page path kept only as a same-host path without
 *      its query (≤ 300 characters; anything else, an absolute or protocol-relative URL included, is dropped);
 *   2. the buckets, before the handle is looked up so an unknown handle costs the same: `p:report:ip:<ipHash>` 5 per
 *      hour and `p:report:store:<handle>` 20 per day (core §E.8); past either the report answers `rate_limited` (the
 *      frozen function throws `AuthRefusal("rate_limited")`, which the action wrappers answer as is);
 *   3. the handle through `resolveStoreByHandle` (a renamed store's old handle reaches the store); an unknown or
 *      purged handle stores nothing and ends like a recorded report (the page shows the same thanks: no oracle);
 *   4. one row, `status = 'new'`, the IP only as `ip_hash`, the contact sealed with the platform envelope purpose
 *      `abuse:contact` (read by nobody in R1);
 *   5. best effort, each step on its own (a failure is recorded, the report stays recorded): `markHealthDirty`
 *      (the console flag `abuse_reports_new`), the staff notification `staff.abuse_report` (one row per store and
 *      platform day, `abuse:<storeId>:<YYYY-MM-DD>`, its `count24h` refreshed by every report), and the alarm
 *      `abuse_reports_spike` once per hour platform-wide (≥ 5 reports in the hour's window) and once per store and
 *      day (≥ 3 reports in 24 hours).
 * The details and the contact never reach a notification, an audit row or a health row, and nothing is sent to the
 * store in R1 (a report is a signal to staff, not an accusation to the seller).
 */
import { count, gt } from "drizzle-orm";
import { AuthRefusal } from "@/lib/auth/errors";
import { db } from "@/lib/db/client";
import { newId } from "@/lib/db/ids";
import { abuseReports } from "@/lib/db/schema";
import { systemCtx, systemScope } from "@/lib/jobs/scope";
import { hashIp, seal } from "@/lib/security/crypto";
import { platformBucket, rateLimit } from "@/lib/security/rate-limit";
import { periodOf } from "@/lib/tenancy/entitlement-keys";
import { isHandle } from "@/lib/tenancy/handles";
import { resolveStoreByHandle } from "@/lib/tenancy/public";
import { storeValues, whereStore } from "@/lib/tenancy/sql";
import type { StoreScope, WriteScope } from "@/lib/tenancy/types";
import { REPORT_LIMITS, parseAbuseReport, type AbuseReason } from "./abuse-input";
import { markHealthDirty } from "./health-snapshot";
import { recordPlatformError } from "./log";
import { notify, notifyLatest } from "./notify";

export { ABUSE_REASONS, AbuseReportSchema, REPORT_LIMITS, parseAbuseReport, sameHostPath } from "./abuse-input";
export type { AbuseReason, ParsedAbuseReport } from "./abuse-input";

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

/** What happened to a report (the reporter sees the same thanks for "recorded" and "discarded"). */
export type AbuseReportOutcome = "recorded" | "discarded" | "rate_limited";

const PLATFORM_TZ = "Africa/Casablanca";

/** The one insert of `abuse_reports` (the store id from the scope only, §E.3 rule 4). */
async function insertReport(scope: WriteScope, row: Omit<typeof abuseReports.$inferInsert, "storeId">): Promise<void> {
  await db.insert(abuseReports).values(storeValues(scope, row));
}

/** The store's reports of the last 24 hours (`ar_store_idx`). */
async function reportsIn24h(scope: StoreScope): Promise<number> {
  const since = new Date(Date.now() - 24 * 3_600_000);
  const [row] = await db
    .select({ n: count() })
    .from(abuseReports)
    .where(whereStore(abuseReports, scope, gt(abuseReports.createdAt, since)));
  return Number(row?.n ?? 0);
}

/** One best-effort step after the insert. */
async function step(label: string, storeId: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    recordPlatformError(`abuse report: ${label}`, err, { storeId });
  }
}

/** The whole report (the header's steps), answering what happened. Throws a ZodError for an invalid input. */
export async function recordAbuseReportOutcome(input: AbuseReportInput): Promise<AbuseReportOutcome> {
  const report = parseAbuseReport(input);
  const ipHash = hashIp(report.ip ?? "0.0.0.0");

  // 2. the buckets, whatever the handle answers
  if (!(await rateLimit(platformBucket("report:ip", ipHash), REPORT_LIMITS.ipPerHour, 3_600)).ok) return "rate_limited";
  const handle = isHandle(report.handle) ? report.handle : null;
  if (handle && !(await rateLimit(platformBucket("report:store", handle), REPORT_LIMITS.storePerDay, 86_400)).ok) return "rate_limited";

  // 3. the store
  const store = handle ? await resolveStoreByHandle(handle) : null;
  if (!store || store.status === "purged") return "discarded";

  // 4. the row (insert-only; the system seam: a public reporter has no session in the store)
  const scope = systemScope(systemCtx("abuse-report"), store.id);
  await insertReport(scope, {
    id: newId(),
    pageUrl: report.pagePath,
    reason: report.reason,
    details: report.details,
    reporterContactEnc: report.contact ? seal(report.contact, "platform", "abuse:contact") : null,
    status: "new",
    ipHash,
  });

  // 5. the signals
  await step("health", store.id, () => markHealthDirty(store.id));
  let count24h = 1;
  await step("count", store.id, async () => {
    count24h = Math.max(1, await reportsIn24h(scope));
  });
  const now = new Date();
  const day = periodOf("day", now, PLATFORM_TZ);
  await step("staff notification", store.id, () =>
    notifyLatest(
      { audience: "platform_staff", minRole: "admin" },
      "staff.abuse_report",
      { store: store.handle, reason: report.reason, count24h, storeId: store.id },
      { dedupeKey: `abuse:${store.id}:${day}` },
    ),
  );
  await step("spike", store.id, async () => {
    const hour = now.toISOString().slice(0, 13);
    const platformWide = await rateLimit(platformBucket("report:spike"), REPORT_LIMITS.spikePlatformPerHour, 3_600);
    if (platformWide.count >= REPORT_LIMITS.spikePlatformPerHour) {
      await notify({ audience: "platform_staff", minRole: "admin" }, "staff.alarm", { alarm: "abuse_reports_spike", value: platformWide.count }, { dedupeKey: `alarm:abuse_reports_spike:${hour}`, severity: "danger" });
    }
    if (count24h >= REPORT_LIMITS.spikeStorePer24h) {
      await notify(
        { audience: "platform_staff", minRole: "admin" },
        "staff.alarm",
        { alarm: "abuse_reports_spike", value: count24h, store: store.handle, storeId: store.id },
        { dedupeKey: `alarm:abuse_reports_spike:${store.id}:${day}`, severity: "danger", link: `/admin/stores/${store.id}` },
      );
    }
  });
  return "recorded";
}

/**
 * The frozen entry point (src/lib/contracts/r1-p0.ts): resolves for a recorded or a discarded report alike, throws
 * `AuthRefusal("rate_limited")` past a bucket and the ZodError for an invalid input.
 */
export async function recordAbuseReport(input: AbuseReportInput): Promise<void> {
  if ((await recordAbuseReportOutcome(input)) === "rate_limited") throw new AuthRefusal("rate_limited");
}
