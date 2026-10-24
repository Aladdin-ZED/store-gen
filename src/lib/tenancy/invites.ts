import "server-only";
/**
 * Store members and invites (docs/STORE-SAAS.md §B.5; platform.md PLA Q.11, Q.19, PLA-§22.4). An invite token is
 * `newToken(32)`, stored as its sha256 (`store_invites.token_hash`), valid 7 days, single use, bound to the e-mail
 * (D10), revocable, and consumed by one conditional UPDATE (SEC-24); creating one for an existing account, member or
 * pending invite answers exactly as for a new e-mail (no enumeration). The invite token lookup is the one public-key
 * resolver of this file (`// tenancy: public-key invite`): an accept writes through `publicScope(store)`, the store
 * the token names, never a store id from input.
 *
 *   export async function createInviteAction(input: unknown) {
 *     return storeAction("members.invite", (ctx) => createInvite(ctx, parse(input)), { rate: { name: "invite", limit: 20, windowSec: 86_400, per: "store" } });
 *   }
 *
 * Role rules: `invitableRoles(inviter)` for invites (and their revocation), `canManageMember(actor, target)` for role
 * changes, suspension and removal, plus the rank rule on the new role and the last-owner rule (a store keeps at least
 * one active owner). A role change to `admin` or `owner` needs a fresh step-up (§B.7, PD80). Every function locks
 * the store's member rows first, so two concurrent accepts, demotions or removals are serialised.
 */
import { createHash } from "node:crypto";
import { and, count, desc, eq, gt, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import { audit, auditFrom } from "@/lib/audit";
import { AuthRefusal, FieldsError } from "@/lib/auth/errors";
import { ACTIVE_STORE_ROLES, ROLE_RANK, canManageMember, invitableRoles, isStoreRole, type StoreRole } from "@/lib/auth/permissions";
import { isT1Stub } from "@/lib/auth/platform-config";
import { ACCOUNT_REFUSED, EmailInput, getUserById, insertAccount, normalizeEmail, prepareAccount } from "@/lib/auth/users";
import { db } from "@/lib/db/client";
import { newId, newToken } from "@/lib/db/ids";
import { storeInvites, storeMembers, stores, users } from "@/lib/db/schema";
import { mailer } from "@/lib/mail";
import { errorSummary } from "@/lib/orders/log";
import { notify } from "@/lib/platform/notify";
import { appHref, platformOrigin } from "@/lib/urls";
import { assertFeature, assertWithin } from "./entitlements";
import { getStoreById, publicScope } from "./public";
import { PLATFORM_READ_ONLY, SeamError, assertStepUp, memberWriteScope, platformReadOnly } from "./seam";
import { byId, storeValues, whereStore } from "./sql";
import type { StoreCtx, StoreScope, StoreStatus, WriteCtx, WriteScope } from "./types";

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

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const INVITE_TTL_MS = 7 * 86_400_000;
/** at most this many pending invites per store (§B.5) */
export const PENDING_INVITES_MAX = 20;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
/** stores a new member can join; a closed, rejected or deleted store takes no one */
const JOINABLE: ReadonlySet<StoreStatus> = new Set(["pending", "active", "restricted", "suspended"]);

/** The one answer for an unknown, used, revoked or expired link (no oracle on which). */
export const INVITE_INVALID = "team.invite.invalid";

export const hashInviteToken = (token: string): string => createHash("sha256").update(token, "utf8").digest("hex");

/** "https://<platform>/invite/<token>" */
export function inviteUrl(token: string): string {
  return `${platformOrigin()}/invite/${token}`;
}

/** "salma.b@gmail.com" → "s•••@gmail.com" (the PLA-§7.2 rule; an invite list never shows the full address). */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0) return "•••";
  return `${email.slice(0, 1)}•••${email.slice(at)}`;
}

/** The state of an invite row at `now`. */
export function inviteState(row: { acceptedAt: Date | null; revokedAt: Date | null; expiresAt: Date }, now = Date.now()): InviteSummary["state"] {
  if (row.acceptedAt) return "accepted";
  if (row.revokedAt) return "revoked";
  return row.expiresAt.getTime() <= now ? "expired" : "pending";
}

/* ------------------------------------------------------------------ */
/* T1 limits, read as "no limit" until T1 merges                        */
/* ------------------------------------------------------------------ */

let limitStubWarned = false;
function warnLimitStub(): void {
  if (limitStubWarned) return;
  limitStubWarned = true;
  console.warn("[team] members_max / agents_max and the invites feature are not enforced until T1's entitlements merge");
}

/** `assertWithin` for the seat gauges; a QuotaError propagates (`quota`, the limit sheet). */
async function assertSeats(scope: StoreScope, role: StoreRole, opts: { seatHeld?: boolean } = {}): Promise<void> {
  try {
    if (!opts.seatHeld) await assertWithin(scope, { metric: "members", period: "total" }, 1);
    if (role === "agent") await assertWithin(scope, { metric: "agents", period: "total" }, 1);
  } catch (err) {
    if (!isT1Stub(err)) throw err;
    warnLimitStub();
  }
}

async function assertInvitesFeature(scope: StoreScope): Promise<void> {
  try {
    await assertFeature(scope, "invites");
  } catch (err) {
    if (!isT1Stub(err)) throw err;
    warnLimitStub();
  }
}

/** The store's member rows, locked for the rest of the transaction (concurrent team writes queue here). */
async function lockTeam(tx: Tx, scope: StoreScope): Promise<{ userId: string; role: StoreRole; status: "active" | "suspended" }[]> {
  return tx
    .select({ userId: storeMembers.userId, role: storeMembers.role, status: storeMembers.status })
    .from(storeMembers)
    .where(whereStore(storeMembers, scope))
    .for("update");
}

const otherActiveOwner = (team: readonly { userId: string; role: StoreRole; status: string }[], userId: string) =>
  team.some((m) => m.userId !== userId && m.role === "owner" && m.status === "active");

const cleanNote = (note: unknown): string | null => {
  if (typeof note !== "string") return null;
  const value = note.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return value ? [...value].slice(0, 200).join("") : null;
};

/* ------------------------------------------------------------------ */
/* Invites                                                             */
/* ------------------------------------------------------------------ */

/**
 * `members.invite` (the caller runs it through storeAction with the `s:<sid>:invite` 20/day bucket);
 * `role ∈ invitableRoles(inviter)`, the `invites` feature, `members_max` / `agents_max`, ≤ 20 pending. Answers the
 * same for any e-mail (no enumeration); the raw token exists only in the returned URL.
 */
export async function createInvite(ctx: StoreCtx, input: { email: string; role: StoreRole; note?: string }): Promise<{ inviteId: string; url: string /* shown once */; expiresAt: Date }> {
  const scope = memberWriteScope(ctx);
  if (!ctx.can("members.invite")) throw new SeamError("forbidden");
  const fields: Record<string, string> = {};
  const email = EmailInput.safeParse(typeof input?.email === "string" ? input.email : "");
  if (!email.success) fields.email = "auth.email_invalid";
  const role = input?.role;
  if (!isStoreRole(role) || !invitableRoles(ctx.membership.role).includes(role)) fields.role = "team.invite.role_not_allowed";
  if (Object.keys(fields).length || !email.success || !isStoreRole(role)) throw new FieldsError(fields);
  const note = cleanNote(input.note);
  await assertInvitesFeature(scope);

  const token = newToken(32);
  const inviteId = newId();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + INVITE_TTL_MS);
  await db.transaction(async (tx) => {
    await lockTeam(tx, scope);
    const [pending] = await tx
      .select({ n: count() })
      .from(storeInvites)
      .where(whereStore(storeInvites, scope, isNull(storeInvites.acceptedAt), isNull(storeInvites.revokedAt), gt(storeInvites.expiresAt, now)));
    if ((pending?.n ?? 0) >= PENDING_INVITES_MAX) throw new AuthRefusal("quota", "team.invite.pending_cap");
    await assertSeats(scope, role);
    await tx.insert(storeInvites).values(
      storeValues(scope, { id: inviteId, emailNorm: email.data, role, tokenHash: hashInviteToken(token), note, invitedBy: ctx.user.id, expiresAt, createdAt: now }),
    );
  });
  await auditFrom(ctx, "store.member.invited", { target: inviteId, meta: { role, email: maskEmail(email.data) } });

  const url = inviteUrl(token);
  const m = mailer();
  if (m.enabled) {
    const locale = ctx.user.locale ?? (ctx.store.defaultLocale === "ar" || ctx.store.defaultLocale === "fr" ? ctx.store.defaultLocale : "en");
    void m
      .enqueue({
        to: email.data,
        locale,
        template: "invite",
        vars: { inviterName: ctx.user.name, storeName: ctx.store.name, role, url, expiresAt: expiresAt.toISOString().slice(0, 10) },
        storeId: ctx.store.id,
        dedupeKey: `invite:${inviteId}`,
      })
      .catch((err: unknown) => console.error("[team] invite mail:", errorSummary(err)));
  }
  return { inviteId, url, expiresAt };
}

/** A pending invite of this store; a role the revoker could not invite is refused (`forbidden`). */
export async function revokeInvite(ctx: StoreCtx, inviteId: string): Promise<void> {
  const scope = memberWriteScope(ctx);
  if (!ctx.can("members.invite")) throw new SeamError("forbidden");
  if (typeof inviteId !== "string" || !/^[0-9A-Z]{26}$/.test(inviteId)) throw new SeamError("not_found");
  const [row] = await db.select({ role: storeInvites.role }).from(storeInvites).where(byId(storeInvites, scope, inviteId)).limit(1);
  if (!row) throw new SeamError("not_found");
  if (!invitableRoles(ctx.membership.role).includes(row.role)) throw new SeamError("forbidden");
  const [cas] = await db
    .update(storeInvites)
    .set({ revokedAt: new Date() })
    .where(and(byId(storeInvites, scope, inviteId), isNull(storeInvites.acceptedAt), isNull(storeInvites.revokedAt)));
  if (cas.affectedRows !== 1) throw new AuthRefusal("conflict", "team.invite.not_pending");
  await auditFrom(ctx, "store.invite.revoked", { target: inviteId, meta: { role: row.role } });
}

/** masked e-mail, role, inviter, expiry, state */
export async function listInvites(ctx: StoreCtx): Promise<InviteSummary[]> {
  if (!ctx.can("members.read")) throw new SeamError("forbidden");
  return listInvitesByScope(ctx.scope);
}

interface LiveInvite {
  id: string;
  storeId: string;
  emailNorm: string;
  role: StoreRole;
  invitedBy: string;
  storeName: string;
  storeHandle: string;
  storeStatus: StoreStatus;
}

/** The invite a token names, while it still works and its store can take members; else null. */
async function liveInvite(token: unknown): Promise<LiveInvite | null> {
  if (typeof token !== "string" || !TOKEN_RE.test(token)) return null;
  const [row] = await db
    .select({
      id: storeInvites.id,
      storeId: storeInvites.storeId,
      emailNorm: storeInvites.emailNorm,
      role: storeInvites.role,
      invitedBy: storeInvites.invitedBy,
      storeName: stores.name,
      storeHandle: stores.handle,
      storeStatus: stores.status,
    })
    .from(storeInvites) // tenancy: public-key invite (the token is the key; the store comes from the row)
    .innerJoin(stores, eq(stores.id, storeInvites.storeId))
    .where(and(eq(storeInvites.tokenHash, hashInviteToken(token)), isNull(storeInvites.acceptedAt), isNull(storeInvites.revokedAt), gt(storeInvites.expiresAt, new Date())))
    .limit(1);
  if (!row || !row.storeHandle || !JOINABLE.has(row.storeStatus)) return null;
  return { ...row, storeHandle: row.storeHandle };
}

/** store name + logo, role, masked e-mail; null for an unknown, used, revoked or expired token (one answer). */
export async function previewInvite(token: string): Promise<InvitePreview | null> {
  const invite = await liveInvite(token);
  if (!invite) return null;
  // the brand kit (logo) arrives in R2 (brand designer): no logo key yet
  return { storeName: invite.storeName, storeLogoKey: null, role: invite.role, emailMasked: maskEmail(invite.emailNorm) };
}

/**
 * What `/invite/<token>` shows the viewer (§B.5, D10): the invitation, and which way in. Server pages only: it
 * compares the bound e-mail without ever returning it.
 */
export type InviteLanding =
  | { state: "invalid" }
  | { state: "accept"; preview: InvitePreview } // signed in with the invited e-mail
  | { state: "already_member"; preview: InvitePreview; storeHandle: string }
  | { state: "wrong_account"; preview: InvitePreview } // signed in with another e-mail
  | { state: "sign_in"; preview: InvitePreview } // an account exists for the invited e-mail
  | { state: "sign_up"; preview: InvitePreview }; // a new account with the e-mail locked

export async function inviteLanding(token: string, viewer: { id: string; email: string } | null): Promise<InviteLanding> {
  const invite = await liveInvite(token);
  if (!invite) return { state: "invalid" };
  const preview: InvitePreview = { storeName: invite.storeName, storeLogoKey: null, role: invite.role, emailMasked: maskEmail(invite.emailNorm) };
  if (viewer) {
    if (normalizeEmail(viewer.email) !== invite.emailNorm) return { state: "wrong_account", preview };
    const [member] = await db
      .select({ status: storeMembers.status })
      .from(storeMembers) // tenancy: public-key invite (the invite's own store)
      .where(and(eq(storeMembers.storeId, invite.storeId), eq(storeMembers.userId, viewer.id)))
      .limit(1);
    return member?.status === "active" ? { state: "already_member", preview, storeHandle: invite.storeHandle } : { state: "accept", preview };
  }
  const [account] = await db.select({ id: users.id }).from(users).where(eq(users.email, invite.emailNorm)).limit(1);
  return account ? { state: "sign_in", preview } : { state: "sign_up", preview };
}

/**
 * Idempotent for an existing member (no second membership, the role unchanged); the limits are checked again inside
 * the transaction, after the member rows are locked. A new account is created with the invited e-mail (whatever the
 * form sent: D10) in the same transaction, `users` first; an e-mail that already has an account must sign in.
 */
export async function acceptInvite(
  token: string,
  as: { userId: string } | NewAccountInput,
): Promise<{ storeHandle: string; role: StoreRole; userId: string; joined: boolean; createdAccount: boolean }> {
  const invite = await liveInvite(token);
  if (!invite) throw new AuthRefusal("invalid", INVITE_INVALID);
  const store = await getStoreById(invite.storeId);
  if (!store) throw new AuthRefusal("invalid", INVITE_INVALID);
  const scope: WriteScope = publicScope(store);

  let userId: string;
  let account: Awaited<ReturnType<typeof prepareAccount>> | null = null;
  if ("userId" in as) {
    const user = await getUserById(as.userId);
    if (!user || user.disabled) throw new AuthRefusal("invalid", INVITE_INVALID);
    if (normalizeEmail(user.email) !== invite.emailNorm) throw new AuthRefusal("forbidden", "team.invite.wrong_account");
    userId = user.id;
  } else {
    account = await prepareAccount({ email: invite.emailNorm, name: as.name, password: as.password, phone: as.phone, locale: as.locale });
    userId = account.id!;
  }

  const outcome = await db.transaction(async (tx) => {
    if (account) {
      try {
        await insertAccount(account, tx);
      } catch (err) {
        if (err instanceof AuthRefusal && err.messageKey === ACCOUNT_REFUSED) throw new AuthRefusal("invalid", "team.invite.sign_in_first");
        throw err;
      }
    }
    const team = await lockTeam(tx, scope);
    const now = new Date();
    const [cas] = await tx
      .update(storeInvites)
      .set({ acceptedAt: now, acceptedBy: userId })
      .where(and(byId(storeInvites, scope, invite.id), isNull(storeInvites.acceptedAt), isNull(storeInvites.revokedAt), gt(storeInvites.expiresAt, now)));
    if (cas.affectedRows !== 1) throw new AuthRefusal("invalid", INVITE_INVALID);
    const existing = team.find((m) => m.userId === userId);
    if (existing) return { joined: false, role: existing.role };
    await assertSeats(scope, invite.role);
    await tx.insert(storeMembers).values(storeValues(scope, { userId, role: invite.role, status: "active" as const, invitedBy: invite.invitedBy, joinedAt: now }));
    return { joined: true, role: invite.role };
  });

  if (account) await audit("auth.user.created", { userId, target: userId, meta: { via: "store_invite" } });
  await audit("store.member.accepted", { userId, target: invite.id, meta: { role: outcome.role, joined: outcome.joined }, scope: { storeId: store.id, actorKind: "user" } });
  if (outcome.joined) {
    const name = account?.name ?? (await getUserById(userId))?.name ?? "";
    await notify({ audience: "user", userId: invite.invitedBy, storeId: store.id }, "invite.accepted", { member: name.slice(0, 60), role: outcome.role }, { link: appHref(invite.storeHandle, "/team") });
  }
  return { storeHandle: invite.storeHandle, role: outcome.role, userId, joined: outcome.joined, createdAccount: account !== null };
}

/* ------------------------------------------------------------------ */
/* Members (PLA-§22.4)                                                 */
/* ------------------------------------------------------------------ */

const TargetInput = (input: unknown): string => {
  const userId = (input as { userId?: unknown } | null)?.userId;
  if (typeof userId !== "string" || !/^[0-9A-Z]{26}$/.test(userId)) throw new SeamError("not_found");
  return userId;
};

/** The target row of a team write, locked, after the self and rank rules. */
async function lockedTarget(tx: Tx, ctx: WriteCtx, userId: string) {
  if (userId === ctx.user.id) throw new AuthRefusal("forbidden", "team.member.self");
  const team = await lockTeam(tx, ctx.scope);
  const target = team.find((m) => m.userId === userId);
  if (!target) throw new SeamError("not_found");
  if (!canManageMember(ctx.membership.role, target.role)) throw new SeamError("forbidden");
  return { team, target };
}

/**
 * `members.manage`: the rank rule on the target and on the new role (only an owner grants owner; an admin grants
 * roles below admin), the last owner kept, ↑ step-up for `admin` / `owner` (`meta.stepUp` names the method: an account
 * with TOTP can only step up with TOTP, §B.7).
 */
export async function changeMemberRole(ctx: WriteCtx, input: { userId: string; role: StoreRole }): Promise<{ role: StoreRole }> {
  if (!ctx.can("members.manage")) throw new SeamError("forbidden");
  const userId = TargetInput(input);
  if (userId === ctx.user.id) throw new AuthRefusal("forbidden", "team.member.self");
  const role = input.role;
  if (!isStoreRole(role) || !ACTIVE_STORE_ROLES.includes(role)) throw new FieldsError({ role: "team.member.role_invalid" });
  const actor = ctx.membership.role;
  if (actor !== "owner" && ROLE_RANK[role] >= ROLE_RANK[actor]) throw new SeamError("forbidden");
  const stepUp = role === "admin" || role === "owner";
  if (stepUp) assertStepUp(ctx);

  const from = await db.transaction(async (tx) => {
    const { team, target } = await lockedTarget(tx, ctx, userId);
    if (target.role === role) return null;
    if (target.role === "owner" && target.status === "active" && !otherActiveOwner(team, userId)) throw new AuthRefusal("last_owner", "team.leave.last_owner");
    // the member already holds a seat: only the agents gauge can refuse a role change
    if (role === "agent") await assertSeats(ctx.scope, "agent", { seatHeld: true });
    await tx.update(storeMembers).set({ role }).where(whereStore(storeMembers, ctx.scope, eq(storeMembers.userId, userId)));
    return target.role;
  });
  if (from === null) return { role };
  await auditFrom(ctx, "store.member.role_changed", { target: userId, meta: { from, to: role, ...(stepUp ? { stepUp: ctx.user.totpEnabled ? "totp" : "password" } : {}) } });
  await notify({ audience: "user", userId, storeId: ctx.store.id }, "member.role_changed", { role }, { link: appHref(ctx.store.handle) });
  return { role };
}

/** `members.manage`: suspend or reactivate (effective on the member's next request); the last active owner is kept. */
export async function setMemberStatus(ctx: WriteCtx, input: { userId: string; status: "active" | "suspended" }): Promise<{ status: "active" | "suspended" }> {
  if (!ctx.can("members.manage")) throw new SeamError("forbidden");
  const userId = TargetInput(input);
  const status = input.status;
  if (status !== "active" && status !== "suspended") throw new FieldsError({ status: "error.invalid" });
  const changed = await db.transaction(async (tx) => {
    const { team, target } = await lockedTarget(tx, ctx, userId);
    if (target.status === status) return false;
    if (status === "suspended" && target.role === "owner" && !otherActiveOwner(team, userId)) throw new AuthRefusal("last_owner", "team.leave.last_owner");
    await tx.update(storeMembers).set({ status }).where(whereStore(storeMembers, ctx.scope, eq(storeMembers.userId, userId)));
    return true;
  });
  if (!changed) return { status };
  await auditFrom(ctx, status === "suspended" ? "store.member.suspended" : "store.member.reactivated", { target: userId });
  if (status === "suspended") await notify({ audience: "user", userId, storeId: ctx.store.id }, "member.suspended", {}, { severity: "warn" });
  return { status };
}

/** `members.manage`: the membership row goes (the account stays); the last active owner is kept. */
export async function removeMember(ctx: WriteCtx, input: { userId: string }): Promise<void> {
  if (!ctx.can("members.manage")) throw new SeamError("forbidden");
  const userId = TargetInput(input);
  const role = await db.transaction(async (tx) => {
    const { team, target } = await lockedTarget(tx, ctx, userId);
    if (target.role === "owner" && !otherActiveOwner(team, userId)) throw new AuthRefusal("last_owner", "team.leave.last_owner");
    await tx.delete(storeMembers).where(whereStore(storeMembers, ctx.scope, eq(storeMembers.userId, userId)));
    return target.role;
  });
  await auditFrom(ctx, "store.member.removed", { target: userId, meta: { self: false, role } });
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
    const team = await lockTeam(tx, scope);
    const mine = team.find((m) => m.userId === ctx.user.id);
    if (!mine) throw new AuthRefusal("not_found");
    if (mine.role === "owner" && !otherActiveOwner(team, ctx.user.id)) throw new AuthRefusal("last_owner", "team.leave.last_owner");
    await tx.delete(storeMembers).where(whereStore(storeMembers, scope, eq(storeMembers.userId, ctx.user.id)));
    return mine.role;
  });
  await auditFrom(ctx, "store.member.removed", { target: ctx.user.id, meta: { self: true, role } });
}

/* ------------------------------------------------------------------ */
/* Scoped reads (PLA Q.11: the console, the health job, the team page)  */
/* ------------------------------------------------------------------ */

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
