"use server";
/**
 * `/invite/<token>` (docs/STORE-SAAS.md §B.5): accept a store invitation, as the signed-in invitee or with a new
 * account whose e-mail is the invited one (D10; the form never sends it). Through
 * `publicAction("invite:accept")` (same-origin, the burst floor, `p:invite:accept:ip` 10 / 15 min, the human check
 * when the platform widget exists). A new account gets its session here; everyone lands on their store (agents on
 * their queue).
 */
import { redirect } from "next/navigation";
import { getSignedInUser, publicAction, signOut } from "@/lib/auth";
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

export async function acceptInviteAction(data: FormData): Promise<ActionResult<FormState>> {
  return publicAction(
    "invite:accept",
    async (ctx) => {
      const token = field(data, "token", 64);
      if (!TOKEN_RE.test(token)) return formError("team.invite.invalid");
      const locale = field(data, "locale", 4);
      const viewer = await getSignedInUser();
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
      redirect(storeHomePath({ handle: accepted.storeHandle, role: accepted.role }));
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
