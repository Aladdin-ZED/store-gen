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
import { desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import { auditFrom } from "@/lib/audit";
import { AuthRefusal } from "@/lib/auth/errors";
import type { StoreRole } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { storeInvites, storeMembers, users } from "@/lib/db/schema";
import { PLATFORM_READ_ONLY, memberWriteScope, platformReadOnly } from "./seam";
import { whereStore } from "./sql";
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

/** "salma.b@gmail.com" → "s•••@gmail.com" (the PLA-§7.2 rule; an invite list never shows the full address). */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0) return "•••";
  return `${email.slice(0, 1)}•••${email.slice(at)}`;
}

/**
 * PLA Q.19: the member's own membership; the last owner is refused (`last_owner`: transfer ownership or close the
 * store instead); audit store.member.removed with `self: true`. Refused under impersonation and while the platform
 * is read-only. The store's owner rows are locked first, so two owners leaving at once can't both go.
 *
 *   export async function leaveStoreAction() { return storeAction(null, (ctx) => leaveStore(ctx)); }
 */
export async function leaveStore(ctx: StoreCtx): Promise<void> {
  const scope = memberWriteScope(ctx);
  if (await platformReadOnly()) throw new AuthRefusal("read_only", PLATFORM_READ_ONLY);
  const role = await db.transaction(async (tx) => {
    const owners = await tx
      .select({ userId: storeMembers.userId, status: storeMembers.status })
      .from(storeMembers)
      .where(whereStore(storeMembers, scope, eq(storeMembers.role, "owner")))
      .for("update");
    const [mine] = await tx
      .select({ role: storeMembers.role })
      .from(storeMembers)
      .where(whereStore(storeMembers, scope, eq(storeMembers.userId, ctx.user.id)))
      .for("update");
    if (!mine) throw new AuthRefusal("not_found");
    if (mine.role === "owner" && !owners.some((o) => o.userId !== ctx.user.id && o.status === "active")) throw new AuthRefusal("last_owner", "team.leave.last_owner");
    await tx.delete(storeMembers).where(whereStore(storeMembers, scope, eq(storeMembers.userId, ctx.user.id)));
    return mine.role;
  });
  await auditFrom(ctx, "store.member.removed", { target: ctx.user.id, meta: { self: true, role } });
}

/** PLA Q.11: the console (platformScope) and the health job (systemScope) read a store's members through the scope. */
export async function listMembersByScope(scope: StoreScope): Promise<MemberSummary[]> {
  const rows = await db
    .select({
      userId: storeMembers.userId,
      name: users.name,
      email: users.email,
      role: storeMembers.role,
      status: storeMembers.status,
      totpEnabled: users.totpEnabled,
      joinedAt: storeMembers.joinedAt,
      lastActiveAt: storeMembers.lastActiveAt,
      invitedBy: storeMembers.invitedBy,
    })
    .from(storeMembers)
    .innerJoin(users, eq(users.id, storeMembers.userId))
    .where(whereStore(storeMembers, scope))
    .orderBy(storeMembers.joinedAt)
    .limit(500);
  return rows;
}

const INVITE_LIST_MAX = 100;

/** The state of an invite row at `now`. */
export function inviteState(row: { acceptedAt: Date | null; revokedAt: Date | null; expiresAt: Date }, now = Date.now()): InviteSummary["state"] {
  if (row.acceptedAt) return "accepted";
  if (row.revokedAt) return "revoked";
  return row.expiresAt.getTime() <= now ? "expired" : "pending";
}

/** PLA Q.11: pending and recent invites of a store, e-mails masked. */
export async function listInvitesByScope(scope: StoreScope): Promise<InviteSummary[]> {
  const inviter = alias(users, "inviter");
  const rows = await db
    .select({
      id: storeInvites.id,
      emailNorm: storeInvites.emailNorm,
      role: storeInvites.role,
      invitedById: storeInvites.invitedBy,
      invitedByName: inviter.name,
      expiresAt: storeInvites.expiresAt,
      acceptedAt: storeInvites.acceptedAt,
      revokedAt: storeInvites.revokedAt,
      createdAt: storeInvites.createdAt,
    })
    .from(storeInvites)
    .leftJoin(inviter, eq(inviter.id, storeInvites.invitedBy))
    .where(whereStore(storeInvites, scope))
    .orderBy(desc(storeInvites.createdAt))
    .limit(INVITE_LIST_MAX);
  const now = Date.now();
  return rows.map((r) => ({
    id: r.id,
    emailMasked: maskEmail(r.emailNorm),
    role: r.role,
    invitedBy: { userId: r.invitedById, name: r.invitedByName ?? "" },
    expiresAt: r.expiresAt,
    state: inviteState(r, now),
    createdAt: r.createdAt,
  }));
}
