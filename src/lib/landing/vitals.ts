import "server-only";
/**
 * Page vitals of the pages list (P3 LANDING; landing.md LAN-§15.2, LP-22): for the last `days` store days (default 7),
 * per page: views, uniques, orders, conversion (orders / uniques), confirmation rate (confirmed / orders, operations'
 * `confirm_state`) and the daily views of a sparkline.
 *
 * One grouped query per metric over the core indexes, in the scope's store: `stats_daily (store_id, page_id, day)`
 * for views and uniques (store days, as the beacon wrote them, STAT-01) and for the daily series, `orders (store_id,
 * page_id, created_at)` from the first store day's midnight for orders and confirmations. Test orders are excluded
 * (D54; test traffic never reaches stats_daily). A rate below n = 20 (uniques for conversion, orders for confirmation)
 * is null ("needs more visits"): no rate is shown on too few. Cached 60 s per store and request shape.
 */
import { createHash } from "node:crypto";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { addDays, dayKey, dayStart } from "@/lib/admin-data/time";
import { db } from "@/lib/db/client";
import { orders, statsDaily } from "@/lib/db/schema";
import { storeTimeZone } from "@/lib/stats";
import { scopedCache } from "@/lib/tenancy/cache";
import { whereStore } from "@/lib/tenancy/sql";
import type { StoreScope } from "@/lib/tenancy/types";

/** Rates are hidden below this many uniques (conversion) or orders (confirmation). */
export const VITALS_MIN_N = 20;
/** A sparkline needs at least this many daily points. */
export const SPARK_MIN_POINTS = 7;

export interface PageVitals {
  pageId: string;
  views: number;
  uniques: number;
  orders: number;
  confirmed: number;
  /** orders / uniques, 0…1, or null below n = 20 uniques */
  conversion: number | null;
  /** confirmed / orders, 0…1, or null below n = 20 orders */
  confirmation: number | null;
  /** views per store day, oldest first (`days` points), or null below 7 points */
  daily: number[] | null;
}

const vitalsCache = scopedCache<Record<string, PageVitals>>({ name: "page-vitals", maxEntries: 200, ttlMs: 60_000 });
const ID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const rate = (num: number, den: number) => (den >= VITALS_MIN_N && den > 0 ? Math.round((num / den) * 10_000) / 10_000 : null);

/** The vitals of `pageIds` (the store's own; an id of another store finds no row and reads all zeros). */
export async function getPageVitals(scope: StoreScope, pageIds: readonly string[], days = 7, now: Date = new Date()): Promise<Record<string, PageVitals>> {
  const ids = [...new Set(pageIds.filter((id) => typeof id === "string" && ID_RE.test(id)))].sort().slice(0, 200);
  if (!ids.length) return {};
  const span = Math.max(1, Math.min(90, Math.round(days)));
  const tz = await storeTimeZone(scope);
  const today = dayKey(now, tz);
  const key = `${span}:${today}:${createHash("sha256").update(ids.join(",")).digest("hex").slice(0, 16)}`;
  return vitalsCache.getOrLoad(scope.storeId, key, () => loadVitals(scope, ids, span, today, tz));
}

async function loadVitals(scope: StoreScope, ids: string[], span: number, today: string, tz: string): Promise<Record<string, PageVitals>> {
  const from = addDays(today, -(span - 1));
  const [totals, daily, placed] = await Promise.all([
    db
      .select({ pageId: statsDaily.pageId, views: sql<number>`COALESCE(SUM(${statsDaily.views}), 0)`, uniques: sql<number>`COALESCE(SUM(${statsDaily.uniques}), 0)` })
      .from(statsDaily)
      .where(whereStore(statsDaily, scope, inArray(statsDaily.pageId, ids), gte(statsDaily.day, from)))
      .groupBy(statsDaily.pageId),
    db
      .select({ pageId: statsDaily.pageId, day: statsDaily.day, views: sql<number>`COALESCE(SUM(${statsDaily.views}), 0)` })
      .from(statsDaily)
      .where(whereStore(statsDaily, scope, inArray(statsDaily.pageId, ids), gte(statsDaily.day, from)))
      .groupBy(statsDaily.pageId, statsDaily.day),
    db
      .select({ pageId: orders.pageId, orders: sql<number>`COUNT(*)`, confirmed: sql<number>`COALESCE(SUM(${orders.confirmState} = 'confirmed'), 0)` })
      .from(orders)
      .where(whereStore(orders, scope, and(inArray(orders.pageId, ids), gte(orders.createdAt, dayStart(from, tz))), eq(orders.isTest, false)))
      .groupBy(orders.pageId),
  ]);
  const days = Array.from({ length: span }, (_, i) => addDays(from, i));
  const totalsBy = new Map(totals.map((t) => [t.pageId, t]));
  const ordersBy = new Map(placed.map((o) => [o.pageId, o]));
  const dailyBy = new Map<string, Map<string, number>>();
  for (const d of daily) {
    const m = dailyBy.get(d.pageId) ?? new Map<string, number>();
    m.set(String(d.day).slice(0, 10), Number(d.views));
    dailyBy.set(d.pageId, m);
  }
  const out: Record<string, PageVitals> = {};
  for (const pageId of ids) {
    const t = totalsBy.get(pageId);
    const o = ordersBy.get(pageId);
    const views = Number(t?.views ?? 0);
    const uniques = Number(t?.uniques ?? 0);
    const n = Number(o?.orders ?? 0);
    const confirmed = Number(o?.confirmed ?? 0);
    const series = dailyBy.get(pageId);
    out[pageId] = {
      pageId,
      views,
      uniques,
      orders: n,
      confirmed,
      conversion: rate(n, uniques),
      confirmation: rate(confirmed, n),
      daily: span >= SPARK_MIN_POINTS ? days.map((d) => series?.get(d) ?? 0) : null,
    };
  }
  return out;
}
