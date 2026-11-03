import "server-only";
/**
 * `refs.reconcile` (docs/STORE-SAAS.md §G.5, OS-07; R1 P8 step 7), slot 6, daily 02:25, 3 s a tick until done: one
 * daily pass over the stores (./pass.ts) healing each store's `asset_refs` index from its sources
 * (src/lib/storage/asset-refs.ts `reconcileStoreRefs`: drafts and live versions whose rows are missing or older than
 * their page, the brand logo, rows of owners that are gone or no longer live). The index is then right every morning
 * even before CCR r1-p8-7 calls `syncAssetRefs` from save, publish, restore and the brand setting, and stays right
 * after it if a call site misses a write. A store that did work gets its own job_runs row (`processed` = owners
 * rebuilt or removed).
 */
import { reconcileStoreRefs } from "@/lib/storage/asset-refs";
import type { JobCtx, JobResult } from "../runner";
import { dailyPass } from "./pass";
import { STORES_WITH_DATA } from "./rules";

export async function refsReconcileJob(ctx: JobCtx): Promise<JobResult> {
  const t = { pages: 0, rebuilt: 0, removed: 0, stores: 0 };
  const pass = await dailyPass(ctx, STORES_WITH_DATA, async (scope) => {
    const r = await reconcileStoreRefs(scope, { yieldFn: ctx.yield });
    t.pages += r.pages;
    t.rebuilt += r.rebuilt;
    t.removed += r.removed;
    t.stores++;
    return r.rebuilt + r.removed;
  });
  return { done: pass.complete, processed: t.rebuilt + t.removed, summary: t };
}
