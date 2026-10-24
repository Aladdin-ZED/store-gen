# C0a report: R1.0 "core tenancy" contract step

Date 2026-10-24 · branch `main` · nothing committed (the lead commits after review) · contract: docs/STORE-SAAS.md rev 5
§K.1 (rows marked (a)), with the maintainer build note of 2026-10-24 recorded in §K.1.

## Summary

C0a is complete and all four exit criteria pass. Each check below was re-run on the final tree:

- `tsc` is green.
- Today's `npm test` is green, and `test:php` too.
- `drizzle/0004` applies to an empty `cod_test_c0a_smoke` database: 5 of 5 migrations on the first run, a no-op on the second.
- `/app/<h>` renders through the minimal seam over real HTTP on `next dev -p 3451`:
  - a member gets 200;
  - a non-member, platform staff without a membership, and another store's owner on this handle each get 404;
  - another store's handle gets 404, and so does an unknown handle.

The A4 review found one contract gap and fixed it: `SessionUser` now has the three §E.1 fields. It found no wrong names
or signatures against §E or §K and no missing (a) rows. The exit smoke is now the committed script
`scripts/qa/c0a-smoke.ts`, so it can be re-run.

| C0a exit criterion (§K.1) | Result |
|---|---|
| 1. `npx tsc --noEmit -p .` green; today's callers compile. There is no `rateLimit` overload, because the `Bucket` builders are C0b, and today's string callers are unchanged. | **PASS** |
| 2. Today's `npm test` green | **PASS** |
| 3. `drizzle/0004` on an empty `cod_test_c0a_*` DB, then a second run that is a no-op | **PASS** |
| 4. One page under `/app/<h>` renders through the minimal seam on XAMPP. Member 200; non-member and other store's handle 404. The 3451 server is stopped and the DB dropped. | **PASS** |

## 1. What C0a delivers (§K.1 (a) rows → files)

| §K.1 row | Files | State |
|---|---|---|
| types (§E.1, D71) | `src/lib/tenancy/types.ts` | complete: `StoreScope`, `WriteScope` / `ReadScope`, `StoreRow`, `StoreCtx<S>`, `WritePermission`, `WriteCtx`, `UserCtx`, `PlatformCtx`, `SystemCtx`, `PublicTarget`, `GateItem`, `ActionErrorCode` (with its open tail), `ActionResult` |
| permissions (§A.3) | `src/lib/auth/permissions.ts` | implemented: the full matrix including the R2 / R3 keys; `orders.export` granted to `manager`; `can`, `canPlatform`, `invitableRoles`, `canManageMember`, `STEP_UP_PERMISSIONS`, `releaseOn`, `stateAllows`; the legacy API kept as `legacyCan` |
| mode, entitlement keys (§A.2, §A.4) | `src/lib/tenancy/{mode,entitlement-keys}.ts` | implemented, including the rev 3 metrics and the 7 platform usage metrics |
| sql, cache, locks (§E.3, §E.6, §E.7) | `src/lib/tenancy/{sql,cache}.ts`, `src/lib/db/locks.ts` | implemented: a lock pool of 2 connections; waiting for a connection counts against `timeoutSec`. The rate `Bucket` builders are C0b. |
| hosts, areas, URL builders (§C.2, §C.3 step 1, §C.6) | `src/lib/edge/{host,areas,env}.ts`, `src/lib/urls/index.ts` | implemented (pure) |
| seam (§E.2) | `src/lib/tenancy/seam.ts`, `src/lib/platform/seam.ts`, `src/lib/jobs/scope.ts` | the **minimal working seam**; T2 hardens it and T1 completes `forEachStore` |
| public resolvers (§E.2) | `src/lib/tenancy/public.ts` | signatures fixed; `publicScope`, `resolveStoreByHandle` and `getStoreById` work (uncached reads); T3 writes the rest |
| schema (§D.2, §D.4) | `src/lib/db/schema.ts` | every 0004 change and every §D.4 table, including `page_slug_history`, `preview_tokens`, `is_test`, `store_usage.period varchar(10)` and `pages.first_published_at` |
| migration (§D.8) | `drizzle/0004_tenancy.sql`, `drizzle/meta/0004_snapshot.json`, `drizzle/meta/_journal.json` | the SQL is complete: 347 guarded, idempotent statements; the store #1 conversion is in SQL; the JS conversion task is T1's |
| settings (§D.10) | `src/lib/settings/{store-registry,platform-registry,fields}.ts`, `src/lib/settings/keys/*.ts` | every R1 key with its first schema |
| extension skeletons (C0a by the maintainer build note) | `src/components/admin/shell/{nav,commands}/{types,index}.ts`, `src/lib/jobs/{registry,runner}.ts`, `src/lib/jobs/tracks/*.ts`, `src/lib/i18n/admin/{index,en,fr,ar}.ts` (+ `client.tsx`), `src/lib/orders/hooks.ts`, `src/lib/render/prepublish.ts`, `src/lib/pulse/{types,registry}.ts`, `src/lib/notify/registry.ts`, `src/lib/flags/registry.ts`, `src/lib/health/{types,registry}.ts`, `src/lib/admin-data/search/types.ts`, `src/landing/addons/types.ts` | shapes frozen; registries empty |
| cross-track signatures | see §3 | typed stubs that compile; the old functions keep working |
| `package.json` scripts (C0a by the maintainer build note) | `package.json` | the 26 R1.0 script entries. None is in `npm test` or `prebuild`; `gate:offline` joins `prebuild` at the R1.0 integration (SEC-10) |
| PageDoc v2: the one additive change | `src/lib/page/schema.ts` | the 8 DES-§4.1 constants, a strict `ThemeLook`, and `look: ThemeLook.optional()` with no default. The published-checksum boot logic shows 0 changed checksums. |
| exit smoke (A4) | `scripts/qa/c0a-smoke.ts`, `src/app/app/[store]/page.tsx` (placeholder; T4 owns the folder after the merge) | committed and re-runnable: `npx tsx scripts/qa/c0a-smoke.ts` |
| CCR folder | `docs/saas/ccr/README.md`, this report | |

Other changed files, each keeping old behaviour:

- `src/proxy.ts`: signed request path.
- `src/lib/auth/{index,users,session}.ts`.
- `src/lib/audit.ts`.
- `src/lib/settings/{index,schemas}.ts`.
- `src/lib/security/crypto.ts`.
- `src/lib/stats/index.ts`, `src/lib/render/publish.server.ts`, `src/lib/orders/create.ts`.
- `src/lib/admin-data/{pages,dashboard}.ts`.
- `src/lib/editor/checklist.ts` and the new `check-context.ts`.
- `src/components/admin/shell/{nav.ts,command-palette-body.tsx}` and `src/lib/pixels/library.server.ts`: one import line each.
- `scripts/qa/pixels-publish-check.ts`: its `SessionUser` literal gains the new fields.
- `docs/STORE-SAAS.md`: the maintainer build note.

## 2. Maintainer build decisions (recorded in §K.1, 2026-10-24)

1. C0a, not C0b, does the "extension skeletons" row and every R1.0 `package.json` script entry. No track touches
   `package.json` or a shared skeleton.
2. Every frozen cross-track signature is a **typed stub that compiles**. A stub throws `not implemented: <track>` or
   returns the documented safe default. When a stub sits in an existing file that has a working function with another
   signature, the old function keeps working for its callers, through a deprecated overload or an adapter.
3. The minimal working seam is real, not a stub: session, handle, membership, the read-only guard, `storeAction`,
   `storeGuard`, `platformScope`, `publicScope` and `systemScope`.

## 3. Stub list (file → function → implementing track)

"throws" means `throw new Error("not implemented: <track> (<fn>)")`.

| File | Function(s) | Track | C0a behaviour |
|---|---|---|---|
| `src/lib/settings/index.ts` | `getStoreSetting`, `getStoreSettings`, `setStoreSetting`, `updateStoreSetting`, `getPlatformSetting`, `setPlatformSetting` | T1 | throws; today's `getSetting` / `setSetting` / `updateSetting` still work |
| `src/lib/settings/index.ts` | `invalidateStoreSettings` | T1 | no-op (nothing is cached yet) |
| `src/lib/audit.ts` | `listStoreAudit`, `listPlatformAudit` | T1 | throws. `audit({ scope })` and `auditFrom(ctx, …)` **work** and write `store_id`, `actor_kind` and `impersonator_id`. |
| `src/lib/tenancy/entitlements.ts` | `entitlement`, `entitlements`, `assertFeature`, `assertWithin`, `applyStateCap`, `activeKillSwitches` | T1 | throws. A seam call with `feature:` therefore answers `server` until T1. |
| `src/lib/tenancy/entitlements.ts` | `invalidateEntitlements`, `invalidateFlags` | T1 | no-op |
| `src/lib/tenancy/usage.ts` | `chargeUsage`, `refundUsage`, `chargePlatformUsage`, `refundPlatformUsage` | T1 | throws |
| `src/lib/tenancy/lifecycle.ts` | `transitionStore` | T1 | throws |
| `src/lib/tenancy/handles.ts` | `handleProblem`, `checkHandleAvailable`, `renameHandle` | T1 | throws. `isHandle`, `HANDLE_RE` and `RESERVED_HANDLES` work. |
| `src/lib/security/crypto.ts` | `seal`, `open`, `hmacBytes` | T1 | throws. `openLegacy` works (it calls `decrypt`). |
| `src/lib/jobs/scope.ts` | `forEachStore` | T1 | throws. `systemCtx` and `systemScope` work. |
| `src/lib/auth/index.ts` | `userAction`, `stepUpAction`, `stepUpWithPasswordAction`, `deleteUserAccount`, `publicAction` | T2 | throws |
| `src/lib/auth/users.ts` | `banUser`, `unbanUser`, `createPasswordResetLink`, `createAccount`, `resetUserTwoFactor(ctx: PlatformCtx, …)` | T2 | throws. The legacy `resetUserTwoFactor(actor, userId)` overload works. |
| `src/lib/auth/session.ts` | `revokeUserSessions(userId, { exceptSessionId })` | T2 | works (an adapter; `exceptId` is still accepted) |
| `src/lib/auth/landing.ts` | `landingPathFor`, `listMemberships` | T2 | throws |
| `src/lib/tenancy/invites.ts` | `createInvite`, `revokeInvite`, `listInvites`, `previewInvite`, `acceptInvite`, `leaveStore`, `listMembersByScope`, `listInvitesByScope` | T2 | throws |
| `src/lib/tenancy/owned.ts` | `assertOwned` | T2 | throws |
| `src/lib/platform/impersonation.ts` | `startImpersonation`, `endImpersonation` | T2 | throws |
| `src/lib/platform/notify.ts` | `notify` | T2 (R1.0 insert), P1 (full API) | answers `{ deduped: true }` and logs one warning per process |
| `src/lib/mail/index.ts` | `mailer` | T2 / R2 | `{ enabled: false }`, which is the R1 design, not a stub |
| `src/lib/tenancy/seam.ts`, `src/lib/platform/seam.ts`, `src/lib/tenancy/context.ts` | seam hardening | T2 | the minimal bodies work (see §5) |
| `src/lib/tenancy/public.ts` | `resolvePublicTarget`, `resolveOrderForTracking`, `resolveKitShare` | T3 | throws |
| `src/lib/tenancy/public.ts` | `resolveTestToken` | T3 | `{ test: false }`: an unverifiable token never marks an order |
| `src/lib/tenancy/public.ts` | `resolveStoreByHandle`, `getStoreById` | T3 | work as uncached reads; T3 adds the 15 s caches and the handle-history lookup |
| `src/lib/stats/index.ts` | `recordEvent(scope, …)`, `bumpOrderStats(scope, …)`, `getPageStats(scope, …)` | T3 | the scoped overloads throw; the single-tenant forms work |
| `src/lib/render/publish.server.ts` | `publishPage(scope, …)`, `renderAndCommit(scope, …)`, `unpublishPage(scope, …)` | T3 | the scoped forms throw; the single-tenant forms work |
| `src/lib/orders/create.ts` | `createOrderRow(draft, ctx)` | T3 | throws |
| `src/lib/render/preview-token.ts` | `mintPreviewToken`, `revokePreviewToken` | T3 | throws |
| `src/landing/addons/types.ts` | `RenderAddons`, `RenderHookFields`, `noAddons()` | T3 wires, P3 owns | types plus the empty default |
| `src/lib/admin-data/pages.ts` | `listPagesForConsole(scope)` | T4 | throws |
| `src/lib/editor/checklist.ts` | `buildChecklist(doc, ctx: LandingCheckContext)` | T4 / P3 | works: delegates to today's checks; the store-fact rules come later |
| `src/lib/platform/signup-risk.ts` | `scoreSignup` | P1 | the fixed `review` band (PLA Q.9) |
| `src/lib/platform/mask.ts` | `maskIfImpersonation`, `maskCustomerFields` | P1 | **real masking** under an impersonation scope, identity otherwise (deviation 3) |
| `src/lib/platform/brand-check.ts` | `checkBrandTerms` | P1 | `"ok"` |
| `src/lib/platform/health-snapshot.ts` | `markHealthDirty` | P1 | no-op |
| `src/lib/jobs/runner.ts` | `runTick` | P8 | throws; the cron route keeps today's steps |

Registries that are frozen and empty until P0 pre-writes the track import lines:

- `NAV_CONTRIBUTIONS`, `COMMANDS`
- `JOBS` (the 7 track files)
- `ORDER_HOOKS`, `PULSE_CONTRIBUTORS`, `NOTIFICATION_KINDS`, `FLAG_DEFS`, `HEALTH_RULES`
- the pre-publish checks and listeners

## 4. Changes made in A4 (review fixes)

1. **`SessionUser` gains `platformRole`, `locale` and `lastStoreId`** (§E.1, part of C0a's types row). This was
   missing from A1-A3.
   - `validateSessionToken` now selects `users.platform_role`, `users.locale` and `sessions.last_store_id`.
     `ValidSession` carries the three fields; `locale` is narrowed to ar/fr/en, else null.
   - The seam's test-identity path fills them in.
   - `role` stays, marked `@deprecated`. Removing it would break today's /admin, so T2 removes it once its last
     callers have moved.
   - One QA literal (`scripts/qa/pixels-publish-check.ts`) gains the fields.
2. **`scripts/qa/c0a-smoke.ts`** (new) is the committed, re-runnable exit check for criteria 3 and 4:
   - it creates the DB, migrates twice and seeds by SQL;
   - it runs its own `next dev` on 3451 and probes 8 cases;
   - it stops only its own process tree, restores `next-env.d.ts` and drops the DB.
3. Nothing else needed a fix. Re-reading the A1-A3 files against §A.2-§A.4, §B, §C.2/§C.3/§C.6, §D.10, §E.1-§E.8,
   §F.3, §F.5, §H.2, §H.13, §I.3-§I.5, §I.7, §M.1, OPE-§3.6, PLA-§18.1 and PLA Q.19 found no wrong names or
   signatures and no missing (a) rows.

## 5. Deviations from the letter of the spec (kept, with reasons)

1. **The old permission check is renamed `legacyCan`.** `@/lib/auth` still exports it as `can` until T2 / T4 move its
   callers. The new `can(StoreRole, StorePermission)` would otherwise change today's /admin behaviour.
   - Trap for tracks: new code imports `can` from `@/lib/auth/permissions`, never from `@/lib/auth`.
2. **The signed request path is in the proxy now** (`x-sg-path`, `x-sg-rid`, `x-sg-path-sig`).
   - This is §C.3 step 2, which is T3's. Without it, every converted `storeAction` would answer `not_found` until T3
     merges.
   - Without a usable APP_SECRET it fails closed.
   - `error_events` `path_unsigned` is not written yet (T2 / T3).
3. **`maskIfImpersonation` masks for real.** §K.1 says "identity until P1", but the R1.0 exit attack suite needs masked
   canaries before P1 exists. Every other scope gets the identity.
4. **`ActionResult` failures may carry `jobId`.** `job_queued` must return the `ai_jobs` id (§H.12).
   **`GateItem`** uses the §M.1 superset (`vars`, `sectionId`).
5. **`MessageKey` and `NotificationKind` accept any string for now.** The known keys still autocomplete. P0 narrows
   them to the key unions; a strict union now would force a CCR for every R1.0 track's new key.
6. **Widened signatures** (supersets, so callers of the spec's form compile unchanged):
   - `QuotaError.metric` also accepts `PlatformUsageKey`, because platform charges throw it too.
   - `auditFrom` takes an optional `storeId`, so a staff action on one store is tagged.
   - `storeSql(scope, column?)`, `effectiveHost(headers, { now })`, `edgeVerified(headers, now?)`.
   - `ScopedCache` adds `onStoreInvalidated()`.
   - `requireUser` keeps its legacy `permission` option.
7. **`stateAllows(status, def)` takes the whole permission definition**, not the `write` boolean of the §A.3
   one-liner, because `readOnlyOk` decides suspended and closed. **`releaseOn()` / `CURRENT_RELEASE = "R1"`** live in
   `permissions.ts`.
8. **The settings write functions take `WriteScope`.** §D.10 writes `StoreScope`; lint L6 requires `WriteScope`.
9. **Schema choices:**
   - FKs are named `fk_<table>_store`.
   - Two extra indexes, `ssub_plan_idx` and `la_store_idx`, stop InnoDB from inventing unlisted ones.
   - The rev 2 part refinements to 0004 tables are in 0004, because C0 had not been cut yet.
   - `pages.is_home` is dropped. The 3 call-site files no longer read it; `settings.home` stays authoritative.
10. **Legacy insert shim.** `store_id` on the nine pre-tenancy tables has a default function that throws
    `store_id is required`. Inserts compile and fail at runtime rather than guess a store (see §8).
11. **The seam is ~270 lines with comments**, not ~150. The extra lines are the error mapping and the overload
    plumbing.
12. **`RESERVED_HANDLES` includes the fixed `/app` segments** (`new`, `account`, `security`, `two-factor`,
    `sessions`, `danger`). Without them, a store with such a handle would have an unreachable dashboard.

## 6. Deferred (with reason)

- **To C0b** (§K.1 (b) rows):
  - the `Bucket` builders with the deprecated `rateLimit(string | Bucket)` overload (§E.8);
  - `scripts/qa/tenancy-lint.ts`;
  - `scripts/qa/ownership-check.ts` and `docs/saas/ownership-baseline.json`;
  - `docs/DESIGN.md` v3;
  - the `budgets.json` `compositions`;
  - **`typescript` → devDependencies**. This needs a matching `package-lock.json` (`npm ci` refuses a mismatch), and
    `npm install` is not allowed in this step.
- **Script entries that point at files their owners write later**: `test:tenancy-lint`, `test:ownership`,
  `test:hosts`, `test:permissions`, `test:tenancy-unit`, `test:envelope`, `test:security`, `test:jobs`,
  `test:prepublish`, `test:budget`, `test:migrate`, `test:tenancy`, `qa:*`.
  - Until those files exist, running such a script fails with "Cannot find module".
  - None of them is in `npm test` or `prebuild`.
  - A2/A3's scratch harnesses (migration, settings, seam) are the seeds for `test:migrate`, `test:tenancy-unit` and
    `test:tenancy`.
- **To T2:** the seam's `require_member_2fa`, `platform_read_only`, impersonation, `assertSameOrigin` for actions,
  the rate buckets, `last_active_at`, the step-up chip, and the `path_unsigned` error event. These are C0a's
  documented "not yet" items.
- **R2 contract step:** `resolveProductKey` and `resolveContextKey`, whose row types do not exist yet.
- **P0:** `originFrom(prev, doc)` in `prepublish.ts` (§M.1), and the notification read API (PLA-§18.1).
- **Not tested:** MySQL 8. Only MariaDB 10.4.32 is available locally.

## 7. Spec drift for the maintainer

1. **Sensitive read keys yield a `WriteCtx` in read-only states.** `store.export`, `orders.export` and
   `orders.reveal_phone` are `WritePermission`s (sensitive), so `storeAction` hands `fn` a `WriteCtx`.
   - `stateAllows` lets them through in `suspended` / `closed`, as §A.3.1 intends ("a read").
   - The type then lets that action call write repositories in a read-only store.
   - Suggestion: narrow to `WriteCtx` only for `write: true` keys, or have the seam mint a non-write scope kind in
     read-only states.
2. **`platform_usage`.**
   - `period` is `varchar(7)` (§D.5), but D69's `pending_stores` needs `YYYY-MM-DD` and `mail_sent` is hourly.
   - The table is cut in 0005, yet T2's R1.0 daily signup ceiling (D69) charges it.
3. **`darijaRatio`.** §D.10 names `store_ai.darijaRatio`; ai.md stores `voice.darija`, and the code follows ai.md.
   Design's `brandView` needs a CCR.
4. **`lastDownloadAt` is defined twice:** `platform.backup.lastDownloadAt` (PLA-§2.4) and
   `platform_backup.lastDownloadAt` (§D.10).
5. **`purpose_v = 0`.** The store #1 conversion writes it for unencrypted rows too. The T1 envelope conversion (or
   `[tenancy-check]`) should count only encrypted rows.
6. **The handle `--` rule** (positions 3-4) cannot fire after the slugify collapses `--`. Harmless.
7. **`mintPreviewToken(scope: StoreScope)` inserts a row**, which conflicts with lint L6 (writes take `WriteScope`).
   Staff mint with a platform scope.
8. **The burst limiter has no `signup` / `invite` / `reset` / `report` names**, and `burst-limit.ts` has no R1.0
   owner. T2 will need a CCR.
9. **Ownership overlaps for `test:ownership`:**
   - T4's `src/components/**` contains the maintainer's nav / commands skeletons;
   - T4's `src/lib/admin-data/**` contains `search/types.ts`;
   - `src/lib/i18n/admin/client.tsx` is a fifth i18n file outside the §K.3 list.
10. **`scripts/qa/tenancy-allow.json` (C0b) needs entries** for `__sgLockPool`, `__sgStoreInvalidators`,
    `__sgIdentity`, `__sgPrePublish` and `__sgNotifyStubWarned`.
11. **Sibling names.** `src/components/admin/shell/nav.ts` sits beside `nav/`, and `src/lib/orders/hooks.ts` beside the
    future `hooks/`. Import the new modules by full path (`…/nav/index`).
12. **Closed stores.** §A.5.3 promises other members of a closed store a "store closed" page. C0a's seam answers them
    the neutral 404, and so do `scheduled_deletion` and `rejected` without `allowStates`. The T2 / T4 pages decide.

## 8. Hazards before merging C0a

- **The owner's Store Gen dev server (3450) reads this working tree.**
  - At its next start it applies 0004 to the owner's dev database.
  - From then on, today's single-tenant code fails every insert into the nine legacy tables (`store_id is required`)
    until T3 / T4 convert it.
  - Editing a page slug may be refused by `pages_store_slug_uq`.
  - While it hot-reloads **without** a restart (DB not migrated), full-row selects and, from A4, session validation
    (`users.platform_role`) fail. Restart the server, or point it at a copy of the DB, before using it on this tree.
- **Not for deployment.** Pushing does not deploy, and this step deploys nothing. The R1.0 deploy gate is §H.10:
  dry run plus the archive script.

## 9. Verification (exact results, final tree)

- `npx tsc --noEmit -p .`: exit 0. This is the final tree, including the A4 `SessionUser` change and
  `scripts/qa/c0a-smoke.ts`.
- `npx eslint` over all 111 changed and new TS files (including `scripts/qa/c0a-smoke.ts` and the A4 edits): exit 0,
  no findings.
- `npm test` (final tree): exit 0.
  - `pretest`: "landing assets fca290863c15 (unchanged)". `src/landing/generated/{assets,chunks}.ts` are
    byte-identical to before the run (sha256 OK).
  - theme: "✓ all theme checks passed".
  - runtime: "✓ runtime selftest: all 168 checks passed"; parity "15422 checks passed".
  - "✓ all generator checks passed".
  - render: "runtime budgets: landing 24170/24200 · thanks 6631/6650 · pixels 3883/3900 · turnstile 1278/1300 ·
    units-matrix 2183/2200 · units-fields 994/1000 · fill-steps-box 1725/1750 · whatsapp 5763/5800 · page 31934/32000",
    then "ALL OK".
  - "✓ money parity: server and runtime prices are byte-identical".
  - "✓ conversions check passed (97 assertions)".
  - "✓ offers check: 1219 passed".
  - "orders selftest: 127 passed, 0 failed".
- `npm run test:php`: "php-parity: 2650/2650 identical", "order outputs: 23/23 passed", exit 0.
- **PageDoc v2 `look` change.** The published-checksum logic (`checksumOf(validateDoc(doc).doc)`, as in
  `boot-tasks.ts`) was re-run in A4 against A1's pre-edit baseline: 188 entries, **0 changed**, 0 missing, 0 invalid.
- **`npx tsx scripts/qa/c0a-smoke.ts`** (final tree): all 13 checks passed.
  - migrate on the empty DB `cod_test_c0a_smoke`: `{"status":"applied","applied":5,"total":5}`;
  - migrate again: `{"status":"up-to-date","applied":0,"total":5}`;
  - `next dev` ready on port 3451;
  - owner of A → 200 through the seam, with the store name, `data-sg-seam="member"` and "(owner)";
  - agent of A → 200;
  - signed-in non-member → 404;
  - platform staff (super_admin) without a membership → 404;
  - owner of B on A's handle → 404;
  - owner of A on B's handle → 404;
  - unknown handle → 404;
  - signed out → 307 to `/admin/login`;
  - the server on 3451 stopped (0 listeners after), `next-env.d.ts` restored, `cod_test_c0a_smoke` dropped, and no
    `cod_test_*` databases left.
- **A1-A3 scratch harnesses re-run on the final A4 tree** (they live in the session scratchpad and are not committed):
  - A1 suite: 285 checks, 0 failures. It covers the permission invariants, the host tables, the areas and URL
    builders, `ScopedCache`, and named locks on `cod_test_c0a_locks` (created, then dropped).
  - A2 migration harness: 2462 checks, 0 failures.
    - Empty DB: 5 migrations applied, then up-to-date.
    - The live schema equals `0004_snapshot.json`.
    - Rerunning every 0004 statement changes nothing.
    - Legacy DB at 0003 → store #1.
    - 0004 interrupted after N = 1 … 346 (15 values) ends in the same state.
    - Handle fallbacks pass.
    - 0 throwaway databases left.
  - A2 settings suite: 142 checks, 0 failures (run with a temporary legacy copy, removed afterwards).
  - A3 seam suite: 51 passed, 0 failed, on `cod_test_c0a_seam` (dropped; `left: []`). The one logged line is the
    expected feature-stub case: "not implemented: T1 (assertFeature)" answers `server`.
- **Clean-up:**
  - No process listens on 3400, 3450 or 3451, and no `next dev` process for 3451 remains.
  - `SHOW DATABASES LIKE 'cod_test_%'` is empty.
  - `next-env.d.ts` is byte-identical to before.
  - `AGENTS.md`, `CLAUDE.md` and `tsconfig.json` are unchanged.
  - Nothing was committed, and nothing was installed.
  - The files edited in A4 are back to LF line endings.
