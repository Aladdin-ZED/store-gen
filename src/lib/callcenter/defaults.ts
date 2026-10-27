/**
 * Call-centre defaults (P4 CALL CENTER; operations.md OPE-§2.9, OD9, OD63; docs/STORE-SAAS.md §K.2 P0). Each is a
 * reasoned starting value, not researched. Pure data, isomorphic: the "starting hours" line of the hours editor and
 * the `ops` setting schema (src/lib/settings/keys/ops.ts) read the same object. P4 moves the ladder and the other
 * defaults here.
 */
import type { IsoWeekday, Range } from "./window";

const WORK: Range[] = [
  { from: "09:30", to: "13:00" },
  { from: "14:30", to: "21:00" },
];

/**
 * The window a store calls in until the owner saves its own (`ops.callingWindow`): Mon-Thu, Sat, Sun 09:30-13:00 +
 * 14:30-21:00; Friday (key 5) 09:30-12:15 + 14:30-21:00. `savedAt: null`: never confirmed by a person, so the queue
 * uses it and no shopper is promised an hour from it (OD63).
 */
export const DEFAULT_WINDOW: { days: Record<IsoWeekday, Range[]>; closedDates: string[]; savedAt: string | null } = {
  days: { 1: WORK, 2: WORK, 3: WORK, 4: WORK, 5: [{ from: "09:30", to: "12:15" }, WORK[1]!], 6: WORK, 7: WORK },
  closedDates: [],
  savedAt: null,
};
