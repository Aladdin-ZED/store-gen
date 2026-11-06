# r1-p2-report: P2 SHELL, R1 track report (step 14, speed mode)

Branch `r1/p2`, worktree `sg-wt/p2`, base `25293bb` (P0 + P0b). Steps 1-12 committed (`da7a1a1` … `72fec4e`), this report
is step 14. Speed mode (owner, 2026-11-03): the self-review, e2e, budget, build and gate runs of the brief were skipped;
they run at the merge in main. No rebase on main in the worktree (the maintainer merges).

## Checks run at step 14 (through the mutex, one run, about 4 min)

| Check | Result |
|---|---|
| `npm run typecheck` (tsc --noEmit) | green |
| `npm test` (theme, runtime 208 + parity 15422, generator, render, money, conversions 108, offers 1219, orders 138, settings 512, registries, tenancy-unit 583, prepublish 12, checklist 36, ownership, tenancy-lint) | green; ownership: every new file has one owner; tenancy-lint 0 violations, no new allow-list entry |
| `test:pulse` | 107 passed, 0 failed |
| `test:shell` | 567 passed, 0 failed |
| `test:admin-tokens` | 0 violations, 13 pending (7 entries) |
| `test:admin-motion` | 0 violations, 34 pending (14 entries) |
| `test:admin-rtl` | 0 violations, 34 pending (6 entries) |
| `test:i18n-coverage` | 48 catalogs, 1636 keys in ar/fr/en, 0 findings, 1 pending |

Not run in the worktree (speed mode, or main-only): `npm run lint` over the tree (eslint ran per step on touched files),
`test:budget`, `test:slow`, `test:db` (`test:tenancy` had 5 known failures at step 10, all maintainer harness lines in
CCRs r1-p2-3 §1/§1b, r1-p2-4 §3, r1-p2-6 §5, r1-p2-7 §6), `build`, `test:e2e`, `qa:secrets`, `gate`.

## Features delivered

| Feature | What shipped | Main files | Proven by | Status |
|---|---|---|---|---|
| UX-01 onboarding wow flow (D59) | `/app/<h>/welcome`: photos (in-browser palette, P6 alpha estimate, quota limit sheet), details (category tap, typed price, price before only when higher), reveal mounting P6's `RevealFolds` through one adapter, contact (masked phone, E.164 WhatsApp), done step with review card, Health ring and address card; dashboard redirects new owners until done or skipped; never publishes | `src/app/app/[store]/welcome/**` | test:shell (step machine, price rules, import graph) | green now; real reveal at P6's merge |
| UX-02 tenant ⌘K | store-scoped palette, search route, chords and shortcut sheet, shell commands, registry-driven nav | `src/components/admin/shell/command-palette*.tsx`, `chords.ts`, `src/app/api/app/[store]/search/**`, `src/lib/admin-data/search.ts` | test:shell, tenancy-cases/shell.ts | green now; P3/P4/P5/P7 items plug in at their merges (r1-p2-5) |
| UX-05 live address card | copy, QR, WhatsApp share, test-order link, dismissible on the dashboard, also in settings/address and the welcome done step | `src/components/admin/common/address-card.tsx` | test:shell | green now |
| UX-07 manifest | `/app/manifest.webmanifest` route (public, no cookie), generated app icons, theme_color per DES-§16.14 | `src/app/app/manifest.webmanifest/route.ts`, `src/lib/admin-theme/app-icon.ts`, `scripts/build-app-icons.mjs` | test:shell | green now |
| SF-06 pulse | GET route with ETag/304 (the ETag excludes `at`), `private, no-store`, BroadcastChannel poller election, `usePulse()`, shell contributor | `src/app/api/app/[store]/pulse/**`, `src/lib/pulse/**` | test:pulse | green now |
| SF-03 tenant Store Health | ring, groups, five issues, snooze / unsnooze, recompute | `src/components/admin/common/health-ring.tsx`, `health-groups.tsx`, `src/components/admin/dashboard/health-panel.tsx`, `src/app/app/[store]/health-actions.ts` | test:shell | UI green now; real snapshots at P1's merge |
| SF-11 Today brief line | template sentence from pulse + health, zero-data fallback, never invented numbers | `src/components/admin/dashboard/**` | test:shell | green now |
| PL-13 notification centre UI | page with group filters, keyset paging, strict PLA-§18.1 link rule, bell in the topbar | `src/app/app/[store]/notifications/**` | test:shell, i18n-coverage | green now; `health.issue_new` kind texts at P1's merge |
| PL-09 owner side | Danger zone export request (step-up), close, reopen, leave | `src/app/app/[store]/settings/danger/**` | test:shell | request green now; download route waits on r1-p2-7 §1 (R1 integration) |
| TN-02 premium error states | seam error codes routed to states and sheets (limit, read-only, impersonation) | `src/components/admin/common/**`, `src/components/admin/shell/**` | test:shell | green now |
| TN-05 public auth polish | `/login` (forgot sheet, challenge note), `/login/verify`, two-step `/signup`, `/reset` | `src/app/(public)/**` | test:shell | green now; `qa:r1-exit` step d needs r1-p2-8 §4 |
| TN-06 invites | creation, share (copy, WhatsApp, QR), acceptance with the shown-once joined state and no-seat state | `src/app/app/[store]/team/**`, `src/app/(public)/invite/**` | test:shell, tenancy-cases | green now; inviter name at r1-p2-8 §1 |
| TN-07 picker and switcher | `/app` picker, sidebar switcher (monogram, mode badge, status, role, keyboard) | `src/app/app/page.tsx`, `src/components/admin/shell/**` | test:shell | green now; second sort key r1-p2-7 §2 |
| TN-08 / TN-12 roles | role picker from `invitableRoles()` with the plain-language explainer, viewer role | `src/app/app/[store]/team/page.tsx`, `src/components/admin/settings/team-panel.tsx` | test:shell | green now (accountant R2) |
| TN-09 mode cards | `ModeCards` in /app/new, signup and settings/general with the switch sheet (hide, never delete) | `src/app/app/[store]/settings/general/**`, `src/app/app/new/**` | test:shell | green now (store/both "Coming later" until R2) |
| TN-13 require 2FA | settings/security toggle, owner with TOTP only | `src/app/app/[store]/settings/security/**` | test:shell | green now |
| PD70 brand refusal | refusal sheet on the store name write | `settings/general/**` | test:shell | green now |
| PD72 mode summary | `modeSummary` lines in the mode cards | `ModeCards` | test:shell | green now |
| PD75 audit page | `settings/audit` with actor/area/date filters, `KeysetPager`, `#imp-` anchors | `src/components/admin/settings/audit-view.tsx` | test:shell | green now |
| PD80 step-up | `StepUpSheet` with `method: totp \| password`, re-run with the same `opId` | `src/components/admin/common/step-up-sheet.tsx` | test:shell | green now |
| PD81 account deletion (tenant door) | account danger page linking each store's Danger zone | `src/app/app/account/**` | test:shell | green now |
| Handle rename | settings/address rename with live availability, 12-month warning, 30-day rule, re-render count | `src/lib/tenancy/handles.ts`, `settings/address/**` | test:shell, tenancy-cases | green now; `/api/auth/handle` owner r1-p2-7 §3 |
| Onboarding key | welcome step/draft saved per store, skip and done keys read by the dashboard redirect | `src/app/app/[store]/welcome/actions.ts` | test:shell | green now |
| Design-system foundation | OKLCH token generator, admin CSS, the three admin lints, ar/fr/en admin catalogs, viewer-locale rendering | `src/lib/admin-theme/**`, `src/lib/i18n/admin/**`, `scripts/qa/admin-*.ts`, `scripts/qa/i18n-coverage.ts` | test:admin-tokens/-motion/-rtl, test:i18n-coverage | green now |

## What other tracks import from P2

The 21 frozen primitives of PLA-§22.12 in `src/components/admin/common/**`, `AddressCard`, `ReviewCard` (compact),
`HealthRing`, `ScreenLocale` (opt a screen into the viewer's language, r1-p2-2 §2), `StepUpSheet`, the chords guards
(`src/components/admin/shell/chords.ts`) and the seam error routing. P0 stubs consumed: P1 (health snapshot, notify,
audit), P6 (`RevealFolds`, `buildRevealDirections`, `estimateAlpha`, `preparePhoto`), P7 (analyze suggestions), P8 (export
engine).

## CCRs filed

`docs/saas/ccr/r1-p2-1.md` (motion, aurora and physical sides in other tracks' files), `r1-p2-2.md` (RTL in `ui/**`,
ScreenLocale note), `r1-p2-3.md` (tenancy harness on the new reads), `r1-p2-4.md` (core store profile fields, mode
writer, harness), `r1-p2-5.md` (⌘K leftovers, Create menu, nav items), `r1-p2-6.md` (dashboard sources, Orders CSV check),
`r1-p2-7.md` (export download route, picker sort, handle API, audit permission), `r1-p2-8.md` (inviter name, invite legal
acceptance, locale cookie HttpOnly, `qa:r1-exit` sign-up), `r1-p2-9.md` (media 413 numbers, `ui/switch` RTL).

PENDING lint entries (all owned elsewhere, listed by the lints): admin-motion 14 entries (P6 generator/builder, maintainer),
admin-rtl 6 entries (P6 builder and generator, maintainer for unowned admin files), admin-tokens 7 entries, i18n 1 (P1's
`health.issue_new` texts).

## Decisions recorded

- The pulse ETag excludes `at`, so an unchanged pulse answers 304.
- The manifest's theme_color follows DES-§16.14.
- `audit.read` guards the audit page, not `settings.read` (r1-p2-7 §4).
- T2's locale cookie should be HttpOnly (r1-p2-8 §3).
- Unsnooze: P0b added P1's `unsnoozeHealthIssue` stub, wired through `unsnoozeHealthIssueAction`.
- Work lists on the dashboard are counts until P3 and P4 ship their components (r1-p2-6 §1-§2).
- Other tracks' screens are wrapped in `ScreenLocale` only by their owners (r1-p2-2 §2).

## Known gaps and risks

- `test:tenancy` (DB) carries the 5 maintainer harness failures above until the CCR lines are applied at the merge.
- Not verified here: full-tree eslint, `test:budget`, `test:slow`, `build`, e2e (`qa:pulse-e2e`, `qa:shell-e2e`,
  `qa:admin-perf`, `qa:r1-exit`), `qa:secrets`, gate. They run at the merge in main.
- No dark-mode or 1280 px screenshot sweep (speed mode); each screen was shot once, en and ar, at its step.
- Real data behind Health, the reveal and the export download arrives with P1, P6 and P8's merges.

## Estimate

P2 SHELL: about 95% of its R1 scope built and green in the worktree; the remainder is the merge (harness CCR lines,
the cross-track stubs going real) and the main-only checks. Toward R1 live: P2 is ready to merge.
