/** JSON answers of the export routes (shared by the route files of this folder). */
import { ExportError } from "@/lib/export/server";
import type { ExportErrorResponse } from "@/lib/export/types";
import { json, logError } from "@/lib/orders/http";

const STATUS: Record<ExportError["code"], number> = { not_found: 404, invalid: 422, forbidden: 403, unavailable: 422 };

export function exportErrorResponse(err: unknown, scope: string): Response {
  if (err instanceof ExportError) {
    return json({ ok: false, error: err.code, message: err.message, fields: err.fields } satisfies ExportErrorResponse, STATUS[err.code]);
  }
  logError(scope, err);
  return json({ ok: false, error: "server", message: "The export failed. Please try again." } satisfies ExportErrorResponse, 500);
}

export function rateLimited(retryAfter: number, message: string): Response {
  return json({ ok: false, error: "rate_limited", message } satisfies ExportErrorResponse, 429, { "Retry-After": String(retryAfter) });
}
