/**
 * GET /s/<handle>/track (and `/track` on the store's own host): order tracking (landing.md LAN-§9.1, LP-05). The
 * lookup form, or with `?o=&s=` the order's status rendered on the server; `noindex`, `private, no-store`,
 * `no-referrer` (the URL may carry a bearer link). The answers per host class, state and canonical address and the
 * document: src/lib/tracking/serve.server.ts.
 */
import { connection, type NextRequest } from "next/server";
import { notFoundResponse } from "@/lib/render/serve.server";
import { handleLookupFailed } from "@/lib/render/store-routes.server";
import { resolveStoreByHandle } from "@/lib/tenancy/public";
import { serveTrack } from "@/lib/tracking/serve.server";
import { releaseOn } from "@/lib/auth/permissions";
// core §K.4 (STO-R36): the store chrome through this one import (S1's file, R2); R1 documents keep their bytes
import { wrapInStoreChrome } from "@/lib/storefront/chrome.server";

type Params = { params: Promise<{ store: string }> };

async function serve(req: NextRequest, ctx: Params): Promise<Response> {
  await connection();
  const { store } = await ctx.params;
  // the store of the URL first (lint L13); serveTrack answers per host class, state and address
  const found = await resolveStoreByHandle(store, { detail: true }).catch(handleLookupFailed);
  return serveTrack(req, store, { found, ...(releaseOn("R2") ? { chrome: wrapInStoreChrome } : {}) });
}

export function GET(req: NextRequest, ctx: Params): Promise<Response> {
  return serve(req, ctx);
}

/*
 * Every other method answers exactly like an unknown URL (left to Next, OPTIONS would answer 204 and
 * POST 405 with an Allow list, which told a page address apart from a hidden admin path). HEAD included:
 * the page is GET only (LAN-§9.1).
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
