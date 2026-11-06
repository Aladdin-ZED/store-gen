import "server-only";
/**
 * The `lifecycle` job (docs/STORE-SAAS.md §H.2 slot 7, §A.5.1, §B.8; R1 P8 step 10): every tick, ≤ 2 s, the time-driven
 * edges nobody clicks.
 *
 *   1. closed → scheduled_deletion once `purge_after` (closed_at + 30 days) has passed: transitionStore with a system
 *      ctx (§A.5.1 "cron when purge_after passes"), which sets the new purge_after (now + 24 h), audits
 *      `store.deletion_scheduled` and sends the one notification of the edge. ≤ 20 stores a tick, oldest first.
 *   2. impersonation sessions past `expires_at` and still open are ended `expired` through endImpersonation (the
 *      session pointer cleared, the store notified, `platform.impersonation.ended` audited). ≤ 50 a tick.
 *   3. invites: `store_invites` and `staff_invites` have no expiry column to mark (schema.ts). An invite's state is
 *      derived from `expires_at` wherever it is read (inviteState: Pending · Accepted · Expired · Revoked) and an
 *      expired token is refused on accept, so expiry needs no write; housekeeping deletes the rows 30 days after
 *      expiry (§H.11, ./retention.ts).
 *
 * The purge itself (scheduled_deletion → purged, and the rejected stores after 30 days) is the `purge` job's
 * (./purge.ts, slot 5). A refused edge (someone reopened the store meanwhile: `status_changed`) is counted and skipped.
 * The two queue reads span every store and are annotated `tenancy: platform` (CCR r1-p8-4).
 */
import type { RowDataPacket } from "mysql2/promise";
import { pool } from "@/lib/db/client";
import { endImpersonation } from "@/lib/platform/impersonation";
import { LifecycleError, transitionStore } from "@/lib/tenancy/lifecycle";
import { errorCode, recordError } from "./errors";
import type { JobCtx, JobResult } from "./runner";
import { systemCtx } from "./scope";

export const LIFECYCLE_JOB = "lifecycle";
/** closed stores moved to scheduled_deletion per tick */
export const SCHEDULE_PER_TICK = 20;
/** expired impersonation sessions ended per tick */
export const IMPERSONATIONS_PER_TICK = 50;
/** the status_reason of the cron's closed → scheduled_deletion */
export const SCHEDULE_REASON = "reopen_window_ended";

export interface LifecycleRunOpts {
  now?: () => number;
}

export async function lifecycleJob(ctx: JobCtx, opts: LifecycleRunOpts = {}): Promise<JobResult> {
  const nowMs = opts.now ?? Date.now;
  const summary: Record<string, number> = { scheduled: 0, scheduleSkipped: 0, impersonationsEnded: 0 };
  const failed: string[] = [];
  let done = true;
  const sys = systemCtx(LIFECYCLE_JOB);

  // 1. closed → scheduled_deletion
  try {
    // tenancy: platform the lifecycle cron (§A.5.1): closed stores whose reopen window has passed, any store
    const [rows] = await pool().query<RowDataPacket[]>(
      "SELECT id FROM stores WHERE status = 'closed' AND purge_after IS NOT NULL AND purge_after <= ? ORDER BY purge_after, id LIMIT ?",
      [new Date(nowMs()), SCHEDULE_PER_TICK + 1],
    );
    if (rows.length > SCHEDULE_PER_TICK) done = false;
    for (const r of rows.slice(0, SCHEDULE_PER_TICK)) {
      if (Date.now() >= ctx.deadline) {
        done = false;
        break;
      }
      try {
        await transitionStore(sys, String(r.id), "scheduled_deletion", { reason: SCHEDULE_REASON });
        summary.scheduled++;
      } catch (err) {
        if (!(err instanceof LifecycleError)) throw err;
        summary.scheduleSkipped++; // reopened or rescheduled meanwhile
      }
      await ctx.yield();
    }
  } catch (err) {
    failed.push("schedule");
    console.error("[jobs] lifecycle schedule failed:", errorCode(err));
    recordError("jobs", err, { route: `job:${LIFECYCLE_JOB}` });
  }

  // 2. expired impersonation sessions
  if (Date.now() < ctx.deadline) {
    try {
      // tenancy: platform the lifecycle cron (§B.8): open view-as sessions past their expiry, any store
      const [rows] = await pool().query<RowDataPacket[]>("SELECT session_id FROM impersonation_sessions WHERE ended_at IS NULL AND expires_at <= ? ORDER BY expires_at LIMIT ?", [
        new Date(nowMs()),
        IMPERSONATIONS_PER_TICK + 1,
      ]);
      if (rows.length > IMPERSONATIONS_PER_TICK) done = false;
      for (const r of rows.slice(0, IMPERSONATIONS_PER_TICK)) {
        if (Date.now() >= ctx.deadline) {
          done = false;
          break;
        }
        await endImpersonation({ sessionId: String(r.session_id) }, "expired");
        summary.impersonationsEnded++;
        await ctx.yield();
      }
    } catch (err) {
      failed.push("impersonation");
      console.error("[jobs] lifecycle impersonation failed:", errorCode(err));
      recordError("jobs", err, { route: `job:${LIFECYCLE_JOB}` });
    }
  } else done = false;

  return { done, processed: summary.scheduled + summary.impersonationsEnded, summary, ...(failed.length ? { errorCode: `steps_failed:${failed.join(",")}` } : {}) };
}
