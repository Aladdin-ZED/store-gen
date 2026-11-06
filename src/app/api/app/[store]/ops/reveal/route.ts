/**
 * POST /api/app/<handle>/ops/reveal: the customer's number for Call, WhatsApp or Show number (OD36, OPE-§8.2, §22.1;
 * operations.md §M.2). `orders.reveal_phone` (sensitive: refused to impersonation) through the store's guard;
 * `Idempotency-Key` required (a replay answers the same `tel` / `wa` with no second `phone_revealed`); body
 * `{ orderId, why, templateId? }`; `s:<sid>:reveal:<uid>` 300 / h (429). p75 ≤ 200 ms, ≤ 1 KB.
 *
 * The answer `{ ok: true, e164, national, tel, wa }` is the only place a tenant member reads a full number: the
 * console keeps it in the open card's component state, opens `tel:` / `wa.me` and never puts it in an app URL or in
 * web storage (core §F.10). `Cache-Control: no-store`. An order the member may not reveal answers 404 like another
 * store's id.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { answer, bodyOf, failure, idemOf, statusOf } from "@/lib/callcenter/hotpath";
import { revealPhone } from "@/lib/callcenter/reveal";
import { storeGuard } from "@/lib/tenancy/seam";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ store: string }> };

const Body = z.strictObject({
  orderId: z.string().max(20),
  why: z.enum(["call", "whatsapp", "view"]),
  templateId: z.string().max(40).optional(),
});

export async function POST(req: NextRequest, { params }: Params): Promise<Response> {
  const g = await storeGuard(req, (await params).store, "orders.reveal_phone");
  if (!g.ok) return g.response;
  const key = idemOf(req);
  if (!key.ok) return key.response;
  const body = await bodyOf(req, Body);
  if (!body.ok) return body.response;
  try {
    const r = await revealPhone(g.ctx, body.value.orderId, body.value.why, { templateId: body.value.templateId, idem: key.idem });
    return r.ok ? answer({ ok: true, ...r.data }) : answer({ ok: false, error: r.error }, statusOf(r.error));
  } catch (err) {
    return failure(err, "ops:reveal");
  }
}
