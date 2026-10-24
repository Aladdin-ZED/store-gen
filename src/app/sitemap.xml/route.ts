/**
 * GET/HEAD /sitemap.xml on the platform host (docs/STORE-SAAS.md §C.8): the marketing pages only (the home and the
 * platform documents that have a published version). Stores have their own sitemaps (/s/<h>/sitemap.xml, listed
 * in robots.txt).
 */
import { connection, type NextRequest } from "next/server";
import { errorSummary } from "@/lib/orders/log";
import { PLATFORM_DOC_PATHS, publishedPlatformKinds } from "@/lib/render/platform-docs.server";
import { notFoundResponse, unavailableResponse } from "@/lib/render/serve.server";
import { seoFileResponse, sitemapXml } from "@/lib/render/store-routes.server";
import { platformOrigin } from "@/lib/urls";

async function serve(req: NextRequest): Promise<Response> {
  await connection();
  try {
    const origin = platformOrigin();
    const kinds = await publishedPlatformKinds();
    const entries = [{ loc: `${origin}/` }, ...kinds.map((k) => ({ loc: `${origin}${PLATFORM_DOC_PATHS[k]}` }))];
    return seoFileResponse(req, sitemapXml(entries), "application/xml");
  } catch (err) {
    console.error("[sitemap] failed:", errorSummary(err));
    return unavailableResponse(req);
  }
}

export function GET(req: NextRequest): Promise<Response> {
  return serve(req);
}

export function HEAD(req: NextRequest): Promise<Response> {
  return serve(req);
}

function unknownMethod(req: NextRequest): Response {
  return notFoundResponse(req);
}
export const OPTIONS = unknownMethod;
export const POST = unknownMethod;
export const PUT = unknownMethod;
export const PATCH = unknownMethod;
export const DELETE = unknownMethod;
