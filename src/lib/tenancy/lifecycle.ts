import "server-only";
/**
 * Store lifecycle (docs/STORE-SAAS.md §A.5): the one writer of `stores.status`. `transitionStore` validates the edge
 * (§A.5.1, ALLOWED_TRANSITIONS) and who may take it, writes the row with a compare-and-set on the old status, then
 * (after the commit) audits, sends exactly one notification of the edge's kind to the store's owners and admins
 * (§I.4, PLA Q.27; callers never send a second one), calls `invalidateStore(storeId)` and `markHealthDirty(storeId)`,
 * refunds the store's media bytes from the shared `pending_media_bytes` on any transition out of `pending` and charges
 * them again on any transition into it (rejected → pending on appeal, a staff reopen to pending; D69).
 *
 *   await transitionStore(ctx, storeId, "restricted", { reason: "fake_orders", note, notify: { showNote: false } });
 *
 * The audit row carries `{ from, to, reason, note?, noteShown?, stepUp? }`; a staff note the store was not shown never
 * reaches the store's Activity listing (`tenantAuditEntry`, src/lib/audit.ts). An owner's close needs a fresh tenant
 * step-up (`StoreCtx.stepUpUntil` later than now, §B.7 rev 3, SEC-17) and its `store.closed` row names the method.
 *
 * Refusals throw `LifecycleError` with an action error code (`not_found`, `forbidden`, `step_up`, `invalid`, and the
 * console's `status_changed` when someone else changed the store meanwhile, PLA-§8.0). The R1 product hooks of the
 * edge (agent leases released for restricted / suspended / closed, OPE Q.8 `releaseAllLeases`; `ensureTemplateSet`
 * for a store / both go-live, §A.2) join `afterCommit` when their owners' functions exist (P4, P2); neither exists in
 * R1.0. A purge (scheduled_deletion / rejected → purged, written by the purge job after the data is gone, §H.9)
 * leaves the tombstone: `handle = NULL`, `name = '(purged)'`, the handle quarantined 180 days in
 * `store_handle_history` (R-D53).
 */
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import type { PlatformPermission } from "@/lib/auth/permissions";
import { auditFrom, type AuditAction } from "@/lib/audit";
import { pool } from "@/lib/db/client";
import type { NotificationKind } from "@/lib/notify/registry";
import { markHealthDirty } from "@/lib/platform/health-snapshot";
import { notify } from "@/lib/platform/notify";
import { errorSummary } from "@/lib/orders/log";
import { appHref } from "@/lib/urls";
import { invalidateStore } from "./cache";
import { chargePlatformUsage, refundPlatformUsage } from "./usage";
import type { PlatformCtx, StoreCtx, StoreStatus, SystemCtx } from "./types";

export type StepUpMethod = "totp" | "password";

/** §B.7: a tenant or staff step-up is fresh for 5 minutes. */
const STEP_UP_TTL_MS = 5 * 60_000;

export interface TransitionOpts {
  /** a status_reason code (≤ 40 chars) */
  reason: string;
  /** staff note (≤ 500 chars); shown to the store only with notify.showNote */
  note?: string;
  notify?: { showNote: boolean };
  /**
   * The owner's close: the method of the fresh step-up (§F.5 rev 4 `meta.stepUp`). When omitted, the method of the
   * user's last `auth.step_up` row inside the step-up window is used (none found: the row has no stepUp).
   */
  stepUp?: StepUpMethod;
  /**
   * closed → scheduled_deletion by a job only: when the purge may run (default now + 24 h). The executed purge request
   * passes now (PLA-§8.1: "execution moves the store to scheduled_deletion with purge_after = now").
   */
  purgeAt?: Date;
}

/* ------------------------------------------------------------------ */
/* The edges (§A.5.1)                                                  */
/* ------------------------------------------------------------------ */

const DAY = 86_400_000;
/** an owner may reopen within 30 days; then the cron schedules the deletion */
export const REOPEN_DAYS = 30;
/** scheduled_deletion → purged after 24 h */
export const PURGE_DELAY_MS = DAY;
/** a rejected store is purged 30 days after the rejection */
export const REJECTED_PURGE_DAYS = 30;
/** a deleted store's handle stays reserved 180 days (R-D53) */
export const HANDLE_QUARANTINE_DAYS = 180;

const CLOSABLE: readonly StoreStatus[] = ["active", "restricted", "suspended", "pending"];

interface StaffRule {
  permission: PlatformPermission;
  stepUp: boolean;
}

export interface TransitionEdge {
  from: readonly StoreStatus[];
  /** "previous" = closed → the state the store was closed from (≤ 30 days) */
  to: StoreStatus | "previous";
  staff?: StaffRule;
  /** the owner, through StoreCtx.can("store.close") */
  owner?: boolean;
  /** a job (SystemCtx): the lifecycle cron, the purge job, the executed purge request */
  system?: boolean;
  audit: { owner?: AuditAction; staff?: AuditAction; system?: AuditAction };
  /** the PLA-§18.2 kind sent to owners and admins; null = nobody is told (the tombstone) */
  notify: NotificationKind | null;
}

/** The only status changes there are. Creation (→ pending / → active) is the signup's and the console's insert. */
export const ALLOWED_TRANSITIONS: readonly TransitionEdge[] = [
  { from: ["pending"], to: "active", staff: { permission: "signups.decide", stepUp: false }, audit: { staff: "platform.signup.approved" }, notify: "signup.approved" },
  { from: ["pending"], to: "rejected", staff: { permission: "signups.decide", stepUp: false }, audit: { staff: "platform.signup.rejected" }, notify: "signup.rejected" },
  { from: ["rejected"], to: "pending", staff: { permission: "signups.decide", stepUp: false }, audit: { staff: "platform.signup.reopened" }, notify: "signup.reopened" },
  { from: ["active"], to: "restricted", staff: { permission: "stores.lifecycle", stepUp: false }, audit: { staff: "platform.store.restricted" }, notify: "store.restricted" },
  { from: ["restricted"], to: "active", staff: { permission: "stores.lifecycle", stepUp: false }, audit: { staff: "platform.store.restored" }, notify: "store.restored" },
  { from: ["active", "restricted"], to: "suspended", staff: { permission: "stores.lifecycle", stepUp: true }, audit: { staff: "platform.store.suspended" }, notify: "store.suspended" },
  { from: ["suspended"], to: "active", staff: { permission: "stores.lifecycle", stepUp: false }, audit: { staff: "platform.store.restored" }, notify: "store.restored" },
  { from: ["suspended"], to: "restricted", staff: { permission: "stores.lifecycle", stepUp: false }, audit: { staff: "platform.store.restored" }, notify: "store.restored" },
  { from: CLOSABLE, to: "closed", owner: true, staff: { permission: "stores.close", stepUp: true }, audit: { owner: "store.closed", staff: "platform.store.closed" }, notify: "store.closed" },
  { from: ["closed"], to: "previous", owner: true, staff: { permission: "stores.close", stepUp: false }, audit: { owner: "store.reopened", staff: "store.reopened" }, notify: "store.reopened" },
  {
    from: ["closed"],
    to: "scheduled_deletion",
    system: true,
    staff: { permission: "stores.close", stepUp: true },
    audit: { system: "store.deletion_scheduled", staff: "store.deletion_scheduled" },
    notify: "store.deletion_scheduled",
  },
  { from: ["scheduled_deletion"], to: "closed", staff: { permission: "stores.purge", stepUp: true }, audit: { staff: "platform.store.deletion_cancelled" }, notify: "store.deletion_cancelled" },
  { from: ["scheduled_deletion", "rejected"], to: "purged", system: true, audit: { system: "store.purged" }, notify: null },
];

/** The edge `from → to` (a reopen is `closed → <the state it was closed from>`), or null. Pure. */
export function findEdge(from: StoreStatus, to: StoreStatus): TransitionEdge | null {
  return (
    ALLOWED_TRANSITIONS.find((e) => e.to === to && e.from.includes(from)) ??
    (from === "closed" && CLOSABLE.includes(to) ? (ALLOWED_TRANSITIONS.find((e) => e.to === "previous") ?? null) : null)
  );
}

export type LifecycleErrorCode = "not_found" | "forbidden" | "step_up" | "invalid" | "status_changed";

/** A refused transition; `code` is the action error the caller answers (`detail` is for logs and tests). */
export class LifecycleError extends Error {
  constructor(
    readonly code: LifecycleErrorCode,
    readonly detail: string,
  ) {
    super(`lifecycle: ${code} (${detail})`);
    this.name = "LifecycleError";
  }
}

type Ctx = PlatformCtx | StoreCtx | SystemCtx;
type ActorKind = "owner" | "staff" | "system";

const actorKindOf = (ctx: Ctx): ActorKind => ("job" in ctx ? "system" : "store" in ctx ? "owner" : "staff");

/** The facts a check needs beyond the edge (read from the row and the audit trail). */
export interface TransitionFacts {
  from: StoreStatus;
  to: StoreStatus;
  now: Date;
  purgeAfter: Date | null;
  statusChangedAt: Date | null;
  /** the state the store was closed from (the last close audit row), null when unknown */
  closedFrom: StoreStatus | null;
  /** SystemCtx + closed → scheduled_deletion: an explicit purge time (the executed purge request) */
  purgeAt?: Date;
}

/**
 * Who may take `facts.from → facts.to` and when (pure). Throws LifecycleError. Owners: close (store.close, with a
 * fresh step-up) and reopen within 30 days when the store was closed from active or restricted. Staff: the permission of the edge
 * (step-up where ↑). Jobs: the scheduled deletion once `purge_after` has passed (or with `purgeAt`), the purge 24 h
 * later, the rejected purge after 30 days.
 */
export function checkTransition(ctx: Ctx, storeId: string, facts: TransitionFacts): TransitionEdge {
  const edge = findEdge(facts.from, facts.to);
  if (!edge) throw new LifecycleError("invalid", `${facts.from} → ${facts.to} is not an edge`);
  const kind = actorKindOf(ctx);
  if (kind === "owner") {
    const store = ctx as StoreCtx;
    if (!edge.owner || store.store.id !== storeId || !store.can("store.close")) throw new LifecycleError("forbidden", `the owner cannot take ${facts.from} → ${facts.to}`);
    // §B.7 (rev 3, SEC-17): closing the store is a sensitive action, a stolen session alone must not do it
    if (edge.to === "closed" && !(store.stepUpUntil && store.stepUpUntil.getTime() > facts.now.getTime())) throw new LifecycleError("step_up", "closing the store needs a fresh step-up");
  } else if (kind === "staff") {
    const staff = ctx as PlatformCtx;
    if (!edge.staff || !staff.can(edge.staff.permission)) throw new LifecycleError("forbidden", `staff need ${edge.staff?.permission ?? "a job"} for ${facts.from} → ${facts.to}`);
    if (edge.staff.stepUp && !staff.stepUpFresh) throw new LifecycleError("step_up", `${facts.from} → ${facts.to} needs a fresh step-up`);
  } else if (!edge.system) throw new LifecycleError("forbidden", `a job cannot take ${facts.from} → ${facts.to}`);

  const now = facts.now.getTime();
  if (edge.to === "previous") {
    if (facts.purgeAfter && facts.purgeAfter.getTime() <= now) throw new LifecycleError("invalid", "the reopen window has passed");
    if (facts.closedFrom) {
      if (facts.to !== facts.closedFrom) throw new LifecycleError("invalid", `the store was closed from ${facts.closedFrom}, not ${facts.to}`);
    } else if (kind === "owner") throw new LifecycleError("invalid", "the state before closing is unknown");
    if (kind === "owner" && facts.to !== "active" && facts.to !== "restricted") throw new LifecycleError("forbidden", `an owner cannot reopen to ${facts.to}`);
  }
  if (kind === "system") {
    if (facts.to === "scheduled_deletion" && !facts.purgeAt && (!facts.purgeAfter || facts.purgeAfter.getTime() > now)) throw new LifecycleError("invalid", "purge_after has not passed");
    if (facts.to === "purged" && facts.from === "scheduled_deletion" && (!facts.purgeAfter || facts.purgeAfter.getTime() > now)) throw new LifecycleError("invalid", "the purge delay has not passed");
    if (facts.to === "purged" && facts.from === "rejected" && (!facts.statusChangedAt || facts.statusChangedAt.getTime() + REJECTED_PURGE_DAYS * DAY > now)) {
      throw new LifecycleError("invalid", "a rejected store is purged 30 days after the rejection");
    }
  }
  return edge;
}

/* ------------------------------------------------------------------ */
/* The write                                                           */
/* ------------------------------------------------------------------ */

const STORE_ID_RE = /^[0-9A-Z]{26}$/;
const REASON_RE = /^[a-z0-9_.:-]{1,40}$/;
const STATUSES: readonly StoreStatus[] = ["pending", "active", "restricted", "suspended", "closed", "scheduled_deletion", "purged", "rejected"];

interface StoreFacts {
  status: StoreStatus;
  handle: string | null;
  purgeAfter: Date | null;
  statusChangedAt: Date | null;
}

async function readStore(storeId: string): Promise<StoreFacts | null> {
  // tenancy: platform the lifecycle reads the store row itself by id
  const [rows] = await pool().query<RowDataPacket[]>("SELECT status, handle, purge_after, status_changed_at FROM stores WHERE id = ?", [storeId]);
  const r = rows[0];
  if (!r) return null;
  return { status: r.status as StoreStatus, handle: (r.handle as string | null) ?? null, purgeAfter: (r.purge_after as Date | null) ?? null, statusChangedAt: (r.status_changed_at as Date | null) ?? null };
}

/** The `from` of the store's last close audit row (store.closed / platform.store.closed), null when there is none. */
async function closedFrom(storeId: string): Promise<StoreStatus | null> {
  const [rows] = await pool().query<RowDataPacket[]>(
    "SELECT meta FROM audit_log WHERE store_id = ? AND action IN ('store.closed', 'platform.store.closed') ORDER BY id DESC LIMIT 1",
    [storeId],
  );
  const raw = rows[0]?.meta;
  try {
    const meta = (typeof raw === "string" ? JSON.parse(raw) : raw) as { from?: unknown } | null;
    return typeof meta?.from === "string" && (STATUSES as readonly string[]).includes(meta.from) ? (meta.from as StoreStatus) : null;
  } catch {
    return null;
  }
}

const userIdOf = (ctx: Ctx): string | null => ("job" in ctx ? null : ctx.user.id);

/**
 * The audit meta of one transition (pure). `noteShown` records the "show this note to the store" toggle next to any
 * note, so a store's listing can drop a staff note it was never shown (tenantAuditEntry, PLA-§8.1).
 */
export function lifecycleAuditMeta(from: StoreStatus, to: StoreStatus, opts: Pick<TransitionOpts, "reason" | "notify">, note: string | null, stepUp: StepUpMethod | null = null): Record<string, unknown> {
  return { from, to, reason: opts.reason, ...(note ? { note, noteShown: opts.notify?.showNote === true } : {}), ...(stepUp ? { stepUp } : {}) };
}

/** The method of the user's last step-up inside the window ending at `until` (the `auth.step_up` row, §F.5). */
async function stepUpMethodOf(userId: string, until: Date | null): Promise<StepUpMethod | null> {
  if (!until) return null;
  const [rows] = await pool().query<RowDataPacket[]>(
    "SELECT meta FROM audit_log WHERE user_id = ? AND action = 'auth.step_up' AND created_at >= ? ORDER BY id DESC LIMIT 1",
    [userId, new Date(until.getTime() - STEP_UP_TTL_MS - 1000)],
  );
  const raw = rows[0]?.meta;
  try {
    const meta = (typeof raw === "string" ? JSON.parse(raw) : raw) as { method?: unknown } | null;
    return meta?.method === "totp" || meta?.method === "password" ? meta.method : null;
  } catch {
    return null;
  }
}

/** The column changes of `from → to` beyond status, reason, note and who/when. Pure. */
export function transitionColumns(from: StoreStatus, to: StoreStatus, now: Date, opts: { purgeAt?: Date; userId: string | null }): Record<string, Date | string | null> {
  const at = now.getTime();
  if (to === "closed" && from === "scheduled_deletion") return { purge_after: new Date(at + REOPEN_DAYS * DAY) };
  if (to === "closed") return { closed_at: now, purge_after: new Date(at + REOPEN_DAYS * DAY) };
  if (from === "closed" && to !== "scheduled_deletion") return { closed_at: null, purge_after: null };
  if (to === "scheduled_deletion") return { purge_after: opts.purgeAt ?? new Date(at + PURGE_DELAY_MS) };
  if (from === "pending" && to === "active") return { approved_at: now, approved_by: opts.userId };
  if (to === "purged") return { handle: null, name: "(purged)", purge_after: null };
  return {};
}

/**
 * Validates and writes one lifecycle edge (§A.5.1). `ctx`: staff (PlatformCtx), the owner (StoreCtx of that store)
 * or a job (SystemCtx). Throws LifecycleError; the side effects after the commit never fail the transition.
 */
export async function transitionStore(ctx: PlatformCtx | StoreCtx | SystemCtx, storeId: string, to: StoreStatus, opts: TransitionOpts): Promise<void> {
  if (!STORE_ID_RE.test(storeId)) throw new LifecycleError("not_found", "bad store id");
  if (!(STATUSES as readonly string[]).includes(to)) throw new LifecycleError("invalid", `unknown status ${String(to)}`);
  if (!REASON_RE.test(opts.reason ?? "")) throw new LifecycleError("invalid", "reason must be a code of 1-40 chars");
  const note = opts.note?.trim() ? opts.note.trim() : null;
  if (note && note.length > 500) throw new LifecycleError("invalid", "note longer than 500 chars");

  const store = await readStore(storeId);
  if (!store) throw new LifecycleError("not_found", "no such store");
  const now = new Date();
  const facts: TransitionFacts = {
    from: store.status,
    to,
    now,
    purgeAfter: store.purgeAfter,
    statusChangedAt: store.statusChangedAt,
    closedFrom: store.status === "closed" ? await closedFrom(storeId) : null,
    purgeAt: "job" in ctx ? opts.purgeAt : undefined,
  };
  const edge = checkTransition(ctx, storeId, facts);
  const userId = userIdOf(ctx);
  const extra = transitionColumns(store.status, to, now, { purgeAt: facts.purgeAt, userId });

  const conn = await pool().getConnection();
  try {
    await conn.beginTransaction();
    const sets = ["status = ?", "status_reason = ?", "status_note = ?", "status_changed_at = ?", "status_changed_by = ?", ...Object.keys(extra).map((c) => `${c} = ?`)];
    // tenancy: platform the compare-and-set on the old status (§A.5.1): a concurrent change answers status_changed
    const [res] = await conn.query<ResultSetHeader>(`UPDATE stores SET ${sets.join(", ")} WHERE id = ? AND status = ?`, [
      to,
      opts.reason,
      note,
      now,
      userId,
      ...Object.values(extra),
      storeId,
      store.status,
    ]);
    if (res.affectedRows !== 1) throw new LifecycleError("status_changed", `the store is no longer ${store.status}`);
    if (to === "purged" && store.handle) {
      // the handle is quarantined, never reused by another store for 180 days (§C.7); an expired row is reused
      const reservedUntil = new Date(now.getTime() + HANDLE_QUARANTINE_DAYS * DAY);
      await conn.query(
        `INSERT INTO store_handle_history (handle, store_id, reason, redirect_until, reserved_until, created_at) VALUES (?, ?, 'deleted', NULL, ?, ?)
         ON DUPLICATE KEY UPDATE store_id = VALUES(store_id), reason = 'deleted', redirect_until = NULL, reserved_until = VALUES(reserved_until), created_at = VALUES(created_at)`,
        [store.handle, storeId, reservedUntil, now],
      );
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback().catch(() => undefined);
    throw err;
  } finally {
    conn.release();
  }

  await afterCommit(ctx, storeId, store, to, edge, opts, note);
}

async function step(label: string, fn: () => Promise<unknown> | unknown): Promise<void> {
  try {
    await fn();
  } catch (err) {
    console.error(`[lifecycle] ${label} failed:`, errorSummary(err));
  }
}

async function afterCommit(ctx: Ctx, storeId: string, store: StoreFacts, to: StoreStatus, edge: TransitionEdge, opts: TransitionOpts, note: string | null): Promise<void> {
  const from = store.status;
  const kind = actorKindOf(ctx);
  const action = edge.audit[kind];
  // drop every cached view first (store row, entitlements, settings, render; §E.6) so the next request sees `to`
  await step("invalidateStore", () => invalidateStore(storeId));
  if (action) {
    await step("audit", async () => {
      let stepUp: StepUpMethod | null = null;
      if (kind === "owner" && to === "closed") {
        const owner = ctx as StoreCtx;
        stepUp = opts.stepUp ?? (await stepUpMethodOf(owner.user.id, owner.stepUpUntil).catch(() => null));
      }
      await auditFrom(ctx, action, { storeId, target: storeId, meta: lifecycleAuditMeta(from, to, opts, note, stepUp) });
    });
  }
  if (edge.notify) {
    const kindOf = edge.notify;
    await step("notify", () =>
      notify({ audience: "store_role", storeId, roles: ["owner", "admin"] }, kindOf, { reason: opts.reason }, {
        ...(note && opts.notify?.showNote ? { text: note.slice(0, 600) } : {}),
        ...(store.handle ? { link: appHref(store.handle) } : {}),
      }),
    );
  }
  await step("markHealthDirty", () => markHealthDirty(storeId));
  if (from === "pending" || to === "pending") {
    // D69: the store's bytes leave the shared sandbox budget when it leaves pending, and join it again when it
    // re-enters pending (an appeal, a staff reopen), so the next exit never refunds bytes it no longer holds there
    // (R1.0 has no usage.reconcile job to repair a drift)
    await step(from === "pending" ? "refund pending_media_bytes" : "charge pending_media_bytes", async () => {
      const [rows] = await pool().query<RowDataPacket[]>("SELECT value FROM store_usage WHERE store_id = ? AND metric = 'media_bytes' AND period = 'total'", [storeId]);
      const bytes = Number(rows[0]?.value ?? 0);
      if (bytes <= 0) return;
      if (from === "pending") await refundPlatformUsage("pending_media_bytes", "total", bytes);
      else await chargePlatformUsage("pending_media_bytes", "total", bytes, { allowOver: true });
    });
  }
}
