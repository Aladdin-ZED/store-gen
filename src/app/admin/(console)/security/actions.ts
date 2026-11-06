"use server";
/**
 * Security centre actions of the console (P1 CONSOLE; platform.md PLA-§14, §M.1, PD7). A platform action file
 * (lint L9). `staff.manage` and `stores.purge` carry the step-up in the permission matrix, so the seam answers
 * `step_up` first; the sheet re-sends with the same `opId` (PLA-§4.5).
 *
 *   const { url } = await inviteStaffAction({ email, role: "support", opId });   // shown once, 72 h, single use
 *   await setStaffRoleAction({ userId, role: "super_admin", reason });          // → a platform request (four-eyes / 24 h)
 *   await confirmPlatformRequestAction({ requestId, typedHandle });            // a second staff member (PD7)
 *   await markBreakGlassReviewedAction({ week: "2026-W44" });                  // audit.platform
 */
import { markBreakGlassReviewed } from "@/lib/platform/audit-log";
import { done, opOf, withOp } from "@/lib/platform/op-dedupe";
import { cancelPlatformRequest, confirmPlatformRequest } from "@/lib/platform/platform-requests";
import { platformAction } from "@/lib/platform/seam";
import { inviteStaff, removeStaff, revokeStaffInvite, setStaffRole, signOutAllStaffExcept } from "@/lib/platform/staff";
import type { ActionResult } from "@/lib/tenancy/types";

type Op = { opId?: string };

/** `staff.manage` ↑: a staff invite for one e-mail (72 h, single use, ≤ 10 pending); the link is answered once. */
export async function inviteStaffAction(input: { email: string; role: "admin" | "support" | "analyst"; note?: string | null } & Op): Promise<ActionResult<{ inviteId: string; url: string; expiresAt: string }>> {
  return platformAction("staff.manage", (ctx) => withOp(ctx, opOf(input), async () => done(await inviteStaff(ctx, input))), { stepUp: true });
}

/** `staff.manage` ↑: revoke a pending invite. */
export async function revokeStaffInviteAction(input: { inviteId: string } & Op): Promise<ActionResult<{ revoked: boolean }>> {
  return platformAction("staff.manage", (ctx) => withOp(ctx, opOf(input), async () => done(await revokeStaffInvite(ctx, input))), { stepUp: true });
}

/** `staff.manage` ↑: a staff member's role (super_admin becomes a platform request; the last super_admin stays). */
export async function setStaffRoleAction(input: { userId: string; role: "super_admin" | "admin" | "support" | "analyst"; reason: string } & Op): Promise<ActionResult<Awaited<ReturnType<typeof setStaffRole>>>> {
  return platformAction("staff.manage", (ctx) => withOp(ctx, opOf(input), async () => done(await setStaffRole(ctx, input))), { stepUp: true });
}

/** `staff.manage` ↑: a staff member goes back to a plain account; their sessions end. */
export async function removeStaffAction(input: { userId: string; reason: string } & Op): Promise<ActionResult<{ removed: boolean; sessions: number }>> {
  return platformAction("staff.manage", (ctx) => withOp(ctx, opOf(input), async () => done(await removeStaff(ctx, input))), { stepUp: true });
}

/** `staff.manage` ↑: every other staff session ends (audit `platform.staff.signed_out_all`). */
export async function signOutAllStaffAction(input: Op = {}): Promise<ActionResult<{ staff: number; sessions: number }>> {
  return platformAction("staff.manage", (ctx) => withOp(ctx, opOf(input), async () => done(await signOutAllStaffExcept(ctx))), { stepUp: true });
}

/**
 * The second staff member's confirmation of a pending platform request (PD7): `stores.purge` ↑ for a purge (with the
 * typed handle), `staff.manage` ↑ for a super_admin promotion (checked per request in platform-requests.ts); the
 * requester can never confirm their own.
 */
export async function confirmPlatformRequestAction(input: { requestId: string; typedHandle?: string } & Op): Promise<ActionResult<{ status: "confirmed"; executeAfter: string }>> {
  return platformAction("stores.purge", (ctx) => withOp(ctx, opOf(input), async () => done(await confirmPlatformRequest(ctx, input))), { stepUp: true });
}

/** Cancel a pending platform request (the requester or any super_admin, ↑). */
export async function cancelPlatformRequestAction(input: { requestId: string } & Op): Promise<ActionResult<{ status: "cancelled" }>> {
  return platformAction("stores.purge", (ctx) => withOp(ctx, opOf(input), async () => done(await cancelPlatformRequest(ctx, input))), { stepUp: true });
}

/** `audit.platform`: "Mark this week reviewed" on the break-glass log (`platform.breakglass.reviewed { week }`). */
export async function markBreakGlassReviewedAction(input: { week?: string } = {}): Promise<ActionResult<{ week: string; changed: boolean }>> {
  return platformAction("audit.platform", async (ctx) => done(await markBreakGlassReviewed(ctx, input)));
}
