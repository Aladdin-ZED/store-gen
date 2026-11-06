/**
 * POST /api/app/<handle>/ai/director/critique (P7 AI; ai.md AI-§A.7, AI-§A.8.2 stage 4, AI-§A.8.6): the critique of the
 * candidates (`design.critique`, 90 s). Below 80 tok/s on the interactive Director (probe line 11) it becomes the first
 * stage of a job: `202 { jobId }`, polled on `jobs/[id]`. Body `{ input: CritiqueInput, pass: { session, id }, nonce? }`;
 * `410 { error: "pass_superseded" }` once a newer pass of the same wizard session started.
 * Permission ai.use (same-origin first, storeGuard). The body: src/lib/ai/http/handlers.ts.
 */
import type { NextRequest } from "next/server";
import { handleDirector } from "@/lib/ai/http/handlers";
import { storeGuard } from "@/lib/tenancy/seam";

type Params = { params: Promise<{ store: string }> };

/** may start a job (the critique-as-job), whose after() driver lives at most this long (core D56) */
export const maxDuration = 360;

export async function POST(req: NextRequest, { params }: Params): Promise<Response> {
  const g = await storeGuard(req, (await params).store, "ai.use");
  if (!g.ok) return g.response;
  return handleDirector(g.ctx, req, "critique");
}
