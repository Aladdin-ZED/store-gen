"use server";
/**
 * Actions of Connect → Integrations, the deliveries log and its replays (operations.md OPE-§M.3 P5 rows, §28.1,
 * OPE-§L "Replay", OPE-§Q.26; core §E.2, §H.1, §E.8, §F.5). The rules of a replay live in
 * src/lib/integrations/replay.ts (the store's own rows only, Send again on `done` Telegram / webhook rows only, a
 * pending row a no-op, `s:<sid>:replay:<uid>` 30/h charged once per call, one audit row per replayed row).
 *
 *   replayDeliveryAction(id)          integrations.manage (s)   Replay a dead row, or Send again a done one
 *   replayDeadOfKindAction(kind)      integrations.manage (s)   Replay all dead of this kind (≤ 50 rows, one call)
 *   listDeliveriesAction(q)           integrations.manage or callcenter.configure (read-only: the log without Replay)
 */
import { z } from "zod";
import { fail } from "@/lib/admin-data/action";
import { revalidateStore } from "@/lib/admin-data/shell";
import { DELIVERIES_PAGE_MAX, listDeliveries, TENANT_OUTBOX_KINDS, type DeliveryRow } from "@/lib/integrations/deliveries";
import { replayDeadOfKind, replayDelivery, ReplayRefused, type ReplayResult } from "@/lib/integrations/replay";
import { SeamError, storeAction } from "@/lib/tenancy/seam";
import type { ActionResult } from "@/lib/tenancy/types";

const PAGE = "/integrations" as const;
const OutboxId = z.string().trim().min(1).max(40);
const Kind = z.enum(TENANT_OUTBOX_KINDS);

const DeliveriesInput = z.object({
  kind: Kind.optional(),
  state: z.enum(["pending", "running", "done", "dead", "cancelled"]).optional(),
  after: z.string().max(80).optional(),
  limit: z.number().int().min(1).max(DELIVERIES_PAGE_MAX).optional(),
});

/** Replay (a dead row) or Send again (a done Telegram / webhook row); a pending row is a no-op. */
export async function replayDeliveryAction(id: string): Promise<ActionResult<ReplayResult>> {
  return storeAction("integrations.manage", async (ctx) => {
    try {
      const r = await replayDelivery(ctx, OutboxId.parse(id));
      if (r.outcome !== "noop") revalidateStore(ctx.store.handle, PAGE);
      return r;
    } catch (err) {
      if (err instanceof ReplayRefused) fail(`int.err.replay_${err.code}`);
      throw err;
    }
  });
}

/** "Replay all dead of this kind": at most 50 rows, oldest first; `more` when others are left. */
export async function replayDeadOfKindAction(kind: string): Promise<ActionResult<{ replayed: number; more: boolean }>> {
  return storeAction("integrations.manage", async (ctx) => {
    const r = await replayDeadOfKind(ctx, Kind.parse(kind));
    if (r.replayed) revalidateStore(ctx.store.handle, PAGE);
    return r;
  });
}

/** The deliveries log (masked rows: never a phone, a name or a sealed payload; OPE-§28.3 (4)). */
export async function listDeliveriesAction(q: z.input<typeof DeliveriesInput>): Promise<ActionResult<{ rows: DeliveryRow[]; next: string | null }>> {
  return storeAction(null, async (ctx) => {
    // integrations.manage, or callcenter.configure read-only (OPE-§28.1): either key opens the log
    if (!ctx.can("integrations.manage") && !ctx.can("callcenter.configure")) throw new SeamError("forbidden");
    return listDeliveries(ctx.scope, DeliveriesInput.parse(q ?? {}));
  });
}
