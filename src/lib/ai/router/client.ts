/**
 * The browser rung of the AI router (P7 AI; ai.md AI-§A.7, AI-§A.4, AI-§H.2, AI-D2; docs/STORE-SAAS.md §K.2, §K.3; P0b
 * CCR P2-10). Browser module: no server import. The hook signatures are frozen (src/lib/contracts/r1-p0b-design.ts)
 * because P2 mounts them before P7 merges; the component mounts are P7-11, at the P7 merge.
 *
 *   useAiTask(task, { handle, policy, device })   walks `ladderFor(policy, task, device)` on the client: the server
 *       rung is one POST the server re-checks (NDJSON read over fetch, or `202 { runId }` polled on runs/[id] every
 *       500 ms visible / 1.5 s hidden, or `202 { jobId }` polled as a job), then the local worker
 *       (src/lib/ai/provider/local.ts), then the library (pure, instant). A typed failure that `ladderAdvances` moves
 *       down with a quiet note (`state.notes`, the chip of AI-§K.3); a rung past its deadline (the task's AI-§A.2
 *       deadline + 5 s) is cut as `timeout`. The run aborts on unmount, on a store switch (another handle) and through
 *       `cancelStoreAiJobs`. The library draft never waits: `libraryDraft()` is synchronous, so a surface paints it
 *       before it calls `run`, and AI fields replace it as they arrive.
 *   useDeviceInfo()     capabilities.ts + `userAgentData.mobile` / `pointer: coarse` + `connection.saveData` + whether
 *       the VLM of the device's tier is in the model cache; the conservative profile until it is measured (and on
 *       the server), so nothing downloads before the device is known (D59).
 *   useAiJob(id, ctx)   a pattern-B job polled every 2 s visible / 6 s hidden (each poll may drive one stage,
 *       AI-§B.13), stopping on a terminal status.
 *   cancelStoreAiJobs(storeId)   P2's `clearStoreClientState` calls it on a store switch and at sign-out
 *       (PLA-§22.3): every browser run aborts, the worker cancels its jobs and frees its models, reports are flushed.
 *
 * Stream auto-detection (AI-§A.7): when the `start` line arrives in the same read as `final` for a run that took ≥ 1 s
 * (the proxy buffered the whole body) on 3 runs in a row, the next `/ai/report` carries `buffered=1` and the server
 * switches the platform to the poll transport.
 *
 * The pure cores (`runOnClient`, `pollJob`, `StreamDetector`, `AiReporter`, `deviceFrom`) take their fetch, clock and
 * sleep as arguments, so test:ai drives them with stubs (no React, no network).
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { detectCapabilities } from "../capabilities";
import { getAi, peekAi } from "../client";
import { AI_CACHE_NAME, AI_MODELS, repoOfCacheUrl } from "../models";
import { ladderFor, type AiPolicy, type DeviceInfo } from "../policy";
import { FAIL_CODES, aiFailure, ladderAdvances } from "../provider/failures";
import { LIBRARY_TASKS, libraryResult, libraryValue } from "../provider/library";
import { localProvider, type LocalRunReport } from "../provider/local";
import type { AiFailCode, AiFailure, AiFallbackNote, AiOutcome, AiProvider, AiResult, AiRunContext, AiRunOpts, AiTaskInput, AiTaskOutput } from "../provider/types";
import { NdjsonSplitter, type AiStreamEvent } from "../stream/events";
import { TASKS, type AiProviderId, type AiSurface, type AiTaskId, type Effort, type TaskClass } from "../tasks";
import type { DeviceTier } from "../protocol";
import type { ProductCategory } from "@/lib/page/schema";
import { apiHref } from "@/lib/urls";

/** What a mounted task shows: its run status, the rung that answered, the fallbacks taken, the streamed fields. */
export interface AiTaskState {
  status: "idle" | "running" | "done" | "error";
  provider: AiProviderId | null;
  notes: AiFallbackNote[];
  fields: Record<string, unknown>;
  credits: number | null;
}

const IDLE: AiTaskState = { status: "idle", provider: null, notes: [], fields: {}, credits: null };

/** The run poll (AI-§A.7) and the job poll (AI-§A.8.8), visible / hidden tab. */
export const RUN_POLL_MS = { visible: 500, hidden: 1_500 } as const;
export const JOB_POLL_MS = { visible: 2_000, hidden: 6_000 } as const;
/** the client's margin over a task's server deadline before it cuts the rung itself */
export const CLIENT_DEADLINE_MARGIN_MS = 5_000;
/** a buffered run counts only when the model took this long (a cache hit legitimately arrives at once) */
export const BUFFERED_MIN_MS = 1_000;
/** consecutive buffered runs before `buffered=1` is reported */
export const BUFFERED_RUNS = 3;

type RunOpts = Omit<AiRunOpts, "surface"> & { surface: AiSurface };

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

export const isFailCode = (v: unknown): v is AiFailCode => typeof v === "string" && Object.prototype.hasOwnProperty.call(FAIL_CODES, v);

/** The code of a failed AI route answer whose body names none (a proxy page, the neutral 404). */
export function codeOfStatus(status: number): AiFailCode {
  if (status === 404) return "flag_off";
  if (status === 403) return "disabled";
  if (status === 422) return "input_invalid";
  if (status === 429) return "rate_limited";
  if (status === 503) return "busy";
  if (status === 504) return "timeout";
  if (status === 499) return "cancelled";
  return "provider_error";
}

/** One signal for several (a caller's, the run's own, a deadline); `dispose` detaches the listeners. */
function linkSignals(signals: readonly (AbortSignal | undefined)[]): { signal: AbortSignal; dispose(): void } {
  const ctrl = new AbortController();
  const offs: (() => void)[] = [];
  for (const s of signals) {
    if (!s) continue;
    if (s.aborted) {
      ctrl.abort(s.reason);
      break;
    }
    const on = () => ctrl.abort(s.reason);
    s.addEventListener("abort", on, { once: true });
    offs.push(() => s.removeEventListener("abort", on));
  }
  return { signal: ctrl.signal, dispose: () => offs.forEach((f) => f()) };
}

/** setTimeout as a promise that an abort ends early (never rejects). */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const t = setTimeout(done, ms);
    function done() {
      clearTimeout(t);
      signal?.removeEventListener("abort", done);
      resolve();
    }
    signal?.addEventListener("abort", done, { once: true });
  });
}

const isVisible = () => typeof document === "undefined" || document.visibilityState !== "hidden";

/** A stable seed per input (FNV-1a over its JSON): "Write again" without the cloud stays stable too. */
export function seedFromInput(input: unknown): number {
  let json: string;
  try {
    json = JSON.stringify(input) ?? "";
  } catch {
    json = "";
  }
  let h = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) {
    h ^= json.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % 1_000_000;
}

const categoryOf = (input: unknown): ProductCategory | undefined => (input as { product?: { category?: ProductCategory } })?.product?.category;

/**
 * The library's answer for a task, synchronously (AI-§H.2 "instant draft"): what a surface paints before it calls
 * `run`. null for a task the library has no rung for. WhatsApp lines are left out (GEN-09's safe side) unless the
 * caller knows the store has a number.
 */
export function libraryDraft<T extends AiTaskId>(task: T, input: AiTaskInput<T>, opts: { hasWhatsapp?: boolean } = {}): AiTaskOutput<T> | null {
  if (!LIBRARY_TASKS.has(task)) return null;
  try {
    return libraryValue(task, input, { seed: seedFromInput(input), hasWhatsapp: opts.hasWhatsapp ?? false, category: categoryOf(input) });
  } catch {
    return null;
  }
}

/** The library rung of the browser ladder (pure code: never fails for a task it supports, costs nothing). */
export function clientLibraryProvider(opts: { hasWhatsapp?: boolean } = {}): AiProvider {
  return {
    id: "library",
    supports: (task) => (LIBRARY_TASKS.has(task) ? { ok: true } : { ok: false, code: "unknown" }),
    run: async (task, input) => libraryResult(task, input, { seed: seedFromInput(input), hasWhatsapp: opts.hasWhatsapp ?? false, category: categoryOf(input) }),
  };
}

/* ------------------------------------------------------------------ */
/* Stream auto-detection and the local-run reporter                    */
/* ------------------------------------------------------------------ */

/** Counts buffered stream runs in a row (AI-§A.7 auto-detection). */
export class StreamDetector {
  private run = 0;
  private pending = false;

  /** one finished stream run: `buffered` = `start` came with `final` after real model time; null = cannot tell */
  record(buffered: boolean | null): void {
    if (buffered === null) return;
    if (!buffered) {
      this.run = 0;
      return;
    }
    this.run++;
    if (this.run >= BUFFERED_RUNS) this.pending = true;
  }

  /** whether the next report carries `buffered=1` (read once) */
  take(): boolean {
    const p = this.pending;
    if (p) {
      this.pending = false;
      this.run = 0;
    }
    return p;
  }

  get isPending(): boolean {
    return this.pending;
  }
}

/** Batches local-run telemetry to `POST /api/app/<h>/ai/report` (≤ 20 rows per request, metadata only). */
export class AiReporter {
  private queue: LocalRunReport[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    readonly handle: string,
    private readonly deps: { fetch: typeof fetch; detector: StreamDetector; delayMs?: number },
  ) {}

  add(r: LocalRunReport): void {
    this.queue.push(r);
    if (this.queue.length >= 20) void this.flush();
    else this.timer ??= setTimeout(() => void this.flush(), this.deps.delayMs ?? 1_500);
  }

  get size(): number {
    return this.queue.length;
  }

  async flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    while (this.queue.length) {
      const reports = this.queue.splice(0, 20);
      const buffered = this.deps.detector.take();
      try {
        await this.deps.fetch(`${apiHref(this.handle, "/ai/report")}${buffered ? "?buffered=1" : ""}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reports }),
          credentials: "same-origin",
          keepalive: true,
        });
      } catch {
        // telemetry is best effort: a lost report never surfaces to the seller
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* The server rung: POST, NDJSON, run poll, job poll                   */
/* ------------------------------------------------------------------ */

export interface ClientRunDeps {
  handle: string;
  policy: AiPolicy;
  device: DeviceInfo;
  fetch: typeof fetch;
  /** the worker rung (null: no local provider on this surface) */
  local: AiProvider | null;
  library: AiProvider | null;
  visible: () => boolean;
  sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
  now: () => number;
  detector: StreamDetector;
  /** a fallback taken (the quiet chip) */
  onNote?: (n: AiFallbackNote) => void;
  /** the rung now running */
  onProvider?: (p: AiProviderId) => void;
}

/** The job poll's answer (handlers.ts `jobBody`). */
export interface AiJobPoll {
  id: string;
  kind: string;
  status: "queued" | "running" | "done" | "failed" | "cancelled" | string;
  stage: string | null;
  progress?: { done: number; total: number; plan?: unknown } | null;
  heartbeatAt: string | null;
  driver?: string | null;
  result?: unknown;
  outputs?: unknown;
  error?: unknown;
  costCredits: number;
  createdAt?: string;
}

const JOB_TERMINAL: ReadonlySet<string> = new Set(["done", "failed", "cancelled"]);
export const isJobTerminal = (status: string) => JOB_TERMINAL.has(status);

/** Polls a job until a terminal status (null: aborted, or not the store's job). Each answer goes to `onView`. */
export async function pollJob(
  handle: string,
  jobId: string,
  deps: Pick<ClientRunDeps, "fetch" | "visible" | "sleep">,
  signal: AbortSignal,
  onView?: (v: AiJobPoll) => void,
): Promise<AiJobPoll | null> {
  for (;;) {
    if (signal.aborted) return null;
    try {
      const res = await deps.fetch(apiHref(handle, `/ai/jobs/${encodeURIComponent(jobId)}`), { signal, headers: { Accept: "application/json" }, credentials: "same-origin" });
      if (res.status === 404) return null;
      const body = (await res.json().catch(() => null)) as (AiJobPoll & { ok?: boolean }) | null;
      if (res.ok && body && typeof body.status === "string") {
        onView?.(body);
        if (isJobTerminal(body.status)) return body;
      }
    } catch {
      if (signal.aborted) return null;
      // a network blip: the cron and the next poll keep the job moving
    }
    await deps.sleep(deps.visible() ? JOB_POLL_MS.visible : JOB_POLL_MS.hidden, signal);
  }
}

/** The terminal view of a job as the run's outcome. */
function jobOutcome(v: AiJobPoll): AiOutcome<unknown> {
  if (v.status === "done") return serverResult({ value: v.result ?? null, runId: null, jobId: v.id, credits: v.costCredits, ms: 0, rejected: [], flags: [] }, null, []);
  if (v.status === "cancelled") return aiFailure("cancelled", "server");
  const err = v.error as { code?: unknown } | string | null | undefined;
  const code = isFailCode(err) ? err : isFailCode((err as { code?: unknown } | null)?.code) ? ((err as { code: AiFailCode }).code) : "provider_error";
  return aiFailure(code, "server");
}

interface StartInfo {
  runId: string;
  class: TaskClass;
  model: string;
  effort: Effort;
}

function serverResult(
  f: { value: unknown; runId: string | null; jobId: string | null; credits: number; ms: number; rejected: string[]; flags: AiResult<unknown>["flags"] },
  start: StartInfo | null,
  notes: AiFallbackNote[],
  ttftMs: number | null = null,
  model: string | null = null,
  cls: TaskClass | null = null,
): AiResult<unknown> {
  return {
    ok: true,
    value: f.value,
    provider: "server",
    class: start?.class ?? cls,
    model: start?.model ?? model,
    effort: start?.effort ?? null,
    // the served prompt version is on the run row; the browser does not need it
    promptVersion: "server",
    rubricVersion: null,
    runId: f.runId ?? start?.runId ?? null,
    jobId: f.jobId,
    usage: { inTok: 0, outTok: 0, cacheReadTok: 0, cacheWriteTok: 0, costMicros: 0, credits: f.credits },
    ms: f.ms,
    ttftMs,
    rejected: f.rejected,
    flags: f.flags,
    notes,
  };
}

/** Folds the events of one server run (streamed or polled) into its outcome. */
class RunFold {
  start: StartInfo | null = null;
  startAt: number | null = null;
  firstFieldAt: number | null = null;
  jobId: string | null = null;
  notes: AiFallbackNote[] = [];
  outcome: AiOutcome<unknown> | null = null;
  finalMs = 0;
  lastSeq = -1;

  constructor(private readonly opts: RunOpts, private readonly now: () => number) {}

  apply(e: AiStreamEvent): void {
    if (e.s <= this.lastSeq && e.t !== "final" && e.t !== "error") return;
    this.lastSeq = Math.max(this.lastSeq, e.s);
    if (this.outcome) return;
    switch (e.t) {
      case "start":
        this.start = { runId: e.runId, class: e.class, model: e.model, effort: e.effort };
        this.startAt = this.now();
        break;
      case "field":
        this.firstFieldAt ??= this.now();
        this.opts.onField?.(e.path, e.value);
        break;
      case "field_rejected":
        break;
      case "progress":
        if (e.stage !== "wait") this.opts.onProgress?.({ stage: e.stage, ...(e.done !== undefined ? { done: e.done } : {}), ...(e.total !== undefined ? { total: e.total } : {}) });
        break;
      case "model_fallback":
        this.notes.push({ from: e.from, to: e.to, code: "model_refusal" });
        break;
      case "job":
        this.jobId = e.jobId;
        break;
      case "final": {
        this.finalMs = e.ms;
        const ttft = this.firstFieldAt !== null && this.startAt !== null ? Math.max(0, Math.round(this.firstFieldAt - this.startAt)) : null;
        this.outcome = serverResult({ value: e.value, runId: e.runId, jobId: null, credits: e.credits, ms: e.ms, rejected: e.rejected, flags: e.flags }, this.start, this.notes, ttft);
        break;
      }
      case "error":
        this.outcome = { ok: false, code: e.code, retryable: e.retryable, provider: "server", runId: this.start?.runId ?? null } satisfies AiFailure;
        break;
    }
  }
}

/** The server rung: one POST to `/api/app/<h>/ai/<task>` (the server re-checks every policy line). */
export function serverRung(deps: ClientRunDeps): AiProvider {
  return {
    id: "server",
    supports: () => ({ ok: true }),
    async run<T extends AiTaskId>(task: T, input: AiTaskInput<T>, _ctx: AiRunContext, opts: AiRunOpts): Promise<AiOutcome<AiTaskOutput<T>>> {
      void _ctx;
      return (await serverRun(task, input, opts as RunOpts, deps)) as AiOutcome<AiTaskOutput<T>>;
    },
  };
}

async function serverRun(task: AiTaskId, input: unknown, opts: RunOpts, deps: ClientRunDeps): Promise<AiOutcome<unknown>> {
  const def = TASKS[task];
  const deadline = new AbortController();
  let timedOut = false;
  const budget = def.pattern === "B" || !def.deadlineMs ? null : def.deadlineMs + CLIENT_DEADLINE_MARGIN_MS;
  const timer = budget === null ? null : setTimeout(() => {
    timedOut = true;
    deadline.abort("timeout");
  }, budget);
  const link = linkSignals([opts.signal, deadline.signal]);
  const signal = link.signal;
  const cut = (): AiFailure => (opts.signal?.aborted ? aiFailure("cancelled", "server") : timedOut ? aiFailure("timeout", "server") : aiFailure("provider_error", "server"));
  try {
    let res: Response;
    try {
      res = await deps.fetch(apiHref(deps.handle, `/ai/${task}`), {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/x-ndjson, application/json" },
        body: JSON.stringify({ input, surface: opts.surface, ...(opts.nonce ? { nonce: opts.nonce } : {}) }),
        credentials: "same-origin",
        signal,
      });
    } catch {
      return cut();
    }
    const type = res.headers.get("content-type") ?? "";
    if (res.ok && type.includes("application/x-ndjson") && res.body) return await readStream(res.body, opts, deps, signal, cut);
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (res.status === 202 && body?.ok === true) {
      if (typeof body.runId === "string") return await pollRun(body.runId, opts, deps, signal, cut);
      if (typeof body.jobId === "string") {
        const v = await pollJob(deps.handle, body.jobId, deps, signal);
        return v ? jobOutcome(v) : cut();
      }
    }
    if (res.ok && body?.ok === true) {
      return serverJson(body);
    }
    const code = isFailCode(body?.error) ? body.error : codeOfStatus(res.status);
    const header = Number(res.headers.get("retry-after"));
    const retryAfter = typeof body?.retryAfterSec === "number" ? body.retryAfterSec : Number.isFinite(header) && header > 0 ? header : undefined;
    const f = aiFailure(code, "server", null, retryAfter);
    if (typeof body?.retryable === "boolean") f.retryable = body.retryable;
    return f;
  } finally {
    if (timer) clearTimeout(timer);
    link.dispose();
  }
}

/** `200 { ok: true, value, rejected, provider, class, model, runId, credits, flags }` (a non-stream task). */
function serverJson(body: Record<string, unknown>): AiResult<unknown> {
  return serverResult(
    {
      value: body.value,
      runId: typeof body.runId === "string" ? body.runId : null,
      jobId: null,
      credits: typeof body.credits === "number" ? body.credits : 0,
      ms: 0,
      rejected: Array.isArray(body.rejected) ? (body.rejected as string[]) : [],
      flags: Array.isArray(body.flags) ? (body.flags as AiResult<unknown>["flags"]) : [],
    },
    null,
    [],
    null,
    typeof body.model === "string" ? body.model : null,
    typeof body.class === "string" ? (body.class as TaskClass) : null,
  );
}

async function readStream(body: ReadableStream<Uint8Array>, opts: RunOpts, deps: ClientRunDeps, signal: AbortSignal, cut: () => AiFailure): Promise<AiOutcome<unknown>> {
  const fold = new RunFold(opts, deps.now);
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const split = new NdjsonSplitter();
  let read = 0;
  let startRead = -1;
  let finalRead = -1;
  const take = (events: AiStreamEvent[]) => {
    for (const e of events) {
      if (e.t === "start" && startRead < 0) startRead = read;
      if (e.t === "final" && finalRead < 0) finalRead = read;
      fold.apply(e);
    }
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      read++;
      take(split.push(decoder.decode(value, { stream: true })));
      if (fold.outcome) break;
    }
    take(split.end());
  } catch {
    // the body broke off (network, abort): decided below
  } finally {
    void reader.cancel().catch(() => undefined);
  }
  if (finalRead > 0 && startRead > 0) deps.detector.record(startRead === finalRead ? (fold.finalMs >= BUFFERED_MIN_MS ? true : null) : false);
  if (fold.outcome) return fold.outcome;
  if (fold.jobId && !signal.aborted) {
    const v = await pollJob(deps.handle, fold.jobId, deps, signal);
    if (v) return jobOutcome(v);
  }
  // a stream that ended without final or error: the rung failed mid-way (retryable, the ladder moves down)
  return cut();
}

async function pollRun(runId: string, opts: RunOpts, deps: ClientRunDeps, signal: AbortSignal, cut: () => AiFailure): Promise<AiOutcome<unknown>> {
  const fold = new RunFold(opts, deps.now);
  let after = -1;
  for (;;) {
    if (signal.aborted) return cut();
    try {
      const res = await deps.fetch(apiHref(deps.handle, `/ai/runs/${encodeURIComponent(runId)}?after=${after}`), { signal, headers: { Accept: "application/json" }, credentials: "same-origin" });
      if (res.status === 404) return aiFailure("provider_error", "server", runId);
      const body = (await res.json().catch(() => null)) as { events?: AiStreamEvent[]; done?: boolean } | null;
      for (const e of body?.events ?? []) {
        fold.apply(e);
        after = Math.max(after, e.s);
      }
      if (fold.outcome) return fold.outcome;
      if (body?.done) return aiFailure("provider_error", "server", runId);
    } catch {
      if (signal.aborted) return cut();
    }
    await deps.sleep(deps.visible() ? RUN_POLL_MS.visible : RUN_POLL_MS.hidden, signal);
  }
}

/* ------------------------------------------------------------------ */
/* The ladder walk                                                     */
/* ------------------------------------------------------------------ */

/**
 * One browser run down `ladderFor(policy, task, device)` (AI-§A.4 "Where the ladder runs"). A rung whose `supports()`
 * fails is skipped with a note; a failure that `ladderAdvances` moves to the next rung with a note; an abort the
 * caller asked for stops the walk (`cancelled`). A task that is not live answers `flag_off` (it is invisible).
 */
export async function runOnClient<T extends AiTaskId>(task: T, input: AiTaskInput<T>, opts: RunOpts, deps: ClientRunDeps): Promise<AiOutcome<AiTaskOutput<T>>> {
  const rungs = ladderFor(deps.policy, task, deps.device);
  if (!rungs.length) return aiFailure("flag_off", "library");
  const ctx: AiRunContext = { storeId: deps.handle, policy: deps.policy, device: deps.device };
  const server = serverRung(deps);
  const notes: AiFallbackNote[] = [];
  let last: AiFailure | null = null;
  for (let i = 0; i < rungs.length; i++) {
    const rung = rungs[i]!;
    const next = rungs[i + 1];
    const note = (code: AiFailCode) => {
      if (!next) return;
      const n: AiFallbackNote = { from: rung, to: next, code };
      notes.push(n);
      deps.onNote?.(n);
    };
    if (opts.signal?.aborted) return aiFailure("cancelled", rung);
    const provider = rung === "server" ? server : rung === "local" ? deps.local : deps.library;
    const support = provider ? provider.supports(task, ctx) : ({ ok: false, code: "device_unsupported" } as const);
    if (!support.ok) {
      last = aiFailure(support.code, rung);
      note(support.code);
      continue;
    }
    deps.onProvider?.(rung);
    const out = await provider!.run(task, input, ctx, opts);
    if (out.ok) return { ...out, notes: [...notes, ...out.notes] };
    last = out;
    if (opts.signal?.aborted) return aiFailure("cancelled", rung, out.runId);
    if (!ladderAdvances(out.code)) return out;
    note(out.code);
  }
  return (last ?? aiFailure("unknown", "library")) as AiFailure;
}

/* ------------------------------------------------------------------ */
/* Process state: running runs, reporters, the detector                */
/* ------------------------------------------------------------------ */

/**
 * The tab's cancel bus: every browser run and job poll listens on it, and `cancelStoreAiJobs` fires it. It holds no
 * store data, only the listeners of the runs in flight (each removes its own when it ends).
 */
const CANCEL_BUS = new EventTarget();
const DETECTOR = new StreamDetector();
const browserFetch: typeof fetch = (...a) => globalThis.fetch(...a);

/** Ties a run's controller to the cancel bus; the returned function unties it. */
function track(own: AbortController): () => void {
  const on = () => own.abort("store_switch");
  CANCEL_BUS.addEventListener("cancel", on, { once: true });
  return () => CANCEL_BUS.removeEventListener("cancel", on);
}

/** The one reporter of the tab: the browser works for the store on screen, so another handle flushes and replaces it. */
let reporter: AiReporter | null = null;
function reporterFor(handle: string): AiReporter {
  if (reporter?.handle !== handle) {
    void reporter?.flush();
    reporter = new AiReporter(handle, { fetch: browserFetch, detector: DETECTOR });
  }
  return reporter;
}

/** The worker manager named after the platform's brand (GEN-13: `policy.workerName`; today's name without one). */
function namedAi(policy: AiPolicy) {
  const ai = getAi();
  const name = policy.workerName?.trim();
  if (name && ai.workerName !== name) ai.configure({ workerName: name });
  return ai;
}

/** The browser's deps for one store (the real fetch, the worker, the library, the shared detector). */
export function browserDeps(ctx: { handle: string; policy: AiPolicy; device: DeviceInfo }, extra: Pick<ClientRunDeps, "onNote" | "onProvider"> = {}): ClientRunDeps {
  return {
    handle: ctx.handle,
    policy: ctx.policy,
    device: ctx.device,
    fetch: browserFetch,
    local: localProvider({ ai: namedAi(ctx.policy), report: (r) => reporterFor(ctx.handle).add(r) }),
    library: clientLibraryProvider(),
    visible: isVisible,
    sleep,
    now: () => Date.now(),
    detector: DETECTOR,
    ...extra,
  };
}

/** One run outside a hook (the novelty re-asks run several in parallel), aborted with the store's other runs. */
export async function runAiOnce<T extends AiTaskId>(task: T, input: AiTaskInput<T>, opts: RunOpts, ctx: { handle: string; policy: AiPolicy; device: DeviceInfo }): Promise<AiOutcome<AiTaskOutput<T>>> {
  const own = new AbortController();
  const untrack = track(own);
  const link = linkSignals([opts.signal, own.signal]);
  try {
    return await runOnClient(task, input, { ...opts, signal: link.signal }, browserDeps(ctx));
  } finally {
    link.dispose();
    untrack();
  }
}

/* ------------------------------------------------------------------ */
/* Hooks                                                               */
/* ------------------------------------------------------------------ */

/** One browser task (AI-§A.7). */
export function useAiTask<T extends AiTaskId>(
  task: T,
  ctx: { handle: string; policy: AiPolicy; device: DeviceInfo },
): {
  state: AiTaskState;
  run(input: AiTaskInput<T>, opts?: Omit<AiRunOpts, "surface"> & { surface: AiSurface }): Promise<AiOutcome<AiTaskOutput<T>>>;
  cancel(): void;
} {
  const [state, setState] = useState<AiTaskState>(IDLE);
  const current = useRef<AbortController | null>(null);
  const ctxRef = useRef(ctx);
  useEffect(() => {
    ctxRef.current = ctx;
  });
  // unmount or a store switch (another handle): the running call is aborted, upstream too
  useEffect(
    () => () => {
      current.current?.abort();
    },
    [ctx.handle],
  );

  const run = useCallback(
    async (input: AiTaskInput<T>, opts?: RunOpts): Promise<AiOutcome<AiTaskOutput<T>>> => {
      current.current?.abort();
      const own = new AbortController();
      current.current = own;
      const untrack = track(own);
      const link = linkSignals([opts?.signal, own.signal]);
      const mine = () => current.current === own;
      setState({ status: "running", provider: null, notes: [], fields: {}, credits: null });
      try {
        const out = await runOnClient(
          task,
          input,
          {
            ...opts,
            surface: opts?.surface ?? "wizard",
            signal: link.signal,
            onField: (path, value) => {
              opts?.onField?.(path, value);
              if (mine()) setState((s) => ({ ...s, fields: { ...s.fields, [path]: value } }));
            },
          },
          browserDeps(ctxRef.current, {
            onNote: (n) => mine() && setState((s) => ({ ...s, notes: [...s.notes, n] })),
            onProvider: (p) => mine() && setState((s) => ({ ...s, provider: p })),
          }),
        );
        if (mine()) {
          setState((s) =>
            out.ok
              ? { ...s, status: "done", provider: out.provider, notes: out.notes, credits: out.usage?.credits ?? 0 }
              : { ...s, status: out.code === "cancelled" ? "idle" : "error", provider: out.provider },
          );
        }
        return out;
      } finally {
        link.dispose();
        untrack();
        if (mine()) current.current = null;
      }
    },
    [task],
  );
  const cancel = useCallback(() => current.current?.abort(), []);
  return useMemo(() => ({ state, run, cancel }), [state, run, cancel]);
}

/** The most conservative device: a phone on save-data without a local tier (no model download). */
const CONSERVATIVE_DEVICE: DeviceInfo = { tier: "off", mobile: true, saveData: true, vlmCached: false };

/** The device from what the browser says (pure): a phone or a coarse pointer is mobile, so it never downloads a model. */
export function deviceFrom(m: { tier: DeviceTier; uaMobile: boolean | undefined; coarse: boolean; saveData: boolean; vlmCached: boolean }): DeviceInfo {
  return { tier: m.tier, mobile: m.uaMobile === true || m.coarse, saveData: m.saveData, vlmCached: m.tier !== "off" && m.vlmCached };
}

interface NavigatorHints {
  userAgentData?: { mobile?: boolean };
  connection?: { saveData?: boolean };
}

/** Whether the VLM of this tier is in the model cache (nothing is downloaded or created to find out). */
async function vlmCachedFor(tier: DeviceTier): Promise<boolean> {
  if (tier === "off" || typeof caches === "undefined") return false;
  try {
    if (!(await caches.has(AI_CACHE_NAME))) return false;
    const repo = AI_MODELS.vlm[tier];
    const keys = await (await caches.open(AI_CACHE_NAME)).keys();
    return keys.some((k) => repoOfCacheUrl(k.url) === repo);
  } catch {
    return false;
  }
}

async function measureDevice(): Promise<DeviceInfo> {
  const caps = await detectCapabilities("full");
  const nav = navigator as Navigator & NavigatorHints;
  let coarse = false;
  try {
    coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  } catch {
    coarse = false;
  }
  return deviceFrom({ tier: caps.tier, uaMobile: nav.userAgentData?.mobile, coarse, saveData: nav.connection?.saveData === true, vlmCached: await vlmCachedFor(caps.tier) });
}

let measured: DeviceInfo = CONSERVATIVE_DEVICE;
let measuring: Promise<void> | null = null;
/** fires "measured" once the device is known (useSyncExternalStore's subscribers listen on it) */
const DEVICE_BUS = new EventTarget();
function subscribeDevice(fn: () => void): () => void {
  DEVICE_BUS.addEventListener("measured", fn);
  if (!measuring && typeof window !== "undefined") {
    measuring = measureDevice()
      .then((d) => {
        measured = d;
        DEVICE_BUS.dispatchEvent(new Event("measured"));
      })
      .catch(() => undefined);
  }
  return () => DEVICE_BUS.removeEventListener("measured", fn);
}

/** The device the ladder reads (capabilities.ts + userAgentData.mobile / pointer: coarse + connection.saveData). */
export function useDeviceInfo(): DeviceInfo {
  return useSyncExternalStore(subscribeDevice, () => measured, () => CONSERVATIVE_DEVICE);
}

/** A pattern-B job polled until it ends (2 s visible / 6 s hidden); `cancel` asks the server to stop it. */
export function useAiJob(id: string | null, ctx: { handle: string }): { job: AiJobPoll | null; done: boolean; cancel(): Promise<void> } {
  const [view, setView] = useState<{ id: string; job: AiJobPoll } | null>(null);
  const handle = ctx.handle;
  useEffect(() => {
    if (!id) return;
    const own = new AbortController();
    const untrack = track(own);
    void pollJob(handle, id, { fetch: browserFetch, visible: isVisible, sleep }, own.signal, (job) => setView({ id, job })).finally(untrack);
    return () => own.abort();
  }, [id, handle]);
  const cancel = useCallback(async () => {
    if (!id) return;
    try {
      await browserFetch(apiHref(handle, `/ai/jobs/${encodeURIComponent(id)}/cancel`), { method: "POST", credentials: "same-origin" });
    } catch {
      // the cron reconciles a job nobody polls
    }
  }, [id, handle]);
  const job = view && view.id === id ? view.job : null;
  return { job, done: job ? isJobTerminal(job.status) : false, cancel };
}

/**
 * Cancels the store's running browser AI work (P2's clearStoreClientState, PLA-§22.3): every run and job poll of this
 * tab aborts (the browser only ever works for the store on screen), the worker cancels its jobs and frees its models,
 * and the queued local reports are sent.
 */
export function cancelStoreAiJobs(storeId: string): void {
  void storeId;
  CANCEL_BUS.dispatchEvent(new Event("cancel"));
  const ai = peekAi();
  ai?.cancel();
  ai?.release();
  void reporter?.flush();
  reporter = null;
}
