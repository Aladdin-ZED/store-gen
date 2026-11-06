/**
 * Delivery dates (P3 LANDING; landing.md LAN-§7.2, OPS-12; docs/STORE-SAAS.md §K.2 P0, rev 2.1 LAN N2). Pure and
 * isomorphic, bundled into the `assist` add-on: the shopper's browser computes the window at its own `now`. Time-zone
 * math uses `Intl.DateTimeFormat` only. Never imports src/lib/orders/address.ts (no add-on carries slug code, D68).
 *
 * Frozen at P0: `localParts`, `addWorkingDays` and `etaWindow` are LAN-§7.2 steps 1-3 (start day with the cut-off,
 * the confirmation lead, working days that skip non-working weekdays and holidays). P3 adds the words (steps 4 and
 * 5): `etaText`, `etaWindowText` (S1 reuses it in R2, STO-§15.8, so there is one implementation) and `etaParts`,
 * which the line composer (./line.ts) and `zoneLineFor` share so every surface prints the same dates.
 *
 * Text rules (step 4): one date when `from === to`, "entre {from} et {to}" otherwise, and the working-day range when
 * the window is unknown (`Intl` without the store's time zone) or ends more than 21 calendar days away. A date is the
 * short weekday, the day and the short month of its own language (`ar-MA` month names for Arabic, so Moroccan
 * readers see "غشت", "نونبر"), on `ymd` at 12:00 UTC so no time zone can shift it; the month is written once when
 * both dates share it. `dateLocale` (the page's money locale) decides the digits only: the money locale of an Arabic
 * page is `fr-FR` (Latin digits, src/lib/markets/money.ts), so formatting with it as LAN-§7.2 literally says would
 * print French month names on Arabic pages. Every date carries the marker "(estimation)" (step 5).
 */
import { DZ, fill, type DzCopy, type ShopperLocale } from "@/lib/landing/copy";
import { ETA_DATE_HORIZON_DAYS } from "@/lib/landing/limits";
import type { EtaWindow, StoreCalendar } from "./types";

const DAY_MS = 86_400_000;
/** a calendar with no working day for ten years is a broken calendar, not a window */
const MAX_SCAN_DAYS = 3_660;

/** The instant `hour`:00 UTC of the calendar day `ymd` (one parser for every date helper below: the chunk stays small). */
const utcOf = (ymd: string, hour = 0) => {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d, hour);
};

/** `ymd` plus `n` calendar days (the ISO string of the UTC date: "2026-11-03T…" cut to the day). */
export const addDays = (ymd: string, n: number): string => new Date(utcOf(ymd) + n * DAY_MS).toISOString().slice(0, 10);

const isoWeekdayOf = (ymd: string): number => ((new Date(utcOf(ymd)).getUTCDay() + 6) % 7) + 1;

const isWorkingDay = (ymd: string, cal: StoreCalendar) => cal.workdays.includes(isoWeekdayOf(ymd)) && !cal.holidays.includes(ymd);

/** The store-local day, hour and ISO weekday of `now`; null when the runtime does not support the time zone. */
export function localParts(now: Date, tz: string): { ymd: string; hour: number; isoWeekday: number } | null {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit" }).formatToParts(now);
  } catch {
    return null;
  }
  const v: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {};
  for (const p of parts) v[p.type] = p.value;
  const { year: y, month: m, day: d, hour: h } = v;
  if (!y || !m || !d || !h) return null;
  const ymd = `${y}-${m}-${d}`;
  return { ymd, hour: Number(h) % 24, isoWeekday: isoWeekdayOf(ymd) };
}

/** `ymd` plus `n` working days (non-working weekdays and holidays skipped); `n = 0` returns `ymd`. */
export function addWorkingDays(ymd: string, n: number, cal: StoreCalendar): string {
  let day = ymd;
  for (let left = n, scanned = 0; left > 0; scanned++) {
    if (scanned > MAX_SCAN_DAYS) throw new RangeError("no working day");
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

/* ------------------------------------------------------------------ */
/* words (LAN-§7.2 steps 4 and 5)                                      */
/* ------------------------------------------------------------------ */

/** `ymd` at 12:00 UTC: the instant whose UTC calendar day is `ymd` whatever the formatter's offset. */
const noonOf = (ymd: string) => utcOf(ymd, 12);

/** The digits a page uses, from its money locale ("fr-FR" → latn, "ar-EG" → arab); Latin when unknown. */
function digitsOf(dateLocale: string): string {
  try {
    return new Intl.NumberFormat(dateLocale).resolvedOptions().numberingSystem || "latn";
  } catch {
    return "latn";
  }
}

/** "jeu. 30 oct." · "الخميس 30 أكتوبر" · "Thu 30 Oct"; without the month when `month` is false. */
function dayLabel(ymd: string, locale: ShopperLocale, digits: string, month: boolean): string {
  const parts = new Intl.DateTimeFormat(`${locale}-MA`, {
    weekday: "short",
    day: "numeric",
    ...(month ? { month: "short" as const } : {}),
    timeZone: "UTC",
    numberingSystem: digits,
  }).formatToParts(noonOf(ymd));
  const v: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {};
  for (const p of parts) v[p.type] = p.value;
  return [v.weekday, v.day, month && v.month].filter(Boolean).join(" ");
}

/** The words a day range and a window need: one locale's `DzCopy`, or the `lp-assist` block's copy in the browser. */
export type EtaCopy = Pick<DzCopy, "range" | "within" | "exact" | "sameDay" | "between" | "on">;

/** The working-day phrase of a range: "en 1 à 3 jours ouvrés", "sous 2 jours ouvrés", "en 2 jours ouvrés", "le jour même". */
export function dayRangeText(min: number, max: number, locale: ShopperLocale): string {
  return dayRangeWords(DZ[locale], min, max);
}

/**
 * `dayRangeText` over a given copy: the `assist` add-on passes the page's words from its data block, so the chunk
 * never bundles the three languages (the `…Words` / `…With` variants below reference no `DZ`).
 */
export function dayRangeWords(c: EtaCopy, min: number, max: number): string {
  const lo = Math.max(0, Math.min(min, max));
  const hi = Math.max(0, min, max);
  const form = (forms: readonly [string, string, string], n: number) => fill(forms[n === 1 ? 0 : n === 2 ? 1 : 2], { n });
  if (hi === 0) return c.sameDay;
  if (lo === hi) return form(c.exact, hi);
  if (lo === 0) return form(c.within, hi);
  return fill(c.range, { min: lo, max: hi });
}

/**
 * The dates of a window as one phrase (no marker): `dated` is false when the phrase is the working-day range (the
 * window is unknown, or it ends more than 21 calendar days after `now`), so the marker and the "(estimation)" styling
 * follow only real dates.
 */
export function etaParts(
  w: EtaWindow | null,
  zone: { etaMinDays: number; etaMaxDays: number },
  locale: ShopperLocale,
  dateLocale: string,
  now: Date,
): { text: string; dated: boolean } {
  return etaPartsWith(DZ[locale], w, zone, locale, dateLocale, now);
}

/** `etaParts` over a given copy (`locale` still names the month and weekday language). */
export function etaPartsWith(
  c: EtaCopy,
  w: EtaWindow | null,
  zone: { etaMinDays: number; etaMaxDays: number },
  locale: ShopperLocale,
  dateLocale: string,
  now: Date,
): { text: string; dated: boolean } {
  if (!w || (noonOf(w.to) - now.getTime()) / DAY_MS > ETA_DATE_HORIZON_DAYS) {
    const lead = w ? w.leadDays : 0;
    return { text: dayRangeWords(c, zone.etaMinDays + lead, zone.etaMaxDays + lead), dated: false };
  }
  const digits = digitsOf(dateLocale);
  if (w.from === w.to) return { text: fill(c.on, { date: dayLabel(w.to, locale, digits, true) }), dated: true };
  const sameMonth = w.from.slice(0, 7) === w.to.slice(0, 7);
  return { text: fill(c.between, { from: dayLabel(w.from, locale, digits, !sameMonth), to: dayLabel(w.to, locale, digits, true) }), dated: true };
}

/**
 * "le mer. 29 oct. (estimation)" / "entre jeu. 30 et ven. 31 oct. (estimation)" / the day range ("en 1 à 3 jours
 * ouvrés", no marker: it is not a date), in `locale` with `dateLocale`'s digits.
 */
export function etaText(w: EtaWindow | null, zone: { etaMinDays: number; etaMaxDays: number }, locale: "ar" | "fr" | "en", dateLocale: string, now: Date): string {
  const p = etaParts(w, zone, locale, dateLocale, now);
  return p.dated ? `${p.text} ${DZ[locale].estimated}` : p.text;
}

/**
 * storefront's shape (STO-§15.8, STO-D17): one call = window + text; `from` / `to` are Dates at 12:00 UTC of the
 * store-local day. Null when the runtime does not support the store's time zone (the caller may still print
 * `etaText(null, zone, …)`, the day range).
 */
export function etaWindowText(
  zone: { etaMinDays: number; etaMaxDays: number },
  now: Date,
  cal: StoreCalendar,
  locale: "ar" | "fr" | "en",
  dateLocale?: string,
): { from: Date; to: Date; text: string } | null {
  const w = etaWindow(cal, zone, now);
  if (!w) return null;
  return { from: new Date(noonOf(w.from)), to: new Date(noonOf(w.to)), text: etaText(w, zone, locale, dateLocale ?? `${locale}-MA`, now) };
}
