import "server-only";
/**
 * The store render context (docs/STORE-SAAS.md §H.3, §H.13, §C.6, §C.9; PUB-06 … PUB-17): everything a store's
 * documents are rendered with, read for that store at render time, never from another store or the process.
 *
 *   const rc = await loadStoreRenderContext(scope, store, { pageId });
 *   const assets = await storeAssetResolver(scope, rc, doc);
 *   renderLandingHtml(doc, { ...renderOptionsFor(rc, { slug, pageKey, assets }), ver });
 *
 *  - address: `storeBase` for in-page links, `storeOrigin` for canonical / og / JSON-LD, `mediaUrl` for media
 *    (relative `/media/<key>` in P mode, the platform origin in S / C modes, which the CSP then lists);
 *  - identity: `stores.name` (authoritative, D76), contacts and legal facts from the `store` setting, the logo from
 *    `brand.logo.primary` (DES-R16);
 *  - Turnstile: the store's own keys, else the platform widget (`platform_turnstile`, SET-09);
 *  - the render hook: `addons` (none until P3's `addonsFor`) and `purchaseInBrowser` (the `conversions` trigger of
 *    the page, OPE Q.6: false → the thank-you page carries no pixel; the server sends Purchase at the trigger).
 *
 * Settings come through T1's scoped API (`getStoreSettings`, `getPlatformSetting`); until T1 merges those are the
 * C0a stubs and a render answers `server`. Serving stored HTML never needs this module.
 */
import { and, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { assets } from "@/lib/db/schema";
import type { PageDoc } from "@/lib/page/schema";
import { getPlatformSetting, getStoreSettings } from "@/lib/settings";
import { inStore } from "@/lib/tenancy/sql";
import type { StoreRow, StoreScope } from "@/lib/tenancy/types";
import { addressMode, mediaUrl, platformOrigin, storeBase, storeOrigin, storePath, type StoreAddress } from "@/lib/urls";
import { noAddons, type RenderAddons } from "@/landing/addons/types";
import { collectAssetIds, rowAssetResolver, storePageLinks, type AssetResolver, type AssetRowLike, type StoreInfo } from "@/landing/context";
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
  addons: RenderAddons;
  purchaseInBrowser: boolean;
}

/** The address of a store row for the URL builders (C mode arrives with store_domains, R3). */
export function addressOf(store: StoreRow): StoreAddress {
  return { id: store.id, handle: store.handle, primaryDomain: store.primaryDomain };
}

/** "https://shop.ma" style origins only (dev without PLATFORM_URL: undefined, so no canonical is printed). */
function absoluteOrigin(value: string): string | undefined {
  return originOf(value) ?? undefined;
}

type StoreSettings = Awaited<ReturnType<typeof getStoreSettings<"store" | "brand" | "turnstile" | "conversions">>>;

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

/** The page's Purchase trigger (`conversions.pageOverrides[pageId] ?? purchaseTrigger`) is "order": the browser fires it. */
export function purchaseInBrowserFor(conversions: StoreSettings["conversions"], pageId: string | null): boolean {
  const trigger = (pageId ? conversions.pageOverrides[pageId] : undefined) ?? conversions.purchaseTrigger;
  return trigger === "order";
}

/**
 * The render context of one store, now (§H.3: re-renders use the context of now, never the one of the first
 * publish). `pageId` picks the page's Purchase trigger.
 */
export async function loadStoreRenderContext(scope: StoreScope, store: StoreRow, opts: { pageId?: string | null } = {}): Promise<StoreRenderContext> {
  if (scope.storeId !== store.id) throw new Error("render: the scope and the store row disagree");
  const address = addressOf(store);
  const s = await getStoreSettings(scope, ["store", "brand", "turnstile", "conversions"] as const);
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
    addons: noAddons(),
    purchaseInBrowser: purchaseInBrowserFor(s.conversions, opts.pageId ?? null),
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

/** The renderer options of a live store document (the caller adds `ver`, and the test-render overrides). */
export function storeRenderOptions(rc: StoreRenderContext, input: { slug: string; pageKey: string; assets: AssetResolver }) {
  return {
    mode: "live" as const,
    assets: input.assets,
    pageKey: input.pageKey,
    store: rc.info,
    urls: storeDocumentUrls(rc, input.slug),
    links: storePageLinks(rc.base, input.slug),
    origin: rc.origin,
    turnstileSiteKey: rc.turnstileSiteKey,
    mediaOrigins: rc.mediaOrigins,
    // the render hook: passed only when it changes something, so a hook-free document keeps today's bytes
    ...(rc.addons.head.length || rc.addons.body.length || rc.addons.css.length || Object.keys(rc.addons.data).length || rc.addons.banner ? { addons: rc.addons } : {}),
    ...(rc.purchaseInBrowser ? {} : { purchaseInBrowser: false }),
  };
}
