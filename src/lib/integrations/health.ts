import "server-only";
/**
 * Integration health reads (P5 INTEGRATIONS; operations.md OPE-§28.1, §28.2, OD40; docs/STORE-SAAS.md §K.2 P0, PLA Q.11):
 * the one read every surface uses (the integrations page strip, the dashboard tile, the console store profile, the
 * `int:*` health rules and P1's platform flags). Signatures frozen at P0; every read is the store's own rows
 * through its scope, test orders excluded, and no customer field leaves this file.
 *
 * - `integrationHealth(scope)`: the `integration_status` rows (sheets, then capi per pixel, then telegram), with the
 *   last error code mapped to its plain words (`int.cause.<code>`, src/lib/integrations/causes.ts).
 * - `sheetsBacklog(scope)`: orders waiting for an append (`pending`), failed appends (`failed`), synced orders with a
 *   change still to write (`dirty`), the oldest waiting `created_at` (pending + failed, `orders_store_sheet_idx`;
 *   dirty over `orders_dirty_idx`) and the last run / last failed run from the run history (src/lib/sheets/history.ts).
 * - `syncFailedCount(scope)`: failed sheet rows + dead outbox items of the kinds tenants see (the pulse's
 *   `syncFailed`, OPE-§27.3).
 * - The reads of the `int:*` rules beyond `HealthInputs` (src/lib/health/rules/integrations.ts loads this module
 *   lazily): `deadDeliveryCount`, `captchaDays`.
 */
import { and, count, eq, gt, gte, inArray, lt, min, sql } from "drizzle-orm";
import { addDays, dayKey, dayStart } from "@/lib/admin-data/time";
import { db } from "@/lib/db/client";
import { integrationStatus, orders, outbox } from "@/lib/db/schema";
import { lastRuns, sheetsRunHistory } from "@/lib/sheets/history";
import { inStore, whereStore } from "@/lib/tenancy/sql";
import type { MessageKey, StoreScope } from "@/lib/tenancy/types";
import { causeKey } from "./causes";
import { TENANT_OUTBOX_KINDS } from "./deliveries";

export type IntegrationKind = (typeof integrationStatus.$inferSelect)["kind"];

/** One `integration_status` row, with its last error code mapped to the plain-words cause (`int.cause.<code>`). */
export interface IntegrationHealthRow {
  kind: IntegrationKind;
  /** "" | "meta:<pixel>" | endpoint id | account id */
  targetId: string;
  state: "ok" | "warn" | "failing" | "off";
  lastOkAt: string | null;
  lastErrorAt: string | null;
  lastErrorCode: string | null;
  lastErrorKey: MessageKey | null;
  /** consecutive failures */
  failures: number;
  backlog: number;
  oldestPendingAt: string | null;
  updatedAt: string;
}

/**
 * The Sheets backlog of the store. OPE-§28.1's fields, plus `lastRunFailedAt`, which P1's `sheets_error` platform flag
 * reads (PLA-§6.3, PD79); PLA Q.11's `oldestMin` is derived from `oldestPendingAt`.
 */
export interface SheetsBacklog {
  pending: number;
  dirty: number;
  failed: number;
  oldestPendingAt: string | null;
  lastRunAt: string | null;
  lastRunFailedAt: string | null;
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
/** a store has a handful of targets (one sheet, its pixels, one chat; R2 endpoints and carrier accounts) */
const ROWS_MAX = 100;

export async function integrationHealth(scope: StoreScope): Promise<IntegrationHealthRow[]> {
  const rows = await db
    .select()
    .from(integrationStatus)
    .where(inStore(integrationStatus, scope))
    .orderBy(integrationStatus.kind, integrationStatus.targetId)
    .limit(ROWS_MAX);
  return rows.map((r) => ({
    kind: r.kind,
    targetId: r.targetId,
    state: r.state,
    lastOkAt: iso(r.lastOkAt),
    lastErrorAt: iso(r.lastErrorAt),
    lastErrorCode: r.lastErrorCode,
    lastErrorKey: causeKey(r.lastErrorCode),
    failures: r.failures,
    backlog: r.backlog,
    oldestPendingAt: iso(r.oldestPendingAt),
    updatedAt: r.updatedAt.toISOString(),
  }));
}

export async function sheetsBacklog(scope: StoreScope): Promise<SheetsBacklog> {
  const [byStatus, [dirty], runs] = await Promise.all([
    db
      .select({ status: orders.sheetStatus, n: count(), oldest: min(orders.createdAt) })
      .from(orders)
      .where(whereStore(orders, scope, inArray(orders.sheetStatus, ["pending", "failed"]), eq(orders.isTest, false)))
      .groupBy(orders.sheetStatus),
    db
      .select({ n: count() })
      .from(orders)
      .where(whereStore(orders, scope, gt(orders.sheetDirty, 0), eq(orders.sheetStatus, "synced"), eq(orders.isTest, false))),
    sheetsRunHistory(scope),
  ]);
  const of = (s: "pending" | "failed") => byStatus.find((r) => r.status === s);
  const oldest = byStatus.map((r) => (r.oldest ? new Date(r.oldest).getTime() : Infinity)).reduce((a, b) => Math.min(a, b), Infinity);
  return {
    pending: Number(of("pending")?.n ?? 0),
    dirty: Number(dirty?.n ?? 0),
    failed: Number(of("failed")?.n ?? 0),
    oldestPendingAt: Number.isFinite(oldest) ? new Date(oldest).toISOString() : null,
    ...lastRuns(runs),
  };
}

/** Dead outbox items of the kinds tenants see (`mail` never), kept 30 days (core §H.1); `ob_store_idx`. */
export async function deadDeliveryCount(scope: StoreScope): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(outbox)
    .where(whereStore(outbox, scope, eq(outbox.state, "dead"), inArray(outbox.kind, [...TENANT_OUTBOX_KINDS])));
  return Number(row?.n ?? 0);
}

/** The pulse's `syncFailed` (OPE-§27.3): failed sheet rows (test orders excluded) + dead deliveries. */
export async function syncFailedCount(scope: StoreScope): Promise<number> {
  const [[failed], dead] = await Promise.all([
    db
      .select({ n: count() })
      .from(orders)
      .where(whereStore(orders, scope, eq(orders.sheetStatus, "failed"), eq(orders.isTest, false))),
    deadDeliveryCount(scope),
  ]);
  return Number(failed?.n ?? 0) + dead;
}

/** One store-local day's orders and how many carry a captcha flag (`int:turnstile`). */
export interface CaptchaDay {
  day: string;
  orders: number;
  flagged: number;
}

/** Orders that are not a bot caught by the honeypot (the rule judges real orders only). */
export const NOT_HONEYPOT = sql`NOT JSON_CONTAINS(COALESCE(${orders.flags}, '[]'), '"honeypot"')`;
export const CAPTCHA_FLAGGED = sql`(JSON_CONTAINS(COALESCE(${orders.flags}, '[]'), '"captcha_missing"') OR JSON_CONTAINS(COALESCE(${orders.flags}, '[]'), '"captcha_unverified"'))`;

/**
 * Today so far and yesterday in the store's time zone (`orders_store_created_idx`, two days of the store's own
 * orders), test and honeypot orders excluded: the orders and those flagged `captcha_missing` / `captcha_unverified`
 * (src/lib/orders/risk.ts). Today first.
 */
export async function captchaDays(scope: StoreScope, timeZone: string, now: Date = new Date()): Promise<{ today: CaptchaDay; yesterday: CaptchaDay }> {
  const today = dayKey(now, timeZone);
  const yesterday = addDays(today, -1);
  const todayStart = dayStart(today, timeZone);
  const from = dayStart(yesterday, timeZone);
  const isToday = sql`${orders.createdAt} >= ${todayStart}`;
  const [row] = await db
    .select({
      today: sql<number>`COALESCE(SUM(${isToday}), 0)`,
      todayFlagged: sql<number>`COALESCE(SUM(${isToday} AND ${CAPTCHA_FLAGGED}), 0)`,
      all: count(),
      allFlagged: sql<number>`COALESCE(SUM(${CAPTCHA_FLAGGED}), 0)`,
    })
    .from(orders)
    .where(whereStore(orders, scope, and(gte(orders.createdAt, from), lt(orders.createdAt, now)), eq(orders.isTest, false), NOT_HONEYPOT));
  const t = { orders: Number(row?.today ?? 0), flagged: Number(row?.todayFlagged ?? 0) };
  const all = { orders: Number(row?.all ?? 0), flagged: Number(row?.allFlagged ?? 0) };
  return {
    today: { day: today, ...t },
    yesterday: { day: yesterday, orders: all.orders - t.orders, flagged: all.flagged - t.flagged },
  };
}
