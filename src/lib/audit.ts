/**
 * Append-only audit log (admin security events, settings changes, publishing…).
 * Writing never throws: an audit failure must not break the action being audited, so it is
 * reported to the server log instead. IPs are stored as keyed hashes, never raw.
 *
 * Multi-tenant (docs/STORE-SAAS.md §F.5): a row carries the store it concerns (NULL = a platform or auth event) and
 * the actor kind; `auditFrom(ctx, …)` derives both from a seam context. Tenants read only their store's rows
 * (`listStoreAudit`), staff every row (`listPlatformAudit`). C0a writes the scope columns; T1 owns the file and
 * implements the two list functions (§K.1).
 */
import "server-only";
import { and, desc, eq, lt, type SQL } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { auditLog } from "@/lib/db/schema";
import { errorSummary } from "@/lib/orders/log";
import { hashIp } from "@/lib/security/crypto";
import type { Actor, PlatformCtx, StoreCtx, SystemCtx } from "@/lib/tenancy/types";

/** Known actions (dot-namespaced). Other areas may log their own namespaced actions too. */
export type AuditAction =
  | "auth.login.success"
  | "auth.login.mfa_pending"
  | "auth.login.failure"
  | "auth.login.locked"
  | "auth.login.rate_limited"
  | "auth.mfa.success"
  | "auth.mfa.failure"
  | "auth.mfa.locked"
  | "auth.mfa.recovery_used"
  | "auth.logout"
  | "auth.setup.owner_created"
  | "auth.setup.failure"
  | "auth.2fa.enrollment_started"
  | "auth.2fa.enabled"
  | "auth.2fa.disabled"
  | "auth.2fa.recovery_regenerated"
  | "auth.password.changed"
  | "auth.password.reset"
  | "auth.user.created"
  | "auth.user.role_changed"
  | "auth.user.disabled"
  | "auth.user.enabled"
  | "auth.sessions.revoked"
  | "settings.updated"
  | (string & {});

export interface AuditDetails {
  userId?: string | null;
  /** affected object, e.g. a user id, an email that was tried, a settings key, a page id */
  target?: string | null;
  meta?: Record<string, unknown> | null;
  /** raw client IP — hashed before storage */
  ip?: string | null;
}

export interface AuditEntry {
  id: number;
  userId: string | null;
  action: string;
  target: string | null;
  meta: Record<string, unknown> | null;
  ipHash: string | null;
  createdAt: Date;
}

const SENSITIVE_KEY = /pass|secret|token|otp|cookie|authorization|recovery|^code$|private.?key|api.?key/i;
const MAX_META_CHARS = 4000;

function sanitize(value: unknown, depth = 0): unknown {
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return value.length > 500 ? `${value.slice(0, 500)}…` : value;
  if (value instanceof Date) return value.toISOString();
  if (depth > 4) return "[depth]";
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => sanitize(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>).slice(0, 50)) {
      out[k] = SENSITIVE_KEY.test(k) ? "[redacted]" : sanitize(v, depth + 1);
    }
    return out;
  }
  return String(value);
}

function sanitizeMeta(meta: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!meta) return null;
  const clean = sanitize(meta) as Record<string, unknown>;
  const json = JSON.stringify(clean);
  return json.length <= MAX_META_CHARS ? clean : { truncated: true, size: json.length };
}

/** Who and which store a row is about (§F.5). Without it: a platform-level row of a user actor (today's rows). */
export interface AuditScope {
  storeId: string | null;
  actorKind: Actor["kind"];
  impersonatorId?: string | null;
}

export async function audit(action: AuditAction, details: AuditDetails & { scope?: AuditScope } = {}): Promise<void> {
  try {
    let ipHash: string | null = null;
    if (details.ip) {
      try {
        ipHash = hashIp(details.ip);
      } catch {
        ipHash = null;
      }
    }
    await db.insert(auditLog).values({
      action: action.slice(0, 64),
      userId: details.userId ?? null,
      target: details.target ? details.target.slice(0, 191) : null,
      meta: sanitizeMeta(details.meta),
      ip: ipHash,
      createdAt: new Date(),
      storeId: details.scope?.storeId ?? null,
      actorKind: details.scope?.actorKind ?? "user",
      impersonatorId: details.scope?.impersonatorId ?? null,
    });
  } catch (err) {
    // the failed INSERT's message would carry the entry's meta (e-mails, names): code only
    console.error(`[audit] failed to record "${action}":`, errorSummary(err));
  }
}

/** Newest-first page of audit entries (keyset pagination via `beforeId`). */
export async function listAuditEntries(
  opts: { limit?: number; beforeId?: number; userId?: string; action?: string } = {},
): Promise<AuditEntry[]> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const filters: SQL[] = [];
  if (opts.beforeId !== undefined) filters.push(lt(auditLog.id, opts.beforeId));
  if (opts.userId) filters.push(eq(auditLog.userId, opts.userId));
  if (opts.action) filters.push(eq(auditLog.action, opts.action));
  const rows = await db
    .select()
    .from(auditLog)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(auditLog.id))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    action: r.action,
    target: r.target,
    meta: r.meta ?? null,
    ipHash: r.ip,
    createdAt: r.createdAt,
  }));
}

/**
 * One audit row from a seam context: a store ctx writes its store and actor (an impersonation row names both
 * identities, §B.8), a platform ctx its staff member (pass `storeId` for an action on one store), a system ctx the
 * job. Never throws, like `audit`.
 */
export async function auditFrom(ctx: StoreCtx | PlatformCtx | SystemCtx, action: AuditAction, details: AuditDetails & { storeId?: string | null } = {}): Promise<void> {
  const { storeId, ...rest } = details;
  if ("store" in ctx) {
    await audit(action, {
      ...rest,
      userId: rest.userId ?? ctx.actor.userId,
      ip: rest.ip ?? ctx.actor.ip,
      scope: { storeId: ctx.store.id, actorKind: ctx.actor.kind, impersonatorId: ctx.actor.impersonatorId },
    });
  } else if ("job" in ctx) {
    await audit(action, { ...rest, scope: { storeId: storeId ?? null, actorKind: "system" } });
  } else {
    await audit(action, { ...rest, userId: rest.userId ?? ctx.user.id, ip: rest.ip ?? ctx.actor.ip, scope: { storeId: storeId ?? null, actorKind: "platform" } });
  }
}

/** A store's own rows (store_id = ctx.store.id), newest first, keyset by `beforeId`; `area` = the action prefix. T1. */
export async function listStoreAudit(ctx: StoreCtx, opts: { beforeId?: number; limit?: number; area?: string }): Promise<AuditEntry[]> {
  void ctx;
  void opts;
  throw new Error("not implemented: T1 (listStoreAudit)");
}

/** Every row (staff, `audit.platform`), optionally one store's or one actor kind's. T1. */
export async function listPlatformAudit(ctx: PlatformCtx, opts: { storeId?: string; actorKind?: string; beforeId?: number }): Promise<AuditEntry[]> {
  void ctx;
  void opts;
  throw new Error("not implemented: T1 (listPlatformAudit)");
}
