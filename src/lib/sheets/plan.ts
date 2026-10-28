/**
 * The Sheets run planner (P5 INTEGRATIONS; operations.md OPE-§19.5, §19.6, §19.7; OD2, OD5, OD22, OD49, OD54, OD55;
 * core D74). Pure: no database, no network, no server module, so `test:conversions` proves it offline
 * (src/lib/sheets/selftest.ts). The push runner (`pushStore`, step 4) does the I/O around it:
 *
 *   1. `planSheetRun(input)`                → `read` when the run needs one, and nothing else yet
 *   2. the runner makes that ONE read        (values:batchGet: the header row N1:AZ1 and the rows A2:<width>)
 *   3. `planSheetRun({ ...input, read })`   → `append`, `batchUpdate`, `marks`, `missing`, `pull`
 *   4. the runner applies the pull decisions (status first), sends the append and the batchUpdate, then the marks
 *
 * Without a read (new orders only, headers known) step 1 already answers the append. Per store per tick the plan
 * never holds more than one read, one append and one values:batchUpdate (OD22); `maxCalls` lowers that budget (2 for
 * the `after()` fast path: an append, or a read and one write; 1 when the platform bucket is nearly empty).
 *
 * Work: appends = `sheet_status` pending, or failed past the backoff, and `is_test = 0` (≤ 100, oldest first);
 * updates = `sheet_status` synced and `sheet_dirty > 0` and `is_test = 0` (≤ 200). The runner's SQL uses the same
 * predicates and the planner applies them again, so a test order can never reach a sheet, "Send again" included.
 * Bits → cells: 1 → C (+ "Agent", "Statut livraison"); 2 → D-G (+ "Repère", "Tracking", "Transporteur", "Livrer à
 * partir du"); 4 → H-K (+ "SKU", "Articles", "Prix pack", "Livraison"). A mark clears the bits it wrote only while
 * `rev` still equals the rev read, so an order changed meanwhile stays dirty for the next run; `sheet_label` (what
 * column C now holds) is written whatever happened, because it is a fact about the sheet, not about the order.
 */
import { createHash } from "node:crypto";
import type { OrderStatus } from "@/lib/orders/contract";
import type { ConfirmState, ShipState } from "@/lib/orders/state";
import { cleanText, colLetter } from "./format";
import {
  BIT_CELLS,
  BIT_COLUMNS,
  COL,
  extraValues,
  foldLabel,
  orderToRow,
  placeCells,
  PULLED_COLUMNS,
  r1Values,
  sheetColumnsOf,
  statusFromLabel,
  statusLabel,
  type Cell,
  type DirtyBit,
  type R1Column,
  type R1Fields,
  type R1RowCtx,
  type SheetColumn,
  type SheetColumns,
  type SheetOrder,
} from "./row";

/* ------------------------------------------------------------------ */
/* limits                                                              */
/* ------------------------------------------------------------------ */

export const APPEND_MAX = 100;
export const UPDATE_MAX = 200;
/** a failed order waits min(2^attempts, 360) minutes before it is tried again (today's backoff, kept) */
export const BACKOFF_CAP_MIN = 360;
/** the header row read with the rows: N1:AZ1, 39 columns after the contract */
export const HEADER_RANGE = "N1:AZ1";
/** the pull's sha256 prefix of a "Note agent" cell */
export const CELL_HASH_LEN = 16;
export const ROW_NOT_FOUND = "Row not found in the sheet";
const BITS: readonly DirtyBit[] = [1, 2, 4];
const ALL_BITS = 7;

/* ------------------------------------------------------------------ */
/* input                                                               */
/* ------------------------------------------------------------------ */

export type SheetStatus = "pending" | "synced" | "failed" | "disabled";

/** An order as the planner reads it: the row content, the R1 cells and the Sheets bookkeeping (an `orders` row fits). */
export interface PlanOrder extends SheetOrder, R1Fields {
  rev: number;
  updatedAt: Date;
  isTest: boolean;
  sheetStatus: SheetStatus;
  sheetAttempts: number;
  sheetDirty: number;
  sheetLabel: string | null;
  /** `meta.cellHash` of the order's last `note` event of actor `sheet`; null or absent = none */
  lastSheetNoteHash?: string | null;
}

/** What the pull needs of an order (a `PlanOrder` fits). */
export type PullOrder = Pick<
  PlanOrder,
  "id" | "isTest" | "sheetStatus" | "sheetLabel" | "sheetDirty" | "status" | "confirmState" | "shipState" | "confirmedBy" | "confirmedByLabel" | "trackingRef" | "carrierLabel" | "lastSheetNoteHash"
>;

export interface SheetRunCtx extends R1RowCtx {
  /** `ops.agentLabels`: the sheet's "Agent" labels → member ids (OD54) */
  agentLabels?: Readonly<Record<string, string>>;
}

/** The read the plan asked for, as the runner got it back. */
export interface SheetRead {
  /** the cells of `HEADER_RANGE` (N1 first) */
  header: readonly unknown[];
  /** the rows of `read.rows` (A2 first); empty when the plan read the header only */
  rows: readonly (readonly unknown[])[];
}

export interface SheetRunInput {
  now: Date;
  maxCalls: 1 | 2 | 3;
  /** the store's candidate orders (the runner's two work queries); the work predicates are applied again here */
  orders: readonly PlanOrder[];
  /** the optional columns of an earlier read (the runner's header cache); null = not known yet */
  headers: SheetColumns | null;
  /** `sheets.pull` off; on (the dirty rows of this run are checked); due (`s:<sid>:sheets:pull`, every row read) */
  pull: "off" | "on" | "due";
  /** "Sync now": failed orders skip their backoff */
  force?: boolean;
  ctx: SheetRunCtx;
  /** step 3: the result of the plan's read */
  read?: SheetRead;
  /** step 3 with `pull: "due"`: the store's orders of the ids read (whereStore; another store's id is simply absent) */
  pullOrders?: readonly PullOrder[];
}

/* ------------------------------------------------------------------ */
/* output                                                              */
/* ------------------------------------------------------------------ */

export interface SheetReadSpec {
  header: string;
  /** "A2:C", widened to the last pulled optional column when the pull is due; null = the header row only */
  rows: string | null;
  /** columns read from A (3 = A-C) */
  width: number;
}

/**
 * Bookkeeping of one order after the run. The runner writes it as one statement:
 * `SET <set>, sheet_dirty = (IF(rev = :rev, sheet_dirty & ~:clearDirty, sheet_dirty)) | :dirtyOr WHERE store_id = ? AND id = ?`
 * (with `set.sheetDirty` = 0 replacing the whole expression for a missing row).
 */
export interface SheetMark {
  id: string;
  outcome: "appended" | "present" | "updated" | "missing";
  /** the rev the plan read */
  rev: number;
  set: { sheetStatus?: "synced"; sheetLabel?: OrderStatus | null; sheetError?: string | null; sheetDirty?: 0 };
  /** bits cleared only while `rev` still equals the rev read */
  clearDirty: number;
  /** bits set whatever happened (a found row the app still has to rewrite) */
  dirtyOr: number;
}

export type SheetSrc = { kind: "sheet"; ref: string; agentLabel?: string };

/** One thing the pull asks the runner to do for one row (OPE-§19.6). */
export type PullDecision =
  /** a person changed column C: `applyExternalStatus(scope, orderId, ext, src)`, then `statusBookkeeping` */
  | { kind: "status"; orderId: string; row: number; label: OrderStatus; ext: { legacy: OrderStatus }; src: SheetSrc }
  /** the cell already shows the app's status but `sheet_label` was never recorded (a row synced before R1) */
  | { kind: "label"; orderId: string; row: number; sheetLabel: OrderStatus }
  /** "Agent" on an already confirmed order: `confirmed_by_label = label` (+ `confirmed_by` when mapped) WHERE confirmed_by IS NULL */
  | { kind: "agent"; orderId: string; row: number; label: string; confirmedBy: string | null }
  /** "Note agent": a `note` event (actor `sheet`, meta `agentLabel`, `cellHash`) */
  | { kind: "note"; orderId: string; row: number; text: string; cellHash: string; agentLabel?: string }
  /** "Tracking": `tracking_ref` + a `tracking_set` event; `ship` → `applyExternalStatus(…, { ship }, src)` too */
  | { kind: "tracking"; orderId: string; row: number; trackingRef: string; ship?: "packed"; src: SheetSrc }
  /** "Transporteur": `carrier_label` */
  | { kind: "carrier"; orderId: string; row: number; carrierLabel: string };

export interface SheetRunPlan {
  /** step 1: the one read to make, then call again with `read` */
  read?: SheetReadSpec;
  append?: { ids: string[]; rows: (Cell | null)[][] };
  /** values:batchUpdate data (A1 ranges without the tab: the runner prefixes `a1(tab, range)`) */
  batchUpdate?: { range: string; values: Cell[][] }[];
  marks: SheetMark[];
  /** dirty orders whose id is not in column A (their mark carries `ROW_NOT_FOUND`) */
  missing: string[];
  pull: PullDecision[];
  /** Google calls of the whole run, the read included */
  calls: number;
  /** work left for the next run (the caps and the call budget) */
  deferred: { appends: number; updates: number };
  /** the optional columns the writes used (fresh after a read: the runner caches them) */
  columns: SheetColumns;
}

/* ------------------------------------------------------------------ */
/* work                                                                */
/* ------------------------------------------------------------------ */

const backoffMs = (attempts: number) => Math.min(2 ** Math.max(0, attempts), BACKOFF_CAP_MIN) * 60_000;

/** Append work: pending, or failed past its backoff (`force` skips it); never a test order. */
export function appendDue(o: Pick<PlanOrder, "isTest" | "sheetStatus" | "sheetAttempts" | "updatedAt">, now: Date, force = false): boolean {
  if (o.isTest) return false;
  if (o.sheetStatus === "pending") return true;
  return o.sheetStatus === "failed" && (force || o.updatedAt.getTime() <= now.getTime() - backoffMs(o.sheetAttempts));
}

/** Update work: synced with a dirty bit; never a test order. */
export function updateDue(o: Pick<PlanOrder, "isTest" | "sheetStatus" | "sheetDirty">): boolean {
  return !o.isTest && o.sheetStatus === "synced" && (o.sheetDirty & ALL_BITS) > 0;
}

/** An append that may already be in the sheet: a retry (an earlier attempt may have landed), or an upsell. */
export const mayBeInSheet = (o: Pick<PlanOrder, "sheetAttempts" | "items">): boolean => o.sheetAttempts > 0 || !!o.items.upsell;

const oldestFirst = (a: PlanOrder, b: PlanOrder) => a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

interface Work {
  appends: PlanOrder[];
  updates: PlanOrder[];
  lookup: PlanOrder[];
  fresh: PlanOrder[];
  deferredAppends: number;
  deferredUpdates: number;
}

function workOf(input: SheetRunInput): Work {
  const appendAll = input.orders.filter((o) => appendDue(o, input.now, input.force)).sort(oldestFirst);
  const updateAll = input.orders.filter((o) => updateDue(o)).sort(oldestFirst);
  const appends = appendAll.slice(0, APPEND_MAX);
  const updates = updateAll.slice(0, UPDATE_MAX);
  return {
    appends,
    updates,
    lookup: appends.filter(mayBeInSheet),
    fresh: appends.filter((o) => !mayBeInSheet(o)),
    deferredAppends: appendAll.length - appends.length,
    deferredUpdates: updateAll.length - updates.length,
  };
}

/** The read width: A-C, widened to the last pulled optional column the known headers place when the pull is due. */
export function readWidth(headers: SheetColumns | null, pull: SheetRunInput["pull"]): number {
  let width = COL.status + 1;
  if (pull === "due" && headers) for (const c of PULLED_COLUMNS) if (headers[c] !== undefined) width = Math.max(width, headers[c]! + 1);
  return width;
}

type Mode =
  | { kind: "none" }
  | { kind: "append" } // fresh appends only, no read
  | { kind: "read"; rows: boolean; prefer: "append" | "update" };

/** The run's shape, from the input without the read (both steps compute the same one). */
function modeOf(input: SheetRunInput, w: Work): Mode {
  const pulling = input.pull === "due";
  const known = input.headers !== null;
  const wantRows = w.updates.length > 0 || w.lookup.length > 0 || pulling;
  if (input.maxCalls === 1) {
    if (w.fresh.length && !w.lookup.length && known) return { kind: "append" };
    if (wantRows || (w.appends.length && !known)) return { kind: "read", rows: wantRows, prefer: "append" };
    return { kind: "none" };
  }
  if (input.maxCalls === 2) {
    if (w.appends.length) {
      if (!w.lookup.length && known) return { kind: "append" };
      return { kind: "read", rows: w.lookup.length > 0 || w.updates.length > 0 || pulling, prefer: "append" };
    }
    if (wantRows) return { kind: "read", rows: true, prefer: "update" };
    return { kind: "none" };
  }
  if (wantRows || (w.appends.length && !known)) return { kind: "read", rows: wantRows, prefer: "append" };
  if (w.fresh.length) return { kind: "append" };
  return { kind: "none" };
}

/* ------------------------------------------------------------------ */
/* cells                                                               */
/* ------------------------------------------------------------------ */

function appendRow(o: PlanOrder, cols: SheetColumns, ctx: SheetRunCtx): (Cell | null)[] {
  const base = orderToRow(o, statusLabel, ctx.timeZone);
  return placeCells(base, cols, { ...extraValues(o), ...r1Values(o, ctx) });
}

/** The cells one dirty order rewrites in its row: column index → value (skipped cells are absent). */
function dirtyCells(o: PlanOrder, bits: number, cols: SheetColumns, ctx: SheetRunCtx, skip: ReadonlySet<SheetColumn | "C">): Map<number, Cell> {
  const out = new Map<number, Cell>();
  const base = orderToRow(o, statusLabel, ctx.timeZone);
  const values: Partial<Record<SheetColumn, Cell | null>> = { ...extraValues(o), ...r1Values(o, ctx) };
  for (const bit of BITS) {
    if (!(bits & bit)) continue;
    for (const c of BIT_CELLS[bit]) if (!(c === COL.status && skip.has("C"))) out.set(c, base[c]!);
    for (const k of BIT_COLUMNS[bit]) {
      const c = cols[k];
      const v = values[k];
      if (c !== undefined && v != null && !skip.has(k)) out.set(c, v);
    }
  }
  return out;
}

/** Consecutive cells of one row as A1 segments ("D5:G5"), in column order. */
function segments(row: number, cells: Map<number, Cell>): { range: string; values: Cell[][] }[] {
  const cols = [...cells.keys()].sort((a, b) => a - b);
  const out: { range: string; values: Cell[][] }[] = [];
  let start = -1;
  let vals: Cell[] = [];
  const flush = (end: number) => {
    if (start < 0) return;
    const range = start === end ? `${colLetter(start)}${row}` : `${colLetter(start)}${row}:${colLetter(end)}${row}`;
    out.push({ range, values: [vals] });
  };
  cols.forEach((c, i) => {
    if (start >= 0 && c !== cols[i - 1]! + 1) {
      flush(cols[i - 1]!);
      start = -1;
    }
    if (start < 0) {
      start = c;
      vals = [];
    }
    vals.push(cells.get(c)!);
  });
  if (cols.length) flush(cols[cols.length - 1]!);
  return out;
}

/* ------------------------------------------------------------------ */
/* the read                                                            */
/* ------------------------------------------------------------------ */

export type PulledColumn = Extract<R1Column, "agent" | "agentNote" | "tracking" | "carrier">;

/** One row of the read: its 1-based number, the id in A, the raw label in C and the pulled cells it covered. */
export interface SheetRow {
  row: number;
  id: string;
  label: string;
  /** only the pulled columns inside the read width ("" = read and blank; absent = not read) */
  cells: Partial<Record<PulledColumn, string>>;
}

/** The rows of a read (first occurrence of an id wins, as in today's column A lookup). */
export function sheetRowsOf(read: SheetRead, cols: SheetColumns, width: number): SheetRow[] {
  const seen = new Set<string>();
  const out: SheetRow[] = [];
  read.rows.forEach((r, i) => {
    const id = String(r[COL.id] ?? "").trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    const cells: Partial<Record<PulledColumn, string>> = {};
    for (const k of PULLED_COLUMNS as readonly PulledColumn[]) {
      const c = cols[k];
      if (c !== undefined && c < width) cells[k] = String(r[c] ?? "");
    }
    out.push({ row: i + 2, id, label: String(r[COL.status] ?? ""), cells });
  });
  return out;
}

/* ------------------------------------------------------------------ */
/* the pull (OPE-§19.6)                                                */
/* ------------------------------------------------------------------ */

/** sha256 prefix of a "Note agent" cell (the dedupe key kept in the note event's meta). */
export const cellHash = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex").slice(0, CELL_HASH_LEN);

const PRE_SHIP: ReadonlySet<ShipState> = new Set(["none", "to_pack"]);
const CLOSED: ReadonlySet<ConfirmState> = new Set(["cancelled", "fake", "duplicate"]);
const pulledText = (v: string | undefined, max: number) => (v === undefined ? "" : cleanText(v, max));

/** `ops.agentLabels` with folded keys ("  ahmed " finds "Ahmed"). */
function labelMap(agentLabels: Readonly<Record<string, string>> | undefined): Map<string, string> {
  const m = new Map<string, string>();
  for (const [label, uid] of Object.entries(agentLabels ?? {})) {
    const k = foldLabel(label);
    if (k && !m.has(k)) m.set(k, uid);
  }
  return m;
}

/**
 * What the pull does with the rows read (OPE-§19.6, rev 3 optional cells). Only the store's own synced, non-test
 * orders are touched: an id absent from `orders` (another store's order typed into the sheet, SHT-05) is ignored.
 *
 * - Column C: blank or unknown → nothing; = `sheet_label` → nothing; `sheet_label` never recorded and the cell shows
 *   the app's status → record it (`label`); otherwise a person changed it → `status` (the runner calls
 *   `applyExternalStatus` with the row's "Agent" cell as `agentLabel`, so the confirmation it applies is attributed).
 * - "Agent" on an already confirmed order nobody attributed (`confirmed_by` NULL), when the cell differs from
 *   `confirmed_by_label` → `agent` (a mapped label also writes `confirmed_by`; a queue confirmation is never re-attributed).
 * - "Note agent" whose `cellHash` differs from the last sheet note → `note`.
 * - "Tracking" non-empty and ≠ `tracking_ref` → `tracking`, with `ship: "packed"` only while the order is pre-ship
 *   (none, to_pack), not closed, and the same row does not move it elsewhere; a cleared cell never clears the column.
 * - "Transporteur" non-empty and ≠ `carrier_label` → `carrier`.
 * The text cells skip an order whose cells the app changed and has not pushed yet (its dirty bit: the push rewrites
 * them, so a stale cell never reverts the drawer).
 */
export function pullDecisions(rows: readonly SheetRow[], orders: ReadonlyMap<string, PullOrder> | readonly PullOrder[], ctx: Pick<SheetRunCtx, "agentLabels">): PullDecision[] {
  const byId = orders instanceof Map ? (orders as ReadonlyMap<string, PullOrder>) : new Map((orders as readonly PullOrder[]).map((o) => [o.id, o]));
  const mapped = labelMap(ctx.agentLabels);
  const out: PullDecision[] = [];
  for (const r of rows) {
    const o = byId.get(r.id);
    if (!o || o.isTest || o.sheetStatus !== "synced") continue;
    const ref = `row:${r.row}`;
    const agent = pulledText(r.cells.agent, 60);
    const label = statusFromLabel(r.label);
    let moved: OrderStatus | null = null;
    if (label && label !== o.sheetLabel) {
      if (o.sheetLabel === null && label === o.status) out.push({ kind: "label", orderId: o.id, row: r.row, sheetLabel: label });
      else {
        moved = label;
        out.push({ kind: "status", orderId: o.id, row: r.row, label, ext: { legacy: label }, src: { kind: "sheet", ref, ...(agent ? { agentLabel: agent } : {}) } });
      }
    }
    if (agent && o.confirmState === "confirmed" && o.confirmedBy === null && !(o.sheetDirty & 1) && agent !== o.confirmedByLabel) {
      out.push({ kind: "agent", orderId: o.id, row: r.row, label: agent, confirmedBy: mapped.get(foldLabel(agent)) ?? null });
    }
    const note = pulledText(r.cells.agentNote, 500);
    if (note) {
      const hash = cellHash(note);
      if (hash !== (o.lastSheetNoteHash ?? null)) out.push({ kind: "note", orderId: o.id, row: r.row, text: note, cellHash: hash, ...(agent ? { agentLabel: agent } : {}) });
    }
    const stale = (o.sheetDirty & 2) !== 0;
    const tracking = pulledText(r.cells.tracking, 64);
    if (tracking && !stale && tracking !== (o.trackingRef ?? "")) {
      const pack = PRE_SHIP.has(o.shipState) && !CLOSED.has(o.confirmState) && (moved === null || moved === "confirmed");
      out.push({ kind: "tracking", orderId: o.id, row: r.row, trackingRef: tracking, ...(pack ? { ship: "packed" as const } : {}), src: { kind: "sheet", ref } });
    }
    const carrier = pulledText(r.cells.carrier, 60);
    if (carrier && !stale && carrier !== (o.carrierLabel ?? "")) out.push({ kind: "carrier", orderId: o.id, row: r.row, carrierLabel: carrier });
  }
  return out;
}

/** The answer of `applyExternalStatus` as the bookkeeping reads it (a `TransitionResult` or the noop answer fits). */
export type ExternalAnswer = { ok: true; changed: boolean; status?: string; rev?: number; noop?: true } | { ok: false; error: string };

/**
 * `sheet_label` / `sheet_dirty` after a `status` decision was applied (OPE-§19.6): changed and the new projection
 * equals the label → `sheet_label = label` (and the status bit the transition set is cleared while `rev` is the new
 * one: the cell already says it); an implied path, a noop or a refusal → `sheet_label = label` and `sheet_dirty |= 1`,
 * so the next push writes the app's label back (OD5). An order that vanished (`not_found`) gets nothing.
 */
export function statusBookkeeping(d: Extract<PullDecision, { kind: "status" }>, answer: ExternalAnswer): { sheetLabel: OrderStatus; dirtyOr: number; clearDirty: number; rev: number | null } | null {
  if (!answer.ok && answer.error === "not_found") return null;
  if (answer.ok && answer.changed && answer.status === d.label) return { sheetLabel: d.label, dirtyOr: 0, clearDirty: 1, rev: answer.rev ?? null };
  return { sheetLabel: d.label, dirtyOr: 1, clearDirty: 0, rev: null };
}

/* ------------------------------------------------------------------ */
/* the plan                                                            */
/* ------------------------------------------------------------------ */

/** Plan one run for one store (see the header). Pure and deterministic: the same input gives the same plan. */
export function planSheetRun(input: SheetRunInput): SheetRunPlan {
  const w = workOf(input);
  const mode = modeOf(input, w);
  const ctx = input.ctx;
  const width = readWidth(input.headers, input.pull);
  const deferred = { appends: w.deferredAppends, updates: w.deferredUpdates };
  const empty = (columns: SheetColumns): SheetRunPlan => ({ marks: [], missing: [], pull: [], calls: 0, deferred: { appends: w.appends.length + deferred.appends, updates: w.updates.length + deferred.updates }, columns });

  if (mode.kind === "none") return empty(input.headers ?? {});

  if (mode.kind === "append") {
    const cols = input.headers ?? {};
    return {
      append: { ids: w.fresh.map((o) => o.id), rows: w.fresh.map((o) => appendRow(o, cols, ctx)) },
      marks: w.fresh.map((o) => appendedMark(o)),
      missing: [],
      pull: [],
      calls: 1,
      deferred: { appends: deferred.appends + w.lookup.length, updates: deferred.updates + w.updates.length },
      columns: cols,
    };
  }

  // a read is needed: step 1 asks for it and plans nothing else
  if (!input.read) {
    return {
      ...empty(input.headers ?? {}),
      read: { header: HEADER_RANGE, rows: mode.rows ? `A2:${colLetter(width - 1)}` : null, width: mode.rows ? width : 0 },
      calls: 1,
    };
  }

  // step 3: the read is in
  const cols = sheetColumnsOf(input.read.header);
  const rows = mode.rows ? sheetRowsOf(input.read, cols, width) : [];
  const rowOf = new Map(rows.map((r) => [r.id, r]));
  const marks: SheetMark[] = [];
  const missing: string[] = [];

  // the pull: every row when due, else only the rows of this run's own orders (a person's edit is never overwritten unseen)
  let pull: PullDecision[] = [];
  if (mode.rows && input.pull !== "off") {
    const own = new Map<string, PullOrder>(input.orders.map((o) => [o.id, o]));
    if (input.pull === "due") for (const o of input.pullOrders ?? []) if (!own.has(o.id)) own.set(o.id, o);
    pull = pullDecisions(input.pull === "due" ? rows : rows.filter((r) => own.has(r.id)), own, ctx);
  }
  const skips = new Map<string, Set<SheetColumn | "C">>();
  const skip = (id: string, k: SheetColumn | "C") => (skips.get(id) ?? skips.set(id, new Set()).get(id)!).add(k);
  for (const d of pull) {
    if (d.kind === "status") {
      skip(d.orderId, "C");
      skip(d.orderId, "agent");
      skip(d.orderId, "shipStatus");
    } else if (d.kind === "agent") skip(d.orderId, "agent");
    else if (d.kind === "tracking") skip(d.orderId, "tracking");
    else if (d.kind === "carrier") skip(d.orderId, "carrier");
  }

  // appends: a looked-up order found in column A is marked synced (cells it may need rewriting are left dirty)
  const toAppend: PlanOrder[] = [];
  for (const o of w.appends) {
    const r = mode.rows ? rowOf.get(o.id) : undefined;
    if (!r) {
      toAppend.push(o); // a header-only read happens only when no append needs the lookup (modeOf)
      continue;
    }
    const cell = statusFromLabel(r.label);
    const bits = (o.sheetDirty & ALL_BITS) | (o.items.upsell ? 4 : 0) | (cell !== o.status ? 1 : 0);
    marks.push({ id: o.id, outcome: "present", rev: o.rev, set: { sheetStatus: "synced", sheetLabel: cell, sheetError: null }, clearDirty: 0, dirtyOr: bits });
  }

  // updates: found → cells; missing → the row was deleted in the sheet, never re-appended
  const updates: { o: PlanOrder; row: number; cells: Map<number, Cell>; bits: number }[] = [];
  for (const o of mode.rows ? w.updates : []) {
    const r = rowOf.get(o.id);
    if (!r) {
      missing.push(o.id);
      marks.push({ id: o.id, outcome: "missing", rev: o.rev, set: { sheetError: ROW_NOT_FOUND, sheetDirty: 0 }, clearDirty: 0, dirtyOr: 0 });
      continue;
    }
    const s = skips.get(o.id) ?? new Set<SheetColumn | "C">();
    const bits = o.sheetDirty & ALL_BITS;
    updates.push({ o, row: r.row, cells: dirtyCells(o, bits, cols, ctx, s), bits: s.has("C") ? bits & ~1 : bits });
  }

  // the call budget after the read: the mode's preferred write first, the other one if a call is left (updates whose
  // cells are all skipped or absent cost no call and are still marked)
  const data = updates.flatMap((u) => segments(u.row, u.cells));
  let budget = input.maxCalls - 1;
  const writeAppend = () => toAppend.length > 0 && budget > 0 && (budget--, true);
  const writeUpdate = () => updates.length > 0 && (data.length === 0 || (budget > 0 && (budget--, true)));
  let doAppend = false;
  let doUpdate = false;
  if (mode.prefer === "append") {
    doAppend = writeAppend();
    doUpdate = writeUpdate();
  } else {
    doUpdate = writeUpdate();
    doAppend = writeAppend();
  }

  const plan: SheetRunPlan = { marks, missing, pull, calls: 1, deferred: { ...deferred }, columns: cols };
  if (doAppend) {
    plan.append = { ids: toAppend.map((o) => o.id), rows: toAppend.map((o) => appendRow(o, cols, ctx)) };
    marks.push(...toAppend.map((o) => appendedMark(o)));
    plan.calls++;
  } else plan.deferred.appends += toAppend.length;
  if (doUpdate) {
    if (data.length) plan.batchUpdate = data;
    for (const u of updates) {
      const wroteC = u.cells.has(COL.status);
      marks.push({ id: u.o.id, outcome: "updated", rev: u.o.rev, set: wroteC ? { sheetLabel: statusFromLabel(String(u.cells.get(COL.status))) } : {}, clearDirty: u.bits, dirtyOr: 0 });
    }
    if (data.length) plan.calls++;
  } else plan.deferred.updates += updates.length;
  return plan;
}

const appendedMark = (o: PlanOrder): SheetMark => ({
  id: o.id,
  outcome: "appended",
  rev: o.rev,
  set: { sheetStatus: "synced", sheetLabel: statusFromLabel(statusLabel(o.status)), sheetError: null },
  clearDirty: ALL_BITS,
  dirtyOr: 0,
});
