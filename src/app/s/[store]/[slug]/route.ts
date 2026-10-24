/**
 * GET/HEAD /s/<handle>/<slug> — a published landing page of the store (docs/STORE-SAAS.md §C.4.1): the stored HTML of
 * its published version with the version's hash CSP narrowed to the serving origin's public API, brotli/gzip
 * negotiated, an ETag per representation (304) and a short shared cache. An old slug of a still-published page 308s
 * to its current slug with the raw query (LP-20); `?sg-test=<token>` renders the test document (D54).
 */
import { after, connection, type NextRequest } from "next/server";
import { notFoundResponse } from "@/lib/render/serve.server";
import { serveStoreRoute } from "@/lib/render/store-routes.server";

type Params = { params: Promise<{ store: string; slug: string }> };

async function serve(req: NextRequest, ctx: Params): Promise<Response> {
  await connection();
  const { store, slug } = await ctx.params;
  return serveStoreRoute(req, store, { page: "landing", slug }, { defer: (task) => after(task) });
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
