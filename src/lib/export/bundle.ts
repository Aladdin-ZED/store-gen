/**
 * Export bundle builder — PageDoc + assets → the list of files of a standalone site (Node only, no DB:
 * media bytes come through a MediaSource, so the same code serves the admin route and offline scripts).
 *
 *   README.md
 *   public_html/  index.html · merci/index.html · legal/*.html · 404.html · assets/img|video/* · fonts/*
 *                 favicon.ico · apple-touch-icon.png · icon-*.png · site.webmanifest · robots.txt · sitemap.xml
 *                 .htaccess (+ merci/, legal/, assets/, fonts/) · _headers · vercel.json      (host configs)
 *                 order.php                                                                  (PHP mode)
 *   cod-private/  config.php · lib/gsheets.php · .htaccess                                   (PHP mode)
 *
 * Pages are rendered with the publish renderer in "export" mode (relative URLs), then finished here:
 * favicon/manifest links, the WhatsApp bridge (WhatsApp mode) and each document's own hash CSP as a
 * <meta> tag, computed from its final bytes.
 */
import { randomBytes } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { createRenderContext, exportAssetResolver, exportLinks, LEGAL_KINDS, type AssetRowLike, type StoreInfo } from "@/landing/context";
import { legalGaps } from "@/landing/legal";
import type { PageLinks } from "@/landing/types";
import { exportMediaPath } from "@/lib/media/keys";
import { getMarket } from "@/lib/markets/info";
import type { PageDoc } from "@/lib/page/schema";
import { inlineJson, type RuntimeEndpoints } from "@/lib/render/config";
import { renderLandingHtml, renderLegalHtml, renderThankYouHtml, type RenderIssue } from "@/lib/render/core";
import { buildTheme } from "@/lib/theme";
import { buildIcons, monogramLetter, webManifest } from "./favicon";
import { folderHtaccess, headersFile, immutableHtaccess, rootHtaccess, vercelJson, type HostPolicies } from "./hostconfig";
import { dataScript, exportCsp, iconLinks, injectBodyEnd, injectHead, inlineScript, inlineStyle, styleHashes, withMetaCsp } from "./html";
import { renderNotFoundHtml } from "./notfound";
import type { ExportMode, SiteUrl } from "./options";
import { configPhp, fillOrderPhp, phpSpec, PRIVATE_HTACCESS } from "./php";
import { readmeMd } from "./readme";
import { robotsTxt, sitemapXml } from "./seo";
import { WA_BRIDGE_JS, WA_CARD_CSS, WA_ENDPOINT, waCopy, waData } from "./whatsapp";
import { assertZipPath, type ZipEntry } from "./zip";

/** Where stored media come from (the database in the app, a folder in scripts). */
export interface MediaSource {
  read(key: string): Promise<Uint8Array | null>;
  /** size in bytes without loading the file (null when it does not exist) */
  size(key: string): Promise<number | null>;
}

export interface BundlePaths {
  /** public/fonts (font files referenced by the pages) */
  fonts: string;
  /** src/lib/export/templates (order.php) */
  templates: string;
  /** php/gsheets.php (Google Sheets client copied into PHP exports) */
  gsheets: string;
}

export function defaultBundlePaths(cwd = process.cwd()): BundlePaths {
  return {
    fonts: path.join(cwd, "public", "fonts"),
    templates: path.join(cwd, "src", "lib", "export", "templates"),
    gsheets: path.join(cwd, "php", "gsheets.php"),
  };
}

export interface PhpBundleOptions {
  /** HMAC key of order.php (random hex) — generated when omitted */
  secret?: string;
  spreadsheetId?: string;
  sheetTab?: string;
  serviceAccountB64?: string;
  /** client_email of the embedded key (named in README's revoke steps) */
  serviceAccountEmail?: string;
}

export interface BundleInput {
  mode: ExportMode;
  /** the platform's name in the README (`platform.brand.name`, EXP-07); "Store Gen" when omitted */
  brand?: string;
  /** a document that passed validateDoc() */
  doc: PageDoc;
  exportId: string;
  /** public key baked into the page (connected: exports.publicKey) */
  pageKey: string;
  pageName: string;
  store: StoreInfo;
  /** rows of every asset the document and the store logo reference */
  assets: readonly AssetRowLike[];
  media: MediaSource;
  siteUrl: SiteUrl | null;
  hostConfigs: boolean;
  /** connected: the app's public origin ("https://studio.shop.ma") */
  apiOrigin?: string;
  allowedOrigins: string[];
  /** whatsapp: wa.me digits */
  whatsappNumber?: string;
  php?: PhpBundleOptions;
  now: Date;
  /** "updated on" date of the legal pages (the version's date) */
  updatedAt: Date;
  /** warnings known before rendering (e.g. images deleted from the media library) */
  warnings?: string[];
  paths?: Partial<BundlePaths>;
}

export interface BundleFile extends ZipEntry {
  /** bytes, when known without loading (null: missing) */
  size: number | null;
}

export interface ExportBundle {
  files: BundleFile[];
  /** things to fix or know (missing images, store details for the legal pages, skipped sections) */
  warnings: string[];
  renderIssues: RenderIssue[];
}

export const SITE_DIR = "public_html";
export const PRIVATE_DIR = "cod-private";

/** Links of the thank-you page (merci/): one folder down from the root. */
const MERCI_LINKS: PageLinks = {
  home: "../index.html",
  privacy: "../legal/privacy.html",
  terms: "../legal/terms.html",
  shipping: "../legal/shipping.html",
  contact: "../legal/contact.html",
};

const FONT_PATH = /^fonts\/([a-z0-9-]+)\/([A-Za-z0-9._-]+\.woff2)$/;
const enc = new TextEncoder();

function textFile(p: string, content: string): BundleFile {
  const bytes = enc.encode(content);
  return { path: assertZipPath(p), compress: true, size: bytes.length, load: async () => bytes };
}

function binaryFile(p: string, bytes: Uint8Array): BundleFile {
  return { path: assertZipPath(p), compress: false, size: bytes.length, load: async () => bytes };
}

/** The document as exported: WhatsApp mode says what happens on the button and the thank-you page. */
function modeDoc(doc: PageDoc, mode: ExportMode): PageDoc {
  if (mode !== "whatsapp") return doc;
  const copy = waCopy(doc.locale);
  return {
    ...doc,
    form: { ...doc.form, submitLabel: copy.submit },
    thankYou: { ...doc.thankYou, title: copy.thanksTitle, message: copy.thanksMessage, showTimeline: false },
  };
}

function endpointsFor(input: BundleInput, depth: 0 | 1): RuntimeEndpoints {
  if (input.mode === "connected") {
    if (!input.apiOrigin) throw new Error("export: connected mode needs the app's public origin");
    const api = input.apiOrigin.replace(/\/+$/, "");
    return {
      order: `${api}/api/public/order`,
      lead: `${api}/api/public/lead`,
      event: `${api}/api/public/event`,
      upsell: `${api}/api/public/upsell`,
    };
  }
  if (input.mode === "php") return { order: depth ? "../order.php" : "order.php" };
  return { order: WA_ENDPOINT };
}

/** The logo rendition used for the icon set: PNG/WebP/JPEG (no AVIF), the smallest ≥ 512 px. */
function logoKey(rows: readonly AssetRowLike[], store: StoreInfo): string | null {
  const row = store.logo ? rows.find((r) => r.id === store.logo!.id && r.kind !== "video") : undefined;
  if (!row) return null;
  const usable = row.variants.filter((v) => v.fmt === "png" || v.fmt === "webp" || v.fmt === "jpeg").sort((a, b) => a.w - b.w);
  return (usable.find((v) => v.w >= 512) ?? usable[usable.length - 1])?.key ?? null;
}

export async function buildBundle(input: BundleInput): Promise<ExportBundle> {
  const paths = { ...defaultBundlePaths(), ...input.paths };
  const R = SITE_DIR;
  const doc = modeDoc(input.doc, input.mode);
  const nowIso = input.now.toISOString();
  const origin = input.siteUrl ? input.siteUrl.base.replace(/\/$/, "") : undefined;
  const warnings: string[] = [...(input.warnings ?? [])];
  const theme = buildTheme(doc.theme, doc.locale);
  const ctx = createRenderContext(doc, {
    mode: "export",
    assets: exportAssetResolver(input.assets).resolver,
    base: "./",
    now: nowIso,
    pageKey: input.pageKey,
    store: input.store,
    links: exportLinks(0),
  });
  const storeName = ctx.store.name;

  /* ---- documents --------------------------------------------------- */
  const top = exportAssetResolver(input.assets);
  const sub = exportAssetResolver(input.assets, { prefix: "../" });
  const rootEndpoints = endpointsFor(input, 0);
  const subEndpoints = endpointsFor(input, 1);
  const common = { mode: "export" as const, pageKey: input.pageKey, store: input.store, now: nowIso };

  const landing = await renderLandingHtml(doc, {
    ...common,
    assets: top.resolver,
    urls: { landing: "./", thankYou: "merci/index.html", endpoints: rootEndpoints },
    links: exportLinks(0),
    base: "./",
    origin,
  });
  const thanks = await renderThankYouHtml(doc, {
    ...common,
    assets: sub.resolver,
    urls: { landing: "../index.html", thankYou: "index.html", endpoints: subEndpoints },
    links: MERCI_LINKS,
    base: "../",
  });
  const legal = [];
  for (const kind of LEGAL_KINDS) {
    const rendered = await renderLegalHtml(doc, kind, {
      mode: "export",
      assets: sub.resolver,
      store: input.store,
      links: exportLinks(1),
      base: "../",
      now: nowIso,
      updatedAt: input.updatedAt.toISOString(),
    });
    legal.push({ kind, ...rendered });
  }

  // export-only additions (head links, WhatsApp bridge), then each document's own CSP
  const wa = input.mode === "whatsapp";
  if (wa && !input.whatsappNumber) throw new Error("export: WhatsApp mode needs a number");
  const bridge = wa ? dataScript("lp-wa", inlineJson(waData(input.whatsappNumber!, doc.locale))) + inlineScript(WA_BRIDGE_JS) : "";
  const finish = (html: string, o: { head: string; bodyEnd?: string; online: boolean; endpoints?: RuntimeEndpoints }) => {
    const out = injectBodyEnd(injectHead(html, o.head), o.bodyEnd ?? "");
    const endpoints = o.endpoints ? Object.values(o.endpoints) : [];
    const csp = exportCsp(out, { doc, online: o.online, endpoints });
    return { html: withMetaCsp(out, csp), csp, endpoints };
  };
  const landingDoc = finish(landing.html, { head: iconLinks(""), bodyEnd: bridge, online: true, endpoints: rootEndpoints });
  const thanksDoc = finish(thanks.html, { head: iconLinks("../") + (wa ? inlineStyle(WA_CARD_CSS) : ""), bodyEnd: bridge, online: true, endpoints: subEndpoints });
  const legalDocs = legal.map((l) => ({ kind: l.kind, ...finish(l.html, { head: iconLinks("../"), online: false }) }));

  // 404: served at any missing path → addressed from the site root
  const site = input.siteUrl;
  const root = site ? (site.base.startsWith("https://") ? site.base : site.path) : "/";
  const notFoundRaw = await renderNotFoundHtml({ doc, storeName, root, home: site?.base ?? "/" });
  const notFound = finish(notFoundRaw, { head: `<link rel="icon" href="${root}favicon.ico" sizes="any"/>${iconLinks(root)}`, online: false });

  /* ---- static files ------------------------------------------------ */
  const files: BundleFile[] = [];
  const add = (f: BundleFile) => files.push(f);
  const php = input.mode === "php";

  add(textFile(`${R}/index.html`, landingDoc.html));
  add(textFile(`${R}/merci/index.html`, thanksDoc.html));
  for (const l of legalDocs) add(textFile(`${R}/legal/${l.kind}.html`, l.html));
  add(textFile(`${R}/404.html`, notFound.html));
  add(textFile(`${R}/robots.txt`, robotsTxt({ site, noindex: doc.seo.noindex })));
  if (site && !doc.seo.noindex) add(textFile(`${R}/sitemap.xml`, sitemapXml(site, input.updatedAt)));

  // icons + manifest
  const lk = logoKey(input.assets, input.store);
  const logo = lk ? await input.media.read(lk) : null;
  const icons = await buildIcons({
    logo,
    letter: monogramLetter(storeName, doc.product.name, doc.locale),
    accent: theme.tokens["lp-accent"] ?? "",
    accentInk: theme.tokens["lp-accent-ink"] ?? "",
    background: theme.tokens["lp-bg"] ?? "",
  });
  for (const [name, bytes] of Object.entries(icons)) add(binaryFile(`${R}/${name}`, bytes));
  add(
    textFile(
      `${R}/site.webmanifest`,
      webManifest({ name: storeName, lang: doc.locale, dir: ctx.dir, background: theme.tokens["lp-bg"] ?? "", themeColor: theme.tokens["lp-bg"] ?? "" }),
    ),
  );

  // fonts referenced by the inlined @font-face rules of every document
  const fontPaths = [...new Set([...landing.fonts, ...thanks.fonts, ...legal.flatMap((l) => l.fonts)])].sort();
  const fontFiles: BundleFile[] = [];
  for (const rel of fontPaths) {
    const m = FONT_PATH.exec(rel);
    if (!m) continue;
    const abs = path.join(paths.fonts, m[1]!, m[2]!);
    const size = await stat(abs).then(
      (s) => s.size,
      () => null,
    );
    if (size === null) {
      warnings.push(`Font file ${rel} is missing on the server — run "npm run fonts:sync".`);
      continue;
    }
    fontFiles.push({ path: assertZipPath(`${R}/${rel}`), compress: false, size, load: async () => new Uint8Array(await readFile(abs)) });
  }

  // images & videos actually referenced by the documents
  const keys = [...new Set([...top.usedKeys(), ...sub.usedKeys()])].sort();
  const mediaFiles: BundleFile[] = [];
  let missing = 0;
  for (const key of keys) {
    const size = await input.media.size(key);
    if (size === null) {
      missing++;
      continue;
    }
    mediaFiles.push({ path: assertZipPath(`${R}/${exportMediaPath(key)}`), compress: false, size, load: () => input.media.read(key) });
  }
  if (missing) warnings.push(`${missing} image file${missing > 1 ? "s are" : " is"} missing from the media library — re-upload or replace ${missing > 1 ? "them" : "it"} in the builder.`);

  // host configs: the same policies as the <meta> tags, scoped per folder / path
  if (input.hostConfigs) {
    const nf = styleHashes(notFound.html);
    const policies: HostPolicies = {
      landing: exportCsp(landingDoc.html, { doc, online: true, endpoints: landingDoc.endpoints, extraStyleHashes: nf }),
      thanks: exportCsp(thanksDoc.html, { doc, online: true, endpoints: thanksDoc.endpoints, extraStyleHashes: nf }),
      legal: exportCsp(legalDocs[0]!.html, { doc, online: false, extraStyleHashes: [...legalDocs.slice(1).flatMap((l) => styleHashes(l.html)), ...nf] }),
      notFound: notFound.csp,
    };
    const hc = { policies, basePath: site?.path ?? "/", php };
    add(textFile(`${R}/.htaccess`, rootHtaccess(hc)));
    add(textFile(`${R}/merci/.htaccess`, folderHtaccess("Thank-you page policy", policies.thanks)));
    add(textFile(`${R}/legal/.htaccess`, folderHtaccess("Legal pages policy", policies.legal)));
    if (mediaFiles.length) add(textFile(`${R}/assets/.htaccess`, immutableHtaccess()));
    if (fontFiles.length) add(textFile(`${R}/fonts/.htaccess`, immutableHtaccess()));
    if (!php) {
      add(textFile(`${R}/_headers`, headersFile(hc)));
      add(textFile(`${R}/vercel.json`, vercelJson(hc)));
    }
  }

  // PHP mode: the order endpoint and its private folder
  if (php) {
    const template = await readFile(path.join(paths.templates, "order.php"), "utf8");
    const gsheets = await readFile(paths.gsheets).catch(() => {
      throw new Error(`export: ${paths.gsheets} is missing (PHP exports copy it into ${PRIVATE_DIR}/lib)`);
    });
    const market = getMarket(doc.market);
    add(textFile(`${R}/order.php`, fillOrderPhp(template, phpSpec(doc, { exportId: input.exportId, pageKey: input.pageKey }))));
    add(
      textFile(
        `${PRIVATE_DIR}/config.php`,
        configPhp({
          exportId: input.exportId,
          pageName: input.pageName,
          generatedAt: input.now,
          secret: input.php?.secret ?? randomBytes(32).toString("hex"),
          spreadsheetId: input.php?.spreadsheetId,
          serviceAccountB64: input.php?.serviceAccountB64,
          sheetTab: input.php?.sheetTab,
          currency: doc.currency,
          timeZone: market.timeZone,
        }),
      ),
    );
    add({ ...binaryFile(`${PRIVATE_DIR}/lib/gsheets.php`, new Uint8Array(gsheets)), compress: true });
    add(textFile(`${PRIVATE_DIR}/.htaccess`, PRIVATE_HTACCESS));
  }

  for (const issue of landing.issues) warnings.push(`The “${issue.type}” section could not be rendered and was left out.`);
  for (const gap of legalGaps(ctx)) warnings.push(`Legal pages: add ${gap} in Settings → Store.`);

  const readme = readmeMd({
    mode: input.mode,
    brand: input.brand,
    pageName: input.pageName,
    storeName,
    exportId: input.exportId,
    createdAt: input.now,
    site,
    hostConfigs: input.hostConfigs,
    apiOrigin: input.apiOrigin,
    allowedOrigins: input.allowedOrigins,
    whatsapp: input.whatsappNumber ? `+${input.whatsappNumber}` : undefined,
    php: php
      ? {
          spreadsheet: !!input.php?.spreadsheetId,
          serviceAccount: !!input.php?.serviceAccountB64,
          serviceAccountEmail: input.php?.serviceAccountB64 ? input.php.serviceAccountEmail : undefined,
        }
      : undefined,
    root: R,
    privateDir: php ? PRIVATE_DIR : undefined,
    warnings,
  });

  return {
    files: [textFile("README.md", readme), ...files, ...fontFiles, ...mediaFiles],
    warnings,
    renderIssues: landing.issues,
  };
}

/** Sum of the known sizes (the ZIP adds ~100 bytes per entry; text compresses — a fair upper bound). */
export function bundleSize(bundle: ExportBundle): { bytes: number; files: number; breakdown: { pages: number; media: number; fonts: number; other: number } } {
  const breakdown = { pages: 0, media: 0, fonts: 0, other: 0 };
  for (const f of bundle.files) {
    const size = f.size ?? 0;
    if (/\.html$/.test(f.path)) breakdown.pages += size;
    else if (/\/assets\//.test(f.path)) breakdown.media += size;
    else if (/\/fonts\//.test(f.path)) breakdown.fonts += size;
    else breakdown.other += size;
  }
  const overhead = bundle.files.length * 120 + 22;
  // HTML deflates to roughly a quarter; media and fonts are already compressed
  const bytes = Math.round(breakdown.pages * 0.28 + breakdown.media + breakdown.fonts + breakdown.other * 0.6 + overhead);
  return { bytes, files: bundle.files.length, breakdown };
}
