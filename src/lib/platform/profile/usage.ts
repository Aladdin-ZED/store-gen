import "server-only";
/**
 * The store profile's Usage & plan tab and its Overview strip 8 (platform.md PLA-§7.9, §7.3 strip 8; PL-11, D69):
 *
 *   const u = await getStoreUsage(ctx, storeId);
 *   // u.plan (name, since), u.entitlements (plan value, override, boost, state cap, kill effect, effective),
 *   // u.meters (used / limit per metric, this month in the store time zone), u.history (subscriptions + audit)
 *
 * The effective values are T1's `entitlements(platformScope)` (core §A.4: override > boost > plan > default, the
 * release, the state cap, the kill switches); this file only explains each one with the rows behind it, read through
 * `platformScope(ctx, storeId)`: the store row, `store_entitlements`, `store_usage`, `store_subscriptions` and the
 * store's own entitlement audit rows. Keys of a later release are listed apart ("Later").
 */
import { desc, eq, inArray } from "drizzle-orm";
import { AuthRefusal } from "@/lib/auth/errors";
import { releaseOn } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { auditLog, plans, storeEntitlements, storeSubscriptions, storeUsage, stores, users } from "@/lib/db/schema";
import { getPlatformSetting } from "@/lib/settings";
import { activeKillSwitches, applyStateCap, entitlements, KILL_FEATURES } from "@/lib/tenancy/entitlements";
import { ENTITLEMENT_KEYS, ENTITLEMENTS, MiB, periodOf, USAGE_METRICS, type EntitlementKey, type UsageMetricName } from "@/lib/tenancy/entitlement-keys";
import { whereStore } from "@/lib/tenancy/sql";
import type { PlatformCtx, StoreScope, StoreStatus } from "@/lib/tenancy/types";
import { platformScope } from "../seam";

type Value = number | null | boolean;

export interface EntitlementLine {
  key: EntitlementKey;
  kind: "limit" | "feature";
  unit: "bytes" | null;
  /** the plan's value, or the registry default when the plan does not set it */
  plan: Value;
  planSets: boolean;
  override: { value: Value; expiresAt: string | null; setBy: { id: string; name: string | null }; reason: string } | null;
  boost: { value: Value; expiresAt: string | null; setBy: { id: string; name: string | null }; reason: string } | null;
  /** the lifecycle state cap when it changes the value ("Pending: 100 MiB") */
  stateCap: Value | undefined;
  /** the kill switches turning this feature off right now */
  killedBy: string[];
  effective: Value;
  /** a key of a later release (collapsed under "Later") */
  later: boolean;
}

export interface UsageMeter {
  metric: UsageMetricName;
  period: "total" | "month";
  used: number;
  /** null = unlimited */
  limit: number | null;
  /** used / limit in %, null when unlimited */
  pct: number | null;
  soft: boolean;
  updatedAt: string | null;
}

export interface StoreUsage {
  status: StoreStatus;
  plan: { id: string; name: string | null; since: string | null };
  entitlements: EntitlementLine[];
  meters: UsageMeter[];
  /** the store's month ("YYYY-MM", store time zone) */
  month: string;
  /** `orders_month_soft` set and exceeded: "Above the soft order limit (banner only, orders are never blocked)" */
  aboveSoftOrders: boolean;
  /** active boosts with their expiry (strip 8) */
  boosts: { key: EntitlementKey; value: Value; expiresAt: string | null }[];
  history: { at: string; kind: "subscription" | "audit"; action: string; planId?: string; key?: string; by: string | null }[];
}

/** The metrics shown as meters (PLA-§7.9: gauges, then this month's counters). */
export const METERS: readonly UsageMetricName[] = ["media_bytes", "pages", "members", "agents", "campaigns", "short_links", "exports", "ai_credits", "orders"];

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

async function storeRow(storeId: string) {
  const [row] = await db
    .select({ status: stores.status, planId: stores.planId, timezone: stores.timezone, planName: plans.name, limits: plans.limits, features: plans.features })
    .from(stores)
    .leftJoin(plans, eq(plans.id, stores.planId))
    .where(eq(stores.id, storeId))
    .limit(1);
  return row ?? null;
}

async function overrideRows(scope: StoreScope) {
  return db
    .select({ key: storeEntitlements.key, source: storeEntitlements.source, value: storeEntitlements.value, expiresAt: storeEntitlements.expiresAt, setBy: storeEntitlements.setBy, reason: storeEntitlements.reason })
    .from(storeEntitlements)
    .where(whereStore(storeEntitlements, scope));
}

async function usageRows(scope: StoreScope, periods: readonly string[]) {
  return db
    .select({ metric: storeUsage.metric, period: storeUsage.period, value: storeUsage.value, updatedAt: storeUsage.updatedAt })
    .from(storeUsage)
    .where(whereStore(storeUsage, scope, inArray(storeUsage.period, [...periods])));
}

async function subscriptions(scope: StoreScope) {
  return db
    .select({ planId: storeSubscriptions.planId, status: storeSubscriptions.status, periodStart: storeSubscriptions.periodStart, createdBy: storeSubscriptions.createdBy, createdAt: storeSubscriptions.createdAt })
    .from(storeSubscriptions)
    .where(whereStore(storeSubscriptions, scope))
    .orderBy(desc(storeSubscriptions.createdAt))
    .limit(20);
}

async function entitlementAudit(scope: StoreScope) {
  return db
    .select({ at: auditLog.createdAt, action: auditLog.action, meta: auditLog.meta, userId: auditLog.userId })
    .from(auditLog)
    .where(whereStore(auditLog, scope, inArray(auditLog.action, ["platform.plan.changed", "platform.entitlement.set"])))
    .orderBy(desc(auditLog.id))
    .limit(30);
}

async function names(ids: readonly string[]): Promise<Map<string, string>> {
  const list = [...new Set(ids)].filter((id) => /^[0-9A-Z]{26}$/.test(id));
  if (!list.length) return new Map();
  const rows = await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, list));
  return new Map(rows.map((r) => [r.id, r.name]));
}

const live = (expiresAt: Date | null, now: Date) => expiresAt === null || expiresAt.getTime() > now.getTime();

/** PLA-§7.9 (`console.read`); null for an unknown store. */
export async function getStoreUsage(ctx: PlatformCtx, storeId: string, now: Date = new Date()): Promise<StoreUsage | null> {
  if (!ctx.can("console.read")) throw new AuthRefusal("forbidden");
  if (!/^[0-9A-Z]{26}$/.test(storeId)) return null;
  const row = await storeRow(storeId);
  if (!row) return null;
  const scope = platformScope(ctx, storeId);
  const month = periodOf("month", now, row.timezone);
  const [effective, rows, usage, subs, audits, kills, setting] = await Promise.all([
    entitlements(scope),
    overrideRows(scope),
    usageRows(scope, ["total", month]),
    subscriptions(scope),
    entitlementAudit(scope),
    activeKillSwitches(),
    getPlatformSetting("platform"),
  ]);
  const who = await names([...rows.map((r) => r.setBy), ...subs.map((s) => s.createdBy), ...audits.map((a) => a.userId ?? "")]);
  const caps = { mediaMiB: setting.signup.pendingMediaMiB, mediaMiBBeforeSubmit: setting.signup.pendingMediaMiBBeforeSubmit, membersMax: setting.signup.pendingMembersMax };

  const lines: EntitlementLine[] = ENTITLEMENT_KEYS.map((key) => {
    const def = ENTITLEMENTS[key];
    const bag = (def.kind === "feature" ? row.features : row.limits) as Record<string, Value> | null;
    const planSets = !!bag && Object.prototype.hasOwnProperty.call(bag, key);
    const plan = (planSets ? bag![key] : def.default) as Value;
    const pick = (source: "override" | "boost") => {
      const r = rows.find((x) => x.key === key && x.source === source && live(x.expiresAt, now));
      return r ? { value: r.value as Value, expiresAt: iso(r.expiresAt), setBy: { id: r.setBy, name: who.get(r.setBy) ?? null }, reason: r.reason } : null;
    };
    const override = pick("override");
    const boost = pick("boost");
    const chosen = (override ?? boost)?.value ?? plan;
    const capped = applyStateCap(row.status, key, chosen as never, { caps }) as Value;
    const killedBy = def.kind === "feature" ? kills.filter((k) => (KILL_FEATURES[k] as readonly string[]).includes(key)) : [];
    return {
      key,
      kind: def.kind,
      unit: "unit" in def && def.unit === "bytes" ? "bytes" : null,
      plan,
      planSets,
      override,
      boost,
      stateCap: capped !== chosen ? capped : undefined,
      killedBy,
      effective: effective[key] as Value,
      later: "release" in def && !!def.release && !releaseOn(def.release),
    };
  });

  const meters: UsageMeter[] = METERS.map((metric) => {
    const def = USAGE_METRICS[metric];
    const period = def.period === "total" ? "total" : month;
    const u = usage.find((x) => x.metric === metric && x.period === period);
    const limit = def.limit ? (effective[def.limit] as number | null) : null;
    const used = Number(u?.value ?? 0);
    return {
      metric,
      period: def.period === "total" ? "total" : "month",
      used,
      limit,
      pct: limit === null ? null : limit === 0 ? (used > 0 ? 100 : 0) : Math.min(999, Math.round((used / limit) * 100)),
      soft: "soft" in def && def.soft === true,
      updatedAt: iso(u?.updatedAt),
    };
  });
  const orders = meters.find((m) => m.metric === "orders");
  const current = subs.find((s) => s.status === "active");
  const history: StoreUsage["history"] = [
    ...subs.map((s) => ({ at: s.createdAt.toISOString(), kind: "subscription" as const, action: s.status, planId: s.planId, by: who.get(s.createdBy) ?? null })),
    ...audits.map((a) => {
      const meta = (a.meta ?? {}) as Record<string, unknown>;
      return { at: a.at.toISOString(), kind: "audit" as const, action: a.action, ...(typeof meta.key === "string" ? { key: meta.key } : {}), ...(typeof meta.to === "string" ? { planId: meta.to } : {}), by: a.userId ? (who.get(a.userId) ?? null) : null };
    }),
  ].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

  return {
    status: row.status,
    plan: { id: row.planId, name: row.planName ?? null, since: iso(current?.periodStart) },
    entitlements: lines,
    meters,
    month,
    aboveSoftOrders: !!orders && orders.limit !== null && orders.used > orders.limit,
    boosts: rows.filter((r) => r.source === "boost" && live(r.expiresAt, now) && ENTITLEMENT_KEYS.includes(r.key as EntitlementKey)).map((r) => ({ key: r.key as EntitlementKey, value: r.value as Value, expiresAt: iso(r.expiresAt) })),
    history: history.slice(0, 40),
  };
}

/** "Pending: 100 MiB" (strip 8's state caps in force): the capped limits of a pending store, in MiB where bytes. */
export function stateCapsInForce(u: StoreUsage): { key: EntitlementKey; value: Value; mib?: number }[] {
  return u.entitlements
    .filter((l) => l.stateCap !== undefined && !l.later)
    .map((l) => ({ key: l.key, value: l.stateCap as Value, ...(l.unit === "bytes" && typeof l.stateCap === "number" ? { mib: Math.round(l.stateCap / MiB) } : {}) }));
}

