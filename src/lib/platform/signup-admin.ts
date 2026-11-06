import "server-only";
/**
 * Sign-up admin (platform.md PLA-§3.3, §3.6 "Ceilings", §13.2; PL-01, PL-02, D69): the Invite codes and Waitlist tabs
 * of `/admin/settings/signup` and the two sandbox meters the console shows beside them. Every function needs
 * `signups.decide` (admin+, PLA-§M.1: codes are daily operations although they live under Settings).
 *
 *   await listInviteCodes(ctx)                                   // label, uses 3 / 10, expiry, state chip
 *   await createInviteCode(ctx, { label, usesMax, expiresInDays, autoApprove })   // the code, shown once
 *   await inviteWaitlist(ctx, { ids })                           // one single-use 30-day code per row
 *   await todaysSandboxes()  ·  await pendingMediaBudget()       // the D69 ceilings as meters
 *
 * The codes are T2's (`createPlatformInvite` / `revokePlatformInvite`, src/lib/auth/platform-invites.ts): only the
 * hash is stored, the code exists once in the answer. The console never sends anything itself (R1): the result lists
 * each code with the applicant's contact for Copy / WhatsApp, which the staff member taps. Codes, the waitlist and
 * the counters are platform tables; one statement reads across stores (the five largest pending stores' media,
 * annotated).
 */
import { and, desc, eq, inArray, lt, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { auditFrom } from "@/lib/audit";
import { PLATFORM_TIMEZONE } from "@/lib/auth/config";
import { AuthRefusal } from "@/lib/auth/errors";
import { createPlatformInvite, revokePlatformInvite } from "@/lib/auth/platform-invites";
import { db } from "@/lib/db/client";
import { platformInvites, stores, storeUsage, users, waitlist } from "@/lib/db/schema";
import { getPlatformSetting } from "@/lib/settings";
import { periodOf } from "@/lib/tenancy/entitlement-keys";
import { platformUsageValue } from "@/lib/tenancy/usage";
import type { PlatformCtx } from "@/lib/tenancy/types";
import { decodeCursor, encodeCursor } from "./cursor";
import { maskEmail, sellerContact, type Masked } from "./mask";
import { id26 } from "./queue-rules";
import { phoneCountryOf } from "./signup-risk";

const MiB = 1024 * 1024;
/** PLA-§L: list page size */
export const SIGNUP_PAGE_SIZE = 50;
/** PLA-§L: "Invite selected" takes at most 100 rows per call */
export const WAITLIST_BATCH_MAX = 100;
/** PLA-§3.3: a waitlist code is single-use and lives 30 days */
export const WAITLIST_CODE_DAYS = 30;
/** the meter's list of the largest pending stores */
const LARGEST_N = 5;

function requireDecide(ctx: PlatformCtx): void {
  if (!ctx.can("signups.decide")) throw new AuthRefusal("forbidden");
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

/** A keyset over (created_at desc, id desc): the cursor holds the last row's time and id. */
function keysetAfter(cursor: string | null, createdAt: typeof platformInvites.createdAt | typeof waitlist.createdAt, id: typeof platformInvites.id | typeof waitlist.id): SQL | undefined {
  const k = decodeCursor(cursor);
  if (!k || k.length !== 2 || typeof k[0] !== "number" || typeof k[1] !== "string") return undefined;
  const at = new Date(k[0]);
  return or(lt(createdAt, at), and(eq(createdAt, at), lt(id, k[1])));
}

/* ------------------------------------------------------------------ */
/* Invite codes (PLA-§3.3)                                             */
/* ------------------------------------------------------------------ */

export type InviteState = "active" | "used_up" | "expired" | "revoked";

/** The state chip (pure): revoked, then expired, then used up, else active. */
export function inviteStateOf(row: { uses: number; usesMax: number; expiresAt: Date | null; revokedAt: Date | null }, now: Date): InviteState {
  if (row.revokedAt) return "revoked";
  if (row.expiresAt && row.expiresAt.getTime() <= now.getTime()) return "expired";
  if (row.uses >= row.usesMax) return "used_up";
  return "active";
}

export interface InviteCodeRow {
  id: string;
  label: string | null;
  uses: number;
  usesMax: number;
  autoApprove: boolean;
  expiresAt: string | null;
  createdAt: string;
  createdBy: { id: string; name: string | null };
  state: InviteState;
}

/** One page of codes, newest first. */
export async function listInviteCodes(ctx: PlatformCtx, cursor: string | null = null, now: Date = new Date()): Promise<{ rows: InviteCodeRow[]; next: string | null }> {
  requireDecide(ctx);
  const rows = await db
    .select({
      id: platformInvites.id,
      label: platformInvites.label,
      uses: platformInvites.uses,
      usesMax: platformInvites.usesMax,
      autoApprove: platformInvites.autoApprove,
      expiresAt: platformInvites.expiresAt,
      revokedAt: platformInvites.revokedAt,
      createdAt: platformInvites.createdAt,
      createdBy: platformInvites.createdBy,
      creator: users.name,
    })
    .from(platformInvites)
    .leftJoin(users, eq(users.id, platformInvites.createdBy))
    .where(keysetAfter(cursor, platformInvites.createdAt, platformInvites.id))
    .orderBy(desc(platformInvites.createdAt), desc(platformInvites.id))
    .limit(SIGNUP_PAGE_SIZE + 1);
  const page = rows.slice(0, SIGNUP_PAGE_SIZE);
  const last = page[page.length - 1];
  return {
    rows: page.map((r) => ({
      id: r.id,
      label: r.label,
      uses: r.uses,
      usesMax: r.usesMax,
      autoApprove: r.autoApprove,
      expiresAt: iso(r.expiresAt),
      createdAt: r.createdAt.toISOString(),
      createdBy: { id: r.createdBy, name: r.creator ?? null },
      state: inviteStateOf(r, now),
    })),
    next: rows.length > SIGNUP_PAGE_SIZE && last ? encodeCursor([last.createdAt.getTime(), last.id]) : null,
  };
}

const NewCodeInput = z.object({
  label: z.string().max(200),
  usesMax: z.number().int().optional(),
  expiresInDays: z.union([z.literal(7), z.literal(30), z.literal(90), z.null()]).optional(),
  autoApprove: z.boolean().optional(),
});

/** "New code" (PLA-§3.3): T2's `createPlatformInvite` checks the label (2-120), the uses (1-500) and the expiry, and audits. */
export async function createInviteCode(ctx: PlatformCtx, input: unknown): Promise<{ id: string; code: string; expiresAt: string | null }> {
  requireDecide(ctx);
  const v = NewCodeInput.parse(input);
  const res = await createPlatformInvite(ctx, {
    label: v.label,
    ...(v.usesMax !== undefined ? { usesMax: v.usesMax } : {}),
    expiresInDays: v.expiresInDays ?? null,
    autoApprove: v.autoApprove === true,
  });
  return { id: res.id, code: res.code, expiresAt: iso(res.expiresAt) };
}

/** Revoke sets `revoked_at` (idempotent; T2 audits `platform.invite.revoked`). */
export async function revokeInviteCode(ctx: PlatformCtx, inviteId: unknown): Promise<void> {
  requireDecide(ctx);
  await revokePlatformInvite(ctx, id26.parse(inviteId));
}

/* ------------------------------------------------------------------ */
/* The waitlist (PLA-§3.3, D69)                                        */
/* ------------------------------------------------------------------ */

export type WaitlistStatus = "waiting" | "invited" | "dropped";

/** The source chip (pure): "cap:<day>" rows joined because the daily sandbox ceiling was reached that day. */
export function waitlistSourceOf(source: string | null): { kind: "daily_cap"; day: string } | { kind: "label"; label: string } | null {
  if (!source) return null;
  const cap = /^cap:(\d{4}-\d{2}-\d{2})$/.exec(source);
  return cap ? { kind: "daily_cap", day: cap[1]! } : { kind: "label", label: source };
}

export interface WaitlistRow {
  id: string;
  email: Masked;
  phoneCountry: string | null;
  market: string | null;
  modeInterest: "landing" | "store" | "both" | null;
  source: ReturnType<typeof waitlistSourceOf>;
  status: WaitlistStatus;
  createdAt: string;
  invitedAt: string | null;
}

export interface WaitlistFilter {
  status?: WaitlistStatus;
  market?: string;
  /** "cap" = the daily-cap rows only */
  source?: "cap";
}

const WaitlistFilterSchema = z.object({
  status: z.enum(["waiting", "invited", "dropped"]).optional(),
  market: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .optional(),
  source: z.literal("cap").optional(),
});

/** One page of the waitlist, newest first (`wl_status_idx` when a status is chosen); e-mails masked for every role. */
export async function listWaitlist(ctx: PlatformCtx, filter: WaitlistFilter = {}, cursor: string | null = null): Promise<{ rows: WaitlistRow[]; next: string | null }> {
  requireDecide(ctx);
  const f = WaitlistFilterSchema.parse(filter);
  const rows = await db
    .select()
    .from(waitlist)
    .where(
      and(
        f.status ? eq(waitlist.status, f.status) : undefined,
        f.market ? eq(waitlist.market, f.market) : undefined,
        f.source === "cap" ? sql`${waitlist.source} LIKE 'cap:%'` : undefined,
        keysetAfter(cursor, waitlist.createdAt, waitlist.id),
      ),
    )
    .orderBy(desc(waitlist.createdAt), desc(waitlist.id))
    .limit(SIGNUP_PAGE_SIZE + 1);
  const page = rows.slice(0, SIGNUP_PAGE_SIZE);
  const last = page[page.length - 1];
  return {
    rows: page.map((r) => ({
      id: r.id,
      email: maskEmail(r.emailNorm),
      phoneCountry: r.phone ? phoneCountryOf(r.phone) : null,
      market: r.market,
      modeInterest: r.modeInterest,
      source: waitlistSourceOf(r.source),
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      invitedAt: iso(r.invitedAt),
    })),
    next: rows.length > SIGNUP_PAGE_SIZE && last ? encodeCursor([last.createdAt.getTime(), last.id]) : null,
  };
}

const BatchInput = z.object({ ids: z.array(id26).min(1).max(WAITLIST_BATCH_MAX) });

export interface WaitlistInvite {
  id: string;
  /** the applicant's contact per PD35 (admin+ read it in full: they send the code themselves) */
  email: string | Masked;
  code: string;
  expiresAt: string | null;
}

/** The label of a waitlist code: "Waitlist <platform day>". */
export function waitlistLabel(now: Date): string {
  return `Waitlist ${periodOf("day", now, PLATFORM_TIMEZONE)}`;
}

/**
 * "Invite selected" (≤ 100 rows): each row still `waiting` is claimed (compare-and-set → `invited`), gets one
 * single-use 30-day code, and the code's id is kept on the row. A row another staff member took meanwhile is skipped.
 * Audit `platform.waitlist.invited { count, skipped }` (and T2's `platform.invite.created` per code).
 */
export async function inviteWaitlist(ctx: PlatformCtx, input: unknown, now: Date = new Date()): Promise<{ invited: WaitlistInvite[]; skipped: string[] }> {
  requireDecide(ctx);
  const ids = [...new Set(BatchInput.parse(input).ids)];
  const rows = await db.select({ id: waitlist.id, emailNorm: waitlist.emailNorm, phone: waitlist.phone }).from(waitlist).where(inArray(waitlist.id, ids));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const label = waitlistLabel(now);
  const invited: WaitlistInvite[] = [];
  const skipped: string[] = [];
  for (const id of ids) {
    const row = byId.get(id);
    const [claim] = row
      ? await db
          .update(waitlist)
          .set({ status: "invited", invitedAt: now, invitedBy: ctx.user.id })
          .where(and(eq(waitlist.id, id), eq(waitlist.status, "waiting")))
      : [{ affectedRows: 0 }];
    if (!row || claim.affectedRows !== 1) {
      skipped.push(id);
      continue;
    }
    try {
      const code = await createPlatformInvite(ctx, { label, usesMax: 1, expiresInDays: WAITLIST_CODE_DAYS, autoApprove: false });
      await db.update(waitlist).set({ inviteId: code.id }).where(eq(waitlist.id, id));
      invited.push({ id, email: sellerContact(ctx.role, { email: row.emailNorm, phone: null }).email, code: code.code, expiresAt: iso(code.expiresAt) });
    } catch (err) {
      // the row waits again; the batch goes on
      await db.update(waitlist).set({ status: "waiting", invitedAt: null, invitedBy: null }).where(and(eq(waitlist.id, id), eq(waitlist.status, "invited")));
      skipped.push(id);
      if (err instanceof AuthRefusal) throw err;
    }
  }
  if (invited.length) await auditFrom(ctx, "platform.waitlist.invited", { meta: { count: invited.length, skipped: skipped.length } });
  return { invited, skipped };
}

/** "Drop" (≤ 100 rows): waiting or invited rows become `dropped`. Audit `platform.waitlist.dropped { count }`. */
export async function dropWaitlist(ctx: PlatformCtx, input: unknown): Promise<{ dropped: number }> {
  requireDecide(ctx);
  const ids = [...new Set(BatchInput.parse(input).ids)];
  const [res] = await db
    .update(waitlist)
    .set({ status: "dropped" })
    .where(and(inArray(waitlist.id, ids), inArray(waitlist.status, ["waiting", "invited"])));
  if (res.affectedRows > 0) await auditFrom(ctx, "platform.waitlist.dropped", { meta: { count: res.affectedRows } });
  return { dropped: res.affectedRows };
}

/* ------------------------------------------------------------------ */
/* The sandbox ceilings as meters (PLA-§3.6, D69)                      */
/* ------------------------------------------------------------------ */

export interface SandboxMeter {
  /** the platform day (Africa/Casablanca) the counter belongs to */
  day: string;
  used: number;
  limit: number;
  /** used ≥ limit: new applicants join the waitlist with source "cap:<day>" */
  full: boolean;
}

/** Sandboxes created today (`platform_usage` `pending_stores` of the platform day) against `signup.pendingStoresPerDay`. */
export async function todaysSandboxes(now: Date = new Date()): Promise<SandboxMeter> {
  const day = periodOf("day", now, PLATFORM_TIMEZONE);
  const [used, setting] = await Promise.all([platformUsageValue("pending_stores", day), getPlatformSetting("platform")]);
  const limit = setting.signup.pendingStoresPerDay;
  return { day, used, limit, full: used >= limit };
}

export interface PendingMediaMeter {
  usedBytes: number;
  limitBytes: number;
  /** stores in `pending` now */
  pendingStores: number;
  /** the five pending stores holding the most media */
  largest: { storeId: string; handle: string | null; name: string; bytes: number }[];
}

/** The shared disk budget of stores in review (`pending_media_bytes` against `signup.pendingMediaTotalMiB`). */
export async function pendingMediaBudget(): Promise<PendingMediaMeter> {
  const [usedBytes, setting, countRow, largest] = await Promise.all([
    platformUsageValue("pending_media_bytes", "total"),
    getPlatformSetting("platform"),
    db.select({ n: sql<number>`COUNT(*)` }).from(stores).where(eq(stores.status, "pending")),
    // tenancy: platform the sandbox meter (PLA-§3.6, D69): the media gauge of the five largest pending stores, a number per store
    db
      .select({ storeId: storeUsage.storeId, handle: stores.handle, name: stores.name, bytes: storeUsage.value })
      .from(storeUsage)
      .innerJoin(stores, eq(stores.id, storeUsage.storeId))
      .where(and(eq(stores.status, "pending"), eq(storeUsage.metric, "media_bytes"), eq(storeUsage.period, "total")))
      .orderBy(desc(storeUsage.value))
      .limit(LARGEST_N),
  ]);
  return {
    usedBytes,
    limitBytes: setting.signup.pendingMediaTotalMiB * MiB,
    pendingStores: Number(countRow[0]?.n ?? 0),
    largest: largest.filter((r) => Number(r.bytes) > 0).map((r) => ({ storeId: r.storeId, handle: r.handle, name: r.name, bytes: Number(r.bytes) })),
  };
}
