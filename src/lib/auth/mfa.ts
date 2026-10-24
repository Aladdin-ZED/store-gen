/**
 * Two-factor authentication (TOTP + recovery codes): enrollment, verification, management.
 *
 * Storage (users table, no extra columns needed):
 *  - totp_secret_enc: AES-GCM envelope (purpose "totp:<userId>") of
 *      { v: 1, s: base32 secret, t: last accepted time step, c: created-at ms }
 *    `t` gives replay protection; updates are compare-and-swap on the previous envelope, so two
 *    concurrent requests can never both consume the same code.
 *  - recovery_codes: keyed SHA-256 digests of the unused one-time codes.
 * While enrollment is pending the envelope exists with totp_enabled = false.
 */
import "server-only";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { decrypt, encrypt } from "@/lib/security/crypto";
import { limits } from "./attempts";
import { AuthInputError } from "./errors";
import { verifyPassword } from "./password";
import { brandName } from "./platform-config";
import { findRecoveryCode, generateRecoveryCodes, normalizeRecoveryCode } from "./recovery";
import { formatSecretForDisplay, generateTotpSecret, otpauthUri, totpQrDataUrl, verifyTotp } from "./totp";
import { getUserById, type UserRow } from "./users";

/** Pending enrollments expire after this long. */
const ENROLLMENT_TTL_MS = 30 * 60_000;

const TotpState = z.object({
  v: z.literal(1),
  s: z.string().regex(/^[A-Z2-7]{16,64}$/),
  t: z.number().int(),
  c: z.number().int().nonnegative(),
});
type TotpState = z.infer<typeof TotpState>;

const purpose = (userId: string) => `totp:${userId}`;
const seal = (userId: string, state: TotpState) => encrypt(JSON.stringify(state), purpose(userId));

function open(userId: string, envelope: string | null): TotpState | null {
  if (!envelope) return null;
  try {
    const parsed = TotpState.safeParse(JSON.parse(decrypt(envelope, purpose(userId))));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export type SecondFactorInput = { method: "totp"; code: string } | { method: "recovery"; code: string };

export type SecondFactorResult =
  | { ok: true; method: "totp" }
  | { ok: true; method: "recovery"; remaining: number }
  | { ok: false };

/** Compare-and-swap of the TOTP envelope after accepting `step`. */
async function consumeStep(user: UserRow, state: TotpState, step: number): Promise<boolean> {
  const [result] = await db
    .update(users)
    .set({ totpSecretEnc: seal(user.id, { ...state, t: step }) })
    .where(and(eq(users.id, user.id), eq(users.totpSecretEnc, user.totpSecretEnc!)));
  return result.affectedRows === 1;
}

/** Compare-and-swap removal of one recovery code; returns the remaining count or null on a lost race. */
async function consumeRecovery(user: UserRow, index: number): Promise<number | null> {
  const current = user.recoveryCodes ?? [];
  const remaining = current.filter((_, i) => i !== index);
  const [result] = await db
    .update(users)
    .set({ recoveryCodes: remaining })
    .where(and(eq(users.id, user.id), eq(users.recoveryCodes, current)));
  return result.affectedRows === 1 ? remaining.length : null;
}

/** Verifies (and consumes) a TOTP or recovery code for a user with 2FA enabled. */
export async function verifySecondFactor(userId: string, input: SecondFactorInput): Promise<SecondFactorResult> {
  const user = await getUserById(userId);
  if (!user || !user.totpEnabled || user.disabled) return { ok: false };

  if (input.method === "totp") {
    const state = open(user.id, user.totpSecretEnc);
    if (!state) return { ok: false };
    const step = verifyTotp(state.s, input.code, { lastStep: state.t });
    if (step === null) return { ok: false };
    return (await consumeStep(user, state, step)) ? { ok: true, method: "totp" } : { ok: false };
  }

  const normalized = normalizeRecoveryCode(input.code);
  if (!normalized) return { ok: false };
  const index = findRecoveryCode(user.recoveryCodes ?? [], normalized);
  if (index === -1) return { ok: false };
  const remaining = await consumeRecovery(user, index);
  return remaining === null ? { ok: false } : { ok: true, method: "recovery", remaining };
}

export interface TwoFactorStatus {
  enabled: boolean;
  recoveryCodesRemaining: number;
}

export async function getTwoFactorStatus(userId: string): Promise<TwoFactorStatus> {
  const user = await getUserById(userId);
  return {
    enabled: !!user?.totpEnabled,
    recoveryCodesRemaining: user?.totpEnabled ? (user.recoveryCodes?.length ?? 0) : 0,
  };
}

export interface EnrollmentChallenge {
  /** base32 secret grouped in fours for manual entry */
  secretDisplay: string;
  otpauthUri: string;
  /** SVG QR code as a data: URL */
  qrDataUrl: string;
}

/** Starts (or restarts) enrollment with a fresh secret. Fails when 2FA is already on. */
export async function beginTotpEnrollment(userId: string, ctx: { ip?: string | null } = {}): Promise<EnrollmentChallenge> {
  const user = await getUserById(userId);
  if (!user || user.disabled) throw new AuthInputError("Your account is not available.");
  if (user.totpEnabled) throw new AuthInputError("Two-step verification is already on.");
  const rl = await limits.mfaManage(user.id);
  if (!rl.ok) throw new AuthInputError("Too many attempts. Wait a few minutes and try again.");

  const secret = generateTotpSecret();
  const [result] = await db
    .update(users)
    .set({ totpSecretEnc: seal(user.id, { v: 1, s: secret, t: -1, c: Date.now() }) })
    .where(and(eq(users.id, user.id), eq(users.totpEnabled, false)));
  if (result.affectedRows !== 1) throw new AuthInputError("Two-step verification is already on.");

  await audit("auth.2fa.enrollment_started", { userId: user.id, target: user.id, ip: ctx.ip });
  // the issuer is the platform brand (§B.7); the HKDF salt and the purpose totp:<userId> never change (AUTH-28)
  const uri = otpauthUri({ secret, account: user.email, issuer: await brandName() });
  return { secretDisplay: formatSecretForDisplay(secret), otpauthUri: uri, qrDataUrl: await totpQrDataUrl(uri) };
}

/**
 * Confirms enrollment with a code from the authenticator, turns 2FA on and returns the one-time
 * recovery codes (shown once). The caller must rotate the current session and revoke the others.
 *
 * Requires the account password (step-up), like disableTwoFactor and a password change: turning
 * 2FA on binds every future sign-in to this authenticator and signs out all other devices, so a
 * borrowed or stolen session alone must not be enough to do it. Starting enrollment needs no
 * password — it only stages a secret that this step can activate.
 */
export async function confirmTotpEnrollment(
  userId: string,
  input: { code: string; password: string },
  ctx: { ip?: string | null } = {},
): Promise<{ recoveryCodes: string[] }> {
  const { code, password } = input;
  const user = await getUserById(userId);
  if (!user || user.disabled) throw new AuthInputError("Your account is not available.");
  if (user.totpEnabled) throw new AuthInputError("Two-step verification is already on.");
  const rl = await limits.mfaManage(user.id);
  if (!rl.ok) throw new AuthInputError("Too many attempts. Wait a few minutes and try again.", "code");
  if (!password || !(await verifyPassword(password, user.passwordHash))) {
    throw new AuthInputError("Your password is incorrect.", "password");
  }

  const state = open(user.id, user.totpSecretEnc);
  if (!state || Date.now() - state.c > ENROLLMENT_TTL_MS) {
    throw new AuthInputError("This setup has expired. Start again to get a new code.", "code");
  }
  const step = verifyTotp(state.s, code, { lastStep: state.t });
  if (step === null) throw new AuthInputError("That code didn't match. Check your device's clock and try the newest code.", "code");

  const { codes, hashes } = generateRecoveryCodes();
  const [result] = await db
    .update(users)
    .set({ totpEnabled: true, totpSecretEnc: seal(user.id, { ...state, t: step }), recoveryCodes: hashes })
    .where(and(eq(users.id, user.id), eq(users.totpEnabled, false), eq(users.totpSecretEnc, user.totpSecretEnc!)));
  if (result.affectedRows !== 1) throw new AuthInputError("Setup changed in another window. Start again.", "code");

  await audit("auth.2fa.enabled", { userId: user.id, target: user.id, ip: ctx.ip });
  return { recoveryCodes: codes };
}

/** Replaces all recovery codes after verifying a current authenticator code. */
export async function regenerateRecoveryCodes(
  userId: string,
  code: string,
  ctx: { ip?: string | null } = {},
): Promise<{ recoveryCodes: string[] }> {
  const rl = await limits.mfaManage(userId);
  if (!rl.ok) throw new AuthInputError("Too many attempts. Wait a few minutes and try again.", "code");
  const check = await verifySecondFactor(userId, { method: "totp", code });
  if (!check.ok) throw new AuthInputError("That code didn't match.", "code");
  const { codes, hashes } = generateRecoveryCodes();
  await db.update(users).set({ recoveryCodes: hashes }).where(and(eq(users.id, userId), eq(users.totpEnabled, true)));
  await audit("auth.2fa.recovery_regenerated", { userId, target: userId, ip: ctx.ip });
  return { recoveryCodes: codes };
}

/**
 * Turns 2FA off. Requires the account password and a current code (authenticator or recovery).
 * The caller must rotate the current session.
 */
export async function disableTwoFactor(
  userId: string,
  password: string,
  second: SecondFactorInput,
  ctx: { ip?: string | null } = {},
): Promise<void> {
  const rl = await limits.mfaManage(userId);
  if (!rl.ok) throw new AuthInputError("Too many attempts. Wait a few minutes and try again.");
  const user = await getUserById(userId);
  if (!user || user.disabled) throw new AuthInputError("Your account is not available.");
  if (!user.totpEnabled) return;
  if (!(await verifyPassword(password, user.passwordHash))) throw new AuthInputError("Your password is incorrect.", "password");
  const check = await verifySecondFactor(userId, second);
  if (!check.ok) throw new AuthInputError("That code didn't match.", "code");
  await db
    .update(users)
    .set({ totpEnabled: false, totpSecretEnc: null, recoveryCodes: null })
    .where(eq(users.id, userId));
  await audit("auth.2fa.disabled", { userId, target: userId, ip: ctx.ip });
}
