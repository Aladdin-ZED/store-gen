/**
 * JSON shapes of the admin export API (isomorphic types only).
 *
 *   GET    /api/admin/export?pageId=…                    → ExportContextResponse
 *   GET    /api/admin/export/estimate?versionId=…&mode=… → ExportEstimateResponse
 *   POST   /api/admin/export          (ExportRequest)     → the ZIP (attachment) | ExportErrorResponse
 *   DELETE /api/admin/export/<exportId>                   → { ok: true, export } (revoked)
 */
import type { ExportMode, ExportRequestField } from "./options";

export interface ExportVersionJson {
  id: string;
  kind: "generation" | "save" | "publish" | "restore" | "import" | "autosave";
  label: string | null;
  createdAt: string;
  /** the page's current live version */
  published: boolean;
}

export interface ExportRecordJson {
  id: string;
  versionId: string;
  mode: ExportMode;
  allowedOrigins: string[];
  fileName: string | null;
  /** ZIP size; null while the download is running (or when it was interrupted) */
  bytes: number | null;
  createdAt: string;
  revokedAt: string | null;
  createdByName: string | null;
}

export interface ExportDefaultsJson {
  /** suggested public address (none known yet: null) */
  siteUrl: string | null;
  /** WhatsApp number the page or the store already uses (wa.me digits) */
  whatsapp: string | null;
  /** the app's public origin that connected exports call */
  apiOrigin: string | null;
  /** why connected mode is unavailable (no https PUBLIC_URL), else null */
  connectedBlocker: string | null;
  /** a Google Sheet is connected in Settings (its id pre-fills the PHP config) */
  sheetConnected: boolean;
  /** the user may embed a Google service-account key (owners, dedicated export key configured) */
  canEmbedServiceAccount: boolean;
  /** owners: why no key can be embedded (no dedicated export key, or it is the app's own), else null */
  embedKeyBlocker: string | null;
  /** owners: client_email of the dedicated export key that would be embedded */
  exportServiceAccountEmail: string | null;
}

export interface ExportContextResponse {
  ok: true;
  page: { id: string; name: string; slug: string; status: "draft" | "published" | "archived"; publishedVersionId: string | null };
  versions: ExportVersionJson[];
  exports: ExportRecordJson[];
  defaults: ExportDefaultsJson;
}

export interface ExportEstimateResponse {
  ok: true;
  /** approximate ZIP size in bytes */
  bytes: number;
  files: number;
  breakdown: { pages: number; media: number; fonts: number; other: number };
  /** things to fix or know before shipping (missing images, store details for the legal pages…) */
  warnings: string[];
}

export interface ExportErrorResponse {
  ok: false;
  error: "invalid" | "not_found" | "forbidden" | "unavailable" | "rate_limited" | "server" | string;
  message?: string;
  fields?: Partial<Record<ExportRequestField, string>>;
  /** the refusal's item id when it has one (LP-16: `export:runtime_v3_unsupported`, core D75) */
  item?: "export:runtime_v3_unsupported";
}

/** Response headers of a successful POST (the dialog shows progress against the estimate). */
export const EXPORT_HEADERS = {
  id: "X-Export-Id",
  estimate: "X-Export-Estimate",
} as const;
