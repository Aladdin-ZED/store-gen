"use server";
/**
 * `/app/account/two-factor` (docs/STORE-SAAS.md §B.7; moved from /admin/two-factor): TOTP enrolment with its QR and
 * recovery codes, new recovery codes, and turning it off. Each action checks the origin, then the session; the answers
 * are catalog keys. Platform staff can't turn it off (the console needs it, §B.7); every privilege change rotates the
 * session (and ends the others when 2FA turns on).
 */
import { redirect } from "next/navigation";
import { AuthError, AuthInputError, getRequestContext, requireUser, rotateCurrentSession, SECURITY_SETTINGS_PATH, TWO_FACTOR_OFF_NOTICE } from "@/lib/auth";
import { inputErrorKey } from "@/lib/auth/i18n/input-errors";
import { beginTotpEnrollment, confirmTotpEnrollment, disableTwoFactor, regenerateRecoveryCodes, type EnrollmentChallenge } from "@/lib/auth/mfa";
import { ACCOUNT_TWO_FACTOR_PATH } from "@/lib/auth/paths";
import { normalizeTotpInput } from "@/lib/auth/totp";
import { assertActionOrigin } from "@/lib/tenancy/seam";
import { field } from "@/app/(public)/_lib/form-state";

export type ChallengeState = { status: "idle" } | { status: "error"; message: string } | ({ status: "challenge" } & EnrollmentChallenge);
export type CodesState = { status: "idle" } | { status: "error"; message: string; field?: "code" | "password" } | { status: "codes"; recoveryCodes: string[] };
export type DisableState = { status: "idle" } | { status: "error"; message: string; field?: "code" | "password" };

function failure(err: unknown): { message: string; field?: "code" | "password" } {
  if (err instanceof AuthInputError) return { message: inputErrorKey(err.message), field: err.field === "code" || err.field === "password" ? err.field : undefined };
  if (err instanceof AuthError) return { message: "error.session_ended" };
  throw err;
}

export async function beginEnrollmentAction(): Promise<ChallengeState> {
  try {
    await assertActionOrigin();
    const user = await requireUser({ throwOnFail: true });
    const { ip } = await getRequestContext();
    return { status: "challenge", ...(await beginTotpEnrollment(user.id, { ip })) };
  } catch (err) {
    return { status: "error", message: failure(err).message };
  }
}

export async function confirmEnrollmentAction(_prev: CodesState, data: FormData): Promise<CodesState> {
  const code = field(data, "code", 32);
  const password = field(data, "password", 1024);
  if (!normalizeTotpInput(code)) return { status: "error", message: "auth.verify.code_format", field: "code" };
  if (!password) return { status: "error", message: "account.2fa.password_required", field: "password" };
  try {
    await assertActionOrigin();
    const user = await requireUser({ throwOnFail: true });
    const { ip } = await getRequestContext();
    // the password is checked before 2FA turns on (a session alone is not enough)
    const { recoveryCodes } = await confirmTotpEnrollment(user.id, { code, password }, { ip });
    await rotateCurrentSession(user, { revokeOthers: true });
    return { status: "codes", recoveryCodes };
  } catch (err) {
    return { status: "error", ...failure(err) };
  }
}

export async function regenerateCodesAction(_prev: CodesState, data: FormData): Promise<CodesState> {
  const code = field(data, "code", 32);
  if (!normalizeTotpInput(code)) return { status: "error", message: "auth.verify.code_format", field: "code" };
  try {
    await assertActionOrigin();
    const user = await requireUser({ throwOnFail: true });
    const { ip } = await getRequestContext();
    const { recoveryCodes } = await regenerateRecoveryCodes(user.id, code, { ip });
    return { status: "codes", recoveryCodes };
  } catch (err) {
    return { status: "error", ...failure(err) };
  }
}

export async function disableAction(_prev: DisableState, data: FormData): Promise<DisableState> {
  const password = field(data, "password", 1024);
  const code = field(data, "code", 64);
  // whitelisted return target (never a free-form URL)
  const fromSettings = field(data, "from", 16) === "settings";
  if (!password) return { status: "error", message: "account.2fa.password_required", field: "password" };
  if (!code.trim()) return { status: "error", message: "account.2fa.code_required", field: "code" };
  try {
    await assertActionOrigin();
    const user = await requireUser({ throwOnFail: true });
    if (user.platformRole !== "none") return { status: "error", message: "account.2fa.staff_required" };
    const { ip } = await getRequestContext();
    await disableTwoFactor(user.id, password, { method: normalizeTotpInput(code) ? "totp" : "recovery", code }, { ip });
    await rotateCurrentSession(user);
  } catch (err) {
    return { status: "error", ...failure(err) };
  }
  redirect(fromSettings ? `${SECURITY_SETTINGS_PATH}?notice=${TWO_FACTOR_OFF_NOTICE}` : `${ACCOUNT_TWO_FACTOR_PATH}?notice=disabled`);
}
