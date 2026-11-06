/**
 * The browser side of the Director stage routes (P7 AI; ai.md AI-§A.7 `/ai/director/{plan,critique}`, AI-§A.8.2 stages
 * 1 and 4, AI-§A.8.6 (3) the critique-as-job, AI-19 acceptance 3). Browser module, no server import.
 *
 *   directorStageCall(stage, input, pass, deps)   one POST `{ input, pass: { session, id }, surface }`:
 *       200 `{ ok, value, runId, credits }` → the value; 202 `{ jobId }` (the critique below 80 tok/s) → the job is
 *       polled like the deep pass (2 s visible / 6 s hidden) and its `outputs.critique` is the value; 410
 *       `pass_superseded` (a newer pass of the session started); any other answer → its typed failure code. A
 *       stage never retries: the pass ends and the instant set stays.
 *   browserDirectorDeps(ctx, onStage)   the `DirectorPassDeps` of the browser: the two stage calls above plus
 *       `copy.hero` and `copy.field` (translate) down the client ladder (`runAiOnce`), all tied to the tab's cancel
 *       bus so a store switch aborts them.
 *
 * The core takes its fetch and sleep as arguments (test:ai drives it with stubs).
 */
import { apiHref } from "@/lib/urls";
import type { DirectorPassDeps, DirectorStage, StageAnswer } from "../director/pass";
import type { AiPolicy, DeviceInfo } from "../policy";
import type { AiFailCode } from "../provider/types";
import { codeOfStatus, isFailCode, pollJob, runAiOnce, browserIo, trackStoreRun, type ClientRunDeps } from "./client";

export type DirectorStageRoute = "plan" | "critique";

export interface DirectorCallDeps extends Pick<ClientRunDeps, "fetch" | "visible" | "sleep"> {
  handle: string;
}

/** The pass a stage belongs to (the routes' `pass` envelope): the wizard session and this pass's id. */
export interface PassRef {
  session: string;
  id: string;
}

/** One Director stage through its route (see the header). */
export async function directorStageCall<T>(
  stage: DirectorStageRoute,
  input: unknown,
  pass: PassRef,
  deps: DirectorCallDeps,
  signal: AbortSignal,
  onJob?: () => void,
): Promise<StageAnswer<T>> {
  let res: Response;
  try {
    res = await deps.fetch(apiHref(deps.handle, `/ai/director/${stage}`), {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ input, pass, surface: "wizard" }),
      credentials: "same-origin",
      signal,
    });
  } catch {
    return { ok: false, code: signal.aborted ? "cancelled" : "provider_error" };
  }
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (res.status === 410 && body?.error === "pass_superseded") return { ok: false, code: "pass_superseded" };
  if (res.status === 202 && body?.ok === true && typeof body.jobId === "string") {
    onJob?.();
    const v = await pollJob(deps.handle, body.jobId, deps, signal);
    if (!v) return { ok: false, code: signal.aborted ? "cancelled" : "provider_error" };
    if (v.status !== "done") {
      const err = v.error as { code?: unknown } | string | null | undefined;
      const code: AiFailCode = isFailCode(err) ? err : isFailCode((err as { code?: unknown } | null)?.code) ? ((err as { code: AiFailCode }).code) : v.status === "cancelled" ? "cancelled" : "provider_error";
      return { ok: false, code };
    }
    const outputs = (v.outputs ?? null) as Record<string, unknown> | null;
    const value = outputs?.[stage] ?? null;
    return value === null ? { ok: false, code: "invalid_output" } : { ok: true, value: value as T, runId: null, credits: v.costCredits ?? 0 };
  }
  if (res.ok && body?.ok === true && "value" in body) {
    return { ok: true, value: body.value as T, runId: typeof body.runId === "string" ? body.runId : null, credits: typeof body.credits === "number" ? body.credits : 0 };
  }
  return { ok: false, code: isFailCode(body?.error) ? body.error : codeOfStatus(res.status) };
}

/** The browser's `DirectorPassDeps` for one store and wizard session (see the header). */
export function browserDirectorDeps(ctx: { handle: string; policy: AiPolicy; device: DeviceInfo; session: string; passId: string }, onStage: (s: DirectorStage) => void): DirectorPassDeps {
  const call = { handle: ctx.handle, ...browserIo };
  const pass = { session: ctx.session, id: ctx.passId };
  const tracked = async <R>(signal: AbortSignal, run: (s: AbortSignal) => Promise<R>): Promise<R> => {
    const own = new AbortController();
    const untrack = trackStoreRun(own);
    const on = () => own.abort(signal.reason);
    if (signal.aborted) own.abort(signal.reason);
    else signal.addEventListener("abort", on, { once: true });
    try {
      return await run(own.signal);
    } finally {
      signal.removeEventListener("abort", on);
      untrack();
    }
  };
  const runCtx = { handle: ctx.handle, policy: ctx.policy, device: ctx.device };
  return {
    plan: (input, signal) => tracked(signal, (s) => directorStageCall("plan", input, pass, call, s)),
    critique: (input, signal, onJob) => tracked(signal, (s) => directorStageCall("critique", input, pass, call, s, onJob)),
    hero: (input, signal) => runAiOnce("copy.hero", input, { surface: "wizard", signal }, runCtx),
    translate: (input, signal) => runAiOnce("copy.field", input, { surface: "wizard", signal }, runCtx),
    onStage,
  };
}
