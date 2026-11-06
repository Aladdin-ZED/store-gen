/**
 * The retry ladder (P4 CALL CENTER; operations.md OPE-§6.2, §6.3, §6.1a, OD8, OD10, OD48). Pure and isomorphic: the
 * outcome of an unanswered call asks it when the order is due again, in the same transaction (no job moves an order,
 * OD8). Every result goes through `snapIntoWindow` and skips closed dates; the clock is the store's time zone
 * (Intl only, through ./window.ts), so a ladder computed across the Africa/Casablanca offset changes lands on the
 * wall-clock hour the step names.
 *
 *   ladderNext       attempt n (1-based, this one included) → the due time of attempt n + 1, or "exhausted"
 *   keepOpenNext     policy keep_open after the ladder: one try a day at the last step's hour for keepOpenDays (§6.3)
 *   nextDue          the two together, as the outcome uses them
 *   rescueNext       the delivery lane's no-answer: retryMinutes, then the next open day 11:00, then exhausted (§6.1a)
 */
import type { OpsSetting } from "@/lib/settings/keys/ops";
import { LADDER_AT_MIN_GAP_MINUTES, OPS_DEFAULTS, type LadderStep } from "./defaults";
import { addDaysYmd, effectiveWindow, hasRanges, instantAt, snapIntoWindow, storeYmd, type EffectiveWindow } from "./window";

export type { LadderStep } from "./defaults";

/** The fields of the `ops` setting the ladder reads (the window, the steps and the exhaustion policy). */
export type LadderOps = Pick<OpsSetting, "callingWindow" | "windowOverrides" | "openOverrideUntil" | "ladder">;
const MINUTE = 60_000;
/** how far ahead a "next open day" is searched (a window closed for months still answers) */
const SEARCH_DAYS = 400;

/** The first store-local day after `ymd` with at least one range (a closed date or an empty weekday is skipped). */
function nextOpenDay(ymd: string, w: EffectiveWindow): string {
  for (let i = 1; i <= SEARCH_DAYS; i++) {
    const d = addDaysYmd(ymd, i);
    if (hasRanges(d, w)) return d;
  }
  return addDaysYmd(ymd, 1);
}

function stepTime(step: LadderStep, now: Date, w: EffectiveWindow): Date {
  switch (step.kind) {
    case "after":
      return new Date(now.getTime() + step.minutes * MINUTE);
    case "at": {
      // the next HH:MM at least minGap after now (today, else a later day; the snap skips a closed one)
      const earliest = now.getTime() + (step.minGapMinutes ?? LADDER_AT_MIN_GAP_MINUTES) * MINUTE;
      let day = storeYmd(now, w.tz);
      for (let i = 0; i < 3; i++, day = addDaysYmd(day, 1)) {
        const t = instantAt(day, step.time, w.tz);
        if (t.getTime() >= earliest) return t;
      }
      return instantAt(day, step.time, w.tz);
    }
    case "next_day_at":
      return instantAt(nextOpenDay(storeYmd(now, w.tz), w), step.time, w.tz);
  }
}

/**
 * The due time after attempt number `attemptsAfterThis` (1 = the first call): step `attemptsAfterThis` of the
 * ladder, snapped into the window. After the last step the ladder is "exhausted" (attempt ladder.length + 1 was the
 * last, OPE-§6.3); the caller applies the store's `unreachable` policy.
 */
export function ladderNext(attemptsAfterThis: number, now: Date, ops: LadderOps, tz: string): Date | "exhausted" {
  const n = Math.max(1, Math.trunc(attemptsAfterThis));
  const step = ops.ladder[n - 1];
  if (!step) return "exhausted";
  const w = effectiveWindow(ops, tz);
  return snapIntoWindow(stepTime(step, now, w), w);
}

/**
 * Policy `keep_open` (OPE-§6.3): after the ladder, one attempt a day at the last step's hour (the next open day's
 * opening when that step names no hour) until `keepOpenDays` after the first attempt; then "exhausted" (the caller
 * closes the order as unreachable).
 */
export function keepOpenNext(firstAttemptAt: Date, now: Date, ops: LadderOps & Pick<OpsSetting, "keepOpenDays">, tz: string): Date | "exhausted" {
  const w = effectiveWindow(ops, tz);
  const last = ops.ladder[ops.ladder.length - 1];
  const day = nextOpenDay(storeYmd(now, tz), w);
  const at = last && last.kind !== "after" ? instantAt(day, last.time, tz) : instantAt(day, "00:00", tz);
  const due = snapIntoWindow(at, w);
  const deadline = firstAttemptAt.getTime() + ops.keepOpenDays * 86_400_000;
  return due.getTime() > deadline ? "exhausted" : due;
}

/**
 * The due time of an unanswered confirm-lane order after attempt `attemptsAfterThis`: the ladder, then the store's
 * policy (`close` → "exhausted"; `keep_open` → `keepOpenNext`).
 */
export function nextDue(
  attemptsAfterThis: number,
  firstAttemptAt: Date,
  now: Date,
  ops: LadderOps & Pick<OpsSetting, "keepOpenDays" | "unreachable">,
  tz: string,
): Date | "exhausted" {
  const next = ladderNext(attemptsAfterThis, now, ops, tz);
  if (next !== "exhausted" || ops.unreachable === "close") return next;
  return keepOpenNext(firstAttemptAt, now, ops, tz);
}

/**
 * The delivery lane's retry after a no-answer or busy rescue call (OPE-§6.1a): the first → now + `rescue.retryMinutes`
 * snapped into the window; the second → the next open day 11:00; once `rescue.maxCalls` calls were made → "exhausted"
 * (the order leaves the lane, event meta `rescue_exhausted`). `rescueCallsAfterThis` counts this call.
 */
export function rescueNext(rescueCallsAfterThis: number, noAnswersInARow: number, now: Date, ops: LadderOps & Pick<OpsSetting, "rescue">, tz: string): Date | "exhausted" {
  if (rescueCallsAfterThis >= ops.rescue.maxCalls) return "exhausted";
  const w = effectiveWindow(ops, tz);
  if (noAnswersInARow <= 1) return snapIntoWindow(new Date(now.getTime() + ops.rescue.retryMinutes * MINUTE), w);
  return snapIntoWindow(instantAt(nextOpenDay(storeYmd(now, tz), w), OPS_DEFAULTS.rescueNextDayTime, tz), w);
}
