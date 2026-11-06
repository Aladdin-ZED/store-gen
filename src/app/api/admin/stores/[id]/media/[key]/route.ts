/**
 * GET /api/admin/stores/<id>/media/<key> (platform.md PLA-§7.13, §M.2; P0b V-1, review F-4): one media file of the
 * store in the URL for the console's previews, whatever the store's state. `console.read`; a key of another store or
 * an unknown key answers the neutral 404. The handler's headers: the media sandbox CSP, nosniff and `private,
 * no-store` (never CORP `cross-origin`); the proxy adds CORP `same-origin`, frame DENY, Referrer-Policy and noindex.
 */
import { apiHeaders, json } from "@/lib/orders/http";
import { consoleMediaHeaders, loadConsoleMedia } from "@/lib/platform/media";
import { platformGuard } from "@/lib/platform/seam";

type Params = { params: Promise<{ id: string; key: string }> };

export async function GET(req: Request, { params }: Params): Promise<Response> {
  const g = await platformGuard(req, "console.read");
  if (!g.ok) return g.response;
  const { id, key } = await params;
  const file = await loadConsoleMedia(g.ctx, id, decodeURIComponent(key));
  if (!file) return json({ ok: false, error: "not_found" }, 404, { "Cache-Control": "private, no-store" });
  // the media headers over the API base (frame deny, noindex); CORP is the proxy's `same-origin`, never set here
  const headers = apiHeaders(consoleMediaHeaders(file));
  headers.delete("Cross-Origin-Resource-Policy");
  return new Response(file.stream, { status: 200, headers });
}
