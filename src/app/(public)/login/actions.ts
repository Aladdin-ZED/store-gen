"use server";
/**
 * `/login` (docs/STORE-SAAS.md §B.3): `publicAction("login")` (same-origin, the burst floor, the device marker), then
 * `loginAccount()` with its three buckets and the challenge past 3 failures. The answer never says whether the
 * e-mail exists. A fresh sign-in drops whatever session this browser carried, then lands on the safe `next` or on
 * `landingPathFor()`.
 */
import { redirect } from "next/navigation";
import { z } from "zod";
import { landingPathFor, normalizeEmail, publicAction, safeAppPath, signInVerifyUrl } from "@/lib/auth";
import { readSessionToken, setSessionCookie } from "@/lib/auth/cookies";
import { loginAccount } from "@/lib/auth/login";
import { deleteSessionByToken } from "@/lib/auth/session";
import { field, formError, type FieldErrors, type FormState } from "../_lib/form-state";

export async function loginAction(_prev: FormState, data: FormData): Promise<FormState> {
  const email = field(data, "email", 320).trim();
  const password = field(data, "password", 1024);
  const next = safeAppPath(field(data, "next", 512));
  const token = field(data, "cf-turnstile-response", 2048) || null;

  const fieldErrors: FieldErrors = {};
  if (!email) fieldErrors.email = "auth.login.email_required";
  else if (!z.email().safeParse(normalizeEmail(email)).success) fieldErrors.email = "auth.email_invalid";
  if (!password) fieldErrors.password = "auth.login.password_required";
  if (Object.keys(fieldErrors).length) return formError(undefined, fieldErrors, { email });

  const r = await publicAction(
    "login",
    async (ctx) => {
      // a new sign-in always starts from a clean slate
      await deleteSessionByToken(await readSessionToken());
      return loginAccount({ email, password, turnstileToken: token }, { ip: ctx.ip, ua: ctx.ua, deviceId: ctx.deviceId });
    },
    { turnstile: "challenge", burst: "login" },
  );
  if (!r.ok) return formError(r.error === "rate_limited" ? "auth.login.limited" : r.error === "busy" ? "auth.login.busy" : "error.server", undefined, { email });
  const result = r.data;
  if (!result.ok) {
    const key = { invalid: "auth.login.invalid", rate_limited: "auth.login.limited", challenge: "auth.login.challenge", busy: "auth.login.busy" }[result.error];
    return formError(key, undefined, { email }, { challenge: result.error === "challenge" });
  }

  await setSessionCookie(result.session.token, result.session.cookieExpiresAt);
  redirect(result.mfaRequired ? signInVerifyUrl(next) : (next ?? landingPathFor(result.memberships, result.lastStoreId, result.platformRole)));
}
