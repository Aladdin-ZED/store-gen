/**
 * PageDoc → final HTML (+ its hash-based CSP and ETag) for the live site and exports:
 *   renderLandingHtml(doc, opts)          the product page
 *   renderThankYouHtml(doc, opts)         its thank-you page
 *   renderLegalHtml(doc, kind, opts)      privacy / terms / shipping / contact in the page's theme
 *
 * Exports: render with mode "export", exportAssetResolver(rows).resolver and exportLinks(0) for the
 * documents at the zip root; legal documents live in legal/ → base "../", exportLinks(1) and
 * exportAssetResolver(rows, { prefix: "../" }).
 *
 * Node-only (node:crypto, react-dom/server). App code imports it through ./render.server.ts
 * (server-only guard); QA scripts import this module directly.
 *
 * `react-dom/server` is imported dynamically on purpose: route handlers run in the RSC layer, where
 * Next refuses a static import of it but aliases the module to the Node server build
 * (next/dist/compiled/react-dom/server.node), which bundles its own client React internals —
 * rendering our hook-free landing components with it is safe.
 */
import { createHash } from "node:crypto";
import { createElement, type ReactElement } from "react";
import type { RenderHookFields } from "@/landing/addons/types";
import { createRenderContext, type AssetResolver, type LandingRenderContext, type LegalKind, type StoreInfo } from "@/landing/context";
import { LandingDocument, LegalDocument, ThankYouDocument, variantChunksIn, type DocumentProps, type DocumentUrls, type RenderedCss } from "@/landing/document";
import { renderPageBody } from "@/landing/page";
import type { PageLinks, RenderMode } from "@/landing/types";
import type { PageDoc } from "@/lib/page/schema";
import { trackingFlags } from "@/lib/pixels/tracking";
import { pageCapIssues, runtimeConfigOf, type BlockingIssue } from "./caps";
import { turnstileKeyFor } from "./config";
import { buildLandingCsp, originOf } from "./csp";

export type { BlockingIssue } from "./caps";

export interface RenderHtmlOptions extends RenderHookFields {
  mode: "live" | "export";
  assets: AssetResolver;
  /** public page key baked into the runtime config */
  pageKey: string;
  /** store identity (Settings → Store) */
  store: StoreInfo;
  urls: DocumentUrls;
  /** where the page's legal documents live (liveLinks(slug) / exportLinks(0)) */
  links: PageLinks;
  /** URL prefix of /fonts: "/" (live, default) or "./" (export, default) */
  base?: string;
  /** absolute origin for canonical / OG / JSON-LD URLs */
  origin?: string;
  /** render time (ISO); defaults to now */
  now?: string;
  /** runtime behavior override ("preview" = offline runtime, used by QA renders) */
  runtimeMode?: RenderMode;
  turnstileSiteKey?: string;
  /** QA screenshot document (html.lp-qa, collapsed animations) */
  qa?: boolean;
  /** add upgrade-insecure-requests (live only); default: production */
  upgradeInsecureRequests?: boolean;
  /**
   * publish version id, embedded as #lp-config `ver` (docs/OFFERS.md §G.1: the order API prices against
   * the version the shopper saw). Live publishes only; previews and exports leave it out.
   */
  ver?: string;
  /** false: no pixel on the page nor in its CSP (test renders, D54) */
  pixels?: boolean;
  /** origins media is loaded from besides 'self' (S / C modes: the platform host, docs/STORE-SAAS.md §C.9) */
  mediaOrigins?: readonly string[];
}

export interface LegalHtmlOptions {
  mode: "live" | "export";
  assets: AssetResolver;
  store: StoreInfo;
  /** links of the legal document itself (liveLinks(slug), or exportLinks(1) from inside legal/) */
  links: PageLinks;
  /** URL prefix of /fonts: "/" (live, default) or "../" (export from legal/, default) */
  base?: string;
  /** render time (ISO); defaults to now */
  now?: string;
  /** "updated on" date (ISO) — the published version's date; defaults to `now` */
  updatedAt?: string;
  qa?: boolean;
  /** add upgrade-insecure-requests (live only); default: production */
  upgradeInsecureRequests?: boolean;
  /** origins media is loaded from besides 'self' (S / C modes) */
  mediaOrigins?: readonly string[];
}

export interface RenderIssue {
  sectionId: string;
  type: string;
  message: string;
}

export interface RenderedHtml {
  html: string;
  /** Content-Security-Policy value for this exact document */
  csp: string;
  /** sha256 (hex) of html — the strong ETag */
  etag: string;
  /** sections left out because their render threw */
  issues: RenderIssue[];
  /**
   * issues that stop a publish (`page_too_large`: page caps, ./caps.ts) — landing pages only; the
   * publisher refuses them, the builder checklist shows them as errors
   */
  blocking: BlockingIssue[];
  /** runtime contract embedded in the document (its #lp-config `v`); undefined without runtime config */
  runtimeV?: number;
  /** font files the document references, as "fonts/<family>/<file>.woff2" (exports copy them into the zip) */
  fonts: string[];
}

type Markup = (el: ReactElement) => string;

async function markupRenderer(): Promise<Markup> {
  const { renderToStaticMarkup } = await import("react-dom/server");
  return renderToStaticMarkup;
}

const sha256 = (s: string) => createHash("sha256").update(s, "utf8");

/** CSP hash source of an inline element's text (the parser turns CR/CRLF into LF before hashing). */
const cspHash = (text: string) => `sha256-${sha256(text.replace(/\r\n?/g, "\n")).digest("base64")}`;

const DATA_SCRIPT = /\btype\s*=\s*"application\/(?:ld\+)?json"/i;

const NAMED_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** Character references as the HTML parser decodes them inside foreign (SVG) content. */
function decodeEntities(text: string): string {
  return text.replace(/&(?:#x([0-9a-f]{1,6})|#(\d{1,7})|([a-z]{2,6}));/gi, (whole, hex: string | undefined, dec: string | undefined, name: string | undefined) => {
    if (name) return NAMED_ENTITIES[name.toLowerCase()] ?? whole;
    const code = hex ? parseInt(hex, 16) : Number(dec);
    return code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff) ? String.fromCodePoint(code) : whole;
  });
}

/**
 * Hashes of every executable inline <script> and every inline <style> in the document.
 * A <style> inside an inline <svg> is parsed as foreign content, where character references are
 * decoded before the browser hashes the text — such styles also get the hash of the decoded text.
 */
export function inlineHashes(html: string): { scripts: string[]; styles: string[] } {
  const scripts: string[] = [];
  const styles: string[] = [];
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    const attrs = m[1] ?? "";
    if (/\bsrc\s*=/i.test(attrs) || DATA_SCRIPT.test(attrs)) continue;
    scripts.push(cspHash(m[2] ?? ""));
  }
  for (const m of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)) {
    const text = m[1] ?? "";
    styles.push(cspHash(text));
    if (text.includes("&")) {
      const decoded = decodeEntities(text);
      if (decoded !== text) styles.push(cspHash(decoded));
    }
  }
  return { scripts, styles };
}

function withDoctype(markup: string): string {
  return /^<!doctype html>/i.test(markup) ? markup : `<!DOCTYPE html>${markup}`;
}

function contextFor(doc: PageDoc, opts: RenderHtmlOptions): LandingRenderContext {
  return createRenderContext(doc, {
    mode: opts.mode,
    assets: opts.assets,
    base: opts.base ?? (opts.mode === "export" ? "./" : "/"),
    now: opts.now ?? new Date().toISOString(),
    pageKey: opts.pageKey,
    store: opts.store,
    links: opts.links,
  });
}

/** Style attributes may only carry CSS custom properties ("--rot:-2deg;--pos:40%"). */
const STYLE_ATTR = /\sstyle="([^"]*)"/g;
const CUSTOM_PROP_DECL = /^\s*--[A-Za-z0-9_-]+\s*:/;

/**
 * Inline style attributes that set real properties instead of custom properties. The landing CSP
 * allows style attributes ('unsafe-inline' in style-src-attr) on the contract that they only feed
 * per-instance custom properties; anything else is reported (sections must use classes).
 */
export function styleAttrViolations(html: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(STYLE_ATTR)) {
    const value = (m[1] ?? "").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
    const decls = value.split(";").filter((d) => d.trim());
    if (!decls.every((d) => CUSTOM_PROP_DECL.test(d))) out.add(value.slice(0, 120));
  }
  return [...out];
}

interface ProbeResult {
  issues: RenderIssue[];
  /** stylesheet needs of the sections that rendered (types with markup, variant chunks) */
  rendered: RenderedCss;
}

/**
 * Render every visible section on its own and report the ones that throw (top-level render or any
 * nested component), so one broken section is left out instead of failing the whole page. The
 * markup of the sections that render also tells which stylesheet chunks the page needs: a section
 * that renders nothing (no data for it) ships no CSS.
 */
function probeSections(doc: PageDoc, ctx: LandingRenderContext, markup: Markup): ProbeResult {
  const issues: RenderIssue[] = [];
  const types = new Set<string>();
  const variants = new Set<string>();
  for (const section of doc.sections) {
    if (section.hidden) continue;
    const one: PageDoc = { ...doc, sections: [section] };
    let failure: unknown = null;
    let html = "";
    try {
      html = markup(
        renderPageBody(one, ctx, {
          onError: (_s, err) => {
            failure = err;
          },
        }),
      );
    } catch (err) {
      failure = err;
    }
    if (failure !== null) {
      issues.push({
        sectionId: section.id,
        type: section.type,
        message: failure instanceof Error ? `${failure.name}: ${failure.message}` : "render failed",
      });
    } else if (html) {
      types.add(section.type);
      variantChunksIn(html, variants);
    }
  }
  return { issues, rendered: { types, variants } };
}

interface FinishInput {
  mode: "live" | "export";
  page: "landing" | "thanks" | "legal";
  /** the runtime may load pixels / call the API (false: offline previews, legal documents) */
  online: boolean;
  /** the page fires the doc's pixels (false: test renders, a thank-you page without the browser Purchase) */
  pixels: boolean;
  doc: PageDoc;
  origin?: string;
  endpoints: Record<string, string | undefined>;
  turnstileSiteKey?: string;
  upgradeInsecureRequests?: boolean;
  mediaOrigins?: readonly string[];
}

/** Fonts referenced by the inlined @font-face rules ("fonts/<family>/<file>.woff2"). */
const FONT_URL = /url\("(?:\.\.\/|\.\/|\/)?(fonts\/[a-z0-9-]+\/[A-Za-z0-9._-]+\.woff2)"\)/g;

function finish(html: string, input: FinishInput, issues: RenderIssue[]): RenderedHtml {
  const { scripts, styles } = inlineHashes(html);
  const selfOrigin = input.origin ? originOf(input.origin) : null;
  const apiOrigins = input.online
    ? Object.values(input.endpoints)
        .map((u) => (typeof u === "string" ? originOf(u) : null))
        .filter((o): o is string => !!o && o !== selfOrigin)
    : [];
  const csp = buildLandingCsp({
    mode: input.mode,
    scriptHashes: scripts,
    styleHashes: styles,
    // exactly the platforms the document loads (none offline / in previews / on test renders)
    pixels: input.online && input.pixels ? trackingFlags(input.doc.tracking) : {},
    apiOrigins: [...new Set(apiOrigins)],
    mediaOrigins: input.mediaOrigins,
    turnstile: input.page === "landing" && input.online && !!turnstileKeyFor("landing", input.mode, input.turnstileSiteKey),
    // only when the site is really served over https (Hostinger) — never for `npm run start` on http://localhost
    upgradeInsecureRequests:
      input.upgradeInsecureRequests ??
      (process.env.NODE_ENV === "production" && /^https:\/\//i.test(process.env.PUBLIC_URL ?? "https://")),
  });
  const fonts = [...new Set([...html.matchAll(FONT_URL)].map((m) => m[1]!))].sort();
  const style = styleAttrViolations(html);
  if (style.length && process.env.NODE_ENV !== "production") {
    console.warn(`[render] style attributes must only set custom properties: ${style.slice(0, 5).join(" | ")}`);
  }
  const cfg = input.page === "legal" ? null : runtimeConfigOf(html);
  const blocking = input.page === "landing" ? pageCapIssues(input.doc, html) : [];
  return { html, csp, etag: sha256(html).digest("hex"), issues, blocking, ...(cfg?.v ? { runtimeV: cfg.v } : {}), fonts };
}

function finishPage(html: string, doc: PageDoc, opts: RenderHtmlOptions, page: "landing" | "thanks", issues: RenderIssue[]): RenderedHtml {
  return finish(
    html,
    {
      mode: opts.mode,
      page,
      online: (opts.runtimeMode ?? opts.mode) !== "preview",
      pixels: opts.pixels !== false && !(page === "thanks" && opts.purchaseInBrowser === false),
      doc,
      origin: opts.origin,
      endpoints: { ...opts.urls.endpoints },
      turnstileSiteKey: opts.turnstileSiteKey,
      upgradeInsecureRequests: opts.upgradeInsecureRequests,
      mediaOrigins: opts.mediaOrigins,
    },
    issues,
  );
}

function documentProps(doc: PageDoc, ctx: LandingRenderContext, opts: RenderHtmlOptions): DocumentProps {
  return {
    doc,
    ctx,
    urls: opts.urls,
    origin: opts.origin,
    runtimeMode: opts.runtimeMode,
    turnstileSiteKey: opts.turnstileSiteKey,
    qa: opts.qa,
    ver: opts.mode === "live" ? opts.ver : undefined,
    // the render hook (§H.13): passed only when set, so a document without it renders today's bytes
    ...(opts.addons ? { addons: opts.addons } : {}),
    ...(opts.purchaseInBrowser === false ? { purchaseInBrowser: false } : {}),
    ...(opts.pixels === false ? { pixels: false } : {}),
  };
}

/** The product landing page. `doc` should come from validateDoc(). */
export async function renderLandingHtml(doc: PageDoc, opts: RenderHtmlOptions): Promise<RenderedHtml> {
  const markup = await markupRenderer();
  const ctx = contextFor(doc, opts);
  const { issues, rendered } = probeSections(doc, ctx, markup);
  const skip = new Set(issues.map((i) => i.sectionId));
  const html = withDoctype(markup(createElement(LandingDocument, { ...documentProps(doc, ctx, opts), body: { skip }, rendered })));
  return finishPage(html, doc, opts, "landing", issues);
}

/** The thank-you page (noindex). */
export async function renderThankYouHtml(doc: PageDoc, opts: RenderHtmlOptions): Promise<RenderedHtml> {
  const markup = await markupRenderer();
  const ctx = contextFor(doc, opts);
  const html = withDoctype(markup(createElement(ThankYouDocument, documentProps(doc, ctx, opts))));
  return finishPage(html, doc, opts, "thanks", []);
}

/**
 * A legal document of the page (privacy, terms, shipping, contact) — static (no script), noindex,
 * themed like the page; store details are read from opts.store at render time.
 */
export async function renderLegalHtml(doc: PageDoc, kind: LegalKind, opts: LegalHtmlOptions): Promise<RenderedHtml> {
  const markup = await markupRenderer();
  const ctx = createRenderContext(doc, {
    mode: opts.mode,
    assets: opts.assets,
    base: opts.base ?? (opts.mode === "export" ? "../" : "/"),
    now: opts.now ?? new Date().toISOString(),
    pageKey: "legal",
    store: opts.store,
    links: opts.links,
  });
  const updatedAt = opts.updatedAt && Number.isFinite(Date.parse(opts.updatedAt)) ? new Date(opts.updatedAt).toISOString() : ctx.now;
  const html = withDoctype(markup(createElement(LegalDocument, { doc, ctx, kind, updatedAt, qa: opts.qa })));
  return finish(
    html,
    { mode: opts.mode, page: "legal", online: false, pixels: false, doc, endpoints: {}, upgradeInsecureRequests: opts.upgradeInsecureRequests, mediaOrigins: opts.mediaOrigins },
    [],
  );
}
