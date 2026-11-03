/**
 * GET /api/admin/search?q= (platform.md PLA-§4.4, §M.2): the console ⌘K results, masked per role. `console.read`;
 * at least 2 characters (shorter answers the empty result), `p:console:search:<userId>` 60/min (429 past it),
 * 10 results per group; `private, no-store`.
 */
import type { NextRequest } from "next/server";
import { AuthRefusal } from "@/lib/auth/errors";
import { json } from "@/lib/orders/http";
import { consoleSearch } from "@/lib/platform/search";
import { platformGuard } from "@/lib/platform/seam";

const PRIVATE = { "Cache-Control": "private, no-store" };

export async function GET(req: NextRequest): Promise<Response> {
  const g = await platformGuard(req, "console.read");
  if (!g.ok) return g.response;
  try {
    return json(await consoleSearch(g.ctx, req.nextUrl.searchParams.get("q") ?? ""), 200, PRIVATE);
  } catch (err) {
    if (err instanceof AuthRefusal && err.code === "rate_limited") return json({ ok: false, error: "rate_limited" }, 429, { ...PRIVATE, "Retry-After": "60" });
    throw err;
  }
}
