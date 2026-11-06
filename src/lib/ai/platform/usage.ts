import "server-only";
/**
 * The platform's AI spend (P7 AI; ai.md AI-§C.1, AI-§C.3, AI-§O; docs/STORE-SAAS.md §A.4, §D.7, D64, D69): the month
 * counters `ai_cost_micros` and `ai_cost_micros_pending` (`platform_usage`, UTC month) against the cap
 * `platform_ai.caps.monthlyUsd` and the pending stores' slice. The policy reads it for `quota_platform` /
 * `quota_platform_pending`, the console and `aiHealth()` for the spend tile. Counters only: no store row is read
 * here (the cross-store `ai_usage_daily` reads of the console arrive with its tab, each annotated and pinned).
 */
import { getPlatformSetting } from "@/lib/settings";
import { platformPeriodOf, platformUsageValue } from "@/lib/tenancy/entitlements";
import { pendingShareMicros, platformCapMicros } from "../quota/cost";

export interface PlatformSpend {
  /** "YYYY-MM" (UTC) */
  month: string;
  monthMicros: number;
  /** null = no cap (cloud off, `no_cap`) */
  capMicros: number | null;
  pendingMicros: number;
  pendingCapMicros: number | null;
  /** 0-100, rounded down; null without a cap */
  usedPct: number | null;
  pendingUsedPct: number | null;
}

const pct = (used: number, cap: number | null): number | null => (cap === null || cap <= 0 ? null : Math.floor((used * 100) / cap));

export async function platformSpend(now = new Date()): Promise<PlatformSpend> {
  const month = platformPeriodOf("month", now);
  const [ai, monthMicros, pendingMicros] = await Promise.all([
    getPlatformSetting("platform_ai"),
    platformUsageValue("ai_cost_micros", month),
    platformUsageValue("ai_cost_micros_pending", month),
  ]);
  const capMicros = platformCapMicros(ai.caps.monthlyUsd);
  const pendingCapMicros = pendingShareMicros(ai.caps.monthlyUsd, ai.caps.pendingSharePct);
  return { month, monthMicros, capMicros, pendingMicros, pendingCapMicros, usedPct: pct(monthMicros, capMicros), pendingUsedPct: pct(pendingMicros, pendingCapMicros) };
}
