# CCR r2-m-c2b1: the R2 contract step's frozen contracts (applied by the maintainer)

State: **applied** (R2 contract step C2-B1, core §K.4 "Contract step (maintainer)", STO-§27.1, DES-§8.13).
Re-frozen in `src/lib/contracts/r2-contract.ts`; R1's `src/lib/contracts/r1-p0.ts` entries for `FoldItem`,
`estimateHeights` and `genomeOf` now assert the widened shapes.

## New frozen files (maintainer)

| File | Contract | Source |
|---|---|---|
| `src/lib/orders/contract-v3.ts` | `LineIn`, `OrderPayloadV3` (incl. `test`), `parseOrderPayloadV3` (field keys `l.<i>…`), `OrderResponseV3` (cents), `LeadPayloadV3` (incl. `kind`), `leadLinesV3`, `LeadResponseV3`, `DeliveryRule`, `OrderLineV3`, `OrderItemsV3` | STO-§16.1, §16.4, §15.11, §15.13 |
| `src/lib/orders/items-v3.ts` | `AnyOrderItems`, `isItemsV3`, `orderItemsView` (the zod-free v1 / v2 view R1 readers use) | STO-R8 |
| `src/storefront/schema.ts` | `STORE_PAGE_KINDS`, `StorePageDoc` v1, `storeDocIssues`, `readPageDoc`, `isLandingDoc` / `isStorePageDoc` | STO-§6.2, STO-R2 |
| `src/storefront/kinds.ts` | `KIND_RULES`, `STORE_SECTION_TYPES`, `Register` | STO-§6.1, §9.3 |
| `src/storefront/fold.ts` | `HERO_FAMILIES`, `PDP_FAMILIES`, `FAMILY_GRAMMARS`, `HERO_POOL`, `PDP_POOL`, `FoldLayout`, `foldLayoutFor`, `checkFold` (thin call into `estimateHeights`) | STO-§9.5, §12.8, DS33 |
| `src/storefront/types.ts` | `StoreRenderContext`, `StoreLinks`, `StoreFacts`, `DeliverySummary`, `CatalogShape`, `DataNeed`, `StoreSectionProps`, `StoreSectionDefinition` | STO-§8.1, §9.2, §11.1 |

S1-owned stubs pre-registered for the frozen files (S1 fills the bodies, the signatures are frozen):
`src/storefront/sections/check.ts` (`storeSectionIssue`, `storeDocExtraIssues`), `src/storefront/sections/features.ts`
(`storeVariantFeatures`, `STORE_FOLD_LAYOUTS` with the spec's measured PDP CTA bottoms), `src/storefront/views.ts`,
`src/storefront/i18n.ts` (`StoreUiKey`).

## Edits in other owners' files (one change each, behaviour of R1 unchanged)

- **Design (P6, finished):** `types.frozen.ts` `FoldItem` + `name | identity | collections`, `FoldLayoutData`,
  `VariantFeaturesResolved.fold.layout`; `gates/types.ts` the placeholder `StorePageDoc` swapped for storefront's
  (`StorePageKind` = storefront's kinds + `policy`); `derive.ts` `genomeOf(doc: PageDoc | StorePageDoc, opts?: { photos,
  look, market })` + `storeDocShell`; `heights.ts` `estimateHeights(doc: PageDoc | StorePageDoc, …)` with the store
  branch; `gate-input.ts` `GateInputCtx.market`; `render/prepublish/design.ts` the store's market; the store-template
  fixture and its selftest call sites.
- **Typed columns (STO-R2, STO-R8):** `pages.draft` / `page_versions.doc` are `PageDoc | StorePageDoc`, `orders.items`
  is `OrderItems | OrderItemsV3`; `OrderDraft` follows (with the 0006 NULL page / version and `catalogVersion`).
- **Lint L11** (`scripts/qa/tenancy-lint.ts`, fixtures in its self-check): every reader of `pages.draft` /
  `page_versions.doc` filters `pages.kind = 'landing'` or reads through `readPageDoc` / `isLandingDoc`. The R1 landing
  readers (admin pages and history, editor, publish and re-render, exports, pixels, campaigns, finance lite, design
  shingles / genomes, call-center sample, order versions, tracking, store routes) got the filter or the guard; four
  kind-agnostic readers are listed in `tenancy-allow.json` `docReads`.
- **`orders.items` readers** (drawer, CSV, Sheets push, call-center card, Telegram, message templates, tracking, upsell,
  edit, break-even) read through `orderItemsView` (identity for v1 / v2). The one-click upsell refuses a v3 order.
- **`budget:C2`** titles for the three new fold items (`budget.C2.name|identity|collections`, ar / fr / en).
- **Ownership:** the manifest moved to phase R2 (`--write-baseline --phase R2 --at acf4d54`); §K.3 names
  `r2-contract.ts` and the design corpus labels (no R2 writer), STO-§27.1 names `items-v3.ts`.
