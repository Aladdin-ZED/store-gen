/**
 * The stage machine of detached AI jobs, pure part (P7 AI; ai.md AI-§B.13, AI-§B.8, AI-§N `ai.jobs`; docs/STORE-SAAS.md
 * D56, §H.12; rev 3 ENGP-2, ENGP-3, rev 5 CRIT2-3). Isomorphic, no I/O, no clock of its own: every transition takes
 * `now`. The server drivers (`advanceJob`, `claimStage`, `recoverOrphans`) apply these transitions as conditional
 * UPDATEs on `ai_jobs`; the tests drive them with a fake clock.
 *
 *   - `stagePlanFor(kind, input, probe)`: a job is a list of stages each sized like a pattern-A call: `deadlineMs` ≤
 *     90,000 and `maxTokens` = ⌊deadline_s × tok/s × 0.6⌋ capped by the class ceiling; a part whose output need is
 *     larger is split (blueprint parts in halves, logo families one per stage), and a part that still cannot fit is
 *     `batchOnly` (a one-item batch, AI-§B.8 case b). Stage ids are ≤ 18 characters, so `batch:<stage>` fits the
 *     varchar(24) `ai_jobs.stage`.
 *   - `jobTransition(job, event)`: queued → running → done; a stale heartbeat clears the lease, the next driver
 *     re-claims the same stage once, a second orphaning fails the job (the instant result kept); cancel; `active` is
 *     NULL in the same write as every terminal status.
 *   - step 8: the critique-as-job (`director_deep` with only a `critique` input, run on the interactive class, used
 *     when probe line 11 measured the interactive Director below 80 tok/s, AI-§A.8.6), the probe's dummy plan (sleep
 *     stages that heartbeat, no model, no credit; staff only, AI-§B.13 step 5) and `stageInputOf` (a job input keyed by
 *     stage base hands each stage its own task input).
 */
import type { ProbeResult } from "@/lib/settings/keys/platform_ai";
import type { AiTaskId, TaskClass } from "../tasks";
import type { AiJobKind } from "./enqueue";

/** what a stage runs: a task, or the probe's model-free sleep */
export type StageTask = AiTaskId | "probe.sleep";
/** every `ai_jobs.kind`, the staff-only probe included (and 0006's catalog_from_photos, not enqueuable yet) */
export type JobRowKind = AiJobKind | "probe" | "catalog_from_photos";

/** every stage is a pattern-A-sized call (core §H.12) */
export const STAGE_DEADLINE_MS = 90_000;
/** the lease outlives the stage deadline by this margin */
export const LEASE_MARGIN_MS = 15_000;
/** a running stage whose heartbeat is older is orphaned (AI-§B.13 step 4) */
export const ORPHAN_AFTER_MS = 60_000;
/** a job nobody drove for this long has its next stage handed to a one-item batch (AI-§B.8 case a) */
export const DRIVERLESS_AFTER_MS = 60_000;
/** a queued job whose creator never polled expires (AI-§B.13 step 4) */
export const QUEUED_EXPIRY_MS = 30 * 60_000;
/** the heartbeat period while a stage streams */
export const HEARTBEAT_MS = 10_000;
export const MAX_STAGE_ID = 18;
/** throughput assumed before the probe measured it (AI-§H.1 targets assume ≥ 150 tok/s, probe line 11) */
export const DEFAULT_TOK_PER_SEC = 150;
/** the default `director_deep` class ceiling (platform_ai.classes) */
export const DEEP_CLASS_CEILING = 32_000;
/** loop guard (AI-§C.3): ≤ 3 blueprint stages before the split, ≤ 6 after */
export const MAX_BLUEPRINT_STAGES = 6;

export interface PlannedStage {
  /** ≤ 18 chars: "brief", "critique", "blueprint:1", "logo:2", "report", "sleep:1" */
  id: string;
  task: StageTask;
  /** ⌊deadline_s × tok/s × 0.6⌋, capped by the class ceiling */
  maxTokens: number;
  /** ≤ 90,000 */
  deadlineMs: number;
  /** the stage cannot fit a 90 s call even split: it runs as a one-item batch */
  batchOnly: boolean;
}
export interface StagePlan {
  stages: readonly PlannedStage[];
}

/** The output tokens one stage may produce: ⌊deadline_s × tok/s × 0.6⌋, never above the class ceiling. */
export function stageTokenBudget(deadlineMs: number, tokPerSec: number, ceiling: number): number {
  return Math.min(ceiling, Math.floor((deadlineMs / 1000) * tokPerSec * 0.6));
}

/** stage bases that always carry their number ("blueprint:<n>", "logo:<n>", AI-§B.13 step 2) */
const NUMBERED_STAGES: ReadonlySet<string> = new Set(["blueprint", "logo"]);

interface Part {
  base: string;
  task: AiTaskId;
  /** p90 output tokens (thinking included) */
  need: number;
  /** how many stages the part may be split into */
  maxSplit: number;
}

/** below this measured interactive-Director throughput the critique runs as a job stage (AI-§A.8.6, probe line 11) */
export const CRITIQUE_JOB_BELOW_TOK_PER_SEC = 80;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** True when probe line 11 measured the interactive Director below 80 tok/s: the critique becomes a job stage. */
export function critiqueRunsAsJob(probe: ProbeResult | null): boolean {
  const t = probe?.tokPerSec.director_interactive;
  return t !== undefined && t < CRITIQUE_JOB_BELOW_TOK_PER_SEC;
}

/** A `director_deep` job holding only the critique of an interactive pass (the critique-as-job). */
export function isCritiqueJob(kind: JobRowKind, input: unknown): boolean {
  return kind === "director_deep" && isRecord(input) && "critique" in input && !("brief" in input);
}

/** The class a job's stages run on: the interactive Director for the critique-as-job, else the deep class. */
export function jobClassFor(kind: JobRowKind, input: unknown): Extract<TaskClass, "director_deep" | "director_interactive"> {
  return isCritiqueJob(kind, input) ? "director_interactive" : "director_deep";
}

/**
 * The task input of one stage: a job input keyed by stage base (`{ brief: …, critique: … }`) hands each stage its own
 * entry; any other input is the stage's input as a whole.
 */
export function stageInputOf(stageId: string, jobInput: unknown): unknown {
  const base = stageId.split(":")[0]!;
  return isRecord(jobInput) && base in jobInput ? jobInput[base] : jobInput;
}

/** The logical parts of each kind (AI-§A.2 estimates, [estimate ±2×]). */
function partsFor(kind: AiJobKind, input: unknown): Part[] {
  switch (kind) {
    case "store_blueprint":
      // brand kit + collections, home sections + policy drafts (17,000), then one critique of the previews (6,000)
      return [
        { base: "blueprint", task: "store.blueprint", need: 8_500, maxSplit: 2 },
        { base: "blueprint", task: "store.blueprint", need: 8_500, maxSplit: 2 },
        { base: "critique", task: "store.blueprint", need: 6_000, maxSplit: 1 },
      ];
    case "logo_system": {
      const families = (input as { families?: unknown } | null)?.families;
      const n = Array.isArray(families) && families.length > 0 ? Math.min(families.length, 6) : 3;
      // 8,000 over the job, one family per stage
      return Array.from({ length: n }, () => ({ base: "logo", task: "logo.system" as const, need: Math.ceil(8_000 / n), maxSplit: 1 }));
    }
    case "director_deep":
      // the critique-as-job: the one critique stage of an interactive pass (slim output ≤ 5,000)
      if (isCritiqueJob(kind, input)) return [{ base: "critique", task: "design.critique", need: 5_000, maxSplit: 1 }];
      // the deep Director pass: the plan, then the critique (R2 adds verify)
      return [
        { base: "brief", task: "design.plan", need: 4_300, maxSplit: 1 },
        { base: "critique", task: "design.critique", need: 5_000, maxSplit: 1 },
      ];
    case "health_report":
      // pattern C from the start (AI-§B.8 case a: nobody drives a monthly report)
      return [{ base: "report", task: "health.report", need: 8_000, maxSplit: 1 }];
  }
}

/**
 * The stages of a job (AI-§B.13 step 2). `probe` gives the measured throughput of `director_deep` (line 11); `opts`
 * the class ceiling and the stage deadline when the console changed them.
 */
export function stagePlanFor(kind: AiJobKind, input: unknown, probe: ProbeResult | null, opts: { ceiling?: number; deadlineMs?: number } = {}): StagePlan {
  const deadlineMs = Math.min(opts.deadlineMs ?? STAGE_DEADLINE_MS, STAGE_DEADLINE_MS);
  const tps = probe?.tokPerSec[jobClassFor(kind, input)] ?? DEFAULT_TOK_PER_SEC;
  const budget = stageTokenBudget(deadlineMs, tps, opts.ceiling ?? DEEP_CLASS_CEILING);
  const stages: PlannedStage[] = [];
  const counters = new Map<string, number>();
  for (const part of partsFor(kind, input)) {
    const pieces = part.need <= budget ? 1 : Math.min(part.maxSplit, Math.ceil(part.need / budget));
    const fits = part.need / pieces <= budget;
    for (let k = 0; k < pieces; k++) {
      const n = (counters.get(part.base) ?? 0) + 1;
      counters.set(part.base, n);
      const id = NUMBERED_STAGES.has(part.base) || pieces > 1 ? `${part.base}:${n}` : part.base;
      stages.push({ id, task: part.task, maxTokens: budget, deadlineMs, batchOnly: kind === "health_report" || !fits });
    }
  }
  return { stages };
}

/** The probe's dummy job: about 5 minutes of sleep stages that heartbeat; no model, no credit (AI-§B.13 step 5). */
export const PROBE_TOTAL_MS = 300_000;
export const PROBE_STAGE_MS = 60_000;

/** The probe plan: ⌈total / stage⌉ sleep stages of ≤ 60 s each (the lease and the heartbeat as a real stage). */
export function probePlan(totalMs: number = PROBE_TOTAL_MS, stageMs: number = PROBE_STAGE_MS): StagePlan {
  const per = Math.max(1_000, Math.min(stageMs, STAGE_DEADLINE_MS));
  const n = Math.max(1, Math.min(10, Math.ceil(Math.max(1_000, totalMs) / per)));
  return { stages: Array.from({ length: n }, (_, i) => ({ id: `sleep:${i + 1}`, task: "probe.sleep" as const, maxTokens: 0, deadlineMs: per, batchOnly: false })) };
}

/** Every kind's plan: the probe's sleeps, else `stagePlanFor`. */
export function planForJob(kind: JobRowKind, input: unknown, probe: ProbeResult | null): StagePlan {
  // 0006 (STO-§4.7): the kind exists in the table; its stage plan arrives with S1 / S7 (R2), and no path enqueues it before
  if (kind === "catalog_from_photos") throw new Error("ai jobs: catalog_from_photos has no stage plan yet");
  if (kind === "probe") {
    const i = isRecord(input) ? input : {};
    return probePlan(typeof i.totalMs === "number" ? i.totalMs : PROBE_TOTAL_MS, typeof i.stageMs === "number" ? i.stageMs : PROBE_STAGE_MS);
  }
  return stagePlanFor(kind, input, probe);
}

/** The pulse's window (core §I.4): a `since` older than 10 min is clamped to it; absent or invalid → now − 30 s. */
export const PULSE_SINCE_MAX_MS = 10 * 60_000;
export const PULSE_SINCE_DEFAULT_MS = 30_000;

export function clampSince(since: Date | null | undefined, now: Date = new Date()): Date {
  const t = since instanceof Date ? since.getTime() : NaN;
  if (!Number.isFinite(t)) return new Date(now.getTime() - PULSE_SINCE_DEFAULT_MS);
  return new Date(Math.min(now.getTime(), Math.max(now.getTime() - PULSE_SINCE_MAX_MS, t)));
}

/* ------------------------------------------------------------------ */
/* The job state machine                                               */
/* ------------------------------------------------------------------ */

export type JobStatus = "queued" | "running" | "done" | "failed" | "cancelled";
export type JobDriver = "after" | "poll" | "cron" | "batch";

/** The `ai_jobs` columns the machine reads and writes (times in epoch ms). */
export interface JobState {
  status: JobStatus;
  /** "1" while queued or running, null in every terminal status (aj_active_uq, ENGP-3) */
  active: "1" | null;
  /** the stage holding the lease, "batch:<id>" while a one-item batch owns it, null between stages */
  stage: string | null;
  progress: { done: number; total: number; stages: Record<string, "done" | "running" | "failed">; plan: string[] };
  stageAttempts: number;
  driver: JobDriver | null;
  leaseUntil: number | null;
  heartbeatAt: number | null;
  createdAt: number;
  /** the last poll or after() activity (for the driverless rule) */
  drivenAt: number | null;
  error: string | null;
  doneAt: number | null;
}

export type JobEvent =
  /** a driver asks for the next stage; "cron" only hands it to a one-item batch, never runs it (CRIT2-3) */
  | { type: "claim"; driver: "after" | "poll" | "cron"; now: number; deadlineMs?: number }
  | { type: "heartbeat"; now: number }
  /** the claimed stage finished and its output is persisted (before the lease is released) */
  | { type: "stage_done"; stage: string; now: number }
  | { type: "stage_failed"; stage: string; error: string; now: number }
  /** a poll that found nothing to run still counts as a driver being there */
  | { type: "polled"; now: number }
  /** the cron's slot 4c sweep: stale leases, twice-orphaned stages, expired queued rows */
  | { type: "sweep"; now: number }
  | { type: "cancel"; now: number };

export type JobEffect =
  | { kind: "none"; why: "running" | "terminal" | "done" | "not_driverless" | "stale_stage" }
  | { kind: "claimed"; stage: string; leaseUntil: number | null; resumed: boolean; flags: "stage_resumed"[] }
  | { kind: "batched"; stage: string }
  | { kind: "progressed"; done: number; total: number }
  | { kind: "finished" }
  | { kind: "lease_cleared"; stage: string }
  /** reconcile at the usage known, keep `result.instant`, notify the requester */
  | { kind: "failed"; error: string }
  | { kind: "cancelled" }
  | { kind: "touched" };

export const TERMINAL: ReadonlySet<JobStatus> = new Set<JobStatus>(["done", "failed", "cancelled"]);

/** The row `enqueueAiJob` inserts (AI-§B.13 step 1). */
export function newJobState(plan: StagePlan, now: number): JobState {
  return {
    status: "queued",
    active: "1",
    stage: null,
    progress: { done: 0, total: plan.stages.length, stages: {}, plan: plan.stages.map((s) => s.id) },
    stageAttempts: 0,
    driver: null,
    leaseUntil: null,
    heartbeatAt: null,
    createdAt: now,
    drivenAt: null,
    error: null,
    doneAt: null,
  };
}

const isBatchStage = (stage: string | null) => stage !== null && stage.startsWith("batch:");
const baseStage = (stage: string) => (stage.startsWith("batch:") ? stage.slice(6) : stage);
const nextStage = (s: JobState) => s.progress.plan.find((id) => s.progress.stages[id] !== "done") ?? null;

function terminal(s: JobState, status: "done" | "failed" | "cancelled", now: number, error: string | null): JobState {
  return { ...s, status, active: null, leaseUntil: null, error, doneAt: status === "done" ? now : s.doneAt };
}

/** One transition; pure (the input is never mutated). */
export function jobTransition(s: JobState, e: JobEvent): { next: JobState; effect: JobEffect } {
  if (TERMINAL.has(s.status)) return { next: s, effect: { kind: "none", why: "terminal" } };
  switch (e.type) {
    case "claim": {
      if (isBatchStage(s.stage)) return { next: s, effect: { kind: "none", why: "running" } };
      if (s.leaseUntil !== null && s.leaseUntil > e.now) return { next: s, effect: { kind: "none", why: "running" } };
      const id = nextStage(s);
      if (id === null) return { next: terminal(s, "done", e.now, null), effect: { kind: "finished" } };
      const reclaim = s.stage === id && s.progress.stages[id] === "running";
      if (e.driver === "cron") {
        const last = s.drivenAt ?? s.createdAt;
        if (e.now - last < DRIVERLESS_AFTER_MS) return { next: s, effect: { kind: "none", why: "not_driverless" } };
        const stage = `batch:${id}`;
        const next: JobState = {
          ...s,
          status: "running",
          stage,
          driver: "cron",
          leaseUntil: null,
          heartbeatAt: e.now,
          stageAttempts: reclaim ? s.stageAttempts + 1 : 0,
          progress: { ...s.progress, stages: { ...s.progress.stages, [id]: "running" } },
        };
        return { next, effect: { kind: "batched", stage } };
      }
      const leaseUntil = e.now + Math.min(e.deadlineMs ?? STAGE_DEADLINE_MS, STAGE_DEADLINE_MS) + LEASE_MARGIN_MS;
      const next: JobState = {
        ...s,
        status: "running",
        stage: id,
        driver: e.driver,
        leaseUntil,
        heartbeatAt: e.now,
        drivenAt: e.now,
        stageAttempts: reclaim ? s.stageAttempts + 1 : 0,
        progress: { ...s.progress, stages: { ...s.progress.stages, [id]: "running" } },
      };
      return { next, effect: { kind: "claimed", stage: id, leaseUntil, resumed: reclaim, flags: e.driver === "after" ? [] : ["stage_resumed"] } };
    }
    case "heartbeat":
      if (s.status !== "running" || s.stage === null) return { next: s, effect: { kind: "none", why: "stale_stage" } };
      return { next: { ...s, heartbeatAt: e.now }, effect: { kind: "touched" } };
    case "polled":
      return { next: { ...s, drivenAt: e.now }, effect: { kind: "touched" } };
    case "stage_done": {
      const id = baseStage(e.stage);
      if (s.stage === null || baseStage(s.stage) !== id) return { next: s, effect: { kind: "none", why: "stale_stage" } };
      const stages = { ...s.progress.stages, [id]: "done" as const };
      const done = s.progress.plan.filter((x) => stages[x] === "done").length;
      const progressed: JobState = {
        ...s,
        stage: null,
        leaseUntil: null,
        stageAttempts: 0,
        driver: isBatchStage(s.stage) ? "batch" : s.driver,
        progress: { ...s.progress, done, stages },
      };
      if (done >= s.progress.total) return { next: terminal(progressed, "done", e.now, null), effect: { kind: "finished" } };
      return { next: progressed, effect: { kind: "progressed", done, total: s.progress.total } };
    }
    case "stage_failed": {
      const id = baseStage(e.stage);
      if (s.stage === null || baseStage(s.stage) !== id) return { next: s, effect: { kind: "none", why: "stale_stage" } };
      const failed = { ...s, progress: { ...s.progress, stages: { ...s.progress.stages, [id]: "failed" as const } } };
      return { next: terminal(failed, "failed", e.now, e.error.slice(0, 200)), effect: { kind: "failed", error: e.error.slice(0, 200) } };
    }
    case "sweep": {
      if (s.status === "queued" && s.drivenAt === null && e.now - s.createdAt > QUEUED_EXPIRY_MS) {
        return { next: terminal(s, "failed", e.now, "expired"), effect: { kind: "failed", error: "expired" } };
      }
      // rows owned by ai.batches are skipped; only a running stage with a stale heartbeat is an orphan
      if (s.status !== "running" || s.stage === null || isBatchStage(s.stage)) return { next: s, effect: { kind: "none", why: "running" } };
      if (s.heartbeatAt !== null && e.now - s.heartbeatAt <= ORPHAN_AFTER_MS) return { next: s, effect: { kind: "none", why: "running" } };
      if (s.stageAttempts >= 1) {
        const error = `orphaned:${s.stage}`;
        const failed = { ...s, progress: { ...s.progress, stages: { ...s.progress.stages, [s.stage]: "failed" as const } } };
        return { next: terminal(failed, "failed", e.now, error), effect: { kind: "failed", error } };
      }
      // the stage keeps its id and "running" mark, so the next driver re-claims the same stage (stageAttempts → 1)
      return { next: { ...s, leaseUntil: null }, effect: { kind: "lease_cleared", stage: s.stage } };
    }
    case "cancel":
      return { next: terminal(s, "cancelled", e.now, null), effect: { kind: "cancelled" } };
  }
}
