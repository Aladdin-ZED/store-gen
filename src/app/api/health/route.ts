/**
 * GET/HEAD /api/health — public liveness (docs/STORE-SAAS.md §H.5, §F.6, D45): `{ ok, app: "store-gen", db, build }`
 * (src/lib/edge/health.ts), 200 when the database answers and 503 when it does not, with the base headers and
 * `Cache-Control: no-store`. Burst-limited per network in memory before any database work (the analytics-beacon
 * window, far above any monitor's rate). Served on the platform and legacy hosts; the store hosts' proxy passes it
 * too (a public API path).
 */
import { connection, type NextRequest } from "next/server";
import { publicHealth } from "@/lib/edge/health";
import { effectiveHost } from "@/lib/edge/host";
import { notFoundResponse } from "@/lib/render/serve.server";
import { burstLimit } from "@/lib/security/burst-limit";
import { baseSecurityHeaders } from "@/lib/security/headers";
import { clientIp } from "@/lib/security/ip";

async function serve(req: NextRequest): Promise<Response> {
  await connection();
  const headers = new Headers(baseSecurityHeaders({ frame: "deny", cls: effectiveHost(req.headers).cls }));
  headers.set("Cache-Control", "no-store");
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("X-Robots-Tag", "noindex, nofollow");
  headers.set("Cross-Origin-Resource-Policy", "same-origin");
  const gate = burstLimit("event", clientIp(req.headers));
  if (!gate.ok) {
    headers.set("Retry-After", String(gate.retryAfter));
    return new Response(req.method === "HEAD" ? null : JSON.stringify({ ok: false, error: "rate_limited" }), { status: 429, headers });
  }
  const health = await publicHealth();
  return new Response(req.method === "HEAD" ? null : JSON.stringify(health), { status: health.ok ? 200 : 503, headers });
}

export function GET(req: NextRequest): Promise<Response> {
  return serve(req);
}

export function HEAD(req: NextRequest): Promise<Response> {
  return serve(req);
}

function unknownMethod(req: NextRequest): Response {
  return notFoundResponse(req);
}
export const OPTIONS = unknownMethod;
export const POST = unknownMethod;
export const PUT = unknownMethod;
export const PATCH = unknownMethod;
export const DELETE = unknownMethod;
