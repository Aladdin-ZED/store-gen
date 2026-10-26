/**
 * GET /api/app/<handle>/sheets/status — setup wizard state of the store:
 * { configured, serviceAccountEmail, sheet: { url, title, enabled, connectedAt… } | null, queue }.
 */
import type { NextRequest } from "next/server";
import { json, logError } from "@/lib/orders/http";
import { getSheetsConfig, isSheetsConfigured, serviceAccountEmail, syncHealth } from "@/lib/sheets";
import { storeGuard } from "@/lib/tenancy/seam";

type Params = { params: Promise<{ store: string }> };

export async function GET(req: NextRequest, { params }: Params): Promise<Response> {
  const g = await storeGuard(req, (await params).store, "settings.read");
  if (!g.ok) return g.response;
  try {
    const [sheet, queue] = await Promise.all([getSheetsConfig(g.ctx.scope), syncHealth(g.ctx.scope)]);
    return json({
      ok: true,
      configured: isSheetsConfigured(),
      serviceAccountEmail: serviceAccountEmail(),
      sheet,
      queue,
    });
  } catch (err) {
    logError("api/app/sheets:status", err);
    return json({ ok: false, error: "server" }, 500);
  }
}
