"use server";
/**
 * Console → AI actions (P7 AI; ai.md AI-§K.2, AI-01, AI-07, AI-19 (9)(10); docs/STORE-SAAS.md §B.7, §E.2). A platform
 * action file (`scripts/qa/tenancy-check.ts` reads every "use server" file under src/app/admin/(console)/ as one): each
 * export returns `platformAction("ai.platform", …)` around a body of src/lib/ai/platform/console-write.ts, which checks
 * the permission again and answers its gate refusals as data (`{ ok: false, code }` inside `data`). Step-up (§B.7) for
 * the key, the cap, a class's model / effort / max_tokens, the rubric, a route's effort, Activate, Roll back and the
 * emergency switch: a stale step-up answers `step_up` and the console's sheet asks for the code, then retries.
 */
import { revalidatePath } from "next/cache";
import * as W from "@/lib/ai/platform/console-write";
import { platformAction } from "@/lib/platform/seam";
import type { ActionResult, PlatformCtx } from "@/lib/tenancy/types";

type Out<T> = Promise<ActionResult<W.ConsoleOutcome<T>>>;

/** The write, then the console's AI pages again. */
const after =
  <T>(write: (ctx: PlatformCtx, input: unknown) => Promise<W.ConsoleOutcome<T>>, input: unknown) =>
  async (ctx: PlatformCtx): Promise<W.ConsoleOutcome<T>> => {
    const out = await write(ctx, input);
    if (out.ok) revalidatePath("/admin/ai", "layout");
    return out;
  };

export async function saveAiSettingsAction(input: unknown): Out<{ fields: string[] }> {
  return platformAction("ai.platform", after(W.saveSettings, input));
}

export async function saveAiCapAction(input: { monthlyUsd: number | null }): Out<null> {
  return platformAction("ai.platform", after(W.saveCap, input), { stepUp: true });
}

export async function setAiKeyAction(input: { apiKey: string }): Out<{ keySource: string }> {
  return platformAction("ai.platform", after(W.setKey, input), { stepUp: true });
}

export async function removeAiKeyAction(): Out<{ keySource: string }> {
  return platformAction("ai.platform", after((ctx) => W.removeKey(ctx), null), { stepUp: true });
}

export async function testAiConnectionAction(): Out<{ ms: number; model: string; displayName: string }> {
  return platformAction("ai.platform", (ctx) => W.testConnection(ctx));
}

export async function checkAiModelAction(input: { id: string }): Out<import("@/lib/settings/keys/platform_ai").ModelInfo> {
  return platformAction("ai.platform", after(W.checkModelInfo, input));
}

/** No seam step-up here: only a model / effort / max_tokens change needs it, and the body asks for it then. */
export async function saveAiClassAction(input: unknown): Out<null> {
  return platformAction("ai.platform", after(W.saveClass, input));
}

export async function aiEmergencySwitchAction(input: { class: string; model: string; reason: string }): Out<{ evalRunId: string | null }> {
  return platformAction("ai.platform", after(W.emergencySwitch, input), { stepUp: true });
}

export async function saveAiJuryAction(input: { class: string; models: string[] }): Out<null> {
  return platformAction("ai.platform", after(W.saveJury, input));
}

export async function saveAiRouteAction(input: unknown): Out<null> {
  return platformAction("ai.platform", after(W.saveRoute, input));
}

export async function saveAiPriceAction(input: unknown): Out<null> {
  return platformAction("ai.platform", after(W.savePrice, input));
}

export async function saveAiRubricAction(input: { version: string }): Out<null> {
  return platformAction("ai.platform", after(W.saveRubric, input), { stepUp: true });
}

export async function startAiEvalAction(input: { family: string; version: string; kind: "smoke" | "live"; confirm: boolean }): Out<{ estimate: import("@/lib/ai/eval/live").EvalEstimate | null; runId: string | null; status: string | null }> {
  return platformAction("ai.platform", after(W.startEval, input));
}

export async function canaryAiPromptAction(input: { family: string; version: string }): Out<{ bp: number }> {
  return platformAction("ai.platform", after(W.startCanary, input));
}

export async function activateAiPromptAction(input: { family: string; version: string }): Out<{ from: string }> {
  return platformAction("ai.platform", after(W.activateVersion, input), { stepUp: true });
}

export async function activateAiPromptLowVolumeAction(input: { family: string; version: string }): Out<{ from: string }> {
  return platformAction("ai.platform", after(W.activateLowVolume, input), { stepUp: true });
}

export async function rollbackAiPromptAction(input: { family: string; version: string; reason: string }): Out<{ to: string | null }> {
  return platformAction("ai.platform", after(W.rollbackVersion, input), { stepUp: true });
}

export async function recordAiCalibrationAction(input: { labels: { caseId: string; score: number }[] }): Out<{ runId: string; mean: number | null; min: number | null; pass: boolean }> {
  return platformAction("ai.platform", after(W.recordCalibration, input));
}

export async function recordAiPreferenceAction(input: { lowerBound: number; pairs: number; note?: string }): Out<{ runId: string; pass: boolean }> {
  return platformAction("ai.platform", after(W.recordPreference, input));
}

export async function setAiDirectorDefaultAction(input: { auto: boolean }): Out<null> {
  return platformAction("ai.platform", after(W.setDirectorDefault, input));
}

export async function cancelAiBatchAction(input: { id: string }): Out<null> {
  return platformAction("ai.platform", after(W.cancelBatch, input));
}

export async function retryAiBatchItemsAction(input: { batchId: string }): Out<{ items: number }> {
  return platformAction("ai.platform", after(W.retryBatchItems, input));
}

export async function clearAiScreenedAction(input: { runId: string }): Out<null> {
  return platformAction("ai.platform", after(W.clearScreened, input));
}
