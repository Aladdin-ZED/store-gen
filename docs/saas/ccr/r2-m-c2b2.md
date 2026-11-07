# CCR r2-m-c2b2: the R2 contract step's shared code (applied by the maintainer)

State: **applied** (R2 contract step C2-B2, core §K.4 "Contract step (maintainer)", STO-§27.1, LAN-§20.4, OPE Q.18,
AI R22 / R37 / R45, DES-R14). Signatures frozen in `src/lib/contracts/r2-contract.ts` (`C2B2Seams`). Every R2 path is
unreachable while `releaseOn("R2")` is false; R1 renders, prices and answers byte-identically (render goldens, the
frozen `landing` chunk and its pin unchanged).

## Seams the tracks fill (contract stubs, typed)

| File (owner in R2) | Seam | Stub behaviour | Source |
|---|---|---|---|
| `src/lib/catalog/attach.server.ts` (S1) | `attachedDocFor(scope, { pageId, productId, versionId, doc })` | the version's doc | STO-R12 (b) |
| `src/lib/storefront/templates.server.ts` (S1) | `ensureTemplateSet(scope, opts?)` | `{ created: [], published: [] }` | STO-R17 |
| `src/lib/storefront/chrome.server.ts` (S1) | `wrapInStoreChrome(scope, html, "track")` | the HTML as given | STO-R36 |
| `src/lib/landing/attach.server.ts` (S1) | `republishAttached(scope, pageId, { reason, actor })` | in-place re-render + `attached_in_place` | LAN Q24, STO-R41 |
| `src/lib/render/prepublish/storefront.ts` (S1) | the STO-§6.1 `registerBudgetProfile` calls (real values) | — | STO-R25, D66 |
| `src/lib/catalog/delivery.ts` (S1) | `zoneFeeOfRow`, `zoneFeeOfTable`, `storeDeliveryFee`, `landingZoneFee` (real, the one fee rule) | — | STO-§15.9, D75 |
| `src/lib/webhooks/lead.ts` (S5) | `leadCreatedWebhooks(scope, lead, tx?)` | no-op | OPE Q.18 |
| `src/lib/stats/version.ts` (S7) | `bumpVersionStats(scope, pageId, versionId, day, utmSource, delta, variantKey = "")`, `utmBucket` | no-op | LAN Q26, AI R22 |

## Maintainer code (new files claimed in §K.3)

- `src/lib/tenancy/catalog-version.ts`: `bumpCatalogVersion(scope, reason)` (UPDATE + `invalidateStore`),
  `bumpCatalogVersionForAsset(scope, assetId)` (once per store when an active product's `asset_refs` hold the asset).
- `src/lib/render/landing-v3.server.ts`: `chargesByCity`, `setChargeByCity` (the toggle seam S1's attach flow and the
  Offers tab call; stored as `pages.attach_opts.chargeByCity`, since 0006 adds no LP-16 column, LAN-§2.4),
  `landingRenderExtras` (zones / productKey render options), `landingShippingZone` (the order API's zone),
  `RUNTIME_V_ZONES = 3`.
- `src/landing/runtime/entry-v3.ts` + `src/landing/runtime/addons/landing-v3.ts`: the `landing-v3` chunk (fork of
  `entry.ts` + one zone lookup; 24,613 B gz against the 24,696 B budget = the re-measured `landing` 24,196 + 500).

## Edits in other owners' files (one change each)

- **Tenancy (maintainer):** `public.ts` `resolveProductKey(key, { purpose })` / `resolveContextKey(key)`; the page-key
  lookup carries `productId` and answers null for a store page kind. `schema.ts`: `ProductRow`, `AttachOpts.chargeByCity`.
- **Orders:** `resolve.ts` `orderVersion` overlays `attachedDocFor` for a page with `product_id` (R2) and forces
  `fallback`; `versionRuntimeV` (cached). `validate.ts` `ValidateOptions.zone` + `zonedTotals`; `create.ts` and
  `wa-order/{create.server,price}.ts` price a runtime_v 3 version by zone. `state.ts` `OrderActor.kind` +
  `integration` | `reconciliation`, `DELIVERY_EVIDENCE_ACTORS`; `events.ts` accepts and labels them; `hooks.ts`
  `onLeadCreated` + `LeadRow`; `leads.ts` / `wa-order/create.server.ts` call it after an insert (R2 only).
- **Render (maintainer / T3):** `config.ts` `contentIdOf(item, productKey)`, `opts.productKey`, `withZones`;
  `core.ts` / `document.tsx` pass `zones` / `productKey` (absent = today's bytes) and run `landing-v3` for a v3 config;
  `publish.server.ts` (publish + in-place re-render keep the runtime), `test-render.server.ts`; `prepublish.ts` imports
  `./prepublish/storefront`; `budget.ts` imports its limits before the registry and `clampPair` is hoisted (a profile
  registered at import must find them bound); `prepublish/landing.ts` skips `delivery:fee_mismatch` on a v3 page.
- **Runtime:** `config.ts` `LandingRuntimeConfigV3`; `entry-whatsapp.ts` accepts config v3 (the bridge reads the total
  shown). `budgets.json`: `landing-v3` 24,696 and the `page-v3` cap 36,600 (composition with `landing-v3`).
- **Exports (P3):** a runtime_v 3 version ships config v3 + `landing-v3` in static, connected and WhatsApp exports, its
  connected snapshot keeps runtime_v 3; the PHP export refuses with `export:runtime_v3_unsupported` (item on the answer).
- **catalog_version bumps:** `settings/index.ts` (`store`, `policies`, `brand`, `checkout`, `storefront` writes),
  `callcenter/settings.server.ts` `writeOps` (window / overrides), `delivery/zones.server.ts` `saveZones`,
  `media/process.ts` cutout enqueue (R2).
- **Mode switch (P2 / core):** `store-profile.ts` `updateStoreMode` (category required, `address_version` + 1, audit
  `store.mode_changed`, `ensureTemplateSet`); `settings/general/actions.ts` reaches it only in R2 (with
  `landing.inStoreMode` from `keepSalesPages`); `lifecycle.ts` runs `ensureTemplateSet` on `pending → active`.
- **Track route (landing):** `src/app/s/[store]/track/route.ts` imports `wrapInStoreChrome` (passed only in R2);
  `tracking/serve.server.ts` applies it before hashing the CSP.
- **Stats:** `stats/index.ts` `recordEvent` bumps the published version's row through `bumpVersionStats` (R2 only).
- **Media (P8):** `ProcessOptions.keepPng` (PNG ≤ 1200 × 630, ≤ 300 KB stored as given; `png_too_large`).
- **Roles:** `logistics` / `accountant` already hold their §A.3.2 keys; `ROLE_RELEASE` grants them from R2 (no change).
