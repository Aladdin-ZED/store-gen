/**
 * GET /api/app/<handle>/export/estimate?versionId=…&mode=connected|php|whatsapp[&hostConfigs=0][&siteUrl=…][&whatsapp=…]
 * → ExportEstimateResponse: approximate ZIP size and the warnings of that export of one of the store's versions
 * (nothing is recorded). Buckets per member and per store (EXP-05, §E.8).
 */
import type { NextRequest } from "next/server";
import { parseExportRequest } from "@/lib/export/options";
import { estimateExport } from "@/lib/export/server";
import type { ExportErrorResponse } from "@/lib/export/types";
import { json } from "@/lib/orders/http";
import { rateLimit, storeBucket } from "@/lib/security/rate-limit";
import { storeGuard } from "@/lib/tenancy/seam";
import { exportErrorResponse, rateLimited } from "../errors";

type Params = { params: Promise<{ store: string }> };

export async function GET(req: NextRequest, { params }: Params): Promise<Response> {
  const g = await storeGuard(req, (await params).store, "export.create");
  if (!g.ok) return g.response;
  const { scope, user } = g.ctx;
  const gate = await rateLimit(storeBucket(scope, "export:estimate", user.id), 150, 600);
  if (!gate.ok) return rateLimited(gate.retryAfter, "Too many requests. Wait a minute.");
  // the store aggregate (EXP-05, §E.8): each estimate builds a whole bundle, so the members together get a bounded
  // share of the process (four open dialogs at full typing speed fit; a scripted loop does not)
  const store = await rateLimit(storeBucket(scope, "export:estimate"), 400, 600);
  if (!store.ok) return rateLimited(store.retryAfter, "This store asked for many estimates in the last minutes. Wait a little.");
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
    return exportErrorResponse(err, "api/app/export:estimate");
  }
}
