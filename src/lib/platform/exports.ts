import "server-only";
/**
 * Export from the store profile (platform.md PLA-§7.14, PL-09, PD27; core §F.9; P8's export ZIP, PLA Q.25):
 *
 *   const { jobId } = await requestPlatformExport(ctx, { storeId, reason: "legal_request", note });   // super_admin ↑
 *   const jobs = await listPlatformExports(ctx, storeId);                 // the profile's job states and part links
 *   const part = await openExportPart(ctx, { storeId, jobId, part, exp, t });   // the download route's body
 *
 * The job is P8's (`requestStoreExport(platformScope, { requestedAs: "platform", requestedBy })`, "unavailable" until P8
 * merges); this file adds the console's side: `stores.close` with a fresh step-up and a reason, the audit
 * `store.export_requested` (actor_kind `platform`), the store's notification `store.export_by_platform` (owners), and
 * the staff download links `GET /api/admin/stores/<id>/exports/<jobId>/<part>?e=<exp>&t=<sig>` with
 * `sig = hmac(jobId|part|exp|staffUserId, "export-dl-staff:<storeId>")`, valid 24 h and bound to the staff member who
 * asked for the link. Each download audits `store.export_downloaded` (actor_kind `platform`).
 */
import { z } from "zod";
import { auditFrom } from "@/lib/audit";
import { AuthRefusal, FieldsError } from "@/lib/auth/errors";
import { exportPartStream, listExportJobs, requestStoreExport, type ExportJobSummary } from "@/lib/exports-store";
import { hmac, safeEqual } from "@/lib/security/crypto";
import type { PlatformCtx } from "@/lib/tenancy/types";
import { notify } from "./notify";
import { platformScope } from "./seam";

/** PLA-§7.14: a staff download link lives 24 h */
export const EXPORT_LINK_TTL_MS = 24 * 3_600_000;
export const EXPORT_REASONS = ["legal_request", "owner_request", "abuse", "support", "other"] as const;
const ID_RE = /^[0-9A-Z]{26}$/;
const PART_RE = /^[A-Za-z0-9._-]{1,80}$/;

export const PlatformExportInput = z.object({
  storeId: z.string().regex(ID_RE),
  reason: z.enum(EXPORT_REASONS),
  note: z.string().trim().max(500).optional(),
});

function requireExport(ctx: PlatformCtx): void {
  if (!ctx.can("stores.close") || ctx.role !== "super_admin") throw new AuthRefusal("forbidden");
  if (!ctx.stepUpFresh) throw new AuthRefusal("step_up");
}

/** `stores.close` (super_admin) ↑ with a reason: P8's job, the audit, the owners' notification. */
export async function requestPlatformExport(ctx: PlatformCtx, input: unknown): Promise<{ jobId: string }> {
  requireExport(ctx);
  const parsed = PlatformExportInput.safeParse(input);
  if (!parsed.success) throw new FieldsError({ [String(parsed.error.issues[0]?.path[0] ?? "reason")]: "console.export.invalid" });
  const { storeId, reason, note } = parsed.data;
  if (reason === "other" && !note) throw new FieldsError({ note: "console.export.note_required" });
  const { jobId } = await requestStoreExport(platformScope(ctx, storeId), { requestedAs: "platform", requestedBy: ctx.user.id });
  await auditFrom(ctx, "store.export_requested", { storeId, target: jobId, meta: { requestedAs: "platform", reason, ...(note ? { hasNote: true } : {}) } });
  await notify({ audience: "store_role", storeId, roles: ["owner"] }, "store.export_by_platform", { reason }, { dedupeKey: `export_by_platform:${jobId}` });
  return { jobId };
}

/** The download signature of one part for one staff member (PLA-§7.14). */
export function exportPartSignature(storeId: string, jobId: string, part: string, exp: number, staffUserId: string): string {
  return hmac(`${jobId}|${part}|${exp}|${staffUserId}`, `export-dl-staff:${storeId}`);
}

/** The signed staff link of one ready part, valid 24 h from `now`. */
export function exportPartHref(ctx: PlatformCtx, storeId: string, jobId: string, part: string, now: Date = new Date()): string {
  const exp = now.getTime() + EXPORT_LINK_TTL_MS;
  const t = exportPartSignature(storeId, jobId, part, exp, ctx.user.id);
  return `/api/admin/stores/${storeId}/exports/${jobId}/${encodeURIComponent(part)}?e=${exp}&t=${t}`;
}

export interface PlatformExportJob extends ExportJobSummary {
  /** the parts' staff links while the job is ready and the requester may download */
  links: { name: string; bytes: number; href: string }[];
}

/** The store's export jobs, newest first, with this staff member's signed links (`stores.close`, super_admin). */
export async function listPlatformExports(ctx: PlatformCtx, storeId: string, now: Date = new Date()): Promise<PlatformExportJob[]> {
  if (!ctx.can("console.read")) throw new AuthRefusal("forbidden");
  const jobs = await listExportJobs(platformScope(ctx, storeId));
  const mayDownload = ctx.can("stores.close") && ctx.role === "super_admin";
  return jobs.map((j) => ({
    ...j,
    links: mayDownload && j.state === "ready" ? j.parts.filter((p) => PART_RE.test(p.name)).map((p) => ({ ...p, href: exportPartHref(ctx, storeId, j.id, p.name, now) })) : [],
  }));
}

/** Verifies a staff link: the store, the job, the part, the expiry and the staff member it was signed for. */
export function verifyExportLink(ctx: PlatformCtx, v: { storeId: string; jobId: string; part: string; exp: string | null; t: string | null }, now: Date = new Date()): boolean {
  if (!ID_RE.test(v.storeId) || !ID_RE.test(v.jobId) || !PART_RE.test(v.part)) return false;
  const exp = Number(v.exp);
  if (!Number.isSafeInteger(exp) || exp <= now.getTime() || exp > now.getTime() + EXPORT_LINK_TTL_MS + 60_000) return false;
  if (typeof v.t !== "string" || !/^[a-f0-9]{64}$/.test(v.t)) return false;
  return safeEqual(v.t, exportPartSignature(v.storeId, v.jobId, v.part, exp, ctx.user.id));
}

/**
 * The download route's body (`stores.close` + a fresh step-up, checked by `platformGuard` and here): the part's stream,
 * or null (a tampered, expired or foreign link, or no such part) for the neutral 404. Audits the download.
 */
export async function openExportPart(ctx: PlatformCtx, v: { storeId: string; jobId: string; part: string; exp: string | null; t: string | null }, now: Date = new Date()): Promise<ReadableStream | null> {
  requireExport(ctx);
  if (!verifyExportLink(ctx, v, now)) return null;
  const stream = await exportPartStream(platformScope(ctx, v.storeId), v.jobId, v.part);
  if (!stream) return null;
  await auditFrom(ctx, "store.export_downloaded", { storeId: v.storeId, target: v.jobId, meta: { part: v.part, requestedAs: "platform" } });
  return stream;
}
