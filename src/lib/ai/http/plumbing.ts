import "server-only";
/**
 * The HTTP plumbing of the AI route handlers (P7 AI; ai.md AI-§A.7, AI-§E.6 sf-05; docs/STORE-SAAS.md §F.6): the JSON
 * answer with the API header set (the security base, `no-store`, noindex, CORP same-site), the empty `204`, and the
 * capped JSON body read. The same contract as the commerce routes' src/lib/orders/http.ts, written here because no AI
 * path imports an orders or leads module (test:ai-db sf-05): that file also carries the order Sheets push.
 */
import { baseSecurityHeaders } from "@/lib/security/headers";

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

export type BodyResult<T> = { ok: true; value: T } | { ok: false; status: 400 | 413 | 415 };

/** The raw body, refusing (and cancelling) anything above `maxBytes`, or a body shorter than it declared. */
async function readBody(req: Request, maxBytes: number): Promise<BodyResult<Uint8Array<ArrayBuffer>>> {
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
  if (Number.isFinite(declared) && declared > 0 && size !== declared) return { ok: false, status: size < declared ? 413 : 400 };
  return { ok: true, value: out };
}

/** A JSON body (application/json, or none given), ≤ `maxBytes`; the parsed value is unknown until zod reads it. */
export async function readJson(req: Request, maxBytes: number): Promise<BodyResult<unknown>> {
  const type = (req.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  if (type && type !== "application/json" && type !== "text/plain") return { ok: false, status: 415 };
  const body = await readBody(req, maxBytes);
  if (!body.ok) return body;
  try {
    return { ok: true, value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body.value)) as unknown };
  } catch {
    return { ok: false, status: 400 };
  }
}
