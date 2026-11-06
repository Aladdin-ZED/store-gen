/**
 * GET /api/app/<handle>/ai/jobs/<id>?advance=1 (P7 AI; ai.md AI-§A.7, AI-§B.13 step 3b; docs/STORE-SAAS.md §H.12 rule 4):
 * the store's own job (`{ ok, id, kind, status, stage, progress, heartbeatAt, driver, result, outputs, error,
 * costCredits, createdAt }`; another store's id answers the neutral 404). With `advance=1` (the default) from a same-origin browser
 * fetch (`Sec-Fetch-Site: same-origin`) the poll claims the next stage when no live lease exists and runs it inside
 * this request (≤ 90 s), answering the status it reached; `advance=0`, or any other fetch, reads only, so a cross-site
 * link or image can never make a stage run. Permission ai.use (storeGuard). The body: src/lib/ai/http/handlers.ts.
 */
import type { NextRequest } from "next/server";
import { handleJobPoll } from "@/lib/ai/http/handlers";
import { storeGuard } from "@/lib/tenancy/seam";

type Params = { params: Promise<{ store: string; id: string }> };

/** a poll advances the job by one stage (core D56: the job-driving handlers export 360) */
export const maxDuration = 360;

export async function GET(req: NextRequest, { params }: Params): Promise<Response> {
  const p = await params;
  const g = await storeGuard(req, p.store, "ai.use");
  if (!g.ok) return g.response;
  return handleJobPoll(g.ctx, req, p.id);
}
