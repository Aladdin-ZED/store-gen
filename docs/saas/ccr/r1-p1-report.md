# r1-p1-report: P1 CONSOLE, R1 track report (step 14, speed mode)

Branch `r1/p1` (worktree `C:\Users\SICO\sg-wt\p1`), 13 build steps from `99f9bca` to this commit. Speed mode (owner,
2026-11-03): this step ran the full `npm test` once plus P1's suites, fixed what failed, and skipped the self-review, e2e,
perf, wow-demo and gate runs (they run at the merge in main). P2 is not merged in main yet (merge order P8 → P2 → P1), so
no sync was done and `src/components/console/_compat/*` stays until the P1 merge swaps it for P2's
`src/components/admin/common/*`.

## 1. Features delivered (PLA-§1 ids, FEATURE_PROOFS in `src/lib/platform/selftest.ts`)

| Id | What P1 built (main files) | Proofs run on this branch |
|---|---|---|
| PL-01 | Sign-up modes in Settings > Sign-up (segmented control, automatic default with its reason, typed `open`), invite codes, waitlist, Turnstile (`settings/signup/page.tsx`, `components/console/settings/signup-*.tsx`, `lib/platform/settings-admin.ts`) | test:platform ✓; platform-db #13 (console part) ✓ at step 7; e2e #1 at merge |
| PL-02 | Console side of the sandbox ceilings (D69 meters, pending caps in sign-up settings) | platform-db #13 console part ✓; tenancy #13/#14 and e2e at merge |
| PL-03 | Signup risk score, bands, reasons, counterfactual (`signup-risk.ts`, `signup-band.ts`, `reasons.ts`, `normalize.ts`) | test:platform ✓ (56 golden fixtures) |
| PL-04 | Approval queue: split view, keyboard triage J/K/A/I/R/S/X/E/V, fast lane, decisions with opId, bulk bar (`queue.ts`, `queue-*.ts`, `admin/(console)/queue`, `components/console/queue`) | test:platform ✓; platform-db #1 ✓ (step 4); wow-demo at merge |
| PL-05 | Overview: KPI tiles, Needs attention, Activity, Queue snapshot, System, each failing alone (`overview.ts`, `components/console/overview`) | platform-db #10 pending (perf fixture is manual) |
| PL-06 | Stores list: URL filters, saved chips, health ring, bulk Message and CSV, console store creation (`stores-list.ts`, `stores-filter.ts`, `store-create.ts`) | platform-db #10 pending |
| PL-07 | Store profile: header, six tabs, ten Overview strips, masked orders with 60 s reveal, notes, usage, export panel (`admin/(console)/stores/[id]`, `components/console/profile`) | tenancy #1 ✓ (last run step 12); e2e #6 at merge |
| PL-08 | Lifecycle sheet with preview, arm window, step-up, cooldown (`lifecycle-*.ts`, `components/console/lifecycle`) | test:platform ✓; platform-db #3, #11 ✓ |
| PL-09 | Export ZIP UI in the profile (engine is P8's) | tenancy #7 ✓; e2e #19 at merge |
| PL-10 | View-as start sheet and console impersonation (`impersonation.ts`, `components/console/impersonation`) | platform-db #9, #12 ✓; #14 waits for P4's masking |
| PL-11 | Plans list, plan editor, impact preview with 20 examples, entitlements job (`plans.ts`, `plan-rules.ts`) | test:platform ✓; platform-db #2, #4 ✓ |
| PL-12 | Kill-switch cards and sheet (banner ar/fr/en, affected stores, typed phrase), release / ops flags editor (`flags.ts`, `flag-*.ts`) | test:platform ✓ |
| PL-13 | Notifications API, platform kinds, staff notifications page (`notify.ts`, `notify-kinds.ts`, `lib/notify/kinds/platform.ts`) | test:platform ✓; platform-db #6 ✓ except the group case (CCR r1-p1-3) |
| PL-14 | Platform settings (general, sign-up, legal editor, brands, backups) (`admin/(console)/settings/*`) | test:platform ✓; platform-db #8 ✓ |
| PL-18 / SF-03 | Store Health engine, platform rules, snapshot API, `platform.health` and `platform.alarms` jobs, rings and strips (`lib/health/*` P1 parts, `health-snapshot.ts`, `alarms.ts`) | test:health ✓ (241); health-db ✓ (step 3) |
| PL-20 (R1 slice) | Public report page and insert-only `recordAbuseReport`, D76 brand guard (`brand-check.ts`, `brand-match.ts`, `platform:brand_term_live`) | platform-db #15 ✓; tenancy #17 needs CCR r1-p1-8 item 1 |
| UX-02 (console) | Console ⌘K: typed patterns, debounced search, actions by grant (`components/console/command`, `search.ts`) | tenancy #6 ✓ |
| UX-03 | Console identity: deep-ink sidebar, teal 205 accent, Platform badge, frosted topbar (`components/console/shell`) | P2's admin-tokens / motion / rtl run at merge |
| SE-01 | Staff roles, staff invites (public accept page), step-up sheet (`staff.ts`, `security/staff`, `(public)/invite/staff/[token]`) | platform-db #7, #20 ✓ |
| SE-04 | Audit log with URL filters, break-glass review (`audit-log.ts`, `security/audit`, `security/break-glass`) | platform-db #19 ✓ (console half) |
| OS-06 | Domains view and domain-move checklist V1-V13 (`domain-move*.ts`, `admin/(console)/domains`) | platform-db #19 ✓ |
| OS-09 | System health panels over `getHealth()` (P8's data; `health/panels.tsx`, 30 s refresh) | platform-db #19 ✓ against the stub |
| OS-10 | Backups list, retention, download after step-up (`backups.ts`, `settings/backups`) | platform-db #19 ✓ |
| D70, SEC-20 | People list and user profile with account actions (ban, unban, reset 2FA, reset link, sign out, delete), order lookup (`people.ts`, `order-lookup.ts`, `admin/(console)/users`, `orders`) | test:platform ✓; platform-db #16 staff half ✓ |

Every UI string is in `src/lib/i18n/admin/{ar,fr,en}/console.ts` and `notify.ts` (the console reads English in R1, PD9;
the public report and staff-invite pages are fully ar / fr / en). The `report.*` keys live in `console.ts`.

## 2. Checks run in this step (through the mutex)

| Check | Result | Time |
|---|---|---|
| `tsc --noEmit -p .` | ✓ (before and after the fix) | 17 s / 24 s |
| `npm test` suites one by one: theme:check, runtime (15,422), generator, render, money, conversions (108), offers (1,219), orders (138), settings (512), registries (17), tenancy-unit (583), prepublish (12), checklist (36), ownership | ✓ all | 3-46 s each |
| `test:tenancy-lint` | before: 99 violations (98 L8, 1 PIN); after the fix: **L1-L13 all 0**, PIN 1 (maintainer re-pin, §4) | 38 s |
| `test:platform` | ✓ 3,784 checks, 56 golden fixtures, 2 skipped (P2's shell keys) | 5 s |
| `test:health` | ✓ 241 checks | 2 s |
| `test:permissions` | ✓ 5,997 checks | 3 s |
| eslint over P1's files | ✓ | 29 s |

Not run in this step (speed mode; they run at the merge in main): `test:db` (platform-check cases, health-db,
`test:tenancy`, migrate, action-replay), `--perf`, `next build`, e2e, wow-demo, gate. Last `test:tenancy` run (step 12):
7,070 passed, 4 failed, all four covered by CCRs (§5).

**Fix in this step.** Tenancy lint L8 (ADM-37) flagged 97 `/admin…` literals and one hand-built `/${…}` URL in 29 files
of `src/components/console/**`. New `src/lib/platform/console-url.ts` exports `consoleUrl(path?)`, the client-safe
relative form of `consoleHref()` with typed literal results. Every console link and pathname test now goes through it.
`profileHref` builds both of its forms through it. Behaviour is unchanged, because the URLs are byte-identical.

## 3. Stubs

- **Replaced by P1 (frozen signatures kept):** `listNotifications` / `unreadCount` / `markRead` (refined), `getStoreHealth`,
  `markHealthDirty`, `requestHealthRecompute`, `snoozeHealthIssue`, `maskCustomerFields` / `maskIfImpersonation`,
  `checkBrandTerms`, `recordAbuseReport`, the P1 extension files (`health/rules/platform.ts`, `notify/kinds/platform.ts`,
  `flags/defs/platform.ts`, `jobs/tracks/platform.ts`, `nav/console.ts`, `tenancy-cases/platform.ts`). No
  `not implemented: P1` is left in `src/`.
- **Other tracks' stubs P1 calls (answer at the merge):** P4 `getOrderForConsole`, `recordPlatformReveal`, `orderKpis`;
  P5 `integrationHealth`; P8 `getHealth` (merged in main, live after the P1 merge); P2 shell keys and admin common
  primitives (via `_compat`); P6 design gates mount.

## 4. Tenancy annotations (for the maintainer's re-pin)

- `src/lib/platform/**`: **52** queries exempted by `tenancy: platform`. The allow file pins 5, so this is the one PIN
  violation. Annotation comments per file: audit-log 2, domain-move 2, flags 2, impersonation 1, legal 3, notes 4, notify 2,
  order-lookup 3, overview 10, people 10, plans 3, platform-requests 5, profile/risk 2, pulse 1, queue 2, search 1,
  security-facts 2, settings-view 2, signup-admin 1, stores-list 2, usage-markers 4.
- `src/lib/health/**`: 1/1 (`rows.ts`, the health queue). `src/lib/jobs/**`: 0 from P1 (the 4 in `jobs/scope.ts` are
  core). `platformScope` is used only under `src/app/admin/**` and `src/lib/platform/**`.

## 5. CCRs filed

`r1-p1-1.md` (scorer helpers in the sign-up path), `r1-p1-2.md` (masked phone format in the orders selftest),
`r1-p1-3.md` (report bucket counter, `member.joined` texts, `recordError`, the notification group filter),
`r1-p1-4.md` (health engine and alarms: P8, P2, P7, maintainer), `r1-p1-5.md` (queue and lifecycle sheet; the
platform pin), `r1-p1-6.md` (plans, flags, staff, legal, domain move; the pin count), `r1-p1-7.md` (read models; the pin
count), `r1-p1-8.md` (actions, routes, public forms; item 1 clears the two public-action attack cases),
`r1-p1-9.md` (shell and overview: maintainer, P2), `r1-p1-10.md` (queue and stores list from P2), `r1-p1-11.md` (store
profile from P4 and P2), `r1-p1-12.md` (the tenancy suite's `/admin/users` case), `r1-p1-13.md` (audit filters in SQL,
dead outbox items). No new CCR in this step. The final pin count for r1-p1-5/6/7 is the 52 above.

## 6. Decisions and spec drift

- Scripts: `test:platform` = `src/lib/platform/selftest.ts` (PLA-§O.1); `test:platform-db` =
  `scripts/qa/platform-check.ts`, the spec's "test:db case n". It joins `test:db` at the merge.
- `platformFlags(inputs, issues?, opts?)` in `src/lib/health/platform-flags.ts` (the third argument is additive).
- `recordPlatformReveal` (P4's file) returns `{ e164, name, address, city, note } | null` and is the single writer of the
  `platform.pii.revealed` audit row. P1's `revealOrderPiiAction` writes no audit row.
- opId de-duplication: `op-once.ts`, a bucket `p:op:<userId>.<opId>` for 10 minutes (one-segment key, §E.8), plus
  `op-dedupe.ts`, the `console-op` scopedCache.
- The console reads English in R1 (PD9), and ar / fr fall back to English. `consoleUrl()` is new (§2).

## 7. Known gaps and open items for the integration

- At the merge: swap `_compat` for P2's primitives. The `test:tenancy` reds clear with CCRs r1-p1-8 item 1 (public
  actions), r1-p1-3 (notification group) and r1-p1-12 (`/admin/users`). The maintainer raises the platform pin to 52.
- Waiting on other tracks: the §6.3.5 P5-issue score (P5 `integrationHealth`), the lifecycle `agentsWithLease` proof (P4),
  the reveal audit row (P4 `recordPlatformReveal`), the tenant canary cases (P2 / P4 routes) and the demo clock (wow-demo).
- Not run here: platform-check `--perf` (2,000-store fixture), the e2e steps of PLA-§O.4, and the screenshots of step 12
  re-shot after the `consoleUrl` swap (the URLs are unchanged, so no visual change is expected).
