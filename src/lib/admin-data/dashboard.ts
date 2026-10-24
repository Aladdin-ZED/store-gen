import "server-only";
/**
 * Dashboard data in one call: KPIs (today / 7 days vs the previous 7), a 30-day series, top pages,
 * recent orders, Google Sheets sync health, the setup checklist and the database size.
 *
 * Funnel numbers (orders, revenue, unique visitors) come from stats_daily, which is bucketed by the
 * store's calendar day and excludes bot (honeypot) orders. Revenue is the value of orders placed,
 * before cancellations — COD revenue is only certain once delivered.
 */
import { and, asc, count, desc, eq, gte, inArray, isNotNull, ne } from "drizzle-orm";
import { cronKeySecret } from "@/lib/auth/config";
import { db } from "@/lib/db/client";
import { orders, pages } from "@/lib/db/schema";
import { getDbUsage, type DbUsage } from "@/lib/db/usage";
import { getSettings } from "@/lib/settings";
import { getSheetsConfig, isSheetsConfigured } from "@/lib/sheets";
import { getPageStats, type StatsRow } from "@/lib/stats";
import { addDays, dayKey, dayStart } from "./time";

export interface Kpi {
  value: number;
  /** same metric over the previous period (null when not comparable) */
  previous: number | null;
}

export interface DashboardData {
  currency: string;
  today: string;
  kpis: {
    ordersToday: Kpi;
    orders7d: Kpi;
    revenue7d: Kpi;
    aov7d: Kpi;
    conversion7d: Kpi;
    uniques7d: Kpi;
  };
  series: { day: string; orders: number; revenue: number; uniques: number }[];
  /** order statuses of the last 7 days (pipeline bar) */
  pipeline: { status: string; n: number }[];
  topPages: { pageId: string; name: string; slug: string; status: string; uniques: number; orders: number; revenue: number; conversion: number }[];
  recentOrders: {
    id: string;
    name: string;
    city: string | null;
    total: number;
    currency: string;
    status: string;
    createdAt: string;
    pageName: string | null;
    sheetStatus: "pending" | "synced" | "failed" | "disabled";
    riskScore: number;
  }[];
  sheet: SheetHealth;
  checklist: ChecklistItem[];
  hasPages: boolean;
  /** database size against the plan's limit (null when it can't be read) */
  storage: DbUsage | null;
}

export interface SheetHealth {
  /** GOOGLE_SA_JSON_B64 present and valid */
  configured: boolean;
  connected: boolean;
  enabled: boolean;
  title: string | null;
  url: string | null;
  pending: number;
  failed: number;
  synced: number;
  /** minutes the oldest queued order has been waiting (null when the queue is empty) */
  oldestPendingMinutes: number | null;
  lastError: string | null;
}

export interface ChecklistItem {
  id: "store" | "sheets" | "twofactor" | "publish" | "home" | "cron";
  done: boolean;
  href: string;
}

const sumRows = (rows: StatsRow[]) =>
  rows.reduce((a, r) => ({ orders: a.orders + r.orders, revenue: a.revenue + r.revenue, uniques: a.uniques + r.uniques }), {
    orders: 0,
    revenue: 0,
    uniques: 0,
  });

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function getSheetHealth(): Promise<SheetHealth> {
  const [cfg, counts, [oldest], [lastFailed]] = await Promise.all([
    getSheetsConfig(),
    db.select({ s: orders.sheetStatus, n: count() }).from(orders).groupBy(orders.sheetStatus),
    db.select({ at: orders.createdAt }).from(orders).where(eq(orders.sheetStatus, "pending")).orderBy(asc(orders.createdAt)).limit(1),
    db
      .select({ error: orders.sheetError })
      .from(orders)
      .where(and(eq(orders.sheetStatus, "failed"), isNotNull(orders.sheetError)))
      .orderBy(desc(orders.updatedAt))
      .limit(1),
  ]);
  const by = Object.fromEntries(counts.map((c) => [c.s, Number(c.n)])) as Partial<Record<"pending" | "synced" | "failed", number>>;
  return {
    configured: isSheetsConfigured(),
    connected: !!cfg,
    enabled: !!cfg?.enabled,
    title: cfg?.sheetTitle ?? null,
    url: cfg?.url ?? null,
    pending: by.pending ?? 0,
    failed: by.failed ?? 0,
    synced: by.synced ?? 0,
    oldestPendingMinutes: oldest ? Math.max(0, Math.round((Date.now() - oldest.at.getTime()) / 60_000)) : null,
    lastError: lastFailed?.error ?? null,
  };
}

export async function getDashboard(user: { totpEnabled: boolean }): Promise<DashboardData> {
  const today = dayKey();
  const from30 = addDays(today, -29);
  const from14 = addDays(today, -13);
  const weekStart = addDays(today, -6);

  const [stats, settings, sheet, storage, recent, pipelineRows, publishedCount, pageTotal] = await Promise.all([
    getPageStats({ from: from30, to: today }),
    getSettings(["defaults", "store", "home"]),
    getSheetHealth(),
    getDbUsage(),
    db
      .select({
        id: orders.id,
        name: orders.name,
        city: orders.city,
        total: orders.total,
        currency: orders.currency,
        status: orders.status,
        createdAt: orders.createdAt,
        pageName: pages.name,
        sheetStatus: orders.sheetStatus,
        riskScore: orders.riskScore,
      })
      .from(orders)
      .leftJoin(pages, eq(pages.id, orders.pageId))
      .where(ne(orders.sheetStatus, "disabled"))
      .orderBy(desc(orders.createdAt))
      .limit(8),
    db
      .select({ status: orders.status, n: count() })
      .from(orders)
      .where(and(gte(orders.createdAt, dayStart(weekStart)), ne(orders.sheetStatus, "disabled")))
      .groupBy(orders.status),
    db.select({ n: count() }).from(pages).where(eq(pages.status, "published")),
    db.select({ n: count() }).from(pages).where(ne(pages.status, "archived")),
  ]);

  const days = stats.days;
  const byDay = new Map(days.map((d) => [d.day, d]));
  const week = sumRows(days.filter((d) => d.day >= weekStart));
  const prevWeek = sumRows(days.filter((d) => d.day >= from14 && d.day < weekStart));
  const todayRow = byDay.get(today);
  const yesterday = byDay.get(addDays(today, -1));
  const aov = (r: { orders: number; revenue: number }) => (r.orders ? round2(r.revenue / r.orders) : 0);
  const conv = (r: { orders: number; uniques: number }) => (r.uniques ? r.orders / r.uniques : 0);

  // top pages over 7 days, by orders then visitors
  const weekStats = await getPageStats({ from: weekStart, to: today });
  const topIds = weekStats.pages.slice(0, 6).map((p) => p.pageId);
  const statusRows = topIds.length ? await db.select({ id: pages.id, status: pages.status }).from(pages).where(inArray(pages.id, topIds)) : [];
  const statusBy = new Map(statusRows.map((r) => [r.id, r.status]));

  const store = settings.store;
  const homeSet = !!settings.home.pageId;

  const checklist: ChecklistItem[] = [
    { id: "store", done: store.storeName.trim() !== "" && store.storeName !== "My store" && !!(store.phone || store.whatsapp), href: "/admin/settings/store" },
    { id: "sheets", done: sheet.connected && sheet.enabled, href: "/admin/settings/sheets" },
    { id: "twofactor", done: user.totpEnabled, href: "/admin/settings/security" },
    { id: "publish", done: Number(publishedCount[0]?.n ?? 0) > 0, href: "/admin/pages" },
    { id: "home", done: homeSet, href: "/admin/pages" },
    { id: "cron", done: cronKeySecret() !== null, href: "/admin/settings/sheets#cron" },
  ];

  return {
    currency: settings.defaults.currency,
    today,
    kpis: {
      ordersToday: { value: todayRow?.orders ?? 0, previous: yesterday?.orders ?? 0 },
      orders7d: { value: week.orders, previous: prevWeek.orders },
      revenue7d: { value: round2(week.revenue), previous: round2(prevWeek.revenue) },
      aov7d: { value: aov(week), previous: prevWeek.orders ? aov(prevWeek) : null },
      conversion7d: { value: conv(week), previous: prevWeek.uniques ? conv(prevWeek) : null },
      uniques7d: { value: week.uniques, previous: prevWeek.uniques },
    },
    series: days.map((d) => ({ day: d.day, orders: d.orders, revenue: d.revenue, uniques: d.uniques })),
    pipeline: pipelineRows.map((r) => ({ status: r.status, n: Number(r.n) })).sort((a, b) => b.n - a.n),
    topPages: weekStats.pages.slice(0, 6).map((p) => ({
      pageId: p.pageId,
      name: p.name ?? "Deleted page",
      slug: p.slug ?? "",
      status: statusBy.get(p.pageId) ?? "deleted",
      uniques: p.uniques,
      orders: p.orders,
      revenue: p.revenue,
      conversion: p.conversionRate,
    })),
    recentOrders: recent.map((o) => ({
      id: o.id,
      name: o.name,
      city: o.city,
      total: Number(o.total),
      currency: o.currency,
      status: o.status,
      createdAt: o.createdAt.toISOString(),
      pageName: o.pageName ?? null,
      sheetStatus: o.sheetStatus,
      riskScore: o.riskScore,
    })),
    sheet,
    checklist,
    hasPages: Number(pageTotal[0]?.n ?? 0) > 0,
    storage,
  };
}

/** Sidebar badges: orders waiting for a first call, sync failures. */
export async function navCounts(): Promise<{ newOrders: number; syncFailed: number }> {
  const [[n], [f]] = await Promise.all([
    db.select({ n: count() }).from(orders).where(and(eq(orders.status, "new"), ne(orders.sheetStatus, "disabled"))),
    db.select({ n: count() }).from(orders).where(eq(orders.sheetStatus, "failed")),
  ]);
  return { newOrders: Number(n?.n ?? 0), syncFailed: Number(f?.n ?? 0) };
}
