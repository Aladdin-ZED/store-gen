/**
 * GET /api/app/<handle>/search?q=<2-60 chars>: the store's ⌘K search (P2 SHELL; platform.md PLA-§22.13, §M.2, UX-02;
 * docs/STORE-SAAS.md §I.3). `store.read` through the store's guard (a non-member gets the neutral 404), bucket
 * `s:<sid>:search:<userId>` 60 / min, then `{ groups, slow }`: the hits of every provider of this store, already masked
 * by the providers and restricted by the viewer's role, grouped for the palette, with the providers that missed their
 * budget named in `slow`. `private, no-store`: the answer is the viewer's.
 */
import type { NextRequest } from "next/server";
import { searchStore, searchViewerOf } from "@/lib/admin-data/search";
import { json, logError } from "@/lib/orders/http";
import { platformBucket, rateLimit, storeBucket } from "@/lib/security/rate-limit";
import { storeGuard } from "@/lib/tenancy/seam";
import type { StoreCtx } from "@/lib/tenancy/types";
import { SearchQuery } from "./run";

type Params = { params: Promise<{ store: string }> };

const SEARCH_PER_MINUTE = 60;
const PRIVATE = { "Cache-Control": "private, no-store" } as const;

/**
 * The viewer's bucket: `s:<sid>:search:<userId>` (core §E.8). Staff viewing a store (read-only impersonation) count
 * on `p:search:<userId>` instead, so their view leaves no row of the store behind (the impersonation rule of
 * `test:tenancy`: the viewed store's rows are unchanged but for the audit of refused writes).
 */
function viewerBucket(ctx: StoreCtx, name: "search") {
  return ctx.impersonation || ctx.membership.synthetic ? platformBucket(name, ctx.user.id) : storeBucket(ctx.scope, name, ctx.user.id);
}

export async function GET(req: NextRequest, { params }: Params): Promise<Response> {
  const g = await storeGuard(req, (await params).store, "store.read");
  if (!g.ok) return g.response;
  const { ctx } = g;
  const q = SearchQuery.safeParse(req.nextUrl.searchParams.get("q") ?? "");
  if (!q.success) return json({ ok: false, error: "invalid" }, 400, PRIVATE);
  const gate = await rateLimit(viewerBucket(ctx, "search"), SEARCH_PER_MINUTE, 60);
  if (!gate.ok) return json({ ok: false, error: "rate_limited" }, 429, { ...PRIVATE, "Retry-After": String(Math.max(1, gate.retryAfter)) });
  try {
    const result = await searchStore(ctx.scope, q.data, await searchViewerOf(ctx));
    return json(result, 200, PRIVATE);
  } catch (err) {
    logError("api/app/search", err);
    return json({ ok: false, error: "server" }, 500, PRIVATE);
  }
}
