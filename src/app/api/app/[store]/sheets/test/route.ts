/**
 * POST /api/app/<handle>/sheets/test — read-only access check of the store's connected sheet: the header row is read
 * back and compared with the expected columns (no test rows are ever written to a live order sheet).
 */
import type { NextRequest } from "next/server";
import { json } from "@/lib/orders/http";
import { rateLimit } from "@/lib/security/rate-limit";
import { COLUMNS, explain, getSheetsConfig, serviceAccountEmail, sheetsConfigProblem, verifySheet } from "@/lib/sheets";
import { storeGuard } from "@/lib/tenancy/seam";

type Params = { params: Promise<{ store: string }> };

export async function POST(req: NextRequest, { params }: Params): Promise<Response> {
  const g = await storeGuard(req, (await params).store, "integrations.manage");
  if (!g.ok) return g.response;
  const { scope, actor } = g.ctx;
  const gate = await rateLimit(`s:${scope.storeId}:sheets:test:${actor.userId}`, 30, 600);
  if (!gate.ok) return json({ ok: false, error: "rate_limited" }, 429, { "Retry-After": String(gate.retryAfter) });

  const email = serviceAccountEmail();
  const problem = sheetsConfigProblem();
  if (problem) return json({ ok: false, error: "not_configured", message: explain(problem, email) }, 409);
  const cfg = await getSheetsConfig(scope);
  if (!cfg) return json({ ok: false, error: "not_connected", message: "Aucune feuille n'est connectée." }, 409);
  try {
    const r = await verifySheet(cfg.spreadsheetId, cfg.sheetTitle);
    return json({
      ok: true,
      headerOk: r.ok,
      message: r.ok
        ? "Connexion vérifiée : la feuille est accessible."
        : `La ligne d'en-tête a été modifiée. Colonnes attendues : ${COLUMNS.map((c) => c[0]).join(" · ")}. Reconnectez la feuille pour la rétablir.`,
      sheet: cfg,
    });
  } catch (err) {
    return json({ ok: false, error: "google", message: explain(err, email), serviceAccountEmail: email }, 502);
  }
}
