import "server-only";
/**
 * The bodies of the two console read APIs (P7 AI; ai.md AI-§K.4, AI-§O; core §H.5; platform.md PLA-§15.1 AI panel row,
 * PD57, PD68), re-exported with their frozen signatures by ../summary.server.ts:
 *   - `storeSummary(ctx, storeId)`: the store profile's AI tab, read through `platformScope(ctx, storeId)` (the seam's
 *     console scope, `console.read`): the store's choices, credits from `store_usage`, boosts, passes today, the
 *     month's cost and runs (by task, class and provider, with latency and refusals), the guard-rejection heat-map,
 *     open jobs and the last 50 runs. Metadata only: never a prompt, an output, a memory item or a voice word;
 *   - `platformHealth()`: the "AI" section of `getHealth` and the Overview status tile (no store row leaves: counts,
 *     shares and the served models only). Every cross-store statement is annotated `tenancy: platform` and counted in
 *     the folder's pin (CCR r1-p7-15).
 */
import { and, count, eq, gte, inArray, isNull, lt, max, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { aiJobs, aiRuns, flags, promptVersions, storeEntitlements, type AiFlag } from "@/lib/db/schema";
import { flagDef } from "@/lib/flags/registry";
import { platformScope } from "@/lib/platform/seam";
import { getPlatformSetting, getStoreSetting } from "@/lib/settings";
import { TASK_CLASSES } from "@/lib/settings/keys/platform_ai";
import { usageMetric } from "@/lib/tenancy/entitlement-keys";
import { entitlement, usageValue } from "@/lib/tenancy/entitlements";
import { getStoreById } from "@/lib/tenancy/public";
import { SeamError } from "@/lib/tenancy/seam";
import { whereStore } from "@/lib/tenancy/sql";
import type { PlatformCtx, StoreScope } from "@/lib/tenancy/types";
import { dailyCreditLimit } from "../quota/cost";
import { periodRangeUtc } from "../quota/periods";
import { breaker } from "../server/breaker";
import { keySource } from "../server/key";
import { isClassDown } from "../server/models";
import { monthCostMicros, recentRuns } from "../store/runs";
import type { AiStoreSummary, AiHealth } from "../summary.server";
import type { AiTaskId, TaskClass } from "../tasks";
import { openBatches } from "./batches";
import { ORPHAN_AFTER_MS, quantile } from "./console-view";
import { platformSpend } from "./usage";

/** Runs read for one store's month (beta volume is far below; the newest win when a store goes past it). */
const STORE_MONTH_ROWS = 5_000;
const FALLBACK_FLAGS: readonly AiFlag[] = ["fallback_model", "director_fallback"];

type RunLite = { task: string; class: TaskClass | null; provider: "server" | "local" | "library"; status: string; ms: number; flags: AiFlag[] | null; rejected: string[] | null };

/** Active AI credit boosts of the store (`store_entitlements`, source boost, not expired). */
async function aiBoosts(scope: StoreScope, now: Date): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(storeEntitlements)
    .where(whereStore(storeEntitlements, scope, eq(storeEntitlements.key, "ai_credits_month"), eq(storeEntitlements.source, "boost"), or(isNull(storeEntitlements.expiresAt), gte(storeEntitlements.expiresAt, now))));
  return Number(row?.n ?? 0);
}

async function monthRuns(scope: StoreScope, since: Date, until: Date): Promise<RunLite[]> {
  return db
    .select({ task: aiRuns.task, class: aiRuns.class, provider: aiRuns.provider, status: aiRuns.status, ms: aiRuns.ms, flags: aiRuns.flags, rejected: aiRuns.rejectedFields })
    .from(aiRuns)
    .where(whereStore(aiRuns, scope, gte(aiRuns.createdAt, since), lt(aiRuns.createdAt, until)))
    .orderBy(sql`${aiRuns.createdAt} DESC`)
    .limit(STORE_MONTH_ROWS);
}

async function openJobsOf(scope: StoreScope): Promise<number> {
  const [row] = await db.select({ n: count() }).from(aiJobs).where(whereStore(aiJobs, scope, inArray(aiJobs.status, ["queued", "running"])));
  return Number(row?.n ?? 0);
}

/** Runs grouped by task, class and provider, with latency and the refusals / fallbacks counted. */
export function groupRuns(rows: readonly RunLite[]): AiStoreSummary["runs"] {
  const groups = new Map<string, { by: "task" | "class" | "provider"; key: string; ms: number[]; n: number; refusals: number; fallbacks: number }>();
  const add = (by: "task" | "class" | "provider", key: string | null, r: RunLite) => {
    if (key === null) return;
    const id = `${by}:${key}`;
    const g = groups.get(id) ?? { by, key, ms: [], n: 0, refusals: 0, fallbacks: 0 };
    g.n++;
    if (r.status !== "running") g.ms.push(r.ms);
    if (r.status === "refused") g.refusals++;
    if ((r.flags ?? []).some((f) => FALLBACK_FLAGS.includes(f))) g.fallbacks++;
    groups.set(id, g);
  };
  for (const r of rows) {
    add("task", r.task, r);
    add("class", r.class, r);
    add("provider", r.provider, r);
  }
  return [...groups.values()]
    .sort((a, b) => (a.by === b.by ? b.n - a.n : a.by.localeCompare(b.by)))
    .map((g) => ({ by: g.by, key: g.key, n: g.n, p50Ms: quantile(g.ms, 0.5), p95Ms: quantile(g.ms, 0.95), refusals: g.refusals, fallbacks: g.fallbacks }));
}

/** The guard-rejection heat-map: rejected fields per task (names only, never text). */
export function rejectionsOf(rows: readonly RunLite[]): AiStoreSummary["rejections"] {
  const m = new Map<string, { task: AiTaskId; field: string; n: number }>();
  for (const r of rows) {
    for (const field of r.rejected ?? []) {
      const f = String(field).slice(0, 48);
      const id = `${r.task}|${f}`;
      const e = m.get(id) ?? { task: r.task as AiTaskId, field: f, n: 0 };
      e.n++;
      m.set(id, e);
    }
  }
  return [...m.values()].sort((a, b) => b.n - a.n).slice(0, 60);
}

export async function storeSummary(ctx: PlatformCtx, storeId: string, now: Date = new Date()): Promise<AiStoreSummary> {
  const scope = platformScope(ctx, storeId);
  const store = await getStoreById(storeId);
  if (!store) throw new SeamError("not_found");
  const tz = store.timezone ?? "Africa/Casablanca";
  const month = usageMetric("ai_credits", now, tz).period;
  const range = periodRangeUtc(month, tz);
  const [storeAi, platformAi, monthUsed, monthLimit, dayUsed, directorToday, deepToday, boosts, cost, runs, openJobs, recent] = await Promise.all([
    getStoreSetting(scope, "store_ai"),
    getPlatformSetting("platform_ai"),
    usageValue(scope, usageMetric("ai_credits", now, tz)),
    entitlement(scope, "ai_credits_month"),
    usageValue(scope, usageMetric("ai_credits_day", now, tz)),
    usageValue(scope, usageMetric("ai_director_passes", now, tz)),
    usageValue(scope, usageMetric("ai_deep_passes", now, tz)),
    aiBoosts(scope, now),
    monthCostMicros(scope, month, tz),
    monthRuns(scope, range.start, range.end),
    openJobsOf(scope),
    recentRuns(scope, 50),
  ]);
  const caps = platformAi.caps;
  const dayLimit = dailyCreditLimit({ monthly: monthLimit, storeDailyCapPct: caps.storeDailyCapPct, dailyUsdPerStore: caps.dailyUsdPerStore, pending: store.status === "pending", pendingDailyFloor: caps.pendingDailyFloor });
  return {
    storeId,
    mode: storeAi.mode,
    director: storeAi.director,
    deepPass: storeAi.deepPass,
    credits: { month: { used: monthUsed, limit: monthLimit }, day: { used: dayUsed, limit: dayLimit }, boosts },
    passesToday: { director: directorToday, deep: deepToday },
    costMicrosMonth: cost,
    runs: groupRuns(runs),
    rejections: rejectionsOf(runs),
    openJobs,
    recent: recent.map((r) => ({ id: r.id, at: r.at, task: r.task, class: r.class, provider: r.provider, model: r.model, status: r.status, credits: r.credits, ms: r.ms })),
    learning: { learn: storeAi.learning, share: storeAi.sharePatterns },
  };
}

/* ------------------------------------------------------------------ */
/* platform health                                                     */
/* ------------------------------------------------------------------ */

/** The flag's platform-wide value (its row's default, else the registry's), for the health line. */
export async function flagDefault(key: string): Promise<boolean> {
  // tenancy: platform flags is a P table: one row's default value
  const [row] = await db.select({ value: flags.defaultValue, archived: flags.archived }).from(flags).where(eq(flags.key, key)).limit(1);
  if (row && !row.archived && typeof row.value === "boolean") return row.value;
  const d = flagDef(key)?.default;
  return typeof d === "boolean" ? d : false;
}

export type DriverShares = Partial<Record<"after" | "poll" | "cron" | "batch", number>>;

/** The stage drivers of the jobs updated since `since` (counts per driver; the console shows shares with n). */
export async function driverCounts(since: Date): Promise<DriverShares> {
  // tenancy: platform ai_jobs per driver across stores (AI-§O stage drivers): counts only
  const rows = await db.select({ driver: aiJobs.driver, n: count() }).from(aiJobs).where(and(gte(aiJobs.updatedAt, since), sql`${aiJobs.driver} IS NOT NULL`)).groupBy(aiJobs.driver);
  const out: DriverShares = {};
  for (const r of rows) if (r.driver) out[r.driver] = Number(r.n);
  return out;
}

/** Jobs running, orphaned (a running job without a heartbeat for 60 s) and failed in 24 h. */
export async function jobCounts(now: Date): Promise<{ running: number; orphaned: number; queued: number; failed24h: number }> {
  const stale = new Date(now.getTime() - ORPHAN_AFTER_MS);
  const day = new Date(now.getTime() - 86_400_000);
  // tenancy: platform ai_jobs state counts across stores (AI-§O jobs line): counts only
  const [row] = await db
    .select({
      running: sql<number>`SUM(${aiJobs.status} = 'running')`,
      queued: sql<number>`SUM(${aiJobs.status} = 'queued')`,
      orphaned: sql<number>`SUM(${aiJobs.status} = 'running' AND (${aiJobs.heartbeatAt} IS NULL OR ${aiJobs.heartbeatAt} < ${stale}))`,
      failed: sql<number>`SUM(${aiJobs.status} = 'failed' AND ${aiJobs.updatedAt} >= ${day})`,
    })
    .from(aiJobs)
    .where(or(inArray(aiJobs.status, ["queued", "running"]), gte(aiJobs.updatedAt, day)));
  return { running: Number(row?.running ?? 0), queued: Number(row?.queued ?? 0), orphaned: Number(row?.orphaned ?? 0), failed24h: Number(row?.failed ?? 0) };
}

/** The last 24 h of server runs: totals, refusals, the Director-share refusals and fallback use per class. */
async function dayRunStats(now: Date): Promise<{ runs: number; refused: number; directorShare: number; errorsHour: number; fallbacks: Partial<Record<TaskClass, number>>; lastOkAt: Date | null }> {
  const day = new Date(now.getTime() - 86_400_000);
  const hour = new Date(now.getTime() - 3_600_000);
  // tenancy: platform ai_runs outcome counts per class across stores (AI-§O health): counts only
  const rows = await db
    .select({
      class: aiRuns.class,
      runs: count(),
      refused: sql<number>`SUM(${aiRuns.status} = 'refused')`,
      directorShare: sql<number>`SUM(${aiRuns.errorCode} = 'quota_director')`,
      errorsHour: sql<number>`SUM(${aiRuns.status} = 'error' AND ${aiRuns.createdAt} >= ${hour})`,
      fallbacks: sql<number>`SUM(${aiRuns.flags} LIKE '%"fallback_model"%' OR ${aiRuns.flags} LIKE '%"director_fallback"%')`,
    })
    .from(aiRuns)
    .where(and(eq(aiRuns.provider, "server"), gte(aiRuns.createdAt, day)))
    .groupBy(aiRuns.class);
  // tenancy: platform the newest successful server call across stores (AI-§O last successful call): one instant
  const [last] = await db.select({ at: max(aiRuns.createdAt) }).from(aiRuns).where(and(eq(aiRuns.provider, "server"), eq(aiRuns.status, "ok")));
  const out = { runs: 0, refused: 0, directorShare: 0, errorsHour: 0, fallbacks: {} as Partial<Record<TaskClass, number>>, lastOkAt: last?.at ?? null };
  for (const r of rows) {
    out.runs += Number(r.runs);
    out.refused += Number(r.refused ?? 0);
    out.directorShare += Number(r.directorShare ?? 0);
    out.errorsHour += Number(r.errorsHour ?? 0);
    if (r.class) out.fallbacks[r.class] = Number(r.fallbacks ?? 0);
  }
  return out;
}

export async function platformHealth(now: Date = new Date()): Promise<AiHealth> {
  const [settings, source, spend, batches, jobs, drivers, stats, detachedFlag, canary] = await Promise.all([
    getPlatformSetting("platform_ai"),
    keySource(),
    platformSpend(now),
    openBatches(),
    jobCounts(now),
    driverCounts(new Date(now.getTime() - 7 * 86_400_000)),
    dayRunStats(now),
    flagDefault("ai_detached_jobs"),
    // tenancy: platform prompt_versions is a P table: the canary in flight
    db.select({ version: promptVersions.version }).from(promptVersions).where(and(eq(promptVersions.status, "canary"), eq(promptVersions.provider, "server"))).limit(1),
  ]);
  const b = breaker().state();
  const paused = breaker().paused();
  const oldest = batches.reduce<Date | null>((o, r) => (o === null || r.createdAt < o ? r.createdAt : o), null);
  return {
    keySource: source,
    enabled: settings.enabled,
    classes: TASK_CLASSES.map((cls) => ({
      class: cls,
      state: isClassDown(cls, now.getTime()) ? "unavailable" : paused ? "paused" : "ok",
      model: settings.classes[cls].model,
      fallbacks24h: stats.fallbacks[cls] ?? 0,
    })),
    breaker: b === "auth" ? "open" : b,
    transport: settings.streamTransport,
    deepTransport: settings.classes.director_deep.batch === "always" ? "batch" : "job",
    lastOkAt: stats.lastOkAt ? stats.lastOkAt.toISOString() : null,
    batches: { open: batches.length, oldestAgeMin: oldest ? Math.floor((now.getTime() - oldest.getTime()) / 60_000) : null },
    jobs: { running: jobs.running, orphaned: jobs.orphaned, failed24h: jobs.failed24h, drivers },
    spend: { monthMicros: spend.monthMicros, capMicros: spend.capMicros, usedPct: spend.usedPct, pendingSliceUsedPct: spend.pendingUsedPct },
    refusalRate24h: stats.runs > 0 ? stats.refused / stats.runs : null,
    errorsLastHour: stats.errorsHour,
    directorShareRefusals24h: stats.directorShare,
    canary: canary[0] ? { promptVersion: canary[0].version } : null,
    detachedJobs: { flag: detachedFlag, probedAt: settings.probe?.detachedJob?.at ?? null },
  };
}
