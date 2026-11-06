"use server";
/**
 * Settings → Plan & usage, the limit sheet and the mode cards (P2 SHELL; platform.md PLA-§3.7, §22.9, §22.10.4, §M.1,
 * §L). Every body is `return storeAction(…)` (lint L9); the store is the signed request path's (D2).
 *
 *   createStoreRequestAction    billing.manage, s:<sid>:request 5 / day   P1's createStoreRequest: one open request per
 *                                                                        kind per store, else already_requested;
 *                                                                        audit store.request.created { kind }
 *   withdrawStoreRequestAction  billing.manage                           P1's withdrawStoreRequest (the store's own
 *                                                                        open request); audit store.request.withdrawn
 *
 * The bucket is the action's (one count per request, PLA-§M.1). The writes are P1's: until P1 merges, its stubs
 * answer `unavailable` (`crossTrack`). Kinds: plan_change, limit_raise, mode_change, go_live (R3's domain is refused).
 */
import { revalidateStore } from "@/lib/admin-data/shell";
import { auditFrom } from "@/lib/audit";
import { AuthRefusal } from "@/lib/auth/errors";
import { createStoreRequest, withdrawStoreRequest } from "@/lib/platform/requests";
import { storeAction } from "@/lib/tenancy/seam";
import type { ActionResult } from "@/lib/tenancy/types";
import { crossTrack } from "@/components/admin/shell/action-guards";
import { parseInput, StoreRequestInput, WithdrawRequestInput } from "@/components/admin/shell/action-inputs";

export async function createStoreRequestAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return storeAction(
    "billing.manage",
    async (ctx) => {
      const req = parseInput(StoreRequestInput, input);
      const r = await crossTrack(() => createStoreRequest(ctx, req));
      if ("already" in r) throw new AuthRefusal("already_requested", "error.already_requested");
      await auditFrom(ctx, "store.request.created", { target: r.id, meta: { kind: req.kind } });
      revalidateStore(ctx.store.handle, "/settings/plan");
      return { id: r.id };
    },
    { rate: { name: "request", limit: 5, windowSec: 86_400, per: "store" } },
  );
}

export async function withdrawStoreRequestAction(input: unknown): Promise<ActionResult<null>> {
  return storeAction("billing.manage", async (ctx) => {
    const { requestId } = parseInput(WithdrawRequestInput, input);
    await crossTrack(() => withdrawStoreRequest(ctx, requestId));
    await auditFrom(ctx, "store.request.withdrawn", { target: requestId });
    revalidateStore(ctx.store.handle, "/settings/plan");
    return null;
  });
}
