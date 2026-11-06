import "server-only";
/**
 * `usage.reconcile` (docs/STORE-SAAS.md §D.7, D69; R1 P8 step 7), slot 6, daily 02:05, 3 s a tick until done:
 *
 * 1. Store by store (one daily pass through forEachStore, ./pass.ts), `recomputeStoreGauges(scope)`
 *    (src/lib/db/usage.ts): every `store_usage` gauge recomputed from its source table and corrected when it drifted.
 *    The run's `job_runs.summary` carries the net delta and the store count per gauge (./rules.ts `driftTotals`); a
 *    store whose gauges moved gets its own row (`processed` = the gauges corrected).
 * 2. When the pass completes, the shared sandbox budget `platform_usage` `pending_media_bytes` / `total` (D69) is
 *    recomputed in one statement as the sum of the `media_bytes` gauges of the stores still `pending`, so a refund the
 *    `pending` exit missed (§A.5.1: the transition refunds the store's bytes) or a charge that raced it cannot leave
 *    the budget drifting for good. Its before / after go into the same summary.
 *
 * A charge racing a correction is corrected by the next night's run (§D.7).
 */
import { pool } from "@/lib/db/client";
import { recomputeStoreGauges } from "@/lib/db/usage";
import { platformUsageValue } from "@/lib/tenancy/usage";
import type { JobCtx, JobResult } from "../runner";
import { dailyPass } from "./pass";
import { driftTotals, movedGauges, STORES_WITH_DATA, type Drift } from "./rules";

/** Sets `pending_media_bytes` to the sum of the pending stores' media gauges; its value before and after. */
export async function recomputePendingMediaBytes(): Promise<Drift> {
  const before = await platformUsageValue("pending_media_bytes", "total");
  // tenancy: platform the D69 sandbox budget: one sum over the media gauges of every pending store (§D.7)
  await pool().query(
    `INSERT INTO platform_usage (metric, period, value, updated_at)
     SELECT 'pending_media_bytes', 'total', COALESCE(SUM(u.value), 0), UTC_TIMESTAMP(3)
       FROM store_usage u JOIN stores s ON s.id = u.store_id
      WHERE s.status = 'pending' AND u.metric = 'media_bytes' AND u.period = 'total'
     ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = VALUES(updated_at)`,
  );
  return { before, after: await platformUsageValue("pending_media_bytes", "total") };
}

export async function usageReconcileJob(ctx: JobCtx): Promise<JobResult> {
  const drifts: Record<string, Drift>[] = [];
  const pass = await dailyPass(ctx, STORES_WITH_DATA, async (scope) => {
    const gauges = await recomputeStoreGauges(scope);
    drifts.push(gauges);
    return movedGauges(gauges);
  });
  const summary: Record<string, number | boolean> = driftTotals(drifts);
  let processed = drifts.reduce((n, g) => n + movedGauges(g), 0);
  if (pass.complete) {
    const pending = await recomputePendingMediaBytes();
    summary.pendingMediaBefore = pending.before;
    summary.pendingMediaAfter = pending.after;
    if (pending.before !== pending.after) processed++;
  }
  return { done: pass.complete, processed, summary };
}
