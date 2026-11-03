"use server";
/**
 * `/app/<h>/team/agents` server actions (P4 CALL CENTER; operations.md OPE-§14.2, §19.6, §M.3 team rows, OD54). Every
 * body is `return storeAction(…)`; the domain functions answer their own result inside `data` (another store's member
 * answers `not_found` there, exactly like a missing one).
 *
 *   updateAgentProfileAction   callcenter.configure   daily cap (empty = none) and weight 1-5
 *   mapAgentLabelAction        callcenter.configure   a sheet label → a member (`ops.agentLabels`, ≤ 50, ≤ 60 chars);
 *                                                     then in `after()`: the 90-day backfill of `confirmed_by`
 *                                                     (≤ 5,000 orders, one `assigned` event each), the 14-day rollup
 *                                                     and the audit `callcenter.label_mapped { label, count }`
 *   unmapAgentLabelAction      callcenter.configure   the label leaves the map
 */
import { after } from "next/server";
import { z } from "zod";
import { revalidateStore } from "@/lib/admin-data/shell";
import { backfillMappedLabel, mapAgentLabel, unmapAgentLabel } from "@/lib/callcenter/labels";
import { updateAgentProfile } from "@/lib/callcenter/settings.server";
import { logError } from "@/lib/orders/log";
import { storeAction } from "@/lib/tenancy/seam";

const UserId = z.string().regex(/^[0-9A-Z]{26}$/, { error: "Unknown member." });
const Label = z.string().max(200);

const refresh = (handle: string) => revalidateStore(handle, "/team/agents", "/queue/board");

/** callcenter.configure: a call taker's daily cap and round-robin weight. */
export async function updateAgentProfileAction(userId: string, input: unknown) {
  return storeAction("callcenter.configure", async (ctx) => {
    const res = await updateAgentProfile(ctx, UserId.parse(userId), input);
    if (res.ok) refresh(ctx.store.handle);
    return res;
  });
}

/** callcenter.configure: "Map to a member…" on a sheet label; the backfill runs after the answer. */
export async function mapAgentLabelAction(label: string, userId: string) {
  return storeAction("callcenter.configure", async (ctx) => {
    const res = await mapAgentLabel(ctx, Label.parse(label), UserId.parse(userId));
    if (res.ok) {
      after(async () => {
        try {
          await backfillMappedLabel(ctx, res.data.label, res.data.userId);
        } catch (err) {
          logError("ops:label-backfill", err);
        }
      });
      refresh(ctx.store.handle);
    }
    return res;
  });
}

/** callcenter.configure: the label is no longer mapped (past attributions stay). */
export async function unmapAgentLabelAction(label: string) {
  return storeAction("callcenter.configure", async (ctx) => {
    const res = await unmapAgentLabel(ctx, Label.parse(label));
    if (res.ok && res.data.removed) refresh(ctx.store.handle);
    return res;
  });
}
