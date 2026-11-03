import "server-only";
/**
 * The R1.0 Sheets API of one store, kept as a compatibility facade over the R1 push (P5 INTEGRATIONS; operations.md
 * OPE-§19.5, OD2; ./push.ts). Read-only callers keep their imports until their owners rewrite them: the public order
 * and upsell routes (src/lib/orders/http.ts), the cron route (until P8's runTick), the orders admin and its actions
 * (until P4), the Sheets routes and screens (until P5's own later steps).
 *
 *   syncPendingOrders(scope, opts)   → one pushStore run ("Sync now" / "Send again": 3 calls, backoff skipped; else 2)
 *   pushOrderStatus(scope, id, s)    → mark the status cell dirty + scheduleSheetPush (a status write never waits for Google)
 *   syncStores(ctx, { budgetMs })    → the sheets.push slot (each run pulls on its read when due), then the sheets.pull slot
 *   pullStatuses(scope, opts)        → one read-only run: the R1 pull (./pull.ts) on one read, 1 call
 *   selectSyncBatch(scope, opts)     → the push's append work (test:public-api, SHT-02)
 *
 * R1 limits apply to every path: ≤ 100 appends and ≤ 200 updates per run, the `p:sheets:sa` bucket before every Google
 * call, the 90 s breaker after a 429, the binding check (an unbound sheet is "not connected"), never a test order.
 */
import { asc, eq, sql } from "drizzle-orm";
import { affected } from "@/lib/admin-data/store-audit";
import { db } from "@/lib/db/client";
import { orders } from "@/lib/db/schema";
import type { OrderStatus } from "@/lib/orders/contract";
import { whereStore } from "@/lib/tenancy/sql";
import type { StoreScope, SystemCtx, WriteScope } from "@/lib/tenancy/types";
import { isSheetsConfigured } from "./client";
import { getSheetsConfig } from "./config";
import { statusLabel, type Cell } from "./orders-sheet";
import { appendPredicate, pushStore, runSheetsPullTick, runSheetsPushTick, scheduleSheetPush, type SheetsPushResult } from "./push";
import { orderToRow as rowOf, productText, sourceText, variantCell, type SheetOrder } from "./row";

export { affected };

/** The Date column's zone when a store has none (Morocco): stores carry their own (`stores.timezone`). */
const DEFAULT_TZ = "Africa/Casablanca";

/* ------------------------------------------------------------------ */
/* row content (pure: ./row.ts)                                        */
/* ------------------------------------------------------------------ */

export { productText, sourceText };

/** "Variante" cell: the warehouse order text (§G.4, = order.php cod_units_text). */
export function variantText(o: Pick<SheetOrder, "id" | "items">): string {
  return variantCell(o);
}

/** One sheet row: the 13 contract columns (A–M), the Date in `timeZone` (the store's). */
export function orderToRow(o: SheetOrder, timeZone: string = DEFAULT_TZ): Cell[] {
  return rowOf(o, statusLabel, timeZone);
}

/* ------------------------------------------------------------------ */
/* push                                                                */
/* ------------------------------------------------------------------ */

export interface SyncResult {
  status: "ok" | "not_configured" | "locked" | "error";
  appended: number;
  updated: number;
  /** already present in the sheet (nothing written) */
  skipped: number;
  failed: number;
  error?: string;
}

export interface SyncOptions {
  /** R1.0's cap per pass; the R1 run takes at most 100 appends (OPE-§L), so a larger value changes nothing */
  limit?: number;
  /** ignore the retry backoff of failed orders ("Sync now", "Send again"): a manual run of up to 3 calls */
  force?: boolean;
  /** R1.0's Google retries; the R1 run never retries in-call (the breaker and the backoff do), so it is ignored */
  maxRetries?: number;
}

/** The R1.0 answer of a push run (status words, counts, the French explanation of a failure). */
export function syncResultOf(r: SheetsPushResult): SyncResult {
  const counts = { appended: r.appended, updated: r.updated, skipped: r.present, failed: r.failed };
  switch (r.skipped) {
    case "not_configured":
    case "unbound":
    case "disabled":
    case "feature_off":
      return { status: "not_configured", ...counts };
    case "locked":
      return { status: "locked", ...counts };
    case "pull_off":
    case "not_due":
      return { status: "ok", ...counts };
    case "breaker":
    case "quota":
      return { status: "error", ...counts, error: r.message ?? undefined };
    default:
      if (!r.ok || r.stopped === "breaker" || r.stopped === "quota") return { status: "error", ...counts, ...(r.message ? { error: r.message } : {}) };
      return { status: "ok", ...counts };
  }
}

type OrderRow = typeof orders.$inferSelect;

/**
 * The orders a push run of the store would append (the R1.0 shape: whole rows): its own, never a test order, pending,
 * or failed with their backoff elapsed (`force` ignores it); oldest first, at most `limit` (default 50, ≤ 200). The
 * push's own predicate (`appendPredicate`); exported for test:public-api and test:tenancy (SHT-02).
 */
export function selectSyncBatch(scope: StoreScope, opts: SyncOptions = {}): Promise<OrderRow[]> {
  return db
    .select()
    .from(orders)
    .where(whereStore(orders, scope, eq(orders.isTest, false), appendPredicate(new Date(), !!opts.force)))
    .orderBy(asc(orders.createdAt), asc(orders.id))
    .limit(Math.max(1, Math.min(200, opts.limit ?? 50)));
}

/**
 * Push the store's waiting orders to its sheet now (one run). Safe to call often: runs of one store queue in this
 * process and hold the store's lock across processes; a run already holding it elsewhere answers "locked".
 */
export async function syncPendingOrders(scope: WriteScope, opts: SyncOptions = {}): Promise<SyncResult> {
  const r = await pushStore(scope, opts.force ? { maxCalls: 3, force: true, trigger: "manual" } : { maxCalls: 2, trigger: "after" });
  return syncResultOf(r);
}

/* ------------------------------------------------------------------ */
/* pull (one read-only run of the R1 pull, ./pull.ts)                  */
/* ------------------------------------------------------------------ */

export interface PullResult {
  status: "ok" | "not_configured" | "throttled" | "error";
  /** rows read from the sheet */
  seen: number;
  /** the store's orders the pull changed */
  updated: number;
  error?: string;
}

/**
 * Apply what the store's agents changed in its sheet (at most every 290 s unless forced): one read-only run of the R1
 * pull (OPE-§19.6), with every R1 guard (the binding, the breaker, a `p:sheets:sa` token, never another store's order
 * or a test order). "Bring status changes back" off → nothing read, `ok`.
 */
export async function pullStatuses(scope: WriteScope, opts: { force?: boolean } = {}): Promise<PullResult> {
  const r = await pushStore(scope, { maxCalls: 1, pullOnly: true, forcePull: !!opts.force, trigger: opts.force ? "manual" : "pull" });
  switch (r.skipped) {
    case "not_configured":
    case "unbound":
    case "disabled":
    case "feature_off":
      return { status: "not_configured", seen: 0, updated: 0 };
    case "pull_off":
      return { status: "ok", seen: 0, updated: 0 };
    case "not_due":
    case "breaker":
    case "quota":
    case "locked":
      return { status: "throttled", seen: 0, updated: 0 };
  }
  if (!r.ok) return { status: "error", seen: r.seen, updated: r.pulled, ...(r.message ? { error: r.message } : {}) };
  if (r.stopped === "breaker" || r.stopped === "quota") return { status: "throttled", seen: 0, updated: 0 };
  return { status: "ok", seen: r.seen, updated: r.pulled };
}

/* ------------------------------------------------------------------ */
/* single-order status push (admin edits)                              */
/* ------------------------------------------------------------------ */

export type PushStatusResult = "updated" | "not_found" | "skipped";

/**
 * A status chosen in the admin is on its way to the order's row (OD2: the write never waits for Google). A synced
 * order of the store gets its status bit (`sheet_dirty |= 1`, `rev` bumped so a run already reading it keeps the bit)
 * and the store's push is scheduled: "updated". "not_found": the order is not synced yet (its append carries the new
 * status, or the push finds it in the sheet and rewrites the cell) or is not the store's. "skipped": no sheet
 * connected. A paused sheet keeps the bit and is written on resume. `status` is written by the caller.
 */
export async function pushOrderStatus(scope: WriteScope, orderId: string, status: OrderStatus): Promise<PushStatusResult> {
  void status;
  if (!isSheetsConfigured()) return "skipped";
  const sheet = await getSheetsConfig(scope);
  if (!sheet) return "skipped";
  const res = await db
    .update(orders)
    .set({ sheetDirty: sql`${orders.sheetDirty} | 1`, rev: sql`${orders.rev} + 1` })
    .where(whereStore(orders, scope, eq(orders.id, orderId), eq(orders.sheetStatus, "synced"), eq(orders.isTest, false)));
  if (affected(res) !== 1) return "not_found";
  scheduleSheetPush(scope);
  return "updated";
}

/** The store's sheet sync health for dashboards: counts per sheet status. */
export async function syncHealth(scope: StoreScope): Promise<Record<"pending" | "synced" | "failed" | "disabled", number>> {
  const rows = await db
    .select({ s: orders.sheetStatus, n: sql<number>`COUNT(*)` })
    .from(orders)
    .where(whereStore(orders, scope))
    .groupBy(orders.sheetStatus);
  const out = { pending: 0, synced: 0, failed: 0, disabled: 0 };
  for (const r of rows) out[r.s] = Number(r.n);
  return out;
}

/* ------------------------------------------------------------------ */
/* cron: every store with work (SHT-11)                                */
/* ------------------------------------------------------------------ */

export interface StoresSyncReport {
  visited: number;
  done: boolean;
  appended: number;
  pulled: number;
  failedStores: number;
}

/**
 * The R1.0 cron step, until P8's runTick runs the jobs (src/lib/jobs/tracks/integrations.ts): the `sheets.push` slot
 * (oldest waiting order first; each run pulls on its own read when the store's window is open), then the `sheets.pull`
 * slot for the stores slot 1 did not read, both inside `budgetMs`.
 */
export async function syncStores(ctx: SystemCtx, opts: { budgetMs: number }): Promise<StoresSyncReport> {
  const deadline = Date.now() + opts.budgetMs;
  const push = await runSheetsPushTick(ctx, { budgetMs: opts.budgetMs, deadline });
  const left = deadline - Date.now();
  const pull = left > 0 && push.stoppedBy !== "breaker" && push.stoppedBy !== "quota" ? await runSheetsPullTick(ctx, { budgetMs: left, deadline }) : null;
  return {
    visited: push.visited + (pull?.visited ?? 0),
    done: push.done && (pull?.done ?? false),
    appended: push.appended,
    pulled: push.pulled + (pull?.pulled ?? 0),
    failedStores: push.failedStores + (pull?.failedStores ?? 0),
  };
}
