/**
 * POST /api/app/<handle>/ops/presence: Online / Break / Offline, and the heartbeat (OD33, OD60, OPE-§5.5, §13.2a;
 * operations.md §M.2). `agents.self` through the store's guard; body `{ presence }` or `{ heartbeat: true }`. The
 * heartbeat runs every 60 s while the console tab is visible: `last_seen_at` and the lease of the order the agent holds,
 * at most one write per 60 s per agent (`touchAgent`). Break and Offline release the held claim. No Idempotency-Key: a
 * presence write sets a value, so a repeat changes nothing. p75 ≤ 100 ms, ≤ 0.3 KB.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { answer, bodyOf, failure, statusOf } from "@/lib/callcenter/hotpath";
import { setPresence, touchAgent } from "@/lib/callcenter/presence";
import { storeGuard } from "@/lib/tenancy/seam";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ store: string }> };

const Body = z.union([z.strictObject({ presence: z.enum(["online", "break", "offline"]) }), z.strictObject({ heartbeat: z.literal(true) })]);

export async function POST(req: NextRequest, { params }: Params): Promise<Response> {
  const g = await storeGuard(req, (await params).store, "agents.self");
  if (!g.ok) return g.response;
  const body = await bodyOf(req, Body);
  if (!body.ok) return body.response;
  try {
    if ("heartbeat" in body.value) {
      await touchAgent(g.ctx.scope, g.ctx.user.id);
      return answer({ ok: true });
    }
    const r = await setPresence(g.ctx, body.value.presence);
    return r.ok ? answer({ ok: true }) : answer({ ok: false, error: r.error }, statusOf(r.error));
  } catch (err) {
    return failure(err, "ops:presence");
  }
}
