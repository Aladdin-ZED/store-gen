# P0 report: R1 product contract step

Date 2026-10-27 · branch `main` · contract: docs/STORE-SAAS.md core rev 6, §K.2 "Step P0" and §K.3, with the
maintainer build note of §K.2 (items 1-13). Commits: `0042571` (lead: packages), `df46028` (A), `78559ef` (B),
`e709178` (C), `0abe4da` (D), `1f4d6ed` (E) and step F (this report, the verification and its two fixes).

## Summary

P0 froze everything the eight R1 tracks (P1 CONSOLE, P2 SHELL, P3 LANDING, P4 CALL CENTER, P5 INTEGRATIONS, P6 DESIGN,
P7 AI, P8 PLATFORM OPS) build against, so that no track edits a shared file:

- the 0005 schema (38 tables, the R1 column refinements);
- the R1 settings keys;
- the extension files, imported by their registries;
- every cross-track API as a typed stub, asserted by a compile-time contract;
- the R1 `package.json` scripts;
- the report link;
- the budget gate, with the stub-build lock that stops a stub build from shipping.

Step F re-ran the whole verification on the final tree and fixed the two failures it found:

- **Track action cases** (decision F1). `test:tenancy` failed because P6's stub action had no attack case. The
  harness now takes action cases from the tracks' case files.
- **Database names** (decision F2). `test:migrate`'s 0004 cases and `qa:r1-exit` now use `cod_test_p0_*` names.

The contract audit found no missing key.

| Check | Result |
|---|---|
| 1. `npx tsc --noEmit -p .` · `npm run lint` · `npm test` · `npm run test:slow` | **PASS** (lint: 0 errors; 1 old warning in a read-only file) |
| 2. `test:db` on `cod_test_p0_*`: `test:migrate`, `test:tenancy`, `qa:action-replay`, `test:store`, `test:pixels-publish`, `test:public-api`, `test:php` | **PASS** (after fix F1) |
| 3. `SG_STUB_BUILD_OK=1 npm run build`, then `SG_STUB_BUILD_OK=1 npm run test:e2e`, then `npm run qa:secrets` | **PASS** |
| 4. Upgrade dry run on a production-equivalent DB: dry run, 0005 through the app's migrator, dry run again | **PASS** (0 problems before and after) |
| 5. Contract audit: §K.2 items, extension files, permission keys (§A.3) and entitlement keys (§A.4) | **PASS** (nothing missing, nothing added) |
| 6. `ownership-check --phase R1` reports 0 findings; `npm run test:ownership` | **PASS** |

## 1. What P0 delivers

| Step | Delivers | Main files |
|---|---|---|
| lead | `@anthropic-ai/sdk` pinned at 0.133.0 (P7). `npm audit fix` took 12 advisories to 4; the 4 left are dev-only and accepted. | `package.json`, `package-lock.json` |
| A | §D.5 tables in `schema.ts`. `0005_r1.sql` has 309 guarded, idempotent statements. Ownership phase R1, baseline at `0042571`. `test:migrate` section (j). | `src/lib/db/schema.ts`, `drizzle/0005_r1.sql`, `drizzle/meta/0005_snapshot.json`, `src/lib/db/upgrade-check.ts`, `docs/saas/ownership-baseline.json` |
| B | Every §D.10 R1 key complete, including the 15 ai-owned `platform_ai` fields. `test:settings` (496 checks). | `src/lib/settings/keys/*.ts`, `src/lib/settings/selftest.ts` |
| C | 95 extension files, each imported by its registry. `test:registries`. 46 R1 scripts. `gate:r1`. | the registries, `scripts/qa/registries-check.ts`, `scripts/qa/wow-demo.ts`, `src/lib/admin-data/search/registry.ts` |
| D | Cross-track stubs, part 1 (P4, P5, P3, P8). Five R1 order statuses. The contract file. | see §2; `src/lib/contracts/r1-p0.ts` |
| E | Cross-track stubs, part 2 (P1, P2, P6, P7). The report link. The budget gate. The stub-build lock. The build note. | see §2 and §5 |
| F | Verification. Fixes F1 and F2. This report. | `scripts/qa/tenancy-check.ts`, `scripts/qa/tenancy-cases/design.ts`, `scripts/qa/migrate-check.ts`, `scripts/qa/e2e/r1.0-exit.ts` |

`src/lib/contracts/r1-p0.ts` (maintainer, types only, 261 assertions) asserts every frozen signature and shape. A
track that renames, removes or re-types a frozen export breaks `tsc`; such a change goes through a CCR. A probe file
with 4 wrong signatures failed `tsc` with 4 × TS2344, at both D and E.

## 2. Stub table

Every stub compiles. Each one either returns the documented safe default or throws
`new Error("not implemented: P<n> <name>")`. A stub never invents data. "Real" means the spec gives the code and P0
implemented it, because a track that merges earlier needs it. Each new stub file names its owning track and its spec
section in its header.

### P4 CALL CENTER (operations.md)

| File | Export | Stub behaviour |
|---|---|---|
| `src/lib/orders/transition.ts` | `transitionOrder`, `applyExternalStatus`, `actorFrom` | throws (write stubs take a `WriteScope`, D71) |
| `src/lib/orders/state.ts` | `projectStatus`, the state lists | **real** (OPE-§3.3; P5 merges before P4) |
| `src/lib/orders/state.ts` | `legacyToWanted` | throws (the parts disagree) |
| `src/lib/orders/address.ts` | `cityKey`, `CITY_KEYS` | **real**: the slug rule; unknown input gives `null` |
| `src/lib/orders/address.ts` | `normalizeCity` | throws |
| `src/lib/orders/masking.ts` | `maskPhone`, `maskPhonesIn` | throws |
| `src/lib/orders/queue.ts` | `opsPulse`, `releaseAllLeases` | throws |
| `src/lib/orders/manual.ts` | `createManualOrder`, `convertLeadToOrder` | throws (take a `WriteCtx`; the v2 path inserts through `createOrderRow`, D72) |
| `src/lib/orders/events.ts` | `appendOrderEvent`, `ORDER_EVENT_TYPES` | throws |
| `src/lib/orders/profile.ts` | `orderKpis`, `queueCounts`, `listOrdersForConsole`, `getOrderForConsole`, `recordPlatformReveal`, `orderRiskMix`, `searchOrders` | throws |
| `src/lib/callcenter/window.server.ts` | `callingWindowFor` | `DEFAULT_WINDOW` in the store time zone, `configured: false`; never `null` |
| `src/lib/callcenter/window.ts` | `isoWeekday`, `rangesForDay`, `isCallable`, `nextCallableAt`, `shopperPromiseAllowed` | **real**. `nextCallableAt` throws a `RangeError` when the window has no range in the next 400 days. |
| `src/lib/callcenter/window.ts` | `hoursText` | throws (OPE and AI give different wordings) |
| `src/lib/callcenter/defaults.ts` | `DEFAULT_WINDOW` | the value (`keys/ops.ts` re-exports it) |
| `src/lib/callcenter/window.fixtures.ts` | `WINDOW_FIXTURES` | the `DEFAULT_WINDOW` cases only |
| `src/lib/callcenter/aggregates.ts` | `opsAggregates`, `attemptStats`, `AGG_DIMS` | empty cells and `suppressed: 0`; `attemptStats` gives `[]` |
| `src/lib/callcenter/{outcomes,script}.ts` | types, `ScriptDoc` | types only |
| `scripts/qa/fixtures/city-key.json` | (data) | the zone-table case and every slug |

### P5 INTEGRATIONS (operations.md)

| File | Export | Stub behaviour |
|---|---|---|
| `src/lib/integrations/templates.ts` | `renderTemplate`, `orderTemplateValues` | throws |
| `src/lib/integrations/templates.ts` | `TEMPLATE_VARS` | the variable list |
| `src/lib/integrations/health.ts` | `integrationHealth`, `sheetsBacklog` | throws |
| `src/lib/integrations/deliveries.ts` | `listDeliveries` | throws |
| `src/lib/sheets/push.ts` | `scheduleSheetPush` | throws |
| `src/lib/jobs/handlers/{capi,telegram}.ts` | (outbox handler files) | empty; imported by `jobs/registry.ts` |

### P3 LANDING (landing.md)

| File | Export | Stub behaviour |
|---|---|---|
| `src/lib/delivery/match.ts` | `zoneForCity`, `zoneForCityValue` | **real**: `null` and unknown keys map to the `*` zone (D68) |
| `src/lib/delivery/table.ts` | `buildZoneTable` | **real** |
| `src/lib/delivery/eta.ts` | `etaWindow`, `localParts`, `addWorkingDays` | **real** |
| `src/lib/delivery/eta.ts` | `etaText`, `etaWindowText` | throws (the wording conflicts in LAN-§7.2) |
| `src/lib/delivery/zones.server.ts` | `zoneLineFor` | `null`: no promise is shown |
| `src/lib/delivery/zones.server.ts` | `zonesForCheckout`, `zoneFeesFor` | throws |
| `src/lib/tracking/links.ts` | `signedTrackPath` | throws (`/track` ships with P3) |
| `src/lib/landing/templates.ts` | `waConfirmText` | throws |
| `src/lib/landing/mode-plan.ts` | `landingModeSwitchPlan` | throws |
| `src/lib/landing/cod-invariants.ts` | `codInvariants` | throws. The result shape is frozen; `CodInvariantInputs` is proposed and P3 may add inputs. |
| `src/lib/landing/honesty/facts.server.ts` | `recordFacts` | re-exports the working R1.0 function |
| `src/lib/testing/links.ts` | `mintTestLink` | throws |
| `src/lib/campaigns/compile.ts` | `compileKit` | throws |
| `src/lib/orders/leads.ts` (existing) | `markLeadConverted` | throws (appended); the existing functions are unchanged |

### P8 PLATFORM OPS (core §G, §H)

| File | Export | Stub behaviour |
|---|---|---|
| `src/lib/jobs/outbox.ts` | `registerOutboxHandler`, `outboxHandler` | **real** registry |
| `src/lib/jobs/outbox.ts` | `enqueue`, `drainOutbox`, `replay`, `outboxSummary` | throws |
| `src/lib/jobs/renders.ts` | `enqueueRenders`, `renderSummary` | throws |
| `src/lib/platform/health.ts` | `getHealth` | throws. `PlatformHealth.ai` is `AiHealth \| null`. |
| `src/lib/exports-store/index.ts` | `requestStoreExport`, `listExportJobs`, `exportPartStream` | throws |
| `src/lib/backup/index.ts` | `listBackupRuns`, `backupFiles` | throws |

### P1 CONSOLE (platform.md)

| File | Export | Stub behaviour |
|---|---|---|
| `src/lib/platform/notify.ts` (existing) | `notify` | T2's working body |
| `src/lib/platform/notify.ts` (existing) | `listNotifications`, `unreadCount`, `markRead` | throws: rows exist since R1.0, so an empty answer would pretend |
| `src/lib/platform/health-snapshot.ts` | `getStoreHealth` | `null` = not computed yet |
| `src/lib/platform/health-snapshot.ts` | `markHealthDirty` | no-op |
| `src/lib/platform/health-snapshot.ts` | `requestHealthRecompute` | marks the store dirty and answers `queuedAt` |
| `src/lib/platform/health-snapshot.ts` | `snoozeHealthIssue` | throws |
| `src/lib/platform/mask.ts` (R1.0) | `maskCustomerFields`, `maskIfImpersonation`, `Masked` | identity for every scope kind except `impersonation` |
| `src/lib/platform/brand-check.ts` (R1.0) | `checkBrandTerms` | `"ok"` |
| `src/lib/platform/abuse-report.ts` | `recordAbuseReport` | throws |
| `src/lib/health/types.ts` (maintainer) | `HealthInputs`, `StoreHealthView`, the flag codes | frozen shapes |

### P2 SHELL (platform.md, design.md)

| File | Export | Stub behaviour |
|---|---|---|
| `src/lib/tenancy/handles.ts` (R1.0) | `renameHandle` | working; honours `freeRename` |
| `src/lib/pulse/{types,registry}.ts` (maintainer) | the pulse contributor registry | working; the contributors return `{}` |

### P7 AI (ai.md): "Cloud AI off"

| File | Export | Stub behaviour |
|---|---|---|
| `src/lib/ai/router/server.ts` | `aiPolicyFor` | cloud unavailable with `platform_off` (`state` under impersonation); no live task |
| `src/lib/ai/router/server.ts` | `runAi` | the typed failure `disabled` |
| `src/lib/ai/router/server.ts` | `registerBatchResultHandler`, `batchResultHandler` | **real** registry |
| `src/lib/ai/router/server.ts` | `queueAi` | throws |
| `src/lib/ai/jobs/enqueue.ts` | `enqueueAiJob` | `disabled` |
| `src/lib/ai/jobs/pulse.ts` | `aiJobsForPulse` | `{ running: 0, done: [] }` |
| `src/lib/ai/summary.server.ts` | `aiUsageForStore` | nothing used: `creditsUsed: 0`, `creditsLimit: null`, `costMicros: 0` |
| `src/lib/ai/summary.server.ts` | `aiStoreSummary`, `aiHealth` | throws |
| `src/lib/ai/feedback.server.ts` | `linkAiRuns`, `recordPublishFeedback` | no-ops |
| `src/lib/ai/tasks.ts` | `AI_TASK_IDS`, `isAiTaskId` | the task list |
| `src/lib/ai/{policy,provider/types}.ts` | `AiPolicy`, `AiOutcome`, `TaskIO` | types. `TaskIO` types `injection.screen`; the other tasks stay `unknown` until P7's schemas land. |

### P6 DESIGN (design.md)

| File | Export | Stub behaviour |
|---|---|---|
| `src/lib/design/vocab.ts` | `GENE_VOCAB` | only the enumerated genes the gene table fixes; P6 completes G4, the ranges and the structs |
| `src/lib/design/solve.ts` | `sampleGenome` | throws |
| `src/lib/design/derive.ts` | `genomeOf` | throws |
| `src/lib/design/distance.ts` | `genomeDistance` | throws |
| `src/lib/design/novelty.server.ts` | `checkNovelty` | the documented "novelty off" bands |
| `src/lib/design/novelty.server.ts` | `nicheShares` | `n: 0`, empty maps, `seq4: []`, `tells: []` ("k < 10") |
| `src/lib/design/headlines.server.ts` | `checkHeadlineNovelty` | `ok` with no band, per line |
| `src/lib/design/actions.ts` | `checkHeadlinesAction` | `storeAction` with `pages.write`, 60 per 10 min per store. Answers what `checkHeadlineNovelty` answers. |
| `src/lib/design/cliche.ts` | `clicheScore` | no hit |
| `src/lib/design/hints.ts` | `validateHints` | accepts nothing; every entry is dropped with `why: "vocab"` |
| `src/lib/design/health.server.ts` | `designHealth` | empty |
| `src/lib/design/digest.ts` | `renderDigest` | a digest with empty counts and `gates: { hard: [], soft: [], slop: 0, q: 0 }`, flagged `stub: true` |
| `src/lib/design/heights.ts` | `estimateHeights` | report flagged `stub: true`: `fold.ok = true`, every section 600 px, `formTop = null` |
| `src/lib/design/heights.ts` | `HEIGHT_MODEL_VERSION` | `0` (the stub) |
| `src/lib/design/features.ts` | `variantFeatures` | the documented defaults: `family: "grid"`; the two fixed layers (sticky bar, WhatsApp float) |
| `src/lib/design/photo-facts.ts` | `estimateAlpha` | `null` |
| `src/lib/design/gates/repair.ts` | `AI_REPAIR_OPS` | the constant |
| `src/lib/design/index.ts` | `DIRECTOR_TASKS` | the constant (`design.plan`, `design.critique`) |
| `src/lib/design/index.ts` | `GenomeCard`, `Band`, `RepairOp` (re-exported) | types |
| `src/lib/design/{types,genome,gates/types}.ts` | genome types; `VOICE_REGISTERS`, `HEADLINE_STRUCTURES`, `ANGLES`, `OPENERS`, `ASPECTS` | types and constants |
| `src/components/generate/reveal/RevealFolds.tsx` | `RevealFolds` | renders the three docs' first sections through the admin thumbnail, with both slots |
| `src/landing/sections/footer/report.ts` | `FOOTER_RENDERS_REPORT` | `false`: the page shell draws the report row |
| `src/lib/design/types.frozen.ts` (maintainer) | `HeightReport`, `FoldReport`, `FoldItem`, `VariantFeaturesResolved` | frozen shapes |

### Maintainer (core)

| File | Export | Behaviour |
|---|---|---|
| `src/lib/urls/index.ts` (R1.0) | `reportUrl`, `consoleHref` | working |
| `src/landing/{types,context,i18n}.ts`, `src/landing/document.tsx` | `PageLinks.report`, `storePageLinks(base, slug, report?)`, UiKey `footer.report`, the `lp-report` row | live, test and preview renders carry the link; exports never do |
| `src/lib/render/prepublish/budget.ts` | `budgetCheck`, `budgetReport`, `budgetResult`, `registerBudgetProfile`, `budgetProfileFor`, `assertStubBuildAllowed` | the §M.2 gate, advisory while the model is the stub (§5) |
| `src/lib/render/prepublish/budget-limits.ts` | `heightModelIsStub`, `HEIGHT_BAND`, `FOLD_BAND`, the D52 ceilings | constants and the one stub predicate |

`VariantFeatures` (the registry's `features` field, DES-§8.4) is P6's `src/landing/registry.ts` work and is not a P0
stub. Only its resolved form, `VariantFeaturesResolved`, is frozen.

## 3. Extension files per track

Each file is created with typed empty contents and imported by its registry. `test:registries` proves every file on
disk is imported (17 registries).

| Track | Files |
|---|---|
| P1 | `health/rules/platform.ts`, `notify/kinds/platform.ts`, `flags/defs/platform.ts`, `jobs/tracks/platform.ts`, nav `console.ts`, i18n `{console,notify}.ts` × 3 locales, `tenancy-cases/platform.ts`, `wow-demo/steps/platform.ts` |
| P2 | `health/rules/shell.ts`, `pulse/contributors/shell.ts`, `commands/shell.ts`, i18n `{shell,auth,onboarding,team,health,brief}.ts` × 3, `wow-demo/steps/shell.ts` |
| P3 | `health/rules/landing.ts`, `pulse/contributors/landing.ts`, `notify/kinds/landing.ts`, `orders/hooks/landing.ts`, `render/prepublish/landing.ts`, `admin-data/search/landing.ts`, `commands/landing.ts`, nav `landing.ts`, `jobs/tracks/landing.ts`, i18n `landing.ts` × 3, `tenancy-cases/landing.ts`, `wow-demo/steps/landing.ts`, `render-cases/landing.ts`. No flags file (LAN-§23.10). |
| P4 | `health/rules/ops.ts`, `pulse/contributors/ops.ts`, `notify/kinds/ops.ts`, `flags/defs/ops.ts`, `orders/hooks/ops.ts`, `admin-data/search/ops.ts`, `commands/ops.ts`, nav `ops.ts`, `jobs/tracks/ops.ts`, i18n `{ops,finance}.ts` × 3, `tenancy-cases/ops.ts`, `wow-demo/steps/ops.ts` |
| P5 | `health/rules/integrations.ts`, `pulse/contributors/integrations.ts`, `notify/kinds/integrations.ts`, `orders/hooks/integrations.ts`, `commands/integrations.ts`, nav `integrations.ts`, `jobs/tracks/integrations.ts`, i18n `integrations.ts` × 3, `tenancy-cases/integrations.ts`, `jobs/handlers/{capi,telegram}.ts` |
| P6 | `health/rules/design.ts`, `flags/defs/design.ts`, `render/prepublish/design.ts`, `admin-data/search/design.ts`, nav `design.ts`, `jobs/tracks/design.ts`, i18n `design.ts` × 3, `tenancy-cases/design.ts` (with the `checkHeadlinesAction` action case, F1), `wow-demo/steps/design.ts`, `render-cases/design.ts` |
| P7 | `health/rules/ai.ts`, `notify/kinds/ai.ts`, `flags/defs/ai.ts`, nav `ai.ts`, `jobs/tracks/ai.ts`, i18n `ai.ts` × 3, `tenancy-cases/ai.ts`, `wow-demo/steps/ai.ts`, `render-cases/ai.ts` |
| P8 | `jobs/tracks/core.ts` (C0a), with the rest of `src/lib/jobs/**` |

Notes:

- Order hooks run in this order: ops, then landing, then integrations (OPE-§3.6).
- The tenancy harness loads the case files lazily, from an explicit `TENANCY_CASE_FILES` list. An empty case file is
  reported as "not applicable".
- P3's add-on chunks (`src/landing/runtime/addons/<chunk>.ts`) are P3's to create. Their `budgets.json` keys (`assist`,
  `assist-ty`, `track`) already exist.

## 4. Scripts

Every R1 name of §J.1-§J.5, and every R1 name of §J.6, is in `package.json`. The ones still missing are R2 or R3
names: storefront, logo, ledger, imports, carriers, webhooks, experiments. 47 scripts were added (46 at step C, plus
`test:settings`). `test:ai-eval` now passes `--offline`. `prebuild` now starts with `tsx scripts/qa/stub-lock.ts`.

| In an aggregate now | Scripts |
|---|---|
| `npm test` (P0 added three) | `test:settings`, `test:registries`, `test:prepublish`, alongside the existing suites. `test-budget --static`: 175 of 180 s declared. |
| `gate:r1` | `gate` + `qa:wow-demo` + `qa:publish-gates` + `qa:design-corpus` + `test:ai-eval`, then `qa:ai-eval-live` only when `ANTHROPIC_API_KEY` is set. `qa:wow-demo` fails by design until the R1 integration writes its browser runner. |
| in no aggregate yet: the file does not exist, so the maintainer adds it at that track's merge | `test:platform`, `test:health`, `test:pulse`, `test:admin-{tokens,motion,rtl}`, `test:i18n-coverage`, `test:delivery`, `test:landing-addons`, `test:policies`, `test:wa-price`, `test:test-orders`, `test:kit`, `test:links`, `test:tracking`, `test:leads`, `test:honesty`, `test:cod-invariants`, `test:ops`, `test:queue`, `test:state`, `test:profit`, `test:ai`, `test:design`, `test:registry`, `test:storage`, `test:{health,ops,integrations,design,ai}-db`, `qa:publish-gates`, `qa:pulse-e2e`, `qa:admin-perf`, `qa:wizard-e2e`, `qa:design-corpus`, `qa:design-report`, `qa:ai-probe`, `qa:ai-stream`, `qa:ai-eval-{live,local}`, `qa:detached-job-probe` |
| exists, but not in `npm test` | `test:copylib` (the existing selftest) |

## 5. The stub-build lock, and how the lead runs merge gates

The spec says `npm run build` is red until P6 merges, and also that every merge needs `npm run gate` green. The lock
resolves that conflict. There is one predicate, `heightModelIsStub()` in `src/lib/render/prepublish/budget-limits.ts`
(`HEIGHT_MODEL_VERSION === 0`; every report then carries `stub: true`), and four places that use it:

| Lock | Behaviour |
|---|---|
| Build time | `prebuild` starts with `scripts/qa/stub-lock.ts`, which exits 1 while the model is the stub, unless `SG_STUB_BUILD_OK=1`. |
| Run time | `src/lib/render/prepublish/budget.ts` throws at module load under `NODE_ENV === "production"` on the same condition. |
| Gate file | `scripts/qa/gate-ok.ts` writes `"stubBuild": true` into `qa/.gate-ok` whenever the model is the stub. It asks the module and never reads the variable. |
| Archive | `scripts/deploy/archive.mjs` refuses a gate file with `stubBuild: true` (the rule is in `scripts/deploy/gate-file.mjs`). |

So a stub build can never be archived or deployed. Hostinger's own build is red because it never sets the variable.
Both locks of §H.10 hold.

**Merge gates before P6:** the lead runs `SG_STUB_BUILD_OK=1 npm run gate`. The variable reaches `next build` and the
server that `qa:r1-exit` starts. `qa:r1-exit` copies its own environment into the server's and blanks only the keys
named in `.env*` files and in its forced-empty list; neither contains this variable. `qa:headers` and `qa:edge-sim`
start no server: their online part needs `--base`, and their offline part runs in-process with the same environment.
From the P6 merge on, `HEIGHT_MODEL_VERSION` is above 0, the variable is no longer needed, and every budget row is hard.

**The whole budget gate is advisory before P6** (build note item 5). Besides C2, C3 and F1, the rows F5, R1, R4, R5, K2
and I1 are measured and classified but published as notes while the stub is in place. Today's pages are the baseline
those rows were written against: the argan fixture is 171 KB gzipped, with 20 primary order buttons, 315 reveal nodes
and 6 colour bands. Enforcing the rows now would refuse every publish and turn every earlier merge gate red.

## 6. Deviations from the spec, and decisions

Each one is recorded in the §K.2 maintainer build note.

1. **Schema (A).**
   - Where the core and a part disagree, the part's cut list wins (AI-§M.1, DES-§2.1, the operations refinements).
   - `agent_stats_daily`'s R2 counters exist from 0005, with default 0.
   - Defaults the spec left open: `carrier_rates.active` defaults to true and its fees are NULL-able;
     `ad_spend_daily.source` defaults to `'manual'`.
   - The four-eyes rule is a SQL CHECK.
   - Every `store_id` has an `fk_<table>_store` RESTRICT FK.
   - The §D.3 row `job_runs` / `cron_cursors` is split.
2. **Settings (B).**
   - A stored `hours` field is dropped on read, never mirrored (D73).
   - `platform_ai.prices` defaults to empty: no invented price.
3. **Extension files (C).**
   - P2's `commands/shell.ts` exists.
   - The pulse and search files are single-object stubs.
   - `prepublish.ts` registers through a hoisted function declaration (a circular-import fix).
4. **Stubs (D, E).**
   - Every write stub takes a `WriteScope` (D71, over the parts' older `StoreScope`). Order hooks do too.
   - Five R1 statuses are appended to `src/lib/orders/contract.ts`.
   - Operations' console-read signatures win over PLA Q.11.
   - Open shapes were filled in and frozen in the contract file.
5. **Report link (E).**
   - Until P6's footer draws it, the page shell adds an `lp-report` row. P6 switches the row off with
     `FOOTER_RENDERS_REPORT`.
   - Proof: every export bundle (2,283 files) is byte-identical to before. Only the 21 live landing documents
     changed.
6. **Budget gate (E).** Advisory as a whole before P6 (§5). This goes beyond the spec's C2, C3 and F1. **The lead
   signs off on it.**
7. **F1: track action cases (`scripts/qa/tenancy-check.ts`, maintainer).**
   - The problem: `test:tenancy` failed on `action src/lib/design/actions.ts#checkHeadlinesAction has an attack
     case`. The coverage rule derives every store server action from the tree, but only accepted cases from the
     maintainer's `ACTION_CASES`. Every track that adds an action would therefore have had to edit the harness, which
     is the contradiction DES-R13 meant to remove.
   - The fix: a case file may also export `actions: TrackActionCase[]` (an `ActionCase` without its derived `id`;
     the file imports types only). `setup()` merges these into `ACTION_CASES`, for both `test:tenancy` and
     `qa:action-replay`. A duplicate id is a failure.
   - The action case for P6's stub is in P6's `tenancy-cases/design.ts`.
   - §K.3's extension-point text names the new export.
8. **F2: throwaway database names.**
   - `test:migrate`'s 0004 cases now create `cod_test_p0_t1_*` instead of `cod_test_t1_*`. The text replacement is
     safe: the regex already accepted `p0`, and the 0005 cases were already `cod_test_p0_*`.
   - `qa:r1-exit` accepts `--db cod_test_p0_*` beside `cod_test_fin_*`.
   - Every database of step F was named `cod_test_p0_*` and dropped. A `cod_test_%` listing afterwards is empty.

**Deferred, with the reason:**

- Narrowing `MessageKey` and `NotificationKind` to strict unions. Today's R1.0 code uses keys and kinds that no file
  declares yet. The maintainer narrows at the R1 integration.
- `checkBrandTerms("wordmark")`: an R2 field.
- Narrowing the AI task input and output types: P7.
- `callingWindowFacts` (`src/lib/editor/check-facts.ts`, T4, read-only) ignores ranges that cross midnight. This
  contradicts OPE-§5.5 and needs a CCR.
- One existing lint warning in `src/lib/orders/text.ts`, a read-only file not touched by P0.

## 7. Verification (step F, final tree; heavy commands through the machine mutex)

| Suite | Result |
|---|---|
| `npx tsc --noEmit -p .` | exit 0 |
| `npm run lint` | exit 0: 0 errors, 1 warning (`_productName` in `src/lib/orders/text.ts`, from before P0) |
| `npm test` | exit 0, 149 s. Theme checks OK. Runtime selftest 208 + parity 15,422. Generator OK. `test:render` ALL OK (report link: one per live landing, none in exports; render cases 0; thanks, pixels and whatsapp chunks within the +5 % tolerance, as before P0). Money parity byte-identical. Conversions 108. Offers 1,219. Orders 138/138. Settings 496/496. Registries 17 (self-check 10/10). Prepublish 10/10. Ownership: 0 findings. Re-run after the spec and report edits: exit 0, 135 s; ownership 1,633 files (178 new since `0042571`). Tenancy lint: 0 violations in 1,166 files (55 tenant tables). |
| `npm run test:slow` | exit 0, 148 s, all theme checks |
| `test:migrate` | 217/217, 170 s; every throwaway DB dropped |
| `test:tenancy --db cod_test_p0_tenancy` | 6,551 passed, 0 failed, 12 not applicable (the case files that are still empty). It failed once (6,488 / 1) before fix F1. |
| `qa:action-replay --db cod_test_p0_action_replay` | 4,128 passed, 0 failed; 61 recorded bodies |
| `test:store --db cod_test_p0_store` | 36 checks, ALL OK |
| `test:pixels-publish --db cod_test_p0_pixels_publish` | 60 assertions |
| `test:public-api --db cod_test_p0_publicapi` | 33 checks, all passed |
| `test:php` | parity 2,650/2,650; order outputs 23/23 |
| `SG_STUB_BUILD_OK=1 npm run build` | exit 0, 114 s. The stub-lock warning was printed, then `gate:offline` ran, then the build compiled. |
| `SG_STUB_BUILD_OK=1` `qa:headers` · `qa:edge-sim` · `qa:r1-exit --port 3451 --db cod_test_p0_r1_exit` | 677 · 145 · 73 checks, all passed. The 3451 server was stopped and the DB dropped. |
| `npm run qa:secrets` | 57 checks passed |
| Upgrade dry run on `cod_test_p0_prod` | see below |
| Contract audit | see below |
| `ownership-check --phase R1` · `test:ownership` | 94 rows, 1,301 patterns, 1,633 files (178 new): no file has two owners in R1; every new file has an owner |

**Upgrade dry run on a production-equivalent DB.** A scratch script (not committed) built `cod_test_p0_prod` the way
the live site got to R1.0:

- The pre-tenancy data:
  - 0000-0003;
  - users: an owner with TOTP, an editor, an agent;
  - three pages (two published, one draft) with five versions and a PHP export;
  - 12 orders: live, export and php sources, every status;
  - leads (one converted), stats and a blocked phone;
  - the legacy settings rows, including v1-sealed `turnstile` and `tracking_secrets`, and a legacy `store` value
    carrying `confirmation.hours`.
- The R1.0 deploy: 0004 and the app's boot tasks, which converted store #1 and re-sealed 2 envelopes.
- R1.0-era writes:
  - a second store, `pending`, with its own owner, page, version and test order;
  - a lead;
  - `store_settings` rows `store` and `policies` carrying the removed `confirmation.hours` and `contact.hours`.

Results:

- Before 0005, `npm run qa:upgrade-dry-run -- --db … --require-envelopes`:
  - offers: 4 drafts and 5 versions scanned, 0 unreadable, 0 repairs, 0 mismatches;
  - tenancy: 0 problems; the marker is present (store #1 converted); 2 sealed settings open; 2 stores.
- 0005 through the app's migrator (`runMigrations`, `drizzle/`): applied 1 of 6 in 655 ms. The boot tasks after it all
  succeeded, and a second migrator run was up to date.
- After 0005, the same dry run: the same result, 0 problems.
- Every row of the 13 seeded tables is unchanged over its R1.0 columns: users 4, stores 2, members 4, pages 4,
  versions 5, exports 1, orders 13, leads 5, stats 4, blocklist 1, store_settings 9, settings 2, audit 4.
- `orders.source` reads `enum('live','export','php','manual','api','storefront','whatsapp')`, and the `tick` cursor
  row exists.
- Read through the app's `getStoreSetting`, both stores' `store.confirmation` and `policies.contact` come back without
  `hours`, with every other field kept.
- The re-sealed turnstile secret and the CAPI token still open.
- The DB was dropped; `cod_test_*` left: 0.

**Contract audit:**

- 122 names were checked against the §K.2 P0 list. 121 exist under their frozen names, and every one of them appears
  in `src/lib/contracts/r1-p0.ts`. `Band` is the `NoveltyBand` re-export. The 122nd, `VariantFeatures`, is P6's
  registry type, not a P0 export.
- Every §K.2 / §K.3 extension file exists and is imported (`test:registries`: 17 registries).
- Every key of §A.3.1 (57 store keys), §A.3.3 (27 platform keys) and §A.4 (33 entitlement keys, 14 usage metrics and
  7 platform usage metrics) is in `src/lib/auth/permissions.ts` and `src/lib/tenancy/entitlement-keys.ts`.
- A scan of the five R1 part specs found no permission or entitlement key outside those lists, and none was added.
- Every R1 script name of §J is in `package.json`.
