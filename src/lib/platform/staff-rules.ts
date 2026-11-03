/**
 * Staff and staff invites, the pure rules (platform.md PLA-§14.1, PLA-§2.2 `staff_invites`; PD13, PD7; core §B.5 rev 3,
 * §B.7). Isomorphic and selftested: the invite's state and lifetime, a staff row's state on the Staff table, the
 * roles an invite may carry, and the invariant that keeps one active super_admin with TOTP. src/lib/platform/staff.ts
 * reads and writes.
 *
 *   staffInviteState(row, now)                 // "valid" | "expired" | "revoked" | "used"
 *   leavesNoSuperAdmin(superAdmins, targetId)  // true: the last active super_admin with TOTP (refused last_super_admin)
 */
import type { PlatformRole } from "@/lib/auth/permissions";

/** PLA-§L: a staff invite lives 72 h, single use */
export const STAFF_INVITE_TTL_MS = 72 * 3_600_000;
/** PLA-§L: at most this many pending staff invites on the platform */
export const STAFF_INVITES_PENDING_MAX = 10;
/** PLA-§14.1: an invite names one of these; super_admin is only reached through a platform request (PD7) */
export const INVITABLE_STAFF_ROLES = ["admin", "support", "analyst"] as const;
export type InvitableStaffRole = (typeof INVITABLE_STAFF_ROLES)[number];
/** the roles a role change may set directly (super_admin goes through requestSuperAdminPromotion) */
export const DIRECT_STAFF_ROLES: readonly PlatformRole[] = INVITABLE_STAFF_ROLES;

export const isInvitableStaffRole = (v: unknown): v is InvitableStaffRole => typeof v === "string" && (INVITABLE_STAFF_ROLES as readonly string[]).includes(v);

export type StaffInviteState = "valid" | "expired" | "revoked" | "used";

/** The state of an invite at `now`: used > revoked > expired > valid (what the public page and the table say). */
export function staffInviteState(row: { acceptedAt: Date | null; revokedAt: Date | null; expiresAt: Date }, now: Date): StaffInviteState {
  if (row.acceptedAt) return "used";
  if (row.revokedAt) return "revoked";
  return row.expiresAt.getTime() <= now.getTime() ? "expired" : "valid";
}

/** PLA-§14.1: Active (TOTP on), Waiting for 2FA (a role without TOTP: the console stays closed), or Invited. */
export type StaffState = "active" | "waiting_2fa" | "invited";

export const staffStateOf = (user: { totpEnabled: boolean }): StaffState => (user.totpEnabled ? "active" : "waiting_2fa");

/** One super_admin as the invariant reads it. */
export interface SuperAdminFact {
  id: string;
  totpEnabled: boolean;
  disabled: boolean;
}

/**
 * Would demoting or removing `targetId` leave no active super_admin with TOTP (PLA-§14.1 invariant)? A target that
 * is not one of them changes nothing.
 */
export function leavesNoSuperAdmin(superAdmins: readonly SuperAdminFact[], targetId: string): boolean {
  const usable = superAdmins.filter((s) => s.totpEnabled && !s.disabled);
  if (!usable.some((s) => s.id === targetId)) return false;
  return usable.length <= 1;
}
