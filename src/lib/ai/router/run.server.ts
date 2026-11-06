import "server-only";
/**
 * One server run, step by step (P7 AI; ai.md AI-§A.4 `runServerTask` steps 1-10, AI-§B.3, AI-§B.7, AI-§B.10, AI-§B.11,
 * AI-§C.2, AI-§F.8; docs/STORE-SAAS.md §E.7, §H.12 rules 2 and 6, D55, D70). `runAi` (./server.ts, frozen) is
 * `runServerTask` with the run's defaults; pattern-B jobs and the routes call it with their stage options.
 *
 *  1. Gate: the task live (release + flag + console route) → `flag_off`; the platform and store lines in the AI-§A.4
 *     order → `disabled`, `no_key`, `no_cap`, `kill`, the breaker (`provider_auth` / `provider_overloaded`),
 *     `state` / `entitlement`, `store_local_only`, the Director class down → `model_unavailable`; the buckets
 *     `s:<sid>:ai:<task>` 120/h and `s:<sid>:ai:u:<userId>` 60/10 min → `rate_limited`.
 *  2. Input: the strict parse (`input_invalid`), the image limits of `platform_ai.vision`, the PII gate (`pii_blocked`
 *     or `pii_redacted`), the injection flag; the Director families mint the run's canary token.
 *  3. Cache: no nonce → `ai_cache` on (store, task, input hash, prompt version, model); a hit is finalized again and
 *     answered with `cache_hit`, 0 credits and one `via = 'cache'` run row. TTL-0 Director tasks are served for 10 min.
 *  4. Reserve the p90 estimate (AI-§C.2) → `quota_*`.  5. The run row (`running`).
 *  6. The class slot (3 s in pattern A → `busy`).
 *  7. The call: the active prompt version, or the canary (`hash(storeId|family|day) mod 10,000 < canary_bp`, flag
 *     `canary_version`); the route deadline joins the caller's signal; retryable failures retried `retries` times
 *     after 1 s / 3 s (or `retry-after` when it fits the deadline) on the same reservation.
 *  8. Read: `stop_reason` first (`refused`, `max_tokens`), then the loose parse with one retry carrying the parse
 *     error as a `role: "system"` message, then the task's finalize; the canary token in the output fails the run.
 *  9. Reconcile (or release when the provider billed nothing), the run row, the cache.  10. Return.
 * On a failure the ladder `server-then-library` answers from the library when the task has a library rung.
 *
 * No pooled connection is held across a model call: every read and the run-row insert finish before the slot and the
 * call (each statement takes and returns a pool connection), and the reconcile and the run-row update run after it.
 */
import type { StoreScope, WriteScope } from "@/lib/tenancy/types";
import { writeScopeOf } from "@/lib/tenancy/seam";
import { CURRENT_RELEASE } from "@/lib/auth/permissions";
import { newId } from "@/lib/db/ids";
import { notify } from "@/lib/platform/notify";
import { getPlatformSetting, getStoreSetting } from "@/lib/settings";
import { effectivePrices, type PlatformAiSetting } from "@/lib/settings/keys/platform_ai";
import { EntitlementError, activeKillSwitches, assertFeature } from "@/lib/tenancy/entitlements";
import { getStoreById } from "@/lib/tenancy/public";
import type { Locale, Market } from "@/lib/page/schema";
import { canaryVersionFor } from "../platform/prompt-versions";
import { assembleFor } from "../prompts/assemble.server";
import { AiAssemblyError } from "../prompts/assemble";
import { assembleDepsFor } from "../prompts/deps.server";
import { PROMPTS, promptFor } from "../prompts/registry";
import { sha256Hex } from "../prompts/sha256";
import { canonicalJson } from "../prompts/text";
import type { PromptVersion } from "../prompts/types";
import { inCanary } from "../eval/canary-rules";
import { aiFailure, ladderAdvances } from "../provider/failures";
import { LIBRARY_TASKS, libraryResult, seedOf } from "../provider/library";
import type { AiFailCode, AiFallbackNote, AiFlag, AiOutcome, AiResult, AiTaskInput, AiTaskOutput, AiUsage } from "../provider/types";
import { aiRateGate } from "../quota/buckets";
import { costMicros, creditsFor, estimate } from "../quota/cost";
import { AiQuotaError, reconcile, release, reserve, type Reservation } from "../quota/reserve";
import { containsCanary, mintCanary } from "../safety/canary";
import { injectionFlags } from "../safety/injection";
import { gateInput } from "../safety/pii";
import { finalizeCtxFor } from "../schema/tasks/ctx.server";
import { finalizeCtxInputOf, finalizeFor } from "../schema/tasks/finalize";
import { parseTaskInput } from "../schema/tasks/inputs";
import type { FinalizeCtx } from "../schema/tasks/types";
import { breaker } from "../server/breaker";
import { callClaude, fastCooling, type CallEnv, type CallResult } from "../server/call";
import { anthropic, keySource } from "../server/client";
import { AiServerError } from "../server/errors";
import { aiFlagsFor } from "../server/flags";
import { deepFallbackRoute, firstDeepCall, isClassDown, markClassDown, resolveRoute } from "../server/models";
import { AiRequestError, assertSpec, inputImagesWithin, parseRetryMessage, type CallSpec, type IterationUsage } from "../server/request";
import { AiBusyError, PATTERN_A_MAX_WAIT_MS, semaphores } from "../server/semaphore";
import { cacheExpiry, cacheLookup, cacheWrite } from "../store/cache";
import { activeMemory } from "../store/memory";
import { finishRun, insertRun, type RunFinish, type RunStage } from "../store/runs";
import { PartialJson } from "../stream/partial-json";
import { AiRouteError, TASKS, isDirectorTask, liveTasks, type AiTaskId, type Effort, type RoutePlan, type RunPattern, type TaskClass } from "../tasks";
import type { RunAiServerOpts } from "./server";

/** What a job stage or a route adds to the frozen options (never sent by a browser). */
export interface ServerTaskOpts extends RunAiServerOpts {
  /** "A" by default; "B" for a job stage (no 3 s busy limit, director_deep allowed) */
  pattern?: RunPattern;
  jobId?: string | null;
  stage?: RunStage | null;
  /** a later stage of a Director pass whose first stage charged the pass counter */
  passCharged?: boolean;
  parentRunId?: string | null;
  /**
   * a job stage whose job reserved every stage up front (AI-§B.13 step 1): no reservation of its own, the run row
   * carries the cost, and the job reconciles its one reservation at the end
   */
  prepaid?: boolean;
  /** flags the caller adds to the run row (a job stage driven by a poll or a batch: `stage_resumed`) */
  flags?: readonly AiFlag[];
  /** the run row exists and the call is about to start (step 5): the stream's `start` event, the poll's `202 { runId }` */
  onStart?(e: { runId: string; class: TaskClass; model: string; effort: Effort }): void;
  /** a streamed top-level field the guard refused: the browser keeps the library text (`field_rejected`, AI-§A.7) */
  onFieldRejected?(path: string): void;
}

/** Backoff of the retries (AI-§A.4 step 10). */
export const RETRY_BACKOFF_MS = [1_000, 3_000] as const;
/** A timeout is retried only when this much of the deadline remains (AI-§B.10). */
const TIMEOUT_RETRY_MIN_LEFT_MS = 20_000;

const STAGE_OF: Partial<Record<AiTaskId, RunStage>> = { "copy.page": "copy", "copy.hero": "copy", "copy.field": "copy", "design.plan": "plan", "design.critique": "critique", "design.verify": "verify", "eval.judge": "judge" };

const STATUS_OF: Partial<Record<AiFailCode, RunFinish["status"]>> = {
  refused: "refused",
  invalid_output: "invalid_output",
  max_tokens: "max_tokens",
  timeout: "timeout",
  cancelled: "cancelled",
  quota_store: "quota",
  quota_day: "quota",
  quota_platform: "quota",
  quota_platform_pending: "quota",
  quota_director: "quota",
  pii_blocked: "blocked",
};

/** Codes the provider never billed for: the reservation is released (AI-§C.2 step 5). */
const UNBILLED: ReadonlySet<AiFailCode> = new Set<AiFailCode>(["busy", "rate_limited", "provider_auth", "provider_overloaded", "provider_error", "bad_request", "model_unavailable", "unknown"]);

/** Failures after which the library is not asked (an invisible task, a bad input, a caller's abort, impersonation). */
const NO_LIBRARY: ReadonlySet<AiFailCode> = new Set<AiFailCode>(["flag_off", "input_invalid", "cancelled", "state"]);

/** The write scope of a run (src/lib/tenancy/seam.ts; CCR r1-p7-7). */
export { writeScopeOf } from "@/lib/tenancy/seam";

const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new AiServerError("cancelled", false));
      },
      { once: true },
    );
  });

class RunFailure extends Error {
  constructor(
    readonly code: AiFailCode,
    readonly retryAfterSec?: number,
    readonly flags: AiFlag[] = [],
  ) {
    super(code);
  }
}

/* ------------------------------------------------------------------ */
/* Step 1: the gate                                                    */
/* ------------------------------------------------------------------ */

interface Gated {
  settings: PlatformAiSetting;
  store: NonNullable<Awaited<ReturnType<typeof getStoreById>>>;
}

/** Step 1 alone (the job creation and the batch queue run it before their own steps 2-5); throws `RunFailure`. */
export async function serverGate(scope: WriteScope, task: AiTaskId, opts: Pick<ServerTaskOpts, "actor">): Promise<{ ok: true; settings: PlatformAiSetting } | { ok: false; code: AiFailCode; retryAfterSec?: number }> {
  try {
    const g = await gate(scope, task, opts as ServerTaskOpts);
    return { ok: true, settings: g.settings };
  } catch (err) {
    if (err instanceof RunFailure) return { ok: false, code: err.code, ...(err.retryAfterSec !== undefined ? { retryAfterSec: err.retryAfterSec } : {}) };
    throw err;
  }
}

async function gate(scope: WriteScope, task: AiTaskId, opts: ServerTaskOpts): Promise<Gated> {
  const [settings, store] = await Promise.all([getPlatformSetting("platform_ai"), getStoreById(scope.storeId)]);
  if (!store) throw new RunFailure("state");
  const flags = await aiFlagsFor({ storeId: scope.storeId, userId: opts.actor.userId, store, platformRole: null });
  if (!liveTasks(CURRENT_RELEASE, flags as ReadonlySet<string>, settings.routes).includes(task)) throw new RunFailure("flag_off");
  if (!settings.enabled) throw new RunFailure("disabled");
  if ((await keySource()) === "none") throw new RunFailure("no_key");
  if (settings.caps.monthlyUsd === null || !(settings.caps.monthlyUsd > 0)) throw new RunFailure("no_cap");
  if ((await activeKillSwitches()).includes("ai_generation_enabled")) throw new RunFailure("kill");
  const b = breaker();
  if (b.state() === "auth") throw new RunFailure("provider_auth");
  if (b.state() === "open") throw new RunFailure("provider_overloaded", 60);
  try {
    await assertFeature(scope, "cloud_ai");
  } catch (err) {
    if (err instanceof EntitlementError) throw new RunFailure(err.reason === "state" ? "state" : err.reason === "kill" ? "kill" : "entitlement");
    throw err;
  }
  const storeAi = await getStoreSetting(scope, "store_ai");
  if (storeAi.mode === "local") throw new RunFailure("store_local_only");
  const cls = TASKS[task].class;
  if (cls === "director_interactive" && isClassDown(cls)) throw new RunFailure("model_unavailable");
  const rate = await aiRateGate(scope, task, opts.actor.userId);
  if (!rate.ok) throw new RunFailure("rate_limited", rate.retryAfterSec);
  return { settings, store };
}

/* ------------------------------------------------------------------ */
/* Steps 2-3                                                           */
/* ------------------------------------------------------------------ */

/** The version a run uses: the canary when the store's daily hash falls in its slice, else the active one. */
async function versionFor(task: AiTaskId, settings: PlatformAiSetting, storeId: string, now: Date): Promise<{ p: PromptVersion; canary: boolean } | null> {
  const family = TASKS[task].family;
  if (!family) return null;
  const active = promptFor(family, settings, "server");
  const c = await canaryVersionFor(family);
  if (c && inCanary(storeId, family, now.toISOString().slice(0, 10), c.bp)) {
    const p = PROMPTS[c.version];
    if (p && p.family === family && p.provider === "server") return { p, canary: true };
  }
  return active ? { p: active, canary: false } : null;
}

const usageOf = (its: readonly IterationUsage[], micros: number): AiUsage => ({
  inTok: its.reduce((n, i) => n + i.inTok, 0),
  outTok: its.reduce((n, i) => n + i.outTok, 0),
  cacheReadTok: its.reduce((n, i) => n + i.cacheReadTok, 0),
  cacheWriteTok: its.reduce((n, i) => n + i.cacheWriteTok, 0),
  costMicros: micros,
  credits: creditsFor(micros),
  iterations: its.map((i) => ({ model: i.model, inTok: i.inTok, outTok: i.outTok, cacheReadTok: i.cacheReadTok, cacheWriteTok: i.cacheWriteTok })),
});

/* ------------------------------------------------------------------ */
/* The run                                                             */
/* ------------------------------------------------------------------ */

interface Ctx {
  scope: WriteScope;
  task: AiTaskId;
  started: number;
  input: unknown | null;
  inputHash: string | null;
  finalizeCtx: FinalizeCtx | null;
}

async function libraryOpts(ctx: Ctx): Promise<{ seed: number; hasWhatsapp: boolean }> {
  let hasWhatsapp = ctx.finalizeCtx?.hasWhatsapp ?? false;
  if (!ctx.finalizeCtx) {
    try {
      const s = await getStoreSetting(ctx.scope, "store");
      hasWhatsapp = Boolean(s.whatsapp || s.confirmation.whatsapp);
    } catch {
      hasWhatsapp = false;
    }
  }
  return { seed: seedOf(ctx.inputHash ?? sha256Hex(canonicalJson(ctx.input ?? null))), hasWhatsapp };
}

/**
 * The pattern-A (or job-stage) server run of one task. Never throws for a policy or provider failure; throws
 * `AiRouteError("deep_outside_job")` for a `director_deep` task outside a job or a batch (a programming error).
 */
export async function runServerTask<T extends AiTaskId>(scope: StoreScope, task: T, rawInput: AiTaskInput<T>, opts: ServerTaskOpts): Promise<AiOutcome<AiTaskOutput<T>>> {
  const def = TASKS[task];
  const pattern: RunPattern = opts.pattern ?? (def.pattern === "B" ? "B" : "A");
  if (def.class === "director_deep" && pattern !== "B" && pattern !== "C") throw new AiRouteError(task, "deep_outside_job");
  const ladder = opts.ladder ?? "server-then-library";
  const ws = writeScopeOf(scope);
  if (!ws) return aiFailure("state", "server") as AiOutcome<AiTaskOutput<T>>;
  const ctx: Ctx = { scope: ws, task, started: Date.now(), input: null, inputHash: null, finalizeCtx: null };
  const out = await serverRung(ws, task, rawInput, opts, pattern, ctx);
  if (out.ok || ladder === "server-only" || NO_LIBRARY.has(out.code) || !ladderAdvances(out.code) || !LIBRARY_TASKS.has(task)) return out as AiOutcome<AiTaskOutput<T>>;
  let input = ctx.input as AiTaskInput<T> | null;
  if (input === null) {
    const parsed = parseTaskInput(task, rawInput);
    if (!parsed.ok) return out as AiOutcome<AiTaskOutput<T>>;
    input = parsed.value as AiTaskInput<T>;
  }
  const note: AiFallbackNote = { from: "server", to: "library", code: out.code };
  return libraryResult(task, input, { ...(await libraryOpts(ctx)), ms: Date.now() - ctx.started, notes: [note] });
}

async function serverRung<T extends AiTaskId>(scope: WriteScope, task: T, rawInput: AiTaskInput<T>, opts: ServerTaskOpts, pattern: RunPattern, ctx: Ctx): Promise<AiOutcome<unknown>> {
  const def = TASKS[task];
  if (!def.class) return aiFailure("bad_request", "server");
  let reservation: Reservation | null = null;
  let runId: string | null = null;
  let releaseSlot: (() => void) | null = null;
  const flags: AiFlag[] = [...(opts.flags ?? [])];
  const iterations: IterationUsage[] = [];
  let plan: RoutePlan | null = null;
  let settings: PlatformAiSetting | null = null;
  let p: PromptVersion | null = null;
  let billedUnknown = false;
  /** a request went out (a failure before this point never billed: release) */
  let sent = false;
  let lastStop: string | null = null;
  let servedModel: string | null = null;
  try {
    if (opts.signal?.aborted) throw new RunFailure("cancelled");
    // 1. gate
    const g = await gate(scope, task, opts);
    settings = g.settings;
    const ws = scope;
    const now = new Date();
    const route = resolveRoute(task, settings, { pattern, storeId: scope.storeId, now });
    plan = route.plan;
    if (route.canary) flags.push("canary_version");
    if (plan.class === "director_deep" && isClassDown("director_deep")) {
      plan = deepFallbackRoute(plan, settings);
      flags.push("director_fallback");
    }
    if (plan.fast && fastCooling(task)) plan = { ...plan, fast: false };
    // 2. input
    const parsed = parseTaskInput(task, rawInput);
    if (!parsed.ok || !inputImagesWithin(parsed.value, settings.vision)) throw new RunFailure("input_invalid");
    const gated = gateInput(task, parsed.value);
    if ("blocked" in gated) throw new RunFailure("pii_blocked");
    const input = gated.input as AiTaskInput<T>;
    ctx.input = input;
    flags.push(...gated.flags, ...injectionFlags(task, input));
    const version = await versionFor(task, settings, scope.storeId, now);
    if (!version) return aiFailure("bad_request", "server");
    p = version.p;
    if (version.canary) flags.push("canary_version");
    const canary = p.canary ? mintCanary() : null;
    const inputHash = sha256Hex(canonicalJson(input));
    ctx.inputHash = inputHash;
    const finalize = finalizeFor(task, input);
    if (!finalize) return aiFailure("bad_request", "server");
    const fctx = await finalizeCtxFor(scope, finalizeCtxInputOf(task, input), { storeFacts: async (s) => (await activeMemory(s)).filter((m) => m.kind === "fact").map((m) => m.text) });
    ctx.finalizeCtx = fctx;
    const cacheKey = { task, inputHash, promptVersion: p.version, model: plan.model };
    const cacheable = def.cacheTtlDays > 0 || isDirectorTask(task);
    // 3. cache
    if (!opts.nonce && cacheable) {
      const hit = await cacheLookup(ws, cacheKey);
      if (hit) {
        const fin = finalize(hit.output, fctx);
        if (fin) {
          const ms = Date.now() - ctx.started;
          const hitFlags: AiFlag[] = [...new Set<AiFlag>([...flags, "cache_hit"])];
          const id = await insertRun(ws, {
            userId: opts.actor.userId,
            task,
            surface: opts.surface,
            provider: "server",
            via: "cache",
            class: plan.class,
            stage: opts.stage ?? STAGE_OF[task] ?? null,
            jobId: opts.jobId ?? null,
            requestedModel: plan.model,
            effort: plan.effort,
            promptVersion: p.version,
            rubricVersion: p.rubricVersion,
            inputHash,
            locale: fctx.locale,
            reservedCredits: 0,
            finished: { status: "ok", model: plan.model, costMicros: 0, credits: 0, flags: hitFlags, rejectedFields: fin.rejected, ms, reconciled: true },
          });
          return okResult(fin.value, { plan, p, runId: id, jobId: opts.jobId ?? null, usage: { inTok: 0, outTok: 0, cacheReadTok: 0, cacheWriteTok: 0, costMicros: 0, credits: 0 }, ms, ttftMs: null, rejected: fin.rejected, flags: hitFlags, notes: [], model: plan.model });
        }
      }
    }
    // the prompt (reads only: settings, memory, the calling window), before any slot or counter
    const store = g.store;
    const primary = (["ar", "fr", "en"].includes(store.defaultLocale) ? store.defaultLocale : "fr") as Locale;
    let assembled;
    try {
      assembled = await assembleFor(scope, p as PromptVersion<T>, input, { market: store.market as Market, currency: store.currency, primaryLocale: primary }, { canary, platformTtl: settings.cacheTtl.platform, seed: inputHash.slice(0, 8) }, assembleDepsFor());
    } catch (err) {
      if (err instanceof AiAssemblyError) throw new RunFailure("bad_request");
      throw err;
    }
    if (assembled.blocked) throw new RunFailure("pii_blocked");
    const prompt = assembled.prompt;
    // 4. reserve
    const prices = effectivePrices(settings.prices).rows;
    const est = estimate(task, input, { batch: false, fast: plan.fast, model: plan.model, prices });
    runId = newId();
    if (!opts.prepaid) {
      try {
        reservation = await reserve(ws, est, runId, { task, passCharged: opts.passCharged === true });
      } catch (err) {
        runId = null;
        if (err instanceof AiQuotaError) throw new RunFailure(err.code === "state" ? "state" : err.code);
        throw err;
      }
    }
    // 5. run row
    await insertRun(ws, {
      id: runId,
      userId: opts.actor.userId,
      task,
      surface: opts.surface,
      provider: "server",
      via: pattern === "B" ? "job" : plan.call === "stream" ? "stream" : "interactive",
      class: plan.class,
      stage: opts.stage ?? STAGE_OF[task] ?? null,
      jobId: opts.jobId ?? null,
      requestedModel: plan.model,
      effort: plan.effort,
      speed: plan.fast ? "fast" : "standard",
      promptVersion: p.version,
      rubricVersion: p.rubricVersion,
      inputHash,
      locale: fctx.locale,
      reservedCredits: reservation?.credits ?? 0,
      parentRunId: opts.parentRunId ?? null,
    });
    opts.onStart?.({ runId, class: plan.class, model: plan.model, effort: plan.effort });
    // 6. slot (no connection is held from here to the end of the call)
    const caps = settings.caps;
    try {
      releaseSlot = await semaphores({ concurrentDirector: caps.concurrentDirector, concurrentWorker: caps.concurrentWorker, concurrentFast: caps.concurrentFast, perStoreWorker: caps.perStoreWorker }).acquire(plan.class, scope.storeId, {
        maxWaitMs: pattern === "A" ? PATTERN_A_MAX_WAIT_MS : null,
        ...(opts.signal ? { signal: opts.signal } : {}),
      });
    } catch (err) {
      if (err instanceof AiBusyError) throw new RunFailure("busy", 1);
      throw new RunFailure("cancelled");
    }
    // 7. call
    const client = await anthropic();
    if (!client) throw new RunFailure("no_key");
    const env: CallEnv = {
      client,
      callShape: settings.callShape,
      onAuthFailure: () => {
        void notify({ audience: "platform_staff", minRole: "admin" }, "ai.auth_failed", {}, { severity: "danger", dedupeKey: `ai.auth_failed:${new Date().toISOString().slice(0, 10)}`, link: "/admin/ai" });
      },
    };
    const deadlineAt = Date.now() + (plan.deadlineMs ?? plan.timeoutMs);
    const pj = def.stream && opts.onField ? new PartialJson(def.stream) : null;
    const onField = opts.onField;
    const spec: CallSpec = {
      task,
      class: plan.class,
      model: plan.model,
      effort: plan.effort,
      maxTokens: plan.maxTokens,
      pattern,
      ...(opts.stage ?? STAGE_OF[task] ? { stage: (opts.stage ?? STAGE_OF[task]) as RunStage } : {}),
      system: prompt.system,
      messages: prompt.messages,
      ...(prompt.format ? { format: prompt.format } : {}),
      stream: plan.call === "stream",
      fallbacks: plan.fallbacks,
      fast: plan.fast,
      deadlineMs: deadlineAt - Date.now(),
      ...(opts.signal ? { signal: opts.signal } : {}),
      ...(pj && onField
        ? {
            onText: (delta: string) => {
              // AI-§B.6: a completed top-level field is guarded on the server before it is shown; items arrive in `final`
              for (const f of pj.push(delta)) {
                if (f.path.includes("[")) continue;
                const one = finalize({ [f.path]: f.value }, fctx);
                const v = one && (one.value as Record<string, unknown>)[f.path];
                if (v !== undefined) onField(f.path, v);
                else opts.onFieldRejected?.(f.path);
              }
            },
          }
        : {}),
    };
    try {
      assertSpec(spec, { classMaxTokens: settings.classes[plan.class].maxTokens, maxImages: settings.vision.maxImages });
    } catch (err) {
      if (err instanceof AiRequestError) throw new RunFailure(err.rule === "images" || err.rule === "image_bytes" ? "input_invalid" : "bad_request");
      throw err;
    }
    sent = true;
    let res: CallResult = await callWithRetries(spec, env, plan.retries, deadlineAt, opts.signal, (u) => {
      billedUnknown = u;
    }).catch(async (err: unknown) => {
      if (err instanceof AiServerError && err.code === "bad_request") {
        console.error(`[ai] bad_request:${task}`);
        if (plan?.class === "director_deep" && firstDeepCall()) await markClassDown("director_deep");
      }
      throw err;
    });
    iterations.push(...res.iterations);
    servedModel = res.servedModel;
    // 8. read: stop_reason before the content
    lastStop = res.stopReason === "refusal" ? `refusal:${res.stopCategory ?? "null"}` : res.stopReason;
    if (res.stopReason === "refusal") throw new RunFailure("refused");
    if (res.stopReason === "max_tokens") throw new RunFailure("max_tokens");
    if (spec.format && res.parsed === null) {
      // one retry with the parse error as a system message, then give up
      const retry: CallSpec = { ...spec, messages: [...spec.messages, parseRetryMessage(res.parseError ?? "invalid")], deadlineMs: deadlineAt - Date.now() };
      delete retry.onText;
      if (retry.deadlineMs <= 0) throw new RunFailure("invalid_output");
      res = await callWithRetries(retry, env, 0, deadlineAt, opts.signal, (u) => {
        billedUnknown = u;
      });
      iterations.push(...res.iterations);
      servedModel = res.servedModel;
      lastStop = res.stopReason === "refusal" ? `refusal:${res.stopCategory ?? "null"}` : res.stopReason;
      if (res.stopReason === "refusal") throw new RunFailure("refused");
      if (res.stopReason === "max_tokens") throw new RunFailure("max_tokens");
      if (res.parsed === null) throw new RunFailure("invalid_output");
    }
    releaseSlot?.();
    releaseSlot = null;
    if (res.fellBack) flags.push("fallback_model");
    if (plan.fast && !res.fastDropped) flags.push("fast");
    const raw = spec.format ? res.parsed : res.text;
    if (canary && (containsCanary(raw, canary) || containsCanary(res.text, canary))) throw new RunFailure("invalid_output", undefined, ["canary_leak"]);
    const fin = finalize(raw, fctx);
    if (!fin) throw new RunFailure("invalid_output");
    if (canary && containsCanary(fin.value, canary)) throw new RunFailure("invalid_output", undefined, ["canary_leak"]);
    if (fin.rejected.length) flags.push("guard_partial");
    // 9. reconcile, the run row, the cache
    const micros = costMicros(iterations, prices, { batch: false, fast: plan.fast && !res.fastDropped, writeTtl: settings.cacheTtl.platform }).micros;
    const usage = usageOf(iterations, micros);
    if (reservation) await reconcile(reservation, { micros, credits: usage.credits });
    const ms = Date.now() - ctx.started;
    const allFlags = [...new Set(flags)];
    await finishRun(ws, runId, {
      status: "ok",
      model: res.servedModel,
      stopReason: lastStop,
      usage,
      costMicros: micros,
      credits: usage.credits,
      flags: allFlags,
      rejectedFields: fin.rejected,
      ms,
      ttftMs: res.ttftMs,
      output: fin.value,
      reconciled: reservation !== null,
    });
    if (cacheable && !opts.nonce) await cacheWrite(ws, cacheKey, raw, cacheExpiry(def.cacheTtlDays));
    const notes: AiFallbackNote[] = res.fellBack ? [{ from: plan.model, to: res.servedModel, code: "model_refusal" }] : [];
    return okResult(fin.value, { plan, p, runId, jobId: opts.jobId ?? null, usage, ms, ttftMs: res.ttftMs, rejected: fin.rejected, flags: allFlags, notes, model: res.servedModel });
  } catch (err) {
    releaseSlot?.();
    if (err instanceof AiRouteError) throw err;
    const f = err instanceof RunFailure ? err : err instanceof AiServerError ? new RunFailure(err.code, err.retryAfterSec) : null;
    if (!f) {
      console.error(`[ai] run failed: ${err instanceof Error ? err.name : "error"}`);
    }
    const code: AiFailCode = f?.code ?? "unknown";
    await settle(ctx.scope, { reservation, runId, code, iterations, billedUnknown, sent, settings, plan, flags: [...flags, ...(f?.flags ?? [])], stop: lastStop, servedModel, started: ctx.started });
    return aiFailure(code, "server", runId, f?.retryAfterSec);
  }
}

/** Reconcile or release a failed run's reservation and write its run row (AI-§C.2 step 5). Never throws. */
async function settle(
  scope: WriteScope,
  s: { reservation: Reservation | null; runId: string | null; code: AiFailCode; iterations: IterationUsage[]; billedUnknown: boolean; sent: boolean; settings: PlatformAiSetting | null; plan: RoutePlan | null; flags: AiFlag[]; stop: string | null; servedModel: string | null; started: number },
): Promise<void> {
  try {
    let micros = 0;
    if (s.iterations.length && s.settings) micros = costMicros(s.iterations, effectivePrices(s.settings.prices).rows, { batch: false, fast: s.plan?.fast ?? false, writeTtl: s.settings.cacheTtl.platform }).micros;
    if (s.reservation) {
      if (micros > 0) await reconcile(s.reservation, { micros, credits: creditsFor(micros) });
      else if (s.sent && (s.billedUnknown || !UNBILLED.has(s.code))) await reconcile(s.reservation, { micros: s.reservation.micros, credits: s.reservation.credits });
      else await release(s.reservation);
    }
    if (s.runId) {
      const charged = micros > 0 ? micros : s.reservation && s.reservation.state === "reconciled" ? s.reservation.micros : 0;
      await finishRun(scope, s.runId, {
        status: STATUS_OF[s.code] ?? "error",
        errorCode: s.flags.includes("canary_leak") ? "canary_leak" : s.code,
        model: s.servedModel,
        stopReason: s.stop,
        usage: s.iterations.length ? usageOf(s.iterations, micros) : null,
        costMicros: charged,
        credits: creditsFor(charged),
        flags: [...new Set(s.flags)],
        ms: Date.now() - s.started,
        reconciled: s.reservation !== null,
      });
    }
  } catch (err) {
    console.error(`[ai] settle failed: ${err instanceof Error ? err.name : "error"}`);
  }
}

/** Retryable provider failures inside the deadline, on the same reservation (AI-§A.4 step 10). */
async function callWithRetries(spec: CallSpec, env: CallEnv, retries: number, deadlineAt: number, signal: AbortSignal | undefined, billed: (unknown: boolean) => void): Promise<CallResult> {
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await callClaude({ ...spec, deadlineMs: deadlineAt - Date.now() }, env);
      billed(false);
      return r;
    } catch (err) {
      const e = err instanceof AiServerError ? err : new AiServerError("unknown", false);
      // the request went out and its outcome is unknown: the provider may have billed (AI-§C.2 step 5)
      billed(e.code === "timeout" || e.code === "cancelled");
      const left = deadlineAt - Date.now();
      const backoff = RETRY_BACKOFF_MS[Math.min(attempt, RETRY_BACKOFF_MS.length - 1)]!;
      const wait = e.retryAfterSec !== undefined && e.retryAfterSec * 1000 < left ? e.retryAfterSec * 1000 : backoff;
      const ok = e.retryable && attempt < retries && wait < left && (e.code !== "timeout" || left >= TIMEOUT_RETRY_MIN_LEFT_MS) && !signal?.aborted;
      if (!ok) throw e;
      await sleep(wait, signal);
    }
  }
}

function okResult(
  value: unknown,
  r: { plan: RoutePlan; p: PromptVersion; runId: string; jobId: string | null; usage: AiUsage; ms: number; ttftMs: number | null; rejected: string[]; flags: AiFlag[]; notes: AiFallbackNote[]; model: string },
): AiResult<unknown> {
  return {
    ok: true,
    value,
    provider: "server",
    class: r.plan.class,
    model: r.model,
    effort: r.plan.effort,
    promptVersion: r.p.version,
    rubricVersion: r.p.rubricVersion,
    runId: r.runId,
    jobId: r.jobId,
    usage: r.usage,
    ms: r.ms,
    ttftMs: r.ttftMs,
    rejected: r.rejected,
    flags: r.flags,
    notes: r.notes,
  };
}
