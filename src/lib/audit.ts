/**
 * Append-only audit log (admin security events, settings changes, publishing…).
 * Writing never throws: an audit failure must not break the action being audited, so it is
 * reported to the server log instead. IPs are stored as keyed hashes, never raw.
 *
 * Multi-tenant (docs/STORE-SAAS.md §F.5, SE-04): a row carries the store it concerns (NULL = a platform or auth
 * event), the actor kind and, for "View as store", the staff member behind it; `auditFrom(ctx, …)` derives all three
 * from a seam context. Tenants read only their store's rows (`listStoreAudit`), platform actions on their store
 * included but never with the staff IP hash; staff read every row (`listPlatformAudit`). Meta is redacted and kept
 * under 4 KB. Retention (400 days, then rolled up) is a job (OS-11).
 */
import "server-only";
import { eq, gte, like, lt, or, type SQL } from "drizzle-orm";
import { insertAuditRow, selectPlatformAuditRows, selectStoreAuditRows, type AuditRowJoined } from "@/lib/db/audit-rows";
import { auditLog } from "@/lib/db/schema";
import { errorSummary } from "@/lib/orders/log";
import { hashIp } from "@/lib/security/crypto";
import type { Actor, PlatformCtx, StoreCtx, SystemCtx } from "@/lib/tenancy/types";

/** Today's auth and settings events (platform rows: `store_id` NULL, §F.5). */
type AuthAction =
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
  | "auth.legal.accepted"
  | "auth.step_up" // meta { method: "totp" | "password" } (SEC-17)
  | "auth.account.deleted" // self-service, no meta (SEC-20)
  | "settings.updated"; // the single-tenant settings API until R1.0 removes it

/** Store events (`store_id` set). */
type StoreAction =
  | "store.created"
  | "store.mode_changed"
  | "store.handle_renamed"
  | "store.closed"
  | "store.reopened"
  | "store.deletion_scheduled"
  | "store.purged"
  | "store.export_requested"
  | "store.export_downloaded"
  | `store.member.${"invited" | "accepted" | "revoked" | "role_changed" | "suspended" | "removed"}`
  | "store.settings.updated"
  | "store.2fa_required_changed"
  | "store.milestone.reached"
  | `store.review.${string}` // submitted, answered (platform); the storefront review events (R2)
  | "store.appeal.submitted"
  | `store.request.${"created" | "withdrawn"}`
  | `store.preview_link.${"created" | "revoked"}`
  | `store.onboarding.${"completed" | "skipped"}`
  | "store.health.snoozed"
  | "store.delivery.updated"
  | "store.policies.updated"
  | "store.landing_settings.updated"
  | "store.inventory.adjusted"
  | `store.catalog.${string}`
  | `store.storefront.${string}`
  | `store.coupon.${string}`
  | `store.ai.${"settings_updated" | "voice_updated" | "memory_added" | "memory_deleted" | "memory_pinned" | "proposal_executed"}`
  | "store.brand.updated"
  | "store.theme.activated"
  | "store.brand_term.refused"; // meta { field }, never the matched term (D76)

/** Operations, landing and design events of a store (`store_id` set). */
type StoreAreaAction =
  | `orders.${"status_forced" | "exported" | "test_deleted" | "carrier_exported" | "refunded"}`
  | `integrations.${"sheets.connected" | "sheets.disconnected" | "telegram.changed" | "conversions.changed" | "outbox.replayed"}`
  | `callcenter.${"settings.updated" | "calls_opened" | "label_mapped"}`
  | `finance.${"costs.updated" | "ad_spend.updated" | "settings.updated" | "period_closed" | "period_reopened"}`
  | "commissions.rule_changed"
  | `payouts.${"approved" | "paid"}`
  | "webhooks.endpoint_changed"
  | "carriers.account_changed"
  | `api_keys.${"created" | "revoked"}`
  | `blocklist.${"added" | "removed"}`
  | `page.${"proof_attested" | "fact_attested" | "countdown_extended" | "test_link_created" | "slug_moved" | "attached" | "detached" | "copied_out" | "copied_in" | "scheduled_publish"}`
  | `page.publish.${"design_override" | "budget_override"}`
  | `lead.${"phone_revealed" | "converted"}`
  | `campaign.${"created" | "shared" | "share_revoked"}`
  | `link.${"created" | "paused"}`
  | `experiment.${"started" | "stopped" | "applied"}`;

/** Platform (staff) events; a row about one store also carries its `store_id`. */
type PlatformAction =
  | `platform.signup.${"approved" | "rejected" | "info_requested" | "reopened" | "snoozed" | "bulk_approved"}`
  | `platform.store.${"restricted" | "suspended" | "restored" | "closed" | "deletion_cancelled" | "purge_requested" | "purge_confirmed" | "messaged"}`
  | `platform.impersonation.${"started" | "ended" | "write_refused"}`
  | "platform.pii.revealed"
  | `platform.user.${"banned" | "unbanned" | "2fa_reset" | "reset_link" | "signed_out" | "deleted"}`
  | `platform.plan.${"changed" | "updated" | "created"}`
  | "platform.entitlement.set"
  | "platform.flag.changed"
  | "platform.kill.changed"
  | `platform.staff.${"changed" | "invited" | "signed_out_all"}`
  | "platform.backup.downloaded"
  | `platform.request.${"resolved" | "cancelled"}`
  | "platform.stores.exported"
  | `platform.note.${"added" | "edited" | "deleted" | "pinned"}`
  | "platform.outbox.replayed"
  | `platform.domains.${"rerender" | "step"}`
  | "platform.order.lookup"
  | `platform.invite.${"created" | "revoked"}`
  | `platform.waitlist.${"invited" | "dropped"}`
  | `platform.brand_term.${"saved" | "deleted"}`
  | `platform.legal.${"saved" | "reviewed" | "published" | "retired"}`
  | "platform.settings.updated"
  | "platform.audit.exported"
  | "platform.breakglass.reviewed"
  | "platform.design.changed"
  | "platform.abuse.reported" // meta { storeId, reason }, no reporter data
  | `platform.ai.${"settings_changed" | "key_set" | "key_removed" | "model_changed" | "model_emergency_switch" | "prompt_activated" | "prompt_rolled_back" | "cap_changed" | "eval_started" | "batch_canceled" | "transport_changed" | "director_default_changed" | "prompt_canaried" | "preference_recorded" | "calibration_recorded" | "screen_cleared" | "probe_recorded"}`;

/** Known actions (dot-namespaced, §F.5). Other areas may log their own namespaced actions too. */
export type AuditAction = AuthAction | StoreAction | StoreAreaAction | PlatformAction | (string & {});

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
  /** null in a tenant's listing for platform and impersonation rows (never the staff IP hash, §F.5) */
  ipHash: string | null;
  createdAt: Date;
  storeId: string | null;
  actorKind: Actor["kind"];
  impersonatorId: string | null;
  /** display name of `userId` (a staff member's name on platform rows), null when unknown or deleted */
  actorName: string | null;
  impersonatorName: string | null;
}

/**
 * The meta keys whose values are redacted on write (§F.5). Exported unchanged (P0b, CCR P8-9) so the purge's
 * `redactMetaForPurge` (§F.9, SEC-20) applies this very rule beside its PII key list, never a copy.
 */
export const AUDIT_SECRET_KEY_RE = /pass|secret|token|otp|cookie|authorization|recovery|^code$|private.?key|api.?key/i;
/** §F.5: meta ≤ 4 KB, counted in UTF-8 bytes (Arabic text is 2 bytes a character) */
const MAX_META_BYTES = 4096;

function sanitize(value: unknown, depth = 0): unknown {
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return value.length > 500 ? `${value.slice(0, 500)}…` : value;
  if (value instanceof Date) return value.toISOString();
  if (depth > 4) return "[depth]";
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => sanitize(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>).slice(0, 50)) {
      out[k] = AUDIT_SECRET_KEY_RE.test(k) ? "[redacted]" : sanitize(v, depth + 1);
    }
    return out;
  }
  return String(value);
}

function sanitizeMeta(meta: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!meta) return null;
  const clean = sanitize(meta) as Record<string, unknown>;
  const size = Buffer.byteLength(JSON.stringify(clean), "utf8");
  return size <= MAX_META_BYTES ? clean : { truncated: true, size };
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
    await insertAuditRow({
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

/* ------------------------------------------------------------------ */
/* reading                                                             */
/* ------------------------------------------------------------------ */

const ACTOR_KINDS: readonly Actor["kind"][] = ["user", "platform", "impersonation", "system", "api"];
/** an action prefix: dot-separated lowercase words, e.g. "orders" or "store.member" */
const AREA_RE = /^[a-z0-9_]{1,40}(?:\.[a-z0-9_]{1,40}){0,3}$/;

const pageSize = (limit: number | undefined) => Math.min(Math.max(Math.trunc(limit ?? 50), 1), 200);

/** `action = area` or `action LIKE 'area.%'`, the LIKE wildcards in `area` escaped. */
function inArea(area: string): SQL {
  return or(eq(auditLog.action, area), like(auditLog.action, `${area.replace(/[\\%_]/g, "\\$&")}.%`))!;
}

function toEntries(rows: AuditRowJoined[], tenantView: boolean): AuditEntry[] {
  return rows.map(({ row: r, actorName, impersonatorName }) => {
    const entry: AuditEntry = {
      id: r.id,
      userId: r.userId,
      action: r.action,
      target: r.target,
      meta: r.meta ?? null,
      ipHash: r.ip,
      createdAt: r.createdAt,
      storeId: r.storeId,
      actorKind: r.actorKind,
      impersonatorId: r.impersonatorId,
      actorName: actorName ?? null,
      impersonatorName: impersonatorName ?? null,
    };
    return tenantView ? tenantAuditEntry(entry) : entry;
  });
}

/**
 * What a store's own listing may show of one row (pure; §F.5, PLA-§8.1). On a platform or impersonation row the
 * staff member is a display name only: no IP hash, no user id, no impersonator id. A staff or job note (`meta.note`
 * of a platform, impersonation or system row) reaches the store only when it was shown to the store
 * (`meta.noteShown: true`, the lifecycle's "show this note to the store" toggle, default off); the store's own rows
 * are left alone.
 */
export function tenantAuditEntry(entry: AuditEntry): AuditEntry {
  const staff = entry.actorKind === "platform" || entry.actorKind === "impersonation";
  let meta = entry.meta;
  if ((staff || entry.actorKind === "system") && meta && "note" in meta && meta.noteShown !== true) {
    const { note: _hidden, ...rest } = meta;
    void _hidden;
    meta = rest;
  }
  if (!staff) return meta === entry.meta ? entry : { ...entry, meta };
  return { ...entry, meta, ipHash: null, userId: null, impersonatorId: null };
}

/**
 * Newest-first page of every audit entry (keyset pagination via `beforeId`): the single-tenant security page.
 * @deprecated platform-wide; tenant screens use listStoreAudit, the console listPlatformAudit.
 */
export async function listAuditEntries(opts: { limit?: number; beforeId?: number; userId?: string; action?: string } = {}): Promise<AuditEntry[]> {
  const filters: SQL[] = [];
  if (opts.beforeId !== undefined) filters.push(lt(auditLog.id, opts.beforeId));
  if (opts.userId) filters.push(eq(auditLog.userId, opts.userId));
  if (opts.action) filters.push(eq(auditLog.action, opts.action));
  return toEntries(await selectPlatformAuditRows({ conds: filters, limit: pageSize(opts.limit) }), false);
}

/**
 * A store's own rows (store_id = the ctx's store), newest first, keyset by `beforeId`; `area` = an action prefix
 * ("orders", "store.member"). Platform and impersonation rows on the store are included, with the staff member's
 * name only (no IP hash, user id or impersonator id) and without a staff note the store was not shown
 * (tenantAuditEntry). Needs `audit.read`.
 *
 * P0b (CCR P2-12, PLA-§22.10.6): `actorKind` (one actor kind; an unknown one answers []), `from` (created_at ≥) and
 * `to` (created_at <), filtered in SQL like `listPlatformAudit`'s, so the keyset by `beforeId` pages the filtered
 * rows. An invalid date answers [].
 */
export async function listStoreAudit(
  ctx: StoreCtx,
  opts: { beforeId?: number; limit?: number; area?: string; actorKind?: "user" | "platform" | "impersonation" | "system" | "api"; from?: Date; to?: Date } = {},
): Promise<AuditEntry[]> {
  if (!ctx.can("audit.read")) throw new Error("forbidden: audit.read");
  if (ctx.scope.storeId !== ctx.store.id) throw new Error("tenancy: the ctx scope and store disagree");
  if (opts.area !== undefined && !AREA_RE.test(opts.area)) return [];
  const kind = opts.actorKind !== undefined ? ACTOR_KINDS.find((k) => k === opts.actorKind) : undefined;
  if (opts.actorKind !== undefined && !kind) return [];
  const badDate = (d: Date | undefined) => d !== undefined && !(d instanceof Date && Number.isFinite(d.getTime()));
  if (badDate(opts.from) || badDate(opts.to)) return [];
  const conds = [
    opts.beforeId !== undefined ? lt(auditLog.id, opts.beforeId) : undefined,
    opts.area !== undefined ? inArea(opts.area) : undefined,
    kind !== undefined ? eq(auditLog.actorKind, kind) : undefined,
    opts.from !== undefined ? gte(auditLog.createdAt, opts.from) : undefined,
    opts.to !== undefined ? lt(auditLog.createdAt, opts.to) : undefined,
  ];
  return toEntries(await selectStoreAuditRows(ctx.scope, conds, pageSize(opts.limit)), true);
}

/**
 * Every row (staff with `audit.platform`), newest first, keyset by `beforeId`; optionally one store's rows, one actor
 * kind's, or one action area's.
 */
export async function listPlatformAudit(
  ctx: PlatformCtx,
  opts: { storeId?: string; actorKind?: string; beforeId?: number; limit?: number; area?: string } = {},
): Promise<AuditEntry[]> {
  if (!ctx.can("audit.platform")) throw new Error("forbidden: audit.platform");
  if (opts.area !== undefined && !AREA_RE.test(opts.area)) return [];
  const filters: SQL[] = [];
  if (opts.actorKind !== undefined) {
    const kind = ACTOR_KINDS.find((k) => k === opts.actorKind);
    if (!kind) return [];
    filters.push(eq(auditLog.actorKind, kind));
  }
  if (opts.beforeId !== undefined) filters.push(lt(auditLog.id, opts.beforeId));
  if (opts.area !== undefined) filters.push(inArea(opts.area));
  return toEntries(await selectPlatformAuditRows({ storeId: opts.storeId, conds: filters, limit: pageSize(opts.limit) }), false);
}
