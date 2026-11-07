/**
 * The R2 cross-track stubs (maintainer; docs/STORE-SAAS.md §K.4 "Contract step (maintainer)", step C2-C; the list with
 * owners and callers: docs/saas/ccr/r2-stubs.md). A compile-time check, types only: nothing here runs and nothing
 * imports it. Each R2 track builds alone in its worktree against these signatures; the OWNING track replaces the stub
 * body and keeps the signature. A track that renames, removes or re-types a frozen export breaks `tsc` (and so
 * `npm run gate`); a change goes through a CCR (docs/saas/ccr/README.md) and the maintainer updates the entry here.
 * Payload types are frozen by NAME (`Promise<CashHeldSummary | null>`), so the owner may add optional fields to them
 * without a CCR; parameter lists, return unions and the frozen literal unions may not change.
 *
 * Also frozen here (C2-C): the STO-R19 functions S1 consumes from FINISHED R1 modules (P3's delivery engine, tracking
 * links and WhatsApp text; P4's city key and calling window). They exist and are not stubbed; S1 imports them from the
 * paths below and writes nothing in `src/lib/delivery/**` or `src/lib/callcenter/**`.
 */
import type { ReactElement } from "react";
import type { z } from "zod";
import type { NotBuiltYet, R2Track } from "./not-built";
import type { ActionResult, Actor, StoreCtx, StoreRow, StoreScope, WriteCtx, WriteScope } from "@/lib/tenancy/types";
import type { ProductRow, OrderUnit, IMPORT_KINDS } from "@/lib/db/schema";
import type { DeliveryRule, LineIn, LineVerdict, OrderItemsV3 } from "@/lib/orders/contract-v3";
import type { Tx, OrderRow } from "@/lib/orders/hooks";
import type { Locale, PageDoc, ThemeSpec } from "@/lib/page/schema";
import type { PageGenes } from "@/lib/design/genome";
import type { Compiled, PlanDirectives } from "@/lib/design/compile";
import type { BuiltTheme } from "@/lib/theme/types";
import type { Register } from "@/storefront/kinds";
import type { PdpFamily } from "@/storefront/fold";
import type { PageKind, StorePageDoc, StorePageKind } from "@/storefront/schema";
import type { CatalogShape } from "@/storefront/types";
import type { StorePermission } from "@/lib/auth/permissions";
import type { FeatureKey } from "@/lib/tenancy/entitlement-keys";
import type { MoneyState, ShipState } from "@/lib/orders/state";
import type { TextMode } from "@/lib/orders/text";
import type { AiPolicy } from "@/lib/ai/policy";
import type { RepairOp } from "@/lib/design/gates/repair";
import type { DirectorReviewProps } from "@/components/builder/ai/director-review";
import type { MailMessage, Mailer } from "@/lib/mail";
// S1 STOREFRONT
import type * as orderV3 from "@/lib/catalog/order-v3.server";
import type * as catalogSchema from "@/lib/catalog/schema";
import type * as productsRepo from "@/lib/catalog/products.server";
import type * as fromPhotos from "@/lib/catalog/from-photos.server";
import type * as blueprintShape from "@/lib/catalog/blueprint";
import type * as blueprintApply from "@/lib/catalog/blueprint.server";
import type * as orderTextV3 from "@/lib/catalog/order-text-v3";
import type * as contentsV3 from "@/lib/catalog/contents";
import type * as inventory from "@/lib/catalog/inventory.server";
import type * as catalogConsole from "@/lib/catalog/console";
import type * as storeDefaults from "@/lib/storefront/defaults";
import type * as onboarding from "@/lib/storefront/onboarding.server";
import type * as storeRender from "@/lib/storefront/render.server";
import type * as storePaths from "@/lib/storefront/paths.server";
import type * as homeGrammar from "@/storefront/home/grammar";
import type * as productPicker from "@/components/admin/catalog/product-picker";
import type * as storeTestOrder from "@/components/admin/storefront/test-order-slot";
// S2 BRAND & LOGO
import type * as brand from "@/lib/design/brand";
import type * as registers from "@/lib/design/registers";
import type * as effective from "@/lib/design/effective";
import type * as designBlueprint from "@/lib/design/blueprint";
import type * as email from "@/lib/design/email";
import type * as storeTheme from "@/lib/design/store-theme.server";
import type * as logoParams from "@/lib/logo/params";
import type * as logoSystem from "@/lib/logo/system";
// S3 MONEY
import type * as xlsx from "@/lib/imports/xlsx-write";
import type * as importRegistry from "@/lib/imports/registry";
import type * as mappings from "@/lib/imports/mappings.server";
import type * as cashHeld from "@/lib/finance/remittance/cash-held.server";
import type * as statement from "@/lib/finance/statement.server";
import type * as snapshot from "@/lib/finance/snapshot.server";
import type * as replay from "@/lib/finance/commissions/replay.server";
import type * as rates from "@/lib/finance/rates.server";
import type * as financeConsole from "@/lib/finance/console";
import type * as moneySlot from "@/components/admin/finance/drawer-money";
import type * as earningsUi from "@/components/admin/finance/earnings-statement";
import type * as ratesEditor from "@/components/admin/finance/carrier-rates-editor";
import type * as importFlow from "@/components/admin/finance/imports/import-flow";
// S4 LOGISTICS
import type * as importKinds from "@/lib/shipping/import-kinds";
import type * as activeShipment from "@/lib/shipping/active";
import type * as sheetFacts from "@/lib/shipping/sheet-facts";
import type * as accounts from "@/lib/shipping/accounts.server";
import type * as shipmentsRepo from "@/lib/shipping/shipments.server";
import type * as funnel from "@/lib/shipping/funnel";
import type * as assignRules from "@/lib/callcenter/rules";
import type * as revealAlarm from "@/lib/callcenter/reveal-alarm";
// S5 INTEGRATIONS 2
import type * as webhookTypes from "@/lib/webhooks/types";
import type * as webhookEmit from "@/lib/webhooks/emit";
import type * as ssrf from "@/lib/security/ssrf";
// S6 PLATFORM UX
import type * as edgePurge from "@/lib/edge-cache/purge";
// S7 AI DATA
import type * as jobHooks from "@/lib/ai/router/job-hooks";
import type * as directorReview from "@/components/builder/ai/use-director-review";
import type * as fillButtons from "@/components/admin/ai/drafts/fill-button";
// STO-R19: finished R1 modules S1 consumes (frozen, not stubbed)
import type * as zones from "@/lib/delivery/zones.server";
import type * as zoneMatch from "@/lib/delivery/match";
import type * as eta from "@/lib/delivery/eta";
import type * as trackLinks from "@/lib/tracking/links";
import type * as landingTemplates from "@/lib/landing/templates";
import type * as address from "@/lib/orders/address";
import type * as windowServer from "@/lib/callcenter/window.server";
import type * as windowPure from "@/lib/callcenter/window";
import type { DeliveryZoneRow, EtaWindow, StoreCalendar, ZoneLine, ZoneTable } from "@/lib/delivery/types";
import type { StoreAddress } from "@/lib/urls";
import type { StoreConfirmation } from "@/lib/settings/keys/store";

type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;
type Fn<P extends unknown[], R> = (...args: P) => R;
type Component<P> = (props: P) => ReactElement | null;

/* ------------------------------------------------------------------ */
/* the typed refusal every stub throws                                 */
/* ------------------------------------------------------------------ */

export type C2CNotBuilt = [
  Assert<Equals<R2Track, "S1" | "S2" | "S3" | "S4" | "S5" | "S6" | "S7">>,
  Assert<Equals<Pick<NotBuiltYet, "code" | "track" | "fn">, { readonly code: "not_built_yet"; readonly track: R2Track; readonly fn: string }>>,
];

/* ------------------------------------------------------------------ */
/* S1 STOREFRONT                                                       */
/* ------------------------------------------------------------------ */

export type C2CStorefront = [
  // STO-§16.9 (OPS-15): the v3 manual-order functions S4's sheet and P4's v3 lead conversion call
  Assert<Equals<orderV3.ManualLineV3, Omit<LineIn, "ls" | "rev">>>,
  Assert<Equals<keyof orderV3.ManualOrderInputV3, "lines" | "customer" | "source" | "confirmed" | "adjustCents" | "adjustReason" | "fromLead" | "allowDuplicate" | "idem">>,
  Assert<Equals<"shipAfter" extends keyof orderV3.ManualOrderInputV3 ? true : false, false>>,
  Assert<Equals<keyof orderV3.ManualQuoteV3, "lines" | "subtotalCents" | "deliveryCents" | "deliveryRule" | "adjustCents" | "totalCents" | "currency" | "warnings" | "duplicates">>,
  Assert<Equals<orderV3.ManualQuoteV3["deliveryRule"], DeliveryRule | "not_set">>,
  Assert<Equals<orderV3.ManualQuoteV3["warnings"], ("duplicate" | "blocked" | "city_unknown" | "fee_unset")[]>>,
  Assert<Equals<keyof orderV3.OrderPatchV3, "contact" | "lines" | "adjust">>,
  Assert<Equals<typeof orderV3.quoteManualOrderV3, Fn<[ctx: StoreCtx, input: orderV3.ManualOrderInputV3], Promise<ActionResult<orderV3.ManualQuoteV3>>>>>,
  Assert<Equals<typeof orderV3.createManualOrderV3, Fn<[ctx: WriteCtx, input: orderV3.ManualOrderInputV3], Promise<ActionResult<{ orderId: string; rev: number; replayed?: true }>>>>>,
  Assert<Equals<typeof orderV3.editOrderV3, Fn<[ctx: WriteCtx, orderId: string, patch: orderV3.OrderPatchV3, expectRev: number], Promise<orderV3.EditOrderV3Result>>>>,
  Assert<Equals<orderV3.EditOrderV3Result, ActionResult<{ rev: number; totalCents: number; lines: LineVerdict[] }> | { ok: false; error: "unavailable"; lines: LineVerdict[] }>>,
  Assert<Equals<"fee_unset" extends orderV3.ManualOrderErrorV3 ? true : false, true>>,
  // STO-§4.1 / §4.5 rev 4 (OPS-14): the onboarding entry points and the direction-aware synthetic doc
  Assert<Equals<typeof catalogSchema.productAsPageDoc, Fn<[p: catalogSchema.ProductRowLike, s: catalogSchema.ProductDocStoreCtx], PageDoc>>>,
  Assert<Equals<catalogSchema.ProductDocStoreCtx["direction"], { key: string; genome: PageGenes } | undefined>>,
  Assert<Equals<typeof productsRepo.createProduct, Fn<[ctx: WriteCtx, input: productsRepo.ProductInput | { facts: productsRepo.ProductFacts }], Promise<ProductRow>>>>,
  Assert<Equals<typeof onboarding.setThemeDraft, Fn<[ctx: WriteCtx, direction: { key: string; genome: PageGenes }], Promise<{ themeDraftVersion: number; pdpFamily: PdpFamily }>>>>,
  // STO-§4.5: the catalog reads and the CAS save S7 applies AI drafts with
  Assert<Equals<typeof productsRepo.listProducts, Fn<[scope: StoreScope, q: productsRepo.ProductQuery], Promise<{ rows: productsRepo.ProductListRow[]; next: string | null; total: number }>>>>,
  Assert<Equals<typeof productsRepo.getProductsByIds, Fn<[scope: StoreScope, ids: readonly string[]], Promise<ProductRow[]>>>>,
  Assert<
    Equals<
      typeof productsRepo.saveProduct,
      Fn<[ctx: WriteCtx, id: string, input: productsRepo.ProductInput, expectedRev: string], Promise<{ ok: true; row: ProductRow } | { ok: false; conflict: { rev: string; updatedBy: string | null; updatedAt: Date } }>>
    >
  >,
  // STO-§4.7: catalog from photos (S7's stage plan runs the job body; S7's zod mirrors the proposal text)
  Assert<Equals<"price" extends keyof fromPhotos.ProductProposal ? true : false, false>>,
  Assert<Equals<keyof fromPhotos.ProductProposal, "key" | "photos" | "name" | "description" | "items" | "suggestedFacts" | "category" | "confidence">>,
  Assert<Equals<keyof fromPhotos.CatalogFromPhotosJobInput, "assetIds" | "groups" | "hints" | "locales">>,
  Assert<Equals<typeof fromPhotos.runCatalogFromPhotosJob, Fn<[scope: WriteScope, input: fromPhotos.CatalogFromPhotosJobInput, heartbeat: () => Promise<void>], Promise<{ proposals: fromPhotos.ProductProposal[] }>>>>,
  // STO-§11.5: the blueprint (S7 produces, S1 applies, S2 compiles)
  Assert<Equals<blueprintShape.StoreBlueprint, z.infer<typeof blueprintShape.StoreBlueprintSchema>>>,
  Assert<Equals<keyof blueprintShape.StoreBlueprint, "storyline" | "hints" | "collections" | "home" | "pages" | "provenance">>,
  Assert<Equals<blueprintShape.StoreBlueprint["storyline"], homeGrammar.HomeStorylineId>>,
  Assert<Equals<blueprintShape.StoreBlueprint["provenance"]["source"], "director" | "deep" | "instant">>,
  Assert<Equals<typeof blueprintApply.startStoreDesign, Fn<[ctx: StoreCtx], Promise<{ instant: { candidates: blueprintShape.StoreBlueprint[] }; job: { jobId: string } | null }>>>>,
  Assert<Equals<typeof blueprintApply.applyStoreBlueprint, Fn<[ctx: WriteCtx, bp: blueprintShape.StoreBlueprint], Promise<{ collections: string[]; homeDraftVersionId: string; pages: string[]; dropped: string[] }>>>>,
  Assert<Equals<typeof storeDefaults.defaultTemplate, Fn<[kind: StorePageKind, shape: CatalogShape, store: StoreRow], StorePageDoc>>>,
  Assert<Equals<typeof storeDefaults.homeFromBlueprint, Fn<[bp: blueprintShape.StoreBlueprint, shape: CatalogShape, store: StoreRow], { doc: StorePageDoc; dropped: string[] }>>>,
  // STO-§16.4 / §16.5 / §16.6 (STO-R8): v3 order readers for S3 / S4 / S5
  Assert<Equals<orderTextV3.OrderUnitV3, OrderUnit & { line: number; productId: string; productKey: string; productName: string }>>,
  Assert<Equals<typeof orderTextV3.orderUnitsV3, Fn<[items: OrderItemsV3], orderTextV3.OrderUnitV3[]>>>,
  Assert<Equals<typeof orderTextV3.orderTextV3, Fn<[items: OrderItemsV3, opts?: { mode?: TextMode; orderId?: string }], string>>>,
  Assert<Equals<typeof contentsV3.contentsOfV3, Fn<[items: OrderItemsV3, store: StoreRow], contentsV3.OrderContentsV3>>>,
  // STO-§5: restock (S4's partial children and returns)
  Assert<Equals<typeof inventory.restockLines, Fn<[scope: WriteScope, orderId: string, lines: readonly inventory.RestockLine[], opts: { reason: "returned_restock"; tx?: Tx }], Promise<{ moves: number }>>>>,
  // STO-§7.3: the store page render S2's theme preview and S6's reveal call in preview mode
  Assert<Equals<keyof storeRender.StoreRoute, "kind" | "slug" | "query" | "test" | "status">>,
  Assert<
    Equals<
      typeof storeRender.renderStorePage,
      Fn<[scope: StoreScope, store: StoreRow, route: storeRender.StoreRoute, opts?: { mode?: "live" | "preview" | "test"; draft?: StorePageDoc; productDraft?: ProductRow }], Promise<storeRender.RenderedStorePage>>
    >
  >,
  // S6's purge fallback and console tab
  Assert<Equals<typeof storePaths.storePathsFor, Fn<[scope: StoreScope], Promise<{ paths: string[]; truncated: boolean }>>>>,
  Assert<Equals<typeof catalogConsole.catalogForConsole, Fn<[scope: StoreScope], Promise<catalogConsole.CatalogConsoleView | null>>>>,
  // components other tracks mount
  Assert<Equals<keyof productPicker.ProductPickerProps, "handle" | "locale" | "lines" | "onChange" | "quote" | "disabled">>,
  Assert<Equals<typeof productPicker.ProductPicker, Component<productPicker.ProductPickerProps>>>,
  Assert<Equals<typeof storeTestOrder.StoreTestOrderSlot, Component<{ live: boolean }>>>,
];

/* ------------------------------------------------------------------ */
/* S2 BRAND & LOGO                                                     */
/* ------------------------------------------------------------------ */

export type C2CBrand = [
  Assert<Equals<keyof brand.BrandGenome, "v" | "brand" | "house" | "locks" | "seed" | "logo">>,
  Assert<Equals<keyof brand.BrandLocks, "colors" | "pairing" | "genes">>,
  Assert<Equals<keyof brand.BrandSampleInput, "products" | "brand" | "brandSeed" | "niche" | "hints">>,
  Assert<Equals<typeof brand.sampleBrand, Fn<[input: brand.BrandSampleInput], brand.BrandGenome>>>,
  Assert<Equals<typeof brand.houseGenes, Fn<[brand: brand.BrandGenome], brand.BrandGenome["house"]>>>,
  Assert<Equals<typeof registers.compileRegister, Fn<[brand: brand.BrandGenome, register: Register, page?: PageGenes], Compiled>>>,
  Assert<Equals<typeof effective.effectiveTheme, Fn<[doc: PageDoc, mode: "store" | "campaign" | null, active: { spec: ThemeSpec; locks: brand.BrandLocks } | null], ThemeSpec>>>,
  Assert<Equals<typeof designBlueprint.compileBlueprint, Fn<[bp: blueprintShape.StoreBlueprint, input: Omit<brand.BrandSampleInput, "hints">], { brand: brand.BrandGenome; home: PlanDirectives }>>>,
  // STO-R19: the store theme
  Assert<Equals<typeof storeTheme.getStoreTheme, Fn<[scope: StoreScope, register: Register], Promise<BuiltTheme>>>>,
  Assert<Equals<typeof storeTheme.activeThemeFor, Fn<[scope: StoreScope], Promise<{ version: number; spec: ThemeSpec; locks: brand.BrandLocks } | null>>>>,
  Assert<Equals<typeof storeTheme.writeThemeDraft, Fn<[scope: WriteScope, actor: Actor, input: storeTheme.ThemeDraftInput], Promise<{ version: number }>>>>,
  Assert<Equals<storeTheme.ThemeDraftInput["source"], "onboarding" | "generation" | "blueprint" | "brand">>,
  // DES-§18
  Assert<Equals<email.EmailRole, "body" | "card" | "title" | "text" | "muted" | "button" | "link" | "rule" | "footer">>,
  Assert<Equals<typeof email.emailTokens, Fn<[scope: StoreScope, locale: Locale], Promise<email.EmailTokens>>>>,
  Assert<Equals<typeof email.inlineStyle, Fn<[role: email.EmailRole, t: email.EmailTokens], string>>>,
  Assert<Equals<typeof email.emailHtml, Fn<[t: email.EmailTokens, mail: { subject: string; text: string; cta?: { label: string; href: string } }, opts?: email.EmailHtmlOptions], string>>>,
  Assert<Equals<typeof email.slipTokens, Fn<[t: email.EmailTokens], email.SlipTokens>>>,
  // DES-§13.12 / §13.16: the logo contract S7 validates against
  Assert<Equals<logoParams.LogoParams, z.infer<typeof logoParams.LogoParams>>>,
  Assert<Equals<keyof logoParams.LogoParams, "v" | "seed" | "names" | "tagline" | "font" | "spacing" | "move" | "mark" | "lockup" | "colors">>,
  Assert<Equals<logoParams.LogoParams["mark"]["symbol"], null>>,
  Assert<Equals<keyof logoParams.LogoSystem, "params" | "exports" | "renderedAt" | "engineV">>,
  Assert<Equals<keyof logoParams.LogoConceptParams, "font" | "move" | "mark" | "enclosure" | "lockup" | "rationale">>,
  Assert<Equals<logoParams.LogoConceptParams["move"], logoParams.LogoParams["move"]["kind"]>>,
  Assert<Equals<keyof typeof logoParams.LOGO_VOCAB, "moves" | "marks" | "constructions" | "enclosures" | "lockups">>,
  Assert<Equals<typeof logoParams.defaultLogoParams, Fn<[input: { names: logoParams.LogoParams["names"]; brand: brand.BrandGenome | null; seed: number }], logoParams.LogoParams>>>,
  Assert<Equals<typeof logoSystem.renderLogo, Fn<[params: logoParams.LogoParams, opts: { lockup: logoSystem.LogoLockupName; colorway?: logoSystem.LogoColorway }], string>>>,
];

/* ------------------------------------------------------------------ */
/* S3 MONEY                                                            */
/* ------------------------------------------------------------------ */

export type C2CMoney = [
  Assert<Equals<xlsx.Cell, string | number | { date: Date } | { money: number; currency: string }>>,
  Assert<Equals<typeof xlsx.writeXlsx, Fn<[sheets: { name: string; rows: xlsx.Cell[][] }[]], Uint8Array>>>,
  Assert<Equals<importRegistry.ImportKind, (typeof IMPORT_KINDS)[number]>>,
  Assert<Equals<keyof importRegistry.ImportKindDef, "kind" | "permission" | "feature" | "fields" | "preview" | "commitSlice">>,
  Assert<Equals<importRegistry.ImportKindDef["permission"], StorePermission>>,
  Assert<Equals<importRegistry.ImportKindDef["feature"], FeatureKey | null>>,
  Assert<Equals<importRegistry.ImportKindHandler["preview"], Fn<[scope: StoreScope, rows: readonly importRegistry.MappedRow[], run: importRegistry.ImportRunCtx], Promise<importRegistry.PreviewSummary>>>>,
  Assert<Equals<importRegistry.ImportKindHandler["commitSlice"], Fn<[scope: WriteScope, rows: readonly importRegistry.MappedRow[], run: importRegistry.ImportRunCtx], Promise<importRegistry.RowResult[]>>>>,
  Assert<Equals<importRegistry.RowResult["result"], "ok" | `skipped:${string}` | `failed:${string}`>>,
  Assert<Equals<keyof importRegistry.ImportRunCtx, "id" | "kind" | "carrierAccountId" | "createdAt" | "createdBy" | "tz" | "currency">>,
  Assert<Equals<typeof importRegistry.importKindDefs, Fn<[], readonly importRegistry.ImportKindDef[]>>>,
  Assert<Equals<keyof mappings.ManifestMappingSpec, "v" | "columns" | "delimiter">>,
  Assert<Equals<typeof mappings.listMappings, Fn<[scope: StoreScope, kind: importRegistry.ImportKind, opts?: { carrierAccountId?: string }], Promise<mappings.ImportMappingRow[]>>>>,
  Assert<Equals<typeof mappings.getMapping, Fn<[scope: StoreScope, id: string], Promise<mappings.ImportMappingRow | null>>>>,
  Assert<Equals<typeof mappings.saveMapping, Fn<[ctx: WriteCtx, input: mappings.SaveMappingInput], Promise<ActionResult<{ id: string }>>>>>,
  Assert<Equals<typeof cashHeld.cashHeldSummary, Fn<[scope: StoreScope, opts?: { at?: Date }], Promise<cashHeld.CashHeldSummary | null>>>>,
  Assert<Equals<typeof cashHeld.cashHeldLines, Fn<[scope: StoreScope], Promise<cashHeld.CashHeldLine[]>>>>,
  Assert<Equals<cashHeld.AgeingLabel, "0-7" | "8-14" | "15-30" | "30+">>,
  Assert<Equals<typeof statement.earningsStatement, Fn<[scope: StoreScope, userId: string, opts?: { period?: string }], Promise<statement.EarningsStatementData | null>>>>,
  Assert<Equals<typeof snapshot.refreshSnapshotCarrier, Fn<[tx: Tx, scope: WriteScope, orderId: string], Promise<void>>>>,
  Assert<Equals<typeof replay.replayCommissionsFor, Fn<[scope: WriteScope, orderIds: readonly string[]], Promise<{ replayed: number }>>>>,
  Assert<Equals<typeof rates.carrierRateSummary, Fn<[scope: StoreScope, accountId: string], Promise<{ estimatedCents: number; chargedCents: number; parcels: number } | null>>>>,
  Assert<Equals<typeof financeConsole.cashCollected, Fn<[scope: StoreScope, range: { from: string; to: string }], Promise<{ collectedCents: number; toCollectCents: number; n: number } | null>>>>,
  Assert<Equals<typeof financeConsole.remittanceAgeingForConsole, Fn<[scope: StoreScope], Promise<{ buckets: { label: cashHeld.AgeingLabel; cents: number; orders: number }[]; n: number } | null>>>>,
  Assert<Equals<keyof moneySlot.MoneySlotProps, "orderId" | "money" | "ship" | "totalCents" | "collectedCents" | "refundCents" | "currency" | "settlement" | "remitted">>,
  Assert<Equals<moneySlot.MoneySlotProps["money"], MoneyState>>,
  Assert<Equals<moneySlot.MoneySlotProps["ship"], ShipState>>,
  Assert<Equals<typeof moneySlot.MoneySlot, Component<moneySlot.MoneySlotProps>>>,
  Assert<Equals<typeof earningsUi.EarningsStatement, Component<{ data: statement.EarningsStatementData | null }>>>,
  Assert<Equals<typeof ratesEditor.CarrierRatesEditor, Component<{ handle: string; accountId: string; canWrite: boolean }>>>,
  Assert<Equals<keyof importFlow.ImportFlowProps, "handle" | "kind" | "carrierAccountId" | "runId" | "onCommitted">>,
  Assert<Equals<typeof importFlow.ImportFlow, Component<importFlow.ImportFlowProps>>>,
];

/* ------------------------------------------------------------------ */
/* S4 LOGISTICS                                                        */
/* ------------------------------------------------------------------ */

type SheetFactsResult = { ok: true; changed: boolean; shipmentId: string | null; carrierAccountId: string | null } | { ok: false; error: "not_found" | "invalid" | "no_shipment" };

export type C2CLogistics = [
  Assert<Equals<typeof importKinds.trackingImportKind, importRegistry.ImportKindDef>>,
  Assert<Equals<typeof importKinds.statusImportKind, importRegistry.ImportKindDef>>,
  Assert<Equals<typeof importKinds.logisticsImportKinds, readonly importRegistry.ImportKindDef[]>>,
  Assert<Equals<typeof activeShipment.activeShipmentFacts, Fn<[scope: WriteScope, orderId: string, tx?: Tx], Promise<{ open: boolean; settlement: "statement" | "at_delivery" | null }>>>>,
  Assert<Equals<typeof assignRules.assignByRules, Fn<[scope: WriteScope, order: { id: string; isTest: boolean }], Promise<{ handled: boolean; assigned: string | null }>>>>,
  Assert<Equals<typeof revealAlarm.revealGate, Fn<[scope: WriteScope, userId: string], Promise<{ ok: true } | { ok: false; pausedUntil: Date }>>>>,
  Assert<Equals<typeof revealAlarm.noteReveal, Fn<[scope: WriteScope, userId: string, countThisHour: number], Promise<void>>>>,
  Assert<Equals<typeof revealAlarm.revealAlarmStates, Fn<[scope: StoreScope, userIds: string[]], Promise<Record<string, revealAlarm.RevealAlarmState>>>>>,
  Assert<Equals<revealAlarm.RevealAlarmState, { state: "alarm" | "paused"; count: number; pausedUntil: string | null }>>,
  Assert<
    Equals<
      typeof sheetFacts.applySheetShipmentFacts,
      Fn<[scope: WriteScope, orderId: string, facts: { tracking?: string; carrierLabel?: string; feeCents?: number }, src: { kind: "sheet"; ref: string }], Promise<SheetFactsResult>>
    >
  >,
  Assert<Equals<typeof accounts.listCarrierAccounts, Fn<[scope: StoreScope, opts?: { includeDisabled?: boolean }], Promise<accounts.CarrierAccountRow[]>>>>,
  Assert<Equals<typeof accounts.accountByLabel, Fn<[scope: StoreScope, label: string], Promise<accounts.CarrierAccountRow | null>>>>,
  Assert<Equals<typeof shipmentsRepo.shipmentByTracking, Fn<[scope: StoreScope, accountId: string, tracking: string], Promise<shipmentsRepo.ShipmentRow | null>>>>,
  Assert<Equals<typeof shipmentsRepo.trackingLinkFor, Fn<[scope: StoreScope, orderId: string], Promise<{ carrier: string; number: string; url?: string } | null>>>>,
  Assert<Equals<typeof shipmentsRepo.setShipmentTracking, Fn<[ctx: WriteCtx, shipmentId: string, tracking: string | null], Promise<ActionResult<{ changed: boolean; orderRev: number }>>>>>,
  Assert<
    Equals<
      typeof funnel.shipmentFunnel,
      Fn<[scope: StoreScope, range: { from: string; to: string }], Promise<{ shipped: number; delivered: number; refused: number; returned: number; deliveredCents: number; n: number } | null>>
    >
  >,
];

/* ------------------------------------------------------------------ */
/* S5 INTEGRATIONS 2                                                   */
/* ------------------------------------------------------------------ */

export type C2CIntegrations = [
  Assert<Equals<webhookTypes.WebhookEvent, "order.created" | "order.updated" | "order.confirmed" | "order.cancelled" | "order.shipped" | "order.delivered" | "order.returned" | "lead.created" | "remittance.imported" | "ping">>,
  Assert<Equals<keyof webhookTypes.WebhookEnvelopeV1, "id" | "type" | "created_at" | "store" | "data">>,
  Assert<
    Equals<
      keyof webhookTypes.OrderWebhookV1,
      "id" | "created_at" | "status" | "states" | "source" | "is_test" | "customer" | "items" | "totals" | "utm" | "page" | "cancel_reason" | "tracking"
    >
  >,
  Assert<Equals<keyof webhookTypes.LeadWebhookV1, "id" | "created_at" | "kind" | "page" | "customer" | "selection_text" | "total_cents" | "currency" | "utm">>,
  Assert<
    Equals<
      keyof webhookTypes.RemittanceWebhookV1,
      "id" | "carrier" | "statement_ref" | "period_from" | "period_to" | "paid_at" | "gross_cents" | "fees_cents" | "net_cents" | "currency" | "lines" | "matched"
    >
  >,
  Assert<Equals<NonNullable<webhookTypes.OrderWebhookV1["tracking"]>, Awaited<ReturnType<typeof shipmentsRepo.trackingLinkFor>> & {}>>,
  Assert<
    Equals<
      typeof webhookEmit.enqueueWebhookEvent,
      Fn<[scope: WriteScope, event: "remittance.imported", data: { remittance: webhookTypes.RemittanceWebhookV1 }, opts: { ref: string; tx?: Tx }], Promise<{ enqueued: number }>>
    >
  >,
  Assert<Equals<ssrf.SsrfFailure, "ssrf_blocked" | "dns_failed" | "timeout" | "tls_error" | "network" | "redirect_refused">>,
  Assert<Equals<typeof ssrf.resolvePublic, Fn<[host: string, deps?: ssrf.SsrfDeps], Promise<{ ok: true; addresses: string[] } | { ok: false; error: "ssrf_blocked" | "dns_failed" }>>>>,
  Assert<Equals<typeof ssrf.ssrfRequest, Fn<[url: string, opts: ssrf.SsrfRequestOptions, deps?: ssrf.SsrfDeps], Promise<{ status: number; ms: number } | { error: ssrf.SsrfFailure; ms: number }>>>>,
  // the Mailer S3 queues `payout_ready` through (T2's R1 interface, taken over by S5 in R2; exists, not stubbed)
  Assert<Equals<Mailer["enqueue"], (msg: MailMessage) => Promise<{ queued: true; outboxId: string } | { queued: false; reason: "disabled" | "capped" | "duplicate" | "suppressed" }>>>,
  Assert<Equals<"payout_ready" extends MailMessage["template"] ? true : false, true>>,
];

/* ------------------------------------------------------------------ */
/* S6 PLATFORM UX                                                      */
/* ------------------------------------------------------------------ */

export type C2CPlatformUx = [
  Assert<Equals<edgePurge.EdgePurgeReason, "render" | "publish" | "settings" | "lifecycle" | "handle" | "theme" | "catalog" | "manual">>,
  Assert<Equals<typeof edgePurge.requestEdgePurge, Fn<[storeId: string, opts: { reason: edgePurge.EdgePurgeReason; paths?: readonly string[]; hosts?: readonly string[] }], void>>>,
];

/* ------------------------------------------------------------------ */
/* S7 AI DATA                                                          */
/* ------------------------------------------------------------------ */

export type C2CAiData = [
  Assert<Equals<keyof jobHooks.AiJobResultState<unknown>, "job" | "done" | "result" | "undo" | "cancel">>,
  Assert<Equals<typeof jobHooks.useStoreBlueprintJob, Fn<[handle: string, jobId: string | null], jobHooks.AiJobResultState<blueprintShape.StoreBlueprint>>>>,
  Assert<Equals<typeof jobHooks.useLogoSystemJob, Fn<[handle: string, jobId: string | null], jobHooks.AiJobResultState<logoParams.LogoConceptParams[]>>>>,
  Assert<Equals<typeof jobHooks.useCatalogFromPhotosJob, Fn<[handle: string, jobId: string | null], jobHooks.AiJobResultState<fromPhotos.ProductProposal[]>>>>,
  Assert<Equals<keyof directorReview.UseDirectorReviewOptions, "handle" | "doc" | "kind" | "theme" | "policy" | "apply">>,
  Assert<Equals<directorReview.UseDirectorReviewOptions["kind"], PageKind>>,
  Assert<Equals<directorReview.UseDirectorReviewOptions["policy"], AiPolicy>>,
  Assert<Equals<directorReview.UseDirectorReviewOptions["apply"], (ops: RepairOp[]) => void>>,
  Assert<Equals<typeof directorReview.useDirectorReview, Fn<[opts: directorReview.UseDirectorReviewOptions], Omit<DirectorReviewProps, "className">>>>,
  Assert<Equals<typeof fillButtons.FillSeoButton, Component<{ target: "product" | "page"; ids: readonly string[] }>>>,
  Assert<Equals<typeof fillButtons.TranslateButton, Component<{ target: "product" | "collection" | "policies"; ids: readonly string[] }>>>,
];

/* ------------------------------------------------------------------ */
/* STO-R19: finished R1 modules S1 consumes (exist; frozen, not stubbed) */
/* ------------------------------------------------------------------ */

type EtaZone = { etaMinDays: number; etaMaxDays: number };

export type C2CStoR19 = [
  // P3 delivery engine (src/lib/delivery/**): zonesForCheckout = the value-keyed ZoneTable (D68 rev 4), listZones = the rows
  Assert<Equals<typeof zones.zonesForCheckout, Fn<[scope: StoreScope], Promise<ZoneTable>>>>,
  Assert<Equals<typeof zones.listZones, Fn<[scope: StoreScope], Promise<DeliveryZoneRow[]>>>>,
  Assert<Equals<typeof zones.zoneLineFor, Fn<[scope: StoreScope, cityKey: address.CityKey | null, at?: Date, opts?: { stage: "before_call" | "after_call" }], Promise<ZoneLine | null>>>>,
  Assert<Equals<typeof zoneMatch.zoneForCity, Fn<[zones: readonly DeliveryZoneRow[], cityKey: address.CityKey | null], DeliveryZoneRow | null>>>,
  Assert<Equals<typeof eta.etaWindow, Fn<[cal: StoreCalendar, zone: EtaZone, now: Date], EtaWindow | null>>>,
  Assert<Equals<typeof eta.etaText, Fn<[w: EtaWindow | null, zone: EtaZone, locale: "ar" | "fr" | "en", dateLocale: string, now: Date], string>>>,
  Assert<Equals<typeof eta.etaWindowText, Fn<[zone: EtaZone, now: Date, cal: StoreCalendar, locale: "ar" | "fr" | "en", dateLocale?: string], { from: Date; to: Date; text: string } | null>>>,
  // P3 tracking links and the LP-04 WhatsApp text
  Assert<Equals<typeof trackLinks.signedTrackPath, Fn<[store: StoreAddress & { id: string }, orderId: string], string>>>,
  Assert<Equals<typeof landingTemplates.waConfirmText, Fn<[store: StoreRow & { confirmation: z.output<typeof StoreConfirmation> }, order: OrderRow, locale: Locale], string>>>,
  // P4 city key (server-side; the store chunks bundle none of it, D68) and the calling window (D73)
  Assert<Equals<typeof address.cityKey, Fn<[value: string], address.CityKey | null>>>,
  Assert<Equals<typeof windowServer.callingWindowFor, Fn<[scope: StoreScope], Promise<windowPure.EffectiveWindow>>>>,
  Assert<Equals<typeof windowPure.nextCallableAt, Fn<[t: Date, w: windowPure.EffectiveWindow], Date>>>,
  Assert<Equals<typeof windowPure.hoursText, Fn<[w: windowPure.EffectiveWindow, locale: Locale, dateLocale: string, now: Date], string>>>,
  Assert<Equals<typeof windowPure.shopperPromiseAllowed, Fn<[w: windowPure.EffectiveWindow], boolean>>>,
];
