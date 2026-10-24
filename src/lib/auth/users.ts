/**
 * User records: lookup, creation (incl. the first owner), password, 2FA reset and privilege changes.
 * Every privilege-affecting change revokes the user's sessions so it takes effect immediately.
 */
import "server-only";
import { asc, count, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db/client";
import { newId } from "@/lib/db/ids";
import { users } from "@/lib/db/schema";
import { AuthInputError } from "./errors";
import { checkPasswordPolicy, hashPassword, verifyPassword } from "./password";
import { isRole, type Role } from "./permissions";
import type { PlatformCtx } from "@/lib/tenancy/types";
import { revokeUserSessions } from "./session";

export type UserRow = typeof users.$inferSelect;

export interface UserSummary {
  id: string;
  email: string;
  name: string;
  role: Role;
  totpEnabled: boolean;
  disabled: boolean;
  createdAt: Date;
  lastLoginAt: Date | null;
}

const toSummary = (u: UserRow): UserSummary => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role,
  totpEnabled: u.totpEnabled,
  disabled: u.disabled,
  createdAt: u.createdAt,
  lastLoginAt: u.lastLoginAt,
});

/** NFKC + trim + lower-case. All lookups and uniqueness use this form. */
export function normalizeEmail(input: string): string {
  return input.normalize("NFKC").trim().toLowerCase();
}

export const EmailInput = z
  .string()
  .transform(normalizeEmail)
  .pipe(z.email({ error: "Enter a valid email address." }).max(191, { error: "Email is too long." }));

export const NameInput = z
  .string()
  .transform((v) => v.normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim())
  .pipe(z.string().min(1, { error: "Enter a name." }).max(120, { error: "Name is too long." }));

export async function getUserById(id: string): Promise<UserRow | null> {
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function getUserByEmail(email: string): Promise<UserRow | null> {
  const rows = await db.select().from(users).where(eq(users.email, normalizeEmail(email))).limit(1);
  return rows[0] ?? null;
}

export async function countUsers(): Promise<number> {
  const [row] = await db.select({ n: count() }).from(users);
  return Number(row?.n ?? 0);
}

export async function listUsers(): Promise<UserSummary[]> {
  const rows = await db.select().from(users).orderBy(asc(users.createdAt));
  return rows.map(toSummary);
}

export interface NewUserInput {
  email: string;
  name: string;
  password: string;
  role: Role;
}

async function prepareUser(input: NewUserInput) {
  const email = EmailInput.safeParse(input.email);
  if (!email.success) throw new AuthInputError(email.error.issues[0]?.message ?? "Invalid email.", "email");
  const name = NameInput.safeParse(input.name);
  if (!name.success) throw new AuthInputError(name.error.issues[0]?.message ?? "Invalid name.", "name");
  if (!isRole(input.role)) throw new AuthInputError("Unknown role.", "role");
  const problem = checkPasswordPolicy(input.password, email.data);
  if (problem) throw new AuthInputError(problem, "password");
  return {
    id: newId(),
    email: email.data,
    name: name.data,
    role: input.role,
    passwordHash: await hashPassword(input.password),
    createdAt: new Date(),
  };
}

/** mysql2 error code, looking through drizzle's wrapping (`cause`). */
function dbErrorCode(err: unknown): string | undefined {
  for (let e: unknown = err, depth = 0; e && typeof e === "object" && depth < 4; depth++) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === "string") return code;
    e = (e as { cause?: unknown }).cause;
  }
  return undefined;
}

const isDuplicate = (err: unknown) => dbErrorCode(err) === "ER_DUP_ENTRY";
const isLockConflict = (err: unknown) => {
  const code = dbErrorCode(err);
  return code === "ER_LOCK_DEADLOCK" || code === "ER_LOCK_WAIT_TIMEOUT";
};

/** Creates a user (owner action). Throws AuthInputError on invalid input or a taken email. */
export async function createUser(input: NewUserInput, actor: { id: string; ip?: string | null }): Promise<UserSummary> {
  const values = await prepareUser(input);
  try {
    await db.insert(users).values(values);
  } catch (err) {
    if (isDuplicate(err)) throw new AuthInputError("A user with this email already exists.", "email");
    throw err;
  }
  await audit("auth.user.created", { userId: actor.id, target: values.id, meta: { role: values.role }, ip: actor.ip });
  const created = await getUserById(values.id);
  return toSummary(created!);
}

/**
 * Creates the first owner — only while the users table is empty. The `FOR UPDATE` read takes a
 * next-key lock on the empty table, so two concurrent setups serialise and the second sees one row.
 * Returns null when a user already exists.
 */
export async function createFirstOwner(input: Omit<NewUserInput, "role">): Promise<UserSummary | null> {
  const values = await prepareUser({ ...input, role: "owner" });
  let created: boolean;
  try {
    created = await db.transaction(async (tx) => {
      const [rows] = (await tx.execute(sql`SELECT COUNT(*) AS n FROM users FOR UPDATE`)) as unknown as [
        { n: number | string }[],
      ];
      if (Number(rows[0]?.n ?? 0) > 0) return false;
      await tx.insert(users).values(values);
      return true;
    });
  } catch (err) {
    // Two simultaneous setups share the gap lock and InnoDB aborts one as a deadlock: that one lost the race.
    if (isLockConflict(err) && (await countUsers()) > 0) return null;
    throw err;
  }
  if (!created) return null;
  const row = await getUserById(values.id);
  return row ? toSummary(row) : null;
}

/**
 * Self-service password change. Verifies the current password, enforces the policy, and ends
 * every other session of the user (the caller rotates the current one).
 */
export async function changeUserPassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  ctx: { keepSessionId?: string; ip?: string | null },
): Promise<void> {
  const user = await getUserById(userId);
  if (!user || user.disabled) throw new AuthInputError("Your account is not available.");
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new AuthInputError("Your current password is incorrect.", "password");
  }
  const problem = checkPasswordPolicy(newPassword, user.email);
  if (problem) throw new AuthInputError(problem, "newPassword");
  if (await verifyPassword(newPassword, user.passwordHash)) {
    throw new AuthInputError("Choose a password you haven't used here before.", "newPassword");
  }
  await db.update(users).set({ passwordHash: await hashPassword(newPassword) }).where(eq(users.id, userId));
  await revokeUserSessions(userId, { exceptId: ctx.keepSessionId });
  await audit("auth.password.changed", { userId, target: userId, ip: ctx.ip });
}

/** Owner sets a new password for another user; all of that user's sessions end. */
export async function resetUserPassword(
  actor: { id: string; ip?: string | null },
  userId: string,
  newPassword: string,
): Promise<void> {
  const user = await getUserById(userId);
  if (!user) throw new AuthInputError("User not found.");
  const problem = checkPasswordPolicy(newPassword, user.email);
  if (problem) throw new AuthInputError(problem, "newPassword");
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(newPassword), failedLogins: 0, lockedUntil: null })
    .where(eq(users.id, userId));
  await revokeUserSessions(userId);
  await audit("auth.password.reset", { userId: actor.id, target: userId, ip: actor.ip });
}

/**
 * Owner turns off another user's two-step verification — a lost phone, or an authenticator that
 * someone else enrolled from a hijacked session. Clears the secret and the recovery codes and ends
 * all of that user's sessions, so their next sign-in asks for the password only. Never for the
 * actor's own account: that goes through disableTwoFactor, which asks for the password and a code.
 */
export function resetUserTwoFactor(ctx: PlatformCtx, userId: string, reason: string): Promise<void>;
/** @deprecated today's owner reset in tenant settings (AUTH-09: deleted in R1.0); the platform overload is `users.manage` ↑ */
export function resetUserTwoFactor(actor: { id: string; ip?: string | null }, userId: string): Promise<void>;
export async function resetUserTwoFactor(actor: PlatformCtx | { id: string; ip?: string | null }, userId: string, reason?: string): Promise<void> {
  if (!("id" in actor)) {
    // platform reset (§B.7): reason required, audit platform.user.2fa_reset + a notification to the user; T2
    void reason;
    throw new Error("not implemented: T2 (resetUserTwoFactor)");
  }
  if (userId === actor.id) throw new AuthInputError("Turn off your own two-step verification in Security.");
  const user = await getUserById(userId);
  if (!user) throw new AuthInputError("User not found.");
  if (!user.totpEnabled) throw new AuthInputError("Two-step verification is already off for this member.");
  await db.update(users).set({ totpEnabled: false, totpSecretEnc: null, recoveryCodes: null }).where(eq(users.id, userId));
  await revokeUserSessions(userId);
  await audit("auth.2fa.reset", { userId: actor.id, target: userId, ip: actor.ip });
}

type UserLock = Pick<UserRow, "id" | "role" | "disabled">;

/**
 * Runs a role/disable change in a transaction that first locks every user row (the table holds a
 * handful of staff accounts). Concurrent changes therefore serialise in one lock order — no
 * deadlocks — and the "at least one active owner" rule is checked against committed state:
 * two owners demoting each other at the same moment can't both succeed.
 * `change` returns the update to apply, or null when there is nothing to do.
 */
async function changeGuardingOwners(
  userId: string,
  change: (target: UserLock) => Partial<Pick<UserRow, "role" | "disabled">> | null,
): Promise<{ before: UserLock } | null> {
  return db.transaction(async (tx) => {
    const all = await tx
      .select({ id: users.id, role: users.role, disabled: users.disabled })
      .from(users)
      .orderBy(asc(users.id))
      .for("update");
    const target = all.find((u) => u.id === userId);
    if (!target) throw new AuthInputError("User not found.");
    const set = change(target);
    if (!set) return null;

    const after = { ...target, ...set };
    const activeOwner = (u: UserLock) => u.role === "owner" && !u.disabled;
    if (activeOwner(target) && !activeOwner(after) && !all.some((u) => u.id !== userId && activeOwner(u))) {
      throw new AuthInputError("Keep at least one active owner.", "role" in set ? "role" : null);
    }
    await tx.update(users).set(set).where(eq(users.id, userId));
    return { before: target };
  });
}

/** Changes a user's role; refuses to remove the last active owner. Revokes the user's sessions. */
export async function setUserRole(actor: { id: string; ip?: string | null }, userId: string, role: Role): Promise<void> {
  if (!isRole(role)) throw new AuthInputError("Unknown role.", "role");
  const result = await changeGuardingOwners(userId, (u) => (u.role === role ? null : { role }));
  if (!result) return;
  await revokeUserSessions(userId);
  await audit("auth.user.role_changed", {
    userId: actor.id,
    target: userId,
    meta: { from: result.before.role, to: role },
    ip: actor.ip,
  });
}

/** Disables/enables a user; refuses to disable the last active owner. Disabling revokes sessions. */
export async function setUserDisabled(
  actor: { id: string; ip?: string | null },
  userId: string,
  disabled: boolean,
): Promise<void> {
  const result = await changeGuardingOwners(userId, (u) => (u.disabled === disabled ? null : { disabled }));
  if (!result) return;
  if (disabled) await revokeUserSessions(userId);
  await audit(disabled ? "auth.user.disabled" : "auth.user.enabled", { userId: actor.id, target: userId, ip: actor.ip });
}

/* ------------------------------------------------------------------ */
/* Platform user functions (PLA Q.19; T2 implements, C0a typed stubs)  */
/* ------------------------------------------------------------------ */

function notImplemented(fn: string, ...args: unknown[]): never {
  void args;
  throw new Error(`not implemented: T2 (${fn})`);
}

/** `users.manage` ↑: disabled = 1 with reason and time, every session revoked; audit platform.user.banned. */
export async function banUser(ctx: PlatformCtx, userId: string, input: { reason: string; note?: string }): Promise<void> {
  return notImplemented("banUser", ctx, userId, input);
}

/** audit platform.user.unbanned. */
export async function unbanUser(ctx: PlatformCtx, userId: string, note?: string): Promise<void> {
  return notImplemented("unbanUser", ctx, userId, note);
}

/** `users.manage` ↑ with a reason: a single-use 60-minute `password_resets` link, shown once (§B.9). */
export async function createPasswordResetLink(ctx: PlatformCtx, userId: string, reason: string): Promise<{ url: string; expiresAt: Date }> {
  return notImplemented("createPasswordResetLink", ctx, userId, reason);
}

/** Password policy + the scrypt semaphore; the signup, invite and staff-invite flows share it. Never sets a role. */
export async function createAccount(input: { email: string; name: string; password: string; phone?: string; locale: "ar" | "fr" | "en" }): Promise<{ userId: string }> {
  return notImplemented("createAccount", input);
}
