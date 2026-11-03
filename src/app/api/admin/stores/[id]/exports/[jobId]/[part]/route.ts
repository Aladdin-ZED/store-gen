/**
 * GET /api/admin/stores/<id>/exports/<jobId>/<part>?e=<exp>&t=<sig> (platform.md PLA-§7.14, §M.2, PL-09): one part of
 * a store export for the staff member the link was signed for. `stores.close` (super_admin) with a fresh step-up
 * (`step_up` otherwise); a tampered, expired or foreign signature, or no such part, answers the neutral 404. Each
 * download audits `store.export_downloaded` (actor platform). `private, no-store`, `Content-Disposition: attachment`.
 */
import type { NextRequest } from "next/server";
import { AuthRefusal } from "@/lib/auth/errors";
import { apiHeaders, json } from "@/lib/orders/http";
import { openExportPart } from "@/lib/platform/exports";
import { platformGuard } from "@/lib/platform/seam";

type Params = { params: Promise<{ id: string; jobId: string; part: string }> };

const PRIVATE = { "Cache-Control": "private, no-store" };

export async function GET(req: NextRequest, { params }: Params): Promise<Response> {
  const g = await platformGuard(req, "stores.close");
  if (!g.ok) return g.response;
  const { id, jobId, part } = await params;
  const name = decodeURIComponent(part);
  const q = req.nextUrl.searchParams;
  try {
    const stream = await openExportPart(g.ctx, { storeId: id, jobId, part: name, exp: q.get("e"), t: q.get("t") });
    if (!stream) return json({ ok: false, error: "not_found" }, 404, PRIVATE);
    return new Response(stream, {
      status: 200,
      headers: apiHeaders({ ...PRIVATE, "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename="${name.replace(/[^A-Za-z0-9._-]/g, "_")}"` }),
    });
  } catch (err) {
    if (err instanceof AuthRefusal && err.code === "step_up") return json({ ok: false, error: "step_up" }, 403, PRIVATE);
    if (err instanceof AuthRefusal) return json({ ok: false, error: "not_found" }, 404, PRIVATE);
    throw err;
  }
}
