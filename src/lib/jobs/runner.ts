import "server-only";
/**
 * The cron tick and the job runner (docs/STORE-SAAS.md §H.2, OS-08): hPanel calls `/api/cron/tick` every 5 minutes;
 * `runTick()` takes the tick lease (a `cron_cursors` row, rev 5 CRIT2-18: no lock-pool connection held), runs the
 * registered jobs (src/lib/jobs/registry.ts) in their slots inside a 100 s budget, awaits `ctx.yield()` between units
 * of work, samples event-loop lag and writes one `job_runs` row per run.
 *
 * Types frozen at C0a; P8 implements the runner (R1 product, §K.2). Until then the cron route keeps today's steps.
 */
import type { StoreStatus, SystemCtx } from "@/lib/tenancy/types";

export interface Job {
  name: string; // ≤ 48 chars, e.g. "sheets.push"
  every: "tick" | "hourly" | { dailyAt: string /* "03:10" platform timezone */ };
  budgetMs: number; // hard slice inside the tick (the guaranteed budgets of every registered job sum to ≤ 95 s)
  perStore?: { states: readonly StoreStatus[]; maxStoresPerTick: number; where?: "pending_sheets" | "pending_outbox" | "pending_renders" };
  run(ctx: JobCtx): Promise<JobResult>; // must check ctx.deadline between units of work
}

export interface JobCtx extends SystemCtx {
  deadline: number; // epoch ms
  tickId: string;
  cursor: string; // the job's round-robin cursor (cron_cursors)
  setCursor(c: string): Promise<void>;
  /** rev 3 (ENGC-11): awaited between units of work (setImmediate), so the serving event loop breathes */
  yield(): Promise<void>;
  /** rev 3: the runner's event-loop lag estimate; renders and backups shorten their own budget above 100 ms */
  lagMs(): number;
}

export interface JobResult {
  /** false: work is left for the next tick */
  done: boolean;
  /** counts and codes for job_runs.summary (no customer data) */
  summary?: Record<string, number | string | boolean>;
}

export interface TickReport {
  tickId: string;
  /** another tick held the lease: nothing ran */
  skipped: boolean;
  startedAt: string;
  ms: number;
  lagP95Ms: number | null;
  jobs: { name: string; ms: number; cpuMs?: number; done?: boolean; error?: string }[];
}

/** rev 5 (CRIT2-18): the lease first; not acquired → `{ skipped: true }`. P8. */
export async function runTick(opts?: { budgetMs?: number /* default 100_000 */ }): Promise<TickReport> {
  void opts;
  throw new Error("not implemented: P8 (runTick)");
}
