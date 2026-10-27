/**
 * Landing kit contracts.
 *
 * RULES FOR EVERY FILE UNDER src/landing (enforced by review):
 *  - Components are PURE: props in → JSX out. NO hooks, NO context, NO "use client",
 *    NO browser globals, NO Date.now()/Math.random() (use ctx.rng / ctx.now).
 *    They are rendered three ways: react-dom/server (publish/export), and React in the admin
 *    preview iframe (via portal). Interactivity is added by the vanilla runtime (src/landing/runtime)
 *    through data-* attributes — never with React event handlers.
 *  - No inline style={{}} except CSS custom properties needed for per-instance values
 *    (e.g. style={{"--rot": "-2deg"}}). Prefer data-attributes + CSS.
 *  - Use logical CSS properties only (RTL must just work).
 *  - Colors/fonts/radii/shadows/motion only through tokens (docs/DESIGN.md §2).
 */
import type { ReactElement, ReactNode } from "react";
import type { z } from "zod";
import type {
  Archetype,
  AssetRef,
  Bundle,
  FormConfig,
  Item,
  Locale,
  Market,
  Offer,
  Offers,
  PageDoc,
  Product,
  SectionBg,
  SectionInstance,
} from "@/lib/page/schema";
import type { UiKey } from "./i18n";
import type { Box as FocusBox, FocusKind, KeepRegion } from "@/lib/media/focus";

export type RenderMode = "live" | "preview" | "export";

/** Resolved asset ready for <picture>. */
export interface ResolvedAsset {
  id: string;
  alt: string;
  width: number;
  height: number;
  /** has transparency (product cutout) */
  alpha: boolean;
  /** dominant color hex — used as placeholder background */
  dominant: string;
  /** fallback src (webp or png) */
  src: string;
  /** "url 480w, url 960w" per format */
  srcsetAvif?: string;
  srcsetWebp: string;
  /**
   * object-position for frames the caller does not describe, e.g. "50% 12%": subject-aware — one
   * position that keeps heads, hands and a product's top inside every usual frame ratio and mask
   * (src/lib/media/focus.ts robustCrop). The merchant's AssetRef fx/fy → exactly "fx% fy%".
   * For a known frame, <Picture frame="…"> fits precisely (and may zoom within limits).
   */
  position: string;
  /** intrinsic aspect ratio, width / height */
  aspect: number;
  /** focal point (0..1): the merchant's AssetRef fx/fy, else the analysed one (eyes level for people), else the centre */
  focal: { x: number; y: number };
  /** where `focal` comes from: the merchant's override, the upload analysis, or nothing (centre) */
  focalSource: "merchant" | "auto" | "none";
  /** subject box {x, y, w, h} (0..1 of the image) — the person or product; the whole image when not analysed */
  subject: FocusBox;
  /** regions a frame edge must never cut (0..1): heads (always inside), hands (inside or fully out), the product */
  keep: readonly KeepRegion[];
  /** what the analysis found; "none" = never analysed (old rows, fixtures without data) */
  subjectKind: FocusKind | "none";
  /** cutouts: x-span (0..1 of the width) where the product meets the floor — sizes the contact shadow */
  foot?: readonly [number, number];
}

/** Resolved video asset (mp4/webm) */
export interface ResolvedVideo {
  id: string;
  src: string;
  mime: string;
  width: number;
  height: number;
  /** poster image if one was uploaded alongside (optional) */
  poster?: string;
}

/** Store identity (admin Settings → Store). Everything optional except the name. */
export interface StoreContext {
  name: string;
  legalName?: string;
  phone?: string;
  /** WhatsApp number in international format, digits only (e.g. "212612345678") */
  whatsapp?: string;
  email?: string;
  address?: string;
  city?: string;
  /** Moroccan company identifiers, shown in the footer when set */
  ice?: string;
  rc?: string;
  logo?: ResolvedAsset | null;
  socials?: { instagram?: string; facebook?: string; tiktok?: string; youtube?: string; snapchat?: string };
}

/** URLs that differ between live pages and static exports. */
export interface PageLinks {
  /** the landing page itself */
  home: string;
  privacy: string;
  terms: string;
  shipping: string;
  contact: string;
  /**
   * "Report this store" (docs/STORE-SAAS.md D76, §C.6; CRIT15): the absolute `reportUrl(store, path)` of the served
   * document, set for live, test and preview renders, undefined in every export (the page runs on the seller's own
   * server). Renderers print it as given: P6's footer, the Shell's fallback row, P3's thank-you and legal pages.
   */
  report?: string;
}

export interface MarketInfo {
  code: Market;
  phoneCountry: string; // "MA"
  phonePrefix: string; // "+212"
  phonePlaceholder: string; // "06 12 34 56 78"
  cities: { value: string; label: string }[]; // already localized
}

export interface RenderContext {
  mode: RenderMode;
  locale: Locale;
  dir: "rtl" | "ltr";
  archetype: Archetype;
  seed: number;
  /** page doc (read-only) for cross-section info (product, items, offers, form...) */
  doc: PageDoc;
  /** the page's story (name, words, photos, rating) */
  product: Product;
  /** what the page sells (items[0] = lead item) */
  items: Item[];
  /** the lead item with its display name (item.name, else the product name) — single-item pages take price and options from it */
  lead: Item & { name: string };
  offers: Offers;
  form: FormConfig;
  market: MarketInfo;
  store: StoreContext;
  links: PageLinks;
  currency: string;
  /** formatted money incl. currency symbol in the page locale, e.g. "249 درهم" / "249 DH" */
  money: (amount: number) => string;
  /** number formatting (thousands separators, locale digits) */
  num: (n: number) => string;
  /** built-in microcopy for the page locale */
  t: (key: UiKey, vars?: Record<string, string | number>) => string;
  /** resolve uploaded asset → URLs. Returns null if the asset is missing. */
  asset: (ref: AssetRef | undefined | null) => ResolvedAsset | null;
  /** resolve an uploaded video asset → playable source. Returns null if missing / not a video. */
  video: (ref: AssetRef | undefined | null) => ResolvedVideo | null;
  /** deterministic PRNG for a given key — same key → same sequence on every render */
  rng: (key: string) => () => number;
  /** ISO time the page was rendered (for countdowns; never use Date.now()) */
  now: string;
  /** URL of the static asset base for fonts/icons in this mode ("/" live, "./" export) */
  base: string;
  /** decorative density 0..2 from theme.ornament */
  ornament: number;
  /** motion level */
  motion: "calm" | "lively" | "off";
}

export interface SectionProps<D> {
  /** section instance id (stable, used for anchors and editor selection) */
  id: string;
  variant: string;
  bg: SectionBg;
  data: D;
  ctx: RenderContext;
  /** index of the section in the page (0-based, after filtering hidden) */
  index: number;
}

/* ------------------------------------------------------------------ */
/* Editor field specs (drive the inspector UI in the admin)            */
/* ------------------------------------------------------------------ */

export type FieldSpec =
  | { kind: "text"; path: string; label: string; max?: number; placeholder?: string; help?: string }
  | { kind: "textarea"; path: string; label: string; max?: number; rows?: number; help?: string }
  | { kind: "number"; path: string; label: string; min?: number; max?: number; step?: number; help?: string }
  | { kind: "money"; path: string; label: string; help?: string }
  | { kind: "toggle"; path: string; label: string; help?: string }
  | { kind: "select"; path: string; label: string; options: { value: string; label: string }[]; help?: string }
  | { kind: "image"; path: string; label: string; help?: string }
  | { kind: "images"; path: string; label: string; max?: number; help?: string }
  | { kind: "datetime"; path: string; label: string; help?: string }
  | { kind: "icon"; path: string; label: string; help?: string }
  | {
      kind: "list";
      path: string;
      label: string;
      /** fields of one item; paths are relative to the item */
      item: FieldSpec[];
      /** label of one item in the list UI, e.g. "Benefit" */
      itemLabel: string;
      /** item path used as the row title in the list UI */
      titlePath?: string;
      min?: number;
      max?: number;
      /** factory for a new empty item */
      newItem: () => Record<string, unknown>;
    }
  | { kind: "group"; label: string; fields: FieldSpec[] };

export type SectionCategory =
  | "top"
  | "hero"
  | "proof"
  | "story"
  | "product"
  | "offer"
  | "conversion"
  | "info"
  | "bottom"
  | "floating";

export interface VariantDef {
  id: string;
  label: string;
  /** one-line description shown in the variant picker */
  description: string;
  /** archetypes this variant suits best (engine preference). Empty = all. */
  archetypes?: Archetype[];
  /** backgrounds this variant supports (default: all) */
  bgs?: SectionBg[];
}

export interface DefaultsInput {
  locale: Locale;
  product: Product;
  /** what the page sells (items[0] = lead item) */
  items: Item[];
  offers: Offers;
  archetype: Archetype;
  /** rng for picking among alternative default copy */
  rng: () => number;
}

export interface SectionDefinition<S extends z.ZodTypeAny = z.ZodTypeAny> {
  type: string;
  label: string; // admin label (English)
  labelFr: string; // admin label (French)
  category: SectionCategory;
  description: string;
  /** at most one per page */
  singleton?: boolean;
  /** cannot be removed (orderForm) */
  required?: boolean;
  variants: VariantDef[];
  schema: S;
  defaults: (input: DefaultsInput) => z.infer<S>;
  fields: FieldSpec[];
  render: (props: SectionProps<z.infer<S>>) => ReactElement | null;
}

export type AnySectionDefinition = SectionDefinition<z.ZodTypeAny>;

/** Helper to get type inference when declaring sections. */
export function defineSection<S extends z.ZodTypeAny>(def: SectionDefinition<S>): SectionDefinition<S> {
  return def;
}

/* Re-exports for convenience in section files */
export type { AssetRef, Bundle, Item, Locale, Offer, Offers, PageDoc, Product, SectionBg, SectionInstance, ReactNode };
