import "server-only";
/**
 * HTTP plumbing shared by the commerce route handlers (public API, admin media/sheets, cron):
 * JSON responses with security headers + no-store, capped body reading, origin / CORS policy
 * (per store, ./origin) and the after-response Sheets push of the order's store. Dashboard and console routes guard
 * themselves with `storeGuard` / `platformGuard` (src/lib/tenancy/seam.ts).
 */
import { and, isNull } from "drizzle-orm";
import { after } from "next/server";
import { db } from "@/lib/db/client";
import { exportsTable } from "@/lib/db/schema";
import { systemCtx, systemScope } from "@/lib/jobs/scope";
import { baseSecurityHeaders } from "@/lib/security/headers";
import { clientIp } from "@/lib/security/ip";
import { syncPendingOrders } from "@/lib/sheets/sync";
import { byId } from "@/lib/tenancy/sql";
import type { StoreScope } from "@/lib/tenancy/types";
import { exportOriginAllowed } from "./export-origins";
import { logError } from "./log";
import { corsHeaders } from "./origin";

export { checkOrigin, corsHeaders, exportOriginProblem, originAllowed, type OriginTarget, type OriginVerdict } from "./origin";

/* ------------------------------------------------------------------ */
/* responses                                                           */
/* ------------------------------------------------------------------ */

export function apiHeaders(extra?: HeadersInit): Headers {
  const h = new Headers(baseSecurityHeaders({ frame: "deny" }));
  h.set("Cache-Control", "no-store");
  h.set("X-Robots-Tag", "noindex, nofollow");
  h.set("Cross-Origin-Resource-Policy", "same-site");
  if (extra) new Headers(extra).forEach((value, name) => h.set(name, value));
  return h;
}

export function json(body: unknown, status = 200, extra?: HeadersInit): Response {
  const headers = apiHeaders(extra);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { status, headers });
}

export function noContent(extra?: HeadersInit): Response {
  return new Response(null, { status: 204, headers: apiHeaders(extra) });
}

export { errorSummary, logError } from "./log";

/**
 * Push the store's queued orders to the store's own Google Sheet once the response has been sent (ORD-08, SHT-02).
 * Never throws: the order is already stored, and anything not pushed now is picked up by the next sync (cron
 * tick). `scope` is the order's store; after the response the push is that store's background work, hence the
 * job's `systemScope` (a `WriteScope`: the sync writes `sheet_status`).
 */
export function syncSheetAfterResponse(scope: StoreScope, label: string): void {
  try {
    after(async () => {
      try {
        await syncPendingOrders(systemScope(systemCtx("sheets.push"), scope.storeId), { maxRetries: 2 });
      } catch (err) {
        logError(label, err);
      }
    });
  } catch (err) {
    logError(label, err);
  }
}

/* ------------------------------------------------------------------ */
/* request                                                             */
/* ------------------------------------------------------------------ */

export interface ClientContext {
  ip: string;
  /** user agent, control characters stripped, ≤ 300 chars (null when absent) */
  ua: string | null;
  origin: string | null;
}

export function clientContext(req: Request): ClientContext {
  const ua = (req.headers.get("user-agent") ?? "").replace(/[\u0000-\u001F\u007F]/g, "").slice(0, 300);
  return { ip: clientIp(req.headers), ua: ua || null, origin: req.headers.get("origin") };
}

export type BodyResult<T> = { ok: true; value: T } | { ok: false; status: 400 | 413 | 415 };

/** Read the raw body, refusing (and cancelling) anything above `maxBytes`. */
export async function readBody(req: Request, maxBytes: number): Promise<BodyResult<Uint8Array<ArrayBuffer>>> {
  const declared = Number(req.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, status: 413 };
  if (!req.body) return { ok: true, value: new Uint8Array(new ArrayBuffer(0)) };
  const reader = req.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return { ok: false, status: 413 };
    }
    parts.push(value);
  }
  const out = new Uint8Array(new ArrayBuffer(size));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.byteLength;
  }
  // a body cut short by a proxy buffering limit (Next proxy: 10 MB by default) must not pass as complete
  if (Number.isFinite(declared) && declared > 0 && size !== declared) return { ok: false, status: size < declared ? 413 : 400 };
  return { ok: true, value: out };
}

/**
 * JSON body sent as application/json or text/plain (sendBeacon / simple CORS requests), ≤ maxBytes.
 * Returns the parsed value (unknown — validate with zod).
 */
export async function readJson(req: Request, maxBytes = 16 * 1024): Promise<BodyResult<unknown>> {
  const type = (req.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  if (type && type !== "application/json" && type !== "text/plain") return { ok: false, status: 415 };
  const body = await readBody(req, maxBytes);
  if (!body.ok) return body;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(body.value);
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, status: 400 };
  }
}

/* ------------------------------------------------------------------ */
/* CORS                                                                */
/* ------------------------------------------------------------------ */

export { activeExportOrigins, exportOriginAllowed } from "./export-origins";

/** OPTIONS handler body shared by the public POST endpoints. */
export async function preflight(req: Request): Promise<Response> {
  const origin = req.headers.get("origin");
  const allowed = origin ? await exportOriginAllowed(origin) : false;
  return noContent(corsHeaders(allowed ? origin : null));
}

/** Allow-list of the (still active) export of the scope's store that placed an order (for upsell CORS). */
export async function exportOrigins(scope: StoreScope, exportId: string | null): Promise<string[] | null> {
  if (!exportId) return null;
  const [row] = await db
    .select({ origins: exportsTable.allowedOrigins })
    .from(exportsTable)
    .where(and(byId(exportsTable, scope, exportId), isNull(exportsTable.revokedAt)))
    .limit(1);
  return row && Array.isArray(row.origins) ? row.origins.filter((o) => typeof o === "string") : null;
}
