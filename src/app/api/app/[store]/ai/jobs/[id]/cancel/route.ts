/**
 * POST /api/app/<handle>/ai/jobs/<id>/cancel (P7 AI; ai.md AI-§A.7): `204`. The store's job (its creator, or a member
 * with ai.manage) becomes `cancelled`, the stage running in this process is aborted and the reservation reconciled at
 * the usage known so far; any other id (missing, finished, another store's) is left as it is, with the same `204`.
 * Permission ai.use (same-origin first, storeGuard). The body: src/lib/ai/http/handlers.ts.
 */
import type { NextRequest } from "next/server";
import { handleJobCancel } from "@/lib/ai/http/handlers";
import { storeGuard } from "@/lib/tenancy/seam";

type Params = { params: Promise<{ store: string; id: string }> };

/** a write of one row (core D56) */
export const maxDuration = 120;

export async function POST(req: NextRequest, { params }: Params): Promise<Response> {
  const p = await params;
  const g = await storeGuard(req, p.store, "ai.use");
  if (!g.ok) return g.response;
  return handleJobCancel(g.ctx, p.id);
}
