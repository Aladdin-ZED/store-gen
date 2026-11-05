/**
 * The local provider (P7 AI; ai.md AI-§A.6, AI-§A.3, AI-04, AI-05). Browser: an adapter over today's `AiManager`
 * (src/lib/ai/client.ts), whose behaviour it does not change, as one rung of the client ladder (`useAiTask`,
 * src/lib/ai/router/client.ts).
 *
 *   supports(task, ctx)   local AI on (`policy.local.enabled`), a task the worker runs, and the tier it needs: the
 *                         language-model tasks (`analyze`, `copy.page`, `copy.field`) need `effectiveTier` ≥ lite;
 *                         `classify` runs without WebGPU (WASM); `removeBackground` also needs `policy.local.bgRemoval`
 *   run(task, input, …)   the manager's job, then the task's finalize where the browser has one to run here
 *                         (`analyze`: claims to unticked suggestions, AI-04; `copy.field`: the guard and the intent
 *                         check, AI-05); `copy.page` answers the worker's AiCopy for the caller's `mergeAiCopy`, the
 *                         guard of today's local path
 *
 * Every local run reports metadata only (task, model, prompt version, ms, status, rejected field names; never text) to
 * `POST /api/app/<h>/ai/report` through the injected `report`, so local prompt versions get keep and rejection rates.
 * R2 / R3 local tasks (`copy.translate`, `embed`, the critique-lite, `image.studio`) are not live: `supports` says no.
 */
import type { AiClient } from "../client";
import type { Analysis } from "../copy-schema";
import { AI_MODELS } from "../models";
import { effectiveTier } from "../policy";
import type { CopyRequest } from "../prompts";
import { AiError, failCodeOf } from "../protocol";
import type { AnalyzeInput } from "../schema/tasks/analyze";
import { analyzeFinalize } from "../schema/tasks/analyze";
import { copyFieldFinalize } from "../schema/tasks/copy-field";
import type { CopyPageInput } from "../schema/tasks/copy-page";
import type { CallingHours, FinalizeCtx } from "../schema/tasks/types";
import type { AiSurface, AiTaskId } from "../tasks";
import { aiFailure } from "./failures";
import type { AiFailCode, AiOutcome, AiProvider, AiRunContext, AiRunOpts, AiSupport, AiTaskInput, AiTaskOutput } from "./types";
import { PoliciesSetting } from "@/lib/settings/keys/policies";

/** The tasks the worker runs in R1. */
export const LOCAL_TASKS: ReadonlySet<AiTaskId> = new Set<AiTaskId>(["classify", "removeBackground", "analyze", "copy.page", "copy.field"]);
/** The tasks that need the language model (WebGPU, tier ≥ lite). */
const NEEDS_LM: ReadonlySet<AiTaskId> = new Set<AiTaskId>(["analyze", "copy.page", "copy.field"]);
/** The local prompt version when the policy names none (AI-§F.1). */
const DEFAULT_LOCAL_VERSION: Partial<Record<AiTaskId, string>> = { analyze: "analyze@l1", "copy.page": "copy.page@l1", "copy.field": "copy.field@l1" };

/** The manager surface the adapter uses (the real `AiManager`, or a stub in test:ai). */
export type LocalAi = Pick<AiClient, "capabilities" | "classify" | "analyze" | "writeCopy" | "removeBackground" | "rewrite">;

/** One local run's telemetry: `LocalReport` of src/lib/ai/store/runs.ts (no input, no output text). */
export interface LocalRunReport {
  task: AiTaskId;
  provider: "local" | "library";
  model: string | null;
  promptVersion: string | null;
  ms: number;
  status: "ok" | "invalid_output" | "timeout" | "error" | "cancelled";
  rejected: string[];
  locale: "ar" | "fr" | "en" | null;
  surface: Exclude<AiSurface, "console" | "system">;
}

/** The store facts a local copy request carries beside the policy (CopyRequest v2); the mount site knows them. */
export interface LocalCopyExtras {
  policies?: string[] | null;
  hasWhatsapp?: boolean | null;
  style?: string | null;
}

export interface LocalProviderOpts {
  ai: LocalAi;
  /** queues one telemetry row (the reporter batches and posts them) */
  report?: (r: LocalRunReport) => void;
  /** the guard context of a finalize run in the browser; default: the input's own facts, nothing else promised */
  finalizeCtx?: (task: AiTaskId, input: unknown) => FinalizeCtx | null;
  copyExtras?: () => LocalCopyExtras;
  now?: () => number;
}

/** The worker's error code → the report's status. */
function reportStatus(code: AiFailCode): LocalRunReport["status"] {
  if (code === "cancelled") return "cancelled";
  if (code === "invalid_output") return "invalid_output";
  if (code === "timeout") return "timeout";
  return "error";
}

/** No calling hours known in the browser: no line may state a call timing (the text is only built by callingHoursFor). */
const NO_CALLING_HOURS: CallingHours = { text: null, withinHours: null };

/**
 * The conservative guard context of a local finalize: the product's own name and facts, no policy stated, no WhatsApp
 * and no calling hours, so a local line can promise nothing the store did not say (AI-§D.2 rules 3 and 7).
 */
export function conservativeCtx(task: AiTaskId, input: unknown): FinalizeCtx {
  const i = (input ?? {}) as { locale?: string; adminLocale?: string; product?: { name?: string | null; facts?: string[] } };
  const locale = (task === "analyze" ? i.adminLocale : i.locale) ?? "fr";
  return {
    locale: locale as FinalizeCtx["locale"],
    productName: i.product?.name ?? "",
    facts: i.product?.facts ?? [],
    storeFacts: [],
    hasWhatsapp: false,
    policies: PoliciesSetting.parse({}),
    callingHours: NO_CALLING_HOURS,
    origin: "local",
  };
}

/** base64 (no data: prefix) → Blob, for the worker (the server path sends the same images as base64). */
export function base64Blob(data: string, type: string): Blob {
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

/** CopyPageInput → the worker's CopyRequest v2 (prices in major units, as today's wizard sends them). */
export function copyRequestFrom(input: CopyPageInput, ctx: AiRunContext, extras: LocalCopyExtras = {}): CopyRequest {
  const d = input.direction;
  return {
    locale: input.locale,
    market: input.market,
    product: {
      name: input.product.name,
      category: input.product.category,
      price: input.product.priceMinor / 100,
      currency: input.product.currency,
      facts: input.product.facts.slice(0, 6),
    },
    analysis: input.analysis,
    deliveryText: input.deliveryText,
    voice: ctx.policy.voiceLocal.trim() || null,
    ...(extras.policies ? { policies: extras.policies } : {}),
    ...(extras.hasWhatsapp !== undefined && extras.hasWhatsapp !== null ? { hasWhatsapp: extras.hasWhatsapp } : {}),
    ...(extras.style ? { style: extras.style } : {}),
    angle: (d?.angle ?? null) as CopyRequest["angle"],
    headlineStructure: (d?.headlineStructure ?? null) as CopyRequest["headlineStructure"],
    promptVersion: ctx.policy.promptVersions["copy.page"] ?? DEFAULT_LOCAL_VERSION["copy.page"]!,
  };
}

/** The worker's Analysis as the loose analyze answer, so the same finalize as the server's runs on it. */
function looseOf(a: Analysis): Record<string, unknown> {
  return { category: a.category, vibe: a.vibe, secondary_vibe: a.secondaryVibe ?? "none", colors: a.colorsDescribed, summary: a.summary, audience: a.audience, materials: a.materials };
}

export function localProvider(opts: LocalProviderOpts): AiProvider {
  const now = opts.now ?? (() => Date.now());
  return {
    id: "local",
    supports(task: AiTaskId, ctx: AiRunContext): AiSupport {
      if (!ctx.policy.local.enabled) return { ok: false, code: "disabled" };
      if (!LOCAL_TASKS.has(task)) return { ok: false, code: "device_unsupported" };
      if (task === "removeBackground" && !ctx.policy.local.bgRemoval) return { ok: false, code: "disabled" };
      if (NEEDS_LM.has(task) && (!ctx.device || effectiveTier(ctx.policy, ctx.device) === "off")) return { ok: false, code: "device_unsupported" };
      return { ok: true };
    },
    async run<T extends AiTaskId>(task: T, input: AiTaskInput<T>, ctx: AiRunContext, ro: AiRunOpts): Promise<AiOutcome<AiTaskOutput<T>>> {
      const started = now();
      const signal = ro.signal;
      const tier = ctx.device ? effectiveTier(ctx.policy, ctx.device) : "off";
      const model = task === "classify" ? AI_MODELS.siglip : task === "removeBackground" ? null : tier === "off" ? null : AI_MODELS.vlm[tier];
      const promptVersion = NEEDS_LM.has(task) ? (ctx.policy.promptVersions[task] ?? DEFAULT_LOCAL_VERSION[task] ?? null) : null;
      const locale = ((input as { locale?: string }).locale ?? (input as { adminLocale?: string }).adminLocale ?? null) as LocalRunReport["locale"];
      const surface = (ro.surface === "console" || ro.surface === "system" ? "wizard" : ro.surface) as LocalRunReport["surface"];
      const report = (status: LocalRunReport["status"], rejected: string[]) =>
        opts.report?.({ task, provider: "local", model, promptVersion, ms: Math.max(0, Math.round(now() - started)), status, rejected: rejected.slice(0, 64), locale, surface });
      const fctx = () => opts.finalizeCtx?.(task, input) ?? conservativeCtx(task, input);
      try {
        let value: unknown;
        let rejected: string[] = [];
        switch (task) {
          case "classify":
            value = await opts.ai.classify((input as AiTaskInput<"classify">).images, { signal });
            break;
          case "removeBackground":
            value = await opts.ai.removeBackground((input as AiTaskInput<"removeBackground">).image, { signal });
            break;
          case "analyze": {
            const i = input as AnalyzeInput;
            const blobs = i.images.map((img) => base64Blob(img.data, img.mediaType));
            const a = await opts.ai.analyze(blobs, { signal });
            const fin = analyzeFinalize(i)(looseOf(a), fctx());
            if (!fin) throw new AiError("INVALID_OUTPUT", "The analysis did not pass its finalize.");
            // the owner's category wins over the model's (AI-04 (3))
            value = i.product.category ? { ...fin.value, category: i.product.category } : fin.value;
            rejected = fin.rejected;
            break;
          }
          case "copy.page": {
            const r = await opts.ai.writeCopy(copyRequestFrom(input as CopyPageInput, ctx, opts.copyExtras?.()), { signal });
            value = r.copy;
            break;
          }
          case "copy.field": {
            const i = input as AiTaskInput<"copy.field">;
            const r = await opts.ai.rewrite(i, { signal });
            const fin = copyFieldFinalize(i)(r, fctx());
            if (!fin) {
              report("invalid_output", []);
              return aiFailure("invalid_output", "local");
            }
            value = fin.value;
            rejected = fin.rejected;
            break;
          }
          default:
            return aiFailure("device_unsupported", "local");
        }
        const ms = Math.max(0, Math.round(now() - started));
        report("ok", rejected);
        return {
          ok: true,
          value: value as AiTaskOutput<T>,
          provider: "local",
          class: null,
          model,
          effort: null,
          promptVersion: promptVersion ?? "local",
          rubricVersion: null,
          runId: null,
          jobId: null,
          usage: null,
          ms,
          ttftMs: null,
          rejected,
          flags: [],
          notes: [],
        };
      } catch (err) {
        const code = signal?.aborted ? "cancelled" : failCodeOf(err);
        report(reportStatus(code), []);
        return aiFailure(code, "local");
      }
    },
  };
}
