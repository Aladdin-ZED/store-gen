/**
 * The AI task registry's vocabulary (P7 AI; ai.md AI-§A.2; docs/STORE-SAAS.md §K.2 P0 ai stubs, AI R13, D55, D56).
 * Pure and isomorphic. Typed at P0 so the cross-track stubs (`runAi`, `queueAi`, the policy, the job API) and their
 * callers in P2, P1, P8 and P6 compile before P7 merges; the ids are ai.md's list verbatim. P7 adds the registry
 * itself here (`TASKS`, `taskDef`, `isTaskLive`, `classFor`, the per-task values of the AI-§A.2 table) and never
 * renames or re-types a frozen export (CCR; src/lib/contracts/r1-p0.ts).
 */

export const AI_TASK_IDS = [
  // R1
  "classify",
  "removeBackground",
  "analyze",
  "copy.page",
  "copy.hero",
  "copy.field",
  "design.plan",
  "design.critique",
  "injection.screen",
  "ad.brief",
  "callcenter.script",
  "eval.judge",
  // R2
  "seo.meta",
  "media.alt",
  "copy.translate",
  "product.describe",
  "store.blueprint",
  "logo.params",
  "logo.system",
  "design.verify",
  "critique.doc",
  // R3
  "offers.advise",
  "risk.explain",
  "insights.weekly",
  "insights.why",
  "health.report",
  "brief.today",
  "memory.distill",
  "copilot.turn",
  "embed",
  "image.studio",
] as const;
export type AiTaskId = (typeof AI_TASK_IDS)[number];
export type AiProviderId = "server" | "local" | "library";
/** core D55: the four task classes; `platform_ai.classes[class]` holds model, effort, maxTokens, timeoutMs, fallbacks, batch */
export type TaskClass = "director_interactive" | "director_deep" | "worker" | "fast";
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";
export type CallShape = "parse" | "stream" | "tools" | "batch" | "parse-or-batch" | "worker" | "template";
/** core §H.12: A = interactive request (≤ 90 s), B = detached ai_jobs row, C = Message Batch; local/template never call the API */
export type RunPattern = "A" | "B" | "C" | "local" | "template";
/** "features" = counts, labels, pseudonyms only (AI-§E.1) */
export type PiiClass = "none" | "features";
export type AiSurface = "onboarding" | "wizard" | "builder" | "settings" | "catalog" | "ops" | "copilot" | "dashboard" | "console" | "system";
/** prompt families (AI-D27): one versioned artifact + one eval set each */
export type PromptFamily =
  | "director.plan"
  | "director.critique"
  | "director.verify"
  | "copy.page"
  | "copy.hero"
  | "copy.field"
  | "copy.translate"
  | "analyze"
  | "product"
  | "seo"
  | "blueprint"
  | "logo"
  | "health"
  | "insights"
  | "distill"
  | "script"
  | "brief"
  | "offers"
  | "risk"
  | "copilot"
  | "screen"
  | "judge";

export function isAiTaskId(value: unknown): value is AiTaskId {
  return typeof value === "string" && (AI_TASK_IDS as readonly string[]).includes(value);
}
