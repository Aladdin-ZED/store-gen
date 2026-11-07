/**
 * FROZEN CONTRACT: written by the R2 contract step (C2-B1, maintainer; docs/STORE-SAAS.md §K.4, storefront.md
 * STO-§27.1, STO ENGP-27 "four frozen files"). Owning track: S1 STOREFRONT builds the store renderer and its sections
 * on it; S2 (themes and brand), S7 (catalog from photos), design's gate adapter and the core read it. A track never
 * edits this file: a change goes through a CCR to the maintainer (docs/saas/ccr/README.md) and is re-frozen in
 * src/lib/contracts/r2-contract.ts.
 *
 * The store render context (STO-§8.1) and the page-kind section contract (STO-§9.2, STO-§6.1): what a store section
 * receives and what its definition declares, so the registry (S1), design's height model and gates (P6, through
 * `features` / `fold` / `grammars`) and the editor agree on one shape. Pure types and constants: no React runtime, no
 * DB, no browser global. The landing `RenderContext` (src/landing/types.ts) is unchanged and is NOT the R1
 * `StoreRenderContext` of src/lib/render/store-context.server.ts (the landing store identity); store pages import this one.
 *
 * The view payloads (`ProductView`, `CollectionView`, `SearchView`, `ChromeData`) and the shopper copy keys
 * (`StoreUiKey`) are S1's own types (./views.ts, ./i18n.ts): S1 widens them without a CCR.
 */
import type { ReactElement } from "react";
import type { z } from "zod";
import type { RenderAddons } from "@/landing/addons/types";
import type { AssetResolver } from "@/landing/context";
import type { FieldSpec, RenderContext, StoreContext, VariantDef } from "@/landing/types";
import type { EffectiveWindow } from "@/lib/callcenter/window";
import type { VariantFeatures } from "@/lib/design/types";
import type { Cents } from "@/lib/page/money";
import type { Grammar, Locale, Market, ProductCategory, SectionBg } from "@/lib/page/schema";
import type { StoreRow } from "@/lib/tenancy/types";
import type { BuiltTheme } from "@/lib/theme/types";
import type { FoldLayout } from "./fold";
import type { StoreUiKey } from "./i18n";
import type { Register } from "./kinds";
import type { StorePageKind } from "./schema";
import type { ChromeData, CollectionView, ProductView, SearchView } from "./views";

export type { Register } from "./kinds";

/** Every store document the renderer builds: the eight page kinds and the three chrome documents without a page row. */
export type StoreDocKind = StorePageKind | "thanks" | "policy" | "track";

/** The policy pages of the store chrome (`/policies/<kind>`, STO-§6.5, core §C.4.1). */
export const STORE_POLICY_KINDS = ["privacy", "terms", "shipping", "returns", "contact"] as const;
export type StorePolicyKind = (typeof STORE_POLICY_KINDS)[number];

/** Collection and grid sort keys (STO-§13.2); `available` products first in every sort. */
export const SORT_KEYS = ["featured", "newest", "price_asc", "price_desc", "bestsellers"] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export interface StoreLinks {
  home(): string;
  product(slug: string): string;
  collection(slug: string, q?: { page?: number; sort?: SortKey }): string;
  page(slug: string): string;
  policy(kind: StorePolicyKind): string;
  search(q?: string): string;
  cart(): string;
  checkout(): string;
  thanks(): string;
  track(): string;
  /** storeUrl (canonical, og, JSON-LD) */
  absolute(path: string): string;
  /** rev 4 (core D76, LAN-§3.9): platformOrigin() + "/report/<h>?p=" + the path without query (the maintainer's helper that also builds landing's ctx.links.report) */
  report(path: string): string;
}

/** From the `policies`, `store`, `checkout` and `ops` settings; absent = not stated by the owner (owner rule 4). */
export interface StoreFacts {
  /** store mode is COD-only in R2 / R3 */
  cod: true;
  /** "vérifiez avant de payer": true only when `policies.inspection === "allowed"` */
  inspection?: boolean;
  /** `policies.returns.windowDays` when `policies.returns.accepted !== false` */
  returnsDays?: number;
  /** `policies.exchange.windowDays` when `policies.exchange.accepted !== false` */
  exchangeDays?: number;
  /** = `checkout.confirmationCall` */
  callPromise?: boolean;
  /**
   * The ONE calling window (rev 3 OPS-11, STO-D45; rev 4 CRIT3): operations' `EffectiveWindow` from
   * `callingWindowFor(scope)`, passed through as is; set only when `shopperPromiseAllowed(w)` (= `w.configured`, OPE
   * OD63). P4's default window is an operations default, not a stated fact: with it no hours line and no "{when}".
   */
  callingWindow?: EffectiveWindow;
  whatsapp?: string;
  phone?: string;
  email?: string;
  legalName?: string;
  city?: string;
  ice?: string;
  rc?: string;
}

/** From delivery_zones + the fallback fee (STO-D10); null fields = not set. Over the served zones. */
export interface DeliverySummary {
  enabled: boolean;
  minFeeCents: number | null;
  maxFeeCents: number | null;
  freeFromCents: number | null;
  etaMinDays: number | null;
  etaMaxDays: number | null;
}

export interface StoreRenderContext {
  mode: "live" | "preview" | "test";
  kind: StoreDocKind;
  register: Register;
  /** core §H.13 (D62): add-on chunks, data blocks, extra CSS, `banner: "test"` (STO-D33); `exp-head` / `exp` in R3 */
  addons: RenderAddons;
  /**
   * The compiled page genes the document was built with (DNA card, STO-D39); null for utility kinds (rev 3, ENGP-1:
   * utility kinds carry the brand's house genes only, are never pooled and never novelty-checked).
   */
  genome: { grammar: Grammar; heroFamily: string; why: string[] } | null;
  locale: Locale;
  dir: "rtl" | "ltr";
  /** `key` = the storage prefix (the handle, STO-§14.5) */
  store: StoreContext & { id: string; handle: string; market: Market; currency: string; key: string };
  links: StoreLinks;
  theme: BuiltTheme;
  catalogVersion: number;
  /** pages.public_key of the template (`ctx` of the beacons and the checkout, STO-§16.1) */
  contextKey: string;
  money(cents: Cents): string;
  num(n: number): string;
  /** STO-§24 */
  t(key: StoreUiKey, vars?: Record<string, string | number>): string;
  asset: AssetResolver["resolve"];
  video: AssetResolver["video"];
  /** seeded by stores.brand_seed + page id (deterministic per store) */
  rng(key: string): () => number;
  now: string;
  chrome: ChromeData;
  facts: StoreFacts;
  delivery: DeliverySummary;
  product?: ProductView;
  collection?: CollectionView;
  search?: SearchView;
  /** landing RenderContext for an eligible landing section: the PDP product, or the section's bound product (null = gone) */
  landingCtx(productId?: string): RenderContext | null;
}

/** The catalogue facts the generators and the home grammar read (STO-§11.1). */
export interface CatalogShape {
  activeProducts: number;
  collections: number;
  bestsellers: boolean;
  cutouts: number;
  /** rev 5 (CRIT2-20): photos meeting design's H13 `full-bleed-crop` rule (DES-§4.4) for the slots the bleed family declares */
  wideImages: number;
  categories: ProductCategory[];
  heroProductId?: string;
  /** a drop */
  launchAt?: string;
}

/** What a section's `defaults()` receives (STO-§9.2). */
export interface StoreDefaultsInput {
  kind: StorePageKind;
  store: StoreRow;
  shape: CatalogShape;
  locale: Locale;
  rng: () => number;
}

/** A card source the renderer loads in one query (STO-§7.3; the `productGrid.source` kinds of STO-§9.3). */
export type DataNeed =
  | { kind: "collection"; collectionId: string; limit: number; sort?: SortKey }
  | { kind: "manual"; productIds: string[]; limit: number }
  | { kind: "bestsellers" | "newest" | "related"; limit: number };

export interface StoreSectionProps<D> {
  id: string;
  variant: string;
  bg: SectionBg;
  data: D;
  ctx: StoreRenderContext;
  index: number;
}

/**
 * The page-kind section contract (STO-§9.2): one store section type. Pure like `src/landing/types.ts` (logical CSS
 * properties, tokens only, per-variant CSS chunk, no hook, no browser global, ar / fr / en defaults).
 */
export interface StoreSectionDefinition<S extends z.ZodTypeAny = z.ZodTypeAny> {
  type: string;
  label: string;
  labelFr: string;
  /** the kinds the section may appear on (KIND_RULES[kind].store is the same set, ./kinds.ts) */
  kinds: readonly StorePageKind[];
  singleton?: boolean;
  requiredIn?: readonly StorePageKind[];
  /** VariantDef of src/landing/types.ts (archetypes, bgs) */
  variants: VariantDef[];
  /** variant ids that count toward the one-bento budget */
  bento?: readonly string[];
  /** rev 2: per-variant features for the slop score and the height model (DES-§8.4 `VariantFeatures`, incl. `h`, `slots`, `glass`, `centered`, `signature`); every variant has one */
  features: Record<string, VariantFeatures>;
  /** rev 2: hero families only (storeHero, productDetail, collectionHeader): the design grammars each variant serves (= FAMILY_GRAMMARS, ./fold.ts) */
  grammars?: Record<string, readonly Grammar[]>;
  /** hero families only: each variant's declared fold layout (STO-§9.5; = foldLayoutFor, ./fold.ts) */
  fold?: Record<string, FoldLayout>;
  schema: S;
  defaults(input: StoreDefaultsInput): z.infer<S>;
  /** inspector (src/landing/types.ts vocabulary) */
  fields: FieldSpec[];
  /** card sources the renderer loads in one query (STO-§7.3) */
  needs?(data: z.infer<S>, kind: StorePageKind): DataNeed[];
  render(props: StoreSectionProps<z.infer<S>>): ReactElement | null;
}
