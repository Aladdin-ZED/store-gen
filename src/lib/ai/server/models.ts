import "server-only";
/**
 * Class resolution and the model checks (P7 AI; ai.md AI-§B.2, AI-§F.8 "the same canary applies to a model, effort
 * or rubric change", AI-D5; docs/STORE-SAAS.md D55).
 *
 *   - `resolveRoute(task, settings, { pattern, storeId })`: `routeFor` (the class router of src/lib/ai/tasks.ts, with
 *     the console's route overrides) after the class canary: when `platform_ai.classesCanary` patches this task's class
 *     and the store's daily hash falls in its slice, the patched class serves the run (`canary: true` → flag
 *     `canary_version`). The model is always a class model: a degraded run removes stages, never swaps a model inside a
 *     class.
 *   - `classDownUntil` (in memory, per process): a `director_deep` call answering `bad_request` on the first call of
 *     the process (the 30-day retention 400 of Fable 5.1 shows up there; messages are never string-matched, AI-§B.10)
 *     marks the class unavailable for 24 h, notifies staff once (`ai.director_unavailable`) and the job runs on
 *     `director_interactive` at `high` with `director_fallback` (`deepFallbackRoute`). A restart clears it, and so does
 *     the console's "Check model".
 *   - `aiProbes()`: the breaker and the class marks as `aiPolicyFor` reads them (`paused`, `class_down`).
 *   - `checkModel(id)`: `client.models.retrieve(id)` as the console's "Check model" stores it (`platform_ai.modelInfo`).
 */
import { notify } from "@/lib/platform/notify";
import type { ModelInfo, PlatformAiSetting } from "@/lib/settings/keys/platform_ai";
import { inCanary } from "../eval/canary-rules";
import type { PolicyProbes } from "../router/policy.server";
import { routeFor, type AiTaskId, type RoutePlan, type RunPattern, type TaskClass } from "../tasks";
import { breaker } from "./breaker";
import { anthropic } from "./client";
import { fromSdkError } from "./errors";
import { dropProcessState, readProcessState, writeProcessState } from "./process";

export const CLASS_DOWN_MS = 24 * 3_600_000;

const CLASSES: readonly TaskClass[] = ["director_interactive", "director_deep", "worker", "fast"];
const downKey = (cls: TaskClass): string => `class-down:${cls}`;

export function isClassDown(cls: TaskClass, now = Date.now()): boolean {
  const until = readProcessState<number>(downKey(cls));
  return until !== undefined && until > now;
}

/** Marks a class unavailable for 24 h; staff are notified once per mark (dedupe per day). */
export async function markClassDown(cls: TaskClass, now = Date.now()): Promise<void> {
  const already = isClassDown(cls, now);
  writeProcessState(downKey(cls), now + CLASS_DOWN_MS);
  if (already) return;
  const day = new Date(now).toISOString().slice(0, 10);
  await notify({ audience: "platform_staff", minRole: "admin" }, "ai.director_unavailable", { class: cls }, { severity: "warn", dedupeKey: `ai.director_unavailable:${cls}:${day}`, link: "/admin/ai" });
}

export function clearClassDown(cls?: TaskClass): void {
  for (const c of cls ? [cls] : CLASSES) dropProcessState(downKey(c));
}

/** The first `director_deep` call of the process: a `bad_request` there marks the class down (AI-§B.2). */
export function firstDeepCall(): boolean {
  if (readProcessState<boolean>("deep-called")) return false;
  writeProcessState("deep-called", true);
  return true;
}

/** What `aiPolicyFor` reads of the provider's live state. */
export function aiProbes(): PolicyProbes {
  return { paused: () => breaker().paused(), classDown: (cls) => isClassDown(cls) };
}

const utcDay = (now: Date): string => now.toISOString().slice(0, 10);

/** The route of one run with the class canary applied (AI-§F.8). */
export function resolveRoute(task: AiTaskId, settings: PlatformAiSetting, opts: { pattern?: RunPattern; storeId: string; now?: Date }): { plan: RoutePlan; canary: boolean } {
  const c = settings.classesCanary;
  const cls = routeFor(task, settings, opts.pattern ? { pattern: opts.pattern } : {}).class;
  if (c && c.class === cls && c.bp > 0 && inCanary(opts.storeId, `class:${c.class}`, utcDay(opts.now ?? new Date()), c.bp)) {
    const patched: PlatformAiSetting = { ...settings, classes: { ...settings.classes, [cls]: { ...settings.classes[cls], ...c.patch } } };
    return { plan: routeFor(task, patched, opts.pattern ? { pattern: opts.pattern } : {}), canary: true };
  }
  return { plan: routeFor(task, settings, opts.pattern ? { pattern: opts.pattern } : {}), canary: false };
}

/** A deep stage on the interactive Director class at `high` (the deep class is down; flag `director_fallback`). */
export function deepFallbackRoute(plan: RoutePlan, settings: PlatformAiSetting): RoutePlan {
  const cls = settings.classes.director_interactive;
  return {
    ...plan,
    class: "director_interactive",
    model: cls.model,
    effort: "high",
    maxTokens: Math.min(plan.maxTokens, cls.maxTokens),
    timeoutMs: Math.min(plan.timeoutMs, cls.timeoutMs),
    deadlineMs: plan.deadlineMs === null ? null : Math.min(plan.deadlineMs, cls.timeoutMs),
    fallbacks: cls.fallbacks === "default" && settings.fallbacks !== "off" && !plan.batch,
    fast: false,
  };
}

/** "Check model" (AI-§B.2): the model's facts, or the failure code (a `not_found` id cannot be saved). */
export async function checkModel(id: string, now = new Date()): Promise<{ ok: true; info: ModelInfo } | { ok: false; code: string }> {
  const client = await anthropic();
  if (!client) return { ok: false, code: "no_key" };
  try {
    const m = await client.models.retrieve(id);
    const raw = m as unknown as { id: string; display_name?: string; max_input_tokens?: number | null; max_tokens?: number | null };
    // a class whose model answers again is reachable: the 24 h mark is lifted (the console's button clears it)
    clearClassDown();
    breaker().authCleared();
    return {
      ok: true,
      info: { id: raw.id, display_name: (raw.display_name ?? raw.id).slice(0, 120), max_input_tokens: raw.max_input_tokens ?? null, max_tokens: raw.max_tokens ?? null, checkedAt: now.toISOString() },
    };
  } catch (err) {
    return { ok: false, code: fromSdkError(err).code };
  }
}
