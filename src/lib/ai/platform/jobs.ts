import "server-only";
/**
 * The cross-store reads of the job sweeps (P7 AI; ai.md AI-§B.13 step 4, AI-§N `ai.jobs`, `ai.reconcile`,
 * `ai.retention`; docs/STORE-SAAS.md §H.2 slot 4c, §H.11, D64). Each answers ids and store ids only, over the
 * `aj_orphan_idx` / `aj_store_idx` indexes; every row found is then read and written through its own store's system
 * scope (src/lib/jobs/scope.ts `systemScope`), so no write here spans stores. Annotated and pinned (CCR r1-p7-8).
 */
import { and, asc, eq, gt, inArray, isNotNull, isNull, lt, notLike, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { aiJobs } from "@/lib/db/schema";
import { DRIVERLESS_AFTER_MS, ORPHAN_AFTER_MS, QUEUED_EXPIRY_MS } from "../jobs/stages";

export interface JobRef {
  id: string;
  storeId: string;
}

/**
 * The jobs the slot-4c sweep looks at, oldest first: a running stage whose heartbeat is older than 60 s (not a
 * batch hand-off), a queued row older than 30 min, and a job with no live lease and no driver for 60 s.
 */
export async function jobsToSweep(now: Date, limit = 50): Promise<JobRef[]> {
  const stale = new Date(now.getTime() - ORPHAN_AFTER_MS);
  const idle = new Date(now.getTime() - DRIVERLESS_AFTER_MS);
  const old = new Date(now.getTime() - QUEUED_EXPIRY_MS);
  const notBatch = or(isNull(aiJobs.stage), notLike(aiJobs.stage, "batch:%"));
  // tenancy: platform ai_jobs orphan sweep across stores (AI-§B.13 step 4): ids only, each row then written through its store's system scope
  return db
    .select({ id: aiJobs.id, storeId: aiJobs.storeId })
    .from(aiJobs)
    .where(
      or(
        and(eq(aiJobs.status, "running"), isNotNull(aiJobs.stage), notBatch, lt(aiJobs.heartbeatAt, stale)),
        and(eq(aiJobs.status, "queued"), lt(aiJobs.createdAt, old)),
        and(inArray(aiJobs.status, ["queued", "running"]), or(isNull(aiJobs.leaseUntil), lt(aiJobs.leaseUntil, now)), notBatch, lt(aiJobs.updatedAt, idle)),
      ),
    )
    .orderBy(asc(aiJobs.createdAt))
    .limit(limit);
}

/** Terminal jobs whose reservation is still open (a crash between the terminal write and the reconcile). */
export async function jobsWithOpenReservation(now: Date, limit = 50): Promise<JobRef[]> {
  // tenancy: platform ai_jobs ai.reconcile across stores: ids only, each reservation then settled through its store's scope
  return db
    .select({ id: aiJobs.id, storeId: aiJobs.storeId })
    .from(aiJobs)
    .where(and(inArray(aiJobs.status, ["done", "failed", "cancelled"]), sql`${aiJobs.result} LIKE '%"state":"open"%'`, lt(aiJobs.updatedAt, new Date(now.getTime() - 10 * 60_000)), gt(aiJobs.updatedAt, new Date(now.getTime() - 2 * 86_400_000))))
    .limit(limit);
}

/** Retention (core §H.11): jobs done, failed or cancelled more than 30 days ago, with their blobs. */
export async function jobsPastRetention(before: Date, limit = 200): Promise<JobRef[]> {
  // tenancy: platform ai_jobs retention across stores: ids only, each row and its blobs deleted through its store's scope
  return db
    .select({ id: aiJobs.id, storeId: aiJobs.storeId })
    .from(aiJobs)
    .where(and(inArray(aiJobs.status, ["done", "failed", "cancelled"]), lt(aiJobs.updatedAt, before)))
    .orderBy(asc(aiJobs.updatedAt))
    .limit(limit);
}
