import "server-only";
/**
 * The bodies of the AI route handlers (P7 AI; ai.md AI-§A.7, AI-§A.8.5, AI-§B.13 steps 1 and 3; docs/STORE-SAAS.md
 * §C.9, §E.2, §H.12 rules 1-6, D56, D70). Each `src/app/api/app/[store]/ai/**` file is `storeGuard(req, handle,
 * "ai.use")` and one of these, so the tests drive the same code with a store context (test:ai-db, the tenancy cases).
 * The guard refuses an impersonating session (`impersonation_read_only`, audited) on every method before any of this
 * runs, so no counter moves for it, and its same-origin rule covers every POST (core §C.9).
 *
 *   handleTask       POST /ai/[task]: the envelope, then the task (unknown, hidden or Director → the neutral 404), the
 *                    store's local-only mode (`store_local_only`, before any provider work), then by pattern:
 *                    B → `enqueueAiJob` → `202 { jobId }`; a stream task → NDJSON or, with `streamTransport = poll`,
 *                    `202 { runId }` with the call continuing in `after()`; any other → `200` JSON.
 *   handleDirector   POST /ai/director/{plan,critique,verify}: the same with the pass of the wizard session (410
 *                    `pass_superseded` once a newer pass started, before the stage and after it), the pass counter
 *                    charged by the first stage that reserves, and the critique as the first stage of a job when probe
 *                    line 11 measured the interactive Director below 80 tok/s.
 *   handleRunPoll    GET /ai/runs/[id]?after=<seq>: the run buffer, or the run row's end once the buffer expired.
 *   handleJobPoll    GET /ai/jobs/[id]?advance=1: a same-origin fetch claims and runs the next stage inside the request
 *                    (≤ 90 s); `advance=0`, or no `Sec-Fetch-Site: same-origin`, reads only.
 *   handleJobCancel  POST /ai/jobs/[id]/cancel: `204` whatever the id names (another store's job is untouched).
 *   handleReport     POST /ai/report: local-run telemetry rows (`provider = local`, 0 credits), 120 / h per member.
 *
 * Every run goes through `runServerTask` with the `server-only` ladder: the browser walks the rest of its ladder (local,
 * then the library) itself, AI-§A.4.
 */
import { after } from "next/server";
import { z } from "zod";
import { CURRENT_RELEASE } from "@/lib/auth/permissions";
import { getPlatformSetting, getStoreSetting } from "@/lib/settings";
import { rateLimit } from "@/lib/security/rate-limit";
import type { StoreCtx } from "@/lib/tenancy/types";
import { cancelAiJob, enqueueAiJob, getAiJob, type AiJobKind } from "../jobs/enqueue";
import { POLL_BUDGET_MS, advanceJob } from "../jobs/run";
import { critiqueRunsAsJob } from "../jobs/stages";
import type { AiFailure, AiResult, AiTaskInput } from "../provider/types";
import { AI_RATES, aiReportBucket } from "../quota/buckets";
import { creditsFor } from "../quota/cost";
import { runServerTask, type ServerTaskOpts } from "../router/run.server";
import { writeScopeOf } from "@/lib/tenancy/seam";
import { aiFlagsFor } from "../server/flags";
import { getRunFinal, insertReportRows, LocalReport } from "../store/runs";
import type { AiJobView } from "../store/jobs";
import type { AiStreamEvent } from "../stream/events";
import { TASKS, isAiTaskId, liveTasks, type AiTaskId } from "../tasks";
import { DirectorEnvelopeZ, TaskEnvelopeZ, failResponse, gone, json, noContent, notFound, readEnvelope } from "./respond";
import { beginStage, isSuperseded, markCharged } from "./passes";
import { RUN_BUFFER_TTL_MS, RunBufferSink, emitOutcome, ndjsonResponse, readRunBuffer, recordBufferedTransport } from "./transport";

/**
 * The seams the scripts replace: `after()` outside a request (test:ai-db, ai-stream-check) and the stream's cap
 * (ai-stream-check cuts a slow stub at a few seconds instead of `STREAM_CAP_MS`).
 */
export const httpDeps: { after: (fn: () => Promise<void>) => void; streamCapMs: number | null } = {
  after: (fn) => after(fn),
  streamCapMs: null,
};

const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/** The Director stages, each with its own route (`[task]` answers them the neutral 404). */
const DIRECTOR_STAGE_TASK = { plan: "design.plan", critique: "design.critique", verify: "design.verify" } as const satisfies Record<string, AiTaskId>;
export type DirectorStage = keyof typeof DIRECTOR_STAGE_TASK;
const DIRECTOR_TASKS: ReadonlySet<AiTaskId> = new Set(Object.values(DIRECTOR_STAGE_TASK));

/** The job kind a pattern-B task creates through `[task]`. */
const JOB_KIND_OF: Partial<Record<AiTaskId, AiJobKind>> = { "store.blueprint": "store_blueprint", "logo.system": "logo_system" };

/** A browser may start a task with a server rung, run as pattern A or B, paid by the store (never a batch-only one). */
function browserTask(id: string | undefined): AiTaskId | null {
  if (!id || !isAiTaskId(id) || DIRECTOR_TASKS.has(id)) return null;
  const def = TASKS[id];
  if (!def.class || (def.pattern !== "A" && def.pattern !== "B") || def.payer !== "store") return null;
  if (def.pattern === "B" && !JOB_KIND_OF[id]) return null;
  return id;
}

/** Whether the task is visible to this member of this store (release, flag, the console's route switch). */
async function isLive(ctx: StoreCtx, task: AiTaskId): Promise<boolean> {
  const [settings, flags] = await Promise.all([getPlatformSetting("platform_ai"), aiFlagsFor({ storeId: ctx.store.id, userId: ctx.user.id, store: ctx.store, platformRole: null })]);
  return liveTasks(CURRENT_RELEASE, flags as ReadonlySet<string>, settings.routes).includes(task);
}

/** `store_ai.mode = "local"`: the store never sends anything to the cloud (AI-§A.4), refused before any provider work. */
async function localOnly(ctx: StoreCtx): Promise<boolean> {
  try {
    return (await getStoreSetting(ctx.scope, "store_ai")).mode === "local";
  } catch {
    return false;
  }
}

function baseOpts(ctx: StoreCtx, surface: ServerTaskOpts["surface"], nonce: string | undefined): ServerTaskOpts {
  return { actor: ctx.actor, surface, ladder: "server-only", ...(nonce ? { nonce } : {}) };
}

const failOf = (out: AiFailure) => failResponse(out.code, { retryable: out.retryable, ...(out.retryAfterSec !== undefined ? { retryAfterSec: out.retryAfterSec } : {}) });

/* ------------------------------------------------------------------ */
/* POST /ai/[task]                                                     */
/* ------------------------------------------------------------------ */

export async function handleTask(ctx: StoreCtx, req: Request, taskParam: string | undefined): Promise<Response> {
  const env = await readEnvelope(req, TaskEnvelopeZ);
  if (!env.ok) return env.response;
  const task = browserTask(taskParam);
  if (!task || !(await isLive(ctx, task))) return notFound();
  if (await localOnly(ctx)) return failResponse("store_local_only");
  const { input, surface, nonce } = env.value;
  const def = TASKS[task];
  if (def.pattern === "B") {
    const r = await enqueueAiJob(ctx, { kind: JOB_KIND_OF[task]!, task, input });
    return r.ok ? json({ ok: true, jobId: r.jobId, deduped: r.deduped }, 202) : failResponse(r.code);
  }
  const opts = baseOpts(ctx, surface, nonce);
  if (def.stream && def.call === "stream" && env.value.stream !== false) {
    const transport = (await getPlatformSetting("platform_ai")).streamTransport;
    return transport === "poll" ? pollRun(ctx, task, input, opts) : streamRun(ctx, task, input, opts, req.signal);
  }
  const out = await runServerTask(ctx.scope, task, input as AiTaskInput<typeof task>, { ...opts, signal: req.signal });
  if (!out.ok) return failOf(out);
  return json({ ok: true, value: out.value, rejected: out.rejected, provider: out.provider, class: out.class, model: out.model, runId: out.runId, credits: out.usage?.credits ?? 0, flags: out.flags });
}

/** The NDJSON transport: start, fields as the guard passes them, the model fallbacks, then final (or error). */
function streamRun(ctx: StoreCtx, task: AiTaskId, input: unknown, opts: ServerTaskOpts, signal: AbortSignal): Response {
  return ndjsonResponse(
    async (emit, upstream) => {
      const out = await runServerTask(ctx.scope, task, input as never, {
        ...opts,
        signal: upstream,
        onStart: (e) => emit({ t: "start", runId: e.runId, provider: "server", class: e.class, model: e.model, effort: e.effort }),
        onField: (path, value) => emit({ t: "field", path, value }),
        onFieldRejected: (path) => emit({ t: "field_rejected", path }),
        onProgress: (p) => emit({ t: "progress", ...p }),
      });
      emitOutcome(emit, out as AiResult<unknown> | AiFailure);
    },
    { signal, ...(httpDeps.streamCapMs ? { capMs: httpDeps.streamCapMs } : {}) },
  );
}

/**
 * The poll transport: `202 { runId }` as soon as the run row exists (reserved, inserted), the call continuing in
 * `after()` with its events in the run buffer. A run that ends before it has a row (a refusal at the gate, a cache
 * hit) answers at once: the failure, or `202` with the cache row's buffer already done.
 */
async function pollRun(ctx: StoreCtx, task: AiTaskId, input: unknown, opts: ServerTaskOpts): Promise<Response> {
  const sink = new RunBufferSink(ctx.store.id);
  let started: (id: string) => void = () => undefined;
  const startedP = new Promise<string>((resolve) => (started = resolve));
  const run = runServerTask(ctx.scope, task, input as never, {
    ...opts,
    onStart: (e) => {
      sink.open(e.runId);
      sink.emit({ t: "start", runId: e.runId, provider: "server", class: e.class, model: e.model, effort: e.effort });
      started(e.runId);
    },
    onField: (path, value) => sink.emit({ t: "field", path, value }),
    onFieldRejected: (path) => sink.emit({ t: "field_rejected", path }),
    onProgress: (p) => sink.emit({ t: "progress", ...p }),
  }).then((out) => {
    emitOutcome(sink.emit, out as AiResult<unknown> | AiFailure);
    return out;
  });
  const first = await Promise.race([startedP.then((runId) => ({ runId, out: null })), run.then((out) => ({ runId: null, out }))]);
  if (first.runId) {
    httpDeps.after(async () => void (await run.catch(() => undefined)));
    return json({ ok: true, runId: first.runId }, 202);
  }
  const out = first.out!;
  if (!out.ok || !out.runId) return out.ok ? failResponse("unknown") : failOf(out);
  sink.open(out.runId);
  return json({ ok: true, runId: out.runId }, 202);
}

/* ------------------------------------------------------------------ */
/* POST /ai/director/{plan,critique,verify}                            */
/* ------------------------------------------------------------------ */

export async function handleDirector(ctx: StoreCtx, req: Request, stage: DirectorStage): Promise<Response> {
  const env = await readEnvelope(req, DirectorEnvelopeZ);
  if (!env.ok) return env.response;
  const task = DIRECTOR_STAGE_TASK[stage];
  if (!(await isLive(ctx, task))) return notFound();
  if (await localOnly(ctx)) return failResponse("store_local_only");
  const { input, pass, surface, nonce } = env.value;
  const storeId = ctx.store.id;
  const verdict = beginStage(storeId, ctx.user.id, pass);
  if (!verdict.ok) return gone("pass_superseded");
  if (stage === "critique" && critiqueRunsAsJob((await getPlatformSetting("platform_ai")).probe)) {
    // AI-§A.8.6 (3): below 80 tok/s the critique is the first stage of a job (pattern B), polled like the deep pass
    const r = await enqueueAiJob(ctx, { kind: "director_deep", task, input: { critique: input, passCharged: verdict.charged } });
    if (r.ok && !r.deduped) markCharged(storeId, ctx.user.id, pass);
    return r.ok ? json({ ok: true, jobId: r.jobId, deduped: r.deduped, stage }, 202) : failResponse(r.code);
  }
  const out = await runServerTask(ctx.scope, task, input as AiTaskInput<typeof task>, {
    ...baseOpts(ctx, surface, nonce),
    passCharged: verdict.charged,
    signal: req.signal,
    onStart: () => markCharged(storeId, ctx.user.id, pass),
  });
  // a newer pass started while this stage ran: its result is ignored (AI-19 acceptance 3); the run is billed as it ran
  if (isSuperseded(storeId, ctx.user.id, pass)) return gone("pass_superseded");
  if (!out.ok) return failOf(out);
  return json({ ok: true, value: out.value, runId: out.runId, credits: out.usage?.credits ?? 0, flags: out.flags, stage });
}

/* ------------------------------------------------------------------ */
/* GET /ai/runs/[id]                                                   */
/* ------------------------------------------------------------------ */

const AfterZ = z.coerce.number().int().min(-1).max(1_000_000).catch(-1);

export async function handleRunPoll(ctx: StoreCtx, req: Request, id: string | undefined): Promise<Response> {
  if (!id || !ULID_RE.test(id)) return notFound();
  const after = AfterZ.parse(new URL(req.url).searchParams.get("after") ?? -1);
  const buffered = readRunBuffer(ctx.store.id, id, after);
  if (buffered) return json(buffered);
  // the buffer expired (or never existed in this process): the run row's end, if the store has that run
  const row = await getRunFinal(ctx.scope, id);
  if (!row) return notFound();
  if (row.status === "running") {
    const fresh = Date.now() - Date.parse(row.at) < RUN_BUFFER_TTL_MS;
    if (fresh) return json({ events: [], done: false });
    return json({ events: [{ s: 0, t: "error", code: "timeout", retryable: true }] satisfies AiStreamEvent[], done: true });
  }
  const end: AiStreamEvent =
    row.status === "ok"
      ? { s: 0, t: "final", runId: row.id, value: row.output, rejected: row.rejected, credits: row.credits, ms: row.ms ?? 0, flags: row.flags }
      : { s: 0, t: "error", code: errorCodeOf(row.errorCode, row.status), retryable: false };
  return json({ events: [end], done: true });
}

function errorCodeOf(code: string | null, status: string): Extract<AiStreamEvent, { t: "error" }>["code"] {
  const known = ["refused", "invalid_output", "max_tokens", "timeout", "cancelled", "busy", "provider_error", "provider_overloaded", "quota_store", "quota_day", "quota_platform", "pii_blocked", "input_invalid"] as const;
  const c = (code ?? status) as (typeof known)[number];
  return known.includes(c) ? c : status === "quota" ? "quota_store" : status === "blocked" ? "pii_blocked" : "unknown";
}

/* ------------------------------------------------------------------ */
/* GET /ai/jobs/[id], POST /ai/jobs/[id]/cancel                        */
/* ------------------------------------------------------------------ */

/** What the job poll answers (AI-§A.7): metadata, the stage plan, the result once done; never the job's input. */
export function jobBody(v: AiJobView) {
  return {
    ok: true as const,
    id: v.id,
    kind: v.kind,
    status: v.status,
    stage: v.stage,
    progress: v.progress,
    heartbeatAt: v.heartbeatAt,
    driver: v.driver,
    result: v.result,
    outputs: v.outputs,
    error: v.error,
    costCredits: creditsFor(v.costMicros),
    createdAt: v.createdAt,
  };
}

/** Whether this poll may drive the job (rev 4): asked (`advance` not 0), a same-origin browser fetch, a member scope. */
export function pollDrives(ctx: StoreCtx, req: Request): boolean {
  const advance = new URL(req.url).searchParams.get("advance") !== "0";
  return advance && req.headers.get("sec-fetch-site") === "same-origin" && !ctx.impersonation && ctx.scope.kind === "member";
}

export async function handleJobPoll(ctx: StoreCtx, req: Request, id: string | undefined): Promise<Response> {
  if (!id || !ULID_RE.test(id)) return notFound();
  const drive = pollDrives(ctx, req);
  if (drive && (await localOnly(ctx))) return failResponse("store_local_only");
  const view = drive ? await advanceJob(ctx.scope, id, "poll", POLL_BUDGET_MS) : await getAiJob(ctx.scope, id);
  return view ? json(jobBody(view)) : notFound();
}

export async function handleJobCancel(ctx: StoreCtx, id: string | undefined): Promise<Response> {
  if (id && ULID_RE.test(id)) await cancelAiJob(ctx, id);
  return noContent();
}

/* ------------------------------------------------------------------ */
/* POST /ai/report                                                     */
/* ------------------------------------------------------------------ */

const ReportBodyZ = z.union([LocalReport, z.strictObject({ reports: z.array(LocalReport).min(1).max(20) })]);

export async function handleReport(ctx: StoreCtx, req: Request): Promise<Response> {
  const ws = writeScopeOf(ctx.scope);
  if (!ws) return failResponse("state");
  const gate = await rateLimit(aiReportBucket(ctx.scope, ctx.user.id), AI_RATES.report.limit, AI_RATES.report.windowSec);
  if (!gate.ok) return failResponse("rate_limited", { retryAfterSec: gate.retryAfter });
  const env = await readEnvelope(req, ReportBodyZ);
  if (!env.ok) return env.response;
  const rows = "reports" in env.value ? env.value.reports : [env.value];
  await insertReportRows(ws, ctx.user.id, rows);
  if (new URL(req.url).searchParams.get("buffered") === "1") await recordBufferedTransport(ctx.store.id);
  return noContent();
}
