/**
 * User records: lookup, account creation, password, 2FA reset, bans and reset links.
 * Every privilege-affecting change revokes the user's sessions so it takes effect immediately.
 *
 * The platform functions of PLA Q.19 (`createAccount`, `banUser`, `unbanUser`, `resetUserTwoFactor`,
 * `createPasswordResetLink`) that the console and the public flows call. The staff functions take a
 * `PlatformCtx` and re-check `users.manage` with a fresh step-up themselves (PLA-§11.2: a reason, never oneself,
 * never a staff account: those change only through the staff screens of PLA-§14).
 */
import "server-only";
import { createHash } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
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
import { revokeUserSessions } from "./session";

export type UserRow = typeof users.$inferSelect;

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

/**
 * Staff turn off a user's two-step verification (PLA Q.19; `users.manage` with a fresh step-up, a reason, never
 * oneself, never a staff account): a lost phone, or an authenticator someone else enrolled from a hijacked session.
 * Clears the secret and the recovery codes and ends all of that user's sessions.
 */
export function resetUserTwoFactor(ctx: PlatformCtx, userId: string, reason: string): Promise<void> {
  return resetTwoFactorAsStaff(ctx, userId, reason);
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
  // a deleted account is anonymised for good (review r1.0-t2 F5): no ban, unban, reset link or 2FA reset brings it back
  if (!user || user.disabledReason === "deleted") throw new AuthRefusal("not_found");
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
