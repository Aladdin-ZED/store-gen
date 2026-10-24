/**
 * GET /api/admin/sheets/status — setup wizard state of the store:
 * { configured, serviceAccountEmail, sheet: { url, title, enabled, connectedAt… } | null, queue }.
 */
import type { NextRequest } from "next/server";
import { legacyReadGuard } from "@/lib/admin-data/legacy-store";
import { json, logError } from "@/lib/orders/http";
import { getSheetsConfig, isSheetsConfigured, serviceAccountEmail, syncHealth } from "@/lib/sheets";

export async function GET(req: NextRequest): Promise<Response> {
  const g = await legacyReadGuard(req, "settings.read");
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
    logError("api/admin/sheets:status", err);
    return json({ ok: false, error: "server" }, 500);
  }
}
