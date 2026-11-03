import "server-only";
/**
 * `ai.reconcile` and `ai.retention` (P7 AI; ai.md AI-§N, AI-§C.2 step 6; docs/STORE-SAAS.md §H.2 slot 6, §H.11, D64).
 *   - reconcile (hourly, 2 s): a run still `running` 10 minutes after it started (a crashed process) becomes `error`
 *     with `error_code = 'abandoned'`, reconciled at its reservation (the provider may have billed: the charge stays);
 *     a terminal job whose one reservation is still open is settled at what its runs cost;
 *   - retention (daily 03:50, 5 s): expired `ai_cache` rows; `ai_runs.output` after 90 days; `ai_runs` rows after
 *     180 days (the daily rollups hold them); `ai_batch_items` 30 days after ingest or drop; `ai_eval_runs.report`
 *     after 180 days; `ai_jobs` done, failed or cancelled after 30 days with their `DATA_DIR/ai/<storeId>/<jobId>/`
 *     blobs. `ai_feedback` (R2, AI-12) is not in 0005: its 400-day text rule arrives with the table.
 * The finds are cross-store (annotated, pinned: CCR r1-p7-8); each row's write goes through its own store's scope.
 */
import { and, eq, isNotNull, lt } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { aiCache, aiRuns } from "@/lib/db/schema";
import type { JobCtx } from "@/lib/jobs/runner";
import { systemScope } from "@/lib/jobs/scope";
import { removeJobBlobs } from "../jobs/blob";
import { settleOpenJob } from "../jobs/claim";
import { finishRun } from "../store/runs";
import { deleteJob, readJob } from "../store/jobs";
import { purgeOldItems } from "./batches";
import { nullOldReports } from "./eval-runs";
import { jobsPastRetention, jobsWithOpenReservation } from "./jobs";

export const ABANDONED_AFTER_MS = 10 * 60_000;
const SLICE = 2_000;
const DAY = 86_400_000;

/** One pass of `ai.reconcile`. */
export async function reconcileAbandoned(ctx: JobCtx, now: Date = new Date()): Promise<{ runs: number; jobs: number }> {
  // tenancy: platform ai_runs abandoned runs across stores (AI-§C.2 step 6): ids only, each row then finished through its store's scope
  const stale = await db
    .select({ id: aiRuns.id, storeId: aiRuns.storeId, reserved: aiRuns.reservedCredits, createdAt: aiRuns.createdAt })
    .from(aiRuns)
    .where(and(eq(aiRuns.status, "running"), lt(aiRuns.createdAt, new Date(now.getTime() - ABANDONED_AFTER_MS))))
    .limit(200);
  let runs = 0;
  for (const r of stale) {
    if (Date.now() >= ctx.deadline) break;
    await ctx.yield();
    const ok = await finishRun(systemScope(ctx, r.storeId), r.id, { status: "error", errorCode: "abandoned", credits: r.reserved ?? 0, ms: Math.min(2_147_483_647, now.getTime() - r.createdAt.getTime()), reconciled: true });
    if (ok) runs++;
  }
  let jobs = 0;
  for (const ref of await jobsWithOpenReservation(now)) {
    if (Date.now() >= ctx.deadline) break;
    const scope = systemScope(ctx, ref.storeId);
    const row = await readJob(scope, ref.id);
    if (row && (await settleOpenJob(scope, row, now))) jobs++;
  }
  return { runs, jobs };
}

/** One pass of `ai.retention`; each rule in slices until the budget is spent. */
export async function aiRetention(ctx: JobCtx, now: Date = new Date()): Promise<Record<string, number>> {
  const out: Record<string, number> = { cache: 0, outputs: 0, runs: 0, items: 0, reports: 0, jobs: 0 };
  const left = () => Date.now() < ctx.deadline;
  const affected = (res: unknown) => (res as { affectedRows?: number } | undefined)?.affectedRows ?? 0;
  if (left()) {
    // tenancy: platform ai_cache expired rows across stores (core §H.11)
    const [res] = await db.delete(aiCache).where(lt(aiCache.expiresAt, now)).limit(SLICE);
    out.cache = affected(res);
    await ctx.yield();
  }
  if (left()) {
    // tenancy: platform ai_runs outputs older than 90 days nulled across stores (core §H.11)
    const [res] = await db.update(aiRuns).set({ output: null }).where(and(lt(aiRuns.createdAt, new Date(now.getTime() - 90 * DAY)), isNotNull(aiRuns.output))).limit(SLICE);
    out.outputs = affected(res);
    await ctx.yield();
  }
  if (left()) {
    // tenancy: platform ai_runs rows older than 180 days across stores, after the daily rollups hold them (core §H.11)
    const [res] = await db.delete(aiRuns).where(lt(aiRuns.createdAt, new Date(now.getTime() - 180 * DAY))).limit(SLICE);
    out.runs = affected(res);
    await ctx.yield();
  }
  if (left()) {
    out.items = await purgeOldItems(new Date(now.getTime() - 30 * DAY), SLICE);
    await ctx.yield();
  }
  if (left()) {
    out.reports = await nullOldReports(new Date(now.getTime() - 180 * DAY), 200);
    await ctx.yield();
  }
  for (const ref of left() ? await jobsPastRetention(new Date(now.getTime() - 30 * DAY)) : []) {
    if (!left()) break;
    const scope = systemScope(ctx, ref.storeId);
    await removeJobBlobs(ref.storeId, ref.id);
    if (await deleteJob(scope, ref.id)) out.jobs++;
    await ctx.yield();
  }
  return out;
}
