import "server-only";
/**
 * Orders screen helpers on top of @/lib/orders: URL filters → OrderFilters (store-day ranges),
 * status counts for the filter chips, and serializable rows / details for client components.
 *
 * Multi-tenant (docs/STORE-SAAS.md §E.3, ADM-22, ADM-23): counts and details are the scope's store only (another
 * store's order id answers like a missing one) and day ranges use the store's time zone, never the platform's.
 */
import { count, desc, eq, gte, inArray, isNull, lt, type SQL } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { blocklist, leads, orderEvents, orders, pageVersions, storeMembers, users } from "@/lib/db/schema";
import { orderView, type OrderView, type SwatchOf } from "@/components/admin/orders/parts";
import type { OrderItems, OrderSource } from "@/lib/db/schema";
import { getOrder, isOrderStatus, type OrderFilters, type OrderRecord } from "@/lib/orders";
import { listSavedViews, memberNames, type ListViewer, type OrderList, type SavedViewRow } from "@/lib/orders/admin";
import { normalizeCity } from "@/lib/orders/address";
import { builtinView, ORDER_SORTS, ORDER_SOURCES, OrderQuery as SavedOrderQuery, type BuiltinViewId, type OrderSort } from "@/lib/callcenter/views";
import { CONFIRM_STATES, MONEY_STATES, RETURN_REASONS, SHIP_STATES, type ConfirmState, type MoneyState, type ReturnReason, type ShipState } from "@/lib/orders/state";
import type { OrderStatus } from "@/lib/orders/contract";
import { optionText, sanitizeLabel } from "@/lib/orders/text";
import { orderDocOf } from "@/lib/orders/versions";
import { byId, inStore, whereStore } from "@/lib/tenancy/sql";
import type { StoreCtx, StoreScope } from "@/lib/tenancy/types";
import { buildQueueOrder, cardRow, type QueueOrder } from "@/lib/callcenter/card";
import type { CompiledScript } from "@/lib/callcenter/script";
import { isPinned } from "@/lib/callcenter/priority";
import { viewerSeesOrder } from "@/lib/callcenter/visibility";
import { orderTimeline, viewerOf, type TimelineItem } from "@/lib/orders/events";
import { maskPhone } from "@/lib/orders/masking";
import type { OrderStates } from "@/lib/orders/state";
import { getStoreSetting } from "@/lib/settings";
import { isChoiceGroup, isMatrixGroup, type PageDoc } from "@/lib/page/schema";
import { orderTextOf } from "@/lib/sheets/row";
import { addDays, dayKey, dayStart, isDay } from "./time";
import { orderItemsView } from "@/lib/orders/items-v3";
import { isLandingDoc } from "@/storefront/schema";

export type RangeKey = "today" | "7d" | "30d" | "90d" | "all" | "custom";
export const RANGE_KEYS: RangeKey[] = ["today", "7d", "30d", "90d", "all", "custom"];

export interface OrderQuery {
  q: string;
  status: OrderStatus | null;
  pageId: string | null;
  range: RangeKey;
  from: string | null;
  to: string | null;
  sheet: "failed" | "pending" | "synced" | null;
  risky: boolean;
  page: number;
  // P4 step 6 (OPE-§12.2): the axes, the views and the rev 3 keys; null / [] = not filtered
  view: BuiltinViewId | null;
  confirm: ConfirmState[];
  ship: ShipState[];
  money: MoneyState[];
  /** a member id, "none" or "me" */
  assignee: string | null;
  confirmedBy: string | null;
  cityKey: string | null;
  source: OrderSource[];
  minRisk: number | null;
  /** an ISO instant */
  dueBefore: string | null;
  test: boolean | null;
  hold: "active" | "none" | null;
  returnReason: ReturnReason[];
  tracking: string | null;
  carrierLabel: string | null;
  agentLabel: string | null;
  sort: OrderSort | null;
  /** the keyset cursor (`next` of the previous page) */
  after: string | null;
}

const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;
type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
/** a comma list of whitelisted values ("confirm=new,attempting"); unknown values are dropped */
const list = <T extends string>(v: string | string[] | undefined, allowed: readonly T[]): T[] =>
  [...new Set(one(v).split(","))].filter((x): x is T => (allowed as readonly string[]).includes(x)).slice(0, allowed.length);
const CONTROL = /[\u0000-\u001f\u007f]/g;
const text = (v: string | string[] | undefined, max: number) => one(v).replace(CONTROL, "").trim().slice(0, max) || null;
const CITY_KEY = /^(?:[a-z0-9]+(?:-[a-z0-9]+)*|\*)$/;

/**
 * The URL keys of the orders list (`useQueryState`; a view is a shareable link): q, status, page_id, range, from, to,
 * sheet, risky, page (R1.0's), and view, confirm, ship, money, assignee, confirmed_by, city, source, min_risk,
 * due_before, test, hold, return_reason, tracking, carrier, agent_label, sort, after (OPE-§12.2).
 */
export const ORDER_URL_KEYS = [
  "q", "status", "page_id", "range", "from", "to", "sheet", "risky", "page", "view", "confirm", "ship", "money", "assignee", "confirmed_by",
  "city", "source", "min_risk", "due_before", "test", "hold", "return_reason", "tracking", "carrier", "agent_label", "sort", "after",
] as const;

/** Read and sanitize the orders URL (every value is whitelisted or pattern-checked). */
export function parseOrderQuery(sp: Params): OrderQuery {
  const status = one(sp.status);
  const range = one(sp.range) as RangeKey;
  const sheet = one(sp.sheet);
  const from = one(sp.from);
  const to = one(sp.to);
  const assignee = one(sp.assignee);
  const minRisk = Number.parseInt(one(sp.min_risk), 10);
  const due = one(sp.due_before);
  const test = one(sp.test);
  const hold = one(sp.hold);
  const sort = one(sp.sort);
  const after = one(sp.after);
  const city = one(sp.city);
  return {
    q: one(sp.q).trim().slice(0, 80),
    status: isOrderStatus(status) ? status : null,
    pageId: ULID.test(one(sp.page_id)) ? one(sp.page_id) : null,
    range: RANGE_KEYS.includes(range) ? range : "all",
    from: isDay(from) ? from : null,
    to: isDay(to) ? to : null,
    sheet: sheet === "failed" || sheet === "pending" || sheet === "synced" ? sheet : null,
    risky: one(sp.risky) === "1",
    page: Math.max(1, Math.min(100_000, Number.parseInt(one(sp.page), 10) || 1)),
    view: builtinView(one(sp.view))?.id ?? null,
    confirm: list(sp.confirm, CONFIRM_STATES),
    ship: list(sp.ship, SHIP_STATES),
    money: list(sp.money, MONEY_STATES),
    assignee: assignee === "me" || assignee === "none" || ULID.test(assignee) ? assignee : null,
    confirmedBy: ULID.test(one(sp.confirmed_by)) ? one(sp.confirmed_by) : null,
    cityKey: CITY_KEY.test(city) && city.length <= 40 ? city : null,
    source: list(sp.source, ORDER_SOURCES),
    minRisk: Number.isInteger(minRisk) && minRisk >= 0 && minRisk <= 100 ? minRisk : null,
    dueBefore: /^\d{4}-\d{2}-\d{2}T/.test(due) && !Number.isNaN(Date.parse(due)) ? new Date(due).toISOString() : null,
    test: test === "1" ? true : test === "0" ? false : null,
    hold: hold === "active" || hold === "none" ? hold : null,
    returnReason: list(sp.return_reason, RETURN_REASONS),
    tracking: text(sp.tracking, 64),
    carrierLabel: text(sp.carrier, 60),
    agentLabel: text(sp.agent_label, 60),
    sort: (ORDER_SORTS as readonly string[]).includes(sort) ? (sort as OrderSort) : null,
    after: /^[A-Za-z0-9_-]{8,200}$/.test(after) ? after : null,
  };
}

/** The URL of a query (the keys `parseOrderQuery` reads; empty values left out), e.g. a saved view's link. */
export function orderQueryParams(q: Partial<OrderQuery>): URLSearchParams {
  const p = new URLSearchParams();
  const put = (k: string, v: string | number | boolean | null | undefined | readonly string[]) => {
    if (v === null || v === undefined || v === "" || (Array.isArray(v) && !v.length)) return;
    p.set(k, Array.isArray(v) ? v.join(",") : typeof v === "boolean" ? (v ? "1" : "0") : String(v));
  };
  put("view", q.view);
  put("q", q.q);
  put("status", q.status);
  put("page_id", q.pageId);
  if (q.range && q.range !== "all") put("range", q.range);
  put("from", q.from);
  put("to", q.to);
  put("sheet", q.sheet);
  if (q.risky) put("risky", "1");
  put("confirm", q.confirm);
  put("ship", q.ship);
  put("money", q.money);
  put("assignee", q.assignee);
  put("confirmed_by", q.confirmedBy);
  put("city", q.cityKey);
  put("source", q.source);
  put("min_risk", q.minRisk);
  put("due_before", q.dueBefore);
  put("test", q.test);
  put("hold", q.hold);
  put("return_reason", q.returnReason);
  put("tracking", q.tracking);
  put("carrier", q.carrierLabel);
  put("agent_label", q.agentLabel);
  put("sort", q.sort);
  return p;
}

/** The URL query as a saved view stores it (OPE-§12.2's OrderQuery; dates stay store-local days). */
export function toSavedQuery(q: OrderQuery): SavedOrderQuery {
  const days = q.range === "custom" ? { ...(q.from ? { from: q.from } : {}), ...(q.to ? { to: q.to } : {}) } : {};
  return SavedOrderQuery.parse({
    ...(q.q ? { q: q.q } : {}),
    ...(q.confirm.length ? { confirm: q.confirm } : {}),
    ...(q.ship.length ? { ship: q.ship } : {}),
    ...(q.money.length ? { money: q.money } : {}),
    ...(q.status ? { status: [q.status] } : {}),
    ...(q.assignee ? { assignee: q.assignee } : {}),
    ...(q.confirmedBy ? { confirmedBy: q.confirmedBy } : {}),
    ...(q.pageId ? { pageId: q.pageId } : {}),
    ...(q.cityKey ? { cityKey: q.cityKey } : {}),
    ...(q.source.length ? { source: q.source } : {}),
    ...(q.minRisk !== null ? { minRisk: q.minRisk } : q.risky ? { minRisk: 30 } : {}),
    ...days,
    ...(q.dueBefore ? { dueBefore: q.dueBefore } : {}),
    ...(q.sheet ? { sheet: q.sheet } : {}),
    ...(q.test !== null ? { test: q.test } : {}),
    ...(q.view ? { view: q.view } : {}),
    ...(q.hold ? { hold: q.hold } : {}),
    ...(q.returnReason.length ? { returnReason: q.returnReason } : {}),
    ...(q.tracking ? { tracking: q.tracking } : {}),
    ...(q.carrierLabel ? { carrierLabel: q.carrierLabel } : {}),
    ...(q.agentLabel ? { agentLabel: q.agentLabel } : {}),
    ...(q.sort ? { sort: q.sort } : {}),
  });
}

/** A saved view's query back as the URL query (opening a saved view = navigating to its link). */
export function fromSavedQuery(s: SavedOrderQuery): OrderQuery {
  const status = s.status?.length === 1 ? s.status[0] : undefined;
  const params = orderQueryParams({
    q: s.q ?? "",
    status: status && isOrderStatus(status) ? status : null,
    pageId: s.pageId ?? null,
    range: s.from || s.to ? "custom" : "all",
    from: s.from ?? null,
    to: s.to ?? null,
    sheet: s.sheet ?? null,
    view: builtinView(s.view)?.id ?? null,
    confirm: s.confirm ?? [],
    ship: s.ship ?? [],
    money: s.money ?? [],
    assignee: s.assignee ?? null,
    confirmedBy: s.confirmedBy ?? null,
    cityKey: s.cityKey ?? null,
    source: s.source ?? [],
    minRisk: s.minRisk ?? null,
    dueBefore: s.dueBefore ?? null,
    test: s.test ?? null,
    hold: s.hold ?? null,
    returnReason: s.returnReason ?? [],
    tracking: s.tracking ?? null,
    carrierLabel: s.carrierLabel ?? null,
    agentLabel: s.agentLabel ?? null,
    sort: s.sort,
  });
  return parseOrderQuery(Object.fromEntries(params));
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

/** The URL query → the list's filters (store-local day bounds; `viewer` adds the agent predicate, OD12). */
export function toOrderFilters(q: OrderQuery, timeZone: string, viewer?: ListViewer): OrderFilters {
  const { from, to } = rangeBounds(q, timeZone);
  return {
    q: q.q || undefined,
    status: q.status ?? undefined,
    pageId: q.pageId ?? undefined,
    from,
    to,
    sheetStatus: q.sheet ?? undefined,
    minRisk: q.minRisk ?? (q.risky ? 30 : undefined),
    view: q.view ?? undefined,
    confirm: q.confirm.length ? q.confirm : undefined,
    ship: q.ship.length ? q.ship : undefined,
    money: q.money.length ? q.money : undefined,
    assignee: q.assignee ?? undefined,
    confirmedBy: q.confirmedBy ?? undefined,
    cityKey: q.cityKey ?? undefined,
    source: q.source.length ? q.source : undefined,
    dueBefore: q.dueBefore ? new Date(q.dueBefore) : undefined,
    test: q.test ?? undefined,
    hold: q.hold ?? undefined,
    returnReason: q.returnReason.length ? q.returnReason : undefined,
    tracking: q.tracking ?? undefined,
    carrierLabel: q.carrierLabel ?? undefined,
    agentLabel: q.agentLabel ?? undefined,
    sort: q.sort ?? undefined,
    viewer,
  };
}

/** The list's JSON (OPE-§12.2, §12.3): masked rows, the keyset cursor, the capped total. */
export type OrderListJson = OrderList;

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
  source: OrderSource;
  sheetStatus: "pending" | "synced" | "failed" | "disabled";
  riskScore: number;
  flags: string[];
  /** a test order (D54, placed through a `?sg-test` link): kept out of Sheets, CAPI and stats, marked "Test" on screen */
  isTest: boolean;
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
    bundleLabel: orderItemsView(o.items)?.bundleLabel ?? "",
    options: orderTextOf(orderItemsView(o.items), { mode: "customer", max: 240 }),
    qty: o.qty,
    total: Number(o.total),
    currency: o.currency,
    pageName: o.pageName,
    source: o.source,
    sheetStatus: o.sheetStatus,
    riskScore: o.riskScore,
    flags: o.flags ?? [],
    isTest: o.isTest,
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
  const items = orderItemsView(o.items);
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
      bundleLabel: items.bundleLabel,
      qty: items.qty,
      unitPrice: Number(items.unitPrice),
      variants: items.variants ?? [],
      bump: items.bump ? { title: items.bump.title, price: items.bump.price } : null,
      upsell: items.upsell ? { title: items.upsell.title, price: items.upsell.price } : null,
      price: typeof items.price === "number" ? items.price : null,
      deltas: typeof items.deltas === "number" ? items.deltas : null,
      reasons: items.reasons ?? [],
    },
    view: orderView(items, { swatchOf: await swatches(scope, o.versionId, items) }),
    warehouseText: orderTextOf(items, { mode: "warehouse", orderId: o.id }),
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
  return row && isLandingDoc(row.doc) ? orderDocOf(row.doc, versionId) : null;
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
  phone: string | null;
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
    // leads.phone is NULL-able from 0005 (a WhatsApp intent, LAN Q2); every lead this screen lists today has one
    phone: l.phone ?? "",
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

/* ------------------------------------------------------------------ */
/* the drawer (OPE-§12.7; P4 step 5)                                   */
/* ------------------------------------------------------------------ */

/**
 * What the order drawer opens with (`getOrderAction`): the order (customer fields masked under impersonation, the
 * phone always masked: the full number only through `revealPhone`, OD11), its axes and carrier loop, and the ops parts
 * of the queue card (risk with the store's calibration, duplicates, the customer's history), the first timeline page,
 * the recall state, and the compiled call script for the claim holder and the managers (null for anyone else).
 */
export interface OrderDrawerJson extends OrderDetailJson {
  rev: number;
  states: OrderStates;
  landmark: string | null;
  adjustCents: number;
  shipAfter: string | null;
  trackingRef: string | null;
  carrierLabel: string | null;
  deliveryAttempts: number;
  customerId: string | null;
  /** P4 step 10: pinned to the top of the queue (orders.assign), the city's key ("Did you mean…" is shown when null) */
  pinned: boolean;
  cityKey: string | null;
  /** the member the order is assigned to (display name only, never an e-mail) */
  assignee: { id: string; name: string | null } | null;
  confirmedByName: string | null;
  /** the Sheet's Agent label when no member is mapped (OD54) */
  confirmedByLabel: string | null;
  ops: {
    risk: QueueOrder["risk"];
    duplicates: QueueOrder["duplicates"];
    history: QueueOrder["customer"]["history"];
    script: CompiledScript | null;
    timeline: { items: TimelineItem[]; more: boolean };
    recall: { reason: string; carrierNotified: boolean } | null;
    /** the viewer holds the claim */
    mine: boolean;
    lane: QueueOrder["lane"];
    /** P4 step 10 (OPE-§12.7): the zone line (P3; null text = no promise), the WhatsApp menu, "Take this order" */
    eta: QueueOrder["eta"];
    templates: QueueOrder["templates"];
    /** a pre-decision order nobody else holds right now (the drawer's "Take this order") */
    takeable: boolean;
    /** another member holds the claim (their display name; null when the viewer holds it or nobody does) */
    heldBy: string | null;
    /** "Did you mean…" (OPE-§10.1): fuzzy matches of a city the store's list does not know; never applied without a person */
    cityFix: { key: string; label: string }[];
  };
  /** OD52: who holds the cash after delivery, and since when */
  money: { settlement: "at_delivery" | "statement"; deliveredAt: string | null };
  /** owner and admin (OPE-§12.7 "Ad events"): the order's Conversions API events, newest first */
  adEvents: { id: number; at: string; type: "capi_sent" | "capi_stale" | "capi_failed"; platform: string | null; event: string | null; reason: string | null }[];
}

/** The drawer of one order the member may see (OD12, inbound lookups included); null = missing, hidden or another store's. */
export async function orderDrawerJson(ctx: StoreCtx, id: string): Promise<OrderDrawerJson | null> {
  const { scope } = ctx;
  const row = await cardRow(scope, id);
  if (!row || !viewerSeesOrder(scope, viewerOf(ctx), row, true)) return null;
  const detail = await orderDetailJson(scope, id);
  if (!detail) return null;
  const now = Date.now();
  const mine = row.assigneeId === ctx.user.id && !!row.claimToken && !!row.leaseUntil && row.leaseUntil.getTime() > now;
  const ops = await getStoreSetting(scope, "ops");
  const [card, timeline, [recall]] = await Promise.all([
    buildQueueOrder(scope, row, ctx, { leaseUntil: mine ? row.leaseUntil : null, mine, maxCalls: ops.rescue.maxCalls }),
    orderTimeline(scope, ctx, id),
    db
      .select({ meta: orderEvents.meta })
      .from(orderEvents)
      .where(whereStore(orderEvents, scope, eq(orderEvents.orderId, id), eq(orderEvents.type, "recall_requested")))
      .orderBy(desc(orderEvents.id))
      .limit(1),
  ]);
  const rm = (recall?.meta ?? null) as { reason?: unknown; carrierNotified?: unknown } | null;
  const owner = ctx.can("settings.write");
  const [names, accounting, capi] = await Promise.all([
    row.assigneeId || row.confirmedBy ? memberNames(scope) : Promise.resolve(new Map<string, string>()),
    getStoreSetting(scope, "accounting"),
    owner
      ? db
          .select({ id: orderEvents.id, at: orderEvents.at, type: orderEvents.type, meta: orderEvents.meta })
          .from(orderEvents)
          .where(whereStore(orderEvents, scope, eq(orderEvents.orderId, id), inArray(orderEvents.type, ["capi_sent", "capi_stale", "capi_failed"])))
          .orderBy(desc(orderEvents.id))
          .limit(12)
      : Promise.resolve([]),
  ]);
  const heldByOther = !!row.claimToken && !!row.leaseUntil && row.leaseUntil.getTime() > now && row.assigneeId !== ctx.user.id;
  const fix = !row.cityKey && row.city ? normalizeCity(row.city, ctx.store.market) : null;
  const str = (v: unknown) => (typeof v === "string" && v ? v.slice(0, 80) : null);
  return {
    ...detail,
    // the full number never reaches the browser here (OD11); reveal is its own audited action
    phone: maskPhone(row.phone),
    history: detail.history,
    rev: row.rev,
    states: card.states,
    landmark: card.customer.landmark,
    adjustCents: row.adjustCents,
    shipAfter: row.shipAfter ? row.shipAfter.toISOString() : null,
    trackingRef: row.trackingRef,
    carrierLabel: row.carrierLabel,
    deliveryAttempts: row.deliveryAttempts,
    customerId: row.customerId,
    ops: {
      risk: card.risk,
      duplicates: card.duplicates,
      history: card.customer.history,
      script: mine || ctx.can("orders.assign") ? card.script : null,
      timeline,
      recall: rm ? { reason: typeof rm.reason === "string" ? rm.reason : "other", carrierNotified: rm.carrierNotified === true } : null,
      mine,
      lane: card.lane,
      eta: card.eta,
      templates: card.templates,
      takeable: !heldByOther && !mine && (["new", "attempting", "callback"] as ConfirmState[]).includes(row.confirmState),
      heldBy: heldByOther && row.assigneeId ? (names.get(row.assigneeId) ?? null) : null,
      cityFix: fix && fix.confidence === "fuzzy" ? fix.suggestions.map((s) => ({ key: s.key, label: s.label })) : [],
    },
    pinned: isPinned(row.priority),
    cityKey: row.cityKey,
    assignee: row.assigneeId ? { id: row.assigneeId, name: names.get(row.assigneeId) ?? null } : null,
    confirmedByName: row.confirmedBy ? (names.get(row.confirmedBy) ?? null) : null,
    confirmedByLabel: row.confirmedByLabel,
    money: { settlement: accounting.myCarrier.settlement, deliveredAt: row.deliveredAt ? row.deliveredAt.toISOString() : null },
    adEvents: capi.map((e) => {
      const m = (e.meta ?? {}) as Record<string, unknown>;
      return {
        id: e.id,
        at: e.at.toISOString(),
        type: e.type as OrderDrawerJson["adEvents"][number]["type"],
        platform: str(m.platform),
        event: str(m.event ?? m.eventName),
        reason: str(m.reason ?? m.error),
      };
    }),
  };
}

/* ------------------------------------------------------------------ */
/* the orders screen's boot (P4 step 10, OPE-§12)                       */
/* ------------------------------------------------------------------ */

export interface OrdersMember {
  id: string;
  name: string;
  role: string;
}

export interface OrdersBoot {
  /** active members who take calls (Assign to…, the Agent column); display names only */
  members: OrdersMember[];
  savedViews: SavedViewRow[];
  /** ops.carrierCsv (null = the first Carrier file opens the column picker, OD55) */
  carrierCsv: { columns: { header: string; source: string; value?: string }[]; delimiter: "," | ";"; markPacked: boolean } | null;
  /** the "shown only when it has rows" views (OPE-§12.1) */
  nonEmpty: { delivery_problems: boolean; sheet_failed: boolean };
}

/** What the list needs beside its rows: members, saved views, the carrier columns, the conditional view tabs. */
export async function ordersBoot(ctx: StoreCtx): Promise<OrdersBoot> {
  const { scope } = ctx;
  const viewer = { userId: ctx.user.id, role: ctx.membership.role, seeAll: ctx.can("orders.read_all") };
  const probe = (view: BuiltinViewId) =>
    db
      .select({ id: orders.id })
      .from(orders)
      .where(whereStore(orders, scope, ...(view === "sheet_failed" ? [eq(orders.sheetStatus, "failed")] : [inArray(orders.shipState, ["attempt_failed", "postponed"])])))
      .limit(1)
      .then((r) => r.length > 0);
  const [members, savedViews, ops, problems, failed] = await Promise.all([
    db
      .select({ id: users.id, name: users.name, role: storeMembers.role })
      .from(storeMembers)
      .innerJoin(users, eq(users.id, storeMembers.userId))
      .where(whereStore(storeMembers, scope, eq(storeMembers.status, "active"), inArray(storeMembers.role, ["owner", "admin", "manager", "agent"]))),
    listSavedViews(ctx),
    getStoreSetting(scope, "ops"),
    viewer.seeAll ? probe("delivery_problems") : Promise.resolve(false),
    viewer.seeAll ? probe("sheet_failed") : Promise.resolve(false),
  ]);
  const csv = ops.carrierCsv as { columns: { header: string; source: string; value?: string }[]; delimiter?: "," | ";"; markPacked?: boolean } | null;
  return {
    members: members.map((m) => ({ id: m.id, name: m.name, role: m.role })).sort((a, b) => a.name.localeCompare(b.name)),
    savedViews,
    carrierCsv: csv ? { columns: csv.columns, delimiter: csv.delimiter ?? ";", markPacked: csv.markPacked !== false } : null,
    nonEmpty: { delivery_problems: problems, sheet_failed: failed },
  };
}
