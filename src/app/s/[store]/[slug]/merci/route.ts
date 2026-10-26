/**
 * GET/HEAD /s/<handle>/<slug>/merci — the thank-you page of a published landing page (noindex, never stored by an
 * HTTP cache; the server keeps its brotli/gzip encoding per version). The order details are filled in the browser
 * from sessionStorage by the runtime. Old slugs 308 (LP-20) and `?sg-test=<token>` renders the test thank-you (D54)
 * like the page itself.
 */
import { after, connection, type NextRequest } from "next/server";
import { notFoundResponse } from "@/lib/render/serve.server";
import { serveStoreRoute } from "@/lib/render/store-routes.server";

type Params = { params: Promise<{ store: string; slug: string }> };

async function serve(req: NextRequest, ctx: Params): Promise<Response> {
  await connection();
  const { store, slug } = await ctx.params;
  return serveStoreRoute(req, store, { page: "thanks", slug }, { defer: (task) => after(task) });
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
