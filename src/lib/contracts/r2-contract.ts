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
 *
 * Step C2-B2 (shared code): the seams the tracks fill and the core's call lines (`C2B2Seams` below): the product and
 * store-page key resolvers (STO-R1), `attachedDocFor` in `orderVersion` and `contentIdOf` (STO-R12 (b), (c)),
 * `ensureTemplateSet` with the mode writer (STO-R17, ENGP-25), `wrapInStoreChrome` (STO-R36), the `catalog_version`
 * bumps (STO-R19, STO-D47), `republishAttached` as the attached pages' render handler (LAN Q24, STO-R41),
 * `onLeadCreated` / `leadCreatedWebhooks` (OPE Q.18), `bumpVersionStats` (LAN Q26, AI R22), the actor kinds (AI R37,
 * R45), `keepPng` (DES-R14) and LP-16's runtime config v3, toggle seam and server zone (D75).
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
import type * as publicKeys from "@/lib/tenancy/public";
import type * as resolveMod from "@/lib/orders/resolve";
import type * as attachCatalog from "@/lib/catalog/attach.server";
import type * as catalogDelivery from "@/lib/catalog/delivery";
import type * as renderConfig from "@/lib/render/config";
import type * as templates from "@/lib/storefront/templates.server";
import type * as chrome from "@/lib/storefront/chrome.server";
import type * as catalogVersion from "@/lib/tenancy/catalog-version";
import type * as attachLanding from "@/lib/landing/attach.server";
import type * as hooksMod from "@/lib/orders/hooks";
import type * as webhooksLead from "@/lib/webhooks/lead";
import type * as versionStats from "@/lib/stats/version";
import type * as landingV3 from "@/lib/render/landing-v3.server";
import type * as storeProfile from "@/lib/admin-data/store-profile";
import type { ProductRow, AttachOpts } from "@/lib/db/schema";
import type { LandingRuntimeConfig, LandingRuntimeConfigV3 } from "@/landing/runtime/config";
import type { ZoneTable } from "@/lib/delivery/types";
import type { OrderActor } from "@/lib/orders/state";
import type { ProcessOptions } from "@/lib/media/process";
import type { RerenderResult } from "@/lib/render/publish.server";
import type { RenderReason } from "@/lib/jobs/renders";
import type { Actor, StoreScope, WriteScope } from "@/lib/tenancy/types";
import type { ResolvePurpose } from "@/lib/orders/resolve";
import type { StoreMode } from "@/lib/tenancy/mode";

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

/* ------------------------------------------------------------------ */
/* Step C2-B2: the shared code the contract step owns (seams, bumps)   */
/* ------------------------------------------------------------------ */

export type C2B2Seams = [
  // STO-R1: products.public_key and store-page keys → the store (D28)
  Assert<Equals<typeof publicKeys.resolveProductKey, (key: string, opts?: { purpose?: ResolvePurpose }) => Promise<publicKeys.PublicProductTarget | null>>>,
  Assert<Equals<publicKeys.PublicProductTarget["product"], ProductRow>>,
  Assert<Equals<typeof publicKeys.resolveContextKey, (key: string) => Promise<publicKeys.PublicContextTarget | null>>>,
  Assert<Equals<publicKeys.PublicContextTarget["page"], { id: string; kind: StorePageKind }>>,
  // STO-R12 (b): attached landings priced from the live product (S1's body), the runtime of a version
  Assert<Equals<typeof attachCatalog.attachedDocFor, (scope: StoreScope, target: attachCatalog.AttachedTarget) => Promise<PageDoc>>>,
  Assert<Equals<keyof attachCatalog.AttachedTarget, "pageId" | "productId" | "versionId" | "doc">>,
  Assert<Equals<typeof resolveMod.versionRuntimeV, (scope: StoreScope, versionId: string) => Promise<number | null>>>,
  // STO-R12 (c), LAN Q25: catalog content ids
  Assert<Equals<typeof renderConfig.contentIdOf, (item: Pick<import("@/lib/page/schema").Item, "id" | "sku">, productKey: string) => string>>,
  // STO-§15.9: the one delivery fee rule (S1's file; LP-16 calls it)
  Assert<Equals<typeof catalogDelivery.storeDeliveryFee, (i: { zone: catalogDelivery.ZoneFee | null; fallbackFeeCents: number | null; subtotalCents: number; allLinesFree: boolean }) => catalogDelivery.DeliveryResult>>,
  Assert<Equals<typeof catalogDelivery.zoneFeeOfTable, (t: ZoneTable, value: string) => catalogDelivery.ZoneFee | null>>,
  Assert<Equals<typeof catalogDelivery.landingZoneFee, (i: { zone: catalogDelivery.ZoneFee | null; pageFeeCents: number; subtotalCents: number; allLinesFree: boolean }) => number>>,
  // STO-R17: the template set (S1's body), called by the mode writer and pending → active
  Assert<Equals<typeof templates.ensureTemplateSet, (scope: WriteScope, opts?: { actor?: Actor }) => Promise<{ created: StorePageKind[]; published: StorePageKind[] }>>>,
  Assert<Equals<typeof storeProfile.updateStoreMode, (scope: WriteScope, current: import("@/lib/tenancy/types").StoreRow, mode: StoreMode, actor: Actor) => Promise<boolean>>>,
  // STO-R18 / R36: the store chrome of landing's track route (S1's body)
  Assert<Equals<typeof chrome.wrapInStoreChrome, (scope: StoreScope, html: string, kind: "track") => Promise<string>>>,
  // STO-R19, STO-D47: stores.catalog_version bumps
  Assert<Equals<typeof catalogVersion.bumpCatalogVersion, (scope: WriteScope, reason: catalogVersion.CatalogBumpReason) => Promise<void>>>,
  Assert<Equals<typeof catalogVersion.bumpCatalogVersionForAsset, (scope: WriteScope, assetId: string) => Promise<boolean>>>,
  // LAN Q24, STO-R41: every render job of an attached page (S1's body)
  Assert<Equals<typeof attachLanding.republishAttached, (scope: WriteScope, pageId: string, opts: { reason: RenderReason; actor: Actor }) => Promise<RerenderResult>>>,
  // OPE Q.18: the lead hook and S5's webhooks
  Assert<Equals<typeof hooksMod.onLeadCreated, (scope: WriteScope, lead: hooksMod.LeadRow, tx?: hooksMod.Tx) => Promise<void>>>,
  Assert<Equals<typeof webhooksLead.leadCreatedWebhooks, (scope: WriteScope, lead: hooksMod.LeadRow, tx?: hooksMod.Tx) => Promise<void>>>,
  // LAN Q26, AI R22: per-version stats (S7's body)
  Assert<Equals<typeof versionStats.bumpVersionStats, (scope: WriteScope, pageId: string, versionId: string, day: string, utmSource: string, delta: versionStats.VersionStatsDelta, variantKey?: string) => Promise<void>>>,
  // AI R37, R45: the actor kinds ("integration" = a carrier adapter only)
  Assert<Equals<OrderActor["kind"], "user" | "system" | "api" | "bot" | "customer" | "sheet" | "carrier" | "integration" | "reconciliation">>,
  // DES-R14
  Assert<Equals<ProcessOptions["keepPng"], boolean | undefined>>,
  // LP-16 (D75): config v3, the toggle seam, the server zone
  Assert<Equals<LandingRuntimeConfigV3, Omit<LandingRuntimeConfig, "v"> & { v: 3; zones: ZoneTable }>>,
  Assert<Equals<AttachOpts["chargeByCity"], boolean | undefined>>,
  Assert<Equals<typeof landingV3.chargesByCity, (scope: StoreScope, pageId: string) => Promise<boolean>>>,
  Assert<Equals<typeof landingV3.setChargeByCity, (scope: WriteScope, pageId: string, on: boolean) => Promise<boolean>>>,
  Assert<Equals<typeof landingV3.landingShippingZone, (scope: StoreScope, versionId: string, city: unknown) => Promise<{ zone: catalogDelivery.ZoneFee | null } | undefined>>>,
];
