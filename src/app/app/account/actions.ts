"use server";
/**
 * The account pages' actions (docs/STORE-SAAS.md §B.9, §F.9; PLA-§22.5): every one is a `userAction` (same-origin
 * first, the session with MFA passed, no store, no gate) and acts on the caller's own account only.
 *
 * P2 step 5 (PLA-§M.1, §L, PD71, PD81): checked against the spec. `updateProfileAction` takes the interface language
 * from the enum only (`ar` / `fr` / `en`; anything else, "zz" included, answers `invalid` on its field) and keeps the
 * public pages' language cookie in step with it. `deleteMyAccountAction` refuses a staff session that is viewing a
 * store (`impersonation_read_only`, audited) before anything else, then the typed word, the step-up ladder (TOTP, or
 * the password for an account without one, fresh for 5 minutes) and T2's `deleteUserAccount` (`owns_store`, `is_staff`).
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { changePassword, deleteUserAccount, rotateCurrentSession, userAction } from "@/lib/auth";
import { AuthInputError, FieldsError } from "@/lib/auth/errors";
import { inputErrorKey } from "@/lib/auth/i18n/input-errors";
import { LOCALE_COOKIE, localeCookieOptions } from "@/lib/auth/locale";
import { updateOwnProfile, type Profile } from "@/lib/auth/profile";
import { revokeUserSession, revokeUserSessions } from "@/lib/auth/session";
import { requireUserCtx } from "@/lib/auth/user-action";
import { STEP_UP_TTL_MS, SeamError } from "@/lib/tenancy/seam";
import { audit } from "@/lib/audit";
import type { ActionResult } from "@/lib/tenancy/types";
import { refuseUserImpersonation } from "@/components/admin/shell/action-guards";

export async function updateProfileAction(input: unknown): Promise<ActionResult<Profile>> {
  return userAction(async (ctx) => {
    const profile = await updateOwnProfile(ctx, input);
    // PD71: the signed-out pages of this browser follow the account's language (`__Host-sgl`, the enum only)
    if (profile.locale) (await cookies()).set(LOCALE_COOKIE, profile.locale, localeCookieOptions());
    return profile;
  });
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

const DeleteInput = z.object({ confirm: z.string().max(40), expected: z.string().max(40) });
const DELETE_WORDS: ReadonlySet<string> = new Set(["delete", "supprimer", "حذف"]);

/**
 * `/app/account/danger` (PLA Q4.7, §F.9): the typed confirmation word of the page's language, a fresh step-up (the
 * deletion function refuses without one), then `deleteUserAccount(ctx)` (`owns_store`, `is_staff` refusals). Every
 * session ends with the account, so the answer is the sign-in page.
 */

export async function deleteMyAccountAction(input: { confirm: string; expected: string }): Promise<ActionResult<null>> {
  return userAction(async (ctx) => {
    // support viewing a store deletes no account on the way (§B.8): refused and audited before anything is read
    const { session } = await requireUserCtx();
    await refuseUserImpersonation(session, ctx.user, "deleteMyAccountAction", ctx.actor.ip);
    const parsed = DeleteInput.safeParse(input);
    const typed = parsed.success ? parsed.data.confirm.trim().toLowerCase() : "";
    if (!parsed.success || !DELETE_WORDS.has(typed) || typed !== parsed.data.expected.trim().toLowerCase()) throw new FieldsError({ confirm: "account.danger.word_wrong" });
    // the step-up sheet first (PD80): a fresh TOTP code, or the password for an account without one
    if (!session.stepUpAt || session.stepUpAt.getTime() + STEP_UP_TTL_MS <= Date.now()) throw new SeamError("step_up");
    await deleteUserAccount(ctx);
    redirect("/login?deleted=1");
  });
}
