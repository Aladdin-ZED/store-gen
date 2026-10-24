/**
 * The neutral pages (docs/STORE-SAAS.md §F.6): the public "page not found" content and its 410 / 503 siblings,
 * shared by the app's not-found page (src/app/not-found.tsx), the proxy's own answers (src/proxy.ts) and every
 * route handler that answers an unknown URL, so all of them look the same to a visitor.
 * Deliberately neutral: no product or admin branding.
 *
 * One header set for every producer (the 404-uniformity rule, rev 3 ENGC-22): `UNKNOWN_PAGE_HEADERS` for 404,
 * 410 and the proxy's 403, `unavailablePageHeaders()` (the same set + Retry-After) for 503. The proxy also
 * stamps the host-class HSTS on every response it forwards, so a route's 404 and the proxy's 404 stay
 * byte-identical on each host class; producers outside the proxy matcher pass the request headers.
 */
import { createHash } from "node:crypto";
import { effectiveHost, type HostClass } from "@/lib/edge/host";
import { hstsValue } from "@/lib/security/headers";

export const UNKNOWN_PAGE_COPY = {
  code: "404",
  titleFr: "Page introuvable",
  bodyFr: "Le lien est peut-être incorrect, ou la page n'existe plus.",
  titleAr: "الصفحة غير موجودة",
  bodyAr: "ربما الرابط غير صحيح أو أن الصفحة لم تعد موجودة.",
  homeFr: "Retour à l'accueil",
} as const;

/** 410: a page or a store that was removed for good (deleted handle, paused short link). */
export const GONE_PAGE_COPY = {
  code: "410",
  titleFr: "Cette page n'existe plus",
  bodyFr: "Elle a été retirée et n'est plus disponible.",
  titleAr: "هذه الصفحة لم تعد موجودة",
  bodyAr: "تمت إزالتها ولم تعد متاحة.",
  homeFr: UNKNOWN_PAGE_COPY.homeFr,
} as const;

/** 503: the store backend is unreachable for a moment. */
export const UNAVAILABLE_PAGE_COPY = {
  code: "503",
  titleFr: "Service momentanément indisponible",
  bodyFr: "Réessayez dans quelques instants.",
  titleAr: "الخدمة غير متاحة مؤقتاً",
  bodyAr: "يرجى المحاولة مرة أخرى بعد لحظات.",
  homeFr: UNKNOWN_PAGE_COPY.homeFr,
} as const;

/**
 * Shared visual tokens (system fonts — the 404 must not depend on app assets). Warm-neutral paper
 * and ink at very low chroma (no accent, no orange); `dark*` apply under prefers-color-scheme: dark.
 */
export const UNKNOWN_PAGE_STYLE = {
  bg: "#f7f6f2",
  ink: "#1b1a18",
  soft: "#66625b",
  line: "#e2dfd8",
  darkBg: "#141413",
  darkInk: "#ecebe7",
  darkSoft: "#a3a09a",
  darkLine: "#2d2c29",
  font: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans Arabic", Tahoma, sans-serif',
} as const;

const s = UNKNOWN_PAGE_STYLE;

/** The one inline style of the neutral pages; the CSP allows exactly it, by hash. */
const PAGE_STYLE = `
:root{--bg:${s.bg};--ink:${s.ink};--soft:${s.soft};--line:${s.line}}@media (prefers-color-scheme:dark){:root{--bg:${s.darkBg};--ink:${s.darkInk};--soft:${s.darkSoft};--line:${s.darkLine}}}
*{box-sizing:border-box}html,body{margin:0;min-height:100%}body{display:grid;place-items:center;min-height:100vh;min-height:100dvh;padding:24px;background:var(--bg);color:var(--ink);font-family:${s.font};line-height:1.5;-webkit-font-smoothing:antialiased}
main{width:100%;max-width:28rem;text-align:center}.code{font-size:4.5rem;font-weight:300;letter-spacing:-.04em;line-height:1;margin:0 0 1.5rem;color:var(--ink);font-variant-numeric:tabular-nums}
h1,h2{font-size:1.25rem;font-weight:600;margin:0;text-wrap:balance}p{margin:.5rem 0 0;color:var(--soft);font-size:.95rem;text-wrap:pretty}hr{border:0;border-top:1px solid var(--line);margin:1.5rem auto;width:4rem}
a{display:inline-flex;align-items:center;min-height:44px;margin-top:1.5rem;color:var(--ink);font-size:.9rem;text-underline-offset:4px;text-decoration-color:var(--soft)}a:hover{text-decoration-color:currentColor}a:focus-visible{outline:2px solid var(--ink);outline-offset:4px;border-radius:2px}
`;

type PageCopy = typeof UNKNOWN_PAGE_COPY | typeof GONE_PAGE_COPY | typeof UNAVAILABLE_PAGE_COPY;

/** Complete HTML document (static, no scripts, no user input). */
const neutralPage = (c: PageCopy) =>
  `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><meta name="color-scheme" content="light dark"><title>${c.titleFr}</title><style>${PAGE_STYLE}</style></head><body><main><p class="code" aria-hidden="true">${c.code}</p><h1>${c.titleFr}</h1><p>${c.bodyFr}</p><hr><div lang="ar" dir="rtl"><h2>${c.titleAr}</h2><p>${c.bodyAr}</p></div><a href="/">${c.homeFr}</a></main></body></html>`;

export const UNKNOWN_PAGE_HTML = neutralPage(UNKNOWN_PAGE_COPY);
export const GONE_PAGE_HTML = neutralPage(GONE_PAGE_COPY);
export const UNAVAILABLE_PAGE_HTML = neutralPage(UNAVAILABLE_PAGE_COPY);

/** `'sha256-…'` of the inline style (CSP3 hash source). */
export const UNKNOWN_PAGE_STYLE_HASH = `'sha256-${createHash("sha256").update(PAGE_STYLE, "utf8").digest("base64")}'`;

/** The neutral pages load nothing, run nothing and post nowhere; only their own inline style applies. */
export const UNKNOWN_PAGE_CSP = `default-src 'none'; style-src ${UNKNOWN_PAGE_STYLE_HASH}; img-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`;

const IS_PROD = process.env.NODE_ENV === "production";

/**
 * Headers of every "unknown URL" answer (§F.6, byte-identical across producers): the proxy's (un-gated admin,
 * store-host refusals, the action 403), the route handlers' (unknown slug, legal page, un-gated media API, cron
 * without its key) and, through the fallback rewrite in next.config.ts, every path no route matches.
 *  - The Vary list is the one Next.js adds to its own responses.
 *  - `no-transform` keeps Next's response compression (and any CDN) from re-encoding one of them and not the
 *    others: proxy answers would otherwise go out gzip-encoded and route answers not, which told an admin path
 *    apart from any other unknown URL.
 *  - HSTS (production) is the default value; on a host whose class needs another one (the platform host in S
 *    mode) the proxy overrides it on everything it forwards, and unknownPageHeaders(cls) gives the same set.
 */
export const UNKNOWN_PAGE_HEADERS: Record<string, string> = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate, no-transform",
  Vary: "rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Content-Security-Policy": UNKNOWN_PAGE_CSP,
  ...(IS_PROD ? { "Strict-Transport-Security": hstsValue(null) } : {}),
};

/** UNKNOWN_PAGE_HEADERS with the HSTS value of this host class (what the proxy sends on that host). */
export function unknownPageHeaders(cls?: HostClass | null): Record<string, string> {
  if (!IS_PROD) return { ...UNKNOWN_PAGE_HEADERS };
  return { ...UNKNOWN_PAGE_HEADERS, "Strict-Transport-Security": hstsValue(cls) };
}

const RETRY_AFTER_SEC = 30;

/** The 503 set: UNKNOWN_PAGE_HEADERS + Retry-After (never cached, never indexed, never re-encoded). */
export function unavailablePageHeaders(opts: { retryAfterSec?: number; cls?: HostClass | null } = {}): Record<string, string> {
  const seconds = Math.max(1, Math.min(3600, Math.round(opts.retryAfterSec ?? RETRY_AFTER_SEC)));
  return { ...unknownPageHeaders(opts.cls), "Retry-After": String(seconds) };
}

/** The host class of a request, for the HSTS value of a neutral answer produced outside the proxy matcher. */
const classOf = (headers?: Headers) => (headers ? effectiveHost(headers).cls : null);

/**
 * The public 404 for a request with this method: the HTML document for GET, an empty body for every
 * other method (HEAD, POST, OPTIONS…), exactly as the proxy answers un-gated admin requests. Handlers outside
 * the proxy matcher (the upload endpoints, /media) pass `headers` so the HSTS value matches their host class.
 */
export function unknownPageResponse(method: string, headers?: Headers): Response {
  return new Response(method === "GET" ? UNKNOWN_PAGE_HTML : null, { status: 404, headers: unknownPageHeaders(classOf(headers)) });
}

/** The neutral 410 (deleted handle within its reservation, paused short link), same headers as the 404. */
export function gonePageResponse(method: string, headers?: Headers): Response {
  return new Response(method === "GET" ? GONE_PAGE_HTML : null, { status: 410, headers: unknownPageHeaders(classOf(headers)) });
}

/** The neutral 503 (store backend unreachable). */
export function unavailablePageResponse(method: string, headers?: Headers, retryAfterSec?: number): Response {
  return new Response(method === "GET" ? UNAVAILABLE_PAGE_HTML : null, {
    status: 503,
    headers: unavailablePageHeaders({ retryAfterSec, cls: classOf(headers) }),
  });
}
