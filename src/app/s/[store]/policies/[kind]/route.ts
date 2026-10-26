/**
 * GET/HEAD /s/<handle>/policies/<privacy|terms|shipping|contact>?p=<slug> — a legal page of the store
 * (docs/STORE-SAAS.md §C.4.1, PUB-03) dressed in the theme and language of the store's published page <slug> (else
 * its home page), built from the store's current facts. Static HTML (no script), hash CSP, brotli/gzip, ETag + 304,
 * short shared cache, noindex. `?p=` never reaches another store's pages.
 */
import { connection, type NextRequest } from "next/server";
import { notFoundResponse } from "@/lib/render/serve.server";
import { handleLookupFailed, serveStoreRoute } from "@/lib/render/store-routes.server";
import { resolveStoreByHandle } from "@/lib/tenancy/public";

type Params = { params: Promise<{ store: string; kind: string }> };

async function serve(req: NextRequest, ctx: Params): Promise<Response> {
  await connection();
  const { store, kind } = await ctx.params;
  // the store of the URL first (lint L13); serveStoreRoute answers per host class, state and address
  const found = await resolveStoreByHandle(store, { detail: true }).catch(handleLookupFailed);
  return serveStoreRoute(req, store, { page: "policy", kind }, { found });
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
