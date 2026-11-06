import "server-only";
/**
 * Detached AI jobs, pattern B (P7 AI; ai.md AI-§B.13, AI-§C.2, AI-§C.3; docs/STORE-SAAS.md §H.12, D56, §K.2 P0 ai
 * stubs, AI R13, PLA Q.11). `enqueueAiJob` (frozen at P0, src/lib/contracts/r1-p0.ts) runs steps 1-5 of
 * `runServerTask` for the whole job:
 *   1. the gate of the first stage's task (release flag, cloud, key, cap, kill switch, breaker, plan, local-only,
 *      the task buckets) and the creation bucket `s:<sid>:ai:jobs` 10 / h;
 *   2. every stage's input parsed strictly and through the PII gate (the redacted input is what the job keeps);
 *   3. an identical active job answers `{ deduped: true }` with its id, before anything is charged; another deep job
 *      of the store still active answers `busy` (one deep job per store at a time, core §H.12 rule 5);
 *   4. one reservation for every stage of `stagePlanFor(…)` at the class's estimate, with the job's pass counter
 *      (`ai_deep_passes` for a deep pass; the critique-as-job is the critique of an interactive pass, so it counts the
 *      Director pass unless the input says the plan stage already did, `passCharged: true`);
 *   5. the `ai_jobs` row (`queued`, `active = '1'`, `progress.plan`, no lease); `aj_active_uq` dedupes a concurrent
 *      twin (its reservation released).
 * Then the free first driver: `after()` when the flag `ai_detached_jobs` is on (./run.ts). The poll is the primary
 * driver, the cron the third (./recover.ts). `cancelAiJob` is the owner's cancel; `enqueueProbeJob` the staff-only
 * detached-job probe (kind `probe`: sleep stages, no model, no credit, never through `enqueueAiJob`).
 */
import type { aiJobs } from "@/lib/db/schema";
import { newId } from "@/lib/db/ids";
import { rateLimit } from "@/lib/security/rate-limit";
import { effectivePrices } from "@/lib/settings/keys/platform_ai";
import type { StoreCtx, StoreScope } from "@/lib/tenancy/types";
import type { AiFailCode } from "../provider/types";
import { AI_RATES, aiJobsBucket } from "../quota/buckets";
import { estimate } from "../quota/cost";
import { AiQuotaError, release, reservationJson, reserve } from "../quota/reserve";
import { sha256Hex } from "../prompts/sha256";
import { canonicalJson } from "../prompts/text";
import { serverGate } from "../router/run.server";
import { writeScopeOf } from "../router/write-scope";
import { gateInput } from "../safety/pii";
import { parseTaskInput } from "../schema/tasks/inputs";
import { activeJobByInput, getAiJob as readJobView, hasActiveDeepJob, insertJob, readJob, type AiJobView } from "../store/jobs";
import type { AiTaskId } from "../tasks";
import { cancelJobRow } from "./claim";
import { abortJobStage, scheduleDetachedJob } from "./run";
import { isCritiqueJob, jobClassFor, planForJob, stageInputOf, stagePlanFor, PROBE_STAGE_MS, PROBE_TOTAL_MS } from "./stages";

/** probe: the staff-only detached-job probe of AI-§B.13 / core §H.12 rule 1, never enqueued through enqueueAiJob */
export type AiJobKind = Exclude<(typeof aiJobs.$inferSelect)["kind"], "probe">;

export interface AiJobInput<K extends AiJobKind> {
  kind: K;
  task: AiTaskId;
  input: unknown;
  /** the engine result kept on failure */
  instant?: unknown;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** The pass counter a job charges (AI-§C.3): a deep pass, the Director pass of the critique-as-job, or none. */
function passOf(kind: AiJobKind, input: unknown): { pass: "director" | "deep" | null; passCharged: boolean } {
  if (isCritiqueJob(kind, input)) return { pass: "director", passCharged: isRecord(input) && input.passCharged === true };
  if (kind === "health_report") return { pass: null, passCharged: false };
  return { pass: "deep", passCharged: false };
}

/** Every stage's input parsed and PII-gated; the job keeps the redacted input in the same shape. */
function gatedJobInput(plan: ReturnType<typeof stagePlanFor>, input: unknown): { ok: true; input: unknown } | { ok: false; code: AiFailCode } {
  const keyed = isRecord(input) && plan.stages.some((s) => s.id.split(":")[0]! in input);
  const out: Record<string, unknown> = keyed ? { ...(input as Record<string, unknown>) } : {};
  let whole: unknown = input;
  for (const stage of plan.stages) {
    const task = stage.task as AiTaskId;
    const parsed = parseTaskInput(task, stageInputOf(stage.id, input));
    if (!parsed.ok) return { ok: false, code: "input_invalid" };
    const gated = gateInput(task, parsed.value);
    if ("blocked" in gated) return { ok: false, code: "pii_blocked" };
    if (keyed) out[stage.id.split(":")[0]!] = gated.input;
    else whole = gated.input;
  }
  return { ok: true, input: keyed ? out : whole };
}

export async function enqueueAiJob<K extends AiJobKind>(ctx: StoreCtx, job: AiJobInput<K>): Promise<{ ok: true; jobId: string; deduped: boolean } | { ok: false; code: AiFailCode }> {
  const ws = ctx.impersonation ? null : writeScopeOf(ctx.scope);
  if (!ws) return { ok: false, code: "state" };
  // 1. the gate of the first stage's task, then the creation bucket
  const g = await serverGate(ws, job.task, { actor: ctx.actor });
  if (!g.ok) return { ok: false, code: g.code };
  const settings = g.settings;
  const plan = stagePlanFor(job.kind, job.input, settings.probe);
  if (!plan.stages.length) return { ok: false, code: "bad_request" };
  // 2. inputs
  const gated = gatedJobInput(plan, job.input);
  if (!gated.ok) return { ok: false, code: gated.code };
  const inputHash = sha256Hex(canonicalJson({ kind: job.kind, task: job.task, input: gated.input }));
  // 3. dedupe before any charge; one deep job per store
  const existing = await activeJobByInput(ws, inputHash);
  if (existing) return { ok: true, jobId: existing, deduped: true };
  if (await hasActiveDeepJob(ws)) return { ok: false, code: "busy" };
  const rate = await rateLimit(aiJobsBucket(ws), AI_RATES.jobs.limit, AI_RATES.jobs.windowSec);
  if (!rate.ok) return { ok: false, code: "rate_limited" };
  // 4. one reservation for every stage
  const jobId = newId();
  const cls = jobClassFor(job.kind, job.input);
  const firstTask = plan.stages[0]!.task as AiTaskId;
  const est = estimate(firstTask, stageInputOf(plan.stages[0]!.id, gated.input), { batch: false, fast: false, stages: plan.stages.length, model: settings.classes[cls].model, prices: effectivePrices(settings.prices).rows });
  const { pass, passCharged } = passOf(job.kind, job.input);
  let reservation;
  try {
    reservation = await reserve(ws, est, jobId, { task: firstTask, pass, passCharged });
  } catch (err) {
    if (err instanceof AiQuotaError) return { ok: false, code: err.code === "state" ? "state" : err.code };
    throw err;
  }
  // 5. the row
  const now = new Date();
  try {
    const row = await insertJob(ws, {
      id: jobId,
      kind: job.kind,
      task: job.task,
      inputHash,
      progress: { done: 0, total: plan.stages.length, stages: {}, plan: plan.stages.map((s) => s.id) },
      class: cls,
      doc: { runIds: [], input: gated.input, plan: [...plan.stages], reservation: reservationJson(reservation), ...(job.instant !== undefined ? { instant: job.instant } : {}) },
      reservedCredits: reservation.credits,
      createdBy: ctx.user.id,
      now,
    });
    if (row.deduped) {
      await release(reservation);
      return { ok: true, jobId: row.id, deduped: true };
    }
  } catch (err) {
    await release(reservation);
    throw err;
  }
  await scheduleDetachedJob(ws, jobId, ctx.user.id);
  return { ok: true, jobId, deduped: false };
}

/** `GET /api/app/<h>/ai/jobs/[id]`: one job of the scope's store (null for another store's id), metadata only. */
export async function getAiJob(scope: StoreScope, id: string): Promise<AiJobView | null> {
  return readJobView(scope, id);
}

/**
 * The owner's cancel (the creator, or a member with `ai.manage`): the job terminal `cancelled`, the reservation
 * reconciled at the usage known so far, and the stage running in this process aborted (its run row says `cancelled`).
 */
export async function cancelAiJob(ctx: StoreCtx, id: string): Promise<void> {
  const ws = ctx.impersonation ? null : writeScopeOf(ctx.scope);
  if (!ws) return;
  const row = await readJob(ws, id);
  if (!row || (row.createdBy !== ctx.user.id && !ctx.can("ai.manage"))) return;
  if (await cancelJobRow(ws, row)) abortJobStage(id);
}

/**
 * The detached-job probe (AI-§B.13 step 5, core §H.12 rule 1): a dummy job of sleep stages that heartbeat, no model,
 * no credit. Staff only (an admin or super admin acting in a store they belong to); `after()` is scheduled whatever the
 * flag says (the probe is what sets it), unless the `ai-no-after` seam is on.
 */
export async function enqueueProbeJob(ctx: StoreCtx, opts: { totalMs?: number; stageMs?: number } = {}): Promise<{ ok: true; jobId: string } | { ok: false; code: "state" | "forbidden" }> {
  const ws = ctx.impersonation ? null : writeScopeOf(ctx.scope);
  if (!ws) return { ok: false, code: "state" };
  if (ctx.user.platformRole !== "super_admin" && ctx.user.platformRole !== "admin") return { ok: false, code: "forbidden" };
  const input = { totalMs: opts.totalMs ?? PROBE_TOTAL_MS, stageMs: opts.stageMs ?? PROBE_STAGE_MS };
  const plan = planForJob("probe", input, null);
  const jobId = newId();
  const now = new Date();
  await insertJob(ws, {
    id: jobId,
    kind: "probe",
    task: "probe.sleep",
    inputHash: sha256Hex(`probe|${jobId}`),
    progress: { done: 0, total: plan.stages.length, stages: {}, plan: plan.stages.map((s) => s.id) },
    class: "director_deep",
    doc: { runIds: [], input, plan: [...plan.stages], reservation: null },
    reservedCredits: 0,
    createdBy: ctx.user.id,
    now,
  });
  await scheduleDetachedJob(ws, jobId, ctx.user.id, { force: true });
  return { ok: true, jobId };
}
