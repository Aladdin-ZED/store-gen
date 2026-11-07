# R2 cross-track stubs (contract step C2-C, applied by the maintainer)

State: **applied** (R2 contract step C2-C; core §K.4 "Contract step (maintainer)", STO-§27.1, STO-§16.9, STO-R19,
DES-§26, OPE-§P, AI-§R.2, the R2 plans' `crossTrack` and stub `sharedNeeds`, qa/lead/r2-plans.json).

Each R2 track builds alone in its worktree against the signatures below. The **owning track replaces the body and keeps
the signature**; `src/lib/contracts/r2-stubs.ts` checks every one at `tsc` (a rename, a removed export or a changed
parameter list breaks `npm run gate`). Payload types are frozen by name, so an owner may add optional fields to them; a
parameter, a return union or a frozen literal union changes only through a CCR (docs/saas/ccr/README.md).

**Stub rules.** A stub either returns a **typed empty value** where its caller must render something (a null "not
available" line, an empty list, the idle state of a hook, a component that renders nothing, an exact value that is true
before the owner merges), or throws **`NotBuiltYet`** (src/lib/contracts/not-built.ts: `code: "not_built_yet"`,
`track`, `fn`; message `not implemented: <track> (<fn>)`). A caller that can degrade catches it with `isNotBuiltYet(err)`
(S3's registry answers `kind_unavailable`, S2's theme preview shows its placeholder for a store kind, S5 keeps its R1
Sheets columns); any other caller lets it surface, and the real behaviour is proven at the owner's merge. **No R1 path
reaches a stub**: nothing in R1 imports these files except the type-only contract check, and every caller is an R2
surface behind `releaseOn("R2")`.

Ownership: every stub file is in its owner's R2 globs (`npm run test:ownership` green; each new file's R2 owner checked
with `ownership-check.ts --owner`). C2-C added two claims to §K.4: S6 `src/lib/edge-cache/**`, S7
`src/components/{admin,builder,generate}/ai/**` (P7's R1 component globs, continued); and to §K.3 (maintainer): this
register and the contract step's reports `docs/saas/ccr/r2-c0-*.md`. `src/lib/contracts/{not-built,r2-stubs}.ts` are
inside the maintainer's `src/lib/contracts/**`.

## S1 STOREFRONT

| Function / export | File | Stub | Callers | Source |
|---|---|---|---|---|
| `quoteManualOrderV3(ctx, input)`, `createManualOrderV3(ctx, input)`, `editOrderV3(ctx, orderId, patch, expectRev)`; `ManualOrderInputV3` (no `shipAfter`), `ManualQuoteV3`, `OrderPatchV3`, `LinePriced`, `ManualLineV3`, `ManualOrderErrorV3`, `EditOrderV3Result` | `src/lib/catalog/order-v3.server.ts` | NotBuiltYet | S4 (store-mode manual sheet, `src/lib/shipping/manual-actions.ts`), P4's `convertLeadToOrder` v3 branch (maintainer, C2-E) | STO-§16.9, §16.3; OPS-15, D72 |
| `productAsPageDoc(p, s)` with `ProductDocStoreCtx.direction`; `ProductRowLike`, `InventoryLevelRow` | `src/lib/catalog/schema.ts` | NotBuiltYet | S6 (onboarding reveal folds), S7 (blueprint critique), S1's picker | STO-§4.1 rev 4; OPS-14, PLA Q3.8 |
| `createProduct(ctx, input \| { facts })`, `listProducts`, `getProductsByIds`, `saveProduct(…, expectedRev)`; `ProductFacts`, `ProductInput`, `ProductQuery`, `ProductListRow`, `ProductStatus` | `src/lib/catalog/products.server.ts` | NotBuiltYet | S6 (`useDirectionAction`), S7 (AI-09 draft applies) | STO-§4.5 rev 4 |
| `setThemeDraft(ctx, direction)` | `src/lib/storefront/onboarding.server.ts` | NotBuiltYet | S6 (`useDirectionAction`) | STO-§4.5 rev 4; core §A.2 |
| `runCatalogFromPhotosJob(scope, input, heartbeat)`; `FromPhotosInput`, `ProductProposal` (no `price` key), `OptionGroupProposal`, `CatalogFromPhotosJobInput` | `src/lib/catalog/from-photos.server.ts` | NotBuiltYet | S7 (`catalog_from_photos` stage plan, proposal-text zod) | STO-§4.7; S1 / S7 needs |
| `StoreBlueprint`, `StoreBlueprintSchema` (isomorphic) | `src/lib/catalog/blueprint.ts` | — (frozen shape) | S7 (job result, `useStoreBlueprintJob`), S2 (`compileBlueprint`) | STO-§11.5; AI-11 |
| `HOME_STORYLINES`, `HOME_STORYLINES_R2`, `HomeStorylineId` | `src/storefront/home/grammar.ts` | — (frozen ids) | S7 (closed vocabulary), S1 | STO-§11.1 |
| `startStoreDesign(ctx)`, `applyStoreBlueprint(ctx, bp)` | `src/lib/catalog/blueprint.server.ts` | NotBuiltYet | S7 (blueprint UI) | STO-§11.5 |
| `defaultTemplate(kind, shape, store)`, `homeFromBlueprint(bp, shape, store)` | `src/lib/storefront/defaults.ts` | NotBuiltYet | S7 (blueprint critique docs) | STO-§11; S7 need 11 |
| `orderUnitsV3(items)` (final contract body: the plain flattening), `orderTextV3(items, opts)`; `OrderUnitV3` | `src/lib/catalog/order-text-v3.ts` | orderUnitsV3 real; orderTextV3 NotBuiltYet | S3, S4 (picking, manifest, Carrier CSV), S5 (Sheets, webhook items) | STO-§16.4, §16.5; STO-R8 |
| `contentsOfV3(items, store)`; `OrderContentsV3` (R1 `ContentLine`) | `src/lib/catalog/contents.ts` | NotBuiltYet | S5 (server events), S1 (`store-thanks`) | STO-§16.6, STO-D18 |
| `restockLines(scope, orderId, lines, { reason, tx? })`; `RestockLine` | `src/lib/catalog/inventory.server.ts` | NotBuiltYet | S4 (partial child refused lines, returns) | STO-§5 rev 4; OD51 |
| `renderStorePage(scope, store, route, opts?)`; `StoreRoute` (storefront's, STO-§7.2), `RenderedStorePage` | `src/lib/storefront/render.server.ts` | NotBuiltYet | S2 (theme preview), S6 (reveal preview) | STO-§7.2, §7.3 |
| `storePathsFor(scope)` | `src/lib/storefront/paths.server.ts` | `{ paths: [], truncated: false }` | S6 (edge purge file-list fallback) | S6 need 6 |
| `catalogForConsole(scope)`; `CatalogConsoleView` | `src/lib/catalog/console.ts` | null | S6 (console "Catalog & pages" tab) | S6 need 6 |
| `ProductPicker(props)`; `ProductPickerProps` | `src/components/admin/catalog/product-picker.tsx` | renders null | S4 (`src/components/admin/orders/manual/**`) | STO-§16.9 step 5 |
| `StoreTestOrderSlot({ live })` | `src/components/admin/storefront/test-order-slot.tsx` | renders null | S6 (dashboard `AddressCard` slot, store / both mode) | STO-D33; S1 crossTrack 6 |

Notes: `StoreRoute` sits in `render.server.ts` (STO-§7.2 lists it in `serve.server.ts`, which builds it; S1 may
re-export). `restockLines` merges S1's `reason` and S4's `tx` into one `opts` (the two plans disagreed). `contentsOfV3`
lives at the spec's `contents.ts` (S1's plan said `contents-v3.ts`). Write functions take a `WriteCtx` (D71).

## S2 BRAND & LOGO

| Function / export | File | Stub | Callers | Source |
|---|---|---|---|---|
| `getStoreTheme(scope, register)` | `src/lib/design/store-theme.server.ts` | STO-§8.4's stand-in: the latest published landing page's theme, else `themeFromProduct` for the store category (no palette, seed 0), built for the default locale | S1 (store render), S7 | STO-R19, STO-§8.4 |
| `activeThemeFor(scope)` | same | null (no active store theme before S2) | maintainer's DES-R4 render wiring (C2-E), S1 | DES-§11.5 |
| `writeThemeDraft(scope, actor, input)`; `ThemeDraftInput` | same | NotBuiltYet (a draft needs S2's compiled `theme_spec`) | S1 (`setThemeDraft`, `applyStoreBlueprint`) | DES-§11.4 |
| `BrandGenome`, `BrandLocks`, `BrandSampleInput`, `sampleBrand(input)`, `houseGenes(brand)` | `src/lib/design/brand.ts` | sampleBrand NotBuiltYet; houseGenes = `brand.house` | S1 (`expandHome`, instant candidates), S2 | DES-§11.2, §14.4 |
| `compileRegister(brand, register, page?)` | `src/lib/design/registers.ts` | NotBuiltYet | S1 | DES-§11.1 |
| `effectiveTheme(doc, mode, active)` | `src/lib/design/effective.ts` | `doc.theme` (exact while no theme is active) | render wiring (C2-E), S1 | DES-§11.5, DES-R4 |
| `compileBlueprint(bp, input)` | `src/lib/design/blueprint.ts` | NotBuiltYet | S7 (blueprint job), S1 | DES-§24 row, §14.4 |
| `EmailTokens`, `EmailRole`, `EmailHtmlOptions`, `SlipTokens`, `emailTokens`, `inlineStyle`, `emailHtml`, `slipTokens` | `src/lib/design/email.ts` | NotBuiltYet | S5 (Mailer HTML, after S2), S4 (packing slip, picking list) | DES-§18 |
| `LogoParams` (zod, DES-§13.12 verbatim; `FontId` = `KnownFontId`, `SymbolParams` = null in R2), `LogoSystem`, `LogoExportName`, `LogoConceptParams` (zod), `LOGO_VOCAB`, `defaultLogoParams(input)` | `src/lib/logo/params.ts` | defaultLogoParams NotBuiltYet | S7 (`logo.system` task zod, library rung) | DES-§13.12, §13.14, §13.16 |
| `renderLogo(params, { lockup, colorway? })` | `src/lib/logo/system.ts` | NotBuiltYet | S1 (store chrome favicon, server-side) | DES-§13.14 |

## S3 MONEY

| Function / export | File | Stub | Callers | Source |
|---|---|---|---|---|
| `writeXlsx(sheets)`, `Cell` | `src/lib/imports/xlsx-write.ts` | NotBuiltYet | S4 (manifest, Carrier CSV `format=xlsx`), S3 | OPE-§18.6 writer |
| `ImportKind`, `ImportField`, `MappingSpec` (zod 4 partial records), `MappedRow`, `RowResult`, `PreviewSummary`, `ImportRunCtx` (`createdAt` for S4), `ImportKindHandler`, `ImportKindDef`, `importKindDefs()` | `src/lib/imports/registry.ts` | importKindDefs = S4's kinds only | S4 (implements tracking / status) | OPE-§18.1-§18.5 |
| `listMappings`, `getMapping`, `saveMapping`; `ManifestMappingSpec`, `ImportMappingRow`, `SaveMappingInput` | `src/lib/imports/mappings.server.ts` | NotBuiltYet | S4 (manifest columns, auto-picked mappings) | OPE-§18.3 |
| `cashHeldSummary(scope, opts?)`, `cashHeldLines(scope)`; `AgeingLabel`, `AgeingBucket`, `CashHeldSummary`, `CashHeldLine` | `src/lib/finance/remittance/cash-held.server.ts` | null / [] | S4 (carriers page), P5 Telegram daily (maintainer, C2-E) | OPE-§16.7 |
| `earningsStatement(scope, userId, opts?)`; `EarningsStatementData` | `src/lib/finance/statement.server.ts` | null | P4 `/queue/me` (maintainer, C2-E) | OPE-§15.5 |
| `refreshSnapshotCarrier(tx, scope, orderId)` | `src/lib/finance/snapshot.server.ts` | NotBuiltYet | S4 | OPE-§16.3 |
| `replayCommissionsFor(scope, orderIds)` | `src/lib/finance/commissions/replay.server.ts` | no-op `{ replayed: 0 }` | P4 `backfillMappedLabel` (maintainer, C2-E) | OPE-§15.3 |
| `carrierRateSummary(scope, accountId)` | `src/lib/finance/rates.server.ts` | null | S4 (carrier page Rates block) | OPE-§16.4 |
| `cashCollected(scope, range)`, `remittanceAgeingForConsole(scope)` | `src/lib/finance/console.ts` | null | S6 (dashboard funnel, console Ops tab) | S6 need 6 |
| `MoneySlot(props)`; `MoneySlotProps` | `src/components/admin/finance/drawer-money.tsx` | renders null | P4 order drawer `MoneyBlock` (maintainer, C2-E) | OPE-§16.7 |
| `EarningsStatement({ data })` | `src/components/admin/finance/earnings-statement.tsx` | renders null | P4 `/queue/me` (maintainer, C2-E) | OPE-§15.5 |
| `CarrierRatesEditor({ handle, accountId, canWrite })` | `src/components/admin/finance/carrier-rates-editor.tsx` | renders null | S4 (carrier page) | OPE-§16.4, §17.3 |
| `ImportFlow(props)`; `ImportFlowProps` | `src/components/admin/finance/imports/import-flow.tsx` | renders null | S4 (`/shipping/imports`) | OPE-§18.1 |

Cross-track rule frozen with `refreshSnapshotCarrier`: S4 inserts the `shipments` row (with `carrier_account_id`) before
the ship → shipped move, in the same or an earlier transaction, and calls `refreshSnapshotCarrier` when it attaches a
shipment to an order that is already shipped.

## S4 LOGISTICS

| Function / export | File | Stub | Callers | Source |
|---|---|---|---|---|
| `trackingImportKind`, `statusImportKind`, `logisticsImportKinds` (`ImportKindDef`) | `src/lib/shipping/import-kinds.ts` | preview / commitSlice NotBuiltYet (S3: `kind_unavailable`) | S3 (import registry) | OPE-§17.4, §18.3 |
| `activeShipmentFacts(scope, orderId, tx?)` | `src/lib/shipping/active.ts` | `{ open: false, settlement: null }` | P4 `transition.ts` preload (maintainer, C2-E) | OPE-§3.2, OD51, OD52 |
| `assignByRules(scope, order)` | `src/lib/callcenter/rules.ts` | `{ handled: false, assigned: null }` | P4 `assignOnCreate` (maintainer, C2-E) | OPE-§5.6, OP-18 |
| `revealGate`, `noteReveal`, `revealAlarmStates`; `RevealAlarmState` | `src/lib/callcenter/reveal-alarm.ts` | open gate / no-op / {} | P4 `reveal.ts`, `board.server.ts` (maintainer, C2-E) | OPE-§8.4, OP-19 |
| `applySheetShipmentFacts(scope, orderId, facts, src)` | `src/lib/shipping/sheet-facts.ts` | NotBuiltYet (S5 keeps R1 behaviour) | S5 (Sheets Tracking / Transporteur / Frais livraison) | IN-09 R2; S5 need 7 |
| `listCarrierAccounts(scope, opts?)`, `accountByLabel(scope, label)`; `CarrierAccountRow` | `src/lib/shipping/accounts.server.ts` | [] / null | S3 (remittance matching), S5 (Transporteur) | OPE-§17.3 |
| `shipmentByTracking`, `trackingLinkFor`, `setShipmentTracking`; `ShipmentRow` | `src/lib/shipping/shipments.server.ts` | null / null / NotBuiltYet | S3 (matching), S5 (webhook `tracking`, P5 shipped template) | OPE-§17.4, §23.2 |
| `shipmentFunnel(scope, range)` | `src/lib/shipping/funnel.ts` | null | S6 (dashboard funnel, console KPIs) | S6 need 6 |

S4's rule frozen with `applySheetShipmentFacts`: every shipment write keeps `orders.tracking_ref`,
`orders.carrier_label` and `sheet_dirty |= 2` in sync. Store-uploaded carrier files stay `src.kind = "import"` (actor
kind `api`, hand-set, AI R45).

## S5 INTEGRATIONS 2

| Function / export | File | Stub | Callers | Source |
|---|---|---|---|---|
| `WEBHOOK_EVENTS`, `WebhookEvent`, `WebhookEnvelopeV1`, `OrderWebhookV1` (OPE-§23.2), `LeadWebhookV1`, `RemittanceWebhookV1` | `src/lib/webhooks/types.ts` | — (frozen shapes) | S3, S4 (`tracking`), S5 | OPE-§23.1, §23.2; Q.18 |
| `enqueueWebhookEvent(scope, "remittance.imported", data, { ref, tx? })` | `src/lib/webhooks/emit.ts` | `{ enqueued: 0 }` (no endpoint before S5) | S3 (statement imports) | S5 need 6 |
| `resolvePublic(host, deps?)`, `ssrfRequest(url, opts, deps?)`; `SsrfFailure`, `SsrfDeps`, `SsrfRequestOptions` | `src/lib/security/ssrf.ts` | NotBuiltYet | S4 (tenant URLs), D2 (R3) | §K.4 S5 row; IN-07 |
| `mailer().enqueue({ template: "payout_ready", … })` | `src/lib/mail/index.ts` (T2's R1 file, S5 in R2) | exists (frozen, not stubbed) | S3 (payout approval) | OPE Q.13d |

`leadCreatedWebhooks` / `onLeadCreated` were frozen at C2-B2 (`C2B2Seams`).

## S6 PLATFORM UX

| Function / export | File | Stub | Callers | Source |
|---|---|---|---|---|
| `requestEdgePurge(storeId, { reason, paths?, hosts? })` (sync, never throws); `EdgePurgeReason` | `src/lib/edge-cache/purge.ts` | no-op | the maintainer's guarded call in `invalidateStoreRender` (C2-E): every S1 / S2 / publish / settings / lifecycle invalidation | S6 need 4; §C.5 |
| `register.server.ts` (empty module) | `src/lib/edge-cache/register.server.ts` | `export {}` | `src/instrumentation.ts` Node branch (C2-E) | S6 need 4-5 |

## S7 AI DATA

| Function / export | File | Stub | Callers | Source |
|---|---|---|---|---|
| `useStoreBlueprintJob`, `useLogoSystemJob`, `useCatalogFromPhotosJob`; `AiJobResultState<T>` | `src/lib/ai/router/job-hooks.ts` (new; S7 may re-export from `client.ts`) | idle state | S1 (overview, from-photos review), S2 (designer) | AI-11, DES-§13.16, SF-12 |
| `useDirectorReview(opts)`; `UseDirectorReviewOptions` → P7's `DirectorReviewProps` | `src/components/builder/ai/use-director-review.ts` | `enabled: false` (`<DirectorReview>` renders nothing) | S1 (store page editor), P6 Design check panel (maintainer, C2-E) | AI-19, DES-§8.9 |
| `FillSeoButton({ target, ids })`, `TranslateButton({ target, ids })` | `src/components/admin/ai/drafts/fill-button.tsx` | render null | S1 (catalog list), landing pages list | AI-09, AI-10 |

## STO-R19: finished R1 modules S1 consumes (exist; frozen in `C2CStoR19`, not stubbed)

| Function | File (R1 owner) |
|---|---|
| `zonesForCheckout(scope)` (the value-keyed `ZoneTable`, D68 rev 4), `listZones(scope)`, `zoneLineFor(scope, cityKey, at?, opts?)` | `src/lib/delivery/zones.server.ts` (P3) |
| `zoneForCity(zones, cityKey)` | `src/lib/delivery/match.ts` (P3) |
| `etaWindow(cal, zone, now)`, `etaText(w, zone, locale, dateLocale, now)`, `etaWindowText(zone, now, cal, locale, dateLocale?)` | `src/lib/delivery/eta.ts` (P3) |
| `signedTrackPath(store, orderId)` | `src/lib/tracking/links.ts` (P3) |
| `waConfirmText(store, order, locale)` | `src/lib/landing/templates.ts` (P3) |
| `cityKey(value)` (server-side; the store chunks bundle none of it) | `src/lib/orders/address.ts` (P4) |
| `callingWindowFor(scope)` | `src/lib/callcenter/window.server.ts` (P4) |
| `nextCallableAt(t, w)`, `hoursText(w, locale, dateLocale, now)`, `shopperPromiseAllowed(w)` | `src/lib/callcenter/window.ts` (P4) |

S1 imports them from these paths and writes nothing in `src/lib/delivery/**` or `src/lib/callcenter/**`.

## Left to C2-E (stub with its seam)

These callees exist only for a maintainer seam in a FINISHED R1 file; C2-E (the shared needs) writes each stub with its
call line so R1 byte-identity is proven once per seam: S1's `wizardSeedFromProduct` / `attachNewLanding` (P6 generate
wizard), `serveStoreTemplatePreview` (preview route), `catalogSitemapEntries` (+ the maintainer's `storeRequestGate`),
`CheckoutStoreBlock`, `AttachedItemsBanner` / `isMirroredPath` / `AttachSheet` (builder); S4's `RevealAlarmBadge`,
`AssignmentRulesEditor`, `MergeDialog`, `ShipmentPanel`, `shipmentsCsv`; S3's `FINANCE_EXPORT_TABLES` /
`receiptEntries`; S7's `recordGenerationFeedback` and the wizard Director adapters; P3's `savePolicies` (an extraction
from `savePoliciesAction`, not a stub); the `AiJobKind` widening to `catalog_from_photos` (S7's stage plan and P7's
exhaustive switches move with it); the job handler and extension-file registrations (C2-D).
