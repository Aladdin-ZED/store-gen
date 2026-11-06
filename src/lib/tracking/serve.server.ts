import "server-only";
/**
 * `GET <base>/track` (P3 LANDING; landing.md LAN-§9.1, §9.4, §3.9; docs/STORE-SAAS.md §C.1, §C.4, §F.6): the request
 * logic behind the thin route file src/app/s/[store]/track/route.ts, runnable without Next's request scope.
 *
 * Order of answers, as every store route (src/lib/render/store-routes.server.ts): the host class (platform, store,
 * legacy; else the neutral 404), the handle (unknown 404, deleted 410, renamed 308), the store state (§A.5.3), the
 * canonical address (308 with the raw query, byte for byte), then the document:
 *   ?o=<id>&s=<signed>  the status, server-rendered (works without script); a forged or expired `s`, an unknown
 *                       order or another store's order: the lookup form with the not-found notice, status 404
 *   ?o=<id>             the lookup form with the id filled (the thank-you's proof link carries `#k=` for the chunk)
 *   nothing             the lookup form
 * Headers: the thank-you class of `documentResponse` (`private, no-store`, `noindex, nofollow`, `no-referrer`, the hash
 * CSP narrowed to the serving origin's public API). The document never writes: opening it changes no row.
 */
import { createElement } from "react";
import { addonChunks, addonCss } from "@/landing/generated/assets";
import { createT } from "@/landing/i18n";
import { legalNav } from "@/landing/legal";
import { isRealStoreName, storePageLinks } from "@/landing/context";
import { effectiveHost } from "@/lib/edge/host";
import { shopperLocaleOf, TRK, type ShopperLocale } from "@/lib/landing/copy";
import { errorSummary } from "@/lib/orders/log";
import { inlineHashes } from "@/lib/render/core";
import { buildLandingCsp } from "@/lib/render/csp";
import { whatsappDigits, whatsappNumber } from "@/lib/render/config";
import { documentResponse, goneResponse, notFoundResponse, permanentRedirect, unavailableResponse } from "@/lib/render/serve.server";
import { addressOf, loadStoreRenderContext, storeAssetRows, storeResolver } from "@/lib/render/store-context.server";
import { isCanonicalHost } from "@/lib/render/store-routes.server";
import { publicScope, publicStoreAnswer, resolveOrderForTracking, resolveStoreHandle, type StoreHandleLookup } from "@/lib/tenancy/public";
import type { StoreRow, StoreScope } from "@/lib/tenancy/types";
import { buildTheme, fontFaceCss, fontPreloads } from "@/lib/theme";
import { reportUrl, storePath, storeUrl, type StoreAddress } from "@/lib/urls";
import { ORDER_ID_RE, SIGNED_RE, type TrackData } from "./contract";
import { TrackDocument, type TrackDocumentProps, type TrackState } from "./document";
import { lookupDocSource, orderDocSource, type TrackDocSource } from "./page.server";
import { buildTrackView, loadTrackOrder, storeTimeZone } from "./view.server";

/** The tokens of a store without any published page (the brand defaults): quiet neutrals, light and dark. */
const NEUTRAL_TOKENS =
  ":root{--lp-bg:#f7f8f9;--lp-ink:#16181b;--lp-ink-soft:#4b525b;--lp-ink-mute:#6b7280;--lp-line:#e2e5e9;--lp-soft:#eef0f3;" +
  "--lp-accent:#1d2433;--lp-accent-ink:#ffffff;--lp-accent-soft:#e6e9ef;--lp-font-body:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,'Noto Sans Arabic',sans-serif;" +
  "--lp-font-display:var(--lp-font-body)}" +
  "@media (prefers-color-scheme:dark){:root{--lp-bg:#111214;--lp-ink:#eceef1;--lp-ink-soft:#b3b9c2;--lp-ink-mute:#8b929c;--lp-line:#2a2e34;--lp-soft:#191b1f;" +
  "--lp-accent:#e8ebf0;--lp-accent-ink:#111214;--lp-accent-soft:#23272e}}";

const guardCss = (css: string) => css.replace(/<\/(style)/gi, "<\\/$1");
const log = (what: string, err: unknown) => console.error(`[track] ${what}:`, errorSummary(err));

/** The raw query of the request ("" or "?…"), exactly as the client sent it. */
function rawQuery(req: Request): string {
  const url = req.url;
  const q = url.indexOf("?");
  if (q < 0) return "";
  const hash = url.indexOf("#", q);
  const search = hash < 0 ? url.slice(q) : url.slice(q, hash);
  return search === "?" ? "" : search;
}

interface RenderInput {
  scope: StoreScope;
  store: StoreRow;
  address: StoreAddress;
  source: TrackDocSource | null;
  state: (locale: ShopperLocale, whatsapp: string | null) => Promise<TrackState>;
  signed?: { o: string; s: string };
}

/** The document and its hash CSP. */
export async function renderTrackDocument(input: RenderInput): Promise<{ html: string; csp: string }> {
  const { scope, store, address, source } = input;
  const locale = shopperLocaleOf(source?.doc.locale ?? store.defaultLocale);
  const [rc, tz] = await Promise.all([loadStoreRenderContext(scope, store, { pageId: source?.pageId ?? null }), storeTimeZone(scope)]);
  const whatsapp = source ? whatsappNumber(source.doc, rc.info.whatsapp) : whatsappDigits(rc.info.whatsapp, rc.info.country ?? "MA");
  const state = await input.state(locale, whatsapp);

  const theme = source ? buildTheme(source.doc.theme, locale) : null;
  const own = addonCss.track ?? "";
  const css = guardCss((theme ? [fontFaceCss(theme.fontIds, locale, "/"), theme.css, own] : [NEUTRAL_TOKENS, own]).filter((p) => p && p.trim()).join("\n"));
  const rows = rc.info.logo ? await storeAssetRows(scope, [rc.info.logo.id]) : [];
  const resolver = storeResolver(address, rows);
  const logo = rc.info.logo ? resolver.url(rc.info.logo, 320) : null;
  const icon = rc.info.logo ? resolver.url(rc.info.logo, 64) : null;
  const name = isRealStoreName(rc.info.name) ? rc.info.name.trim() : (source?.doc.product.name.trim() ?? "");
  const t = createT(locale);
  const trackPath = storePath(address, "/track");
  const c = TRK[locale];
  const data: TrackData = {
    ep: "/api/public/track",
    path: trackPath,
    ...(input.signed ? { o: input.signed.o, s: input.signed.s } : {}),
    msg: { notFound: c.notFound, rateLimited: c.rateLimited, closed: c.closed, error: c.error, sent: c.sent, requested: c.requested },
  };
  const props: TrackDocumentProps = {
    locale,
    dir: locale === "ar" ? "rtl" : "ltr",
    storeName: name,
    homeHref: storePath(address, "/"),
    logo: logo ? { src: logo.url, alt: name } : null,
    icon: icon ? { href: icon.url, type: icon.mime } : null,
    themeColor: theme && /^#[0-9a-fA-F]{6}$/.test(theme.tokens["lp-bg"] ?? "") ? theme.tokens["lp-bg"]! : null,
    colorScheme: theme ? theme.scheme : "light dark",
    css,
    preloads: theme ? fontPreloads(theme.fontIds, locale, "/", theme.fontWeights) : [],
    state,
    data,
    script: addonChunks.track || null,
    tz,
    legal: source ? legalNav({ t, links: storePageLinks(rc.base, source.slug) }) : [],
    // LAN-§3.9: the document's path without its query (never `?o=` or `s=`)
    report: { href: reportUrl(address, trackPath), label: t("footer.report") },
    trackPath,
  };
  const { renderToStaticMarkup } = await import("react-dom/server");
  const html = `<!DOCTYPE html>${renderToStaticMarkup(createElement(TrackDocument, props))}`;
  const { scripts, styles } = inlineHashes(html);
  const csp = buildLandingCsp({
    mode: "live",
    scriptHashes: scripts,
    styleHashes: styles,
    pixels: {},
    mediaOrigins: rc.mediaOrigins,
    upgradeInsecureRequests: process.env.NODE_ENV === "production" && /^https:\/\//i.test(process.env.PUBLIC_URL ?? "https://"),
  });
  return { html, csp };
}

/** A view is "closed" for requests once the parcel left: the note replaces the request list. */
const closedFor = (current: string) => current === "shipped" || current === "out_for_delivery";

async function document(req: Request, scope: StoreScope, store: StoreRow, address: StoreAddress): Promise<Response> {
  const url = new URL(req.url);
  const o = url.searchParams.get("o");
  const s = url.searchParams.get("s");
  const id = o && ORDER_ID_RE.test(o) ? o : null;
  const lookup = async (notice: "not_found" | null) => {
    const source = await lookupDocSource(scope, store);
    const doc = await renderTrackDocument({ scope, store, address, source, state: async (_l, whatsapp) => ({ kind: "lookup", o: id, notice, whatsapp }) });
    const res = await documentResponse(req, { html: doc.html, csp: doc.csp }, { kind: "thanks", store: address });
    return notice ? new Response(res.body, { status: 404, headers: res.headers }) : res;
  };
  if (!id || s === null) return lookup(null);
  // a signed link: the store of the URL must be the order's (A's link under B's handle is B's not-found)
  const target = SIGNED_RE.test(s) ? await resolveOrderForTracking(id, s) : null;
  const order = target && target.store.id === store.id ? await loadTrackOrder(scope, id) : null;
  if (!order) return lookup("not_found");
  const source = await orderDocSource(scope, store, order);
  const doc = await renderTrackDocument({
    scope,
    store,
    address,
    source,
    signed: { o: id, s },
    state: async (locale) => {
      const view = await buildTrackView(scope, order, { locale, doc: source?.doc ?? null });
      return { kind: "view", view, closed: closedFor(view.current) };
    },
  });
  return documentResponse(req, { html: doc.html, csp: doc.csp }, { kind: "thanks", store: address });
}

export interface TrackRouteDeps {
  /** the handle as the route resolved it first (`resolveStoreByHandle(params.store, { detail: true })`, lint L13), or "error" */
  found?: StoreHandleLookup | null | "error";
}

/** Serve `GET <base>/track` (the route file answers every other method with the neutral 404). */
export async function serveTrack(req: Request, handleParam: string, deps: TrackRouteDeps = {}): Promise<Response> {
  const eff = effectiveHost(req.headers);
  if (eff.cls !== "platform" && eff.cls !== "store" && eff.cls !== "legacy") return notFoundResponse(req);
  const handle = handleParam.toLowerCase();
  let found = deps.found;
  if (found === undefined) {
    try {
      found = await resolveStoreHandle(handle);
    } catch (err) {
      log("handle lookup failed", err);
      found = "error";
    }
  }
  if (found === "error") return unavailableResponse(req);
  if (!found) return notFoundResponse(req);
  if (found.kind === "gone") return goneResponse(req);
  const store = found.store;
  const address = addressOf(store);
  try {
    const answer = await publicStoreAnswer(store);
    if (answer === "not_found") return notFoundResponse(req);
    if (answer === "unavailable") return unavailableResponse(req, 86_400);
    if (!(found.kind === "current" && handle === handleParam && isCanonicalHost(eff, address))) {
      return permanentRedirect(req, storeUrl(address, "/track") + rawQuery(req));
    }
    return await document(req, publicScope(store), store, address);
  } catch (err) {
    log("track route failed", err);
    return unavailableResponse(req);
  }
}

