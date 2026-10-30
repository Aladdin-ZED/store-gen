/**
 * The AI task registry (P7 AI; ai.md AI-§A.2, AI-D1, AI-D4, AI-D5, AI-D7, AI-D9, AI-D22; docs/STORE-SAAS.md §K.2 P0 ai
 * stubs, AI R13, D55, D56). Pure and isomorphic. Every AI task is declared once here: feature, release, ladder, task
 * class, effort, run pattern, prompt family, call shape, `max_tokens`, deadline, fallback and batch policy, PII class,
 * untrusted input paths, the p90 estimate, payer and cache TTL. The router, metering, prompts, eval and dashboards all
 * read it, so a route cannot skip a rule.
 *
 * Frozen at P0 (src/lib/contracts/r1-p0.ts): `AI_TASK_IDS`, `AiTaskId`, `AiProviderId`, `isAiTaskId`. Nothing here is
 * renamed or re-typed; the registry is additive.
 *
 * The class router (`classFor`, `routeFor`, `judgeModelsFor`) never picks a model: the model always comes from
 * `platform_ai.classes[class]`, so a degraded run removes stages and never swaps a model inside a class (AI-D5).
 */
import type { PlatformAiSetting } from "@/lib/settings/keys/platform_ai";

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
export const PROMPT_FAMILIES = [
  "director.plan",
  "director.critique",
  "director.verify",
  "copy.page",
  "copy.hero",
  "copy.field",
  "copy.translate",
  "analyze",
  "product",
  "seo",
  "blueprint",
  "logo",
  "health",
  "insights",
  "distill",
  "script",
  "brief",
  "offers",
  "risk",
  "copilot",
  "screen",
  "judge",
] as const;
export type PromptFamily = (typeof PROMPT_FAMILIES)[number];
export type AiRelease = "R1" | "R2" | "R3";
export const TASK_CLASS_IDS = ["director_interactive", "director_deep", "worker", "fast"] as const satisfies readonly TaskClass[];

export function isAiTaskId(value: unknown): value is AiTaskId {
  return typeof value === "string" && (AI_TASK_IDS as readonly string[]).includes(value);
}

/** The release flags the registry gates on (src/lib/flags/defs/ai.ts declares them, AI-§N; core §K.2 P7 row). */
export const AI_FLAG_DIRECTOR_BRIEF = "ai_director_brief";
export const AI_FLAG_COPILOT = "ai_copilot";
export const AI_FLAG_RISK_V2 = "ai_risk_v2";
/** the kill switch (core §H.8): off = every server task refused with `kill` */
export const AI_FLAG_GENERATION = "ai_generation_enabled";

export interface TaskDef {
  id: AiTaskId;
  /** RESEARCH id, or the signature feature the task serves (SF-01, SF-11) */
  feature: `AI-${string}` | `SF-${string}`;
  release: AiRelease;
  /** core `flags` key that must be on (release/ops flag) */
  flag?: string;
  /** order for "server preferred"; Auto/local reorder it (AI-§A.4) */
  ladder: readonly AiProviderId[];
  /** server rung only; the model and the class defaults come from platform_ai.classes */
  class?: TaskClass;
  /** fixed per route (a per-request change would invalidate the cache) [api] */
  effort?: Effort;
  pattern: RunPattern;
  family?: PromptFamily;
  /** Director tasks: the rubric version the prompt embeds (AI-D25) */
  rubric?: "v3";
  call: CallShape;
  /** includes thinking [api]; pattern B: the whole job's need, each stage derives its own (jobs/stages.ts) */
  maxTokens?: number;
  /** pattern A: whole run, retries included, ≤ 90,000; pattern B: per stage, also ≤ 90,000; Batches have none (ENGP-19) */
  deadlineMs?: number;
  /** our retries (the SDK runs with maxRetries 0) */
  retries?: 0 | 1 | 2;
  /** "none" is mandatory for the fast class (Haiku 5.5) and every batch-only task [api] */
  fallbacks: "default" | "none";
  /** "fallback" = a pattern-B stage runs as a one-item batch in the three cases of AI-§B.8 */
  batch: "never" | "allowed" | "always" | "fallback";
  pii: PiiClass;
  /** input paths placed in delimited data blocks and scanned by the PII gate (AI-§E.2, AI-§E.3); `a.b[]` = each item */
  untrusted: readonly string[];
  /** p90, for the reservation (AI-§C.2); [estimate ±2×] */
  estimate: { inTok: number; cachedTok: number; outTok: number; images?: number };
  payer: "store" | "platform";
  /** ai_cache; 0 = never cached */
  cacheTtlDays: number;
  /** top-level fields emitted as they complete, in this order; `arrays` emit item by item ("benefits[2]") */
  stream?: { fields: readonly string[]; arrays?: readonly string[] };
  /** Director passes count against platform_ai.caps (AI-§C.3) */
  caps?: { passCounter?: "director" | "deep"; maxPerStoreDay?: number };
}

/**
 * copy.page's fields in display order, hero first (AI-§B.4): the loose schema lists its properties in this order so a
 * stream completes the visible fields first, and `PartialJson` emits them in it.
 */
export const COPY_PAGE_FIELD_ORDER = [
  "kicker",
  "headline",
  "sub",
  "cta",
  "benefits",
  "tagline",
  "announcement",
  "problem_title",
  "pains",
  "solution",
  "steps",
  "faq",
  "guarantee",
  "cta_title",
  "cta_text",
  "story_title",
  "story",
  "comparison",
  "marquee",
  "seo_title",
  "seo_description",
] as const;
const COPY_PAGE_ARRAYS = ["benefits", "announcement", "pains", "steps", "faq", "guarantee", "comparison", "marquee"] as const;

/** The product data block every copy task carries (owner-typed, untrusted, AI-§E.3). */
const PRODUCT_TEXT = ["product.name", "product.facts[]"] as const;

const local = (id: AiTaskId, feature: TaskDef["feature"], release: AiRelease, deadlineMs: number): TaskDef => ({
  id,
  feature,
  release,
  ladder: ["local"],
  pattern: "local",
  call: "worker",
  deadlineMs,
  retries: 0,
  fallbacks: "none",
  batch: "never",
  pii: "none",
  untrusted: [],
  estimate: { inTok: 0, cachedTok: 0, outTok: 0 },
  payer: "store",
  cacheTtlDays: 0,
});

/** AI-§A.2, row by row (estimates [estimate ±2×]; prices AI-§B.2). */
export const TASKS: Readonly<Record<AiTaskId, TaskDef>> = {
  // ---- R1 -------------------------------------------------------------------------------------------------------
  classify: local("classify", "AI-03", "R1", 15_000),
  removeBackground: local("removeBackground", "AI-03", "R1", 30_000),
  analyze: {
    id: "analyze",
    feature: "AI-04",
    release: "R1",
    ladder: ["server", "local"],
    class: "worker",
    effort: "low",
    pattern: "A",
    family: "analyze",
    call: "parse",
    maxTokens: 4_000,
    deadlineMs: 40_000,
    retries: 1,
    fallbacks: "default",
    batch: "never",
    pii: "none",
    untrusted: ["product.name"],
    estimate: { inTok: 4_600, cachedTok: 3_000, outTok: 1_200, images: 3 },
    payer: "store",
    cacheTtlDays: 14,
  },
  "copy.page": {
    id: "copy.page",
    feature: "AI-02",
    release: "R1",
    ladder: ["server", "local", "library"],
    class: "worker",
    effort: "low",
    pattern: "A",
    family: "copy.page",
    call: "stream",
    maxTokens: 8_000,
    deadlineMs: 60_000,
    retries: 0,
    fallbacks: "default",
    batch: "never",
    pii: "none",
    untrusted: [...PRODUCT_TEXT, "deliveryText"],
    estimate: { inTok: 1_600, cachedTok: 3_500, outTok: 3_100 },
    payer: "store",
    cacheTtlDays: 14,
    stream: { fields: COPY_PAGE_FIELD_ORDER, arrays: COPY_PAGE_ARRAYS },
  },
  "copy.hero": {
    id: "copy.hero",
    feature: "AI-02",
    release: "R1",
    ladder: ["server", "local", "library"],
    class: "worker",
    effort: "low",
    pattern: "A",
    family: "copy.hero",
    call: "parse",
    maxTokens: 2_000,
    deadlineMs: 25_000,
    retries: 1,
    fallbacks: "default",
    batch: "never",
    pii: "none",
    untrusted: [...PRODUCT_TEXT, "deliveryText"],
    estimate: { inTok: 2_200, cachedTok: 3_000, outTok: 750 },
    payer: "store",
    cacheTtlDays: 14,
  },
  "copy.field": {
    id: "copy.field",
    feature: "AI-05",
    release: "R1",
    ladder: ["server", "local", "library"],
    class: "worker",
    effort: "low",
    pattern: "A",
    family: "copy.field",
    call: "parse",
    maxTokens: 2_000,
    deadlineMs: 20_000,
    retries: 1,
    fallbacks: "default",
    batch: "never",
    pii: "none",
    untrusted: ["text", ...PRODUCT_TEXT],
    estimate: { inTok: 1_200, cachedTok: 2_000, outTok: 500 },
    payer: "store",
    cacheTtlDays: 1,
  },
  "design.plan": {
    id: "design.plan",
    feature: "AI-19a",
    release: "R1",
    flag: AI_FLAG_DIRECTOR_BRIEF,
    ladder: ["server"],
    class: "director_interactive",
    effort: "medium",
    pattern: "A",
    family: "director.plan",
    rubric: "v3",
    call: "parse",
    maxTokens: 8_000,
    deadlineMs: 45_000,
    retries: 0,
    fallbacks: "default",
    batch: "never",
    pii: "none",
    // DirectorPlanInput = { brief, images }: the owner-typed text sits under the brief (step 4 fix: the paths missed it)
    untrusted: ["brief.product.name", "brief.product.facts[]"],
    estimate: { inTok: 4_900, cachedTok: 9_000, outTok: 4_300, images: 3 },
    payer: "store",
    cacheTtlDays: 0,
    caps: { passCounter: "director" },
  },
  "design.critique": {
    id: "design.critique",
    feature: "AI-19a",
    release: "R1",
    flag: AI_FLAG_DIRECTOR_BRIEF,
    ladder: ["server"],
    class: "director_interactive",
    effort: "medium",
    // a pattern-B stage when probe line 11 measured < 80 tok/s (AI-§A.8.6)
    pattern: "A",
    family: "director.critique",
    rubric: "v3",
    call: "parse",
    // = ⌊90 × tok/s × 0.6⌋, probe line 11; the class ceiling bounds it
    maxTokens: 10_000,
    deadlineMs: 90_000,
    retries: 0,
    fallbacks: "default",
    batch: "never",
    pii: "none",
    untrusted: ["brief.product.name", "brief.product.facts[]", "candidates[].heroCopy.headline", "candidates[].heroCopy.sub", "candidates[].heroCopy.cta"],
    estimate: { inTok: 15_600, cachedTok: 9_000, outTok: 5_000 },
    payer: "store",
    cacheTtlDays: 0,
    caps: { passCounter: "director" },
  },
  "injection.screen": {
    id: "injection.screen",
    feature: "AI-08",
    release: "R1",
    ladder: ["server"],
    class: "fast",
    effort: "low",
    // or C for bulk imports
    pattern: "A",
    family: "screen",
    call: "parse",
    maxTokens: 512,
    deadlineMs: 10_000,
    retries: 1,
    fallbacks: "none",
    batch: "allowed",
    pii: "none",
    untrusted: ["text"],
    estimate: { inTok: 1_500, cachedTok: 1_000, outTok: 300 },
    payer: "store",
    cacheTtlDays: 30,
  },
  "ad.brief": {
    id: "ad.brief",
    feature: "AI-20",
    release: "R1",
    ladder: ["server", "library"],
    class: "worker",
    effort: "medium",
    pattern: "A",
    family: "brief",
    call: "stream",
    maxTokens: 6_000,
    deadlineMs: 60_000,
    retries: 1,
    fallbacks: "default",
    batch: "never",
    pii: "none",
    untrusted: [...PRODUCT_TEXT, "sections[].headline", "sections[].lead"],
    estimate: { inTok: 3_500, cachedTok: 3_000, outTok: 4_500 },
    payer: "store",
    cacheTtlDays: 1,
    stream: { fields: ["basedOnVersionId", "angles", "filmChecklist"], arrays: ["angles"] },
  },
  "callcenter.script": {
    id: "callcenter.script",
    feature: "AI-15",
    release: "R1",
    ladder: ["server", "library"],
    class: "worker",
    effort: "medium",
    pattern: "A",
    family: "script",
    call: "parse",
    maxTokens: 6_000,
    deadlineMs: 60_000,
    retries: 1,
    fallbacks: "default",
    batch: "allowed",
    pii: "none",
    untrusted: [...PRODUCT_TEXT, "packs[].label"],
    estimate: { inTok: 2_500, cachedTok: 3_000, outTok: 3_000 },
    payer: "store",
    cacheTtlDays: 7,
  },
  "eval.judge": {
    id: "eval.judge",
    feature: "AI-07",
    release: "R1",
    ladder: ["server"],
    // no class: the judge runs on a model that is not the candidate's (AI-§F.5, judgeModelsFor)
    effort: "high",
    pattern: "C",
    family: "judge",
    call: "batch",
    maxTokens: 4_000,
    fallbacks: "none",
    batch: "always",
    pii: "none",
    untrusted: ["a", "b", "fixture.brief"],
    estimate: { inTok: 4_000, cachedTok: 3_000, outTok: 2_500 },
    payer: "platform",
    cacheTtlDays: 0,
  },
  // ---- R2 (invisible until released) ------------------------------------------------------------------------------
  "seo.meta": {
    id: "seo.meta",
    feature: "AI-09",
    release: "R2",
    ladder: ["server", "library"],
    class: "worker",
    effort: "low",
    // or C at ≥ 20 items
    pattern: "A",
    family: "seo",
    call: "parse-or-batch",
    maxTokens: 2_000,
    deadlineMs: 30_000,
    retries: 2,
    fallbacks: "default",
    batch: "allowed",
    pii: "none",
    untrusted: [...PRODUCT_TEXT],
    estimate: { inTok: 1_800, cachedTok: 1_200, outTok: 700 },
    payer: "store",
    cacheTtlDays: 14,
  },
  "media.alt": {
    id: "media.alt",
    feature: "AI-09",
    release: "R2",
    ladder: ["server", "library"],
    class: "fast",
    effort: "low",
    pattern: "A",
    family: "seo",
    call: "parse-or-batch",
    maxTokens: 512,
    deadlineMs: 20_000,
    retries: 2,
    fallbacks: "none",
    batch: "allowed",
    pii: "none",
    untrusted: ["product.name"],
    estimate: { inTok: 1_600, cachedTok: 900, outTok: 300, images: 1 },
    payer: "store",
    cacheTtlDays: 30,
  },
  "copy.translate": {
    id: "copy.translate",
    feature: "AI-10",
    release: "R2",
    ladder: ["server", "local"],
    class: "worker",
    effort: "low",
    pattern: "A",
    family: "copy.translate",
    call: "parse-or-batch",
    maxTokens: 6_000,
    deadlineMs: 40_000,
    retries: 1,
    fallbacks: "default",
    batch: "allowed",
    pii: "none",
    untrusted: ["texts[]"],
    estimate: { inTok: 2_500, cachedTok: 1_200, outTok: 2_000 },
    payer: "store",
    cacheTtlDays: 30,
  },
  "product.describe": {
    id: "product.describe",
    feature: "SF-12",
    release: "R2",
    ladder: ["server", "library"],
    class: "worker",
    effort: "low",
    pattern: "A",
    family: "product",
    call: "parse",
    maxTokens: 3_000,
    deadlineMs: 40_000,
    retries: 1,
    fallbacks: "default",
    batch: "allowed",
    pii: "none",
    untrusted: [...PRODUCT_TEXT],
    estimate: { inTok: 2_000, cachedTok: 3_000, outTok: 1_200, images: 2 },
    payer: "store",
    cacheTtlDays: 14,
  },
  "store.blueprint": {
    id: "store.blueprint",
    feature: "AI-11",
    release: "R2",
    ladder: ["server", "library"],
    class: "director_deep",
    effort: "high",
    pattern: "B",
    family: "blueprint",
    rubric: "v3",
    call: "stream",
    // over the job; every stage ≤ ⌊90 × tok/s × 0.6⌋ (jobs/stages.ts)
    maxTokens: 32_000,
    // per stage; the whole job (≤ 10 min) is an ai_jobs property, never a deadline
    deadlineMs: 90_000,
    retries: 0,
    fallbacks: "default",
    batch: "fallback",
    pii: "none",
    untrusted: [...PRODUCT_TEXT],
    // 6,000 / 9,000 / 17,000 + the critique 12,000 / 9,000 / 6,000
    estimate: { inTok: 18_000, cachedTok: 18_000, outTok: 23_000 },
    payer: "store",
    cacheTtlDays: 0,
    caps: { passCounter: "deep" },
  },
  "logo.params": {
    id: "logo.params",
    feature: "AI-11",
    release: "R2",
    ladder: ["server", "library"],
    class: "director_interactive",
    effort: "medium",
    pattern: "A",
    family: "logo",
    call: "parse",
    maxTokens: 4_000,
    deadlineMs: 60_000,
    retries: 1,
    fallbacks: "default",
    batch: "never",
    pii: "none",
    untrusted: ["brandName"],
    estimate: { inTok: 4_000, cachedTok: 9_000, outTok: 2_500 },
    payer: "store",
    cacheTtlDays: 0,
  },
  "logo.system": {
    id: "logo.system",
    feature: "AI-11",
    release: "R2",
    ladder: ["server"],
    class: "director_deep",
    effort: "high",
    pattern: "B",
    family: "logo",
    call: "stream",
    maxTokens: 16_000,
    deadlineMs: 90_000,
    retries: 0,
    fallbacks: "default",
    batch: "fallback",
    pii: "none",
    untrusted: ["brandName"],
    estimate: { inTok: 6_000, cachedTok: 9_000, outTok: 8_000 },
    payer: "store",
    cacheTtlDays: 0,
    caps: { passCounter: "deep" },
  },
  "design.verify": {
    id: "design.verify",
    feature: "AI-19",
    release: "R2",
    flag: AI_FLAG_DIRECTOR_BRIEF,
    ladder: ["server"],
    class: "director_interactive",
    effort: "medium",
    pattern: "A",
    family: "director.verify",
    rubric: "v3",
    call: "parse",
    maxTokens: 8_000,
    deadlineMs: 60_000,
    retries: 0,
    fallbacks: "default",
    batch: "never",
    pii: "none",
    untrusted: ["picks[].heroCopy.headline", "picks[].heroCopy.sub"],
    estimate: { inTok: 18_000, cachedTok: 9_000, outTok: 4_500 },
    payer: "store",
    cacheTtlDays: 0,
    caps: { passCounter: "director" },
  },
  "critique.doc": {
    id: "critique.doc",
    feature: "AI-19",
    release: "R2",
    ladder: ["server", "local"],
    class: "director_interactive",
    effort: "medium",
    pattern: "A",
    family: "director.critique",
    rubric: "v3",
    call: "parse",
    maxTokens: 8_000,
    deadlineMs: 60_000,
    retries: 0,
    fallbacks: "default",
    batch: "never",
    pii: "none",
    untrusted: ["page.texts[]"],
    estimate: { inTok: 8_000, cachedTok: 9_000, outTok: 4_000 },
    payer: "store",
    cacheTtlDays: 0,
  },
  // ---- R3 ---------------------------------------------------------------------------------------------------------
  "offers.advise": {
    id: "offers.advise",
    feature: "AI-16",
    release: "R3",
    ladder: ["server", "library"],
    class: "worker",
    effort: "low",
    pattern: "A",
    family: "offers",
    call: "parse",
    maxTokens: 2_000,
    deadlineMs: 30_000,
    retries: 1,
    fallbacks: "default",
    batch: "never",
    pii: "features",
    untrusted: ["product.name"],
    estimate: { inTok: 2_500, cachedTok: 1_500, outTok: 800 },
    payer: "store",
    cacheTtlDays: 1,
  },
  "risk.explain": {
    id: "risk.explain",
    feature: "AI-23",
    release: "R3",
    flag: AI_FLAG_RISK_V2,
    ladder: ["library", "server"],
    class: "fast",
    effort: "low",
    pattern: "A",
    family: "risk",
    call: "parse",
    maxTokens: 512,
    deadlineMs: 10_000,
    retries: 1,
    fallbacks: "none",
    batch: "never",
    pii: "features",
    untrusted: [],
    estimate: { inTok: 900, cachedTok: 600, outTok: 300 },
    payer: "store",
    cacheTtlDays: 1,
  },
  "insights.weekly": {
    id: "insights.weekly",
    feature: "AI-17",
    release: "R3",
    ladder: ["library", "server"],
    class: "worker",
    effort: "medium",
    pattern: "C",
    family: "insights",
    call: "batch",
    maxTokens: 6_000,
    fallbacks: "none",
    batch: "always",
    pii: "features",
    untrusted: [],
    estimate: { inTok: 6_000, cachedTok: 2_000, outTok: 5_000 },
    payer: "store",
    cacheTtlDays: 0,
  },
  "insights.why": {
    id: "insights.why",
    feature: "AI-17",
    release: "R3",
    ladder: ["library", "server"],
    class: "worker",
    effort: "medium",
    pattern: "A",
    family: "insights",
    call: "stream",
    maxTokens: 3_000,
    deadlineMs: 20_000,
    retries: 1,
    fallbacks: "default",
    batch: "never",
    pii: "features",
    untrusted: [],
    estimate: { inTok: 3_000, cachedTok: 2_000, outTok: 1_500 },
    payer: "store",
    cacheTtlDays: 1,
  },
  "health.report": {
    id: "health.report",
    feature: "AI-17b",
    release: "R3",
    ladder: ["library", "server"],
    class: "director_deep",
    effort: "high",
    pattern: "C",
    family: "health",
    call: "batch",
    maxTokens: 16_000,
    fallbacks: "none",
    batch: "always",
    pii: "features",
    untrusted: [],
    estimate: { inTok: 12_000, cachedTok: 9_000, outTok: 8_000 },
    payer: "store",
    cacheTtlDays: 0,
  },
  "brief.today": {
    id: "brief.today",
    feature: "AI-17",
    // R1 is P2's template line, not an AI run
    release: "R3",
    ladder: ["library"],
    pattern: "template",
    call: "template",
    fallbacks: "none",
    batch: "never",
    pii: "features",
    untrusted: [],
    estimate: { inTok: 0, cachedTok: 0, outTok: 0 },
    payer: "store",
    cacheTtlDays: 0,
  },
  "memory.distill": {
    id: "memory.distill",
    feature: "AI-14",
    release: "R3",
    ladder: ["library", "server"],
    class: "worker",
    effort: "medium",
    pattern: "C",
    family: "distill",
    call: "batch",
    maxTokens: 4_000,
    fallbacks: "none",
    batch: "always",
    pii: "none",
    untrusted: ["edits[].before", "edits[].after"],
    estimate: { inTok: 5_000, cachedTok: 1_500, outTok: 2_500 },
    payer: "store",
    cacheTtlDays: 0,
  },
  "copilot.turn": {
    id: "copilot.turn",
    feature: "AI-18",
    release: "R3",
    flag: AI_FLAG_COPILOT,
    ladder: ["server", "library"],
    class: "fast",
    effort: "low",
    pattern: "A",
    family: "copilot",
    call: "tools",
    // per tool iteration (≤ 6)
    maxTokens: 2_000,
    deadlineMs: 30_000,
    retries: 0,
    fallbacks: "none",
    batch: "never",
    pii: "features",
    untrusted: ["message"],
    estimate: { inTok: 6_000, cachedTok: 5_000, outTok: 1_200 },
    payer: "store",
    cacheTtlDays: 0,
  },
  embed: local("embed", "AI-22", "R3", 20_000),
  "image.studio": local("image.studio", "AI-21", "R3", 30_000),
};

export function taskDef(id: AiTaskId): TaskDef {
  return TASKS[id];
}

const RELEASE_RANK: Record<AiRelease, number> = { R1: 1, R2: 2, R3: 3 };

/** Released in `release` and its flag (if any) on. A task that is not live is invisible (AI-§A.2). */
export function isTaskLive(id: AiTaskId, release: AiRelease, flags: ReadonlySet<string>): boolean {
  const def = TASKS[id];
  return RELEASE_RANK[def.release] <= RELEASE_RANK[release] && (def.flag === undefined || flags.has(def.flag));
}

/** The tasks of a release with their flags on and not switched off by the console (`platform_ai.routes[task].enabled`). */
export function liveTasks(release: AiRelease, flags: ReadonlySet<string>, routes?: PlatformAiSetting["routes"]): AiTaskId[] {
  return AI_TASK_IDS.filter((id) => isTaskLive(id, release, flags) && routes?.[id]?.enabled !== false);
}

/** The Director pass tasks (design.plan + design.critique + design.verify = one pass, AI-§C.3). */
export function isDirectorTask(id: AiTaskId): boolean {
  return TASKS[id].caps?.passCounter !== undefined;
}

/* ------------------------------------------------------------------ */
/* The class router (core D55; AI-D4, AI-D5, AI-D7, AI-D22)            */
/* ------------------------------------------------------------------ */

/** The default effort of each class (AI-§M.5): a class whose effort the owner changed overrides the task's own. */
export const CLASS_DEFAULT_EFFORT: Record<TaskClass, Effort> = { director_interactive: "medium", director_deep: "high", worker: "low", fast: "low" };
/** fast mode (AI-D22): only these routes, and only on a model that has it (Opus 5.5 / Opus 5 / Opus 4.8 [api]) */
export const FAST_ROUTES: ReadonlySet<AiTaskId> = new Set<AiTaskId>(["copy.field", "copilot.turn"]);
export const FAST_MODE_MODELS: ReadonlySet<string> = new Set(["claude-opus-5-5", "claude-opus-5", "claude-opus-4-8"]);

export interface ClassRoute {
  model: string;
  effort: Effort;
  maxTokens: number;
  timeoutMs: number;
}

export class AiRouteError extends Error {
  constructor(
    readonly task: AiTaskId,
    readonly reason: "no_class" | "deep_outside_job" | "local_task",
  ) {
    super(`ai route ${task}: ${reason}`);
    this.name = "AiRouteError";
  }
}

/**
 * The class settings of a task with the owner's overrides (`platform_ai.routes[task]`) applied. The model is always the
 * class model; effort = the route override, else the class effort when the owner moved it off its default, else the
 * task's; `maxTokens` and `timeoutMs` never exceed the class ceiling.
 */
export function classFor(id: AiTaskId, settings: PlatformAiSetting): ClassRoute {
  const def = TASKS[id];
  if (!def.class) throw new AiRouteError(id, def.pattern === "local" || def.pattern === "template" ? "local_task" : "no_class");
  const cls = settings.classes[def.class];
  const route = settings.routes[id] ?? {};
  const classMoved = cls.effort !== CLASS_DEFAULT_EFFORT[def.class];
  const effort = route.effort ?? (classMoved ? cls.effort : (def.effort ?? cls.effort));
  const maxTokens = Math.min(route.maxTokens ?? def.maxTokens ?? cls.maxTokens, cls.maxTokens);
  const deadline = route.deadlineMs ?? def.deadlineMs ?? cls.timeoutMs;
  return { model: cls.model, effort, maxTokens, timeoutMs: Math.min(deadline, cls.timeoutMs) };
}

/** Everything a request builder needs to know about one server call (AI-§B.3); pure. */
export interface RoutePlan extends ClassRoute {
  task: AiTaskId;
  class: TaskClass;
  pattern: RunPattern;
  call: CallShape;
  /** whole run, retries included (pattern A) or per stage (B); null for Batches */
  deadlineMs: number | null;
  retries: 0 | 1 | 2;
  /** `fallbacks: "default"` + its beta: Director and Worker only, never on fast, never in a batch, never with `platform_ai.fallbacks = "off"` */
  fallbacks: boolean;
  /** fast mode (2× price): copy.field / copilot.turn on a model that has it, pattern A only */
  fast: boolean;
  batch: boolean;
}

/**
 * The class router: task → class → model, effort and the per-class rules. `pattern` defaults to the task's; a
 * `director_deep` call outside a job or a batch is refused (AI-§B.3: "a director_deep call only from inside an ai_jobs
 * job or a Batch").
 */
export function routeFor(id: AiTaskId, settings: PlatformAiSetting, opts: { pattern?: RunPattern } = {}): RoutePlan {
  const def = TASKS[id];
  const base = classFor(id, settings);
  const cls = def.class as TaskClass;
  const pattern = opts.pattern ?? def.pattern;
  if (cls === "director_deep" && pattern !== "B" && pattern !== "C") throw new AiRouteError(id, "deep_outside_job");
  const batch = pattern === "C";
  const fallbacks = cls !== "fast" && !batch && def.fallbacks === "default" && settings.classes[cls].fallbacks === "default" && settings.fallbacks !== "off";
  // never on the Director classes nor on fast (Haiku has no fast mode); a Worker class moved to an Opus model may use it
  const fast = pattern === "A" && cls === "worker" && FAST_ROUTES.has(id) && settings.routes[id]?.fast === true && FAST_MODE_MODELS.has(base.model);
  return {
    ...base,
    task: id,
    class: cls,
    pattern,
    call: def.call,
    deadlineMs: batch ? null : base.timeoutMs,
    retries: def.retries ?? 0,
    fallbacks,
    fast,
    batch,
  };
}

/**
 * The judge models for a candidate class (AI-§F.5, AI-D28, QUAL-13): Worker outputs by `evalGate.judgeModel`, the
 * Director and Fast classes by their jury; never the candidate's own model (the settings refuse such a jury at save,
 * and this filter holds even for a value that slipped past it).
 */
export function judgeModelsFor(candidate: TaskClass, settings: PlatformAiSetting): string[] {
  const own = settings.classes[candidate].model;
  const raw = candidate === "worker" ? [settings.evalGate.judgeModel] : [...settings.evalGate.jury[candidate]];
  return raw.filter((m) => m !== own);
}
