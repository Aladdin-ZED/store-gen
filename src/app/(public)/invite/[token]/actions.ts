"use server";
/**
 * `/invite/<token>` (docs/STORE-SAAS.md §B.5): accept a store invitation, as the signed-in invitee or with a new
 * account whose e-mail is the invited one (D10; the form never sends it). Through
 * `publicAction("invite:accept")` (same-origin, the burst floor, `p:invite:accept:ip` 10 / 15 min, the human check
 * when the platform widget exists). A new account gets its session here (with the legal acceptance checked when the
 * platform requires it). The answer is the joined state (the store's name and where it opens: agents on their queue);
 * the page shows it once and moves on, so a double tap on Join never lands on "no longer valid" (PLA-§22.1.4).
 */
import { redirect } from "next/navigation";
import { getSignedInUser, publicAction, signOut } from "@/lib/auth";
import { platformSetting } from "@/lib/auth/platform-config";
import { setSessionCookie } from "@/lib/auth/cookies";
import { storeHomePath } from "@/lib/auth/landing";
import { createSession, setSessionLastStore } from "@/lib/auth/session";
import { isAdminLocale } from "@/lib/i18n/admin";
import { acceptInvite } from "@/lib/tenancy/invites";
import { resolveStoreByHandle } from "@/lib/tenancy/public";
import { assertActionOrigin } from "@/lib/tenancy/seam";
import type { ActionResult } from "@/lib/tenancy/types";
import { field, formError, type FormState } from "../../_lib/form-state";

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export type InviteState = FormState | { status: "joined"; storeName: string; href: string };

export async function acceptInviteAction(data: FormData): Promise<ActionResult<InviteState>> {
  return publicAction(
    "invite:accept",
    async (ctx): Promise<InviteState> => {
      const token = field(data, "token", 64);
      if (!TOKEN_RE.test(token)) return formError("team.invite.invalid");
      const locale = field(data, "locale", 4);
      const viewer = await getSignedInUser();
      if (!viewer && (await platformSetting()).legal.requireAcceptance && field(data, "acceptLegal", 8) !== "on") {
        return formError(undefined, { acceptLegal: "auth.signup.legal_required" }, { name: field(data, "name", 200), phone: field(data, "phone", 64) });
      }
      const accepted = viewer
        ? await acceptInvite(token, { userId: viewer.id })
        : await acceptInvite(token, {
            email: "",
            name: field(data, "name", 200),
            password: field(data, "password", 1024),
            phone: field(data, "phone", 64) || undefined,
            locale: isAdminLocale(locale) ? locale : "fr",
          });
      const store = await resolveStoreByHandle(accepted.storeHandle);
      if (viewer) {
        if (store && !viewer.sessionId.startsWith("ctx:")) await setSessionLastStore(viewer.sessionId, store.id);
      } else {
        const session = await createSession(accepted.userId, { mfaPassed: true, ip: ctx.ip, ua: ctx.ua, lastStoreId: store?.id ?? null });
        await setSessionCookie(session.token, session.cookieExpiresAt);
      }
      return { status: "joined", storeName: store?.name ?? accepted.storeHandle, href: storeHomePath({ handle: accepted.storeHandle, role: accepted.role }) };
    },
    { turnstile: "when-configured", burst: "invite", token: field(data, "cf-turnstile-response", 2048) || null },
  );
}

/** "Not you?": signs this browser out and reopens the same invitation (the e-mail binding is D10's). */
export async function switchAccountAction(data: FormData): Promise<void> {
  await assertActionOrigin();
  const token = field(data, "token", 64);
  await signOut();
  redirect(TOKEN_RE.test(token) ? `/invite/${token}` : "/login");
}
