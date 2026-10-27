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
 * rules implemented exactly; `hoursText` is a typed stub (its per-locale wording is P4's). P4 adds
 * `windowMinutesBetween` and `snapIntoWindow` here. The shared cases are `./window.fixtures.ts`.
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
    const ranges = rangesForDay(day, w)
      .filter((r) => HHMM.test(r.from) && HHMM.test(r.to) && r.from !== r.to)
      .sort((a, b) => a.from.localeCompare(b.from));
    for (const r of ranges) {
      const start = instantOf(day, r.from, w.tz);
      const end = instantOf(r.to < r.from ? addDays(day, 1) : day, r.to, w.tz);
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

/** "09:30-13:00, 14:30-21:00" for today's ranges; always renders (staff screens); shopper-facing callers check `shopperPromiseAllowed` first. */
export function hoursText(w: EffectiveWindow, locale: Locale, dateLocale: string, now: Date): string {
  void w;
  void locale;
  void dateLocale;
  void now;
  throw new Error("not implemented: P4 hoursText");
}

/** OD63: a shopper is told an hour only when the owner saved the window once. */
export function shopperPromiseAllowed(w: EffectiveWindow): boolean {
  return w.configured;
}
