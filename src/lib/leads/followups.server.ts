import "server-only";
/**
 * Due follow-ups per assignee (P3 LANDING; landing.md LAN-§10.4, §23.4): what the hourly `leads.followups` job digests.
 * One grouped query over `leads_store_next_idx`, in the scope's store: the open leads (`new`, `contacted`) of the
 * last 30 days whose `next_at` has come, per assignee, for the assignees with at least one lead that came due in the
 * last hour (a lead overdue for days does not page its agent every hour). Test leads are left out (D54).
 */
import { and, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { leads } from "@/lib/db/schema";
import { whereStore } from "@/lib/tenancy/sql";
import type { StoreScope } from "@/lib/tenancy/types";
import { LEAD_WINDOW_DAYS } from "./types";

const HOUR_MS = 3_600_000;

export async function followUpsDue(scope: StoreScope, now: Date = new Date()): Promise<{ assigneeId: string; count: number }[]> {
  const freshFrom = new Date(now.getTime() - HOUR_MS);
  const rows = await db
    .select({ assigneeId: leads.assigneeId, count: sql<number>`COUNT(*)`, fresh: sql<number>`COALESCE(SUM(${leads.nextAt} > ${freshFrom}), 0)` })
    .from(leads)
    .where(
      whereStore(
        leads,
        scope,
        and(isNotNull(leads.nextAt), lte(leads.nextAt, now)),
        isNotNull(leads.assigneeId),
        inArray(leads.status, ["new", "contacted"]),
        eq(leads.isTest, false),
        gte(leads.createdAt, new Date(now.getTime() - LEAD_WINDOW_DAYS * 86_400_000)),
      ),
    )
    .groupBy(leads.assigneeId);
  return rows.filter((r) => r.assigneeId && Number(r.fresh) > 0).map((r) => ({ assigneeId: r.assigneeId!, count: Number(r.count) }));
}
