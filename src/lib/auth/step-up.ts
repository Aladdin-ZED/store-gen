import "server-only";
/**
 * Step-up (docs/STORE-SAAS.md §B.7, SEC-17, PLA Q4.8, Q.32): a fresh proof of the person behind a session, written to
 * `sessions.step_up_at` and fresh for 5 minutes (`PlatformCtx.stepUpUntil` / `StoreCtx.stepUpUntil` feed the
 * "Verified · 4:12" chip).
 *
 *   stepUpWithTotp(code)          the TOTP sheet (staff always; tenants with 2FA), bucket p:mfa:stepup:<userId> 5 / 15 min
 *   stepUpWithPassword(password)  the tenant ladder's "sudo mode" for an account without TOTP, bucket p:password:<userId>,
 *                                 through the scrypt semaphore; refused under impersonation (`impersonation_read_only`)
 *
 * An account with TOTP steps up with TOTP only: the password alone would be a weaker second proof than the one it
 * holds. Both answer `{ until }` (ISO) and audit `auth.step_up` with the method; the step-up-gated audit rows name it
 * again in `meta.stepUp`.
 */
import { audit } from "@/lib/audit";
import { STEP_UP_TTL_MS, SeamError } from "@/lib/tenancy/seam";
import type { UserCtx } from "@/lib/tenancy/types";
import { limits } from "./attempts";
import { AuthError, AuthRefusal, FieldsError } from "./errors";
import { verifySecondFactor } from "./mfa";
import { verifyPassword } from "./password";
import { markSessionStepUp } from "./session";
import { normalizeTotpInput } from "./totp";
import { requireUserCtx } from "./user-action";
import { getUserById } from "./users";

type StepUp = { until: string };

async function recordStepUp(sessionId: string, userId: string, ip: string | null, method: "totp" | "password"): Promise<StepUp> {
  const at = new Date();
  if (!(await markSessionStepUp(sessionId, at))) throw new AuthError("unauthenticated");
  await audit("auth.step_up", { userId, target: userId, meta: { method }, ip });
  return { until: new Date(at.getTime() + STEP_UP_TTL_MS).toISOString() };
}

/** Runs inside `userAction` (same-origin and the session first); refusals throw and map through the seam's mapping. */
export async function stepUpWithTotp(ctx: UserCtx, code: string): Promise<StepUp> {
  const { user, actor } = ctx;
  const { session } = await requireUserCtx();
  if (!session.hasRow || session.user.id !== user.id) throw new AuthError("unauthenticated");
  if (!(await limits.mfaStepUp(user.id)).ok) throw new SeamError("rate_limited");
  if (!user.totpEnabled) throw new AuthRefusal("invalid", "auth.step_up.totp_off");
  if (typeof code !== "string" || !normalizeTotpInput(code)) throw new FieldsError({ code: "auth.step_up.code_wrong" });
  const result = await verifySecondFactor(user.id, { method: "totp", code });
  if (!result.ok) throw new FieldsError({ code: "auth.step_up.code_wrong" });
  return recordStepUp(user.sessionId, user.id, actor.ip, "totp");
}

/** Runs inside `userAction`; refused under impersonation. */
export async function stepUpWithPassword(ctx: UserCtx, password: string): Promise<StepUp> {
  const { user, actor } = ctx;
  const { session } = await requireUserCtx();
  if (!session.hasRow || session.user.id !== user.id) throw new AuthError("unauthenticated");
  if (session.impersonationId) throw new SeamError("impersonation_read_only");
  if (!(await limits.passwordChange(user.id)).ok) throw new SeamError("rate_limited");
  if (user.totpEnabled) throw new AuthRefusal("totp_required", "auth.step_up.use_totp");
  const row = await getUserById(user.id);
  if (!row || row.disabled) throw new AuthError("unauthenticated");
  const ok = typeof password === "string" && password.length > 0 && password.length <= 1024 && (await verifyPassword(password, row.passwordHash));
  if (!ok) throw new FieldsError({ password: "auth.step_up.password_wrong" });
  return recordStepUp(user.sessionId, user.id, actor.ip, "password");
}
