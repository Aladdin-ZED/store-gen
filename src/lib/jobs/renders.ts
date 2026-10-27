import "server-only";
/**
 * The render queue (P8 PLATFORM OPS; docs/STORE-SAAS.md §H.3, D25, D50, ENGC-4, CRIT2-17; §K.2 P0): live pages that bake
 * a store fact (address, brand, `store_info`: contacts, policies, the calling window, the zones' fallback line;
 * `conversions`: the Purchase trigger; `cutout`) are re-rendered in place by the cron's `renders` slot, with the
 * store context of now and the published version's doc. One pending job per page (`dedupe = pageId`, INSERT IGNORE);
 * the claim clears `dedupe`, so a change during a render queues a second job. Typed stubs frozen at P0.
 */
import type { renderJobs } from "@/lib/db/schema";
import type { StoreScope, WriteScope } from "@/lib/tenancy/types";

export type RenderReason = (typeof renderJobs.$inferSelect)["reason"];
export type RenderState = (typeof renderJobs.$inferSelect)["state"];

/** The console's render-queue panel (PLA-§15.1, PD57): one store, or platform-wide without a scope. */
export interface RenderSummary {
  byReason: { reason: RenderReason; pending: number; running: number; failed: number }[];
  oldestPending: { storeId: string; pageId: string; ageMin: number } | null;
  /** failed jobs of the last 24 h by store, with the error summary */
  failed24h: { storeId: string; count: number; error: string | null }[];
  /** pages rendered in the last hour (throughput) */
  doneLastHour: number;
  /** §M notes recorded by re-renders (`render_jobs.error` notes) */
  notes: number;
}

/**
 * Enqueues a re-render of the given live pages, or of every live page of the store ("all-live"); `priority` is the
 * `render_jobs.priority` column (default 5). Callers: handle / domain changes (`address`), brand (`brand`, P6), the calling window,
 * zones and policies (`store_info`, P4 / P3), the Purchase trigger (`conversions`, 4, P5), the media pipeline (`cutout`).
 */
export async function enqueueRenders(scope: WriteScope, pageIds: readonly string[] | "all-live", reason: RenderReason, priority?: number): Promise<{ enqueued: number }> {
  void scope;
  void pageIds;
  void reason;
  void priority;
  throw new Error("not implemented: P8 enqueueRenders");
}

export async function renderSummary(scope?: StoreScope): Promise<RenderSummary> {
  void scope;
  throw new Error("not implemented: P8 renderSummary");
}
