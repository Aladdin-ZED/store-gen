/**
 * GET/HEAD /robots.txt on the platform host (docs/STORE-SAAS.md §C.8, PUB-27): marketing allowed; the dashboard,
 * the console, previews and the APIs disallowed; `/s/` too once S mode is on; while S mode is off, a `Sitemap:` line
 * per live store after the platform's own. On a store subdomain the proxy rewrites /robots.txt to the store's file;
 * a legacy host answers 308 to the platform.
 */
import { connection, type NextRequest } from "next/server";
import { errorSummary } from "@/lib/orders/log";
import { notFoundResponse, unavailableResponse } from "@/lib/render/serve.server";
import { platformRobotsText, seoFileResponse } from "@/lib/render/store-routes.server";

async function serve(req: NextRequest): Promise<Response> {
  await connection();
  try {
    return seoFileResponse(req, await platformRobotsText(), "text/plain");
  } catch (err) {
    console.error("[robots] failed:", errorSummary(err));
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
