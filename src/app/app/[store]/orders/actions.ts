"use server";
/**
 * Orders screen of the store on screen: order details, status changes (mirrored to Google Sheets first), sheet
 * re-send, blocklist management. Every action goes through the store's seam (the signed request path): `orders.read`
 * / `orders.write` for orders, `blocklist.write` (owner, admin, manager) for the blocklist. Another store's order or
 * entry id answers like a missing one.
 */
import { z } from "zod";
import { fail } from "@/lib/admin-data/action";
import { orderDetailJson, type OrderDetailJson } from "@/lib/admin-data/orders";
import { revalidateStore } from "@/lib/admin-data/shell";
import { blockFromOrder, blockPhone, isOrderStatus, requeueOrderSync, retryFailedSync, unblock, updateOrderStatus } from "@/lib/orders";
import type { OrderStatus } from "@/lib/orders/contract";
import { getStoreSetting } from "@/lib/settings";
import { syncPendingOrders } from "@/lib/sheets";
import { storeAction } from "@/lib/tenancy/seam";
import type { ActionResult } from "@/lib/tenancy/types";

const OrderId = z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,8}-[A-Z0-9]{4,12}$/, { error: "Unknown order." });
const Status = z.custom<OrderStatus>((v) => isOrderStatus(v), { error: "Unknown status." });
const BlockId = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, { error: "Unknown entry." });
const Reason = z
  .string()
  .max(200, { error: "Keep the reason under 200 characters." })
  .transform((v) => v.replace(/[\u0000-\u001f\u007f]/g, " ").trim() || null);

const refresh = (handle: string) => revalidateStore(handle, "/orders", "");

export async function getOrderAction(id: string): Promise<ActionResult<OrderDetailJson>> {
  return storeAction("orders.read", async ({ scope }) => {
    return (await orderDetailJson(scope, OrderId.parse(id))) ?? fail("This order doesn't exist.");
  });
}

export async function updateOrderStatusAction(id: string, status: string): Promise<ActionResult<{ sheet: "updated" | "not_found" | "skipped" | "queued" }>> {
  return storeAction("orders.write", async ({ scope, actor, store }) => {
    const res = await updateOrderStatus(scope, OrderId.parse(id), Status.parse(status), actor);
    if (!res.ok) return fail(res.error);
    refresh(store.handle);
    return { sheet: res.sheet };
  });
}

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
    const { phoneCountry } = await getStoreSetting(scope, "defaults");
    const res = await blockPhone(scope, raw, phoneCountry, Reason.parse(reason), actor);
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
