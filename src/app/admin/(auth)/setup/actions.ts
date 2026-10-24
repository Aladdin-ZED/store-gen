"use server";

import { createHash } from "node:crypto";
import { notFound, redirect, unstable_rethrow } from "next/navigation";
import { audit } from "@/lib/audit";
import { assertAdminAccess, AuthBusyError, FieldsError, getRequestContext, TWO_FACTOR_PATH } from "@/lib/auth";
import { limits } from "@/lib/auth/attempts";
import { bootstrapSuperAdmin, setupOpen } from "@/lib/auth/bootstrap";
import { setupTokenSecret } from "@/lib/auth/config";
import { setSessionCookie } from "@/lib/auth/cookies";
import { createSession } from "@/lib/auth/session";
import { errorSummary } from "@/lib/orders/log";
import { safeEqual } from "@/lib/security/crypto";
import { field, formError, type FieldErrors, type FormState } from "../_lib/form-state";

const digest = (v: string) => createHash("sha256").update(v, "utf8").digest("hex");

/** The first-run form is the console's (English until the console catalogs exist, §I.5). */
const SETUP_FIELD_TEXT: Record<string, string> = {
  "auth.email_invalid": "Enter a valid email address.",
  "auth.name_invalid": "Enter a name.",
  "auth.password.too_short": "Use at least 10 characters.",
  "auth.password.too_long": "Use at most 200 characters.",
  "auth.password.contains_email": "Don't include your email address in your password.",
  "auth.password.common": "This password is too common. Choose something less predictable.",
  "auth.password.repetitive": "Use a less repetitive password.",
  "auth.setup.email_taken": "An account with this email already exists.",
};

export async function setupAction(_prev: FormState, data: FormData): Promise<FormState> {
  await assertAdminAccess();
  const expected = setupTokenSecret();
  if (!expected || !(await setupOpen())) notFound();

  const ctx = await getRequestContext();
  const values = { name: field(data, "name", 200), email: field(data, "email", 320).trim() };

  const rl = await limits.setupIp(ctx.ip);
  if (!rl.ok) return formError("Too many attempts. Wait a few minutes, then try again.", undefined, values);

  // Digest comparison: constant time regardless of where the strings differ (or their lengths).
  if (!safeEqual(digest(field(data, "token", 256).trim()), digest(expected))) {
    await audit("auth.setup.failure", { meta: { reason: "bad_token" }, ip: ctx.ip });
    return formError(undefined, { token: "This setup token isn't valid." }, values);
  }

  const password = field(data, "password", 1024);
  const confirm = field(data, "confirm", 1024);
  const fieldErrors: FieldErrors = {};
  if (!values.name.trim()) fieldErrors.name = "Enter your name.";
  if (!values.email) fieldErrors.email = "Enter your email address.";
  if (!password) fieldErrors.password = "Choose a password.";
  else if (password !== confirm) fieldErrors.confirm = "The passwords don't match.";
  if (Object.keys(fieldErrors).length) return formError(undefined, fieldErrors, values);

  let ownerId: string;
  try {
    const owner = await bootstrapSuperAdmin({ name: values.name, email: values.email, password }, ctx);
    if (!owner) notFound();
    ownerId = owner.userId;
  } catch (err) {
    if (err instanceof FieldsError) {
      const errors: FieldErrors = {};
      for (const [name, key] of Object.entries(err.fields)) errors[name] = SETUP_FIELD_TEXT[key] ?? "Check this field.";
      return formError(undefined, errors, values);
    }
    if (err instanceof AuthBusyError) return formError("The server is busy. Try again in a few seconds.", undefined, values);
    unstable_rethrow(err); // notFound() and other Next control flow
    // Logged here by code only: left to Next's default logging, a failed INSERT would print its
    // bound values (the owner's e-mail and password hash) to the server log.
    console.error("[setup] owner creation failed:", errorSummary(err));
    return formError("Something went wrong on the server. Please try again.", undefined, values);
  }

  const session = await createSession(ownerId, { mfaPassed: true, ...ctx });
  await setSessionCookie(session.token, session.cookieExpiresAt);
  redirect(`${TWO_FACTOR_PATH}?from=setup`);
}
