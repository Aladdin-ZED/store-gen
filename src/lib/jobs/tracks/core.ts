/**
 * Jobs of the core track (P8, platform ops): the outbox drain, renders, exports, backup, purge, usage.reconcile,
 * media.migrate, lifecycle, housekeeping.
 * Extension file (docs/STORE-SAAS.md §H.2, §K.3) imported by src/lib/jobs/registry.ts. Each job's body is loaded when
 * it runs, so importing the registry (test:jobs, the console) never loads the database code behind it.
 *
 * Slots (src/lib/jobs/slots.ts): outbox 3, renders 4, media.migrate / usage.reconcile / media.sweep / storage.walk /
 * refs.reconcile 6, renders.fanout 7, housekeeping 8. P8's later steps add exports / backup / purge (5) and
 * lifecycle (7).
 *
 * The storage jobs' daily times (src/lib/jobs/storage/rules.ts STORAGE_JOB_TIMES) take the free 02:05-02:25 windows,
 * one job each, clear of every time §H.2 and OPE-§J name (§H.2 slot 6: no tick carries more than two daily jobs).
 */
import type { Job } from "../runner";
import { STORAGE_JOB_BUDGETS as B, STORAGE_JOB_TIMES as T } from "../storage/rules";

export const jobs: Job[] = [
  {
    // §H.2 slot 3 (13 s, shared by every handler): the platform items (store_id NULL), then the active and restricted
    // stores with due items (pending_outbox) through forEachStore; each handler's perStorePerTick, then the next store
    name: "outbox",
    every: "tick",
    budgetMs: 13_000,
    run: async (ctx) => (await import("../outbox")).outboxJob(ctx),
  },
  {
    // §H.2 slot 4 (12 s): the render queue, store by store (pending_renders, round robin), ≤ 10 pages per store and
    // ≤ 4 s of CPU per tick (2 s while the event loop lags), each page re-rendered in place (§H.3)
    name: "renders",
    every: "tick",
    budgetMs: 12_000,
    run: async (ctx) => (await import("../renders")).rendersJob(ctx),
  },
  {
    // §H.2 slot 6 / §G.3: files still kept in the database moved to DATA_DIR, ≤ 50 a tick, store by store; returns at
    // once on the db backend and for an hour after a probe found nothing to move
    name: "media.migrate",
    every: "tick",
    budgetMs: B["media.migrate"],
    run: async (ctx) => (await import("../storage/migrate")).mediaMigrateJob(ctx),
  },
  {
    // §H.2 slot 6 / §D.7: every store's gauges recomputed from their sources (drift in job_runs.summary), then the D69
    // pending_media_bytes budget from the pending stores' media gauges
    name: "usage.reconcile",
    every: { dailyAt: T["usage.reconcile"] },
    budgetMs: B["usage.reconcile"],
    run: async (ctx) => (await import("../storage/usage")).usageReconcileJob(ctx),
  },
  {
    // §H.2 slot 6 / §G.3: orphan files (no row, > 1 h) and old temp files deleted; fs rows without their file reported
    name: "media.sweep",
    every: { dailyAt: T["media.sweep"] },
    budgetMs: B["media.sweep"],
    run: async (ctx) => (await import("../storage/sweep")).mediaSweepJob(ctx),
  },
  {
    // §H.2 slot 6 / §G.2 (ENGC-14): the bounded, resumable walk of DATA_DIR (and an outside MEDIA_DIR); the snapshot
    // the fs backend's usage(), the health tile and the data_dir / inode alarms read
    name: "storage.walk",
    every: { dailyAt: T["storage.walk"] },
    budgetMs: B["storage.walk"],
    run: async (ctx) => (await import("../storage/walk")).storageWalkJob(ctx),
  },
  {
    // §H.2 slot 6 / §G.5: each store's asset_refs healed from its drafts, live versions and brand logo
    name: "refs.reconcile",
    every: { dailyAt: T["refs.reconcile"] },
    budgetMs: B["refs.reconcile"],
    run: async (ctx) => (await import("../storage/refs")).refsReconcileJob(ctx),
  },
  {
    // §H.2 slot 7 (≈ 1 s of the 5 s shared): a platform-wide re-render request (PLA-§16.2), enqueued store by store
    // from its own cursor; one read and nothing else while none is in progress
    name: "renders.fanout",
    every: "tick",
    budgetMs: 1_000,
    run: async (ctx) => (await import("../renders")).rendersFanoutJob(ctx),
  },
  {
    // §H.2 slot 8 (4 s): rate-limit buckets, visitor markers > 2 days, sessions, abandoned leads > 30 days per store
    name: "housekeeping",
    every: "tick",
    budgetMs: 4_000,
    run: async (ctx) => (await import("../housekeeping")).housekeeping(ctx),
  },
];
