import "server-only";
/**
 * Orders → Google Sheets sync queue of ONE store (DB first, sheet second).
 *
 * syncPendingOrders(scope): the store's pending orders (+ failed ones whose backoff elapsed) are claimed
 * (attempts + 1), then written in ONE append request to the store's own sheet. Whenever a batch may already
 * be partly in the sheet — a retry after a timeout, a requeue, or an order whose upsell was accepted after it
 * was written — column A is read first: ids already present are not appended again (upsell orders get their
 * Produit / Variante / Total cells, and the optional SKU / Articles cells, updated instead). Runs are
 * serialized per store, in-process (one coalescing state per store) and across processes (the store's named
 * lock `storeLock(storeId, "sheets")`, docs/STORE-SAAS.md §E.7).
 *
 * Row content lives in ./row.ts (pure, docs/OFFERS.md §G.4): the 13 contract columns A–M never move;
 * optional columns "SKU", "Articles", "Livraison", "Prix pack" are filled only when the owner added
 * those headers after column M (read once per sheet per 10 min, and again after a failed write). The
 * append sends `null` for every other cell after M, so columns the call center fills are untouched. The
 * Date column is in the store's time zone (SHT-08).
 *
 * pullStatuses(scope): statuses set by call-center agents in the store's sheet flow back to the store's
 * orders that are fully synced. Only the store's own orders are ever touched: an order id of another store
 * typed into the sheet changes nothing (SHT-05). At most once per 290 s per store (`s:<storeId>:sheets:pull`).
 *
 * Per store (SHT-01 … SHT-08): every query carries the store predicate, test orders never reach a sheet, and
 * the cron visits the stores with work one by one (syncStores, SHT-11).
 */
import { and, eq, inArray, ne, or, sql } from "drizzle-orm";
import { LEGACY_STORE_ID } from "@/lib/admin-data/legacy-store";
import { affected } from "@/lib/admin-data/store-audit";
import { db } from "@/lib/db/client";
import { storeLock, withNamedLock } from "@/lib/db/locks";
import { orders } from "@/lib/db/schema";
import { forEachStore, systemCtx, systemScope } from "@/lib/jobs/scope";
import type { OrderStatus } from "@/lib/orders/contract";
import { rateLimit } from "@/lib/security/rate-limit";
import { getStoreById } from "@/lib/tenancy/public";
import { whereStore } from "@/lib/tenancy/sql";
import type { StoreScope, SystemCtx, WriteScope } from "@/lib/tenancy/types";
import { gapi, isSheetsConfigured, serviceAccountEmail, type GapiOptions } from "./client";
import { activeSheet, getSheetsConfig, type SheetsConfig } from "./config";
import { a1, colLetter } from "./format";
import { COL, explain, readOrderRows, readStatuses, statusLabel, updateCells, type Cell } from "./orders-sheet";
import {
  CONTRACT_WIDTH,
  extraColumnsOf,
  extraValues,
  orderToRow as rowOf,
  productText,
  sourceText,
  variantCell,
  wideRow,
  type ExtraColumn,
  type ExtraColumns,
} from "./row";

export { affected };

type OrderRow = typeof orders.$inferSelect;

/** The Date column's zone when a store has none (Morocco): stores carry their own (`stores.timezone`). */
const DEFAULT_TZ = "Africa/Casablanca";

/** The store's time zone for the Date column (SHT-08). */
async function storeTimeZone(scope: StoreScope): Promise<string> {
  return (await getStoreById(scope.storeId))?.timezone || DEFAULT_TZ;
}

/* ------------------------------------------------------------------ */
/* row content (pure: ./row.ts)                                        */
/* ------------------------------------------------------------------ */

export { productText, sourceText };

/** "Variante" cell: the warehouse order text (§G.4, = order.php cod_units_text). */
export function variantText(o: Pick<OrderRow, "id" | "items">): string {
  return variantCell(o);
}

/** One sheet row: the 13 contract columns (A–M), the Date in `timeZone` (the store's). */
export function orderToRow(o: OrderRow, timeZone: string = DEFAULT_TZ): Cell[] {
  return rowOf(o, statusLabel, timeZone);
}

/* ------------------------------------------------------------------ */
/* optional columns (by header)                                        */
/* ------------------------------------------------------------------ */

type Tab = Pick<SheetsConfig, "spreadsheetId" | "sheetTitle">;

const HEADER_TTL_MS = 10 * 60_000;
/** N1:AZ1: up to 39 columns after the contract */
const EXTRA_RANGE = `${colLetter(CONTRACT_WIDTH)}1:AZ1`;

// per sheet (a spreadsheet belongs to one store), unchanged by tenancy (§E.6)
declare global {
  var __codSheetsHeaders: Map<string, { at: number; cols: ExtraColumns }> | undefined;
}
const headerCache = () => (globalThis.__codSheetsHeaders ??= new Map());
const headerKey = (tab: Tab) => `${tab.spreadsheetId}|${tab.sheetTitle}`;
const tabPath = (tab: Tab, range: string) => `/${encodeURIComponent(tab.spreadsheetId)}/values/${encodeURIComponent(a1(tab.sheetTitle, range))}`;

/** The optional columns the tab has ("SKU", "Articles", "Livraison", "Prix pack" after column M). */
async function extraColumns(tab: Tab, opts: GapiOptions): Promise<ExtraColumns> {
  const cache = headerCache();
  const hit = cache.get(headerKey(tab));
  if (hit && Date.now() - hit.at < HEADER_TTL_MS) return hit.cols;
  const r = await gapi<{ values?: unknown[][] }>(tabPath(tab, EXTRA_RANGE), {}, opts);
  const cols = extraColumnsOf(r.values?.[0] ?? []);
  cache.set(headerKey(tab), { at: Date.now(), cols });
  while (cache.size > 200) cache.delete(cache.keys().next().value!);
  return cols;
}

/** A failed write: the layout may have changed, read the headers again next time. */
const forgetHeaders = (tab: Tab) => void headerCache().delete(headerKey(tab));

/** Append rows in ONE request (RAW: stored literally). `null` cells are skipped by the API. */
async function appendWide(tab: Tab, rows: (Cell | null)[][], opts: GapiOptions): Promise<void> {
  if (!rows.length) return;
  await gapi(
    `${tabPath(tab, "A1")}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    { method: "POST", body: JSON.stringify({ majorDimension: "ROWS", values: rows }) },
    opts,
  );
}

/** Cells rewritten when an upsell is accepted after the row was written. */
const UPSELL_EXTRAS: readonly ExtraColumn[] = ["sku", "articles"];

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

const empty = (status: SyncResult["status"], error?: string): SyncResult => ({
  status,
  appended: 0,
  updated: 0,
  skipped: 0,
  failed: 0,
  ...(error ? { error } : {}),
});

export interface SyncOptions {
  /** max orders per run (default 50) */
  limit?: number;
  /** ignore the retry backoff of failed orders ("Sync now" in the admin) */
  force?: boolean;
  /** Google retries per request (lower in request-adjacent paths) */
  maxRetries?: number;
}

async function syncOnce(scope: WriteScope, sheet: SheetsConfig, timeZone: string, opts: SyncOptions): Promise<SyncResult & { selected: number }> {
  const limit = opts.limit ?? 50;
  const now = new Date();
  const eligible = opts.force
    ? inArray(orders.sheetStatus, ["pending", "failed"])
    : or(
        eq(orders.sheetStatus, "pending"),
        and(
          eq(orders.sheetStatus, "failed"),
          sql`${orders.updatedAt} <= DATE_SUB(${now}, INTERVAL LEAST(POW(2, ${orders.sheetAttempts}), 360) MINUTE)`,
        ),
      );
  // a test order never reaches a sheet, even requeued (the public path stores it as "disabled" already, D54)
  const batch = await db
    .select()
    .from(orders)
    .where(whereStore(orders, scope, eligible, eq(orders.isTest, false)))
    .orderBy(orders.createdAt)
    .limit(limit);
  if (!batch.length) return { ...empty("ok"), selected: 0 };

  const ids = batch.map((o) => o.id);
  // claim: any later retry of these rows will look the sheet up before appending
  await db
    .update(orders)
    .set({ sheetAttempts: sql`${orders.sheetAttempts} + 1` })
    .where(whereStore(orders, scope, inArray(orders.id, ids)));

  const gopts: GapiOptions = { maxRetries: opts.maxRetries ?? 4 };
  const result = { ...empty("ok"), selected: batch.length };
  try {
    const needLookup = batch.some((o) => o.sheetAttempts > 0 || !!o.items.upsell);
    const existing = needLookup ? await readOrderRows(sheet.spreadsheetId, sheet.sheetTitle, gopts) : new Map<string, number>();
    const toAppend = batch.filter((o) => !existing.has(o.id));
    const extras = await extraColumns(sheet, gopts);
    const updates: { range: string; values: Cell[][] }[] = [];
    for (const o of batch) {
      const rowNo = existing.get(o.id);
      if (!rowNo) continue;
      if (o.items.upsell) {
        // the upsell changes what the warehouse packs: Produit, Variante, Total (+ SKU / Articles)
        const row = orderToRow(o, timeZone);
        for (const c of [COL.product, COL.variant, COL.total]) updates.push({ range: `${colLetter(c)}${rowNo}`, values: [[row[c]!]] });
        const values = extraValues(o);
        for (const k of UPSELL_EXTRAS) {
          const c = extras[k];
          if (c !== undefined) updates.push({ range: `${colLetter(c)}${rowNo}`, values: [[values[k]]] });
        }
        result.updated++;
      } else {
        result.skipped++;
      }
    }
    await appendWide(sheet, toAppend.map((o) => wideRow(orderToRow(o, timeZone), extras, extraValues(o))), gopts);
    result.appended = toAppend.length;
    await updateCells(sheet.spreadsheetId, sheet.sheetTitle, updates, gopts);

    // mark synced — unless the order changed meanwhile (e.g. upsell accepted): it stays pending
    const unchanged = batch.map((o) => and(eq(orders.id, o.id), eq(orders.updatedAt, o.updatedAt))!);
    await db
      .update(orders)
      .set({ sheetStatus: "synced", sheetError: null })
      .where(whereStore(orders, scope, inArray(orders.id, ids), or(...unchanged)));
    return result;
  } catch (err) {
    forgetHeaders(sheet);
    const message = explain(err, serviceAccountEmail()).slice(0, 500);
    await db
      .update(orders)
      .set({ sheetStatus: "failed", sheetError: message, updatedAt: new Date() })
      .where(whereStore(orders, scope, inArray(orders.id, ids), ne(orders.sheetStatus, "synced")));
    return { ...empty("error", message), failed: batch.length, selected: batch.length };
  }
}

interface SyncState {
  running: Promise<SyncResult> | null;
  rerun: boolean;
  force: boolean;
}

// one coalescing state per store (SHT-04); process-wide (route bundles may each load their own copy of this module)
declare global {
  var __codSheetsSync: Map<string, SyncState> | undefined;
}
function syncState(storeId: string): SyncState {
  const states = (globalThis.__codSheetsSync ??= new Map());
  let st = states.get(storeId);
  if (!st) states.set(storeId, (st = { running: null, rerun: false, force: false }));
  return st;
}
/** passes per call: a backlog (e.g. orders queued before the sheet was connected) drains in one go */
const MAX_PASSES = 5;

/**
 * Push the store's pending orders to its sheet. Safe to call often (after each order, from the cron):
 * concurrent calls for the same store coalesce into the running pass, which then runs again to pick up new
 * orders (with the retry backoff ignored when a coalesced caller asked for `force`).
 */
export async function syncPendingOrders(scope: WriteScope, opts?: SyncOptions): Promise<SyncResult>;
/** @deprecated today's store-less after-order push (store #1 only); T3 passes the order's scope (CCR r1.0-t4-2) */
export async function syncPendingOrders(opts?: SyncOptions): Promise<SyncResult>;
export async function syncPendingOrders(a?: WriteScope | SyncOptions, b?: SyncOptions): Promise<SyncResult> {
  if (!a || !("storeId" in a)) {
    // the legacy single-tenant push is store #1's (§D.8 S1): never another store's orders into that sheet
    return syncPendingOrders(systemScope(systemCtx("sheets.push_legacy"), LEGACY_STORE_ID), a as SyncOptions | undefined);
  }
  const scope = a;
  const opts = b ?? {};
  const st = syncState(scope.storeId);
  if (st.running) {
    st.rerun = true;
    if (opts.force) st.force = true;
    return st.running;
  }
  const limit = Math.min(200, Math.max(1, opts.limit ?? 50));
  st.running = (async () => {
    try {
      if (!isSheetsConfigured()) return empty("not_configured");
      const sheet = await activeSheet(scope);
      if (!sheet) return empty("not_configured");
      const timeZone = await storeTimeZone(scope);
      const total = empty("ok");
      for (let pass = 0; pass < MAX_PASSES; pass++) {
        const force = !!opts.force || st.force;
        st.rerun = false;
        st.force = false;
        const r = await withNamedLock(storeLock(scope.storeId, "sheets"), 1, () => syncOnce(scope, sheet, timeZone, { ...opts, force, limit }));
        if (!r.ran) return pass === 0 ? empty("locked") : total;
        total.appended += r.value.appended;
        total.updated += r.value.updated;
        total.skipped += r.value.skipped;
        total.failed += r.value.failed;
        if (r.value.status === "error") return { ...total, status: "error", error: r.value.error };
        if (!st.rerun && r.value.selected < limit) break;
      }
      return total;
    } finally {
      st.running = null;
      st.rerun = false;
      st.force = false;
    }
  })();
  return st.running;
}

/* ------------------------------------------------------------------ */
/* pull                                                                */
/* ------------------------------------------------------------------ */

export interface PullResult {
  status: "ok" | "not_configured" | "throttled" | "error";
  /** rows read from the sheet */
  seen: number;
  /** the store's orders whose status changed */
  updated: number;
  error?: string;
}

const ORDER_ID_RE = /^[A-Z0-9]{2,8}-[A-Z0-9]{4,12}$/;

/** Apply statuses chosen by agents in the store's sheet (at most every 5 min per store unless forced). */
export async function pullStatuses(scope: WriteScope, opts: { force?: boolean } = {}): Promise<PullResult> {
  if (!isSheetsConfigured()) return { status: "not_configured", seen: 0, updated: 0 };
  const sheet = await activeSheet(scope);
  if (!sheet) return { status: "not_configured", seen: 0, updated: 0 };
  // "Bring status changes back from the sheet" is off: the sheet is write-only for this store
  if (!sheet.pull) return { status: "ok", seen: 0, updated: 0 };
  if (!opts.force) {
    const gate = await rateLimit(`s:${scope.storeId}:sheets:pull`, 1, 290);
    if (!gate.ok) return { status: "throttled", seen: 0, updated: 0 };
  }
  let statuses: Map<string, OrderStatus>;
  try {
    statuses = await readStatuses(sheet.spreadsheetId, sheet.sheetTitle, { maxRetries: 2 });
  } catch (err) {
    return { status: "error", seen: 0, updated: 0, error: explain(err, serviceAccountEmail()) };
  }
  const byStatus = new Map<OrderStatus, string[]>();
  for (const [id, st] of statuses) {
    if (!ORDER_ID_RE.test(id)) continue;
    const list = byStatus.get(st) ?? [];
    list.push(id);
    byStatus.set(st, list);
  }
  let updated = 0;
  const now = new Date();
  for (const [status, ids] of byStatus) {
    for (let i = 0; i < ids.length; i += 500) {
      // only this store's orders: ids are customer-visible, so the sheet may name another store's order (SHT-05)
      const res = await db
        .update(orders)
        .set({ status, updatedAt: now })
        .where(whereStore(orders, scope, inArray(orders.id, ids.slice(i, i + 500)), eq(orders.sheetStatus, "synced"), ne(orders.status, status), eq(orders.isTest, false)));
      updated += affected(res);
    }
  }
  return { status: "ok", seen: statuses.size, updated };
}

/* ------------------------------------------------------------------ */
/* single-order status push (admin edits)                              */
/* ------------------------------------------------------------------ */

export type PushStatusResult = "updated" | "not_found" | "skipped";

/**
 * Write one of the store's orders' status label into its row (column C) of the store's sheet. "skipped" when
 * no sheet is connected, "not_found" when the row is not in the sheet (deleted by an agent, or not yet synced).
 * A paused sheet is written too: pausing stops appending orders and pulling statuses, but a status chosen in
 * the admin must reach a row that already exists, or resuming would pull the old label back. The caller has
 * already changed the order inside the store (the id is the store's). Throws SheetsError on Google failures
 * (callers surface `explain()`).
 */
export async function pushOrderStatus(scope: StoreScope, orderId: string, status: OrderStatus): Promise<PushStatusResult> {
  if (!isSheetsConfigured()) return "skipped";
  const sheet = await getSheetsConfig(scope);
  if (!sheet) return "skipped";
  const rows = await readOrderRows(sheet.spreadsheetId, sheet.sheetTitle, { maxRetries: 2 });
  const rowNo = rows.get(orderId);
  if (!rowNo) return "not_found";
  await updateCells(
    sheet.spreadsheetId,
    sheet.sheetTitle,
    [{ range: `${colLetter(COL.status)}${rowNo}`, values: [[statusLabel(status)]] }],
    { maxRetries: 2 },
  );
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
 * The cron step: the stores with Sheets work (`pending_sheets`), one at a time within `budgetMs`, each with its
 * own push and its due pull; one store's failure never stops the others (forEachStore isolates them).
 */
export async function syncStores(ctx: SystemCtx, opts: { budgetMs: number }): Promise<StoresSyncReport> {
  const report: StoresSyncReport = { visited: 0, done: false, appended: 0, pulled: 0, failedStores: 0 };
  if (!isSheetsConfigured()) return { ...report, done: true };
  const run = await forEachStore(ctx, { job: ctx.job, states: ["active", "restricted"], budgetMs: opts.budgetMs, where: "pending_sheets" }, async (_scope, store) => {
    // the frozen callback types its scope as a StoreScope; the writes need the job's own WriteScope
    const scope = systemScope(ctx, store.id);
    const push = await syncPendingOrders(scope, { limit: 100 });
    report.appended += push.appended;
    if (push.status === "error") report.failedStores++;
    if (push.status !== "not_configured") {
      const pull = await pullStatuses(scope);
      report.pulled += pull.updated;
      if (pull.status === "error") report.failedStores++;
    }
  });
  return { ...report, visited: run.visited, done: run.done };
}
