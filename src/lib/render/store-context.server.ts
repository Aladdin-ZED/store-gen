import "server-only";
/**
 * The store render context (docs/STORE-SAAS.md §H.3, §H.13, §C.6, §C.9; PUB-06 … PUB-17): everything a store's
 * documents are rendered with, read for that store at render time, never from another store or the process.
 *
 *   const rc = await loadStoreRenderContext(scope, store, { pageId, addons: { doc, mode: "live" } });
 *   const { resolver } = await storeAssetResolver(scope, rc, doc);
 *   renderLandingHtml(doc, { ...storeRenderOptions(rc, { slug, pageKey, assets: resolver }), ver });
 *   renderThankYouHtml(doc, storeRenderOptions(rc, { slug, pageKey, assets: resolver, page: "thanks" }));
 *
 *  - address: `storeBase` for in-page links, `storeOrigin` for canonical / og / JSON-LD, `mediaUrl` for media
 *    (relative `/media/<key>` in P mode, the platform origin in S / C modes, which the CSP then lists);
 *  - identity: `stores.name` (authoritative, D76), contacts and legal facts from the `store` setting, the logo from
 *    `brand.logo.primary` (DES-R16);
 *  - Turnstile: the store's own keys, else the platform widget (`platform_turnstile`, SET-09);
 *  - the endpoints: the public API (relative), without `lead` when the store's market and its `landing.leads.capture`
 *    turn lead capture off (P3's `leadCaptureOn`, LD11; P0b CCR P3-3); live, test and preview documents use them;
 *  - the render hook: `addons` for the landing document and `thanksAddons` for its thank-you document, from P3's
 *    `loadRenderAddons(scope, store, { pageId, doc, mode })` when the caller names the document (`opts.addons`; none
 *    otherwise and until P3 merges; P0b CCR P3-2), and `purchaseInBrowser` (the page's Purchase trigger,
 *    `triggerFor(conversions, pageId) === "order"`, OPE Q.6, OD18: false → the thank-you page carries no pixel; the
 *    server sends Purchase at the trigger). An add-on set reaches the renderer only when it is not empty
 *    (`hasAddons`), so a document with every add-on off keeps today's bytes (T3's rule).
 *
 * Settings come through T1's scoped API (`getStoreSettings`, `getPlatformSetting`). Serving stored HTML never needs
 * this module.
 */
import { and, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { assets } from "@/lib/db/schema";
import { leadCaptureOn } from "@/lib/landing/lead-capture";
import { triggerFor } from "@/lib/orders/conversions-core";
import type { PageDoc } from "@/lib/page/schema";
import { getPlatformSetting, getStoreSettings } from "@/lib/settings";
import { inStore } from "@/lib/tenancy/sql";
import type { StoreRow, StoreScope } from "@/lib/tenancy/types";
import { addressMode, mediaUrl, platformOrigin, reportUrl, storeBase, storeOrigin, storePath, type StoreAddress } from "@/lib/urls";
import { loadRenderAddons, type AddonMode } from "@/landing/addons/load.server";
import { noAddons, type RenderAddons } from "@/landing/addons/types";
import { collectAssetIds, rowAssetResolver, storePageLinks, type AssetResolver, type AssetRowLike, type StoreInfo } from "@/landing/context";
import type { PageLinks } from "@/landing/types";
import type { DocumentUrls } from "@/landing/document";
import { originOf } from "./csp";

/** Public API endpoints the landing runtime calls: relative, so they work on every host the store owns (§C.6). */
export const PUBLIC_ENDPOINTS = {
  order: "/api/public/order",
  lead: "/api/public/lead",
  event: "/api/public/event",
  upsell: "/api/public/upsell",
} as const;

export interface StoreRenderContext {
  store: StoreRow;
  address: StoreAddress;
  /** "/s/<handle>" in P mode, "" on the store's own host */
  base: "" | `/s/${string}`;
  /** absolute canonical origin (canonical, og:url, JSON-LD); undefined while PLATFORM_URL is unset (dev) */
  origin?: string;
  /** where media is loaded from when not the document's own origin (S / C modes) */
  mediaOrigins: string[];
  info: StoreInfo;
  turnstileSiteKey?: string;
  /** the runtime's public API: PUBLIC_ENDPOINTS, without `lead` when lead capture is off for the store */
  endpoints: DocumentUrls["endpoints"];
  /** the landing document's add-ons (the render hook, §H.13) */
  addons: RenderAddons;
  /** the thank-you document's add-ons */
  thanksAddons: RenderAddons;
  purchaseInBrowser: boolean;
}

/** Does an add-on set change the document? An empty one is never passed to the renderer (today's bytes, T3's rule). */
export function hasAddons(a: RenderAddons): boolean {
  return a.head.length > 0 || a.body.length > 0 || a.css.length > 0 || Object.keys(a.data).length > 0 || !!a.banner;
}

/** The address of a store row for the URL builders (C mode arrives with store_domains, R3). */
export function addressOf(store: StoreRow): StoreAddress {
  return { id: store.id, handle: store.handle, primaryDomain: store.primaryDomain };
}

/** "https://shop.ma" style origins only (dev without PLATFORM_URL: undefined, so no canonical is printed). */
function absoluteOrigin(value: string): string | undefined {
  return originOf(value) ?? undefined;
}

type StoreSettings = Awaited<ReturnType<typeof getStoreSettings<"store" | "brand" | "turnstile" | "conversions" | "landing">>>;

/** Store identity for documents (sanitized again by storeContext() in the renderer). */
export function storeInfoOf(store: StoreRow, s: Pick<StoreSettings, "store" | "brand">): StoreInfo {
  const v = s.store;
  const socials = Object.fromEntries(Object.entries(v.socials ?? {}).filter((e): e is [string, string] => typeof e[1] === "string" && !!e[1]));
  const logo = s.brand.logo.primary;
  return {
    name: store.name,
    country: v.country,
    ...(v.legalName ? { legalName: v.legalName } : {}),
    ...(v.phone ? { phone: v.phone } : {}),
    ...(v.whatsapp ? { whatsapp: v.whatsapp } : {}),
    ...(v.email ? { email: v.email } : {}),
    ...(v.address ? { address: v.address } : {}),
    ...(v.city ? { city: v.city } : {}),
    ...(v.ice ? { ice: v.ice } : {}),
    ...(v.rc ? { rc: v.rc } : {}),
    ...(logo ? { logo: { id: logo, alt: "" } } : {}),
    ...(Object.keys(socials).length ? { socials } : {}),
  };
}

/** The page's Purchase trigger (P5's `triggerFor`, the one rule) is "order": the browser fires it. */
export function purchaseInBrowserFor(conversions: StoreSettings["conversions"], pageId: string | null): boolean {
  return triggerFor(conversions, pageId) === "order";
}

/** The public API a store document calls: every endpoint, `lead` only while lead capture is on (LD11). */
export function storeEndpoints(store: Pick<StoreRow, "market">, landing: StoreSettings["landing"]): DocumentUrls["endpoints"] {
  if (leadCaptureOn(store.market, landing.leads.capture)) return PUBLIC_ENDPOINTS;
  return { order: PUBLIC_ENDPOINTS.order, event: PUBLIC_ENDPOINTS.event, upsell: PUBLIC_ENDPOINTS.upsell };
}

/**
 * The render context of one store, now (§H.3: re-renders use the context of now, never the one of the first
 * publish). `pageId` picks the page's Purchase trigger; `addons` names the document being rendered and its render
 * path, and loads its add-ons (without it the context carries none: legal documents render no add-on).
 */
export async function loadStoreRenderContext(
  scope: StoreScope,
  store: StoreRow,
  opts: { pageId?: string | null; addons?: { doc: PageDoc; mode: AddonMode } } = {},
): Promise<StoreRenderContext> {
  if (scope.storeId !== store.id) throw new Error("render: the scope and the store row disagree");
  const address = addressOf(store);
  const pageId = opts.pageId ?? null;
  const [s, set] = await Promise.all([
    getStoreSettings(scope, ["store", "brand", "turnstile", "conversions", "landing"] as const),
    opts.addons ? loadRenderAddons(scope, store, { pageId, doc: opts.addons.doc, mode: opts.addons.mode }) : null,
  ]);
  const own = s.turnstile.siteKey && s.turnstile.secretKey ? s.turnstile.siteKey : undefined;
  let siteKey = own;
  if (!siteKey) {
    const platform = await getPlatformSetting("platform_turnstile");
    siteKey = platform.siteKey && platform.secretKey ? platform.siteKey : undefined;
  }
  const mode = addressMode(address);
  const media = mode === "P" ? undefined : absoluteOrigin(platformOrigin());
  return {
    store,
    address,
    base: storeBase(address),
    origin: absoluteOrigin(storeOrigin(address)),
    mediaOrigins: media ? [media] : [],
    info: storeInfoOf(store, s),
    ...(siteKey ? { turnstileSiteKey: siteKey } : {}),
    endpoints: storeEndpoints(store, s.landing),
    addons: set?.landing ?? noAddons(),
    thanksAddons: set?.thanks ?? noAddons(),
    purchaseInBrowser: purchaseInBrowserFor(s.conversions, pageId),
  };
}

/** The store's own asset rows among `ids` (another store's id finds nothing: §E.3 rule 5, PUB-07). */
export async function storeAssetRows(scope: StoreScope, ids: readonly string[]): Promise<(typeof assets.$inferSelect)[]> {
  const wanted = [...new Set(ids.filter((id) => typeof id === "string" && /^[a-f0-9]{16,64}$/.test(id)))];
  const out: (typeof assets.$inferSelect)[] = [];
  for (let i = 0; i < wanted.length; i += 500) {
    out.push(...(await db.select().from(assets).where(and(inStore(assets, scope), inArray(assets.id, wanted.slice(i, i + 500))))));
  }
  return out;
}

/** An asset resolver for a store document: media URLs through `mediaUrl` (relative in P mode, absolute in S / C). */
export function storeResolver(address: StoreAddress, rows: Iterable<AssetRowLike>): AssetResolver {
  return rowAssetResolver(rows, (key) => mediaUrl(address, key));
}

/** The resolver for every asset the document and the store logo reference, from the store's own rows. */
export async function storeAssetResolver(scope: StoreScope, rc: StoreRenderContext, doc: PageDoc): Promise<{ resolver: AssetResolver; rows: (typeof assets.$inferSelect)[] }> {
  const rows = await storeAssetRows(scope, collectAssetIds(doc, [rc.info.logo]));
  return { resolver: storeResolver(rc.address, rows), rows };
}

/** Where a page and its thank-you page live in the store (relative paths; the runtime posts to relative endpoints). */
export function storeDocumentUrls(rc: Pick<StoreRenderContext, "address">, slug: string, endpoints: DocumentUrls["endpoints"] = PUBLIC_ENDPOINTS): DocumentUrls {
  return { landing: storePath(rc.address, `/${slug}`), thankYou: storePath(rc.address, `/${slug}/merci`), endpoints };
}

/**
 * The "Report this store" URL of a served store document (docs/STORE-SAAS.md D76, §C.6, CRIT15): `reportUrl(store,
 * path)` with the document's own path, never its query: the landing "<base>/<slug>", the thank-you
 * "<base>/<slug>/merci", a legal page "<base>/policies/<kind>". Live, test and preview renders carry it as
 * `links.report`; exports never call this, so their documents carry no link.
 */
export function storeReportUrl(rc: Pick<StoreRenderContext, "address">, path: `/${string}`): string {
  return reportUrl(rc.address, storePath(rc.address, path));
}

/** The thank-you page's links: the landing page's, with its own report path (the thank-you path without `?o=`). */
export function thankYouLinks(rc: Pick<StoreRenderContext, "address" | "base">, slug: string): PageLinks {
  return storePageLinks(rc.base, slug, storeReportUrl(rc, `/${slug}/merci`));
}

/**
 * The renderer options of a live store document (the caller adds `ver`, and the test-render overrides): the landing
 * document's by default, the thank-you document's with `page: "thanks"` (its own report path and add-ons).
 */
export function storeRenderOptions(rc: StoreRenderContext, input: { slug: string; pageKey: string; assets: AssetResolver; page?: "landing" | "thanks" }) {
  const thanks = input.page === "thanks";
  const addons = thanks ? rc.thanksAddons : rc.addons;
  return {
    mode: "live" as const,
    assets: input.assets,
    pageKey: input.pageKey,
    store: rc.info,
    urls: storeDocumentUrls(rc, input.slug, rc.endpoints),
    links: thanks ? thankYouLinks(rc, input.slug) : storePageLinks(rc.base, input.slug, storeReportUrl(rc, `/${input.slug}`)),
    origin: rc.origin,
    turnstileSiteKey: rc.turnstileSiteKey,
    mediaOrigins: rc.mediaOrigins,
    // the render hook: passed only when it changes something, so a hook-free document keeps today's bytes
    ...(hasAddons(addons) ? { addons } : {}),
    ...(rc.purchaseInBrowser ? {} : { purchaseInBrowser: false }),
  };
}
