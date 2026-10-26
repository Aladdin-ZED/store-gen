/**
 * GET/HEAD /media/<key> — immutable media bytes from the database.
 * Content-addressed keys → cached forever by browsers/CDNs; strong ETag (sha256) + 304; byte ranges
 * (needed by Safari for <video>); sandboxed, nosniff, cross-origin embeddable.
 *
 * Public and unauthenticated, so it must never become a lever on the database the order API uses:
 *  - a URL with a query string is a 404 (the key is the whole identity; random queries would only
 *    bust CDN caches);
 *  - database work happens on cache misses only, and is metered per client IP in memory;
 *  - the media store reads on its own bounded pool: when saturated it answers 503 + Retry-After
 *    (never cached) instead of queueing behind order traffic;
 *  - large files (videos) are served from a verified local disk copy, not re-read per request.
 * Served on every host class (§G.6); a key of a store that is not servable for media (suspended, closed,
 * scheduled for deletion, purged, rejected: docs/STORE-SAAS.md §A.5.3) answers the same 404 as an unknown key.
 */
import type { NextRequest } from "next/server";
import {
  getMediaFile,
  getMediaMeta,
  MAX_CACHED_FILE,
  mediaBodyCached,
  MediaBusyError,
  openMediaRange,
  peekMediaMeta,
  VIDEO_KEY_RE,
  type MediaFileMeta,
} from "@/lib/media";
import { KEY_RE } from "@/lib/media/keys";
import { effectiveHost } from "@/lib/edge/host";
import { spendMediaTokens } from "@/lib/media/throttle";
import { hstsValue } from "@/lib/security/headers";
import { clientIp } from "@/lib/security/ip";
import { mediaServable, resolveMediaKey } from "@/lib/tenancy/public";

type Params = { params: Promise<{ key: string }> };

const PLAIN = {
  "Content-Type": "text/plain; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; sandbox",
} as const;

/** Database tokens for loading a file body: 1, plus 1 per 2 MB copied out of the database. */
const bodyCost = (meta: MediaFileMeta) => 1 + Math.floor(meta.bytes / (2 * 1024 * 1024));

function baseHeaders(meta: MediaFileMeta): Headers {
  return new Headers({
    "Content-Type": meta.mime,
    ETag: `"${meta.sha256}"`,
    "Cache-Control": "public, max-age=31536000, immutable",
    "Accept-Ranges": "bytes",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Cross-Origin-Resource-Policy": "cross-origin",
  });
}

function notFound(): Response {
  return new Response("Not found", { status: 404, headers: { ...PLAIN, "Cache-Control": "public, max-age=60" } });
}

/** Transient refusal (throttled or saturated): never cacheable. */
function unavailable(status: 429 | 503, retryAfter: number): Response {
  return new Response(status === 429 ? "Too many requests" : "Unavailable", {
    status,
    headers: { ...PLAIN, "Cache-Control": "no-store", "Retry-After": String(retryAfter) },
  });
}

/** If-None-Match: list of (weak or strong) tags, or "*". */
function etagMatches(header: string | null, sha: string): boolean {
  if (!header) return false;
  return header.split(",").some((t) => {
    const tag = t.trim().replace(/^W\//, "");
    return tag === "*" || tag === `"${sha}"`;
  });
}

/** Single byte range → [start, end] inclusive; null = serve whole file; "unsatisfiable" → 416. */
function parseRange(header: string | null, size: number): [number, number] | null | "unsatisfiable" {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return null; // multiple or malformed ranges: full response is allowed
  const [, a, b] = m;
  if (!a && !b) return null;
  if (!a) {
    const n = Number(b);
    if (n === 0) return "unsatisfiable";
    return [Math.max(0, size - n), size - 1];
  }
  const start = Number(a);
  const end = b ? Math.min(Number(b), size - 1) : size - 1;
  if (!Number.isSafeInteger(start) || start >= size || start > end) return "unsatisfiable";
  return [start, end];
}

async function serve(req: NextRequest, ctx: Params, head: boolean): Promise<Response> {
  if (req.url.includes("?")) return notFound();
  const { key } = await ctx.params;
  if (!KEY_RE.test(key) && !VIDEO_KEY_RE.test(key)) return notFound();

  let ip: string | null = null;
  /** charge database work to the client; returns a 429 when its bucket is empty */
  const charge = (cost: number): Response | null => {
    ip ??= clientIp(req.headers);
    const wait = spendMediaTokens(ip, cost);
    return wait ? unavailable(429, wait) : null;
  };

  let meta = peekMediaMeta(key);
  if (meta === undefined) {
    const refused = charge(1);
    if (refused) return refused;
    meta = await getMediaMeta(key);
  }
  if (!meta) return notFound();
  // the key's store decides (cached: keys never change store, the store row is the 15 s cache)
  const owner = await resolveMediaKey(key);
  if (!owner || !mediaServable(owner.store.status)) return notFound();
  const headers = baseHeaders(meta);

  if (etagMatches(req.headers.get("if-none-match"), meta.sha256)) {
    headers.delete("Content-Type");
    return new Response(null, { status: 304, headers });
  }

  const ifRange = req.headers.get("if-range");
  const range = ifRange && ifRange !== `"${meta.sha256}"` ? null : parseRange(req.headers.get("range"), meta.bytes);
  if (range === "unsatisfiable") {
    headers.set("Content-Range", `bytes */${meta.bytes}`);
    headers.delete("Content-Type");
    return new Response(null, { status: 416, headers });
  }

  const [start, end] = range ?? [0, meta.bytes - 1];
  const length = end - start + 1;
  headers.set("Content-Length", String(length));
  if (range) headers.set("Content-Range", `bytes ${start}-${end}/${meta.bytes}`);
  const status = range ? 206 : 200;
  if (head) return new Response(null, { status, headers });

  if (!mediaBodyCached(meta)) {
    const refused = charge(bodyCost(meta));
    if (refused) return refused;
  }
  if (meta.bytes <= MAX_CACHED_FILE) {
    const file = await getMediaFile(key);
    if (!file) return notFound();
    // Node Buffers are backed by a plain ArrayBuffer (never shared memory)
    const bytes = new Uint8Array(file.data.buffer as ArrayBuffer, file.data.byteOffset + start, length);
    return new Response(bytes, { status, headers });
  }
  return new Response(await openMediaRange(meta, start, end), { status, headers });
}

async function answer(req: NextRequest, ctx: Params, head: boolean): Promise<Response> {
  try {
    return await serve(req, ctx, head);
  } catch (err) {
    // saturated media reads are expected under load: answer fast, log nothing per request
    if (!(err instanceof MediaBusyError)) console.error("[media]", err instanceof Error ? err.message : "unknown error");
    // transient (database) failure: never let a CDN cache it
    return unavailable(503, 5);
  }
}

/** Every answer gets the HSTS of the request's host class in production (§F.6; /media/* never passes the proxy). */
async function handle(req: NextRequest, ctx: Params, head: boolean): Promise<Response> {
  const res = await answer(req, ctx, head);
  if (process.env.NODE_ENV === "production") res.headers.set("Strict-Transport-Security", hstsValue(effectiveHost(req.headers).cls));
  return res;
}

export function GET(req: NextRequest, ctx: Params): Promise<Response> {
  return handle(req, ctx, false);
}

export function HEAD(req: NextRequest, ctx: Params): Promise<Response> {
  return handle(req, ctx, true);
}
