import "server-only";
/**
 * The store profile's Team tab and Overview strip 5 (platform.md PLA-§7.6, §7.3 strip 5; PL-07, PD34, PD35):
 * members (name, e-mail per PD35, role, status, 2FA, last active, joined, invited by), pending invites (masked
 * e-mail, role, inviter, expiry, state), the 2FA coverage ("3 of 4 with 2FA"), the store's `require_member_2fa` and
 * the agents online now (P4's `queueCounts(scope).liveAgents`; "unavailable" while P4's stub is in place).
 *
 *   const team = await getStoreTeam(ctx, storeId);
 *
 * Reads through `platformScope(ctx, storeId)` and T2's `listMembersByScope` / `listInvitesByScope` (PLA Q.11). The
 * user-level actions (ban, 2FA reset, reset link, sign out) live on `/admin/users/<id>` (people.ts, PD34).
 */
import { eq } from "drizzle-orm";
import { AuthRefusal } from "@/lib/auth/errors";
import type { StoreRole } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { stores } from "@/lib/db/schema";
import { queueCounts } from "@/lib/orders/profile";
import { listInvitesByScope, listMembersByScope } from "@/lib/tenancy/invites";
import type { PlatformCtx } from "@/lib/tenancy/types";
import { sellerContact, type Masked } from "../mask";
import { optional } from "../panel";
import { platformScope } from "../seam";

export interface TeamMember {
  userId: string;
  name: string;
  email: string | Masked;
  role: StoreRole;
  status: "active" | "suspended";
  twoFactor: boolean;
  joinedAt: string;
  lastActiveAt: string | null;
  invitedBy: { id: string; name: string | null } | null;
}

export interface StoreTeam {
  members: TeamMember[];
  invites: { id: string; email: string; role: StoreRole; inviter: string; expiresAt: string; state: string; createdAt: string }[];
  byRole: Partial<Record<StoreRole, number>>;
  /** active members with TOTP / active members */
  twoFactor: { on: number; of: number; without: number };
  requireMember2fa: boolean;
  /** agents online now (P4); null while unavailable */
  agentsOnline: number | null;
}

/** PLA-§7.6 (`console.read`); null for an unknown store. */
export async function getStoreTeam(ctx: PlatformCtx, storeId: string): Promise<StoreTeam | null> {
  if (!ctx.can("console.read")) throw new AuthRefusal("forbidden");
  if (!/^[0-9A-Z]{26}$/.test(storeId)) return null;
  const [store] = await db.select({ requireMember2fa: stores.requireMember2fa }).from(stores).where(eq(stores.id, storeId)).limit(1);
  if (!store) return null;
  const scope = platformScope(ctx, storeId);
  const [members, invites, counts] = await Promise.all([listMembersByScope(scope), listInvitesByScope(scope), optional("team.agents", () => queueCounts(scope), { storeId })]);
  const nameOf = new Map(members.map((m) => [m.userId, m.name]));
  const active = members.filter((m) => m.status === "active");
  const on = active.filter((m) => m.totpEnabled).length;
  const byRole: Partial<Record<StoreRole, number>> = {};
  for (const m of active) byRole[m.role] = (byRole[m.role] ?? 0) + 1;
  return {
    members: members.map((m) => ({
      userId: m.userId,
      name: m.name,
      email: sellerContact(ctx.role, { email: m.email, phone: null }).email,
      role: m.role,
      status: m.status,
      twoFactor: m.totpEnabled,
      joinedAt: m.joinedAt.toISOString(),
      lastActiveAt: m.lastActiveAt?.toISOString() ?? null,
      invitedBy: m.invitedBy ? { id: m.invitedBy, name: nameOf.get(m.invitedBy) ?? null } : null,
    })),
    invites: invites.map((i) => ({ id: i.id, email: i.emailMasked, role: i.role, inviter: i.invitedBy.name, expiresAt: i.expiresAt.toISOString(), state: i.state, createdAt: i.createdAt.toISOString() })),
    byRole,
    twoFactor: { on, of: active.length, without: active.length - on },
    requireMember2fa: store.requireMember2fa,
    agentsOnline: counts ? counts.liveAgents : null,
  };
}
