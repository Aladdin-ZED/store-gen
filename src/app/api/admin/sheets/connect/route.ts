/**
 * The store's connected sheet (store #1 through the seam until the move to /app/<handle>, docs/STORE-SAAS.md §K.1 T4).
 *   POST   { url }        → the store's current spreadsheet: reconnect at once (find/create & format the "Commandes"
 *                           tab, prove Editor access, save) · any other: start the ownership proof (SHT-09) and
 *                           answer { ok: true, proof: { code, expiresAt, serviceAccountEmail } }; POST ./verify ends it
 *   PATCH  { enabled }    → pause / resume appending orders & pulling statuses (orders keep queuing while paused;
 *                           status edits made in the admin still reach rows already in the sheet)
 *   DELETE                → forget the connected sheet
 * Errors carry a French `message` for the admin (incl. the service-account e-mail to share with).
 */
import { after, type NextRequest } from "next/server";
import { z } from "zod";
import { legacyGuard } from "@/lib/admin-data/legacy-store";
import { settingsActor } from "@/lib/admin-data/store-audit";
import { json, logError, readJson } from "@/lib/orders/http";
import { rateLimit } from "@/lib/security/rate-limit";
import {
  disconnectSheet,
  explain,
  serviceAccountEmail,
  setSheetsEnabled,
  sheetsConfigProblem,
  startSheetConnect,
  SheetLinkInvalid,
  SheetsConfigError,
  syncPendingOrders,
} from "@/lib/sheets";
import type { WriteScope } from "@/lib/tenancy/types";

const ConnectBody = z.object({ url: z.string().trim().min(1).max(2000) });
const PatchBody = z.object({ enabled: z.boolean() });

/** Push the store's orders that queued while no sheet was connected (or while paused), after the response. */
function pushQueued(scope: WriteScope, label: string): void {
  after(async () => {
    try {
      await syncPendingOrders(scope, { force: true });
    } catch (err) {
      logError(`api/admin/sheets:${label}`, err);
    }
  });
}

export async function POST(req: NextRequest): Promise<Response> {
  const g = await legacyGuard(req, "integrations.manage");
  if (!g.ok) return g.response;
  const { scope, actor, store } = g.ctx;
  const gate = await rateLimit(`s:${scope.storeId}:sheets:connect:${actor.userId}`, 20, 600);
  if (!gate.ok) return json({ ok: false, error: "rate_limited" }, 429, { "Retry-After": String(gate.retryAfter) });

  const body = await readJson(req, 4096);
  const parsed = body.ok ? ConnectBody.safeParse(body.value) : null;
  if (!parsed?.success) return json({ ok: false, error: "invalid", message: "Collez le lien de votre feuille Google Sheets." }, 400);

  const email = serviceAccountEmail();
  const problem = sheetsConfigProblem();
  if (problem) return json({ ok: false, error: "not_configured", message: explain(problem, email) }, 409);
  try {
    const r = await startSheetConnect(scope, parsed.data.url, actor, { currency: store.currency });
    if (r.kind === "proof") return json({ ok: true, proof: { code: r.code, expiresAt: r.expiresAt, serviceAccountEmail: email } });
    pushQueued(scope, "connect-sync");
    return json({ ok: true, created: r.result.created, spreadsheetTitle: r.result.spreadsheetTitle, sheet: r.sheet });
  } catch (err) {
    if (err instanceof SheetLinkInvalid) return json({ ok: false, error: "invalid_link", code: err.code, message: explain(err, email) }, 400);
    const message = explain(err, email);
    if (!(err instanceof SheetsConfigError)) logError("api/admin/sheets:connect", err);
    return json({ ok: false, error: "google", message, serviceAccountEmail: email }, 502);
  }
}

export async function PATCH(req: NextRequest): Promise<Response> {
  const g = await legacyGuard(req, "integrations.manage");
  if (!g.ok) return g.response;
  const { scope, actor } = g.ctx;
  const body = await readJson(req, 1024);
  const parsed = body.ok ? PatchBody.safeParse(body.value) : null;
  if (!parsed?.success) return json({ ok: false, error: "invalid" }, 400);
  try {
    const sheet = await setSheetsEnabled(scope, parsed.data.enabled, settingsActor(actor));
    if (!sheet) return json({ ok: false, error: "not_connected" }, 409);
    if (sheet.enabled) pushQueued(scope, "resume-sync");
    return json({ ok: true, sheet });
  } catch (err) {
    logError("api/admin/sheets:patch", err);
    return json({ ok: false, error: "server" }, 500);
  }
}

export async function DELETE(req: NextRequest): Promise<Response> {
  const g = await legacyGuard(req, "integrations.manage");
  if (!g.ok) return g.response;
  try {
    await disconnectSheet(g.ctx.scope, settingsActor(g.ctx.actor));
    return json({ ok: true });
  } catch (err) {
    logError("api/admin/sheets:delete", err);
    return json({ ok: false, error: "server" }, 500);
  }
}
