"use server";
/**
 * The orders screen's server actions (P4 CALL CENTER; operations.md §M.3 orders rows, OPE-§9.5, §11, §12.6, §12.7,
 * OD49, OD55, OPS-21). Every body is `return storeAction(…)` through the store's seam; the domain functions answer
 * their own result inside `data` (an order the member may not see answers `not_found` there, exactly like another
 * store's id), the way the queue's actions do.
 *
 *   getOrderAction              orders.read         the drawer: order (phone masked), risk + calibration, duplicates,
 *                                                   first timeline page, the script for the claim holder and managers
 *   moveOrderAction             orders.write        "Move to…" (moveToLegacy); ship moves need shipments.write and money
 *                                                   moves finance.write, checked per move by the writer
 *   forceMoveAction             orders.force_status any move on one axis, with a reason
 *   editOrderAction             orders.edit         contact fields, lines (re-priced), the adjustment (manager+)
 *   quoteManualOrderAction      orders.create       the new-order sheet's summary; no write
 *   createManualOrderAction     orders.create       `manual` 60 / h per member (charged by createManualOrder)
 *   convertLeadAction           orders.create + leads.write
 *   dismissDuplicateAction      orders.write        "Keep both"
 *   setShipAfterAction          orders.write        the hold (OD49); null removes it
 *   setTrackingAction           shipments.write     tracking_ref / carrier_label (OD55)
 *   requestRecallAction         orders.write        recall_requested (OPS-21)
 *   markCarrierNotifiedAction   shipments.write     the warehouse's tick on that recall
 *   assignOrderAction           orders.assign
 *   bulkAssignAction, bulkPinAction                orders.assign   ≤ 200 ids, `bulk` 30 / 10 min, idem replays (OPE-§12.4)
 *   bulkMoveAction, undoMoveAction                 orders.write    each id through the writer (source bulk); undo 15 s
 *   saveCarrierCsvColumnsAction                    shipments.write ops.carrierCsv (OD55)
 *   deleteTestOrdersAction                         settings.write  test orders older than 1 hour (OPE-§26)
 *   listSavedViewsAction (orders.read), saveViewAction, renameViewAction, deleteViewAction, reorderViewsAction
 *                                                  orders.write    personal views; shared ones also orders.assign
 *   resendToSheetAction, retryFailedSyncAction (orders.write) call P5's sheet functions; the R1.0 status menu and the
 *   blocklist actions stay for today's screen until the drawer redesign (P4 step 10) moves to the ones above.
 */
import { z } from "zod";
import { fail } from "@/lib/admin-data/action";
import { orderDrawerJson, type OrderDrawerJson } from "@/lib/admin-data/orders";
import { revalidateStore } from "@/lib/admin-data/shell";
import { blockFromOrder, blockPhone, isOrderStatus, requeueOrderSync, retryFailedSync, unblock } from "@/lib/orders";
import {
  BULK_MAX,
  bulkAssign,
  bulkMove,
  bulkPin,
  deleteTestOrdersNow,
  deleteView,
  listSavedViews,
  MOVE_ERROR_TEXT,
  moveWithUndo,
  renameView,
  reorderViews,
  saveCarrierCsvColumns,
  saveView,
  undoMove,
} from "@/lib/orders/admin";
import { OrderQuery, SavedViewInput } from "@/lib/callcenter/views";
import { CONFIRM_STATES, MONEY_STATES, SHIP_STATES } from "@/lib/orders/state";
import type { OrderStatus } from "@/lib/orders/contract";
import { UnitIn } from "@/lib/orders/contract";
import { dismissDuplicate } from "@/lib/orders/duplicates";
import { editOrder, holdInstant, markCarrierNotified, phoneCountryOf, requestRecall, setOrderHold, setOrderTracking, type OrderPatch } from "@/lib/orders/edit";
import { ConvertLeadSchema, convertLeadToOrder, createManualOrderWith, ManualOrderSchema, quoteManualOrder } from "@/lib/orders/manual";
import { assignOrders } from "@/lib/orders/queue";
import { moveToLegacy } from "@/lib/orders/transition";
import { syncPendingOrders } from "@/lib/sheets";
import { storeAction } from "@/lib/tenancy/seam";
import type { ActionResult } from "@/lib/tenancy/types";

const OrderId = z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,8}-[A-Z0-9]{4,12}$/, { error: "Unknown order." });
const Status = z.custom<OrderStatus>((v) => isOrderStatus(v), { error: "Unknown status." });
const BlockId = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, { error: "Unknown entry." });
const UserId = z.string().regex(/^[0-9A-Z]{26}$/, { error: "Unknown member." });
const LeadId = z.string().regex(/^[0-9A-Z]{26}$/, { error: "Unknown lead." });
const Rev = z.number().int().min(0);
const Reason = z
  .string()
  .max(200, { error: "Keep the reason under 200 characters." })
  .transform((v) => v.replace(/[\u0000-\u001f\u007f]/g, " ").trim() || null);
const Hold = z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.iso.datetime({ offset: true })]);
const Patch = z.strictObject({
  name: z.string().max(120).optional(),
  phone: z.string().max(40).optional(),
  city: z.string().max(120).optional(),
  address: z.string().max(300).nullable().optional(),
  landmark: z.string().max(160).nullable().optional(),
  note: z.string().max(300).nullable().optional(),
  selection: z
    .strictObject({
      offerId: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/),
      units: z.array(UnitIn).max(20).default([]),
      extras: z.record(z.string().regex(/^[A-Za-z0-9_-]{2,40}$/), z.string().max(240)).default({}),
      bump: z.boolean().default(false),
      upsell: z.boolean().optional(),
    })
    .optional(),
  adjust: z.strictObject({ cents: z.number().int().max(0), reason: z.string().max(200) }).optional(),
});

const refresh = (handle: string) => revalidateStore(handle, "/orders", "");

/* ------------------------------------------------------------------ */
/* the drawer                                                          */
/* ------------------------------------------------------------------ */

export async function getOrderAction(id: string): Promise<ActionResult<OrderDrawerJson>> {
  return storeAction("orders.read", async (ctx) => {
    return (await orderDrawerJson(ctx, OrderId.parse(id))) ?? fail("This order doesn't exist.");
  });
}

/* ------------------------------------------------------------------ */
/* moves                                                               */
/* ------------------------------------------------------------------ */

/** "Move to…" (OPE-§12.6): a legacy label through the one writer; the rev the drawer rendered guards it (OD4). */
export async function moveOrderAction(id: string, status: string, expectRev?: number, opts: { reason?: string; note?: string } = {}) {
  return storeAction("orders.write", async (ctx) => {
    const o = z.strictObject({ reason: z.string().max(200).optional(), note: z.string().max(500).optional() }).parse(opts);
    // the undo token rides along when the order moved (OPE-§12.5: "Undo" for 10 s)
    const res = await moveWithUndo(ctx, OrderId.parse(id), Status.parse(status), expectRev === undefined ? undefined : Rev.parse(expectRev), o);
    if (res.ok && res.changed) refresh(ctx.store.handle);
    return res;
  });
}

/** orders.force_status: any from → to on one axis, with a reason (audited by the writer). */
export async function forceMoveAction(id: string, status: string, reason: string, expectRev?: number) {
  return storeAction("orders.force_status", async (ctx) => {
    const why = z.string().trim().min(3, { error: "Say why (at least 3 characters)." }).max(200).parse(reason);
    const res = await moveToLegacy(ctx, OrderId.parse(id), Status.parse(status), expectRev === undefined ? undefined : Rev.parse(expectRev), { force: true, reason: why });
    if (res.ok && res.changed) refresh(ctx.store.handle);
    return res;
  });
}

/**
 * The R1.0 status menu (today's screen until the drawer redesign): a legacy label through the one writer. The sheet
 * is a mirror pushed after the commit (OD2). A cancellation from it carries the code `other`.
 */
export async function updateOrderStatusAction(id: string, status: string): Promise<ActionResult<{ sheet: "updated" | "not_found" | "skipped" | "queued" }>> {
  return storeAction("orders.write", async (ctx) => {
    const label = Status.parse(status);
    const res = await moveToLegacy(ctx, OrderId.parse(id), label, undefined, label === "cancelled" ? { reason: "other" } : {});
    if (!res.ok) return fail(MOVE_ERROR_TEXT[res.error]);
    refresh(ctx.store.handle);
    return { sheet: res.changed ? "queued" : "skipped" };
  });
}

/* ------------------------------------------------------------------ */
/* editing and manual orders (OPE-§11)                                 */
/* ------------------------------------------------------------------ */

export async function editOrderAction(id: string, patch: OrderPatch, expectRev: number) {
  return storeAction("orders.edit", async (ctx) => {
    const res = await editOrder(ctx, OrderId.parse(id), Patch.parse(patch), Rev.parse(expectRev));
    if (res.ok && res.data.changed) refresh(ctx.store.handle);
    return res;
  });
}

export async function quoteManualOrderAction(input: unknown) {
  return storeAction("orders.create", (ctx) => quoteManualOrder(ctx, ManualOrderSchema.parse(input)));
}

/** `shipAfter`: "Deliver from…" with "The customer already confirmed" (OD49; a store-local day or an instant). */
export async function createManualOrderAction(input: unknown, opts: { shipAfter?: string | null } = {}) {
  return storeAction("orders.create", async (ctx) => {
    const raw = z.strictObject({ shipAfter: Hold.nullable().optional() }).parse(opts).shipAfter;
    const shipAfter = raw ? holdInstant(raw, ctx.store.timezone) : null;
    if (raw && !shipAfter) return { ok: false as const, error: "bad_hold" };
    const res = await createManualOrderWith(ctx, ManualOrderSchema.parse(input), { shipAfter });
    if (res.ok && !res.data.replayed) refresh(ctx.store.handle);
    return res;
  });
}

export async function convertLeadAction(leadId: string, input: unknown) {
  return storeAction(["orders.create", "leads.write"], async (ctx) => {
    const res = await convertLeadToOrder(ctx, LeadId.parse(leadId), ConvertLeadSchema.parse(input));
    if (res.ok) refresh(ctx.store.handle);
    return res;
  });
}

export async function dismissDuplicateAction(id: string, otherId: string) {
  return storeAction("orders.write", (ctx) => dismissDuplicate(ctx, OrderId.parse(id), OrderId.parse(otherId)));
}

/* ------------------------------------------------------------------ */
/* the carrier loop on one order (OD49, OD55, OPS-21)                   */
/* ------------------------------------------------------------------ */

export async function setShipAfterAction(id: string, shipAfter: string | null, expectRev?: number) {
  return storeAction("orders.write", async (ctx) => {
    const raw = Hold.nullable().parse(shipAfter);
    const at = raw === null ? null : holdInstant(raw, ctx.store.timezone);
    if (raw !== null && !at) return { ok: false as const, error: "bad_hold" as const };
    const res = await setOrderHold(ctx, OrderId.parse(id), at, expectRev === undefined ? undefined : Rev.parse(expectRev));
    if (res.ok && res.changed) refresh(ctx.store.handle);
    return res;
  });
}

export async function setTrackingAction(id: string, input: { trackingRef: string | null; carrierLabel?: string | null }) {
  return storeAction("shipments.write", async (ctx) => {
    const t = z.strictObject({ trackingRef: z.string().max(64).nullable(), carrierLabel: z.string().max(60).nullable().optional() }).parse(input);
    const res = await setOrderTracking(ctx, OrderId.parse(id), t);
    if (res.ok && (res.data.changed || res.data.packed)) refresh(ctx.store.handle);
    return res;
  });
}

export async function requestRecallAction(id: string, reason: string) {
  return storeAction("orders.write", (ctx) => requestRecall(ctx, OrderId.parse(id), z.string().max(32).parse(reason)));
}

export async function markCarrierNotifiedAction(id: string) {
  return storeAction("shipments.write", (ctx) => markCarrierNotified(ctx, OrderId.parse(id)));
}

export async function assignOrderAction(id: string, userId: string | null) {
  return storeAction("orders.assign", async (ctx) => {
    const res = await assignOrders(ctx, [OrderId.parse(id)], userId === null ? null : UserId.parse(userId));
    if (res.ok) refresh(ctx.store.handle);
    return res;
  });
}

/* ------------------------------------------------------------------ */
/* the sheet (P5's functions)                                          */
/* ------------------------------------------------------------------ */

export async function resendToSheetAction(id: string): Promise<ActionResult<{ synced: boolean }>> {
  return storeAction("orders.write", async ({ scope, actor, store }) => {
    const orderId = OrderId.parse(id);
    if (!(await requeueOrderSync(scope, orderId, actor))) fail("This order isn't sent to the sheet (bot-flagged orders never are).");
    const res = await syncPendingOrders(scope, { force: true, limit: 50, maxRetries: 2 });
    refresh(store.handle);
    if (res.status === "not_configured") fail("Queued. Google Sheets isn't connected yet, so it will be sent once you connect it.");
    if (res.status === "error") fail(res.error ?? "Google Sheets refused the update. It stays queued and will retry.");
    return { synced: res.status === "ok" };
  });
}

export async function retryFailedSyncAction(): Promise<ActionResult<{ sent: number; failed: number }>> {
  return storeAction("orders.write", async ({ scope, actor, store }) => {
    const res = await retryFailedSync(scope, actor);
    refresh(store.handle);
    if (res.status === "not_configured") fail("Google Sheets isn't connected.");
    if (res.status === "error") fail(res.error ?? "Google Sheets refused the update.");
    return { sent: res.appended + res.updated, failed: res.failed };
  });
}

/* ------------------------------------------------------------------ */
/* blocklist (today's screen; block-and-cancel lives in customers/actions.ts)                                   */
/* ------------------------------------------------------------------ */

export async function blockFromOrderAction(id: string, what: { phone: boolean; ip: boolean }, reason: string): Promise<ActionResult<null>> {
  return storeAction("blocklist.write", async ({ scope, actor, store }) => {
    const parsed = z.object({ phone: z.boolean(), ip: z.boolean() }).parse(what);
    if (!parsed.phone && !parsed.ip) fail("Choose what to block.");
    if (!(await blockFromOrder(scope, OrderId.parse(id), parsed, Reason.parse(reason), actor))) fail("This order doesn't exist.");
    refresh(store.handle);
    return null;
  });
}

export async function blockPhoneAction(phone: string, reason: string): Promise<ActionResult<{ e164: string }>> {
  return storeAction("blocklist.write", async ({ scope, actor, store }) => {
    const raw = z.string().trim().min(6, { error: "Enter a phone number." }).max(32).parse(phone);
    // the store's own market (ORD-16), not a platform-wide default
    const res = await blockPhone(scope, raw, phoneCountryOf(store), Reason.parse(reason), actor);
    if (!res.ok) return fail("That phone number isn't valid for your market. Use the international format (+212…) for other countries.");
    refresh(store.handle);
    return { e164: res.e164 };
  });
}

export async function unblockAction(id: string): Promise<ActionResult<null>> {
  return storeAction("blocklist.write", async ({ scope, actor, store }) => {
    if (!(await unblock(scope, BlockId.parse(id), actor))) fail("Already removed.");
    refresh(store.handle);
    return null;
  });
}

/* ------------------------------------------------------------------ */
/* the list: bulk, undo, saved views, carrier file, test orders (step 6) */
/* ------------------------------------------------------------------ */

const Ids = z.array(z.string().max(24)).min(1).max(BULK_MAX, { error: "Select up to 200 orders." });
/** the client's Idempotency key: a UUID is cached 10 min (OD36); any other short value runs without the cache */
const Idem = z.string().max(64).optional();
const ViewId = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, { error: "Unknown view." });
const BulkTargetZ = z.union([
  z.strictObject({ legacy: Status }),
  z.strictObject({
    want: z
      .strictObject({ confirm: z.enum(CONFIRM_STATES).optional(), ship: z.enum(SHIP_STATES).optional(), money: z.enum(MONEY_STATES).optional() })
      .refine((w) => Object.keys(w).length > 0, { error: "Pick where to move the orders." }),
    reason: z.string().max(200).optional(),
  }),
]);

/** orders.assign: "Assign to…" on the selection (null = back to the pool); `bulk` 30 / 10 min. */
export async function bulkAssignAction(ids: string[], userId: string | null, idem?: string) {
  return storeAction("orders.assign", async (ctx) => {
    const res = await bulkAssign(ctx, Ids.parse(ids), userId === null ? null : UserId.parse(userId), { idem: Idem.parse(idem) });
    if (res.ok && res.data.ok.length) refresh(ctx.store.handle);
    return res;
  });
}

/** orders.assign: "Pin to top" / unpin on the selection. */
export async function bulkPinAction(ids: string[], pinned: boolean, idem?: string) {
  return storeAction("orders.assign", async (ctx) => {
    const res = await bulkPin(ctx, Ids.parse(ids), z.boolean().parse(pinned), { idem: Idem.parse(idem) });
    if (res.ok && res.data.ok.length) refresh(ctx.store.handle);
    return res;
  });
}

/** orders.write: "Move to…" on the selection (each id through the writer, source bulk); answers the undo token. */
export async function bulkMoveAction(ids: string[], target: unknown, idem?: string) {
  return storeAction("orders.write", async (ctx) => {
    const res = await bulkMove(ctx, Ids.parse(ids), BulkTargetZ.parse(target), { idem: Idem.parse(idem) });
    if (res.ok && res.data.ok.length) refresh(ctx.store.handle);
    return res;
  });
}

/** orders.write: the toast's "Undo" (10 s on screen, the token lives 15 s). */
export async function undoMoveAction(token: string) {
  return storeAction("orders.write", async (ctx) => {
    const res = await undoMove(ctx, z.string().max(40).parse(token));
    if (res.ok && res.data.ok.length) refresh(ctx.store.handle);
    return res;
  });
}

/** shipments.write: the Carrier file's columns, delimiter and "Mark exported orders as packed" (ops.carrierCsv, OD55). */
export async function saveCarrierCsvColumnsAction(input: unknown) {
  return storeAction("shipments.write", (ctx) => saveCarrierCsvColumns(ctx, input));
}

/** settings.write (owner, admin): "Delete test orders" older than 1 hour (OPE-§26). */
export async function deleteTestOrdersAction() {
  return storeAction("settings.write", async (ctx) => {
    const res = await deleteTestOrdersNow(ctx);
    if (res.ok && res.data.deleted) refresh(ctx.store.handle);
    return res;
  });
}

/** The member's saved views and the team's (shown as tabs after the built-ins). */
export async function listSavedViewsAction() {
  return storeAction("orders.read", (ctx) => listSavedViews(ctx));
}

/**
 * Save the current filters as a view. Personal views need orders.write (a write key: an impersonation scope never
 * writes, D71); shared ones orders.assign as well, checked by `saveView`.
 */
export async function saveViewAction(input: unknown) {
  return storeAction("orders.write", (ctx) => saveView(ctx, SavedViewInput.parse(input)));
}

export async function renameViewAction(id: string, name: string, query?: unknown) {
  return storeAction("orders.write", (ctx) => renameView(ctx, ViewId.parse(id), z.string().max(200).parse(name), query === undefined ? undefined : OrderQuery.parse(query)));
}

export async function deleteViewAction(id: string) {
  return storeAction("orders.write", (ctx) => deleteView(ctx, ViewId.parse(id)));
}

export async function reorderViewsAction(ids: string[]) {
  return storeAction("orders.write", (ctx) => reorderViews(ctx, z.array(ViewId).max(60).parse(ids)));
}
