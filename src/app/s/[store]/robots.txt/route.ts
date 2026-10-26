/**
 * GET/HEAD /s/<handle>/robots.txt — the store's robots file (docs/STORE-SAAS.md §C.8); on the store's subdomain the
 * proxy rewrites /robots.txt here. `Sitemap: <canonical origin>/sitemap.xml`; `Disallow: /` while the store is not
 * active or has no published page.
 */
import { connection, type NextRequest } from "next/server";
import { notFoundResponse } from "@/lib/render/serve.server";
import { handleLookupFailed, serveStoreRoute } from "@/lib/render/store-routes.server";
import { resolveStoreByHandle } from "@/lib/tenancy/public";

type Params = { params: Promise<{ store: string }> };

async function serve(req: NextRequest, ctx: Params): Promise<Response> {
  await connection();
  const { store } = await ctx.params;
  // the store of the URL first (lint L13); serveStoreRoute answers per host class, state and address
  const found = await resolveStoreByHandle(store, { detail: true }).catch(handleLookupFailed);
  return serveStoreRoute(req, store, { page: "robots" }, { found });
}

export function GET(req: NextRequest, ctx: Params): Promise<Response> {
  return serve(req, ctx);
}

export function HEAD(req: NextRequest, ctx: Params): Promise<Response> {
  return serve(req, ctx);
}

function unknownMethod(req: NextRequest): Response {
  return notFoundResponse(req);
}
export const OPTIONS = unknownMethod;
export const POST = unknownMethod;
export const PUT = unknownMethod;
export const PATCH = unknownMethod;
export const DELETE = unknownMethod;
