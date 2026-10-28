import "server-only";
/**
 * The cron tick and the job runner (docs/STORE-SAAS.md §H.2, OS-08; R1 P8): hPanel calls `/api/cron/tick` every 5
 * minutes and the route answers `runTick()`.
 *
 * 1. The tick lease (./lease.ts, rev 5 CRIT2-18): a `cron_cursors` row, no pooled connection held. Not acquired →
 *    one `job_runs` row `tick` with `{ skipped: true }` and `{ skipped: true }` back (the route still answers 200).
 * 2. The registered jobs (./registry.ts) run in the §H.2 slots (./slots.ts), Sheets first, platform last, each when
 *    due (./due.ts: every tick, once per UTC hour, or once per local day from `dailyAt` in APP_TIMEZONE).
 * 3. Budgets (100 s by default, inside the route's 120 s): a job starts with min(its `budgetMs`, what is left of its
 *    slot, what is left of the tick minus 2 s) as `ctx.deadline`; a slot's budget is the guarantee and a job's
 *    `budgetMs` its cap inside it. Unused time is carried on; only slots 4c and 9 may spend it, within their caps.
 *    No job starts within 2 s of the tick's end. While the event loop's lag p95 is above 100 ms the CPU-bound jobs
 *    (`renders`, `backup`, `exports`) get half their budget for the rest of the tick (ENGC-11).
 * 4. `ctx.yield()` = setImmediate, plus a check of the busy time since the previous yield: more than 2 s without one
 *    is a violation (`summary.noYield`, `recordError("jobs", …, { code: "no_yield" })`). Busy time is the event loop's
 *    active time (`performance.eventLoopUtilization()`, the perf_hooks clock of `performance.now()`), so time spent
 *    awaiting the database or Google is not counted as CPU; `cpuMs` per job is measured the same way.
 * 5. Isolation: a job that throws gets a `job_runs` row with ok = false and its `error_code`, is counted in the error
 *    ring, and the tick goes on. Every run writes its row (`store_id` NULL) plus one row per store that did work
 *    (forEachStore reports to the run's recorder, ./recorder.ts); the tick's own row carries `lagP95Ms`, `skipped`,
 *    `cpuMs` per job and the job list (the Cron panel, PLA-§15.1, and the last-tick alarm of §H.5).
 * 6. The lease is renewed at every job boundary (a lost lease stops the tick) and released in `finally`, then the
 *    error ring is flushed. The pool-wait samplers are attached at the start (`ensureOpsSamplers`).
 *
 * The legacy Sheets shim: until P5 registers `sheets.push`, slot 1 runs today's `syncStores` (push plus the due pull,
 * SHT-11) as a `sheets.push` run with `summary.legacy = true`; it switches itself off once P5's job is registered.
 *
 * `runTickWith(deps)` is the same runner over injected stores and clocks: test:jobs drives it offline with a fake
 * lease, fake clocks and an array of rows; test:storage drives the database stores with fake jobs.
 */
import { performance } from "node:perf_hooks";
import { newId } from "@/lib/db/ids";
import type { StoreStatus, SystemCtx } from "@/lib/tenancy/types";
import { afterRun, isDue, platformTimeZone, type RunOutcome } from "./due";
import { errorCode, flushErrors, recordError, type RecordErrorOpts } from "./errors";
import type { TickLease } from "./lease";
import { currentLagMs, ensureOpsSamplers, startLagSampling, stopLagSampling } from "./metrics";
import { recordingVisits, type StoreVisit } from "./recorder";
import type { JobRunRow, JobRunSink, JobState, JobStateStore } from "./runs";
import { systemCtx } from "./scope";
import { SLOTS, TICK_BUDGET_MS, GUARANTEED_MS, slotById, slotOf, type Slot, type SlotId } from "./slots";

export interface Job {
  name: string; // ≤ 48 chars, e.g. "sheets.push"
  every: "tick" | "hourly" | { dailyAt: string /* "03:10" platform timezone */ };
  budgetMs: number; // its cap inside its slot (src/lib/jobs/slots.ts); the guaranteed slices of the slots sum to 95 s
  perStore?: { states: readonly StoreStatus[]; maxStoresPerTick: number; where?: "pending_sheets" | "pending_outbox" | "pending_renders" };
  run(ctx: JobCtx): Promise<JobResult>; // must check ctx.deadline between units of work
}

export interface JobCtx extends SystemCtx {
  deadline: number; // epoch ms
  tickId: string;
  cursor: string; // the job's round-robin cursor (cron_cursors)
  setCursor(c: string): Promise<void>;
  /** rev 3 (ENGC-11): awaited between units of work (setImmediate), so the serving event loop breathes */
  yield(): Promise<void>;
  /** rev 3: the runner's event-loop lag estimate; renders and backups shorten their own budget above 100 ms */
  lagMs(): number;
}

export interface JobResult {
  /** false: work is left for the next tick */
  done: boolean;
  /** counts and codes for job_runs.summary (no customer data) */
  summary?: Record<string, number | string | boolean>;
  /** P8 (additive): rows or items handled, `job_runs.processed`; else the per-store counts forEachStore reported */
  processed?: number;
  /** P8 (additive): the run finished but a unit of it failed: `job_runs.ok` = false with this code, the summary kept */
  errorCode?: string;
}

export interface TickReport {
  tickId: string;
  /** another tick held the lease: nothing ran */
  skipped: boolean;
  startedAt: string;
  ms: number;
  lagP95Ms: number | null;
  /** P8 (additive): `slot`, `budgetMs` (what the job was given) and `noYield` per job */
  jobs: { name: string; ms: number; cpuMs?: number; done?: boolean; error?: string; slot?: SlotId; budgetMs?: number; noYield?: boolean }[];
  /** P8 (additive): due jobs not started (their slot or the tick was spent, or the lease was lost), in run order */
  notStarted?: string[];
  /** P8 (additive): another tick took the lease over; this one stopped starting jobs */
  leaseLost?: boolean;
}

/** no job starts within this much of the tick's end */
export const STOP_BEFORE_END_MS = 2_000;
/** busy time without a `ctx.yield()` that counts as a violation (§J.1, ENGC-11) */
export const NO_YIELD_MS = 2_000;
/** lag p95 above which the CPU-bound jobs get half their budget for the rest of the tick */
export const LAG_SHORTEN_MS = 100;
/** the CPU-bound jobs (§H.2) */
export const CPU_BOUND_JOBS: ReadonlySet<string> = new Set(["renders", "backup", "exports"]);
/** per-store job_runs rows one run writes at most (the rest are counted in its summary) */
export const MAX_STORE_ROWS = 200;

/** What the runner works with: the app's tables and clocks, or fakes in the tests. */
export interface RunnerDeps {
  jobs: readonly Job[];
  lease: TickLease;
  state: JobStateStore;
  runs: JobRunSink;
  /** wall clock, epoch ms */
  now(): number;
  /** the event loop's cumulative busy time, ms (`performance.eventLoopUtilization().active`) */
  cpuNow(): number;
  lag: { start(): void; stop(): { p95Ms: number | null; maxMs: number | null }; current(): number };
  yieldLoop(): Promise<void>;
  /** the legacy Sheets step while no `sheets.push` job is registered (today's syncStores) */
  legacySheets(ctx: JobCtx, budgetMs: number): Promise<JobResult>;
  /** the platform zone of the `dailyAt` times */
  timeZone: string;
  newTickId(): string;
  recordError(area: string, err: unknown, opts?: RecordErrorOpts): void;
  flushErrors(): Promise<void>;
  ensureSamplers(): void;
  /** tests: called at every job boundary, after the job's rows, its due state and the lease renewal */
  onBoundary?(job: string): void;
}

/** The app's runner: the database stores, the registry, the real clocks. */
export async function defaultRunnerDeps(): Promise<RunnerDeps> {
  const [{ JOBS }, { dbTickLease }, { dbJobRuns, dbJobState }] = await Promise.all([import("./registry"), import("./lease"), import("./runs")]);
  return {
    jobs: JOBS,
    lease: dbTickLease,
    state: dbJobState,
    runs: dbJobRuns,
    now: Date.now,
    cpuNow: () => performance.eventLoopUtilization().active,
    lag: { start: startLagSampling, stop: stopLagSampling, current: currentLagMs },
    yieldLoop: () => new Promise<void>((resolve) => setImmediate(resolve)),
    legacySheets: async (ctx, budgetMs) => {
      const { syncStores } = await import("@/lib/sheets/sync");
      const r = await syncStores(ctx, { budgetMs });
      return { done: r.done, processed: r.appended + r.pulled, summary: { visited: r.visited, appended: r.appended, pulled: r.pulled, failedStores: r.failedStores } };
    },
    timeZone: platformTimeZone(),
    newTickId: newId,
    recordError,
    flushErrors: () => flushErrors(),
    ensureSamplers: () => void ensureOpsSamplers(),
  };
}

/** rev 5 (CRIT2-18): the lease first; not acquired → `{ skipped: true }`. */
export async function runTick(opts?: { budgetMs?: number /* default 100_000 */ }): Promise<TickReport> {
  return runTickWith(await defaultRunnerDeps(), opts);
}

/** `sheets.push` as today's syncStores, while P5 has not registered its own (slot 1's budget). */
function legacySheetsJob(deps: RunnerDeps): Job {
  return {
    name: "sheets.push",
    every: "tick",
    budgetMs: slotById("1").budgetMs,
    run: async (ctx) => {
      const r = await deps.legacySheets(ctx, Math.max(1, ctx.deadline - deps.now()));
      return { ...r, summary: { ...r.summary, legacy: true } };
    },
  };
}

/** The slots in run order with their registered jobs (registry order inside a slot; a repeated name runs once). */
function planTick(deps: RunnerDeps): { slot: Slot; jobs: Job[] }[] {
  const seen = new Set<string>();
  const jobs = deps.jobs.filter((j) => (seen.has(j.name) ? false : (seen.add(j.name), true)));
  const legacy = seen.has("sheets.push") ? null : legacySheetsJob(deps);
  return SLOTS.map((slot) => ({ slot, jobs: [...(slot.id === "1" && legacy ? [legacy] : []), ...jobs.filter((j) => slotOf(j) === slot.id)] }));
}

async function writeRows(deps: RunnerDeps, rows: JobRunRow[]): Promise<void> {
  try {
    await deps.runs.write(rows);
  } catch (err) {
    console.error("[jobs] job_runs not written:", errorCode(err));
    deps.recordError("jobs", err, { route: "job_runs" });
  }
}

type ReportEntry = TickReport["jobs"][number];

/** One job run: its ctx, the run inside a recorder, the busy-time checks, its rows and its due state. */
async function runOne(deps: RunnerDeps, job: Job, slot: SlotId, budgetMs: number, tickId: string, state: JobState | undefined, halved: boolean): Promise<ReportEntry> {
  const startedAt = deps.now();
  const cpu0 = deps.cpuNow();
  const visits: StoreVisit[] = [];
  let lastYield = cpu0;
  let maxSpan = 0;
  let noYield = 0;
  const checkSpan = (): void => {
    const span = deps.cpuNow() - lastYield;
    if (span > maxSpan) maxSpan = span;
    if (span > NO_YIELD_MS && noYield++ === 0) deps.recordError("jobs", null, { code: "no_yield", route: `job:${job.name}` });
  };

  let result: JobResult | null = null;
  let thrown: unknown = null;
  let threw = false;
  try {
    const ctx: JobCtx = {
      ...systemCtx(job.name),
      deadline: startedAt + budgetMs,
      tickId,
      cursor: state?.cursor ?? "",
      async setCursor(c) {
        await deps.state.setCursor(job.name, c);
        ctx.cursor = c;
      },
      async yield() {
        checkSpan();
        await deps.yieldLoop();
        // the busy time of other requests during the yield is theirs, not this job's
        lastYield = deps.cpuNow();
      },
      lagMs: () => deps.lag.current(),
    };
    result = await recordingVisits({ visit: (v) => void visits.push(v) }, () => job.run(ctx));
  } catch (err) {
    thrown = err;
    threw = true;
  }
  checkSpan();
  const ms = deps.now() - startedAt;
  const cpuMs = Math.max(0, Math.round(deps.cpuNow() - cpu0));

  let code: string | null = null;
  if (threw) {
    code = errorCode(thrown);
    console.error(`[jobs] ${job.name} failed:`, code);
    deps.recordError("jobs", thrown, { route: `job:${job.name}` });
  } else if (result?.errorCode) code = errorCode(null, result.errorCode);
  const done = !threw && result?.done === true;

  const worked = visits.filter((v) => v.worked);
  const rows: JobRunRow[] = [
    {
      job: job.name,
      storeId: null,
      tickId,
      startedAt,
      ms,
      ok: code === null,
      processed: result?.processed ?? visits.reduce((n, v) => n + v.processed, 0),
      summary: {
        ...result?.summary,
        done,
        slot,
        budgetMs,
        cpuMs,
        ...(halved ? { lagShortened: true } : {}),
        ...(noYield ? { noYield: true, maxNoYieldMs: Math.round(maxSpan) } : {}),
        ...(visits.length ? { stores: visits.length, storesWorked: worked.length } : {}),
        ...(worked.length > MAX_STORE_ROWS ? { storeRowsDropped: worked.length - MAX_STORE_ROWS } : {}),
      },
      errorCode: code,
    },
    ...worked.slice(0, MAX_STORE_ROWS).map((v) => ({ job: job.name, storeId: v.storeId, tickId, startedAt: v.startedAt, ms: v.ms, ok: v.ok, processed: v.processed, summary: null, errorCode: v.errorCode })),
  ];
  await writeRows(deps, rows);

  const outcome: RunOutcome = threw ? "failed" : done ? "done" : "partial";
  const due = afterRun(job.every, state?.due, startedAt, deps.timeZone, outcome);
  if (due) {
    await deps.state.saveDue(job.name, due).catch((err: unknown) => {
      console.error(`[jobs] ${job.name}: due state not saved:`, errorCode(err));
      deps.recordError("jobs", err, { route: `job:${job.name}` });
    });
  }

  return { name: job.name, ms, cpuMs, done, ...(code ? { error: code } : {}), slot, budgetMs, ...(noYield ? { noYield: true } : {}) };
}

/** The runner over `deps` (runTick passes the app's; the tests pass fakes). */
export async function runTickWith(deps: RunnerDeps, opts: { budgetMs?: number } = {}): Promise<TickReport> {
  const budgetMs = opts.budgetMs !== undefined && Number.isFinite(opts.budgetMs) && opts.budgetMs > 0 ? opts.budgetMs : TICK_BUDGET_MS;
  deps.ensureSamplers();
  const tickId = deps.newTickId();
  const started = deps.now();
  const startedAt = new Date(started).toISOString();

  if (!(await deps.lease.acquire(tickId))) {
    const ms = deps.now() - started;
    await writeRows(deps, [{ job: "tick", storeId: null, tickId, startedAt: started, ms, ok: true, processed: 0, summary: { skipped: true }, errorCode: null }]);
    return { tickId, skipped: true, startedAt, ms, lagP95Ms: null, jobs: [] };
  }

  const deadline = started + budgetMs;
  const report: TickReport = { tickId, skipped: false, startedAt, ms: 0, lagP95Ms: null, jobs: [] };
  const notStarted: string[] = [];
  let leaseLost = false;
  let lagStopped = false;
  deps.lag.start();
  try {
    const plan = planTick(deps);
    const states = await deps.state.load(plan.flatMap((p) => p.jobs.map((j) => j.name)));
    // the 5 s the table leaves unassigned is slot 9's leftover (§H.2, PLA Q.18)
    const unassigned = Math.max(0, budgetMs - GUARANTEED_MS);
    let carried = 0;
    let shortened = false;
    let stop = false;

    for (const { slot, jobs } of plan) {
      const due = jobs.filter((j) => isDue(j.every, states.get(j.name)?.due, deps.now(), deps.timeZone));
      if (stop) {
        notStarted.push(...due.map((j) => j.name));
        continue;
      }
      if (!due.length) {
        carried += slot.budgetMs;
        continue;
      }
      const extra = slot.leftoverCapMs ? Math.min(slot.leftoverCapMs, Math.max(0, carried + (slot.id === "9" ? unassigned : 0))) : 0;
      const allowance = slot.budgetMs + extra;
      const slotStart = deps.now();
      for (const job of due) {
        const now = deps.now();
        const tickLeft = deadline - STOP_BEFORE_END_MS - now;
        if (stop || tickLeft <= 0) {
          stop = true;
          notStarted.push(job.name);
          continue;
        }
        if (!shortened && deps.lag.current() > LAG_SHORTEN_MS) shortened = true;
        const halved = shortened && CPU_BOUND_JOBS.has(job.name);
        const cap = Number.isFinite(job.budgetMs) ? job.budgetMs : 0;
        let budget = Math.min(cap, allowance - (now - slotStart), tickLeft);
        if (halved) budget = Math.floor(budget / 2);
        if (budget <= 0) {
          notStarted.push(job.name);
          continue;
        }
        report.jobs.push(await runOne(deps, job, slot.id, budget, tickId, states.get(job.name), halved));
        let held = false;
        try {
          held = await deps.lease.renew(tickId);
        } catch (err) {
          // the lease cannot be proven: stop rather than race a tick that may have taken it over
          console.error("[jobs] tick lease not renewed:", errorCode(err));
        }
        if (!held) leaseLost = stop = true;
        deps.onBoundary?.(job.name);
      }
      // unused time is carried on; an overrun (or leftover spent here) is taken back from it
      carried += slot.budgetMs - (deps.now() - slotStart);
    }

    const lag = deps.lag.stop();
    lagStopped = true;
    report.lagP95Ms = lag.p95Ms;
    report.ms = deps.now() - started;
    if (notStarted.length) report.notStarted = notStarted;
    if (leaseLost) report.leaseLost = true;
    const failed = report.jobs.filter((j) => j.error);
    await writeRows(deps, [
      {
        job: "tick",
        storeId: null,
        tickId,
        startedAt: started,
        ms: report.ms,
        ok: !failed.length && !leaseLost,
        processed: report.jobs.length,
        summary: {
          skipped: false,
          lagP95Ms: lag.p95Ms,
          lagMaxMs: lag.maxMs,
          budgetMs,
          cpuMs: Object.fromEntries(report.jobs.map((j) => [j.name, j.cpuMs ?? 0])),
          jobs: report.jobs.map((j) => ({ name: j.name, ms: j.ms, ok: !j.error, done: j.done ?? false })),
          ...(shortened ? { lagShortened: true } : {}),
          ...(notStarted.length ? { notStarted } : {}),
          ...(leaseLost ? { leaseLost: true } : {}),
        },
        errorCode: leaseLost ? "lease_lost" : failed.length ? "jobs_failed" : null,
      },
    ]);
    return report;
  } finally {
    if (!lagStopped) deps.lag.stop();
    await deps.lease.release(tickId).catch((err: unknown) => console.error("[jobs] tick lease not released:", errorCode(err)));
    await deps.flushErrors().catch(() => undefined);
  }
}
