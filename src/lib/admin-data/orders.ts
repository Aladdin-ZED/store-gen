import "server-only";
/**
 * Orders screen helpers on top of @/lib/orders: URL filters → OrderFilters (store-day ranges),
 * status counts for the filter chips, and serializable rows / details for client components.
 *
 * Multi-tenant (docs/STORE-SAAS.md §E.3, ADM-22, ADM-23): counts and details are the scope's store only (another
 * store's order id answers like a missing one) and day ranges use the store's time zone, never the platform's.
 */
import { count, eq, gte, isNull, lt, type SQL } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { blocklist, leads, orders, pageVersions } from "@/lib/db/schema";
import { orderView, type OrderView, type SwatchOf } from "@/components/admin/orders/parts";
import type { OrderItems } from "@/lib/db/schema";
import { getOrder, isOrderStatus, type OrderFilters, type OrderRecord } from "@/lib/orders";
import type { OrderStatus } from "@/lib/orders/contract";
import { optionText, sanitizeLabel } from "@/lib/orders/text";
import { orderDocOf } from "@/lib/orders/versions";
import { byId, inStore, whereStore } from "@/lib/tenancy/sql";
import type { StoreScope } from "@/lib/tenancy/types";
import { isChoiceGroup, isMatrixGroup, type PageDoc } from "@/lib/page/schema";
import { orderTextOf } from "@/lib/sheets/row";
import { addDays, dayKey, dayStart, isDay } from "./time";

export type RangeKey = "today" | "7d" | "30d" | "90d" | "all" | "custom";
export const RANGE_KEYS: RangeKey[] = ["today", "7d", "30d", "90d", "all", "custom"];

export interface OrderQuery {
  q: string;
  status: OrderStatus | null;
  pageId: string | null;
  range: RangeKey;
  from: string | null;
  to: string | null;
  sheet: "failed" | "pending" | null;
  risky: boolean;
  page: number;
}

const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;
type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** Read and sanitize the orders URL (every value is whitelisted or pattern-checked). */
export function parseOrderQuery(sp: Params): OrderQuery {
  const status = one(sp.status);
  const range = one(sp.range) as RangeKey;
  const sheet = one(sp.sheet);
  const from = one(sp.from);
  const to = one(sp.to);
  return {
    q: one(sp.q).trim().slice(0, 80),
    status: isOrderStatus(status) ? status : null,
    pageId: ULID.test(one(sp.page_id)) ? one(sp.page_id) : null,
    range: RANGE_KEYS.includes(range) ? range : "all",
    from: isDay(from) ? from : null,
    to: isDay(to) ? to : null,
    sheet: sheet === "failed" || sheet === "pending" ? sheet : null,
    risky: one(sp.risky) === "1",
    page: Math.max(1, Math.min(100_000, Number.parseInt(one(sp.page), 10) || 1)),
  };
}

/** [from, to) instants of a range in the store's time zone (`stores.timezone`, ADM-23). */
export function rangeBounds(q: Pick<OrderQuery, "range" | "from" | "to">, timeZone: string): { from?: Date; to?: Date } {
  const today = dayKey(new Date(), timeZone);
  const start = (day: string) => dayStart(day, timeZone);
  switch (q.range) {
    case "today":
      return { from: start(today) };
    case "7d":
      return { from: start(addDays(today, -6)) };
    case "30d":
      return { from: start(addDays(today, -29)) };
    case "90d":
      return { from: start(addDays(today, -89)) };
    case "custom": {
      const [a, b] = q.from && q.to && q.from > q.to ? [q.to, q.from] : [q.from, q.to];
      return { from: a ? start(a) : undefined, to: b ? start(addDays(b, 1)) : undefined };
    }
    default:
      return {};
  }
}

export function toOrderFilters(q: OrderQuery, timeZone: string): OrderFilters {
  const { from, to } = rangeBounds(q, timeZone);
  return {
    q: q.q || undefined,
    status: q.status ?? undefined,
    pageId: q.pageId ?? undefined,
    from,
    to,
    sheetStatus: q.sheet ?? undefined,
    minRisk: q.risky ? 30 : undefined,
  };
}

/** The store's orders per status inside the current range / page filter (chips). */
export async function statusCounts(scope: StoreScope, q: OrderQuery, timeZone: string): Promise<Record<string, number> & { all: number }> {
  const { from, to } = rangeBounds(q, timeZone);
  const where: SQL[] = [];
  if (from) where.push(gte(orders.createdAt, from));
  if (to) where.push(lt(orders.createdAt, to));
  if (q.pageId) where.push(eq(orders.pageId, q.pageId));
  const rows = await db
    .select({ status: orders.status, n: count() })
    .from(orders)
    .where(whereStore(orders, scope, ...where))
    .groupBy(orders.status);
  const out: Record<string, number> & { all: number } = { all: 0 };
  for (const r of rows) {
    out[r.status] = Number(r.n);
    out.all += Number(r.n);
  }
  return out;
}

/** The store's tab badges: orders, abandoned leads, blocklist entries. */
export async function tabCounts(scope: StoreScope): Promise<{ orders: number; leads: number; blocked: number }> {
  const [[o], [l], [b]] = await Promise.all([
    db.select({ n: count() }).from(orders).where(inStore(orders, scope)),
    db.select({ n: count() }).from(leads).where(whereStore(leads, scope, isNull(leads.convertedOrderId))),
    db.select({ n: count() }).from(blocklist).where(inStore(blocklist, scope)),
  ]);
  return { orders: Number(o?.n ?? 0), leads: Number(l?.n ?? 0), blocked: Number(b?.n ?? 0) };
}

/* ------------------------------------------------------------------ */
/* serializable shapes                                                 */
/* ------------------------------------------------------------------ */

export interface OrderRow {
  id: string;
  createdAt: string;
  status: string;
  name: string;
  phone: string;
  city: string | null;
  productName: string;
  bundleLabel: string;
  /** what the order contains in one line, customer wording ("1 × Jour + 1 × Nuit", "2 × Noir/M + Beige/L"); "" when there is nothing to say */
  options: string;
  qty: number;
  total: number;
  currency: string;
  pageName: string | null;
  source: "live" | "export" | "php";
  sheetStatus: "pending" | "synced" | "failed" | "disabled";
  riskScore: number;
  flags: string[];
}

export function toOrderRow(o: OrderRecord & { pageName: string | null }): OrderRow {
  return {
    id: o.id,
    createdAt: o.createdAt.toISOString(),
    status: o.status,
    name: o.name,
    phone: o.phone,
    city: o.city,
    productName: o.productName,
    bundleLabel: o.items?.bundleLabel ?? "",
    options: orderTextOf(o.items, { mode: "customer", max: 240 }),
    qty: o.qty,
    total: Number(o.total),
    currency: o.currency,
    pageName: o.pageName,
    source: o.source,
    sheetStatus: o.sheetStatus,
    riskScore: o.riskScore,
    flags: o.flags ?? [],
  };
}

export interface OrderDetailJson extends OrderRow {
  updatedAt: string;
  address: string | null;
  note: string | null;
  email: string | null;
  locale: string | null;
  subtotal: number;
  shipping: number;
  items: {
    bundleLabel: string;
    qty: number;
    unitPrice: number;
    variants: Record<string, string>[];
    bump: { title: string; price: number } | null;
    upsell: { title: string; price: number } | null;
    /** v2 rows: the offer price, Σ surcharges, and what added money */
    price: number | null;
    deltas: number | null;
    reasons: { label: string; count: number; amount: number }[];
  };
  /** the pieces, grouped (§G.4 drawer): items, options, typed values, gift, bump, upsell, order choices */
  view: OrderView;
  /** the Variante cell the warehouse gets (codes, markers) */
  warehouseText: string;
  utm: Record<string, string>;
  ref: string | null;
  sheetAttempts: number;
  sheetError: string | null;
  page: { id: string; name: string; slug: string } | null;
  history: { id: string; status: string; total: number; currency: string; createdAt: string; productName: string }[];
  blocked: { phone: boolean; ip: boolean };
  hasIp: boolean;
}

/** One order of the store for the drawer (null: missing or another store's; customer fields masked like getOrder). */
export async function orderDetailJson(scope: StoreScope, id: string): Promise<OrderDetailJson | null> {
  const o = await getOrder(scope, id);
  if (!o) return null;
  return {
    ...toOrderRow({ ...o, pageName: o.page?.name ?? null }),
    updatedAt: o.updatedAt.toISOString(),
    address: o.address,
    note: o.note,
    email: o.email,
    locale: o.locale,
    subtotal: Number(o.subtotal),
    shipping: Number(o.shipping),
    items: {
      bundleLabel: o.items.bundleLabel,
      qty: o.items.qty,
      unitPrice: Number(o.items.unitPrice),
      variants: o.items.variants ?? [],
      bump: o.items.bump ? { title: o.items.bump.title, price: o.items.bump.price } : null,
      upsell: o.items.upsell ? { title: o.items.upsell.title, price: o.items.upsell.price } : null,
      price: typeof o.items.price === "number" ? o.items.price : null,
      deltas: typeof o.items.deltas === "number" ? o.items.deltas : null,
      reasons: o.items.reasons ?? [],
    },
    view: orderView(o.items, { swatchOf: await swatches(scope, o.versionId, o.items) }),
    warehouseText: orderTextOf(o.items, { mode: "warehouse", orderId: o.id }),
    utm: o.utm ?? {},
    ref: o.ref,
    sheetAttempts: o.sheetAttempts,
    sheetError: o.sheetError,
    page: o.page,
    history: o.history.map((h) => ({
      id: h.id,
      status: h.status,
      total: Number(h.total),
      currency: h.currency,
      createdAt: h.createdAt.toISOString(),
      productName: h.productName,
    })),
    blocked: o.blocked,
    hasIp: !!o.ipHash,
  };
}

/**
 * Swatch colours of the options an order shows, read from the store's version it was validated against
 * (best effort: a snapshot label is matched back to its option; no version → no dots).
 */
async function swatches(scope: StoreScope, versionId: string | null, items: OrderItems): Promise<SwatchOf | undefined> {
  if (!versionId || !(items.units?.length || items.variants?.length || items.bump?.unit)) return undefined;
  const doc = await versionDocIn(scope, versionId).catch(() => null);
  return doc ? swatchesOf(doc) : undefined;
}

/** The document of one of the store's versions (repaired like the order path reads it), or null. */
async function versionDocIn(scope: StoreScope, versionId: string): Promise<PageDoc | null> {
  const [row] = await db.select({ doc: pageVersions.doc }).from(pageVersions).where(byId(pageVersions, scope, versionId)).limit(1);
  return row ? orderDocOf(row.doc, versionId) : null;
}

export function swatchesOf(doc: Pick<PageDoc, "items">): SwatchOf {
  const byId = new Map(doc.items.map((it) => [it.id, it]));
  return (unit, option) => {
    const item = byId.get(unit.item) ?? (unit.item === "main" ? doc.items[0] : undefined);
    if (!item) return undefined;
    for (const g of item.groups) {
      if (sanitizeLabel(g.name) !== option.name) continue;
      if (isChoiceGroup(g)) {
        const o = g.options.find((x) => optionText(g.name, x.label) === option.value);
        if (o?.swatch) return o.swatch;
      } else if (isMatrixGroup(g)) {
        const parts = option.value.split("/");
        if (parts.length !== g.dims.length) continue;
        for (let i = 0; i < g.dims.length; i++) {
          const d = g.dims[i]!;
          const v = d.values.find((x) => optionText(d.name, x.label) === parts[i]);
          if (v?.swatch) return v.swatch;
        }
      }
    }
    return undefined;
  };
}

export interface LeadRow {
  id: string;
  createdAt: string;
  name: string | null;
  phone: string;
  city: string | null;
  bundleId: string | null;
  /** warehouse text of what the visitor had chosen (v2 runtimes), else null */
  selection: string | null;
  pageName: string | null;
  utmSource: string | null;
}

export function toLeadRow(l: {
  id: string;
  createdAt: Date;
  name: string | null;
  phone: string;
  city: string | null;
  bundleId: string | null;
  selection?: string | null;
  pageName: string | null;
  utm: Record<string, string> | null;
}): LeadRow {
  return {
    id: l.id,
    createdAt: l.createdAt.toISOString(),
    name: l.name,
    phone: l.phone,
    city: l.city,
    bundleId: l.bundleId,
    selection: l.selection ?? null,
    pageName: l.pageName,
    utmSource: l.utm?.source ?? null,
  };
}

export interface BlockRow {
  id: string;
  kind: "phone" | "ip";
  /** E.164 phone, or a short fingerprint of the hashed IP (never the hash itself) */
  value: string;
  reason: string | null;
  createdAt: string;
}

export function toBlockRow(b: { id: string; kind: "phone" | "ip"; value: string; reason: string | null; createdAt: Date }): BlockRow {
  return {
    id: b.id,
    kind: b.kind,
    value: b.kind === "phone" ? b.value : `Network #${b.value.slice(0, 8)}`,
    reason: b.reason,
    createdAt: b.createdAt.toISOString(),
  };
}
