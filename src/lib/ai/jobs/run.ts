import "server-only";
/**
 * The drivers of a detached AI job (P7 AI; ai.md AI-§B.13 steps 1-3, AI-§B.11; docs/STORE-SAAS.md D56, §H.12 rules
 * 1-3 and 6). Two drivers run stages, whichever comes first, through `advanceJob`:
 *   - the poll request (`GET /api/app/<h>/ai/jobs/<id>`, same-origin, `maxDuration = 360`): `advanceJob(scope, id,
 *     "poll", 90_000)` claims the next stage when no live lease exists, runs it inside the request and answers the
 *     view it reached; a second tab gets `{ none: "running" }` at once and keeps polling;
 *   - `after()` of the creating request, only when the release flag `ai_detached_jobs` is on (and the `ai-no-after`
 *     seam is off): `runDetachedJob` runs stage after stage until the deadline it is given.
 * The cron is the third driver (./recover.ts): it never runs a stage, it hands a driverless one to a batch.
 *
 * One stage = one claim (./claim.ts) → one model call through `runServerTask` (pattern B, prepaid: the job reserved
 * every stage at creation) → its output persisted with the lease released in the same statement. A 10 s timer
 * refreshes `heartbeat_at` while the call runs, each beat a fresh pool statement: no pooled connection and no
 * transaction is held across a model call (core §H.12 rule 2, AI-§B.11). A stage refused for a passing reason (the
 * kill switch, busy, overloaded, rate limited, the driver's own deadline) releases its lease and waits for the next
 * driver; any other failure fails the job with the instant result kept.
 */
import { after } from "next/server";
import { testSeam } from "@/lib/security/test-seams";
import { notify } from "@/lib/platform/notify";
import { scopedCache } from "@/lib/tenancy/cache";
import { getStoreById } from "@/lib/tenancy/public";
import type { Actor, StoreScope, WriteScope } from "@/lib/tenancy/types";
import type { AiFailCode } from "../provider/types";
import { runServerTask } from "../router/run.server";
import { aiFlagsFor } from "../server/flags";
import { casJob, getAiJob, heartbeatJob, leaseCond, readJob, toView, touchJob, type AiJobView, type JobRow } from "../store/jobs";
import type { RunStage } from "../store/runs";
import type { AiTaskId } from "../tasks";
import { claimStage, completeStage, driverScope, failJob, planOf } from "./claim";
import { HEARTBEAT_MS, TERMINAL, stageInputOf, type PlannedStage } from "./stages";

/** The route handlers that may start or drive a job export this (core D56, `after()` lives at most this long). */
export const JOB_ROUTE_MAX_DURATION_S = 360;
/** The poll driver's budget: one stage ≤ 90 s inside the proxy's ≈ 120 s cut (the browser waits ≤ 95 s). */
export const POLL_BUDGET_MS = 90_000;
/** `after()`'s budget: maxDuration − 15 s (AI-§B.13 step 3). */
export const AFTER_BUDGET_MS = JOB_ROUTE_MAX_DURATION_S * 1000 - 15_000;
/** a driver does not start a stage with less than this left of its budget */
const MIN_STAGE_BUDGET_MS = 20_000;

/** The seams the tests replace: `after()` (a spy proves who schedules it) and a trace of the driver calls. */
export const jobDeps: {
  after: (fn: () => Promise<void>) => void;
  trace: ((event: "advance" | "after" | "stage", jobId: string, detail?: string) => void) | null;
} = {
  after: (fn) => after(fn),
  trace: null,
};

/** Codes after which the stage simply waits for the next driver (nothing is wrong with the job). */
const DEFER: ReadonlySet<AiFailCode> = new Set<AiFailCode>(["kill", "busy", "provider_overloaded", "rate_limited", "cancelled"]);

const RUN_STAGE_OF: Record<string, RunStage> = { brief: "plan", critique: "critique", verify: "verify", blueprint: "blueprint", logo: "logo", report: "report" };

function actorOf(row: JobRow): Actor {
  return row.createdBy ? { kind: "user", userId: row.createdBy, impersonatorId: null, ip: null } : { kind: "system", userId: null, impersonatorId: null, ip: null };
}

type StageResult = { ok: true; output: unknown; runId: string | null } | { ok: false; code: AiFailCode; runId: string | null };

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => (clearTimeout(t), resolve()), { once: true });
  });

/** One stage's work: a model task (pattern B, prepaid), or the probe's model-free sleep. */
async function runStageWork(ws: WriteScope, row: JobRow, stage: PlannedStage, budgetMs: number, signal: AbortSignal, driver: "after" | "poll"): Promise<StageResult> {
  if (stage.task === "probe.sleep") {
    const started = Date.now();
    await sleep(Math.max(0, Math.min(stage.deadlineMs, budgetMs) - 1_000), signal);
    return { ok: true, output: { sleptMs: Date.now() - started }, runId: null };
  }
  const input = stageInputOf(stage.id, (row.result as { input?: unknown } | null)?.input);
  const out = await runServerTask(ws, stage.task as AiTaskId, input as never, {
    actor: actorOf(row),
    surface: "system",
    pattern: "B",
    jobId: row.id,
    stage: RUN_STAGE_OF[stage.id.split(":")[0]!] ?? null,
    prepaid: true,
    passCharged: true,
    ladder: "server-only",
    // a job is the owner's explicit request for a fresh pass: never served from ai_cache
    nonce: row.id,
    signal,
    // AI-§B.13 step 3: a stage a poll advanced is flagged, so the console sees how much after() contributes
    ...(driver === "poll" ? { flags: ["stage_resumed"] as const } : {}),
  });
  return out.ok ? { ok: true, output: out.value, runId: out.runId } : { ok: false, code: out.code, runId: out.runId };
}

/* ------------------------------------------------------------------ */
/* The poll re-claim alarm (AI-§O: after() never survives on this host) */
/* ------------------------------------------------------------------ */

const reclaims = scopedCache<number>({ name: "ai-job-poll-reclaims", maxEntries: 4, ttlMs: 3_600_000 });

async function countPollReclaim(now: Date): Promise<void> {
  const hour = now.toISOString().slice(0, 13);
  const n = (reclaims.get("p", hour) ?? 0) + 1;
  reclaims.set("p", hour, n);
  if (n === 4) {
    await notify({ audience: "platform_staff", minRole: "admin" }, "ai.after_driver_missing", { reclaims: n }, { severity: "info", dedupeKey: `ai.after_driver_missing:${hour}`, link: "/admin/ai" });
  }
}

/* ------------------------------------------------------------------ */
/* advanceJob                                                          */
/* ------------------------------------------------------------------ */

async function advanceOnce(scope: StoreScope, jobId: string, driver: "after" | "poll", budgetMs: number): Promise<{ view: AiJobView | null; ran: boolean }> {
  jobDeps.trace?.("advance", jobId, driver);
  const ws = driverScope(scope);
  if (budgetMs < MIN_STAGE_BUDGET_MS) return { view: await getAiJob(ws, jobId), ran: false };
  const now = new Date();
  const claim = await claimStage(ws, jobId, driver, now);
  if ("none" in claim || claim.batched) {
    // a poll that finds the job running or waiting is still a driver being there (the driverless rule)
    if (driver === "poll" && "none" in claim && claim.none === "running") await touchJob(ws, jobId, new Date());
    return { view: await getAiJob(ws, jobId), ran: false };
  }
  if (claim.resumed && driver === "poll") await countPollReclaim(now);
  const row = await readJob(ws, jobId);
  const stage = row ? (planOf(row).find((s) => s.id === claim.stage) ?? null) : null;
  if (!row || !stage) return { view: row ? toView(row) : null, ran: false };
  jobDeps.trace?.("stage", jobId, `${driver}:${stage.id}`);
  const ctl = new AbortController();
  const deadline = setTimeout(() => ctl.abort(), Math.min(stage.deadlineMs, budgetMs));
  const beat = setInterval(() => {
    void heartbeatJob(ws, jobId, stage.id, new Date()).catch(() => undefined);
  }, HEARTBEAT_MS);
  let res: StageResult;
  try {
    res = await runStageWork(ws, row, stage, Math.min(stage.deadlineMs, budgetMs), ctl.signal, driver);
  } catch (err) {
    console.error(`[ai] job stage threw: ${err instanceof Error ? err.name : "error"}`);
    res = { ok: false, code: "unknown", runId: null };
  } finally {
    clearTimeout(deadline);
    clearInterval(beat);
  }
  // the row as the claim left it (the heartbeats never touch updated_at)
  const claimed = await readJob(ws, jobId);
  if (!claimed) return { view: null, ran: true };
  if (res.ok) {
    await completeStage(ws, claimed, stage.id, { output: res.output, runId: res.runId }, { lease: claim.lease });
  } else if (DEFER.has(res.code)) {
    const stages = { ...(claimed.progress?.stages ?? {}) };
    delete stages[stage.id];
    await casJob(ws, { id: jobId, updatedAt: null }, { stage: null, leaseUntil: null, progress: claimed.progress ? { ...claimed.progress, stages } : claimed.progress }, new Date(), leaseCond(stage.id, claim.lease));
  } else {
    await failJob(ws, claimed, `${res.code}:${stage.id}`, new Date(), { cond: leaseCond(stage.id, claim.lease) });
  }
  return { view: await getAiJob(ws, jobId), ran: true };
}

/**
 * Runs the next stage when no live lease exists, inside the caller's request (AI-§B.13 step 3); returns the view
 * the poll answers with (null for a missing id or another store's). There is no cron driver.
 */
export async function advanceJob(scope: StoreScope, jobId: string, driver: "after" | "poll", budgetMs: number): Promise<AiJobView | null> {
  return (await advanceOnce(scope, jobId, driver, budgetMs)).view;
}

/** The `after()` driver: stage after stage until `budgetMs` is spent or nothing is left; never throws. */
export async function runDetachedJob(scope: StoreScope, jobId: string, budgetMs: number = AFTER_BUDGET_MS): Promise<void> {
  const end = Date.now() + budgetMs;
  try {
    for (let i = 0; i < 12; i++) {
      const left = end - Date.now();
      if (left < MIN_STAGE_BUDGET_MS) return;
      const { view, ran } = await advanceOnce(scope, jobId, "after", left);
      if (!ran || !view || TERMINAL.has(view.status)) return;
    }
  } catch (err) {
    console.error(`[ai] detached job driver failed: ${err instanceof Error ? err.name : "error"}`);
    try {
      const ws = driverScope(scope);
      const row = await readJob(ws, jobId);
      if (row && !TERMINAL.has(row.status) && !row.leaseUntil) await failJob(ws, row, "driver_error");
    } catch {
      // the next poll or the sweep takes the job over
    }
  }
}

/**
 * The free first driver (AI-§B.13 step 1): `after(() => runDetachedJob(…))` when the flag `ai_detached_jobs` is on
 * for this store and user and the `ai-no-after` seam is off. Returns whether it was scheduled. Never called by the
 * recovery path. `force` (the detached-job probe only) skips the flag: the probe is what sets it.
 */
export async function scheduleDetachedJob(scope: StoreScope, jobId: string, userId: string | null, opts: { force?: boolean } = {}): Promise<boolean> {
  if (testSeam("ai-no-after")) return false;
  if (!opts.force) {
    const store = await getStoreById(scope.storeId);
    if (!store) return false;
    const flags = await aiFlagsFor({ storeId: scope.storeId, userId, store, platformRole: null });
    if (!flags.has("ai_detached_jobs")) return false;
  }
  jobDeps.trace?.("after", jobId);
  jobDeps.after(() => runDetachedJob(scope, jobId, AFTER_BUDGET_MS));
  return true;
}
