# R1 P8 PLATFORM OPS report

Track P8 (branch `r1/p8`, 12 steps, 2026-10-28 to 2026-11-06). Contract: `docs/STORE-SAAS.md` core rev 6, §G, §H, §F.9,
§H.12, PLA Q.25. P8 ships no screen: P1 (console) and P2 (store admin) render its data. Step 12 ran in speed mode (owner,
2026-11-03): the full `npm test` and the touched suites, no e2e, no manual XAMPP run, no self-review pass.

## Features delivered

| Feature | What shipped | Files | Proven by |
|---|---|---|---|
| SEC-21 | `DATA_AREAS` registry, `dataPath` (refuses traversal), per-store dirs | `src/lib/storage/paths.ts` | `test:jobs` paths: registry / roots / layouts / refusals / perStoreDirs |
| ENGC-14 | `DATA_DIR` boot check with the `.sg-owner` marker, bounded budget walk | `src/lib/media/storage/**`, `src/lib/storage/walk.ts` | `test:storage` boot check: refusals / owner marker / verdict; `test:jobs` walk: accounting, budget and levels |
| ENGC-20 | idempotent durable `put` (FS + DB backends), disk cache, usage | `src/lib/media/{store.ts,storage/**}` | `test:storage` fs: durable put / idempotent put / crash before the row / remove, db backend, disk cache, usage |
| ENGC-12 | lock pool (2 connections), pool-wait windows, ops metrics, error ring | `src/lib/db/locks.ts`, `src/lib/jobs/{errors,metrics}.ts` | `test:jobs` locks, metrics and errors sections |
| ENGC-11 | job runner and cron tick: lease, slot table, due logic, `yield()`, lag and CPU caps, `job_runs`, legacy Sheets shim | `src/lib/jobs/{runner,slots,due,lease,runs}.ts`, `src/app/api/cron/tick/route.ts` | `test:storage` runner, forEachStore; `test:jobs` registry |
| ENGC-29 | outbox core: enqueue, lease claim, drain with caps and backoff, dead rules, replay and the re-send rule, `outboxSummary` | `src/lib/jobs/outbox.ts`, `outbox/**` | `test:storage` outbox |
| ENGC-4 | render queue: `enqueueRenders` and fan-out, claim-clears-dedupe, 4 s CPU cap, in-place re-render through the real `rerenderInPlace`, `renderSummary` | `src/lib/jobs/renders.ts`, `renders/**` | `test:storage` renders |
| OS-07, OS-08 | upload and serve on the FS backend, per-store quotas, `asset_refs` library, delete 409, cutout re-render | `src/lib/media/{process,assets,upload-slots}.ts`, `src/lib/storage/asset-refs.ts`, `src/app/media/[key]/route.ts`, `src/app/api/app/[store]/media/**` | `test:storage` media; `test:jobs` asset refs |
| OS-09 | `media.migrate`, `media.sweep`, walk snapshot, `refs.reconcile`, `usage.reconcile` | `src/lib/jobs/storage/**` | `test:storage` storage-jobs |
| PL-09 | store export ZIP: job, resumable ZIP parts, APIs, signed download route (constant-time hmac, neutral 404), 72 h expiry | `src/lib/exports-store/**`, `src/lib/jobs/exports.ts`, `src/app/api/app/[store]/exports/**` | `test:storage` export; `test:jobs` exports |
| OS-10 | logical backups: sealed NDJSON parts, manifest, resumable daily job, retention, `purgeRequests`, restore library and drill | `src/lib/backup/**`, `src/lib/jobs/backup.ts` | `test:storage` backup; `storage-check --restore-drill` |
| OS-11 | purge (§F.9 order from schema.ts), lifecycle cron edges, §H.11 retention in housekeeping | `src/lib/jobs/{purge,lifecycle,retention,housekeeping}.ts`, `purge/**` | `test:storage` purge; `test:jobs` purge and retention |
| PLA Q.25 | `getHealth` / `getHealthReport` sections (tick, outbox, renders, sheets, db, dataDir, errors, runtime, build gate, edge, commerce, ai, design, jobs) and alarm helpers | `src/lib/platform/health.ts`, `src/lib/jobs/alarms.ts` | `test:storage` health; `test:jobs` health |

## P0 stubs replaced (frozen signatures kept, `src/lib/contracts/r1-p0.ts`)

`getHealth(ctx): Promise<PlatformHealth>` (plus the additive `getHealthReport(ctx, { sections? })`), the cron tick,
the outbox enqueue and replay, `enqueueRenders`, `renderSummary`, `outboxSummary`, `requestStoreExport`,
`listExportJobs`, `listBackupRuns`, `appendPurgeRequest`, `syncAssetRefs` / `assetUsage`, `recordError`, and the media
`put` / `get` / `remove` driver. The exact signatures are the frozen ones in `src/lib/contracts/r1-p0.ts`; P8 added
fields only additively (listed per step below).

## CCRs

| CCR | Subject | Status |
|---|---|---|
| r1-p8-1 | boot steps for the `DATA_DIR` check and the pool-wait sampler (`src/instrumentation.ts`) | open, P8 merge (the lazy boot check stays as the fallback) |
| r1-p8-2 | `rerenderInPlace` | applied at P0b; `RerenderPort` is wired to it |
| r1-p8-3 | `sealBytes` / `openBytes` | applied at P0b |
| r1-p8-4 | tenancy allow file: L4 and the pins | L4 applied at P0b; pins open (final: `src/lib/jobs/**` 42, `src/lib/platform/**` 20) |
| r1-p8-5 | chain `test:jobs` / `test:storage` into `npm test` / `test:db` | open, P8 merge |
| r1-p8-6 | `platform_backup.purgeRequests`, retention bounds | applied at P0b |
| r1-p8-7 | call `syncAssetRefs` / `assetUsage` from save, publish, restore and the brand setting | open (the doc scan in `assetUsage` stays until it lands) |
| r1-p8-8 | feed the error ring from `logError`, the action wrappers and the seam | open, P8 merge |
| r1-p8-9 | export `AUDIT_SECRET_KEY_RE` | applied at P0b |
| r1-p8-10 | `test:migrate` case (e): the purge's table set | open, P8 merge |
| r1-p8-11 | the archive ships `qa/.build-sha` | applied at P0b |
| r1-p8-12 | header cases for the export download route | applied at P0b |
| r1-p8-13 | `deleteTestOrders` stub (P4) | applied at P0b (P4 fills it) |
| r1-p8-14 | P5's outbox handler files | done at P0 |
| r1-p8-15 | `DB_POOL_SIZE` | applied at P0b |
| r1-p8-16 | HANDOFF text: restore drill, owner marker, media fallback | open, P8 merge |
| r1-p8-17 | runner budgets for the tracks that register jobs | open, informational (P1, P3 to P7) |
| r1-p8-18, r1-p8-19 | `test:tenancy` outbox replay and render queue cases | open, P8 merge |
| r1-p8-20, r1-p8-21 | render queue and store export APIs for P1 / P2 | open, informational |
| r1-p8-22 | `test:tenancy` cases for the export download route (2 role-matrix rows fail until it lands) | open, P8 merge |
| r1-p8-23 | honest health sections (nullable frozen fields, `sections`, edge tally) | open, P8 merge |

## Cross-track notes

- P1 (console) reads `getHealth` / `getHealthReport`, `outboxSummary`, `renderSummary`, `listBackupRuns`, the export
  list and the outbox replay; P2 (store admin) calls `requestStoreExport`, `listExportJobs`, the media routes and
  `assetUsage`.
- P3 to P7 register jobs per r1-p8-17 and enqueue renders and outbox rows through P8's APIs; P4 fills
  `deleteTestOrders`; P5 fills the CAPI / Telegram outbox handlers; P6 and P7 own `design.retention` / `ai.retention`.
- Only at the R1 integration: the instrumentation boot step (r1-p8-1), the error-ring feeds (r1-p8-8), the `npm test`
  chaining (r1-p8-5), the tenancy cases (r1-p8-18, 19, 22) and the pins (r1-p8-4).

## Spec drift (for the maintainer)

Slot budget = guarantee, a job's `budgetMs` = its cap; the legacy Sheets shim in the runner; the purge at 11 s a tick vs
§F.9's 15 s; `media.migrate` at 3 s vs §G.3's 10 s; the asset-refs file at `src/lib/storage/asset-refs.ts` vs §G.5's
`src/lib/media/refs.ts`; the cutout re-render changes the checksum (DES-§4.11) vs §H.3's "checksum never changes"; the
export is not charged to `exports_month`; the `platform_backup` retention bounds vs PLA-§17. Details per step below.

## Step 12 fixes

- `src/lib/jobs/backup.ts`: the restore target splits a batch whose text INSERT would pass XAMPP's 1 MiB
  `max_allowed_packet` into one-row binary INSERTs, and a row larger than one packet into an INSERT plus one UPDATE per
  large column by primary key. `openRestoreConnection`, dropped by the interrupted session's edit, is back unchanged.
- `src/lib/storage/asset-refs.ts`: deadlock retries 3 to 6 (ten parallel syncs of one owner); the `useKey` helper is
  renamed `usageKey` (the React hooks lint read it as a hook).

## Checks (step 12)

- `npm run typecheck`: green.
- `npm test` (full chain): every suite green up to `test:tenancy-lint`, which reports only the two PIN findings
  (`src/lib/jobs/**` 42/0, `src/lib/platform/**` 20/5; r1-p8-4). Its first run also showed 2 L10 findings on the new
  restore statements; annotated, L10 is 0.
- `npx eslint` over `src/lib/{jobs,storage,media,backup,exports-store}`, `src/lib/platform/health.ts`,
  `scripts/qa/storage-check.ts`: 0 problems.
- `npm run test:jobs`: 780 passed, 0 failed, 1.68 s (budget 3 s).
- `npm run test:storage`: 559 passed, 0 failed, 34.29 s (runner 3.2 s, media 4.9 s, backup 11.0 s, purge 3.8 s).

## Known gaps and integration steps

- Not run in this step (speed mode): `test:slow`, `test:db` beyond `test:storage`, `npm run build`, `test:e2e`,
  `qa:secrets`, the gate, and the manual XAMPP run (boot verdict, cron calls, upload and migrate, export ZIP, backup and
  restore drill, purge of a throwaway store, the getHealth print). They run at the merge in main.
- The `DATA_DIR` persistence probe across two Hostinger deploys, `max_user_connections` on Hostinger with the
  2-connection lock pool, and a live export download and backup restore on the deployed site.
- `test:tenancy-lint` reports only the two PIN findings until r1-p8-4's pins land; `test:tenancy` has 2 failing
  role-matrix rows until r1-p8-22 lands.

## Progress

P8 PLATFORM OPS: 12 of 12 steps committed; the track is fully built and goes live with the R1 merge and deploy.

## Decisions recorded during the steps

### Step 3: the job runner and the cron tick (`src/lib/jobs/runner.ts`, `slots.ts`, `due.ts`, `lease.ts`, `runs.ts`)

1. **Budgets: a slot's budget is the guarantee, a job's `budgetMs` is its cap inside the slot.** A job starts with
   min(`budgetMs`, what is left of its slot, what is left of the tick minus 2 s). Jobs sharing a slot run in registry
   order and spend one allowance. Unused time is carried on; only slots 4c (up to 5 s) and 9 (up to 6 s, plus the 5 s
   the table leaves unassigned) may spend it, and only for a job whose `budgetMs` asks for it (≤ 6,000 in 4c, ≤ 9,000
   in 9). `test:jobs` refuses a `budgetMs` above slot + leftover cap. CCR r1-p8-17 tells P1 and P7 what to declare.
2. **Lease times are the database's UTC clock** (`UTC_TIMESTAMP(3)`), where §H.2 writes `now(3)`: the same value for
   the query pool (its sessions are `+00:00`), and independent of a connection's zone otherwise. The seed row is
   `INSERT IGNORE`d before every compare-and-set (P0 review G5 / P0b P0-7), `cursor` quoted.
3. **Busy time, not wall time, for `yield()` and `cpuMs`**: the event loop's active time
   (`performance.eventLoopUtilization()`, the perf_hooks clock behind `performance.now()`), so a job awaiting the
   database or Google for 3 s is not a "no yield" violation. Other requests' busy time during a job's awaits is counted
   in its `cpuMs` (an upper bound on a quiet server); the time inside `yield()` itself is never held against the job.
4. **Due state** lives in each job's own `cron_cursors.state.due`, merged with `JSON_MERGE_PATCH` so a job's other
   state keys (the `storage.walk` snapshot) survive. `hourly` = once per UTC hour; `dailyAt` = once per local day in
   APP_TIMEZONE (default Africa/Casablanca) from HH:MM, with catch-up later the same day. `done: false` keeps the
   period due; a throwing job is retried at the next tick, at most 3 times per period, then the period is given up.
5. **`job_runs`**: every run writes its run row (`store_id` NULL) even when stores did work, plus one row per store
   that did work (the step returned a positive count, threw, or the store was picked by a `where` predicate), at most
   200 per run. §H.2 says "one row per store … else one summary row"; the run row is kept in both cases so the Cron
   panel reads one row per run (ms vs budget, processed, error code) without grouping by tick.
6. **Additive contract changes** (frozen fields untouched): `JobResult.processed`, `JobResult.errorCode` (a run that
   finished with a failed unit: ok = false with the code, its counts kept); `TickReport.notStarted`, `leaseLost`, and
   per job `slot`, `budgetMs`, `noYield`; `forEachStore`'s step may return a number.
7. **A lost lease stops the tick** (renew answered 0 rows, or could not be sent): no further job starts, the tick row
   says `lease_lost`, and the release leaves the new holder's lease alone.
8. **`slotOf`**: every R1 name of §H.2, OPE-§J, AI-§N, DES-§24.1, LAN-§23.4 and PLA-§15 (and the R2 / R3 names §H.2
   already places) by name; then the `platform.*` family → 9 (§H.2 names it as a family); then tick → 7, hourly or
   daily → 6.
9. **Housekeeping order**: the three platform deletes first (rate-limit buckets, visitor markers > 2 days, sessions),
   then the abandoned-leads round robin (its own cursor `housekeeping.leads`) with what is left of the 4 s, so a large
   platform is covered over several ticks. A failing step is counted and the others run (`steps_failed:<names>`).
   The `job_runs` > 14 days delete, the §H.11 rows and the daily `store_usage` purge (P0b F-10) are step 10's.
10. **`test:migrate` is not run in the worktree**: its database names are fixed to `cod_test_p0_*` / `cod_test_p0_t1_*`
    and the worktree may only create `cod_test_p8_*`. Its case (h) (forEachStore on a real database) is mirrored in
    `test:storage`'s `forEachStore` section; the suite itself runs at the merge in `test:db`.

### Step 4: the outbox core (`src/lib/jobs/outbox.ts`, `outbox/{rules,drain,sql}.ts`, `tracks/core.ts`)

1. **No `src/lib/jobs/handlers/index.ts`.** The brief asked for an index there that imports `./capi` and
   `./telegram`. `test:registries` requires every file in `src/lib/jobs/handlers/` to be imported by
   `src/lib/jobs/registry.ts`, so an index in that folder would fail it, and a second list of handlers would drift
   when R2 / R3 add theirs. `drainOutbox` imports `./registry` instead (its header already says "whatever drains the
   outbox loads this registry first"): one list, proven complete by `test:registries`.
2. **Store rows only through the seam.** Every statement on a store's rows binds `store_id` from a write scope (the
   drain's `systemScope`, the replay's `memberWriteScope`, the summary's `whereStore`). Only the platform items
   (`store_id` NULL), the console's replay of any row and the platform summary are cross-store, each annotated.
3. **Claims per kind.** One §H.1 claim per kind and store (the statement verbatim, one kind in `IN (…)`), so each
   handler's `perStorePerTick` and its `maxPerTick` for the whole drain are exact. Kinds are served in a fixed order
   (telegram, capi, webhook, carrier, whatsapp, push, mail). Deadlocks and lock wait timeouts on a claim are retried
   twice, then the kind waits for the next round (`more`).
4. **Timeouts.** `timeoutMs` arms an AbortController on a plain, referenced `setTimeout` (cleared when the send
   settles). `AbortSignal.timeout()`, as the brief named it, has an unref'd timer: a script's drain waiting on a hung
   send saw its process exit under it (test:jobs did, with exit code 0). The drainer passes the signal to
   `send(item, signal)` / `batch.send(items, signal)` as a second argument (the frozen one-argument type still
   compiles), so P5's handlers can cut their fetch. On expiry the send is a retryable `timeout`, whatever it answers
   later. The test harness now exits 1 when the process ends before its last section.
5. **A throw is a retryable failure** stored as its error code (`TypeError`, `ECONNRESET`), never its message. A
   handler's answer that is not a `SendResult` is a retryable `bad_result`.
6. **`done_at` is the finish time of done and dead rows**, so step 10's retention reads one column (done 14 days,
   dead 30 days). The outbox summaries give a dead row's `at` from it.
7. **Budget.** The deadline is checked before each send; the rest of the claim goes back to `pending` with its
   attempts and `next_at` unchanged (counted `released`), and the report says `more`.
8. **Mail caps** (platform items): before each mail, `rateLimit(p:outbox:mail, 4, 60)` then
   `chargePlatformUsage("mail_sent", hour, 1, { limit: 150 })`. Over either cap, the rest of the claim is rescheduled
   to when it opens (`retryAfter`, or the next UTC hour), attempts untouched.
9. **Pauses.** `capi_enabled` (via `killSwitchTripped`) and the handler's `paused()` are read once per drain and
   kind; a pause that cannot be read counts as paused, so items wait rather than going past a switch.
10. **No handler.** The kind is not claimed; its items stay pending. A store-bound probe (at most every 10 minutes per
    process) finds such items and logs each kind once per process (`no_handler_<kind>` in the error ring).
11. **`pending_outbox`** (forEachStore) now also picks a store whose item is `running` past its lease, so a drain that
    died mid-send is taken over by the cron even when the store has nothing else due.
12. **Replay** checks, in order: a write scope (`impersonation_read_only`), `integrations.manage` (store) or
    `stores.lifecycle` (console), the id, the row (`not_found` outside the store), then the rule table. It answers a
    `pending` / `running` row with nothing (no second audit row), refuses a done row of any kind but webhook and
    telegram and a `cancelled` row (`AuthRefusal("invalid")`). The update is a compare-and-set on the state it read.
13. **`OutboxSummary`** gains (additively) `done` / `cancelled` counts and `oldestPendingMin` per kind, `lastStatus` per
    dead row and `deadCount`. `oldestPendingAt` is the oldest pending row's `created_at` (how long it has waited).
    `platformOutboxSummary()` has the shape `getHealth().outbox` needs (step 11) plus the dead list of PLA-§15.
14. **The job.** `outbox` (slot 3, every tick, 13 s): the platform items first, then the `active` / `restricted`
    stores with due work (§A.5.3: restricted stores still deliver for existing orders), round robin on the job's own
    cursor. Its summary says `delivered` (the runner writes its own `done` into the same object).
15. **Re-send rule.** `resendKey(base, n)` and `reportDuplicates(result, { area, storeId })` (one `duplicate_enqueue`
    per duplicate item, at most 100 a call, the caller's area as the route) are exported for P4's and P5's hooks.
16. **`OUTBOX_BACKOFF_MS` and `isFinalFailure` moved** to `outbox/rules.ts` and are re-exported from `outbox.ts`
    unchanged (the contract file still pins them there), so the rules module needs no value from `outbox.ts`.

### Step 5: the render queue (`src/lib/jobs/renders.ts`, `renders/{rules,drain,sql,summary,fanout}.ts`, `tracks/core.ts`)

1. **The handler is `rerenderInPlace`** (`src/lib/render/publish.server.ts`, CCR r1-p8-2, applied at P0b). The brief's
   fallback `renders/inplace.ts` is not needed and does not exist. The drain reaches it through a port
   (`RerenderPort`), so test:jobs drives the queue with a fake one.
2. **3 retries, then `failed`: 4 tries in all.** §H.3 says "failures retry 3 times then failed", and the backoff ladder
   has 3 steps (1, 5, 30 min). The brief also says "after 3 attempts → failed", which would leave the 30 min step
   unused. The ladder wins: the 4th failing try marks the job `failed` with `attempts = 4`, and `test:jobs` /
   `test:storage` assert pending 1 → 2 → 3, then failed 4. A failed job marks the store's health dirty (P1's stub
   today) and counts `renders` / <code> in the error ring once.
3. **The CPU budget is measured as event-loop busy time** (`performance.eventLoopUtilization().active`, the perf_hooks
   clock of `performance.now()`) around each `rerenderInPlace` call. §H.2 says "performance.now() around SSR +
   gzip". Those calls are inside `publish.server.ts` (not P8's file), and wall time around the whole call would count
   the database awaits as CPU. Busy time includes other requests' work during those awaits, so it is an upper bound:
   the cap errs towards rendering fewer pages per tick. The cap is 4 s, 2 s while lag p95 > 100 ms. The runner also
   halves the job's 12 s budget under lag, because `renders` is CPU-bound.
4. **Claims are per store** (the §H.3 statement with `store_id = ?`, `ORDER BY priority, not_before, id LIMIT 10`), so
   every statement binds the store from the job's system scope and the claim needs no annotation. `pending_renders`
   now also picks a store whose job is `running` past its lease, as `pending_outbox` does. A take-over from an expired
   lease counts the lost try (`attempts` is assigned before `state`). A job taken over after 3 retries fails at once
   (`lease_expired`) without rendering.
5. **No further store once a budget is spent.** `forEachStore` gains an optional `stop()` (additive), asked before each
   store. When the CPU cap or the deadline is reached, the run ends there. The cursor stays on the last store served,
   and no `job_runs` row is written for stores that were not visited. Inside a store the deadline and the cap are
   checked before each job, and the rest of the claim goes back to `pending` untouched (`released`).
6. **Outcomes.**
   - `rendered` → `done`, with the warn-mode gate items as `notes:<ids>` (whole ids, ≤ 200 chars).
   - `skipped_runtime_v1` → `skipped` / `runtime_v1`; the page is listed in the summary's `republish`.
   - `not_live` → `skipped` / `not_live`.
   - `live_changed` (a publish landed mid-render) → `done` / `live_changed`, and the page is queued again.
   - A throw → a retry, stored as the refusal's own code (`invalid`, `page_too_large`) or the error ring's code,
     never a message.
7. **A retry behind a newer pending job is superseded.** When a job goes back to `pending` (a retry, or a release) it
   takes `dedupe` back with `UPDATE IGNORE`. If a job enqueued during the render already holds `dedupe`, the older job
   is closed as `skipped` / `superseded`, because the newer job carries the newer context. mysql2 connects with
   `CLIENT_FOUND_ROWS`, so `affectedRows` counts matched rows. An `UPDATE IGNORE` that hits the unique key answers
   "matched 1, changed 0", so these two statements are judged by `changedRows`. test:storage caught this on MariaDB
   10.4.
8. **Earlier failures are resolved.** Once a page renders (or leaves the queue for good: runtime_v 1, not live), its
   older `failed` jobs become `skipped` / `resolved:<code>`. The failed list and `render_failed` then show only what
   is still broken.
9. **Enqueue.**
   - A pending job keeps the lower of the two priorities, so a Purchase-trigger change (4) is not held behind a
     pending address job (5).
   - Ids that are not the store's pages are dropped and counted once per call (`renders` / `foreign_page`). The frozen
     return type `{ enqueued }` is unchanged.
   - An impersonation scope is refused at run time (`impersonation_read_only`).
   - `retryFailedRenders(scope, reason?)` queues the failed jobs' pages again, each with its own reason (the Retry of
     Store Health).
10. **The fan-out (PLA-§16.2).**
    - `enqueueRendersEverywhere(ctx, "address" | "runtime")` and `retryFailedEverywhere(ctx, reason?)` take a
      `PlatformCtx` with `domains.manage`, or a system ctx for §H.10's integration-deploy re-render.
    - They store one request in `cron_cursors` (`job = 'renders.fanout'`, `state.fanout`) and return at once.
    - One fan-out runs at a time: a request made while one is in progress answers `started: false` with that one's
      progress.
    - The `renders.fanout` job (slot 7, every tick, 1 s) walks the stores once, in id order, from the request's own
      `after` (not a round robin), and enqueues through each store's system scope. A store whose enqueue throws is
      counted and skipped.
    - The row is read and written under its row lock as one JSON document. `JSON_MERGE_PATCH` would delete
      `doneAt: null`. The runner's `due` keys survive.
    - The console's per-store Retry is `retryStoreRenders(ctx, storeId, reason?)` (`domains.manage`).
    - P1's console actions audit `platform.domains.rerender`; this library does not audit.
11. **Summaries.**
    - `RenderSummary` gains fields (additive):
      - in `byReason`: `done` and `skipped`;
      - in `oldestPending`: `slug` and `reason`;
      - in `failed24h`: `codes`;
      - at the top level: `totals`, `oldestMin`, `finishedLastHour`, `throughputPerMin`, `etaMin`, `failedOld`,
        `topNotes`, `republish` and `at`.
    - Throughput counts every job finished in the last hour (done, skipped, failed). ETA = ceil(pending × 60 /
      throughput), and null when nothing finished in the hour.
    - `renderSummary()` without a scope is the platform summary (console code only).
    - `platformRenderSummary({ reason? })` adds the 20 stores with the most failed (then pending) jobs and the
      fan-out's progress.
    - The reads are merged into 6 statements for a store and 7 platform-wide. Each platform statement is annotated.
12. **Attached pages.** `pages.product_id` arrives with 0006. The port reads the column only when the schema has it
    (`getTableColumns(pages).productId`). In R1 it does not, and every job renders in place. In R2, until S1 wires
    `republishAttached`, such a page still renders in place and is counted as `attached_in_place`.
13. **Caches.** `rerenderInPlace` drops the store's render cache per page. After a store in which a page was rewritten,
    the job also calls `invalidateStoreRender` and `invalidateStore`.
14. **Not in this step.** The media pipeline's `cutout` enqueue (step 6). The integration deploy's runtime re-render
    (`enqueueRendersEverywhere(systemCtx("deploy"), "runtime")` at the merge, §H.10 / P0-6).

### Step 6: the media pipeline (`src/lib/media/{process,assets,store}.ts`, `src/lib/storage/asset-refs.ts`, the media routes)

1. **Spec drift: `src/lib/storage/asset-refs.ts`, not `src/lib/media/refs.ts`.** §G.5 names `src/lib/media/refs.ts`,
   but P8's row owns `src/lib/media/{store.ts, storage/**, process.ts, assets.ts, upload-slots.ts}` only, so a new file
   in `src/lib/media/` would be nobody's in R1. The module lives under `src/lib/storage/**` (P8's). It exports
   `extractAssetIds`, `syncAssetRefs`, `assetUsage`, `livePagesUsing`, plus `usageByPage` / `assetUsageByPage` (the
   dashboard's `AssetUsage` shape, which CCR r1-p8-7 re-exports from `admin-data/assets.ts`).
2. **`extractAssetIds` takes a tagged source**: `{ kind: "doc", doc }`, `{ kind: "theme", theme }`, or
   `{ kind: "settings", key, value }`. Landing documents go through `collectAssetIds` (the renderer's own walk, so the
   index, the renderer and the export agree); the `brand` setting through its four logo roles; a theme or another
   setting through a bounded walk (AssetRef-shaped objects and `assetId` / `*AssetId` strings, depth 14, 20,000
   nodes). R2's `product` source arrives with S1's product documents.
3. **`syncAssetRefs` filters before it writes.** Only ids of the scope's store's own assets are indexed (the §E.3 rule 5
   check as a filter: a document may name a missing or another store's id, which renders as nothing). The owner's rows
   are replaced by one DELETE and one INSERT IGNORE in a transaction; a deadlock between two syncs of one owner is
   retried (3 tries). An empty list removes the owner's rows.
4. **The scan until CCR r1-p8-7 lands.** `assetUsage` and `livePagesUsing` unite the index with an exact scan of the
   store's non-archived landing drafts, its live versions and its brand logo (`collectAssetIds` over the parsed JSON,
   keyset batches of 20, at most `pages_max` documents of each kind, capped at 2,000; never a LIKE). Index rows whose
   owner is gone are left out; a `page_version` row counts as live only while it is its page's published version.
   Step 12 removes the scan if the CCR has landed.
5. **The delete refuses only live usage** (a deviation from the brief's "409 when `assetUsage` is non-empty"). The
   read-only dashboard (`media-library.tsx`) sends `force=1` only when its dialog showed live pages or the logo, and it
   reads every page of a 409 as live ("Live right now on …"; with no page it says "It's your store logo"). A 409 for a
   page used only in drafts would therefore show the wrong sentence and ask twice. So `deleteAsset` throws
   `AssetInUseError` (the route's 409 `{ error: "in_use", message, pages, storeLogo }`) while a live version or the
   brand logo of THIS store shows the file; drafts are listed by the dialog's "Used in" and the delete proceeds after its
   confirmation, as in R1.0. The 409's `pages` are this store's live pages only (MED-12); another store's document
   naming the id never counts, and another store's id answers 404 like a missing one. If the lead wants drafts refused
   too, the dashboard needs a `drafts` field in the 409 and its wording first (a P2 / maintainer change).
6. **Deleting.** One transaction deletes the asset row, its `media_files` rows, the chunks of its `db` files and its
   `asset_refs` rows, and resets the store's derived cutouts. The `fs` files go after the commit through `storageFor`,
   skipping any key that has a row again (the same bytes re-uploaded meanwhile); a failed removal is an orphan for
   `media.sweep`, counted as `media` / `orphan_left`. The bytes are refunded after the commit.
7. **The upload is split in two halves.** `prepareUpload` (sniff, decode, encode, analyse) runs under the per-store
   media gate; `persistUpload` (§G.4 steps 4-6: charge, files, rows) runs after the gate is released, so a slow disk or
   database never holds another store's processing slot. `processUpload` keeps its signature. `test:storage` races the
   storage half alone.
8. **Files before rows, and twin uploads.** Every file is `put` (durable, idempotent) before the transaction; the fs
   backend's rows carry no chunk (`insertFsFileRows`), the db backend's chunks still go inside the transaction. Two
   uploads of the same bytes in one store write the same keys, so:
   - a file already on disk before this upload's `put` is never this upload's to remove;
   - the cleanup of a failed upload keeps every file whose key now has a row (the deduped race: the winner's files);
   - after its commit, an upload re-puts any of its files that a failing twin removed in between.
9. **The quota answer.** `quotaRefusal(err)` builds the route's 413 `{ ok: false, error: "quota", message }`: the
   sandbox message when the shared `pending_media_bytes` budget refused (D69), the store's own otherwise. It never
   carries a limit, a usage figure or the platform database's fill level (MED-13). The platform DB floor (`DB_QUOTA_MB`)
   now applies only while media falls back to the database backend (§G.4 step 4).
10. **The cutout re-render** (DES-§4.11, DES-R22). After the commit of a cutout whose `sourceAssetId` is one of the
    store's own assets, `enqueueRenders(scope, await livePagesUsing(scope, source), "cutout")` runs in Next's `after()`
    (outside a request, in scripts and tests, it runs at once and is awaited). The render queue is imported on use, so
    it stays out of the upload route's module graph. A failure is logged, never the upload's. A deduped cutout queues
    nothing (nothing new was stored). The visual swap is P6's.
11. **Reads.** `store.ts` stays the one front for both backends (metadata cache, LRU, read pool) and picks the backend
    from the row's `storage`. It calls the fs backend directly rather than through `storageFor`, because
    `storage/db.ts` wraps `store.ts` and importing `storage/index.ts` from it would be a cycle. `evictStore` is kept.
    A row whose fs file is missing or differs answers the neutral 404 (counted), never a 503 a client would retry.
12. **Tenancy.** No new lint finding: `asset-refs.ts` binds the store with `whereStore` / `inStore` / `storeValues`;
    the raw statements in `assets.ts` and `store.ts` carry `store_id = ?`. The media routes were already in the derived
    route list of `test:tenancy`.

### Step 7: the storage jobs (`src/lib/jobs/storage/*.ts`, `src/lib/storage/asset-refs.ts`, `tracks/core.ts`)

1. **Five jobs in slot 6, one per window.** `media.migrate` every tick (3 s); `usage.reconcile` 02:05, `media.sweep`
   02:10, `storage.walk` 02:15 and `refs.reconcile` 02:25 (3 / 3 / 2 / 3 s). §H.2 and OPE-§J name 02:20, 02:30, 02:40
   (two jobs), 02:55 and later times, so each storage job is alone in its 5-minute window; `test:jobs` checks the
   registry and the union with every time the spec names. The times and budgets live in
   `src/lib/jobs/storage/rules.ts` (`STORAGE_JOB_TIMES`, `STORAGE_JOB_BUDGETS`), which `tracks/core.ts` imports (pure:
   importing the registry still loads no database code).
2. **A daily pass through forEachStore.** `usage.reconcile` and `refs.reconcile` visit every store once a day from the
   job's round-robin cursor, across as many ticks as they need (a daily job stays due while it answers `done: false`).
   `passVisitor` keeps the pass in `cron_cursors.state.pass` (`{ start, wrapped }`): the pass ends at the first store
   after its start once the iterator has wrapped, or on a second wrap (it started on the last store, or that store is
   gone). That store is not worked; the next pass starts after it and works it last. `test:jobs` drives it over the
   real `roundRobin` with 1, 2 and 10 stores a tick, a store added and one deleted mid-pass, one store and none.
3. **media.migrate flips and deletes in one transaction.** §G.3 lists the UPDATE and the chunk DELETE as two steps; they
   commit together here, so a slice interrupted between them cannot leave chunks behind a flipped row. Before the flip
   the row still says db and the next tick redoes the read and the idempotent `put`. A row deleted meanwhile flips
   nothing and its new file is removed at once. Chunks that do not make their row's file (count, length, sha256) are
   never moved: they are reported (`media` / `file_mismatch` or `missing_file`) and kept in `state.bad` (≤ 200 keys)
   so they never take a tick's budget again. "Returns at once": on the db backend, and for an hour after a probe found
   no db row (a module-level number; rows only appear while a process runs on the fallback). The stores with db rows
   are found by a new forEachStore predicate `pending_media_db` (`src/lib/jobs/scope.ts`, P8's), on `mf_store_idx`.
4. **media.sweep is driven by the disk, not by forEachStore** (a deviation from the brief's "every job works through
   forEachStore"). A purged store has no store row, so forEachStore never visits it, yet its leftover files are exactly
   what the sweeper is for. The sweep walks the store folders under `<media root>/v1` in id order (resumable in
   `state.sweep`: `tmp` → `disk` → `rows`), compares each folder with that store's rows through `systemScope`, then
   lists the stores whose fs rows have no folder at all. A file is deleted only with no row of its store and older than
   one hour; the keys about to go are read again just before the unlink. A folder name that is no store id is never
   touched. It runs only while the DATA_DIR boot check passes, so a refused directory (another app's marker) is never
   swept. Missing files count one `missing_file` each (≤ 500 per store and run); rows are never deleted.
5. **An idempotent `put` refreshes the file's time** (`src/lib/media/storage/fs.ts`). ENGC-20's short-circuit (the
   same bytes already on disk) used to leave the old mtime, so a retry an hour after a crash could have its file swept
   between the put and its row. `utimes` makes the sweeper's hour start again.
6. **storage.walk** sums DATA_DIR and the media root when MEDIA_DIR lies outside DATA_DIR (case-insensitive on
   win32). The walk in progress (`state.walk`: roots, index, cursor, finished roots' totals) carries over; a change of
   roots starts over. The snapshot `{ bytes, files, dirs, budgetBytes, complete, at }` replaces the old one only when
   every root is counted, so the health tile never shows a partial walk.
7. **refs.reconcile heals by timestamps, not by re-reading every document.** A draft is rebuilt when it has no rows or
   `pages.updated_at` is newer than its rows; a live version (immutable) when it has no rows or a row not marked live;
   the brand when its rows are not exactly the setting's own logo assets. Rows of pages that are gone or archived, and
   of versions that are no longer live, are removed. A draft with no asset of the store has no rows, so it is re-read
   each night (cheap, bounded by `pages_max`); it is not counted as rebuilt. All page kinds are indexed (the scan of
   step 6 reads landing pages only; the index is the safer superset for the delete 409).
8. **usage.reconcile** recomputes every gauge through `recomputeStoreGauges` and, once the pass completes, sets
   `pending_media_bytes` / `total` to the sum of the pending stores' `media_bytes` gauges in one `INSERT … SELECT … ON
   DUPLICATE KEY UPDATE`. The summary carries `<gauge>_delta`, `<gauge>_stores`, `driftStores`, `stores` and the pending
   budget before / after; a store whose gauges moved gets its own job_runs row.
9. **No chunk sweep.** `media_chunks` rows are written and deleted in the same transaction as their `media_files` row
   (the db upload, the delete of step 6, the migrator's flip), so no orphan chunk can arise and the sweeper reads only
   the disk.
10. **Tenancy.** Three new cross-store statements on store data (the migrator's probe, the sweeper's store list, the
    pending media budget), each annotated and listed in CCR r1-p8-4's step 7 addendum (pin 16 → 19). `isInside` takes
    the platform's own `path` flavour (`win32` or `posix`), so its rules hold on any host.

### Step 8: the store export ZIP (`src/lib/exports-store/**`, `src/lib/jobs/exports.ts`, the download route)

1. **Not charged to `exports_month`.** A data-portability export is not a PHP export; the only limits are one active
   job per store (an active one answers its `jobId`) and the bucket `s:<sid>:export:zip` (3 a day). The request runs
   under a per-store named lock (`storeLock(sid, "export")`), so two clicks never make two jobs.
2. **The insert uses a system WriteScope minted in `src/lib/jobs/exports.ts`** (`exportWriteScope`), so a suspended or
   closed store's read-only member scope (§A.5.3) and P1's `platformScope` (D71) both queue the store's own export,
   and that insert is the only write made with it.
3. **The ZIP is written straight into its parts, not staged as a tree.** Text sections are staged one file at a time
   (`stage/<id>.tmp`, its saved length truncated back on resume) and deflated into the archive when complete; media
   and pages go straight in. The part's offset and its central-directory records travel in the cursor; reopening a part
   cuts it back to the saved offset, so a dead tick costs one slice and never leaves garbage in the archive. Each part
   is a complete ZIP (its own directory); one entry larger than 500 MB stands alone in its part (ZIP32 still holds it).
   The local headers are patched with CRC and sizes after the data (no data descriptor), so every reader takes them.
4. **Columns come from the Drizzle tables**, minus the §F.9 deny list (`orders.capi_ctx`, `upsell_token_hash`,
   `claim_token`; `campaigns.share_token_hash`; `store_health.flags`) and any column whose name looks like a secret
   (`COLUMN_SECRET_RE`, whatever the table), so a credential column added later is withheld until someone decides
   otherwise. A table or column the database lacks is skipped and named in README.txt. `orders.claim_token` is a
   queue claim, not a secret, but it is a token by name and has no meaning outside the platform.
5. **audit.csv applies the store's own listing rule** (`tenantAuditEntry`): staff rows without user id, impersonator
   id or IP hash, and without a staff note the store was not shown. **settings.json** omits every secret key whole,
   passes the others through `redactStoreSetting`, then drops any key naming a secret at any depth. **campaigns.json**
   drops any token-named key inside the kit JSON. **ai_memory.json** keeps active and inactive items and drops run ids
   from `evidence`. **health.json** strips `flags` from whatever `getStoreHealth` answers (null today: omitted).
6. **CSV dialect**: BOM, CRLF, RFC 4180 quoting, the formula guard on text only (a negative amount stays a number; an
   E.164 phone reads `'+212…`, which README.txt explains), decimals with their stored scale (`199.00`), integer cents,
   booleans 1 / 0, ISO UTC dates.
7. **media/<assetId>.<ext>** is the asset's largest `media_files` row of this store, read through `storageFor(row)` (fs
   or db). A missing or mismatched stored file is noted in README.txt and skipped, never a failed export.
8. **Failure codes**: `no_data_dir` (DATA_DIR unset or refused by the boot check: an export never lands in an
   unchecked folder), `no_space` (the estimate, the media's largest variants plus documents plus typical row sizes,
   against what the last complete walk left of `DATA_DIR_BUDGET_BYTES`; no snapshot, no check), `store_gone`,
   `cursor_lost`, `part_lost`, `write_failed` (three failed slices in a row; a single failure retries next tick). ENOSPC
   fails at once as `no_space`. A failed job's folder is removed.
9. **Expiry**: each tick first expires ≤ 20 ready jobs past `expires_at` (files deleted, the row kept as `expired` with
   its part list and bytes). Download links are minted fresh by `listExportJobs`, 24 h, never past `expires_at`.
10. **The export_ready mail** goes once (the `running → ready` compare-and-set, plus the mailer's dedupe key) to the
    member who asked, linking to `/app/<h>/settings/danger`. A platform request sends no mail from P8 (P1 notifies the
    store at request time).
11. **`ExportJobSummary` gained `parts[].n`, `parts[].href`, `progress`** and `parts[].name` is the download name
    (CCR r1-p8-21). The frozen function types are unchanged.
12. **Tenancy.** Two cross-store statements, both in `src/lib/jobs/exports.ts` and annotated: the queue's next job
    and the expired jobs (ids only). Pin 19 → 21 (CCR r1-p8-4, step 8 addendum). Every other statement is scoped.

### Step 10: the purge, the lifecycle cron edges, §H.11 retention (`src/lib/jobs/{purge,lifecycle,retention,housekeeping}.ts`, `purge/{plan,redact}.ts`)

1. **The purge's budget is 11 s a tick, not §F.9's "≤ 15 s per tick" (spec drift).** Slot 5 guarantees 11 s and is
   shared, in registry order, by `backup` (≤ 8 s while a backup runs), `exports` and `purge`. The purge declares 11 s and
   takes what the slot has left; on a quiet night that is the whole 11 s. 15 s would not fit the slot table (Σ 95 s).
2. **The plan is enumerated from schema.ts** (`purgePlan()` in `src/lib/jobs/purge/plan.ts`, pure). Every table with a
   `store_id` column that is not in `PURGE_KEEP` is deleted; a table §F.9 does not name joins group 3, after
   `ad_spend_daily` and before `pages`, and a new `ai_*` or `agent_*` table joins its family's group. 55 tenant tables
   at this tree: 47 deleted, 8 kept. `headline_shingles` goes by `owner_tag` (D35, `hmac(storeId, "shingle-owner")[:16]`)
   and `media_chunks` by the keys of the store's `media_files` rows, **just before** `media_files` (the brief lists
   "media_files, media_chunks": the rows hold the keys, so the chunks go first). The legacy `exports` table sits after
   `pages` as §F.9 orders it. The `exports/<id>/` folder goes right after `export_jobs` ("and their files"); the other
   per-store areas (media, imports, receipts, ai) after `asset_refs`, before the media rows.
3. **Status before every slice; a cancelled purge restarts from step 1.** A status other than a due `scheduled_deletion`
   (or `rejected` for 30 days) drops the store's `purge:<id>` cursor, so a later purge runs every step again (each one is
   idempotent). Area deletes wait (`purge_data_dir_refused`) while DATA_DIR or MEDIA_DIR fails its boot check: a refused
   directory may belong to another deployment of the same store ids.
4. **`signup_reviews.signals` is NOT NULL** in schema.ts while §F.9 says "nulled": the purge writes
   `{"v":1,"flags":[],"purged":true}` (no flags, no inputs) and nulls `business_context`.
5. **redactMetaForPurge**: the explicit SEC-20 keys at any depth and in any case, `*_norm` and the camelCase `…Norm`,
   plus `AUDIT_SECRET_KEY_RE` itself; a value under such a key becomes `"[purged]"` (null stays null). Only `meta` is
   rewritten; the row's other columns stay (§A.5.1).
6. **The purge's error-ring rows carry no store id**: a ring row with the store's id would be a new `error_events` row
   of the store being purged.
7. **Lifecycle (slot 7, 2 s)**: closed → scheduled_deletion ≤ 20 a tick through `transitionStore` (reason
   `reopen_window_ended`), expired view-as sessions ≤ 50 a tick through `endImpersonation(…, "expired")`. **Invites need
   no write**: `store_invites` / `staff_invites` have no expiry marker column; `inviteState` derives Expired from
   `expires_at` and accept refuses it. Their rows go 30 days after expiry in housekeeping.
8. **§H.11 core rows run at most once an hour** (`housekeeping.state.retentionAt`, stamped only when a pass ran every
   rule to its end): the cutoffs are days and several tables have no index on the compared column (notifications,
   error_events, store_usage), so a scan every minute buys nothing. A pass cut by the deadline carries on next tick.
   `outbox` `cancelled` rows go with `dead` (30 days after `COALESCE(done_at, created_at)`); `platform_requests` only
   once settled (executed, cancelled, expired); `impersonation_sessions` 400 days after `started_at`.
9. **Test orders**: housekeeping calls P4's `deleteTestOrders(systemScope, { olderThan: now − 30 d, limit: 2000 })` store
   by store (cursor `housekeeping.test_orders`); a stub answering `{ deleted: 0 }` until P4 fills it (CCR r1-p8-13). The
   leads sweep now gets half of what is left of the 4 s and the test orders the rest.
10. **Retention rows owned by other tracks' jobs** (not in housekeeping): `ai.retention` (P7: ai_runs output / rows,
    ai_cache, ai_batch_items, ai_feedback texts, ai_eval_runs.report, ai_jobs and `DATA_DIR/ai/<id>/` blobs),
    `design.retention` (P6: design_genomes per DES-§2.1), `ops.capi_ctx_purge` (P5: orders.capi_ctx 8-9 days),
    campaign share tokens (P3: revoked at campaign end + 90 days). Export parts (72 h) are the exports job's, backups
    (§H.6) the backup job's.
11. **For P1**: `markHealthDirty(storeId)` runs inside `transitionStore` after the tombstone. When P1 fills it, it must not
    insert a `store_health` row for a `purged` store (the purge deleted it last).
12. **Two step 9 fixes found by the full `test:storage` run**: the restore cut its INSERT batches at 4 MB of line text,
    above XAMPP's 1 MiB `max_allowed_packet`; it now cuts at 512 KB (`RESTORE_BATCH_BYTES`, a single larger row goes
    alone). The `backup` section starts from an empty `backup_runs` and `DATA_DIR/backups`, because the runner section's
    `runTick()` runs the registered daily backup whenever the suite runs after 03:30 (platform zone).
