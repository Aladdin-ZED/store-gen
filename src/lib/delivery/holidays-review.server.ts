import "server-only";
/**
 * The yearly holiday reminder of one store (P3 LANDING; landing.md LAN-§7.2, §23.4, §23.6): the step the
 * `delivery.holidays_review` job (src/lib/jobs/tracks/landing.ts) runs for each store it visits. The rule is the pure
 * `holidaysReviewDue` (./holidays-ma.ts); this file reads its inputs and raises the notification.
 *
 * "At most once per 30 days" is kept by the notification's own dedupe key, one per store and store-local day: the
 * step looks the keys of the last 30 days up (the unique `nt_dedupe_uq` index, scoped to the store), and a second tick
 * on the same day is a no-op twice over (INSERT IGNORE on the same key). The vars carry the year only.
 */
import { inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { notifications } from "@/lib/db/schema";
import { notify } from "@/lib/platform/notify";
import { getStoreSetting } from "@/lib/settings";
import { whereStore } from "@/lib/tenancy/sql";
import type { StoreRow, StoreScope } from "@/lib/tenancy/types";
import { localParts } from "./eta";
import { holidaysReviewDue, reviewWindowDays } from "./holidays-ma";

export const HOLIDAYS_REVIEW_KIND = "delivery.holidays_review";
const DEFAULT_TZ = "Africa/Casablanca";

const dedupeKeyOf = (storeId: string, ymd: string) => `${HOLIDAYS_REVIEW_KIND}:${storeId}:${ymd}`;

/** Raises the reminder when it is due; "sent" when a notification row was written. */
export async function holidaysReviewStep(scope: StoreScope, store: Pick<StoreRow, "handle" | "timezone">, now: Date = new Date()): Promise<"sent" | "not_due"> {
  const local = localParts(now, store.timezone || DEFAULT_TZ);
  if (!local) return "not_due";
  const checkout = await getStoreSetting(scope, "checkout");
  const facts = { zonesEnabled: checkout.zonesEnabled, reviewedYear: checkout.calendar.holidaysReviewedYear, local };
  // the cheap checks first: most stores stop here without a query
  if (!holidaysReviewDue({ ...facts, sentDays: [] }).due) return "not_due";
  const keys = reviewWindowDays(local.ymd).map((d) => dedupeKeyOf(scope.storeId, d));
  const sent = await db.select({ key: notifications.dedupeKey }).from(notifications).where(whereStore(notifications, scope, inArray(notifications.dedupeKey, keys)));
  const due = holidaysReviewDue({ ...facts, sentDays: sent.map((r) => (r.key ?? "").slice(-10)) });
  if (!due.due) return "not_due";
  const r = await notify(
    { audience: "store_role", storeId: scope.storeId, roles: ["owner", "admin"] },
    HOLIDAYS_REVIEW_KIND,
    { year: due.year },
    { link: `/app/${store.handle}/settings/delivery`, dedupeKey: dedupeKeyOf(scope.storeId, local.ymd) },
  );
  return "id" in r ? "sent" : "not_due";
}
