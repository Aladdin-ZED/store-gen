import "server-only";
/**
 * The store export ZIP (P8 PLATFORM OPS; docs/STORE-SAAS.md §F.9, PL-09, §H.2 slot 5; platform.md PLA Q.25; §K.2 P0): an
 * `export_jobs` row built by the cron in slices into `DATA_DIR/exports/<storeId>/<jobId>/`, zipped into parts of
 * ≤ 500 MB, downloadable 24 h through a signed link, deleted after 72 h. The owner asks from `/settings/danger`
 * (`store.export` ↑); a super_admin from the console (`requestedAs: "platform"`, audited and notified to the store).
 * Real from R1 P8 step 8 (frozen signatures unchanged; `ExportJobSummary` gained fields, additively).
 *
 *   const { jobId } = await requestStoreExport(scope, { requestedAs: "member", requestedBy: ctx.user.id });  // < 500 ms
 *   const jobs = await listExportJobs(scope);           // newest first; a ready part carries a fresh 24 h signed href
 *   const body = await exportPartStream(scope, jobId, "1");    // P1's console route; null = the neutral 404
 *
 * - requestStoreExport: one active job per store (an active one answers its jobId, nothing charged), else the bucket
 *   `s:<sid>:export:zip` (3 a day, `SeamError("rate_limited")` past it) and a `pending` row inserted with a system
 *   WriteScope (src/lib/jobs/exports.ts), so a suspended or closed store's read-only member scope (§A.5.3) and the
 *   console's platformScope (D71) both work. Not charged to `exports_month` (data portability). The callers (P2's
 *   `requestStoreExportAction`, P1's `requestPlatformExportAction`) write the `store.export_requested` audit row with
 *   `meta.stepUp`; this module writes no audit.
 * - The UX contract (§I.8): states are the enum, errors are codes, `bytes` is null until known, nothing invented.
 */
import { open, type FileHandle } from "node:fs/promises";
import { join } from "node:path";
import { and, desc, eq, gt, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { newId } from "@/lib/db/ids";
import { exportJobs } from "@/lib/db/schema";
import { storeLock, withNamedLock } from "@/lib/db/locks";
import { exportWriteScope } from "@/lib/jobs/exports";
import { fileRangeStream } from "@/lib/media/storage/io";
import { rateLimit, storeBucket } from "@/lib/security/rate-limit";
import { dataDir, STORE_DIR_ID_RE } from "@/lib/storage/paths";
import { getStoreById } from "@/lib/tenancy/public";
import { SeamError } from "@/lib/tenancy/seam";
import { byId, storeValues, whereStore } from "@/lib/tenancy/sql";
import type { StoreScope, WriteScope } from "@/lib/tenancy/types";
import { apiHref } from "@/lib/urls";
import { exportDir } from "./job";
import { exportToken, linkExpiry } from "./sign";
import { partFileName } from "./zip";

export type ExportJobState = (typeof exportJobs.$inferSelect)["state"];

export interface ExportJobSummary {
  id: string;
  requestedAs: "member" | "platform";
  requestedBy: string;
  state: ExportJobState;
  createdAt: string;
  doneAt: string | null;
  expiresAt: string | null;
  bytes: number | null;
  /**
   * the ZIP parts (≤ 500 MB each). P8 step 8 (additive): `n` (1-based, the route's `<part>`), `name` is the download
   * file name `<handle>-export-<YYYY-MM-DD>-<n>.zip`, `href` a fresh signed link (24 h, never past `expiresAt`) while
   * the job is ready, else null
   */
  parts: { n: number; name: string; bytes: number; href: string | null }[];
  /** a failure code: no_data_dir, no_space, store_gone, cursor_lost, part_lost, write_failed */
  error: string | null;
  /** P8 step 8 (additive): while running, the part being written and the archive entries so far; else null */
  progress: { part: number; entries: number } | null;
}

/** §F.9 / §E.8: s:<sid>:export:zip, 3 a day */
export const EXPORT_REQUESTS_PER_DAY = 3;
/** jobs listed (newest first) */
const LIST_LIMIT = 20;

const RequestedBy = z.object({ requestedAs: z.enum(["member", "platform"]), requestedBy: z.string().regex(STORE_DIR_ID_RE) }).strict();
const PART_RE = /^[1-9]\d{0,3}$/;

/** The insert of a pending job (a system WriteScope of the store, ./jobs/exports.ts). */
async function insertExportJob(scope: WriteScope, by: z.output<typeof RequestedBy>): Promise<string> {
  const id = newId();
  await db.insert(exportJobs).values(storeValues(scope, { id, requestedAs: by.requestedAs, requestedBy: by.requestedBy, state: "pending" as const }));
  return id;
}

export async function requestStoreExport(scope: StoreScope, by: { requestedAs: "member" | "platform"; requestedBy: string }): Promise<{ jobId: string }> {
  const input = RequestedBy.parse(by);
  const r = await withNamedLock(storeLock(scope.storeId, "export"), 2, async () => {
    const [active] = await db
      .select({ id: exportJobs.id })
      .from(exportJobs)
      .where(whereStore(exportJobs, scope, inArray(exportJobs.state, ["pending", "running"])))
      .orderBy(desc(exportJobs.createdAt))
      .limit(1);
    if (active) return active.id;
    const rate = await rateLimit(storeBucket(scope, "export", "zip"), EXPORT_REQUESTS_PER_DAY, 86_400);
    if (!rate.ok) throw new SeamError("rate_limited");
    return insertExportJob(exportWriteScope(scope), input);
  });
  // another request of this store holds the lock right now: the caller asks again
  if (!r.ran) throw new SeamError("rate_limited");
  return { jobId: r.value };
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

/** `<handle>-export-<YYYY-MM-DD>-<n>.zip` (the request's UTC day) */
export const partDownloadName = (handle: string, createdAt: Date, n: number): string => `${handle}-export-${createdAt.toISOString().slice(0, 10)}-${n}.zip`;

/** The store's export jobs, newest first. */
export async function listExportJobs(scope: StoreScope): Promise<ExportJobSummary[]> {
  const rows = await db
    .select({
      id: exportJobs.id,
      requestedAs: exportJobs.requestedAs,
      requestedBy: exportJobs.requestedBy,
      state: exportJobs.state,
      createdAt: exportJobs.createdAt,
      doneAt: exportJobs.doneAt,
      expiresAt: exportJobs.expiresAt,
      bytes: exportJobs.bytes,
      parts: exportJobs.parts,
      error: exportJobs.error,
      cursor: exportJobs.cursor,
    })
    .from(exportJobs)
    .where(whereStore(exportJobs, scope))
    .orderBy(desc(exportJobs.createdAt), desc(exportJobs.id))
    .limit(LIST_LIMIT);
  if (!rows.length) return [];
  const store = await getStoreById(scope.storeId);
  const now = Date.now();
  return rows.map((r) => {
    const live = r.state === "ready" && !!store && !!r.expiresAt && r.expiresAt.getTime() > now;
    const exp = live ? linkExpiry(now, r.expiresAt) : 0;
    const cur = r.state === "running" ? (r.cursor as { entries?: unknown; zip?: { n?: unknown } } | null) : null;
    return {
      id: r.id,
      requestedAs: r.requestedAs,
      requestedBy: r.requestedBy,
      state: r.state,
      createdAt: r.createdAt.toISOString(),
      doneAt: iso(r.doneAt),
      expiresAt: iso(r.expiresAt),
      bytes: r.bytes ?? null,
      parts: (r.state === "ready" || r.state === "expired" ? (r.parts ?? []) : []).map((p, i) => ({
        n: i + 1,
        name: store ? partDownloadName(store.handle, r.createdAt, i + 1) : p.name,
        bytes: p.bytes,
        href: live && store ? apiHref(store.handle, `/exports/${r.id}/${i + 1}?t=${exportToken(scope.storeId, r.id, String(i + 1), exp)}`) : null,
      })),
      error: r.error ?? null,
      progress: cur ? { part: typeof cur.zip?.n === "number" ? cur.zip.n : 1, entries: typeof cur.entries === "number" ? cur.entries : 0 } : null,
    };
  });
}

/** One ready, unexpired part of a job of this store, opened; null when the job, the part or the store does not match. */
export async function openExportPart(scope: StoreScope, jobId: string, part: string): Promise<{ stream: ReadableStream<Uint8Array>; bytes: number; filename: string } | null> {
  if (!STORE_DIR_ID_RE.test(jobId) || !PART_RE.test(part) || !dataDir()) return null;
  const [job] = await db
    .select({ parts: exportJobs.parts, createdAt: exportJobs.createdAt })
    .from(exportJobs)
    .where(and(byId(exportJobs, scope, jobId), eq(exportJobs.state, "ready"), gt(exportJobs.expiresAt, new Date())))
    .limit(1);
  const n = Number(part);
  const info = job?.parts?.[n - 1];
  if (!job || !info) return null;
  const store = await getStoreById(scope.storeId);
  if (!store) return null;
  let fh: FileHandle;
  try {
    fh = await open(/* turbopackIgnore: true */ join(exportDir(scope.storeId, jobId), partFileName(n)), "r");
  } catch {
    return null;
  }
  const size = (await fh.stat().catch(() => null))?.size ?? -1;
  if (size !== info.bytes || size <= 0) {
    await fh.close().catch(() => undefined);
    return null;
  }
  return { stream: fileRangeStream(fh, 0, size - 1), bytes: size, filename: partDownloadName(store.handle, job.createdAt, n) };
}

/** One ready part of a job of this store; null when the job, the part or the store does not match. */
export async function exportPartStream(scope: StoreScope, jobId: string, part: string): Promise<ReadableStream | null> {
  return (await openExportPart(scope, jobId, part))?.stream ?? null;
}
