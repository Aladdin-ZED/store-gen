/**
 * Platform setting `platform_ai` (docs/STORE-SAAS.md §D.10, ai.md AI-§M.5; not secret; owner: ai, P7). The paths §D.10
 * names (`enabled`, `classes` (D55), `prices`, `caps`, `directorAutoDefault`, `promptVersions`, `evalGate`,
 * `patternLibrary`, `retentionNotice`) and the ai-owned extras of AI-§M.5 (`classesCanary`, `killSwitch`,
 * `localPromptVersions`, `rubricVersion`, `preferenceTest`, `fallbacks`, `callShape`, `streamTransport`, `routes`,
 * `autoPrefersCloud`, `cacheTtl`, `vision`, `genePins`, `modelInfo`, `probe`). The API key is not here: it lives in
 * `platform_ai_secret`.
 *
 * Prices (AI-§B.2): the stored `prices` start empty (P0 decision: a stored default never invents a price) and hold the
 * rows the console or the probe confirmed. `SEED_PRICES` are the published list prices AI-§B.2 seeds, checked against
 * the bundled Claude API reference (cached 2026-10-06); `SEED_PRICE_NOTES` marks the cells derived from a published
 * multiplier rather than read as a figure, and the one cell two sources disagree on (Sonnet 5.5 cache reads: the
 * higher figure is kept, an over-reservation is refunded). `effectivePrices` merges the seed under the stored rows, so
 * a confirmed row replaces its seed row and its notes. Task ids and prompt families are the registry's
 * (src/lib/ai/tasks.ts); the route and family records stay partial.
 */
import { z } from "zod";
import { AI_TASK_IDS, PROMPT_FAMILIES } from "@/lib/ai/tasks";
import { isoDateTime } from "../fields";

export const ModelId = z.string().regex(/^claude-[a-z0-9][a-z0-9.-]{2,60}$/);
export const EffortZ = z.enum(["low", "medium", "high", "xhigh", "max"]);
/** USD per million tokens */
export const PriceRow = z.object({
  in: z.number().min(0),
  out: z.number().min(0),
  cacheRead: z.number().min(0),
  cacheWrite5m: z.number().min(0),
  cacheWrite1h: z.number().min(0),
  batchIn: z.number().min(0),
  batchOut: z.number().min(0),
});
/** a prompt family of AI-D27 (`PROMPT_FAMILIES`) */
const FamilyZ = z.enum(PROMPT_FAMILIES);
/** an AI task id of AI-§A.2 (`AI_TASK_IDS`) */
export const TaskIdZ = z.enum(AI_TASK_IDS);
/** a design gene id ("G1" … "G99") */
const GeneIdZ = z.string().regex(/^G[1-9]\d?$/);

export const ClassZ = z.object({
  model: ModelId,
  effort: EffortZ,
  maxTokens: z.number().int().min(256).max(64_000),
  /** every call, pattern-B stages included, is ≤ 90 s (rev 4) */
  timeoutMs: z.number().int().min(5_000).max(90_000),
  fastMode: z.literal(false).default(false),
  fallbacks: z.enum(["default", "none"]),
  batch: z.enum(["never", "allowed", "always", "fallback"]),
});
export const TASK_CLASSES = ["director_interactive", "director_deep", "worker", "fast"] as const;
export const TaskClassZ = z.enum(TASK_CLASSES);

/** `client.models.retrieve(id)` as the console's "Check model" stores it (AI-§B.2), with the API's field names */
export const ModelInfo = z.object({
  id: ModelId,
  display_name: z.string().max(120),
  max_input_tokens: z.number().int().min(0).nullable(),
  max_tokens: z.number().int().min(0).nullable(),
  checkedAt: isoDateTime,
});
export type ModelInfo = z.output<typeof ModelInfo>;

/** What `scripts/qa/ai-probe.ts --write` records (AI-§B.12): measurements only, each null / empty until measured. */
export const ProbeResult = z.object({
  at: isoDateTime,
  /** line 1: the call shape the probe validated */
  callShape: z.enum(["parse", "create"]).nullable().default(null),
  /** line 8 */
  streamTransport: z.enum(["stream", "poll"]).nullable().default(null),
  /** line 11: sustained output tokens per second per class at its effort (median of three runs) */
  tokPerSec: z.partialRecord(TaskClassZ, z.number().positive().max(100_000)).default({}),
  /** the detached-job probe (AI-§B.13); informational, the `after()` driver is the release flag ai_detached_jobs */
  detachedJob: z
    .object({ survivedMs: z.number().int().min(0), proxyCutMs: z.number().int().min(0).nullable(), at: isoDateTime })
    .nullable()
    .default(null),
  /** line 4: the live price rows the probe read back (USD/MTok) */
  prices: z.record(ModelId, PriceRow).default({}),
  /** pass / fail per probe line, "1" … "12" */
  lines: z
    .record(z.string().regex(/^(1[0-2]|[1-9])$/), z.object({ pass: z.boolean(), note: z.string().max(300).default("") }))
    .default({}),
});
export type ProbeResult = z.output<typeof ProbeResult>;

/** a per-task route override (AI-§B.1); an absent field keeps the class value */
const RouteZ = z
  .object({
    enabled: z.boolean(),
    effort: EffortZ,
    fast: z.boolean(),
    /** rev 4: ≤ 90 s like every call */
    deadlineMs: z.number().int().min(5_000).max(90_000),
    maxTokens: z.number().int().min(256).max(64_000),
  })
  .partial();

export const PlatformAi = z.object({
  /** false until a key and a cap exist (D40) */
  enabled: z.boolean().default(false),
  classes: z
    .object({
      director_interactive: ClassZ.prefault({ model: "claude-opus-5-5", effort: "medium", maxTokens: 10_000, timeoutMs: 90_000, fallbacks: "default", batch: "never" }),
      director_deep: ClassZ.prefault({ model: "claude-fable-5-1", effort: "high", maxTokens: 32_000, timeoutMs: 90_000, fallbacks: "default", batch: "fallback" }),
      worker: ClassZ.prefault({ model: "claude-sonnet-5-5", effort: "low", maxTokens: 8_000, timeoutMs: 60_000, fallbacks: "default", batch: "allowed" }),
      fast: ClassZ.prefault({ model: "claude-haiku-5-5", effort: "low", maxTokens: 2_000, timeoutMs: 30_000, fallbacks: "none", batch: "allowed" }),
    })
    .prefault({}),
  /** a class change in canary (AI-§F.8): the patch applies to `bp` basis points of the class's runs */
  classesCanary: z
    .object({ class: TaskClassZ, patch: ClassZ.partial(), bp: z.number().int().min(0).max(10_000), startedAt: isoDateTime })
    .nullable()
    .default(null),
  /** confirmed rows (console, probe); the seed rows apply under them (`effectivePrices`) */
  prices: z.record(ModelId, PriceRow).default({}),
  caps: z
    .object({
      /** null = cloud stays off (no_cap) */
      monthlyUsd: z.number().positive().max(100_000).nullable().default(null),
      /** optional USD ceiling on the daily credits (AI-§C.2) */
      dailyUsdPerStore: z.number().positive().nullable().default(null),
      storeDailyCapPct: z.number().int().min(5).max(100).default(25),
      directorPassesPerStorePerDay: z.number().int().min(1).max(500).default(30),
      deepPassesPerStorePerDay: z.number().int().min(0).max(100).default(5),
      /** rev 3 (QUAL-34): share of a store's monthly credits Director passes may use */
      directorSharePct: z.number().int().min(10).max(100).default(60),
      /** rev 3 (SEC-1): share of monthlyUsd that pending stores may spend together */
      pendingSharePct: z.number().int().min(1).max(50).default(10),
      /** rev 3: the daily credit floor of pending stores (50 for approved stores, §A.4) */
      pendingDailyFloor: z.number().int().min(0).max(50).default(10),
      concurrentDirector: z.number().int().min(1).max(20).default(4),
      concurrentWorker: z.number().int().min(1).max(40).default(8),
      concurrentFast: z.number().int().min(1).max(60).default(12),
      perStoreWorker: z.number().int().min(1).max(6).default(3),
    })
    .prefault({}),
  /** mirrors the flag ai_generation_enabled for the console tile (the flag is authoritative) */
  killSwitch: z.boolean().default(false),
  /** the active version per prompt family */
  promptVersions: z.partialRecord(FamilyZ, z.string().max(32)).default({}),
  /** the active version per family of the on-device prompts */
  localPromptVersions: z.partialRecord(FamilyZ, z.string().max(32)).default({}),
  /** the Director rubric version (AI-§A.8.3) */
  rubricVersion: z.string().max(16).default("v3"),
  evalGate: z
    .object({
      /** single judge for Worker outputs */
      judgeModel: ModelId.default("claude-opus-5-5"),
      /** per candidate class; a jury containing the class's own model is refused at save (QUAL-13) */
      jury: z
        .object({
          director_interactive: z.tuple([ModelId, ModelId]).default(["claude-fable-5-1", "claude-sonnet-5-5"]),
          director_deep: z.tuple([ModelId, ModelId]).default(["claude-opus-5-5", "claude-sonnet-5-5"]),
          fast: z.tuple([ModelId]).default(["claude-sonnet-5-5"]),
        })
        .prefault({}),
      minWinRateLowerBound: z.number().default(0.5),
      improvementWinRate: z.number().default(0.55),
      maxDiversityDrop: z.number().default(0.02),
      maxCostIncrease: z.number().default(0.2),
      minJudgeAgreement: z.number().default(0.85),
      /** rev 3 (ENGP-14): the volume-scaled canary slice and the promotion thresholds (AI-§F.8) */
      canary: z
        .object({
          bpByWeeklyRuns: z
            .array(z.object({ below: z.number().int(), bp: z.number().int().max(10_000) }))
            .default([
              { below: 400, bp: 5_000 },
              { below: 2_000, bp: 2_000 },
            ]),
          bpDefault: z.number().int().default(500),
          promote: z
            .array(z.object({ days: z.number().int(), minRuns: z.number().int() }))
            .default([
              { days: 7, minRuns: 50 },
              { days: 14, minRuns: 20 },
            ]),
          rollbackMinRuns: z.number().int().default(20),
          lowVolumeReviewDays: z.number().int().default(28),
        })
        .prefault({}),
      /** rev 3 (ENGP-30): size of the interactive smoke live run */
      smokeCases: z.number().int().min(10).max(40).default(20),
    })
    .prefault({}),
  /** rev 3 (QUAL-11): set true only with a passing `preference` eval run; audited */
  directorAutoDefault: z.boolean().default(false),
  /** rev 3: the recorded paired blind test behind `directorAutoDefault` (AI-§F.9); null = none */
  preferenceTest: z
    .object({ runId: z.string().min(1).max(64), lowerBound: z.number().min(0).max(1), at: isoDateTime })
    .nullable()
    .default(null),
  /** k-anonymous aggregates */
  patternLibrary: z.boolean().default(false),
  /** Fable 5.1 requires 30-day retention, shown in the store's AI settings */
  retentionNotice: z.enum(["30d"]).default("30d"),
  /** server-side fallbacks on the Director and Worker classes (AI-D7); "off" is the incident switch */
  fallbacks: z.enum(["default", "off"]).default("default"),
  /** shape A (`parse`) or shape B (`create` + local parsing), set by the probe (AI-D7) */
  callShape: z.enum(["parse", "create"]).default("parse"),
  /** NDJSON streaming or the poll fallback (probe line 8) */
  streamTransport: z.enum(["stream", "poll"]).default("stream"),
  routes: z.partialRecord(TaskIdZ, RouteZ).default({}),
  /** tasks whose `auto` mode prefers the cloud; set only through the eval gate (AI-§F.6) */
  autoPrefersCloud: z.partialRecord(TaskIdZ, z.literal(true)).default({}),
  cacheTtl: z.object({ platform: z.enum(["1h", "5m"]).default("1h") }).prefault({}),
  vision: z
    .object({
      maxSide: z.number().int().min(512).max(1568).default(1024),
      maxImages: z.number().int().min(1).max(4).default(3),
      tileQuality: z.number().min(0.6).max(0.95).default(0.85),
    })
    .prefault({}),
  /** R3: platform pins and bans of gene values, read by the sampler (DES-§4.3) */
  genePins: z
    .record(GeneIdZ, z.object({ pin: z.array(z.string().max(48)).max(40).optional(), ban: z.array(z.string().max(48)).max(40).optional() }))
    .default({}),
  modelInfo: z.record(ModelId, ModelInfo).default({}),
  /** the last probe run (AI-§B.12); null = never probed */
  probe: ProbeResult.nullable().default(null),
}).superRefine((v, ctx) => {
  // AI-D28, QUAL-13: the judge is never the model under test, and no jury contains it
  for (const cls of ["director_interactive", "director_deep", "fast"] as const) {
    if ((v.evalGate.jury[cls] as readonly string[]).includes(v.classes[cls].model)) {
      ctx.addIssue({ code: "custom", path: ["evalGate", "jury", cls], message: `the ${cls} jury contains the ${cls} model` });
    }
  }
  if (v.evalGate.judgeModel === v.classes.worker.model) {
    ctx.addIssue({ code: "custom", path: ["evalGate", "judgeModel"], message: "the judge is the worker model under test" });
  }
  // QUAL-11: "auto" for stores that never chose only with a recorded passing preference test
  if (v.directorAutoDefault && v.preferenceTest === null) {
    ctx.addIssue({ code: "custom", path: ["directorAutoDefault"], message: "needs a recorded preference test" });
  }
});
export type PlatformAiSetting = z.output<typeof PlatformAi>;
export type PriceRowValue = z.output<typeof PriceRow>;
export type PriceCell = keyof PriceRowValue;
export type PriceTable = Readonly<Record<string, PriceRowValue>>;

/**
 * The AI-§B.2 seed rows, USD per million tokens (published list prices; prices change, so the console edits them and a
 * stored row wins). Haiku 5.5's row is its card for prompts up to 100K tokens (`LONG_PROMPT_PRICING`).
 */
export const SEED_PRICES: PriceTable = {
  "claude-fable-5-1": { in: 10, out: 50, cacheRead: 0.25, cacheWrite5m: 12.5, cacheWrite1h: 20, batchIn: 5, batchOut: 25 },
  "claude-opus-5-5": { in: 4, out: 20, cacheRead: 0.2, cacheWrite5m: 5, cacheWrite1h: 8, batchIn: 2, batchOut: 10 },
  "claude-opus-5": { in: 5, out: 25, cacheRead: 0.5, cacheWrite5m: 6.25, cacheWrite1h: 10, batchIn: 2.5, batchOut: 12.5 },
  "claude-opus-4-8": { in: 5, out: 25, cacheRead: 0.5, cacheWrite5m: 6.25, cacheWrite1h: 10, batchIn: 2.5, batchOut: 12.5 },
  "claude-sonnet-5-5": { in: 2, out: 10, cacheRead: 0.2, cacheWrite5m: 2.5, cacheWrite1h: 4, batchIn: 1, batchOut: 5 },
  "claude-haiku-5-5": { in: 0.1, out: 0.5, cacheRead: 0.01, cacheWrite5m: 0.125, cacheWrite1h: 0.2, batchIn: 0.05, batchOut: 0.25 },
};

/**
 * Seed cells that are not a published figure: "derived" = computed from a published multiplier (cache reads 0.1x,
 * writes 1.25x / 2x, batch 0.5x); "verify" = sources disagree, the higher figure is seeded until `qa:ai-probe` (line 4)
 * or the console records the live row.
 */
export const SEED_PRICE_NOTES: Readonly<Record<string, Partial<Record<PriceCell, "derived" | "verify">>>> = {
  "claude-opus-5": { cacheWrite5m: "derived", cacheWrite1h: "derived", batchIn: "derived", batchOut: "derived" },
  "claude-opus-4-8": { cacheRead: "derived", cacheWrite5m: "derived", cacheWrite1h: "derived", batchIn: "derived", batchOut: "derived" },
  "claude-sonnet-5-5": { cacheRead: "verify", batchIn: "derived", batchOut: "derived" },
  "claude-haiku-5-5": { cacheRead: "derived", cacheWrite5m: "derived", cacheWrite1h: "derived", batchIn: "derived", batchOut: "derived" },
};

/** A model whose price card switches above a prompt size (AI-§B.2: Haiku 5.5 is $0.50 / $2.50 above 100K tokens, 5x). */
export const LONG_PROMPT_PRICING: Readonly<Record<string, { aboveTokens: number; factor: number }>> = {
  "claude-haiku-5-5": { aboveTokens: 100_000, factor: 5 },
};

/** The rows the router prices with: the seed under the stored rows, and the notes of the seed rows still in use. */
export function effectivePrices(stored: Readonly<Record<string, PriceRowValue>>): { rows: PriceTable; notes: typeof SEED_PRICE_NOTES } {
  const notes: Record<string, Partial<Record<PriceCell, "derived" | "verify">>> = {};
  for (const [model, n] of Object.entries(SEED_PRICE_NOTES)) if (!Object.hasOwn(stored, model)) notes[model] = n;
  return { rows: { ...SEED_PRICES, ...stored }, notes };
}
