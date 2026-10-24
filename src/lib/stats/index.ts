import "server-only";
/**
 * Privacy-friendly page analytics: daily counters per page (stats_daily) + short-lived unique-visitor
 * markers (stats_visitors, sha256(vid) truncated, purged after 2 days). No cookies, no IPs stored.
 *
 * Per store (docs/STORE-SAAS.md §K.1, STAT-01 … STAT-04): the scoped forms `recordEvent(scope, …)`,
 * `bumpOrderStats(scope, …)`, `getPageStats(scope, range)` and `deletePageStats(scope, pageId)` write and read
 * the scope's store only (`stats_daily.store_id`), and a day is a calendar day in the STORE's timezone
 * (`stores.timezone`; STAT-01), so "today" on a store's dashboard is its sellers' today. Test traffic never
 * reaches them (D54: the test render omits the event endpoint, test orders skip bumpOrderStats). The network
 * flood guard stays platform-wide (`p:evt:ip:<net>`); the unique-visitor credit is per page and network. The
 * single-tenant forms (APP_TIMEZONE days, no store) keep compiling for today's callers until they move.
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
import { getStoreById } from "@/lib/tenancy/public";
import type { StoreScope, WriteScope } from "@/lib/tenancy/types";

/** The single-tenant day zone (APP_TIMEZONE); store days use the store's own timezone (storeTimeZone). */
export const STATS_TZ = process.env.APP_TIMEZONE || "Africa/Casablanca";
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** `tz` when the runtime knows it as an IANA zone, else STATS_TZ (a bad stored value never breaks a beacon). */
export function validTimeZone(tz: string | null | undefined): string {
  if (!tz) return STATS_TZ;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: tz });
    return tz;
  } catch {
    return STATS_TZ;
  }
}

/** The calendar zone of a store's stats days (STAT-01): `stores.timezone`, cached with the store row. */
export async function storeTimeZone(scope: StoreScope): Promise<string> {
  const store = await getStoreById(scope.storeId);
  return validTimeZone(store?.timezone);
}

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

async function bump(pageId: string, day: string, d: { views?: number; uniques?: number; formStarts?: number; orders?: number; revenue?: number }, storeId?: string) {
  const v = { views: 0, uniques: 0, formStarts: 0, orders: 0, revenue: 0, ...d };
  await db
    .insert(statsDaily)
    .values({ pageId, day, views: v.views, uniques: v.uniques, formStarts: v.formStarts, orders: v.orders, revenue: v.revenue, ...(storeId ? { storeId } : {}) })
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

/** A resolved page's beacon in its store: the store's day, `stats_daily.store_id`, the per-page unique credit. */
async function recordInStore(scope: WriteScope, pageId: string, e: StatsEvent, ip: string, now: Date): Promise<void> {
  if (e.type !== "view" && e.type !== "form_start") return;
  const net = hashIp(ip);
  const gate = await rateLimit(`p:evt:ip:${net}`, EVENT_LIMIT, 600);
  if (!gate.ok) return;
  const day = dayKey(now, await storeTimeZone(scope));
  const credit = async (kind: "v:" | "fs:"): Promise<boolean> => {
    const bucket = `s:${scope.storeId}:evt:uniq:${kind}${pageId}:${net}`;
    if (await rateLimitReached(bucket, UNIQUES_PER_NETWORK)) return false;
    if (!(await markOnce(pageId, day, vidHash(kind, e.vid)))) return false;
    return (await rateLimit(bucket, UNIQUES_PER_NETWORK, 86_400)).ok;
  };
  if (e.type === "view") {
    const unique = await credit("v:");
    await bump(pageId, day, { views: 1, uniques: unique ? 1 : 0 }, scope.storeId);
  } else if (await credit("fs:")) {
    await bump(pageId, day, { formStarts: 1 }, scope.storeId);
  }
}

/**
 * Count an analytics beacon for a page resolved in the scope's store (resolvePublicTarget). "view" → views (+ a
 * unique visitor), "form_start" → unique form starts per visitor and day. Other event types are not stored.
 */
export function recordEvent(scope: WriteScope, pageId: string, e: StatsEvent, ip: string, now?: Date): Promise<void>;
/** @deprecated single-tenant; T3 moves the event route to the scoped overload */
export function recordEvent(pageId: string, e: StatsEvent, ip: string): Promise<void>;
export async function recordEvent(...args: [WriteScope, string, StatsEvent, string, Date?] | [string, StatsEvent, string]): Promise<void> {
  if (typeof args[0] !== "string") {
    const [scope, pageId, e, ip, now] = args as [WriteScope, string, StatsEvent, string, Date?];
    return recordInStore(scope, pageId, e, ip, now ?? new Date());
  }
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

/**
 * Orders / revenue counters of a page in the scope's store, on the store's day of `at` (order creation, upsell
 * acceptance; never for a test order, D54). `revenue` in the order currency's units, rounded to cents.
 */
export function bumpOrderStats(scope: WriteScope, pageId: string, at: Date, d: { orders?: number; revenue?: number }): Promise<void>;
/** @deprecated single-tenant; T3 moves the order and upsell paths to the scoped overload */
export function bumpOrderStats(pageId: string, at: Date, d: { orders?: number; revenue?: number }): Promise<void>;
export async function bumpOrderStats(
  ...args: [WriteScope, string, Date, { orders?: number; revenue?: number }] | [string, Date, { orders?: number; revenue?: number }]
): Promise<void> {
  if (typeof args[0] !== "string") {
    const [scope, pageId, at, d] = args as [WriteScope, string, Date, { orders?: number; revenue?: number }];
    const day = dayKey(at, await storeTimeZone(scope));
    await bump(pageId, day, { orders: d.orders ?? 0, revenue: Math.round((d.revenue ?? 0) * 100) / 100 }, scope.storeId);
    return;
  }
  const [pageId, at, d] = args as [string, Date, { orders?: number; revenue?: number }];
  await bump(pageId, dayKey(at), { orders: d.orders ?? 0, revenue: Math.round((d.revenue ?? 0) * 100) / 100 });
}

/**
 * Housekeeping: unique-visitor markers are only needed for the current day (kept 2 days). Store days run in every
 * timezone, so the cutoff is counted from the earliest "today" on Earth (UTC−12): no store's current day is touched.
 */
export async function purgeVisitorMarkers(keepDays = 2): Promise<number> {
  const cutoff = dayKey(new Date(Date.now() - keepDays * 86_400_000), "Etc/GMT+12");
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
/** @deprecated single-tenant; T4 moves the dashboard and the console to the scoped overload */
export function getPageStats(range: { from: string; to: string }, opts?: { pageIds?: string[] }): Promise<PageStats>;
export async function getPageStats(
  ...args: [StoreScope, { from: string; to: string }, { pageIds?: string[] }?] | [{ from: string; to: string }, { pageIds?: string[] }?]
): Promise<PageStats> {
  // STAT-02: the scoped form never aggregates another store's rows (the days are the store's own calendar days)
  const scoped = "storeId" in args[0];
  const scope = scoped ? (args[0] as StoreScope) : null;
  const [range, opts = {}] = (scoped ? args.slice(1) : args) as [{ from: string; to: string }, { pageIds?: string[] }?];
  let { from, to } = range;
  if (!DAY_RE.test(from) || !DAY_RE.test(to)) throw new Error("invalid stats range");
  if (from > to) [from, to] = [to, from];
  if (addDays(from, 366) < to) from = addDays(to, -366);

  const where = and(
    scope ? eq(statsDaily.storeId, scope.storeId) : undefined,
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
      .leftJoin(pages, scope ? and(eq(pages.id, statsDaily.pageId), eq(pages.storeId, statsDaily.storeId)) : eq(pages.id, statsDaily.pageId))
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

/** Remove all analytics of a page of the scope's store (call when the page is deleted). */
export function deletePageStats(scope: WriteScope, pageId: string): Promise<void>;
/** @deprecated single-tenant; T4 moves the page deletion to the scoped overload */
export function deletePageStats(pageId: string): Promise<void>;
export async function deletePageStats(...args: [WriteScope, string] | [string]): Promise<void> {
  if (typeof args[0] !== "string") {
    const [scope, pageId] = args as [WriteScope, string];
    // the markers carry no store: they go only when the page's counters were the scope's (a page id is global)
    const [own] = await db
      .select({ pageId: pages.id })
      .from(pages)
      .where(and(eq(pages.storeId, scope.storeId), eq(pages.id, pageId)))
      .limit(1);
    await db.delete(statsDaily).where(and(eq(statsDaily.storeId, scope.storeId), eq(statsDaily.pageId, pageId)));
    if (own) await db.delete(statsVisitors).where(eq(statsVisitors.pageId, pageId));
    return;
  }
  const [pageId] = args as [string];
  await db.delete(statsVisitors).where(eq(statsVisitors.pageId, pageId));
  await db.delete(statsDaily).where(eq(statsDaily.pageId, pageId));
}
