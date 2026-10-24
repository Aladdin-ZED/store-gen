/**
 * /api/app/<handle>/export — static exports of one of the store's landing pages (docs/STORE-SAAS.md §I.1).
 *   GET  ?pageId=<id>[&versionId=<id>] → ExportContextResponse (versions — incl. that one —, recent exports,
 *                                         defaults for the dialog)
 *   POST ExportRequest  → the ZIP as an attachment (streamed), or ExportErrorResponse JSON
 * Permission: export.create (state changes same-origin only: storeGuard). Buckets per store and user, plus a
 * store aggregate (EXP-05, §E.8).
 */
import type { NextRequest } from "next/server";
import { buildExport, getExportContext } from "@/lib/export/server";
import { ULID_RE, parseExportRequest } from "@/lib/export/options";
import { EXPORT_HEADERS, type ExportErrorResponse } from "@/lib/export/types";
import { apiHeaders, json, readJson } from "@/lib/orders/http";
import { rateLimit } from "@/lib/security/rate-limit";
import { storeGuard } from "@/lib/tenancy/seam";
import { exportErrorResponse, rateLimited } from "./errors";

type Params = { params: Promise<{ store: string }> };

export async function GET(req: NextRequest, { params }: Params): Promise<Response> {
  const g = await storeGuard(req, (await params).store, "export.create");
  if (!g.ok) return g.response;
  const pageId = req.nextUrl.searchParams.get("pageId") ?? "";
  const versionId = req.nextUrl.searchParams.get("versionId") ?? "";
  if (!ULID_RE.test(pageId) || (versionId && !ULID_RE.test(versionId))) return json({ ok: false, error: "invalid" } satisfies ExportErrorResponse, 400);
  try {
    return json(await getExportContext(g.ctx.scope, pageId, { canEmbedKey: g.ctx.can("integrations.manage"), versionId: versionId || undefined }));
  } catch (err) {
    return exportErrorResponse(err, "api/app/export:context");
  }
}

export async function POST(req: NextRequest, { params }: Params): Promise<Response> {
  const g = await storeGuard(req, (await params).store, "export.create");
  if (!g.ok) return g.response;
  const { scope, actor } = g.ctx;
  const gate = await rateLimit(`s:${scope.storeId}:export:create:${actor.userId}`, 20, 600);
  if (!gate.ok) return rateLimited(gate.retryAfter, "Too many exports in a row — wait a few minutes.");
  const store = await rateLimit(`s:${scope.storeId}:export:create`, 20, 3600);
  if (!store.ok) return rateLimited(store.retryAfter, "This store made many exports in the last hour — wait a little.");
  const body = await readJson(req, 16 * 1024);
  if (!body.ok) return json({ ok: false, error: "invalid" } satisfies ExportErrorResponse, body.status);
  const parsed = parseExportRequest(body.value);
  if (!parsed.ok) {
    return json({ ok: false, error: "invalid", message: Object.values(parsed.errors)[0], fields: parsed.errors } satisfies ExportErrorResponse, 422);
  }
  try {
    const built = await buildExport(scope, parsed.value, actor, { canEmbedKey: g.ctx.can("integrations.manage") });
    const headers = apiHeaders({
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${built.fileName}"`,
      [EXPORT_HEADERS.id]: built.exportId,
      [EXPORT_HEADERS.estimate]: String(built.estimate),
    });
    return new Response(built.stream, { status: 200, headers });
  } catch (err) {
    return exportErrorResponse(err, "api/app/export:create");
  }
}
