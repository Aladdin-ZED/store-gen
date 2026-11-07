/**
 * The R2 contract (maintainer; docs/STORE-SAAS.md §K.4 "Contract step (maintainer)", §K.3): a compile-time check that
 * every contract the R2 contract step froze for the seven R2 tracks (S1 … S7) keeps its file, its name and its shape.
 * Types only: nothing here runs and nothing imports it. A track that renames, removes or re-types a frozen export
 * breaks `tsc` (and so `npm run gate`); a change goes through a CCR (docs/saas/ccr/README.md) and the maintainer
 * updates the entry with it.
 *
 * Step C2-B1 (frozen contracts): payload v3 and `OrderItemsV3` (src/lib/orders/contract-v3.ts, STO-§16.1, §16.4,
 * §15.11), the typed unions of `orders.items` / `pages.draft` / `page_versions.doc` (STO-R2, STO-R8), the widened
 * `OrderDraft` (D72, STO-R12 (a)), the four frozen storefront files (src/storefront/{types,schema,kinds,fold}.ts, STO
 * ENGP-27) with the S1 stubs they read (signatures only), and design's widenings (FoldItem, GateInput.doc, genomeOf,
 * estimateHeights, gateInputFor; DES-§8.13, DES-R27, STO-R29).
 */
import type { ReactElement } from "react";
import type { z } from "zod";
import type { OrderItems, orders, pages, pageVersions } from "@/lib/db/schema";
import type * as derive from "@/lib/design/derive";
import type * as gateInput from "@/lib/design/gate-input";
import type { GateInput, StorePageDoc as GateStoreDoc, StorePageKind as GateStoreKind } from "@/lib/design/gates/types";
import type * as heights from "@/lib/design/heights";
import type { DesignGenome } from "@/lib/design/genome";
import type { PhotoFacts } from "@/lib/design/photo-facts";
import type { FoldItem, FoldLayoutData, HeightReport, VariantFeaturesResolved } from "@/lib/design/types.frozen";
import type { OrderDraft } from "@/lib/orders/create";
import type * as v3 from "@/lib/orders/contract-v3";
import type { DeliveryRule, LineFieldKey, LineVerdict, OrderFieldErrorsV3, OrderItemsV3, OrderLineV3, OrderResponseV3 } from "@/lib/orders/contract-v3";
import type { Grammar, Locale, Market, PageDoc, ThemeLook } from "@/lib/page/schema";
import type * as fold from "@/storefront/fold";
import type * as kinds from "@/storefront/kinds";
import type * as sfSchema from "@/storefront/schema";
import type { AnyPageDoc, StorePageDoc, StorePageKind, StoreSectionInstance } from "@/storefront/schema";
import type * as sectionCheck from "@/storefront/sections/check";
import type * as sectionFeatures from "@/storefront/sections/features";
import type { CatalogShape, DataNeed, DeliverySummary, Register, StoreDocKind, StoreFacts, StoreLinks, StoreRenderContext, StoreSectionDefinition, StoreSectionProps } from "@/storefront/types";

type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;

/* ------------------------------------------------------------------ */
/* payload v3, OrderItemsV3 (src/lib/orders/contract-v3.ts)            */
/* ------------------------------------------------------------------ */

export type C2B1OrdersV3 = [
  Assert<Equals<keyof v3.OrderPayloadV3, "v" | "surface" | "ctx" | "idem" | "eventId" | "lines" | "cv" | "dl" | "st" | "name" | "phone" | "city" | "address" | "postal" | "note" | "email" | "wa" | "website" | "t" | "utm" | "fbp" | "fbc" | "ttp" | "ref" | "locale" | "cf" | "coupon" | "test">>,
  Assert<Equals<v3.OrderPayloadV3["v"], 3>>,
  Assert<Equals<v3.OrderPayloadV3["surface"], "pdp" | "cart" | "buy_now">>,
  Assert<Equals<keyof v3.LineIn, "pk" | "rev" | "bundleId" | "units" | "extras" | "n" | "ls">>,
  Assert<Equals<keyof v3.LeadPayloadV3, "v" | "kind" | "ctx" | "idem" | "phone" | "name" | "city" | "lines" | "utm" | "locale" | "test">>,
  Assert<Equals<v3.LeadPayloadV3["kind"], "form" | "whatsapp">>,
  Assert<Equals<typeof v3.parseOrderPayloadV3, (raw: unknown) => { ok: true; data: v3.OrderPayloadV3 } | { ok: false; fields: OrderFieldErrorsV3 }>>,
  Assert<Equals<LineFieldKey, `l.${number}` | `l.${number}.n` | `l.${number}.bundleId` | `l.${number}.u.${string}` | `l.${number}.s.${string}` | `l.${number}.x.${string}`>>,
  Assert<Equals<keyof LineVerdict, "i" | "state" | "subCents" | "lineCents" | "rev" | "label" | "text">>,
  Assert<Equals<Extract<OrderResponseV3, { ok: false }>["error"], "invalid" | "stale" | "not_served" | "rate_limited" | "blocked" | "unavailable" | "server">>,
  Assert<Equals<keyof Extract<OrderResponseV3, { ok: true }>, "ok" | "orderId" | "totalCents" | "deliveryCents" | "currency" | "lines" | "track" | "wa" | "duplicate">>,
  Assert<Equals<DeliveryRule, "free_offer" | "free_threshold" | "zone" | "fallback" | "coupon">>,
  Assert<Equals<keyof OrderLineV3, "productId" | "productKey" | "slug" | "productName" | "rev" | "n" | "pack" | "subCents" | "lineCents" | "src">>,
  Assert<Equals<OrderLineV3["pack"], OrderItems>>,
  Assert<Equals<keyof OrderItemsV3, "v" | "surface" | "ctxPageId" | "lines" | "delivery" | "discount" | "contact">>,
  Assert<Equals<OrderItemsV3["surface"], "pdp" | "cart" | "buy_now" | "merge">>,
  Assert<Equals<typeof v3.orderItemsView, (items: v3.AnyOrderItems) => OrderItems>>,
  Assert<Equals<typeof v3.isItemsV3, (items: v3.AnyOrderItems) => items is OrderItemsV3>>,
];

/* ------------------------------------------------------------------ */
/* the typed columns and the widened OrderDraft (STO-R2, STO-R8, D72)   */
/* ------------------------------------------------------------------ */

export type C2B1Columns = [
  Assert<Equals<(typeof orders.$inferSelect)["items"], OrderItems | OrderItemsV3>>,
  Assert<Equals<(typeof pages.$inferSelect)["draft"], PageDoc | StorePageDoc>>,
  Assert<Equals<(typeof pageVersions.$inferSelect)["doc"], PageDoc | StorePageDoc>>,
  // createOrderRow(draft, ctx) is T3's R1.0 extraction (D72); the R2 step widens only its input: the items union, a
  // NULL page_id / version_id (a store order) and catalog_version (STO-§16.4)
  Assert<Equals<OrderDraft["items"], OrderItems | OrderItemsV3>>,
  Assert<Equals<OrderDraft["pageId"], string | null | undefined>>,
  Assert<Equals<OrderDraft["versionId"], string | null | undefined>>,
  Assert<Equals<OrderDraft["catalogVersion"], number | null | undefined>>,
];

/* ------------------------------------------------------------------ */
/* the four frozen storefront files                                    */
/* ------------------------------------------------------------------ */

export type C2B1Storefront = [
  Assert<Equals<StorePageKind, "home" | "product" | "collection" | "page" | "search" | "cart" | "checkout" | "not_found">>,
  Assert<Equals<keyof StorePageDoc, "v" | "kind" | "locale" | "title" | "sections" | "seo">>,
  Assert<Equals<StorePageDoc["v"], 1>>,
  Assert<Equals<StoreSectionInstance["bind"], { productId: string } | undefined>>,
  Assert<Equals<AnyPageDoc, { kind: "landing"; doc: PageDoc } | { kind: StorePageKind; doc: StorePageDoc }>>,
  Assert<Equals<typeof sfSchema.readPageDoc, (kind: string, raw: unknown) => AnyPageDoc | null>>,
  Assert<Equals<typeof sfSchema.storeDocIssues, (doc: StorePageDoc, c: z.RefinementCtx) => void>>,
  Assert<Equals<typeof sfSchema.isLandingDoc, (d: PageDoc | StorePageDoc) => d is PageDoc>>,
  Assert<Equals<keyof kinds.KindRule, "required" | "first" | "store" | "gridSources" | "landing" | "minSections" | "maxSections" | "register" | "robots" | "chunks" | "slug">>,
  Assert<Equals<keyof typeof kinds.KIND_RULES, StorePageKind>>,
  Assert<Equals<Register, "marketing" | "commerce" | "transactional">>,
  Assert<Equals<StoreDocKind, StorePageKind | "thanks" | "policy" | "track">>,
  Assert<Equals<fold.FoldLayout, FoldLayoutData>>,
  Assert<Equals<keyof fold.FoldLayout, "mustShow" | "bottoms" | "perNameLine" | "perOfferCard" | "text">>,
  Assert<Equals<fold.HeroFamily, "stage" | "editorial-split" | "poster-type" | "bento-lead" | "cinematic-bleed" | "quiet-luxe" | "catalogue-index" | "specimen-sheet">>,
  Assert<Equals<fold.PdpFamily, "split" | "stacked" | "rail" | "immersive" | "specimen" | "quiet">>,
  Assert<Equals<typeof fold.FAMILY_GRAMMARS, Readonly<Record<fold.HeroFamily | fold.PdpFamily, readonly Grammar[]>>>>,
  Assert<Equals<typeof fold.foldLayoutFor, (kind: StorePageKind, variant: string) => fold.FoldLayout | null>>,
  Assert<Equals<typeof fold.checkFold, (doc: StorePageDoc, kind: StorePageKind, variant: string, locale: Locale, sample: { nameLines: 2 | 3; offerCards: number; announcement: boolean }) => fold.FoldIssue[]>>,
  Assert<Equals<keyof fold.FoldIssue, "item" | "top" | "level" | "estimated">>,
  Assert<Equals<keyof StoreLinks, "home" | "product" | "collection" | "page" | "policy" | "search" | "cart" | "checkout" | "thanks" | "track" | "absolute" | "report">>,
  Assert<Equals<keyof StoreFacts, "cod" | "inspection" | "returnsDays" | "exchangeDays" | "callPromise" | "callingWindow" | "whatsapp" | "phone" | "email" | "legalName" | "city" | "ice" | "rc">>,
  Assert<Equals<keyof DeliverySummary, "enabled" | "minFeeCents" | "maxFeeCents" | "freeFromCents" | "etaMinDays" | "etaMaxDays">>,
  Assert<
    Equals<
      keyof StoreRenderContext,
      | "mode" | "kind" | "register" | "addons" | "genome" | "locale" | "dir" | "store" | "links" | "theme" | "catalogVersion" | "contextKey" | "money" | "num" | "t" | "asset" | "video" | "rng" | "now" | "chrome" | "facts" | "delivery" | "product" | "collection" | "search" | "landingCtx"
    >
  >,
  Assert<Equals<keyof CatalogShape, "activeProducts" | "collections" | "bestsellers" | "cutouts" | "wideImages" | "categories" | "heroProductId" | "launchAt">>,
  Assert<Equals<DataNeed["kind"], "collection" | "manual" | "bestsellers" | "newest" | "related">>,
  Assert<Equals<keyof StoreSectionProps<unknown>, "id" | "variant" | "bg" | "data" | "ctx" | "index">>,
  Assert<
    Equals<keyof StoreSectionDefinition, "type" | "label" | "labelFr" | "kinds" | "singleton" | "requiredIn" | "variants" | "bento" | "features" | "grammars" | "fold" | "schema" | "defaults" | "fields" | "needs" | "render">
  >,
  Assert<Equals<ReturnType<StoreSectionDefinition["render"]>, ReactElement | null>>,
  // the S1 stubs the frozen files call: their signatures are frozen, their bodies are S1's
  Assert<Equals<typeof sectionCheck.storeSectionIssue, (section: StoreSectionInstance, kind: StorePageKind) => string | null>>,
  Assert<Equals<typeof sectionCheck.storeDocExtraIssues, (doc: StorePageDoc) => { path: (string | number)[]; message: string }[]>>,
  Assert<Equals<typeof sectionFeatures.storeVariantFeatures, (type: string, variant: string, data: unknown) => VariantFeaturesResolved>>,
];

/* ------------------------------------------------------------------ */
/* design's widenings (DES-§8.13, DES-R27, STO-R29)                    */
/* ------------------------------------------------------------------ */

export type C2B1Design = [
  Assert<Equals<FoldItem, "image" | "price" | "cta" | "cod" | "name" | "identity" | "collections">>,
  Assert<Equals<NonNullable<VariantFeaturesResolved["fold"]>["layout"], FoldLayoutData | undefined>>,
  Assert<Equals<GateStoreDoc, StorePageDoc>>,
  Assert<Equals<GateStoreKind, StorePageKind | "policy">>,
  Assert<Equals<GateInput["doc"], PageDoc | StorePageDoc>>,
  Assert<Equals<typeof derive.genomeOf, (doc: PageDoc | StorePageDoc, opts?: { photos?: PhotoFacts; look?: ThemeLook | null; market?: Market }) => DesignGenome>>,
  Assert<
    Equals<
      typeof heights.estimateHeights,
      (doc: PageDoc | StorePageDoc, opts: { look: ThemeLook | null; locale: Locale; features: (type: string, variant: string, data: unknown) => VariantFeaturesResolved }) => HeightReport
    >
  >,
  Assert<Equals<typeof gateInput.gateInputFor, (doc: PageDoc | StorePageDoc, ctx: gateInput.GateInputCtx) => GateInput>>,
  Assert<Equals<gateInput.GateInputCtx["market"], Market | undefined>>,
];
