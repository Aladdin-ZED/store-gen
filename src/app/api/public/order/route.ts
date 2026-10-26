/**
 * POST /api/public/order — COD order from a live store page or a connected export.
 * Body: OrderPayload JSON v1 or v2 (application/json or text/plain, ≤ 24 KB) + optional "cf"
 * Turnstile token; dispatched on `v` before parsing (docs/OFFERS.md §G.1).
 * Always answers OrderResponse JSON (also on errors); "stale" (409) asks the runtime to reload the
 * page the shopper has open. The sheet sync and the server-side Purchase events (Meta Conversions
 * API, TikTok Events API) run after the response.
 *
 * Per store (docs/STORE-SAAS.md §C.9, §E.2, §A.5.3, D54): the page key resolves the store (`resolvePublicTarget`),
 * the Origin must be one of that store's hosts (or on the export's allow-list), the store's state decides whether
 * it takes orders (pending, restricted, suspended → "unavailable", like an unknown key), `?sg-test=<token>` signed
 * for that store makes a test order, and every limit, list and history is the store's. The coarse network floor
 * stays platform-wide (`p:api:order:<hash>`, 60 per 10 min) after the in-memory burst guard.
 */
import type { NextRequest } from "next/server";
import { parseOrderPayload, type OrderResponse } from "@/lib/orders/contract";
import { sendConversionsAfterResponse } from "@/lib/orders/conversions";
import { createOrder, decoyResponse } from "@/lib/orders/create";
import {
  checkOrigin,
  clientContext,
  corsHeaders,
  exportOriginAllowed,
  json,
  logError,
  preflight,
  readJson,
  syncSheetAfterResponse,
  usesLegacyIntegrations,
} from "@/lib/orders/http";
import { burstLimit } from "@/lib/security/burst-limit";
import { hashIp } from "@/lib/security/crypto";
import { platformBucket, rateLimit } from "@/lib/security/rate-limit";
import { publicApiAnswer, resolvePublicTarget, resolveTestToken, TEST_PARAM } from "@/lib/tenancy/public";

type Failure = Extract<OrderResponse, { ok: false }>;

/** Order body limit (v2 payloads carry up to 20 units). */
const BODY_LIMIT = 24 * 1024;

const STATUS: Record<Failure["error"], number> = {
  invalid: 422,
  duplicate: 409,
  stale: 409,
  rate_limited: 429,
  blocked: 403,
  unavailable: 404,
  server: 500,
};

export function OPTIONS(req: NextRequest): Promise<Response> {
  return preflight(req);
}

export async function POST(req: NextRequest): Promise<Response> {
  const client = clientContext(req);
  // CORS for early answers: any active export's origin may read them
  let earlyCors: string | null = null;
  try {
    // (the origin allow-list is cached in-process; an unknown origin is re-checked at most every few seconds)
    if (client.origin && (await exportOriginAllowed(client.origin))) earlyCors = client.origin;

    // in-memory burst guard first, so a flood never reaches the database limit below
    const burst = burstLimit("order", client.ip);
    if (!burst.ok) {
      return json({ ok: false, error: "rate_limited" } satisfies OrderResponse, 429, {
        ...corsHeaders(earlyCors),
        "Retry-After": String(burst.retryAfter),
      });
    }

    const coarse = await rateLimit(platformBucket("api:order", hashIp(client.ip)), 60, 600);
    if (!coarse.ok) {
      return json({ ok: false, error: "rate_limited" } satisfies OrderResponse, 429, {
        ...corsHeaders(earlyCors),
        "Retry-After": String(coarse.retryAfter),
      });
    }

    const body = await readJson(req, BODY_LIMIT);
    if (!body.ok || !body.value || typeof body.value !== "object" || Array.isArray(body.value)) {
      return json({ ok: false, error: "invalid" } satisfies OrderResponse, body.ok ? 400 : body.status, corsHeaders(earlyCors));
    }
    const raw = body.value as Record<string, unknown>;
    // honeypot & Turnstile token are taken out before schema validation
    const honeypot = typeof raw.website === "string" && raw.website.trim().length > 0;
    const captchaToken = typeof raw.cf === "string" ? raw.cf : null;
    const parsed = parseOrderPayload({ ...raw, website: "" });
    if (!parsed.ok && honeypot) {
      const key = typeof raw.pageKey === "string" ? raw.pageKey : "";
      const target = await resolvePublicTarget(key, { purpose: "order" });
      return json(decoyResponse(target?.doc ?? null, raw.bundleId, target?.store), 200, corsHeaders(earlyCors));
    }
    if (!parsed.ok) {
      const fields = parsed.fields;
      const res: OrderResponse = Object.keys(fields).length ? { ok: false, error: "invalid", fields } : { ok: false, error: "invalid" };
      return json(res, 422, corsHeaders(earlyCors));
    }

    const target = await resolvePublicTarget(parsed.data.pageKey, { purpose: "order" });
    if (!target) return json({ ok: false, error: "unavailable" } satisfies OrderResponse, 404, corsHeaders(earlyCors));

    const verdict = checkOrigin(req, { store: target.store, allowedOrigins: target.kind === "export" ? target.allowedOrigins : null });
    if (!verdict.ok) return json({ ok: false, error: "unavailable" } satisfies OrderResponse, 403, { Vary: "Origin" });
    const cors = corsHeaders(verdict.cors);
    // a store that does not take orders right now answers like an unknown key (§A.5.3)
    if (publicApiAnswer(target.store.status, "order") !== "open") return json({ ok: false, error: "unavailable" } satisfies OrderResponse, 404, cors);

    const { test } = resolveTestToken(target.store, new URL(req.url).searchParams.get(TEST_PARAM));
    const result = await createOrder(parsed.data, {
      ip: client.ip,
      ua: client.ua,
      target,
      captchaToken,
      noOrigin: verdict.noOrigin,
      honeypot,
      test,
    });
    if (result.sync) syncSheetAfterResponse(target.scope, "api/order:sync");
    // the CAPI tokens are store #1's until T4's scoped sendConversionsAfterResponse(scope, c) (review r1.0-t3 F2)
    if (usesLegacyIntegrations(target.scope)) sendConversionsAfterResponse(result.conversion);
    const status = result.response.ok ? 200 : STATUS[result.response.error];
    return json(result.response, status, {
      ...cors,
      ...(result.retryAfter ? { "Retry-After": String(result.retryAfter) } : {}),
    });
  } catch (err) {
    logError("api/order", err);
    return json({ ok: false, error: "server" } satisfies OrderResponse, 500, corsHeaders(earlyCors));
  }
}
