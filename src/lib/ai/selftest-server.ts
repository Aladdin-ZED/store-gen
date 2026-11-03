/**
 * test:ai sections of the server provider (P7 AI; ai.md AI-§B.3, AI-§B.7, AI-§B.10, AI-§B.11, AI-§A.5; step 7 of
 * the P7 plan). Registered by src/lib/ai/selftest.ts. Offline: the calls go through a real `@anthropic-ai/sdk` client
 * whose `fetch` is a scripted function (no socket, no key), so the SDK's own error classes and stream parser run.
 *
 *   server-errors     fromSdkError with real SDK error instances, most specific first; retry-after; our deadline
 *   server-breaker    5 counted failures in 2 min open it for 60 s, one trial, auth until fixed (fake clock)
 *   server-semaphore  per-class caps, 3 Worker / 1 Director per store, round-robin across stores, busy after the wait
 *   server-request    the builder per R1 task: effort always, no thinking / sampling / prefill, fallbacks and their
 *                     beta absent on fast, max_tokens ≤ the class ceiling, director_deep only from a job or a batch,
 *                     the image limits, fast mode only on copy.field, batchParams without betas / fallbacks / speed
 *   server-call       shape A and B, the stream, stop_reason before content (a refusal's partial text never throws),
 *                     the served model ∈ {class model, its server-side fallbacks} under every failure-code flip, the
 *                     breaker through the call, the fast 429 retry without speed, the deadline and the caller's abort
 *   server-inputs     every R1 eval fixture's input passes its strict schema; unknown keys and bad shapes are refused
 *   library-provider  every supported task answers from the library (provider library, no model, 0 credits)
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Anthropic, { APIConnectionError, APIConnectionTimeoutError, APIError, APIUserAbortError, AuthenticationError, BadRequestError, ConflictError, InternalServerError, NotFoundError, PermissionDeniedError, RateLimitError } from "@anthropic-ai/sdk";
import type { BetaMessageParam, BetaTextBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { PlatformAi, type PlatformAiSetting } from "@/lib/settings/keys/platform_ai";
import { ALL_FIXTURES, storeCtxOf } from "./eval/fixtures";
import { assemble } from "./prompts/assemble";
import { promptFor } from "./prompts/registry";
import { LIBRARY_TASKS, libraryResult } from "./provider/library";
import type { AiTaskInput } from "./provider/types";
import { TASK_INPUTS, parseTaskInput } from "./schema/tasks/inputs";
import { BREAKER, CircuitBreaker } from "./server/breaker";
import { callClaude, fastCooling, type CallEnv } from "./server/call";
import { AiServerError, fromSdkError, retryAfterOf } from "./server/errors";
import { AiRequestError, FALLBACK_BETA, FAST_BETA, assertSpec, batchParams, buildParams, inputImagesWithin, iterationsOf, servedModelOf, type CallSpec } from "./server/request";
import { AiBusyError, ClassSemaphores } from "./server/semaphore";
import { TASKS, routeFor, type AiTaskId, type TaskClass } from "./tasks";

export interface ServerSelftestApi {
  section(name: string, run: () => void | Promise<void>, opts?: { slow?: boolean; strict?: boolean }): void;
  check(ok: boolean, msg: string): void;
  eq(a: unknown, b: unknown, msg: string): void;
}

const DEFAULTS: PlatformAiSetting = PlatformAi.parse({});
const R1_SERVER_TASKS = ["analyze", "copy.page", "copy.hero", "copy.field", "design.plan", "design.critique", "injection.screen", "ad.brief", "callcenter.script"] as const satisfies readonly AiTaskId[];
/** the models `fallbacks: "default"` may route to (AI-§B.2, seeded for that reason) */
const SERVER_FALLBACKS = ["claude-opus-5", "claude-opus-4-8"];

/* ------------------------------------------------------------------ */
/* A scripted fetch for a real SDK client                              */
/* ------------------------------------------------------------------ */

type Script =
  | { kind: "ok"; text: string; model?: string; iterations?: unknown[] }
  | { kind: "refusal"; text: string; category: string | null }
  | { kind: "max_tokens"; text: string }
  | { kind: "status"; status: number; type: string; retryAfter?: string }
  | { kind: "hang" };

interface Scripted {
  fetch: typeof fetch;
  queue: Script[];
  bodies: Record<string, unknown>[];
  calls: number;
}

function message(s: Extract<Script, { kind: "ok" | "refusal" | "max_tokens" }>, model: string): Record<string, unknown> {
  const usage: Record<string, unknown> = { input_tokens: 800, output_tokens: 120, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  if (s.kind === "ok" && s.iterations) usage.iterations = s.iterations;
  return {
    id: "msg_selftest",
    type: "message",
    role: "assistant",
    model: s.kind === "ok" && s.model ? s.model : model,
    content: s.text ? [{ type: "text", text: s.text }] : [],
    stop_reason: s.kind === "ok" ? "end_turn" : s.kind,
    stop_sequence: null,
    stop_details: s.kind === "refusal" ? { type: "refusal", category: s.category, explanation: null } : null,
    usage,
  };
}

function sse(msg: Record<string, unknown>): string {
  const text = ((msg.content as { text: string }[])[0]?.text ?? "") as string;
  const ev = (type: string, data: Record<string, unknown>) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
  let out = ev("message_start", { message: { ...msg, content: [], stop_reason: null, stop_details: null, usage: { ...(msg.usage as object), output_tokens: 1 } } });
  out += ev("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
  for (let i = 0; i < text.length; i += 7) out += ev("content_block_delta", { index: 0, delta: { type: "text_delta", text: text.slice(i, i + 7) } });
  out += ev("content_block_stop", { index: 0 });
  out += ev("message_delta", { delta: { stop_reason: msg.stop_reason, stop_sequence: null, stop_details: msg.stop_details }, usage: msg.usage as object });
  out += ev("message_stop", {});
  return out;
}

function scripted(): Scripted {
  const s: Scripted = {
    queue: [],
    bodies: [],
    calls: 0,
    fetch: (async (_url: unknown, init?: RequestInit) => {
      s.calls++;
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      s.bodies.push(body);
      const next = s.queue.shift() ?? { kind: "ok", text: '{"suspicious":false,"reason":"plain"}' };
      if (next.kind === "hang") {
        return new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true });
        });
      }
      if (next.kind === "status") {
        const headers: Record<string, string> = { "content-type": "application/json" };
        if (next.retryAfter) headers["retry-after"] = next.retryAfter;
        return new Response(JSON.stringify({ type: "error", error: { type: next.type, message: "scripted" } }), { status: next.status, headers });
      }
      const msg = message(next, String(body.model));
      if (body.stream === true) return new Response(sse(msg), { status: 200, headers: { "content-type": "text/event-stream" } });
      return new Response(JSON.stringify(msg), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch,
  };
  return s;
}

/** A real SDK client over the scripted fetch, built like AI-§B.1 (no environment variable can reach it). */
function client(s: Scripted): Anthropic {
  return new Anthropic({ apiKey: "sk-ant-selftest-0000000000000000", baseURL: "https://api.anthropic.com", authToken: null, logLevel: "off", maxRetries: 0, timeout: 90_000, fetch: s.fetch });
}

const SYSTEM: BetaTextBlockParam[] = [{ type: "text", text: "platform", cache_control: { type: "ephemeral", ttl: "1h" } }];
const USER: BetaMessageParam[] = [{ role: "user", content: [{ type: "text", text: "data" }] }];

function specFor(task: AiTaskId, patch: Partial<CallSpec> = {}, settings = DEFAULTS): CallSpec {
  const plan = routeFor(task, settings, TASKS[task].class === "director_deep" ? { pattern: "B" } : {});
  const p = TASKS[task].family ? promptFor(TASKS[task].family!, settings, "server") : null;
  return {
    task,
    class: plan.class,
    model: plan.model,
    effort: plan.effort,
    maxTokens: plan.maxTokens,
    pattern: plan.pattern,
    system: SYSTEM,
    messages: USER,
    ...(p?.format ? { format: p.format } : {}),
    stream: plan.call === "stream",
    fallbacks: plan.fallbacks,
    fast: plan.fast,
    deadlineMs: 5_000,
    ...patch,
  };
}

const sdkErr = <E>(make: () => E): E => make();

export function registerServerSections(t: ServerSelftestApi): void {
  const { section, check, eq } = t;

  section("server-errors", () => {
    const h = (o: Record<string, string> = {}) => new Headers(o);
    const body = { type: "error", error: { type: "x", message: "m" } };
    const cases: [string, unknown, string, boolean][] = [
      ["401 AuthenticationError", sdkErr(() => new AuthenticationError(401, body, "m", h())), "provider_auth", false],
      ["403 PermissionDeniedError", sdkErr(() => new PermissionDeniedError(403, body, "m", h())), "provider_auth", false],
      ["404 NotFoundError", sdkErr(() => new NotFoundError(404, body, "m", h())), "model_unavailable", false],
      ["400 BadRequestError", sdkErr(() => new BadRequestError(400, body, "m", h())), "bad_request", false],
      ["429 RateLimitError", sdkErr(() => new RateLimitError(429, body, "m", h({ "retry-after": "7" }))), "rate_limited", true],
      ["500 InternalServerError", sdkErr(() => new InternalServerError(500, body, "m", h())), "provider_error", true],
      ["529 InternalServerError", sdkErr(() => new InternalServerError(529, body, "m", h())), "provider_overloaded", true],
      ["529 through APIError.generate", APIError.generate(529, { type: "error", error: { type: "overloaded_error", message: "m" } }, "m", h()), "provider_overloaded", true],
      ["APIConnectionTimeoutError", new APIConnectionTimeoutError(), "timeout", true],
      ["APIConnectionError", new APIConnectionError({ message: "refused" }), "provider_error", true],
      ["APIUserAbortError", new APIUserAbortError(), "cancelled", false],
      ["409 ConflictError (another APIError)", sdkErr(() => new ConflictError(409, body, "m", h())), "provider_error", false],
      ["502 bare APIError", new APIError(502, body, "m", h()), "provider_error", true],
      ["a plain Error", new Error("boom"), "unknown", false],
    ];
    for (const [name, err, code, retryable] of cases) {
      const e = fromSdkError(err);
      check(e instanceof AiServerError && e.code === code && e.retryable === retryable, `${name} → ${code} (retryable ${retryable}): got ${e.code} / ${e.retryable}`);
    }
    eq(fromSdkError(new RateLimitError(429, body, "m", h({ "retry-after": "7" }))).retryAfterSec, 7, "429 keeps retry-after");
    eq(fromSdkError(new APIUserAbortError(), { deadline: true }).code, "timeout", "an abort of our own deadline is timeout");
    check(fromSdkError(new InternalServerError(529, body, "m", h())).breaker && fromSdkError(new APIConnectionError({ message: "x" })).breaker && !fromSdkError(new BadRequestError(400, body, "m", h())).breaker, "overloads, 5xx and connection failures count toward the breaker, a 400 does not");
    eq(retryAfterOf(h({ "retry-after-ms": "2500" })), 2.5, "retry-after-ms wins, in seconds");
    eq(retryAfterOf(h({ "retry-after": "Thu, 28 Oct 2026 09:00:10 GMT" }), Date.UTC(2026, 9, 28, 9, 0, 0)), 10, "an HTTP-date retry-after");
    eq(retryAfterOf(h()), undefined, "no header → undefined");
  });

  section("server-breaker", () => {
    let now = Date.UTC(2026, 9, 28, 9, 0, 0);
    const b = new CircuitBreaker(() => now);
    for (let i = 0; i < BREAKER.failures - 1; i++) b.record("provider_overloaded", false);
    check(!b.paused() && b.allow().ok, "4 overloads stay closed");
    now += BREAKER.windowMs + 1;
    b.record("provider_error", false);
    check(!b.paused(), "failures older than 2 minutes do not count");
    for (let i = 0; i < BREAKER.failures - 1; i++) b.record("provider_error", false);
    check(b.paused() && b.state() === "open", "5 counted failures within 2 minutes open it");
    const refused = b.allow();
    check(!refused.ok && refused.code === "provider_overloaded" && (refused.retryAfterSec ?? 0) > 0, "open: calls refused with provider_overloaded and a retry-after");
    now += BREAKER.pauseMs;
    check(!b.paused() && b.state() === "half_open", "after 60 s: half open (the policy no longer says paused)");
    const trial = b.allow();
    check(trial.ok && trial.trial, "one trial goes out");
    check(!b.allow().ok, "a second call during the trial is refused");
    b.record("provider_overloaded", true);
    check(b.state() === "open", "a failed trial opens it again for 60 s");
    now += BREAKER.pauseMs;
    const t2 = b.allow();
    b.record("ok", t2.ok && t2.trial);
    check(b.state() === "closed" && b.allow().ok, "a successful trial closes it");
    b.record("bad_request", false);
    b.record("rate_limited", false);
    check(b.state() === "closed", "400 and 429 never count");
    check(b.tripAuth() && !b.tripAuth(), "auth: the first trip answers true (one staff notification), later ones false");
    now += 3_600_000;
    check(b.paused() && b.state() === "auth" && !b.allow().ok, "auth stays paused until fixed, whatever the time");
    b.authCleared();
    check(!b.paused() && b.allow().ok, "the key changed / Test connection succeeded: closed");
  });

  section("server-semaphore", async () => {
    const caps = { concurrentDirector: 4, concurrentWorker: 8, concurrentFast: 12, perStoreWorker: 3 };
    const s = new ClassSemaphores(caps);
    const a = await Promise.all([0, 1, 2].map(() => s.acquire("worker", "A", { maxWaitMs: 50 })));
    check(a.length === 3 && s.stats().worker.inUse === 3, "store A takes its 3 Worker slots");
    let busy: unknown = null;
    try {
      await s.acquire("worker", "A", { maxWaitMs: 30 });
    } catch (err) {
      busy = err;
    }
    check(busy instanceof AiBusyError, "a 4th Worker call of store A waits, then is busy (pattern A)");
    const order: string[] = [];
    const more = [...["B", "B", "B", "C", "C", "C"].map((sid) => s.acquire("worker", sid, { maxWaitMs: 1_000 }).then((r) => (order.push(sid), r)))];
    const got = await Promise.all(more.slice(0, 5));
    check(s.stats().worker.inUse === 8, "the Worker pool stops at 8");
    const waiting = more[5]!;
    a[0]!();
    const last = await waiting;
    check(order.length === 6, "a released slot goes to the next waiter");
    eq(order.slice(0, 5).filter((x) => x === "B").length >= 2 && order.slice(0, 5).filter((x) => x === "C").length >= 2, true, "stores B and C share the free slots (round-robin, not FIFO across stores)");
    [...a.slice(1), ...got, last].forEach((r) => r());
    eq(s.stats().worker.inUse, 0, "every release returns its slot (twice is harmless)");
    a[1]!();
    const d1 = await s.acquire("director_interactive", "A", { maxWaitMs: 30 });
    let dBusy: unknown = null;
    try {
      await s.acquire("director_interactive", "A", { maxWaitMs: 20 });
    } catch (err) {
      dBusy = err;
    }
    const deep = await s.acquire("director_deep", "A", { maxWaitMs: 30 });
    check(dBusy instanceof AiBusyError, "1 interactive Director call per store");
    eq(s.stats().director.inUse, 2, "the deep class shares the Director pool");
    d1();
    deep();
    const fast = await Promise.all(Array.from({ length: 12 }, () => s.acquire("fast", "A", { maxWaitMs: 30 })));
    eq(s.stats().fast.inUse, 12, "fast: 12 in flight, no per-store limit");
    fast.forEach((r) => r());
    const ctrl = new AbortController();
    const blockers = await Promise.all([0, 1, 2].map(() => s.acquire("worker", "Z", { maxWaitMs: null })));
    const pending = s.acquire("worker", "Z", { maxWaitMs: null, signal: ctrl.signal });
    ctrl.abort(new Error("stop"));
    let aborted = false;
    try {
      await pending;
    } catch {
      aborted = true;
    }
    check(aborted && s.stats().worker.waiting === 0, "an aborted waiter leaves the queue");
    blockers.forEach((r) => r());
  });

  section("server-request", () => {
    for (const task of R1_SERVER_TASKS) {
      const f = ALL_FIXTURES.find((x) => x.task === task);
      const p = promptFor(TASKS[task].family!, DEFAULTS, "server");
      if (!f || !p) {
        check(false, `${task}: a fixture and a server prompt exist`);
        continue;
      }
      const prompt = assemble({ kind: "system", storeId: storeCtxOf(f).storeId } as never, p, f.input as never, storeCtxOf(f), { canary: p.canary ? "0123456789abcdef" : null });
      const plan = routeFor(task, DEFAULTS);
      const spec: CallSpec = { task, class: plan.class, model: plan.model, effort: plan.effort, maxTokens: plan.maxTokens, pattern: plan.pattern, system: prompt.system, messages: prompt.messages, ...(prompt.format ? { format: prompt.format } : {}), stream: plan.call === "stream", fallbacks: plan.fallbacks, fast: plan.fast, deadlineMs: plan.deadlineMs ?? 60_000 };
      let ok = true;
      try {
        assertSpec(spec, { classMaxTokens: DEFAULTS.classes[plan.class].maxTokens, maxImages: DEFAULTS.vision.maxImages });
      } catch {
        ok = false;
      }
      check(ok, `${task}: the spec passes the builder's rules`);
      const params = buildParams(spec) as unknown as Record<string, unknown>;
      const oc = params.output_config as { effort?: string; format?: { type: string; schema: unknown } };
      check(oc.effort === plan.effort, `${task}: output_config.effort = ${plan.effort}`);
      check(!("thinking" in params) && !("temperature" in params) && !("top_p" in params) && !("top_k" in params), `${task}: no thinking, no sampling parameter`);
      const msgs = params.messages as BetaMessageParam[];
      check(msgs[msgs.length - 1]!.role !== "assistant", `${task}: no assistant prefill`);
      check(!("tool_choice" in params), `${task}: no tool_choice`);
      check((params.max_tokens as number) <= DEFAULTS.classes[plan.class].maxTokens, `${task}: max_tokens ≤ the ${plan.class} ceiling`);
      check(oc.format?.type === "json_schema", `${task}: a structured-output format`);
      const betas = (params.betas as string[] | undefined) ?? [];
      if (plan.class === "fast") check(!("fallbacks" in params) && !betas.includes(FALLBACK_BETA), `${task}: the fast class never carries fallbacks or their beta`);
      else check(params.fallbacks === "default" && betas.includes(FALLBACK_BETA), `${task}: ${plan.class} carries fallbacks "default" and ${FALLBACK_BETA}`);
      check(!("speed" in params) && !betas.includes(FAST_BETA), `${task}: no fast mode by default`);
      const bp = batchParams(spec) as unknown as Record<string, unknown>;
      check(!("betas" in bp) && !("fallbacks" in bp) && !("speed" in bp) && (bp.output_config as { effort?: string }).effort === plan.effort, `${task}: batchParams has no betas, fallbacks or speed and keeps effort`);
    }
    const off = PlatformAi.parse({ fallbacks: "off" });
    check(!("fallbacks" in (buildParams(specFor("copy.page", {}, off)) as object)), "platform_ai.fallbacks = off removes fallbacks and the beta");
    const rule = (spec: CallSpec, limits = { classMaxTokens: 8_000, maxImages: 3 }): string | null => {
      try {
        assertSpec(spec, limits);
        return null;
      } catch (err) {
        return err instanceof AiRequestError ? err.rule : "other";
      }
    };
    eq(rule(specFor("injection.screen", { fallbacks: true })), "fast_class_fallbacks", "fallbacks on the fast class are refused");
    eq(rule(specFor("copy.page", { maxTokens: 9_000 })), "max_tokens", "max_tokens above the class ceiling is refused");
    eq(rule({ ...specFor("store.blueprint"), pattern: "A" }, { classMaxTokens: 32_000, maxImages: 3 }), "deep_outside_job", "a director_deep call in pattern A is refused");
    eq(rule({ ...specFor("store.blueprint"), pattern: "B" }, { classMaxTokens: 32_000, maxImages: 3 }), null, "a director_deep call from a job (B) passes");
    eq(rule(specFor("copy.page", { messages: [...USER, { role: "assistant", content: "{" }] })), "prefill", "a trailing assistant message (prefill) is refused");
    const img = (bytes: number) => ({ type: "image" as const, source: { type: "base64" as const, media_type: "image/webp" as const, data: "A".repeat(Math.ceil((bytes * 4) / 3)) } });
    eq(rule(specFor("analyze", { messages: [{ role: "user", content: [img(1_000), img(1_000), img(1_000), img(1_000)] }] })), "images", "4 images are refused (≤ 3)");
    eq(rule(specFor("analyze", { messages: [{ role: "user", content: [img(401 * 1024)] }] })), "image_bytes", "an image over 400 KB is refused");
    const photo = (w: number, h: number) => ({ mediaType: "image/webp", data: "AAAA", w, h });
    check(inputImagesWithin({ images: [photo(1_024, 768), photo(768, 1_024), photo(1_024, 1_024)] }, DEFAULTS.vision), "3 photos of ≤ 1,024 px pass platform_ai.vision");
    check(!inputImagesWithin({ images: [photo(1_025, 600)] }, DEFAULTS.vision), "a photo over 1,024 px on its long side is refused (input_invalid)");
    check(!inputImagesWithin({ images: [photo(512, 512), photo(512, 512), photo(512, 512), photo(512, 512)] }, DEFAULTS.vision), "4 photos are refused by platform_ai.vision.maxImages");
    eq(rule(specFor("copy.page", { fast: true })), "fast_route", "fast mode is only for copy.field (and copilot.turn)");
    const fastSettings = PlatformAi.parse({ classes: { worker: { model: "claude-opus-5-5", effort: "low", maxTokens: 8_000, timeoutMs: 60_000, fallbacks: "default", batch: "allowed" } }, evalGate: { judgeModel: "claude-fable-5-1" }, routes: { "copy.field": { fast: true } } });
    const fastSpec = specFor("copy.field", {}, fastSettings);
    const fp = buildParams(fastSpec) as unknown as Record<string, unknown>;
    check(fastSpec.fast && fp.speed === "fast" && (fp.betas as string[]).includes(FAST_BETA) && (fp.betas as string[]).includes(FALLBACK_BETA), "copy.field fast on an Opus worker: speed fast, both betas");
    check(!routeFor("copy.page", PlatformAi.parse({ ...fastSettings, routes: { "copy.page": { fast: true } } })).fast, "fast is never routed for copy.page");
    let threw = false;
    try {
      routeFor("store.blueprint", DEFAULTS, { pattern: "A" });
    } catch {
      threw = true;
    }
    check(threw, "routeFor refuses director_deep outside a job or a batch");
  });

  section("server-call", async () => {
    const json = '{"suspicious":false,"reason":"plain product data"}';
    // shape A and B, non-stream
    for (const shape of ["parse", "create"] as const) {
      const s = scripted();
      s.queue.push({ kind: "ok", text: json });
      const r = await callClaude(specFor("injection.screen"), { client: client(s), callShape: shape, breaker: new CircuitBreaker() });
      eq(r.parsed, { suspicious: false, reason: "plain product data" }, `shape ${shape}: parsed with the loose schema`);
      eq([r.servedModel, r.fellBack], [DEFAULTS.classes.fast.model, false], `shape ${shape}: served by the class model`);
      const sent = s.bodies[0]!;
      check((sent.output_config as { effort?: string }).effort === "low" && !("fallbacks" in sent), `shape ${shape}: effort sent, no fallbacks on fast`);
    }
    // the stream (copy.page streams)
    {
      const s = scripted();
      s.queue.push({ kind: "ok", text: '{"kicker":"Fait main","headline":"Un savon doux"}' });
      const deltas: string[] = [];
      const r = await callClaude(specFor("copy.page", { onText: (d) => deltas.push(d) }), { client: client(s), callShape: "parse", breaker: new CircuitBreaker() });
      check(s.bodies[0]!.stream === true && deltas.length > 1 && deltas.join("") === r.text, "stream: text deltas forwarded in order, final text = their join");
      check(r.ttftMs !== null && r.parsed === null && r.parseError !== null, "stream: ttft measured; a partial copy object fails the loose schema without throwing");
    }
    // stop_reason before content: a refusal's partial text never throws, in both shapes and in the stream
    for (const [shape, stream] of [["parse", false], ["create", false], ["parse", true]] as const) {
      const s = scripted();
      s.queue.push({ kind: "refusal", text: '{"headline": "Un', category: "general_harms" });
      const r = await callClaude(specFor(stream ? "copy.page" : "copy.hero"), { client: client(s), callShape: shape, breaker: new CircuitBreaker() });
      check(r.stopReason === "refusal" && r.stopCategory === "general_harms" && r.parsed === null && r.parseError === null, `refusal (${shape}${stream ? ", stream" : ""}): stop_reason read, the partial content not parsed`);
    }
    {
      const s = scripted();
      s.queue.push({ kind: "max_tokens", text: '{"kicker":"' });
      const r = await callClaude(specFor("copy.hero"), { client: client(s), callShape: "parse", breaker: new CircuitBreaker() });
      check(r.stopReason === "max_tokens", "max_tokens: stop_reason readable before the content");
    }
    // the served model under every failure-code flip
    const flips: Script[] = [
      { kind: "ok", text: json },
      { kind: "status", status: 429, type: "rate_limit_error" },
      { kind: "status", status: 529, type: "overloaded_error" },
      { kind: "status", status: 500, type: "api_error" },
      { kind: "status", status: 400, type: "invalid_request_error" },
      { kind: "status", status: 401, type: "authentication_error" },
      { kind: "status", status: 404, type: "not_found_error" },
      { kind: "ok", text: '{"oops": tru' },
      { kind: "refusal", text: "", category: "cyber" },
    ];
    for (const cls of ["director_interactive", "worker", "fast"] as const satisfies readonly TaskClass[]) {
      const task: AiTaskId = cls === "worker" ? "copy.hero" : cls === "fast" ? "injection.screen" : "design.plan";
      const model = DEFAULTS.classes[cls].model;
      const allowed = cls === "fast" ? [model] : [model, ...SERVER_FALLBACKS];
      const scripts: Script[] = cls === "fast" ? flips : [...flips, { kind: "ok", text: json, model: "claude-opus-5", iterations: [{ type: "message", model, input_tokens: 10, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, cache_creation: null }, { type: "fallback_message", model: "claude-opus-5", input_tokens: 800, output_tokens: 120, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, cache_creation: null }] }];
      let served = 0;
      for (const sc of scripts) {
        const s = scripted();
        s.queue.push(sc);
        try {
          const r = await callClaude(specFor(task, { stream: false }), { client: client(s), callShape: "parse", breaker: new CircuitBreaker() });
          served++;
          check(allowed.includes(r.servedModel), `${cls} / ${sc.kind}${sc.kind === "status" ? ` ${sc.status}` : ""}: served by ${r.servedModel} ∈ {${allowed.join(", ")}}`);
          if (r.servedModel !== model) check(r.fellBack && r.iterations.some((i) => i.kind === "fallback_message"), `${cls}: a server-side fallback is flagged and its iteration kept`);
        } catch (err) {
          check(err instanceof AiServerError, `${cls} / ${sc.kind}: a failure is an AiServerError`);
        }
      }
      check(served >= 3, `${cls}: the successful flips were served`);
    }
    // iterations: Σ at each model's own row
    const its = iterationsOf({ model: "claude-opus-5", usage: { input_tokens: 1, output_tokens: 1, iterations: [{ type: "message", model: "claude-opus-5-5", input_tokens: 5, output_tokens: 2 }, { type: "fallback_message", model: "claude-opus-5", input_tokens: 7, output_tokens: 3 }] } as never });
    eq(its.map((i) => [i.kind, i.model, i.inTok, i.outTok]), [["message", "claude-opus-5-5", 5, 2], ["fallback_message", "claude-opus-5", 7, 3]], "iterationsOf keeps each attempt with its model");
    eq(servedModelOf({ model: "claude-opus-5-5", usage: { input_tokens: 1, output_tokens: 1 } as never }, "claude-opus-5-5"), { servedModel: "claude-opus-5-5", fellBack: false }, "no iteration list: the top-level usage, not fallen back");
    // the breaker through the call: 5 × 529 open it, the 6th call never reaches the API
    {
      let now = Date.UTC(2026, 9, 28, 9, 0, 0);
      const b = new CircuitBreaker(() => now);
      const s = scripted();
      for (let i = 0; i < 5; i++) s.queue.push({ kind: "status", status: 529, type: "overloaded_error" });
      for (let i = 0; i < 5; i++) await callClaude(specFor("copy.hero"), { client: client(s), callShape: "parse", breaker: b }).catch(() => null);
      const before = s.calls;
      const e = await callClaude(specFor("copy.hero"), { client: client(s), callShape: "parse", breaker: b }).catch((x: unknown) => x);
      check(b.paused() && s.calls === before && e instanceof AiServerError && e.code === "provider_overloaded", "5 × 529 open the breaker; the next call is refused without a request");
      now += BREAKER.pauseMs;
      s.queue.push({ kind: "ok", text: '{"kicker":"a","headline":"b","sub":"c","cta":"d"}' });
      const ok = await callClaude(specFor("copy.hero"), { client: client(s), callShape: "parse", breaker: b });
      check(ok.parsed !== null && b.state() === "closed", "after 60 s the single trial succeeds and closes it");
      let notified = 0;
      const env: CallEnv = { client: client(s), callShape: "parse", breaker: b, onAuthFailure: () => notified++ };
      s.queue.push({ kind: "status", status: 401, type: "authentication_error" }, { kind: "status", status: 401, type: "authentication_error" });
      await callClaude(specFor("copy.hero"), env).catch(() => null);
      const e2 = await callClaude(specFor("copy.hero"), env).catch((x: unknown) => x);
      check(notified === 1 && b.state() === "auth" && e2 instanceof AiServerError && e2.code === "provider_auth", "an auth failure pauses until fixed; staff notified once");
    }
    // fast 429 → one retry without speed, the route cools 10 minutes
    {
      const fastSettings = PlatformAi.parse({ classes: { worker: { model: "claude-opus-5-5", effort: "low", maxTokens: 8_000, timeoutMs: 60_000, fallbacks: "default", batch: "allowed" } }, evalGate: { judgeModel: "claude-fable-5-1" }, routes: { "copy.field": { fast: true } } });
      const s = scripted();
      s.queue.push({ kind: "status", status: 429, type: "rate_limit_error" }, { kind: "ok", text: '{"variants":["Plus court"]}' });
      const r = await callClaude(specFor("copy.field", {}, fastSettings), { client: client(s), callShape: "parse", breaker: new CircuitBreaker() });
      const [first, second] = s.bodies;
      check(first!.speed === "fast" && !("speed" in second!) && !((second!.betas as string[] | undefined) ?? []).includes(FAST_BETA) && r.fastDropped, "fast 429: retried once without speed and without the fast beta");
      check(fastCooling("copy.field"), "the fast route cools for 10 minutes");
    }
    // the deadline and the caller's abort
    {
      const s = scripted();
      s.queue.push({ kind: "hang" });
      const e = await callClaude(specFor("copy.hero", { deadlineMs: 40 }), { client: client(s), callShape: "parse", breaker: new CircuitBreaker() }).catch((x: unknown) => x);
      check(e instanceof AiServerError && e.code === "timeout" && e.retryable, "our deadline → timeout (retryable)");
      const ctrl = new AbortController();
      s.queue.push({ kind: "hang" });
      const p = callClaude(specFor("copy.hero", { deadlineMs: 5_000, signal: ctrl.signal }), { client: client(s), callShape: "parse", breaker: new CircuitBreaker() }).catch((x: unknown) => x);
      setTimeout(() => ctrl.abort(), 10);
      const e2 = await p;
      check(e2 instanceof AiServerError && e2.code === "cancelled" && !e2.retryable, "the caller's abort → cancelled (not retryable)");
    }
  });

  section("server-inputs", () => {
    let parsed = 0;
    let total = 0;
    const bad: string[] = [];
    for (const f of ALL_FIXTURES) {
      if (!TASK_INPUTS[f.task] || f.task === "eval.judge") continue;
      total++;
      // the photo bytes are filled by the harness (withPhotos); a placeholder stands in for them here
      const input = f.task === "analyze" || f.task === "design.plan" ? { ...(f.input as object), images: ((f.input as { images?: object[] }).images ?? []).map((i) => ({ ...i, data: "AAAA" })) } : f.input;
      if (parseTaskInput(f.task, input).ok) parsed++;
      else if (bad.length < 5) bad.push(f.id);
    }
    check(total > 250 && parsed === total, `every R1 fixture input passes its strict schema (${parsed}/${total}; first refused: ${bad.join(", ")})`);
    const f = ALL_FIXTURES.find((x) => x.task === "copy.page")!;
    check(!parseTaskInput("copy.page", { ...(f.input as object), customerPhone: "0600000000" }).ok, "an unknown key (a customer field) is refused");
    check(!parseTaskInput("copy.page", { ...(f.input as object), product: { ...(f.input as { product: object }).product, priceMinor: 12.5 } }).ok, "money is integer minor units");
    check(!parseTaskInput("injection.screen", { text: "x".repeat(4_001), source: "note" }).ok, "bounded strings");
    check(!parseTaskInput("analyze", { images: [], adminLocale: "fr", product: { name: null, category: null } }).ok, "analyze needs a photo");
    check(!parseTaskInput("store.blueprint", {}).ok, "a task without an R1 server schema is refused");
  });

  section("library-provider", () => {
    for (const task of LIBRARY_TASKS) {
      const f = ALL_FIXTURES.find((x) => x.task === task);
      if (!f) {
        check(false, `${task}: a fixture exists`);
        continue;
      }
      const r = libraryResult(task, f.input as AiTaskInput<typeof task>, { seed: f.seed, hasWhatsapp: f.store.hasWhatsapp, category: "beauty" });
      check(r.ok && r.provider === "library" && r.model === null && r.usage === null && r.value !== null, `${task}: the library answers (provider library, no model, no usage)`);
      if (task === "ad.brief" && r.ok) eq([(r.value as { angles: unknown[] }).angles.length, (r.value as { filmChecklist: unknown[] }).filmChecklist.length], [0, 0], "ad.brief: an empty AdBriefOut (the template kit fills every field)");
      if (task === "design.plan" && r.ok) check((r.value as { directions: { hints: object }[] }).directions.every((d) => Object.keys(d.hints).length === 0), "design.plan: three slot briefs with empty hints");
    }
    const none = libraryResult("analyze", {} as never, { seed: 1, hasWhatsapp: false });
    check(!none.ok, "analyze has no library rung");
    // AI-20 (3), AI-15 (2): the library rungs and the call layer make no outbound call of their own (the SDK client is the only one)
    const root = join(__dirname, "..", "..", "..");
    for (const f of ["src/lib/ai/provider/library.ts", "src/lib/ai/provider/library-tasks.ts", "src/lib/ai/server/call.ts", "src/lib/ai/server/request.ts"]) {
      const src = readFileSync(join(root, f), "utf8");
      check(!/\bfetch\s*\(|XMLHttpRequest|node:https?|from "(?:https?|undici)"/.test(src), `${f}: no fetch, http or undici (AI-20 (3))`);
    }
  });
}
