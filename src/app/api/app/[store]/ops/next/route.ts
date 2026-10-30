/**
 * POST /api/app/<handle>/ops/next: the queue's "Next order" (OD36, OPE-§5.2, §13.2; operations.md §M.2). `agents.self`
 * through the store's guard; `Idempotency-Key` required (a double tap or a retried request answers the first card,
 * `replayed: true`); body `{}`; `s:<sid>:claim:<uid>` 120 / min (429). The answer is the `NextResult`: the card, or why
 * there is none (`outside_window` with `opensAt`, `empty` with `nextDueAt`, `on_break`, `offline`, `cap_reached`).
 * A route handler, not a server action: no RSC tree, a bounded JSON card (≤ 6 KB gz), p75 ≤ 300 ms.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { answer, bodyOf, failure, idemOf } from "@/lib/callcenter/hotpath";
import { nextOrder } from "@/lib/orders/queue";
import { storeGuard } from "@/lib/tenancy/seam";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ store: string }> };

const Body = z.strictObject({});

export async function POST(req: NextRequest, { params }: Params): Promise<Response> {
  const g = await storeGuard(req, (await params).store, "agents.self");
  if (!g.ok) return g.response;
  const key = idemOf(req);
  if (!key.ok) return key.response;
  const body = await bodyOf(req, Body);
  if (!body.ok) return body.response;
  try {
    return answer(await nextOrder(g.ctx, { idem: key.idem }));
  } catch (err) {
    return failure(err, "ops:next");
  }
}
