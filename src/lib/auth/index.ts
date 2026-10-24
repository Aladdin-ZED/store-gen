/**
 * Auth public API. Every admin page, server action and admin route handler MUST call requireUser().
 *
 *   const user = await requireUser();                                      // page: redirects when signed out
 *   const user = await requireUser({ permission: "pages.write" });          // page: + permission (→ /admin/forbidden)
 *   const user = await requireUser({ permission: "orders.write", throwOnFail: true }); // action / route handler
 *
 * requireUser() also re-verifies the admin gate (signed cookie + IP allowlist) and answers 404
 * like an unknown URL when it is missing, so admin code never runs for un-gated visitors.
 */
import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { clearSessionCookie, readSessionToken, setSessionCookie } from "./cookies";
import { AuthError, AuthInputError } from "./errors";
import { limits } from "./attempts";
import { FORBIDDEN_PATH, loginUrl, verifyUrl } from "./paths";
import { legacyCan as can, type Permission, type PlatformRole, type Role } from "./permissions";
import { assertAdminAccess, getRequestContext, getRequestedAdminPath, hasAdminAccess } from "./request";
import { deleteSessionByToken, revokeUserSessions, rotateSession, validateSessionToken } from "./session";
import { changeUserPassword } from "./users";
import type { AdminLocale } from "@/lib/i18n/admin";
import { getRequestIdentity } from "@/lib/tenancy/context";
import type { BurstScope } from "@/lib/security/burst-limit";
import type { ActionResult, PlatformCtx, UserCtx } from "@/lib/tenancy/types";

export type { Role, Permission } from "./permissions";
// legacy single-tenant API (`can` = legacyCan) until T2/T4 move the callers; new code imports `can` from ./permissions
export { legacyCan as can, ROLES, PERMISSIONS, ROLE_LABELS, isRole, permissionsFor, homePathFor } from "./permissions";
export { AuthError, AuthInputError, type AuthErrorCode } from "./errors";
export {
  ADMIN_HOME_PATH,
  LOGIN_PATH,
  VERIFY_PATH,
  SETUP_PATH,
  TWO_FACTOR_PATH,
  FORBIDDEN_PATH,
  SECURITY_SETTINGS_PATH,
  TWO_FACTOR_OFF_NOTICE,
  safeAdminPath,
  loginUrl,
} from "./paths";
export { assertAdminAccess, hasAdminAccess, getCspNonce, getRequestContext, type RequestContext } from "./request";
export { revokeUserSessions, purgeExpiredSessions } from "./session";
export {
  banUser,
  unbanUser,
  createPasswordResetLink,
  createAccount,
  createUser,
  listUsers,
  countUsers,
  getUserById,
  normalizeEmail,
  resetUserPassword,
  resetUserTwoFactor,
  setUserRole,
  setUserDisabled,
  type UserSummary,
  type NewUserInput,
} from "./users";
export { checkPasswordPolicy, hashPassword, PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH } from "./password";
export { getTwoFactorStatus, type TwoFactorStatus } from "./mfa";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  /** @deprecated the single-tenant role of today's /admin; store roles come from the membership (STORE-SAAS §E.1, removed by T2) */
  role: Role;
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

const resolveAuthState = cache(async (): Promise<AuthState> => {
  if (!(await hasAdminAccess())) return { user: null, pending: null };
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
  return {
    user: { ...session.user, sessionId: session.id, lastStoreId: session.lastStoreId },
    pending: null,
  };
});

/** Returns the current user or null (no redirect). Cached per request. */
export async function getSessionUser(): Promise<SessionUser | null> {
  return (await resolveAuthState()).user;
}

/** The half-finished sign-in waiting for its second factor, if any. Cached per request. */
export async function getPendingMfa(): Promise<PendingMfa | null> {
  return (await resolveAuthState()).pending;
}

/**
 * Pages: redirects to /admin/login (or the 2FA step) when unauthenticated, to /admin/forbidden
 * when the permission is missing. Actions/route handlers: pass { throwOnFail: true } to get an
 * AuthError instead of a redirect.
 */
export async function requireUser(opts: { permission?: Permission; throwOnFail?: boolean } = {}): Promise<SessionUser> {
  const identity = getRequestIdentity();
  if (identity) return requireIdentityUser(opts);
  await assertAdminAccess();
  const { user, pending } = await resolveAuthState();

  if (!user) {
    if (opts.throwOnFail) throw new AuthError(pending ? "mfa_required" : "unauthenticated");
    const back = await getRequestedAdminPath();
    redirect(pending ? verifyUrl(back) : loginUrl(back));
  }

  if (opts.permission && !can(user.role, opts.permission)) {
    if (opts.throwOnFail) throw new AuthError("forbidden");
    redirect(FORBIDDEN_PATH);
  }
  return user;
}

/**
 * requireUser inside runAsIdentity (tests, docs/STORE-SAAS.md §E.4): the identity stands for the session and the
 * request, so there is no gate cookie to check; the legacy permission option keeps its meaning.
 */
async function requireIdentityUser(opts: { permission?: Permission; throwOnFail?: boolean }): Promise<SessionUser> {
  // dynamic: the seam imports admin-data/action, which imports this module
  const { requireSessionUser } = await import("@/lib/tenancy/seam");
  let user: SessionUser;
  try {
    user = await requireSessionUser();
  } catch (err) {
    if (opts.throwOnFail || !(err instanceof AuthError)) throw err;
    redirect(err.code === "mfa_required" ? verifyUrl(null) : loginUrl(null));
  }
  if (opts.permission && !can(user.role, opts.permission)) {
    if (opts.throwOnFail) throw new AuthError("forbidden");
    redirect(FORBIDDEN_PATH);
  }
  return user;
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
    const revoked = await revokeUserSessions(user.id, { exceptId: fresh.id });
    if (revoked > 0) await audit("auth.sessions.revoked", { userId: user.id, target: user.id, meta: { count: revoked }, ip: ctx.ip });
  }
  return { ...user, sessionId: fresh.id };
}

/** Signs out every other device of the current user. Returns how many sessions ended. */
export async function revokeOtherSessions(): Promise<number> {
  const user = await requireUser({ throwOnFail: true });
  const revoked = await revokeUserSessions(user.id, { exceptId: user.sessionId });
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
/* §E.2 user and public entry points (T2; C0a typed stubs)             */
/* ------------------------------------------------------------------ */

/** The in-memory burst limiter's names (src/lib/security/burst-limit.ts) a public form passes. */
export type BurstName = BurstScope;

function notImplemented(fn: string, ...args: unknown[]): never {
  void args;
  throw new Error(`not implemented: T2 (${fn})`);
}

/** Account pages (/app/account/**): the session only, no store, no permission; same-origin first and the §E.2 error mapping. */
export async function userAction<T>(fn: (ctx: UserCtx) => Promise<T>): Promise<ActionResult<T>> {
  return notImplemented("userAction", fn);
}

/** §B.7: a TOTP code refreshes `sessions.step_up_at` (bucket p:mfa:stepup:<userId> 5 / 15 min); the console's step-up sheet. */
export async function stepUpAction(code: string): Promise<ActionResult<{ until: string }>> {
  return notImplemented("stepUpAction", code);
}

/** rev 4 (PLA Q4.8, §B.7): the tenant step-up without TOTP (bucket p:password:<userId>, the scrypt semaphore); refused under impersonation. */
export async function stepUpWithPasswordAction(password: string): Promise<ActionResult<{ until: string }>> {
  return notImplemented("stepUpWithPasswordAction", password);
}

/**
 * rev 4 (PLA Q4.7, §F.9): self-service (UserCtx, no target) or staff (PlatformCtx + `users.manage` ↑ + target);
 * refuses `owns_store` (the user owns a non-purged store) and `is_staff`.
 */
export async function deleteUserAccount(ctx: UserCtx | PlatformCtx, target?: { userId: string; reason: string }): Promise<void> {
  return notImplemented("deleteUserAccount", ctx, target);
}

/** Public forms (/signup, /invite, /reset, /report): Turnstile, the burst limit, the DB buckets, generic answers. */
export async function publicAction<T>(
  name: string,
  fn: (ctx: { ip: string; ua: string }) => Promise<T>,
  opts: { turnstile: "required" | "when-configured" | "challenge"; burst: BurstName },
): Promise<ActionResult<T>> {
  return notImplemented("publicAction", name, fn, opts);
}
