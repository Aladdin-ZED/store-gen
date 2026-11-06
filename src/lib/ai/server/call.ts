/**
 * `callClaude(spec, env)`: one server call (P7 AI; ai.md AI-§B.3, AI-§B.6, AI-§B.7, AI-§B.9, AI-§B.10). Shape A
 * (`platform_ai.callShape = "parse"`): `client.beta.messages.parse` / `.stream` with a parseable format; shape B
 * (`"create"`): `client.beta.messages.create` / `.stream` with the plain JSON-schema format. Both return the same
 * `CallResult`: every text block of the final message concatenated in order (a mid-stream fallback continues in a new
 * block) and parsed with the loose schema here, so a parse failure never throws and `stop_reason` is always readable
 * before the content.
 *
 * The client comes in through `env` (the router passes `anthropic()`, tests a real SDK client over a scripted `fetch`),
 * so this file reads no key, no setting and no database. The deadline is the caller's: one abort signal joins the
 * caller's signal and the deadline timer; an abort of the deadline maps to `timeout`, the caller's to `cancelled`. The
 * breaker gates the call and records its outcome; an auth failure opens it until fixed and `env.onAuthFailure` runs
 * once. A 429 on a fast request is retried once without `speed` and the route cools for 10 minutes (AI-§B.9).
 */
import type Anthropic from "@anthropic-ai/sdk";
import type { BetaMessage } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { AutoParseableBetaOutputFormat } from "@anthropic-ai/sdk/lib/beta-parser";
import type { AiTaskId } from "../tasks";
import { breaker as processBreaker, type CircuitBreaker } from "./breaker";
import { AiServerError, fromSdkError } from "./errors";
import { readProcessState, writeProcessState } from "./process";
import { FAST_BETA, buildParams, iterationsOf, looseJsonSchema, parseLoose, servedModelOf, stopOf, textOf, type CallSpec, type IterationUsage } from "./request";

export interface CallEnv {
  client: Anthropic;
  /** `platform_ai.callShape` */
  callShape: "parse" | "create";
  breaker?: CircuitBreaker;
  /** the first auth failure of a key (the router notifies staff `ai.auth_failed`) */
  onAuthFailure?(): void;
  now?: () => number;
}

export interface CallResult {
  message: BetaMessage;
  text: string;
  /** the loose parse (null without a format or when it failed) */
  parsed: unknown | null;
  parseError: string | null;
  stopReason: string | null;
  stopCategory: string | null;
  ttftMs: number | null;
  ms: number;
  iterations: IterationUsage[];
  servedModel: string;
  fellBack: boolean;
  /** the request went out without `speed` after a fast 429 */
  fastDropped: boolean;
}

/* ------------------------------------------------------------------ */
/* Fast cooling (AI-§B.9)                                              */
/* ------------------------------------------------------------------ */

const FAST_COOL_MS = 10 * 60_000;

const coolKey = (task: AiTaskId): string => `fast-cooling:${task}`;

/** The route's fast mode is cooling after a 429 (10 minutes): the router sends it without `speed`. */
export function fastCooling(task: AiTaskId, now = Date.now()): boolean {
  const until = readProcessState<number>(coolKey(task));
  return until !== undefined && until > now;
}

/* ------------------------------------------------------------------ */
/* The call                                                            */
/* ------------------------------------------------------------------ */

/** A parseable format whose `parse` never throws (the SDK would throw on a refusal's partial text otherwise). */
function parseableFormat(spec: CallSpec): AutoParseableBetaOutputFormat<unknown> | null {
  if (!spec.format) return null;
  const format = spec.format;
  return { type: "json_schema", schema: looseJsonSchema(format), parse: (content: string) => {
    const r = parseLoose(content, format);
    return r.ok ? r.value : null;
  } };
}

async function once(spec: CallSpec, env: CallEnv, signal: AbortSignal, timeoutMs: number, dropSpeed: boolean): Promise<{ message: BetaMessage; ttftMs: number | null }> {
  const now = env.now ?? Date.now;
  const started = now();
  const params = buildParams(spec);
  if (dropSpeed) {
    delete params.speed;
    const betas = params.betas?.filter((b) => b !== FAST_BETA) ?? [];
    if (betas.length) params.betas = betas;
    else delete params.betas;
  }
  const fmt = env.callShape === "parse" ? parseableFormat(spec) : null;
  const withFormat = fmt ? { ...params, output_config: { ...params.output_config, format: fmt } } : params;
  const opts = { timeout: Math.max(1, timeoutMs), signal };
  if (spec.stream) {
    let ttftMs: number | null = null;
    const { stream: _s, ...body } = withFormat;
    void _s;
    const s = env.client.beta.messages.stream(body, opts);
    s.on("text", (delta: string) => {
      if (ttftMs === null) ttftMs = now() - started;
      spec.onText?.(delta);
    });
    const message = await s.finalMessage();
    return { message, ttftMs };
  }
  const message = env.callShape === "parse" ? await env.client.beta.messages.parse(withFormat as Parameters<Anthropic["beta"]["messages"]["parse"]>[0], opts) : await env.client.beta.messages.create(params, opts);
  return { message: message as BetaMessage, ttftMs: null };
}

/**
 * One call of the spec within `spec.deadlineMs` from now. Throws `AiServerError` (AI-§B.10); never retries itself
 * except the fast 429 (AI-§B.9): the router owns the retries, the deadline and the reservation.
 */
export async function callClaude(spec: CallSpec, env: CallEnv): Promise<CallResult> {
  const now = env.now ?? Date.now;
  const brk = env.breaker ?? processBreaker();
  const gate = brk.allow();
  if (!gate.ok) throw new AiServerError(gate.code, gate.code === "provider_overloaded", undefined, gate.retryAfterSec);
  const started = now();
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(new Error("ai deadline")), Math.max(1, spec.deadlineMs));
  const signal = spec.signal ? AbortSignal.any([spec.signal, deadline.signal]) : deadline.signal;
  let dropSpeed = spec.fast && fastCooling(spec.task, now());
  try {
    let r: { message: BetaMessage; ttftMs: number | null };
    try {
      r = await once(spec, env, signal, spec.deadlineMs - (now() - started), dropSpeed);
    } catch (err) {
      const e = fromSdkError(err, { deadline: deadline.signal.aborted && !spec.signal?.aborted });
      if (!(spec.fast && !dropSpeed && e.code === "rate_limited")) throw e;
      // AI-§B.9: one retry without `speed` (this invalidates the cache [api]) and the route cools for 10 minutes
      writeProcessState(coolKey(spec.task), now() + FAST_COOL_MS);
      dropSpeed = true;
      r = await once(spec, env, signal, spec.deadlineMs - (now() - started), true);
    }
    brk.record("ok", gate.trial);
    const message = r.message;
    const stop = stopOf(message);
    const text = textOf(message);
    let parsed: unknown | null = null;
    let parseError: string | null = null;
    if (spec.format && stop.reason !== "refusal") {
      const p = parseLoose(text, spec.format);
      if (p.ok) parsed = p.value;
      else parseError = p.error;
    }
    const served = servedModelOf(message, spec.model);
    return { message, text, parsed, parseError, stopReason: stop.reason, stopCategory: stop.category, ttftMs: r.ttftMs, ms: now() - started, iterations: iterationsOf(message), ...served, fastDropped: dropSpeed };
  } catch (err) {
    const e = fromSdkError(err, { deadline: deadline.signal.aborted && !spec.signal?.aborted });
    if (e.code === "provider_auth") {
      brk.record(e.code, gate.trial);
      if (brk.tripAuth()) env.onAuthFailure?.();
    } else brk.record(e.code, gate.trial);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
