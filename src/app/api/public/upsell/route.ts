/**
 * POST /api/public/upsell — one-click upsell from the thank-you page: { orderId, token }.
 * Answers { ok: true, orderId, total, currency } | { ok: false, error: "invalid"|"expired"|"rate_limited"|"server" }.
 * A per-process burst guard runs before any database work (a flood never reaches MariaDB).
 *
 * Per store (docs/STORE-SAAS.md §E.3 rule 6, §A.5.3, ORD-17): the order id resolves the order's store
 * (`resolveUpsellOrder`), the Origin must be one of that store's hosts or on the allow-list of the export that
 * placed the order, the token is checked inside the store, and a store whose public APIs are closed answers
 * "invalid" like an unknown order.
 */
import type { NextRequest } from "next/server";
import { UpsellPayload } from "@/lib/orders/contract";
import {
  checkOrigin,
  clientContext,
  corsHeaders,
  exportOrigins,
  json,
  logError,
  preflight,
  readJson,
  syncSheetAfterResponse,
} from "@/lib/orders/http";
import { acceptUpsell, type UpsellResponse } from "@/lib/orders/upsell";
import { burstLimit } from "@/lib/security/burst-limit";
import { publicApiAnswer, resolveUpsellOrder } from "@/lib/tenancy/public";

const STATUS: Record<Extract<UpsellResponse, { ok: false }>["error"], number> = {
  invalid: 422,
  expired: 410,
  rate_limited: 429,
};

export function OPTIONS(req: NextRequest): Promise<Response> {
  return preflight(req);
}

export async function POST(req: NextRequest): Promise<Response> {
  const client = clientContext(req);
  const burst = burstLimit("upsell", client.ip);
  if (!burst.ok) {
    return json({ ok: false, error: "rate_limited" } satisfies UpsellResponse, 429, { Vary: "Origin", "Retry-After": String(burst.retryAfter) });
  }
  try {
    const body = await readJson(req, 4 * 1024);
    if (!body.ok) return json({ ok: false, error: "invalid" }, body.status, { Vary: "Origin" });
    const parsed = UpsellPayload.safeParse(body.value);
    if (!parsed.success) return json({ ok: false, error: "invalid" }, 422, { Vary: "Origin" });

    // the thank-you page of an export lives on the export's domain: use that export's allow-list
    const found = await resolveUpsellOrder(parsed.data.orderId);
    const origins = found ? await exportOrigins(found.scope, found.exportId) : null;
    const verdict = checkOrigin(req, { store: found?.store ?? null, allowedOrigins: origins });
    if (!verdict.ok) return json({ ok: false, error: "invalid" }, 403, { Vary: "Origin" });
    const cors = corsHeaders(verdict.cors);
    if (!found || publicApiAnswer(found.store.status, "upsell") !== "open") return json({ ok: false, error: "invalid" } satisfies UpsellResponse, 422, cors);

    const result = await acceptUpsell(found.scope, parsed.data, { ip: client.ip });
    if (result.sync) syncSheetAfterResponse(found.scope, "api/upsell:sync");
    const status = result.response.ok ? 200 : STATUS[result.response.error];
    return json(result.response, status, {
      ...cors,
      ...(result.retryAfter ? { "Retry-After": String(result.retryAfter) } : {}),
    });
  } catch (err) {
    logError("api/upsell", err);
    return json({ ok: false, error: "server" }, 500, { Vary: "Origin" });
  }
}
