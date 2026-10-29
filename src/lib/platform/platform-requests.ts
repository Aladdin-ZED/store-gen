import "server-only";
/**
 * Dangerous platform actions that need a second person or a delay (platform.md PLA-§2.2 `platform_requests`, §8.1,
 * §14.1; PD7, SE-04; core §A.5.1 "any → purged"). Two kinds:
 *   - `store_purge`: only while the store is `closed` or `scheduled_deletion`; `four_eyes` (a second staff member with
 *     `stores.purge` confirms, then the job executes on its next tick) or `delayed` (executes 24 h after the request
 *     unless cancelled). Execution moves the store to `scheduled_deletion` with `purge_after = now` and the purge job
 *     (core §H.9) takes over;
 *   - `staff_super_admin`: a promotion to super_admin, `four_eyes` when at least two super_admins exist, else
 *     `delayed` 24 h. Execution sets `platform_role` and signs the person out everywhere.
 *
 *   await requestPurge(ctx, { storeId, mode: "four_eyes", reason: "legal_request", typedHandle, typedWord: "purge" });
 *   await confirmPlatformRequest(ctx, { requestId, typedHandle });   // never by its requester (SQL: confirmed_by <> requested_by)
 *   await runDueRequests(new Date());                               // the platform.requests job (slot 9)
 *
 * Rules (PLA-§2.2): one pending request per store and kind (`already_requested`); a four-eyes request expires after 7
 * days unconfirmed; the requester can never confirm their own request, checked in the compare-and-set and by the
 * table's CHECK (`preq_four_eyes_ck`); the requester or any super_admin may cancel until it executes. Every other
 * super_admin is told (`staff.purge_requested`, `staff.super_admin_requested`, `staff.purge_confirmed`).
 *
 * The ledger is platform bookkeeping: a store's rows are written through that store's system seam, the store-less
 * staff rows and the reads by id / due time are the annotated statements of this file.
 */
import { and, eq, inArray, isNull, lte, ne, or, type SQL } from "drizzle-orm";
import { z } from "zod";
import { auditFrom } from "@/lib/audit";
import { AuthRefusal, FieldsError } from "@/lib/auth/errors";
import { revokeUserSessions } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { newId } from "@/lib/db/ids";
import { platformRequests, stores, users } from "@/lib/db/schema";
import { systemCtx, systemScope } from "@/lib/jobs/scope";
import { errorSummary } from "@/lib/orders/log";
import { invalidateStore } from "@/lib/tenancy/cache";
import { transitionStore } from "@/lib/tenancy/lifecycle";
import { inStore, storeValues, whereStore } from "@/lib/tenancy/sql";
import type { PlatformCtx, StoreStatus, SystemCtx, WriteScope } from "@/lib/tenancy/types";
import { recordPlatformError } from "./log";
import { notify } from "./notify";
import { NOTE_MAX, id26, optionalText } from "./queue-rules";
import { PURGE_REASONS } from "./reasons";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** PLA-§2.2: a delayed request executes this long after it was made */
export const PLATFORM_REQUEST_DELAY_MS = DAY;
/** PLA-§2.2, §L: an unconfirmed four-eyes request expires after 7 days */
export const PLATFORM_REQUEST_TTL_DAYS = 7;
/** the job executes at most this many due rows per tick */
const DUE_BATCH = 20;
/** the store states a purge may be requested in (PLA-§2.2) */
export const PURGEABLE: readonly StoreStatus[] = ["closed", "scheduled_deletion"];

export type PlatformRequestRow = typeof platformRequests.$inferSelect;
type RequestSet = Partial<Omit<typeof platformRequests.$inferInsert, "id" | "storeId" | "kind" | "requestedBy" | "requestedAt">>;
type NewRequest = Omit<typeof platformRequests.$inferInsert, "storeId">;

/* ------------------------------------------------------------------ */
/* The ledger                                                          */
/* ------------------------------------------------------------------ */

/** Ledger rows matching `cond` (by id, due, expiring, or the store-less staff rows). */
async function readRequests(cond: SQL, limit = 50): Promise<PlatformRequestRow[]> {
  // tenancy: platform the dangerous-action ledger (PLA-§2.2 platform_requests: rows by id, due or expiring across stores, and the store-less staff rows; preq_due_idx)
  return db.select().from(platformRequests).where(cond).limit(limit);
}

async function requestById(id: string): Promise<PlatformRequestRow | null> {
  if (!/^[0-9A-Z]{26}$/.test(id)) return null;
  return (await readRequests(eq(platformRequests.id, id), 1))[0] ?? null;
}

/** A store's ledger rows are written through that store's system seam (staff bookkeeping, never a member write). */
const ledgerScope = (storeId: string): WriteScope => systemScope(systemCtx("platform.requests"), storeId);

async function insertStoreRequest(scope: WriteScope, row: NewRequest): Promise<void> {
  await db.insert(platformRequests).values(storeValues(scope, row));
}

async function insertStorelessRequest(row: NewRequest): Promise<void> {
  // tenancy: platform a store-less staff request (store_id NULL: the super_admin promotion, PD7)
  await db.insert(platformRequests).values({ ...row, storeId: null });
}

async function casStoreRequest(scope: WriteScope, id: string, from: readonly PlatformRequestRow["status"][], set: RequestSet, extra?: SQL): Promise<boolean> {
  const [res] = await db
    .update(platformRequests)
    .set(set)
    .where(whereStore(platformRequests, scope, eq(platformRequests.id, id), inArray(platformRequests.status, [...from]), extra));
  return res.affectedRows === 1;
}

async function casStorelessRequest(id: string, from: readonly PlatformRequestRow["status"][], set: RequestSet, extra?: SQL): Promise<boolean> {
  // tenancy: platform a store-less staff request's compare-and-set (store_id NULL, PD7)
  const [res] = await db
    .update(platformRequests)
    .set(set)
    .where(and(eq(platformRequests.id, id), isNull(platformRequests.storeId), inArray(platformRequests.status, [...from]), extra));
  return res.affectedRows === 1;
}

/** The compare-and-set on one ledger row (its status among `from`); true when this call won. */
function casRequest(row: Pick<PlatformRequestRow, "id" | "storeId">, from: readonly PlatformRequestRow["status"][], set: RequestSet, extra?: SQL): Promise<boolean> {
  return row.storeId ? casStoreRequest(ledgerScope(row.storeId), row.id, from, set, extra) : casStorelessRequest(row.id, from, set, extra);
}

/** The active super_admins (the four-eyes rule needs two; every other one is told). */
async function superAdmins(): Promise<string[]> {
  const rows = await db.select({ id: users.id }).from(users).where(and(eq(users.platformRole, "super_admin"), eq(users.disabled, false)));
  return rows.map((r) => r.id);
}

async function tellOtherSuperAdmins(except: readonly string[], send: (userId: string) => Promise<unknown>): Promise<void> {
  for (const id of (await superAdmins()).filter((u) => !except.includes(u))) {
    await send(id).catch((err: unknown) => recordPlatformError("platform request notify", err));
  }
}

/** PLA-§2.2: a second pending request for the same store (or person) and kind. */
const alreadyRequested = () => new AuthRefusal("already_requested", "console.request.already_requested");

const typedMatches = (typed: string | undefined, want: string | null) => !!want && typeof typed === "string" && typed.trim().toLowerCase() === want.toLowerCase();

/* ------------------------------------------------------------------ */
/* Store purge                                                         */
/* ------------------------------------------------------------------ */

const PurgeInput = z.object({
  storeId: id26,
  mode: z.enum(["four_eyes", "delayed"]),
  reason: z.enum(PURGE_REASONS),
  note: optionalText(NOTE_MAX),
  typedHandle: z.string().max(60).optional(),
  typedWord: z.string().max(20).optional(),
});

/**
 * `stores.purge` ↑ (PLA-§8.1 `requestPurgeAction`): the typed handle and the word "purge"; only for a `closed` or
 * `scheduled_deletion` store (`purge_not_closed`); `four_eyes` needs a second super_admin (`four_eyes_unavailable`);
 * one pending request per store (`already_requested`). Audit `platform.store.purge_requested`; every other super_admin
 * is told. Nothing changes for the store until the request executes.
 */
export async function requestPurge(ctx: PlatformCtx, input: unknown, now: Date = new Date()): Promise<{ id: string; mode: "four_eyes" | "delayed"; executeAfter: string | null }> {
  if (!ctx.can("stores.purge")) throw new AuthRefusal("forbidden");
  if (!ctx.stepUpFresh) throw new AuthRefusal("step_up");
  const v = PurgeInput.parse(input);
  if (v.reason === "other" && !v.note) throw new FieldsError({ note: "console.lifecycle.note_required" });
  const [store] = await db.select({ id: stores.id, handle: stores.handle, status: stores.status }).from(stores).where(eq(stores.id, v.storeId)).limit(1);
  if (!store || store.status === "purged") throw new AuthRefusal("not_found");
  if (!PURGEABLE.includes(store.status)) throw new AuthRefusal("purge_not_closed", "console.purge.not_closed");
  if (!typedMatches(v.typedHandle, store.handle) || v.typedWord?.trim().toLowerCase() !== "purge") throw new FieldsError({ typed: "console.lifecycle.typed_mismatch" });
  if (v.mode === "four_eyes" && (await superAdmins()).length < 2) throw new AuthRefusal("four_eyes_unavailable", "console.purge.four_eyes_unavailable");
  const open = () => readRequests(and(inStore(platformRequests, ledgerScope(store.id)), eq(platformRequests.kind, "store_purge"), inArray(platformRequests.status, ["pending", "confirmed"]))!);
  if ((await open()).length > 0) throw alreadyRequested();

  const id = newId();
  const executeAfter = v.mode === "delayed" ? new Date(now.getTime() + PLATFORM_REQUEST_DELAY_MS) : null;
  await insertStoreRequest(ledgerScope(store.id), {
    id,
    kind: "store_purge",
    mode: v.mode,
    payload: {},
    reasonCode: v.reason,
    reasonNote: v.note ?? null,
    requestedBy: ctx.user.id,
    requestedAt: now,
    executeAfter,
  });
  // two staff requesting at once: the older row stands, the younger one removes itself
  const rows = (await open()).sort((a, b) => a.requestedAt.getTime() - b.requestedAt.getTime() || a.id.localeCompare(b.id));
  if (rows.length > 1 && rows[0]!.id !== id) {
    await casStoreRequest(ledgerScope(store.id), id, ["pending"], { status: "cancelled", cancelledBy: ctx.user.id, cancelledAt: now, error: "duplicate" });
    throw alreadyRequested();
  }
  await auditFrom(ctx, "platform.store.purge_requested", { storeId: store.id, target: store.id, meta: { requestId: id, mode: v.mode, reason: v.reason, executeAfter: executeAfter?.toISOString() ?? null } });
  await tellOtherSuperAdmins([ctx.user.id], (userId) => notify({ audience: "user", userId, storeId: null }, "staff.purge_requested", { ...(store.handle ? { store: store.handle } : {}), by: ctx.user.id }));
  return { id, mode: v.mode, executeAfter: executeAfter?.toISOString() ?? null };
}

/* ------------------------------------------------------------------ */
/* Confirm, cancel                                                     */
/* ------------------------------------------------------------------ */

const permissionOf = (row: PlatformRequestRow) => (row.kind === "store_purge" ? "stores.purge" : "staff.manage") as "stores.purge" | "staff.manage";

const ConfirmInput = z.object({ requestId: id26, typedHandle: z.string().max(60).optional() });

/**
 * The second staff member (PD7): `stores.purge` ↑ for a purge (with the typed handle), `staff.manage` ↑ for a
 * promotion. Only a pending four-eyes request, never by its requester: the compare-and-set says
 * `requested_by <> me` and the table's CHECK refuses it anyway. The job executes it on its next tick.
 */
export async function confirmPlatformRequest(ctx: PlatformCtx, input: unknown, now: Date = new Date()): Promise<{ status: "confirmed"; executeAfter: string }> {
  const v = ConfirmInput.parse(input);
  const row = await requestById(v.requestId);
  if (!row) throw new AuthRefusal("not_found");
  if (!ctx.can(permissionOf(row))) throw new AuthRefusal("forbidden");
  if (!ctx.stepUpFresh) throw new AuthRefusal("step_up");
  if (row.requestedBy === ctx.user.id) throw new AuthRefusal("forbidden", "console.request.self_confirm");
  if (row.mode !== "four_eyes" || row.status !== "pending") throw new AuthRefusal("already_decided", "console.request.not_pending");
  let handle: string | null = null;
  if (row.kind === "store_purge" && row.storeId) {
    const [store] = await db.select({ handle: stores.handle }).from(stores).where(eq(stores.id, row.storeId)).limit(1);
    handle = store?.handle ?? null;
    if (!typedMatches(v.typedHandle, handle)) throw new FieldsError({ typed: "console.lifecycle.typed_mismatch" });
  }
  const won = await casRequest(row, ["pending"], { status: "confirmed", confirmedBy: ctx.user.id, confirmedAt: now, executeAfter: now }, and(eq(platformRequests.mode, "four_eyes"), ne(platformRequests.requestedBy, ctx.user.id)));
  if (!won) throw new AuthRefusal("already_decided", "console.request.not_pending");
  if (row.kind === "store_purge") {
    await auditFrom(ctx, "platform.store.purge_confirmed", { storeId: row.storeId, target: row.storeId ?? row.id, meta: { requestId: row.id, requestedBy: row.requestedBy } });
    await tellOtherSuperAdmins([ctx.user.id], (userId) => notify({ audience: "user", userId, storeId: null }, "staff.purge_confirmed", { ...(handle ? { store: handle } : {}), by: ctx.user.id }));
  } else {
    await auditFrom(ctx, "platform.staff.changed", { target: row.payload.targetUserId ?? row.id, meta: { requestId: row.id, step: "confirmed", to: "super_admin" } });
  }
  return { status: "confirmed", executeAfter: now.toISOString() };
}

/** The requester or any super_admin (PLA-§2.2), until the request executes. Audit `platform.request.cancelled`. */
export async function cancelPlatformRequest(ctx: PlatformCtx, input: unknown, now: Date = new Date()): Promise<{ status: "cancelled" }> {
  const { requestId } = z.object({ requestId: id26 }).parse(input);
  const row = await requestById(requestId);
  if (!row) throw new AuthRefusal("not_found");
  if (!ctx.can(permissionOf(row)) || (row.requestedBy !== ctx.user.id && ctx.role !== "super_admin")) throw new AuthRefusal("forbidden");
  if (!ctx.stepUpFresh) throw new AuthRefusal("step_up");
  const won = await casRequest(row, ["pending", "confirmed"], { status: "cancelled", cancelledBy: ctx.user.id, cancelledAt: now }, isNull(platformRequests.executedAt));
  if (!won) throw new AuthRefusal("already_decided", "console.request.not_pending");
  await auditFrom(ctx, "platform.request.cancelled", { storeId: row.storeId, target: row.storeId ?? row.id, meta: { requestId: row.id, kind: row.kind } });
  return { status: "cancelled" };
}

/* ------------------------------------------------------------------ */
/* Super-admin promotion                                               */
/* ------------------------------------------------------------------ */

const PromotionInput = z.object({ targetUserId: id26, note: optionalText(NOTE_MAX) });

/**
 * `staff.manage` ↑ (PLA-§14.1, SE-04): a staff member (admin, support or analyst) becomes super_admin through the
 * ledger: `four_eyes` when at least two super_admins exist (another one confirms), else `delayed` 24 h. One open
 * request per person. Audit `platform.staff.changed { step: "requested" }`; every other super_admin is told.
 */
export async function requestSuperAdminPromotion(ctx: PlatformCtx, input: unknown, now: Date = new Date()): Promise<{ id: string; mode: "four_eyes" | "delayed"; executeAfter: string | null }> {
  if (!ctx.can("staff.manage")) throw new AuthRefusal("forbidden");
  if (!ctx.stepUpFresh) throw new AuthRefusal("step_up");
  const v = PromotionInput.parse(input);
  if (v.targetUserId === ctx.user.id) throw new AuthRefusal("forbidden", "auth.staff.not_yourself");
  const [target] = await db.select({ id: users.id, role: users.platformRole, disabled: users.disabled }).from(users).where(eq(users.id, v.targetUserId)).limit(1);
  if (!target || target.disabled || target.role === "none") throw new AuthRefusal("not_found");
  if (target.role === "super_admin") throw new AuthRefusal("invalid", "console.staff.already_super_admin");
  const open = () =>
    readRequests(and(isNull(platformRequests.storeId), eq(platformRequests.kind, "staff_super_admin"), inArray(platformRequests.status, ["pending", "confirmed"]))!, 200).then((rows) =>
      rows.filter((r) => r.payload.targetUserId === target.id),
    );
  if ((await open()).length > 0) throw alreadyRequested();
  const mode = (await superAdmins()).length >= 2 ? "four_eyes" : "delayed";
  const id = newId();
  const executeAfter = mode === "delayed" ? new Date(now.getTime() + PLATFORM_REQUEST_DELAY_MS) : null;
  await insertStorelessRequest({ id, kind: "staff_super_admin", mode, payload: { targetUserId: target.id }, reasonCode: "staff_promotion", reasonNote: v.note ?? null, requestedBy: ctx.user.id, requestedAt: now, executeAfter });
  const rows = (await open()).sort((a, b) => a.requestedAt.getTime() - b.requestedAt.getTime() || a.id.localeCompare(b.id));
  if (rows.length > 1 && rows[0]!.id !== id) {
    await casStorelessRequest(id, ["pending"], { status: "cancelled", cancelledBy: ctx.user.id, cancelledAt: now, error: "duplicate" });
    throw alreadyRequested();
  }
  await auditFrom(ctx, "platform.staff.changed", { target: target.id, meta: { requestId: id, step: "requested", from: target.role, to: "super_admin", mode } });
  await tellOtherSuperAdmins([ctx.user.id], (userId) => notify({ audience: "user", userId, storeId: null }, "staff.super_admin_requested", { by: ctx.user.id }));
  return { id, mode, executeAfter: executeAfter?.toISOString() ?? null };
}

/* ------------------------------------------------------------------ */
/* The job (platform.requests, slot 9)                                 */
/* ------------------------------------------------------------------ */

/** Executes one claimed row; answers the error code to record, or null. */
async function execute(row: PlatformRequestRow, sys: SystemCtx, now: Date): Promise<string | null> {
  if (row.kind === "store_purge") {
    if (!row.storeId) return "no_store";
    const [store] = await db.select({ status: stores.status }).from(stores).where(eq(stores.id, row.storeId)).limit(1);
    if (!store || !PURGEABLE.includes(store.status)) return "store_not_closed";
    if (store.status === "closed") {
      await transitionStore(sys, row.storeId, "scheduled_deletion", { reason: row.reasonCode, purgeAt: now });
    } else {
      // already scheduled: the purge may start now (purge_after is not the status; the purge job reads it, core §H.9)
      await db.update(stores).set({ purgeAfter: now }).where(and(eq(stores.id, row.storeId), eq(stores.status, "scheduled_deletion")));
      invalidateStore(row.storeId);
      await auditFrom(sys, "store.deletion_scheduled", { storeId: row.storeId, target: row.storeId, meta: { from: "scheduled_deletion", to: "scheduled_deletion", reason: row.reasonCode, requestId: row.id, purgeAfter: now.toISOString() } });
    }
    return null;
  }
  const targetId = row.payload.targetUserId;
  const [target] = targetId ? await db.select({ id: users.id, role: users.platformRole, disabled: users.disabled }).from(users).where(eq(users.id, targetId)).limit(1) : [];
  if (!target || target.disabled || target.role === "none") return "target_not_staff";
  await db.update(users).set({ platformRole: "super_admin" }).where(eq(users.id, target.id));
  const sessions = await revokeUserSessions(target.id);
  await auditFrom(sys, "platform.staff.changed", { target: target.id, meta: { requestId: row.id, step: "executed", from: target.role, to: "super_admin", sessions } });
  return null;
}

export interface DueRequestsSummary {
  executed: number;
  failed: number;
  expired: number;
  done: boolean;
}

/**
 * The `platform.requests` job: four-eyes rows unconfirmed for 7 days become `expired`; due rows (a confirmed four-eyes
 * row, a delayed row past `execute_after`) are claimed with a compare-and-set (`executed`) and executed; a row that
 * cannot run records its reason in `error` and becomes `cancelled`. Stops starting rows at `deadline`.
 */
export async function runDueRequests(now: Date = new Date(), opts: { ctx?: SystemCtx; deadline?: number } = {}): Promise<DueRequestsSummary> {
  const sys = opts.ctx ?? systemCtx("platform.requests");
  const deadline = opts.deadline ?? Number.POSITIVE_INFINITY;
  const out: DueRequestsSummary = { executed: 0, failed: 0, expired: 0, done: true };

  const stale = await readRequests(and(eq(platformRequests.status, "pending"), eq(platformRequests.mode, "four_eyes"), lte(platformRequests.requestedAt, new Date(now.getTime() - PLATFORM_REQUEST_TTL_DAYS * DAY)))!, 200);
  for (const row of stale) if (await casRequest(row, ["pending"], { status: "expired" })) out.expired++;

  const due = await readRequests(
    or(
      and(eq(platformRequests.status, "confirmed"), lte(platformRequests.executeAfter, now)),
      and(eq(platformRequests.status, "pending"), eq(platformRequests.mode, "delayed"), lte(platformRequests.executeAfter, now)),
    )!,
    DUE_BATCH + 1,
  );
  for (const row of due.slice(0, DUE_BATCH)) {
    if (Date.now() >= deadline) {
      out.done = false;
      break;
    }
    // the claim: only one tick (or process) executes a row
    if (!(await casRequest(row, [row.status], { status: "executed", executedAt: now }, isNull(platformRequests.executedAt)))) continue;
    let error: string | null;
    try {
      error = await execute(row, sys, now);
    } catch (err) {
      error = `failed: ${errorSummary(err)}`.slice(0, 200);
      recordPlatformError("platform.requests execute", err, row.storeId ? { storeId: row.storeId } : {});
    }
    if (error) {
      out.failed++;
      await casRequest(row, ["executed"], { status: "cancelled", error: error.slice(0, 200), executedAt: null });
    } else out.executed++;
  }
  if (due.length > DUE_BATCH) out.done = false;
  return out;
}

/** For the security centre and the profile banner: the open requests of one store, and every store-less one. */
export async function openPlatformRequests(storeId: string | null): Promise<PlatformRequestRow[]> {
  const open = inArray(platformRequests.status, ["pending", "confirmed"]);
  return readRequests(storeId ? and(inStore(platformRequests, ledgerScope(storeId)), open)! : and(isNull(platformRequests.storeId), open)!, 50);
}

