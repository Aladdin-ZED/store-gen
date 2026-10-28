import "server-only";
/**
 * The confirmation-lead suggestion of the calendar card (P3 LANDING; landing.md LAN-§7.3, OPS-12): "Your team confirms
 * within about {n} working day(s) (median of your last {count} orders)". Read-only (a `StoreScope`); nothing is ever
 * applied without the owner's tap.
 *
 * One scoped query on `orders_store_created_idx` (store, created_at): the store's real orders of the last 28 days that
 * were confirmed (`is_test` excluded, core D54). Below 30 of them the answer is null: no suggestion from too few.
 */
import { and, eq, gte, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { orders } from "@/lib/db/schema";
import { LEAD_MIN_ORDERS, LEAD_SAMPLE_DAYS } from "@/lib/landing/limits";
import { whereStore } from "@/lib/tenancy/sql";
import type { StoreScope } from "@/lib/tenancy/types";
import { confirmationLeadOf, suggestedLead } from "./lead";
import { calendarFor } from "./zones.server";

const DAY_MS = 86_400_000;

export async function confirmationLeadSuggestion(scope: StoreScope, now: Date = new Date()): Promise<{ days: number; count: number } | null> {
  const since = new Date(now.getTime() - LEAD_SAMPLE_DAYS * DAY_MS);
  const rows = await db
    .select({ createdAt: orders.createdAt, confirmedAt: orders.confirmedAt })
    .from(orders)
    .where(whereStore(orders, scope, and(gte(orders.createdAt, since), eq(orders.isTest, false), isNotNull(orders.confirmedAt))));
  if (rows.length < LEAD_MIN_ORDERS) return null;
  const cal = await calendarFor(scope, { stage: "after_call" });
  const leads: number[] = [];
  for (const r of rows) {
    const lead = r.confirmedAt ? confirmationLeadOf(r.createdAt, r.confirmedAt, cal) : null;
    if (lead !== null) leads.push(lead);
  }
  const days = leads.length >= LEAD_MIN_ORDERS ? suggestedLead(leads) : null;
  return days === null ? null : { days, count: leads.length };
}
