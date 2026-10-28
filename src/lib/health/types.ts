/**
 * Store Health types (docs/STORE-SAAS.md §I.7, SF-03, D53; platform.md PLA-§6.3). Isomorphic, maintainer-owned
 * (§K.3). One computation, two audiences: the tenant ring (issues, never console flags) and the console (both). The
 * score is advisory and monotonic: fixing an issue never lowers it, and it never gates anything (publish gates are §M).
 *
 * `HealthInputs` is frozen at P0 with the read APIs of PLA-§6.3.1 (P1's src/lib/health/inputs.ts `collectHealthInputs`
 * fills it through `systemScope`, one read pass per store): every track's rules read the same shape. A source that
 * fails leaves its field `null` and the rules that need it stay silent. `StoreHealthView` is the row both audiences
 * read through P1's `getStoreHealth(scope)` (src/lib/platform/health-snapshot.ts).
 */
import type { ConsolePageRow } from "@/lib/admin-data/pages";
import type { AiUsageSummary } from "@/lib/ai/summary.server";
import type { DesignHealth } from "@/lib/design/health.server";
import type { IntegrationHealthRow } from "@/lib/integrations/health";
import type { CityKey } from "@/lib/orders/address";
import type { OrderKpis } from "@/lib/orders/profile";
import type { StoreSettingValue } from "@/lib/settings/store-registry";
import type { UsageMetric } from "@/lib/tenancy/entitlement-keys";
import type { MessageKey, StoreRow, StoreScope } from "@/lib/tenancy/types";
import type { ModeFeature } from "@/lib/tenancy/mode";

export type HealthGroup = "setup" | "trust" | "design" | "conversion" | "operations" | "integrations" | "quota";

/** Σ = 100 */
export const HEALTH_CAPS: Record<HealthGroup, number> = { setup: 20, trust: 15, design: 15, conversion: 15, operations: 15, integrations: 15, quota: 5 };

export interface HealthEvidence {
  metric: string;
  value: number;
  baseline?: number;
  window: string;
  n: number; // always shown
}

export type HealthFix =
  | { kind: "link"; href: (handle: string) => string; label: MessageKey }
  | { kind: "action"; actionId: string /* a CommandDef.id, PD66 */; label: MessageKey };

export interface HealthIssue {
  id: string; // "<track>:<rule>"
  group: HealthGroup;
  severity: 1 | 2 | 3;
  points: 3 | 6 | 10;
  evidence: HealthEvidence;
  fix: HealthFix;
  text: MessageKey; // health.<track>.<rule>.* in the owning track's catalog (D67)
  snoozedUntil?: string;
}

/** PLA-§6.3.1: one read pass per store through systemScope(ctx, storeId) and the P0 read APIs (≤ 250 ms per store). */
export interface HealthInputs {
  store: StoreRow;
  now: Date;
  slaHours: number | null;
  /** listPagesForConsole (T4), renderSummary (P8); `name` and `seoTitle` feed platform:brand_term_live */
  pages: { published: number; drafts: number; lastPublishAt: Date | null; renderFailed: number; live: Pick<ConsolePageRow, "id" | "slug" | "updatedAt" | "name" | "seoTitle">[] } | null;
  /** the strings the live brand rule scans (the store row and the `store` / `policies` settings already loaded) */
  brand: { storeName: string; legalName: string | null; whatsappName: string | null; policyTexts: string[] } | null;
  /** abuse_reports counts for the store (ar_store_idx) */
  abuseReports: { new24h: number; total: number } | null;
  /** orderKpis, queueCounts, orderRiskMix (P4) */
  orders: (OrderKpis & { risky7d: number; firstTouchP50Ms: number | null; unattempted2h: number; unreachable7d: number; unreachable28d: number }) | null;
  /** integrationHealth (P5) */
  integrations: IntegrationHealthRow[] | null;
  /** sheetsBacklog (P5) */
  sheets: { pending: number; oldestMin: number | null; lastRunFailedAt: Date | null } | null;
  /** aiUsageForStore (P7): metadata only */
  ai: AiUsageSummary | null;
  /** designHealth(scope) (P6): q, slop, distances per live page, verdict bands only */
  design: DesignHealth | null;
  /** entitlements + store_usage (T1) */
  usage: readonly { metric: UsageMetric["metric"]; period: string; used: number; limit: number | null }[] | null;
  settings: { store: StoreSettingValue<"store">; policies: StoreSettingValue<"policies">; checkout: StoreSettingValue<"checkout">; conversions: StoreSettingValue<"conversions"> } | null;
  /** listMembersByScope (T2) */
  members: { total: number; withoutTotpWithOrdersReadAll: number; lastActiveAt: Date | null; lastLoginAt: Date | null } | null;
  review: { submittedAt: Date | null; status: string } | null;
  /** built on the server from zoneFeesFor (P3) over the top-5 CityKeys of opsAggregates(dims: city) (P4), never from a browser ZoneTable */
  zones: { count: number; pageShowsFlatFee: boolean; feeMismatchTop5: { cityKey: CityKey; pageFeeCents: number; zoneFeeCents: number }[] } | null;
}

export interface HealthRule {
  id: string;
  group: HealthGroup;
  minN?: number; // silent below this sample size
  release: "R1" | "R2" | "R3";
  mode?: ModeFeature;
  /** ≤ 40 ms, read-only, scoped; never reads another store */
  collect(scope: StoreScope, inputs: HealthInputs): Promise<HealthIssue | null>;
}

/** The rules files of src/lib/health/rules (one per track, P0b: CCR P5-8, P6-13). */
export type HealthRuleFile = "platform" | "shell" | "landing" | "ops" | "integrations" | "design" | "ai";

/**
 * PD79: a rule id is `<prefix>:<rule>`, and its prefix is one of its own file's (P1's `test:health` checks every
 * registered rule against this table). P4 writes `ops:` and `fin:`, P5 `int:` and `conv:` (OPE-§27.2, PLA-§6.3.2).
 */
export const HEALTH_RULE_PREFIXES: Readonly<Record<HealthRuleFile, readonly string[]>> = {
  platform: ["platform"],
  shell: ["shell"],
  landing: ["landing"],
  ops: ["ops", "fin"],
  integrations: ["int", "conv"],
  design: ["design"],
  ai: ["ai"],
};

/**
 * One rule's `test:health` fixture (P0b: CCR P5-8, P6-13), exported by its rules file as `fixtures`. `fires` and
 * `silent` are merged over P1's empty base inputs: with `fires` the rule answers an issue (with `expect`'s severity
 * and evidence metric when given), with `silent` it answers null (below its `minN`, or without the data it needs).
 */
export interface HealthRuleFixture {
  rule: string;
  fires: Partial<HealthInputs>;
  silent: Partial<HealthInputs>;
  expect?: { severity?: 1 | 2 | 3; metric?: string };
}

/** The console-only flags (PLA-§6.3); a flag that mirrors a track's issue adds no points of its own (rev 4, PD79). */
export type HealthFlagCode =
  | "sheets_backlog"
  | "sheets_error"
  | "outbox_dead"
  | "capi_failing"
  | "telegram_failing"
  | "quota_high"
  | "quota_full"
  | "risky_orders"
  | "inactive_14d"
  | "dormant_60d"
  | "setup_incomplete"
  | "render_failed"
  | "review_waiting"
  | "restricted"
  | "suspended"
  // rev 3 (PD70, SEC-18): the live brand guard and the R1 abuse-report slice, staff-only, 0 points
  | "brand_term_live"
  | "brand_near_live"
  | "abuse_reports_new";

export interface HealthFlag {
  code: HealthFlagCode;
  severity: 1 | 2 | 3;
  since: string; // ISO
  value?: number;
  detail?: string; // key, metric or kind
}

/** store_health.metrics (PLA-§6.3; frozen with the 0005 column at P0) */
export interface HealthMetrics {
  orders7d: number;
  risky7d: number;
  lastActiveAt: string | null;
  lastOrderAt: string | null;
  publishedPages: number;
  mediaPct: number | null;
}

/** store_health.milestones keys: the ISO date each was first reached (PD40) */
export type Milestone = "first_draft" | "first_publish" | "first_order" | "tenth_order" | "first_member" | "first_delivered";

/** The `store_health` row as both audiences read it (PLA-§2.2): the tenant without `flags`, the console with them. */
export interface StoreHealthView {
  score: number;
  attention: 0 | 1 | 2 | 3;
  components: Record<HealthGroup, number>;
  issues: HealthIssue[];
  snoozed: Record<string, string>;
  metrics: HealthMetrics;
  milestones: Partial<Record<Milestone, string>>;
  dormant: boolean;
  computedAt: string;
  dirty: boolean;
  /** platform scopes only */
  flags?: HealthFlag[];
  /** rev 4 (PD78, PLA Q4.4): max(platform.health.staleAlarmMinutes, 1.5 × the job's measured cycleMin) */
  staleAfterMin: number;
}
