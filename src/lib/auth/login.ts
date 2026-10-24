/**
 * Sign-in flows: password step and second-factor step (docs/STORE-SAAS.md §B.3).
 *
 * Buckets (all `p:`): the IP (10 / 15 min, every outcome), the account from this network (5 / 15 min: past it the
 * answer is "too many attempts" for this network only) and the account from everywhere (20 / 15 min, a challenge
 * threshold that never refuses, SEC-22). Past 3 failures in either account bucket the form needs a Turnstile token
 * (`{ error: "challenge" }` → the platform widget renders), when the widget is configured; the challenge answer
 * consumes no account budget. No hard account lock: `users.failed_logins` / `locked_until` are no longer read or
 * written (dropped in 0006).
 *
 * Anti-enumeration: one generic "invalid" for unknown e-mail, wrong password and banned account; unknown e-mails
 * burn a full scrypt verification inside the semaphore and consume the same account buckets.
 */
import "server-only";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db/client";
import { sessions, users } from "@/lib/db/schema";
import { buckets, clearBucket, limits, loginAccountLimits, refundBuckets } from "./attempts";
import { LOGIN_CHALLENGE_AFTER } from "./config";
import { AuthBusyError } from "./errors";
import { recordLoginLinks } from "./identity";
import { listMemberships, type MembershipSummary } from "./landing";
import { verifySecondFactor, type SecondFactorInput } from "./mfa";
import { burnPasswordCheck, hashPassword, needsRehash, verifyPassword } from "./password";
import type { PlatformRole } from "./permissions";
import { platformTurnstileKeys } from "./platform-config";
import { createSession, deleteSession, rotateSession, type IssuedSession } from "./session";
import { checkPlatformTurnstile } from "./turnstile";
import { getUserByEmail, getUserById, normalizeEmail } from "./users";

export interface ClientContext {
  ip: string;
  ua: string;
  /** the `__Host-sgd` device marker, when the browser has one (identity links, PLA Q.3) */
  deviceId?: string | null;
}

/** Who signed in and where they may go (the action redirects to a safe `next` or to `landingPathFor()`). */
export interface SignedIn {
  session: IssuedSession;
  userId: string;
  memberships: MembershipSummary[];
  platformRole: PlatformRole | "none";
  /** the store this account opened last (the picker hint of its newest session) */
  lastStoreId: string | null;
}

export type PasswordLoginResult =
  | ({ ok: true; mfaRequired: boolean } & SignedIn)
  | { ok: false; error: "invalid" | "rate_limited" | "challenge" | "busy"; retryAfter?: number };

/** The newest store-picker hint of the user's sessions, so a fresh sign-in reopens the last store. */
async function lastStoreHint(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ lastStoreId: sessions.lastStoreId })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), isNotNull(sessions.lastStoreId)))
    .orderBy(desc(sessions.lastSeenAt))
    .limit(1);
  return row?.lastStoreId ?? null;
}

async function signedIn(userId: string, session: IssuedSession, platformRole: PlatformRole | "none", lastStoreId: string | null): Promise<SignedIn> {
  return { session, userId, memberships: await listMemberships(userId), platformRole, lastStoreId };
}

export async function loginAccount(
  input: { email: string; password: string; turnstileToken?: string | null },
  ctx: ClientContext,
): Promise<PasswordLoginResult> {
  const email = normalizeEmail(input.email).slice(0, 191);
  try {
    const ipLimit = await limits.loginIp(ctx.ip);
    if (!ipLimit.ok) {
      // log once per window, not on every blocked request
      if (ipLimit.count === ipLimit.limit + 1) await audit("auth.login.rate_limited", { target: email, ip: ctx.ip });
      return { ok: false, error: "rate_limited", retryAfter: ipLimit.retryAfter };
    }

    // charge both account buckets first and decide the challenge on the charged counts, so parallel guesses can't all
    // read the old count (review r1.0-t2 F3); an attempt past LOGIN_CHALLENGE_AFTER earlier failures without a passing
    // token gives both charges back: answering the challenge costs no account budget
    const [netLimit, acctLimit] = await Promise.all([loginAccountLimits.acctNet(email, ctx.ip), loginAccountLimits.acct(email)]);
    if (netLimit.count > LOGIN_CHALLENGE_AFTER || acctLimit.count > LOGIN_CHALLENGE_AFTER) {
      const widget = await platformTurnstileKeys();
      if (widget) {
        const check = await checkPlatformTurnstile(input.turnstileToken, ctx.ip, widget);
        // a Cloudflare outage lets the attempt through: the account-network bucket still bounds it
        if (check === "missing" || check === "failed") {
          await refundBuckets([buckets.loginAcctNet(email, ctx.ip), buckets.loginAcct(email)]);
          return { ok: false, error: "challenge" };
        }
      }
    }

    if (!netLimit.ok) {
      if (netLimit.count === netLimit.limit + 1) await audit("auth.login.locked", { target: email, meta: { scope: "network" }, ip: ctx.ip });
      return { ok: false, error: "rate_limited", retryAfter: netLimit.retryAfter };
    }

    const user = await getUserByEmail(email);
    if (!user) {
      await burnPasswordCheck(input.password);
      await audit("auth.login.failure", { target: email, meta: { reason: "unknown_email" }, ip: ctx.ip });
      return { ok: false, error: "invalid" };
    }

    const valid = await verifyPassword(input.password, user.passwordHash);
    if (!valid || user.disabled) {
      await audit("auth.login.failure", {
        userId: user.id,
        target: email,
        meta: { reason: user.disabled ? "disabled" : "bad_password", attempt: netLimit.count },
        ip: ctx.ip,
      });
      return { ok: false, error: "invalid" };
    }

    if (needsRehash(user.passwordHash)) {
      await db
        .update(users)
        .set({ passwordHash: await hashPassword(input.password) })
        .where(eq(users.id, user.id));
    }
    await recordLoginLinks(user.id, { ip: ctx.ip, deviceId: ctx.deviceId ?? null });
    const lastStoreId = await lastStoreHint(user.id);

    if (user.totpEnabled) {
      // the account budgets stay consumed until the second factor succeeds
      const session = await createSession(user.id, { mfaPassed: false, ip: ctx.ip, ua: ctx.ua, lastStoreId });
      await audit("auth.login.mfa_pending", { userId: user.id, target: email, ip: ctx.ip });
      return { ok: true, mfaRequired: true, ...(await signedIn(user.id, session, user.platformRole, lastStoreId)) };
    }

    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
    await Promise.all([clearBucket(buckets.loginAcctNet(email, ctx.ip)), clearBucket(buckets.loginAcct(email))]);
    const session = await createSession(user.id, { mfaPassed: true, ip: ctx.ip, ua: ctx.ua, lastStoreId });
    await audit("auth.login.success", { userId: user.id, target: email, meta: { mfa: false }, ip: ctx.ip });
    return { ok: true, mfaRequired: false, ...(await signedIn(user.id, session, user.platformRole, lastStoreId)) };
  } catch (err) {
    if (err instanceof AuthBusyError) return { ok: false, error: "busy" };
    throw err;
  }
}

export type SecondFactorLoginResult =
  | ({ ok: true; method: "totp" | "recovery"; recoveryRemaining?: number } & SignedIn)
  | { ok: false; error: "invalid" | "locked" | "expired" };

/**
 * Completes a pending sign-in. Too many wrong codes end the pending session (password again).
 * On success the pending session is rotated into a fully authenticated one.
 */
export async function completeSecondFactor(
  pending: { sessionId: string; userId: string },
  input: SecondFactorInput,
  ctx: ClientContext,
): Promise<SecondFactorLoginResult> {
  const user = await getUserById(pending.userId);
  if (!user || user.disabled || !user.totpEnabled) {
    await deleteSession(pending.sessionId);
    return { ok: false, error: "expired" };
  }

  const [ipLimit, userLimit] = await Promise.all([limits.mfaIp(ctx.ip), limits.mfaUser(user.id)]);
  if (!ipLimit.ok || !userLimit.ok) {
    await deleteSession(pending.sessionId);
    await audit("auth.mfa.locked", { userId: user.id, target: user.email, ip: ctx.ip });
    return { ok: false, error: "locked" };
  }

  const result = await verifySecondFactor(user.id, input);
  if (!result.ok) {
    await audit("auth.mfa.failure", { userId: user.id, target: user.email, meta: { method: input.method }, ip: ctx.ip });
    return { ok: false, error: "invalid" };
  }

  await Promise.all([
    clearBucket(buckets.mfaUser(user.id)),
    clearBucket(buckets.loginAcctNet(user.email, ctx.ip)),
    clearBucket(buckets.loginAcct(user.email)),
  ]);
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  const session = await rotateSession({ id: pending.sessionId, userId: user.id }, { mfaPassed: true, ip: ctx.ip, ua: ctx.ua });

  if (result.method === "recovery") {
    await audit("auth.mfa.recovery_used", { userId: user.id, target: user.email, meta: { remaining: result.remaining }, ip: ctx.ip });
  }
  await audit("auth.login.success", { userId: user.id, target: user.email, meta: { mfa: result.method }, ip: ctx.ip });

  const who = await signedIn(user.id, session, user.platformRole, await lastStoreHint(user.id));
  return result.method === "recovery"
    ? { ok: true, method: "recovery", recoveryRemaining: result.remaining, ...who }
    : { ok: true, method: "totp", ...who };
}
