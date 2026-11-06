import "server-only";
/**
 * The read of Connect → Pixels → **Server events** (operations.md OPE-§20.7, §20.3, OD18; core §H.5, §I.8): one call
 * per page render, through the store's scope, each block loaded on its own so one failed read never blanks the
 * others ("error" in its place, an inline retry on the screen).
 *
 * - `conversions`: the store's trigger, custom events, manual orders and per-page overrides (`conversions` setting).
 * - `pages`: the store's pages the overrides can name (archived ones left out), live ones flagged.
 * - `pixels`: per pixel with a server token, the last result from its `integration_status (capi, "<platform>:<id>")`
 *   row and this week's outbox counts (the last 7 days): sent (`done` with a 2xx answer recorded), refused (`dead`,
 *   with the cause code and the platform's own `code …` from the stored error), stale (dropped by the 7-day guard,
 *   `cancelled:stale_event`), each with its n.
 * - `reexport`: connected and PHP exports built before the last trigger change, for pages whose trigger is no longer
 *   `order`: their thank-you page still fires the browser Purchase ("Re-export to apply"; the PHP contract is frozen).
 * - `updating`: the live pages still waiting for their `conversions` re-render (`renderSummary`, core §H.5); null while
 *   the render queue is not built (P8) or cannot be read.
 *
 * No token, test code or customer field leaves this file: labels, masks, counts and cause codes only.
 */
import { count, eq, gte, inArray, isNull, lt, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { exportsTable, outbox, pages, storeSettings } from "@/lib/db/schema";
import { causeKey } from "@/lib/integrations/causes";
import { integrationHealth } from "@/lib/integrations/health";
import { renderSummary } from "@/lib/jobs/renders";
import { triggerFor } from "@/lib/orders/conversions-core";
import { getStoreSetting } from "@/lib/settings";
import type { ConversionsSetting } from "@/lib/settings/keys/conversions";
import { whereStore } from "@/lib/tenancy/sql";
import type { StoreScope } from "@/lib/tenancy/types";
import { isServerPlatform, type ServerPlatform } from "./ids";
import type { LibraryPixel } from "./library";
import { SERVER_EVENTS_WEEK_DAYS, type ReexportRow, type RefusedReason, type ServerEventsPage, type ServerEventsPixel, type ServerEventsView } from "./server-events-shared";

export { OVERRIDES_MAX, PURCHASE_TRIGGERS, SERVER_EVENTS_WEEK_DAYS } from "./server-events-shared";
export type { PurchaseTrigger, ReexportRow, RefusedReason, ServerEventsPage, ServerEventsPixel, ServerEventsView } from "./server-events-shared";
/** a store's pages the override picker lists */
const PAGES_MAX = 500;
const REEXPORT_MAX = 50;

const settled = <T>(r: PromiseSettledResult<T>): T | "error" => (r.status === "fulfilled" ? r.value : "error");

/** The store's pages an override can name (drafts included: an override is kept for when the page goes live). */
export async function conversionPages(scope: StoreScope): Promise<ServerEventsPage[]> {
  const rows = await db
    .select({ id: pages.id, name: pages.name, status: pages.status, versionId: pages.publishedVersionId })
    .from(pages)
    .where(whereStore(pages, scope, ne(pages.status, "archived")))
    .orderBy(pages.name)
    .limit(PAGES_MAX);
  return rows.map((r) => ({ id: r.id, name: r.name, live: r.status === "published" && !!r.versionId }));
}

interface WeekRow {
  targetId: string | null;
  state: string;
  lastStatus: number | null;
  cause: string | null;
  platformCode: string | null;
  stale: number | null;
  n: number;
}

/** Folds the grouped outbox rows of one target into sent / refused / stale with the refusal reasons (pure). */
export function foldWeek(rows: readonly WeekRow[]): { sent: number; refused: number; stale: number; reasons: RefusedReason[] } {
  let sent = 0;
  let refused = 0;
  let stale = 0;
  const reasons = new Map<string, RefusedReason>();
  for (const r of rows) {
    const n = Number(r.n);
    if (r.state === "done" && r.lastStatus !== null && r.lastStatus >= 200 && r.lastStatus < 300) sent += n;
    else if (r.state === "cancelled" && Number(r.stale) === 1) stale += n;
    else if (r.state === "dead") {
      refused += n;
      const code = r.platformCode ? r.platformCode.replace(/^code\s+/, "") : null;
      const key = `${r.cause ?? ""}|${r.lastStatus ?? ""}|${code ?? ""}`;
      const prev = reasons.get(key);
      if (prev) prev.n += n;
      else reasons.set(key, { causeKey: causeKey(r.cause), status: r.lastStatus, platformCode: code, n });
    }
  }
  return { sent, refused, stale, reasons: [...reasons.values()].sort((a, b) => b.n - a.n).slice(0, 3) };
}

/** This week's capi outbox rows of the store, grouped per target, state, status and refusal reason. */
async function weekRows(scope: StoreScope, targets: readonly string[], now: number): Promise<WeekRow[]> {
  if (!targets.length) return [];
  const since = new Date(now - SERVER_EVENTS_WEEK_DAYS * 86_400_000);
  const cause = sql<string | null>`SUBSTRING_INDEX(${outbox.lastError}, ':', 1)`;
  const platformCode = sql<string | null>`REGEXP_SUBSTR(${outbox.lastError}, 'code [0-9]+(/[0-9]+)?')`;
  const stale = sql<number | null>`(${outbox.lastError} LIKE '%stale_event%')`;
  return db
    .select({ targetId: outbox.targetId, state: outbox.state, lastStatus: outbox.lastStatus, cause, platformCode, stale, n: count() })
    .from(outbox)
    .where(whereStore(outbox, scope, eq(outbox.kind, "capi"), inArray(outbox.targetId, [...targets]), gte(outbox.createdAt, since)))
    .groupBy(outbox.targetId, outbox.state, outbox.lastStatus, cause, platformCode, stale)
    .limit(1_000);
}

/** When the `conversions` setting was last written (null: never, so the trigger was always `order`). */
async function conversionsChangedAt(scope: StoreScope): Promise<Date | null> {
  const [row] = await db
    .select({ at: storeSettings.updatedAt })
    .from(storeSettings)
    .where(whereStore(storeSettings, scope, eq(storeSettings.key, "conversions")))
    .limit(1);
  return row?.at ?? null;
}

/** Live exports that still fire the browser Purchase although their page's trigger moved off `order`. */
export async function reexportList(scope: StoreScope, conversions: ConversionsSetting, names: ReadonlyMap<string, string>): Promise<ReexportRow[]> {
  const changedAt = await conversionsChangedAt(scope);
  if (!changedAt) return [];
  const rows = await db
    .select({ id: exportsTable.id, pageId: exportsTable.pageId, mode: exportsTable.mode, createdAt: exportsTable.createdAt })
    .from(exportsTable)
    .where(whereStore(exportsTable, scope, inArray(exportsTable.mode, ["connected", "php"]), isNull(exportsTable.revokedAt), lt(exportsTable.createdAt, changedAt)))
    .orderBy(exportsTable.createdAt)
    .limit(REEXPORT_MAX * 4);
  return rows
    .filter((r) => triggerFor(conversions, r.pageId) !== "order")
    .slice(0, REEXPORT_MAX)
    .map((r) => ({
      id: r.id,
      pageId: r.pageId,
      pageName: names.get(r.pageId) ?? "",
      mode: r.mode as "connected" | "php",
      createdAt: r.createdAt.toISOString(),
    }));
}

/** Live pages still waiting for their `conversions` re-render; null while the render queue cannot answer. */
export async function conversionsUpdating(scope: StoreScope): Promise<number | null> {
  try {
    const s = await renderSummary(scope);
    const row = s.byReason.find((r) => r.reason === "conversions");
    return row ? row.pending + row.running : 0;
  } catch {
    // P8's queue not built yet, or a failed read: the line is simply not shown
    return null;
  }
}

/**
 * The Server-events card's whole read. `library` is the pixel library the page already loaded (its server pixels are
 * the ones with a token saved).
 */
export async function serverEventsView(scope: StoreScope, library: readonly LibraryPixel[], now: number = Date.now()): Promise<ServerEventsView> {
  const server = library.filter((p) => isServerPlatform(p.platform) && p.server);
  const targets = server.map((p) => `${p.platform}:${p.id}`);
  const [conv, pageRows, health, week, updating] = await Promise.allSettled([
    getStoreSetting(scope, "conversions", { fresh: true }),
    conversionPages(scope),
    integrationHealth(scope),
    weekRows(scope, targets, now),
    conversionsUpdating(scope),
  ]);
  const conversions = settled(conv);
  const pageList = settled(pageRows);
  const rows = settled(health);
  const weekAll = settled(week);

  const pixels: ServerEventsPixel[] = server.map((p) => {
    const target = `${p.platform}:${p.id}`;
    const st = rows === "error" ? undefined : rows.find((r) => r.kind === "capi" && r.targetId === target);
    return {
      platform: p.platform as ServerPlatform,
      id: p.id,
      label: p.label,
      status: st ? { state: st.state, lastOkAt: st.lastOkAt, lastErrorAt: st.lastErrorAt, lastErrorKey: st.lastErrorKey, failures: st.failures } : null,
      week: weekAll === "error" ? "error" : foldWeek(weekAll.filter((r) => r.targetId === target)),
      testCode: p.testCode,
    };
  });

  let reexport: ReexportRow[] | "error" = [];
  if (conversions === "error") reexport = "error";
  else {
    const names = new Map(pageList === "error" ? [] : pageList.map((p) => [p.id, p.name] as const));
    reexport = await reexportList(scope, conversions, names).catch(() => "error" as const);
  }

  return {
    conversions,
    pages: pageList,
    pixels,
    reexport,
    updating: updating.status === "fulfilled" ? updating.value : null,
  };
}
