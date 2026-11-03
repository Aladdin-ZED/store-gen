"use server";
/**
 * Order lookup actions of the console (P1 CONSOLE; platform.md PLA-§11.3, §M.1, PD14). A platform action file (lint L9).
 *
 *   const found = await lookupPhoneAction({ phone: "0612345678" });   // orders.lookup; masked rows across stores
 *
 * The phone is never stored or put in a URL: `p:orders:lookup:<userId>` 30/h, audit `platform.order.lookup` with a
 * hash of the number (src/lib/platform/order-lookup.ts). The lookup by order id is a page read.
 */
import { lookupOrdersByPhone, type PhoneLookup } from "@/lib/platform/order-lookup";
import { platformAction } from "@/lib/platform/seam";
import type { ActionResult } from "@/lib/tenancy/types";

/** `orders.lookup`: the masked orders of one phone number across stores. */
export async function lookupPhoneAction(input: { phone: string }): Promise<ActionResult<PhoneLookup>> {
  return platformAction("orders.lookup", (ctx) => lookupOrdersByPhone(ctx, typeof input?.phone === "string" ? input.phone : ""));
}
