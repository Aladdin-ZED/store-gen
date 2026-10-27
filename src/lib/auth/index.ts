/**
 * Auth public API (docs/STORE-SAAS.md §B, §E.2).
 *
 *   const user = await requireUser();                                      // account pages (/app/account/**, /app/new)
 *   const user = await requireUser({ throwOnFail: true });                 // an account action / route handler
 *   export async function saveProfile(input: unknown) { return userAction((ctx) => updateProfile(ctx, input)); }
 *   export async function signup(form: FormData) { return publicAction("signup", (ctx) => signupAccount(read(form), ctx), { … }); }
 *
 * `requireUser` is the §E.2 account guard: a signed-in session with MFA passed, sending the signed-out to `/login`
 * and a pending second factor to `/login/verify`; on a request that holds the console gate it re-checks the gate and
 * uses the console's sign-in pages instead (the console's first-run pages, `/admin/setup/store`). The platform role
 * is never checked here: console pages and actions pass the platform seam (`requirePlatform`, `platformAction`).
 * Store data never comes through here: store pages and actions pass the store seam (src/lib/tenancy/seam.ts).
 */
import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { verifiedRequestPath } from "@/lib/edge/path-sig";
import type { AdminLocale } from "@/lib/i18n/admin";
import { getRequestIdentity } from "@/lib/tenancy/context";
import type { ActionResult, PlatformCtx, UserCtx } from "@/lib/tenancy/types";
import { limits } from "./attempts";
import { clearSessionCookie, readSessionToken, setSessionCookie } from "./cookies";
import { AuthError, AuthInputError } from "./errors";
import { loginUrl, signInUrl, signInVerifyUrl, verifyUrl } from "./paths";
import type { PlatformRole } from "./permissions";
import type { PublicActionCtx, PublicActionOpts } from "./public-action";
import { assertAdminAccess, getRequestContext, getRequestedAdminPath, hasAdminAccess } from "./request";
import { deleteSessionByToken, revokeUserSessions, rotateSession, validateSessionToken } from "./session";
import { changeUserPassword } from "./users";

export { AuthBusyError, AuthError, AuthInputError, AuthRefusal, FieldsError, type AuthErrorCode } from "./errors";
export {
  ADMIN_HOME_PATH,
  LOGIN_PATH,
  VERIFY_PATH,
  SETUP_PATH,
  TWO_FACTOR_PATH,
  FORBIDDEN_PATH,
  SECURITY_SETTINGS_PATH,
  TWO_FACTOR_OFF_NOTICE,
  SIGN_IN_PATH,
  SIGN_IN_VERIFY_PATH,
  SIGNUP_PATH,
  APP_HOME_PATH,
  NEW_STORE_PATH,
  ACCOUNT_PATH,
  safeAdminPath,
  safeAppPath,
  loginUrl,
  signInUrl,
  signInVerifyUrl,
} from "./paths";
export { assertAdminAccess, hasAdminAccess, getCspNonce, getRequestContext, type RequestContext } from "./request";
export { revokeUserSessions, purgeExpiredSessions } from "./session";
export {
  banUser,
  unbanUser,
  createPasswordResetLink,
  createAccount,
  getUserById,
  normalizeEmail,
  resetUserTwoFactor,
} from "./users";
export { checkPasswordPolicy, hashPassword, passwordProblem, withScryptSlot, PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH, type PasswordProblem } from "./password";
export { getTwoFactorStatus, type TwoFactorStatus } from "./mfa";
export { landingPathFor, listMemberships, isUsableMembership, storeHomePath, type MembershipSummary } from "./landing";
export type { BurstName, PublicActionCtx, PublicActionOpts } from "./public-action";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  totpEnabled: boolean;
  sessionId: string;
  /** staff role of the console (§A.3.3); "none" for every seller */
  platformRole: PlatformRole | "none";
  /** admin UI locale (§I.5); null = the browser's */
  locale: AdminLocale | null;
  /** the store this session last opened: a store-picker hint, never an authorisation (§B.4) */
  lastStoreId: string | null;
}

/** A signed-in user who still owes the second factor. */
export interface PendingMfa {
  sessionId: string;
  userId: string;
  email: string;
  name: string;
}

interface AuthState {
  user: SessionUser | null;
  pending: PendingMfa | null;
}

/** The session cookie's state, without the gate. Cached per request. */
const resolveSessionState = cache(async (): Promise<AuthState> => {
  const session = await validateSessionToken(await readSessionToken());
  if (!session) return { user: null, pending: null };
  if (session.user.totpEnabled && !session.mfaPassed) {
    return {
      user: null,
      pending: { sessionId: session.id, userId: session.userId, email: session.user.email, name: session.user.name },
    };
  }
  if (!session.mfaPassed) {
    // 2FA was turned off while this login was half-way: make the user start over.
    return { user: null, pending: null };
  }
  return { user: { ...session.user, sessionId: session.id, lastStoreId: session.lastStoreId }, pending: null };
});

/** The same state behind the console gate (none without it). Cached per request. */
const resolveAuthState = cache(async (): Promise<AuthState> => {
  if (!(await hasAdminAccess())) return { user: null, pending: null };
  return resolveSessionState();
});

/** The signed-in user of the platform host or null, gate or not (`/app`, the public auth pages). Cached per request. */
export async function getSignedInUser(): Promise<SessionUser | null> {
  return (await resolveSessionState()).user;
}

/** The half-finished sign-in waiting for its second factor, if any (the cookie decides; the caller checks its area). */
export async function getPendingMfa(): Promise<PendingMfa | null> {
  return (await resolveSessionState()).pending;
}

/**
 * Account pages: redirect to `/login` (or `/login/verify`) when signed out, `throwOnFail` for an AuthError instead.
 * With the console gate on the request: the gate re-checked and the console's sign-in pages (§B.7).
 */
export async function requireUser(opts: { throwOnFail?: boolean } = {}): Promise<SessionUser> {
  const identity = getRequestIdentity();
  if (identity) return requireIdentityUser(opts);
  if (await hasAdminAccess()) return requireGatedUser(opts);
  const { user, pending } = await resolveSessionState();
  if (user) return user;
  if (opts.throwOnFail) throw new AuthError(pending ? "mfa_required" : "unauthenticated");
  const back = verifiedRequestPath(await headers());
  redirect(pending ? signInVerifyUrl(back) : signInUrl(back));
}

/** The gate (404 without it) and the session, sending the signed-out to the console's sign-in pages. */
async function requireGatedUser(opts: { throwOnFail?: boolean }): Promise<SessionUser> {
  await assertAdminAccess();
  const { user, pending } = await resolveAuthState();
  if (user) return user;
  if (opts.throwOnFail) throw new AuthError(pending ? "mfa_required" : "unauthenticated");
  const back = await getRequestedAdminPath();
  redirect(pending ? verifyUrl(back) : loginUrl(back));
}

/** requireUser inside runAsIdentity (tests, docs/STORE-SAAS.md §E.4): the identity stands for the session and the request. */
async function requireIdentityUser(opts: { throwOnFail?: boolean }): Promise<SessionUser> {
  // dynamic: the seam imports this module
  const { requireSessionUser } = await import("@/lib/tenancy/seam");
  try {
    return await requireSessionUser();
  } catch (err) {
    if (opts.throwOnFail || !(err instanceof AuthError)) throw err;
    redirect(err.code === "mfa_required" ? signInVerifyUrl(null) : signInUrl(null));
  }
}

/** Ends the current session (server action / route handler only). Safe to call when signed out. */
export async function signOut(): Promise<void> {
  const token = await readSessionToken();
  const session = await validateSessionToken(token);
  await deleteSessionByToken(token);
  await clearSessionCookie();
  if (session) {
    const { ip } = await getRequestContext();
    await audit("auth.logout", { userId: session.userId, target: session.userId, ip });
  }
}

/**
 * Issues a fresh session token for the current user after a privilege change (2FA on/off,
 * password change) and sets the cookie. Server actions only.
 */
export async function rotateCurrentSession(user: SessionUser, opts: { revokeOthers?: boolean } = {}): Promise<SessionUser> {
  const ctx = await getRequestContext();
  const fresh = await rotateSession({ id: user.sessionId, userId: user.id }, { mfaPassed: true, ...ctx });
  await setSessionCookie(fresh.token, fresh.cookieExpiresAt);
  if (opts.revokeOthers) {
    const revoked = await revokeUserSessions(user.id, { exceptSessionId: fresh.id });
    if (revoked > 0) await audit("auth.sessions.revoked", { userId: user.id, target: user.id, meta: { count: revoked }, ip: ctx.ip });
  }
  return { ...user, sessionId: fresh.id };
}

/** Signs out every other device of the current user. Returns how many sessions ended. */
export async function revokeOtherSessions(): Promise<number> {
  const user = await requireUser({ throwOnFail: true });
  const revoked = await revokeUserSessions(user.id, { exceptSessionId: user.sessionId });
  const { ip } = await getRequestContext();
  await audit("auth.sessions.revoked", { userId: user.id, target: user.id, meta: { count: revoked }, ip });
  return revoked;
}

/**
 * Self-service password change for the current user (server actions). Ends all other sessions and
 * rotates the current one. Throws AuthInputError with a user-facing message on failure.
 */
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const user = await requireUser({ throwOnFail: true });
  const ctx = await getRequestContext();
  const rl = await limits.passwordChange(user.id);
  if (!rl.ok) throw new AuthInputError("Too many attempts. Wait a few minutes and try again.");
  await changeUserPassword(user.id, currentPassword, newPassword, { keepSessionId: user.sessionId, ip: ctx.ip });
  await rotateCurrentSession(user);
}

/* ------------------------------------------------------------------ */
/* §E.2 user and public entry points                                   */
/* ------------------------------------------------------------------ */
/* Their bodies live in their own modules, loaded on first use: they import the store seam, which imports        */
/* admin-data/action, which imports this module (the same reason requireIdentityUser loads the seam lazily).     */

/** Account pages (/app/account/**, /app/new): same-origin first, the session only (no store, no permission, no gate), the §E.2 error mapping. */
export async function userAction<T>(fn: (ctx: UserCtx) => Promise<T>): Promise<ActionResult<T>> {
  const { runUserAction } = await import("./user-action");
  return runUserAction(fn);
}

/** §B.7: a TOTP code refreshes `sessions.step_up_at` (bucket p:mfa:stepup:<userId> 5 / 15 min); the console's and the tenant's step-up sheet. */
export async function stepUpAction(code: string): Promise<ActionResult<{ until: string }>> {
  return userAction(async (ctx) => (await import("./step-up")).stepUpWithTotp(ctx, code));
}

/** rev 4 (PLA Q4.8, §B.7): the tenant step-up without TOTP (bucket p:password:<userId>, the scrypt semaphore); refused under impersonation. */
export async function stepUpWithPasswordAction(password: string): Promise<ActionResult<{ until: string }>> {
  return userAction(async (ctx) => (await import("./step-up")).stepUpWithPassword(ctx, password));
}

/**
 * rev 4 (PLA Q4.7, §F.9): self-service (UserCtx, no target) or staff (PlatformCtx + `users.manage` ↑ + target);
 * refuses `owns_store` (the user owns a non-purged store) and `is_staff`.
 */
export async function deleteUserAccount(ctx: UserCtx | PlatformCtx, target?: { userId: string; reason: string }): Promise<void> {
  const { deleteAccount } = await import("./account-deletion");
  return deleteAccount(ctx, target);
}

/** Public forms (/signup, /invite, /reset, /report, /login): same-origin, the burst limit, the DB bucket, Turnstile, generic answers. */
export async function publicAction<T>(name: string, fn: (ctx: PublicActionCtx) => Promise<T>, opts: PublicActionOpts): Promise<ActionResult<T>> {
  const run = await import("./public-action");
  return run.publicAction(name, fn, opts);
}
