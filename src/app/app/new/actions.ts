"use server";
/**
 * `/app/new` (docs/STORE-SAAS.md §B.1, PLA-§22.2): another store for the signed-in account, a `userAction` around
 * `createAdditionalStore` (the kill switch, `p:store:create:<userId>` 3/day, the score, the day's sandbox slot when
 * it starts pending, one transaction). The new store becomes the session's last store and opens.
 */
import { redirect } from "next/navigation";
import { userAction } from "@/lib/auth";
import { getDeviceMarker, getRequestContext } from "@/lib/auth/request";
import { createAdditionalStore } from "@/lib/auth/signup";
import type { ActionResult } from "@/lib/tenancy/types";
import { field, type FormState } from "@/app/(public)/_lib/form-state";

export type NewStoreState = FormState | { status: "closed" } | { status: "capped" };

export async function createStoreAction(data: FormData): Promise<ActionResult<NewStoreState>> {
  return userAction(async (ctx): Promise<NewStoreState> => {
    const formMs = Number(field(data, "formMs", 12));
    const market = field(data, "market", 8);
    const { ua } = await getRequestContext();
    const r = await createAdditionalStore(
      ctx,
      { storeName: field(data, "storeName", 200), handle: field(data, "handle", 64), mode: "landing", market: market || undefined, formMs: Number.isFinite(formMs) ? formMs : null },
      { ua, deviceId: await getDeviceMarker() },
    );
    if (r.kind === "closed") return { status: "closed" };
    if (r.kind === "capped") return { status: "capped" };
    redirect(`/app/${r.handle}`);
  });
}
