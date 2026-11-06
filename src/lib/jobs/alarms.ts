/**
 * The core alarm thresholds of the machinery (docs/STORE-SAAS.md §H.5; platform.md PLA-§15.1 "Red when", PLA-§15.2;
 * P8 step 11). Pure and dependency-free, so P1's `platform.alarms` job and the System health panels (server or client)
 * judge `getHealth()`'s data with exactly these numbers. Every helper reads "not measured" (null) as "no alarm",
 * except `noTick`, where no tick at all is the alarm.
 *
 * The DATA_DIR levels and the inode warning are src/lib/storage/walk.ts's rules (test:jobs asserts they agree); the
 * Sheets threshold is ./capacity.ts's.
 */
import { sheetsCapacity } from "./capacity";

/** §H.5 `db_70` / `db_85` (also getDbUsage's warn / block ratios) */
export const DB_LEVELS = Object.freeze({ db_70: 0.7, db_85: 0.85 } as const);
/** §H.5 `data_dir_70` / `data_dir_85` of DATA_DIR_BUDGET_BYTES */
export const DATA_DIR_ALARM_LEVELS = Object.freeze({ data_dir_70: 0.7, data_dir_85: 0.85 } as const);
/** §H.5 `inodes_high`: more than this many files under DATA_DIR */
export const INODE_ALARM_FILES = 300_000;
/** ENGC-12 `pool_wait`: query or lock pool wait p95 above this over the 5-minute window */
export const POOL_WAIT_ALARM_MS = 500;
/** ENGC-11 `tick_lag`: event-loop lag p95 during a tick above this */
export const TICK_LAG_ALARM_MS = 250;
/** PLA-§15.2 `render_stuck`: the oldest pending render older than this (minutes) */
export const RENDER_STUCK_MIN = 60;
/** PLA-§15.2 `render_stuck`: …or this many render runs in a row that finished nothing while jobs are pending */
export const RENDER_IDLE_RUNS = 2;
/** PLA-§15.2 `no_tick`: no `job_runs` row for this long (ms) */
export const NO_TICK_MS = 10 * 60_000;
/** PLA-§15.2 `error_spike`: more than this many of one code in one hour */
export const ERROR_SPIKE_PER_HOUR = 50;
/** DES-R12 `design_tables_large`: design_genomes + headline_shingles above this many bytes */
export const DESIGN_TABLES_ALARM_BYTES = 300 * 1024 * 1024;
/** SEC-4 `edge_bad_key`: this many unverifiable x-sg-edge requests in one minute */
export const EDGE_BAD_KEY_PER_MIN = 10;

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

/** `data_dir_85` from 85 %, `data_dir_70` from 70 % of the budget, else null (null input: not measured). */
export function dataDirLevel(bytes: number | null, budgetBytes: number | null): "data_dir_70" | "data_dir_85" | null {
  if (!finite(bytes) || !finite(budgetBytes) || budgetBytes <= 0 || bytes < 0) return null;
  const used = bytes / budgetBytes;
  return used >= DATA_DIR_ALARM_LEVELS.data_dir_85 ? "data_dir_85" : used >= DATA_DIR_ALARM_LEVELS.data_dir_70 ? "data_dir_70" : null;
}

/** `db_85` from 85 %, `db_70` from 70 % of the quota, else null. */
export function dbLevel(bytes: number | null, quotaBytes: number | null): "db_70" | "db_85" | null {
  if (!finite(bytes) || !finite(quotaBytes) || quotaBytes <= 0 || bytes < 0) return null;
  const used = bytes / quotaBytes;
  return used >= DB_LEVELS.db_85 ? "db_85" : used >= DB_LEVELS.db_70 ? "db_70" : null;
}

/** `inodes_high`: more than 300,000 files. */
export function inodeWarn(files: number | null): boolean {
  return finite(files) && files > INODE_ALARM_FILES;
}

/** `pool_wait`: the query pool's or the lock pool's 5-minute p95 above 500 ms. */
export function poolWaitAlarm(db: { poolWaitP95Ms: number | null; lockPoolWaitP95Ms: number | null }): boolean {
  return (finite(db.poolWaitP95Ms) && db.poolWaitP95Ms > POOL_WAIT_ALARM_MS) || (finite(db.lockPoolWaitP95Ms) && db.lockPoolWaitP95Ms > POOL_WAIT_ALARM_MS);
}

/** `tick_lag`: the last tick's event-loop lag p95 above 250 ms. */
export function tickLagAlarm(lagP95Ms: number | null): boolean {
  return finite(lagP95Ms) && lagP95Ms > TICK_LAG_ALARM_MS;
}

/**
 * `render_stuck`: the oldest pending job older than 60 minutes, or jobs pending while the last two `renders` runs
 * (newest first, their `processed`) finished nothing. Fewer than two runs: no throughput verdict.
 */
export function renderStuck(r: { oldestMin: number | null; pending: number; recentProcessed: readonly number[] }): boolean {
  if (finite(r.oldestMin) && r.oldestMin > RENDER_STUCK_MIN) return true;
  if (!(r.pending > 0) || r.recentProcessed.length < RENDER_IDLE_RUNS) return false;
  return r.recentProcessed.slice(0, RENDER_IDLE_RUNS).every((n) => n === 0);
}

/** `render_failed_old`: a job failed more than 24 h ago and still failed. */
export function renderFailedOld(failedOld: number | null): boolean {
  return finite(failedOld) && failedOld > 0;
}

/** `no_tick`: no `job_runs` row for 10 minutes; never one at all is the alarm too (the cron is not set up). */
export function noTick(lastRunAt: string | number | null, now: number = Date.now()): boolean {
  const at = typeof lastRunAt === "string" ? Date.parse(lastRunAt) : lastRunAt;
  if (at === null || !Number.isFinite(at)) return true;
  return now - at > NO_TICK_MS;
}

/** `sheets_backlog`: a store's oldest pending order older than max(15, 5 × ceil(activeSheetsStores / 16)) minutes. */
export function sheetsBacklogAlarm(oldestMin: number | null, activeSheetsStores: number): boolean {
  return finite(oldestMin) && oldestMin > sheetsCapacity(activeSheetsStores).backlogAlarmMin;
}

/** `error_spike`: more than 50 of one code in one hour. */
export function errorSpike(peakPerHour: number | null): boolean {
  return finite(peakPerHour) && peakPerHour > ERROR_SPIKE_PER_HOUR;
}

/** `design_tables_large`: the design tables above 300 MB together. */
export function designTablesLarge(d: { genomesBytes: number; shinglesBytes: number } | null): boolean {
  return !!d && finite(d.genomesBytes) && finite(d.shinglesBytes) && d.genomesBytes + d.shinglesBytes > DESIGN_TABLES_ALARM_BYTES;
}

/** `edge_bad_key`: at least 10 unverifiable x-sg-edge requests in the current minute. */
export function edgeBadKeyAlarm(badKeyMinute: number | null): boolean {
  return finite(badKeyMinute) && badKeyMinute >= EDGE_BAD_KEY_PER_MIN;
}

/** `gate_mismatch`: the gate's commit differs from the build's; null (either unknown) is no verdict. */
export function gateMismatchAlarm(gateMismatch: boolean | null): boolean {
  return gateMismatch === true;
}
