"use server";
/**
 * The account pages' actions (docs/STORE-SAAS.md §B.9, §F.9; PLA-§22.5): every one is a `userAction` (same-origin
 * first, the session with MFA passed, no store, no gate) and acts on the caller's own account only.
 */
import { redirect } from "next/navigation";
import { changePassword, deleteUserAccount, rotateCurrentSession, userAction } from "@/lib/auth";
import { AuthInputError, FieldsError } from "@/lib/auth/errors";
import { inputErrorKey } from "@/lib/auth/i18n/input-errors";
import { updateOwnProfile, type Profile } from "@/lib/auth/profile";
import { revokeUserSession, revokeUserSessions } from "@/lib/auth/session";
import { requireUserCtx } from "@/lib/auth/user-action";
import { STEP_UP_TTL_MS, SeamError } from "@/lib/tenancy/seam";
import { audit } from "@/lib/audit";
import type { ActionResult } from "@/lib/tenancy/types";

export async function updateProfileAction(input: unknown): Promise<ActionResult<Profile>> {
  return userAction((ctx) => updateOwnProfile(ctx, input));
}

/** Current + new password (policy, scrypt semaphore, `p:password:<userId>`); every other session ends, this one rotates. */
export async function changePasswordAction(input: { current: string; next: string }): Promise<ActionResult<null>> {
  return userAction(async () => {
    try {
      await changePassword(String(input?.current ?? "").slice(0, 1024), String(input?.next ?? "").slice(0, 1024));
    } catch (err) {
      // an input problem → `invalid` with one item on its field ("form" when it names none)
      if (err instanceof AuthInputError) throw new FieldsError({ [err.field ?? "form"]: inputErrorKey(err.message) });
      throw err;
    }
    return null;
  });
}

/** One other device signed out (another user's session id matches nothing). */
export async function revokeSessionAction(sessionId: string): Promise<ActionResult<null>> {
  return userAction(async (ctx) => {
    if (typeof sessionId !== "string" || sessionId === ctx.user.sessionId) return null;
    if (await revokeUserSession(ctx.user.id, sessionId)) await audit("auth.sessions.revoked", { userId: ctx.user.id, target: ctx.user.id, meta: { count: 1 }, ip: ctx.actor.ip });
    return null;
  });
}

/** "Sign out other devices": every session but this one (which rotates, as after any privilege change). */
export async function signOutOthersAction(): Promise<ActionResult<{ count: number }>> {
  return userAction(async (ctx) => {
    const count = await revokeUserSessions(ctx.user.id, { exceptSessionId: ctx.user.sessionId });
    await audit("auth.sessions.revoked", { userId: ctx.user.id, target: ctx.user.id, meta: { count }, ip: ctx.actor.ip });
    if (!ctx.user.sessionId.startsWith("ctx:")) await rotateCurrentSession(ctx.user);
    return { count };
  });
}

/**
 * `/app/account/danger` (PLA Q4.7, §F.9): the typed confirmation word of the page's language, a fresh step-up (the
 * deletion function refuses without one), then `deleteUserAccount(ctx)` (`owns_store`, `is_staff` refusals). Every
 * session ends with the account, so the answer is the sign-in page.
 */
export async function deleteMyAccountAction(input: { confirm: string; expected: string }): Promise<ActionResult<null>> {
  return userAction(async (ctx) => {
    const words = new Set(["delete", "supprimer", "حذف"]);
    const typed = String(input?.confirm ?? "").trim().toLowerCase();
    if (!words.has(typed) || typed !== String(input?.expected ?? "").trim().toLowerCase()) throw new FieldsError({ confirm: "account.danger.word_wrong" });
    // the step-up sheet first (PD80): a fresh TOTP code, or the password for an account without one
    const { session } = await requireUserCtx();
    if (!session.stepUpAt || session.stepUpAt.getTime() + STEP_UP_TTL_MS <= Date.now()) throw new SeamError("step_up");
    await deleteUserAccount(ctx);
    redirect("/login?deleted=1");
  });
}
