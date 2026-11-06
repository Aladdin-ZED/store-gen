/**
 * GET /api/app/<handle>/ai/runs/<id>?after=<seq> (P7 AI; ai.md AI-§A.7 poll transport): `{ events, done }` from the run
 * buffer (the events after `seq`), or the run row's end once the buffer expired; another store's run id answers the
 * same neutral 404 as a missing one. Permission ai.use (storeGuard). The body: src/lib/ai/http/handlers.ts.
 */
import type { NextRequest } from "next/server";
import { handleRunPoll } from "@/lib/ai/http/handlers";
import { storeGuard } from "@/lib/tenancy/seam";

type Params = { params: Promise<{ store: string; id: string }> };

/** reads only (core D56) */
export const maxDuration = 120;

export async function GET(req: NextRequest, { params }: Params): Promise<Response> {
  const p = await params;
  const g = await storeGuard(req, p.store, "ai.use");
  if (!g.ok) return g.response;
  return handleRunPoll(g.ctx, req, p.id);
}
