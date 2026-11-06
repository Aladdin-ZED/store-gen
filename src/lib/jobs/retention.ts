/**
 * The §H.11 core retention rows `housekeeping` deletes (docs/STORE-SAAS.md §H.11, OS-11, §H.2 slot 8; R1 P8 step 10).
 * Pure: no I/O and no clock; housekeeping runs the statements, test:jobs reads the cutoff table, test:storage seeds rows
 * on both sides of each cutoff.
 *
 *   RETENTION_RULES          one statement per row: `… < ? LIMIT 2000`, run again until a slice deletes fewer
 *   retentionCutoff(r, now)  the value bound to that `?` (a Date, or a "YYYY-MM-DD" day for store_usage)
 *
 * Every statement spans every store (the retention of a table, not of a store): each is annotated `tenancy: platform`
 * and counted in the `src/lib/jobs/**` pin (CCR r1-p8-4). Rows owned by other tracks' jobs are not here: ai.retention
 * (P7: ai_runs, ai_cache, ai_batch_items, ai_feedback, ai_eval_runs, ai_jobs and their blobs), design.retention (P6:
 * design_genomes), ops.capi_ctx_purge (P5: orders.capi_ctx), campaign share tokens (P3); abandoned leads (30 days) are
 * housekeeping's per-store step, test orders its per-store P4 call (deleteTestOrders, CCR r1-p8-13), export parts the
 * exports job (72 h), backups the backup job (§H.6).
 */
import { USAGE_METRICS } from "@/lib/tenancy/entitlement-keys";

const DAY = 86_400_000;

/** rows per statement (§H.11 "each statement bounded") */
export const RETENTION_SLICE = 2000;
/** test orders are deleted by housekeeping 30 days after they were placed (§H.11, OPE-§26) */
export const TEST_ORDERS_KEEP_DAYS = 30;

/** Every `store_usage` metric counted per day: their rows go after 7 days (P0b review F-10: the rule is the period). */
export const DAILY_USAGE_METRICS: readonly string[] = Object.freeze(
  (Object.keys(USAGE_METRICS) as (keyof typeof USAGE_METRICS)[]).filter((m) => USAGE_METRICS[m].period === "day").sort(),
);

export interface RetentionRule {
  /** job_runs.summary key */
  name: string;
  table: string;
  /** kept this long after the column's time (0 = as soon as it has passed) */
  days: number;
  /** "date": a Date bound to the timestamp column; "day": a UTC "YYYY-MM-DD" compared with store_usage.period */
  cutoff: "date" | "day";
  /** the statement, ending in LIMIT 2000; its `?` is the cutoff (store_usage: DAILY_USAGE_METRICS, then the cutoff) */
  sql: string;
}

/**
 * The §H.11 core rows, in run order: the high-volume tables first, the two platform tables (no store column) last. Keep
 * a tenant rule off the last line: the lint reads a same-line annotation through the element after it.
 */
export const RETENTION_RULES: readonly RetentionRule[] = Object.freeze([
  { name: "outboxDone", table: "outbox", days: 14, cutoff: "date", sql: "DELETE FROM outbox WHERE state = 'done' AND done_at < ? LIMIT 2000" }, // tenancy: platform §H.11 retention: outbox done 14 days, every store
  { name: "outboxDead", table: "outbox", days: 30, cutoff: "date", sql: "DELETE FROM outbox WHERE state IN ('dead', 'cancelled') AND COALESCE(done_at, created_at) < ? LIMIT 2000" }, // tenancy: platform §H.11 retention: outbox dead (and cancelled) 30 days, every store; done_at = when it ended
  { name: "jobRuns", table: "job_runs", days: 14, cutoff: "date", sql: "DELETE FROM job_runs WHERE started_at < ? LIMIT 2000" }, // tenancy: platform §H.11 retention: job_runs 14 days, every store
  { name: "errorEvents", table: "error_events", days: 30, cutoff: "date", sql: "DELETE FROM error_events WHERE last_at < ? LIMIT 2000" }, // tenancy: platform §H.11 retention: error_events 30 days after their last occurrence, every store
  { name: "notifications", table: "notifications", days: 90, cutoff: "date", sql: "DELETE FROM notifications WHERE created_at < ? LIMIT 2000" }, // tenancy: platform §H.11 retention: notifications 90 days, every store
  { name: "auditLog", table: "audit_log", days: 400, cutoff: "date", sql: "DELETE FROM audit_log WHERE created_at < ? LIMIT 2000" }, // tenancy: platform §H.11 retention: audit_log 400 days, every store
  { name: "impersonation", table: "impersonation_sessions", days: 400, cutoff: "date", sql: "DELETE FROM impersonation_sessions WHERE started_at < ? LIMIT 2000" }, // tenancy: platform §H.11 retention: impersonation_sessions 400 days, every store
  { name: "platformRequests", table: "platform_requests", days: 400, cutoff: "date", sql: "DELETE FROM platform_requests WHERE status IN ('executed', 'cancelled', 'expired') AND requested_at < ? LIMIT 2000" }, // tenancy: platform §H.11 retention: platform_requests 400 days once settled, every store
  { name: "storeInvites", table: "store_invites", days: 30, cutoff: "date", sql: "DELETE FROM store_invites WHERE expires_at < ? LIMIT 2000" }, // tenancy: platform §H.11 retention: store_invites 30 days after expiry, every store
  { name: "slugHistory", table: "page_slug_history", days: 0, cutoff: "date", sql: "DELETE FROM page_slug_history WHERE `until` < ? LIMIT 2000" }, // tenancy: platform §H.11 retention: page_slug_history rows once `until` has passed, every store
  { name: "previewTokens", table: "preview_tokens", days: 30, cutoff: "date", sql: "DELETE FROM preview_tokens WHERE expires_at < ? LIMIT 2000" }, // tenancy: platform §H.11 retention: preview_tokens 30 days after expiry, every store
  { name: "dailyUsage", table: "store_usage", days: 7, cutoff: "day", sql: "DELETE FROM store_usage WHERE metric IN (?) AND period < ? LIMIT 2000" }, // tenancy: platform §H.11 retention: store_usage rows of every daily metric after 7 days, every store
  { name: "passwordResets", table: "password_resets", days: 30, cutoff: "date", sql: "DELETE FROM password_resets WHERE expires_at < ? LIMIT 2000" },
  { name: "staffInvites", table: "staff_invites", days: 30, cutoff: "date", sql: "DELETE FROM staff_invites WHERE expires_at < ? LIMIT 2000" },
] satisfies RetentionRule[]).map((r) => Object.freeze(r));

/** The value bound to a rule's cutoff `?` at `nowMs`: rows older than it go. */
export function retentionCutoff(rule: Pick<RetentionRule, "days" | "cutoff">, nowMs: number): Date | string {
  const at = nowMs - rule.days * DAY;
  return rule.cutoff === "day" ? new Date(at).toISOString().slice(0, 10) : new Date(at);
}

/** The parameters of a rule's statement at `nowMs`. */
export function retentionParams(rule: RetentionRule, nowMs: number): unknown[] {
  const cutoff = retentionCutoff(rule, nowMs);
  return rule.table === "store_usage" ? [[...DAILY_USAGE_METRICS], cutoff] : [cutoff];
}
