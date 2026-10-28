/**
 * The provider contract (P7 AI; ai.md AI-§A.3; docs/STORE-SAAS.md §K.2 P0 ai stubs, AI R13). Isomorphic, types only.
 * `AiOutcome` is what every rung (server, local, library) answers and what `runAi`, `queueAi`'s batch handlers and
 * `useAiTask` return; it is frozen at P0 (src/lib/contracts/r1-p0.ts) with the failure codes and flags, and so is the
 * `injection.screen` entry of `TaskIO`.
 *
 * `TaskIO` maps each task to its input and output (the type-only files of src/lib/ai/schema/tasks/*.ts; the schemas and
 * `finalize` bodies join them task by task). The Director tasks (`design.plan`, `design.critique`) get their shapes
 * with the Director layer (src/lib/ai/director/types.ts, built over design's imported types); until then, and for every
 * R2 / R3 task, an entry stays `unknown`, so a caller must narrow what it reads. Every input shape is merchant data or
 * aggregates: no field exists for a customer's text (AI-D31).
 */
import type { AiPolicy, DeviceInfo } from "../policy";
import type { AiFlag } from "@/lib/db/schema";
import type { Locale } from "@/lib/page/schema";
import type { AdBriefInput, AdBriefOut } from "../schema/tasks/ad-brief";
import type { AnalysisOut, AnalyzeInput } from "../schema/tasks/analyze";
import type { CallScriptInput, CallScriptOut } from "../schema/tasks/callcenter-script";
import type { FieldRewriteInput, FieldRewriteOut } from "../schema/tasks/copy-field";
import type { HeroPack, HeroPackInput } from "../schema/tasks/copy-hero";
import type { CopyPageInput, CopyPageOut } from "../schema/tasks/copy-page";
import type { JudgeInput, JudgeOut } from "../schema/tasks/eval-judge";
import type { InjectionScreenInput, InjectionScreenOut } from "../schema/tasks/injection-screen";
import type { ClassifyInput, ClassifyResult, RemoveBackgroundInput } from "../schema/tasks/local";
import type { AiProviderId, AiSurface, AiTaskId, Effort, TaskClass } from "../tasks";

export type { AiFlag } from "@/lib/db/schema";

/** The R1 tasks whose shapes are declared (AI-§A.3, AI-§I). */
interface DeclaredTaskIO {
  classify: { in: ClassifyInput; out: ClassifyResult };
  /** a trimmed WebP Blob with alpha */
  removeBackground: { in: RemoveBackgroundInput; out: Blob };
  analyze: { in: AnalyzeInput; out: AnalysisOut };
  "copy.page": { in: CopyPageInput; out: CopyPageOut };
  "copy.hero": { in: HeroPackInput; out: HeroPack };
  "copy.field": { in: FieldRewriteInput; out: FieldRewriteOut };
  "injection.screen": { in: InjectionScreenInput; out: InjectionScreenOut };
  "ad.brief": { in: AdBriefInput; out: AdBriefOut };
  "callcenter.script": { in: CallScriptInput; out: CallScriptOut };
  "eval.judge": { in: JudgeInput; out: JudgeOut };
}

export type TaskIO = {
  [K in AiTaskId]: K extends keyof DeclaredTaskIO ? DeclaredTaskIO[K] : { in: unknown; out: unknown };
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

/** What a rung sees of the run: the store, the policy it was handed and the device (null on the server). */
export interface AiRunContext {
  storeId: string;
  policy: AiPolicy;
  device: DeviceInfo | null;
}

/** A rung's answer to "can you run this task here?"; a refusal is skipped with a note (AI-§A.4). */
export type AiSupport = { ok: true } | { ok: false; code: AiFailCode };

/** One rung of the ladder (AI-D2): server (`runAi` on the server, one POST in the browser), local (the worker), library. */
export interface AiProvider {
  readonly id: AiProviderId;
  supports(task: AiTaskId, ctx: AiRunContext): AiSupport;
  run<T extends AiTaskId>(task: T, input: AiTaskInput<T>, ctx: AiRunContext, opts: AiRunOpts): Promise<AiOutcome<AiTaskOutput<T>>>;
}
