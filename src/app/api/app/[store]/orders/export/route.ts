/**
 * GET /api/app/<handle>/orders/export?<same filters as the Orders screen>: streamed CSV of the store's orders, or with
 * `tab=leads` its abandoned leads (UTF-8 BOM, Excel friendly, formula-injection safe). `orders.export` (owner, admin,
 * manager; sensitive: audited; a fresh step-up, 403 { error: "step_up" } without one, §B.7) through the store's guard
 * (docs/STORE-SAAS.md §I.1); day ranges are the store's calendar days. The Orders screen fetches it (the step-up
 * sheet opens on that answer) and saves the file.
 */
import type { NextRequest } from "next/server";
import { parseOrderQuery, rangeBounds, toOrderFilters } from "@/lib/admin-data/orders";
import { auditIn } from "@/lib/admin-data/store-audit";
import { dayKey } from "@/lib/admin-data/time";
import { leadsCsv, ordersCsv } from "@/lib/orders";
import { apiHeaders } from "@/lib/orders/http";
import { assertOwned } from "@/lib/tenancy/owned";
import { requireStepUp, storeGuard } from "@/lib/tenancy/seam";

type Params = { params: Promise<{ store: string }> };

export async function GET(req: NextRequest, route: Params): Promise<Response> {
  const g = await storeGuard(req, (await route.params).store, "orders.export");
  if (!g.ok) return g.response;
  const { scope, actor, store } = g.ctx;
  // orders.export is a §B.7 step-up key: storeGuard asked for a fresh one; the row names its method (§F.5 rev 4)
  const stepUp = requireStepUp(g.ctx);
  const params = Object.fromEntries(req.nextUrl.searchParams);
  const leads = params.tab === "leads";
  const query = parseOrderQuery(params);
  // the page filter is recorded only when it names one of the store's pages (another store's id is nobody's here)
  const page = query.pageId ? await assertOwned(scope, "page", [query.pageId]).then(() => query.pageId, () => null) : null;
  await auditIn(scope, actor, "orders.exported", {
    meta: { ...(leads ? { leads: true } : { status: query.status }), range: query.range, page, q: !!query.q, stepUp },
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
