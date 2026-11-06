import "server-only";
/**
 * `storage.walk` (docs/STORE-SAAS.md §G.2, §H.5; rev 3 ENGC-14; R1 P8 step 7), slot 6, daily 02:15, 2 s a tick until
 * done: the bounded, resumable walk of DATA_DIR (src/lib/storage/walk.ts), plus the media root when MEDIA_DIR moved it
 * outside DATA_DIR. When every root has been counted, the snapshot `{ bytes, files, dirs, budgetBytes, complete, at }`
 * replaces the last one in the `cron_cursors` row `storage.walk` (`state.snapshot`), where the fs backend's `usage()`,
 * getHealth's `dataDir` tile and the `data_dir_70` / `data_dir_85` / inode alarms read it. The walk in progress
 * (`state.walk`: the roots, the one being walked, its cursor, the finished roots' totals) carries over between ticks;
 * a change of roots (DATA_DIR or MEDIA_DIR edited) starts over.
 *
 * Reads only: it never writes into DATA_DIR. Without DATA_DIR it answers done with `skipped: "no_data_dir"`.
 */
import { budgetBytes, walkDataDir, WALK_JOB, type WalkCursor, type WalkSnapshot } from "@/lib/storage/walk";
import { dataDir, mediaRoot } from "@/lib/storage/paths";
import type { JobCtx, JobResult } from "../runner";
import { walkRoots } from "./rules";
import { patchJobState, readJobState } from "./state";

/** The walk in progress, as kept in `state.walk`. */
export interface WalkProgress {
  roots: string[];
  /** index of the root being walked */
  i: number;
  cursor: WalkCursor | null;
  /** totals of the roots before `i` */
  acc: { bytes: number; files: number; dirs: number; skipped: number };
}

function parseProgress(raw: unknown, roots: readonly string[]): WalkProgress | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Partial<WalkProgress>;
  if (!Array.isArray(p.roots) || p.roots.length !== roots.length || p.roots.some((r, i) => r !== roots[i])) return null;
  if (typeof p.i !== "number" || !Number.isInteger(p.i) || p.i < 0 || p.i >= roots.length) return null;
  const a = p.acc;
  const n = (v: unknown) => (typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : null);
  if (!a || n(a.bytes) === null || n(a.files) === null || n(a.dirs) === null || n(a.skipped) === null) return null;
  const cursor = p.cursor && typeof p.cursor === "object" ? (p.cursor as WalkCursor) : null;
  return { roots: [...roots], i: p.i, cursor, acc: { bytes: a.bytes, files: a.files, dirs: a.dirs, skipped: a.skipped } };
}

export async function storageWalkJob(ctx: JobCtx): Promise<JobResult> {
  const roots = walkRoots(dataDir(), mediaRoot());
  if (!roots.length) return { done: true, summary: { skipped: "no_data_dir" } };
  const state = await readJobState(WALK_JOB);
  const progress = parseProgress(state.walk, roots) ?? { roots, i: 0, cursor: null, acc: { bytes: 0, files: 0, dirs: 0, skipped: 0 } };
  let dirsThisTick = 0;

  while (progress.i < roots.length) {
    const before = progress.cursor?.dirs ?? 0;
    const r = await walkDataDir({ root: roots[progress.i], budgetMs: Math.max(0, ctx.deadline - Date.now()), resume: progress.cursor, yieldFn: ctx.yield });
    dirsThisTick += r.dirs - before;
    if (!r.complete) {
      progress.cursor = r.cursor;
      await patchJobState(WALK_JOB, { walk: progress });
      return { done: false, processed: dirsThisTick, summary: { root: progress.i, dirs: r.dirs, files: r.files } };
    }
    progress.acc = { bytes: progress.acc.bytes + r.bytes, files: progress.acc.files + r.files, dirs: progress.acc.dirs + r.dirs, skipped: progress.acc.skipped + r.skipped };
    progress.cursor = null;
    progress.i++;
    if (progress.i < roots.length && Date.now() >= ctx.deadline) {
      await patchJobState(WALK_JOB, { walk: progress });
      return { done: false, processed: dirsThisTick, summary: { root: progress.i } };
    }
  }

  const snapshot: WalkSnapshot = { bytes: progress.acc.bytes, files: progress.acc.files, dirs: progress.acc.dirs, budgetBytes: budgetBytes(), complete: true, at: new Date().toISOString() };
  await patchJobState(WALK_JOB, { walk: null, snapshot });
  return {
    done: true,
    processed: dirsThisTick,
    summary: { bytes: snapshot.bytes, files: snapshot.files, dirs: snapshot.dirs, budgetBytes: snapshot.budgetBytes, roots: roots.length, ...(progress.acc.skipped ? { unreadable: progress.acc.skipped } : {}) },
  };
}
