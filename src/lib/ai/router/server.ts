import "server-only";
/**
 * The server rung of the AI router (P7 AI; ai.md AI-§A.4, AI-§B.8, AI-§B.13; docs/STORE-SAAS.md §K.2 P0 ai stubs, AI
 * R13, D55, D56, D70). Server tasks run through `runAi(scope, task, input, opts)`, which walks server → library;
 * non-urgent work goes to the Batches queue with `queueAi`, its results to the handlers registered with
 * `registerBatchResultHandler`; `aiPolicyFor(ctx)` is the policy every AI page receives (cached 15 s per store and
 * user). Frozen at P0 (src/lib/contracts/r1-p0.ts): P2 (onboarding), P1, P8 and P6 call these before P7 merges.
 *
 * `aiPolicyFor` is real from step 6 (the AI-§A.4 block order over the store's settings, entitlements and counters, the
 * platform cap and the release flags; ./policy.server.ts loads, ../policy.ts `buildPolicy` decides), with the
 * provider's live state from step 7 (the breaker's `paused`, the class marks). `runAi` is real from step 7: the
 * AI-§A.4 steps 1-10 of ./run.server.ts (`runServerTask`), server then library. Left until step 8:
 *   - `queueAi`: throws (nothing may be queued without the Batches queue);
 *   - `registerBatchResultHandler`: works for real (a registry, like the outbox handlers), so P7's handler files and the
 *     tracks' handlers register from day one.
 */
import { scopedCache } from "@/lib/tenancy/cache";
import { activeKillSwitches } from "@/lib/tenancy/entitlements";
import type { Actor, StoreCtx, StoreScope } from "@/lib/tenancy/types";
import { DIRECTOR_PASS_CREDITS_P90, buildPolicy, type AiPolicy, type PolicyInputs } from "../policy";
import type { AiOutcome, AiRunOpts, AiTaskInput, AiTaskOutput } from "../provider/types";
import type { AiTaskId } from "../tasks";
import { aiProbes } from "../server/models";
import { impersonationInputs, loadPolicyInputs } from "./policy.server";
import { runServerTask } from "./run.server";

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
  return runServerTask(scope, task, input, opts);
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


/* ------------------------------------------------------------------ */
/* aiPolicyFor (AI-§A.4)                                               */
/* ------------------------------------------------------------------ */

/** The loaded inputs per (store, user), 15 s (AI-§A.4); dropped with the store by `invalidateStore()` (§E.6). */
const policyInputs = scopedCache<PolicyInputs>({ name: "ai-policy", maxEntries: 4_000, ttlMs: 15_000 });

/** Drops a store's cached policy inputs (Settings → AI writes, a boost, a plan change). */
export function invalidateAiPolicy(storeId: string): void {
  policyInputs.delete(storeId);
}

/** The documented "Cloud AI off" answer when the inputs cannot be read: no promise of a model, the library path stays. */
function offPolicy(ctx: StoreCtx): AiPolicy {
  const imp = ctx.scope.kind === "impersonation";
  return {
    mode: "auto",
    cloud: {
      available: false,
      block: imp ? "state" : "platform_off",
      creditsLeft: null,
      dayLeft: null,
      director: "unavailable",
      directorBlock: null,
      directorPassCredits: DIRECTOR_PASS_CREDITS_P90,
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

/**
 * The policy every AI page receives (server-only). The inputs are cached 15 s per (store, user); the kill switch is
 * read on every call through the core's flags cache (30 s), so switching `ai_generation_enabled` off reaches every
 * store within 30 s. A "View as store" session gets `live: []`, `state` and the local rung off, and reads no counter.
 */
export async function aiPolicyFor(ctx: StoreCtx): Promise<AiPolicy> {
  try {
    if (ctx.scope.kind === "impersonation" || ctx.impersonation) return buildPolicy(await impersonationInputs(ctx));
    const [inputs, kills] = await Promise.all([policyInputs.getOrLoad(ctx.scope.storeId, `${ctx.user.id}:${ctx.scope.kind}`, () => loadPolicyInputs(ctx, aiProbes())), activeKillSwitches()]);
    return buildPolicy({ ...inputs, cloud: { ...inputs.cloud, generationOn: !kills.includes("ai_generation_enabled") } });
  } catch (err) {
    console.error(`[ai] policy unavailable: ${err instanceof Error ? err.name : "error"}`);
    return offPolicy(ctx);
  }
}
