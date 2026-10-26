/**
 * Store Gen edge Worker (docs/STORE-SAAS.md §C.5, OS-05). Plain ES module, no build step: paste it into the
 * Cloudflare dashboard editor or deploy it with wrangler. Route: `*.<domain>/*` only (the apex never runs it).
 * It keeps no state and decides nothing about stores: it stamps who is asking and forwards to the apex; the
 * app classifies the host and answers (src/lib/edge/host.ts, src/proxy.ts).
 *
 * Bindings: secret EDGE_KEY (32+ random bytes, base64url, different from every other secret); vars ORIGIN
 * ("https://<apex>"), STORE_ROOT ("<apex>"), WORKER_VERSION (e.g. "w-2026.10.1").
 *
 * EDGE_KEY rotation, zero downtime: (1) Hostinger env EDGE_KEY=<new>, EDGE_KEY_PREV=<old>, restart; (2) here,
 * update the EDGE_KEY secret to <new> (a secret change deploys a new version; requests in flight finish with
 * the old one, which the app still accepts); (3) after 24 h remove EDGE_KEY_PREV on Hostinger and restart.
 * The app logs requests still signed with the previous key once per hour (error_events edge / prev_key).
 */

const METHODS = new Set(["GET", "HEAD", "POST", "OPTIONS"]);
/** platform-only areas: defense in depth, the app answers the same neutral 404 */
const REFUSED_PATH = /^\/(admin|app|api\/app|api\/admin|api\/cron|api\/v1|kit)(\/|$)/i;
/**
 * Request headers a visitor may not hand to the origin: Host (the subrequest URL names the apex), the edge's
 * own (x-sg-*), cookies (store hosts never use one), Next.js internals (x-middleware-subrequest skipped
 * middleware in old releases) and forwarding headers the app must never read from a store visitor.
 */
const DROP_EXACT = new Set(["host", "cookie", "x-nonce", "x-cs-pathname", "x-forwarded-host", "forwarded", "x-real-ip"]);
const DROP_PREFIX = ["x-sg-", "x-middleware-", "x-invoke-", "x-next-"];
const HOST_RE = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;
const VERSION_RE = /^[A-Za-z0-9._-]{1,64}$/;

/** The neutral refusal of the edge itself: no body, nothing cached, nothing that names the platform. */
function refuse(status) {
  return new Response(null, {
    status,
    headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "x-sg-mode": "subdomain" },
  });
}

/** The path as the app's areaOf() reads it: decoded, "\" → "/", "//" collapsed (REFUSED_PATH ignores case). */
function plainPath(pathname) {
  let path = pathname;
  try {
    path = decodeURIComponent(pathname);
  } catch {
    // malformed escapes: the raw path (the app 404s it too)
  }
  return path.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
}

/** ORIGIN as "https://<host>" with no path; null when the binding is missing or not a bare https origin. */
function originOf(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" && url.pathname === "/" && !url.search && !url.hash && !url.username ? url.origin : null;
  } catch {
    return null;
  }
}

const worker = {
  async fetch(request, env) {
    const origin = originOf(env.ORIGIN);
    const key = typeof env.EDGE_KEY === "string" ? env.EDGE_KEY.trim() : "";
    // misconfigured Worker: fail closed here rather than send an unverifiable key the app would 404 anyway
    if (!origin || key.length < 32) return refuse(503);

    const url = new URL(request.url);
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    const method = request.method.toUpperCase();
    const root = String(env.STORE_ROOT || "").toLowerCase();
    // the apex (and www, which Cloudflare 301s first) never runs the Worker: a route that catches them is a mistake
    if (!HOST_RE.test(host) || host === new URL(origin).hostname || host === root || host === `www.${root}`) return refuse(404);
    if (!METHODS.has(method)) return refuse(404);
    if (request.headers.has("next-action")) return refuse(404);
    if (REFUSED_PATH.test(plainPath(url.pathname))) return refuse(404);

    const headers = new Headers();
    for (const [name, value] of request.headers) {
      const n = name.toLowerCase();
      if (DROP_EXACT.has(n) || DROP_PREFIX.some((p) => n.startsWith(p))) continue;
      headers.append(n, value);
    }
    headers.set("x-sg-host", host);
    headers.set("x-sg-edge", key);
    const ip = request.headers.get("cf-connecting-ip");
    if (ip) headers.set("x-sg-ip", ip);
    headers.set("x-sg-proto", "https");
    headers.set("x-sg-worker", VERSION_RE.test(String(env.WORKER_VERSION || "")) ? String(env.WORKER_VERSION) : "unset");
    headers.set("x-sg-ts", String(Date.now()));

    let res;
    try {
      res = await fetch(origin + url.pathname + url.search, {
        method,
        headers,
        body: method === "GET" || method === "HEAD" ? null : request.body,
        redirect: "manual",
        // ENGC-2: Cloudflare keys this subrequest by the apex URL, which every store shares: never through its cache
        cf: { cacheTtl: 0, cacheEverything: false },
      });
    } catch {
      return refuse(503); // origin unreachable: a neutral 503, not Cloudflare's error page naming the Worker
    }

    const out = new Response(res.body, res);
    out.headers.delete("set-cookie");
    // Next's rewrite marker (x-middleware-rewrite: /s/<handle>/…) would set a route's 404 apart from the proxy's (ENGC-22)
    for (const name of [...out.headers.keys()]) if (name.startsWith("x-middleware-")) out.headers.delete(name);
    out.headers.set("x-sg-mode", "subdomain");
    return out;
  },
};

export default worker;
