import "server-only";
/**
 * What `aiPolicyFor(ctx)` reads (P7 AI; ai.md AI-§A.4, AI-§C.1-C.3, AI-§F.2, GEN-13; docs/STORE-SAAS.md §A.4,
 * §A.5.2, §E.6, D70). Everything goes through the scope: the store's settings, entitlements and counters; the platform
 * settings, the key source, the release flags and the platform spend are platform values. `buildPolicy()`
 * (../policy.ts) turns the result into the policy; this file only loads.
 *
 *   - `loadPolicyInputs(ctx)`: the inputs, cached by the caller 15 s per (store, user);
 *   - `impersonationInputs(ctx)`: a "View as store" session reads no counter and no flag (D70): the inputs that make
 *     `live: []`, `state` and the local rung off.
 * The kill switch is not part of the cached inputs: the caller reads `activeKillSwitches()` (30 s) on every call, so
 * the flag is reflected within 30 s whatever the policy cache holds.
 */
import type { Locale, Market } from "@/lib/page/schema";
import { CURRENT_RELEASE } from "@/lib/auth/permissions";
import { getPlatformSetting, getStoreSetting } from "@/lib/settings";
import { usageMetric } from "@/lib/tenancy/entitlement-keys";
import { EntitlementError, assertFeature, entitlement, usageValue } from "@/lib/tenancy/entitlements";
import type { StoreCtx } from "@/lib/tenancy/types";
import { DIRECTOR_PASS_CREDITS_P90, type CloudInputs, type PolicyInputs } from "../policy";
import { assembleDepsFor } from "../prompts/deps.server";
import { storeBlockCtxFor } from "../prompts/assemble.server";
import { promptFor } from "../prompts/registry";
import { voiceLocal } from "../prompts/store-block";
import { platformSpend } from "../platform/usage";
import { dailyCreditLimit, directorShareLimit } from "../quota/cost";
import { aiFlagsFor } from "../server/flags";
import { keySource } from "../server/key";
import { hasActiveDeepJob } from "../store/jobs";
import { TASKS, liveTasks, type AiTaskId, type TaskClass } from "../tasks";

/** The circuit breaker and the per-class `classDownUntil` (AI-§B.2, AI-§B.10) arrive with the server provider (step 7). */
export interface PolicyProbes {
  paused(): boolean;
  classDown(cls: TaskClass): boolean;
}
const NO_PROBES: PolicyProbes = { paused: () => false, classDown: () => false };

const left = (limit: number | null, used: number): number | null => (limit === null ? null : Math.max(0, limit - used));

const COPY_LOCALES = new Set(["ar", "fr", "en"]);

/** cloud_ai after the state cap (§A.5.2); a kill-switch refusal is the separate `kill` line, read fresh by the caller. */
async function cloudEntitlement(ctx: StoreCtx): Promise<CloudInputs["entitlement"]> {
  try {
    await assertFeature(ctx.scope, "cloud_ai");
    return "ok";
  } catch (err) {
    if (err instanceof EntitlementError) return err.reason === "state" ? "state" : err.reason === "kill" ? "ok" : "entitlement";
    throw err;
  }
}

/** The compact local voice (≤ 120 tokens) for the store's primary locale; "" when it cannot be built. */
async function localVoice(ctx: StoreCtx): Promise<string> {
  try {
    const primary = (COPY_LOCALES.has(ctx.store.defaultLocale) ? ctx.store.defaultLocale : "fr") as "ar" | "fr" | "en";
    const block = await storeBlockCtxFor(ctx.scope, { market: ctx.store.market as Market, currency: ctx.store.currency, primaryLocale: primary as Locale }, assembleDepsFor());
    return voiceLocal(block, primary);
  } catch (err) {
    console.error(`[ai] voiceLocal unavailable: ${err instanceof Error ? err.name : "error"}`);
    return "";
  }
}

export async function loadPolicyInputs(ctx: StoreCtx, probes: PolicyProbes = NO_PROBES, now = new Date()): Promise<PolicyInputs> {
  const { scope, store } = ctx;
  const tz = store.timezone;
  const metric = (m: Parameters<typeof usageMetric>[0]) => usageValue(scope, usageMetric(m, now, tz));
  const [ai, platform, storeAi, source, ent, flagsOn, monthly, spend, usedMonth, usedDay, usedDirector, passesDirector, passesDeep, deepJob, voice] = await Promise.all([
    getPlatformSetting("platform_ai"),
    getPlatformSetting("platform"),
    getStoreSetting(scope, "store_ai"),
    keySource(),
    cloudEntitlement(ctx),
    aiFlagsFor({ storeId: scope.storeId, userId: ctx.user.id, store, platformRole: ctx.user.platformRole }),
    entitlement(scope, "ai_credits_month"),
    platformSpend(now),
    metric("ai_credits"),
    metric("ai_credits_day"),
    metric("ai_credits_director"),
    metric("ai_director_passes"),
    metric("ai_deep_passes"),
    hasActiveDeepJob(scope),
    localVoice(ctx),
  ]);
  const pending = store.status === "pending";
  const caps = ai.caps;
  const dayLimit = dailyCreditLimit({ monthly, storeDailyCapPct: caps.storeDailyCapPct, dailyUsdPerStore: caps.dailyUsdPerStore, pending, pendingDailyFloor: caps.pendingDailyFloor });
  const live = liveTasks(CURRENT_RELEASE, flagsOn as ReadonlySet<string>, ai.routes);
  const promptVersions: PolicyInputs["promptVersions"] = {};
  for (const task of live) {
    const family = TASKS[task].family;
    const version = family ? promptFor(family, ai, "local")?.version : undefined;
    if (version) promptVersions[task as AiTaskId] = version;
  }
  return {
    cloud: {
      impersonation: false,
      enabled: ai.enabled,
      hasKey: source !== "none",
      monthlyUsd: caps.monthlyUsd,
      // the caller replaces it with the live kill-switch value on every call
      generationOn: true,
      paused: probes.paused(),
      entitlement: ent,
      mode: storeAi.mode,
      creditsLeft: left(monthly, usedMonth),
      dayLeft: left(dayLimit, usedDay),
      platformLeftMicros: left(spend.capMicros, spend.monthMicros),
      pending,
      pendingLeftMicros: left(spend.pendingCapMicros, spend.pendingMicros),
    },
    director: {
      flagOn: flagsOn.has("ai_director_brief"),
      storeChoice: storeAi.director,
      autoDefault: ai.directorAutoDefault,
      classDown: probes.classDown("director_interactive"),
      passesLeft: left(caps.directorPassesPerStorePerDay, passesDirector),
      shareLeft: left(directorShareLimit(monthly, caps.directorSharePct), usedDirector),
    },
    deep: {
      storeDeepPass: storeAi.deepPass,
      classDown: probes.classDown("director_deep"),
      passesLeft: left(caps.deepPassesPerStorePerDay, passesDeep),
      jobRunning: deepJob,
      batchAlways: ai.classes.director_deep.batch === "always",
    },
    directorPassCredits: DIRECTOR_PASS_CREDITS_P90,
    local: { enabled: storeAi.localEnabled, tierMax: storeAi.localTierCeiling, bgRemoval: storeAi.bgRemoval },
    live,
    autoPrefersCloud: { ...ai.autoPrefersCloud },
    transport: ai.streamTransport,
    promptVersions,
    voiceLocal: voice,
    workerName: `${platform.brand.name} AI`,
  };
}

/** A "View as store" session (D70): no counter, flag or voice is read; nothing renders and nothing is spent. */
export async function impersonationInputs(ctx: StoreCtx): Promise<PolicyInputs> {
  const [storeAi, platform] = await Promise.all([getStoreSetting(ctx.scope, "store_ai").catch(() => null), getPlatformSetting("platform").catch(() => null)]);
  return {
    cloud: {
      impersonation: true,
      enabled: false,
      hasKey: false,
      monthlyUsd: null,
      generationOn: true,
      paused: false,
      entitlement: "state",
      mode: storeAi?.mode ?? "auto",
      creditsLeft: null,
      dayLeft: null,
      platformLeftMicros: null,
      pending: false,
      pendingLeftMicros: null,
    },
    director: { flagOn: false, storeChoice: storeAi?.director ?? null, autoDefault: false, classDown: false, passesLeft: null, shareLeft: null },
    deep: { storeDeepPass: false, classDown: false, passesLeft: null, jobRunning: false, batchAlways: false },
    directorPassCredits: DIRECTOR_PASS_CREDITS_P90,
    local: { enabled: false, tierMax: storeAi?.localTierCeiling ?? "lite", bgRemoval: false },
    live: [],
    autoPrefersCloud: {},
    transport: "stream",
    promptVersions: {},
    voiceLocal: "",
    workerName: `${platform?.brand.name ?? "Store Gen"} AI`,
  };
}
