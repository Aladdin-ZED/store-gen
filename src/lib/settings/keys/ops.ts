/**
 * Store setting `ops` (docs/STORE-SAAS.md §D.10, operations.md OPE-§2.9; owner: operations, P4): the call centre.
 * `callingWindow` is the ONE source of the store's calling hours (D73), read through `callingWindowFor(scope)`;
 * weekdays are ISO numbers, 1 = Monday … 7 = Sunday, the same numbers as `checkout.calendar.workdays` (CRIT3).
 * The R1.0 first schema: P4 widens it (R2 assignment rules, R3 routing and the WhatsApp bot) and moves the
 * defaults to src/lib/callcenter/defaults.ts; every default is a reasoned starting value, not researched (OD9, OD10).
 */
import { z } from "zod";
import { hhmm, id26, isoDate, isoDateTime } from "../fields";

export const OpsRange = z.object({ from: hhmm, to: hhmm });
const DayRanges = z.array(OpsRange).max(3);
/** keyed "1".."7" (ISO weekday); the TS type is Record<1 … 7, Range[]> */
export const WeekRanges = z.object({ 1: DayRanges, 2: DayRanges, 3: DayRanges, 4: DayRanges, 5: DayRanges, 6: DayRanges, 7: DayRanges });
export type WeekRanges = z.output<typeof WeekRanges>;

/** A city slug ("casablanca", "ksar-el-kebir"): the one city key of the platform (D68, OD47). */
export const CityKeyZ = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(40);

/** The `source` enum of the `manifest` mapping kind (OPE-§18.3); src/lib/callcenter/carrier-csv.ts keeps it equal. */
export const MANIFEST_SOURCES = ["order_id", "name", "phone", "city", "address", "landmark", "cod_amount", "content", "qty", "note", "constant"] as const;

/** OPE-§6.2: the delay after an unanswered attempt. */
export const LadderStep = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("after"), minutes: z.number().int().min(5).max(2880) }),
  z.object({ kind: z.literal("at"), time: hhmm, minGapMinutes: z.number().int().min(0).max(1440).optional() }),
  z.object({ kind: z.literal("next_day_at"), time: hhmm }),
]);
export type LadderStep = z.output<typeof LadderStep>;

const WORK = [
  { from: "09:30", to: "13:00" },
  { from: "14:30", to: "21:00" },
];
/** Mon-Thu, Sat, Sun 09:30-13:00 + 14:30-21:00; Friday 09:30-12:15 + 14:30-21:00; never confirmed by a person (savedAt null). */
export const DEFAULT_WINDOW = {
  days: { 1: WORK, 2: WORK, 3: WORK, 4: WORK, 5: [{ from: "09:30", to: "12:15" }, WORK[1]!], 6: WORK, 7: WORK },
  closedDates: [] as string[],
  savedAt: null as string | null,
};
/** delays after attempts 1…5; attempt 6 is the last (OD10) */
export const DEFAULT_LADDER: LadderStep[] = [
  { kind: "after", minutes: 60 },
  { kind: "after", minutes: 180 },
  { kind: "next_day_at", time: "11:00" },
  { kind: "at", time: "18:30" },
  { kind: "next_day_at", time: "11:00" },
];

export const OpsSetting = z.object({
  callingWindow: z
    .object({
      days: WeekRanges,
      closedDates: z.array(isoDate).max(60).default([]),
      /** set on the owner's first save; null = DEFAULT_WINDOW never confirmed, so no shopper is promised an hour (OD63) */
      savedAt: isoDateTime.nullable().default(null),
    })
    .default(DEFAULT_WINDOW),
  /** dated schedules evaluated before `callingWindow.days` (e.g. Ramadan hours); ≤ 4, non-overlapping */
  windowOverrides: z
    .array(z.object({ label: z.string().max(40), from: isoDate, to: isoDate, days: WeekRanges }))
    .max(4)
    .default([])
    .superRefine((list, ctx) => {
      const sorted = [...list].sort((a, b) => a.from.localeCompare(b.from));
      sorted.forEach((o, i) => {
        if (o.to < o.from) ctx.addIssue({ code: "custom", message: "The end date is before the start date." });
        const next = sorted[i + 1];
        if (next && next.from <= o.to) ctx.addIssue({ code: "custom", message: "Two schedules overlap." });
      });
    }),
  /** "Open calls now" (≤ 2 h) */
  openOverrideUntil: isoDateTime.nullable().default(null),
  ladder: z.array(LadderStep).min(1).max(10).default(DEFAULT_LADDER),
  busyRetryMinutes: z.number().int().min(5).max(120).default(20),
  unreachable: z.enum(["close", "keep_open"]).default("close"),
  keepOpenDays: z.number().int().min(1).max(14).default(7),
  /** renewed by the heartbeat (OD60) */
  leaseMinutes: z.number().int().min(5).max(30).default(15),
  /** the delivery lane (OD48): rescue calls per order, and the one retry after a no-answer */
  rescue: z
    .object({ maxCalls: z.number().int().min(0).max(5).default(3), retryMinutes: z.number().int().min(15).max(240).default(60) })
    .prefault({}),
  /** the Sheet's "Agent" labels → member user ids (≤ 50, OD54) */
  agentLabels: z
    .record(z.string().max(60), id26)
    .refine((o) => Object.keys(o).length <= 50, { error: "Too many labels." })
    .default({}),
  /** the Carrier CSV column list (OD55, D74); null = never configured */
  carrierCsv: z
    .object({
      columns: z
        .array(z.object({ header: z.string().min(1).max(40), source: z.enum(MANIFEST_SOURCES), value: z.string().max(80).optional() }))
        .min(1)
        .max(20),
      delimiter: z.enum([",", ";"]).default(";"),
      markPacked: z.boolean().default(true),
    })
    .nullable()
    .default(null),
  callbackGraceMinutes: z.number().int().min(0).max(60).default(15),
  assignment: z.enum(["pull", "round_robin", "manual"]).default("pull"),
  rebalanceMinutes: z.number().int().min(5).max(240).default(20),
  /** days within which a second order of the same phone is flagged as a duplicate */
  duplicateWindowDays: z.number().int().min(0).max(14).default(3),
  firstTouchTargetMin: z.number().int().min(5).max(240).default(15),
  /** OD12 */
  agentHistoryDays: z.number().int().min(1).max(30).default(30),
  /** typed city → city key (≤ 200) */
  cityAliases: z
    .record(z.string().max(40), CityKeyZ)
    .refine((o) => Object.keys(o).length <= 200, { error: "Too many aliases." })
    .default({}),
  /** R2 (OP-19) */
  revealAlarmPerHour: z.number().int().min(10).max(500).default(60),
  /** R3 (OP-25) */
  leaderboard: z.enum(["off", "managers", "everyone"]).default("off"),
});
export type OpsSetting = z.output<typeof OpsSetting>;
