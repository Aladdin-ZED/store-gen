import "server-only";
/**
 * Privacy-friendly page analytics: daily counters per page (stats_daily) + short-lived unique-visitor
 * markers (stats_visitors, sha256(vid) truncated, purged after 2 days). No cookies, no IPs stored.
 * Days are calendar days in APP_TIMEZONE (Morocco by default).
 *
 * Multi-tenant (docs/STORE-SAAS.md §K.1, STAT-01…04): the scoped overloads `recordEvent(scope, …)`,
 * `bumpOrderStats(scope, …)` and `getPageStats(scope, range)` are frozen at C0a; T3 implements them (store
 * timezone days, `store_id` rows, `is_test` skipped) and moves the callers. Until then they throw
 * "not implemented: T3" and the single-tenant forms below keep working.
 */
import { createHash } from "node:crypto";
import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { ResultSetHeader } from "mysql2";
import { db, pool } from "@/lib/db/client";
import { pages, statsDaily, statsVisitors } from "@/lib/db/schema";
import type { z } from "zod";
import type { EventPayload } from "@/lib/orders/contract";
import { hashIp } from "@/lib/security/crypto";
import { rateLimit, rateLimitReached } from "@/lib/security/rate-limit";
import type { StoreScope, WriteScope } from "@/lib/tenancy/types";

export const STATS_TZ = process.env.APP_TIMEZONE || "Africa/Casablanca";
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Calendar day "YYYY-MM-DD" of `d` in `timeZone`. */
export function dayKey(d: Date = new Date(), timeZone = STATS_TZ): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  ) as Record<string, string>;
  return `${p.year}-${p.month}-${p.day}`;
}

const vidHash = (scope: string, vid: string) => createHash("sha256").update(scope + vid).digest("hex").slice(0, 32);

/** true when this (page, day, marker) is new → the visitor counts as unique for that metric. */
async function markOnce(pageId: string, day: string, hash: string): Promise<boolean> {
  const [res] = await pool().query<ResultSetHeader>(
    "INSERT IGNORE INTO stats_visitors (page_id, day, vid_hash) VALUES (?, ?, ?)",
    [pageId, day, hash],
  );
  return res.affectedRows === 1;
}

async function bump(pageId: string, day: string, d: { views?: number; uniques?: number; formStarts?: number; orders?: number; revenue?: number }) {
  const v = { views: 0, uniques: 0, formStarts: 0, orders: 0, revenue: 0, ...d };
  await db
    .insert(statsDaily)
    .values({ pageId, day, views: v.views, uniques: v.uniques, formStarts: v.formStarts, orders: v.orders, revenue: v.revenue })
    .onDuplicateKeyUpdate({
      set: {
        views: sql`${statsDaily.views} + ${v.views}`,
        uniques: sql`${statsDaily.uniques} + ${v.uniques}`,
        formStarts: sql`${statsDaily.formStarts} + ${v.formStarts}`,
        orders: sql`GREATEST(0, ${statsDaily.orders} + ${v.orders})`,
        revenue: sql`GREATEST(0, ${statsDaily.revenue} + ${v.revenue})`,
      },
    });
}

/** Stored beacons per network (IPv4 / IPv6 /64) per 10 min — mobile carriers put many shoppers behind one IPv4 (CGNAT). */
const EVENT_LIMIT = 240;
/**
 * Unique visitors (and, separately, unique form starts) one network can add to one page per 24 h.
 * The visitor id is chosen by the client, so without this cap one script with random ids could
 * inflate uniques — the conversion-rate denominator — and the marker table without bound.
 * Above the cap a view still counts as a view, with no marker and no unique credit.
 */
const UNIQUES_PER_NETWORK = 50;

/**
 * Count an analytics beacon for a resolved page. "view" → views (+ unique visitor), "form_start" →
 * unique form starts per visitor/day. Other event types are accepted but not stored.
 */
type StatsEvent = Pick<z.output<typeof EventPayload>, "type" | "vid">;

const scopedNotImplemented = (fn: string): never => {
  throw new Error(`not implemented: T3 (${fn}, scoped)`);
};

export function recordEvent(scope: WriteScope, pageId: string, e: StatsEvent, ip: string): Promise<void>;
/** @deprecated single-tenant; T3 moves the event route to the scoped overload */
export function recordEvent(pageId: string, e: StatsEvent, ip: string): Promise<void>;
export async function recordEvent(...args: [WriteScope, string, StatsEvent, string] | [string, StatsEvent, string]): Promise<void> {
  if (typeof args[0] !== "string") return scopedNotImplemented("recordEvent");
  const [pageId, e, ip] = args as [string, StatsEvent, string];
  if (e.type !== "view" && e.type !== "form_start") return;
  const net = hashIp(ip);
  const gate = await rateLimit(`evt:ip:${net}`, EVENT_LIMIT, 600);
  if (!gate.ok) return;
  const day = dayKey();
  const credit = async (scope: "v:" | "fs:"): Promise<boolean> => {
    const bucket = `evt:uniq:${scope}${pageId}:${net}`;
    if (await rateLimitReached(bucket, UNIQUES_PER_NETWORK)) return false;
    if (!(await markOnce(pageId, day, vidHash(scope, e.vid)))) return false;
    return (await rateLimit(bucket, UNIQUES_PER_NETWORK, 86_400)).ok;
  };
  if (e.type === "view") {
    const unique = await credit("v:");
    await bump(pageId, day, { views: 1, uniques: unique ? 1 : 0 });
  } else if (await credit("fs:")) {
    await bump(pageId, day, { formStarts: 1 });
  }
}

/** Orders / revenue counters (called on order creation and upsell acceptance). */
export function bumpOrderStats(scope: WriteScope, pageId: string, at: Date, d: { orders?: number; revenue?: number }): Promise<void>;
/** @deprecated single-tenant; T3 moves the order and upsell paths to the scoped overload */
export function bumpOrderStats(pageId: string, at: Date, d: { orders?: number; revenue?: number }): Promise<void>;
export async function bumpOrderStats(
  ...args: [WriteScope, string, Date, { orders?: number; revenue?: number }] | [string, Date, { orders?: number; revenue?: number }]
): Promise<void> {
  if (typeof args[0] !== "string") return scopedNotImplemented("bumpOrderStats");
  const [pageId, at, d] = args as [string, Date, { orders?: number; revenue?: number }];
  await bump(pageId, dayKey(at), { orders: d.orders ?? 0, revenue: Math.round((d.revenue ?? 0) * 100) / 100 });
}

/** Housekeeping: unique-visitor markers are only needed for the current day (kept 2 days). */
export async function purgeVisitorMarkers(keepDays = 2): Promise<number> {
  const cutoff = dayKey(new Date(Date.now() - keepDays * 86_400_000));
  const [res] = await pool().query<ResultSetHeader>("DELETE FROM stats_visitors WHERE day < ?", [cutoff]);
  return res.affectedRows;
}

/* ------------------------------------------------------------------ */
/* reporting                                                           */
/* ------------------------------------------------------------------ */

export interface StatsRow {
  views: number;
  uniques: number;
  formStarts: number;
  orders: number;
  revenue: number;
  /** orders / unique visitors (0..1) */
  conversionRate: number;
}

export interface PageStats {
  from: string;
  to: string;
  totals: StatsRow;
  days: (StatsRow & { day: string })[];
  pages: (StatsRow & { pageId: string; name: string | null; slug: string | null })[];
}

const rate = (orders: number, uniques: number) => (uniques > 0 ? Math.round((orders / uniques) * 10_000) / 10_000 : 0);
const row = (r: { views: number; uniques: number; formStarts: number; orders: number; revenue: number }): StatsRow => ({
  views: Number(r.views),
  uniques: Number(r.uniques),
  formStarts: Number(r.formStarts),
  orders: Number(r.orders),
  revenue: Math.round(Number(r.revenue) * 100) / 100,
  conversionRate: rate(Number(r.orders), Number(r.uniques)),
});

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Funnel stats for a day range (inclusive, "YYYY-MM-DD", max 366 days) — totals, a gap-free daily
 * series, and per-page rows. Optionally restricted to some pages.
 */
export function getPageStats(scope: StoreScope, range: { from: string; to: string }, opts?: { pageIds?: string[] }): Promise<PageStats>;
/** @deprecated single-tenant; T3 moves the dashboard and the console to the scoped overload */
export function getPageStats(range: { from: string; to: string }, opts?: { pageIds?: string[] }): Promise<PageStats>;
export async function getPageStats(
  ...args: [StoreScope, { from: string; to: string }, { pageIds?: string[] }?] | [{ from: string; to: string }, { pageIds?: string[] }?]
): Promise<PageStats> {
  if ("storeId" in args[0]) return scopedNotImplemented("getPageStats");
  const [range, opts = {}] = args as [{ from: string; to: string }, { pageIds?: string[] }?];
  let { from, to } = range;
  if (!DAY_RE.test(from) || !DAY_RE.test(to)) throw new Error("invalid stats range");
  if (from > to) [from, to] = [to, from];
  if (addDays(from, 366) < to) from = addDays(to, -366);

  const where = and(
    gte(statsDaily.day, from),
    lte(statsDaily.day, to),
    opts.pageIds?.length ? inArray(statsDaily.pageId, opts.pageIds) : undefined,
  );
  const sums = {
    views: sql<number>`COALESCE(SUM(${statsDaily.views}), 0)`,
    uniques: sql<number>`COALESCE(SUM(${statsDaily.uniques}), 0)`,
    formStarts: sql<number>`COALESCE(SUM(${statsDaily.formStarts}), 0)`,
    orders: sql<number>`COALESCE(SUM(${statsDaily.orders}), 0)`,
    revenue: sql<number>`COALESCE(SUM(${statsDaily.revenue}), 0)`,
  };
  const [byDay, byPage] = await Promise.all([
    db.select({ day: statsDaily.day, ...sums }).from(statsDaily).where(where).groupBy(statsDaily.day).orderBy(asc(statsDaily.day)),
    db
      .select({ pageId: statsDaily.pageId, name: pages.name, slug: pages.slug, ...sums })
      .from(statsDaily)
      .leftJoin(pages, eq(pages.id, statsDaily.pageId))
      .where(where)
      .groupBy(statsDaily.pageId, pages.name, pages.slug),
  ]);

  const map = new Map(byDay.map((r) => [String(r.day).slice(0, 10), row(r)]));
  const days: PageStats["days"] = [];
  const zero = row({ views: 0, uniques: 0, formStarts: 0, orders: 0, revenue: 0 });
  for (let d = from; d <= to; d = addDays(d, 1)) days.push({ day: d, ...(map.get(d) ?? zero) });

  const totals = row(
    days.reduce(
      (a, d) => ({
        views: a.views + d.views,
        uniques: a.uniques + d.uniques,
        formStarts: a.formStarts + d.formStarts,
        orders: a.orders + d.orders,
        revenue: a.revenue + d.revenue,
      }),
      { views: 0, uniques: 0, formStarts: 0, orders: 0, revenue: 0 },
    ),
  );
  const pagesOut = byPage
    .map((r) => ({ pageId: r.pageId, name: r.name ?? null, slug: r.slug ?? null, ...row(r) }))
    .sort((a, b) => b.orders - a.orders || b.views - a.views);
  return { from, to, totals, days, pages: pagesOut };
}

/** Remove all analytics of a page (call when a page is deleted). */
export async function deletePageStats(pageId: string): Promise<void> {
  await db.delete(statsVisitors).where(eq(statsVisitors.pageId, pageId));
  await db.delete(statsDaily).where(eq(statsDaily.pageId, pageId));
}
