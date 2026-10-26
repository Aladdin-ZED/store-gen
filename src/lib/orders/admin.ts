import "server-only";
/**
 * Store-side order queries & mutations (call through the seam with the right permission): orders list/detail,
 * status updates (mirrored to the sheet), sheet re-sync, abandoned leads, blocklist, per-page order stats and
 * streamed CSV exports (orders, abandoned leads).
 *
 * Multi-tenant (docs/STORE-SAAS.md §E.3, D71; ORD-09 … ORD-15): every function takes the scope first and every
 * predicate carries the store, so another store's order id, lead or blocklist entry answers exactly like a missing
 * one; writes take a `WriteScope`; blocklist rows get `store_id` from the scope only. Customer fields come back
 * through `maskIfImpersonation` (D70, PLA-§7.2): masked under a staff "view as store" scope, unchanged otherwise.
 *
 * CSV (docs/OFFERS.md §G.4): "Variante" is the warehouse order text the Sheet gets (codes, short
 * names, [OFFERT] / [AJOUT] / [UPSELL], « typed values », "|| Commande : …"); "Options (+)" lists
 * what added money ("XL ×2 (+40); Emballage cadeau (+15)") and "SKU" is the Sheets SKU cell.
 */
import { and, count, desc, eq, gte, inArray, isNull, like, lt, lte, ne, or, sql, type SQL } from "drizzle-orm";
import { maskCustomer } from "@/lib/admin-data/mask";
import { affected, auditIn, likeEscape, type Actor } from "@/lib/admin-data/store-audit";
import { db } from "@/lib/db/client";
import { newId } from "@/lib/db/ids";
import { blocklist, leads, orders, pages } from "@/lib/db/schema";
import { normalizePhone, toAsciiDigits } from "@/lib/markets/phone";
import { cleanText, explain, pushOrderStatus, serviceAccountEmail, syncPendingOrders, type SyncResult } from "@/lib/sheets";
import { skuCell, variantCell } from "@/lib/sheets/row";
import { byId, inStore, storeValues, whereStore } from "@/lib/tenancy/sql";
import type { StoreScope, WriteScope } from "@/lib/tenancy/types";
import type { OrderItems } from "@/lib/db/schema";
import { ORDER_STATUSES, type OrderStatus } from "./contract";

export type OrderRecord = typeof orders.$inferSelect;
export type LeadRecord = typeof leads.$inferSelect;
export type BlockRecord = typeof blocklist.$inferSelect;
export type { Actor };
export { maskCustomer };

export const ORDER_STATUS_IDS = ORDER_STATUSES.map((s) => s.id) as OrderStatus[];
export const isOrderStatus = (v: unknown): v is OrderStatus => typeof v === "string" && (ORDER_STATUS_IDS as string[]).includes(v);

export interface Pagination {
  page?: number;
  pageSize?: number;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

const paging = (p: Pagination = {}) => {
  const page = Math.max(1, Math.floor(p.page ?? 1));
  const pageSize = Math.min(200, Math.max(1, Math.floor(p.pageSize ?? 50)));
  return { page, pageSize, offset: (page - 1) * pageSize };
};

/** The order's page, joined inside the same store (an order never shows another store's page name). */
const pageOf = (scope: StoreScope, pageId: typeof orders.pageId | typeof leads.pageId) => and(eq(pages.id, pageId), inStore(pages, scope));

/* ------------------------------------------------------------------ */
/* orders                                                              */
/* ------------------------------------------------------------------ */

export interface OrderFilters {
  /** order id, phone (any format) or customer name */
  q?: string;
  status?: OrderStatus | OrderStatus[];
  pageId?: string;
  from?: Date;
  /** exclusive upper bound */
  to?: Date;
  sheetStatus?: OrderRecord["sheetStatus"];
  /** only orders with riskScore ≥ minRisk */
  minRisk?: number;
  source?: OrderRecord["source"];
}

/** Masked customer fields (impersonation) can't be searched for either: a hit would confirm them. */
const searchesCustomers = (scope: StoreScope) => scope.kind !== "impersonation";

/** The filters' conditions; always combined with the store predicate by the caller (`whereStore`). */
function orderConds(scope: StoreScope, f: OrderFilters): SQL[] {
  const w: SQL[] = [];
  const q = f.q?.trim().slice(0, 80);
  if (q) {
    const digits = toAsciiDigits(q).replace(/[^0-9]/g, "");
    const or_: SQL[] = [eq(orders.id, q.toUpperCase())];
    if (searchesCustomers(scope)) or_.push(like(orders.name, `%${likeEscape(q)}%`));
    // phone search: "0612…" / "+2126…" / "612…" all match the stored E.164
    if (searchesCustomers(scope) && digits.length >= 4) or_.push(like(orders.phone, `%${digits.replace(/^0+/, "")}%`));
    w.push(or(...or_)!);
  }
  if (Array.isArray(f.status)) {
    if (f.status.length) w.push(inArray(orders.status, f.status));
  } else if (f.status) {
    w.push(eq(orders.status, f.status));
  }
  if (f.pageId) w.push(eq(orders.pageId, f.pageId));
  if (f.from) w.push(gte(orders.createdAt, f.from));
  if (f.to) w.push(lt(orders.createdAt, f.to));
  if (f.sheetStatus) w.push(eq(orders.sheetStatus, f.sheetStatus));
  if (typeof f.minRisk === "number") w.push(gte(orders.riskScore, f.minRisk));
  if (f.source) w.push(eq(orders.source, f.source));
  return w;
}

export async function listOrders(scope: StoreScope, filters: OrderFilters = {}, pagination?: Pagination): Promise<Paged<OrderRecord & { pageName: string | null }>> {
  const { page, pageSize, offset } = paging(pagination);
  const conds = orderConds(scope, filters);
  const [rows, [t]] = await Promise.all([
    db
      .select({ order: orders, pageName: pages.name })
      .from(orders)
      .leftJoin(pages, pageOf(scope, orders.pageId))
      .where(whereStore(orders, scope, ...conds))
      .orderBy(desc(orders.createdAt), desc(orders.id))
      .limit(pageSize)
      .offset(offset),
    db.select({ n: count() }).from(orders).where(whereStore(orders, scope, ...conds)),
  ]);
  return { items: rows.map((r) => maskCustomer(scope, { ...r.order, pageName: r.pageName ?? null })), total: Number(t?.n ?? 0), page, pageSize };
}

export interface OrderDetail extends OrderRecord {
  page: { id: string; name: string; slug: string } | null;
  /** other orders of the same phone in this store (newest first, max 20) */
  history: Pick<OrderRecord, "id" | "status" | "total" | "currency" | "createdAt" | "productName">[];
  blocked: { phone: boolean; ip: boolean };
}

/** One order of the store (ORD-10): another store's id is null, like a missing one; the phone history stays in the store. */
export async function getOrder(scope: StoreScope, id: string): Promise<OrderDetail | null> {
  const [row] = await db
    .select({ order: orders, page: { id: pages.id, name: pages.name, slug: pages.slug } })
    .from(orders)
    .leftJoin(pages, pageOf(scope, orders.pageId))
    .where(byId(orders, scope, id))
    .limit(1);
  if (!row) return null;
  const o = row.order;
  const [history, blocks] = await Promise.all([
    db
      .select({
        id: orders.id,
        status: orders.status,
        total: orders.total,
        currency: orders.currency,
        createdAt: orders.createdAt,
        productName: orders.productName,
      })
      .from(orders)
      .where(whereStore(orders, scope, eq(orders.phone, o.phone), ne(orders.id, o.id)))
      .orderBy(desc(orders.createdAt))
      .limit(20),
    db
      .select({ kind: blocklist.kind })
      .from(blocklist)
      .where(
        whereStore(
          blocklist,
          scope,
          or(
            and(eq(blocklist.kind, "phone"), eq(blocklist.value, o.phone)),
            o.ipHash ? and(eq(blocklist.kind, "ip"), eq(blocklist.value, o.ipHash)) : sql`FALSE`,
          ),
        ),
      ),
  ]);
  return maskCustomer(scope, {
    ...o,
    page: row.page?.id ? { id: row.page.id, name: row.page.name, slug: row.page.slug } : null,
    history,
    blocked: { phone: blocks.some((b) => b.kind === "phone"), ip: blocks.some((b) => b.kind === "ip") },
  });
}

export type UpdateStatusResult =
  | { ok: true; sheet: "updated" | "not_found" | "skipped" | "queued" }
  | { ok: false; error: string };

/**
 * Change an order's status. When the order may already be in the connected sheet (synced, or a
 * previous push attempt may have appended it before failing), the sheet cell is written FIRST — even
 * while sync is paused — because the sheet is the source of truth for statuses: if Google fails,
 * nothing changes locally and the French explanation is returned, so the two never diverge.
 * Orders not in the sheet yet keep the change locally ("queued"): their append carries the new status.
 */
export async function updateOrderStatus(scope: WriteScope, id: string, status: OrderStatus, actor: Actor): Promise<UpdateStatusResult> {
  if (!isOrderStatus(status)) return { ok: false, error: "Unknown status." };
  const [o] = await db
    .select({ id: orders.id, status: orders.status, sheetStatus: orders.sheetStatus, sheetAttempts: orders.sheetAttempts })
    .from(orders)
    .where(byId(orders, scope, id))
    .limit(1);
  if (!o) return { ok: false, error: "Order not found." };
  if (o.status === status) return { ok: true, sheet: "skipped" };

  const synced = o.sheetStatus === "synced";
  const mayBeInSheet = synced || (o.sheetStatus !== "disabled" && o.sheetAttempts > 0);
  let sheet: "updated" | "not_found" | "skipped" | "queued" = synced || o.sheetStatus === "disabled" ? "skipped" : "queued";
  if (mayBeInSheet) {
    try {
      const pushed = await pushOrderStatus(scope, id, status);
      if (synced || pushed === "updated") sheet = pushed;
    } catch (err) {
      return { ok: false, error: explain(err, serviceAccountEmail()) };
    }
  }
  const res = await db.update(orders).set({ status, updatedAt: new Date() }).where(byId(orders, scope, id));
  if (affected(res) !== 1) return { ok: false, error: "Order not found." };
  await auditIn(scope, actor, "orders.status_changed", { target: id, meta: { from: o.status, to: status, sheet } });
  return { ok: true, sheet };
}

/** "Resend to sheet": re-queue one order of the store (looked up in the sheet first, so no duplicate row). */
export async function requeueOrderSync(scope: WriteScope, id: string, actor: Actor): Promise<boolean> {
  const res = await db
    .update(orders)
    .set({
      sheetStatus: "pending",
      sheetError: null,
      sheetAttempts: sql`GREATEST(${orders.sheetAttempts}, 1)`,
      updatedAt: new Date(),
    })
    .where(and(byId(orders, scope, id), ne(orders.sheetStatus, "disabled")));
  const ok = affected(res) === 1;
  if (ok) await auditIn(scope, actor, "orders.sheet_requeued", { target: id });
  return ok;
}

/** Re-queue every failed order of the store (ORD-11: never another store's) and run a sync pass now. */
export async function retryFailedSync(scope: WriteScope, actor: Actor): Promise<SyncResult> {
  await db
    .update(orders)
    .set({ sheetStatus: "pending", sheetAttempts: sql`GREATEST(${orders.sheetAttempts}, 1)` })
    .where(whereStore(orders, scope, eq(orders.sheetStatus, "failed")));
  await auditIn(scope, actor, "orders.sheet_retry_all");
  return syncPendingOrders(scope, { force: true, limit: 200 });
}

/**
 * Per-page order counts & revenue by status for a period (excludes honeypot and test orders). Revenue is summed
 * per currency (ORD-12): a page's row carries the revenue of its own currency, never two currencies added up.
 */
export async function orderStatsByPage(
  scope: StoreScope,
  range: { from: Date; to: Date },
): Promise<{ pageId: string; pageName: string | null; currency: string; orders: number; revenue: number; byStatus: Partial<Record<OrderStatus, number>> }[]> {
  const rows = await db
    .select({
      pageId: orders.pageId,
      pageName: pages.name,
      currency: orders.currency,
      status: orders.status,
      n: sql<number>`COUNT(*)`,
      revenue: sql<number>`COALESCE(SUM(${orders.total}), 0)`,
    })
    .from(orders)
    .leftJoin(pages, pageOf(scope, orders.pageId))
    .where(whereStore(orders, scope, gte(orders.createdAt, range.from), lt(orders.createdAt, range.to), ne(orders.sheetStatus, "disabled"), eq(orders.isTest, false)))
    .groupBy(orders.pageId, pages.name, orders.currency, orders.status);
  type Row = { pageId: string; pageName: string | null; currency: string; orders: number; revenue: number; byStatus: Partial<Record<OrderStatus, number>> };
  const out = new Map<string, Row>();
  for (const r of rows) {
    const key = `${r.pageId}:${r.currency}`;
    const e = out.get(key) ?? { pageId: r.pageId, pageName: r.pageName ?? null, currency: r.currency, orders: 0, revenue: 0, byStatus: {} };
    const n = Number(r.n);
    e.orders += n;
    if (r.status !== "cancelled" && r.status !== "fake" && r.status !== "returned") e.revenue += Number(r.revenue);
    if (isOrderStatus(r.status)) e.byStatus[r.status] = (e.byStatus[r.status] ?? 0) + n;
    out.set(key, e);
  }
  return [...out.values()].map((e) => ({ ...e, revenue: Math.round(e.revenue * 100) / 100 })).sort((a, b) => b.orders - a.orders);
}

/* ------------------------------------------------------------------ */
/* leads                                                               */
/* ------------------------------------------------------------------ */

export interface LeadFilters {
  pageId?: string;
  from?: Date;
  to?: Date;
  /** only leads that never became an order (default true) */
  abandonedOnly?: boolean;
  q?: string;
}

function leadConds(scope: StoreScope, filters: LeadFilters): SQL[] {
  const w: SQL[] = [];
  if (filters.abandonedOnly ?? true) w.push(isNull(leads.convertedOrderId));
  if (filters.pageId) w.push(eq(leads.pageId, filters.pageId));
  if (filters.from) w.push(gte(leads.createdAt, filters.from));
  if (filters.to) w.push(lt(leads.createdAt, filters.to));
  const q = filters.q?.trim().slice(0, 80);
  if (q && !searchesCustomers(scope)) w.push(sql`FALSE`);
  else if (q) {
    const digits = toAsciiDigits(q).replace(/[^0-9]/g, "").replace(/^0+/, "");
    w.push(or(like(leads.name, `%${likeEscape(q)}%`), ...(digits.length >= 4 ? [like(leads.phone, `%${digits}%`)] : []))!);
  }
  return w;
}

export async function listLeads(scope: StoreScope, filters: LeadFilters = {}, pagination?: Pagination): Promise<Paged<LeadRecord & { pageName: string | null }>> {
  const { page, pageSize, offset } = paging(pagination);
  const conds = leadConds(scope, filters);
  const [rows, [t]] = await Promise.all([
    db
      .select({ lead: leads, pageName: pages.name })
      .from(leads)
      .leftJoin(pages, pageOf(scope, leads.pageId))
      .where(whereStore(leads, scope, ...conds))
      .orderBy(desc(leads.createdAt))
      .limit(pageSize)
      .offset(offset),
    db.select({ n: count() }).from(leads).where(whereStore(leads, scope, ...conds)),
  ]);
  return { items: rows.map((r) => maskCustomer(scope, { ...r.lead, pageName: r.pageName ?? null })), total: Number(t?.n ?? 0), page, pageSize };
}

/** Housekeeping of one store: its abandoned leads older than `days` (the cron's per-store loop, ORD-13). */
export async function purgeAbandonedLeads(scope: WriteScope, days = 30): Promise<number> {
  const res = await db
    .delete(leads)
    .where(whereStore(leads, scope, isNull(leads.convertedOrderId), lte(leads.createdAt, new Date(Date.now() - days * 86_400_000))));
  return affected(res);
}

/* ------------------------------------------------------------------ */
/* blocklist                                                           */
/* ------------------------------------------------------------------ */

/** The store's own blocklist (ORD-03 / ORD-14: one store blocking a shopper never blocks them elsewhere). */
export async function listBlocklist(scope: StoreScope, pagination?: Pagination): Promise<Paged<BlockRecord>> {
  const { page, pageSize, offset } = paging(pagination);
  const [items, [t]] = await Promise.all([
    db.select().from(blocklist).where(inStore(blocklist, scope)).orderBy(desc(blocklist.createdAt)).limit(pageSize).offset(offset),
    db.select({ n: count() }).from(blocklist).where(inStore(blocklist, scope)),
  ]);
  // a blocked phone is customer data; a hashed IP is not
  const shown = items.map((b) => (b.kind === "phone" ? { ...b, value: maskCustomer(scope, { phone: b.value }).phone ?? b.value } : b));
  return { items: shown, total: Number(t?.n ?? 0), page, pageSize };
}

async function addBlock(scope: WriteScope, kind: "phone" | "ip", value: string, reason: string | null, actor: Actor): Promise<void> {
  const why = reason ? cleanText(reason, 200) : null;
  await db
    .insert(blocklist)
    .values(storeValues(scope, { id: newId(), kind, value, reason: why, createdBy: actor.userId, createdAt: new Date() }))
    .onDuplicateKeyUpdate({ set: { reason: why } });
  await auditIn(scope, actor, "blocklist.added", { target: kind === "phone" ? value : `ip:${value.slice(0, 12)}…` });
}

/** Block a phone number in the store (any common format; validated for `country`). */
export async function blockPhone(
  scope: WriteScope,
  raw: string,
  country: string,
  reason: string | null,
  actor: Actor,
): Promise<{ ok: true; e164: string } | { ok: false; error: string }> {
  const p = normalizePhone(raw, country) ?? (/^\+[1-9][0-9]{6,14}$/.test(raw.trim()) ? { e164: raw.trim() } : null);
  if (!p) return { ok: false, error: "Invalid phone number." };
  await addBlock(scope, "phone", p.e164, reason, actor);
  return { ok: true, e164: p.e164 };
}

/** Block the phone and/or the (hashed) IP of one of the store's orders. */
export async function blockFromOrder(scope: WriteScope, orderId: string, what: { phone?: boolean; ip?: boolean }, reason: string | null, actor: Actor): Promise<boolean> {
  const [o] = await db.select({ phone: orders.phone, ipHash: orders.ipHash }).from(orders).where(byId(orders, scope, orderId)).limit(1);
  if (!o) return false;
  if (what.phone) await addBlock(scope, "phone", o.phone, reason ?? `Commande ${orderId}`, actor);
  if (what.ip && o.ipHash) await addBlock(scope, "ip", o.ipHash, reason ?? `Commande ${orderId}`, actor);
  return true;
}

/** Remove one of the store's blocklist entries (another store's id: false, like a missing one). */
export async function unblock(scope: WriteScope, id: string, actor: Actor): Promise<boolean> {
  const res = await db.delete(blocklist).where(byId(blocklist, scope, id));
  const ok = affected(res) === 1;
  if (ok) await auditIn(scope, actor, "blocklist.removed", { target: id });
  return ok;
}

/* ------------------------------------------------------------------ */
/* CSV export                                                          */
/* ------------------------------------------------------------------ */

const CSV_HEADER = [
  "Order", "Date (UTC)", "Status", "Name", "Phone", "City", "Address", "Product", "Pack", "Variante", "Qty", "Subtotal",
  "Shipping", "Total", "Currency", "Note", "Email", "Page", "Source", "UTM source", "UTM campaign", "Risk", "Flags",
  "Options (+)", "SKU",
];

const plainMoney = (n: number) => String(Math.round(n * 100) / 100);

/** "Options (+)": what added money to the order, one entry per reason ("XL ×2 (+40); Emballage cadeau (+15)"). */
export function surchargesText(items: OrderItems | null | undefined): string {
  return (items?.reasons ?? [])
    .filter((r) => r.amount > 0)
    .map((r) => `${cleanText(r.label, 60)}${r.count > 1 ? ` ×${r.count}` : ""} (+${plainMoney(r.amount)})`)
    .join("; ");
}

/** RFC 4180 field, formula-injection safe (Excel/Sheets): leading = + - @ tab CR get a ' prefix. */
function csvField(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Streamed CSV (UTF-8 with BOM for Excel) of the store's orders matching `filters`, newest first (ORD-15). */
export function ordersCsv(scope: StoreScope, filters: OrderFilters = {}): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  const conds = orderConds(scope, filters);
  let cursor: { createdAt: Date; id: string } | null = null;
  let started = false;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (!started) {
          started = true;
          controller.enqueue(enc.encode(`﻿${CSV_HEADER.join(",")}\r\n`));
          return;
        }
        const c = cursor;
        const after = c ? or(lt(orders.createdAt, c.createdAt), and(eq(orders.createdAt, c.createdAt), lt(orders.id, c.id))) : undefined;
        const rows = await db
          .select({ order: orders, pageName: pages.name })
          .from(orders)
          .leftJoin(pages, pageOf(scope, orders.pageId))
          .where(whereStore(orders, scope, ...conds, after))
          .orderBy(desc(orders.createdAt), desc(orders.id))
          .limit(500);
        if (!rows.length) {
          controller.close();
          return;
        }
        let chunk = "";
        for (const { order, pageName } of rows) {
          const o = maskCustomer(scope, order);
          chunk +=
            [
              o.id,
              o.createdAt.toISOString().replace("T", " ").slice(0, 19),
              ORDER_STATUSES.find((s) => s.id === o.status)?.fr ?? o.status,
              o.name,
              o.phone,
              o.city,
              o.address,
              o.productName,
              o.items.bundleLabel,
              variantCell(o),
              o.qty,
              o.subtotal,
              o.shipping,
              o.total,
              o.currency,
              o.note,
              o.email,
              pageName,
              o.source,
              o.utm?.source,
              o.utm?.campaign,
              o.riskScore,
              (o.flags ?? []).join(" "),
              surchargesText(o.items),
              skuCell(o),
            ]
              .map(csvField)
              .join(",") + "\r\n";
        }
        controller.enqueue(enc.encode(chunk));
        const last = rows[rows.length - 1]!.order;
        cursor = { createdAt: last.createdAt, id: last.id };
      } catch (err) {
        controller.error(err);
      }
    },
  });
}

const LEADS_CSV_HEADER = ["Date (UTC)", "Name", "Phone", "City", "Page", "Pack", "Selection", "UTM source", "UTM campaign", "Order"];

/** Streamed CSV of the store's leads matching `filters` (abandoned only by default), newest first. */
export function leadsCsv(scope: StoreScope, filters: LeadFilters = {}): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  const conds = leadConds(scope, filters);
  let cursor: { createdAt: Date; id: string } | null = null;
  let started = false;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (!started) {
          started = true;
          controller.enqueue(enc.encode(`﻿${LEADS_CSV_HEADER.join(",")}\r\n`));
          return;
        }
        const c = cursor;
        const after = c ? or(lt(leads.createdAt, c.createdAt), and(eq(leads.createdAt, c.createdAt), lt(leads.id, c.id))) : undefined;
        const rows = await db
          .select({ lead: leads, pageName: pages.name })
          .from(leads)
          .leftJoin(pages, pageOf(scope, leads.pageId))
          .where(whereStore(leads, scope, ...conds, after))
          .orderBy(desc(leads.createdAt), desc(leads.id))
          .limit(500);
        if (!rows.length) {
          controller.close();
          return;
        }
        let chunk = "";
        for (const { lead, pageName } of rows) {
          const l = maskCustomer(scope, lead);
          chunk +=
            [
              l.createdAt.toISOString().replace("T", " ").slice(0, 19),
              l.name,
              l.phone,
              l.city,
              pageName,
              l.bundleId,
              l.selection,
              l.utm?.source,
              l.utm?.campaign,
              l.convertedOrderId,
            ]
              .map(csvField)
              .join(",") + "\r\n";
        }
        controller.enqueue(enc.encode(chunk));
        const last = rows[rows.length - 1]!.lead;
        cursor = { createdAt: last.createdAt, id: last.id };
      } catch (err) {
        controller.error(err);
      }
    },
  });
}
