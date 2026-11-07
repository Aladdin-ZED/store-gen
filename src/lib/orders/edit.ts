import "server-only";
/**
 * Post-creation editing and the drawer's single-order carrier moves (P4 CALL CENTER; operations.md OPE-§11.3, §6.1a,
 * §12.7, OD15, OD49, OD55, OPS-21).
 *
 *   editOrder(ctx, orderId, patch, expectRev)   contact fields, lines (re-priced, never typed), the manager adjustment
 *   setOrderHold(ctx, orderId, shipAfter)        "Ship from 05 Nov" / Remove: the writer's hold (`hold_set`, OD49)
 *   setOrderTracking(ctx, orderId, t)            tracking_ref / carrier_label + `tracking_set`; implies `packed` (OD55)
 *   requestRecall(ctx, orderId, reason)          a customer who cancels during delivery: `recall_requested` (OPS-21)
 *   markCarrierNotified(ctx, orderId)            the warehouse's "Carrier notified" tick on that recall
 *
 * Every function reads the order by `byId` in the scope's store and applies the one visibility rule (OD12; an order the
 * member may not see answers `not_found`, exactly like another store's id). Lines are re-priced by `validateOrder` and
 * the cents engine against the order's own version doc while it exists, else the page's current published version
 * (`pricedWith` says which): nothing typed is a price (OD15, owner rule 4). Phones are stored E.164 and every reader
 * masks them (the timeline renders `field_edited` values masked).
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { auditIn } from "@/lib/admin-data/store-audit";
import { viewerSeesOrder } from "@/lib/callcenter/visibility";
import { instantAt } from "@/lib/callcenter/window";
import { db } from "@/lib/db/client";
import { orderEvents, orders, type OrderItems } from "@/lib/db/schema";
import { toCents } from "@/lib/finance/lite/cents";
import { getMarket } from "@/lib/markets/info";
import { normalizePhone } from "@/lib/markets/phone";
import { round2 } from "@/lib/page/pricing";
import type { PageDoc } from "@/lib/page/schema";
import { getStoreSetting } from "@/lib/settings";
import { byId, whereStore } from "@/lib/tenancy/sql";
import type { ActionResult, StoreCtx, WriteCtx, WriteScope } from "@/lib/tenancy/types";
import { normalizeCity, type CityKey } from "./address";
import type { OrderPayloadV2, UnitIn } from "./contract";
import { moveOrderCustomer } from "./customers";
import { findDuplicates } from "./duplicates";
import { appendEvents, viewerOf } from "./events";
import { runOrderHooks, type OrderHookEvent, type OrderRow } from "./hooks";
import { logError } from "./log";
import { livePage, priceSelection, type ManualRefusal } from "./manual";
import { versionDoc } from "./resolve";
import { CANCEL_REASONS, PRE_SHIP, projectStatus, type MoneyState, type OrderSnapshot, type OrderStates, type ShipState } from "./state";
import { orderText } from "./text";
import { actorFrom, runAfterCommit, transitionOrder, type TransitionError } from "./transition";
import { upsellRecord } from "./upsell";
import { cleanInput, validateOrder, validName, type ValidationFields } from "./validate";
import { orderItemsView } from "@/lib/orders/items-v3";

export interface OrderPatch {
  name?: string;
  phone?: string;
  city?: string;
  address?: string | null;
  landmark?: string | null;
  note?: string | null;
  selection?: { offerId: string; units: UnitIn[]; extras: Record<string, string>; bump: boolean; upsell?: boolean };
  adjust?: { cents: number; reason: string };
}

export interface EditResult {
  rev: number;
  totalCents: number;
  /** false: the patch matched the order, nothing written */
  changed: boolean;
  /** lines re-priced: against the order's own version, or the page's current one (the summary says which) */
  pricedWith?: "order_version" | "current_version";
  /** the open orders of the new phone (a phone change re-runs the §9.3 predicate) */
  duplicates?: string[];
  inTransit?: true;
}

const refuse = (error: string, extra: Omit<ManualRefusal, "ok" | "error"> = {}): ManualRefusal => ({ ok: false, error, ...extra });

/** ship states in which the parcel is with the carrier: only the contact fields stay editable (OPS-21) */
const IN_TRANSIT: ReadonlySet<ShipState> = new Set(["shipped", "in_transit", "out_for_delivery", "attempt_failed", "postponed"]);
const DEAD_CONFIRM = new Set(["cancelled", "fake", "duplicate"]);
const TRANSIT_FIELDS = new Set(["address", "landmark", "note"]);
const CONTACT_FIELDS = new Set(["name", "phone", "city", "address", "landmark", "note"]);
const ORDER_ID_RE = /^[A-Z0-9]{2,8}-[A-Z0-9]{4,12}$/;
const REASON_MIN = 3;

/** The phone country of the store's market (ORD-16: never a platform-wide default). */
export function phoneCountryOf(store: Pick<StoreCtx["store"], "market">): string {
  return getMarket(store.market || "MA").phone.country || "MA";
}

const statesOf = (r: Pick<OrderRow, "confirmState" | "shipState" | "moneyState">): OrderStates => ({ confirm: r.confirmState, ship: r.shipState, money: r.moneyState as MoneyState });

function snapshot(r: OrderRow, over: { rev?: number; totalCents?: number; customerId?: string | null; cityKey?: string | null } = {}): OrderSnapshot {
  const states = statesOf(r);
  return {
    id: r.id,
    rev: over.rev ?? r.rev,
    status: projectStatus(states),
    states,
    isTest: r.isTest,
    customerId: over.customerId !== undefined ? over.customerId : r.customerId,
    assigneeId: r.assigneeId,
    cityKey: over.cityKey !== undefined ? over.cityKey : r.cityKey,
    totalCents: over.totalCents ?? toCents(r.total),
  };
}

/** The order of the store the member may see (OD12, inbound lookups included), or null. */
async function visibleRow(ctx: StoreCtx, orderId: string): Promise<OrderRow | null> {
  if (typeof orderId !== "string" || !ORDER_ID_RE.test(orderId)) return null;
  const [row] = await db.select().from(orders).where(byId(orders, ctx.scope, orderId)).limit(1);
  if (!row || !viewerSeesOrder(ctx.scope, viewerOf(ctx), row, true)) return null;
  return row;
}

const affectedRows = (res: unknown): number => {
  const head = Array.isArray(res) ? res[0] : res;
  return Number((head as { affectedRows?: number } | undefined)?.affectedRows ?? 0);
};
const cut = (v: string | null | undefined) => (v == null ? null : Array.from(v).slice(0, 300).join(""));

class EditConflict extends Error {}

/** what an edit writes (undefined members are left out of the UPDATE by drizzle) */
type EditColumn = "name" | "phone" | "city" | "cityKey" | "address" | "landmark" | "note" | "items" | "qty" | "versionId" | "subtotal" | "shipping" | "total" | "adjustCents";

/* ------------------------------------------------------------------ */
/* re-pricing                                                          */
/* ------------------------------------------------------------------ */

interface Repriced {
  items: OrderItems;
  qty: number;
  subtotalCents: number;
  shippingCents: number;
  versionId: string;
  pricedWith: "order_version" | "current_version";
}

/**
 * The selection priced against the order's version doc (else the page's current published version) by the public
 * form's own rules: `validateOrder` with the customer fields switched off (they are edited and checked on their own),
 * so the stored items, quantities and money come from the engine, never from the request.
 */
async function reprice(ctx: StoreCtx, row: OrderRow, sel: NonNullable<OrderPatch["selection"]>, phone: string): Promise<Repriced | ManualRefusal> {
  const { scope } = ctx;
  let doc: PageDoc | null = row.versionId ? await versionDoc(scope, row.versionId) : null;
  let versionId = row.versionId;
  let pricedWith: Repriced["pricedWith"] = "order_version";
  if (!doc || !versionId) {
    const page = row.pageId ? await livePage(scope, row.pageId) : null; // 0006: a store (v3) order has no landing page (page_id NULL); R1 rows always carry one
    if (!page) return refuse("invalid", { text: "This order's page is no longer published, so its lines can't be re-priced." });
    doc = page.doc;
    versionId = page.versionId;
    pricedWith = "current_version";
  }
  const priced = priceSelection(doc, sel);
  if (!priced.totals) return refuse("invalid", { fields: priced.fields });
  const relaxed: PageDoc = { ...doc, form: { ...doc.form, city: "hidden", address: "hidden", note: "hidden", email: "hidden" } };
  const payload: OrderPayloadV2 = {
    v: 2,
    pageKey: "manual-edit",
    idem: row.idem,
    eventId: "manual_edit",
    bundleId: sel.offerId,
    bump: !!sel.bump,
    name: validName(row.name) ?? "Client",
    phone,
    t: 60_000,
    utm: {},
    ver: versionId,
    st: priced.totals.total,
    units: sel.units ?? [],
    extras: sel.extras ?? {},
  };
  const v = validateOrder(payload, relaxed);
  if (!v.ok) {
    const fields = Object.fromEntries(Object.entries(v.fields).filter(([k]) => k === "bundleId" || /^[usxb]\./.test(k))) as ValidationFields;
    return refuse("invalid", { fields: Object.keys(fields).length ? fields : v.fields });
  }
  let items: OrderItems = v.value.items;
  let upsellCents = 0;
  const keep = sel.upsell === undefined ? orderItemsView(row.items).upsell : undefined;
  if (sel.upsell === true) {
    const offer = doc.offers.upsell;
    if (!offer?.enabled) return refuse("invalid", { text: "This page has no upsell to add." });
    const price = round2(offer.price);
    items = { ...items, upsell: upsellRecord(doc, offer, price) };
    upsellCents = toCents(price);
  } else if (keep) {
    items = { ...items, upsell: keep };
    upsellCents = toCents(keep.price);
  }
  return {
    items,
    qty: v.value.items.qty,
    subtotalCents: v.value.totals.subtotal + upsellCents,
    shippingCents: v.value.totals.shipping,
    versionId,
    pricedWith,
  };
}

/* ------------------------------------------------------------------ */
/* editOrder (OPE-§11.3)                                                */
/* ------------------------------------------------------------------ */

export async function editOrder(ctx: WriteCtx, orderId: string, patch: OrderPatch, expectRev: number): Promise<ActionResult<EditResult>> {
  const { scope } = ctx;
  if (!ctx.can("orders.edit")) return refuse("forbidden");
  const row = await visibleRow(ctx, orderId);
  if (!row) return refuse("not_found");
  if (!Number.isInteger(expectRev) || expectRev !== row.rev) return refuse("conflict");

  /* the patch, cleaned and compared with the order */
  const fields: Record<string, string> = {};
  // the columns an edit may write (never a state column: those are the writer's, OPE-§3.7)
  const set: Partial<Pick<typeof orders.$inferInsert, EditColumn>> = {};
  const changes: { f: string; before: string | null; after: string | null }[] = [];
  const touched = new Set<string>();
  const change = (f: keyof typeof set & string, before: string | null, after: string | null, shown?: { before: string | null; after: string | null }) => {
    if (before === after) return;
    (set as Record<string, unknown>)[f] = after;
    touched.add(f);
    changes.push({ f, before: cut(shown?.before ?? before), after: cut(shown?.after ?? after) });
  };
  if (patch.name !== undefined) {
    const name = validName(patch.name);
    if (!name) fields.name = cleanInput(patch.name, 80) ? "invalid" : "required";
    else change("name", row.name, name);
  }
  let newPhone: string | null = null;
  if (patch.phone !== undefined) {
    const p = normalizePhone(patch.phone, phoneCountryOf(ctx.store));
    if (!p) fields.phone = cleanInput(patch.phone, 40) ? "invalid" : "required";
    else if (p.e164 !== row.phone) {
      newPhone = p.e164;
      change("phone", row.phone, p.e164);
    }
  }
  let cityKey: string | null | undefined;
  if (patch.city !== undefined) {
    const city = cleanInput(patch.city, 80);
    if ((city.match(/\p{L}/gu) ?? []).length < 2) fields.city = city ? "invalid" : "required";
    else if (city !== row.city) {
      change("city", row.city, city);
      const ops = await getStoreSetting(scope, "ops");
      const m = normalizeCity(city, ctx.store.market, ops.cityAliases as Record<string, CityKey>);
      cityKey = m.confidence === "exact" || m.confidence === "alias" ? m.key : null;
      set.cityKey = cityKey;
    }
  }
  if (patch.address !== undefined) {
    const v = patch.address === null ? null : cleanInput(patch.address, 240) || null;
    if (v !== null && v.length < 4) fields.address = "invalid";
    else change("address", row.address, v);
  }
  if (patch.landmark !== undefined) change("landmark", row.landmark, patch.landmark === null ? null : cleanInput(patch.landmark, 160) || null);
  if (patch.note !== undefined) change("note", row.note, patch.note === null ? null : cleanInput(patch.note, 300) || null);
  if (Object.keys(fields).length) return refuse("invalid", { fields: fields as ValidationFields });

  const wantsLines = patch.selection !== undefined || patch.adjust !== undefined;
  /* what the order's states allow (OPE-§11.3) */
  const states = statesOf(row);
  const open = PRE_SHIP.has(states.ship) && !DEAD_CONFIRM.has(states.confirm);
  let inTransit = false;
  if (!open) {
    const onlyContact = !wantsLines && [...touched].every((f) => TRANSIT_FIELDS.has(f));
    if (!(IN_TRANSIT.has(states.ship) && onlyContact)) return refuse("locked");
    inTransit = touched.size > 0;
  }

  /* lines and the adjustment: priced by the engine */
  let subtotal = toCents(row.subtotal);
  let shipping = toCents(row.shipping);
  let adjust = row.adjustCents;
  let pricedWith: EditResult["pricedWith"];
  let linesChanged = false;
  if (patch.selection) {
    const r = await reprice(ctx, row, patch.selection, newPhone ?? row.phone);
    if ("ok" in r) return r;
    pricedWith = r.pricedWith;
    const beforeText = orderText(orderItemsView(row.items), { mode: "customer" }) || null;
    const afterText = orderText(r.items, { mode: "customer" }) || null;
    if (JSON.stringify(r.items) !== JSON.stringify(row.items) || r.subtotalCents !== subtotal || r.shippingCents !== shipping) {
      linesChanged = true;
      set.items = r.items;
      set.qty = r.qty;
      set.versionId = r.versionId;
      subtotal = r.subtotalCents;
      shipping = r.shippingCents;
      changes.push({ f: "items", before: cut(beforeText), after: cut(afterText) });
    }
  }
  if (patch.adjust) {
    // manager+ (OD15, OPE-§11.1 step 4): −subtotal ≤ adjust ≤ 0, a reason of ≥ 3 characters, audited
    if (!ctx.can("orders.force_status")) return refuse("forbidden");
    const { cents, reason } = patch.adjust;
    if (!Number.isInteger(cents) || cents > 0 || cents < -subtotal) return refuse("bad_adjust");
    if (cleanInput(reason, 200).length < REASON_MIN) return refuse("reason_required");
    if (cents !== adjust) {
      changes.push({ f: "adjust", before: String(adjust), after: String(cents) });
      adjust = cents;
      set.adjustCents = cents;
      linesChanged = true;
    }
  } else if (adjust < -subtotal) {
    // new lines cheaper than the old discount: the discount never makes the total negative
    changes.push({ f: "adjust", before: String(adjust), after: String(-subtotal) });
    adjust = -subtotal;
    set.adjustCents = adjust;
  }
  const totalCents = subtotal + shipping + adjust;
  if (linesChanged) {
    set.subtotal = round2(subtotal / 100);
    set.shipping = round2(shipping / 100);
    set.total = round2(totalCents / 100);
    const before = toCents(row.total);
    if (before !== totalCents) changes.push({ f: "total", before: String(before), after: String(totalCents) });
  }
  if (!changes.length) return { ok: true, data: { rev: row.rev, totalCents: toCents(row.total), changed: false, ...(pricedWith ? { pricedWith } : {}) } };
  if (changes.length > 12) changes.splice(12);

  const bits = ([...touched].some((f) => CONTACT_FIELDS.has(f)) ? 2 : 0) | (linesChanged ? 4 : 0);
  const rev = row.rev + 1;
  let customerId = row.customerId;
  const after = (): OrderSnapshot => snapshot(row, { rev, totalCents, customerId, ...(cityKey !== undefined ? { cityKey } : {}) });
  const event = (): OrderHookEvent => ({ on: "edited", before: snapshot(row), after: after(), fields: changes.map((c) => c.f), actor: actorFrom(ctx) });
  try {
    await db.transaction(async (tx) => {
      const res = await tx
        .update(orders)
        .set({
          name: set.name,
          phone: set.phone,
          city: set.city,
          cityKey: set.cityKey,
          address: set.address,
          landmark: set.landmark,
          note: set.note,
          items: set.items,
          qty: set.qty,
          versionId: set.versionId,
          subtotal: set.subtotal,
          shipping: set.shipping,
          total: set.total,
          adjustCents: set.adjustCents,
          rev: sql`${orders.rev} + 1`,
          sheetDirty: sql`${orders.sheetDirty} | ${bits}`,
          updatedAt: new Date(),
        })
        .where(and(byId(orders, scope, row.id), eq(orders.rev, expectRev)));
      if (affectedRows(res) !== 1) throw new EditConflict();
      if (newPhone) {
        // the order leaves the old customer row with its counters and joins the new phone's (OPE-§9.1)
        customerId = await moveOrderCustomer(tx, scope, {
          id: row.id,
          phone: newPhone,
          name: (set.name as string | undefined) ?? row.name,
          city: (set.city as string | null | undefined) ?? row.city,
          cityKey: cityKey !== undefined ? cityKey : row.cityKey,
          locale: row.locale,
          isTest: row.isTest,
          createdAt: row.createdAt,
          states: { confirm: states.confirm, ship: states.ship },
          customerId: row.customerId,
        });
      }
      await appendEvents(tx, scope, [
        { orderId: row.id, actorKind: "user", actorId: ctx.user.id, type: "field_edited", rev, meta: { fields: changes, ...(inTransit ? { inTransit: true } : {}) } },
      ]);
      await runOrderHooks("edited", "inTx", scope, event(), tx);
    });
  } catch (err) {
    if (err instanceof EditConflict) return refuse("conflict");
    throw err;
  }
  if (patch.adjust && set.adjustCents !== undefined) {
    await auditIn(scope, ctx.actor, "orders.adjusted", { target: row.id, meta: { cents: adjust, reason: cleanInput(patch.adjust.reason, 200) } }).catch((err) => logError("orders:edit:audit", err));
  }
  await runAfterCommit("orders:hooks:edited", () => runOrderHooks("edited", "afterCommit", scope, event()));

  let duplicates: string[] | undefined;
  if (newPhone) duplicates = await recheckDuplicates(scope, row, newPhone).catch((err) => (logError("orders:edit:duplicates", err), undefined));
  return {
    ok: true,
    data: { rev, totalCents, changed: true, ...(pricedWith ? { pricedWith } : {}), ...(duplicates?.length ? { duplicates } : {}), ...(inTransit ? { inTransit: true as const } : {}) },
  };
}

/** A phone edit re-runs the §9.3 predicate: `duplicate_suspected` on the order and each match, as at creation. */
async function recheckDuplicates(scope: WriteScope, row: OrderRow, phone: string): Promise<string[]> {
  const ops = await getStoreSetting(scope, "ops");
  const matches = await findDuplicates(db, scope, { id: row.id, phone, isTest: row.isTest }, ops.duplicateWindowDays);
  if (!matches.length) return [];
  await db.transaction((tx) =>
    appendEvents(tx, scope, [
      { orderId: row.id, actorKind: "system", type: "duplicate_suspected", meta: { of: matches.map((m) => m.id) } },
      ...matches.map((m) => ({ orderId: m.id, actorKind: "system" as const, type: "duplicate_suspected" as const, meta: { of: [row.id] } })),
    ]),
  );
  return matches.map((m) => m.id);
}

/* ------------------------------------------------------------------ */
/* the hold (OD49)                                                      */
/* ------------------------------------------------------------------ */

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** A hold as the drawer sends it: a store-local day ("2026-11-05", from 00:00 in the store's zone) or an ISO instant. */
export function holdInstant(v: string, tz: string): Date | null {
  const d = YMD.test(v) ? instantAt(v, "00:00", tz) : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export type HoldResult = { ok: true; rev: number; shipAfter: string | null; changed: boolean } | { ok: false; error: TransitionError };

/** "Ship from…" on a confirmed order not yet handed over, or null to remove it; the writer checks (now, now + 60 d]. */
export async function setOrderHold(ctx: WriteCtx, orderId: string, shipAfter: Date | null, expectRev?: number): Promise<HoldResult> {
  if (shipAfter !== null && Number.isNaN(shipAfter.getTime())) return { ok: false, error: "bad_hold" };
  const r = await transitionOrder(actorFrom(ctx), ctx.scope, { orderId, want: {}, source: "ui", shipAfter, ...(expectRev !== undefined ? { expectRev } : {}) });
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, rev: r.rev, shipAfter: shipAfter ? shipAfter.toISOString() : null, changed: r.changed };
}

/* ------------------------------------------------------------------ */
/* tracking (OD55)                                                      */
/* ------------------------------------------------------------------ */

export interface TrackingResult {
  trackingRef: string | null;
  carrierLabel: string | null;
  changed: boolean;
  /** the tracking number moved a pre-ship order to `packed` (a label exists, OPE-§17.4) */
  packed: boolean;
}

const TRACKING_RE = /^[A-Za-z0-9][A-Za-z0-9 ._\-/]{0,63}$/;

/** shipments.write: the carrier's tracking number and name, typed in the drawer; a number on a pre-ship order implies packed. */
export async function setOrderTracking(ctx: WriteCtx, orderId: string, input: { trackingRef: string | null; carrierLabel?: string | null }): Promise<ActionResult<TrackingResult>> {
  const { scope } = ctx;
  if (!ctx.can("shipments.write")) return refuse("forbidden");
  const row = await visibleRow(ctx, orderId);
  if (!row) return refuse("not_found");
  const ref = input.trackingRef === null ? null : cleanInput(input.trackingRef, 64) || null;
  if (ref !== null && !TRACKING_RE.test(ref)) return refuse("invalid", { text: "Use the tracking number exactly as the carrier gives it." });
  const label = input.carrierLabel === undefined ? row.carrierLabel : input.carrierLabel === null ? null : cleanInput(input.carrierLabel, 60) || null;
  const changed = ref !== row.trackingRef || label !== row.carrierLabel;
  if (changed) {
    await db.transaction(async (tx) => {
      await tx
        .update(orders)
        .set({ trackingRef: ref, carrierLabel: label, sheetDirty: sql`${orders.sheetDirty} | 2`, updatedAt: new Date() })
        .where(byId(orders, scope, row.id));
      await appendEvents(tx, scope, [{ orderId: row.id, actorKind: "user", actorId: ctx.user.id, type: "tracking_set", meta: { trackingRef: ref, carrierLabel: label } }]);
    });
  }
  let packed = false;
  if (ref && (row.shipState === "none" || row.shipState === "to_pack")) {
    const t = await transitionOrder(actorFrom(ctx), scope, { orderId: row.id, want: { ship: "packed" }, source: "ui" });
    packed = t.ok && t.changed;
  }
  return { ok: true, data: { trackingRef: ref, carrierLabel: label, changed, packed } };
}

/* ------------------------------------------------------------------ */
/* recall (OPS-21, OPE-§6.1a cancel_recall from the drawer)            */
/* ------------------------------------------------------------------ */

async function lastRecall(scope: StoreCtx["scope"], orderId: string): Promise<{ reason: string; carrierNotified: boolean } | null> {
  const [e] = await db
    .select({ meta: orderEvents.meta })
    .from(orderEvents)
    .where(whereStore(orderEvents, scope, eq(orderEvents.orderId, orderId), eq(orderEvents.type, "recall_requested")))
    .orderBy(desc(orderEvents.id))
    .limit(1);
  if (!e) return null;
  const m = (e.meta ?? {}) as { reason?: unknown; carrierNotified?: unknown };
  return { reason: typeof m.reason === "string" ? m.reason : "other", carrierNotified: m.carrierNotified === true };
}

export type RecallResult = { ok: true; changed: boolean } | { ok: false; error: "not_found" | "forbidden" | "illegal" | "reason_required" };

/** orders.write: the customer cancels while the parcel is out; never a confirm move (the carrier's return closes it). */
export async function requestRecall(ctx: WriteCtx, orderId: string, reason: string): Promise<RecallResult> {
  if (!ctx.can("orders.write")) return { ok: false, error: "forbidden" };
  const row = await visibleRow(ctx, orderId);
  if (!row) return { ok: false, error: "not_found" };
  if (!IN_TRANSIT.has(row.shipState)) return { ok: false, error: "illegal" };
  if (!(CANCEL_REASONS as readonly string[]).includes(reason) || reason === "blocked" || reason === "attempts_exhausted") return { ok: false, error: "reason_required" };
  if (await lastRecall(ctx.scope, row.id)) return { ok: true, changed: false };
  await db.transaction((tx) =>
    appendEvents(tx, ctx.scope, [{ orderId: row.id, actorKind: "user", actorId: ctx.user.id, type: "recall_requested", reasonCode: reason, meta: { reason, carrierNotified: false } }]),
  );
  return { ok: true, changed: true };
}

/** shipments.write: the warehouse passed the recall on to the carrier ("Carrier notified"). */
export async function markCarrierNotified(ctx: WriteCtx, orderId: string): Promise<RecallResult> {
  if (!ctx.can("shipments.write")) return { ok: false, error: "forbidden" };
  const row = await visibleRow(ctx, orderId);
  if (!row) return { ok: false, error: "not_found" };
  const last = await lastRecall(ctx.scope, row.id);
  if (!last) return { ok: false, error: "illegal" };
  if (last.carrierNotified) return { ok: true, changed: false };
  await db.transaction((tx) =>
    appendEvents(tx, ctx.scope, [
      { orderId: row.id, actorKind: "user", actorId: ctx.user.id, type: "recall_requested", reasonCode: last.reason, meta: { reason: last.reason, carrierNotified: true } },
    ]),
  );
  return { ok: true, changed: true };
}
