/**
 * The console's time and number helpers (P4 CALL CENTER; operations.md OPE-§6.5, §13.1, §13.5, OD49). Pure and
 * isomorphic: every instant is computed in the store's time zone through src/lib/callcenter/window.ts, every number
 * is rendered with Latin digits (the per-user digit toggle is R3, OPE-§13.5), and `test:ops` checks the chips.
 *
 *   callbackChips(now, w)     In 1 hour · This evening 18:30 · Tomorrow 11:00 · Tomorrow 18:30, each marked when it
 *                             falls outside the calling window (OPE-§6.5: a mark, never a refusal)
 *   holdChips(now, tz)        Tomorrow · Next Monday · 1st of next month (store-local dates, OD49)
 *   customInstant(v, tz)      a `datetime-local` value read as the store's wall clock
 */
import { formatMoney } from "@/lib/markets/money";
import type { AdminLocale } from "@/lib/i18n/admin";
import { addDaysYmd, instantAt, isCallable, isoWeekday, storeYmd, type EffectiveWindow } from "@/lib/callcenter/window";

const MINUTE = 60_000;
/** the server's callback horizon (outcomes.ts): ≥ 5 minutes ahead, ≤ 30 days */
export const CALLBACK_MIN_MS = 5 * MINUTE;
export const CALLBACK_MAX_MS = 30 * 86_400_000;
/** OD49: a hold within the next 60 days */
export const HOLD_MAX_DAYS = 60;

export type CallbackChipId = "inOneHour" | "thisEvening" | "tomorrow11" | "tomorrow1830";
export interface CallbackChip {
  id: CallbackChipId;
  at: Date;
  outside: boolean;
}

/** The callback picker's chips (see the header); "This evening" only while 18:30 is still ahead. */
export function callbackChips(now: Date, w: EffectiveWindow): CallbackChip[] {
  const today = storeYmd(now, w.tz);
  const tomorrow = addDaysYmd(today, 1);
  const raw: { id: CallbackChipId; at: Date }[] = [
    { id: "inOneHour", at: new Date(now.getTime() + 60 * MINUTE) },
    { id: "thisEvening", at: instantAt(today, "18:30", w.tz) },
    { id: "tomorrow11", at: instantAt(tomorrow, "11:00", w.tz) },
    { id: "tomorrow1830", at: instantAt(tomorrow, "18:30", w.tz) },
  ];
  return raw.filter((c) => c.at.getTime() - now.getTime() >= CALLBACK_MIN_MS).map((c) => ({ ...c, outside: !isCallable(c.at, w).open }));
}

/** A `datetime-local` value ("2026-11-06T18:30") as the store's wall clock; null when malformed or outside the horizon. */
export function customInstant(value: string, tz: string, now: Date): Date | null {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(value);
  if (!m) return null;
  const at = instantAt(m[1]!, m[2]!, tz);
  const d = at.getTime() - now.getTime();
  return Number.isFinite(d) && d >= CALLBACK_MIN_MS && d <= CALLBACK_MAX_MS ? at : null;
}

export type HoldChipId = "tomorrow" | "nextMonday" | "firstOfNextMonth";
export interface HoldChip {
  id: HoldChipId;
  ymd: string;
}

/** The hold / reschedule chips (store-local dates, OD49). */
export function holdChips(now: Date, tz: string): HoldChip[] {
  const today = storeYmd(now, tz);
  const wd = isoWeekday(now, tz);
  const [y, m] = today.split("-").map(Number) as [number, number];
  const first = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const chips: HoldChip[] = [
    { id: "tomorrow", ymd: addDaysYmd(today, 1) },
    { id: "nextMonday", ymd: addDaysYmd(today, 8 - wd) },
    { id: "firstOfNextMonth", ymd: first },
  ];
  // a 1st that is tomorrow or next Monday is offered once
  return chips.filter((c, i) => chips.findIndex((o) => o.ymd === c.ymd) === i);
}

/** A typed hold date within the next 60 store-local days, or null. */
export function holdYmdOk(ymd: string, now: Date, tz: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false;
  const today = storeYmd(now, tz);
  return ymd > today && ymd <= addDaysYmd(today, HOLD_MAX_DAYS);
}

/** The `min` / `max` of the custom pickers, as the store's wall clock. */
export function storeLocalInput(d: Date, tz: string): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/* ------------------------------------------------------------------ */
/* formatting (Latin digits, the store's time zone)                    */
/* ------------------------------------------------------------------ */

const latn = (locale: AdminLocale): string => `${locale === "ar" ? "ar-MA" : locale === "fr" ? "fr-FR" : "en-GB"}-u-nu-latn`;

/** "18:30" */
export function clock(d: Date | string, tz: string, locale: AdminLocale): string {
  return new Intl.DateTimeFormat(latn(locale), { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(d));
}

/** "Fri 18:30" (today: "18:30") */
export function dayClock(d: Date | string, tz: string, locale: AdminLocale, now: Date): string {
  const at = new Date(d);
  if (storeYmd(at, tz) === storeYmd(now, tz)) return clock(at, tz, locale);
  const day = new Intl.DateTimeFormat(latn(locale), { timeZone: tz, weekday: "short", day: "numeric", month: "short" }).format(at);
  return `${day} ${clock(at, tz, locale)}`;
}

/** "Mon 10 Nov" of a store-local date */
export function ymdLabel(ymd: string, locale: AdminLocale): string {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  return new Intl.DateTimeFormat(latn(locale), { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}

/** "2 min ago" / "just now" */
export function ago(fromMs: number, nowMs: number, locale: AdminLocale): string {
  const min = Math.round((nowMs - fromMs) / MINUTE);
  const rtf = new Intl.RelativeTimeFormat(latn(locale), { numeric: "auto", style: "short" });
  if (Math.abs(min) < 60) return rtf.format(-min, "minute");
  const h = Math.round(min / 60);
  if (Math.abs(h) < 48) return rtf.format(-h, "hour");
  return rtf.format(-Math.round(h / 24), "day");
}

/** "in 2 h 05" style countdown text parts: hours and minutes left */
export function countdown(toMs: number, nowMs: number): { h: number; m: number } {
  const left = Math.max(0, Math.ceil((toMs - nowMs) / MINUTE));
  return { h: Math.floor(left / 60), m: left % 60 };
}

/** integer cents as money (OD35: cents in, the market's display out) */
export function money(cents: number, currency: string, locale: AdminLocale): string {
  return formatMoney(cents / 100, currency, locale);
}

/** basis points as a whole percentage ("42 %") */
export function pctBp(bp: number, locale: AdminLocale): string {
  return new Intl.NumberFormat(latn(locale), { style: "percent", maximumFractionDigits: 0 }).format(bp / 10_000);
}

/** a 0-1 share as a whole percentage */
export function pct(share: number, locale: AdminLocale): string {
  return new Intl.NumberFormat(latn(locale), { style: "percent", maximumFractionDigits: 0 }).format(share);
}

export function num(n: number, locale: AdminLocale): string {
  return new Intl.NumberFormat(latn(locale)).format(n);
}
