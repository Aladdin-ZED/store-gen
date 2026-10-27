/**
 * POST /api/app/<handle>/sheets/sync — "Sync now": push the store's queued/failed orders (ignoring retry backoff) and
 * pull the statuses set by agents in the store's sheet.
 */
import type { NextRequest } from "next/server";
import { json, logError } from "@/lib/orders/http";
import { rateLimit, storeBucket } from "@/lib/security/rate-limit";
import { pullStatuses, syncPendingOrders } from "@/lib/sheets";
import { storeGuard } from "@/lib/tenancy/seam";

type Params = { params: Promise<{ store: string }> };

export const maxDuration = 60;

export async function POST(req: NextRequest, { params }: Params): Promise<Response> {
  const g = await storeGuard(req, (await params).store, "orders.write");
  if (!g.ok) return g.response;
  const { scope, user } = g.ctx;
  const gate = await rateLimit(storeBucket(scope, "sheets:sync", user.id), 12, 600);
  if (!gate.ok) return json({ ok: false, error: "rate_limited" }, 429, { "Retry-After": String(gate.retryAfter) });
  try {
    const push = await syncPendingOrders(scope, { force: true, limit: 200 });
    const pull = push.status === "not_configured" ? null : await pullStatuses(scope, { force: true });
    return json({ ok: push.status !== "error" && pull?.status !== "error", push, pull });
  } catch (err) {
    logError("api/app/sheets:sync", err);
    return json({ ok: false, error: "server" }, 500);
  }
}
