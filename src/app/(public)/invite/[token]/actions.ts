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
import { field, fieldErrorsOf, formError, type FormState } from "../../_lib/form-state";

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export async function acceptInviteAction(_prev: FormState, data: FormData): Promise<FormState> {
  const token = field(data, "token", 64);
  if (!TOKEN_RE.test(token)) return formError("team.invite.invalid");
  const values = { name: field(data, "name", 200), phone: field(data, "phone", 64) };
  const locale = field(data, "locale", 4);
  const viewer = await getSignedInUser();

  const r = await publicAction(
    "invite:accept",
    async (ctx) => {
      const accepted = viewer
        ? await acceptInvite(token, { userId: viewer.id })
        : await acceptInvite(token, {
            email: "",
            name: values.name,
            password: field(data, "password", 1024),
            phone: values.phone || undefined,
            locale: isAdminLocale(locale) ? locale : "fr",
          });
      return { accepted, ctx: { ip: ctx.ip, ua: ctx.ua } };
    },
    { turnstile: "when-configured", burst: "invite", token: field(data, "cf-turnstile-response", 2048) || null },
  );
  if (!r.ok) {
    if (r.error === "invalid" && r.items?.length) return formError(undefined, fieldErrorsOf(r.items), values);
    return formError(r.message ?? (r.error === "rate_limited" ? "error.rate_limited" : r.error === "busy" ? "error.busy" : r.error === "challenge" ? "auth.challenge" : "error.server"), undefined, values, {
      challenge: r.error === "challenge",
    });
  }

  const { accepted, ctx } = r.data;
  const store = await resolveStoreByHandle(accepted.storeHandle);
  if (viewer) {
    if (store && !viewer.sessionId.startsWith("ctx:")) await setSessionLastStore(viewer.sessionId, store.id);
  } else {
    const session = await createSession(accepted.userId, { mfaPassed: true, ip: ctx.ip, ua: ctx.ua, lastStoreId: store?.id ?? null });
    await setSessionCookie(session.token, session.cookieExpiresAt);
  }
  redirect(storeHomePath({ handle: accepted.storeHandle, role: accepted.role }));
}

/** "Not you?": signs this browser out and reopens the same invitation (the e-mail binding is D10's). */
export async function switchAccountAction(data: FormData): Promise<void> {
  await assertActionOrigin();
  const token = field(data, "token", 64);
  await signOut();
  redirect(TOKEN_RE.test(token) ? `/invite/${token}` : "/login");
}
