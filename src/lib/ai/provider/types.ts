/**
 * The provider contract's result types (P7 AI; ai.md AI-§A.3; docs/STORE-SAAS.md §K.2 P0 ai stubs, AI R13). Isomorphic.
 * `AiOutcome` is what every rung (server, local, library) answers and what `runAi`, `queueAi`'s batch handlers and
 * `useAiTask` return; it is frozen at P0 (src/lib/contracts/r1-p0.ts) with the failure codes and flags.
 *
 * `TaskIO` maps each task to its input and output. P0 types the one shape the core already states
 * (`injection.screen`) and leaves every other entry `unknown`, so a caller must narrow what it reads; P7 replaces each
 * entry with its schema's type (src/lib/ai/schema/tasks/*.ts, AI-§I) as the task lands, and adds the `AiProvider`
 * interface, `AiRunContext` and `AiSupport` here.
 */
import type { AiFlag } from "@/lib/db/schema";
import type { Locale } from "@/lib/page/schema";
import type { AiProviderId, AiSurface, AiTaskId, Effort, TaskClass } from "../tasks";

export type { AiFlag } from "@/lib/db/schema";

export type TaskIO = {
  [K in AiTaskId]: K extends "injection.screen" ? { in: { text: string; source: "import" | "sheet" | "note" }; out: { suspicious: boolean; reason: string } } : { in: unknown; out: unknown };
};
export type AiTaskInput<T extends AiTaskId> = TaskIO[T]["in"];
export type AiTaskOutput<T extends AiTaskId> = TaskIO[T]["out"];

export type AiFailCode =
  // policy
  | "disabled"
  | "store_local_only"
  | "no_key"
  | "no_cap"
  | "kill"
  | "entitlement"
  | "state"
  | "flag_off"
  // money / capacity
  | "quota_store"
  | "quota_day"
  | "quota_platform"
  | "rate_limited"
  | "busy"
  // rev 3: the pending stores' platform share (SEC-26) and the store's Director share (QUAL-34), AI-§C.2
  | "quota_platform_pending"
  | "quota_director"
  // input
  | "pii_blocked"
  | "input_invalid"
  // output
  | "refused"
  | "invalid_output"
  | "max_tokens"
  | "timeout"
  | "cancelled"
  // provider
  | "provider_auth"
  | "provider_overloaded"
  | "provider_error"
  | "bad_request"
  | "model_unavailable"
  // local
  | "device_unsupported"
  | "model_load"
  | "oom"
  | "unknown";

/** rev 4 (QUAL-1, core §M.1 `originFrom`): who wrote each text field of a generated draft */
export type CopyOrigin = "cloud" | "local" | "library" | "engine";

export interface AiUsage {
  inTok: number;
  outTok: number;
  cacheReadTok: number;
  cacheWriteTok: number;
  /** 1 USD = 1,000,000 micros */
  costMicros: number;
  /** ceil(costMicros / 10_000), 0 for cache hits and local/library */
  credits: number;
  iterations?: { model: string; inTok: number; outTok: number; cacheReadTok: number; cacheWriteTok: number }[];
}

export interface AiFallbackNote {
  from: AiProviderId | string;
  to: AiProviderId | string;
  code: AiFailCode | "model_refusal";
}

export interface AiResult<T> {
  ok: true;
  value: T;
  provider: AiProviderId;
  class: TaskClass | null;
  model: string | null;
  effort: Effort | null;
  promptVersion: string;
  /** Director tasks (AI-D25) */
  rubricVersion: string | null;
  runId: string | null;
  jobId: string | null;
  usage: AiUsage | null;
  ms: number;
  ttftMs: number | null;
  /** fields the guard replaced (library) or dropped */
  rejected: string[];
  flags: AiFlag[];
  notes: AiFallbackNote[];
}

export interface AiFailure {
  ok: false;
  code: AiFailCode;
  retryable: boolean;
  provider: AiProviderId;
  runId: string | null;
  retryAfterSec?: number;
}

export type AiOutcome<T> = AiResult<T> | AiFailure;

export interface AiRunOpts {
  surface: AiSurface;
  signal?: AbortSignal;
  /** "Write again": bypasses ai_cache, changes nothing else */
  nonce?: string;
  locale?: Locale;
  /** streaming tasks: a guarded field is ready */
  onField?(path: string, value: unknown): void;
  onProgress?(e: { stage: string; done?: number; total?: number }): void;
}
