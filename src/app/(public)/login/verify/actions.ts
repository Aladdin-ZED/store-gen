"use server";
/**
 * `/login/verify` (docs/STORE-SAAS.md §B.3): the TOTP or recovery step of a password sign-in. Too many wrong codes end
 * the pending session (password again); a spent recovery code opens the two-step page so the remaining ones get a look.
 * Through `publicAction("verify")` (same-origin, the sign-in burst floor): the session is only half open here.
 */
import { redirect } from "next/navigation";
import { getPendingMfa, getRequestContext, landingPathFor, publicAction, safeAppPath } from "@/lib/auth";
import { clearSessionCookie, setSessionCookie } from "@/lib/auth/cookies";
import { completeSecondFactor } from "@/lib/auth/login";
import { ACCOUNT_TWO_FACTOR_PATH, LOGIN_PATH } from "@/lib/auth/paths";
import { normalizeRecoveryCode } from "@/lib/auth/recovery";
import { getDeviceMarker } from "@/lib/auth/request";
import { normalizeTotpInput } from "@/lib/auth/totp";
import type { ActionResult } from "@/lib/tenancy/types";
import { field, formError, type FormState } from "../../_lib/form-state";

export async function verifyAction(data: FormData): Promise<ActionResult<FormState>> {
  return publicAction(
    "verify",
    async () => {
      const pending = await getPendingMfa();
      if (!pending) redirect(`${LOGIN_PATH}?notice=mfa-expired`);

      const method = field(data, "method", 16) === "recovery" ? "recovery" : "totp";
      const code = field(data, "code", 64);
      const next = safeAppPath(field(data, "next", 512));

      if (method === "totp" && !normalizeTotpInput(code)) return formError(undefined, { code: "auth.verify.code_format" });
      if (method === "recovery" && !normalizeRecoveryCode(code)) return formError(undefined, { code: "auth.verify.recovery_format" });

      const result = await completeSecondFactor(
        { sessionId: pending.sessionId, userId: pending.userId },
        { method, code },
        { ...(await getRequestContext()), deviceId: await getDeviceMarker() },
      );

      if (!result.ok) {
        if (result.error === "invalid") return formError(method === "totp" ? "auth.verify.code_wrong" : "auth.verify.recovery_wrong");
        // locked or expired: the pending session is gone, start over from the password step
        await clearSessionCookie();
        redirect(`${LOGIN_PATH}?notice=${result.error === "locked" ? "mfa-locked" : "mfa-expired"}`);
      }

      await setSessionCookie(result.session.token, result.session.cookieExpiresAt);
      if (result.method === "recovery") redirect(`${ACCOUNT_TWO_FACTOR_PATH}?notice=recovery-used`);
      redirect(next ?? landingPathFor(result.memberships, result.lastStoreId, result.platformRole));
    },
    // the pending session is the gate; the sign-in burst floor per network (the codes have their own buckets)
    { turnstile: "challenge", burst: "login" },
  );
}
