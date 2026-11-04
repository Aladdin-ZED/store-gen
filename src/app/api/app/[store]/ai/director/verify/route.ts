/**
 * POST /api/app/<handle>/ai/director/verify (P7 AI; ai.md AI-§A.7, AI-§A.8.2 round 2): `design.verify` (60 s) is R2, so
 * in R1 every call answers the neutral 404 of a hidden task (`flag_off`).
 * Permission ai.use (same-origin first, storeGuard). The body: src/lib/ai/http/handlers.ts.
 */
import type { NextRequest } from "next/server";
import { handleDirector } from "@/lib/ai/http/handlers";
import { storeGuard } from "@/lib/tenancy/seam";

type Params = { params: Promise<{ store: string }> };

/** pattern A only (core D56): the stage deadline is far below it */
export const maxDuration = 120;

export async function POST(req: NextRequest, { params }: Params): Promise<Response> {
  const g = await storeGuard(req, (await params).store, "ai.use");
  if (!g.ok) return g.response;
  return handleDirector(g.ctx, req, "verify");
}
