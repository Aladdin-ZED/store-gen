import "server-only";
/**
 * One daily pass over the stores through forEachStore (R1 P8 step 7): usage.reconcile and refs.reconcile visit every
 * store once a day, store by store from the job's round-robin cursor, and a pass that does not fit one tick resumes at
 * the next (a daily job stays due while it answers `done: false`, src/lib/jobs/due.ts). forEachStore keeps its
 * fairness and isolation: a store whose step throws is logged, counted and skipped; the cursor moves past it.
 *
 * The pass itself (where it started, whether it wrapped) lives in the job's `cron_cursors.state.pass` (./rules.ts
 * `passVisitor`); it is cleared when the pass completes, so the next day's pass starts from the cursor of this one.
 */
import type { StoreRow, StoreStatus, WriteScope } from "@/lib/tenancy/types";
import type { JobCtx } from "../runner";
import { forEachStore, readJobCursor, systemScope } from "../scope";
import { parsePass, passVisitor } from "./rules";
import { patchJobState, readJobState } from "./state";

export interface DailyPassResult {
  /** every store of the pass has been visited (now or in an earlier tick) */
  complete: boolean;
  /** stores worked in this call */
  visited: number;
}

/**
 * Runs `fn` for the stores in `states` that this day's pass has not visited yet, until `ctx.deadline`. `fn` may return
 * how many rows it handled (that store's job_runs row). Each store's step awaits `ctx.yield()` after it.
 */
export async function dailyPass(
  ctx: JobCtx,
  states: readonly StoreStatus[],
  fn: (scope: WriteScope, store: StoreRow) => Promise<number | void>,
): Promise<DailyPassResult> {
  const state = await readJobState(ctx.job);
  const cursor = await readJobCursor(ctx.job);
  const pass = parsePass(state.pass) ?? { start: cursor, wrapped: false };
  const visitor = passVisitor(pass, cursor);
  let visited = 0;
  const run = await forEachStore(
    ctx,
    { job: ctx.job, states, budgetMs: Math.max(1, ctx.deadline - Date.now()), stop: () => visitor.complete || Date.now() >= ctx.deadline },
    async (_scope, store) => {
      if (visitor.visit(store.id) === "end") return 0;
      visited++;
      // the frozen callback types its scope as a StoreScope; the jobs write through their own WriteScope
      const n = await fn(systemScope(ctx, store.id), store);
      await ctx.yield();
      return n;
    },
  );
  const complete = visitor.complete || run.done;
  await patchJobState(ctx.job, { pass: complete ? null : pass });
  return { complete, visited };
}
