/**
 * POST /api/public/lead — abandoned-lead capture (sent once the phone becomes valid).
 * Fire-and-forget for the runtime: answers 204 whether or not the lead was stored (no oracle).
 * A per-process burst guard runs before any database work (a flood never reaches MariaDB).
 * Body ≤ 24 KB (v2 runtimes send the offer selection): `units` / `extras` are tolerant — entries that
 * don't parse are dropped, never an error (docs/OFFERS.md §G.1).
 *
 * Per store (docs/STORE-SAAS.md §C.9, §A.5.3, D54): the page key resolves the store, the Origin must be one of its
 * hosts (or on the export's allow-list), only a store that takes orders stores leads (any other state: the same
 * 204), and a lead from a test link signed for the store is stored `is_test`.
 */
import type { NextRequest } from "next/server";
import { LeadPayload, leadSelection } from "@/lib/orders/contract";
import { checkOrigin, clientContext, corsHeaders, json, logError, noContent, preflight, readJson } from "@/lib/orders/http";
import { upsertLead } from "@/lib/orders/leads";
import { burstLimit } from "@/lib/security/burst-limit";
import { publicApiAnswer, resolvePublicTarget, resolveTestToken, TEST_PARAM } from "@/lib/tenancy/public";

export function OPTIONS(req: NextRequest): Promise<Response> {
  return preflight(req);
}

export async function POST(req: NextRequest): Promise<Response> {
  const client = clientContext(req);
  if (!burstLimit("lead", client.ip).ok) return noContent({ Vary: "Origin" });
  try {
    const body = await readJson(req, 24 * 1024);
    if (!body.ok) return json({ ok: false, error: "invalid" }, body.status, { Vary: "Origin" });
    const parsed = LeadPayload.safeParse(body.value);
    if (!parsed.success) return json({ ok: false, error: "invalid" }, 422, { Vary: "Origin" });

    const target = await resolvePublicTarget(parsed.data.pageKey, { purpose: "order" });
    if (!target) return noContent({ Vary: "Origin" });
    const verdict = checkOrigin(req, { store: target.store, allowedOrigins: target.kind === "export" ? target.allowedOrigins : null });
    if (!verdict.ok) return json({ ok: false, error: "unavailable" }, 403, { Vary: "Origin" });
    if (publicApiAnswer(target.store.status, "lead") !== "open") return noContent(corsHeaders(verdict.cors));

    const { test } = resolveTestToken(target.store, new URL(req.url).searchParams.get(TEST_PARAM));
    const { units, extras } = leadSelection(parsed.data);
    await upsertLead({ ...parsed.data, units, extras }, { ip: client.ip, target, test });
    return noContent(corsHeaders(verdict.cors));
  } catch (err) {
    logError("api/lead", err);
    return json({ ok: false, error: "server" }, 500, { Vary: "Origin" });
  }
}
