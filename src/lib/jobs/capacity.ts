/**
 * Sheets capacity arithmetic (docs/STORE-SAAS.md §H.2 slot 1, §H.5; rev 3 ENGC-33; R1 P8). Pure: P5's Sheets screen
 * (OPE-§19.7, the honest capacity line), P1's console Sheets panel and P8's backlog alarm import it.
 *
 * The shared service account allows 50 calls per 60 s (`p:sheets:sa`, R-D24) and one store takes at most 3 calls per
 * tick (one read, one append, one batchUpdate; the read also serves the pull), so a tick serves floor(50 / 3) = 16
 * stores when every one has work: with n active Sheets stores, each is served every ceil(n / 16) ticks of 5 minutes.
 * The backlog alarm scales with that: max(15, 5 × ceil(n / 16)) minutes (PLA Q4.5).
 */

/** calls per 60 s on the shared service account (`p:sheets:sa`) */
export const SHEETS_SA_CALLS_PER_MIN = 50;
/** Sheets calls one store takes in one tick at most */
export const SHEETS_CALLS_PER_STORE = 3;
/** the cron period (minutes) */
export const TICK_MINUTES = 5;
/** the alarm never fires on a backlog younger than this (minutes) */
export const SHEETS_BACKLOG_FLOOR_MIN = 15;

export interface SheetsCapacity {
  /** stores one tick serves when every one has work (16) */
  storesPerTick: number;
  /** a store is served every this many ticks (0 with no active store) */
  everyTicks: number;
  /** the backlog age (minutes) past which the Sheets alarm fires */
  backlogAlarmMin: number;
}

/** The capacity figures for `activeSheetsStores` stores with Sheets bound and on (a bad count reads as 0). */
export function sheetsCapacity(activeSheetsStores: number): SheetsCapacity {
  const n = Number.isFinite(activeSheetsStores) ? Math.max(0, Math.floor(activeSheetsStores)) : 0;
  const storesPerTick = Math.floor(SHEETS_SA_CALLS_PER_MIN / SHEETS_CALLS_PER_STORE);
  const everyTicks = Math.ceil(n / storesPerTick);
  return { storesPerTick, everyTicks, backlogAlarmMin: Math.max(SHEETS_BACKLOG_FLOOR_MIN, TICK_MINUTES * everyTicks) };
}
