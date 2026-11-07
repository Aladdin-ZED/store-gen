/**
 * POST /api/public/wa: "Order on WhatsApp" (landing.md LAN-§11.4, LP-11; the logic is src/lib/wa-order/create.server.ts).
 * The page key resolves the store, which must take orders and own the request's effective host; the body's choice is
 * priced on the server (never a price from the request) and stored as a WhatsApp intent; the answer is the reference,
 * the number and the message. Same-origin only (the `assist` chunk posts from the live page): no CORS, no OPTIONS.
 */
import type { NextRequest } from "next/server";
import { handleWaApi } from "@/lib/wa-order/create.server";

export function POST(req: NextRequest): Promise<Response> {
  return handleWaApi(req);
}
