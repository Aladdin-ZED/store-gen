/**
 * /app/<handle>/pages/new → the store's generator: new pages are always born there. A route handler, not a page,
 * so the answer is one 307; /app/<handle>/generate checks the member.
 */
import type { NextRequest } from "next/server";
import { storeAliasRedirect } from "@/lib/admin-data/shell";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ store: string }> };

export async function GET(_req: NextRequest, { params }: Params): Promise<Response> {
  return storeAliasRedirect((await params).store, "/generate");
}
