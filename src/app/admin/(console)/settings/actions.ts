"use server";
/**
 * Platform settings actions of the console (P1 CONSOLE; platform.md PLA-§3.3, §13, §17, §M.1). A platform action
 * file (lint L9). Each write takes the sheet's `opId` (PLA-§4.5) and ends with `refresh()`.
 *
 *   await savePlatformSettingsAction({ section: "signup", patch: { mode: "open" }, typed: "open", opId });
 *   await saveTurnstileAction({ siteKey, secretKey });            // ↑; the secret is never answered
 *   await createInviteCodeAction({ label, usesMax, expiresInDays });   // signups.decide (daily ops, PLA-§3.3)
 *   await publishLegalAction({ id, acknowledge: true, typed: "publish unreviewed" });
 *
 * The typed confirmations (`open`, `allow orange`, `publish unreviewed`) and the Turnstile gate of Approval / Open
 * (`turnstile_required`) are checked on the server, in src/lib/platform/settings-admin.ts and legal.ts.
 */
import { headers } from "next/headers";
import { AuthRefusal } from "@/lib/auth/errors";
import { platformTurnstileKeys } from "@/lib/auth/platform-config";
import { verifyTurnstile } from "@/lib/orders/turnstile";
import { isBackupDownloadReason, saveBackupRetention } from "@/lib/platform/backups";
import type { BrandMatch } from "@/lib/platform/brand-check";
import { markLegalReviewed, publishLegal, retireLegal, saveLegalDraft } from "@/lib/platform/legal";
import { done, opOf, withOp } from "@/lib/platform/op-dedupe";
import { platformAction } from "@/lib/platform/seam";
import { checkBrandName, deleteProtectedBrand, savePlatformDesign, savePlatformSettings, saveProtectedBrand, saveTurnstile, type SettingsSection } from "@/lib/platform/settings-admin";
import { createInviteCode, dropWaitlist, inviteWaitlist, revokeInviteCode, type WaitlistInvite } from "@/lib/platform/signup-admin";
import { clientIp } from "@/lib/security/ip";
import type { ActionResult } from "@/lib/tenancy/types";

type Op = { opId?: string };

/* ------------------------------------------------------------------ */
/* General, sign-up, health and lifecycle sections (PLA-§13.1, §13.2)  */
/* ------------------------------------------------------------------ */

/** `platform.settings`: one section's patch (validated whole; audited `platform.settings.updated`); answers the changed paths. */
export async function savePlatformSettingsAction(input: { section: SettingsSection; patch: Record<string, unknown>; typed?: string } & Op): Promise<ActionResult<{ changed: string[] }>> {
  return platformAction("platform.settings", (ctx) => withOp(ctx, opOf(input), async () => done(await savePlatformSettings(ctx, input))));
}

/** `platform.settings`: P6's design gates group (`platform_design`, validated by its own schema; audited `platform.design.changed`). */
export async function savePlatformDesignAction(input: { value: unknown } & Op): Promise<ActionResult<{ changed: string[] }>> {
  return platformAction("platform.settings", (ctx) => withOp(ctx, opOf(input), async () => done(await savePlatformDesign(ctx, input?.value))));
}

/** `platform.settings` ↑: the platform Turnstile widget keys (an empty secret keeps the stored one). */
export async function saveTurnstileAction(input: { siteKey: string; secretKey?: string } & Op): Promise<ActionResult<{ siteKey: string; secret: "set" | "not_set" }>> {
  return platformAction("platform.settings", (ctx) => withOp(ctx, opOf(input), async () => done(await saveTurnstile(ctx, input))), { stepUp: true });
}

/**
 * `platform.settings` (PLA-§13.2 Turnstile tab "Test"): verifies a token from the embedded test widget against the
 * stored secret (`not_set` without a configured widget); nothing is stored.
 */
export async function testTurnstileAction(input: { token: string }): Promise<ActionResult<{ result: "ok" | "failed" | "unverified" | "not_set" }>> {
  return platformAction("platform.settings", async () => {
    const keys = await platformTurnstileKeys();
    if (!keys) return done({ result: "not_set" as const });
    const token = typeof input?.token === "string" ? input.token.slice(0, 2_048) : "";
    if (!token) throw new AuthRefusal("invalid", "console.turnstile.no_token");
    return done({ result: await verifyTurnstile(keys.secretKey, token, clientIp(await headers())) });
  });
}

/* ------------------------------------------------------------------ */
/* Invite codes and the waitlist (PLA-§3.3; signups.decide)            */
/* ------------------------------------------------------------------ */

/** `signups.decide`: a platform invite code, answered once (the database keeps its keyed hash only). */
export async function createInviteCodeAction(input: { label: string; usesMax?: number; expiresInDays?: 7 | 30 | 90 | null; autoApprove?: boolean } & Op): Promise<ActionResult<{ id: string; code: string; expiresAt: string | null }>> {
  return platformAction("signups.decide", (ctx) => withOp(ctx, opOf(input), async () => done(await createInviteCode(ctx, input))));
}

/** `signups.decide`: revoke a code (idempotent). */
export async function revokeInviteCodeAction(input: { id: string }): Promise<ActionResult<{ revoked: true }>> {
  return platformAction("signups.decide", async (ctx) => {
    await revokeInviteCode(ctx, input?.id);
    return done({ revoked: true as const });
  });
}

/** `signups.decide`: invite waitlist rows (≤ 100 per call), each with its own code to send. */
export async function inviteWaitlistAction(input: { ids: string[] } & Op): Promise<ActionResult<{ invited: WaitlistInvite[]; skipped: string[] }>> {
  return platformAction("signups.decide", (ctx) => withOp(ctx, opOf(input), async () => done(await inviteWaitlist(ctx, input))));
}

/** `signups.decide`: drop waitlist rows. */
export async function dropWaitlistAction(input: { ids: string[] } & Op): Promise<ActionResult<{ dropped: number }>> {
  return platformAction("signups.decide", (ctx) => withOp(ctx, opOf(input), async () => done(await dropWaitlist(ctx, input))));
}

/* ------------------------------------------------------------------ */
/* Protected brands (PLA-§13.3)                                        */
/* ------------------------------------------------------------------ */

/** `platform.settings`: add or edit a term (seeded rows can be disabled, never deleted). */
export async function saveProtectedBrandAction(
  input: { id?: string; term: string; kind: "brand" | "bank" | "carrier" | "gov" | "platform" | "offensive"; match?: "exact" | "substring"; active?: boolean; note?: string } & Op,
): Promise<ActionResult<{ id: string; created: boolean }>> {
  return platformAction("platform.settings", (ctx) => withOp(ctx, opOf(input), async () => done(await saveProtectedBrand(ctx, input))));
}

/** `platform.settings`: delete a staff-added term. */
export async function deleteProtectedBrandAction(input: { id: string } & Op): Promise<ActionResult<{ deleted: boolean }>> {
  return platformAction("platform.settings", (ctx) => withOp(ctx, opOf(input), async () => done(await deleteProtectedBrand(ctx, input))));
}

/** `platform.settings` (read): the "Check a name" box. */
export async function checkBrandNameAction(input: { value: string }): Promise<ActionResult<{ storeName: BrandMatch; handle: BrandMatch }>> {
  return platformAction("platform.settings", (ctx) => checkBrandName(ctx, input));
}

/* ------------------------------------------------------------------ */
/* Legal documents (PLA-§13.4; legal.manage)                           */
/* ------------------------------------------------------------------ */

/** `legal.manage`: save a draft (a new version, or the open draft of that kind and locale). */
export async function saveLegalDraftAction(input: Record<string, unknown> & Op): Promise<ActionResult<{ id: string; version: number; created: boolean }>> {
  return platformAction("legal.manage", (ctx) => withOp(ctx, opOf(input), async () => done(await saveLegalDraft(ctx, input))));
}

/** `legal.manage`: mark a version reviewed by a lawyer (the typed word of PLA-§13.4). */
export async function markLegalReviewedAction(input: { id: string; typed?: string } & Op): Promise<ActionResult<{ changed: boolean }>> {
  return platformAction("legal.manage", (ctx) => withOp(ctx, opOf(input), async () => done(await markLegalReviewed(ctx, input))));
}

/** `legal.manage`: publish a draft (an unreviewed one needs `acknowledge` and the typed words `publish unreviewed`). */
export async function publishLegalAction(input: { id: string; acknowledge?: boolean; typed?: string } & Op): Promise<ActionResult<{ id: string; version: number; retired: number; unreviewed: boolean }>> {
  return platformAction("legal.manage", (ctx) => withOp(ctx, opOf(input), async () => done(await publishLegal(ctx, input))));
}

/** `legal.manage`: retire a published version. */
export async function retireLegalAction(input: { id: string } & Op): Promise<ActionResult<{ retired: boolean }>> {
  return platformAction("legal.manage", (ctx) => withOp(ctx, opOf(input), async () => done(await retireLegal(ctx, input))));
}

/* ------------------------------------------------------------------ */
/* Backups (PLA-§17)                                                   */
/* ------------------------------------------------------------------ */

/** `backups.manage` ↑: the retention (daily 3-30, weekly 1-12). */
export async function saveBackupRetentionAction(input: { daily: number; weekly: number } & Op): Promise<ActionResult<{ changed: boolean }>> {
  return platformAction("backups.manage", (ctx) => withOp(ctx, opOf(input), async () => done(await saveBackupRetention(ctx, input))), { stepUp: true });
}

/**
 * `backups.manage` ↑ (PLA-§17 "Download ↑ with a reason"): the step-up happens here, then the browser follows the
 * answered URL (`GET /api/admin/backups/<day>?reason=`), whose guard checks the fresh step-up again and records the
 * download with its reason.
 */
export async function prepareBackupDownloadAction(input: { day: string; reason: string }): Promise<ActionResult<{ url: string }>> {
  return platformAction(
    "backups.manage",
    async () => {
      const day = typeof input?.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.day) ? input.day : null;
      if (!day) throw new AuthRefusal("invalid", "console.backups.day_invalid");
      if (!isBackupDownloadReason(input?.reason)) throw new AuthRefusal("invalid", "console.backups.reason_required");
      return done({ url: `/api/admin/backups/${day}?reason=${input.reason}` });
    },
    { stepUp: true },
  );
}
