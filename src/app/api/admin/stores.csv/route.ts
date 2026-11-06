/**
 * GET /api/admin/stores.csv?<the stores list's filters> (platform.md PLA-§6.1, §M.2): the filtered stores list as
 * CSV, ≤ 10,000 rows, no e-mail and no phone, audited `platform.stores.exported`. `console.read` + admin rank (an
 * analyst or support member gets the neutral 404); `private, no-store`, `Content-Disposition: attachment`.
 */
import type { NextRequest } from "next/server";
import { AuthRefusal } from "@/lib/auth/errors";
import { apiHeaders, json } from "@/lib/orders/http";
import { platformGuard } from "@/lib/platform/seam";
import { parseStoresFilter, storesCsv } from "@/lib/platform/stores-list";

const PRIVATE = { "Cache-Control": "private, no-store" };

export async function GET(req: NextRequest): Promise<Response> {
  const g = await platformGuard(req, "console.read");
  if (!g.ok) return g.response;
  const params: Record<string, unknown> = {};
  for (const key of new Set(req.nextUrl.searchParams.keys())) {
    const all = req.nextUrl.searchParams.getAll(key);
    params[key] = all.length > 1 ? all : all[0];
  }
  try {
    const { csv } = await storesCsv(g.ctx, parseStoresFilter(params));
    const day = new Date().toISOString().slice(0, 10);
    return new Response(`﻿${csv}`, {
      status: 200,
      headers: apiHeaders({ ...PRIVATE, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="stores-${day}.csv"` }),
    });
  } catch (err) {
    if (err instanceof AuthRefusal && err.code === "forbidden") return json({ ok: false, error: "not_found" }, 404, PRIVATE);
    throw err;
  }
}
