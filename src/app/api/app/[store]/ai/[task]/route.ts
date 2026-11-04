/**
 * POST /api/app/<handle>/ai/<task> (P7 AI; ai.md AI-§A.7, AI-§B.13; docs/STORE-SAAS.md §H.12, D56). Body
 * `{ input, surface, nonce?, stream? }`. A pattern-A task answers JSON (`200 { ok: true, value, … }`) or, for a stream
 * task, NDJSON (`200 application/x-ndjson`) or `202 { runId }` on the poll transport; a pattern-B task answers
 * `202 { jobId }` once its `ai_jobs` row and reservation exist. A hidden or unknown task: the neutral 404.
 * Permission ai.use (state-changing: same-origin first, storeGuard). The body: src/lib/ai/http/handlers.ts.
 */
import type { NextRequest } from "next/server";
import { handleTask } from "@/lib/ai/http/handlers";
import { storeGuard } from "@/lib/tenancy/seam";

type Params = { params: Promise<{ store: string; task: string }> };

/** may start a pattern-B job, whose after() driver lives at most this long (core D56, AI-§A.7) */
export const maxDuration = 360;

export async function POST(req: NextRequest, { params }: Params): Promise<Response> {
  const p = await params;
  const g = await storeGuard(req, p.store, "ai.use");
  if (!g.ok) return g.response;
  return handleTask(g.ctx, req, p.task);
}
