import "server-only";
/**
 * People and the user profile (platform.md PLA-§11.1, §11.2; PD34, PD35, PD81, SEC-20): `/admin/users` and
 * `/admin/users/<id>/<tab>`, and the account actions staff take on a seller.
 *
 *   const page = await listPeople(ctx, parsePeopleFilter(searchParams), searchParams.cursor);
 *   const user = await getUserProfile(ctx, userId);               // header + Stores tab
 *   const tab = await userSessions(ctx, userId);                  // Sessions / Sign-up / Linked / Activity tabs
 *   await banPerson(ctx, { userId, reason, note, suspendStores: true });
 *   await deletePerson(ctx, { userId, reason });                  // owns_store (with the stores) / is_staff refusals
 *
 * Search (PD35): an exact e-mail for every role (the result masked per role), a name prefix and an exact E.164 phone
 * for admin+ only. Lists are keyset by `[created_at, id]`. The users table holds no store column; the membership
 * counts and the "no store" filter cross stores and are annotated (`// tenancy: platform people`).
 *
 * The actions are T2's functions (PLA Q.19: `banUser`, `unbanUser`, `resetUserTwoFactor`, `createPasswordResetLink`,
 * `deleteUserAccount`; each refuses oneself, a staff target and a deleted account) behind the bucket
 * `p:users:manage:<staffId>` 30 an hour. "Sign out everywhere" revokes the sessions and audits
 * `platform.user.signed_out` here. A ban may also suspend the stores where the person is the only owner, through
 * `transitionStore(…, "suspended", { reason: "owner_banned" })` when the staff member also holds `stores.lifecycle`.
 */
import { z } from "zod";
import { and, asc, desc, eq, gte, inArray, lt, ne, or, sql, type SQL } from "drizzle-orm";
import { auditFrom } from "@/lib/audit";
import { describeUserAgent } from "@/lib/admin-data/security";
import { deleteUserAccount } from "@/lib/auth";
import { AuthRefusal, FieldsError } from "@/lib/auth/errors";
import { isPlatformRole, type PlatformRole } from "@/lib/auth/permissions";
import { revokeUserSessions } from "@/lib/auth/session";
import { banUser, createPasswordResetLink, getUserById, resetUserTwoFactor, unbanUser } from "@/lib/auth/users";
import { db } from "@/lib/db/client";
import { auditLog, identityLinks, sessions, signupReviews, storeMembers, stores, users } from "@/lib/db/schema";
import { platformBucket, rateLimit } from "@/lib/security/rate-limit";
import { transitionStore } from "@/lib/tenancy/lifecycle";
import type { PlatformCtx, StoreStatus } from "@/lib/tenancy/types";
import { decodeCursor, encodeCursor } from "./cursor";
import { maskEmail, maskIp, sellerContact, type Masked } from "./mask";
import { recordPlatformError } from "./log";

export const PEOPLE_PAGE = 50;
/** PLA-§11.2 / §M.5: account actions per staff member and hour */
export const USER_ACTIONS_PER_HOUR = 30;

const ID_RE = /^[0-9A-Z]{26}$/;
const E164_RE = /^\+[1-9]\d{6,14}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const ROLES = ["none", "super_admin", "admin", "support", "analyst"] as const;

const isAdminPlus = (ctx: PlatformCtx) => ctx.role === "admin" || ctx.role === "super_admin";
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

function requireRead(ctx: PlatformCtx): void {
  if (!ctx.can("console.read")) throw new AuthRefusal("forbidden");
}

/* ------------------------------------------------------------------ */
/* The list (PLA-§11.1)                                                */
/* ------------------------------------------------------------------ */

export const PeopleFilterSchema = z.object({
  /** an exact e-mail, a name prefix (admin+) or an exact E.164 phone (admin+) */
  q: z.string().trim().max(191).optional(),
  role: z.enum(ROLES).optional(),
  banned: z.boolean().optional(),
  twoFactor: z.boolean().optional(),
  createdFrom: z.string().regex(DAY_RE).optional(),
  createdTo: z.string().regex(DAY_RE).optional(),
  noStore: z.boolean().optional(),
});
export type PeopleFilter = z.infer<typeof PeopleFilterSchema>;

/** The URL's parameters, every malformed one dropped. */
export function parsePeopleFilter(params: Record<string, unknown>): PeopleFilter {
  const bool = (v: unknown) => (v === "1" || v === "true" ? true : v === "0" || v === "false" ? false : undefined);
  const raw = {
    q: typeof params.q === "string" ? params.q : undefined,
    role: typeof params.role === "string" ? params.role : undefined,
    banned: bool(params.banned),
    twoFactor: bool(params["2fa"] ?? params.twoFactor),
    createdFrom: typeof params.from === "string" ? params.from : undefined,
    createdTo: typeof params.to === "string" ? params.to : undefined,
    noStore: bool(params.nostore ?? params.noStore),
  };
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v === undefined) continue;
    const r = (PeopleFilterSchema.shape as Record<string, z.ZodType>)[k]!.safeParse(v);
    if (r.success) out[k] = r.data;
  }
  return out as PeopleFilter;
}

export interface PersonRow {
  id: string;
  name: string;
  email: string | Masked;
  phoneCountry: string | null;
  stores: { member: number; owner: number };
  platformRole: PlatformRole | "none";
  twoFactor: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  banned: { reason: string | null; at: string | null } | null;
  deleted: boolean;
}

export interface PeoplePage {
  rows: PersonRow[];
  next: string | null;
  /** the kind of search the query was read as, or why it was ignored */
  search: "email" | "name" | "phone" | "ignored" | null;
}

const likePrefix = (q: string) => `${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/** The calling code of an E.164 number ("+212…" → "212"), the people list's "phone country". */
function phoneCountry(phone: string | null): string | null {
  if (!phone || !E164_RE.test(phone)) return null;
  for (const n of [3, 2, 1]) {
    const cc = phone.slice(1, 1 + n);
    if (["212", "213", "216", "33", "32", "34", "49", "39", "31", "351", "1", "44", "971", "966"].includes(cc)) return `+${cc}`;
  }
  return `+${phone.slice(1, 4)}`;
}

/** PLA-§11.1 (`console.read`): one page, newest accounts first. */
export async function listPeople(ctx: PlatformCtx, filter: PeopleFilter = {}, cursor: string | null = null): Promise<PeoplePage> {
  requireRead(ctx);
  const conds: SQL[] = [];
  let search: PeoplePage["search"] = null;
  const q = filter.q?.trim();
  if (q) {
    if (q.includes("@")) {
      conds.push(eq(users.email, q.normalize("NFKC").toLowerCase()));
      search = "email";
    } else if (E164_RE.test(q.replace(/[\s-]/g, ""))) {
      if (isAdminPlus(ctx)) {
        conds.push(eq(users.phone, q.replace(/[\s-]/g, "")));
        search = "phone";
      } else search = "ignored";
    } else if (q.length >= 2) {
      if (isAdminPlus(ctx)) {
        conds.push(sql`${users.name} LIKE ${likePrefix(q)}`);
        search = "name";
      } else search = "ignored";
    }
    if (search === "ignored") return { rows: [], next: null, search };
  }
  if (filter.role) conds.push(eq(users.platformRole, filter.role));
  if (filter.banned !== undefined) conds.push(eq(users.disabled, filter.banned));
  if (filter.twoFactor !== undefined) conds.push(eq(users.totpEnabled, filter.twoFactor));
  if (filter.createdFrom) conds.push(gte(users.createdAt, new Date(`${filter.createdFrom}T00:00:00Z`)));
  if (filter.createdTo) conds.push(lt(users.createdAt, new Date(new Date(`${filter.createdTo}T00:00:00Z`).getTime() + 86_400_000)));
  if (filter.noStore) conds.push(sql`NOT EXISTS (SELECT 1 FROM store_members m WHERE m.user_id = ${users.id})`); // tenancy: platform people: the "no store" filter, an existence test over any store's memberships
  const key = decodeCursor(cursor);
  if (key && key.length === 2 && typeof key[0] === "string" && typeof key[1] === "string" && Number.isFinite(Date.parse(key[0])) && ID_RE.test(key[1])) {
    const at = new Date(key[0]);
    conds.push(or(lt(users.createdAt, at), and(eq(users.createdAt, at), lt(users.id, key[1])))!);
  }
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email, phone: users.phone, platformRole: users.platformRole, totpEnabled: users.totpEnabled, lastLoginAt: users.lastLoginAt, createdAt: users.createdAt, disabled: users.disabled, disabledReason: users.disabledReason, disabledAt: users.disabledAt })
    .from(users)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(users.createdAt), desc(users.id))
    .limit(PEOPLE_PAGE + 1);
  const page = rows.slice(0, PEOPLE_PAGE);
  const counts = await membershipCounts(page.map((r) => r.id));
  const last = page[page.length - 1];
  return {
    rows: page.map((r) => ({
      id: r.id,
      name: r.name,
      email: sellerContact(ctx.role, { email: r.email, phone: null }).email,
      phoneCountry: phoneCountry(r.phone),
      stores: counts.get(r.id) ?? { member: 0, owner: 0 },
      platformRole: isPlatformRole(r.platformRole) ? r.platformRole : "none",
      twoFactor: r.totpEnabled,
      lastLoginAt: iso(r.lastLoginAt),
      createdAt: r.createdAt.toISOString(),
      banned: r.disabled && r.disabledReason !== "deleted" ? { reason: r.disabledReason, at: iso(r.disabledAt) } : null,
      deleted: r.disabledReason === "deleted",
    })),
    next: rows.length > PEOPLE_PAGE && last ? encodeCursor([last.createdAt.toISOString(), last.id]) : null,
    search,
  };
}

async function membershipCounts(userIds: readonly string[]): Promise<Map<string, { member: number; owner: number }>> {
  if (!userIds.length) return new Map();
  // tenancy: platform people: membership counts of one page of users across stores (sm_user_idx), numbers only
  const rows = await db
    .select({ userId: storeMembers.userId, n: sql<number>`COUNT(*)`, owner: sql<number>`COALESCE(SUM(${storeMembers.role} = 'owner'), 0)` })
    .from(storeMembers)
    .where(inArray(storeMembers.userId, [...userIds]))
    .groupBy(storeMembers.userId);
  return new Map(rows.map((r) => [r.userId, { member: Number(r.n), owner: Number(r.owner) }]));
}

/* ------------------------------------------------------------------ */
/* The profile (PLA-§11.2)                                             */
/* ------------------------------------------------------------------ */

export interface UserProfile {
  id: string;
  name: string;
  email: string | Masked;
  phone: string | Masked | null;
  locale: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  platformRole: PlatformRole | "none";
  twoFactor: boolean;
  banned: { reason: string | null; at: string | null; by: string | null } | null;
  deleted: boolean;
  /** the Stores tab: memberships with the store's state */
  stores: { storeId: string; handle: string | null; name: string; role: string; status: string; storeStatus: StoreStatus; joinedAt: string; lastActiveAt: string | null }[];
  /** whether this staff member may act on the account (not oneself, not staff, users.manage) */
  canManage: boolean;
}

async function userMemberships(userId: string) {
  // tenancy: platform people: one user's memberships across stores (sm_user_idx), the profile's Stores tab
  return db
    .select({ storeId: storeMembers.storeId, role: storeMembers.role, status: storeMembers.status, joinedAt: storeMembers.joinedAt, lastActiveAt: storeMembers.lastActiveAt, handle: stores.handle, name: stores.name, storeStatus: stores.status })
    .from(storeMembers)
    .innerJoin(stores, eq(stores.id, storeMembers.storeId))
    .where(eq(storeMembers.userId, userId))
    .orderBy(asc(stores.name))
    .limit(200);
}

/** The newest ban's author (the `platform.user.banned` row). */
async function bannedBy(userId: string): Promise<string | null> {
  // tenancy: platform people: the user's newest ban row (a platform event, store_id NULL)
  const [row] = await db
    .select({ by: users.name })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.userId))
    .where(and(eq(auditLog.action, "platform.user.banned"), eq(auditLog.target, userId)))
    .orderBy(desc(auditLog.id))
    .limit(1);
  return row?.by ?? null;
}

/** PLA-§11.2 header and Stores tab (`console.read`); null for an unknown id. */
export async function getUserProfile(ctx: PlatformCtx, userId: string): Promise<UserProfile | null> {
  requireRead(ctx);
  if (!ID_RE.test(userId)) return null;
  const u = await getUserById(userId);
  if (!u) return null;
  const [memberships, by] = await Promise.all([userMemberships(userId), u.disabled && ctx.role !== "analyst" ? bannedBy(userId) : Promise.resolve(null)]);
  const contact = sellerContact(ctx.role, { email: u.email, phone: u.phone });
  const role = isPlatformRole(u.platformRole) ? u.platformRole : "none";
  return {
    id: u.id,
    name: u.name,
    email: contact.email,
    phone: contact.phone,
    locale: u.locale,
    createdAt: u.createdAt.toISOString(),
    lastLoginAt: iso(u.lastLoginAt),
    platformRole: role,
    twoFactor: u.totpEnabled,
    banned: u.disabled && u.disabledReason !== "deleted" ? { reason: u.disabledReason, at: iso(u.disabledAt), by } : null,
    deleted: u.disabledReason === "deleted",
    stores: memberships.map((m) => ({ storeId: m.storeId, handle: m.handle, name: m.name, role: m.role, status: m.status, storeStatus: m.storeStatus, joinedAt: m.joinedAt.toISOString(), lastActiveAt: iso(m.lastActiveAt) })),
    canManage: ctx.can("users.manage") && userId !== ctx.user.id && role === "none" && u.disabledReason !== "deleted",
  };
}

/** The Sessions tab: device, created, last seen, the IP masked, the view-as marker. */
export async function userSessions(ctx: PlatformCtx, userId: string): Promise<{ id: string; device: string; createdAt: string; lastSeenAt: string; ip: Masked; viewing: boolean }[]> {
  requireRead(ctx);
  if (!ID_RE.test(userId)) return [];
  const rows = await db
    .select({ id: sessions.id, ua: sessions.ua, ip: sessions.ip, createdAt: sessions.createdAt, lastSeenAt: sessions.lastSeenAt, impersonationId: sessions.impersonationId })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), gte(sessions.expiresAt, new Date())))
    .orderBy(desc(sessions.lastSeenAt))
    .limit(50);
  return rows.map((r) => ({ id: r.id.slice(0, 8), device: describeUserAgent(r.ua), createdAt: r.createdAt.toISOString(), lastSeenAt: r.lastSeenAt.toISOString(), ip: maskIp(r.ip), viewing: r.impersonationId !== null }));
}

/** The Sign-up tab: the user's reviews (store, score, band, decision). */
export async function userSignups(ctx: PlatformCtx, userId: string): Promise<{ id: string; storeId: string; handle: string | null; kind: string; score: number; band: string; status: string; createdAt: string; decidedAt: string | null }[]> {
  requireRead(ctx);
  if (!ID_RE.test(userId)) return [];
  // tenancy: platform people: one user's review rows across stores (codes and numbers only)
  const rows = await db
    .select({ id: signupReviews.id, storeId: signupReviews.storeId, handle: stores.handle, kind: signupReviews.kind, score: signupReviews.score, band: signupReviews.band, status: signupReviews.status, createdAt: signupReviews.createdAt, decidedAt: signupReviews.decidedAt })
    .from(signupReviews)
    .innerJoin(stores, eq(stores.id, signupReviews.storeId))
    .where(eq(signupReviews.userId, userId))
    .orderBy(desc(signupReviews.createdAt))
    .limit(50);
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString(), decidedAt: iso(r.decidedAt) }));
}

/** The Linked tab: users sharing an identity link (kinds, their stores count, ban state; e-mails masked). */
export async function userLinked(ctx: PlatformCtx, userId: string): Promise<{ userId: string; name: string; email: Masked; kinds: string[]; banned: boolean; stores: number }[]> {
  requireRead(ctx);
  if (!ID_RE.test(userId)) return [];
  const mine = await db.select({ kind: identityLinks.kind, valueHash: identityLinks.valueHash }).from(identityLinks).where(eq(identityLinks.userId, userId)).limit(80);
  if (!mine.length) return [];
  const others = await db
    .select({ userId: identityLinks.userId, kind: identityLinks.kind })
    .from(identityLinks)
    .where(and(or(...mine.map((l) => and(eq(identityLinks.kind, l.kind), eq(identityLinks.valueHash, l.valueHash)))), ne(identityLinks.userId, userId)))
    .limit(200);
  const kinds = new Map<string, Set<string>>();
  for (const o of others) (kinds.get(o.userId) ?? kinds.set(o.userId, new Set()).get(o.userId)!).add(o.kind);
  const ids = [...kinds.keys()].slice(0, 50);
  if (!ids.length) return [];
  const [people, counts] = await Promise.all([db.select({ id: users.id, name: users.name, email: users.email, disabled: users.disabled }).from(users).where(inArray(users.id, ids)), membershipCounts(ids)]);
  return people.map((p) => ({ userId: p.id, name: p.name, email: maskEmail(p.email), kinds: [...(kinds.get(p.id) ?? [])], banned: p.disabled, stores: counts.get(p.id)?.member ?? 0 }));
}

/** The Activity tab: audit rows by this user (platform and store rows; `audit.platform`), keyset by id. */
export async function userActivity(ctx: PlatformCtx, userId: string, beforeId: number | null = null): Promise<{ rows: { id: number; at: string; action: string; storeId: string | null; actorKind: string; target: string | null }[]; next: number | null }> {
  requireRead(ctx);
  if (!ctx.can("audit.platform")) throw new AuthRefusal("forbidden");
  if (!ID_RE.test(userId)) return { rows: [], next: null };
  // tenancy: platform people: one user's audit rows across stores (the user's own trail; meta is not returned)
  const rows = await db
    .select({ id: auditLog.id, at: auditLog.createdAt, action: auditLog.action, storeId: auditLog.storeId, actorKind: auditLog.actorKind, target: auditLog.target })
    .from(auditLog)
    .where(and(eq(auditLog.userId, userId), beforeId !== null && Number.isSafeInteger(beforeId) ? lt(auditLog.id, beforeId) : undefined))
    .orderBy(desc(auditLog.id))
    .limit(PEOPLE_PAGE + 1);
  const page = rows.slice(0, PEOPLE_PAGE);
  return { rows: page.map((r) => ({ ...r, at: r.at.toISOString() })), next: rows.length > PEOPLE_PAGE ? (page[page.length - 1]?.id ?? null) : null };
}

/* ------------------------------------------------------------------ */
/* Account actions (PLA-§11.2; T2's functions)                         */
/* ------------------------------------------------------------------ */

const reasonText = z.string().trim().min(2).max(200);
const noteText = z.string().trim().max(500).optional();
const target = z.string().regex(ID_RE);

export const BanInput = z.object({ userId: target, reason: reasonText, note: noteText, suspendStores: z.boolean().optional() });
export const UnbanInput = z.object({ userId: target, note: noteText });
export const ReasonInput = z.object({ userId: target, reason: reasonText });
export const DeleteInput = z.object({ userId: target, reason: reasonText, note: noteText });

function parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const r = schema.safeParse(input);
  if (!r.success) throw new FieldsError({ [String(r.error.issues[0]?.path[0] ?? "userId")]: "console.people.invalid" });
  return r.data;
}

/** `users.manage` ↑, the bucket, never oneself (T2 refuses it too, and staff targets: `is_staff`). */
async function guard(ctx: PlatformCtx, userId: string): Promise<void> {
  if (!ctx.can("users.manage")) throw new AuthRefusal("forbidden");
  if (!ctx.stepUpFresh) throw new AuthRefusal("step_up");
  if (userId === ctx.user.id) throw new AuthRefusal("forbidden", "auth.staff.not_yourself");
  if (!(await rateLimit(platformBucket("users:manage", ctx.user.id), USER_ACTIONS_PER_HOUR, 3_600)).ok) throw new AuthRefusal("rate_limited");
}

/** The stores where `userId` is the only active owner (a ban may suspend them). */
async function soleOwnerStores(userId: string): Promise<{ id: string; handle: string | null; status: StoreStatus }[]> {
  // tenancy: platform people: the stores a banned user owns alone (store ids and states; sm_user_idx then the owners per store)
  const owned = await db
    .select({ storeId: storeMembers.storeId, status: stores.status, handle: stores.handle })
    .from(storeMembers)
    .innerJoin(stores, eq(stores.id, storeMembers.storeId))
    .where(and(eq(storeMembers.userId, userId), eq(storeMembers.role, "owner"), eq(storeMembers.status, "active")));
  if (!owned.length) return [];
  // tenancy: platform people: the other active owners of those stores (counts only)
  const others = await db
    .select({ storeId: storeMembers.storeId, n: sql<number>`COUNT(*)` })
    .from(storeMembers)
    .where(and(inArray(storeMembers.storeId, owned.map((o) => o.storeId)), eq(storeMembers.role, "owner"), eq(storeMembers.status, "active"), ne(storeMembers.userId, userId)))
    .groupBy(storeMembers.storeId);
  const shared = new Set(others.filter((o) => Number(o.n) > 0).map((o) => o.storeId));
  return owned.filter((o) => !shared.has(o.storeId)).map((o) => ({ id: o.storeId, handle: o.handle, status: o.status }));
}

/** Ban: T2's `banUser`, then (optional, `stores.lifecycle`) the sole-owner stores suspended with `owner_banned`. */
export async function banPerson(ctx: PlatformCtx, input: unknown): Promise<{ banned: true; suspended: string[]; skipped: string[] }> {
  const v = parse(BanInput, input);
  await guard(ctx, v.userId);
  await banUser(ctx, v.userId, { reason: v.reason, ...(v.note ? { note: v.note } : {}) });
  const suspended: string[] = [];
  const skipped: string[] = [];
  if (v.suspendStores) {
    if (!ctx.can("stores.lifecycle")) throw new AuthRefusal("forbidden");
    for (const s of await soleOwnerStores(v.userId)) {
      if (s.status !== "active" && s.status !== "restricted" && s.status !== "pending") {
        skipped.push(s.id);
        continue;
      }
      try {
        await transitionStore(ctx, s.id, "suspended", { reason: "owner_banned", ...(v.note ? { note: v.note } : {}) });
        suspended.push(s.id);
      } catch (err) {
        recordPlatformError("people ban: suspend store", err, { storeId: s.id });
        skipped.push(s.id);
      }
    }
  }
  return { banned: true, suspended, skipped };
}

export async function unbanPerson(ctx: PlatformCtx, input: unknown): Promise<void> {
  const v = parse(UnbanInput, input);
  await guard(ctx, v.userId);
  await unbanUser(ctx, v.userId, v.note);
}

export async function resetPersonTwoFactor(ctx: PlatformCtx, input: unknown): Promise<void> {
  const v = parse(ReasonInput, input);
  await guard(ctx, v.userId);
  await resetUserTwoFactor(ctx, v.userId, v.reason);
}

/**
 * A single-use reset link, shown once (never stored or logged here), with the WhatsApp share when the user's phone is
 * known (`https://wa.me/<digits>`; the console builds the text from `console.reset.wa_text`).
 */
export async function createPersonResetLink(ctx: PlatformCtx, input: unknown): Promise<{ url: string; expiresAt: string; waTo: string | null }> {
  const v = parse(ReasonInput, input);
  await guard(ctx, v.userId);
  const link = await createPasswordResetLink(ctx, v.userId, v.reason);
  const u = await getUserById(v.userId);
  return { url: link.url, expiresAt: link.expiresAt.toISOString(), waTo: u?.phone && E164_RE.test(u.phone) ? u.phone.slice(1) : null };
}

/** Sign out everywhere: every session of the user ends; audit `platform.user.signed_out`. */
export async function signOutPerson(ctx: PlatformCtx, input: unknown): Promise<{ sessions: number }> {
  const v = parse(ReasonInput, input);
  await guard(ctx, v.userId);
  const u = await getUserById(v.userId);
  if (!u || u.disabledReason === "deleted") throw new AuthRefusal("not_found");
  if (u.platformRole !== "none") throw new AuthRefusal("is_staff");
  const n = await revokeUserSessions(v.userId);
  await auditFrom(ctx, "platform.user.signed_out", { target: v.userId, meta: { reason: v.reason, sessions: n } });
  return { sessions: n };
}

/** The stores that block a deletion (`owns_store`): every store the user owns that is not purged. */
export async function ownedStoresBlocking(userId: string): Promise<{ id: string; handle: string | null; name: string; status: StoreStatus }[]> {
  if (!ID_RE.test(userId)) return [];
  // tenancy: platform people: the stores a user owns (the deletion dialog's list; ids, names and states)
  return db
    .select({ id: stores.id, handle: stores.handle, name: stores.name, status: stores.status })
    .from(storeMembers)
    .innerJoin(stores, eq(stores.id, storeMembers.storeId))
    .where(and(eq(storeMembers.userId, userId), eq(storeMembers.role, "owner"), ne(stores.status, "purged")))
    .limit(50);
}

export type DeleteResult = { deleted: true } | { deleted: false; refusal: "owns_store"; stores: { id: string; handle: string | null; name: string; status: StoreStatus }[] } | { deleted: false; refusal: "is_staff" };

/**
 * PD81 / SEC-20 (`users.manage` ↑): T2's `deleteUserAccount` (anonymises the account, deletes its links, sessions,
 * resets and reads, keeps the audit; audit `platform.user.deleted` without the e-mail). A refusal comes back as data:
 * `owns_store` with the stores to close first (their profiles linked), or `is_staff` (demote first, §14.1).
 */
export async function deletePerson(ctx: PlatformCtx, input: unknown): Promise<DeleteResult> {
  const v = parse(DeleteInput, input);
  await guard(ctx, v.userId);
  try {
    await deleteUserAccount(ctx, { userId: v.userId, reason: v.reason });
    return { deleted: true };
  } catch (err) {
    if (err instanceof AuthRefusal && err.code === "owns_store") return { deleted: false, refusal: "owns_store", stores: await ownedStoresBlocking(v.userId) };
    if (err instanceof AuthRefusal && err.code === "is_staff") return { deleted: false, refusal: "is_staff" };
    throw err;
  }
}
