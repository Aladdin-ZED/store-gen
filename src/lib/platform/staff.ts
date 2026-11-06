import "server-only";
/**
 * Staff, staff invites and mandatory 2FA (platform.md PLA-§14.1, SE-01; PD13, PD7; core §B.1 `/invite/staff/<token>`,
 * §B.5 rev 3 / SEC-24, §B.7, §D.5 `staff_invites`).
 *
 *   await listStaff(ctx);                                                   // staff.manage: Active · Invited · Waiting for 2FA
 *   const { url } = await inviteStaff(ctx, { email, role: "support" });    // the link, shown once
 *   await getStaffInviteState(token, viewer);                               // the public page: valid / expired / revoked / used
 *   await acceptStaffInvite(token, { userId }, meta);                       // one conditional UPDATE, then platform_role
 *   await setStaffRole(ctx, { userId, role: "analyst", reason });           // sessions revoked; → super_admin = a request
 *   await removeStaff(ctx, { userId, reason });                             // role none, sessions revoked, stores kept
 *   await signOutAllStaffExcept(ctx);                                       // every staff session but this one
 *
 * Invites: a 32-byte token (`newToken`), only its sha256 at rest, 72 h, single use, bound to the e-mail as signup
 * normalises it (trimmed, lower case), at most 10 pending on the platform, the link from the platform origin. Accepting
 * consumes the invite with one conditional statement before the role is set, in the same transaction
 * (`UPDATE staff_invites … WHERE id = ? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ?`,
 * `affectedRows === 1` the only success path), so parallel accepts give one staff member. A new account goes through
 * T2's `prepareAccount` / `insertAccount` with the e-mail locked and no store (PD13). The role is inert until TOTP is
 * enrolled: `requirePlatform` refuses a staff session without it (core §B.7), the table says "Waiting for 2FA".
 *
 * Every role change and removal revokes the person's sessions. A promotion to super_admin is a platform request
 * (PD7: four-eyes with two super_admins, else 24 h delayed; ./platform-requests.ts). The last active super_admin with
 * TOTP can neither be demoted nor removed (`last_super_admin`): the super_admin rows are locked while it is checked.
 * Audit `platform.staff.invited` and `platform.staff.changed { userId, from, to, reason }`.
 *
 * The `signups_enabled` kill switch does not close staff invites: only a super_admin creates them, and an incident is
 * when a new staff member may be needed most (decision recorded in the P1 report).
 */
import { createHash } from "node:crypto";
import { and, asc, count, desc, eq, gt, inArray, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import { audit, auditFrom } from "@/lib/audit";
import { AuthRefusal, FieldsError } from "@/lib/auth/errors";
import { CONSOLE_2FA_ENROL_PATH } from "@/lib/auth/paths";
import { PLATFORM_ROLES, type PlatformRole } from "@/lib/auth/permissions";
import { revokeUserSessions } from "@/lib/auth/session";
import { ACCOUNT_REFUSED, EmailInput, getUserById, insertAccount, normalizeEmail, prepareAccount, staffReason, type AccountLocale } from "@/lib/auth/users";
import { db } from "@/lib/db/client";
import { newId, newToken } from "@/lib/db/ids";
import { withNamedLock, platformLock } from "@/lib/db/locks";
import { staffInvites, users } from "@/lib/db/schema";
import { consoleHref, platformOrigin } from "@/lib/urls";
import type { PlatformCtx } from "@/lib/tenancy/types";
import { acceptanceDocsFor, insertUserAcceptances } from "./legal";
import { maskEmail } from "./mask";
import { requestSuperAdminPromotion } from "./platform-requests";
import { cleanText, id26 } from "./queue-rules";
import {
  INVITABLE_STAFF_ROLES,
  STAFF_INVITES_PENDING_MAX,
  STAFF_INVITE_TTL_MS,
  isInvitableStaffRole,
  leavesNoSuperAdmin,
  staffInviteState,
  staffStateOf,
  type InvitableStaffRole,
  type StaffInviteState,
  type StaffState,
} from "./staff-rules";

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
/** the one answer for an unknown, used, revoked or expired link when it is acted on */
export const STAFF_INVITE_INVALID = "console.staff.invite_invalid";

/** the at-rest form of a token (`staff_invites.token_hash`) */
export const hashStaffToken = (token: string): string => createHash("sha256").update(token, "utf8").digest("hex");

/** "https://<platform>/invite/staff/<token>" (the platform origin, never a store host) */
export const staffInviteUrl = (token: string) => `${platformOrigin()}/invite/staff/${token}`;

function requireStaffManage(ctx: PlatformCtx, opts: { write?: boolean } = {}): void {
  if (!ctx.can("staff.manage")) throw new AuthRefusal("forbidden");
  if (opts.write && !ctx.stepUpFresh) throw new AuthRefusal("step_up");
}

/* ------------------------------------------------------------------ */
/* The Staff table (PLA-§14.1)                                         */
/* ------------------------------------------------------------------ */

export interface StaffRow {
  userId: string;
  name: string;
  email: string;
  role: PlatformRole;
  state: Exclude<StaffState, "invited">;
  twoFactor: boolean;
  lastSignInAt: string | null;
  /** who added them and when (the accepted invite; null for the first super_admin of /admin/setup) */
  addedBy: { id: string; name: string } | null;
  addedAt: string;
  disabled: boolean;
}

export interface StaffInviteRow {
  id: string;
  email: string;
  role: InvitableStaffRole;
  state: StaffInviteState;
  invitedBy: { id: string; name: string } | null;
  note: string | null;
  expiresAt: string;
  createdAt: string;
}

export interface StaffList {
  staff: StaffRow[];
  /** pending invites first, then the last 30 days of used, revoked and expired ones */
  invites: StaffInviteRow[];
  pendingInvites: number;
  /** active super_admins with TOTP (the invariant's count) */
  superAdmins: number;
}

/** `staff.manage`: every account with a platform role (users_prole_idx) and the invites, with their states. */
export async function listStaff(ctx: PlatformCtx, now: Date = new Date()): Promise<StaffList> {
  requireStaffManage(ctx);
  const since = new Date(now.getTime() - 30 * 86_400_000);
  const [people, invites] = await Promise.all([
    db
      .select({ id: users.id, name: users.name, email: users.email, role: users.platformRole, totp: users.totpEnabled, lastLoginAt: users.lastLoginAt, createdAt: users.createdAt, disabled: users.disabled })
      .from(users)
      .where(inArray(users.platformRole, [...PLATFORM_ROLES]))
      .orderBy(asc(users.name))
      .limit(500),
    db.select().from(staffInvites).where(gt(staffInvites.createdAt, since)).orderBy(desc(staffInvites.createdAt)).limit(200),
  ]);
  const acceptedBy = new Map(invites.filter((i) => i.acceptedBy).map((i) => [i.acceptedBy!, i]));
  // older accepted invites name who added a staff member beyond the 30-day window
  const missing = people.filter((p) => !acceptedBy.has(p.id)).map((p) => p.id);
  if (missing.length) {
    for (const i of await db.select().from(staffInvites).where(inArray(staffInvites.acceptedBy, missing)).limit(500)) if (i.acceptedBy) acceptedBy.set(i.acceptedBy, i);
  }
  const inviterIds = [...new Set([...invites, ...acceptedBy.values()].map((i) => i.invitedBy))];
  const inviters = inviterIds.length ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, inviterIds)) : [];
  const nameOf = new Map(inviters.map((u) => [u.id, u.name]));

  const staff = people.map((p): StaffRow => {
    const invite = acceptedBy.get(p.id);
    return {
      userId: p.id,
      name: p.name,
      email: p.email,
      role: p.role as PlatformRole,
      state: staffStateOf({ totpEnabled: p.totp }) as Exclude<StaffState, "invited">,
      twoFactor: p.totp,
      lastSignInAt: p.lastLoginAt?.toISOString() ?? null,
      addedBy: invite ? { id: invite.invitedBy, name: nameOf.get(invite.invitedBy) ?? "" } : null,
      addedAt: (invite?.acceptedAt ?? p.createdAt).toISOString(),
      disabled: p.disabled,
    };
  });
  const inviteRows = invites
    .map(
      (i): StaffInviteRow => ({
        id: i.id,
        email: i.emailNorm,
        role: i.role,
        state: staffInviteState(i, now),
        invitedBy: { id: i.invitedBy, name: nameOf.get(i.invitedBy) ?? "" },
        note: i.note,
        expiresAt: i.expiresAt.toISOString(),
        createdAt: i.createdAt.toISOString(),
      }),
    )
    .sort((a, b) => Number(b.state === "valid") - Number(a.state === "valid"));
  return {
    staff,
    invites: inviteRows,
    pendingInvites: inviteRows.filter((i) => i.state === "valid").length,
    superAdmins: people.filter((p) => p.role === "super_admin" && p.totp && !p.disabled).length,
  };
}

/* ------------------------------------------------------------------ */
/* Invites                                                             */
/* ------------------------------------------------------------------ */

const InviteInput = z.object({
  email: z.string().max(400),
  role: z.enum(INVITABLE_STAFF_ROLES),
  note: z.string().max(400).nullish(),
});

/**
 * `staff.manage` ↑ (PLA-§14.1): a staff invite for one e-mail and role (admin, support, analyst). Refused for an
 * e-mail that already holds a platform role (`already_staff`) or has a pending invite (`already_invited`: revoke it
 * first), and past 10 pending invites. The raw token exists only in the returned link. Audit
 * `platform.staff.invited { inviteId, role, email: masked }`.
 */
export async function inviteStaff(ctx: PlatformCtx, input: unknown, now: Date = new Date()): Promise<{ inviteId: string; url: string; expiresAt: string }> {
  requireStaffManage(ctx, { write: true });
  const parsed = InviteInput.safeParse(input);
  if (!parsed.success) throw new FieldsError({ [String(parsed.error.issues[0]?.path[0] ?? "email")]: parsed.error.issues[0]?.path[0] === "role" ? "console.staff.role_invalid" : "auth.email_invalid" });
  const email = EmailInput.safeParse(parsed.data.email);
  if (!email.success) throw new FieldsError({ email: "auth.email_invalid" });
  const note = parsed.data.note ? cleanText(parsed.data.note).slice(0, 200) || null : null;
  const token = newToken(32);
  const id = newId();
  const expiresAt = new Date(now.getTime() + STAFF_INVITE_TTL_MS);
  const lock = await withNamedLock(platformLock("staff-invites"), 5, async () => {
    const [holder] = await db.select({ role: users.platformRole }).from(users).where(eq(users.email, email.data)).limit(1);
    if (holder && holder.role !== "none") throw new AuthRefusal("invalid", "console.staff.already_staff");
    const pending = await db
      .select({ emailNorm: staffInvites.emailNorm })
      .from(staffInvites)
      .where(and(isNull(staffInvites.acceptedAt), isNull(staffInvites.revokedAt), gt(staffInvites.expiresAt, now)));
    if (pending.some((p) => p.emailNorm === email.data)) throw new AuthRefusal("invalid", "console.staff.already_invited");
    if (pending.length >= STAFF_INVITES_PENDING_MAX) throw new AuthRefusal("quota", "console.staff.pending_cap");
    await db.insert(staffInvites).values({ id, emailNorm: email.data, role: parsed.data.role, tokenHash: hashStaffToken(token), invitedBy: ctx.user.id, note, expiresAt, createdAt: now });
  });
  if (!lock.ran) throw new AuthRefusal("busy");
  await auditFrom(ctx, "platform.staff.invited", { target: id, meta: { inviteId: id, role: parsed.data.role, email: maskEmail(email.data) } });
  return { inviteId: id, url: staffInviteUrl(token), expiresAt: expiresAt.toISOString() };
}

/** `staff.manage` ↑: a pending invite stops working (`revoked_at`); a used, expired or revoked one answers `{ revoked: false }`. */
export async function revokeStaffInvite(ctx: PlatformCtx, input: unknown, now: Date = new Date()): Promise<{ revoked: boolean }> {
  requireStaffManage(ctx, { write: true });
  const { inviteId } = z.object({ inviteId: id26 }).parse(input);
  const [res] = await db
    .update(staffInvites)
    .set({ revokedAt: now })
    .where(and(eq(staffInvites.id, inviteId), isNull(staffInvites.acceptedAt), isNull(staffInvites.revokedAt), gt(staffInvites.expiresAt, now)));
  const revoked = res.affectedRows === 1;
  if (revoked) await auditFrom(ctx, "platform.staff.changed", { target: inviteId, meta: { inviteId, from: "invited", to: "revoked" } });
  return { revoked };
}

type InviteRow = typeof staffInvites.$inferSelect;

async function inviteByToken(token: string): Promise<InviteRow | null> {
  if (typeof token !== "string" || !TOKEN_RE.test(token)) return null;
  const [row] = await db.select().from(staffInvites).where(eq(staffInvites.tokenHash, hashStaffToken(token))).limit(1);
  return row ?? null;
}

/** What `/invite/staff/<token>` shows (PLA-§14.1): the invite's state, and for a valid one which way in. */
export type StaffInviteView =
  | { state: "invalid" }
  | { state: Exclude<StaffInviteState, "valid">; role: InvitableStaffRole; emailMasked: string }
  | { state: "valid"; role: InvitableStaffRole; emailMasked: string; expiresAt: string; way: "accept" | "wrong_account" | "sign_in" | "sign_up" | "already_staff" };

/**
 * The public page's read (no session needed): an unknown or malformed token is `invalid`; a known one says
 * valid / expired / revoked / used with the role and the masked e-mail ("s•••@gmail.com"). For a valid invite, `way`
 * tells the page what to show the viewer: accept (signed in with the bound e-mail), wrong_account, sign_in (an account
 * exists for the e-mail), sign_up (the e-mail locked), already_staff.
 */
export async function getStaffInviteState(token: string, viewer: { id: string; email: string } | null = null, now: Date = new Date()): Promise<StaffInviteView> {
  const row = await inviteByToken(token);
  if (!row) return { state: "invalid" };
  const state = staffInviteState(row, now);
  const base = { role: row.role, emailMasked: maskEmail(row.emailNorm) };
  if (state !== "valid") return { state, ...base };
  let way: Extract<StaffInviteView, { state: "valid" }>["way"];
  if (viewer) {
    if (normalizeEmail(viewer.email) !== row.emailNorm) way = "wrong_account";
    else way = (await getUserById(viewer.id))?.platformRole !== "none" ? "already_staff" : "accept";
  } else {
    const [account] = await db.select({ role: users.platformRole }).from(users).where(eq(users.email, row.emailNorm)).limit(1);
    way = !account ? "sign_up" : account.role !== "none" ? "already_staff" : "sign_in";
  }
  return { state, ...base, expiresAt: row.expiresAt.toISOString(), way };
}

export interface NewStaffAccount {
  name: string;
  password: string;
  locale: AccountLocale;
}

export interface StaffAcceptance {
  userId: string;
  role: InvitableStaffRole;
  createdAccount: boolean;
  /** where the page sends the person: the console with TOTP, else `/app/account/two-factor?for=console` (core §B.7) */
  next: string;
}

/**
 * Accepts a staff invite (PLA-§14.1, core §B.5 rev 3): as the signed-in account with the bound e-mail, or as a new
 * account (name + password, the e-mail locked to the invite, no store). In one transaction: the new account, the
 * conditional consumption of the invite (`affectedRows === 1`), the platform role (only an account without one), and
 * the acceptance of the published ToS, Privacy and AUP in the person's locale (`context = 'staff'`; a kind with no
 * published version is not asked). Any refusal leaves nothing written. Audit `platform.staff.changed`.
 */
export async function acceptStaffInvite(
  token: string,
  as: { userId: string } | NewStaffAccount,
  meta: { ipHash: string | null; uaLabel: string },
  now: Date = new Date(),
): Promise<StaffAcceptance> {
  const invite = await inviteByToken(token);
  if (!invite || staffInviteState(invite, now) !== "valid") throw new AuthRefusal("invalid", STAFF_INVITE_INVALID);

  let userId: string;
  let locale: string | null;
  let totpEnabled = false;
  let account: Awaited<ReturnType<typeof prepareAccount>> | null = null;
  if ("userId" in as) {
    const user = await getUserById(as.userId);
    if (!user || user.disabled) throw new AuthRefusal("invalid", STAFF_INVITE_INVALID);
    if (normalizeEmail(user.email) !== invite.emailNorm) throw new AuthRefusal("forbidden", "console.staff.invite_wrong_account");
    if (user.platformRole !== "none") throw new AuthRefusal("invalid", "console.staff.already_staff");
    userId = user.id;
    locale = user.locale;
    totpEnabled = user.totpEnabled;
  } else {
    // the policy and the scrypt semaphore (T2); the e-mail is the invite's, whatever the form sent (D10)
    account = await prepareAccount({ email: invite.emailNorm, name: as.name, password: as.password, locale: as.locale });
    userId = account.id!;
    locale = as.locale;
  }
  const docs = await acceptanceDocsFor(locale);

  await db.transaction(async (tx) => {
    if (account) {
      try {
        await insertAccount(account, tx);
      } catch (err) {
        if (err instanceof AuthRefusal && err.messageKey === ACCOUNT_REFUSED) throw new AuthRefusal("invalid", "console.staff.invite_sign_in_first");
        throw err;
      }
    }
    const [consumed] = await tx
      .update(staffInvites)
      .set({ acceptedAt: now, acceptedBy: userId })
      .where(and(eq(staffInvites.id, invite.id), isNull(staffInvites.acceptedAt), isNull(staffInvites.revokedAt), gt(staffInvites.expiresAt, now)));
    if (consumed.affectedRows !== 1) throw new AuthRefusal("invalid", STAFF_INVITE_INVALID);
    const [granted] = await tx
      .update(users)
      .set({ platformRole: invite.role })
      .where(and(eq(users.id, userId), eq(users.platformRole, "none"), eq(users.disabled, false)));
    if (granted.affectedRows !== 1) throw new AuthRefusal("invalid", "console.staff.already_staff");
    if (docs.length) await insertUserAcceptances(tx, docs.map((d) => ({ userId, documentId: d.id, ipHash: meta.ipHash, ua: meta.uaLabel.slice(0, 300) || null, context: "staff" as const, acceptedAt: now })));
  });

  if (account) await audit("auth.user.created", { userId, target: userId, meta: { via: "staff_invite" } });
  await audit("platform.staff.changed", { userId, target: userId, meta: { userId, from: "none", to: invite.role, via: "invite", inviteId: invite.id }, scope: { storeId: null, actorKind: "user" } });
  return { userId, role: invite.role, createdAccount: account !== null, next: totpEnabled ? consoleHref() : CONSOLE_2FA_ENROL_PATH };
}

/* ------------------------------------------------------------------ */
/* Role changes, removal, sign-out (PLA-§14.1, §14.3)                  */
/* ------------------------------------------------------------------ */

const RoleInput = z.object({ userId: id26, role: z.enum(PLATFORM_ROLES), reason: z.unknown() });

/**
 * One locked change of a staff member's role: the super_admin rows and the target are read FOR UPDATE, so two
 * concurrent demotions cannot both pass the invariant. Answers the previous role, or null when nothing changed.
 */
async function changeRole(targetId: string, to: PlatformRole | "none"): Promise<PlatformRole | null> {
  return db.transaction(async (tx) => {
    const supers = await tx
      .select({ id: users.id, totpEnabled: users.totpEnabled, disabled: users.disabled })
      .from(users)
      .where(eq(users.platformRole, "super_admin"))
      .for("update");
    const [target] = await tx.select({ role: users.platformRole }).from(users).where(eq(users.id, targetId)).for("update");
    if (!target || target.role === "none") throw new AuthRefusal("not_found");
    if (target.role === to) return null;
    if (target.role === "super_admin" && leavesNoSuperAdmin(supers, targetId)) throw new AuthRefusal("last_super_admin", "console.staff.last_super_admin");
    await tx.update(users).set({ platformRole: to }).where(eq(users.id, targetId));
    return target.role as PlatformRole;
  });
}

/**
 * `staff.manage` ↑ (PLA-§14.1): a staff member's role becomes admin, support or analyst, with a reason (3-200); every
 * session of theirs ends (they sign in again, the §B.7 gate applies). `super_admin` becomes a platform request
 * (`{ requested }`, PD7). The last super_admin cannot be demoted; nobody changes their own role. Audit
 * `platform.staff.changed { userId, from, to, reason, sessions }`.
 */
export async function setStaffRole(
  ctx: PlatformCtx,
  input: unknown,
): Promise<{ changed: boolean; from: PlatformRole | null; to: PlatformRole } | { requested: { id: string; mode: "four_eyes" | "delayed"; executeAfter: string | null } }> {
  requireStaffManage(ctx, { write: true });
  const v = RoleInput.parse(input);
  const reason = staffReason(v.reason);
  if (v.userId === ctx.user.id) throw new AuthRefusal("forbidden", "auth.staff.not_yourself");
  if (v.role === "super_admin") return { requested: await requestSuperAdminPromotion(ctx, { targetUserId: v.userId, note: reason }) };
  if (!isInvitableStaffRole(v.role)) throw new FieldsError({ role: "console.staff.role_invalid" });
  const from = await changeRole(v.userId, v.role);
  if (from === null) return { changed: false, from: null, to: v.role };
  const sessions = await revokeUserSessions(v.userId);
  await auditFrom(ctx, "platform.staff.changed", { target: v.userId, meta: { userId: v.userId, from, to: v.role, reason, sessions } });
  return { changed: true, from, to: v.role };
}

/**
 * `staff.manage` ↑ (PLA-§14.1): the person leaves the staff (role `none`), every session ends at once; their own stores
 * and memberships stay. The last super_admin cannot be removed; nobody removes themselves. Audit `platform.staff.changed`.
 */
export async function removeStaff(ctx: PlatformCtx, input: unknown): Promise<{ removed: boolean; sessions: number }> {
  requireStaffManage(ctx, { write: true });
  const v = z.object({ userId: id26, reason: z.unknown() }).parse(input);
  const reason = staffReason(v.reason);
  if (v.userId === ctx.user.id) throw new AuthRefusal("forbidden", "auth.staff.not_yourself");
  const from = await changeRole(v.userId, "none");
  if (from === null) return { removed: false, sessions: 0 };
  const sessions = await revokeUserSessions(v.userId);
  await auditFrom(ctx, "platform.staff.changed", { target: v.userId, meta: { userId: v.userId, from, to: "none", reason, sessions } });
  return { removed: true, sessions };
}

/**
 * `staff.manage` ↑ (PLA-§14.3 "Sign out all staff except me"): every session of every staff account ends, except the
 * caller's current one. Audit `platform.staff.signed_out_all { staff, sessions }`.
 */
export async function signOutAllStaffExcept(ctx: PlatformCtx): Promise<{ staff: number; sessions: number }> {
  requireStaffManage(ctx, { write: true });
  const people = await db.select({ id: users.id }).from(users).where(inArray(users.platformRole, [...PLATFORM_ROLES])).limit(500);
  let sessions = 0;
  for (const p of people) sessions += await revokeUserSessions(p.id, p.id === ctx.user.id ? { exceptSessionId: ctx.user.sessionId } : {});
  await auditFrom(ctx, "platform.staff.signed_out_all", { target: ctx.user.id, meta: { staff: people.length, sessions } });
  return { staff: people.length, sessions };
}

/** The pending invites count (the Staff tab badge); `staff.manage`. */
export async function pendingStaffInvites(ctx: PlatformCtx, now: Date = new Date()): Promise<number> {
  requireStaffManage(ctx);
  const [row] = await db.select({ n: count() }).from(staffInvites).where(and(isNull(staffInvites.acceptedAt), isNull(staffInvites.revokedAt), gt(staffInvites.expiresAt, now)));
  return Number(row?.n ?? 0);
}

/** Whether an account holds a platform role (the people list's "staff" chip). */
export async function isStaff(userId: string): Promise<boolean> {
  const [row] = await db.select({ role: users.platformRole }).from(users).where(and(eq(users.id, userId), ne(users.platformRole, "none"))).limit(1);
  return !!row;
}
