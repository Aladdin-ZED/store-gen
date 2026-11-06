/**
 * The request builder of every server call (P7 AI; ai.md AI-§B.3, AI-§B.5, AI-§B.7, AI-§B.9, AI-D6, AI-D24). Pure: the
 * one function that turns a `CallSpec` into SDK parameters, so no route can forget a rule, and the readers of a
 * response (text, iterations, served model, stop reason, the loose parse). `test:ai` asserts the rules per R1 task.
 *
 * Always: `output_config.effort`; the loose structured-output format (`looseJsonSchema`). Never: `thinking` (adaptive
 * is the default and the only mode), `temperature` / `top_p` / `top_k`, a trailing assistant message (prefill), a
 * forced `tool_choice` outside the fast class. Per class: `fallbacks: "default"` + the beta
 * `server-side-fallback-2026-07-01` on the Director and Worker classes only (Haiku 5.5 has none, a list is a 400);
 * fast mode (`speed: "fast"` + `fast-mode-2026-02-01`) only on `copy.field` / `copilot.turn` on the Worker class;
 * `max_tokens` ≤ the class ceiling; a `director_deep` call only from a job (pattern B) or a Batch (pattern C); images
 * ≤ `platform_ai.vision.maxImages` and ≤ 400 KB each. Batches get `batchParams()`: the same request without `betas`,
 * `fallbacks` and `speed` (rejected on the Batches API [api]).
 */
import type { MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources/messages/messages";
import type {
  BetaContentBlockParam,
  BetaMessage,
  BetaMessageParam,
  BetaTextBlockParam,
  BetaToolChoice,
  BetaToolUnion,
  MessageCreateParamsNonStreaming as BetaCreateParams,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { transformJSONSchema } from "@anthropic-ai/sdk/lib/transform-json-schema";
import type { LooseFormat } from "../prompts/types";
import type { RunStage } from "../store/runs";
import { FAST_ROUTES, type AiTaskId, type Effort, type RunPattern, type TaskClass } from "../tasks";

export const FALLBACK_BETA = "server-side-fallback-2026-07-01";
export const FAST_BETA = "fast-mode-2026-02-01";
/** AI-§B.3: ≤ 400 KB per photo (base64 decoded) */
export const IMAGE_MAX_BYTES = 400 * 1024;

export interface CallSpec {
  task: AiTaskId;
  class: TaskClass;
  model: string;
  effort: Effort;
  maxTokens: number;
  /** pattern of the run: a director_deep call only from B (job) or C (batch) */
  pattern: RunPattern;
  stage?: RunStage;
  /** AI-§B.5 layout; cache_control set by assemble() */
  system: BetaTextBlockParam[];
  /** user data blocks (AI-§E.3); never an assistant prefill */
  messages: BetaMessageParam[];
  /** structured output (every task except copilot.turn) */
  format?: LooseFormat;
  /** copilot only: strict, tool_choice auto (forced only on the fast class) */
  tools?: BetaToolUnion[];
  toolChoice?: BetaToolChoice;
  stream: boolean;
  /** `fallbacks: "default"` + its beta (routeFor: Director and Worker, `platform_ai.fallbacks` on) */
  fallbacks: boolean;
  fast: boolean;
  deadlineMs: number;
  signal?: AbortSignal;
  onText?(delta: string): void;
}

/** What the builder checks against the settings of the run. */
export interface SpecLimits {
  /** `platform_ai.classes[class].maxTokens` */
  classMaxTokens: number;
  /** `platform_ai.vision.maxImages` */
  maxImages: number;
}

export type RequestRule = "fast_class_fallbacks" | "no_effort" | "max_tokens" | "deep_outside_job" | "prefill" | "images" | "image_bytes" | "fast_route" | "forced_tool_choice";

export class AiRequestError extends Error {
  constructor(readonly rule: RequestRule) {
    super(`ai request: ${rule}`);
    this.name = "AiRequestError";
  }
}

/** Base64 bytes of an image block (decoded size). */
const b64Bytes = (data: string): number => Math.floor((data.length * 3) / 4) - (data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0);

function imagesOf(messages: readonly BetaMessageParam[]): number[] {
  const sizes: number[] = [];
  for (const m of messages) {
    if (typeof m.content === "string") continue;
    for (const b of m.content as BetaContentBlockParam[]) {
      if (b.type === "image" && b.source.type === "base64") sizes.push(b64Bytes(b.source.data));
    }
  }
  return sizes;
}

/**
 * The image limits of `platform_ai.vision` on a task input (AI-§B.3, AI-04 (1)): at most `maxImages` photos, each at
 * most `maxSide` px on its long side (1,024 by default). The bytes (≤ 400 KB) are checked on the request (`assertSpec`).
 */
export function inputImagesWithin(input: unknown, vision: { maxImages: number; maxSide: number }): boolean {
  const imgs = (input as { images?: { w: number; h: number }[] } | null)?.images;
  if (!Array.isArray(imgs)) return true;
  return imgs.length <= vision.maxImages && imgs.every((i) => Math.max(i.w, i.h) <= vision.maxSide);
}

/** The per-class rules of AI-§B.3; throws `AiRequestError` naming the broken rule. */
export function assertSpec(spec: CallSpec, limits: SpecLimits): void {
  if (spec.class === "fast" && spec.fallbacks) throw new AiRequestError("fast_class_fallbacks");
  if (!spec.effort) throw new AiRequestError("no_effort");
  if (!(spec.maxTokens >= 1) || spec.maxTokens > limits.classMaxTokens) throw new AiRequestError("max_tokens");
  if (spec.class === "director_deep" && spec.pattern !== "B" && spec.pattern !== "C") throw new AiRequestError("deep_outside_job");
  const last = spec.messages[spec.messages.length - 1];
  if (!last || last.role === "assistant") throw new AiRequestError("prefill");
  if (spec.fast && (spec.class !== "worker" || !FAST_ROUTES.has(spec.task))) throw new AiRequestError("fast_route");
  if (spec.toolChoice && spec.class !== "fast" && (spec.toolChoice.type === "any" || spec.toolChoice.type === "tool")) throw new AiRequestError("forced_tool_choice");
  const images = imagesOf(spec.messages);
  if (images.length > limits.maxImages) throw new AiRequestError("images");
  if (images.some((n) => n > IMAGE_MAX_BYTES)) throw new AiRequestError("image_bytes");
}

/** The JSON schema the API receives for a loose format (unsupported keywords stripped by the SDK's own transform). */
export function looseJsonSchema(format: LooseFormat): Record<string, unknown> {
  return transformJSONSchema(format.json) as Record<string, unknown>;
}

/** The beta endpoint's parameters for shape A / B (`stream` added by the caller). */
export function buildParams(spec: CallSpec): BetaCreateParams {
  const betas: string[] = [];
  if (spec.fallbacks) betas.push(FALLBACK_BETA);
  if (spec.fast) betas.push(FAST_BETA);
  return {
    model: spec.model,
    max_tokens: spec.maxTokens,
    system: spec.system,
    messages: spec.messages,
    output_config: { effort: spec.effort, ...(spec.format ? { format: { type: "json_schema", schema: looseJsonSchema(spec.format) } } : {}) },
    ...(betas.length ? { betas } : {}),
    // the SDK 0.133 typings carry the `"default"` scalar of beta server-side-fallback-2026-07-01: no cast needed
    ...(spec.fallbacks ? { fallbacks: "default" as const } : {}),
    ...(spec.fast ? { speed: "fast" as const } : {}),
    ...(spec.tools ? { tools: spec.tools, tool_choice: spec.toolChoice ?? { type: "auto" } } : {}),
    stream: false,
  };
}

/** One Batches request (AI-§B.8): no betas, no fallbacks, no speed. */
export function batchParams(spec: Omit<CallSpec, "stream" | "fast" | "fallbacks" | "signal" | "deadlineMs" | "onText">): MessageCreateParamsNonStreaming {
  return {
    model: spec.model,
    max_tokens: spec.maxTokens,
    // the beta block shapes are a superset of the GA ones for what assemble() writes (text, image, cache_control)
    system: spec.system as MessageCreateParamsNonStreaming["system"],
    messages: spec.messages as MessageCreateParamsNonStreaming["messages"],
    output_config: { effort: spec.effort, ...(spec.format ? { format: { type: "json_schema", schema: looseJsonSchema(spec.format) } } : {}) } as MessageCreateParamsNonStreaming["output_config"],
  };
}

/* ------------------------------------------------------------------ */
/* Reading a response                                                  */
/* ------------------------------------------------------------------ */

/** One billed attempt (`usage.iterations[i]`, or the top-level usage when the API sends none). */
export interface IterationUsage {
  kind: "message" | "fallback_message";
  model: string;
  inTok: number;
  outTok: number;
  cacheReadTok: number;
  cacheWriteTok: number;
  cacheWrite5mTok?: number;
  cacheWrite1hTok?: number;
}

const n = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);

interface RawUsage {
  type?: string;
  model?: string | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_creation?: { ephemeral_5m_input_tokens?: number | null; ephemeral_1h_input_tokens?: number | null } | null;
}

function iterationOf(u: RawUsage, kind: IterationUsage["kind"], model: string): IterationUsage {
  const it: IterationUsage = { kind, model, inTok: n(u.input_tokens), outTok: n(u.output_tokens), cacheReadTok: n(u.cache_read_input_tokens), cacheWriteTok: n(u.cache_creation_input_tokens) };
  if (u.cache_creation) {
    it.cacheWrite5mTok = n(u.cache_creation.ephemeral_5m_input_tokens);
    it.cacheWrite1hTok = n(u.cache_creation.ephemeral_1h_input_tokens);
  }
  return it;
}

/** Every billed attempt, each with its own model (AI-§B.7: the cost is Σ iterations at each model's price). */
export function iterationsOf(message: Pick<BetaMessage, "model" | "usage">): IterationUsage[] {
  const usage = message.usage as unknown as RawUsage & { iterations?: RawUsage[] | null };
  const list = (usage.iterations ?? []).filter((u) => u.type === "message" || u.type === "fallback_message");
  if (list.length === 0) return [iterationOf(usage, "message", String(message.model))];
  return list.map((u) => iterationOf(u, u.type === "fallback_message" ? "fallback_message" : "message", u.model ? String(u.model) : String(message.model)));
}

/** Who served the answer: `response.model`, and whether a server-side fallback did (AI-§B.7 `fallback_model`). */
export function servedModelOf(message: Pick<BetaMessage, "model" | "usage">, requested: string): { servedModel: string; fellBack: boolean } {
  const fell = iterationsOf(message).some((i) => i.kind === "fallback_message");
  const servedModel = String(message.model);
  return { servedModel, fellBack: fell || servedModel !== requested };
}

/** Every text block of the final message, in order (a mid-stream fallback continues in a new block, AI-§B.6). */
export function textOf(message: Pick<BetaMessage, "content">): string {
  return message.content
    .filter((b): b is Extract<BetaMessage["content"][number], { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("");
}

/** `stop_reason` and the refusal category, read before the content (AI-§B.7). */
export function stopOf(message: Pick<BetaMessage, "stop_reason" | "stop_details">): { reason: string | null; category: string | null } {
  return { reason: message.stop_reason ?? null, category: message.stop_details?.category ?? null };
}

/** The loose parse of a structured answer: never throws; the error names the first issue (for the one retry). */
export function parseLoose(text: string, format: LooseFormat): { ok: true; value: unknown } | { ok: false; error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "the answer is not one JSON object" };
  }
  const r = format.zod.safeParse(raw);
  if (r.success) return { ok: true, value: r.data };
  const issue = r.error.issues[0];
  const at = issue?.path.length ? issue.path.join(".") : "(root)";
  return { ok: false, error: `${at}: ${issue?.message ?? "does not match the schema"}`.slice(0, 300) };
}

/** The system message of the one retry after a parse failure (AI-§A.4 step 8): appended, never a prefill. */
export function parseRetryMessage(error: string): BetaMessageParam {
  return { role: "system", content: `Your previous answer did not match the required JSON schema (${error}). Answer again with one JSON object only, every key present.` };
}
