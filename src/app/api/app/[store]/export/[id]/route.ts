/**
 * DELETE /api/app/<handle>/export/<exportId> — revoke one of the store's exports: from now on the public API refuses
 * orders, leads, upsells and analytics carrying its key (connected mode). The row is kept for the history.
 * Another store's export id answers like a missing one (EXP-04).
 * → { ok: true, export: ExportRecordJson }
 */
import type { NextRequest } from "next/server";
import { ULID_RE } from "@/lib/export/options";
import { revokeExport } from "@/lib/export/server";
import type { ExportErrorResponse } from "@/lib/export/types";
import { json } from "@/lib/orders/http";
import { storeGuard } from "@/lib/tenancy/seam";
import { exportErrorResponse } from "../errors";

type Params = { params: Promise<{ store: string; id: string }> };

export async function DELETE(req: NextRequest, ctx: Params): Promise<Response> {
  const { store, id } = await ctx.params;
  const g = await storeGuard(req, store, "export.create");
  if (!g.ok) return g.response;
  if (!ULID_RE.test(id)) return json({ ok: false, error: "invalid" } satisfies ExportErrorResponse, 400);
  try {
    return json({ ok: true, export: await revokeExport(g.ctx.scope, id, g.ctx.actor) });
  } catch (err) {
    return exportErrorResponse(err, "api/app/export:revoke");
  }
}
