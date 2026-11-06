import "server-only";
/**
 * `GET <base>/go/<code>` (P3 LANDING; landing.md LAN-§12.1, §12.3, LD14; docs/STORE-SAAS.md §C.4.1, §F.6, §A.5.2):
 * the request logic behind the thin route file src/app/s/[store]/go/[code]/route.ts, runnable without Next's request
 * scope.
 *
 * Order of answers: the host class (platform, store, legacy; else the neutral 404), the handle (unknown → 404, a
 * deleted store's → the neutral 410), the store state (a pending, closed or rejected store → the neutral 404 like every
 * public route; a suspended one with its notice → 503), then the link of THIS store by code:
 *   unknown code, or a target that no longer resolves   → the store's 404 (never a redirect)
 *   paused                                               → 410, the store's "This link is no longer active" page with a
 *                                                          link to the store home (`private, no-store`, noindex)
 *   active and resolved                                  → 308, `Location` = storeUrl(store, path) + the query rule,
 *                                                          `Cache-Control: private, no-store`, no Set-Cookie
 * The Location is the store's canonical origin built from the configuration (never from the request), so a renamed
 * handle or a legacy host lands on the canonical page in one hop, and in S mode it starts with
 * `https://<handle>.<root>/`. One click is counted in memory (./clicks.ts) and written by `links.flush`.
 */
import { createHash } from "node:crypto";
import { effectiveHost } from "@/lib/edge/host";
import { LP, shopperLocaleOf } from "@/lib/landing/copy";
import { errorSummary } from "@/lib/orders/log";
import { documentResponse, goneResponse, notFoundResponse, permanentRedirect, unavailableResponse } from "@/lib/render/serve.server";
import { addressOf } from "@/lib/render/store-context.server";
import { publicScope, publicStoreAnswer, resolveStoreHandle, type StoreHandleLookup } from "@/lib/tenancy/public";
import type { StoreRow } from "@/lib/tenancy/types";
import { storeUrl, type StoreAddress } from "@/lib/urls";
import { flushStoreIfDue, recordClick } from "./clicks";
import { isLinkCode } from "./codes";
import { linkQuery, rawQueryOf } from "./query";
import { linkByCode } from "./service.server";
import { resolveLinkTarget, type StoreRelativePath } from "./target";

export interface GoRouteDeps {
  /** the handle as the route resolved it first (lint L13), or "error" when that lookup threw */
  found?: StoreHandleLookup | null | "error";
  /** Next's `after()`: the click flush must not delay the redirect */
  defer?: (task: () => Promise<void>) => void;
  now?: number;
}

const log = (what: string, err: unknown) => console.error(`[go] ${what}:`, errorSummary(err));

/** The redirect's Location: the store's canonical URL of `path` plus the query (no other producer of it exists). */
export function goLocation(store: StoreAddress, path: StoreRelativePath, query: string): string {
  const base = storeUrl(store, path);
  return query ? `${base}?${query}` : base;
}

export async function serveGo(req: Request, handleParam: string, codeParam: string, deps: GoRouteDeps = {}): Promise<Response> {
  const eff = effectiveHost(req.headers);
  if (eff.cls !== "platform" && eff.cls !== "store" && eff.cls !== "legacy") return notFoundResponse(req);
  let found = deps.found;
  if (found === undefined) {
    try {
      found = await resolveStoreHandle(handleParam.toLowerCase());
    } catch (err) {
      log("handle lookup failed", err);
      found = "error";
    }
  }
  if (found === "error") return unavailableResponse(req);
  if (!found) return notFoundResponse(req);
  if (found.kind === "gone") return goneResponse(req);
  const store = found.store;
  try {
    const answer = await publicStoreAnswer(store);
    if (answer === "not_found") return notFoundResponse(req);
    if (answer === "unavailable") return unavailableResponse(req, 86_400);
    // a route param is a string; anything else (a hand-built call) is an unknown code
    const code = typeof codeParam === "string" ? codeParam.toLowerCase() : "";
    if (!isLinkCode(code)) return notFoundResponse(req);
    const scope = publicScope(store);
    const link = await linkByCode(scope, code);
    if (!link) return notFoundResponse(req);
    const address = addressOf(store);
    if (link.status === "paused") return inactiveResponse(req, store, address);
    const path = await resolveLinkTarget(scope, link, { mode: store.mode });
    if (!path) return notFoundResponse(req);

    recordClick(store.id, link.id, deps.now);
    const flush = () => flushStoreIfDue(scope, deps.now);
    if (deps.defer) deps.defer(flush);
    else void flush();

    const res = permanentRedirect(req, goLocation(address, path, linkQuery(link.utm, rawQueryOf(req.url))));
    // LD14: a 308 kept out of every cache, so the owner may still change the target
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  } catch (err) {
    log("go route failed", err);
    return unavailableResponse(req);
  }
}

/* ------------------------------------------------------------------ */
/* The paused link's page (410)                                        */
/* ------------------------------------------------------------------ */

const STYLE =
  ":root{--bg:#f7f8f9;--ink:#16181b;--soft:#5f6670;--line:#e3e6ea;--accent:#1d2433;--accent-ink:#fff}" +
  "@media (prefers-color-scheme:dark){:root{--bg:#121315;--ink:#eceef0;--soft:#9aa1aa;--line:#2a2d31;--accent:#e8ebf0;--accent-ink:#121315}}" +
  "*{box-sizing:border-box}html,body{margin:0;min-height:100%}body{display:grid;place-items:center;min-height:100vh;min-height:100dvh;padding:24px;" +
  "background:var(--bg);color:var(--ink);font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,'Noto Sans Arabic',Tahoma,sans-serif;" +
  "line-height:1.5;-webkit-font-smoothing:antialiased}main{width:100%;max-width:30rem;text-align:center}" +
  "p.n{margin:0;color:var(--soft);font-size:.9375rem;font-weight:550}h1{margin:.5rem 0 0;font-size:clamp(1.5rem,5.5vw,2rem);font-weight:650;" +
  "letter-spacing:-.015em;line-height:1.2;text-wrap:balance}hr{width:3rem;margin:1.5rem auto;border:0;border-top:1px solid var(--line)}" +
  "a{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 1.25rem;border-radius:999px;background:var(--accent);" +
  "color:var(--accent-ink);font-weight:600;font-size:.9375rem;text-decoration:none}a:focus-visible{outline:2px solid var(--accent);outline-offset:3px}";
const styleHash = `'sha256-${createHash("sha256").update(STYLE, "utf8").digest("base64")}'`;
const CSP = `default-src 'none'; style-src ${styleHash}; img-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`;
const htmlEscape = (s: string) => s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** The neutral "This link is no longer active" document of a store (static, no script). */
export function inactiveHtml(store: Pick<StoreRow, "name" | "defaultLocale">, homeUrl: string): string {
  const locale = shopperLocaleOf(store.defaultLocale);
  const copy = LP[locale];
  const name = htmlEscape(store.name.trim() || "—");
  return (
    `<!DOCTYPE html><html lang="${locale}" dir="${locale === "ar" ? "rtl" : "ltr"}"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow">` +
    `<meta name="color-scheme" content="light dark"><title>${name}</title><style>${STYLE}</style></head>` +
    `<body><main><p class="n">${name}</p><h1>${htmlEscape(copy.linkInactive)}</h1><hr><a href="${htmlEscape(homeUrl)}">${htmlEscape(copy.linkHome)}</a></main></body></html>`
  );
}

async function inactiveResponse(req: Request, store: StoreRow, address: StoreAddress): Promise<Response> {
  const html = inactiveHtml(store, storeUrl(address, "/"));
  // the thank-you class (`private, no-store`, noindex), answered as 410
  const ok = await documentResponse(req, { html, csp: CSP }, { kind: "thanks", store: address });
  return new Response(ok.body, { status: 410, headers: ok.headers });
}
