/**
 * /app/<handle>/settings → the first settings tab, Store & legal (its page checks `settings.read`; members without
 * it get the neutral 404 there, and their own account lives at /app/account). A route handler, not a page, so the
 * answer is one 307.
 */
import type { NextRequest } from "next/server";
import { storeAliasRedirect } from "@/lib/admin-data/shell";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ store: string }> };

export async function GET(_req: NextRequest, { params }: Params): Promise<Response> {
  return storeAliasRedirect((await params).store, "/settings/general");
}
