/**
 * Platform setting `platform_ai` (docs/STORE-SAAS.md §D.10, ai.md AI-§M.5; not secret; owner: ai, P7). The paths §D.10
 * names (`enabled`, `classes` (D55), `prices`, `caps`, `directorAutoDefault`, `promptVersions`, `evalGate`,
 * `patternLibrary`, `retentionNotice`) and, from P0, the ai-owned extras of AI-§M.5 (`classesCanary`, `killSwitch`,
 * `localPromptVersions`, `rubricVersion`, `preferenceTest`, `fallbacks`, `callShape`, `streamTransport`, `routes`,
 * `autoPrefersCloud`, `cacheTtl`, `vision`, `genePins`, `modelInfo`, `probe`), so P7 builds against the whole R1 list.
 * The API key is not here: it lives in `platform_ai_secret`. `prices` starts empty (P7 seeds the rows the probe and the
 * pricing check confirm; no price is invented here). Task ids are checked by shape until P7's task registry
 * (src/lib/ai/tasks.ts, `AI_TASK_IDS`) exists; P7 narrows `TaskIdZ` to it (keep the records partial: no stored row changes).
 */
import { z } from "zod";
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
/** a prompt family id, e.g. "copy.landing" */
const FamilyZ = z.string().regex(/^[a-z][a-z0-9_.-]{1,40}$/);
/** an AI task id of AI-§A.2 ("copy.page", "removeBackground", "design.critique"); P7 narrows it to `AI_TASK_IDS` */
export const TaskIdZ = z.string().regex(/^[a-z][A-Za-z0-9]{1,30}(\.[a-z][A-Za-z0-9]{1,30})?$/);
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
  promptVersions: z.record(FamilyZ, z.string().max(32)).default({}),
  /** the active version per family of the on-device prompts */
  localPromptVersions: z.record(FamilyZ, z.string().max(32)).default({}),
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
  routes: z.record(TaskIdZ, RouteZ).default({}),
  /** tasks whose `auto` mode prefers the cloud; set only through the eval gate (AI-§F.6) */
  autoPrefersCloud: z.record(TaskIdZ, z.literal(true)).default({}),
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
});
export type PlatformAiSetting = z.output<typeof PlatformAi>;
