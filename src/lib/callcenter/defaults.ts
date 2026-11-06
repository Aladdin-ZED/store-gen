/**
 * Call-centre defaults (P4 CALL CENTER; operations.md OPE-§2.9, §6.2, OD9, OD10, OD48, OD60, OD63; docs/STORE-SAAS.md
 * §K.2 P0). Pure data, isomorphic: the "starting hours" line of the hours editor, the ladder editor and the `ops`
 * setting schema (src/lib/settings/keys/ops.ts) read the same objects. Every value here is a reasoned starting value,
 * not researched: the store's own numbers replace them (the best-hours table, OD44; AI-23 in R3).
 */
import type { IsoWeekday, Range } from "./window";

const WORK: Range[] = [
  { from: "09:30", to: "13:00" },
  { from: "14:30", to: "21:00" },
];

/**
 * Reasoned starting value, not researched (OD9). The window a store calls in until the owner saves its own
 * (`ops.callingWindow`): Mon-Thu, Sat, Sun 09:30-13:00 + 14:30-21:00; Friday (key 5) 09:30-12:15 + 14:30-21:00.
 * `savedAt: null`: never confirmed by a person, so the queue uses it and no shopper is promised an hour from it (OD63).
 */
export const DEFAULT_WINDOW: { days: Record<IsoWeekday, Range[]>; closedDates: string[]; savedAt: string | null } = {
  days: { 1: WORK, 2: WORK, 3: WORK, 4: WORK, 5: [{ from: "09:30", to: "12:15" }, WORK[1]!], 6: WORK, 7: WORK },
  closedDates: [],
  savedAt: null,
};

/**
 * Reasoned starting value, not researched: the ranges the editor's "Ramadan hours" preset fills in (OPE-§5.5). The
 * owner types the dates; they are never pre-filled (movable dates, like LAN-§7.2's holidays).
 */
export const RAMADAN_PRESET: Range[] = [
  { from: "10:00", to: "16:00" },
  { from: "21:30", to: "00:30" },
];

/** One step of the retry ladder: the delay after an unanswered attempt (OPE-§6.2). */
export type LadderStep =
  | { kind: "after"; minutes: number } // 5-2880
  | { kind: "at"; time: string; minGapMinutes?: number } // the next HH:MM at least minGap (default 60) after now
  | { kind: "next_day_at"; time: string }; // HH:MM on the next open day

/**
 * Reasoned starting value, not researched (OD10, CO §2.4 "not researched optima"): the delays after attempts 1…5;
 * attempt 6 is the last. Attempt 1 is the first call itself ("immediately").
 */
export const DEFAULT_LADDER: LadderStep[] = [
  { kind: "after", minutes: 60 },
  { kind: "after", minutes: 180 },
  { kind: "next_day_at", time: "11:00" },
  { kind: "at", time: "18:30" },
  { kind: "next_day_at", time: "11:00" },
];

/** the `at` step's minimum gap when the owner left it empty (OPE-§6.2) */
export const LADDER_AT_MIN_GAP_MINUTES = 60;

/**
 * Reasoned starting values, not researched: the other defaults of the `ops` setting (OPE-§2.9). Each is editable
 * by the owner or a manager (`callcenter.configure`).
 */
export const OPS_DEFAULTS = {
  /** a busy or switched-off line is retried once after this, then the ladder (OD10) */
  busyRetryMinutes: 20,
  /** after the last step: close as unreachable, or one try a day (OD10) */
  unreachable: "close" as "close" | "keep_open",
  /** keep_open: one try a day for this many days after the first attempt */
  keepOpenDays: 7,
  /** a claim's lease, renewed by the presence heartbeat (OD60) */
  leaseMinutes: 15,
  /** the delivery lane (OD48): rescue calls per order, and the one retry after a no-answer */
  rescueMaxCalls: 3,
  rescueRetryMinutes: 60,
  /** the next open day's hour of the second rescue retry (OPE-§6.1a) */
  rescueNextDayTime: "11:00",
  /** a due callback stays with its agent this long (OD7) */
  callbackGraceMinutes: 15,
  rebalanceMinutes: 20,
  /** days within which a second order of the same phone is flagged as a duplicate (OPE-§9.3) */
  duplicateWindowDays: 3,
  /** the first-touch target, in calling-window minutes (OD17) */
  firstTouchTargetMin: 15,
  /** OD12 */
  agentHistoryDays: 30,
  /** R2 (OP-19) */
  revealAlarmPerHour: 60,
} as const;
