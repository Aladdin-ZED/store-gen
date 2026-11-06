/**
 * The shared calling-window fixture (P4 CALL CENTER; operations.md OPE-§5.5, rev 4 CRIT3, rev 5 CRIT2-1;
 * docs/STORE-SAAS.md §K.2 P0). Data only: stores × instants × the expected answers of the pure helpers of
 * `./window.ts`. `test:ops` (P4), landing's `test:delivery` and `test:landing-addons` (P3, the thank-you `{when}`)
 * and the storefront's `test:catalog` (S1, R2) read it, so the three fail together if the weekday convention drifts.
 *
 * Every expected value was worked out by hand from the rules (ISO weekday keys, 1 = Monday; a range whose end is
 * before its start crosses midnight and belongs to its start day; an override containing the day wins; a closed date
 * has no range), not printed by the code under test. Instants are UTC. Africa/Casablanca is UTC+1, and UTC+0 around
 * Ramadan: 2026-02-15 02:00Z → 2026-03-22 02:00Z and 2027-02-07 02:00Z → 2027-03-14 02:00Z.
 *
 * `hoursText` is rendered with `DATE_LOCALES[locale]`; `confirmHours` is the template variable's value
 * (`shopperPromiseAllowed(w) ? hoursText(…) : ""`, OPE-§7.1, OD63): empty while the owner never saved the window.
 */
import { DEFAULT_WINDOW, RAMADAN_PRESET } from "./defaults";
import type { EffectiveWindow, IsoWeekday, Range } from "./window";

type L3 = "fr" | "ar" | "en";

export interface WindowFixtureCase {
  name: string;
  window: EffectiveWindow;
  /** the instant evaluated (ISO, UTC) */
  at: string;
  expect: {
    open: boolean;
    /** isCallable(at, w).opensAt (null when open) */
    opensAt: string | null;
    nextCallableAt: string;
    /** shopperPromiseAllowed(w) */
    shopperPromise: boolean;
    /** hoursText(w, locale, DATE_LOCALES[locale], at) per locale */
    hoursText?: Partial<Record<L3, string>>;
    /** isoWeekday(at, w.tz) */
    isoWeekday?: IsoWeekday;
    /** the `confirm_hours` template variable: hoursText when the owner saved the window, else "" */
    confirmHours?: Partial<Record<L3, string>>;
  };
}

/** the `dateLocale` each fixture locale renders `hoursText` with (Moroccan stores; Latin digits) */
export const DATE_LOCALES: Readonly<Record<L3, string>> = { fr: "fr-MA", ar: "ar-MA", en: "en-GB" };

const TZ = "Africa/Casablanca";
/** A fresh store in Morocco: the starting hours, never saved by the owner. */
const fresh: EffectiveWindow = { tz: TZ, days: DEFAULT_WINDOW.days, closedDates: [], overrides: [], openOverrideUntil: null, configured: false };
/** The same hours, saved by the owner ("Use these hours"). */
const saved: EffectiveWindow = { ...fresh, configured: true };
const week = (r: Range[]): Record<IsoWeekday, Range[]> => ({ 1: r, 2: r, 3: r, 4: r, 5: r, 6: r, 7: r });
/** Ramadan 1448 hours typed by the owner over the weekly table (the preset's ranges, the owner's dates). */
const ramadan: EffectiveWindow = { ...saved, overrides: [{ label: "Ramadan", from: "2027-02-08", to: "2027-03-09", days: week(RAMADAN_PRESET) }] };
/** A Saturday-night line only: 20:00-02:00 belongs to Saturday. */
const nightOnly: EffectiveWindow = { ...saved, days: { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [{ from: "20:00", to: "02:00" }], 7: [] } };
const greenMarch: EffectiveWindow = { ...saved, closedDates: ["2026-11-06"] };
const closed14: EffectiveWindow = { ...saved, closedDates: Array.from({ length: 14 }, (_, i) => `2026-12-${String(i + 1).padStart(2, "0")}`) };
const openNow: EffectiveWindow = { ...fresh, openOverrideUntil: "2026-11-02T23:00:00.000Z" };

const hours = (latin: string): Record<L3, string> => ({ fr: latin, en: latin, ar: latin.replace(/, /g, "، ") });
const NONE: Record<L3, string> = { fr: "", ar: "", en: "" };
const WEEK = "09:30-13:00, 14:30-21:00";
const FRIDAY = "09:30-12:15, 14:30-21:00";
const RAMADAN = "10:00-16:00, 21:30-00:30";

const open = (at: string, h: string, shopperPromise = false) => ({ open: true, opensAt: null, nextCallableAt: at, shopperPromise, hoursText: hours(h), confirmHours: shopperPromise ? hours(h) : NONE });
const closed = (opensAt: string, h: string, shopperPromise = false) => ({
  open: false,
  opensAt,
  nextCallableAt: opensAt,
  shopperPromise,
  hoursText: h ? hours(h) : NONE,
  confirmHours: shopperPromise && h ? hours(h) : NONE,
});

export const WINDOW_FIXTURES: readonly WindowFixtureCase[] = [
  /* ---- the starting hours, never saved: the queue runs on them, no shopper is promised an hour (OD63) ---- */
  { name: "default · Monday 10:00 · inside the morning range", window: fresh, at: "2026-11-02T09:00:00.000Z", expect: { ...open("2026-11-02T09:00:00.000Z", WEEK), isoWeekday: 1 } },
  { name: "default · Thursday 12:20 · open (the week's mornings end at 13:00)", window: fresh, at: "2026-11-05T11:20:00.000Z", expect: open("2026-11-05T11:20:00.000Z", WEEK) },
  { name: "default · Friday 12:00 · open (key 5 is Friday)", window: fresh, at: "2026-11-06T11:00:00.000Z", expect: { ...open("2026-11-06T11:00:00.000Z", FRIDAY), isoWeekday: 5 } },
  { name: "default · Friday 12:20 · closed after 12:15, opens 14:30", window: fresh, at: "2026-11-06T11:20:00.000Z", expect: closed("2026-11-06T13:30:00.000Z", FRIDAY) },
  { name: "default · Thursday 13:30 · lunch break, opens 14:30", window: fresh, at: "2026-11-05T12:30:00.000Z", expect: closed("2026-11-05T13:30:00.000Z", WEEK) },
  { name: "default · Monday 21:00 · the end is exclusive, opens Tuesday 09:30", window: fresh, at: "2026-11-02T20:00:00.000Z", expect: closed("2026-11-03T08:30:00.000Z", WEEK) },
  { name: "default · Tuesday 07:00 · before the morning range", window: fresh, at: "2026-11-03T06:00:00.000Z", expect: { ...closed("2026-11-03T08:30:00.000Z", WEEK), isoWeekday: 2 } },
  { name: "default · Sunday 22:00 · opens Monday 09:30", window: fresh, at: "2026-11-08T21:00:00.000Z", expect: { ...closed("2026-11-09T08:30:00.000Z", WEEK), isoWeekday: 7 } },
  {
    name: "default · \"Open calls now\" until 23:00Z · Monday 22:30 is open, still no shopper promise",
    window: openNow,
    at: "2026-11-02T21:30:00.000Z",
    expect: open("2026-11-02T21:30:00.000Z", WEEK),
  },

  /* ---- saved by the owner: the same hours become a promise ---- */
  { name: "saved · Monday 10:00 · open, the shopper may be told the hours", window: saved, at: "2026-11-02T09:00:00.000Z", expect: open("2026-11-02T09:00:00.000Z", WEEK, true) },
  { name: "saved · Friday 13:00 · Friday's own ranges in the hours line", window: saved, at: "2026-11-06T12:00:00.000Z", expect: closed("2026-11-06T13:30:00.000Z", FRIDAY, true) },

  /* ---- isoWeekday and the window across the Africa/Casablanca offset changes ---- */
  {
    name: "offset · Saturday 23:30 UTC is Sunday 00:30 local (isoWeekday 7); the clocks go back at 02:00Z, so 09:30 is 09:30Z",
    window: fresh,
    at: "2026-02-14T23:30:00.000Z",
    expect: { ...closed("2026-02-15T09:30:00.000Z", WEEK), isoWeekday: 7 },
  },
  { name: "offset · Sunday 15 February 09:15Z is 09:15 local (UTC+0): closed until 09:30Z", window: fresh, at: "2026-02-15T09:15:00.000Z", expect: { ...closed("2026-02-15T09:30:00.000Z", WEEK), isoWeekday: 7 } },
  { name: "offset · Sunday 22 March 08:45Z is 09:45 local again (UTC+1): open", window: fresh, at: "2026-03-22T08:45:00.000Z", expect: { ...open("2026-03-22T08:45:00.000Z", WEEK), isoWeekday: 7 } },
  {
    name: "offset · Sunday 22 March 23:30 UTC is Monday 00:30 local (isoWeekday 1): opens Monday 09:30 = 08:30Z",
    window: fresh,
    at: "2026-03-22T23:30:00.000Z",
    expect: { ...closed("2026-03-23T08:30:00.000Z", WEEK), isoWeekday: 1 },
  },

  /* ---- a Ramadan override (UTC+0 throughout) with a range crossing midnight ---- */
  { name: "ramadan · Wednesday 23:00 · inside 21:30-00:30", window: ramadan, at: "2027-02-10T23:00:00.000Z", expect: { ...open("2027-02-10T23:00:00.000Z", RAMADAN, true), isoWeekday: 3 } },
  {
    name: "ramadan · Thursday 00:15 · still Wednesday's 21:30-00:30 (a crossing range belongs to its start day)",
    window: ramadan,
    at: "2027-02-11T00:15:00.000Z",
    expect: { ...open("2027-02-11T00:15:00.000Z", RAMADAN, true), isoWeekday: 4 },
  },
  { name: "ramadan · Thursday 00:45 · closed until 10:00", window: ramadan, at: "2027-02-11T00:45:00.000Z", expect: closed("2027-02-11T10:00:00.000Z", RAMADAN, true) },
  { name: "ramadan · Thursday 17:00 · between the ranges, opens 21:30", window: ramadan, at: "2027-02-11T17:00:00.000Z", expect: closed("2027-02-11T21:30:00.000Z", RAMADAN, true) },
  { name: "ramadan · the last day, Tuesday 23:59 · open (the override contains the day)", window: ramadan, at: "2027-03-09T23:59:00.000Z", expect: { ...open("2027-03-09T23:59:00.000Z", RAMADAN, true), isoWeekday: 2 } },
  {
    name: "ramadan · the day after, Wednesday 00:40 · back to the weekly table, opens 09:30 (still UTC+0)",
    window: ramadan,
    at: "2027-03-10T00:40:00.000Z",
    expect: { ...closed("2027-03-10T09:30:00.000Z", WEEK, true), isoWeekday: 3 },
  },

  /* ---- closed dates ---- */
  { name: "closed date · Friday 6 November 11:00 · closed all day, opens Saturday 09:30", window: greenMarch, at: "2026-11-06T10:00:00.000Z", expect: closed("2026-11-07T08:30:00.000Z", "", true) },
  { name: "closed date · Thursday 21:30 · the closed Friday is skipped", window: greenMarch, at: "2026-11-05T20:30:00.000Z", expect: closed("2026-11-07T08:30:00.000Z", WEEK, true) },
  { name: "closed 14 days · 1-14 December · opens Tuesday 15 December 09:30", window: closed14, at: "2026-12-01T10:00:00.000Z", expect: closed("2026-12-15T08:30:00.000Z", "", true) },

  /* ---- a weekly range crossing midnight ---- */
  { name: "night line · Saturday 20:30 · inside Saturday's 20:00-02:00", window: nightOnly, at: "2026-11-07T19:30:00.000Z", expect: { ...open("2026-11-07T19:30:00.000Z", "20:00-02:00", true), isoWeekday: 6 } },
  {
    name: "night line · Sunday 01:30 · open on Saturday's range; Sunday itself has no range (empty hours line)",
    window: nightOnly,
    at: "2026-11-08T00:30:00.000Z",
    expect: { open: true, opensAt: null, nextCallableAt: "2026-11-08T00:30:00.000Z", shopperPromise: true, hoursText: NONE, confirmHours: NONE, isoWeekday: 7 },
  },
  { name: "night line · Sunday 02:30 · closed until next Saturday 20:00", window: nightOnly, at: "2026-11-08T01:30:00.000Z", expect: closed("2026-11-14T19:00:00.000Z", "", true) },
];
