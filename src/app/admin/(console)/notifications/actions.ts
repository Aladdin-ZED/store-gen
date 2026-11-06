"use server";
/**
 * Staff notifications actions of the console (P1 CONSOLE; platform.md PLA-§18, §M.1). A platform action file (lint L9).
 *
 *   await markStaffNotificationsReadAction({ ids: "all" });   // or the ids shown (≤ 200)
 *
 * `console.read`: the staff member's own read rows only (the reader is the session's user with their platform role;
 * ids they may not read are ignored by src/lib/platform/notify.ts). The `console-unread` count is dropped.
 */
import { done } from "@/lib/platform/op-dedupe";
import { markRead } from "@/lib/platform/notify";
import { platformAction } from "@/lib/platform/seam";
import type { ActionResult } from "@/lib/tenancy/types";

/** `console.read`: marks the staff feed read (all, or the given ids). */
export async function markStaffNotificationsReadAction(input: { ids: number[] | "all" }): Promise<ActionResult<{ marked: true }>> {
  return platformAction("console.read", async (ctx) => {
    const ids = input?.ids === "all" ? "all" : Array.isArray(input?.ids) ? input.ids.filter((id): id is number => typeof id === "number").slice(0, 200) : [];
    await markRead({ userId: ctx.user.id, storeId: null, role: null, platformRole: ctx.role }, ids);
    return done({ marked: true as const });
  });
}
