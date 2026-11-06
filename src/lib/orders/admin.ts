import "server-only";
/**
 * Store-side order queries & mutations (call through the seam with the right permission): orders list/detail,
 * status updates (through the one writer, ./transition.ts), sheet re-sync, abandoned leads, blocklist, per-page order stats and
 * streamed CSV exports (orders, abandoned leads).
 *
 * P4 step 6 (operations.md OPE-§12.2-§12.5, §12.8, §26; OD12, OD49, OD55): the list query over the three axes, the
 * built-in views (src/lib/callcenter/views.ts) and the agent predicate (`filters.viewer`), keyset paging and the
 * masked `OrderListRow`; saved views; bulk assign / move / pin with per-order results, the bulk bucket, idempotent
 * replays and the 15-second undo; the CSV's appended columns; the test-order delete.
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
import { and, asc, count, desc, eq, exists, gt, gte, inArray, isNotNull, isNull, like, lt, lte, ne, notExists, or, sql, type SQL } from "drizzle-orm";
import { alias, type AnyMySqlColumn } from "drizzle-orm/mysql-core";
import { HIDDEN_EMAIL, maskCustomer } from "@/lib/admin-data/mask";
import { affected, auditIn, likeEscape, settingsActor, type Actor } from "@/lib/admin-data/store-audit";
import { ownQueueOnly, type StoreRole } from "@/lib/auth/permissions";
import { CARRIER_CSV_MAX_ORDERS, csvCell, planCarrierCsv, writeCarrierCsv, type ManifestRow } from "@/lib/callcenter/carrier-csv";
import { withIdem } from "@/lib/callcenter/idem";
import { isPinned, PIN_BOOST } from "@/lib/callcenter/priority";
import { builtinView, CALLBACK_LOOKAHEAD_MS, OrderQuery, SAVED_VIEWS_MAX, SavedViewInput, type BuiltinView, type OrderQueryInput, type OrderSort } from "@/lib/callcenter/views";
import { viewerSeesOrder } from "@/lib/callcenter/visibility";
import { db } from "@/lib/db/client";
import { newId } from "@/lib/db/ids";
import { blocklist, customers, leads, orderEvents, orders, pages, savedViews, storeMembers, users } from "@/lib/db/schema";
import type { OrderItems, OrderSource } from "@/lib/db/schema";
import { toCents } from "@/lib/finance/lite/cents";
import { normalizePhone, toAsciiDigits } from "@/lib/markets/phone";
import { rateLimit, storeBucket } from "@/lib/security/rate-limit";
import { getStoreSetting, setStoreSetting } from "@/lib/settings";
import { OpsSetting } from "@/lib/settings/keys/ops";
import { cleanText, syncPendingOrders, type SyncResult } from "@/lib/sheets";
import { orderTextOf, skuCell, variantCell } from "@/lib/sheets/row";
import { scopedCache } from "@/lib/tenancy/cache";
import { byId, inStore, storeValues, whereStore } from "@/lib/tenancy/sql";
import type { ActionResult, StoreCtx, StoreScope, WriteCtx, WriteScope } from "@/lib/tenancy/types";
import { ORDER_STATUSES, type OrderStatus } from "./contract";
import { phoneCountryOf } from "./edit";
import { appendEvents, viewerOf, type NewOrderEvent } from "./events";
import { maskPhone } from "./masking";
import { assignOrders } from "./queue";
import { PRE_SHIP, type ConfirmState, type MoneyState, type OrderStates, type ReturnReason, type ShipState } from "./state";
import {
  actorFrom,
  moveToLegacy,
  moveToLegacyAs,
  transitionOrder,
  undoColsOf,
  undoTransition,
  UNDO_COLS,
  type LegacyMoveOpts,
  type TransitionError,
  type TransitionResult,
  type UndoCols,
  type UndoEntry,
} from "./transition";

export type OrderRecord = typeof orders.$inferSelect;
export type LeadRecord = typeof leads.$inferSelect;
export type BlockRecord = typeof blocklist.$inferSelect;
export type { Actor };
export { maskCustomer };

export const ORDER_STATUS_IDS = ORDER_STATUSES.map((s) => s.id) as OrderStatus[];
export const isOrderStatus = (v: unknown): v is OrderStatus => typeof v === "string" && (ORDER_STATUS_IDS as string[]).includes(v);

/** The order's page, joined inside the same store (an order never shows another store's page name). */
const pageOf = (scope: StoreScope, pageId: typeof orders.pageId | typeof leads.pageId) => and(eq(pages.id, pageId), inStore(pages, scope));

/* ------------------------------------------------------------------ */
/* orders                                                              */
/* ------------------------------------------------------------------ */

/** Who is looking (OD12): an agent's list is narrowed server-side to their own orders, whatever the query says. */
export interface ListViewer {
  userId: string;
  role: StoreRole;
  /** orders.read_all */
  seeAll: boolean;
}

/** The viewer of a member's request. */
export const listViewerOf = (ctx: StoreCtx): ListViewer => ({ userId: ctx.user.id, role: ctx.membership.role, seeAll: ctx.can("orders.read_all") });

/**
 * The list's filters (OPE-§12.2's OrderQuery with dates as instants: `from` / `to` are the store-local day bounds the
 * URL parser computed, src/lib/admin-data/orders.ts). Every key is optional and they all apply together (AND).
 */
export interface OrderFilters {
  /** order id, phone (any format, ≥ 4 digits) or customer name */
  q?: string;
  /** the legacy labels (the projection, `orders.status`) */
  status?: OrderStatus | OrderStatus[];
  confirm?: ConfirmState[];
  ship?: ShipState[];
  money?: MoneyState[];
  /** a member id, "none" (the pool) or "me" (the viewer) */
  assignee?: string;
  confirmedBy?: string;
  pageId?: string;
  /** a CityKey slug; "*" = no key (the catch-all) */
  cityKey?: string;
  from?: Date;
  /** exclusive upper bound */
  to?: Date;
  /** callbacks and retries due at or before */
  dueBefore?: Date;
  sheetStatus?: OrderRecord["sheetStatus"];
  /** only orders with riskScore ≥ minRisk */
  minRisk?: number;
  source?: OrderSource | OrderSource[];
  test?: boolean;
  /** a built-in view id (src/lib/callcenter/views.ts) */
  view?: string;
  /** OD49: "active" = ship_after > now, "none" = no hold or a past one */
  hold?: "active" | "none";
  returnReason?: ReturnReason[];
  /** exact tracking_ref (orders_tracking_idx) */
  tracking?: string;
  carrierLabel?: string;
  /** the Sheet's Agent label (confirmed_by_label, OD54) */
  agentLabel?: string;
  sort?: OrderSort;
  /** the member looking: adds the agent predicate (OD12) and resolves assignee "me" */
  viewer?: ListViewer;
  /** P4 step 10: "Export selection" (≤ 200 ids of the list's selection; ANDed with the rest) */
  ids?: readonly string[];
}

/** Masked customer fields (impersonation) can't be searched for either: a hit would confirm them. */
const searchesCustomers = (scope: StoreScope) => scope.kind !== "impersonation";
const OPEN_CONFIRM_LIST: ConfirmState[] = ["new", "attempting", "callback"];
/** open: confirm new / attempting / callback, or confirmed and not handed to a carrier (of `orders` or an alias of it) */
const openOf = (confirmState: AnyMySqlColumn, shipState: AnyMySqlColumn): SQL =>
  or(inArray(confirmState, OPEN_CONFIRM_LIST), and(eq(confirmState, "confirmed"), inArray(shipState, [...PRE_SHIP])))!;

/** The view's own query merged into the filters: both apply; the person's sort wins. */
function withViewFilters(f: OrderFilters): { f: OrderFilters; view: BuiltinView | null } {
  const view = builtinView(f.view);
  if (!view) return { f, view: null };
  const q = view.query;
  const meet = <T>(a: readonly T[] | undefined, b: readonly T[] | undefined): T[] | undefined => (a && b ? a.filter((x) => b.includes(x)) : (a ?? b)?.slice());
  return {
    view,
    f: {
      ...f,
      confirm: meet(q.confirm, f.confirm),
      ship: meet(q.ship, f.ship),
      minRisk: Math.max(q.minRisk ?? 0, f.minRisk ?? 0) || undefined,
      sheetStatus: f.sheetStatus ?? q.sheet,
      test: f.test ?? q.test,
      hold: f.hold ?? q.hold,
      sort: f.sort ?? q.sort,
    },
  };
}

/** The agent predicate (OD12): the orders they hold or confirmed, created within `agentHistoryDays`. */
const mineCond = (userId: string, historyDays: number, now: Date): SQL =>
  and(or(eq(orders.assigneeId, userId), eq(orders.confirmedBy, userId)), gte(orders.createdAt, new Date(now.getTime() - historyDays * 86_400_000)))!;

/**
 * The filters' conditions; always combined with the store predicate by the caller (`whereStore`). Async: the agent
 * predicate and the duplicates view read the store's `ops` setting (only when they apply).
 */
async function orderConds(scope: StoreScope, input: OrderFilters, now = new Date(Date.now())): Promise<SQL[]> {
  const { f, view } = withViewFilters(input);
  const w: SQL[] = [];
  const none = sql`FALSE`;
  const viewer = f.viewer;
  const restricted = !!viewer && !viewer.seeAll;
  const ops = restricted || view?.special === "mine" || view?.special === "duplicates" ? await getStoreSetting(scope, "ops") : null;
  if (viewer && restricted) {
    // an agent sees their own queue; any other member without orders.read_all sees nothing (OD12)
    w.push(ownQueueOnly(viewer.role, "orders.write") && ops ? mineCond(viewer.userId, ops.agentHistoryDays, now) : none);
  }
  if (f.ids) w.push(f.ids.length ? inArray(orders.id, [...f.ids]) : none);
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
  if (f.confirm) w.push(f.confirm.length ? inArray(orders.confirmState, f.confirm) : none);
  if (f.ship) w.push(f.ship.length ? inArray(orders.shipState, f.ship) : none);
  if (f.money) {
    // R1's column has no `refunded` (0006): asking for it alone finds nothing
    const m = f.money.filter((x): x is Exclude<MoneyState, "refunded"> => x !== "refunded");
    w.push(m.length ? inArray(orders.moneyState, m) : none);
  }
  if (f.assignee === "none") w.push(isNull(orders.assigneeId));
  else if (f.assignee === "me") w.push(viewer ? eq(orders.assigneeId, viewer.userId) : none);
  else if (f.assignee) w.push(eq(orders.assigneeId, f.assignee));
  if (f.confirmedBy) w.push(eq(orders.confirmedBy, f.confirmedBy));
  if (f.pageId) w.push(eq(orders.pageId, f.pageId));
  if (f.cityKey) w.push(f.cityKey === "*" ? isNull(orders.cityKey) : eq(orders.cityKey, f.cityKey));
  if (f.from) w.push(gte(orders.createdAt, f.from));
  if (f.to) w.push(lt(orders.createdAt, f.to));
  if (f.dueBefore) w.push(lte(orders.dueAt, f.dueBefore));
  if (f.sheetStatus) w.push(eq(orders.sheetStatus, f.sheetStatus));
  if (typeof f.minRisk === "number" && f.minRisk > 0) w.push(gte(orders.riskScore, f.minRisk));
  if (Array.isArray(f.source)) {
    if (f.source.length) w.push(inArray(orders.source, f.source));
  } else if (f.source) w.push(eq(orders.source, f.source));
  if (typeof f.test === "boolean") w.push(eq(orders.isTest, f.test));
  if (f.hold === "active") w.push(gt(orders.shipAfter, now));
  else if (f.hold === "none") w.push(or(isNull(orders.shipAfter), lte(orders.shipAfter, now))!);
  if (f.returnReason) w.push(f.returnReason.length ? inArray(orders.returnReason, f.returnReason) : none);
  if (f.tracking?.trim()) w.push(eq(orders.trackingRef, f.tracking.trim().slice(0, 64)));
  if (f.carrierLabel?.trim()) w.push(eq(orders.carrierLabel, f.carrierLabel.trim().slice(0, 60)));
  if (f.agentLabel?.trim()) w.push(eq(orders.confirmedByLabel, f.agentLabel.trim().slice(0, 60)));

  switch (view?.special) {
    case "callable":
      // either lane due now (OPE-§5.1); the calling window is ignored for viewing
      w.push(
        or(
          and(inArray(orders.confirmState, OPEN_CONFIRM_LIST), or(isNull(orders.dueAt), lte(orders.dueAt, now))),
          and(eq(orders.confirmState, "confirmed"), isNotNull(orders.dueAt), lte(orders.dueAt, now)),
        )!,
      );
      break;
    case "callbacks_due":
      w.push(eq(orders.confirmState, "callback"), lte(orders.dueAt, new Date(now.getTime() + CALLBACK_LOOKAHEAD_MS)));
      break;
    case "open":
      w.push(openOf(orders.confirmState, orders.shipState));
      break;
    case "mine":
      w.push(viewer && ops ? mineCond(viewer.userId, ops.agentHistoryDays, now) : none);
      break;
    case "duplicates": {
      // an open sibling of the same phone and kind within the window (OPE-§9.3), not kept apart with "Keep both"
      const days = ops?.duplicateWindowDays ?? 0;
      if (!(days > 0)) {
        w.push(none);
        break;
      }
      const sib = alias(orders, "sib");
      const since = new Date(now.getTime() - days * 86_400_000);
      const dismissed = db
        .select({ one: sql`1` })
        .from(orderEvents)
        .where(whereStore(orderEvents, scope, eq(orderEvents.orderId, orders.id), eq(orderEvents.type, "duplicate_dismissed"), sql`JSON_CONTAINS(${orderEvents.meta}, JSON_QUOTE(${sib.id}), '$.of')`));
      const sibling = db
        .select({ one: sql`1` })
        .from(sib)
        .where(whereStore(sib, scope, eq(sib.phone, orders.phone), ne(sib.id, orders.id), eq(sib.isTest, orders.isTest), gte(sib.createdAt, since), openOf(sib.confirmState, sib.shipState), notExists(dismissed)));
      w.push(openOf(orders.confirmState, orders.shipState), gte(orders.createdAt, since), exists(sibling));
      break;
    }
  }
  return w;
}

/* ---- sort and keyset (OPE-§12.2: keyset on the sort key + id) ---- */

const SORT_KEY: Record<OrderSort, { key: SQL; dir: "asc" | "desc"; kind: "date" | "num" }> = {
  created_desc: { key: sql`${orders.createdAt}`, dir: "desc", kind: "date" },
  // a callable-now order (no due time) sorts at its creation instant
  due_asc: { key: sql`COALESCE(${orders.dueAt}, ${orders.createdAt})`, dir: "asc", kind: "date" },
  priority_desc: { key: sql`${orders.priority}`, dir: "desc", kind: "num" },
  total_desc: { key: sql`${orders.total}`, dir: "desc", kind: "num" },
};

type Cursor = { s: OrderSort; k: string | number; id: string };
const encodeCursor = (c: Cursor) => Buffer.from(JSON.stringify(c)).toString("base64url");
function decodeCursor(raw: string | undefined, sort: OrderSort): Cursor | null {
  if (!raw || raw.length > 200) return null;
  try {
    const c = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Partial<Cursor>;
    if (c.s !== sort || typeof c.id !== "string" || !ORDER_ID_FORMAT.test(c.id)) return null;
    const date = SORT_KEY[sort].kind === "date";
    if (date ? typeof c.k !== "string" || Number.isNaN(Date.parse(c.k)) : typeof c.k !== "number" && !(typeof c.k === "string" && /^-?\d+(\.\d+)?$/.test(c.k))) return null;
    return c as Cursor;
  } catch {
    return null;
  }
}
function afterCond(c: Cursor): SQL {
  const s = SORT_KEY[c.s];
  const k = s.kind === "date" ? new Date(c.k as string) : c.k;
  return s.dir === "desc" ? sql`(${s.key} < ${k} OR (${s.key} = ${k} AND ${orders.id} < ${c.id}))` : sql`(${s.key} > ${k} OR (${s.key} = ${k} AND ${orders.id} > ${c.id}))`;
}
const orderBy = (sort: OrderSort): SQL[] => (SORT_KEY[sort].dir === "desc" ? [sql`${SORT_KEY[sort].key} DESC`, desc(orders.id)] : [sql`${SORT_KEY[sort].key} ASC`, asc(orders.id)]);

export interface Pagination {
  page?: number;
  pageSize?: number;
  /** keyset: the `next` of the previous page (OPE-§12.2); wins over `page` */
  after?: string;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** the list's "10,000+" (OPE-§12.2): a page without a cursor counts its matches up to this */
export const LIST_TOTAL_CAP = 10_000;

const paging = (p: Pagination = {}) => {
  const page = Math.max(1, Math.floor(p.page ?? 1));
  const pageSize = Math.min(200, Math.max(1, Math.floor(p.pageSize ?? 50)));
  return { page, pageSize, offset: (page - 1) * pageSize };
};

/** One row of the orders list (OPE-§12.3): the customer's name, masked phone and city; never the address, note or e-mail. */
export interface OrderListRow {
  id: string;
  createdAt: string;
  updatedAt: string;
  /** the legacy label (the projection) */
  status: string;
  states: OrderStates;
  rev: number;
  name: string;
  /** always masked (OD11): the full number only through revealPhone */
  phoneMasked: string;
  city: string | null;
  cityKey: string | null;
  productName: string;
  bundleLabel: string;
  /** what the order contains in one line, customer wording */
  options: string;
  qty: number;
  total: number;
  totalCents: number;
  currency: string;
  pageId: string;
  pageName: string | null;
  source: OrderSource;
  sheetStatus: OrderRecord["sheetStatus"];
  riskScore: number;
  flags: string[];
  isTest: boolean;
  assigneeId: string | null;
  confirmedBy: string | null;
  /** the Sheet's Agent label when no member is mapped (OD54) */
  confirmedByLabel: string | null;
  attempts: number;
  dueAt: string | null;
  priority: number;
  pinned: boolean;
  cancelReason: string | null;
  returnReason: string | null;
  /** the hold (OD49) */
  shipAfter: string | null;
  trackingRef: string | null;
  carrierLabel: string | null;
  deliveryAttempts: number;
  utmCampaign: string | null;
}

const LIST_COLS = {
  id: orders.id,
  createdAt: orders.createdAt,
  updatedAt: orders.updatedAt,
  status: orders.status,
  confirmState: orders.confirmState,
  shipState: orders.shipState,
  moneyState: orders.moneyState,
  rev: orders.rev,
  name: orders.name,
  phone: orders.phone,
  city: orders.city,
  cityKey: orders.cityKey,
  productName: orders.productName,
  items: orders.items,
  qty: orders.qty,
  total: orders.total,
  currency: orders.currency,
  pageId: orders.pageId,
  source: orders.source,
  sheetStatus: orders.sheetStatus,
  riskScore: orders.riskScore,
  flags: orders.flags,
  isTest: orders.isTest,
  assigneeId: orders.assigneeId,
  confirmedBy: orders.confirmedBy,
  confirmedByLabel: orders.confirmedByLabel,
  attempts: orders.attempts,
  dueAt: orders.dueAt,
  priority: orders.priority,
  cancelReason: orders.cancelReason,
  returnReason: orders.returnReason,
  shipAfter: orders.shipAfter,
  trackingRef: orders.trackingRef,
  carrierLabel: orders.carrierLabel,
  deliveryAttempts: orders.deliveryAttempts,
  utm: orders.utm,
  pageName: pages.name,
};

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

function listRows(scope: StoreScope, where: SQL) {
  return db.select(LIST_COLS).from(orders).leftJoin(pages, pageOf(scope, orders.pageId)).where(whereStore(orders, scope, where));
}
type ListSel = Awaited<ReturnType<ReturnType<typeof listRows>["limit"]>>[number];

function toListRow(scope: StoreScope, r: ListSel): OrderListRow {
  // the customer's fields through maskIfImpersonation (OD61); the phone is masked for every member too (OD11)
  const m = maskCustomer(scope, { name: r.name, phone: r.phone, city: r.city });
  return {
    id: r.id,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    status: r.status,
    states: { confirm: r.confirmState, ship: r.shipState, money: r.moneyState as MoneyState },
    rev: r.rev,
    name: m.name ?? "",
    phoneMasked: scope.kind === "impersonation" ? (m.phone ?? "") : maskPhone(r.phone),
    city: m.city ?? null,
    cityKey: r.cityKey,
    productName: r.productName,
    bundleLabel: r.items?.bundleLabel ?? "",
    options: orderTextOf(r.items, { mode: "customer", max: 240 }),
    qty: r.qty,
    total: Number(r.total),
    totalCents: toCents(r.total),
    currency: r.currency,
    pageId: r.pageId,
    pageName: r.pageName ?? null,
    source: r.source,
    sheetStatus: r.sheetStatus,
    riskScore: r.riskScore,
    flags: r.flags ?? [],
    isTest: r.isTest,
    assigneeId: r.assigneeId,
    confirmedBy: r.confirmedBy,
    confirmedByLabel: r.confirmedByLabel,
    attempts: r.attempts,
    dueAt: iso(r.dueAt),
    priority: r.priority,
    pinned: isPinned(r.priority),
    cancelReason: r.cancelReason,
    returnReason: r.returnReason,
    shipAfter: iso(r.shipAfter),
    trackingRef: r.trackingRef,
    carrierLabel: r.carrierLabel,
    deliveryAttempts: r.deliveryAttempts,
    utmCampaign: r.utm?.campaign ?? null,
  };
}

export interface OrderList extends Paged<OrderListRow> {
  /** the keyset cursor of the next page; null on the last one */
  next: string | null;
  /** the count stopped at LIST_TOTAL_CAP ("10,000+") */
  totalCapped: boolean;
}

/**
 * The store's orders list (OPE-§12.2; core §E.3 rule 1 wants the scope first, so OPE's `ctx` form is served by
 * `filters.viewer`). Keyset paging on the sort key + id through `pagination.after` (`page` keeps today's numbered
 * pager); the total is counted, up to 10,000, only when no cursor is given. Rows are `OrderListRow`s.
 */
export async function listOrders(scope: StoreScope, filters: OrderFilters = {}, pagination?: Pagination): Promise<OrderList> {
  const { page, pageSize, offset } = paging(pagination);
  const sort: OrderSort = withViewFilters(filters).f.sort ?? "created_desc";
  const cursor = decodeCursor(pagination?.after, sort);
  const conds = await orderConds(scope, filters);
  const where = whereStore(orders, scope, ...conds);
  const rows = await listRows(scope, cursor ? and(where, afterCond(cursor))! : where)
    .orderBy(...orderBy(sort))
    .limit(pageSize + 1)
    .offset(cursor ? 0 : offset);
  const more = rows.length > pageSize;
  const shown = more ? rows.slice(0, pageSize) : rows;
  let total = 0;
  let totalCapped = false;
  if (!cursor) {
    const capped = db.select({ one: sql<number>`1`.as("one") }).from(orders).where(where).limit(LIST_TOTAL_CAP + 1).as("capped");
    const [t] = await db.select({ n: count() }).from(capped);
    total = Number(t?.n ?? 0);
    totalCapped = total > LIST_TOTAL_CAP;
    if (totalCapped) total = LIST_TOTAL_CAP;
  }
  const last = shown[shown.length - 1];
  const keyOf = (r: ListSel): string | number =>
    sort === "created_desc" ? r.createdAt.toISOString() : sort === "due_asc" ? (r.dueAt ?? r.createdAt).toISOString() : sort === "priority_desc" ? r.priority : String(r.total);
  return {
    items: shown.map((r) => toListRow(scope, r)),
    total,
    totalCapped,
    page,
    pageSize,
    next: more && last ? encodeCursor({ s: sort, k: keyOf(last), id: last.id }) : null,
  };
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

/** The grants of the R1.0 status write: its one caller checked `orders.write`, and R1.0 had no own-queue rule. */
const LEGACY_GRANTS: ReadonlySet<string> = new Set(["orders.read_all", "orders.write", "shipments.write"]);

/** The R1.0 messages of a refused status write (the orders screen shows them as they are). */
export const MOVE_ERROR_TEXT: Record<TransitionError, string> = {
  not_found: "Order not found.",
  illegal: "This move isn't possible from the order's current state.",
  conflict: "Someone else just changed this order. Refresh and try again.",
  reason_required: "Pick a reason for this move.",
  forbidden: "You can't make this move.",
  locked_ship: "The parcel is already with the carrier.",
  bad_due: "Pick a callback time within the next 30 days.",
  bad_duplicate: "Pick the order this one duplicates.",
  bad_hold: "Pick a date within the next 60 days.",
  bad_amount: "The amount doesn't match the order.",
};

/**
 * Deprecated (OPE-§3.7; P0b P4-4): the R1.0 status write, now a thin wrapper over the one writer (`moveToLegacyAs`,
 * ./transition.ts): no direct status write, and the sheet is a mirror pushed after the commit, never written first
 * (OD2). The orders screen calls `moveToLegacy` itself; this name stays for the barrel (src/lib/orders/index.ts,
 * maintainer) until CCR r1-p4-2 drops it, then it is deleted. A cancellation carries the code `other`: R1.0's menu
 * had no reason picker.
 */
export async function updateOrderStatus(scope: WriteScope, id: string, status: OrderStatus, actor: Actor): Promise<UpdateStatusResult> {
  if (!isOrderStatus(status)) return { ok: false, error: "Unknown status." };
  const res = await moveToLegacyAs(
    { kind: actor.kind === "user" ? "user" : "system", userId: actor.userId, can: (p) => LEGACY_GRANTS.has(p) },
    scope,
    id,
    status,
    undefined,
    status === "cancelled" ? { reason: "other" } : {},
  );
  if (!res.ok) return { ok: false, error: MOVE_ERROR_TEXT[res.error] };
  return { ok: true, sheet: res.changed ? "queued" : "skipped" };
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
  // the audit names the number masked (OD11): the blocklist row itself holds the full value
  await auditIn(scope, actor, "blocklist.added", { target: kind === "phone" ? maskPhone(value) : `ip:${value.slice(0, 12)}…` });
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
/* block and cancel (OP-12, OPE-§9.5)                                  */
/* ------------------------------------------------------------------ */

/** confirm states an order is still open in (OPE-§9.5: these move to fake / cancelled) */
const OPEN_CONFIRM: ReadonlySet<ConfirmState> = new Set(["new", "attempting", "callback", "confirmed"]);
/** with the carrier: listed, never touched */
const OUT_SHIP: ReadonlySet<ShipState> = new Set(["shipped", "in_transit", "out_for_delivery", "attempt_failed", "postponed"]);
/** a phone's orders read at most (one customer; a busy number has a handful) */
const BLOCK_SCAN = 100;
const ORDER_ID_FORMAT = /^[A-Z0-9]{2,8}-[A-Z0-9]{4,12}$/;

export interface BlockTarget {
  e164: string;
  open: { id: string; rev: number }[];
  /** already with the carrier */
  shipped: string[];
}

type BlockInput = { phone?: string; orderId?: string };

/** The number to block (typed, normalised with the store market's country, ORD-16; or an order's) and its orders. */
async function blockTarget(ctx: StoreCtx, input: BlockInput): Promise<BlockTarget | null> {
  const { scope } = ctx;
  let e164: string | null = null;
  if (input.orderId) {
    if (!ORDER_ID_FORMAT.test(input.orderId)) return null;
    const [o] = await db
      .select({ phone: orders.phone, id: orders.id, assigneeId: orders.assigneeId, confirmedBy: orders.confirmedBy })
      .from(orders)
      .where(byId(orders, scope, input.orderId))
      .limit(1);
    if (!o || !viewerSeesOrder(scope, viewerOf(ctx), o, true)) return null;
    e164 = o.phone;
  } else if (input.phone) {
    const raw = input.phone.trim();
    e164 = normalizePhone(raw, phoneCountryOf(ctx.store))?.e164 ?? (/^\+[1-9][0-9]{6,14}$/.test(raw) ? raw : null);
  }
  if (!e164) return null;
  const rows = await db
    .select({ id: orders.id, rev: orders.rev, confirmState: orders.confirmState, shipState: orders.shipState })
    .from(orders)
    .where(whereStore(orders, scope, eq(orders.phone, e164)))
    .orderBy(desc(orders.createdAt))
    .limit(BLOCK_SCAN);
  return {
    e164,
    open: rows.filter((r) => OPEN_CONFIRM.has(r.confirmState) && PRE_SHIP.has(r.shipState)).map((r) => ({ id: r.id, rev: r.rev })),
    shipped: rows.filter((r) => OUT_SHIP.has(r.shipState)).map((r) => r.id),
  };
}

export interface BlockPreview {
  phoneMasked: string;
  /** "This number has 2 open orders and 1 shipped order" */
  open: number;
  shipped: number;
  alreadyBlocked: boolean;
}

/** The dialog's preview before confirming (blocklist.write): the masked number and its open and shipped orders. */
export async function blockPreview(ctx: StoreCtx, input: BlockInput): Promise<ActionResult<BlockPreview>> {
  if (!ctx.can("blocklist.write")) return { ok: false, error: "forbidden" };
  const t = await blockTarget(ctx, input);
  if (!t) return { ok: false, error: input.orderId ? "not_found" : "invalid" };
  const [hit] = await db
    .select({ id: blocklist.id })
    .from(blocklist)
    .where(whereStore(blocklist, ctx.scope, eq(blocklist.kind, "phone"), eq(blocklist.value, t.e164)))
    .limit(1);
  return { ok: true, data: { phoneMasked: maskPhone(t.e164), open: t.open.length, shipped: t.shipped.length, alreadyBlocked: !!hit } };
}

export type BlockAndCancelResult = { blocked: true; moved: { id: string; ok: boolean; error?: TransitionError }[]; untouched: string[] };

/**
 * OP-12: block the number in the store and settle its open orders. blocklist.write; moving the orders also needs
 * orders.write. Open pre-ship orders → `fake` (default) or `cancelled` with reason `blocked`, through the writer;
 * orders already with the carrier are listed and never touched; `keep` moves nothing. Events `blocked` on every order
 * of the number read, plus the transitions; `audit("blocklist.added")` with the store id.
 */
export async function blockPhoneAndCancel(
  ctx: WriteCtx,
  input: { phone?: string; orderId?: string; reason?: string; openOrders: "fake" | "cancel" | "keep" },
): Promise<ActionResult<BlockAndCancelResult>> {
  const { scope } = ctx;
  if (!ctx.can("blocklist.write")) return { ok: false, error: "forbidden" };
  const mode = input.openOrders ?? "fake";
  if (mode !== "keep" && !ctx.can("orders.write")) return { ok: false, error: "forbidden" };
  const t = await blockTarget(ctx, input);
  if (!t) return { ok: false, error: input.orderId ? "not_found" : "invalid" };
  await addBlock(scope, "phone", t.e164, input.reason ?? (input.orderId ? `Commande ${input.orderId}` : null), ctx.actor);
  const marked = [...t.open.map((o) => o.id), ...t.shipped];
  if (marked.length) {
    await db.transaction((tx) => appendEvents(tx, scope, marked.map((id) => ({ orderId: id, actorKind: "user" as const, actorId: ctx.user.id, type: "blocked" as const, meta: { kind: "phone" } }))));
  }
  const moved: BlockAndCancelResult["moved"] = [];
  if (mode !== "keep") {
    const actor = actorFrom(ctx);
    for (const o of t.open) {
      const r = await transitionOrder(actor, scope, { orderId: o.id, want: { confirm: mode === "fake" ? "fake" : "cancelled" }, source: "ui", reason: "blocked" });
      moved.push(r.ok ? { id: o.id, ok: true } : { id: o.id, ok: false, error: r.error });
    }
  }
  return { ok: true, data: { blocked: true, moved, untouched: t.shipped } };
}

/* ------------------------------------------------------------------ */
/* CSV export                                                          */
/* ------------------------------------------------------------------ */

/** The R1.0 header, unchanged, then the OPE-§12.8 columns appended (R2's Collected and Refund come with 0006). */
export const ORDERS_CSV_HEADER = [
  "Order", "Date (UTC)", "Status", "Name", "Phone", "City", "Address", "Product", "Pack", "Variante", "Qty", "Subtotal",
  "Shipping", "Total", "Currency", "Note", "Email", "Page", "Source", "UTM source", "UTM campaign", "Risk", "Flags",
  "Options (+)", "SKU",
  // OPE-§12.8
  "Confirmation", "Shipping state", "Money", "Agent", "Attempts", "Cancel reason", "Landmark", "Adjustment",
  "Confirmed at", "Delivered at", "Test",
  // rev 3
  "Ship after", "Return reason", "Tracking", "Carrier", "Agent (sheet)", "Delivery attempts",
] as const;

const plainMoney = (n: number) => String(Math.round(n * 100) / 100);
const utcText = (d: Date | null | undefined) => (d ? d.toISOString().replace("T", " ").slice(0, 19) : "");

/** "Options (+)": what added money to the order, one entry per reason ("XL ×2 (+40); Emballage cadeau (+15)"). */
export function surchargesText(items: OrderItems | null | undefined): string {
  return (items?.reasons ?? [])
    .filter((r) => r.amount > 0)
    .map((r) => `${cleanText(r.label, 60)}${r.count > 1 ? ` ×${r.count}` : ""} (+${plainMoney(r.amount)})`)
    .join("; ");
}

/** RFC 4180 field, formula-injection safe (Excel/Sheets): leading = + - @ tab CR get a ' prefix. */
export const csvField = (v: unknown): string => csvCell(v, ",");

/** The display names of the store's members (the "Agent" column; a user id is never written). */
export async function memberNames(scope: StoreScope): Promise<Map<string, string>> {
  const rows = await db
    .select({ id: users.id, name: users.name })
    .from(storeMembers)
    .innerJoin(users, eq(users.id, storeMembers.userId))
    .where(inStore(storeMembers, scope));
  return new Map(rows.map((r) => [r.id, r.name]));
}

/** One order's cells in ORDERS_CSV_HEADER order (the orders CSV and the store export ZIP's orders.csv). */
export function orderCsvCells(o: OrderRecord, pageName: string | null, names: ReadonlyMap<string, string>): unknown[] {
  return [
    o.id,
    utcText(o.createdAt),
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
    o.confirmState,
    o.shipState,
    o.moneyState,
    o.confirmedBy ? (names.get(o.confirmedBy) ?? "") : "",
    o.attempts,
    o.cancelReason,
    o.landmark,
    o.adjustCents ? plainMoney(o.adjustCents / 100) : "",
    utcText(o.confirmedAt),
    utcText(o.deliveredAt),
    o.isTest ? "1" : "",
    utcText(o.shipAfter),
    o.returnReason,
    o.trackingRef,
    o.carrierLabel,
    o.confirmedByLabel,
    o.deliveryAttempts,
  ];
}

/** Streamed CSV (UTF-8 with BOM for Excel) of the store's orders matching `filters`, newest first (ORD-15, OPE-§12.8). */
export function ordersCsv(scope: StoreScope, filters: OrderFilters = {}): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  let conds: SQL[] | null = null;
  let names: ReadonlyMap<string, string> = new Map();
  let cursor: { createdAt: Date; id: string } | null = null;
  let started = false;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (!started) {
          started = true;
          controller.enqueue(enc.encode(`﻿${ORDERS_CSV_HEADER.join(",")}\r\n`));
          return;
        }
        if (!conds) {
          conds = await orderConds(scope, filters);
          names = await memberNames(scope);
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
          // the landmark is the customer's too: hidden under a staff "view as store" like the address (OD61)
          const o = scope.kind === "impersonation" ? { ...maskCustomer(scope, order), landmark: order.landmark ? HIDDEN_EMAIL : null } : order;
          chunk += orderCsvCells(o, pageName, names).map(csvField).join(",") + "\r\n";
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

/* ------------------------------------------------------------------ */
/* bulk actions and undo (OPE-§12.4, §12.5)                             */
/* ------------------------------------------------------------------ */

export const BULK_MAX = 200;
export const BULK_RATE = { limit: 30, windowSec: 600 } as const;
/** the toast shows "Undo" for 10 s; the token lives 15 s (a slow network still lands) */
export const UNDO_TTL_MS = 15_000;

export interface BulkResult {
  ok: string[];
  failed: { id: string; error: TransitionError | "not_found" }[];
  /** an idem replay: the stored result of the first call (OD36) */
  replayed?: true;
}
export type BulkTarget = { legacy: OrderStatus } | { want: Partial<OrderStates>; reason?: string };
type BulkRefusal = "forbidden" | "invalid" | "rate_limited";

interface UndoToken {
  userId: string;
  at: number;
  entries: UndoEntry[];
}
const undoCache = scopedCache<UndoToken>({ name: "ops-undo", maxEntries: 5_000, ttlMs: UNDO_TTL_MS });

/** ≤ 200 distinct ids, trimmed and upper-cased; anything else answers `invalid`. */
function bulkIds(ids: readonly string[]): string[] | null {
  if (!Array.isArray(ids)) return null;
  const unique = [...new Set(ids.map((x) => String(x).trim().toUpperCase()))];
  return unique.length && unique.length <= BULK_MAX ? unique : null;
}

/** The bulk bucket `s:<sid>:bulk:<uid>` (30 / 10 min, core §E.8): one charge per call, a replay is free. */
async function bulkGate(ctx: StoreCtx): Promise<boolean> {
  return (await rateLimit(storeBucket(ctx.scope, "bulk", ctx.user.id), BULK_RATE.limit, BULK_RATE.windowSec)).ok;
}

/** One bulk call: the shape checks, then the idempotent run (OD36: a replay within 10 minutes returns the stored result). */
async function bulk<T extends object>(ctx: StoreCtx, ids: readonly string[], idem: string | undefined, run: (ids: string[]) => Promise<T>): Promise<ActionResult<T & { replayed?: true }>> {
  const list = bulkIds(ids);
  if (!list) return { ok: false, error: "invalid" satisfies BulkRefusal };
  return withIdem<ActionResult<T & { replayed?: true }>>(
    ctx.scope,
    ctx.user.id,
    idem,
    async () => {
      if (!(await bulkGate(ctx))) return { ok: false, error: "rate_limited" satisfies BulkRefusal };
      return { ok: true, data: (await run(list)) as T & { replayed?: true } };
    },
    (stored) => (stored.ok ? { ok: true, data: { ...stored.data, replayed: true as const } } : stored),
  );
}

/** Mints the undo token of the moves just made (only the orders that changed). */
function mintUndo(ctx: StoreCtx, entries: UndoEntry[]): string | null {
  if (!entries.length) return null;
  const token = newId();
  undoCache.set(ctx.scope.storeId, token, { userId: ctx.user.id, at: Date.now(), entries });
  return token;
}

/** The before-image of `ids` (the store's rows only), read before a move so it can be undone exactly. */
async function undoBase(scope: StoreScope, ids: readonly string[]) {
  if (!ids.length) return new Map<string, { rev: number; states: OrderStates; cols: UndoCols }>();
  const rows = await db
    .select({ id: orders.id, rev: orders.rev, confirmState: orders.confirmState, shipState: orders.shipState, moneyState: orders.moneyState, ...UNDO_COLS })
    .from(orders)
    .where(whereStore(orders, scope, inArray(orders.id, [...ids])));
  return new Map(rows.map((r) => [r.id, { rev: r.rev, states: { confirm: r.confirmState, ship: r.shipState, money: r.moneyState as MoneyState }, cols: undoColsOf(r) }]));
}

/**
 * One "Move to…" with its undo token (OPE-§12.5, §12.6): the drawer's and the list's single move. The before-image is
 * read first and the move runs on that rev, so the token restores exactly what this move changed.
 */
export async function moveWithUndo(ctx: WriteCtx, id: string, label: OrderStatus, expectRev?: number, opts: LegacyMoveOpts = {}): Promise<TransitionResult & { undo?: string }> {
  const base = (await undoBase(ctx.scope, ORDER_ID_FORMAT.test(id) ? [id] : [])).get(id);
  const res = await moveToLegacy(ctx, id, label, expectRev ?? base?.rev, opts);
  if (!res.ok || !res.changed || !base) return res;
  const undo = mintUndo(ctx, [{ orderId: id, revAfter: res.rev, before: base.states, cols: base.cols, eventIds: res.eventIds }]);
  return undo ? { ...res, undo } : res;
}

/** orders.assign: assign ≤ 200 orders to a member, or back to the pool (`null`), per-order results (OPE-§12.4, §5.6). */
export async function bulkAssign(ctx: WriteCtx, ids: string[], userId: string | null, opts: { idem?: string } = {}): Promise<ActionResult<BulkResult>> {
  if (!ctx.can("orders.assign")) return { ok: false, error: "forbidden" };
  return bulk(ctx, ids, opts.idem, async (list) => {
    const res = await assignOrders(ctx, list, userId);
    if (!res.ok) return { ok: [], failed: list.map((id) => ({ id, error: "not_found" as const })) };
    return {
      ok: res.data.results.filter((r) => r.ok).map((r) => r.id),
      failed: res.data.results.flatMap((r) => (r.ok ? [] : [{ id: r.id, error: r.error }])),
    };
  });
}

/**
 * orders.write: each id through the one writer with `source: "bulk"` (a legacy label, or axis moves with a reason),
 * partial success reported per id, and an undo token for the orders that moved (OPE-§12.4, §12.5).
 */
export async function bulkMove(ctx: WriteCtx, ids: string[], target: BulkTarget, opts: { idem?: string } = {}): Promise<ActionResult<BulkResult & { undo: string | null }>> {
  if (!ctx.can("orders.write")) return { ok: false, error: "forbidden" };
  if ("legacy" in target ? !isOrderStatus(target.legacy) : !target.want || !Object.keys(target.want).length) return { ok: false, error: "invalid" };
  return bulk(ctx, ids, opts.idem, async (list) => {
    const base = await undoBase(ctx.scope, list.filter((id) => ORDER_ID_FORMAT.test(id)));
    const actor = actorFrom(ctx);
    const out: BulkResult & { undo: string | null } = { ok: [], failed: [], undo: null };
    const undo: UndoEntry[] = [];
    for (const id of list) {
      const b = base.get(id);
      if (!b) {
        out.failed.push({ id, error: "not_found" });
        continue;
      }
      const res =
        "legacy" in target
          ? await moveToLegacyAs(actor, ctx.scope, id, target.legacy, b.rev, { source: "bulk", ...(target.legacy === "cancelled" ? { reason: "other" } : {}) })
          : await transitionOrder(actor, ctx.scope, { orderId: id, want: target.want, source: "bulk", expectRev: b.rev, ...(target.reason ? { reason: target.reason } : {}) });
      if (!res.ok) {
        out.failed.push({ id, error: res.error });
        continue;
      }
      out.ok.push(id);
      if (res.changed) undo.push({ orderId: id, revAfter: res.rev, before: b.states, cols: b.cols, eventIds: res.eventIds });
    }
    out.undo = mintUndo(ctx, undo);
    return out;
  });
}

/** orders.assign: "Pin to top" (stored priority + 1000, OPE-§5.4) or unpin, with `priority_pinned` per changed order. */
export async function bulkPin(ctx: WriteCtx, ids: string[], pinned: boolean, opts: { idem?: string } = {}): Promise<ActionResult<BulkResult>> {
  if (!ctx.can("orders.assign")) return { ok: false, error: "forbidden" };
  const { scope } = ctx;
  return bulk(ctx, ids, opts.idem, async (list) => {
    const valid = list.filter((id) => ORDER_ID_FORMAT.test(id));
    return db.transaction(async (tx) => {
      const rows = valid.length
        ? await tx
            .select({ id: orders.id, rev: orders.rev, priority: orders.priority })
            .from(orders)
            .where(whereStore(orders, scope, inArray(orders.id, valid)))
            .for("update")
        : [];
      const byOrder = new Map(rows.map((r) => [r.id, r]));
      const out: BulkResult = { ok: [], failed: [] };
      const events: NewOrderEvent[] = [];
      for (const id of list) {
        const r = byOrder.get(id);
        if (!r) {
          out.failed.push({ id, error: "not_found" });
          continue;
        }
        out.ok.push(id);
        if (isPinned(r.priority) === pinned) continue;
        const rev = r.rev + 1;
        await tx
          .update(orders)
          .set({ priority: pinned ? r.priority + PIN_BOOST : Math.max(0, r.priority - PIN_BOOST), rev, updatedAt: new Date() })
          .where(and(byId(orders, scope, id), eq(orders.rev, r.rev)));
        events.push({ orderId: id, actorKind: "user", actorId: ctx.user.id, type: "priority_pinned", meta: { pinned }, rev });
      }
      if (events.length) await appendEvents(tx, scope, events);
      return out;
    });
  });
}

/**
 * The undo of a move inside its window (OPE-§12.5): the member's own token only, each order only while its rev still
 * equals the move's (anything since wins), as compensating writes (./transition.ts `undoTransition`). A token is
 * single-use; an expired or unknown one answers `expired`.
 */
export async function undoMove(ctx: WriteCtx, token: string): Promise<ActionResult<BulkResult>> {
  if (!ctx.can("orders.write")) return { ok: false, error: "forbidden" };
  if (typeof token !== "string" || !/^[0-9A-Z]{26}$/.test(token)) return { ok: false, error: "expired" };
  const t = undoCache.get(ctx.scope.storeId, token);
  if (!t || t.userId !== ctx.user.id || Date.now() - t.at > UNDO_TTL_MS) return { ok: false, error: "expired" };
  undoCache.delete(ctx.scope.storeId, token);
  const actor = actorFrom(ctx);
  const out: BulkResult = { ok: [], failed: [] };
  for (const e of t.entries) {
    const r = await undoTransition(actor, ctx.scope, e);
    if (r.ok) out.ok.push(e.orderId);
    else out.failed.push({ id: e.orderId, error: r.error });
  }
  return { ok: true, data: out };
}

/* ------------------------------------------------------------------ */
/* saved views (OPE-§12.2, §L)                                          */
/* ------------------------------------------------------------------ */

export interface SavedViewRow {
  id: string;
  name: string;
  shared: boolean;
  mine: boolean;
  position: number;
  query: OrderQuery;
}

/** The orders views the member sees: their personal ones, then the team's, each in its saved order. */
export async function listSavedViews(ctx: StoreCtx): Promise<SavedViewRow[]> {
  const rows = await db
    .select()
    .from(savedViews)
    .where(whereStore(savedViews, ctx.scope, eq(savedViews.surface, "orders"), or(eq(savedViews.userId, ctx.user.id), isNull(savedViews.userId))))
    .orderBy(sql`${savedViews.userId} IS NULL`, asc(savedViews.position), asc(savedViews.createdAt));
  return rows.flatMap((r) => {
    const q = OrderQuery.safeParse(r.query);
    return q.success ? [{ id: r.id, name: r.name, shared: r.userId === null, mine: r.userId === ctx.user.id, position: r.position, query: q.data }] : [];
  });
}

type ViewRefusal = "forbidden" | "invalid" | "limit" | "not_found";

/** A personal view (any member) or a shared one (orders.assign); ≤ 30 of each, the query validated (OPE-§12.2, §L). */
export async function saveView(ctx: WriteCtx, input: SavedViewInput): Promise<ActionResult<{ id: string }>> {
  const p = SavedViewInput.safeParse(input);
  if (!p.success) return { ok: false, error: "invalid" satisfies ViewRefusal };
  const { name, query, shared } = p.data;
  if (shared && !ctx.can("orders.assign")) return { ok: false, error: "forbidden" satisfies ViewRefusal };
  if (!(await pageIsTheStores(ctx.scope, query.pageId))) return { ok: false, error: "not_found" satisfies ViewRefusal };
  const owner = shared ? null : ctx.user.id;
  const [n] = await db
    .select({ n: count(), top: sql<number>`COALESCE(MAX(${savedViews.position}), -1)` })
    .from(savedViews)
    .where(whereStore(savedViews, ctx.scope, eq(savedViews.surface, "orders"), owner ? eq(savedViews.userId, owner) : isNull(savedViews.userId)));
  if (Number(n?.n ?? 0) >= SAVED_VIEWS_MAX) return { ok: false, error: "limit" satisfies ViewRefusal };
  const id = newId();
  await db.insert(savedViews).values(storeValues(ctx.scope, { id, userId: owner, surface: "orders" as const, name, query, position: Number(n?.top ?? -1) + 1 }));
  return { ok: true, data: { id } };
}

/** A view's page filter must name one of the store's pages (another store's id answers like a missing one). */
async function pageIsTheStores(scope: StoreScope, pageId: string | undefined): Promise<boolean> {
  if (!pageId) return true;
  const [row] = await db.select({ id: pages.id }).from(pages).where(byId(pages, scope, pageId)).limit(1);
  return !!row;
}

/** The views a member may change: their own, and the shared ones with orders.assign. */
const editableView = (ctx: StoreCtx) => (ctx.can("orders.assign") ? or(eq(savedViews.userId, ctx.user.id), isNull(savedViews.userId))! : eq(savedViews.userId, ctx.user.id));

export async function renameView(ctx: WriteCtx, id: string, name: string, query?: OrderQueryInput): Promise<ActionResult<{ id: string }>> {
  const p = SavedViewInput.safeParse({ name, query: query ?? {} });
  if (!p.success) return { ok: false, error: "invalid" satisfies ViewRefusal };
  if (query && !(await pageIsTheStores(ctx.scope, p.data.query.pageId))) return { ok: false, error: "not_found" satisfies ViewRefusal };
  const res = await db
    .update(savedViews)
    .set({ name: p.data.name, ...(query ? { query: p.data.query } : {}), updatedAt: new Date() })
    .where(whereStore(savedViews, ctx.scope, eq(savedViews.id, id), eq(savedViews.surface, "orders"), editableView(ctx)));
  return affected(res) === 1 ? { ok: true, data: { id } } : { ok: false, error: "not_found" satisfies ViewRefusal };
}

export async function deleteView(ctx: WriteCtx, id: string): Promise<ActionResult<{ id: string }>> {
  const res = await db.delete(savedViews).where(whereStore(savedViews, ctx.scope, eq(savedViews.id, id), eq(savedViews.surface, "orders"), editableView(ctx)));
  return affected(res) === 1 ? { ok: true, data: { id } } : { ok: false, error: "not_found" satisfies ViewRefusal };
}

/** Drag to reorder: positions follow `ids`; ids the member may not change (or another store's) are ignored. */
export async function reorderViews(ctx: WriteCtx, ids: string[]): Promise<ActionResult<{ moved: number }>> {
  if (!Array.isArray(ids) || ids.length > SAVED_VIEWS_MAX * 2) return { ok: false, error: "invalid" satisfies ViewRefusal };
  let moved = 0;
  await db.transaction(async (tx) => {
    for (const [i, id] of ids.entries()) {
      if (typeof id !== "string") continue;
      moved += affected(await tx.update(savedViews).set({ position: i }).where(whereStore(savedViews, ctx.scope, eq(savedViews.id, id), eq(savedViews.surface, "orders"), editableView(ctx))));
    }
  });
  return { ok: true, data: { moved } };
}

/* ------------------------------------------------------------------ */
/* test orders (OPE-§26, SF-05)                                          */
/* ------------------------------------------------------------------ */

/**
 * The store's `is_test` orders created before `olderThan`, at most `limit` per call, with their order_events
 * (`orders_store_test_idx`), and `customers.test_count` recomputed for the customers they belonged to. No other order
 * can be deleted. P8's housekeeping calls it after 30 days (core §H.11); "Delete test orders" after 1 hour.
 */
export async function deleteTestOrders(scope: WriteScope, opts: { olderThan: Date; limit: number }): Promise<{ deleted: number }> {
  const limit = Math.max(1, Math.min(10_000, Math.floor(opts.limit)));
  const rows = await db
    .select({ id: orders.id, customerId: orders.customerId })
    .from(orders)
    .where(whereStore(orders, scope, eq(orders.isTest, true), lt(orders.createdAt, opts.olderThan)))
    .orderBy(asc(orders.createdAt))
    .limit(limit);
  if (!rows.length) return { deleted: 0 };
  const ids = rows.map((r) => r.id);
  const custIds = [...new Set(rows.map((r) => r.customerId).filter((c): c is string => !!c))];
  let deleted = 0;
  await db.transaction(async (tx) => {
    for (let i = 0; i < ids.length; i += 500) {
      const part = ids.slice(i, i + 500);
      await tx.delete(orderEvents).where(whereStore(orderEvents, scope, inArray(orderEvents.orderId, part)));
      deleted += affected(await tx.delete(orders).where(whereStore(orders, scope, inArray(orders.id, part), eq(orders.isTest, true))));
    }
    if (custIds.length) {
      const live = alias(orders, "live");
      const left = tx
        .select({ n: sql<number>`COUNT(*)` })
        .from(live)
        .where(whereStore(live, scope, eq(live.customerId, customers.id), eq(live.isTest, true)));
      await tx
        .update(customers)
        .set({ testCount: sql`(${left})` })
        .where(whereStore(customers, scope, inArray(customers.id, custIds)));
    }
  });
  return { deleted };
}

/** "Delete test orders" (settings.write, OPE-§26): every test order older than 1 hour, audited with the count. */
export async function deleteTestOrdersNow(ctx: WriteCtx): Promise<ActionResult<{ deleted: number }>> {
  if (!ctx.can("settings.write")) return { ok: false, error: "forbidden" };
  const res = await deleteTestOrders(ctx.scope, { olderThan: new Date(Date.now() - 3_600_000), limit: 10_000 });
  await auditIn(ctx.scope, ctx.actor, "orders.test_deleted", { meta: { count: res.deleted } });
  return { ok: true, data: res };
}

/* ------------------------------------------------------------------ */
/* the Carrier CSV and the slips (OPE-§12.8, OD49, OD55, OD64)          */
/* ------------------------------------------------------------------ */

/** What the warehouse packs: the order text with codes, or for an R1.0 row without units "1 × Product (pack)". */
function packText(items: OrderItems, productName: string, qty: number, orderId?: string): string {
  const text = orderTextOf(items, { mode: "warehouse", ...(orderId ? { orderId } : {}) });
  return text || `${qty} × ${productName}${items?.bundleLabel ? ` (${items.bundleLabel})` : ""}`;
}

/** `?ids=A,B,…`: ≤ 200 distinct order ids (well-formed), or null. */
export function idsParam(raw: string | null | undefined, max = CARRIER_CSV_MAX_ORDERS): string[] | null {
  const list = [...new Set(String(raw ?? "").split(",").map((x) => x.trim().toUpperCase()).filter(Boolean))];
  if (!list.length || list.length > max || !list.every((id) => ORDER_ID_FORMAT.test(id))) return null;
  return list;
}

export type CarrierExport =
  | { ok: true; csv: string; exported: string[]; packed: string[]; refused: { held: string[]; notFound: string[] } }
  | { ok: false; error: "not_configured" | "invalid" | "refused"; held?: string[]; notFound?: string[]; exportable?: number };

/**
 * The Carrier CSV of `ids` (shipments.write; the route checked the fresh step-up, OD64): the store's orders only,
 * the member's visibility applied; held orders (`ship_after > now`, OD49) and ids that are not the store's are refused
 * with their ids. Without `partial` any refusal answers `refused` and writes nothing; with it the rest is exported.
 * Per exported order one `manifest_exported` (meta `why: "manifest"`), and with `markPacked` the L move
 * to_pack → packed (source "bulk"; a second export leaves the axis alone). The audit row is the route's.
 */
export async function carrierExport(ctx: WriteCtx, ids: readonly string[], opts: { partial?: boolean; now?: Date } = {}): Promise<CarrierExport> {
  const { scope } = ctx;
  const spec = (await getStoreSetting(scope, "ops")).carrierCsv;
  if (!spec) return { ok: false, error: "not_configured" };
  if (!ids.length || ids.length > CARRIER_CSV_MAX_ORDERS) return { ok: false, error: "invalid" };
  const now = opts.now ?? new Date(Date.now());
  const rows = await db
    .select({
      id: orders.id,
      name: orders.name,
      phone: orders.phone,
      city: orders.city,
      address: orders.address,
      landmark: orders.landmark,
      total: orders.total,
      items: orders.items,
      productName: orders.productName,
      qty: orders.qty,
      note: orders.note,
      shipAfter: orders.shipAfter,
      shipState: orders.shipState,
      assigneeId: orders.assigneeId,
      confirmedBy: orders.confirmedBy,
    })
    .from(orders)
    .where(whereStore(orders, scope, inArray(orders.id, [...ids])));
  const viewer = viewerOf(ctx);
  const byOrder = new Map(rows.filter((r) => viewerSeesOrder(scope, viewer, r, false)).map((r) => [r.id, r]));
  const notFound = ids.filter((id) => !byOrder.has(id));
  const manifest = ids.flatMap((id) => {
    const r = byOrder.get(id);
    if (!r) return [];
    const m: ManifestRow & { shipState: ShipState } = {
      orderId: r.id,
      name: r.name,
      phone: r.phone,
      city: r.city,
      address: r.address,
      landmark: r.landmark,
      totalCents: toCents(r.total),
      content: packText(r.items, r.productName, r.qty),
      qty: r.qty,
      note: r.note,
      shipAfter: r.shipAfter,
      shipState: r.shipState,
    };
    return [m];
  });
  const plan = planCarrierCsv(manifest, now);
  if ((!opts.partial && (plan.held.length || notFound.length)) || !plan.ok.length) {
    return { ok: false, error: "refused", held: plan.held, notFound, exportable: plan.ok.length };
  }
  const csv = writeCarrierCsv(plan.ok, spec, { locale: ctx.store.defaultLocale, now });
  const exported = plan.ok.map((r) => r.orderId);
  await db.transaction((tx) =>
    appendEvents(
      tx,
      scope,
      exported.map((orderId) => ({ orderId, actorKind: "user" as const, actorId: ctx.user.id, type: "manifest_exported" as const, meta: { why: "manifest" } })),
    ),
  );
  const packed: string[] = [];
  if (spec.markPacked) {
    const actor = actorFrom(ctx);
    for (const r of plan.ok) {
      if (r.shipState !== "to_pack") continue;
      const res = await transitionOrder(actor, scope, { orderId: r.orderId, want: { ship: "packed" }, source: "bulk" });
      if (res.ok && res.changed) packed.push(r.orderId);
    }
  }
  return { ok: true, csv, exported, packed, refused: { held: plan.held, notFound } };
}

/** One order slip (OPE-§12.8): what the warehouse packs, never a full phone. */
export interface SlipRow {
  id: string;
  createdAt: string;
  /** the warehouse text: codes, short names, markers */
  items: string;
  qty: number;
  city: string | null;
  phoneMasked: string;
  note: string | null;
  landmark: string | null;
  shipAfter: string | null;
  held: boolean;
  trackingRef: string | null;
  carrierLabel: string | null;
}

/** The slips of `ids` (orders.read + shipments.write) in the asked order, held orders last (OD49). */
export async function slipsFor(ctx: StoreCtx, ids: readonly string[], now = new Date(Date.now())): Promise<SlipRow[]> {
  const { scope } = ctx;
  if (!ids.length) return [];
  const rows = await db
    .select({
      id: orders.id,
      createdAt: orders.createdAt,
      items: orders.items,
      productName: orders.productName,
      qty: orders.qty,
      city: orders.city,
      phone: orders.phone,
      note: orders.note,
      landmark: orders.landmark,
      shipAfter: orders.shipAfter,
      trackingRef: orders.trackingRef,
      carrierLabel: orders.carrierLabel,
      assigneeId: orders.assigneeId,
      confirmedBy: orders.confirmedBy,
    })
    .from(orders)
    .where(whereStore(orders, scope, inArray(orders.id, [...ids])));
  const viewer = viewerOf(ctx);
  const byOrder = new Map(rows.filter((r) => viewerSeesOrder(scope, viewer, r, false)).map((r) => [r.id, r]));
  const out = ids.flatMap((id) => {
    const r = byOrder.get(id);
    if (!r) return [];
    const m = maskCustomer(scope, { city: r.city, note: r.note, phone: r.phone });
    const held = !!r.shipAfter && r.shipAfter.getTime() > now.getTime();
    const slip: SlipRow = {
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      items: packText(r.items, r.productName, r.qty, r.id),
      qty: r.qty,
      city: m.city ?? null,
      phoneMasked: scope.kind === "impersonation" ? (m.phone ?? "") : maskPhone(r.phone),
      note: m.note ?? null,
      landmark: scope.kind === "impersonation" ? (r.landmark ? HIDDEN_EMAIL : null) : r.landmark,
      shipAfter: iso(r.shipAfter),
      held,
      trackingRef: r.trackingRef,
      carrierLabel: r.carrierLabel,
    };
    return [slip];
  });
  return [...out.filter((s) => !s.held), ...out.filter((s) => s.held)];
}

/** "Mark exported orders as packed", the column list and the delimiter (shipments.write → ops.carrierCsv, OD55). */
export async function saveCarrierCsvColumns(ctx: WriteCtx, input: unknown): Promise<ActionResult<{ columns: number }>> {
  if (!ctx.can("shipments.write")) return { ok: false, error: "forbidden" };
  const ops = await getStoreSetting(ctx.scope, "ops");
  const next = OpsSetting.shape.carrierCsv.safeParse(input);
  if (!next.success || !next.data) return { ok: false, error: "invalid" };
  await setStoreSetting(ctx.scope, "ops", { ...ops, carrierCsv: next.data }, settingsActor(ctx.actor));
  return { ok: true, data: { columns: next.data.columns.length } };
}
