import "server-only";
/**
 * Cross-store usage reads of the console (platform.md PLA-§9.2 impact preview, PLA-§12.1 kill-switch preview; §M.4 "Plan
 * impact examples"): the `store_usage` counters of a set of stores, and the stores that use a feature today through
 * the feature's own marker. Numbers and store ids only, never a store's rows.
 *
 *   await usageOf("media_bytes", storeIds)         // Map<storeId, bytes>, the gauge's `total` row
 *   await usageOf("exports", storeIds, zones)      // monthly counters: each store's current month in its time zone
 *   await storesUsing("sheets", storeIds)          // Set<storeId> with a `sheet_bindings` row
 *   await storesUsing("pixels_capi", null)         // every store with a pixel in its library (the capi switch's count)
 *
 * Each call is one annotated platform query per 500 ids (`IN (…)` over the stores_plan_idx / PK prefixes, §M.4), or
 * one over every store when `storeIds` is null. Markers: `sheets` = a `sheet_bindings` row, `pixels_capi` = a pixel in
 * the `pixel_library` setting, `publish` = a live page; other features have no marker (null: the caller counts every
 * store as a user).
 */
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { pages, sheetBindings, storeSettings, storeUsage } from "@/lib/db/schema";
import { USAGE_METRICS, periodOf, type FeatureKey, type UsageMetricName } from "@/lib/tenancy/entitlement-keys";

/** PLA-§M.4: `IN (…≤ 2,000 ids)` chunked by 500 */
export const ID_CHUNK = 500;

function chunks<T>(list: readonly T[], size = ID_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** The period of `metric` now for a store in `timeZone` ("total" for gauges). */
function periodNow(metric: UsageMetricName, timeZone: string, now: Date): string {
  const { period } = USAGE_METRICS[metric];
  if (period === "total") return "total";
  try {
    return periodOf(period, now, timeZone);
  } catch {
    return periodOf(period, now, "UTC");
  }
}

/**
 * The current value of a counter for each store (missing row = 0, left out of the map). `zones` gives each store's
 * time zone for the monthly and daily counters (default the platform's).
 */
export async function usageOf(metric: UsageMetricName, storeIds: readonly string[], zones: ReadonlyMap<string, string> = new Map(), now: Date = new Date()): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (const ids of chunks(storeIds)) {
    const periods = [...new Set(ids.map((id) => periodNow(metric, zones.get(id) ?? "Africa/Casablanca", now)))];
    // tenancy: platform plan impact (PLA-§9.2): one counter of ≤ 500 stores by the store_usage PK prefix, numbers only
    const rows = await db
      .select({ storeId: storeUsage.storeId, period: storeUsage.period, value: storeUsage.value })
      .from(storeUsage)
      .where(and(inArray(storeUsage.storeId, ids), eq(storeUsage.metric, metric), inArray(storeUsage.period, periods)));
    for (const r of rows) {
      if (r.period !== periodNow(metric, zones.get(r.storeId) ?? "Africa/Casablanca", now)) continue;
      out.set(r.storeId, Number(r.value) || 0);
    }
  }
  return out;
}

/** The features a marker answers for (the others: null). */
export const MARKED_FEATURES = ["sheets", "pixels_capi", "publish"] as const;
export type MarkedFeature = (typeof MARKED_FEATURES)[number];
export const hasMarker = (key: string): key is MarkedFeature => (MARKED_FEATURES as readonly string[]).includes(key);

/** One marker query over `ids` (null = every store). */
async function markerRows(feature: MarkedFeature, ids: readonly string[] | null): Promise<{ storeId: string }[]> {
  const list = ids ? [...ids] : null;
  switch (feature) {
    case "sheets":
      // tenancy: platform feature marker (PLA-§9.2, §12.1): the stores with a Sheets binding, ids only (sb_store_idx)
      return db
        .selectDistinct({ storeId: sheetBindings.storeId })
        .from(sheetBindings)
        .where(list ? inArray(sheetBindings.storeId, list) : undefined);
    case "pixels_capi":
      // tenancy: platform feature marker (PLA-§9.2, §12.1): the stores with a pixel in their library, ids only (store_settings PK)
      return db
        .select({ storeId: storeSettings.storeId })
        .from(storeSettings)
        .where(
          and(
            list ? inArray(storeSettings.storeId, list) : undefined,
            eq(storeSettings.key, "pixel_library"),
            eq(storeSettings.encrypted, false),
            sql`COALESCE(JSON_LENGTH(JSON_EXTRACT(${storeSettings.value}, '$.pixels')), 0) > 0`,
          ),
        );
    case "publish":
      // tenancy: platform feature marker (PLA-§9.2): the stores with a live page, ids only (pages_store_status_idx)
      return db
        .selectDistinct({ storeId: pages.storeId })
        .from(pages)
        .where(and(list ? inArray(pages.storeId, list) : undefined, isNotNull(pages.publishedVersionId)));
  }
}

/** The stores among `storeIds` (null = every store) that use `feature` today, or null when the feature has no marker. */
export async function storesUsing(feature: FeatureKey, storeIds: readonly string[] | null): Promise<Set<string> | null> {
  if (!hasMarker(feature)) return null;
  const out = new Set<string>();
  if (storeIds === null) {
    for (const r of await markerRows(feature, null)) out.add(r.storeId);
    return out;
  }
  for (const ids of chunks(storeIds)) for (const r of await markerRows(feature, ids)) out.add(r.storeId);
  return out;
}
