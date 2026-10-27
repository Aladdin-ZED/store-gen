import "server-only";
/**
 * The server rung of the AI router (P7 AI; ai.md AI-§A.4, AI-§B.8, AI-§B.13; docs/STORE-SAAS.md §K.2 P0 ai stubs, AI
 * R13, D55, D56, D70). Server tasks run through `runAi(scope, task, input, opts)`, which walks server → library;
 * non-urgent work goes to the Batches queue with `queueAi`, its results to the handlers registered with
 * `registerBatchResultHandler`; `aiPolicyFor(ctx)` is the policy every AI page receives (cached 15 s per store and
 * user). Frozen at P0 (src/lib/contracts/r1-p0.ts): P2 (onboarding), P1, P8 and P6 call these before P7 merges.
 *
 * P0 stubs, the documented "Cloud AI off" state of a platform without P7 (AI-§A.4: `platform_ai.enabled` false):
 *   - `aiPolicyFor`: cloud unavailable (`platform_off`; `state` under a read-only impersonation, D70), no live task
 *     through the router and no local rung, so a caller shows its library path, never a model promise;
 *   - `runAi`: the typed failure `disabled` (not retryable), so the caller takes its library rung;
 *   - `queueAi`: throws (nothing may be queued without the Batches queue);
 *   - `registerBatchResultHandler`: works for real (a registry, like the outbox handlers), so P7's handler files and the
 *     tracks' handlers register from day one.
 */
import type { Actor, StoreCtx, StoreScope } from "@/lib/tenancy/types";
import type { AiPolicy } from "../policy";
import type { AiOutcome, AiRunOpts, AiTaskInput, AiTaskOutput } from "../provider/types";
import type { AiTaskId } from "../tasks";

export interface RunAiServerOpts extends AiRunOpts {
  actor: Actor;
  ladder?: "server-then-library" | "server-only";
}

export type BatchResultHandler<T extends AiTaskId> = (scope: StoreScope | "platform", ref: { kind: string; id: string }, out: AiOutcome<AiTaskOutput<T>>) => Promise<void>;

declare global {
  var __sgAiBatchHandlers: Map<AiTaskId, BatchResultHandler<AiTaskId>> | undefined;
}

/** A function declaration: a handler file may register while its importer is still evaluating. */
function batchHandlers(): Map<AiTaskId, BatchResultHandler<AiTaskId>> {
  return (globalThis.__sgAiBatchHandlers ??= new Map());
}

/** The pattern-A server run of one task (AI-§A.4 steps 1-10); never throws for a policy or provider failure. */
export async function runAi<T extends AiTaskId>(scope: StoreScope, task: T, input: AiTaskInput<T>, opts: RunAiServerOpts): Promise<AiOutcome<AiTaskOutput<T>>> {
  void scope;
  void task;
  void input;
  void opts;
  return { ok: false, code: "disabled", retryable: false, provider: "server", runId: null };
}

/** Non-urgent work: adds an item to the Batches queue (AI-§B.8); the result arrives through the registered handler. */
export async function queueAi<T extends AiTaskId>(scope: StoreScope | "platform", task: T, input: AiTaskInput<T>, ref: { kind: string; id: string }): Promise<{ itemId: string; deduped: boolean }> {
  void scope;
  void task;
  void input;
  void ref;
  throw new Error("not implemented: P7 queueAi");
}

/** One handler per task; a second registration replaces the first (a dev reload). */
export function registerBatchResultHandler<T extends AiTaskId>(task: T, h: (scope: StoreScope | "platform", ref: { kind: string; id: string }, out: AiOutcome<AiTaskOutput<T>>) => Promise<void>): void {
  batchHandlers().set(task, h as unknown as BatchResultHandler<AiTaskId>);
}

/** The handler registered for `task`, if any (the batch ingest, P7). */
export function batchResultHandler<T extends AiTaskId>(task: T): BatchResultHandler<T> | undefined {
  return batchHandlers().get(task) as BatchResultHandler<T> | undefined;
}

/** Server-only; cached 15 s per (store, user) once P7 computes it. */
export async function aiPolicyFor(ctx: StoreCtx): Promise<AiPolicy> {
  return {
    mode: "auto",
    cloud: {
      available: false,
      block: ctx.scope.kind === "impersonation" ? "state" : "platform_off",
      creditsLeft: null,
      dayLeft: null,
      director: "unavailable",
      directorBlock: null,
      directorPassCredits: 0,
      directorPassesLeft: null,
      deepPass: false,
      deepPassesLeft: null,
      deepTransport: "job",
    },
    local: { enabled: false, tierMax: "lite", bgRemoval: false },
    autoPrefersCloud: {},
    live: [],
    transport: "stream",
    promptVersions: {},
    voiceLocal: "",
    workerName: "",
  };
}
