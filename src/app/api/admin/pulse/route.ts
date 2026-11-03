/**
 * GET /api/admin/pulse (platform.md PLA-§4.6, §M.2, PD38): the console pulse, polled every 15 s while the tab is
 * visible. `console.read`; `ETag` = sha256 of the body without its time, `If-None-Match` → 304; `private, no-store`.
 * The platform part is cached 5 s (src/lib/platform/pulse.ts); the unread count and the view-as are this staff member's.
 */
import { apiHeaders, json } from "@/lib/orders/http";
import { consolePulse } from "@/lib/platform/pulse";
import { etagMatches, pulseEtag } from "@/lib/platform/pulse-rules";
import { platformGuard } from "@/lib/platform/seam";

const PRIVATE = { "Cache-Control": "private, no-store" };

export async function GET(req: Request): Promise<Response> {
  const g = await platformGuard(req, "console.read");
  if (!g.ok) return g.response;
  const pulse = await consolePulse(g.ctx);
  const etag = pulseEtag(pulse);
  if (etagMatches(req.headers.get("if-none-match"), etag)) return new Response(null, { status: 304, headers: apiHeaders({ ...PRIVATE, ETag: etag }) });
  return json(pulse, 200, { ...PRIVATE, ETag: etag });
}
