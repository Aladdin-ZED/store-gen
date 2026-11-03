/**
 * The storage jobs' pure rules (docs/STORE-SAAS.md §G.2, §G.3, §D.7, §H.2 slot 6; R1 P8 step 7). No I/O and no clock:
 * the jobs (./migrate.ts, ./sweep.ts, ./walk.ts, ./usage.ts, ./refs.ts) and test:jobs read the same numbers.
 *
 *   STORAGE_JOB_TIMES                 the daily times, each alone in its 5-minute window (§H.2: ≤ 2 per tick)
 *   passVisitor(pass, cursor)         one daily pass over the stores through forEachStore's round robin
 *   walkRoots(dataDir, mediaRoot)     DATA_DIR, plus MEDIA_DIR when it lies outside DATA_DIR (§G.2)
 *   sweepVerdict(file)                keep / delete / report for one file or row of the sweeper (§G.3)
 *   driftTotals(drifts)               the usage.reconcile summary (§D.7: "logging the delta in job_runs.summary")
 */
import { posix, win32 } from "node:path";
import type { StoreStatus } from "@/lib/tenancy/types";

/** The cron_cursors rows (job names) of the five jobs. */
export const MIGRATE_JOB = "media.migrate";
export const SWEEP_JOB = "media.sweep";
export const USAGE_JOB = "usage.reconcile";
export const REFS_JOB = "refs.reconcile";
// the walk's own row is WALK_JOB ("storage.walk") of src/lib/storage/walk.ts, read by the fs backend and getHealth

/**
 * The daily times (platform zone). §H.2 and OPE-§J name 02:20 (catalog.stock_reconcile, R2), 02:30, 02:40 (ops.rollup,
 * ai.distill), 02:55, 03:10, 03:20, 03:30 (backup), 03:40, 03:50, 04:00, 04:10, 04:20 and 06:00: these four take the
 * free windows 02:05-02:25, one job each. Order: the gauges first (no file work), then the sweep, then the walk (so the
 * snapshot is measured after the sweep), then the refs.
 */
export const STORAGE_JOB_TIMES = Object.freeze({
  [USAGE_JOB]: "02:05",
  [SWEEP_JOB]: "02:10",
  "storage.walk": "02:15",
  [REFS_JOB]: "02:25",
} as const);

/** Their caps inside slot 6 (8 s shared). media.migrate runs every tick and returns at once without work. */
export const STORAGE_JOB_BUDGETS = Object.freeze({
  [MIGRATE_JOB]: 3_000,
  [USAGE_JOB]: 3_000,
  [SWEEP_JOB]: 3_000,
  "storage.walk": 2_000,
  [REFS_JOB]: 3_000,
} as const);

/** Every state a store can hold data in: purged stores have none left (§F.9). */
export const STORES_WITH_DATA: readonly StoreStatus[] = Object.freeze(["pending", "active", "restricted", "suspended", "closed", "scheduled_deletion", "rejected"]);

/** media.migrate: files moved per tick at most (§G.3), and what one store's slice reads at once. */
export const MIGRATE_MAX_FILES = 50;
/** media.migrate: keys whose chunks do not make their row's file are left in the database, remembered up to this many. */
export const MIGRATE_BAD_MAX = 200;
/** media.migrate: after a probe found nothing to move, the next probe waits this long (rows only appear on the db fallback). */
export const MIGRATE_IDLE_MS = 60 * 60_000;

/** media.sweep: a file with no row is an orphan once it is this old (an upload writes its files before its rows). */
export const ORPHAN_AGE_MS = 60 * 60_000;
/** media.sweep: missing files reported per store and run (each is one count of `missing_file` in the error ring). */
export const MISSING_REPORT_MAX = 500;

/* ------------------------------------------------------------------ */
/* One daily pass over the stores                                      */
/* ------------------------------------------------------------------ */

/**
 * A daily job's pass, kept in its `cron_cursors.state.pass` between ticks: the cursor it started from and whether the
 * round robin has wrapped past the last store since. `null` in the state = no pass in progress.
 */
export interface PassState {
  start: string;
  wrapped: boolean;
}

export function parsePass(raw: unknown): PassState | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Partial<PassState>;
  return typeof p.start === "string" && p.start.length <= 64 && typeof p.wrapped === "boolean" ? { start: p.start, wrapped: p.wrapped } : null;
}

/**
 * Decides, store by store, whether a daily pass still has work: forEachStore's round robin visits the stores after its
 * cursor, wraps to the first one and comes back up to the cursor, and a pass that spans several ticks resumes from where
 * the last one stopped. The pass is complete once it has wrapped and reaches a store after the one it started from, or
 * wraps a second time (it started on the last store, or that store is gone); that store is not worked (`"end"`), the
 * next pass starts after it and works it last. Store ids compare as strings (ULIDs, the iterator's order), so a store
 * added or deleted meanwhile cannot make a pass run forever or work a store twice.
 */
export function passVisitor(pass: PassState, cursor: string) {
  let last = cursor;
  let complete = false;
  return {
    visit(id: string): "work" | "end" {
      if (complete) return "end";
      let end = false;
      if (last !== "" && id <= last) {
        // the iterator wrapped to the first store: a second wrap means the pass went all the way round (its start
        // was the last store, or is gone)
        if (pass.wrapped) end = true;
        pass.wrapped = true;
      }
      last = id;
      if (end || (pass.wrapped && id > pass.start)) {
        complete = true;
        return "end";
      }
      return "work";
    },
    get complete(): boolean {
      return complete;
    },
  };
}

/* ------------------------------------------------------------------ */
/* The walk's roots                                                    */
/* ------------------------------------------------------------------ */

/** `child` is `parent` or lies under it (both absolute; case-insensitive on win32). */
export function isInside(child: string, parent: string, platform: NodeJS.Platform = process.platform): boolean {
  // the platform's own path rules (win32's relative() already ignores case, posix's never does)
  const P = platform === "win32" ? win32 : posix;
  const norm = (p: string) => (platform === "win32" ? P.normalize(p).toLowerCase() : P.normalize(p));
  const rel = P.relative(norm(parent), norm(child));
  return rel === "" || (!rel.startsWith(`..${P.sep}`) && rel !== ".." && !P.isAbsolute(rel));
}

/**
 * What storage.walk counts (§G.2): DATA_DIR, and the media root too when MEDIA_DIR moved it outside DATA_DIR (its
 * files are on the same hosting account and count against the same quota). Empty when DATA_DIR is not set.
 */
export function walkRoots(dataDir: string | null, mediaRoot: string | null, platform: NodeJS.Platform = process.platform): string[] {
  if (!dataDir) return [];
  return mediaRoot && !isInside(mediaRoot, dataDir, platform) ? [dataDir, mediaRoot] : [dataDir];
}

/* ------------------------------------------------------------------ */
/* The sweeper                                                         */
/* ------------------------------------------------------------------ */

/**
 * One entry of the sweep (§G.3): a file on disk (`row` = whether the store has a `media_files` row for its key; a name
 * that is no media key never has one) or a temp file. A file with no row is deleted once it is older than an hour (an
 * upload writes its files before its rows, and an idempotent re-put refreshes the time); anything younger is kept.
 */
export function sweepVerdict(file: { row: boolean; ageMs: number }): "keep" | "delete" {
  if (file.row) return "keep";
  return Number.isFinite(file.ageMs) && file.ageMs > ORPHAN_AGE_MS ? "delete" : "keep";
}

/** The sweep's progress in its `cron_cursors.state.sweep`: the phase and, in `disk`, the last store folder done. */
export interface SweepState {
  phase: "tmp" | "disk" | "rows";
  after: string;
}

export function parseSweep(raw: unknown): SweepState | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Partial<SweepState>;
  if (s.phase !== "tmp" && s.phase !== "disk" && s.phase !== "rows") return null;
  return { phase: s.phase, after: typeof s.after === "string" && s.after.length <= 64 ? s.after : "" };
}

/* ------------------------------------------------------------------ */
/* usage.reconcile                                                     */
/* ------------------------------------------------------------------ */

export interface Drift {
  before: number;
  after: number;
}

/**
 * The run summary of a set of recomputed stores: per gauge the net delta (after - before) and the stores whose value
 * moved; `driftStores` = stores with at least one moved gauge. Counts only, never a store's data.
 */
export function driftTotals(perStore: readonly Record<string, Drift>[]): Record<string, number> {
  const out: Record<string, number> = { stores: perStore.length, driftStores: 0 };
  for (const gauges of perStore) {
    let moved = false;
    for (const [gauge, d] of Object.entries(gauges)) {
      const delta = d.after - d.before;
      if (delta === 0) continue;
      moved = true;
      out[`${gauge}_delta`] = (out[`${gauge}_delta`] ?? 0) + delta;
      out[`${gauge}_stores`] = (out[`${gauge}_stores`] ?? 0) + 1;
    }
    if (moved) out.driftStores!++;
  }
  return out;
}

/** The gauges of one store that moved. */
export function movedGauges(gauges: Record<string, Drift>): number {
  return Object.values(gauges).filter((d) => d.after !== d.before).length;
}
