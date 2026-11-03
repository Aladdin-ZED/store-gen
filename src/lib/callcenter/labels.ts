import "server-only";
/**
 * Sheet agent labels (P4 CALL CENTER; operations.md OD54, OPE-§14.1 "Agents named in your sheet", §14.2, §19.6, §L):
 * a team that confirms in the Google Sheet writes its agent's name in the optional "Agent" column; the pull stores it
 * in `orders.confirmed_by_label` while the label is unmapped and writes `confirmed_by` once a manager mapped it to a
 * member (`ops.agentLabels`, ≤ 50 labels, label ≤ 60 characters).
 *
 *   mapAgentLabel         callcenter.configure: label → member (a member who takes calls), the setting only
 *   backfillMappedLabel   the mapping's `after()` work: one UPDATE of the last 90 days (≤ 5,000 orders,
 *                         `orders_store_created_idx`) where `confirmed_by IS NULL AND confirmed_by_label = label`, one
 *                         `assigned` event per touched order (`by: "label_map"`), the 14-day rollup re-run, then the
 *                         audit row `callcenter.label_mapped { label, count }` (core §F.5). Idempotent: a second run
 *                         finds nothing left to touch.
 *   unmapAgentLabel       the label leaves the map; the confirmations already attributed stay with the member
 *   sheetAgents           the board's "Agents named in your sheet": labels of the last 28 store-local days with no
 *                         mapped member, decided / confirmed and the confirmation rate (n ≥ 20, OD17), cached 60 s
 *   labelsByMember        the agents screen's chips: the labels mapped to each member
 *
 * A test or honeypot order is never counted, and a label never reaches `agent_stats_daily` (whose user is a member).
 */
import { eq, gte, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { orders, storeMembers } from "@/lib/db/schema";
import { auditFrom } from "@/lib/audit";
import { can } from "@/lib/auth/permissions";
import { settingsActor } from "@/lib/admin-data/store-audit";
import { appendEvents, type NewOrderEvent } from "@/lib/orders/events";
import { markHealthDirty } from "@/lib/platform/health-snapshot";
import { getStoreSetting, updateStoreSetting } from "@/lib/settings";
import { scopedCache } from "@/lib/tenancy/cache";
import { whereStore } from "@/lib/tenancy/sql";
import type { ActionResult, StoreScope, WriteCtx } from "@/lib/tenancy/types";
import { notHoneypot, spanOf, storeTz, trailingDays } from "./insights-sql";
import { forgetAgentKpis, rollupAgentStats } from "./kpis.server";
import { KPI_MIN, rateKpi, type Kpi } from "./kpis";
import { opsNow } from "./presence";

export const LABELS_MAX = 50;
export const LABEL_MAX_CHARS = 60;
export const BACKFILL_DAYS = 90;
export const BACKFILL_MAX = 5_000;
const DAY_MS = 86_400_000;
const ID26_RE = /^[0-9A-Z]{26}$/;

/** A sheet label as the pull stores it: trimmed, inner whitespace collapsed, ≤ 60 characters; null when empty. */
export function normalizeLabel(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return v && v.length <= LABEL_MAX_CHARS ? v : null;
}

/** The member may take calls in this store (an active membership whose role holds agents.self). */
async function callTaker(scope: StoreScope, userId: string): Promise<boolean> {
  if (!ID26_RE.test(userId)) return false;
  const [m] = await db
    .select({ role: storeMembers.role })
    .from(storeMembers)
    .where(whereStore(storeMembers, scope, eq(storeMembers.userId, userId), eq(storeMembers.status, "active")))
    .limit(1);
  return !!m && can(m.role, "agents.self");
}

/** callcenter.configure: "Map to a member…" writes `ops.agentLabels[label] = userId` (the backfill follows in after()). */
export async function mapAgentLabel(ctx: WriteCtx, rawLabel: unknown, userId: string): Promise<ActionResult<{ label: string; userId: string }>> {
  if (!ctx.can("callcenter.configure")) return { ok: false, error: "forbidden" };
  const label = normalizeLabel(rawLabel);
  if (!label) return { ok: false, error: "invalid" };
  if (!(await callTaker(ctx.scope, userId))) return { ok: false, error: "not_found" };
  let over = false;
  await updateStoreSetting(
    ctx.scope,
    "ops",
    (current) => {
      const next = { ...current.agentLabels, [label]: userId };
      over = Object.keys(next).length > LABELS_MAX;
      return over ? {} : { agentLabels: next };
    },
    settingsActor(ctx.actor),
  );
  if (over) return { ok: false, error: "limit" };
  forgetSheetAgents(ctx.scope);
  await markHealthDirty(ctx.store.id);
  return { ok: true, data: { label, userId } };
}

/** callcenter.configure: the label leaves the map (orders already attributed keep their member). */
export async function unmapAgentLabel(ctx: WriteCtx, rawLabel: unknown): Promise<ActionResult<{ label: string; removed: boolean }>> {
  if (!ctx.can("callcenter.configure")) return { ok: false, error: "forbidden" };
  const label = normalizeLabel(rawLabel);
  if (!label) return { ok: false, error: "invalid" };
  let removed = false;
  await updateStoreSetting(
    ctx.scope,
    "ops",
    (current) => {
      if (!(label in current.agentLabels)) return {};
      removed = true;
      const next = { ...current.agentLabels };
      delete next[label];
      return { agentLabels: next };
    },
    settingsActor(ctx.actor),
  );
  if (removed) {
    await auditFrom(ctx, "callcenter.label_unmapped", { target: label.slice(0, 60), meta: { label } });
    forgetSheetAgents(ctx.scope);
    await markHealthDirty(ctx.store.id);
  }
  return { ok: true, data: { label, removed } };
}

/**
 * The mapping's backfill (OPE-§19.6, run in `after()` by the action, or by the DB suite directly): the orders of the
 * last 90 days the sheet confirmed under `label` and nobody owns yet get `confirmed_by = userId`, one `assigned`
 * event each (`by: "label_map"`, the manager as actor); then the 14-day rollup and the audit row with the count.
 * A mapping changed meanwhile (the label now names someone else, or nobody) touches nothing.
 */
export async function backfillMappedLabel(ctx: WriteCtx, rawLabel: unknown, userId: string): Promise<{ count: number }> {
  const label = normalizeLabel(rawLabel);
  if (!label || !ID26_RE.test(userId)) return { count: 0 };
  const ops = await getStoreSetting(ctx.scope, "ops", { fresh: true });
  if (ops.agentLabels[label] !== userId) return { count: 0 };
  const since = new Date(opsNow().getTime() - BACKFILL_DAYS * DAY_MS);
  const touched = await db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: orders.id })
      .from(orders)
      .where(whereStore(orders, ctx.scope, gte(orders.createdAt, since), isNull(orders.confirmedBy), eq(orders.confirmedByLabel, label), eq(orders.isTest, false)))
      .limit(BACKFILL_MAX)
      .for("update");
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    for (let i = 0; i < ids.length; i += 500) {
      await tx
        .update(orders)
        .set({ confirmedBy: userId })
        .where(whereStore(orders, ctx.scope, inArray(orders.id, ids.slice(i, i + 500)), isNull(orders.confirmedBy)));
    }
    const events: NewOrderEvent[] = ids.map((id) => ({ orderId: id, actorKind: "user", actorId: ctx.user.id, type: "assigned", meta: { to: userId, by: "label_map" } }));
    await appendEvents(tx, ctx.scope, events);
    return ids;
  });
  if (touched.length) await rollupAgentStats(ctx.scope);
  forgetAgentKpis(ctx.scope);
  forgetSheetAgents(ctx.scope);
  await auditFrom(ctx, "callcenter.label_mapped", { target: userId, meta: { label, count: touched.length } });
  return { count: touched.length };
}

/** The labels mapped to each member (the agents screen's chips), sorted. */
export async function labelsByMember(scope: StoreScope): Promise<Record<string, string[]>> {
  const ops = await getStoreSetting(scope, "ops");
  const out: Record<string, string[]> = {};
  for (const [label, uid] of Object.entries(ops.agentLabels)) (out[uid] ??= []).push(label);
  for (const list of Object.values(out)) list.sort((a, b) => a.localeCompare(b));
  return out;
}

/* ------------------------------------------------------------------ */
/* the board's "Agents named in your sheet"                            */
/* ------------------------------------------------------------------ */

export interface SheetAgentRow {
  label: string;
  decided: number;
  confirmed: number;
  /** confirmed ÷ (confirmed + cancelled + unreachable), n ≥ 20 (OD17) */
  confirmationRate: Kpi;
}

const sheetCache = scopedCache<SheetAgentRow[]>({ name: "ops-sheet-agents", maxEntries: 4_000, ttlMs: 60_000 });
const DECIDED = ["confirmed", "cancelled", "unreachable", "fake", "duplicate"] as const;

/** Unmapped labels of the last 28 store-local days (orders placed in the range), most decided first; cached 60 s. */
export async function sheetAgents(scope: StoreScope): Promise<SheetAgentRow[]> {
  return sheetCache.getOrLoad(scope.storeId, "28", async () => {
    const [tz, ops] = await Promise.all([storeTz(scope), getStoreSetting(scope, "ops")]);
    const { from, to } = spanOf(trailingDays(tz, opsNow(), 28));
    const rows = await db
      .select({
        label: orders.confirmedByLabel,
        decided: sql<number>`SUM(${orders.confirmState} IN (${sql.join(
          DECIDED.map((s) => sql`${s}`),
          sql`, `,
        )}))`,
        confirmed: sql<number>`SUM(${orders.confirmState} = 'confirmed')`,
        cancelled: sql<number>`SUM(${orders.confirmState} = 'cancelled')`,
        unreachable: sql<number>`SUM(${orders.confirmState} = 'unreachable')`,
      })
      .from(orders)
      .where(
        whereStore(
          orders,
          scope,
          gte(orders.createdAt, from),
          sql`${orders.createdAt} < ${to}`,
          isNotNull(orders.confirmedByLabel),
          isNull(orders.confirmedBy),
          eq(orders.isTest, false),
          notHoneypot,
        ),
      )
      .groupBy(orders.confirmedByLabel)
      .limit(200);
    const n = (v: unknown) => Number(v ?? 0) || 0;
    return rows
      .filter((r): r is typeof r & { label: string } => !!r.label && !(r.label in ops.agentLabels))
      .map((r) => {
        const confirmed = n(r.confirmed);
        return { label: r.label, decided: n(r.decided), confirmed, confirmationRate: rateKpi(confirmed, confirmed + n(r.cancelled) + n(r.unreachable), KPI_MIN.agent) };
      })
      .sort((a, b) => b.decided - a.decided || a.label.localeCompare(b.label));
  });
}

/** Forget the cached sheet-agents table of a store (a mapping; tests). */
export function forgetSheetAgents(scope: StoreScope): void {
  sheetCache.delete(scope.storeId);
}

/** The orders a mapping would backfill now (the "Map to a member…" sheet's count), test orders apart. */
export async function backfillPreview(scope: StoreScope, rawLabel: unknown): Promise<number> {
  const label = normalizeLabel(rawLabel);
  if (!label) return 0;
  const since = new Date(opsNow().getTime() - BACKFILL_DAYS * DAY_MS);
  const [r] = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(orders)
    .where(whereStore(orders, scope, gte(orders.createdAt, since), isNull(orders.confirmedBy), eq(orders.confirmedByLabel, label), eq(orders.isTest, false)));
  return Math.min(BACKFILL_MAX, Number(r?.n ?? 0) || 0);
}

