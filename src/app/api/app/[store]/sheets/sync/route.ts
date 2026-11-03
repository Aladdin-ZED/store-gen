/**
 * POST /api/app/<handle>/sheets/sync — "Sync now" for the R1.0 widgets that still fetch it (the dashboard's sheet
 * health and the orders list, src/components/admin/lib/sheets-client.ts): the same run as `syncSheetNowAction`
 * (`syncSheetNow`: 3 calls, failed orders skip their backoff, the pull whatever its window says). `integrations.manage`
 * and the feature `sheets` (OPE-§M.2), the bucket `s:<sid>:sheets:sync:<uid>` 12 per 10 minutes shared with the action.
 * Answers the R1.0 shape `{ ok, push, pull }`.
 */
import type { NextRequest } from "next/server";
import { json, logError } from "@/lib/orders/http";
import { rateLimit, storeBucket } from "@/lib/security/rate-limit";
import { SYNC_BUCKET, syncResultOf, syncSheetNow } from "@/lib/sheets";
import { storeGuard } from "@/lib/tenancy/seam";

type Params = { params: Promise<{ store: string }> };

export const maxDuration = 60;

export async function POST(req: NextRequest, { params }: Params): Promise<Response> {
  const g = await storeGuard(req, (await params).store, "integrations.manage", { feature: "sheets" });
  if (!g.ok) return g.response;
  const { scope, user } = g.ctx;
  const gate = await rateLimit(storeBucket(scope, SYNC_BUCKET.name, user.id), SYNC_BUCKET.limit, SYNC_BUCKET.windowSec);
  if (!gate.ok) return json({ ok: false, error: "rate_limited" }, 429, { "Retry-After": String(gate.retryAfter) });
  try {
    const r = await syncSheetNow(scope);
    const push = syncResultOf(r);
    const pull = push.status === "not_configured" ? null : { status: r.ok ? "ok" : "error", updated: r.pulled, ...(r.ok || !r.message ? {} : { error: r.message }) };
    return json({ ok: push.status !== "error" && pull?.status !== "error", push, pull });
  } catch (err) {
    logError("api/app/sheets:sync", err);
    return json({ ok: false, error: "server" }, 500);
  }
}
