/**
 * GET/HEAD /s/<handle> — the store home (docs/STORE-SAAS.md §A.2, §C.4.1): the published page `stores.home_page_id`
 * points at, else the store's "no page yet" document. On a store subdomain the proxy rewrites `/` here (never with a
 * trailing slash, ENGC-15). The answers per host class, state and canonical address: src/lib/render/store-routes.server.ts.
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
  return serveStoreRoute(req, store, { page: "home" }, { found });
}

export function GET(req: NextRequest, ctx: Params): Promise<Response> {
  return serve(req, ctx);
}

export function HEAD(req: NextRequest, ctx: Params): Promise<Response> {
  return serve(req, ctx);
}

/*
 * Every other method answers exactly like an unknown URL (left to Next, OPTIONS would answer 204 and
 * POST 405 with an Allow list, which told a page address apart from a hidden admin path).
 */
function unknownMethod(req: NextRequest): Response {
  return notFoundResponse(req);
}
export const OPTIONS = unknownMethod;
export const POST = unknownMethod;
export const PUT = unknownMethod;
export const PATCH = unknownMethod;
export const DELETE = unknownMethod;
