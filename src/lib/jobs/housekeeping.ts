import "server-only";
/**
 * The `housekeeping` job (docs/STORE-SAAS.md §H.2 slot 8, every tick, 4 s; R1 P8): the clean-ups the cron route ran
 * itself before the runner existed, now one job inside the tick.
 *
 *   1. rate-limit buckets whose window ended more than an hour ago (`purgeRateLimits`);
 *   2. visitor markers older than 2 days (`purgeVisitorMarkers(2)`, STAT-03);
 *   3. expired sessions (`purgeExpiredSessions`);
 *   4. abandoned leads older than 30 days, store by store (ORD-13), with what is left of the budget: a round robin
 *      over every store that still keeps data, its own cursor `housekeeping.leads`, so a large platform is covered
 *      over several ticks and a slow store never stops the others.
 *
 * Each step runs alone: one that throws is counted in the error ring and the others still run; the run's job_runs
 * row then has ok = false with `steps_failed:<names>` and keeps the counts of the steps that worked. The platform
 * deletes 1-3 touch no tenant table; the leads go through each store's own system scope. P8 step 10 adds the §H.11
 * retention rows (and the 7-day purge of every daily `store_usage` metric, P0b review F-10).
 */
import { purgeExpiredSessions } from "@/lib/auth";
import { purgeAbandonedLeads } from "@/lib/orders/admin";
import { purgeRateLimits } from "@/lib/security/rate-limit";
import { purgeVisitorMarkers } from "@/lib/stats";
import type { StoreStatus } from "@/lib/tenancy/types";
import { errorCode, recordError } from "./errors";
import type { JobCtx, JobResult } from "./runner";
import { forEachStore, systemScope } from "./scope";

/** the stores whose leads are purged: every state that still keeps data */
const LEAD_STATES: readonly StoreStatus[] = ["pending", "active", "restricted", "suspended", "closed"];
/** abandoned leads are kept this long (days, ORD-13) */
export const LEADS_KEEP_DAYS = 30;
/** visitor markers are kept this long (days, STAT-03) */
export const VISITOR_MARKERS_KEEP_DAYS = 2;
/** forEachStore's cursor for the leads sweep */
export const LEADS_SWEEP_JOB = "housekeeping.leads";

export async function housekeeping(ctx: JobCtx): Promise<JobResult> {
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
  await step("abandonedLeads", async () => {
    let removed = 0;
    const run = await forEachStore(ctx, { job: LEADS_SWEEP_JOB, states: LEAD_STATES, budgetMs: Math.max(1, ctx.deadline - Date.now()) }, async (_scope, store) => {
      // the frozen callback types its scope as a StoreScope; the delete needs the job's own WriteScope
      const n = await purgeAbandonedLeads(systemScope(ctx, store.id), LEADS_KEEP_DAYS);
      removed += n;
      return n;
    });
    summary.leadStores = run.visited;
    if (!run.done) done = false;
    return removed;
  });

  return { done, processed, summary, ...(failed.length ? { errorCode: `steps_failed:${failed.join(",")}` } : {}) };
}
