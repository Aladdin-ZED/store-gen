"use server";
/**
 * `/invite/staff/<token>` (P1 CONSOLE; platform.md PLA-§14.1, §Q.12; docs/STORE-SAAS.md §B.5 rev 3, SEC-20): accept
 * a staff invitation, as the signed-in account whose e-mail is the invited one, or with a new account (name and
 * password; the e-mail is the invite's, the form never sends it). Through `publicAction("invite:accept")`
 * (same-origin, the burst floor, `p:invite:accept:ip` 10 / 15 min, the human check when the platform widget exists).
 *
 *   await acceptStaffInviteAction({ token, name, password, locale: "fr", turnstile });   // → redirect
 *
 * src/lib/platform/staff.ts consumes the invite with one conditional UPDATE, sets the platform role and records the
 * acceptance of the published ToS, Privacy and AUP in one transaction. A new account gets its session here; everyone
 * lands on the console, or on the two-step setup first (staff need TOTP before any /admin page, §B.7).
 */
import { redirect } from "next/navigation";
import { getSignedInUser, publicAction } from "@/lib/auth";
import { describeUserAgent } from "@/lib/admin-data/security";
import { AuthRefusal } from "@/lib/auth/errors";
import { setSessionCookie } from "@/lib/auth/cookies";
import { createSession } from "@/lib/auth/session";
import { isAdminLocale } from "@/lib/i18n/admin";
import { STAFF_INVITE_INVALID, acceptStaffInvite } from "@/lib/platform/staff";
import { hashIp } from "@/lib/security/crypto";
import type { ActionResult } from "@/lib/tenancy/types";

const TOKEN_RE = /^[A-Za-z0-9_-]{32,64}$/;

export interface AcceptStaffInviteInput {
  token: string;
  /** a new account only */
  name?: string;
  password?: string;
  locale?: string;
  /** the widget's `cf-turnstile-response` */
  turnstile?: string | null;
}

const str = (v: unknown, max: number): string => (typeof v === "string" ? v.slice(0, max) : "");

/** Accepts the invite and redirects to the console (or the two-step setup); refusals answer `invalid` / `forbidden` with their key. */
export async function acceptStaffInviteAction(input: AcceptStaffInviteInput): Promise<ActionResult<never>> {
  return publicAction(
    "invite:accept",
    async (ctx) => {
      const token = str(input?.token, 80);
      if (!TOKEN_RE.test(token)) throw new AuthRefusal("invalid", STAFF_INVITE_INVALID);
      const meta = { ipHash: ctx.ip ? hashIp(ctx.ip) : null, uaLabel: describeUserAgent(ctx.ua) };
      const viewer = await getSignedInUser();
      const locale = str(input?.locale, 4);
      const accepted = viewer
        ? await acceptStaffInvite(token, { userId: viewer.id }, meta)
        : await acceptStaffInvite(token, { name: str(input?.name, 200), password: str(input?.password, 1_024), locale: isAdminLocale(locale) ? locale : "fr" }, meta);
      if (!viewer) {
        const session = await createSession(accepted.userId, { mfaPassed: true, ip: ctx.ip, ua: ctx.ua });
        await setSessionCookie(session.token, session.cookieExpiresAt);
      }
      redirect(accepted.next);
    },
    { turnstile: "when-configured", burst: "invite", token: str(input?.turnstile, 2_048) || null },
  );
}
