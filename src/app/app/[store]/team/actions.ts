"use server";
/**
 * `/app/<h>/team` (docs/STORE-SAAS.md §B.5; PLA-§22.4): every action is `storeAction(...)`, its store read from the
 * proxy-signed path (D2), never from input. The functions behind them are src/lib/tenancy/invites.ts.
 *
 *   createInviteAction     members.invite      s:<sid>:invite 20/day for the whole store
 *   revokeInviteAction     members.invite
 *   changeMemberRoleAction members.manage      ↑ step-up when the new role is admin or owner
 *   setMemberStatusAction  members.manage
 *   removeMemberAction     members.manage
 *   leaveStoreAction       store.read          the last owner is refused
 */
import { z } from "zod";
import { STORE_ROLES } from "@/lib/auth/permissions";
import { changeMemberRole, createInvite, leaveStore, removeMember, revokeInvite, setMemberStatus } from "@/lib/tenancy/invites";
import { storeAction } from "@/lib/tenancy/seam";
import type { ActionResult } from "@/lib/tenancy/types";

const InviteInput = z.object({ email: z.string().max(400), role: z.enum(STORE_ROLES), note: z.string().max(800).optional() });
const UserRef = z.object({ userId: z.string().max(40) });

export async function createInviteAction(input: unknown): Promise<ActionResult<{ inviteId: string; url: string; expiresAt: string }>> {
  return storeAction(
    "members.invite",
    async (ctx) => {
      const r = await createInvite(ctx, InviteInput.parse(input));
      return { inviteId: r.inviteId, url: r.url, expiresAt: r.expiresAt.toISOString() };
    },
    { rate: { name: "invite", limit: 20, windowSec: 86_400, per: "store" } },
  );
}

export async function revokeInviteAction(input: unknown): Promise<ActionResult<null>> {
  return storeAction("members.invite", async (ctx) => {
    await revokeInvite(ctx, z.object({ inviteId: z.string().max(40) }).parse(input).inviteId);
    return null;
  });
}

export async function changeMemberRoleAction(input: unknown): Promise<ActionResult<{ role: string }>> {
  return storeAction("members.manage", (ctx) => changeMemberRole(ctx, UserRef.extend({ role: z.enum(STORE_ROLES) }).parse(input)));
}

export async function setMemberStatusAction(input: unknown): Promise<ActionResult<{ status: "active" | "suspended" }>> {
  return storeAction("members.manage", (ctx) => setMemberStatus(ctx, UserRef.extend({ status: z.enum(["active", "suspended"]) }).parse(input)));
}

export async function removeMemberAction(input: unknown): Promise<ActionResult<null>> {
  return storeAction("members.manage", async (ctx) => {
    await removeMember(ctx, UserRef.parse(input));
    return null;
  });
}

export async function leaveStoreAction(): Promise<ActionResult<null>> {
  return storeAction("store.read", async (ctx) => {
    await leaveStore(ctx);
    return null;
  });
}
