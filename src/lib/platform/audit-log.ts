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
import { z } from "zod";
import { auditFrom, listPlatformAudit, type AuditEntry } from "@/lib/audit";
import { AuthRefusal, FieldsError } from "@/lib/auth/errors";
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
