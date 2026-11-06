import "server-only";
/**
 * The cron's part in detached jobs: `recoverOrphans`, job `ai.jobs` (P7 AI; ai.md AI-§B.13 steps 3c and 4, AI-§B.8
 * case a, AI-§N; docs/STORE-SAAS.md §H.2 slot 4c: 1 s guaranteed + ≤ 5 s of leftover, DB writes only; rev 5 CRIT2-3).
 * For each job the platform sweep finds (../platform/jobs.ts), through its store's system scope:
 *   - a running stage whose heartbeat is older than 60 s: the lease is cleared, so the next driver re-claims the same
 *     stage (`stage_attempts` 1); orphaned a second time, the job fails with the instant result kept and the ledger
 *     reconciled (finished stages billed, the orphaned one at its share of the reservation);
 *   - a queued row nobody polled for 30 min: expired;
 *   - a job with no live lease, no poll and no `after()` for 60 s: its next stage goes to a one-item batch
 *     (`batch:<stage>`, collected by `ai.batches`), unless the kill switch holds every job where it is.
 * It NEVER calls `advanceJob`, a provider or `after()`: no stage runs inside the tick (test:ai checks the import
 * graph of this file, test:ai-db spies on the drivers and the fake provider).
 */
import type { JobCtx } from "@/lib/jobs/runner";
import { systemScope } from "@/lib/jobs/scope";
import { notify } from "@/lib/platform/notify";
import { activeKillSwitches } from "@/lib/tenancy/entitlements";
import { jobsToSweep } from "../platform/jobs";
import { readJob } from "../store/jobs";
import { claimStage, sweepJob } from "./claim";
import { TERMINAL } from "./stages";

export interface RecoverReport {
  /** stages handed to a one-item batch */
  resubmitted: number;
  /** jobs failed (a second orphaning, an expired queue) */
  failed: number;
  /** stale leases cleared for a re-claim */
  cleared: number;
}

/** One pass of the slot-4c sweep. Stops starting rows at `ctx.deadline`; awaits `ctx.yield()` between rows. */
export async function recoverOrphans(ctx: JobCtx): Promise<RecoverReport> {
  const out: RecoverReport = { resubmitted: 0, failed: 0, cleared: 0 };
  const now = new Date();
  const refs = await jobsToSweep(now);
  if (!refs.length) return out;
  const killed = (await activeKillSwitches()).includes("ai_generation_enabled");
  for (const ref of refs) {
    if (Date.now() >= ctx.deadline) break;
    await ctx.yield();
    const scope = systemScope(ctx, ref.storeId);
    const row = await readJob(scope, ref.id);
    if (!row || TERMINAL.has(row.status)) continue;
    const swept = await sweepJob(scope, row, now);
    if (swept === "cleared" || swept === "failed") {
      if (swept === "cleared") out.cleared++;
      else out.failed++;
      await notify({ audience: "platform_staff", minRole: "admin" }, "ai.job_orphaned", { outcome: swept === "cleared" ? "reclaimable" : "failed", stage: (row.stage ?? "").slice(0, 24) }, { severity: swept === "failed" ? "warn" : "info", dedupeKey: `ai.job_orphaned:${swept}:${now.toISOString().slice(0, 13)}`, link: "/admin/ai" });
      continue;
    }
    if (swept === "expired") {
      out.failed++;
      continue;
    }
    if (killed) continue;
    const claim = await claimStage(scope, ref.id, "cron", now);
    if ("stage" in claim && claim.batched) out.resubmitted++;
  }
  return out;
}
