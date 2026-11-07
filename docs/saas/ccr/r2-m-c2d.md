# r2-m-c2d: R2 contract step C2-D (scripts, budgets, ownership, extension files, packages)

Maintainer note, 2026-11-07. Sources: core §K.4 (contract paragraph), §J.1, §J.6, §H.13, §K.3; STO-§27.1/27.2,
DES-§26, OPE-§P, AI-§R.2; the shared needs of `qa/lead/r2-plans.json`.

## Applied

- **Packages (DES-R6/R7, S2 #17):** `harfbuzzjs` 1.6.4 (the latest published version on 2026-11-07) and `clipper-lib`
  6.4.2, exact pins in `dependencies`. Method P6-10: `npm install --save-exact --package-lock-only` through the heavy
  mutex, then the two folders copied from a scratch install into `node_modules` (neither has dependencies). Nothing
  imports them yet; S2's spike CCR `r2-s2-1` confirms the pins or asks for another version.
- **Scripts (§J.6):** see the §J.6 "Joined at the R2 contract step" paragraph. Each new file is a stub in the owner's
  path that passes and prints "not built yet": `src/lib/catalog/selftest.ts`, `src/storefront/runtime/selftest.ts`,
  `scripts/qa/storefront-{render-check,db-check,e2e,perf,a11y,demo}.ts`, `scripts/qa/copy-check.ts` (S1);
  `src/lib/logo/selftest.ts`, `scripts/qa/brand-db-check.ts`, `scripts/qa/design-visual.mjs` (S2);
  `src/lib/imports/selftest.ts`, `scripts/qa/ledger-check.ts` (S3); `scripts/qa/carrier-check.ts` (S4);
  `src/lib/webhooks/selftest.ts`, `scripts/qa/webhooks-db-check.ts` (S5). `scripts/build-store-assets.mjs` checks the
  derived `store-page` cap (ENGP-31) on every run; `scripts/build-logo-fonts.mjs` writes nothing yet.
- **Budgets (§H.13, R-D43, STO-R13):** `budgets.json` gains `pdp` 23,500, `store` 2,500, `cart` 6,000, `checkout` 8,000,
  `store-pixels` 4,200, `store-thanks` 3,000, `search` 5,000, `store-page` 41,000 and `compositions["store-page"]`
  (pdp, checkout, store-pixels, units-matrix, units-fields, fill-steps-box: ceil500(40,650) = 41,000). `landing-v3` /
  `page-v3` were set at C2-B2. `test-budget.json`: `current` = R2 (ceiling 300 s, total 290 s).
- **Extension files (§K.3), typed empty, registered:** S1 storefront (order hooks, jobs, nav, commands, search, i18n,
  health rules + fixtures, pulse, notify, flags, tenancy cases, render cases, `prepublish/storefront.fixtures.ts`, run
  by `test:prepublish`); S2 (jobs `brand`, tenancy `brand`, prepublish `brand`, i18n `logo` with `logo.trademark`,
  `logo.moreLikeThis`, `logo.use` moved from `design.ts`, commands `brand`, `src/lib/design/selftest-store-theme.ts`
  imported by `design-check.ts`); S3 (hooks, jobs, notify, health, commands, tenancy `money`); S4 (hooks, jobs, notify,
  health, nav, commands, i18n, tenancy `logistics`); S5 (hooks `webhooks`, outbox handlers `webhook` and `mail` as paused
  stubs with the plan's throughput numbers, i18n, tenancy `webhooks`); S6 (outbox handler `edge-purge`, paused stub,
  i18n `ux`); S7 (hooks, commands, prepublish `ai`). `HealthRuleFile` gains `storefront` / `money` / `logistics` with
  their prefixes. Order hooks run ops, logistics, storefront, money, landing, integrations, ai, webhooks.
- **Ownership:** the "R2 ownership additions" table under §K.4 (read by `test:ownership`).
- **R1 leftover fixed (gate):** `test:budget-static` reported `test:test-orders`, `test:kit` and `test:links` (DB-backed,
  chained by `test:db`) in the landing group. They left the group; `npm test` runs the kit's offline half as the new
  `test:kit-offline` (`tsx scripts/qa/kit-check.ts --offline`, the command `test:kit -- --offline` ran).

## Decided otherwise or deferred

- S2 asked 30 s for `test:logo` and S6 asked the platform group 15 -> 20 s: the §J.1 shares stay (logo 8 s, platform
  15 s, R2 total 290 s of 300 s); a CCR with a timed `npm run test:budget` re-cuts them when the suites exist.
- S4's "test:carriers budget <= 90 s": `test:db` has no budget table; noted for the S4 merge.
- S3 #38 (move `ops:cash_held` from P4's `rules/ops.ts` to `rules/money.ts`): the rule is not written in R1, so there
  is nothing to move; S3 writes it in `rules/money.ts` (prefix `ops` allowed there).
- S2 #23 brand.assets job slot, S5 #88 console Mail nav item, S6 #106 areas/proxy, S1/S7 builder and wizard mounts:
  C2-E or CCRs (the files stay read-only for the R2 tracks, see the §K.4 paragraph).
- `qa:storefront-e2e`, `-perf`, `-a11y` join `test:e2e` per §J.6 (S1 asked to keep them out until the R2 exit; as stubs
  they cost nothing, and S1 may move them through a CCR).
