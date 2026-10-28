/**
 * Store Health rules of the platform track (P1 CONSOLE, platform.md PLA-§6.3.2; core §I.7, D53, PD79).
 * Extension file (docs/STORE-SAAS.md §I.7, §K.3), created empty at P0 and imported by src/lib/health/registry.ts;
 * the sentences are `health.platform.*` in P1's src/lib/i18n/admin/<locale>/notify.ts (D67), the evidence their
 * variables.
 *
 * One condition, one issue (PD79): P1 emits only these four tenant issues; the console flags that mirror another
 * track's issue are derived from it in src/lib/health/platform-flags.ts.
 *
 * | Rule                      | Group      | Sev | Condition                                                          | Fix                          |
 * |---------------------------|------------|-----|--------------------------------------------------------------------|------------------------------|
 * | `platform:render_failed`  | setup      | 2   | ≥ 1 failed render job of the store (`inputs.pages.renderFailed`)   | action `pages.republish_failed` |
 * | `platform:quota_high`     | quota      | 1   | a gauge or monthly counter at 80-99 % of its plan limit            | link `settings/plan`         |
 * | `platform:quota_full`     | quota      | 2   | a gauge or monthly counter at ≥ 100 % of its plan limit            | link `settings/plan`         |
 * | `platform:risky_orders`   | operations | 2   | ≥ 20 orders in 7 days and ≥ 30 % of them at risk ≥ 70              | action `ops.open_queue`      |
 *
 * The quota sentence names the metric ("Media storage is at 85 % of your plan"), so its key is per metric:
 * `health.platform.quota.<metric>.text`; the evidence metric differs per rule (`<metric>_pct` / `<metric>_full`) so the
 * registry scan sees two conditions. Below 20 orders the risky rule stays silent (`minN`).
 *
 * Staff only (never a tenant issue, 0 points; PLA-§6.3.3, PD70): `brandScan(inputs, terms)` finds a protected name
 * on the store's live surfaces: `live` (the console flag `brand_term_live`) for a whole-token match of any active term,
 * or a `substring` term of 6+ characters inside a word; `near` (`brand_near_live`) for a shorter substring term. It
 * reads the store name, legal name and WhatsApp display name, every live page's name and SEO title, and the policy
 * texts in 200-character windows (overlapping by 60, so no term of the 60-character maximum straddles two).
 */
import { brandTokens, foldTerm, matchBrandTerm } from "@/lib/platform/normalize";
import type { BrandField, ProtectedTerm } from "@/lib/platform/brand-match";
import { USAGE_METRICS, type UsageMetricName } from "@/lib/tenancy/entitlement-keys";
import { appHref } from "@/lib/urls";
import { fixtureOrders, fixturePages } from "../fixtures";
import type { HealthInputs, HealthIssue, HealthRule, HealthRuleFixture } from "../types";

/** `minN` of `platform:risky_orders`: orders in the 7-day window */
export const RISKY_MIN_N = 20;
/** the share of risky orders (risk ≥ 70) that raises the issue */
export const RISKY_SHARE = 0.3;
/** a quota row at or above these percentages */
export const QUOTA_HIGH_PCT = 80;
export const QUOTA_FULL_PCT = 100;
/** a `substring` term this long matches inside a word on live surfaces (PLA-§6.3.3) */
export const LIVE_SUBSTRING_MIN = 6;
/** the policy text window of the brand scan (PLA-§L: one check reads ≤ 200 characters) */
export const BRAND_WINDOW = 200;
const BRAND_WINDOW_STEP = 140;

/** The usage metrics a plan limits (the quota rules' scope, and their sentence keys). */
export const QUOTA_METRICS = (Object.keys(USAGE_METRICS) as UsageMetricName[]).filter((m) => USAGE_METRICS[m].limit !== null);

const MiB = 1024 * 1024;

/* ------------------------------------------------------------------ */
/* Tenant rules                                                        */
/* ------------------------------------------------------------------ */

const planFix = { kind: "link" as const, href: (handle: string) => appHref(handle, "/settings/plan"), label: "health.platform.quota.fix" };

/** One quota row's share of its limit (whole percent), or null when the plan sets no limit. */
export function quotaPct(row: { used: number; limit: number | null }): number | null {
  if (row.limit === null || !(row.limit > 0) || !Number.isFinite(row.used)) return null;
  return Math.floor((Math.max(0, row.used) * 100) / row.limit);
}

/** The worst quota row inside [min, max) percent: the highest share, then the registry's metric order. */
export function worstQuota(inputs: HealthInputs, min: number, max = Number.POSITIVE_INFINITY): { metric: UsageMetricName; period: string; used: number; pct: number } | null {
  let best: { metric: UsageMetricName; period: string; used: number; pct: number } | null = null;
  for (const metric of QUOTA_METRICS) {
    const row = inputs.usage?.find((u) => u.metric === metric);
    const pct = row ? quotaPct(row) : null;
    if (!row || pct === null || pct < min || pct >= max) continue;
    if (!best || pct > best.pct) best = { metric, period: row.period, used: row.used, pct };
  }
  return best;
}

function quotaIssue(id: "platform:quota_high" | "platform:quota_full", inputs: HealthInputs): HealthIssue | null {
  const full = id === "platform:quota_full";
  const row = full ? worstQuota(inputs, QUOTA_FULL_PCT) : worstQuota(inputs, QUOTA_HIGH_PCT, QUOTA_FULL_PCT);
  if (!row) return null;
  const severity = full ? 2 : 1;
  return {
    id,
    group: "quota",
    severity,
    points: severity === 2 ? 6 : 3,
    evidence: {
      metric: `${row.metric}_${full ? "full" : "pct"}`,
      value: row.pct,
      baseline: full ? QUOTA_FULL_PCT : QUOTA_HIGH_PCT,
      window: row.period === "total" ? "total" : "month",
      // the amount used, in MiB for storage (a count elsewhere)
      n: row.metric === "media_bytes" ? Math.round(row.used / MiB) : Math.round(row.used),
    },
    fix: planFix,
    text: `health.platform.quota.${row.metric}.text`,
  };
}

export const rules: HealthRule[] = [
  {
    id: "platform:render_failed",
    group: "setup",
    release: "R1",
    async collect(_scope, inputs) {
      const failed = inputs.pages?.renderFailed ?? 0;
      if (!inputs.pages || failed < 1) return null;
      return {
        id: "platform:render_failed",
        group: "setup",
        severity: 2,
        points: 6,
        evidence: { metric: "render_failed", value: failed, window: "24h", n: failed },
        fix: { kind: "action", actionId: "pages.republish_failed", label: "health.platform.render_failed.fix" },
        text: "health.platform.render_failed.text",
      };
    },
  },
  {
    id: "platform:quota_high",
    group: "quota",
    release: "R1",
    async collect(_scope, inputs) {
      return quotaIssue("platform:quota_high", inputs);
    },
  },
  {
    id: "platform:quota_full",
    group: "quota",
    release: "R1",
    async collect(_scope, inputs) {
      return quotaIssue("platform:quota_full", inputs);
    },
  },
  {
    id: "platform:risky_orders",
    group: "operations",
    minN: RISKY_MIN_N,
    release: "R1",
    async collect(_scope, inputs) {
      const orders = inputs.orders;
      if (!orders || orders.placed < RISKY_MIN_N) return null;
      const risky = Math.min(orders.risky7d, orders.placed);
      if (risky / orders.placed < RISKY_SHARE) return null;
      return {
        id: "platform:risky_orders",
        group: "operations",
        severity: 2,
        points: 6,
        evidence: { metric: "risky_orders_7d", value: risky, window: "7d", n: orders.placed },
        fix: { kind: "action", actionId: "ops.open_queue", label: "health.platform.risky_orders.fix" },
        text: "health.platform.risky_orders.text",
      };
    },
  },
];

/* ------------------------------------------------------------------ */
/* Staff only: the live brand scan                                     */
/* ------------------------------------------------------------------ */

export interface BrandHit {
  /** the protected term (a platform list entry, never customer data) */
  term: string;
  field: BrandField;
  pageId?: string;
}

/** The overlapping windows a long text is scanned in. */
export function textWindows(text: string, size = BRAND_WINDOW, step = BRAND_WINDOW_STEP): string[] {
  if (text.length <= size) return text.trim() ? [text] : [];
  const out: string[] = [];
  for (let at = 0; at < text.length; at += step) {
    out.push(text.slice(at, at + size));
    if (at + size >= text.length) break;
  }
  return out;
}

/** Every value the scan reads, in the order it reports them (the store's own fields first). */
export function brandSurfaces(inputs: HealthInputs): { field: BrandField; value: string; pageId?: string }[] {
  const out: { field: BrandField; value: string; pageId?: string }[] = [];
  const brand = inputs.brand;
  const storeName = brand?.storeName ?? inputs.store.name;
  if (storeName) out.push({ field: "store_name", value: storeName });
  if (brand?.legalName) out.push({ field: "legal_name", value: brand.legalName });
  if (brand?.whatsappName) out.push({ field: "whatsapp_name", value: brand.whatsappName });
  for (const page of inputs.pages?.live ?? []) {
    if (page.name) out.push({ field: "page_name", value: page.name, pageId: page.id });
    if (page.seoTitle) out.push({ field: "seo_title", value: page.seoTitle, pageId: page.id });
  }
  for (const text of brand?.policyTexts ?? []) for (const w of textWindows(text)) out.push({ field: "policy_text", value: w });
  return out;
}

/** The live and the near match of the active terms on the store's live surfaces (offensive terms are not brands). */
export function brandScan(inputs: HealthInputs, terms: readonly ProtectedTerm[]): { live: BrandHit | null; near: BrandHit | null } {
  const brandTerms = terms.filter((t) => t.kind !== "offensive");
  let near: BrandHit | null = null;
  if (!brandTerms.length) return { live: null, near };
  for (const s of brandSurfaces(inputs)) {
    const readings = brandTokens(s.value.slice(0, BRAND_WINDOW));
    if (!readings.length) continue;
    for (const t of brandTerms) {
      const m = matchBrandTerm(readings, t);
      if (!m) continue;
      const hit: BrandHit = { term: t.term, field: s.field, ...(s.pageId ? { pageId: s.pageId } : {}) };
      if (m === "exact" || foldTerm(t.term).joined.length >= LIVE_SUBSTRING_MIN) return { live: hit, near: null };
      near ??= hit;
    }
  }
  return { live: null, near };
}

/** PLA-§6.3.3 `platform:brand_term_live`: the protected term on a live surface, or null. Staff only, 0 points. */
export function brandTermLive(inputs: HealthInputs, terms: readonly ProtectedTerm[]): BrandHit | null {
  return brandScan(inputs, terms).live;
}

/* ------------------------------------------------------------------ */
/* test:health fixtures (one per rule, with and without its minN)      */
/* ------------------------------------------------------------------ */

const usage = (metric: UsageMetricName, used: number, limit: number | null, period = USAGE_METRICS[metric].period === "total" ? "total" : "2026-10") => ({ metric, period, used, limit });

export const fixtures: HealthRuleFixture[] = [
  { rule: "platform:render_failed", fires: { pages: fixturePages(2, { renderFailed: 1 }) }, silent: { pages: fixturePages(2) }, expect: { severity: 2, metric: "render_failed" } },
  {
    rule: "platform:quota_high",
    fires: { usage: [usage("media_bytes", 85 * MiB, 100 * MiB), usage("pages", 3, 10)] },
    silent: { usage: [usage("media_bytes", 79 * MiB, 100 * MiB), usage("pages", 10, 10), usage("orders", 900, null)] },
    expect: { severity: 1, metric: "media_bytes_pct" },
  },
  {
    rule: "platform:quota_full",
    fires: { usage: [usage("pages", 10, 10)] },
    silent: { usage: [usage("pages", 9, 10), usage("exports", 50, null)] },
    expect: { severity: 2, metric: "pages_full" },
  },
  {
    rule: "platform:risky_orders",
    fires: { orders: fixtureOrders(RISKY_MIN_N, { risky7d: 6 }) },
    // below minN: 19 orders, every one risky
    silent: { orders: fixtureOrders(RISKY_MIN_N - 1, { risky7d: RISKY_MIN_N - 1 }) },
    expect: { severity: 2, metric: "risky_orders_7d" },
  },
];
