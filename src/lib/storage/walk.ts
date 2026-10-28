/**
 * The bounded walk of `DATA_DIR` (docs/STORE-SAAS.md §G.2, rev 3 ENGC-14): Hostinger's disk quota is per account and
 * `fs.statfs` reports the volume, so the health tile and the alarms measure what the app itself keeps against
 * `DATA_DIR_BUDGET_BYTES` (§H.7, default 20 GiB), never the free space of the disk.
 *
 *   let r = await walkDataDir({ budgetMs: 2_000 });                       // one bounded slice
 *   while (!r.complete) r = await walkDataDir({ budgetMs: 2_000, resume: r.cursor });
 *   dataDirLevel(r.bytes, budgetBytes());                                 // null | "data_dir_70" | "data_dir_85"
 *
 * - Resumable: the pending directories (a depth-first stack, relative POSIX paths) and the running totals live in the
 *   returned cursor, which the `storage.walk` job (P8 step 7) keeps in its `cron_cursors` state between ticks. A cursor
 *   of another root, or an entry that is absolute or holds `..`, is never followed (counted in `skipped`).
 * - Bounded: one directory at a time; after each it checks its budget and yields (`setImmediate`, or the job's
 *   `ctx.yield`), so a large tree never holds the event loop. A slice always finishes the directory it started, so
 *   even `budgetMs: 0` makes progress.
 * - Counting: `files` = every entry that is not a directory (each is an inode; symbolic links are counted, never
 *   followed), `bytes` = the sizes of the regular files, `dirs` = the directories visited (the root included).
 *   Inodes = files + dirs. An entry that vanishes during the walk is ignored; one that cannot be read is `skipped`.
 *
 * Pure apart from reading the tree: no database, no write; the nightly snapshot (`WalkSnapshot` under `WALK_JOB`) is
 * written by the job, read by the fs backend's `usage()` and by getHealth (§H.5 `dataDir`).
 */
import type { Dirent } from "node:fs";
import { lstat, readdir } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { dataDir } from "./paths";

/** DATA_DIR_BUDGET_BYTES' default: 20 GiB (§H.7) */
export const DEFAULT_DATA_DIR_BUDGET = 20 * 1024 ** 3;
/** the alarm levels of §H.5 (rev 4, PLA Q4.9): `data_dir_70` / `data_dir_85` */
export const DATA_DIR_LEVELS = Object.freeze({ data_dir_70: 0.7, data_dir_85: 0.85 } as const);
export type DataDirLevel = keyof typeof DATA_DIR_LEVELS;
/** the console's inode warning (§G.2: Hostinger Business allows 600,000 inodes plan-wide) */
export const INODE_WARN_FILES = 300_000;
/** the `cron_cursors` row (job name) holding the walk's cursor and its last complete snapshot */
export const WALK_JOB = "storage.walk";

/** entries lstat'ed at once within one directory */
const STAT_BATCH = 64;

export interface WalkCursor {
  v: 1;
  /** the root walked; a cursor of another root is not resumed */
  root: string;
  /** directories still to visit, relative to root ("" = the root), POSIX separators */
  stack: string[];
  bytes: number;
  files: number;
  dirs: number;
  skipped: number;
}

export interface WalkResult {
  bytes: number;
  files: number;
  dirs: number;
  skipped: number;
  /** true when the whole tree has been counted; the totals are then final */
  complete: boolean;
  /** pass it back as `resume` to continue; null once complete */
  cursor: WalkCursor | null;
}

export interface WalkOptions {
  /** wall time this slice may take; checked after each directory */
  budgetMs: number;
  resume?: WalkCursor | null;
  /** default `dataDir()`; the job also walks MEDIA_DIR when it lies outside DATA_DIR */
  root?: string;
  /** default `setImmediate` (the job passes `ctx.yield`) */
  yieldFn?: () => Promise<void>;
  now?: () => number;
}

/** The last complete walk, as the job stores it and `usage()` / getHealth read it. */
export interface WalkSnapshot {
  bytes: number;
  files: number;
  dirs: number;
  budgetBytes: number;
  complete: true;
  /** ISO time the walk completed */
  at: string;
}

const immediate = () => new Promise<void>((resolve) => setImmediate(resolve));

/** A stack entry is a relative POSIX path of plain names; anything else is never followed. */
function safeRel(rel: unknown): rel is string {
  if (typeof rel !== "string") return false;
  if (rel === "") return true;
  if (rel.length > 4096 || rel.includes("\\") || rel.includes("\0") || isAbsolute(rel)) return false;
  return rel.split("/").every((s) => s !== "" && s !== "." && s !== ".." && !s.includes(":"));
}

/**
 * One bounded slice of the walk of `root` (default DATA_DIR). Throws only when no root is configured; read errors
 * are counted in `skipped`, never thrown.
 */
export async function walkDataDir(opts: WalkOptions): Promise<WalkResult> {
  const root = opts.root ?? dataDir();
  if (!root || !isAbsolute(root)) throw new Error("storage: DATA_DIR is not set");
  const now = opts.now ?? Date.now;
  const yieldFn = opts.yieldFn ?? immediate;
  const budget = Number.isFinite(opts.budgetMs) ? Math.max(0, opts.budgetMs) : 0;
  const started = now();
  const resume = opts.resume && opts.resume.v === 1 && opts.resume.root === root && Array.isArray(opts.resume.stack) ? opts.resume : null;
  const t = { bytes: resume?.bytes ?? 0, files: resume?.files ?? 0, dirs: resume?.dirs ?? 0, skipped: resume?.skipped ?? 0 };
  const stack: string[] = [];
  if (resume) {
    for (const rel of resume.stack) {
      if (safeRel(rel)) stack.push(rel);
      else t.skipped++;
    }
  } else stack.push("");

  while (stack.length > 0) {
    const rel = stack.pop()!;
    const abs = rel === "" ? root : join(root, ...rel.split("/"));
    let entries: Dirent[] | null = null;
    try {
      entries = await readdir(/* turbopackIgnore: true */ abs, { withFileTypes: true });
    } catch (err) {
      if ((err as { code?: string }).code !== "ENOENT") t.skipped++; // a folder removed meanwhile is simply gone
    }
    if (entries) {
      t.dirs++;
      const sub: string[] = [];
      const regular: string[] = [];
      for (const e of entries) {
        if (e.isDirectory()) sub.push(e.name);
        else if (e.isFile()) regular.push(e.name);
        else t.files++; // a link, socket, fifo…: an inode, never followed
      }
      // depth first, in name order: push in reverse so the smallest name is visited next
      sub.sort().reverse();
      for (const name of sub) stack.push(rel === "" ? name : `${rel}/${name}`);
      for (let i = 0; i < regular.length; i += STAT_BATCH) {
        const sizes = await Promise.all(
          regular.slice(i, i + STAT_BATCH).map((name) =>
            lstat(/* turbopackIgnore: true */ join(abs, name)).then(
              (st) => (st.isFile() ? st.size : 0),
              (err: { code?: string }) => (err.code === "ENOENT" ? null : -1),
            ),
          ),
        );
        for (const size of sizes) {
          if (size === null) continue;
          if (size < 0) t.skipped++;
          else {
            t.files++;
            t.bytes += size;
          }
        }
      }
    }
    if (stack.length === 0) break;
    if (now() - started >= budget) break;
    await yieldFn();
  }

  const complete = stack.length === 0;
  return { ...t, complete, cursor: complete ? null : { v: 1, root, stack, ...t } };
}

/** DATA_DIR_BUDGET_BYTES: a positive integer of bytes, else the 20 GiB default. */
export function budgetBytes(raw: string | undefined = process.env.DATA_DIR_BUDGET_BYTES): number {
  const v = raw?.trim();
  if (!v || !/^\d+$/.test(v)) return DEFAULT_DATA_DIR_BUDGET;
  const n = Number(v);
  return Number.isSafeInteger(n) && n > 0 ? n : DEFAULT_DATA_DIR_BUDGET;
}

/** The §H.5 alarm level of `bytes` against the budget: 85 % and above, 70 % and above, else null. */
export function dataDirLevel(bytes: number, budget: number = budgetBytes()): DataDirLevel | null {
  if (!(budget > 0) || !Number.isFinite(bytes) || bytes < 0) return null;
  const used = bytes / budget;
  if (used >= DATA_DIR_LEVELS.data_dir_85) return "data_dir_85";
  if (used >= DATA_DIR_LEVELS.data_dir_70) return "data_dir_70";
  return null;
}

/** The console's inode warning: more than 300,000 files (§G.2, §H.5). */
export function inodeWarning(files: number): boolean {
  return Number.isFinite(files) && files > INODE_WARN_FILES;
}

/** The snapshot in a `cron_cursors` state (`{ snapshot }`), or null when there is none or it is malformed. */
export function readWalkSnapshot(state: unknown): WalkSnapshot | null {
  const s = (state as { snapshot?: unknown } | null)?.snapshot as Partial<WalkSnapshot> | undefined;
  if (!s || typeof s !== "object" || s.complete !== true || typeof s.at !== "string") return null;
  const n = (v: unknown) => (typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : null);
  const bytes = n(s.bytes);
  const files = n(s.files);
  const budget = n(s.budgetBytes);
  if (bytes === null || files === null || budget === null || budget === 0) return null;
  return { bytes, files, dirs: n(s.dirs) ?? 0, budgetBytes: budget, complete: true, at: s.at };
}
