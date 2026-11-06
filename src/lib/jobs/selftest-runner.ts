/**
 * test:jobs, the runner's sections (P8 step 3; docs/STORE-SAAS.md §H.2, §J.1). Loaded by ./selftest.ts after its
 * server-only stub, offline: a fake lease, fake clocks (wall and busy time), a fake job_runs sink and a fake
 * cron_cursors store; nothing here opens a connection.
 *
 *  slots        Σ = 95 s, slotOf for every R1 name and the fallbacks, the job budget rules, guaranteedMs, the slot-6
 *               daily spread (≤ 2 per 5-minute window) on the registry and on the spec's R1 schedule;
 *  capacity     the ENGC-33 Sheets arithmetic;
 *  due          tick / hourly / dailyAt in APP_TIMEZONE: once per day with catch-up, DST gap and repeat, the 3-failure
 *               cap, partial runs stay due;
 *  round robin  fairness on a fake clock (a slow store does not starve the others), pages, the cursor;
 *  runner       the lease (skipped on overlap with its job_runs row, an expired lease taken over, renew at every
 *               boundary, release, a lease lost mid-tick), no lock-pool connection held between jobs (pool spy), the
 *               budget allocation (slot caps, leftover only into 4c and 9, the 2 s stop, lag > 100 ms halves the
 *               CPU-bound jobs), the yield contract, isolation, job_runs rows (run, per store, tick), due state, the
 *               legacy Sheets shim.
 */
import type { Checks, FakeClock, Harness } from "./testing/harness";
import type { Job, JobCtx, JobResult, RunnerDeps, TickReport } from "./runner";
import type { JobRunRow, JobState } from "./runs";
import type { TickLease } from "./lease";
import type { DueState } from "./due";
import type { LockPool } from "@/lib/db/locks";

type Runner = typeof import("./runner");
type Slots = typeof import("./slots");
type Due = typeof import("./due");
type Capacity = typeof import("./capacity");
type Scope = typeof import("./scope");
type Recorder = typeof import("./recorder");
type Locks = typeof import("@/lib/db/locks");

export interface RunnerSectionDeps {
  R: Runner;
  S: Slots;
  D: Due;
  C: Capacity;
  SC: Scope;
  REC: Recorder;
  L: Locks;
  JOBS: readonly Job[];
  Clock: typeof FakeClock;
  /** a fake 2-connection lock pool, installed as the process's lock pool for the pool-spy case */
  installLockPool(): { pool: LockPool; free(): number; gets(): number };
  restoreLockPool(): void;
}

const T0 = Date.UTC(2026, 9, 28, 9, 0, 0); // Wednesday 28 October 2026, 09:00 UTC = 10:00 in Casablanca (UTC+1)

/** The tick lease with the SQL's semantics on a fake clock. */
class FakeLease implements TickLease {
  cursor = "";
  updatedAt = 0;
  acquires = 0;
  renews = 0;
  releases = 0;
  constructor(private readonly now: () => number) {}
  async acquire(tickId: string): Promise<boolean> {
    this.acquires++;
    if (this.cursor !== "" && this.updatedAt >= this.now() - 110_000) return false;
    this.cursor = tickId;
    this.updatedAt = this.now();
    return true;
  }
  async renew(tickId: string): Promise<boolean> {
    this.renews++;
    if (this.cursor !== tickId) return false;
    this.updatedAt = this.now();
    return true;
  }
  async release(tickId: string): Promise<void> {
    this.releases++;
    if (this.cursor !== tickId) return;
    this.cursor = "";
    this.updatedAt = this.now();
  }
}

interface Fake {
  deps: RunnerDeps;
  clock: FakeClock;
  lease: FakeLease;
  rows: JobRunRow[];
  state: Map<string, JobState>;
  errors: { area: string; code: string | null; route: string | null }[];
  /** busy time (ms) the jobs "spend" */
  cpu: { ms: number };
  lag: { ms: number };
  legacyCalls: { job: string; budgetMs: number }[];
  counters: { flushes: number; samplers: number; boundaries: string[] };
  tick(budgetMs?: number): Promise<TickReport>;
}

function fakeRunner(Clock: typeof FakeClock, R: Runner, jobs: readonly Job[], start = T0): Fake {
  const clock = new Clock(start);
  const lease = new FakeLease(clock.now);
  const rows: JobRunRow[] = [];
  const state = new Map<string, JobState>();
  const errors: Fake["errors"] = [];
  const cpu = { ms: 0 };
  const lag = { ms: 0 };
  const legacyCalls: Fake["legacyCalls"] = [];
  const counters: Fake["counters"] = { flushes: 0, samplers: 0, boundaries: [] };
  let ticks = 0;
  const deps: RunnerDeps = {
    jobs,
    lease,
    state: {
      load: async (names) => new Map(names.filter((n) => state.has(n)).map((n) => [n, { ...state.get(n)! }])),
      setCursor: async (job, cursor) => void state.set(job, { cursor, due: state.get(job)?.due ?? null }),
      saveDue: async (job, due) => void state.set(job, { cursor: state.get(job)?.cursor ?? "", due: { ...due } }),
    },
    runs: { write: async (r) => void rows.push(...r) },
    now: clock.now,
    cpuNow: () => cpu.ms,
    lag: { start: () => undefined, stop: () => ({ p95Ms: lag.ms, maxMs: lag.ms }), current: () => lag.ms },
    yieldLoop: async () => undefined,
    legacySheets: async (ctx, budgetMs) => {
      legacyCalls.push({ job: ctx.job, budgetMs });
      return { done: true, processed: 2, summary: { visited: 1, appended: 2, pulled: 0, failedStores: 0 } };
    },
    timeZone: "Africa/Casablanca",
    newTickId: () => `TICK${String(++ticks).padStart(22, "0")}`,
    recordError: (area, _err, o) => void errors.push({ area, code: o?.code ?? null, route: o?.route ?? null }),
    flushErrors: async () => void counters.flushes++,
    ensureSamplers: () => void counters.samplers++,
    onBoundary: (job) => void counters.boundaries.push(job),
  };
  return { deps, clock, lease, rows, state, errors, cpu, lag, legacyCalls, counters, tick: (budgetMs) => R.runTickWith(deps, budgetMs ? { budgetMs } : {}) };
}

/** A job that records the budget it was given (ctx.deadline - now) and spends `spendMs` of the fake clock. */
function probe(clock: () => FakeClock, name: string, every: Job["every"], budgetMs: number, seen: Map<string, number>, spendMs = 0, result: JobResult = { done: true }): Job {
  return {
    name,
    every,
    budgetMs,
    run: async (ctx) => {
      seen.set(name, ctx.deadline - clock().now());
      clock().advance(spendMs === -1 ? ctx.deadline - clock().now() : spendMs);
      return result;
    },
  };
}

const tickRow = (rows: JobRunRow[]) => rows.filter((r) => r.job === "tick").at(-1);

/** Runs `fn` with console.error silenced: the failures it provokes are expected, their log lines are not output. */
async function quiet(fn: () => Promise<void>): Promise<void> {
  const orig = console.error;
  console.error = () => undefined;
  try {
    await fn();
  } finally {
    console.error = orig;
  }
}

export function runnerSections(h: Harness, x: RunnerSectionDeps): void {
  const { R, S, D, C, SC, REC, L, JOBS, Clock } = x;

  /* ---------------------------------------------------------------- */
  h.section("slots: the table", (t) => {
    t.eq("11 slots in §H.2 order", S.SLOTS.map((s) => s.id), ["1", "2", "3", "4", "4b", "4c", "5", "6", "7", "8", "9"]);
    t.eq("the guaranteed slices sum to 95 s", S.GUARANTEED_MS, 95_000);
    t.eq("the budgets of §H.2", S.SLOTS.map((s) => s.budgetMs), [18_000, 12_000, 13_000, 12_000, 8_000, 1_000, 11_000, 8_000, 5_000, 4_000, 3_000]);
    t.eq("leftover only in 4c (≤ 5 s) and 9 (≤ 6 s)", S.SLOTS.filter((s) => s.leftoverCapMs).map((s) => [s.id, s.leftoverCapMs]), [["4c", 5_000], ["9", 6_000]]);
    t.eq("the tick's default budget", S.TICK_BUDGET_MS, 100_000);
    t.check("the table is frozen", Object.isFrozen(S.SLOTS) && S.SLOTS.every((s) => Object.isFrozen(s)));
    const tick = (name: string) => S.slotOf({ name, every: "tick" });
    const named: [string, string][] = [
      ["sheets.push", "1"], ["sheets.pull", "2"], ["outbox", "3"], ["renders", "4"], ["ai.batches", "4b"], ["ai.jobs", "4c"],
      ["exports", "5"], ["backup", "5"], ["purge", "5"], ["imports.commit", "5"],
      ["media.migrate", "6"], ["usage.reconcile", "6"], ["ops.rollup", "6"], ["ops.customers_reconcile", "6"], ["fin.alerts", "6"], ["ai.rollups", "6"],
      ["ai.reconcile", "6"], ["ai.retention", "6"], ["design.retention", "6"], ["design.shingles", "6"], ["leads.followups", "6"], ["delivery.holidays_review", "6"],
      ["lifecycle", "7"], ["ops.presence", "7"], ["sheets.bind_legacy", "7"], ["int.telegram_daily", "7"], ["links.flush", "7"], ["design.reserve", "7"], ["design.backfill", "7"],
      ["housekeeping", "8"], ["ops.capi_ctx_purge", "8"],
      ["platform.health", "9"], ["platform.alarms", "9"], ["platform.requests", "9"], ["platform.entitlements", "9"],
    ];
    t.eq("every R1 job name of §H.2, OPE-§J, AI-§N, DES-§24.1, LAN-§23.4, PLA-§15 in its slot", named.filter(([n, s]) => tick(n) !== s), []);
    t.eq("a name wins over every: ops.rollup daily, ai.rollups hourly, int.telegram_daily hourly", [S.slotOf({ name: "ops.rollup", every: { dailyAt: "02:40" } }), S.slotOf({ name: "ai.rollups", every: "hourly" }), S.slotOf({ name: "int.telegram_daily", every: "hourly" })], ["6", "6", "7"]);
    t.eq("unknown name: tick → 7, hourly → 6, daily → 6", [tick("zz.new"), S.slotOf({ name: "zz.new", every: "hourly" }), S.slotOf({ name: "zz.new", every: { dailyAt: "05:00" } })], ["7", "6", "6"]);
    t.eq("the platform.* family → 9", tick("platform.digest"), "9");
    t.eq("prototype names are not slot names", [tick("constructor"), tick("__proto__"), tick("toString")], ["7", "7", "7"]);
    t.eq("the most a job may declare: slot + leftover cap", [S.maxJobBudgetMs("3"), S.maxJobBudgetMs("4c"), S.maxJobBudgetMs("9")], [13_000, 6_000, 9_000]);
    t.eq("dailyMinutes", [S.dailyMinutes("03:10"), S.dailyMinutes("00:00"), S.dailyMinutes("23:59"), S.dailyMinutes("24:00"), S.dailyMinutes("3:10"), S.dailyMinutes("03:60")], [190, 0, 1439, null, null, null]);
  });

  h.section("slots: job budget rules", (t) => {
    t.eq("registry: every job has a budget > 0, a slot, and fits it (+ the leftover cap in 4c / 9)", S.jobBudgetProblems(JOBS), []);
    t.check("registry: the guaranteed budgets claim ≤ 95 s", S.guaranteedMs(JOBS) <= 95_000, String(S.guaranteedMs(JOBS)));
    t.eq("registry: no 5-minute window holds more than 2 slot-6 daily jobs", S.dailyCollisions(JOBS), []);
    const hk = JOBS.find((j) => j.name === "housekeeping");
    t.check("housekeeping is registered: slot 8, every tick, 4 s", !!hk && S.slotOf(hk) === "8" && hk.every === "tick" && hk.budgetMs === 4_000);
    const bad: Pick<Job, "name" | "every" | "budgetMs">[] = [
      { name: "a", every: "tick", budgetMs: 0 },
      { name: "outbox", every: "tick", budgetMs: 13_001 },
      { name: "ai.jobs", every: "tick", budgetMs: 6_000 },
      { name: "ai.jobs", every: "tick", budgetMs: 6_000 },
      { name: "platform.health", every: "tick", budgetMs: 9_001 },
      { name: "zz.daily", every: { dailyAt: "25:00" }, budgetMs: 1_000 },
      { name: "zz.weird", every: "weekly" as never, budgetMs: 1_000 },
      { name: "zz.nan", every: "tick", budgetMs: NaN },
    ];
    t.eq("the rules catch each problem", S.jobBudgetProblems(bad), [
      "a: no positive budget",
      "outbox: 13001 ms > slot 3 (13000 ms)",
      "ai.jobs: registered twice",
      "platform.health: 9001 ms > slot 9 (9000 ms)",
      "zz.daily: bad every",
      "zz.weird: bad every",
      "zz.nan: no positive budget",
    ]);
    const many: Pick<Job, "name" | "every" | "budgetMs">[] = [
      { name: "ai.rollups", every: "hourly", budgetMs: 5_000 },
      { name: "ai.retention", every: { dailyAt: "03:50" }, budgetMs: 5_000 },
      { name: "design.retention", every: { dailyAt: "03:50" }, budgetMs: 5_000 },
      { name: "platform.health", every: "tick", budgetMs: 9_000 },
      { name: "platform.alarms", every: "tick", budgetMs: 1_000 },
      { name: "outbox", every: "tick", budgetMs: 13_000 },
    ];
    t.eq("guaranteedMs: a shared slot claims at most its own budget (6: 8 s, 9: 3 s, 3: 13 s)", S.guaranteedMs(many), 8_000 + 3_000 + 13_000);
  });

  h.section("slots: daily spread", (t) => {
    // the R1 daily jobs the parts placed (OPE-§J, AI-§N, DES-§24.1, §H.6 backup in slot 5, capi purge in slot 8)
    const r1: Pick<Job, "name" | "every">[] = [
      { name: "ops.rollup", every: { dailyAt: "02:40" } },
      { name: "ops.customers_reconcile", every: { dailyAt: "03:10" } },
      { name: "ops.capi_ctx_purge", every: { dailyAt: "03:20" } },
      { name: "backup", every: { dailyAt: "03:30" } },
      { name: "ai.retention", every: { dailyAt: "03:50" } },
      { name: "design.retention", every: { dailyAt: "03:50" } },
      { name: "fin.alerts", every: { dailyAt: "04:00" } },
      { name: "design.shingles", every: { dailyAt: "04:10" } },
      { name: "ai.rollups", every: "hourly" },
    ];
    t.eq("the spec's R1 schedule holds: ≤ 2 slot-6 daily jobs per window", S.dailyCollisions(r1), []);
    const third = [...r1, { name: "zz.daily", every: { dailyAt: "03:47" } }];
    t.eq("a third job due in the 03:50 tick (03:47 waits for it) is reported", S.dailyCollisions(third), [{ window: "03:50", jobs: ["ai.retention", "design.retention", "zz.daily"] }]);
    t.eq("slot 5 and 8 daily jobs are not slot 6's", S.dailyCollisions([...r1, { name: "purge", every: { dailyAt: "03:50" } }, { name: "imports.cleanup", every: { dailyAt: "03:50" } }]), []);
    t.eq("23:58 is due in the 00:00 tick", S.dailyCollisions(["a", "b", "c"].map((n, i) => ({ name: `zz.${n}`, every: { dailyAt: ["23:58", "00:00", "23:56"][i]! } }))), [{ window: "00:00", jobs: ["zz.a", "zz.b", "zz.c"] }]);
  });

  /* ---------------------------------------------------------------- */
  h.section("capacity: ENGC-33", (t) => {
    t.eq("floor(50 / 3) = 16 stores per tick", C.sheetsCapacity(1).storesPerTick, 16);
    t.eq("0 stores", C.sheetsCapacity(0), { storesPerTick: 16, everyTicks: 0, backlogAlarmMin: 15 });
    t.eq("16 stores: every tick, alarm floor 15 min", C.sheetsCapacity(16), { storesPerTick: 16, everyTicks: 1, backlogAlarmMin: 15 });
    t.eq("17 stores: every 2 ticks, still 15 min", C.sheetsCapacity(17), { storesPerTick: 16, everyTicks: 2, backlogAlarmMin: 15 });
    t.eq("48 stores: every 3 ticks, 15 min", C.sheetsCapacity(48), { storesPerTick: 16, everyTicks: 3, backlogAlarmMin: 15 });
    t.eq("49 stores: every 4 ticks, 20 min", C.sheetsCapacity(49), { storesPerTick: 16, everyTicks: 4, backlogAlarmMin: 20 });
    t.eq("100 stores: every 7 ticks, 35 min", C.sheetsCapacity(100), { storesPerTick: 16, everyTicks: 7, backlogAlarmMin: 35 });
    t.eq("a bad count reads as 0", [C.sheetsCapacity(-3), C.sheetsCapacity(NaN), C.sheetsCapacity(Infinity)].map((c) => c.everyTicks), [0, 0, 0]);
    t.eq("a fractional count is floored", C.sheetsCapacity(16.9).everyTicks, 1);
  });

  /* ---------------------------------------------------------------- */
  h.section("due: zone and periods", (t) => {
    t.eq("APP_TIMEZONE unset → Africa/Casablanca", D.platformTimeZone(undefined), "Africa/Casablanca");
    t.eq("an unknown zone → Africa/Casablanca", D.platformTimeZone("Mars/Olympus"), "Africa/Casablanca");
    t.eq("a known zone is kept", D.platformTimeZone(" Europe/Paris "), "Europe/Paris");
    t.eq("hourKey is UTC", D.hourKey(Date.UTC(2026, 9, 28, 23, 59)), "2026-10-28T23");
    t.eq("localClock in Casablanca (UTC+1 on 28 Oct 2026)", D.localClock(Date.UTC(2026, 9, 28, 23, 30), "Africa/Casablanca"), { day: "2026-10-29", minutes: 30 });
    t.check("tick jobs are always due", D.isDue("tick", null, T0, "Africa/Casablanca") && D.afterRun("tick", null, T0, "Africa/Casablanca", "done") === null);
    t.check("a bad every is never due", !D.isDue({ dailyAt: "7am" }, null, T0, "UTC") && !D.isDue("weekly" as never, null, T0, "UTC"));
  });

  h.section("due: dailyAt in APP_TIMEZONE", (t) => {
    const daily = { dailyAt: "03:10" } as const;
    const tz = "Africa/Casablanca";
    const at = (d: number, h: number, m: number) => Date.UTC(2026, 9, d, h, m);
    let s: DueState | null = null;
    t.check("03:05 local (02:05 UTC): not yet", !D.isDue(daily, s, at(28, 2, 5), tz));
    t.check("03:10 local: due", D.isDue(daily, s, at(28, 2, 10), tz));
    s = D.afterRun(daily, s, at(28, 2, 10), tz, "done");
    t.eq("done → lastDay is the local day", s?.lastDay, "2026-10-28");
    t.check("03:15 and 23:55 local: not again that day", !D.isDue(daily, s, at(28, 2, 15), tz) && !D.isDue(daily, s, at(28, 22, 55), tz));
    t.check("00:05 local the next day: not before 03:10", !D.isDue(daily, s, at(28, 23, 5), tz));
    t.check("catch-up: the server was down at 03:10, 10:00 local the next day runs it", D.isDue(daily, s, at(29, 9, 0), tz));
    s = D.afterRun(daily, s, at(29, 9, 0), tz, "done");
    t.check("…once", !D.isDue(daily, s, at(29, 9, 5), tz) && s?.lastDay === "2026-10-29");
    // the same instant in another platform zone: 03:10 in Tokyo is 18:10 UTC the day before
    t.check("Asia/Tokyo: due at 18:10 UTC, not at 18:05", D.isDue(daily, null, at(27, 18, 10), "Asia/Tokyo") && !D.isDue(daily, null, at(27, 18, 5), "Asia/Tokyo"));
    // partial runs stay due; failures are retried 3 times, then the day is given up
    let p = D.afterRun(daily, null, at(28, 2, 10), tz, "partial");
    t.check("done: false → still due next tick", D.isDue(daily, p, at(28, 2, 15), tz));
    p = D.afterRun(daily, p, at(28, 2, 15), tz, "failed");
    t.check("1st failure: still due, counted", D.isDue(daily, p, at(28, 2, 20), tz) && p?.fails === 1 && p.failKey === "2026-10-28");
    p = D.afterRun(daily, p, at(28, 2, 20), tz, "failed");
    t.check("2nd failure: still due", D.isDue(daily, p, at(28, 2, 25), tz) && p?.fails === 2);
    p = D.afterRun(daily, p, at(28, 2, 25), tz, "failed");
    t.check("3rd failure: the day is given up", !D.isDue(daily, p, at(28, 2, 30), tz) && p?.lastDay === "2026-10-28" && p.fails === null);
    t.check("…and the next day runs again", D.isDue(daily, p, at(29, 2, 10), tz));
    const y = D.afterRun(daily, { lastDay: "2026-10-27", fails: 2, failKey: "2026-10-27" }, at(28, 2, 10), tz, "failed");
    t.check("an old period's failures do not count", y?.fails === 1 && y.failKey === "2026-10-28");
    // DST in a zone that has it (Europe/Paris, 2026): the gap on 29 March, the repeated hour on 25 October
    const paris = "Europe/Paris";
    const dst = { dailyAt: "02:30" } as const;
    t.check("spring gap: 02:30 never exists; it runs at the first tick after (03:00 local = 01:00 UTC)", !D.isDue(dst, null, Date.UTC(2026, 2, 29, 0, 55), paris) && D.isDue(dst, null, Date.UTC(2026, 2, 29, 1, 0), paris));
    const once = D.afterRun(dst, null, Date.UTC(2026, 9, 25, 0, 30), paris, "done"); // 02:30 CEST
    t.check("autumn repeat: 02:30 comes twice, it runs once", !D.isDue(dst, once, Date.UTC(2026, 9, 25, 1, 30), paris));
  });

  h.section("due: hourly", (t) => {
    let s = D.afterRun("hourly", null, T0, "UTC", "done");
    t.eq("done → lastHour", s?.lastHour, "2026-10-28T09");
    t.check("not again in the hour", !D.isDue("hourly", s, T0 + 55 * 60_000, "UTC"));
    t.check("due in the next hour", D.isDue("hourly", s, T0 + 60 * 60_000, "UTC"));
    s = D.afterRun("hourly", s, T0 + 60 * 60_000, "UTC", "partial");
    t.check("partial → still due", D.isDue("hourly", s, T0 + 65 * 60_000, "UTC") && s?.lastHour === "2026-10-28T09");
    t.check("hours are UTC: a zone never changes them", D.isDue("hourly", { lastHour: "2026-10-28T09" }, T0 + 60 * 60_000, "Asia/Kathmandu"));
  });

  /* ---------------------------------------------------------------- */
  h.section("round robin: fairness", async (t) => {
    const clock = new Clock(T0);
    const ids = ["S1", "S2", "S3", "S4", "S5", "S6"];
    let cursor = "";
    const src = {
      page: async (after: string, upTo: string | null, limit: number) => ids.filter((id) => id > after && (upTo === null || id <= upTo)).slice(0, limit).map((id) => ({ id })),
      readCursor: async () => cursor,
      writeCursor: async (c: string) => void (cursor = c),
    };
    const counts = new Map<string, number>();
    const run = async (slow: string) => {
      const seen: string[] = [];
      const r = await SC.roundRobin(src, { budgetMs: 1_000, now: clock.now, pageSize: 2 }, async ({ id }) => {
        seen.push(id);
        counts.set(id, (counts.get(id) ?? 0) + 1);
        clock.advance(id === slow ? 5_000 : 100);
      });
      return { seen, ...r };
    };
    const r1 = await run("S2");
    t.eq("run 1: S1, then the slow S2 spends the budget", [r1.seen, r1.done, cursor], [["S1", "S2"], false, "S2"]);
    const r2 = await run("S2");
    t.eq("run 2: the stores behind the slow one come first, then the wrap", [r2.seen, r2.done], [["S3", "S4", "S5", "S6", "S1", "S2"], true]);
    for (let i = 0; i < 10; i++) await run("S2");
    t.check("12 runs with a store always over budget: every store is served at least 3 times", ids.every((id) => (counts.get(id) ?? 0) >= 3), JSON.stringify([...counts]));
    cursor = "";
    const quick = await run("none");
    t.eq("a budget that fits: one full pass, the cursor on the last store", [quick.seen.length, quick.done, cursor], [6, true, "S6"]);
    const next = await run("none");
    t.eq("the next pass starts after it and wraps", next.seen, ["S1", "S2", "S3", "S4", "S5", "S6"]);
    cursor = "";
    const tight = await SC.roundRobin(src, { budgetMs: 1, now: clock.now }, async () => void clock.advance(10));
    t.eq("a spent budget still visits one store", [tight.visited, tight.done], [1, false]);
  });

  /* ---------------------------------------------------------------- */
  h.section("runner: lease", async (t) => {
    // overlap: tick 1 is inside a job when tick 2 starts
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let entered!: () => void;
    const inside = new Promise<void>((r) => (entered = r));
    const f = fakeRunner(Clock, R, [{ name: "zz.wait", every: "tick", budgetMs: 1_000, run: async () => (entered(), await gate, { done: true }) }]);
    const first = f.tick();
    await inside;
    const second = await f.tick();
    t.eq("the second tick answers skipped, nothing ran", [second.skipped, second.jobs.length, second.lagP95Ms], [true, 0, null]);
    const skippedRow = f.rows.find((r) => r.tickId === second.tickId);
    t.eq("…with a job_runs 'tick' row { skipped: true }", [skippedRow?.job, skippedRow?.summary, skippedRow?.ok], ["tick", { skipped: true }, true]);
    t.eq("…and the lease is still the first tick's", f.lease.cursor, `TICK${"1".padStart(22, "0")}`);
    release();
    const done = await first;
    t.check("the first tick finished", !done.skipped && done.jobs.some((j) => j.name === "zz.wait"));
    t.eq("renewed at every job boundary (the shim and zz.wait)", f.lease.renews, 2);
    t.eq("released after the tick", [f.lease.cursor, f.lease.releases], ["", 1]);
    t.eq("the error ring flushed once, the samplers attached at each start", [f.counters.flushes, f.counters.samplers], [1, 2]);

    // an expired lease (> 110 s) is taken over; a fresh one is not
    const g = fakeRunner(Clock, R, []);
    g.lease.cursor = "CRASHED";
    g.lease.updatedAt = g.clock.now() - 109_000;
    t.check("a lease renewed 109 s ago: skipped", (await g.tick()).skipped && g.lease.cursor === "CRASHED");
    g.lease.updatedAt = g.clock.now() - 111_000;
    const taken = await g.tick();
    t.check("a lease older than 110 s: taken over, then released", !taken.skipped && g.lease.cursor === "");

    // a lease lost mid-tick (another tick took it over): no further job starts, the new holder keeps it
    const seen = new Map<string, number>();
    const h2 = fakeRunner(Clock, R, []);
    const jobs: Job[] = [
      { name: "outbox", every: "tick", budgetMs: 13_000, run: async () => ((h2.lease.cursor = "OTHER"), { done: true }) },
      probe(() => h2.clock, "renders", "tick", 12_000, seen),
      probe(() => h2.clock, "housekeeping", "tick", 4_000, seen),
    ];
    h2.deps.jobs = jobs;
    const lost = await h2.tick();
    t.eq("lease lost: the rest are not started", [lost.leaseLost, lost.notStarted, seen.size], [true, ["renders", "housekeeping"], 0]);
    t.eq("…the tick row says so, and the release leaves the new holder's lease", [tickRow(h2.rows)?.errorCode, tickRow(h2.rows)?.ok, h2.lease.cursor], ["lease_lost", false, "OTHER"]);
  });

  h.section("runner: lock-pool spy", async (t) => {
    const spy = x.installLockPool();
    try {
      const during: number[] = [];
      const f = fakeRunner(Clock, R, [
        {
          name: "zz.locked",
          every: "tick",
          budgetMs: 2_000,
          run: async () => {
            const r = await L.withNamedLock(L.platformLock("selftest-job"), 1, async () => void during.push(2 - spy.free()));
            return { done: r.ran };
          },
        },
        { name: "zz.after", every: "tick", budgetMs: 1_000, run: async () => (during.push(2 - spy.free()), { done: true }) },
      ]);
      const atBoundary: number[] = [];
      const orig = f.deps.onBoundary!;
      f.deps.onBoundary = (job) => (orig(job), atBoundary.push(2 - spy.free()));
      const report = await f.tick();
      t.eq("the job held one lock-pool connection while it ran", during[0], 1);
      t.eq("…and none is held at any job boundary (shim, zz.locked, zz.after)", atBoundary, [0, 0, 0]);
      t.eq("the next job starts with both free", during[1], 0);
      t.eq("the runner itself took no lock-pool connection (one get: the job's)", spy.gets(), 1);
      t.check("both jobs ran", report.jobs.filter((j) => j.name.startsWith("zz.")).every((j) => j.done));
    } finally {
      x.restoreLockPool();
    }
  });

  h.section("runner: budget allocation", async (t) => {
    // nothing to do before 4c: the carried leftover reaches 4c (cap 5 s) and 9 (cap 6 s), never slot 3 or 7
    const seen = new Map<string, number>();
    let c: FakeClock | null = null;
    const clock = () => c!;
    const f = fakeRunner(Clock, R, [
      probe(clock, "outbox", "tick", 13_000, seen),
      probe(clock, "ai.jobs", "tick", 6_000, seen),
      probe(clock, "zz.small", "tick", 9_000, seen),
      probe(clock, "platform.health", "tick", 9_000, seen),
      probe(clock, "platform.alarms", "tick", 1_000, seen),
    ]);
    c = f.clock;
    await f.tick();
    t.eq("slot 3 keeps its own 13 s (no leftover)", seen.get("outbox"), 13_000);
    t.eq("4c: 1 s + 5 s of leftover", seen.get("ai.jobs"), 6_000);
    t.eq("slot 7: a job declaring 9 s gets the slot's 5 s, no leftover", seen.get("zz.small"), 5_000);
    t.eq("9: 3 s + 6 s of leftover", seen.get("platform.health"), 9_000);
    t.eq("the shim got slot 1's 18 s", f.legacyCalls[0]?.budgetMs, 18_000);

    // every slot before 4c spends its whole budget: 4c is back to its guaranteed 1 s; slot 9 gets what the tick has left
    seen.clear();
    const full = (name: string, ms: number, every: Job["every"] = "tick") => probe(clock, name, every, ms, seen, -1);
    const g = fakeRunner(Clock, R, [
      full("sheets.push", 18_000),
      full("sheets.pull", 12_000),
      full("outbox", 13_000),
      full("renders", 12_000),
      full("ai.batches", 8_000),
      full("ai.jobs", 6_000),
      full("backup", 11_000),
      full("zz.hourly", 8_000, "hourly"),
      full("lifecycle", 5_000),
      full("housekeeping", 4_000),
      probe(clock, "platform.health", "tick", 9_000, seen),
    ]);
    c = g.clock;
    const r = await g.tick();
    t.eq("no shim once sheets.push is registered", g.legacyCalls.length, 0);
    t.eq("4c after full slots: 1 s", seen.get("ai.jobs"), 1_000);
    t.eq("9 after full slots: the unassigned 5 s minus the 2 s stop = 6 s of the tick", seen.get("platform.health"), 6_000);
    t.eq("every slot got its guarantee", ["sheets.push", "sheets.pull", "outbox", "renders", "ai.batches", "backup", "zz.hourly", "lifecycle", "housekeeping"].map((n) => seen.get(n)), [18_000, 12_000, 13_000, 12_000, 8_000, 11_000, 8_000, 5_000, 4_000]);
    t.eq("each report entry names its slot and budget", r.jobs.find((j) => j.name === "backup"), { name: "backup", ms: 11_000, cpuMs: 0, done: true, slot: "5", budgetMs: 11_000 });

    // jobs sharing a slot spend one allowance, in registry order
    seen.clear();
    const s6 = fakeRunner(Clock, R, [probe(clock, "ai.rollups", "hourly", 5_000, seen, -1), probe(clock, "ai.reconcile", "hourly", 2_000, seen, -1), probe(clock, "leads.followups", "hourly", 2_000, seen, -1), probe(clock, "zz.later", "hourly", 2_000, seen)]);
    c = s6.clock;
    const r6 = await s6.tick();
    t.eq("slot 6's 8 s: 5 s, 2 s, then the last 1 s, then nothing left", ["ai.rollups", "ai.reconcile", "leads.followups"].map((n) => seen.get(n)), [5_000, 2_000, 1_000]);
    t.eq("…the job behind them waits for the next tick (still due: its hour is not marked)", [r6.notStarted, s6.state.get("zz.later")?.due ?? null], [["zz.later"], null]);

    // a short tick: no job starts within 2 s of its end
    seen.clear();
    const short = fakeRunner(Clock, R, [probe(clock, "outbox", "tick", 13_000, seen), probe(clock, "housekeeping", "tick", 4_000, seen)]);
    c = short.clock;
    short.deps.legacySheets = async () => (short.clock.advance(8_500), { done: true });
    const rs = await short.tick(10_000);
    t.eq("the shim was capped at the tick minus the 2 s stop (8 s)", rs.jobs[0]?.budgetMs, 8_000);
    t.eq("8.5 s into a 10 s tick: nothing else starts", [rs.notStarted, seen.size], [["outbox", "housekeeping"], 0]);
    const zero = await fakeRunner(Clock, R, []).tick(-5);
    t.check("a bad budget falls back to 100 s", !zero.skipped && zero.jobs[0]?.budgetMs === 18_000);
  });

  h.section("runner: lag shortening", async (t) => {
    const seen = new Map<string, number>();
    let c: FakeClock | null = null;
    const clock = () => c!;
    const jobs = () => [probe(clock, "outbox", "tick", 13_000, seen), probe(clock, "renders", "tick", 12_000, seen), probe(clock, "exports", "tick", 5_000, seen), probe(clock, "backup", "tick", 6_000, seen), probe(clock, "housekeeping", "tick", 4_000, seen)];
    const calm = fakeRunner(Clock, R, jobs());
    c = calm.clock;
    calm.lag.ms = 100;
    await calm.tick();
    t.eq("lag p95 100 ms: full budgets", ["renders", "exports", "backup"].map((n) => seen.get(n)), [12_000, 5_000, 6_000]);
    seen.clear();
    const busy = fakeRunner(Clock, R, jobs());
    c = busy.clock;
    let reads = 0;
    busy.deps.lag.current = () => (reads++ === 2 ? 150 : 0); // above 100 ms once, just before renders
    const r = await busy.tick();
    t.eq("lag p95 > 100 ms: renders, exports, backup get half, for the rest of the tick", ["renders", "exports", "backup"].map((n) => seen.get(n)), [6_000, 2_500, 3_000]);
    t.eq("…the other jobs keep theirs", [seen.get("outbox"), seen.get("housekeeping")], [13_000, 4_000]);
    t.check("…and the tick row says so", tickRow(busy.rows)?.summary?.lagShortened === true && busy.rows.find((x) => x.job === "renders")?.summary?.lagShortened === true);
    t.eq("the tick row's lagP95Ms comes from the sampler", [r.lagP95Ms, tickRow(busy.rows)?.summary?.lagP95Ms], [0, 0]);
  });

  h.section("runner: yield contract", async (t) => {
    let f: Fake | null = null;
    const spend = (ms: number) => void (f!.cpu.ms += ms);
    const job = (name: string, body: (ctx: JobCtx) => Promise<void>): Job => ({ name, every: "tick", budgetMs: 1_000, run: async (ctx) => (await body(ctx), { done: true }) });
    f = fakeRunner(Clock, R, [
      job("zz.blocks", async () => spend(2_100)),
      job("zz.yields", async (ctx) => {
        for (let i = 0; i < 6; i++) {
          spend(600);
          await ctx.yield();
        }
      }),
      job("zz.edge", async (ctx) => {
        spend(1_900);
        await ctx.yield();
        spend(1_900);
      }),
      job("zz.tail", async (ctx) => {
        await ctx.yield();
        spend(2_500);
      }),
      job("zz.others", async (ctx) => {
        await ctx.yield();
        // another request's busy time while the job was yielding is not the job's
        f!.deps.yieldLoop = async () => spend(5_000);
        await ctx.yield();
        f!.deps.yieldLoop = async () => undefined;
      }),
    ]);
    const r = await f.tick();
    const flagged = r.jobs.filter((j) => j.noYield).map((j) => j.name);
    t.eq("2 s of busy time without a yield fails the contract (also at the job's end)", flagged, ["zz.blocks", "zz.tail"]);
    t.eq("one no_yield error per violating run", f.errors.filter((e) => e.code === "no_yield").map((e) => e.route), ["job:zz.blocks", "job:zz.tail"]);
    const row = f.rows.find((x) => x.job === "zz.blocks");
    t.eq("the run's summary: noYield and the longest span", [row?.summary?.noYield, row?.summary?.maxNoYieldMs, row?.ok], [true, 2_100, true]);
    t.eq("cpuMs per job (busy time, the yields' own gaps included)", r.jobs.filter((j) => j.name.startsWith("zz.")).map((j) => j.cpuMs), [2_100, 3_600, 3_800, 2_500, 5_000]);
    t.eq("the tick row: cpuMs per job", (tickRow(f.rows)?.summary?.cpuMs as Record<string, number>)?.["zz.yields"], 3_600);
  });

  h.section("runner: isolation, job_runs", (t) => quiet(() => isolationCases(t)));

  async function isolationCases(t: Checks): Promise<void> {
    const f = fakeRunner(Clock, R, [
      { name: "zz.boom", every: "tick", budgetMs: 1_000, run: async () => Promise.reject(new TypeError("boom")) },
      {
        name: "zz.stores",
        every: "tick",
        budgetMs: 2_000,
        run: async (ctx) => {
          // what forEachStore reports for each store it visits
          REC.recordStoreVisit({ storeId: "01JB8ZK3Q4R5S6T7V8W9XYZ0AA", startedAt: 1, ms: 5, ok: true, processed: 3, errorCode: null, worked: true });
          REC.recordStoreVisit({ storeId: "01JB8ZK3Q4R5S6T7V8W9XYZ0BB", startedAt: 2, ms: 1, ok: true, processed: 0, errorCode: null, worked: false });
          REC.recordStoreVisit({ storeId: "01JB8ZK3Q4R5S6T7V8W9XYZ0CC", startedAt: 3, ms: 7, ok: false, processed: 0, errorCode: "ER_LOCK_DEADLOCK", worked: true });
          await ctx.setCursor("01JB8ZK3Q4R5S6T7V8W9XYZ0CC");
          return { done: false, summary: { pages: 1 } };
        },
      },
      { name: "zz.soft", every: "tick", budgetMs: 1_000, run: async () => ({ done: true, processed: 4, errorCode: "steps_failed:sessions", summary: { visitorMarkers: 4 } }) },
      { name: "zz.after", every: "tick", budgetMs: 1_000, run: async (ctx) => ({ done: true, summary: { cursorSeen: ctx.cursor === "" } }) },
    ]);
    f.state.set("zz.after", { cursor: "", due: null });
    const r = await f.tick();
    t.eq("a throwing job does not stop the tick", r.jobs.map((j) => [j.name, j.error ?? null]), [["sheets.push", null], ["zz.boom", "TypeError"], ["zz.stores", null], ["zz.soft", "steps_failed:sessions"], ["zz.after", null]]);
    const boom = f.rows.find((x) => x.job === "zz.boom")!;
    t.eq("its row: ok false, the error code", [boom.ok, boom.errorCode, boom.storeId, boom.summary?.done], [false, "TypeError", null, false]);
    t.eq("…counted in the error ring under its job", f.errors.filter((e) => e.route === "job:zz.boom").length, 1);
    const stores = f.rows.filter((x) => x.job === "zz.stores");
    t.eq("per store: one row per store that did work, plus the run row", stores.map((x) => [x.storeId, x.ok, x.processed, x.errorCode]), [
      [null, true, 3, null],
      ["01JB8ZK3Q4R5S6T7V8W9XYZ0AA", true, 3, null],
      ["01JB8ZK3Q4R5S6T7V8W9XYZ0CC", false, 0, "ER_LOCK_DEADLOCK"],
    ]);
    t.eq("the run row's summary: the job's, done, slot, budget, the store counts", stores[0]?.summary, { pages: 1, done: false, slot: "7", budgetMs: 2_000, cpuMs: 0, stores: 3, storesWorked: 2 });
    t.check("every row carries the tick id", f.rows.every((x) => x.tickId === r.tickId));
    t.eq("setCursor writes the job's cron_cursors row", f.state.get("zz.stores")?.cursor, "01JB8ZK3Q4R5S6T7V8W9XYZ0CC");
    const soft = f.rows.find((x) => x.job === "zz.soft")!;
    t.eq("a soft failure: ok false with its code, the counts kept", [soft.ok, soft.errorCode, soft.processed, soft.summary?.visitorMarkers], [false, "steps_failed:sessions", 4, 4]);
    const shim = f.rows.find((x) => x.job === "sheets.push")!;
    t.eq("the legacy shim: a sheets.push run with summary.legacy", [shim.summary?.legacy, shim.summary?.appended, shim.processed, f.legacyCalls], [true, 2, 2, [{ job: "sheets.push", budgetMs: 18_000 }]]);
    const tick = tickRow(f.rows)!;
    t.eq("the tick row: ok false, jobs_failed, one row per run counted", [tick.ok, tick.errorCode, tick.processed, tick.storeId], [false, "jobs_failed", 5, null]);
    t.eq("the tick row's summary: skipped, lagP95Ms, cpuMs per job, the job list", Object.keys(tick.summary ?? {}), ["skipped", "lagP95Ms", "lagMaxMs", "budgetMs", "cpuMs", "jobs"]);
    t.eq("…the job list", (tick.summary?.jobs as { name: string; ok: boolean }[]).map((j) => [j.name, j.ok]), [["sheets.push", true], ["zz.boom", false], ["zz.stores", true], ["zz.soft", false], ["zz.after", true]]);
    t.eq("the report keeps the frozen fields", Object.keys(r), ["tickId", "skipped", "startedAt", "ms", "lagP95Ms", "jobs"]);
    t.check("job names and tick ids fit job_runs (48 / 26 chars)", f.rows.every((x) => x.job.length <= 48 && (x.tickId ?? "").length === 26));

    const bad = fakeRunner(Clock, R, [{ name: "Bad Name!", every: "tick", budgetMs: 1_000, run: async () => ({ done: true }) }]);
    const rb = await bad.tick();
    t.eq("a job whose name systemCtx refuses fails alone", rb.jobs.map((j) => [j.name, j.error ?? null]), [["sheets.push", null], ["Bad Name!", "Error"]]);
    const dup = fakeRunner(Clock, R, [{ name: "zz.twice", every: "tick", budgetMs: 1_000, run: async () => ({ done: true }) }, { name: "zz.twice", every: "tick", budgetMs: 1_000, run: async () => ({ done: false }) }]);
    t.eq("a name registered twice runs once (the first)", (await dup.tick()).jobs.filter((j) => j.name === "zz.twice").map((j) => j.done), [true]);
    const sinkDown = fakeRunner(Clock, R, []);
    sinkDown.deps.runs = { write: async () => Promise.reject(Object.assign(new Error("gone"), { code: "ECONNRESET", errno: -4077, sqlState: "x" })) };
    const rd = await sinkDown.tick();
    t.check("job_runs unwritable: the tick still completes and releases", !rd.skipped && rd.jobs.length === 1 && sinkDown.lease.cursor === "" && sinkDown.errors.some((e) => e.route === "job_runs"));
  }

  h.section("runner: due across ticks", (t) => quiet(() => dueCases(t)));

  async function dueCases(t: Checks): Promise<void> {
    let runs: string[] = [];
    const job = (name: string, every: Job["every"], result: () => JobResult | Promise<JobResult>): Job => ({ name, every, budgetMs: 1_000, run: async () => (runs.push(name), result()) });
    let hourlyDone = false;
    let failing = true;
    const f = fakeRunner(
      Clock,
      R,
      [job("zz.hourly", "hourly", () => ({ done: hourlyDone })), job("zz.daily", { dailyAt: "10:05" }, () => ({ done: true })), job("zz.flaky", { dailyAt: "10:00" }, () => (failing ? Promise.reject(new Error("x")) : { done: true }))],
      T0, // 10:00 in Casablanca
    );
    const tickAt = async (minutes: number) => {
      runs = [];
      f.clock.set(T0 + minutes * 60_000);
      await f.tick();
      return runs;
    };
    t.eq("10:00 local: hourly (partial) and the flaky daily (fails)", await tickAt(0), ["zz.hourly", "zz.flaky"]);
    hourlyDone = true;
    t.eq("10:05: hourly again (it had work left), daily due, flaky retried", await tickAt(5), ["zz.hourly", "zz.daily", "zz.flaky"]);
    t.eq("10:10: hourly done for the hour, daily done for the day, flaky's 3rd failure", await tickAt(10), ["zz.flaky"]);
    t.eq("10:15: the flaky job's day is given up", await tickAt(15), []);
    failing = false;
    t.eq("11:00 local: the next hour", await tickAt(60), ["zz.hourly"]);
    t.eq("the next day 10:00: daily jobs again", await tickAt(24 * 60), ["zz.hourly", "zz.flaky"]);
    t.eq("the due state lives in each job's row", [f.state.get("zz.daily")?.due?.lastDay, f.state.get("zz.hourly")?.due?.lastHour], ["2026-10-28", "2026-10-29T09"]);
    t.check("tick jobs store no due state", !f.state.has("sheets.push"));
  }
}
