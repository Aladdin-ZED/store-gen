/**
 * Calendar-day helpers in a store's time zone, shared by the dashboard and the order filters so "today" means the
 * merchant's today, not UTC's. Callers pass `stores.timezone` (ADM-23); STATS_TZ (APP_TIMEZONE, Morocco by default)
 * is only the fallback when no store is at hand.
 */
import { dayKey, STATS_TZ } from "@/lib/stats";

export { dayKey, STATS_TZ };

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Offset (ms) of `timeZone` from UTC at `at`. */
function zoneOffset(at: Date, timeZone: string): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(at)
      .map((x) => [x.type, x.value]),
  ) as Record<string, string>;
  const asUtc = Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour!, +p.minute!, +p.second!);
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** The UTC instant at which calendar day "YYYY-MM-DD" starts in `timeZone`. */
export function dayStart(day: string, timeZone = STATS_TZ): Date {
  if (!DAY_RE.test(day)) throw new Error("invalid day");
  const midnightUtc = Date.parse(`${day}T00:00:00Z`);
  const first = midnightUtc - zoneOffset(new Date(midnightUtc), timeZone);
  // DST: the offset at the real instant can differ from the one at UTC midnight
  const second = midnightUtc - zoneOffset(new Date(first), timeZone);
  return new Date(second);
}

/** "YYYY-MM-DD" shifted by `n` calendar days. */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function isDay(value: unknown): value is string {
  return typeof value === "string" && DAY_RE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}
