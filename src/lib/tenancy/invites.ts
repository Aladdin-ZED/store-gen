import "server-only";
/**
 * Store members and invites (docs/STORE-SAAS.md §B.5; platform.md PLA Q.11, Q.19). An invite token is
 * `newToken(32)`, stored as its sha256 (`store_invites.token_hash`), valid 7 days, single use, bound to the e-mail
 * (D10), consumed by one conditional UPDATE (SEC-24); creating one for an existing account, member or pending invite
 * answers exactly as for a new e-mail (no enumeration). The invite token lookup is the one public-key resolver of
 * this file (`// tenancy: public-key invite`).
 *
 * Signatures frozen at C0a; T2 implements the bodies (§K.1).
 */
import type { StoreRole } from "@/lib/auth/permissions";
import type { StoreCtx, StoreScope } from "./types";

export interface InviteSummary {
  id: string;
  emailMasked: string;
  role: StoreRole;
  invitedBy: { userId: string; name: string };
  expiresAt: Date;
  state: "pending" | "accepted" | "revoked" | "expired";
  createdAt: Date;
}

export interface InvitePreview {
  storeName: string;
  storeLogoKey: string | null;
  role: StoreRole;
  emailMasked: string;
}

export interface NewAccountInput {
  email: string;
  name: string;
  password: string;
  phone?: string;
  locale: "ar" | "fr" | "en";
}

/** One member row for the team page and the console's Team tab (e-mails per PD35). */
export interface MemberSummary {
  userId: string;
  name: string;
  email: string;
  role: StoreRole;
  status: "active" | "suspended";
  totpEnabled: boolean;
  joinedAt: Date;
  lastActiveAt: Date | null;
  invitedBy: string | null;
}

function notImplemented(fn: string, ...args: unknown[]): never {
  void args;
  throw new Error(`not implemented: T2 (${fn})`);
}

/** `members.invite`; `role ∈ invitableRoles(inviter)`, `members_max` / `agents_max`, ≤ 20 pending, `s:<sid>:invite` 20/day. */
export async function createInvite(ctx: StoreCtx, input: { email: string; role: StoreRole; note?: string }): Promise<{ inviteId: string; url: string /* shown once */; expiresAt: Date }> {
  return notImplemented("createInvite", ctx, input);
}

export async function revokeInvite(ctx: StoreCtx, inviteId: string): Promise<void> {
  return notImplemented("revokeInvite", ctx, inviteId);
}

/** masked e-mail, role, inviter, expiry, state */
export async function listInvites(ctx: StoreCtx): Promise<InviteSummary[]> {
  return notImplemented("listInvites", ctx);
}

/** store name + logo, role, masked e-mail; null for an unknown, used, revoked or expired token (one answer). */
export async function previewInvite(token: string): Promise<InvitePreview | null> {
  return notImplemented("previewInvite", token);
}

/** Idempotent for an existing member; the limits are checked again inside the transaction. */
export async function acceptInvite(token: string, as: { userId: string } | NewAccountInput): Promise<{ storeHandle: string }> {
  return notImplemented("acceptInvite", token, as);
}

/** PLA Q.19: the member's own membership; the last owner is refused; audit store.member.removed with `self: true`. */
export async function leaveStore(ctx: StoreCtx): Promise<void> {
  return notImplemented("leaveStore", ctx);
}

/** PLA Q.11: the console (platformScope) and the health job (systemScope) read a store's members through the scope. */
export async function listMembersByScope(scope: StoreScope): Promise<MemberSummary[]> {
  return notImplemented("listMembersByScope", scope);
}

/** PLA Q.11: pending and recent invites of a store, e-mails masked. */
export async function listInvitesByScope(scope: StoreScope): Promise<InviteSummary[]> {
  return notImplemented("listInvitesByScope", scope);
}
