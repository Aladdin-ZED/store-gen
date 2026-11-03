/**
 * GET /api/app/<handle>/orders/carrier-csv?ids=A,B,…[&partial=1]: the Carrier CSV (P4 CALL CENTER; operations.md
 * OPE-§12.8, §M.2, §L; OD49, OD55, OD64). `shipments.write` through the store's guard, then a fresh step-up from the
 * seam (`stepUpGuard`: core §B.7 lists the route although shipments.write is not a step-up key; full phones), refused
 * under impersonation; `ops.carrierCsv` must exist (409 `not_configured`); ≤ 200 ids (400 `invalid`). Held orders and
 * ids that are not the store's are refused with their ids (409 `refused`, nothing written) unless `partial=1`, which
 * exports the rest and names the refused ids in `X-Sg-Refused`. Per exported order `manifest_exported`; with
 * "Mark exported orders as packed" the move to_pack → packed; one `audit("orders.carrier_exported", { count })`.
 */
import type { NextRequest } from "next/server";
import { auditIn } from "@/lib/admin-data/store-audit";
import { dayKey } from "@/lib/admin-data/time";
import { carrierExport, idsParam } from "@/lib/orders/admin";
import { apiHeaders, json } from "@/lib/orders/http";
import { stepUpGuard, storeGuard } from "@/lib/tenancy/seam";

type Params = { params: Promise<{ store: string }> };

export async function GET(req: NextRequest, route: Params): Promise<Response> {
  const g = await storeGuard(req, (await route.params).store, "shipments.write");
  if (!g.ok) return g.response;
  const su = stepUpGuard(g.ctx);
  if (!su.ok) return su.response;
  const { scope, actor, store } = g.ctx;
  const ids = idsParam(req.nextUrl.searchParams.get("ids"));
  if (!ids) return json({ error: "invalid" }, 400);
  const res = await carrierExport(g.ctx, ids, { partial: req.nextUrl.searchParams.get("partial") === "1" });
  if (!res.ok) {
    const status = res.error === "invalid" ? 400 : 409;
    return json({ error: res.error, held: res.held ?? [], notFound: res.notFound ?? [], exportable: res.exportable ?? 0 }, status);
  }
  await auditIn(scope, actor, "orders.carrier_exported", { meta: { count: res.exported.length, packed: res.packed.length, stepUp: su.stepUp } });
  const refused = [...res.refused.held, ...res.refused.notFound];
  const headers = apiHeaders({
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="carrier-${dayKey(new Date(), store.timezone)}.csv"`,
    ...(refused.length ? { "X-Sg-Refused": refused.join(",") } : {}),
  });
  return new Response(res.csv, { status: 200, headers });
}
