import "server-only";
/**
 * One store's `HealthInputs` (docs/STORE-SAAS.md §I.7; platform.md PLA-§6.3.1, PLA-§Q.11): one read pass through the
 * store's scope (the job's `systemScope`) and the P0 read APIs, every source in parallel and on its own.
 *
 *   const inputs = await collectHealthInputs(scope, store, now);   // ≤ 250 ms a store (PD78 measures it)
 *
 * A source that throws, or answers after `SOURCE_TIMEOUT_MS`, leaves its field null and the rules that need it stay
 * silent: the engine never fails on a missing source, and a track's stub that still throws `not implemented` (P3, P4,
 * P5, P8 before their merges) is expected and not logged. Other failures are recorded (area "health", store id only).
 *
 * | Field          | Source                                                                                         |
 * |----------------|-------------------------------------------------------------------------------------------------|
 * | pages          | T4 `listPagesForConsole` (live pages' name and SEO title), P8 `renderSummary` (failed renders)  |
 * | brand          | the store row and the `store` / `policies` settings (legal name, the policy texts)             |
 * | abuseReports   | `abuse_reports` of the store (`ar_store_idx`)                                                   |
 * | orders         | P4 `orderKpis` (7 and 28 days), `queueCounts`; risk ≥ 70 counted over the store's 7-day orders |
 * | integrations · sheets | P5 `integrationHealth`, `sheetsBacklog`                                                  |
 * | ai · design    | P7 `aiUsageForStore` (this month), P6 `designHealth`                                            |
 * | usage          | T1 `entitlements` and the store's `store_usage` rows (gauges, this month's counters)            |
 * | settings       | `store`, `policies`, `checkout`, `conversions`                                                   |
 * | members        | T2 `listMembersByScope`                                                                          |
 * | review         | the latest `signup` / `reopen` row of `signup_reviews`                                          |
 * | zones          | P3 `zoneFeesFor` over the top-5 `CityKey`s of P4's `opsAggregates(dims: city)`, against every   |
 * |                | live page's flat fee (D68, D75; no R1 page charges by city: "Charge delivery by city" is R2)    |
 * | slaHours       | `platform.signup.slaHours`                                                                       |
 *
 * Mappings the frozen shapes leave to P1: `orders.firstTouchP50Ms` is P4's 7-day `firstTouchP50Min` in ms,
 * `unattempted2h` its `queueCounts().firstTouchBreaches`, `unreachable7d` / `unreachable28d` the unreachable rate in
 * percent (0 below P4's sample size); `members.lastLoginAt` is the latest member activity (T2 keeps no per-member login
 * time); `brand.whatsappName` is null (no R1 setting holds a WhatsApp display name).
 */
import { and, count, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { listPagesForConsole } from "@/lib/admin-data/pages";
import { aiUsageForStore } from "@/lib/ai/summary.server";
import { can } from "@/lib/auth/permissions";
import { opsAggregates } from "@/lib/callcenter/aggregates";
import { db } from "@/lib/db/client";
import { abuseReports, orders, pages, pageVersions, signupReviews, storeUsage } from "@/lib/db/schema";
import { zoneFeesFor, zonesForCheckout } from "@/lib/delivery/zones.server";
import { designHealth } from "@/lib/design/health.server";
import { integrationHealth, sheetsBacklog } from "@/lib/integrations/health";
import { renderSummary } from "@/lib/jobs/renders";
import { cityKey, type CityKey } from "@/lib/orders/address";
import type { Kpi } from "@/lib/orders/profile";
import { orderKpis, queueCounts } from "@/lib/orders/profile";
import { recordPlatformError } from "@/lib/platform/log";
import { getPlatformSetting, getStoreSettings } from "@/lib/settings";
import { periodOf, USAGE_METRICS, type UsageMetricName } from "@/lib/tenancy/entitlement-keys";
import { entitlements } from "@/lib/tenancy/entitlements";
import { listMembersByScope } from "@/lib/tenancy/invites";
import { inStore, whereStore } from "@/lib/tenancy/sql";
import type { StoreRow, StoreScope } from "@/lib/tenancy/types";
import type { HealthInputs } from "./types";

/** A source that has not answered by then is left null (PD78: the inputs target 250 ms a store; this only bounds a hang). */
export const SOURCE_TIMEOUT_MS = 1_000;
/** the live pages the brand scan and the fee check read */
const LIVE_PAGES_MAX = 50;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export type HealthSourceKey = Exclude<keyof HealthInputs, "store" | "now">;
export type HealthSource<K extends HealthSourceKey> = (scope: StoreScope, store: StoreRow, now: Date) => Promise<HealthInputs[K]>;
export type HealthSources = { [K in HealthSourceKey]: HealthSource<K> };

const rate = (k: Kpi): number => ("value" in k ? Math.round(k.value * 1000) / 10 : 0);
const toDate = (iso: string | null | undefined): Date | null => {
  const t = iso ? Date.parse(iso) : Number.NaN;
  return Number.isFinite(t) ? new Date(t) : null;
};

/** The store's own 7-day orders at risk ≥ 70 (test orders excluded; `orders_store_test_idx`). */
async function riskyOrders7d(scope: StoreScope, now: Date): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(orders)
    .where(whereStore(orders, scope, eq(orders.isTest, false), gte(orders.createdAt, new Date(now.getTime() - 7 * DAY)), gte(orders.riskScore, 70)));
  return Number(row?.n ?? 0);
}

/** Every live landing page's flat delivery fee in cents (the published document's `offers.shippingFee`), newest first. */
async function liveFlatFees(scope: StoreScope): Promise<{ pageId: string; feeCents: number }[]> {
  const rows = await db
    .select({ id: pages.id, fee: sql<string | null>`CASE WHEN JSON_VALID(${pageVersions.doc}) THEN JSON_EXTRACT(${pageVersions.doc}, '$.offers.shippingFee') END` })
    .from(pages)
    .innerJoin(pageVersions, and(eq(pageVersions.id, pages.publishedVersionId), inStore(pageVersions, scope)))
    .where(whereStore(pages, scope, eq(pages.status, "published")))
    .orderBy(desc(pages.updatedAt))
    .limit(LIVE_PAGES_MAX);
  return rows.flatMap((r) => {
    const fee = Number(r.fee);
    return r.fee !== null && Number.isFinite(fee) && fee >= 0 ? [{ pageId: r.id, feeCents: Math.round(fee * 100) }] : [];
  });
}

/** The P0 read APIs (core §K.2) and the store's own rows, one function per field. */
export const DEFAULT_SOURCES: HealthSources = {
  async slaHours() {
    return (await getPlatformSetting("platform")).signup.slaHours;
  },
  async pages(scope) {
    const [rows, render] = await Promise.all([listPagesForConsole(scope), renderSummary(scope).catch(() => null)]);
    const live = rows.filter((r) => r.status === "published");
    const lastPublish = rows.reduce<number>((max, r) => Math.max(max, r.lastPublishedAt?.getTime() ?? 0), 0);
    return {
      published: live.length,
      drafts: rows.filter((r) => r.status === "draft").length,
      lastPublishAt: lastPublish ? new Date(lastPublish) : null,
      // a render summary that could not be read counts no failure (the rule stays silent)
      renderFailed: (render?.failed24h ?? []).filter((f) => f.storeId === scope.storeId).reduce((n, f) => n + f.count, 0),
      live: live.slice(0, LIVE_PAGES_MAX).map((r) => ({ id: r.id, slug: r.slug, updatedAt: r.updatedAt, name: r.name, seoTitle: r.seoTitle })),
    };
  },
  async brand(scope, store) {
    const { store: info, policies } = await getStoreSettings(scope, ["store", "policies"]);
    const texts = [policies.warranty.text, ...policies.extras.map((e) => e.text)].flatMap((t) => (t ? [t.ar, t.fr, t.en] : [])).filter((s): s is string => !!s && s.trim().length > 0);
    return { storeName: store.name, legalName: info.legalName ?? null, whatsappName: null, policyTexts: texts };
  },
  async abuseReports(scope, _store, now) {
    const since = new Date(now.getTime() - DAY);
    const [row] = await db
      .select({ total: count(), new24h: sql<string | number | null>`SUM(${abuseReports.createdAt} > ${since})` })
      .from(abuseReports)
      .where(whereStore(abuseReports, scope));
    return { new24h: Number(row?.new24h ?? 0), total: Number(row?.total ?? 0) };
  },
  async orders(scope, _store, now) {
    const [k7, k28, queue, risky7d] = await Promise.all([orderKpis(scope, "7d"), orderKpis(scope, "28d"), queueCounts(scope), riskyOrders7d(scope, now)]);
    return {
      ...k7,
      risky7d,
      firstTouchP50Ms: "value" in k7.firstTouchP50Min ? Math.round(k7.firstTouchP50Min.value * 60_000) : null,
      unattempted2h: queue.firstTouchBreaches,
      unreachable7d: rate(k7.unreachableRate),
      unreachable28d: rate(k28.unreachableRate),
    };
  },
  async integrations(scope) {
    return integrationHealth(scope);
  },
  async sheets(scope, _store, now) {
    const b = await sheetsBacklog(scope);
    const oldest = toDate(b.oldestPendingAt);
    return { pending: b.pending, oldestMin: oldest ? Math.max(0, Math.floor((now.getTime() - oldest.getTime()) / 60_000)) : null, lastRunFailedAt: toDate(b.lastRunFailedAt) };
  },
  async ai(scope, store, now) {
    return aiUsageForStore(scope, periodOf("month", now, store.timezone));
  },
  async design(scope) {
    return designHealth(scope);
  },
  async usage(scope, store, now) {
    const month = periodOf("month", now, store.timezone);
    const [ent, rows] = await Promise.all([
      entitlements(scope),
      db
        .select({ metric: storeUsage.metric, period: storeUsage.period, value: storeUsage.value })
        .from(storeUsage)
        .where(whereStore(storeUsage, scope, inArray(storeUsage.period, ["total", month]))),
    ]);
    const limits = ent as unknown as Record<string, unknown>;
    return (Object.keys(USAGE_METRICS) as UsageMetricName[]).flatMap((metric) => {
      const def = USAGE_METRICS[metric];
      if (def.period === "day") return [];
      const period = def.period === "total" ? "total" : month;
      const row = rows.find((r) => r.metric === metric && r.period === period);
      const limit = def.limit === null ? null : limits[def.limit];
      return [{ metric, period, used: Number(row?.value ?? 0), limit: typeof limit === "number" && Number.isFinite(limit) ? limit : null }];
    });
  },
  async settings(scope) {
    return getStoreSettings(scope, ["store", "policies", "checkout", "conversions"]);
  },
  async members(scope) {
    const active = (await listMembersByScope(scope)).filter((m) => m.status === "active");
    const last = active.reduce<number>((max, m) => Math.max(max, m.lastActiveAt?.getTime() ?? 0), 0);
    return {
      total: active.length,
      withoutTotpWithOrdersReadAll: active.filter((m) => !m.totpEnabled && can(m.role, "orders.read_all")).length,
      lastActiveAt: last ? new Date(last) : null,
      lastLoginAt: last ? new Date(last) : null,
    };
  },
  async review(scope) {
    const [row] = await db
      .select({ submittedAt: signupReviews.submittedAt, status: signupReviews.status })
      .from(signupReviews)
      .where(whereStore(signupReviews, scope, inArray(signupReviews.kind, ["signup", "reopen"])))
      .orderBy(desc(signupReviews.createdAt))
      .limit(1);
    return row ? { submittedAt: row.submittedAt ?? null, status: row.status } : null;
  },
  async zones(scope, _store, now) {
    const to = now.toISOString().slice(0, 10);
    const from = new Date(now.getTime() - 28 * DAY).toISOString().slice(0, 10);
    const [table, agg, fees] = await Promise.all([zonesForCheckout(scope), opsAggregates(scope, { from, to, dims: ["city"] }), liveFlatFees(scope)]);
    const top: CityKey[] = [];
    for (const cell of [...(agg.cells.city ?? [])].sort((a, b) => b.placed - a.placed)) {
      const key = cityKey(cell.key);
      if (key && !top.includes(key)) top.push(key);
      if (top.length === 5) break;
    }
    const zoneFees = top.length && fees.length ? await zoneFeesFor(scope, top) : ({} as Record<CityKey, number | null>);
    const feeMismatchTop5: NonNullable<HealthInputs["zones"]>["feeMismatchTop5"] = [];
    for (const key of top) {
      const zoneFee = zoneFees[key];
      if (zoneFee === null || zoneFee === undefined) continue;
      // the newest live page whose flat fee differs, one entry per city
      const page = fees.find((f) => f.feeCents !== zoneFee);
      if (page) feeMismatchTop5.push({ cityKey: key, pageFeeCents: page.feeCents, zoneFeeCents: zoneFee });
    }
    return { count: table.zones.length, pageShowsFlatFee: fees.some((f) => f.feeCents > 0), feeMismatchTop5 };
  },
};

const notImplemented = (err: unknown) => err instanceof Error && err.message.startsWith("not implemented");

function within<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    p.finally(() => clearTimeout(timer)),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("health_source_timeout")), ms);
    }),
  ]);
}

export interface InputsReport {
  inputs: HealthInputs;
  /** the sources that answered nothing (failed or timed out) */
  failed: HealthSourceKey[];
  ms: number;
}

/** Every source in parallel, each on its own (`SOURCE_TIMEOUT_MS`); a failed one leaves its field null. */
export async function collectHealthInputsReport(scope: StoreScope, store: StoreRow, now: Date, sources: HealthSources = DEFAULT_SOURCES, timeoutMs = SOURCE_TIMEOUT_MS): Promise<InputsReport> {
  const t0 = performance.now();
  const keys = Object.keys(sources) as HealthSourceKey[];
  const failed: HealthSourceKey[] = [];
  const values = await Promise.all(
    keys.map(async (key) => {
      try {
        return await within(Promise.resolve().then(() => (sources[key] as HealthSource<typeof key>)(scope, store, now)), timeoutMs);
      } catch (err) {
        failed.push(key);
        if (!notImplemented(err)) recordPlatformError(`health input ${key}`, err, { storeId: store.id, area: "health" });
        return null;
      }
    }),
  );
  const fields = Object.fromEntries(keys.map((k, i) => [k, values[i] ?? null])) as { [K in HealthSourceKey]: HealthInputs[K] };
  return { inputs: { ...fields, store, now }, failed, ms: Math.round(performance.now() - t0) };
}

/** PLA-§6.3.1's signature (with the injectable sources). */
export async function collectHealthInputs(scope: StoreScope, store: StoreRow, now: Date, sources: HealthSources = DEFAULT_SOURCES): Promise<HealthInputs> {
  return (await collectHealthInputsReport(scope, store, now, sources)).inputs;
}
