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
