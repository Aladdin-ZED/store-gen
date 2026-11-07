/**
 * FROZEN CONTRACT: written by the R2 contract step (C2-B1, maintainer; docs/STORE-SAAS.md §K.4, storefront.md
 * STO-§27.1, STO ENGP-27 "four frozen files"). Owning track: S1 STOREFRONT builds the store on it; the editor, the
 * checklist, the renderer, design's gate adapter and the core read it. A track never edits this file: a change goes
 * through a CCR to the maintainer (docs/saas/ccr/README.md) and is re-frozen in src/lib/contracts/r2-contract.ts.
 *
 * `KIND_RULES` (STO-§6.1): the single table of the eight store page kinds that `StorePageDoc` (./schema.ts), the store
 * page editor, the store checklist and the renderer read. Isomorphic and pure (no React, no DB, no browser global).
 *
 * What this table does not hold, by design: the per-kind budgets are the `BudgetProfile`s storefront registers from
 * src/lib/render/prepublish/storefront.ts (core §M.2, D66); which landing section types are eligible on a kind is
 * S1's `ELIGIBILITY` (src/storefront/sections/eligibility.ts, STO-§9.1), reached through ./sections/check.ts; the
 * design gates per kind are design's `KIND_GATES` (src/lib/design/gates/kinds.ts, DES-§8.13).
 */
import type { StorePageKind } from "./schema";

/** The store section types of STO-§9.3 (`reviewsVerified` is R3). Never a landing type name (`storeHero`, not `hero`). */
export const STORE_SECTION_TYPES = [
  "storeHero",
  "collectionTiles",
  "productGrid",
  "productDetail",
  "productContent",
  "collectionHeader",
  "collectionProducts",
  "searchResults",
  "cartView",
  "checkoutForm",
  "notFoundBlock",
  "trustStrip",
  "mediaText",
  "richText",
  "whatsappCta",
  "reviewsVerified",
] as const;
export type StoreSectionType = (typeof STORE_SECTION_TYPES)[number];
export const isStoreSectionType = (t: string): t is StoreSectionType => (STORE_SECTION_TYPES as readonly string[]).includes(t);

/** `productGrid.source.kind` (STO-§9.3); `related` exists only on `product`. */
export const GRID_SOURCES = ["collection", "manual", "bestsellers", "newest", "related"] as const;
export type GridSource = (typeof GRID_SOURCES)[number];

/** The visual register of a store document (STO-§8.4, DG-11): thanks, policy and track pages are `transactional`. */
export type Register = "marketing" | "commerce" | "transactional";

/** The store runtime chunks of STO-§14.1 (budget keys of core §H.13). */
export type StoreChunk = "store" | "pdp" | "cart" | "checkout" | "store-pixels" | "store-thanks" | "search";

/**
 * Landing sections on a store kind (STO-§9.1): `none`; `product` = the product set with the PDP's implicit product
 * context; `free` = the product-free set; `free+bound` = the product-free set plus the bound set (`bind.productId`).
 */
export type LandingUse = "none" | "product" | "free" | "free+bound";

/** Robots per kind (STO-§6.1, STO-§20.2): fixed, or read from the product / page / collection row at render. */
export type KindRobots = "index" | "noindex" | "product-seo" | "page-seo" | "index-unless-empty";

export interface KindRule {
  /** the singleton store sections the kind must hold, each exactly once */
  required: readonly StoreSectionType[];
  /** the section that must come first, when the kind has one */
  first: StoreSectionType | null;
  /** the store sections the kind may hold (required ones included) */
  store: readonly StoreSectionType[];
  /** `productGrid` sources allowed on the kind (empty = the kind has no productGrid) */
  gridSources: readonly GridSource[];
  landing: LandingUse;
  /** fewest sections a document of the kind holds */
  minSections: number;
  /** most sections (`product`: 12 outside productContent, whose sections live in products.content) */
  maxSections: number;
  register: Exclude<Register, "transactional">;
  robots: KindRobots;
  /** chunks the kind loads (STO-§14.1); `product` adds `cart` or `checkout` by the buy model and its feature chunks */
  chunks: readonly StoreChunk[];
  /** the template slug (`@<kind>`, never accepted by SLUG_RE) or null for custom pages (owner slugs, STO-§3.1) */
  slug: `@${string}` | null;
}

const MARKETING_STORE = ["storeHero", "collectionTiles", "productGrid", "trustStrip", "mediaText", "richText", "whatsappCta"] as const satisfies readonly StoreSectionType[];
const PRODUCT_FREE_SOURCES = ["collection", "manual", "bestsellers", "newest"] as const satisfies readonly GridSource[];

/** STO-§6.1 / STO-§9.3, the kind table (frozen). */
export const KIND_RULES: Readonly<Record<StorePageKind, KindRule>> = {
  home: { required: [], first: null, store: MARKETING_STORE, gridSources: PRODUCT_FREE_SOURCES, landing: "free+bound", minSections: 2, maxSections: 40, register: "marketing", robots: "index", chunks: ["store", "store-pixels"], slug: "@home" },
  product: {
    required: ["productDetail", "productContent"],
    first: "productDetail",
    store: ["productDetail", "productContent", "productGrid", "trustStrip", "mediaText", "richText", "whatsappCta"],
    gridSources: ["related", "manual", "bestsellers"],
    landing: "product",
    minSections: 2,
    maxSections: 12,
    register: "commerce",
    robots: "product-seo",
    chunks: ["pdp", "store-pixels"],
    slug: "@product",
  },
  collection: {
    required: ["collectionHeader", "collectionProducts"],
    first: "collectionHeader",
    store: ["collectionHeader", "collectionProducts", "productGrid", "trustStrip", "mediaText", "richText", "whatsappCta"],
    gridSources: PRODUCT_FREE_SOURCES,
    landing: "free",
    minSections: 2,
    maxSections: 40,
    register: "commerce",
    robots: "index-unless-empty",
    chunks: ["store"],
    slug: "@collection",
  },
  page: { required: [], first: null, store: MARKETING_STORE, gridSources: PRODUCT_FREE_SOURCES, landing: "free+bound", minSections: 1, maxSections: 40, register: "marketing", robots: "page-seo", chunks: ["store"], slug: null },
  search: { required: ["searchResults"], first: null, store: ["searchResults", "productGrid", "whatsappCta"], gridSources: ["bestsellers", "newest"], landing: "none", minSections: 1, maxSections: 40, register: "commerce", robots: "noindex", chunks: ["store"], slug: "@search" },
  cart: { required: ["cartView"], first: null, store: ["cartView", "productGrid", "trustStrip"], gridSources: ["bestsellers", "newest", "manual"], landing: "none", minSections: 1, maxSections: 40, register: "commerce", robots: "noindex", chunks: ["store", "cart"], slug: "@cart" },
  checkout: { required: ["checkoutForm"], first: "checkoutForm", store: ["checkoutForm", "trustStrip"], gridSources: [], landing: "none", minSections: 1, maxSections: 40, register: "commerce", robots: "noindex", chunks: ["checkout"], slug: "@checkout" },
  not_found: { required: ["notFoundBlock"], first: null, store: ["notFoundBlock", "productGrid", "whatsappCta"], gridSources: ["bestsellers", "newest"], landing: "none", minSections: 1, maxSections: 40, register: "commerce", robots: "noindex", chunks: ["store"], slug: "@not_found" },
};

/** The singleton store sections (the "Required (singletons)" column of STO-§6.1): at most once on any page. */
export const SINGLETON_STORE_SECTIONS: ReadonlySet<StoreSectionType> = new Set(Object.values(KIND_RULES).flatMap((r) => r.required));

/** A kind's register (STO-§8.4): the template kinds only; thanks / policy / track documents are `transactional`. */
export const registerOf = (kind: StorePageKind): Register => KIND_RULES[kind].register;

/** The kind of a template slug (`@product` → "product"), or null for an owner slug (a custom `page`). */
export function kindOfTemplateSlug(slug: string): StorePageKind | null {
  for (const [kind, rule] of Object.entries(KIND_RULES) as [StorePageKind, KindRule][]) if (rule.slug === slug) return kind;
  return null;
}
