"use server";
/**
 * Console store creation (P1 CONSOLE; platform.md PLA-§6.2, §13.3, §M.1). A platform action file (lint L9).
 *
 *   const { storeId, handle } = await createStoreAction({ name, handle, mode, ownerEmail, note, opId });
 *
 * `stores.create` (super_admin): runs `checkBrandTerms` on the name (an exact match needs the staff note, PD70), creates
 * the store through T2's `insertStoreTx` with its approved review row (`console_created`), audit `store.created`.
 */
import { doneStore, opOf, withOp } from "@/lib/platform/op-dedupe";
import { createStore, type CreateStoreInput } from "@/lib/platform/store-create";
import { platformAction } from "@/lib/platform/seam";
import type { ActionResult } from "@/lib/tenancy/types";

/** `stores.create`: answers the new store's id and handle (the page opens its profile). */
export async function createStoreAction(input: CreateStoreInput & { opId?: string }): Promise<ActionResult<{ storeId: string; handle: string }>> {
  return platformAction("stores.create", (ctx) =>
    withOp(ctx, opOf(input), async () => {
      const made = await createStore(ctx, input);
      return doneStore(made.storeId, made);
    }),
  );
}
