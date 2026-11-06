import "server-only";
/**
 * The facts of Settings → Plan & usage (P2 SHELL; platform.md PLA-§22.10.4, PL-11; docs/STORE-SAAS.md §A.4, §D.7), all
 * of the scope's own store (no price anywhere: the plans carry none in R1):
 *
 * - the plan's name, and the active, non-hidden plans a change may be asked for;
 * - the usage meters: media, pages, members, agents, exports this month (`store_usage` through T1's `usageValue`) and
 *   the AI credits of the month (P7's `aiUsageForStore`; its stub answers nothing used);
 * - every R1 feature with the reason it is off (T1's `assertFeature`: plan, state, release or kill);
 * - the active boosts (`store_entitlements` rows of source `boost` that have not expired);
 * - the subscription history (`store_subscriptions`, newest first).
 */
import { activeBoosts, planCatalogue, subscriptionHistory } from "@/lib/admin-data/dashboard";
import { aiUsageForStore } from "@/lib/ai/summary.server";
import { logError } from "@/lib/orders/log";
import { assertFeature, EntitlementError, entitlements, usageValue } from "@/lib/tenancy/entitlements";
import { ENTITLEMENTS, isEntitlementKey, usageMetric, type FeatureKey, type UsageMetricName } from "@/lib/tenancy/entitlement-keys";
import type { StoreScope } from "@/lib/tenancy/types";

export type MeterUnit = "bytes" | "count" | "credits";
export interface PlanMeter {
  id: "media" | "pages" | "members" | "agents" | "exports" | "ai";
  metric: UsageMetricName;
  used: number;
  limit: number | null;
  unit: MeterUnit;
}
export interface PlanFeature {
  key: FeatureKey;
  on: boolean;
  reason: "plan" | "state" | "release" | "kill" | null;
}
export interface PlanFacts {
  plan: { id: string; name: string } | null;
  plans: { id: string; name: string }[];
  meters: PlanMeter[];
  versionsKept: number | null;
  features: PlanFeature[];
  boosts: {
    key: string;
    value: number | boolean | null;
    expiresAt: string | null;
  }[];
  history: {
    id: string;
    planName: string;
    status: "active" | "scheduled" | "ended";
    periodStart: string;
    periodEnd: string | null;
  }[];
}

const METERS: readonly {
  id: PlanMeter["id"];
  metric: UsageMetricName;
  unit: MeterUnit;
}[] = [
  { id: "media", metric: "media_bytes", unit: "bytes" },
  { id: "pages", metric: "pages", unit: "count" },
  { id: "members", metric: "members", unit: "count" },
  { id: "agents", metric: "agents", unit: "count" },
  { id: "exports", metric: "exports", unit: "count" },
];

/** The R1 features a seller can read about (a later release's feature shows with its release reason). */
const FEATURES: readonly FeatureKey[] = [
  "publish",
  "take_orders",
  "sheets",
  "pixels_capi",
  "php_export",
  "telegram",
  "cloud_ai",
  "invites",
  "remove_platform_badge",
  "webhooks",
  "accounting",
  "custom_domain",
];

const LIMIT_KEY = {
  media_bytes: "media_bytes",
  pages: "pages_max",
  members: "members_max",
  agents: "agents_max",
  exports: "exports_month",
} as const;

export async function planFacts(scope: StoreScope, store: { planId: string; timezone: string }): Promise<PlanFacts> {
  const now = new Date();
  const month = usageMetric("ai_credits", now, store.timezone).period;
  const [values, planRows, used, ai, features, boosts, history] = await Promise.all([
    entitlements(scope),
    // the plan catalogue is platform-wide (no store_id): names only, never a price
    planCatalogue(),
    Promise.all(METERS.map((m) => usageValue(scope, usageMetric(m.metric, now, store.timezone)))),
    aiUsageForStore(scope, month).catch((err: unknown) => {
      logError("settings:plan-ai", err);
      return null;
    }),
    Promise.all(
      FEATURES.map(async (key): Promise<PlanFeature> => {
        try {
          await assertFeature(scope, key);
          return { key, on: true, reason: null };
        } catch (err) {
          if (err instanceof EntitlementError) return { key, on: false, reason: err.reason };
          throw err;
        }
      }),
    ),
    activeBoosts(scope, now),
    subscriptionHistory(scope),
  ]);
  const names = new Map(planRows.map((p) => [p.id, p.name]));
  const meters: PlanMeter[] = METERS.map((m, i) => ({
    ...m,
    used: used[i] ?? 0,
    limit: (values[LIMIT_KEY[m.metric as keyof typeof LIMIT_KEY]] as number | null) ?? null,
  }));
  if (ai)
    meters.push({
      id: "ai",
      metric: "ai_credits",
      used: ai.creditsUsed,
      limit: ai.creditsLimit,
      unit: "credits",
    });
  return {
    plan: names.has(store.planId) ? { id: store.planId, name: names.get(store.planId) ?? store.planId } : null,
    plans: planRows.filter((p) => p.status === "active").map((p) => ({ id: p.id, name: p.name })),
    meters,
    versionsKept: (values.versions_kept_per_page as number | null) ?? null,
    features,
    boosts: boosts
      .filter((b) => isEntitlementKey(b.key))
      .map((b) => ({
        key: b.key,
        value: b.value,
        expiresAt: b.expiresAt?.toISOString() ?? null,
      })),
    history: history.map((h) => ({
      id: h.id,
      planName: names.get(h.planId) ?? h.planId,
      status: h.status,
      periodStart: h.periodStart.toISOString(),
      periodEnd: h.periodEnd?.toISOString() ?? null,
    })),
  };
}

/** A boost's key as the plan page names it (a limit or a feature of the registry). */
export const isLimitKey = (key: string): boolean => isEntitlementKey(key) && ENTITLEMENTS[key].kind === "limit";
