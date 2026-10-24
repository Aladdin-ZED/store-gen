/**
 * User records: lookup, creation, password, 2FA reset and privilege changes.
 * Every privilege-affecting change revokes the user's sessions so it takes effect immediately.
 *
 * Two generations live here until the R1.0 integration: today's single-tenant /admin team functions (`createUser`,
 * `setUserRole`, `setUserDisabled`, `resetUserPassword`, the owner form of `resetUserTwoFactor`), kept for their
 * callers, and the platform functions of PLA Q.19 (`createAccount`, `banUser`, `unbanUser`, `resetUserTwoFactor(ctx,
 * …)`, `createPasswordResetLink`) that the console and the public flows call. The staff functions take a
 * `PlatformCtx` and re-check `users.manage` with a fresh step-up themselves (PLA-§11.2: a reason, never oneself,
 * never a staff account: those change only through the staff screens of PLA-§14).
 */
import "server-only";
import { createHash } from "node:crypto";
import { and, asc, count, eq, isNull } from "drizzle-orm";
import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/max";
import { z } from "zod";
import { audit, auditFrom } from "@/lib/audit";
import { db } from "@/lib/db/client";
import { newId, newToken } from "@/lib/db/ids";
import { passwordResets, users } from "@/lib/db/schema";
import { notify } from "@/lib/platform/notify";
import type { MessageKey, PlatformCtx } from "@/lib/tenancy/types";
import { platformOrigin } from "@/lib/urls";
import { AuthInputError, AuthRefusal, FieldsError } from "./errors";
import { checkPasswordPolicy, hashPassword, passwordProblem, verifyPassword } from "./password";
import { isRole, type Role } from "./permissions";
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

/** ER_DUP_ENTRY, looking through drizzle's wrapping (a duplicate e-mail, handle or token). */
export const isDuplicate = (err: unknown) => dbErrorCode(err) === "ER_DUP_ENTRY";

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
  if (!("id" in actor)) return resetTwoFactorAsStaff(actor, userId, reason ?? "");
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
/* Accounts (PLA Q.19: signup, store invites and staff invites)        */
/* ------------------------------------------------------------------ */

export type AccountLocale = "ar" | "fr" | "en";

export interface NewAccount {
  email: string;
  name: string;
  password: string;
  /** E.164, or a national number of `phoneCountry` (the signup form formats it as typed) */
  phone?: string;
  locale: AccountLocale;
}

/** The one answer for a duplicate e-mail (and, in signup, handle): no field named, no oracle (§B.2 step 7). */
export const ACCOUNT_REFUSED: MessageKey = "auth.signup.refused";

/** E.164 of a phone input, null when empty; throws FieldsError for a number libphonenumber-js refuses. */
export function parseAccountPhone(input: string | undefined, defaultCountry: CountryCode = "MA"): string | null {
  const raw = input?.trim() ?? "";
  if (!raw) return null;
  const parsed = raw.length <= 32 ? parsePhoneNumberFromString(raw, defaultCountry) : undefined;
  if (!parsed?.isValid()) throw new FieldsError({ phone: "auth.phone_invalid" });
  return parsed.number;
}

/**
 * Validates and hashes a new account (the password policy, scrypt through the semaphore). Never a role: no legacy
 * role beyond the column default, no platform role, no membership. Throws FieldsError (`email`, `name`, `password`,
 * `phone` → message keys) or AuthBusyError.
 */
export async function prepareAccount(input: NewAccount, opts: { phoneCountry?: CountryCode } = {}): Promise<typeof users.$inferInsert> {
  const fields: Record<string, MessageKey> = {};
  const email = EmailInput.safeParse(input.email);
  if (!email.success) fields.email = "auth.email_invalid";
  const name = NameInput.safeParse(input.name);
  if (!name.success) fields.name = "auth.name_invalid";
  const problem = passwordProblem(input.password, email.success ? email.data : null);
  if (problem) fields.password = `auth.password.${problem}`;
  let phone: string | null = null;
  try {
    phone = parseAccountPhone(input.phone, opts.phoneCountry);
  } catch (err) {
    if (!(err instanceof FieldsError)) throw err;
    Object.assign(fields, err.fields);
  }
  const locale = input.locale === "ar" || input.locale === "fr" || input.locale === "en" ? input.locale : null;
  if (!locale) fields.locale = "auth.locale_invalid";
  if (Object.keys(fields).length || !email.success || !name.success) throw new FieldsError(fields);
  return {
    id: newId(),
    email: email.data,
    name: name.data,
    passwordHash: await hashPassword(input.password),
    phone,
    locale,
    createdAt: new Date(),
  };
}

type Executor = Pick<typeof db, "insert">;

/** Inserts a prepared account (inside the caller's transaction when given). A taken e-mail → AuthRefusal("invalid", ACCOUNT_REFUSED). */
export async function insertAccount(values: typeof users.$inferInsert, executor: Executor = db): Promise<void> {
  try {
    await executor.insert(users).values(values);
  } catch (err) {
    if (isDuplicate(err)) throw new AuthRefusal("invalid", ACCOUNT_REFUSED);
    throw err;
  }
}

/** Password policy + the scrypt semaphore; the signup, invite and staff-invite flows share it. Never sets a role. */
export async function createAccount(input: { email: string; name: string; password: string; phone?: string; locale: "ar" | "fr" | "en" }): Promise<{ userId: string }> {
  const values = await prepareAccount(input);
  await insertAccount(values);
  await audit("auth.user.created", { userId: values.id, target: values.id, meta: { via: "account" } });
  return { userId: values.id };
}

/* ------------------------------------------------------------------ */
/* Platform user functions (PLA Q.19, PLA-§11.2)                       */
/* ------------------------------------------------------------------ */

const REASON_MIN = 3;
const REASON_MAX = 200;

/** A staff reason: trimmed, 3-200 characters, control characters dropped. */
export function staffReason(input: unknown): string {
  const value = typeof input === "string" ? input.normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim() : "";
  if ([...value].length < REASON_MIN || [...value].length > REASON_MAX) throw new FieldsError({ reason: "auth.staff.reason_required" });
  return value;
}

/**
 * The guards every PLA-§11.2 action shares: `users.manage` with a fresh step-up, a target that exists, is not the
 * actor and holds no platform role (a staff account changes only through the staff screens of PLA-§14).
 */
async function staffTarget(ctx: PlatformCtx, userId: string): Promise<UserRow> {
  if (!ctx.can("users.manage")) throw new AuthRefusal("forbidden");
  if (!ctx.stepUpFresh) throw new AuthRefusal("step_up");
  if (userId === ctx.user.id) throw new AuthRefusal("forbidden", "auth.staff.not_yourself");
  const user = typeof userId === "string" && userId.length === 26 ? await getUserById(userId) : null;
  if (!user) throw new AuthRefusal("not_found");
  if (user.platformRole !== "none") throw new AuthRefusal("is_staff");
  return user;
}

/** `users.manage` ↑: disabled = 1 with reason and time, every session revoked; audit platform.user.banned. */
export async function banUser(ctx: PlatformCtx, userId: string, input: { reason: string; note?: string }): Promise<void> {
  const target = await staffTarget(ctx, userId);
  const reason = staffReason(input.reason);
  const note = typeof input.note === "string" ? input.note.trim().slice(0, 500) : "";
  await db.update(users).set({ disabled: true, disabledReason: reason, disabledAt: new Date() }).where(eq(users.id, target.id));
  const revoked = await revokeUserSessions(target.id);
  await auditFrom(ctx, "platform.user.banned", { target: target.id, meta: { reason, ...(note ? { note } : {}), sessions: revoked } });
}

/** audit platform.user.unbanned. */
export async function unbanUser(ctx: PlatformCtx, userId: string, note?: string): Promise<void> {
  const target = await staffTarget(ctx, userId);
  if (!target.disabled) return;
  await db.update(users).set({ disabled: false, disabledReason: null, disabledAt: null }).where(eq(users.id, target.id));
  const clean = typeof note === "string" ? note.trim().slice(0, 500) : "";
  await auditFrom(ctx, "platform.user.unbanned", { target: target.id, meta: clean ? { note: clean } : null });
}

/**
 * §B.7 2FA reset (platform-only, `users.manage` ↑, a reason): TOTP off, recovery codes cleared, every session revoked,
 * audit platform.user.2fa_reset and a notification to the user. A no-op answer for a user without 2FA is refused
 * as `invalid`, so the console never shows "done" for nothing.
 */
async function resetTwoFactorAsStaff(ctx: PlatformCtx, userId: string, reasonInput: string): Promise<void> {
  const target = await staffTarget(ctx, userId);
  const reason = staffReason(reasonInput);
  if (!target.totpEnabled && !target.totpSecretEnc) throw new AuthRefusal("invalid", "auth.staff.no_2fa");
  await db.update(users).set({ totpEnabled: false, totpSecretEnc: null, recoveryCodes: null }).where(eq(users.id, target.id));
  await revokeUserSessions(target.id);
  await auditFrom(ctx, "platform.user.2fa_reset", { target: target.id, meta: { reason } });
  await notify({ audience: "user", userId: target.id, storeId: null }, "user.2fa_reset", {}, { link: "/app/account/two-factor", severity: "warn" });
}

/** A single-use reset link lives this long (§B.9). */
export const PASSWORD_RESET_TTL_MS = 60 * 60_000;

export const hashResetToken = (token: string) => createHash("sha256").update(token, "utf8").digest("hex");

/**
 * `users.manage` ↑ with a reason: a single-use 60-minute `password_resets` link, shown once (§B.9). Earlier unused
 * links of the user are voided, so only the newest one works. Audit platform.user.reset_link (never the token).
 */
export async function createPasswordResetLink(ctx: PlatformCtx, userId: string, reason: string): Promise<{ url: string; expiresAt: Date }> {
  const target = await staffTarget(ctx, userId);
  const why = staffReason(reason);
  if (target.disabled) throw new AuthRefusal("invalid", "auth.staff.user_banned");
  const token = newToken(32);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + PASSWORD_RESET_TTL_MS);
  await db.transaction(async (tx) => {
    await tx
      .update(passwordResets)
      .set({ usedAt: now })
      .where(and(eq(passwordResets.userId, target.id), isNull(passwordResets.usedAt)));
    await tx.insert(passwordResets).values({ id: newId(), userId: target.id, tokenHash: hashResetToken(token), createdBy: ctx.user.id, reason: why, expiresAt });
  });
  await auditFrom(ctx, "platform.user.reset_link", { target: target.id, meta: { reason: why, expiresAt } });
  return { url: `${platformOrigin()}/reset/${token}`, expiresAt };
}
