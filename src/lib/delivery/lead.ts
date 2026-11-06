/**
 * The confirmation lead of one order, in working days (P3 LANDING; landing.md LAN-§7.3, OPS-12). Pure: the lead
 * suggestion (./lead.server.ts) maps the store's recent orders through it, and `test:delivery` pins it.
 *
 * The count matches what the ETA promise assumes (LAN-§7.2 step 2b): the working days from the order's start day (the
 * order day when it is a working day before the cut-off, else the next working day) to the store-local day of the
 * confirmation. Confirmed on the start day, or before it (an evening order confirmed the same night) = 0.
 */
import { MAX_LEAD_DAYS } from "@/lib/landing/limits";
import { addWorkingDays, etaWindow, localParts } from "./eta";
import type { StoreCalendar } from "./types";

/** a confirmation later than this many working days is counted at it (the setting stops at 3 anyway) */
const MAX_COUNTED = 30;

/** Working days from the order's start day to its confirmation day; null when the time zone is unsupported. */
export function confirmationLeadOf(createdAt: Date, confirmedAt: Date, cal: StoreCalendar): number | null {
  const plain = { ...cal, leadDays: 0 };
  const start = etaWindow(plain, { etaMinDays: 0, etaMaxDays: 0 }, createdAt)?.from;
  const confirmed = localParts(confirmedAt, cal.tz)?.ymd;
  if (!start || !confirmed) return null;
  let n = 0;
  while (n < MAX_COUNTED && addWorkingDays(start, n + 1, plain) <= confirmed) n++;
  return n;
}

/** The suggestion from the per-order leads: their median (nearest rank), capped at the setting's maximum. */
export function suggestedLead(leads: readonly number[]): number | null {
  if (!leads.length) return null;
  const sorted = [...leads].sort((a, b) => a - b);
  return Math.min(MAX_LEAD_DAYS, sorted[Math.ceil(sorted.length / 2) - 1]!);
}
