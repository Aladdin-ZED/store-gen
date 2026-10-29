/**
 * The platform-wide re-render fan-out's core (docs/STORE-SAAS.md §H.3, §H.10; PLA-§16.2 "Re-render all live pages" and
 * "Retry failed"; R1 P8 step 5), over injected dependencies: the app passes the store pages (../scope.ts `storesAfter`),
 * the per-store enqueue (../renders.ts) and the job's clock and yield; test:storage drives it on the real tables.
 *
 * The console's request returns at once (`enqueueRendersEverywhere` writes the request into the `renders.fanout` row of
 * `cron_cursors`); the `renders.fanout` job (§H.2 slot 7, every tick, about 1 s) then walks the stores once, in id
 * order from the request's `after`, and enqueues each one's pages through that store's own system scope: every live
 * page (`live`), or the pages of its failed jobs (`failed`). It stops starting stores at the deadline and saves where
 * it got to; the next tick goes on from there. A store whose enqueue throws is counted and skipped (its pages are not
 * retried by this request). The `renders` job (slot 4) renders what was queued, 10 pages per store and 4 s of CPU per
 * tick, so the fan-out never renders anything itself.
 */
import type { StoreRow } from "@/lib/tenancy/types";
import type { FanoutState } from "./rules";
import { FANOUT_PAGE } from "./rules";

export interface FanoutDeps {
  /** at most `limit` stores in the render states after `after`, in id order */
  stores(after: string, limit: number): Promise<StoreRow[]>;
  /** one store's enqueue for the request: the jobs inserted */
  enqueueStore(store: StoreRow, st: FanoutState): Promise<number>;
  /** wall clock, epoch ms */
  now(): number;
  deadline: number;
  yieldLoop(): Promise<void>;
  /** a store whose enqueue threw (counted, never fatal) */
  onStoreFailed(store: StoreRow, err: unknown, ms: number, startedAt: number): void;
  /** a store handled, for the run's per-store job_runs rows */
  onStoreDone(store: StoreRow, enqueued: number, ms: number, startedAt: number): void;
}

/** What one run did, and the request's state after it (`doneAt` set once the last store is handled). */
export interface FanoutRun {
  state: FanoutState;
  stores: number;
  enqueued: number;
  failedStores: number;
  finished: boolean;
}

/** Walks the stores after `st.after` until the deadline or the last store (the steps in the header). */
export async function runFanout(deps: FanoutDeps, st: FanoutState): Promise<FanoutRun> {
  let after = st.after;
  let stores = 0;
  let enqueued = 0;
  let failedStores = 0;
  let finished = false;
  outer: for (;;) {
    const page = await deps.stores(after, FANOUT_PAGE);
    for (const store of page) {
      if (deps.now() >= deps.deadline) break outer;
      const t0 = deps.now();
      try {
        const n = await deps.enqueueStore(store, st);
        enqueued += n;
        deps.onStoreDone(store, n, deps.now() - t0, t0);
      } catch (err) {
        failedStores++;
        deps.onStoreFailed(store, err, deps.now() - t0, t0);
      }
      stores++;
      after = store.id;
      await deps.yieldLoop();
    }
    if (page.length < FANOUT_PAGE) {
      finished = true;
      break;
    }
  }
  return {
    state: {
      ...st,
      after,
      stores: st.stores + stores,
      enqueued: st.enqueued + enqueued,
      failedStores: st.failedStores + failedStores,
      doneAt: finished ? new Date(deps.now()).toISOString() : null,
    },
    stores,
    enqueued,
    failedStores,
    finished,
  };
}
