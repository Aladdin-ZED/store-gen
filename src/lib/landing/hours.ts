/**
 * The calling window as this part reads it (P3 LANDING; landing.md LAN-§2.3, LD29, §8.2; docs/STORE-SAAS.md D73,
 * OPE OD63). Pure and isomorphic; `reviveWindow` is bundled into `assist-ty` beside P4's `nextCallableAt`.
 *
 * Built only on operations' helpers (src/lib/callcenter/window.ts: `rangesForDay`, `nextCallableAt`,
 * `shopperPromiseAllowed`): this file never reads `w.days` by index or key, so the ISO weekday convention lives in one
 * file. "No hours" is `noShopperHours(w, now)` = the window has no callable range in the next 14 store days, or the
 * owner never saved it (`configured: false`, the starting hours are never a promise); every shopper-facing reader
 * then renders nothing, never a default sentence.
 */
import { addDays, localParts } from "@/lib/delivery/eta";
import { fill } from "@/lib/landing/copy";
import { isCallable, nextCallableAt, rangesForDay, shopperPromiseAllowed, type EffectiveWindow, type IsoWeekday, type Range } from "@/lib/callcenter/window";

const DAY_MS = 86_400_000;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const ISO_DAYS: readonly IsoWeekday[] = [1, 2, 3, 4, 5, 6, 7];
const weekdayOf = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  return (((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7) + 1) as IsoWeekday;
};
const usable = (r: Range) => HHMM.test(r.from) && HHMM.test(r.to) && r.from !== r.to;

/** No callable range in the next `horizonDays` store days (today included); true for a window that never opens. */
export function windowIsEmpty(w: EffectiveWindow, now: Date, horizonDays = 14): boolean {
  const today = localParts(now, w.tz)?.ymd;
  if (!today) return true;
  let at: Date;
  try {
    at = nextCallableAt(now, w);
  } catch {
    return true; // RangeError: no range within the search horizon of window.ts
  }
  const day = localParts(at, w.tz)?.ymd;
  return !day || day > addDays(today, horizonDays - 1);
}

/** The ONE "no hours" test of every shopper-facing reader (rev 5, CRIT2-1): empty, or never saved by the owner. */
export function noShopperHours(w: EffectiveWindow, now: Date): boolean {
  return !shopperPromiseAllowed(w) || windowIsEmpty(w, now);
}

/**
 * The week's hours, equal days grouped (LAN-§2.3): "lun.-jeu., sam., dim. 09:30-13:00, 14:30-21:00 · ven. 09:30-12:15,
 * 14:30-21:00", from `rangesForDay` over the next seven store days (so this week's closed dates and overrides count);
 * weekdays in ISO order, closed days left out, "" when every day is closed. Always renders (the admin's contact line
 * shows the starting hours too); shopper-facing callers use `shopperHoursText`.
 */
export function weekHoursText(w: EffectiveWindow, locale: "ar" | "fr" | "en", dateLocale: string, now: Date): string {
  void dateLocale; // times are HH:MM with Latin digits on every page (the money rule), weekday names in `locale`
  const today = localParts(now, w.tz)?.ymd;
  if (!today) return "";
  const sep = locale === "ar" ? "، " : ", ";
  const byDay = new Map<IsoWeekday, string>();
  for (let i = 0; i < 7; i++) {
    const ymd = addDays(today, i);
    const ranges = rangesForDay(ymd, w)
      .filter(usable)
      .sort((a, b) => a.from.localeCompare(b.from))
      .map((r) => `${r.from}-${r.to}`);
    if (ranges.length) byDay.set(weekdayOf(ymd), ranges.join(sep));
  }
  // 2026-11-01 is a Sunday, so 1 November + d is a day of ISO weekday d
  const name = (d: IsoWeekday) =>
    new Intl.DateTimeFormat(`${locale}-MA`, { weekday: "short", timeZone: "UTC" }).format(Date.UTC(2026, 10, 1 + d, 12));
  const groups = new Map<string, IsoWeekday[]>();
  for (const d of ISO_DAYS) {
    const text = byDay.get(d);
    if (text) groups.set(text, [...(groups.get(text) ?? []), d]);
  }
  const out: string[] = [];
  for (const [text, list] of groups) {
    // consecutive runs of three or more days read as "lun.-jeu."; shorter runs are listed
    const runs: IsoWeekday[][] = [];
    for (const d of list) {
      const last = runs.at(-1);
      if (last && last.at(-1)! + 1 === d) last.push(d);
      else runs.push([d]);
    }
    const days = runs.flatMap((r) => (r.length >= 3 ? [`${name(r[0]!)}-${name(r.at(-1)!)}`] : r.map(name))).join(sep);
    out.push(`${days} ${text}`);
  }
  return out.join(" · ");
}

/**
 * The window as a call-time promise may rest on it (`PromiseFacts.callWindow` of src/lib/policies, LAN-§6.3 rev 5):
 * `configured` = the owner saved the hours, `empty` = no callable range in the next 14 store days, `ranges` = the
 * distinct usable ranges of the next seven store days ("we call between 9 and 19" must fall inside one of them).
 */
export function promiseWindowOf(w: EffectiveWindow, now: Date): { configured: boolean; empty: boolean; ranges: Range[] } {
  const today = localParts(now, w.tz)?.ymd;
  const seen = new Map<string, Range>();
  if (today) {
    for (let i = 0; i < 7; i++) for (const r of rangesForDay(addDays(today, i), w)) if (usable(r)) seen.set(`${r.from}-${r.to}`, { from: r.from, to: r.to });
  }
  return { configured: shopperPromiseAllowed(w), empty: windowIsEmpty(w, now), ranges: [...seen.values()].sort((a, b) => a.from.localeCompare(b.from)) };
}

/** Steps of the callable-minutes count (`callableMinutesSince`). */
const CALLABLE_STEP_MIN = 10;

/**
 * The callable minutes of the window between `from` and `now`, counted up to `cap` (Store Health's
 * `landing:wa_intents_waiting`: "for over 2 calling hours", LAN-§23.7). Closed stretches are skipped in one jump
 * (`isCallable`'s next opening), so a long weekend costs one step; open time is counted in 10-minute steps.
 */
export function callableMinutesSince(from: Date, now: Date, w: EffectiveWindow, cap: number): number {
  let t = from.getTime();
  const end = now.getTime();
  let minutes = 0;
  for (let guard = 0; t < end && minutes < cap && guard < 2_000; guard++) {
    const c = isCallable(new Date(t), w);
    if (c.open) {
      const step = Math.min(CALLABLE_STEP_MIN * 60_000, end - t);
      minutes += step / 60_000;
      t += step;
    } else if (c.opensAt) {
      t = c.opensAt.getTime();
    } else {
      break;
    }
  }
  return Math.min(cap, Math.floor(minutes));
}

/** The hours line a shopper may read, or null (no hours: nothing is said, LAN-§2.3). */
export function shopperHoursText(w: EffectiveWindow, locale: "ar" | "fr" | "en", dateLocale: string, now: Date): string | null {
  if (noShopperHours(w, now)) return null;
  return weekHoursText(w, locale, dateLocale, now) || null;
}

/* ------------------------------------------------------------------ */
/* the window baked into a thank-you page (LAN-§8.2)                   */
/* ------------------------------------------------------------------ */

/** operations' `days` container, checked without reading it as a week: an object (not a list) of at most 7 entries */
const isDays = (v: unknown): v is Record<IsoWeekday, Range[]> => !!v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length <= 7;
const isYmd = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

/**
 * The `lp-assist-ty.expect.win` JSON back into an `EffectiveWindow` for `nextCallableAt`, or null when anything is
 * off (at most 4 overrides and 60 closed dates; `openOverrideUntil` is always null in a static page; an unsaved window
 * is never baked, so `configured` must be true). The `days` containers pass through as operations wrote them: a
 * missing day is closed for `rangesForDay`, and operations' scan skips a range that is not two HH:MM times (a day
 * that is not a list makes `nextCallableAt` throw, which `callWhen` answers with no `{when}`). Kept small: it ships
 * in the `assist-ty` chunk. A null window means no `{when}` is rendered.
 */
export function reviveWindow(json: unknown): EffectiveWindow | null {
  const o = (json || {}) as Partial<Record<keyof EffectiveWindow, unknown>>;
  const closed = o.closedDates || [];
  const overrides = (o.overrides || []) as EffectiveWindow["overrides"][number][];
  if (typeof o.tz !== "string" || !o.tz || o.configured !== true || !isDays(o.days)) return null;
  if (!Array.isArray(closed) || closed.length > 60 || !closed.every(isYmd) || !Array.isArray(overrides) || overrides.length > 4) return null;
  if (!overrides.every((ov) => ov && isYmd(ov.from) && isYmd(ov.to) && isDays(ov.days))) return null;
  return {
    tz: o.tz,
    days: o.days,
    closedDates: closed,
    overrides: overrides.map((ov) => ({ label: String(ov.label || ""), from: ov.from, to: ov.to, days: ov.days })),
    openOverrideUntil: null,
    configured: true,
  };
}

/* ------------------------------------------------------------------ */
/* the thank-you `{when}` (LAN-§8.3 step 3)                            */
/* ------------------------------------------------------------------ */

/**
 * The `{when}` words of the page language (`lp-assist-ty.expect.s`): `within` is already resolved on the server
 * ("dans les 2 heures" with `withinHours`, else "aujourd'hui"); the others carry `{time}` (and `{day}`).
 */
export interface WhenWords {
  within: string;
  laterToday: string;
  tomorrow: string;
  nextDay: string;
}

/** "09:30": the store-local wall time of `at`, 24 h with Latin digits on every page (the money rule). */
export function wallTime(at: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, hourCycle: "h23", hour: "2-digit", minute: "2-digit" }).format(at);
}

/**
 * When the store calls, in words, from the window the queue uses (`nextCallableAt`, operations' function, so the page
 * and the ladder agree by construction): open now → `within`; later today, tomorrow, another day of the next 7 → the
 * opening time ("demain à partir de 09:30", "jeudi à partir de 14:30"); no window, no opening, or an opening more than
 * 7 days away → null (the sentence is said without `{when}`). `locale` names the weekday ("ar", "fr", "en").
 */
export function callWhen(now: Date, w: EffectiveWindow | null, s: WhenWords, locale: string): string | null {
  if (!w) return null;
  let at: Date;
  try {
    at = nextCallableAt(now, w);
  } catch {
    return null; // no range within operations' search horizon
  }
  const ahead = at.getTime() - now.getTime();
  if (ahead <= 0) return s.within;
  const today = localParts(now, w.tz);
  const day = localParts(at, w.tz);
  if (ahead > 7 * DAY_MS || !today || !day) return null;
  const time = wallTime(at, w.tz);
  if (day.ymd === today.ymd) return fill(s.laterToday, { time });
  if (day.ymd === addDays(today.ymd, 1)) return fill(s.tomorrow, { time });
  return fill(s.nextDay, { day: new Intl.DateTimeFormat(`${locale}-MA`, { weekday: "long", timeZone: w.tz }).format(at), time });
}
