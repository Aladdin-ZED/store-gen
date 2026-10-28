import "server-only";
/**
 * The measured window of the `platform.health` job (platform.md PLA-§6.3.4, PD78; core §I.7): the stores computed per
 * run over the last 12 runs, the slow-run streak and the measured cycle, kept in the job's own `cron_cursors` row
 * (`platform.health:window`, src/lib/platform/job-state.ts). Written by the tick (./run.ts), read by the snapshot API
 * (`staleAfterMin`) and the alarms (`health_stale`, `health_job_slow`). Counts and instants only.
 */
import { cycleMinutes, SLOW_P50_MS, WINDOW_RUNS } from "@/lib/platform/health-score";
import { readJobState } from "@/lib/platform/job-state";
import { recordPlatformError } from "@/lib/platform/log";

export { SLOW_P50_MS, SLOW_STREAK, WINDOW_RUNS } from "@/lib/platform/health-score";

/** The job's state row in `cron_cursors` (counts and instants only). */
export const HEALTH_STATE_KEY = "platform.health:window";

export interface HealthJobState {
  /** stores computed per run, the last 12 (oldest first) */
  storesPerTick: number[];
  /** runs in a row whose perStoreP50Ms was above SLOW_P50_MS */
  slowStreak: number;
  /** the measured cycle of the last run with a computation, minutes (null before any) */
  cycleMin: number | null;
  /** the stores of the rotation at the last run */
  rotation: number;
  lastRunAt: string | null;
  lastP50Ms: number | null;
}

export const EMPTY_HEALTH_STATE: HealthJobState = { storesPerTick: [], slowStreak: 0, cycleMin: null, rotation: 0, lastRunAt: null, lastP50Ms: null };

/** The job state, or the empty one (a read error counts as no state: the alarms then use the setting alone). */
export async function readHealthJobState(): Promise<HealthJobState> {
  try {
    const s = await readJobState<Partial<HealthJobState>>(HEALTH_STATE_KEY);
    if (!s) return EMPTY_HEALTH_STATE;
    const nums = (a: unknown) => (Array.isArray(a) ? a.filter((n): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0).slice(-WINDOW_RUNS) : []);
    const num = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? n : null);
    return {
      storesPerTick: nums(s.storesPerTick),
      slowStreak: num(s.slowStreak) ?? 0,
      cycleMin: num(s.cycleMin),
      rotation: num(s.rotation) ?? 0,
      lastRunAt: typeof s.lastRunAt === "string" ? s.lastRunAt : null,
      lastP50Ms: num(s.lastP50Ms),
    };
  } catch (err) {
    recordPlatformError("health job state read", err, { area: "health" });
    return EMPTY_HEALTH_STATE;
  }
}

/**
 * The next state after a run that computed `stores` stores at `p50Ms` (pure). The window records capacity: a run cut
 * by its deadline (`done` false) counts the stores it reached; a run that emptied the queue covered the whole rotation
 * in one tick, so it counts the rotation (the cycle is then one tick, 5 min). A run that computed nothing and was cut
 * (a deadline already spent by the slots before it) leaves the window as it was.
 */
export function nextHealthState(prev: HealthJobState, run: { stores: number; p50Ms: number | null; rotation: number; at: Date; done: boolean }): HealthJobState {
  const capacity = run.done ? Math.max(run.stores, run.rotation) : run.stores;
  const storesPerTick = capacity > 0 ? [...prev.storesPerTick, capacity].slice(-WINDOW_RUNS) : prev.storesPerTick;
  const slow = run.p50Ms !== null && run.p50Ms > SLOW_P50_MS;
  return {
    storesPerTick,
    slowStreak: run.stores > 0 ? (slow ? prev.slowStreak + 1 : 0) : prev.slowStreak,
    cycleMin: cycleMinutes(run.rotation, storesPerTick),
    rotation: run.rotation,
    lastRunAt: run.at.toISOString(),
    lastP50Ms: run.p50Ms ?? prev.lastP50Ms,
  };
}
