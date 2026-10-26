/**
 * /<anything> at the root: the neutral 404 for every method (docs/STORE-SAAS.md §C.4, PUB-02). Store pages live under
 * /s/<handle>/… (src/app/s/[store]/**); there is no root landing page any more (no legacy data, C3). The route stays
 * as the target of the `/:path+ → /-` fallback rewrite (next.config.ts), so every path no route matches answers
 * exactly like an un-gated /admin URL (the 404-uniformity rule, §F.6).
 */
import type { NextRequest } from "next/server";
import { notFoundResponse } from "@/lib/render/serve.server";

function unknown(req: NextRequest): Response {
  return notFoundResponse(req);
}

export const GET = unknown;
export const HEAD = unknown;
export const OPTIONS = unknown;
export const POST = unknown;
export const PUT = unknown;
export const PATCH = unknown;
export const DELETE = unknown;
