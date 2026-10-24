/**
 * Platform setting `platform_ai` (docs/STORE-SAAS.md §D.10, ai.md AI-§M.5; not secret; owner: ai, P7). The R1.0 first
 * schema holds the paths §D.10 names: `enabled`, `classes` (D55), `prices`, `caps`, `directorAutoDefault`,
 * `promptVersions`, `evalGate`, `patternLibrary`, `retentionNotice`; P7 adds its extras (routes, vision, probe…).
 * The API key is not here: it lives in `platform_ai_secret`. `prices` starts empty (P7 seeds the rows it measured;
 * no price is invented here).
 */
import { z } from "zod";

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
/** a prompt family id, e.g. "copy.landing" */
const FamilyZ = z.string().regex(/^[a-z][a-z0-9_.-]{1,40}$/);

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
  /** the active version per prompt family */
  promptVersions: z.record(FamilyZ, z.string().max(32)).default({}),
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
  /** k-anonymous aggregates */
  patternLibrary: z.boolean().default(false),
  /** Fable 5.1 requires 30-day retention, shown in the store's AI settings */
  retentionNotice: z.enum(["30d"]).default("30d"),
});
export type PlatformAiSetting = z.output<typeof PlatformAi>;
