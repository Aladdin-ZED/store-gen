import "server-only";
/**
 * What the tracking page shows for one order (P3 LANDING; landing.md LAN-§9.2, §7.2 step 7, LD8). Every read goes
 * through the order's store scope (`byId` / `whereStore`), so the view of A's order is built from A's rows only.
 *
 *   const order = await loadTrackOrder(scope, "CMD-7K3Q9X");     // null: not this store's order
 *   const view = await buildTrackView(scope, order, { locale: "fr", doc });
 *
 * The view never carries the full phone, the address, the note, the e-mail, another order, an agent's name, an
 * internal note or a risk score: it is built from an explicit column list, and the phone leaves as its last 4 digits.
 * `eta` is the after-call window from `confirmed_at` once the order is confirmed (lead 0), else the pre-call window
 * from `created_at`; `confirmedOn` shows when the confirmation came later than the lead allowed (the window moved).
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import { callingWindowFor } from "@/lib/callcenter/window.server";
import { db } from "@/lib/db/client";
import { orderEvents, orders } from "@/lib/db/schema";
import { zoneLineFor } from "@/lib/delivery/zones.server";
import { DZ, fill, TRK, trkDays, type ShopperLocale } from "@/lib/landing/copy";
import { shopperHoursText } from "@/lib/landing/hours";
import { formatMoney } from "@/lib/markets/info";
import { cityKey } from "@/lib/orders/address";
import { orderText } from "@/lib/orders/text";
import type { PageDoc } from "@/lib/page/schema";
import { whatsappDigits, whatsappNumber } from "@/lib/render/config";
import { getStoreById } from "@/lib/tenancy/public";
import { getStoreSettings } from "@/lib/settings";
import { byId, whereStore } from "@/lib/tenancy/sql";
import type { StoreScope } from "@/lib/tenancy/types";
import type { TrackView } from "./contract";
import { firstNameOf, maskPhoneLast4, trackDay } from "./format";
import { effectiveAxes, pendingRequests, requestsOpen, trackSteps, type ConfirmState, type ShipState, type TrackEvent } from "./steps";

const DEFAULT_TZ = "Africa/Casablanca";

/** The order columns tracking reads: an explicit list (no address, note, e-mail, IP, risk or agent column). */
const COLUMNS = {
  id: orders.id,
  pageId: orders.pageId,
  versionId: orders.versionId,
  name: orders.name,
  phone: orders.phone,
  city: orders.city,
  cityKey: orders.cityKey,
  productName: orders.productName,
  items: orders.items,
  qty: orders.qty,
  total: orders.total,
  currency: orders.currency,
  locale: orders.locale,
  idem: orders.idem,
  status: orders.status,
  confirmState: orders.confirmState,
  shipState: orders.shipState,
  createdAt: orders.createdAt,
  confirmedAt: orders.confirmedAt,
  shippedAt: orders.shippedAt,
  deliveredAt: orders.deliveredAt,
  finalAt: orders.finalAt,
  carrierLabel: orders.carrierLabel,
  trackingRef: orders.trackingRef,
  assigneeId: orders.assigneeId,
} as const;

export type TrackOrderRow = { [K in keyof typeof COLUMNS]: (typeof orders.$inferSelect)[K] };

/** The order of `scope`'s store, or null (an id of another store finds nothing). */
export async function loadTrackOrder(scope: StoreScope, orderId: string): Promise<TrackOrderRow | null> {
  const [row] = await db.select(COLUMNS).from(orders).where(byId(orders, scope, orderId)).limit(1);
  return (row as TrackOrderRow | undefined) ?? null;
}

/** The order's events the page reads: state moves, the shopper's own requests and every store-side touch after them. */
export async function loadTrackEvents(scope: StoreScope, orderId: string): Promise<TrackEvent[]> {
  const rows = await db
    .select({ type: orderEvents.type, actorKind: orderEvents.actorKind, toState: orderEvents.toState, at: orderEvents.at, meta: orderEvents.meta })
    .from(orderEvents)
    .where(whereStore(orderEvents, scope, eq(orderEvents.orderId, orderId)))
    .orderBy(asc(orderEvents.at), asc(orderEvents.id))
    .limit(500);
  return rows.map((r) => ({ type: r.type, actorKind: r.actorKind, toState: r.toState, at: r.at, meta: r.meta ?? null }));
}

/** Has the order already a `customer_confirm_intent` event (LAN-§8.3: one per order)? */
export async function hasConfirmIntent(scope: StoreScope, orderId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: orderEvents.id })
    .from(orderEvents)
    .where(whereStore(orderEvents, scope, and(eq(orderEvents.orderId, orderId), inArray(orderEvents.type, ["customer_confirm_intent"]))))
    .limit(1);
  return !!row;
}

/** The delivery line of the view (LAN-§7.2 steps 2b and 7), null when the store promises no date for the city. */
async function etaOf(scope: StoreScope, order: TrackOrderRow, locale: ShopperLocale, tz: string): Promise<TrackView["eta"]> {
  const { confirm, ship } = effectiveAxes(order);
  if (confirm === "cancelled" || confirm === "fake" || confirm === "duplicate" || ship === "delivered" || ship === "refused" || ship === "returned" || ship === "lost") return null;
  const key = order.cityKey ? (order.cityKey as ReturnType<typeof cityKey>) : order.city ? cityKey(order.city) : null;
  const before = await zoneLineFor(scope, key, order.createdAt, { stage: "before_call" });
  const confirmed = confirm === "confirmed" || ship !== "none";
  const at = order.confirmedAt ?? null;
  if (confirmed && at) {
    const after = await zoneLineFor(scope, key, at, { stage: "after_call" });
    if (!after || after.notServed || !after.etaText) return null;
    const later = !!(after.eta && before?.eta && after.eta.to > before.eta.to);
    return { text: fill(DZ[locale].cityless, { dates: after.etaText[locale] }), ...(later ? { confirmedOn: trackDay(at.toISOString(), locale, tz) } : {}) };
  }
  if (!before || before.notServed || !before.etaText) return null;
  return { text: fill(DZ[locale].cityless, { dates: before.etaText[locale] }) };
}

/** "Retours acceptés sous 7 jours." from the `policies` setting; null when returns are not accepted or unset. */
function rightsLineOf(returns: { accepted: boolean | null; windowDays: number | null }, locale: ShopperLocale): string | null {
  if (returns.accepted !== true) return null;
  const c = TRK[locale];
  return returns.windowDays ? fill(c.returnsIn, { n: returns.windowDays, days: trkDays(returns.windowDays, locale) }) : c.returns;
}

export interface TrackViewOptions {
  locale: ShopperLocale;
  /** the order's published document (its WhatsApp number wins over the store's), when it still validates */
  doc?: PageDoc | null;
  now?: Date;
  /** already loaded by the caller */
  events?: TrackEvent[];
}

export async function buildTrackView(scope: StoreScope, order: TrackOrderRow, opts: TrackViewOptions): Promise<TrackView> {
  const locale = opts.locale;
  const now = opts.now ?? new Date();
  const [events, settings, store, window] = await Promise.all([
    opts.events ?? loadTrackEvents(scope, order.id),
    getStoreSettings(scope, ["store", "landing", "policies"] as const),
    getStoreById(scope.storeId),
    callingWindowFor(scope),
  ]);
  const tz = store?.timezone || DEFAULT_TZ;
  const axes = { status: order.status, confirmState: order.confirmState as ConfirmState, shipState: order.shipState as ShipState };
  const { steps, current } = trackSteps({ ...axes, createdAt: order.createdAt, confirmedAt: order.confirmedAt, shippedAt: order.shippedAt, deliveredAt: order.deliveredAt, finalAt: order.finalAt }, events);
  const pending = pendingRequests(events);
  const open = settings.landing.tracking.requests && requestsOpen(axes);
  const s = settings.store;
  const whatsapp = opts.doc ? whatsappNumber(opts.doc, s.whatsapp) : whatsappDigits(s.whatsapp, s.country || "MA");
  const phone = s.phone?.trim();
  const hours = shopperHoursText(window, locale, `${locale}-MA`, now);
  const carrierName = order.carrierLabel?.trim() || "";
  const ref = order.trackingRef?.trim() || null;
  return {
    orderId: order.id,
    placedAt: order.createdAt.toISOString(),
    firstName: firstNameOf(order.name),
    maskedPhone: maskPhoneLast4(order.phone),
    summary: {
      offer: order.productName,
      units: orderText(order.items, { mode: "customer", orderId: order.id, productName: order.productName }),
      total: formatMoney(Number(order.total), order.currency, opts.doc?.locale ?? locale),
    },
    steps,
    current,
    eta: await etaOf(scope, order, locale, tz),
    carrier: carrierName || ref ? { name: carrierName, ref, url: null } : null,
    canRequest: { changeAddress: open && !pending.includes("change_address"), cancel: open && !pending.includes("cancel"), other: open && !pending.includes("other") },
    pending,
    help: { ...(whatsapp ? { whatsapp } : {}), ...(phone ? { phone } : {}), ...(hours ? { hours } : {}) },
    rightsLine: rightsLineOf(settings.policies.returns, locale),
  };
}

/** The store's time zone (the page's dates). */
export async function storeTimeZone(scope: StoreScope): Promise<string> {
  return (await getStoreById(scope.storeId))?.timezone || DEFAULT_TZ;
}
