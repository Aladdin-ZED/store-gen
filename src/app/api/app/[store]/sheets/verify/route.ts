/**
 * POST /api/app/<handle>/sheets/verify: the second step of connecting a new spreadsheet (SHT-09, OPE-§19.3). The code
 * shown by POST ./connect must be in the spreadsheet's name or a tab's name (never a cell: shoppers write the rows).
 * Found → the orders tab is created or reused, the sheet is the store's, queued orders are pushed; the answer is the
 * one of a direct connect. A fresh step-up first (403 { error: "step_up" }, §B.7).
 * Errors carry a French `message`: no proof pending (or expired), code not in the sheet yet, Google errors; another
 * store bound the spreadsheet first → 409 { error: "binding_conflict" } with the one generic message (OPE-§19.3). The
 * bucket `s:<sid>:sheets:connect:<uid>` (10 per hour) is shared with ./connect.
 */
import { after, type NextRequest } from "next/server";
import { messageOf } from "@/lib/i18n/admin";
import { json, logError } from "@/lib/orders/http";
import { rateLimit, storeBucket } from "@/lib/security/rate-limit";
import {
  CONNECT_BUCKET,
  explain,
  serviceAccountEmail,
  SheetBindingConflict,
  sheetsConfigProblem,
  SheetsConfigError,
  SheetsProofError,
  syncPendingOrders,
  verifySheetConnect,
} from "@/lib/sheets";
import { EntitlementError } from "@/lib/tenancy/entitlements";
import { stepUpGuard, storeGuard } from "@/lib/tenancy/seam";

type Params = { params: Promise<{ store: string }> };

export async function POST(req: NextRequest, { params }: Params): Promise<Response> {
  const g = await storeGuard(req, (await params).store, "integrations.manage");
  if (!g.ok) return g.response;
  // the step that connects the sheet: a secret write under integrations.manage, a fresh step-up (§B.7, SEC-17)
  const up = stepUpGuard(g.ctx);
  if (!up.ok) return up.response;
  const { scope, actor, store, user } = g.ctx;
  const gate = await rateLimit(storeBucket(scope, CONNECT_BUCKET.name, user.id), CONNECT_BUCKET.limit, CONNECT_BUCKET.windowSec);
  if (!gate.ok) return json({ ok: false, error: "rate_limited" }, 429, { "Retry-After": String(gate.retryAfter) });

  const email = serviceAccountEmail();
  const problem = sheetsConfigProblem();
  if (problem) return json({ ok: false, error: "not_configured", message: explain(problem, email) }, 409);
  try {
    const r = await verifySheetConnect(scope, actor, { currency: store.currency, stepUp: up.stepUp });
    after(async () => {
      try {
        await syncPendingOrders(scope, { force: true });
      } catch (err) {
        logError("api/app/sheets:verify-sync", err);
      }
    });
    return json({ ok: true, created: r.result.created, spreadsheetTitle: r.result.spreadsheetTitle, sheet: r.sheet });
  } catch (err) {
    if (err instanceof SheetsProofError) return json({ ok: false, error: err.code, message: err.message }, 409);
    if (err instanceof SheetBindingConflict) return json({ ok: false, error: "binding_conflict", message: messageOf("int.sheets.refused", "fr") }, 409);
    if (err instanceof EntitlementError) return json({ ok: false, error: "feature_off" }, 403);
    const message = explain(err, email);
    if (!(err instanceof SheetsConfigError)) logError("api/app/sheets:verify", err);
    return json({ ok: false, error: "google", message, serviceAccountEmail: email }, 502);
  }
}
