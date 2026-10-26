/**
 * Auth public API (docs/STORE-SAAS.md §B, §E.2).
 *
 *   const user = await requireUser();                                      // account pages (/app/account/**, /app/new): no gate
 *   const user = await requireUser({ permission: "pages.write" });          // today's /admin: gate + legacy role (→ /admin/forbidden)
 *   const user = await requireUser({ permission: "orders.write", throwOnFail: true }); // today's /admin action / route handler
 *   export async function saveProfile(input: unknown) { return userAction((ctx) => updateProfile(ctx, input)); }
 *   export async function signup(form: FormData) { return publicAction("signup", (ctx) => signupAccount(read(form), ctx), { … }); }
 *
 * Two generations until the R1.0 integration deletes today's /admin:
 *  - with the legacy `permission` option, or on a request that holds the admin gate, `requireUser` behaves as it always
 *    did: the gate (signed cookie + IP allowlist, 404 like an unknown URL without it) and the legacy role;
 *  - without either it is the §E.2 account guard: a signed-in session with MFA passed and no gate (tenants never hold
 *    it, §B.7), sending the signed-out to `/login` and a pending second factor to `/login/verify`.
 * Store data never comes through here: store pages and actions pass the store seam (src/lib/tenancy/seam.ts).
 */
import "server-only";
import { cache } from "react";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db/client";
import { storeMembers } from "@/lib/db/schema";
import { LEGACY_STORE_ID } from "@/lib/db/store-handles";
import { areaOf } from "@/lib/edge/areas";
import { verifiedRequestPath } from "@/lib/edge/path-sig";
import type { AdminLocale } from "@/lib/i18n/admin";
import { getRequestIdentity } from "@/lib/tenancy/context";
import type { ActionResult, PlatformCtx, UserCtx } from "@/lib/tenancy/types";
import { limits } from "./attempts";
import { clearSessionCookie, readSessionToken, setSessionCookie } from "./cookies";
import { AuthError, AuthInputError } from "./errors";
import { CONSOLE_2FA_ENROL_PATH, FORBIDDEN_PATH, loginUrl, signInUrl, signInVerifyUrl, verifyUrl } from "./paths";
import { legacyCan as can, type Permission, type PlatformRole, type Role } from "./permissions";
import type { PublicActionCtx, PublicActionOpts } from "./public-action";
import { assertAdminAccess, getRequestContext, getRequestedAdminPath, hasAdminAccess } from "./request";
import { deleteSessionByToken, revokeUserSessions, rotateSession, validateSessionToken } from "./session";
import { changeUserPassword } from "./users";

export type { Role, Permission } from "./permissions";
// legacy single-tenant API (`can` = legacyCan) until T2/T4 move the callers; new code imports `can` from ./permissions
export { legacyCan as can, ROLES, PERMISSIONS, ROLE_LABELS, isRole, permissionsFor, homePathFor } from "./permissions";
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
export { checkPasswordPolicy, hashPassword, passwordProblem, withScryptSlot, PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH, type PasswordProblem } from "./password";
export { getTwoFactorStatus, type TwoFactorStatus } from "./mfa";
export { landingPathFor, listMemberships, isUsableMembership, storeHomePath, type MembershipSummary } from "./landing";
export type { BurstName, PublicActionCtx, PublicActionOpts } from "./public-action";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  /** @deprecated the single-tenant role of today's /admin; store roles come from the membership (STORE-SAAS §E.1, removed with today's /admin) */
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

/** Today's /admin: the same state behind the gate. Cached per request. */
const resolveAuthState = cache(async (): Promise<AuthState> => {
  if (!(await hasAdminAccess())) return { user: null, pending: null };
  return resolveSessionState();
});

/** Returns the current /admin user or null (no redirect; needs the gate). Cached per request. */
export async function getSessionUser(): Promise<SessionUser | null> {
  return (await resolveAuthState()).user;
}

/** The signed-in user of the platform host or null, gate or not (`/app`, the public auth pages). Cached per request. */
export async function getSignedInUser(): Promise<SessionUser | null> {
  return (await resolveSessionState()).user;
}

/** The half-finished sign-in waiting for its second factor, if any (the cookie decides; the caller checks its area). */
export async function getPendingMfa(): Promise<PendingMfa | null> {
  return (await resolveSessionState()).pending;
}

/**
 * Account pages (no permission, no gate): redirect to `/login` (or `/login/verify`) when signed out, `throwOnFail` for an
 * AuthError instead. Today's /admin (a `permission`, or the gate on the request): the gate, the legacy role and the
 * /admin sign-in pages, exactly as before.
 */
export async function requireUser(opts: { permission?: Permission; throwOnFail?: boolean } = {}): Promise<SessionUser> {
  const identity = getRequestIdentity();
  if (identity) return requireIdentityUser(opts);
  if (opts.permission || (await hasAdminAccess())) return requireGatedUser(opts);
  const { user, pending } = await resolveSessionState();
  if (user) return user;
  if (opts.throwOnFail) throw new AuthError(pending ? "mfa_required" : "unauthenticated");
  const back = verifiedRequestPath(await headers());
  redirect(pending ? signInVerifyUrl(back) : signInUrl(back));
}

/** An active membership of the legacy store (TENANCY-MAP §2.4: today's /admin users got one in 0004). Cached per request. */
const hasLegacyMembership = cache(async (userId: string): Promise<boolean> => {
  const [row] = await db
    .select({ userId: storeMembers.userId })
    .from(storeMembers)
    .where(and(eq(storeMembers.storeId, LEGACY_STORE_ID), eq(storeMembers.userId, userId), eq(storeMembers.status, "active"))) // tenancy: platform today's /admin entry check (review r1.0-t2 F2)
    .limit(1);
  return !!row;
});

/**
 * Who may use today's /admin until T4 deletes it (review r1.0-t2 F2, §B.7): its queries are unscoped, so the gate
 * and the legacy `users.role` are not enough (every new account carries the column default `editor`). An active
 * member of the legacy store passes as before; staff without that membership pass only with TOTP on; any other
 * account is refused. `null` = allowed; `enrol` = staff who must turn on 2FA first; `refused` = a plain 404.
 */
export async function legacyAdminRefusal(user: Pick<SessionUser, "id" | "platformRole" | "totpEnabled">): Promise<null | "enrol" | "refused"> {
  if (await hasLegacyMembership(user.id)) return null;
  if (user.platformRole !== "none") return user.totpEnabled ? null : "enrol";
  return "refused";
}

/**
 * true when the proxy-signed request path (`x-sg-path`, §C.3 step 2) is in the console area (`/admin/**`,
 * `/api/admin/**`); an unsigned or forged path is not (CCR r1.0-t3-1 replaced the `x-cs-pathname` stamp).
 */
function inConsoleArea(h: Headers): boolean {
  const path = verifiedRequestPath(h);
  if (path === null) return false;
  const area = areaOf(path.split("?")[0] ?? "/");
  return area === "console" || area === "console-api";
}

/** The legacy-admin entry check for one request: only inside the admin area (the signed request path says so). */
async function assertLegacyAdmin(user: SessionUser, opts: { throwOnFail?: boolean }, inAdminArea: boolean): Promise<void> {
  if (!inAdminArea) return;
  const refusal = await legacyAdminRefusal(user);
  if (!refusal) return;
  if (opts.throwOnFail) throw new AuthError("forbidden");
  if (refusal === "enrol") redirect(CONSOLE_2FA_ENROL_PATH);
  notFound();
}

/** Today's /admin guard: the gate (404 without it), the session, the legacy-admin entry check, the legacy role. */
async function requireGatedUser(opts: { permission?: Permission; throwOnFail?: boolean }): Promise<SessionUser> {
  await assertAdminAccess();
  const { user, pending } = await resolveAuthState();

  if (!user) {
    if (opts.throwOnFail) throw new AuthError(pending ? "mfa_required" : "unauthenticated");
    const back = await getRequestedAdminPath();
    redirect(pending ? verifyUrl(back) : loginUrl(back));
  }

  // the gate cookie also rides along on /app requests (account pages): the entry check is for the admin area only
  await assertLegacyAdmin(user, opts, opts.permission !== undefined || inConsoleArea(await headers()));

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
    redirect(err.code === "mfa_required" ? signInVerifyUrl(null) : signInUrl(null));
  }
  // the legacy permission option means today's /admin: the same entry check as requireGatedUser
  await assertLegacyAdmin(user, opts, opts.permission !== undefined);
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
