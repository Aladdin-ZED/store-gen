/**
 * GET /api/admin/audit.csv?storeId=&actorKind=&area= (platform.md PLA-§14.3, §M.2): the platform audit log as CSV,
 * ≤ 50,000 rows newest first, redacted meta only, audited `platform.audit.exported`. `audit.platform` (super_admin);
 * `private, no-store`, `Content-Disposition: attachment`.
 */
import type { NextRequest } from "next/server";
import { AuthRefusal } from "@/lib/auth/errors";
import { apiHeaders, json } from "@/lib/orders/http";
import { auditCsv, parseAuditFilter } from "@/lib/platform/audit-log";
import { platformGuard } from "@/lib/platform/seam";

const PRIVATE = { "Cache-Control": "private, no-store" };

export async function GET(req: NextRequest): Promise<Response> {
  const g = await platformGuard(req, "audit.platform");
  if (!g.ok) return g.response;
  try {
    const { csv } = await auditCsv(g.ctx, parseAuditFilter(req.nextUrl.searchParams));
    const day = new Date().toISOString().slice(0, 10);
    return new Response(`﻿${csv}`, {
      status: 200,
      headers: apiHeaders({ ...PRIVATE, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="audit-${day}.csv"` }),
    });
  } catch (err) {
    if (err instanceof AuthRefusal && err.code === "forbidden") return json({ ok: false, error: "not_found" }, 404, PRIVATE);
    throw err;
  }
}
