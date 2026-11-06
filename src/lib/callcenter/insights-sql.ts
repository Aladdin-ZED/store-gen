import "server-only";
/**
 * Shared bits of the call centre's insight reads (P4 CALL CENTER; operations.md OPE-§14.3, §14.4, §27.1, §27.6, OD43):
 * the store's time zone, store-local day bounds, the honeypot predicate and the CASE that groups an instant into its
 * store-local day inside MariaDB (whose time-zone tables may be empty on Hostinger: the bounds are computed here with
 * the store's zone and passed as UTC parameters, so a DST or Ramadan shift never moves a row to the wrong day).
 */
import { isNull, or, sql, type SQL } from "drizzle-orm";
import type { AnyMySqlColumn } from "drizzle-orm/mysql-core";
import { orders } from "@/lib/db/schema";
import { getStoreById } from "@/lib/tenancy/public";
import type { StoreScope } from "@/lib/tenancy/types";
import { addDaysYmd, instantAt, storeYmd } from "./window";

export const DEFAULT_TZ = "Africa/Casablanca";
export const DAY_MS = 86_400_000;

/** honeypot rows never count (OPE-§10.2); the creation hook marks them in `flags` */
export const notHoneypot: SQL = or(isNull(orders.flags), sql`${orders.flags} NOT LIKE '%"honeypot"%'`)!;

export async function storeTz(scope: StoreScope): Promise<string> {
  return (await getStoreById(scope.storeId))?.timezone || DEFAULT_TZ;
}

/** One store-local day: [from, to) in UTC. */
export interface DayBound {
  ymd: string;
  from: Date;
  to: Date;
}

/** The store-local days fromYmd..toYmd (inclusive), each with its UTC bounds; `until` cuts the last one (today so far). */
export function dayBounds(tz: string, fromYmd: string, toYmd: string, until?: Date): DayBound[] {
  const out: DayBound[] = [];
  for (let ymd = fromYmd, i = 0; ymd <= toYmd && i < 400; ymd = addDaysYmd(ymd, 1), i++) {
    const from = instantAt(ymd, "00:00", tz);
    let to = instantAt(addDaysYmd(ymd, 1), "00:00", tz);
    if (until && until.getTime() < to.getTime()) to = until;
    if (to.getTime() > from.getTime()) out.push({ ymd, from, to });
  }
  return out;
}

/** The last `days` store-local days ending today (today cut at `now`), oldest first. */
export function trailingDays(tz: string, now: Date, days: number): DayBound[] {
  const today = storeYmd(now, tz);
  return dayBounds(tz, addDaysYmd(today, -(days - 1)), today, now);
}

/** `CASE WHEN col in day₁ THEN 'ymd₁' … END`: an instant's store-local day, NULL outside the bounds. */
export function dayCase(col: AnyMySqlColumn | SQL, days: readonly DayBound[]): SQL<string | null> {
  if (!days.length) return sql<string | null>`NULL`;
  return sql<string | null>`CASE ${sql.join(
    days.map((d) => sql`WHEN ${col} >= ${d.from} AND ${col} < ${d.to} THEN ${d.ymd}`),
    sql` `,
  )} ELSE NULL END`;
}

/** The UTC span of a list of days. */
export function spanOf(days: readonly DayBound[]): { from: Date; to: Date } {
  return { from: days[0]!.from, to: days[days.length - 1]!.to };
}
