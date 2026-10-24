/**
 * RenderContext factory + asset resolvers + store identity + page links.
 *
 * Isomorphic (server publish/export, admin preview in the browser, QA scripts): no Node APIs,
 * no DOM, no server-only imports. One context is created per render; sections receive it as `ctx`.
 *
 *   const ctx = createRenderContext(doc, {
 *     mode: "live", assets: liveAssetResolver(rows), base: "/", now, pageKey,
 *     store: storeInfo, links: liveLinks(slug),
 *   });
 *
 * Asset resolvers turn AssetRefs into <picture>/<video>-ready URLs for a delivery mode:
 *   liveAssetResolver(rows)        → /media/<key>                     (published pages, admin preview)
 *   exportAssetResolver(rows)      → assets/img|video/<key>           (+ usedKeys() for the zip)
 *   fixtureAssetResolver(rows, b)  → <b>dev-fixtures/<key>            (dev fixtures, QA renders)
 *
 * Page links (footer legal links, "back to the page"):
 *   storePageLinks(base, slug) → "<base>/<slug>", "<base>/policies/privacy?p=<slug>", … (live store pages)
 *   liveLinks(slug)    → "/<slug>", "/legal/privacy?p=<slug>", … (deprecated root paths: QA renders)
 *   exportLinks(depth) → "index.html", "legal/privacy.html", … (depth 1: from inside legal/)
 *   PREVIEW_LINKS      → "#" everywhere (the admin preview never navigates)
 */
import { createT } from "./i18n";
import { formatMoney } from "./runtime/money";
import type { PageLinks, RenderContext, RenderMode, ResolvedAsset, ResolvedVideo, StoreContext } from "./types";
import { namedLead } from "@/lib/page/catalog";
import { dirOf, type AssetRef, type PageDoc } from "@/lib/page/schema";
import { formatNumber, marketInfoForLocale, moneyFormat } from "@/lib/markets/info";
import { FULL_BOX, parseFocus, percentPair, robustCrop, type AssetFocus, type FocusKind } from "@/lib/media/focus";
import { FIXTURE_FOCUS } from "@/lib/media/fixture-focus";
import { exportMediaPath, KEY_RE, liveMediaUrl, MIME, variantKey, type MediaFormat } from "@/lib/media/keys";
import { whatsappDigits } from "@/lib/render/config";

/* ------------------------------------------------------------------ */
/* Deterministic randomness                                            */
/* ------------------------------------------------------------------ */

/** 32-bit hash: FNV-1a over the string, then the murmur3 finalizer (good avalanche for short keys). */
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** mulberry32 PRNG — floats in [0, 1). */
function mulberry32(state: number): () => number {
  let a = state >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** PRNG seeded by hash(seed + key): same seed & key → same sequence on every render. */
export function seededRandom(seed: number, key: string): () => number {
  return mulberry32(hash32(`${seed}|${key}`));
}

/* ------------------------------------------------------------------ */
/* Assets                                                              */
/* ------------------------------------------------------------------ */

/** The asset fields a resolver needs — satisfied by DB rows (AssetRecord), admin JSON (AssetJson) and fixtures. */
export interface AssetRowLike {
  id: string;
  kind?: "image" | "video";
  /** stored MIME type (videos: "video/mp4" | "video/webm") */
  mime?: string;
  width: number;
  height: number;
  alpha: boolean;
  dominant: string;
  /** image renditions; videos have none (one file, keyed "<id>-<width>.<mp4|webm>") */
  variants: readonly { key: string; w: number; h: number; fmt: MediaFormat }[];
  /** subject analysis stored at upload (AssetFocus JSON — validated here, never trusted) */
  focus?: unknown;
}

/** A single-file rendition (og:image, favicon, JSON-LD image). */
export interface AssetUrl {
  url: string;
  width: number;
  height: number;
  mime: string;
}

export interface AssetResolver {
  /** <picture>-ready image; null when the asset is unknown or not an image */
  resolve(ref: AssetRef | null | undefined): ResolvedAsset | null;
  /** the smallest rendition at least `width` px wide (or the largest available) */
  url(ref: AssetRef | null | undefined, width: number): AssetUrl | null;
  /** playable video file; null when the asset is unknown or not a video */
  video(ref: AssetRef | null | undefined): ResolvedVideo | null;
}

const ASSET_ID = /^[a-f0-9]{16,64}$/;
const HEX6 = /^#[0-9a-fA-F]{6}$/;
const VIDEO_MIME = { webm: MIME.webm, mp4: MIME.mp4 } as const;

type Variant = AssetRowLike["variants"][number];

function byWidth(list: readonly Variant[], fmt: MediaFormat): Variant[] {
  return list.filter((v) => v.fmt === fmt && v.w > 0 && v.h > 0).sort((a, b) => a.w - b.w);
}

/** Smallest variant ≥ target, else the largest one. */
function pickWidth(sorted: readonly Variant[], target: number): Variant | undefined {
  return sorted.find((v) => v.w >= target) ?? sorted[sorted.length - 1];
}

const unit = (v: number | undefined, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback);

/**
 * The crop fields of a ResolvedAsset: focal point (merchant fx/fy wins), subject box, keep regions
 * and the subject-aware default object-position. Cutouts keep the classic centred position (they
 * are letterboxed, not cropped).
 */
function cropFields(r: AssetRowLike, ref: AssetRef, width: number, height: number) {
  const aspect = width > 0 && height > 0 ? width / height : 1;
  const focus: AssetFocus | null = parseFocus(r.focus);
  const merchant = ref.fx !== undefined || ref.fy !== undefined;
  const focal = merchant ? { x: unit(ref.fx, 0.5), y: unit(ref.fy, 0.5) } : focus ? { x: focus.x, y: focus.y } : { x: 0.5, y: 0.5 };
  const subject = focus?.box ?? FULL_BOX;
  const keep = focus?.keep ?? [];
  const subjectKind: FocusKind | "none" = focus?.kind ?? "none";
  let position = "50% 50%";
  if (merchant) position = percentPair(focal.x, focal.y);
  else if (focus && !r.alpha) {
    const c = robustCrop({ aspect, focal, subject, keep, kind: subjectKind });
    position = percentPair(c.x, c.y);
  }
  return {
    position,
    aspect,
    focal,
    focalSource: merchant ? ("merchant" as const) : focus ? ("auto" as const) : ("none" as const),
    subject,
    keep,
    subjectKind,
    ...(focus?.foot ? { foot: focus.foot } : {}),
  };
}

/**
 * Storage key of a video asset — the same convention as videoSource() in src/lib/media/assets.ts
 * ("<id>-<width>.<mp4|webm>"), restated here because that module is server-only.
 */
function videoFile(r: AssetRowLike): { key: string; mime: string } | null {
  if (r.kind !== "video" || !(r.width > 0)) return null;
  const fmt = r.mime === VIDEO_MIME.webm ? "webm" : "mp4";
  const key = variantKey(r.id, Math.round(r.width), fmt);
  return KEY_RE.test(key) ? { key, mime: VIDEO_MIME[fmt] } : null;
}

/**
 * Generic row-based resolver. `urlFor(key)` maps a storage key to the URL used in this delivery
 * mode; `onUse(key)` is told about every key that ends up in markup (exports collect them).
 */
export function rowAssetResolver(
  rows: Iterable<AssetRowLike> | ReadonlyMap<string, AssetRowLike>,
  urlFor: (key: string) => string,
  onUse?: (key: string) => void,
): AssetResolver {
  const map = new Map<string, AssetRowLike>();
  const list = rows instanceof Map ? (rows as ReadonlyMap<string, AssetRowLike>).values() : (rows as Iterable<AssetRowLike>);
  for (const r of list) if (r && typeof r.id === "string" && ASSET_ID.test(r.id)) map.set(r.id, r);
  // crop fields per (asset, merchant focal): a page shows one photo in several places
  const crops = new Map<string, ReturnType<typeof cropFields>>();

  const track = (key: string) => {
    onUse?.(key);
    return urlFor(key);
  };
  const lookup = (ref: AssetRef | null | undefined): AssetRowLike | null =>
    ref && typeof ref.id === "string" ? (map.get(ref.id) ?? null) : null;
  const image = (ref: AssetRef | null | undefined): AssetRowLike | null => {
    const r = lookup(ref);
    if (!r || r.kind === "video" || !Array.isArray(r.variants) || r.variants.length === 0) return null;
    return r;
  };
  const fallbackList = (r: AssetRowLike) => {
    const webp = byWidth(r.variants, "webp");
    if (webp.length) return webp;
    const png = byWidth(r.variants, "png");
    return png.length ? png : byWidth(r.variants, "jpeg");
  };

  return {
    resolve(ref) {
      const r = image(ref);
      if (!r || !ref) return null;
      const webp = byWidth(r.variants, "webp");
      const avif = byWidth(r.variants, "avif");
      const fallback = pickWidth(fallbackList(r), 960);
      if (!fallback) return null;
      const srcset = (vs: Variant[]) => vs.map((v) => `${track(v.key)} ${v.w}w`).join(", ");
      const width = r.width > 0 ? r.width : fallback.w;
      const height = r.height > 0 ? r.height : fallback.h;
      const cropKey = `${r.id}|${ref.fx ?? ""}|${ref.fy ?? ""}`;
      let crop = crops.get(cropKey);
      if (!crop) crops.set(cropKey, (crop = cropFields(r, ref, width, height)));
      return {
        id: r.id,
        alt: typeof ref.alt === "string" ? ref.alt : "",
        width,
        height,
        alpha: !!r.alpha,
        dominant: HEX6.test(r.dominant) ? r.dominant : "#cccccc",
        src: track(fallback.key),
        ...(avif.length ? { srcsetAvif: srcset(avif) } : {}),
        srcsetWebp: webp.length ? srcset(webp) : "",
        ...crop,
      };
    },
    url(ref, width) {
      const r = image(ref);
      if (!r) return null;
      const v = pickWidth(fallbackList(r), Math.max(1, width));
      return v ? { url: track(v.key), width: v.w, height: v.h, mime: MIME[v.fmt] } : null;
    },
    video(ref) {
      const r = lookup(ref);
      const file = r ? videoFile(r) : null;
      if (!r || !file) return null;
      return { id: r.id, src: track(file.key), mime: file.mime, width: Math.round(r.width), height: Math.round(r.height) };
    },
  };
}

/** Published pages & admin preview: `/media/<key>` (served by src/app/media/[key]). */
export function liveAssetResolver(rows: Iterable<AssetRowLike> | ReadonlyMap<string, AssetRowLike>): AssetResolver {
  return rowAssetResolver(rows, liveMediaUrl);
}

/**
 * Exports: relative `assets/img/<key>` / `assets/video/<key>` paths; `usedKeys()` lists every file
 * the zip must contain. `prefix` addresses them from a document in a sub-folder ("../" for legal/).
 */
export function exportAssetResolver(
  rows: Iterable<AssetRowLike> | ReadonlyMap<string, AssetRowLike>,
  opts: { prefix?: string } = {},
): { resolver: AssetResolver; usedKeys: () => string[] } {
  const used = new Set<string>();
  const prefix = opts.prefix && /^(\.\.\/)+$/.test(opts.prefix) ? opts.prefix : "";
  const resolver = rowAssetResolver(rows, (k) => prefix + exportMediaPath(k), (k) => used.add(k));
  return { resolver, usedKeys: () => [...used].sort() };
}

/**
 * Dev fixtures / QA: files under public/dev-fixtures, addressed from `base` ("/", or an absolute
 * file:/// URL). Fixture photos carry the same subject analysis as uploads (FIXTURE_FOCUS, generated
 * by scripts/media-backfill.ts --fixtures) unless a row brings its own.
 */
export function fixtureAssetResolver(rows: Iterable<AssetRowLike>, base = "/"): AssetResolver {
  const prefix = base.endsWith("/") ? base : `${base}/`;
  const withFocus = [...rows].map((r) => (r && r.focus === undefined && FIXTURE_FOCUS[r.id] ? { ...r, focus: FIXTURE_FOCUS[r.id] } : r));
  return rowAssetResolver(withFocus, (key) => `${prefix}dev-fixtures/${key}`);
}

const REF_KEYS = new Set(["id", "alt", "fx", "fy", "box"]);

/** Every AssetRef id referenced anywhere in the document (product, items, offers, sections, SEO). */
export function collectAssetIds(doc: PageDoc, extra: readonly (AssetRef | null | undefined)[] = []): string[] {
  const ids = new Set<string>();
  const visit = (v: unknown, depth: number) => {
    if (depth > 14 || v === null || typeof v !== "object") return;
    if (Array.isArray(v)) {
      for (const x of v) visit(x, depth + 1);
      return;
    }
    const o = v as Record<string, unknown>;
    if (typeof o.id === "string" && ASSET_ID.test(o.id) && Object.keys(o).every((k) => REF_KEYS.has(k))) {
      ids.add(o.id);
      return;
    }
    for (const x of Object.values(o)) visit(x, depth + 1);
  };
  visit(doc.product, 0);
  visit(doc.items, 0);
  visit(doc.offers, 0);
  visit(doc.seo, 0);
  for (const s of doc.sections) visit(s.data, 0);
  for (const r of extra) if (r && ASSET_ID.test(r.id)) ids.add(r.id);
  return [...ids];
}

/* ------------------------------------------------------------------ */
/* Store identity                                                      */
/* ------------------------------------------------------------------ */

/**
 * Store identity as stored in Settings → Store (logo not yet resolved, phone numbers as typed).
 * Turned into the sections' StoreContext by storeContext().
 */
export interface StoreInfo {
  name: string;
  legalName?: string;
  phone?: string;
  /** any format the admin typed ("+212 6…", "06…"); normalized to wa.me digits */
  whatsapp?: string;
  email?: string;
  address?: string;
  city?: string;
  /** ISO country of the store (completes national WhatsApp numbers), default "MA" */
  country?: string;
  ice?: string;
  rc?: string;
  logo?: AssetRef;
  socials?: Partial<Record<"instagram" | "facebook" | "tiktok" | "youtube" | "snapchat", string>>;
}

const SOCIALS = ["instagram", "facebook", "tiktok", "youtube", "snapchat"] as const;
const EMAIL = /^[^\s@<>"]{1,64}@[^\s@<>"]{1,190}\.[A-Za-z]{2,24}$/;
const ICE = /^[0-9]{15}$/;
const RC = /^[A-Za-z0-9 ./-]{1,30}$/;
const PHONE = /^\+?[0-9][0-9 ().-]{5,22}$/;

/** C0/C1 control characters (built from char codes: a literal would trip no-control-regex). */
const CONTROLS = new RegExp(`[${String.fromCharCode(0)}-${String.fromCharCode(0x1f)}${String.fromCharCode(0x7f)}-${String.fromCharCode(0x9f)}]`, "g");

/** Collapse whitespace, strip control characters, cap the length; empty → undefined. */
function clean(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.replace(CONTROLS, " ").replace(/\s+/g, " ").trim().slice(0, max);
  return s || undefined;
}

/** https:// URL only (never javascript:, data:, http:), normalized by the URL parser. */
function httpsUrl(v: unknown): string | undefined {
  if (typeof v !== "string" || v.length > 300) return undefined;
  try {
    const u = new URL(v.trim());
    return u.protocol === "https:" && u.hostname.includes(".") ? u.href : undefined;
  } catch {
    return undefined;
  }
}

/** Sanitized StoreContext for sections: validated fields only, WhatsApp in wa.me digits, logo resolved. */
export function storeContext(info: StoreInfo, assets: AssetResolver, fallbackName = "Store"): StoreContext {
  const opt = <K extends keyof StoreContext>(key: K, value: StoreContext[K] | undefined) => (value === undefined ? {} : { [key]: value });
  const phone = clean(info.phone, 30);
  const email = clean(info.email, 160);
  const ice = clean(info.ice, 15);
  const rc = clean(info.rc, 30);
  const socials: NonNullable<StoreContext["socials"]> = {};
  for (const k of SOCIALS) {
    const u = httpsUrl(info.socials?.[k]);
    if (u) socials[k] = u;
  }
  return {
    name: clean(info.name, 80) ?? fallbackName,
    ...opt("legalName", clean(info.legalName, 160)),
    ...opt("phone", phone && PHONE.test(phone) ? phone : undefined),
    ...opt("whatsapp", whatsappDigits(info.whatsapp, info.country ?? "MA") ?? undefined),
    ...opt("email", email && EMAIL.test(email) ? email : undefined),
    ...opt("address", clean(info.address, 300)),
    ...opt("city", clean(info.city, 120)),
    ...opt("ice", ice && ICE.test(ice) ? ice : undefined),
    ...opt("rc", rc && RC.test(rc) ? rc : undefined),
    logo: info.logo ? assets.resolve(info.logo) : null,
    ...(Object.keys(socials).length ? { socials } : {}),
  };
}

/* ------------------------------------------------------------------ */
/* Page links                                                          */
/* ------------------------------------------------------------------ */

export const LEGAL_KINDS = ["privacy", "terms", "shipping", "contact"] as const;
export type LegalKind = (typeof LEGAL_KINDS)[number];

export const isLegalKind = (v: string): v is LegalKind => (LEGAL_KINDS as readonly string[]).includes(v);

/**
 * A store's live page (PUB-16, docs/STORE-SAAS.md §C.4.1): the page at "<base>/<slug>", the store's legal pages at
 * "<base>/policies/<kind>?p=<slug>" (themed like the page). `base` is `storeBase(store)`: "/s/<handle>" in P mode,
 * "" on the store's own host (S, C).
 */
export function storePageLinks(base: "" | `/s/${string}`, slug: string): PageLinks {
  const p = encodeURIComponent(slug);
  return {
    home: `${base}/${p}`,
    privacy: `${base}/policies/privacy?p=${p}`,
    terms: `${base}/policies/terms?p=${p}`,
    shipping: `${base}/policies/shipping?p=${p}`,
    contact: `${base}/policies/contact?p=${p}`,
  };
}

/**
 * The single-tenant root paths (the page at "/<slug>", legal documents at "/legal/<kind>?p=<slug>"): QA renders and
 * the builder preview until their callers move. @deprecated live documents use storePageLinks(storeBase(store), slug).
 */
export function liveLinks(slug: string): PageLinks {
  const p = encodeURIComponent(slug);
  return {
    home: `/${p}`,
    privacy: `/legal/privacy?p=${p}`,
    terms: `/legal/terms?p=${p}`,
    shipping: `/legal/shipping?p=${p}`,
    contact: `/legal/contact?p=${p}`,
  };
}

/** Static export: index.html at the root, legal documents in legal/. `depth` 1 = links from inside legal/. */
export function exportLinks(depth: 0 | 1 = 0): PageLinks {
  const up = depth ? "../" : "";
  const legal = depth ? "" : "legal/";
  return {
    home: `${up}index.html`,
    privacy: `${legal}privacy.html`,
    terms: `${legal}terms.html`,
    shipping: `${legal}shipping.html`,
    contact: `${legal}contact.html`,
  };
}

/** Admin preview: nothing navigates. */
export const PREVIEW_LINKS: PageLinks = { home: "#", privacy: "#", terms: "#", shipping: "#", contact: "#" };

/* ------------------------------------------------------------------ */
/* Context                                                             */
/* ------------------------------------------------------------------ */

export interface RenderContextOptions {
  mode: RenderMode;
  assets: AssetResolver;
  /** URL prefix of static landing assets (fonts): "/" live & preview, "./" export ("../" in sub-folders) */
  base: string;
  /** ISO time of the render (countdowns, "today"); never Date.now() inside components */
  now: string;
  /** public page key (live: pages.publicKey, export: exports.publicKey, preview/dev: a placeholder) */
  pageKey: string;
  /** store identity (Settings → Store) */
  store: StoreInfo;
  /** where the page and its legal documents live in this delivery mode */
  links: PageLinks;
}

/** RenderContext plus what the document shell needs (sections only rely on RenderContext). */
export interface LandingRenderContext extends RenderContext {
  pageKey: string;
  assets: AssetResolver;
}

/**
 * Placeholder names older installs stored before the store was named ("My store"…): never shown as
 * a brand. (The settings default is "" now; the admin's checklist keeps asking for the real name.)
 */
const PLACEHOLDER_STORE_NAME = /^(my store|ma boutique|mon magasin|store|boutique|shop|متجري|المتجر)$/i;

/** True when Settings → Store holds a real store name (not empty, not a placeholder). */
export function isRealStoreName(name: string | undefined | null): boolean {
  const n = clean(name, 80);
  return !!n && !PLACEHOLDER_STORE_NAME.test(n);
}

/** Words that end a short product name ("Abaya de prière | en dentelle…", "Serum | for dry skin"). */
const NAME_BREAK = /^(for|with|and|by|in|pour|avec|et|en|par|sans|à|au|aux|chez|مع|من|في|و|ب|لل.*)$/i;
/** Words a short name never ends on ("Abaya de", "Coffret the"). */
const NAME_TAIL = /^(de|du|des|d'|la|le|les|l'|of|the|a|an|for|with|and|en|et|à|au|aux|pour|avec|و|من|في|مع)$/i;

/**
 * Short form of a product name for the wordmark when the store has no name: the head of the name
 * before any separator ("—", "|", ":", ",", "(", " - "), at most three words, without sizes or
 * trailing connectors. "Abaya de prière en dentelle beige pour fille" → "Abaya de prière";
 * "Sérum Argan Bio 30 ml" → "Sérum Argan Bio"; "عباية صلاة دانتيل للبنات" → "عباية صلاة دانتيل".
 */
export function shortProductName(name: string): string {
  const full = clean(name, 120) ?? "";
  const head = full.split(/\s[—–|·:-]\s|[|:,(（\[/]|\s[—–]/)[0]?.trim() || full;
  const out: string[] = [];
  for (const word of head.split(" ")) {
    if (!word) continue;
    if (out.length >= 3) break;
    // sizes, quantities and references end the name ("30 ml", "x2", "500g", "N°5" stays)
    if (out.length >= 1 && /\d/.test(word) && !/^n[°º]/i.test(word)) break;
    if (out.length >= 2 && NAME_BREAK.test(word)) break;
    out.push(word);
  }
  while (out.length > 1 && NAME_TAIL.test(out[out.length - 1]!)) out.pop();
  let short = out.join(" ");
  if (short.length > 28) {
    // a long first word or two: cut at a word boundary, never mid-word
    const cut = short.slice(0, 28);
    short = cut.includes(" ") ? cut.slice(0, cut.lastIndexOf(" ")) : cut;
  }
  return short || full.slice(0, 28) || "—";
}

export function createRenderContext(doc: PageDoc, opts: RenderContextOptions): LandingRenderContext {
  const at = Date.parse(opts.now);
  if (!Number.isFinite(at)) throw new Error(`createRenderContext: invalid "now" (${String(opts.now)})`);
  const now = new Date(at).toISOString();
  const { locale, currency, theme } = doc;
  const t = createT(locale);
  const seed = theme.seed;
  const money = moneyFormat(currency, locale);
  return {
    mode: opts.mode,
    locale,
    dir: dirOf(locale),
    archetype: theme.archetype,
    seed,
    doc,
    product: doc.product,
    items: doc.items,
    lead: namedLead(doc),
    offers: doc.offers,
    form: doc.form,
    market: marketInfoForLocale(doc.market, locale, doc.form.phoneCountry),
    // no real store name yet: the product speaks for itself (never a made-up "My store")
    store: storeContext(
      isRealStoreName(opts.store.name) ? opts.store : { ...opts.store, name: "" },
      opts.assets,
      shortProductName(doc.product.name),
    ),
    links: opts.links,
    currency,
    money: (amount) => formatMoney(amount, money),
    num: (n) => formatNumber(n, locale),
    t,
    asset: (ref) => (ref ? opts.assets.resolve(ref) : null),
    video: (ref) => (ref ? opts.assets.video(ref) : null),
    rng: (key) => seededRandom(seed, key),
    now,
    base: opts.base,
    ornament: theme.ornament,
    motion: theme.motion,
    pageKey: opts.pageKey,
    assets: opts.assets,
  };
}
