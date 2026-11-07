import "server-only";
/**
 * The Sheets push (P5 INTEGRATIONS; operations.md OPE-§19.5, §19.7, §19.8, §28.2, §26, OPE-§J `sheets.push`, OPE-§L;
 * OD2, OD22; docs/STORE-SAAS.md §H.2 slot 1, §E.2, §E.6, §E.7, §E.8, §H.8, §A.5.2, D22, D54).
 *
 *   scheduleSheetPush(scope)                         a change to write: debounced 2 s per store, then after() (inline in jobs)
 *   await pushStore(scope, { maxCalls: 2 })          one run for one store (the after() fast path: ≤ 2 Google calls)
 *   await runSheetsPushTick(ctx, { budgetMs })       the `sheets.push` slot: stores oldest pending first, ≤ 3 calls each
 *
 * One run (OPE-§19.5):
 *  1. Preconditions: the platform service account, a connected sheet that is `enabled` and bound to the store
 *     (`sheet_bindings`), the feature `sheets` (false while pending, and under the `sheets_sync_enabled` kill switch,
 *     §A.5.2, §H.8: the orders keep `pending`), the Google breaker closed, a `p:sheets:sa` token left.
 *  2. Work, under `storeLock(storeId, "sheets")`: appends = pending, or failed past the backoff, `is_test = 0` (≤ 100,
 *     oldest first); updates = synced with `sheet_dirty > 0`, `is_test = 0` (≤ 200). A test order never reaches a sheet,
 *     "Send again" included (OPE-§26, D54: the public path stores it `disabled`, and every query here says `is_test = 0`).
 *  3. The planner (./plan.ts, pure) decides the calls: at most one read (values:batchGet of the header row and the rows),
 *     one append, one values:batchUpdate, never more than `maxCalls`. Every Google call first takes a `p:sheets:sa`
 *     token (50 / 60 s, the shared service account); none left → the run stops and the work waits for the next run.
 *  4. Marks: appended → `synced` and `sheet_dirty` cleared only while `rev` (and `updated_at`, for the R1.0 writers
 *     that do not bump `rev` yet) is still the one read: an order changed meanwhile goes back to `pending` and the next
 *     run finds its row and rewrites the cells; updated → the bits written cleared on the same guard. An append stopped
 *     before its call (quota, budget, deadline) gives its claim back. `sheet_label` = the label written into column C
 *     whatever happened (a fact about the
 *     sheet, which the pull compares with); a dirty order whose row was deleted → "Row not found in the sheet",
 *     `sheet_dirty = 0`, never re-appended.
 *  5. A 429 opens the platform breaker for 90 s (`cron_cursors.state.breakerUntil` of `sheets.push`, with an in-memory
 *     copy every run checks): no store calls Google until it closes. Any other failure (a timeout included: no call
 *     outlives the run's deadline, and a tick run has `STORE_SLICE_MS`) marks the appends of the failed call `failed`
 *     (their backoff grows) with `explain()`'s words in `sheet_error`.
 *  6. `integration_status (sheets)` (OPE-§28.2): ok / warn (oldest waiting order > 5 min) / failing (3 failed runs, or
 *     this store's run opened the breaker) / off (paused), with the backlog and the oldest waiting order; the run is
 *     appended to the store's history (./history.ts, ≤ 20 runs, ≤ 4 KB). Codes and counts only, never a cell.
 *
 * The pull (OPE-§19.6, ./pull.ts) rides on the same read. With "Bring status changes back" on, a run whose store's
 * window is open (`s:<sid>:sheets:pull`, 1 per 290 s, taken only when the run really reads the rows) plans with
 * `pull: "due"`: the read widens to the pulled optional columns, every row is matched against the store's own synced
 * orders, and the decisions are applied before the writes; otherwise `pull: "on"` still checks the rows of the run's
 * own dirty orders, so a person's edit is never overwritten unseen. `pullOnly` runs (the `sheets.pull` slot,
 * `runSheetsPullTick`, and the R1.0 `pullStatuses`) make that one read and nothing else.
 *
 * A connected setting whose spreadsheet has no binding is "not connected" (OPE-§19.2); before giving up, the run calls
 * `ensureLegacyBinding` once per store and process (./bind-legacy.ts), so a store that connected before 0005 keeps
 * syncing without waiting for the `sheets.bind_legacy` job.
 */
import { after } from "next/server";
import { and, asc, count, eq, gt, inArray, min, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { storeLock, withNamedLock } from "@/lib/db/locks";
import { cronCursors, orders, storeMembers, users } from "@/lib/db/schema";
import { classifySheetsError } from "@/lib/integrations/causes";
import { recordIntegrationStatus, type StatusOutcome } from "@/lib/integrations/status";
import { forEachStore, systemScope } from "@/lib/jobs/scope";
import { errorSummary } from "@/lib/orders/log";
import { platformBucket, rateLimit, rateLimitReached } from "@/lib/security/rate-limit";
import { getStoreSetting } from "@/lib/settings";
import { scopedCache } from "@/lib/tenancy/cache";
import { assertFeature, EntitlementError } from "@/lib/tenancy/entitlements";
import { getStoreById } from "@/lib/tenancy/public";
import { whereStore } from "@/lib/tenancy/sql";
import type { StoreScope, SystemCtx, WriteScope } from "@/lib/tenancy/types";
import { ensureLegacyBinding } from "./bind-legacy";
import { gapi, isSheetsConfigured, serviceAccountEmail, SheetsError, type GapiOptions } from "./client";
import { getSheetsConfig, sheetBound, type SheetsConfig } from "./config";
import { a1 } from "./format";
import { recordSheetsRun, type SheetsRunReport } from "./history";
import { explain } from "./orders-sheet";
import {
  APPEND_MAX,
  BACKOFF_CAP_MIN,
  UPDATE_MAX,
  appendDue,
  planSheetRun,
  sheetRowsOf,
  type PlanOrder,
  type PullOrder,
  type SheetMark,
  type SheetRead,
  type SheetReadSpec,
  type SheetRunCtx,
  type SheetRunInput,
  type SheetRunPlan,
} from "./plan";
import { applyPullDecisions, pullDue, selectPullOrders, sheetNoteHashes, takePullToken } from "./pull";
import { sheetColumnsOf, type Cell, type SheetColumns } from "./row";
import { orderItemsView, type AnyOrderItems } from "@/lib/orders/items-v3";

/* ------------------------------------------------------------------ */
/* limits                                                              */
/* ------------------------------------------------------------------ */

/** `scheduleSheetPush`: changes of one store within this window share one push */
export const PUSH_DEBOUNCE_MS = 2_000;
/** `p:sheets:sa`: the shared service account's calls (Google allows 60 per minute per user; core §E.8) */
export const SA_BUCKET = { name: "sheets:sa", limit: 50, windowSec: 60 } as const;
/** a 429 closes Google to every store for this long (OPE-§19.7) */
export const BREAKER_MS = 90_000;
/** one Google call never runs longer (and never past the run's deadline, though never shorter than the floor) */
export const CALL_TIMEOUT_MS = 8_000;
const MIN_CALL_TIMEOUT_MS = 250;
/** one store's run inside the `sheets.push` slot: a slow sheet times out, backs off and leaves the slot to the others */
export const STORE_SLICE_MS = 6_000;
/** the `sheets.push` slot visits at most this many stores per tick (the bucket stops it earlier: ≈ 16 with 3 calls each) */
export const MAX_STORES_PER_TICK = 50;
/** the optional columns of a tab are read again after this long, and after any failed write */
const HEADER_TTL_MS = 10 * 60_000;
/** the sheet's language: its contract headers and column C labels are French (OPE-§19.4) */
const SHEET_LOCALE = "fr" as const;
const DEFAULT_TZ = "Africa/Casablanca";
const JOB = "sheets.push";
/** the round-robin cursor of the `sheets.pull` slot (core §H.2 slot 2) */
const PULL_JOB = "sheets.pull";
const MESSAGE_MAX = 500;

/* ------------------------------------------------------------------ */
/* results                                                             */
/* ------------------------------------------------------------------ */

export type PushTrigger = "tick" | "after" | "manual" | "pull";

export interface PushOptions {
  maxCalls: 1 | 2 | 3;
  /** false: no pull on this run's read (default: pull when "Bring status changes back" is on and the window is open) */
  pull?: boolean;
  /** pull whatever the 290 s window says ("Sync now"; the window restarts) */
  forcePull?: boolean;
  /** the read and the pull only, never an append or a cell write (the `sheets.pull` slot, `pullStatuses`) */
  pullOnly?: boolean;
  /** "Sync now", "Send again": failed orders skip their backoff */
  force?: boolean;
  trigger?: PushTrigger;
  /** epoch ms: no Google call starts after it (the job's `ctx.deadline`) */
  deadline?: number;
}

/**
 * Why a run made no call at all: a precondition, or another run of the store holding its lock; a `pullOnly` run also
 * when "Bring status changes back" is off (`pull_off`) or the store was pulled less than 290 s ago (`not_due`).
 */
export type PushSkip = "not_configured" | "unbound" | "disabled" | "feature_off" | "breaker" | "quota" | "locked" | "pull_off" | "not_due";
/** Why a run stopped before its plan was done (the rest waits for the next run). */
export type PushStop = "quota" | "breaker" | "deadline" | "budget";

/** One run of `pushStore`: the history row (`SheetsRunReport`) plus what the callers and the job report. */
export interface SheetsPushResult extends SheetsRunReport {
  skipped: PushSkip | null;
  /** an `EntitlementError` reason when `skipped` is "feature_off" ("kill": the `sheets_sync_enabled` switch) */
  offReason: EntitlementError["reason"] | null;
  stopped: PushStop | null;
  /** appends already in the sheet (a retry, an upsell): marked synced, nothing written */
  present: number;
  /** dirty orders whose row is gone from the sheet */
  missing: number;
  /** orders this run marked `failed` */
  failed: number;
  /** rows the run read (the pull's rows: the ids found in column A) */
  seen: number;
  /** pull decisions left in the sheet for the next pull (P4's calls not available yet, or a failure) */
  pullDeferred: number;
  /** this run opened the platform breaker (Google answered 429) */
  breaker: boolean;
  deferred: { appends: number; updates: number };
  /** the owner's plain-words explanation (French, `explain()`) of a failed or limited run */
  message: string | null;
}

function emptyResult(at: Date, trigger: PushTrigger, skipped: PushSkip | null = null): SheetsPushResult {
  return {
    at: at.toISOString(),
    ms: 0,
    appended: 0,
    updated: 0,
    pulled: 0,
    calls: 0,
    ok: true,
    error: null,
    trigger,
    skipped,
    offReason: null,
    stopped: null,
    present: 0,
    missing: 0,
    failed: 0,
    seen: 0,
    pullDeferred: 0,
    breaker: false,
    deferred: { appends: 0, updates: 0 },
    message: null,
  };
}

/** "Google limits the writes for now" (the 429 words of `explain()`), for a run the breaker or the bucket held back. */
const limitedMessage = () => explain(new SheetsError(429, "RESOURCE_EXHAUSTED", "rate limited"), serviceAccountEmail());

/* ------------------------------------------------------------------ */
/* the breaker and the platform bucket (OPE-§19.7)                     */
/* ------------------------------------------------------------------ */

/** epoch ms until which Google is closed (0 = closed breaker), cached 15 s under the platform key: every run checks it */
const breakerCache = scopedCache<number>({ name: "sheets-breaker", maxEntries: 4, ttlMs: 15_000 });
const PLATFORM = "p";

/** Until when the Google breaker is open (epoch ms; ≤ now = closed). */
export function sheetsBreakerUntil(): Promise<number> {
  return breakerCache.getOrLoad(PLATFORM, "until", async () => {
    const [row] = await db.select({ state: cronCursors.state }).from(cronCursors).where(eq(cronCursors.job, JOB)).limit(1);
    const raw = row?.state?.breakerUntil;
    const until = typeof raw === "string" ? Date.parse(raw) : NaN;
    return Number.isFinite(until) ? until : 0;
  });
}

/** Open the breaker for `BREAKER_MS` from `now`: this process at once, every other one within 15 s. */
export async function openSheetsBreaker(now = Date.now()): Promise<number> {
  const until = now + BREAKER_MS;
  breakerCache.set(PLATFORM, "until", until);
  const iso = new Date(until).toISOString();
  // the runner owns `cursor` of this row; the breaker lives in `state` beside whatever else is kept there
  await db
    .insert(cronCursors)
    .values({ job: JOB, cursor: "", state: { breakerUntil: iso }, updatedAt: new Date(now) })
    .onDuplicateKeyUpdate({ set: { state: sql`JSON_SET(COALESCE(${cronCursors.state}, '{}'), '$.breakerUntil', ${iso})` } });
  return until;
}

/** Forget this process's copy of the breaker (tests: the row is read again on the next run). */
export function forgetSheetsBreaker(): void {
  breakerCache.clear();
}

const saBucket = () => platformBucket(SA_BUCKET.name);
/** Take one token of the shared service account's bucket: false when none is left in this window. */
const takeToken = async (): Promise<boolean> => (await rateLimit(saBucket(), SA_BUCKET.limit, SA_BUCKET.windowSec)).ok;

/* ------------------------------------------------------------------ */
/* the work (the planner's predicates, in SQL)                         */
/* ------------------------------------------------------------------ */

/** What the planner reads of an order (the row content, the R1 cells, the Sheets bookkeeping); never `capi_ctx`. */
const PLAN_COLUMNS = {
  id: orders.id,
  createdAt: orders.createdAt,
  updatedAt: orders.updatedAt,
  status: orders.status,
  name: orders.name,
  phone: orders.phone,
  city: orders.city,
  address: orders.address,
  productName: orders.productName,
  items: orders.items,
  qty: orders.qty,
  subtotal: orders.subtotal,
  shipping: orders.shipping,
  total: orders.total,
  note: orders.note,
  email: orders.email,
  riskScore: orders.riskScore,
  utm: orders.utm,
  source: orders.source,
  ref: orders.ref,
  landmark: orders.landmark,
  confirmState: orders.confirmState,
  shipState: orders.shipState,
  confirmedBy: orders.confirmedBy,
  confirmedByLabel: orders.confirmedByLabel,
  trackingRef: orders.trackingRef,
  carrierLabel: orders.carrierLabel,
  shipAfter: orders.shipAfter,
  rev: orders.rev,
  isTest: orders.isTest,
  sheetStatus: orders.sheetStatus,
  sheetAttempts: orders.sheetAttempts,
  sheetDirty: orders.sheetDirty,
  sheetLabel: orders.sheetLabel,
};

/**
 * pending, or failed past min(2^attempts, 360) minutes (`force`: any failed); the planner's `appendDue` in SQL. The
 * push's append work and the R1.0 `selectSyncBatch` (./sync.ts, SHT-02) both put it beside `is_test = 0` in their
 * `whereStore`.
 */
export function appendPredicate(now: Date, force: boolean): SQL {
  if (force) return inArray(orders.sheetStatus, ["pending", "failed"]);
  return or(
    eq(orders.sheetStatus, "pending"),
    and(eq(orders.sheetStatus, "failed"), sql`${orders.updatedAt} <= DATE_SUB(${now}, INTERVAL LEAST(POW(2, ${orders.sheetAttempts}), ${BACKOFF_CAP_MIN}) MINUTE)`),
  )!;
}

/** R2 contract step (C2-B1, STO-R8): the rows' items as their v1 / v2 view (a v3 store order as one v2-shaped record). */
const withItemsView = <R extends { items: AnyOrderItems }>(rows: R[]) => rows.map((r) => ({ ...r, items: orderItemsView(r.items) }));

/**
 * The store's orders the push may append, oldest first (`limit` default 100, at most 101: the planner sees one more
 * than it takes): its own (whereStore), never a test order, pending or failed past the backoff.
 */
export function selectAppendWork(scope: StoreScope, opts: { now?: Date; force?: boolean; limit?: number } = {}): Promise<PlanOrder[]> {
  return db
    .select(PLAN_COLUMNS)
    .from(orders)
    .where(whereStore(orders, scope, eq(orders.isTest, false), appendPredicate(opts.now ?? new Date(), !!opts.force)))
    .orderBy(asc(orders.createdAt), asc(orders.id))
    .limit(Math.max(1, Math.min(APPEND_MAX + 1, opts.limit ?? APPEND_MAX)))
    .then(withItemsView);
}

/** The store's synced orders with a change to write (`orders_dirty_idx`), oldest first, never a test order. */
function selectUpdateWork(scope: StoreScope, limit: number): Promise<PlanOrder[]> {
  return db
    .select(PLAN_COLUMNS)
    .from(orders)
    .where(whereStore(orders, scope, eq(orders.isTest, false), eq(orders.sheetStatus, "synced"), gt(orders.sheetDirty, 0)))
    .orderBy(asc(orders.createdAt), asc(orders.id))
    .limit(limit)
    .then(withItemsView);
}

/** Display names of the members who confirmed orders of this batch (the "Agent" cell). */
async function memberNamesOf(scope: StoreScope, work: readonly PlanOrder[]): Promise<Record<string, string>> {
  const ids = [...new Set(work.map((o) => o.confirmedBy).filter((v): v is string => !!v))];
  if (!ids.length) return {};
  const rows = await db
    .select({ id: storeMembers.userId, name: users.name })
    .from(storeMembers)
    .innerJoin(users, eq(users.id, storeMembers.userId))
    .where(whereStore(storeMembers, scope, inArray(storeMembers.userId, ids)));
  return Object.fromEntries(rows.filter((r) => r.name).map((r) => [r.id, r.name]));
}

/** `ops.agentLabels` (P4's key, read only: the sheet's "Agent" labels → members, OD54); none when it cannot be read. */
async function agentLabelsOf(scope: StoreScope): Promise<Record<string, string>> {
  try {
    return { ...(await getStoreSetting(scope, "ops")).agentLabels };
  } catch {
    return {};
  }
}

/** Pending and failed appends of the store and the oldest of them (`integration_status.backlog`, OPE-§28.2). */
async function backlogOf(scope: StoreScope): Promise<{ backlog: number; oldestPendingAt: Date | null }> {
  const [row] = await db
    .select({ n: count(), oldest: min(orders.createdAt) })
    .from(orders)
    .where(whereStore(orders, scope, eq(orders.isTest, false), inArray(orders.sheetStatus, ["pending", "failed"])));
  return { backlog: Number(row?.n ?? 0), oldestPendingAt: row?.oldest ?? null };
}

/* ------------------------------------------------------------------ */
/* Google calls                                                        */
/* ------------------------------------------------------------------ */

type Tab = Pick<SheetsConfig, "spreadsheetId" | "sheetTitle">;

/** The optional columns of a tab (store-keyed: a spreadsheet belongs to one store, §E.6). */
const headerCache = scopedCache<SheetColumns>({ name: "sheets-headers", maxEntries: 4_000, ttlMs: HEADER_TTL_MS });
const headerKey = (tab: Tab) => `${tab.spreadsheetId}|${tab.sheetTitle}`;

const sid = (tab: Tab) => `/${encodeURIComponent(tab.spreadsheetId)}`;

/** Thrown by `beforeCall` when the run may not make another call. */
class StopRun extends Error {
  constructor(readonly why: PushStop) {
    super(`sheets push stopped: ${why}`);
    this.name = "StopRun";
  }
}

/** The plan's one read: the header row and (when asked) the rows, in one values:batchGet. */
async function readSheet(tab: Tab, spec: SheetReadSpec, gopts: GapiOptions): Promise<SheetRead> {
  const ranges = [spec.header, ...(spec.rows ? [spec.rows] : [])].map((r) => `ranges=${encodeURIComponent(a1(tab.sheetTitle, r))}`);
  const r = await gapi<{ valueRanges?: { values?: unknown[][] }[] }>(`${sid(tab)}/values:batchGet?${ranges.join("&")}&majorDimension=ROWS`, {}, gopts);
  const vr = Array.isArray(r.valueRanges) ? r.valueRanges : [];
  const header = Array.isArray(vr[0]?.values?.[0]) ? vr[0]!.values![0]! : [];
  const rows = spec.rows && Array.isArray(vr[1]?.values) ? vr[1]!.values! : [];
  return { header, rows };
}

/** One append of the new rows (RAW: stored literally; `null` cells are skipped, so other columns stay untouched). */
async function appendRows(tab: Tab, rows: (Cell | null)[][], gopts: GapiOptions): Promise<void> {
  await gapi(
    `${sid(tab)}/values/${encodeURIComponent(a1(tab.sheetTitle, "A1"))}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    { method: "POST", body: JSON.stringify({ majorDimension: "ROWS", values: rows }) },
    gopts,
  );
}

/** One values:batchUpdate of the dirty cells (the plan's ranges, prefixed with the tab). */
async function updateRanges(tab: Tab, data: { range: string; values: Cell[][] }[], gopts: GapiOptions): Promise<void> {
  await gapi(
    `${sid(tab)}/values:batchUpdate`,
    { method: "POST", body: JSON.stringify({ valueInputOption: "RAW", data: data.map((d) => ({ range: a1(tab.sheetTitle, d.range), majorDimension: "ROWS", values: d.values })) }) },
    gopts,
  );
}

/* ------------------------------------------------------------------ */
/* marks (OPE-§19.5 steps 6, 7)                                        */
/* ------------------------------------------------------------------ */

const ALL_BITS = 7;

/** When each order of the run was read (`updated_at`): the second half of the guard below. */
type ReadAt = ReadonlyMap<string, Date>;

/**
 * `(id, rev, updated_at) IN ((…), …)`: the order is still the one the plan read. `rev` is the R1 guard (every R1
 * write bumps it); `updated_at` also catches the R1.0 writers that do not bump it yet (the orders admin's status
 * write, the upsell), so a status chosen while the run was reading is never cleared as written.
 */
const unchanged = (marks: readonly SheetMark[], readAt: ReadAt): SQL =>
  sql`(${orders.id}, ${orders.rev}, ${orders.updatedAt}) IN (${sql.join(
    marks.map((m) => sql`(${m.id}, ${m.rev}, ${sql.param(readAt.get(m.id) ?? new Date(0), orders.updatedAt)})`),
    sql`, `,
  )})`;

function groupBy<T>(items: readonly T[], key: (t: T) => string): T[][] {
  const out = new Map<string, T[]>();
  for (const t of items) (out.get(key(t)) ?? out.set(key(t), []).get(key(t))!).push(t);
  return [...out.values()];
}

/**
 * Applies the marks of a plan, a few statements per outcome (grouped by label and bits), every one
 * `WHERE store_id = ? AND id IN (…)`. The rev guard (`unchanged`) is in each SET, so a changed order keeps its bits.
 */
async function applyMarks(scope: WriteScope, marks: readonly SheetMark[], readAt: ReadAt): Promise<void> {
  const ids = (ms: readonly SheetMark[]) => inArray(orders.id, ms.map((m) => m.id));
  for (const g of groupBy(marks.filter((m) => m.outcome === "appended"), (m) => String(m.set.sheetLabel))) {
    const same = unchanged(g, readAt);
    await db
      .update(orders)
      .set({
        // the row is in the sheet; an order changed since the read goes back to pending and is found there next run
        sheetStatus: sql`IF(${same}, 'synced', 'pending')`,
        sheetError: null,
        sheetLabel: g[0]!.set.sheetLabel ?? null,
        sheetDirty: sql`IF(${same}, ${orders.sheetDirty} & ${ALL_BITS & ~g[0]!.clearDirty}, ${orders.sheetDirty})`,
      })
      .where(whereStore(orders, scope, ids(g)));
  }
  for (const g of groupBy(marks.filter((m) => m.outcome === "present"), (m) => `${String(m.set.sheetLabel)}|${m.dirtyOr}`)) {
    await db
      .update(orders)
      .set({ sheetStatus: "synced", sheetError: null, sheetLabel: g[0]!.set.sheetLabel ?? null, sheetDirty: sql`${orders.sheetDirty} | ${g[0]!.dirtyOr & ALL_BITS}` })
      .where(whereStore(orders, scope, ids(g)));
  }
  for (const g of groupBy(marks.filter((m) => m.outcome === "updated"), (m) => `${m.clearDirty}|${"sheetLabel" in m.set ? String(m.set.sheetLabel) : "-"}`)) {
    const same = unchanged(g, readAt);
    await db
      .update(orders)
      .set({
        sheetLabel: "sheetLabel" in g[0]!.set ? (g[0]!.set.sheetLabel ?? null) : sql`${orders.sheetLabel}`,
        sheetDirty: sql`IF(${same}, ${orders.sheetDirty} & ${ALL_BITS & ~g[0]!.clearDirty}, ${orders.sheetDirty})`,
      })
      .where(whereStore(orders, scope, ids(g)));
  }
  const gone = marks.filter((m) => m.outcome === "missing");
  if (gone.length) {
    // the row was deleted in the sheet: shown in the drawer with "Send again", never re-appended (no fight with a person)
    await db.update(orders).set({ sheetError: gone[0]!.set.sheetError ?? null, sheetDirty: 0 }).where(whereStore(orders, scope, ids(gone)));
  }
}

/** The appends about to be sent: any later attempt looks the sheet up first (an earlier one may have landed). */
async function claimAppends(scope: WriteScope, ids: readonly string[], by: 1 | -1 = 1): Promise<void> {
  if (!ids.length) return;
  await db
    .update(orders)
    .set({ sheetAttempts: by > 0 ? sql`${orders.sheetAttempts} + 1` : sql`GREATEST(${orders.sheetAttempts} - 1, 0)` })
    .where(whereStore(orders, scope, inArray(orders.id, [...ids])));
}

/** A failed append: the orders back off (min(2^attempts, 360) min) and show `explain()`'s words in the drawer. */
async function failAppends(scope: WriteScope, ids: readonly string[], message: string, claimed: boolean): Promise<number> {
  if (!ids.length) return 0;
  const [res] = await db
    .update(orders)
    .set({
      sheetStatus: "failed",
      sheetError: message.slice(0, MESSAGE_MAX),
      sheetAttempts: claimed ? sql`${orders.sheetAttempts}` : sql`${orders.sheetAttempts} + 1`,
      updatedAt: new Date(),
    })
    .where(whereStore(orders, scope, inArray(orders.id, [...ids]), inArray(orders.sheetStatus, ["pending", "failed"])));
  return res.affectedRows;
}

/* ------------------------------------------------------------------ */
/* one run                                                             */
/* ------------------------------------------------------------------ */

interface RunState {
  result: SheetsPushResult;
  /** the error to record (a cause code) and the outcome of the status row */
  outcome: StatusOutcome | null;
}

type PullMode = SheetRunInput["pull"];

/** The run's pull: off (the switch, or the caller), due (the store's 290 s window is open, or forced), else on. */
async function pullModeOf(scope: StoreScope, cfg: SheetsConfig, opts: PushOptions): Promise<PullMode> {
  if (!cfg.pull || opts.pull === false) return "off";
  if (opts.forcePull) return "due";
  return (await pullDue(scope)) ? "due" : "on";
}

/**
 * The orders of a due pull's rows: the store's own synced orders among the ids read (`pullOrders`), and the run's own
 * orders with the "Note agent" dedupe key the planner compares (it prefers them to `pullOrders`).
 */
async function pullInputOf(scope: StoreScope, work: readonly PlanOrder[], read: SheetRead, spec: SheetReadSpec): Promise<{ orders: PlanOrder[]; pullOrders: PullOrder[]; seen: number }> {
  const rows = sheetRowsOf(read, sheetColumnsOf(read.header), spec.width);
  const noteIds = new Set(rows.filter((x) => (x.cells.agentNote ?? "").trim() !== "").map((x) => x.id));
  const workIds = new Set(work.map((o) => o.id));
  const [pullOrders, workNotes] = await Promise.all([
    selectPullOrders(scope, rows.map((x) => x.id).filter((id) => !workIds.has(id)), noteIds),
    sheetNoteHashes(scope, work.filter((o) => noteIds.has(o.id)).map((o) => o.id)),
  ]);
  const orders = work.map((o) => (noteIds.has(o.id) ? { ...o, lastSheetNoteHash: workNotes.get(o.id) ?? null } : o));
  return { orders, pullOrders, seen: rows.length };
}

/** The run inside the store's lock (see the header): plan, read, plan again, pull, write, mark. */
async function runLocked(scope: WriteScope, cfg: SheetsConfig, opts: PushOptions, st: RunState): Promise<void> {
  const r = st.result;
  const now = new Date();
  const force = !!opts.force;
  let pull = await pullModeOf(scope, cfg, opts);
  const [appends, updates] = opts.pullOnly
    ? [[], []]
    : await Promise.all([selectAppendWork(scope, { now, force, limit: APPEND_MAX + 1 }), selectUpdateWork(scope, UPDATE_MAX + 1)]);
  const work = [...appends, ...updates];
  if (!work.length && pull !== "due") {
    st.outcome = "ok";
    return;
  }
  const tab: Tab = { spreadsheetId: cfg.spreadsheetId, sheetTitle: cfg.sheetTitle };
  const [store, memberNames, agentLabels] = await Promise.all([getStoreById(scope.storeId), memberNamesOf(scope, work), pull === "off" ? undefined : agentLabelsOf(scope)]);
  const ctx: SheetRunCtx = { timeZone: store?.timezone || DEFAULT_TZ, locale: SHEET_LOCALE, memberNames, ...(agentLabels ? { agentLabels } : {}) };
  const readAt: ReadAt = new Map(work.map((o) => [o.id, o.updatedAt]));

  const deadline = opts.deadline ?? Infinity;
  const gopts: GapiOptions = {
    maxRetries: 0, // a 429 opens the breaker; a 5xx or a timeout waits for the next run (every retry would be a call)
    beforeCall: async () => {
      if (r.calls >= opts.maxCalls) throw new StopRun("budget");
      if (Date.now() >= deadline) throw new StopRun("deadline");
      if ((await sheetsBreakerUntil()) > Date.now()) throw new StopRun("breaker");
      if (!(await takeToken())) throw new StopRun("quota");
      r.calls++;
      // the call may not outlive the run's deadline (a slow sheet times out and backs off, the next store is served)
      gopts.timeoutMs = Math.max(MIN_CALL_TIMEOUT_MS, Math.min(CALL_TIMEOUT_MS, deadline - Date.now()));
    },
  };

  let base: SheetRunInput = { now, maxCalls: opts.maxCalls, orders: work, headers: headerCache.get(scope.storeId, headerKey(tab)) ?? null, pull, force, ctx };
  // the ids the read-and-append would send: failed with the run when the read itself fails
  const dueIds = work.filter((o) => appendDue(o, now, force)).slice(0, APPEND_MAX).map((o) => o.id);
  let claimed: string[] = [];
  let reading = true;

  try {
    let plan: SheetRunPlan = planSheetRun(base);
    if (pull === "due" && plan.read?.rows) {
      // the window is taken only by a run that really reads the rows; another run that took it first leaves this one "on"
      const took = await takePullToken(scope);
      if (!took && !opts.forcePull) {
        pull = "on";
        base = { ...base, pull };
        plan = planSheetRun(base);
        if (opts.pullOnly) {
          r.skipped = "not_due";
          return;
        }
      }
    }
    if (plan.read) {
      const spec = plan.read;
      const read = await readSheet(tab, spec, gopts);
      let input: SheetRunInput = { ...base, read };
      if (pull === "due" && spec.rows) {
        const p = await pullInputOf(scope, work, read, spec);
        input = { ...input, orders: p.orders, pullOrders: p.pullOrders };
        r.seen = p.seen;
      } else if (spec.rows) r.seen = read.rows.length;
      plan = planSheetRun(input);
      headerCache.set(scope.storeId, headerKey(tab), plan.columns);
    }
    reading = false;
    r.deferred = { ...plan.deferred };
    // the facts the read gave (rows already there, rows deleted) stand whatever the writes do
    await applyMarks(scope, plan.marks.filter((m) => m.outcome === "present" || m.outcome === "missing"), readAt);
    r.present = plan.marks.filter((m) => m.outcome === "present").length;
    r.missing = plan.missing.length;
    // the pull before the writes (OPE-§19.6): the cells a person changed were left out of the batchUpdate
    if (plan.pull.length) {
      const applied = await applyPullDecisions(scope, plan.pull, { agentLabels: ctx.agentLabels });
      r.pulled = applied.pulled;
      r.pullDeferred = applied.deferred;
    }

    if (plan.append) {
      claimed = plan.append.ids;
      await claimAppends(scope, claimed);
      await appendRows(tab, plan.append.rows, gopts);
      await applyMarks(scope, plan.marks.filter((m) => m.outcome === "appended"), readAt);
      r.appended = plan.append.ids.length;
      claimed = [];
    }
    const updated = plan.marks.filter((m) => m.outcome === "updated");
    if (updated.length) {
      if (plan.batchUpdate?.length) await updateRanges(tab, plan.batchUpdate, gopts);
      await applyMarks(scope, updated, readAt);
      r.updated = updated.length;
    }
    st.outcome = "ok";
  } catch (err) {
    if (err instanceof StopRun) {
      // the work stays exactly as it was for the next run: an append stopped before its call never left, so its claim
      // is given back (the next run needs no lookup read for it)
      if (claimed.length) await claimAppends(scope, claimed, -1);
      r.stopped = err.why;
      if (err.why === "quota" || err.why === "breaker") r.message = limitedMessage();
      st.outcome = r.calls > 0 ? "ok" : null;
      return;
    }
    headerCache.delete(scope.storeId, headerKey(tab)); // the layout may have changed: read it again next time
    if (err instanceof SheetsError && err.status === 429) {
      await openSheetsBreaker();
      r.breaker = true;
      r.ok = false;
      r.error = "breaker";
      r.message = limitedMessage();
      st.outcome = "breaker";
      return;
    }
    r.ok = false;
    r.error = err instanceof SheetsError ? classifySheetsError(err) : "unknown";
    r.message = explain(err, serviceAccountEmail()).slice(0, MESSAGE_MAX);
    // the appends of this run back off: those claimed for the failed append, or (the read failed) those it was for;
    // a failed batchUpdate leaves its orders dirty and the appends it did not carry as they were
    const ids = claimed.length ? claimed : reading ? dueIds : [];
    r.failed = await failAppends(scope, ids, r.message, claimed.length > 0);
    st.outcome = "failed";
    if (!(err instanceof SheetsError)) console.error(`[sheets.push] store ${scope.storeId}:`, errorSummary(err));
  }
}

/** The stores whose unbound setting already had its legacy binding attempt in this process (once per store). */
const legacyTried = scopedCache<true>({ name: "sheets-legacy-tried", maxEntries: 10_000, ttlMs: 60 * 60_000 });

/**
 * Is the setting's spreadsheet the store's? An unbound one gets one `ensureLegacyBinding` per store and process: a
 * free spreadsheet is bound at once (a store connected before 0005 never pauses for the job), one held by another
 * store stays "not connected" (the legacy pass decides who keeps it).
 */
async function boundOrLegacy(scope: WriteScope, cfg: SheetsConfig): Promise<boolean> {
  if (await sheetBound(scope, cfg.spreadsheetId)) return true;
  if (legacyTried.get(scope.storeId, cfg.spreadsheetId)) return false;
  legacyTried.set(scope.storeId, cfg.spreadsheetId, true);
  try {
    const outcome = await ensureLegacyBinding(scope);
    return outcome === "bound" || outcome === "already";
  } catch (err) {
    console.error(`[sheets.push] store ${scope.storeId} legacy binding:`, errorSummary(err));
    return false;
  }
}

/** Forget this process's legacy binding attempts (tests). */
export function forgetLegacyAttempts(): void {
  legacyTried.clear();
}

/** Preconditions, the lock, the run, then its status row and its history entry. */
async function pushOnce(scope: WriteScope, opts: PushOptions): Promise<SheetsPushResult> {
  const started = new Date();
  const trigger = opts.trigger ?? "after";
  const r = emptyResult(started, trigger);
  const skip = (why: PushSkip) => ((r.skipped = why), r);

  if (!isSheetsConfigured()) return skip("not_configured");
  const cfg = await getSheetsConfig(scope);
  if (!cfg) return skip("not_configured");
  if (!cfg.enabled) {
    await recordIntegrationStatus(scope, { kind: "sheets", outcome: "off" }).catch((err: unknown) => console.error("[sheets.push] status:", errorSummary(err)));
    return skip("disabled");
  }
  try {
    // false while the store is pending (§A.5.2) and under the sheets_sync_enabled kill switch (§H.8): orders keep pending
    await assertFeature(scope, "sheets");
  } catch (err) {
    if (!(err instanceof EntitlementError)) throw err;
    r.offReason = err.reason;
    return skip("feature_off");
  }
  if (!(await boundOrLegacy(scope, cfg))) return skip("unbound");
  if (opts.pullOnly && (!cfg.pull || opts.pull === false)) return skip("pull_off");
  if (opts.pullOnly && !opts.forcePull && !(await pullDue(scope))) return skip("not_due");
  if ((await sheetsBreakerUntil()) > Date.now()) {
    r.message = limitedMessage();
    return skip("breaker");
  }
  if (await rateLimitReached(saBucket(), SA_BUCKET.limit)) {
    r.message = limitedMessage();
    return skip("quota");
  }

  const st: RunState = { result: r, outcome: null };
  const locked = await withNamedLock(storeLock(scope.storeId, "sheets"), 1, () => runLocked(scope, cfg, opts, st));
  if (!locked.ran) return skip("locked");
  if (r.skipped) return r;
  r.ms = Date.now() - started.getTime();

  if (st.outcome) {
    try {
      const { backlog, oldestPendingAt } = await backlogOf(scope);
      await recordIntegrationStatus(scope, { kind: "sheets", outcome: st.outcome, code: r.error, backlog, oldestPendingAt });
    } catch (err) {
      console.error("[sheets.push] status:", errorSummary(err));
    }
  }
  if (r.calls > 0 || !r.ok) {
    await recordSheetsRun(scope, { at: r.at, ms: r.ms, appended: r.appended, updated: r.updated, pulled: r.pulled, calls: r.calls, ok: r.ok, error: r.error, trigger }).catch((err: unknown) =>
      console.error("[sheets.push] history:", errorSummary(err)),
    );
  }
  return r;
}

/** The run of each store in this process, queued one after the other (a second caller waits for the first). */
const runs = scopedCache<Promise<SheetsPushResult>>({ name: "sheets-push-running", maxEntries: 10_000, ttlMs: 5 * 60_000 });

/**
 * One push run for one store (OPE-§19.5; see the header). Never more than `opts.maxCalls` Google calls (the job
 * passes 3, the after() fast path 2). Runs of one store queue in this process and take the store's named lock
 * across processes, so two runs never append the same order. Resolves with what happened; Google failures are
 * part of the result, never thrown.
 */
export function pushStore(scope: WriteScope, opts: PushOptions): Promise<SheetsPushResult> {
  const before = runs.get(scope.storeId, "run");
  const run: Promise<SheetsPushResult> = (before ?? Promise.resolve(null))
    .catch(() => null)
    .then(() => pushOnce(scope, opts))
    .finally(() => {
      if (runs.get(scope.storeId, "run") === run) runs.delete(scope.storeId, "run");
    });
  runs.set(scope.storeId, "run", run);
  return run;
}

/* ------------------------------------------------------------------ */
/* the sheets.push slot (core §H.2 slot 1, OPE-§J)                     */
/* ------------------------------------------------------------------ */

/** What one `sheets.push` slot did (counts and codes only: `job_runs.summary`). */
export interface SheetsTickReport {
  visited: number;
  /** every store with work was served */
  done: boolean;
  appended: number;
  updated: number;
  /** orders the pull changed on the slot's reads */
  pulled: number;
  calls: number;
  /** stores whose run failed (a Google error, or a step that threw) */
  failedStores: number;
  /** why the slot stopped serving stores early: the breaker opened, the bucket emptied, the store cap */
  stoppedBy: "breaker" | "quota" | "stores" | null;
}

export interface SheetsTickOptions {
  budgetMs: number;
  /** epoch ms; default now + budgetMs */
  deadline?: number;
  /** the runner's `ctx.yield()`, awaited between stores */
  yieldLoop?: () => Promise<void>;
  /** after each store's run (tests) */
  afterStore?: (scope: WriteScope, result: SheetsPushResult) => Promise<void>;
  /** one store's run at most (default `STORE_SLICE_MS`; test:integrations-db shortens it) */
  storeSliceMs?: number;
}

/**
 * The `sheets.push` slot: the stores matching `pending_sheets`, the store with the oldest waiting order first
 * (forEachStore, ENGC-33), each with one run of ≤ 3 calls inside its own slice (`STORE_SLICE_MS`: a slow sheet times
 * out and backs off, so the store behind it is served in the same tick). A store whose step throws is skipped and
 * logged; once the breaker opens or the platform bucket is empty the remaining stores are passed over at no cost
 * (their work waits).
 */
export async function runSheetsPushTick(ctx: SystemCtx, opts: SheetsTickOptions): Promise<SheetsTickReport> {
  const report: SheetsTickReport = { visited: 0, done: false, appended: 0, updated: 0, pulled: 0, calls: 0, failedStores: 0, stoppedBy: null };
  if (!isSheetsConfigured()) return { ...report, done: true };
  const deadline = opts.deadline ?? Date.now() + opts.budgetMs;
  let served = 0;
  const run = await forEachStore(ctx, { job: ctx.job, states: ["active", "restricted"], budgetMs: Math.max(1, deadline - Date.now()), where: "pending_sheets" }, async (_scope, store) => {
    if (report.stoppedBy) return;
    if (served >= MAX_STORES_PER_TICK) {
      report.stoppedBy = "stores";
      return;
    }
    served++;
    // the frozen callback types its scope as a StoreScope; the marks need the job's own WriteScope
    const scope = systemScope(ctx, store.id);
    try {
      const r = await pushStore(scope, { maxCalls: 3, trigger: "tick", deadline: Math.min(deadline, Date.now() + (opts.storeSliceMs ?? STORE_SLICE_MS)) });
      report.appended += r.appended;
      report.updated += r.updated;
      report.pulled += r.pulled;
      report.calls += r.calls;
      if (!r.ok) report.failedStores++;
      if (r.breaker || r.skipped === "breaker" || r.stopped === "breaker") report.stoppedBy = "breaker";
      else if (r.skipped === "quota" || r.stopped === "quota") report.stoppedBy = "quota";
      if (opts.afterStore) await opts.afterStore(scope, r);
    } catch (err) {
      report.failedStores++;
      throw err; // forEachStore logs the code and skips the store for the rest of the call
    } finally {
      if (opts.yieldLoop) await opts.yieldLoop();
    }
  });
  report.visited = run.visited;
  report.done = run.done && report.stoppedBy === null;
  return report;
}

/* ------------------------------------------------------------------ */
/* the sheets.pull slot (core §H.2 slot 2, OPE-§J)                     */
/* ------------------------------------------------------------------ */

/** What one `sheets.pull` slot did (counts and codes only). */
export interface SheetsPullTickReport {
  visited: number;
  /** stores whose rows were read */
  read: number;
  pulled: number;
  calls: number;
  /** every store was visited */
  done: boolean;
  failedStores: number;
  stoppedBy: "breaker" | "quota" | "stores" | null;
}

/**
 * The `sheets.pull` slot (12 s): the active stores round-robin (cursor `sheets.pull`), each with a connected, enabled,
 * bound sheet, "Bring status changes back" on and its 290 s window open gets one read-only run (1 call: the read and
 * the pull, ./pull.ts). A store slot 1 already pulled this tick has its window closed and costs one cached settings
 * read and one bucket read. Stops on the breaker or an empty platform bucket like the push slot.
 */
export async function runSheetsPullTick(ctx: SystemCtx, opts: SheetsTickOptions): Promise<SheetsPullTickReport> {
  const report: SheetsPullTickReport = { visited: 0, read: 0, pulled: 0, calls: 0, done: false, failedStores: 0, stoppedBy: null };
  if (!isSheetsConfigured()) return { ...report, done: true };
  const deadline = opts.deadline ?? Date.now() + opts.budgetMs;
  const run = await forEachStore(ctx, { job: PULL_JOB, states: ["active", "restricted"], budgetMs: Math.max(1, deadline - Date.now()) }, async (_scope, store) => {
    if (report.stoppedBy) return;
    if (report.read >= MAX_STORES_PER_TICK) {
      report.stoppedBy = "stores";
      return;
    }
    const scope = systemScope(ctx, store.id);
    try {
      // the cheap checks first: most stores have no sheet, or slot 1's read pulled them a moment ago
      const s = await getStoreSetting(scope, "sheets");
      if (!s.enabled || !s.spreadsheetId || s.pull === false) return;
      if (!(await pullDue(scope))) return;
      const r = await pushStore(scope, { maxCalls: 1, pullOnly: true, trigger: "pull", deadline: Math.min(deadline, Date.now() + (opts.storeSliceMs ?? STORE_SLICE_MS)) });
      if (r.calls > 0) report.read++;
      report.pulled += r.pulled;
      report.calls += r.calls;
      if (!r.ok) report.failedStores++;
      if (r.breaker || r.skipped === "breaker" || r.stopped === "breaker") report.stoppedBy = "breaker";
      else if (r.skipped === "quota" || r.stopped === "quota") report.stoppedBy = "quota";
      if (opts.afterStore) await opts.afterStore(scope, r);
    } catch (err) {
      report.failedStores++;
      throw err; // forEachStore logs the code and skips the store for the rest of the call
    } finally {
      if (opts.yieldLoop) await opts.yieldLoop();
    }
  });
  report.visited = run.visited;
  report.done = run.done && report.stoppedBy === null;
  return report;
}

/* ------------------------------------------------------------------ */
/* scheduleSheetPush (the int.sheets hook, the status edits)           */
/* ------------------------------------------------------------------ */

/** The push scheduled for each store (one per debounce window). */
const scheduled = scopedCache<Promise<void>>({ name: "sheets-push-scheduled", maxEntries: 10_000, ttlMs: 5 * 60_000 });

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * A change of the store's orders is waiting for its sheet (frozen at P0, OPE-§19.5, OPE Q.8). Debounced 2 s per store
 * (every change inside the window shares one push), then `after(() => pushStore(scope, { maxCalls: 2 }))`; inside a
 * job (a system scope) or outside a request (a script) the same push runs inline, detached. Never throws, never waits for Google (OD2): a status
 * write returns at once and the sheet follows. The caller never schedules a test order's push (`int.sheets`, D54).
 */
export function scheduleSheetPush(scope: WriteScope): void {
  if (scheduled.get(scope.storeId, "next")) return;
  let start!: () => void;
  const gate = new Promise<void>((resolve) => (start = resolve));
  const task = gate.then(async () => {
    await sleep(PUSH_DEBOUNCE_MS);
    scheduled.delete(scope.storeId, "next"); // a change from now on schedules the next push
    try {
      await pushStore(scope, { maxCalls: 2, trigger: "after" });
    } catch (err) {
      console.error(`[sheets.push] scheduled push of store ${scope.storeId}:`, errorSummary(err));
    }
  });
  scheduled.set(scope.storeId, "next", task);
  // a job's change (a system scope) runs inline, detached: the job's tick is not a response to wait for
  if (scope.kind === "system") return start();
  try {
    after(() => {
      start();
      return task;
    });
  } catch {
    // outside a request scope (a script): inline
    start();
  }
}

/** Waits until the store has no scheduled or running push in this process (tests, scripts). */
export async function settleSheetPushes(storeId: string): Promise<void> {
  for (let i = 0; i < 4; i++) {
    const pending = [scheduled.get(storeId, "next"), runs.get(storeId, "run")].filter((p): p is Promise<void> | Promise<SheetsPushResult> => !!p);
    if (!pending.length) return;
    await Promise.all(pending.map((p) => (p as Promise<unknown>).catch(() => undefined)));
  }
}
