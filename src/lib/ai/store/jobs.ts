import "server-only";
/**
 * The `ai_jobs` repository (P7 AI; ai.md AI-§B.13, AI-§A.4 `cloud.deepPass`, AI-§E.5; docs/STORE-SAAS.md §E.3,
 * §H.12). `getAiJob` is the view `GET /api/app/<h>/ai/jobs/[id]` answers with (null for another store's id), and
 * `activeJobsFor` the viewer's own queued and running jobs (the progress chip, `cancelStoreAiJobs`). Step 8 adds the
 * write side the drivers use (../jobs/run.ts, ../jobs/recover.ts, ../batch/ingest.ts), each through a `WriteScope`:
 *   - `insertJob`: the row of `enqueueAiJob`; `aj_active_uq (store_id, input_hash, active)` answers a duplicate with
 *     the active row's id (`deduped`);
 *   - `casJob`: one conditional UPDATE, compare-and-set on `updated_at` (every write here sets it) plus the caller's
 *     own conditions (the lease, the stage); `affectedRows === 1` is the only success;
 *   - `touchJob` / `heartbeatJob`: a poll's mark, the 10 s heartbeat of a running stage.
 * The `result` column also holds the job's internal document (`JobDoc`: the input, the plan, the stage outputs, the
 * reservation; CCR r1-p7-9 moves the input to its own column); the view strips every internal key: never the input,
 * never a prompt.
 */
import { and, desc, eq, gt, inArray, isNotNull, isNull, lt, notLike, or, type SQL } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { aiJobs, type CriticPicks } from "@/lib/db/schema";
import { byId, storeValues, whereStore } from "@/lib/tenancy/sql";
import type { StoreScope, WriteScope } from "@/lib/tenancy/types";
import type { ReservationJson } from "../quota/reserve";
import type { AiTaskId } from "../tasks";
import type { PlannedStage, StageTask } from "../jobs/stages";

export type AiJobRowKind = (typeof aiJobs.$inferSelect)["kind"];
export type AiJobStatus = (typeof aiJobs.$inferSelect)["status"];

export interface AiJobView {
  id: string;
  kind: AiJobRowKind;
  /** the first stage's task ("probe.sleep" for the staff probe) */
  task: AiTaskId | StageTask;
  status: AiJobStatus;
  /** the stage running or last run ("read", "critique", "blueprint:2", "batch:<stage>", …) */
  stage: string | null;
  progress: { done: number; total: number; stages: Record<string, "done" | "running" | "failed">; plan: string[] };
  transport: "job" | "batch";
  /** the class that served it (`director_interactive` after a fallback, and for the critique-as-job) */
  class: "director_deep" | "director_interactive";
  /** set when done (or failed with the instant result kept) */
  result: { runIds: string[]; outputRef?: string; instant?: unknown; critique?: CriticPicks } | null;
  /** the guarded output of each finished stage (a larger one is `{ ref }` to its blob), when done */
  outputs: Record<string, unknown> | null;
  /** the driver that last advanced the job (the console's after() / poll / cron / batch shares) */
  driver: "after" | "poll" | "cron" | "batch" | null;
  error: string | null;
  /** the last heartbeat of a running stage (10 s apart while a driver holds it) */
  heartbeatAt: string | null;
  /** what the job's finished stages cost so far (the run rows' sum once reconciled) */
  costMicros: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  doneAt: string | null;
}

export type JobRow = typeof aiJobs.$inferSelect;

/** The `result` column as the drivers write it: the public part (frozen shape) plus the job's internal keys. */
export interface JobDoc {
  runIds: string[];
  outputRef?: string;
  instant?: unknown;
  critique?: CriticPicks;
  /** internal: the job input (stage inputs by stage base), dropped at the terminal write */
  input?: unknown;
  /** internal: the plan the job was created with (ids, tasks, budgets, batchOnly) */
  plan?: PlannedStage[];
  /** the guarded output per finished stage, or `{ ref }` when it went to a blob */
  outputs?: Record<string, unknown>;
  /** internal: the one reservation of every stage (AI-§B.13 step 1), reconciled at the end */
  reservation?: ReservationJson | null;
  /** internal: the batch item that owns a `batch:<stage>` */
  batchItem?: string | null;
}

export const docOf = (r: Pick<JobRow, "result">): JobDoc => ({ runIds: [], ...((r.result ?? {}) as Partial<JobDoc>) });

function publicResult(d: JobDoc): AiJobView["result"] {
  return { runIds: d.runIds, ...(d.outputRef ? { outputRef: d.outputRef } : {}), ...(d.instant !== undefined ? { instant: d.instant } : {}), ...(d.critique ? { critique: d.critique } : {}) };
}

export function toView(r: JobRow): AiJobView {
  const p = r.progress;
  const d = docOf(r);
  const finished = r.status === "done" || r.status === "failed";
  return {
    id: r.id,
    kind: r.kind,
    task: r.task as AiTaskId | StageTask,
    status: r.status,
    stage: r.stage,
    progress: { done: p?.done ?? 0, total: p?.total ?? 0, stages: { ...(p?.stages ?? {}) }, plan: [...(p?.plan ?? [])] },
    transport: r.transport,
    class: r.class,
    result: finished ? publicResult(d) : null,
    outputs: r.status === "done" ? (d.outputs ?? {}) : null,
    driver: r.driver,
    error: r.error,
    heartbeatAt: r.heartbeatAt ? r.heartbeatAt.toISOString() : null,
    costMicros: r.costMicros ?? 0,
    createdBy: r.createdBy,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    doneAt: r.doneAt ? r.doneAt.toISOString() : null,
  };
}

/** One job of the scope's store; null for a missing id or another store's. */
export async function getAiJob(scope: StoreScope, id: string): Promise<AiJobView | null> {
  const row = await readJob(scope, id);
  return row ? toView(row) : null;
}

/** The viewer's own queued and running jobs, newest first (≤ 20). */
export async function activeJobsFor(scope: StoreScope, viewer: { userId: string }): Promise<AiJobView[]> {
  const rows = await db
    .select()
    .from(aiJobs)
    .where(whereStore(aiJobs, scope, eq(aiJobs.createdBy, viewer.userId), inArray(aiJobs.status, ["queued", "running"])))
    .orderBy(desc(aiJobs.createdAt))
    .limit(20);
  return rows.map(toView);
}

/** The deep kinds share one slot per store (`aj_active_uq` + AI-§A.4 `cloud.deepPass`). */
const DEEP_KINDS = ["director_deep", "store_blueprint", "logo_system"] as const;

/** True while one of the store's deep jobs is queued or running (`active = '1'`). */
export async function hasActiveDeepJob(scope: StoreScope): Promise<boolean> {
  const [row] = await db
    .select({ id: aiJobs.id })
    .from(aiJobs)
    .where(whereStore(aiJobs, scope, isNotNull(aiJobs.active), inArray(aiJobs.kind, [...DEEP_KINDS])))
    .limit(1);
  return row !== undefined;
}

/* ------------------------------------------------------------------ */
/* The write side (step 8)                                             */
/* ------------------------------------------------------------------ */

/** The full row of one of the store's jobs (the drivers' read; never answered to a browser as is). */
export async function readJob(scope: StoreScope, id: string): Promise<JobRow | null> {
  const [row] = await db.select().from(aiJobs).where(byId(aiJobs, scope, id)).limit(1);
  return row ?? null;
}

export interface NewJob {
  id: string;
  kind: AiJobRowKind;
  task: string;
  inputHash: string;
  progress: NonNullable<JobRow["progress"]>;
  class: JobRow["class"];
  doc: JobDoc;
  reservedCredits: number | null;
  createdBy: string | null;
  now: Date;
}

const isDup = (err: unknown) => {
  const e = err as { errno?: number; cause?: { errno?: number } } | null;
  return e?.errno === 1062 || e?.cause?.errno === 1062;
};

/** The active row with this input, if any (the dedupe answer). */
export async function activeJobByInput(scope: StoreScope, inputHash: string): Promise<string | null> {
  const [row] = await db
    .select({ id: aiJobs.id })
    .from(aiJobs)
    .where(whereStore(aiJobs, scope, eq(aiJobs.inputHash, inputHash), isNotNull(aiJobs.active)))
    .limit(1);
  return row?.id ?? null;
}

/** Inserts a queued, active job; a second identical active job answers the first's id (`aj_active_uq`). */
export async function insertJob(scope: WriteScope, j: NewJob): Promise<{ id: string; deduped: boolean }> {
  try {
    await db.insert(aiJobs).values(
      storeValues(scope, {
        id: j.id,
        kind: j.kind,
        task: j.task.slice(0, 32),
        status: "queued" as const,
        active: "1",
        stage: null,
        inputHash: j.inputHash,
        progress: j.progress,
        class: j.class,
        result: j.doc as JobRow["result"],
        reservedCredits: j.reservedCredits,
        createdBy: j.createdBy,
        createdAt: j.now,
        updatedAt: j.now,
      }),
    );
    return { id: j.id, deduped: false };
  } catch (err) {
    if (!isDup(err)) throw err;
    const existing = await activeJobByInput(scope, j.inputHash);
    if (!existing) throw err;
    return { id: existing, deduped: true };
  }
}

/** The columns a driver may write (never the store, the id, the input hash). */
export type JobSet = Partial<
  Pick<JobRow, "status" | "active" | "stage" | "progress" | "stageAttempts" | "driver" | "leaseUntil" | "heartbeatAt" | "attempts" | "class" | "model" | "effort" | "transport" | "error" | "costMicros" | "doneAt">
> & { doc?: JobDoc };

function setOf(set: JobSet, now: Date): Partial<Omit<JobRow, "storeId" | "id" | "inputHash">> {
  const { doc, ...rest } = set;
  return { ...rest, ...(doc ? { result: doc as JobRow["result"] } : {}), updatedAt: now };
}

/**
 * One conditional UPDATE: the row as read (`updated_at`, every write here sets it) and the caller's conditions.
 * True when this call won; false when another driver wrote first. A write that holds the lease (its condition
 * names the stage and the lease) passes `updatedAt: null`: a poll's touch in between must not lose a stage.
 */
export async function casJob(scope: WriteScope, row: Pick<JobRow, "id"> & { updatedAt: Date | null }, set: JobSet, now: Date, ...conds: (SQL | undefined)[]): Promise<boolean> {
  const [res] = await db
    .update(aiJobs)
    .set(setOf(set, now))
    .where(whereStore(aiJobs, scope, eq(aiJobs.id, row.id), row.updatedAt ? eq(aiJobs.updatedAt, row.updatedAt) : undefined, ...conds));
  return (res as { affectedRows?: number }).affectedRows === 1;
}

/** No live lease (none, or past) and no batch owning the stage: what a claim needs. */
export function claimableCond(now: Date): SQL {
  return and(inArray(aiJobs.status, ["queued", "running"]), or(isNull(aiJobs.leaseUntil), lt(aiJobs.leaseUntil, now)), or(isNull(aiJobs.stage), notLike(aiJobs.stage, "batch:%")))!;
}

/** The lease a claim took is still this driver's (the stage done / failed writes). */
export function leaseCond(stage: string, leaseUntil: Date): SQL {
  return and(eq(aiJobs.stage, stage), eq(aiJobs.leaseUntil, leaseUntil))!;
}

/** The stage is still owned by this batch hand-off (the ingest's write). */
export function batchStageCond(stage: string): SQL {
  return and(eq(aiJobs.stage, stage), eq(aiJobs.status, "running"))!;
}

/** The 10 s heartbeat of a running stage (only while this driver holds that stage). */
export async function heartbeatJob(scope: WriteScope, id: string, stage: string, now: Date): Promise<boolean> {
  const [res] = await db
    .update(aiJobs)
    .set({ heartbeatAt: now })
    .where(whereStore(aiJobs, scope, eq(aiJobs.id, id), eq(aiJobs.stage, stage), eq(aiJobs.status, "running")));
  return (res as { affectedRows?: number }).affectedRows === 1;
}

/** A poll that found nothing to run: the job is being watched (the driverless rule reads `updated_at`). */
export async function touchJob(scope: WriteScope, id: string, now: Date): Promise<void> {
  await db
    .update(aiJobs)
    .set({ updatedAt: now })
    .where(whereStore(aiJobs, scope, eq(aiJobs.id, id), inArray(aiJobs.status, ["queued", "running"]), lt(aiJobs.updatedAt, now)));
}

/** The viewer's jobs that are active, and those that reached a terminal status after `since` (the pulse). */
export async function pulseJobsFor(scope: StoreScope, viewer: { userId: string }, since: Date): Promise<{ running: number; done: string[] }> {
  const rows = await db
    .select({ id: aiJobs.id, status: aiJobs.status })
    .from(aiJobs)
    .where(
      whereStore(
        aiJobs,
        scope,
        eq(aiJobs.createdBy, viewer.userId),
        or(inArray(aiJobs.status, ["queued", "running"]), and(inArray(aiJobs.status, ["done", "failed", "cancelled"]), gt(aiJobs.updatedAt, since))),
      ),
    )
    .orderBy(desc(aiJobs.updatedAt))
    .limit(50);
  return {
    running: rows.filter((r) => r.status === "queued" || r.status === "running").length,
    done: rows.filter((r) => r.status !== "queued" && r.status !== "running").map((r) => r.id),
  };
}

/** Retention (core §H.11): one of the store's jobs, gone (its blobs are removed by the caller). */
export async function deleteJob(scope: WriteScope, id: string): Promise<boolean> {
  const [res] = await db.delete(aiJobs).where(byId(aiJobs, scope, id));
  return (res as { affectedRows?: number }).affectedRows === 1;
}
