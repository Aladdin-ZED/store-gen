import "server-only";
/**
 * The store-mode switch plan (P3 LANDING; landing.md LAN-§4; docs/STORE-SAAS.md §A.2 mode-switch safeguards, LAN Q34,
 * §K.2 P0): P2's `store.mode` action calls it before a switch to `store` and lists the live landing pages with their
 * 7-day views ("These pages receive visits: keep them on?"). A switch never unpublishes a page. Signature frozen at P0.
 *
 * `livePages`: the store's published landing pages; `views7d`: their views over the last 7 store days (stats_daily,
 * test traffic never counted); `suggestInStoreMode`: true while any live landing page exists, so the sheet's "also use
 * landing pages" box starts ticked and nothing that sells today disappears behind a 404 by default.
 */
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { addDays, dayKey } from "@/lib/admin-data/time";
import { db } from "@/lib/db/client";
import { pages, statsDaily } from "@/lib/db/schema";
import { storeTimeZone } from "@/lib/stats";
import { whereStore } from "@/lib/tenancy/sql";
import type { StoreScope } from "@/lib/tenancy/types";

export async function landingModeSwitchPlan(scope: StoreScope): Promise<{ livePages: number; views7d: number; suggestInStoreMode: boolean }> {
  const live = await db
    .select({ id: pages.id })
    .from(pages)
    .where(whereStore(pages, scope, and(eq(pages.kind, "landing"), eq(pages.status, "published"))));
  if (!live.length) return { livePages: 0, views7d: 0, suggestInStoreMode: false };
  const from = addDays(dayKey(new Date(), await storeTimeZone(scope)), -6);
  const [row] = await db
    .select({ views: sql<number>`COALESCE(SUM(${statsDaily.views}), 0)` })
    .from(statsDaily)
    .where(whereStore(statsDaily, scope, inArray(statsDaily.pageId, live.map((p) => p.id)), gte(statsDaily.day, from)));
  return { livePages: live.length, views7d: Number(row?.views ?? 0), suggestInStoreMode: true };
}
