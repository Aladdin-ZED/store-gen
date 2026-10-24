/**
 * GET /api/admin/export/estimate?versionId=…&mode=connected|php|whatsapp[&hostConfigs=0][&siteUrl=…][&whatsapp=…]
 * → ExportEstimateResponse: approximate ZIP size and the warnings of that export of one of the store's versions
 * (nothing is recorded).
 */
import type { NextRequest } from "next/server";
import { legacyGuard } from "@/lib/admin-data/legacy-store";
import { parseExportRequest } from "@/lib/export/options";
import { estimateExport } from "@/lib/export/server";
import type { ExportErrorResponse } from "@/lib/export/types";
import { json } from "@/lib/orders/http";
import { rateLimit } from "@/lib/security/rate-limit";
import { exportErrorResponse, rateLimited } from "../errors";

export async function GET(req: NextRequest): Promise<Response> {
  const g = await legacyGuard(req, "export.create");
  if (!g.ok) return g.response;
  const { scope, actor } = g.ctx;
  const gate = await rateLimit(`s:${scope.storeId}:export:estimate:${actor.userId}`, 150, 600);
  if (!gate.ok) return rateLimited(gate.retryAfter, "Too many requests — wait a minute.");
  const q = req.nextUrl.searchParams;
  const parsed = parseExportRequest(
    {
      versionId: q.get("versionId") ?? "",
      mode: q.get("mode") ?? "",
      options: {
        hostConfigs: q.get("hostConfigs") !== "0",
        ...(q.get("siteUrl") ? { siteUrl: q.get("siteUrl") } : {}),
        ...(q.get("whatsapp") ? { whatsappNumber: q.get("whatsapp") } : {}),
      },
    },
    { requireOrigins: false },
  );
  if (!parsed.ok) {
    return json({ ok: false, error: "invalid", message: Object.values(parsed.errors)[0], fields: parsed.errors } satisfies ExportErrorResponse, 422);
  }
  try {
    return json(await estimateExport(scope, parsed.value));
  } catch (err) {
    return exportErrorResponse(err, "api/admin/export:estimate");
  }
}
