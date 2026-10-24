"use server";
/**
 * `/admin/setup/store`, step three of the first run (docs/STORE-SAAS.md §B.11): the super_admin's first store
 * (landing, MA, MAD, Africa/Casablanca, plan `internal`, active). `createSetupStore` refuses anyone but a
 * super_admin with TOTP who owns no store yet.
 */
import { redirect } from "next/navigation";
import { assertAdminAccess, FieldsError, getRequestContext, requireUser } from "@/lib/auth";
import { AuthRefusal } from "@/lib/auth/errors";
import { createSetupStore } from "@/lib/auth/bootstrap";
import { setSessionLastStore } from "@/lib/auth/session";
import { assertActionOrigin } from "@/lib/tenancy/seam";
import { field, formError, type FormState } from "@/app/(public)/_lib/form-state";

export async function setupStoreAction(_prev: FormState, data: FormData): Promise<FormState> {
  await assertAdminAccess();
  await assertActionOrigin();
  const user = await requireUser({ throwOnFail: true });
  const values = { storeName: field(data, "storeName", 200), handle: field(data, "handle", 64) };
  let created: { storeId: string; handle: string };
  try {
    created = await createSetupStore(user.id, values, await getRequestContext());
  } catch (err) {
    if (err instanceof FieldsError) return formError(undefined, { ...err.fields }, values);
    if (err instanceof AuthRefusal) return formError(err.messageKey ?? (err.code === "conflict" ? "console.setup.store_exists" : "error.forbidden"), undefined, values);
    throw err;
  }
  await setSessionLastStore(user.sessionId, created.storeId);
  redirect(`/app/${created.handle}`);
}
