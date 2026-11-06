/**
 * GET /s/<handle>/go/<code> (and `/go/<code>` on the store's own host): a short link of the store (landing.md
 * LAN-§12.1, LP-12, LD14). 308 to the link's target inside the store with the query rule, `private, no-store`; a
 * paused link answers its 410 page; an unknown code or a target that no longer resolves the store's 404. The answers
 * per host class and state and the click count: src/lib/links/serve.server.ts.
 */
import { after, connection, type NextRequest } from "next/server";
import { serveGo } from "@/lib/links/serve.server";
import { notFoundResponse } from "@/lib/render/serve.server";
import { handleLookupFailed } from "@/lib/render/store-routes.server";
import { resolveStoreByHandle } from "@/lib/tenancy/public";

type Params = { params: Promise<{ store: string; code: string }> };

export async function GET(req: NextRequest, ctx: Params): Promise<Response> {
  await connection();
  const { store, code } = await ctx.params;
  // the store of the URL first (lint L13); serveGo answers per host class and state
  const found = await resolveStoreByHandle(store, { detail: true }).catch(handleLookupFailed);
  return serveGo(req, store, code, { found, defer: (task) => after(task) });
}

/*
 * Every other method answers exactly like an unknown URL (left to Next, OPTIONS would answer 204 and POST 405 with an
 * Allow list). HEAD included: the route is GET only (LAN-§12.1).
 */
function unknownMethod(req: NextRequest): Response {
  return notFoundResponse(req);
}
export const HEAD = unknownMethod;
export const OPTIONS = unknownMethod;
export const POST = unknownMethod;
export const PUT = unknownMethod;
export const PATCH = unknownMethod;
export const DELETE = unknownMethod;
