import "server-only";
/**
 * The writes of the pattern-B stage machine (P7 AI; ai.md AI-§B.13 steps 2-4, AI-§B.8 cases a/b, AI-§C.2;
 * docs/STORE-SAAS.md §H.12 rules 2-5). Every transition is the pure `jobTransition` of ./stages.ts applied as one
 * conditional UPDATE through the store's `WriteScope` (../store/jobs.ts `casJob`), so two drivers never run the same
 * stage and a driver that lost its lease writes nothing. This module never calls a provider (the orphan sweep imports
 * it; test:ai checks its import graph):
 *   - `claimStage(scope, id, driver)`: the next stage under a lease of `deadlineMs + 15 s` (`stage_attempts + 1` on a
 *     re-claim); a `batchOnly` stage, or the cron's claim of a driverless job, goes to a one-item batch instead
 *     (`stage = "batch:<id>"`, `transport = 'batch'`), never run inline;
 *   - `completeStage`: the stage output (≤ 64 KB inline, else its blob) and the progress, written in the same
 *     statement that releases the lease; the last stage writes `done`, `active = NULL`, `done_at`, the cost, then
 *     reconciles the job's one reservation and notifies `ai.job_done`;
 *   - `failJob` / `cancelJob`: the terminal write with `active = NULL`, the instant result kept, the reservation
 *     reconciled at the usage known so far (finished stages billed, an orphaned stage at its share of the
 *     reservation) or released when nothing ran, and `ai.job_failed`.
 */
import { appHref } from "@/lib/urls";
import { notify } from "@/lib/platform/notify";
import { getPlatformSetting } from "@/lib/settings";
import { getStoreById } from "@/lib/tenancy/public";
import { activeKillSwitches } from "@/lib/tenancy/entitlements";
import type { StoreScope, WriteScope } from "@/lib/tenancy/types";
import { queueStoreItem } from "../batch/queue";
import { promptFor } from "../prompts/registry";
import { reconcile, release, reservationFrom, reservationJson } from "../quota/reserve";
import { creditsFor } from "../quota/cost";
import { writeScopeOf } from "@/lib/tenancy/seam";
import { casJob, claimableCond, docOf, heartbeatJob, leaseCond, batchStageCond, readJob, type JobDoc, type JobRow, type JobSet } from "../store/jobs";
import { jobCost } from "../store/runs";
import { TASKS, routeFor, type AiTaskId } from "../tasks";
import { keepStageOutput } from "./blob";
import { TERMINAL, jobTransition, planForJob, stageInputOf, type JobState, type PlannedStage } from "./stages";

export type ClaimResult = { stage: string; lease: Date; resumed: boolean; batched: boolean } | { none: "running" | "done" | "terminal" };

const ms = (d: Date | null) => (d ? d.getTime() : null);

/** The pure machine's view of a row; `drivenAt` is the last write by a driver or a poll (`updated_at`). */
export function stateOf(row: JobRow): JobState {
  const p = row.progress ?? { done: 0, total: 0, stages: {}, plan: [] };
  return {
    status: row.status,
    active: row.active === "1" ? "1" : null,
    stage: row.stage,
    progress: { done: p.done, total: p.total, stages: { ...p.stages }, plan: [...p.plan] },
    stageAttempts: row.stageAttempts,
    driver: row.driver,
    leaseUntil: ms(row.leaseUntil),
    heartbeatAt: ms(row.heartbeatAt),
    createdAt: row.createdAt.getTime(),
    drivenAt: row.updatedAt.getTime() > row.createdAt.getTime() ? row.updatedAt.getTime() : null,
    error: row.error,
    doneAt: ms(row.doneAt),
  };
}

const at = (v: number | null) => (v === null ? null : new Date(v));

/** The columns a transition changed (progress, stage, lease, driver, attempts, status, active, error). */
function setFrom(n: JobState): JobSet {
  return {
    status: n.status,
    active: n.active,
    stage: n.stage,
    progress: n.progress,
    stageAttempts: n.stageAttempts,
    driver: n.driver,
    leaseUntil: at(n.leaseUntil),
    heartbeatAt: at(n.heartbeatAt),
    error: n.error,
    doneAt: at(n.doneAt),
  };
}

/** The plan a job was created with (kept in its document), else the plan its input gives today. */
export function planOf(row: JobRow): PlannedStage[] {
  const d = docOf(row);
  if (d.plan?.length) return d.plan;
  return [...planForJob(row.kind, d.input, null).stages];
}

const stageOf = (row: JobRow, id: string): PlannedStage | null => planOf(row).find((s) => s.id === id) ?? null;
const baseOf = (stage: string) => (stage.startsWith("batch:") ? stage.slice(6) : stage);

/** A write scope for a driver; the impersonation and platform scopes never write (D70). */
export function driverScope(scope: StoreScope): WriteScope {
  const ws = writeScopeOf(scope);
  if (!ws) throw new Error("ai jobs: a read-only scope cannot drive a job");
  return ws;
}

/**
 * Claims the next stage (AI-§B.13 step 3). `cron` only hands a driverless job's stage to a one-item batch; a
 * `batchOnly` stage goes there whoever claims it. The kill switch leaves the job waiting (core §H.8).
 */
export async function claimStage(scope: StoreScope, jobId: string, driver: "after" | "poll" | "cron", now: Date = new Date()): Promise<ClaimResult> {
  const ws = driverScope(scope);
  const row = await readJob(ws, jobId);
  if (!row) return { none: "terminal" };
  if (TERMINAL.has(row.status)) return { none: row.status === "done" ? "done" : "terminal" };
  if ((await activeKillSwitches()).includes("ai_generation_enabled")) return { none: "running" };
  const s = stateOf(row);
  const nextId = s.progress.plan.find((id) => s.progress.stages[id] !== "done") ?? null;
  const stage = nextId ? stageOf(row, nextId) : null;
  const { next, effect } = jobTransition(s, { type: "claim", driver, now: now.getTime(), ...(stage ? { deadlineMs: stage.deadlineMs } : {}) });
  switch (effect.kind) {
    case "finished":
      await finishJob(ws, row, docOf(row), now);
      return { none: "done" };
    case "batched":
      return (await handToBatch(ws, row, next, baseOf(effect.stage), now)) ? { stage: effect.stage, lease: now, resumed: false, batched: true } : { none: "running" };
    case "claimed": {
      if (stage?.batchOnly) {
        const batched: JobState = { ...next, stage: `batch:${effect.stage}`, leaseUntil: null };
        return (await handToBatch(ws, row, batched, effect.stage, now)) ? { stage: `batch:${effect.stage}`, lease: now, resumed: effect.resumed, batched: true } : { none: "running" };
      }
      const won = await casJob(ws, row, { ...setFrom(next), transport: "job" }, now, claimableCond(now));
      return won ? { stage: effect.stage, lease: new Date(effect.leaseUntil!), resumed: effect.resumed, batched: false } : { none: "running" };
    }
    case "none":
      return { none: effect.why === "terminal" ? "terminal" : effect.why === "done" ? "done" : "running" };
    default:
      return { none: "running" };
  }
}

/** The one-item batch of a stage (AI-§B.8 cases a and b): the row first (one driver wins), then the queue item. */
async function handToBatch(ws: WriteScope, row: JobRow, next: JobState, stageId: string, now: Date): Promise<boolean> {
  const stage = stageOf(row, stageId);
  if (!stage || stage.task === "probe.sleep") {
    // the probe measures its drivers: a probe nobody drives ends here
    await failJob(ws, row, "driverless", now);
    return false;
  }
  const won = await casJob(ws, row, { ...setFrom(next), stage: `batch:${stageId}`, leaseUntil: null, transport: "batch" }, now, claimableCond(now));
  if (!won) return false;
  const task = stage.task as AiTaskId;
  try {
    const settings = await getPlatformSetting("platform_ai");
    const family = TASKS[task].family;
    const p = family ? promptFor(family, settings, "server") : null;
    if (!p) throw new Error("no prompt");
    await queueStoreItem(ws, {
      task,
      input: stageInputOf(stageId, docOf(row).input),
      ref: { kind: "job", id: `${row.id}:${stageId}` },
      model: routeFor(task, settings, { pattern: "C" }).model,
      promptVersion: p.version,
      reserve: false,
      extra: { class: row.class },
    });
    return true;
  } catch (err) {
    console.error(`[ai] job stage hand-off failed: ${err instanceof Error ? err.name : "error"}`);
    const fresh = await readJob(ws, row.id);
    if (fresh) await failJob(ws, fresh, "batch_unavailable", now);
    return false;
  }
}

/** What a finished stage leaves: its guarded output, its run, nothing else. */
export interface StageOut {
  output: unknown;
  runId: string | null;
}

/**
 * Persists one finished stage and releases its lease in the same statement (AI-§B.13 step 2); `how` is the lease the
 * driver holds, or the batch hand-off that owns `batch:<stage>`. False when the lease was lost (nothing written).
 */
export async function completeStage(ws: WriteScope, row: JobRow, stageId: string, out: StageOut, how: { lease: Date } | { batch: true }, now: Date = new Date()): Promise<boolean> {
  const owned = "lease" in how ? stageId : `batch:${stageId}`;
  const { next, effect } = jobTransition(stateOf(row), { type: "stage_done", stage: owned, now: now.getTime() });
  if (effect.kind !== "progressed" && effect.kind !== "finished") return false;
  const doc = docOf(row);
  const kept = await keepStageOutput(row.storeId, row.id, stageId, out.output);
  const nextDoc: JobDoc = { ...doc, outputs: { ...(doc.outputs ?? {}), [stageId]: kept.value }, runIds: out.runId ? [...doc.runIds, out.runId] : doc.runIds, ...(kept.ref ? { outputRef: kept.ref } : {}) };
  const cond = "lease" in how ? leaseCond(stageId, how.lease) : batchStageCond(owned);
  // the lease (or the batch hand-off) is the guard: a poll's touch in between must not lose the stage
  const target = { id: row.id, updatedAt: null };
  if (effect.kind === "progressed") {
    return casJob(ws, target, { ...setFrom(next), heartbeatAt: now, doc: nextDoc }, now, cond);
  }
  const cost = await jobCost(ws, row.id);
  const done: JobDoc = { ...nextDoc };
  delete done.input;
  const won = await casJob(ws, target, { ...setFrom(next), heartbeatAt: now, costMicros: cost.micros, doc: done }, now, cond);
  if (won) await settleReservation(ws, row.id, done, { micros: cost.micros, credits: cost.credits }, now);
  if (won && row.kind !== "probe") await notifyCreator(ws, row, "ai.job_done");
  return won;
}

/** A row whose last stage was already done (a crash between the stage and the terminal write). */
async function finishJob(ws: WriteScope, row: JobRow, doc: JobDoc, now: Date): Promise<void> {
  const cost = await jobCost(ws, row.id);
  const done: JobDoc = { ...doc };
  delete done.input;
  const won = await casJob(ws, row, { status: "done", active: null, stage: null, leaseUntil: null, doneAt: now, costMicros: cost.micros, doc: done }, now);
  if (won) await settleReservation(ws, row.id, done, { micros: cost.micros, credits: cost.credits }, now);
}

/**
 * The job's one reservation (AI-§B.13 step 1) against what it cost; `extraMicros` bills an orphaned stage at its
 * share. Released when nothing was billed and no request went out. The document records the outcome.
 */
async function settleReservation(ws: WriteScope, jobId: string, doc: JobDoc, actual: { micros: number; credits: number }, now: Date, opts: { releaseWhenNothing?: boolean } = {}): Promise<void> {
  const j = doc.reservation;
  if (!j || j.state !== "open") return;
  const r = reservationFrom(j, ws);
  try {
    if (opts.releaseWhenNothing && actual.micros === 0) await release(r);
    else await reconcile(r, actual);
  } catch (err) {
    console.error(`[ai] job reconcile failed: ${err instanceof Error ? err.name : "error"}`);
    return;
  }
  const row = await readJob(ws, jobId);
  if (!row) return;
  // the terminal row is never claimed again: a plain compare-and-set on its own last write
  await casJob(ws, row, { doc: { ...docOf(row), reservation: reservationJson(r) } }, now);
}

/** The per-stage share of a reservation (an orphaned stage is billed at it, AI-§B.13 step 4). */
function stageShare(doc: JobDoc, stages: number): { micros: number; credits: number } {
  const r = doc.reservation;
  if (!r || stages <= 0) return { micros: 0, credits: 0 };
  const micros = Math.ceil(r.micros / stages);
  return { micros, credits: creditsFor(micros) };
}

/**
 * The terminal `failed` write (an orphaned stage twice, a stage that failed, an expired queue, a dropped batch item):
 * `active = NULL`, the instant result kept, the ledger reconciled, the requester told.
 */
export async function failJob(ws: WriteScope, row: JobRow, error: string, now: Date = new Date(), opts: { orphanedStage?: string | null; cond?: Parameters<typeof casJob>[4] } = {}): Promise<boolean> {
  if (TERMINAL.has(row.status)) return false;
  const doc = docOf(row);
  const stages = { ...(row.progress?.stages ?? {}) };
  const failedStage = opts.orphanedStage ?? (row.stage ? baseOf(row.stage) : null);
  if (failedStage) stages[failedStage] = "failed";
  const progress = row.progress ? { ...row.progress, stages } : row.progress;
  const cost = await jobCost(ws, row.id);
  const share = opts.orphanedStage ? stageShare(doc, row.progress?.total ?? 1) : { micros: 0, credits: 0 };
  const failed: JobDoc = { ...doc };
  delete failed.input;
  const won = await casJob(ws, opts.cond ? { id: row.id, updatedAt: null } : row, { status: "failed", active: null, leaseUntil: null, error: error.slice(0, 200), progress, costMicros: cost.micros + share.micros, doc: failed }, now, opts.cond);
  if (!won) return false;
  await settleReservation(ws, row.id, failed, { micros: cost.micros + share.micros, credits: cost.credits + share.credits }, now, { releaseWhenNothing: cost.runs === 0 && !opts.orphanedStage });
  if (row.kind !== "probe") await notifyCreator(ws, row, "ai.job_failed");
  return true;
}

/** The owner's cancel: terminal `cancelled`; a stage already running finishes on its own and is billed. */
export async function cancelJobRow(ws: WriteScope, row: JobRow, now: Date = new Date()): Promise<boolean> {
  const { next, effect } = jobTransition(stateOf(row), { type: "cancel", now: now.getTime() });
  if (effect.kind !== "cancelled") return false;
  const doc = docOf(row);
  const cost = await jobCost(ws, row.id);
  const cancelled: JobDoc = { ...doc };
  delete cancelled.input;
  const won = await casJob(ws, row, { ...setFrom(next), costMicros: cost.micros, doc: cancelled }, now);
  if (won) await settleReservation(ws, row.id, cancelled, { micros: cost.micros, credits: cost.credits }, now, { releaseWhenNothing: cost.runs === 0 });
  return won;
}

/** The orphan sweep's write for one row (AI-§B.13 step 4): the lease cleared, or the job failed the second time. */
export async function sweepJob(ws: WriteScope, row: JobRow, now: Date = new Date()): Promise<"cleared" | "failed" | "expired" | null> {
  const { next, effect } = jobTransition(stateOf(row), { type: "sweep", now: now.getTime() });
  if (effect.kind === "lease_cleared") return (await casJob(ws, row, { leaseUntil: null }, now)) ? "cleared" : null;
  if (effect.kind === "failed") {
    if (effect.error === "expired") return (await failJob(ws, row, "expired", now)) ? "expired" : null;
    return (await failJob(ws, row, effect.error, now, { orphanedStage: row.stage })) ? "failed" : null;
  }
  void next;
  return null;
}

/** The heartbeat of a stage riding in a batch (ai.batches refreshes it on every poll). */
export async function heartbeatBatchStage(ws: WriteScope, jobId: string, stageId: string, now: Date = new Date()): Promise<boolean> {
  return heartbeatJob(ws, jobId, `batch:${stageId}`, now);
}

/** The requester's notification (job done or failed), linked to the store's dashboard. */
async function notifyCreator(ws: WriteScope, row: JobRow, kind: "ai.job_done" | "ai.job_failed"): Promise<void> {
  if (!row.createdBy) return;
  const store = await getStoreById(ws.storeId);
  await notify(
    { audience: "user", userId: row.createdBy, storeId: ws.storeId },
    kind,
    { jobKind: row.kind, jobId: row.id },
    { link: store ? appHref(store.handle) : undefined, dedupeKey: `${kind}:${row.id}`, severity: kind === "ai.job_done" ? "success" : "warn" },
  );
}

/** `ai.reconcile`: a terminal job whose reservation is still open, settled at what its runs cost. */
export async function settleOpenJob(ws: WriteScope, row: JobRow, now: Date = new Date()): Promise<boolean> {
  if (!TERMINAL.has(row.status)) return false;
  const doc = docOf(row);
  if (!doc.reservation || doc.reservation.state !== "open") return false;
  const cost = await jobCost(ws, row.id);
  await settleReservation(ws, row.id, doc, { micros: cost.micros, credits: cost.credits }, now, { releaseWhenNothing: cost.runs === 0 });
  return true;
}
