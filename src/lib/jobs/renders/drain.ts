/**
 * The `renders` job's core (docs/STORE-SAAS.md §H.3, §H.2 slot 4, D50, ENGC-4, ENGC-11; R1 P8 step 5), over injected
 * dependencies: the app passes the database statements (./sql.ts), `rerenderInPlace` (src/lib/render/publish.server.ts,
 * CCR r1-p8-2) as the port, the event loop's busy time and the job's yield; test:jobs passes an in-memory queue, a fake
 * port and fake clocks.
 *
 * For one store (`renderStore`, called by the job for each store with due jobs, round robin):
 *  1. nothing is claimed once the tick's deadline or its CPU budget is spent (4 s of busy time across every store, 2 s
 *     while the event loop lags; ENGC-11);
 *  2. one claim of at most 10 jobs (§H.2: ≤ 10 pages per store per tick), lowest priority first; the claim clears
 *     `dedupe` (ENGC-4), so a change during the render queues a second job;
 *  3. each job in claim order: a job taken over from an expired lease past its 3 retries fails at once
 *     (`lease_expired`); else the port re-renders the live version in place with the store context of now, the gates
 *     in warn mode (the job's busy time is added to the tick's CPU); its outcome (./rules.ts outcomeOf) is written under
 *     the claim; a failed job marks the store's health dirty and counts in the error ring (`onFailed`);
 *  4. the deadline and the CPU budget are checked before each job: the rest of the claim goes back to pending
 *     untouched (`release`) and the run reports `more`. A running render is never interrupted;
 *  5. after the store: the earlier `failed` jobs of every page that has now rendered (or left the queue for good) are
 *     resolved, and the store's caches are dropped when a page was rewritten (`onStoreDone`: invalidateStoreRender and
 *     invalidateStore).
 *
 * Attached pages (`pages.product_id`, R2): every job of such a page goes through `republishAttached` (P3/S1, §H.3 rev 5,
 * decided by diff). That handler does not exist in R1, where no landing is attached to a product, so every job takes
 * the in-place path; the port is where R2 adds the branch.
 */
import type { Actor, WriteScope } from "@/lib/tenancy/types";
import { errorCode } from "../errors";
import type { RenderReason } from "../renders";
import { MAX_RETRIES, NOTES_PREFIX, PER_STORE_PER_TICK, cpuCapMs, failedTry, outcomeOf, type RenderOutcome, type RerenderAnswer } from "./rules";

/** A claimed job as the drain reads it back. */
export interface ClaimedRender {
  id: string;
  storeId: string;
  pageId: string;
  reason: RenderReason;
  priority: number;
  /** failed tries so far (a take-over from an expired lease counts one) */
  attempts: number;
}

/** The statements the drain runs (./sql.ts in the app). Every one is bound to the scope's store. */
export interface RenderRepo {
  claim(scope: WriteScope, limit: number, claim: string): Promise<ClaimedRender[]>;
  /**
   * Writes one outcome under the claim: "ok", "lost" (the claim is no longer ours: the lease ran out and another drain
   * took the job), or, for a retry, "superseded" (a newer pending job of the page exists, enqueued during the render:
   * it renders with the newer context, so this one is closed as skipped).
   */
  finish(scope: WriteScope, job: ClaimedRender, claim: string, outcome: RenderOutcome): Promise<"ok" | "lost" | "superseded">;
  /** back to pending untouched (the budget ran out); a job whose page has a newer pending one is closed instead */
  release(scope: WriteScope, ids: readonly string[], claim: string): Promise<{ released: number; superseded: number }>;
  /** queues the page again (INSERT IGNORE: an existing pending job absorbs it) */
  requeue(scope: WriteScope, job: ClaimedRender): Promise<void>;
  /** closes the earlier `failed` jobs of these pages: they rendered since (`skipped`, error "resolved:<code>") */
  resolveFailed(scope: WriteScope, pageIds: readonly string[]): Promise<number>;
}

/** The re-render itself: `rerenderInPlace` (src/lib/render/publish.server.ts) in the app. */
export interface RerenderPort {
  rerenderInPlace(scope: WriteScope, pageId: string, opts: { reason: RenderReason; actor: Actor }): Promise<RerenderAnswer>;
}

export interface RenderDeps {
  repo: RenderRepo;
  port: RerenderPort;
  /** who the gates see (the job's system actor) */
  actor: Actor;
  /** wall clock, epoch ms */
  now(): number;
  /** the job's end, epoch ms */
  deadline: number;
  /** the event loop's cumulative busy time, ms (the CPU the renders spend) */
  cpuNow(): number;
  /** the runner's event-loop lag estimate */
  lagMs(): number;
  /** awaited between jobs (the job's `ctx.yield()`) */
  yieldLoop(): Promise<void>;
  newClaim(): string;
  /** a job failed for good: the store's health is dirty, the error ring counts it */
  onFailed(job: ClaimedRender, code: string): void;
  /** a page of the store was rewritten: drop the store's caches */
  onStoreDone(storeId: string): void;
  recordError(area: string, err: unknown, opts?: { storeId?: string | null; route?: string | null; code?: string | null }): void;
}

/** One run's running totals, shared by every store it visits. */
export interface RenderRunState {
  stores: number;
  claimed: number;
  rendered: number;
  /** runtime_v 1 or not live */
  skipped: number;
  /** pages queued again because a publish moved the live version during the render */
  requeued: number;
  retried: number;
  failed: number;
  /** claimed but given back untouched: the budget ran out */
  released: number;
  /** closed because a newer pending job of the page exists */
  superseded: number;
  /** outcomes not written: the claim was lost */
  lost: number;
  /** rendered with gate notes */
  notes: number;
  /** earlier failures closed by a later render */
  resolved: number;
  /** busy time spent in re-renders (ms) */
  cpuMs: number;
  /** the CPU budget stopped the run */
  capped: boolean;
  /** work is left for the next tick */
  more: boolean;
}

export function newRenderRunState(): RenderRunState {
  return { stores: 0, claimed: 0, rendered: 0, skipped: 0, requeued: 0, retried: 0, failed: 0, released: 0, superseded: 0, lost: 0, notes: 0, resolved: 0, cpuMs: 0, capped: false, more: false };
}

/** Why no further job may start: the deadline, the CPU budget, or nothing (null). */
export function stopReason(deps: Pick<RenderDeps, "now" | "deadline" | "lagMs">, st: RenderRunState): "deadline" | "cpu" | null {
  if (deps.now() >= deps.deadline) return "deadline";
  if (st.cpuMs >= cpuCapMs(deps.lagMs())) return "cpu";
  return null;
}

/** One job: the port, its busy time, its outcome. A take-over past its retries fails without rendering. */
async function runJob(deps: RenderDeps, scope: WriteScope, job: ClaimedRender, st: RenderRunState): Promise<RenderOutcome> {
  if (job.attempts > MAX_RETRIES) return failedTry(MAX_RETRIES, "lease_expired");
  const c0 = deps.cpuNow();
  let outcome: RenderOutcome;
  try {
    const result = await deps.port.rerenderInPlace(scope, job.pageId, { reason: job.reason, actor: deps.actor });
    outcome = outcomeOf(job.attempts, { result });
  } catch (err) {
    outcome = outcomeOf(job.attempts, { error: err });
  }
  st.cpuMs += Math.max(0, deps.cpuNow() - c0);
  return outcome;
}

/**
 * Renders one store's due jobs within the run's budgets (the steps in the header). Returns the jobs handled (the
 * store's `job_runs.processed`). Throws only when a statement fails (forEachStore counts the store and moves on; the
 * claimed jobs come back when their lease ends).
 */
export async function renderStore(deps: RenderDeps, scope: WriteScope, st: RenderRunState): Promise<number> {
  if (stopReason(deps, st)) {
    st.more = true;
    return 0;
  }
  st.stores++;
  const claim = deps.newClaim();
  const jobs = await deps.repo.claim(scope, PER_STORE_PER_TICK, claim);
  st.claimed += jobs.length;
  let handled = 0;
  let rewritten = false;
  const settled: string[] = [];

  for (let i = 0; i < jobs.length; i++) {
    const why = stopReason(deps, st);
    if (why) {
      if (why === "cpu") st.capped = true;
      st.more = true;
      const rest = await deps.repo.release(scope, jobs.slice(i).map((j) => j.id), claim);
      st.released += rest.released;
      st.superseded += rest.superseded;
      break;
    }
    const job = jobs[i]!;
    const outcome = await runJob(deps, scope, job, st);
    const written = await deps.repo.finish(scope, job, claim, outcome);
    handled++;
    if (written === "lost") {
      st.lost++;
      deps.recordError("renders", null, { code: "claim_lost", storeId: job.storeId, route: `renders:${job.reason}` });
    } else if (written === "superseded") {
      st.superseded++;
    } else {
      switch (outcome.state) {
        case "done":
          if (outcome.requeue) {
            st.requeued++;
            await deps.repo.requeue(scope, job);
          } else {
            st.rendered++;
            if (outcome.error?.startsWith(NOTES_PREFIX)) st.notes++;
            rewritten = true;
            settled.push(job.pageId);
          }
          break;
        case "skipped":
          st.skipped++;
          settled.push(job.pageId);
          break;
        case "pending":
          st.retried++;
          break;
        case "failed":
          st.failed++;
          deps.onFailed(job, outcome.error);
          break;
      }
    }
    await deps.yieldLoop();
  }

  if (settled.length) st.resolved += await deps.repo.resolveFailed(scope, [...new Set(settled)]);
  if (rewritten) {
    try {
      deps.onStoreDone(scope.storeId);
    } catch (err) {
      deps.recordError("renders", err, { code: errorCode(err), storeId: scope.storeId, route: "renders:invalidate" });
    }
  }
  return handled;
}
