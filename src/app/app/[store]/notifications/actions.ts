"use server";
/**
 * The notification centre's action (P2 SHELL; platform.md PLA-§22.6, §18.1, §M.1): `markNotificationsReadAction(ids |
 * "all")`, `store.read`, through P1's `markRead` with the viewer's own reader (this store, the member's role). Only
 * rows the reader may read are marked (at most 200); another store's or another reader's ids are ignored by `markRead`
 * itself. The bell's count is the pulse's (`notify-unread`, dropped by `markRead`).
 *
 * The key is a read, so the "view as store" and read-only refusals are this file's (`guardReadKeyWrite`, audited):
 * support reads, it marks nothing.
 */
import { revalidateStore } from "@/lib/admin-data/shell";
import { markRead } from "@/lib/platform/notify";
import { storeAction } from "@/lib/tenancy/seam";
import type { ActionResult } from "@/lib/tenancy/types";
import { readerRoleOf } from "@/app/api/app/[store]/pulse/compose";
import { guardReadKeyWrite } from "@/components/admin/shell/action-guards";
import { MarkReadInput, parseInput } from "@/components/admin/shell/action-inputs";

export async function markNotificationsReadAction(input: unknown): Promise<ActionResult<null>> {
  return storeAction("store.read", async (ctx) => {
    await guardReadKeyWrite(ctx, "markNotificationsReadAction");
    const ids = parseInput(MarkReadInput, input);
    await markRead({ userId: ctx.user.id, storeId: ctx.store.id, role: readerRoleOf(ctx.membership), platformRole: ctx.user.platformRole }, ids);
    revalidateStore(ctx.store.handle, "/notifications");
    return null;
  });
}
