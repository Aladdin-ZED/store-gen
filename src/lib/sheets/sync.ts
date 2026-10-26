import "server-only";
/**
 * Orders → Google Sheets sync queue (DB first, sheet second).
 *
 * syncPendingOrders(): pending orders (+ failed ones whose backoff elapsed) are claimed (attempts + 1),
 * then written in ONE append request. Whenever a batch may already be partly in the sheet — a retry
 * after a timeout, a requeue, or an order whose upsell was accepted after it was written — column A is
 * read first: ids already present are not appended again (upsell orders get their Produit / Variante /
 * Total cells, and the optional SKU / Articles cells, updated instead). Runs are serialized in-process
 * and across processes (MySQL GET_LOCK).
 *
 * Row content lives in ./row.ts (pure, docs/OFFERS.md §G.4): the 13 contract columns A–M never move;
 * optional columns "SKU", "Articles", "Livraison", "Prix pack" are filled only when the owner added
 * those headers after column M (read once per sheet per 10 min, and again after a failed write). The
 * append sends `null` for every other cell after M, so columns the call center fills are untouched.
 *
 * pullStatuses(): statuses set by call-center agents in the sheet flow back to the database for
 * orders that are fully synced (the sheet is the source of truth for statuses once connected).
 *
 * Interim guard (R1.0 review of T3, finding 2): the one connected sheet is store #1's, so both directions only
 * ever touch store #1's orders (`LEGACY_STORE_ID`). Since T3 merged the public order path, any active store can
 * take orders with sheet_status 'pending'; without the guard their names, phones and addresses would be appended
 * to store #1's sheet. Removed when T4's per-store sync (`syncPendingOrders(scope, …)`, SHT-04) lands.
 */
import { and, eq, inArray, ne, or, sql } from "drizzle-orm";
import type { RowDataPacket } from "mysql2/promise";
import { db, pool } from "@/lib/db/client";
import { orders } from "@/lib/db/schema";
import { LEGACY_STORE_ID } from "@/lib/db/store-handles";
import { systemCtx, systemScope } from "@/lib/jobs/scope";
import type { OrderStatus } from "@/lib/orders/contract";
import { rateLimit } from "@/lib/security/rate-limit";
import { inStore, whereStore } from "@/lib/tenancy/sql";
import type { StoreScope } from "@/lib/tenancy/types";
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

type OrderRow = typeof orders.$inferSelect;

/** Wall-clock zone for the Date column (Morocco by default). */
const SHEET_TZ = process.env.APP_TIMEZONE || "Africa/Casablanca";
const LOCK_NAME = "cod:sheets-sync";

/* ------------------------------------------------------------------ */
/* row content (pure: ./row.ts)                                        */
/* ------------------------------------------------------------------ */

export { productText, sourceText };

/** "Variante" cell: the warehouse order text (§G.4, = order.php cod_units_text). */
export function variantText(o: Pick<OrderRow, "id" | "items">): string {
  return variantCell(o);
}

/** One sheet row: the 13 contract columns (A–M). */
export function orderToRow(o: OrderRow): Cell[] {
  return rowOf(o, statusLabel, SHEET_TZ);
}

/* ------------------------------------------------------------------ */
/* optional columns (by header)                                        */
/* ------------------------------------------------------------------ */

type Tab = Pick<SheetsConfig, "spreadsheetId" | "sheetTitle">;

const HEADER_TTL_MS = 10 * 60_000;
/** N1:AZ1: up to 39 columns after the contract */
const EXTRA_RANGE = `${colLetter(CONTRACT_WIDTH)}1:AZ1`;

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
  while (cache.size > 20) cache.delete(cache.keys().next().value!);
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

/** The append row of an order: contract cells + the optional columns the tab has. */
function fullRow(o: OrderRow, extras: ExtraColumns): (Cell | null)[] {
  return wideRow(orderToRow(o), extras, extraValues(o));
}

/** Cells rewritten when an upsell is accepted after the row was written. */
const UPSELL_EXTRAS: readonly ExtraColumn[] = ["sku", "articles"];

/* ------------------------------------------------------------------ */
/* locking                                                             */
/* ------------------------------------------------------------------ */

async function withDbLock<T>(fn: () => Promise<T>): Promise<T | "locked"> {
  const conn = await pool().getConnection();
  // a named lock lives as long as its session: a connection that may still hold it never goes back to the pool
  let reusable = false;
  try {
    const [rows] = await conn.query<RowDataPacket[]>("SELECT GET_LOCK(?, 0) AS l", [LOCK_NAME]);
    if (Number(rows[0]?.l) !== 1) {
      reusable = true;
      return "locked";
    }
    try {
      return await fn();
    } finally {
      reusable = await conn.query("SELECT RELEASE_LOCK(?)", [LOCK_NAME]).then(
        () => true,
        () => false,
      );
    }
  } finally {
    if (reusable) conn.release();
    else conn.destroy();
  }
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

/** Store #1, the owner of the one connected sheet (the interim guard above), as a system scope. */
const sheetScope = (): StoreScope => systemScope(systemCtx("sheets.sync"), LEGACY_STORE_ID);

/**
 * The orders a sync pass claims: store #1's only (the interim guard above), pending, or failed with their backoff
 * elapsed (`force` ignores it); oldest first. Exported for test:public-api.
 */
export function selectSyncBatch(opts: SyncOptions = {}): Promise<(typeof orders.$inferSelect)[]> {
  return pendingIn(sheetScope(), opts);
}

/** The sync batch of one store (T4's per-store sync, SHT-04, takes this shape over). */
async function pendingIn(scope: StoreScope, opts: SyncOptions): Promise<(typeof orders.$inferSelect)[]> {
  const limit = opts.limit ?? 50;
  const now = new Date();
  const status = opts.force
    ? inArray(orders.sheetStatus, ["pending", "failed"])
    : or(
        eq(orders.sheetStatus, "pending"),
        and(
          eq(orders.sheetStatus, "failed"),
          sql`${orders.updatedAt} <= DATE_SUB(${now}, INTERVAL LEAST(POW(2, ${orders.sheetAttempts}), 360) MINUTE)`,
        ),
      );
  return db.select().from(orders).where(whereStore(orders, scope, status)).orderBy(orders.createdAt).limit(limit);
}

async function syncOnce(sheet: SheetsConfig, opts: SyncOptions): Promise<SyncResult & { selected: number }> {
  const batch = await selectSyncBatch(opts);
  if (!batch.length) return { ...empty("ok"), selected: 0 };

  const ids = batch.map((o) => o.id);
  // claim: any later retry of these rows will look the sheet up before appending
  await db
    .update(orders)
    .set({ sheetAttempts: sql`${orders.sheetAttempts} + 1` })
    .where(inArray(orders.id, ids));

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
        const row = orderToRow(o);
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
    await appendWide(sheet, toAppend.map((o) => fullRow(o, extras)), gopts);
    result.appended = toAppend.length;
    await updateCells(sheet.spreadsheetId, sheet.sheetTitle, updates, gopts);

    // mark synced — unless the order changed meanwhile (e.g. upsell accepted): it stays pending
    const unchanged = batch.map((o) => and(eq(orders.id, o.id), eq(orders.updatedAt, o.updatedAt))!);
    await db
      .update(orders)
      .set({ sheetStatus: "synced", sheetError: null })
      .where(and(inArray(orders.id, ids), or(...unchanged)));
    return result;
  } catch (err) {
    forgetHeaders(sheet);
    const message = explain(err, serviceAccountEmail()).slice(0, 500);
    await db
      .update(orders)
      .set({ sheetStatus: "failed", sheetError: message, updatedAt: new Date() })
      .where(and(inArray(orders.id, ids), ne(orders.sheetStatus, "synced")));
    return { ...empty("error", message), failed: batch.length, selected: batch.length };
  }
}

declare global {
  var __codSheetsSync: { running: Promise<SyncResult> | null; rerun: boolean; force: boolean } | undefined;
}
// process-wide (route bundles may each load their own copy of this module)
const syncState = () => (globalThis.__codSheetsSync ??= { running: null, rerun: false, force: false });
/** passes per call: a backlog (e.g. orders queued before the sheet was connected) drains in one go */
const MAX_PASSES = 5;

/**
 * Push pending orders to the connected sheet. Safe to call often (after each order, from the cron):
 * concurrent calls coalesce into the running pass, which then runs again to pick up new orders
 * (with the retry backoff ignored when a coalesced caller asked for `force`).
 */
export async function syncPendingOrders(opts: SyncOptions = {}): Promise<SyncResult> {
  const st = syncState();
  if (st.running) {
    st.rerun = true;
    if (opts.force) st.force = true;
    return st.running;
  }
  const limit = Math.min(200, Math.max(1, opts.limit ?? 50));
  st.running = (async () => {
    try {
      if (!isSheetsConfigured()) return empty("not_configured");
      const sheet = await activeSheet();
      if (!sheet) return empty("not_configured");
      const total = empty("ok");
      for (let pass = 0; pass < MAX_PASSES; pass++) {
        const force = !!opts.force || st.force;
        st.rerun = false;
        st.force = false;
        const r = await withDbLock(() => syncOnce(sheet, { ...opts, force, limit }));
        if (r === "locked") return pass === 0 ? empty("locked") : total;
        total.appended += r.appended;
        total.updated += r.updated;
        total.skipped += r.skipped;
        total.failed += r.failed;
        if (r.status === "error") return { ...total, status: "error", error: r.error };
        if (!st.rerun && r.selected < limit) break;
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
  /** local orders whose status changed */
  updated: number;
  error?: string;
}

/** Apply statuses chosen by agents in the sheet (at most every 5 min unless forced). */
export async function pullStatuses(opts: { force?: boolean } = {}): Promise<PullResult> {
  if (!isSheetsConfigured()) return { status: "not_configured", seen: 0, updated: 0 };
  const sheet = await activeSheet();
  if (!sheet) return { status: "not_configured", seen: 0, updated: 0 };
  if (!opts.force) {
    const gate = await rateLimit("sheets:pull", 1, 290);
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
    if (!/^[A-Z0-9]{2,8}-[A-Z0-9]{4,12}$/.test(id)) continue;
    const list = byStatus.get(st) ?? [];
    list.push(id);
    byStatus.set(st, list);
  }
  let updated = 0;
  const now = new Date();
  for (const [status, ids] of byStatus) {
    for (let i = 0; i < ids.length; i += 500) {
      const res = await db
        .update(orders)
        .set({ status, updatedAt: now })
        .where(and(inStore(orders, sheetScope()), inArray(orders.id, ids.slice(i, i + 500)), eq(orders.sheetStatus, "synced"), ne(orders.status, status)));
      updated += affected(res);
    }
  }
  return { status: "ok", seen: statuses.size, updated };
}

/** affectedRows from a drizzle mysql2 update result */
export function affected(res: unknown): number {
  const head = Array.isArray(res) ? res[0] : res;
  const n = (head as { affectedRows?: number } | undefined)?.affectedRows;
  return typeof n === "number" ? n : 0;
}

/* ------------------------------------------------------------------ */
/* single-order status push (admin edits)                              */
/* ------------------------------------------------------------------ */

export type PushStatusResult = "updated" | "not_found" | "skipped";

/**
 * Write one order's status label into its row (column C). "skipped" when no sheet is connected,
 * "not_found" when the row is not in the sheet (deleted by an agent, or not yet synced).
 * A paused sheet is written too: pausing stops appending orders and pulling statuses, but a status
 * chosen in the admin must reach a row that already exists, or resuming would pull the old label back.
 * Throws SheetsError on Google failures (callers surface `explain()`).
 */
export async function pushOrderStatus(orderId: string, status: OrderStatus): Promise<PushStatusResult> {
  if (!isSheetsConfigured()) return "skipped";
  const sheet = await getSheetsConfig();
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

/** Sheet sync health for dashboards: counts per sheet status. */
export async function syncHealth(): Promise<Record<"pending" | "synced" | "failed" | "disabled", number>> {
  const rows = await db
    .select({ s: orders.sheetStatus, n: sql<number>`COUNT(*)` })
    .from(orders)
    .groupBy(orders.sheetStatus);
  const out = { pending: 0, synced: 0, failed: 0, disabled: 0 };
  for (const r of rows) out[r.s] = Number(r.n);
  return out;
}
