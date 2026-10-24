import "server-only";
/**
 * `/reset/<token>` (docs/STORE-SAAS.md §B.9): the other half of `createPasswordResetLink` (src/lib/auth/users.ts).
 * The link is single use: the row is consumed by one conditional UPDATE (`used_at IS NULL AND expires_at > now`,
 * `affectedRows === 1` the only success path, SEC-24), so two tabs submitting the same link change the password once.
 * Then every session of the user ends, audit `auth.password.reset` (actor kind `platform`: staff issued the link) and
 * a notification to the user. Unknown, used, expired and banned all answer the same `auth.reset.invalid`.
 */
import { and, eq, gt, isNull } from "drizzle-orm";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db/client";
import { passwordResets, users } from "@/lib/db/schema";
import { notify } from "@/lib/platform/notify";
import { AuthRefusal, FieldsError } from "./errors";
import { hashPassword, passwordProblem, verifyPassword } from "./password";
import { revokeUserSessions } from "./session";
import { hashResetToken } from "./users";

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
export const RESET_INVALID = "auth.reset.invalid";

interface LiveReset {
  id: string;
  userId: string;
  createdBy: string | null;
  email: string;
  passwordHash: string;
}

async function liveReset(token: unknown): Promise<LiveReset | null> {
  if (typeof token !== "string" || !TOKEN_RE.test(token)) return null;
  const [row] = await db
    .select({ id: passwordResets.id, userId: passwordResets.userId, createdBy: passwordResets.createdBy, email: users.email, passwordHash: users.passwordHash, disabled: users.disabled })
    .from(passwordResets)
    .innerJoin(users, eq(users.id, passwordResets.userId))
    .where(and(eq(passwordResets.tokenHash, hashResetToken(token)), isNull(passwordResets.usedAt), gt(passwordResets.expiresAt, new Date())))
    .limit(1);
  if (!row || row.disabled) return null;
  return { id: row.id, userId: row.userId, createdBy: row.createdBy, email: row.email, passwordHash: row.passwordHash };
}

/** Does the link still work? (The page shows the form or the one invalid state; it never names the account.) */
export async function previewPasswordReset(token: string): Promise<{ valid: boolean }> {
  return { valid: (await liveReset(token)) !== null };
}

/**
 * Sets the new password. Throws AuthRefusal("invalid", RESET_INVALID) for a dead link, FieldsError({ password }) for
 * the policy, AuthBusyError when the scrypt semaphore is full.
 */
export async function consumePasswordReset(token: string, newPassword: string, ctx: { ip: string | null }): Promise<{ userId: string }> {
  const reset = await liveReset(token);
  if (!reset) throw new AuthRefusal("invalid", RESET_INVALID);
  const problem = passwordProblem(newPassword, reset.email);
  if (problem) throw new FieldsError({ password: `auth.password.${problem}` });
  if (await verifyPassword(newPassword, reset.passwordHash)) throw new FieldsError({ password: "auth.password.reused" });
  const passwordHash = await hashPassword(newPassword);

  const consumed = await db.transaction(async (tx) => {
    const now = new Date();
    const [cas] = await tx
      .update(passwordResets)
      .set({ usedAt: now })
      .where(and(eq(passwordResets.id, reset.id), isNull(passwordResets.usedAt), gt(passwordResets.expiresAt, now)));
    if (cas.affectedRows !== 1) return false;
    await tx.update(users).set({ passwordHash }).where(eq(users.id, reset.userId));
    return true;
  });
  if (!consumed) throw new AuthRefusal("invalid", RESET_INVALID);

  const revoked = await revokeUserSessions(reset.userId);
  await audit("auth.password.reset", {
    userId: reset.userId,
    target: reset.userId,
    meta: { via: "reset_link", issuedBy: reset.createdBy, sessions: revoked },
    ip: ctx.ip,
    scope: { storeId: null, actorKind: "platform" },
  });
  await notify({ audience: "user", userId: reset.userId, storeId: null }, "user.password_reset", {}, { link: "/app/account/security", severity: "warn" });
  return { userId: reset.userId };
}
