"use server";

import { redirect } from "next/navigation";
import { assertAdminAccess, getPendingMfa, getRequestContext, landingPathFor, LOGIN_PATH, safeAppPath, TWO_FACTOR_PATH } from "@/lib/auth";
import { clearSessionCookie, setSessionCookie } from "@/lib/auth/cookies";
import { completeSecondFactor } from "@/lib/auth/login";
import { normalizeRecoveryCode } from "@/lib/auth/recovery";
import { normalizeTotpInput } from "@/lib/auth/totp";
import { field, formError, type FormState } from "../../_lib/form-state";

export async function verifyAction(_prev: FormState, data: FormData): Promise<FormState> {
  await assertAdminAccess();
  const pending = await getPendingMfa();
  if (!pending) redirect(`${LOGIN_PATH}?notice=mfa-expired`);

  const method = field(data, "method", 16) === "recovery" ? "recovery" : "totp";
  const code = field(data, "code", 64);
  const next = safeAppPath(field(data, "next", 512));

  if (method === "totp" && !normalizeTotpInput(code)) {
    return formError(undefined, { code: "Enter the 6-digit code from your authenticator app." });
  }
  if (method === "recovery" && !normalizeRecoveryCode(code)) {
    return formError(undefined, { code: "Recovery codes look like XXXX-XXXX-XXXX." });
  }

  const result = await completeSecondFactor(
    { sessionId: pending.sessionId, userId: pending.userId },
    { method, code },
    await getRequestContext(),
  );

  if (!result.ok) {
    if (result.error === "invalid") {
      return formError(
        method === "totp"
          ? "That code didn't work. Wait for a fresh code and try again."
          : "That recovery code didn't work. Check it and try again.",
      );
    }
    // locked or expired: the pending session is gone, start over from the password step
    await clearSessionCookie();
    redirect(`${LOGIN_PATH}?notice=${result.error === "locked" ? "mfa-locked" : "mfa-expired"}`);
  }

  await setSessionCookie(result.session.token, result.session.cookieExpiresAt);
  // A spent recovery code deserves a look at the remaining ones.
  if (result.method === "recovery") redirect(`${TWO_FACTOR_PATH}?notice=recovery-used`);
  redirect(next ?? landingPathFor(result.memberships, result.lastStoreId, result.platformRole));
}
