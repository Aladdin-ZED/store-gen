/**
 * Iframe plumbing shared by LandingPreview and LandingThumbnail (client only).
 *
 * The preview iframe is a same-origin about:blank document (never srcdoc): we write a standards-mode
 * skeleton into it once, then React renders the landing body into it through a portal and we manage
 * its <head> (style elements) and <html> attributes from the parent window. The admin CSP is
 * inherited by about:blank, which allows inline styles, same-origin fonts and /media images.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createRenderContext, liveAssetResolver, PREVIEW_LINKS, type AssetRowLike, type LandingRenderContext, type StoreInfo } from "@/landing/context";
import { baseCss, sectionCss } from "@/landing/generated/assets";
import { dirOf, type PageDoc } from "@/lib/page/schema";
import { buildTheme, fontFaceCss, type BuiltTheme } from "@/lib/theme";
import type { PreviewAssets } from "./devices";

export { DEVICES, type PreviewAssets, type PreviewDevice } from "./devices";

/** Store identity used when the builder passes none (the localized "My store" fallback name applies). */
const NO_STORE: StoreInfo = { name: "" };

/**
 * Base + the section chunks of the types the document uses (LND-26), hidden sections included so showing one again
 * needs no new styles; a section the editor adds brings its chunk with the next render.
 */
export function previewCss(types: readonly string[]): string {
  return [baseCss, ...[...new Set(types)].sort().map((t) => sectionCss[t])].filter(Boolean).join("\n");
}

/** Styles for preview-only placeholders (section render errors). */
export const FRAME_EXTRA_CSS =
  '.lpx-error{margin:0;padding:14px 16px;border:1px solid #fecdd3;border-radius:12px;background:#fff1f2;color:#9f1239;' +
  'font:500 13px/1.4 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Arial,sans-serif;direction:ltr;text-align:left}';

const SKELETON =
  '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body></body></html>';

export const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Writes the standards-mode skeleton into a fresh about:blank frame document (once). */
function prepareFrame(frame: HTMLIFrameElement): Document | null {
  const d = frame.contentDocument;
  if (!d) return null;
  if (!d.body || d.documentElement.getAttribute("data-lp-frame") !== "1") {
    d.open();
    d.write(SKELETON);
    d.close();
    d.documentElement.setAttribute("data-lp-frame", "1");
  }
  return d;
}

/**
 * Ref callback for the <iframe> + its ready document. The skeleton (with a doctype → standards
 * mode) is written once the initial about:blank document has settled.
 */
export function useFrameDocument(): [(el: HTMLIFrameElement | null) => (() => void) | undefined, Document | null] {
  const [doc, setDoc] = useState<Document | null>(null);
  const ref = useCallback((frame: HTMLIFrameElement | null) => {
    if (!frame) {
      setDoc(null);
      return undefined;
    }
    const ready = () => setDoc(prepareFrame(frame));
    const initial = frame.contentDocument;
    if (initial && initial.readyState === "complete") ready();
    else frame.addEventListener("load", ready, { once: true });
    return () => {
      frame.removeEventListener("load", ready);
      setDoc(null);
    };
  }, []);
  return [ref, doc];
}

/** Row lookup → client-side live resolver (URLs /media/<key>, same as the published page). */
export function useAssetRows(assets: PreviewAssets) {
  return useMemo(() => liveAssetResolver(assets instanceof Map ? assets : Object.values(assets as Record<string, AssetRowLike>)), [assets]);
}

/**
 * Theme + render context for the preview (stable "now" per mount; countdowns tick in the runtime).
 * Links all point to "#" (the preview never navigates); `store` is Settings → Store (logo row included
 * in `assets` so it resolves).
 */
export function usePreviewContext(
  doc: PageDoc,
  assets: PreviewAssets,
  pageKey: string,
  store: StoreInfo = NO_STORE,
): { ctx: LandingRenderContext; theme: BuiltTheme } {
  const resolver = useAssetRows(assets);
  const [now] = useState(() => new Date().toISOString());
  const theme = useMemo(() => buildTheme(doc.theme, doc.locale), [doc.theme, doc.locale]);
  const ctx = useMemo(
    () => createRenderContext(doc, { mode: "preview", assets: resolver, base: "/", now, pageKey, store, links: PREVIEW_LINKS }),
    [doc, resolver, now, pageKey, store],
  );
  return { ctx, theme };
}

function styleEl(d: Document, key: string): HTMLStyleElement {
  let el = d.head.querySelector<HTMLStyleElement>(`style[data-lp="${key}"]`);
  if (!el) {
    el = d.createElement("style");
    el.setAttribute("data-lp", key);
    d.head.appendChild(el);
  }
  return el;
}

function setStyle(d: Document, key: string, css: string) {
  const el = styleEl(d, key);
  if (el.textContent !== css) el.textContent = css;
}

/** <html> lang/dir/page + theme data-* attributes; returns the theme attribute names now set. */
function syncHtml(frameDoc: Document, locale: PageDoc["locale"], attrs: Record<string, string>, previous: readonly string[], classes: readonly string[], page?: string): string[] {
  const html = frameDoc.documentElement;
  html.setAttribute("lang", locale);
  html.setAttribute("dir", dirOf(locale));
  if (page) html.setAttribute("data-page", page);
  for (const name of previous) if (!(name in attrs)) html.removeAttribute(name);
  const names: string[] = [];
  for (const [name, value] of Object.entries(attrs)) {
    if (!/^data-[a-z][a-z0-9-]{0,40}$/.test(name)) continue;
    if (html.getAttribute(name) !== value) html.setAttribute(name, value);
    names.push(name);
  }
  for (const c of classes) if (c) html.classList.add(c);
  frameDoc.body.classList.add("lp-body");
  return names;
}

function syncStyles(frameDoc: Document, styles: Record<string, string>): void {
  for (const [key, css] of Object.entries(styles)) setStyle(frameDoc, key, css);
}

/**
 * Keeps the frame's <html> attributes (lang, dir, theme data-*, classes) and <head> styles
 * (font faces, theme tokens, base + sections, extra) in sync with the document.
 */
export function useFrameHead(frameDoc: Document | null, doc: PageDoc, theme: BuiltTheme, opts: { classes: string[]; extraCss?: string; page?: string }) {
  const prevAttrs = useRef<string[]>([]);
  const fonts = useMemo(() => fontFaceCss(theme.fontIds, doc.locale, "/"), [theme.fontIds, doc.locale]);
  const classKey = opts.classes.join(" ");
  const { extraCss, page } = opts;

  useIsoLayoutEffect(() => {
    if (!frameDoc) return;
    prevAttrs.current = syncHtml(frameDoc, doc.locale, theme.attrs, prevAttrs.current, classKey.split(" "), page);
  }, [frameDoc, doc.locale, theme.attrs, classKey, page]);

  // the type list as the key: typing in a section must not rebuild the stylesheet
  const typesKey = [...new Set(doc.sections.map((x) => x.type))].sort().join(" ");
  const base = useMemo(() => previewCss(typesKey.split(" ")), [typesKey]);

  useIsoLayoutEffect(() => {
    if (!frameDoc) return;
    syncStyles(frameDoc, { fonts, theme: theme.css, base, extra: extraCss ?? "" });
  }, [frameDoc, fonts, theme.css, base, extraCss]);
}

/** Observed size of an element (content box). */
export function useElementSize<T extends HTMLElement>(): [(el: T | null) => void, { width: number; height: number }] {
  const [el, setEl] = useState<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize((s) => (Math.abs(s.width - width) < 0.5 && Math.abs(s.height - height) < 0.5 ? s : { width, height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [useCallback((node: T | null) => setEl(node), []), size];
}
