/**
 * /app/<handle>/queue → the store's orders. Where a call agent lands after sign-in (§B.4, OPE Q.13c,
 * `landingPathFor`) until R1's agent console (OP-03) puts the queue page here; the orders page checks
 * `orders.read` itself. A route handler, not a page, so the answer is one 307.
 */
import type { NextRequest } from "next/server";
import { storeAliasRedirect } from "@/lib/admin-data/shell";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ store: string }> };

export async function GET(_req: NextRequest, { params }: Params): Promise<Response> {
  return storeAliasRedirect((await params).store, "/orders");
}
