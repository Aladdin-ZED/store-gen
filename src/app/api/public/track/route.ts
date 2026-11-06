/**
 * POST /api/public/track: the order tracking API (landing.md LAN-§9.3; the logic is src/lib/tracking/api.server.ts).
 * The store comes from the order id and must own the request's effective host; every refusal of an order answers the
 * same 404 `not_found`, at least 150 ms after the request. Same-origin only (the `track` chunk posts with
 * `referrerPolicy: "same-origin"`, so the Origin survives the document's `no-referrer`): no CORS, no OPTIONS.
 */
import type { NextRequest } from "next/server";
import { handleTrackApi } from "@/lib/tracking/api.server";

export function POST(req: NextRequest): Promise<Response> {
  return handleTrackApi(req);
}
