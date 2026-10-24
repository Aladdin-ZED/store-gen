/**
 * Server-side sessions (DB rows keyed by sha256(token); the raw 256-bit token only lives in the cookie).
 *  - sliding idle expiry (7 d), refreshed at most every 10 min
 *  - absolute expiry 30 d from creation
 *  - pending-2FA sessions live 10 min and never slide
 * Pure data layer — cookie handling lives in ./cookies.ts.
 */
import "server-only";
import { createHash } from "node:crypto";
import { and, desc, eq, gt, inArray, lt, ne, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { sessions, users } from "@/lib/db/schema";
import { newToken } from "@/lib/db/ids";
import { hashIp } from "@/lib/security/crypto";
import {
  MAX_SESSIONS_PER_USER,
  MFA_PENDING_TTL_MS,
  SESSION_ABSOLUTE_TTL_MS,
  SESSION_IDLE_TTL_MS,
  SESSION_TOUCH_INTERVAL_MS,
} from "./config";
import { isAdminLocale, type AdminLocale } from "@/lib/i18n/admin";
import type { PlatformRole, Role } from "./permissions";

/** newToken(32) → 43 base64url chars */
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export interface ClientMeta {
  ip?: string | null;
  ua?: string | null;
}

export interface IssuedSession {
  /** raw token for the cookie — never store or log it */
  token: string;
  id: string;
  userId: string;
  mfaPassed: boolean;
  /** when the cookie should expire */
  cookieExpiresAt: Date;
}

export interface ValidSession {
  id: string;
  userId: string;
  mfaPassed: boolean;
  createdAt: Date;
  expiresAt: Date;
  /** the store this session last opened (a store-picker hint, never an authorisation; §B.4) */
  lastStoreId: string | null;
  /** the `impersonation_sessions` row this staff session views a store through (§B.8); the seam re-checks it */
  impersonationId: string | null;
  /** the last step-up (TOTP or password) of this session, fresh for 5 minutes (§B.7) */
  stepUpAt: Date | null;
  user: {
    id: string;
    email: string;
    name: string;
    /** @deprecated the single-tenant role (STORE-SAAS §E.1: SessionUser loses it once T2 moves its callers) */
    role: Role;
    totpEnabled: boolean;
    platformRole: PlatformRole | "none";
    /** admin UI locale; null = the browser's */
    locale: AdminLocale | null;
  };
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function isWellFormedToken(token: unknown): token is string {
  return typeof token === "string" && TOKEN_RE.test(token);
}

function meta(client: ClientMeta | undefined) {
  let ip: string | null = null;
  if (client?.ip) {
    try {
      ip = hashIp(client.ip);
    } catch {
      ip = null;
    }
  }
  const ua = client?.ua ? client.ua.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 300) : null;
  return { ip, ua: ua || null };
}

export async function createSession(
  userId: string,
  opts: { mfaPassed: boolean; lastStoreId?: string | null } & ClientMeta,
): Promise<IssuedSession> {
  const token = newToken(32);
  const id = hashSessionToken(token);
  const now = Date.now();
  const absolute = now + SESSION_ABSOLUTE_TTL_MS;
  const expires = opts.mfaPassed ? Math.min(now + SESSION_IDLE_TTL_MS, absolute) : now + MFA_PENDING_TTL_MS;
  const { ip, ua } = meta(opts);

  await db.insert(sessions).values({
    id,
    userId,
    mfaPassed: opts.mfaPassed,
    createdAt: new Date(now),
    expiresAt: new Date(expires),
    lastSeenAt: new Date(now),
    ip,
    ua,
    lastStoreId: opts.lastStoreId ?? null,
  });
  await pruneUserSessions(userId);

  return {
    token,
    id,
    userId,
    mfaPassed: opts.mfaPassed,
    cookieExpiresAt: new Date(opts.mfaPassed ? absolute : expires),
  };
}

/**
 * Resolves a cookie token to a live session + user. Deletes the row when it is expired or the
 * user was disabled; extends the idle window (rate-limited writes) for fully authenticated sessions.
 */
export async function validateSessionToken(token: string | null | undefined): Promise<ValidSession | null> {
  if (!isWellFormedToken(token)) return null;
  const id = hashSessionToken(token);

  const rows = await db
    .select({
      id: sessions.id,
      userId: sessions.userId,
      mfaPassed: sessions.mfaPassed,
      createdAt: sessions.createdAt,
      expiresAt: sessions.expiresAt,
      lastSeenAt: sessions.lastSeenAt,
      lastStoreId: sessions.lastStoreId,
      impersonationId: sessions.impersonationId,
      stepUpAt: sessions.stepUpAt,
      email: users.email,
      name: users.name,
      role: users.role,
      totpEnabled: users.totpEnabled,
      platformRole: users.platformRole,
      locale: users.locale,
      disabled: users.disabled,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) return null;

  const now = Date.now();
  const absolute = row.createdAt.getTime() + SESSION_ABSOLUTE_TTL_MS;
  if (row.disabled || row.expiresAt.getTime() <= now || absolute <= now) {
    await deleteSession(id);
    return null;
  }

  let expiresAt = row.expiresAt;
  if (row.mfaPassed && now - row.lastSeenAt.getTime() >= SESSION_TOUCH_INTERVAL_MS) {
    expiresAt = new Date(Math.min(now + SESSION_IDLE_TTL_MS, absolute));
    await db.update(sessions).set({ lastSeenAt: new Date(now), expiresAt }).where(eq(sessions.id, id));
  }

  return {
    id,
    userId: row.userId,
    mfaPassed: row.mfaPassed,
    createdAt: row.createdAt,
    expiresAt,
    lastStoreId: row.lastStoreId,
    impersonationId: row.impersonationId,
    stepUpAt: row.stepUpAt,
    user: {
      id: row.userId,
      email: row.email,
      name: row.name,
      role: row.role,
      totpEnabled: row.totpEnabled,
      platformRole: row.platformRole,
      locale: isAdminLocale(row.locale) ? row.locale : null,
    },
  };
}

/**
 * Replaces a session with a fresh token (login completion, 2FA changes, password change):
 * an attacker who planted or observed the old token gains nothing.
 */
export async function rotateSession(
  old: { id: string; userId: string },
  opts: { mfaPassed: boolean } & ClientMeta,
): Promise<IssuedSession> {
  // the store-picker hint survives a rotation; the step-up and a staff view-as never do
  const [prev] = await db.select({ lastStoreId: sessions.lastStoreId }).from(sessions).where(eq(sessions.id, old.id)).limit(1);
  const fresh = await createSession(old.userId, { ...opts, lastStoreId: prev?.lastStoreId ?? null });
  await deleteSession(old.id);
  return fresh;
}

export async function deleteSession(id: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, id));
}

export async function deleteSessionByToken(token: string | null | undefined): Promise<string | null> {
  if (!isWellFormedToken(token)) return null;
  const id = hashSessionToken(token);
  await deleteSession(id);
  return id;
}

/**
 * Ends every session of a user (role change, disable, password reset…), optionally keeping one.
 * `exceptSessionId` is the PLA Q.19 name of `exceptId` (both accepted until T2 moves the callers).
 */
export async function revokeUserSessions(userId: string, opts: { exceptSessionId?: string; exceptId?: string } = {}): Promise<number> {
  const except = opts.exceptSessionId ?? opts.exceptId;
  const where = except ? and(eq(sessions.userId, userId), ne(sessions.id, except)) : eq(sessions.userId, userId);
  const [result] = await db.delete(sessions).where(where);
  return result.affectedRows;
}

/**
 * The step-up of a session (§B.7: a TOTP code or, for tenants, the password), fresh for 5 minutes. Only a fully
 * signed-in session can be stepped up. Returns false when the row is gone.
 */
export async function markSessionStepUp(sessionId: string, at: Date = new Date()): Promise<boolean> {
  const [result] = await db
    .update(sessions)
    .set({ stepUpAt: at })
    .where(and(eq(sessions.id, sessionId), eq(sessions.mfaPassed, true)));
  return result.affectedRows === 1;
}

/** The store picker hint of a session (§B.4); never an authorisation, the seam checks the membership on every request. */
export async function setSessionLastStore(sessionId: string, storeId: string | null): Promise<void> {
  await db.update(sessions).set({ lastStoreId: storeId }).where(eq(sessions.id, sessionId));
}

/** One signed-in device of the account pages (§B.9: devices, "sign out other sessions"). */
export interface DeviceSession {
  id: string;
  createdAt: Date;
  lastSeenAt: Date;
  /** the stored user agent (≤ 300 chars, control characters stripped); describe it, never render it as HTML */
  ua: string | null;
  current: boolean;
  /** a staff session currently viewing a store (§B.8) */
  impersonating: boolean;
}

/** The live, fully signed-in sessions of a user, newest activity first. */
export async function listUserSessions(userId: string, currentId: string | null): Promise<DeviceSession[]> {
  const rows = await db
    .select({ id: sessions.id, createdAt: sessions.createdAt, lastSeenAt: sessions.lastSeenAt, ua: sessions.ua, impersonationId: sessions.impersonationId })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), eq(sessions.mfaPassed, true), gt(sessions.expiresAt, new Date())))
    .orderBy(desc(sessions.lastSeenAt))
    .limit(MAX_SESSIONS_PER_USER);
  return rows.map((r) => ({ id: r.id, createdAt: r.createdAt, lastSeenAt: r.lastSeenAt, ua: r.ua, current: r.id === currentId, impersonating: r.impersonationId !== null }));
}

/** Ends one session of `userId` (another user's session id matches nothing). */
export async function revokeUserSession(userId: string, sessionId: string): Promise<boolean> {
  const [result] = await db.delete(sessions).where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)));
  return result.affectedRows === 1;
}

/** Keeps the newest MAX_SESSIONS_PER_USER sessions of a user and drops expired ones. */
async function pruneUserSessions(userId: string): Promise<void> {
  await db.delete(sessions).where(and(eq(sessions.userId, userId), lt(sessions.expiresAt, new Date())));
  const overflow = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(eq(sessions.userId, userId))
    .orderBy(desc(sessions.createdAt))
    .limit(1000)
    .offset(MAX_SESSIONS_PER_USER);
  if (overflow.length) {
    await db.delete(sessions).where(
      inArray(
        sessions.id,
        overflow.map((s) => s.id),
      ),
    );
  }
}

/** Housekeeping (boot / cron): removes idle-expired and absolutely-expired sessions. */
export async function purgeExpiredSessions(): Promise<number> {
  const now = Date.now();
  const [result] = await db
    .delete(sessions)
    .where(
      or(lt(sessions.expiresAt, new Date(now)), lt(sessions.createdAt, new Date(now - SESSION_ABSOLUTE_TTL_MS))),
    );
  return result.affectedRows;
}
