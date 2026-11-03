import "server-only";
/**
 * "Repair sheet" and "Send again" of the store's Google Sheet (operations.md OPE-§19.4, §19.5 step 7, §19.8 rev 3; P5
 * step 8). Both act on the store's own bound spreadsheet only (`sheetBound`, OPE-§19.2): a config pointing at a
 * spreadsheet the store does not hold reads as "not connected" and makes no Google call.
 *
 *   repairSheet(scope, { add: ["agent", "tracking"] })  → the header's look and the status dropdown again, the contract
 *                                                          header A..M rewritten, the ticked optional headers added
 *   requeueSheetRow(scope, orderId, actor)               → the drawer's "Send again" (a row deleted in the sheet)
 *   syncSheetNow(scope)                                  → "Sync now" (the action, ⌘K and the R1.0 sync route)
 *
 * A repair makes at most four calls (the tab's grid, the header row, one batchUpdate, one values write), each taking a
 * token of the platform's `p:sheets:sa` bucket like the push (OPE-§19.7): an empty bucket answers `RepairError("busy")`.
 * Existing cells are never moved or cleared: a missing optional header goes after the last header cell in use, and the
 * grid grows by the columns it needs. The conditional colours are not re-added (they would be duplicated).
 */
import { requeueOrderSync } from "@/lib/orders/admin";
import { platformBucket, rateLimit } from "@/lib/security/rate-limit";
import { assertFeature } from "@/lib/tenancy/entitlements";
import type { Actor, WriteScope } from "@/lib/tenancy/types";
import { gapi } from "./client";
import { getSheetsConfig, sheetBound } from "./config";
import { a1, colLetter } from "./format";
import { COLUMNS, headerUsable, repairRequests } from "./orders-sheet";
import { pushStore, SA_BUCKET, scheduleSheetPush, type SheetsPushResult } from "./push";
import { foldLabel, R1_HEADERS, type R1Column } from "./row";

/** `s:<sid>:sheets:sync:<uid>` (core §E.8, unchanged from R1.0): Sync now and Repair, 12 per 10 minutes per member. */
export const SYNC_BUCKET = { name: "sheets:sync", limit: 12, windowSec: 600 } as const;

/** The six optional headers the repair offers, one tick each (OPE-§19.4 rev 3; "Repère" is the R1.0 one). */
export const REPAIR_HEADERS = ["agent", "agentNote", "tracking", "carrier", "shipStatus", "shipAfter"] as const satisfies readonly R1Column[];
export type RepairHeader = (typeof REPAIR_HEADERS)[number];

/** A grid this wide is the most a repair grows the tab to (13 contract columns, the R1.0 extras, the six). */
const MAX_COLUMNS = 60;

/** Why a repair did nothing (the action words each one). */
export class RepairError extends Error {
  constructor(readonly code: "not_connected" | "tab_missing" | "header_foreign" | "too_wide" | "busy") {
    super(code);
    this.name = "RepairError";
  }
}

export interface RepairResult {
  tab: string;
  /** the headers this repair wrote (French labels, as they now read in row 1) */
  added: string[];
  /** the ticked headers the tab already had */
  present: string[];
}

interface TabMeta {
  sheets?: { properties?: { sheetId?: number; title?: string; gridProperties?: { columnCount?: number } } }[];
}

const sid = (spreadsheetId: string) => `/${encodeURIComponent(spreadsheetId)}`;

/** One token of the shared service account per call (the push's bucket, OPE-§19.7). */
const gapiOpts = {
  maxRetries: 1,
  timeoutMs: 8_000,
  beforeCall: async () => {
    if (!(await rateLimit(platformBucket(SA_BUCKET.name), SA_BUCKET.limit, SA_BUCKET.windowSec)).ok) throw new RepairError("busy");
  },
};

/**
 * Re-applies the header row's format and the status dropdown, rewrites the 13 contract headers, and adds the ticked
 * optional headers the tab lacks (detected like the push does: first row, trimmed, case- and accent-insensitive).
 * A header row laid out by another tool (`headerUsable` false) is never rewritten: `header_foreign`.
 */
export async function repairSheet(scope: WriteScope, opts: { add: readonly RepairHeader[] }): Promise<RepairResult> {
  await assertFeature(scope, "sheets");
  const cfg = await getSheetsConfig(scope);
  if (!cfg || !(await sheetBound(scope, cfg.spreadsheetId))) throw new RepairError("not_connected");

  const meta = await gapi<TabMeta>(`${sid(cfg.spreadsheetId)}?fields=${encodeURIComponent("sheets(properties(sheetId,title,gridProperties(columnCount)))")}`, {}, gapiOpts);
  const tab = (meta.sheets ?? []).map((s) => s.properties).find((p) => p?.sheetId === cfg.sheetId);
  if (!tab?.title) throw new RepairError("tab_missing");
  const title = tab.title;

  const read = await gapi<{ values?: unknown[][] }>(`${sid(cfg.spreadsheetId)}/values/${encodeURIComponent(a1(title, "1:1"))}`, {}, gapiOpts);
  const header = (read.values?.[0] ?? []).map((v) => String(v ?? "").trim());
  if (!headerUsable(header.slice(0, COLUMNS.length))) throw new RepairError("header_foreign");

  const seen = new Set(header.map(foldLabel));
  const wanted = REPAIR_HEADERS.filter((k) => opts.add.includes(k));
  const present = wanted.filter((k) => seen.has(foldLabel(R1_HEADERS[k]))).map((k) => R1_HEADERS[k]);
  const missing = wanted.filter((k) => !seen.has(foldLabel(R1_HEADERS[k]))).map((k) => R1_HEADERS[k]);

  // new headers go after the last cell in use (never over a column someone else named), the contract's 13 at least
  let last = COLUMNS.length - 1;
  header.forEach((h, i) => {
    if (h) last = Math.max(last, i);
  });
  const width = last + 1 + missing.length;
  if (width > MAX_COLUMNS) throw new RepairError("too_wide");
  const columnCount = tab.gridProperties?.columnCount ?? COLUMNS.length;

  const requests: object[] = [];
  if (width > columnCount) requests.push({ appendDimension: { sheetId: cfg.sheetId, dimension: "COLUMNS", length: width - columnCount } });
  requests.push(...repairRequests(cfg.sheetId, width));
  await gapi(`${sid(cfg.spreadsheetId)}:batchUpdate`, { method: "POST", body: JSON.stringify({ requests }) }, gapiOpts);

  const data: { range: string; majorDimension: "ROWS"; values: string[][] }[] = [
    { range: a1(title, `A1:${colLetter(COLUMNS.length - 1)}1`), majorDimension: "ROWS", values: [COLUMNS.map((c) => c[0])] },
  ];
  if (missing.length) data.push({ range: a1(title, `${colLetter(last + 1)}1:${colLetter(last + missing.length)}1`), majorDimension: "ROWS", values: [missing] });
  await gapi(`${sid(cfg.spreadsheetId)}/values:batchUpdate`, { method: "POST", body: JSON.stringify({ valueInputOption: "RAW", data }) }, gapiOpts);

  // the next push writes the new columns of the rows it touches; the planner reads the wider header itself
  return { tab: title, added: missing, present };
}

/**
 * "Send again" of the order drawer (OPE-§19.5 step 7): the store's own order goes back to `pending` and a push is
 * scheduled. False for an id the store does not have and for an order never sent to a sheet (a test or bot-flagged
 * order is `disabled`: the push's `is_test = 0` guard keeps it out, OPE-§26). Audited `orders.sheet_requeued`.
 */
export async function requeueSheetRow(scope: WriteScope, orderId: string, actor: Actor): Promise<boolean> {
  if (!(await requeueOrderSync(scope, orderId, actor))) return false;
  scheduleSheetPush(scope);
  return true;
}

/** "Sync now": one manual run (3 calls, failed orders skip their backoff, the pull whatever its 290 s window says). */
export function syncSheetNow(scope: WriteScope): Promise<SheetsPushResult> {
  return pushStore(scope, { maxCalls: 3, force: true, forcePull: true, trigger: "manual" });
}
