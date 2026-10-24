"use server";
/**
 * `/admin/setup` step one (docs/STORE-SAAS.md §B.11): the SETUP_TOKEN (digest comparison), then the first
 * super_admin under the `setup` named lock. Step two is the account's TOTP enrolment (forced: the console stays closed
 * without it, §B.7), step three the owner's first store (`/admin/setup/store`).
 */
import { createHash } from "node:crypto";
import { notFound, redirect, unstable_rethrow } from "next/navigation";
import { audit } from "@/lib/audit";
import { assertAdminAccess, AuthBusyError, FieldsError, getRequestContext } from "@/lib/auth";
import { limits } from "@/lib/auth/attempts";
import { bootstrapSuperAdmin, setupOpen } from "@/lib/auth/bootstrap";
import { setupTokenSecret } from "@/lib/auth/config";
import { setSessionCookie } from "@/lib/auth/cookies";
import { ACCOUNT_TWO_FACTOR_PATH } from "@/lib/auth/paths";
import { createSession } from "@/lib/auth/session";
import { errorSummary } from "@/lib/orders/log";
import { safeEqual } from "@/lib/security/crypto";
import { assertActionOrigin } from "@/lib/tenancy/seam";
import { field, formError, type FieldErrors, type FormState } from "@/app/(public)/_lib/form-state";

const digest = (v: string) => createHash("sha256").update(v, "utf8").digest("hex");

export async function setupAction(_prev: FormState, data: FormData): Promise<FormState> {
  await assertAdminAccess();
  await assertActionOrigin();
  const expected = setupTokenSecret();
  if (!expected || !(await setupOpen())) notFound();

  const ctx = await getRequestContext();
  const values = { name: field(data, "name", 200), email: field(data, "email", 320).trim() };

  if (!(await limits.setupIp(ctx.ip)).ok) return formError("error.rate_limited", undefined, values);

  // digest comparison: constant time regardless of where the strings differ (or their lengths)
  if (!safeEqual(digest(field(data, "token", 256).trim()), digest(expected))) {
    await audit("auth.setup.failure", { meta: { reason: "bad_token" }, ip: ctx.ip });
    return formError(undefined, { token: "console.setup.token_wrong" }, values);
  }

  const password = field(data, "password", 1024);
  const fieldErrors: FieldErrors = {};
  if (!values.name.trim()) fieldErrors.name = "auth.name_invalid";
  if (!values.email) fieldErrors.email = "auth.email_invalid";
  if (!password) fieldErrors.password = "auth.password.too_short";
  else if (password !== field(data, "confirm", 1024)) fieldErrors.confirm = "auth.reset.mismatch";
  if (Object.keys(fieldErrors).length) return formError(undefined, fieldErrors, values);

  let ownerId: string;
  try {
    const owner = await bootstrapSuperAdmin({ name: values.name, email: values.email, password }, ctx);
    if (!owner) notFound();
    ownerId = owner.userId;
  } catch (err) {
    if (err instanceof FieldsError) return formError(undefined, { ...err.fields }, values);
    if (err instanceof AuthBusyError) return formError("error.busy", undefined, values);
    unstable_rethrow(err); // notFound() and other Next control flow
    // logged by code only: a failed INSERT would print its bound values (the e-mail, the hash)
    console.error("[setup] owner creation failed:", errorSummary(err));
    return formError("error.server", undefined, values);
  }

  const session = await createSession(ownerId, { mfaPassed: true, ...ctx });
  await setSessionCookie(session.token, session.cookieExpiresAt);
  redirect(`${ACCOUNT_TWO_FACTOR_PATH}?from=setup`);
}
