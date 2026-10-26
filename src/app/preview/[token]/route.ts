/**
 * GET/HEAD /preview/<token> — a private preview link (docs/STORE-SAAS.md §E.2, D20, SEC-7): platform host only,
 * signed, store-bound and revocable (`preview_tokens`), renders the page's latest draft with an offline runtime,
 * `noindex`, `private, no-store`, no referrer. Minted by mintPreviewToken (src/lib/render/preview-token.ts).
 */
import { connection, type NextRequest } from "next/server";
import { notFoundResponse } from "@/lib/render/serve.server";
import { servePreview } from "@/lib/render/store-routes.server";

type Params = { params: Promise<{ token: string }> };

async function serve(req: NextRequest, ctx: Params): Promise<Response> {
  await connection();
  const { token } = await ctx.params;
  return servePreview(req, token);
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
