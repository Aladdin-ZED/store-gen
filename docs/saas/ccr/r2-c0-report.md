# r2-c0-report: the R2 contract step (C2-A .. C2-F), maintainer report

State: **done** (2026-11-07). Source: core `docs/STORE-SAAS.md` §K.4 first paragraph ("Contract step (maintainer)"), §K.3,
§D.6 (0006), §J.6, §J.1, §H.13, §Q.2, §L.2; STO-§27.1 / STO-§3, DES-§26, OPE-§P, AI-§R.2 / AI-§M.3, the platform rows of
§L.2; the seven R2 plans (`qa/lead/r2-plans.json`: `sharedNeeds`, `crossTrack`, `ownerInputs`); the open R1 CCRs
(`docs/saas/ccr/r1-*.md`). Every R2 surface is unreachable while `releaseOn("R2")` is false (src/lib/auth/permissions.ts);
no R1 path calls an R2 stub; R1 renders, prices and answers byte-identically (render goldens, render cases, budgets green).

Registers written by the step:
- [r2-stubs.md](r2-stubs.md): the frozen cross-track signatures, **79 rows** (S1 17, S2 10, S3 13, S4 8, S5 4, S6 2, S7 3,
  STO-R19 finished modules 8 (frozen, not stubbed), C2-E stubs with their seams 14), checked at `tsc` by
  `src/lib/contracts/r2-stubs.ts`; a stub returns a typed empty value or throws `NotBuiltYet`
  (`src/lib/contracts/not-built.ts`).
- [r2-c0-needs.md](r2-c0-needs.md): the planners' **122 shared needs** (done 53, apply 53, merge 15, reject 1, owner 0)
  and the **10 open R1 CCRs** an R2 track needs (done 6, apply 1, merge 3).
- Maintainer notes: [r2-m-c2b1.md](r2-m-c2b1.md), [r2-m-c2b2.md](r2-m-c2b2.md), [r2-m-c2d.md](r2-m-c2d.md).

## What each step wrote

| Step | Commit | What |
|---|---|---|
| C2-A database | `4f93916` | `src/lib/db/schema.ts` + `drizzle/0006_r2.sql` (+ snapshot): 24 R2 tables and the 0006 columns of §D.6 (`catalog_redirects`, `inventory_moves`, `notification_prefs`, `pages.attach_opts`, `page_versions.product_rev` / `kind` + `'sync'`, `leads.page_id` NULL-able, the `store_themes` refinements of DES-§26, the `agent_earnings` key, the AI-§M.3 refined tables, `ai_jobs.kind` + `catalog_from_photos`); `test:migrate` case (k) covers 0006 (rerun, interrupted, an R1 database with data, the R2 values) |
| C2-B1 frozen contracts | `50086b5` | payload v3 (`src/lib/orders/contract-v3.ts`, zod-free `items-v3.ts`; v2 untouched), the typed `orders.items` / `pages.draft` unions and lint L11 (STO-R2, STO-R8), `OrderDraft`, `src/storefront/{types,schema,kinds,fold}.ts` (`StoreRenderContext`, page-kind section contract), the design widenings (DES-§26) |
| C2-B2 shared code | `6744c3c` | key resolvers (`resolveProductKey`, …), attached pricing + content ids, `catalog_version` bumps (`bumpCatalogVersion`), the R2 seams, actor kinds (`reconciliation`, …), the mode writer `updateStoreMode` (CCR r1-p2-4 §2), `keepPng`, the store chrome, LP-16 `landing-v3` runtime entry (core §L.2 LP-16) |
| C2-C typed stubs | `613f575` | cross-track signatures for S1..S7 (r2-stubs.md), `NotBuiltYet`, the STO-R19 R1 functions S1 consumes frozen in `C2CStoR19`; §K.4 claims S6 `src/lib/edge-cache/**`, S7 `src/components/{admin,builder,generate}/ai/**` |
| C2-D scripts, budgets, ownership, extension files, packages | `7f450b0` | §J.6 R2 scripts (package.json entries, typed-empty suites), store runtime chunk budgets (`pdp` 23,500, `store` 2,500, `cart` 6,000; §H.13), the R2 ownership table + `docs/saas/ownership-baseline.json` phase R2, every track's extension files typed-empty and registered (order hooks, jobs, nav, commands, search, i18n, health rules, notify kinds, tenancy cases), `harfbuzzjs` + `clipper-lib` (S2) |
| C2-E docs | `cc76dcf` | shared-needs amendments to core, design and platform specs; the C2-E stubs register |
| C2-E settings | `18691b0` | the R2 setting keys and their first schemas, `checkout.store`, `AssignmentRule`, brand `logo.png`, `LinkRefSchema` |
| C2-E orders, money, logistics | `900c886` | transition R2 writes (`activeShipmentFacts` in the transaction), S3 / S4 / S5 seams, accountant masking, outbox gate, `AiJobKind` + `catalog_from_photos` |
| C2-E storefront, render, wizard, edge | `f8a585c` | `storeRequestGate` (extracted, same answers), SEO / preview seams, DES-R4 (`effectiveTheme` / `activeThemeFor`), `savePolicies`, wizard product seed, `requestEdgePurge` line in `invalidateStoreRender` |
| C2-E tooling | `6477e52` | `ui-shots --prod / --scan-orange / --exec` and `accountantA`, the S6 pin reservation, the `woff2-sfnt` stub (CCR r1-p6-1 §3) |
| C2-E shared needs table | `3c0f13c` | r2-c0-needs.md (122 needs + 10 R1 CCRs decided), ops-db carrier recount (`orders.carrier_label`, need #57) |
| C2-F verify and report | this commit | four `test:db` suites that still asserted R1 P0 stubs brought to the merged R1 (below), one R1 defect fixed (agent lead conversion), this report |

### C2-F changes

- `scripts/qa/health-db-check.ts`, `scripts/qa/platform-check.ts` (`healthTick`): P1's health machinery is checked against
  its own rules (`rules/platform`) plus the test stand-in; since the R1 merges the registry also carries the shell,
  landing, ops and integrations rules (proven by their fixtures in `test:health`), whose issues moved every pinned score.
- `scripts/qa/platform-check.ts`: the console reads that were P4 / P5 / P7 / P8 stubs on `r1/p1` are real since the R1
  merges: lifecycle preview (every source answers, open orders a count), ConsolePulse `renders`, system / backups /
  system-health `machine` and `runs` (`ok`), the KPI row's orders (`ok`), the orders tab (masked rows, no canary), the
  review evidence's AI line (the pending cap from `aiStoreSummary`); the 50-way batch test sends valid
  `ops.new_orders` vars (an empty object logged 50 platform errors into the overview's error tile).
- `scripts/qa/integrations-db-check.ts` (pull run 4): without the double, P4's real `applyExternalStatus` /
  `appendOrderEvent` apply the status, the note (one order event) and the tracking; nothing deferred.
- `scripts/qa/ops-db-check.ts`: the call card's script is rendered by P5's renderer (one step); the converted lead reads
  `converted_via = 'agent'`, status `recovered`.
- **R1 defect fixed** in `src/lib/orders/hooks/landing.ts` (`attributeLead`): an order an agent converted from a lead
  (`ref = "lead:<id>"`, OPE-§11.4) is no longer matched by LD12's idem / phone attribution in the `created` hook, which
  ran first and credited the lead as `converted_via = 'phone'`, status `converted`, so `markLeadConverted` answered
  `already` and the agent's recovery was lost. Now `markLeadConverted` writes `converted_via = 'agent'`, status
  `recovered` and `lead.converted` (LAN-§10.4, OPE-§11.4 acceptance). No render, price or export changes.

## START HERE, per track

Every track: read core §K.4 (your row, the R2 ownership table, the exit), r2-stubs.md (your section and the rows that
name you as a caller), r2-c0-needs.md (rows with your track), `src/lib/contracts/r2-stubs.ts` (signature checks: keep
every signature; a change is a CCR), `src/lib/contracts/not-built.ts`, and gate everything on `releaseOn("R2")`.
`npm run test:ownership` must stay green (`docs/saas/ownership-baseline.json` is phase R2).

### S1 STOREFRONT (r2/s1)
- Contract files: `src/lib/orders/contract-v3.ts` / `items-v3.ts` (payload v3), `src/storefront/{types,schema,kinds,fold}.ts`,
  `OrderDraft` for `createOrderRow`, `resolveProductKey` and the key resolvers, `bumpCatalogVersion`, `storeRequestGate`
  (`src/lib/render/store-routes.server.ts`), `upsertLeadV3` (`src/lib/orders/leads.ts`, real), 0006 catalog tables,
  store chunk budgets (`pdp` 23,500 / `store` 2,500 / `cart` 6,000), the STO-R19 frozen R1 modules (`C2CStoR19`).
- Stubs to replace (bodies, signatures kept): `src/lib/catalog/{order-v3.server,products.server,schema,from-photos.server,blueprint.server,order-text-v3,contents,inventory.server,console,seo,seo.server,wizard-seed.server}.ts`,
  `src/lib/storefront/{defaults,onboarding.server,paths.server,render.server,preview.server}.ts`, `src/lib/landing/attach.server.ts`,
  `src/components/admin/catalog/product-picker.tsx`, `src/components/admin/storefront/{test-order-slot,checkout-store-block}.tsx`;
  frozen shapes `StoreBlueprint` (`src/lib/catalog/blueprint.ts`) and `HOME_STORYLINES` (`src/storefront/home/grammar.ts`).
- Deferred to S1's merge: #8 `assist` addon on attached pages (re-measure the chunk), #9 `links.storeHome`, #11 builder
  `pages.product_id` threading (one CCR against S1's attach components), #13 + CCR r1-p8-7 asset-refs product owner kind,
  #16 header cases for the new routes (§J.5).
- Owner inputs: none blocking. Optional 12 real product photos (catalog-from-photos fixture); a real store WhatsApp number
  and Cloud AI for live checks; Rich Results / TalkBack / VoiceOver checks at the R2 exit; the go-ahead to flip R2.

### S2 BRAND & LOGO (r2/s2)
- Contract files: 0006 `store_themes` (DES-§26 refinements), the design widenings of C2-B1, brand `logo.png` setting,
  `keepPng`, DES-R4 seams (`effectiveTheme` / `activeThemeFor` called on publish, re-render, unpublish).
- Stubs to replace: `src/lib/design/{store-theme.server,registers,brand,effective,blueprint,email}.ts`,
  `src/lib/logo/{params,system}.ts`, `scripts/fonts/woff2-sfnt.mjs` (`readWoff2`, CCR r1-p6-1 §3); packages `harfbuzzjs`,
  `clipper-lib` installed at C2-D.
- Deferred to S2's merge: #31 `logo.` / `theme.` / `theme.gate.` prefixes in S6's i18n-coverage.
- Owner inputs: an Arabic-reading reviewer for `qa/logo-goldens/shape-sheet.html` (not blocking); optional taste review of
  about 10 real store names.

### S3 MONEY (r2/s3)
- Contract files: 0006 finance tables (remittances, statements, rates, commissions, `agent_earnings` key), the
  `applyExternalStatus` widening (actor kind `reconciliation`), accountant masking, `orderUnitsV3` (real) for COGS.
- Stubs to replace: `src/lib/imports/{xlsx-write,registry,mappings.server}.ts`, `src/lib/finance/{rates.server,snapshot.server,statement.server,console}.ts`,
  `src/lib/finance/remittance/cash-held.server.ts`, `src/lib/finance/commissions/replay.server.ts`,
  `src/components/admin/finance/{drawer-money,earnings-statement,carrier-rates-editor}.tsx`, `.../imports/import-flow.tsx`;
  seams already wired: `MoneySlot` (drawer), `earningsStatement` (`/queue/me`), `replayCommissionsFor` (`backfillMappedLabel`).
- Deferred to S3's merge: #47 cash-held line in the Telegram daily (maintainer), #49 store-export R2 tables and receipts.
- Owner inputs: real carrier statement files (two per carrier, anonymised into `scripts/qa/fixtures/imports/`), per
  carrier how it pays and what its statement carries; optional ad-spend exports.

### S4 LOGISTICS (r2/s4)
- Contract files: 0006 `shipments`, `carrier_accounts`, `orders.carrier_label` carrier dim (ops-db recount), the
  `assignOnCreate` split (`assignByRules` first, every mode), `revealGate` / `noteReveal`, `activeShipmentFacts` in
  the transition transaction.
- Stubs to replace: `src/lib/shipping/{shipments.server,accounts.server,active,funnel,import-kinds,sheet-facts}.ts`,
  `src/lib/callcenter/{rules,reveal-alarm}.ts`, `src/components/admin/shipping/{shipment-panel,ops/assignment-rules,ops/reveal-alarm}.tsx`,
  `src/components/admin/orders/manual/merge-dialog.tsx`. Imports S1's v3 order functions and product picker, S3's
  `writeXlsx` and import framework, S5's `ssrfRequest` (stubs until those merge).
- Deferred to S4's merge: #58 cited-by-script rule with `carrier-check.ts`, #72 `shipments.csv` in the store export,
  #73 `logi.` in S6's i18n-coverage.
- Owner inputs: anonymised carrier files (tracking / status exports, manifest template); optional tracking-URL formats and
  label size.

### S5 INTEGRATIONS 2 (r2/s5)
- Contract files: payload v3 (`orderUnitsV3`, `items.v === 3`), `onLeadCreated`, the `applyExternalStatus` `returnReason`
  widening, the outbox handler gate, the webhook tables of 0006.
- Stubs to replace: `src/lib/mail/index.ts` (T2's R1 file, S5's in R2), `src/lib/security/ssrf.ts`,
  `src/lib/webhooks/{emit,types}.ts`. Imports S4's `applySheetShipmentFacts` (stub: keep the R1 Sheets columns).
- Deferred to S5's merge: #88 the console Mail nav item (S6's `nav.ts`) with S5's screen.
- Owner inputs: Hostinger SMTP mailbox (typed into /admin/settings/mail after deploy, never into chat) and the real
  hourly sending limit; optional webhook receiver URL, Google service-account key and test sheet, real status words.

### S6 PLATFORM UX (r2/s6)
- Contract files: `requestEdgePurge` (frozen; called by `invalidateStoreRender`), `register.server.ts` (instrumentation,
  R2), the ui-shots `--prod / --scan-orange / --exec` flags, the S6 pin reservation; S6 owns the dashboard
  (`blocks.tsx`: mount S1's frozen `StoreTestOrderSlot`), console `nav.ts`, `i18n-coverage.ts`.
- Stubs to replace: `src/lib/edge-cache/{purge,register.server}.ts`. Imports S1 (`storePathsFor`, `catalogForConsole`),
  S3 (`cashCollected`, `remittanceAgeingForConsole`), S4 (`shipmentFunnel`) stubs: null renders an honest line.
- Deferred to S6's merge: CCR r1-p8-23 part 2 (edgeTally `foreignHosts` / `workerVersion` in `proxy.ts`, maintainer) if
  the health tile needs them.
- Owner inputs: the real platform domain and a Cloudflare zone (proxied `*`, Worker route, console exclusion), the Worker
  bindings (`EDGE_KEY`, `ORIGIN`, `STORE_ROOT`, `WORKER_VERSION`, `HTML_CACHE`, `CF_ZONE_ID`), optionally `CF_PURGE_TOKEN`.

### S7 AI DATA (r2/s7)
- Contract files: `AiJobKind` incl. `catalog_from_photos` (`AiJobInput<"catalog_from_photos">.input` = S1's
  `CatalogFromPhotosJobInput`; `planForJob` refuses it until S7's stage plan), the AI-§M.3 tables, `savePolicies(ctx,
  input, { reviewed })` (P3, real), actor kind `reconciliation` rows for `stats_version_daily.delivered_evidence`.
- Stubs to replace: `src/lib/ai/router/job-hooks.ts`, `src/lib/ai/generation-feedback.server.ts`,
  `src/components/builder/ai/use-director-review.ts`, `src/components/admin/ai/drafts/fill-button.tsx`. Imports S1
  (`StoreBlueprint`, `ProductProposal`, product reads) and S2 (`compileBlueprint`, `getStoreTheme`, logo params) stubs.
- Deferred to S7's merge: #115 the Design check panel's Director review mount, #121 (conditional count), CCR r1-p7-3 (the
  wizard's AI settings and policies plumbing with the Director mounts). #120 (`CURRENT_RELEASE = "R2"`) is the lead's, at
  the R2 integration deploy.
- Owner inputs: an Anthropic API key (Console → AI) to switch Cloud AI on; after it `qa:ai-probe`,
  `qa:detached-job-probe`, the `ai_detached_jobs` flag and `qa:ai-eval-live` for the six new families.

## Recommended R2 merge order

**S5 → S3 → S2 → S1 → S4 → S7 → S6**, by the plans' `crossTrack` dependencies (each later track then proves its
acceptance against real bodies, not stubs):
1. **S5** first: S3 imports its Mailer (`payout_ready`) and `enqueueWebhookEvent`, S4 its `ssrfRequest`, S6 the Mailer
   for the e-mail channel; S5 only needs S4's `applySheetShipmentFacts`, whose stub keeps the R1 Sheets columns.
2. **S3** before S4: S4 imports `writeXlsx` and the import framework (manifest, Carrier CSV `format=xlsx`); S3 reads
   shipments through its own scoped queries on the 0006 tables and imports no S1 code.
3. **S2** before S1 and S7: S1 calls `getStoreTheme` / `sampleBrand` / `writeThemeDraft` and owns the DG-11 render-matrix
   proof on real themes; S7 imports `compileBlueprint` and the logo params. S2's theme preview shows its placeholder for
   the store kinds until S1 merges (`isNotBuiltYet`), proven again at S1's merge.
4. **S1** before S4 and S7: S4 imports the v3 order functions and the product picker; S7's blueprint UI calls
   `applyStoreBlueprint` / `startStoreDesign` (STO-§27.4: "S1 merges before S7's blueprint UI").
5. **S4** after S1, S3, S5.
6. **S7** after S1 and S2.
7. **S6** last: it imports S1 / S3 / S4 console and funnel reads (real by then), its restyle of the shared admin
   primitives then covers every R2 screen, and its `fr-r2` i18n rule (enforced from its merge) does not block the
   earlier merges. The edge cache stays a no-op purge until S6 and the owner's Cloudflare zone.
Then the R2 integration: `CURRENT_RELEASE = "R2"` (#120, the lead), the R2 exit checks of §K.4 / STO-§27.4.

## Checks (C2-F, heavy mutex, main at this commit)

| Check | Result |
|---|---|
| `npx tsc --noEmit -p .` | 0 errors (before and after the C2-F edits) |
| `npm test` | green (EXIT 0), run twice (before and after the C2-F edits): render goldens and render-check (runtime chunks `thanks` / `pixels` / `whatsapp` at their known by-design warnings, r1.0-deploy-checklist item 2), prepublish, `test:jobs`, budgets, `test:ownership`, `test:tenancy-lint` |
| `npm run test:db` | green, suite by suite (the chain stops at the first red, so after a red the rest ran from that suite on): `test:migrate` 275/0 (incl. (k) 0006) · `test:tenancy` 20713/0 (a first run had 1 timing flake in "ops writes: A's rows unchanged", green on rerun; the check now names the tables that moved) · `qa:action-replay` 13895/0 · `test:storage` 559/0 · `test:store` all OK · `test:tracking` 286/0 · `test:leads` 374/0 · `test:links` 266/0 · `test:test-orders` 221/0 · `test:kit` 35/0 · `test:pixels-publish` 60 · `test:public-api` passed · `test:php` 23/23 · `test:platform-db` 536/0 (was 11 red) · `test:health-db` 47/0 (was 7 red) · `test:design-db` 123/0 (one run had the hour-keyed privacy differencing check at 1 < 2 candidates, green on rerun: noise keyed on random fixture ids and the hour) · `test:integrations-db` 334/0 (was 1 red; one run had the legacy-pass tick timing at 233 ms > 150 ms on the loaded machine, green on rerun) · `test:queue` 128/0 · `test:ops-db` 452/0 (was 2 red) · `test:ai-db` 268/0 · `test:storefront-db`, `test:copy-check`, `test:brand-db`, `test:ledger`, `test:carriers`, `test:webhooks-db` green |
| `npm run test:migrate` / `test:tenancy` / `qa:action-replay` | inside `test:db` above |
| `npm run build` | green (EXIT 0): Turbopack compiled in 6.1 min, TypeScript and page generation passed, no webpack fallback |
| `npm run qa:upgrade-dry-run` | **passed, tenancy 0 problems**. The local dev DB `cod_storegen` is empty (0 tables, as r1.0-deploy-checklist item 4 notes), so the run used a throwaway copy `cod_test_c2_upgrade` (`mysqldump cod_storegen \| mysql`), brought to 0006 by the app's migrator (7 of 7 applied) and one boot (`runBootTasks`: empty install, `tenancy_v1` marker written): offers 0 drafts / 0 versions, 0 unreadable, no repairs; tenancy mode `tenancy`, 0 problems, 0 stores; the copy dropped. An R1 database **with data** upgraded through 0006 is `test:migrate` case (k) (every row survives, schema = a fresh install's). The production-dump run stays the lead's pre-deploy gate (HANDOFF §4) |
| `npm run qa:headers` | 762/762 (offline part; the online part needs `--base` against a production build, §J.3) |
| `npm run qa:secrets` | 64/64 (2 Hostinger env files read by name only, 0 findings) |

Not written: `qa/.gate-ok` (the lead writes it before a deploy).
