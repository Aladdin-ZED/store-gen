/**
 * Entitlement and usage-metric registry (docs/STORE-SAAS.md §A.4, §D.7). Pure and isomorphic: the server
 * resolves values in src/lib/tenancy/entitlements.ts (override > boost > plan > default, then the lifecycle
 * state cap and the kill switches); the dashboard imports the keys to label meters and limit sheets.
 *
 * The defaults are the `beta` plan (every new store). Values are starting points, not researched; plans and
 * per-store overrides change them without a deploy. Orders are never refused for a quota.
 */
import type { Release } from "@/lib/auth/permissions";

export const KiB = 1024;
export const MiB = 1024 * KiB;
export const GiB = 1024 * MiB;

export type EntitlementDef =
  | { kind: "limit"; unit?: "bytes"; default: number | null /* null = unlimited */; release?: Release }
  | { kind: "feature"; default: boolean; release?: Release };

export const ENTITLEMENTS = {
  // limits (number | null = unlimited)
  media_bytes: { kind: "limit", unit: "bytes", default: 1 * GiB },
  pages_max: { kind: "limit", default: 50 },
  products_max: { kind: "limit", default: 200, release: "R2" },
  members_max: { kind: "limit", default: 10 },
  agents_max: { kind: "limit", default: 10 },
  versions_kept_per_page: { kind: "limit", default: 30 },
  exports_month: { kind: "limit", default: 50 },
  ai_credits_month: { kind: "limit", default: 300 }, // 1 credit = $0.01 of provider cost (AI-01)
  webhooks_max: { kind: "limit", default: 5, release: "R2" },
  custom_domains_max: { kind: "limit", default: 0, release: "R3" },
  orders_month_soft: { kind: "limit", default: null }, // banner + console flag only, never a refusal
  campaigns_max: { kind: "limit", default: 20 }, // live or paused Campaign Kits per store (SF-01)
  short_links_max: { kind: "limit", default: 200 }, // LP-12
  // features (boolean)
  publish: { kind: "feature", default: true },
  take_orders: { kind: "feature", default: true },
  mode_landing: { kind: "feature", default: true },
  mode_store: { kind: "feature", default: true },
  mode_both: { kind: "feature", default: true },
  sheets: { kind: "feature", default: true },
  pixels_capi: { kind: "feature", default: true },
  php_export: { kind: "feature", default: true },
  telegram: { kind: "feature", default: true },
  cloud_ai: { kind: "feature", default: true },
  invites: { kind: "feature", default: true },
  webhooks: { kind: "feature", default: true, release: "R2" },
  accounting: { kind: "feature", default: true, release: "R2" },
  commissions: { kind: "feature", default: true, release: "R2" },
  api_keys: { kind: "feature", default: false, release: "R3" },
  custom_domain: { kind: "feature", default: false, release: "R3" },
  experiments: { kind: "feature", default: false, release: "R3" },
  coupons: { kind: "feature", default: true, release: "R3" }, // STO-R21
  reviews: { kind: "feature", default: true, release: "R3" }, // STO-R21
  remove_platform_badge: { kind: "feature", default: false },
} as const satisfies Record<string, EntitlementDef>;

export type EntitlementKey = keyof typeof ENTITLEMENTS;
export type LimitKey = { [K in EntitlementKey]: (typeof ENTITLEMENTS)[K]["kind"] extends "limit" ? K : never }[EntitlementKey];
export type FeatureKey = { [K in EntitlementKey]: (typeof ENTITLEMENTS)[K]["kind"] extends "feature" ? K : never }[EntitlementKey];
export type EntitlementValue<K extends EntitlementKey> = (typeof ENTITLEMENTS)[K]["kind"] extends "limit" ? number | null : boolean;
/** Every key resolved for one store (`entitlements(scope)`, one query, cached 30 s). */
export type ResolvedEntitlements = { [K in EntitlementKey]: EntitlementValue<K> };

export const ENTITLEMENT_KEYS = Object.keys(ENTITLEMENTS) as EntitlementKey[];

export function isEntitlementKey(value: unknown): value is EntitlementKey {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(ENTITLEMENTS, value);
}

export function isFeatureKey(value: unknown): value is FeatureKey {
  return isEntitlementKey(value) && ENTITLEMENTS[value].kind === "feature";
}

export function isLimitKey(value: unknown): value is LimitKey {
  return isEntitlementKey(value) && ENTITLEMENTS[value].kind === "limit";
}

/** The registry default of a key (`beta` plan, before the plan, boosts, overrides and the state cap). */
export function entitlementDefault<K extends EntitlementKey>(key: K): EntitlementValue<K> {
  return ENTITLEMENTS[key].default as EntitlementValue<K>;
}

/* ------------------------------------------------------------------ */
/* Usage metrics (`store_usage` rows, §D.7)                            */
/* ------------------------------------------------------------------ */

/**
 * `period`: `total` for gauges, `month` = "YYYY-MM" and `day` = "YYYY-MM-DD", both in the store's time zone.
 * `limit`: the entitlement the counter is charged against; `null` when the limit is computed by its owner and
 * passed through `opts.limit` (the Director share and the daily AI cap, ai part). `soft`: never refused.
 */
export interface UsageMetricDef {
  period: "total" | "month" | "day";
  limit: LimitKey | null;
  soft?: true;
}

export const USAGE_METRICS = {
  // gauges (period "total"), recomputed nightly by usage.reconcile
  media_bytes: { period: "total", limit: "media_bytes" },
  pages: { period: "total", limit: "pages_max" },
  products: { period: "total", limit: "products_max" }, // status draft or active (STO-R20)
  members: { period: "total", limit: "members_max" },
  agents: { period: "total", limit: "agents_max" }, // members whose role is agent (rev 3, OPS-23)
  webhooks: { period: "total", limit: "webhooks_max" },
  custom_domains: { period: "total", limit: "custom_domains_max" },
  campaigns: { period: "total", limit: "campaigns_max" }, // status live or paused
  short_links: { period: "total", limit: "short_links_max" },
  // monthly counters ("YYYY-MM", store time zone)
  exports: { period: "month", limit: "exports_month" },
  ai_credits: { period: "month", limit: "ai_credits_month" },
  orders: { period: "month", limit: "orders_month_soft", soft: true },
  /** rev 3 (AI R28): the Director's share, limit ai_credits_month × platform_ai.caps.directorSharePct / 100 (default 60 %) */
  ai_credits_director: { period: "month", limit: null },
  /** rev 3 (AI R3, R30): daily AI counter, limit max(floor, ceil(ai_credits_month × storeDailyCapPct / 100)), floor 50 / 10 while pending */
  ai_credits_day: { period: "day", limit: null },
} as const satisfies Record<string, UsageMetricDef>;

export type UsageMetricName = keyof typeof USAGE_METRICS;
/** One `store_usage` row key (§D.7). Build it with `usageMetric()` so the period always matches the metric. */
export interface UsageMetric {
  metric: UsageMetricName;
  period: string;
}

/** Platform counters (`platform_usage`, same statements) charged through chargePlatformUsage / refundPlatformUsage. */
export const PLATFORM_USAGE_METRICS = [
  "ai_cost_micros",
  "ai_batch_items",
  "mail_sent",
  "push_sent",
  "ai_cost_micros_pending", // rev 3, SEC-1 / AI R28: the pending stores' slice of the monthly AI cap, period YYYY-MM
  "pending_stores", // rev 3, D69: sandboxes created per platform day, period YYYY-MM-DD
  "pending_media_bytes", // rev 3, D69: one disk budget shared by every pending store, period "total"
] as const;
export type PlatformUsageMetric = (typeof PLATFORM_USAGE_METRICS)[number];

/** "YYYY-MM" / "YYYY-MM-DD" of `at` in `timeZone` (an IANA zone; the store's for store counters). */
export function periodOf(kind: "month" | "day", at: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(at);
  const get = (type: "year" | "month" | "day") => parts.find((p) => p.type === type)?.value ?? "";
  return kind === "month" ? `${get("year")}-${get("month")}` : `${get("year")}-${get("month")}-${get("day")}`;
}

/** The usage row key of `metric` at `at` in the store's time zone (gauges: period "total"). */
export function usageMetric(metric: UsageMetricName, at: Date, timeZone: string): UsageMetric {
  const { period } = USAGE_METRICS[metric];
  return { metric, period: period === "total" ? "total" : periodOf(period, at, timeZone) };
}
