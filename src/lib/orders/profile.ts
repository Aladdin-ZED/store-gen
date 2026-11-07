import "server-only";
/**
 * Order reads for the console, the dashboard and Store Health (P4 CALL CENTER; operations.md OPE-§27.1; docs/STORE-SAAS.md
 * §K.2 P0, OPE Q.8, LAN Q17, PLA Q.11, PLA Q4.10). Every function is a deterministic read over the store's own rows,
 * test and honeypot orders excluded from the counts, a rate never without its n (OD38), no customer field beyond a
 * first name with an initial and a masked phone (core §F.11). Console readers take the console's read-only
 * `platformScope`. Typed stubs frozen at P0; where PLA Q.11 and OPE-§27.1 disagree, operations' signatures stand
 * (core §Q.9, PLA Q4.10 "the signatures are operations'").
 *
 * P4 step 7 fills the bodies:
 *   orderKpis              live from `order_events` and `orders` over store-local days, 60 s (`ops-kpis`)
 *   queueCounts            the board tiles, one read per tile group, 5 s (`ops-qc`); the work tiles count test orders
 *                          (the queue hands them out with a TEST chip, OD31), the first-touch and abandoned tiles do not
 *   listOrdersForConsole   keyset on (created_at, id) newest first, ≤ 50; first name + initial and a masked phone
 *   getOrderForConsole     the row, the warehouse text, a codes-only timeline, the sheet state and outbox items
 *   recordPlatformReveal   the single staff write (D71): `phone_revealed` through `platformRevealScope`, audited
 *   orderRiskMix           the 28-day risk bands of real orders, honeypots apart
 *   searchOrders           ⌘K: id prefix, ≥ 4 phone digits, exact tracking_ref; agents their own queue plus the
 *                          exact-phone inbound lookup (≥ 8 digits, the `inbound` bucket, remembered like a lookup)
 */
import { and, count, desc, eq, gt, gte, inArray, isNull, like, lt, lte, max, min, notInArray, or, sql, type SQL } from "drizzle-orm";
import { can, type StoreRole } from "@/lib/auth/permissions";
import type { SearchHit } from "@/lib/admin-data/search/types";
import { auditFrom } from "@/lib/audit";
import { INBOUND_LIMIT, INBOUND_MIN_DIGITS, inboundLookupsThisHour } from "@/lib/callcenter/inbound";
import { dayBounds, notHoneypot, spanOf, trailingDays } from "@/lib/callcenter/insights-sql";
import { confirmationRate, deliveryRate, firstTouchP50, riskyShare as riskyShareKpi, unreachableRate } from "@/lib/callcenter/kpis";
import { isLive, opsNow } from "@/lib/callcenter/presence";
import { rememberInbound } from "@/lib/callcenter/visibility";
import { addDaysYmd, hasRanges, storeYmd, windowMinutesBetween } from "@/lib/callcenter/window";
import { callingWindowFor } from "@/lib/callcenter/window.server";
import { db } from "@/lib/db/client";
import { agentProfiles, customers, orderEvents, orders, outbox } from "@/lib/db/schema";
import { toCents } from "@/lib/finance/lite/cents";
import { normalizePhone, toAsciiDigits } from "@/lib/markets/phone";
import { maskIfImpersonation, maskName } from "@/lib/platform/mask";
import { platformRevealScope } from "@/lib/platform/seam";
import { rateLimit, storeBucket } from "@/lib/security/rate-limit";
import { getStoreSetting } from "@/lib/settings";
import { scopedCache } from "@/lib/tenancy/cache";
import { getStoreById } from "@/lib/tenancy/public";
import { byId, whereStore } from "@/lib/tenancy/sql";
import type { PlatformCtx, StoreScope } from "@/lib/tenancy/types";
import { appHref } from "@/lib/urls";
import type { OrderStatus } from "./contract";
import { appendEvents, type OrderEventType } from "./events";
import { maskPhone } from "./masking";
import { CONFIRM_STATES, projectStatus, SHIP_STATES, type ConfirmState, type MoneyState, type OrderStates, type ShipState } from "./state";
import { orderText } from "./text";
import type { OrderActor } from "./transition";
import { orderItemsView } from "@/lib/orders/items-v3";

/** a rate never travels without its n (OD38); below `min` the value is withheld */
export type Kpi = { value: number; n: number; min: number } | { n: number; min: number; insufficient: true };

export interface OrderKpis {
  window: "today" | "7d" | "28d";
  placed: number;
  confirmed: number;
  delivered: number;
  decided: number;
  confirmationRate: Kpi;
  deliveryRate: Kpi;
  firstTouchP50Min: Kpi;
  unreachableRate: Kpi;
  /** risk ≥ 50 ÷ placed */
  riskyShare: Kpi;
  lastOrderAt: string | null;
  computedAt: string;
}

/** Board tiles and the Today brief (rev 3 fields: OD48, OPS-29, OD49, OD53). */
export interface QueueCounts {
  toCallNow: number;
  callbacksDue: number;
  waitingRetry: number;
  firstTouchBreaches: number;
  abandonedToday: number;
  liveAgents: number;
  oldestCallbackOverdueMin: number | null;
  deliveryRescue: number;
  oldestRescueMin: number | null;
  toShip: number;
  oldestToShipDays: number | null;
  holds: number;
  nextHoldDay: string | null;
  inboundLookupsHour: number;
}

/** One order in the console list: never the address, the note or the e-mail (OPE-§27.1, core §F.11). */
export interface ConsoleOrderRow {
  id: string;
  createdAt: string;
  states: OrderStates;
  status: OrderStatus;
  totalCents: number;
  currency: string;
  city: string | null;
  /** first name + initial ("Salma B.") */
  customer: string;
  phoneMasked: string;
  risk: number;
  isTest: boolean;
  /** PLA Q4.10: null for an order without a landing page (manual, R2 storefront) */
  pageId: string | null;
  /** D74 (OD55): the R1 carrier loop */
  carrierLabel: string | null;
  trackingRef: string | null;
  /** when the order last left in a Carrier CSV (`manifest_exported`) */
  carrierExportedAt: string | null;
}

/** A timeline line as the console sees it: codes only, no free text (notes and edit details stay in the store). */
export interface ConsoleTimelineItem {
  id: number;
  at: string;
  type: OrderEventType;
  actorKind: OrderActor["kind"] | "platform";
  fromState: string | null;
  toState: string | null;
  reasonCode: string | null;
}

export interface ConsoleOrderDetail extends ConsoleOrderRow {
  /** the warehouse text (src/lib/orders/text.ts) */
  itemsText: string;
  timeline: ConsoleTimelineItem[];
  /** integration states: the sheet row and the order's outbox items by kind */
  integrations: { sheet: "pending" | "synced" | "failed" | "disabled"; outbox: { kind: string; topic: string; state: string }[] };
}

/* ------------------------------------------------------------------ */
/* shared                                                              */
/* ------------------------------------------------------------------ */

const DECIDED = ["confirmed", "cancelled", "unreachable", "fake", "duplicate"] as const;
const FINAL = ["delivered", "refused", "returned", "lost"] as const;
const OPEN_FRESH = ["new", "attempting"] as const;
const TO_SHIP = ["to_pack", "packed"] as const;
const ORDER_ID_RE = /^[A-Z0-9]{2,8}-[A-Z0-9]{4,12}$/;
const MINUTE = 60_000;

/** not a test order, not a honeypot (core D54, OPE-§10.2) */
const realOrder = and(eq(orders.isTest, false), notHoneypot)!;
const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);
const num = (v: unknown): number => Number(v ?? 0) || 0;
const asDate = (v: Date | string | null | undefined): Date | null => (v instanceof Date ? v : v ? new Date(`${String(v).replace(" ", "T")}Z`) : null);
const ROLES: readonly string[] = ["owner", "admin", "manager", "editor", "logistics", "accountant", "agent", "viewer"];
const isRole = (r: string): r is StoreRole => ROLES.includes(r);

const kpisCache = scopedCache<OrderKpis>({ name: "ops-kpis", maxEntries: 8_000, ttlMs: 60_000 });
const countsCache = scopedCache<QueueCounts>({ name: "ops-qc", maxEntries: 4_000, ttlMs: 5_000 });

/* ------------------------------------------------------------------ */
/* orderKpis                                                           */
/* ------------------------------------------------------------------ */

/** Health inputs, the console Overview, dashboard tiles; scopedCache("ops-kpis") 60 s. */
export async function orderKpis(scope: StoreScope, window: OrderKpis["window"]): Promise<OrderKpis> {
  const days = window === "today" ? 1 : window === "7d" ? 7 : 28;
  const w = await callingWindowFor(scope);
  const now = opsNow();
  return kpisCache.getOrLoad(scope.storeId, `${window}:${storeYmd(now, w.tz)}`, async () => {
    const { from, to } = spanOf(trailingDays(w.tz, now, days));
    const [[placed], moves, touches, [last]] = await Promise.all([
      db
        .select({ n: count(), risky: sql<number>`SUM(${orders.riskScore} >= 50)` })
        .from(orders)
        .where(whereStore(orders, scope, gte(orders.createdAt, from), lt(orders.createdAt, to), realOrder)),
      db
        .select({ to: orderEvents.toState, n: sql<number>`COUNT(DISTINCT ${orderEvents.orderId})` })
        .from(orderEvents)
        .innerJoin(orders, and(eq(orders.storeId, orderEvents.storeId), eq(orders.id, orderEvents.orderId)))
        .where(whereStore(orderEvents, scope, eq(orderEvents.type, "state_changed"), inArray(orderEvents.toState, [...DECIDED, ...FINAL]), gte(orderEvents.at, from), lt(orderEvents.at, to), realOrder))
        .groupBy(orderEvents.toState),
      db
        .select({ createdAt: orders.createdAt, touchedAt: orders.firstTouchAt })
        .from(orders)
        .where(whereStore(orders, scope, gte(orders.firstTouchAt, from), lt(orders.firstTouchAt, to), gte(orders.createdAt, new Date(from.getTime() - 30 * 86_400_000)), realOrder))
        .limit(20_000),
      db.select({ at: max(orders.createdAt) }).from(orders).where(whereStore(orders, scope, realOrder)),
    ]);
    const by = Object.fromEntries(moves.map((m) => [m.to ?? "", num(m.n)])) as Record<string, number>;
    const c = { confirmed: by.confirmed ?? 0, cancelled: by.cancelled ?? 0, unreachable: by.unreachable ?? 0 };
    const finals = { delivered: by.delivered ?? 0, refused: by.refused ?? 0, returned: by.returned ?? 0, lost: by.lost ?? 0 };
    const minutes = touches.flatMap((t) => (t.touchedAt ? [windowMinutesBetween(t.createdAt, t.touchedAt, w)] : []));
    const placedN = num(placed?.n);
    return {
      window,
      placed: placedN,
      confirmed: c.confirmed,
      delivered: finals.delivered,
      decided: DECIDED.reduce((s, k) => s + (by[k] ?? 0), 0),
      confirmationRate: confirmationRate(c, "store"),
      deliveryRate: deliveryRate(finals, "store"),
      firstTouchP50Min: firstTouchP50(minutes, "store"),
      unreachableRate: unreachableRate(c, "store"),
      riskyShare: riskyShareKpi({ risky: num(placed?.risky), placed: placedN }),
      lastOrderAt: iso(asDate(last?.at ?? null)),
      computedAt: now.toISOString(),
    };
  });
}

/* ------------------------------------------------------------------ */
/* queueCounts                                                         */
/* ------------------------------------------------------------------ */

/**
 * The board tiles (OPE-§14.1) and the Today brief, one read per tile group, 5 s per store. Work tiles (to call,
 * callbacks, retry, delivery problems, to ship, holds) count every order in the queue, test orders too (they are
 * handed out with a TEST chip, OD31); first-touch breaches and abandoned claims are KPIs and count real orders only.
 */
export async function queueCounts(scope: StoreScope): Promise<QueueCounts> {
  return countsCache.getOrLoad(scope.storeId, "counts", () => loadQueueCounts(scope));
}

async function loadQueueCounts(scope: StoreScope): Promise<QueueCounts> {
  const now = opsNow();
  const [w, ops] = await Promise.all([callingWindowFor(scope), getStoreSetting(scope, "ops")]);
  const today = storeYmd(now, w.tz);
  const dayStart = dayBounds(w.tz, today, today)[0]!.from;
  const free = or(isNull(orders.leaseUntil), lt(orders.leaseUntil, now));
  const due = or(isNull(orders.dueAt), lte(orders.dueAt, now));
  const confirmedIn = (states: readonly ShipState[]) => and(eq(orders.confirmState, "confirmed"), inArray(orders.shipState, [...states]));
  const notHeld = or(isNull(orders.shipAfter), lte(orders.shipAfter, now));
  const [[toCall], [callbacks], [retry], fresh, [abandoned], agents, [rescue], [toShip], [holds]] = await Promise.all([
    db.select({ n: count() }).from(orders).where(whereStore(orders, scope, inArray(orders.confirmState, [...OPEN_FRESH]), due, free)),
    db.select({ n: count(), oldest: min(orders.dueAt) }).from(orders).where(whereStore(orders, scope, eq(orders.confirmState, "callback"), lte(orders.dueAt, now))),
    db.select({ n: count() }).from(orders).where(whereStore(orders, scope, eq(orders.confirmState, "attempting"), gt(orders.dueAt, now))),
    // first-touch candidates: new, never attempted, older than the target in wall time (window time ≤ wall time)
    db
      .select({ createdAt: orders.createdAt })
      .from(orders)
      .where(whereStore(orders, scope, eq(orders.confirmState, "new"), isNull(orders.firstTouchAt), lte(orders.createdAt, new Date(now.getTime() - ops.firstTouchTargetMin * MINUTE)), realOrder))
      .limit(2_000),
    db
      .select({ n: count() })
      .from(orderEvents)
      .innerJoin(orders, and(eq(orders.storeId, orderEvents.storeId), eq(orders.id, orderEvents.orderId)))
      .where(whereStore(orderEvents, scope, eq(orderEvents.type, "released"), eq(orderEvents.reasonCode, "lease_expired"), gte(orderEvents.at, dayStart), realOrder)),
    db.select({ userId: agentProfiles.userId, presence: agentProfiles.presence, lastSeenAt: agentProfiles.lastSeenAt }).from(agentProfiles).where(whereStore(agentProfiles, scope)),
    db
      .select({
        n: count(),
        oldest: sql<Date | string | null>`MIN((SELECT MAX(e.at) FROM order_events e WHERE e.store_id = ${orders.storeId} AND e.order_id = ${orders.id} AND e.type = 'state_changed' AND e.to_state = 'attempt_failed'))`,
      })
      .from(orders)
      .where(whereStore(orders, scope, confirmedIn(["attempt_failed"]))),
    db.select({ n: count(), oldest: min(orders.confirmedAt) }).from(orders).where(whereStore(orders, scope, confirmedIn(TO_SHIP), notHeld)),
    db.select({ n: count(), next: min(orders.shipAfter) }).from(orders).where(whereStore(orders, scope, confirmedIn(TO_SHIP), gt(orders.shipAfter, now))),
  ]);
  const breaches = fresh.filter((f) => windowMinutesBetween(f.createdAt, now, w) > ops.firstTouchTargetMin).length;
  const callbackOldest = asDate(callbacks?.oldest);
  const rescueOldest = asDate(rescue?.oldest);
  const shipOldest = asDate(toShip?.oldest);
  let oldestToShipDays: number | null = null;
  if (shipOldest) {
    // calling days (with at least one range) since the confirmation day, today included
    let d = storeYmd(shipOldest, w.tz);
    oldestToShipDays = 0;
    for (let i = 0; d < today && i < 120; i++) {
      d = addDaysYmd(d, 1);
      if (hasRanges(d, w)) oldestToShipDays++;
    }
  }
  const lookups = await inboundLookupsThisHour(scope, agents.map((a) => a.userId));
  const nextHold = asDate(holds?.next);
  const minutesSince = (d: Date | null) => (d ? Math.max(0, Math.floor((now.getTime() - d.getTime()) / MINUTE)) : null);
  return {
    toCallNow: num(toCall?.n),
    callbacksDue: num(callbacks?.n),
    waitingRetry: num(retry?.n),
    firstTouchBreaches: breaches,
    abandonedToday: num(abandoned?.n),
    liveAgents: agents.filter((a) => isLive(a, now)).length,
    oldestCallbackOverdueMin: minutesSince(callbackOldest),
    deliveryRescue: num(rescue?.n),
    oldestRescueMin: minutesSince(rescueOldest),
    toShip: num(toShip?.n),
    oldestToShipDays,
    holds: num(holds?.n),
    nextHoldDay: nextHold ? storeYmd(nextHold, w.tz) : null,
    inboundLookupsHour: Object.values(lookups).reduce((s, n) => s + n, 0),
  };
}

/** Forget the cached KPIs and tiles of a store (tests; a store's purge goes through `invalidateStore`). */
export function forgetOrderInsights(scope: StoreScope): void {
  kpisCache.delete(scope.storeId);
  countsCache.delete(scope.storeId);
}

/* ------------------------------------------------------------------ */
/* console reads                                                       */
/* ------------------------------------------------------------------ */

const consoleColumns = {
  id: orders.id,
  createdAt: orders.createdAt,
  confirmState: orders.confirmState,
  shipState: orders.shipState,
  moneyState: orders.moneyState,
  total: orders.total,
  currency: orders.currency,
  city: orders.city,
  name: orders.name,
  phone: orders.phone,
  riskScore: orders.riskScore,
  isTest: orders.isTest,
  pageId: orders.pageId,
  source: orders.source,
  carrierLabel: orders.carrierLabel,
  trackingRef: orders.trackingRef,
  exportedAt: sql<Date | string | null>`(SELECT MAX(x.at) FROM order_events x WHERE x.store_id = ${orders.storeId} AND x.order_id = ${orders.id} AND x.type = 'manifest_exported')`,
};

interface ConsoleRaw {
  id: string;
  createdAt: Date;
  confirmState: ConfirmState;
  shipState: ShipState;
  moneyState: string;
  total: number;
  currency: string;
  city: string | null;
  name: string;
  phone: string;
  riskScore: number;
  isTest: boolean;
  pageId: string;
  source: string;
  carrierLabel: string | null;
  trackingRef: string | null;
  exportedAt: Date | string | null;
}

/** a manual, storefront, WhatsApp or API order has no landing page (PLA Q4.10) */
const NO_PAGE_SOURCES: ReadonlySet<string> = new Set(["manual", "storefront", "whatsapp", "api"]);

function consoleRow(r: ConsoleRaw): ConsoleOrderRow {
  const states: OrderStates = { confirm: r.confirmState, ship: r.shipState, money: r.moneyState as MoneyState };
  return {
    id: r.id,
    createdAt: r.createdAt.toISOString(),
    states,
    status: projectStatus(states),
    totalCents: toCents(r.total),
    currency: r.currency,
    city: r.city,
    customer: maskName(r.name),
    phoneMasked: maskPhone(r.phone),
    risk: r.riskScore,
    isTest: r.isTest,
    pageId: NO_PAGE_SOURCES.has(r.source) ? null : r.pageId,
    carrierLabel: r.carrierLabel,
    trackingRef: r.trackingRef,
    carrierExportedAt: iso(asDate(r.exportedAt)),
  };
}

/** the keyset cursor: "<createdAt ISO>~<id>" */
const cursorOf = (r: { createdAt: Date; id: string }): string => `${r.createdAt.toISOString()}~${r.id}`;

function parseCursor(c: string | undefined): { at: Date; id: string } | null {
  if (!c || c.length > 80) return null;
  const [at, id] = c.split("~");
  const d = at ? new Date(at) : null;
  return d && !Number.isNaN(d.getTime()) && id && ORDER_ID_RE.test(id) ? { at: d, id } : null;
}

/** "YYYY-MM-DD" (a store-local day: its start, or its end for `to`) or a full ISO instant; null when neither. */
function boundOf(v: string | undefined, tz: string, end: boolean): Date | null {
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const b = dayBounds(tz, v, v)[0];
    return b ? (end ? b.to : b.from) : null;
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function listOrdersForConsole(
  scope: StoreScope,
  q: { state?: ConfirmState | ShipState; from?: string; to?: string; after?: string; limit?: number /* ≤ 50 */ },
): Promise<{ items: ConsoleOrderRow[]; next: string | null }> {
  const limit = Math.max(1, Math.min(50, Math.floor(q.limit ?? 50)));
  const tz = (await getStoreById(scope.storeId))?.timezone || "Africa/Casablanca";
  const conds: (SQL | undefined)[] = [];
  if (q.state && (CONFIRM_STATES as readonly string[]).includes(q.state)) conds.push(eq(orders.confirmState, q.state as ConfirmState));
  else if (q.state && (SHIP_STATES as readonly string[]).includes(q.state)) conds.push(eq(orders.shipState, q.state as ShipState));
  else if (q.state) return { items: [], next: null };
  const from = boundOf(q.from, tz, false);
  const to = boundOf(q.to, tz, true);
  if (from) conds.push(gte(orders.createdAt, from));
  if (to) conds.push(lt(orders.createdAt, to));
  const after = parseCursor(q.after);
  if (after) conds.push(or(lt(orders.createdAt, after.at), and(eq(orders.createdAt, after.at), lt(orders.id, after.id))));
  const rows = (await db
    .select(consoleColumns)
    .from(orders)
    .where(whereStore(orders, scope, ...conds))
    .orderBy(desc(orders.createdAt), desc(orders.id))
    .limit(limit + 1)) as ConsoleRaw[];
  const page = rows.slice(0, limit);
  return { items: page.map(consoleRow), next: rows.length > limit ? cursorOf(page[page.length - 1]!) : null };
}

/** Still masked; null for an order of another store. */
export async function getOrderForConsole(scope: StoreScope, orderId: string): Promise<ConsoleOrderDetail | null> {
  if (typeof orderId !== "string" || !ORDER_ID_RE.test(orderId)) return null;
  const [r] = await db
    .select({ ...consoleColumns, items: orders.items, productName: orders.productName, sheetStatus: orders.sheetStatus })
    .from(orders)
    .where(byId(orders, scope, orderId))
    .limit(1);
  if (!r) return null;
  const [events, items] = await Promise.all([
    db
      .select({ id: orderEvents.id, at: orderEvents.at, type: orderEvents.type, actorKind: orderEvents.actorKind, fromState: orderEvents.fromState, toState: orderEvents.toState, reasonCode: orderEvents.reasonCode })
      .from(orderEvents)
      .where(whereStore(orderEvents, scope, eq(orderEvents.orderId, orderId)))
      .orderBy(desc(orderEvents.at), desc(orderEvents.id))
      .limit(100),
    // the order's outbox items: their dedupe keys carry the order id (OPE-§20.4, §21.3)
    db
      .select({ kind: outbox.kind, topic: outbox.topic, state: outbox.state })
      .from(outbox)
      .where(whereStore(outbox, scope, like(outbox.dedupeKey, `%:${orderId}%`)))
      .orderBy(desc(outbox.createdAt))
      .limit(20),
  ]);
  return {
    ...consoleRow(r as ConsoleRaw),
    itemsText: orderText(orderItemsView(r.items), { mode: "warehouse", orderId: r.id, productName: r.productName }),
    timeline: events.map((e) => ({
      id: e.id,
      at: e.at.toISOString(),
      type: e.type as OrderEventType,
      actorKind: e.actorKind as ConsoleTimelineItem["actorKind"],
      fromState: e.fromState,
      toState: e.toState,
      // a coded reason only: a free text never reaches the console
      reasonCode: e.reasonCode && /^[a-z0-9_.:-]{1,32}$/.test(e.reasonCode) ? e.reasonCode : null,
    })),
    integrations: { sheet: r.sheetStatus, outbox: items.map((i) => ({ kind: i.kind, topic: i.topic, state: i.state })) },
  };
}

/**
 * `pii.reveal` ↑ (core §A.3.3): the only way platform code sees an order's customer fields, null for an order of
 * another store. The single writer of both the `platform.pii.revealed` audit row (store_id, meta { orderId, reason })
 * and the `phone_revealed` order event (actor_kind "platform"), through `platformRevealScope(ctx, scope)`
 * (src/lib/platform/seam.ts, lint L6 `reveal-scope`); P1's `revealOrderPiiAction` calls it with
 * `platformScope(ctx, storeId)` and writes no audit row. The answer is never cached, never logged (PLA-§7.4, PL-07).
 * P0b (CCR P1-9): the fields beyond `e164` are additive. P0b review F-3: `scope` is the console's platform scope (the
 * reveal scope upgrades it, never a bare id), and the WriteScope never leaves this file (lint L6 `reveal-escape`).
 */
export async function recordPlatformReveal(
  ctx: PlatformCtx,
  scope: StoreScope & { readonly kind: "platform" },
  orderId: string,
  reason: string,
): Promise<{ e164: string; name: string; address: string | null; city: string | null; note: string | null } | null> {
  if (typeof orderId !== "string" || !ORDER_ID_RE.test(orderId)) return null;
  const why = String(reason ?? "").trim().slice(0, 200);
  if (!why) return null;
  const [r] = await db
    .select({ phone: orders.phone, name: orders.name, address: orders.address, city: orders.city, note: orders.note })
    .from(orders)
    .where(byId(orders, scope, orderId))
    .limit(1);
  if (!r) return null;
  // the staff write scope (pii.reveal + a fresh step-up, checked again there) goes straight into the event writer
  await appendEvents(db, platformRevealScope(ctx, scope), [{ orderId, actorKind: "platform", actorId: ctx.user.id, type: "phone_revealed", meta: { why: "view" } }]);
  await auditFrom(ctx, "platform.pii.revealed", { storeId: scope.storeId, target: orderId, meta: { orderId, reason: why } });
  return { e164: r.phone, name: r.name, address: r.address, city: r.city, note: r.note };
}

/** Signup-risk and store-risk signals (platform.md): risk bands only, real orders of the last 28 days. */
export async function orderRiskMix(scope: StoreScope, days: 28): Promise<{ low: number; check: number; high: number; honeypot: number; n: number }> {
  const since = new Date(opsNow().getTime() - Math.min(90, Math.max(1, days)) * 86_400_000);
  const honeypot = sql`(${orders.flags} IS NOT NULL AND ${orders.flags} LIKE '%"honeypot"%')`;
  const [r] = await db
    .select({
      n: count(),
      honeypot: sql<number>`SUM(${honeypot})`,
      low: sql<number>`SUM(NOT ${honeypot} AND ${orders.riskScore} < 50)`,
      check: sql<number>`SUM(NOT ${honeypot} AND ${orders.riskScore} >= 50 AND ${orders.riskScore} < 70)`,
      high: sql<number>`SUM(NOT ${honeypot} AND ${orders.riskScore} >= 70)`,
    })
    .from(orders)
    .where(whereStore(orders, scope, gte(orders.createdAt, since), eq(orders.isTest, false)));
  return { low: num(r?.low), check: num(r?.check), high: num(r?.high), honeypot: num(r?.honeypot), n: num(r?.n) };
}

/* ------------------------------------------------------------------ */
/* ⌘K                                                                  */
/* ------------------------------------------------------------------ */

/** what an inbound lookup lists (OPE-§5.7): confirm open (unreachable included), or confirmed and not final */
const OPEN_FOR_INBOUND = or(inArray(orders.confirmState, ["new", "attempting", "callback", "unreachable"]), and(eq(orders.confirmState, "confirmed"), notInArray(orders.shipState, [...FINAL])))!;

/** the parsed ⌘K query: digits for a phone, an id prefix, a tracking reference */
function parseQuery(q: string): { text: string; digits: string; phoneLike: boolean } {
  const text = toAsciiDigits(String(q ?? "")).trim().slice(0, 80);
  const digits = text.replace(/\D/g, "");
  return { text, digits, phoneLike: /^[+\d\s().-]+$/.test(text) && digits.length >= 4 };
}

/**
 * The ⌘K provider's body (OPE-§27.7): an id prefix, ≥ 4 phone digits or an exact tracking_ref; agents see their
 * queue only, plus the exact-phone inbound lookup when q has ≥ 8 digits (OD53); results masked.
 */
export async function searchOrders(scope: StoreScope, q: string, viewer: { userId: string; role: StoreRole }, limit: 8): Promise<SearchHit[]> {
  const { text, digits, phoneLike } = parseQuery(q);
  const max = Math.max(1, Math.min(8, Math.floor(limit || 8)));
  if (text.length < 2 || !isRole(viewer.role) || !can(viewer.role, "orders.read")) return [];
  const store = await getStoreById(scope.storeId);
  if (!store) return [];
  const all = can(viewer.role, "orders.read_all");
  const upper = text.toUpperCase();
  const conds: SQL[] = [];
  if (/^[A-Z0-9]{2,8}-[A-Z0-9]{0,12}$/.test(upper)) conds.push(like(orders.id, `${upper}%`));
  if (phoneLike) conds.push(like(orders.phone, `%${digits.replace(/^0+/, "")}%`));
  if (!phoneLike && /^[A-Za-z0-9-]{4,64}$/.test(text)) conds.push(eq(orders.trackingRef, text));
  if (!conds.length) return [];
  const own = all ? undefined : or(eq(orders.assigneeId, viewer.userId), eq(orders.confirmedBy, viewer.userId));
  const cols = { id: orders.id, name: orders.name, phone: orders.phone, city: orders.city, confirmState: orders.confirmState, shipState: orders.shipState };
  const rows = await db
    .select(cols)
    .from(orders)
    .where(whereStore(orders, scope, or(...conds), own))
    .orderBy(desc(orders.createdAt))
    .limit(max);
  let found = rows;
  // an agent's exact-phone inbound lookup (OD53): charged to the `inbound` bucket, the ids remembered as a lookup's
  if (!all && phoneLike && digits.length >= INBOUND_MIN_DIGITS && rows.length < max) {
    const e164 = normalizePhone(text, store.market)?.e164;
    if (e164 && (await rateLimit(storeBucket(scope, "inbound", viewer.userId), INBOUND_LIMIT, 3_600)).ok) {
      const seen = new Set(rows.map((r) => r.id));
      const extra = (
        await db
          .select(cols)
          .from(orders)
          .where(whereStore(orders, scope, eq(orders.phone, e164), OPEN_FOR_INBOUND))
          .orderBy(desc(orders.createdAt))
          .limit(max)
      ).filter((r) => !seen.has(r.id));
      if (extra.length) rememberInbound(scope, viewer.userId, extra.map((r) => r.id));
      found = [...rows, ...extra].slice(0, max);
    }
  }
  return found.map((r) => {
    const m = maskIfImpersonation(scope, { name: r.name, phone: null, address: null, city: r.city, landmark: null, note: null });
    const status = projectStatus({ confirm: r.confirmState, ship: r.shipState });
    return {
      id: r.id,
      kind: "order",
      title: `${r.id} · ${maskName(m.name ?? "")}`,
      subtitle: [maskPhone(r.phone), r.city, status].filter(Boolean).join(" · "),
      href: appHref(store.handle, `/orders?q=${encodeURIComponent(r.id)}`),
      group: "ops.search.orders",
    };
  });
}

/**
 * The customers half of the ⌘K provider: a name (≥ 3 chars) or phone digits (≥ 4), for viewers who read every order
 * (agents never list customers); masked. Under impersonation the name search is off: names are masked there, and a
 * name search would test them letter by letter (OD61).
 */
export async function searchCustomers(scope: StoreScope, q: string, viewer: { userId: string; role: StoreRole }, limit: 8): Promise<SearchHit[]> {
  const { text, digits, phoneLike } = parseQuery(q);
  if (!isRole(viewer.role) || !can(viewer.role, "orders.read_all") || !can(viewer.role, "customers.read")) return [];
  const byName = !phoneLike && text.length >= 3 && scope.kind !== "impersonation";
  if (!phoneLike && !byName) return [];
  const store = await getStoreById(scope.storeId);
  if (!store) return [];
  const match = phoneLike ? like(customers.phone, `%${digits.replace(/^0+/, "")}%`) : like(customers.name, `%${text.replace(/[\\%_]/g, (c) => "\\" + c)}%`);
  const rows = await db
    .select({ id: customers.id, name: customers.name, phone: customers.phone, city: customers.city, orders: customers.ordersCount })
    .from(customers)
    .where(whereStore(customers, scope, match))
    .orderBy(desc(customers.lastOrderAt))
    .limit(Math.max(1, Math.min(8, Math.floor(limit || 8))));
  return rows.map((r) => ({
    id: r.id,
    kind: "customer",
    title: maskName(r.name ?? ""),
    subtitle: [maskPhone(r.phone), r.city].filter(Boolean).join(" · "),
    href: appHref(store.handle, `/customers/${r.id}`),
    group: "ops.search.customers",
  }));
}

