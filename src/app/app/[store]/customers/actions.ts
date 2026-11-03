"use server";
/**
 * The customers screen's server actions (P4 CALL CENTER; operations.md §M.3 customers rows, OPE-§9.2, §9.5, OP-12).
 * Every body is `return storeAction(…)`; the functions answer their own result inside `data` (another store's id
 * answers `not_found`, like a missing one).
 *
 *   blockPreviewAction         blocklist.write                  "This number has 2 open orders and 1 shipped order"
 *   blockPhoneAndCancelAction  blocklist.write (+ orders.write to move the open orders, checked by the function)
 *   unblockAction              blocklist.write, audited
 *   saveCustomerNoteAction     customers.read + orders.write, ≤ 300 characters
 */
import { z } from "zod";
import { revalidateStore } from "@/lib/admin-data/shell";
import { blockPhoneAndCancel, blockPreview, unblock } from "@/lib/orders/admin";
import { saveCustomerNote } from "@/lib/orders/customers";
import { cleanInput } from "@/lib/orders/validate";
import { storeAction } from "@/lib/tenancy/seam";
import type { ActionResult } from "@/lib/tenancy/types";

const OrderId = z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,8}-[A-Z0-9]{4,12}$/, { error: "Unknown order." });
const Id26 = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, { error: "Unknown entry." });
const Target = z
  .strictObject({ phone: z.string().trim().min(6).max(40).optional(), orderId: OrderId.optional() })
  .refine((t) => !!t.phone !== !!t.orderId, { error: "Give a phone number or an order." });

const refresh = (handle: string) => revalidateStore(handle, "/customers", "/orders");

export async function blockPreviewAction(target: { phone?: string; orderId?: string }) {
  return storeAction("blocklist.write", (ctx) => blockPreview(ctx, Target.parse(target)));
}

export async function blockPhoneAndCancelAction(input: { phone?: string; orderId?: string; reason?: string; openOrders: "fake" | "cancel" | "keep" }) {
  return storeAction("blocklist.write", async (ctx) => {
    const i = z
      .strictObject({
        phone: z.string().trim().min(6).max(40).optional(),
        orderId: OrderId.optional(),
        reason: z.string().max(200).optional(),
        openOrders: z.enum(["fake", "cancel", "keep"]).default("fake"),
      })
      .refine((t) => !!t.phone !== !!t.orderId, { error: "Give a phone number or an order." })
      .parse(input);
    const res = await blockPhoneAndCancel(ctx, { ...i, ...(i.reason ? { reason: cleanInput(i.reason, 200) } : {}) });
    if (res.ok) refresh(ctx.store.handle);
    return res;
  });
}

export async function unblockAction(id: string): Promise<ActionResult<{ ok: true } | { ok: false; error: "not_found" }>> {
  return storeAction("blocklist.write", async (ctx) => {
    const ok = await unblock(ctx.scope, Id26.parse(id), ctx.actor);
    if (ok) refresh(ctx.store.handle);
    return ok ? { ok: true as const } : { ok: false as const, error: "not_found" as const };
  });
}

/** The customer's internal note (OPE-§9.2): customers.read + orders.write (checked by the function), ≤ 300 characters. */
export async function saveCustomerNoteAction(customerId: string, note: string) {
  return storeAction("orders.write", async (ctx) => {
    const res = await saveCustomerNote(ctx, Id26.parse(customerId), z.string().max(2_000).parse(note));
    if (res.ok) refresh(ctx.store.handle);
    return res;
  });
}
