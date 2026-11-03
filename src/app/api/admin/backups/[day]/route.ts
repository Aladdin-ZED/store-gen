/**
 * GET /api/admin/backups/<YYYY-MM-DD> (platform.md PLA-§17, §M.2, OS-10; core §H.6): one day's backup as a stored
 * (level 0) ZIP of the sealed parts, `manifest.json` (sizes and SHA-256) and `README.txt`. `backups.manage`
 * (super_admin) with a fresh step-up (`step_up` otherwise); an unknown day answers the neutral 404. A completed
 * download audits `platform.backup.downloaded` and sets `platform.backup.lastDownloadAt`. `private, no-store`.
 */
import { AuthRefusal } from "@/lib/auth/errors";
import { apiHeaders, json } from "@/lib/orders/http";
import { backupArchive } from "@/lib/platform/backups";
import { isNotImplemented } from "@/lib/platform/panel";
import { platformGuard } from "@/lib/platform/seam";

type Params = { params: Promise<{ day: string }> };

const PRIVATE = { "Cache-Control": "private, no-store" };

export async function GET(req: Request, { params }: Params): Promise<Response> {
  const g = await platformGuard(req, "backups.manage");
  if (!g.ok) return g.response;
  const { day } = await params;
  try {
    const archive = await backupArchive(g.ctx, day);
    if (!archive) return json({ ok: false, error: "not_found" }, 404, PRIVATE);
    return new Response(archive.stream, {
      status: 200,
      headers: apiHeaders({ ...PRIVATE, "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${archive.filename}"` }),
    });
  } catch (err) {
    if (err instanceof AuthRefusal && err.code === "step_up") return json({ ok: false, error: "step_up" }, 403, PRIVATE);
    if (err instanceof AuthRefusal) return json({ ok: false, error: "not_found" }, 404, PRIVATE);
    // P8's backup reader before its merge: nothing to download
    if (isNotImplemented(err)) return json({ ok: false, error: "not_found" }, 404, PRIVATE);
    throw err;
  }
}
