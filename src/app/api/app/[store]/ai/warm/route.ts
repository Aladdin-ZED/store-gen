/**
 * POST /api/app/<handle>/ai/warm (P7 AI; ai.md AI-§A.7, AI-D36): withdrawn in R1, `410 Gone` (`max_tokens: 0` is
 * rejected with `output_config.format`; the platform prefix keeps its 1-hour breakpoint instead). The path stays
 * reserved for the `max_tokens: 1` warm that probe line 9 measures. Permission ai.use (same-origin first, storeGuard).
 */
import type { NextRequest } from "next/server";
import { gone } from "@/lib/ai/http/respond";
import { storeGuard } from "@/lib/tenancy/seam";

type Params = { params: Promise<{ store: string }> };

/** answers at once (core D56) */
export const maxDuration = 120;

export async function POST(req: NextRequest, { params }: Params): Promise<Response> {
  const g = await storeGuard(req, (await params).store, "ai.use");
  if (!g.ok) return g.response;
  return gone("gone");
}
