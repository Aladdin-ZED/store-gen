import "server-only";
/**
 * The Sheets run history (P5 INTEGRATIONS; operations.md OPE-§19.8 "Last runs", OPE-§L "Sheets run history"): the
 * last 20 `SheetsRunReport`s of a store, ≤ 4 KB, so Sheets has the same "what happened" surface as the outbox kinds
 * without being one. `pushStore` (step 4) records every run; the Sheets screen and `sheetsBacklog` read them.
 *
 * Where: `cron_cursors.state` of the job row `sheets.push:<storeId>` (one row per store). The job runner keeps one
 * row per job and has no per-store state of its own (src/lib/jobs/scope.ts), so the per-store row is the spec's
 * "state of sheets.push per store" (CCR r1-p5-2 tells P8). The row key comes from the scope only; the table has no
 * store_id, and a row holds counts, durations and cause codes, never a customer field or a sheet id.
 *
 * `activeSheetsStores()` is the platform count of the backlog threshold (core §H.5, ENGC-33): the stores whose push
 * recorded a run in the last hour, i.e. the stores slot 1 is serving. It counts rows and never reads one, and it is
 * cached 5 minutes under the platform key "p".
 */
import { and, count, eq, gte, like } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { cronCursors } from "@/lib/db/schema";
import { scopedCache } from "@/lib/tenancy/cache";
import type { StoreScope, WriteScope } from "@/lib/tenancy/types";

/** One run of `pushStore` for one store (OPE-§19.5, §19.8). */
export interface SheetsRunReport {
  /** when the run started (ISO) */
  at: string;
  ms: number;
  appended: number;
  updated: number;
  pulled: number;
  /** Google calls used (≤ 3 per store per tick) */
  calls: number;
  ok: boolean;
  /** a cause code (src/lib/integrations/causes.ts) when the run failed; never the raw error */
  error: string | null;
  /** "pull": a read-only run of the `sheets.pull` slot (OPE-§19.6) */
  trigger?: "tick" | "after" | "manual" | "pull";
}

export const RUN_HISTORY_MAX = 20;
export const RUN_HISTORY_BYTES = 4096;
/** a store counts as active while its last run is younger than this */
export const ACTIVE_WINDOW_MS = 60 * 60_000;

const JOB = "sheets.push";
const jobKey = (storeId: string) => `${JOB}:${storeId}`;
const CODE_RE = /^[a-z][a-z0-9_]{0,47}$/;
const TRIGGERS: ReadonlySet<string> = new Set(["tick", "after", "manual", "pull"]);

const count0 = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.min(1_000_000, Math.trunc(n))) : 0);

/** A report as it is stored: bounded numbers, a code or null, a valid date (anything else is dropped). */
export function cleanRun(r: Partial<SheetsRunReport> | null | undefined): SheetsRunReport | null {
  if (!r || typeof r !== "object") return null;
  const at = typeof r.at === "string" ? Date.parse(r.at) : NaN;
  if (!Number.isFinite(at)) return null;
  const run: SheetsRunReport = {
    at: new Date(at).toISOString(),
    ms: count0(r.ms),
    appended: count0(r.appended),
    updated: count0(r.updated),
    pulled: count0(r.pulled),
    calls: count0(r.calls),
    ok: r.ok === true,
    error: typeof r.error === "string" ? (CODE_RE.test(r.error) ? r.error : "unknown") : r.ok === true ? null : "unknown",
  };
  if (typeof r.trigger === "string" && TRIGGERS.has(r.trigger)) run.trigger = r.trigger;
  return run;
}

/** Newest first, at most 20, and the JSON at most 4 KB (the oldest runs go first). Pure. */
export function trimRuns(runs: readonly (Partial<SheetsRunReport> | null | undefined)[]): SheetsRunReport[] {
  const clean = runs.map(cleanRun).filter((r): r is SheetsRunReport => r !== null);
  clean.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  const out = clean.slice(0, RUN_HISTORY_MAX);
  while (out.length && Buffer.byteLength(JSON.stringify({ v: 1, runs: out }), "utf8") > RUN_HISTORY_BYTES) out.pop();
  return out;
}

function runsOf(state: Record<string, unknown> | null | undefined): SheetsRunReport[] {
  const runs = state && Array.isArray(state.runs) ? (state.runs as Partial<SheetsRunReport>[]) : [];
  return trimRuns(runs);
}

/** The store's last runs, newest first. */
export async function sheetsRunHistory(scope: StoreScope): Promise<SheetsRunReport[]> {
  const [row] = await db.select({ state: cronCursors.state }).from(cronCursors).where(eq(cronCursors.job, jobKey(scope.storeId))).limit(1);
  return runsOf(row?.state);
}

/**
 * Appends one run (read, add, trim, write). Two runs of one store finishing in the same instant may keep only one of
 * them: the history explains, it does not count (the counts live on the orders).
 */
export async function recordSheetsRun(scope: WriteScope, run: SheetsRunReport, opts: { now?: number } = {}): Promise<SheetsRunReport[]> {
  const clean = cleanRun(run);
  if (!clean) return sheetsRunHistory(scope);
  const runs = trimRuns([clean, ...(await sheetsRunHistory(scope))]);
  const state = { v: 1, runs };
  const updatedAt = new Date(opts.now ?? Date.now());
  await db.insert(cronCursors).values({ job: jobKey(scope.storeId), cursor: "", state, updatedAt }).onDuplicateKeyUpdate({ set: { state, updatedAt } });
  return runs;
}

/** The last run and the last failed run (for `sheetsBacklog` and P1's `sheets_error` flag). */
export function lastRuns(runs: readonly SheetsRunReport[]): { lastRunAt: string | null; lastRunFailedAt: string | null } {
  return { lastRunAt: runs[0]?.at ?? null, lastRunFailedAt: runs.find((r) => !r.ok)?.at ?? null };
}

const active = scopedCache<number>({ name: "int-sheets-active", maxEntries: 4, ttlMs: 5 * 60_000 });

/** How many stores the Sheets push served in the last hour (≥ 0); cached 5 minutes. */
export function activeSheetsStores(now = Date.now()): Promise<number> {
  return active.getOrLoad("p", "n", async () => {
    const [row] = await db
      .select({ n: count() })
      .from(cronCursors)
      .where(and(like(cronCursors.job, `${JOB}:%`), gte(cronCursors.updatedAt, new Date(now - ACTIVE_WINDOW_MS))));
    return Number(row?.n ?? 0);
  });
}

/** Forget the cached count (tests). */
export function forgetActiveSheetsStores(): void {
  active.clear();
}
