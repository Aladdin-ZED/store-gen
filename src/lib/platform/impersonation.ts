import "server-only";
/**
 * "View as store" (docs/STORE-SAAS.md §B.8, R-D14, PL-10; platform.md PLA Q.31, PLA-§10): read-only impersonation by
 * staff. While a row is active, `requireStoreMember` answers the synthetic viewer membership with
 * `scope.kind = "impersonation"` (D70) for that store only, and re-checks the row on every request (src/lib/tenancy/seam.ts).
 *
 * `startImpersonation`, in this order (PLA Q.31):
 *   1. `stores.impersonate`; the input (a support member must give `ticketRef` ≤ 60, "other" needs a note ≤ 300;
 *      15 / 30 / 60 minutes, default 30, never extended silently) and the bucket `p:impersonate:<userId>` 20/day
 *   2. the store: unknown → `not_found`; `scheduled_deletion` / `purged` → `impersonation_state`
 *   3. an active membership of the staff member in that store → `impersonation_member` (open it from your stores)
 *   4. an active impersonation of the same session ends first (`ended`)
 *   5. one transaction: the `impersonation_sessions` row, then `sessions.impersonation_id` on the staff member's OWN
 *      session (the column is the pointer the seam follows)
 *   6. after commit: the store's owners and admins are notified (`store.impersonation_started`), the staff feed too,
 *      audit `platform.impersonation.started` on the store
 *
 * `endImpersonation` ends the session's open row by one conditional UPDATE (`ended_at IS NULL`, so a double End or
 * an End racing the expiry writes one ending), clears the pointer, notifies the store with the actual window and
 * audits `platform.impersonation.ended`. An expired row ends at its `expires_at`.
 *
 * The rows are platform bookkeeping, never tenant data: they are written through the system seam (`systemScope`),
 * not the staff member's platform scope, which no write repository accepts (D71).
 */
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { AuthRefusal, FieldsError } from "@/lib/auth/errors";
import { db } from "@/lib/db/client";
import { newId } from "@/lib/db/ids";
import { impersonationSessions, sessions, storeMembers } from "@/lib/db/schema";
import { systemCtx, systemScope } from "@/lib/jobs/scope";
import { errorSummary } from "@/lib/orders/log";
import { platformBucket, rateLimit } from "@/lib/security/rate-limit";
import { getStoreById } from "@/lib/tenancy/public";
import { SeamError } from "@/lib/tenancy/seam";
import { storeValues, whereStore } from "@/lib/tenancy/sql";
import type { ImpersonationReason, PlatformCtx, StoreScope, StoreStatus, WriteScope } from "@/lib/tenancy/types";
import { appHref } from "@/lib/urls";
import { platformScope } from "./seam";
import { notify } from "./notify";

export type { ImpersonationInfo, ImpersonationReason } from "@/lib/tenancy/types";

export const IMPERSONATION_REASONS = ["onboarding", "ticket", "abuse_review", "bug", "other"] as const satisfies readonly ImpersonationReason[];
export const IMPERSONATION_MINUTES = [15, 30, 60] as const;
const DEFAULT_MINUTES = 30;
const STARTS_PER_DAY = 20;
const CLOSED_TO_VIEW: ReadonlySet<StoreStatus> = new Set(["scheduled_deletion", "purged"]);

const oneLine = (max: number) =>
  z
    .string()
    .max(max * 4)
    .transform((s) => s.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim())
    .pipe(z.string().max(max));

const StartInput = z.object({
  storeId: z.string().regex(/^[0-9A-Z]{26}$/),
  reason: z.enum(IMPERSONATION_REASONS),
  note: oneLine(300).optional(),
  ticketRef: oneLine(60).optional(),
  minutes: z.union([z.literal(15), z.literal(30), z.literal(60)]).optional(),
});

/** The write scope of the bookkeeping rows of one store (see the header). */
const recordScope = (storeId: string) => systemScope(systemCtx("impersonation"), storeId);

/** The open view-as row of a session (the pointer first, then the row's own session binding), or null. */
async function openRowOf(sessionId: string, staffUserId?: string): Promise<{ id: string; storeId: string; staffUserId: string; reason: ImpersonationReason; startedAt: Date; expiresAt: Date } | null> {
  const [pointer] = await db.select({ impersonationId: sessions.impersonationId }).from(sessions).where(eq(sessions.id, sessionId)).limit(1);
  const select = {
    id: impersonationSessions.id,
    storeId: impersonationSessions.storeId,
    staffUserId: impersonationSessions.staffUserId,
    reason: impersonationSessions.reason,
    startedAt: impersonationSessions.startedAt,
    expiresAt: impersonationSessions.expiresAt,
  };
  // tenancy: platform the view-as row by its own id or session (the store is not known yet; read-only bookkeeping)
  const [row] = pointer?.impersonationId
    ? await db
        .select(select)
        .from(impersonationSessions)
        .where(and(eq(impersonationSessions.id, pointer.impersonationId), isNull(impersonationSessions.endedAt)))
        .limit(1)
    : await db
        .select(select)
        .from(impersonationSessions)
        .where(
          and(
            eq(impersonationSessions.sessionId, sessionId),
            isNull(impersonationSessions.endedAt),
            staffUserId ? eq(impersonationSessions.staffUserId, staffUserId) : undefined,
          ),
        )
        .limit(1);
  return row ?? null;
}

/** What the console shows about its own view-as (the chip, the End button). */
export interface ActiveImpersonation {
  id: string;
  storeId: string;
  handle: string | null;
  storeName: string;
  reason: ImpersonationReason;
  expiresAt: Date;
}

export async function activeImpersonation(ctx: PlatformCtx): Promise<ActiveImpersonation | null> {
  const row = await openRowOf(ctx.user.sessionId, ctx.user.id);
  if (!row || row.staffUserId !== ctx.user.id || row.expiresAt.getTime() <= Date.now()) return null;
  const store = await getStoreById(row.storeId);
  return { id: row.id, storeId: row.storeId, handle: store?.handle ?? null, storeName: store?.name ?? "", reason: row.reason, expiresAt: row.expiresAt };
}

/** `stores.impersonate`; support must give `ticketRef` (≤ 60 chars). Default 30 minutes, at most 60, never extended silently. */
export async function startImpersonation(
  ctx: PlatformCtx,
  input: { storeId: string; reason: ImpersonationReason; note?: string; ticketRef?: string; minutes?: 15 | 30 | 60 },
): Promise<{ url: string }> {
  // 1. permission, input, bucket
  if (!ctx.can("stores.impersonate")) throw new SeamError("forbidden");
  const parsed = StartInput.safeParse(input);
  if (!parsed.success) throw new FieldsError({ [String(parsed.error.issues[0]?.path[0] ?? "storeId")]: "console.impersonation.invalid" });
  const { storeId, reason } = parsed.data;
  const note = parsed.data.note || null;
  const ticketRef = parsed.data.ticketRef || null;
  if (ctx.role === "support" && !ticketRef) throw new FieldsError({ ticketRef: "console.impersonation.ticket_required" });
  if (reason === "other" && !note) throw new FieldsError({ note: "console.impersonation.note_required" });
  const minutes = parsed.data.minutes ?? DEFAULT_MINUTES;
  if (!(await rateLimit(platformBucket("impersonate", ctx.user.id), STARTS_PER_DAY, 86_400)).ok) throw new SeamError("rate_limited");

  // 2. the store
  const store = await getStoreById(storeId);
  if (!store || !store.handle) throw new SeamError("not_found");
  if (CLOSED_TO_VIEW.has(store.status)) throw new AuthRefusal("impersonation_state", "console.impersonation.state");

  // 3. a member opens the store as a member (a view-as would hide their own role behind the read-only viewer)
  const member = await memberStatusIn(platformScope(ctx, storeId), ctx.user.id);
  if (member?.status === "active") throw new AuthRefusal("impersonation_member", "console.impersonation.member");

  // 4. one view-as per session: the open one ends first
  await endImpersonation(ctx, "ended");

  // 5. the row and the session pointer
  const id = newId();
  const startedAt = new Date();
  const expiresAt = new Date(startedAt.getTime() + minutes * 60_000);
  await db.transaction(async (tx) => {
    await insertSessionRow(tx, recordScope(storeId), {
      id,
      staffUserId: ctx.user.id,
      sessionId: ctx.user.sessionId.slice(0, 64),
      mode: "read" as const,
      reason,
      note,
      ticketRef,
      startedAt,
      expiresAt,
    });
    await tx.update(sessions).set({ impersonationId: id }).where(and(eq(sessions.id, ctx.user.sessionId), eq(sessions.userId, ctx.user.id)));
  });

  // 6. both sides see it
  const window = { reason, from: startedAt.toISOString(), to: expiresAt.toISOString() };
  await notify({ audience: "store_role", storeId, roles: ["owner", "admin"] }, "store.impersonation_started", window, { link: appHref(store.handle, "/settings/audit"), severity: "info" });
  await notify({ audience: "platform_staff", minRole: "admin" }, "staff.impersonation_started", { store: store.handle, by: ctx.user.id, minutes }, { link: `/admin/stores/${storeId}/activity` });
  await audit("platform.impersonation.started", {
    userId: ctx.user.id,
    target: id,
    meta: { reason, minutes, ticketRef, hasNote: note !== null },
    ip: ctx.actor.ip,
    scope: { storeId, actorKind: "platform" },
  });
  return { url: appHref(store.handle) };
}

/* the rows, each on the store its scope names (lint L1/L2: the scope is the function's parameter) */

/** The viewer's own membership of the store, if any (a member opens the store as a member). */
async function memberStatusIn(scope: StoreScope, userId: string): Promise<{ status: "active" | "suspended" } | undefined> {
  const [member] = await db.select({ status: storeMembers.status }).from(storeMembers).where(whereStore(storeMembers, scope, eq(storeMembers.userId, userId))).limit(1);
  return member;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function insertSessionRow(tx: Tx, scope: WriteScope, row: Omit<typeof impersonationSessions.$inferInsert, "storeId">): Promise<void> {
  await tx.insert(impersonationSessions).values(storeValues(scope, row));
}

/** Ends the open row `id` (one conditional UPDATE: the first of two racing ends wins). */
async function endSessionRow(scope: WriteScope, id: string, endedAt: Date, why: "ended" | "expired" | "revoked"): Promise<{ affectedRows: number }> {
  const [cas] = await db
    .update(impersonationSessions)
    .set({ endedAt, endedReason: why })
    .where(whereStore(impersonationSessions, scope, eq(impersonationSessions.id, id), isNull(impersonationSessions.endedAt)));
  return cas;
}

export async function endImpersonation(ctx: PlatformCtx | { sessionId: string }, why: "ended" | "expired" | "revoked"): Promise<void> {
  const sessionId = "user" in ctx ? ctx.user.sessionId : ctx.sessionId;
  const row = await openRowOf(sessionId, "user" in ctx ? ctx.user.id : undefined);
  if (!row) return;
  const endedAt = why === "expired" ? row.expiresAt : new Date(Math.min(Date.now(), row.expiresAt.getTime()));
  const cas = await endSessionRow(recordScope(row.storeId), row.id, endedAt, why);
  // the pointer goes whoever won the race, but only if it still names this row
  await db.update(sessions).set({ impersonationId: null }).where(and(eq(sessions.id, sessionId), eq(sessions.impersonationId, row.id)));
  if (cas.affectedRows !== 1) return;

  try {
    const store = await getStoreById(row.storeId);
    await notify(
      { audience: "store_role", storeId: row.storeId, roles: ["owner", "admin"] },
      "store.impersonation_ended",
      { reason: row.reason, from: row.startedAt.toISOString(), to: endedAt.toISOString() },
      store?.handle ? { link: appHref(store.handle, "/settings/audit") } : {},
    );
    await audit("platform.impersonation.ended", {
      userId: row.staffUserId,
      target: row.id,
      meta: { why, minutes: Math.max(0, Math.round((endedAt.getTime() - row.startedAt.getTime()) / 60_000)) },
      ip: "actor" in ctx ? ctx.actor.ip : null,
      scope: { storeId: row.storeId, actorKind: why === "expired" ? "system" : "platform" },
    });
  } catch (err) {
    console.error("[impersonation] end bookkeeping:", errorSummary(err));
  }
}
