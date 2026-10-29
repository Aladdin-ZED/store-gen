/**
 * Jobs of the core track (P8, platform ops): the outbox drain, renders, exports, backup, purge, usage.reconcile,
 * media.migrate, lifecycle, housekeeping.
 * Extension file (docs/STORE-SAAS.md §H.2, §K.3) imported by src/lib/jobs/registry.ts. Each job's body is loaded when
 * it runs, so importing the registry (test:jobs, the console) never loads the database code behind it.
 *
 * Slots (src/lib/jobs/slots.ts): outbox 3, renders 4, renders.fanout 7, housekeeping 8. P8's later steps add exports /
 * backup / purge (5), media.migrate / media.sweep / storage.walk / refs.reconcile / usage.reconcile (6) and
 * lifecycle (7).
 */
import type { Job } from "../runner";

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
