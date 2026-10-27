import "server-only";
/**
 * The store export ZIP (P8 PLATFORM OPS; docs/STORE-SAAS.md §F.9, PL-09, §H.2 slot 5; platform.md PLA Q.25; §K.2 P0): an
 * `export_jobs` row built by the cron in slices into `DATA_DIR/exports/<storeId>/<jobId>/`, zipped into parts of
 * ≤ 500 MB, downloadable 24 h through a signed link, deleted after 72 h. The owner asks from `/settings/danger`
 * (`store.export` ↑); a super_admin from the console (`requestedAs: "platform"`, audited and notified to the store).
 * Typed stubs frozen at P0.
 */
import type { exportJobs } from "@/lib/db/schema";
import type { StoreScope } from "@/lib/tenancy/types";

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
  /** the ZIP parts (≤ 500 MB each) */
  parts: { name: string; bytes: number }[];
  error: string | null;
}

export async function requestStoreExport(scope: StoreScope, by: { requestedAs: "member" | "platform"; requestedBy: string }): Promise<{ jobId: string }> {
  void scope;
  void by;
  throw new Error("not implemented: P8 requestStoreExport");
}

/** The store's export jobs, newest first. */
export async function listExportJobs(scope: StoreScope): Promise<ExportJobSummary[]> {
  void scope;
  throw new Error("not implemented: P8 listExportJobs");
}

/** One ready part of a job of this store; null when the job, the part or the store does not match. */
export async function exportPartStream(scope: StoreScope, jobId: string, part: string): Promise<ReadableStream | null> {
  void scope;
  void jobId;
  void part;
  throw new Error("not implemented: P8 exportPartStream");
}
