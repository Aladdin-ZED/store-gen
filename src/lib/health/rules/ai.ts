/**
 * Store Health rules of the ai track (P7 AI, ai.md).
 * Extension file (docs/STORE-SAAS.md §I.7, §K.3), created empty at P0 and imported by src/lib/health/registry.ts;
 * the track fills it (sentences `health.<track>.<rule>.*` in its own i18n file, D67) and never edits the registry.
 *
 * Step 12, SF-03's ai rules (AI-§I.0), read-only, scoped, ≤ 40 ms (cached settings reads only):
 *   - `ai:credits_low`: less than 20 % of the month's credits left before day 20 (store time), severity 1, quota;
 *     from `inputs.ai` (`aiUsageForStore`: store_usage, never estimated), evidence n = credits used;
 *   - `ai:director_off_with_cloud`: Cloud AI on for the store and `store_ai.director = "off"`, severity 1 (snoozable
 *     like every issue);
 *   - `ai:learning_off`: a hint with no points (`store_ai.learning = false`).
 * The two settings rules read `inputs.aiSettings` (CCR r1-p7-13 adds it to `HealthInputs`, filled by P1's
 * collectHealthInputs); until it lands they read `store_ai` / `platform_ai` through the scope themselves.
 */
import type { StoreScope } from "@/lib/tenancy/types";
import { appHref } from "@/lib/urls";
import type { HealthInputs, HealthIssue, HealthRule, HealthRuleFixture } from "../types";

/** CCR r1-p7-13: the AI settings line of `HealthInputs` (null = the read failed: the rules stay silent). */
export interface AiHealthSettings {
  director: "auto" | "ask" | "off" | null;
  learning: boolean;
  /** Cloud AI reachable for the store: the platform switched it on with a cap, and the store did not choose On-device only */
  cloudOn: boolean;
}
type WithAi = HealthInputs & { aiSettings?: AiHealthSettings | null };

/** `ai:learning_off` is a hint (SF-03: 0 points); CCR r1-p7-13 adds 0 to `HealthIssue.points`. */
const HINT_POINTS = 0 as number as HealthIssue["points"];

const settingsHref = (handle: string) => appHref(handle, "/settings/ai");

async function aiSettingsOf(scope: StoreScope, inputs: HealthInputs): Promise<AiHealthSettings | null> {
  const given = (inputs as WithAi).aiSettings;
  if (given !== undefined) return given;
  try {
    // loaded on use: the rules (and their fixtures) import nothing server-only
    const { getPlatformSetting, getStoreSetting } = await import("@/lib/settings");
    const [storeAi, platformAi] = await Promise.all([getStoreSetting(scope, "store_ai"), getPlatformSetting("platform_ai")]);
    return { director: storeAi.director, learning: storeAi.learning, cloudOn: platformAi.enabled && platformAi.caps.monthlyUsd !== null && storeAi.mode !== "local" };
  } catch {
    return null;
  }
}

/** The day of the month in the store's time zone. */
function dayOfMonth(now: Date, timeZone: string): number {
  try {
    return Number(new Intl.DateTimeFormat("en-US", { timeZone, day: "numeric" }).format(now));
  } catch {
    return now.getUTCDate();
  }
}

const creditsLow: HealthRule = {
  id: "ai:credits_low",
  group: "quota",
  release: "R1",
  async collect(_scope, inputs) {
    const ai = inputs.ai;
    if (!ai || ai.creditsLimit === null || ai.creditsLimit <= 0) return null;
    if (dayOfMonth(inputs.now, inputs.store.timezone) >= 20) return null;
    const left = Math.max(0, ai.creditsLimit - ai.creditsUsed);
    const pct = Math.floor((left * 100) / ai.creditsLimit);
    if (left * 5 >= ai.creditsLimit) return null; // ≥ 20 % left
    return {
      id: "ai:credits_low",
      group: "quota",
      severity: 1,
      points: 3,
      evidence: { metric: "ai_credits_left_pct", value: pct, baseline: 20, window: ai.month, n: ai.creditsUsed },
      fix: { kind: "link", href: settingsHref, label: "health.ai.credits_low.fix" },
      text: "health.ai.credits_low.title",
    };
  },
};

const directorOff: HealthRule = {
  id: "ai:director_off_with_cloud",
  group: "design",
  release: "R1",
  async collect(scope, inputs) {
    const s = await aiSettingsOf(scope, inputs);
    if (!s || !s.cloudOn || s.director !== "off") return null;
    return {
      id: "ai:director_off_with_cloud",
      group: "design",
      severity: 1,
      points: 3,
      evidence: { metric: "ai_director_off", value: 1, window: "now", n: 1 },
      fix: { kind: "link", href: settingsHref, label: "health.ai.director_off_with_cloud.fix" },
      text: "health.ai.director_off_with_cloud.title",
    };
  },
};

const learningOff: HealthRule = {
  id: "ai:learning_off",
  group: "design",
  release: "R1",
  async collect(scope, inputs) {
    const s = await aiSettingsOf(scope, inputs);
    if (!s || s.learning) return null;
    return {
      id: "ai:learning_off",
      group: "design",
      severity: 1,
      points: HINT_POINTS,
      evidence: { metric: "ai_learning_off", value: 1, window: "now", n: 1 },
      fix: { kind: "link", href: settingsHref, label: "health.ai.learning_off.fix" },
      text: "health.ai.learning_off.title",
    };
  },
};

export const rules: HealthRule[] = [creditsLow, directorOff, learningOff];

/** Inputs with the CCR's `aiSettings` line, typed as P1's merge base. */
const withAi = (aiSettings: AiHealthSettings | null, rest: Partial<HealthInputs> = {}): Partial<HealthInputs> => Object.assign({}, rest, { aiSettings });
const usage = (creditsUsed: number, creditsLimit: number | null) => ({ ai: { month: "2026-11", creditsUsed, creditsLimit, costMicros: 0 } });
/** the 10th of the month at noon in Casablanca (before day 20) and the 25th (after) */
const EARLY = new Date("2026-11-10T12:00:00Z");
const LATE = new Date("2026-11-25T12:00:00Z");

/** `test:health` fixtures of this file's rules (one per rule, `HealthRuleFixture`, P0b), filled by the track with its rules. */
export const fixtures: HealthRuleFixture[] = [
  { rule: "ai:credits_low", fires: { now: EARLY, ...usage(250, 300) }, silent: { now: LATE, ...usage(250, 300) }, expect: { severity: 1, metric: "ai_credits_left_pct" } },
  {
    rule: "ai:director_off_with_cloud",
    fires: withAi({ director: "off", learning: true, cloudOn: true }),
    silent: withAi({ director: "off", learning: true, cloudOn: false }),
    expect: { severity: 1, metric: "ai_director_off" },
  },
  { rule: "ai:learning_off", fires: withAi({ director: null, learning: false, cloudOn: true }), silent: withAi({ director: null, learning: true, cloudOn: true }), expect: { severity: 1, metric: "ai_learning_off" } },
];
