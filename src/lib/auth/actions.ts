"use server";
/**
 * Shared auth server actions (docs/STORE-SAAS.md §B.4, §B.8). Usage in any dashboard, console or account component:
 *
 *   <form action={logout}><button type="submit">Sign out</button></form>
 *   await setLastStoreAction(storeId);                        // the store switcher's choice (§B.4)
 *   await endImpersonationAction();                           // the view-as ribbon's End (§B.8)
 *   await createInviteCodeAction({ label: "Atlas Argan" });    // the console's R1.0 invite code (§B.6), shown once
 *
 * Server Functions are reachable by their id from any route: each one checks the origin itself and acts only on the
 * caller's own session.
 */
import { redirect } from "next/navigation";
import { endImpersonation, startImpersonation, type ImpersonationReason } from "@/lib/platform/impersonation";
import { platformAction, requirePlatform } from "@/lib/platform/seam";
import { resolveStoreByHandle } from "@/lib/tenancy/public";
import { assertActionOrigin } from "@/lib/tenancy/seam";
import type { ActionResult } from "@/lib/tenancy/types";
import { consoleHref } from "@/lib/urls";
import { FieldsError } from "./errors";
import { createPlatformInvite } from "./platform-invites";
import { signOut, userAction } from "./index";
import { rememberLastStore } from "./landing";
import { LOGIN_PATH } from "./paths";

/** Ends this browser's session (any area: the dashboard, the console, the account pages). */
export async function logout(): Promise<void> {
  await assertActionOrigin();
  await signOut();
  redirect(`${LOGIN_PATH}?notice=signed-out`);
}

/** The step-up sheet (§B.7): a TOTP code (staff always; tenants with 2FA), bucket p:mfa:stepup:<userId>. */
export async function stepUpTotpAction(code: string): Promise<ActionResult<{ until: string }>> {
  return userAction(async (ctx) => (await import("./step-up")).stepUpWithTotp(ctx, code));
}

/** The tenant ladder's password re-entry for an account without TOTP (SEC-17); refused under impersonation. */
export async function stepUpPasswordAction(password: string): Promise<ActionResult<{ until: string }>> {
  return userAction(async (ctx) => (await import("./step-up")).stepUpWithPassword(ctx, password));
}

/** The switcher's choice as the session's picker hint; never an authorisation (the seam re-checks every request). */
export async function setLastStoreAction(storeId: string): Promise<ActionResult<{ remembered: boolean }>> {
  return userAction(async (ctx) => ({ remembered: await rememberLastStore(ctx, storeId) }));
}

/**
 * "Start read-only view" (PLA-§10.1; `stores.impersonate`): by store handle from the console's R1.0 home (P1's store
 * profile passes the id). Answers the URL to open; refusals carry their code (`impersonation_member`, `impersonation_state`).
 */
export async function startImpersonationAction(input: { handle: string; reason: ImpersonationReason; note?: string; ticketRef?: string; minutes?: 15 | 30 | 60 }): Promise<ActionResult<{ url: string }>> {
  return platformAction("stores.impersonate", async (ctx) => {
    const store = typeof input?.handle === "string" ? await resolveStoreByHandle(input.handle.trim().toLowerCase().replace(/^@/, "")) : null;
    if (!store) throw new FieldsError({ handle: "console.impersonation.no_store" });
    return startImpersonation(ctx, { storeId: store.id, reason: input.reason, note: input.note, ticketRef: input.ticketRef, minutes: input.minutes });
  });
}

/**
 * The ribbon's and the console chip's End (PLA-§10.3): ends this session's view-as and returns to the console. A
 * session without one just lands on the console.
 */
export async function endImpersonationAction(): Promise<void> {
  await assertActionOrigin();
  const ctx = await requirePlatform({ permission: "stores.impersonate" });
  await endImpersonation(ctx, "ended");
  redirect(consoleHref());
}

/**
 * The console home's invite code form in R1.0 (§B.6; `signups.decide`): one platform invite code, answered once (the
 * database keeps its keyed hash only). P1's Settings → Signup replaces the form and keeps this call.
 */
export async function createInviteCodeAction(input: { label: string; usesMax?: number; expiresInDays?: 7 | 30 | 90 | null }): Promise<ActionResult<{ code: string; expiresAt: string | null }>> {
  return platformAction("signups.decide", async (ctx) => {
    const usesMax = typeof input?.usesMax === "number" ? input.usesMax : 1;
    const days = input?.expiresInDays === 7 || input?.expiresInDays === 30 || input?.expiresInDays === 90 ? input.expiresInDays : input?.expiresInDays === null ? null : 30;
    const created = await createPlatformInvite(ctx, { label: typeof input?.label === "string" ? input.label : "", usesMax, expiresInDays: days });
    return { code: created.code, expiresAt: created.expiresAt ? created.expiresAt.toISOString() : null };
  });
}
