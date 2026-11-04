/**
 * POST /api/app/<handle>/ai/report[?buffered=1] (P7 AI; ai.md AI-§A.7): the browser's local-run telemetry, metadata only
 * (`{ task, model, promptVersion, ms, status, rejected, … }` or `{ reports: […] }`, ≤ 20) → `ai_runs` rows with
 * `provider = local`, 0 credits; `204`. Bucket `s:<sid>:ai:report:<userId>` 120 / h. `buffered=1` (three streamed runs
 * in a row arrived in one piece) switches the platform to the poll transport, audited with the system as the actor.
 * Permission ai.use (same-origin first, storeGuard). The body: src/lib/ai/http/handlers.ts.
 */
import type { NextRequest } from "next/server";
import { handleReport } from "@/lib/ai/http/handlers";
import { storeGuard } from "@/lib/tenancy/seam";

type Params = { params: Promise<{ store: string }> };

/** a few row writes (core D56) */
export const maxDuration = 120;

export async function POST(req: NextRequest, { params }: Params): Promise<Response> {
  const g = await storeGuard(req, (await params).store, "ai.use");
  if (!g.ok) return g.response;
  return handleReport(g.ctx, req);
}
