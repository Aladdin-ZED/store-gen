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
import { field, fieldErrorsOf, formError, type FormState } from "@/app/(public)/_lib/form-state";

export type NewStoreState = FormState | { status: "closed" } | { status: "capped" };

export async function createStoreAction(_prev: NewStoreState, data: FormData): Promise<NewStoreState> {
  const values = { storeName: field(data, "storeName", 200), handle: field(data, "handle", 64), market: field(data, "market", 8) };
  const formMs = Number(field(data, "formMs", 12));
  const r = await userAction(async (ctx) => {
    const { ua } = await getRequestContext();
    return createAdditionalStore(
      ctx,
      { storeName: values.storeName, handle: values.handle, mode: "landing", market: values.market || undefined, formMs: Number.isFinite(formMs) ? formMs : null },
      { ua, deviceId: await getDeviceMarker() },
    );
  });
  if (!r.ok) {
    if (r.error === "invalid" && r.items?.length) return formError(undefined, fieldErrorsOf(r.items), values);
    return formError(r.message ?? (r.error === "rate_limited" ? "app.new.limit" : r.error === "busy" ? "error.busy" : `error.${r.error}`), undefined, values);
  }
  if (r.data.kind === "closed") return { status: "closed" };
  if (r.data.kind === "capped") return { status: "capped" };
  redirect(`/app/${r.data.handle}`);
}
