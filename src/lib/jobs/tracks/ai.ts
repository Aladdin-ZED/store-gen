/**
 * Jobs of the ai track (P7 AI; ai.md AI-§N; docs/STORE-SAAS.md §H.2 slots 4b, 4c and 6, §K.3). Extension file
 * imported by src/lib/jobs/registry.ts.
 *
 *   ai.batches    4b · tick · 8 s       poll open Message Batches, ingest the ended ones (idempotent per item, resumes
 *                                       next tick), submit the queue (skipped, not failed, under the kill switch),
 *                                       refresh the heartbeat of job stages riding in a batch
 *   ai.jobs       4c · tick · 1 s       orphan recovery and the batch hand-off of driverless job stages; DB writes
 *                                       only, never a model call (the runner may give it ≤ 5 s of leftover)
 *   ai.rollups    6 · hourly · 5 s      ai_runs → ai_usage_daily per store (2-day idempotent upsert) with the credit
 *                                       notifications, then the canary slices and rollbacks, then the AI-§O alarms
 *   ai.reconcile  6 · hourly · 2 s      abandoned running runs, terminal jobs with an open reservation
 *   ai.retention  6 · daily 03:50 · 5 s the AI-§N retention row (core §H.11)
 * Every job awaits `ctx.yield()` between units (the ingest every 50 items, the rollups every store), takes no named
 * lock and holds no pooled connection across a model call (the only provider calls here are the batch retrieve,
 * results and create requests of `ai.batches`).
 */
import { pollAndIngest } from "@/lib/ai/batch/ingest";
import { submitQueued } from "@/lib/ai/batch/submit";
import { recoverOrphans } from "@/lib/ai/jobs/recover";
import { aiRetention, reconcileAbandoned } from "@/lib/ai/platform/maintenance";
import { canaryRollups, raiseAlarms } from "@/lib/ai/platform/rollups";
import { writeScopeOf } from "@/lib/tenancy/seam";
import { creditNotifications, rollupStoreUsage } from "@/lib/ai/store/usage-daily";
import type { Job, JobCtx, JobResult } from "../runner";
import { forEachStore } from "../scope";

async function batches(ctx: JobCtx): Promise<JobResult> {
  const ing = await pollAndIngest(ctx);
  const sub = await submitQueued(ctx);
  return {
    done: !ing.resumable,
    summary: { polled: ing.polled, ingested: ing.ingested, retried: ing.retried, dropped: ing.dropped + sub.dropped, submitted: sub.items, batches: sub.batches, ...(sub.skipped ? { skipped: sub.skipped } : {}) },
  };
}

async function orphans(ctx: JobCtx): Promise<JobResult> {
  const r = await recoverOrphans(ctx);
  return { done: true, summary: { resubmitted: r.resubmitted, failed: r.failed, cleared: r.cleared } };
}

/** The share of `ai.rollups`' 5 s the per-store pass may use; the canary rules and the alarms take the rest. */
const ROLLUP_STORES_MS = 3_500;

async function rollups(ctx: JobCtx): Promise<JobResult> {
  const now = new Date();
  let rows = 0;
  const visit = await forEachStore(ctx, { job: ctx.job, states: ["active", "restricted", "pending"], budgetMs: Math.max(500, Math.min(ROLLUP_STORES_MS, ctx.deadline - Date.now() - 1_000)) }, async (scope, store) => {
    const ws = writeScopeOf(scope);
    if (!ws) return;
    rows += await rollupStoreUsage(ws, store.timezone, now);
    await creditNotifications(ws, store, now);
    await ctx.yield();
  });
  const canaries = Date.now() < ctx.deadline ? await canaryRollups(now) : [];
  await ctx.yield();
  const alarms = Date.now() < ctx.deadline ? await raiseAlarms(now) : [];
  return {
    done: visit.done,
    summary: { stores: visit.visited, rows, canaries: canaries.length, rolledBack: canaries.filter((c) => c.rolledBack).length, promotable: canaries.filter((c) => c.promotion === "ready").length, alarms: alarms.length },
  };
}

async function reconcile(ctx: JobCtx): Promise<JobResult> {
  const r = await reconcileAbandoned(ctx);
  return { done: true, summary: { runs: r.runs, jobs: r.jobs } };
}

async function retention(ctx: JobCtx): Promise<JobResult> {
  const r = await aiRetention(ctx);
  return { done: Date.now() < ctx.deadline, summary: r };
}

export const jobs: Job[] = [
  { name: "ai.batches", every: "tick", budgetMs: 8_000, run: batches },
  { name: "ai.jobs", every: "tick", budgetMs: 1_000, run: orphans },
  { name: "ai.rollups", every: "hourly", budgetMs: 5_000, run: rollups },
  { name: "ai.reconcile", every: "hourly", budgetMs: 2_000, run: reconcile },
  { name: "ai.retention", every: { dailyAt: "03:50" }, budgetMs: 5_000, run: retention },
];
