/**
 * POST /api/app/<handle>/ai/director/plan (P7 AI; ai.md AI-§A.7, AI-§A.8.2 stage 1, AI-§A.8.5): the Director's read and three
 * direction briefs (`design.plan`, 45 s), the first stage of a pass: it charges the Director pass counter. Body
 * `{ input: DirectorPlanInput, pass: { session, id }, nonce? }` → `200 { ok: true, value, runId, credits, flags, stage }`;
 * `410 { error: "pass_superseded" }` once a newer pass of the same wizard session started.
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
  return handleDirector(g.ctx, req, "plan");
}
