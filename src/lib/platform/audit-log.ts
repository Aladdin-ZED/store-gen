import "server-only";
/**
 * The platform audit log in the console (platform.md PLA-§14.3, SE-04; `audit.platform`, super_admin):
 *
 *   const { csv, rows } = await auditCsv(ctx, parseAuditFilter(url.searchParams));   // GET /api/admin/audit.csv
 *   await markBreakGlassReviewed(ctx, { week: "2026-W44" });                         // "Mark this week reviewed"
 *
 * The CSV holds at most 50,000 rows (PLA-§L), newest first, read through core `listPlatformAudit` in pages of 200;
 * every meta is redacted once more on the way out (secrets are redacted on write, §F.5; here any e-mail or phone-like
 * value is masked too), the IP hash is cut to 8 characters, and the export itself is audited
 * `platform.audit.exported { rows, truncated, filter }`.
 */
import { inArray } from "drizzle-orm";
import { z } from "zod";
import { auditFrom, listPlatformAudit, type AuditEntry } from "@/lib/audit";
import { AuthRefusal, FieldsError } from "@/lib/auth/errors";
import { db } from "@/lib/db/client";
import { stores, users } from "@/lib/db/schema";
import type { PlatformCtx } from "@/lib/tenancy/types";
import { csvCell } from "./console-rules";
import { isoWeek } from "./health-score";
import { maskEmail } from "./mask";

export const AUDIT_CSV_MAX = 50_000;
const PAGE = 200;
const ACTOR_KINDS = ["user", "platform", "impersonation", "system", "api"] as const;

export const AuditFilterSchema = z.object({
  storeId: z.string().regex(/^[0-9A-Z]{26}$/).optional(),
  actorKind: z.enum(ACTOR_KINDS).optional(),
  area: z.string().regex(/^[a-z0-9_]{1,40}(?:\.[a-z0-9_]{1,40}){0,3}$/).optional(),
});
export type AuditFilter = z.output<typeof AuditFilterSchema>;

/** The filter of a URL's search params; an invalid field is dropped (never an error page). */
export function parseAuditFilter(params: URLSearchParams | Record<string, unknown>): AuditFilter {
  const get = (k: string) => (params instanceof URLSearchParams ? (params.get(k) ?? undefined) : typeof params[k] === "string" ? (params[k] as string) : undefined);
  const out: AuditFilter = {};
  for (const k of ["storeId", "actorKind", "area"] as const) {
    const one = AuditFilterSchema.shape[k].safeParse(get(k));
    if (one.success && one.data !== undefined) (out as Record<string, unknown>)[k] = one.data;
  }
  return out;
}

const EMAIL_RE = /[^\s@"]{1,64}@[^\s@"]{1,255}\.[^\s@"]{2,}/g;
/** a phone number: "+…", a local "0…" or a bare "212…" run of 8+ digits (dates and amounts are left as they are) */
const PHONE_RE = /(?:\+|\b0|\b212)\d[\d\s.-]{6,}\d/g;

/** Free text as the CSV shows it: e-mails masked, phone-like digit runs hidden but their last 2 digits. */
function redactText(value: string): string {
  return value
    .replace(EMAIL_RE, (m) => String(maskEmail(m)))
    .replace(PHONE_RE, (m) => {
      const digits = m.replace(/\D/g, "");
      return `${"•".repeat(Math.max(0, digits.length - 2))}${digits.slice(-2)}`;
    });
}

/** A meta value as the CSV shows it (secrets were redacted on write, §F.5; e-mails and phones are masked here). */
export function redactedMeta(meta: Record<string, unknown> | null): string {
  return meta ? redactText(JSON.stringify(meta)).slice(0, 4_000) : "";
}

export const AUDIT_CSV_COLUMNS = ["id", "at", "action", "actor_kind", "actor", "actor_name", "impersonator", "store_id", "target", "meta", "ip"] as const;

function line(e: AuditEntry): string {
  return [
    e.id,
    e.createdAt.toISOString(),
    e.action,
    e.actorKind,
    e.userId,
    e.actorName,
    e.impersonatorId,
    e.storeId,
    e.target ? redactText(e.target) : null,
    redactedMeta(e.meta),
    e.ipHash ? e.ipHash.slice(0, 8) : null,
  ]
    .map((v) => csvCell(v))
    .join(",");
}

/** `audit.platform` (super_admin): the filtered log as CSV, ≤ 50,000 rows newest first; audited. */
export async function auditCsv(ctx: PlatformCtx, filter: AuditFilter = {}): Promise<{ csv: string; rows: number; truncated: boolean }> {
  if (!ctx.can("audit.platform") || ctx.role !== "super_admin") throw new AuthRefusal("forbidden");
  const lines: string[] = [AUDIT_CSV_COLUMNS.join(",")];
  let beforeId: number | undefined;
  let rows = 0;
  let truncated = false;
  for (;;) {
    const page = await listPlatformAudit(ctx, { ...filter, beforeId, limit: PAGE });
    for (const e of page) {
      if (rows >= AUDIT_CSV_MAX) {
        truncated = true;
        break;
      }
      lines.push(line(e));
      rows++;
    }
    if (truncated || page.length < PAGE) break;
    beforeId = page[page.length - 1]!.id;
  }
  await auditFrom(ctx, "platform.audit.exported", { meta: { rows, truncated, filter } });
  return { csv: `${lines.join("\r\n")}\r\n`, rows, truncated };
}

const WEEK_RE = /^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/;

/**
 * `audit.platform` (PLA-§14.3): "Mark this week reviewed" writes `platform.breakglass.reviewed { week }` once per ISO
 * week (a second mark of the same week answers `{ changed: false }`); the default week is the current one.
 */
export async function markBreakGlassReviewed(ctx: PlatformCtx, input: unknown, now: Date = new Date()): Promise<{ week: string; changed: boolean }> {
  if (!ctx.can("audit.platform")) throw new AuthRefusal("forbidden");
  const raw = input && typeof input === "object" ? (input as { week?: unknown }).week : undefined;
  const week = raw === undefined || raw === null || raw === "" ? isoWeek(now) : typeof raw === "string" && WEEK_RE.test(raw) ? raw : null;
  if (!week || week > isoWeek(now)) throw new FieldsError({ week: "console.audit.week_invalid" });
  const marks = await listPlatformAudit(ctx, { area: "platform.breakglass.reviewed", limit: 60 });
  if (marks.some((m) => m.target === week)) return { week, changed: false };
  await auditFrom(ctx, "platform.breakglass.reviewed", { target: week, meta: { week } });
  return { week, changed: true };
}

/* ------------------------------------------------------------------ */
/* The console views (PLA-§14.3: /admin/security/audit, /break-glass)  */
/* ------------------------------------------------------------------ */

const ID26 = /^[0-9A-Z]{26}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** rows shown per page, rows scanned per page at most (the staff and date filters run over the scanned rows) */
const VIEW_PAGE = 50;
const VIEW_SCAN = 3_000;

/** The page's filters: the CSV's, plus the staff member and a date range (UTC days, `to` inclusive). */
export interface AuditViewFilter extends AuditFilter {
  userId?: string;
  from?: string;
  to?: string;
}

/** The view's filters from the URL; an invalid field is dropped. */
export function parseAuditViewFilter(params: Record<string, string | string[] | undefined>): AuditViewFilter {
  const one = (k: string) => {
    const v = params[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const out: AuditViewFilter = parseAuditFilter(Object.fromEntries(["storeId", "actorKind", "area"].map((k) => [k, one(k)])));
  const userId = one("userId");
  if (userId && ID26.test(userId)) out.userId = userId;
  for (const k of ["from", "to"] as const) {
    const v = one(k);
    if (v && DATE_RE.test(v) && Number.isFinite(Date.parse(`${v}T00:00:00Z`))) out[k] = v;
  }
  return out;
}

export interface AuditViewRow {
  id: number;
  at: string;
  action: string;
  actorKind: AuditEntry["actorKind"];
  actor: { id: string | null; name: string | null; role: string | null };
  impersonator: string | null;
  store: { id: string; handle: string | null } | null;
  /** the target as stored, with e-mails and phones masked; `userTarget` when it is an account id */
  target: string | null;
  userTarget: string | null;
  /** redacted meta (JSON, ≤ 4,000 characters) */
  meta: string;
  ip8: string | null;
}

export interface AuditViewPage {
  rows: AuditViewRow[];
  /** the keyset of the next page (the last scanned id), null at the end */
  next: number | null;
  /** the scan stopped at its bound before filling the page: "Older rows" continues it */
  partial: boolean;
}

async function enrich(entries: AuditEntry[]): Promise<AuditViewRow[]> {
  const userIds = [...new Set(entries.map((e) => e.userId).filter((x): x is string => !!x && ID26.test(x)))].slice(0, 200);
  const storeIds = [...new Set(entries.map((e) => e.storeId).filter((x): x is string => !!x && ID26.test(x)))].slice(0, 200);
  const [roles, handles] = await Promise.all([
    // tenancy: platform audit actors (accounts are platform rows): the platform role beside each actor's name
    userIds.length ? db.select({ id: users.id, role: users.platformRole }).from(users).where(inArray(users.id, userIds)) : Promise.resolve([]),
    // tenancy: platform audit targets: the handle of each store a row names, for its link (no store data beyond the handle)
    storeIds.length ? db.select({ id: stores.id, handle: stores.handle }).from(stores).where(inArray(stores.id, storeIds)) : Promise.resolve([]),
  ]);
  const roleOf = new Map(roles.map((r) => [r.id, r.role]));
  const handleOf = new Map(handles.map((h) => [h.id, h.handle]));
  return entries.map((e) => ({
    id: e.id,
    at: e.createdAt.toISOString(),
    action: e.action,
    actorKind: e.actorKind,
    actor: { id: e.userId, name: e.actorName, role: e.userId ? (roleOf.get(e.userId) ?? null) : null },
    impersonator: e.impersonatorName,
    store: e.storeId ? { id: e.storeId, handle: handleOf.get(e.storeId) ?? null } : null,
    target: e.target ? redactText(e.target) : null,
    userTarget: e.target && ID26.test(e.target) && !e.storeId ? e.target : null,
    meta: redactedMeta(e.meta),
    ip8: e.ipHash ? e.ipHash.slice(0, 8) : null,
  }));
}

/** Scans newest first from `beforeId`, keeping the rows `keep` accepts, up to one page or the scan bound. */
async function scan(ctx: PlatformCtx, base: AuditFilter, beforeId: number | null, keep: (e: AuditEntry) => boolean | "stop"): Promise<{ hits: AuditEntry[]; next: number | null; partial: boolean }> {
  const hits: AuditEntry[] = [];
  let cursor = beforeId ?? undefined;
  let scanned = 0;
  for (;;) {
    const page = await listPlatformAudit(ctx, { ...base, beforeId: cursor, limit: PAGE });
    for (const e of page) {
      scanned++;
      cursor = e.id;
      const k = keep(e);
      if (k === "stop") return { hits, next: null, partial: false };
      if (k) hits.push(e);
      if (hits.length >= VIEW_PAGE) return { hits, next: e.id, partial: false };
    }
    if (page.length < PAGE) return { hits, next: null, partial: false };
    if (scanned >= VIEW_SCAN) return { hits, next: cursor ?? null, partial: true };
  }
}

/** `audit.platform`: one page of the filtered log (PLA-§14.3), newest first. */
export async function listAuditPage(ctx: PlatformCtx, filter: AuditViewFilter, beforeId: number | null = null): Promise<AuditViewPage> {
  if (!ctx.can("audit.platform")) throw new AuthRefusal("forbidden");
  const from = filter.from ? Date.parse(`${filter.from}T00:00:00Z`) : null;
  const to = filter.to ? Date.parse(`${filter.to}T00:00:00Z`) + 86_400_000 : null;
  const { storeId, actorKind, area } = filter;
  const res = await scan(ctx, { storeId, actorKind, area }, beforeId, (e) => {
    const at = e.createdAt.getTime();
    if (from !== null && at < from) return "stop";
    if (to !== null && at >= to) return false;
    return !filter.userId || e.userId === filter.userId;
  });
  return { rows: await enrich(res.hits), next: res.next, partial: res.partial };
}

/** The break-glass actions (PLA-§14.3, SE-04): names ending with "." or "_" are prefixes, the rest exact. */
export const BREAK_GLASS_ACTIONS = [
  "platform.pii.revealed",
  "platform.impersonation.",
  "platform.store.purge_",
  "platform.kill.changed",
  "platform.backup.downloaded",
  "platform.user.2fa_reset",
  "platform.user.reset_link",
  "platform.order.lookup",
  "platform.staff.changed",
] as const;

/** A break-glass row: one of the listed actions, or a store export a staff member made. */
export function isBreakGlass(action: string, actorKind: string): boolean {
  if (action.startsWith("store.export_")) return actorKind === "platform";
  return BREAK_GLASS_ACTIONS.some((a) => (a.endsWith(".") || a.endsWith("_") ? action.startsWith(a) : action === a));
}

/** `audit.platform`: one page of the break-glass log. */
export async function listBreakGlassPage(ctx: PlatformCtx, beforeId: number | null = null): Promise<AuditViewPage> {
  if (!ctx.can("audit.platform")) throw new AuthRefusal("forbidden");
  const res = await scan(ctx, {}, beforeId, (e) => isBreakGlass(e.action, e.actorKind));
  return { rows: await enrich(res.hits), next: res.next, partial: res.partial };
}

/** The weekly review (PLA-§14.3): this ISO week, whether it is marked, and the latest marks (newest first). */
export async function breakGlassReview(ctx: PlatformCtx, now: Date = new Date()): Promise<{ week: string; reviewed: boolean; marks: { week: string; at: string; by: string | null }[] }> {
  if (!ctx.can("audit.platform")) throw new AuthRefusal("forbidden");
  const marks = await listPlatformAudit(ctx, { area: "platform.breakglass.reviewed", limit: 12 });
  const week = isoWeek(now);
  return {
    week,
    reviewed: marks.some((m) => m.target === week),
    marks: marks.filter((m) => m.target).map((m) => ({ week: m.target!, at: m.createdAt.toISOString(), by: m.actorName })),
  };
}
