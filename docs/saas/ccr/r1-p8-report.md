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
