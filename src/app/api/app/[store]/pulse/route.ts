/**
 * GET /api/app/<handle>/pulse[?since=<iso>]: the store's pulse (P2 SHELL; docs/STORE-SAAS.md §I.4, D46, D57, §F.6;
 * platform.md PLA-§22.6, §M.2; SF-06). `store.read` through the store's guard (a non-member gets the neutral 404),
 * bucket `s:<sid>:pulse:<userId>` 12 / min, then the frozen `StorePulse` with its `ETag`, or `304` when the poller's
 * `If-None-Match` names it. Every answer is `private, no-store`: the body is the viewer's own (unread, impersonation,
 * jobs). The sources are `./load.ts`; the 304 decision and the headers are `./compose.ts`'s (`test:pulse`).
 */
import type { NextRequest } from "next/server";
import { apiHeaders, json, logError } from "@/lib/orders/http";
import { platformBucket, rateLimit, storeBucket } from "@/lib/security/rate-limit";
import { storeGuard } from "@/lib/tenancy/seam";
import type { StoreCtx } from "@/lib/tenancy/types";
import { pulseAnswer, pulseHeaders } from "./compose";
import { storePulse } from "./load";

type Params = { params: Promise<{ store: string }> };

/** 15 s polling from one tab per browser and store is 4 a minute; 12 leaves room for a reload and a refocus or two. */
const PULSE_PER_MINUTE = 12;
const PRIVATE = { "Cache-Control": "private, no-store" } as const;

/**
 * The viewer's bucket: `s:<sid>:pulse:<userId>` (core §E.8). Staff viewing a store (read-only impersonation) count
 * on `p:pulse:<userId>` instead, so their view leaves no row of the store behind (the impersonation rule of
 * `test:tenancy`: the viewed store's rows are unchanged but for the audit of refused writes).
 */
function viewerBucket(ctx: StoreCtx, name: "pulse") {
  return ctx.impersonation || ctx.membership.synthetic ? platformBucket(name, ctx.user.id) : storeBucket(ctx.scope, name, ctx.user.id);
}

export async function GET(req: NextRequest, { params }: Params): Promise<Response> {
  const g = await storeGuard(req, (await params).store, "store.read");
  if (!g.ok) return g.response;
  const { ctx } = g;
  const gate = await rateLimit(viewerBucket(ctx, "pulse"), PULSE_PER_MINUTE, 60);
  if (!gate.ok) return json({ ok: false, error: "rate_limited" }, 429, { ...PRIVATE, "Retry-After": String(Math.max(1, gate.retryAfter)) });
  try {
    const built = await storePulse(ctx, { since: req.nextUrl.searchParams.get("since") });
    const answer = pulseAnswer(built, req.headers.get("if-none-match"));
    if (answer.status === 304) return new Response(null, { status: 304, headers: apiHeaders(pulseHeaders(answer.etag)) });
    return json(answer.body, 200, pulseHeaders(answer.etag));
  } catch (err) {
    // a frozen field could not be read: no pulse rather than a made-up one (the poller keeps its last body)
    logError("api/app/pulse", err);
    return json({ ok: false, error: "server" }, 503, { ...PRIVATE, "Retry-After": "15" });
  }
}
