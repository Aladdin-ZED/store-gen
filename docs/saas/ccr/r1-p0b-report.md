# P0b report: the shared needs of the eight R1 tracks

Date 2026-10-28 · branch `main` · contract: docs/STORE-SAAS.md core rev 6 (§K.2 "Step P0" and build note item 15,
§K.3) and the part specs. Read `docs/saas/ccr/p0-report.md` first: P0b builds on it and changes none of its frozen
landing contracts.

Commits: `a72a483` (A), `c2f2acf` (B), `5f3629a` (C), `491f5f7` (D), `23d99a3` (E), `3942b75` (F), `304d8f3` (G),
and step V (this report, the end-to-end verification and its fixes).

## Summary

Before the eight tracks start, their read-only planners listed 111 changes they need in files their track does not own
(`qa/r1-plans.json`, git-ignored). P0 also left 9 deferred or review items. Step T triaged all 120 against the tree,
the P0 report, core rev 6 and the part specs, and found one more need nobody listed (X-1).

| Decision | Track needs | P0 items | Found in triage |
|---|---|---|---|
| done (already in the tree at P0) | 14 | 1 (P0-9) | — |
| apply (in P0b, packages A-G) | 65 | — | 1 (X-1) |
| defer (to a named merge) | 29 | 7 | — |
| reject | 3 | 1 | — |
| owner | 0 | 0 | — |

The 66 apply items went into seven packages whose file sets do not overlap: **A** first (the ownership rows, the
script names, the `src/lib/contracts/**` maintainer glob and the tenancy-harness classification the others need),
then B, C, D, E, F and G, one commit each. Only E staged `src/landing/generated/**`; only A edited the spec, and its
spec sync records the shapes B-G implement, so the spec and the code agree.

Every frozen landing contract is as P0 left it: PageDoc v2, runtime config v2, payload v2, the PHP export, the chunk
budgets and `landing.sha256`. Packages E and F hashed every live, test and preview document, every legal page and
every export file (4,167 export files: 7 fixtures × ar/fr/en × 3 modes × 2 site setups) before and after: 0
differences. The asset `version` stays `b46315093004`. Tenancy lint is 0, and `test:ownership` (phase R1) is green.
`drizzle/0005_r1.sql` is still deployed nowhere; its one P0b change (`ai_jobs.kind` gains `'probe'`) passed
`test:migrate` (twice = no-op, interrupted re-run, R1.0-shaped DB with data).

Step V ran the whole gate on the finished tree, green on the first run, and made one maintainer change the triage
had left open (V-1: the console media route keeps its own sandbox CSP). Section 4 has the numbers.

## 1. Every need: decision, reason, where

"Where" names the file and the export. A deferred item names the merge whose integrator applies it (section 2).

### P1 CONSOLE

| Id | Decision | Reason | Where |
|---|---|---|---|
| P1-1 | apply (A) | Resolves the §J.1 vs PLA-§O.1 drift. | `package.json`: `test:platform` runs `src/lib/platform/selftest.ts`; `test:platform-db` (`scripts/qa/platform-check.ts`), `qa:platform-perf` (`--perf`, manual) and `qa:console-e2e` added, none chained; core §J.1-§J.3 synced. |
| P1-2 | apply (A) | `qa/` is git-ignored and an unowned new file fails `test:ownership`. | `scripts/qa/e2e/console.ts` in the §K.2 P1 row and PLA-§P.1; §J.3 row; PLA-§O.4 says which file holds which steps. |
| P1-3 | done | P0 step E. | `src/lib/health/types.ts` `HealthFlagCode` (`brand_term_live`, `brand_near_live`, `abuse_reports_new`), `HealthInputs` frozen, asserted in `src/lib/contracts/r1-p0.ts`. |
| P1-4 | apply (C) | Cross-track stub P1 needs from P2. | `src/components/admin/common/*.tsx`: the 21 PLA-§22.12 primitives with the exact props (`<Name>Props`), `ReactElement \| null`, minimal unstyled bodies; `issue-list.tsx` holds `IssueRow` and `IssueList`, `locked-control.tsx` exports `LockReason`. Skeleton and `useChords` are not frozen. |
| P1-5 | apply (E) | Cross-track stub P1 needs from P6 (PLA-§13.1). | `src/components/admin/brand/platform-design-fields.tsx` `PlatformDesignFields({ value, onSave })`, renders nothing. |
| P1-6 | apply (C) | Stubs P2 needs from P1 that P0 did not write. | `src/lib/platform/requests.ts` (server-only): `StoreRequestRow`, `ReviewCard`, `ReviewRequest` re-export; real reads `listStoreRequests`, `getReviewCard` (`whereStore`); `createStoreRequest`, `withdrawStoreRequest`, `submitForReview`, `answerReviewQuestion`, `submitAppeal` throw `not implemented: P1 <name>`. |
| P1-7 | apply (G) | The maintainer's harness. | `scripts/qa/headers-check.ts` and `edge-sim.ts`: console pulse, search, `stores.csv`, `audit.csv`, media, export and backup downloads, `/invite/staff/<t>`, `/report/<h>`; pending while the route file is absent, `--strict` fails pending. |
| P1-8 | defer → P1 | Pins are re-counted at the owning track's merge. | `scripts/qa/tenancy-allow.json` `src/lib/platform/**` pin. |
| P1-9 | apply (D) | One reveal shape for P1 and P4. | `src/lib/orders/profile.ts` `recordPlatformReveal` returns `{ e164, name, address, city, note } \| null` and is the single writer of `platform.pii.revealed` and `phone_revealed`; PLA-§7.4, OPE-§27.1 synced. |
| P1-10 | apply (A) | Spec line. | PLA-§N.1 / §N.2: `report.*` keys live in P1's `src/lib/i18n/admin/<l>/console.ts`, complete in ar, fr, en; `test:i18n-coverage` treats `report.` as R1-complete. |
| P1-11 | apply (E) | Stub P1 needs from P3, which merges later. | `src/lib/policies/fields.ts` `POLICY_TEMPLATE_FIELDS`, the scalar leaf paths of `PoliciesSetting` (no invented field). |
| P1-12 | apply (A) | Spec drift. | PLA-§3.7 lists every tenant-callable function of `src/lib/platform/**`; PLA-§6.3.1 `platformFlags(inputs, issues?)` (PD79). |
| P1-13 | done | Already in the unions. | `src/lib/audit.ts` `PlatformAction` / `StoreAction`. |

### P2 SHELL

| Id | Decision | Reason | Where |
|---|---|---|---|
| P2-1 | apply (A) | Missing names; chaining waits for the files. | `package.json` `test:shell`, `qa:shell-e2e` (not chained; `prebuild` unchanged); §J.1 / §J.3 record what joins each aggregate at each merge. |
| P2-2 | apply (A) | Budget group. | `scripts/qa/test-budget.json` platform group + `test:shell`, still 15 s. |
| P2-3 | apply (A) | R1.0 files with no R1 owner. | §K.2 P2 row and PLA-§P.2 (with `scripts/qa/tenancy-cases/shell.ts`, X-1); `ownership-check --owner` resolves each to P2. |
| P2-4 | done | P0 review G2. | `src/lib/platform/notify.ts` `Reader`, `NotificationItem`, `listNotifications`, `unreadCount`, `markRead`. |
| P2-5 | apply (C) | Same file as P1-6. | `src/lib/platform/requests.ts`. |
| P2-6 | apply (C) | Stub P2 needs from P1. | `src/lib/platform/legal.ts` `LegalDocSummary`, `pendingReacceptance` → `null` (no publisher before P1), `recordReacceptance` throws. |
| P2-7 | apply (C) | P1 stub. | `src/lib/platform/health-snapshot.ts` `unsnoozeHealthIssue(ctx, issueId)` throws. |
| P2-8 | apply (C) | Cross-track stub through `platformAction` (L9). | `src/app/admin/(console)/stores/[id]/actions.ts` `addImpersonationNoteAction` (`platformAction("stores.notes", …)`), classified a console platform action (X-1). |
| P2-9 | apply (E) | Stub P2 needs from P3 (PD61). | `src/components/admin/landing/address-slots.tsx` `TestOrderSlot({ pageId, live })`, `CampaignSlot()`, render nothing. |
| P2-10 | apply (E) | AI-§A.7 hook signatures. | `src/lib/ai/router/client.ts` `AiTaskState`, `useAiTask`, `useDeviceInfo`, `cancelStoreAiJobs`. Component mounts wait for P7 (P7-11). |
| P2-11 | apply (E) | One swap point. | `src/components/generate/reveal/directions.ts` `RevealInput`, `buildRevealDirections` (throws: no GenomeCard invented). |
| P2-12 | apply (D) | Paging needs SQL filters. | `src/lib/audit.ts` `listStoreAudit` opts `actorKind`, `from`, `to`, keyset kept. |
| P2-13 | defer → P2 | Maintainer CCR at the P2 merge. | Motion, aurora and physical-side fixes in the unowned admin files. |
| P2-14 | apply (G) | Harness cases. | `headers-check.ts`: `/api/app/<h>/pulse` (ETag, 304, neutral 404 for a non-member) and `/search`. |
| P2-15 | apply (G) | The catalog header planned this move at P0. | Keys moved without renames from `src/lib/auth/i18n/<l>.ts` to `src/lib/i18n/admin/<l>/{auth,team,shell,notify}.ts`, `en/console.ts` and the base catalogs (`error.*`); the `auth/i18n/<l>.ts` files are empty headers, `AuthMessageKey = MessageKey`. Merged catalogs deep-equal before and after (578 keys × 3 locales). |

### P3 LANDING

| Id | Decision | Reason | Where |
|---|---|---|---|
| P3-1 | apply (E) | Core §H.13, Q30. | `scripts/build-landing-assets.mjs` bundles `src/landing/runtime/addons/<AddonChunk>.ts` (with a `budgets.json` key) and `src/landing/addons/css/*.css`; `src/landing/generated/assets.ts` `addonChunks`, `addonCss` (both `{}`); `render-check` measures them. |
| P3-2 | apply (F) | Every render path calls P3's loader. | `src/landing/addons/load.server.ts` `AddonMode`, `loadRenderAddons` (→ no add-ons); `StoreRenderContext.thanksAddons`, `hasAddons()`; wired in `store-context.server.ts`, `publish.server.ts`, `test-render.server.ts`, `store-routes.server.ts`, `editor/preview.server.ts`, the preview route, `export/server.ts`, `export/bundle.ts`. Legal pages take no add-on. |
| P3-3 | apply (F) | No lead endpoint when capture is off. | `src/lib/landing/lead-capture.ts` `leadCaptureOn` (→ `true`, today's behaviour); `store-context.server.ts` endpoints. |
| P3-4 | defer → P3w1 | Widening `LEGAL_KINDS` now changes exports. | `LEGAL_KINDS`, `PageLinks`, sitemap. |
| P3-5 | defer → P3w1 | Needs functions that do not exist yet. | `check-context.server.ts`, `check-context.ts`. |
| P3-6 | apply (D) | The maintainer owns `public.ts`. | `src/lib/tenancy/public.ts` `resolveKitShare` (real, uncached, `cp_share_uq`); `PublicApi` gains `'wa'`; `test:tenancy-unit` rows. |
| P3-7 | apply (G) | Harness cases. | `headers-check.ts`: `/track`, `/go/<code>` (308 and the 410 page), `/kit/<token>`, an online test-render case. |
| P3-8 | apply (G) | Harness cases. | `scripts/qa/public-api-security.ts`: `POST /api/public/track`, `POST /api/public/wa`. |
| P3-9 | apply (A) | L4 entry with a fixed symbol. | `scripts/qa/tenancy-allow.json` `src/lib/links/clicks.ts` `__sgLinkClicks`; LAN-§12.1. |
| P3-10 | apply (A) | Scripts and budget. | `test:checklist` (36 checks, 2.6 s) chained into `npm test` after `test:prepublish`; `test:tracking` / `test:leads` left the landing budget group (DB-backed). |
| P3-11 | apply (F) | One origin builder for both gates. | `src/lib/render/origin.ts` `OriginClass`, `GenerationRecord`, `textFieldsOf`, `hash16`, `originFrom` (maintainer, §K.3); `src/lib/render/prepublish.ts` re-exports them and adds `generationRecordFor(scope, pageId)`. |
| P3-12 | done | `NavGroupId` already has `'settings'`. | `src/components/admin/shell/nav/types.ts`. |
| P3-13 | defer → P3w2 | P2 mounts the slots in its own files. | P2 dashboard and done step. |
| P3-14 | defer → P4 | P4's own action file. | `saveCallingWindowAction` → `enqueueRenders(scope, 'all-live', 'store_info')`. |

### P4 CALL CENTER

| Id | Decision | Reason | Where |
|---|---|---|---|
| P4-1 | done | P0 step D. | `src/lib/orders/hooks.ts` re-exports `Move`, `OrderSnapshot`, `TransitionSource`, `OrderActor`. |
| P4-2 | apply (D) | One shape with P5-2. | `src/lib/orders/transition.ts` `applyExternalStatus` src `agentLabel?: string` (≤ 60, OD54); `r1-p0.ts` entry updated. |
| P4-3 | done | P0 step D. | `src/lib/orders/contract.ts` statuses `refused`, `duplicate`, `unreachable`, `in_transit`, `lost`. |
| P4-4 | defer → P4 | The barrel drops `updateOrderStatus` once P4 no longer calls it. | `src/lib/orders` barrel. |
| P4-5 | apply (A) | Named e2e file. | `qa:ops-e2e`; `scripts/qa/e2e/ops.ts` in the §K.2 P4 row and OPE-§P. |
| P4-6 | done | P0 step C. | `test:state`, `test:ops`, `test:profit`, `test:queue`, `test:ops-db`; operations budget group. |
| P4-7 | done | P0 step A. | `schema.ts` and `0005_r1.sql` columns and indexes. |
| P4-8 | apply (D) | The sanctioned reveal write path (D71). | `src/lib/platform/seam.ts` `platformRevealScope(ctx, storeId): WriteScope` (`pii.reveal` + fresh step-up); `scripts/qa/tenancy-lint.ts` L6 kind `reveal-scope` allows it only in `src/lib/orders/profile.ts`, with a `//! L6` self-check line. |
| P4-9 | defer → P4 | `appendEvents` and `rev` are P4's. | `acceptUpsell` in `upsell.ts`. |
| P4-10 | defer → integration | P8 merges first. | P8's ZIP job rewired to P4's writers. |

### P5 INTEGRATIONS

| Id | Decision | Reason | Where |
|---|---|---|---|
| P5-1 | apply (D) | Additive outbox widening. | `src/lib/jobs/outbox.ts` `enqueue(scope, items, opts?: { tx?: Tx })`, `OUTBOX_BACKOFF_MS`, `isFinalFailure` (real), `OutboxHandler.paused?()`, `OutboxHandler.batch?`; the drainer contract documented on `drainOutbox`. |
| P5-2 | apply (D) | Same as P4-2. | `applyExternalStatus` `agentLabel`. |
| P5-3 | done | Already there. | `src/lib/orders/events.ts` `AppendOrderEventInput.note`, `actorKind` incl. `'sheet'`. |
| P5-4 | apply (A) | P5's check imports server-only modules. | `test:integrations-db` runs `node --conditions=react-server --import tsx`; `qa:integrations-e2e` added. |
| P5-5 | apply (A) | Named e2e file. | `scripts/qa/e2e/integrations.ts` in the §K.2 P5 row and OPE-§P. |
| P5-6 | apply (G) | Guarded test seams. | `src/lib/security/test-seams.ts` (maintainer, server-only) `TestSeam`, `TEST_SEAM_VARS`, `testSeam()`, `decideTestSeam()`; `SG_E2E`, `SG_E2E_MOCK_ORIGIN` inert unless `SG_E2E=1`, loopback http and a `cod_test_*` database, also in production; `qa:secrets` fails a Hostinger env file that sets them; §H.7. |
| P5-7 | apply (A) | Budget move. | `test:conversions` existing (90 → 85 s) → operations (15 → 20 s); total 235 of 240 s. |
| P5-8 | apply (C) | One fixture shape. | `src/lib/health/types.ts` `HealthRuleFile`, `HEALTH_RULE_PREFIXES`, `HealthRuleFixture`; every `rules/*.ts` exports `fixtures`; `src/lib/health/registry.ts` `HEALTH_RULE_FIXTURES`. |
| P5-9 | reject | `outbox` has `store_id`, so the lint already treats it as a tenant table. | — |
| P5-10 | defer → P5 | One owner per surface. | Delete `antispam-form.tsx`, `export-key-card.tsx`, `saveTurnstileAction` and their tenancy cases. |
| P5-11 | apply (F) | OD18, one rule. | `src/lib/orders/conversions-core.ts` `triggerFor(conversions, pageId)`; `purchaseInBrowserFor` uses it. |

### P6 DESIGN

| Id | Decision | Reason | Where |
|---|---|---|---|
| P6-1 | defer → P6 | Scripts exist; chaining waits for the files. | `test:design`, `test:registry`, `test:copylib` → `npm test`; `test:design:full` → `test:slow`; `test:design-db` → `test:db`. |
| P6-2 | apply (A) | `labels.json` must be committable. | `.gitignore`: `/qa/*`, `!/qa/design-corpus/`, `/qa/design-corpus/*`, `!/qa/design-corpus/labels.json`. |
| P6-3 | done | P0 G7. | `test-budget.json` design group (25 s). |
| P6-4 | apply (E) | DES-R5. | `src/landing/runtime/budgets.json` `css` 106677 (P 102581 on duo/ar + 4096), `css-base` 23607 (B 22071), `css-variants` 79778 (V 77013), measured 2026-10-28. |
| P6-5 | apply (E) | Drift visible in P6's worktree. | `scripts/qa/render-check.ts` css line (base, variants, page) failing per key. |
| P6-6 | apply (E) | DES-R11 swap point. | `src/lib/logo/favicon.ts` `brandIcon(ctx, theme)` (today's `faviconHref` body verbatim); `src/landing/document.tsx` calls it at its three sites. |
| P6-7 | done | P0 step E. | `PageLinks.report`, `storePageLinks(base, slug, report?)`, `footer.report`. |
| P6-8 | apply (F) | Draft design hook. | `src/lib/design/save.server.ts` `recordDraftDesign` (no-op); `src/lib/editor/pages.server.ts` `saveDraft` awaits it in warn mode. |
| P6-9 | defer → P6 | Stub rule. | `test:prepublish` C2 / C3 / F1 hard fixtures and the DES-§25.1 cases. |
| P6-10 | defer → P6 | Needs `npm install` (the lead's). | Seven `@fontsource` devDependencies, `woff2-sfnt.mjs`, the Arabic metrics step, `fonts.generated.ts`. |
| P6-11 | apply (A) | P2's `shell/**` glob would have claimed it. | `src/components/admin/shell/commands/design.ts` (P6), imported by `commands/index.ts`; P6 row and DES-§26. |
| P6-12 | defer → P3w1 | `orderForm/**` is P3's. | Submit button through `Cta`'s `hero` prop; V27 marker checked. |
| P6-13 | apply (C) | Same as P5-8. | `HealthRuleFixture`; `src/lib/health/rules/design.ts` exports `fixtures`. |
| P6-14 | defer → P2 | `i18n-coverage` is P2's file. | P2's required prefix list. |
| P6-15 | done | P8's P0 stub. | `PlatformHealth.design`. |
| P6-16 | defer → P8 | P8's file. | `src/lib/media/process.ts` cutout enqueue. |
| P6-17 | defer → P6 | P1 mounts the stub first. | `PlatformDesignFields` real body. |
| P6-18 | defer → P6 | No `store_id`, so no tenant table. | Design pin re-counted only if the lint reports more. |
| P6-19 | reject | Conditional, no evidence it is needed. | — |

### P7 AI

| Id | Decision | Reason | Where |
|---|---|---|---|
| P7-1 | apply (E) | DES-R20, AI-D26. | `src/lib/generator/overlay.ts` `PatchEntry.value` may be `undefined`; `applyPatch` skips it. |
| P7-2 | apply (B) | Before P7 step 6. | `src/lib/tenancy/entitlement-keys.ts` `USAGE_METRICS` + `ai_director_passes`, `ai_deep_passes` (16 metrics). |
| P7-3 | apply (B) | 0005 is not deployed. | `ai_jobs.kind` + `'probe'` (`schema.ts`, `0005_r1.sql`, `0005_snapshot.json`); `src/lib/ai/jobs/enqueue.ts` `AiJobKind` excludes it; `aiMemory.evidence` type + `screen`. |
| P7-4 | apply (A) | Decided and recorded. | §J.3: `qa:ai-stream` (stub provider, no key) joins `test:e2e` at the P7 merge, with the other P7 suites. |
| P7-5 | done | P0 G7. | `test-budget.json` ai group. |
| P7-6 | defer → P7 | P7's module. | `instrumentation.ts` boot call to `syncPromptVersions`. |
| P7-7 | defer → P7 | Pins at the merge. | `src/lib/ai/platform/**` pin. |
| P7-8 | apply (D) | Audit names. | `src/lib/audit.ts`: `platform.ai.{prompt_canaried, preference_recorded, calibration_recorded, screen_cleared, probe_recorded}`, `store.ai.memory_pinned`. |
| P7-9 | apply (G) | Shared seam guard. | `test-seams.ts`: `SG_AI_BASE_URL`, `SG_AI_NO_AFTER`, `SG_AI_HARNESS`; `qa:secrets`; §H.7. |
| P7-10 | defer → P7 | P1's navigation. | Console AI item (`/admin/ai`, `ai.platform`). |
| P7-11 | defer → P7 | Props frozen in P7's README only. | Mount `AiProviderChip`, `SuggestedFacts`, `ModelConsent`, `DirectorWhy`, `DirectorPassControl` in P2's slots. |
| P7-12 | reject | Operations R23 schedules it for R3. | — |
| P7-13 | defer → P7 | Replacement first. | Delete `ai-settings.tsx`, `saveAiAction` and their tenancy case. |

### P8 PLATFORM OPS

| Id | Decision | Reason | Where |
|---|---|---|---|
| P8-1 | defer → P8 | P8's modules. | Boot steps `runMediaStorageCheck`, `ensureOpsSamplers` (CCR r1-p8-1). |
| P8-2 | apply (F) | P8 merges first and needs the real function. | `src/lib/render/publish.server.ts` `rerenderInPlace(scope, pageId, { reason, actor })` (§H.3 / D50); `test:store` cases. |
| P8-3 | apply (D) | Backup parts (§H.6). | `src/lib/security/crypto.ts` `sealBytes`, `openBytes` (SGB2); `test:envelope` golden vector and cross-store refusal. |
| P8-4 | apply (A) | L4 entries with fixed symbols. | `tenancy-allow.json` `__sgErrorBuffer` (`jobs/errors.ts`), `__sgOpsMetrics` (`jobs/metrics.ts`), `__sgMediaBackend` (`media/storage/index.ts`). Pins wait for P8's merge. |
| P8-5 | defer → P8 | Files do not exist. | `test:jobs` → `npm test`, `test:storage` → `test:db`. |
| P8-6 | apply (B) | Core key. | `src/lib/settings/keys/platform_backup.ts` bounds daily 3-30, weekly 1-12, `purgeRequests`; `test:settings`. |
| P8-7 | defer → P8 | P8's modules. | `syncAssetRefs`, `assetUsage` wiring. |
| P8-8 | defer → P8 | P8's module. | `recordError` wiring (`logError`, action wrappers, seam and edge counters). |
| P8-9 | apply (D) | One redaction rule. | `src/lib/audit.ts` `AUDIT_SECRET_KEY_RE` exported unchanged. |
| P8-10 | defer → P8 | `purgePlan()` does not exist. | `test:migrate` case (e). |
| P8-11 | apply (A) | `getHealth().build` without `.git` (SEC-10). | `scripts/deploy/archive.mjs` writes and packs `qa/.build-sha` beside `qa/.gate-ok`. |
| P8-12 | apply (G) | Harness cases. | `headers-check.ts` `/api/app/<h>/exports/<jobId>/<part>`. |
| P8-13 | apply (D) | Stub P8 builds against. | `src/lib/orders/admin.ts` `deleteTestOrders(scope, { olderThan, limit })` → `{ deleted: 0 }`. |
| P8-14 | done | P0 step D. | `src/lib/jobs/registry.ts` imports `handlers/{capi,telegram}.ts`. |
| P8-15 | apply (B) | ENGC-12. | `src/lib/db/client.ts` `DB_POOL_SIZE` (2-20, default 6). |
| P8-16 | defer → P8 | P8's code. | HANDOFF.md restore drill, `DATA_DIR` marker, media fallback. |

### P0 deferred and review items, and the triage find

| Id | Decision | Reason | Where |
|---|---|---|---|
| P0-1 | defer → integration | Each track declares its keys first. | Narrow `MessageKey`, `NotificationKind` (build note item 13). |
| P0-2 | reject | The wordmark is an R2 field. | — |
| P0-3 | defer → P7 | P7's schemas. | Narrow `TaskIO`; update `r1-p0.ts`. |
| P0-4 | defer → P3w1 | Shows only with a real window (P3-5). | `check-facts.ts` with P4's `rangesForDay` / `isCallable`. |
| P0-5 | defer → integration | Read-only file. | `_productName` lint warning in `src/lib/orders/text.ts`. |
| P0-6 | defer → integration | Deploy step. | Re-render every live page (G9, §H.10). |
| P0-7 | defer → P8 | P8's tick runner. | `INSERT IGNORE` of the `tick` row, quoted cursor column (G5). |
| P0-8 | defer → integration | By design. | `qa:wow-demo` browser runner and P5-6's mock recorder. |
| P0-9 | done | Lead sign-off. | Build note item 5, commit `37f7e73`. |
| X-1 | apply (A) | Found in triage. | `scripts/qa/tenancy-cases/shell.ts` (P2's action cases, in `TENANCY_CASE_FILES`); `scripts/qa/tenancy-check.ts` classifies `"use server"` files under `src/app/admin/(console)/` as platform actions (each export must return `platformAction(`). |

### Choices where two tracks asked for different shapes

- **Agent label (P4-2, P5-2):** one optional `agentLabel` on the src argument of `applyExternalStatus`.
- **Reveal (P1-9, P4-8):** `recordPlatformReveal` returns `{ e164, name, address, city, note }` and is the only writer
  of the audit row and the order event, through `platformRevealScope`, which the lint allows only in
  `src/lib/orders/profile.ts`.
- **Outbox (P5-1):** the kill switch is a `paused?()` hook on the handler, not a new `SendResult` variant; merged
  Telegram sends use one optional `batch` object.
- **Origin map (P3-11):** a pure builder in `src/lib/render/origin.ts` plus the server loader `generationRecordFor` in
  `prepublish.ts`.
- **Identity catalog (P2-15):** keys moved without renaming.
- **Track e2e files:** each track has its own named e2e file and script.

## 2. THE DEFERRED LIST, by merge

Merge order: **P8, P2, P1, P5, P4, P3w1, P7, P6, P3w2, then the integration.** Each integrator reads its section. At
every merge, also: the track's suites join the `npm test`, `test:db` and `test:e2e` chains as core §J.1 / §J.3 list
them (build note item 2), the maintainer runs the timed `npm run test:budget`, and the track's pins in
`tenancy-allow.json` are re-counted from its report.

### P8 merge

- **P8-1** Boot steps `runMediaStorageCheck` and `ensureOpsSamplers` in `instrumentation.ts` (CCR r1-p8-1).
- **P8-5** Chain `test:jobs` (`src/lib/jobs/selftest.ts`) into `npm test` (core group) and `test:storage`
  (`scripts/qa/storage-check.ts`) into `test:db`.
- **P8-7** Wire `syncAssetRefs` / `assetUsage` into `pages.server.ts`, `publish.server.ts`, `settings/index.ts`,
  `assets.ts`.
- **P8-8** Wire `recordError` into `logError`, the action wrappers' failure branch and the seam and edge counters.
- **P8-10** Add `test:migrate` case (e) from `purgePlan()`.
- **P8-16** HANDOFF.md: the restore drill, the `DATA_DIR` marker and the media fallback, from `r1-p8-report.md`.
- **P6-16** Check that `src/lib/media/process.ts` enqueues the cutout (`RenderReason` `'cutout'` exists).
- **P0-7** Check the tick runner `INSERT IGNORE`s the `tick` row before the compare-and-set, cursor column quoted.
- **P8-4** Raise the `src/lib/jobs/**` and `src/lib/platform/**` pins to P8's counted report.
- `rerenderInPlace` (P8-2), `sealBytes` / `openBytes` (P8-3), `deleteTestOrders` stub (P8-13), `AUDIT_SECRET_KEY_RE`
  (P8-9) and `qa/.build-sha` (P8-11) already exist: P8 builds on them, it does not re-create them.

### P2 merge

- **P2-13** Maintainer CCR: the motion, aurora and physical-side fixes in the unowned admin files; P2's scanners
  (`test:admin-motion`, `test:admin-tokens`, `test:admin-rtl`) list the sites as PENDING and prove the fix.
- **P6-14** Check P2's `i18n-coverage` requires the `design.gate`, `slop`, `copy`, `novelty`, `health` prefixes and the
  reveal strings (vacuously complete until P6), and `report.` (P1-10).
- Chain `test:shell`, `test:pulse`, `test:admin-{tokens,motion,rtl}`, `test:i18n-coverage` into `npm test`;
  `qa:pulse-e2e`, `qa:admin-perf`, `qa:shell-e2e` into `test:e2e`; add `node scripts/build-app-icons.mjs` to `prebuild`
  after `build-admin-css.mjs`.
- `scripts/qa/tenancy-cases/shell.ts` must hold an attack case for every new store action (X-1).

### P1 merge

- **P1-8** Raise the `src/lib/platform/**` pin to `r1-p1-report.md`; `src/lib/health/**` stays 1.
- **V-1 (applied in step V, section 4)** Check that the `headers-check` console media row passes once P1's route
  exists (the proxy no longer puts the console header set on it).
- **P6-17 (first half)** P1 mounts the `PlatformDesignFields` stub on settings/general.
- **P7-10 (first half)** P1 ships the console AI item (`/admin/ai`, `ai.platform`) in its own navigation.
- Check `report.*` keys are complete in ar, fr, en (P1-10).
- Chain `test:platform`, `test:health` into `npm test`; `test:platform-db`, `test:health-db` into `test:db`;
  `qa:console-e2e` into `test:e2e`.

### P5 merge

- **P5-10** Delete `antispam-form.tsx`, `export-key-card.tsx`, `saveTurnstileAction` and their tenancy cases.
- Chain `test:integrations-db` into `test:db` and `qa:integrations-e2e` into `test:e2e`.

### P4 merge

- **P4-4** Drop `updateOrderStatus` from the orders barrel once P4's `orders/actions.ts` no longer calls it.
- **P4-9** `acceptUpsell`: bump `rev`, set `sheet_dirty |= 4`, write `field_edited`.
- **P3-14** Check `saveCallingWindowAction` calls `enqueueRenders(scope, 'all-live', 'store_info')` after a save.
- Chain `qa:ops-e2e` into `test:e2e` (P4's offline suites as §J.1 lists them).

### P3 wave 1 merge

- **P3-4** Widen `LEGAL_KINDS` with `returns`, the `PageLinks` legal link and the sitemap, with P3's returns texts;
  record the deliberate golden and export change (until then P3 keys its returns text under a local type).
- **P3-5** Wire `check-context.server.ts` and `check-context.ts`; re-export `CityKey` and `NumberClass`.
- **P0-4** Rewrite `check-facts.ts` with P4's real `rangesForDay` and `isCallable` (cross-midnight ranges).
- **P6-12** Check V27's marker: the order-form submit renders through `Cta`'s `hero` prop.
- Chain `test:tracking` and `test:leads` (wave 1 cases) into `test:db`.

### P7 merge

- **P7-6** Boot call to `syncPromptVersions` in `instrumentation.ts`.
- **P7-7** Count the `src/lib/ai/platform/**` pin from `r1-p7-report.md`.
- **P7-10 (second half)** Check `/admin/ai` is reachable.
- **P7-11** Mount `AiProviderChip`, `SuggestedFacts`, `ModelConsent`, `DirectorWhy`, `DirectorPassControl` in P2's
  onboarding and reveal slots from P7's README.
- **P7-13** Delete `ai-settings.tsx`, `saveAiAction` and their tenancy case.
- **P0-3** Narrow `TaskIO`'s AI task inputs and outputs; update the `r1-p0.ts` entries.
- Chain `test:ai` into `npm test`; `test:ai-eval`, `test:ai:slow` into `test:slow`; `test:ai-db` into `test:db`;
  `qa:wizard-e2e`, `qa:ai-stream` into `test:e2e`.

### P6 merge

- **P6-10 (lead, before the merge)** Install the seven `@fontsource` devDependencies. Agents cannot run
  `npm install`. Then the integrator lands `woff2-sfnt.mjs`, the Arabic metrics step and the regenerated
  `fonts.generated.ts`.
- **P6-1** Chain `test:design`, `test:registry`, `test:copylib` into `npm test`; `test:design:full` into `test:slow`
  (keeping `test:prepublish --slow`); `test:design-db` into `test:db`.
- **P6-9** `test:prepublish` enables the C2, C3, F1 hard fixtures and the DES-§25.1 design cases.
- **P6-17 (second half)** P6's real field group replaces the `PlatformDesignFields` stub (`platform.settings`,
  `platform.design.changed`).
- **P6-18** Re-count the design pin only if the lint reports more.
- From this merge `HEIGHT_MODEL_VERSION` > 0: `SG_STUB_BUILD_OK` is no longer needed and every budget row is hard.

### P3 wave 2 merge

- **P3-13** Verify P2's `TestOrderSlot` / `CampaignSlot` mounts render P3's real buttons; add the two-line slots prop
  if P2 did not.
- Chain `test:leads`' LP-11 cases.

### Integration

- **P4-10** Rewire P8's ZIP job to P4's writers.
- **P0-1** Narrow `MessageKey` and `NotificationKind` to strict unions.
- **P0-5** Remove the `_productName` lint warning (dead-code pass).
- **P0-6** Re-render every live page at the integration deploy (`forEachStore` → `enqueueRenders(scope, 'all-live',
  'runtime', 5)`).
- **P0-8** Write the `qa:wow-demo` browser runner with P5-6's mock recorder (the test order reaches none of Sheets or
  CAPI; Telegram only `[TEST]` with the switch).
- Re-run `qa:headers`, `qa:edge-sim` and `qa:public-api` with **`--strict`**, supplying the inputs G names
  (`QA_HEADERS_MEMBER_COOKIE`, `_OUTSIDER_COOKIE`, `_STAFF_COOKIE`, `_TEST_TOKEN`, `_KIT_TOKEN`, `_EXPORT_PATH`,
  `_EXPORT_EXPIRED_PATH`, `_EXPORT_FOREIGN_PATH`, `_CONSOLE_EXPORT_PATH` from the environment, never printed;
  `--store-id`, `--backup-day`, `--go-paused`, `--media` as arguments).

## 3. The owner list

Empty. No need required an owner decision: every conflict had a reading in core rev 6 or a part spec that settled it.
The only lead action is P6-10's `npm install` before the P6 merge (section 2), which is a chore, not a decision.

## 4. Step V: verification and fixes

### The gate, run 1 (commit `304d8f3`, packages A-G)

`SG_STUB_BUILD_OK=1 npm run gate` through the mutex: **exit 0, green on the first run, no fix needed.**

| Step | Result |
|---|---|
| `typecheck` | pass (`tsc --noEmit`, the three `r1-p0b-*.ts` contracts included) |
| `lint` | 0 errors, 1 warning: `_productName` in `src/lib/orders/text.ts` (read-only; P0-5, integration) |
| `npm test` | pass: runtime 208, generator, render, money parity, conversions 108, offers 1,219, orders 138, settings 512, `test:registries` (17 registries), `test:prepublish` 12, `test:checklist` 36, `test:ownership` (phase R1, 219 new files, all owned), `test:tenancy-lint` **0 violations** (55 tenant tables, 19 self-check fixtures) |
| `test:budget-static` | R1 declares 235 s of 240 s (7 groups); table consistent |
| `test:slow` | theme `--full`; `test:prepublish --slow` 13 (the stub-lock child-process proof included) |
| `test:db` | `test:migrate` 217 (0005 twice = no-op, interrupted re-run, R1.0 data), `test:tenancy` 6,570 passed / 0 failed / 0 pending, `qa:action-replay` 4,129, `test:store` (incl. `rerenderInPlace` and `generationRecordFor`), `test:pixels-publish` 60, `test:public-api` (4 cases pending: `/api/public/track`, `/api/public/wa`, routes not built), `test:php` |
| `build` | stub-lock warning printed (`SG_STUB_BUILD_OK=1`), `gate:offline` green, landing assets `b46315093004` unchanged, compiled in 35 s |
| `test:e2e` | `qa:headers` 677 passed, 24 pending (routes not built); `qa:edge-sim` 145 passed, 1 pending; `qa:r1-exit` 73 (port 3451, its throwaway DB dropped) |
| `qa:secrets` | 62 checks; test seams: 2 Hostinger env files read, 0 findings |
| `gate-ok` | `qa/.gate-ok` = `{"sha":"304d8f3…","at":"2026-10-28T04:23:31Z","stubBuild":true}` |

Expected notes, not failures: the four pre-registered L4 allow entries (`__sgLinkClicks`, `__sgErrorBuffer`,
`__sgOpsMetrics`, `__sgMediaBackend`) print "unused allow entry" until P3 and P8 write those files; the three
runtime-chunk warnings (`thanks` 6670/6650, `pixels` 3966/3900, `whatsapp` 5823/5800 B) are R1.0's, recorded in
`r1.0-deploy-checklist.md`, and unchanged by P0b (the asset version is the same).

### The stub-build lock

- `qa/.gate-ok` carries `"stubBuild": true` (written by `scripts/qa/gate-ok.ts` from `heightModelIsStub()`).
- Dry check on a clean tree (only `docs/saas/PROGRESS.md` dirty): `node scripts/deploy/archive.mjs <scratch>/dry-archive.zip`
  exits 1 with "qa/.gate-ok says stubBuild: true … never archived or deployed (STUB-BUILD LOCK)". No zip and no
  `qa/.build-sha` were written: the refusal comes before step 5 of the script.

### Ownership

`npx tsx scripts/qa/ownership-check.ts --phase R1`: 95 rows, 1,341 patterns, 1,674 files (219 new) and 850 pattern
witnesses; **0 findings** ("no file has two owners in R1; every new file has an owner"). This report is claimed in the
§K.3 maintainer list.

### V-1: the console media route keeps its sandbox CSP (maintainer change, applied in step V)

Package G found that `GET /api/admin/stores/<id>/media/<key>` (P1's route, PLA-§M.2) could never get its sandbox CSP:
the proxy put the console header set, nonce CSP included, on every `/api/admin/**` path, and a header the proxy sets
wins over the handler's. The row was pending and would have failed the moment P1 built the route. `src/proxy.ts` and
`src/lib/edge/**` are the maintainer's (§K.3), so the fix went in now rather than at the P1 merge:

- `src/lib/edge/areas.ts` `isConsoleMediaPath(pathname)` (normalised, exactly `/api/admin/stores/<id>/media/<key>`).
- `src/proxy.ts` `consoleArea`: behind the same gate, a GET/HEAD of that path is passed with the session and without
  the console header set, like the dashboard manifest. Any other method keeps the console headers; without the gate it
  is still the neutral 404; the gate cookie still slides.
- `test:hosts` (`src/lib/edge/selftest.ts`): the helper's table and five proxy cases (gated read passes with no
  console CSP or Cache-Control, the session reaches the handler without a nonce, ungated is neutral, a POST keeps the
  console headers). 626 checks passed.
- Proof of the harness row: with a placeholder route file in place, `qa:headers` passed 685 checks with 22 pending
  (the media row's 8 checks now pass in both host modes); the placeholder and its folders were removed.
- Spec sync: core §C.3 platform row, the §K.2 build note item 15, PLA-§M.2's route row; the `headers-check.ts` comment.

### The gate, run 2 (after V-1)

Recorded by the commit that follows this one (the gate runs on the commit that carries V-1).


## 5. What each track should know

**P1 CONSOLE.** Import the PLA-§22.12 primitives from `src/components/admin/common/` (P2's; the props are frozen in
`src/lib/contracts/r1-p0b-platform.ts`, the bodies are P2's). You own `src/lib/platform/requests.ts` and `legal.ts`:
the reads (`listStoreRequests`, `getReviewCard`) are real, the writes throw `not implemented: P1 …`, and
`pendingReacceptance` answers `null` until your publisher exists. `unsnoozeHealthIssue` and
`addImpersonationNoteAction` (in `src/app/admin/(console)/stores/[id]/actions.ts`, classified a platform action) are
yours to fill. Mount `PlatformDesignFields` (P6's stub) and `POLICY_TEMPLATE_FIELDS` (P3's list). `revealOrderPiiAction`
calls P4's `recordPlatformReveal` and writes no audit itself. Your row gained `scripts/qa/e2e/console.ts`; scripts:
`test:platform` (now `src/lib/platform/selftest.ts`), `test:platform-db`, `qa:platform-perf` (manual), `qa:console-e2e`.
Keep `report.*` keys in your `console.ts`, complete in three locales. `headers-check` already holds your route cases
(pending until the route files exist); the console media route keeps its own sandbox CSP because the proxy no longer
puts console headers on it (V-1).

**P2 SHELL.** Fill the 21 primitive bodies in `src/components/admin/common/` without changing their props; skeleton and
`useChords` are yours to shape. Build against P1's `requests.ts`, `legal.ts`, `notify.ts`, `unsnoozeHealthIssue`,
P3's `TestOrderSlot` / `CampaignSlot`, P6's `buildRevealDirections` (throws: treat as unavailable) and P7's
`useAiTask` / `useDeviceInfo` / `cancelStoreAiJobs`. `listStoreAudit` filters `actorKind`, `from`, `to`. The identity
catalog keys now live in your `src/lib/i18n/admin/<l>/{auth,team,shell}.ts` (and `notify.ts`'s team and member kinds),
unrenamed. Your row gained the R1.0 shell files (PLA-§P.2), `admin.css` with `styles/**`, and
`scripts/qa/tenancy-cases/shell.ts`, where every new store action needs its attack case or `test:tenancy` fails at your
merge. Scripts: `test:shell`, `qa:shell-e2e` (plus the P0 ones); budget: platform group, your suites ≤ 8 s.

**P3 LANDING.** Fill `loadRenderAddons` (`src/landing/addons/load.server.ts`), `leadCaptureOn`
(`src/lib/landing/lead-capture.ts`), `TestOrderSlot` / `CampaignSlot` (`address-slots.tsx`) and extend
`POLICY_TEMPLATE_FIELDS` (never rename an entry). Add-on chunks are `src/landing/runtime/addons/<AddonChunk>.ts` with a
`budgets.json` key; add-on CSS is `src/landing/addons/css/*.css`; both are built into `addonChunks` / `addonCss` and
measured by `render-check`. `resolveKitShare` and the `wa` public API are real; use `__sgLinkClicks` exactly in
`src/lib/links/clicks.ts`. The origin builder is the maintainer's `src/lib/render/origin.ts`. `test:checklist` is in
`npm test`; `test:tracking` / `test:leads` join `test:db` at your merges. Header and public-API cases for `/track`,
`/go`, `/kit`, `/api/public/track`, `/api/public/wa` are pending until your routes exist. `returns` legal kind waits for
the wave 1 merge (key it locally).

**P4 CALL CENTER.** `applyExternalStatus` takes `agentLabel?` (P5 calls the stub first). `recordPlatformReveal`
returns `{ e164, name, address, city, note } | null` and is the single writer of both the audit row and
`phone_revealed`, through `platformRevealScope` (lint L6 allows it only in `profile.ts`). Fill `deleteTestOrders`
(P8 builds against it). Your row gained `scripts/qa/e2e/ops.ts`; script `qa:ops-e2e`. `saveCallingWindowAction`
must re-render all live pages (P3-14), and `acceptUpsell` changes at your merge (P4-9).

**P5 INTEGRATIONS.** The outbox has `enqueue(…, { tx })`, `OUTBOX_BACKOFF_MS`, a real `isFinalFailure`, and handler
hooks `paused?()` (the `capi_enabled` kill switch) and `batch?` (merged Telegram sends). `triggerFor` is in your
`conversions-core.ts` with today's rule; refine that one implementation. Health rules use the `int:` and `conv:`
prefixes and export `fixtures` as `HealthRuleFixture[]`. E2E mocks go through `testSeam("e2e-mocks")` only. Your row
gained `scripts/qa/e2e/integrations.ts`; `test:integrations-db` runs with `--conditions=react-server`;
`qa:integrations-e2e` exists; `test:conversions` is in the operations budget group.

**P6 DESIGN.** Fill `brandIcon` (`src/lib/logo/favicon.ts`), `PlatformDesignFields`, `buildRevealDirections` and
`recordDraftDesign` (`src/lib/design/save.server.ts`, warn mode). `PatchEntry.value` may be `undefined`. The css
budget is `css` / `css-base` / `css-variants` in `budgets.json`, printed by `render-check`. Your commands file is
`src/components/admin/shell/commands/design.ts`; `qa/design-corpus/labels.json` is committable. Design health
fixtures go in `rules/design.ts`. Before your merge the lead installs the `@fontsource` packages.

**P7 AI.** `src/lib/ai/router/client.ts` holds the frozen `useAiTask` / `useDeviceInfo` / `cancelStoreAiJobs` stubs;
fill them. `ai_jobs.kind` has `'probe'` (excluded from `AiJobKind`), `ai_memory.evidence` has `screen`, and
`USAGE_METRICS` has `ai_director_passes` and `ai_deep_passes`. The audit unions have your six names. Test seams
`ai-base-url`, `ai-no-after`, `ai-harness` go through `testSeam()`; `qa:ai-stream` joins `test:e2e` at your merge.
`upsertCallScriptDraft` is R3 (P7-12 rejected).

**P8 PLATFORM OPS.** `rerenderInPlace` is real in `publish.server.ts`; `sealBytes` / `openBytes` are in
`crypto.ts`; `AUDIT_SECRET_KEY_RE` is exported from `audit.ts`; `deleteTestOrders` is P4's stub; `platform_backup`
has PLA-§17 bounds and `purgeRequests`; `DB_POOL_SIZE` is read; the archive ships `qa/.build-sha`. Use
`__sgErrorBuffer`, `__sgOpsMetrics`, `__sgMediaBackend` exactly. The export download route's header cases are pending
until your route exists. Your merge is first.
