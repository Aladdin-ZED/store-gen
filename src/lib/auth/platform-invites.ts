import "server-only";
/**
 * Platform invite codes (docs/STORE-SAAS.md §B.6, platform.md PLA-§3.3): what `invite` signup mode asks for. A code is
 * `SG-` + 12 Crockford base32 characters (~60 bits; brute force is bounded by `p:signup:ip` and Turnstile), shown
 * once and stored as a keyed hash (`platform_invites.code_hash`). Input is forgiving: case, spaces, dashes and the
 * Crockford look-alikes (O → 0, I / L → 1) normalise to one value.
 *
 * Consumption belongs to the signup transaction (src/lib/auth/signup.ts): `SELECT … FOR UPDATE`, then one conditional
 * `UPDATE … SET uses = uses + 1 WHERE … uses < uses_max AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at >
 * now)` whose `affectedRows === 1` is the only success path (SEC-24). The console tab (P1) calls the two staff
 * functions below; `signups.decide` (admin+), because codes are daily operations.
 */
import { randomBytes } from "node:crypto";
import { and, eq, gt, isNull, or, sql } from "drizzle-orm";
import { auditFrom } from "@/lib/audit";
import { db } from "@/lib/db/client";
import { newId } from "@/lib/db/ids";
import { platformInvites } from "@/lib/db/schema";
import { hmac } from "@/lib/security/crypto";
import type { PlatformCtx } from "@/lib/tenancy/types";
import { AuthRefusal, FieldsError } from "./errors";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE_LEN = 12;

/** A fresh code, e.g. "SG-7K3QX9MZ2P4D". */
export function generateInviteCode(): string {
  const bytes = randomBytes(CODE_LEN);
  let out = "";
  for (const b of bytes) out += ALPHABET[b & 31];
  return `SG-${out}`;
}

/** The 12 code characters of an input ("sg-7k3q x9mz-2p4d" → "7K3QX9MZ2P4D"), or null when it is not a code. */
export function normalizeInviteCode(input: unknown): string | null {
  if (typeof input !== "string" || input.length > 40) return null;
  let value = input.toUpperCase().replace(/[\s-]/g, "");
  if (value.startsWith("SG") && value.length === CODE_LEN + 2) value = value.slice(2);
  value = value.replace(/O/g, "0").replace(/[IL]/g, "1");
  return value.length === CODE_LEN && [...value].every((ch) => ALPHABET.includes(ch)) ? value : null;
}

export function hashInviteCode(normalized: string): string {
  return hmac(normalized, "platform-invite");
}

/** A code that can still be used, read without a lock (signup's early check; the transaction re-checks). */
export interface UsableInvite {
  id: string;
  label: string | null;
  autoApprove: boolean;
}

const usable = (now: Date) =>
  and(sql`${platformInvites.uses} < ${platformInvites.usesMax}`, isNull(platformInvites.revokedAt), or(isNull(platformInvites.expiresAt), gt(platformInvites.expiresAt, now)));

export async function findUsableInvite(code: unknown): Promise<UsableInvite | null> {
  const normalized = normalizeInviteCode(code);
  if (!normalized) return null;
  const [row] = await db
    .select({ id: platformInvites.id, label: platformInvites.label, autoApprove: platformInvites.autoApprove })
    .from(platformInvites)
    .where(and(eq(platformInvites.codeHash, hashInviteCode(normalized)), usable(new Date())))
    .limit(1);
  return row ?? null;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Inside the signup transaction: lock the row, then the conditional consumption. false = used up, revoked or expired meanwhile. */
export async function consumeInviteTx(tx: Tx, inviteId: string): Promise<boolean> {
  const now = new Date();
  await tx.select({ id: platformInvites.id }).from(platformInvites).where(eq(platformInvites.id, inviteId)).for("update");
  const [result] = await tx
    .update(platformInvites)
    .set({ uses: sql`${platformInvites.uses} + 1` })
    .where(and(eq(platformInvites.id, inviteId), usable(now)));
  return result.affectedRows === 1;
}

export interface NewPlatformInvite {
  label: string;
  /** 1-500, default 1 */
  usesMax?: number;
  /** 7, 30 or 90; null = never */
  expiresInDays?: 7 | 30 | 90 | null;
  autoApprove?: boolean;
}

/** `signups.decide`: one code, shown once (the hash is all the database keeps). Audit platform.invite.created. */
export async function createPlatformInvite(ctx: PlatformCtx, input: NewPlatformInvite): Promise<{ id: string; code: string; expiresAt: Date | null }> {
  if (!ctx.can("signups.decide")) throw new AuthRefusal("forbidden");
  const label = typeof input.label === "string" ? input.label.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 120) : "";
  const usesMax = input.usesMax ?? 1;
  const fields: Record<string, string> = {};
  if (label.length < 2) fields.label = "console.invite.label_required";
  if (!Number.isInteger(usesMax) || usesMax < 1 || usesMax > 500) fields.usesMax = "console.invite.uses_range";
  const days = input.expiresInDays ?? null;
  if (days !== null && days !== 7 && days !== 30 && days !== 90) fields.expiresInDays = "console.invite.expiry_invalid";
  if (Object.keys(fields).length) throw new FieldsError(fields);

  const code = generateInviteCode();
  const id = newId();
  const expiresAt = days === null ? null : new Date(Date.now() + days * 24 * 60 * 60_000);
  await db.insert(platformInvites).values({
    id,
    codeHash: hashInviteCode(normalizeInviteCode(code)!),
    label,
    usesMax,
    autoApprove: input.autoApprove === true,
    expiresAt,
    createdBy: ctx.user.id,
  });
  await auditFrom(ctx, "platform.invite.created", { target: id, meta: { label, usesMax, expiresAt, autoApprove: input.autoApprove === true } });
  return { id, code, expiresAt };
}

/** `signups.decide`: sets `revoked_at` (idempotent). Audit platform.invite.revoked. */
export async function revokePlatformInvite(ctx: PlatformCtx, inviteId: string): Promise<void> {
  if (!ctx.can("signups.decide")) throw new AuthRefusal("forbidden");
  const [result] = await db
    .update(platformInvites)
    .set({ revokedAt: new Date() })
    .where(and(eq(platformInvites.id, inviteId), isNull(platformInvites.revokedAt)));
  if (result.affectedRows === 1) await auditFrom(ctx, "platform.invite.revoked", { target: inviteId });
}
