/**
 * Delivery dates (P3 LANDING; landing.md LAN-§7.2, OPS-12; docs/STORE-SAAS.md §K.2 P0, rev 2.1 LAN N2). Pure and
 * isomorphic, bundled into the `assist` add-on: the shopper's browser computes the window at its own `now`. Time-zone
 * math uses `Intl.DateTimeFormat` only.
 *
 * Frozen at P0. `localParts`, `addWorkingDays` and `etaWindow` are LAN-§7.2 steps 1-3 implemented exactly (start day
 * with the cut-off, the confirmation lead, working days that skip non-working weekdays and holidays). `etaText` and
 * `etaWindowText` (the words, step 4 and 5) are typed stubs: P3 writes them with the `dz.*` copy of LAN-§24.2, and S1
 * reuses `etaWindowText` in R2 (STO-§15.8) instead of a second implementation.
 */
import type { EtaWindow, StoreCalendar } from "./types";

const DAY_MS = 86_400_000;
/** a calendar with no working day for ten years is a broken calendar, not a window */
const MAX_SCAN_DAYS = 3_660;

const pad = (n: number) => String(n).padStart(2, "0");

function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d) + n * DAY_MS);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

function isoWeekdayOf(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  return ((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7) + 1;
}

const isWorkingDay = (ymd: string, cal: StoreCalendar) => cal.workdays.includes(isoWeekdayOf(ymd)) && !cal.holidays.includes(ymd);

/** The store-local day, hour and ISO weekday of `now`; null when the runtime does not support the time zone. */
export function localParts(now: Date, tz: string): { ymd: string; hour: number; isoWeekday: number } | null {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit" }).formatToParts(now);
  } catch {
    return null;
  }
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value;
  const [y, m, d, h] = [get("year"), get("month"), get("day"), get("hour")];
  if (!y || !m || !d || !h) return null;
  const ymd = `${y}-${m}-${d}`;
  return { ymd, hour: Number(h) % 24, isoWeekday: isoWeekdayOf(ymd) };
}

/** `ymd` plus `n` working days (non-working weekdays and holidays skipped); `n = 0` returns `ymd`. */
export function addWorkingDays(ymd: string, n: number, cal: StoreCalendar): string {
  let day = ymd;
  for (let left = n, scanned = 0; left > 0; scanned++) {
    if (scanned > MAX_SCAN_DAYS) throw new RangeError("delivery calendar: no working day");
    day = addDays(day, 1);
    if (isWorkingDay(day, cal)) left--;
  }
  return day;
}

/**
 * The delivery window of a zone ordered at `now` (LAN-§7.2 steps 1-3): the start day is today when it is a working day
 * before the cut-off, else the next working day; then the confirmation lead (`cal.leadDays`); then `etaMinDays` and
 * `etaMaxDays` working days. Null when the time zone is unsupported.
 */
export function etaWindow(cal: StoreCalendar, zone: { etaMinDays: number; etaMaxDays: number }, now: Date): EtaWindow | null {
  const p = localParts(now, cal.tz);
  if (!p) return null;
  const today = isWorkingDay(p.ymd, cal) && (cal.cutoffHour === null || p.hour < cal.cutoffHour);
  const start = addWorkingDays(today ? p.ymd : addWorkingDays(p.ymd, 1, cal), cal.leadDays, cal);
  return {
    from: addWorkingDays(start, zone.etaMinDays, cal),
    to: addWorkingDays(start, zone.etaMaxDays, cal),
    minDays: zone.etaMinDays,
    maxDays: zone.etaMaxDays,
    leadDays: cal.leadDays,
  };
}

/** "le mer. 29 oct." / "entre … et …" / the day range beyond 21 days (LAN-§7.2 step 4), in `locale` with `dateLocale` digits. */
export function etaText(w: EtaWindow | null, zone: { etaMinDays: number; etaMaxDays: number }, locale: "ar" | "fr" | "en", dateLocale: string, now: Date): string {
  void w;
  void zone;
  void locale;
  void dateLocale;
  void now;
  throw new Error("not implemented: P3 etaText");
}

/** storefront's shape (STO-§15.8, STO-D17): one call = window + text; `from` / `to` are Dates at 12:00 UTC of the store-local day */
export function etaWindowText(
  zone: { etaMinDays: number; etaMaxDays: number },
  now: Date,
  cal: StoreCalendar,
  locale: "ar" | "fr" | "en",
  dateLocale?: string,
): { from: Date; to: Date; text: string } | null {
  void zone;
  void now;
  void cal;
  void locale;
  void dateLocale;
  throw new Error("not implemented: P3 etaWindowText");
}
