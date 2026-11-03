"use server";
/**
 * Stores list actions of the console (P1 CONSOLE; platform.md PLA-§6.1, §19.1, §M.1). A platform action file: every
 * export is `return platformAction(permission, fn)` (lint L9).
 *
 *   await messageStoresAction({ storeIds, text, link, opId });   // notify.stores (support: one store at a time)
 *
 * The CSV of the list is the route GET /api/admin/stores.csv.
 */
import { done, opOf, withOp } from "@/lib/platform/op-dedupe";
import { messageStores, type MessageInput } from "@/lib/platform/messages";
import { platformAction } from "@/lib/platform/seam";
import type { ActionResult } from "@/lib/tenancy/types";

/** `notify.stores`: one notification and one audit row (`platform.store.messaged`) per store; ≤ 50 stores, ≤ 600 characters. */
export async function messageStoresAction(input: MessageInput & { opId?: string }): Promise<ActionResult<{ sent: string[]; skipped: string[] }>> {
  return platformAction("notify.stores", (ctx) => withOp(ctx, opOf(input), async () => done(await messageStores(ctx, input))));
}
