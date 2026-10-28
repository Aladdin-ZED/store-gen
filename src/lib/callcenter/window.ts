/**
 * The calling window (P4 CALL CENTER; operations.md OPE-§5.5, §2.9, OD57, OD63; docs/STORE-SAAS.md D73, §K.2 P0).
 * Pure, isomorphic and JSON-safe: `assist-ty` (P3) and the R2 store checkout (S1) bundle `nextCallableAt` by source
 * import, the queue and the AI guard call `isCallable`. Time-zone math uses `Intl.DateTimeFormat` only (no dependency).
 *
 * ONE window type: `days` is keyed by the ISO weekday NUMBER (1 = Monday … 7 = Sunday), the numbers of
 * `checkout.calendar.workdays`; JSON keys "1".."7" (CRIT3). A range whose `to` is before its `from` crosses midnight
 * and belongs to the day it starts. A dated override (`ops.windowOverrides`) replaces the weekly table on its days; a
 * closed date has no range that starts on it.
 *
 * Frozen at P0. `isoWeekday`, `rangesForDay`, `isCallable`, `nextCallableAt` and `shopperPromiseAllowed` are the spec's
 * rules implemented exactly. P4 filled `hoursText` and added `windowMinutesBetween` (the first-touch KPI, OD17),
 * `snapIntoWindow` (ladder results), `effectiveWindow` (the `ops` setting + the store time zone → the one type) and
 * the store-clock helpers `storeYmd`, `addDaysYmd`, `instantAt`. The shared cases are `./window.fixtures.ts`.
 */
import type { Locale } from "@/lib/page/schema";

export type Range = { from: string /* HH:MM, store tz */; to: string /* HH:MM; to < from = crosses midnight, belongs to the start day */ };
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export interface EffectiveWindow {
  /** stores.timezone */
  tz: string;
  /** { 1: [{ from: "09:30", to: "13:00" }, …], …, 7: […] } */
  days: Record<IsoWeekday, Range[]>;
  /** ISO dates, store tz */
  closedDates: readonly string[];
  /** ops.windowOverrides (≤ 4) */
  overrides: readonly { label: string; from: string; to: string; days: Record<IsoWeekday, Range[]> }[];
  /** ISO instant ("Open calls now") */
  openOverrideUntil: string | null;
  /** OD63: true once the owner saved the window (callingWindow.savedAt ≠ null) */
  configured: boolean;
}
/** rev 4: the name landing.md re-exports; one type, two names, never two shapes */
export type CallingWindow = EffectiveWindow;

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
/** How far ahead an opening is searched (closed dates and overrides can close a window for months). */
const HORIZON_DAYS = 400;
const DAY_MS = 86_400_000;

/* ------------------------------------------------------------------ */
/* store-local clock                                                   */
/* ------------------------------------------------------------------ */

/** one formatter per time zone in use (a window has one); a single slot, rebuilt when the zone changes */
let clock: { tz: string; fmt: Intl.DateTimeFormat } | null = null;

function formatter(tz: string): Intl.DateTimeFormat {
  if (clock?.tz !== tz) {
    clock = { tz, fmt: new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }) };
  }
  return clock.fmt;
}

/** The wall clock of instant `at` (ms) in `tz`: year, month, day, hour, minute, second. */
function wall(at: number, tz: string): [number, number, number, number, number, number] {
  const out: Record<string, number> = {};
  for (const p of formatter(tz).formatToParts(new Date(at))) if (p.type !== "literal") out[p.type] = Number(p.value);
  return [out.year ?? 0, out.month ?? 0, out.day ?? 0, (out.hour ?? 0) % 24, out.minute ?? 0, out.second ?? 0];
}

const pad = (n: number) => String(n).padStart(2, "0");
const ymdOf = (at: number, tz: string) => {
  const [y, m, d] = wall(at, tz);
  return `${y}-${pad(m)}-${pad(d)}`;
};

/** `ymd` plus `n` calendar days. */
function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d) + n * DAY_MS);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** The ISO weekday of a calendar date (1 = Monday). */
function weekdayOfYmd(ymd: string): IsoWeekday {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  return (((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7) + 1) as IsoWeekday;
}

/** The instant (ms) at which the wall clock of `tz` reads `hhmm` on `ymd` (the later offset when a shift skips it). */
function instantOf(ymd: string, hhmm: string, tz: string): number {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  const [h, mi] = hhmm.split(":").map(Number) as [number, number];
  const local = Date.UTC(y, m - 1, d, h, mi);
  const offsetAt = (at: number) => {
    const [wy, wm, wd, wh, wmi, ws] = wall(at, tz);
    return Date.UTC(wy, wm - 1, wd, wh, wmi, ws) - (at - (((at % 1000) + 1000) % 1000));
  };
  const guess = local - offsetAt(local);
  return local - offsetAt(guess);
}

/* ------------------------------------------------------------------ */
/* the window                                                          */
/* ------------------------------------------------------------------ */

/** The ISO weekday of `d` in `tz`: (Intl weekday index + 6) % 7 + 1. */
export function isoWeekday(d: Date, tz: string): IsoWeekday {
  return weekdayOfYmd(ymdOf(d.getTime(), tz));
}

/**
 * The ranges that start on the store-local day `ymd` (YYYY-MM-DD): none on a closed date; else the override whose
 * [from, to] contains the day; else the weekly table.
 */
export function rangesForDay(ymd: string, w: EffectiveWindow): Range[] {
  if (w.closedDates.includes(ymd)) return [];
  const table = w.overrides.find((o) => o.from <= ymd && ymd <= o.to)?.days ?? w.days;
  return [...(table[weekdayOfYmd(ymd)] ?? [])];
}

/** Open now, or the start of the next range (null when no range opens within the search horizon). */
function scan(t: number, w: EffectiveWindow): { open: true } | { open: false; at: number | null } {
  const today = ymdOf(t, w.tz);
  // from yesterday: a range crossing midnight belongs to the day it starts
  for (let i = -1; i <= HORIZON_DAYS; i++) {
    const day = addDays(today, i);
    for (const r of validRanges(day, w)) {
      const [start, end] = boundsOf(day, r, w.tz);
      if (t >= start && t < end) return { open: true };
      if (start > t) return { open: false, at: start };
    }
  }
  return { open: false, at: null };
}

const overrideOpen = (t: number, w: EffectiveWindow) => {
  const until = w.openOverrideUntil ? Date.parse(w.openOverrideUntil) : NaN;
  return Number.isFinite(until) && t < until;
};

/** Open inside a range or while "Open calls now" lasts; else when the window opens next (null: not within 400 days). */
export function isCallable(now: Date, w: EffectiveWindow): { open: true } | { open: false; opensAt: Date | null } {
  const t = now.getTime();
  if (overrideOpen(t, w)) return { open: true };
  const s = scan(t, w);
  return s.open ? s : { open: false, opensAt: s.at === null ? null : new Date(s.at) };
}

/**
 * `t` itself when open, else the start of the next range. A window with no range in the next 400 days has no next
 * callable time: this throws a RangeError (`isCallable` answers `opensAt: null` for the same window).
 */
export function nextCallableAt(t: Date, w: EffectiveWindow): Date {
  const at = t.getTime();
  if (overrideOpen(at, w)) return t;
  const s = scan(at, w);
  if (s.open) return t;
  if (s.at === null) throw new RangeError("calling window: no callable time within 400 days");
  return new Date(s.at);
}

/** a store-local day's valid ranges, in order */
function validRanges(ymd: string, w: EffectiveWindow): Range[] {
  return rangesForDay(ymd, w)
    .filter((r) => HHMM.test(r.from) && HHMM.test(r.to) && r.from !== r.to)
    .sort((a, b) => a.from.localeCompare(b.from));
}

/** [start, end) of a range that starts on `ymd` (the end on the next day when it crosses midnight) */
const boundsOf = (ymd: string, r: Range, tz: string): [number, number] => [instantOf(ymd, r.from, tz), instantOf(r.to < r.from ? addDays(ymd, 1) : ymd, r.to, tz)];

/**
 * `t` when the window is open at `t`, else the start of the next range; never throws (a ladder always needs a due
 * time): a window with no range in the next 400 days leaves `t` unchanged, and the queue's `outside_window` answers it.
 */
export function snapIntoWindow(t: Date, w: EffectiveWindow): Date {
  const at = t.getTime();
  if (overrideOpen(at, w)) return t;
  const s = scan(at, w);
  return s.open || s.at === null ? t : new Date(s.at);
}

/**
 * The minutes of [a, b) that fall inside the window's ranges (overrides and closed dates applied; "Open calls now"
 * is not counted): the first-touch KPI measures an agent in calling-window minutes, so a night order is not a slow
 * agent (OD17). Overlapping ranges count once; b ≤ a gives 0.
 */
export function windowMinutesBetween(a: Date, b: Date, w: EffectiveWindow): number {
  const t0 = a.getTime();
  const t1 = b.getTime();
  if (!(t1 > t0)) return 0;
  const parts: [number, number][] = [];
  const last = ymdOf(t1, w.tz);
  // from the day before a: a range crossing midnight belongs to the day it starts
  for (let day = addDays(ymdOf(t0, w.tz), -1), n = 0; day <= last && n <= HORIZON_DAYS * 4; day = addDays(day, 1), n++) {
    for (const r of validRanges(day, w)) {
      const [s, e] = boundsOf(day, r, w.tz);
      const lo = Math.max(s, t0);
      const hi = Math.min(e, t1);
      if (hi > lo) parts.push([lo, hi]);
    }
  }
  parts.sort((x, y) => x[0] - y[0]);
  let total = 0;
  let open = -Infinity;
  let close = -Infinity;
  for (const [s, e] of parts) {
    if (s > close) {
      total += close - open > 0 ? close - open : 0;
      open = s;
      close = e;
    } else if (e > close) close = e;
  }
  total += close - open > 0 ? close - open : 0;
  return Math.floor(total / 60_000);
}

/** the separator between two ranges of one day: the Arabic comma in Arabic, ", " in every Latin-script locale */
const LIST_SEP: Partial<Record<Locale, string>> = { ar: "، " };

/** HH:MM with the digits of `dateLocale`'s numbering system (ar-MA keeps Latin digits; "ar" alone writes ٠-٩). */
function digitsOf(dateLocale: string): (s: string) => string {
  let map: string[] | null = null;
  try {
    const nf = new Intl.NumberFormat(dateLocale, { useGrouping: false });
    const d = Array.from({ length: 10 }, (_, i) => nf.format(i));
    if (d.some((x, i) => x !== String(i))) map = d;
  } catch {
    map = null;
  }
  return (s) => (map ? s.replace(/[0-9]/g, (c) => map![Number(c)]!) : s);
}

/**
 * Today's ranges in the store time zone, "09:30-13:00, 14:30-21:00" (overrides and closed dates applied; a range
 * crossing midnight reads "21:30-00:30"), for staff screens, the `confirm_hours` template variable and the tracking
 * help. Renders whether or not the owner saved the window (shopper-facing callers check `shopperPromiseAllowed`
 * first, OD63). A day without a range answers "" (so `confirm_hours`' optional block drops, OPE-§7.1).
 */
export function hoursText(w: EffectiveWindow, locale: Locale, dateLocale: string, now: Date): string {
  const digits = digitsOf(dateLocale);
  return validRanges(ymdOf(now.getTime(), w.tz), w)
    .map((r) => digits(`${r.from}-${r.to}`))
    .join(LIST_SEP[locale] ?? ", ");
}

/* ------------------------------------------------------------------ */
/* the ops setting → the one window type, and the store clock          */
/* ------------------------------------------------------------------ */

/** The fields of the `ops` setting a window is built from (src/lib/settings/keys/ops.ts `OpsSetting`). */
export interface OpsWindowFields {
  callingWindow: { days: Record<IsoWeekday, Range[]>; closedDates: readonly string[]; savedAt: string | null };
  windowOverrides: readonly { label: string; from: string; to: string; days: Record<IsoWeekday, Range[]> }[];
  openOverrideUntil: string | null;
}

/** The effective window of a store: its `ops` setting in its time zone; `configured` once the owner saved it (OD63). */
export function effectiveWindow(ops: OpsWindowFields, tz: string): EffectiveWindow {
  return {
    tz,
    days: ops.callingWindow.days,
    closedDates: ops.callingWindow.closedDates,
    overrides: ops.windowOverrides,
    openOverrideUntil: ops.openOverrideUntil,
    configured: ops.callingWindow.savedAt !== null,
  };
}

/** The store-local calendar date (YYYY-MM-DD) of `d` in `tz`. */
export function storeYmd(d: Date, tz: string): string {
  return ymdOf(d.getTime(), tz);
}

/** `ymd` plus `n` calendar days. */
export function addDaysYmd(ymd: string, n: number): string {
  return addDays(ymd, n);
}

/** The instant at which the clock of `tz` reads `hhmm` on `ymd` (a time a shift skips resolves to the later offset). */
export function instantAt(ymd: string, hhmm: string, tz: string): Date {
  return new Date(instantOf(ymd, hhmm, tz));
}

/** The store-local days whose table has at least one range (not closed), so a ladder's "next open day" can skip the rest. */
export function hasRanges(ymd: string, w: EffectiveWindow): boolean {
  return validRanges(ymd, w).length > 0;
}

/** OD63: a shopper is told an hour only when the owner saved the window once. */
export function shopperPromiseAllowed(w: EffectiveWindow): boolean {
  return w.configured;
}
