/**
 * The shared calling-window fixture (P4 CALL CENTER; operations.md OPE-§5.5, rev 4 CRIT3, rev 5 CRIT2-1;
 * docs/STORE-SAAS.md §K.2 P0). Data only: stores × instants × the expected answers of the pure helpers of
 * `./window.ts`. `test:ops` (P4), landing's `test:delivery` and `test:landing-addons` (P3, the thank-you `{when}`)
 * and the storefront's `test:catalog` (S1, R2) read it, so the three fail together if the weekday convention drifts.
 *
 * The P0 file carries the `DEFAULT_WINDOW` cases only (a fresh store: `configured: false`, so no shopper promise).
 * P4 adds the saved default window, a Ramadan override crossing midnight, closed dates, a window closed for 14 days and
 * each case's `hoursText` per locale. Instants are UTC; Africa/Casablanca is UTC+1 outside Ramadan.
 */
import { DEFAULT_WINDOW } from "./defaults";
import type { EffectiveWindow } from "./window";

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
    /** hoursText(w, locale, dateLocale, at) per locale (P4 fills it) */
    hoursText?: Partial<Record<"fr" | "ar" | "en", string>>;
  };
}

/** A fresh store in Morocco: the starting hours, never saved by the owner. */
const fresh: EffectiveWindow = { tz: "Africa/Casablanca", days: DEFAULT_WINDOW.days, closedDates: [], overrides: [], openOverrideUntil: null, configured: false };

const open = (at: string) => ({ open: true, opensAt: null, nextCallableAt: at, shopperPromise: false });
const closed = (opensAt: string) => ({ open: false, opensAt, nextCallableAt: opensAt, shopperPromise: false });

export const WINDOW_FIXTURES: readonly WindowFixtureCase[] = [
  { name: "default · Monday 10:00 · inside the morning range", window: fresh, at: "2026-11-02T09:00:00.000Z", expect: open("2026-11-02T09:00:00.000Z") },
  { name: "default · Thursday 12:20 · open (the week's mornings end at 13:00)", window: fresh, at: "2026-11-05T11:20:00.000Z", expect: open("2026-11-05T11:20:00.000Z") },
  { name: "default · Friday 12:00 · open (key 5 is Friday)", window: fresh, at: "2026-11-06T11:00:00.000Z", expect: open("2026-11-06T11:00:00.000Z") },
  { name: "default · Friday 12:20 · closed after 12:15, opens 14:30", window: fresh, at: "2026-11-06T11:20:00.000Z", expect: closed("2026-11-06T13:30:00.000Z") },
  { name: "default · Thursday 13:30 · lunch break, opens 14:30", window: fresh, at: "2026-11-05T12:30:00.000Z", expect: closed("2026-11-05T13:30:00.000Z") },
  { name: "default · Monday 21:00 · the end is exclusive, opens Tuesday 09:30", window: fresh, at: "2026-11-02T20:00:00.000Z", expect: closed("2026-11-03T08:30:00.000Z") },
  { name: "default · Tuesday 07:00 · before the morning range", window: fresh, at: "2026-11-03T06:00:00.000Z", expect: closed("2026-11-03T08:30:00.000Z") },
  { name: "default · Sunday 22:00 · opens Monday 09:30", window: fresh, at: "2026-11-08T21:00:00.000Z", expect: closed("2026-11-09T08:30:00.000Z") },
];
