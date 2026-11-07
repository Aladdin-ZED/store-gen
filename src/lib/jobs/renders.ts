import "server-only";
/**
 * The render queue (P8 PLATFORM OPS; docs/STORE-SAAS.md §H.3, D25, D50, ENGC-4, ENGC-11, CRIT2-17; §K.2 P0): live pages
 * that bake a store fact (address, brand, `store_info`: contacts, policies, the calling window, the zones' fallback
 * line; `conversions`: the Purchase trigger; `cutout`; `runtime`) are re-rendered in place by the cron's `renders` slot,
 * with the store context of now and the published version's doc.
 *
 *   await enqueueRenders(scope, "all-live", "store_info");                 // after a contacts / calling-window save
 *   await enqueueRenders(scope, [pageId], "conversions", CONVERSIONS_PRIORITY);
 *   await enqueueRendersEverywhere(ctx, "address");                         // the console: every store, returns at once
 *   await renderSummary(scope);                                             // the store's queue; renderSummary() = platform
 *
 * - **enqueueRenders** inserts one `render_jobs` row per page with `dedupe = pageId` (INSERT IGNORE: one pending job per
 *   page, across every reason; a pending job keeps the lower priority of the two). "all-live" is the store's published
 *   pages; ids outside the store match no page of the scope (whereStore) and are dropped and counted in the error ring
 *   (`renders` / `foreign_page`). Lower priority runs first: the Purchase trigger uses 4, the rest 5.
 * - **The claim clears `dedupe`** (ENGC-4): a change that arrives while a page renders inserts a fresh pending job,
 *   rendered on a later tick with the newer context. A job that goes back to pending takes `dedupe` back, or is closed
 *   as superseded when a newer pending job of the page holds it.
 * - **The `renders` job** (§H.2 slot 4, every tick, 12 s): store by store (round robin, stores with due jobs), at most
 *   10 pages per store and 4 s of CPU per tick (the event loop's busy time around each re-render: SSR, gzip, gates;
 *   2 s while it lags), lowest priority first. Each job is `rerenderInPlace` (src/lib/render/publish.server.ts, CCR
 *   r1-p8-2): only html, thank_you_html, csp, thank_you_csp and etag of the live version are rewritten, the gates run in
 *   warn mode and their item ids are kept as `render_jobs.error` = "notes:<ids>" (≤ 200). runtime_v 1 → `skipped`,
 *   listed for a manual republish. A throw retries after 1, 5 and 30 min, then `failed` (the store's health is marked
 *   dirty, `renders` / <code> in the error ring). After each store its caches are dropped (invalidateStoreRender,
 *   invalidateStore). Attached pages (`pages.product_id`, 0006) take S1's `republishAttached` in R2; R1 has no such
 *   column and every job renders in place.
 * - **The fan-out** (`enqueueRendersEverywhere`, `retryFailedEverywhere`, PLA-§16.2): the request is stored in the
 *   `renders.fanout` row of `cron_cursors` and returns at once; the `renders.fanout` job (slot 7, about 1 s a tick)
 *   enqueues store by store through each store's system scope. One fan-out at a time.
 * - **Summaries** (PLA-§15.1, PLA Q.25): counts by reason × state, the oldest pending (page, slug, age), the failures of
 *   the last 24 h with their codes, the last hour's throughput and the ETA (null when nothing finished: never
 *   invented), the gate notes (pages, top 3 item ids); platform-wide also the 20 stores with the most failures and the
 *   fan-out's progress. Ids, reasons, states, codes and counts only.
 */
import { eq, getTableColumns } from "drizzle-orm";
import type { AnyMySqlColumn } from "drizzle-orm/mysql-core";
import { pages, type renderJobs } from "@/lib/db/schema";
import { whereStore } from "@/lib/tenancy/sql";
import type { Actor, PlatformCtx, StoreScope, SystemCtx, WriteScope } from "@/lib/tenancy/types";
import { errorCode, recordError } from "./errors";
import type { JobCtx, JobResult } from "./runner";
import type { RenderDeps } from "./renders/drain";
import { CONVERSIONS_PRIORITY, DEFAULT_PRIORITY, RENDER_STORE_STATES, checkEnqueue, checkFanout, type FanoutMode, type FanoutReason, type FanoutState } from "./renders/rules";

export { CONVERSIONS_PRIORITY, DEFAULT_PRIORITY, FANOUT_REASONS, RENDER_REASONS } from "./renders/rules";
export type { FanoutMode, FanoutReason } from "./renders/rules";

export type RenderReason = (typeof renderJobs.$inferSelect)["reason"];
export type RenderState = (typeof renderJobs.$inferSelect)["state"];

/** The console's render-queue panel (PLA-§15.1, PD57): one store, or platform-wide without a scope. */
export interface RenderSummary {
  /** P8 step 5 (additive): `done` and `skipped` per reason */
  byReason: { reason: RenderReason; pending: number; running: number; failed: number; done: number; skipped: number }[];
  /** P8 step 5 (additive): the page's `slug` (null when the page is gone) and the job's `reason` */
  oldestPending: { storeId: string; pageId: string; ageMin: number; slug: string | null; reason: RenderReason } | null;
  /** failed jobs of the last 24 h by store, with the error summary; P8 step 5 (additive): every code with its count */
  failed24h: { storeId: string; count: number; error: string | null; codes: { code: string; count: number }[] }[];
  /** pages rendered in the last hour (throughput) */
  doneLastHour: number;
  /** §M notes recorded by re-renders (`render_jobs.error` notes): the pages with notes in the last 7 days */
  notes: number;
  /* P8 step 5 (additive) */
  /** every job by state */
  totals: Record<RenderState, number>;
  /** the oldest pending job's age (PLA-§15.2 render_stuck: > 60) */
  oldestMin: number | null;
  /** jobs finished in the last hour (done, skipped and failed): the throughput the ETA uses */
  finishedLastHour: number;
  /** the same per minute, one decimal (the panel's "pages / min") */
  throughputPerMin: number;
  /** minutes to drain the pending jobs at the last hour's rate; null when nothing finished in it */
  etaMin: number | null;
  /** failed jobs older than 24 h, still failed (PLA-§15.2 render_failed_old) */
  failedOld: number;
  /** the 3 most frequent gate item ids among the recent notes */
  topNotes: { id: string; count: number }[];
  /** live pages on a runtime_v 1 version (≤ 20): a re-render skips them, they need a manual republish */
  republish: { storeId: string; pageId: string }[];
  /** when the summary was read (ISO) */
  at: string;
}

/** A platform-wide fan-out's progress (PLA-§16.2). */
export interface FanoutProgress {
  id: string;
  mode: FanoutMode;
  reason: RenderReason | null;
  requestedAt: string;
  requestedBy: string | null;
  /** stores in the render states when it was requested */
  total: number;
  /** stores handled so far, jobs inserted so far, stores whose enqueue failed */
  stores: number;
  enqueued: number;
  failedStores: number;
  /** stores handled out of total, 0-100 (null when there was no store) */
  pct: number | null;
  done: boolean;
  doneAt: string | null;
}

/** renderSummary() platform-wide: plus the 20 stores with the most failed (then pending) jobs and the fan-out. */
export interface PlatformRenderSummary extends RenderSummary {
  stores: { storeId: string; failed: number; pending: number }[];
  fanout: FanoutProgress | null;
}

const JOB_STATES = RENDER_STORE_STATES;

/** The store a write scope names; refuses what the type would refuse at compile time (an impersonation scope). */
async function writableStore(scope: WriteScope): Promise<string> {
  const kind: string = scope.kind;
  if (kind === "member" || kind === "public" || kind === "system") return scope.storeId;
  const { SeamError } = await import("@/lib/tenancy/seam");
  throw new SeamError(kind === "impersonation" ? "impersonation_read_only" : "forbidden");
}

/* ------------------------------------------------------------------ */
/* Enqueue                                                             */
/* ------------------------------------------------------------------ */

/**
 * Enqueues a re-render of the given live pages, or of every live page of the store ("all-live"); `priority` is the
 * `render_jobs.priority` column (default 5). Callers: handle / domain changes (`address`), brand (`brand`, P6), the calling window,
 * zones and policies (`store_info`, P4 / P3), the Purchase trigger (`conversions`, 4, P5), the media pipeline (`cutout`).
 */
export async function enqueueRenders(scope: WriteScope, pageIds: readonly string[] | "all-live", reason: RenderReason, priority?: number): Promise<{ enqueued: number }> {
  const storeId = await writableStore(scope);
  const checked = checkEnqueue(pageIds, reason, priority);
  const { insertJobs, livePageIds, storePageIds } = await import("./renders/sql");
  const ids = checked.ids === "all-live" ? await livePageIds(scope) : checked.ids.length ? await storePageIds(scope, checked.ids) : [];
  const dropped = checked.malformed + (checked.ids === "all-live" ? 0 : checked.ids.length - ids.length);
  // another store's page (or no page at all): never queued, counted once per call
  if (dropped > 0) recordError("renders", null, { code: "foreign_page", storeId, route: `renders:enqueue:${reason}` });
  if (!ids.length) return { enqueued: 0 };
  return { enqueued: await insertJobs(scope, ids, reason, checked.priority) };
}

/**
 * Queues the store's failed jobs' pages again, each with its own reason (the Retry of Store Health and of the console,
 * PLA-§15.1); `reason` narrows to one reason. The failed rows are closed when their page renders (`resolved:<code>`).
 */
export async function retryFailedRenders(scope: WriteScope, reason?: RenderReason | null): Promise<{ enqueued: number }> {
  await writableStore(scope);
  if (reason !== undefined && reason !== null) checkEnqueue([], reason, undefined);
  const { failedJobs, insertJobs } = await import("./renders/sql");
  const byReason = new Map<RenderReason, string[]>();
  for (const j of await failedJobs(scope, reason ?? null)) byReason.set(j.reason, [...(byReason.get(j.reason) ?? []), j.pageId]);
  let enqueued = 0;
  for (const [r, ids] of byReason) enqueued += await insertJobs(scope, [...new Set(ids)], r, r === "conversions" ? CONVERSIONS_PRIORITY : DEFAULT_PRIORITY);
  return { enqueued };
}

/** The console's Retry for one store (`domains.manage`, PLA-§15.1): `retryFailedRenders` through the store's system scope. */
export async function retryStoreRenders(ctx: PlatformCtx, storeId: string, reason?: RenderReason | null): Promise<{ enqueued: number }> {
  const { SeamError } = await import("@/lib/tenancy/seam");
  if (!ctx.can("domains.manage")) throw new SeamError("forbidden");
  if (typeof storeId !== "string" || !/^[0-9A-Za-z]{1,26}$/.test(storeId)) throw new SeamError("not_found");
  const { systemCtx, systemScope } = await import("./scope");
  return retryFailedRenders(systemScope(systemCtx("renders.retry"), storeId), reason);
}

/* ------------------------------------------------------------------ */
/* The platform-wide fan-out                                           */
/* ------------------------------------------------------------------ */

function progressOf(f: FanoutState): FanoutProgress {
  return {
    id: f.id,
    mode: f.mode,
    reason: f.reason,
    requestedAt: f.requestedAt,
    requestedBy: f.requestedBy,
    total: f.total,
    stores: f.stores,
    enqueued: f.enqueued,
    failedStores: f.failedStores,
    pct: f.total > 0 ? Math.min(100, Math.floor((f.stores / f.total) * 100)) : null,
    done: f.doneAt !== null,
    doneAt: f.doneAt,
  };
}

/** A console request (`domains.manage`) or a deploy script's system ctx (§H.10's re-render at the integration deploy). */
async function startFanout(ctx: PlatformCtx | SystemCtx, mode: FanoutMode, reason: RenderReason | null): Promise<{ started: boolean; fanout: FanoutProgress }> {
  const { SeamError } = await import("@/lib/tenancy/seam");
  if ("job" in ctx) {
    if (ctx.actor.kind !== "system") throw new SeamError("forbidden");
  } else if (!ctx.can("domains.manage")) throw new SeamError("forbidden");
  checkFanout(mode, reason);
  const [{ newId }, { countStores }, { writeFanout }] = await Promise.all([import("@/lib/db/ids"), import("./scope"), import("./renders/sql")]);
  const state: FanoutState = {
    id: newId(),
    mode,
    reason,
    priority: DEFAULT_PRIORITY,
    requestedAt: new Date().toISOString(),
    requestedBy: "job" in ctx ? null : ctx.user.id,
    after: "",
    total: await countStores(JOB_STATES),
    stores: 0,
    enqueued: 0,
    failedStores: 0,
    doneAt: null,
  };
  const r = await writeFanout(state, "idle");
  if (r.written) return { started: true, fanout: progressOf(state) };
  return { started: false, fanout: progressOf(r.current!) };
}

/**
 * Re-renders every live page of every store (PLA-§16.2 "Re-render all live pages", §H.10): stores the request and
 * returns at once; the `renders.fanout` job enqueues `'all-live'` store by store. One fan-out at a time: while one is in
 * progress the answer is `started: false` with its progress. The console action audits `platform.domains.rerender`.
 */
export async function enqueueRendersEverywhere(ctx: PlatformCtx | SystemCtx, reason: FanoutReason): Promise<{ started: boolean; fanout: FanoutProgress }> {
  return startFanout(ctx, "live", reason);
}

/** Queues every store's failed jobs again (PLA-§16.2 "Retry failed"), optionally of one reason, through the fan-out. */
export async function retryFailedEverywhere(ctx: PlatformCtx | SystemCtx, reason?: RenderReason | null): Promise<{ started: boolean; fanout: FanoutProgress }> {
  return startFanout(ctx, "failed", reason ?? null);
}

/** The fan-out's progress (the latest one, finished or not), or null before the first. Console code only. */
export async function renderFanoutProgress(): Promise<FanoutProgress | null> {
  const { readFanout } = await import("./renders/sql");
  const f = await readFanout();
  return f ? progressOf(f) : null;
}

/** One store's share of a fan-out, through that store's system scope. */
async function fanoutStore(scope: WriteScope, f: FanoutState): Promise<number> {
  if (f.mode === "failed") return (await retryFailedRenders(scope, f.reason)).enqueued;
  return (await enqueueRenders(scope, "all-live", f.reason!, f.priority)).enqueued;
}

/**
 * The cron's `renders.fanout` job (§H.2 slot 7, every tick, about 1 s; ./tracks/core.ts): nothing to do without a
 * fan-out in progress (one read); else the stores after its `after`, until the deadline, then its progress saved.
 */
export async function rendersFanoutJob(ctx: JobCtx): Promise<JobResult> {
  const { readFanout, writeFanout } = await import("./renders/sql");
  const st = await readFanout();
  if (!st || st.doneAt !== null) return { done: true, processed: 0 };
  const [{ runFanout }, { storesAfter, systemScope }, { recordStoreVisit }] = await Promise.all([import("./renders/fanout"), import("./scope"), import("./recorder")]);
  const run = await runFanout(
    {
      stores: (after, limit) => storesAfter(JOB_STATES, after, limit),
      enqueueStore: (store, f) => fanoutStore(systemScope(ctx, store.id), f),
      now: Date.now,
      deadline: ctx.deadline,
      yieldLoop: () => ctx.yield(),
      onStoreFailed(store, err, ms, startedAt) {
        console.error(`[renders] fan-out: store ${store.id} skipped:`, errorCode(err));
        recordError("renders", err, { storeId: store.id, route: "renders:fanout" });
        recordStoreVisit({ storeId: store.id, startedAt, ms, ok: false, processed: 0, errorCode: errorCode(err), worked: true });
      },
      onStoreDone(store, n, ms, startedAt) {
        if (n > 0) recordStoreVisit({ storeId: store.id, startedAt, ms, ok: true, processed: n, errorCode: null, worked: true });
      },
    },
    st,
  );
  const saved = await writeFanout(run.state, "same");
  return {
    done: run.finished,
    processed: run.enqueued,
    summary: {
      mode: st.mode,
      reason: st.reason ?? "any",
      storesVisited: run.stores,
      enqueued: run.enqueued,
      failedStores: run.failedStores,
      ...(run.finished ? { finished: true } : {}),
      ...(saved.written ? {} : { superseded: true }),
    },
    ...(run.failedStores ? { errorCode: "fanout_store_failed" } : {}),
  };
}

/* ------------------------------------------------------------------ */
/* The renders job                                                     */
/* ------------------------------------------------------------------ */

/**
 * The port in the app: `rerenderInPlace` for every job, except the jobs of an attached page (`pages.product_id`, R2):
 * those run S1's `republishAttached` whatever their reason (§H.3 rev 5, CRIT2-17; LAN Q24, STO-R41; registered at the
 * R2 contract step C2-B2), which decides `sync` vs in place by the diff of the mirror's priced fields. R1 has no
 * attached page, so every R1 job takes the in-place path as before.
 */
async function appPort(): Promise<RenderDeps["port"]> {
  const { rerenderInPlace } = await import("@/lib/render/publish.server");
  const productId = (getTableColumns(pages) as Record<string, AnyMySqlColumn | undefined>).productId;
  return {
    async rerenderInPlace(scope: WriteScope, pageId: string, opts: { reason: RenderReason; actor: Actor }) {
      if (productId && (await attachedPage(scope, pageId, productId))) {
        const { republishAttached } = await import("@/lib/landing/attach.server");
        return republishAttached(scope, pageId, opts);
      }
      return rerenderInPlace(scope, pageId, opts);
    },
  };
}

/** Is this page of the store attached to a product (`pages.product_id`, 0006)? Only asked once the schema has the column. */
async function attachedPage(scope: WriteScope, pageId: string, productId: AnyMySqlColumn): Promise<boolean> {
  const { db } = await import("@/lib/db/client");
  const [row] = await db.select({ productId }).from(pages).where(whereStore(pages, scope, eq(pages.id, pageId))).limit(1);
  return row?.productId !== null && row?.productId !== undefined;
}

/** The drain over the app's database, `rerenderInPlace`, the event loop's busy time and the job's yield. */
async function appDeps(ctx: JobCtx): Promise<RenderDeps> {
  const [{ performance }, { dbRenderRepo }, { newId }, { markHealthDirty }, { invalidateStoreRender }, { invalidateStore }, port] = await Promise.all([
    import("node:perf_hooks"),
    import("./renders/sql"),
    import("@/lib/db/ids"),
    import("@/lib/platform/health-snapshot"),
    import("@/lib/render/cache.server"),
    import("@/lib/tenancy/cache"),
    appPort(),
  ]);
  return {
    repo: dbRenderRepo,
    port,
    actor: ctx.actor,
    now: Date.now,
    deadline: ctx.deadline,
    // the runner's own clock (§H.2 "performance.now() around SSR + gzip"): busy time, so awaiting the database is not CPU
    cpuNow: () => performance.eventLoopUtilization().active,
    lagMs: () => ctx.lagMs(),
    yieldLoop: () => ctx.yield(),
    newClaim: newId,
    onFailed(job, code) {
      void markHealthDirty(job.storeId).catch(() => undefined);
      recordError("renders", null, { code, storeId: job.storeId, route: `renders:${job.reason}` });
    },
    onStoreDone(storeId) {
      invalidateStoreRender(storeId);
      invalidateStore(storeId);
    },
    recordError,
  };
}

/**
 * The cron's `renders` job (§H.2 slot 4, every tick, 12 s; ./tracks/core.ts): the stores with due jobs
 * (`pending_renders`, round robin on the job's cursor), each through ./renders/drain.ts `renderStore` within the run's
 * deadline and CPU budget; once either is spent no further store is visited (and none gets a job_runs row).
 */
export async function rendersJob(ctx: JobCtx): Promise<JobResult> {
  const [{ newRenderRunState, renderStore, stopReason }, { forEachStore, systemScope }] = await Promise.all([import("./renders/drain"), import("./scope")]);
  const deps = await appDeps(ctx);
  const st = newRenderRunState();
  const run = await forEachStore(
    ctx,
    {
      job: ctx.job,
      states: JOB_STATES,
      budgetMs: Math.max(1, ctx.deadline - Date.now()),
      where: "pending_renders",
      stop: () => {
        const why = stopReason(deps, st);
        if (why === "cpu") st.capped = true;
        return why !== null;
      },
    },
    // the frozen callback types its scope as a StoreScope; the outcome writes need the job's own WriteScope
    (_scope, store) => renderStore(deps, systemScope(ctx, store.id), st),
  );
  if (!run.done) st.more = true;
  return {
    done: !st.more,
    processed: st.rendered + st.skipped + st.retried + st.failed + st.superseded + st.requeued,
    // the runner writes its own `done`, `cpuMs` and `stores` into the same summary
    summary: {
      storesRendered: st.stores,
      claimed: st.claimed,
      rendered: st.rendered,
      skipped: st.skipped,
      retried: st.retried,
      failed: st.failed,
      released: st.released,
      superseded: st.superseded,
      requeued: st.requeued,
      notes: st.notes,
      resolved: st.resolved,
      renderMs: Math.round(st.cpuMs),
      ...(st.capped ? { capped: true } : {}),
      ...(st.lost ? { lost: st.lost } : {}),
    },
  };
}

/* ------------------------------------------------------------------ */
/* Summaries                                                           */
/* ------------------------------------------------------------------ */

/**
 * The store's render queue (Store Health, the address card, PLA Q.25). Without a scope: the platform-wide summary
 * (console code only, `platformRenderSummary`).
 */
export async function renderSummary(scope?: StoreScope): Promise<RenderSummary> {
  if (!scope) return platformRenderSummary();
  const [{ storeSummaryInput }, { summarize }] = await Promise.all([import("./renders/summary"), import("./renders/rules")]);
  const now = Date.now();
  return summarize(await storeSummaryInput(scope, now), now);
}

/**
 * Every store's render queue (getHealth().renders, the System health Render queue panel, the Domains view's progress
 * with `reason: "address"`); console code only.
 */
export async function platformRenderSummary(opts: { reason?: RenderReason } = {}): Promise<PlatformRenderSummary> {
  if (opts.reason !== undefined) checkEnqueue([], opts.reason, undefined);
  const [{ platformSummaryInput }, { summarize }] = await Promise.all([import("./renders/summary"), import("./renders/rules")]);
  const now = Date.now();
  const [input, fanout] = await Promise.all([platformSummaryInput(now, opts.reason), renderFanoutProgress()]);
  return { ...summarize(input, now), stores: input.stores, fanout };
}
