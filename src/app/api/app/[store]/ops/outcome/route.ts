/**
 * POST /api/app/<handle>/ops/outcome: what the call gave (OD36, OPE-§6.1, §6.1a, §13.2 step 4; operations.md §M.2).
 * `orders.write` through the store's guard; `Idempotency-Key` required (the outbox of OD37 retries with the same key
 * for 30 s, and a replay answers the stored first result); body `OutcomeInput` without `idem` (the header is the key),
 * ≤ 2 KB. With `andNext: true` (the queue's default) the next card comes back in the same answer.
 *
 * Statuses: 200 with the writer's result; 409 `conflict` with the fresh state, the fresh card (null when the order is no
 * longer the agent's) and `updatedBy`; 404 `not_found` (another store's id answers the same); 422 for the state
 * machine's refusals (`illegal`, `reason_required`, `bad_due`, `bad_hold`, `bad_duplicate`, …); 400 `invalid`.
 */
import type { NextRequest } from "next/server";
import { answer, bodyOf, failure, idemOf, statusOf } from "@/lib/callcenter/hotpath";
import { OutcomeInput, recordOutcome } from "@/lib/callcenter/outcomes";
import { storeGuard } from "@/lib/tenancy/seam";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ store: string }> };

const Body = OutcomeInput.omit({ idem: true });

export async function POST(req: NextRequest, { params }: Params): Promise<Response> {
  const g = await storeGuard(req, (await params).store, "orders.write");
  if (!g.ok) return g.response;
  const key = idemOf(req);
  if (!key.ok) return key.response;
  const body = await bodyOf(req, Body);
  if (!body.ok) return body.response;
  try {
    const r = await recordOutcome(g.ctx, { ...body.value, idem: key.idem });
    if (!r.ok) return answer({ ok: false, error: r.error }, statusOf(r.error));
    return answer(r.data, r.data.ok ? 200 : statusOf(r.data.error));
  } catch (err) {
    return failure(err, "ops:outcome");
  }
}
