# R1 P8 PLATFORM OPS report (draft)

Draft: P8 step 12 writes the full report (deliverables, tests, the security / tenancy / UX / spec-drift review, the
CCR list). Until then this file records the decisions the steps took, so none is lost.

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
