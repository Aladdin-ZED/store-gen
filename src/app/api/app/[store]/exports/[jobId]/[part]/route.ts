/**
 * One part of a store export ZIP (docs/STORE-SAAS.md §F.9, PL-09; R1 P8 step 8):
 *   GET /api/app/<h>/exports/<jobId>/<part>?t=<exp>.<sig>   → the part as application/zip, an attachment   (store.export)
 *
 * `storeGuard(req, params.store, "store.export")` is the first awaited statement (L13): a session of this store that
 * still has `store.export` (owner / admin; suspended and closed stores keep it, §A.5.3). Then the signature
 * (`sig = hmac(jobId|part|exp, "export-dl:<storeId>")`, constant time, src/lib/exports-store/sign.ts) and the job: an
 * invalid or expired `t`, another store's job (its signature is another store's key, and the lookup is scoped), a job
 * that is not ready or past its 72 h, a missing part: all the same neutral 404, so nothing tells them apart. Each
 * download writes `store.export_downloaded` (meta: part) in the store's audit.
 */
import type { NextRequest } from "next/server";
import { auditIn } from "@/lib/admin-data/store-audit";
import { openExportPart } from "@/lib/exports-store";
import { verifyExportToken } from "@/lib/exports-store/sign";
import { logError } from "@/lib/orders/http";
import { baseSecurityHeaders } from "@/lib/security/headers";
import { guardResponse, storeGuard } from "@/lib/tenancy/seam";

type Params = { params: Promise<{ store: string; jobId: string; part: string }> };

const notFound = () => guardResponse("not_found", 404);

export async function GET(req: NextRequest, { params }: Params): Promise<Response> {
  const { store, jobId, part } = await params;
  const g = await storeGuard(req, store, "store.export");
  if (!g.ok) return g.response;
  const { scope, actor } = g.ctx;
  try {
    if (!verifyExportToken(scope.storeId, jobId, part, req.nextUrl.searchParams.get("t"))) return notFound();
    const file = await openExportPart(scope, jobId, part);
    if (!file) return notFound();
    await auditIn(scope, actor, "store.export_downloaded", { target: jobId, meta: { part: Number(part) } });
    const h = new Headers(baseSecurityHeaders({ frame: "deny" }));
    h.set("Content-Type", "application/zip");
    h.set("Content-Length", String(file.bytes));
    h.set("Content-Disposition", `attachment; filename="${file.filename}"`);
    h.set("Cache-Control", "private, no-store");
    h.set("X-Robots-Tag", "noindex, nofollow");
    h.set("Cross-Origin-Resource-Policy", "same-origin");
    return new Response(file.stream, { status: 200, headers: h });
  } catch (err) {
    logError("api/app/exports/[jobId]/[part]", err);
    return notFound();
  }
}
