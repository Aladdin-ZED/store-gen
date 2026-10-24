/**
 * Full landing documents (rendered to static HTML by src/lib/render):
 *
 *   <html lang dir data-arch… class="lp">
 *     <head> meta · SEO/OG/Twitter · theme-color · favicon · font preloads
 *            ONE <style> (font faces + theme tokens + base + used chunks)
 *            <script type="application/json" id="lp-config"> · JSON-LD Product </head>
 *     <body> sections … the runtime: its optional chunks (feature chunks, pixels, turnstile), then the
 *            core chunk — or, with a single-bundle build, ONE <script> </body>
 *
 * LandingDocument = the product page; ThankYouDocument = the confirmation page (noindex);
 * LegalDocument = privacy / terms / shipping / contact in the page's theme (noindex, no JavaScript).
 * Store identity and page links come from ctx (ctx.store, ctx.links).
 * Pure components: no hooks, no randomness — everything comes from the doc, ctx and options.
 *
 * The render hook (docs/STORE-SAAS.md §H.13, D62): `addons` embeds standalone add-on chunks (`head` scripts first
 * in <head>, `body` scripts after the core chunk), their JSON data blocks, extra CSS chunks and the test band
 * (`banner: "test"`, D54); `purchaseInBrowser: false` leaves the pixels out of the thank-you page (the server sends
 * Purchase at the store's trigger, OPE Q.6) and `pixels: false` out of both pages (test renders). A document
 * rendered without them is byte-identical to one rendered before the hook existed.
 */
import type { ReactElement, ReactNode } from "react";
import type { AddonChunk, RenderAddons } from "./addons/types";
import type { LandingRenderContext } from "./context";
import * as generatedAssets from "./generated/assets";
import { baseCss, legalCss, runtimeJs, sectionCss, thankYouCss } from "./generated/assets";
import { sectionChunkCss, sectionVariants } from "./generated/chunks";
import { LegalBody, legalLang, legalTitle, type LegalKind } from "./legal";
import { renderPageBody, usedSectionTypes, type PageBodyOptions } from "./page";
import { brandName, isPlaceholderStoreName, plainText } from "./primitives";
import { ThankYouBody } from "./thankyou/ThankYou";
import type { RenderMode } from "./types";
import { offersMath } from "@/lib/page/pricing";
import { offerAvailable } from "@/lib/page/catalog";
import { fromCents } from "@/lib/page/money";
import type { PageDoc } from "@/lib/page/schema";
import type { LandingRuntimeConfig, RuntimeFeature } from "./runtime/config";
import { buildRuntimeConfig, inlineJson, type RuntimeEndpoints } from "@/lib/render/config";
import { buildTheme, fontFaceCss, fontPreloads, type BuiltTheme } from "@/lib/theme";

export type { StoreInfo } from "./context";

export interface DocumentUrls {
  /** the product page (canonical, og:url, thank-you "back" link) */
  landing: string;
  /** the thank-you page (runtime appends ?o=<orderId>) */
  thankYou: string;
  endpoints: RuntimeEndpoints;
}

export interface DocumentProps {
  doc: PageDoc;
  ctx: LandingRenderContext;
  urls: DocumentUrls;
  /** absolute origin ("https://shop.ma") for canonical / OG / JSON-LD URLs; omit when unknown */
  origin?: string;
  /** runtime behavior; defaults to ctx.mode. "preview" keeps the runtime offline (QA renders). */
  runtimeMode?: RenderMode;
  /** Cloudflare Turnstile site key (the runtime renders the widget on product pages that send orders) */
  turnstileSiteKey?: string;
  /** QA screenshots: html.lp-qa with transitions/animations collapsed to their end state */
  qa?: boolean;
  /** publish version id embedded as config `ver` (§G.1); omitted in previews and exports */
  ver?: string;
  /** passed to renderPageBody (e.g. ids of sections that failed a render probe) */
  body?: PageBodyOptions;
  /**
   * What the rendered sections need from the stylesheet (src/lib/render probes every section).
   * Omitted: the complete stylesheet of every visible section's type (correct, heavier).
   */
  rendered?: RenderedCss;
  /** the add-ons this document embeds (§H.13); omitted or empty: today's bytes */
  addons?: RenderAddons;
  /** false: the thank-you page carries no pixel (the store's Purchase trigger is not "order") */
  purchaseInBrowser?: boolean;
  /** false: no pixel on either page (test renders, D54) */
  pixels?: boolean;
}

/** The stylesheet needs of a rendered page body. */
export interface RenderedCss {
  /** section types that rendered markup (hidden, empty and failed sections excluded) */
  types: ReadonlySet<string>;
  /** variant chunks ("<type>.<variant>") whose root modifier class the markup carries — variantChunksIn */
  variants: ReadonlySet<string>;
}

/** Collapses every transition/animation to its end state (screenshots). */
const QA_CSS =
  "html.lp-qa *,html.lp-qa *::before,html.lp-qa *::after{transition-duration:0s!important;transition-delay:0s!important;" +
  "animation-duration:0s!important;animation-delay:0s!important;animation-iteration-count:1!important;scroll-behavior:auto!important}";

const HEX6 = /^#[0-9a-fA-F]{6}$/;
const ATTR_NAME = /^data-[a-z][a-z0-9-]{0,40}$/;

/** `</style` inside the stylesheet would end the element. */
const guardCss = (css: string) => css.replace(/<\/(style)/gi, "<\\/$1");

/** Single inline stylesheet: font faces, theme tokens, base, then the requested chunks. */
export function documentCss(ctx: LandingRenderContext, theme: BuiltTheme, chunks: readonly string[], qa = false): string {
  const parts = [fontFaceCss(theme.fontIds, ctx.locale, ctx.base), theme.css, baseCss, ...chunks];
  if (qa) parts.push(QA_CSS);
  return guardCss(parts.filter((p) => p && p.trim()).join("\n"));
}

/** Root modifier class → its variant chunk: "lp-hero--stage" → "hero.stage". */
const VARIANT_CHUNK_OF_CLASS: ReadonlyMap<string, readonly [type: string, key: string]> = new Map(
  Object.entries(sectionVariants).flatMap(([type, ids]) => ids.map((id) => [`lp-${type}--${id}`, [type, `${type}.${id}`] as const] as const)),
);
const VARIANT_CHUNKS: ReadonlySet<string> = new Set([...VARIANT_CHUNK_OF_CLASS.values()].map(([, key]) => key));

const CLASS_ATTR = /\sclass="([^"]*)"/g;
/** A start tag carrying data-section (React escapes "<" and ">" inside attribute values). */
const SECTION_TAG = /<[a-zA-Z][^<>]*\sdata-section="[^"]*"[^<>]*>/g;
const SECTION_ATTR = /\sdata-section="([A-Za-z][A-Za-z0-9]{0,40})"/;
const VARIANT_ATTR = /\sdata-variant="([a-z0-9-]{1,40})"/;

/**
 * Variant chunks a piece of rendered markup needs: "<type>.<variant>" for every root modifier class
 * (lp-<type>--<variant>) it carries — the markup decides, not the doc: a section may fall back to
 * another variant than the saved one (unknown id, missing data). A type whose markup carries none of
 * its modifier classes is identified by its root's data-section + data-variant pair instead (roots
 * named after their own block, e.g. stickyCta's <aside class="lp-sticky lp-sticky--pill">).
 * Adds to `into` when given.
 */
export function variantChunksIn(markup: string, into: Set<string> = new Set()): Set<string> {
  if (!VARIANT_CHUNK_OF_CLASS.size) return into;
  const byClass = new Set<string>();
  for (const m of markup.matchAll(CLASS_ATTR)) {
    for (const token of m[1]!.split(/\s+/)) {
      const hit = VARIANT_CHUNK_OF_CLASS.get(token);
      if (!hit) continue;
      byClass.add(hit[0]);
      into.add(hit[1]);
    }
  }
  for (const m of markup.matchAll(SECTION_TAG)) {
    const type = SECTION_ATTR.exec(m[0])?.[1];
    const id = VARIANT_ATTR.exec(m[0])?.[1];
    const key = `${type}.${id}`;
    if (type && id && !byClass.has(type) && VARIANT_CHUNKS.has(key)) into.add(key);
  }
  return into;
}

/**
 * Section stylesheets of the page, in document order of first use, for each type that rendered:
 *   - a type without variant files: its stylesheet;
 *   - one variant of a split type (or none of its variant classes): "<type>" then "<type>.<variant>";
 *   - two or more variants of one type: the type's complete stylesheet — its variant files merged
 *     in cascade-safe order (concatenating two variant chunks could let a rule both variants share
 *     override the first variant's own later rules).
 * Without `rendered`: the complete stylesheet of every visible section's type.
 */
export function sectionChunks(doc: PageDoc, rendered?: RenderedCss): string[] {
  const out: string[] = [];
  const push = (css: string | undefined) => {
    if (css) out.push(css);
  };
  for (const type of usedSectionTypes(doc)) {
    if (rendered && !rendered.types.has(type)) continue;
    const ids = sectionVariants[type];
    if (!ids || !rendered) {
      push(sectionCss[type]);
      continue;
    }
    const used = ids.filter((id) => rendered.variants.has(`${type}.${id}`));
    if (used.length > 1) {
      push(sectionCss[type]);
      continue;
    }
    push(sectionChunkCss[type]);
    if (used.length === 1) push(sectionChunkCss[`${type}.${used[0]}`]);
  }
  return out;
}

/** theme.attrs filtered to safe data-* names. */
function htmlAttrs(theme: BuiltTheme): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(theme.attrs)) if (ATTR_NAME.test(k) && typeof v === "string") out[k] = v;
  return out;
}

function absolute(url: string | undefined | null, origin: string | undefined): string | undefined {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url)) return url;
  if (!origin) return undefined;
  try {
    return new URL(url, `${origin}/`).href;
  } catch {
    return undefined;
  }
}

const xmlEscape = (s: string) => s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * Store logo, or a monogram of the brand in the page accent (data: SVG — allowed by img-src): a soft
 * squircle with a top light, the initial set in the accent ink. Colors are theme tokens only.
 */
function faviconHref(ctx: LandingRenderContext, theme: BuiltTheme): { href: string; type: string } {
  const logo = ctx.store.logo ? ctx.assets.url({ id: ctx.store.logo.id, alt: "" }, 64) : null;
  if (logo) return { href: logo.url, type: logo.mime };
  const bg = HEX6.test(theme.tokens["lp-accent"] ?? "") ? theme.tokens["lp-accent"]! : HEX6.test(theme.tokens["lp-ink"] ?? "") ? theme.tokens["lp-ink"]! : "#1f1d1b";
  const ink = HEX6.test(theme.tokens["lp-accent-ink"] ?? "") ? theme.tokens["lp-accent-ink"]! : "#fbfaf8";
  const letter = Array.from(brandName(ctx).trim())[0]?.toLocaleUpperCase(ctx.locale) ?? "*";
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="l" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="#fff" stop-opacity=".18"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>` +
    `<rect width="64" height="64" rx="18" fill="${bg}"/><rect width="64" height="64" rx="18" fill="url(#l)"/>` +
    `<text x="32" y="43.5" text-anchor="middle" font-family="system-ui,-apple-system,Segoe UI,Arial,sans-serif" font-size="34" font-weight="600" fill="${ink}">${xmlEscape(letter)}</text></svg>`;
  return { href: `data:image/svg+xml,${encodeURIComponent(svg)}`, type: "image/svg+xml" };
}

/** <link rel="icon"> (no apple-touch-icon: renditions are WebP, which iOS home screens do not take). */
function IconLinks({ icon }: { icon: { href: string; type: string } }): ReactElement {
  return <link rel="icon" href={icon.href} type={icon.type} />;
}

function ogLocale(doc: PageDoc): string {
  const region = doc.market === "INTL" ? (doc.locale === "en" ? "US" : doc.locale.toUpperCase()) : doc.market;
  return `${doc.locale}_${region}`;
}

interface HeadMeta {
  title: string;
  description: string;
  canonical?: string;
  noindex: boolean;
  image?: { url: string; width: number; height: number; alt: string };
}

function seoMeta(doc: PageDoc, ctx: LandingRenderContext, urls: DocumentUrls, origin?: string): HeadMeta {
  const { product, seo } = doc;
  const tagline = product.tagline ? plainText(product.tagline) : "";
  const brand = brandName(ctx);
  const title =
    seo.title?.trim() || (tagline ? `${product.name} — ${tagline}` : brand === product.name.trim() ? product.name : `${product.name} — ${brand}`);
  const description =
    seo.description?.trim() || tagline || (product.description ? plainText(product.description).slice(0, 160).trim() : "") || product.name;
  const ref = seo.ogImage ?? product.images[0] ?? product.cutout;
  // og:image must be absolute: only resolved when the public origin is known (exports track used files)
  const img = ref && origin ? ctx.assets.url(ref, 1200) : null;
  const imgUrl = absolute(img?.url, origin);
  return {
    title,
    description,
    canonical: absolute(urls.landing, origin),
    noindex: seo.noindex,
    ...(img && imgUrl ? { image: { url: imgUrl, width: img.width, height: img.height, alt: ref?.alt || product.name } } : {}),
  };
}

/**
 * schema.org Product with real data only (no invented prices or ratings): one item → `Offer` at the
 * lead item's price (as before); 2+ items → `AggregateOffer` over the offers' card prices (`from`:
 * the lowest payable total of each available offer). Never an `aggregateRating`: no Store Gen page
 * carries one until verified reviews exist (docs/STORE-SAAS.md §C.8, ST-13, R3); rating fields of a
 * doc are a publish-gate item (§M.3), never structured data.
 */
function productJsonLd(doc: PageDoc, ctx: LandingRenderContext, meta: HeadMeta, origin?: string): Record<string, unknown> {
  const { product, offers } = doc;
  const images = origin
    ? [...product.images.slice(0, 4), ...(product.cutout ? [product.cutout] : [])]
        .map((r) => absolute(ctx.assets.url(r, 1200)?.url, origin))
        .filter((u): u is string => !!u)
    : [];
  const soldOut = offers.urgency.stockLeft === 0;
  const availability = soldOut ? "https://schema.org/OutOfStock" : "https://schema.org/InStock";
  let offer: Record<string, unknown> = {
    "@type": "Offer",
    price: ctx.lead.price.toFixed(2),
    priceCurrency: doc.currency,
    availability,
    itemCondition: "https://schema.org/NewCondition",
    ...(meta.canonical ? { url: meta.canonical } : {}),
  };
  if (doc.items.length > 1) {
    const maths = offersMath(doc);
    const prices = offers.bundles.filter((b) => offerAvailable(b, doc.items)).map((b) => maths[offers.bundles.indexOf(b)]!.from);
    const list = prices.length ? prices : maths.map((m) => m.from);
    offer = {
      "@type": "AggregateOffer",
      lowPrice: fromCents(Math.min(...list)).toFixed(2),
      highPrice: fromCents(Math.max(...list)).toFixed(2),
      offerCount: list.length,
      priceCurrency: doc.currency,
      availability: soldOut || !prices.length ? "https://schema.org/OutOfStock" : availability,
      itemCondition: "https://schema.org/NewCondition",
      ...(meta.canonical ? { url: meta.canonical } : {}),
    };
  }
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: meta.description,
    ...(images.length ? { image: [...new Set(images)] } : {}),
    ...(doc.items.length === 1 && ctx.lead.sku ? { sku: ctx.lead.sku } : {}),
    // a placeholder store name ("My store") is not a brand: leave it out rather than publish it
    ...(isPlaceholderStoreName(ctx.store.name) ? {} : { brand: { "@type": "Brand", name: ctx.store.name.trim() } }),
    offers: offer,
  };
}

/* ------------------------------------------------------------------ */
/* Runtime scripts (§F.9)                                              */
/* ------------------------------------------------------------------ */

/** Runtime chunks of a split build (scripts/build-landing-assets.mjs `runtimeChunks`), by name. */
export type RuntimeChunkName = "landing" | "thanks" | "pixels" | "turnstile" | "units-matrix" | "units-fields" | "fill-steps-box";

const CHUNK_OF_FEATURE: Record<RuntimeFeature, RuntimeChunkName> = { matrix: "units-matrix", fields: "units-fields", "steps-box": "fill-steps-box" };

/**
 * The split build's chunks when the asset build emits them (`runtimeChunks` in generated/assets.ts),
 * read by a computed key so a single-bundle build (no such export) needs no code change here.
 */
function runtimeChunks(): Partial<Record<RuntimeChunkName, string>> | null {
  const key = ["runtime", "Chunks"].join("");
  const v = (generatedAssets as unknown as Record<string, unknown>)[key];
  return v && typeof v === "object" ? (v as Partial<Record<RuntimeChunkName, string>>) : null;
}

const hasPixels = (p: LandingRuntimeConfig["pixels"]) => Object.values(p ?? {}).some((ids) => (Array.isArray(ids) ? ids.length > 0 : !!ids));

/**
 * The inline scripts of a document, in order: the optional chunks (the page's feature chunks, pixels
 * when the page has pixels outside previews, turnstile when a site key is embedded) register
 * themselves on `window.__lpx`, then the core chunk ("landing" / "thanks") runs them at init. A
 * single-bundle build ships one script (runtimeJs).
 */
export function runtimeScripts(page: "landing" | "thanks", cfg: Pick<LandingRuntimeConfig, "features" | "pixels" | "mode" | "turnstileSiteKey">): string[] {
  const chunks = runtimeChunks();
  const core = chunks?.[page];
  if (!chunks || !core) return runtimeJs ? [runtimeJs] : [];
  const out: string[] = [];
  const add = (name: RuntimeChunkName) => {
    const js = chunks[name];
    if (js && !out.includes(js)) out.push(js);
  };
  if (page === "landing") for (const f of cfg.features ?? []) add(CHUNK_OF_FEATURE[f]);
  if (cfg.mode !== "preview" && hasPixels(cfg.pixels)) add("pixels");
  if (page === "landing" && cfg.turnstileSiteKey) add("turnstile");
  out.push(core);
  return out;
}

/* ------------------------------------------------------------------ */
/* Add-ons and the test band (§H.13, D54)                              */
/* ------------------------------------------------------------------ */

/** A generated asset map (`addonChunks`, `addonCss`) when the asset build emits it, read by a computed key like runtimeChunks(). */
function generatedMap(name: "addon" | "addonCss"): Partial<Record<string, string>> {
  const key = name === "addon" ? ["addon", "Chunks"].join("") : name;
  const v = (generatedAssets as unknown as Record<string, unknown>)[key];
  return v && typeof v === "object" ? (v as Partial<Record<string, string>>) : {};
}

/** The inline code of each add-on chunk the asset build knows, in order (an unknown name is left out). */
function addonScripts(names: readonly AddonChunk[] | undefined): string[] {
  if (!names?.length) return [];
  const chunks = generatedMap("addon");
  const out: string[] = [];
  for (const name of names) {
    const js = chunks[name];
    if (js && !out.includes(js)) out.push(js);
  }
  return out;
}

const ADDON_DATA_ID = /^lp-[a-z][a-z0-9-]{0,30}$/;

/** The test band (D54): shown above everything on a test render, in the page's ink and background tokens. */
const TEST_BAND_CSS =
  ".lp-test-band{position:sticky;top:0;z-index:70;margin:0;padding:.55rem 1rem;text-align:center;" +
  "font:600 .8125rem/1.4 system-ui,-apple-system,'Segoe UI',Roboto,'Noto Sans Arabic',sans-serif;" +
  "background:var(--lp-ink,#1d2026);color:var(--lp-bg,#f6f7f8);text-wrap:balance}";

const TEST_BAND_TEXT: Partial<Record<string, string>> = {
  ar: "وضع الاختبار · الطلبات المرسلة من هذه الصفحة تُعلَّم كتجريبية ولا تُحتسب.",
  fr: "Mode test · Les commandes passées depuis cette page sont marquées « test » et ne sont pas comptées.",
  en: "Test mode · Orders placed from this page are marked as tests and are not counted.",
};

/** The add-ons' extra stylesheet chunks and the test band's rules, appended to the document's one stylesheet. */
function addonCss(addons: RenderAddons | undefined, page: "landing" | "thanks"): string[] {
  if (!addons) return [];
  const known = generatedMap("addonCss");
  const out = addons.css.map((name) => known[name]).filter((css): css is string => !!css);
  if (addons.banner === "test" && (page === "landing" || page === "thanks")) out.push(TEST_BAND_CSS);
  return out;
}

interface ShellProps {
  ctx: LandingRenderContext;
  theme: BuiltTheme;
  page: "landing" | "thanks" | "legal";
  /** <html lang> (defaults to the page locale) */
  lang?: string;
  qa: boolean;
  head: ReactNode;
  css: string;
  /** runtime config; documents without one carry no script at all */
  config?: unknown;
  jsonLd?: Record<string, unknown>;
  /** the render hook's add-ons (landing and thank-you pages only) */
  addons?: RenderAddons;
  children: ReactNode;
}

function Shell({ ctx, theme, page, lang, qa, head, css, config, jsonLd, addons, children }: ShellProps): ReactElement {
  const preloads = fontPreloads(theme.fontIds, ctx.locale, ctx.base, theme.fontWeights);
  const themeColor = theme.tokens["lp-bg"];
  const scripts = config !== undefined && page !== "legal" ? runtimeScripts(page, config as LandingRuntimeConfig) : [];
  const runtime = scripts.length > 0;
  const hook = page === "legal" ? undefined : addons;
  // add-ons read #lp-config: without the runtime there is nothing for them to read
  const headAddons = runtime ? addonScripts(hook?.head) : [];
  const bodyAddons = runtime ? addonScripts(hook?.body) : [];
  const data = runtime ? Object.entries(hook?.data ?? {}).filter(([id, value]) => ADDON_DATA_ID.test(id) && value !== undefined) : [];
  const band = hook?.banner === "test" ? (TEST_BAND_TEXT[ctx.locale] ?? TEST_BAND_TEXT.en!) : null;
  return (
    <html lang={lang ?? ctx.locale} dir={ctx.dir} className={qa ? "lp lp-qa" : "lp"} data-page={page} {...htmlAttrs(theme)}>
      {/* a standalone document rendered to static HTML — not a Next.js page, so next/head does not apply */}
      {/* eslint-disable-next-line @next/next/no-head-element */}
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        {head}
        {themeColor && HEX6.test(themeColor) ? <meta name="theme-color" content={themeColor} /> : null}
        <meta name="color-scheme" content={theme.scheme} />
        <meta name="format-detection" content="telephone=no" />
        {preloads.map((p) => (
          <link key={p.href} rel="preload" as="font" type={p.type} href={p.href} crossOrigin="anonymous" />
        ))}
        <style dangerouslySetInnerHTML={{ __html: css }} />
        {runtime ? <script type="application/json" id="lp-config" dangerouslySetInnerHTML={{ __html: inlineJson(config) }} /> : null}
        {data.map(([id, value]) => (
          <script key={id} type="application/json" id={id} dangerouslySetInnerHTML={{ __html: inlineJson(value) }} />
        ))}
        {headAddons.map((js, i) => (
          <script key={`h${i}`} dangerouslySetInnerHTML={{ __html: js }} />
        ))}
        {jsonLd ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: inlineJson(jsonLd) }} /> : null}
      </head>
      <body className="lp-body">
        {band ? (
          <p className="lp-test-band" role="status">
            {band}
          </p>
        ) : null}
        {children}
        {scripts.map((js, i) => (
          <script key={i} dangerouslySetInnerHTML={{ __html: js }} />
        ))}
        {bodyAddons.map((js, i) => (
          <script key={`b${i}`} dangerouslySetInnerHTML={{ __html: js }} />
        ))}
      </body>
    </html>
  );
}

function configFor(props: DocumentProps, page: "landing" | "thanks") {
  const { doc, ctx, urls } = props;
  const cfg = buildRuntimeConfig(doc, ctx, {
    page,
    mode: props.runtimeMode ?? ctx.mode,
    pageKey: ctx.pageKey,
    endpoints: urls.endpoints,
    thankYouUrl: urls.thankYou,
    landingUrl: urls.landing,
    turnstileSiteKey: props.turnstileSiteKey,
    ver: props.ver,
    formVariant: doc.sections.find((x) => x.type === "orderForm" && !x.hidden)?.variant,
  });
  // no pixel at all on a test render; no browser Purchase when the store sends it at another trigger (the pixels
  // chunk is added only for a config with pixel ids, so an empty map ships zero pixel bytes; the v2 shape stays)
  const noPixels = props.pixels === false || (page === "thanks" && props.purchaseInBrowser === false);
  return noPixels ? { ...cfg, pixels: {} } : cfg;
}

export function LandingDocument(props: DocumentProps): ReactElement {
  const { doc, ctx, urls, origin, qa = false } = props;
  const theme = buildTheme(doc.theme, doc.locale);
  const meta = seoMeta(doc, ctx, urls, origin);
  const icon = faviconHref(ctx, theme);
  const css = documentCss(ctx, theme, [...sectionChunks(doc, props.rendered), ...addonCss(props.addons, "landing")], qa);
  const head = (
    <>
      <title>{meta.title}</title>
      <meta name="description" content={meta.description} />
      {meta.noindex ? <meta name="robots" content="noindex, nofollow" /> : null}
      {meta.canonical ? <link rel="canonical" href={meta.canonical} /> : null}
      <meta property="og:type" content="product" />
      <meta property="og:title" content={meta.title} />
      <meta property="og:description" content={meta.description} />
      <meta property="og:site_name" content={brandName(ctx)} />
      <meta property="og:locale" content={ogLocale(doc)} />
      {meta.canonical ? <meta property="og:url" content={meta.canonical} /> : null}
      {meta.image ? (
        <>
          <meta property="og:image" content={meta.image.url} />
          <meta property="og:image:width" content={String(meta.image.width)} />
          <meta property="og:image:height" content={String(meta.image.height)} />
          <meta property="og:image:alt" content={meta.image.alt} />
        </>
      ) : null}
      <meta property="product:price:amount" content={ctx.lead.price.toFixed(2)} />
      <meta property="product:price:currency" content={doc.currency} />
      <meta name="twitter:card" content={meta.image ? "summary_large_image" : "summary"} />
      <meta name="twitter:title" content={meta.title} />
      <meta name="twitter:description" content={meta.description} />
      {meta.image ? (
        <>
          <meta name="twitter:image" content={meta.image.url} />
          <meta name="twitter:image:alt" content={meta.image.alt} />
        </>
      ) : null}
      <IconLinks icon={icon} />
    </>
  );
  return (
    <Shell
      ctx={ctx}
      theme={theme}
      page="landing"
      qa={qa}
      head={head}
      css={css}
      config={configFor(props, "landing")}
      jsonLd={productJsonLd(doc, ctx, meta, origin)}
      addons={props.addons}
    >
      {renderPageBody(doc, ctx, props.body)}
    </Shell>
  );
}

export function ThankYouDocument(props: DocumentProps): ReactElement {
  const { doc, ctx, urls, qa = false } = props;
  const theme = buildTheme(doc.theme, doc.locale);
  const icon = faviconHref(ctx, theme);
  const css = documentCss(ctx, theme, [...(thankYouCss ? [thankYouCss] : []), ...addonCss(props.addons, "thanks")], qa);
  const head = (
    <>
      <title>{`${ctx.t("thanks.step1")} — ${brandName(ctx)}`}</title>
      <meta name="robots" content="noindex, nofollow" />
      <IconLinks icon={icon} />
    </>
  );
  return (
    <Shell ctx={ctx} theme={theme} page="thanks" qa={qa} head={head} css={css} config={configFor(props, "thanks")} addons={props.addons}>
      <ThankYouBody doc={doc} ctx={ctx} landingUrl={urls.landing} />
    </Shell>
  );
}

export interface LegalDocumentProps {
  doc: PageDoc;
  ctx: LandingRenderContext;
  kind: LegalKind;
  /** ISO date shown as "updated on" */
  updatedAt: string;
  qa?: boolean;
}

/**
 * A legal document of the page (privacy / terms / shipping / contact): the page's theme, fonts and
 * tokens around a long-form reading layout. Static: no runtime config, no script.
 */
export function LegalDocument({ doc, ctx, kind, updatedAt, qa = false }: LegalDocumentProps): ReactElement {
  const theme = buildTheme(doc.theme, doc.locale);
  const icon = faviconHref(ctx, theme);
  const css = documentCss(ctx, theme, legalCss ? [legalCss] : [], qa);
  // pages in other languages read the English text: say so (screen readers, translation prompts)
  const lang = legalLang(doc.locale);
  const head = (
    <>
      <title>{`${legalTitle(ctx, kind)} — ${brandName(ctx)}`}</title>
      <meta name="robots" content="noindex, follow" />
      <IconLinks icon={icon} />
    </>
  );
  return (
    <Shell ctx={ctx} theme={theme} page="legal" lang={lang} qa={qa} head={head} css={css}>
      <LegalBody ctx={ctx} kind={kind} updatedAt={updatedAt} />
    </Shell>
  );
}
