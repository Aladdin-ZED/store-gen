/**
 * GET /admin/orders/export?<same filters as the Orders screen> — streamed CSV of store #1's orders, or with `tab=leads`
 * its abandoned leads (UTF-8 BOM, Excel friendly, formula-injection safe). `orders.export` (owner, admin, manager)
 * through the store's seam (§K.1 T4); day ranges are the store's calendar days.
 */
import type { NextRequest } from "next/server";
import { legacyReadGuard } from "@/lib/admin-data/legacy-store";
import { parseOrderQuery, rangeBounds, toOrderFilters } from "@/lib/admin-data/orders";
import { auditIn } from "@/lib/admin-data/store-audit";
import { dayKey } from "@/lib/admin-data/time";
import { leadsCsv, ordersCsv } from "@/lib/orders";
import { apiHeaders } from "@/lib/orders/http";

export async function GET(req: NextRequest): Promise<Response> {
  const g = await legacyReadGuard(req, "orders.export");
  if (!g.ok) return g.response;
  const { scope, actor, store } = g.ctx;
  const params = Object.fromEntries(req.nextUrl.searchParams);
  const leads = params.tab === "leads";
  const query = parseOrderQuery(params);
  await auditIn(scope, actor, "orders.exported", {
    meta: { ...(leads ? { leads: true } : { status: query.status }), range: query.range, page: query.pageId, q: !!query.q },
  });

  const stream = leads
    ? leadsCsv(scope, { q: query.q || undefined, pageId: query.pageId ?? undefined, ...rangeBounds(query, store.timezone) })
    : ordersCsv(scope, toOrderFilters(query, store.timezone));
  const headers = apiHeaders({
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${leads ? "abandoned-leads" : "orders"}-${dayKey(new Date(), store.timezone)}.csv"`,
  });
  return new Response(stream, { status: 200, headers });
}
