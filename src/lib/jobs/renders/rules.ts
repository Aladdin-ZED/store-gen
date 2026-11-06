/**
 * The render queue's pure rules (docs/STORE-SAAS.md §H.3, §H.2 slot 4, D25, D50, ENGC-4, ENGC-11; R1 P8 step 5). No
 * I/O and no clock of their own, so test:jobs drives them offline and the drain (./drain.ts), the SQL (./sql.ts), the
 * summaries (./summary.ts) and the API (../renders.ts) share them:
 *
 *   checkEnqueue(ids, reason, p)    the enqueue's checks: a stored reason, a priority 0-9 (default 5), unique page ids
 *   claimStatement()                the §H.3 claim: due or past-lease jobs of one store take the claim, a 2-minute lease
 *                                   and dedupe = NULL (ENGC-4), lowest priority first
 *   outcomeOf(attempts, r)          one re-render's result → done (with its gate notes), skipped, retry or failed
 *   notesText(items) / parseNotes   the gate notes as `render_jobs.error` holds them: "notes:<id>,<id>" (≤ 200)
 *   cpuCapMs(lagMs)                 the per-tick CPU budget: 4 s, 2 s while the event loop lags
 *   summarize(input, now)           the summary rows → RenderSummary (counts, oldest, failures, throughput, ETA, notes)
 *   checkFanout / parseFanout       a platform-wide fan-out request and its `cron_cursors.state.fanout` row
 */
import { renderJobs } from "@/lib/db/schema";
import { errorCode } from "../errors";
import type { RenderReason, RenderState, RenderSummary } from "../renders";

/** Every reason the 0005 `render_jobs.reason` enum stores (`reviews` arrives with 0007). */
export const RENDER_REASONS: readonly RenderReason[] = renderJobs.reason.enumValues;
/** The reasons a platform-wide fan-out may carry (PLA-§16.2 "Re-render all live pages", §H.10's integration deploy). */
export const FANOUT_REASONS = ["address", "runtime"] as const satisfies readonly RenderReason[];
export type FanoutReason = (typeof FANOUT_REASONS)[number];

/** `render_jobs.priority` (lower runs first): the default, and the Purchase trigger's (OPE Q.6). */
export const DEFAULT_PRIORITY = 5;
export const CONVERSIONS_PRIORITY = 4;
export const PRIORITY_MIN = 0;
export const PRIORITY_MAX = 9;

/** §H.2 slot 4: at most this many pages per store per tick */
export const PER_STORE_PER_TICK = 10;
/** §H.2 slot 4 (ENGC-11): the renders' CPU budget per tick (SSR, gzip and the gates of every re-render) */
export const CPU_BUDGET_MS = 4_000;
/** event-loop lag above which the renders shorten their own CPU budget (the runner's threshold, §H.2) */
export const LAG_SHORTEN_MS = 100;
/** the claim's lease (the §H.1 pattern) */
export const LEASE_MINUTES = 2;
/**
 * The delay before retry n (n = failed tries so far, 1-based): 1 min, 5 min, 30 min. §H.3 "failures retry 3 times
 * then failed": the 4th failing try marks the job `failed` (decision recorded in the P8 report, step 5).
 */
export const RENDER_BACKOFF_MS = [60_000, 300_000, 1_800_000] as const;
export const MAX_RETRIES = RENDER_BACKOFF_MS.length;
/** `render_jobs.error` */
export const ERROR_MAX = 200;
export const NOTES_PREFIX = "notes:";
/** the store states whose queued jobs the cron renders, and whose live pages a fan-out enqueues */
export const RENDER_STORE_STATES = ["pending", "active", "restricted", "suspended"] as const;
/** rows per INSERT IGNORE statement; ids per IN (…) list */
export const INSERT_BATCH = 100;
export const ID_BATCH = 500;
/** the summaries: the failure window, the throughput window, the notes window, the notes rows tallied, list sizes */
export const FAILED_WINDOW_MS = 24 * 3_600_000;
export const THROUGHPUT_WINDOW_MS = 3_600_000;
export const NOTES_WINDOW_MS = 7 * 24 * 3_600_000;
export const NOTES_ROWS = 500;
export const TOP_NOTES = 3;
export const REPUBLISH_LIST = 20;
export const TOP_STORES = 20;

/** a page id as `pages.id` holds it (id26; legacy ids are shorter alphanumerics) */
const PAGE_ID_RE = /^[0-9A-Za-z]{1,26}$/;
/** a gate item id as notes keep it ("budget:F5", "honesty:D2"): no comma, no space */
const NOTE_ID_RE = /^[A-Za-z0-9_.:-]{1,64}$/;

/* ------------------------------------------------------------------ */
/* Enqueue                                                             */
/* ------------------------------------------------------------------ */

export interface CheckedEnqueue {
  /** unique, well-formed ids in the order given, or every live page of the store */
  ids: string[] | "all-live";
  /** ids that cannot be a page id (counted with the foreign ones) */
  malformed: number;
  priority: number;
}

/** The enqueue's refusals (a programming error throws RangeError) and its normalised input. */
export function checkEnqueue(pageIds: readonly string[] | "all-live", reason: RenderReason, priority: number | undefined): CheckedEnqueue {
  if (!RENDER_REASONS.includes(reason)) throw new RangeError(`renders: unknown reason "${String(reason).slice(0, 24)}"`);
  const p = priority ?? DEFAULT_PRIORITY;
  if (!Number.isInteger(p) || p < PRIORITY_MIN || p > PRIORITY_MAX) throw new RangeError(`renders: priority must be an integer ${PRIORITY_MIN}-${PRIORITY_MAX}`);
  if (pageIds === "all-live") return { ids: "all-live", malformed: 0, priority: p };
  if (!Array.isArray(pageIds)) throw new RangeError('renders: pageIds must be a list or "all-live"');
  const seen = new Set<string>();
  let malformed = 0;
  for (const id of pageIds) {
    if (typeof id !== "string" || !PAGE_ID_RE.test(id)) malformed++;
    else seen.add(id);
  }
  return { ids: [...seen], malformed, priority: p };
}

/* ------------------------------------------------------------------ */
/* Claim                                                               */
/* ------------------------------------------------------------------ */

/**
 * The §H.3 claim (the §H.1 lease pattern; MariaDB 10.4 has no SKIP LOCKED), for one store: its jobs pending and due,
 * or running past their lease (a render that died), lowest priority first, take the claim token, a 2-minute lease and
 * `dedupe = NULL` (ENGC-4: a change that arrives while the job runs inserts a fresh pending row). A job taken over
 * from an expired lease counts that lost try (`attempts` is assigned before `state`: MariaDB assigns left to right).
 * Parameters: the claim token, the store id, the limit. The claimer then reads back `WHERE claim = ?`.
 */
export function claimStatement(): string {
  return `UPDATE render_jobs SET attempts = IF(state = 'running', attempts + 1, attempts), state = 'running', claim = ?, lease_until = UTC_TIMESTAMP(3) + INTERVAL ${LEASE_MINUTES} MINUTE, dedupe = NULL WHERE ((state = 'pending' AND not_before <= UTC_TIMESTAMP(3)) OR (state = 'running' AND lease_until < UTC_TIMESTAMP(3))) AND store_id = ? ORDER BY priority, not_before, id LIMIT ?`;
}

/** The CPU budget of the tick's renders: 4 s, halved while the event loop lags (ENGC-11). */
export function cpuCapMs(lagMs: number): number {
  return Number.isFinite(lagMs) && lagMs > LAG_SHORTEN_MS ? CPU_BUDGET_MS / 2 : CPU_BUDGET_MS;
}

/* ------------------------------------------------------------------ */
/* Outcomes                                                            */
/* ------------------------------------------------------------------ */

/** What one job's run writes. `requeue`: the live version moved meanwhile, so the page is queued again. */
export type RenderOutcome =
  | { state: "done"; error: string | null; requeue: boolean }
  | { state: "skipped"; error: "runtime_v1" | "not_live" }
  | { state: "pending"; attempts: number; retryInMs: number; error: string }
  | { state: "failed"; attempts: number; error: string };

/** The structural part of `rerenderInPlace`'s answer the rules read (src/lib/render/publish.server.ts). */
export interface RerenderAnswer {
  status: "rendered" | "skipped_runtime_v1" | "not_live" | "live_changed";
  notes: readonly { id: string }[];
}

/** A failure's code: a publish refusal's own code (`page_too_large`, `invalid`), else the error ring's choice. */
export function failureCode(err: unknown): string {
  const own = err && typeof err === "object" && Array.isArray((err as { issues?: unknown }).issues) ? (err as { code?: unknown }).code : null;
  return errorCode(err, typeof own === "string" ? own : null);
}

/**
 * One run's outcome. `attempts` = the failed tries before this one. Rendered → done, its gate notes (warn mode, §M.1)
 * in `error`; runtime_v 1 → skipped, listed for a manual republish; not live (unpublished, or not the store's page) →
 * skipped; the live version moved during the render → done, and the page is queued again for the new version; a throw
 * → retried after 1, 5, 30 min, then failed.
 */
export function outcomeOf(attempts: number, run: { result: RerenderAnswer } | { error: unknown }): RenderOutcome {
  if ("result" in run) {
    switch (run.result.status) {
      case "rendered":
        return { state: "done", error: notesText(run.result.notes), requeue: false };
      case "skipped_runtime_v1":
        return { state: "skipped", error: "runtime_v1" };
      case "not_live":
        return { state: "skipped", error: "not_live" };
      case "live_changed":
        return { state: "done", error: "live_changed", requeue: true };
    }
  }
  return failedTry(attempts, "error" in run ? failureCode(run.error) : "unknown");
}

/** A failed try: back to pending after the ladder's delay, or failed once the 3 retries are used. */
export function failedTry(attempts: number, code: string): RenderOutcome {
  const n = Math.max(0, Math.trunc(attempts)) + 1;
  const error = code.slice(0, ERROR_MAX);
  if (n > MAX_RETRIES) return { state: "failed", attempts: n, error };
  return { state: "pending", attempts: n, retryInMs: RENDER_BACKOFF_MS[n - 1]!, error };
}

/** "notes:<id>,<id>" of the gate items, each id once, whole ids only within 200 characters; null without notes. */
export function notesText(items: readonly { id: string }[]): string | null {
  const ids: string[] = [];
  let len = NOTES_PREFIX.length;
  for (const it of items) {
    const id = typeof it?.id === "string" ? it.id : "";
    if (!NOTE_ID_RE.test(id) || ids.includes(id)) continue;
    const add = (ids.length ? 1 : 0) + id.length;
    if (len + add > ERROR_MAX) break;
    ids.push(id);
    len += add;
  }
  return ids.length ? NOTES_PREFIX + ids.join(",") : null;
}

/** The gate item ids of a `render_jobs.error` that holds notes; null for anything else (a failure code). */
export function parseNotes(error: string | null | undefined): string[] | null {
  if (typeof error !== "string" || !error.startsWith(NOTES_PREFIX)) return null;
  return error
    .slice(NOTES_PREFIX.length)
    .split(",")
    .filter((id) => NOTE_ID_RE.test(id));
}

/* ------------------------------------------------------------------ */
/* Summaries                                                           */
/* ------------------------------------------------------------------ */

/** What the summary queries read (./summary.ts), one store's or every store's. */
export interface SummaryInput {
  counts: readonly { reason: RenderReason; state: RenderState; n: number }[];
  /** the oldest pending job (by enqueue time) */
  oldest: { storeId: string; pageId: string; reason: RenderReason; slug: string | null; createdAt: Date } | null;
  /** failed jobs finished in the failure window, by store and code */
  failed: readonly { storeId: string; error: string | null; n: number }[];
  /** jobs finished in the throughput window, by state */
  finished: readonly { state: RenderState; n: number }[];
  /** pages with gate notes recorded in the notes window */
  notesPages: number;
  /** the latest notes texts (≤ NOTES_ROWS) */
  notesTexts: readonly (string | null)[];
  /** runtime_v 1 pages (skipped, listed for a manual republish) */
  republish: readonly { storeId: string; pageId: string }[];
  /** failed jobs finished before the failure window (still failed: the render_failed_old alarm, PLA-§15.2) */
  failedOld: number;
}

/** Minutes to drain `pending` at the last hour's rate; null when the rate is 0 (never invented). */
export function etaMinutes(pending: number, finishedLastHour: number): number | null {
  if (!(finishedLastHour > 0)) return null;
  if (!(pending > 0)) return 0;
  return Math.ceil((pending * 60) / finishedLastHour);
}

/** The `n` most frequent gate item ids, ties by id. */
export function topNoteIds(texts: readonly (string | null)[], n: number = TOP_NOTES): { id: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const t of texts) for (const id of new Set(parseNotes(t) ?? [])) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .slice(0, n)
    .map(([id, count]) => ({ id, count }));
}

const STATES: readonly RenderState[] = renderJobs.state.enumValues;

/** The summary rows → RenderSummary at `now` (epoch ms). */
export function summarize(input: SummaryInput, now: number): RenderSummary {
  const byReason = new Map<RenderReason, RenderSummary["byReason"][number]>();
  const totals = Object.fromEntries(STATES.map((s) => [s, 0])) as Record<RenderState, number>;
  for (const c of input.counts) {
    const n = Number(c.n) || 0;
    const r = byReason.get(c.reason) ?? { reason: c.reason, pending: 0, running: 0, failed: 0, done: 0, skipped: 0 };
    byReason.set(c.reason, r);
    r[c.state] += n;
    totals[c.state] += n;
  }

  const stores = new Map<string, { count: number; codes: Map<string, number> }>();
  for (const f of input.failed) {
    const n = Number(f.n) || 0;
    const s = stores.get(f.storeId) ?? { count: 0, codes: new Map<string, number>() };
    stores.set(f.storeId, s);
    s.count += n;
    const code = f.error ?? "unknown";
    s.codes.set(code, (s.codes.get(code) ?? 0) + n);
  }
  const failed24h = [...stores.entries()]
    .map(([storeId, s]) => {
      const codes = [...s.codes.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([code, count]) => ({ code, count }));
      return { storeId, count: s.count, error: codes[0]?.code ?? null, codes };
    })
    .sort((a, b) => b.count - a.count || (a.storeId < b.storeId ? -1 : 1));

  const finished = input.finished.reduce((n, f) => n + (Number(f.n) || 0), 0);
  const doneLastHour = input.finished.filter((f) => f.state === "done").reduce((n, f) => n + (Number(f.n) || 0), 0);
  const ageMin = input.oldest ? Math.max(0, Math.floor((now - input.oldest.createdAt.getTime()) / 60_000)) : null;

  return {
    byReason: RENDER_REASONS.filter((r) => byReason.has(r)).map((r) => byReason.get(r)!),
    oldestPending: input.oldest && ageMin !== null ? { storeId: input.oldest.storeId, pageId: input.oldest.pageId, ageMin, slug: input.oldest.slug, reason: input.oldest.reason } : null,
    failed24h,
    doneLastHour,
    notes: Math.max(0, Number(input.notesPages) || 0),
    totals,
    oldestMin: ageMin,
    finishedLastHour: finished,
    throughputPerMin: Math.round((finished / 60) * 10) / 10,
    etaMin: etaMinutes(totals.pending, finished),
    failedOld: Math.max(0, Number(input.failedOld) || 0),
    topNotes: topNoteIds(input.notesTexts),
    republish: input.republish.slice(0, REPUBLISH_LIST).map((r) => ({ storeId: r.storeId, pageId: r.pageId })),
    at: new Date(now).toISOString(),
  };
}

/* ------------------------------------------------------------------ */
/* The platform-wide fan-out                                           */
/* ------------------------------------------------------------------ */

/** The fan-out job, and the `cron_cursors` row that holds its request and progress (`state.fanout`). */
export const FANOUT_JOB = "renders.fanout";
/** stores read per page while fanning out */
export const FANOUT_PAGE = 50;
/** `live`: every live page of every store (PLA-§16.2 "Re-render all live pages"); `failed`: the failed jobs' pages again ("Retry failed") */
export type FanoutMode = "live" | "failed";

/** One fan-out request and how far it got (the console's progress, PLA-§16.2). */
export interface FanoutState {
  id: string;
  mode: FanoutMode;
  /** live: the reason every job carries; failed: only the failed jobs of this reason (null = every reason) */
  reason: RenderReason | null;
  priority: number;
  requestedAt: string;
  /** the staff user (null: a deploy script, the system) */
  requestedBy: string | null;
  /** the last store id handled ("" before the first) */
  after: string;
  /** stores in the render states when the request was made (the progress denominator) */
  total: number;
  /** stores handled so far, jobs inserted so far, stores whose enqueue threw */
  stores: number;
  enqueued: number;
  failedStores: number;
  doneAt: string | null;
}

/** A fan-out request's refusals (a programming error throws RangeError). */
export function checkFanout(mode: FanoutMode, reason: RenderReason | null): void {
  if (mode === "live") {
    if (!(FANOUT_REASONS as readonly string[]).includes(String(reason))) throw new RangeError(`renders: a live fan-out takes ${FANOUT_REASONS.join(" or ")}`);
    return;
  }
  if (mode !== "failed") throw new RangeError("renders: unknown fan-out mode");
  if (reason !== null && !RENDER_REASONS.includes(reason)) throw new RangeError(`renders: unknown reason "${String(reason).slice(0, 24)}"`);
}

const ISO_RE = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$/;
const nonNeg = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null);

/** `cron_cursors.state` (JSON text) → its fan-out, or null when there is none or it is not one this code wrote. */
export function parseFanout(raw: unknown): FanoutState | null {
  let state: unknown = raw;
  if (typeof raw === "string") {
    try {
      state = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  const f = state && typeof state === "object" ? (state as { fanout?: unknown }).fanout : null;
  if (!f || typeof f !== "object") return null;
  const v = f as Record<string, unknown>;
  const mode = v.mode === "live" || v.mode === "failed" ? v.mode : null;
  const reason = v.reason === null ? null : RENDER_REASONS.includes(v.reason as RenderReason) ? (v.reason as RenderReason) : undefined;
  const nums = [v.priority, v.total, v.stores, v.enqueued, v.failedStores].map(nonNeg);
  if (typeof v.id !== "string" || !PAGE_ID_RE.test(v.id) || !mode || reason === undefined || nums.some((n) => n === null)) return null;
  if (typeof v.requestedAt !== "string" || !ISO_RE.test(v.requestedAt)) return null;
  if (v.doneAt !== null && (typeof v.doneAt !== "string" || !ISO_RE.test(v.doneAt))) return null;
  if (typeof v.after !== "string" || (v.after !== "" && !PAGE_ID_RE.test(v.after))) return null;
  const [priority, total, stores, enqueued, failedStores] = nums as number[];
  if (priority! > PRIORITY_MAX) return null;
  return {
    id: v.id,
    mode,
    reason,
    priority: priority!,
    requestedAt: v.requestedAt,
    requestedBy: typeof v.requestedBy === "string" && PAGE_ID_RE.test(v.requestedBy) ? v.requestedBy : null,
    after: v.after,
    total: total!,
    stores: stores!,
    enqueued: enqueued!,
    failedStores: failedStores!,
    doneAt: v.doneAt as string | null,
  };
}
