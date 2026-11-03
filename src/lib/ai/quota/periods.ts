/**
 * Store-time periods as UTC instants (P7 AI; ai.md AI-§C.1: credits are counted per month and day in the store's time
 * zone). Pure and isomorphic. `ai_runs.created_at` is UTC, the `store_usage` periods are local, so a sum of run rows for
 * "this month" needs the local month's bounds in UTC.
 *
 *   - `zoneOffsetMs(at, tz)`: the zone's offset from UTC at that instant (DST included);
 *   - `localMidnightUtc(y, m, d, tz)`: the UTC instant of 00:00 local on that date;
 *   - `periodRangeUtc(period, tz)`: `[start, end)` of a "YYYY-MM" or "YYYY-MM-DD" period.
 */

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DAY_RE = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** UTC offset of `tz` at `at`, in ms (Casablanca in winter → 0 or +3,600,000 depending on the year's rule). */
export function zoneOffsetMs(at: number, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(at));
  const get = (t: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return asUtc - Math.floor(at / 1000) * 1000;
}

/** The UTC instant of local midnight on y-m-d in `tz` (two passes: the offset can differ across a DST change). */
export function localMidnightUtc(y: number, m: number, d: number, tz: string): Date {
  const guess = Date.UTC(y, m - 1, d);
  const first = guess - zoneOffsetMs(guess, tz);
  return new Date(guess - zoneOffsetMs(first, tz));
}

/** `[start, end)` in UTC of a store-time "YYYY-MM" or "YYYY-MM-DD"; throws on any other shape. */
export function periodRangeUtc(period: string, tz: string): { start: Date; end: Date } {
  const m = MONTH_RE.exec(period);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    return { start: localMidnightUtc(y, mo, 1, tz), end: mo === 12 ? localMidnightUtc(y + 1, 1, 1, tz) : localMidnightUtc(y, mo + 1, 1, tz) };
  }
  const d = DAY_RE.exec(period);
  if (d) {
    const y = Number(d[1]);
    const mo = Number(d[2]);
    const day = Number(d[3]);
    const next = new Date(Date.UTC(y, mo - 1, day + 1));
    return { start: localMidnightUtc(y, mo, day, tz), end: localMidnightUtc(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), tz) };
  }
  throw new RangeError(`ai: bad period "${period.slice(0, 20)}"`);
}

export const isMonthPeriod = (v: string): boolean => MONTH_RE.test(v);
