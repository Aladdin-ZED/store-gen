import "server-only";
/**
 * The `exports` job (docs/STORE-SAAS.md §F.9, §H.2 slot 5; R1 P8 step 8): ≤ 11 s a tick, one `export_jobs` row at a
 * time; CPU-bound, so the runner halves its budget while the event loop lags (ENGC-11, `CPU_BOUND_JOBS`).
 *
 * Each tick:
 *   1. the cleanup branch: ready jobs of any store past their 72 h → parts deleted, `expired` (≤ 20 a tick);
 *   2. the claim: the oldest `running` job of any store (a job carries on before a new one starts), else the oldest
 *      `pending` one; its slices run in a system scope of its own store (src/lib/exports-store/job.ts) until the
 *      deadline.
 * The two cross-store reads below are the export queue's only statements without a store predicate; each is annotated
 * `tenancy: platform` and counted in the `src/lib/jobs/**` pin (CCR r1-p8-4). Everything after them is scoped.
 *
 * `exportWriteScope(scope)` is the system WriteScope `requestStoreExport` inserts with: a member's read-only scope of a
 * suspended or closed store (§A.5.3: export works there) or P1's platformScope (read-only by D71) may still queue the
 * store's own export, and only that insert is done with it.
 */
import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { exportJobs } from "@/lib/db/schema";
import type { ExportRunOpts } from "@/lib/exports-store/job";
import type { StoreScope, WriteScope } from "@/lib/tenancy/types";
import type { JobCtx, JobResult } from "./runner";
import { systemCtx, systemScope } from "./scope";

/** expired jobs cleaned per tick */
const EXPIRE_PER_TICK = 20;

/** The system WriteScope of the scope's own store, for the export request's insert only. */
export function exportWriteScope(scope: StoreScope): WriteScope {
  return systemScope(systemCtx("exports"), scope.storeId);
}

/** The next job to work on: the oldest running one of any store, else the oldest pending one. */
export async function nextExportJob(): Promise<{ id: string; storeId: string } | null> {
  const [row] = await db
    .select({ id: exportJobs.id, storeId: exportJobs.storeId })
    .from(exportJobs) // tenancy: platform the export queue (§H.2 slot 5): one job row of any store at a time, running first
    .where(inArray(exportJobs.state, ["running", "pending"]))
    .orderBy(sql`${exportJobs.state} = 'pending'`, asc(exportJobs.createdAt), asc(exportJobs.id))
    .limit(1);
  return row ?? null;
}

/** Ready jobs of any store whose 72 h have passed at `nowMs`. */
export async function expiredExportJobs(nowMs: number, limit: number = EXPIRE_PER_TICK): Promise<{ id: string; storeId: string }[]> {
  return db
    .select({ id: exportJobs.id, storeId: exportJobs.storeId })
    .from(exportJobs) // tenancy: platform the export cleanup (§F.9): ready jobs of any store past their expiry, ids only
    .where(and(eq(exportJobs.state, "ready"), lte(exportJobs.expiresAt, new Date(nowMs))))
    .orderBy(asc(exportJobs.expiresAt))
    .limit(limit);
}

/** The registered job's body (`opts` are the tests' forced slices, part size and clock). */
export async function exportsJob(ctx: JobCtx, opts: ExportRunOpts = {}): Promise<JobResult> {
  const { expireExportJob, runExportJob } = await import("@/lib/exports-store/job");
  const nowMs = (opts.now ?? Date.now)();
  let expired = 0;
  for (const j of await expiredExportJobs(nowMs)) {
    if (await expireExportJob(systemScope(ctx, j.storeId), j.id)) expired++;
  }
  const next = await nextExportJob();
  if (!next) return { done: true, summary: { expired, idle: true } };
  const r = await runExportJob(ctx, systemScope(ctx, next.storeId), next.id, opts);
  return {
    done: r.state !== "running",
    processed: r.slices,
    summary: { expired, state: r.state, slices: r.slices, entries: r.entries, ...(r.parts ? { parts: r.parts, bytes: r.bytes ?? 0 } : {}), ...(r.error ? { error: r.error } : {}) },
    ...(r.error ? { errorCode: `export_${r.error}` } : {}),
  };
}
