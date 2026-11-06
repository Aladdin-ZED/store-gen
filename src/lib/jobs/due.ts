/**
 * When a registered job is due (docs/STORE-SAAS.md §H.2; R1 P8). Pure: the runner passes the clock and the zone, and
 * test:jobs drives it with a fake clock.
 *
 * - `tick`: every tick; nothing is stored.
 * - `hourly`: once per UTC hour (`state.lastHour` = "YYYY-MM-DDTHH"); hours are elapsed time, so a DST change in the
 *   platform zone never skips or doubles one.
 * - `{ dailyAt: "HH:MM" }`: in the platform time zone (APP_TIMEZONE, the same default as src/lib/db/boot-config.ts and
 *   the stats day: Africa/Casablanca), once per local day from HH:MM on (`state.lastDay` = "YYYY-MM-DD"). A tick
 *   missed at HH:MM (server down, cron late) catches up at the next tick of the same local day; a day whose HH:MM
 *   falls in a DST gap runs at the first tick after the gap; a repeated hour never runs it twice.
 *
 * A period is marked done when the job returns `done: true`. `done: false` (work left) keeps it due, so a nightly job
 * resumes at the next tick. A job that throws is retried at the next tick, at most 3 times per period, then the period
 * is given up (the failures are in job_runs and the error ring), so a broken job never runs every 5 minutes all day.
 *
 * The state is the `due` object of the job's own `cron_cursors.state` (src/lib/jobs/runs.ts merges it in, the job's
 * other state keys untouched).
 */
import type { Job } from "./runner";
import { dailyMinutes } from "./slots";

/** The platform zone when APP_TIMEZONE is unset or unknown (SET-08). */
export const DEFAULT_PLATFORM_TZ = "Africa/Casablanca";
/** failed runs of one period before the period is given up */
export const MAX_FAILS_PER_PERIOD = 3;

export interface DueState {
  /** "YYYY-MM-DDTHH" (UTC) of the last hour an hourly job finished */
  lastHour?: string | null;
  /** "YYYY-MM-DD" (platform zone) of the last day a daily job finished */
  lastDay?: string | null;
  /** failed runs in `failKey`'s period */
  fails?: number | null;
  failKey?: string | null;
}

export type RunOutcome = "done" | "partial" | "failed";

/** APP_TIMEZONE when this runtime knows the zone, else Africa/Casablanca. */
export function platformTimeZone(raw: string | undefined = process.env.APP_TIMEZONE): string {
  const tz = raw?.trim();
  if (!tz) return DEFAULT_PLATFORM_TZ;
  try {
    return new Intl.DateTimeFormat("en", { timeZone: tz }).resolvedOptions().timeZone;
  } catch {
    return DEFAULT_PLATFORM_TZ;
  }
}

/** "YYYY-MM-DDTHH" in UTC. */
export function hourKey(at: number): string {
  return new Date(at).toISOString().slice(0, 13);
}

/** The local day ("YYYY-MM-DD") and minutes after local midnight of `at` in `tz`. */
export function localClock(at: number, tz: string): { day: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(at));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "00";
  return { day: `${get("year")}-${get("month")}-${get("day")}`, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

type Every = Job["every"];

/** The period a run at `at` belongs to: its key and the state field that records it; null for tick jobs and a bad `every`. */
function periodOf(every: Every, at: number, tz: string): { field: "lastHour" | "lastDay"; key: string; started: boolean } | null {
  if (every === "hourly") return { field: "lastHour", key: hourKey(at), started: true };
  if (typeof every === "object" && every !== null) {
    const min = dailyMinutes(every.dailyAt);
    if (min === null) return null;
    const local = localClock(at, tz);
    return { field: "lastDay", key: local.day, started: local.minutes >= min };
  }
  return null;
}

/** Whether a job with `every` and `state` is due at `at`. A bad `every` is never due. */
export function isDue(every: Every, state: DueState | null | undefined, at: number, tz: string): boolean {
  if (every === "tick") return true;
  const p = periodOf(every, at, tz);
  if (!p || !p.started) return false;
  return (state?.[p.field] ?? null) !== p.key;
}

/**
 * The state to store after a run that started at `startedAt`, or null when nothing changes (tick jobs). Every field is
 * written (null clears it), so the stored object never keeps a stale key.
 */
export function afterRun(every: Every, state: DueState | null | undefined, startedAt: number, tz: string, outcome: RunOutcome): Required<DueState> | null {
  const p = periodOf(every, startedAt, tz);
  if (!p) return null;
  const next: Required<DueState> = { lastHour: state?.lastHour ?? null, lastDay: state?.lastDay ?? null, fails: null, failKey: null };
  if (outcome === "done") next[p.field] = p.key;
  else if (outcome === "failed") {
    const fails = (state?.failKey === p.key ? (state.fails ?? 0) : 0) + 1;
    if (fails >= MAX_FAILS_PER_PERIOD) next[p.field] = p.key;
    else {
      next.fails = fails;
      next.failKey = p.key;
    }
  }
  return next;
}
