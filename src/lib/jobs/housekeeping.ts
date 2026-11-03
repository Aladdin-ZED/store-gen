import "server-only";
/**
 * The `housekeeping` job (docs/STORE-SAAS.md §H.2 slot 8, every tick, 4 s; §H.11; R1 P8 steps 3 and 10): the clean-ups
 * the cron route ran itself before the runner existed, and the §H.11 core retention rows.
 *
 *   1. rate-limit buckets whose window ended more than an hour ago (`purgeRateLimits`);
 *   2. visitor markers older than 2 days (`purgeVisitorMarkers(2)`, STAT-03);
 *   3. expired sessions (`purgeExpiredSessions`);
 *   4. the §H.11 core rows (./retention.ts RETENTION_RULES), at most once an hour (a pass cut by the deadline carries on
 *      at the next tick): each one statement `… < cutoff LIMIT 2000`, run again while a slice deletes 2,000 rows and
 *      the deadline allows, yielding between slices (outbox done 14 d / dead 30 d,
 *      job_runs 14 d, error_events 30 d, notifications 90 d, audit_log 400 d, impersonation_sessions and settled
 *      platform_requests 400 d, password_resets / store_invites / staff_invites 30 d after expiry, page_slug_history at
 *      `until`, preview_tokens 30 d after expiry, every daily `store_usage` metric after 7 d, P0b review F-10);
 *   5. abandoned leads older than 30 days, store by store (ORD-13): a round robin over every store that still keeps
 *      data, its own cursor `housekeeping.leads`, with half of what is left of the budget;
 *   6. test orders older than 30 days, store by store (§H.11, OPE-§26): P4's deleteTestOrders through each store's
 *      system scope (CCR r1-p8-13: P8 schedules, P4 deletes), its own cursor `housekeeping.test_orders`, with the rest.
 *
 * Each step runs alone: one that throws is counted in the error ring and the others still run; the run's job_runs
 * row then has ok = false with `steps_failed:<names>` and keeps the counts of the steps that worked. Steps 1-4 span
 * every store (the retention of a table; the statements are annotated in ./retention.ts); 5 and 6 go through each
 * store's own system scope. A run cut by the deadline answers done = false and the next tick carries on.
 */
import { purgeExpiredSessions } from "@/lib/auth";
import type { ResultSetHeader } from "mysql2/promise";
import { pool } from "@/lib/db/client";
import { deleteTestOrders, purgeAbandonedLeads } from "@/lib/orders/admin";
import { purgeRateLimits } from "@/lib/security/rate-limit";
import { purgeVisitorMarkers } from "@/lib/stats";
import type { StoreStatus } from "@/lib/tenancy/types";
import { errorCode, recordError } from "./errors";
import { RETENTION_RULES, RETENTION_SLICE, TEST_ORDERS_KEEP_DAYS, retentionParams, type RetentionRule } from "./retention";
import type { JobCtx, JobResult } from "./runner";
import { forEachStore, systemScope } from "./scope";
import { patchJobState, readJobState } from "./storage/state";

/** the stores whose leads are purged: every state that still keeps data */
const LEAD_STATES: readonly StoreStatus[] = ["pending", "active", "restricted", "suspended", "closed"];
/** abandoned leads are kept this long (days, ORD-13) */
export const LEADS_KEEP_DAYS = 30;
/** visitor markers are kept this long (days, STAT-03) */
export const VISITOR_MARKERS_KEEP_DAYS = 2;
/** forEachStore's cursor for the leads sweep */
export const LEADS_SWEEP_JOB = "housekeeping.leads";
/** forEachStore's cursor for the test orders sweep */
export const TEST_ORDERS_SWEEP_JOB = "housekeeping.test_orders";

export interface HousekeepingOpts {
  now?: () => number;
}

/** A finished §H.11 pass is not repeated for this long (the cutoffs are days; several tables have no index on the column). */
export const RETENTION_EVERY_MS = 60 * 60_000;
/** the key of housekeeping's own cron_cursors.state that stamps the last finished pass */
const RETENTION_STATE_KEY = "retentionAt";

/** One §H.11 rule: slices of 2,000 until one deletes fewer or the deadline comes; the rows deleted and whether it ended. */
async function runRetentionRule(ctx: JobCtx, rule: RetentionRule, nowMs: number): Promise<{ rows: number; finished: boolean }> {
  let rows = 0;
  const params = retentionParams(rule, nowMs);
  for (;;) {
    const [res] = await pool().query<ResultSetHeader>(rule.sql, params);
    rows += res.affectedRows;
    if (res.affectedRows < RETENTION_SLICE) return { rows, finished: true };
    await ctx.yield();
    if (Date.now() >= ctx.deadline) return { rows, finished: false };
  }
}

export interface RetentionPass {
  /** rows deleted per rule (RetentionRule.name); a rule the deadline never reached is absent */
  rows: Record<string, number>;
  /** every rule ran to its end */
  finished: boolean;
  /** rules that threw (counted in the error ring; the others still ran) */
  failed: string[];
}

/** Every §H.11 core rule once, in order, within the job's deadline (housekeeping's step 4; test:storage calls it). */
export async function runRetention(ctx: JobCtx, nowMs: number): Promise<RetentionPass> {
  const pass: RetentionPass = { rows: {}, finished: true, failed: [] };
  for (const rule of RETENTION_RULES) {
    if (Date.now() >= ctx.deadline) {
      pass.finished = false;
      break;
    }
    try {
      const r = await runRetentionRule(ctx, rule, nowMs);
      pass.rows[rule.name] = r.rows;
      if (!r.finished) pass.finished = false;
    } catch (err) {
      pass.failed.push(rule.name);
      console.error(`[jobs] housekeeping retention ${rule.name} failed:`, errorCode(err));
      recordError("jobs", err, { route: `job:${ctx.job}` });
    }
    await ctx.yield();
  }
  return pass;
}

export async function housekeeping(ctx: JobCtx, opts: HousekeepingOpts = {}): Promise<JobResult> {
  const nowMs = opts.now ?? Date.now;
  const summary: Record<string, number | boolean> = {};
  const failed: string[] = [];
  let processed = 0;
  let done = true;

  // a step answers its count, or true when the helper reports none
  const step = async (name: string, fn: () => Promise<number | true>): Promise<void> => {
    if (Date.now() >= ctx.deadline) {
      done = false;
      return;
    }
    try {
      const n = await fn();
      summary[name] = n;
      if (n !== true) processed += n;
    } catch (err) {
      failed.push(name);
      console.error(`[jobs] housekeeping ${name} failed:`, errorCode(err));
      recordError("jobs", err, { route: `job:${ctx.job}` });
    }
    await ctx.yield();
  };

  await step("rateLimits", async () => {
    await purgeRateLimits();
    return true;
  });
  await step("visitorMarkers", () => purgeVisitorMarkers(VISITOR_MARKERS_KEEP_DAYS));
  await step("sessions", () => purgeExpiredSessions());
  await step("retention", async () => {
    const last = Date.parse(String((await readJobState(ctx.job))[RETENTION_STATE_KEY] ?? ""));
    if (Number.isFinite(last) && nowMs() - last < RETENTION_EVERY_MS && last <= nowMs()) return true;
    const pass = await runRetention(ctx, nowMs());
    for (const [name, n] of Object.entries(pass.rows)) summary[`retention.${name}`] = n;
    if (pass.failed.length) failed.push(...pass.failed.map((n) => `retention.${n}`));
    if (!pass.finished) done = false;
    // stamped only when every rule ran to its end, so a cut pass carries on at the next tick
    else if (!pass.failed.length) await patchJobState(ctx.job, { [RETENTION_STATE_KEY]: new Date(nowMs()).toISOString() });
    return Object.values(pass.rows).reduce((a, b) => a + b, 0);
  });
  await step("abandonedLeads", async () => {
    let removed = 0;
    const run = await forEachStore(ctx, { job: LEADS_SWEEP_JOB, states: LEAD_STATES, budgetMs: Math.max(1, Math.floor((ctx.deadline - Date.now()) / 2)) }, async (_scope, store) => {
      // the frozen callback types its scope as a StoreScope; the delete needs the job's own WriteScope
      const n = await purgeAbandonedLeads(systemScope(ctx, store.id), LEADS_KEEP_DAYS);
      removed += n;
      return n;
    });
    summary.leadStores = run.visited;
    if (!run.done) done = false;
    return removed;
  });
  await step("testOrders", async () => {
    let removed = 0;
    const olderThan = new Date(nowMs() - TEST_ORDERS_KEEP_DAYS * 86_400_000);
    const run = await forEachStore(ctx, { job: TEST_ORDERS_SWEEP_JOB, states: LEAD_STATES, budgetMs: Math.max(1, ctx.deadline - Date.now()) }, async (_scope, store) => {
      // P4 deletes (OPE-§26, ≥ 1 h old and is_test only); the scope is the job's own WriteScope of that store
      const { deleted } = await deleteTestOrders(systemScope(ctx, store.id), { olderThan, limit: RETENTION_SLICE });
      removed += deleted;
      return deleted;
    });
    summary.testOrderStores = run.visited;
    if (!run.done) done = false;
    return removed;
  });

  return { done, processed, summary, ...(failed.length ? { errorCode: `steps_failed:${failed.join(",")}` } : {}) };
}
