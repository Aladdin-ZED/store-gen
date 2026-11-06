/**
 * GET /api/app/<handle>/leads/export?<the inbox filters>[&ids=<id,id,…>]: the lead inbox as CSV (P3 LANDING; landing.md
 * LAN-§10.3 "Bulk", §10.5). `orders.export` (sensitive: audited `leads.exported`, a fresh step-up, refused to "View as
 * store") through the store's guard; the rows are the read repository's (an agent exports what they see, phones
 * masked, names and notes masked under impersonation). `ids` narrows the file to a bulk selection.
 */
import type { NextRequest } from "next/server";
import { auditIn } from "@/lib/admin-data/store-audit";
import { dayKey } from "@/lib/admin-data/time";
import { leadCsv } from "@/lib/leads/csv";
import { exportLeadRows } from "@/lib/leads/read";
import { LeadQuery } from "@/lib/leads/types";
import { apiHeaders } from "@/lib/orders/http";
import { requireStepUp, storeGuard } from "@/lib/tenancy/seam";

type Params = { params: Promise<{ store: string }> };

export async function GET(req: NextRequest, route: Params): Promise<Response> {
  const g = await storeGuard(req, (await route.params).store, "orders.export");
  if (!g.ok) return g.response;
  const { scope, actor, store, user, membership } = g.ctx;
  const stepUp = requireStepUp(g.ctx);
  const sp = req.nextUrl.searchParams;
  const query = LeadQuery.parse({
    view: sp.get("view") ?? undefined,
    pageId: sp.get("page") ?? undefined,
    city: sp.get("city") ?? undefined,
    assignee: sp.get("assignee") ?? undefined,
    kind: sp.get("kind") ?? undefined,
    from: sp.get("from") ?? undefined,
    to: sp.get("to") ?? undefined,
  });
  const ids = sp.get("ids") ? (sp.get("ids") ?? "").split(",").slice(0, 500) : null;
  const rows = await exportLeadRows(scope, query, { userId: user.id, role: membership.role }, ids);
  await auditIn(scope, actor, "leads.exported", { meta: { view: query.view, page: query.pageId ?? null, kind: query.kind ?? null, rows: rows.length, selection: !!ids, stepUp } });
  const headers = apiHeaders({
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="leads-${dayKey(new Date(), store.timezone)}.csv"`,
  });
  return new Response(leadCsv(rows), { status: 200, headers });
}
